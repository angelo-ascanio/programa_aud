# Paso 1.1: Esquema `sitio.personal_count`, Acreditaciones/Turnos Base y Pre-Sembrado `06`↔`07` de Cláusulas Normativas

**Dependencias:** Ninguna (primer paso de la ejecución).
**Objetivo:** Preparar la base estructural en SQL (`01_creacion.sql`, `06_datos_prueba.sql`) y el cableado mínimo TypeScript para soportar dotación real de personal por sede, un catálogo completo de hasta 6 turnos estándar, acreditaciones completas y cláusulas deterministas `06`↔`07` que permitan alcanzar el 100% de cobertura normativa sin conflictos ni fallos de FK.

---

## 1. Cambios en Esquema SQL (`public/supabase/queries/01_creacion.sql`)

1. **Columna `personal_count` en `public.sitio`:**
   - Localizar la definición de `CREATE TABLE IF NOT EXISTS public.sitio` (alrededor de las líneas 718–729).
   - Agregar la columna:
     ```sql
     personal_count INTEGER NOT NULL DEFAULT 10 CHECK (personal_count BETWEEN 1 AND 50000),
     ```
   - Verificar que `audit_trigger_func()` y `fn_sync_soft_delete_metadata()` sigan operando sin requerir cambios adicionales.
   - Asegurar que ninguna prueba de `src/lib/phase11SqlMigration.test.ts`, `src/lib/step101SqlSchema.test.ts` ni `src/lib/phase12RlsHardening.test.ts` falle tras agregar esta columna.

---

## 2. Sincronización TypeScript de `sitio.personal_count` (`src/**`)

Actualizar la lectura, validación y persistencia de `personal_count` en la capa de aplicación:
1. **`src/lib/sitioDomain.ts`:**
   - Asegurar que `SitioFormDraft` y `validateSitioFormDraft()` acepten y validen `personal_count` como entero positivo (`1`..`50000`, valor por defecto `10` si no se envía en borradores heredados).
   - Mapear `personal_count` en `resolveSitioDetailById()` desde los datos de BD con prioridad sobre cualquier fallback local.
2. **`src/views/sitioView.ts` y `src/views/certificadoView.ts`:**
   - Incluir campo numérico `personal_count` (`Personal asignado`) en el formulario de creación/edición de Sede y garantizar que `certificadoView.ts` (pestaña `Sitios`) muestre el valor real persistido en BD.
3. **`src/main.ts`:**
   - En las consultas `.from('sitio').select(...)` (líneas ~29006 y ~29739), incluir `personal_count`.
   - En los `.insert(...)` y `.update(...)` sobre `public.sitio` (líneas ~16242 y ~16384), persistir `personal_count: normSitio.personal_count`.
   - En la hidratación de `baseSitios` (línea ~29396), priorizar `dbSite.personal_count ?? seedSite?.personal_count`.

---

## 3. Catálogos y Pre-Sembrado de Cláusulas en `public/supabase/queries/06_datos_prueba.sql`

### 3.1 Acreditaciones faltantes (Sección `-- 8.`)
Completar `public.acreditacion_norma` y `public.acreditacion_norma_sector_iaf` para cubrir todas las normas activas del escenario:
- Mantener intactas `dc00...0001` (`ENAC` / `01/C-SC001` / ISO 9001), `dc00...0002` (`UKAS` / `0044-EMS` / ISO 14001) y `dc00...0003` (`ANAB` / `ANAB-ISMS-089` / ISO/IEC 27001).
- Agregar acreditación para `ISO 45001:2018` (`dc00...0004` con `ENAC` o `ANAB`, ej. `'ANAB-OHS-112'`, sector IAF `17` y `03`) y para `ISO 22000:2018` (`dc00...0005`, sector IAF `03`), usando `ON CONFLICT (id) DO UPDATE` y `ON CONFLICT (id_acreditacion_norma, id_sector_iaf) WHERE deleted_at IS NULL DO NOTHING`.

### 3.2 Catálogo de 6 Turnos Estándar (Sección `-- 15.`)
Ampliar `public.turno` (tabla única por par `hora_entrada`, `hora_salida` con índice parcial `WHERE deleted_at IS NULL`) para disponer de **6 turnos reales** combinables por certificado/sitio (1 a 6 turnos por certificado según complejidad operativa):
1. `'70000000-0000-0000-0000-000000000001'` → `'07:00:00'` – `'15:00:00'` (Turno Matutino Operativo)
2. `'70000000-0000-0000-0000-000000000002'` → `'15:00:00'` – `'23:00:00'` (Turno Vespertino Operativo)
3. `'70000000-0000-0000-0000-000000000003'` → `'23:00:00'` – `'07:00:00'` (Turno Nocturno Continuo)
4. `'70000000-0000-0000-0000-000000000004'` → `'08:00:00'` – `'17:00:00'` (Turno Administrativo y Comercial)
5. `'70000000-0000-0000-0000-000000000005'` → `'06:00:00'` – `'14:00:00'` (Turno Temprano de Recepción y Despacho)
6. `'70000000-0000-0000-0000-000000000006'` → `'07:00:00'` – `'19:00:00'` (Turno Especial Guardia / Mantenimiento Extendido)

> Verificar que `ON CONFLICT (hora_entrada, hora_salida) WHERE deleted_at IS NULL DO NOTHING` permanezca exacto y que si algún turno existente usaba `7000...0003` en `multisiteSampling.ts` se alinee sin colisiones.

### 3.3 Pre-Sembrado Determinista de Cláusulas Base `06`↔`07` (Sección `-- 9.`)
Debido a que `06_datos_prueba.sql` corre antes que `07_normas_requisitos_csv.sql`, las cláusulas referenciadas por `requisitos_por_proceso` y `requisitos_no_aplicables_certificado` deben existir al finalizar la Sección `-- 9.` de `06_datos_prueba.sql`.
1. **Conservar los 7 UUIDs históricos de `ISO 9001:2015`** (`f000...0004`, `...0041`, `...0042`, `...0005`, `...0051`, `...0008`, `...0085`), manteniendo intactos los `external_key` `'clause_iso_9001_2015_0006'` y `'clause_iso_9001_2015_0244'` exigidos por `src/lib/requisitoCsvImporter.test.ts`.
2. **Pre-sembrar con UUIDs, `id_requisito_padre`, `ruta_materializada` y `external_key` tomados literalmente de `07_normas_requisitos_csv.sql`:**
   - **ISO 9001:2015 (`e000...9001`):** capítulos `6`, `7`, `9`, `10` y todas las subcláusulas nivel 2 requeridas (`4.3`, `4.4`, `5.2`, `5.3`, `6.1`–`6.3`, `7.1`–`7.5`, `8.1`, `8.2`, **`8.3`** [`a15db0ef-de9f-45a1-a680-ce2d6916d18a`], `8.4`, `8.6`, `8.7`, `9.1`–`9.3`, `10.1`–`10.3`).
   - **ISO 14001:2015 (`e000...14001`):** capítulos `4`–`10` y sus subcláusulas nivel 2 (`4.1`–`4.4`, `5.1`–`5.3`, `6.1`–`6.2`, `7.1`–`7.5`, `8.1`–`8.2`, `9.1`–`9.3`, `10.1`–`10.3`).
   - **ISO 45001:2018 (`e000...45001`):** capítulos `4`–`10` y sus subcláusulas nivel 2 (`4.1`–`4.4`, `5.1`–`5.4`, `6.1`–`6.2`, `7.1`–`7.5`, `8.1`–`8.2`, `9.1`–`9.3`, `10.1`–`10.3`).
   - *(Opcional si algún certificado usa SGSI)* **ISO/IEC 27001:2022 (`e000...27001`):** capítulos `4`–`10` y subcláusulas nivel 2.
3. Usar `ON CONFLICT (id_norma, codigo) WHERE deleted_at IS NULL DO UPDATE SET id_requisito_padre = EXCLUDED.id_requisito_padre, ruta_materializada = EXCLUDED.ruta_materializada, explicit_code = EXCLUDED.explicit_code, external_key = EXCLUDED.external_key, es_obligatorio = EXCLUDED.es_obligatorio, updated_at = NOW();` para que `07_normas_requisitos_csv.sql` no genere duplicados ni cambie ningún `id` al ejecutarse después.

---

## 4. Criterios de Verificación del Paso 1.1

- [ ] `01_creacion.sql` contiene `personal_count INTEGER NOT NULL DEFAULT 10 CHECK (personal_count BETWEEN 1 AND 50000)` en `public.sitio`.
- [ ] Ejecución secuencial `00` → `07` en PostgreSQL finaliza con `0` errores y `SELECT COUNT(*) FROM public.requisito` conserva exactamente `2,188` filas sin duplicados.
- [ ] `SELECT COUNT(*) FROM public.turno WHERE deleted_at IS NULL` retorna `6`.
- [ ] `npm run lint`, `npm run build` y `npm test` pasan sin errores de tipos (`0 any`).
