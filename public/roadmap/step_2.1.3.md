# Step 2.1.3 — Motor Analítico y Alertas (`auditPlanningEngine.ts` Parte B): Span Calendario, Conflictos, Certificados Sin Programar, Historial y Alertas Configurables

## Objetivo
Completar el motor puro en `src/lib/auditPlanningEngine.ts` (o módulo complementario `src/lib/auditAlertsEngine.ts` re-exportado limpiamente) con las capacidades analíticas y de inteligencia operativa:
1. Cálculo de **Span Calendario Real vs. Días-Auditor** (`6.00d` / `2` auditores en `3` días calendario) y detección de traslape de auditores entre programas.
2. Filtro de **Certificados Sin Programar por `estatus`** (`findUnprogrammedCertificatesByStatus`).
3. Motor de **Alertas Inteligentes Configurables** (`computeAuditAlerts` con `AlertConfigEntity`).
4. Constructor de **Historial del Certificado con Evolución de Ciclos** (`Combinada → Integrada`) y rotación ISO/IEC 17021-1 (`buildCertificateAuditHistoryDigest`).

---

## Archivos a Modificar / Crear
- **Modificar:** `src/lib/auditPlanningEngine.ts` (o crear `src/lib/auditAlertsEngine.ts` si mejora modularidad)
- **Ampliar:** `src/lib/auditPlanningEngine.test.ts` (o crear `src/lib/auditAlertsEngine.test.ts`)

---

## Especificación Técnica Detallada

### 1. Rango Calendario Real vs. Días-Auditor y Conflictos de Agenda
1. **`computeAuditCalendarSpanDays(latestDate: AuditDateEntry | null): number | null`:**
   - Si `latestDate?.tipo_fecha === 'REAL'` y tiene `fecha_inicio` / `fecha_fin`, calcula días calendario inclusivos `(fecha_fin - fecha_inicio) + 1`. En otro caso retorna `null`.
2. **`validateAuditorCapacityAgainstSpan(auditorTotals, calendarSpanDays)`:**
   - Contrasta los días asignados a cada auditor contra `calendarSpanDays`:
     - Ejemplo válido sin advertencia: `6.00 días-auditor` ejecutados por `2` auditores (`3.00d` cada uno) en un rango real de `3 días calendario`.
     - Ejemplo con advertencia informativa (no bloqueante): `1` auditor con `4.00d` asignados en un rango real de `3 días calendario`.
3. **`detectAuditorScheduleConflicts(allPrograms)`:**
   - Inspecciona programas/auditorías activas no terminales (`estado_ciclo NOT IN ('Auditada', 'Cancelada')`) cuya fecha vigente sea `REAL`.
   - Si un mismo `id_auditor` aparece asignado en **dos programas distintos** cuyos rangos `[fecha_inicio, fecha_fin]` se solapan (`startA <= endB && startB <= endA`), genera una alerta de conflicto legible (códigos de programa, nombre del auditor y fechas superpuestas, **0 UUIDs**).

### 2. Filtro de Certificados Sin Programar por `estatus`
```ts
export interface UnprogrammedCertificateFilter {
  estatusIds?: string[];
  estatusNames?: string[];
  normaId?: string | null;
  organizacionId?: string | null;
  searchQuery?: string;
}
```
- **`findUnprogrammedCertificatesByStatus(certificates, allPrograms, filter)`:**
  - Selecciona certificados activos (`!deleted_at`) que no poseen ninguna `auditoria` activa con ciclo pendiente/en curso (`estado_ciclo NOT IN ('Auditada', 'Cancelada')`).
  - Permite filtrar por `certificado.estatus` (`Activo`, `Estudio`, `En Espera`, `Planificado`, `Suspendido`, etc.), norma, organización y texto de búsqueda.
  - Retorna `{ items, countsByEstatus }` para mostrar badges con conteo instantáneo por estatus en `Programación`.

### 3. Motor de Alertas Configurables (`AlertConfigEntity` + `computeAuditAlerts`)
```ts
export interface AlertConfigEntity {
  id: string;
  clave: string;
  dias_aviso_proxima: number;
  dias_aviso_preprogramada_sin_confirmar: number;
  alertar_atrasadas: boolean;
  alertar_conflicto_auditor: boolean;
  alertar_desfase_dias_o_span: boolean;
  ciclos_rotacion_auditor_lider: number;
  alertas_activas: boolean;
}
```
- `DEFAULT_AUDIT_ALERT_CONFIG`: `{ dias_aviso_proxima: 15, dias_aviso_preprogramada_sin_confirmar: 30, alertar_atrasadas: true, alertar_conflicto_auditor: true, alertar_desfase_dias_o_span: true, ciclos_rotacion_auditor_lider: 3, alertas_activas: true }`.
- **`computeAuditAlerts(programs, config, todayIso)`:**
  - Si `!config.alertas_activas`, retorna `[]`.
  - **`ATRASADA` (`rose`):** fecha vigente `REAL` (`MAX(numero_secuencia)`) con `fecha_fin < todayIso` y ciclo no terminal.
  - **`PROXIMA` (`amber`/`sky`):** fecha vigente `REAL` (`MAX(numero_secuencia)`) con `0 <= diffDays(todayIso, fecha_inicio) <= config.dias_aviso_proxima`.
  - **`PREPROGRAMADA_SIN_CONFIRMAR` (`amber`):** fecha vigente `PREPROGRAMADA_MES` cuyo inicio de mes (`YYYY-MM-01`) está dentro de `<= config.dias_aviso_preprogramada_sin_confirmar` días (o ya inició el mes) y aún no tiene fecha `REAL` ni programación completa.
  - **`CONFLICTO_AUDITOR` (`rose`):** salida de `detectAuditorScheduleConflicts`.
  - **`DESFASE_DIAS_SPAN` (`amber`):** cuando `delta !== 0` entre Cubo 1 y Cubo 2 o algún auditor excede `calendarSpanDays`.

### 4. Historial del Certificado + Evolución de Ciclos + Rotación ISO/IEC 17021-1
- **`buildCertificateAuditHistoryDigest(certId, currentAuditId, allPrograms, certDetail, rotationThreshold)`:**
  - Ordena cronológicamente los ciclos previos del certificado (más reciente primero), incluyendo `programa.etiqueta`, `programa.tipo_vinculacion` y `programa.nivel_vinculacion` para resaltar evoluciones (ej. `Ciclo previo: Combinada → Ciclo actual: Integrada`).
  - Detecta rotación de Auditor Líder cuando acumula `>= rotationThreshold` ciclos consecutivos previos (alimentado desde `config.ciclos_rotacion_auditor_lider`).
  - Lista procesos activos del certificado ausentes en la última auditoría previa.

---

## Pruebas Unitarias (`node:test`)
- `computeAuditCalendarSpanDays` y `validateAuditorCapacityAgainstSpan`: `6.00d` / `2` auditores en `3d` cal. (sin error) vs `4.00d` en `1` auditor en `3d` cal. (alerta).
- `detectAuditorScheduleConflicts`: solapamiento entre 2 programas distintos vs misma campaña sin falso positivo.
- `findUnprogrammedCertificatesByStatus`: filtrado por `Activo`, `Estudio`, `Suspendido` y conteos por estatus.
- `computeAuditAlerts`: cambio dinámico de umbrales (`dias_aviso_proxima`, `dias_aviso_preprogramada_sin_confirmar`), uso exclusivo de la **última** fecha (`MAX(numero_secuencia)`) tras una reprogramación, y desactivación con `alertas_activas = false`.
- `buildCertificateAuditHistoryDigest`: detección de evolución `Combinada → Integrada` y rotación `>= N` ciclos.

---

## Criterios de Verificación de Step 2.1.3
1. `npx tsx --test src/lib/auditPlanningEngine.test.ts` (y `auditAlertsEngine.test.ts` si aplica) pasa al 100%.
2. `npm run lint` (`tsc --noEmit`) pasa con `0` errores y `0 any`.
