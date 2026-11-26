# Paso 1.1: Esquema SQL, Gobernanza Soft-Delete, Índices y RLS para Perfil Enriquecido de Auditores

## 1. Objetivo del Paso
Extender el modelo relacional de `public.auditor` para soportar todos los atributos operativos y de evaluación de `public/Auditores.csv` (sin perder trazabilidad histórica ni duplicar lógicas), incorporar tablas hijas normalizadas para contactos y evaluaciones in situ, registrar todas las nuevas tablas en la gobernanza central (`v_child_tables`, `fn_prevent_hard_delete`, `audit_*_trigger`, `archive_record`, `REVOKE DELETE`), definir índices únicos parciales centrados en `cedula_identidad` y actualizar políticas RLS.

> **Alcance estricto:** Solo SQL (`01`, `02`, `03`, `04`) y pruebas de migración SQL (`phase11SqlMigration.test.ts`, `phase12RlsHardening.test.ts`). No insertar aún los 47 auditores en `06_datos_prueba.sql` (corresponde al **Paso 1.2**).

---

## 2. Archivos Permitidos a Modificar
- `public/supabase/queries/01_creacion.sql`
- `public/supabase/queries/02_cobertura_normativa.sql` (revisión de firma/campos útiles en funciones de calificación)
- `public/supabase/queries/03_indices_optimizacion.sql`
- `public/supabase/queries/04_rls.sql`
- `src/lib/phase11SqlMigration.test.ts`
- `src/lib/phase12RlsHardening.test.ts`

---

## 3. Cambios Técnicos Detallados

### 3.1 Extensión de `public.auditor` en `01_creacion.sql`
Ampliar la definición idempotente (`CREATE TABLE IF NOT EXISTS auditor` + bloque `ALTER TABLE public.auditor ADD COLUMN IF NOT EXISTS ...` para instancias ya inicializadas):

| Columna Nueva | Tipo SQL | Propósito / Origen CSV |
| :--- | :--- | :--- |
| `siglas` | `VARCHAR(20) NULL` | Col 2 (`SIGLAS`). No única (`YC` es compartido por dos auditoras). |
| `cedula_identidad` | `VARCHAR(30) NULL` | Col 3 (`Nº CÉDULA DE IDENTIDAD`). Limpia sin puntos/espacios; `NULL` permitido solo para el usuario tester histórico `3333...` si se desea, o valor `'TEST-AUDITOR'`. |
| `profesion` | `VARCHAR(200) NULL` | Col 6 (`PROFESIÓN`). |
| `esquemas_complementarios` | `TEXT NULL` | Esquemas no-ISO de Col 7 (`MARCA`, `HACCP`), separados por coma o JSON simple, evitando contaminar `public.norma` y la cobertura de cláusulas ISO. |
| `anio_actualizacion_normas` | `INTEGER NULL` | Col 8 (`AÑO DE ACTUALIZACIÓN`), `CHECK (anio_actualizacion_normas BETWEEN 1990 AND 2100)`. |
| `sistema_gestion_secundario` | `VARCHAR(150) NULL` | Col 13 (`SISTEMA DE GESTIÓN2`), preparado para captura futura. |
| `ultima_evaluacion_in_situ_texto` | `TEXT NULL` | Col 9 textual exacto (ej. `'S/R'`, `'01/10/2024'`, `'may-15 / nov-24'`). |
| `proxima_evaluacion_in_situ_texto` | `TEXT NULL` | Col 10 textual exacto (ej. `'dic-24'`, `'may-18 / nov-27'`). |
| `ultima_evaluacion_in_situ_fecha` | `DATE NULL` | Fecha normalizada más reciente de última evaluación in situ (para ordenamiento, alertas y expiración automática). |
| `proxima_evaluacion_in_situ_fecha` | `DATE NULL` | Fecha normalizada más reciente de próxima evaluación in situ (`dic-24` → último día del mes `2024-12-31` o `2024-12-01` documentado de forma consistente). |
| `sin_registro_evaluacion` | `BOOLEAN NOT NULL DEFAULT FALSE` | `TRUE` cuando Col 9 es `'S/R'` o no existe fecha registrada. |
| `sector_area_evaluado_texto` | `TEXT NULL` | Col 11 (`SÉCTOR / ÁREA TÉCNICA EVALUADO`). |
| `observaciones_evaluacion` | `TEXT NULL` | Col 12 (`OBSERVACIONES DE EVALUACIÓN`). |
| `anio_actualizacion_sectores` | `INTEGER NULL` | Col 14 (`AÑO ACTUALIZACIÓN DE SECTORES`), `CHECK (anio_actualizacion_sectores BETWEEN 1990 AND 2100)`. |
| `observacion_sectores` | `TEXT NULL` | Col 15 (`OBSERVACIÓN DE SECTORES` — contiene condicionamientos de Experto Técnico). |

### 3.2 Nuevas Tablas Hijas Normalizadas en `01_creacion.sql`
Seguir exactamente el patrón de `telefono_experto_tecnico` y `email_experto_tecnico` (soft-delete completo con `deleted_at`, `deleted_by`, `created_at`, `updated_at`):

1. **`public.telefono_auditor`**
   - `id UUID PRIMARY KEY DEFAULT uuid_generate_v4()`
   - `id_auditor UUID NOT NULL REFERENCES public.auditor(id) ON DELETE CASCADE`
   - `telefono VARCHAR(50) NOT NULL`
   - `tipo_telefono VARCHAR(40) NOT NULL DEFAULT 'Móvil'`
   - `es_principal BOOLEAN NOT NULL DEFAULT FALSE`
   - `created_at`, `updated_at`, `deleted_at`, `deleted_by`
2. **`public.email_auditor`**
   - `id UUID PRIMARY KEY DEFAULT uuid_generate_v4()`
   - `id_auditor UUID NOT NULL REFERENCES public.auditor(id) ON DELETE CASCADE`
   - `email VARCHAR(200) NOT NULL`
   - `tipo_email VARCHAR(40) NOT NULL DEFAULT 'Principal'`
   - `es_principal BOOLEAN NOT NULL DEFAULT FALSE`
   - `created_at`, `updated_at`, `deleted_at`, `deleted_by`
3. **`public.evaluacion_in_situ_auditor`** (soporte para evaluaciones múltiples por auditor, p. ej. `may-15 / nov-24`, `dic-21 / ago-23`, `nov-22 / oct-23`)
   - `id UUID PRIMARY KEY DEFAULT uuid_generate_v4()`
   - `id_auditor UUID NOT NULL REFERENCES public.auditor(id) ON DELETE CASCADE`
   - `etiqueta_periodo VARCHAR(80) NULL` (ej. `'Evaluación Principal'`, `'Evaluación 2024'`)
   - `norma_referencia VARCHAR(80) NULL` (opcional para distinguir evaluaciones por norma)
   - `sector_area_evaluado VARCHAR(150) NULL`
   - `ultima_evaluacion_fecha DATE NULL`
   - `proxima_evaluacion_fecha DATE NULL`
   - `ultima_evaluacion_texto VARCHAR(60) NULL`
   - `proxima_evaluacion_texto VARCHAR(60) NULL`
   - `observaciones TEXT NULL`
   - `created_at`, `updated_at`, `deleted_at`, `deleted_by`

> **Trigger de sincronización resumen (opcional recomendado):** Al insertar/actualizar/archivar en `evaluacion_in_situ_auditor`, mantener o permitir que la capa de aplicación / trigger opcional sincronice `ultima_evaluacion_in_situ_fecha`, `proxima_evaluacion_in_situ_fecha` y `sin_registro_evaluacion` en `public.auditor` (o mantener columnas resumen actualizadas desde dominio + SQL seed).

### 3.3 Gobernanza Central, Archivo y Triggers (`01_creacion.sql`)
- Añadir `'telefono_auditor'`, `'email_auditor'` y `'evaluacion_in_situ_auditor'` a `v_child_tables` y `v_extra_audit_tables` en el bloque `DO $$ ... END $$;` de triggers masivos (asegurando `trg_prevent_hard_delete_*`, `trg_sync_soft_delete_*` y `audit_*_trigger`).
- Verificar `get_archive_dependency_summary('auditor', p_record_id)`: conserva la verificación sobre `equipo_auditor_sitio`, `equipo_auditor_sitio_temporal` y `equipo_auditor_proceso_sitio` (los contactos/evaluaciones son hijos propios que no bloquean archivar un auditor sin auditorías, o bien se archivan en cascada controlada dentro de `archive_record` cuando `can_archive = true`). Documentar explícitamente en `archive_record` que al archivar un `auditor` libre de auditorías se marcan `deleted_at = NOW()` en sus `telefono_auditor`, `email_auditor` y `evaluacion_in_situ_auditor` activos, y al restaurarlo se restauran junto con el padre o se gestionan individualmente.

### 3.4 Cobertura Normativa (`02_cobertura_normativa.sql`)
- Revisar `public.auditores_calificados_para_certificado(p_id_certificado UUID)`: mantener firma existente o añadir funciones auxiliares si es necesario para no romper compatibilidad con RPCs/tests actuales (`phase11SqlMigration.test.ts` verifica bloques de `auditor_esta_calificado` y `auditores_calificados_para_certificado`). Confirmar que las nuevas columnas de `auditor` no rompan ninguna consulta existente.

### 3.5 Índices Únicos Parciales y Búsqueda (`03_indices_optimizacion.sql`)
- **Índice único de negocio obligatorio:**
  ```sql
  CREATE UNIQUE INDEX IF NOT EXISTS uq_auditor_cedula_active
      ON public.auditor (UPPER(TRIM(cedula_identidad)))
      WHERE cedula_identidad IS NOT NULL AND TRIM(cedula_identidad) <> '' AND deleted_at IS NULL;
  ```
- **Prohibido** crear índice único en `auditor(nombre)` o `auditor(siglas)` (por el caso real duplicado `Yurima Carrillo` / `YC`).
- **Prohibido** índice único global en `telefono_auditor(telefono)` (dos parejas reales de auditores comparten número). Sí crear unicidad **por auditor**:
  - `uq_telefono_auditor_per_auditor_active ON public.telefono_auditor (id_auditor, TRIM(telefono)) WHERE deleted_at IS NULL`
  - `uq_email_auditor_per_auditor_active ON public.email_auditor (id_auditor, LOWER(TRIM(email))) WHERE deleted_at IS NULL`
- Índices B-tree de consulta rápida:
  - `idx_auditor_siglas_active ON public.auditor (UPPER(siglas)) WHERE deleted_at IS NULL`
  - `idx_auditor_proxima_eval_active ON public.auditor (proxima_evaluacion_in_situ_fecha) WHERE deleted_at IS NULL`
  - `idx_telefono_auditor_lookup ON public.telefono_auditor (id_auditor) WHERE deleted_at IS NULL`
  - `idx_email_auditor_lookup ON public.email_auditor (id_auditor) WHERE deleted_at IS NULL`
  - `idx_evaluacion_in_situ_auditor_lookup ON public.evaluacion_in_situ_auditor (id_auditor, proxima_evaluacion_fecha DESC) WHERE deleted_at IS NULL`

### 3.6 DCL y RLS (`04_rls.sql`)
- `REVOKE DELETE ON public.telefono_auditor, public.email_auditor, public.evaluacion_in_situ_auditor FROM PUBLIC, anon, authenticated;`
- Habilitar RLS (`ENABLE ROW LEVEL SECURITY`) en las 3 nuevas tablas hijas.
- Políticas `SELECT`: usuarios `APPROVED` autenticados (coherente con `auditor` y `experto_tecnico`; `CLIENT` solo ve si corresponde o conforme a política vigente de catálogo técnico — seguir exactamente las políticas actuales de `auditor`, `telefono_experto_tecnico` y `email_experto_tecnico` en `04_rls.sql`).
- Políticas `INSERT` y `UPDATE`: restringidas estrictamente a `public.is_approved_staff()` (`ADMIN` y `WORKER` aprobados), con `WITH CHECK` evitando violación de soft-delete o escalada.

---

## 4. Criterios de Verificación del Paso 1.1
1. Ejecutar reset limpio de base de datos (`01` → `04`) sin errores ni advertencias de triggers faltantes.
2. Verificar por consulta SQL que `telefono_auditor`, `email_auditor` y `evaluacion_in_situ_auditor` tienen RLS activo, `REVOKE DELETE` aplicado, triggers `trg_prevent_hard_delete_*`, `trg_sync_soft_delete_*` y `audit_*_trigger`.
3. Verificar que intentar insertar dos auditores activos con la misma `cedula_identidad` falla con error de índice único `uq_auditor_cedula_active`, mientras que insertar dos auditores con mismo `nombre` (`Yurima Carrillo`), mismas `siglas` (`YC`) y distinta `cedula_identidad` **es aceptado**.
4. Actualizar y ejecutar `npm test` verificando que `phase11SqlMigration.test.ts` y `phase12RlsHardening.test.ts` pasen al 100%.
