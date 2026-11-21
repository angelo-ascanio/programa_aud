# Pruebas, Operación y Despliegue (`programa_aud`)

> Documento técnico complementario de [`project_resume.md`](../project_resume.md). Detalla la suite de verificación automatizada (**68 archivos / 556 pruebas unitarias en 40 suites de `node:test`**), verificación estricta de tipos (`strict: true`, `0 any`), compilación optimizada con Vite `6.4.6` (`manualChunks`, **153 módulos**), pipeline de generación del catálogo normativo CSV, auditoría E2E en navegador Chromium real (`390×844` móvil y `1440×900` escritorio) sobre todo el **Bloque 1 definitivo + `Conglomerado`** y los **4 roles (`ADMIN`, `WORKER`, `AUDITOR`, `CLIENT`)**, y operación en producción.

---

## 1. Suite de Pruebas Unitarias (`node:test` + `tsx`)

Todas las reglas de negocio ISO/IEC 17021-1 e ISO 19011, esquemas SQL de retención lógica (**50 tablas**, **43 soft-delete**, **226 triggers**, **114 índices en `03` / 165 vivos**, **149 políticas RLS**), orden de menú Bloque 1, Breadcrumb In-Card, Wizard `+ Auditoría`, Cajas de `Vínculo`, sub-secciones `Designación` (incl. `Fecha`), `Tiempo`, `Auditor`, `Proceso`, `Turno`, `Resultado` (`REAL` discretas, NCs por cláusula sin `id_proceso`, `+15d/+45d`), `Revisión`, `Resumen` paralelo, motor `LTREE` + Smart Mutation, políticas RBAC (incluyendo aislamiento Nivel 2 `CLIENT` y redacción de `vinculo.notas`), sanitización Zero-UUID, navegación contextual (**31 tipos**), sub-entidades de certificado, plantillas Multi View Clean List (`table-fixed`), fichas unificadas `'read' | 'add' | 'edit'`, lector/editor bilingüe ES/EN y paginación PostgREST se verifican mediante **68 archivos de pruebas (`src/lib/*.test.ts`)** ejecutados con `node:test` vía `tsx` (**556 pruebas distribuidas en 40 suites, 100% aprobadas, 0 fallos, 0 omitidas**):

### 1.1 Suites del Bloque 1 Consolidado (`Steps 1.1` → `9.1`) y Shell por Certificado

| Archivo de Pruebas | Módulo(s) Evaluado(s) | Cobertura Principal |
| :--- | :--- | :--- |
| **`src/lib/step101SqlSchema.test.ts`**, **`src/lib/phase11SqlMigration.test.ts`**, **`src/lib/phase12RlsHardening.test.ts`** | Esquema SQL (`00`–`07`) | Validación de `fn_desvincular_organizacion_conglomerado`, plazos NC `+15d/+45d`, `id_proceso NULL` en `hallazgo`, `43` tablas soft-delete, `REVOKE DELETE` (`45` tablas), `archive_record` (`43` tablas) y `149` políticas RLS. |
| **`src/lib/auditWizardDomain.test.ts`** | `auditWizardDomain.ts`, `auditWizardModal.ts` | Asistente guiado en 3 Fases (`Conglomerado/Org` → `Vínculo` auto/manual/bloqueador → `Tipo` por certificado) y redirección a `Designación → Tipo`. |
| **`src/lib/certificateAuditSelector.test.ts`** | `certificateAuditSelector.ts`, `auditSectionShell.ts`, `auditCardBreadcrumb.ts` | Breadcrumb In-Card (`1..7` + `Resumen`), selector persistente de auditoría por certificado y exclusión en Multi Views/`Calendario`/`Vínculo`. |
| **`src/lib/conglomeradoDomain.test.ts`** | `conglomeradoDomain.ts`, `conglomeradoView.ts` | Buckets `grupo_empresarial`, organizaciones `SOLO`, desvinculación segura, pestaña `Auditorías` más recientes primero con `estatus_auditoria` y aislamiento RBAC. |
| **`src/lib/vinculoDomain.test.ts`** | `vinculoDomain.ts`, `vinculoView.ts` | Multi View por Conglomerado, Cajas Agrupadoras (`LIBRE`/`INDIVIDUAL`/`VINCULADO`), `Mixta`, bloqueo de traslado con auditoría activa, redacción de `notas` y aislamiento Nivel 2 `CLIENT`. |
| **`src/lib/designacionTipoDomain.test.ts`**, **`src/lib/designacionTipoView.test.ts`**, **`src/lib/designacionFechaDomain.test.ts`** | `designacionTipo*`, `designacionFecha*` | Colas temporales por certificado, reprogramaciones 1:N (`PREPROGRAMADA_MES` / `PROGRAMADA_EXACTA`) sincronizadas al lote y `table-fixed` (`0` botones en `<tbody>`). |
| **`src/lib/designacionSitioDomain.test.ts`**, **`src/lib/designacionSitioView.test.ts`** | `designacionSitioDomain.ts`, `designacionSitioView.ts` | `Sitio 0 (HQ)` pre-seleccionado, **Tira de Ciclo Multi-Anual (`◀` / `▶`)** sin `<select>` y herencia/alternancia de `tiene_sitio_temporal`. |
| **`src/lib/designacionTemporalDomain.test.ts`** | `designacionTemporalDomain.ts`, `designacionTemporalView.ts` | Sitios temporales multicertificado (`auditoria_sitio_temporal*`), switch sincronizado al lote y filtro `"Sin auditores asignados"`. |
| **`src/lib/tiempoDomain.test.ts`**, **`src/lib/tiempoView.test.ts`** | `tiempoDomain.ts`, `tiempoView.ts` | Distribución `0.25d` regular + temporal, resumen combinado y transición `Incompletos` / `Completos`. |
| **`src/lib/asignacionDomain.test.ts`**, **`src/lib/asignacionView.test.ts`** | `asignacionDomain.ts`, `asignacionView.ts` | Sección `Auditor`: asignación en sedes regulares + `Sitio Temporal` (cuando ON), cuadre exacto `SUM == días`, progreso `100% Completo ✓` y alertas de rotación. |
| **`src/lib/programaCertificadoDomain.test.ts`**, **`src/lib/programaProcesosView.test.ts`** | `programaCertificadoDomain.ts`, `programaProcesosView.ts`, `programaTurnosView.ts` | Split **`Proceso`** (`Seleccionar todos` por sitio, `Seleccionar todos los Medulares`, `procesos_por_sitio`, `⚠️ Nunca auditado`, drawer histórico) y **`Turno`** (matriz anti-fatiga y propagación). |
| **`src/lib/calendarioDomain.test.ts`** | `pipelineEngine.ts`, `calendarioView.ts` | **3 Modos (`Calendario | Tarjetas | Tabla`)**, contadores `Año` / `Q1–Q4` / `Mes` / `Timeline`, modal `⚙ Configurar Alertas` y no contaminación por fechas límite NC. |
| **`src/lib/resultadoDomain.test.ts`** | `resultadoDomain.ts`, `resultadoView.ts` | Fechas **`REAL` discretas**, NCs por cláusula sin `id_proceso`, cálculo **`+15d/+45d`**, modal **`⚙ Plazos NC`**, capacidad concurrente y cierre `'Cerrada'`. |
| **`src/lib/revisionDomain.test.ts`** | `revisionDomain.ts`, `revisionView.ts` | Cola QA Post-Cierre (`Pendientes de Revisión` / `Revisadas`), bloqueo sin `documentacion_completa`, verificación RLS/triggers SQL y paridad de semillas `06_datos_prueba.sql`. |
| **`src/lib/resumenDomain.test.ts`** | `resumenDomain.ts`, `resumenView.ts` | Tabla de certificados `table-fixed`, cálculo paralelo `estatus_auditoria`, síntesis completa y salto en 1 clic a secciones `1..7` conservando `(certId, auditId)`. |

### 1.2 Suites Transversales: Cobertura Normativa, Catálogo, Seguridad y Gobernanza

| Archivo de Pruebas | Módulo(s) Evaluado(s) | Cobertura Principal |
| :--- | :--- | :--- |
| `src/lib/auditPlanningEngine.test.ts`, `src/lib/auditPersistence.test.ts`, `src/lib/auditMultiViews.test.ts`, `src/lib/auditDetailViews.test.ts`, `src/lib/auditPlannerUi.test.ts`, `src/lib/auditDomain.test.ts`, `src/lib/auditExecution.test.ts`, `src/lib/auditPhase5Views.test.ts` | Motor de programación, persistencia, ejecución y CAPA | Reglas `INDIVIDUAL`/`NIVEL_1`/`NIVEL_2` (7 naturalezas), validaciones de fechas 1:N, cálculo Dual-Bucket `0.25d`, guardado Zero-UUID, flujo CAPA y Cláusulas 9.5/9.6 ISO 17021-1. |
| `src/lib/auditLog.test.ts`, `src/lib/accessControl.test.ts`, `src/lib/profileGovernance.test.ts`, `src/lib/archiveGovernance.test.ts` | Auditoría forense, RBAC y retención | Resolución legible de actores sin UUIDs, bloqueo `AUDITOR` en Bloque 2, aislamiento `CLIENT` Nivel 2, auto-edición segura `Mi Perfil`, protección `Sitio 0` y **0 `.delete()`** sobre las **43 tablas** protegidas. |
| `src/lib/activeCertificates.test.ts`, `src/lib/certificadoSubEntities.test.ts`, `src/lib/multisiteSampling.test.ts`, `src/lib/detailViewsPhase42.test.ts` | Certificados y sub-entidades | Conteo estricto activos, validación RIF/NIF, `client_organization_access`, sub-entidades (`fecha`, `contacto`, `telefono`, `email`), `alcance` y sub-sectores IAF. |
| `src/lib/coverageEngine.test.ts`, `src/lib/step31CoverageHud.test.ts`, `src/lib/step32BatchAndOverrides.test.ts`, `src/lib/noAplicableDomain.test.ts` | Motor `LTREE`, Coverage HUD y Smart Mutation | Espejo isomórfico 1:1 del motor SQL `LTREE`, Coverage HUD, Smart Mutation (`C_eff(K)`), batch `LTREE` y overrides `MANUAL`. |
| `src/lib/clauseRenderer.test.ts`, `src/lib/normaFullReader.test.ts`, `src/lib/richTextEditor.test.ts`, `src/lib/paginatedHydration.test.ts`, `src/lib/requisitoCsvImporter.test.ts` | Motor normativo y catálogo CSV | Sanitización HTML, expansión `{clause_...}`, lector DFS completo, editor bilingüe ES/EN, paginación `.range()` (`2,188` cláusulas / `2,684` traducciones) y `8` normas canónicas. |
| `src/lib/breadcrumb.test.ts`, `src/lib/competencyMatrix.test.ts`, `src/lib/extraDomain.test.ts`, `src/lib/acreditacionDomain.test.ts`, `src/lib/sitioDomain.test.ts`, `src/lib/procesoDomain.test.ts`, `src/lib/turnoDomain.test.ts` | Navegación y módulos `Extra`/`Certificación` | **31 tipos de breadcrumb**, competencias técnicas, `procesos_por_sitio` y cumplimiento Zero-UUID. |
| `src/lib/multiViewFacets.test.ts`, `src/lib/searchControls.test.ts`, `src/lib/universalTemplate.test.ts`, `src/lib/widescreenLayout.test.ts`, `src/lib/healthCheck.test.ts`, `src/lib/drillDown.test.ts`, `src/lib/zeroUuid.test.ts`, `src/lib/phase21NavigationShell.test.ts`, `src/lib/phase22DashboardProfile.test.ts`, `src/lib/phase412MultiView.test.ts`, `src/lib/phase421DetailTemplate.test.ts`, `src/lib/step1Primitives.test.ts`, `src/lib/phase62UiIntegrity.test.ts` | Shell, plantillas e integridad UI | Orden exacto Bloque 1, flyout `Designación`, Dashboard minimalista, Multi View (`type="text"`), facetas $S_{-k}$, Detail Template 3 Zonas, `max-w-[1720px]`, `table-fixed` (`0` botones en `<tbody>`) y escaneo **Zero-UUID**. |

### Comandos de Verificación

```bash
# Ejecutar los 68 archivos de prueba (556 pruebas en 40 suites de node:test)
npm test
# Equivalente directo:
npx tsx --test src/lib/*.test.ts

# Verificación estricta de tipos TypeScript (tsc --noEmit, strict: true, 0 any)
npm run lint

# Compilación optimizada de producción con Vite 6.4.6 (153 módulos, genera dist/)
npm run build
```

---

## 2. Compilación Vite (`manualChunks`) y Verificación en Navegador Real

### 2.1 Estrategia de Segmentación de Bundles (`vite.config.ts`)
`vite.config.ts` divide los **153 módulos** de producción mediante `manualChunks`:
- **`views-audit` (`136.21 kB` / `28.51 kB` gzip):** Vistas de auditoría, programación, calendario, resultado y bitácora (`auditoriasView`, `programacionView`, `calendarioView`, `resultadoView`, `auditLogModal`).
- **`supabase` (`230.49 kB` / `60.05 kB` gzip):** Cliente `@supabase/supabase-js`.
- **`views-domains` (`245.50 kB` / `48.90 kB` gzip):** Vistas de Extra y Certificación (`extraView`, `normaView`, `sectorIafView`, `estatusView`, `tipoAuditoriaView`, `metodologiaAuditoriaView`, `certificacionView`, `certificadoView`, `organizacionView`, `auditorView`).
- **`views-shell` (`726.71 kB` / `134.77 kB` gzip):** Shell global, autenticación, header, breadcrumbs, Breadcrumb In-Card, Wizard `+ Auditoría`, dashboard, `Mi Perfil`, vistas consolidadas del Bloque 1 (`conglomeradoView`, `vinculoView`, `designacion*View`, `tiempoView`, `asignacionView`, `programa*View`, `revisionView`, `resumenView`), `auditPlannerView`, `sitioAuditoriaView`, `archiveModalView`, consolas administrativas y sub-entidades.
- **`index` JS/CSS (`794.20 kB` JS / `152.30 kB` gzip + `98.56 kB` CSS / `15.95 kB` gzip + `dist/index.html` `1.51 kB`):** Orquestador principal (`src/main.ts`) y hojas Tailwind CSS v4.
- **`domain-lib` (`1,676.17 kB` / `428.73 kB` gzip):** Los **48 módulos** de `src/lib/` junto con `src/lib/generated/normasCatalogBundle.ts` (8 normas, 2,188 cláusulas `LTREE`, 2,684 traducciones ES/EN).

### 2.2 Verificación End-to-End en Chromium (`playwright-cli`) sobre los 4 Roles y Ambos Viewports
Validación ejecutada en Chromium headless sobre `http://localhost:3000` tras reinicio limpio de BD (`POST /api/reset-db` `00`→`07` en `~4.0–4.7s` e idempotencia validada) en **`1440×900` (escritorio)** y **`390×844` (móvil)** con **0 errores de consola de aplicación / HTTP**, **0 botones en `<tbody>`**, **`table-fixed` + `<colgroup>` = `100%`** en las 11 Multi Views del Bloque 1, **0 UUIDs visibles** y **0 desbordamiento horizontal** (`scrollWidth <= innerWidth + 1`):
- **`ADMIN` (`1440×900` y `390×844`):** Orden exacto del menú Bloque 1 (`Calendario`, `Vínculo`, separador, `Designación > { Tipo, Fecha, Sitio, Temporal }`, `Tiempo`, `Auditor`, `Proceso`, `Turno`, `Resultado`, `Revisión`, `Resumen`) con apertura/cierre de flyout; **Wizard `+ Auditoría` 3 Fases** con redirección a `Designación → Tipo`; Breadcrumb In-Card persistente en Detail Views `1..7` + `Resumen` (ausente en Multi Views/`Calendario`/`Vínculo`); `Conglomerado` (`Organizaciones` con `SOLO` / `Separar del grupo`, `Auditorías` con salto a `Resumen`); `Vínculo` (Cajas Many-to-One); `Proceso` (`Seleccionar todos`); `Auditor` (`Sitio Temporal` + balance); `Resultado` (modal `⚙ Plazos NC +15d/+45d`, `REAL` discretas, NCs por cláusula sin contaminar `Calendario`); `Revisión`; y `Resumen` con salto 1-clic preservando `(certId, auditId)`.
- **`WORKER` (`1440×900` y `390×844`):** Operación completa en Bloque 1 y Bloque 2, acceso a **`+ Auditoría`** y **`⚙ Plazos NC (+15d / +45d)`**, sin errores ni desbordamientos.
- **`AUDITOR` (`1440×900` y `390×844`):** Menú **`Certificación` / `Conglomerado` completamente oculto y ruta bloqueada** (fallback seguro al Inicio), ausencia de `+ Auditoría`, mutación de cajas y `⚙ Plazos NC`, lectura acotada a sus auditorías asignadas con capacidad de registrar fechas reales/NCs por cláusula en `Resultado`.
- **`CLIENT` (`1440×900` y `390×844` — Aislamiento Nivel 2 Inter-Org):** `Cliente Empresa Iberometal` visualiza en `Conglomerado`, `Vínculo` (`VINC-N2-01` con redacción de `notas`), `Calendario` y `Resumen` **estrictamente `Iberometal Componentes S.A.` (`FN-QMS-2024-001`, `FN-EMS-2025-002`, `FN-QMS-2026-008` — 3 certificados)** con **cero filtración** de `Example, C.A.`, `CyberCloud Solutions S.L.`, `Corporación Alimentaria del Sur`, `FN-QMS-2025-004` ni `FN-QMS-2026-009`.

---

## 3. Resolución de Entorno y Variables (`.env`, `supabase.env`, `supabase.config.json`)

| Variable | Uso | Visibilidad |
| :--- | :--- | :--- |
| `VITE_SUPABASE_URL` | Endpoint del proyecto Supabase (`https://ufowtgmpaahyshdxlnlq.supabase.co`). | Cliente y Servidor |
| `VITE_SUPABASE_ANON_KEY` | Clave pública/anon para PostgREST, GoTrue Auth y RPC sujetos a RLS. | Cliente |
| `VITE_SUPABASE_DATABASE_KEY` | Contraseña PostgreSQL directa (`db.<ref>.supabase.co:5432`) para `POST /api/reset-db` vía `pg.Client` (directo o fallback). | Solo Servidor (`server.ts`) |
| `VITE_SUPABASE_TOKEN` | Personal Access Token de Supabase Management API (método prioritario en `POST /api/reset-db`). | Solo Servidor (`server.ts`) |

---

## 4. Cuentas de Prueba (`05_usuarios.sql`)

Todas las cuentas de prueba comparten la contraseña **`Password123*`** y disponen de acceso directo (**Quick test login**) en `authView.ts`:

| Rol | Email | Estado Inicial | Alcance Principal |
| :--- | :--- | :---: | :--- |
| `ADMIN` | `admin@fondonorma.test` | `APPROVED` | Control total, aprobaciones, Reset DB (`00`–`07.sql`), `Estado DB`, `+ Auditoría`, `⚙ Plazos NC`, alertas, `"Mostrar Archivados"`, `"Restaurar"` y `audit_log`. |
| `WORKER` | `worker@fondonorma.test` | `APPROVED` | Gestión operativa completa en `'add' \| 'edit'` en los 3 bloques (incluyendo conglomerados, cajas de `Vínculo`, `+ Auditoría`, campañas, fechas 1:N, `⚙ Configurar Alertas`, `⚙ Plazos NC`, `Procesos del Sitio`, Smart Mutation y traducciones ES/EN), archivo seguro (`archive_record`) y lectura de `audit_log`. |
| `AUDITOR` | `auditor@fondonorma.test` | `APPROVED` | Bloques `Auditoría` y `Extra` (solo lectura en campañas/fechas asignadas; sin `Certificación`/`Conglomerado`, sin `+ Auditoría` y sin `⚙ Plazos NC`); ejecución de fechas reales, NCs por cláusula, recomendación ISO 17021-1 e historial asignado. |
| `CLIENT` | `client@fondonorma.test` | `APPROVED` | Lectura acotada a organizaciones con solicitud `APPROVED` en `client_organization_access` (incluyendo **aislamiento Nivel 2 Inter-Org** en conglomerados, cajas de `Vínculo` sin `notas` de hermanas, **Coverage HUD**, sitios, procesos, auditorías asignadas a su org, hallazgos y catálogo normativo). |

---

## 5. Flujo de Ejecución y Despliegue en Producción

1. **Desarrollo local:**
   ```bash
   npm install
   npm run dev   # Ejecuta tsx server.ts en http://0.0.0.0:3000 con Vite middleware (hmr: false)
   ```
2. **Regeneración opcional del catálogo normativo CSV:**
   ```bash
   npx tsx scripts/buildNormasSeed.ts   # Regenera 07_normas_requisitos_csv.sql (5,260 líneas / ~1.33 MB) y src/lib/generated/normasCatalogBundle.ts
   ```
3. **Compilación y Arranque en Producción:**
   ```bash
   npm run build # Compila SPA en dist/ mediante vite build (153 módulos con manualChunks)
   npm start     # Ejecuta node server.ts sirviendo dist/ y rutas /api/* en el puerto 3000 (o process.env.PORT)
   ```
4. **Reinicio Limpio de Base de Datos:**
   - Desde la interfaz de acceso (`authView.ts`): botón **Reset DB** → modal de confirmación → `POST /api/reset-db` (`00_delete_tables.sql` a `07_normas_requisitos_csv.sql`, con fallback automático de Management API a `pg.Client`).
   - Desde Supabase SQL Editor: ejecutar secuencialmente `00_delete_tables.sql` hasta `07_normas_requisitos_csv.sql`.
