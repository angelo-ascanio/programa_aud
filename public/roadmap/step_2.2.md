# Step 2.2: Contratos TypeScript, Hidratación Paginada (>1,000 filas) y Gobernanza de Persistencia (`extraDomain.ts` + `main.ts`)

## 1. Objetivo
Actualizar los modelos de dominio en `src/lib/extraDomain.ts` y la capa de hidratación/estado/archivo en `src/main.ts` para soportar las 8 normas, las 2,188 cláusulas `LTREE` (superando el límite por defecto de 1,000 filas por petición de PostgREST/Supabase) y sus traducciones bilingües `ES`/`EN`, manteniendo `0 any`, Zero-UUID y trazabilidad completa.

---

## 2. Actualización de Modelos en `src/lib/extraDomain.ts`

### 2.1 Extensión de `RequisitoLtree` y Tipos Bilingües
```ts
export interface RequisitoTranslationEntry {
  id?: string;
  id_requisito: string;
  lang: 'es' | 'en';
  title: string;
  content_html: string;
  updated_at?: string | null;
}

export interface RequisitoLtree {
  id: string;
  id_norma: string;
  norma_codigo: string;
  id_requisito_padre?: string | null;
  codigo: string;
  explicit_code?: boolean;
  titulo: string; // derivado del idioma activo ('es' preferido, fallback 'en', fallback `Cláusula ${codigo}`)
  descripcion?: string; // extracto plano sanitizado para tablas/resúmenes
  translations?: {
    es?: RequisitoTranslationEntry;
    en?: RequisitoTranslationEntry;
  };
  ruta_materializada: string;
  nivel: number;
  es_padre: boolean;
  deleted_at?: string | null;
  delete_reason?: string | null;
}
```
- **Compatibilidad hacia atrás:** `procesoDomain.ts`, `requisitos_no_aplicables_certificado` y `hallazgo` siguen leyendo `req.codigo`, `req.titulo` y `req.ruta_materializada` sin sufrir regresiones.
- **Ampliar `RequisitoFormDraft`:**
  ```ts
  export interface RequisitoFormDraft {
    id_norma: string;
    id_requisito_padre: string;
    codigo: string;
    explicit_code: boolean;
    ruta_materializada: string;
    title_es: string;
    content_html_es: string;
    title_en: string;
    content_html_en: string;
  }
  ```
- **Validadores puros (`validateRequisitoDraft`):**
  - Mantener las reglas actuales de `id_norma`, `codigo` (hasta `REQUISITO_CODIGO_MAX_LENGTH = 30`), unicidad en `(id_norma, codigo)`, prevención de ciclos con `filterValidParentRequisitos` y cálculo de `ruta_materializada`.
  - Validar y sanitizar `title_es`, `content_html_es`, `title_en`, `content_html_en` mediante `sanitizeClauseHtml()` antes de persistir.

---

## 3. Hidratación Paginada desde Supabase y Fallback Offline (`src/main.ts`)

### 3.1 Superar el Tope de 1,000 Filas de Supabase/PostgREST
Con 2,188 requisitos y 2,684 traducciones, una sola consulta `.select(...)` sin paginación se truncaría silenciosamente en la fila 1,000.
1. Implementar helper genérico tipado `fetchAllPagedRows<T>(queryFactory: (from: number, to: number) => Promise<...>, pageSize = 1000): Promise<T[]>` en `src/main.ts` (o módulo auxiliar en `src/lib/`).
2. Cargar en paralelo:
   - Todos los registros activos de `requisito` (`id, id_norma, id_requisito_padre, codigo, explicit_code, ruta_materializada`).
   - Todos los registros activos de `requisito_traduccion` (`id, id_requisito, lang, title, content_html, updated_at`) con manejo tolerante si la tabla aún no existe (`isMissingTableOrSchemaError`).
3. Indexar las traducciones por `id_requisito` en un `Map<string, { es?: RequisitoTranslationEntry; en?: RequisitoTranslationEntry }>` en `O(n)` y ensamblar `state.domainData.requirementsCatalog`.
4. **Recuento dinámico real de cláusulas por norma:** actualizar `recalculateNormaClausulaCounts()` usando los requisitos activos reales (ej. `350` en `ISO 9001:2015`, `480` en `ISO 22000:2018`) eliminando los valores fijos heredados (`normaStr.includes('9001') ? 7 : 5`).

### 3.2 Estado Reactivo para Navegación y Visualización Bilingüe
Ampliar `state.extraDomain` en `src/main.ts` y `resetClientSessionState`:
- `normaRequisitoQuery: string` (texto del buscador multinivel dentro de la pestaña `Requisitos` de `Norma` Detail View).
- `activeNormaTab: 'requisitos' | 'acreditacion' | 'certificados'` (default **`'requisitos'`**).
- `requisitoLangMode: 'es' | 'en' | 'both'` (preferencia de lectura bilingüe en `Requisito` Detail View).
- `requisitoEditorLang: 'es' | 'en'` y `requisitoEditorMode: 'visual' | 'html' | 'preview'` (estado del Rich Text Editor en `'add' | 'edit'`).

### 3.3 Archivo Lógico y Restauración (`archiveGovernance.ts` + `main.ts`)
- Asegurar que al restaurar un `requisito` archivado desde la vista de administrador se recarguen/restauren también sus entradas asociadas de `requisito_traduccion`.
- En `get_archive_dependency_summary` local (`src/lib/archiveGovernance.ts`), verificar hijos activos, hallazgos y exclusiones ISO 4.3 antes de archivar un requisito.

---

## 4. Criterios de Aceptación del Paso
- [ ] La hidratación carga las **2,188 cláusulas** y **2,684 traducciones** completas mediante paginación por rangos `.range(from, to)` sin truncamiento en la fila 1,000.
- [ ] Si `requisito_traduccion` aún no está migrada en una instancia, la app degrada sin errores de consola usando el catálogo local.
- [ ] `recalculateNormaClausulaCounts()` refleja el conteo exacto de cláusulas activas por cada una de las 8 normas.
- [ ] Cero usos de `any` y cero UUIDs expuestos en `title`, `label` o `breadcrumbs`.
