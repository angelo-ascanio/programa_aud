# Step 3.2: Bloque `Certificación` — `auditor` y Matrices de Competencias M:N (`norma_auditor`, `sector_iaf_auditor`, `subsector_iaf_auditor`)

## 1. Objetivo
Migrar **`auditor`** al patrón canónico Multi View Clean List + Detail View (`'read' | 'add' | 'edit'`), y reemplazar el stub modal `[data-action="open-add-competency-modal"]` por la gestión real persistida en Supabase de las tres tablas de unión de competencias técnicas: **`norma_auditor`**, **`sector_iaf_auditor`** y **`subsector_iaf_auditor`** (con cascada viva `Sector IAF` → `Sub-Sector IAF`).

---

## 2. Brechas Detectadas en los Archivos Actuales
1. **`src/views/auditorView.ts` (923 líneas):**
   - **Multi View:** Renderiza `renderCreateAuditorForm()` inline cuando `state.isCreating === true`.
   - **Tabla:** Incluye columna `acciones` (`Ver Ficha →`), carece de `tableId`, `defaultWidthPct` (suma 100), `minWidthPx` y `getRowAttrs`.
   - **Grid:** Tarjetas usan botón inferior en lugar de contenedor clicable completo.
   - **Detail View (`#editAuditorForm`):** Mantiene botones inferiores (`Cancelar`, `💾 Guardar`), renderiza banner verde inline `saveSuccessMessage`/`createSuccessMessage` y carece de modo `'add'`.
   - **Pestaña `competencias`:** El botón `open-add-competency-modal` en `src/main.ts` (líneas 7903–7910) **solo asigna un texto estático a `saveSuccessMessage`** y no abre formulario ni persiste en Supabase.
2. **Esquema SQL M:N (`public/supabase/queries/01_creacion.sql` & `04_rls.sql`):**
   - `public.auditor`: `id`, `nombre VARCHAR(150) NOT NULL`, `deleted_at`, `deleted_by`, `delete_reason`.
   - `public.norma_auditor`: PK compuesta `(id_auditor, id_norma)`. RLS permite `SELECT`, `INSERT` (`is_approved_worker()`), `DELETE` (`is_approved_worker()`).
   - `public.sector_iaf_auditor`: PK compuesta `(id_auditor, id_sector_iaf)`. RLS permite `SELECT`, `INSERT`, `DELETE`.
   - `public.subsector_iaf_auditor`: PK compuesta `(id_auditor, id_subsector_iaf)`, `created_at`. RLS permite `SELECT`, `INSERT`, `DELETE`.
   - *Nota importante:* Como las tres tablas de unión son tablas M:N puras con PK compuesta y sin columna `deleted_at`, **la desvinculación de competencias usa `DELETE` controlado** (no `archive_record`), mientras que **`auditor`** sí usa `archive_record('auditor', id, reason)`.

---

## 3. Archivos Objetivo
1. `src/lib/competencyMatrix.ts` (contratos `AuditorDetailMode`, `AuditorFormDraft`, `CompetenciaAuditorFormDraft`, motor puro de cascada `sector_iaf` → `subsector_iaf` y validadores)
2. `src/views/auditorView.ts`
3. `src/views/competenciaAuditorView.ts` *(nuevo — Detail/Alta contextual para asignar/inspeccionar competencias del auditor)*
4. `src/views/certificacionView.ts`
5. `src/main.ts` (carga de `norma_auditor`, `sector_iaf_auditor`, `subsector_iaf_auditor` desde Supabase + mutaciones CRUD y cascada en vivo + breadcrumb `'competencia_auditor'`)

---

## 4. Contratos de Dominio (`src/lib/competencyMatrix.ts`)

```ts
export type AuditorDetailMode = 'read' | 'add' | 'edit';
export type CompetenciaAuditorMode = 'read' | 'add';

export interface AuditorFormDraft {
  nombre: string; // max 150, requerido
}

export type CompetenciaTipo = 'norma' | 'sector_iaf' | 'subsector_iaf';

export interface CompetenciaAuditorFormDraft {
  id_auditor: string;
  tipo: CompetenciaTipo;
  id_norma: string;         // requerido si tipo === 'norma'
  id_sector_iaf: string;    // requerido si tipo === 'sector_iaf' o para filtrar subsector
  id_subsector_iaf: string; // requerido si tipo === 'subsector_iaf'
}
```
- **Motor puro de cascada para competencias (`applyCompetenciaSectorCascade`):**
  - Al cambiar `id_sector_iaf` en `'add'` con `tipo === 'subsector_iaf'`, filtrar `subsectores` por `id_sector_iaf` y limpiar `id_subsector_iaf` si el actual no pertenece al sector elegido (idéntico a `applySectorIafCascadeToDraft` de `certificado`).
- **Validador puro (`validateCompetenciaDraft`):**
  - Valida UUIDs reales (Cero-UUID).
  - Previene insertar una tupla `(id_auditor, target_id)` duplicada que ya exista en la matriz del auditor.

---

## 5. Diseño de Vistas

### 5.1 `src/views/auditorView.ts`
- **Eliminar por completo** `renderCreateAuditorForm()`.
- **Multi View (`tableId: 'cert-auditores-main'`):**
  - Columnas (`100%`): `nombre` (28%), `normas_acreditadas` (28%), `sectores_iaf` (26%), `auditorias_count` (18%). Sin columna `acciones`.
  - `getRowAttrs` en tabla y clic completo en tarjeta Grid (`data-action="select-auditor"`).
  - CTA `+` (`open-create-auditor`) solo para Staff aprobado.
- **Detail View (`'read' | 'add' | 'edit'`):**
  - Cabecera: `renderDetailFormTopActions` (`#saveAuditorFormBtn` primero, `#cancelEditAuditorBtn` segundo), `isCreateMode: mode === 'add'`.
  - Zona 2 (`#auditorDetailForm`): `nombre` (`*`, `maxlength="150"`), con visualización de resumen de calificaciones en `'read'`. Sin botones al pie, sin banner verde inline.
  - Zona 3 (oculta si `isCreateMode`):
    - **Pestaña `competencias`:** Renderiza tres secciones limpias o sub-tablas `renderListViewTable` (`auditor-tab-normas`, `auditor-tab-sectores`, `auditor-tab-subsectores`) con fila clicable hacia la competencia o hacia la Norma / Sector / Sub-Sector, y botón **`+ Asignar Competencia`** en la cabecera de la pestaña que navega a `competenciaAuditorView` en modo `'add'` con `id_auditor` preseleccionado.
    - **Pestaña `historial`:** `renderListViewTable` (`auditor-tab-historial`) con enlaces read-only hacia `auditorias`.

### 5.2 Nueva Vista `src/views/competenciaAuditorView.ts`
- **Detail View (`'read' | 'add'`):** *(Las tablas M:N puras no tienen columnas editables intermedias — solo alta o baja/desvinculación)*:
  - En `'add'`:
    - Cabecera: `renderDetailFormTopActions` (Guardar `#saveCompetenciaBtn` primero, Cancelar `#cancelCompetenciaBtn` segundo).
    - Zona 1 (`customParentZoneHtml`): Selector de `Auditor` (`id_auditor`, preseleccionado y modificable).
    - Zona 2 (`#competenciaAuditorDetailForm`): Selector de `tipo` (`Norma ISO` | `Sector IAF` | `Sub-Sector IAF`), y selectores en vivo según `tipo`:
      - Si `norma`: `<select id="compSelectNorma">`.
      - Si `sector_iaf`: `<select id="compSelectSector">`.
      - Si `subsector_iaf`: `<select id="compSelectSector">` + cascada en vivo `<select id="compSelectSubsector">` filtrado por el sector seleccionado.
  - En `'read'`: muestra Zona 1 con chips hacia `Auditor` y hacia la `Norma` / `Sector IAF` / `Sub-Sector IAF` correspondiente; botón superior de desvinculación controlada (`🗑️ Desvincular competencia`, con confirmación segura y solo para `isApprovedStaffProfile`).

---

## 6. Persistencia Supabase y `src/main.ts`
- **Carga en `loadDomainData()`:** asegurar lectura real de `norma_auditor`, `sector_iaf_auditor` y `subsector_iaf_auditor` hidratando `allAuditorsDetailed` (sin fallback a IDs inventados en mutaciones).
- **Alta Competencia:**
  - `supabase.from('norma_auditor').insert({ id_auditor, id_norma })`
  - `supabase.from('sector_iaf_auditor').insert({ id_auditor, id_sector_iaf })`
  - `supabase.from('subsector_iaf_auditor').insert({ id_auditor, id_subsector_iaf })`
- **Desvinculación Competencia:** `.delete().match({ id_auditor, id_... })` autorizado por políticas `*_delete_worker` en `04_rls.sql`.
- **Feedback:** Exclusivamente `showFloatingToast(..., 'success')` y regreso limpio al auditor origen (`backtrackToParentBreadcrumb()`).

---

## 7. Verificación de Step 3.2
- Verificar eliminación de `renderCreateAuditorForm` y del stub en líneas 7903–7910 de `src/main.ts`.
- Probar cascada `Sector IAF` → `Sub-Sector IAF` al asignar `subsector_iaf_auditor` y persistencia real tras recargar.
- `npx tsx --test src/lib/competencyMatrix.test.ts src/lib/*.test.ts && npm run lint && npm run build`.
