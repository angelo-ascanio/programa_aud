# Step 2.2: Bloque `Extra` — `organismo_acreditacion` y `acreditacion_norma_iaf`

## 1. Objetivo
1. Crear la experiencia completa **Multi View + Detail View (`'read' | 'add' | 'edit'`)** para **`organismo_acreditacion`** (actualmente inexistente como vista independiente).
2. Refactorizar **`acreditacionView.ts`** para eliminar el formulario inline de creación dentro del directorio (`renderCreateAcreditacionForm`), eliminar botones al pie del formulario y banners verdes inline, quitar `<button>` en celdas `<tbody>` y hacer editables los selectores padre (`id_organismo`, `id_norma`, `id_sector_iaf`) en la Zona 1 durante `'add' | 'edit'`.

---

## 2. Brechas Detectadas en los Archivos Actuales
1. **`organismo_acreditacion` sin vista propia (`src/lib/acreditacionDomain.ts`, `src/views/acreditacionView.ts`):**
   - Solo existe el tipo `OrganismoAcreditacion` (`id`, `codigo`, `nombre`, `pais`, `sitio_web`) y selección inline dentro de `renderCreateAcreditacionForm`.
   - El chip padre `Organismo` en `acreditacionView.ts` (línea ~754) carece de `navAction`, dejando al usuario sin posibilidad de inspeccionar, crear, editar o archivar un organismo acreditador.
2. **`src/views/acreditacionView.ts` (1240 líneas):**
   - **Multi View:** Renderiza `renderCreateAcreditacionForm` inline encima de la lista cuando `state.isCreating === true`.
   - **Tabla:** Columna `numero_acreditacion` envuelve un `<button>` dentro de `<td>`; falta `tableId`, `defaultWidthPct` (suma 100), `minWidthPx` y `getRowAttrs` de fila completa.
   - **Grid:** Tarjetas usan `<button>` `Ver Ficha Completa →` al pie en vez de clic completo en tarjeta (`data-action="select-accreditation"`).
   - **Detail View:**
     - Usa `customTopActionsHtml` solo parcialmente o botones al pie (`#cancelEditAcreditacionBtnSecondary`, `💾 Guardar Cambios`).
     - Renderiza banner verde inline `saveSuccessMessage` y `createSuccessMessage`.
     - En `'edit'`, mantiene `id_organismo`, `id_norma` e `id_sector_iaf` bloqueados como chips de lectura (`DetailParentChip`) en Zona 1 en lugar de renderizar tarjetas `<select form="acreditacionDetailForm">`.
   - **SQL (`public/supabase/queries/01_creacion.sql`):**
     - `organismo_acreditacion`: `codigo VARCHAR(20) NOT NULL`, `nombre VARCHAR(255) NOT NULL`, `pais VARCHAR(100) NOT NULL`, `sitio_web VARCHAR(255)` (opcional).
     - `acreditacion_norma_iaf`: `id_organismo UUID NOT NULL`, `id_norma UUID NOT NULL`, `id_sector_iaf UUID` (nullable para acreditaciones transversales sin sector específico), `numero_acreditacion VARCHAR(100) NOT NULL`, `fecha_concesion DATE NOT NULL`, `fecha_vencimiento DATE`, `estatus VARCHAR(30) NOT NULL DEFAULT 'Activa'`.

---

## 3. Archivos Objetivo
1. `src/lib/acreditacionDomain.ts`
2. `src/views/organismoAcreditacionView.ts` *(nuevo)*
3. `src/views/acreditacionView.ts`
4. `src/views/extraView.ts` y `src/views/headerView.ts` / navegación sub-sección (`accreditations` + acceso contextual a `organismos`)
5. `src/main.ts` (`extraDomain`, carga/mutación de `organismo_acreditacion` y `acreditacion_norma_iaf`, breadcrumbs `'organismo_acreditacion'` y `'accreditation'`)

---

## 4. Contratos de Dominio (`src/lib/acreditacionDomain.ts`)

### 4.1 `organismo_acreditacion`
```ts
export type OrganismoDetailMode = 'read' | 'add' | 'edit';

export interface OrganismoFormDraft {
  codigo: string;   // max 20, requerido
  nombre: string;   // max 255, requerido
  pais: string;     // max 100, requerido
  sitio_web: string; // max 255, opcional, URL válida si no vacío
}

export interface OrganismoViewState {
  selectedOrganismoId: string | null;
  activeChildTab: 'acreditaciones';
  query: string;
  viewMode: 'grid' | 'list';
  sortColumn: string | null;
  sortDirection: SortDirection;
  isSidebarOpen?: boolean;
  facetSelections?: MultiViewSelectionMap;
  isCreating?: boolean;
  isEditingAttributes?: boolean;
  formDraft?: OrganismoFormDraft;
  editErrorMessage?: string | null;
}
```
- Validación pura `validateOrganismoDraft(draft, existing, excludeId?)`: `codigo` único case-insensitive, longitud ≤ 20, `nombre` y `pais` obligatorios, `sitio_web` con esquema `http://` o `https://` si se informa.

### 4.2 `acreditacion_norma_iaf`
```ts
export type AcreditacionDetailMode = 'read' | 'add' | 'edit';

export interface AcreditacionFormDraft {
  id_organismo: string;
  id_norma: string;
  id_sector_iaf: string; // '' permitido (representa cobertura general / NULL)
  numero_acreditacion: string;
  fecha_concesion: string;
  fecha_vencimiento: string; // '' permitido (NULL en BD)
  estatus: 'Activa' | 'Suspendida' | 'Vencida' | 'Retirada';
}
```
- Reemplazar `CreateAcreditacionInput` y `EditAcreditacionInput` bifurcados por un único contrato `AcreditacionFormDraft` + `createEmptyAcreditacionFormDraft(prefill?)` + `createAcreditacionDraftFromEntity(entity)` + `validateAcreditacionDraft(draft)`.
- Validación Cero-UUID en `id_organismo`, `id_norma` y (cuando no vacío) `id_sector_iaf`.
- Validación cronológica: si `fecha_vencimiento` está definida, debe ser `>= fecha_concesion`.

---

## 5. Diseño de Vistas

### 5.1 Nueva Vista `src/views/organismoAcreditacionView.ts`
- **Multi View (`tableId: 'extra-organismos-main'`):**
  - Columnas Clean List (`100%`): `codigo` (16%), `nombre` (34%), `pais` (20%), `sitio_web` (16%), `acreditaciones_count` (14%).
  - Tarjeta Grid clicable (`data-action="select-organismo"`), fila tabla clicable (`getRowAttrs`).
  - CTA `+` (`open-create-organismo`) solo Staff aprobado.
- **Detail View (`'read' | 'add' | 'edit'`):**
  - Cabecera: `renderDetailFormTopActions` (Guardar `#saveOrganismoFormBtn` primero, Cancelar `#cancelEditOrganismoBtn` segundo).
  - Zona 1: `[]` (entidad raíz).
  - Zona 2 (`#organismoDetailForm`): `codigo`, `nombre`, `pais`, `sitio_web` (enlace externo en `'read'` solo si comienza con `http(s)://`, input controlado en `'add'|'edit'`), cero botones al pie.
  - Zona 3 (oculta si `isCreateMode`): pestaña `acreditaciones` (`renderListViewTable`, `tableId: 'org-accred-tab-acreditaciones'`, `getRowAttrs` → `select-accreditation`) con botón `+ Nueva Acreditación` en cabecera que navega a `acreditacionView` en modo `'add'` preseleccionando `id_organismo`.

### 5.2 Overhaul `src/views/acreditacionView.ts`
- **Eliminar por completo** `renderCreateAcreditacionForm()` y el render condicional en Multi View.
- **Multi View (`tableId: 'extra-acreditaciones-main'`):**
  - Columnas (`100%`): `numero_acreditacion` (18%), `organismo` (18%), `norma` (18%), `sector_iaf` (22%), `estatus` (12%), `vigencia` (12%). Sin `<button>` en celdas `<td>`.
  - CTA `+` (`open-create-acreditacion`) en `actionsHtml` navega directo a Detail `'add'` con breadcrumb `createNewEntityBreadcrumbSegment({ entityType: 'accreditation', ... })`.
  - En Multi View `Acreditaciones`, incluir un acceso rápido en `actionsHtml` (o pestaña/sub-navegador dentro de `Extra > Acreditaciones`) hacia el directorio de **`Organismos de Acreditación`** (`subview: 'organismos'`), además de mantener el chip padre clicable.
- **Detail View (`'read' | 'add' | 'edit'`):**
  - **Zona 1 (`customParentZoneHtml`):**
    - En `'read'`: 3 chips clicables `DetailParentChip`: `Organismo` (`navAction` → `organismo_acreditacion`), `Norma` (`navAction` → `norma`), `Sector IAF` (`navAction` → `sector_iaf` cuando `id_sector_iaf` exista).
    - En `'add' | 'edit'`: 3 tarjetas `<select form="acreditacionDetailForm">`: `id_organismo` (obligatorio `*`), `id_norma` (obligatorio `*`), `id_sector_iaf` (opcional — opción vacía `"Transversal / Todos los sectores"`).
  - **Zona 2 (`#acreditacionDetailForm`):** `numero_acreditacion`, `estatus`, `fecha_concesion`, `fecha_vencimiento`. Sin botones al pie y sin banner verde `saveSuccessMessage`.
  - **Zona 3 (oculta si `isCreateMode`):** Pestañas `certificados` y `subsectores` usando `renderListViewTable`.

---

## 6. Persistencia Supabase y `src/main.ts`
- `organismo_acreditacion`: `.insert({ codigo, nombre, pais, sitio_web: sitio_web || null })` y `.update(...)`; archivo vía `archive_record('organismo_acreditacion', id, reason)` (protegido por `get_archive_dependency_summary` si tiene `acreditacion_norma_iaf` activas).
- `acreditacion_norma_iaf`: `.insert(...)` / `.update(...)` validando UUIDs de `id_organismo`, `id_norma` y opcional `id_sector_iaf`; confirmación exclusiva con `showFloatingToast(..., 'success')`.

---

## 7. Verificación de Step 2.2
- Verificar eliminación de `renderCreateAcreditacionForm` en `src/views/acreditacionView.ts`.
- Verificar flujo bidireccional: `Organismo` → `Acreditación` → chip `Organismo` → regreso por breadcrumb.
- `npx tsx --test src/lib/acreditacionDomain.test.ts src/lib/*.test.ts && npm run lint && npm run build`.
