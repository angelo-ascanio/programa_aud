# Fase 3: Overhaul del Flujo `Nuevo Certificado`, Cascada en Vivo y Persistencia

**Archivos Objetivo:**
- `src/views/certificadoView.ts`
- `src/views/certificacionView.ts`
- `src/main.ts`

---

## 1. Objetivo de la Fase

1. Eliminar el formulario inline de creación dentro del directorio Multi View de certificados.
2. Hacer que el botón **`Nuevo Certificado`** navegue directamente al **Detail View en Modo Alta** (`detailMode: 'add'`).
3. Pasar todos los catálogos de padres (`organizaciones`, `normas`, `estatusList`, `sectores`, `subsectores`) desde `src/main.ts` → `certificacionView.ts` → `certificadoView.ts`.
4. Cablear el filtrado en cascada en tiempo real (`#certParentSectorIafSelect` → `#certParentSubsectorIafSelect`) y la persistencia unificada `INSERT` / `UPDATE` hacia el estado reactivo y Supabase.

---

## 2. Tareas Detalladas

### 2.1 Limpieza del Directorio Multi View (`src/views/certificadoView.ts`)
1. **Eliminar `renderCreateCertificadoForm()`:** Borrar por completo la función y cualquier JSX/HTML del antiguo formulario inline en la parte superior del listado.
2. **Limpiar `renderCertificadoDirectory()`:**
   - Eliminar `inlineFormHtml` (ya no se muestra formulario inline cuando `state.isCreating` está activo).
   - Mantener el botón **`Nuevo Certificado`** (`[data-action="open-create-cert"]`) en `actionsHtml` exclusivamente para `isStaff` (`ADMIN` / `WORKER` aprobados).
3. **Despacho en `renderCertificadoView()`:**
   - Si `state.selectedCertId` corresponde a un certificado existente → renderiza `renderCertificadoDetailPage(...)` en `'read'` o `'edit'`.
   - Si `!state.selectedCertId && state.isCreating && isStaff` → renderiza `renderCertificadoDetailPage(...)` en **`'add'`** (en lugar de caer al listado Multi View).
   - En cualquier otro caso → renderiza `renderCertificadoDirectory(...)`.

### 2.2 Inyección de Catálogos de Padres (`CertificacionViewState` → `CertificadoViewProps`)
1. Ampliar `CertificadoViewProps` en `src/views/certificadoView.ts`:
   - `organizaciones?: OrganizacionEntity[]`
   - `normas?: NormaEntity[]` (fallback `INITIAL_NORMAS`)
   - `estatusList?: EstatusCatalogItem[]` (fallback `INITIAL_ESTATUS_CATALOG`)
   - `sectores?: SectorIafEntity[]` (fallback `INITIAL_SECTORES_IAF`)
   - `subsectores?: SubsectorIafEntity[]` (fallback `INITIAL_SUBSECTORES_IAF`)
2. Ampliar `CertificacionViewState` en `src/views/certificacionView.ts` para recibir `standardsCatalog`, `estatusCatalog`, `iafSectors` desde `src/main.ts` (`state.domainData`) y reenviarlos a `renderCertificadoView(...)`.
   - En `src/main.ts`, pasar `standardsCatalog: state.domainData.standards`, `estatusCatalog: state.domainData.estatusCatalog`, `iafSectors: state.domainData.iafSectors` dentro de `renderCertificacionView(...)`.

### 2.3 Navegación Directa desde `Nuevo Certificado` (`src/main.ts`)
Actualizar el listener de `[data-action="open-create-cert"]`:
```ts
clearAllEntitySelections();
state.activeRoute = 'certificacion';
state.activeSubSection = 'certificates';
state.certificadoDomain.selectedCertId = null;
state.certificadoDomain.isCreating = true;
state.certificadoDomain.isEditingAttributes = false;
state.certificadoDomain.formDraft = createEmptyCertificadoFormDraft();
state.certificadoDomain.createErrorMessage = null;
state.certificadoDomain.editErrorMessage = null;
state.certificadoDomain.saveSuccessMessage = null;
state.breadcrumbs = pushBreadcrumb(resetBreadcrumbToDomain('certificacion', 'certificates'), {
  id: 'cert-new',
  label: 'Nuevo Certificado',
  route: 'certificacion',
  subview: 'certificates',
  entityType: 'cert',
  tooltip: 'Certificados > Nuevo Certificado',
});
syncUrlHash('certificacion', 'certificates');
render();
```
- Al pulsar `[data-nav-back="true"]` o `#cancelCertFormBtn` durante `'add'`:
  - Limpia `isCreating = false`, `formDraft = undefined`, `createErrorMessage = null` y regresa al listado Multi View restaurando el breadcrumb (`backtrackToParentBreadcrumb()`).

### 2.4 Filtrado en Cascada en Vivo (`id_sector_iaf` → `id_subsector_iaf`)
En `src/main.ts` (sección de eventos de `certificadoDomain`):
1. Al cambiar `#certParentSectorIafSelect` (`change` event):
   - Leer todos los valores actuales del formulario en `state.certificadoDomain.formDraft` para no perder lo que el usuario ya escribió en otros campos (`numero_certificado`, `alcance`, `id_organizacion`, etc.).
   - Actualizar `formDraft.id_sector_iaf` con el nuevo valor y recalcular `formDraft.id_subsector_iaf` con `reconcileSubsectorSelectionOnSectorChange()`.
   - Re-renderizar el selector `#certParentSubsectorIafSelect` (o ejecutar `render()` preservando foco) mostrando exclusivamente los sub-sectores hijos válidos del sector seleccionado (ej. al elegir Sector `17`, mostrar `17.1`, `17.2`, `17.3`, ...).
2. Al pulsar `#startEditCertBtn`:
   - Inicializar `state.certificadoDomain.isEditingAttributes = true` y `state.certificadoDomain.formDraft = createCertificadoFormDraftFromEntity(cert)`.

### 2.5 Guardado Unificado (`#certificadoDetailForm` `submit`)
Unificar el submit de Alta y Edición en un único manejador para `#certificadoDetailForm`:
1. Leer los 5 selectores padres (`id_organizacion`, `id_norma`, `id_estatus`, `id_sector_iaf`, `id_subsector_iaf`) y los 3 campos directos (`numero_certificado`, `multisitio`, `alcance`).
2. Ejecutar `validateCertificadoFormDraft(...)`:
   - Si falla, guardar `formDraft` y asignar `createErrorMessage` (en `'add'`) o `editErrorMessage` (en `'edit'`) y llamar `render()`.
3. **Si `mode === 'add'`:**
   - Generar `newId = crypto.randomUUID()`, construir `CertificadoDetailEntity` hidratado con las entidades padres resueltas, insertarlo en `state.domainData.allCertificadosDetailed` y `state.exploration.records`, registrar en bitácora (`recordPhase5SessionLog('certificado', newId, 'INSERT', ...)`), ejecutar `supabase.from('certificado').insert(...)` (con las 5 FKs + `numero_certificado`, `alcance`, `multisitio`), y transicionar a `selectedCertId = newId`, `isCreating = false`, `formDraft = undefined`, `saveSuccessMessage = 'Certificado creado exitosamente.'` y actualizar el breadcrumb con el número de certificado creado.
4. **Si `mode === 'edit'`:**
   - Actualizar los 5 campos padres + 3 campos directos en `state.domainData.allCertificadosDetailed`, `state.exploration.records` y `state.breadcrumbs`; ejecutar `supabase.from('certificado').update({ id_organizacion, id_norma, id_estatus, id_sector_iaf, id_subsector_iaf, numero_certificado, multisitio, alcance, updated_at })`; cerrar modo edición (`isEditingAttributes = false`, `formDraft = undefined`, `saveSuccessMessage = 'Atributos del certificado guardados exitosamente.'`).

---

## 3. Criterios de Verificación de la Fase 3

- El directorio Multi View no renderiza ningún formulario inline al pulsar `Nuevo Certificado`.
- Pulsar `Nuevo Certificado` abre inmediatamente el Detail View vacío en Modo Alta con breadcrumb `Certificación > Certificado > Nuevo Certificado`.
- Seleccionar un `Sector IAF *` actualiza dinámicamente las opciones de `Sub-Sector IAF *` mostrando solo sus hijos válidos.
- Tanto la creación como la edición persisten las 5 FKs y los 3 campos directos en Supabase y en el estado reactivo de la SPA.
