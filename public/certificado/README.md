# Arquitectura Canónica Multi View & Detail View — Dominio `certificado`

> **Propósito:** Esta carpeta constituye la **receta maestra y especificación técnica definitiva** de `programa_aud` basada estrictamente en la implementación real y verificada del dominio **`certificado`** (`public.certificado` y sus entidades relacionadas). Todo nuevo módulo, tabla o dominio que se incorpore o modernice en la plataforma debe replicar exactamente estos contratos, flujos, reglas visuales, garantías RBAC y patrones de persistencia.

---

## 1. Índice de Documentación

| Archivo | Alcance y Contenido Principal | Audiencia Objetivo |
| :--- | :--- | :--- |
| **[`README.md`](./README.md)** | Mapa del dominio `certificado`, inventario exacto de archivos fuente, mapa de dependencias y checklist paso a paso para replicar el patrón en nuevas tablas. | Arquitectos, Desarrolladores Frontend/Backend, Agentes de Código |
| **[`recipe_multiview_detailview.md`](./recipe_multiview_detailview.md)** | Receta arquitectónica completa de extremo a extremo: shell widescreen, breadcrumbs, Multi View (`universalTemplate`), Detail View unificado (`read \| add \| edit`), Zona 1 de padres y cascada en vivo, Zona 2 de atributos directos y toast flotante, Zona 3 de pestañas hijas, hidratación/persistencia Supabase, gobernanza soft-delete y pruebas `node:test`. | Desarrollo de nuevas vistas, refactors de UX/UI, auditorías técnicas |
| **[`component_specifications.md`](./component_specifications.md)** | Especificación exacta de contratos TypeScript, IDs del DOM, atributos `data-*`, clases Tailwind CSS v4, porcentajes y mínimos de columnas `table-fixed` (directorio + 7 pestañas hijas), esquema PostgreSQL, índices parciales, triggers, RPCs y matriz RLS. | Referencia de implementación exacta y validación de integridad |

---

## 2. Mapa de Archivos del Dominio `certificado` (Código Fuente Verificado)

### 2.1 Lógica Pura, Contratos, Layout y Validación (`src/lib/`)
- `src/lib/layout.ts` — Constantes de contenedor widescreen (`APP_SHELL_CONTAINER_CLASS`, `APP_HEADER_CONTAINER_CLASS`) y cálculo de grilla de tarjetas (`getUniversalCardGridClass`).
- `src/lib/html.ts` — Sanitización obligatoria `escapeHtml` para prevenir XSS en plantillas HTML por strings.
- `src/lib/zeroUuid.ts` — Regla de Cero-UUID expuesto (`containsRawUuid`, `findExposedUuidsInHtml`, `assertZeroUuidExposure`).
- `src/lib/breadcrumb.ts` — Motor de historial de navegación (`BreadcrumbSegment`, `NEW_CERTIFICADO_BREADCRUMB_ID = 'cert-new'`, `createNewCertificadoBreadcrumbSegment`, `pushBreadcrumb`, `popToBreadcrumb`, `popToParentBreadcrumb`, `collapseBreadcrumbForDisplay`, `truncateBreadcrumbLabel`).
- `src/lib/universalTemplate.ts` — Motor puro del Multi View: búsqueda normalizada, filtros por facetas con conteos rest-out $S_{-k}$ (`computeReactiveFacetCounts`, `filterRecordsWithFacets`), ordenamiento (`sortItems`, `cycleSortDirection`) y redimensionamiento proporcional de columnas (`resolveColumnWidthPercentages`, `resizeAdjacentColumns`).
- `src/lib/multisiteSampling.ts` — Contratos y motor puro del dominio `certificado`: `CertificadoDetailMode`, `CertificadoFormDraft`, `CertificadoViewState`, `CertificadoDetailEntity`, factorías (`createEmptyCertificadoFormDraft`, `createCertificadoFormDraftFromEntity`), cascada pura (`filterSubsectoresBySectorIaf`, `reconcileSubsectorSelectionOnSectorChange`), validación unificada (`validateCertificadoFormDraft`, `validateAlcance`), reglas de Sede 0 (`isPrincipalSite`, `countMultisiteBranches`, `sortSitesWithPrincipalFirst`), fechas y vigencia (`deriveCertificateVigenciaDates`, `getFechaTipoVisual`, `getFechaTemporalStatus`).
- `src/lib/certificadoSubEntities.ts` — Resolvers, validadores y utilidades visuales de subentidades cronológicas y de contacto (`FechaDetailEntity`, `ContactoDetailEntity`, `TelefonoDetailEntity`, `EmailDetailEntity`).
- `src/lib/certificadoShareDomain.ts` — Motor puro de compartición selectiva dentro del conglomerado (`getEligibleShareTargetCertificates`, `planShareContactos`, `planShareTurnos`, `planShareProcesos` con regla binaria misma norma vs norma distinta).
- `src/lib/certificadoSharePersistence.ts` — Persistencia transaccional/compensatoria Zero-UUID de compartición selectiva y sincronización de requisitos (`fn_sync_shared_process_requisitos`).
- `src/lib/sitioShareDomain.ts` — Planificación de compartición de sitios con auto-resolución de `numero_sitio` (`resolveTargetNumeroSitioForSharedSite`) y cascada selectiva de turnos/procesos (`planShareSitiosWithCascade`).
- `src/lib/archiveGovernance.ts` — Gobernanza de archivo lógico (soft-delete), autorización (`canArchiveRecord`, `canInspectArchivedRecords`), extracción de props (`extractUniversalArchiveProps`) y render del botón archivar (`renderArchivarButtonHtml`).

### 2.2 Plantillas y Vistas (`src/views/`)
- `src/views/breadcrumbView.ts` — Barra de breadcrumbs de una sola línea (`renderBreadcrumbBar`).
- `src/views/universalTemplate.ts` — Contenedor Single Big Card del Multi View (`renderUniversalTemplate`) y tabla redimensionable `table-fixed` (`renderListViewTable`).
- `src/views/detailTemplate.ts` — Plantilla canónica Single Big Card de 3 Zonas (`renderDetailPageTemplate`) con soporte para `isCreateMode`, `customParentZoneHtml` y `customTopActionsHtml`.
- `src/views/certificadoView.ts` — Implementación maestra de Multi View (`renderCertificadoDirectory`) + Detail View unificado `'read' | 'add' | 'edit'` (`renderCertificadoDetailPage`) + 7 pestañas hijas orientadas a lista (`Sitio`, `Proceso`, `Turno`, `No Aplicables`, `Auditoría`, `Fecha`, `Contacto`).
- `src/views/certificacionView.ts` — Router de subsecciones del dominio Certificación y precedencia de resolución de subentidades (`telefono > email > contacto > fecha > turno > proceso > sitio > certificado`).
- `src/views/archiveModalView.ts` — Modal de confirmación/dependencias de archivo lógico (`renderArchiveModal`) y toast flotante no invasivo (`renderArchiveToast`).
- `src/views/shareModalView.ts` — Modal unificado de compartición selectiva en conglomerado (`contacto`, `turno`, `proceso` y `sitio` con cascada binaria en `Misma norma` vs `Norma distinta`).
- Vistas de subentidades enlazadas desde las pestañas hijas: `src/views/sitioView.ts`, `src/views/procesoView.ts` (incluyendo banner de sincronización de cláusulas entre certificados de misma norma), `src/views/turnoView.ts`, `src/views/fechaView.ts`, `src/views/contactoView.ts`, `src/views/telefonoView.ts`, `src/views/emailView.ts`.

### 2.3 Orquestación Reactiva, Hidratación y Persistencia (`src/main.ts`)
- Controladores Multi View (`getMultiViewDomainAdapter`, `bindMultiViewDirectoryControls`, `bindResizableTables`).
- Navegación contextual y breadcrumbs (`[data-nav]`, `[data-parent-nav="true"]`, `[data-breadcrumb-id]`).
- Flujo completo de `certificado`: selección (`select-cert`), apertura directa en modo Alta (`open-create-cert`), edición (`#startEditCertBtn`), cancelación (`#cancelEditCertBtn`), cascada en vivo (`certParentSectorIafSelect` → `certParentSubsectorIafSelect`), contador vivo (`#certAlcanceLiveCounter`), sincronización de etiqueta (`#certMultisitioCheckbox`), envío unificado (`#certificadoDetailForm` `submit`), toast flotante (`showFloatingToast`) y persistencia asíncrona en Supabase (`loadLiveCertificates`, `supabase.from('certificado').insert(...) / .update(...)`).

### 2.4 Base de Datos y Seguridad PostgreSQL (`public/supabase/queries/`)
- `01_creacion.sql` — DDL de `public.certificado`, subtablas y tablas puente `*_certificado_compartido`, columnas de soft-delete (`deleted_at`, `deleted_by`, `delete_reason`), RPC `get_archive_dependency_summary`, **`fn_sync_shared_process_requisitos`**, triggers **`trg_sync_req_proceso_same_norm`**, **`trg_validar_sitio_compartido`**, guardia `trg_guard_archival_*`, bloqueo físico `fn_prevent_hard_delete` y auditoría inmutable `audit_log`.
- `03_indices_optimizacion.sql` — Índices únicos parciales (`WHERE deleted_at IS NULL`, incl. tablas `*_certificado_compartido` y `procesos_por_sitio` por certificado) e índices B-Tree.
- `04_rls.sql` — `REVOKE DELETE`, políticas RLS granulares (`certificado_select`, `certificado_insert_worker`, `certificado_update_worker`, aislamiento Nivel 2 `CLIENT` en `*_certificado_compartido`) y RPC `archive_record(p_table, p_record_id, p_reason)`.

### 2.5 Suites de Pruebas Automatizadas (`node:test`)
- `src/lib/multisiteSampling.test.ts` — Contratos, factorías, cascada pura, validador unificado, Sitio 0 y vigencia.
- `src/lib/certificadoSubEntities.test.ts` — Subentidades `fecha`, `contacto`, `telefono`, `email`.
- `src/lib/certificadoShareDomain.test.ts`, `src/lib/certificadoSharePersistence.test.ts`, `src/lib/sitioShareDomain.test.ts` — Compartición binaria en conglomerado, sincronización misma norma y auto-resolución de `numero_sitio`.
- `src/lib/detailViewsPhase42.test.ts` — Renderizado unificado `read | add | edit`, Zona 1 de padres, Zona 2 de atributos, 7 pestañas hijas y precedencia en `certificacionView`.
- `src/lib/phase421DetailTemplate.test.ts` — Contratos estructurales de `detailTemplate.ts` (`isCreateMode`, `customParentZoneHtml`, `customTopActionsHtml`).
- `src/lib/phase62UiIntegrity.test.ts` — Reglas transversales de UI, Cero-UUID, tablas limpias sin botones internos y RBAC estricto.
- `src/views/certificadoView.test.ts`, `src/views/procesoView.test.ts`, `src/views/shareModalView.test.ts`, `src/views/designacionSitioView.test.ts` — Suites de vistas para marcas compartidas, banner de sincronización, modal binario y Detail View colapsable/filtrable `"Less Is More"`.

---

## 3. Checklist para Replicar este Patrón en Cualquier Nuevo Dominio

Al construir o modernizar otra tabla `X` en `programa_aud`, seguir estrictamente estas 5 etapas:

1. **Contratos y Lógica Pura (`src/lib/<dominio>.ts`):**
   - Definir `<Dominio>DetailMode = 'read' | 'add' | 'edit'`, `<Dominio>FormDraft`, `<Dominio>ViewState` y `<Dominio>ChildTab`.
   - Implementar factorías puras (`createEmpty<Dominio>FormDraft`, `create<Dominio>FormDraftFromEntity`), filtros en cascada si existen FKs dependientes, y validador unificado `validate<Dominio>FormDraft`.
   - Añadir soporte de segmento determinístico de alta en `src/lib/breadcrumb.ts` (ej. `<dom>-new`).

2. **Multi View Limpio (`src/views/<dominio>View.ts` + `renderUniversalTemplate`):**
   - Configurar `domainKey`, `tableId: '<dominio>-main'`, facetas con rest-out $S_{-k}$ y búsqueda normalizada `<input type="text">` (nunca `type="search"`).
   - Definir columnas con `defaultWidthPct` sumando `100%` y `minWidthPx`; **cero columnas de acciones** y **cero `<button>` dentro de `<tbody>`**.
   - Configurar `getRowAttrs` en `<tr>` con `data-action="select-<dom>"`.
   - Exponer botón `+` (`w-9 h-9`, solo staff aprobado) que navegue directamente al Detail View en modo `'add'`.
   - Propagar `...extractUniversalArchiveProps(archiveConfig, '<dominio>')` para `Mostrar Archivados` y `Archivo Histórico` (solo `ADMIN`).

3. **Detail View Unificado en 3 Zonas (`renderDetailPageTemplate`):**
   - Resolver el modo mediante `resolve<Dominio>DetailMode(state, isStaff, selectedItem)` garantizando que usuarios no-staff siempre obtengan `'read'`.
   - Configurar cabecera en fila única: `[←]` (`data-nav-back="true"`), ícono, `<h1>`, y a la derecha:
     - `'read'`: `[✏️]` (staff), `[🕒]`, `[🗄️]` (staff).
     - `'add'` / `'edit'`: **solo dos botones icon-only en `customTopActionsHtml`**: Guardar **primero** (`type="submit" form="<dom>DetailForm"` en `bg-emerald-600`) y Cancelar **segundo** (`type="button"` en `bg-rose-50`). **Sin botones en el pie del formulario.**
   - En `'add'` pasar `isCreateMode: true` (oculta `[🕒]`, `[🗄️]`, saltos `→` de Zona 1 y toda la Zona 3 de pestañas hijas).
   - Construir Zona 1 (`customParentZoneHtml`) con `<select form="<dom>DetailForm" required>` y botones de salto `→` (`w-5 h-5`, `data-parent-nav="true"`) visibles únicamente en `'read'`.
   - Construir Zona 2 (`customRecordBodyHtml`) con `<form id="<dom>DetailForm">` usando checkboxes booleanos sin `*` en etiqueta y estilo high-contrast `appearance-none` + SVG en modo `'read'`.
   - Mostrar errores en banner inline rojo (`bg-rose-50`) y éxitos únicamente mediante `showFloatingToast(..., 'success')` (cero banners verdes inline que desplacen el layout).

4. **Pestañas Hijas Orientadas a Lista (Zona 3):**
   - Renderizar cada pestaña mediante `renderListViewTable` con `tableId: '<dom>-tab-<subtab>'`, porcentajes sumando `100%`, ordenamiento por encabezado y clic completo en `<tr>` para navegar al detalle de la subentidad.
   - Mantener las pestañas secundarias puras (solo tabla y empty state, sin párrafos introductorios ni formularios inline redundantes).

5. **Cableado en `src/main.ts` y Verificación Estática/Pruebas:**
   - Registrar el adaptador en `getMultiViewDomainAdapter`, las reglas de breadcrumb en `applyBreadcrumbSegmentState`, listeners de cascada en vivo, contadores de texto y el submit unificado `INSERT` / `UPDATE` + `recordPhase5SessionLog` + `showFloatingToast`.
   - Validar con `npx tsx --test src/lib/*.test.ts src/views/*.test.ts`, `npm run lint` y `npm run build`, comprobando `assertZeroUuidExposure` en todos los estados renderizados.
