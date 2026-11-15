# Roadmap Maestro de Estandarización UX/UI: Bloques `Extra` y `Certificación`

> **Referencia Canónica Única:** [`public/certificado/README.md`](../certificado/README.md), [`recipe_multiview_detailview.md`](../certificado/recipe_multiview_detailview.md) y [`component_specifications.md`](../certificado/component_specifications.md).
> **Base Documental:** `public/doc/project_resume.md` y `public/doc/architecture/*.md`.

---

## 1. Propósito y Fronteras de Alcance

Este roadmap define la hoja de ruta modular y atómica para replicar el **patrón canónico Multi View + Detail View unificado (`'read' | 'add' | 'edit'`)** del dominio `certificado` en **todas las entidades raíz, hijas y nietas** de los bloques **`Extra`** y **`Certificación`**.

### En Alcance (`Extra` + `Certificación`)
| Bloque | Entidades Raíz | Entidades Hijas / M:N | Entidades Nietas |
| :--- | :--- | :--- | :--- |
| **`Extra`** | `estatus`, `tipo_auditoria`, `metodologia_auditoria`, `organismo_acreditacion`, `acreditacion_norma_iaf`, `sector_iaf`, `norma` | `subsector_iaf` (de `sector_iaf`), `requisito` LTREE (de `norma` + autorreferencia `id_requisito_padre`), `acreditacion_norma_iaf` (desde `organismo_acreditacion`, `norma`, `sector_iaf`) | — |
| **`Certificación`** | `organizacion`, `auditor`, `certificado` *(modelo de referencia ya completado)* | **De `organizacion`:** `client_organization_access`, `certificado` (enlace)<br>**De `auditor`:** `norma_auditor`, `sector_iaf_auditor`, `subsector_iaf_auditor`<br>**De `certificado`:** `sitio`, `proceso`, `turno`, `requisitos_no_aplicables_certificado`, `fecha_certificado`, `contacto_certificado` | **De `sitio`:** `turnos_por_sitio`<br>**De `proceso`:** `requisitos_por_proceso`<br>**De `contacto_certificado`:** `telefono_contacto_certificado`, `email_contacto_certificado` |

### Fuera de Alcance Explícito (`Auditoría` y Módulos Globales)
- **NO modificar el bloque `Auditoría`:** `calendario`, `programacion` (`auditoria`, `sitios_por_auditoria`, `turnos_sitio_auditoria`, `procesos_sitio_auditoria`, `comentarios_por_auditoria`), `resultado`, `hallazgo`. Los enlaces de solo lectura hacia auditorías desde pestañas hijas (p. ej. `cert-tab-auditorias`, `organizacion`, `sitio`, `proceso`, `turno`, `estatus`) permanecen intactos sin refactorizar sus vistas destino.
- **NO alterar** `certificado` en su núcleo ya estabilizado salvo para conectar la creación/navegación de sub-entidades (`requisitos_no_aplicables_certificado`, `fecha_certificado`, `contacto_certificado`, `sitio`, `proceso`, `turno`) y reutilizar sus primitivos compartidos.

---

## 2. Checklist de Paridad Canónica (Estándar `certificado`)

Cada entidad migrada debe cumplir **100%** de las siguientes reglas antes de cerrar su paso:

1. **Multi View (Clean List & Grid):**
   - Usa `renderUniversalTemplate` (`src/views/universalTemplate.ts`) con `tableId`, `columnWidths`, `sortState`, y `getRowAttrs` para clic completo en fila (`<tr>`).
   - En Grid, cada tarjeta usa `data-action="..."` y cursor `pointer` para apertura directa con un clic.
   - **Cero botones en celdas `<tbody>`:** Prohibido incluir columnas `acciones` con botones (`Ver Detalle →`, `Ver Protocolo →`, `Ver Ficha →`) o `<button>` interactivos dentro de `<td>`.
   - Tablas listadas con `table-fixed` + `<colgroup>` cuya suma de `defaultWidthPct` equivale exactamente a **`100`** (`minWidthPx` explícito, `truncate` + `title` nativo).
   - CTA de creación en barra de herramientas (`actionsHtml`): botón icono cuadrado **`w-9 h-9 rounded-lg bg-sky-700 hover:bg-sky-800 text-white`** (`+`) visible solo para personal Staff aprobado (`ADMIN` o `WORKER`), navegando directo a Detail View en modo `'add'`. Se eliminan formularios inline de creación en Multi View (`isCreating` dentro del directorio).

2. **Detail View Unificado (`'read' | 'add' | 'edit'`):**
   - Contrato de modo único por dominio: `type <Entidad>DetailMode = 'read' | 'add' | 'edit'` resuelto con `resolve<Entidad>DetailMode(state, isStaff, selectedItem)` (usuarios `CLIENT`, `AUDITOR` o no aprobados siempre resuelven `'read'`).
   - Usa `renderDetailPageTemplate` (`src/views/detailTemplate.ts`) con:
     - `isCreateMode: mode === 'add'` (oculta historial `🕒`, archivar `🗄️` y Zona 3 `childTabsHtml`).
     - `customTopActionsHtml` usando el orden obligatorio:
       - En `'read'` (Staff): `[✏️ Editar]` + `[🕒 Historial]` + `[🗄️ Archivar]`.
       - En `'add' | 'edit'`: **PRIMERO Guardar** (`type="submit"`, `form="<formId>"`, `w-9 h-9 bg-emerald-600 hover:bg-emerald-700 text-white`) y **SEGUNDO Cancelar** (`type="button"`, `w-9 h-9 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200`).
     - **Cero botones al pie del formulario:** Ningún formulario en `'add'` o `'edit'` renderiza botones `Cancelar` / `Guardar` / `Crear` al final de la Zona 2.

3. **Zonas de Ficha de Detalle:**
   - **Zona 1 (Padres — `customParentZoneHtml` / `parents`):** En `'read'`, chips clicables `DetailParentChip` hacia el padre correspondiente. En `'add' | 'edit'`, tarjetas `<select form="<formId>" ...>` editables con filtrado/cascada en vivo cuando existan relaciones padre→hijo.
   - **Zona 2 (Atributos Directos — `<form id="<formId>">`):**
     - Campos booleanos en `'read'` muestran badge de alto contraste (`✓` vs `✕`), nunca checkboxes deshabilitados ambiguos; en `'add' | 'edit'`, checkboxes habilitados **sin asterisco `*`** en la etiqueta (un booleano `NOT NULL` puede ser `true` o `false`).
     - Errores de validación mostrados inline dentro del formulario (`role="alert"`, `bg-rose-50 border-rose-200 text-rose-800`).
     - **Cero banners verdes inline (`saveSuccessMessage` / `createSuccessMessage`):** Todo guardado o creación exitosa invoca `showFloatingToast(msg, 'success')` (`#archiveGovernanceToast` inferior flotante, auto-cierre 4.5 s, botón `✕`, sin alterar el flujo de layout).
   - **Zona 3 (Hijos — `childTabsHtml`):** Visible solo en `'read' | 'edit'` (preferentemente `'read'`), pestañas limpias con `renderListViewTable` (`table-fixed`, `<colgroup>`, `tableId`, `getRowAttrs`), sin párrafos introductorios redundantes ni formularios/tablas crudas inline. Los botones `+ Agregar ...` en cabecera de pestaña navegan a la Detail View del hijo en modo `'add'` con su padre preseleccionado.

4. **Navegación, Breadcrumbs, RBAC y Gobernanza:**
   - Breadcrumbs compuestos para cada sub-entidad y modo Alta (`id: '<entidad>-new'`) en `src/lib/breadcrumb.ts`, sin saltos de línea (`whitespace-nowrap`).
   - RBAC unificado mediante `isApprovedStaffProfile(profile)` (`(role === 'ADMIN' || role === 'WORKER') && (!status || status === 'APPROVED')`) — corrigiendo vistas Extra donde solo se verificaba `role`.
   - **Política Cero-UUID:** Ninguna inserción en Supabase usa UUIDs sintéticos (`a000...`, `da00...`); validar referencias con `assertValidUuid(...)`.
   - Toda entidad archivable opera mediante `get_archive_dependency_summary` + `archive_record` + `restoreArchivedRecord`.

---

## 3. Matriz de Inventario y Diagnóstico Actual vs. Objetivo

| Paso | Módulo / Entidades | Archivo(s) Principal(es) | Estado Actual (Brechas Detectadas) | Estado Objetivo |
| :--- | :--- | :--- | :--- | :--- |
| **Step 1** | Core Compartido (`detailTemplate`, `breadcrumb`, RBAC, Toast, `archive_record`) | `src/views/detailTemplate.ts`, `src/lib/breadcrumb.ts`, `src/lib/rbac.ts`, `src/views/extraView.ts`, `src/views/certificacionView.ts`, `public/supabase/queries/04_rls.sql` | Sin helper compartido `renderDetailHeaderFormActions`; faltan tipos breadcrumb para `organismo_acreditacion`, `subsector_iaf`, `requisito`, `no_aplicable`, `acceso_cliente`, `competencia_auditor`; `extraView`/`normaView`/`sectorIafView` no validan `status === 'APPROVED'`; `client_organization_access` ausente de `archive_record`. | Primitivos compartidos listos; RBAC estricto y breadcrumbs completos para los pasos 2.1–4.3. |
| **Step 2.1** | `estatus`, `tipo_auditoria`, `metodologia_auditoria` | `src/views/estatusView.ts`, `src/views/tipoAuditoriaView.ts`, `src/views/metodologiaAuditoriaView.ts`, `src/lib/extraDomain.ts` | Columna `acciones` (`Ver Detalle →`) en `<tbody>`; sin `tableId`/`defaultWidthPct`/`getRowAttrs`; solo lectura (`read`), sin `+ Nuevo` ni `'add' | 'edit'`; tablas hijas crudas. | Clean List 100%, `+` en cabecera, Detail `'read' | 'add' | 'edit'`, toast flotante, tablas hijas `renderListViewTable`. |
| **Step 2.2** | `organismo_acreditacion` y `acreditacion_norma_iaf` | `src/views/organismoAcreditacionView.ts` *(nuevo)*, `src/views/acreditacionView.ts`, `src/lib/acreditacionDomain.ts` | `organismo_acreditacion` sin vista propia; `acreditacionView` usa `renderCreateAcreditacionForm` inline en directorio, botones al pie, banner verde inline, `<button>` en `<td>` y Zone 1 bloqueada en edición. | Vista completa para `organismo_acreditacion`; `acreditacionView` 100% canónica (`'read' | 'add' | 'edit'`, Zone 1 `<select>`). |
| **Step 2.3** | `sector_iaf` y hijo `subsector_iaf` | `src/views/sectorIafView.ts`, `src/views/subsectorIafView.ts` *(nuevo)*, `src/lib/extraDomain.ts` | `sectorIafView` solo lectura, columna `acciones`, modal `#newSubsectorModalBtn` para crear subsector sin Detail View de `subsector_iaf`. | `sector_iaf` + `subsector_iaf` ambos con Multi/Detail `'read' | 'add' | 'edit'`, cascada `id_sector_iaf`, Zone 1 link bidireccional. |
| **Step 2.4** | `norma` y hijo `requisito` (LTREE) | `src/views/normaView.ts`, `src/views/requisitoView.ts` *(nuevo)*, `src/lib/extraDomain.ts` | `normaView` solo lectura, columna `acciones`, modal `#inspectClauseBackdrop` para requisitos sin `'add' | 'edit'`, modal `#newAccreditationBackdrop` en pestaña acreditación. | `norma` + `requisito` en `'read' | 'add' | 'edit'`; selección viva `id_norma` → `id_requisito_padre` y cálculo de `ruta_materializada` LTREE; botón `+` acreditación navega a Step 2.2 `'add'`. |
| **Step 3.1** | `organizacion` y hijo `client_organization_access` | `src/views/organizacionView.ts`, `src/views/clientAccessView.ts` *(nuevo)*, `src/lib/activeCertificates.ts` | `organizacionView` con creación inline en Multi View, columna `acciones` (`Ver Ficha →`), botones al pie y banner verde en Detail Edit; `client_organization_access` ausente de Organización. | `organizacion` 100% canónica + pestaña hija `Acceso Cliente` y Detail View `clientAccessView` (`'read' | 'add' | 'edit'`). |
| **Step 3.2** | `auditor` y M:N `norma_auditor`, `sector_iaf_auditor`, `subsector_iaf_auditor` | `src/views/auditorView.ts`, `src/views/competenciaAuditorView.ts` *(nuevo)*, `src/lib/competencyMatrix.ts` | `auditorView` con creación inline en Multi View, columna `acciones` (`Ver Ficha →`), botones al pie, banner verde y botón `open-add-competency-modal` sin flujo real. | `auditor` 100% canónico + gestión real M:N en `norma_auditor`, `sector_iaf_auditor` y `subsector_iaf_auditor` con cascada viva `sector_iaf` → `subsector_iaf`. |
| **Step 4.1** | `requisitos_no_aplicables_certificado` y `turno` | `src/views/noAplicableView.ts` *(nuevo)*, `src/views/turnoView.ts`, `src/views/certificadoView.ts`, `src/lib/turnoDomain.ts` | `no_aplicables` salta a modal de Norma sin Detail View propio ni Alta/Edición; `turnoView` sin modo `'add'`, con botones al pie, banner verde y tabla cruda en pestaña `sitios`. | Detail View `'read' | 'add' | 'edit'` para `requisitos_no_aplicables_certificado` (filtro cláusulas por norma + justificación 4.3) y `turnoView` 100% canónico. |
| **Step 4.2** | `sitio` (+ `turnos_por_sitio`) y `proceso` (+ `requisitos_por_proceso`) | `src/views/sitioView.ts`, `src/views/procesoView.ts`, `src/lib/sitioDomain.ts`, `src/lib/procesoDomain.ts` | Sin modo `'add'`, con botones al pie, banners verdes (`saveSuccessMessage`, `shiftActionMessage`, `requisitoActionMessage`), tablas crudas con botones `Desvincular`/`Quitar` dentro de `<td>`. | `sitio` y `proceso` en `'read' | 'add' | 'edit'` canónico (protección Sede 0), Zone 1 editable y tablas hijas limpias `renderListViewTable`. |
| **Step 4.3** | `fecha_certificado`, `contacto_certificado`, `telefono_contacto_certificado`, `email_contacto_certificado` | `src/views/fechaView.ts`, `src/views/contactoView.ts`, `src/views/telefonoView.ts`, `src/views/emailView.ts`, `src/lib/certificadoSubEntities.ts` | Las 4 vistas ya tienen Detail View, pero carecen de modo `'add'`, usan botones al pie + banner verde inline; `contactoView` crea teléfonos y emails con formularios inline dentro de pestañas. | Las 4 vistas migradas a `'read' | 'add' | 'edit'` canónico; `+ Teléfono` y `+ Email` navegan a sus respectivas Detail Views en modo `'add'`. |
| **Step Final** | Pruebas, Integridad Global y Compuertas CLI | `src/lib/*.test.ts`, auditoría transversal | Suites `phase42`, `phase421`, `phase62` requieren cobertura de las nuevas vistas `Extra` y `Certificación`. | Cobertura `node:test` completa + validación CLI (`tsx --test`, `lint`, `build`) + verificación E2E en navegador. |

---

## 4. Orden de Ejecución y Dependencias

```
step_1 (Infraestructura compartida, RBAC, Breadcrumbs, detailTemplate, Toast)
  ├── step_2.1 (Extra: Estatus, Tipo Auditoría, Metodología Auditoría)
  ├── step_2.2 (Extra: Organismo de Acreditación + Acreditación Norma IAF)
  │     └── step_2.3 (Extra: Sector IAF + Subsector IAF)
  │           └── step_2.4 (Extra: Norma + Requisito LTREE)
  │                 ├── step_3.1 (Certificación: Organización + Acceso Cliente)
  │                 └── step_3.2 (Certificación: Auditor + Competencias M:N)
  │                       ├── step_4.1 (Árbol Certificado: No Aplicables + Turno)
  │                       ├── step_4.2 (Árbol Certificado: Sitio/Turnos + Proceso/Requisitos)
  │                       └── step_4.3 (Árbol Certificado: Fecha + Contacto + Teléfono + Email)
  └──────────────────────────────────────────────────────────────────────────▶ step_final
```

**Regla de ejecución secuencial:** Cada paso está diseñado para ejecutarse en una sesión focalizada y verificarse de forma independiente con `npx tsx --test src/lib/*.test.ts`, `npm run lint` y `npm run build` antes de avanzar al siguiente.
