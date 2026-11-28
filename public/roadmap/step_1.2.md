# Paso 1.2 — Motor Puro de Serialización SQL Idempotente y Comparación/Diff

> **Objetivo:** Implementar el generador SQL determinista e idempotente y el comparador puro de diferencias (`diff`) entre filas reales de PostgreSQL y registros ya existentes en los archivos `.sql`, garantizando compatibilidad total con tipos PostgreSQL (`UUID`, `LTREE`, `JSONB`, `TIMESTAMPTZ`, `DATE`, `TIME`, `BOOLEAN`, `NUMERIC`) y con `01_creacion.sql` / `03_indices_optimizacion.sql`.

---

## 1. Archivos Exactos a Crear o Modificar

- **Crear:**
  - `src/lib/sqlSeedGenerator.ts`
  - `src/lib/sqlSeedGenerator.test.ts`
- **No modificar en este paso:** `server.ts`, `src/main.ts`, `src/views/*`, `public/supabase/queries/*`.

---

## 2. Reglas Técnicas Clave

1. **Serialización Segura PostgreSQL (`formatSqlLiteral`):**
   - `null` / `undefined` → `NULL`.
   - `boolean` → `TRUE` | `FALSE`.
   - `number` → literal numérico finito (o `NULL` si `NaN`/`Infinity`).
   - `Date` / ISO timestamps (`TIMESTAMPTZ`, `DATE`, `TIME`) → cadena `'...'` normalizada.
   - `ltree` (`ruta_materializada`) → `'...'::ltree`.
   - `jsonb` (`old_data`, `new_data`) → `'...'::jsonb` escapando comillas simples (`''`).
   - `text` / `varchar` → escape estándar PostgreSQL (`'` → `''`; si contiene `\n` o `\r`, usar `E'...'` escapando `\`, `'`, `\n`, `\r`, `\t` o string estándar cuidando **jamás introducir pares `$$` desbalanceados** en la salida).

2. **Generación de Sentencias Idempotentes por Tipo de Tabla (`buildTableSyncStatements`):**
   - **Caso 1 — Fila activa (`deleted_at === null` o tabla sin `deleted_at`) con índice único parcial o PK:**
     - Emite `INSERT INTO public.<tabla> (<cols>) VALUES (...) ON CONFLICT <conflictClauseActive> DO UPDATE SET <updatableCols = EXCLUDED.col>, updated_at = NOW();` (si la tabla tiene `updated_at`, `deleted_at = NULL`, `deleted_by = NULL` donde corresponda).
     - Si una tabla tiene además un segundo índice único parcial (ej. `grupo_empresarial`: `codigo_grupo`, `LOWER(TRIM(nombre))` y `LOWER(TRIM(abreviacion))`; o `organizacion_version`: `es_version_actual = TRUE` y `version_numero`), planificar la resolución segura previa en caso de renombramiento (ver regla 3) para impedir errores `23505`.
   - **Caso 2 — Fila archivada lógicamente (`deleted_at !== null` en tabla soft-delete):**
     - **PROHIBIDO emitir `DELETE FROM`** (bloqueado por `fn_prevent_hard_delete()`).
     - Emite `INSERT INTO public.<tabla> (...) VALUES (...) ON CONFLICT (id) DO UPDATE SET ..., deleted_at = EXCLUDED.deleted_at, deleted_by = EXCLUDED.deleted_by [, delete_reason = EXCLUDED.delete_reason];`.
   - **Caso 3 — Tablas M:N puras (`pure_mn_link` como `requisitos_por_proceso`, `norma_auditor`, `sector_iaf_auditor`, `subsector_iaf_auditor`, `sector_iaf_experto`, `subsector_iaf_experto`):**
     - Inserta vínculos faltantes con `INSERT INTO ... ON CONFLICT (<pk>) DO NOTHING;`.
     - Cuando una sección completa está sincronizada y existen vínculos M:N obsoletos respecto a la BD en vivo para los padres sincronizados, genera `DELETE FROM public.<tabla> WHERE ...;` acotado exclusivamente a los padres presentes en la sincronización (para reflejar cláusulas removidas de un proceso, por ejemplo).

3. **Manejo Seguro de Campos Mutados con Índices Únicos (ej. `numero_certificado`, `nombre_proceso`):**
   - Si en BD un registro con mismo `id` cambió su llave única natural (ej. `numero_certificado` de `'OLD-001'` a `'NEW-001'`), o si su nombre coincide con otro registro previamente archivado:
     - El comparador marca la fila como `updated` por `id` (PK) y la actualización debe corregir el registro original (Paso 1.3) o emitir un `UPDATE public.<tabla> SET ... WHERE id = '<uuid>';` previo al `INSERT ... ON CONFLICT` si hace falta, evitando colisiones `23505` en PK o índice único.

4. **Ordenamiento Auto-Referencial y Triggers (`sortRowsForTopologicalInsert`):**
   - Para tablas auto-referenciales (`requisito.id_requisito_padre`, `programa_auditoria.id_ciclo_origen`), ordena padres antes que hijos mediante BFS/toposort sobre las filas reales.
   - Para `certificado` + `certificado_version` y `organizacion` + `organizacion_version`: emite primero el registro padre base y luego sus versiones (respetando que las versiones históricas `es_version_actual = FALSE` se inserten antes o junto con `es_version_actual = TRUE` para activar limpiamente `trg_sincronizar_cache_*`).

5. **Resúmenes Zero-UUID para UI (`SyncDiffSummary`):**
   - Calcula estadísticas limpias sin exponer UUIDs en etiquetas legibles (`table`, `tableLabelEs`, `toInsert`, `toUpdate`, `toArchiveOrDelete`, `unchanged`, `sampleLabels: string[]` usando nombres/códigos como `"FN-SST-2026-201"` o `"Calidad y SHE"`).

---

## 3. Checklist de Verificación

- [ ] `formatSqlLiteral` escapa correctamente comillas, saltos de línea, `ltree`, `jsonb`, booleanos y `NULL`, manteniendo `$$` balanceado en todo fragmento generado.
- [ ] Ninguna tabla protegida por soft-delete genera `DELETE FROM`.
- [ ] Las tablas M:N (`requisitos_por_proceso`, `*_auditor`, `*_experto`) generan `ON CONFLICT (...) DO NOTHING` + limpieza segura acotada de vínculos removidos.
- [ ] El comparador distingue con precisión filas `sin_cambios`, `nuevas` y `modificadas`.
- [ ] Ejecución exitosa de `npx tsx --test src/lib/sqlSeedGenerator.test.ts` y `npm run lint`.
