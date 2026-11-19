# Step 2.3: `Vínculo` — Vista UI (`vinculoView.ts`), Submenú Anidado `Designación` (`header.ts`, `auditoriasView.ts`) y `src/main.ts`

## 1. Identificador, Nombre y Dependencias
* **Step ID:** `2.3`
* **Nombre Corto (UI):** `Vínculo`
* **Bloque / Sub-sección:** Bloque 1 — `Auditoría` → `Vínculo` + Shell de Navegación del Bloque 1 con grupo anidado `Designación = { Tipo, Sitio, Temporal }`
* **Dependencias:** `step_2.1.md`, `step_2.2.md`, `step_1.3.md`

---

## 2. Alcance Exacto y Reglas de Negocio
1. **Reestructuración Completa del Menú `Auditoría` (`header.ts`, `healthCheck.ts`, `accessControl.ts`, `breadcrumb.ts`):**
   * Reemplazar los 3 ítems actuales (`scheduling`, `calendar`, `findings`) por la jerarquía exacta de nombres de 1 palabra:
     * `vinculo` → **`Vínculo`** (`#/auditorias/vinculo`)
     * `designacion` *(Grupo de 3er nivel desplegable/acordeón)* → **`Designación`**:
       * `designacion/tipo` → **`Tipo`** (`#/auditorias/designacion/tipo`)
       * `designacion/sitio` → **`Sitio`** (`#/auditorias/designacion/sitio`)
       * `designacion/temporal` → **`Temporal`** (`#/auditorias/designacion/temporal`)
     * `tiempo` → **`Tiempo`** (`#/auditorias/tiempo`)
     * `asignacion` → **`Asignación`** (`#/auditorias/asignacion`)
     * `programa` → **`Programa`** (`#/auditorias/programa`)
     * `calendar` → **`Calendario`** (`#/auditorias/calendar`)
     * `resultado` → **`Resultado`** (`#/auditorias/resultado`)
     * `revision` → **`Revisión`** (`#/auditorias/revision`)
   * Alias de compatibilidad hacia atrás en `normalizeDomainSubview('auditorias', ...)`: `'scheduling' -> 'vinculo'`, `'findings' -> 'resultado'`.
2. **Dos Sub-Modos / Pestañas de Trabajo dentro de `Vínculo` (`vinculoView.ts`):**
   * **Vista Principal (`vínculos`):** Clean List `table-fixed` de vínculos configurados (`Individual` y `Vinculado`) con facet `Tiene Sitio Temporal`, `Nivel / Naturaleza`, `Conglomerado`.
   * **Cola Rápida `"Certificados Libres (N)"` (Conteo visible + Filtro Directo):** Permite ver inmediatamente todos los certificados en estado `LIBRE` dentro de su conglomerado y ejecutar en 1–2 clics **"Pasar a Individual"** o **"Crear / Unir a Vínculo Grupal"**.
3. **Toggle `tiene_sitio_temporal` en Creación/Edición de Vínculo:** Checkbox claro *"Este vínculo incluye al menos un sitio temporal / proyecto"* (`BOOLEAN`).
4. **Detail View del Vínculo (`'read' | 'add' | 'edit'`):**
   * Zone 1: Chip navegable al `Conglomerado` padre (`#/certificacion/conglomerados`).
   * Zone 2: Etiqueta, Nivel, Naturaleza (`Individual`..`Mixta`), Flag `Sitio Temporal`, Notas.
   * Zone 3 (Tabs):
     * `certificados`: Lista de certificados vinculados + acción **"Desvincular certificado (volver a Libre)"** (solo `ADMIN`/`WORKER`, valida `canDetachCertificateFromVinculo`) y **"Agregar certificado Libre del mismo Conglomerado"**.
     * `campanias`: Campañas/Auditorías programadas bajo este vínculo + botón directo **"Ir a Paso 3: Designación → Tipo →"** (`#/auditorias/designacion/tipo`).

---

## 3. Cambios Exactos en Base de Datos
Ninguno adicional (hidrata `public.vinculo` y `public.vinculo_certificado` desde Supabase).

---

## 4. Contratos de Enrutamiento y Navegación (`healthCheck.ts`, `accessControl.ts`, `breadcrumb.ts`)

### 4.1 `src/lib/healthCheck.ts`
Extender `DomainNavItem`:
```typescript
export interface DomainNavItem {
  id: string;
  label: string;
  symbol?: string;
  children?: ReadonlyArray<DomainNavItem>;
}
```
Definir `AUDITORIAS_NAV_ITEMS`:
```typescript
export const AUDITORIAS_NAV_ITEMS: ReadonlyArray<DomainNavItem> = [
  { id: 'vinculo', label: 'Vínculo', symbol: '🔗' },
  {
    id: 'designacion',
    label: 'Designación',
    symbol: '🧭',
    children: [
      { id: 'designacion/tipo', label: 'Tipo', symbol: '🏷️' },
      { id: 'designacion/sitio', label: 'Sitio', symbol: '📍' },
      { id: 'designacion/temporal', label: 'Temporal', symbol: '⏱️' },
    ],
  },
  { id: 'tiempo', label: 'Tiempo', symbol: '⏳' },
  { id: 'asignacion', label: 'Asignación', symbol: '👥' },
  { id: 'programa', label: 'Programa', symbol: '📋' },
  { id: 'calendar', label: 'Calendario', symbol: '🗓️' },
  { id: 'resultado', label: 'Resultado', symbol: '📊' },
  { id: 'revision', label: 'Revisión', symbol: '✅' },
];
```

### 4.2 `src/lib/accessControl.ts`
```typescript
export const VALID_DOMAIN_SUBVIEWS: Record<DomainRoute, ReadonlyArray<string>> = {
  auditorias: [
    'vinculo',
    'designacion/tipo',
    'designacion/sitio',
    'designacion/temporal',
    'tiempo',
    'asignacion',
    'programa',
    'calendar',
    'resultado',
    'revision',
  ],
  certificacion: ['conglomerados', 'organizations', 'certificates', 'auditors'],
  extra: ['standards', 'iaf', 'estatus', 'tipos', 'metodologias', 'organismos', 'accreditations'],
};
```
Actualizar `normalizeDomainSubview('auditorias', raw)` para preservar `'designacion/tipo'`, `'designacion/sitio'`, `'designacion/temporal'`, y mapear `'scheduling'` → `'vinculo'`, `'findings'` → `'resultado'`, `'designacion'` → `'designacion/tipo'`.

### 4.3 `src/main.ts` (`parseHashRoute`)
En `parseHashRoute()`:
```typescript
const rest = parts.slice(1).join('/') || null; // soporta 'designacion/tipo'
```

---

## 5. Orquestación UI y Estado (`src/views/header.ts`, `auditoriasView.ts`, `vinculoView.ts`, `main.ts`)

### 5.1 Renderizado del Submenú de 3er Nivel en `src/views/header.ts`
* Dentro del dropdown `#auditorias`, cuando un `DomainNavItem` tenga `children`:
  * Renderizar botón padre `"🧭 Designación ▸"` (`aria-expanded`) que despliega un sub-panel indentado (mobile & desktop) o flyout lateral en desktop `lg:` con las 3 opciones (`Tipo`, `Sitio`, `Temporal`).
  * Resaltar tanto el padre `Designación` como la subopción activa cuando `activeSubSection` inicia con `'designacion/'`.

### 5.2 Columnas `table-fixed` + `<colgroup>` en `vinculoView.ts` (`tableId: 'vinculo-main'`)

| `col.id` | `header` | `defaultWidthPct` | `minWidthPx` | Contenido Celda |
| :--- | :--- | :---: | :---: | :--- |
| `etiqueta` | `Vínculo` | `30%` | `185` | Etiqueta + Código vínculo (`VIN-...`) |
| `conglomerado` | `Conglomerado` | `22%` | `140` | Nombre del `grupo_empresarial` |
| `naturaleza` | `Tipo y Nivel` | `20%` | `135` | Badge `Individual` vs `Nivel 1/2 · Naturaleza` |
| `certificados` | `Certificados` | `16%` | `120` | Conteo `N cert(s)` + códigos truncados |
| `temporal` | `Sitio Temp.` | `12%` | `95` | Badge `Sí (Temporal)` o `No` |
| **Total** | | **`100%`** | | **0 botones dentro de `<td>`** |

*(Para la vista paralela "Certificados Libres", usar tabla `vinculo-libres` con `<colgroup>` `24%` Certificado · `28%` Organización · `22%` Conglomerado · `14%` Norma · `12%` Estatus = `100%`, seleccionable por fila/checkbox para acción masiva superior `"Vincular Seleccionados"` / `"Marcar Individual"`).*

### 5.3 Estado en `src/main.ts`
```typescript
export interface VinculoViewState {
  activeSubMode: 'vinculos' | 'libres';
  query: string;
  viewMode: UniversalViewMode;
  isSidebarOpen: boolean;
  sortColumn: 'etiqueta' | 'conglomerado' | 'naturaleza' | 'certificados' | null;
  sortDirection: SortDirection;
  facetSelections: MultiViewSelectionMap;
  selectedVinculoId: string | null;
  activeChildTab: 'certificados' | 'campanias';
  isCreating: boolean;
  isEditingAttributes: boolean;
  formDraft?: VinculoFormDraft;
  editErrorMessage: string | null;
  selectedFreeCertIdsForBatch: string[];
}
```
* Hidratar `allVinculos: VinculoEntity[]` en `hydrateFromSupabase()`.
* Actualizar `auditoriasView.ts` para enrutar limpiamente los 10 subviews del Bloque 1 y renderizar la **Barra Pipeline Stepper** superior compartida.

---

## 6. Matriz RBAC del Paso 2.3

| Rol | Menú `Auditoría` visible | Crear/Editar Vínculo & Convertir `LIBRE` | Desvincular Certificados |
| :--- | :--- | :--- | :--- |
| **`ADMIN`** | Todos los pasos (10 sub-ítems incl. `Designación`) | Sí | Sí (+ Archivar/Restaurar) |
| **`WORKER`** | Todos los pasos | Sí | Sí (+ Archivar) |
| **`AUDITOR`** | Solo vínculos donde tiene auditorías asignadas | No (solo lectura) | No |
| **`CLIENT`** | Solo vínculos de sus organizaciones (ocultando otras orgs Nivel 2) | No (solo lectura) | No |

---

## 7. Pruebas Automatizadas (`src/lib/accessControl.test.ts` + `src/lib/vinculoDomain.test.ts`)
1. `parseHashRoute()` / `normalizeDomainSubview()` resuelve correctamente `#/auditorias/designacion/tipo`, `#/auditorias/designacion/sitio`, `#/auditorias/designacion/temporal` y redirige `#/auditorias/scheduling` → `vinculo`.
2. `renderHeader()` genera el grupo anidado `Designación` con `Tipo`, `Sitio` y `Temporal`.
3. `renderVinculoView()` suma `100%` en `<colgroup>`, cero `<button` en `<tbody>`, y muestra conteo exacto de certificados `LIBRE`.

---

## 8. Criterios de Aceptación (Done Criteria)
- [ ] Menú `Auditoría` muestra `Vínculo`, `Designación > { Tipo, Sitio, Temporal }`, `Tiempo`, `Asignación`, `Programa`, `Calendario`, `Resultado`, `Revisión`.
- [ ] Filtro `Certificados Libres` permite seleccionar un certificado libre y convertirlo en `Individual` o `Vinculado` sin salir de `Vínculo`.
- [ ] Flag `tiene_sitio_temporal` editable en `Vínculo` y persistido en Supabase.
- [ ] `tsc --noEmit` y suite de tests pasan sin errores.
