# Especificaciones Técnicas de Componentes y Contratos (`certificado`)

Documento de referencia exacta para contratos TypeScript, anatomía DOM, clases Tailwind CSS v4, especificaciones de columnas, esquema PostgreSQL y políticas RLS del dominio **`certificado`**.

---

## 1. Contratos TypeScript Exactos

### 1.1 Estado y Formularios del Dominio (`src/lib/multisiteSampling.ts`)

```ts
export type CertificadoChildTab =
  | 'sitios'
  | 'procesos'
  | 'turnos'
  | 'no_aplicables'
  | 'auditorias'
  | 'fechas'
  | 'contactos';

export type CertificadoDetailMode = 'read' | 'add' | 'edit';

export interface CertificadoFormDraft {
  id_organizacion: string;
  id_norma: string;
  id_estatus: string;
  id_sector_iaf: string;
  id_subsector_iaf: string;
  numero_certificado: string;
  multisitio: boolean;
  alcance: string;
}

export interface CertificadoViewState {
  selectedCertId: string | null;
  activeChildTab: CertificadoChildTab;
  query: string;
  selectedStandard: string;
  selectedStatus: string;
  selectedSectorIaf: string;
  viewMode: 'grid' | 'list';
  sortColumn:
    | 'numero_certificado'
    | 'organizacion'
    | 'norma'
    | 'estatus'
    | 'vigencia'
    | 'sedes'
    | null;
  sortDirection: 'asc' | 'desc' | 'none';
  childSortState?: Partial<Record<CertificadoChildTab, SortState>>;
  isEditingAttributes: boolean;
  formDraft?: CertificadoFormDraft;
  editFormData?: {
    numero_certificado: string;
    multisitio: boolean;
    alcance: string;
  };
  editErrorMessage?: string | null;
  saveSuccessMessage?: string | null;
  originatingOrganizacionId?: string | null;
  isSidebarOpen?: boolean;
  facetSelections?: MultiViewSelectionMap;
  isCreating?: boolean;
  createErrorMessage?: string | null;
}
```

### 1.2 Entidad Detallada de Certificado (`CertificadoDetailEntity`)

```ts
export interface CertificadoDetailEntity {
  id: string;
  numero_certificado: string;
  id_organizacion: string;
  organizacion_nombre: string;
  organizacion_rif: string;
  direccion_fiscal?: string;
  id_norma: string;
  norma_codigo: string;
  norma_titulo: string;
  esquema: string;
  id_estatus: string;
  estatus: 'Activo' | 'Estudio' | 'Suspendido' | 'Cancelado' | string;
  id_sector_iaf: string;
  sector_iaf: number;
  sector_iaf_descripcion: string;
  id_subsector_iaf: string;
  subsector_iaf_codigo?: string;
  subsector_iaf_descripcion?: string;
  subsector_categoria_riesgo?: 'ALTO' | 'MEDIO' | 'BAJO';
  organismo_acreditador_codigo?: string;
  organismo_acreditador_nombre?: string;
  numero_acreditacion?: string;
  fecha_emision: string;
  fecha_vencimiento: string;
  alcance: string;
  multisitio: boolean;
  sitios: SiteEntity[];
  procesos: ProcessEntity[];
  turnos: ShiftEntity[];
  noAplicables: NonApplicableRequirementEntity[];
  auditorias: AuditEntity[];
  fechas: FechaCertificadoEntity[];
  contactos: ContactoCertificadoEntity[];
}
```

### 1.3 Plantilla de Detalle (`src/views/detailTemplate.ts`)

```ts
export interface DetailPageTemplateProps {
  entityType: string;
  entitySymbol: string;
  title: string;
  subtitle?: string;
  eyebrowCode?: string;
  statusBadge?: {
    label: string;
    badgeClass: string;
    symbol?: string;
    dotClass?: string;
  };
  secondaryHeaderBadge?: {
    label: string;
    badgeClass?: string;
  };
  backButton: {
    label: string;
    nav: string;
    subview?: string;
    action?: string;
  };
  editActionButton?: {
    id: string;
    visible: boolean;
    isEditing?: boolean;
    cancelId?: string;
  };
  extraActionButtonsHtml?: string;
  trailingActionButtonsHtml?: string;
  parents?: DetailParentChip[];
  parentMetaHtml?: string;
  tableName: string;
  recordId: string;
  recordActionsHtml?: string;
  feedbackHtml?: string;
  attributes: DetailAttributeItem[];
  customRecordBodyHtml?: string;
  editableScopeField?: {
    label: string;
    value: string;
    maxLength: number;
    fieldName: string;
  };
  childTabs?: DetailChildTab[];
  activeChildTabId?: string;
  childTabAttrName?: string;
  renderChildTabContent?: (activeTabId: string) => string;
  extraSectionsHtml?: string;
  modalsHtml?: string;
  isCreateMode?: boolean;
  customParentZoneHtml?: string;
  customTopActionsHtml?: string;
}
```

> **Invariante clave de `detailTemplate.ts`:**
> - Si `isCreateMode === true`: oculta automáticamente el botón `[🕒]` (`data-action="open-changelog"`), `trailingActionButtonsHtml` y toda la sección de pestañas hijas (`childTabsHtml`).
> - Si `customTopActionsHtml !== undefined`: reemplaza completamente el bloque estándar derecho de botones en la cabecera (usado en Certificado para modos `'add'` y `'edit'`).
> - Si `customParentZoneHtml` tiene contenido: renderiza `<section aria-label="Contexto y relaciones superiores">` seguido de `<hr class="border-t border-slate-200 my-2.5 sm:my-3" />`.
> - Si `customRecordBodyHtml !== undefined`: reemplaza el renderizado por defecto de `attributesHtml + editableScopeHtml` dentro de `<section aria-label="Detalle del registro">`.

### 1.4 Motor de Cascada, Validación y Factorías (`src/lib/multisiteSampling.ts`)
- `createEmptyCertificadoFormDraft(): CertificadoFormDraft` — Inicializa los 5 IDs en `''`, `numero_certificado: ''`, `multisitio: false`, `alcance: ''`.
- `createCertificadoFormDraftFromEntity(cert: CertificadoDetailEntity): CertificadoFormDraft` — Copia las 5 FKs y los 3 atributos directos del certificado.
- `filterSubsectoresBySectorIaf({ sectorId, sectores, subsectores })`:
  - Retorna `[]` cuando `sectorId.trim() === ''`.
  - Coincide si `sub.id_sector_iaf === cleanSectorId || (matchedSector && sub.sector_numero === matchedSector.sector)`.
  - Ordena numéricamente por segmento punteado (`17.1`, `17.2`, ..., `17.10`) vía `compareSubsectorCodigo`.
- `reconcileSubsectorSelectionOnSectorChange({ nextSectorId, currentSubsectorId, sectores, subsectores })`:
  - Devuelve `currentSubsectorId` si existe dentro de los candidatos filtrados para `nextSectorId`; si no, devuelve `''`.
- `validateAlcance(alcance)` — Exige longitud recortada entre `10` y `1000` caracteres.
- `validateCertificadoFormDraft({ mode, draft, currentCertId, existingCertificates, sectores, subsectores })`:
  1. Verifica las 5 FKs no vacías (mensajes específicos: `'Debe seleccionar una Organización.'`, `'Debe seleccionar una Norma.'`, `'Debe seleccionar un Estatus.'`, `'Debe seleccionar un Sector IAF.'`, `'Debe seleccionar un Sub-Sector IAF.'`).
  2. Verifica pertenencia del sub-sector al sector vía `filterSubsectoresBySectorIaf`.
  3. Verifica `numero_certificado` de `3` a `100` caracteres y unicidad case-insensitive contra `existingCertificates` (excluyendo `currentCertId` cuando `mode === 'edit'`).
  4. Verifica `validateAlcance(normalized.alcance)`.
  5. Devuelve `{ valid: true, normalized }` o `{ valid: false, error }`.

---

## 2. Especificación de Selectores DOM, Atributos y Clases Tailwind

### 2.1 Navegación y Breadcrumb (`src/views/breadcrumbView.ts`)
| Elemento | Selector / Atributos | Clases Exactas |
| :--- | :--- | :--- |
| Nav raíz | `nav[aria-label="Navegación jerárquica"]` | `w-full py-0.5 mb-0` |
| Lista en una línea | `ol` | `flex flex-nowrap items-center gap-1.5 text-xs text-slate-500 overflow-hidden whitespace-nowrap` |
| Segmento clicable | `button[data-breadcrumb-id][data-breadcrumb-idx]` | `font-medium text-slate-600 hover:text-indigo-600 hover:underline transition-colors cursor-pointer text-xs truncate max-w-[140px] sm:max-w-[200px] lg:max-w-[280px] xl:max-w-[360px] text-left` |
| Botón elipsis (`> 4` niveles) | `button[data-breadcrumb-id][data-breadcrumb-ellipsis="true"]` | `inline-flex items-center justify-center px-1.5 py-0.5 rounded text-xs font-semibold text-slate-500 hover:text-indigo-600 hover:bg-slate-200/70 transition-colors cursor-pointer shrink-0` |
| Hoja activa (`aria-current="page"`) | `li[aria-current="page"] > span` | `font-semibold text-slate-900 text-xs truncate max-w-[140px] sm:max-w-[200px] md:max-w-[260px] lg:max-w-[360px] xl:max-w-[460px]` |

### 2.2 Multi View Directorio (`data-mv-domain="certificados"`)
| Control | ID / Atributos | Clases / Comportamiento Exacto |
| :--- | :--- | :--- |
| Tarjeta maestra | `div[data-mv-domain="certificados"]` | `bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden` |
| CTA Nuevo Certificado | `button[data-action="open-create-cert"]` | `inline-flex items-center justify-center w-9 h-9 rounded-lg bg-sky-700 hover:bg-sky-800 text-white transition-colors cursor-pointer shadow-2xs shrink-0` (solo staff aprobado) |
| Toggle Sidebar | `button#toggleMultiViewSidebarBtn[data-toggle-sidebar="true"]` | `w-9 h-9 rounded-lg border` (`bg-slate-900 text-white` si abierto; `bg-white text-slate-700` si cerrado) |
| Input de búsqueda | `input#certDirectorySearchInput[type="text"][data-universal-search="true"][autocomplete="off"]` | `w-full h-9 text-xs rounded-lg border border-slate-200 bg-white pl-9 pr-9 shadow-2xs` |
| Limpiar búsqueda | `button#clearCertSearchBtn[data-clear-search="true"]` | Botón único `✕` cuando hay texto; `<kbd>/</kbd>` cuando está vacío |
| Toggle Archivados | `input#showArchivedCheckbox[data-action="toggle-show-archived"]` | Renderizado únicamente si `canInspectArchived === true` (`ADMIN` aprobado) |
| Switcher Vista | `div[role="group"][aria-label="Modo de vista"]` | Botones `data-view-mode="grid"` y `data-view-mode="list"` (`w-8 h-full`) |
| Sidebar Facetas | `aside#multiViewFacetSidebar` | `w-full lg:w-64 xl:w-72 shrink-0 min-w-0 overflow-hidden border-b lg:border-b-0 lg:border-r border-slate-200 bg-slate-50/60 p-4 space-y-4` (o `hidden`) |
| Sección Archivados | `div#archivedRecordsSection` | Visible solo para `ADMIN` cuando `showArchived === true`; cada fila usa `data-archived-item="<table>:<id>"` y botón `data-action="restore-archived-record"` |

### 2.3 Detail View Unificado (`certificadoView.ts` + `detailTemplate.ts`)
| Elemento | ID / Atributos | Especificación Exacta |
| :--- | :--- | :--- |
| Botón Volver | `button[data-nav="certificacion"][data-subview="certificates"][data-nav-back="true"]` | `w-9 h-9 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-slate-700`, `title="Volver"` |
| Editar (`read`, staff) | `button#startEditCertBtn` | `w-9 h-9 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700`, `title="Editar"` |
| Historial (`read`) | `button[data-action="open-changelog"][data-table-name="certificado"]` | `w-9 h-9 rounded-lg border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700`, `title="Historial de Cambios"` |
| Archivar (`read`, staff) | `button[data-action="open-archive-modal"][data-table-name="certificado"]` | `w-9 h-9 rounded-lg border border-rose-200 bg-white hover:bg-rose-50 text-rose-600`, `title="Archivar"` |
| **Guardar (`add`/`edit`, 1º)** | `button#saveCertFormBtn[type="submit"][form="certificadoDetailForm"]` | `inline-flex items-center justify-center w-9 h-9 rounded-lg border border-emerald-600 bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs transition-colors cursor-pointer shrink-0` |
| **Cancelar (`add`/`edit`, 2º)** | `button#cancelEditCertBtn[type="button"]` | `inline-flex items-center justify-center w-9 h-9 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 shadow-2xs transition-colors cursor-pointer shrink-0` |
| Grilla Zona 1 (Padres) | `div` dentro de `section[aria-label="Contexto y relaciones superiores"]` | `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-2.5` |
| Selects Zona 1 | `#certParentOrganizacionSelect`, `#certParentNormaSelect`, `#certParentEstatusSelect`, `#certParentSectorIafSelect`, `#certParentSubsectorIafSelect` | Todos con `form="certificadoDetailForm"`, `required`, `<option value="">Seleccione...</option>`, `disabled` en `'read'`; etiqueta con `*` (`text-rose-600`) |
| Botones salto `→` (Zona 1) | `button[data-parent-nav="true"]` | `w-5 h-5 rounded border border-indigo-200 bg-white hover:bg-indigo-50 text-indigo-600`; renderizados **solo** en `'read'` |
| Formulario Zona 2 | `form#certificadoDetailForm` | `space-y-3 bg-slate-50/70 p-3 sm:p-3.5 border border-slate-200/90 rounded-xl` |
| Código Certificado | `input#certNumeroInput[name="numero_certificado"][required][minlength="3"][maxlength="100"]` | Etiqueta con `*`; `disabled` en `'read'` |
| Multisitio (`read`) | `input#certMultisitioCheckbox[type="checkbox"][name="multisitio"][disabled]` | **Sin `*` en etiqueta.** Usa `appearance-none h-4 w-4 rounded border`: checked = `border-emerald-600 bg-emerald-600` + `<svg>` blanco (`<polyline points="4 10 8 14 16 6" />`) + pill contenedor `border-emerald-200 bg-emerald-50/70 text-emerald-900 font-bold`; unchecked = `border-slate-300 bg-white` + `border-slate-200 bg-slate-100/80 text-slate-600` |
| Multisitio (`add`/`edit`) | `input#certMultisitioCheckbox[type="checkbox"][name="multisitio"]` | Sincroniza `#certMultisitioLabelText` (`Sí · Esquema Multisitio` / `No · Sede Única`) y `#certMultisitioIcon` (`🏢` / `📍`) |
| Alcance | `textarea#certAlcanceInput[name="alcance"][rows="3"][required][minlength="10"][maxlength="1000"]` | Etiqueta con `*`; contador vivo `#certAlcanceLiveCounter` (`(X / 1000 caracteres)`) |
| Toast Flotante Éxito | `div#archiveGovernanceToast[role="status"][aria-live="polite"]` | `fixed bottom-5 left-1/2 -translate-x-1/2 z-50 ... bg-emerald-900/95 text-emerald-50 border-emerald-700`; cierre por `#dismissArchiveToastBtn` (`✕`) o timer `4500ms`; 0px layout shift |
| Zona 3 Pestañas Hijas | `section[aria-label="Registros relacionados"]` (`[data-cert-tab]`) | Omitida en `isCreateMode`; botones `role="tab"` para `sitios`, `procesos`, `turnos`, `no_aplicables`, `auditorias`, `fechas`, `contactos` |

---

## 3. Especificación de Columnas `table-fixed` (Directorio y 7 Pestañas Hijas)

Todas las tablas usan `renderListViewTable` con `<colgroup>` normalizado al **100%**, `whitespace-nowrap overflow-hidden text-ellipsis` y cero controles interactivos dentro de `<tbody>`.

### 3.1 Directorio Principal (`tableId: 'certificados-main'`)
*Row action:* `data-action="select-cert" data-cert-id="<id>"`

| Orden | `id` | `header` | `align` | `defaultWidthPct` | `minWidthPx` | Contenido de Celda |
| :---: | :--- | :--- | :---: | :---: | :---: | :--- |
| 1 | `organizacion` | Organización | `left` | **23%** | 140px | Nombre en negrita + `RIF: ...` en monospace |
| 2 | `numero_certificado` | Código de Certificado | `left` | **19%** | 120px | Pill `📜 {numero_certificado}` |
| 3 | `norma` | Norma | `left` | **16%** | 100px | `norma_codigo` + `esquema` |
| 4 | `sedes` | Sedes Multisitio | `center` | **17%** | 110px | `🏢` / `📍` + `countMultisiteBranches(sitios)` |
| 5 | `estatus` | Estatus | `center` | **13%** | 95px | Badge semántico con punto de color |
| 6 | `vigencia` | Vigencia | `right` | **12%** | 95px | `fecha_emision` y `→ fecha_vencimiento` |

### 3.2 Pestaña 1: Sitio (`tableId: 'cert-tab-sitios'`)
*Orden predeterminado:* `sortSitesWithPrincipalFirst` (**Sede 0 primero**).
*Row action:* `data-action="select-sitio-preview" data-sitio-id="<id>" data-cert-id="<certId>"`

| `id` | `header` | `align` | `defaultWidthPct` | `minWidthPx` |
| :--- | :--- | :---: | :---: | :---: |
| `numero_sitio` | N° Sede | `left` | **12%** | 85px |
| `nombre_sitio` | Nombre de la Sede | `left` | **24%** | 140px |
| `tipo_sitio` | Tipo de Sede | `left` | **18%** | 120px |
| `direccion_sitio` | Dirección Física | `left` | **22%** | 130px |
| `personal_count` | Personal | `center` | **10%** | 80px |
| `turnos_vinculados` | Turnos Asignados | `left` | **14%** | 100px |

### 3.3 Pestaña 2: Proceso (`tableId: 'cert-tab-procesos'`)
*Row action:* `data-action="select-proceso-preview" data-proceso-id="<id>" data-cert-id="<certId>"`

| `id` | `header` | `align` | `defaultWidthPct` | `minWidthPx` |
| :--- | :--- | :---: | :---: | :---: |
| `nombre_proceso` | Proceso | `left` | **28%** | 140px |
| `tipo` | Tipo | `left` | **16%** | 100px |
| `responsable` | Responsable | `left` | **22%** | 120px |
| `clausulas_cubiertas` | Cláusulas Normativas Cubiertas | `left` | **34%** | 160px |

### 3.4 Pestaña 3: Turno (`tableId: 'cert-tab-turnos'`)
*Row action:* `data-action="select-turno-preview" data-turno-id="<id>" data-cert-id="<certId>"`

| `id` | `header` | `align` | `defaultWidthPct` | `minWidthPx` |
| :--- | :--- | :---: | :---: | :---: |
| `descripcion` | Turno Operativo | `left` | **28%** | 140px |
| `horario` | Horario | `left` | **22%** | 120px |
| `empleados_activos` | Personal | `center` | **16%** | 90px |
| `sitios_vinculados` | Sedes Vinculadas | `left` | **34%** | 150px |

### 3.5 Pestaña 4: No Aplicables (`tableId: 'cert-tab-no_aplicables'`)
*Row action:* `data-action="select-no-aplicable" data-requisito-id="<id_requisito>" data-norma-id="<id_norma>" data-codigo="<codigo>" data-cert-id="<certId>"`

| `id` | `header` | `align` | `defaultWidthPct` | `minWidthPx` |
| :--- | :--- | :---: | :---: | :---: |
| `requisito_codigo` | Cláusula | `left` | **16%** | 100px |
| `requisito_titulo` | Requisito Excluido | `left` | **32%** | 150px |
| `justificacion` | Justificación Técnica Obligatoria (ISO 4.3) | `left` | **52%** | 200px |

### 3.6 Pestaña 5: Auditoría (`tableId: 'cert-tab-auditorias'`)
*Row action:* `data-action="select-prog-audit-by-code" data-audit-code="<codigo>" data-audit-id="<id>"`

| `id` | `header` | `align` | `defaultWidthPct` | `minWidthPx` |
| :--- | :--- | :---: | :---: | :---: |
| `codigo_auditoria` | Código Auditoría | `left` | **18%** | 110px |
| `tipo_auditoria` | Modalidad | `left` | **16%** | 100px |
| `metodologia` | Metodología | `left` | **14%** | 90px |
| `fecha_programacion` | Fecha Programada | `left` | **16%** | 105px |
| `auditor_lider` | Auditor Líder | `left` | **22%** | 120px |
| `estatus` | Estatus | `center` | **14%** | 95px |

### 3.7 Pestaña 6: Fecha (`tableId: 'cert-tab-fechas'`)
*Row action:* `data-action="select-fecha-detail" data-fecha-id="<id>" data-cert-id="<certId>"`

| `id` | `header` | `align` | `defaultWidthPct` | `minWidthPx` |
| :--- | :--- | :---: | :---: | :---: |
| `tipo_fecha` | Tipo de Fecha | `left` | **38%** | 140px |
| `fecha` | Fecha | `left` | **30%** | 120px |
| `estado_temporal` | Referencia Temporal | `center` | **32%** | 130px |

### 3.8 Pestaña 7: Contacto (`tableId: 'cert-tab-contactos'`)
*Row action:* `data-action="select-contacto-detail" data-contacto-id="<id>" data-cert-id="<certId>"`

| `id` | `header` | `align` | `defaultWidthPct` | `minWidthPx` |
| :--- | :--- | :---: | :---: | :---: |
| `nombre` | Nombre Completo | `left` | **28%** | 150px |
| `cargo` | Cargo / Rol | `left` | **24%** | 120px |
| `telefonos_resumen` | Teléfonos | `left` | **23%** | 130px |
| `emails_resumen` | Correos Electrónicos | `left` | **25%** | 140px |

---

## 4. Esquema PostgreSQL, Índices, Triggers y Seguridad RLS

### 4.1 Tabla Principal `public.certificado` (`01_creacion.sql`)
- **Llave primaria:** `id UUID PRIMARY KEY DEFAULT uuid_generate_v4()`
- **5 Llaves Foráneas obligatorias (`NOT NULL ON DELETE RESTRICT`):**
  - `id_norma UUID NOT NULL REFERENCES norma(id) ON DELETE RESTRICT`
  - `id_estatus UUID NOT NULL REFERENCES estatus(id) ON DELETE RESTRICT`
  - `id_sector_iaf UUID NOT NULL REFERENCES sector_iaf(id) ON DELETE RESTRICT`
  - `id_subsector_iaf UUID NOT NULL REFERENCES subsector_iaf(id) ON DELETE RESTRICT`
  - `id_organizacion UUID NOT NULL REFERENCES organizacion(id) ON DELETE RESTRICT`
- **3 Atributos Directos Mutables:**
  - `numero_certificado VARCHAR(100) NOT NULL`
  - `alcance VARCHAR(1000) NOT NULL DEFAULT ''`
  - `multisitio BOOLEAN NOT NULL DEFAULT FALSE`
- **Metadatos de Auditoría y Soft-Delete:** `created_at`, `updated_at`, `deleted_at TIMESTAMPTZ DEFAULT NULL`, `deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL`, `delete_reason TEXT`.

### 4.2 Tablas Hijas Directas y Dependencias Verificadas en Archivo Lógico
| Tabla Hija | FK hacia Padre | Restricción CHECK / Nota Clave | Contada por `get_archive_dependency_summary` |
| :--- | :--- | :--- | :---: |
| `public.sitio` | `id_certificado` | `numero_sitio INTEGER NOT NULL CHECK (numero_sitio >= 0)` (0 = Sede Central) | Sí |
| `public.proceso` | `id_certificado` | `tipo IN ('Estratégico', 'Medular', 'De Apoyo', 'Otro')` | Sí |
| `public.auditoria` | `id_certificado` | `ON DELETE RESTRICT` hacia `certificado`, `tipo_auditoria`, `metodologia_auditoria` | Sí |
| `public.requisitos_no_aplicables_certificado` | `id_certificado`, `id_requisito` | `justificacion TEXT NOT NULL DEFAULT ''` | Sí |
| `public.fecha_certificado` | `id_certificado` | `tipo_fecha IN ('Otorgamiento', 'Renovación', 'Vencimiento', 'Modificación', 'Suspensión', 'Cancelación', 'Ultima Auditoría')` | Sí |
| `public.contacto_certificado` | `id_certificado` | `nombre VARCHAR(180) NOT NULL`, `cargo VARCHAR(150) NULL` | Sí |
| `public.telefono_contacto_certificado` | `id_contacto` | `telefono VARCHAR(50) NOT NULL`, `tipo_telefono VARCHAR(40) NOT NULL DEFAULT 'Oficina'` | Hija de `contacto_certificado` |
| `public.email_contacto_certificado` | `id_contacto` | `email VARCHAR(200) NOT NULL`, `tipo_email VARCHAR(40) NOT NULL DEFAULT 'Trabajo'` | Hija de `contacto_certificado` |

### 4.3 Índices Únicos Parciales e Índices B-Tree (`03_indices_optimizacion.sql`)
- `uq_certificado_numero_active ON public.certificado (numero_certificado) WHERE deleted_at IS NULL` (permite reutilizar un código tras archivar un certificado antiguo).
- Índices parciales equivalentes (`WHERE deleted_at IS NULL`) en: `sitio (id_certificado, numero_sitio)`, `proceso (id_certificado, nombre_proceso)`, `requisitos_no_aplicables_certificado (id_certificado, id_requisito)`, `fecha_certificado (id_certificado, tipo_fecha, fecha)`, `contacto_certificado (id_certificado, LOWER(TRIM(nombre)))`, `telefono_contacto_certificado (id_contacto, TRIM(telefono))`, `email_contacto_certificado (id_contacto, LOWER(TRIM(email)))`.
- Índices de búsqueda B-Tree activos (`WHERE deleted_at IS NULL`): `idx_certificado_numero`, `idx_certificado_organizacion`, `idx_certificado_norma_iaf`, `idx_certificado_subsector_iaf`, `idx_certificado_active`.

### 4.4 Triggers y Funciones RPC (`01_creacion.sql`, `04_rls.sql`)
- **Triggers en `public.certificado`:**
  - `update_certificado_modtime` (`BEFORE UPDATE` → `update_updated_at_column()`)
  - `trg_prevent_hard_delete_certificado` (`BEFORE DELETE` → `fn_prevent_hard_delete()`)
  - `trg_sync_soft_delete_certificado` (`BEFORE UPDATE` → `fn_sync_soft_delete_metadata()`)
  - `trg_guard_archival_certificado` (`BEFORE UPDATE` → `fn_guard_parent_archival()`)
  - `audit_certificado_trigger` (`AFTER INSERT OR UPDATE OR DELETE` → `audit_trigger_func()` hacia `public.audit_log`)
- **RPCs (`SECURITY DEFINER`):**
  - `public.get_archive_dependency_summary(p_table TEXT, p_record_id UUID)` → `{ can_archive, total_active_dependencies, dependencies }`
  - `public.archive_record(p_table TEXT, p_record_id UUID, p_reason TEXT DEFAULT NULL)` → `{ ok, table, record_id, archived_by }` (requiere `is_approved_worker()`).

### 4.5 Matriz RLS por Rol (`public.certificado`)
| Rol (`profiles.status = 'APPROVED'`) | `SELECT` | `INSERT` | `UPDATE` (Atributos / Restaurar) | Soft-Delete (`archive_record`) | `DELETE` Físico |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`ADMIN`** | Todos (activos y `deleted_at IS NOT NULL`) | Sí (`deleted_at IS NULL`) | Sí (incluye restaurar `deleted_at = NULL`) | Sí | **Bloqueado** (`REVOKE DELETE` + Trigger) |
| **`WORKER`** | Todos los activos (`deleted_at IS NULL`) | Sí (`deleted_at IS NULL`) | Solo activos (`deleted_at IS NULL`) | Sí | **Bloqueado** |
| **`CLIENT`** | Solo activos de sus organizaciones aprobadas (`has_client_org_access(id_organizacion)`) | No | No | No | **Bloqueado** |
| **`AUDITOR`** | Solo activos donde está asignado en `equipo_auditor` (`is_auditor_for_cert(id)`) | No | No | No | **Bloqueado** |
| **`PENDING` / `REJECTED` / `anon`** | Sin acceso a `public.certificado` | No | No | No | **Bloqueado** |
