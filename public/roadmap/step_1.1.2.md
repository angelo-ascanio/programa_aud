# Step 1.1.2 — Esquema SQL Detalle: `procesos_por_sitio`, Muestreo Desacoplado (`turnos_proceso_sitio_auditoria`) y Equipo/Días

## Objetivo
Completar la evolución del esquema PostgreSQL (`public/supabase/queries/01_creacion.sql` y `public/supabase/queries/03_indices_optimizacion.sql`) en el **nivel operativo inferior** (`Sitio → Proceso → Turnos → Auditores + Días`), añadiendo:
1. **`public.procesos_por_sitio`** (espejo de `turnos_por_sitio` en Certificación).
2. Evolución de **`public.sitios_por_auditoria`** (`tiempo_auditoria` `0.25d`, modalidad y fechas por sede).
3. Rediseño de **`public.procesos_sitio_auditoria`** (eliminando `id_turnos_sitio_auditoria`, enlazando `id_procesos_por_sitio`) y nueva puente **`public.turnos_proceso_sitio_auditoria`** (`1..N` turnos por proceso).
4. **`public.equipo_auditor_sitio`** (Cubo 2 de días por auditor en sede + modo rápido todo el sitio) y **`public.equipo_auditor_proceso_sitio`** (co-evaluación M:N por proceso), con sincronización automática hacia `public.equipo_auditor`.

---

## Archivos a Modificar
- `public/supabase/queries/01_creacion.sql`
- `public/supabase/queries/03_indices_optimizacion.sql`

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
- **Trigger `trg_validar_proceso_por_sitio_certificado`:** verifica que `sitio.id_certificado = proceso.id_certificado` (ambos activos `deleted_at IS NULL`); si difieren, lanza excepción explícita ISO/IEC 17021-1.

### 2. Evolución de `public.sitios_por_auditoria`
Agregar a la definición de `public.sitios_por_auditoria`:
- `tiempo_auditoria NUMERIC(6,2) NOT NULL DEFAULT 0 CHECK (tiempo_auditoria >= 0 AND MOD((tiempo_auditoria * 4)::NUMERIC, 1) = 0)`.
- `modalidad_evaluacion VARCHAR(20) NULL CHECK (modalidad_evaluacion IS NULL OR modalidad_evaluacion IN ('Presencial', 'Remota', 'Mixta'))`.
- `fecha_inicio DATE NULL`, `fecha_fin DATE NULL CHECK (fecha_fin IS NULL OR fecha_inicio IS NULL OR fecha_fin >= fecha_inicio)`.
- `notas_sitio TEXT NULL`.

### 3. Rediseño de `public.procesos_sitio_auditoria` y Nueva `public.turnos_proceso_sitio_auditoria`
1. **`public.procesos_sitio_auditoria`:**
   - **Eliminar** la columna obligatoria `id_turnos_sitio_auditoria`.
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
   - **Trigger `fn_validar_proceso_sitio_auditoria_certificado`:** comprueba que `procesos_por_sitio.id_sitio = sitios_por_auditoria.id_sitio` (ambos activos), sincroniza `NEW.id_proceso := v_proceso_del_sitio`, y verifica coherencia con `auditoria.id_certificado`.
2. **`public.turnos_proceso_sitio_auditoria`:**
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
   - **Trigger `fn_validar_turno_proceso_sitio_auditoria`:** exige `procesos_sitio_auditoria.id_sitios_por_auditoria = turnos_sitio_auditoria.id_sitios_por_auditoria` (mismo sitio en la misma auditoría) y ambos activos.

### 4. Nuevas Tablas de Equipo y Días-Auditor (`equipo_auditor_sitio` y `equipo_auditor_proceso_sitio`)
1. **`public.equipo_auditor_sitio` (Cubo 2 por Auditor × Sitio):**
   ```sql
   CREATE TABLE IF NOT EXISTS public.equipo_auditor_sitio (
       id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
       id_sitios_por_auditoria UUID NOT NULL REFERENCES public.sitios_por_auditoria(id) ON DELETE CASCADE,
       id_auditor UUID NOT NULL REFERENCES public.auditor(id) ON DELETE RESTRICT,
       rol_auditor VARCHAR(50) NOT NULL DEFAULT 'AUDITOR'
           CHECK (rol_auditor IN ('AUDITOR_LIDER', 'AUDITOR', 'AUDITOR_EN_ENTRENAMIENTO', 'EXPERTO_TECNICO')),
       tiempo_auditoria NUMERIC(6,2) NOT NULL DEFAULT 0
           CHECK (tiempo_auditoria >= 0 AND MOD((tiempo_auditoria * 4)::NUMERIC, 1) = 0),
       asignacion_completa_sitio BOOLEAN NOT NULL DEFAULT FALSE,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       deleted_at TIMESTAMPTZ DEFAULT NULL,
       deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
   );
   ```
2. **`public.equipo_auditor_proceso_sitio` (Asignación Granular M:N):**
   ```sql
   CREATE TABLE IF NOT EXISTS public.equipo_auditor_proceso_sitio (
       id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
       id_procesos_sitio_auditoria UUID NOT NULL REFERENCES public.procesos_sitio_auditoria(id) ON DELETE CASCADE,
       id_auditor UUID NOT NULL REFERENCES public.auditor(id) ON DELETE RESTRICT,
       rol_en_proceso VARCHAR(50) NOT NULL DEFAULT 'EVALUADOR'
           CHECK (rol_en_proceso IN ('LIDER_PROCESO', 'EVALUADOR', 'APOYO_TECNICO', 'OBSERVADOR')),
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       deleted_at TIMESTAMPTZ DEFAULT NULL,
       deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
   );
   ```
3. **Trigger de Sincronización Automática hacia `public.equipo_auditor`:**
   - Al insertar o reactivar (`deleted_at IS NULL`) en `equipo_auditor_sitio` o `equipo_auditor_proceso_sitio`, resuelve `id_auditoria` y ejecuta upsert idempotente en `public.equipo_auditor (id_auditoria, id_auditor, rol_auditor)` (promoviendo a `'AUDITOR_LIDER'` si corresponde). Mantiene intactas todas las políticas RLS basadas en `is_assigned_auditor()`.

### 5. Gobernanza Soft-Delete e Índices (`01_creacion.sql` + `03_indices_optimizacion.sql`)
1. **`get_archive_dependency_summary(TEXT, UUID)`:**
   - En `WHEN 'sitio'` y `WHEN 'proceso'`: añadir conteo de `procesos_por_sitio` activos.
   - Añadir `WHEN 'procesos_por_sitio'` (verifica `procesos_sitio_auditoria` activos).
   - En `WHEN 'sitios_por_auditoria'`: sumar `equipo_auditor_sitio` activos.
   - En `WHEN 'turnos_sitio_auditoria'`: cambiar referencia antigua a `turnos_proceso_sitio_auditoria`.
   - Añadir `WHEN 'procesos_sitio_auditoria'` (verifica `turnos_proceso_sitio_auditoria` y `equipo_auditor_proceso_sitio`).
   - En `WHEN 'auditor'`: incluir `equipo_auditor_sitio` y `equipo_auditor_proceso_sitio`.
2. **Arrays `DO $$` de Triggers Automáticos:**
   - Añadir a `v_child_tables`: `'procesos_por_sitio'`, `'turnos_proceso_sitio_auditoria'`, `'equipo_auditor_sitio'`, `'equipo_auditor_proceso_sitio'`.
   - Añadir a `v_guarded_parents`: `'procesos_por_sitio'`, `'procesos_sitio_auditoria'`.
   - Añadir a `v_extra_audit_tables` y triggers `update_*_modtime` (`procesos_por_sitio`, `procesos_sitio_auditoria`, `equipo_auditor_sitio`).
3. **En `03_indices_optimizacion.sql`:**
   - **Eliminar** índice obsoleto `idx_proc_sitio_aud_compuesto`.
   - Agregar índices únicos parciales `WHERE deleted_at IS NULL`:
     - `uq_procesos_por_sitio_active` `(id_sitio, id_proceso)`.
     - `uq_turnos_sitio_auditoria_active` `(id_sitios_por_auditoria, id_turnos_por_sitio)`.
     - `uq_procesos_sitio_auditoria_active` `(id_sitios_por_auditoria, id_procesos_por_sitio)`.
     - `uq_turnos_proceso_sitio_aud_active` `(id_procesos_sitio_auditoria, id_turnos_sitio_auditoria)`.
     - `uq_equipo_auditor_sitio_active` `(id_sitios_por_auditoria, id_auditor)`.
     - `uq_equipo_auditor_proceso_sitio_active` `(id_procesos_sitio_auditoria, id_auditor)`.
   - Agregar índices de búsqueda (`idx_procesos_por_sitio_lookup`, `idx_equipo_auditor_sitio_lookup`, `idx_equipo_auditor_proceso_lookup`).

---

## Criterios de Verificación de Step 1.1.2
1. `00_delete_tables.sql` + `01_creacion.sql` + `03_indices_optimizacion.sql` ejecutan al 100% sin errores ni referencias a `id_turnos_sitio_auditoria` en `procesos_sitio_auditoria`.
2. Intentar vincular en `procesos_por_sitio` o `procesos_sitio_auditoria` un proceso de otro certificado o sitio falla con excepción ISO/IEC 17021-1.
3. Insertar en `equipo_auditor_sitio` sincroniza automáticamente `public.equipo_auditor`.
4. `DELETE` físico sobre cualquiera de las nuevas tablas dispara `fn_prevent_hard_delete()`.
