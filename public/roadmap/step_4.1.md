# Step 4.1 — Propagación Transversal en Bloque 1 (`Auditoría`), Wizard `+ Auditoría` y Bloqueo sin `Alcance`

## Objetivo del Paso
Asegurar que todos los módulos del flujo operativo de **Bloque 1 (`Auditoría`)** y el wizard **`+ Auditoría`** resuelvan y muestren consistentemente la **`abreviacion`** de la organización y el badge **`vN`** de la versión de certificado, aíslen sitios, procesos, matriz normativa, exclusiones ISO 4.3, turnos y hallazgos estrictamente respecto a **`audit.id_certificado_version`**, y apliquen de forma visible e ineludible la regla **"los certificados sin Alcance no pueden generar auditorías"**, preservando los 4 roles RBAC.

---

## Archivos a Crear / Modificar
- `src/lib/auditWizardDomain.ts` y `src/views/auditWizardModal.ts`
- `src/lib/vinculoDomain.ts` y `src/views/vinculoView.ts`
- `src/lib/designacionTipoDomain.ts` y `src/views/designacionTipoView.ts`
- `src/lib/designacionFechaDomain.ts` y `src/views/designacionFechaView.ts`
- `src/lib/designacionSitioDomain.ts` y `src/views/designacionSitioView.ts`
- `src/lib/designacionTemporalDomain.ts` y `src/views/designacionTemporalView.ts`
- `src/lib/tiempoDomain.ts` y `src/views/tiempoView.ts`
- `src/lib/asignacionDomain.ts` y `src/views/asignacionView.ts`
- `src/lib/programaCertificadoDomain.ts`, `src/views/programaProcesosView.ts`, `src/views/programaTurnosView.ts`
- `src/lib/pipelineEngine.ts`, `src/views/calendarioView.ts`
- `src/lib/resultadoDomain.ts`, `src/views/resultadoView.ts`
- `src/lib/revisionDomain.ts`, `src/views/revisionView.ts`
- `src/lib/resumenDomain.ts`, `src/views/resumenView.ts`
- `src/lib/certificateAuditSelector.ts` y `src/views/auditSectionShell.ts`
- `src/main.ts` y pruebas unitarias/vistas afectadas (`*.test.ts`)

---

## Especificación Técnica Detallada

### 1. Bloqueo de Generación de Auditorías en Certificados sin `Alcance`
1. **`Vinculo` (`vinculoDomain.ts`, `vinculoView.ts`):**
   - Mostrar chip informativo `Sin alcance` en los certificados de un vínculo que aún no tienen `alcance` activo.
   - Bloquear botones de acción `"Generar Auditoría"` / `"Nuevo Ciclo"` cuando `summary.hasAlcance === false`, mostrando tooltip/alerta en español invitando a definir o compartir un `Alcance` en `Certificación → Certificado → Alcance`.
2. **`AuditWizardModal` (`auditWizardDomain.ts`, `auditWizardModal.ts`) y `Designación > Tipo` (`designacionTipoDomain.ts`, `designacionTipoView.ts`):**
   - Al seleccionar un vínculo/certificado en `+ Auditoría` o en `Designación > Tipo`, validar que el(los) certificado(s) tengan `alcance` activo (`hasCertificateActiveAlcance`).
   - Si falta `alcance` en alguno, deshabilitar la confirmación, listar qué certificados carecen de `Alcance` (por código de certificado y `abreviacion`, nunca por UUID) y reflejar el error traducido si la BD dispara `fn_validar_certificado_tiene_alcance()`.

### 2. Resolución Version-Scoped por Auditoría y `abreviacion`
- Crear `resolveCertVersionSnapshotForAudit(audit, allCertificadosDetailed)` devolviendo `{ versionNumero, esVersionActual, sitios, procesos, noAplicables, organizacionNombre, organizacionAbreviacion, alcance_es, alcance_en }`.
- Mostrar `organizacion_abreviacion` y chip discreto `vN` en `certificateAuditSelector.ts`, `auditSectionShell.ts` y vistas de Bloque 1.
- Al crear auditorías nuevas, asignar explícitamente `id_certificado_version` de la versión actual (`es_version_actual = TRUE`).

### 3. Aislamiento Operacional en Sub-Módulos de Bloque 1
- **`Designación > Sitio`**, **`Tiempo`**, **`Auditor`**: operar exclusivamente con las sedes pertenecientes a `audit.id_certificado_version`.
- **`Proceso`** y **`Turno`**: resolver procesos, `procesos_por_sitio` y exclusiones ISO 4.3 de `audit.id_certificado_version`.
- **`Resultado`**: restringir selección de sitios/procesos para `hallazgo` hacia `audit.id_certificado_version`.
- **`Revisión`**, **`Resumen`**, **`Calendario`**: mostrar `abreviacion`, `vN` y resumen contextual del alcance (sin truncamientos destructivos en tooltips y con `table-fixed`, `<colgroup>` 100%, `0 <button>` en `<tbody>`, y acceso acotado por rol `ADMIN`/`WORKER`/`AUDITOR`/`CLIENT`).

---

## Criterios de Aceptación y Verificación
- Intentar generar auditoría desde `+ Auditoría` o `Vínculo` para el certificado semilla sin alcance queda bloqueado con mensaje claro en español; tras definirle o compartirle un alcance, la auditoría se genera normalmente.
- Auditorías históricas en `v1` y futuras en `v2` conviven en Bloque 1 leyendo cada una exclusivamente las sedes/procesos/exclusiones de su `id_certificado_version`.
- Batería completa de Bloque 1 en `node:test`, `npm run lint` (`0 any`) y `npm run build` en verde.
