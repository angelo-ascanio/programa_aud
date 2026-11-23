# Pruebas, Operación y Despliegue (`programa_aud`)

> Documento técnico complementario de [`project_resume.md`](../project_resume.md). Detalla la suite de verificación automatizada (**76 archivos (`72` `src/lib/*.test.ts` + `4` `src/views/*.test.ts`) / 648 pruebas unitarias en 41 suites de `node:test`**), verificación estricta de tipos (`strict: true`, `0 any`), compilación optimizada con Vite `6.4.6` (`manualChunks`, **157 módulos**), auditoría SQL integral (`00`→`07.sql` + idempotencia + cobertura `100.00%` en `CONG-IND-01`), pipeline de generación del catálogo normativo CSV, auditoría E2E en navegador Chromium real (`390×844` móvil y `1440×900` escritorio) sobre todo el **Bloque 1 definitivo + `Conglomerado` / `Certificado` + Compartición Selectiva Binaria & `Designación → Sitio` ("Less Is More")** y los **4 roles (`ADMIN`, `WORKER`, `AUDITOR`, `CLIENT`)**, y operación en producción.

---

## 1. Suite de Pruebas Unitarias (`node:test` + `tsx`)

Todas las reglas de negocio ISO/IEC 17021-1 e ISO 19011, esquemas SQL de retención lógica (**54 tablas**, **47 soft-delete**, **106 triggers explícitos**, **128 índices en `03` con 45 únicos parciales**, **161 políticas RLS**, columna **`sitio.personal_count`**, cobertura **100.00%** en los **8 certificados** de `CONG-IND-01`, **6 auditores calificados**, **9 vínculos** con `FN-QMS-2026-008` `LIBRE`, compartición selectiva binaria con `fn_sync_shared_process_requisitos` y auditorías multi-anuales limpias), orden de menú Bloque 1, Breadcrumb In-Card (`compactMode`), Wizard `+ Auditoría`, Cajas de `Vínculo`, sub-secciones `Designación` (incl. tarjeta única colapsable/filtrable y sitios compartidos en `Sitio`), `Tiempo`, `Auditor`, `Proceso`, `Turno`, `Resultado` (`+15d/+45d`), `Revisión`, `Resumen` paralelo, motor `LTREE` + Smart Mutation, políticas RBAC (aislamiento Nivel 2 `CLIENT`), sanitización Zero-UUID, navegación contextual (**31 tipos**), sub-entidades de certificado (`personal_count`), plantillas Multi View Clean List (`table-fixed`), fichas unificadas `'read' | 'add' | 'edit'`, lector/editor bilingüe ES/EN y paginación PostgREST se verifican mediante **76 archivos de pruebas (`72` `src/lib/*.test.ts` + `4` `src/views/*.test.ts`)** ejecutados con `node:test` vía `tsx` (**648 pruebas distribuidas en 41 suites, 100% aprobadas, 0 fallos, 0 omitidas**):

### 1.1 Suites del Bloque 1 Consolidado (`Steps 1.1` → `9.1`), Compartición Selectiva y `Designación → Sitio`

| Archivo de Pruebas | Módulo(s) Evaluado(s) | Cobertura Principal |
| :--- | :--- | :--- |
| **`src/lib/step101SqlSchema.test.ts`**, **`src/lib/phase11SqlMigration.test.ts`**, **`src/lib/phase12RlsHardening.test.ts`** | Esquema SQL (`00`–`07`) | Validación de `fn_next_programa_auditoria_codigo`, `fn_next_auditoria_codigo`, campañas preventivas multi-anuales no bloqueantes, `fn_desvincular_organizacion_conglomerado`, plazos NC `+15d/+45d`, `id_proceso NULL` en `hallazgo`, `54` tablas, `47` soft-delete / `archive_record`, `REVOKE DELETE` (`49` tablas), `46` `fn_prevent_hard_delete` y `161` políticas RLS. |
| **`src/lib/certificadoShareDomain.test.ts`**, **`src/lib/certificadoSharePersistence.test.ts`**, **`src/lib/sitioShareDomain.test.ts`**, **`src/views/shareModalView.test.ts`** | `certificadoShareDomain.ts`, `certificadoSharePersistence.ts`, `sitioShareDomain.ts`, `shareModalView.ts` | Compartición binaria en conglomerado (`Misma norma` con checkbox `#shareProcesoWithReqsCheckbox` y `fn_sync_shared_process_requisitos` vs `Norma distinta` vacío `0` requisitos), auto-resolución de `numero_sitio` compartido, cascada de turnos/procesos al compartir sitio y rollback compensatorio Zero-UUID. |
| **`src/lib/auditWizardDomain.test.ts`** | `auditWizardDomain.ts`, `auditWizardModal.ts` | Asistente guiado en 3 Fases (`1`, `2`, `3` / `✓`), fecha objetivo única en `Programada Exacta` (`fecha_programada`), creación multi-anual sin colisiones y redirección a `Designación → Tipo`. |
| **`src/lib/certificateAuditSelector.test.ts`** | `certificateAuditSelector.ts`, `auditSectionShell.ts`, `auditCardBreadcrumb.ts` | Breadcrumb In-Card (`1..7` + `Resumen`), `compactMode` en `auditSectionShell.ts`, selector persistente de auditoría por certificado, salto directo entre vinculados y exclusión en Multi Views/`Calendario`/`Vínculo`. |
| **`src/lib/conglomeradoDomain.test.ts`** | `conglomeradoDomain.ts`, `conglomeradoView.ts` | Buckets `grupo_empresarial`, organizaciones `SOLO`, desvinculación segura, pestaña `Auditorías` más recientes primero con `estatus_auditoria` y aislamiento RBAC. |
| **`src/lib/vinculoDomain.test.ts`** | `vinculoDomain.ts`, `vinculoView.ts` | Multi View por Conglomerado, Cajas Agrupadoras (`LIBRE`/`INDIVIDUAL`/`VINCULADO`), `Mixta`, bloqueo de traslado con auditoría activa, redacción de `notas` y aislamiento Nivel 2 `CLIENT`. |
| **`src/lib/designacionTipoDomain.test.ts`**, **`src/lib/designacionTipoView.test.ts`**, **`src/lib/designacionFechaDomain.test.ts`** | `designacionTipo*`, `designacionFecha*` | Colas temporales por certificado, Multi View `Fecha` (`formatCompactLinkNature`, último registro agregado por secuencia, estatus y faceta de certificado), Detail View unificada (`#designacion-fecha-detail-table`, último agregado primero, 1ra fecha fija no eliminable, normalización silenciosa de `tag`, `#plannedDateEditorModal` `YYYY-MM` vs `YYYY-MM-DD`, `REAL` solo lectura), sincronización al lote y `table-fixed` (`0` botones en `<tbody>`). |
| **`src/lib/designacionSitioDomain.test.ts`**, **`src/views/designacionSitioView.test.ts`** | `designacionSitioDomain.ts`, `designacionSitioView.ts` | Tarjeta única colapsada por defecto (`[data-testid="sitio-active-audit-card"]`), Tira de Ciclo (`◀` / `▶`), filtros (`ALL`, `SELECTED`, `UNSELECTED`, `LINK_SELECTED`, `SHARED_ONLY`, `UNVISITED_CYCLE`, `NOT_AUDITED_LAST_N` + input `N`), 5 ordenamientos, búsqueda rápida (`>= 8` sedes), etiqueta `Compartido`, candado `🔒 HQ` y modal `#sitioCoverageModal` (`table-fixed`, `0 <button>` en `<tbody>`). |
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
| `src/lib/auditLog.test.ts`, `src/lib/accessControl.test.ts`, `src/lib/profileGovernance.test.ts`, `src/lib/archiveGovernance.test.ts` | Auditoría forense, RBAC y retención | Resolución legible de actores sin UUIDs, bloqueo `AUDITOR` en Bloque 2, aislamiento `CLIENT` Nivel 2, auto-edición segura `Mi Perfil`, protección `Sitio 0` y **0 `.delete()`** sobre las **47 tablas** protegidas. |
| `src/lib/activeCertificates.test.ts`, `src/lib/certificadoSubEntities.test.ts`, `src/lib/multisiteSampling.test.ts`, `src/lib/detailViewsPhase42.test.ts`, **`src/views/certificadoView.test.ts`** | Certificados, sub-entidades y vista detalle | Conteo estricto activos, validación RIF/NIF, `client_organization_access`, sub-entidades (`fecha`, `contacto`, `telefono`, `email`), marcas de origen compartido, `alcance` y sub-sectores IAF. |
| `src/lib/coverageEngine.test.ts`, `src/lib/step31CoverageHud.test.ts`, `src/lib/step32BatchAndOverrides.test.ts`, `src/lib/noAplicableDomain.test.ts` | Motor `LTREE`, Coverage HUD y Smart Mutation | Espejo isomórfico 1:1 del motor SQL `LTREE`, Coverage HUD, Smart Mutation (`C_eff(K)`), batch `LTREE` y overrides `MANUAL`. |
| `src/lib/clauseRenderer.test.ts`, `src/lib/normaFullReader.test.ts`, `src/lib/richTextEditor.test.ts`, `src/lib/paginatedHydration.test.ts`, `src/lib/requisitoCsvImporter.test.ts` | Motor normativo y catálogo CSV | Sanitización HTML, expansión `{clause_...}`, lector DFS completo, editor bilingüe ES/EN, paginación `.range()` (`2,188` cláusulas / `2,684` traducciones) y `8` normas canónicas. |
| `src/lib/breadcrumb.test.ts`, `src/lib/competencyMatrix.test.ts`, `src/lib/extraDomain.test.ts`, `src/lib/acreditacionDomain.test.ts`, `src/lib/sitioDomain.test.ts`, `src/lib/procesoDomain.test.ts`, **`src/views/procesoView.test.ts`**, `src/lib/turnoDomain.test.ts` | Navegación y módulos `Extra`/`Certificación` | **31 tipos de breadcrumb**, competencias técnicas, `procesos_por_sitio`, banner de sincronización misma norma (`procesoView.ts`) y cumplimiento Zero-UUID. |
| `src/lib/multiViewFacets.test.ts`, `src/lib/searchControls.test.ts`, `src/lib/universalTemplate.test.ts`, `src/lib/widescreenLayout.test.ts`, `src/lib/healthCheck.test.ts`, `src/lib/drillDown.test.ts`, `src/lib/zeroUuid.test.ts`, `src/lib/phase21NavigationShell.test.ts`, `src/lib/phase22DashboardProfile.test.ts`, `src/lib/phase412MultiView.test.ts`, `src/lib/phase421DetailTemplate.test.ts`, `src/lib/step1Primitives.test.ts`, `src/lib/phase62UiIntegrity.test.ts` | Shell, plantillas e integridad UI | Orden exacto Bloque 1, flyout `Designación`, Dashboard minimalista, Multi View (`type="text"`), facetas $S_{-k}$, Detail Template 3 Zonas, `max-w-[1720px]`, `table-fixed` (`0` botones en `<tbody>`) y escaneo **Zero-UUID**. |

### Comandos de Verificación

```bash
# Ejecutar los 76 archivos de prueba (648 pruebas en 41 suites de node:test)
npm test
# Equivalente directo:
npx tsx --test src/lib/*.test.ts src/views/*.test.ts

# Verificación estricta de tipos TypeScript (tsc --noEmit, strict: true, 0 any)
npm run lint

# Compilación optimizada de producción con Vite 6.4.6 (157 módulos, genera dist/)
npm run build
```

---

## 2. Compilación Vite (`manualChunks`), Auditoría SQL y Verificación en Navegador Real

### 2.1 Estrategia de Segmentación de Bundles (`vite.config.ts`)
`vite.config.ts` divide los **157 módulos** de producción mediante `manualChunks`:
- **`views-audit` (`135.96 kB` / `28.37 kB` gzip):** Vistas de auditoría, programación, calendario, resultado y bitácora (`auditoriasView`, `programacionView`, `calendarioView`, `resultadoView`, `auditLogModal`).
- **`supabase` (`230.49 kB` / `60.05 kB` gzip):** Cliente `@supabase/supabase-js`.
- **`views-domains` (`255.20 kB` / `50.48 kB` gzip):** Vistas de Extra y Certificación (`extraView`, `normaView`, `sectorIafView`, `estatusView`, `tipoAuditoriaView`, `metodologiaAuditoriaView`, `certificacionView`, `certificadoView`, `organizacionView`, `auditorView`, `shareModalView`).
- **`views-shell` (`811.46 kB` / `154.22 kB` gzip):** Shell global, autenticación, header, breadcrumbs, Breadcrumb In-Card (`compactMode`), Wizard `+ Auditoría`, dashboard, `Mi Perfil`, vistas consolidadas del Bloque 1 (`conglomeradoView`, `vinculoView`, `designacion*View`, `tiempoView`, `asignacionView`, `programa*View`, `revisionView`, `resumenView`), `auditPlannerView`, `sitioAuditoriaView`, `archiveModalView`, consolas administrativas y sub-entidades.
- **`index` JS/CSS (`829.84 kB` JS / `159.15 kB` gzip + `100.52 kB` CSS / `16.18 kB` gzip + `dist/index.html` `1.51 kB`):** Orquestador principal (`src/main.ts`) y hojas Tailwind CSS v4.
- **`domain-lib` (`1,797.52 kB` / `458.46 kB` gzip):** Los **52 módulos** de `src/lib/` junto con `src/lib/generated/normasCatalogBundle.ts` (8 normas, 2,188 cláusulas `LTREE`, 2,684 traducciones ES/EN).

### 2.2 Reset Limpio (`00`→`07.sql`), Idempotencia y Auditoría SQL Integral
- **Reset completo vía `POST /api/reset-db`:** HTTP `200`, `0` errores SQL ejecutando `00_delete_tables.sql` → `07_normas_requisitos_csv.sql` en `~5.5s`.
- **Idempotencia:** Re-ejecución secuencial de `06_datos_prueba.sql` + `07_normas_requisitos_csv.sql` con conteos exactos sin duplicados (`21` certificados, `31` sitios, `40` procesos, `58+` `procesos_por_sitio`, `2,188` cláusulas, `2,684` traducciones, `6` auditores, `9` vínculos, `23` programas, `35` auditorías, `48` fechas, `78` `sitios_por_auditoria`, `31` `equipo_auditor`, `21` hallazgos + vínculos compartidos de Sección 27).
- **Auditoría SQL (`step_final.md`):**
  - **Cobertura normativa 100.00%:** Los **8 certificados** de `CONG-IND-01` (`FN-QMS-2024-001`, `FN-EMS-2025-002`, `FN-SST-2025-010`, `FN-QMS-2026-008`, `FN-QMS-2025-004`, `FN-EMS-2025-005`, `FN-SST-2026-006`, `FN-QMS-2026-009`) reportan `pendientes = 0`, `porcentaje_cobertura = 100.00` y `cobertura_completa = TRUE`.
  - **Regla `multisitio` y dotación:** `multisitio = FALSE` tiene `1` sitio; `multisitio = TRUE` tiene `3–4` sitios; turnos distintos entre `1` y `6`; `personal_count` entre `12` y `195`.
  - **Compartición binaria y `numero_sitio`:** Los procesos compartidos con `sincronizar_requisitos = TRUE` propagan requisitos ante `fn_sync_shared_process_requisitos` y `trg_sync_req_proceso_same_norm`; los destinos de distinta norma permanecen con `0` requisitos independientes; `sitio_certificado_compartido` garantiza `numero_sitio` único por certificado destino (`uq_sitio_cert_compartido_num_active`).
  - **Proporcionalidad, competencias y futuras limpias:** `0` tiempos inválidos (`MOD(tiempo * 4, 1) <> 0`), `0` asignaciones no calificadas y `0` auditorías futuras (`AUD-2027-*` / `AUD-2028-*`) contaminadas con auditores, hallazgos o cierres.
  - **Integridad de contactos y preservación:** `1–2` contactos con `2–3` teléfonos/correos por certificado en `CONG-IND-01`; `FN-QMS-2026-008` (`LIBRE`) con `0` filas en `vinculo_certificado`/`auditoria`; `CONG-ALM-01` (`AUD-ALM-2026-010..011`) y `CONG-CYB-01` (`AUD-2022-001`) intactos.

### 2.3 Verificación End-to-End en Chromium (`playwright-cli`) sobre los 4 Roles y Ambos Viewports
Validación ejecutada en Chromium headless sobre `http://localhost:3000` tras reinicio limpio de BD en **`1440×900` (escritorio)** y **`390×844` (móvil)** con **0 errores de consola de aplicación / `pageerror` / HTTP 500**, **0 UUIDs visibles** y **0 desbordamiento horizontal** (`scrollWidth <= innerWidth + 1`):
- **`ADMIN` (`1440×900` y `390×844`):**
  - *Pilar 1 (`Certificación > Certificados > Procesos / Sitios`):* En `shareModalView` hacia destino de **misma norma** se presenta la regla binaria (`#shareProcesoWithReqsCheckbox` sin matriz compleja de colisión) y banner de sincronización en `procesoView.ts`; hacia **norma distinta** muestra la advertencia de `0` requisitos independientes; al compartir sitio con cascada se aplica la misma regla binaria en procesos incluidos.
  - *Pilar 2 (`Auditoría > Designación > Sitio`):* Detail View renderiza las franjas superiores (`◀ / <select> / ▶` y selector de hermanos vinculados) y **1 única tarjeta activa colapsada por defecto** (`[data-testid="sitio-active-audit-card"]`); al expandir muestra sitios propios + compartidos (`Compartido`, `🔒 HQ`), filtro `#sitioDetailFilterSelect` (`ALL`, `SELECTED`, `UNSELECTED`, `LINK_SELECTED`, `SHARED_ONLY`, `UNVISITED_CYCLE`, `NOT_AUDITED_LAST_N` + input entero `N >= 0`), `#sitioDetailSortSelect`, búsqueda rápida `#sitioDetailQuickSearch` y modal `#sitioCoverageModal`; cambios persisten tras recargar y se propagan hacia `Tiempo`, `Proceso` y `Turno`.
- **`WORKER` (`1440×900` y `390×844`):** Operación completa en Bloque 1 y Bloque 2 (compartición binaria, `Designación → Sitio` colapsable/filtrable, `+ Auditoría`, `⚙ Plazos NC`, cola `Revisión`), sin errores ni desbordamientos.
- **`AUDITOR` (`1440×900`):** Menú **`Certificación` / `Conglomerado` completamente oculto y ruta bloqueada**; en `Designación → Sitio` visualiza cobertura en solo lectura (`canToggle = false`) sin controles de edición/compartición de Bloque 2.
- **`CLIENT` (`1440×900` y `390×844` — Aislamiento Nivel 2 Inter-Org):** Visualiza estrictamente sus organizaciones aprobadas (`Iberometal Componentes S.A.` en `CONG-IND-01`) y únicamente sitios/procesos legítimamente compartidos hacia sus certificados en `Certificado`, `Conglomerado`, `Vínculo` y `Designación → Sitio`, con **cero filtración** de hermanas no autorizadas ni botones de mutación/compartición.

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
   npm run build # Compila SPA en dist/ mediante vite build (157 módulos con manualChunks)
   npm start     # Ejecuta node server.ts sirviendo dist/ y rutas /api/* en el puerto 3000 (o process.env.PORT)
   ```
4. **Reinicio Limpio de Base de Datos:**
   - Desde la interfaz de acceso (`authView.ts`): botón **Reset DB** → modal de confirmación → `POST /api/reset-db` (`00_delete_tables.sql` a `07_normas_requisitos_csv.sql`, con fallback automático de Management API a `pg.Client`).
   - Desde Supabase SQL Editor: ejecutar secuencialmente `00_delete_tables.sql` hasta `07_normas_requisitos_csv.sql`.
