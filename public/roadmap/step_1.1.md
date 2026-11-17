# Step 1.1 — Evolución del Esquema SQL, Triggers de Integridad Subconjunto, Soft-Delete e Índices

## Objetivo
Evolucionar la base de datos PostgreSQL (`public/supabase/queries/01_creacion.sql` y `public/supabase/queries/03_indices_optimizacion.sql`) para soportar:
1. Procesos vinculados físicamente a cada sede (`procesos_por_sitio`).
2. Muestreo desacoplado de auditoría (`procesos_sitio_auditoria` → `1..N` turnos vía `turnos_proceso_sitio_auditoria`).
3. Asignación flexible de auditores y tiempos en días decimales (`equipo_auditor_sitio` + `equipo_auditor_proceso_sitio` + `tiempo_auditoria`).
4. Borradores progresivos en `auditoria` (`NULLABLE` + `estado_ciclo` + `codigo_auditoria` + `fecha_fin`).
5. Gobernanza integral de borrado lógico (`fn_prevent_hard_delete`, `fn_sync_soft_delete_metadata`, `fn_guard_parent_archival`, `get_archive_dependency_summary`, `audit_log`) e índices únicos parciales.

---

## Archivos a Modificar
- `public/supabase/queries/01_creacion.sql`
- `public/supabase/queries/03_indices_optimizacion.sql`
- Pruebas SQL/migración existentes si validan listas de tablas: revisar en `Step 1.2` / `Step 2.2` (`phase11SqlMigration.test.ts`, etc.), sin editar `src/` en este paso.

---

## Especificación Técnica Detallada

### 1. Nueva Tabla: `public.procesos_por_sitio` (Dominio Certificación / Sitios)
Ubicar inmediatamente después de `public.turnos_por_sitio` en `01_creacion.sql`:

```sql
CREATE TABLE IF NOT EXISTS public.procesos_por_sitio (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    id_sitio UUID NOT NULL REFERENCES public.sitio(id) ON DELETE RESTRICT,
    id_proceso UUID NOT NULL REFERENCES public.proceso(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);
```

- **Trigger de Integridad Subconjunto (`trg_validar_proceso_por_sitio_certificado`):**
  - Verifica que `sitio.id_certificado` (donde `sitio.deleted_at IS NULL`) coincida exactamente con `proceso.id_certificado` (donde `proceso.deleted_at IS NULL`).
  - Si difieren o alguno no existe/está archivado, lanza `RAISE EXCEPTION 'Violación de Integridad ISO/IEC 17021-1: El proceso no pertenece al certificado del sitio.'`.

### 2. Evolución de `public.auditoria` (Borradores Progresivos, Días y Estado de Ciclo)
Actualizar la definición de `public.auditoria` (con `ALTER TABLE ...` idempotente o definición actualizada en `CREATE TABLE` ya que `00_delete_tables.sql` + `01_creacion.sql` debe ser 100% re-ejecutable desde cero y en migración):
- `codigo_auditoria VARCHAR(40)` (ej. `AUD-2025-001`, opcional en borrador o único activo cuando `NOT NULL`).
- `id_certificado UUID NOT NULL REFERENCES public.certificado(id) ON DELETE RESTRICT` (raíz mínima obligatoria de contexto).
- `id_tipo_auditoria UUID NULL REFERENCES public.tipo_auditoria(id) ON DELETE RESTRICT` (cambia de `NOT NULL` a `NULL` para borradores).
- `id_metodologia UUID NULL REFERENCES public.metodologia_auditoria(id) ON DELETE RESTRICT` (cambia de `NOT NULL` a `NULL` para borradores).
- `fecha_programacion DATE NULL` (cambia de `NOT NULL` a `NULL` para borradores).
- `fecha_fin DATE NULL` (con `CHECK (fecha_fin IS NULL OR fecha_programacion IS NULL OR fecha_fin >= fecha_programacion)`).
- `fecha_reprogramacion DATE NULL`.
- `tiempo_auditoria NUMERIC(6,2) NOT NULL DEFAULT 0` con `CHECK (tiempo_auditoria >= 0 AND MOD((tiempo_auditoria * 4)::NUMERIC, 1) = 0)`.
- `estado_ciclo VARCHAR(30) NOT NULL DEFAULT 'Borrador'` con `CHECK (estado_ciclo IN ('Borrador', 'En Programación', 'Programada', 'En Ejecución', 'Auditada', 'Reprogramada', 'Cancelada'))`.
- `objetivo TEXT NULL`.

### 3. Evolución de `public.sitios_por_auditoria` (Cubo 1 de Días + Modalidad por Sede)
Agregar columnas a `public.sitios_por_auditoria`:
- `tiempo_auditoria NUMERIC(6,2) NOT NULL DEFAULT 0 CHECK (tiempo_auditoria >= 0 AND MOD((tiempo_auditoria * 4)::NUMERIC, 1) = 0)`.
- `modalidad_evaluacion VARCHAR(20) NULL CHECK (modalidad_evaluacion IS NULL OR modalidad_evaluacion IN ('Presencial', 'Remota', 'Mixta'))`.
- `fecha_inicio DATE NULL`, `fecha_fin DATE NULL CHECK (fecha_fin IS NULL OR fecha_inicio IS NULL OR fecha_fin >= fecha_inicio)`.
- `notas_sitio TEXT NULL`.

### 4. Rediseño de `public.procesos_sitio_auditoria` y Nueva Puente `public.turnos_proceso_sitio_auditoria`
1. **`public.procesos_sitio_auditoria`:**
   - Eliminar la columna obligatoria `id_turnos_sitio_auditoria` (rompe la restricción 1:1 que impedía múltiples turnos o borradores sin turno).
   - Estructura objetivo:
     ```sql
     CREATE TABLE IF NOT EXISTS public.procesos_sitio_auditoria (
         id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
         id_sitios_por_auditoria UUID NOT NULL REFERENCES public.sitios_por_auditoria(id) ON DELETE CASCADE,
         id_procesos_por_sitio UUID NOT NULL REFERENCES public.procesos_por_sitio(id) ON DELETE RESTRICT,
         id_proceso UUID NOT NULL REFERENCES public.proceso(id) ON DELETE RESTRICT,
         notas TEXT,
         created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
         updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
         deleted_at TIMESTAMPTZ DEFAULT NULL,
         deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
     );
     ```
   - **Trigger `fn_validar_proceso_sitio_auditoria_certificado` actualizado:**
     - Comprueba que `procesos_por_sitio.id_sitio = sitios_por_auditoria.id_sitio` (ambos activos).
     - Sincroniza `NEW.id_proceso := v_proceso_del_sitio` (de `procesos_por_sitio.id_proceso`) y valida coherencia con `auditoria.id_certificado`.
2. **Nueva Tabla `public.turnos_proceso_sitio_auditoria`:**
   ```sql
   CREATE TABLE IF NOT EXISTS public.turnos_proceso_sitio_auditoria (
       id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
       id_procesos_sitio_auditoria UUID NOT NULL REFERENCES public.procesos_sitio_auditoria(id) ON DELETE CASCADE,
       id_turnos_sitio_auditoria UUID NOT NULL REFERENCES public.turnos_sitio_auditoria(id) ON DELETE RESTRICT,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       deleted_at TIMESTAMPTZ DEFAULT NULL,
       deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
   );
   ```
   - **Trigger `fn_validar_turno_proceso_sitio_auditoria`:**
     - Exige `procesos_sitio_auditoria.id_sitios_por_auditoria = turnos_sitio_auditoria.id_sitios_por_auditoria` (mismo sitio de la misma auditoría) y ambos activos.

### 5. Nuevas Tablas de Equipo y Tiempo Auditor (`equipo_auditor_sitio` y `equipo_auditor_proceso_sitio`)
1. **`public.equipo_auditor_sitio` (Cubo 2 por Auditor × Sitio):**
   ```sql
   CREATE TABLE IF NOT EXISTS public.equipo_auditor_sitio (
       id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
       id_sitios_por_auditoria UUID NOT NULL REFERENCES public.sitios_por_auditoria(id) ON DELETE CASCADE,
       id_auditor UUID NOT NULL REFERENCES public.auditor(id) ON DELETE RESTRICT,
       rol_auditor VARCHAR(50) NOT NULL DEFAULT 'AUDITOR' CHECK (rol_auditor IN ('AUDITOR_LIDER', 'AUDITOR', 'AUDITOR_EN_ENTRENAMIENTO', 'EXPERTO_TECNICO')),
       tiempo_auditoria NUMERIC(6,2) NOT NULL DEFAULT 0 CHECK (tiempo_auditoria >= 0 AND MOD((tiempo_auditoria * 4)::NUMERIC, 1) = 0),
       asignacion_completa_sitio BOOLEAN NOT NULL DEFAULT FALSE,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       deleted_at TIMESTAMPTZ DEFAULT NULL,
       deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
   );
   ```
2. **`public.equipo_auditor_proceso_sitio` (Asignación Granular M:N sin exclusividad 1:1):**
   ```sql
   CREATE TABLE IF NOT EXISTS public.equipo_auditor_proceso_sitio (
       id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
       id_procesos_sitio_auditoria UUID NOT NULL REFERENCES public.procesos_sitio_auditoria(id) ON DELETE CASCADE,
       id_auditor UUID NOT NULL REFERENCES public.auditor(id) ON DELETE RESTRICT,
       rol_en_proceso VARCHAR(50) NOT NULL DEFAULT 'EVALUADOR' CHECK (rol_en_proceso IN ('LIDER_PROCESO', 'EVALUADOR', 'APOYO_TECNICO', 'OBSERVADOR')),
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       deleted_at TIMESTAMPTZ DEFAULT NULL,
       deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
   );
   ```
3. **Trigger de Sincronización Automática hacia `public.equipo_auditor`:**
   - Al insertar o restaurar en `equipo_auditor_sitio` o `equipo_auditor_proceso_sitio`, resolver `id_auditoria` desde `sitios_por_auditoria` y ejecutar `INSERT INTO public.equipo_auditor (id_auditoria, id_auditor, rol_auditor) ... ON CONFLICT (id_auditoria, id_auditor) DO UPDATE ...` (promoviendo a `AUDITOR_LIDER` si corresponde). Esto garantiza que toda política RLS basada en `equipo_auditor` siga otorgando acceso automático al rol `AUDITOR`.

### 6. Gobernanza Soft-Delete, Dependencias y `audit_log` en `01_creacion.sql`
1. **`get_archive_dependency_summary(TEXT, UUID)`:**
   - En `WHEN 'sitio'`: agregar conteo de `procesos_por_sitio` activos (`'Procesos asignados al sitio'`).
   - En `WHEN 'proceso'`: agregar conteo de `procesos_por_sitio` activos (`'Sedes con este proceso asignado'`).
   - En `WHEN 'procesos_por_sitio'`: verificar `procesos_sitio_auditoria` activos (`'Auditorías programadas para el proceso en sede'`).
   - En `WHEN 'sitios_por_auditoria'`: incluir además conteo de `equipo_auditor_sitio` activos.
   - En `WHEN 'turnos_sitio_auditoria'`: cambiar referencia antigua `procesos_sitio_auditoria` por `turnos_proceso_sitio_auditoria` (`'Procesos vinculados a este turno de auditoría'`).
   - En `WHEN 'procesos_sitio_auditoria'`: verificar `turnos_proceso_sitio_auditoria` y `equipo_auditor_proceso_sitio` activos.
   - En `WHEN 'auditor'`: verificar `equipo_auditor`, `equipo_auditor_sitio` y `equipo_auditor_proceso_sitio` activos.
2. **Arrays del bloque `DO $$` de triggers automáticos:**
   - Añadir a `v_child_tables`: `'procesos_por_sitio'`, `'turnos_proceso_sitio_auditoria'`, `'equipo_auditor_sitio'`, `'equipo_auditor_proceso_sitio'`.
   - Añadir a `v_guarded_parents`: `'procesos_por_sitio'`, `'procesos_sitio_auditoria'`.
   - Añadir a `v_extra_audit_tables`: las 4 nuevas tablas + asegurar `update_*_modtime` en `procesos_por_sitio`, `procesos_sitio_auditoria` y `equipo_auditor_sitio`.

### 7. Índices Parciales y Optimización (`03_indices_optimizacion.sql`)
- Eliminar índice obsoleto `idx_proc_sitio_aud_compuesto` que referenciaba `id_turnos_sitio_auditoria`.
- Agregar índices únicos parciales `WHERE deleted_at IS NULL`:
  - `uq_auditoria_codigo_active` ON `auditoria (codigo_auditoria) WHERE codigo_auditoria IS NOT NULL AND deleted_at IS NULL`.
  - `uq_procesos_por_sitio_active` ON `procesos_por_sitio (id_sitio, id_proceso) WHERE deleted_at IS NULL`.
  - `uq_turnos_sitio_auditoria_active` ON `turnos_sitio_auditoria (id_sitios_por_auditoria, id_turnos_por_sitio) WHERE deleted_at IS NULL`.
  - `uq_procesos_sitio_auditoria_active` ON `procesos_sitio_auditoria (id_sitios_por_auditoria, id_procesos_por_sitio) WHERE deleted_at IS NULL`.
  - `uq_turnos_proceso_sitio_aud_active` ON `turnos_proceso_sitio_auditoria (id_procesos_sitio_auditoria, id_turnos_sitio_auditoria) WHERE deleted_at IS NULL`.
  - `uq_equipo_auditor_sitio_active` ON `equipo_auditor_sitio (id_sitios_por_auditoria, id_auditor) WHERE deleted_at IS NULL`.
  - `uq_equipo_auditor_proceso_sitio_active` ON `equipo_auditor_proceso_sitio (id_procesos_sitio_auditoria, id_auditor) WHERE deleted_at IS NULL`.
- Agregar índices de consulta compuestos:
  - `idx_auditoria_estado_ciclo` ON `auditoria (estado_ciclo, fecha_programacion) WHERE deleted_at IS NULL`.
  - `idx_auditoria_certificado_fechas` ON `auditoria (id_certificado, fecha_programacion DESC) WHERE deleted_at IS NULL`.
  - `idx_procesos_por_sitio_lookup` ON `procesos_por_sitio (id_sitio, id_proceso) WHERE deleted_at IS NULL`.
  - `idx_equipo_auditor_sitio_lookup` ON `equipo_auditor_sitio (id_sitios_por_auditoria, id_auditor) WHERE deleted_at IS NULL`.
  - `idx_equipo_auditor_proceso_lookup` ON `equipo_auditor_proceso_sitio (id_procesos_sitio_auditoria, id_auditor) WHERE deleted_at IS NULL`.

---

## Criterios de Verificación de Step 1.1
1. `00_delete_tables.sql` (si requiere limpiar `turnos_proceso_sitio_auditoria`, `equipo_auditor_proceso_sitio`, `equipo_auditor_sitio`, `procesos_por_sitio`) + `01_creacion.sql` + `03_indices_optimizacion.sql` ejecutan limpiamente sin errores de sintaxis ni referencias a columnas eliminadas (`id_turnos_sitio_auditoria` en `procesos_sitio_auditoria`).
2. `INSERT` de un borrador mínimo en `auditoria` (solo `id_certificado`) funciona correctamente.
3. Intentar vincular en `procesos_por_sitio` o `procesos_sitio_auditoria` un proceso de otro certificado o sitio falla con excepción explícita ISO/IEC 17021-1.
4. Intentar `DELETE FROM public.procesos_por_sitio` o `equipo_auditor_sitio` dispara `fn_prevent_hard_delete()`.
