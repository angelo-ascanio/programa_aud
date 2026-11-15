# Step 2.3: Bloque `Extra` — `sector_iaf` y Entidad Hija `subsector_iaf`

## 1. Objetivo
Migrar **`sector_iaf`** y elevar a **`subsector_iaf`** a ciudadanos completos de la arquitectura canónica (`Multi View Clean List` + `Detail View 'read' | 'add' | 'edit'`), reemplazando el modal de creación `#newSubsectorModalBtn` por un flujo de Detail View contextual vinculado con su Sector IAF padre.

---

## 2. Brechas Detectadas en los Archivos Actuales
1. **`src/views/sectorIafView.ts` (864 líneas):**
   - Multi View tiene columna `acciones` (`Ver Detalle →`), carece de `tableId`, `defaultWidthPct`, `minWidthPx` y `getRowAttrs`.
   - Grid no hace clicable la tarjeta completa.
   - Sin `+ Nuevo Sector IAF` ni modo `'add' | 'edit'` en el Detail View del Sector.
   - Verifica `isStaff` solo por `role` (sin `status === 'APPROVED'`).
   - La pestaña `subsectores` solo ofrece el modal `#newSubsectorModalBtn` para crear subsectores y **no permite abrir la ficha de detalle de un `subsector_iaf`**, editar su código/descripción/riesgo, cambiar su `id_sector_iaf` ni archivarlo con `archive_record`.
2. **Esquema SQL (`public/supabase/queries/01_creacion.sql`):**
   - `public.sector_iaf`: `id`, `sector INTEGER NOT NULL`, `deleted_at`, `deleted_by`, `delete_reason`. *(Nota: la descripción humana del Sector IAF en la app proviene del catálogo enriquecido o tabla derivada en `extraDomain.ts`; solo `sector` es columna directa en PostgreSQL).*
   - `public.subsector_iaf`: `id`, `id_sector_iaf UUID NOT NULL REFERENCES sector_iaf(id) ON DELETE RESTRICT`, `codigo VARCHAR(10) NOT NULL`, `descripcion TEXT NOT NULL`, `categoria_riesgo VARCHAR(20) NOT NULL DEFAULT 'MEDIO' CHECK (categoria_riesgo IN ('ALTO', 'MEDIO', 'BAJO'))`, `deleted_at`, `deleted_by`, `delete_reason`.

---

## 3. Archivos Objetivo
1. `src/lib/extraDomain.ts`
2. `src/views/sectorIafView.ts`
3. `src/views/subsectorIafView.ts` *(nuevo)*
4. `src/views/extraView.ts`
5. `src/main.ts` (estado `subsectorDomain` dentro de `extraDomain`, cascadas/filtros, handlers CRUD y breadcrumb `'subsector_iaf'`)

---

## 4. Contratos de Dominio (`src/lib/extraDomain.ts`)

```ts
export type SectorIafDetailMode = 'read' | 'add' | 'edit';
export type SubsectorIafDetailMode = 'read' | 'add' | 'edit';

export interface SectorIafFormDraft {
  sector: string; // entero positivo 1..99
}

export interface SubsectorIafFormDraft {
  id_sector_iaf: string;
  codigo: string; // max 10 chars, ej: "17.1"
  descripcion: string; // requerido
  categoria_riesgo: 'ALTO' | 'MEDIO' | 'BAJO';
}
```
- **Validadores puros:**
  - `validateSectorIafDraft(draft, existingSectors, excludeId?)`: número entero `>= 1 && <= 99`, único entre sectores activos.
  - `validateSubsectorIafDraft(draft, existingSubsectors, excludeId?)`: `assertValidUuid(draft.id_sector_iaf)`, `codigo` requerido ≤ 10 chars y único dentro del mismo `id_sector_iaf`, `descripcion` requerida, `categoria_riesgo` en `['ALTO', 'MEDIO', 'BAJO']`.

---

## 5. Especificación de Vistas

### 5.1 `src/views/sectorIafView.ts`
- **Multi View (`tableId: 'extra-sectores-main'`):**
  - Columnas (`100%`): `sector` (16%), `descripcion` (34%), `nivel_riesgo` (14%), `subsectores_count` (14%), `certificados_count` (12%), `auditores_count` (10%). Eliminar columna `acciones`.
  - `getRowAttrs` en tabla y `data-action="select-sector-iaf"` en tarjetas Grid.
  - CTA `+` (`open-create-sector-iaf`) visible solo para `isApprovedStaffProfile(profile)`.
- **Detail View (`'read' | 'add' | 'edit'`):**
  - Cabecera: `renderDetailFormTopActions` (`#saveSectorIafFormBtn` primero, `#cancelEditSectorIafBtn` segundo).
  - `isCreateMode: mode === 'add'` oculta `🕒`, `🗄️` y Zona 3.
  - Zona 2 (`#sectorIafDetailForm`): campo numérico entero `sector` (validado sin ceros negativos ni duplicados) + vista previa de descripción técnica asociada. Sin botones al pie.
  - Zona 3 (solo `'read' | 'edit'`):
    - Pestaña **`subsectores`**: `renderListViewTable` (`tableId: 'sector-tab-subsectores'`, suma 100%) con `getRowAttrs` → `data-action="select-subsector-iaf" data-subsector-id="..."` y botón `+ Nuevo Sub-Sector IAF` en la cabecera de la pestaña que navega directo a `subsectorIafView` en modo `'add'` con `id_sector_iaf` preseleccionado. **Eliminar modal `#newSubsectorModalBackdrop`.**
    - Pestañas `acreditaciones`, `certificados` y `auditores` renderizadas con `renderListViewTable` limpio.

### 5.2 Nueva Vista `src/views/subsectorIafView.ts`
- **Detail View (`'read' | 'add' | 'edit'`):**
  - Puede abrirse desde la pestaña `subsectores` de `sector_iaf` (o desde un listado auxiliar en `Extra`).
  - Cabecera: `renderDetailFormTopActions` (`#saveSubsectorFormBtn` primero, `#cancelEditSubsectorBtn` segundo).
  - **Zona 1 (`customParentZoneHtml`):**
    - `'read'`: chip `DetailParentChip` clicable hacia el `Sector IAF` padre (`navAction` → `sector_iaf`).
    - `'add' | 'edit'`: tarjeta `<select form="subsectorDetailForm" id="subsectorSelectSector">` con lista ordenada de `SectorIafEntity` activos.
  - **Zona 2 (`#subsectorDetailForm`):**
    - `codigo` (`input text`, `maxlength="10"`, requerido `*`).
    - `categoria_riesgo` (`select`: `BAJO` / `MEDIO` / `ALTO`, requerido `*`).
    - `descripcion` (`textarea` completo, requerido `*`).
    - Cero botones al pie; errores inline; toast flotante `showFloatingToast`.
  - **Zona 3 (oculta en `'add'`):**
    - Pestañas resumen de impacto (read-only): `certificados` (`certificado.id_subsector_iaf`) y `auditores` (`subsector_iaf_auditor`) usando `renderListViewTable` con navegación hacia Certificado o Auditor.

---

## 6. Persistencia y Cascada en Tiempo Real (`src/main.ts`)
- Al insertar/actualizar/archivar un `sector_iaf` o `subsector_iaf`:
  - Sincronizar `state.domainData.iafSectors` e `state.domainData.iafSubsectors` de inmediato para que las cascadas `id_sector_iaf → id_subsector_iaf` en `certificadoView` y `competenciaAuditor` reflejen el catálogo vivo sin recargar página.
  - Archivo lógico de `subsector_iaf` invoca `get_archive_dependency_summary('subsector_iaf', id)` (bloqueado por SQL si tiene certificados activos) y `archive_record('subsector_iaf', id, reason)`.

---

## 7. Verificación de Step 2.3
- Verificar que `#newSubsectorModalBtn` y el modal de creación ya no existen en `sectorIafView.ts` ni en `main.ts`.
- Probar flujo completo: `Sector IAF` → `+ Nuevo Sub-Sector` → guardar → breadcrumb `Sector IAF > Sub-Sector` → editar riesgo → volver al Sector padre y verificar conteo actualizado.
- `npx tsx --test src/lib/*.test.ts && npm run lint && npm run build`.
