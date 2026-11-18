# Step 1.1.1 — Esquema SQL Core: Entidad Maestra (`programa_auditoria`), Refactorización de `auditoria`, Multi-Fecha 1:N (`auditoria_fecha`) y `configuracion_alerta_auditoria`

## Objetivo
Introducir de forma aislada y limpia la **capa superior del modelo relacional de Auditorías** en `public/supabase/queries/01_creacion.sql` y sus índices en `public/supabase/queries/03_indices_optimizacion.sql`:
1. Crear **`public.programa_auditoria`** (Individual, Nivel 1 Intra-Organización, Nivel 2 Inter-Organización, taxonomía de vinculación y evolución de ciclos).
2. Refactorizar **`public.auditoria`** eliminando las columnas planas `fecha_programacion` y `fecha_reprogramacion`, enlazándola con `id_programa_auditoria` y habilitando borradores progresivos (`id_tipo_auditoria` / `id_metodologia` `NULLABLE`, `codigo_auditoria`, `tiempo_auditoria`, `estado_ciclo`, `objetivo`).
3. Crear **`public.auditoria_fecha`** (1:N por auditoría, `numero_secuencia`, `tag`, `PREPROGRAMADA_MES` vs `REAL`, `observacion`).
4. Crear **`public.configuracion_alerta_auditoria`** para umbrales configurables de alertas del calendario.

*(Las tablas inferiores `procesos_por_sitio`, `turnos_proceso_sitio_auditoria`, `equipo_auditor_sitio` y `equipo_auditor_proceso_sitio` se abordan de forma separada en `Step 1.1.2`).*

---

## Archivos a Modificar
- `public/supabase/queries/01_creacion.sql`
- `public/supabase/queries/03_indices_optimizacion.sql`

---

## Especificación Técnica Detallada

### 1. Nueva Entidad Maestra: `public.programa_auditoria`
Ubicar inmediatamente **antes** de `public.auditoria` en `01_creacion.sql`:

```sql
CREATE TABLE IF NOT EXISTS public.programa_auditoria (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    codigo_programa VARCHAR(40) NULL,
    etiqueta VARCHAR(180) NOT NULL,
    nivel_vinculacion VARCHAR(30) NOT NULL DEFAULT 'INDIVIDUAL'
        CONSTRAINT check_programa_nivel_vinculacion CHECK (
            nivel_vinculacion IN ('INDIVIDUAL', 'NIVEL_1_INTRA_ORG', 'NIVEL_2_INTER_ORG')
        ),
    tipo_vinculacion VARCHAR(30) NOT NULL DEFAULT 'Individual'
        CONSTRAINT check_programa_tipo_vinculacion CHECK (
            tipo_vinculacion IN (
                'Individual',
                'Combinada',
                'Integrada',
                'Conjunta',
                'Simultánea',
                'Multientidad',
                'Multisitio'
            )
        ),
    es_vinculada BOOLEAN NOT NULL DEFAULT FALSE,
    id_ciclo_origen UUID NULL REFERENCES public.programa_auditoria(id) ON DELETE SET NULL,
    notas TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    delete_reason TEXT,
    CONSTRAINT check_programa_coherencia_individual CHECK (
        (nivel_vinculacion = 'INDIVIDUAL' AND tipo_vinculacion = 'Individual' AND es_vinculada = FALSE)
        OR (nivel_vinculacion IN ('NIVEL_1_INTRA_ORG', 'NIVEL_2_INTER_ORG') AND tipo_vinculacion <> 'Individual' AND es_vinculada = TRUE)
    )
);
```

### 2. Refactorización de `public.auditoria`
- **Eliminar por completo** `fecha_programacion` y `fecha_reprogramacion` de `public.auditoria`.
- Estructura objetivo:
```sql
CREATE TABLE IF NOT EXISTS public.auditoria (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    id_programa_auditoria UUID NOT NULL REFERENCES public.programa_auditoria(id) ON DELETE RESTRICT,
    codigo_auditoria VARCHAR(40) NULL,
    id_certificado UUID NOT NULL REFERENCES public.certificado(id) ON DELETE RESTRICT,
    id_tipo_auditoria UUID NULL REFERENCES public.tipo_auditoria(id) ON DELETE RESTRICT,
    id_metodologia UUID NULL REFERENCES public.metodologia_auditoria(id) ON DELETE RESTRICT,
    tiempo_auditoria NUMERIC(6,2) NOT NULL DEFAULT 0
        CHECK (tiempo_auditoria >= 0 AND MOD((tiempo_auditoria * 4)::NUMERIC, 1) = 0),
    estado_ciclo VARCHAR(30) NOT NULL DEFAULT 'Borrador'
        CHECK (estado_ciclo IN (
            'Borrador',
            'En Programación',
            'Programada',
            'En Ejecución',
            'Auditada',
            'Reprogramada',
            'Cancelada'
        )),
    objetivo TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    delete_reason TEXT
);
```

### 3. Triggers de Coherencia de Vinculación (`programa_auditoria` ↔ `auditoria`)
1. **`fn_validar_auditoria_en_programa` (`BEFORE INSERT OR UPDATE OF id_programa_auditoria, id_certificado, deleted_at ON public.auditoria`):**
   - Solo evalúa cuando `NEW.deleted_at IS NULL`.
   - Verifica `programa_auditoria` activo (`deleted_at IS NULL`).
   - Si `nivel_vinculacion = 'INDIVIDUAL'`: prohíbe `> 1` `auditoria` activa (`id <> NEW.id`) en ese programa.
   - Si `nivel_vinculacion = 'NIVEL_1_INTRA_ORG'`: resuelve `certificado.id_organizacion` de `NEW.id_certificado` y prohíbe coexistencia con auditorías activas del mismo programa pertenecientes a otra organización (`RAISE EXCEPTION 'Violación de Vinculación Nivel 1: Todos los certificados deben pertenecer a la misma organización.'`).
   - Impide duplicar `id_certificado` activo dentro del mismo `id_programa_auditoria`.
2. **`fn_validar_cambio_nivel_programa` (`BEFORE UPDATE OF nivel_vinculacion ON public.programa_auditoria`):**
   - Impide degradar de `NIVEL_2_INTER_ORG` a `NIVEL_1_INTRA_ORG` o `INDIVIDUAL` si las auditorías activas hijas violan la cardinalidad o unicidad de organización.

### 4. Nueva Tabla Multi-Fecha 1:N: `public.auditoria_fecha`
```sql
CREATE TABLE IF NOT EXISTS public.auditoria_fecha (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    id_auditoria UUID NOT NULL REFERENCES public.auditoria(id) ON DELETE CASCADE,
    numero_secuencia INTEGER NOT NULL CHECK (numero_secuencia >= 1),
    tag VARCHAR(30) NOT NULL DEFAULT 'Programación'
        CONSTRAINT check_auditoria_fecha_tag CHECK (tag IN ('Programación', 'Reprogramación')),
    tipo_fecha VARCHAR(30) NOT NULL
        CONSTRAINT check_auditoria_fecha_tipo CHECK (tipo_fecha IN ('PREPROGRAMADA_MES', 'REAL')),
    anio SMALLINT NULL CHECK (anio IS NULL OR (anio BETWEEN 2000 AND 2100)),
    mes SMALLINT NULL CHECK (mes IS NULL OR (mes BETWEEN 1 AND 12)),
    fecha_inicio DATE NULL,
    fecha_fin DATE NULL,
    observacion TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    CONSTRAINT check_auditoria_fecha_payload CHECK (
        (
            tipo_fecha = 'PREPROGRAMADA_MES'
            AND anio IS NOT NULL AND mes IS NOT NULL
            AND fecha_inicio IS NULL AND fecha_fin IS NULL
        )
        OR (
            tipo_fecha = 'REAL'
            AND fecha_inicio IS NOT NULL AND fecha_fin IS NOT NULL
            AND fecha_fin >= fecha_inicio
        )
    )
);
```
- **Trigger `fn_validar_auditoria_fecha_secuencia`:** exige que `auditoria` exista y esté activa (`deleted_at IS NULL`) al insertar/reactivar una fecha.

### 5. Nueva Tabla de Alertas Configurables: `public.configuracion_alerta_auditoria`
```sql
CREATE TABLE IF NOT EXISTS public.configuracion_alerta_auditoria (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clave VARCHAR(40) NOT NULL DEFAULT 'DEFAULT',
    dias_aviso_proxima INTEGER NOT NULL DEFAULT 15 CHECK (dias_aviso_proxima BETWEEN 1 AND 365),
    dias_aviso_preprogramada_sin_confirmar INTEGER NOT NULL DEFAULT 30 CHECK (dias_aviso_preprogramada_sin_confirmar BETWEEN 1 AND 365),
    alertar_atrasadas BOOLEAN NOT NULL DEFAULT TRUE,
    alertar_conflicto_auditor BOOLEAN NOT NULL DEFAULT TRUE,
    alertar_desfase_dias_o_span BOOLEAN NOT NULL DEFAULT TRUE,
    ciclos_rotacion_auditor_lider INTEGER NOT NULL DEFAULT 3 CHECK (ciclos_rotacion_auditor_lider BETWEEN 2 AND 10),
    alertas_activas BOOLEAN NOT NULL DEFAULT TRUE,
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);
```

### 6. Gobernanza Soft-Delete e Índices Parciales (Núcleo Superior)
1. **En `01_creacion.sql`:**
   - Registrar `'programa_auditoria'` en `v_core_tables` y `v_guarded_parents`.
   - Registrar `'auditoria_fecha'` y `'configuracion_alerta_auditoria'` en `v_child_tables`.
   - Registrar las 3 tablas en `v_extra_audit_tables` y triggers `update_*_modtime`.
   - Actualizar `get_archive_dependency_summary`: agregar `WHEN 'programa_auditoria' THEN` (conteo de `auditoria` activas) y sumar `auditoria_fecha` activas dentro de `WHEN 'auditoria' THEN`.
2. **En `03_indices_optimizacion.sql`:**
   - **Eliminar** índice obsoleto `idx_auditoria_fecha` (referenciaba `auditoria.fecha_programacion`).
   - Agregar índices únicos parciales `WHERE deleted_at IS NULL`:
     - `uq_programa_auditoria_codigo_active` ON `programa_auditoria (codigo_programa) WHERE codigo_programa IS NOT NULL AND deleted_at IS NULL`.
     - `uq_auditoria_codigo_active` ON `auditoria (codigo_auditoria) WHERE codigo_auditoria IS NOT NULL AND deleted_at IS NULL`.
     - `uq_auditoria_programa_cert_active` ON `auditoria (id_programa_auditoria, id_certificado) WHERE deleted_at IS NULL`.
     - `uq_auditoria_fecha_secuencia_active` ON `auditoria_fecha (id_auditoria, numero_secuencia) WHERE deleted_at IS NULL`.
     - `uq_config_alerta_clave_active` ON `configuracion_alerta_auditoria (clave) WHERE deleted_at IS NULL`.
   - Agregar índices de consulta:
     - `idx_auditoria_programa_estado` ON `auditoria (id_programa_auditoria, estado_ciclo) WHERE deleted_at IS NULL`.
     - `idx_auditoria_certificado_ciclo` ON `auditoria (id_certificado, estado_ciclo) WHERE deleted_at IS NULL`.
     - `idx_auditoria_fecha_vigencia` ON `auditoria_fecha (id_auditoria, numero_secuencia DESC) WHERE deleted_at IS NULL`.
     - `idx_auditoria_fecha_rango_real` ON `auditoria_fecha (fecha_inicio, fecha_fin) WHERE tipo_fecha = 'REAL' AND deleted_at IS NULL`.
     - `idx_auditoria_fecha_preprog_mes` ON `auditoria_fecha (anio, mes) WHERE tipo_fecha = 'PREPROGRAMADA_MES' AND deleted_at IS NULL`.

---

## Criterios de Verificación de Step 1.1.1
1. `01_creacion.sql` y `03_indices_optimizacion.sql` ejecutan limpiamente (si `03_indices_optimizacion.sql` o `01_creacion.sql` aún conservan `id_turnos_sitio_auditoria`, el ajuste completo de esa columna llega en `Step 1.1.2`).
2. `INSERT` en `programa_auditoria` + `auditoria` valida correctamente `INDIVIDUAL` (max 1), `NIVEL_1_INTRA_ORG` (misma org) y `NIVEL_2_INTER_ORG` (multi-org).
3. `auditoria_fecha` acepta tanto `PREPROGRAMADA_MES` como `REAL` con secuencias incrementales y bloquea fechas incoherentes (`fecha_fin < fecha_inicio`).
4. `DELETE FROM public.programa_auditoria` o `auditoria_fecha` dispara `fn_prevent_hard_delete()`.
