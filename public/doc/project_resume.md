# Resumen Ejecutivo y Técnico: `programa_aud`

**Google AI Studio App:** [programa_aud](https://ai.studio/apps/f5f29961-b0a4-4b29-a8c7-6153e393aa1f)  
**Repositorio GitHub:** [angasc95/programa_aud](https://github.com/angasc95/programa_aud)  
**Organización / Coordinación:** Certificación FN (`coord.operativacertificacionfn@gmail.com`)  
**Proyecto Supabase:** `ufowtgmpaahyshdxlnlq` (`https://ufowtgmpaahyshdxlnlq.supabase.co`)

---

## 1. Visión General y Estado Actual del Proyecto

`programa_aud` es una plataforma integral para la **gestión, programación multientidad, asignación técnica de equipos, trazabilidad normativa, gobierno de retención lógica y control de hallazgos de programas y planes de auditoría de certificación**, diseñada e implementada bajo estándares internacionales:

- **ISO/IEC 17021-1:2015:** Integridad relacional de subconjunto entre certificados, sedes, turnos, `procesos_por_sitio` y ejecuciones de auditoría (validada mediante triggers en PostgreSQL); trazabilidad forense inmutable (`public.audit_log` con resolución legible de actores y regla **Zero-UUID**); competencias técnicas obligatorias (`norma` + `sector_iaf` + `subsector_iaf`) y verificación de rotación de Auditor Líder; asignación obligatoria de `id_subsector_iaf` en cada certificado; declaración narrativa de alcance (`certificado.alcance`, 10–1000 caracteres); historial normalizado de fechas de certificación (`fecha_certificado`) y directorio estructurado de contactos con teléfonos y correos (`contacto_certificado`, `telefono_contacto_certificado`, `email_contacto_certificado`); exclusiones justificadas de cláusulas (`requisitos_no_aplicables_certificado`, Cláusula 4.3) con **Mutación Inteligente atómica**; **Motor Jerárquico de Cobertura Normativa (`LTREE`)** con clasificación `es_obligatorio` (`1,673` obligatorias / `515` informativas); y **Motor de Decisión de Certificación (Cláusulas 9.5/9.6)** que bloquea recomendaciones de aprobación ante No Conformidades Mayores abiertas o No Conformidades Menores sin plan de acción correctiva.
- **ISO 19011:2018 e IAF MD 1:2018:** Arquitectura operativa **Certificate-Based + Batch-Synchronized** en el Bloque 1 (`Auditoría`), iniciando en **`Calendario`** (`#/auditorias/calendar`) y **`Vínculo`** (`#/auditorias/vinculo` mediante **Cajas Agrupadoras Many-to-One** por conglomerado), seguido por los **7 Pasos + `Resumen`** navegables vía **Breadcrumb In-Card** (`Designación {Tipo, Fecha, Sitio, Temporal}` → `Tiempo` → `Auditor` → `Proceso` → `Turno` → `Resultado` → `Revisión` → `Resumen`) y asistidos por el **Wizard `+ Auditoría` en 3 Fases** (numeración simple por fase y fecha objetivo única en `Programada Exacta`). Soporta `grupo_empresarial` → `vinculo` → `programa_auditoria` → `auditoria` → `auditoria_fecha` 1:N (`PREPROGRAMADA_MES` | `PROGRAMADA_EXACTA` | `REAL`), creación preventiva multi-anual libre de colisiones mediante asignadores deterministas (`fn_next_programa_auditoria_codigo`, `fn_next_auditoria_codigo`) y rollback ante fallos en lote, vinculación `INDIVIDUAL`, `NIVEL_1_INTRA_ORG` y `NIVEL_2_INTER_ORG` (7 naturalezas con abreviaturas compactas `Integ. (N)`, `Comb. (N)`, etc. + tooltip completo), `Designación → Fecha` unificada ("Less Is More": último registro agregado, estatus de certificado, salto entre certificados vinculados, tabla única `YYYY-MM` + `YYYY-MM-DD` con 1ra fecha fija no eliminable y acciones simbólicas), sitios temporales (`auditoria_sitio_temporal*`) y herencia de ciclos (`id_ciclo_origen`); balanceo de días-auditor con precisión **`0.25d`**; registro de fechas `REAL` discretas y **No Conformidades por cláusula normativa (`id_proceso IS NULL`)** con plazos **`+15d / +45d`** configurables (`⚙ Plazos NC`) sin contaminar `Calendario`; cierre formal, **Revisión QA Post-Cierre** y cálculo paralelo de **`estatus_auditoria`** en **`Resumen`**.
- **ISO/IEC 17011, Clasificación IAF y Catálogo Normativo Bilingüe:** Matriz cruzada entre organismos acreditadores (`ENAC`, `UKAS`, `ANAB`), normas certificables, acreditaciones y sectores IAF (`acreditacion_norma` + `acreditacion_norma_sector_iaf`), sectores IAF y sub-sectores jerárquicos con nivel de riesgo (`ALTO`, `MEDIO`, `BAJO`); además de un **catálogo normativo bilingüe (ES/EN) de 8 normas canónicas** (`2,188` cláusulas `LTREE` en `requisito` con `1,673` obligatorias y `515` informativas, y `2,684` traducciones HTML enriquecidas en `requisito_traduccion`) con lector documental unificado (`normaFullReader.ts`), motor recursivo de expansión `{clause_...}` (`clauseRenderer.ts`) y editor bilingüe `Visual / HTML / Vista Previa` (`richTextEditor.ts`) con autocompletado `{` y navegador compacto de hermanas/sub-cláusulas directas.

La plataforma se encuentra consolidada tras completar el **Roadmap de Consolidación `Steps 1.1` → `9.1`**, **Evolución `Designación → Fecha`, `+ Auditoría` y Auditorías Preventivas**, y el **Roadmap de Enriquecimiento `Grupo Industrial Iberometal` (`Steps 1.1` → `4.1` + `Step Final`)**: escenario demostrativo completo con **8 certificados en `CONG-IND-01` (`Iberometal Componentes S.A.` y `Example, C.A.`) al `100.00%` de cobertura normativa**, `sitio.personal_count` persistente (`16`–`195` personas en `CONG-IND-01`) con tiempos proporcionales `0.25d`, exclusión ISO 4.3 `8.3` corregida, **6 auditores calificados**, **9 vínculos persistentes**, **23 campañas** y **35 auditorías multi-anuales** (histórico QA revisado/pendiente, ciclo en curso con `Sitio Temporal`, y campañas futuras `+1/+2` años `AUD-2027-*`/`AUD-2028-*` estrictamente limpias sin auditores ni hallazgos), junto con base de datos PostgreSQL/Supabase (**50 tablas**, **114 índices** en `03_indices_optimizacion.sql` con **40 únicos parciales** y **107 parciales `WHERE deleted_at IS NULL`** / **165 índices vivos**, **226+ triggers vivos**, retención **Soft-Delete en 43 tablas** con bloqueo físico `fn_prevent_hard_delete` en **42 tablas** y **`REVOKE DELETE` en 45 tablas**, **43 tablas habilitadas en `archive_record`**, **26 padres protegidos**, **149 políticas RLS** + DCL), servidor Express 5 (`server.ts`), aplicación SPA TypeScript estricta (`strict: true`, `0 any`), **48 módulos de lógica pura en `src/lib/`** (+ `src/lib/generated/normasCatalogBundle.ts`), **60 vistas en `src/views/`**, **68 archivos de pruebas unitarias (`583` pruebas aprobadas en `41` suites de `node:test`)**, compilación Vite `6.4.6` con `manualChunks` (**153 módulos**) y validación responsiva end-to-end en navegador real Chromium (`390×844` móvil y `1440×900` escritorio) para los **4 roles (`ADMIN`, `WORKER`, `AUDITOR`, `CLIENT`)**, incluyendo aislamiento estricto **Nivel 2 Inter-Org** para `CLIENT`.

---

## 2. Arquitectura General del Sistema

```text
┌────────────────────────────────────────────────────────────────────────────┐
│  Frontend SPA (src/main.ts 40,429 l. + 48 src/lib/* + generated + 60 views)│
│  • TypeScript strict (0 any) + Vite 6 (manualChunks, 153 módulos)          │
│  • Contenedor panorámico widescreen (max-w-[1720px]) hasta 4 columnas      │
│  • Cabecera en 3 bloques (Auditoría [menú 3er nivel] | Certificación | Extra)│
│  • Menú Auditoría: Calendario, Vínculo, ---, Designación {Tipo, Fecha,     │
│    Sitio, Temporal}, Tiempo, Auditor, Proceso, Turno, Resultado, Revisión, │
│    Resumen + Wizard guiado `+ Auditoría` (3 Fases)                         │
│  • Detail Views Certificate-Based + Breadcrumb In-Card persistente         │
│  • Dashboard minimalista RBAC (5 métricas) + Breadcrumbs globales (31 tipos│
│  • Multi View Clean List (facetas reactivas S_{-k}, col table-fixed)       │
│  • Resultado: REAL discretas + NCs por cláusula (+15d/+45d ⚙ Plazos NC)    │
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
│  • 50 tablas + 114 índices 03 (165 vivos) │ │  • Prod: dist/ + fallback    │
│  • 226 triggers vivos (Conglomerado 1:1,  │ │  • GET /api/health           │
│    fn_desvincular_org, Vínculo, Sitio 0,  │ │  • POST /api/reset-db        │
│    Sitios Temp, Fechas, NC +15/45d, QA)   │ └──────────────┬───────────────┘
│  • Motor LTREE (2,188 cl. / 1,673 oblig.) │                │ Management API
│  • audit_log inmutable (44 tablas)        │                │ / pg fallback
│  • RPCs: get_archive_dependency_summary   │                ▼
│          archive_record (43 tablas)       │ public/supabase/queries/00..07.sql
│          declarar_no_aplicable_con_mutacion│
│          evaluar/resumen_cobertura        │
└───────────────────────────────────────────┘
```

### Evolución Arquitectónica Ejecutada

| Etapa | Alcance Ejecutado | Entregables Principales |
| :---: | :--- | :--- |
| **Fases 1.1–1.2** | Retención Soft-Delete y Endurecimiento RLS | Columnas `deleted_at`, `deleted_by`, `delete_reason`; triggers `fn_prevent_hard_delete`, `fn_sync_soft_delete_*` y `fn_guard_parent_archival`; RPCs `get_archive_dependency_summary` y `archive_record`; `REVOKE DELETE` en tablas protegidas/gobernanza; índices únicos parciales (`WHERE deleted_at IS NULL`); guardia `fn_protect_profile_rbac_fields` contra auto-escalamiento en `profiles`. |
| **Fases 2.1–5.2** | Shell 3 Bloques, Breadcrumbs, Multi View, Detail View y Archivo Seguro | Cabecera en 3 bloques (`Auditoría`, `Certificación`, `Extra`); Dashboard RBAC; **`Mi Perfil`** (`profileView.ts`); Breadcrumbs compactos (31 tipos); **Multi View** (`universalTemplate`) con facetas reactivas $S_{-k}$, buscador único `type="text"`, tablas `table-fixed` `<colgroup>` 100% sin botones en `<tbody>`, modal seguro (`archiveModalView.ts`) y `"Mostrar Archivados"`/`"Restaurar"` (`ADMIN`). |
| **Modernización `certificado`, `Extra` y `LTREE`** | Normalización Relacional, Catálogo Bilingüe y Smart Mutation | FK obligatoria `id_subsector_iaf`; 4 sub-entidades de `certificado`; 5 chips padres y 7 pestañas en `certificadoView.ts`; `acreditacion_norma_sector_iaf`; `requisito_traduccion` y `es_obligatorio`; pipeline CSV (`07_normas_requisitos_csv.sql` + `normasCatalogBundle.ts`); lector/editor bilingüe ES/EN (`normaFullReader.ts`, `richTextEditor.ts`); **Coverage HUD + Mapa de Cobertura** y RPC `declarar_no_aplicable_con_mutacion`; catálogo `procesos_por_sitio`. |
| **Steps `1.1`–`9.1` (Consolidación Final Bloque 1)** | Reorganización Canónica por Certificado, Cajas de `Vínculo`, Wizard `+ Auditoría`, Split `Proceso`/`Turno`, NC por Cláusula y `Resumen` | Menú Bloque 1 definitivo (`Calendario`, `Vínculo`, `---`, `Designación > { Tipo, Fecha, Sitio, Temporal }`, `Tiempo`, `Auditor`, `Proceso`, `Turno`, `Resultado`, `Revisión`, `Resumen`) con flyout hover auto-cerrado; **Wizard `+ Auditoría` en 3 Fases**; **`Conglomerado`** con `fn_desvincular_organizacion_conglomerado` y pestaña `Auditorías`; **`Vínculo`** con **Cajas Agrupadoras (Many-to-One)** y `Bandeja LIBRE`; **Breadcrumb In-Card** con selector de auditoría persistente por certificado (`auditSectionShell.ts`, `certificateAuditSelector.ts`); sub-ruta **`Designación → Fecha`**; **`Auditor`** (incl. `Sitio Temporal`); split **`Proceso`** (`Seleccionar todos`) + **`Turno`**; **`Resultado`** con fechas `REAL` discretas, NCs sin `id_proceso` (`+15d/+45d`), modal **`⚙ Plazos NC`** y cero contaminación de `Calendario`; **`Revisión`** QA; y **`Resumen`** con cálculo paralelo de `estatus_auditoria` y salto en 1 clic. |
| **Evolución `future_changes` (`Steps 1.1`–`4.2` + `Final`)** | Campañas Preventivas Multi-Anuales, Wizard Simplificado y `Designación → Fecha` ("Less Is More") | Asignadores deterministas de códigos (`fn_next_programa_auditoria_codigo`, `fn_next_auditoria_codigo`), reintento `23505` y `rollbackOrphanProgramAndAudits` permitiendo campañas preventivas futuras junto a auditorías activas (`1.1–2, 4, 5` sin requerir `3. Auditor` ni `6. Resultado`); `+ Auditoría` con numeración simple (`1`, `2`, `3`) y fecha objetivo única en `Programada Exacta`; Multi View `Fecha` con abreviaturas `Integ. (N)`/`Comb. (N)`, último registro agregado y estatus de certificado; Detail View `compactMode` con salto directo entre certificados vinculados, tabla unificada de fechas (`YYYY-MM` + `YYYY-MM-DD`, orden último-agregado primero, acciones simbólicas `+`/`✏️`/`🗑️`, 1ra fecha fija no eliminable y `REAL` en solo lectura). |
| **Enriquecimiento `Grupo Industrial Iberometal` (`Steps 1.1`–`4.1` + `Final`)** | Escenario Demostrativo Integral End-to-End (`06_datos_prueba.sql` + Paridad SQL/TS) | Columna real `public.sitio.personal_count` (`1..50000`) cableada en UI/TS (`sitioDomain.ts`, `sitioView.ts`, `certificadoView.ts`, `main.ts`); 6 turnos estándar (`7000...0001..0006`); **8 certificados en `CONG-IND-01` al `100.00%` de cobertura normativa** con exclusión ISO 4.3 `8.3` corregida; **6 auditores calificados** (matrices M:N completas); **9 vínculos** (manteniendo `FN-QMS-2026-008` `LIBRE`); **23 programas / 35 auditorías / 48 fechas** multi-anuales (incl. futuras `+1/+2` `AUD-2027-*`/`AUD-2028-*` sin auditores ni hallazgos); tiempos `0.25d` proporcionales a dotación; `21` hallazgos en 4 tipos y preservación de `CONG-ALM-01` / `CONG-CYB-01`. |

---

## 3. Bloques Operativos, RBAC y Gobernanza

### 3.1 Tres Bloques Operativos en la Cabecera Global (`src/views/header.ts` + `src/lib/healthCheck.ts`)

1. **Bloque 1 — `Auditoría` (`📅` · Orden Definitivo con Submenú Anidado de 3er Nivel):**
   - `Calendario` (`#auditorias/calendar`): **3 modos (`Calendario` con sub-vistas Año, Trimestre Q1–Q4, Mes y Timeline | `Tarjetas` | `Tabla` `table-fixed`)**, drawer de alertas y modal **`⚙ Configurar Alertas`** (no contaminado por fechas límite NC).
   - `Vínculo` (`#auditorias/vinculo`) *(separador inferior)*: Multi View por Conglomerado + Detail View de **Cajas Agrupadoras (Many-to-One)** con `Bandeja LIBRE`, creación de cajas, traslado de certificados con validación ISO y enlace directo a `Resumen`.
   - `Designación` *(submenú lateral desplegable al pasar el cursor, auto-cerrado al salir de Bloque 1)*:
     - **`Tipo`** (`#auditorias/designacion/tipo`): Multi View basado en certificados (`Todos`, `Próximas a ejecutar`, `Preprogramadas Mes`, `Futuro +1/+3 años`), creación vía `+ Auditoría` y edición de tipo/metodología sincronizada al lote.
     - **`Fecha`** (`#auditorias/designacion/fecha`): Multi View por certificado (abreviaturas de vínculo con tooltip, último registro de fecha agregado y estatus/faceta de certificado) y Detail View "Less Is More" (`compactMode`, salto entre vinculados y tabla unificada `YYYY-MM` + `YYYY-MM-DD` con 1ra fecha fija no eliminable sincronizada al lote).
     - **`Sitio`** (`#auditorias/designacion/sitio`): Selección de sedes físicas por auditoría con auto-asignación de `Sitio 0 (HQ)` y Tira de Ciclo Multi-Anual (`◀` / `▶`).
     - **`Temporal`** (`#auditorias/designacion/temporal`): Switch `tiene_sitio_temporal` sincronizado al lote y gestión de sitios temporales multicertificado (`auditoria_sitio_temporal*`).
   - `Tiempo` (`#auditorias/tiempo`): Steppers `0.25d` para sitios regulares y temporales (`auditoria_sitio_temporal`), con filtros `Incompletos` / `Completos`.
   - `Auditor` (`#auditorias/auditor`): Balanceo de auditores (`equipo_auditor_sitio` y `equipo_auditor_sitio_temporal` cuando `Sitio Temporal` está ON) con cuadre exacto `SUM == días` y alertas de competencia/rotación.
   - `Proceso` (`#auditorias/proceso`): Matriz de cobertura operativa por sitio restringida a `procesos_por_sitio`, botones **`Seleccionar todos`** por sitio y **`Seleccionar todos los Medulares`**, alerta `⚠️ Nunca auditado` y drawer histórico `"Ver Programa Anterior / Futuro"`.
   - `Turno` (`#auditorias/turno`): Matriz anti-fatiga por sitio, cobertura por proceso/turno y propagación homónima entre sedes.
   - `Resultado` (`#auditorias/resultado`): Fechas **`REAL` discretas** con validación de capacidad concurrente, **No Conformidades por cláusula (`id_proceso IS NULL`)** con `fecha_limite_plan` (`+15d`) y `fecha_limite_cierre` (`+45d`), fechas reales `Plan` / `Cierre`, modal **`⚙ Plazos NC (+15d / +45d)`** y cierre formal (`estado_ciclo = 'Cerrada'`).
   - `Revisión` (`#auditorias/revision`): Cola QA Post-Cierre (`Pendientes de Revisión` / `Revisadas`), checklist (`documentacion_completa`), `fecha_revision`, `resumen_revision` y aprobación final (`revisado = TRUE`).
   - `Resumen` (`#auditorias/resumen`): Consolidación por certificado y auditoría seleccionada, cálculo paralelo de **`estatus_auditoria`** y salto directo en 1 clic a cualquiera de las secciones `1..7` conservando `(certId, auditId)`.
   - *(Compartido en barra superior de secciones Bloque 1)* Botón **`+ Auditoría`** (`auditWizardModal.ts`, 3 Fases) y **Breadcrumb In-Card** en Detail Views `1..7` + `Resumen` (`auditCardBreadcrumb.ts`).
2. **Bloque 2 — `Certificación` (`🏛️` · 4 Ítems):**
   - `Conglomerado` (`#certificacion/conglomerados` — Ítem #1): Grupos empresariales (`grupo_empresarial`), bucket individual 1:1 automático, incorporación de organizaciones `SOLO`, desvinculación segura (`fn_desvincular_organizacion_conglomerado`) en tab `Organizaciones` y listado cronológico en tab `Auditorías` (con enlace directo a `Resumen`).
   - `Organización` (`#certificacion/organizations`): Directorio Clean List, pestaña **`Acceso Cliente`** (`clientAccessView.ts`) y creación/edición `'read' | 'add' | 'edit'`.
   - `Certificado` (`#certificacion/certificates`): Directorio Clean List de 6 columnas y ficha `'read' | 'add' | 'edit'` con **5 chips padres**, **Coverage HUD + Mapa de Cobertura**, y **7 pestañas de hijos** (`Sitio` con Sitio 0 HQ y **`Procesos del Sitio`**, `Proceso` con selector batch `LTREE`, `Turno`, `No Aplicables` con Smart Mutation, `Auditoría`, `Fecha`, `Contacto` con teléfonos/correos).
   - `Auditor` (`#certificacion/auditors`): Directorio técnico Clean List, ficha `'read' | 'add' | 'edit'` y gestión real M:N de competencias técnicas (`competenciaAuditorView.ts`).
3. **Bloque 3 — `Extra` (`📚`):**
   - `Norma` (`#extra/standards`) con **Lector Completo de Norma** (`Ver Norma`) y sub-ficha bilingüe **`Requisito LTREE`** (`requisitoView.ts` + `richTextEditor.ts`), `Sector IAF` (`#extra/iaf`) + **`Sub-Sector IAF`**, `Acreditación` (`#extra/accreditations`) + **`Organismos de Acreditación`**, `Estatus`, `Tipo` y `Metodología`.
4. **Menú de Cuenta:** `Mi Perfil` (`#profile`), `Panel Aprobaciones` (`#approvals` para `ADMIN` y lectura `WORKER`) y `Estado DB` (`#database` exclusivo `ADMIN`).

### 3.2 Matriz de Roles, Soft-Delete y Aislamiento Nivel 2 (`04_rls.sql` + `src/lib/accessControl.ts` + `src/lib/rbac.ts`)

- **Autoregistro (`Sign up`):** `CLIENT` nace `APPROVED`; `ADMIN`, `WORKER` y `AUDITOR` quedan en `PENDING` (`handle_new_user()`). Cuentas `PENDING`/`REJECTED` suprimen el icono de rol y solo acceden a `dashboard` y `profile`.
- **`ADMIN` (`🛡️`):** Control total de los 3 bloques, `Panel Aprobaciones`, `Estado DB`, Reset DB (`00`–`07.sql`), **`+ Auditoría`**, **`⚙ Plazos NC`**, edición completa en Bloque 1, `🗄️ Archivar`, `"Mostrar Archivados"`, `"Restaurar"` (`deleted_at = NULL`) y lectura global de `audit_log`.
- **`WORKER` (`⚙️`):** Gestión operativa completa en `'add' | 'edit'` en los 3 bloques (incluyendo conglomerados, cajas de `Vínculo`, **`+ Auditoría`**, campañas, **`⚙ Configurar Alertas`**, **`⚙ Plazos NC`**, `Procesos del Sitio`, `No Aplicables` con Smart Mutation, traducciones ES/EN y revisión QA), archivo seguro sin dependencias (`archive_record`), lectura de `Panel Aprobaciones` y `audit_log` (sin acceso a `Estado DB`, `"Mostrar Archivados"` ni `"Restaurar"`).
- **`AUDITOR` (`📋`):** Bloque `Auditoría` y `Extra` en solo lectura (**menú `Certificación` / `Conglomerado` completamente oculto y bloqueado**; sin **`+ Auditoría`**, sin mutar cajas de `Vínculo` y sin **`⚙ Plazos NC`**); visualiza únicamente campañas, vínculos y certificados donde participa en `equipo_auditor`; registra únicamente fechas reales / NCs por cláusula (`Resultado`) y observaciones asignadas.
- **`CLIENT` (`🏢`):** Lectura estricta acotada por `has_client_org_access()` (`client_organization_access` `APPROVED`), incluyendo **aislamiento Nivel 2 Inter-Org**: en `Conglomerado`, `Vínculo` (con redacción de `notas` cuando el vínculo incluye organizaciones hermanas), `Calendario` y `Resumen`, visualiza **únicamente sus propias organizaciones/certificados, fechas, sitios, procesos, turnos y hallazgos**, con cero filtración de nombres de empresas hermanas ni del detalle interno de `equipo_auditor` (`audit_log`, archivo seguro y mutaciones bloqueados).

---

## 4. Documentación Técnica Detallada

| Documento | Contenido Técnico Cubierto |
| :--- | :--- |
| [`database_architecture.md`](architecture/database_architecture.md) | Scripts SQL (`00`–`07`), extensiones (`uuid-ossp`, `ltree`), ENUMs, `handle_new_user`, catálogo de **50 tablas**, columna **`sitio.personal_count`**, corrección de exclusión ISO 4.3 **`8.3`**, funciones **`fn_next_programa_auditoria_codigo`**, **`fn_next_auditoria_codigo`**, **`fn_desvincular_organizacion_conglomerado`**, **Soft-Delete en 43 tablas**, triggers vivos (**44 tablas** con `audit_log`), plazos NC `+15d/+45d`, motor `LTREE`, **114 índices en `03`** (**165 vivos**) y semillero enriquecido (`21` certificados, `31` sitios, `6` auditores, `9` vínculos, `23` programas, `35` auditorías, `48` fechas, `21` hallazgos + `2,188` cláusulas). |
| [`backend_api_security.md`](architecture/backend_api_security.md) | Servidor Express 5 (`server.ts`), `/api/health` y `/api/reset-db` (`00`–`07.sql`) con fallback Management API → `pg.Client`, `vite.config.ts`, aislamiento de secretos, creación en lote resistente a colisiones `23505` (asignadores RPC + reintento acotado + `rollbackOrphanProgramAndAudits` + sincronización `archive_record` en `auditoria_fecha`), DCL (`REVOKE DELETE` en **45 tablas** + `REVOKE EXECUTE` sobre `PUBLIC`/`anon`), funciones `SECURITY DEFINER`, RPCs `archive_record` (**43 tablas**) y `declarar_no_aplicable_con_mutacion`, protección anti-escalamiento en `profiles` y matriz de **149 políticas RLS** en **50 tablas**. |
| [`frontend_architecture.md`](architecture/frontend_architecture.md) | Estado `AppState` (`src/main.ts`, `40,429` líneas), hidratación paginada, fallback `normasCatalogBundle.ts`, enrutamiento SPA, shell 3 bloques con orden definitivo de Bloque 1 y **submenú `Designación > { Tipo, Fecha, Sitio, Temporal }`**, **Wizard `+ Auditoría` 3 Fases**, **Breadcrumb In-Card + `compactMode`**, exposición/edición de **`personal_count`** en `sitioView.ts` / `certificadoView.ts` / `sitioDomain.ts`, **Cajas de `Vínculo`**, split **`Proceso`/`Turno`**, **`Resultado` (`⚙ Plazos NC`)**, **`Revisión`**, **`Resumen`**, **Calendario 3 Modos**, **Coverage HUD + Smart Mutation**, lector/editor bilingüe ES/EN e inventario de **48 módulos en `src/lib/`** (+ `generated/`) y **60 vistas en `src/views/`**. |
| [`testing_and_operations.md`](architecture/testing_and_operations.md) | **68 archivos de pruebas (`583` pruebas aprobadas en `41` suites `node:test`)**, `tsc --noEmit` (`0 any`), compilación Vite `6.4.6` (`manualChunks`, **153 módulos**), auditoría SQL integral (cobertura 100.00% en 8 certificados `CONG-IND-01`, `0` tiempos inválidos, `0` no calificados, `0` futuras contaminadas), reset limpio `00`→`07.sql` + idempotencia, verificación Chromium en vivo (`390×844` y `1440×900`) para los **4 roles (`ADMIN`, `WORKER`, `AUDITOR`, `CLIENT`)**, cuentas de prueba, pipeline CSV y operación en producción. |

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
│   ├── main.ts                              # Estado global (40,429 líneas), rutas SPA, hidratación y eventos
│   ├── lib/                                 # 48 módulos de lógica pura + generated/ + 68 archivos *.test.ts
│   │   └── generated/
│   │       └── normasCatalogBundle.ts       # Respaldo offline/embebido (8 normas, 2,188 cláusulas, 2,684 tr.)
│   └── views/                               # 60 módulos de vistas HTML declarativas
└── public/
    ├── certificado/                         # Receta arquitectónica canónica Multi/Detail View
    ├── doc/                                 # Documentación técnica sincronizada del proyecto
    ├── requisitos/                          # CSV fuente Odoo (standard.clause.csv, standard.clause.translation.csv)
    ├── roadmap/                             # Plan modular de consolidación (steps 1.1..9.1 + step_final)
    └── supabase/queries/                    # Scripts SQL 00_delete_tables.sql .. 07_normas_requisitos_csv.sql
```

---

## 6. Inicio Rápido y Despliegue

- **Desarrollo:** `npm run dev` (Express 5 + Vite middleware en `http://0.0.0.0:3000`, `hmr: false`).
- **Pruebas y Calidad:** `npm run lint` (`tsc --noEmit`), `npm test` (`npx tsx --test src/lib/*.test.ts`) y `npm run build` (`vite build`).
- **Producción:** `npm run build && npm start` (`node server.ts` sirviendo `dist/` y `/api/*`).
- **Cuentas de prueba (`Password123*`):** `admin@fondonorma.test`, `worker@fondonorma.test`, `auditor@fondonorma.test`, `client@fondonorma.test`.
