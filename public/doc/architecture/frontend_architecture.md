# Arquitectura del Frontend SPA (`programa_aud`)

> Documento técnico complementario de [`project_resume.md`](../project_resume.md). Describe la aplicación **Single-Page Application (SPA)** en TypeScript estricto (`strict: true`, `0 any`), renderizado declarativo con **29 módulos de lógica pura (`src/lib/` + bundle generado `normasCatalogBundle.ts`)** y **41 vistas modulares (`src/views/`)**, layout panorámico *widescreen* (`max-w-[1720px]`), compilación con Vite (`manualChunks`) y estilos en Tailwind CSS v4.

---

## 1. Orquestación de Estado, Rutas y Seguridad en Cliente (`src/main.ts`)

### 1.1 Contenedor Central de Estado (`AppState`)
`src/main.ts` centraliza el estado tipado en `AppState`, preserva el foco y la posición del cursor durante el re-renderizado de campos de búsqueda/edición y coordina la hidratación paginada en vivo con Supabase:
- **Sesión, Identidad y Perfil:** `booting`, `user`, `profile`, `authorizedClientOrgIds`, `clientAccessRows` (`ClientOrgAccessSummary[]`), `profileForm` (`ProfileFormState`), `activeRoute`, `activeSubSection`, `openMenu`.
- **Navegación Contextual:** `breadcrumbs` (`BreadcrumbSegment[]`) y estado del cajón forense `auditLogModal`.
- **Gobernanza de Archivo Seguro y Restauración (`archiveGovernance`):** `showArchived` (exclusivo `ADMIN`), `modal` (`ArchiveModalState`), `toast` (`ArchiveToastState | null` para notificaciones flotantes no invasivas `#archiveGovernanceToast`), `restoringId`, `archivedRecordsByTable`, `archivedSnapshotsByKey`, `archivedCatalogIds`.
- **Autenticación, Aprobaciones y Diagnóstico:** `auth` (`mode`: `'login' | 'signup'`, modal Reset DB), `approvals` (gestión/consulta de perfiles) y `dbCheck` (5 comprobaciones en vivo contra Supabase).
- **Preferencias de Tablas (`tableColumnWidths`):** Anchos de columna ajustables por usuario para listados Multi View y pestañas de hijos en fichas de detalle.
- **Datos Hidratados y Dominios Operativos (`domainData` + estados de vista):**
  - Bloque Auditoría: `programacionDomain`, `calendarioDomain` (`month` | `quarter` | `gantt`) y `resultadoDomain` (`list` | `kanban` + motor de recomendación ISO/IEC 17021-1).
  - Bloque Certificación: `organizacionDomain`, `clientAccessDomain`, `certificadoDomain`, `sitioDomain`, `procesoDomain`, `turnoDomain`, `noAplicableDomain`, `fechaDomain`, `contactoDomain`, `telefonoDomain`, `emailDomain`, `auditorDomain`, `competenciaAuditorDomain`.
  - Bloque Extra (`extraDomain`): sub-estados independientes para `Norma` (incluyendo `normaRequisitoQuery`, modal `Norma Completa` con buscador y selector de idioma), `Requisito` (`requisitoLangMode`: `'es' | 'en' | 'both'`, estado completo del Editor Rich Text Bilingüe `Visual` / `HTML` / `Vista Previa`, popover de enlace `https://`, picker y autocompletado `{` de placeholders de sub-cláusulas), `Sector IAF` + `Sub-Sector IAF`, `Organismo de Acreditación`, `Acreditación` (cabecera + multi-sector IAF), `Estatus`, `Tipo` y `Metodología`.

### 1.2 Enrutamiento Hash SPA y Guardias RBAC
- **Rutas soportadas (`ActiveRoute`):** `'dashboard'`, `'profile'`, `'approvals'`, `'database'`, `'auditorias'`, `'certificacion'`, `'extra'`.
- **Sincronización Hash (`#/{route}` o `#/{route}/{subview}`):** Escucha `hashchange` y `popstate` sin recargas del documento.
- **Guardia `canAccessRoute(profile, route)` (`src/lib/healthCheck.ts`) y `isApprovedStaffProfile(profile)` (`src/lib/rbac.ts`):**
  - `'dashboard'` y `'profile'` (`Mi Perfil`) son accesibles para cualquier usuario autenticado, incluyendo cuentas `PENDING` o `REJECTED` para revisar su estado y editar su nombre.
  - Los usuarios `PENDING` o `REJECTED` tienen bloqueadas todas las rutas operativas (`auditorias`, `certificacion`, `extra`, `approvals`, `database`) y cualquier modo `'add' | 'edit'` en vistas de detalle.
  - `'database'` está restringida exclusivamente a `ADMIN` aprobado (`evaluateAdminAccess`).
  - `'approvals'` está disponible para `ADMIN` (gestión) y `WORKER` (solo lectura).
  - `getVisibleDomainMenus(profile)` determina los bloques visibles en cabecera:
    - **Bloque 1 — `Auditoría` (`Programación`, `Calendario`, `Resultado`):** `ADMIN`, `WORKER`, `AUDITOR`, `CLIENT`.
    - **Bloque 2 — `Certificación` (`Organización`, `Certificado`, `Auditor`):** `ADMIN`, `WORKER`, `CLIENT` (oculto para `AUDITOR`).
    - **Bloque 3 — `Extra` (`Norma`, `Sector IAF`, `Acreditación`, `Estatus`, `Tipo`, `Metodología`, más navegación contextual hacia `Organismos de Acreditación`, `Sub-Sectores` y `Requisitos`):** todo usuario `APPROVED`, con creación, edición, autoría bilingüe y archivo restringidos a `ADMIN`/`WORKER` aprobados.

### 1.3 Hidratación Paginada en Vivo, Anti-XSS y Zero-UUID
- Al autenticar un usuario `APPROVED`, `main.ts` ejecuta en paralelo `loadLiveCertificates()` (incluyendo relaciones `subsector_iaf`, `fecha_certificado`, `contacto_certificado` → `telefono_contacto_certificado`/`email_contacto_certificado` y RPC `cobertura_normativa_certificado`) y `loadDomainData()`:
  - **Hidratación Paginada (`paginatedHydration.ts`):** `fetchAllPages()` descarga de forma determinista y sin truncamientos todas las filas de `requisito` (2,188+ registros) y `requisito_traduccion` (2,684+ registros) en páginas ordenadas de hasta 1,000 filas, fusionando los textos `'es'` / `'en'` mediante `mergeRequisitosWithTranslations()` y respaldándose en `normasCatalogBundle.ts` ante ausencia de conectividad.
  - Carga igualmente competencias M:N (`norma_auditor`, `sector_iaf_auditor`, `subsector_iaf_auditor`), `organismo_acreditacion`, `acreditacion_norma` + `acreditacion_norma_sector_iaf`, `client_organization_access` y registros archivados cuando `canInspectArchivedRecords(profile)` es verdadero para `ADMIN`.
- **Anti-XSS y Zero-UUID:** Toda salida interpolada pasa por `escapeHtml()` (`src/lib/html.ts`); el contenido HTML enriquecido de cláusulas normativas pasa por un sanitizador de lista blanca estricta (`sanitizeClauseHtml()` en `clauseRenderer.ts`, bloqueando scripts, `on*` y esquemas inseguros, y forzando `rel="noopener noreferrer"` en enlaces); se garantiza ausencia absoluta de UUIDs crudos en texto visible, `title`, `aria-label`, `placeholder` o `<input>` visibles (`src/lib/zeroUuid.ts`), así como validación estricta `isValidUuid()` / `assertValidUuid()` antes de cualquier mutación en Supabase.
- **Atajos de teclado:** `/` enfoca el campo de búsqueda activo de la vista Multi View; `Escape` cierra modales, menús desplegables o popovers del editor.

---

## 2. Patrones UI/UX Estandarizados

### 2.1 Cabecera Global en 3 Bloques y Contenedor Panorámico (`header.ts`, `layout.ts`)
- **Contenedor Widescreen (`src/lib/layout.ts`):** `APP_SHELL_CONTAINER_CLASS` y `APP_HEADER_CONTAINER_CLASS` amplían el lienzo a `max-w-[1720px]` con relleno responsivo (`px-4 sm:px-6 lg:px-8 xl:px-12`), aprovechando monitores de alta resolución sin sacrificar legibilidad en `Auth` (`max-w-md`) ni áreas de texto (`max-w-4xl`).
- Barra superior sticky con logotipo (`data-nav-reset="true"`), **3 bloques operativos singulares** (`Auditoría`, `Certificación`, `Extra`) y menú desplegable de cuenta en la esquina derecha (`Mi Perfil`, `Panel Aprobaciones`, `Estado DB`, `Cerrar Sesión`).
- Toda navegación desde la cabecera o el logo porta `data-nav-reset="true"`, ejecutando `resetBreadcrumbToDomain()` y evitando tarjetas o barras secundarias duplicadas.
- **Iconografía minimalista de rol/estado:**
  - `APPROVED`: `🛡️` (`ADMIN`), `⚙️` (`WORKER`), `📋` (`AUDITOR`), `🏢` (`CLIENT`).
  - `PENDING` (`⏳`) y `REJECTED` (`❌`): suprimen el icono de rol (`suppressRoleIcon: true`).

### 2.2 Dashboard Minimalista y Vista `Mi Perfil` (`dashboardView.ts`, `profileView.ts`)
- **Dashboard (`dashboardView.ts`):** Presenta únicamente el saludo nominal limpio (sin píldoras redundantes de rol/estatus ni explorador duplicado de certificados) y **5 métricas operativas acotadas por RBAC** (`Organizaciones Activas`, `Certificados Vigentes`, `Auditorías Programadas`, `Acreditaciones Activas`, `Hallazgos Abiertos`).
- **`Mi Perfil` (`profileView.ts`):** Vista de auto-servicio en rejilla adaptable (`xl:grid-cols-12`) con formulario exclusivo para `nombre` (validado vía `buildSelfProfileUpdatePayload()` devolviendo estrictamente `{ nombre }`) y cambio opcional de contraseña (`validatePasswordChangeInput()`). Los campos `role` y `status` se muestran como metadatos de gobernanza **de solo lectura**, sin controles editables. Para `CLIENT`, incluye tabla de solo lectura de organizaciones vinculadas (`client_organization_access`); para `AUDITOR`, muestra resumen de su credencial técnica, normas y sectores IAF.

### 2.3 Motor de Breadcrumbs Compactos (`breadcrumb.ts` + `breadcrumbView.ts`)
- **Diseño Compacto de Una Línea:** Barra sin bordes ni tarjetas envolventes (`flex-nowrap overflow-hidden whitespace-nowrap`) ubicada inmediatamente sobre el lienzo de vista.
- **Truncamiento Inteligente y Elipsis:** `truncateBreadcrumbLabel()` recorta segmentos individuales a **24 caracteres** (`MAX_BREADCRUMB_CHAR_LENGTH = 24`) conservando el texto completo en `title`. Cuando la ruta supera **4 segmentos** (`MAX_VISIBLE_BREADCRUMBS = 4`), `collapseBreadcrumbForDisplay()` colapsa los nodos intermedios bajo un botón interactivo `…` que permite retroceder.
- **Linaje Cross-Domain, Creación (`...-new`) y Prevención de Bucles:** `BreadcrumbEntityType` soporta **23 tipos de entidad** incluyendo `organismo_acreditacion`, `subsector_iaf`, `requisito`, `no_aplicable`, `acceso_cliente`, `competencia_auditor`, `fecha_certificado`, `contacto_certificado`, `telefono_contacto` y `email_contacto`. La factoría `createNewEntityBreadcrumbSegment()` genera segmentos de creación (`id: '<entityType>-new'`) manteniendo `parentEntityId` al originarse desde una pestaña hija. Al revisitar un nodo existente (comparación por `id` o clave compuesta `entityId + entityType + subview/route`), `pushBreadcrumb()` trunca el bucle hasta ese ancestro.

### 2.4 Plantilla Universal Multi View Clean List y Tablas Redimensionables (`src/lib/universalTemplate.ts` + `src/views/universalTemplate.ts`)
Utilizada por todos los directorios plurales (`Organizaciones`, `Certificados`, `Auditores`, `Programación`, `Normas`, `Sectores IAF`, `Organismos de Acreditación`, `Acreditaciones`, `Estatus`, `Tipos`, `Metodologías`):
1. **Barra de Controles Unificada y Clean List:**
   - Botón hamburguesa colapsable **`☰ Filtros`** (`data-toggle-sidebar="true"`, `aria-expanded`) con contador de facetas activas.
   - Buscador único con `<input type="text">` (`autocomplete="off"`), eliminando el artefacto nativo de doble `"X"` de `type="search"`, acompañado de un único botón `✕` (`data-clear-search="true"`) y atajo `/`.
   - Totalizador uniforme **`Mostrando X de Y <entidad>`** con numeración `tabular-nums`.
   - Botón CTA cuadrado **`+`** (`renderMultiViewAddButton`, `w-9 h-9 rounded-lg bg-sky-700 hover:bg-sky-800 text-white`) visible solo para Staff aprobado, que navega directo al Detail View en modo `'add'`.
   - Conmutador **`[⊞ Tarjetas | ☰ Tabla]`** con grilla adaptable hasta 4 columnas (`getUniversalCardGridClass`: `xl:grid-cols-3 min-[1680px]:grid-cols-4` / `2xl:grid-cols-4`) y tarjetas enteramente clicables.
   - Checkbox exclusivo de `ADMIN`: **`Mostrar Archivados`** (`data-action="toggle-show-archived"`).
2. **Motor de Tablas `table-fixed` (`renderListViewTable`):**
   - Aplica `<colgroup>` porcentual (`resolveColumnWidthPercentages` sumando exactamente `100%`), truncamiento estricto en celdas, redimensionamiento interactivo (`resizeAdjacentColumns`) y clic completo de fila (`getRowAttrs`) con **cero columnas `acciones` y cero `<button>` dentro de `<tbody>`**.
3. **Barra Lateral de Facetas Reactivas ($S_{-k}$):**
   `computeReactiveFacetCounts()` calcula conteos en tiempo real por intersección *rest-out* $S_{-k}$ con unión `OR` intra-categoría e intersección `AND` inter-categoría (`filterRecordsWithFacets`).
4. **Sección de Archivo Histórico (`ADMIN`):** Al activar `"Mostrar Archivados"`, muestra debajo del catálogo activo la lista de registros archivados con fecha local, actor legible (Zero-UUID), motivo y botón **`↺ Restaurar`** (`data-action="restore-archived-record"`).

### 2.5 Fichas de Detalle Unificadas (`'read' | 'add' | 'edit'`) en 3 Zonas, Navegación Normativa y Editor Bilingüe (`detailTemplate.ts`, `normaView.ts`, `requisitoView.ts`, `richTextEditor.ts`)
Todas las entidades de `Extra` y `Certificación` implementan una ficha unificada de tarjeta única en **3 Zonas** gobernada por `resolve<Entidad>DetailMode(state, isStaff, selectedItem)` (usuarios `CLIENT`, `AUDITOR` o no aprobados siempre resuelven `'read'`):
- **Cabecera Compacta (`renderDetailFormTopActions`):**
  - En `'read'` (Staff aprobado): `[✏️ Editar] [🕒 Historial] [🗄️ Archivar]` (y en `Norma`: botón `📖 Norma Completa`).
  - En `'add' | 'edit'`: **botón Guardar primero** (`type="submit"`, `form="..."`, `w-9 h-9 bg-emerald-600 text-white`) y **botón Cancelar segundo** (`type="button"`, `w-9 h-9 bg-rose-50 text-rose-700 border-rose-200`). En modo `'add'` (`isCreateMode: true`), se ocultan automáticamente `🕒`, `🗄️` y la Zona 3 de hijos.
  - **Cero botones al pie del formulario:** Ninguna ficha renderiza botones de guardar o cancelar debajo de la Zona 2.
- **1. Zona Superior — Zona de Padres (`customParentZoneHtml` / `parents`):**
  - En `'read'`: chips interactivos clicables en rejilla adaptable (`lg:grid-cols-3`, `lg:grid-cols-4`, o `xl:grid-cols-5` para 5 FKs); en `Requisito`, chip directo `Norma ISO` + `Cláusula Padre` para retorno en 1 clic sin bucles.
  - En `'add' | 'edit'`: tarjetas `<select form="...">` (`renderDetailParentSelectCard`) con cascadas y filtros dinámicos en vivo (`Sector IAF → Sub-Sector IAF` en Certificado y Competencias; `Norma → Requisito Padre` sin ciclos LTREE en Requisito; `Certificado → Requisitos de su Norma` en No Aplicables y Procesos).
- **2. Zona Media — Zona de Registro (`Record Zone`) y Editor Enriquecido Bilingüe:**
  - Cuadrícula compacta de atributos y formularios `<form id="...">`.
  - En `Norma` Detail View (`normaView.ts`), la pestaña **`Requisitos` (árbol `ltree`)** es la primera y activa por defecto, mostrando únicamente los capítulos raíz de **Nivel 1** para mantener el DOM ligero, junto con `#normaRequisitoSearchInput` que busca instantáneamente a través de los 7 niveles en `ES` e `EN` (códigos, títulos y texto indexado `collectClauseIndexText`).
  - En `Requisito` Detail View (`requisitoView.ts`) en modo `'read'`: conmutador **`🇪🇸 Español` / `🇬🇧 English` / `⇄ Comparativa ES / EN`**, expansión recursiva de placeholders `{clause_...}` (`resolveClauseHtml`) con indicadores de sub-cláusulas embebidas, respaldo idiomático explícito cuando falta un idioma, barrita de navegación entre cláusulas hermanas (`← Anterior` / píldoras / selector compacto / `Siguiente →`) y píldoras de sub-cláusulas directas.
  - En `Requisito` Detail View en modo `'add' | 'edit'` (`richTextEditor.ts`): **Editor Rich Text HTML Bilingüe** (pestañas `Español (ES)` / `English (EN)` con indicador `Con contenido` / `Vacío`, modos `Visual` `contenteditable`, `HTML` fuente y `Vista Previa` en vivo), barra de formato semántico (`B`, `I`, `¶`, `• Lista`, `1. Lista`, `NOTA`, `Tabla 2×2`, popover seguro `Enlace https://`), selector **`+ { } Sub-cláusula`** con contador de hijos sin referenciar y **autocompletado inline activado al teclear `{`** que inserta `{clause_<codigo>}` en la posición exacta del cursor.
  - Errores de validación inline (`role="alert"` `bg-rose-50`); toda mutación exitosa muestra el toast flotante `#archiveGovernanceToast`.
- **3. Zona Inferior — Zona de Hijos (`Children Zone`):**
  - Pestañas limpias con `renderListViewTable` (`table-fixed`, `<colgroup>`, `getRowAttrs`) y botones `+` en cabecera de pestaña:
    - **Extra:** `Organismo` ↔ `Acreditación` (`organismoAcreditacionView.ts`, `acreditacionView.ts`); `Sector IAF` ↔ `Sub-Sector IAF` (`sectorIafView.ts`, `subsectorIafView.ts`); `Norma` ↔ `Requisitos` / `Acreditaciones` / `Certificados`; `Estatus`, `Tipo` y `Metodología`.
    - **Certificación:** `Organización` ↔ `Acceso Cliente` (`organizacionView.ts`, `clientAccessView.ts`) y `Certificado`; `Auditor` ↔ `Competencias M:N` (`auditorView.ts`, `competenciaAuditorView.ts`); `Certificado` (**5 FKs** + **7 pestañas**) ↔ `Sitio` (Sede 0 HQ), `Proceso` (`LTREE`), `Turno`, `No Aplicables` (`noAplicableView.ts`), `Auditoría`, `Fecha`, `Contacto` ↔ `Teléfono` y `Correo Electrónico`.
- **Modal de Lectura Completa (`normaFullReader.ts`) y Modal de Archivo Seguro (`archiveModalView.ts`):** El modal `Norma Completa` renderiza el documento integral de la norma con búsqueda en vivo y salto rápido por capítulo en `ES` o `EN`. Al pulsar `🗄️ Archivar`, `archiveModalView.ts` consulta `get_archive_dependency_summary` + dependencias locales y bloquea o ejecuta soft-delete vía `archive_record`.

---

## 3. Inventario de Módulos de Lógica Pura (`src/lib/` — 29 módulos + bundle generado)

| Módulo | Responsabilidades Principales |
| :--- | :--- |
| `supabase.ts` | Cliente singleton `@supabase/supabase-js` usando únicamente URL pública y Anon Key. |
| `html.ts` | Escape HTML anti-XSS (`escapeHtml`). |
| `layout.ts` | Tokens de diseño panorámico *widescreen* (`APP_SHELL_CONTAINER_CLASS`, `APP_HEADER_CONTAINER_CLASS` a `max-w-[1720px]`) y rejilla adaptable `getUniversalCardGridClass`. |
| `rbac.ts` | Helpers canónicos de permisos frontend (`isApprovedStaffProfile`, `isApprovedAdminProfile`) verificando rol y estado `APPROVED`. |
| `healthCheck.ts` | Guardias RBAC (`evaluateAdminAccess`, `canAccessRoute`, `canModifyProfileStatus`, `canModifyProfileRole`), menús en 3 bloques (`getVisibleDomainMenus`), validación de auto-servicio en `Mi Perfil`, iconografía de identidad y traducción de errores. |
| `accessControl.ts` | Aislamiento por rol, métricas scoped del dashboard (`computeDashboardSummaryMetrics`), control de escritura (`canEditAuditScheduleOrTeam`, `canMutateAuditExecution`) y acceso a `audit_log`. |
| `archiveGovernance.ts` | Lista canónica de **30 tablas protegidas** (`PROTECTED_SOFT_DELETE_TABLES`, incluyendo `requisito_traduccion`, `acreditacion_norma`, `acreditacion_norma_sector_iaf` y `client_organization_access`) vs. **5 tablas de enlace M:N** (`PURE_JUNCTION_DELETE_TABLES`), permisos `canArchiveRecord`/`canInspectArchivedRecords`, cálculo de dependencias y renderizado del botón `🗄️ Archivar`. |
| `searchControls.ts` | Normalización Unicode sin acentos, búsqueda multi-token, filtros combinados, extracción de facetas y barras de cobertura ISO. |
| `activeCertificates.ts` | Conteo preciso de certificados activos (`countActiveCertificates`), contratos `'read' \| 'add' \| 'edit'` de `OrganizacionFormDraft` y `ClientAccessFormDraft`, validación RIF/NIF y validación de `client_organization_access`. |
| `multisiteSampling.ts` | Convención Sitio 0 (`sortSitesWithPrincipalFirst`, `countMultisiteBranches`), estado unificado `CertificadoFormDraft`, cascada pura `applySectorIafCascadeToDraft`, tipos de sub-entidades, `CANONICAL_TIPO_FECHA_VALUES`, derivación de vigencias y validación de `alcance` (10–1000 chars). |
| `certificadoSubEntities.ts` | Contratos `'read' \| 'add' \| 'edit'`, factorías y validaciones para `fecha_certificado`, `contacto_certificado`, `telefono_contacto_certificado` y `email_contacto_certificado`. |
| `noAplicableDomain.ts` | Contratos `'read' \| 'add' \| 'edit'` para `requisitos_no_aplicables_certificado`, filtrado dinámico por Norma y validación ISO 4.3 (`>= 15` chars). |
| `competencyMatrix.ts` | Contratos `'read' \| 'add' \| 'edit'` para `auditor` y M:N `CompetenciaAuditorFormDraft` (`norma_auditor`, `sector_iaf_auditor`, `subsector_iaf_auditor`), cascada viva `Sector IAF → Sub-Sector` y emparejamiento técnico. |
| `auditDomain.ts` | Tipos base y utilidades estructurales compartidas del dominio Auditoría. |
| `auditExecution.ts` | Programación, calendario, detección de conflictos de solapamiento de auditores (`detectAuditorConflicts`), ciclo CAPA en 5 estados y motor de recomendación ISO/IEC 17021-1 Cláusulas 9.5/9.6. |
| `acreditacionDomain.ts` | Contratos `'read' \| 'add' \| 'edit'` para `organismo_acreditacion`, `acreditacion_norma` y desglose multi-sector `acreditacion_norma_sector_iaf` (`formatAcreditacionSectorsSummary`), evaluación de vigencia e impacto. |
| `sitioDomain.ts` | Contratos `'read' \| 'add' \| 'edit'` (`SitioFormDraft`), sugerencia de número siguiente (`suggestNextNumeroSitio`), resaltado de Sede 0 y guarda `canArchiveSitio`. |
| `procesoDomain.ts` | Contratos `'read' \| 'add' \| 'edit'` (`ProcesoFormDraft`), catálogo `LTREE` por norma (`getScopedNormaRequirements`) y guarda `canArchiveProceso`. |
| `turnoDomain.ts` | Contratos `'read' \| 'add' \| 'edit'` (`TurnoFormDraft`), cálculo de jornadas diurnas/nocturnas (`computeShiftDurationLabel`) y guarda `canArchiveTurno`. |
| `extraDomain.ts` | Contratos `'read' \| 'add' \| 'edit'`, validadores bilingües de `requisito` + `requisito_traduccion`, filtro Nivel 1 vs. cross-level ES/EN (`filterNormaRootRequisitos`, `filterNormaRequisitosCrossLevel`), navegación de vecinos (`buildRequisitoNavigationContext`), cobertura bilingüe por norma (`computeNormaBilingualCoverage`), cálculo `LTREE` y prevención de ciclos (`filterValidParentRequisitos`). |
| `requisitoCsvImporter.ts` | Parser RFC-4180 de `standard.clause.csv` (2,188 filas) y `standard.clause.translation.csv` (2,684 filas), reparación determinista de los 11 códigos truncados (`3.10`–`7.10`), validación `LTREE` de 7 niveles y generador SQL/bundle idempotente (`scripts/buildNormasSeed.ts`). |
| `clauseRenderer.ts` | Sanitizador HTML por lista blanca (`sanitizeClauseHtml`), motor recursivo de expansión `{clause_...}` (`resolveClauseHtml`) con guardia anti-ciclos, fallback idiomático controlado y extractor indexable `collectClauseIndexText`. |
| `normaFullReader.ts` | Preparación del lector modal íntegro de norma (`buildNormaFullReaderModel`), renderizado jerárquico completo con expansión `{clause_...}`, tabla de contenidos y resaltado de coincidencias. |
| `paginatedHydration.ts` | Hidratación paginada (>1,000 filas) contra Supabase (`fetchAllPages`) y fusión determinista de árboles `requisito` con sus traducciones (`mergeRequisitosWithTranslations`). |
| `richTextEditor.ts` | Lógica pura del Editor Rich Text HTML Bilingüe: normalización segura (`normalizeEditorHtmlOutput`), sugerencias y conteo de sub-cláusulas sin referenciar (`buildChildPlaceholderSuggestions`, `countUnreferencedChildClauses`), validación de enlaces `https://`, inserción precisa en cursor (`insertTextAtCursor`) y detección del trigger `{`. |
| `breadcrumb.ts` | Pila inmutable de *breadcrumbs* con **23 tipos de entidad**, factoría `createNewEntityBreadcrumbSegment()`, colapso con elipsis (`MAX_VISIBLE_BREADCRUMBS = 4`), prevención de bucles por clave compuesta y truncamiento a 24 caracteres. |
| `universalTemplate.ts` | Motor Multi View Clean List: búsqueda normalizada, filtrado OR/AND (`filterRecordsWithFacets`), conteos reactivos *rest-out* ($S_{-k}$), ordenamiento determinista y redimensionamiento porcentual `table-fixed`. |
| `auditLog.ts` | Resolución legible de actores sin UUIDs (`resolveAuditActorDisplay`), formateo de fechas locales y cálculo de diferencias campo a campo (`computeFieldDiffs`). |
| `zeroUuid.ts` | Auditoría estática Zero-UUID en HTML visible y atributos accesibles (`findExposedUuidsInHtml`, `assertZeroUuidExposure`) y validación estricta `isValidUuid()` / `assertValidUuid()`. |
| `generated/normasCatalogBundle.ts` | Bundle tipado autogenerado con las 8 normas, 2,188 cláusulas `ltree` y 2,684 traducciones como respaldo offline determinista. |

---

## 4. Inventario de Vistas Modulares (`src/views/` — 41 módulos)

| Grupo Funcional | Vistas (`src/views/*.ts`) | Responsabilidad Principal |
| :--- | :--- | :--- |
| **Shell, Plantillas y Gobernanza (10)** | `authView.ts`, `header.ts`, `breadcrumbView.ts`, `dashboardView.ts`, `profileView.ts`, `searchControlsView.ts`, `universalTemplate.ts`, `detailTemplate.ts`, `auditLogModal.ts`, `archiveModalView.ts` | Login/Sign up/Quick Login + Reset DB; cabecera en 3 bloques (`data-nav-reset="true"`); breadcrumbs compactos; dashboard minimalista de 5 métricas; `Mi Perfil`; plantillas Multi View Clean List (`table-fixed`, CTA `+`) y Detail View en 3 Zonas (`renderDetailFormTopActions`, `renderDetailBooleanField`, `renderDetailParentSelectCard`, `isCreateMode`); modal forense `audit_log`; modal de archivo seguro y toast flotante `#archiveGovernanceToast`. |
| **Consola Administrativa (2)** | `approvalsView.ts`, `databaseStatusView.ts` | Aprobación/rechazo y cambio de rol en vivo (`ADMIN`, solo lectura para `WORKER`), más diagnóstico de conectividad en 5 comprobaciones en vivo contra Supabase. |
| **Dominio Auditoría (4)** | `auditoriasView.ts`, `programacionView.ts`, `calendarioView.ts`, `resultadoView.ts` | Conmutador de bloque; **Programación** (Multi View, modal de planificación, ficha en 3 Zonas y 3 pestañas); **Calendario** (Mensual, Trimestral, Timeline Gantt y conflictos); **Resultado** (tablero Tabla/Kanban de hallazgos, flujo CAPA y motor ISO 17021-1). |
| **Dominio Certificación y Sub-entidades (14)** | `certificacionView.ts`, `organizacionView.ts`, `clientAccessView.ts`, `certificadoView.ts`, `auditorView.ts`, `competenciaAuditorView.ts`, `sitioView.ts`, `procesoView.ts`, `turnoView.ts`, `noAplicableView.ts`, `fechaView.ts`, `contactoView.ts`, `telefonoView.ts`, `emailView.ts` | Enrutador del bloque; **Organización** + **`Acceso Cliente`** (`clientAccessView.ts`); **Certificado** (`5` FKs con cascada IAF + `7` pestañas); **Auditor** + **`Competencias M:N`** (`competenciaAuditorView.ts`); y fichas unificadas `'read' \| 'add' \| 'edit'` para **Sitio** (Sede 0), **Proceso** (`LTREE`), **Turno**, **No Aplicables** (`noAplicableView.ts`, Cláusula 4.3), **Fecha**, **Contacto**, **Teléfono** y **Correo Electrónico**. |
| **Dominio Extra — Catálogos, Normas y Editor Bilingüe (11)** | `extraView.ts`, `normaView.ts`, `requisitoView.ts`, `richTextEditor.ts`, `sectorIafView.ts`, `subsectorIafView.ts`, `organismoAcreditacionView.ts`, `acreditacionView.ts`, `estatusView.ts`, `tipoAuditoriaView.ts`, `metodologiaAuditoriaView.ts` | Enrutador del bloque; **Norma** (Multi View + Detail View abierto en pestaña `Requisitos` Nivel 1 con búsqueda cross-level ES/EN y modal `Norma Completa`); **`Requisito LTREE`** (lectura bilingüe `ES`/`EN`/`Comparativa`, expansión `{clause_...}`, vecinos y sub-cláusulas); **`richTextEditor.ts`** (Editor Rich Text HTML bilingüe con modos `Visual`/`HTML`/`Vista Previa`, selector `+ { } Sub-cláusula`, trigger `{` y popover `https://`); **Sector IAF** + **`Sub-Sector IAF`**; **`Organismo de Acreditación`** + **Acreditación Multi-Sector**; **Estatus**, **Tipo de Auditoría** y **Metodología**. |
