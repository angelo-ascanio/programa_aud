# Step 2.2.1 — Gobernanza de Archivo, Breadcrumbs, Hidratación Paginada y Tests de Migración SQL/RLS

## Objetivo
Preparar la infraestructura compartida de aplicación y pruebas antes de implementar las mutaciones UI:
1. Registrar las nuevas tablas en `src/lib/archiveGovernance.ts` y nuevos tipos en `src/lib/breadcrumb.ts`.
2. Implementar la **hidratación paginada de lectura** en `src/main.ts` (`procesos_por_sitio`, `programa_auditoria`, `auditoria`, `auditoria_fecha`, `configuracion_alerta_auditoria`, y árbol de sitios/procesos/turnos/auditores).
3. Sincronizar las suites existentes `phase11SqlMigration.test.ts`, `phase12RlsHardening.test.ts`, `archiveGovernance.test.ts` y `breadcrumb.test.ts` con el nuevo esquema SQL.

---

## Archivos a Modificar
- `src/lib/archiveGovernance.ts`
- `src/lib/breadcrumb.ts`
- `src/main.ts` (sección de hidratación `loadLiveCertificates` y `loadLiveAudits` + estado de configuración de alertas)
- `src/lib/phase11SqlMigration.test.ts`
- `src/lib/phase12RlsHardening.test.ts`
- `src/lib/archiveGovernance.test.ts`
- `src/lib/breadcrumb.test.ts`

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
   - `case 'programa_auditoria'`: contar `auditoria` activas vinculadas.
   - `case 'auditoria'`: contar `auditoria_fecha`, `sitios_por_auditoria`, `comentarios_por_auditoria`, `hallazgo` activos.
   - `case 'sitio'` y `case 'proceso'`: contar `procesos_por_sitio` activos.
   - `case 'auditor'`: incluir `equipo_auditor`, `equipo_auditor_sitio` y `equipo_auditor_proceso_sitio`.
   - `case 'procesos_por_sitio'`, `'sitios_por_auditoria'`, `'procesos_sitio_auditoria'`, `'turnos_sitio_auditoria'`: espejar exactamente `get_archive_dependency_summary` de `01_creacion.sql`.
3. Añadir etiquetas humanas en `getArchiveTableDisplayLabel(...)` (sin UUIDs) y mapear en `getDomainArchivedTables('programacion')` (incluyendo `'programa_auditoria'` y `'auditoria'`) y `('certificados')`.

### 2. Breadcrumbs (`src/lib/breadcrumb.ts`)
- Ampliar `BreadcrumbEntityType` con `'programa_auditoria'`, `'sitio_auditoria'` y `'proceso_sitio'`.
- Preservar `MAX_BREADCRUMB_CHAR_LENGTH = 24` y prevención de ciclos por `entityId + entityType + subview`.

### 3. Hidratación Paralela y Paginada (`src/main.ts`)
1. **Certificados / Sitios (`loadLiveCertificates`):**
   - Hidratar `public.procesos_por_sitio` (`deleted_at IS NULL`) mediante `fetchAllPaged` y ensamblar `site.procesos_por_sitio` / `site.procesos_vinculados`.
2. **Programas, Auditorías, Fechas 1:N y Alertas (`loadLiveAudits`):**
   - Consultar en paralelo con `.is('deleted_at', null)` (y archivados únicamente si `profile.role === 'ADMIN'`):
     - `programa_auditoria`
     - `auditoria` (**sin** `fecha_programacion` / `fecha_reprogramacion`)
     - `auditoria_fecha` (ordenada por `numero_secuencia ASC`)
     - `configuracion_alerta_auditoria` (con fallback a `DEFAULT_AUDIT_ALERT_CONFIG`)
     - `sitios_por_auditoria`, `turnos_sitio_auditoria`, `procesos_sitio_auditoria`, `turnos_proceso_sitio_auditoria`, `equipo_auditor_sitio`, `equipo_auditor_proceso_sitio`, `equipo_auditor`.
   - Ensamblar `ProgramaAuditoriaEntity[] → ProgramacionAuditEntity[] → { fechas[], latestDate, sitiosPlan[] }` y recalcular `computeProgramPlanningStatus`, `findUnprogrammedCertificatesByStatus` y `computeAuditAlerts`.
   - **Privacidad RBAC:** nunca hidratar semillas locales para `CLIENT` o `AUDITOR`.

### 4. Sincronización de Tests de Migración (`phase11SqlMigration.test.ts` / `phase12RlsHardening.test.ts`)
- Actualizar listas de tablas core/child, triggers, `REVOKE DELETE`, `archive_record`, eliminación de `fecha_programacion`/`fecha_reprogramacion`/`id_turnos_sitio_auditoria` y validación de nuevos índices parciales.

---

## Criterios de Verificación de Step 2.2.1
1. `npm test` (incluyendo `phase11SqlMigration.test.ts`, `phase12RlsHardening.test.ts`, `archiveGovernance.test.ts`, `breadcrumb.test.ts`) pasa al 100%.
2. `npm run lint` (`tsc --noEmit`) pasa con `0` errores y `0 any`.
3. `loadLiveAudits()` hidrata sin errores `400`/`406` de PostgREST en Supabase en vivo.
