# Step 2.2.2 — Persistencia Transaccional Progresiva (`src/main.ts`): `procesos_por_sitio`, Paso 1, Fechas 1:N, Paso 2 y Config Alertas

## Objetivo
Implementar todas las operaciones de escritura segura en `src/main.ts` con validación estricta RBAC (`isApprovedStaffProfile`), `assertValidUuid()`, bitácora de sesión (`recordPhase5SessionLog`), recarga de snapshot e indicadores en `#archiveGovernanceToast`, sin exponer UUIDs.

---

## Archivos a Modificar
- `src/main.ts` (funciones de mutación y persistencia transaccional del dominio `Sitio` + Bloque 1 `Auditoría`)

---

## Especificación Técnica Detallada

### 1. Mutaciones `Sitio ↔ Proceso` (`procesos_por_sitio`)
- **`upsertProcesoPorSitio(sitioId, procesoId)`:**
  - Ejecuta `validateProcesoPorSitioAssignment(sitioId, procesoId, cert)`.
  - Verifica si existía fila archivada (`deleted_at IS NOT NULL`) para restaurarla, o inserta nuevo registro en `public.procesos_por_sitio`.
  - Desvinculación mediante flujo seguro (`get_archive_dependency_summary` + `archive_record('procesos_por_sitio', id)`).

### 2. Mutaciones Paso 1 (`saveProgramaAuditoriaStep1`)
- Valida `validateProgramLinkingRules(nivel_vinculacion, tipo_vinculacion, selectedCerts)` antes de mutar.
- Upsert sobre `public.programa_auditoria` (`etiqueta`, `codigo_programa`, `nivel_vinculacion`, `tipo_vinculacion`, `es_vinculada`, `id_ciclo_origen`, `notas`).
- Sincroniza la lista de certificados vinculados en `public.auditoria`:
  - Inserta nuevas filas en `auditoria` para certificados recién añadidos (`id_programa_auditoria`, `id_certificado`, `id_tipo_auditoria`, `id_metodologia`, `codigo_auditoria`, `estado_ciclo`).
  - Actualiza `id_tipo_auditoria`, `id_metodologia`, `codigo_auditoria` y `estado_ciclo` en las ya existentes.
  - Archiva vía `archive_record('auditoria', id)` cualquier certificado retirado del programa (mostrando conteo de dependencias si tuviera datos previos).
- Si en Paso 1 se capturó una fecha inicial para el programa y una `auditoria` recién creada aún no tiene secuencias en `auditoria_fecha`, inserta su secuencia `#1` (`tag = 'Programación'`).

### 3. Gestor Multi-Fecha 1:N (`addOrUpdateAuditDateRevision`, `syncDateRevisionToProgram`)
- **`addOrUpdateAuditDateRevision(auditId, payload)`:**
  - Valida payload con `validateAuditDateEntryInput` (`PREPROGRAMADA_MES` con `anio`/`mes` o `REAL` con `fecha_inicio <= fecha_fin`).
  - Calcula `numero_secuencia = getNextAuditDateSequence(existingFechas)` y asigna `tag = numero_secuencia === 1 ? 'Programación' : 'Reprogramación'`.
  - Inserta en `public.auditoria_fecha` preservando las secuencias anteriores intactas.
  - Permite editar `observacion` o archivar una entrada errónea vía `archive_record('auditoria_fecha', dateId)`.
- **`syncDateRevisionToProgram(programId, payload)`:**
  - Cuando el staff marca *"Aplicar esta fecha a toda la campaña"*, inserta una nueva secuencia (`tag = 'Programación' | 'Reprogramación'`, misma `observacion` y fechas/mes) en cada `auditoria` activa perteneciente a `programId`.

### 4. Mutaciones Granulares Paso 2 (`Sitios → Procesos → Turnos → Auditores + Días`)
- **`upsertSitioAuditoria(auditId, sitioId, tiempoDias, modalidad)`:** inserta/reactiva o actualiza `tiempo_auditoria` (`0.25d` Cubo 1) en `sitios_por_auditoria`; excluir sitio con dependencias invoca `archive_record`.
- **`toggleProcesoSitioAuditoria(sitioAuditoriaId, procesoPorSitioId)`:** activa o archiva (`archive_record`) el enlace en `procesos_sitio_auditoria`.
- **`toggleTurnoProcesoSitioAuditoria(procesoSitioAuditoriaId, sitioAuditoriaId, turnoPorSitioId)`:** garantiza la existencia activa de `turnos_sitio_auditoria` y crea/archiva el enlace `1..N` en `turnos_proceso_sitio_auditoria`.
- **`upsertEquipoAuditorSitio(...)` y `toggleEquipoAuditorProcesoSitio(...)`:**
  - Persiste asignación en `equipo_auditor_sitio` (`tiempo_auditoria` `0.25d`, `rol_auditor`, `asignacion_completa_sitio`) o `equipo_auditor_proceso_sitio` (M:N).
  - Verifica coherencia con `public.equipo_auditor` y recalcula `auditoria.tiempo_auditoria` total desde sus sitios activos.

### 5. Configuración de Alertas (`saveAlertConfigSettings`)
- Solo `ADMIN` / `WORKER` aprobados.
- Upsert sobre `public.configuracion_alerta_auditoria` (`clave = 'DEFAULT'`), actualizando en memoria `state.auditAlertConfig` y recalculando `computeAuditAlerts` al instante con toast en `#archiveGovernanceToast`.

---

## Criterios de Verificación de Step 2.2.2
1. `npm run lint` (`tsc --noEmit`) y `npm test` pasan al 100% con `0 any`.
2. Cada mutación valida `assertValidUuid()` en todas las PK/FK antes de invocar a Supabase.
3. Un usuario `AUDITOR` o `CLIENT` que intente invocar rutas de mutación es rechazado antes del envío y protegido además por RLS.
