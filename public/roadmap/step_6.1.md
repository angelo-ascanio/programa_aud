# Step 6.1: `Tiempo` — Constraints `0.25d`, Triggers de Rollup y Lógica Pura (`src/lib/tiempoDomain.ts`)

## 1. Identificador, Nombre y Dependencias
* **Step ID:** `6.1`
* **Nombre Corto (UI):** `Tiempo`
* **Bloque / Sub-sección:** Bloque 1 — `Auditoría` → `Tiempo`
* **Dependencias:** `step_4.2.md`, `step_5.1.md`, `step_3.2.md`

---

## 2. Alcance Exacto y Reglas de Negocio
1. **Compuerta de Entrada (Pasos 3 + 4 Obligatorios):**
   * Solo aparecen en `Tiempo` las auditorías/campañas donde **Paso 3 (`Tipo`) AND Paso 4 (`Sitio`) están completos** (`id_tipo_auditoria`, al menos 1 fecha en `auditoria_fecha`, y al menos 1 sitio activo en `sitios_por_auditoria`).
   * **Paralelismo:** Una vez completados Pasos 3 y 4, `Tiempo` (Paso 6) puede trabajarse en paralelo con `Temporal` (Paso 5), `Asignación` (Paso 7, en otros sitios ya con tiempo) y `Programa` (Paso 8).
2. **Precisión Cuarto de Día (`0.25d`):**
   * Toda asignación en `sitios_por_auditoria.tiempo_auditoria` y `auditoria_sitio_temporal.tiempo_auditoria` es múltiplo exacto de `0.25` (`CHECK (MOD((tiempo_auditoria * 4)::NUMERIC, 1) = 0)`).
3. **Rollup por Certificado + Resumen con Sitio Temporal:**
   * Por cada certificado:
     * `regularSitesDays = SUM(sitios_por_auditoria.tiempo_auditoria)` (donde `deleted_at IS NULL`).
     * `temporalAttributedDays = SUM(auditoria_sitio_temporal.tiempo_auditoria)` de los sitios temporales asociados a ese certificado en `auditoria_sitio_temporal_certificado`.
     * `auditoria.tiempo_auditoria` almacena `regularSitesDays` (o el total atribuible sincronizado mediante trigger, mientras el resumen UI muestra explícitamente el desglose: `Sitios Regulares: X.XX d` + `Sitio Temporal: Y.YY d` = `Presupuesto Certificado: Z.ZZ d`). *Nota crítica para evitar doble conteo en campañas multi-certificado:* cuando un `Sitio Temporal` de `1.00 día` aplica a 3 certificados simultáneamente, `tiempo_auditoria` del temporal se contabiliza **una sola vez** a nivel de presupuesto de campaña (`campaignTotalDays`), mientras cada certificado muestra el temporal como tiempo compartido vinculado (`"1.00 d (compartido en N certs)"`) para la visibilidad del coordinador.
4. **Regla de Completitud (`Tiempo`):**
   * Un certificado está **`Completo`** en Paso 6 cuando todos sus sitios seleccionados tienen `tiempo_auditoria > 0`.
   * Si algún sitio seleccionado tiene `tiempo_auditoria === 0`, la campaña/certificado aparece bajo el filtro **`Incompletos`**.

---

## 3. Cambios Exactos en Base de Datos (`01_creacion.sql`)

```sql
-- Trigger: Mantener auditoria.tiempo_auditoria sincronizado con la suma de sitios_por_auditoria activos
CREATE OR REPLACE FUNCTION public.fn_recalcular_tiempo_auditoria_desde_sitios()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_aud_id UUID;
    v_sum NUMERIC(6,2);
BEGIN
    v_aud_id := COALESCE(NEW.id_auditoria, OLD.id_auditoria);
    IF v_aud_id IS NULL THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    SELECT COALESCE(SUM(sa.tiempo_auditoria), 0)::NUMERIC(6,2)
      INTO v_sum
    FROM public.sitios_por_auditoria sa
    WHERE sa.id_auditoria = v_aud_id
      AND sa.deleted_at IS NULL;

    UPDATE public.auditoria
    SET tiempo_auditoria = v_sum,
        updated_at = NOW()
    WHERE id = v_aud_id
      AND tiempo_auditoria IS DISTINCT FROM v_sum;

    RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_recalcular_tiempo_auditoria_desde_sitios ON public.sitios_por_auditoria;
CREATE TRIGGER trg_recalcular_tiempo_auditoria_desde_sitios
    AFTER INSERT OR UPDATE OF tiempo_auditoria, deleted_at ON public.sitios_por_auditoria
    FOR EACH ROW EXECUTE FUNCTION public.fn_recalcular_tiempo_auditoria_desde_sitios();
```

---

## 4. Lógica Pura (`src/lib/tiempoDomain.ts`)

```typescript
import {
  resolveLatestPlannedDate,
  roundAuditDaysQuarter,
  type AuditoriaSitioPlanItem,
  type ProgramaAuditoriaEntity,
} from './auditPlanningEngine';
import type { ProgramacionAuditEntity } from './auditExecution';
import type { AuditoriaSitioTemporalEntity } from './designacionTemporalDomain';
import {
  computeAuditUrgencyClassification,
  type AuditUrgencyClassification,
} from './designacionTipoDomain';

export type TiempoCompletionFilter = 'ALL' | 'INCOMPLETOS' | 'COMPLETOS';

export interface CertTiempoBreakdown {
  audit: ProgramacionAuditEntity;
  activeSites: AuditoriaSitioPlanItem[];
  regularDaysTotal: number;
  linkedTemporals: AuditoriaSitioTemporalEntity[];
  linkedTemporalDaysTotal: number;
  unallocatedSitesCount: number;
  isComplete: boolean;
}

export interface CampaignTiempoRow {
  program: ProgramaAuditoriaEntity;
  urgency: AuditUrgencyClassification;
  certBreakdowns: CertTiempoBreakdown[];
  campaignRegularDays: number;
  campaignTemporalDaysUnique: number;
  campaignGrandTotalDays: number;
  unallocatedSitesTotal: number;
  totalSitesCount: number;
  isComplete: boolean;
}

export function isValidQuarterDayAmount(value: number): boolean {
  if (!Number.isFinite(value) || value < 0) return false;
  const scaled = Math.round(value * 4);
  return Math.abs(scaled / 4 - value) < 0.0001;
}

export function validateSiteTimeUpdate(
  days: number,
  siteName: string
): string | null {
  if (!Number.isFinite(days) || days < 0) {
    return `El tiempo para "${siteName}" no puede ser negativo.`;
  }
  if (!isValidQuarterDayAmount(days)) {
    return `El tiempo para "${siteName}" debe expresarse en múltiplos exactos de 0.25 días (ej. 0.50, 1.25, 2.00).`;
  }
  return null;
}

export function buildCampaignTiempoRows(
  programs: ReadonlyArray<ProgramaAuditoriaEntity>,
  temporalSites: ReadonlyArray<AuditoriaSitioTemporalEntity>,
  referenceIsoDate: string = new Date().toISOString().slice(0, 10)
): CampaignTiempoRow[] {
  const rows: CampaignTiempoRow[] = [];

  for (const program of programs) {
    if (program.deleted_at) continue;
    const activeAudits = program.auditorias.filter((a) => !a.deleted_at);
    if (activeAudits.length === 0) continue;

    // Compuerta insalvable: Paso 3 AND Paso 4 completos
    const eligible = activeAudits.every((a) => {
      const hasStep3 =
        Boolean(a.id_tipo_auditoria) &&
        ((a.fechas || []).some((f) => !f.deleted_at && f.tipo_fecha !== 'REAL') ||
          Boolean(a.latestDate));
      const hasStep4 = (a.sitiosPlan || []).filter((s) => !s.deleted_at).length >= 1;
      return hasStep3 && hasStep4;
    });
    if (!eligible) continue;

    const auditIds = new Set(activeAudits.map((a) => a.id));
    const campaignTemporals = temporalSites.filter(
      (t) => !t.deleted_at && auditIds.has(t.id_auditoria)
    );

    const certBreakdowns: CertTiempoBreakdown[] = activeAudits.map((audit) => {
      const activeSites = (audit.sitiosPlan || [])
        .filter((s) => !s.deleted_at)
        .slice()
        .sort((a, b) => a.numero_sitio - b.numero_sitio);
      const regularDaysTotal = roundAuditDaysQuarter(
        activeSites.reduce((sum, s) => sum + (s.tiempo_auditoria || 0), 0)
      );
      const linkedTemporals = campaignTemporals.filter((t) =>
        t.certificados.some((c) => !c.deleted_at && c.id_auditoria_certificado === audit.id)
      );
      const linkedTemporalDaysTotal = roundAuditDaysQuarter(
        linkedTemporals.reduce((sum, t) => sum + (t.tiempo_auditoria || 0), 0)
      );
      const unallocatedSitesCount = activeSites.filter((s) => (s.tiempo_auditoria || 0) <= 0).length;
      return {
        audit,
        activeSites,
        regularDaysTotal,
        linkedTemporals,
        linkedTemporalDaysTotal,
        unallocatedSitesCount,
        isComplete: activeSites.length > 0 && unallocatedSitesCount === 0,
      };
    });

    const campaignRegularDays = roundAuditDaysQuarter(
      certBreakdowns.reduce((sum, b) => sum + b.regularDaysTotal, 0)
    );
    const campaignTemporalDaysUnique = roundAuditDaysQuarter(
      campaignTemporals.reduce((sum, t) => sum + (t.tiempo_auditoria || 0), 0)
    );
    const campaignGrandTotalDays = roundAuditDaysQuarter(
      campaignRegularDays + campaignTemporalDaysUnique
    );
    const unallocatedSitesTotal = certBreakdowns.reduce(
      (sum, b) => sum + b.unallocatedSitesCount,
      0
    );
    const totalSitesCount = certBreakdowns.reduce((sum, b) => sum + b.activeSites.length, 0);

    const planned = resolveLatestPlannedDate(activeAudits[0]?.fechas) ??
      (activeAudits[0]?.latestDate && activeAudits[0].latestDate.tipo_fecha !== 'REAL'
        ? activeAudits[0].latestDate
        : null);
    const urgency = computeAuditUrgencyClassification(
      planned,
      activeAudits[0]?.estado_ciclo || 'Borrador',
      referenceIsoDate
    );

    rows.push({
      program,
      urgency,
      certBreakdowns,
      campaignRegularDays,
      campaignTemporalDaysUnique,
      campaignGrandTotalDays,
      unallocatedSitesTotal,
      totalSitesCount,
      isComplete: unallocatedSitesTotal === 0 && totalSitesCount > 0,
    });
  }

  return rows.sort((a, b) => {
    if (a.isComplete !== b.isComplete) return a.isComplete ? 1 : -1;
    if (a.urgency.rank !== b.urgency.rank) return a.urgency.rank - b.urgency.rank;
    return (a.urgency.effectiveStartIso || '9999-12-31').localeCompare(
      b.urgency.effectiveStartIso || '9999-12-31'
    );
  });
}
```

---

## 5. Orquestación UI y Estado
*(Implementada en Step 6.2.)*

---

## 6. Matriz RBAC del Paso 6.1

| Rol | Lectura Tiempos | Modificar `sitios_por_auditoria.tiempo_auditoria` |
| :--- | :--- | :--- |
| **`ADMIN`** | Completo | Sí |
| **`WORKER`** | Completo | Sí |
| **`AUDITOR`** | Solo auditorías asignadas | No |
| **`CLIENT`** | Solo sus certificados | No |

---

## 7. Pruebas Automatizadas (`src/lib/tiempoDomain.test.ts`)
1. `buildCampaignTiempoRows`: excluye auditorías sin Paso 3 o sin Paso 4; detecta `Incompletos` si al menos un sitio tiene `0d`.
2. Evita doble conteo de tiempo temporal compartido (`campaignTemporalDaysUnique` suma cada temporal 1 vez en la campaña aunque esté ligado a 3 certificados).
3. `validateSiteTimeUpdate`: acepta `0.25`, `1.75`, `3.00` y rechaza `0.30` o `-0.50`.

---

## 8. Criterios de Aceptación (Done Criteria)
- [ ] Trigger `trg_recalcular_tiempo_auditoria_desde_sitios` mantiene `auditoria.tiempo_auditoria` sincronizado.
- [ ] `src/lib/tiempoDomain.ts` implementado sin `any` y tests pasando en `npm test`.
