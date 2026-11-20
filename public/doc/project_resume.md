# Resumen Ejecutivo y Técnico: `programa_aud`

**Google AI Studio App:** [programa_aud](https://ai.studio/apps/f5f27961-b0a4-4b29-a8c7-6153e393aa1f)  
**Repositorio GitHub:** [angasc95/programa_aud](https://github.com/angasc95/programa_aud)  
**Organización / Coordinación:** Certificación FN (`coord.operativacertificacionfn@gmail.com`)  
**Proyecto Supabase:** `ufowtgmpaahyshdxlnlq` (`https://ufowtgmpaahyshdxlnlq.supabase.co`)

---

## 1. Visión General y Estado Actual del Proyecto

`programa_aud` es una plataforma integral para la **gestión, programación multientidad, asignación técnica de equipos, trazabilidad normativa, gobierno de retención lógica y control de hallazgos de programas y planes de auditoría de certificación**, diseñada e implementada bajo estándares internacionales:

- **ISO/IEC 17021-1:2015:** Integridad relacional de subconjunto entre certificados, sedes, turnos, `procesos_por_sitio` y ejecuciones de auditoría (validada mediante triggers en PostgreSQL); trazabilidad forense inmutable (`public.audit_log` con resolución legible de actores y regla **Zero-UUID**); competencias técnicas obligatorias (`norma` + `sector_iaf` + `subsector_iaf`) y verificación de rotación de Auditor Líder; asignación obligatoria de `id_subsector_iaf` en cada certificado; declaración narrativa de alcance (`certificado.alcance`, 10–1000 caracteres); historial normalizado de fechas de certificación (`fecha_certificado`) y directorio estructurado de contactos con teléfonos y correos (`contacto_certificado`, `telefono_contacto_certificado`, `email_contacto_certificado`); exclusiones justificadas de cláusulas (`requisitos_no_aplicables_certificado`, Cláusula 4.3) con **Mutación Inteligente atómica**; **Motor Jerárquico de Cobertura Normativa (`LTREE`)** con clasificación `es_obligatorio` (`1,673` obligatorias / `515` informativas); y **Motor de Decisión de Certificación (Cláusulas 9.5/9.6)** que bloquea recomendaciones de aprobación ante No Conformidades Mayores abiertas o No Conformidades Menores sin plan de acción correctiva.
- **ISO 19011:2018 e IAF MD 1:2018:** Arquitectura de **Pipeline Operativo en 11 Pasos (`Paso 1 Conglomerado → Paso 2 Vínculo → Paso 3–5 Designación {Tipo, Sitio, Temporal} → Paso 6 Tiempo → Paso 7 Asignación → Paso 8 Programa {8A Procesos, 8B Turnos} → Paso 9 Calendario → Paso 10 Resultado → Paso 11 Revisión`)** sobre `grupo_empresarial` → `vinculo` → `programa_auditoria` → `auditoria` → `auditoria_fecha` 1:N (`PREPROGRAMADA_MES` | `PROGRAMADA_EXACTA` | `REAL`), con vinculación `INDIVIDUAL`, `NIVEL_1_INTRA_ORG` y `NIVEL_2_INTER_ORG` (7 naturalezas: `Individual`, `Combinada`, `Integrada`, `Conjunta`, `Simultánea`, `Multientidad`, `Mixta`), sitios temporales (`auditoria_sitio_temporal`) y herencia histórica de ciclos (`id_ciclo_origen`); balanceo de días-auditor con precisión **`0.25d`** bajo modelo **Dual-Bucket** (`Cubo 1` sitio/temporal vs `Cubo 2` evaluadores de proceso); calendario unificado (**Año / Trimestre Q1–Q4 / Mes / Timeline**, **Tarjetas** y **Tabla**) con badge de etapa de 1 palabra y motor configurable de alertas (`configuracion_alerta_auditoria` incl. plazos NC `+15d`/`+60d`); muestreo multisitio bajo la **Convención Sitio 0** (Sede Principal HQ siempre protegida en índice `0`) con catálogo maestro `procesos_por_sitio`; cierre formal de auditoría, flujo CAPA y **Compuerta Final de Revisión QA Post-Cierre**.
- **ISO/IEC 17011, Clasificación IAF y Catálogo Normativo Bilingüe:** Matriz cruzada entre organismos acreditadores (`ENAC`, `UKAS`, `ANAB`), normas certificables, acreditaciones y sectores IAF (`acreditacion_norma` + `acreditacion_norma_sector_iaf`), sectores IAF y sub-sectores jerárquicos con nivel de riesgo (`ALTO`, `MEDIO`, `BAJO`); además de un **catálogo normativo bilingüe (ES/EN) de 8 normas canónicas** (`2,188` cláusulas `LTREE` en `requisito` con `1,673` obligatorias y `515` informativas, y `2,684` traducciones HTML enriquecidas en `requisito_traduccion`) con lector documental unificado (`normaFullReader.ts`), motor recursivo de expansión `{clause_...}` (`clauseRenderer.ts`) y editor bilingüe `Visual / HTML / Vista Previa` (`richTextEditor.ts`) con autocompletado `{` y navegador compacto de hermanas/sub-cláusulas directas.

La plataforma se encuentra consolidada tras completar el **Roadmap Integral `Step 1.1` → `Step 11.1` (`Conglomerado`, `Vínculo`, `Designación {Tipo, Sitio, Temporal}`, `Tiempo`, `Asignación`, `Programa`, `Calendario`, `Resultado`, `Revisión`)**: base de datos PostgreSQL/Supabase (**50 tablas**, **110 índices** en `03_indices_optimizacion.sql` con **40 únicos parciales** y **94 parciales `WHERE deleted_at IS NULL`** / **161 índices vivos**, **223 triggers vivos**, retención **Soft-Delete en 43 tablas** con bloqueo físico `fn_prevent_hard_delete` en **42 tablas** y **`REVOKE DELETE` en 45 tablas**, **43 tablas habilitadas en `archive_record`**, **26 padres protegidos**, **149 políticas RLS** + DCL), servidor Express 5 (`server.ts`), aplicación SPA TypeScript estricta (`strict: true`, `0 any`), **44 módulos de lógica pura en `src/lib/`** (+ `src/lib/generated/normasCatalogBundle.ts`), **54 vistas en `src/views/`**, **64 archivos de pruebas unitarias (`520` pruebas aprobadas en `39` suites de `node:test`)**, compilación Vite `6.4.6` con `manualChunks` (**144 módulos**) y validación responsiva end-to-end en navegador real Chromium (`390×844` móvil y `1440×900` escritorio) para los **4 roles (`ADMIN`, `WORKER`, `AUDITOR`, `CLIENT`)**, incluyendo aislamiento estricto **Nivel 2 Inter-Org** para `CLIENT`.

---

## 2. Arquitectura General del Sistema

```text
┌────────────────────────────────────────────────────────────────────────────┐
│  Frontend SPA (src/main.ts 36,335 l. + 44 src/lib/* + generated + 54 views)│
│  • TypeScript strict (0 any) + Vite 6 (manualChunks, 144 módulos)          │
│  • Contenedor panorámico widescreen (max-w-[1720px]) hasta 4 columnas      │
│  • Cabecera en 3 bloques (Auditoría [menú 3er nivel] | Certificación | Extra)│
│  • Dashboard minimalista RBAC (5 métricas) + Pipeline Stepper 1-palabra    │
│  • Breadcrumbs compactos (1 línea, 31 tipos, elipsis, sin bucles)          │
│  • Multi View Clean List (facetas reactivas S_{-k}, col table-fixed)       │
│  • Flujo 11 Pasos: Conglomerado → Vínculo → Designación (Tipo/Sitio/Temp)  │
│    → Tiempo → Asignación → Programa 8A/8B → Calendario → Resultado → Revisión│
│  • Calendario Año/Q1–Q4/Mes/Timeline + Badges 1-palabra + Config Alertas   │
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
│  • 50 tablas + 110 índices 03 (161 vivos) │ │  • Prod: dist/ + fallback    │
│  • 223 triggers vivos (Conglomerado 1:1,  │ │  • GET /api/health           │
│    Vínculo, Sitios Temp, Fechas, QA Rev.) │ │  • POST /api/reset-db        │
│  • Motor LTREE (2,188 cl. / 1,673 oblig.) │ └──────────────┬───────────────┘
│  • audit_log inmutable (44 tablas)        │                │ Management API
│  • RPCs: get_archive_dependency_summary   │                │ / pg fallback
│          archive_record (43 tablas)       │                ▼
│          declarar_no_aplicable_con_mutacion│ public/supabase/queries/00..07.sql
│          evaluar/resumen_cobertura        │
└───────────────────────────────────────────┘
```

### Evolución Arquitectónica Ejecutada

| Etapa | Alcance Ejecutado | Entregables Principales |
| :---: | :--- | :--- |
| **Fases 1.1–1.2** | Retención Soft-Delete y Endurecimiento RLS | Columnas `deleted_at`, `deleted_by`, `delete_reason`; triggers `fn_prevent_hard_delete`, `fn_sync_soft_delete_*` y `fn_guard_parent_archival`; RPCs `get_archive_dependency_summary` y `archive_record`; `REVOKE DELETE` en tablas protegidas/gobernanza; índices únicos parciales (`WHERE deleted_at IS NULL`); guardia `fn_protect_profile_rbac_fields` contra auto-escalamiento en `profiles`. |
| **Fases 2.1–2.2** | Shell Global en 3 Bloques, Dashboard Minimalista y `Mi Perfil` | Cabecera en 3 bloques singulares (`Auditoría`, `Certificación`, `Extra`); Dashboard de 5 métricas acotadas por RBAC; vista **`Mi Perfil`** (`profileView.ts`) con bloqueo estricto de `role` y `status`. |
| **Fase 3** | Motor de Breadcrumbs Compactos | Barra de una sola línea sin bordes (`flex-nowrap`), truncamiento a 24 caracteres (`…`) y colapso intermedio (`MAX_VISIBLE_BREADCRUMBS = 4`), reseteo en cabecera (`data-nav-reset="true"`), soporte para **31 tipos de entidad** y prevención de bucles por clave compuesta. |
| **Fases 4.1–5.2** | Multi View Clean List, Detail View y Archivo Seguro | **Multi View** (`universalTemplate`): barra lateral colapsable, conteos reactivos ($S_{-k}$), buscador único `type="text"` con un solo `✕`, totalizador `Mostrando X de Y`, tablas `table-fixed` con `<colgroup>` 100%, conmutador `Tarjetas`/`Tabla`, modal de archivo seguro (`archiveModalView.ts`), filtro `"Mostrar Archivados"` y `"Restaurar"` exclusivos para `ADMIN`, y toast flotante `#archiveGovernanceToast`. |
| **Modernización `certificado`, `Extra` y `Certificación`** | Normalización Relacional y Ficha Unificada `'read' \| 'add' \| 'edit'` | FK obligatoria `id_subsector_iaf` en `certificado`; 4 sub-entidades (`fecha_certificado`, `contacto_certificado`, `telefono_contacto_certificado`, `email_contacto_certificado`); **5 chips padres** (`xl:grid-cols-5`) y **7 pestañas** en `certificadoView.ts`; refactorización `acreditacion_norma` + `acreditacion_norma_sector_iaf`; y estandarización `'read' \| 'add' \| 'edit'` en `organismoAcreditacionView.ts`, `subsectorIafView.ts`, `requisitoView.ts`, `clientAccessView.ts`, `competenciaAuditorView.ts`, `noAplicableView.ts`. |
| **Catálogo Normativo Bilingüe y Cobertura LTREE** | Traducciones ES/EN, Editor `{clause_...}` y Smart Mutation | Tabla `requisito_traduccion` y `es_obligatorio`/`obligatorio_origen`; pipeline CSV determinista (`07_normas_requisitos_csv.sql` + `normasCatalogBundle.ts`); paginación `.range()` (`paginatedHydration.ts`); lector completo (`normaFullReader.ts`), editor bilingüe (`richTextEditor.ts`) con autocompletado `{` y navegador compacto hermanas/hijas; motor descendente `LTREE` + **Coverage HUD** + **Mapa de Cobertura** (`coverageEngine.ts`) + selector batch `LTREE` (`procesoView.ts`) + RPC `declarar_no_aplicable_con_mutacion`. |
| **Reconstrucción Bloque 1 (`Auditoría`) e Infraestructura `Procesos del Sitio`** | Programas 1:N, Fechas 1:N, Dual-Bucket `0.25d`, Árbol Paso 2, Calendario 3 Modos y Aislamiento Nivel 2 | Tablas `procesos_por_sitio`, `programa_auditoria`, `auditoria_fecha`, `configuracion_alerta_auditoria`, `turnos_proceso_sitio_auditoria`, `equipo_auditor_sitio` y `equipo_auditor_proceso_sitio`; retiro de columnas planas de fecha hacia `auditoria_fecha` 1:N; aislamiento RLS Nivel 2 Inter-Org; pestaña `Procesos del Sitio`; motores `auditPlanningEngine.ts`, `auditAlertsEngine.ts`, `auditPlanningPersistence.ts`. |
| **Pipeline Operativo 11 Pasos (`Step 1.1` → `Step 11.1`)** | `Conglomerado`, `Vínculo`, `Designación`, `Tiempo`, `Asignación`, `Programa 8A/8B`, `Calendario`, `Resultado`, `Revisión` | Nuevas tablas **`grupo_empresarial`** (auto-bucket 1:1 y limpieza automática), **`vinculo`**, **`vinculo_certificado`** (compuerta Paso 2 anti-`LIBRE`, reemplazo `Multisitio → Mixta`), **`auditoria_sitio_temporal`**, **`auditoria_sitio_temporal_certificado`** y **`equipo_auditor_sitio_temporal`**; `auditoria_fecha` ampliada a `PREPROGRAMADA_MES \| PROGRAMADA_EXACTA \| REAL`; plazos automáticos NC (`+15d`/`+60d`) y cierre formal en `Resultado` (`Step 10`); compuerta QA `revisado` en `Revisión` (`Step 11`); menú anidado `Designación > { Tipo, Sitio, Temporal }`, `Conglomerado` #1 en `Certificación`, barra **Pipeline Stepper** de 1 palabra y 11 nuevos dominios/vistas dedicados. |

---

## 3. Bloques Operativos, RBAC y Gobernanza

### 3.1 Tres Bloques Operativos en la Cabecera Global (`src/views/header.ts` + `src/lib/healthCheck.ts`)

1. **Bloque 1 — `Auditoría` (`📅` · Pipeline 1-Palabra con Menú Anidado de 3er Nivel):**
   - `1. Vínculo` (`#auditorias/vinculo`): Gestión de compromiso operativo (`Libre` / `Individual` / `Vinculado` Nivel 1 y Nivel 2), naturalezas actualizadas (`Mixta` en reemplazo de `Multisitio`) y bandera `tiene_sitio_temporal`.
   - `2. Designación` *(menú anidado)*:
     - **`Tipo`** (`#auditorias/designacion/tipo`): Cola operativa con protección anti-futuro (`Próximas a ejecutar`, `Preprogramadas Mes`, `Futuro +1/+3 años`, `Todas`), asignación de tipo/metodología y reprogramaciones 1:N (`auditoria_fecha`).
     - **`Sitio`** (`#auditorias/designacion/sitio`): Pre-selección automática de `Sitio 0 (HQ)`, **Tira de Ciclo Multi-Anual** (`◀` / `▶`) sin `<select>`, alcance multisitio y toggle `tiene_sitio_temporal`.
     - **`Temporal`** (`#auditorias/designacion/temporal`): Gestión de sitios temporales / proyectos de obra (`auditoria_sitio_temporal`) con atribución compartida a certificados del vínculo (`auditoria_sitio_temporal_certificado`).
   - `3. Tiempo` (`#auditorias/tiempo`): Distribución de días-auditor con precisión **`0.25d`** por sitio regular + sitio temporal y filtros `Incompletos` / `Completos`.
   - `4. Asignación` (`#auditorias/asignacion`): Balanceo de equipos (`equipo_auditor_sitio` y `equipo_auditor_sitio_temporal`), competencias IAF y alertas de rotación.
   - `5. Programa` (`#auditorias/programa`): Enlaces individuales por certificado con **Mini-Paso 8A (`Procesos` + drawer `"Ver Programa Anterior / Futuro"` + alerta `⚠️ Nunca auditado`)** y **Mini-Paso 8B (`Turnos`)**.
   - `6. Calendario` (`#auditorias/calendar`): **3 modos (`Calendario` con sub-vistas Año, Trimestre Q1–Q4, Mes y Timeline | `Tarjetas` | `Tabla` `table-fixed`)**, badges de etapa de 1 palabra con salto directo, drawer de alertas y modal **`⚙ Configurar Alertas`** (incl. plazos NC `dias_limite_plan_accion` / `dias_limite_cierre_nc`).
   - `7. Resultado` (`#auditorias/resultado`): Fechas **`REAL`** con validación de capacidad concurrente por auditor, tablero Tabla (`table-fixed` sin botones en `<tbody>`) / Kanban de hallazgos CAPA (`+15d` plan / `+60d` cierre), `fecha_cierre_auditoria` y cierre formal (`estado_ciclo = 'Cerrada'`).
   - `8. Revisión` (`#auditorias/revision`): Cola QA Post-Cierre (`Pendientes de Revisión` / `Revisadas`), checklist documental (`documentacion_completa`), `fecha_revision`, `resumen_revision` y aprobación final (`revisado = TRUE`).
2. **Bloque 2 — `Certificación` (`🏛️` · 4 Ítems):**
   - `Conglomerado` (`#certificacion/conglomerados` — Ítem #1): Grupos empresariales (`grupo_empresarial`), bucket individual 1:1 automático, filtro `"Organizaciones solas / sin agrupar"` y re-agrupación para elegibilidad Nivel 2.
   - `Organización` (`#certificacion/organizations`): Directorio Clean List, pestaña **`Acceso Cliente`** (`clientAccessView.ts`) y creación/edición `'read' | 'add' | 'edit'`.
   - `Certificado` (`#certificacion/certificates`): Directorio Clean List de 6 columnas y ficha `'read' | 'add' | 'edit'` con **5 chips padres**, **Coverage HUD + Mapa de Cobertura**, y **7 pestañas de hijos** (`Sitio` con Sitio 0 HQ y sub-pestaña **`Procesos del Sitio`** `procesos_por_sitio`, `Proceso` con selector batch `LTREE`, `Turno`, `No Aplicables` con Smart Mutation, `Auditoría`, `Fecha`, `Contacto` con teléfonos/correos).
   - `Auditor` (`#certificacion/auditors`): Directorio técnico Clean List, ficha `'read' | 'add' | 'edit'` y gestión real M:N de competencias técnicas (`competenciaAuditorView.ts`).
3. **Bloque 3 — `Extra` (`📚`):**
   - `Norma` (`#extra/standards`) con **Lector Completo de Norma** (`Ver Norma`) y sub-ficha bilingüe **`Requisito LTREE`** (`requisitoView.ts` + `richTextEditor.ts`), `Sector IAF` (`#extra/iaf`) + **`Sub-Sector IAF`**, `Acreditación` (`#extra/accreditations`) + **`Organismos de Acreditación`**, `Estatus`, `Tipo` y `Metodología`.
4. **Menú de Cuenta:** `Mi Perfil` (`#profile`), `Panel Aprobaciones` (`#approvals` para `ADMIN` y lectura `WORKER`) y `Estado DB` (`#database` exclusivo `ADMIN`).

### 3.2 Matriz de Roles, Soft-Delete y Aislamiento Nivel 2 (`04_rls.sql` + `src/lib/accessControl.ts` + `src/lib/rbac.ts`)

- **Autoregistro (`Sign up`):** `CLIENT` nace `APPROVED`; `ADMIN`, `WORKER` y `AUDITOR` quedan en `PENDING` (`handle_new_user()`). Cuentas `PENDING`/`REJECTED` suprimen el icono de rol y solo acceden a `dashboard` y `profile`.
- **`ADMIN` (`🛡️`):** Control total de los 3 bloques, `Panel Aprobaciones`, `Estado DB`, Reset DB (`00`–`07.sql`), configuración global de alertas, edición en los 11 pasos del pipeline, `🗄️ Archivar`, `"Mostrar Archivados"`, `"Restaurar"` (`deleted_at = NULL`) y lectura global de `audit_log`.
- **`WORKER` (`⚙️`):** Gestión operativa completa en `'add' | 'edit'` en los 3 bloques (incluyendo conglomerados, vínculos, campañas en 11 pasos, **`⚙ Configurar Alertas`**, `Procesos del Sitio`, `No Aplicables` con Smart Mutation, traducciones ES/EN y revisión QA), archivo seguro sin dependencias (`archive_record`), lectura de `Panel Aprobaciones` y `audit_log` (sin acceso a `Estado DB`, `"Mostrar Archivados"` ni `"Restaurar"`).
- **`AUDITOR` (`📋`):** Bloques **`Auditoría`** y **`Extra`** en solo lectura (**menú `Certificación` / `Conglomerado` completamente oculto y bloqueado**; sin `"⚙ Configurar Alertas"`); visualiza únicamente campañas, vínculos y certificados donde participa en `equipo_auditor` en modo solo-lectura; muta únicamente matriz normativa, hallazgos y recomendación ISO 17021-1 en sus auditorías asignadas.
- **`CLIENT` (`🏢`):** Lectura estricta acotada por `has_client_org_access()` (`client_organization_access` `APPROVED`), incluyendo **aislamiento Nivel 2 Inter-Org**: en `Conglomerado`, `Vínculo` (Nivel 2) y `Auditoría`, visualiza **únicamente sus propias organizaciones/certificados, fechas, sitios, procesos, turnos, hallazgos y comentarios**, con cero filtración de nombres o conteos de organizaciones coparticipantes ni del detalle interno de `equipo_auditor` (`audit_log`, archivo seguro y mutaciones bloqueados).

---

## 4. Documentación Técnica Detallada

| Documento | Contenido Técnico Cubierto |
| :--- | :--- |
| [`database_architecture.md`](architecture/database_architecture.md) | Scripts SQL (`00`–`07`), extensiones (`uuid-ossp`, `ltree`), ENUMs, `handle_new_user`, catálogo de **50 tablas** (incluyendo `grupo_empresarial`, `vinculo`, `vinculo_certificado`, `auditoria_sitio_temporal`, `auditoria_sitio_temporal_certificado`, `equipo_auditor_sitio_temporal`, `programa_auditoria`, `auditoria_fecha`, `configuracion_alerta_auditoria`, `procesos_por_sitio`, `turnos_proceso_sitio_auditoria`, `equipo_auditor_sitio`, `equipo_auditor_proceso_sitio`), **Soft-Delete en 43 tablas** (`42` con `fn_prevent_hard_delete`, `42` sincronizadas en `01` + `client_organization_access` = `43` habilitadas en `archive_record`), `26` padres protegidos, **223 triggers vivos** (**44 tablas** con `audit_log`), motor `LTREE`, **110 índices en `03`** (**40 únicos parciales** / **94 parciales**) y siembra CSV (`5,261` líneas, `8` normas, `2,188` cláusulas, `2,684` traducciones). |
| [`backend_api_security.md`](architecture/backend_api_security.md) | Servidor Express 5 (`server.ts`), `/api/health` y `/api/reset-db` (`00`–`07.sql`) con fallback Management API → `pg.Client`, `vite.config.ts`, aislamiento de secretos, DCL (`REVOKE DELETE` en **45 tablas** + `REVOKE EXECUTE` sobre `PUBLIC`/`anon`), 7 funciones `SECURITY DEFINER`, RPCs `archive_record` (**43 tablas**) y `declarar_no_aplicable_con_mutacion`, protección anti-escalamiento en `profiles` y matriz de **149 políticas RLS** en **50 tablas** (incluyendo aislamiento Nivel 2 `CLIENT` en conglomerados, vínculos y temporales). |
| [`frontend_architecture.md`](architecture/frontend_architecture.md) | Estado `AppState` (`src/main.ts`, `36,335` líneas), hidratación paginada, fallback `normasCatalogBundle.ts`, enrutamiento SPA, shell 3 bloques con **menú anidado de 3er nivel (`Designación`)**, **Pipeline Stepper 1-palabra**, selector **Matriz de Ciclos (`Sitio`)**, tarjetas históricas con drawer colapsable (`Programa 8A/8B`), breadcrumbs (**31 tipos**), Multi View Clean List (`table-fixed`), Detail View `'read' \| 'add' \| 'edit'`, **Calendario 3 Modos + Alertas**, **Coverage HUD + Smart Mutation**, lector/editor bilingüe ES/EN e inventario de **44 módulos en `src/lib/`** (+ `generated/`) y **54 vistas en `src/views/`**. |
| [`testing_and_operations.md`](architecture/testing_and_operations.md) | **64 archivos de pruebas (`520` pruebas aprobadas en `39` suites `node:test`)**, `tsc --noEmit` (`0 any`), compilación Vite `6.4.6` (`manualChunks`, **144 módulos**), verificación Chromium en vivo (`390×844` y `1440×900`) sobre el **walkthrough completo de 11 pasos** y los **4 roles (`ADMIN`, `WORKER`, `AUDITOR`, `CLIENT`)**, cuentas de prueba, pipeline CSV y operación en producción. |

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
│   ├── main.ts                              # Estado global (36,335 líneas), rutas SPA, hidratación y eventos
│   ├── lib/                                 # 44 módulos de lógica pura + generated/ + 64 archivos *.test.ts
│   │   └── generated/
│   │       └── normasCatalogBundle.ts       # Respaldo offline/embebido (8 normas, 2,188 cláusulas, 2,684 tr.)
│   └── views/                               # 54 módulos de vistas HTML declarativas
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
