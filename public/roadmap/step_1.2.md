# Step 1.2: Normalización Dual-CSV, Reparación de Códigos Truncados y Pipeline de Semillado (8 Normas / 2,188 Cláusulas / 2,684 Traducciones)

## 1. Objetivo
Construir el pipeline determinista e idempotente que ingiere `/public/requisitos/standard.clause.csv` y `/public/requisitos/standard.clause.translation.csv`, repara anomalías de exportación en los códigos, calcula las rutas `LTREE` de hasta 7 niveles, y genera tanto los datos iniciales offline como el script SQL idempotente para Supabase.

---

## 2. Hallazgos Verificados en los CSV de Origen

### 2.1 Mapeo de las 8 Normas (`standard_id/id` → `public.norma`)
| Slug CSV (`standard_id/id`) | Cláusulas | Traducciones | Código Canónico `norma.codigo` | Esquema Sugerido | UUID Canónico Determinista |
| :--- | :---: | :---: | :--- | :--- | :--- |
| `iso9001_2015` | 350 | 700 (ES+EN) | `ISO 9001:2015` | `SGC - Calidad` | `e0000000-0000-0000-0000-000000009001` *(existente)* |
| `iso14001_2015` | 205 | 410 (ES+EN) | `ISO 14001:2015` | `SGA - Gestión Ambiental` | `e0000000-0000-0000-0000-000000014001` *(existente)* |
| `iso45001_2018` | 307 | 614 (ES+EN) | `ISO 45001:2018` | `SST - Seguridad y Salud Laboral` | `e0000000-0000-0000-0000-000000045001` *(existente)* |
| `iso22000_2018` | 480 | 960 (ES+EN) | `ISO 22000:2018` | `SGIA - Inocuidad Alimentaria` | `e0000000-0000-0000-0000-000000022000` *(nuevo determinista)* |
| `iso27001_2022` | 167 | 0 *(authoring UI)* | `ISO/IEC 27001:2022` | `SGSI - Seguridad de la Información` | `e0000000-0000-0000-0000-000000027001` *(existente)* |
| `ntf4073_2022` | 138 | 0 *(authoring UI)* | `NTF 4073:2022` | `HACCP - Análisis de Peligros y PCC` | `e0000000-0000-0000-0000-000000004073` *(nuevo determinista)* |
| `iso17065_2012` | 307 | 0 *(authoring UI)* | `ISO/IEC 17065:2012` | `OEC - Certificación de Producto` | `e0000000-0000-0000-0000-000000017065` *(nuevo determinista)* |
| `iso50001_2018` | 234 | 0 *(authoring UI)* | `ISO 50001:2018` | `SGE - Gestión de la Energía` | `e0000000-0000-0000-0000-000000050001` *(nuevo determinista)* |

### 2.2 Reparación Obligatoria de 11 Códigos Truncados por Hoja de Cálculo
Durante la inspección de `standard.clause.csv` se detectaron exactamente **11 colisiones `(standard_id/id, code)`** donde códigos terminados en `.10`, `.20`, `.30`, `.40` perdieron el cero final al exportarse como número:
- **`iso45001_2018`**: `clause_iso_45001_2018_0016` (`3.1` → **`3.10`**), `..._0026` (`3.2` → **`3.20`**), `..._0039` (`3.3` → **`3.30`**).
- **`iso22000_2018`**: `clause_iso_22000_2018_0020` (`3.1` → **`3.10`**), `..._0030` (`3.2` → **`3.20`**), `..._0040` (`3.3` → **`3.30`**), `..._0050` (`3.4` → **`3.40`**).
- **`ntf4073_2022`**: `clause_ntf_4073_2022_0024` (`3.1` → **`3.10`**), `..._0034` (`3.2` → **`3.20`**).
- **`iso17065_2012`**: `clause_iso_17065_2012_0013` (`3.1` → **`3.10`**) y `..._0207` (`7.1` → **`7.10`**).

**Regla de reparación determinista:**
Cuando dentro del mismo `(standard_id, parent_id)` un código ya exista previamente y su formato termine en `\.[1-9]$`, agregar `'0'` (`3.1` → `3.10`) y verificar secuencia frente al hermano inmediatamente anterior (`3.9` → `3.10`, `3.19` → `3.20`, `7.9` → `7.10`). Esto elimina el 100% de colisiones con `uq_requisito_norma_codigo_active` y hace que `{clause_3.10}`..`{clause_3.40}` en `standard.clause.translation.csv` resuelvan exactamente al nodo correcto.

---

## 3. Entregables Técnicos del Paso

### 3.1 Módulo Puro de Parseo y Normalización (`src/lib/requisitoCsvImporter.ts`)
Implementar funciones puras tipadas (sin `any`):
1. `parseCsvRecords(csvText: string): string[][]`: parser RFC 4180 capaz de manejar saltos de línea y comillas escapadas `""` dentro de `content` HTML.
2. `normalizeCsvClauseRows(rawRows: RawCsvClauseRow[]): NormalizedClauseRecord[]`:
   - Asigna UUID determinista basado en `external_key` (respetando los 7 IDs `f0000000-...` ya referenciados por `hallazgo`, `requisitos_por_proceso` y `requisitos_no_aplicables_certificado` en `06_datos_prueba.sql` para `ISO 9001:2015` cláusulas `4`, `4.1`, `4.2`, `5`, `5.1`, `8`, `8.5`).
   - Ejecuta la reparación determinista de códigos con cero final truncado.
   - Ordena topológicamente (padres antes que hijos) y calcula `ruta_materializada` usando `computeRequisitoLtreePath(codigo, parentReq)` de `src/lib/extraDomain.ts`.
3. `normalizeCsvTranslationRows(rawRows: RawCsvTranslationRow[], clauseByExternalKey: Map<string, NormalizedClauseRecord>): NormalizedTranslationRecord[]`:
   - Mapea `base.lang_es` → `'es'` y `base.lang_en` → `'en'`.
   - Limpia el atributo propietario `<div data-oe-version="1.2">` convirtiéndolo en `<div>` semántico limpio sin alterar el texto ni los `{clause_...}`.

### 3.2 Script Generador SQL / Datos Estáticos (`scripts/buildNormasSeed.ts`)
- Lee `/public/requisitos/standard.clause.csv` y `/public/requisitos/standard.clause.translation.csv`.
- Emite `public/supabase/queries/07_normas_requisitos_csv.sql` (idempotente con `INSERT ... ON CONFLICT ... DO UPDATE`) en orden topológico para insertar/actualizar las **8 normas**, las **2,188 cláusulas** y las **2,684 traducciones**.
- Emite un bundle estático ligero o loader JSON/TS (`src/lib/generated/normasCatalogBundle.ts` o carga estática desde `/public/requisitos/`) para que el modo offline / fallback de `programa_aud` cuente con las 8 normas completas sin inflar manualmente `extraDomain.ts`.
- Actualiza `06_datos_prueba.sql` (si aplica) para evitar duplicidad de inserción con `07_normas_requisitos_csv.sql` usando `external_key` y `uq_requisito_norma_codigo_active`.

---

## 4. Criterios de Aceptación del Paso
- [ ] `normalizeCsvClauseRows` produce exactamente **2,188** registros con `(id_norma, codigo)` 100% únicos (0 colisiones).
- [ ] Todas las `ruta_materializada` generadas cumplen la sintaxis válida de `LTREE` (`^[A-Za-z0-9_]+(\.[A-Za-z0-9_]+)*$`) hasta nivel 7.
- [ ] Los IDs semilla `f0000000-...` (`4`, `4.1`, `4.2`, `5`, `5.1`, `8`, `8.5` de ISO 9001:2015) mantienen sus UUIDs históricos para no romper datos de prueba en `hallazgo` o `requisitos_por_proceso`.
- [ ] `07_normas_requisitos_csv.sql` se ejecuta en PostgreSQL de forma idempotente dejando exactamente 8 normas, 2,188 requisitos y 2,684 traducciones activas.
