# Step 3.1: Bloque `Certificación` — `organizacion` y Entidad Hija `client_organization_access`

## 1. Objetivo
Migrar **`organizacion`** al patrón canónico Multi View Clean List + Detail View (`'read' | 'add' | 'edit'`), e incorporar la gestión contextual completa de **`client_organization_access`** como pestaña hija de `organizacion` con su propia Detail View (`'read' | 'add' | 'edit'`), gobernada estrictamente por RBAC de `ADMIN` / `WORKER` aprobado.

---

## 2. Brechas Detectadas en los Archivos Actuales
1. **`src/views/organizacionView.ts` (1065 líneas):**
   - **Multi View:** Renderiza `renderCreateOrganizacionForm()` inline encima del directorio cuando `state.isCreating === true`.
   - **Tabla:** Incluye columna `acciones` (`Ver Ficha →` `<button>` en `<td>`), carece de `tableId`, `defaultWidthPct` (suma 100), `minWidthPx` y `getRowAttrs` en filas.
   - **Grid:** Tarjetas usan botón inferior `Ver ficha y certificados →` en lugar de clic completo en la tarjeta (`data-action="select-organizacion"`).
   - **Detail View (`#editOrgForm`):**
     - Mantiene botones inferiores (`Cancelar` y `💾 Guardar Cambios`) al pie del formulario en modo edición.
     - Renderiza banner verde inline `saveSuccessMessage` y `createSuccessMessage`.
     - No soporta modo `'add'` dentro del Detail Template (`isCreateMode: true`).
     - Pestaña `auditorias` enlaza en solo lectura (se conserva como tabla limpia `renderListViewTable` sin modificar el bloque `Auditoría`).
2. **`client_organization_access` (`public/supabase/queries/01_creacion.sql` & `04_rls.sql`):**
   - Tabla existente: `id`, `id_usuario UUID NOT NULL REFERENCES profiles(id)`, `id_organizacion UUID NOT NULL REFERENCES organizacion(id)`, `estado user_status NOT NULL DEFAULT 'PENDING' ('PENDING' | 'APPROVED' | 'REJECTED')`, `aprobado_por UUID`, `fecha_solicitud TIMESTAMPTZ`, `fecha_respuesta TIMESTAMPTZ`, `motivo_rechazo TEXT`, `deleted_at`, `deleted_by`, `CONSTRAINT unique_usuario_organizacion UNIQUE (id_usuario, id_organizacion)`.
   - Actualmente **no tiene visibilidad ni CRUD contextual dentro de `organizacionView.ts`** (solo existe conteo en `state.clientAccessRows` o aprobación aislada fuera de la organización).
   - RLS: `SELECT` abierto a `ADMIN` (incluye archivados) y `WORKER` aprobado / propio usuario (`deleted_at IS NULL`); `INSERT`/`UPDATE` para `ADMIN`/`WORKER` aprobado.

---

## 3. Archivos Objetivo
1. `src/lib/activeCertificates.ts` (contratos `OrganizacionDetailMode`, `OrganizacionFormDraft`, `ClientAccessDetailMode`, `ClientAccessFormDraft`, validadores)
2. `src/views/organizacionView.ts`
3. `src/views/clientAccessView.ts` *(nuevo)*
4. `src/views/certificacionView.ts`
5. `src/main.ts` (`organizacionDomain`, `clientAccessDomain`, handlers CRUD + `client_organization_access`, breadcrumbs `'org'` y `'acceso_cliente'`)

---

## 4. Contratos de Dominio (`src/lib/activeCertificates.ts`)

### 4.1 `organizacion`
```ts
export type OrganizacionDetailMode = 'read' | 'add' | 'edit';

export interface OrganizacionFormDraft {
  nombre: string;           // max 200, requerido
  rif: string;              // max 50, opcional (o formato fiscal validado si informado)
  direccion_fiscal: string; // text, opcional
}
```
- Eliminar `createSuccessMessage` y `saveSuccessMessage` de `OrganizacionViewState`.
- Añadir `isCreating?: boolean`, `formDraft?: OrganizacionFormDraft`, `editErrorMessage?: string | null`.
- `resolveOrganizacionDetailMode(state, isStaff, selectedOrg)`.

### 4.2 `client_organization_access`
```ts
export type ClientAccessDetailMode = 'read' | 'add' | 'edit';

export interface ClientAccessFormDraft {
  id_organizacion: string;
  id_usuario: string;
  estado: 'PENDING' | 'APPROVED' | 'REJECTED';
  motivo_rechazo: string;
}
```
- **Validador puro `validateClientAccessDraft(draft, existingRows, excludeId?)`:**
  - `assertValidUuid(draft.id_organizacion)` y `assertValidUuid(draft.id_usuario)`.
  - Prevenir duplicado por `unique_usuario_organizacion` entre registros activos.
  - Si `estado === 'REJECTED'`, exigir `motivo_rechazo.trim().length >= 5` para trazabilidad ISO/auditoría.

---

## 5. Diseño de Vistas

### 5.1 `src/views/organizacionView.ts`
- **Eliminar por completo** `renderCreateOrganizacionForm()` del Multi View.
- **Multi View (`tableId: 'cert-organizaciones-main'`):**
  - Columnas (`100%`): `nombre` (34%), `rif` (16%), `direccion_fiscal` (34%), `certificados_count` (16%). Sin columna `acciones`.
  - CTA `+` (`open-create-org`) en `actionsHtml` solo si `isApprovedStaffProfile(profile)`, navegando directo a Detail `'add'` (`createNewEntityBreadcrumbSegment({ entityType: 'org', ... })`).
- **Detail View (`'read' | 'add' | 'edit'`):**
  - Cabecera: `renderDetailFormTopActions` (`#saveOrgFormBtn` primero, `#cancelEditOrgBtn` segundo), `isCreateMode: mode === 'add'`.
  - Zona 1: `[]` (entidad raíz).
  - Zona 2 (`#organizacionDetailForm`): `nombre` (`*`), `rif`, `direccion_fiscal`. Sin botones al pie, sin banner verde inline.
  - Zona 3 (oculta si `isCreateMode`):
    - **Pestaña `certificados`:** `renderListViewTable` (`tableId: 'org-tab-certificados'`) + botón `+ Nuevo Certificado` que navega a `certificadoView` `'add'` preseleccionando `id_organizacion`.
    - **Pestaña `auditorias`:** `renderListViewTable` (`tableId: 'org-tab-auditorias'`, enlaces read-only).
    - **Pestaña `accesos` (visible solo para Staff aprobado `ADMIN`/`WORKER`):** `renderListViewTable` (`tableId: 'org-tab-accesos'`) mostrando usuario (`profiles.nombre` / `email`), `estado` (`PENDING`/`APPROVED`/`REJECTED`), `aprobado_por` y fechas, con `getRowAttrs` → `select-client-access`, más botón `+ Otorgar Acceso Cliente` → navega a `clientAccessView` `'add'` con `id_organizacion` preseleccionado.

### 5.2 Nueva Vista `src/views/clientAccessView.ts`
- **Detail View (`'read' | 'add' | 'edit'`)** — accesible únicamente para `isApprovedStaffProfile(profile)`:
  - Cabecera: `renderDetailFormTopActions` (`#saveClientAccessBtn` primero, `#cancelClientAccessBtn` segundo).
  - **Zona 1 (`customParentZoneHtml`):**
    - `'read'`: chip `Organización` (`navAction` → `org`) + chip informativo del usuario (`profiles.nombre · rol`).
    - `'add' | 'edit'`: selector `<select form="clientAccessDetailForm">` de `id_organizacion` (solo activos) y `<select>` de usuario `CLIENT` desde `state.approvals.profiles` (en `'edit'`, bloquear cambio de pareja si rompe unicidad o validar con `validateClientAccessDraft`).
  - **Zona 2 (`#clientAccessDetailForm`):** `estado` (`PENDING` / `APPROVED` / `REJECTED`), `motivo_rechazo` (visible/requerido cuando `estado === 'REJECTED'`), y metadatos de solo lectura (`fecha_solicitud`, `fecha_respuesta`, `aprobado_por`).
  - **Zona 3:** `''` (entidad hoja; `isCreateMode` también oculta `🕒`/`🗄️` cuando es `'add'`).

---

## 6. Persistencia Supabase y Archivo Lógico (`src/main.ts`)
- **`organizacion`:** `.insert({ nombre, rif: rif || null, direccion_fiscal: direccion_fiscal || null })` / `.update(...)`; archivo vía `archive_record('organizacion', id, reason)` tras `get_archive_dependency_summary`.
- **`client_organization_access`:**
  - Al guardar con `estado === 'APPROVED' | 'REJECTED'`, completar `aprobado_por: state.profile.id` y `fecha_respuesta: new Date().toISOString()`.
  - Si un trabajador archiva una concesión de acceso, invocar `archive_record('client_organization_access', id, reason)` (habilitado en Step 1) y refrescar `state.authorizedClientOrgIds` / `state.clientAccessRows`.
  - Confirmación exclusiva vía `showFloatingToast(..., 'success')`.

---

## 7. Verificación de Step 3.1
- Verificar ausencia de `renderCreateOrganizacionForm` y de la columna `acciones` en `organizacionView.ts`.
- Verificar que usuarios `CLIENT` o `AUDITOR` nunca ven la pestaña `accesos` ni pueden abrir `clientAccessView` en `'add'|'edit'`.
- `npx tsx --test src/lib/activeCertificates.test.ts src/lib/*.test.ts && npm run lint && npm run build`.
