# Step 8.1: `Programa` — Lógica Pura Multi-Anual por Certificado/Sitio/Proceso/Turnos (`src/lib/programaCertificadoDomain.ts`)

## 1. Identificador, Nombre y Dependencias
* **Step ID:** `8.1`
* **Nombre Corto (UI):** `Programa` (Mini-Paso 8A `Procesos` + Mini-Paso 8B `Turnos`)
* **Bloque / Sub-sección:** Bloque 1 — `Auditoría` → `Programa`
* **Dependencias:** `step_4.2.md` (Paso 3 + Paso 4 completos)

---

## 2. Alcance Exacto y Reglas de Negocio
1. **Compuerta de Entrada y Paralelismo:**
   * A diferencia de pasos anteriores que agrupan campañas, `Programa` trabaja **individualmente sobre cada `auditoria` (certificado específico)** que ya completó **Paso 3 (`Tipo`) AND Paso 4 (`Sitio`)**.
   * Corre **en paralelo con Pasos 5 (`Temporal`), 6 (`Tiempo`) y 7 (`Asignación`)** (no requiere esperar horas ni auditores para definir qué procesos y turnos se auditarán).
2. **Restricción Estricta a `procesos_por_sitio`:**
   * Para cada sitio seleccionado en `sitios_por_auditoria`, los procesos elegibles en **Mini-Paso 8A (`Procesos`)** son exclusivamente aquellos enlazados activamente a ese `id_sitio` en `public.procesos_por_sitio` (`deleted_at IS NULL`).
3. **Motor Histórico y Futuro por Proceso (`ProcessCycleHistorySummary`):**
   * Calcula sobre todas las auditorías históricas y futuras del **mismo `id_certificado`** (no canceladas):
     * `lastAuditedText`: ej. `"Hace 1 año (Seg. 1 · 18/11/2025)"` o **`"Nunca auditado"`** (marcado con `neverAuditedPriority: true` y alerta visual prioritaria para evitar omisiones en ciclos de 3–5 años).
     * `timesAuditedInCycle` / `totalCycleVisits`: ej. `"Auditado 1 de 3 veces"`.
     * `cycleCells`: tira compacta por visita del certificado (`Año -2 ✓`, `Año -1 —`, **`Actual ●`**, `Año +1 📅`) con detalle de turnos y auditores para alimentar el **Drawer Colapsable `"Ver Programa Anterior / Futuro"`**.
4. **Acciones Rápidas de Selección de Procesos (`computeQuickProcessSelectionDelta`):**
   * `"Seleccionar todos los Medulares"`: retorna IDs de `procesos_por_sitio` cuyo `proceso.tipo === 'Medular'` aún no marcados.
   * `"Seleccionar no auditados en el último año"`: retorna IDs cuya última auditoría sea `null` o anterior a la última visita ejecutada.
   * `"Copiar del ciclo anterior"`: retorna los `id_procesos_por_sitio` (disponibles en este sitio) que fueron auditados en la visita inmediatamente anterior.
5. **Predicados de Mini-Paso 8A y Mini-Paso 8B:**
   * `hasStep8AProcesses`: todo sitio seleccionado en `sitios_por_auditoria` tiene `>= 1` fila activa en `procesos_sitio_auditoria`.
   * `hasStep8BShifts`: `hasStep8AProcesses` es `true` Y cada `procesos_sitio_auditoria` activo tiene `>= 1` turno asignado en `turnos_proceso_sitio_auditoria`.
   * Clasificación en filtros: `'PENDIENTE_PROCESOS'` | `'PENDIENTE_TURNOS'` | `'COMPLETO'`.

---

## 3. Cambios Exactos en Base de Datos
Ninguno adicional (usa `procesos_por_sitio`, `procesos_sitio_auditoria`, `turnos_por_sitio`, `turnos_sitio_auditoria`, `turnos_proceso_sitio_auditoria` con triggers existentes en `01_creacion.sql`).

---

## 4. Lógica Pura (`src/lib/programaCertificadoDomain.ts`)

```typescript
import type {
  AuditoriaSitioPlanItem,
  ProgramaAuditoriaEntity,
} from './auditPlanningEngine';
import type { ProgramacionAuditEntity } from './auditExecution';
import type {
  ProcessEntity,
  ProcesoTipo,
} from './multisiteSampling';
import type { ProcesoPorSitioLink } from './sitioDomain';
import type { TurnoPorSitioLink } from './multisiteSampling';
import {
  resolveLatestPlannedDate,
  resolveLatestRealExecutionDate,
} from './auditPlanningEngine';
import { resolveEffectivePlannedWindow } from './designacionTipoDomain';

export type ProgramaCertCompletionState =
  | 'PENDIENTE_PROCESOS'
  | 'PENDIENTE_TURNOS'
  | 'COMPLETO';

export interface ProcessCycleCell {
  auditId: string;
  yearLabel: string;
  auditType: string;
  isCurrent: boolean;
  isFuture: boolean;
  included: boolean;
  shiftLabels: string[];
  auditorNames: string[];
}

export interface ProcessHistoryRow {
  ppsLink: ProcesoPorSitioLink;
  proceso: ProcessEntity;
  isSelectedNow: boolean;
  currentProcesoSitioAuditoriaId: string | null;
  assignedShiftIds: string[];
  neverAudited: boolean;
  notAuditedInLastVisit: boolean;
  lastAuditedText: string;
  timesAuditedInCycle: number;
  totalVisitsInCycle: number;
  cycleCells: ProcessCycleCell[];
  currentAuditIndex: number;
}

export interface AuditProgramaSummaryRow {
  audit: ProgramacionAuditEntity;
  program: ProgramaAuditoriaEntity | null;
  selectedSitesCount: number;
  totalConfiguredProcesses: number;
  sitesMissingProcesses: number;
  processesMissingShifts: number;
  totalAssignedShifts: number;
  completionState: ProgramaCertCompletionState;
  neverAuditedEligibleCount: number;
}

function getAuditOrderInfo(audit: ProgramacionAuditEntity): {
  sortKey: string;
  yearLabel: string;
  yearNum: number;
  isExecuted: boolean;
} {
  const real = resolveLatestRealExecutionDate(audit.fechas);
  if (real?.fecha_inicio) {
    return {
      sortKey: real.fecha_inicio,
      yearLabel: real.fecha_inicio.slice(0, 4),
      yearNum: Number(real.fecha_inicio.slice(0, 4)),
      isExecuted: true,
    };
  }
  const planned = resolveLatestPlannedDate(audit.fechas) ?? audit.latestDate ?? null;
  const win = resolveEffectivePlannedWindow(planned);
  if (win.startIso && win.year) {
    return {
      sortKey: win.startIso,
      yearLabel: String(win.year),
      yearNum: win.year,
      isExecuted: ['Auditada', 'Cerrada'].includes(audit.estado_ciclo),
    };
  }
  return {
    sortKey: '9999-12-31',
    yearLabel: 'S/F',
    yearNum: 9999,
    isExecuted: ['Auditada', 'Cerrada'].includes(audit.estado_ciclo),
  };
}

export function buildProcessHistoryForSite(
  currentAudit: ProgramacionAuditEntity,
  sitePlan: AuditoriaSitioPlanItem,
  siteProcesses: ReadonlyArray<ProcesoPorSitioLink>,
  allProcesses: ReadonlyArray<ProcessEntity>,
  allAudits: ReadonlyArray<ProgramacionAuditEntity>
): ProcessHistoryRow[] {
  const processById = new Map(allProcesses.filter((p) => !p.deleted_at).map((p) => [p.id, p]));
  const certAudits = allAudits
    .filter(
      (a) =>
        !a.deleted_at &&
        a.id_certificado === currentAudit.id_certificado &&
        a.estado_ciclo !== 'Cancelada'
    )
    .map((a) => ({ audit: a, ord: getAuditOrderInfo(a) }))
    .sort((x, y) => x.ord.sortKey.localeCompare(y.ord.sortKey));

  const currentIdxRaw = certAudits.findIndex((item) => item.audit.id === currentAudit.id);
  const currentIdx = currentIdxRaw >= 0 ? currentIdxRaw : 0;
  const lastExecutedBeforeCurrent = certAudits
    .slice(0, currentIdx)
    .reverse()
    .find((item) => item.ord.isExecuted);

  const selectedNowMap = new Map(
    (sitePlan.procesos || [])
      .filter((ps) => !ps.deleted_at)
      .map((ps) => [ps.id_procesos_por_sitio || ps.id_proceso, ps])
  );

  const activeLinks = siteProcesses.filter(
    (l) => !l.deleted_at && l.id_sitio === sitePlan.id_sitio && processById.has(l.id_proceso)
  );

  return activeLinks.map((pps) => {
    const proc = processById.get(pps.id_proceso)!;
    const currentPs = selectedNowMap.get(pps.id) ?? selectedNowMap.get(pps.id_proceso) ?? null;

    let lastAuditedText = 'Nunca auditado';
    let neverAudited = true;
    let auditedCount = 0;

    const cycleCells: ProcessCycleCell[] = certAudits.map((entry, idx) => {
      const a = entry.audit;
      const isCurrent = a.id === currentAudit.id;
      const isFuture = !isCurrent && idx > currentIdx;

      const matchingSite = (a.sitiosPlan || []).find(
        (sp) => !sp.deleted_at && sp.id_sitio === sitePlan.id_sitio
      );
      const matchingProc = (matchingSite?.procesos || []).find(
        (pr) => !pr.deleted_at && (pr.id_proceso === proc.id || pr.id_procesos_por_sitio === pps.id)
      );
      const included = Boolean(matchingProc);
      const shiftLabels = (matchingProc?.turnos || [])
        .filter((t) => !t.deleted_at)
        .map((t) => t.horario_label);
      const auditorNames = (matchingProc?.equipoProceso || [])
        .filter((e) => !e.deleted_at)
        .map((e) => e.auditor_nombre);

      if (included && entry.ord.isExecuted && !isCurrent) {
        auditedCount += 1;
        neverAudited = false;
        const yearsDiff = Math.max(0, certAudits[currentIdx].ord.yearNum - entry.ord.yearNum);
        const agoLabel =
          yearsDiff === 0 ? 'Este año' : yearsDiff === 1 ? 'Hace 1 año' : `Hace ${yearsDiff} años`;
        lastAuditedText = `${agoLabel} (${a.tipo_auditoria} · ${entry.ord.yearLabel})`;
      } else if (included && isCurrent && entry.ord.isExecuted) {
        auditedCount += 1;
        neverAudited = false;
      }

      return {
        auditId: a.id,
        yearLabel: entry.ord.yearLabel,
        auditType: a.tipo_auditoria,
        isCurrent,
        isFuture,
        included,
        shiftLabels,
        auditorNames,
      };
    });

    let notAuditedInLastVisit = true;
    if (lastExecutedBeforeCurrent) {
      const prevCell = cycleCells.find((c) => c.auditId === lastExecutedBeforeCurrent.audit.id);
      notAuditedInLastVisit = !(prevCell?.included);
    }

    return {
      ppsLink: pps,
      proceso: proc,
      isSelectedNow: Boolean(currentPs),
      currentProcesoSitioAuditoriaId: currentPs?.id || null,
      assignedShiftIds: (currentPs?.turnos || [])
        .filter((t) => !t.deleted_at)
        .map((t) => t.id_turnos_sitio_auditoria),
      neverAudited,
      notAuditedInLastVisit,
      lastAuditedText,
      timesAuditedInCycle: auditedCount,
      totalVisitsInCycle: certAudits.length,
      cycleCells,
      currentAuditIndex: currentIdx,
    };
  });
}

export function computeQuickProcessSelectionIds(
  rows: ReadonlyArray<ProcessHistoryRow>,
  preset: 'MEDULARES' | 'NO_AUDITADOS_ULTIMO' | 'COPIAR_ANTERIOR'
): string[] {
  const unselected = rows.filter((r) => !r.isSelectedNow);
  if (preset === 'MEDULARES') {
    return unselected.filter((r) => r.proceso.tipo === 'Medular').map((r) => r.ppsLink.id);
  }
  if (preset === 'NO_AUDITADOS_ULTIMO') {
    return unselected
      .filter((r) => r.neverAudited || r.notAuditedInLastVisit)
      .map((r) => r.ppsLink.id);
  }
  // COPIAR_ANTERIOR: procesos incluidos en la visita inmediatamente anterior
  return unselected
    .filter((r) => {
      const prevIdx = r.currentAuditIndex - 1;
      return prevIdx >= 0 && r.cycleCells[prevIdx]?.included === true;
    })
    .map((r) => r.ppsLink.id);
}

export function buildAuditProgramaSummaryRows(
  audits: ReadonlyArray<ProgramacionAuditEntity>,
  programs: ReadonlyArray<ProgramaAuditoriaEntity>,
  allProcessesPorSitio: ReadonlyArray<ProcesoPorSitioLink>,
  allProcesses: ReadonlyArray<ProcessEntity>
): AuditProgramaSummaryRow[] {
  const programById = new Map(programs.filter((p) => !p.deleted_at).map((p) => [p.id, p]));
  const result: AuditProgramaSummaryRow[] = [];

  for (const audit of audits) {
    if (audit.deleted_at) continue;
    const hasStep3 =
      Boolean(audit.id_tipo_auditoria) &&
      ((audit.fechas || []).some((f) => !f.deleted_at && f.tipo_fecha !== 'REAL') ||
        Boolean(audit.latestDate));
    const activeSites = (audit.sitiosPlan || []).filter((s) => !s.deleted_at);
    if (!hasStep3 || activeSites.length === 0) continue;

    let sitesMissingProcesses = 0;
    let totalConfiguredProcesses = 0;
    let processesMissingShifts = 0;
    let totalAssignedShifts = 0;
    let neverAuditedEligibleCount = 0;

    for (const sp of activeSites) {
      const activeProcs = (sp.procesos || []).filter((p) => !p.deleted_at);
      if (activeProcs.length === 0) sitesMissingProcesses += 1;
      totalConfiguredProcesses += activeProcs.length;

      for (const proc of activeProcs) {
        const shifts = (proc.turnos || []).filter((t) => !t.deleted_at);
        if (shifts.length === 0) processesMissingShifts += 1;
        totalAssignedShifts += shifts.length;
      }

      const history = buildProcessHistoryForSite(
        audit,
        sp,
        allProcessesPorSitio,
        allProcesses,
        audits
      );
      neverAuditedEligibleCount += history.filter((h) => h.neverAudited).length;
    }

    const completionState: ProgramaCertCompletionState =
      sitesMissingProcesses > 0 || totalConfiguredProcesses === 0
        ? 'PENDIENTE_PROCESOS'
        : processesMissingShifts > 0
        ? 'PENDIENTE_TURNOS'
        : 'COMPLETO';

    result.push({
      audit,
      program: programById.get(audit.id_programa_auditoria) ?? null,
      selectedSitesCount: activeSites.length,
      totalConfiguredProcesses,
      sitesMissingProcesses,
      processesMissingShifts,
      totalAssignedShifts,
      completionState,
      neverAuditedEligibleCount,
    });
  }

  return result;
}

export function resolveSiteShiftOptionsForProcess(
  siteId: string,
  turnosPorSitio: ReadonlyArray<TurnoPorSitioLink>
): TurnoPorSitioLink[] {
  return turnosPorSitio.filter((t) => !t.deleted_at && t.id_sitio === siteId);
}
```

---

## 5. Orquestación UI y Estado
*(Implementada en Steps 8.2 y 8.3.)*

---

## 6. Matriz RBAC del Paso 8.1

| Rol | Ve Historial de Procesos | Mutaciones Procesos/Turnos |
| :--- | :--- | :--- |
| **`ADMIN`** | Completo | Sí |
| **`WORKER`** | Completo | Sí |
| **`AUDITOR`** | Solo auditorías asignadas | No |
| **`CLIENT`** | Solo sus certificados | No |

---

## 7. Pruebas Automatizadas (`src/lib/programaCertificadoDomain.test.ts`)
1. `buildProcessHistoryForSite`: restringe procesos a `procesos_por_sitio`, marca `'Nunca auditado'` y calcula `"Hace N años"` y `"Auditado X de Y veces"`.
2. `computeQuickProcessSelectionIds`: retorna correctamente `Medulares`, `No auditados en el último año` y `Copiar del ciclo anterior`.
3. `buildAuditProgramaSummaryRows`: clasifica exactamente `PENDIENTE_PROCESOS`, `PENDIENTE_TURNOS`, `COMPLETO` y respeta compuerta `Step3 && Step4`.

---

## 8. Criterios de Aceptación (Done Criteria)
- [ ] `src/lib/programaCertificadoDomain.ts` implementado sin `any` ni exposición de UUIDs.
- [ ] Tests unitarios pasan al 100% en `npm test`.
