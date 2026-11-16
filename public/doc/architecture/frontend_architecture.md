# Arquitectura del Frontend SPA (`programa_aud`)

> Documento técnico complementario de [`project_resume.md`](../project_resume.md). Describe la aplicación **Single-Page Application (SPA)** en TypeScript estricto (`strict: true`, `0 any`), renderizado declarativo con **29 módulos de lógica pura (`src/lib/`)** (más catálogo generado en `src/lib/generated/normasCatalogBundle.ts`) y **41 vistas modulares (`src/views/`)**, layout panorámico *widescreen* (`max-w-[1720px]`), motor documental bilingüe ES/EN, compilación con Vite (`manualChunks`) y estilos en Tailwind CSS v4.

---

## 1. Orquestación de Estado, Rutas y Seguridad en Cliente (`src/main.ts`)

### 1.1 Contenedor Central de Estado (`AppState`)
`src/main.ts` (`21,506` líneas) centraliza el estado tipado en `AppState`, preserva el foco y la posición del cursor durante el re-renderizado de campos de búsqueda/edición (tanto en Multi View como en el editor visual/HTML bilingüe de cláusulas) y coordina la hidratación en vivo con Supabase:
- **Sesión, Identidad y Perfil:** `booting`, `user`, `profile`, `authorizedClientOrgIds`, `clientAccessRows` (`ClientOrgAccessSummary[]`), `profileForm` (`ProfileFormState`), `activeRoute`, `activeSubSection`, `openMenu`.
- **Navegación Contextual:** `breadcrumbs` (`BreadcrumbSegment[]`) y estado del cajón forense `auditLogModal`.
- **Gobernanza de Archivo Seguro y Restauración (`archiveGovernance`):** `showArchived` (exclusivo `ADMIN`), `modal` (`ArchiveModalState`), `toast` (`ArchiveToastState | null` para notificaciones flotantes no invasivas `#archiveGovernanceToast`), `restoringId`, `archivedRecordsByTable`, `archivedSnapshotsByKey`, `archivedCatalogIds`.
- **Autenticación, Aprobaciones y Diagnóstico:** `auth` (`mode`: `'login' | 'signup'`, modal Reset DB), `approvals` (gestión/consulta de perfiles) y `dbCheck` (5 comprobaciones en vivo contra Supabase).
- **Preferencias de Tablas (`tableColumnWidths`):** Anchos de columna ajustables por usuario para listados Multi View y pestañas de hijos en fichas de detalle.
- **Datos Hidratados y Dominios Operativos (`domainData` + estados de vista):**
  - Bloque Auditoría: `programacionDomain`, `calendarioDomain` (`month` | `quarter` | `gantt`) y `resultadoDomain` (`list` | `kanban` + motor de recomendación ISO/IEC 17021-1).
  - Bloque Certificación: `organizacionDomain`, `clientAccessDomain`, `certificadoDomain`, `sitioDomain`, `procesoDomain`, `turnoDomain`, `noAplicableDomain`, `fechaDomain`, `contactoDomain`, `telefonoDomain`, `emailDomain`, `auditorDomain`, `competenciaAuditorDomain`.
  - Bloque Extra (`extraDomain`): sub-estados independientes para `Norma` + `Requisito` (`requisitoState`, incluyendo `readerScope`: `'clause' | 'full_norma'`, `langMode`: `'es' | 'en' | 'both'`, estado del editor bilingüe `Visual/HTML/Vista Previa`, selector `{clause_...}`, popover HTTPS y autocompletado `{`), `Sector IAF` + `Sub-Sector IAF` (`subsectorState`), `Organismo de Acreditación` (`organismoState`), `Acreditación` (`acreditacionState` sobre `acreditacion_norma` + `acreditacion_norma_sector_iaf`), `Estatus`, `Tipo` y `Metodología`.

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
    - **Bloque 3 — `Extra` (`Norma`, `Sector IAF`, `Acreditación`, `Estatus`, `Tipo`, `Metodología`, más navegación contextual hacia `Organismos de Acreditación`, `Sub-Sectores` y `Requisitos`):** todo usuario `APPROVED`, con creación, edición y archivo restringidos a `ADMIN`/`WORKER` aprobados.

### 1.3 Hidratación Paginada en Vivo, Respaldo Offline, Anti-XSS y Zero-UUID
- **Hidratación Paginada (`src/lib/paginatedHydration.ts`):** Al autenticar un usuario `APPROVED`, `main.ts` ejecuta en paralelo `loadLiveCertificates()` (relaciones `subsector_iaf`, `fecha_certificado`, `contacto_certificado` → teléfonos/correos y RPC `cobertura_normativa_certificado`) y `loadDomainData()`. Dado que PostgREST limita por defecto las respuestas a 1,000 filas, `fetchAllPagedRows()` recorre `.range(from, to)` de forma determinista hasta descargar íntegramente las **2,188 cláusulas** (`requisito`) y **2,684 traducciones HTML ES/EN** (`requisito_traduccion`), ensamblándolas mediante `assembleHydratedNormasAndRequisitos()` con conteo exacto `clausulas_count` y degradación elegante al catálogo embebido (`normasCatalogBundle.ts`) si el esquema está en transición o sin conexión.
- **Anti-XSS y Zero-UUID:** Toda salida interpolada pasa por `escapeHtml()` (`src/lib/html.ts`), todo contenido normativo HTML pasa por la lista blanca estricta `sanitizeClauseHtml()` (`src/lib/clauseRenderer.ts`) que bloquea etiquetas peligrosas y restringe `<a href>` a `http(s)://`, y se garantiza ausencia absoluta de UUIDs crudos en texto visible, `title`, `aria-label`, `placeholder` o `<input>` visibles (`src/lib/zeroUuid.ts`), así como validación estricta `isValidUuid()` / `assertValidUuid()` antes de cualquier mutación en Supabase.
- **Atajos de teclado:** `/` enfoca el campo de búsqueda activo de la vista Multi View; `Escape` cierra modales, popovers, menús desplegables o limpia la búsqueda activa.

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
   - Botón CTA cuadrado **`+`** (`renderMultiViewAddButton`, `w-9 h-9 rounded-lg bg-sky-700 hover:bg-sky-800 text-white`) visible solo para Staff aprobado, que navega directo al Detail View en modo `'add'` (sin formularios inline dentro de directorios).
   - Conmutador **`[⊞ Tarjetas | ☰ Tabla]`** con grilla adaptable hasta 4 columnas (`getUniversalCardGridClass`: `xl:grid-cols-3 min-[1680px]:grid-cols-4` / `2xl:grid-cols-4`) y tarjetas enteramente clicables (`data-action="..."`).
   - Checkbox exclusivo de `ADMIN`: **`Mostrar Archivados`** (`data-action="toggle-show-archived"`).
2. **Motor de Tablas `table-fixed` (`renderListViewTable`):**
   - Aplica `<colgroup>` porcentual (`resolveColumnWidthPercentages` sumando exactamente `100%`), truncamiento estricto en celdas, redimensionamiento interactivo (`resizeAdjacentColumns`) y clic completo de fila (`getRowAttrs`) con **cero columnas `acciones` y cero `<button>` dentro de `<tbody>`**.
3. **Barra Lateral de Facetas Reactivas ($S_{-k}$):**
   `computeReactiveFacetCounts()` calcula conteos en tiempo real por intersección *rest-out* $S_{-k}$ con unión `OR` intra-categoría e intersección `AND` inter-categoría (`filterRecordsWithFacets`).
4. **Sección de Archivo Histórico (`ADMIN`):** Al activar `"Mostrar Archivados"`, muestra debajo del catálogo activo la lista de registros archivados con fecha local, actor legible (Zero-UUID), motivo y botón **`↺ Restaurar`** (`data-action="restore-archived-record"`).

### 2.5 Fichas de Detalle Unificadas (`'read' | 'add' | 'edit'`) en 3 Zonas y Archivo Seguro (`detailTemplate.ts`, `archiveModalView.ts`)
Todas las entidades de `Extra` y `Certificación` implementan una ficha unificada de tarjeta única en **3 Zonas** gobernada por `resolve<Entidad>DetailMode(state, isStaff, selectedItem)` (usuarios `CLIENT`, `AUDITOR` o no aprobados siempre resuelven `'read'`):
- **Cabecera Compacta (`renderDetailFormTopActions`):**
  - En `'read'` (Staff aprobado): `[✏️ Editar] [🕒 Historial] [🗄️ Archivar]`.
  - En `'add' | 'edit'`: **botón Guardar primero** (`type="submit"`, `form="..."`, `w-9 h-9 bg-emerald-600 text-white`) y **botón Cancelar segundo** (`type="button"`, `w-9 h-9 bg-rose-50 text-rose-700 border-rose-200`). En modo `'add'` (`isCreateMode: true`), se ocultan automáticamente `🕒`, `🗄️` y la Zona 3 de hijos.
  - **Cero botones al pie del formulario:** Ninguna ficha renderiza botones de guardar o cancelar debajo de la Zona 2.
- **1. Zona Superior — Zona de Padres (`customParentZoneHtml` / `parents`):**
  - En `'read'`: chips interactivos clicables en rejilla adaptable (`lg:grid-cols-3`, `lg:grid-cols-4`, o `xl:grid-cols-5` para 5 FKs), omitida en catálogos raíz.
  - En `'add' | 'edit'`: tarjetas `<select form="...">` (`renderDetailParentSelectCard`) con cascadas y filtros dinámicos en vivo (`Sector IAF → Sub-Sector IAF` en Certificado y Competencias; `Norma → Requisito Padre` sin ciclos LTREE en Requisito; `Certificado → Requisitos de su Norma` en No Aplicables y Procesos).
- **2. Zona Media — Zona de Registro (`Record Zone`):**
  - Cuadrícula compacta de atributos y formularios `<form id="...">`.
  - Campos booleanos renderizados vía `renderDetailBooleanField()` con badges de alto contraste (`✓` / `✕`) en lectura y checkbox habilitado **sin asterisco `*`** en edición/alta.
  - Errores de validación inline (`role="alert"` `bg-rose-50`); cero banners verdes inline de éxito — toda mutación exitosa muestra el toast flotante no invasivo `#archiveGovernanceToast` (`showFloatingToast`, cierre automático 4.5 s y botón `✕`).
- **3. Zona Inferior — Zona de Hijos (`Children Zone`):**
  - Pestañas limpias con `renderListViewTable` (`table-fixed`, `<colgroup>`, `getRowAttrs`) y botones `+` en cabecera de pestaña que navegan a la ficha hija en modo `'add'` con su padre preseleccionado:
    - **Extra:** `Organismo` ↔ `Acreditación` (`organismoAcreditacionView.ts`, `acreditacionView.ts`); `Sector IAF` ↔ `Sub-Sector IAF` (`sectorIafView.ts`, `subsectorIafView.ts`); `Norma` (con `Ver Norma`) ↔ `Requisito LTREE` (`normaView.ts`, `requisitoView.ts`); `Estatus`, `Tipo` y `Metodología`.
    - **Certificación:** `Organización` ↔ `Acceso Cliente` (`organizacionView.ts`, `clientAccessView.ts`) y `Certificado`; `Auditor` ↔ `Competencias M:N` (`auditorView.ts`, `competenciaAuditorView.ts` para `norma_auditor`, `sector_iaf_auditor`, `subsector_iaf_auditor`); `Certificado` (**5 FKs** + **7 pestañas**) ↔ `Sitio` (Sede 0 HQ), `Proceso` (`LTREE`), `Turno`, `No Aplicables` (`noAplicableView.ts`), `Auditoría` (enlace read-only), `Fecha`, `Contacto` ↔ `Teléfono` y `Correo Electrónico`.
- **Modal de Archivo Seguro (`archiveModalView.ts`):** Al pulsar `🗄️ Archivar`, consulta `get_archive_dependency_summary` combinado con dependencias locales (`mergeArchiveDependencySummaries`). Si existen dependencias activas, bloquea la confirmación mostrando el desglose legible sin UUIDs; si está libre de dependencias, solicita motivo opcional (máx. 300 caracteres) y ejecuta soft-delete vía `archive_record`.

### 2.6 Arquitectura Documental Bilingüe de Cláusulas Normativas (`clauseRenderer.ts`, `normaFullReader.ts`, `richTextEditor.ts`)
1. **Motor de Renderizado Recursivo (`clauseRenderer.ts`):**
   - **Sanitización Isomórfica (`sanitizeClauseHtml`):** Permite exclusivamente etiquetas estructurales seguras (`div`, `p`, `span`, `strong`, `em`, `u`, `br`, `ul`, `ol`, `li`, `blockquote`, `table`, `thead`, `tbody`, `tr`, `th`, `td`, `a` limitado a `^https?://`), eliminando scripts, estilos en línea y atributos heredados (`data-oe-version`).
   - **Expansión `{clause_X.Y.Z}` (`resolveClauseHtml`):** Resuelve recursivamente referencias a sub-cláusulas dentro de la misma `Norma` (`maxDepth = 10`), con pila anti-ciclos, fallback automático `es ↔ en` y enlaces de salto clicables (`data-action="select-requisito"`).
   - **Reglas Documentales 1, 2 y 3 (`formatClausePresentation`):**
     - *Regla 1:* Título no vacío → encabezado en bloque negrita `{codigo} {title}` (`mt-3`) seguido del cuerpo HTML.
     - *Regla 2:* Título vacío y `explicit_code === true` → prefijo negrita `{codigo}` inyectado al inicio de la primera línea de flujo (`mt-1.5`).
     - *Regla 3:* Título vacío y `explicit_code === false` → prosa continua sin código visible ni sangría lateral (`mt-0.5`).
   - **Conteo de Obligaciones (`countNormativeObligationTerms`):** Cuantifica ocurrencias de `debe`, `debería`, `shall` y `should` ignorando etiquetas HTML y placeholders.
2. **Lector Completo de Norma (`normaFullReader.ts` + `requisitoView.ts`):**
   - Accesible mediante el botón **`Ver Norma`** desde `normaView.ts` o el selector de alcance dentro de `requisitoView.ts` (`readerScope: 'clause' | 'full_norma'`).
   - Soporta modos **Español (`es`)**, **English (`en`)** y **Bilingüe comparativo lado a lado (`bilingual`)** en orden DFS natural (`orderNormaRequisitosHierarchically`), suprimiendo contenedores estructurales redundantes, resaltando coincidencias multicriterio sin acentos mediante `<mark>` (`highlightSanitizedClauseHtml`) y mostrando insignias en vivo de términos obligatorios (`debe`, `debería`, `shall`, `should`).
3. **Editor Bilingüe Enriquecido (`src/lib/richTextEditor.ts` + `src/views/richTextEditor.ts`):**
   - Pestañas **`🇪🇸 Español (ES)`** y **`🇬🇧 English (EN)`** con insignias de estado (`Con contenido` / `Vacío`) y 3 modos: **`Visual`** (`contenteditable`), **`HTML`** (fuente HTML limpia) y **`Vista Previa`** (expansión `{clause_...}` en vivo).
   - Barra de formato sin `window.prompt`: Negrita, Cursiva, Párrafo, Listas (`•`, `1.`), bloque **`NOTA`**, **`Tabla 2×2`**, popover inline para enlaces `^https?://`, selector de sub-cláusulas **`+ { } Sub-cláusula`** con insignia de sub-cláusulas sin referenciar, autocompletado inline al teclear `{` y validación anti-ciclos de placeholders (`validateClausePlaceholderReferences`) previa a la persistencia transaccional en `requisito` + `requisito_traduccion`.

---

## 3. Inventario de Módulos de Lógica Pura (`src/lib/` — 29 módulos + `generated/`)

| Módulo | Responsabilidades Principales |
| :--- | :--- |
| `supabase.ts` | Cliente singleton `@supabase/supabase-js` usando únicamente URL pública y Anon Key. |
| `html.ts` | Escape HTML anti-XSS (`escapeHtml`). |
| `layout.ts` | Tokens de diseño panorámico *widescreen* (`APP_SHELL_CONTAINER_CLASS`, `APP_HEADER_CONTAINER_CLASS` a `max-w-[1720px]`) y rejilla adaptable `getUniversalCardGridClass`. |
| `rbac.ts` | Helpers canónicos de permisos frontend (`isApprovedStaffProfile`, `isApprovedAdminProfile`) verificando rol y estado `APPROVED`. |
| `healthCheck.ts` | Guardias RBAC (`evaluateAdminAccess`, `canAccessRoute`, `canModifyProfileStatus`, `canModifyProfileRole`), menús en 3 bloques (`getVisibleDomainMenus`), validación de auto-servicio en `Mi Perfil` (`buildSelfProfileUpdatePayload`, `validatePasswordChangeInput`, `getProfileGovernanceMeta`), iconografía de identidad y traducción de errores. |
| `accessControl.ts` | Aislamiento por rol, métricas scoped del dashboard (`computeDashboardSummaryMetrics`), control de escritura (`canEditAuditScheduleOrTeam`, `canMutateAuditExecution`) y acceso a `audit_log` (`canViewAuditLogForEntity`). |
| `archiveGovernance.ts` | Lista canónica de **30 tablas protegidas** (`PROTECTED_SOFT_DELETE_TABLES`, incluyendo `requisito_traduccion`, `acreditacion_norma_sector_iaf` y `client_organization_access`) vs. **5 tablas de enlace M:N** (`PURE_JUNCTION_DELETE_TABLES`), permisos `canArchiveRecord`/`canInspectArchivedRecords`, sanitización de motivo, parsing/cálculo de `get_archive_dependency_summary`, extracción de archivados por dominio y renderizado del botón `🗄️ Archivar`. |
| `searchControls.ts` | Normalización Unicode sin acentos, búsqueda multi-token, filtros combinados, extracción de facetas y barras de cobertura ISO. |
| `activeCertificates.ts` | Conteo preciso de certificados activos (`countActiveCertificates`), contratos `'read' | 'add' | 'edit'` de `OrganizacionFormDraft` y `ClientAccessFormDraft`, validación RIF/NIF y validación de `client_organization_access`. |
| `multisiteSampling.ts` | Convención Sitio 0 (`sortSitesWithPrincipalFirst`, `countMultisiteBranches`), estado unificado `CertificadoFormDraft`, cascada pura `applySectorIafCascadeToDraft`, tipos de `FechaCertificadoEntity`/`ContactoCertificadoEntity`/`TelefonoContactoEntity`/`EmailContactoEntity`, `CANONICAL_TIPO_FECHA_VALUES`, derivación de vigencias, validación de `alcance` (10–1000 chars) y clasificación visual de procesos. |
| `certificadoSubEntities.ts` | Contratos `'read' | 'add' | 'edit'`, factorías vacías y resolución de detalle (`resolveFechaDetailById`, `resolveContactoDetailById`, `resolveTelefonoDetailById`, `resolveEmailDetailById`), validación de fechas calendario y 7 tipos canónicos, contactos (`cargo` nullable), teléfonos (`Oficina`), correos (`Trabajo`), guardia `canArchiveContacto` y traducción de errores. |
| `noAplicableDomain.ts` | Contratos `'read' | 'add' | 'edit'` para `requisitos_no_aplicables_certificado`, filtro dinámico por Norma del Certificado (`filterRequisitosForCertificado`), reconciliación al cambiar certificado y validación ISO 4.3 (`NO_APLICABLE_JUSTIFICACION_MIN_LENGTH = 15`). |
| `competencyMatrix.ts` | Contratos `'read' | 'add' | 'edit'` para `auditor` y M:N `CompetenciaAuditorFormDraft` (`norma_auditor`, `sector_iaf_auditor`, `subsector_iaf_auditor`), cascada viva `Sector IAF → Sub-Sector`, emparejamiento técnico (`isAuditorQualifiedForScope`) y vigencia de credenciales. |
| `auditDomain.ts` | Tipos base y utilidades estructurales compartidas del dominio Auditoría. |
| `auditExecution.ts` | Programación, calendario, detección de conflictos de solapamiento de auditores (`detectAuditorConflicts`), ciclo CAPA en 5 estados y motor de recomendación ISO/IEC 17021-1 Cláusulas 9.5/9.6 (`evaluateIso17021Recommendation`). |
| `acreditacionDomain.ts` | Contratos `'read' | 'add' | 'edit'` y validadores para `organismo_acreditacion` (`OrganismoFormDraft`) y `acreditacion_norma` + `acreditacion_norma_sector_iaf` (`AcreditacionFormDraft`), hidratación, evaluación de vigencia y cálculo de impacto en certificados activos. |
| `sitioDomain.ts` | Contratos `'read' | 'add' | 'edit'` (`SitioFormDraft`), sugerencia de número siguiente (`suggestNextNumeroSitio`), resaltado de Sede 0, turnos asignados y guarda `canArchiveSitio`. |
| `procesoDomain.ts` | Contratos `'read' | 'add' | 'edit'` (`ProcesoFormDraft`), catálogo `LTREE` por norma (`getScopedNormaRequirements`), cruce de hallazgos/auditorías y guarda `canArchiveProceso`. |
| `turnoDomain.ts` | Contratos `'read' | 'add' | 'edit'` (`TurnoFormDraft`), cálculo de jornadas diurnas y nocturnas (`computeShiftDurationLabel`: ej. `8h 00m (nocturno)`), validación de horarios y guarda `canArchiveTurno`. |
| `extraDomain.ts` | Contratos `'read' | 'add' | 'edit'` y validadores para `norma`, `requisito` (incluyendo `explicit_code`, `RequisitoTranslationEntry`, cobertura bilingüe, cálculo `computeRequisitoLtreePath` y `filterValidParentRequisitos` anti-ciclos), `sector_iaf`, `subsector_iaf`, `estatus`, `tipo_auditoria` y `metodologia_auditoria`. |
| `clauseRenderer.ts` | Sanitización allowlist (`sanitizeClauseHtml`), expansión recursiva `{clause_...}` (`resolveClauseHtml`) bajo Reglas 1–3, fallback `es ↔ en`, búsqueda sin HTML (`stripHtmlToSearchText`), indexación bilingüe y conteo de obligaciones (`debe`, `debería`, `shall`, `should`). |
| `normaFullReader.ts` | Ordenamiento jerárquico DFS (`orderNormaRequisitosHierarchically`), supresión de contenedores puros, resaltado seguro `<mark>` (`highlightSanitizedClauseHtml`) y renderizado completo (`es` / `en` / `bilingual`). |
| `richTextEditor.ts` | Lógica pura del editor bilingüe (`wrapSelectionWithTag`, `insertTextAtCursor`, `normalizeEditorHtmlOutput`, `validateSafeHttpUrl`, `computeBilingualDraftStatus`, `buildChildPlaceholderSuggestions`, `detectInlineBraceTrigger`, `validateClausePlaceholderReferences`). |
| `paginatedHydration.ts` | Cursor paginado PostgREST (`fetchAllPagedRows`), indexación $O(n)$ de traducciones (`indexTranslationsByRequisitoId`), `computeNormaClausulaCounts`, ensamblado `assembleHydratedNormasAndRequisitos` y consumo de `normasCatalogBundle.ts`. |
| `requisitoCsvImporter.ts` | Parser RFC 4180 para CSVs normativos, reparación determinista de códigos truncados (`.1` → `.10`), ordenamiento topológico, derivación FNV-1a v4 de UUIDs preservando 7 UUIDs históricos, limpieza `data-oe-version` y cálculo `LTREE`. |
| `generated/normasCatalogBundle.ts` | Catálogo estático precompilado (8 normas, 2,188 cláusulas, 2,684 traducciones ES/EN) utilizado como respaldo offline o pre-migración. |
| `breadcrumb.ts` | Pila inmutable de *breadcrumbs* con **23 tipos de entidad**, factoría genérica `createNewEntityBreadcrumbSegment()`, colapso con elipsis (`MAX_VISIBLE_BREADCRUMBS = 4`), prevención de bucles por clave compuesta, `resetBreadcrumbToDomain` y truncamiento a 24 caracteres. |
| `universalTemplate.ts` | Motor Multi View Clean List: búsqueda normalizada, filtrado OR/AND (`filterRecordsWithFacets`), conteos reactivos *rest-out* ($S_{-k}$), totalizador `"Mostrando X de Y"`, ordenamiento determinista y redimensionamiento porcentual `table-fixed` (`resizeAdjacentColumns`, `resolveColumnWidthPercentages`). |
| `auditLog.ts` | Resolución legible de actores sin UUIDs (`resolveAuditActorDisplay`), formateo de fechas locales y cálculo de diferencias campo a campo (`computeFieldDiffs`). |
| `zeroUuid.ts` | Auditoría estática Zero-UUID en HTML visible y atributos accesibles (`findExposedUuidsInHtml`, `assertZeroUuidExposure`) y validación estricta `isValidUuid()` / `assertValidUuid()`. |

---

## 4. Inventario de Vistas Modulares (`src/views/` — 41 módulos)

| Grupo Funcional | Vistas (`src/views/*.ts`) | Responsabilidad Principal |
| :--- | :--- | :--- |
| **Shell, Plantillas y Gobernanza (10)** | `authView.ts`, `header.ts`, `breadcrumbView.ts`, `dashboardView.ts`, `profileView.ts`, `searchControlsView.ts`, `universalTemplate.ts`, `detailTemplate.ts`, `auditLogModal.ts`, `archiveModalView.ts` | Login/Sign up/Quick Login + Reset DB; cabecera en 3 bloques (`data-nav-reset="true"`); breadcrumbs compactos; dashboard minimalista de 5 métricas; `Mi Perfil`; plantillas Multi View Clean List (`table-fixed`, CTA `+`) y Detail View en 3 Zonas (`renderDetailFormTopActions`, `renderDetailBooleanField`, `renderDetailParentSelectCard`, `isCreateMode`); modal forense `audit_log`; modal de archivo seguro y toast flotante `#archiveGovernanceToast`. |
| **Consola Administrativa (2)** | `approvalsView.ts`, `databaseStatusView.ts` | Aprobación/rechazo y cambio de rol en vivo (`ADMIN`, solo lectura para `WORKER`), más diagnóstico de conectividad en 5 comprobaciones en vivo contra Supabase. |
| **Dominio Auditoría (4)** | `auditoriasView.ts`, `programacionView.ts`, `calendarioView.ts`, `resultadoView.ts` | Conmutador de bloque; **Programación** (Multi View, modal de planificación, ficha en 3 Zonas y 3 pestañas); **Calendario** (Mensual, Trimestral, Timeline Gantt y conflictos); **Resultado** (tablero Tabla/Kanban de hallazgos, flujo CAPA y motor ISO 17021-1). |
| **Dominio Certificación y Sub-entidades (14)** | `certificacionView.ts`, `organizacionView.ts`, `clientAccessView.ts`, `certificadoView.ts`, `auditorView.ts`, `competenciaAuditorView.ts`, `sitioView.ts`, `procesoView.ts`, `turnoView.ts`, `noAplicableView.ts`, `fechaView.ts`, `contactoView.ts`, `telefonoView.ts`, `emailView.ts` | Enrutador del bloque; **Organización** + **`Acceso Cliente`** (`clientAccessView.ts`); **Certificado** (`5` FKs con cascada IAF + `7` pestañas); **Auditor** + **`Competencias M:N`** (`competenciaAuditorView.ts`); y fichas unificadas `'read' \| 'add' \| 'edit'` para **Sitio** (Sede 0), **Proceso** (`LTREE`), **Turno**, **No Aplicables** (`noAplicableView.ts`, Cláusula 4.3), **Fecha**, **Contacto**, **Teléfono** y **Correo Electrónico**. |
| **Dominio Extra — Catálogos, Lector y Editor Normativo (11)** | `extraView.ts`, `normaView.ts`, `requisitoView.ts`, `richTextEditor.ts`, `sectorIafView.ts`, `subsectorIafView.ts`, `organismoAcreditacionView.ts`, `acreditacionView.ts`, `estatusView.ts`, `tipoAuditoriaView.ts`, `metodologiaAuditoriaView.ts` | Enrutador del bloque; **Norma** (Multi View, cobertura bilingüe, acceso `Ver Norma`) + **`Requisito LTREE`** (vista de cláusula y Lector Completo ES/EN/Bilingüe) + **Editor Bilingüe ES/EN** (`richTextEditor.ts` con modos `Visual`/`HTML`/`Vista Previa`, picker `{clause_...}` y enlace seguro HTTPS); **Sector IAF** + **`Sub-Sector IAF`**; **`Organismo de Acreditación`** + **Acreditación**; **Estatus**, **Tipo de Auditoría** y **Metodología**; todos con Multi View Clean List (`table-fixed`, sin `acciones`) y Detail View `'read' \| 'add' \| 'edit'`. |
