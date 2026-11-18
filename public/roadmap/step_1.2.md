# Step 1.2 — Gobernanza DCL/RLS (Aislamiento Nivel 2), `archive_record`, RPCs y Semillero Multi-Nivel/Multi-Fecha

## Objetivo
Actualizar la seguridad RLS/DCL (`04_rls.sql`), la limpieza (`00_delete_tables.sql`), la evaluación normativa (`02_cobertura_normativa.sql`) y el semillero determinista (`06_datos_prueba.sql`) para proteger las nuevas tablas (`programa_auditoria`, `auditoria_fecha`, `configuracion_alerta_auditoria`, `procesos_por_sitio`, `turnos_proceso_sitio_auditoria`, `equipo_auditor_sitio`, `equipo_auditor_proceso_sitio`), garantizar aislamiento inter-organizacional estricto en programas **Nivel 2** para el rol `CLIENT`, y proveer datos realistas desde el reset de BD.

---

## Archivos a Modificar
- `public/supabase/queries/00_delete_tables.sql`
- `public/supabase/queries/04_rls.sql`
- `public/supabase/queries/02_cobertura_normativa.sql`
- `public/supabase/queries/06_datos_prueba.sql`

---

## Especificación Técnica Detallada

### 1. Limpieza Idempotente (`00_delete_tables.sql`)
- `00_delete_tables.sql` ejecuta `DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;`. Verificar que se preserva intacta la recreación de extensiones (`uuid-ossp`, `ltree`, etc.) y agregar comentario documental del nuevo árbol `programa_auditoria → auditoria → auditoria_fecha` si aplica.

### 2. DCL y `archive_record` (`04_rls.sql`)
1. **Bloque `REVOKE DELETE` (`v_non_deletable_tables`):**
   - Añadir `'programa_auditoria'`, `'auditoria_fecha'`, `'configuracion_alerta_auditoria'`, `'procesos_por_sitio'`, `'turnos_proceso_sitio_auditoria'`, `'equipo_auditor_sitio'` y `'equipo_auditor_proceso_sitio'`.
   - Mantener `equipo_auditor` en `v_pure_junction_tables` (únicamente para desasignación controlada de auditor completo por staff).
2. **`public.archive_record(p_table TEXT, p_record_id UUID, p_reason TEXT DEFAULT NULL)`:**
   - Añadir `'programa_auditoria'` al array `v_core_tables` (soporta `delete_reason`).
   - Añadir al array `v_child_tables`:
     - `'auditoria_fecha'`
     - `'procesos_por_sitio'`
     - `'turnos_proceso_sitio_auditoria'`
     - `'equipo_auditor_sitio'`
     - `'equipo_auditor_proceso_sitio'`

### 3. Políticas RLS Granulares por Rol + Aislamiento Inter-Org Nivel 2 (`04_rls.sql`)
Habilitar `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;` y definir políticas estrictas (`SELECT`, `INSERT`, `UPDATE`) verificando `status = 'APPROVED'`:

1. **`public.programa_auditoria`:**
   - **`SELECT`:**
     - `ADMIN` aprobado (`is_approved_admin()`): lectura total incluyendo archivados.
     - `WORKER` aprobado (`is_approved_worker()`): activos (`deleted_at IS NULL`).
     - `AUDITOR` aprobado: programas activos donde existe al menos una `auditoria` activa vinculada en la que el usuario es auditor asignado (`is_assigned_auditor(a.id)`).
     - `CLIENT` aprobado: programas activos donde existe al menos una `auditoria` activa cuyo `certificado.id_organizacion` está aprobado para ese usuario (`has_client_org_access(c.id_organizacion)`).
     - *Nota de Privacidad Nivel 2:* Aunque un `CLIENT` de Org A vea la cabecera del `programa_auditoria` Nivel 2 donde participa su certificado, **las políticas RLS de `auditoria`, `certificado`, `organizacion`, `auditoria_fecha` y `sitios_por_auditoria` bloquean absolutamente cualquier fila perteneciente a Org B**. De igual forma, el frontend nunca expone etiquetas ni conteos de terceros no autorizados.
   - **`INSERT` / `UPDATE`:** exclusivamente `public.is_approved_worker()`.

2. **`public.auditoria_fecha`:**
   - **`SELECT`:**
     - `ADMIN` / `WORKER` aprobados (`is_approved_admin()` o `deleted_at IS NULL AND is_approved_worker()`).
     - `AUDITOR` aprobado (`deleted_at IS NULL` AND `is_assigned_auditor(id_auditoria)`).
     - `CLIENT` aprobado (`deleted_at IS NULL` AND `EXISTS` auditoría activa + certificado activo + `has_client_org_access(c.id_organizacion)`).
   - **`INSERT` / `UPDATE`:** exclusivamente `public.is_approved_worker()`.

3. **`public.configuracion_alerta_auditoria`:**
   - **`SELECT`:** cualquier usuario autenticado y aprobado (`deleted_at IS NULL` AND `EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.status = 'APPROVED')`).
   - **`INSERT` / `UPDATE`:** exclusivamente `public.is_approved_worker()`.

4. **`public.procesos_por_sitio`, `public.turnos_proceso_sitio_auditoria`, `public.equipo_auditor_sitio`, `public.equipo_auditor_proceso_sitio`:**
   - **`SELECT`:** `ADMIN` (incl. archivados), `WORKER` (activos), `AUDITOR` (activos de auditorías/certificados asignados vía `equipo_auditor`), `CLIENT` (activos de sus organizaciones aprobadas vía `has_client_org_access`).
   - **`INSERT` / `UPDATE`:** exclusivamente `public.is_approved_worker()`.

5. **`public.auditoria` y `public.sitios_por_auditoria`:**
   - Confirmar que las políticas `SELECT`/`INSERT`/`UPDATE` admiten `id_programa_auditoria`, `estado_ciclo`, `tiempo_auditoria` y `codigo_auditoria` sin bloquear borradores con FKs opcionales `NULL`.

### 4. Verificación de `02_cobertura_normativa.sql`
- Verificar que `evaluar_cobertura_certificado`, `cobertura_normativa_certificado`, `resumen_cobertura_certificado`, `auditor_esta_calificado` y `auditores_calificados_para_certificado` siguen operando limpiamente y excluyen archivados (`deleted_at IS NULL`), confirmando que no referencian `fecha_programacion`, `fecha_reprogramacion` ni `id_turnos_sitio_auditoria`.

### 5. Semillero Determinista Multi-Nivel y Multi-Fecha (`06_datos_prueba.sql`)
Enriquecer `06_datos_prueba.sql` (con UUIDs deterministas, `ON CONFLICT ... WHERE deleted_at IS NULL` idempotente y manteniendo compatibles todos los códigos/UUIDs previos de organizaciones y certificados) para cubrir desde el reset de BD todos los escenarios de negocio:

1. **Configuración Inicial de Alertas (`configuracion_alerta_auditoria`):**
   - Fila `DEFAULT`: `dias_aviso_proxima = 15`, `dias_aviso_preprogramada_sin_confirmar = 30`, `alertas_activas = TRUE`.
2. **Procesos por Sitio (`procesos_por_sitio`) en Certificados Existentes:**
   - Para `FN-QMS-2024-001` (`40000000-0000-0000-0000-000000000001`): vincular procesos a Sitio 0 (`Sede Principal HQ`) y Sitio 1 (`Planta Valencia`), asegurando turnos activos en ambas sedes.
   - Vincular también `procesos_por_sitio` en un segundo certificado de la misma organización (ej. ISO 14001 o segundo alcance) y en un certificado de una segunda organización semilla para habilitar pruebas Nivel 1 y Nivel 2, además de conservar **al menos 2 certificados con distintos `estatus` (`Activo`, `Estudio`) sin auditoría programada** para probar el filtro de certificados pendientes.
3. **Programas de Auditoría Semilla (Cubriendo Individual, Nivel 1, Nivel 2 y Ciclo Evolucionado):**
   - **Programa 1 (`INDIVIDUAL`, histórico `Auditada`):** `PROG-2024-001` (`Individual`) → `AUD-2024-001` (*Etapa 2*, `Presencial`, `4.00d` en Sitio 0 `1.50d` + Sitio 1 `2.50d`), con `auditoria_fecha` `seq=1` (`REAL`, `tag='Programación'`, año anterior).
   - **Programa 2 (`NIVEL_1_INTRA_ORG`, Ciclo 1 `Combinada` vs Ciclo 2 `Integrada`):**
     - Campaña histórica `Combinada` (Año 1) en *Example, C.A.* agrupando 2 certificados de la misma organización (`id_ciclo_origen = NULL`).
     - Campaña activa **`PROG-2026-001`** (`NIVEL_1_INTRA_ORG`, `tipo_vinculacion = 'Integrada'`, `etiqueta = 'Planta Santa Cruz'`, `id_ciclo_origen` apuntando al ciclo `Combinada` previo): incluye 2 auditorías de la misma organización (`AUD-2026-001` y `AUD-2026-002`) demostrando:
       - **Multi-Fecha 1:N:** `seq=1` (`Programación`, `PREPROGRAMADA_MES` o `REAL` inicial) + `seq=2` (`Reprogramación`, `REAL`, span de **3 días calendario** con `observacion = 'Ajuste solicitado por parada de planta'`) → demostrando **`6.00 días-auditor` ejecutados por `2 auditores` (`3.00d` c/u) en `3 días calendario`**, con cuadre Cubo 1 = Cubo 2 = `6.00d` y múltiples turnos/procesos.
   - **Programa 3 (`NIVEL_2_INTER_ORG`, `Multientidad` / `Conjunta`):**
     - `PROG-2026-002` vinculando 2 organizaciones distintas (`Org A` y `Org B`), con una fecha `PREPROGRAMADA_MES` próxima (ej. dentro de los próximos 25 días para disparar la alerta *"Pre-programada por mes sin confirmar fecha real"*).
   - **Programa 4 (`INDIVIDUAL`, `En Programación` / Borrador Parcial):**
     - `PROG-2026-003` → `AUD-2026-005` (`tiempo_auditoria = 2.50d`, Cubo 2 asignado `1.50d`, desfase `-1.00d`, 1 proceso sin auditor y fecha real vencida o próxima) para evidenciar etiquetas dinámicas `Parcialmente Asignada` / `Atrasada / Vencida`.

---

## Criterios de Verificación de Step 1.2
1. Reset secuencial de `00_delete_tables.sql` hasta `07_normas_requisitos_csv.sql` ejecuta sin errores de sintaxis, FK ni conflictos parciales.
2. `SELECT public.archive_record('programa_auditoria', ...)` y `archive_record('auditoria_fecha', ...)` funcionan para `ADMIN`/`WORKER` y fallan para `AUDITOR`/`CLIENT`.
3. Un usuario `CLIENT` con acceso únicamente a `Org A` consulta un `programa_auditoria` `NIVEL_2_INTER_ORG` (`Org A + Org B`) y recibe `0` filas de `Org B` en `auditoria`, `auditoria_fecha`, `certificado` y `sitios_por_auditoria`.
4. Todas las tablas nuevas tienen `rowsecurity = true` y `DELETE` revocado para `anon` y `authenticated`.
