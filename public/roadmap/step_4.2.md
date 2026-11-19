# Step 4.2: `Designación → Sitio` — Lógica Pura Matriz Multi-Anual de Sitios (`src/lib/designacionSitioDomain.ts`)

## 1. Identificador, Nombre y Dependencias
* **Step ID:** `4.2`
* **Nombre Corto (UI):** `Sitio` (bajo `Designación`)
* **Bloque / Sub-sección:** Bloque 1 — `Auditoría` → `Designación` → `Sitio`
* **Dependencias:** `step_4.1.md`, `step_3.2.md`

---

## 2. Alcance Exacto y Reglas de Negocio
1. **Matriz Multi-Anual por Sitio (`SiteCycleMatrixRow`):**
   Para cada certificado dentro de la auditoría seleccionada y cada sitio candidato activo (`sortSitesWithPrincipalFirst`, colocando siempre `numero_sitio = 0` primero):
   * Calcula todas las auditorías **pasadas, actual y futuras pre-programadas** del **mismo certificado** en `allAudits`.
   * Genera columnas cronológicas ordenadas por año/fecha (`CycleVisitColumn[]`):
     * Visitas anteriores (`Año -2`, `Año -1 [Última]`) con estado `'AUDITADO'` (`✓`), `'NO_INCLUIDO'` (`—`), `'CANCELADO'`.
     * Columna **`Actual`** (`'SELECCIONADO'` `●` si está marcado en `sitios_por_auditoria`, o `'PENDIENTE'` `○` si no).
     * Visitas futuras pre-programadas (`Año +1`, `Año +2`, ...) con estado `'PREPROGRAMADO'` (`📅` si ya tiene ese sitio pre-seleccionado en el ciclo futuro, o `'SIN_DEFINIR'` `○`).
   * Calcula métricas clave visibles directamente en la tarjeta de selección:
     * `lastAuditedLabel`: ej. `"18/11/2025 · Seg. 1"` o `"Nunca auditado"`.
     * `auditedCountInCycle` / `totalVisitsInCycle`: ej. `"2 de 3 visitas en el ciclo"`.
     * `isSelectedInCurrentAudit`: `boolean`.
2. **Ventana Deslizante Responsiva (`sliceCycleWindowColumns`):**
   * Recibe `columns`, `anchorIndex` (índice de la auditoría `Actual`) y `maxVisibleCols` (`5` para desktop `1440px`, `3` o `4` para móvil `390px`) más `windowOffset` (`-N..+N`) para moverse con botones `◀ Anterior` / `Siguiente ▶` sin jamás desbordar la pantalla.
3. **Misma Cola Segura Multi-Anual que Paso 3:** Reutiliza `computeAuditUrgencyClassification` y `TipoQueuePreset` (`'PROXIMAS'`, `'PREPROGRAMADAS'`, `'FUTURO'`, `'TODAS'`) para que en la vista Multi View de `Sitio` nunca se seleccione un ciclo de `+3 años` por error.
4. **Regla de Override `tiene_sitio_temporal`:**
   * `canToggleTemporalSiteOff(audit)`: devuelve `false` + motivo claro si existen `auditoria_sitio_temporal` activos en esa auditoría (exige archivarlos primero o vaciarlos antes de apagar el toggle).

---

## 3. Cambios Exactos en Base de Datos
Ninguno adicional (consume datos de `sitio`, `sitios_por_auditoria`, `auditoria` y `auditoria_fecha`).

---

## 4. Lógica Pura (`src/lib/designacionSitioDomain.ts`)

```typescript
import {
  resolveLatestPlannedDate,
  resolveLatestRealExecutionDate,
  type ProgramaAuditoriaEntity,
} from './auditPlanningEngine';
import type { ProgramacionAuditEntity } from './auditExecution';
import { sortSitesWithPrincipalFirst, type SiteEntity } from './multisiteSampling';
import {
  computeAuditUrgencyClassification,
  resolveEffectivePlannedWindow,
  type AuditUrgencyClassification,
  type TipoQueuePreset,
} from './designacionTipoDomain';

export type SiteTimelineCellStatus =
  | 'AUDITADO'
  | 'NO_INCLUIDO'
  | 'SELECCIONADO'
  | 'PENDIENTE'
  | 'PREPROGRAMADO'
  | 'SIN_DEFINIR';

export interface SiteCycleTimelineCell {
  auditId: string;
  yearLabel: string;
  auditTypeLabel: string;
  isCurrentAudit: boolean;
  isFutureAudit: boolean;
  status: SiteTimelineCellStatus;
  shortTag: string;
  badgeClass: string;
}

export interface SiteCycleMatrixRow {
  site: SiteEntity;
  isPrincipalHq: boolean;
  isSelectedInCurrentAudit: boolean;
  canDeselect: boolean;
  lastAuditedLabel: string;
  auditedCountInWindow: number;
  totalVisitsInWindow: number;
  timelineCells: SiteCycleTimelineCell[];
  currentAuditIndex: number;
}

export interface CampaignStep4Row {
  program: ProgramaAuditoriaEntity;
  urgency: AuditUrgencyClassification;
  totalCerts: number;
  certsWithSitesCount: number;
  totalSelectedSites: number;
  hasAnyTemporalSiteEnabled: boolean;
  step4Complete: boolean;
}

export interface TemporalSiteRowLike {
  id: string;
  id_auditoria: string;
  deleted_at?: string | null;
}

function getAuditChronologyKey(audit: ProgramacionAuditEntity): {
  sortKey: string;
  yearLabel: string;
  isExecuted: boolean;
} {
  const realDate = resolveLatestRealExecutionDate(audit.fechas);
  if (realDate?.fecha_inicio) {
    return {
      sortKey: realDate.fecha_inicio,
      yearLabel: realDate.fecha_inicio.slice(0, 4),
      isExecuted: true,
    };
  }
  const planned = resolveLatestPlannedDate(audit.fechas) ?? audit.latestDate ?? null;
  const win = resolveEffectivePlannedWindow(planned);
  if (win.startIso && win.year) {
    return {
      sortKey: win.startIso,
      yearLabel: String(win.year),
      isExecuted: ['Auditada', 'Cerrada'].includes(audit.estado_ciclo),
    };
  }
  const fallback = audit.fecha_inicio || '9999-12-31';
  return {
    sortKey: fallback,
    yearLabel: /^\d{4}/.test(fallback) ? fallback.slice(0, 4) : 'S/F',
    isExecuted: ['Auditada', 'Cerrada'].includes(audit.estado_ciclo),
  };
}

export function buildSiteCycleMatrixForAudit(
  currentAudit: ProgramacionAuditEntity,
  certificateSites: ReadonlyArray<SiteEntity>,
  allAudits: ReadonlyArray<ProgramacionAuditEntity>
): SiteCycleMatrixRow[] {
  const orderedSites = sortSitesWithPrincipalFirst(
    certificateSites.filter((s) => !s.deleted_at)
  );

  const certAudits = allAudits
    .filter(
      (a) =>
        !a.deleted_at &&
        a.id_certificado === currentAudit.id_certificado &&
        a.estado_ciclo !== 'Cancelada'
    )
    .map((a) => ({ audit: a, chrono: getAuditChronologyKey(a) }))
    .sort((x, y) => x.chrono.sortKey.localeCompare(y.chrono.sortKey));

  const currentIdxRaw = certAudits.findIndex((item) => item.audit.id === currentAudit.id);
  const currentIdx = currentIdxRaw >= 0 ? currentIdxRaw : 0;

  const selectedNowIds = new Set(
    (currentAudit.sitiosPlan || []).filter((sp) => !sp.deleted_at).map((sp) => sp.id_sitio)
  );

  return orderedSites.map((site) => {
    let lastAuditedLabel = 'Nunca auditado';
    let auditedCount = 0;

    const timelineCells: SiteCycleTimelineCell[] = certAudits.map((entry, idx) => {
      const a = entry.audit;
      const isCurrent = a.id === currentAudit.id;
      const isIncluded = (a.sitiosPlan || []).some((sp) => !sp.deleted_at && sp.id_sitio === site.id);
      const isFuture = !isCurrent && idx > currentIdx;

      if (entry.chrono.isExecuted && isIncluded && !isCurrent) {
        auditedCount += 1;
        lastAuditedLabel = `${entry.chrono.sortKey.split('-').reverse().join('/')} · ${a.tipo_auditoria}`;
      } else if (isCurrent && isIncluded && entry.chrono.isExecuted) {
        auditedCount += 1;
      }

      let status: SiteTimelineCellStatus;
      let shortTag: string;
      let badgeClass: string;

      if (isCurrent) {
        if (isIncluded) {
          status = 'SELECCIONADO';
          shortTag = '● Selec.';
          badgeClass = 'bg-indigo-600 text-white border-indigo-700';
        } else {
          status = 'PENDIENTE';
          shortTag = '○ Libre';
          badgeClass = 'bg-white text-slate-600 border-slate-300';
        }
      } else if (!isFuture) {
        if (isIncluded) {
          status = 'AUDITADO';
          shortTag = '✓ Aud.';
          badgeClass = 'bg-emerald-50 text-emerald-800 border-emerald-200';
        } else {
          status = 'NO_INCLUIDO';
          shortTag = '— Omit.';
          badgeClass = 'bg-slate-50 text-slate-400 border-slate-200';
        }
      } else {
        if (isIncluded) {
          status = 'PREPROGRAMADO';
          shortTag = '📅 Pre.';
          badgeClass = 'bg-sky-50 text-sky-800 border-sky-200';
        } else {
          status = 'SIN_DEFINIR';
          shortTag = '○ Fut.';
          badgeClass = 'bg-slate-50 text-slate-500 border-slate-200';
        }
      }

      return {
        auditId: a.id,
        yearLabel: entry.chrono.yearLabel,
        auditTypeLabel: a.tipo_auditoria,
        isCurrentAudit: isCurrent,
        isFutureAudit: isFuture,
        status,
        shortTag,
        badgeClass,
      };
    });

    const selectedInCurrent = selectedNowIds.has(site.id);
    return {
      site,
      isPrincipalHq: site.numero_sitio === 0,
      isSelectedInCurrentAudit: selectedInCurrent,
      canDeselect: !selectedInCurrent || selectedNowIds.size > 1,
      lastAuditedLabel,
      auditedCountInWindow: auditedCount,
      totalVisitsInWindow: certAudits.length,
      timelineCells,
      currentAuditIndex: currentIdx,
    };
  });
}

export function sliceCycleWindowColumns<T>(
  cells: ReadonlyArray<T>,
  anchorIndex: number,
  windowOffset: number,
  maxVisibleCols: number
): { visible: T[]; canPagePrev: boolean; canPageNext: boolean; startIndex: number } {
  if (cells.length <= maxVisibleCols) {
    return {
      visible: cells.slice(),
      canPagePrev: false,
      canPageNext: false,
      startIndex: 0,
    };
  }
  const idealCenter = anchorIndex + windowOffset;
  const half = Math.floor(maxVisibleCols / 2);
  let start = idealCenter - half;
  if (start < 0) start = 0;
  if (start + maxVisibleCols > cells.length) start = cells.length - maxVisibleCols;

  return {
    visible: cells.slice(start, start + maxVisibleCols),
    canPagePrev: start > 0,
    canPageNext: start + maxVisibleCols < cells.length,
    startIndex: start,
  };
}

export function canToggleTemporalSiteOff(
  auditId: string,
  temporalSites: ReadonlyArray<TemporalSiteRowLike>
): { allowed: boolean; reason: string | null } {
  const activeCount = temporalSites.filter(
    (t) => !t.deleted_at && t.id_auditoria === auditId
  ).length;
  if (activeCount > 0) {
    return {
      allowed: false,
      reason: `Esta auditoría tiene ${activeCount} sitio(s) temporal(es) activos en Paso 5 (Temporal). Archívelos antes de desactivar el indicador temporal.`,
    };
  }
  return { allowed: true, reason: null };
}

export function buildCampaignStep4Rows(
  programs: ReadonlyArray<ProgramaAuditoriaEntity>,
  referenceIsoDate: string = new Date().toISOString().slice(0, 10)
): CampaignStep4Row[] {
  const rows: CampaignStep4Row[] = [];
  for (const program of programs) {
    if (program.deleted_at) continue;
    const activeAudits = program.auditorias.filter((a) => !a.deleted_at);
    if (activeAudits.length === 0) continue;

    const planned = resolveLatestPlannedDate(activeAudits[0]?.fechas) ??
      (activeAudits[0]?.latestDate && activeAudits[0].latestDate.tipo_fecha !== 'REAL'
        ? activeAudits[0].latestDate
        : null);
    const urgency = computeAuditUrgencyClassification(
      planned,
      activeAudits[0]?.estado_ciclo || 'Borrador',
      referenceIsoDate
    );

    const certsWithSitesCount = activeAudits.filter(
      (a) => (a.sitiosPlan || []).filter((s) => !s.deleted_at).length >= 1
    ).length;
    const totalSelectedSites = activeAudits.reduce(
      (sum, a) => sum + (a.sitiosPlan || []).filter((s) => !s.deleted_at).length,
      0
    );
    const hasAnyTemporalSiteEnabled = activeAudits.some((a) => a.tiene_sitio_temporal === true);

    rows.push({
      program,
      urgency,
      totalCerts: activeAudits.length,
      certsWithSitesCount,
      totalSelectedSites,
      hasAnyTemporalSiteEnabled,
      step4Complete: certsWithSitesCount === activeAudits.length,
    });
  }

  return rows.sort((a, b) => {
    if (a.urgency.rank !== b.urgency.rank) return a.urgency.rank - b.urgency.rank;
    return (a.urgency.effectiveStartIso || '9999-12-31').localeCompare(
      b.urgency.effectiveStartIso || '9999-12-31'
    );
  });
}

export function matchesStep4Preset(row: CampaignStep4Row, preset: TipoQueuePreset): boolean {
  if (preset === 'TODAS') return true;
  if (preset === 'FUTURO') return row.urgency.rank === 4 || row.urgency.rank === 5;
  if (preset === 'PREPROGRAMADAS') {
    const first = row.program.auditorias[0];
    const latest = resolveLatestPlannedDate(first?.fechas) ?? first?.latestDate;
    return latest?.tipo_fecha === 'PREPROGRAMADA_MES';
  }
  return row.urgency.rank <= 3 || row.urgency.bucket === 'SIN_FECHA';
}
```

---

## 5. Orquestación UI y Estado
*(Implementada en Step 4.3.)*

---

## 6. Matriz RBAC del Paso 4.2

| Rol | Ve Matriz Histórica/Futura | Selecciona/Deselecciona Sitios & Toggle Temporal |
| :--- | :--- | :--- |
| **`ADMIN`** | Completo | Sí |
| **`WORKER`** | Completo | Sí |
| **`AUDITOR`** | Solo auditorías asignadas | No (solo lectura) |
| **`CLIENT`** | Solo certificados de sus orgs | No (solo lectura) |

---

## 7. Pruebas Automatizadas (`src/lib/designacionSitioDomain.test.ts`)
1. `buildSiteCycleMatrixForAudit`: coloca `Sitio 0 (HQ)` primero, marca `lastAuditedLabel`, calcula `auditedCountInWindow` y distingue `'AUDITADO'`, `'SELECCIONADO'`, `'PREPROGRAMADO'`.
2. `canDeselect`: previene desmarcar el único sitio activo restante de una auditoría.
3. `sliceCycleWindowColumns`: garantiza ventana deslizante sin exceder `maxVisibleCols` y flags `canPagePrev`/`canPageNext` exactos.
4. `canToggleTemporalSiteOff`: bloquea apagar temporal cuando existen sitios temporales activos sin exponer UUIDs.

---

## 8. Criterios de Aceptación (Done Criteria)
- [ ] `src/lib/designacionSitioDomain.ts` implementado con tipado estricto (`0 any`).
- [ ] `designacionSitioDomain.test.ts` pasa al 100% en `npm test`.
