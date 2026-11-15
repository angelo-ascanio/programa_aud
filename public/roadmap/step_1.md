# Step 1: Core Compartido, Primitivos de Detalle, Breadcrumbs, RBAC y Gobernanza

## 1. Objetivo
Preparar la infraestructura compartida que consumen todos los pasos `2.1` a `4.3` para evitar código duplicado y garantizar consistencia visual, de navegación y de seguridad entre `Extra` y `Certificación`.

---

## 2. Brechas Detectadas en la Inspección Actual
1. **`src/views/detailTemplate.ts`:**
   - `certificadoView.ts` implementa localmente los botones de cabecera en `'add' | 'edit'` (`#saveCertFormBtn` verde primero, `#cancelEditCertBtn` rosa segundo, `w-9 h-9`, icon-only), mientras el resto de vistas (`organizacionView`, `auditorView`, `acreditacionView`, `sitioView`, `procesoView`, `turnoView`, `fechaView`, `contactoView`, `telefonoView`, `emailView`) caen en el botón por defecto `[✕]` y duplican botones al pie del formulario.
   - Falta un helper reutilizable para badges booleanos de alto contraste en modo lectura (`✓ Sí` / `✕ No`) y renderizado uniforme de toasts sin banners inline.
2. **`src/lib/breadcrumb.ts`:**
   - `BreadcrumbEntityType` actual (`'org' | 'cert' | 'sitio' | 'proceso' | 'turno' | 'fecha_certificado' | 'contacto_certificado' | 'telefono_contacto' | 'email_contacto' | 'auditor' | 'audit' | 'norma' | 'sector_iaf' | 'accreditation' | 'estatus' | 'tipo' | 'metodologia'`) **no incluye**: `'organismo_acreditacion'`, `'subsector_iaf'`, `'requisito'`, `'no_aplicable'`, `'acceso_cliente'`, `'competencia_auditor'`.
   - `getSubviewLabel('extra', subview)` no mapea `'organismos'` ni `'accreditations'` de forma homogénea cuando se navega desde `Organismo de Acreditación`.
   - Solo existe `createNewCertificadoBreadcrumbSegment()`; falta una factoría genérica `createNewEntityBreadcrumbSegment(...)` para modos `'add'`.
3. **RBAC Inconsistente (`src/views/extraView.ts`, `src/views/normaView.ts`, `src/views/sectorIafView.ts`):**
   - `normaView.ts` y `sectorIafView.ts` evalúan `profile.role === 'ADMIN' || profile.role === 'WORKER'` **sin validar `status === 'APPROVED'`**, a diferencia de `certificadoView.ts` (`(!profile.status || profile.status === 'APPROVED')`). Un usuario `PENDING` o `REJECTED` no debe recibir botones de edición/alta.
4. **Gobernanza Soft-Delete SQL (`public/supabase/queries/04_rls.sql`):**
   - `client_organization_access` tiene columna `deleted_at` y `deleted_by` en `01_creacion.sql`, pero **no** figura en `v_child_tables` de `public.archive_record(TEXT, UUID, TEXT)` en `04_rls.sql`.

---

## 3. Archivos Objetivo
1. `src/lib/rbac.ts` (nuevo o extensión sobre helper de permisos existente)
2. `src/views/detailTemplate.ts`
3. `src/lib/breadcrumb.ts`
4. `src/views/extraView.ts` y `src/views/certificacionView.ts`
5. `src/main.ts` (`AppState`, `clearAllEntitySelections`, `applyBreadcrumbSegmentState`, `showFloatingToast`)
6. `public/supabase/queries/04_rls.sql` y `public/supabase/queries/01_creacion.sql` (solo si se confirma despliegue de `archive_record` para `client_organization_access`)

---

## 4. Contratos e Implementación Exacta

### 4.1 Helper Canónico RBAC (`isApprovedStaffProfile`)
Crear/exportar en `src/lib/rbac.ts` (y reutilizar en todas las vistas `Extra` y `Certificación`):
```ts
export function isApprovedStaffProfile(profile: UserProfile | null | undefined): boolean {
  if (!profile) return false;
  const isStaffRole = profile.role === 'ADMIN' || profile.role === 'WORKER';
  const isApproved = !profile.status || profile.status === 'APPROVED';
  return isStaffRole && isApproved;
}

export function isApprovedAdminProfile(profile: UserProfile | null | undefined): boolean {
  if (!profile) return false;
  const isApproved = !profile.status || profile.status === 'APPROVED';
  return profile.role === 'ADMIN' && isApproved;
}
```

### 4.2 Primitivos Compartidos en `src/views/detailTemplate.ts`
Agregar y exportar los siguientes helpers puros (preservando la firma actual de `renderDetailPageTemplate` para mantener compatibilidad retrospectiva):

1. **`renderDetailFormTopActions(params)`** — Genera `customTopActionsHtml` idéntico al patrón canónico de `certificadoView.ts`:
   ```ts
   export interface DetailFormTopActionsParams {
     mode: 'read' | 'add' | 'edit';
     isStaff: boolean;
     formId: string;
     saveBtnId: string;
     cancelBtnId: string;
     editBtnId: string;
     saveTitle?: string;   // Ej: "Crear organización" | "Guardar cambios"
     cancelTitle?: string; // Ej: "Cancelar"
     editTitle?: string;   // Ej: "Editar atributos"
     showHistoryBtn?: boolean;
     showArchiveBtn?: boolean;
     historyBtnDataAction?: string; // default: "open-audit-log"
     archiveBtnDataAction?: string; // default: "open-archive-modal"
     extraAuditAttrs?: string;
     extraArchiveAttrs?: string;
   }
   ```
   - **Regla de orden estricta en `'add' | 'edit'`:**
     1. Botón **Guardar** primero: `type="submit" form="${formId}" id="${saveBtnId}"` con clase `inline-flex items-center justify-center w-9 h-9 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors cursor-pointer shadow-2xs shrink-0` y SVG checkmark.
     2. Botón **Cancelar** segundo: `type="button" id="${cancelBtnId}"` con clase `inline-flex items-center justify-center w-9 h-9 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition-colors cursor-pointer shadow-2xs shrink-0` y SVG `X`.
   - **En `'read'` (si `isStaff === true`):** `[✏️]` (`#editBtnId`), `[🕒]` (si `showHistoryBtn !== false`), `[🗄️]` (si `showArchiveBtn !== false`).

2. **`renderDetailBooleanField(params)`** — Estandariza booleanos estilo `multisitio`:
   - En `'read'`: renderiza `<span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-bold border ...">` (`bg-emerald-50 text-emerald-800 border-emerald-200` con `✓` cuando `true`; `bg-slate-100 text-slate-600 border-slate-300` con `✕` cuando `false`).
   - En `'add' | 'edit'`: checkbox habilitado **sin asterisco `*`** en el `<label>`.

3. **`renderDetailParentSelectCard(params)`** — Tarjeta editable para la Zona 1 (`customParentZoneHtml`) con `<select form="${formId}" id="${selectId}" name="${name}">` estilizada idéntica a `renderCertificadoParentFieldsZone` (`bg-slate-50/90 border border-indigo-200 rounded-xl p-2.5`).

4. **`renderMultiViewAddButton(dataAction, title)`** — Botón cuadrado estándar de cabecera Multi View (`w-9 h-9 rounded-lg bg-sky-700 hover:bg-sky-800 text-white`, icono `+` SVG `stroke-width="2.5"`).

### 4.3 Extensión de `src/lib/breadcrumb.ts`
1. Ampliar `BreadcrumbEntityType`:
   ```ts
   export type BreadcrumbEntityType =
     | 'org'
     | 'acceso_cliente'
     | 'cert'
     | 'sitio'
     | 'proceso'
     | 'turno'
     | 'fecha_certificado'
     | 'contacto_certificado'
     | 'telefono_contacto'
     | 'email_contacto'
     | 'no_aplicable'
     | 'auditor'
     | 'competencia_auditor'
     | 'audit'
     | 'norma'
     | 'requisito'
     | 'sector_iaf'
     | 'subsector_iaf'
     | 'organismo_acreditacion'
     | 'accreditation'
     | 'estatus'
     | 'tipo'
     | 'metodologia';
   ```
2. Añadir factoría genérica para Alta:
   ```ts
   export function createNewEntityBreadcrumbSegment(params: {
     entityType: BreadcrumbEntityType;
     label: string;
     route: ActiveRoute;
     subview: string;
     tooltip?: string;
     parentEntityId?: string;
   }): BreadcrumbSegment
   ```
   Con `id: `${params.entityType}-new``, `entityId: undefined`, preservando trazabilidad al padre cuando la creación nace desde una pestaña hija (ej. `Certificado > Nuevo Sitio`, `Norma > Nuevo Requisito`).
3. Actualizar `inferEntityTypeFromSegment` y `getSubviewLabel('extra', ...)` para soportar `'organismos'` (`'Organismos de Acreditación'`).

### 4.4 Estado Global y Despacho (`src/main.ts`, `extraView.ts`, `certificacionView.ts`)
- **Precedencia de enrutamiento de sub-entidades** (documentada y verificada en `certificacionView.ts` y `extraView.ts`):
  - En `certificacionView.ts`: el orden de inspección en detalle debe comprobar los hijos/nietos más específicos antes que el padre (`telefono` → `email` → `contacto` → `fecha` → `no_aplicable` → `turno` → `proceso` → `sitio` → `certificado` | `acceso_cliente` → `organizacion` | `competencia_auditor` → `auditor`), verificando tanto `selectedId` como `isCreating` para soportar modo `'add'` aunque `selectedId` sea `null`.
  - En `extraView.ts`: añadir precedencia para sub-entidades (`requisito` antes de `norma`; `subsector_iaf` antes de `sector_iaf`; `organismo_acreditacion` dentro de `accreditations` / `organismos`), soportando `selectedId` y `isCreating`.
- **Toast Flotante Universal:** Prohibir nuevos banners verdes inline. Centralizar todas las confirmaciones de creación/actualización en `showFloatingToast(message, 'success', 4500)`.
- **Política Cero-UUID:** Reutilizar/centralizar `isValidUuid(val)` antes de emitir `.insert()` o `.update()` en Supabase.

### 4.5 Actualización SQL Opcional para Archivo Lógico de `client_organization_access`
En `public/supabase/queries/04_rls.sql` (y sincronización en `01_creacion.sql`):
- Incluir `'client_organization_access'` dentro de `v_child_tables` en `public.archive_record` para permitir revocación/archivo lógico mediante la RPC central `archive_record` sin errores de tabla no permitida.
- En `get_archive_dependency_summary` (`01_creacion.sql`), validar que no bloquee archivado de filas hoja (`requisito` hoja, `subsector_iaf` sin certificados/auditores, `organismo_acreditacion` sin acreditaciones, `client_organization_access`).

---

## 5. Criterios de Verificación de Step 1
- `npx tsx --test src/lib/breadcrumb.test.ts` (o pruebas nuevas de `detailTemplate` y `rbac`) pasa al 100%.
- `renderDetailFormTopActions` produce `#save...` antes que `#cancel...` en el DOM HTML resultante.
- `isApprovedStaffProfile({ role: 'WORKER', status: 'PENDING', ... })` retorna `false`.
- `npm run lint` y `npm run build` terminan sin errores.
