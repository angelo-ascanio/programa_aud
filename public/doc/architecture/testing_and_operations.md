# Pruebas, Operación y Despliegue (`programa_aud`)

> Documento técnico complementario de [`project_resume.md`](../project_resume.md). Detalla la suite de verificación automatizada (**39 archivos / 358 pruebas unitarias en 36 suites de `node:test`**), verificación estricta de tipos (`strict: true`, `0 any`), auditoría estática, compilación optimizada con Vite (`manualChunks`), verificación E2E en navegador real Chromium (`390×844` y `1440×900`) y operación en producción.

---

## 1. Suite de Pruebas Unitarias (`node:test` + `tsx`)

Todas las reglas de negocio ISO/IEC 17021-1 e ISO 19011, esquemas SQL de retención lógica, importación Dual-CSV y cálculo `LTREE` de 7 niveles, motor recursivo `{clause_...}` y sanitizador HTML XSS, políticas RBAC, sanitización Zero-UUID, navegación contextual, layout panorámico *widescreen*, editor enriquecido bilingüe y fichas unificadas `'read' | 'add' | 'edit'` se verifican mediante **39 archivos de pruebas (`src/lib/*.test.ts`)** ejecutados con `node:test` vía `tsx` (**358 pruebas distribuidas en 36 suites, 100% aprobadas, 0 fallos, 0 omitidas**):

### 1.1 Suites de Dominio, Normas Dual-CSV, Seguridad y Gobernanza

| Archivo de Pruebas | Módulo(s) Evaluado(s) | Cobertura Principal |
| :--- | :--- | :--- |
| `src/lib/accessControl.test.ts` | `accessControl.ts`, vistas operativas | Matrices RBAC (`ADMIN`, `WORKER`, `AUDITOR`, `CLIENT`), visibilidad de bloques, acceso a ruta `'profile'`, permisos de archivo/restauración, mutación de hallazgos y acceso a `audit_log`. |
| `src/lib/archiveGovernance.test.ts` | `archiveGovernance.ts`, `sitioDomain.ts`, `procesoDomain.ts`, `turnoDomain.ts`, escaneo estático `src/` | Formateo de `get_archive_dependency_summary`, cálculo local de dependencias, sanitización de motivos (máx. 300 chars), reglas de protección de `Sitio 0` (`canArchiveSitio`) y escaneo estático confirmando **0 llamadas `.delete()`** sobre las **30 tablas** `PROTECTED_SOFT_DELETE_TABLES`. |
| `src/lib/profileGovernance.test.ts` | `healthCheck.ts`, `profileView.ts` | Validación de `buildSelfProfileUpdatePayload()` devolviendo estrictamente `{ nombre }` sin `role`/`status`, rechazo de entradas vacías/inválidas/UUIDs, bloqueo en `canModifyProfileStatus`/`canModifyProfileRole` y renderizado solo-lectura de `Mi Perfil` sin fugas UUID. |
| `src/lib/activeCertificates.test.ts` | `activeCertificates.ts`, `organizacionView.ts`, `clientAccessView.ts` | Conteo estricto de certificados activos por organización y globalmente, validación RIF/NIF, modo `'read' | 'add' | 'edit'` en Organización y Acceso Cliente, plantilla Clean List y cumplimiento Zero-UUID. |
| `src/lib/certificadoSubEntities.test.ts` | `certificadoSubEntities.ts`, `fechaView.ts`, `contactoView.ts`, `telefonoView.ts`, `emailView.ts` | Validación de los 7 valores canónicos de `tipo_fecha` y fechas calendario, notas de vigencia relativa, validación de `contacto_certificado` (`cargo` nullable), `telefono_contacto_certificado`, `email_contacto_certificado`, guardia `canArchiveContacto` y modos `'read' | 'add' | 'edit'`. |
| `src/lib/noAplicableDomain.test.ts` | `noAplicableDomain.ts`, `noAplicableView.ts` | Contratos `'read' | 'add' | 'edit'` para `requisitos_no_aplicables_certificado`, filtrado dinámico de cláusulas por Norma del Certificado, reconciliación en Zona 1, validación ISO 4.3 (`>= 15` chars) y cumplimiento Zero-UUID. |
| `src/lib/requisitoCsvImporter.test.ts` | `requisitoCsvImporter.ts`, CSVs en `/public/requisitos/` | Parseo completo de **2,188** cláusulas en `standard.clause.csv` y **2,684** traducciones en `standard.clause.translation.csv`, reparación exacta de los **11 códigos** (`3.10`, `3.20`, `3.30`, `3.40`, `7.10`), validez `LTREE` hasta profundidad 7 y preservación de UUIDs históricos. |
| `src/lib/clauseRenderer.test.ts` | `clauseRenderer.ts` | Sanitización XSS por lista blanca (`<script>`, `on*`, `javascript:`, `<iframe>` removidos; enlaces con `rel="noopener noreferrer"`), expansión recursiva multinivel `{clause_...}` en `ES` y `EN`, guardia anti-ciclos (`cycleDetected: true`), respaldo idiomático (`iso45001_2018` `3.2`), degradación segura para placeholders faltantes (`{clause_9.1.3}`) e indexador `collectClauseIndexText`. |
| `src/lib/normaFullReader.test.ts` | `normaFullReader.ts` | Construcción del modelo íntegro `Norma Completa`, filtrado en vivo por texto/código, navegación rápida por capítulos y cumplimiento Zero-UUID. |
| `src/lib/paginatedHydration.test.ts` | `paginatedHydration.ts` | Paginación multi-ventana (>1,000 filas sin truncamiento) y fusión determinista de `requisito` con `requisito_traduccion` (`es`/`en`). |
| `src/lib/richTextEditor.test.ts` | `richTextEditor.ts`, `src/views/richTextEditor.ts` | `insertTextAtCursor`, `buildChildPlaceholderSuggestions` (orden numérico, estado `alreadyInserted`, exclusión de archivados), detección de trigger `{`, `normalizeEditorHtmlOutput` anti-XSS y renderizado `Visual` / `HTML` / `Vista Previa`. |
| `src/lib/auditDomain.test.ts` | `auditDomain.ts` | Reglas base del dominio Auditoría, estados operativos y metadatos iniciales. |
| `src/lib/auditExecution.test.ts` | `auditExecution.ts`, `resultadoView.ts`, `calendarioView.ts` | Motor de recomendación ISO/IEC 17021-1 Cláusula 9.5/9.6 (bloqueo por `NC_MAYOR` abierta o `NC_MENOR` sin plan de acción), firma electrónica, flujo CAPA y detección de solapamiento de auditores. |
| `src/lib/auditLog.test.ts` | `auditLog.ts` | Resolución legible de actores (`resolveAuditActorDisplay`), formateo local de fechas, cálculo de diferencias `JSONB` y cumplimiento Zero-UUID. |
| `src/lib/auditPhase5Views.test.ts` | `programacionView.ts`, `calendarioView.ts`, `resultadoView.ts`, `auditoriasView.ts` | Integración de vistas del dominio Auditoría, controles de programación/calendario/Kanban y aislamiento por rol. |
| `src/lib/breadcrumb.test.ts` | `breadcrumb.ts`, `breadcrumbView.ts`, `header.ts` | Etiquetas singulares (23 tipos), factoría `'...-new'`, prevención de bucles con claves compuestas, truncamiento a 24 caracteres (`…`), colapso intermedio y `data-nav-reset="true"` + ruta `'profile'` en cabecera. |
| `src/lib/competencyMatrix.test.ts` | `competencyMatrix.ts`, `auditorView.ts`, `competenciaAuditorView.ts` | Emparejamiento técnico (`norma` + `sector_iaf` + `subsector_iaf`), cascada `Sector IAF → Sub-Sector`, vigencia de credenciales y alta/desvinculación M:N. |
| `src/lib/detailViewsPhase42.test.ts` | `detailTemplate.ts`, vistas de detalle en `Extra` y `Certificación` | Verificación integral de Fichas de Detalle en 3 Zonas (`'read' | 'add' | 'edit'`, Guardar-primero/Cancelar-segundo en cabecera, cero botones al pie), **5 chips padres** y **7 pestañas** en `Certificado`, `Sitio 0`, `Proceso`, `Turno`, `Organización`, `Auditor`, `Acreditación` y cumplimiento Zero-UUID. |
| `src/lib/drillDown.test.ts` | Lógica transversal heredada de hallazgos y auditorías | Modalidades ISO, estadísticas/filtros de hallazgos, validación de planificación de auditorías y elegibilidad de emisión. |
| `src/lib/extraDomain.test.ts` | `extraDomain.ts`, `normaView.ts`, `requisitoView.ts`, `sectorIafView.ts`, `subsectorIafView.ts`, `estatusView.ts`, `tipoAuditoriaView.ts`, `metodologiaAuditoriaView.ts` | Catálogos maestros, pestaña `Requisitos` por defecto (Nivel 1) + búsqueda multinivel ES/EN, toggle `ES`/`EN`/`Comparativa`, vecinos/padre/hijos en `requisitoView.ts`, jerarquía `LTREE` anti-ciclos y validación `'read' | 'add' | 'edit'`. |
| `src/lib/healthCheck.test.ts` | `healthCheck.ts` | Guardias RBAC de rutas (`'profile'` incluida), exactamente 3 bloques singulares en cabecera (`Auditoría`, `Certificación`, `Extra`), salud DB y traducción de errores. |
| `src/lib/multisiteSampling.test.ts` | `multisiteSampling.ts`, `certificadoView.ts` | Ordenamiento multisitio con **Sitio 0** al inicio, cascada `id_sector_iaf → id_subsector_iaf`, factorías `CertificadoFormDraft`, validación de `alcance` (10–1000 chars), 7 pestañas de certificado y ficha en 3 Zonas. |
| `src/lib/multiViewFacets.test.ts` | `universalTemplate.ts` (`lib` + `views`) | Conteos reactivos por intersección *rest-out* ($S_{-k}$), filtrado OR/AND, totalizador `"Mostrando X de Y"` y renderizado en directorios de `Certificación`, `Extra` y `Programación`. |
| `src/lib/searchControls.test.ts` | `searchControls.ts` | Normalización Unicode sin acentos, búsqueda multi-token, filtros combinados y extracción de facetas. |
| `src/lib/universalTemplate.test.ts` | `universalTemplate.ts` (`lib` + `views`) | Ordenamiento determinista, locale español, tablas `table-fixed` con `<colgroup>` = `100%`, controles `type="text"` con único botón `✕` y barra lateral colapsable. |
| `src/lib/widescreenLayout.test.ts` | `layout.ts`, shell y plantillas | Contenedores panorámicos `max-w-[1720px]`, grilla adaptable hasta 4 columnas y retención de anchos legibles en `Auth` y edición de alcance. |
| `src/lib/zeroUuid.test.ts` | `zeroUuid.ts` | Detección de UUIDs expuestos en HTML visible y atributos accesibles (`findExposedUuidsInHtml`, `assertZeroUuidExposure`) y validación `isValidUuid()` / `assertValidUuid()`. |
| `src/lib/acreditacionDomain.test.ts`, `sitioDomain.test.ts`, `procesoDomain.test.ts`, `turnoDomain.test.ts` | Módulos de dominio de `Extra` y `Certificación` | Validaciones de `organismo_acreditacion` y `acreditacion_norma` + `acreditacion_norma_sector_iaf`, cálculos de vigencia, protección y numeración de Sitio 0, vinculación `LTREE` de cláusulas y duración de turnos nocturnos. |

### 1.2 Suites Estructurales de Fases, Primitivos Compartidos e Integridad UI

| Archivo de Pruebas | Propósito |
| :--- | :--- |
| `src/lib/phase11SqlMigration.test.ts` | Valida columnas `deleted_at`/`deleted_by`/`delete_reason`, triggers de soft-delete/prevención de hard-delete, `get_archive_dependency_summary` (`19` padres), sub-entidades de `certificado`, `id_subsector_iaf`, `requisito_traduccion`, `acreditacion_norma` e índices únicos parciales en `01`–`07.sql`. |
| `src/lib/phase12RlsHardening.test.ts` | Verifica `REVOKE DELETE` en **32 tablas**, `archive_record`, `fn_protect_profile_rbac_fields` y ausencia de `FOR DELETE` en tablas protegidas dentro de `04_rls.sql`. |
| `src/lib/phase21NavigationShell.test.ts` | Verifica la estructura de 3 bloques en `header.ts`, retiro de sub-secciones obsoletas y `data-nav-reset="true"`. |
| `src/lib/phase22DashboardProfile.test.ts` | Verifica dashboard minimalista sin explorador duplicado/píldoras de rol y vista `Mi Perfil`. |
| `src/lib/phase412MultiView.test.ts` | Verifica controles Multi View (`type="text"`, único botón `✕`, barra lateral colapsable y facetas) en vistas de dominio. |
| `src/lib/phase421DetailTemplate.test.ts` | Verifica contrato estructural de `renderDetailPageTemplate` en 3 Zonas, `isCreateMode`, `customParentZoneHtml`, `customTopActionsHtml` y rejilla adaptativa de `parents`. |
| `src/lib/step1Primitives.test.ts` | Verifica `isApprovedStaffProfile` / `isApprovedAdminProfile`, `renderDetailFormTopActions` (Guardar antes que Cancelar), `renderDetailBooleanField` sin `*`, `renderDetailParentSelectCard`, `renderMultiViewAddButton`, breadcrumbs para nuevas entidades y soporte de `client_organization_access` en `archive_record`. |
| `src/lib/phase62UiIntegrity.test.ts` | Auditoría transversal de integridad UI, tablas `table-fixed` sin botones en `<tbody>`, cumplimiento **Zero-UUID** en todas las vistas de `Certificación`, `Auditoría` y `Extra` (incluyendo `Norma`, `Requisito` y `Rich Text Editor`) y bloqueo RBAC estricto para no-staff. |

### Comandos de Verificación

```bash
# Ejecutar los 39 archivos de prueba (358 pruebas en 36 suites de node:test)
npm test
# Equivalente directo:
npx tsx --test src/lib/*.test.ts

# Verificación estricta de tipos TypeScript (tsc --noEmit, strict: true, 0 any)
npm run lint

# Compilación optimizada de producción con Vite (genera dist/)
npm run build
```

---

## 2. Compilación Vite (`manualChunks`) y Verificación en Navegador Real

### 2.1 Estrategia de Segmentación de Bundles (`vite.config.ts`)
`vite.config.ts` define `build.rollupOptions.output.manualChunks` para dividir el bundle de producción en chunks enfocados por capa y dominio:
- **`supabase` (`~213 kB`):** Cliente `@supabase/supabase-js`.
- **`domain-lib` (`~1,450 kB`):** Los **29 módulos** de lógica pura de `src/lib/` más el catálogo embebido `src/lib/generated/normasCatalogBundle.ts` (respaldo offline de las 8 normas y 2,188 cláusulas con traducciones).
- **`views-audit` (`~119 kB`):** Vistas del dominio Auditoría y bitácora (`auditoriasView`, `programacionView`, `calendarioView`, `resultadoView`, `auditLogModal`).
- **`views-domains` (`~204 kB`):** Vistas principales de los dominios Extra y Certificación (`extraView`, `normaView`, `sectorIafView`, `estatusView`, `tipoAuditoriaView`, `metodologiaAuditoriaView`, `certificacionView`, `certificadoView`, `organizacionView`, `auditorView`).
- **`views-shell` (`~379 kB`):** Shell principal, autenticación, header, breadcrumbs, dashboard, `Mi Perfil`, `archiveModalView`, consolas administrativas, `richTextEditor` y fichas de detalle de sub-entidades.

### 2.2 Verificación End-to-End en Chromium (`playwright-cli`)
Las pruebas automatizadas en navegador real Chromium contra `http://localhost:3000` verifican en **`390×844` (móvil)** y **`1440×900` (escritorio)** con **0 excepciones `pageerror`**, **0 errores de consola** (excluyendo WebSocket HMR deshabilitado en dev) y **0 respuestas HTTP `>= 400`**:
- **Cero desbordamiento horizontal** (`scrollWidth <= clientWidth` tanto en escritorio como en móvil `390×844` sobre `Normas` y `Requisito`) y **Zero-UUID** en todo texto visible.
- **Normas Multi View y Detail View:** Visualización de las **8 normas** con sus conteos reales (`350`, `205`, `307`, `480`, `167`, `138`, `307`, `234`); apertura por defecto en pestaña `Requisitos` con únicamente **10 capítulos raíz (Nivel 1)** en `ISO 9001:2015`; búsqueda instantánea cross-level (`5.1.2`, `liderazgo`); apertura del modal `Norma Completa`.
- **Requisito Read & Authoring (`ES` / `EN`):** Expansión recursiva `{clause_...}` en `ISO 9001:2015` cláusula `4.4`; conmutación `ES` / `EN` / `Comparativa ES / EN`; navegación de vecinos (`Anterior ←` hacia `4.3`), retorno directo en 1 clic a la Norma mediante chip padre; y redacción bilingüe in-app sobre `ISO/IEC 27001:2022` cláusula `5` usando el Rich Text Editor, inserción de sub-cláusula `+ { } Sub-cláusula`, `Vista Previa` y guardado en cabecera (`#saveRequisitoFormBtn`) con persistencia y toast `#archiveGovernanceToast`.
- **Aislamiento RBAC y RLS multi-rol en vivo:** Verificado para **`WORKER`** (acceso operativo sin `Estado DB`), **`AUDITOR`** (sin menú `Certificación`, sin botón `+` ni edición en `Normas`/`Requisito`) y **`CLIENT`** (`Organizaciones` muestra exclusivamente `Iberometal Componentes S.A.` aislado de `CyberCloud Solutions S.L.`, sin controles de creación/edición/archivo).

---

## 3. Resolución de Entorno y Variables (`.env`, `supabase.env`, `supabase.config.json`)

Tanto `server.ts` como `vite.config.ts` cargan configuración opcional en cascada desde `supabase.config.json`, `supabase.env` y `.env` (`override: true`), garantizando el aislamiento de secretos:

| Variable | Uso | Visibilidad |
| :--- | :--- | :--- |
| `VITE_SUPABASE_URL` | Endpoint del proyecto Supabase (`https://ufowtgmpaahyshdxlnlq.supabase.co`). | Cliente y Servidor |
| `VITE_SUPABASE_ANON_KEY` | Clave pública/anon para PostgREST, GoTrue Auth y RPC sujetos a RLS. | Cliente |
| `VITE_SUPABASE_DATABASE_KEY` | Contraseña PostgreSQL directa (`db.<ref>.supabase.co:5432`) para `POST /api/reset-db` vía `pg.Client` (como método directo o fallback ante fallo de token API). | Solo Servidor (`server.ts`) |
| `VITE_SUPABASE_TOKEN` | Personal Access Token de Supabase Management API (método prioritario en `POST /api/reset-db`). | Solo Servidor (`server.ts`) |

---

## 4. Cuentas de Prueba (`05_usuarios.sql`)

Todas las cuentas de prueba comparten la contraseña **`Password123*`** y disponen de acceso directo (**Quick test login**) en `authView.ts`:

| Rol | Email | Estado Inicial | Alcance Principal |
| :--- | :--- | :---: | :--- |
| `ADMIN` | `admin@fondonorma.test` | `APPROVED` | Control total, aprobación/cambio de rol de usuarios, catálogos, autoría normativa bilingüe, Reset DB, `Estado DB`, `"Mostrar Archivados"`, `"Restaurar"` y lectura global de `audit_log`. |
| `WORKER` | `worker@fondonorma.test` | `APPROVED` | Gestión operativa completa en `'add' \| 'edit'` de organizaciones, accesos cliente, certificados, exclusiones, fechas, contactos, teléfonos, correos, sitios, procesos, turnos, auditores/competencias, catálogos `Extra`, autoría de cláusulas/traducciones `ES`/`EN`, planificación de auditorías y archivo seguro sin dependencias (`archive_record`); lectura de usuarios y `audit_log`. |
| `AUDITOR` | `auditor@fondonorma.test` | `APPROVED` | Bloques `Auditoría` y `Extra` (solo lectura); lectura de alcance asignado (incluyendo fechas y contactos activos), ejecución de auditorías asignadas, matriz normativa, registro/cierre de hallazgos, firma de recomendación e historial de sus auditorías/hallazgos. |
| `CLIENT` | `client@fondonorma.test` | `APPROVED` | Lectura acotada exclusivamente a organizaciones con solicitud `APPROVED` en `client_organization_access`, sus certificados, fechas, contactos, canales, sitios, procesos, auditorías y hallazgos. |

---

## 5. Flujo de Ejecución y Despliegue en Producción

1. **Desarrollo local:**
   ```bash
   npm install
   npm run dev   # Ejecuta tsx server.ts en http://0.0.0.0:3000 con Vite middleware (hmr: false)
   ```
2. **Regeneración de Semillero Normativo desde Dual-CSV (cuando cambie `/public/requisitos/*.csv`):**
   ```bash
   npx tsx scripts/buildNormasSeed.ts   # Regenera 07_normas_requisitos_csv.sql y src/lib/generated/normasCatalogBundle.ts
   ```
3. **Compilación y Arranque en Producción:**
   ```bash
   npm run build # Compila SPA en dist/ mediante vite build (con manualChunks)
   npm start     # Ejecuta node server.ts sirviendo dist/ y rutas /api/* en el puerto 3000 (o process.env.PORT)
   ```
4. **Reinicio Limpio de Base de Datos:**
   - Desde la interfaz de acceso (`authView.ts`): botón **Reset DB** → modal de confirmación → `POST /api/reset-db` (ejecuta `00_delete_tables.sql` a `07_normas_requisitos_csv.sql`, con fallback automático de Management API a `pg.Client`).
   - Desde Supabase SQL Editor: ejecutar secuencialmente `00_delete_tables.sql` hasta `07_normas_requisitos_csv.sql`.
