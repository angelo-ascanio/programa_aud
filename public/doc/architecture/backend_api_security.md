# Backend Express, Seguridad RLS y Límites de Credenciales (`programa_aud`)

> Documento técnico complementario de [`project_resume.md`](../project_resume.md). Describe el servidor Node/Express (`server.ts`), la resolución de variables en Vite (`vite.config.ts`), los servicios administrados de Supabase y el modelo completo de seguridad **DCL + Triggers + RLS** (`04_rls.sql`), incluyendo el aislamiento **Nivel 2 Inter-Org** para `CLIENT` y las compuertas de escritura de `AUDITOR`, en sincronía con las guardias RBAC del frontend (`src/lib/accessControl.ts`, `src/lib/rbac.ts`, `src/lib/archiveGovernance.ts`, `src/lib/vinculoDomain.ts` y `src/lib/conglomeradoDomain.ts`).

---

## 1. Servidor Express 5 (`server.ts`)

`server.ts` actúa como punto de entrada único tanto en desarrollo (`tsx server.ts`) como en producción (`node server.ts`), sirviendo la SPA y los endpoints `/api/*` en el mismo origen.

### 1.1 Carga de Entorno y Resolución de Puerto/Host
- Carga variables en cascada sin sobrescribir configuraciones explícitas hasta llegar a `.env`:
  1. `supabase.config.json` (solo claves de cadena no vacías y no presentes aún en `process.env`).
  2. `supabase.env` (`dotenv.config({ quiet: true })`).
  3. `.env` mediante `dotenv.config({ override: true, quiet: true })`.
- Normaliza `VITE_SUPABASE_URL` (con respaldo a `https://ufowtgmpaahyshdxlnlq.supabase.co` si falta o contiene `your-project`) y extrae el `projectRef` desde el subdominio.
- **`resolvePort()` / `resolveHost()`:** Acepta `--port` y `--host` por CLI (por defecto `0.0.0.0`). Fuera de producción (`npm start` con `NODE_ENV=production`), fuerza puerto `3000`; en producción respeta `process.env.PORT` con fallback a `3000`.

### 1.2 Rutas de API (`/api/*`)
- **`GET /api/health`:** Retorna `200 OK` con `{ ok: true }`.
- **`POST /api/reset-db`:** Reinicia de forma automatizada toda la base de datos ejecutando en orden lexicográfico estricto (`00` → `07`) los 8 archivos `.sql` contenidos en `public/supabase/queries/` (incluyendo `07_normas_requisitos_csv.sql` de `5,260` líneas / ~1.33 MB):
  - **Estrategia Dual con Fallback Automático (`runAllQueriesInOrder()`):**
    1. **Supabase Management API (prioritaria):** Si existe `VITE_SUPABASE_TOKEN`, invoca `POST https://api.supabase.com/v1/projects/{projectRef}/database/query` con `Authorization: Bearer <token>`.
    2. **Conexión PostgreSQL directa (`pg.Client`) y Fallback Automático:** Si no existe `VITE_SUPABASE_TOKEN` o `00_delete_tables.sql` falla con error de autenticación (`401`/`403`/token inválido) y existe `VITE_SUPABASE_DATABASE_KEY`, conmuta automáticamente hacia `pg.Client` conectando a `db.{projectRef}.supabase.co:5432` (`ssl: { rejectUnauthorized: false }`, `connectionTimeoutMillis: 8000`).
  - **Respuesta:** `{ ok: true, executedFiles: [{ file, durationMs }], totalDurationMs }`, o HTTP `500` `{ ok: false, error }`.

### 1.3 Modo Desarrollo vs. Modo Producción
- **Desarrollo:** Monta `vite.middlewares` con `middlewareMode: true`, `hmr: false` y `ws: false`, con fallback automático a `dist/` si Vite falla.
- **Producción:** Sirve `dist/` mediante `express.static` y fallback SPA compatible con **Express 5** para `GET`/`HEAD` fuera de `/api/*`.

---

## 2. Inyección de Configuración y Límite de Credenciales

- **`vite.config.ts`:** Lee `supabase.config.json`, `supabase.env` y `.env`, resuelve `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` y los inyecta en compilación mediante `define`. Configura `server` en `0.0.0.0:3000` (`hmr: false`, `ws: false`, `allowedHosts: true`).
- **`src/lib/supabase.ts`:** Inicializa el cliente singleton `@supabase/supabase-js` con `persistSession: true`, `autoRefreshToken: true` y `detectSessionInUrl: true`, usando exclusivamente URL pública y Anon Key.
- **Aislamiento de Secretos:** `VITE_SUPABASE_TOKEN` y `VITE_SUPABASE_DATABASE_KEY` residen únicamente en `server.ts` y jamás entran al bundle cliente.

---

## 3. Servicios Administrados de Supabase y RPCs Seguras

- **GoTrue Auth v2 (`/auth/v1/`):** Autenticación con correo/contraseña, cambio seguro de contraseña propia (`supabase.auth.updateUser`), emisión/refresco JWT y registro con `user_metadata` (`nombre`, `role`).
- **PostgREST (`/rest/v1/`):** Exposición REST de las **58 tablas** del esquema `public`, gobernada por DCL, triggers soft-delete y RLS. Tablas mayores a 1,000 filas (`requisito`: 2,188; `requisito_traduccion`: 2,684) usan paginación `.range(from, to)` vía `fetchAllPagedRows()` (`src/lib/paginatedHydration.ts`). Asimismo:
  - **`loadLiveCertificates()` (`src/main.ts`):** Hidrata certificados, **`organizacion_version`**, **`certificado_version`**, **`alcance`**, **`alcance_certificado_compartido`**, sitios, procesos, turnos, exclusiones ISO 4.3, `requisitos_por_proceso` y las **4 tablas puente compartidas** en lote (incl. `assembleSharedCertificateCollections` y `assembleSharedAlcances` de `src/lib/certificadoSharePersistence.ts`), y calcula la cobertura normativa localmente de forma isomórfica por versión (`buildCertificateCoberturaCache()` en `coverageEngine.ts`, equivalente 1:1 a `resumen_cobertura_certificado_version`), eliminando tormentas de RPCs concurrentes y previniendo timeouts HTTP `500` (`57014`) bajo RLS.
  - **`loadLiveAudits()` (`src/main.ts`):** Resuelve el `id_certificado_version` de cada auditoría y el `numero_sitio` efectivo de cada fila de `sitios_por_auditoria` consultando `sitio_certificado_compartido` por versión/certificado antes de hidratar `Sitio`, `Tiempo`, `Proceso` y `Turno`, garantizando coherencia operativa cuando una sede compartida asume un número operativo diferente en destino o existen auditorías separadas entre `v1` y `v2`.
- **PostgreSQL RPC (`/rest/v1/rpc/`):**
  - `get_archive_dependency_summary(p_table TEXT, p_record_id UUID)` (`SECURITY DEFINER`): Inspecciona dependencias activas (`deleted_at IS NULL`) sobre **29 tablas padre** (incluyendo `grupo_empresarial`, **`organizacion_version`**, **`certificado_version`**, **`alcance`**, `vinculo`, `auditoria_sitio_temporal`, `programa_auditoria`, `auditor`, `procesos_por_sitio`, `procesos_sitio_auditoria`, `sitio` Sede 0, `certificado`, etc.). Acceso revocado a `anon`, concedido solo a `authenticated`.
  - `archive_record(p_table TEXT, p_record_id UUID, p_reason TEXT DEFAULT NULL)` (`SECURITY DEFINER`): Ejecuta el archivo lógico (`deleted_at = NOW()`, `deleted_by = auth.uid()`, `delete_reason` en tablas núcleo) sobre **51 tablas protegidas** (**26 núcleo** en `v_core_tables` + **25 hijas/puentes/acceso** en `v_child_tables`, incluyendo **`organizacion_version`**, **`certificado_version`**, **`alcance`**, **`alcance_certificado_compartido`**, **`contacto_certificado_compartido`**, **`turno_certificado_compartido`**, **`proceso_certificado_compartido`**, **`sitio_certificado_compartido`**, `grupo_empresarial`, `vinculo`, `vinculo_certificado`, `auditoria_sitio_temporal*`, `equipo_auditor_sitio_temporal`, `programa_auditoria`, `auditoria_fecha`, `configuracion_alerta_auditoria`, `procesos_por_sitio`, `turnos_proceso_sitio_auditoria`, `equipo_auditor_sitio`, `equipo_auditor_proceso_sitio` y `client_organization_access`), exigiendo `is_approved_worker()` e impidiendo archivar la versión activa/única o un `alcance` con auditorías activas. Acceso revocado a `PUBLIC`/`anon`, concedido solo a `authenticated`.
  - **RPCs de Versionado de Organización (`fn_crear_version_organizacion`, `fn_resolver_cert_versiones_organizacion`):** Implementan la guardia **Anti-No-Op** en servidor y permiten vincular versiones de certificados seleccionadas hacia la nueva versión organizacional o conservar versiones históricas.
  - **RPCs de Versionado de Certificado (`fn_clonar_version_certificado`, `fn_migrar_auditorias_version_certificado`):** Clonan en 1 transacción la estructura operativa hacia `v+1` (generando **0 `fecha_certificado`** y sin versionar `alcance`) y migran las auditorías seleccionadas en las 4 categorías con remapeo exacto de sitios, procesos y hallazgos.
  - **RPC de Compartición y Reemplazo de `Alcance` (`fn_compartir_alcance_con_resolucion`):** Comparten un `alcance` dentro del conglomerado rechazando sobrescritura sin confirmación (`p_reemplazar_existentes = FALSE`) y archivando+reemplazando en transacción segura (vía GUC `app.alcance_replacement_id`) cuando el operador confirma en el Popup ES/EN, complementado en cliente por `persistShareAlcanceConResolucion`, `persistUnlinkSharedAlcance` y `persistArchiveOwnAlcance` en `certificadoSharePersistence.ts`.
  - **`fn_sync_shared_process_requisitos(p_id_proceso UUID, p_source_cert_id UUID, p_target_cert_id UUID DEFAULT NULL, p_enable_sync BOOLEAN DEFAULT TRUE)` (`SECURITY DEFINER`, revocado a `PUBLIC`/`anon`, concedido a `authenticated`):** Valida `is_approved_worker()` y pertenencia al proceso/norma; cuando origen y destino comparten la **misma norma**, activa `sincronizar_requisitos = TRUE` y sincroniza el conjunto exacto de cláusulas en `requisitos_por_proceso` respetando exclusiones ISO 4.3 (`<@`) en cada certificado destino; **rechaza con error `P0001` cualquier intento de sincronización entre normas distintas** (regla binaria). Complementado desde cliente por `src/lib/certificadoSharePersistence.ts` con compensación/rollback ante fallo parcial y traducción Zero-UUID (`translateShareDbError`).
  - `fn_desvincular_organizacion_conglomerado(p_id_organizacion UUID)`: Desvincula una organización miembro de un conglomerado multi-empresa hacia un nuevo bucket individual `grupo_empresarial` 1:1 cuando no existen vínculos o programas activos inter-organizacionales.
  - `fn_next_programa_auditoria_codigo(p_year INTEGER)` y `fn_next_auditoria_codigo(p_year INTEGER, p_cert_short TEXT)` (`SECURITY DEFINER`, guardia `is_approved_staff()`): Calculan códigos deterministas no colisionantes (`PROG-YYYY-NNN`, `AUD-YYYY-CERT-NN`) inspeccionando filas activas globales (`deleted_at IS NULL`) más allá de la caché RLS del cliente. En `src/lib/auditPlanningPersistence.ts` y `src/main.ts`, cualquier colisión `23505` reintenta de forma acotada con el siguiente código disponible y revierte vía `archive_record` los padres/hijos huérfanos si falla un lote parcial.
  - `declarar_no_aplicable_con_mutacion(p_id_certificado UUID, p_id_requisito UUID, p_justificacion TEXT, p_existing_id UUID DEFAULT NULL)` (`SECURITY DEFINER`): Valida `is_approved_worker()` y justificación (`>= 10` chars en DB / `>= 15` en UI), inserta/actualiza/restaura la exclusión ISO 4.3 por versión activa, dispara `trg_smart_prune_process_clauses_on_exclusion` para podar asignaciones afectadas (`<@`) en `requisitos_por_proceso` e inserta traza forense `smart_mutation_pruned_links` en `audit_log`.
  - `evaluar_cobertura_certificado_version(UUID)`, `cobertura_normativa_certificado_version(UUID)`, `resumen_cobertura_certificado_version(UUID)` y wrappers `*_certificado` (`SECURITY INVOKER`), más `auditor_esta_calificado`, `auditores_calificados_para_certificado`, `contacto_pertenece_a_certificado*`, `turno_pertenece_a_certificado*`, `proceso_pertenece_a_certificado*`, `sitio_pertenece_a_certificado*` y `certificado_tiene_alcance_activo(UUID)` (`SECURITY DEFINER`), todas revocadas a `PUBLIC`/`anon`.

---

## 4. Seguridad en Base de Datos: Triple Barrera DCL + Triggers + RLS (`04_rls.sql`)

### 4.1 Capa 1: Privilegios Base PostgreSQL (DCL) y Revocación de `DELETE` (**53 Tablas**)
- `GRANT USAGE ON SCHEMA public TO anon, authenticated`.
- `GRANT ALL ON ALL TABLES / SEQUENCES / ROUTINES IN SCHEMA public TO authenticated`.
- `REVOKE EXECUTE` explícito sobre `PUBLIC` y `anon` para `is_approved_staff`, `fn_is_approved_staff`, `fn_next_programa_auditoria_codigo`, `fn_next_auditoria_codigo`, `fn_desvincular_organizacion_conglomerado`, **`fn_crear_version_organizacion`**, **`fn_resolver_cert_versiones_organizacion`**, **`fn_clonar_version_certificado`**, **`fn_migrar_auditorias_version_certificado`**, **`fn_compartir_alcance_con_resolucion`**, **`fn_sync_shared_process_requisitos`**, **`contacto_pertenece_a_certificado*`**, **`turno_pertenece_a_certificado*`**, **`proceso_pertenece_a_certificado*`**, **`sitio_pertenece_a_certificado*`**, `get_archive_dependency_summary`, `archive_record`, `declarar_no_aplicable_con_mutacion`, `evaluar_cobertura_certificado*`, `cobertura_normativa_certificado*` y `resumen_cobertura_certificado*`.
- **Defensa en Profundidad (`REVOKE DELETE` en `53` tablas):**
  - **26 tablas núcleo soft-delete (`v_core_tables`):** `norma`, `requisito`, `sector_iaf`, `subsector_iaf`, `organismo_acreditacion`, `acreditacion_norma`, `estatus`, `tipo_auditoria`, `metodologia_auditoria`, `auditor`, `grupo_empresarial`, `organizacion`, **`organizacion_version`**, `certificado`, **`certificado_version`**, **`alcance`**, `fecha_certificado`, `contacto_certificado`, `sitio`, `proceso`, `turno`, `vinculo`, `programa_auditoria`, `auditoria`, `auditoria_sitio_temporal`, `hallazgo`.
  - **25 tablas operativas hijas, puentes compartidos y acceso cliente:** `requisito_traduccion`, `acreditacion_norma_sector_iaf`, `requisitos_no_aplicables_certificado`, `turnos_por_sitio`, `procesos_por_sitio`, `vinculo_certificado`, `auditoria_fecha`, `configuracion_alerta_auditoria`, `comentarios_por_auditoria`, `sitios_por_auditoria`, `auditoria_sitio_temporal_certificado`, `turnos_sitio_auditoria`, `procesos_sitio_auditoria`, `turnos_proceso_sitio_auditoria`, `equipo_auditor_sitio`, `equipo_auditor_sitio_temporal`, `equipo_auditor_proceso_sitio`, `telefono_contacto_certificado`, `email_contacto_certificado`, **`alcance_certificado_compartido`**, **`contacto_certificado_compartido`**, **`turno_certificado_compartido`**, **`proceso_certificado_compartido`**, **`sitio_certificado_compartido`**, `client_organization_access`.
  - **2 tablas de gobernanza/auditoría:** `profiles`, `audit_log`.
- El `DELETE` físico queda limitado exclusivamente a las **5 tablas de enlace M:N puras** (`norma_auditor`, `sector_iaf_auditor`, `subsector_iaf_auditor`, `requisitos_por_proceso`, `equipo_auditor`).

### 4.2 Funciones Auxiliares `SECURITY DEFINER` (7 funciones)
Todas configuradas con `STABLE SECURITY DEFINER SET search_path = public, pg_temp` y filtrado estricto de filas activas (`deleted_at IS NULL`):

| Función | Lógica de Validación |
| :--- | :--- |
| `get_auth_user_role()` | Retorna el `role` de `public.profiles` para `auth.uid()` únicamente si `status = 'APPROVED'`. |
| `is_approved_admin()` | `TRUE` si `role = 'ADMIN'` y `status = 'APPROVED'`. |
| `is_approved_worker()` | `TRUE` si `role IN ('ADMIN', 'WORKER')` y `status = 'APPROVED'`. |
| `is_assigned_auditor(p_id_auditoria)` | `TRUE` si un `ADMIN` o `AUDITOR` aprobado figura en `equipo_auditor` (sincronizada desde `equipo_auditor_sitio`, `equipo_auditor_sitio_temporal` y `equipo_auditor_proceso_sitio`) para esa auditoría activa. |
| `has_client_org_access(p_id_organizacion)` | `TRUE` si un `CLIENT` aprobado posee vínculo activo y `estado = 'APPROVED'` en `client_organization_access`. |
| `is_auditor_for_cert(p_id_certificado)` | `TRUE` si el `ADMIN`/`AUDITOR` aprobado participa en `equipo_auditor` para alguna auditoría activa del certificado activo. |
| `is_auditor_for_org(p_id_organizacion)` | `TRUE` si el `ADMIN`/`AUDITOR` aprobado participa en alguna auditoría activa vinculada a un certificado y organización activos. |

### 4.3 Protección Anti-Escalamiento en `public.profiles`
- `profiles_select` (`auth.uid() = id` o `is_approved_worker()`), `profiles_update_admin_only` (`is_approved_admin()`) y `profiles_update_self` (`auth.uid() = id`).
- Trigger `trg_protect_profile_rbac_fields` bloquea cualquier mutación de `role` o `status` que no provenga de `is_approved_admin()`, permitiendo la auto-edición segura de `nombre` (`buildSelfProfileUpdatePayload()`).

### 4.4 Matriz de Políticas RLS (**173 políticas** en **58 tablas**) y Aislamiento Nivel 2 Inter-Org

RLS está habilitado en todas las **58 tablas** de `public` sin políticas `FOR DELETE` en ninguna de las 51 tablas protegidas por soft-delete:

| Grupo de Tablas (Políticas) | `ADMIN` (Aprobado) | `WORKER` (Aprobado) | `AUDITOR` (Aprobado) | `CLIENT` (Aprobado) |
| :--- | :--- | :--- | :--- | :--- |
| **Catálogos, Traducciones, Acreditación y Turnos (13 tablas · 39 políticas)** | `SELECT` global incl. archivados + escritura + restauración (`deleted_at = NULL`) | `SELECT` activos + escritura + archivo vía `archive_record` | Lectura solo activos (`deleted_at IS NULL`) | Lectura solo activos (`deleted_at IS NULL`) |
| **Matrices de Competencia M:N (3 tablas · 9 políticas)** (`norma_auditor`, `sector_iaf_auditor`, `subsector_iaf_auditor`) | Lectura + `INSERT`/`DELETE` (`is_approved_worker()`) | Lectura + `INSERT`/`DELETE` (`is_approved_worker()`) | Lectura cuando el auditor padre está activo | Lectura cuando el auditor padre está activo |
| **`profiles` (1 tabla · 3 políticas)** | Lectura y edición total | Lectura global + auto-edición de `nombre` | Lectura y auto-edición de `nombre` | Lectura y auto-edición de `nombre` |
| **`client_organization_access` (1 tabla · 3 políticas)** | Lectura incl. archivados + gestión + archivo | Lectura activos + gestión + archivo | Solo registros propios | Lectura propios + `INSERT` auto-solicitado (`PENDING`) |
| **Conglomerados, Organizaciones/Versiones, Certificados/Versiones, `Alcance` y Puentes Compartidos (21 tablas · 63 políticas)** | Lectura global incl. archivados + versionado, compartición, sincronización, Smart Mutation y restauración | Lectura activos + versionado (`fn_crear_version_organizacion`, `fn_clonar_version_certificado`, etc.), compartición (`fn_compartir_alcance_con_resolucion`), Smart Mutation y archivo vía `archive_record` | **`grupo_empresarial` / `organizacion*` / Bloque 2:** menú oculto y bloqueado; acceso solo lectura acotado exclusivamente a certificados/versiones/alcance de sus auditorías asignadas (`is_auditor_for_org` / `is_auditor_for_cert`) | `SELECT` activos vía `has_client_org_access` sobre sus organizaciones/versiones, certificados/versiones, su `alcance` propio y **únicamente las filas de `alcance_certificado_compartido` y `*_certificado_compartido` cuyo destino pertenece a su org** (aislamiento Nivel 2 estricto: cero filtración de empresas hermanas ni botones de edición/compartición/versionado) |
| **Vínculos, Sitios Temporales y Programación Multinivel (16 tablas · 49 políticas)** | Lectura total incl. archivados + escritura y restauración | Lectura activos + escritura (incl. `configuracion_alerta_auditoria` / plazos NC `+15d/+45d`, `revisado` QA con `documentacion_completa = TRUE`) y archivo vía `archive_record` | **`SELECT` acotado** a vínculos (con redacción de `notas` ante certificados no asignados), campañas, fechas, temporales y equipos asignados (`is_assigned_auditor`), sin `+ Auditoría`, mutar cajas ni `⚙ Plazos NC` | **Aislamiento Nivel 2 Inter-Org:** En `vinculo` y `programa_auditoria` ve el contenedor si tiene al menos un certificado autorizado; `scopeVinculosForProfile()` y `vinculoView.ts` redactan `notas` de cajas `NIVEL_2_INTER_ORG` o con miembros no autorizados; en **`vinculo_certificado`**, `auditoria`, `auditoria_fecha`, `sitios_por_auditoria` (propios y compartidos), **`auditoria_sitio_temporal*`**, `turnos_sitio_auditoria`, `procesos_sitio_auditoria` y `turnos_proceso_sitio_auditoria` ve **estrictamente sus propios certificados (`has_client_org_access`)** con **cero filtración** de empresas hermanas; sin acceso a `equipo_auditor*` ni `configuracion_alerta_auditoria` |
| **Ejecución y Hallazgos (2 tablas · 6 políticas):** `hallazgo`, `comentarios_por_auditoria` | Lectura incl. archivados + escritura y restauración | Lectura activos + escritura + archivo | Lectura e `INSERT`/`UPDATE` en auditorías asignadas (`is_assigned_auditor`: fechas reales discretas + NCs por cláusula sin `id_proceso`); sin restaurar | `SELECT` estricto por `has_client_org_access` |
| **`audit_log` (1 tabla · 1 política)** | `SELECT` global (`is_approved_worker()`); inmutable | `SELECT` global (`is_approved_worker()`); inmutable | `SELECT` limitado a filas de sus auditorías/hallazgos asignados | Sin acceso (`SELECT` denegado) |

> **Consistencia Frontend–Backend:** `src/lib/accessControl.ts`, `src/lib/rbac.ts`, `src/lib/healthCheck.ts`, `src/lib/archiveGovernance.ts`, `src/lib/conglomeradoDomain.ts`, `src/lib/vinculoDomain.ts`, **`src/lib/organizacionVersionDomain.ts`**, **`src/lib/certificadoVersionDomain.ts`**, **`src/lib/alcanceDomain.ts`**, **`src/lib/certificadoShareDomain.ts`**, **`src/lib/certificadoSharePersistence.ts`**, **`src/lib/sitioShareDomain.ts`**, `src/lib/auditPlanningPersistence.ts` y `src/lib/revisionDomain.ts` garantizan **0 llamadas `.delete()`** sobre las **51 tablas** de `PROTECTED_SOFT_DELETE_TABLES`, bloquean en cliente las escrituras de roles no autorizados, filtran las vistas de `AUDITOR` y `CLIENT` (incluyendo aislamiento Nivel 2 en entidades compartidas y bloqueo de Bloque 2 para `AUDITOR`) bajo los mismos criterios que PostgREST y validan Zero-UUID antes de cada mutación.
