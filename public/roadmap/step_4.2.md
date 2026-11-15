# Step 4.2: Árbol `Certificado` — `sitio` (+ `turnos_por_sitio`) y `proceso` (+ `requisitos_por_proceso`)

## 1. Objetivo
Migrar **`sitioView.ts`** y **`procesoView.ts`** al patrón canónico completo (`'read' | 'add' | 'edit'`, cabecera Guardar-primero / Cancelar-segundo, cero botones al pie, toast flotante, Zona 1 editable, y pestañas hijas limpias con `renderListViewTable` sin botones dentro de `<td>` ni banners verdes inline).

---

## 2. Brechas Detectadas en los Archivos Actuales
1. **`src/views/sitioView.ts` (655 líneas) & `src/lib/sitioDomain.ts` (431 líneas):**
   - Solo implementa `'read' | 'edit'` (`isEditingAttributes`), sin modo `'add'`.
   - En `'edit'`, mantiene botones al pie (`Cancelar` y `💾 Guardar Cambios`) y deja `Certificado` estático en Zona 1.
   - Renderiza banners verdes inline (`saveSuccessMessage`, `shiftActionMessage`).
   - Pestaña `turnos` usa un `<table>` HTML crudo (`overflow-x-auto`) con botón `Desvincular` dentro de `<td>`, y un formulario inline `#assignSitioTurnoForm`.
   - Pestaña `auditorias` usa `<table>` HTML crudo sin `renderListViewTable`.
   - **Regla de negocio crítica:** Protección de Sede Central `numero_sitio === 0` (no archivable si aplica y cálculo automático de `siguiente_numero_sitio` al agregar sucursal, o `0` si aún no existe sede central).
   - **SQL:** `public.sitio` (`id_certificado`, `numero_sitio INTEGER CHECK (numero_sitio >= 0)`, `nombre_sitio`, `direccion_sitio`); `public.turnos_por_sitio` (`id`, `id_sitio`, `id_turno`, `deleted_at`, `deleted_by` — soportado en `archive_record`).
2. **`src/views/procesoView.ts` (769 líneas) & `src/lib/procesoDomain.ts` (609 líneas):**
   - Solo implementa `'read' | 'edit'`, sin modo `'add'`.
   - En `'edit'`, tiene botones al pie (`Cancelar`, `💾 Guardar Cambios`) y banners verdes inline (`saveSuccessMessage`, `requisitoActionMessage`).
   - Pestaña `requisitos` usa `<table>` HTML crudo con botón `Quitar` dentro de `<td>` y formulario inline `#assignProcesoRequisitoForm`.
   - Pestañas `hallazgos` y `auditorias` usan `<table>` crudo sin `renderListViewTable`.
   - **SQL:** `public.proceso` (`id_certificado`, `nombre_proceso`, `tipo CHECK IN ('Estratégico', 'Medular', 'De Apoyo', 'Otro')`); `public.requisitos_por_proceso` (`PRIMARY KEY (id_proceso, id_requisito)` — tabla M:N pura con `INSERT` / `DELETE`).

---

## 3. Archivos Objetivo
1. `src/lib/sitioDomain.ts`
2. `src/views/sitioView.ts`
3. `src/lib/procesoDomain.ts`
4. `src/views/procesoView.ts`
5. `src/views/certificadoView.ts` (botones `+ Nueva Sede` en `cert-tab-sitios` y `+ Nuevo Proceso` en `cert-tab-procesos`)
6. `src/views/certificacionView.ts`
7. `src/main.ts` (handlers `'add'|'edit'` de `sitio` y `proceso`, desvinculación/asignación de `turnos_por_sitio` y `requisitos_por_proceso`, breadcrumbs `'sitio'` y `'proceso'`)

---

## 4. Contratos de Dominio

### 4.1 `sitio` (`src/lib/sitioDomain.ts`)
```ts
export type SitioDetailMode = 'read' | 'add' | 'edit';

export interface SitioFormDraft {
  id_certificado: string;
  numero_sitio: string; // entero >= 0
  nombre_sitio: string; // max 150, requerido
  direccion_sitio: string; // requerido
}
```
- Eliminar `saveSuccessMessage` y `shiftActionMessage` de `SitioViewState` (migrar ambos a `showFloatingToast`).
- Añadir `isCreating?: boolean`, `suggestNextNumeroSitio(sites)` (retorna `0` si el certificado no tiene Sede Central, o `max(numero_sitio) + 1` en caso contrario).
- Validar que no se repita `numero_sitio` entre sedes activas del mismo `id_certificado` ni se degrade la única Sede `0` si tiene dependencias dependientes.

### 4.2 `proceso` (`src/lib/procesoDomain.ts`)
```ts
export type ProcesoDetailMode = 'read' | 'add' | 'edit';

export interface ProcesoFormDraft {
  id_certificado: string;
  nombre_proceso: string; // max 150, requerido
  tipo: 'Estratégico' | 'Medular' | 'De Apoyo' | 'Otro';
}
```
- Eliminar `saveSuccessMessage` y `requisitoActionMessage` de `ProcesoViewState`.
- Añadir `isCreating?: boolean`, `resolveProcesoDetailMode(state, isStaff, selectedProceso)`.
- Al asignar `requisitos_por_proceso`, mantener filtrado estricto a los requisitos de la **Norma del Certificado padre** (`cert.id_norma`).

---

## 5. Diseño de Vistas

### 5.1 `src/views/sitioView.ts`
- **Cabecera:** `renderDetailFormTopActions` (`#saveSitioFormBtn` primero, `#cancelEditSitioBtn` segundo), `isCreateMode: mode === 'add'`.
- **Zona 1 (`customParentZoneHtml`):**
  - `'read'`: chip `Organización` + chip `Certificado` (`navAction` → `cert`, tab `sitios`).
  - `'add' | 'edit'`: `<select form="sitioDetailForm" id="sitioSelectCertificado">` (preseleccionado al abrir desde `cert-tab-sitios` y recalculando sugerencia de `numero_sitio` si se cambia en `'add'`).
- **Zona 2 (`#sitioDetailForm`):** `numero_sitio`, `nombre_sitio`, `direccion_sitio`. Sin botones al pie, sin banner verde.
- **Zona 3 (oculta si `isCreateMode`):**
  - **Pestaña `turnos`:** Renderizar `turnos_por_sitio` con `renderListViewTable` (`tableId: 'sitio-tab-turnos'`, `getRowAttrs` → `select-turno-preview`) **sin botones dentro de `<td>`**. Gestionar vinculación/desvinculación de turnos mediante panel limpio de selección en cabecera de pestaña (`+ Vincular Turno` / selector controlado) o desde `turnoView`, confirmando con `showFloatingToast`.
  - **Pestaña `auditorias`:** `renderListViewTable` (`tableId: 'sitio-tab-auditorias'`, enlace read-only).

### 5.2 `src/views/procesoView.ts`
- **Cabecera:** `renderDetailFormTopActions` (`#saveProcesoFormBtn` primero, `#cancelEditProcesoBtn` segundo), `isCreateMode: mode === 'add'`.
- **Zona 1 (`customParentZoneHtml`):**
  - `'read'`: chip `Organización` + chip `Certificado` (`navAction` → `cert`, tab `procesos`) + chip `Norma` (`navAction` → `norma`).
  - `'add' | 'edit'`: `<select form="procesoDetailForm" id="procesoSelectCertificado">`.
- **Zona 2 (`#procesoDetailForm`):** `nombre_proceso`, `tipo` (`Estratégico` | `Medular` | `De Apoyo` | `Otro`). Sin botones al pie, sin banner verde.
- **Zona 3 (oculta si `isCreateMode`):**
  - **Pestaña `requisitos`:** `renderListViewTable` (`tableId: 'proceso-tab-requisitos'`, suma 100%, clic en fila → `requisitoView` `'read'`), eliminando el botón `Quitar` dentro de `<td>`. Para vincular/desvincular cláusulas de la Norma del Certificado sin contaminar `<tbody>`, usar el selector/panel controlado de cobertura en cabecera de pestaña o acciones multi-selección limpias fuera de `<td>`, confirmando con `showFloatingToast`.
  - **Pestañas `hallazgos` y `auditorias`:** `renderListViewTable` (`tableId: 'proceso-tab-hallazgos'`, `'proceso-tab-auditorias'`, enlaces read-only).

### 5.3 Conexión desde `src/views/certificadoView.ts`
- Cabecera de `cert-tab-sitios`: botón `+ Nueva Sede` (`data-action="open-create-sitio" data-cert-id="..."`) para Staff aprobado.
- Cabecera de `cert-tab-procesos`: botón `+ Nuevo Proceso` (`data-action="open-create-proceso" data-cert-id="..."`) para Staff aprobado.

---

## 6. Verificación de Step 4.2
- Verificar que `sitioView.ts` y `procesoView.ts` no contienen `<table>` HTML crudo ni botones en `<td>` ni banners verdes inline.
- Probar flujo: `Certificado > Sitios > + Nueva Sede` → crear Sede #1 → verificar toast flotante y regreso/actualización en certificado.
- `npx tsx --test src/lib/sitioDomain.test.ts src/lib/procesoDomain.test.ts src/lib/*.test.ts && npm run lint && npm run build`.
