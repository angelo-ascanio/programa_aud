# Paso 1.1 — Esquema SQL, Gobernanza, Índices y RLS para `experto_tecnico`

## 1. Objetivo
Crear la infraestructura completa en PostgreSQL/Supabase para el nuevo catálogo **`Experto` (`public.experto_tecnico`)** —especialistas técnicos por Sector IAF / Sub-Sector IAF sin normas ISO— junto con sus teléfonos, emails, competencias IAF y la tabla de asignación **global por auditoría** (`public.experto_tecnico_auditoria`). Además, dejar documentada la verificación comparativa de `public.auditor` frente a `public.experto_tecnico`.

---

## 2. Archivos Involucrados (Alcance Estricto SQL + Tests SQL)
- `public/supabase/queries/01_creacion.sql`
- `public/supabase/queries/02_cobertura_normativa.sql`
- `public/supabase/queries/03_indices_optimizacion.sql`
- `public/supabase/queries/04_rls.sql`
- `src/lib/step101SqlSchema.test.ts`
- `src/lib/phase11SqlMigration.test.ts`
- `src/lib/phase12RlsHardening.test.ts`
- `src/lib/archiveGovernance.ts` (solo listas/mapas de tablas SQL si aplica para `experto_tecnico`, sin UI aún)

> **No modificar** en este paso: `06_datos_prueba.sql`, vistas (`src/views/*`) ni dominio TS de UI (`Paso 1.2` y `1.3`).

---

## 3. Especificación Técnica Detallada

### 3.1. Revisión de `public.auditor` vs `public.experto_tecnico` (`01_creacion.sql`)
- Verificar `public.auditor` (líneas ~266–293 de `01_creacion.sql`): conservar intactas `auditor`, `norma_auditor`, `sector_iaf_auditor` y `subsector_iaf_auditor` para no romper asignaciones históricas ni tests.
- Crear a continuación de `subsector_iaf_auditor` las tablas de `experto_tecnico`:
  1. **`public.experto_tecnico`**:
     - `id UUID PRIMARY KEY DEFAULT uuid_generate_v4()`
     - `nombre VARCHAR(150) NOT NULL`
     - `estatus VARCHAR(40) NOT NULL DEFAULT 'Disponible'` con `CHECK (estatus IN ('Disponible', 'No disponible'))` (indica de forma clara si el experto está apto/disponible para trabajar o no)
     - `notas TEXT NULL` (campo de notas de perfil)
     - `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
     - `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
     - `deleted_at TIMESTAMPTZ DEFAULT NULL`
     - `deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL`
     - `delete_reason TEXT`
  2. **`public.telefono_experto_tecnico`** (siguiendo el patrón de `telefono_contacto_certificado`):
     - `id UUID PRIMARY KEY DEFAULT uuid_generate_v4()`
     - `id_experto_tecnico UUID NOT NULL REFERENCES public.experto_tecnico(id) ON DELETE CASCADE`
     - `telefono VARCHAR(50) NOT NULL`
     - `tipo_telefono VARCHAR(40) NOT NULL DEFAULT 'Móvil'`
     - `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
     - `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
     - `deleted_at TIMESTAMPTZ DEFAULT NULL`
     - `deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL`
  3. **`public.email_experto_tecnico`** (siguiendo el patrón de `email_contacto_certificado`):
     - `id UUID PRIMARY KEY DEFAULT uuid_generate_v4()`
     - `id_experto_tecnico UUID NOT NULL REFERENCES public.experto_tecnico(id) ON DELETE CASCADE`
     - `email VARCHAR(200) NOT NULL`
     - `tipo_email VARCHAR(40) NOT NULL DEFAULT 'Trabajo'`
     - `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
     - `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
     - `deleted_at TIMESTAMPTZ DEFAULT NULL`
     - `deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL`
  4. **`public.sector_iaf_experto`** (M:N pura, análoga a `sector_iaf_auditor`):
     - `id_experto_tecnico UUID NOT NULL REFERENCES public.experto_tecnico(id) ON DELETE CASCADE`
     - `id_sector_iaf UUID NOT NULL REFERENCES public.sector_iaf(id) ON DELETE CASCADE`
     - `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
     - `PRIMARY KEY (id_experto_tecnico, id_sector_iaf)`
  5. **`public.subsector_iaf_experto`** (M:N pura, análoga a `subsector_iaf_auditor`):
     - `id_experto_tecnico UUID NOT NULL REFERENCES public.experto_tecnico(id) ON DELETE CASCADE`
     - `id_subsector_iaf UUID NOT NULL REFERENCES public.subsector_iaf(id) ON DELETE CASCADE`
     - `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
     - `PRIMARY KEY (id_experto_tecnico, id_subsector_iaf)`
  - **Restricción de dominio:** No crear ninguna tabla `norma_experto_tecnico`. El experto técnico solo posee competencia en `Sector IAF` y/o `Sub-Sector IAF`.

### 3.2. Asignación Global de Experto Técnico a la Auditoría (`01_creacion.sql`)
- En Dominio 3 (después de `equipo_auditor_proceso_sitio`), crear **`public.experto_tecnico_auditoria`**:
  - `id UUID PRIMARY KEY DEFAULT uuid_generate_v4()`
  - `id_auditoria UUID NOT NULL REFERENCES public.auditoria(id) ON DELETE CASCADE`
  - `id_experto_tecnico UUID NOT NULL REFERENCES public.experto_tecnico(id) ON DELETE RESTRICT`
  - `dias_asignados NUMERIC(6,2) NOT NULL CHECK (dias_asignados > 0 AND MOD((dias_asignados * 4)::NUMERIC, 1) = 0)`
  - `observacion TEXT NULL`
  - `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
  - `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
  - `deleted_at TIMESTAMPTZ DEFAULT NULL`
  - `deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL`
- **Invariante:** Esta tabla se vincula **exclusivamente a `auditoria(id)`** (alcance global de auditoría, sin `id_sitios_por_auditoria` ni `id_sitio_temporal`). Permite 0, 1 o múltiples expertos por auditoría.

### 3.3. Gobernanza de Archivo, Soft-Delete y Audit Log (`01_creacion.sql`)
- Incluir `'experto_tecnico'` en `v_core_tables`, `v_guarded_parents` y `v_extra_audit_tables`.
- Incluir `'telefono_experto_tecnico'`, `'email_experto_tecnico'` y `'experto_tecnico_auditoria'` en `v_child_tables` y `v_extra_audit_tables`.
- En `get_archive_dependency_summary(p_table_name, p_record_id)`: agregar rama `WHEN 'experto_tecnico'` contando dependencias activas en `public.experto_tecnico_auditoria WHERE id_experto_tecnico = p_record_id AND deleted_at IS NULL`.
- Verificar que `archive_record` soporte `'experto_tecnico'` y sus tablas hijas con `deleted_at` / `deleted_by`.

### 3.4. Funciones de Cobertura Sectorial (`02_cobertura_normativa.sql`)
- Añadir función SQL `public.experto_cubre_sector_subsector(p_experto_id UUID, p_sector_iaf_id UUID, p_subsector_iaf_id UUID)` (`STABLE SECURITY INVOKER`) que retorne `TRUE` si:
  - El experto está activo (`deleted_at IS NULL`) y tiene el `id_subsector_iaf` exacto en `subsector_iaf_experto`, **O** tiene el `id_sector_iaf` completo en `sector_iaf_experto` (o el sector padre del subsector).
- Añadir función SQL `public.expertos_calificados_para_sector(p_sector_iaf_id UUID, p_subsector_iaf_id UUID)` y otorgar `REVOKE ALL FROM PUBLIC/anon` + `GRANT EXECUTE ... TO authenticated`.

### 3.5. Índices (`03_indices_optimizacion.sql`)
- Índices parciales `WHERE deleted_at IS NULL`:
  - `idx_experto_tecnico_nombre_activo` sobre `(LOWER(nombre))`
  - `idx_experto_tecnico_estatus_activo` sobre `(estatus)`
  - `idx_telefono_experto_activo` sobre `(id_experto_tecnico)`
  - `idx_email_experto_activo` sobre `(id_experto_tecnico)`
  - `idx_experto_auditoria_unique_activo` índice único parcial `ON public.experto_tecnico_auditoria(id_auditoria, id_experto_tecnico) WHERE deleted_at IS NULL`
  - `idx_experto_auditoria_experto_activo` sobre `(id_experto_tecnico) WHERE deleted_at IS NULL`
  - Índices B-Tree de apoyo en `sector_iaf_experto(id_sector_iaf)` y `subsector_iaf_experto(id_subsector_iaf)`.

### 3.6. Seguridad RLS / DCL (`04_rls.sql`)
- Habilitar `ENABLE ROW LEVEL SECURITY` en las 6 tablas nuevas.
- **Catálogo `experto_tecnico`, `telefono_experto_tecnico`, `email_experto_tecnico`:**
  - `SELECT`: `deleted_at IS NULL OR public.is_approved_admin()` (lectura autenticada de activos, consistente con `auditor`).
  - `INSERT` / `UPDATE`: estrictamente `public.is_approved_worker()` (y `is_approved_admin()` para ver/restaurar archivados).
- **Tablas M:N `sector_iaf_experto` y `subsector_iaf_experto`:**
  - `SELECT` si el padre `experto_tecnico` es activo o `is_approved_admin()`.
  - `INSERT` / `DELETE` solo `public.is_approved_worker()`.
- **Tabla transaccional `experto_tecnico_auditoria`:**
  - `SELECT` (`authenticated`): `public.is_approved_worker()`, o `AUDITOR` asignado/vinculado a la auditoría, o `CLIENT` con acceso **Nivel 2** (`public.has_client_org_access(...)` resolviendo vía `auditoria -> certificado -> id_organizacion`) siempre con `deleted_at IS NULL` (salvo `is_approved_admin()`).
  - `INSERT` / `UPDATE`: estrictamente `public.is_approved_worker()`.

---

## 4. Criterios de Aceptación
1. Las 6 tablas nuevas (`experto_tecnico`, `telefono_experto_tecnico`, `email_experto_tecnico`, `sector_iaf_experto`, `subsector_iaf_experto`, `experto_tecnico_auditoria`) existen con restricciones `CHECK` válidas (`estatus`, `dias_asignados > 0` múltiplo `0.25`).
2. `experto_tecnico` no tiene relación con `norma`.
3. `experto_tecnico_auditoria` depende de `auditoria(id)` y no tiene FK a sitios.
4. `get_archive_dependency_summary` bloquea archivar un `experto_tecnico` con asignaciones activas en `experto_tecnico_auditoria`.
5. RLS protege escrituras exclusivamente a `ADMIN`/`WORKER` y preserva aislamiento Nivel 2 de `CLIENT`.

---

## 5. Verificación
- Reset limpio en PostgreSQL/Supabase ejecutando en orden `00` → `07` (comprobar 0 errores SQL).
- `npx tsx --test src/lib/step101SqlSchema.test.ts src/lib/phase11SqlMigration.test.ts src/lib/phase12RlsHardening.test.ts`
- `npx tsc --noEmit && npm run lint && npm run build`
