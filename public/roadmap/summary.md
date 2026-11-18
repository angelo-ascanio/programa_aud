# Roadmap Maestro: Integración Normativa Dual-CSV, Motor Recursivo de Cláusulas, Editor Enriquecido y Rediseño UX/UI de `Norma` y `Requisito`

## 1. Resumen Ejecutivo

Este roadmap define la arquitectura técnica e implementación modular por pasos para evolucionar los módulos **`Norma`** (`norma`) y **`Requisito`** (`requisito`) de **programa_aud** (Supabase PostgreSQL + Express 5 + TypeScript SPA), integrando los conjuntos de datos actualizados en `/public/requisitos/` y habilitando la autoría bilingüe directa dentro de la aplicación.

### Alcance Cuantitativo de los Datos (`/public/requisitos/`)

| Dataset | Filas | Cobertura Real Detectada | Observaciones Críticas de Arquitectura |
| :--- | :---: | :--- | :--- |
| `standard.clause.csv` | **2,188** | **8 normas** (`iso9001_2015`: 350, `iso14001_2015`: 205, `iso45001_2018`: 307, `iso22000_2018`: 480, `iso27001_2022`: 167, `ntf4073_2022`: 138, `iso17065_2012`: 307, `iso50001_2018`: 234) | Profundidad máxima de **7 niveles**, longitud máxima de `code` de **13 caracteres** (`8.5.2.4.1.b.1`), 0 ciclos, 0 padres huérfanos. Contiene **11 códigos duplicados por truncamiento de cero final** (`3.1`→`3.10`, `3.2`→`3.20`, `3.3`→`3.30`, `3.4`→`3.40`, `7.1`→`7.10`) que deben repararse antes de insertar en PostgreSQL. |
| `standard.clause.translation.csv` | **2,684** | **4 normas** pre-traducidas (`iso9001_2015`: 700, `iso14001_2015`: 410, `iso45001_2018`: 614, `iso22000_2018`: 960) en **`base.lang_es` (1,342)** y **`base.lang_en` (1,342)** | Contiene **827 tokens `{clause_...}`** únicos para composición jerárquica, etiquetas HTML (`<div>`, `<ul>`, `<li>`, `<br>`, `<a href>`), **1 fila con contenido vacío** (`iso45001_2018` `3.2` ES) y **2 referencias huérfanas** en `iso45001_2018` `9.1` (`{clause_9.1.3}`). Las 4 normas restantes (**846 cláusulas**: `27001`, `NTF 4073 / HACCP`, `17065`, `50001`) se redactarán directamente en la app. |

---

## 2. Pilares Arquitectónicos

1. **Separación Estructural vs. Contenido Bilingüe (PostgreSQL + RLS + Soft-Delete):**
   - `public.requisito` conserva exclusivamente la topología jerárquica (`id`, `id_norma`, `id_requisito_padre`, `codigo`, `ruta_materializada LTREE`, `explicit_code`, `external_key`) y todas las FK operativas (`requisitos_por_proceso`, `requisitos_no_aplicables_certificado`, `hallazgo`) más `cobertura_normativa_certificado()`.
   - Nueva tabla `public.requisito_traduccion` vinculada `N:1` a `requisito(id)` con llave única parcial `(id_requisito, lang) WHERE deleted_at IS NULL`, soportando `lang IN ('es', 'en')`, `title` y `content_html`, protegida por `fn_prevent_hard_delete()`, `audit_trigger_func()` y políticas RLS granulares (`is_approved_worker()`).

2. **Pipeline Idempotente de Normalización e Importación CSV:**
   - Reparación determinista de los 11 códigos truncados por hoja de cálculo (`3.10`, `3.20`, `3.30`, `3.40`, `7.10`) para cumplir el índice único parcial `uq_requisito_norma_codigo_active`.
   - Mapeo de los 8 estándares preservando los UUIDs canónicos existentes en `06_datos_prueba.sql` (`ISO 9001:2015`, `ISO 14001:2015`, `ISO 45001:2018`, `ISO/IEC 27001:2022`) y asignando UUIDs deterministas a los 4 nuevos estándares (`ISO 22000:2018`, `NTF 4073:2022`, `ISO/IEC 17065:2012`, `ISO 50001:2018`).
   - Cálculo top-down de `ruta_materializada LTREE` usando `computeRequisitoLtreePath()` hasta 7 niveles.

3. **Motor Recursivo de Placeholders `{clause_X.Y.Z}` y Sanitización XSS:**
   - Sanitizador HTML por lista blanca estricta (permitiendo `div`, `p`, `strong`, `em`, `ul`, `ol`, `li`, `br`, `table`, `blockquote`, `a[href^=http/https]` con `rel="noopener noreferrer"`; bloqueando scripts, eventos inline `on*` y esquemas peligrosos).
   - Resolutor recursivo en `src/lib/` con protección anti-ciclos (`visitedIds: Set<string>`, profundidad máxima acotada), fallback bilingüe controlado y degradación segura para referencias no resueltas (sin exponer UUIDs ni tokens rotos).

4. **Rediseño de `Norma` y `Requisito` (`Extra` Block):**
   - **Norma Multi View:** Directorio `table-fixed` (`<colgroup>` = 100%), facetas reactivas (`Esquema`, `Estatus`), búsqueda y redimensionamiento de columnas.
   - **Norma Detail View:** Pestaña **`Requisitos (ltree)` como primera pestaña por defecto**, mostrando **solo capítulos raíz** (`1`..`10`) por defecto para evitar inflación del DOM, acompañada de una **barra de búsqueda instantánea multinivel** que filtra en los 7 niveles tanto en `ES` como en `EN`.
   - **Requisito Detail View (`'read' | 'add' | 'edit'`):** Toggle **`ES` / `EN` / `Lado a Lado`**, renderizado expandido con indicadores visuales por sub-cláusula inyectada, **ayudantes de navegación de vecinos** (hermanos del mismo nivel), **padre e hijos directos**, y **retorno directo en un clic a la `Norma`**.

5. **Editor Rich Text HTML + Selector de Placeholders en la App (`'add' | 'edit'`):**
   - Editor HTML semántico sin dependencias externas pesadas (formato limpio, tablas, listas, notas ISO, vista de código HTML y **Vista Previa en vivo**).
   - **Selector / Autocompletado de Sub-cláusulas (`{` y botón de barra):** lista los hijos directos del requisito e inserta `{clause_<codigo>}` en la posición exacta del cursor, permitiendo redactar y mantener el contenido completo de `ISO/IEC 27001:2022`, `NTF 4073:2022`, `ISO/IEC 17065:2012` e `ISO 50001:2018` directamente en `programa_aud`.

---

## 3. Mapa de Ejecución Modular

| Paso | Archivo | Responsabilidad Única |
| :--- | :--- | :--- |
| **Step 1.1** | `public/roadmap/step_1.1.md` | DDL de `requisito` (`explicit_code`, `external_key`) + nueva tabla `requisito_traduccion`, índices, soft-delete, `audit_log` y RLS. |
| **Step 1.2** | `public/roadmap/step_1.2.md` | Normalizador CSV, reparación de 11 códigos truncados, cálculo `LTREE` de 7 niveles y generador SQL/semillero idempotente para 8 normas y 2,684 traducciones. |
| **Step 2.1** | `public/roadmap/step_2.1.md` | Sanitizador HTML allowlist, motor recursivo `{clause_...}` anti-ciclos y extractor de texto plano indexable (`src/lib/`). |
| **Step 2.2** | `public/roadmap/step_2.2.md` | Contratos TypeScript (`0 any`), hidratación paginada desde Supabase (>1,000 filas), respaldo offline y trazabilidad/archivo lógico en `main.ts`. |
| **Step 3.1** | `public/roadmap/step_3.1.md` | Pulido de `Norma` Multi View y rediseño de `Norma` Detail View (`Requisitos` tab por defecto, capítulos nivel 1 + búsqueda instantánea cross-level ES/EN). |
| **Step 3.2** | `public/roadmap/step_3.2.md` | Rediseño de `Requisito` Detail View en modo lectura: selector `ES`/`EN`/`Lado a Lado`, bloques recursivos, vecinos, padre/hijos y retorno global a `Norma`. |
| **Step 4.1** | `public/roadmap/step_4.1.md` | Componente Rich Text HTML Editor bilingüe (`ES`/`EN`), sanitización al vuelo, modo HTML fuente y Vista Previa en vivo. |
| **Step 4.2** | `public/roadmap/step_4.2.md` | Inserción contextual de placeholders `{clause_...}` (botón + trigger `{`) y persistencia transaccional `requisito` + `requisito_traduccion`. |
| **Step Final** | `public/roadmap/step_final.md` | Checklist integral de verificación SQL/RLS, `node:test`, `tsc --noEmit`, `npm run build`, Zero-UUID, Clean List y pruebas E2E en Chromium. |

---

## 4. Reglas Transversales Inamovibles
- **TypeScript estricto (`0 any`)** en todos los módulos `src/lib/` y `src/views/`.
- **Zero-UUID Exposure:** ningún UUID crudo en etiquetas visibles, breadcrumbs, placeholders ni atributos mostrados al usuario.
- **Soft-Delete y Auditoría:** prohibido `DELETE` físico; toda tabla nueva usa `deleted_at`, `deleted_by`, `fn_prevent_hard_delete()` y `audit_trigger_func()`.
- **Clean List & 3-Zone Detail:** `table-fixed`, `<colgroup>` sumando `100%`, cero `<button>` en `<tbody>`, acciones de formulario arriba (`Guardar` en esmeralda antes que `Cancelar` en rosa) y `showFloatingToast()`.
- **Aislamiento de `Auditoría`:** no modificar los flujos operativos de `programacionView.ts`, `resultadoView.ts`, `auditoriasView.ts` ni `calendarioView.ts`.
