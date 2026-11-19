# Step 3.2: `Designación → Tipo` — Lógica Pura Multi-Anual, Algoritmo de "Revivificación" y Reprogramaciones (`src/lib/designacionTipoDomain.ts`)

## 1. Identificador, Nombre y Dependencias
* **Step ID:** `3.2`
* **Nombre Corto (UI):** `Tipo` (bajo `Designación`)
* **Bloque / Sub-sección:** Bloque 1 — `Auditoría` → `Designación` → `Tipo`
* **Dependencias:** `step_3.1.md`, `step_2.2.md`

---

## 2. Alcance Exacto y Reglas de Negocio
1. **Separación Limpia entre Fecha Programada y Fecha Real:**
   * En `src/lib/auditPlanningEngine.ts`, actualizar `AuditDatePrecision = 'PREPROGRAMADA_MES' | 'PROGRAMADA_EXACTA' | 'REAL'`.
   * Exponer `resolveLatestPlannedDate(fechas)` (considera solo `PREPROGRAMADA_MES` y `PROGRAMADA_EXACTA` ordenadas por `numero_secuencia DESC`) y `resolveLatestRealExecutionDate(fechas)` (solo `REAL`).
2. **Clasificador de Urgencia y Algoritmo de "Revivificación" (`computeAuditUrgencyClassification`):**
   * Convierte la fecha programada vigente en ventana efectiva `[effectiveStart, effectiveEnd]`:
     * Para `PROGRAMADA_EXACTA`: `[fecha_inicio, fecha_fin]`.
     * Para `PREPROGRAMADA_MES`: `[YYYY-MM-01, últimoDíaMes(YYYY, MM)]`.
   * Buckets numéricos ascendentes (`0..5`):
     * `0` — `'VENCIDA'`: `effectiveEnd < todayIso` y `estado_ciclo NOT IN ('Auditada', 'Cerrada', 'Cancelada')`.
     * `1` — `'PROXIMA_30D'`: `0 <= daysUntilStart <= 30`.
     * `2` — `'ESTE_TRIMESTRE'`: `31 <= daysUntilStart <= 90`.
     * `3` — `'ESTE_ANIO'`: `effectiveYear === todayYear && daysUntilStart > 90`.
     * `4` — `'ANIO_MAS_1'`: `effectiveYear === todayYear + 1`.
     * `5` — `'FUTURO_LEJANO'`: `effectiveYear >= todayYear + 2`.
     * `6` — `'SIN_FECHA'`: no tiene fecha programada aún.
   * **"Revivificación" Automática:** Al avanzar la fecha del sistema (`referenceDate`), registros pre-programados en `Año +1` o `Año +2` transitan automáticamente sin mutar base de datos a `ESTE_ANIO`, `ESTE_TRIMESTRE` y `PROXIMA_30D`, apareciendo en la cola por defecto `"Próximas a ejecutar"`.
3. **Ordenamiento Default Seguro:**
   * `sortCampaignsByImminence()`: ordena siempre por `urgencyRank ASC`, luego `effectiveStart ASC`. Las campañas de `2029` nunca aparecen arriba de las de `2026`.
4. **Protección Anti-Error `+1/+3 Años` (`requiresFutureYearWarning`):**
   * Si el usuario abre para edición un programa cuya ventana vigente tiene `urgencyRank >= 4` (`Año +1` o `Año +2/+3`), retorna banner preventivo: *"Atención: este ciclo está programado para el año YYYY (futuro). Confirme que desea modificar el ciclo futuro y no la auditoría vigente."*
5. **Validación de Campaña Paso 3 (`validateStep3CampaignInput`):**
   * Exige un `vinculo` activo (`INDIVIDUAL` o `VINCULADO`, nunca certificados `LIBRE`).
   * Exige fecha inicial válida (`PREPROGRAMADA_MES` o `PROGRAMADA_EXACTA`, nunca `REAL` en Paso 3).
   * Exige `id_tipo_auditoria` válido (`assertValidUuid`) para **cada certificado** del vínculo.

---

## 3. Cambios Exactos en Base de Datos
Ninguno adicional (usa `auditoria_fecha` actualizado en Step 3.1).

---

## 4. Lógica Pura (`src/lib/designacionTipoDomain.ts` + actualización en `auditPlanningEngine.ts`)

### 4.1 `src/lib/auditPlanningEngine.ts`
```typescript
export type AuditDatePrecision = 'PREPROGRAMADA_MES' | 'PROGRAMADA_EXACTA' | 'REAL';

export function resolveLatestPlannedDate(
  fechas: ReadonlyArray<AuditDateEntry> | undefined
): AuditDateEntry | null {
  if (!fechas || fechas.length === 0) return null;
  const active = fechas
    .filter((f) => !f.deleted_at && f.tipo_fecha !== 'REAL')
    .slice()
    .sort((a, b) => b.numero_secuencia - a.numero_secuencia);
  return active[0] ?? null;
}

export function resolveLatestRealExecutionDate(
  fechas: ReadonlyArray<AuditDateEntry> | undefined
): AuditDateEntry | null {
  if (!fechas || fechas.length === 0) return null;
  const active = fechas
    .filter((f) => !f.deleted_at && f.tipo_fecha === 'REAL')
    .slice()
    .sort((a, b) => b.numero_secuencia - a.numero_secuencia);
  return active[0] ?? null;
}
```
Actualizar `validateAuditDateEntryInput()` para aceptar `'PROGRAMADA_EXACTA'` además de `'PREPROGRAMADA_MES'` y `'REAL'`, y exigir en Paso 3 que `tipo_fecha !== 'REAL'`.

### 4.2 Nuevo Módulo `src/lib/designacionTipoDomain.ts`
```typescript
import { assertValidUuid, isValidUuid } from './zeroUuid';
import {
  resolveLatestPlannedDate,
  type AuditDateEntry,
  type AuditDatePrecision,
  type ProgramaAuditoriaEntity,
} from './auditPlanningEngine';
import type { ProgramacionAuditEntity } from './auditExecution';
import type { VinculoEntity } from './vinculoDomain';

export type UrgencyBucketKey =
  | 'VENCIDA'
  | 'PROXIMA_30D'
  | 'ESTE_TRIMESTRE'
  | 'ESTE_ANIO'
  | 'ANIO_MAS_1'
  | 'FUTURO_LEJANO'
  | 'SIN_FECHA';

export type TipoQueuePreset = 'PROXIMAS' | 'PREPROGRAMADAS' | 'FUTURO' | 'TODAS';

export interface AuditUrgencyClassification {
  bucket: UrgencyBucketKey;
  rank: number;
  label: string;
  badgeClass: string;
  effectiveStartIso: string | null;
  effectiveEndIso: string | null;
  targetYear: number | null;
  daysUntilStart: number | null;
  isFutureTrapRisk: boolean;
}

export interface CampaignStep3Row {
  program: ProgramaAuditoriaEntity;
  vinculo: VinculoEntity | null;
  latestPlannedDate: AuditDateEntry | null;
  reprogramCount: number;
  urgency: AuditUrgencyClassification;
  hasAllAuditTypes: boolean;
  missingTypeCertCount: number;
  step3Complete: boolean;
  step4Complete: boolean;
}

export interface Step3NewCycleCertTypeDraft {
  id_certificado: string;
  numero_certificado: string;
  organizacion_nombre: string;
  norma_codigo: string;
  id_tipo_auditoria: string;
}

export interface Step3NewCycleDraft {
  id_vinculo: string;
  codigo_programa: string;
  etiqueta: string;
  dateMode: 'PREPROGRAMADA_MES' | 'PROGRAMADA_EXACTA';
  anio: number;
  mes: number;
  fecha_inicio: string;
  fecha_fin: string;
  observacion: string;
  certTypes: Step3NewCycleCertTypeDraft[];
}

export interface ReprogramDateDraft {
  id_auditoria: string;
  tipo_fecha: 'PREPROGRAMADA_MES' | 'PROGRAMADA_EXACTA';
  anio: number;
  mes: number;
  fecha_inicio: string;
  fecha_fin: string;
  observacion: string;
}

function lastDayOfMonthIso(year: number, month: number): string {
  const dt = new Date(Date.UTC(year, month, 0));
  return dt.toISOString().slice(0, 10);
}

function diffDaysUtc(fromIso: string, toIso: string): number {
  const fromMs = Date.parse(`${fromIso}T00:00:00Z`);
  const toMs = Date.parse(`${toIso}T00:00:00Z`);
  return Math.round((toMs - fromMs) / 86_400_000);
}

export function resolveEffectivePlannedWindow(
  entry: AuditDateEntry | null | undefined
): { startIso: string | null; endIso: string | null; year: number | null } {
  if (!entry || entry.deleted_at) return { startIso: null, endIso: null, year: null };
  if (entry.tipo_fecha === 'PREPROGRAMADA_MES' && entry.anio && entry.mes) {
    const mm = String(entry.mes).padStart(2, '0');
    return {
      startIso: `${entry.anio}-${mm}-01`,
      endIso: lastDayOfMonthIso(entry.anio, entry.mes),
      year: entry.anio,
    };
  }
  if (entry.fecha_inicio) {
    const end = entry.fecha_fin && entry.fecha_fin >= entry.fecha_inicio
      ? entry.fecha_fin
      : entry.fecha_inicio;
    return {
      startIso: entry.fecha_inicio,
      endIso: end,
      year: Number(entry.fecha_inicio.slice(0, 4)),
    };
  }
  return { startIso: null, endIso: null, year: null };
}

export function computeAuditUrgencyClassification(
  plannedDate: AuditDateEntry | null,
  estadoCiclo: string,
  referenceIsoDate: string = new Date().toISOString().slice(0, 10)
): AuditUrgencyClassification {
  const { startIso, endIso, year } = resolveEffectivePlannedWindow(plannedDate);
  if (!startIso || !endIso || year === null) {
    return {
      bucket: 'SIN_FECHA',
      rank: 6,
      label: 'Sin fecha',
      badgeClass: 'bg-rose-50 text-rose-800 border-rose-200',
      effectiveStartIso: null,
      effectiveEndIso: null,
      targetYear: null,
      daysUntilStart: null,
      isFutureTrapRisk: false,
    };
  }

  const refYear = Number(referenceIsoDate.slice(0, 4));
  const daysUntilStart = diffDaysUtc(referenceIsoDate, startIso);
  const daysUntilEnd = diffDaysUtc(referenceIsoDate, endIso);
  const isFinal = ['Auditada', 'Cerrada', 'Cancelada'].includes(estadoCiclo);

  if (daysUntilEnd < 0 && !isFinal) {
    return {
      bucket: 'VENCIDA',
      rank: 0,
      label: `Vencida (${Math.abs(daysUntilEnd)}d)`,
      badgeClass: 'bg-rose-50 text-rose-800 border-rose-300',
      effectiveStartIso: startIso,
      effectiveEndIso: endIso,
      targetYear: year,
      daysUntilStart,
      isFutureTrapRisk: false,
    };
  }

  if (daysUntilStart <= 30) {
    return {
      bucket: 'PROXIMA_30D',
      rank: 1,
      label: daysUntilStart <= 0 ? 'En ventana' : `Próxima ${daysUntilStart}d`,
      badgeClass: 'bg-amber-100 text-amber-900 border-amber-300',
      effectiveStartIso: startIso,
      effectiveEndIso: endIso,
      targetYear: year,
      daysUntilStart,
      isFutureTrapRisk: false,
    };
  }

  if (daysUntilStart <= 90) {
    return {
      bucket: 'ESTE_TRIMESTRE',
      rank: 2,
      label: `Trimestre (${daysUntilStart}d)`,
      badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
      effectiveStartIso: startIso,
      effectiveEndIso: endIso,
      targetYear: year,
      daysUntilStart,
      isFutureTrapRisk: false,
    };
  }

  if (year <= refYear) {
    return {
      bucket: 'ESTE_ANIO',
      rank: 3,
      label: `Año ${year}`,
      badgeClass: 'bg-sky-50 text-sky-800 border-sky-200',
      effectiveStartIso: startIso,
      effectiveEndIso: endIso,
      targetYear: year,
      daysUntilStart,
      isFutureTrapRisk: false,
    };
  }

  if (year === refYear + 1) {
    return {
      bucket: 'ANIO_MAS_1',
      rank: 4,
      label: `Año +1 (${year})`,
      badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
      effectiveStartIso: startIso,
      effectiveEndIso: endIso,
      targetYear: year,
      daysUntilStart,
      isFutureTrapRisk: true,
    };
  }

  return {
    bucket: 'FUTURO_LEJANO',
    rank: 5,
    label: `Futuro (${year})`,
    badgeClass: 'bg-slate-50 text-slate-500 border-slate-200',
    effectiveStartIso: startIso,
    effectiveEndIso: endIso,
    targetYear: year,
    daysUntilStart,
    isFutureTrapRisk: true,
  };
}

export function matchesTipoQueuePreset(
  row: CampaignStep3Row,
  preset: TipoQueuePreset
): boolean {
  if (preset === 'TODAS') return true;
  if (preset === 'PREPROGRAMADAS') {
    return row.latestPlannedDate?.tipo_fecha === 'PREPROGRAMADA_MES';
  }
  if (preset === 'FUTURO') {
    return row.urgency.rank === 4 || row.urgency.rank === 5;
  }
  // 'PROXIMAS': Vencida, <30d, Trimestre, Año en curso, o Sin fecha aún por completar
  return row.urgency.rank <= 3 || row.urgency.bucket === 'SIN_FECHA';
}

export function buildCampaignStep3Rows(
  programs: ReadonlyArray<ProgramaAuditoriaEntity>,
  vinculos: ReadonlyArray<VinculoEntity>,
  referenceIsoDate: string = new Date().toISOString().slice(0, 10)
): CampaignStep3Row[] {
  const vinculoById = new Map(vinculos.filter((v) => !v.deleted_at).map((v) => [v.id, v]));
  const rows: CampaignStep3Row[] = [];

  for (const program of programs) {
    if (program.deleted_at) continue;
    const activeAudits = program.auditorias.filter((a) => !a.deleted_at);
    if (activeAudits.length === 0) continue;

    const plannedDates = activeAudits
      .map((a) => resolveLatestPlannedDate(a.fechas) ?? (a.latestDate && a.latestDate.tipo_fecha !== 'REAL' ? a.latestDate : null))
      .filter((d): d is AuditDateEntry => d !== null);

    const latestPlannedDate = plannedDates
      .slice()
      .sort((a, b) => b.numero_secuencia - a.numero_secuencia)[0] ?? null;

    const maxSeq = activeAudits.reduce((max, a) => {
      const count = (a.fechas || []).filter((f) => !f.deleted_at && f.tipo_fecha !== 'REAL' && f.tag === 'Reprogramación').length;
      return Math.max(max, count);
    }, 0);

    const missingTypeCertCount = activeAudits.filter((a) => !a.id_tipo_auditoria).length;
    const hasAllAuditTypes = missingTypeCertCount === 0;
    const step3Complete = hasAllAuditTypes && latestPlannedDate !== null;
    const step4Complete = activeAudits.every(
      (a) => (a.sitiosPlan || []).filter((s) => !s.deleted_at).length >= 1
    );

    const urgency = computeAuditUrgencyClassification(
      latestPlannedDate,
      activeAudits[0]?.estado_ciclo || 'Borrador',
      referenceIsoDate
    );

    rows.push({
      program,
      vinculo: program.id_vinculo ? vinculoById.get(program.id_vinculo) ?? null : null,
      latestPlannedDate,
      reprogramCount: maxSeq,
      urgency,
      hasAllAuditTypes,
      missingTypeCertCount,
      step3Complete,
      step4Complete,
    });
  }

  return rows.sort((a, b) => {
    if (a.urgency.rank !== b.urgency.rank) return a.urgency.rank - b.urgency.rank;
    const aStart = a.urgency.effectiveStartIso || '9999-12-31';
    const bStart = b.urgency.effectiveStartIso || '9999-12-31';
    return aStart.localeCompare(bStart);
  });
}

export function validateStep3NewCycleDraft(
  draft: Step3NewCycleDraft,
  vinculos: ReadonlyArray<VinculoEntity>
): string | null {
  if (!isValidUuid(draft.id_vinculo)) {
    return 'Seleccione un vínculo configurado en Paso 2 (Vínculo).';
  }
  const vinculo = vinculos.find((v) => !v.deleted_at && v.id === draft.id_vinculo);
  if (!vinculo || vinculo.certificados.filter((c) => !c.deleted_at).length === 0) {
    return 'El vínculo seleccionado no existe o no tiene certificados activos.';
  }
  if (!draft.etiqueta.trim()) {
    return 'Indique un nombre o etiqueta para este ciclo de auditoría.';
  }
  if (draft.dateMode === 'PREPROGRAMADA_MES') {
    if (draft.anio < 2020 || draft.anio > 2100 || draft.mes < 1 || draft.mes > 12) {
      return 'Indique un mes (1–12) y año válido para la preprogramación.';
    }
  } else {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.fecha_inicio) || !/^\d{4}-\d{2}-\d{2}$/.test(draft.fecha_fin)) {
      return 'Indique fecha de inicio y fecha fin exactas válidas.';
    }
    if (draft.fecha_fin < draft.fecha_inicio) {
      return 'La fecha fin programada no puede ser anterior a la fecha de inicio.';
    }
  }
  if (draft.certTypes.length === 0) {
    return 'El vínculo debe contener al menos un certificado para asignar tipo de auditoría.';
  }
  for (const item of draft.certTypes) {
    assertValidUuid(item.id_certificado, 'certificado');
    if (!isValidUuid(item.id_tipo_auditoria)) {
      return `Seleccione el tipo de auditoría para el certificado ${item.numero_certificado}.`;
    }
  }
  return null;
}

export function buildNextReprogramDateSequence(
  existingFechas: ReadonlyArray<AuditDateEntry>
): number {
  const maxSeq = existingFechas
    .filter((f) => !f.deleted_at)
    .reduce((max, f) => Math.max(max, f.numero_secuencia || 0), 0);
  return maxSeq + 1;
}
```

---

## 5. Orquestación UI y Estado
*(Implementada en Step 3.3.)*

---

## 6. Matriz RBAC del Paso 3.2

| Rol | Ve Cola `Tipo` | Crea Ciclos Multi-Año | Reprograma Fechas (`#1..#N`) |
| :--- | :--- | :--- | :--- |
| **`ADMIN`** | Todas las campañas | Sí | Sí |
| **`WORKER`** | Todas activas | Sí | Sí |
| **`AUDITOR`** | Solo auditorías asignadas | No | No |
| **`CLIENT`** | Solo sus orgs (oculta co-certificados Nivel 2) | No | No |

---

## 7. Pruebas Automatizadas (`src/lib/designacionTipoDomain.test.ts`)
1. `computeAuditUrgencyClassification`: verifica transición exacta `ANIO_MAS_1` → `PROXIMA_30D` → `VENCIDA` al mover `referenceIsoDate` ("revivificación").
2. `buildCampaignStep3Rows`: ordena `PROXIMA_30D` (2026) por encima de `FUTURO_LEJANO` (2029) automáticamente.
3. `matchesTipoQueuePreset`: `'PROXIMAS'` oculta ciclos `Año +1` / `Año +2` y los muestra bajo `'FUTURO'` / `'TODAS'`.
4. `validateStep3NewCycleDraft`: exige `id_tipo_auditoria` válido por cada certificado del vínculo y rechaza fechas invertidas.
5. `buildNextReprogramDateSequence`: incrementa secuencialmente `1 → 2 → 3` ignorando fechas archivadas.

---

## 8. Criterios de Aceptación (Done Criteria)
- [ ] `src/lib/designacionTipoDomain.ts` implementado sin `any` ni exposición de UUIDs.
- [ ] `resolveLatestPlannedDate` vs `resolveLatestRealExecutionDate` claramente separados en `auditPlanningEngine.ts`.
- [ ] Todos los tests unitarios pasan en `npm test`.
