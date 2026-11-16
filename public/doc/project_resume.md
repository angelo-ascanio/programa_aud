# Resumen Ejecutivo y Técnico: `programa_aud`

**Google AI Studio App:** [programa_aud](https://ai.studio/apps/f5f27961-b0a4-4b29-a8c7-6153e393aa1f)  
**Repositorio GitHub:** [angasc95/programa_aud](https://github.com/angasc95/programa_aud)  
**Organización / Coordinación:** Certificación FN (`coord.operativacertificacionfn@gmail.com`)  
**Proyecto Supabase:** `ufowtgmpaahyshdxlnlq` (`https://ufowtgmpaahyshdxlnlq.supabase.co`)

---

## 1. Visión General y Estado Actual del Proyecto

`programa_aud` es una plataforma integral para la **gestión, planificación, asignación técnica, trazabilidad normativa, gobierno de retención lógica y control de hallazgos de programas y planes de auditoría de certificación**, diseñada e implementada bajo estándares internacionales:

- **ISO/IEC 17021-1:2015:** Integridad relacional de subconjunto entre certificados, sedes, turnos y procesos (validada mediante triggers en PostgreSQL); trazabilidad forense inmutable (`public.audit_log` con resolución legible de actores y regla **Zero-UUID**); competencias técnicas obligatorias (`norma` + `sector_iaf` + `subsector_iaf`); asignación obligatoria de `id_subsector_iaf` en cada certificado; declaración narrativa de alcance (`certificado.alcance`, 10–1000 caracteres); historial normalizado de fechas de certificación (`fecha_certificado`) y directorio estructurado de contactos con canales de teléfono y correo (`contacto_certificado`, `telefono_contacto_certificado`, `email_contacto_certificado`); exclusiones justificadas de cláusulas (`requisitos_no_aplicables_certificado`, Cláusula 4.3); y **Motor de Decisión de Certificación (Cláusulas 9.5/9.6)** que bloquea recomendaciones de aprobación ante No Conformidades Mayores abiertas o No Conformidades Menores sin plan de acción correctiva.
- **ISO 19011:2018 e IAF MD 1:2018:** Ciclo completo de planificación de auditorías, equipos evaluadores (`Auditor Líder`, `Auditor de Equipo`, `Experto Técnico`), metodologías (`Presencial`, `Remota`, `Mixta`), modalidades canónicas (`Etapa 1`, `Etapa 2`, `Seguimiento 1`, `Seguimiento 2`, `Renovación`, `Diagnóstico`, `Extraordinaria`, `Especial`, `Otro`), muestreo multisitio bajo la **Convención Sitio 0** (Sede Principal HQ siempre protegida en índice `0`) y ciclo de vida CAPA de hallazgos en 5 estados.
- **ISO/IEC 17011, Clasificación IAF y Catálogo Normativo Bilingüe:** Matriz cruzada entre organismos acreditadores (`ENAC`, `UKAS`, `ANAB`), normas certificables, acreditaciones y sectores IAF (`acreditacion_norma` + `acreditacion_norma_sector_iaf`), sectores IAF y sub-sectores jerárquicos con nivel de riesgo (`ALTO`, `MEDIO`, `BAJO`); además de un **catálogo normativo bilingüe (ES/EN) de 8 normas canónicas** (`2,188` cláusulas `LTREE` en `requisito` y `2,684` traducciones HTML enriquecidas en `requisito_traduccion`) con lector documental unificado (`normaFullReader.ts`), motor recursivo de expansión `{clause_...}` (`clauseRenderer.ts`) y editor bilingüe `Visual / HTML / Vista Previa` (`richTextEditor.ts`).

La plataforma se encuentra consolidada tras completar las **Fases 1.1–5.2**, la **modernización integral del dominio `certificado`**, la **estandarización unificada Multi View + Detail View (`'read' | 'add' | 'edit'`)** en todos los bloques **`Extra`** y **`Certificación`** (incluyendo layout panorámico *widescreen* `1720px` y tablas redimensionables `table-fixed`) y el **catálogo normativo bilingüe con paginación completa**: base de datos PostgreSQL/Supabase (**37 tablas**, **68 índices** incluyendo **22 índices únicos parciales**, retención **Soft-Delete en 30 tablas** con bloqueo físico en **29 tablas** + `client_organization_access`, **30 tablas habilitadas en `archive_record`**, **110 políticas RLS** + DCL), servidor Express 5 (`server.ts`), aplicación SPA TypeScript estricta (`strict: true`, `0 any`), **29 módulos de lógica pura en `src/lib/`** (+ `src/lib/generated/normasCatalogBundle.ts`), **41 vistas en `src/views/`**, **39 archivos de pruebas unitarias (`363` pruebas aprobadas en `36` suites de `node:test`)**, compilación Vite con `manualChunks` y validación responsiva en navegador real Chromium (`375×812` a `1920×1080`).

---

## 2. Arquitectura General del Sistema

```text
┌────────────────────────────────────────────────────────────────────────────┐
│  Frontend SPA (src/main.ts + 29 módulos src/lib/* + generated/* + 41 views)│
│  • TypeScript strict (0 any) + Vite 6 (manualChunks) + Tailwind CSS v4     │
│  • Contenedor panorámico widescreen (max-w-[1720px]) hasta 4 columnas      │
│  • Cabecera en 3 bloques (Auditoría | Certificación | Extra) + Mi Perfil   │
│  • Dashboard minimalista RBAC (5 métricas) sin exploradores duplicados     │
│  • Breadcrumbs compactos (1 línea, 23 tipos, elipsis, sin bucles)          │
│  • Multi View Clean List (facetas reactivas S_{-k}, col table-fixed)       │
│  • Detail View ('read'|'add'|'edit') en 3 Zonas + Toast flotante           │
│  • Lector/Editor Bilingüe ES/EN (clauseRenderer + normaFullReader + HTML)  │
│  • Hidratación paginada (>1,000 filas) + fallback normasCatalogBundle      │
│  • @supabase/supabase-js (URL + Anon Key) + peticiones HTTP a /api/*       │
└──────────────────────────┬─────────────────────────────┬───────────────────┘
                           │ REST / RPC / Auth JWT       │ HTTP (mismo origen)
                           ▼                             ▼
┌───────────────────────────────────────────┐ ┌──────────────────────────────┐
│  Supabase Cloud (PostgreSQL + GoTrue)     │ │  Express 5 (server.ts)       │
│  • GoTrue Auth v2 + Trigger profiles      │ │  • Puerto 3000 (0.0.0.0)     │
│  • PostgREST protegido por DCL + RLS      │ │  • Dev: Vite middleware      │
│  • 37 tablas + 68 índices (22 uq_active)  │ │  • Prod: dist/ + fallback    │
│  • Soft-Delete (30 tbl) + 19 guardias     │ │  • GET /api/health           │
│  • Motor LTREE (2,188 cláusulas, 2,684 tr)│ │  • POST /api/reset-db        │
│  • audit_log inmutable (31 triggers)      │ └──────────────┬───────────────┘
│  • RPCs: get_archive_dependency_summary   │                │ Management API
│          archive_record / cobertura       │                │ / pg fallback
└───────────────────────────────────────────┘                ▼
                                              public/supabase/queries/00..07.sql
```

### Evolución Arquitectónica Ejecutada

| Etapa | Alcance Ejecutado | Entregables Principales |
| :---: | :--- | :--- |
| **Fases 1.1–1.2** | Retención Soft-Delete y Endurecimiento RLS | Columnas `deleted_at`, `deleted_by`, `delete_reason`; triggers `fn_prevent_hard_delete`, `fn_sync_soft_delete_*` y `fn_guard_parent_archival`; RPCs `get_archive_dependency_summary` y `archive_record`; `REVOKE DELETE` en tablas protegidas/gobernanza (`32` tablas actuales); índices únicos parciales (`WHERE deleted_at IS NULL`); guardia `fn_protect_profile_rbac_fields` contra auto-escalamiento en `profiles`. |
| **Fases 2.1–2.2** | Shell Global en 3 Bloques, Dashboard Minimalista y `Mi Perfil` | Cabecera en 3 bloques singulares (`Auditoría`, `Certificación`, `Extra` con `Acreditación`); retiro de sub-vistas obsoletas y tarjetas duplicadas; Dashboard de 5 métricas acotadas por RBAC; vista **`Mi Perfil`** (`profileView.ts`) con bloqueo estricto de `role` y `status`. |
| **Fase 3** | Motor de Breadcrumbs Compactos | Barra de una sola línea sin bordes contenedores (`flex-nowrap`), truncamiento a 24 caracteres (`…`) y colapso intermedio (`MAX_VISIBLE_BREADCRUMBS = 4`), reseteo en cabecera (`data-nav-reset="true"`), preservación de linaje cross-domain y prevención de bucles por clave compuesta. |
| **Fases 4.1–4.2** | Plantillas Universales Multi View y Detail View en 3 Zonas | **Multi View** (`universalTemplate`): barra lateral colapsable, conteos reactivos por intersección ($S_{-k}$), buscador único `type="text"` con un solo `✕`, totalizador `Mostrando X de Y`, tablas `table-fixed` con columnas redimensionables y conmutador `Tarjetas`/`Tabla`. **Detail View** (`detailTemplate`): jerarquía limpia en 3 Zonas (`Parent Zone` → divisor → `Record Zone` → `Children Zone` en pestañas), layout panorámico `max-w-[1720px]` (`layout.ts`) y vistas de detalle **`Acreditación`**, **`Sitio`** (Sede 0 HQ), **`Proceso`** (`LTREE`) y **`Turno`**. |
| **Fases 5.1–5.2** | Archivo Seguro, Restauración Admin y Verificación Integral | Modal de archivo seguro (`archiveModalView.ts`) con bloqueo por dependencias activas y motivo (máx. 300 chars); filtro `"Mostrar Archivados"` y acción `"Restaurar"` exclusivos para `ADMIN`; toast flotante no invasivo `#archiveGovernanceToast`; suite `node:test`, `tsc --noEmit` (`0 any`), `vite build` y auditoría Chromium. |
| **Modernización `certificado`** | Normalización Relacional, Sub-entidades y Flujo Unificado `'read' \| 'add' \| 'edit'` | Adición de FK obligatoria `id_subsector_iaf` en `certificado` con cascada en vivo `Sector IAF → Sub-Sector IAF`; desacoplamiento de fechas y contactos hacia 4 tablas soft-delete (`fecha_certificado`, `contacto_certificado`, `telefono_contacto_certificado`, `email_contacto_certificado`); **5 chips padres** en `xl:grid-cols-5` y **7 pestañas de hijos** en `certificadoView.ts`; módulo `certificadoSubEntities.ts` y 4 vistas dedicadas (`fechaView.ts`, `contactoView.ts`, `telefonoView.ts`, `emailView.ts`); botones de cabecera Guardar-primero/Cancelar-segundo sin botones al pie; fallback automático Management API → `pg.Client` en `server.ts`. |
| **Estandarización `Extra` y `Certificación`** | Replicación Canónica Total (`Step 1` – `Step Final`) | Primitivos compartidos en `detailTemplate.ts` (`renderDetailFormTopActions`, `renderDetailBooleanField`, `renderDetailParentSelectCard`, `renderMultiViewAddButton`); helper `src/lib/rbac.ts`; 6 nuevas vistas de detalle (`organismoAcreditacionView.ts`, `subsectorIafView.ts`, `requisitoView.ts`, `clientAccessView.ts`, `competenciaAuditorView.ts`, `noAplicableView.ts`); módulo `noAplicableDomain.ts`; refactorización de acreditaciones en `acreditacion_norma` + `acreditacion_norma_sector_iaf`; eliminación de formularios inline, columnas `acciones` y banners verdes inline; soporte completo de `client_organization_access` en `archive_record`. |
| **Catálogo Normativo Bilingüe e Hidratación Paginada** | Traducciones HTML ES/EN, Lector Completo y Editor Enriquecido | Nueva tabla `requisito_traduccion` y columnas `explicit_code`/`external_key` en `requisito`; pipeline CSV determinista (`requisitoCsvImporter.ts` + `scripts/buildNormasSeed.ts`) generando `07_normas_requisitos_csv.sql` (`8` normas, `2,188` cláusulas, `2,684` traducciones) y `normasCatalogBundle.ts`; cursor paginado `.range(from, to)` (`paginatedHydration.ts`); motor recursivo `{clause_...}` (`clauseRenderer.ts`), lector completo de norma (`normaFullReader.ts`) con conteo `debe`/`debería`/`shall`/`should` y resaltado `<mark>`; editor bilingüe `Visual/HTML/Vista Previa` (`richTextEditor.ts` + `views/richTextEditor.ts`) con detección de ciclos. |

---

## 3. Bloques Operativos, RBAC y Gobernanza

### 3.1 Tres Bloques Operativos en la Cabecera Global (`src/views/header.ts` + `src/lib/healthCheck.ts`)

1. **Bloque 1 — `Auditoría` (`📅`):**
   - `Programación` (`#auditorias/scheduling`): Planificación de eventos, selección de equipo competente, muestreo multisitio y matriz normativa.
   - `Calendario` (`#auditorias/calendar`): Vistas Mensual, Trimestral y Línea de Tiempo Gantt con alertas de solapamiento de auditores.
   - `Resultado` (`#auditorias/findings`): Tablero Tabla/Kanban de hallazgos (`NC_MAYOR`, `NC_MENOR`, `OBSERVACION`, `OPORTUNIDAD_MEJORA`), flujo CAPA y firma del dictamen ISO/IEC 17021-1.
2. **Bloque 2 — `Certificación` (`🏛️`):**
   - `Organización` (`#certificacion/organizations`): Directorio Clean List de clientes titulares, validación de RIF/NIF, conteo estricto de certificados activos, pestaña de **`Acceso Cliente`** (`clientAccessView.ts` para gestionar `client_organization_access`) y creación/edición unificada `'read' | 'add' | 'edit'`.
   - `Certificado` (`#certificacion/certificates`): Listado limpio Multi View y ficha unificada `'read' | 'add' | 'edit'` en 3 zonas con **5 chips/selectores padres** (`Organización`, `Norma`, `Estatus`, `Sector IAF`, `Sub-Sector IAF`) y **7 pestañas de hijos** (`Sitio` con Sitio 0 HQ primero, `Proceso`, `Turno`, `No Aplicables`, `Auditoría`, `Fecha`, `Contacto`) que navegan directamente a las fichas dedicadas `'read' | 'add' | 'edit'` de `Sitio`, `Proceso`, `Turno`, `No Aplicable` (`noAplicableView.ts`), `Fecha`, `Contacto`, `Teléfono` y `Correo`.
   - `Auditor` (`#certificacion/auditors`): Directorio técnico Clean List, ficha `'read' | 'add' | 'edit'` y gestión real M:N de competencias técnicas (`competenciaAuditorView.ts`: `norma_auditor`, `sector_iaf_auditor`, `subsector_iaf_auditor` con cascada en vivo).
3. **Bloque 3 — `Extra` (`📚`):**
   - `Norma` (`#extra/standards`) con acceso directo al **Lector Completo de Norma** (`Ver Norma`) y sub-ficha jerárquica bilingüe **`Requisito LTREE`** (`requisitoView.ts` + `richTextEditor.ts`), `Sector IAF` (`#extra/iaf`) con sub-ficha **`Sub-Sector IAF`** (`subsectorIafView.ts`), `Acreditación` (`#extra/accreditations`) y directorio/ficha de **`Organismos de Acreditación`** (`#extra/organismos`, `organismoAcreditacionView.ts`), `Estatus` (`#extra/estatus`), `Tipo` (`#extra/tipos`) y `Metodología` (`#extra/metodologias`), todos estandarizados bajo Multi View Clean List y Detail View `'read' | 'add' | 'edit'`.
4. **Menú de Cuenta (esquina superior derecha):**
   - `Mi Perfil` (`#profile`): Disponible para todo usuario autenticado (`ADMIN`, `WORKER`, `AUDITOR`, `CLIENT`, incluyendo cuentas `PENDING`/`REJECTED`) para editar exclusivamente su `nombre` y contraseña, manteniendo `role` y `status` en solo lectura.
   - `Panel Aprobaciones` (`#approvals`): Gestión para `ADMIN` y consulta de solo lectura para `WORKER`.
   - `Estado DB` (`#database`): Diagnóstico de conectividad en vivo exclusivo para `ADMIN`.

### 3.2 Matriz de Roles, Soft-Delete y Control de Acceso (`04_rls.sql` + `src/lib/accessControl.ts` + `src/lib/rbac.ts` + `src/lib/archiveGovernance.ts`)

- **Autoregistro (`Sign up`):** Los usuarios `CLIENT` nacen aprobados (`APPROVED`); las solicitudes como `ADMIN`, `WORKER` o `AUDITOR` quedan en `PENDING` mediante `handle_new_user()`. Los perfiles `PENDING` (`⏳`) o `REJECTED` (`❌`) suprimen el icono de rol y solo acceden a `dashboard` y `profile` (`isApprovedStaffProfile` bloquea estrictamente cualquier mutación de cuentas no aprobadas).
- **`ADMIN` (`🛡️`):** Acceso total a los 3 bloques, `Panel Aprobaciones` (gestión de roles/estados), `Estado DB`, creación/edición en `'add' | 'edit'` (incluyendo redacción bilingüe HTML en `requisito_traduccion`), archivo seguro (`🗄️ Archivar`), filtro `"Mostrar Archivados"`, acción `"Restaurar"` (`deleted_at = NULL`) y lectura global de `audit_log`.
- **`WORKER` (`⚙️`):** Acceso a los 3 bloques, gestión operativa completa en `'add' | 'edit'` (incluyendo `Organismo`, `Requisito` + `requisito_traduccion`, `Sub-Sector`, `Acceso Cliente`, `Competencias`, `No Aplicables`, `Fecha`, `Contacto`, `Teléfono` y `Correo`), lectura de usuarios en `Panel Aprobaciones`, ejecución de archivo seguro vía `archive_record` cuando no existen dependencias activas (sin acceso a `"Mostrar Archivados"` ni `"Restaurar"`) y lectura de `audit_log`.
- **`AUDITOR` (`📋`):** Visibilidad acotada a bloques **`Auditoría`** y **`Extra`** en modo estricto `'read'` (sin acceso al menú `Certificación`); lectura de organizaciones, certificados, fechas, contactos, teléfonos, correos, sitios y procesos asociados a sus auditorías asignadas; lectura completa de normas y traducciones ES/EN; mutación de matriz normativa, hallazgos y recomendación ISO 17021-1 únicamente en auditorías donde participa en `equipo_auditor` (`canMutateAuditExecution`), más consulta acotada de `audit_log`. Sin permisos de archivo.
- **`CLIENT` (`🏢`):** Acceso de solo lectura (`'read'`) a los 3 bloques acotado a organizaciones aprobadas en `client_organization_access`, sus certificados, fechas, contactos, canales, sitios, procesos, auditorías, hallazgos y catálogo normativo público (sin acceso a `equipo_auditor`, `audit_log`, archivo seguro ni mutaciones).

---

## 4. Documentación Técnica Detallada

| Documento | Contenido Técnico Cubierto |
| :--- | :--- |
| [`database_architecture.md`](architecture/database_architecture.md) | Scripts SQL (`00`–`07`), extensiones (`uuid-ossp`, `ltree`), ENUMs, `handle_new_user`, catálogo de **37 tablas** (incluyendo `requisito_traduccion`, `acreditacion_norma`, `acreditacion_norma_sector_iaf`, `fecha_certificado`, `contacto_certificado`, `telefono_contacto_certificado` y `email_contacto_certificado`), arquitectura **Soft-Delete (29 tablas con `fn_prevent_hard_delete`, 30 tablas con sincronización de metadatos y `archive_record`)**, `get_archive_dependency_summary` y `fn_guard_parent_archival` en **19 tablas padre**, guardia `fn_protect_profile_rbac_fields`, triggers ISO 17021-1, `audit_log` inmutable (**31 triggers de auditoría**), **25 triggers `updated_at`** (**141 triggers totales en `01_creacion.sql`**), motor `LTREE`, **68 índices** (**22 únicos parciales** + **46 `GiST`/`GIN`/`B-tree`**) y siembra CSV (`8` normas, `2,188` cláusulas, `2,684` traducciones). |
| [`backend_api_security.md`](architecture/backend_api_security.md) | Servidor Express 5 (`server.ts`), endpoints `/api/health` y `/api/reset-db` (`00`–`07.sql`) con fallback automático Management API → `pg.Client`, inyección de entorno (`vite.config.ts`), aislamiento de secretos, DCL (`REVOKE DELETE` en **32 tablas**), 7 funciones auxiliares `SECURITY DEFINER`, RPC `archive_record` (**30 tablas**, incluyendo `requisito_traduccion`, `acreditacion_norma_sector_iaf` y `client_organization_access`), bloqueo anti-escalamiento en `profiles` y matriz de **110 políticas RLS** en las **37 tablas**. |
| [`frontend_architecture.md`](architecture/frontend_architecture.md) | Estado `AppState` (`src/main.ts`), hidratación paginada (`paginatedHydration.ts`), fallback offline `normasCatalogBundle.ts`, enrutamiento hash SPA, cabecera en 3 bloques, layout panorámico `max-w-[1720px]`, Dashboard minimalista, vista `Mi Perfil`, motor de breadcrumbs compactos (23 tipos), plantilla universal Multi View Clean List (facetas reactivas $S_{-k}$, `table-fixed`), fichas de detalle unificadas `'read' | 'add' | 'edit'` en 3 Zonas, motor documental bilingüe (`clauseRenderer.ts` Reglas 1–3), Lector Completo de Norma (`normaFullReader.ts`), Editor Enriquecido `Visual/HTML/Vista Previa` (`richTextEditor.ts`), modal de archivo seguro + toast `#archiveGovernanceToast` e inventario completo de **29 módulos en `src/lib/`** (+ `generated/`) y **41 vistas en `src/views/`**. |
| [`testing_and_operations.md`](architecture/testing_and_operations.md) | **39 archivos de pruebas (`363` pruebas aprobadas en `36` suites `node:test`)**, verificación `tsc --noEmit` (`0 any`), compilación Vite con `manualChunks` (`116` módulos), verificación responsiva Chromium (`375×812` a `1920×1080`), cuentas de prueba, pipeline CSV (`buildNormasSeed.ts`) y despliegue en producción. |

---

## 5. Estructura del Proyecto

```text
├── .env.example                             # Plantilla de variables de entorno
├── index.html                               # Punto de entrada HTML5
├── metadata.json                            # Metadatos del proyecto AI Studio
├── package.json                             # Scripts (dev, build, start, lint, test)
├── server.ts                                # Servidor Express 5 + Vite middleware + /api/*
├── supabase.config.json                     # Configuración base Supabase (URL + Anon Key)
├── tsconfig.json                            # Configuración TypeScript (strict: true)
├── vite.config.ts                           # Vite 6 + @tailwindcss/vite + manualChunks
├── scripts/
│   └── buildNormasSeed.ts                   # Generador determinista de 07_normas_requisitos_csv.sql + bundle TS
├── src/
│   ├── index.css                            # Tailwind CSS v4 y tipografías
│   ├── main.ts                              # Estado global, rutas SPA, hidratación paginada y eventos
│   ├── lib/                                 # 29 módulos de lógica pura + generated/ + 39 archivos *.test.ts
│   │   └── generated/
│   │       └── normasCatalogBundle.ts       # Respaldo offline/embebido (8 normas, 2,188 cláusulas, 2,684 tr.)
│   └── views/                               # 41 módulos de vistas HTML declarativas
└── public/
    ├── certificado/                         # Receta arquitectónica canónica Multi/Detail View
    ├── doc/                                 # Documentación técnica sincronizada del proyecto
    ├── requisitos/                          # CSV fuente Odoo (standard.clause.csv, standard.clause.translation.csv)
    ├── roadmap/                             # Plan modular de estandarización (Steps 1..Final)
    └── supabase/queries/                    # Scripts SQL 00_delete_tables.sql .. 07_normas_requisitos_csv.sql
```

---

## 6. Inicio Rápido y Despliegue

- **Desarrollo:** `npm run dev` (Express 5 + Vite middleware en `http://0.0.0.0:3000`, `hmr: false`).
- **Pruebas y Calidad:** `npm run lint` (`tsc --noEmit`), `npm test` (`npx tsx --test src/lib/*.test.ts`) y `npm run build` (`vite build`).
- **Producción:** `npm run build && npm start` (`node server.ts` sirviendo `dist/` y `/api/*`).
- **Cuentas de prueba (`Password123*`):** `admin@fondonorma.test`, `worker@fondonorma.test`, `auditor@fondonorma.test`, `client@fondonorma.test`.
