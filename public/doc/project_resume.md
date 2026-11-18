# Resumen Ejecutivo y Técnico: `programa_aud`

**Google AI Studio App:** [programa_aud](https://ai.studio/apps/f5f27961-b0a4-4b29-a8c7-6153e393aa1f)  
**Repositorio GitHub:** [angasc95/programa_aud](https://github.com/angasc95/programa_aud)  
**Organización / Coordinación:** Certificación FN (`coord.operativacertificacionfn@gmail.com`)  
**Proyecto Supabase:** `ufowtgmpaahyshdxlnlq` (`https://ufowtgmpaahyshdxlnlq.supabase.co`)

---

## 1. Visión General y Estado Actual del Proyecto

`programa_aud` es una plataforma integral para la **gestión, programación multientidad, asignación técnica de equipos, trazabilidad normativa, gobierno de retención lógica y control de hallazgos de programas y planes de auditoría de certificación**, diseñada e implementada bajo estándares internacionales:

- **ISO/IEC 17021-1:2015:** Integridad relacional de subconjunto entre certificados, sedes, turnos, `procesos_por_sitio` y ejecuciones de auditoría (validada mediante triggers en PostgreSQL); trazabilidad forense inmutable (`public.audit_log` con resolución legible de actores y regla **Zero-UUID**); competencias técnicas obligatorias (`norma` + `sector_iaf` + `subsector_iaf`) y verificación de rotación de Auditor Líder; asignación obligatoria de `id_subsector_iaf` en cada certificado; declaración narrativa de alcance (`certificado.alcance`, 10–1000 caracteres); historial normalizado de fechas de certificación (`fecha_certificado`) y directorio estructurado de contactos con teléfonos y correos (`contacto_certificado`, `telefono_contacto_certificado`, `email_contacto_certificado`); exclusiones justificadas de cláusulas (`requisitos_no_aplicables_certificado`, Cláusula 4.3) con **Mutación Inteligente atómica**; **Motor Jerárquico de Cobertura Normativa (`LTREE`)** con clasificación `es_obligatorio` (`1,673` obligatorias / `515` informativas); y **Motor de Decisión de Certificación (Cláusulas 9.5/9.6)** que bloquea recomendaciones de aprobación ante No Conformidades Mayores abiertas o No Conformidades Menores sin plan de acción correctiva.
- **ISO 19011:2018 e IAF MD 1:2018:** Arquitectura de **Programas de Auditoría en 2 Pasos** (`programa_auditoria` → `auditoria` → `auditoria_fecha` 1:N) con vinculación `INDIVIDUAL`, `NIVEL_1_INTRA_ORG` y `NIVEL_2_INTER_ORG` (7 naturalezas: `Individual`, `Combinada`, `Integrada`, `Conjunta`, `Simultánea`, `Multientidad`, `Mixta`) y herencia histórica de ciclos (`id_ciclo_origen`); balanceo de días-auditor con precisión **`0.25d`** bajo modelo **Dual-Bucket** (`Cubo 1` equipo por sitio vs `Cubo 2` evaluadores de proceso); calendario unificado (**Calendario Mes/Trimestre/Gantt**, **Tarjetas** y **Tabla**) con cronología `PREPROGRAMADA_MES` / `REAL` / `Reprog. #N` y motor configurable de alertas (`configuracion_alerta_auditoria`); muestreo multisitio bajo la **Convención Sitio 0** (Sede Principal HQ siempre protegida en índice `0`) con catálogo maestro `procesos_por_sitio`; y ciclo de vida CAPA de hallazgos en 5 estados.
- **ISO/IEC 17011, Clasificación IAF y Catálogo Normativo Bilingüe:** Matriz cruzada entre organismos acreditadores (`ENAC`, `UKAS`, `ANAB`), normas certificables, acreditaciones y sectores IAF (`acreditacion_norma` + `acreditacion_norma_sector_iaf`), sectores IAF y sub-sectores jerárquicos con nivel de riesgo (`ALTO`, `MEDIO`, `BAJO`); además de un **catálogo normativo bilingüe (ES/EN) de 8 normas canónicas** (`2,188` cláusulas `LTREE` en `requisito` con `1,673` obligatorias y `515` informativas, y `2,684` traducciones HTML enriquecidas en `requisito_traduccion`) con lector documental unificado (`normaFullReader.ts`), motor recursivo de expansión `{clause_...}` (`clauseRenderer.ts`) y editor bilingüe `Visual / HTML / Vista Previa` (`richTextEditor.ts`) con autocompletado `{` y navegador compacto de hermanas/sub-cláusulas directas.

La plataforma se encuentra consolidada tras completar todas las fases evolutivas y el cierre integral del **Bloque 1 (`Auditoría`) e infraestructura `Procesos del Sitio`**: base de datos PostgreSQL/Supabase (**44 tablas**, **90 índices** en `03_indices_optimizacion.sql` con **33 únicos parciales** y **77 parciales `WHERE deleted_at IS NULL`** / **135 índices vivos**, **182 triggers vivos**, retención **Soft-Delete en 37 tablas** con bloqueo físico en **36 tablas** y **`REVOKE DELETE` en 39 tablas**, **37 tablas habilitadas en `archive_record`**, **23 padres protegidos**, **131 políticas RLS** + DCL), servidor Express 5 (`server.ts`), aplicación SPA TypeScript estricta (`strict: true`, `0 any`), **33 módulos de lógica pura en `src/lib/`** (+ `src/lib/generated/normasCatalogBundle.ts`), **43 vistas en `src/views/`**, **47 archivos de pruebas unitarias (`438` pruebas aprobadas en `36` suites de `node:test`)**, compilación Vite `6.4.6` con `manualChunks` (**122 módulos**) y validación responsiva end-to-end en navegador real Chromium (`390×844` móvil y `1440×900` escritorio) para los **4 roles (`ADMIN`, `WORKER`, `AUDITOR`, `CLIENT`)**, incluyendo aislamiento estricto **Nivel 2 Inter-Org** para `CLIENT`.

---

## 2. Arquitectura General del Sistema

```text
┌────────────────────────────────────────────────────────────────────────────┐
│  Frontend SPA (src/main.ts 28,234 l. + 33 src/lib/* + generated + 43 views)│
│  • TypeScript strict (0 any) + Vite 6 (manualChunks, 122 módulos)          │
│  • Contenedor panorámico widescreen (max-w-[1720px]) hasta 4 columnas      │
│  • Cabecera en 3 bloques (Auditoría | Certificación | Extra) + Mi Perfil   │
│  • Dashboard minimalista RBAC (5 métricas) sin exploradores duplicados     │
│  • Breadcrumbs compactos (1 línea, 26 tipos, elipsis, sin bucles)          │
│  • Multi View Clean List (facetas reactivas S_{-k}, col table-fixed)       │
│  • Planificador 2 Pasos (Campaña/Fechas 1:N + HUD Dual-Bucket + Árbol)     │
│  • Calendario 3 Modos (Calendario Mes/Trim/Gantt | Tarjetas | Tabla) +     │
│    Alertas Configurables + Detector "Certificados Sin Programación"        │
│  • Certificado: Coverage HUD + Mapa de Cobertura + Sitio → Procesos Sitio  │
│  • Lector/Editor Bilingüe ES/EN (autocompletado { + nav hermanas/hijas)    │
│  • Hidratación paginada (>1,000 filas) + fallback normasCatalogBundle      │
└──────────────────────────┬─────────────────────────────┬───────────────────┘
                           │ REST / RPC / Auth JWT       │ HTTP (mismo origen)
                           ▼                             ▼
┌───────────────────────────────────────────┐ ┌──────────────────────────────┐
│  Supabase Cloud (PostgreSQL + GoTrue)     │ │  Express 5 (server.ts)       │
│  • GoTrue Auth v2 + Trigger profiles      │ │  • Puerto 3000 (0.0.0.0)     │
│  • PostgREST protegido por DCL + RLS      │ │  • Dev: Vite middleware      │
│  • 44 tablas + 90 índices 03 (135 vivos)  │ │  • Prod: dist/ + fallback    │
│  • 182 triggers vivos (Soft-Delete +      │ │  • GET /api/health           │
│    Programa/Fechas + Sitio-Proceso + 4.3) │ │  • POST /api/reset-db        │
│  • Motor LTREE (2,188 cl. / 1,673 oblig.) │ └──────────────┬───────────────┘
│  • audit_log inmutable (38 triggers)      │                │ Management API
│  • RPCs: get_archive_dependency_summary   │                │ / pg fallback
│          archive_record (37 tablas)       │                ▼
│          declarar_no_aplicable_con_mutacion│ public/supabase/queries/00..07.sql
│          evaluar/resumen_cobertura        │
└───────────────────────────────────────────┘
```

### Evolución Arquitectónica Ejecutada

| Etapa | Alcance Ejecutado | Entregables Principales |
| :---: | :--- | :--- |
| **Fases 1.1–1.2** | Retención Soft-Delete y Endurecimiento RLS | Columnas `deleted_at`, `deleted_by`, `delete_reason`; triggers `fn_prevent_hard_delete`, `fn_sync_soft_delete_*` y `fn_guard_parent_archival`; RPCs `get_archive_dependency_summary` y `archive_record`; `REVOKE DELETE` en tablas protegidas/gobernanza; índices únicos parciales (`WHERE deleted_at IS NULL`); guardia `fn_protect_profile_rbac_fields` contra auto-escalamiento en `profiles`. |
| **Fases 2.1–2.2** | Shell Global en 3 Bloques, Dashboard Minimalista y `Mi Perfil` | Cabecera en 3 bloques singulares (`Auditoría`, `Certificación`, `Extra`); Dashboard de 5 métricas acotadas por RBAC; vista **`Mi Perfil`** (`profileView.ts`) con bloqueo estricto de `role` y `status`. |
| **Fase 3** | Motor de Breadcrumbs Compactos | Barra de una sola línea sin bordes (`flex-nowrap`), truncamiento a 24 caracteres (`…`) y colapso intermedio (`MAX_VISIBLE_BREADCRUMBS = 4`), reseteo en cabecera (`data-nav-reset="true"`), soporte para **26 tipos de entidad** y prevención de bucles por clave compuesta. |
| **Fases 4.1–5.2** | Multi View Clean List, Detail View y Archivo Seguro | **Multi View** (`universalTemplate`): barra lateral colapsable, conteos reactivos ($S_{-k}$), buscador único `type="text"` con un solo `✕`, totalizador `Mostrando X de Y`, tablas `table-fixed` con `<colgroup>` 100%, conmutador `Tarjetas`/`Tabla`, modal de archivo seguro (`archiveModalView.ts`), filtro `"Mostrar Archivados"` y `"Restaurar"` exclusivos para `ADMIN`, y toast flotante `#archiveGovernanceToast`. |
| **Modernización `certificado`, `Extra` y `Certificación`** | Normalización Relacional y Ficha Unificada `'read' \| 'add' \| 'edit'` | FK obligatoria `id_subsector_iaf` en `certificado`; 4 sub-entidades (`fecha_certificado`, `contacto_certificado`, `telefono_contacto_certificado`, `email_contacto_certificado`); **5 chips padres** (`xl:grid-cols-5`) y **7 pestañas** en `certificadoView.ts`; refactorización `acreditacion_norma` + `acreditacion_norma_sector_iaf`; y estandarización `'read' \| 'add' \| 'edit'` en `organismoAcreditacionView.ts`, `subsectorIafView.ts`, `requisitoView.ts`, `clientAccessView.ts`, `competenciaAuditorView.ts`, `noAplicableView.ts`. |
| **Catálogo Normativo Bilingüe y Cobertura LTREE** | Traducciones ES/EN, Editor `{clause_...}` y Smart Mutation | Tabla `requisito_traduccion` y `es_obligatorio`/`obligatorio_origen`; pipeline CSV determinista (`07_normas_requisitos_csv.sql` + `normasCatalogBundle.ts`); paginación `.range()` (`paginatedHydration.ts`); lector completo (`normaFullReader.ts`), editor bilingüe (`richTextEditor.ts`) con autocompletado `{` y navegador compacto hermanas/hijas; motor descendente `LTREE` + **Coverage HUD** + **Mapa de Cobertura** (`coverageEngine.ts`) + selector batch `LTREE` (`procesoView.ts`) + RPC `declarar_no_aplicable_con_mutacion`. |
| **Reconstrucción Bloque 1 (`Auditoría`) e Infraestructura `Procesos del Sitio`** | Programas 1:N, Fechas 1:N, Dual-Bucket `0.25d`, Árbol Paso 2, Calendario 3 Modos y Aislamiento Nivel 2 | Nuevas tablas **`procesos_por_sitio`**, **`programa_auditoria`**, **`auditoria_fecha`**, **`configuracion_alerta_auditoria`**, **`turnos_proceso_sitio_auditoria`**, **`equipo_auditor_sitio`** y **`equipo_auditor_proceso_sitio`**; retiro de `auditoria.fecha_programacion`/`fecha_reprogramacion` y migración a `auditoria_fecha` 1:N (`PREPROGRAMADA_MES` vs `REAL`); triggers de integridad de programa, subconjunto sitio-proceso y auto-sincronización hacia `equipo_auditor`; aislamiento RLS Nivel 2 Inter-Org para `CLIENT`; pestaña **`Procesos del Sitio`** en `sitioView.ts`; motores puros `auditPlanningEngine.ts`, `auditAlertsEngine.ts`, `auditPlanningPersistence.ts`; vistas `auditPlannerView.ts` (Historial de Ciclos, **HUD Dual-Bucket `Cubo 1`/`Cubo 2`**, **Árbol Acordeón Sitio → Proceso → Turno → Auditor 0.25d**) y `sitioAuditoriaView.ts`; renovación de `programacionView.ts` (con `"Certificados Sin Programación"`) y `calendarioView.ts` (**3 modos `Calendario \| Tarjetas \| Tabla`**, Mes/Trimestre/Timeline y modal `"⚙ Configurar Alertas"`). |

---

## 3. Bloques Operativos, RBAC y Gobernanza

### 3.1 Tres Bloques Operativos en la Cabecera Global (`src/views/header.ts` + `src/lib/healthCheck.ts`)

1. **Bloque 1 — `Auditoría` (`📅`):**
   - `Programación` (`#auditorias/scheduling`): Multi View (`Tarjetas | Tabla` + `"Mostrar Archivados"` solo `ADMIN`) con **drawer/filtro `"Certificados Sin Programación"`** (desglose `Activo` / `Estudio`), alta y edición en **2 Pasos**: **Paso 1** (Campaña `programa_auditoria`, nivel `INDIVIDUAL`/`NIVEL_1_INTRA_ORG`/`NIVEL_2_INTER_ORG`, naturaleza, ciclo origen, certificados vinculados con `tiempo_auditoria` en pasos de `0.25d` y fechas `auditoria_fecha` 1:N) y **Paso 2** (Panel Histórico de Ciclos con rotación de Auditor Líder, **HUD Analítico Dual-Bucket** y **Árbol Acordeón** `Sitio → Procesos del Sitio → Turnos 1..N → Auditores + Días 0.25d`), además de sub-ficha `sitioAuditoriaView.ts`.
   - `Calendario` (`#auditorias/calendar`): **3 modos de visualización** (`Calendario` con sub-vistas **Mes**, **Trimestre** y **Línea de Tiempo / Gantt**, `Tarjetas` y `Tabla` `table-fixed`), mostrando eventos `PREPROGRAMADA_MES`, `REAL` y `Reprog. #N`, panel de **Alertas** (atrasadas, próximas, preprogramadas sin confirmar, conflictos de auditor, desfase de días/span y rotación de Auditor Líder) y modal **`⚙ Configurar Alertas`** persistido en `configuracion_alerta_auditoria` (exclusivo `ADMIN`/`WORKER`).
   - `Resultado` (`#auditorias/findings`): Tablero Tabla (`table-fixed` sin botones en `<td>`) / Kanban de hallazgos (`NC_MAYOR`, `NC_MENOR`, `OBSERVACION`, `OPORTUNIDAD_MEJORA`), flujo CAPA en 5 estados y motor de recomendación ISO/IEC 17021-1.
2. **Bloque 2 — `Certificación` (`🏛️`):**
   - `Organización` (`#certificacion/organizations`): Directorio Clean List, pestaña **`Acceso Cliente`** (`clientAccessView.ts`) y creación/edición `'read' | 'add' | 'edit'`.
   - `Certificado` (`#certificacion/certificates`): Directorio Clean List de 6 columnas y ficha `'read' | 'add' | 'edit'` con **5 chips padres**, **Coverage HUD + Mapa de Cobertura**, y **7 pestañas de hijos** (`Sitio` con Sitio 0 HQ y sub-pestaña **`Procesos del Sitio`** `procesos_por_sitio`, `Proceso` con selector batch `LTREE`, `Turno`, `No Aplicables` con Smart Mutation, `Auditoría`, `Fecha`, `Contacto` con teléfonos/correos).
   - `Auditor` (`#certificacion/auditors`): Directorio técnico Clean List, ficha `'read' | 'add' | 'edit'` y gestión real M:N de competencias técnicas (`competenciaAuditorView.ts`).
3. **Bloque 3 — `Extra` (`📚`):**
   - `Norma` (`#extra/standards`) con **Lector Completo de Norma** (`Ver Norma`) y sub-ficha bilingüe **`Requisito LTREE`** (`requisitoView.ts` + `richTextEditor.ts` sin botón `Ir a Norma` ni ruta `LTREE` expuesta), `Sector IAF` (`#extra/iaf`) + **`Sub-Sector IAF`**, `Acreditación` (`#extra/accreditations`) + **`Organismos de Acreditación`**, `Estatus`, `Tipo` y `Metodología`.
4. **Menú de Cuenta:** `Mi Perfil` (`#profile`), `Panel Aprobaciones` (`#approvals` para `ADMIN` y lectura `WORKER`) y `Estado DB` (`#database` exclusivo `ADMIN`).

### 3.2 Matriz de Roles, Soft-Delete y Aislamiento Nivel 2 (`04_rls.sql` + `src/lib/accessControl.ts` + `src/lib/rbac.ts`)

- **Autoregistro (`Sign up`):** `CLIENT` nace `APPROVED`; `ADMIN`, `WORKER` y `AUDITOR` quedan en `PENDING` (`handle_new_user()`). Cuentas `PENDING`/`REJECTED` suprimen el icono de rol y solo acceden a `dashboard` y `profile`.
- **`ADMIN` (`🛡️`):** Control total de los 3 bloques, `Panel Aprobaciones`, `Estado DB`, Reset DB (`00`–`07.sql`), configuración global de alertas, edición en ambos pasos de `Programación`, `🗄️ Archivar`, `"Mostrar Archivados"`, `"Restaurar"` (`deleted_at = NULL`) y lectura global de `audit_log`.
- **`WORKER` (`⚙️`):** Gestión operativa completa en `'add' | 'edit'` en los 3 bloques (incluyendo campañas, fechas 1:N, planificación Dual-Bucket, **`⚙ Configurar Alertas`**, `Procesos del Sitio`, `No Aplicables` con Smart Mutation y traducciones ES/EN), archivo seguro sin dependencias (`archive_record`), lectura de `Panel Aprobaciones` y `audit_log` (sin acceso a `Estado DB`, `"Mostrar Archivados"` ni `"Restaurar"`).
- **`AUDITOR` (`📋`):** Bloques **`Auditoría`** y **`Extra`** en solo lectura (sin acceso al menú `Certificación` ni a `"⚙ Configurar Alertas"`); en `Programación` y `Calendario` visualiza únicamente las campañas/certificados donde participa en `equipo_auditor` (incluyendo sincronización automática desde `equipo_auditor_sitio` y `equipo_auditor_proceso_sitio`) con Paso 1 y Paso 2 en modo estrictamente solo-lectura (`0` controles habilitados); muta únicamente matriz normativa, hallazgos y recomendación ISO 17021-1 en sus auditorías asignadas.
- **`CLIENT` (`🏢`):** Lectura estricta acotada por `has_client_org_access()` (`client_organization_access` `APPROVED`), incluyendo **aislamiento Nivel 2 Inter-Org**: en campañas multientidad (`NIVEL_2_INTER_ORG`, ej. `PROG-2026-002`), un `CLIENT` visualiza la cabecera de la campaña pero **únicamente sus propias organizaciones/certificados, fechas, sitios, procesos, turnos, hallazgos y comentarios**, con cero filtración de organizaciones coparticipantes ni del detalle interno de `equipo_auditor` (`audit_log`, archivo seguro y mutaciones bloqueados).

---

## 4. Documentación Técnica Detallada

| Documento | Contenido Técnico Cubierto |
| :--- | :--- |
| [`database_architecture.md`](architecture/database_architecture.md) | Scripts SQL (`00`–`07`), extensiones (`uuid-ossp`, `ltree`), ENUMs, `handle_new_user`, catálogo de **44 tablas** (incluyendo `programa_auditoria`, `auditoria_fecha`, `configuracion_alerta_auditoria`, `procesos_por_sitio`, `turnos_proceso_sitio_auditoria`, `equipo_auditor_sitio`, `equipo_auditor_proceso_sitio`), **Soft-Delete en 37 tablas** (`36` con `fn_prevent_hard_delete`, `37` sincronizadas y habilitadas en `archive_record`), `23` padres protegidos en `get_archive_dependency_summary`/`fn_guard_parent_archival`, **182 triggers vivos** (`38` de `audit_log`, `31` `updated_at`, integridad programa/fechas 1:N, `Procesos del Sitio`, auto-sincronización `equipo_auditor`, guardias ISO 4.3), motor `LTREE`, **90 índices en `03`** (**33 únicos parciales** / **77 parciales**) y siembra CSV (`5,261` líneas, `8` normas, `2,188` cláusulas, `2,684` traducciones). |
| [`backend_api_security.md`](architecture/backend_api_security.md) | Servidor Express 5 (`server.ts`), `/api/health` y `/api/reset-db` (`00`–`07.sql`) con fallback Management API → `pg.Client`, `vite.config.ts`, aislamiento de secretos, DCL (`REVOKE DELETE` en **39 tablas** + `REVOKE EXECUTE` sobre `PUBLIC`/`anon`), 7 funciones `SECURITY DEFINER`, RPCs `archive_record` (**37 tablas**) y `declarar_no_aplicable_con_mutacion`, protección anti-escalamiento en `profiles` y matriz de **131 políticas RLS** en **44 tablas** (incluyendo aislamiento Nivel 2 `CLIENT`). |
| [`frontend_architecture.md`](architecture/frontend_architecture.md) | Estado `AppState` (`src/main.ts`, `28,234` líneas), hidratación paginada, fallback `normasCatalogBundle.ts`, enrutamiento SPA, shell 3 bloques, `max-w-[1720px]`, Dashboard 5 métricas, `Mi Perfil`, breadcrumbs (**26 tipos**), Multi View Clean List (`table-fixed`), Detail View `'read' | 'add' | 'edit'`, **Planificador 2 Pasos** (`auditPlannerView.ts`, `programacionView.ts`, `sitioAuditoriaView.ts`), **Calendario 3 Modos + Alertas** (`calendarioView.ts`, `auditAlertsEngine.ts`), **Procesos del Sitio** (`sitioView.ts`), **Coverage HUD + Smart Mutation**, lector/editor bilingüe ES/EN e inventario de **33 módulos en `src/lib/`** (+ `generated/`) y **43 vistas en `src/views/`**. |
| [`testing_and_operations.md`](architecture/testing_and_operations.md) | **47 archivos de pruebas (`438` pruebas aprobadas en `36` suites `node:test`)**, `tsc --noEmit` (`0 any`), compilación Vite `6.4.6` (`manualChunks`, **122 módulos**), verificación Chromium en vivo (`390×844` y `1440×900`) sobre los **4 roles (`ADMIN`, `WORKER`, `AUDITOR`, `CLIENT`)**, cuentas de prueba, pipeline CSV y operación en producción. |

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
│   ├── main.ts                              # Estado global (28,234 líneas), rutas SPA, hidratación y eventos
│   ├── lib/                                 # 33 módulos de lógica pura + generated/ + 47 archivos *.test.ts
│   │   └── generated/
│   │       └── normasCatalogBundle.ts       # Respaldo offline/embebido (8 normas, 2,188 cláusulas, 2,684 tr.)
│   └── views/                               # 43 módulos de vistas HTML declarativas
└── public/
    ├── certificado/                         # Receta arquitectónica canónica Multi/Detail View
    ├── doc/                                 # Documentación técnica sincronizada del proyecto
    ├── requisitos/                          # CSV fuente Odoo (standard.clause.csv, standard.clause.translation.csv)
    ├── roadmap/                             # Plan modular de estandarización, cobertura y Bloque 1
    └── supabase/queries/                    # Scripts SQL 00_delete_tables.sql .. 07_normas_requisitos_csv.sql
```

---

## 6. Inicio Rápido y Despliegue

- **Desarrollo:** `npm run dev` (Express 5 + Vite middleware en `http://0.0.0.0:3000`, `hmr: false`).
- **Pruebas y Calidad:** `npm run lint` (`tsc --noEmit`), `npm test` (`npx tsx --test src/lib/*.test.ts`) y `npm run build` (`vite build`).
- **Producción:** `npm run build && npm start` (`node server.ts` sirviendo `dist/` y `/api/*`).
- **Cuentas de prueba (`Password123*`):** `admin@fondonorma.test`, `worker@fondonorma.test`, `auditor@fondonorma.test`, `client@fondonorma.test`.
