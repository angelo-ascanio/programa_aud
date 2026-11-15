# Step 2.1: Bloque `Extra` — Catálogos Simples (`estatus`, `tipo_auditoria`, `metodologia_auditoria`)

## 1. Objetivo
Migrar los tres catálogos simples del bloque `Extra` (`estatus`, `tipo_auditoria`, `metodologia_auditoria`) al patrón canónico completo: Multi View Clean List (`table-fixed`, `<colgroup>`, cero botones en `<td>`, CTA `+` en cabecera) y Detail View unificado en modos `'read' | 'add' | 'edit'`, con persistencia real en Supabase, toast flotante y auditoría/archivo lógico.

---

## 2. Brechas Detectadas en los Archivos Actuales
1. **`src/views/estatusView.ts` (480 líneas):**
   - Tabla del directorio incluye columna `acciones` (`Ver Detalle →` `<button>` en `<td>`).
   - Falta `tableId: 'estatus-main'`, `defaultWidthPct` (suma 100), `minWidthPx` y `getRowAttrs` para clic completo en fila (`<tr>`).
   - Tarjetas en Grid no tienen `data-action="select-estatus"` en el contenedor de la tarjeta; solo tienen un enlace/botón inferior.
   - Sin `actionsHtml` (`+ Nuevo Estatus`) ni Detail View editable (`'add' | 'edit'`); actualmente solo muestra vista `read`.
   - Pestañas hijas (`certificados`, `auditorias`) deben mantener formato limpio `renderListViewTable` (`table-fixed`). Nota: `certificados` enlaza a `certificacion` (dentro de alcance); `auditorias` enlaza en modo solo lectura hacia `Auditoría` (sin modificar el bloque `Auditoría`).
   - Evalúa permisos sin `isApprovedStaffProfile`.
2. **`src/views/tipoAuditoriaView.ts` (392 líneas):**
   - Columna `acciones` (`Ver Detalle →`) en tabla principal; sin `tableId`, `defaultWidthPct`, `minWidthPx` ni `getRowAttrs`.
   - Pestaña hija `auditorias` renderiza un `<table>` HTML crudo con `overflow-x-auto` y botón `Ver ficha →` dentro de `<td>` en lugar de `renderListViewTable`.
   - Sin modos `'add'` ni `'edit'`; sin validaciones ni mutaciones en Supabase.
3. **`src/views/metodologiaAuditoriaView.ts` (369 líneas):**
   - Columna `acciones` (`Ver Protocolo →`) en tabla principal; sin `tableId`, `defaultWidthPct`, `minWidthPx` ni `getRowAttrs`.
   - Pestaña hija `auditorias` renderiza un `<table>` HTML crudo con botón `Ver ficha →` en `<td>`.
   - Sin modos `'add'` ni `'edit'`; sin mutaciones en Supabase.
4. **Regla SQL crítica (`public/supabase/queries/01_creacion.sql`):**
   - `public.estatus` tiene columnas reales: `id`, `estatus VARCHAR(50) NOT NULL`, `deleted_at`, `deleted_by`, `delete_reason`.
   - `public.tipo_auditoria` tiene columnas reales: `id`, `tipo VARCHAR(50) NOT NULL`, `deleted_at`, `deleted_by`, `delete_reason`.
   - `public.metodologia_auditoria` tiene columnas reales: `id`, `metodologia VARCHAR(50) NOT NULL`, `deleted_at`, `deleted_by`, `delete_reason`.
   - *Nota:* Campos enriquecidos de UI (`descripcion`, `categoria_aplicable`, `color_token` en `estatus` o protocolos en `tipo`/`metodologia`) si no existen como columnas en PostgreSQL no deben enviarse en el payload `.insert()` / `.update()` para evitar errores de esquema SQL; el formulario editable debe persistir fielmente las columnas reales y derivar el enriquecimiento en cliente (`extraDomain.ts`).

---

## 3. Archivos Objetivo
1. `src/lib/extraDomain.ts`
2. `src/views/estatusView.ts`
3. `src/views/tipoAuditoriaView.ts`
4. `src/views/metodologiaAuditoriaView.ts`
5. `src/views/extraView.ts`
6. `src/main.ts` (estado `extraDomain`, handlers CRUD + breadcrumbs `'estatus' | 'tipo' | 'metodologia'`)

---

## 4. Contratos de Estado y Validación (`src/lib/extraDomain.ts`)

Agregar los contratos de modo, borrador y validación pura (sin `any`):
```ts
export type CatalogSimpleDetailMode = 'read' | 'add' | 'edit';

export interface EstatusFormDraft {
  estatus: string; // max 50 chars, requerido
}

export interface TipoAuditoriaFormDraft {
  tipo: string; // max 50 chars, requerido
}

export interface MetodologiaAuditoriaFormDraft {
  metodologia: string; // max 50 chars, requerido
}
```
- **Factorías:** `createEmptyEstatusFormDraft()`, `createEstatusFormDraftFromEntity(item)`, `createEmptyTipoFormDraft()`, `createTipoFormDraftFromEntity(item)`, `createEmptyMetodologiaFormDraft()`, `createMetodologiaFormDraftFromEntity(item)`.
- **Validadores puros:**
  - `validateEstatusDraft(draft, existingItems, excludeId?)`: requerido, ≤ 50 caracteres, sin duplicado case-insensitive entre activos (`deleted_at IS NULL`).
  - `validateTipoAuditoriaDraft(draft, existingItems, excludeId?)`: requerido, ≤ 50 caracteres, sin duplicado case-insensitive.
  - `validateMetodologiaAuditoriaDraft(draft, existingItems, excludeId?)`: requerido, ≤ 50 caracteres, sin duplicado case-insensitive.

En `EstatusViewState`, `TipoViewState`, `MetodologiaViewState` (y `AppState.extraDomain`):
- Añadir `isCreating?: boolean`, `isEditingAttributes?: boolean`, `formDraft?: ...`, `editErrorMessage?: string | null` (sin `saveSuccessMessage`).

---

## 5. Especificación UI/UX Canónica

### 5.1 Multi View (para cada uno de los 3 catálogos)
- **Columnas Clean List (`defaultWidthPct` suma = `100`):**
  - **Estatus (`tableId: 'extra-estatus-main'`):** `estatus` (22%), `descripcion` (36%), `categoria_aplicable` (24%), `usage_count` (18%).
  - **Tipo Auditoría (`tableId: 'extra-tipos-main'`):** `tipo` (24%), `descripcion` (40%), `frecuencia_sugerida` (20%), `usage_count` (16%).
  - **Metodología (`tableId: 'extra-metodologias-main'`):** `metodologia` (24%), `descripcion` (40%), `modalidad_badge` (20%), `usage_count` (16%).
- **Interacción:** `getRowAttrs` en tabla + `data-action="select-estatus" | "select-tipo" | "select-metodologia"` en tarjetas Grid. Eliminar por completo la columna `acciones`.
- **CTA Cabecera:** `renderMultiViewAddButton('open-create-estatus' | 'open-create-tipo' | 'open-create-metodologia', '...')` visible solo si `isApprovedStaffProfile(profile)`.

### 5.2 Detail View (`'read' | 'add' | 'edit'`)
- **Cabecera:** `renderDetailFormTopActions` (`#saveEstatusFormBtn` primero / `#cancelEditEstatusBtn` segundo, y equivalentes `#saveTipoFormBtn`/`#cancelEditTipoBtn`, `#saveMetodologiaFormBtn`/`#cancelEditMetodologiaBtn`).
- **`isCreateMode: mode === 'add'`:** oculta `🕒`, `🗄️` y `childTabsHtml`.
- **Zona 1 (Padres):** Array vacío (`[]`) porque los 3 catálogos son tablas raíz independientes.
- **Zona 2 (Formulario `<form id="estatusDetailForm">`, etc.):**
  - En `'read'`: vista limpia con badge de estatus/modalidad + descripción operativa derivada.
  - En `'add' | 'edit'`: input controlado con `maxlength="50"`, etiqueta con `*` obligatorio, bloque de error inline `role="alert"` si existe `editErrorMessage`, **sin botones al pie del formulario**.
- **Zona 3 (Pestañas Hijas — solo en `'read' | 'edit'`):**
  - `estatusView.ts`: reemplazar tablas de `certificados` y `auditorias` por `renderListViewTable` limpio con `tableId` (`extra-estatus-tab-certs`, `extra-estatus-tab-audits`) y `getRowAttrs` clicable de fila completa.
  - `tipoAuditoriaView.ts` (`extra-tipo-tab-audits`) y `metodologiaAuditoriaView.ts` (`extra-metodologia-tab-audits`): reemplazar `<table>` crudo y botón `Ver ficha →` por `renderListViewTable` con `getRowAttrs` apuntando a `select-prog-audit` (enlace de solo lectura sin modificar vistas de Auditoría).

---

## 6. Persistencia Supabase y Navegación (`src/main.ts`)
- **Insert (`mode === 'add'`):**
  - `supabase.from('estatus').insert({ estatus: normalized }).select().single()` (y equivalentes `tipo_auditoria`, `metodologia_auditoria`).
  - Actualizar catálogo en `state.domainData.estatusCatalog` / `state.domainData.catalogs`, asignar `selected...Id` al registro retornado, limpiar `isCreating`, sustituir el breadcrumb `'...-new'` por el registro creado, y llamar `showFloatingToast('Estatus creado correctamente.', 'success')`.
- **Update (`mode === 'edit'`):**
  - `.update({ estatus: normalized }).eq('id', id).is('deleted_at', null)`.
  - Recargar/actualizar estado reactivo y llamar `showFloatingToast('Cambios guardados exitosamente.', 'success')`.
- **Archivo Lógico:** Confirmar `get_archive_dependency_summary` y `archive_record` para `'estatus'`, `'tipo_auditoria'`, `'metodologia_auditoria'`.

---

## 7. Verificación de Step 2.1
- Pruebas unitarias en `src/lib/extraDomain.test.ts`: validadores de longitud/duplicados y resolución de modo `'read' | 'add' | 'edit'` por RBAC (`CLIENT` siempre `'read'`).
- Verificar HTML generado: ausencia de columna `acciones`, suma de `defaultWidthPct === 100`, botón Guardar antes que Cancelar en `'add' | 'edit'`.
- `npx tsx --test src/lib/*.test.ts && npm run lint && npm run build`.
