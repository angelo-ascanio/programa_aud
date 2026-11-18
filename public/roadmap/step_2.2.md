# Step 2.2 — Hidratación Paginada, Gobernanza de Archivo, Breadcrumbs y Persistencia Progresiva (`main.ts`)

## Objetivo
Conectar las nuevas tablas SQL (`programa_auditoria`, `auditoria_fecha`, `configuracion_alerta_auditoria`, `procesos_por_sitio`, `turnos_proceso_sitio_auditoria`, `equipo_auditor_sitio`, `equipo_auditor_proceso_sitio`) y el esquema refactorizado de `auditoria` / `sitios_por_auditoria` con la capa de estado, hidratación paginada, gobernanza de archivo lógico, breadcrumbs y mutaciones seguras (`assertValidUuid()`) en `src/main.ts`, `src/lib/archiveGovernance.ts` y `src/lib/breadcrumb.ts`.

---

## Archivos a Modificar
- `src/lib/archiveGovernance.ts`
- `src/lib/breadcrumb.ts`
- `src/main.ts`
- `src/lib/phase11SqlMigration.test.ts` / `src/lib/phase12RlsHardening.test.ts` / `src/lib/archiveGovernance.test.ts` (sincronizar contratos SQL y tablas protegidas)

---

## Especificación Técnica Detallada

### 1. Actualización de Gobernanza (`src/lib/archiveGovernance.ts`)
1. Añadir a `PROTECTED_SOFT_DELETE_TABLES` y `ArchivableTable`:
   - `'programa_auditoria'`
   - `'auditoria_fecha'`
   - `'configuracion_alerta_auditoria'`
   - `'procesos_por_sitio'`
   - `'turnos_proceso_sitio_auditoria'`
   - `'equipo_auditor_sitio'`
   - `'equipo_auditor_proceso_sitio'`
   - `'sitios_por_auditoria'`, `'turnos_sitio_auditoria'`, `'procesos_sitio_auditoria'`
2. Actualizar `computeLocalArchiveDependencySummary(...)`:
   - `case 'programa_auditoria'`: contar `auditoria` activas vinculadas (`'Auditorías vinculadas al programa/campaña'`).
   - `case 'auditoria'`: contar `auditoria_fecha`, `sitios_por_auditoria`, `comentarios_por_auditoria`, `hallazgo` activos.
   - `case 'sitio'` y `case 'proceso'`: contar `procesos_por_sitio` activos.
   - `case 'auditor'`: considerar `equipo_auditor`, `equipo_auditor_sitio` y `equipo_auditor_proceso_sitio`.
   - `case 'procesos_por_sitio'`, `'sitios_por_auditoria'`, `'procesos_sitio_auditoria'`, `'turnos_sitio_auditoria'`: espejar `get_archive_dependency_summary` de `01_creacion.sql`.
3. Añadir etiquetas en `getArchiveTableDisplayLabel(...)` (sin UUIDs) y mapear en `getDomainArchivedTables('programacion')` (incluyendo `'programa_auditoria'` y `'auditoria'`) y `('certificados')`.

### 2. Tipos de Breadcrumbs (`src/lib/breadcrumb.ts`)
- Ampliar `BreadcrumbEntityType` con:
  - `'programa_auditoria'` (Campaña / Programa en `Programación` o `Calendario`)
  - `'sitio_auditoria'` (Sitio dentro de una Auditoría)
  - `'proceso_sitio'` (Proceso vinculado a un Sitio)
- Mantener `MAX_BREADCRUMB_CHAR_LENGTH = 24` y prevención de ciclos por `entityId + entityType + subview`.

### 3. Hidratación Paralela y Paginada (`src/main.ts`)
1. **Certificados / Sitios (`loadLiveCertificates`):**
   - Hidratar `public.procesos_por_sitio` (`deleted_at IS NULL`) junto con `sitio`, `proceso` y `turnos_por_sitio` mediante `fetchAllPaged` y ensamblar `site.procesos_por_sitio` / `site.procesos_vinculados`.
2. **Programas, Auditorías, Fechas 1:N y Configuración de Alertas (`loadLiveAudits`):**
   - Consultar en paralelo con `.is('deleted_at', null)` (y archivados únicamente cuando `profile.role === 'ADMIN'`):
     - `programa_auditoria` (`codigo_programa`, `etiqueta`, `nivel_vinculacion`, `tipo_vinculacion`, `es_vinculada`, `id_ciclo_origen`, `notas`)
     - `auditoria` (`id_programa_auditoria`, `codigo_auditoria`, `id_certificado`, `id_tipo_auditoria`, `id_metodologia`, `tiempo_auditoria`, `estado_ciclo`, `objetivo` — **sin** seleccionar las columnas eliminadas `fecha_programacion` / `fecha_reprogramacion`)
     - `auditoria_fecha` (todas las revisiones ordenadas por `numero_secuencia ASC`)
     - `configuracion_alerta_auditoria` (configuración activa `clave = 'DEFAULT'`, con fallback a defaults tipados si está vacía)
     - `sitios_por_auditoria`, `turnos_sitio_auditoria`, `procesos_sitio_auditoria` (`id_procesos_por_sitio`), `turnos_proceso_sitio_auditoria`, `equipo_auditor_sitio`, `equipo_auditor_proceso_sitio`, `equipo_auditor`.
   - Ensamblar en memoria la jerarquía `ProgramaAuditoriaEntity → ProgramacionAuditEntity[] → { fechas[], latestDate, sitiosPlan[] }` y recalcular `computeProgramPlanningStatus`, `findUnprogrammedCertificatesByStatus` y `computeAuditAlerts`.
   - **Privacidad Nivel 2 y RBAC en modo offline/seed:** nunca hidratar semillas locales para `CLIENT` o `AUDITOR`; para `CLIENT`, únicamente mostrar programas/auditorías devueltas por Supabase RLS para sus organizaciones aprobadas.

### 4. Persistencia Progresiva Paso 1, Fechas 1:N, Paso 2 y Umbrales de Alerta (`src/main.ts`)
Todas las mutaciones validan `isApprovedStaffProfile(profile)`, ejecutan `assertValidUuid(...)` en PK/FK, registran `recordPhase5SessionLog` y muestran confirmación en `#archiveGovernanceToast`:

1. **`Sitio ↔ Proceso` (`upsertProcesoPorSitio`):** validación cruzada de certificado + upsert/restauración en `procesos_por_sitio`.
2. **Paso 1 — Guardar Programa y Auditorías Miembro (`saveProgramaAuditoriaStep1`):**
   - Crea o actualiza `public.programa_auditoria` (`etiqueta`, `codigo_programa`, `nivel_vinculacion`, `tipo_vinculacion`, `es_vinculada`, `id_ciclo_origen`, `notas`).
   - Valida reglas Nivel 1 (misma organización) vs Individual (`1` certificado) vs Nivel 2 (`2+` organizaciones).
   - Para cada certificado seleccionado en Paso 1: crea (si nuevo), actualiza (`id_tipo_auditoria`, `id_metodologia`, `codigo_auditoria`) o archiva vía `archive_record('auditoria', ...)` si fue desvinculado del borrador (bloqueando si tiene hallazgos activos salvo confirmación).
   - Si en Paso 1 se capturó una fecha inicial para el programa o certificado y la `auditoria` aún no tiene entradas en `auditoria_fecha`, inserta la secuencia `#1` (`tag = 'Programación'`) en `public.auditoria_fecha`.
3. **Gestor Multi-Fecha 1:N (`addOrUpdateAuditDateRevision`, `syncDateRevisionToProgram`):**
   - Añadir nueva programación (`seq = 1`, `tag = 'Programación'`) o nueva reprogramación (`seq = next`, `tag = 'Reprogramación'`, `observacion`) en `public.auditoria_fecha` (soporta `PREPROGRAMADA_MES` con `anio`/`mes` o `REAL` con `fecha_inicio`/`fecha_fin`).
   - Opción explícita **"Aplicar esta fecha a toda la campaña"** en programas vinculados: inserta/propaga la revisión de fecha a las demás `auditoria` activas del mismo `programa_auditoria` con secuencia incremental y misma `observacion`.
   - Si se archiva por error la última revisión de fecha, usa `archive_record('auditoria_fecha', id)`.
4. **Paso 2 — Mutaciones Granulares del Planificador (`upsertSitioAuditoria`, `toggleProcesoSitioAuditoria`, `toggleTurnoProcesoSitioAuditoria`, `upsertEquipoAuditorSitio`, `toggleEquipoAuditorProcesoSitio`):**
   - Idempotentes, con pasos de `0.25d`, sincronización automática de `equipo_auditor`, actualización de `auditoria.tiempo_auditoria` y archivo lógico `archive_record(...)` en desvinculaciones.
5. **Configuración de Alertas (`saveAlertConfigSettings`):**
   - Upsert sobre `public.configuracion_alerta_auditoria` (solo `ADMIN`/`WORKER`), recargando alertas en memoria al instante.

### 5. Sincronización de Tests de Migración (`phase11SqlMigration.test.ts` / `phase12RlsHardening.test.ts`)
- Actualizar las listas `CORE_TABLES`, `OPERATIONAL_CHILD_TABLES`, `PROTECTED_SOFT_DELETE_TABLES` y las aserciones de columnas/índices para reflejar `programa_auditoria`, `auditoria_fecha`, `configuracion_alerta_auditoria`, la eliminación de `fecha_programacion` / `fecha_reprogramacion` y las tablas de planificación.

---

## Criterios de Verificación de Step 2.2
1. `phase11SqlMigration.test.ts`, `phase12RlsHardening.test.ts`, `archiveGovernance.test.ts` y `breadcrumb.test.ts` pasan al 100%.
2. `loadLiveAudits()` hidrata `programa_auditoria → auditoria → auditoria_fecha` y el árbol de sitios/procesos/turnos/auditores sin errores `400`/`406` de PostgREST.
3. Todas las mutaciones usan `assertValidUuid()` y exponen `0` UUIDs en UI, toasts o breadcrumbs.
