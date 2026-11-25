# Pruebas, Operación y Despliegue (`programa_aud`)

> Documento técnico complementario de [`project_resume.md`](../project_resume.md). Detalla la suite de verificación automatizada (**88 archivos (`79` `src/lib/*.test.ts` + `9` `src/views/*.test.ts`) / 733 pruebas unitarias en 46 suites de `node:test`**), verificación estricta de tipos (`strict: true`, `0 any`), compilación optimizada con Vite `6.4.6` (`manualChunks`, **163 módulos**), auditoría SQL integral (`00`→`07.sql` + segunda corrida idempotente de `06_datos_prueba.sql` sin conflictos), auditoría E2E en navegador Chromium real (`1440×900` escritorio y `390×844` móvil) cubriendo **Bloque 2 `Vínculo`**, **Wizard `+ Auditoría` 3 Fases**, **Bloque 1 `1. Relación`**, **codenames compactos y nombres cortos** en los **4 roles (`ADMIN`, `WORKER`, `AUDITOR`, `CLIENT`)**, y operación en producción.

---

## 1. Suite de Pruebas Unitarias (`node:test` + `tsx`)

Todas las reglas de negocio ISO/IEC 17021-1 e ISO 19011, esquemas SQL de retención lógica (**58 tablas**, **51 soft-delete / `archive_record`**, **122 triggers explícitos / 290 activos**, **146 índices en `03` con 56 únicos parciales**, **173 políticas RLS**, columnas `grupo_empresarial.abreviacion`, `tipo_auditoria.abreviacion`, `vinculo_certificado.tipo_vinculacion_override`, `auditoria.tipo_vinculacion`, desacople de `fn_validar_desvinculacion_certificado` / `fn_validar_auditoria_en_programa`, versionado `organizacion_version` y `certificado_version`, `alcance` bilingüe compartible, columna `sitio.personal_count`, cobertura **100.00%** en los **8 certificados** de `CONG-IND-01`), orden de menú Bloque 1 (`Calendario`, `1. Relación`, `2. Designación`, ... `8. Revisión`, `Resumen`) y Bloque 2 (`Vínculo` debajo de `Certificado`), Breadcrumb In-Card (`compactMode`, `vN`, `abreviacion`, tooltip de alcance), Wizard `+ Auditoría` (3 fases, toggles ON y tabla 2 columnas), `Vínculo` (cajas colapsadas en asignación modal y desvinculación libre), **`codenameDomain.ts`**, **`relacionDomain.ts`**, `Resultado` (`+15d/+45d`), `Revisión`, `Resumen` paralelo, motor `LTREE` + Smart Mutation, políticas RBAC (`AUDITOR` bloqueado en Bloque 2 incl. `hashchange`/`popstate`, `CLIENT` Nivel 2), sanitización Zero-UUID, navegación contextual (**32 tipos** en `BreadcrumbEntityType`), plantillas Multi View Clean List (`table-fixed` sin botones en `<tbody>`), lector/editor bilingüe ES/EN y paginación PostgREST se verifican mediante **88 archivos de pruebas (`79` `src/lib/*.test.ts` + `9` `src/views/*.test.ts`)** ejecutados con `node:test` vía `tsx` (**733 pruebas distribuidas en 46 suites, 100% aprobadas, 0 fallos, 0 omitidas**):

### 1.1 Suites del Bloque 1 Consolidado, `Vínculo` Bloque 2, `1. Relación`, Codenames y Versionado

| Archivo de Pruebas | Módulo(s) Evaluado(s) | Cobertura Principal |
| :--- | :--- | :--- |
| **`src/lib/step101SqlSchema.test.ts`**, **`src/lib/phase11SqlMigration.test.ts`**, **`src/lib/phase12RlsHardening.test.ts`** | Esquema SQL (`00`–`07`) | Validación de `grupo_empresarial.abreviacion`, `tipo_auditoria.abreviacion`, `vinculo_certificado.tipo_vinculacion_override`, `auditoria.tipo_vinculacion`, desacople de `fn_validar_desvinculacion_certificado`, `organizacion_version`, `certificado_version`, `alcance`, `alcance_certificado_compartido`, `fn_next_programa_auditoria_codigo`, `fn_next_auditoria_codigo`, `58` tablas, `51` soft-delete / `archive_record`, `REVOKE DELETE` (`53` tablas), `50` `fn_prevent_hard_delete` y `173` políticas RLS. |
| **`src/lib/codenameDomain.test.ts`**, **`src/views/step51CodenameViews.test.ts`** *(Nuevos)* | `codenameDomain.ts`, vistas Bloque 1 y 2 | Generación de codenames compactos (`2026-11 Seg.1`), tooltips seguros, nombres cortos `resolveShortConglomeradoName` / `resolveShortOrganizacionName` y propagación transversal en `Calendario`, `Designación`, `Resumen`, selector de auditoría, `Conglomerados` y `Breadcrumbs`. |
| **`src/lib/relacionDomain.test.ts`**, **`src/views/relacionView.test.ts`** *(Nuevos)* | `relacionDomain.ts`, `relacionView.ts` | Bloque 1 Paso 1 (`Relación`): Multi View Org/Conglomerado con 5 facetas, Pop-up Selector agrupado por certificado (más reciente→antigua), Detail View comparando Bloque 2 vs `auditoria.tipo_vinculacion` sin mutar cajas, `0 <button>` en `<tbody>` y aislamiento RBAC de 4 roles. |
| **`src/lib/organizacionVersionDomain.test.ts`**, **`src/lib/certificadoVersionDomain.test.ts`**, **`src/lib/alcanceDomain.test.ts`**, **`src/views/organizacionView.test.ts`** | `organizacionVersionDomain.ts`, `certificadoVersionDomain.ts`, `alcanceDomain.ts`, `organizacionView.ts` | Guardia Anti-No-Op, `abreviacion`, resolución de certificados vinculados, clonado 2 pasos sin duplicar `fecha_certificado`, migración en 4 categorías, validación bilingüe `alcance_es` ilimitado + `alcance_en` opcional, detección de conflictos y bloqueo de auditorías sin alcance. |
| **`src/lib/certificadoShareDomain.test.ts`**, **`src/lib/certificadoSharePersistence.test.ts`**, **`src/lib/sitioShareDomain.test.ts`**, **`src/views/shareModalView.test.ts`** | `certificadoShareDomain.ts`, `certificadoSharePersistence.ts`, `sitioShareDomain.ts`, `shareModalView.ts` | Compartición de `alcance` con Popup de Comparación ES/EN (`fn_compartir_alcance_con_resolucion` + `archive_record`), compartición binaria de procesos (`Misma norma` vs `Norma distinta`), auto-resolución de `numero_sitio` compartido, cascada en sitio y rollback compensatorio Zero-UUID. |
| **`src/lib/auditWizardDomain.test.ts`**, **`src/views/auditWizardModal.test.ts`** | `auditWizardDomain.ts`, `auditWizardModal.ts` | Asistente guiado en 3 Fases (`1`, `2`, `3` / `✓`), toggles por certificado en Fase 2 (`ON` por defecto, validación de `alcance` en habilitados), tabla de 2 columnas (`Relación / Naturaleza` \| `Tipo de Auditoría`) en Fase 3, previsualización de codename y creación sin mutar Bloque 2. |
| **`src/lib/certificateAuditSelector.test.ts`** | `certificateAuditSelector.ts`, `auditSectionShell.ts`, `auditCardBreadcrumb.ts` | Breadcrumb In-Card (`1. Relación` .. `8. Revisión` + `Resumen`), `compactMode` en `auditSectionShell.ts`, selector persistente de auditoría por certificado, salto directo entre vinculados y exclusión en Multi Views/`Calendario`/`Vínculo`. |
| **`src/lib/conglomeradoDomain.test.ts`** | `conglomeradoDomain.ts`, `conglomeradoView.ts` | Buckets `grupo_empresarial`, organizaciones `SOLO`, desvinculación segura, pestaña `Auditorías` más recientes primero con `estatus_auditoria` y aislamiento RBAC. |
| **`src/lib/vinculoDomain.test.ts`**, **`src/views/vinculoView.test.ts`** | `vinculoDomain.ts`, `vinculoView.ts` | Bloque 2 `Vínculo`: Multi View por Conglomerado, `Bandeja LIBRE`, modal de asignación con cajas colapsadas por defecto, Cajas Agrupadoras limpias, `tipo_vinculacion_override`, desvinculación permitida incluso con auditorías activas/cerradas, prohibición de movimiento directo Caja A→B y aislamiento Nivel 2 `CLIENT`. |
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
| `src/lib/breadcrumb.test.ts`, `src/lib/competencyMatrix.test.ts`, `src/lib/extraDomain.test.ts`, `src/lib/acreditacionDomain.test.ts`, `src/lib/sitioDomain.test.ts`, `src/lib/procesoDomain.test.ts`, **`src/views/procesoView.test.ts`**, `src/lib/turnoDomain.test.ts` | Navegación y módulos `Extra`/`Certificación` | **32 tipos de breadcrumb**, competencias técnicas, `procesos_por_sitio`, banner de sincronización misma norma (`procesoView.ts`) y cumplimiento Zero-UUID. |
| `src/lib/multiViewFacets.test.ts`, `src/lib/searchControls.test.ts`, `src/lib/universalTemplate.test.ts`, `src/lib/widescreenLayout.test.ts`, `src/lib/healthCheck.test.ts`, `src/lib/drillDown.test.ts`, `src/lib/zeroUuid.test.ts`, `src/lib/phase21NavigationShell.test.ts`, `src/lib/phase22DashboardProfile.test.ts`, `src/lib/phase412MultiView.test.ts`, `src/lib/phase421DetailTemplate.test.ts`, `src/lib/step1Primitives.test.ts`, `src/lib/phase62UiIntegrity.test.ts` | Shell, plantillas e integridad UI | Orden exacto Bloque 1 (`Calendario`, `Relación`, `Designación > ...`), Bloque 2 (`Vínculo` debajo de `Certificado`), Dashboard minimalista, Multi View (`type="text"`), facetas $S_{-k}$, Detail Template 3 Zonas, `max-w-[1720px]`, `table-fixed` (`0` botones en `<tbody>`) y escaneo **Zero-UUID**. |

### Comandos de Verificación

```bash
# Ejecutar suite unitaria completa de dominio y vistas (88 archivos / 733 pruebas en 46 suites)
npx tsx --test src/lib/*.test.ts src/views/*.test.ts
# Script npm por defecto para la capa de dominio (src/lib/*.test.ts):
npm test

# Verificación estricta de tipos TypeScript (tsc --noEmit, strict: true, 0 any)
npm run lint

# Compilación optimizada de producción con Vite 6.4.6 (163 módulos, genera dist/)
npm run build
```

---

## 2. Compilación Vite (`manualChunks`), Auditoría SQL y Verificación en Navegador Real

### 2.1 Estrategia de Segmentación de Bundles (`vite.config.ts`)
`vite.config.ts` divide los **163 módulos** de producción mediante `manualChunks`:
- **`views-audit` (`144.76 kB` / `30.35 kB` gzip):** Vistas de auditoría, programación, calendario, resultado y bitácora (`auditoriasView`, `programacionView`, `calendarioView`, `resultadoView`, `auditLogModal`).
- **`supabase` (`230.49 kB` / `60.05 kB` gzip):** Cliente `@supabase/supabase-js`.
- **`views-domains` (`321.16 kB` / `63.79 kB` gzip):** Vistas de Extra y Certificación (`extraView`, `normaView`, `sectorIafView`, `estatusView`, `tipoAuditoriaView`, `metodologiaAuditoriaView`, `certificacionView`, `certificadoView`, `organizacionView`, `auditorView`, `shareModalView`).
- **`views-shell` (`896.06 kB` / `168.26 kB` gzip):** Shell global, autenticación, header, breadcrumbs, Breadcrumb In-Card (`compactMode`), Wizard `+ Auditoría`, dashboard, `Mi Perfil`, **`relacionView`**, **`vinculoView`**, `conglomeradoView`, `designacion*View`, `tiempoView`, `asignacionView`, `programa*View`, `revisionView`, `resumenView`, `auditPlannerView`, `sitioAuditoriaView`, `archiveModalView`, consolas administrativas y sub-entidades.
- **`index` JS/CSS (`894.52 kB` JS / `172.29 kB` gzip + `101.92 kB` CSS / `16.31 kB` gzip + `dist/index.html` `1.51 kB`):** Orquestador principal (`src/main.ts`) y hojas Tailwind CSS v4.
- **`domain-lib` (`1,930.07 kB` / `490.68 kB` gzip):** Los **57 módulos** de `src/lib/` junto con `src/lib/generated/normasCatalogBundle.ts` (8 normas, 2,188 cláusulas `LTREE`, 2,684 traducciones ES/EN).

### 2.2 Reset Limpio (`00`→`07.sql`), Idempotencia y Auditoría SQL Integral
- **Reset completo vía `POST /api/reset-db`:** HTTP `200` (`{"ok":true}`), `0` errores SQL ejecutando `00_delete_tables.sql` → `07_normas_requisitos_csv.sql`.
- **Idempotencia comprobada de `06_datos_prueba.sql`:** Segunda ejecución directa consecutiva de `06_datos_prueba.sql` completada en `826 ms` con **0 errores**, **0 SQLSTATE `27000`** y **0 conflictos de índices únicos parciales**, preservando conteos exactos activos (`deleted_at IS NULL`): `3` conglomerados (`Alimentos`, `CyberCloud`, `Iberometal`), `5` organizaciones, `21` certificados, `9` vínculos / `19` membresías `vinculo_certificado`, `23` programas, `35` auditorías, `48` fechas, `9` tipos de auditoría (`Est.1`..`Otro`), `21` hallazgos, `3` sitios temporales y `2,188` cláusulas.
- **Auditoría de Gobernanza SQL:** **58 tablas** con **100% RLS habilitado (`tables_without_rls = 0`)**, **173 políticas RLS**, **205 índices en vivo** (`146` en `03_indices_optimizacion.sql` con `56` únicos parciales), **290 triggers activos no internos** (`122` explícitos en `01_creacion.sql`), `REVOKE DELETE` en `53` tablas, `archive_record` en `51` tablas, **0 `.delete()`** sobre entidades protegidas con `deleted_at`, **0 `: any` / `as any` / `<any>`** en `src/` y cobertura normativa **100.00%** en los 8 certificados de `CONG-IND-01`.

### 2.3 Verificación End-to-End en Chromium (`playwright-cli`) sobre los 4 Roles y Ambos Viewports
Validación ejecutada en Chromium headless sobre `http://localhost:3000` tras reinicio limpio de BD en **`1440×900` (escritorio)** y **`390×844` (móvil)** con **0 errores de consola de aplicación / `pageerror` / HTTP >= 500**, **0 UUIDs visibles**, **0 `<button>` dentro de `<tbody>`** y **0 desbordamiento horizontal** (`scrollWidth <= innerWidth`):
- **`ADMIN` (`1440×900` y `390×844`):**
  - *Bloque 2 → `Vínculo` (debajo de `Certificado`):* Multi View por Conglomerado con nombres cortos (`Iberometal`, `Alimentos`, `CyberCloud`); Detail View de `Iberometal` con Zona Superior `LIBRE` y Cajas Agrupadoras limpias; clic en certificado `LIBRE` abriendo modal `#vinculoAssignModal` con cajas **colapsadas por defecto** (`▸`), expansión bajo demanda (`▾`) y asignación; edición de caja y `tipo_vinculacion_override`; desvinculación exitosa retornando a `LIBRE` incluso con auditorías activas/cerradas; re-asignación desde `LIBRE` y ausencia total de movimiento directo Caja A → Caja B.
  - *Wizard `+ Auditoría` (3 Fases):* Fase 1 selección bidireccional Conglomerado/Organización con nombres cortos; Fase 2 caja `Vínculo` con todos los toggles por certificado `ON` por defecto, apagado parcial para subconjunto; Fase 3 codename previo (`2029-05 Diag.`) y tabla editable de 2 columnas (`Relación / Naturaleza` \| `Tipo de Auditoría`) guardando la campaña sin mutar las cajas de Bloque 2.
  - *Bloque 1 → `1. Relación`, Pipeline `1..8 + Resumen` y Codenames:* Multi View de `1. Relación` + **Pop-up Selector** con codenames compactos (`2026-11 Seg.1`, `2024-05 Est.2`) → entrada a Detail View (`1. Relación` → `2. Designación` → ... → `8. Revisión` + `Resumen`), ajuste de naturaleza de auditoría con persistencia real en UI y verificación visual en `Calendario`, `Designación`, `Resumen`, `Conglomerados` y móvil `390×844`.
- **`WORKER` (`1440×900` y `390×844`):** Acceso lectura/escritura completo en Bloque 2 `Vínculo` (`+ Nueva Caja` habilitado, sin `"Mostrar Archivados"`), Wizard `+ Auditoría`, Bloque 1 `1. Relación` (selects editables) y gestión operativa sin herramientas exclusivas `ADMIN`.
- **`AUDITOR` (`1440×900` y `390×844`):** Bloque 2 `Certificación` / `Vínculo` **completamente oculto**, acceso directo por hash `#/certificacion/vinculo` redirigido limpiamente a `#/dashboard`; en Bloque 1 (`1. Relación` y pipeline) acceso en **estricto solo lectura** (`Solo lectura`, `0 <select>`, `0 + Auditoría`) acotado únicamente a sus auditorías asignadas (ej. `FN-ISMS-2025-003 v1 · CYBERCLOUD · 2024-05 Est.2`).
- **`CLIENT` (`1440×900` y `390×844` — Aislamiento Nivel 2 Inter-Org):** En Bloque 2 `Vínculo` visualiza únicamente `Iberometal` (`4/4 en cajas`, **0 filtraciones** de `Example, C.A.`, `Alimentos` o `CyberCloud` y **0 botones** de edición/asignación/desvinculación); en Bloque 1 `1. Relación` y `Resumen` visualiza sus auditorías en estricto solo lectura (`Solo lectura`) sin desbordamientos móviles.

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
| `WORKER` | `worker@fondonorma.test` | `APPROVED` | Gestión operativa completa en `'add' \| 'edit'` en los 3 bloques (incluyendo conglomerados, cajas de `Vínculo` en Bloque 2, `1. Relación`, `+ Auditoría`, campañas, fechas 1:N, `⚙ Configurar Alertas`, `⚙ Plazos NC`, `Procesos del Sitio`, Smart Mutation y traducciones ES/EN), archivo seguro (`archive_record`) y lectura de `audit_log`. |
| `AUDITOR` | `auditor@fondonorma.test` | `APPROVED` | Bloques `Auditoría` (`1. Relación` y pipeline en solo lectura) y `Extra` sobre campañas/fechas asignadas; **Bloque 2 `Certificación` / `Vínculo` completamente oculto y bloqueado (incl. redirección por hash a `#/dashboard`)**, sin `+ Auditoría` ni `⚙ Plazos NC`; ejecución de fechas reales, NCs por cláusula, recomendación ISO 17021-1 e historial asignado. |
| `CLIENT` | `client@fondonorma.test` | `APPROVED` | Lectura acotada a organizaciones con solicitud `APPROVED` en `client_organization_access` (incluyendo **aislamiento Nivel 2 Inter-Org** en conglomerados, Bloque 2 `Vínculo` sin `notas` ni organizaciones ajenas, Bloque 1 `1. Relación` / `Resumen`, **Coverage HUD**, sitios, procesos, auditorías asignadas a su org, hallazgos y catálogo normativo). |

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
   npm run build # Compila SPA en dist/ mediante vite build (163 módulos con manualChunks)
   npm start     # Ejecuta node server.ts sirviendo dist/ y rutas /api/* en el puerto 3000 (o process.env.PORT)
   ```
4. **Reinicio Limpio de Base de Datos:**
   - Desde la interfaz de acceso (`authView.ts`): botón **Reset DB** → modal de confirmación → `POST /api/reset-db` (`00_delete_tables.sql` a `07_normas_requisitos_csv.sql`, con fallback automático de Management API a `pg.Client`).
   - Desde Supabase SQL Editor: ejecutar secuencialmente `00_delete_tables.sql` hasta `07_normas_requisitos_csv.sql`.
