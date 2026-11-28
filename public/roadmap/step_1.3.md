# Paso 1.3 — Reconciliación Incremental Segura de `06_datos_prueba.sql`

> **Objetivo:** Crear el módulo encargado de leer `public/supabase/queries/06_datos_prueba.sql`, extraer las filas semilla existentes, detectar con exactitud qué falta o cambió respecto a PostgreSQL en vivo y aplicar una actualización quirúrgica + bloque administrado idempotente sin destruir bloques `DO $$`, comentarios históricos ni tests unitarios existentes.

---

## 1. Archivos Exactos a Crear o Modificar

- **Crear:**
  - `src/lib/sqlSeedFileUpdater.ts`
  - `src/lib/sqlSeedFileUpdater.test.ts`
- **No modificar en este paso:** `public/supabase/queries/06_datos_prueba.sql` (solo lectura en tests), `server.ts`, `src/main.ts`, `src/views/*`.

---

## 2. Reglas Técnicas Clave

1. **Indexación Segura de Filas Existentes en `06_datos_prueba.sql` (`parseExistingSqlSeedRecords`):**
   - Analiza las sentencias `INSERT INTO [public.]<tabla> (<cols>) VALUES ...` presentes en `06_datos_prueba.sql` (soportando valores multilínea, comillas escapadas `''`, `E'...'`, casts `::uuid`, `::ltree`, `::jsonb`, `NOW()`, y secciones dentro o fuera de `DO $$`).
   - Construye un índice en memoria por tabla:
     - Mapa por `id` (cuando la columna `id` es explícita y literal UUID).
     - Mapa por llave natural (`naturalKeys` de `sqlSeedSyncCatalog.ts`) para detectar registros insertados sin UUID literal o mediante `DO $$`.
   - Registra las ubicaciones (offset de inicio/fin de tupla o bloque) de cualquier bloque administrado previo delimitado por marcadores:
     ```sql
     -- [ADMIN_SYNC_BEGIN:<block_or_table_key>]
     ...
     -- [ADMIN_SYNC_END:<block_or_table_key>]
     ```

2. **Estrategia Dual de Sincronización (`applyDatabaseSyncTo06Sql`):**
   - **Fase A — Actualización de registros ya declarados en `06_datos_prueba.sql`:**
     - Si una fila viva en BD coincide por `id` (o llave natural única) con una tupla explícita en `06_datos_prueba.sql` y alguno de sus campos sincronizados cambió (ej. `numero_certificado`, `personal_count`, `nombre_proceso`, `estatus`, `deleted_at`), el reconciliador puede actualizar esa tupla de forma segura **o** emitir un bloque determinista de actualización por `id` (`UPDATE public.<tabla> SET ... WHERE id = '...' AND (... IS DISTINCT FROM ...);`) inmediatamente antes de nuevos inserts, evitando así colisiones `23505` contra las llaves antiguas en re-ejecuciones limpias `00 → 07`.
     - *Regla crítica para índices únicos parciales mutados:* Si en `06_datos_prueba.sql` existe `INSERT ... VALUES ('<uuid-A>', 'OLD-NUM', ...)` y luego se cambió a `'NEW-NUM'`, actualizar la tupla o preceder/reemplazar en la sección administrada garantiza que la BD final tras `00 → 07` tenga `'NEW-NUM'` y no queden conflictos ni regresiones en segundas corridas.
   - **Fase B — Sección Sincronizada Ordenada Topológicamente (`ADMIN_SYNC`):**
     - Todos los registros faltantes (nuevas organizaciones, certificados, sitios, procesos, cláusulas `requisitos_por_proceso`, turnos, auditorías, hallazgos, expertos, etc.) se escriben ordenados topológicamente Padre → Hijo dentro de bloques claramente etiquetados por bloque/sección (`-- [ADMIN_SYNC_BEGIN:...] ... -- [ADMIN_SYNC_END:...]`).
     - Re-ejecutar el sincronizador **reemplaza de forma idempotente** el bloque administrado correspondiente (sin acumular sentencias repetidas ni inflar el archivo en cada clic).

3. **Preservación de Invariantes y Validación Pre-Escritura (`validateUpdatedSeedSql`):**
   - Antes de devolver el contenido nuevo de `06_datos_prueba.sql`, verifica automáticamente:
     - Conteo par de delimitadores `$$` (`(sql.match(/\$\$/g) ?? []).length % 2 === 0`).
     - Conservación íntegra de secciones base (`1.` a `29.`) y bloques `DO $$` existentes fuera de las regiones administradas.
     - Ausencia de `DELETE FROM` sobre las 57 tablas protegidas por `fn_prevent_hard_delete()`.
     - Sintaxis básica balanceada de paréntesis y punto y coma al final de bloques agregados.

4. **Soporte de Vista Previa (`previewDatabaseSyncTo06Sql`):**
   - Ejecuta exactamente la misma lógica sin mutar archivos y retorna: `nextSqlContent`, `changed: boolean`, `summaryByTable`, `diffSnippets` (fragmentos SQL legibles de los cambios propuestos) y `warnings`.

---

## 3. Checklist de Verificación

- [ ] `parseExistingSqlSeedRecords` indexa correctamente las tablas clave presentes actualmente en `public/supabase/queries/06_datos_prueba.sql` (incluyendo sección 29 Nestlé y bloque `experto_tecnico`).
- [ ] Sincronizar dos veces el mismo estado produce resultado idéntico (`changed === false` en la segunda pasada, sin duplicar filas ni bloques).
- [ ] Modificar un campo existente (ej. `numero_certificado` o `personal_count`) y agregar un hijo (ej. nuevo `proceso` + `requisitos_por_proceso`) genera un parche válido, sin `DELETE` en tablas protegidas y con conteo `$$` par.
- [ ] Todos los tests existentes que inspeccionan `06_datos_prueba.sql` (`step101SqlSchema.test.ts`, `phase11SqlMigration.test.ts`, `phase12RlsHardening.test.ts`, `expertoSeedInvariants.test.ts`, `vinculoDomain.test.ts`, `conglomeradoDomain.test.ts`, `revisionDomain.test.ts`) seguirían pasando con la salida transformada.
- [ ] Ejecución exitosa de `npx tsx --test src/lib/sqlSeedFileUpdater.test.ts` y `npm run lint`.
