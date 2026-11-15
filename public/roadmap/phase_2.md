# Fase 2: Detail Template y Modelo Unificado Lectura (Disabled) vs. Alta/Edición (Enabled)

**Archivos Objetivo:**
- `src/views/detailTemplate.ts`
- `src/views/certificadoView.ts`

---

## 1. Objetivo de la Fase

Transformar la Ficha de Detalle de **`Certificado`** para que la transición entre **Modo Lectura**, **Modo Alta** y **Modo Edición** sea visualmente continua y unificada:
- **Modo Lectura:** Todos los campos (5 padres + atributos directos) se muestran como controles de formulario reales en estado **`disabled`** (deshabilitados, no editables).
- **Modo Alta / Edición:** Los mismos controles pasan a estado habilitado (`!disabled`).
- **Indicador `*`:** Cada campo `NOT NULL` de `public.certificado` exhibe `*` en su `<label>`.
- **Soporte de Modo Alta en `detailTemplate.ts`:** Permitir renderizar el Detail View sin registro guardado aún (ocultando botones `[🕒]`/`[🗄️]` y la Zona de Hijos cuando está en Modo Alta).

---

## 2. Tareas Detalladas

### 2.1 Extensión Controlada de `src/views/detailTemplate.ts`
Mantener compatibilidad total con las otras vistas de detalle del sistema y añadir capacidades opcionales en `DetailPageTemplateProps`:
1. **`isCreateMode?: boolean` (default `false`):**
   - Cuando `isCreateMode === true`:
     - No renderiza el botón `data-action="open-changelog"` (`🕒 Historial de Cambios`), ya que el certificado aún no existe en base de datos.
     - No renderiza `trailingActionButtonsHtml` (`🗄️ Archivar`).
     - No renderiza `childTabsHtml` (Zona de Hijos vacía/oculta hasta que el certificado sea creado).
2. **`customParentZoneHtml?: string`:**
   - Permite a `certificadoView.ts` renderizar la Zona de Padres (`<section aria-label="Contexto y relaciones superiores">`) usando la misma grilla compacta (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-2.5`) pero compuesta por **`<select>` reales** (deshabilitados en Lectura y habilitados en Alta/Edición), conservando además el botón compacto `→` (`data-parent-nav="true"`) junto a la etiqueta cuando existe un padre seleccionado en Modo Lectura para no perder la navegación cruzada hacia `Organización`, `Norma`, `Estatus`, `Sector IAF` y `Sub-Sector IAF`.

### 2.2 Rediseño del Formulario Unificado en `src/views/certificadoView.ts`
1. **Resolución del Modo Activo (`detailMode: CertificadoDetailMode`):**
   - Si `state.isCreating && isStaff && !state.selectedCertId` → **`mode = 'add'`**.
   - Else si `selectedCert && state.isEditingAttributes && isStaff` → **`mode = 'edit'`**.
   - Else → **`mode = 'read'`**.
   - Nota de seguridad RBAC: Para usuarios `CLIENT` o `AUDITOR` (`!isStaff`), incluso si llegara algún flag residual, el modo efectivo es estrictamente `'read'` y los controles permanecen `disabled` sin botones de guardar/editar.
2. **Zona de Padres Unificada (`renderCertificadoParentFieldsZone`):**
   Renderiza los **5 selectores de claves foráneas** en `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-2.5`, todos con `<label>` + `*` (`NOT NULL` en `public.certificado`):
   - `Organización *` (`#certParentOrganizacionSelect`, `name="id_organizacion"`)
   - `Norma *` (`#certParentNormaSelect`, `name="id_norma"`)
   - `Estatus *` (`#certParentEstatusSelect`, `name="id_estatus"`)
   - `Sector IAF *` (`#certParentSectorIafSelect`, `name="id_sector_iaf"`)
   - `Sub-Sector IAF *` (`#certParentSubsectorIafSelect`, `name="id_subsector_iaf"`)
   - **Comportamiento por modo:**
     - **Modo `'read'`:** Cada `<select>` incluye el atributo `disabled` y estilado visual limpio (`bg-slate-100/80 text-slate-800 border-slate-200 cursor-not-allowed`), mostrando la opción correspondiente al valor actual del certificado. En la cabecera de cada tarjeta/campo se incluye un botón icono compacto `→` (`data-parent-nav="true"`) para navegar al padre.
     - **Modo `'add'`:** Todos los `<select>` están habilitados y arrancan en `<option value="" selected>Seleccione...</option>`. El selector `Sub-Sector IAF *` inicia vacío/dependiente hasta que el usuario elija un `Sector IAF *` (o filtrado según `draft.id_sector_iaf` si ya eligió uno).
     - **Modo `'edit'`:** Todos los `<select>` están habilitados y pre-seleccionados con `draft.id_*`. El selector `Sub-Sector IAF *` muestra únicamente los sub-sectores filtrados por `filterSubsectoresBySectorIaf` para el `draft.id_sector_iaf` activo.
3. **Zona de Registro Unificada (`renderCertificadoRecordFieldsZone`):**
   Renderiza los **3 campos directos** de `public.certificado` dentro de un único `<form id="certificadoDetailForm">` (o envolviendo Zona de Padres + Zona de Registro dentro del mismo `<form>` en `detailTemplate` o conectando los campos vía atributo `form="certificadoDetailForm"` para que el `submit` envíe ambos bloques juntos de forma nativa):
   - `Número de Certificado *` (`<input type="text" id="certNumeroInput" name="numero_certificado" required ... />`):
     - `'read'`: `disabled`, pre-rellenado con `cert.numero_certificado`.
     - `'add'`: habilitado, `value=""`, `placeholder="Ej. FN-QMS-2026-001"`.
     - `'edit'`: habilitado, `value="${draft.numero_certificado}"`.
   - `Esquema Multisitio *` (`<input type="checkbox" id="certMultisitioCheckbox" name="multisitio" ... />`):
     - `'read'`: `disabled`, `checked` según `cert.multisitio`, acompañado de la etiqueta descriptiva de sucursales cuando `cert` existe.
     - `'add'`: habilitado, desmarcado (`false`) por defecto.
     - `'edit'`: habilitado, según `draft.multisitio`.
   - `Alcance de la Certificación *` (`<textarea id="certAlcanceInput" name="alcance" required minlength="10" maxlength="1000" ...>`):
     - `'read'`: `disabled`, pre-rellenado con `cert.alcance`, con contador `(N / 1000 caracteres)`.
     - `'add'`: habilitado, vacío (`""`), contador `(0 / 1000 caracteres)`, placeholder descriptivo.
     - `'edit'`: habilitado, pre-rellenado con `draft.alcance`, contador en vivo `#certAlcanceLiveCounter`.
4. **Barra de Acciones del Formulario (Modo Alta / Edición):**
   - Visible únicamente en `mode === 'add'` o `mode === 'edit'`:
     - Botón `Cancelar` (`#cancelCertFormBtn`, vuelve a `'read'` en edición o regresa al listado Multi View en `'add'`).
     - Botón `submit` (`#saveCertFormBtn`): texto `💾 Crear Certificado` en `'add'` y `💾 Guardar Cambios` en `'edit'`.
   - En `mode === 'read'`, no se muestra fila inferior de Guardar/Cancelar; la barra superior muestra `[✏️]` (Editar) para `ADMIN`/`WORKER`.

---

## 3. Consideraciones de Accesibilidad y Zero-UUID

- Ningún `<option>` visible expone UUIDs en el texto ni en `title`/`aria-label`; el UUID reside únicamente en el atributo `value="..."` (que `zeroUuid.ts` debe seguir pasando sin falsos positivos — verificar en `step_final.md` que `zeroUuid.ts` ignore `value=` en `<option>` o revisar cómo valida `<input>`/`<select>`).
- **Nota técnica importante para `src/lib/zeroUuid.ts`:** Confirmar durante la ejecución de la Fase 2 si `findExposedUuidsInHtml` inspecciona `<option value="...">` (normalmente inspecciona texto visible, `title`, `aria-label`, `placeholder` e `<input value="...">`; verificar para evitar sorpresas en `phase62UiIntegrity.test.ts`).

---

## 4. Criterios de Verificación de la Fase 2

- En Modo Lectura, un usuario `ADMIN`/`WORKER`/`CLIENT`/`AUDITOR` visualiza los **5 `<select disabled>`** y los **3 controles directos `disabled`** con etiquetas `*`.
- En Modo Alta, todos los campos están habilitados y vacíos; en Modo Edición, todos están habilitados y pre-rellenados.
- `detailTemplate.ts` no altera el diseño ni las pruebas de los demás dominios (`Organización`, `Auditor`, `Sitio`, `Proceso`, `Turno`, `Programación`, `Extra`).
