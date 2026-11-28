# Paso 2.1 — Caso Especial `Extra → Norma` sobre `07_normas_requisitos_csv.sql`

> **Objetivo:** Implementar el sincronizador especializado para **`Extra → Norma`** (`norma`, `requisito`, `requisito_traduccion`), respetando el archivo dedicado `public/supabase/queries/07_normas_requisitos_csv.sql`, la jerarquía auto-referencial `LTREE`, los 7 UUIDs históricos, los overrides `obligatorio_origen = 'MANUAL'` y las traducciones bilingües HTML ES/EN.

---

## 1. Archivos Exactos a Crear o Modificar

- **Crear:**
  - `src/lib/sqlNormasSeedSync.ts`
  - `src/lib/sqlNormasSeedSync.test.ts`
- **No modificar en este paso:** `public/supabase/queries/07_normas_requisitos_csv.sql`, `scripts/buildNormasSeed.ts`, `server.ts`, `src/main.ts`, `src/views/*`.

---

## 2. Reglas Técnicas Clave

1. **Separación de Destino SQL (`07_normas_requisitos_csv.sql` vs `06_datos_prueba.sql`):**
   - Cuando el administrador selecciona **`Extra → Norma`** (individualmente o al seleccionar todo el bloque **`Extra`**), el destino principal de `norma`, `requisito` y `requisito_traduccion` es **`public/supabase/queries/07_normas_requisitos_csv.sql`**.
   - Si en la misma operación también se sincronizan tablas de `06_datos_prueba.sql` que referencian `id_norma` (como `acreditacion_norma`, `certificado`, `norma_auditor`) y existen normas nuevas creadas en BD, el motor puede asegurar también el respaldo FK mínimo o advertir el orden de ejecución (`07` o `norma` previa; recordar que en reset `00→07`, `06` se ejecuta **antes** que `07`! *Nota arquitectónica vital:* revisar si `06` ya inserta las 8 normas base y `07` hace `ON CONFLICT (codigo) DO UPDATE` — por lo tanto, si el usuario crea una **norma nueva #9** desde UI `Extra → Norma` y la usa en certificados/acreditaciones de `06`, `06_datos_prueba.sql` necesita la fila base de esa norma #9 o un stub idempotente si `certificado`/`acreditacion_norma` la referencia, mientras `07_normas_requisitos_csv.sql` contiene la definición completa de la norma, sus requisitos y traducciones).

2. **Estructura Idempotente de `07_normas_requisitos_csv.sql` (`buildNormas07SqlDocument`):**
   - Mantener la estructura canónica compatible con `scripts/buildNormasSeed.ts`:
     - Bloque 1: `INSERT INTO public.norma (id, codigo, norma, esquema, titulo, estatus, fecha_publicacion, deleted_at) ... ON CONFLICT (codigo) WHERE deleted_at IS NULL DO UPDATE SET ...`.
     - Bloque 2: `INSERT INTO public.requisito (...)` agrupado por lotes deterministas (ej. lotes de 100–250 filas), **ordenado estrictamente por nivel/profundidad (`nivel ASC`, padres antes que hijos)** para satisfacer `id_requisito_padre REFERENCES requisito(id)` y con `ruta_materializada::ltree`.
     - Manejo correcto de `es_obligatorio` y `obligatorio_origen`: si en la base viva una cláusula fue marcada como `'MANUAL'` (`obligatorio_origen = 'MANUAL'`), el archivo `07` generado desde BD **refleja el valor real vigente en BD** (`es_obligatorio` y `obligatorio_origen = 'MANUAL'`), conservando además la regla `DO UPDATE` segura en futuras re-ejecuciones.
     - Bloque 3: `INSERT INTO public.requisito_traduccion (id, id_requisito, lang, title, content_html, deleted_at) ... ON CONFLICT (id_requisito, lang) WHERE deleted_at IS NULL DO UPDATE SET ...`.
   - Manejo de registros archivados (`deleted_at IS NOT NULL`) en `norma`, `requisito` o `requisito_traduccion`: usar `ON CONFLICT (id) DO UPDATE SET deleted_at = EXCLUDED.deleted_at, deleted_by = EXCLUDED.deleted_by, ...` sin emitir `DELETE FROM`.

3. **Preservación de Contratos Históricos:**
   - Verifica antes de escribir que los **7 UUIDs históricos ISO 9001:2015** referenciados en `06_datos_prueba.sql` y `src/lib/requisitoCsvImporter.ts` permanezcan intactos si siguen presentes en BD.
   - Reutiliza las reglas de validación `LTREE` (`LTREE_PATH_PATTERN`) y formato HTML seguro.
   - Calcula `SyncDiffSummary` comparando los registros de `07_normas_requisitos_csv.sql` actual contra los registros vivos de `norma`, `requisito` y `requisito_traduccion` (conteo de normas, cláusulas y traducciones nuevas/modificadas/archivadas).

4. **Nota sobre `normasCatalogBundle.ts`:**
   - El paso documenta en el resultado (y advertencia opcional no bloqueante en UI) que `07_normas_requisitos_csv.sql` quedó actualizado desde la BD viva, mientras `scripts/buildNormasSeed.ts` sigue disponible si se actualizan los CSV originales.

---

## 3. Checklist de Verificación

- [ ] `sqlNormasSeedSync.ts` detecta con precisión cambios en `norma`, `requisito` (incl. `es_obligatorio` / `obligatorio_origen = 'MANUAL'`) y `requisito_traduccion` (ediciones ES/EN HTML).
- [ ] El SQL generado para `07_normas_requisitos_csv.sql` ordena todos los requisitos padres antes que hijos y castea `ruta_materializada::ltree`.
- [ ] Se preservan los 7 UUIDs históricos y cero `DELETE FROM` sobre `norma`, `requisito` o `requisito_traduccion`.
- [ ] Los tests existentes `src/lib/requisitoCsvImporter.test.ts` siguen compatibles con la estructura generada.
- [ ] Ejecución exitosa de `npx tsx --test src/lib/sqlNormasSeedSync.test.ts` y `npm run lint`.
