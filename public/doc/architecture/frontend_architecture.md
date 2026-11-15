# Arquitectura del Frontend SPA (`programa_aud`)

> Documento técnico complementario de [`project_resume.md`](../project_resume.md). Describe la aplicación **Single-Page Application (SPA)** en TypeScript estricto (`strict: true`, `0 any`), renderizado declarativo con **22 módulos de lógica pura (`src/lib/`)** y **34 vistas modulares (`src/views/`)**, layout panorámico *widescreen* (`max-w-[1720px]`), compilación con Vite (`manualChunks`) y estilos en Tailwind CSS v4.

---

## 1. Orquestación de Estado, Rutas y Seguridad en Cliente (`src/main.ts`)

### 1.1 Contenedor Central de Estado (`AppState`)
`src/main.ts` centraliza el estado tipado en `AppState`, preserva el foco y la posición del cursor durante el re-renderizado de campos de búsqueda/edición y coordina la hidratación en vivo con Supabase:
- **Sesión, Identidad y Perfil:** `booting`, `user`, `profile`, `authorizedClientOrgIds`, `clientAccessRows` (`ClientOrgAccessSummary[]`), `profileForm` (`ProfileFormState`), `activeRoute`, `activeSubSection`, `openMenu`.
- **Navegación Contextual:** `breadcrumbs` (`BreadcrumbSegment[]`) y estado del cajón forense `auditLogModal`.
- **Gobernanza de Archivo Seguro y Restauración (`archiveGovernance`):** `showArchived` (exclusivo `ADMIN`), `modal` (`ArchiveModalState`), `toast` (`ArchiveToastState | null`), `restoringId`, `archivedRecordsByTable`, `archivedSnapshotsByKey`, `archivedCatalogIds`.
- **Autenticación, Aprobaciones y Diagnóstico:** `auth` (`mode`: `'login' | 'signup'`, modal Reset DB), `approvals` (gestión/consulta de perfiles) y `dbCheck` (5 comprobaciones en vivo contra Supabase).
- **Preferencias de Tablas (`columnWidths`, `tableColumnWidths`):** Anchos de columna ajustables por usuario para listados Multi View y pestañas de hijos en fichas de detalle.
- **Datos Hidratados y Dominios Operativos (`domainData` + estados de vista):**
  - `programacionDomain`, `calendarioDomain` (`month` | `quarter` | `gantt`) y `resultadoDomain` (`list` | `kanban` + motor de recomendación ISO/IEC 17021-1).
  - `organizacionDomain`, `certificadoDomain`, `sitioDomain`, `procesoDomain`, `turnoDomain`, `fechaDomain`, `contactoDomain`, `telefonoDomain`, `emailDomain`, `auditorDomain`.
  - `extraDomain`: estado independiente de búsqueda, facetas reactivas, ordenamiento, detalle y creación/edición para `Norma`, `Sector IAF`, `Acreditación`, `Estatus`, `Tipo` y `Metodología`.

### 1.2 Enrutamiento Hash SPA y Guardias RBAC
- **Rutas soportadas (`ActiveRoute`):** `'dashboard'`, `'profile'`, `'approvals'`, `'database'`, `'auditorias'`, `'certificacion'`, `'extra'`.
- **Sincronización Hash (`#/{route}` o `#/{route}/{subview}`):** Escucha `hashchange` y `popstate` sin recargas del documento.
- **Guardia `canAccessRoute(profile, route)` (`src/lib/healthCheck.ts`):**
  - `'dashboard'` y `'profile'` (`Mi Perfil`) son accesibles para cualquier usuario autenticado, incluyendo cuentas `PENDING` o `REJECTED` para revisar su estado y editar su nombre.
  - Los usuarios `PENDING` o `REJECTED` tienen bloqueadas todas las rutas operativas (`auditorias`, `certificacion`, `extra`, `approvals`, `database`).
  - `'database'` está restringida exclusivamente a `ADMIN` aprobado (`evaluateAdminAccess`).
  - `'approvals'` está disponible para `ADMIN` (gestión) y `WORKER` (solo lectura).
  - `getVisibleDomainMenus(profile)` determina los bloques visibles en cabecera:
    - **Bloque 1 — `Auditoría` (`Programación`, `Calendario`, `Resultado`):** `ADMIN`, `WORKER`, `AUDITOR`, `CLIENT`.
    - **Bloque 2 — `Certificación` (`Organización`, `Certificado`, `Auditor`):** `ADMIN`, `WORKER`, `CLIENT` (oculto para `AUDITOR`).
    - **Bloque 3 — `Extra` (`Norma`, `Sector IAF`, `Acreditación`, `Estatus`, `Tipo`, `Metodología`):** todo usuario `APPROVED`, con edición y archivo restringidos a `ADMIN`/`WORKER`.

### 1.3 Hidratación en Vivo, Anti-XSS y Zero-UUID
- Al autenticar un usuario `APPROVED`, `main.ts` ejecuta en paralelo `loadLiveCertificates()` (incluyendo relaciones `subsector_iaf`, `fecha_certificado`, `contacto_certificado` → `telefono_contacto_certificado`/`email_contacto_certificado` y RPC `cobertura_normativa_certificado`) y `loadDomainData()` (incluyendo cargas de registros archivados cuando `canInspectArchivedRecords(profile)` es verdadero para `ADMIN`).
- **Anti-XSS y Zero-UUID:** Toda salida interpolada pasa por `escapeHtml()` (`src/lib/html.ts`), y se garantiza ausencia absoluta de UUIDs crudos en texto visible, `title`, `aria-label`, `placeholder` o `<input>` visibles (`src/lib/zeroUuid.ts`).
- **Atajos de teclado:** `/` enfoca el campo de búsqueda activo de la vista Multi View; `Escape` cierra modales, menús desplegables o limpia la búsqueda activa.

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
- **Linaje Cross-Domain y Prevención de Bucles:** Soporta todas las entidades operativas y las sub-entidades de certificado (`fecha_certificado`, `contacto_certificado`, `telefono_contacto`, `email_contacto`). Navegar desde un detalle hacia un padre o entidad relacionada (ej. `Certificado > Contacto > Teléfono`) preserva la pila actual sin reiniciar la raíz de dominio. Al revisitar una entidad ya presente en la ruta (comparación por `id` o clave compuesta `entityId + entityType + subview/route`), `pushBreadcrumb()` trunca el bucle hasta ese nodo ancestro.

### 2.4 Plantilla Universal Multi View y Tablas Redimensionables (`src/lib/universalTemplate.ts` + `src/views/universalTemplate.ts`)
Utilizada por todos los directorios plurales (`Organizaciones`, `Certificados`, `Auditores`, `Programación`, `Normas`, `Sectores IAF`, `Acreditaciones`, `Estatus`, `Tipos`, `Metodologías`):
1. **Barra de Controles Unificada:**
   - Botón hamburguesa colapsable **`☰ Filtros`** (`data-toggle-sidebar="true"`, `aria-expanded`) con contador de facetas activas.
   - Buscador único optimizado con `<input type="text">` (`autocomplete="off"`), eliminando los inputs nativos `type="search"` para erradicar el artefacto visual de doble `"X"`, acompañado de un único botón `✕` (`data-clear-search="true"`) y atajo `/`.
   - Totalizador uniforme **`Mostrando X de Y <entidad>`** con numeración `tabular-nums`.
   - Conmutador **`[⊞ Tarjetas | ☰ Tabla]`** con grilla adaptable hasta 4 columnas (`getUniversalCardGridClass`: `xl:grid-cols-3 min-[1680px]:grid-cols-4` / `2xl:grid-cols-4`) y ordenamiento determinista tipo Excel (`none → asc → desc → none`).
   - Checkbox exclusivo de `ADMIN`: **`Mostrar Archivados`** (`data-action="toggle-show-archived"`).
2. **Motor de Tablas `table-fixed` (`renderListViewTable`):**
   - Aplica `<colgroup>` porcentual (`resolveColumnWidthPercentages` sumando `100%`), truncamiento estricto en celdas y redimensionamiento interactivo entre columnas adyacentes (`resizeAdjacentColumns`) garantizando **cero desbordamiento horizontal** tanto en Multi View como en las pestañas de hijos del Detail View.
3. **Barra Lateral de Facetas Reactivas ($S_{-k}$):**
   `computeReactiveFacetCounts()` calcula conteos en tiempo real por intersección *rest-out* $S_{-k}$ (aplica la búsqueda y selecciones de todas las *otras* categorías $F_j$, $j \neq k$), con unión `OR` intra-categoría e intersección `AND` inter-categoría (`filterRecordsWithFacets`).
4. **Sección de Archivo Histórico (`ADMIN`):** Al activar `"Mostrar Archivados"`, muestra debajo del catálogo activo la lista de registros archivados del dominio con fecha local, actor legible (Zero-UUID), motivo y botón **`↺ Restaurar`** (`data-action="restore-archived-record"`).

### 2.5 Fichas de Detalle Compactas en 3 Zonas y Archivo Seguro (`detailTemplate.ts`, `archiveModalView.ts`)
Toda ficha de detalle sigue una estructura compacta de tarjeta única unificada en **3 Zonas**:
- **Cabecera Compacta:** Fila superior `[← Volver] + Símbolo + Título ... [✏️ Editar] [🕒 Historial] [🗄️ Archivar]`, eliminando rótulos redundantes.
1. **Zona Superior — Zona de Padres (`Parent Zone`):** Chips interactivos hacia relaciones superiores en rejilla adaptable (`lg:grid-cols-3`, `lg:grid-cols-4`, o **`lg:grid-cols-3 xl:grid-cols-5`** para 5 FKs), omitida limpiamente en catálogos raíz y seguida de línea divisoria (`hr.border-t.border-slate-200`).
2. **Zona Media — Zona de Registro (`Record Zone`):** Cuadrícula compacta de atributos (`2xl:grid-cols-4`) y edición inline RBAC (`ADMIN`/`WORKER`).
3. **Zona Inferior — Zona de Hijos (`Children Zone`):** Contenedor de pestañas con tablas `renderListViewTable` navegables al detalle de cada sub-registro:
   - **`Certificado` (`certificadoView.ts`):** **5 chips padres** (`Organización`, `Norma`, `Estatus`, `Sector IAF`, `Sub-Sector IAF` con salto directo a pestaña `subsectores`), atributos directos compactos (`numero_certificado`, `multisitio`, `alcance`) y **7 pestañas de hijos** (`Sitio`, `Proceso`, `Turno`, `No Aplicables`, `Auditoría`, `Fecha`, `Contacto`).
   - **`Fecha` (`fechaView.ts` + `certificadoSubEntities.ts`):** Padre (`Certificado`, `Organización`), 7 valores canónicos de `tipo_fecha`, validación de calendario y nota relativa de vigencia (`getFechaRelativeVigenciaNote`).
   - **`Contacto` (`contactoView.ts` + `certificadoSubEntities.ts`):** Padre (`Certificado`, `Organización`), edición de `nombre` y `cargo` opcional, y **2 pestañas de hijos** (`Teléfonos`, `Correos Electrónicos`) con creación inline y navegación a sus fichas dedicadas.
   - **`Teléfono` y `Correo Electrónico` (`telefonoView.ts`, `emailView.ts`):** Padre (`Contacto`, `Certificado`, `Organización`), edición inline y archivo seguro para `ADMIN`/`WORKER`.
   - **`Acreditación` (`acreditacionView.ts` + `acreditacionDomain.ts`):** Padre (`Norma`, `Sector IAF`), vigencia (`Vigente` / `Por Vencer` / `Vencida`), pestañas `Certificados Amparados` y `Sub-Sectores IAF del Alcance`.
   - **`Sitio` (`sitioView.ts` + `sitioDomain.ts`):** Padre (`Certificado`, `Organización`), resaltado de **`Sede Principal (Sitio 0)`** HQ con protección de archivo (`canArchiveSitio`), pestañas `Turnos Operativos Asignados` y `Auditorías en este Sitio`.
   - **`Proceso` (`procesoView.ts` + `procesoDomain.ts`):** Padre (`Certificado`, `Organización`, `Norma`), tipificación (`Estratégico`, `Medular`, `De Apoyo`, `Otro`), pestañas `Requisitos Normativos Vinculados` (cobertura `LTREE`), `Hallazgos Asociados` y `Auditorías Programadas`.
   - **`Turno` (`turnoView.ts` + `turnoDomain.ts`):** Padre dinámico (`Sitio` de origen cuando se accede desde una sede; omitido cuando es raíz), cálculo de duración con cruce de medianoche (`computeShiftDurationLabel`: ej. `22:00`–`06:00` = `8h 00m (nocturno)`), pestañas `Sedes Operativas con este Turno` y `Auditorías en este Turno`.
- **Modal de Archivo Seguro (`archiveModalView.ts`):** Al pulsar `🗄️ Archivar`, consulta `get_archive_dependency_summary` combinado con dependencias locales (`mergeArchiveDependencySummaries`). Si existen dependencias activas, bloquea la confirmación mostrando el desglose legible sin UUIDs; si está libre de dependencias, solicita motivo opcional (máx. 300 caracteres) y ejecuta soft-delete vía `archive_record`.

---

## 3. Inventario de Módulos de Lógica Pura (`src/lib/` — 22 módulos)

| Módulo | Responsabilidades Principales |
| :--- | :--- |
| `supabase.ts` | Cliente singleton `@supabase/supabase-js` usando únicamente URL pública y Anon Key. |
| `html.ts` | Escape HTML anti-XSS (`escapeHtml`). |
| `layout.ts` | Tokens de diseño panorámico *widescreen* (`APP_SHELL_CONTAINER_CLASS`, `APP_HEADER_CONTAINER_CLASS` a `max-w-[1720px]`) y rejilla adaptable `getUniversalCardGridClass`. |
| `healthCheck.ts` | Guardias RBAC (`evaluateAdminAccess`, `canAccessRoute`, `canModifyProfileStatus`, `canModifyProfileRole`), menús en 3 bloques (`getVisibleDomainMenus`), validación de auto-servicio en `Mi Perfil` (`buildSelfProfileUpdatePayload`, `validatePasswordChangeInput`, `getProfileGovernanceMeta`), iconografía de identidad y traducción de errores. |
| `accessControl.ts` | Aislamiento por rol, métricas scoped del dashboard (`computeDashboardSummaryMetrics`), control de escritura (`canEditAuditScheduleOrTeam`, `canMutateAuditExecution`) y acceso a `audit_log` (`canViewAuditLogForEntity`). |
| `archiveGovernance.ts` | Lista canónica de **27 tablas protegidas** (`PROTECTED_SOFT_DELETE_TABLES`) vs. **5 tablas de enlace M:N** (`PURE_JUNCTION_DELETE_TABLES`), permisos `canArchiveRecord`/`canInspectArchivedRecords`, sanitización de motivo, parsing/cálculo de `get_archive_dependency_summary`, extracción de archivados por dominio y renderizado del botón `🗄️ Archivar`. |
| `searchControls.ts` | Normalización Unicode sin acentos, búsqueda multi-token, filtros combinados, extracción de facetas y barras de cobertura ISO. |
| `activeCertificates.ts` | Conteo preciso de certificados activos (`countActiveCertificates`), validación de RIF/NIF (`validateRifFormat`) y filtrado de organizaciones. |
| `multisiteSampling.ts` | Convención Sitio 0 (`sortSitesWithPrincipalFirst`, `countMultisiteBranches`), tipos de `FechaCertificadoEntity`/`ContactoCertificadoEntity`/`TelefonoContactoEntity`/`EmailContactoEntity`, `CANONICAL_TIPO_FECHA_VALUES`, derivación de vigencias (`deriveCertificateVigenciaDates`), validación de `alcance` (10–1000 chars), justificación de exclusiones (`>= 5` chars) y clasificación visual de procesos. |
| `certificadoSubEntities.ts` | Resolución de detalle (`resolveFechaDetailById`, `resolveContactoDetailById`, `resolveTelefonoDetailById`, `resolveEmailDetailById`), validación de fechas calendario y 7 tipos canónicos (`validateFechaInput`), contactos (`validateContactoInput`), teléfonos (`CANONICAL_TIPO_TELEFONO_VALUES`, default `'Oficina'`), correos (`CANONICAL_TIPO_EMAIL_VALUES`, default `'Trabajo'`), guardia `canArchiveContacto` y traducción de errores (`translateCertSubEntityDbError`). |
| `competencyMatrix.ts` | Emparejamiento de competencias técnicas contra norma ISO, sector IAF y sub-sector (`isAuditorQualifiedForScope`), más evaluación de vigencia de credenciales. |
| `auditDomain.ts` | Tipos base y utilidades estructurales compartidas del dominio Auditoría. |
| `auditExecution.ts` | Programación, calendario, detección de conflictos de solapamiento de auditores (`detectAuditorConflicts`), ciclo CAPA en 5 estados y motor de recomendación ISO/IEC 17021-1 Cláusulas 9.5/9.6 (`evaluateIso17021Recommendation`). |
| `acreditacionDomain.ts` | Modelo e hidratación de `acreditacion_norma_iaf`, evaluación de vigencia, cálculo de impacto en certificados activos y validaciones de alta/edición. |
| `sitioDomain.ts` | Resolución de `SitioDetailEntity`, resaltado de Sede 0, formateo de turnos asignados, validaciones de Sitio y guarda `canArchiveSitio`. |
| `procesoDomain.ts` | Resolución de `ProcesoDetailEntity`, catálogo `LTREE` por norma (`getScopedNormaRequirements`), cruce de hallazgos/auditorías y guarda `canArchiveProceso`. |
| `turnoDomain.ts` | Resolución de `TurnoDetailEntity`, cálculo de jornadas diurnas y con cruce de medianoche (`computeShiftDurationLabel`), validación de horarios y guarda `canArchiveTurno`. |
| `extraDomain.ts` | Modelos, datos semilla y utilidades para normas ISO, organismos acreditadores, acreditaciones Norma-IAF, árbol `LTREE`, sectores/sub-sectores IAF, estatus, tipos y metodologías. |
| `breadcrumb.ts` | Pila inmutable de *breadcrumbs* (incluyendo `fecha_certificado`, `contacto_certificado`, `telefono_contacto`, `email_contacto`), colapso con elipsis (`MAX_VISIBLE_BREADCRUMBS = 4`), prevención de bucles por clave compuesta, reseteo (`resetBreadcrumbToDomain`) y truncamiento a 24 caracteres. |
| `universalTemplate.ts` | Motor Multi View: búsqueda normalizada, filtrado intra-categoría OR / inter-categoría AND (`filterRecordsWithFacets`), conteos reactivos *rest-out* ($S_{-k}$) (`computeReactiveFacetCounts`), totalizador `"Mostrando X de Y"`, ordenamiento determinista y redimensionamiento porcentual de columnas (`resizeAdjacentColumns`, `resolveColumnWidthPercentages`). |
| `auditLog.ts` | Resolución legible de actores sin UUIDs (`resolveAuditActorDisplay`), formateo de fechas locales y cálculo de diferencias campo a campo (`computeFieldDiffs`). |
| `zeroUuid.ts` | Auditoría estática de cumplimiento Zero-UUID en texto visible y atributos accesibles HTML (`findExposedUuidsInHtml`, `assertZeroUuidExposure`), ignorando atributos internos `data-*`. |

---

## 4. Inventario de Vistas Modulares (`src/views/` — 34 módulos)

| Grupo Funcional | Vistas (`src/views/*.ts`) | Responsabilidad Principal |
| :--- | :--- | :--- |
| **Shell, Plantillas y Gobernanza (10)** | `authView.ts`, `header.ts`, `breadcrumbView.ts`, `dashboardView.ts`, `profileView.ts`, `searchControlsView.ts`, `universalTemplate.ts`, `detailTemplate.ts`, `auditLogModal.ts`, `archiveModalView.ts` | Login/Sign up/Quick Login + Reset DB; cabecera en 3 bloques (`data-nav-reset="true"`); breadcrumbs de 1 línea; dashboard minimalista de 5 métricas; `Mi Perfil`; plantillas universales Multi View (facetas colapsables, `type="text"`, tablas `table-fixed` redimensionables) y Detail View compacto en 3 Zonas (hasta 5 FKs); modal forense `audit_log`; modal de archivo seguro y toast de archivo/restauración. |
| **Consola Administrativa (2)** | `approvalsView.ts`, `databaseStatusView.ts` | Aprobación/rechazo y cambio de rol en vivo (`ADMIN`, solo lectura para `WORKER`), más diagnóstico de conectividad en 5 comprobaciones en vivo contra Supabase. |
| **Dominio Auditoría (4)** | `auditoriasView.ts`, `programacionView.ts`, `calendarioView.ts`, `resultadoView.ts` | Conmutador de bloque; **Programación** (Multi View, modal de planificación, ficha en 3 Zonas y 3 pestañas); **Calendario** (Mensual, Trimestral, Timeline Gantt y conflictos); **Resultado** (tablero Tabla/Kanban de hallazgos, flujo CAPA y motor ISO 17021-1). |
| **Dominio Certificación y Sub-entidades (11)** | `certificacionView.ts`, `organizacionView.ts`, `certificadoView.ts`, `auditorView.ts`, `sitioView.ts`, `procesoView.ts`, `turnoView.ts`, `fechaView.ts`, `contactoView.ts`, `telefonoView.ts`, `emailView.ts` | **Organización** con conteo de certificados activos; **Certificado** con Multi View reactiva (facetas incluyendo Sub-Sector IAF) y Detail View compacto en 3 Zonas con **5 chips padres** y **7 pestañas de hijos**; **Auditor** con matriz de competencias; fichas de detalle dedicadas en 3 Zonas para **Sitio** (Sede 0), **Proceso** (`LTREE`), **Turno** (cálculo nocturno), **Fecha**, **Contacto** (pestañas Teléfonos/Correos), **Teléfono** y **Correo Electrónico**. |
| **Dominio Extra — Catálogos y Acreditación (7)** | `extraView.ts`, `normaView.ts`, `sectorIafView.ts`, `acreditacionView.ts`, `estatusView.ts`, `tipoAuditoriaView.ts`, `metodologiaAuditoriaView.ts` | Vistas universales Multi View con barra lateral colapsable y fichas de detalle en 3 Zonas para normas ISO (acreditaciones + cláusulas `LTREE`), sectores/sub-sectores IAF, **Acreditación Norma × IAF**, 8 estatus canónicos, 9 tipos de auditoría y 3 metodologías. |
