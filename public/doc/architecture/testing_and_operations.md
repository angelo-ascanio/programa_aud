# Pruebas, Operación y Despliegue (`programa_aud`)

> Documento técnico complementario de [`project_resume.md`](../project_resume.md). Detalla la suite de verificación automatizada (**42 archivos / 394 pruebas unitarias en 36 suites de `node:test`**), verificación estricta de tipos (`strict: true`, `0 any`), compilación optimizada con Vite `6.4.6` (`manualChunks`, **117 módulos**), pipeline de generación del catálogo normativo CSV, verificación en navegador real Chromium (`375×812` a `1920×1080`) y operación en producción.

---

## 1. Suite de Pruebas Unitarias (`node:test` + `tsx`)

Todas las reglas de negocio ISO/IEC 17021-1 e ISO 19011, esquemas SQL de retención lógica, motor isomórfico de cobertura normativa `LTREE` + Smart Mutation, políticas RBAC, sanitización Zero-UUID, navegación contextual, layout panorámico *widescreen*, sub-entidades de certificado, plantillas Multi View Clean List, fichas unificadas `'read' | 'add' | 'edit'` de `Extra` y `Certificación`, motor documental bilingüe ES/EN y paginación PostgREST se verifican mediante **42 archivos de pruebas (`src/lib/*.test.ts`)** ejecutados con el corredor nativo `node:test` vía `tsx` (**394 pruebas distribuidas en 36 suites, 100% aprobadas, 0 fallos, 0 omitidas**):

### 1.1 Suites de Dominio, Cobertura Normativa, Catálogo, Seguridad y Gobernanza

| Archivo de Pruebas | Módulo(s) Evaluado(s) | Cobertura Principal |
| :--- | :--- | :--- |
| `src/lib/accessControl.test.ts` | `accessControl.ts`, vistas operativas | Matrices RBAC (`ADMIN`, `WORKER`, `AUDITOR`, `CLIENT`), visibilidad de bloques, acceso a ruta `'profile'`, permisos de archivo/restauración, mutación de hallazgos y acceso a `audit_log`. |
| `src/lib/archiveGovernance.test.ts` | `archiveGovernance.ts`, `sitioDomain.ts`, `procesoDomain.ts`, `turnoDomain.ts`, escaneo estático `src/` | Formateo de `get_archive_dependency_summary`, cálculo local de dependencias, sanitización de motivos (máx. 300 chars), reglas de protección de `Sitio 0` (`canArchiveSitio`) y escaneo estático confirmando **0 llamadas `.delete()`** sobre las **30 tablas** `PROTECTED_SOFT_DELETE_TABLES`. |
| `src/lib/profileGovernance.test.ts` | `healthCheck.ts`, `profileView.ts` | Validación de `buildSelfProfileUpdatePayload()` devolviendo estrictamente `{ nombre }` sin `role`/`status`, rechazo de entradas vacías/inválidas/UUIDs, bloqueo en `canModifyProfileStatus`/`canModifyProfileRole` y renderizado solo-lectura de `Mi Perfil` sin fugas UUID. |
| `src/lib/activeCertificates.test.ts` | `activeCertificates.ts`, `organizacionView.ts`, `clientAccessView.ts` | Conteo estricto de certificados activos por organización y globalmente, validación RIF/NIF, modo `'read' | 'add' | 'edit'` en Organización y Acceso Cliente, plantilla Clean List (`type="text"`, único `data-clear-search`, `"Mostrando"`) y cumplimiento Zero-UUID. |
| `src/lib/certificadoSubEntities.test.ts` | `certificadoSubEntities.ts`, `fechaView.ts`, `contactoView.ts`, `telefonoView.ts`, `emailView.ts` | Validación de los 7 valores canónicos de `tipo_fecha` y fechas calendario (incluyendo años bisiestos), notas de vigencia relativa, validación de `contacto_certificado` (`cargo` nullable), `telefono_contacto_certificado` (default `'Oficina'`), `email_contacto_certificado` (default `'Trabajo'`), guardia `canArchiveContacto` y modos `'read' | 'add' | 'edit'` sin formularios inline. |
| `src/lib/coverageEngine.test.ts` | `coverageEngine.ts` | Espejo isomórfico 1:1 del motor SQL `LTREE`: prevención de colisiones de prefijo en `isLtreeSelfOrDescendant` (`4.4_1` vs `4.4_10`), clasificación `es_obligatorio`, evaluación jerárquica descendente (`CUBIERTO`, `NO_APLICABLE`, `PENDIENTE`, `INFORMATIVA`, `PARCIAL`, `MIXTO`), bloqueo de asignación sobre exclusiones ISO 4.3, previsualización y aplicación de Smart Mutation (`C_eff(K)`). |
| `src/lib/step31CoverageHud.test.ts` | `coverageEngine.ts`, `certificadoView.ts`, `certificacionView.ts` | Ausencia de columna `"Cobertura Normativa"` en la tabla Multi View de Certificados (6 columnas limpias), renderizado del **Coverage HUD** y barra SVG segmentada, expansión del **Mapa de Cobertura** con 5 filtros, barra de resolución rápida de pendientes y aislamiento Zero-UUID por rol (`ADMIN`, `WORKER`, `AUDITOR`, `CLIENT`). |
| `src/lib/step32BatchAndOverrides.test.ts` | `procesoDomain.ts`, `noAplicableDomain.ts`, `extraDomain.ts`, `procesoView.ts`, `noAplicableView.ts`, `requisitoView.ts` | Selector batch en `Proceso` (`Solo Obligatorias` / `Solo Pendientes` / `Todas`, `✓ Seleccionar Todas las Pendientes`, conteos descendentes y cláusulas bloqueadas `ISO 4.3`), opciones anotadas y banner ámbar no bloqueante **Smart Mutation** en `No Aplicable`, e insignia obligatoria/informativa + override `MANUAL` en `Requisito`. |
| `src/lib/noAplicableDomain.test.ts` | `noAplicableDomain.ts`, `noAplicableView.ts` | Contratos `'read' | 'add' | 'edit'` para `requisitos_no_aplicables_certificado`, filtrado dinámico de cláusulas por Norma del Certificado (`filterRequisitosForCertificado`), reconciliación en Zona 1, validación ISO 4.3 (`>= 15` chars) y cumplimiento Zero-UUID. |
| `src/lib/clauseRenderer.test.ts` | `clauseRenderer.ts` | Sanitización allowlist XSS (bloqueo de `<script>`, `<svg>`, `<iframe>`, `on*`, `javascript:`), expansión recursiva `{clause_...}`, pila anti-ciclos, fallback `es ↔ en`, Reglas documentales 1, 2 y 3, enlaces interactivos `select-requisito` y conteo `debe`/`debería`/`shall`/`should`. |
| `src/lib/normaFullReader.test.ts` | `normaFullReader.ts`, `requisitoView.ts` | Ordenamiento jerárquico DFS natural (`orderNormaRequisitosHierarchically`), renderizado completo (`es` / `en` / `bilingual`), supresión de contenedores puros, resaltado seguro `<mark>`, lectura unificada desde `Ver Norma` y estructura compacta Step 4.2 de `Requisito`. |
| `src/lib/richTextEditor.test.ts` | `richTextEditor.ts`, `views/richTextEditor.ts` | Edición `Visual / HTML / Vista Previa` en `es`/`en`, normalización `normalizeEditorHtmlOutput`, snippets `NOTA` y `Tabla 2×2`, validación URL `^https?://`, sugerencias `buildChildPlaceholderSuggestions`, autocompletado `{` (`detectInlineBraceTrigger`), validación anti-ciclos DAG en placeholders y cero `window.prompt`. |
| `src/lib/paginatedHydration.test.ts` | `paginatedHydration.ts` | Paginación determinista `.range(from, to)` superando límites de 1,000 filas (2,188 cláusulas / 2,684 traducciones), indexación $O(n)$, cálculo `computeNormaClausulaCounts`, ensamblado y fallback elegante al catálogo embebido `normasCatalogBundle.ts`. |
| `src/lib/requisitoCsvImporter.test.ts` | `requisitoCsvImporter.ts`, `public/requisitos/*.csv` | Parser RFC 4180 (multilínea y `""` escapadas), reparación de códigos truncados (`.1` → `.10`), clasificación híbrida `es_obligatorio`/`obligatorio_origen`, orden topológico, preservación de 7 UUIDs históricos, limpieza `data-oe-version` y validación contra los CSV reales (`8` normas, `2,188` cláusulas: `1,673` obligatorias / `515` informativas, `2,684` traducciones). |
| `src/lib/auditDomain.test.ts` | `auditDomain.ts` | Reglas base del dominio Auditoría, estados operativos y metadatos iniciales. |
| `src/lib/auditExecution.test.ts` | `auditExecution.ts`, `resultadoView.ts`, `calendarioView.ts` | Motor de recomendación ISO/IEC 17021-1 Cláusula 9.5/9.6 (bloqueo por `NC_MAYOR` abierta o `NC_MENOR` sin plan de acción), firma electrónica, flujo CAPA y detección de solapamiento de auditores. |
| `src/lib/auditLog.test.ts` | `auditLog.ts` | Resolución legible de actores (`resolveAuditActorDisplay`), formateo local de fechas, cálculo de diferencias `JSONB`, sanitización `formatDiffValue` y cumplimiento Zero-UUID. |
| `src/lib/auditPhase5Views.test.ts` | `programacionView.ts`, `calendarioView.ts`, `resultadoView.ts`, `auditoriasView.ts` | Integración de vistas del dominio Auditoría, controles de programación/calendario/Kanban y aislamiento por rol. |
| `src/lib/breadcrumb.test.ts` | `breadcrumb.ts`, `breadcrumbView.ts`, `header.ts` | Etiquetas singulares (23 tipos incluyendo sub-entidades de certificado, `organismo_acreditacion`, `subsector_iaf`, `requisito`, `no_aplicable`, `acceso_cliente`, `competencia_auditor`), factoría `'...-new'`, prevención de bucles con claves compuestas, truncamiento a 24 caracteres (`…`), colapso intermedio y `data-nav-reset="true"` + ruta `'profile'` en cabecera. |
| `src/lib/competencyMatrix.test.ts` | `competencyMatrix.ts`, `auditorView.ts`, `competenciaAuditorView.ts` | Emparejamiento técnico (`norma` + `sector_iaf` + `subsector_iaf`), cascada `Sector IAF → Sub-Sector`, vigencia de credenciales, alta/desvinculación M:N y coerción segura de identificadores. |
| `src/lib/detailViewsPhase42.test.ts` | `detailTemplate.ts`, vistas de detalle en `Extra` y `Certificación` | Verificación integral de Fichas de Detalle (`'read' | 'add' | 'edit'`, orden Guardar-primero/Cancelar-segundo en cabecera, ausencia de botones al pie), layout de **5 chips padres** (`xl:grid-cols-5`) y **7 pestañas** en `Certificado`, `Sitio 0`, `Proceso`, `Turno`, `Organización`, `Auditor`, `Acreditación` y cumplimiento Zero-UUID. |
| `src/lib/drillDown.test.ts` | Lógica transversal heredada de hallazgos y auditorías | Modalidades ISO, estadísticas/filtros de hallazgos, validación de planificación de auditorías y elegibilidad de emisión. |
| `src/lib/extraDomain.test.ts` | `extraDomain.ts`, vistas de Dominio Extra (`normaView`, `requisitoView`, `sectorIafView`, `subsectorIafView`, `estatusView`, `tipoAuditoriaView`, `metodologiaAuditoriaView`) | Catálogos maestros, jerarquía `LTREE` (`computeRequisitoLtreePath`, prevención de ciclos en `filterValidParentRequisitos`), cobertura bilingüe, sub-sectores IAF, ausencia de `Ir a Norma`/`Ruta Materializada` en UI de `Requisito` y validación `'read' | 'add' | 'edit'`. |
| `src/lib/healthCheck.test.ts` | `healthCheck.ts` | Guardias RBAC de rutas (`'profile'` incluida), exactamente 3 bloques singulares en cabecera (`Auditoría`, `Certificación`, `Extra`), exclusión de menús retirados, salud DB y traducción de errores. |
| `src/lib/multisiteSampling.test.ts` | `multisiteSampling.ts`, `certificadoView.ts` | Ordenamiento multisitio con **Sitio 0** al inicio, cascada pura `id_sector_iaf → id_subsector_iaf`, factorías `CertificadoFormDraft`, conteo de sucursales (`numero_sitio > 0`), validación de `alcance` (10–1000 chars), justificación de exclusiones, 7 pestañas de certificado y ficha con Coverage HUD. |
| `src/lib/multiViewFacets.test.ts` | `universalTemplate.ts` (`lib` + `views`) | Conteos reactivos por intersección *rest-out* ($S_{-k}$) con casillas múltiples, filtrado OR intra-categoría / AND inter-categoría, totalizador `"Mostrando X de Y"` y renderizado en directorios de `Certificación`, `Extra` y `Programación`. |
| `src/lib/searchControls.test.ts` | `searchControls.ts` | Normalización Unicode sin acentos, búsqueda multi-token, filtros combinados y extracción de facetas. |
| `src/lib/universalTemplate.test.ts` | `universalTemplate.ts` (`lib` + `views`) | Ordenamiento determinista (`none → asc → desc → none`), locale español, tablas `table-fixed` con redimensionamiento porcentual de columnas, controles `type="text"` con único botón de limpieza (`✕`) y barra lateral colapsable (`data-toggle-sidebar`). |
| `src/lib/widescreenLayout.test.ts` | `layout.ts`, shell y plantillas | Verificación de contenedores panorámicos `max-w-[1720px]`, grilla adaptable hasta 4 columnas en `min-[1680px]` / `2xl` y retención de anchos legibles en `Auth` (`max-w-md`) y edición de alcance (`max-w-4xl`). |
| `src/lib/zeroUuid.test.ts` | `zeroUuid.ts`, `procesoView.ts`, `noAplicableView.ts`, `requisitoView.ts`, `certificadoView.ts` | Detección de UUIDs expuestos en HTML visible, `title`/`aria-label`/`placeholder` e `<input>` visibles, ignorando `data-*`, validación `isValidUuid()` / `assertValidUuid()` y auditoría Step Final Zero-UUID sobre todas las vistas nuevas y refactorizadas. |
| `src/lib/acreditacionDomain.test.ts`, `sitioDomain.test.ts`, `procesoDomain.test.ts`, `turnoDomain.test.ts` | Módulos de dominio de `Extra` y `Certificación` | Validaciones de `organismo_acreditacion`, `acreditacion_norma` y `acreditacion_norma_sector_iaf`, cálculos de vigencia, protección y numeración de Sitio 0 (`suggestNextNumeroSitio`), vinculación `LTREE` de cláusulas y duración de turnos nocturnos (`8h 00m (nocturno)`). |

### 1.2 Suites Estructurales de Fases, Primitivos Compartidos e Integridad UI

| Archivo de Pruebas | Propósito |
| :--- | :--- |
| `src/lib/phase11SqlMigration.test.ts` | Valida columnas `deleted_at`/`deleted_by`/`delete_reason`, `es_obligatorio`/`obligatorio_origen`, triggers de soft-delete/prevención de hard-delete (**29 tablas** con `fn_prevent_hard_delete`, **30 tablas** con sincronización soft-delete incluyendo `client_organization_access`), `get_archive_dependency_summary` (**19 padres**), triggers de exclusión/Smart-Mutation ISO 4.3, `requisito_traduccion`, `acreditacion_norma`, sub-entidades de `certificado`, `id_subsector_iaf` e índices únicos parciales (**22**) en `01`–`07.sql`. |
| `src/lib/phase12RlsHardening.test.ts` | Verifica `REVOKE DELETE` en **32 tablas**, `archive_record` (**30 tablas**), `declarar_no_aplicable_con_mutacion` + `REVOKE EXECUTE` sobre `PUBLIC`/`anon`, `fn_protect_profile_rbac_fields` y ausencia de `FOR DELETE` en tablas protegidas dentro de `04_rls.sql`. |
| `src/lib/phase21NavigationShell.test.ts` | Verifica la estructura de 3 bloques en `header.ts`, retiro de sub-secciones obsoletas y `data-nav-reset="true"`. |
| `src/lib/phase22DashboardProfile.test.ts` | Verifica dashboard minimalista sin explorador duplicado/píldoras de rol y vista `Mi Perfil`. |
| `src/lib/phase412MultiView.test.ts` | Verifica controles Multi View (`type="text"`, único botón `✕`, barra lateral colapsable y facetas) en vistas de dominio. |
| `src/lib/phase421DetailTemplate.test.ts` | Verifica contrato estructural de `renderDetailPageTemplate` en 3 Zonas, `isCreateMode`, `customParentZoneHtml`, `customTopActionsHtml` y rejilla adaptativa de `parents` (incluyendo `xl:grid-cols-5` para 5 FKs). |
| `src/lib/step1Primitives.test.ts` | Verifica `isApprovedStaffProfile` / `isApprovedAdminProfile` (bloqueo de cuentas `PENDING`/`REJECTED` en vistas `Extra` y `Certificación`), `renderDetailFormTopActions` (Guardar antes que Cancelar), `renderDetailBooleanField` sin `*`, `renderDetailParentSelectCard`, `renderMultiViewAddButton`, breadcrumbs para nuevas entidades y soporte de `client_organization_access` en `archive_record` (`04_rls.sql`). |
| `src/lib/phase62UiIntegrity.test.ts` | Auditoría transversal de integridad UI, tablas `table-fixed` sin botones en `<td>` y cumplimiento **Zero-UUID** en Header, Dashboard, Approvals, Modal Audit Log, Certificación (incluyendo `Acceso Cliente`, `Competencias M:N` y Coverage HUD), Auditoría y Extra (incluyendo `Organismo`, `Requisito`, `Sub-Sector`, Lector/Editor bilingüe y modal de archivo seguro). |

### Comandos de Verificación

```bash
# Ejecutar los 42 archivos de prueba (394 pruebas en 36 suites de node:test)
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
`vite.config.ts` define `build.rollupOptions.output.manualChunks` para dividir los **117 módulos** de producción en chunks enfocados por capa y dominio:
- **`supabase` (`~228.75 kB` / `~59.50 kB` gzip):** Cliente `@supabase/supabase-js`.
- **`domain-lib` (`~1,510.17 kB` / `~382.43 kB` gzip):** Los **30 módulos** de lógica pura de `src/lib/` junto con el catálogo normativo offline precompilado `src/lib/generated/normasCatalogBundle.ts` (8 normas, 2,188 cláusulas `LTREE` con `es_obligatorio`/`obligatorio_origen` y 2,684 traducciones HTML ES/EN).
- **`views-audit` (`~116.32 kB` / `~22.15 kB` gzip):** Vistas del dominio Auditoría y bitácora (`auditoriasView`, `programacionView`, `calendarioView`, `resultadoView`, `auditLogModal`).
- **`views-domains` (`~239.02 kB` / `~47.44 kB` gzip):** Vistas principales de los dominios Extra y Certificación (`extraView`, `normaView`, `sectorIafView`, `estatusView`, `tipoAuditoriaView`, `metodologiaAuditoriaView`, `certificacionView`, `certificadoView`, `organizacionView`, `auditorView`).
- **`views-shell` (`~374.22 kB` / `~71.05 kB` gzip):** Shell principal, autenticación, header, breadcrumbs, dashboard, `Mi Perfil`, `archiveModalView`, consolas administrativas, `richTextEditor.ts` y vistas de detalle de sub-entidades (`organismoAcreditacionView`, `acreditacionView`, `requisitoView`, `subsectorIafView`, `clientAccessView`, `competenciaAuditorView`, `sitioView`, `procesoView`, `turnoView`, `noAplicableView`, `fechaView`, `contactoView`, `telefonoView`, `emailView`).
- **`index` JS/CSS (`~441.26 kB` JS / `~86.89 kB` gzip + `~78.48 kB` CSS + `dist/index.html` `1.51 kB`):** Orquestador principal (`src/main.ts`) y hojas de estilo Tailwind CSS v4.

### 2.2 Verificación End-to-End en Chromium (Playwright)
Las pruebas en navegador real contra `http://localhost:3000` verifican en **`375×812` (móvil)**, **`1280×800`** y **`1440×900` / `1920×1080` (escritorio)**:
- **Cero desbordamiento horizontal** (`scrollWidth <= innerWidth` en móvil y escritorio, incluso con tablas `table-fixed` de 7 pestañas en `Certificado`, **Mapa de Cobertura** o modo bilingüe lado a lado del Lector de Norma) y **cero errores de aplicación en consola**.
- **Cabecera en 3 bloques y Dashboard minimalista:** Sin tarjetas de exploración duplicadas ni píldoras redundantes.
- **`Mi Perfil`:** Actualización y restauración exitosa del campo `nombre` con bloqueo de `role` y `status`.
- **Multi View Clean List:** Barra lateral colapsable (`aria-expanded`), conteos reactivos, búsqueda `type="text"` con un único botón `✕` (`[data-clear-search="true"]`), totalizador `Mostrando X de Y`, directorios de Certificados limpios en 6 columnas, filas/tarjetas clicables sin botones en `<td>` y botón `+` en cabecera para crear en Detail `'add'`.
- **Breadcrumbs y Detail Views unificados (`'read' | 'add' | 'edit'`):** Navegación profunda (`Organismo → Acreditación`, `Norma → Requisito`, `Sector IAF → Sub-Sector`, `Organización → Acceso Cliente`, `Auditor → Competencia`, `Certificado → No Aplicable / Fecha / Contacto → Teléfono/Correo` y `Certificado → Sitio 0 → Turno`) con orden Guardar-primero/Cancelar-segundo en cabecera, cero botones al pie del formulario, toast flotante `#archiveGovernanceToast`, sin saltos de dominio, sin bucles y sin exposición de UUIDs.
- **Coverage HUD, Batch LTREE y Smart Mutation en vivo:** Visualización del porcentaje de cobertura obligatoria y Mapa de Cobertura en `Certificado`, resolución rápida de cláusulas pendientes, selección por lotes `✓ Seleccionar Todas las Pendientes` en `Proceso`, persistencia atómica de exclusiones con previsualización Smart Mutation en `No Aplicable` y actualización inmediata de `Coverage HUD`.
- **Lector Completo, Navegación Compacta y Editor Bilingüe de Cláusulas:** Transición `Ver Norma` (`es` / `en` / `bilingual`) con búsqueda resaltada (`<mark>`), navegación directa entre hermanas/sub-cláusulas sin botón `Ir a Norma` ni campo `LTREE` expuesto, override `MANUAL` de obligatoriedad y alta/edición en `Visual / HTML / Vista Previa` con inserción y autocompletado `{clause_...}`.
- **Archivo Seguro, Restauración y Aislamiento de Roles:** Bloqueo por dependencias activas en padres, archivo y restauración limpia como `ADMIN`, y aislamiento verificado para `AUDITOR` (sin bloque `Certificación`), `WORKER` (sin `Estado DB` ni `"Mostrar Archivados"`) y `CLIENT` (sin `Panel Aprobaciones` ni `"Mostrar Archivados"`).

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
| `ADMIN` | `admin@fondonorma.test` | `APPROVED` | Control total, aprobación/cambio de rol de usuarios, catálogos, Reset DB (`00`–`07.sql`), `Database Status`, `"Mostrar Archivados"`, `"Restaurar"` y lectura global de `audit_log`. |
| `WORKER` | `worker@fondonorma.test` | `APPROVED` | Gestión operativa completa en `'add' \| 'edit'` de organizaciones, accesos cliente, certificados, exclusiones Smart Mutation (`declarar_no_aplicable_con_mutacion`), fechas, contactos, teléfonos, correos, sitios, procesos (batch `LTREE`), turnos, auditores/competencias, catálogos `Extra` (incluyendo cláusulas, override `MANUAL` y traducciones HTML ES/EN), planificación de auditorías y archivo seguro sin dependencias (`archive_record`); lectura de usuarios y `audit_log`. |
| `AUDITOR` | `auditor@fondonorma.test` | `APPROVED` | Bloques `Auditoría` y `Extra` (solo lectura); lectura de alcance asignado (incluyendo fechas y contactos activos), ejecución de auditorías asignadas, matriz normativa, registro/cierre de hallazgos, firma de recomendación e historial de sus auditorías/hallazgos. |
| `CLIENT` | `client@fondonorma.test` | `APPROVED` | Lectura acotada exclusivamente a organizaciones con solicitud `APPROVED` en `client_organization_access`, sus certificados (incluyendo **Coverage HUD** y **Mapa de Cobertura**), fechas, contactos, canales, sitios, procesos, auditorías, hallazgos y catálogo normativo. |

---

## 5. Flujo de Ejecución y Despliegue en Producción

1. **Desarrollo local:**
   ```bash
   npm install
   npm run dev   # Ejecuta tsx server.ts en http://0.0.0.0:3000 con Vite middleware (hmr: false)
   ```
2. **Regeneración opcional del catálogo normativo CSV:**
   ```bash
   npx tsx scripts/buildNormasSeed.ts   # Regenera 07_normas_requisitos_csv.sql (5,261 líneas / ~1.33 MB) y src/lib/generated/normasCatalogBundle.ts desde public/requisitos/*.csv
   ```
3. **Compilación y Arranque en Producción:**
   ```bash
   npm run build # Compila SPA en dist/ mediante vite build (117 módulos con manualChunks)
   npm start     # Ejecuta node server.ts sirviendo dist/ y rutas /api/* en el puerto 3000 (o process.env.PORT)
   ```
4. **Reinicio Limpio de Base de Datos:**
   - Desde la interfaz de acceso (`authView.ts`): botón **Reset DB** → modal de confirmación → `POST /api/reset-db` (ejecuta `00_delete_tables.sql` a `07_normas_requisitos_csv.sql`, con fallback automático de Management API a `pg.Client`).
   - Desde Supabase SQL Editor: ejecutar secuencialmente `00_delete_tables.sql` hasta `07_normas_requisitos_csv.sql`.
