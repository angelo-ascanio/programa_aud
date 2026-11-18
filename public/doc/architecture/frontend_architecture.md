# Arquitectura del Frontend SPA (`programa_aud`)

> Documento técnico complementario de [`project_resume.md`](../project_resume.md). Describe la aplicación **Single-Page Application (SPA)** en TypeScript estricto (`strict: true`, `0 any`), renderizado declarativo con **33 módulos de lógica pura (`src/lib/`)** (más `src/lib/generated/normasCatalogBundle.ts`) y **43 vistas modulares (`src/views/`)**, layout panorámico *widescreen* (`max-w-[1720px]`), **Planificador Visual en 2 Pasos (HUD Dual-Bucket `0.25d` + Árbol Sitio–Proceso–Turno–Auditor)**, **Calendario Unificado en 3 Modos con Alertas Configurables**, motor de cobertura `LTREE` + **Coverage HUD**, motor documental bilingüe ES/EN, compilación con Vite `6.4.6` (`manualChunks`, **122 módulos**) y estilos en Tailwind CSS v4.

---

## 1. Orquestación de Estado, Rutas y Seguridad en Cliente (`src/main.ts`)

### 1.1 Contenedor Central de Estado (`AppState`)
`src/main.ts` (`28,234` líneas) centraliza el estado tipado en `AppState`, preserva el foco y la posición del cursor durante el re-renderizado de filtros/búsquedas y editores, y coordina la hidratación en vivo con Supabase:
- **Sesión, Identidad y Perfil:** `booting`, `user`, `profile`, `authorizedClientOrgIds`, `clientAccessRows`, `profileForm`, `activeRoute`, `activeSubSection`, `openMenu`.
- **Navegación Contextual:** `breadcrumbs` (`BreadcrumbSegment[]`, **26 tipos de entidad**) y estado del cajón forense `auditLogModal`.
- **Gobernanza de Archivo Seguro y Restauración (`archiveGovernance`):** `showArchived` (exclusivo `ADMIN`), `modal` (`ArchiveModalState`), `toast` (`#archiveGovernanceToast` con autocierre), `restoringId`, `archivedRecordsByTable`, `archivedSnapshotsByKey`, `archivedCatalogIds`.
- **Autenticación, Aprobaciones y Diagnóstico:** `auth`, `approvals`, `dbCheck` (5 comprobaciones en vivo).
- **Preferencias de Tablas (`tableColumnWidths`):** Anchos porcentuales ajustables (`colgroup` sumando 100%) para Multi View, Calendario Tabla, Mapa de Cobertura y pestañas hijas.
- **Datos Hidratados y Dominios Operativos (`domainData` + estados de vista):**
  - **Bloque Auditoría:**
    - `programacionDomain` + `auditPlanning`: programas `programa_auditoria`, auditorías, cronología `auditoria_fecha` 1:N, filtro/drawer **`"Certificados Sin Programación"`**, paso activo del detalle (`step`: `1 | 2`), nodos expandidos en árbol (`expandedSiteIds`, `expandedProcessSiteIds`), selección de sitio en auditoría (`sitioAuditoriaView.ts`) y alertas calculadas en tiempo real.
    - `calendarioDomain`: sub-modos `viewMode` (`'calendar' | 'cards' | 'table'`), sub-vista de grilla (`'month' | 'quarter' | 'timeline'`), filtro por nivel/estado, drawer lateral de alertas y modal de **`configuracion_alerta_auditoria`**.
    - `resultadoDomain`: tablero `'list' | 'kanban'`, flujo CAPA y motor ISO/IEC 17021-1.
  - **Bloque Certificación:** `organizacionDomain`, `clientAccessDomain`, `certificadoDomain` (`Coverage HUD` + `Mapa de Cobertura`), `sitioDomain` (incluyendo vínculos **`procesos_por_sitio`** por sede), `procesoDomain` (selector batch `LTREE`), `turnoDomain`, `noAplicableDomain` (banner Smart Mutation), `fechaDomain`, `contactoDomain`, `telefonoDomain`, `emailDomain`, `auditorDomain`, `competenciaAuditorDomain`.
  - **Bloque Extra (`extraDomain`):** `Norma` + `Requisito` (lector completo + editor bilingüe con autocompletado `{` + override `MANUAL`), `Sector IAF` + `Sub-Sector IAF`, `Organismo de Acreditación`, `Acreditación` (`acreditacion_norma` + `acreditacion_norma_sector_iaf`), `Estatus`, `Tipo` y `Metodología`.

### 1.2 Enrutamiento Hash SPA y Guardias RBAC
- **Rutas soportadas (`ActiveRoute`):** `'dashboard'`, `'profile'`, `'approvals'`, `'database'`, `'auditorias'`, `'certificacion'`, `'extra'`.
- **Sincronización Hash (`#/{route}` o `#/{route}/{subview}`):** Escucha `hashchange` y `popstate`.
- **Guardia `canAccessRoute(profile, route)` y `isApprovedStaffProfile(profile)`:**
  - `'dashboard'` y `'profile'` (`Mi Perfil`) son accesibles para cualquier autenticado (`PENDING`/`REJECTED` con escritura bloqueada).
  - `'database'` exclusivo `ADMIN` aprobado; `'approvals'` para `ADMIN` (edición) y `WORKER` (solo lectura).
  - **`getVisibleDomainMenus(profile)`:**
    - `Auditoría` (`Programación`, `Calendario`, `Resultado`): `ADMIN`, `WORKER`, `AUDITOR`, `CLIENT`.
    - `Certificación` (`Organización`, `Certificado`, `Auditor`): `ADMIN`, `WORKER`, `CLIENT` (oculto para `AUDITOR`).
    - `Extra`: todo usuario `APPROVED` (`'add' | 'edit'` exclusivo `ADMIN`/`WORKER`).

### 1.3 Hidratación Paginada, Anti-XSS y Zero-UUID
- **Hidratación Paginada (`paginatedHydration.ts`):** Carga las **2,188 cláusulas** y **2,684 traducciones ES/EN** mediante cursor `.range(from, to)` superando el límite de 1,000 filas de PostgREST, con respaldo offline `normasCatalogBundle.ts`.
- **Bloque 1 & `procesos_por_sitio` (`src/main.ts`):** Hidrata en paralelo `programa_auditoria`, `auditoria`, `auditoria_fecha`, `configuracion_alerta_auditoria`, `procesos_por_sitio`, `sitios_por_auditoria`, `turnos_sitio_auditoria`, `procesos_sitio_auditoria`, `turnos_proceso_sitio_auditoria`, `equipo_auditor_sitio`, `equipo_auditor_proceso_sitio` y `equipo_auditor`, reconstruyendo `auditSnapshots`, alertas activas e históricos de ciclo (y sincronizando `loadArchivedRecordsForTable` / `handleRestoreArchivedRecord` sin referencias heredadas a `fecha_programacion`).
- **Anti-XSS y Zero-UUID:** Escape obligatorio vía `escapeHtml()`, sanitización HTML estricta `sanitizeClauseHtml()`, atajos `/` y `Escape`, y prohibición absoluta de UUIDs expuestos en texto visible, atributos o inputs (`zeroUuid.ts`).

---

## 2. Patrones UI/UX Estandarizados

### 2.1 Cabecera Global en 3 Bloques, Dashboard Minimalista y `Mi Perfil`
- **Contenedor Panorámico (`layout.ts`):** `max-w-[1720px]` con padding responsivo; `Auth` en `max-w-md`.
- **Cabecera (`header.ts`):** Enlaces con `data-nav-reset="true"`, 3 bloques (`Auditoría`, `Certificación`, `Extra`) e iconografía minimalista (`🛡️` `ADMIN`, `⚙️` `WORKER`, `📋` `AUDITOR`, `🏢` `CLIENT`, `⏳` `PENDING`, `❌` `REJECTED`).
- **Dashboard (`dashboardView.ts`):** Saludo nominal + 5 métricas RBAC sin tarjetas duplicadas.
- **`Mi Perfil` (`profileView.ts`):** Auto-edición exclusiva de `nombre` (`buildSelfProfileUpdatePayload`) y contraseña (`validatePasswordChangeInput`), manteniendo `role` y `status` de solo lectura.

### 2.2 Motor de Breadcrumbs Compactos (`breadcrumb.ts` + `breadcrumbView.ts`)
- Barra de una línea (`flex-nowrap overflow-hidden whitespace-nowrap`), truncamiento a **24 caracteres**, colapso intermedio con `…` (`MAX_VISIBLE_BREADCRUMBS = 4`) y **26 tipos de entidad** incluyendo **`programa_auditoria`**, **`sitio_auditoria`** y **`proceso_sitio`**.
- Prevención automática de bucles por clave compuesta y soporte de segmentos de creación `'...-new'`.

### 2.3 Plantilla Universal Multi View Clean List (`universalTemplate.ts`)
- Barra unificada: botón **`☰ Filtros`**, buscador único `<input type="text">` con un solo `✕`, totalizador **`Mostrando X de Y`**, botón CTA **`+`** (Staff), conmutador **`[⊞ Tarjetas | ☰ Tabla]`** y checkbox **`Mostrar Archivados`** (`ADMIN`).
- Tablas `table-fixed` con `<colgroup>` sumando `100%`, redimensionamiento interactivo y **cero botones dentro de `<tbody>`**.
- Barra lateral de facetas reactivas $S_{-k}$ y sección inferior de restauración histórica para `ADMIN`.

### 2.4 Bloque 1: Programación en 2 Pasos, HUD Dual-Bucket, Árbol Visual y Calendario 3 Modos
1. **Multi View `Programación` (`programacionView.ts`):**
   - Muestra tarjetas o tabla `table-fixed` con código de programa, etiqueta, nivel (`INDIVIDUAL` / `NIVEL_1_INTRA_ORG` / `NIVEL_2_INTER_ORG`), naturaleza, estado del ciclo (`Por programar` .. `Cerrada`), fechas vigentes (`PREPROGRAMADA_MES` / `REAL` / `Reprog. #N`), equipo y días-auditor (`0.25d`).
   - Incluye el botón/panel **`Certificados Sin Programación`** (`findUnprogrammedCertificatesByStatus`) con conteo y filtros rápidos por estatus (`Activo`, `Estudio`, etc.) para iniciar la programación con un clic.
   - Para `CLIENT` en campañas `NIVEL_2_INTER_ORG`, filtra visualmente solo sus certificados autorizados (en sintonía 1:1 con RLS).
2. **Ficha Detail de `Programación` en 2 Pasos (`programacionView.ts` + `auditPlannerView.ts`):**
   - **Paso 1 — Campaña, Certificados y Cronología 1:N (`auditoria_fecha`):** Permite crear/editar `programa_auditoria` (nivel, naturaleza, ciclo origen `id_ciclo_origen`), vincular 1 o más certificados (validando intra-org o inter-org mediante `validateProgramLinkingRules`), asignar `tiempo_auditoria` en pasos de **`0.25d`** y registrar/reprogramar fechas en **`auditoria_fecha`** (`PREPROGRAMADA_MES` Año/Mes o `REAL` Rango + motivo de reprogramación, manteniendo el histórico secuencial `Reprog. #1`, `#2`, etc.). En modo lectura para `AUDITOR` y `CLIENT`, deshabilita toda edición.
   - **Paso 2 — Panel Histórico, HUD Dual-Bucket y Árbol de Planificación (`auditPlannerView.ts`):**
     - **Panel Histórico de Ciclos (`renderCertificateHistoryPanel`):** Resume auditorías previas por certificado (`id_ciclo_origen` y ciclo anterior), días ejecutados, **alerta de rotación de Auditor Líder** (según `ciclos_rotacion_auditor_lider`) y **procesos del sitio nunca/sin auditar** para planificación basada en riesgos.
     - **Audit Planner HUD (`renderAuditPlannerHud`):** Compara en vivo los días asignados contra el objetivo del certificado bajo el modelo **Dual-Bucket (`Cubo 1` por sitio vs `Cubo 2` por proceso)** con precisión `0.25d`, porcentaje de avance, carga máxima por auditor vs *span* calendario (`validateAuditorCapacityAgainstSpan`) y completitud de procesos del sitio (`computeAuditPlanningStatus`).
     - **Árbol Visual Tipo Acordeón (`renderAuditPlannerTree`):** Jerarquía interactiva `Certificado → Sitios (Sitio 0 primero vía sortSitesWithPrincipalFirst) → Procesos del Sitio (estrictamente desde procesos_por_sitio) → 1..N Turnos (turnos_proceso_sitio_auditoria) → Auditores + Días (0.25d)`, incluyendo asignación rápida en `Cubo 1` (`equipo_auditor_sitio`) o granular por proceso en `Cubo 2` (`equipo_auditor_proceso_sitio`) con badge de competencia técnica y botón para abrir la ficha dedicada **`sitioAuditoriaView.ts`**.
3. **Calendario Unificado y Alertas Configurables (`calendarioView.ts` + `auditAlertsEngine.ts`):**
   - Conmutador de **3 modos (`Calendario | Tarjetas | Tabla`)**:
     - En **`Calendario`**, alterna entre sub-vistas **Mes**, **Trimestre** y **Línea de Tiempo (Gantt)** con etiquetas de fechas reales, reprogramaciones (`Reprog. #N`) y bandas punteadas/ámbar para `PREPROGRAMADA_MES`.
     - En **`Tarjetas`**, ofrece grilla adaptable limpia por campaña/certificado.
     - En **`Tabla`**, usa `renderListViewTable` (`table-fixed`, 6 columnas, `<colgroup>` 100%, 0 botones en `<tbody>`).
   - **Drawer de Alertas:** Calcula y agrupa alertas (`atrasadas`, `proximas`, `preprogramada_sin_confirmar`, `conflicto_auditor`, `desfase_dias_o_span`, `rotacion_auditor_lider`) en tiempo real.
   - **Modal `⚙ Configurar Alertas`:** Disponible únicamente para `ADMIN` y `WORKER` aprobados; persiste los umbrales globales en `configuracion_alerta_auditoria` (`validateAndNormalizeAlertConfigInput`).

### 2.5 Infraestructura `Procesos del Sitio`, `Coverage HUD` y Fichas de `Certificación` / `Extra`
- **Catálogo `Procesos del Sitio` en `Certificación` (`sitioView.ts` + `sitioDomain.ts`):** La ficha Detail de **`Sitio`** incorpora la pestaña **`Procesos del Sitio`**, permitiendo vincular y archivar de forma segura qué procesos declarados en el certificado operan físicamente en cada sede (`procesos_por_sitio`), alimentando como fuente de verdad única el Árbol Paso 2 de `Auditoría`.
- **Coverage HUD + Mapa de Cobertura (`certificadoView.ts` + `coverageEngine.ts`):** Panel analítico entre los 5 chips padres y las 7 pestañas del certificado con barra SVG segmentada (`CUBIERTO`, `NO_APLICABLE`, `PENDIENTE`), filtros interactivos y resolución rápida; respaldado por selector batch `LTREE` (`procesoView.ts`) y banner Smart Mutation (`noAplicableView.ts`).
- **Lector y Editor Bilingüe de Cláusulas (`requisitoView.ts` + `richTextEditor.ts` + `normaFullReader.ts`):** Sin botón redundante `Ir a Norma` ni ruta `LTREE` expuesta en UI; navegación compacta entre hermanas y sub-cláusulas directas, botón `+ Sub-cláusula`, override `MANUAL` de obligatoriedad, Lector Completo (`es`/`en`/`bilingual`) y editor `Visual`/`HTML`/`Vista Previa` con autocompletado `{`.

---

## 3. Inventario de Módulos de Lógica Pura (`src/lib/` — 33 módulos + `generated/`)

| Módulo | Responsabilidades Principales |
| :--- | :--- |
| `supabase.ts` | Cliente singleton `@supabase/supabase-js` (URL pública + Anon Key). |
| `html.ts` | Escape HTML anti-XSS (`escapeHtml`). |
| `layout.ts` | Contenedores *widescreen* (`max-w-[1720px]`) y grilla `getUniversalCardGridClass`. |
| `rbac.ts` | `isApprovedStaffProfile` e `isApprovedAdminProfile`. |
| `healthCheck.ts` | Guardias RBAC (`canAccessRoute`, `getVisibleDomainMenus`), auto-servicio `Mi Perfil` y salud DB. |
| `accessControl.ts` | Aislamiento por rol, métricas Dashboard y permisos de ejecución/bitácora. |
| `archiveGovernance.ts` | **37 tablas** `PROTECTED_SOFT_DELETE_TABLES`, **5 tablas** `PURE_JUNCTION_DELETE_TABLES`, `get_archive_dependency_summary`, `mergeArchiveDependencySummaries`, extracción por dominio y botón `🗄️ Archivar`. |
| `searchControls.ts` | Normalización Unicode sin acentos, búsqueda multi-token y facetas. |
| `activeCertificates.ts` | Conteo estricto de certificados activos, validación RIF/NIF y `client_organization_access`. |
| `multisiteSampling.ts` | Convención Sitio 0 (`sortSitesWithPrincipalFirst`), cascada IAF, sub-entidades de `certificado`, `alcance` y Mapa de Cobertura. |
| `coverageEngine.ts` | Espejo isomórfico 1:1 del motor SQL `LTREE` + Smart Mutation. |
| `certificadoSubEntities.ts` | Contratos `'read' \| 'add' \| 'edit'` para `fecha_certificado`, `contacto_certificado`, `telefono_contacto_certificado`, `email_contacto_certificado`. |
| `noAplicableDomain.ts` | Exclusiones ISO 4.3 (`NO_APLICABLE_JUSTIFICACION_MIN_LENGTH = 15`), opciones anotadas y agrupación Smart Mutation. |
| `competencyMatrix.ts` | Competencias técnicas M:N del auditor y cascada `Sector IAF → Sub-Sector`. |
| `auditDomain.ts` | Tipos base y utilidades estructurales compartidas del dominio Auditoría. |
| **`auditPlanningEngine.ts`** *(Nuevo)* | Reglas `INDIVIDUAL`/`NIVEL_1_INTRA_ORG`/`NIVEL_2_INTER_ORG` (7 naturalezas), validación `auditoria_fecha` 1:N, cálculo de balance **Dual-Bucket (`Cubo 1` vs `Cubo 2`)** con precisión **`0.25d`**, herencia de procesos/turnos, evaluación de completitud (`Por programar` → `Programada`) y re-exportación de alertas. |
| **`auditAlertsEngine.ts`** *(Nuevo)* | Span calendario vs carga máxima por auditor (`validateAuditorCapacityAgainstSpan`), detección de solapamientos (`detectAuditorScheduleConflicts`), detector `findUnprogrammedCertificatesByStatus`, evaluador `computeAuditAlerts` y resumen histórico de ciclos con rotación de Auditor Líder (`buildCertificateAuditHistoryDigest`). |
| **`auditPlanningPersistence.ts`** *(Nuevo)* | Validadores y constructores Zero-UUID para guardado atómico de campaña Paso 1, `auditoria_fecha`, `sitios_por_auditoria`, `equipo_auditor_sitio`, `equipo_auditor_proceso_sitio`, consolidación `equipo_auditor` y `configuracion_alerta_auditoria`. |
| `auditExecution.ts` | Calendario, flujo CAPA en 5 estados y recomendación ISO/IEC 17021-1 Cláusulas 9.5/9.6. |
| `acreditacionDomain.ts` | Contratos `'read' \| 'add' \| 'edit'` para `organismo_acreditacion`, `acreditacion_norma` y `acreditacion_norma_sector_iaf`. |
| `sitioDomain.ts` | Gestión de sedes (`Sitio 0`), `procesos_por_sitio` por sede y guardia `canArchiveSitio`. |
| `procesoDomain.ts` | Selector batch `LTREE`, conteos de subárboles y vinculación de procesos. |
| `turnoDomain.ts` | Validación de horarios y cálculo de jornadas diurnas/nocturnas. |
| `extraDomain.ts` | Catálogos `Extra`, cálculo interno `computeRequisitoLtreePath`, anti-ciclos e `es_obligatorio`. |
| `clauseRenderer.ts` | Sanitización allowlist XSS, expansión recursiva `{clause_...}` y conteo `debe`/`shall`. |
| `normaFullReader.ts` | Lector documental completo (`es` / `en` / `bilingual`) en orden DFS natural. |
| `richTextEditor.ts` | Lógica pura `Visual / HTML / Vista Previa`, autocompletado `{` y validación DAG anti-ciclos. |
| `paginatedHydration.ts` | Paginación `.range(from, to)` >1,000 filas e indexación $O(n)$ de traducciones. |
| `requisitoCsvImporter.ts` | Parser RFC 4180, reparación `.10`, clasificación `es_obligatorio` y UUIDs FNV-1a v4. |
| `generated/normasCatalogBundle.ts` | Catálogo embebido de respaldo (8 normas, 2,188 cláusulas, 2,684 traducciones). |
| `breadcrumb.ts` | Pila inmutable con **26 tipos de entidad**, elipsis `MAX_VISIBLE_BREADCRUMBS = 4` y anti-bucles. |
| `universalTemplate.ts` | Motor Multi View Clean List, facetas $S_{-k}$ y redimensionamiento porcentual `table-fixed`. |
| `auditLog.ts` | Resolución legible Zero-UUID de actores, diffs `JSONB` y formateo de fechas. |
| `zeroUuid.ts` | Auditoría estática `assertZeroUuidExposure` y validadores `isValidUuid`/`assertValidUuid`. |

---

## 4. Inventario de Vistas Modulares (`src/views/` — 43 módulos)

| Grupo Funcional | Vistas (`src/views/*.ts`) | Responsabilidad Principal |
| :--- | :--- | :--- |
| **Shell, Plantillas y Gobernanza (10)** | `authView.ts`, `header.ts`, `breadcrumbView.ts`, `dashboardView.ts`, `profileView.ts`, `searchControlsView.ts`, `universalTemplate.ts`, `detailTemplate.ts`, `auditLogModal.ts`, `archiveModalView.ts` | Login/Quick Login + Reset DB; cabecera 3 bloques; breadcrumbs (**26 tipos**); Dashboard 5 métricas; `Mi Perfil`; plantillas Multi View (`table-fixed`, CTA `+`) y Detail View; cajón forense `audit_log`; modal de archivo seguro y toast `#archiveGovernanceToast`. |
| **Consola Administrativa (2)** | `approvalsView.ts`, `databaseStatusView.ts` | Gestión de roles/estados (`ADMIN`, lectura `WORKER`) y diagnóstico Supabase (exclusivo `ADMIN`). |
| **Dominio Auditoría (6)** | `auditoriasView.ts`, `programacionView.ts`, **`auditPlannerView.ts`**, **`sitioAuditoriaView.ts`**, `calendarioView.ts`, `resultadoView.ts` | Conmutador de bloque; **Programación** (Multi View + `"Certificados Sin Programación"` + Ficha en 2 Pasos); **`auditPlannerView.ts`** (Historial de Ciclos, **HUD Dual-Bucket `0.25d`** y **Árbol Acordeón Sitio → Proceso → Turno → Auditor**); **`sitioAuditoriaView.ts`** (ficha dedicada de sede en auditoría); **Calendario** (**3 modos `Calendario \| Tarjetas \| Tabla`**, Mes/Trimestre/Timeline, drawer de alertas y modal **`⚙ Configurar Alertas`**); **Resultado** (Tabla/Kanban, CAPA y motor ISO 17021-1). |
| **Dominio Certificación y Sub-entidades (14)** | `certificacionView.ts`, `organizacionView.ts`, `clientAccessView.ts`, `certificadoView.ts`, `auditorView.ts`, `competenciaAuditorView.ts`, `sitioView.ts`, `procesoView.ts`, `turnoView.ts`, `noAplicableView.ts`, `fechaView.ts`, `contactoView.ts`, `telefonoView.ts`, `emailView.ts` | Enrutador; **Organización** + **Acceso Cliente**; **Certificado** (6 cols + 5 FKs + **Coverage HUD / Mapa** + 7 pestañas); **Auditor** + **Competencias M:N**; **Sitio** (`Sitio 0` + pestaña **`Procesos del Sitio`** `procesos_por_sitio`); **Proceso** (batch `LTREE`); **Turno**; **No Aplicables** (Smart Mutation); **Fecha**, **Contacto**, **Teléfono** y **Correo**. |
| **Dominio Extra — Catálogos, Lector y Editor Normativo (11)** | `extraView.ts`, `normaView.ts`, `requisitoView.ts`, `richTextEditor.ts`, `sectorIafView.ts`, `subsectorIafView.ts`, `organismoAcreditacionView.ts`, `acreditacionView.ts`, `estatusView.ts`, `tipoAuditoriaView.ts`, `metodologiaAuditoriaView.ts` | Enrutador; **Norma** (`Ver Norma`) + **Requisito LTREE** (navegación compacta hermanas/hijas, `+ Sub-cláusula`, override `MANUAL`, Lector Completo) + **Editor Bilingüe ES/EN** (autocompletado `{`); **Sector IAF** + **Sub-Sector IAF**; **Organismo** + **Acreditación**; **Estatus**, **Tipo** y **Metodología**. |
