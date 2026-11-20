# Arquitectura del Frontend SPA (`programa_aud`)

> Documento técnico complementario de [`project_resume.md`](../project_resume.md). Describe la aplicación **Single-Page Application (SPA)** en TypeScript estricto (`strict: true`, `0 any`), renderizado declarativo con **44 módulos de lógica pura (`src/lib/`)** (más `src/lib/generated/normasCatalogBundle.ts`) y **54 vistas modulares (`src/views/`)**, layout panorámico *widescreen* (`max-w-[1720px]`), **menú anidado de 3er nivel (`Designación`)**, **barra Pipeline Stepper de 1 palabra (`Vínculo` → `Tipo` / `Sitio` / `Temporal` → `Tiempo` → `Asignación` → `Programa` → `Calendario` → `Resultado` → `Revisión`)**, **Matriz de Ciclos (`Sitio`)**, **tarjetas históricas con drawer colapsable (`Programa 8A/8B`)**, **Calendario en 3 Modos (`Año`/`Q1–Q4`/`Mes`/`Timeline`) con Alertas Configurables**, motor de cobertura `LTREE` + **Coverage HUD**, motor documental bilingüe ES/EN, compilación con Vite `6.4.6` (`manualChunks`, **144 módulos**) y estilos en Tailwind CSS v4.

---

## 1. Orquestación de Estado, Rutas y Seguridad en Cliente (`src/main.ts`)

### 1.1 Contenedor Central de Estado (`AppState`)
`src/main.ts` (`36,335` líneas) centraliza el estado tipado en `AppState`, preserva el foco, el scroll y la posición del cursor (`runWithPlannerPreservedViewport`) durante el re-renderizado de filtros/búsquedas y editores, y coordina la hidratación en vivo con Supabase:
- **Sesión, Identidad y Perfil:** `booting`, `user`, `profile`, `authorizedClientOrgIds`, `clientAccessRows`, `profileForm`, `activeRoute`, `activeSubSection`, `openMenu`, `openNestedMenu`.
- **Navegación Contextual:** `breadcrumbs` (`BreadcrumbSegment[]`, **31 tipos de entidad**) y estado del cajón forense `auditLogModal`.
- **Gobernanza de Archivo Seguro y Restauración (`archiveGovernance`):** `showArchived` (exclusivo `ADMIN`), `modal` (`ArchiveModalState`), `toast` (`#archiveGovernanceToast` con autocierre), `restoringId`, `archivedRecordsByTable`, `archivedSnapshotsByKey`, `archivedCatalogIds`.
- **Autenticación, Aprobaciones y Diagnóstico:** `auth`, `approvals`, `dbCheck` (5 comprobaciones en vivo).
- **Preferencias de Tablas (`tableColumnWidths`):** Anchos porcentuales ajustables (`colgroup` sumando 100%) para Multi View, Calendario Tabla, Mapa de Cobertura, Revisión QA y pestañas hijas.
- **Datos Hidratados y Dominios Operativos (`domainData` + estados de vista):**
  - **Bloque Auditoría (Pipeline 11 Pasos):** `vinculoDomain`, `designacionTipoDomain`, `designacionSitioDomain`, `designacionTemporalDomain`, `tiempoDomain`, `asignacionDomain`, `programaCertificadoDomain` (8A `Procesos` / 8B `Turnos`), `programacionDomain` + `auditPlanning`, `calendarioDomain` (`Año`/`Trimestre Q1–Q4`/`Mes`/`Timeline`, `Cards`, `Table`, modal `configuracion_alerta_auditoria`), `resultadoDomain` (`REAL`, capacidad concurrente, NC `+15d`/`+60d`, cierre formal `'Cerrada'`) y `revisionDomain` (cola QA Post-Cierre).
  - **Bloque Certificación:** `conglomeradoDomain` (buckets `grupo_empresarial`), `organizacionDomain`, `clientAccessDomain`, `certificadoDomain` (`Coverage HUD` + `Mapa de Cobertura`), `sitioDomain` (`procesos_por_sitio`), `procesoDomain` (selector batch `LTREE`), `turnoDomain`, `noAplicableDomain` (banner Smart Mutation), `fechaDomain`, `contactoDomain`, `telefonoDomain`, `emailDomain`, `auditorDomain`, `competenciaAuditorDomain`.
  - **Bloque Extra (`extraDomain`):** `Norma` + `Requisito` (lector completo + editor bilingüe con autocompletado `{` + override `MANUAL`), `Sector IAF` + `Sub-Sector IAF`, `Organismo de Acreditación`, `Acreditación` (`acreditacion_norma` + `acreditacion_norma_sector_iaf`), `Estatus`, `Tipo` y `Metodología`.

### 1.2 Enrutamiento Hash SPA y Guardias RBAC
- **Rutas soportadas (`ActiveRoute`):** `'dashboard'`, `'profile'`, `'approvals'`, `'database'`, `'auditorias'`, `'certificacion'`, `'extra'`.
- **Sincronización Hash (`#/{route}` o `#/{route}/{subview}`):** Escucha `hashchange` y `popstate`, incluyendo subrutas de 3er nivel (`#/auditorias/designacion/tipo`, `#/auditorias/designacion/sitio`, `#/auditorias/designacion/temporal`) y enlaces individuales de certificado en `#/auditorias/programa`.
- **Guardia `canAccessRoute(profile, route)` y `isApprovedStaffProfile(profile)`:**
  - `'dashboard'` y `'profile'` (`Mi Perfil`) son accesibles para cualquier autenticado (`PENDING`/`REJECTED` con escritura bloqueada).
  - `'database'` exclusivo `ADMIN` aprobado; `'approvals'` para `ADMIN` (edición) y `WORKER` (solo lectura).
  - **`getVisibleDomainMenus(profile)`:**
    - `Auditoría` (`Vínculo`, `Designación > { Tipo, Sitio, Temporal }`, `Tiempo`, `Asignación`, `Programa`, `Calendario`, `Resultado`, `Revisión`): `ADMIN`, `WORKER`, `AUDITOR`, `CLIENT`.
    - `Certificación` (`Conglomerado` #1, `Organización`, `Certificado`, `Auditor`): `ADMIN`, `WORKER`, `CLIENT` (**completamente oculto y bloqueado para `AUDITOR`**).
    - `Extra`: todo usuario `APPROVED` (`'add' | 'edit'` exclusivo `ADMIN`/`WORKER`).

### 1.3 Hidratación Paginada, Anti-XSS y Zero-UUID
- **Hidratación Paginada (`paginatedHydration.ts`):** Carga las **2,188 cláusulas** y **2,684 traducciones ES/EN** mediante cursor `.range(from, to)` superando el límite de 1,000 filas de PostgREST, con respaldo offline `normasCatalogBundle.ts`.
- **Bloque 1 & Conglomerado/Vínculo (`src/main.ts`):** Hidrata en paralelo `grupo_empresarial`, `vinculo`, `vinculo_certificado`, `programa_auditoria`, `auditoria`, `auditoria_fecha`, `configuracion_alerta_auditoria`, `procesos_por_sitio`, `sitios_por_auditoria`, `auditoria_sitio_temporal`, `auditoria_sitio_temporal_certificado`, `turnos_sitio_auditoria`, `procesos_sitio_auditoria`, `turnos_proceso_sitio_auditoria`, `equipo_auditor_sitio`, `equipo_auditor_sitio_temporal`, `equipo_auditor_proceso_sitio` y `equipo_auditor`.
- **Anti-XSS y Zero-UUID:** Escape obligatorio vía `escapeHtml()`, sanitización HTML estricta `sanitizeClauseHtml()`, atajos `/` y `Escape`, y prohibición absoluta de UUIDs expuestos en texto visible, atributos o inputs (`zeroUuid.ts`).

---

## 2. Patrones UI/UX Estandarizados

### 2.1 Cabecera Global con Menú Anidado, Dashboard Minimalista y `Mi Perfil`
- **Contenedor Panorámico (`layout.ts`):** `max-w-[1720px]` con padding responsivo; `Auth` en `max-w-md`.
- **Cabecera (`header.ts`):** Enlaces con `data-nav-reset="true"`, 3 bloques (`Auditoría` con menú anidado de 3er nivel **`Designación > { Tipo, Sitio, Temporal }`**, `Certificación` con **`Conglomerado`** en posición #1, y `Extra`) e iconografía minimalista (`🛡️` `ADMIN`, `⚙️` `WORKER`, `📋` `AUDITOR`, `🏢` `CLIENT`, `⏳` `PENDING`, `❌` `REJECTED`).
- **Pipeline Stepper (`pipelineEngine.ts` + `auditoriasView.ts`):** Barra superior uniforme con botones de etapa de 1 palabra (`Vínculo`, `Designación: Tipo / Sitio / Temporal`, `Tiempo`, `Asignación`, `Programa`, `Calendario`, `Resultado`, `Revisión`) compartida en todas las sub-vistas de `Auditoría`.
- **Dashboard (`dashboardView.ts`):** Saludo nominal + 5 métricas RBAC sin tarjetas duplicadas.
- **`Mi Perfil` (`profileView.ts`):** Auto-edición exclusiva de `nombre` (`buildSelfProfileUpdatePayload`) y contraseña (`validatePasswordChangeInput`), manteniendo `role` y `status` de solo lectura.

### 2.2 Motor de Breadcrumbs Compactos (`breadcrumb.ts` + `breadcrumbView.ts`)
- Barra de una línea (`flex-nowrap overflow-hidden whitespace-nowrap`), truncamiento a **24 caracteres**, colapso intermedio con `…` (`MAX_VISIBLE_BREADCRUMBS = 4`) y **31 tipos de entidad** incluyendo `grupo_empresarial`, `vinculo`, `programa_auditoria`, `sitio_auditoria`, `sitio_temporal` y `proceso_sitio`.
- Prevención automática de bucles por clave compuesta y soporte de segmentos de creación `'...-new'`.

### 2.3 Plantilla Universal Multi View Clean List (`universalTemplate.ts`)
- Barra unificada: botón **`☰ Filtros`**, buscador único `<input type="text">` con un solo `✕`, totalizador **`Mostrando X de Y`**, botón CTA **`+`** (Staff), conmutador **`[⊞ Tarjetas | ☰ Tabla]`** y checkbox **`Mostrar Archivados`** (`ADMIN`).
- Tablas `table-fixed` con `<colgroup>` sumando `100%`, redimensionamiento interactivo y **cero botones dentro de `<tbody>`**.
- Barra lateral de facetas reactivas $S_{-k}$ y sección inferior de restauración histórica para `ADMIN`.

### 2.4 Flujo Pipeline de 11 Pasos (`Conglomerado` → `Revisión`)
1. **Paso 1 — `Conglomerado` (`conglomeradoView.ts` + `conglomeradoDomain.ts`):** Multi View + Detail con filtro `"Organizaciones solas / sin agrupar"`, creación automática 1:1 y re-agrupación para elegibilidad Nivel 2.
2. **Paso 2 — `Vínculo` (`vinculoView.ts` + `vinculoDomain.ts`):** Tabs `Vínculos` / `Certificados Libres`, compuerta que impide programar certificados `LIBRE`, selección Nivel 1/Nivel 2/Mixta y flag `tiene_sitio_temporal`.
3. **Pasos 3–5 — `Designación > { Tipo, Sitio, Temporal }` (`designacionTipoView.ts`, `designacionSitioView.ts`, `designacionTemporalView.ts`):**
   - `Tipo`: Tabs `Próximas a ejecutar`, `Preprogramadas Mes`, `Futuro +1/+3 años`, `Todas`, alta de campaña y reprogramaciones 1:N (`auditoria_fecha`).
   - `Sitio`: Pre-selección `Sitio 0 HQ`, **Selector Matriz de Ciclos (`◀` / `▶`)** sin `<select>` y alternancia de `tiene_sitio_temporal`.
   - `Temporal`: Sitios temporales de proyecto (`auditoria_sitio_temporal`) con atribución a certificados (`auditoria_sitio_temporal_certificado`) y filtro `"Sin auditores asignados"`.
4. **Pasos 6–7 — `Tiempo` & `Asignación` (`tiempoView.ts`, `asignacionView.ts`):** Steppers `0.25d` para sitios regulares y temporales, resumen combinado y balanceo de auditores por competencia y rotación.
5. **Paso 8 — `Programa` (`programaView.ts`, `programaProcesosView.ts`, `programaTurnosView.ts`):** Navegación por certificado con **Mini-Paso 8A (`Procesos`)**: tarjetas restringidas a `procesos_por_sitio`, alerta `⚠️ Nunca auditado`, **drawer colapsable `"Ver Programa Anterior / Futuro"`** y botón `"Seleccionar todos los Medulares"`; y **Mini-Paso 8B (`Turnos`)**.
6. **Paso 9 — `Calendario` (`calendarioView.ts` + `pipelineEngine.ts` + `auditAlertsEngine.ts`):** Conmutador `Calendario | Tarjetas | Tabla`, sub-vistas **Año**, **Trimestre (Q1–Q4)**, **Mes** y **Timeline**, **badges de etapa de 1 palabra** con salto directo al paso activo, drawer de alertas y modal **`⚙ Configurar Alertas`** (incl. umbrales NC `+15d`/`+60d`).
7. **Pasos 10–11 — `Resultado` & `Revisión` (`resultadoView.ts`, `revisionView.ts`):** Registro de fecha `REAL` con validación de capacidad concurrente, registro NC vinculado a cláusula y proceso con plazos automáticos (`+15d`/`+60d`), cierre `'Cerrada'`, y compuerta final QA en **`Revisión`** (`Pendientes de Revisión` / `Revisadas`, `documentacion_completa`, `fecha_revision`, `resumen_revision`).

### 2.5 Infraestructura `Procesos del Sitio`, `Coverage HUD` y Fichas de `Certificación` / `Extra`
- **Catálogo `Procesos del Sitio` en `Certificación` (`sitioView.ts` + `sitioDomain.ts`):** La ficha Detail de **`Sitio`** incorpora la pestaña **`Procesos del Sitio`**, vinculando qué procesos operan físicamente en cada sede (`procesos_por_sitio`).
- **Coverage HUD + Mapa de Cobertura (`certificadoView.ts` + `coverageEngine.ts`):** Panel analítico entre los 5 chips padres y las 7 pestañas del certificado con barra SVG segmentada, respaldado por selector batch `LTREE` (`procesoView.ts`) y banner Smart Mutation (`noAplicableView.ts`).
- **Lector y Editor Bilingüe de Cláusulas (`requisitoView.ts` + `richTextEditor.ts` + `normaFullReader.ts`):** Navegación compacta entre hermanas y sub-cláusulas directas, `+ Sub-cláusula`, override `MANUAL` de obligatoriedad, Lector Completo (`es`/`en`/`bilingual`) y editor `Visual`/`HTML`/`Vista Previa` con autocompletado `{`.

---

## 3. Inventario de Módulos de Lógica Pura (`src/lib/` — 44 módulos + `generated/`)

| Módulo | Responsabilidades Principales |
| :--- | :--- |
| `supabase.ts` | Cliente singleton `@supabase/supabase-js` (URL pública + Anon Key). |
| `html.ts` | Escape HTML anti-XSS (`escapeHtml`). |
| `layout.ts` | Contenedores *widescreen* (`max-w-[1720px]`) y grilla `getUniversalCardGridClass`. |
| `rbac.ts` | `isApprovedStaffProfile` e `isApprovedAdminProfile`. |
| `healthCheck.ts` | Guardias RBAC (`canAccessRoute`, `getVisibleDomainMenus` con menú anidado `Designación` y `Conglomerado` #1), auto-servicio `Mi Perfil` y salud DB. |
| `accessControl.ts` | Aislamiento por rol, bloqueo de `AUDITOR` en Bloque 2, métricas Dashboard y permisos de ejecución/bitácora. |
| `archiveGovernance.ts` | **43 tablas** `PROTECTED_SOFT_DELETE_TABLES`, **5 tablas** `PURE_JUNCTION_DELETE_TABLES`, `get_archive_dependency_summary`, extracción por dominio y botón `🗄️ Archivar`. |
| `searchControls.ts` | Normalización Unicode sin acentos, búsqueda multi-token y facetas. |
| **`conglomeradoDomain.ts`** *(Nuevo)* | Gestión de `grupo_empresarial`, detección de organizaciones solas, re-agrupación hacia conglomerado corporativo y aislamiento RBAC. |
| **`vinculoDomain.ts`** *(Nuevo)* | Contratos de `vinculo` y `vinculo_certificado`, detección de certificados `LIBRE`/`INDIVIDUAL`/`VINCULADO`, reemplazo `Multisitio → Mixta` y aislamiento Nivel 2 `CLIENT`. |
| `activeCertificates.ts` | Conteo estricto de certificados activos, validación RIF/NIF y `client_organization_access`. |
| `multisiteSampling.ts` | Convención Sitio 0 (`sortSitesWithPrincipalFirst`), cascada IAF, sub-entidades de `certificado`, `alcance` y Mapa de Cobertura. |
| `coverageEngine.ts` | Espejo isomórfico 1:1 del motor SQL `LTREE` + Smart Mutation. |
| `certificadoSubEntities.ts` | Contratos `'read' \| 'add' \| 'edit'` para `fecha_certificado`, `contacto_certificado`, `telefono_contacto_certificado`, `email_contacto_certificado`. |
| `noAplicableDomain.ts` | Exclusiones ISO 4.3 (`NO_APLICABLE_JUSTIFICACION_MIN_LENGTH = 15`), opciones anotadas y agrupación Smart Mutation. |
| `competencyMatrix.ts` | Competencias técnicas M:N del auditor y cascada `Sector IAF → Sub-Sector`. |
| `auditDomain.ts` | Tipos base y utilidades estructurales compartidas del dominio Auditoría. |
| **`designacionTipoDomain.ts`**, **`designacionSitioDomain.ts`**, **`designacionTemporalDomain.ts`** *(Nuevos)* | Reglas por cola operativa temporal (`Próximas a ejecutar` vs `Futuro +1/+3 años`), Matriz de Ciclos multi-anual para `Sitio 0` y sitios temporales multicertificado (`auditoria_sitio_temporal*`). |
| **`tiempoDomain.ts`**, **`asignacionDomain.ts`**, **`programaCertificadoDomain.ts`** *(Nuevos)* | Distribución `0.25d` regular + temporal (`Tiempo`), balanceo de auditores regular + temporal (`Asignación`) y selección por certificado `8A Procesos` / `8B Turnos` con historial (`Programa`). |
| **`pipelineEngine.ts`** *(Nuevo)* | Motor puro de etapa actual de 1 palabra (`Vínculo` → `Tipo` → `Sitio` → `Temporal` → `Tiempo` → `Asignación` → `Programa` → `Resultado` → `Revisión` → `Finalizada`) y contadores de Calendario (`Año`, `Q1–Q4`, `Mes`). |
| `auditPlanningEngine.ts` & `auditAlertsEngine.ts` | Reglas `INDIVIDUAL`/`NIVEL_1`/`NIVEL_2`, fechas `PREPROGRAMADA_MES`/`PROGRAMADA_EXACTA`/`REAL`, balance Dual-Bucket `0.25d`, capacidad vs span, alertas configurables (incl. plazos NC) y rotación Auditor Líder. |
| `auditPlanningPersistence.ts` | Validadores y constructores Zero-UUID para guardado atómico de campañas, fechas 1:N, sitios por auditoría, equipos y `configuracion_alerta_auditoria`. |
| `auditExecution.ts` | Calendario, flujo CAPA en 5 estados y recomendación ISO/IEC 17021-1 Cláusulas 9.5/9.6. |
| **`resultadoDomain.ts`** & **`revisionDomain.ts`** *(Nuevos)* | Validación de capacidad concurrente sobre fecha `REAL`, cálculo de plazos NC `+15d`/`+60d`, prellenado editable de `fecha_cierre_auditoria`, cierre formal `'Cerrada'` (`Resultado`) y compuerta QA (`Revisión`: `Pendientes` / `Revisadas`). |
| `acreditacionDomain.ts` | Contratos `'read' \| 'add' \| 'edit'` para `organismo_acreditacion`, `acreditacion_norma` y `acreditacion_norma_sector_iaf`. |
| `sitioDomain.ts`, `procesoDomain.ts`, `turnoDomain.ts` | Sedes (`Sitio 0`) y `procesos_por_sitio`, selector batch `LTREE`, horarios y turnos. |
| `extraDomain.ts`, `clauseRenderer.ts`, `normaFullReader.ts`, `richTextEditor.ts` | Catálogos `Extra`, jerarquía `LTREE`, sanitización HTML, expansión `{clause_...}`, lector documental y editor bilingüe ES/EN. |
| `paginatedHydration.ts`, `requisitoCsvImporter.ts`, `generated/normasCatalogBundle.ts` | Paginación `.range()` >1,000 filas, importador CSV y respaldo offline (8 normas, 2,188 cláusulas, 2,684 traducciones). |
| `breadcrumb.ts`, `universalTemplate.ts`, `auditLog.ts`, `zeroUuid.ts` | Pila inmutable (**31 tipos**), Multi View `table-fixed`, resolución Zero-UUID en `audit_log` y auditoría estática `assertZeroUuidExposure`. |

---

## 4. Inventario de Vistas Modulares (`src/views/` — 54 módulos)

| Grupo Funcional | Vistas (`src/views/*.ts`) | Responsabilidad Principal |
| :--- | :--- | :--- |
| **Shell, Plantillas y Gobernanza (10)** | `authView.ts`, `header.ts`, `breadcrumbView.ts`, `dashboardView.ts`, `profileView.ts`, `searchControlsView.ts`, `universalTemplate.ts`, `detailTemplate.ts`, `auditLogModal.ts`, `archiveModalView.ts` | Login/Quick Login + Reset DB; cabecera 3 bloques con menú anidado 3er nivel; breadcrumbs (**31 tipos**); Dashboard 5 métricas; `Mi Perfil`; plantillas Multi View (`table-fixed`) y Detail View; cajón forense `audit_log`; modal de archivo seguro y toast. |
| **Consola Administrativa (2)** | `approvalsView.ts`, `databaseStatusView.ts` | Gestión de roles/estados (`ADMIN`, lectura `WORKER`) y diagnóstico Supabase (exclusivo `ADMIN`). |
| **Dominio Auditoría — Pipeline 11 Pasos (16)** | `auditoriasView.ts`, **`vinculoView.ts`**, **`designacionTipoView.ts`**, **`designacionSitioView.ts`**, **`designacionTemporalView.ts`**, **`tiempoView.ts`**, **`asignacionView.ts`**, **`programaView.ts`**, **`programaProcesosView.ts`**, **`programaTurnosView.ts`**, `programacionView.ts`, `auditPlannerView.ts`, `sitioAuditoriaView.ts`, `calendarioView.ts`, `resultadoView.ts`, **`revisionView.ts`** | Pipeline Stepper 1-palabra compartido; **Vínculo**; **Designación** (`Tipo`, `Sitio` con tira de ciclos, `Temporal`); **Tiempo** (`0.25d`); **Asignación**; **Programa** (`8A Procesos` con drawer histórico + `8B Turnos`); **Calendario** (`Año`/`Q1–Q4`/`Mes`/`Timeline` + badges 1-palabra + `⚙ Configurar Alertas`); **Resultado** (`REAL` + CAPA `+15d`/`+60d` + Cierre); **Revisión** (Cola QA Post-Cierre). |
| **Dominio Certificación y Sub-entidades (15)** | `certificacionView.ts`, **`conglomeradoView.ts`**, `organizacionView.ts`, `clientAccessView.ts`, `certificadoView.ts`, `auditorView.ts`, `competenciaAuditorView.ts`, `sitioView.ts`, `procesoView.ts`, `turnoView.ts`, `noAplicableView.ts`, `fechaView.ts`, `contactoView.ts`, `telefonoView.ts`, `emailView.ts` | Enrutador; **Conglomerado** (#1); **Organización** + **Acceso Cliente**; **Certificado** (6 cols + 5 FKs + **Coverage HUD / Mapa** + 7 pestañas); **Auditor** + **Competencias M:N**; **Sitio** (`Sitio 0` + **`Procesos del Sitio`**); **Proceso** (`LTREE`); **Turno**; **No Aplicables** (Smart Mutation); **Fecha**, **Contacto**, **Teléfono** y **Correo**. |
| **Dominio Extra — Catálogos, Lector y Editor Normativo (11)** | `extraView.ts`, `normaView.ts`, `requisitoView.ts`, `richTextEditor.ts`, `sectorIafView.ts`, `subsectorIafView.ts`, `organismoAcreditacionView.ts`, `acreditacionView.ts`, `estatusView.ts`, `tipoAuditoriaView.ts`, `metodologiaAuditoriaView.ts` | Enrutador; **Norma** (`Ver Norma`) + **Requisito LTREE** + **Editor Bilingüe ES/EN** (autocompletado `{`); **Sector IAF** + **Sub-Sector IAF**; **Organismo** + **Acreditación**; **Estatus**, **Tipo** y **Metodología**. |
