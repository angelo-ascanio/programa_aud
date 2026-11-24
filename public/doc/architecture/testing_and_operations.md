# Pruebas, Operación y Despliegue (`programa_aud`)

> Documento técnico complementario de [`project_resume.md`](../project_resume.md). Detalla la suite de verificación automatizada (**80 archivos (`75` `src/lib/*.test.ts` + `5` `src/views/*.test.ts`) / 695 pruebas unitarias en 46 suites de `node:test`**), verificación estricta de tipos (`strict: true`, `0 any`), compilación optimizada con Vite `6.4.6` (`manualChunks`, **160 módulos**), auditoría SQL integral (`00`→`07.sql` + idempotencia + ausencia de `certificado.alcance` + guardia de auditorías sin alcance + cobertura `100.00%` en `CONG-IND-01`), pipeline de generación del catálogo normativo CSV, auditoría E2E en navegador Chromium real (`390×844` móvil y `1440×900` escritorio) sobre todo el **Bloque 1 definitivo + Versionado de Organizaciones y Certificados + `Alcance` Bilingüe Compartible** y los **4 roles (`ADMIN`, `WORKER`, `AUDITOR`, `CLIENT`)**, y operación en producción.

---

## 1. Suite de Pruebas Unitarias (`node:test` + `tsx`)

Todas las reglas de negocio ISO/IEC 17021-1 e ISO 19011, esquemas SQL de retención lógica (**58 tablas**, **51 soft-delete / `archive_record`**, **123 triggers explícitos**, **144 índices en `03` con 55 únicos parciales**, **173 políticas RLS**, versionado **`organizacion_version`** con `abreviacion` y Anti-No-Op, **`certificado_version`** en 2 pasos sin duplicar `fecha_certificado`, **`alcance`** bilingüe compartible con bloqueo sin alcance, columna **`sitio.personal_count`**, cobertura **100.00%** en los **8 certificados** de `CONG-IND-01`, **6 auditores calificados**, **9 vínculos** con `FN-QMS-2026-008` `LIBRE`, compartición selectiva binaria con `fn_sync_shared_process_requisitos` y auditorías multi-anuales limpias), orden de menú Bloque 1, Breadcrumb In-Card (`compactMode`, `vN`, `abreviacion`, tooltip de alcance), Wizard `+ Auditoría`, Cajas de `Vínculo`, sub-secciones `Designación`, `Tiempo`, `Auditor`, `Proceso`, `Turno`, `Resultado` (`+15d/+45d`), `Revisión`, `Resumen` paralelo, motor `LTREE` por versión + Smart Mutation, políticas RBAC (aislamiento Nivel 2 `CLIENT`), sanitización Zero-UUID, navegación contextual (**38 tipos**), sub-entidades de versión, plantillas Multi View Clean List (`table-fixed`), fichas unificadas `'read' | 'add' | 'edit'`, lector/editor bilingüe ES/EN y paginación PostgREST se verifican mediante **80 archivos de pruebas (`75` `src/lib/*.test.ts` + `5` `src/views/*.test.ts`)** ejecutados con `node:test` vía `tsx` (**695 pruebas distribuidas en 46 suites, 100% aprobadas, 0 fallos, 0 omitidas**):

### 1.1 Suites del Bloque 1 Consolidado, Compartición Selectiva, Versionado Org/Cert y `Alcance`

| Archivo de Pruebas | Módulo(s) Evaluado(s) | Cobertura Principal |
| :--- | :--- | :--- |
| **`src/lib/step101SqlSchema.test.ts`**, **`src/lib/phase11SqlMigration.test.ts`**, **`src/lib/phase12RlsHardening.test.ts`** | Esquema SQL (`00`–`07`) | Validación de `organizacion_version`, `certificado_version`, `alcance`, `alcance_certificado_compartido`, remoción de `certificado.alcance`, `fn_crear_version_organizacion`, `fn_clonar_version_certificado`, `fn_compartir_alcance_con_resolucion`, `fn_next_programa_auditoria_codigo`, `fn_next_auditoria_codigo`, `58` tablas, `51` soft-delete / `archive_record`, `REVOKE DELETE` (`53` tablas), `50` `fn_prevent_hard_delete` y `173` políticas RLS. |
| **`src/lib/organizacionVersionDomain.test.ts`**, **`src/lib/certificadoVersionDomain.test.ts`**, **`src/lib/alcanceDomain.test.ts`**, **`src/views/organizacionView.test.ts`** | `organizacionVersionDomain.ts`, `certificadoVersionDomain.ts`, `alcanceDomain.ts`, `organizacionView.ts` | Guardia Anti-No-Op, `abreviacion`, resolución de certificados vinculados, clonado 2 pasos sin duplicar `fecha_certificado`, migración en 4 categorías, validación bilingüe `alcance_es` ilimitado + `alcance_en` opcional, detección de conflictos y bloqueo de auditorías sin alcance. |
| **`src/lib/certificadoShareDomain.test.ts`**, **`src/lib/certificadoSharePersistence.test.ts`**, **`src/lib/sitioShareDomain.test.ts`**, **`src/views/shareModalView.test.ts`** | `certificadoShareDomain.ts`, `certificadoSharePersistence.ts`, `sitioShareDomain.ts`, `shareModalView.ts` | Compartición de `alcance` con Popup de Comparación ES/EN (`fn_compartir_alcance_con_resolucion` + `archive_record`), compartición binaria de procesos (`Misma norma` vs `Norma distinta`), auto-resolución de `numero_sitio` compartido, cascada en sitio y rollback compensatorio Zero-UUID. |
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
| `src/lib/auditLog.test.ts`, `src/lib/accessControl.test.ts`, `src/lib/profileGovernance.test.ts`, `src/lib/archiveGovernance.test.ts` | Auditoría forense, RBAC y retención | Resolución legible de actores sin UUIDs, bloqueo `AUDITOR` en Bloque 2, aislamiento `CLIENT` Nivel 2, auto-edición segura `Mi Perfil`, protección `Sitio 0` y **0 `.delete()`** sobre las **51 tablas** protegidas. |
| `src/lib/activeCertificates.test.ts`, `src/lib/certificadoSubEntities.test.ts`, `src/lib/multisiteSampling.test.ts`, `src/lib/detailViewsPhase42.test.ts`, **`src/views/certificadoView.test.ts`** | Certificados, sub-entidades y vista detalle | Conteo estricto activos, validación RIF/NIF, `client_organization_access`, sub-entidades (`fecha`, `contacto`, `telefono`, `email`), marcas de origen compartido, Tab 1 **`Alcance` (`ES`/`EN`/`Bilingüe`)**, versionado 2 pasos y sub-sectores IAF. |
| `src/lib/coverageEngine.test.ts`, `src/lib/step31CoverageHud.test.ts`, `src/lib/step32BatchAndOverrides.test.ts`, `src/lib/noAplicableDomain.test.ts` | Motor `LTREE`, Coverage HUD y Smart Mutation | Espejo isomórfico 1:1 del motor SQL `LTREE` por versión, Coverage HUD, Smart Mutation (`C_eff(K)`), batch `LTREE` y overrides `MANUAL`. |
| `src/lib/clauseRenderer.test.ts`, `src/lib/normaFullReader.test.ts`, `src/lib/richTextEditor.test.ts`, `src/lib/paginatedHydration.test.ts`, `src/lib/requisitoCsvImporter.test.ts` | Motor normativo y catálogo CSV | Sanitización HTML, expansión `{clause_...}`, lector DFS completo, editor bilingüe ES/EN, paginación `.range()` (`2,188` cláusulas / `2,684` traducciones) y `8` normas canónicas. |
| `src/lib/breadcrumb.test.ts`, `src/lib/competencyMatrix.test.ts`, `src/lib/extraDomain.test.ts`, `src/lib/acreditacionDomain.test.ts`, `src/lib/sitioDomain.test.ts`, `src/lib/procesoDomain.test.ts`, **`src/views/procesoView.test.ts`**, `src/lib/turnoDomain.test.ts` | Navegación y módulos `Extra`/`Certificación` | **38 tipos de breadcrumb**, competencias técnicas, `procesos_por_sitio`, banner de sincronización misma norma (`procesoView.ts`) y cumplimiento Zero-UUID. |
| `src/lib/multiViewFacets.test.ts`, `src/lib/searchControls.test.ts`, `src/lib/universalTemplate.test.ts`, `src/lib/widescreenLayout.test.ts`, `src/lib/healthCheck.test.ts`, `src/lib/drillDown.test.ts`, `src/lib/zeroUuid.test.ts`, `src/lib/phase21NavigationShell.test.ts`, `src/lib/phase22DashboardProfile.test.ts`, `src/lib/phase412MultiView.test.ts`, `src/lib/phase421DetailTemplate.test.ts`, `src/lib/step1Primitives.test.ts`, `src/lib/phase62UiIntegrity.test.ts` | Shell, plantillas e integridad UI | Orden exacto Bloque 1, flyout `Designación`, Dashboard minimalista, Multi View (`type="text"`), facetas $S_{-k}$, Detail Template 3 Zonas, `max-w-[1720px]`, `table-fixed` (`0` botones en `<tbody>`) y escaneo **Zero-UUID**. |

### Comandos de Verificación

```bash
# Ejecutar los 80 archivos de prueba (695 pruebas en 46 suites de node:test)
npm test
# Equivalente directo:
npx tsx --test src/lib/*.test.ts src/views/*.test.ts

# Verificación estricta de tipos TypeScript (tsc --noEmit, strict: true, 0 any)
npm run lint

# Compilación optimizada de producción con Vite 6.4.6 (160 módulos, genera dist/)
npm run build
```

---

## 2. Compilación Vite (`manualChunks`), Auditoría SQL y Verificación en Navegador Real

### 2.1 Estrategia de Segmentación de Bundles (`vite.config.ts`)
`vite.config.ts` divide los **160 módulos** de producción mediante `manualChunks`:
- **`views-audit` (`143.16 kB` / `29.91 kB` gzip):** Vistas de auditoría, programación, calendario, resultado y bitácora (`auditoriasView`, `programacionView`, `calendarioView`, `resultadoView`, `auditLogModal`).
- **`supabase` (`230.49 kB` / `60.05 kB` gzip):** Cliente `@supabase/supabase-js`.
- **`views-domains` (`317.93 kB` / `63.16 kB` gzip):** Vistas de Extra y Certificación (`extraView`, `normaView`, `sectorIafView`, `estatusView`, `tipoAuditoriaView`, `metodologiaAuditoriaView`, `certificacionView`, `certificadoView`, `organizacionView`, `auditorView`, `shareModalView`).
- **`views-shell` (`864.96 kB` / `162.75 kB` gzip):** Shell global, autenticación, header, breadcrumbs, Breadcrumb In-Card (`compactMode`), Wizard `+ Auditoría`, dashboard, `Mi Perfil`, vistas consolidadas del Bloque 1 (`conglomeradoView`, `vinculoView`, `designacion*View`, `tiempoView`, `asignacionView`, `programa*View`, `revisionView`, `resumenView`), `auditPlannerView`, `sitioAuditoriaView`, `archiveModalView`, consolas administrativas y sub-entidades.
- **`index` JS/CSS (`885.09 kB` JS / `171.04 kB` gzip + `101.85 kB` CSS / `16.34 kB` gzip + `dist/index.html` `1.51 kB`):** Orquestador principal (`src/main.ts`) y hojas Tailwind CSS v4.
- **`domain-lib` (`1,889.66 kB` / `480.38 kB` gzip):** Los **55 módulos** de `src/lib/` junto con `src/lib/generated/normasCatalogBundle.ts` (8 normas, 2,188 cláusulas `LTREE`, 2,684 traducciones ES/EN).

### 2.2 Reset Limpio (`00`→`07.sql`), Idempotencia y Auditoría SQL Integral
- **Reset completo vía `POST /api/reset-db`:** HTTP `200` (`{"ok":true}`), `0` errores SQL ejecutando `00_delete_tables.sql` → `07_normas_requisitos_csv.sql`.
- **Idempotencia:** Re-ejecución secuencial de `01` → `07` con conteos exactos sin duplicados (`21` certificados, historial `v1 → v2` en `Iberometal` y `FN-EMS-2025-002`, `20` alcances + `1` compartido, `31` sitios, `40` procesos, `58+` `procesos_por_sitio`, `2,188` cláusulas, `2,684` traducciones, `6` auditores, `9` vínculos, `23` programas, `35` auditorías vinculadas a `id_certificado_version`, `48` fechas, `78` `sitios_por_auditoria`, `31` `equipo_auditor`, `21` hallazgos).
- **Auditoría SQL (`step_final.md`):**
  - **Versionado y `Alcance`:** Ausencia física de `certificado.alcance` y `certificado_version.alcance`; imposibilidad de insertar `auditoria` sin `alcance` propio ni compartido activo (`FN-ISMS-2026-007` bloqueado hasta recibir alcance); guardia Anti-No-Op en `fn_crear_version_organizacion`; clonado en `fn_clonar_version_certificado` generando **0 `fecha_certificado` duplicadas** y manteniendo intacto el `alcance` único; reemplazo transaccional seguro en `fn_compartir_alcance_con_resolucion`.
  - **Cobertura normativa 100.00%:** Los **8 certificados** de `CONG-IND-01` reportan `pendientes = 0`, `porcentaje_cobertura = 100.00` y `cobertura_completa = TRUE`.
  - **Proporcionalidad, competencias y futuras limpias:** `0` tiempos inválidos, `0` asignaciones no calificadas y `0` auditorías futuras (`AUD-2027-*` / `AUD-2028-*`) contaminadas con auditores, hallazgos o cierres.

### 2.3 Verificación End-to-End en Chromium (`playwright-cli`) sobre los 4 Roles y Ambos Viewports
Validación ejecutada en Chromium headless sobre `http://localhost:3000` tras reinicio limpio de BD en **`1440×900` (escritorio)** y **`390×844` (móvil)** con **0 errores de consola de aplicación / `pageerror` / HTTP 500**, **0 UUIDs visibles** y **0 desbordamiento horizontal** (`scrollWidth <= innerWidth`):
- **`ADMIN` (`1440×900` y `390×844`):**
  - *Organización (`v1/v2/v3` + `abreviacion`):* Verificación de `v1` solo lectura vs versión activa editable, bloqueo Anti-No-Op sin cambios y **Modal de Resolución de Certificados** (`Confirmar Vinculación`).
  - *Certificado · Tab 1 `Alcance` y Popup de Conflicto:* `Alcance` como **1.ª pestaña**, conmutación `Español`/`Inglés`/`Bilingüe`, edición multilínea `>5,000` caracteres, compartición directa sin conflicto (`FN-ISMS-2025-003` → `FN-ISMS-2026-007`, desbloqueando `⚡ Generar Auditoría` en `Vínculo` y mostrando `🔗 Compartido desde FN-ISMS-2025-003`), y **Popup de Comparación ES/EN** (`Cancelar` conserva destino; `Continuar y Reemplazar Alcance` sustituye en transacción segura).
  - *Certificado · Versionado 2 Pasos y Bloque 1:* Clonado `v1 → v2` sin duplicar `fecha_certificado`, **Modal de Migración de Auditorías en 4 Categorías**, verificación de separación de versiones en `Sitio`, `Proceso`, `Resultado` y `Revisión` (`AUD-2026-009` en `v1` vs `AUD-2028-005`/`AUD-2026-003` en `v2`), y layout móvil `390×844` sin recorte (`scrollW = 390`).
- **`WORKER` (`1440×900`):** Creación/edición en versión organizacional activa (`Abreviación`), alta de `Alcance` bilingüe, resolución de conflictos (`Continuar y Reemplazar Alcance`) y versionado manual `v2`, sin `"Mostrar Archivados"` ni herramientas exclusivas `ADMIN`.
- **`AUDITOR` (`1440×900`):** Menú **`Certificación` completamente oculto**; en Bloque 1 (`Resumen`) visualiza `v1`, `IBEROMETAL`, tooltip bilingüe `ES/EN` y apertura en estricto solo lectura (`Ver Certificado →` con `Alcance` `ES`/`EN`/`Bilingüe` sin mutaciones).
- **`CLIENT` (`1440×900` — Aislamiento Nivel 2 Inter-Org):** Visualiza únicamente su organización autorizada (`Iberometal Componentes S.A.`, `IBEROMETAL`, `v2`/`v1`) y sus certificados con Tab 1 `Alcance` (`Español`/`Inglés`/`Bilingüe`) en estricto solo lectura, con **0 botones de edición/compartición/versionado** y **0 filtración** de organizaciones ajenas.

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
   npm run build # Compila SPA en dist/ mediante vite build (160 módulos con manualChunks)
   npm start     # Ejecuta node server.ts sirviendo dist/ y rutas /api/* en el puerto 3000 (o process.env.PORT)
   ```
4. **Reinicio Limpio de Base de Datos:**
   - Desde la interfaz de acceso (`authView.ts`): botón **Reset DB** → modal de confirmación → `POST /api/reset-db` (`00_delete_tables.sql` a `07_normas_requisitos_csv.sql`, con fallback automático de Management API a `pg.Client`).
   - Desde Supabase SQL Editor: ejecutar secuencialmente `00_delete_tables.sql` hasta `07_normas_requisitos_csv.sql`.
