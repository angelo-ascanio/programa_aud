# Roadmap de Implementación: Consola `ADMIN` de Sincronización SQL Automática (`06_datos_prueba.sql` y `07_normas_requisitos_csv.sql`)

> Plan modular de implementación para dotar a **`programa_aud`** de una nueva sección administrativa exclusiva de **`ADMIN`** (`#database-sync` — **"Sincronización SQL"**), equivalente en jerarquía y ubicación a `Estado DB` (`#database`) y `Respaldo DB` (`#database-backup`), capaz de inspeccionar el estado vivo de PostgreSQL/Supabase y completar o actualizar de forma idempotente los archivos semilla `public/supabase/queries/06_datos_prueba.sql` y `public/supabase/queries/07_normas_requisitos_csv.sql`.

---

## 1. Objetivo General y Alcance Funcional

1. **Nueva Sección Exclusiva `ADMIN` (`#database-sync`):**
   - Accesible únicamente para usuarios autenticados con perfil **`ADMIN` (`APPROVED`)** desde el menú desplegable de cuenta en `src/views/header.ts`, junto a `Estado DB` y `Respaldo DB`.
   - Oculta en la interfaz y bloqueada tanto en enrutamiento SPA (`#/database-sync` redirige a `#/dashboard`) como en los endpoints backend (`/api/admin/db/seed-sync/*` protegidos con `requireApprovedAdmin`) para `WORKER`, `AUDITOR`, `CLIENT` y cuentas `PENDING`/`REJECTED`.

2. **Selector Jerárquico por los 3 Bloques Operativos:**
   - Muestra exactamente los **3 bloques** de la aplicación (**`Auditoría`**, **`Certificación`**, **`Extra`**) y todas las secciones/sub-secciones reales que los componen.
   - Permite marcar/desmarcar **secciones individuales** o activar **un bloque completo** mediante un selector maestro por bloque (y selección global opcional).

3. **Sincronización Inteligente BD → Scripts SQL Semilla:**
   - Al ejecutar el análisis (`preview`) y confirmación (`apply`), el servidor lee los registros vivos de PostgreSQL (activos y archivados lógicos según corresponda) y los reconcilia contra los scripts SQL del repositorio:
     - **Inserta registros faltantes** creados desde cualquier **Multi View** o **Detail View** (nuevos certificados, procesos, cláusulas asignadas, turnos, sitios, auditorías, hallazgos, expertos, etc.).
     - **Actualiza campos modificados** en registros existentes (por ejemplo, cambio de `numero_certificado`, edición de `personal_count`, cambio de `nombre_proceso`, cambios de fechas/estatus/resultados o traducciones).
     - **Refleja archivados lógicos y cambios en enlaces M:N** respetando `fn_prevent_hard_delete()` (nunca emite `DELETE` físico sobre las 57 tablas protegidas con `deleted_at`; solo sincroniza relaciones M:N puras como `requisitos_por_proceso`).

4. **Regla Estricta de Cascada Padre → Hijos:**
   - Seleccionar una sección padre incluye **automáticamente todas sus entidades hijas y puentes relacionados**.
   - **Ejemplo canónico (`Certificación → Certificado`):** Al seleccionar **`Certificado`**, se sincroniza el certificado completo junto con `certificado_version`, `alcance`, `alcance_certificado_compartido`, `sitio`, `sitio_certificado_compartido`, `fecha_certificado`, `contacto_certificado` (+ teléfonos, emails y compartidos), `proceso`, `proceso_certificado_compartido`, `procesos_por_sitio`, **`requisitos_por_proceso` (Cláusulas)**, `requisitos_no_aplicables_certificado`, `turno`, `turnos_por_sitio` y `turno_certificado_compartido`.
   - Además, el motor garantiza el **cierre mínimo de llaves foráneas (FK)** requeridas en orden topológico para que cualquier ejecución completa `00_delete_tables.sql` → `07_normas_requisitos_csv.sql` finalice sin errores de referencia ni triggers bloqueados.

5. **Caso Especial `Extra → Norma` (`07_normas_requisitos_csv.sql`):**
   - La sección **`Norma`** dentro del bloque **`Extra`** administra `norma`, `requisito` y `requisito_traduccion`, cuyo script maestro es **`public/supabase/queries/07_normas_requisitos_csv.sql`** (generado originalmente por `scripts/buildNormasSeed.ts`), **no** `06_datos_prueba.sql`.
   - El motor enruta `Extra → Norma` hacia `07_normas_requisitos_csv.sql`, preservando el árbol auto-referencial `id_requisito_padre`, `ruta_materializada::ltree`, los 7 UUIDs históricos, los overrides `obligatorio_origen = 'MANUAL'` y las traducciones HTML ES/EN.

---

## 2. Mapa Maestro de Bloques, Secciones, Tablas y Destinos SQL

| Bloque | Sección UI | Sub-sección / Cobertura | Tablas Incluidas (Orden Topológico Padre → Hijos) | Archivo Destino |
| :--- | :--- | :--- | :--- | :--- |
| **1. Auditoría** | `Calendario` | Alertas y configuración | `configuracion_alerta_auditoria` *(+ lectura de programación en calendario)* | `06_datos_prueba.sql` |
| **1. Auditoría** | `1.1 Relación` | Campañas y naturaleza | `programa_auditoria`, `auditoria` *(creación/naturaleza `tipo_vinculacion`)* | `06_datos_prueba.sql` |
| **1. Auditoría** | `1.2 Tipo` | Tipo, metodología y ciclo | `auditoria` *(`id_tipo_auditoria`, `id_metodologia`, `objetivo`, `estado_ciclo`)* | `06_datos_prueba.sql` |
| **1. Auditoría** | `1.3 Fecha` | Cronología 1:N programada | `auditoria_fecha` *(`PREPROGRAMADA_MES`, `PROGRAMADA_EXACTA`)* | `06_datos_prueba.sql` |
| **1. Auditoría** | `1.4 Sitio` | Sedes en alcance | `sitios_por_auditoria` | `06_datos_prueba.sql` |
| **1. Auditoría** | `1.5 Temporal` | Sitios temporales / obra | `auditoria_sitio_temporal`, `auditoria_sitio_temporal_certificado` | `06_datos_prueba.sql` |
| **1. Auditoría** | `2. Tiempo` | Jornadas `0.25d` | `auditoria.tiempo_auditoria`, `sitios_por_auditoria.tiempo_auditoria`, `auditoria_sitio_temporal.tiempo_auditoria` | `06_datos_prueba.sql` |
| **1. Auditoría** | `3. Auditor` | Equipo auditor y experto | `equipo_auditor_sitio`, `equipo_auditor_sitio_temporal`, `equipo_auditor_proceso_sitio`, `equipo_auditor`, `experto_tecnico_auditoria` | `06_datos_prueba.sql` |
| **1. Auditoría** | `4. Proceso` | Procesos auditados por sitio | `procesos_sitio_auditoria` | `06_datos_prueba.sql` |
| **1. Auditoría** | `5. Turno` | Turnos por sitio y proceso | `turnos_sitio_auditoria`, `turnos_proceso_sitio_auditoria` | `06_datos_prueba.sql` |
| **1. Auditoría** | `6. Resultado` | Fechas reales, NCs y cierre | `auditoria_fecha` *(`REAL`)*, `auditoria` *(cierre)*, `hallazgo`, `comentarios_por_auditoria` | `06_datos_prueba.sql` |
| **1. Auditoría** | `7. Revisión` | Revisión QA independiente | `auditoria` *(`revisado`, `fecha_revision`, `revisado_por`, `documentacion_completa`, `resumen_revision`)* | `06_datos_prueba.sql` |
| **1. Auditoría** | `Resumen` | Consolidado integral Bloque 1 | Todas las tablas anteriores de Bloque 1 en cascada ordenada | `06_datos_prueba.sql` |
| **2. Certificación** | `Conglomerado` | Agrupaciones corporativas | `grupo_empresarial` | `06_datos_prueba.sql` |
| **2. Certificación** | `Organización` | Titulares, versiones y acceso | `organizacion`, `organizacion_version`, `client_organization_access` *(filtrando FKs válidas de `profiles`)* | `06_datos_prueba.sql` |
| **2. Certificación** | `Certificado` | **Cascada Padre → Hijos completa** | `certificado`, `certificado_version`, `alcance`, `alcance_certificado_compartido`, `sitio`, `sitio_certificado_compartido`, `fecha_certificado`, `contacto_certificado`, `telefono_contacto_certificado`, `email_contacto_certificado`, `contacto_certificado_compartido`, `proceso`, `proceso_certificado_compartido`, `procesos_por_sitio`, `requisitos_por_proceso`, `requisitos_no_aplicables_certificado`, `turno`, `turnos_por_sitio`, `turno_certificado_compartido` | `06_datos_prueba.sql` |
| **2. Certificación** | `Vínculo` | Cajas agrupadoras y membresías | `vinculo`, `vinculo_certificado` | `06_datos_prueba.sql` |
| **2. Certificación** | `Auditor` | Catálogo + 3 hijas + matrices | `auditor`, `telefono_auditor`, `email_auditor`, `evaluacion_in_situ_auditor`, `norma_auditor`, `sector_iaf_auditor`, `subsector_iaf_auditor` | `06_datos_prueba.sql` |
| **2. Certificación** | `Experto` | Catálogo IAF + contacto | `experto_tecnico`, `telefono_experto_tecnico`, `email_experto_tecnico`, `sector_iaf_experto`, `subsector_iaf_experto` | `06_datos_prueba.sql` |
| **3. Extra** | `Norma` | **Caso Especial (Norma + Cláusulas + ES/EN)** | `norma`, `requisito`, `requisito_traduccion` | **`07_normas_requisitos_csv.sql`** *(y coherencia de `norma` si aplica en `06`)* |
| **3. Extra** | `Sector IAF` | Sectores y Sub-Sectores IAF | `sector_iaf`, `subsector_iaf` | `06_datos_prueba.sql` |
| **3. Extra** | `Acreditación` | Organismos, normas y sectores IAF | `organismo_acreditacion`, `acreditacion_norma`, `acreditacion_norma_sector_iaf` | `06_datos_prueba.sql` |
| **3. Extra** | `Estatus` | Estados operativos canónicos | `estatus` | `06_datos_prueba.sql` |
| **3. Extra** | `Tipo` | Tipos de auditoría y abreviaciones | `tipo_auditoria` | `06_datos_prueba.sql` |
| **3. Extra** | `Metodología` | Modalidades de auditoría | `metodologia_auditoria` | `06_datos_prueba.sql` |

> **Nota sobre `dbBackupCsv.ts`:** Durante la auditoría previa se identificó que `DB_TABLES_TOPO_ORDER` en `src/lib/dbBackupCsv.ts` cubre `64` de las `67` tablas (omitiendo `telefono_auditor`, `email_auditor` y `evaluacion_in_situ_auditor`). El catálogo nuevo del Paso 1.1 cubrirá explícitamente **todas las tablas operativas reales de las 67 tablas**, excluyendo únicamente `audit_log` (bitácora forense generada por triggers) y `profiles` (gestionada en `05_usuarios.sql`), salvo lectura de validación FK para `client_organization_access`.

---

## 3. Reglas Transversales e Invariantes Protegidos

1. **Idempotencia Estricta y Cero Colisiones (`00` → `07`):**
   - Toda sentencia emitida debe poder ejecutarse sobre una base recién creada (`00..05` → `06` → `07`) **y en una segunda corrida consecutiva** sin producir errores `23505` (unique violation), `23503` (foreign key), `27000` ni fallos en triggers de `01_creacion.sql`.
   - Se respetan exactamente los **índices únicos parciales (`WHERE deleted_at IS NULL`)** definidos en `public/supabase/queries/03_indices_optimizacion.sql`.
2. **Prohibición de `DELETE` sobre Tablas Protegidas:**
   - Las **57 tablas** protegidas por `fn_prevent_hard_delete()` (`01_creacion.sql`) y `REVOKE DELETE` (`04_rls.sql`) nunca reciben `DELETE FROM`. Las bajas se representan con `deleted_at`, `deleted_by` y `delete_reason` (si aplica).
   - Únicamente las tablas de enlace M:N puras (`requisitos_por_proceso`, `norma_auditor`, `sector_iaf_auditor`, `subsector_iaf_auditor`, `sector_iaf_experto`, `subsector_iaf_experto`) admiten reconciliación por inserción/borrado de enlaces obsoletos cuando la sección correspondiente está seleccionada.
   - `equipo_auditor` se sincroniza por triggers desde `equipo_auditor_sitio`, `equipo_auditor_sitio_temporal` y `equipo_auditor_proceso_sitio`; se respeta esa fuente de verdad para no causar inconsistencias.
3. **Preservación de Bloques e Invariantes Históricos de `06_datos_prueba.sql`:**
   - No se reescribe destructivamente el contenido manual histórico (`DO $$` blocks, comentarios de secciones 1..29, balanceo par de delimitadores `$$`, invariantes verificados por `step101SqlSchema.test.ts`, `phase11SqlMigration.test.ts`, `phase12RlsHardening.test.ts`, `expertoSeedInvariants.test.ts`, `vinculoDomain.test.ts`, `conglomeradoDomain.test.ts` y `revisionDomain.test.ts`).
   - Cuando un registro sembrado originalmente en `06_datos_prueba.sql` cambió su llave natural (ej. `numero_certificado`) o atributos, el actualizador reconcilia el registro existente por PK/identidad sin dejar filas duplicadas o conflictivas.
4. **Coherencia con Multi View y Detail View:**
   - Cualquier entidad creada, editada o archivada desde los Multi Views o Detail Views de los 3 bloques debe reflejarse fielmente en PostgreSQL y ser detectada por el flujo `Preview → Apply` de `Sincronización SQL`.
5. **Seguridad y Zero-UUID en UI:**
   - Toda la interfaz de usuario estará redactada en **español** claro, bajo el estándar **"Less Is More"** y con cumplimiento estricto de **Zero-UUID** (nunca mostrar UUIDs crudos en tarjetas, resúmenes ni mensajes de error; solo dentro del visor técnico opcional de código SQL generado).
6. **Alcance Estricto por Paso:**
   - Cada `step_*.md` debe ejecutarse de forma secuencial, verificando `npm test`, `npm run lint` y las pruebas específicas indicadas antes de pasar al siguiente paso.

---

## 4. Orden de Ejecución y Mapa de Pasos

| Paso | Archivo | Descripción Corta | Dependencias |
| :---: | :--- | :--- | :--- |
| **1.1** | [`step_1.1.md`](./step_1.1.md) | Catálogo tipado de los 3 bloques, secciones, cascada Padre→Hijos, orden topológico y metadatos de conflicto (`sqlSeedSyncCatalog.ts`). | Ninguna |
| **1.2** | [`step_1.2.md`](./step_1.2.md) | Motor puro de serialización PostgreSQL idempotente y cálculo de diferencias (`sqlSeedGenerator.ts`). | Paso 1.1 |
| **1.3** | [`step_1.3.md`](./step_1.3.md) | Reconciliador y actualizador incremental seguro para `06_datos_prueba.sql` (`sqlSeedFileUpdater.ts`). | Pasos 1.1, 1.2 |
| **2.1** | [`step_2.1.md`](./step_2.1.md) | Caso especial `Extra → Norma` sobre `07_normas_requisitos_csv.sql` (`sqlNormasSeedSync.ts`). | Pasos 1.1, 1.2 |
| **2.2** | [`step_2.2.md`](./step_2.2.md) | Endpoints Express `ADMIN` (`/api/admin/db/seed-sync/*`) en `server.ts` y cliente HTTP (`sqlSeedSyncClient.ts`). | Pasos 1.1–2.1 |
| **3.1** | [`step_3.1.md`](./step_3.1.md) | Ruta `#database-sync`, menú `ADMIN` en `header.ts`, RBAC (`healthCheck.ts`, `accessControl.ts`) y vista `databaseSeedSyncView.ts`. | Paso 2.2 |
| **3.2** | [`step_3.2.md`](./step_3.2.md) | Orquestación en `src/main.ts`, flujo Preview→Apply, visor SQL y validación de captura desde Multi/Detail Views. | Pasos 2.2, 3.1 |
| **4.1** | [`step_4.1.md`](./step_4.1.md) | Auditoría integral E2E (Multi/Detail View → Sync → `06`/`07` → Reset DB `00→07` → Chromium `ADMIN` vs no-`ADMIN`). | Pasos 1.1–3.2 |
| **Final** | [`step_final.md`](./step_final.md) | Actualización completa de `public/doc/project_resume.md` y los 4 documentos de `public/doc/architecture/`. | Paso 4.1 |
