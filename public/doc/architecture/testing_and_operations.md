# Pruebas, Operación y Despliegue (`programa_aud`)

> Documento técnico complementario de [`project_resume.md`](../project_resume.md). Detalla la suite de verificación automatizada (**47 archivos / 438 pruebas unitarias en 36 suites de `node:test`**), verificación estricta de tipos (`strict: true`, `0 any`), compilación optimizada con Vite `6.4.6` (`manualChunks`, **122 módulos**), pipeline de generación del catálogo normativo CSV, auditoría E2E en navegador Chromium real (`390×844` móvil y `1440×900` escritorio) sobre los **4 roles (`ADMIN`, `WORKER`, `AUDITOR`, `CLIENT`)** y operación en producción.

---

## 1. Suite de Pruebas Unitarias (`node:test` + `tsx`)

Todas las reglas de negocio ISO/IEC 17021-1 e ISO 19011, esquemas SQL de retención lógica (**44 tablas**, **37 soft-delete**, **182 triggers**), motor de programación en 2 Pasos + Dual-Bucket `0.25d` + alertas configurables, motor `LTREE` + Smart Mutation, políticas RBAC (incluyendo aislamiento Nivel 2 `CLIENT`), sanitización Zero-UUID, navegación contextual (**26 tipos**), sub-entidades de certificado, plantillas Multi View Clean List (`table-fixed`), fichas unificadas `'read' | 'add' | 'edit'`, motor documental bilingüe ES/EN y paginación PostgREST se verifican mediante **47 archivos de pruebas (`src/lib/*.test.ts`)** ejecutados con `node:test` vía `tsx` (**438 pruebas distribuidas en 36 suites, 100% aprobadas, 0 fallos, 0 omitidas**):

### 1.1 Suites del Bloque 1 (`Auditoría`), Cobertura Normativa, Catálogo, Seguridad y Gobernanza

| Archivo de Pruebas | Módulo(s) Evaluado(s) | Cobertura Principal |
| :--- | :--- | :--- |
| **`src/lib/auditPlanningEngine.test.ts`** | `auditPlanningEngine.ts`, `auditAlertsEngine.ts` | Reglas `INDIVIDUAL` / `NIVEL_1_INTRA_ORG` / `NIVEL_2_INTER_ORG` (7 naturalezas), validaciones de fechas `PREPROGRAMADA_MES` vs `REAL` 1:N, cálculo de balance **Dual-Bucket (`Cubo 1` vs `Cubo 2`)** con precisión **`0.25d`**, capacidad vs span calendario, detección de conflictos de auditores, `findUnprogrammedCertificatesByStatus`, `computeAuditAlerts` y rotación de Auditor Líder (`buildCertificateAuditHistoryDigest`). |
| **`src/lib/auditPersistence.test.ts`** | `auditPlanningPersistence.ts` | Validación y construcción Zero-UUID para alta/edición de campaña Paso 1 (`validateAndBuildStep1ProgramBundle`), `diffProgramAuditCertificates`, fechas 1:N (`buildAuditDateInsertPayload`), sitios por auditoría, equipos `Cubo 1`/`Cubo 2`, consolidación de `equipo_auditor`, cálculo de días activos y guardado normalizado de `configuracion_alerta_auditoria`. |
| **`src/lib/auditMultiViews.test.ts`** | `programacionView.ts`, `calendarioView.ts`, `resultadoView.ts` | Multi View Tarjetas/Tabla en `Programación`, drawer/filtro `"Certificados Sin Programación"`, conmutador de **3 modos en `Calendario` (`Calendario \| Tarjetas \| Tabla`)** con Mes/Trimestre/Línea de Tiempo, drawer de alertas, modal `"⚙ Configurar Alertas"` (solo `ADMIN`/`WORKER`), tabla `table-fixed` de `Resultado` (0 botones en `<tbody>`) y aislamiento Nivel 2 `CLIENT`. |
| **`src/lib/auditDetailViews.test.ts`** | `programacionView.ts`, `sitioAuditoriaView.ts`, `sitioView.ts` | Ficha Detail de `Programación` (Paso 1 campaña/fechas 1:N), sub-ficha `sitioAuditoriaView.ts`, pestaña **`Procesos del Sitio`** (`procesos_por_sitio`) en `sitioView.ts` y bloqueo estricto de edición para `AUDITOR` / `CLIENT`. |
| **`src/lib/auditPlannerUi.test.ts`** | `auditPlannerView.ts` | Panel Histórico de Ciclos y alertas de rotación/procesos sin auditar, **Audit Planner HUD** Dual-Bucket `0.25d`, y **Árbol Visual Tipo Acordeón** (`Sitio 0 primero → Procesos del Sitio → Turnos 1..N → Auditores + Días`) sin UUIDs expuestos. |
| `src/lib/auditDomain.test.ts` | `auditDomain.ts` | Reglas base del dominio Auditoría y estados del ciclo. |
| `src/lib/auditExecution.test.ts` | `auditExecution.ts`, `resultadoView.ts`, `calendarioView.ts` | Motor de recomendación ISO/IEC 17021-1 Cláusula 9.5/9.6 (bloqueo por `NC_MAYOR` abierta o `NC_MENOR` sin plan de acción), flujo CAPA y conflictos de horario. |
| `src/lib/auditPhase5Views.test.ts` | Vistas de Auditoría | Integración general de vistas `programacionView.ts`, `calendarioView.ts`, `resultadoView.ts` y `auditoriasView.ts`. |
| `src/lib/auditLog.test.ts` | `auditLog.ts` | Resolución legible de actores sin UUIDs, diferencias `JSONB`, eventos `smart_mutation_pruned_links` y cumplimiento Zero-UUID. |
| `src/lib/accessControl.test.ts` | `accessControl.ts`, vistas operativas | Matrices RBAC (`ADMIN`, `WORKER`, `AUDITOR`, `CLIENT`), visibilidad de bloques, acceso a `'profile'`, permisos de archivo/restauración, mutación de hallazgos y acceso a `audit_log`. |
| `src/lib/archiveGovernance.test.ts` | `archiveGovernance.ts`, `sitioDomain.ts`, `procesoDomain.ts`, `turnoDomain.ts` | Formateo de `get_archive_dependency_summary`, cálculo local de dependencias, sanitización de motivos (máx. 300 chars), protección de `Sitio 0` y escaneo estático confirmando **0 llamadas `.delete()`** sobre las **37 tablas** de `PROTECTED_SOFT_DELETE_TABLES`. |
| `src/lib/profileGovernance.test.ts` | `healthCheck.ts`, `profileView.ts` | Validación de `buildSelfProfileUpdatePayload()` (`{ nombre }`), bloqueo en `canModifyProfileStatus`/`canModifyProfileRole` y renderizado solo-lectura de `Mi Perfil`. |
| `src/lib/activeCertificates.test.ts` | `activeCertificates.ts`, `organizacionView.ts`, `clientAccessView.ts` | Conteo estricto de certificados activos, validación RIF/NIF, `'read' | 'add' | 'edit'` en Organización y Acceso Cliente y Clean List Zero-UUID. |
| `src/lib/certificadoSubEntities.test.ts` | `certificadoSubEntities.ts`, `fechaView.ts`, `contactoView.ts`, `telefonoView.ts`, `emailView.ts` | Validación de 7 tipos de `fecha_certificado`, contactos (`cargo` nullable), teléfonos (`Oficina`), correos (`Trabajo`), `canArchiveContacto` y modos `'read' | 'add' | 'edit'`. |
| `src/lib/coverageEngine.test.ts` | `coverageEngine.ts` | Espejo isomórfico 1:1 del motor SQL `LTREE`, clasificación `es_obligatorio`, estados de cobertura, bloqueo por exclusiones ISO 4.3 y Smart Mutation (`C_eff(K)`). |
| `src/lib/step31CoverageHud.test.ts` | `coverageEngine.ts`, `certificadoView.ts`, `certificacionView.ts` | Tabla Multi View de Certificados en 6 columnas limpias, **Coverage HUD** + barra SVG, **Mapa de Cobertura** con 5 filtros, resolución rápida y aislamiento por rol. |
| `src/lib/step32BatchAndOverrides.test.ts` | `procesoDomain.ts`, `noAplicableDomain.ts`, `extraDomain.ts` y vistas | Selector batch en `Proceso`, opciones anotadas y banner ámbar **Smart Mutation** en `No Aplicable`, e insignia obligatoria/informativa + override `MANUAL` en `Requisito`. |
| `src/lib/noAplicableDomain.test.ts` | `noAplicableDomain.ts`, `noAplicableView.ts` | Exclusiones ISO 4.3 (`>= 15` chars), filtrado dinámico por norma del certificado, reconciliación y Zero-UUID. |
| `src/lib/clauseRenderer.test.ts` | `clauseRenderer.ts` | Sanitización allowlist XSS, expansión recursiva `{clause_...}`, pila anti-ciclos, fallback `es ↔ en`, Reglas 1–3 y conteo `debe`/`debería`/`shall`/`should`. |
| `src/lib/normaFullReader.test.ts` | `normaFullReader.ts`, `requisitoView.ts` | Ordenamiento DFS natural, lector completo (`es`/`en`/`bilingual`), resaltado `<mark>` y estructura compacta de `Requisito`. |
| `src/lib/richTextEditor.test.ts` | `richTextEditor.ts`, `views/richTextEditor.ts` | Edición `Visual / HTML / Vista Previa`, snippets `NOTA`/`Tabla 2×2`, autocompletado `{` (`detectInlineBraceTrigger`), validación DAG anti-ciclos y cero `window.prompt`. |
| `src/lib/paginatedHydration.test.ts` | `paginatedHydration.ts` | Paginación `.range(from, to)` superando 1,000 filas (2,188 cláusulas / 2,684 traducciones) y respaldo `normasCatalogBundle.ts`. |
| `src/lib/requisitoCsvImporter.test.ts` | `requisitoCsvImporter.ts`, CSV reales | Parser RFC 4180, reparación `.10`, clasificación híbrida `es_obligatorio`, preservación de 7 UUIDs históricos y validación integral (`8` normas, `2,188` cláusulas: `1,673` oblig. / `515` info., `2,684` traducciones). |
| `src/lib/breadcrumb.test.ts` | `breadcrumb.ts`, `breadcrumbView.ts`, `header.ts` | **26 tipos** (`programa_auditoria`, `sitio_auditoria`, `proceso_sitio`, etc.), factoría `'...-new'`, anti-bucles, truncamiento a 24 chars, colapso intermedio y `data-nav-reset="true"`. |
| `src/lib/competencyMatrix.test.ts` | `competencyMatrix.ts`, `auditorView.ts`, `competenciaAuditorView.ts` | Emparejamiento técnico (`norma` + `sector_iaf` + `subsector_iaf`), cascada `Sector → Sub-Sector`, vigencia de credenciales y alta/desvinculación M:N. |
| `src/lib/detailViewsPhase42.test.ts`, `multisiteSampling.test.ts`, `extraDomain.test.ts`, `acreditacionDomain.test.ts`, `sitioDomain.test.ts`, `procesoDomain.test.ts`, `turnoDomain.test.ts` | Plantillas de detalle y módulos de dominio `Extra` / `Certificación` | `'read' | 'add' | 'edit'`, Sitio 0 primero, `procesos_por_sitio`, `alcance`, sub-sectores IAF, acreditaciones multisector, jerarquía `LTREE`, turnos nocturnos y cumplimiento Zero-UUID. |
| `src/lib/multiViewFacets.test.ts`, `searchControls.test.ts`, `universalTemplate.test.ts`, `widescreenLayout.test.ts`, `healthCheck.test.ts`, `drillDown.test.ts`, `zeroUuid.test.ts` | Controles transversales, diseño y auditoría estática | Facetas $S_{-k}$, tablas `table-fixed` sin botones en `<td>`, contenedores `max-w-[1720px]`, guardias RBAC y escaneo estático **Zero-UUID** en todas las vistas. |

### 1.2 Suites Estructurales de Fases, Primitivos Compartidos e Integridad UI

| Archivo de Pruebas | Propósito |
| :--- | :--- |
| `src/lib/phase11SqlMigration.test.ts` | Valida columnas `deleted_at`/`deleted_by`/`delete_reason`, esquema Bloque 1 y `procesos_por_sitio`, triggers de soft-delete/prevención de hard-delete, `get_archive_dependency_summary` (**23 padres**), triggers ISO 4.3, e índices únicos parciales (**33**) en `01`–`07.sql`. |
| `src/lib/phase12RlsHardening.test.ts` | Verifica `REVOKE DELETE` (**39 tablas**), `archive_record` (**37 tablas**), `declarar_no_aplicable_con_mutacion`, `fn_protect_profile_rbac_fields` y **131 políticas RLS** en `04_rls.sql`. |
| `src/lib/phase21NavigationShell.test.ts` | Estructura de 3 bloques en `header.ts` y `data-nav-reset="true"`. |
| `src/lib/phase22DashboardProfile.test.ts` | Dashboard minimalista y vista `Mi Perfil`. |
| `src/lib/phase412MultiView.test.ts` | Controles Multi View Clean List (`type="text"`, único `✕`, barra lateral colapsable). |
| `src/lib/phase421DetailTemplate.test.ts` | Contrato estructural de `renderDetailPageTemplate` en 3 Zonas y `xl:grid-cols-5`. |
| `src/lib/step1Primitives.test.ts` | Primitivos compartidos RBAC (`isApprovedStaffProfile`), `renderDetailFormTopActions`, `renderDetailBooleanField`, breadcrumbs y `client_organization_access` en `archive_record`. |
| `src/lib/phase62UiIntegrity.test.ts` | Auditoría transversal de integridad UI, tablas `table-fixed` sin botones en `<tbody>` y cumplimiento **Zero-UUID** en todos los dominios (`Auditoría`, `Certificación`, `Extra`, Shell y Modales). |

### Comandos de Verificación

```bash
# Ejecutar los 47 archivos de prueba (438 pruebas en 36 suites de node:test)
npm test
# Equivalente directo:
npx tsx --test src/lib/*.test.ts

# Verificación estricta de tipos TypeScript (tsc --noEmit, strict: true, 0 any)
npm run lint

# Compilación optimizada de producción con Vite 6.4.6 (122 módulos, genera dist/)
npm run build
```

---

## 2. Compilación Vite (`manualChunks`) y Verificación en Navegador Real

### 2.1 Estrategia de Segmentación de Bundles (`vite.config.ts`)
`vite.config.ts` divide los **122 módulos** de producción mediante `manualChunks`:
- **`supabase` (`229.96 kB` / `59.87 kB` gzip):** Cliente `@supabase/supabase-js`.
- **`domain-lib` (`1,552.20 kB` / `393.99 kB` gzip):** Los **33 módulos** de `src/lib/` junto con `src/lib/generated/normasCatalogBundle.ts` (8 normas, 2,188 cláusulas `LTREE`, 2,684 traducciones ES/EN).
- **`views-audit` (`228.73 kB` / `47.09 kB` gzip):** Vistas del dominio Auditoría y bitácora (`auditoriasView`, `programacionView`, `calendarioView`, `resultadoView`, `auditLogModal`).
- **`views-domains` (`239.10 kB` / `47.45 kB` gzip):** Vistas principales de Extra y Certificación (`extraView`, `normaView`, `sectorIafView`, `estatusView`, `tipoAuditoriaView`, `metodologiaAuditoriaView`, `certificacionView`, `certificadoView`, `organizacionView`, `auditorView`).
- **`views-shell` (`454.66 kB` / `86.41 kB` gzip):** Shell global, autenticación, header, breadcrumbs, dashboard, `Mi Perfil`, `auditPlannerView`, `sitioAuditoriaView`, `archiveModalView`, consolas administrativas, `richTextEditor` y sub-entidades.
- **`index` JS/CSS (`555.42 kB` JS / `109.66 kB` gzip + `84.25 kB` CSS / `14.03 kB` gzip + `dist/index.html` `1.51 kB`):** Orquestador principal (`src/main.ts`) y hojas Tailwind CSS v4.

### 2.2 Verificación End-to-End en Chromium (`playwright-cli`) sobre los 4 Roles
Validación ejecutada en navegador real Chromium contra base recién reiniciada (`POST /api/reset-db` `00`→`07`) en **`1440×900` (escritorio)** y **`390×844` (móvil)** con **0 errores JS de aplicación en consola** y **0 desbordamiento horizontal** (`scrollWidth === innerWidth = 390` en `Calendario` y `Programación`):
- **`ADMIN` (`1440×900` & `390×844`):**
  - `#/auditorias/scheduling`: 5 campañas visibles; `"Mostrar Archivados"` ejecuta 23 consultas HTTP `200`; `"Certificados Sin Programación"` (`3` candidatos: `Activo 1`, `Estudio 2`); `PROG-2026-001` verifica Paso 1 y Paso 2 (fechas 1:N, **HUD Dual-Bucket `3.00d / 3.00d 100%`**, Árbol Sitio→Proceso→Turno→Auditor `0.25d`); bloqueo de archivo con dependencias activas mostrado correctamente en toast.
  - `#/certificacion/certificates` → `FN-QMS-2024-001` → `Sitio 0 (Sede Principal HQ)` → pestaña **`Procesos del Sitio`** (`table-fixed`, 3 columnas, 0 botones en `<tbody>`).
  - `#/auditorias/calendar`: grilla **Mes** (Nov/Dic 2026 con `PROG-2026-003`, `PROG-2026-001 Reprog. #2`, `PROG-2026-002 PREPROGRAMADA_MES`), modo **`Tarjetas`**, modo **`Tabla`** (`table-fixed`, 6 columnas, 5 filas, 0 botones en `<tbody>`), y guardado en vivo desde modal **`⚙ Configurar Alertas`** hacia `configuracion_alerta_auditoria`.
  - `#/auditorias/findings`: tabla `table-fixed` limpia (5 columnas, 6 filas, 0 botones en `<tbody>`) y motor de recomendación ISO 17021-1.
- **`WORKER` (`1440×900`):** `+ Nuevo Programa de Auditoría` y `⚙ Configurar Alertas` habilitados; `"Mostrar Archivados"` ausente.
- **`AUDITOR` (`1440×900`):** Bloque `Certificación` y `"⚙ Configurar Alertas"` ausentes; accede únicamente a sus **4** campañas asignadas (viendo solo `CyberCloud Solutions S.L.` en `PROG-2026-002`), con Paso 1 y Paso 2 en modo estrictamente solo-lectura (`0` inputs habilitados).
- **`CLIENT` (`1440×900` — Aislamiento Nivel 2 Inter-Org):** `Cliente Empresa Iberometal` visualiza únicamente sus 2 campañas (`PROG-2024-001`, `PROG-2026-002`), y al abrir **`PROG-2026-002` (`NIVEL_2_INTER_ORG`)** visualiza **estrictamente 1 participante (`FN-QMS-2024-001 · Iberometal Componentes S.A. · 2d/2d`)** con **cero filtración** de `CyberCloud Solutions S.L.` ni `FN-ISMS-2025-003`.

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
