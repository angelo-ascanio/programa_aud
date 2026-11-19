# Step 10.2: `Resultado` — Dominio Multi-Auditor vs Días Reales, Calculadora NC y UI (`src/lib/resultadoDomain.ts`, `src/views/resultadoView.ts`)

## 1. Identificador, Nombre y Dependencias
* **Step ID:** `10.2`
* **Nombre Corto (UI):** `Resultado` (`#/auditorias/resultado`)
* **Bloque / Sub-sección:** Bloque 1 — `Auditoría` → `Resultado`
* **Dependencias:** `step_10.1.md`, `step_7.2.md`

---

## 2. Alcance Exacto y Reglas de Negocio
1. **Validación Multi-Auditor (`Días-Auditor` vs `Días Calendario Reales`):**
   * Si una auditoría suma **`6.00 días-auditor`** repartidos entre **2 auditores concurrentes** (`3.00d` cada uno) y se registran **`3.00 días calendario reales`** (`2026-10-05` a `2026-10-07`), el sistema valida `maxPerAuditorDays <= realCalendarSpanDays` (`3.00 <= 3.00 → ✓ Válido`), mostrando claramente ambos indicadores:
     * `Total Ejecución: 6.00 días-auditor`
     * `Ventana Real: 3 días calendario (2 auditores en paralelo)`
   * Solo dispara alerta de desfase/sobrecarga cuando un **único auditor** tiene asignados más días que la ventana calendario real (`maxAuditorDays > realCalendarSpanDays`).
2. **Registro de Hallazgos con Cláusula + Plazos Automáticos Configurables:**
   * Formulario integrado ligado a `id_requisito` (cláusula de la norma del certificado) y `id_proceso` (proceso auditado) + `id_sitio` opcional.
   * Previsualiza en vivo antes de guardar:
     * `Fecha Límite Plan de Acción`: `MAX(REAL.fecha_fin) + alertConfig.dias_limite_plan_accion` (ej. `+15d`).
     * `Fecha Límite Cierre Evidencia`: `MAX(REAL.fecha_fin) + alertConfig.dias_limite_cierre_nc` (ej. `+60d`).
   * Permite capturar `fecha_entrega_plan`, `fecha_cierre_real` y marcar `cerrado = true/false`.
   * Incluye panel parametrizable para `ADMIN`/`WORKER` de los días offset (`dias_limite_plan_accion`, `dias_limite_cierre_nc`) en `configuracion_alerta_auditoria`.
3. **Cálculo por Defecto y Edición de `fecha_cierre_auditoria`:**
   * **`computeDefaultAuditClosingDate(realDates, findings)`:**
     * Cuenta `ncs = findings.filter(f => !f.deleted_at && (f.tipo === 'NC_MAYOR' || f.tipo === 'NC_MENOR'))`.
     * Si `ncs.length === 0`: retorna `lastRealEndDate` (última fecha `REAL`, editable si el cierre administrativo llegó días después).
     * Si `ncs.length >= 1`: retorna `MAX(nc.fecha_limite_cierre)` (o `MAX(nc.fecha_cierre_real)` si todas ya están cerradas).
   * Botón **`"Cerrar Auditoría (Habilitar Revisión)"`**: valida `fecha_cierre_auditoria`, persiste `estado_ciclo = 'Cerrada'` + `fecha_cierre_auditoria`, y muestra enlace directo **"Ir a Paso 11: Revisión →"**.

---

## 3. Cambios Exactos en Base de Datos
Ninguno adicional (usa los triggers y columnas creadas en Step 10.1).

---

## 4. Lógica Pura (`src/lib/resultadoDomain.ts` + actualización `auditAlertsEngine.ts`)

```typescript
import { assertValidUuid, isValidUuid } from './zeroUuid';
import {
  computeAuditCalendarSpanDays,
  validateAuditorCapacityAgainstSpan,
  type AlertConfigEntity,
} from './auditAlertsEngine';
import {
  resolveLatestRealExecutionDate,
  roundAuditDaysQuarter,
  type AuditDateEntry,
} from './auditPlanningEngine';
import type { Phase5FindingEntity, ProgramacionAuditEntity } from './auditExecution';
import type { AuditoriaSitioTemporalEntity } from './designacionTemporalDomain';

export interface MultiAuditorSpanSummary {
  hasRealDates: boolean;
  realStartIso: string | null;
  realEndIso: string | null;
  realCalendarSpanDays: number;
  totalAuditorDays: number;
  distinctAuditorsCount: number;
  maxDaysSingleAuditor: number;
  isConcurrentScheduleValid: boolean;
  explanationLabel: string;
}

export interface ComputedFindingDeadlines {
  baseRealEndIso: string;
  fechaLimitePlan: string;
  fechaLimiteCierre: string;
  planOffsetDays: number;
  cierreOffsetDays: number;
}

export function addCalendarDaysIso(isoDate: string, daysToAdd: number): string {
  const baseMs = Date.parse(`${isoDate}T00:00:00Z`);
  if (!Number.isFinite(baseMs)) return isoDate;
  const target = new Date(baseMs + daysToAdd * 86_400_000);
  return target.toISOString().slice(0, 10);
}

export function evaluateRealExecutionCapacity(
  audit: ProgramacionAuditEntity,
  temporalSites: ReadonlyArray<AuditoriaSitioTemporalEntity>,
  overrideRealStart?: string | null,
  overrideRealEnd?: string | null
): MultiAuditorSpanSummary {
  const realEntry = resolveLatestRealExecutionDate(audit.fechas);
  const realStart = overrideRealStart || realEntry?.fecha_inicio || null;
  const realEnd = overrideRealEnd || realEntry?.fecha_fin || realStart;

  const daysByAuditor = new Map<string, number>();
  let totalAuditorDays = 0;

  for (const sp of (audit.sitiosPlan || []).filter((s) => !s.deleted_at)) {
    for (const member of (sp.equipoSitio || []).filter((m) => !m.deleted_at)) {
      const d = member.tiempo_auditoria || 0;
      totalAuditorDays += d;
      daysByAuditor.set(member.id_auditor, (daysByAuditor.get(member.id_auditor) || 0) + d);
    }
  }

  for (const ts of temporalSites.filter((t) => !t.deleted_at)) {
    const applies =
      ts.id_auditoria === audit.id ||
      ts.certificados.some((c) => !c.deleted_at && c.id_auditoria_certificado === audit.id);
    if (!applies) continue;
    for (const member of ts.equipoTemporal.filter((m) => !m.deleted_at)) {
      const d = member.tiempo_auditoria || 0;
      totalAuditorDays += d;
      daysByAuditor.set(member.id_auditor, (daysByAuditor.get(member.id_auditor) || 0) + d);
    }
  }

  totalAuditorDays = roundAuditDaysQuarter(totalAuditorDays);
  const maxDaysSingleAuditor = roundAuditDaysQuarter(
    Math.max(0, ...Array.from(daysByAuditor.values()))
  );

  if (!realStart || !realEnd) {
    return {
      hasRealDates: false,
      realStartIso: null,
      realEndIso: null,
      realCalendarSpanDays: 0,
      totalAuditorDays,
      distinctAuditorsCount: daysByAuditor.size,
      maxDaysSingleAuditor,
      isConcurrentScheduleValid: false,
      explanationLabel: 'Registre fechas reales de ejecución para comparar con los días-auditor.',
    };
  }

  const realCalendarSpanDays = computeAuditCalendarSpanDays(realStart, realEnd);
  const capacityCheck = validateAuditorCapacityAgainstSpan(audit, realStart, realEnd);
  const isConcurrentScheduleValid =
    capacityCheck.valid && maxDaysSingleAuditor <= realCalendarSpanDays + 0.001;

  const explanationLabel = isConcurrentScheduleValid
    ? `${totalAuditorDays.toFixed(2)} días-auditor cubiertos en ${realCalendarSpanDays} día(s) calendario con ${daysByAuditor.size || 1} auditor(es) concurrente(s).`
    : `Alerta de capacidad: un auditor acumula ${maxDaysSingleAuditor.toFixed(2)}d frente a ${realCalendarSpanDays} día(s) calendario reales.`;

  return {
    hasRealDates: true,
    realStartIso: realStart,
    realEndIso: realEnd,
    realCalendarSpanDays,
    totalAuditorDays,
    distinctAuditorsCount: daysByAuditor.size,
    maxDaysSingleAuditor,
    isConcurrentScheduleValid,
    explanationLabel,
  };
}

export function computeFindingDeadlinesFromRealDate(
  realEndIso: string,
  config: Pick<AlertConfigEntity, 'dias_limite_plan_accion' | 'dias_limite_cierre_nc'>
): ComputedFindingDeadlines {
  const planOffset = config.dias_limite_plan_accion ?? 15;
  const cierreOffset = config.dias_limite_cierre_nc ?? 60;
  return {
    baseRealEndIso: realEndIso,
    fechaLimitePlan: addCalendarDaysIso(realEndIso, planOffset),
    fechaLimiteCierre: addCalendarDaysIso(realEndIso, cierreOffset),
    planOffsetDays: planOffset,
    cierreOffsetDays: cierreOffset,
  };
}

export function computeDefaultAuditClosingDate(
  realEndIso: string | null,
  findings: ReadonlyArray<Phase5FindingEntity>
): string | null {
  const activeNcs = findings.filter(
    (f) => !f.deleted_at && (f.tipo === 'NC_MAYOR' || f.tipo === 'NC_MENOR')
  );
  if (activeNcs.length === 0) {
    return realEndIso;
  }
  const allClosedWithDates =
    activeNcs.every((nc) => nc.cerrado && Boolean(nc.fecha_cierre_real || nc.fecha_cierre));
  if (allClosedWithDates) {
    const closeDates = activeNcs
      .map((nc) => nc.fecha_cierre_real || nc.fecha_cierre || '')
      .filter(Boolean)
      .sort();
    return closeDates[closeDates.length - 1] || realEndIso;
  }
  const dueDates = activeNcs
    .map((nc) => nc.fecha_limite_cierre || nc.fecha_limite || '')
    .filter(Boolean)
    .sort();
  return dueDates[dueDates.length - 1] || realEndIso;
}

export function validateCloseAuditAction(
  auditId: string,
  realEndIso: string | null,
  closingDateIso: string
): string | null {
  assertValidUuid(auditId, 'auditoría');
  if (!realEndIso || !/^\d{4}-\d{2}-\d{2}$/.test(realEndIso)) {
    return 'Debe registrar al menos una fecha REAL de ejecución antes de cerrar la auditoría.';
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(closingDateIso)) {
    return 'Indique una Fecha de Cierre de Auditoría válida (YYYY-MM-DD).';
  }
  if (closingDateIso < realEndIso) {
    return 'La Fecha de Cierre de Auditoría no puede ser anterior a la última fecha real de ejecución.';
  }
  return null;
}
```

---

## 5. Orquestación UI y Estado (`src/views/resultadoView.ts` y `src/main.ts`)
* Actualizar `Phase5FindingEntity` en `src/lib/auditExecution.ts` añadiendo `fecha_limite_plan?: string | null; fecha_entrega_plan?: string | null; fecha_limite_cierre?: string | null; fecha_cierre_real?: string | null;`.
* En `resultadoView.ts` (preservando tabla Clean List `<colgroup>` suma `100%` y cero `<button>` en `<tbody>`):
  1. **Panel Superior de Ejecución Real & Conciliación:**
     * Muestra fechas programadas vs formulario de registro de fechas **`REAL`** (`fecha_inicio`, `fecha_fin`, `observacion`).
     * Tarjeta de Conciliación Concurrente: `"Días-Auditor: X.XXd | Días Calendario Reales: Yd (N auditores)"`.
  2. **Tablero de Hallazgos (`hallazgo`) y Plazos NC:**
     * Tabla Clean List con columnas `Tipo` (`14%`), `Cláusula & Proceso` (`22%`), `Desviación` (`28%`), `Límite Plan` (`12%`), `Límite Cierre` (`12%`), `Estatus` (`12%`) = `100%`.
     * Drawer/Form de registro de hallazgo vinculando `id_requisito` + `id_proceso` + `id_sitio` y mostrando vista previa en tiempo real de `fecha_limite_plan` (`+N días`) y `fecha_limite_cierre` (`+M días`).
  3. **Panel Inferior de Cierre de Auditoría (`fecha_cierre_auditoria`):**
     * Input `type="date"` pre-llenado con `computeDefaultAuditClosingDate()` (editable por `ADMIN`/`WORKER`) + texto explicativo automático (`"Sin NCs: igual a última fecha real"` o `"Con N NCs: igual a último vencimiento NC"`).
     * Botón **`"Marcar Auditoría como Cerrada →"`** que desbloquea **Paso 11 (`Revisión`)**.

---

## 6. Matriz RBAC del Paso 10.2

| Rol | Ve `Resultado` | Registra Fechas `REAL` | Registra/Edita `hallazgo` | Cierra Auditoría (`'Cerrada'`) |
| :--- | :--- | :--- | :--- | :--- |
| **`ADMIN`** | Todos | Sí | Sí + Archivar/Restaurar | Sí |
| **`WORKER`** | Todos activos | Sí | Sí + Archivar | Sí |
| **`AUDITOR`** | Solo asignadas | No (solo lectura) | Sí (en sus asignadas) | No |
| **`CLIENT`** | Solo sus orgs | No | Solo lectura | No |

---

## 7. Pruebas Automatizadas (`src/lib/resultadoDomain.test.ts`)
1. `evaluateRealExecutionCapacity`: confirma que `6.00 días-auditor` ejecutados por `2 auditores` (`3.00d` c/u) en `3 días calendario` es **válido (`isConcurrentScheduleValid = true`)**, mientras que `1 auditor` con `4.00d` en `3 días calendario` dispara alerta.
2. `computeFindingDeadlinesFromRealDate`: suma exactamente `+15` y `+60` días (o offsets configurados) sobre `MAX(REAL.fecha_fin)`.
3. `computeDefaultAuditClosingDate`: retorna `realEndIso` con `0` NCs y `MAX(fecha_limite_cierre)` con `>=1` NCs abiertas.
4. `validateCloseAuditAction`: bloquea cerrar si falta fecha `REAL` o si `closingDate < realEndIso`.

---

## 8. Criterios de Aceptación (Done Criteria)
- [ ] Registro de fechas `REAL` independiente de fechas programadas, soportando ejecución concurrente de múltiples auditores sin falsos positivos.
- [ ] Hallazgos NC calculan y muestran automáticamente `fecha_limite_plan` y `fecha_limite_cierre` desde parámetros configurables.
- [ ] `fecha_cierre_auditoria` se pre-calcula correctamente (0 NCs vs >=1 NCs), es editable y transiciona a `'Cerrada'` habilitando `Revisión`.
