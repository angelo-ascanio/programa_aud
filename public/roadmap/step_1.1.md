# Step 1.1 — Evolución del Esquema SQL: Entidad Maestra de Vinculación, Multi-Fecha 1:N, Alertas y Planificación Relacional

## Objetivo
Evolucionar la base de datos PostgreSQL (`public/supabase/queries/01_creacion.sql` y `public/supabase/queries/03_indices_optimizacion.sql`) para soportar integralmente:
1. La entidad maestra superior **`public.programa_auditoria`** (vinculación **Individual**, **Nivel 1 Intra-Organización** y **Nivel 2 Inter-Organización**, etiqueta descriptiva, taxonomía de vinculación y trazabilidad de evolución entre ciclos).
2. La tabla relacional 1:N **`public.auditoria_fecha`** (eliminando `fecha_programacion` y `fecha_reprogramacion` de `public.auditoria`), con soporte para fechas **Pre-programadas (Mes/Año)** y **Reales (Fecha Inicio → Fecha Fin)**, `numero_secuencia`, `tag` (`Programación` / `Reprogramación`) y `observacion`.
3. La tabla de configuración **`public.configuracion_alerta_auditoria`** para umbrales configurables de alertas del calendario.
4. Procesos vinculados físicamente a cada sede (**`public.procesos_por_sitio`**).
5. Muestreo desacoplado de auditoría (**`public.procesos_sitio_auditoria`** → `1..N` turnos vía **`public.turnos_proceso_sitio_auditoria`**).
6. Asignación flexible de auditores y días decimales en cuartos (`0.25d`) vía **`public.equipo_auditor_sitio`** y **`public.equipo_auditor_proceso_sitio`**.
7. Gobernanza integral de borrado lógico (`fn_prevent_hard_delete`, `fn_sync_soft_delete_metadata`, `fn_guard_parent_archival`, `get_archive_dependency_summary`, `audit_log`) e índices únicos parciales `WHERE deleted_at IS NULL`.

---

## Archivos a Modificar
- `public/supabase/queries/01_creacion.sql`
- `public/supabase/queries/03_indices_optimizacion.sql`
- *(Nota: Las pruebas en `src/lib/phase11SqlMigration.test.ts` se sincronizarán en `Step 2.2`, sin tocar `src/` en este paso).*

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

---

### 2. Nueva Entidad Maestra Superior: `public.programa_auditoria` (Dominio Auditoría)
Se posiciona inmediatamente **antes** de `public.auditoria` en `01_creacion.sql`:

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

- **Regla sobre `id_ciclo_origen`:** permite enlazar un programa de un nuevo ciclo anual con el programa del ciclo anterior para documentar la evolución (ej. Año 1 `Combinada` → Año 2 `Integrada`) sin alterar el registro histórico.

---

### 3. Evolución de `public.auditoria` (Eliminación de Fechas Planas + FK a `programa_auditoria` + Borradores Progresivos)
Actualizar `public.auditoria` en `01_creacion.sql`:
- **Columnas eliminadas:** `fecha_programacion` y `fecha_reprogramacion` se **eliminan por completo** de `public.auditoria` (toda fecha vive ahora en `public.auditoria_fecha`).
- **Estructura objetivo de `public.auditoria`:**
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
- **Triggers de Consistencia de Vinculación (`fn_validar_auditoria_en_programa`):**
  - Se ejecuta `BEFORE INSERT OR UPDATE OF id_programa_auditoria, id_certificado, deleted_at ON public.auditoria` (cuando `NEW.deleted_at IS NULL`):
    1. Verifica que el `programa_auditoria` padre existe y está activo (`deleted_at IS NULL`).
    2. Si `nivel_vinculacion = 'INDIVIDUAL'`, impide tener más de `1` `auditoria` activa (`id <> NEW.id`) en ese programa.
    3. Si `nivel_vinculacion = 'NIVEL_1_INTRA_ORG'`, resuelve `v_org_nueva` desde `certificado.id_organizacion` y verifica que no exista otra `auditoria` activa (`id <> NEW.id`) en el mismo `id_programa_auditoria` perteneciente a una `id_organizacion` distinta (`RAISE EXCEPTION 'Violación de Vinculación Nivel 1: Todos los certificados de una auditoría intra-organizacional deben pertenecer a la misma organización.'`).
    4. Impide duplicar el mismo `id_certificado` activo dentro del mismo `id_programa_auditoria`.
  - Adicionalmente, un trigger `BEFORE UPDATE OF nivel_vinculacion ON public.programa_auditoria` valida coherencia si el staff intenta cambiar de `NIVEL_2_INTER_ORG` a `NIVEL_1_INTRA_ORG` o `INDIVIDUAL` cuando ya existen auditorías vinculadas incompatibles.

---

### 4. Nueva Tabla Relacional Multi-Fecha 1:N: `public.auditoria_fecha`
Ubicar inmediatamente después de `public.auditoria`:

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
            AND anio IS NOT NULL
            AND mes IS NOT NULL
            AND fecha_inicio IS NULL
            AND fecha_fin IS NULL
        )
        OR (
            tipo_fecha = 'REAL'
            AND fecha_inicio IS NOT NULL
            AND fecha_fin IS NOT NULL
            AND fecha_fin >= fecha_inicio
        )
    )
);
```

- **Reglas Clave:**
  - La fecha vigente de cualquier `auditoria` es la fila activa (`deleted_at IS NULL`) con `MAX(numero_secuencia)`.
  - Múltiples reprogramaciones (`seq 1: Programación`, `seq 2: Reprogramación`, `seq 3: Reprogramación`) conservan su historial completo y su `observacion`.
  - Si `tipo_fecha = 'REAL'`, permite representar un rango de ejecución calendario (`fecha_inicio..fecha_fin`, ej. 3 días calendario) independiente del volumen de días-auditor (`tiempo_auditoria`, ej. `6.00d` repartidos entre 2 auditores).
  - **Trigger `fn_validar_auditoria_fecha_secuencia`:** valida que la `auditoria` exista y esté activa al insertar/actualizar un registro activo.

---

### 5. Nueva Tabla de Alertas Configurables: `public.configuracion_alerta_auditoria`
Configuración operativa persistida en PostgreSQL (1 fila activa por defecto, extensible sin romper contrato):

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

---

### 6. Evolución de `sitios_por_auditoria`, Rediseño de `procesos_sitio_auditoria` y Tablas de Turnos / Equipo
1. **`public.sitios_por_auditoria`:**
   - Añadir `tiempo_auditoria NUMERIC(6,2) NOT NULL DEFAULT 0 CHECK (tiempo_auditoria >= 0 AND MOD((tiempo_auditoria * 4)::NUMERIC, 1) = 0)`.
   - Añadir `modalidad_evaluacion VARCHAR(20) NULL CHECK (modalidad_evaluacion IS NULL OR modalidad_evaluacion IN ('Presencial', 'Remota', 'Mixta'))`.
   - Añadir `fecha_inicio DATE NULL`, `fecha_fin DATE NULL CHECK (fecha_fin IS NULL OR fecha_inicio IS NULL OR fecha_fin >= fecha_inicio)` (opcional para desglose por sede dentro del rango de la auditoría), y `notas_sitio TEXT NULL`.
2. **`public.procesos_sitio_auditoria` (Rediseño):**
   - Eliminar la columna obligatoria `id_turnos_sitio_auditoria` (rompía el soporte `1..N` turnos y borradores).
   - Incorporar `id_procesos_por_sitio UUID NOT NULL REFERENCES public.procesos_por_sitio(id) ON DELETE RESTRICT`, manteniendo `id_proceso UUID NOT NULL REFERENCES public.proceso(id) ON DELETE RESTRICT` y `notas TEXT NULL`.
   - **Trigger `fn_validar_proceso_sitio_auditoria_certificado`:** valida `procesos_por_sitio.id_sitio = sitios_por_auditoria.id_sitio`, auto-sincroniza `NEW.id_proceso := v_proceso_del_sitio`, y valida coherencia con `auditoria.id_certificado`.
3. **`public.turnos_proceso_sitio_auditoria` (Nueva puente `1..N`):**
   - `id`, `id_procesos_sitio_auditoria` (`REFERENCES procesos_sitio_auditoria(id) ON DELETE CASCADE`), `id_turnos_sitio_auditoria` (`REFERENCES turnos_por_sitio` vía `turnos_sitio_auditoria(id) ON DELETE RESTRICT`), `created_at`, `deleted_at`, `deleted_by`.
   - **Trigger `fn_validar_turno_proceso_sitio_auditoria`:** exige mismo `id_sitios_por_auditoria` activo.
4. **`public.equipo_auditor_sitio` (Cubo 2 por Auditor × Sitio) y `public.equipo_auditor_proceso_sitio` (M:N Granular):**
   - `equipo_auditor_sitio`: `id_sitios_por_auditoria`, `id_auditor`, `rol_auditor` (`'AUDITOR_LIDER' | 'AUDITOR' | 'AUDITOR_EN_ENTRENAMIENTO' | 'EXPERTO_TECNICO'`), `tiempo_auditoria NUMERIC(6,2)` (múltiplos de `0.25d`), `asignacion_completa_sitio BOOLEAN DEFAULT FALSE`.
   - `equipo_auditor_proceso_sitio`: `id_procesos_sitio_auditoria`, `id_auditor`, `rol_en_proceso` (`'LIDER_PROCESO' | 'EVALUADOR' | 'APOYO_TECNICO' | 'OBSERVADOR'`).
   - **Trigger de Sincronización Automática hacia `public.equipo_auditor`:** al insertar o restaurar en `equipo_auditor_sitio` o `equipo_auditor_proceso_sitio`, garantiza presencia activa en `public.equipo_auditor` (promoviendo a `'AUDITOR_LIDER'` cuando aplique) para preservar todas las políticas RLS dependientes de `is_assigned_auditor()`.

---

### 7. Gobernanza Soft-Delete, Dependencias y `audit_log` en `01_creacion.sql`
1. **`get_archive_dependency_summary(TEXT, UUID)`:**
   - Añadir `WHEN 'programa_auditoria' THEN`: contar `auditoria` activas vinculadas (`'Auditorías vinculadas al programa/campaña'`).
   - En `WHEN 'auditoria'`: incluir conteo de `auditoria_fecha`, `sitios_por_auditoria`, `comentarios_por_auditoria` y `hallazgo` activos.
   - En `WHEN 'sitio'` y `WHEN 'proceso'`: añadir conteo de `procesos_por_sitio` activos.
   - Añadir `WHEN 'procesos_por_sitio'` (revisa `procesos_sitio_auditoria`), actualizar `WHEN 'turnos_sitio_auditoria'` (revisa `turnos_proceso_sitio_auditoria`), actualizar `WHEN 'sitios_por_auditoria'` (incluye `equipo_auditor_sitio`), añadir `WHEN 'procesos_sitio_auditoria'` (revisa `turnos_proceso_sitio_auditoria` y `equipo_auditor_proceso_sitio`), y en `WHEN 'auditor'` incluir `equipo_auditor_sitio` y `equipo_auditor_proceso_sitio`.
2. **Arrays de Triggers Automáticos (`DO $$`):**
   - `v_core_tables`: añadir `'programa_auditoria'`.
   - `v_child_tables`: añadir `'auditoria_fecha'`, `'configuracion_alerta_auditoria'`, `'procesos_por_sitio'`, `'turnos_proceso_sitio_auditoria'`, `'equipo_auditor_sitio'`, `'equipo_auditor_proceso_sitio'`.
   - `v_guarded_parents`: añadir `'programa_auditoria'`, `'procesos_por_sitio'`, `'procesos_sitio_auditoria'`.
   - `v_extra_audit_tables`: añadir todas las nuevas tablas anteriores + wiring `update_*_modtime` en las tablas con `updated_at` (`programa_auditoria`, `auditoria_fecha`, `configuracion_alerta_auditoria`, `procesos_por_sitio`, `procesos_sitio_auditoria`, `equipo_auditor_sitio`).

---

### 8. Índices Parciales y Optimización (`03_indices_optimizacion.sql`)
- **Eliminar índices obsoletos:**
  - `idx_auditoria_fecha` (referenciaba la columna eliminada `auditoria.fecha_programacion`).
  - `idx_proc_sitio_aud_compuesto` (referenciaba la columna eliminada `procesos_sitio_auditoria.id_turnos_sitio_auditoria`).
- **Agregar índices únicos parciales `WHERE deleted_at IS NULL`:**
  - `uq_programa_auditoria_codigo_active` ON `public.programa_auditoria (codigo_programa) WHERE codigo_programa IS NOT NULL AND deleted_at IS NULL`.
  - `uq_auditoria_codigo_active` ON `public.auditoria (codigo_auditoria) WHERE codigo_auditoria IS NOT NULL AND deleted_at IS NULL`.
  - `uq_auditoria_programa_cert_active` ON `public.auditoria (id_programa_auditoria, id_certificado) WHERE deleted_at IS NULL`.
  - `uq_auditoria_fecha_secuencia_active` ON `public.auditoria_fecha (id_auditoria, numero_secuencia) WHERE deleted_at IS NULL`.
  - `uq_config_alerta_clave_active` ON `public.configuracion_alerta_auditoria (clave) WHERE deleted_at IS NULL`.
  - `uq_procesos_por_sitio_active` ON `public.procesos_por_sitio (id_sitio, id_proceso) WHERE deleted_at IS NULL`.
  - `uq_turnos_sitio_auditoria_active` ON `public.turnos_sitio_auditoria (id_sitios_por_auditoria, id_turnos_por_sitio) WHERE deleted_at IS NULL`.
  - `uq_procesos_sitio_auditoria_active` ON `public.procesos_sitio_auditoria (id_sitios_por_auditoria, id_procesos_por_sitio) WHERE deleted_at IS NULL`.
  - `uq_turnos_proceso_sitio_aud_active` ON `public.turnos_proceso_sitio_auditoria (id_procesos_sitio_auditoria, id_turnos_sitio_auditoria) WHERE deleted_at IS NULL`.
  - `uq_equipo_auditor_sitio_active` ON `public.equipo_auditor_sitio (id_sitios_por_auditoria, id_auditor) WHERE deleted_at IS NULL`.
  - `uq_equipo_auditor_proceso_sitio_active` ON `public.equipo_auditor_proceso_sitio (id_procesos_sitio_auditoria, id_auditor) WHERE deleted_at IS NULL`.
- **Agregar índices compuestos de consulta:**
  - `idx_auditoria_programa_estado` ON `public.auditoria (id_programa_auditoria, estado_ciclo) WHERE deleted_at IS NULL`.
  - `idx_auditoria_certificado_ciclo` ON `public.auditoria (id_certificado, estado_ciclo) WHERE deleted_at IS NULL`.
  - `idx_auditoria_fecha_vigencia` ON `public.auditoria_fecha (id_auditoria, numero_secuencia DESC) WHERE deleted_at IS NULL`.
  - `idx_auditoria_fecha_rango_real` ON `public.auditoria_fecha (fecha_inicio, fecha_fin) WHERE tipo_fecha = 'REAL' AND deleted_at IS NULL`.
  - `idx_auditoria_fecha_preprog_mes` ON `public.auditoria_fecha (anio, mes) WHERE tipo_fecha = 'PREPROGRAMADA_MES' AND deleted_at IS NULL`.
  - `idx_procesos_por_sitio_lookup`, `idx_equipo_auditor_sitio_lookup`, `idx_equipo_auditor_proceso_lookup`.

---

## Criterios de Verificación de Step 1.1
1. `00_delete_tables.sql` + `01_creacion.sql` + `03_indices_optimizacion.sql` ejecutan limpiamente sin errores ni referencias residuales a `fecha_programacion`, `fecha_reprogramacion` o `id_turnos_sitio_auditoria`.
2. Intentar insertar `2` auditorías de organizaciones distintas dentro de un programa `NIVEL_1_INTRA_ORG` o `2` auditorías en un programa `INDIVIDUAL` lanza excepción explícita en PostgreSQL; `NIVEL_2_INTER_ORG` permite múltiples organizaciones.
3. `auditoria_fecha` acepta tanto filas `PREPROGRAMADA_MES` (`anio`, `mes`) como `REAL` (`fecha_inicio <= fecha_fin`) con secuencias ordenadas y rechaza payloads inconsistentes mediante `CHECK`.
4. Intentar `DELETE FROM public.programa_auditoria` o `DELETE FROM public.auditoria_fecha` dispara `fn_prevent_hard_delete()`.
