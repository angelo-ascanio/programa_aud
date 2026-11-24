# Paso 1.1: Esquema SQL, Triggers, RLS y Semillas Idempotentes

## Objetivo del Paso
Preparar la base de datos PostgreSQL/Supabase para soportar:
1. Abreviaciones cortas en conglomerados (`grupo_empresarial.abreviacion`) y tipos de auditoría (`tipo_auditoria.abreviacion`).
2. Sobreescritura opcional de naturaleza por certificado dentro de una caja agrupadora (`vinculo_certificado.tipo_vinculacion_override`).
3. Naturaleza efectiva por auditoría individual (`auditoria.tipo_vinculacion`) para el módulo `Relación` y la Matriz Fase 3 del wizard `+ Auditoría`.
4. Desacople total de las cajas `Vínculo` (Bloque 2) respecto a las auditorías ejecutadas (Bloque 1), permitiendo desvincular/reorganizar cajas y auditar subconjuntos o certificados individuales libremente.

---

## Archivos Afectados
- `public/supabase/queries/01_creacion.sql`
- `public/supabase/queries/03_indices_optimizacion.sql`
- `public/supabase/queries/04_rls.sql`
- `public/supabase/queries/06_datos_prueba.sql`

> **Restricción:** No modificar `public/supabase/queries/00_delete_tables.sql`.

---

## Cambios Técnicos Detallados

### 1. Extensiones de Tablas y Migraciones Idempotentes (`01_creacion.sql`)
Agregar de forma idempotente (`ADD COLUMN IF NOT EXISTS`) en el bloque de tablas / migraciones de `01_creacion.sql`:

1. **`public.grupo_empresarial`:**
   - `abreviacion VARCHAR(24) NULL` — apodo o sigla corta del conglomerado para cabeceras, tarjetas y selectores compactos.
   - Función auxiliar determinista `public.fn_generar_abreviacion_grupo(p_nombre TEXT)` (siguiendo el patrón de `fn_generar_abreviacion_organizacion`) que derive un código corto legible (`<= 24` chars) cuando `abreviacion` sea nulo o vacío.
2. **`public.tipo_auditoria`:**
   - `abreviacion VARCHAR(16) NULL` — sigla ultra-corta para el codename de auditoría (`Et.1`, `Et.2`, `Seg.1`, `Seg.2`, `Renov.`, `Diag.`, `Extra.`, `Esp.`, `Otro`).
3. **`public.vinculo_certificado`:**
   - `tipo_vinculacion_override VARCHAR(30) NULL CHECK (tipo_vinculacion_override IS NULL OR tipo_vinculacion_override IN ('Individual', 'Combinada', 'Integrada', 'Conjunta', 'Simultánea', 'Multientidad', 'Mixta'))` — cuando es `NULL`, el certificado hereda `vinculo.tipo_vinculacion`.
4. **`public.auditoria`:**
   - `tipo_vinculacion VARCHAR(30) NULL CHECK (tipo_vinculacion IS NULL OR tipo_vinculacion IN ('Individual', 'Combinada', 'Integrada', 'Conjunta', 'Simultánea', 'Multientidad', 'Mixta'))` — naturaleza real confirmada para esa auditoría en `Relación` / Fase 3 del wizard (con respaldo en `programa_auditoria.tipo_vinculacion`).

### 2. Desacople de Triggers `Vínculo` vs. `Auditoria` (`01_creacion.sql`)
1. **`public.fn_validar_desvinculacion_certificado()`:**
   - **Eliminar** el bloqueo que impedía desvincular un certificado de `vinculo_certificado` cuando existen auditorías pendientes o activas (`RAISE EXCEPTION 'No se puede desvincular el certificado...'`). Bloque 2 `Vínculo` es un organizador estructural independiente.
   - **Eliminar** el auto-archivado automático de `vinculo` cuando `v_remaining = 0`: una Caja Agrupadora vacía debe permanecer disponible para reutilización y solo archivarse mediante acción explícita (`archive_record`).
2. **`public.fn_validar_auditoria_en_programa()`:**
   - **Eliminar** la compuerta rígida `Compuerta Paso 2 (Vínculo)` que exigía que el certificado perteneciera obligatoriamente a `vinculo_certificado` y coincidiera exactamente con `pa.id_vinculo`.
   - Mantener únicamente las validaciones de integridad referencial activas (`programa_auditoria` no archivado, `certificado` y `organizacion` activos, unicidad `(id_programa_auditoria, id_certificado)` activo) y las reglas de nivel del programa (`INDIVIDUAL`: máx 1 auditoría activa; `NIVEL_1_INTRA_ORG`: misma organización; `NIVEL_2_INTER_ORG`: mismo conglomerado).
   - Al insertar en `auditoria`, si `NEW.tipo_vinculacion IS NULL`, heredar `COALESCE(pa.tipo_vinculacion, 'Individual')`.
3. **Regla de Trigger Anti-Colisión (PostgreSQL 27000):**
   - Asegurar que ningún trigger `BEFORE INSERT/UPDATE` sobre `vinculo_certificado`, `grupo_empresarial` o `auditoria` ejecute `UPDATE` sobre filas hermanas de la misma tabla en la misma sentencia, evitando errores SQLSTATE `27000` durante ejecuciones idempotentes de `06_datos_prueba.sql`.

### 3. Índices y Políticas RLS (`03_indices_optimizacion.sql` y `04_rls.sql`)
- **`03_indices_optimizacion.sql`:**
  - `CREATE UNIQUE INDEX IF NOT EXISTS uq_grupo_empresarial_abrev_active ON public.grupo_empresarial (LOWER(TRIM(abreviacion))) WHERE abreviacion IS NOT NULL AND deleted_at IS NULL;`
  - `CREATE INDEX IF NOT EXISTS idx_auditoria_tipo_vinculacion ON public.auditoria (tipo_vinculacion) WHERE deleted_at IS NULL;`
- **`04_rls.sql`:**
  - Confirmar que `vinculo` y `vinculo_certificado` permitan lectura a `ADMIN`, `WORKER` y `CLIENT` (aislamiento Nivel 2 por `id_grupo_empresarial` de sus organizaciones autorizadas) y mutación exclusiva a `ADMIN` y `WORKER` (`is_approved_worker()`).
  - Confirmar que `AUDITOR` **no** tiene visibilidad directa de tablas exclusivas de Bloque 2 si no corresponde (mantener aislamiento de `vinculo` / `vinculo_certificado` fuera de `AUDITOR`, excepto lectura mínima heredada solo si `is_approved_worker()` o `CLIENT`, o mantener `SELECT` actual sin conceder acceso de navegación en UI al Bloque 2 y evitando exponer cajas estructurales a auditores). Revisar `vinculo_select` y `vinculo_certificado_select` en `04_rls.sql` líneas 1455–1520 para confirmar que solo `ADMIN`, `WORKER` y `CLIENT` Nivel 2 acceden a ellas.
  - Verificar que `archive_record` en `01_creacion.sql` incluya `vinculo`, `vinculo_certificado`, `programa_auditoria`, `auditoria`, `auditoria_fecha` en su whitelist y rechace con `403`/mensaje en español sin UUID si un `AUDITOR` o `CLIENT` intenta invocarlo.

### 4. Alineación de Datos de Prueba (`06_datos_prueba.sql`)
1. Poblar `abreviacion` en los 9 registros de `tipo_auditoria`:
   - `Etapa 1` → `Et.1`
   - `Etapa 2` → `Et.2`
   - `Seguimiento 1` → `Seg.1`
   - `Seguimiento 2` → `Seg.2`
   - `Renovación` → `Renov.`
   - `Diagnóstico` → `Diag.`
   - `Extraordinaria` → `Extra.`
   - `Especial` → `Esp.`
   - `Otro` → `Otro`
2. Poblar `abreviacion` en `grupo_empresarial` (ej. `CONG-IND-01` → `Iberometal`, `CONG-CYB-01` → `CyberCloud`, `CONG-ALM-01` → `Alimentos`).
3. Añadir al menos un ejemplo de `tipo_vinculacion_override` en `vinculo_certificado` (por ejemplo, dentro de una caja `'Combinada'`, un certificado con override `'Integrada'`) y poblar `auditoria.tipo_vinculacion` en las auditorías semilla para validar paridad completa desde el arranque.
4. Verificar que todos los `INSERT ... ON CONFLICT DO UPDATE` en `06_datos_prueba.sql` sean 100% re-ejecutables dos veces seguidas sin errores.

---

## Criterios de Aceptación y Verificación
- Ejecución completa e idempotente de `00_delete_tables.sql` → `01` → `02` → `03` → `04` → `05` → `06` → `07` y una segunda pasada de `06_datos_prueba.sql` sin errores SQL (incluyendo ausencia de error `27000`).
- Verificación SQL directa:
  - Desvincular un certificado de `vinculo_certificado` que tiene auditoría activa en `auditoria` **funciona** y mantiene la caja `vinculo` activa aun con 0 hijos.
  - Insertar una `auditoria` para un certificado `LIBRE` (sin fila en `vinculo_certificado`) **funciona** cuando la campaña cumple nivel/alcance.
  - Las columnas `grupo_empresarial.abreviacion`, `tipo_auditoria.abreviacion`, `vinculo_certificado.tipo_vinculacion_override` y `auditoria.tipo_vinculacion` están pobladas y protegidas por constraints y RLS.
