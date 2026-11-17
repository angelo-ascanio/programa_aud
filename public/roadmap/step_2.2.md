# Step 2.2 — Hidratación Paginada, Gobernanza de Archivo, Breadcrumbs y Persistencia Progresiva (`main.ts`)

## Objetivo
Conectar las nuevas tablas SQL (`procesos_por_sitio`, `turnos_proceso_sitio_auditoria`, `equipo_auditor_sitio`, `equipo_auditor_proceso_sitio`) y las columnas evolucionadas de `auditoria` / `sitios_por_auditoria` con la capa de estado, hidratación paginada, gobernanza de archivo lógico, breadcrumbs y mutaciones seguras (`assertValidUuid()`) en `src/main.ts`, `src/lib/archiveGovernance.ts` y `src/lib/breadcrumb.ts`.

---

## Archivos a Modificar
- `src/lib/archiveGovernance.ts`
- `src/lib/breadcrumb.ts`
- `src/main.ts`
- `src/lib/phase11SqlMigration.test.ts` / `src/lib/phase12RlsHardening.test.ts` / `src/lib/archiveGovernance.test.ts` (sincronizar listas de tablas protegidas)

---

## Especificación Técnica Detallada

### 1. Actualización de Gobernanza (`src/lib/archiveGovernance.ts`)
1. Añadir a `PROTECTED_SOFT_DELETE_TABLES` y `ArchivableTable`:
   - `'procesos_por_sitio'`
   - `'turnos_proceso_sitio_auditoria'`
   - `'equipo_auditor_sitio'`
   - `'equipo_auditor_proceso_sitio'`
   - Verificar también `'sitios_por_auditoria'`, `'turnos_sitio_auditoria'`, `'procesos_sitio_auditoria'` en `ArchivableTable` para permitir archivo granular desde las sub-vistas de planificación.
2. Actualizar `computeLocalArchiveDependencySummary(...)`:
   - `case 'sitio'`: añadir conteo local de `procesos_por_sitio` activos (`'Procesos asignados al sitio'`).
   - `case 'proceso'`: añadir conteo local de `procesos_por_sitio` activos (`'Sedes con este proceso asignado'`).
   - `case 'auditor'`: considerar también participación en `equipo_auditor_sitio` y `equipo_auditor_proceso_sitio`.
   - `case 'procesos_por_sitio'`, `'sitios_por_auditoria'`, `'procesos_sitio_auditoria'`, `'turnos_sitio_auditoria'`: reflejar exactamente la misma lógica que `get_archive_dependency_summary` en `01_creacion.sql`.
3. Añadir etiquetas en `getArchiveTableDisplayLabel(...)` (sin UUIDs) y mapear en `getDomainArchivedTables('programacion')` / `('certificados')` según corresponda.

### 2. Tipos de Breadcrumbs (`src/lib/breadcrumb.ts`)
- Ampliar `BreadcrumbEntityType` con:
  - `'sitio_auditoria'` (Sitio dentro de una Auditoría)
  - `'proceso_sitio'` (Proceso vinculado a un Sitio en Certificación / Auditoría)
- Verificar compatibilidad total con `pushBreadcrumb` (prevención de ciclos por `entityId + entityType + subview`) y `MAX_BREADCRUMB_CHAR_LENGTH = 24`.

### 3. Hidratación Paralela y Paginada (`src/main.ts`)
1. **Certificados / Sitios (`loadLiveCertificates`):**
   - Hidratar `public.procesos_por_sitio` (`deleted_at IS NULL`) junto con `sitio`, `proceso` y `turnos_por_sitio` usando paginación segura si aplica (`fetchAllPaged`) y ensamblar `site.procesos_por_sitio` y `site.procesos_vinculados` en memoria.
2. **Auditorías (`loadLiveAudits` / hidratación Bloque 1):**
   - Consultar con `.is('deleted_at', null)` (y snapshot de archivados solo para `ADMIN`):
     - `auditoria` (incluyendo `codigo_auditoria`, `fecha_fin`, `tiempo_auditoria`, `estado_ciclo`, `objetivo`)
     - `sitios_por_auditoria` (incluyendo `tiempo_auditoria`, `modalidad_evaluacion`, `fecha_inicio`, `fecha_fin`, `notas_sitio`)
     - `turnos_sitio_auditoria`
     - `procesos_sitio_auditoria` (ahora usando `id_procesos_por_sitio` + `id_proceso`)
     - `turnos_proceso_sitio_auditoria`
     - `equipo_auditor_sitio`
     - `equipo_auditor_proceso_sitio`
     - `equipo_auditor`
   - Ensamblar el árbol `audit.sitiosPlan: AuditoriaSitioPlanItem[]` y recalcular métricas derivadas (`sitiosMuestreo`, `matrizNormativa`, `equipo`, `computeAuditPlanningStatus`).
   - En modo offline / seed (sin Supabase), hidratar desde un semillero en `src/lib/` fiel a `06_datos_prueba.sql` únicamente para `ADMIN`/`WORKER` (nunca filtrar semillas a `CLIENT` o `AUDITOR`).

### 4. Operaciones CRUD y Persistencia Progresiva (`src/main.ts`)
Todas las mutaciones validan `isApprovedStaffProfile(profile)`, llaman `assertValidUuid(...)` en cada FK/PK antes de enviar a PostgREST, registran entrada en `recordPhase5SessionLog` y muestran confirmación en `#archiveGovernanceToast`:
1. **`Sitio` ↔ `Proceso` (`procesos_por_sitio`):**
   - `upsertProcesoPorSitio(sitioId, procesoId)`: verifica coherencia de certificado vía `validateProcesoPorSitioAssignment`, inserta o restaura fila previa si existía archivada (`deleted_at` vuelto a `NULL`), recarga snapshot y muestra toast.
   - Archivar vínculo mediante flujo estándar de archivo (`get_archive_dependency_summary` + `archive_record('procesos_por_sitio', id)`).
2. **Guardado Progresivo de Auditoría (`saveAuditoriaDraft`):**
   - En `'add'` o `'edit'`: permite guardar cabecera mínima (`id_certificado` obligatorio; `codigo_auditoria`, `id_tipo_auditoria`, `id_metodologia`, `fecha_programacion`, `fecha_fin`, `estado_ciclo`, `objetivo` opcionales según etapa).
   - Recalcula `tiempo_auditoria` total de la auditoría desde sus `sitios_por_auditoria` activos (o conserva meta si aún no hay sitios) y persiste en `public.auditoria`.
3. **Mutaciones Granulares del Planificador (`upsertSitioAuditoria`, `toggleProcesoSitioAuditoria`, `toggleTurnoProcesoSitioAuditoria`, `upsertEquipoAuditorSitio`, `toggleEquipoAuditorProcesoSitio`):**
   - Cada acción del árbol visual persiste de forma idempotente (o mediante lote transaccional al pulsar Guardar del formulario / acción explícita en modo edición de planificador, asegurando cero pérdida de estado del borrador DOM):
     - Activar un sitio en `sitios_por_auditoria` permite fijar `tiempo_auditoria` (Cubo 1) en pasos de `0.25d` y auto-habilita sus `turnos_sitio_auditoria` cuando se seleccionan chips de turno en un proceso.
     - Al desactivar un nodo hijo con dependencias o al desvincular, usa `archive_record(...)` en lugar de `DELETE` físico.
     - Sincroniza `equipo_auditor` cuando cambia `equipo_auditor_sitio` o `equipo_auditor_proceso_sitio`.

---

## Criterios de Verificación de Step 2.2
1. Suites de migración y gobernanza (`phase11SqlMigration.test.ts`, `phase12RlsHardening.test.ts`, `archiveGovernance.test.ts`, `breadcrumb.test.ts`) actualizadas y pasando al 100%.
2. Al iniciar sesión en vivo contra Supabase, `loadLiveAudits()` hidrata correctamente `sitiosPlan`, `turnos_proceso_sitio_auditoria`, `equipo_auditor_sitio` y `equipo_auditor_proceso_sitio` sin errores `400`/`406` de PostgREST por columnas antiguas eliminadas.
3. Ninguna mutación envía UUIDs no válidos o placeholders a Supabase (`assertValidUuid()`).
4. Cero exposición de UUIDs en UI, toasts o breadcrumbs.
