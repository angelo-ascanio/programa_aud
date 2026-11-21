# Arquitectura del Frontend SPA (`programa_aud`)

> Documento técnico complementario de [`project_resume.md`](../project_resume.md). Describe la aplicación **Single-Page Application (SPA)** en TypeScript estricto (`strict: true`, `0 any`), renderizado declarativo con **48 módulos de lógica pura (`src/lib/`)** (más `src/lib/generated/normasCatalogBundle.ts`) y **60 vistas modulares (`src/views/`)**, layout panorámico *widescreen* (`max-w-[1720px]`), **menú Bloque 1 definitivo con submenú anidado (`Designación > { Tipo, Fecha, Sitio, Temporal }`)**, **Wizard guiado `+ Auditoría` en 3 Fases**, **Detail Views Certificate-Based con Breadcrumb In-Card persistente**, **Cajas Agrupadoras en `Vínculo`**, **Calendario en 3 Modos**, **`Proceso` (`Seleccionar todos`) + `Turno`**, **`Resultado` (`REAL` discretas, NCs por cláusula, `⚙ Plazos NC +15d/+45d`)**, **`Revisión` QA**, **`Resumen`** paralelo en 1 clic, motor `LTREE` + **Coverage HUD**, lector/editor bilingüe ES/EN, Vite `6.4.6` (`manualChunks`, **153 módulos**) y Tailwind CSS v4.

---

## 1. Orquestación de Estado, Rutas y Seguridad en Cliente (`src/main.ts`)

### 1.1 Contenedor Central de Estado (`AppState`)
`src/main.ts` (`39,977` líneas) centraliza el estado tipado en `AppState`, preserva el foco, el scroll y la posición del cursor (`runWithPlannerPreservedViewport`) durante el re-renderizado, y coordina la hidratación en vivo con Supabase:
- **Sesión, Identidad y Perfil:** `booting`, `user`, `profile`, `authorizedClientOrgIds`, `clientAccessRows`, `profileForm`, `activeRoute`, `activeSubSection`, `openMenu`, `openNestedMenu`.
- **Navegación Contextual y Selección Persistente por Certificado:** `breadcrumbs` (`BreadcrumbSegment[]`, **31 tipos de entidad**), estado del cajón forense `auditLogModal` y mapa **`selectedAuditIdByCertId`** gestionado vía `certificateAuditSelector.ts` (recuerda la auditoría seleccionada al saltar entre `Designación`, `Tiempo`, `Auditor`, `Proceso`, `Turno`, `Resultado`, `Revisión` y `Resumen`).
- **Wizard `+ Auditoría` (`auditWizard`):** Estado en 3 fases (`auditWizardDomain.ts` / `auditWizardModal.ts`) sincronizado con Conglomerado/Organización, Vínculo y Tipo por certificado.
- **Gobernanza de Archivo Seguro y Restauración (`archiveGovernance`):** `showArchived` (exclusivo `ADMIN`), `modal` (`ArchiveModalState`), `toast` (`#archiveGovernanceToast` con autocierre), `restoringId`, `archivedRecordsByTable`, `archivedSnapshotsByKey`, `archivedCatalogIds`.
- **Autenticación, Aprobaciones y Diagnóstico:** `auth`, `approvals`, `dbCheck` (5 comprobaciones en vivo).
- **Preferencias de Tablas (`tableColumnWidths`):** Anchos porcentuales ajustables (`colgroup` sumando `100%`) para Multi View, Calendario Tabla, Mapa de Cobertura, Revisión QA, `Resumen` y pestañas hijas.
- **Datos Hidratados y Dominios Operativos (`domainData` + estados de vista):**
  - **Bloque 1 — `Auditoría`:** `calendarioView` (`Año`/`Trimestre Q1–Q4`/`Mes`/`Timeline`, `Cards`, `Table`, modal `configuracion_alerta_auditoria`), `vinculoDomain` (Multi View por Conglomerado + Cajas Agrupadoras + `Bandeja LIBRE`), `designacionTipoDomain`, **`designacionFechaDomain`** (`PREPROGRAMADA_MES` | `PROGRAMADA_EXACTA` multi-fecha al lote), `designacionSitioDomain`, `designacionTemporalDomain`, `tiempoDomain`, **`asignacionDomain`** (`Auditor`: regular + temporal + `SUM == días`), **`programaCertificadoDomain`** (split **`Proceso`** y **`Turno`**), `resultadoDomain` (`REAL` discretas, NCs por cláusula sin `id_proceso`, modal `⚙ Plazos NC +15d/+45d`, cierre `'Cerrada'`), `revisionDomain` (cola QA Post-Cierre) y **`resumenDomain`** (`estatus_auditoria` paralelo + salto en 1 clic).
  - **Bloque 2 — `Certificación`:** `conglomeradoDomain` (`Organizaciones` con incorporar `SOLO` / `fn_desvincular_organizacion_conglomerado` y `Auditorías` ordenado por fecha más reciente primero), `organizacionDomain`, `clientAccessDomain`, `certificadoDomain` (`Coverage HUD` + `Mapa de Cobertura`), `sitioDomain` (`procesos_por_sitio`), `procesoDomain`, `turnoDomain`, `noAplicableDomain`, `fechaDomain`, `contactoDomain`, `telefonoDomain`, `emailDomain`, `auditorDomain`, `competenciaAuditorDomain`.
  - **Bloque 3 — `Extra` (`extraDomain`):** `Norma` + `Requisito` (lector completo + editor bilingüe ES/EN), `Sector IAF` + `Sub-Sector IAF`, `Organismo de Acreditación`, `Acreditación`, `Estatus`, `Tipo` y `Metodología`.

### 1.2 Enrutamiento Hash SPA y Guardias RBAC
- **Rutas soportadas (`ActiveRoute`):** `'dashboard'`, `'profile'`, `'approvals'`, `'database'`, `'auditorias'`, `'certificacion'`, `'extra'`.
- **Sincronización Hash (`#/{route}` o `#/{route}/{subview}`):** Escucha `hashchange` y `popstate`, incluyendo el menú Bloque 1 en su orden final:
  `#/auditorias/calendar`, `#/auditorias/vinculo`, `#/auditorias/designacion/tipo`, `#/auditorias/designacion/fecha`, `#/auditorias/designacion/sitio`, `#/auditorias/designacion/temporal`, `#/auditorias/tiempo`, `#/auditorias/auditor`, `#/auditorias/proceso`, `#/auditorias/turno`, `#/auditorias/resultado`, `#/auditorias/revision` y `#/auditorias/resumen`.
- **Guardia `canAccessRoute(profile, route)` y `isApprovedStaffProfile(profile)`:**
  - `'dashboard'` y `'profile'` (`Mi Perfil`) son accesibles para cualquier autenticado (`PENDING`/`REJECTED` con escritura bloqueada).
  - `'database'` exclusivo `ADMIN` aprobado; `'approvals'` para `ADMIN` (edición) y `WORKER` (solo lectura).
  - **`getVisibleDomainMenus(profile)`:**
    - `Auditoría`: `ADMIN`, `WORKER`, `AUDITOR`, `CLIENT` en el orden exacto: `Calendario`, `Vínculo`, separador, `Designación > { Tipo, Fecha, Sitio, Temporal }`, `Tiempo`, `Auditor`, `Proceso`, `Turno`, `Resultado`, `Revisión`, `Resumen`.
    - `Certificación` (`Conglomerado` #1, `Organización`, `Certificado`, `Auditor`): `ADMIN`, `WORKER`, `CLIENT` (**completamente oculto y bloqueado para `AUDITOR`**; acceder a `#/certificacion/conglomerados` redirige de forma segura al fallback de inicio sin exponer datos).
    - `Extra`: todo usuario `APPROVED` (`'add' | 'edit'` exclusivo `ADMIN`/`WORKER`).

### 1.3 Hidratación Paginada, Anti-XSS y Zero-UUID
- **Hidratación Paginada (`paginatedHydration.ts`):** Carga las **2,188 cláusulas** y **2,684 traducciones ES/EN** mediante cursor `.range(from, to)` superando el límite de 1,000 filas de PostgREST, con respaldo offline `normasCatalogBundle.ts`.
- **Anti-XSS y Zero-UUID:** Escape obligatorio vía `escapeHtml()`, sanitización HTML estricta `sanitizeClauseHtml()`, atajos `/` y `Escape`, y prohibición absoluta de UUIDs expuestos en texto visible, atributos o inputs (`zeroUuid.ts`).

---

## 2. Patrones UI/UX Estandarizados

### 2.1 Cabecera Global con Menú Anidado, `+ Auditoría` y Breadcrumb In-Card
- **Contenedor Panorámico (`layout.ts`):** `max-w-[1720px]` con padding responsivo; `Auth` en `max-w-md`.
- **Cabecera (`header.ts`):** Enlaces con `data-nav-reset="true"`, 3 bloques (`Auditoría` con submenú lateral **`Designación > { Tipo, Fecha, Sitio, Temporal }`** que se abre en `:hover` y se auto-colapsa al abandonar Bloque 1; `Certificación` con **`Conglomerado`** #1; y `Extra`).
- **Wizard `+ Auditoría` en 3 Fases (`auditWizardModal.ts` + `auditWizardDomain.ts`):** Reemplaza botones heredados de alta en Bloque 1; guía **Fase 1 (Conglomerado/Organización bidireccional)** → **Fase 2 (Vínculo/Caja auto o manual, con bloqueador si vacío)** → **Fase 3 (Tipo de auditoría y fechas por certificado)** y redirige automáticamente a **`Designación → Tipo`**.
- **Breadcrumb In-Card + Certificate-Based Shell (`auditSectionShell.ts` + `auditCardBreadcrumb.ts`):**
  - Ausente en Multi Views, `Calendario` y `Vínculo`.
  - Presente dentro de la tarjeta principal en todos los **Detail Views (`1..7` + `Resumen`)**, mostrando los pasos `1. Designación {Tipo, Fecha, Sitio, Temporal}`, `2. Tiempo`, `3. Auditor`, `4. Proceso`, `5. Turno`, `6. Resultado`, `7. Revisión` y `Resumen`, junto al selector persistente de auditoría por certificado.
- **Dashboard (`dashboardView.ts`) y `Mi Perfil` (`profileView.ts`):** Saludo nominal + 5 métricas RBAC; auto-edición segura de `nombre` y contraseña.

### 2.2 Motor de Breadcrumbs Globales (`breadcrumb.ts` + `breadcrumbView.ts`)
- Barra de una línea (`flex-nowrap overflow-hidden whitespace-nowrap`), truncamiento a **24 caracteres**, colapso intermedio con `…` (`MAX_VISIBLE_BREADCRUMBS = 4`) y **31 tipos de entidad**, con prevención de bucles por clave compuesta.

### 2.3 Plantilla Universal Multi View Clean List (`universalTemplate.ts`)
- Barra unificada: botón **`☰ Filtros`**, buscador único `<input type="text">` con un solo `✕`, totalizador **`Mostrando X de Y`**, botón CTA **`+`** / **`+ Auditoría`** (Staff), conmutador **`[⊞ Tarjetas | ☰ Tabla]`** (y `[📅 Calendario | ⊞ Tarjetas | ☰ Tabla]` en `Calendario`) y checkbox **`Mostrar Archivados`** (`ADMIN`).
- Tablas `table-fixed` con `<colgroup>` sumando `100%`, redimensionamiento interactivo y **cero botones dentro de `<tbody>`**.

### 2.4 Flujo Operativo del Bloque 1 (`Calendario` → `Vínculo` → `1..7` → `Resumen`)
1. **`Calendario` (`calendarioView.ts` + `pipelineEngine.ts` + `auditAlertsEngine.ts`):** Vista por defecto de Bloque 1 (`Año` / `Trimestre Q1–Q4` / `Mes` / `Timeline`, `Tarjetas`, `Tabla` `table-fixed`), drawer de alertas y modal **`⚙ Configurar Alertas`** (estrictamente basado en fechas de auditoría, **sin contaminación por plazos NC**).
2. **`Vínculo` (`vinculoView.ts` + `vinculoDomain.ts`):** Multi View por Conglomerado (`33/24/23/20 = 100%`) + Detail View de **Cajas Agrupadoras (Many-to-One)** con `Bandeja LIBRE`, creación de cajas, traslado de certificados con validación ISO y enlace directo a `Resumen` (con redacción de `notas` Nivel 2 para `CLIENT`).
3. **`Designación > { Tipo, Fecha, Sitio, Temporal }`:**
   - `Tipo` (`designacionTipoView.ts`): Multi View por certificado con filtros temporales y edición sincronizada al lote.
   - `Fecha` (`designacionFechaView.ts`): Multi View por certificado y gestión 1:N de fechas `PREPROGRAMADA_MES` y `PROGRAMADA_EXACTA` sincronizadas al lote vinculado.
   - `Sitio` (`designacionSitioView.ts`): Pre-selección `Sitio 0 HQ`, **Tira de Ciclo Multi-Anual (`◀` / `▶`)** sin `<select>` y gestión por auditoría.
   - `Temporal` (`designacionTemporalView.ts`): Switch `tiene_sitio_temporal` sincronizado al lote y atribución multicertificado de sitios temporales.
4. **`Tiempo` (`tiempoView.ts`) & `Auditor` (`asignacionView.ts`):** Steppers `0.25d` y asignaciones de equipo sobre sedes regulares **y `Sitio Temporal`** (cuando el toggle está ON), validando cuadre exacto **`SUM == días`**.
5. **`Proceso` (`programaProcesosView.ts`) & `Turno` (`programaTurnosView.ts`):**
   - `Proceso`: Matriz restringida a `procesos_por_sitio`, botones **`Seleccionar todos`** por sitio y **`Seleccionar todos los Medulares`**, alerta `⚠️ Nunca auditado` y drawer histórico `"Ver Programa Anterior / Futuro"`.
   - `Turno`: Matriz anti-fatiga por sitio y propagación homónima.
6. **`Resultado` (`resultadoView.ts` + `resultadoDomain.ts`):** Registro de fechas **`REAL` discretas** por auditoría, **No Conformidades por cláusula normativa (`id_proceso IS NULL`)** con fechas `Plan` (`+15d`) y `Cierre` (`+45d`) reales, modal **`⚙ Plazos NC (+15d / +45d)`** exclusivo Staff y cierre formal `'Cerrada'`.
7. **`Revisión` (`revisionView.ts` + `revisionDomain.ts`):** Cola QA Post-Cierre (`Pendientes` / `Revisadas`), `documentacion_completa`, `fecha_revision`, `resumen_revision` y aprobación (`revisado = TRUE`).
8. **`Resumen` (`resumenView.ts` + `resumenDomain.ts`):** Tabla de certificados (`100% colgroup`), vista consolidada por certificado/auditoría con cálculo paralelo **`estatus_auditoria`** y salto directo en 1 clic a cualquiera de las secciones `1..7` conservando `(certId, auditId)`.

### 2.5 Infraestructura `Procesos del Sitio`, `Coverage HUD` y Fichas de `Certificación` / `Extra`
- **Conglomerado (`conglomeradoView.ts`):** Tab `Organizaciones` (incorporar `SOLO`, desvincular `Separar del grupo` vía `fn_desvincular_organizacion_conglomerado`) y Tab `Auditorías` (más recientes primero, `estatus_auditoria`, clic abre `Resumen`).
- **Certificado (`certificadoView.ts`) y Sitio (`sitioView.ts`):** Pestaña **`Procesos del Sitio`** (`procesos_por_sitio`), **Coverage HUD + Mapa de Cobertura** (`coverageEngine.ts`), selector batch `LTREE` (`procesoView.ts`) y Smart Mutation (`noAplicableView.ts`).
- **Lector y Editor Bilingüe de Cláusulas (`requisitoView.ts` + `richTextEditor.ts` + `normaFullReader.ts`):** Lector Completo (`es`/`en`/`bilingual`) y editor `Visual`/`HTML`/`Vista Previa` con autocompletado `{`.

---

## 3. Inventario de Módulos de Lógica Pura (`src/lib/` — 48 módulos + `generated/`)

| Módulo | Responsabilidades Principales |
| :--- | :--- |
| `supabase.ts`, `html.ts`, `layout.ts`, `rbac.ts` | Cliente `@supabase/supabase-js`, escape XSS, contenedores `max-w-[1720px]` y utilidades de rol Staff/Admin. |
| `healthCheck.ts`, `accessControl.ts`, `archiveGovernance.ts` | Rutas, menú Bloque 1 con `Designación`, aislamiento RBAC (`AUDITOR` bloqueado en Bloque 2, `CLIENT` Nivel 2), salud DB y gobierno Soft-Delete (`43` tablas). |
| `searchControls.ts`, `breadcrumb.ts`, `universalTemplate.ts`, `auditLog.ts`, `zeroUuid.ts` | Normalización Unicode, pila de breadcrumbs (**31 tipos**), Multi View `table-fixed`, resolución Zero-UUID en `audit_log` y auditoría estática `assertZeroUuidExposure`. |
| **`conglomeradoDomain.ts`**, **`vinculoDomain.ts`** | Buckets `grupo_empresarial`, `Auditorías` del conglomerado, **Cajas Agrupadoras (`LIBRE`/`INDIVIDUAL`/`VINCULADO`)**, `Mixta` y aislamiento Nivel 2 `CLIENT` (incl. redacción de `notas`). |
| `activeCertificates.ts`, `multisiteSampling.ts`, `coverageEngine.ts`, `certificadoSubEntities.ts`, `noAplicableDomain.ts`, `competencyMatrix.ts` | Conteo estricto de certificados activos, **Sitio 0**, cascada IAF, motor `LTREE` + Smart Mutation, sub-entidades de `certificado`, exclusiones ISO 4.3 y competencias M:N. |
| **`auditWizardDomain.ts`**, **`certificateAuditSelector.ts`** *(Nuevos)* | Estado/validaciones de las **3 Fases** de `+ Auditoría` y resolución/persistencia de auditoría seleccionada por certificado. |
| `auditDomain.ts`, **`designacionTipoDomain.ts`**, **`designacionFechaDomain.ts`**, **`designacionSitioDomain.ts`**, **`designacionTemporalDomain.ts`** | Sub-vistas de `Designación`: cola por tipo, fechas multi-entrada (`PREPROGRAMADA_MES`/`PROGRAMADA_EXACTA`), sedes (`Sitio 0`, Matriz de Ciclos) y temporales multicertificado. |
| **`tiempoDomain.ts`**, **`asignacionDomain.ts`**, **`programaCertificadoDomain.ts`** | Steppers `0.25d` regular + temporal (`Tiempo`), balanceo `SUM == días` regular + `Sitio Temporal` (`Auditor`) y selección por certificado `Proceso` + `Turno`. |
| `pipelineEngine.ts`, `auditPlanningEngine.ts`, `auditAlertsEngine.ts`, `auditPlanningPersistence.ts`, `auditExecution.ts` | Etapas del pipeline, reglas `INDIVIDUAL`/`NIVEL_1`/`NIVEL_2`, calendario, alertas (`DEFAULT`), persistencia Zero-UUID y recomendaciones ISO 17021-1. |
| **`resultadoDomain.ts`**, **`revisionDomain.ts`**, **`resumenDomain.ts`** | Fechas `REAL` discretas, NCs por cláusula sin `id_proceso` (`+15d`/`+45d`), cola QA (`Revisión`) y cálculo paralelo de `estatus_auditoria` con salto 1-clic (`Resumen`). |
| `acreditacionDomain.ts`, `sitioDomain.ts`, `procesoDomain.ts`, `turnoDomain.ts`, `extraDomain.ts` | Organismos/acreditaciones, sedes (`Sitio 0`) + `procesos_por_sitio`, selector batch `LTREE`, turnos y catálogos `Extra`. |
| `clauseRenderer.ts`, `normaFullReader.ts`, `richTextEditor.ts`, `paginatedHydration.ts`, `requisitoCsvImporter.ts`, `generated/normasCatalogBundle.ts` | Expansión `{clause_...}`, lector DFS, editor ES/EN, paginación `.range()` >1,000 filas, importador CSV y respaldo embebido (8 normas, 2,188 cláusulas, 2,684 traducciones). |

---

## 4. Inventario de Vistas Modulares (`src/views/` — 60 módulos)

| Grupo Funcional | Vistas (`src/views/*.ts`) | Responsabilidad Principal |
| :--- | :--- | :--- |
| **Shell, Plantillas, Wizard y Gobernanza (13)** | `authView.ts`, `header.ts`, `breadcrumbView.ts`, `dashboardView.ts`, `profileView.ts`, `searchControlsView.ts`, `universalTemplate.ts`, `detailTemplate.ts`, `auditLogModal.ts`, `archiveModalView.ts`, **`auditCardBreadcrumb.ts`**, **`auditSectionShell.ts`**, **`auditWizardModal.ts`** | Login/Quick Login + Reset DB; cabecera 3 bloques con menú Bloque 1 definitivo; breadcrumbs (**31 tipos**); Dashboard 5 métricas; `Mi Perfil`; plantillas Multi/Detail View (`table-fixed`); **Breadcrumb In-Card + Shell Certificate-Based**; **Wizard `+ Auditoría` 3 Fases**; bitácora y modal de archivo seguro. |
| **Consola Administrativa (2)** | `approvalsView.ts`, `databaseStatusView.ts` | Gestión de roles/estados (`ADMIN`, lectura `WORKER`) y diagnóstico Supabase (exclusivo `ADMIN`). |
| **Dominio Auditoría — Bloque 1 Completo (19)** | `auditoriasView.ts`, `calendarioView.ts`, `vinculoView.ts`, `designacionTipoView.ts`, **`designacionFechaView.ts`**, `designacionSitioView.ts`, `designacionTemporalView.ts`, `tiempoView.ts`, `asignacionView.ts`, `programaView.ts`, `programaProcesosView.ts`, `programaTurnosView.ts`, `resultadoView.ts`, `revisionView.ts`, **`resumenView.ts`**, **`auditPipelineSummaryViews.ts`**, `programacionView.ts`, `auditPlannerView.ts`, `sitioAuditoriaView.ts` | `Calendario` (3 Modos + Alertas); `Vínculo` (Cajas Many-to-One); `Designación > { Tipo, Fecha, Sitio, Temporal }`; `Tiempo`; `Auditor` (`asignacionView`); `Proceso` (`Seleccionar todos`); `Turno` (anti-fatiga); `Resultado` (`REAL` discretas, NC por cláusula, `⚙ Plazos NC +15d/+45d`, Cierre); `Revisión` QA; `Resumen` paralelo + salto 1-clic. |
| **Dominio Certificación y Sub-entidades (15)** | `certificacionView.ts`, `conglomeradoView.ts`, `organizacionView.ts`, `clientAccessView.ts`, `certificadoView.ts`, `auditorView.ts`, `competenciaAuditorView.ts`, `sitioView.ts`, `procesoView.ts`, `turnoView.ts`, `noAplicableView.ts`, `fechaView.ts`, `contactoView.ts`, `telefonoView.ts`, `emailView.ts` | Enrutador; **Conglomerado** (#1, `Organizaciones` + `Auditorías`); **Organización** + **Acceso Cliente**; **Certificado** (6 cols + 5 FKs + **Coverage HUD / Mapa** + 7 pestañas); **Auditor** + **Competencias M:N**; **Sitio** (`Sitio 0` + **`Procesos del Sitio`**); **Proceso**; **Turno**; **No Aplicables** (Smart Mutation); **Fecha**, **Contacto**, **Teléfono** y **Correo**. |
| **Dominio Extra — Catálogos, Lector y Editor Normativo (11)** | `extraView.ts`, `normaView.ts`, `requisitoView.ts`, `richTextEditor.ts`, `sectorIafView.ts`, `subsectorIafView.ts`, `organismoAcreditacionView.ts`, `acreditacionView.ts`, `estatusView.ts`, `tipoAuditoriaView.ts`, `metodologiaAuditoriaView.ts` | Enrutador; **Norma** (`Ver Norma`) + **Requisito LTREE** + **Editor Bilingüe ES/EN** (autocompletado `{`); **Sector IAF** + **Sub-Sector IAF**; **Organismo** + **Acreditación**; **Estatus**, **Tipo** y **Metodología**. |
