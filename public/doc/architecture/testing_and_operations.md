# Pruebas, Operación y Despliegue (`programa_aud`)

> Documento técnico complementario de [`project_resume.md`](../project_resume.md). Detalla la suite de verificación automatizada (**64 archivos / 520 pruebas unitarias en 39 suites de `node:test`**), verificación estricta de tipos (`strict: true`, `0 any`), compilación optimizada con Vite `6.4.6` (`manualChunks`, **144 módulos**), pipeline de generación del catálogo normativo CSV, auditoría E2E en navegador Chromium real (`390×844` móvil y `1440×900` escritorio) sobre las **11 etapas del pipeline** y los **4 roles (`ADMIN`, `WORKER`, `AUDITOR`, `CLIENT`)** y operación en producción.

---

## 1. Suite de Pruebas Unitarias (`node:test` + `tsx`)

Todas las reglas de negocio ISO/IEC 17021-1 e ISO 19011, esquemas SQL de retención lógica (**50 tablas**, **43 soft-delete**, **223 triggers**), flujo completo de **11 pasos (`Conglomerado` → `Revisión`)**, motor `LTREE` + Smart Mutation, políticas RBAC (incluyendo aislamiento Nivel 2 `CLIENT`), sanitización Zero-UUID, navegación contextual (**31 tipos**), sub-entidades de certificado, plantillas Multi View Clean List (`table-fixed`), fichas unificadas `'read' | 'add' | 'edit'`, motor documental bilingüe ES/EN y paginación PostgREST se verifican mediante **64 archivos de pruebas (`src/lib/*.test.ts`)** ejecutados con `node:test` vía `tsx` (**520 pruebas distribuidas en 39 suites, 100% aprobadas, 0 fallos, 0 omitidas**):

### 1.1 Nuevas Suites del Pipeline Operativo (`Steps 1.1` → `11.1`)

| Archivo de Pruebas | Módulo(s) Evaluado(s) | Cobertura Principal |
| :--- | :--- | :--- |
| **`src/lib/conglomeradoDomain.test.ts`**, **`src/lib/conglomeradoView.test.ts`** | `conglomeradoDomain.ts`, `conglomeradoView.ts` | Buckets `grupo_empresarial`, organizaciones solas/sin agrupar, re-agrupación corporativa y aislamiento RBAC. |
| **`src/lib/vinculoDomain.test.ts`**, **`src/lib/vinculoView.test.ts`** | `vinculoDomain.ts`, `vinculoView.ts` | Certificados `LIBRE`/`INDIVIDUAL`/`VINCULADO`, eliminación de `Multisitio → Mixta`, toggle `tiene_sitio_temporal` y aislamiento Nivel 2 `CLIENT`. |
| **`src/lib/designacionTipoDomain.test.ts`**, **`src/lib/designacionTipoView.test.ts`** | `designacionTipoDomain.ts`, `designacionTipoView.ts` | Cola temporal (`Próximas a ejecutar` vs `Futuro +1/+3 años`), reprogramaciones 1:N (`auditoria_fecha`) y `table-fixed`. |
| **`src/lib/designacionSitioDomain.test.ts`**, **`src/lib/designacionSitioView.test.ts`** | `designacionSitioDomain.ts`, `designacionSitioView.ts` | `Sitio 0 (HQ)` pre-seleccionado, **Tira de Ciclo Multi-Anual (`◀` / `▶`)** sin `<select>` y herencia/alternancia de `tiene_sitio_temporal`. |
| **`src/lib/designacionTemporalDomain.test.ts`**, **`src/lib/designacionTemporalView.test.ts`** | `designacionTemporalDomain.ts`, `designacionTemporalView.ts` | Sitios temporales multicertificado (`auditoria_sitio_temporal*`), steppers `0.25d` y filtro `"Sin auditores asignados"`. |
| **`src/lib/tiempoDomain.test.ts`**, **`src/lib/tiempoView.test.ts`** | `tiempoDomain.ts`, `tiempoView.ts` | Distribución `0.25d` regular + temporal, resumen combinado y transición `Incompletos` / `Completos`. |
| **`src/lib/asignacionDomain.test.ts`**, **`src/lib/asignacionView.test.ts`** | `asignacionDomain.ts`, `asignacionView.ts` | Asignación de auditores en sitios regulares y temporales, progreso `100% Completo ✓` y alertas de competencia/rotación. |
| **`src/lib/programaCertificadoDomain.test.ts`**, **`src/lib/programaViews.test.ts`** | `programaCertificadoDomain.ts`, `programaView.ts`, `programaProcesosView.ts`, `programaTurnosView.ts` | **Mini-Paso 8A (`Procesos`)** restringido a `procesos_por_sitio` con alerta `⚠️ Nunca auditado`, drawer histórico y **Mini-Paso 8B (`Turnos`)**. |
| **`src/lib/pipelineEngine.test.ts`** | `pipelineEngine.ts`, `calendarioView.ts` | Badges de etapa de 1 palabra, contadores `Año` / `Q1–Q4` / `Mes` / `Timeline` sin doble conteo y navegación directa al paso activo. |
| **`src/lib/resultadoDomain.test.ts`**, **`src/lib/resultadoView.test.ts`** | `resultadoDomain.ts`, `resultadoView.ts` | Capacidad concurrente válida en fecha `REAL`, cálculo automático NC `+15d`/`+60d`, prellenado editable de `fecha_cierre_auditoria` y cierre `'Cerrada'`. |
| **`src/lib/revisionDomain.test.ts`** | `revisionDomain.ts`, `revisionView.ts` | Cola QA Post-Cierre (`Pendientes de Revisión` / `Revisadas`), bloqueo sin `documentacion_completa`, verificación RLS/triggers SQL y paridad de semillas `06_datos_prueba.sql`. |

### 1.2 Suites del Motor de Programación, Cobertura Normativa, Catálogo, Seguridad y Gobernanza

| Archivo de Pruebas | Módulo(s) Evaluado(s) | Cobertura Principal |
| :--- | :--- | :--- |
| `src/lib/auditPlanningEngine.test.ts` | `auditPlanningEngine.ts`, `auditAlertsEngine.ts` | Reglas `INDIVIDUAL` / `NIVEL_1_INTRA_ORG` / `NIVEL_2_INTER_ORG` (7 naturalezas), validaciones de fechas `PREPROGRAMADA_MES` vs `PROGRAMADA_EXACTA` vs `REAL` 1:N, cálculo Dual-Bucket `0.25d`, capacidad vs span, detección de conflictos, `findUnprogrammedCertificatesByStatus`, `computeAuditAlerts` y rotación de Auditor Líder. |
| `src/lib/auditPersistence.test.ts` | `auditPlanningPersistence.ts` | Validación y construcción Zero-UUID para guardado atómico Paso 1 (`validateAndBuildStep1ProgramBundle`), `diffProgramAuditCertificates`, fechas 1:N, sitios, equipos y guardado normalizado de `configuracion_alerta_auditoria`. |
| `src/lib/auditMultiViews.test.ts`, `src/lib/auditDetailViews.test.ts`, `src/lib/auditPlannerUi.test.ts` | Vistas transversales de Auditoría | `programacionView.ts`, `calendarioView.ts`, `resultadoView.ts`, `sitioAuditoriaView.ts`, `auditPlannerView.ts` y aislamiento de roles. |
| `src/lib/auditDomain.test.ts`, `src/lib/auditExecution.test.ts`, `src/lib/auditPhase5Views.test.ts` | `auditDomain.ts`, `auditExecution.ts` | Motor de recomendación ISO/IEC 17021-1 Cláusula 9.5/9.6, flujo CAPA y conflictos de horario. |
| `src/lib/auditLog.test.ts` | `auditLog.ts` | Resolución legible de actores sin UUIDs, diferencias `JSONB`, eventos `smart_mutation_pruned_links` y cumplimiento Zero-UUID. |
| `src/lib/accessControl.test.ts`, `src/lib/profileGovernance.test.ts` | `accessControl.ts`, `healthCheck.ts`, `profileView.ts` | Matrices RBAC (`ADMIN`, `WORKER`, `AUDITOR`, `CLIENT`), bloqueo de `AUDITOR` en Bloque 2, aislamiento Nivel 2 `CLIENT` y auto-edición segura de `Mi Perfil`. |
| `src/lib/archiveGovernance.test.ts` | `archiveGovernance.ts`, `sitioDomain.ts`, `procesoDomain.ts`, `turnoDomain.ts` | Formateo de `get_archive_dependency_summary`, sanitización de motivos (máx. 300 chars), protección de `Sitio 0` y **0 llamadas `.delete()`** sobre las **43 tablas** de `PROTECTED_SOFT_DELETE_TABLES`. |
| `src/lib/activeCertificates.test.ts`, `src/lib/certificadoSubEntities.test.ts` | `activeCertificates.ts`, `certificadoSubEntities.ts` y vistas | Conteo estricto de certificados activos, validación RIF/NIF, `client_organization_access` y sub-entidades (`fecha`, `contacto`, `telefono`, `email`). |
| `src/lib/coverageEngine.test.ts`, `src/lib/step31CoverageHud.test.ts`, `src/lib/step32BatchAndOverrides.test.ts`, `src/lib/noAplicableDomain.test.ts` | `coverageEngine.ts`, `procesoDomain.ts`, `noAplicableDomain.ts`, `extraDomain.ts` | Espejo isomórfico 1:1 del motor SQL `LTREE`, Coverage HUD, Smart Mutation (`C_eff(K)`), batch `LTREE` y overrides `MANUAL`. |
| `src/lib/clauseRenderer.test.ts`, `src/lib/normaFullReader.test.ts`, `src/lib/richTextEditor.test.ts`, `src/lib/paginatedHydration.test.ts`, `src/lib/requisitoCsvImporter.test.ts` | Motor normativo y catálogo CSV | Sanitización HTML, expansión `{clause_...}`, lector DFS completo, editor bilingüe ES/EN, paginación `.range()` (`2,188` cláusulas / `2,684` traducciones) y `8` normas canónicas. |
| `src/lib/breadcrumb.test.ts`, `src/lib/competencyMatrix.test.ts`, `src/lib/detailViewsPhase42.test.ts`, `src/lib/multisiteSampling.test.ts`, `src/lib/extraDomain.test.ts`, `src/lib/acreditacionDomain.test.ts`, `src/lib/sitioDomain.test.ts`, `src/lib/procesoDomain.test.ts`, `src/lib/turnoDomain.test.ts` | Navegación y módulos `Extra`/`Certificación` | **31 tipos de breadcrumb**, competencias técnicas, `procesos_por_sitio`, `alcance`, sub-sectores IAF y cumplimiento Zero-UUID. |
| `src/lib/multiViewFacets.test.ts`, `src/lib/searchControls.test.ts`, `src/lib/universalTemplate.test.ts`, `src/lib/widescreenLayout.test.ts`, `src/lib/healthCheck.test.ts`, `src/lib/drillDown.test.ts`, `src/lib/zeroUuid.test.ts` | Controles transversales y auditoría estática | Facetas $S_{-k}$, tablas `table-fixed` sin botones en `<tbody>`, `max-w-[1720px]` y escaneo **Zero-UUID**. |

### 1.3 Suites Estructurales de Fases, Primitivos Compartidos e Integridad UI

| Archivo de Pruebas | Propósito |
| :--- | :--- |
| `src/lib/phase11SqlMigration.test.ts` | Valida columnas soft-delete, triggers de prevención/guardia (`26` padres), triggers ISO 4.3 e índices únicos parciales en `01`–`07.sql`. |
| `src/lib/phase12RlsHardening.test.ts` | Verifica `REVOKE DELETE` (**45 tablas**), `archive_record` (**43 tablas**), `declarar_no_aplicable_con_mutacion`, `fn_protect_profile_rbac_fields` y **149 políticas RLS** en `04_rls.sql`. |
| `src/lib/phase21NavigationShell.test.ts`, `src/lib/phase22DashboardProfile.test.ts`, `src/lib/phase412MultiView.test.ts`, `src/lib/phase421DetailTemplate.test.ts`, `src/lib/step1Primitives.test.ts`, `src/lib/phase62UiIntegrity.test.ts` | Valida shell de 3 bloques, menú anidado 3er nivel, Dashboard minimalista, `Mi Perfil`, Multi View (`type="text"`), Detail Template 3 Zonas, tablas `table-fixed` (`0` botones en `<tbody>`) y cumplimiento **Zero-UUID**. |

### Comandos de Verificación

```bash
# Ejecutar los 64 archivos de prueba (520 pruebas en 39 suites de node:test)
npm test
# Equivalente directo:
npx tsx --test src/lib/*.test.ts

# Verificación estricta de tipos TypeScript (tsc --noEmit, strict: true, 0 any)
npm run lint

# Compilación optimizada de producción con Vite 6.4.6 (144 módulos, genera dist/)
npm run build
```

---

## 2. Compilación Vite (`manualChunks`) y Verificación en Navegador Real

### 2.1 Estrategia de Segmentación de Bundles (`vite.config.ts`)
`vite.config.ts` divide los **144 módulos** de producción mediante `manualChunks`:
- **`views-audit` (`159.77 kB` / `33.36 kB` gzip):** Vistas heredadas del dominio Auditoría y bitácora (`auditoriasView`, `programacionView`, `calendarioView`, `resultadoView`, `auditLogModal`).
- **`supabase` (`230.49 kB` / `60.05 kB` gzip):** Cliente `@supabase/supabase-js`.
- **`views-domains` (`244.62 kB` / `48.70 kB` gzip):** Vistas de Extra y Certificación (`extraView`, `normaView`, `sectorIafView`, `estatusView`, `tipoAuditoriaView`, `metodologiaAuditoriaView`, `certificacionView`, `certificadoView`, `organizacionView`, `auditorView`).
- **`views-shell` (`695.65 kB` / `131.94 kB` gzip):** Shell global, autenticación, header, breadcrumbs, dashboard, `Mi Perfil`, vistas del pipeline de 11 pasos (`conglomeradoView`, `vinculoView`, `designacion*View`, `tiempoView`, `asignacionView`, `programa*View`, `revisionView`), `auditPlannerView`, `sitioAuditoriaView`, `archiveModalView`, consolas administrativas y sub-entidades.
- **`index` JS/CSS (`719.54 kB` JS / `138.85 kB` gzip + `94.94 kB` CSS / `15.44 kB` gzip + `dist/index.html` `1.51 kB`):** Orquestador principal (`src/main.ts`) y hojas Tailwind CSS v4.
- **`domain-lib` (`1,612.13 kB` / `409.89 kB` gzip):** Los **44 módulos** de `src/lib/` junto con `src/lib/generated/normasCatalogBundle.ts` (8 normas, 2,188 cláusulas `LTREE`, 2,684 traducciones ES/EN).

### 2.2 Verificación End-to-End en Chromium (`playwright-cli`) sobre los 11 Pasos y los 4 Roles
Validación ejecutada en navegador real Chromium contra base recién reiniciada (`POST /api/reset-db` `00`→`07` en `4.41s`) en **`1440×900` (escritorio)** y **`390×844` (móvil)** con **0 errores HTTP/API (`>= 400`)**, **0 botones en `<tbody>`**, **0 UUIDs visibles** y **0 desbordamiento horizontal** (`scrollWidth === clientWidth`):
- **`WORKER` (Pipeline completo de 11 Pasos — `1440×900` y `390×844`):**
  - Verificación secuencial sin errores en `#/certificacion/conglomerados`, `#/auditorias/vinculo`, `#/auditorias/designacion/tipo` (tabs `Próximas a ejecutar (7)`, `Preprogramadas Mes (3)`, `Futuro +1/+3 años (2)`, `Todas (9)`, `3 certificados Libres sin vínculo`), `#/auditorias/designacion/sitio`, `#/auditorias/designacion/temporal`, `#/auditorias/tiempo`, `#/auditorias/asignacion`, `#/auditorias/programa` (`14` certificados en programa), `#/auditorias/calendar` (`Año | Trimestre | Mes | Timeline`, bandeja `3` alertas, `⚙ Configurar Alertas`), `#/auditorias/resultado` y `#/auditorias/revision` (`Pendientes de Revisión: 1` `FN-QMS-2024-001`, `Revisadas y Aprobadas: 1` `FN-ISMS-2025-003`).
- **`ADMIN` (`1440×900` & `390×844`):** Acceso total a Bloque 1 + Bloque 2 (`Conglomerado` #1), checkbox `"Mostrar Archivados"` operativo y `0` desbordamiento en escritorio/móvil.
- **`AUDITOR` (`1440×900` & `390×844`):** **Bloque 2 (`Certificación` / `Conglomerado`) completamente ausente y navegación bloqueada**, `"⚙ Configurar Alertas"` ausente, lectura acotada a sus auditorías asignadas y `0` desbordamiento.
- **`CLIENT` (`1440×900` & `390×844` — Aislamiento Nivel 2 Inter-Org):** `Cliente Empresa Iberometal` visualiza en `#/certificacion/conglomerados`, `#/auditorias/vinculo` (`VINC-N2-01`) y `#/auditorias/designacion/tipo` **únicamente a `Iberometal Componentes S.A.` (`FN-QMS-2024-001 · 1 cert`)** con **cero filtración** de `Example, C.A.`, `CyberCloud Solutions S.L.` o `FN-QMS-2026-009`.

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
| `ADMIN` | `admin@fondonorma.test` | `APPROVED` | Control total, aprobaciones, Reset DB (`00`–`07.sql`), `Estado DB`, alertas, `"Mostrar Archivados"`, `"Restaurar"` y `audit_log`. |
| `WORKER` | `worker@fondonorma.test` | `APPROVED` | Gestión operativa completa en `'add' \| 'edit'` en los 3 bloques (incluyendo programas, fechas 1:N, planificación Dual-Bucket, `⚙ Configurar Alertas`, `Procesos del Sitio`, Smart Mutation y traducciones ES/EN), archivo seguro (`archive_record`) y lectura de `audit_log`. |
| `AUDITOR` | `auditor@fondonorma.test` | `APPROVED` | Bloques `Auditoría` y `Extra` (solo lectura en programas/fechas asignadas y sin `Certificación` ni `⚙ Configurar Alertas`); ejecución de hallazgos, matriz normativa, recomendación ISO 17021-1 e historial asignado. |
| `CLIENT` | `client@fondonorma.test` | `APPROVED` | Lectura acotada a organizaciones con solicitud `APPROVED` en `client_organization_access` (incluyendo **aislamiento Nivel 2 Inter-Org** en campañas multientidad, **Coverage HUD**, sitios, procesos, auditorías asignadas a su org, hallazgos y catálogo normativo). |

---

## 5. Flujo de Ejecución y Despliegue en Producción

1. **Desarrollo local:**
   ```bash
   npm install
   npm run dev   # Ejecuta tsx server.ts en http://0.0.0.0:3000 con Vite middleware (hmr: false)
   ```
2. **Regeneración opcional del catálogo normativo CSV:**
   ```bash
   npx tsx scripts/buildNormasSeed.ts   # Regenera 07_normas_requisitos_csv.sql (5,261 líneas / ~1.33 MB) y src/lib/generated/normasCatalogBundle.ts
   ```
3. **Compilación y Arranque en Producción:**
   ```bash
   npm run build # Compila SPA en dist/ mediante vite build (122 módulos con manualChunks)
   npm start     # Ejecuta node server.ts sirviendo dist/ y rutas /api/* en el puerto 3000 (o process.env.PORT)
   ```
4. **Reinicio Limpio de Base de Datos:**
   - Desde la interfaz de acceso (`authView.ts`): botón **Reset DB** → modal de confirmación → `POST /api/reset-db` (`00_delete_tables.sql` a `07_normas_requisitos_csv.sql`, con fallback automático de Management API a `pg.Client`).
   - Desde Supabase SQL Editor: ejecutar secuencialmente `00_delete_tables.sql` hasta `07_normas_requisitos_csv.sql`.
