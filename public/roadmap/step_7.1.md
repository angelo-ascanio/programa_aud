# Step 7.1: `Asignación` — BD Equipo Temporal (`equipo_auditor_sitio_temporal`), Sync y Dominio de Conciliación (`src/lib/asignacionDomain.ts`)

## 1. Identificador, Nombre y Dependencias
* **Step ID:** `7.1`
* **Nombre Corto (UI):** `Asignación`
* **Bloque / Sub-sección:** Bloque 1 — `Auditoría` → `Asignación`
* **Dependencias:** `step_6.1.md`, `step_5.1.md`

---

## 2. Alcance Exacto y Reglas de Negocio
1. **Compuerta de Entrada:** Exige **Paso 6 (`Tiempo`) completo** (`sitios_por_auditoria.tiempo_auditoria > 0` en todos los sitios del certificado; y si `tiene_sitio_temporal = TRUE`, también exige Paso 5 con tiempo asignado). Puede trabajarse en paralelo con otros sitios en `Tiempo`, `Temporal` y con `Programa` (Paso 8).
2. **Múltiples Auditores por Sitio Regular Y por Sitio Temporal:**
   * Cada asignación de auditor lleva `rol_auditor` (`AUDITOR_LIDER`, `AUDITOR`, `AUDITOR_EN_ENTRENAMIENTO`, `EXPERTO_TECNICO`) y `tiempo_auditoria` en múltiplos de `0.25d`.
   * Nueva tabla `public.equipo_auditor_sitio_temporal` análoga a `equipo_auditor_sitio`, vinculada a `auditoria_sitio_temporal(id)`.
3. **Regla Estricta de Conciliación (`SUM == Asignado`):**
   * Por cada sitio regular `S`: `SUM(equipo_auditor_sitio.tiempo_auditoria)` debe ser **exactamente igual** a `S.tiempo_auditoria` (`|sum - required| <= 0.001`).
   * Por cada sitio temporal `T`: `SUM(equipo_auditor_sitio_temporal.tiempo_auditoria)` debe ser **exactamente igual** a `T.tiempo_auditoria`.
   * *Ejemplo operativo:* `Sitio 0 HQ = 3.00d` → `Auditor A (Líder) = 2.00d` + `Auditor B = 1.00d` = `3.00d` (`100%` cubierto); `Sitio 1 = 1.00d` → `Auditor B = 1.00d`; `Sitio Temporal = 1.00d` → `Auditor A = 1.00d`.
4. **Sincronización Consolidada a `public.equipo_auditor`:**
   * Actualizar `fn_sync_equipo_auditor_desde_sitios()` para que unifique tanto `equipo_auditor_sitio` como `equipo_auditor_sitio_temporal` hacia `equipo_auditor`, manteniendo jerarquía de rol (`AUDITOR_LIDER > AUDITOR > EXPERTO_TECNICO > AUDITOR_EN_ENTRENAMIENTO`) y habilitando `is_assigned_auditor()` en RLS incluso para auditores asignados solo a un temporal.
5. **Validación de Competencias y Rotación ISO/IEC 17021-1:**
   * Evalúa por cada auditor candidato: `norma` + `sector_iaf` + `subsector_iaf` + alerta de rotación `ciclos_rotacion_auditor_lider` (`3` ciclos consecutivos por defecto) y conflictos de fechas concurrentes en otros programas (`detectAuditorScheduleConflicts`).

---

## 3. Cambios Exactos en Base de Datos (`00`, `01`, `03`, `04`, `06`)

### 3.1 `public/supabase/queries/00_delete_tables.sql`
*(Ya incluido en Step 5.1 antes de `auditoria_sitio_temporal`.)*

### 3.2 `public/supabase/queries/01_creacion.sql`
```sql
CREATE TABLE IF NOT EXISTS public.equipo_auditor_sitio_temporal (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    id_sitio_temporal UUID NOT NULL REFERENCES public.auditoria_sitio_temporal(id) ON DELETE CASCADE,
    id_auditor UUID NOT NULL REFERENCES public.auditor(id) ON DELETE RESTRICT,
    rol_auditor VARCHAR(50) NOT NULL DEFAULT 'AUDITOR'
        CHECK (rol_auditor IN ('AUDITOR_LIDER', 'AUDITOR', 'AUDITOR_EN_ENTRENAMIENTO', 'EXPERTO_TECNICO')),
    tiempo_auditoria NUMERIC(6,2) NOT NULL DEFAULT 0
        CHECK (tiempo_auditoria >= 0 AND MOD((tiempo_auditoria * 4)::NUMERIC, 1) = 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Trigger de validación: no exceder ni desvincular auditor archivado, y recomputar equipo_auditor
CREATE OR REPLACE FUNCTION public.fn_validar_equipo_auditor_sitio_temporal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_temp_deleted TIMESTAMPTZ;
    v_auditor_deleted TIMESTAMPTZ;
BEGIN
    IF NEW.deleted_at IS NOT NULL THEN
        RETURN NEW;
    END IF;

    SELECT st.deleted_at INTO v_temp_deleted
    FROM public.auditoria_sitio_temporal st
    WHERE st.id = NEW.id_sitio_temporal;

    SELECT a.deleted_at INTO v_auditor_deleted
    FROM public.auditor a
    WHERE a.id = NEW.id_auditor;

    IF v_temp_deleted IS NOT NULL THEN
        RAISE EXCEPTION 'Operación bloqueada: el sitio temporal está archivado.' USING ERRCODE = 'P0001';
    END IF;
    IF v_auditor_deleted IS NOT NULL THEN
        RAISE EXCEPTION 'Operación bloqueada: el auditor seleccionado está archivado.' USING ERRCODE = 'P0001';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validar_equipo_auditor_sitio_temporal ON public.equipo_auditor_sitio_temporal;
CREATE TRIGGER trg_validar_equipo_auditor_sitio_temporal
    BEFORE INSERT OR UPDATE ON public.equipo_auditor_sitio_temporal
    FOR EACH ROW EXECUTE FUNCTION public.fn_validar_equipo_auditor_sitio_temporal();

-- Extender reconciliación hacia public.equipo_auditor incluyendo equipo_auditor_sitio + equipo_auditor_sitio_temporal
CREATE OR REPLACE FUNCTION public.fn_sync_equipo_auditor_completo(p_id_auditoria UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    DELETE FROM public.equipo_auditor WHERE id_auditoria = p_id_auditoria;

    INSERT INTO public.equipo_auditor (id_auditoria, id_auditor, rol_auditor)
    SELECT p_id_auditoria, sub.id_auditor,
           CASE MIN(sub.prio)
               WHEN 1 THEN 'AUDITOR_LIDER'
               WHEN 2 THEN 'AUDITOR'
               WHEN 3 THEN 'EXPERTO_TECNICO'
               ELSE 'AUDITOR_EN_ENTRENAMIENTO'
           END
    FROM (
        SELECT eas.id_auditor,
               CASE eas.rol_auditor
                   WHEN 'AUDITOR_LIDER' THEN 1
                   WHEN 'AUDITOR' THEN 2
                   WHEN 'EXPERTO_TECNICO' THEN 3
                   ELSE 4
               END AS prio
        FROM public.equipo_auditor_sitio eas
        JOIN public.sitios_por_auditoria sa ON sa.id = eas.id_sitios_por_auditoria
        WHERE sa.id_auditoria = p_id_auditoria AND sa.deleted_at IS NULL AND eas.deleted_at IS NULL
        UNION ALL
        SELECT east.id_auditor,
               CASE east.rol_auditor
                   WHEN 'AUDITOR_LIDER' THEN 1
                   WHEN 'AUDITOR' THEN 2
                   WHEN 'EXPERTO_TECNICO' THEN 3
                   ELSE 4
               END AS prio
        FROM public.equipo_auditor_sitio_temporal east
        JOIN public.auditoria_sitio_temporal st ON st.id = east.id_sitio_temporal
        LEFT JOIN public.auditoria_sitio_temporal_certificado stc
               ON stc.id_sitio_temporal = st.id AND stc.deleted_at IS NULL
        WHERE st.deleted_at IS NULL
          AND east.deleted_at IS NULL
          AND (st.id_auditoria = p_id_auditoria OR stc.id_auditoria_certificado = p_id_auditoria)
    ) sub
    GROUP BY sub.id_auditor;
END;
$$;
```
*(Añadir `'equipo_auditor_sitio_temporal'` a `v_child_tables`, `fn_prevent_hard_delete`, `update_updated_at_column`, `audit_log` y crear trigger `AFTER INSERT OR UPDATE ON equipo_auditor_sitio_temporal` llamando `fn_sync_equipo_auditor_completo`.)*

### 3.3 `public/supabase/queries/03_indices_optimizacion.sql`
```sql
CREATE UNIQUE INDEX IF NOT EXISTS uq_equipo_auditor_sitio_temporal_active
    ON public.equipo_auditor_sitio_temporal (id_sitio_temporal, id_auditor) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_equipo_auditor_sitio_temp_lookup
    ON public.equipo_auditor_sitio_temporal (id_sitio_temporal, id_auditor) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_equipo_auditor_sitio_temp_auditor
    ON public.equipo_auditor_sitio_temporal (id_auditor) WHERE deleted_at IS NULL;
```

### 3.4 `public/supabase/queries/04_rls.sql`
1. Añadir `'equipo_auditor_sitio_temporal'` a `REVOKE DELETE` y `archive_record()`.
2. Habilitar RLS y definir `SELECT` (STAFF, auditor asignado, CLIENT por org) + `INSERT/UPDATE` (`ADMIN`/`WORKER`).

---

## 4. Lógica Pura (`src/lib/asignacionDomain.ts`)

```typescript
import { assertValidUuid, isValidUuid } from './zeroUuid';
import {
  computeSiteDayBalance,
  roundAuditDaysQuarter,
  type AuditoriaSitioPlanItem,
  type AuditorSiteRole,
  type ProgramaAuditoriaEntity,
} from './auditPlanningEngine';
import type { AuditorDetailEntity } from './competencyMatrix';
import type { AuditoriaSitioTemporalEntity } from './designacionTemporalDomain';
import { isValidQuarterDayAmount } from './tiempoDomain';
import { computeAuditUrgencyClassification, type AuditUrgencyClassification } from './designacionTipoDomain';
import { resolveLatestPlannedDate } from './auditPlanningEngine';

export type AsignacionStatusFilter = 'ALL' | 'SIN_ASIGNAR' | 'DESCUADRADO' | 'COMPLETO';

export interface SiteAssignmentReconciliation {
  kind: 'REGULAR' | 'TEMPORAL';
  targetId: string;
  auditId: string;
  label: string;
  requiredDays: number;
  assignedDays: number;
  deltaDays: number;
  isBalanced: boolean;
  hasNoTeam: boolean;
  coveragePct: number;
}

export interface CampaignAsignacionRow {
  program: ProgramaAuditoriaEntity;
  urgency: AuditUrgencyClassification;
  siteReconciliations: SiteAssignmentReconciliation[];
  totalRequiredDays: number;
  totalAssignedDays: number;
  statusKey: Exclude<AsignacionStatusFilter, 'ALL'>;
  hasCompetencyWarning: boolean;
  hasRotationWarning: boolean;
}

export function evaluateAuditorCompetencyMatch(
  auditor: AuditorDetailEntity,
  normaCodigo: string,
  sectorIaf: number,
  subsectorCodigo?: string | null
): {
  level: 'FULL' | 'NORMA_ONLY' | 'PARTIAL';
  label: string;
  badgeClass: string;
} {
  const normBase = normaCodigo.toLowerCase().split(':')[0].trim();
  const hasNorma = Boolean(normBase) && auditor.normas_acreditadas.some((n) => n.toLowerCase().includes(normBase));
  const hasIaf = auditor.sectores_iaf.includes(sectorIaf);
  const hasSubsector = !subsectorCodigo || auditor.subsectores_iaf.some((s) => s.includes(subsectorCodigo));

  if (hasNorma && hasIaf && hasSubsector) {
    return {
      level: 'FULL',
      label: `✓ Calificado (${normaCodigo} · IAF ${sectorIaf})`,
      badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    };
  }
  if (hasNorma && hasIaf) {
    return {
      level: 'NORMA_ONLY',
      label: `⚠ Sin subsector IAF (${subsectorCodigo})`,
      badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
    };
  }
  if (hasNorma) {
    return {
      level: 'NORMA_ONLY',
      label: `⚠ Falta IAF ${sectorIaf}`,
      badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
    };
  }
  return {
    level: 'PARTIAL',
    label: 'ℹ️ Experto / Sin Norma Base',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
  };
}

export function validateAuditorTimeAssignment(
  auditorId: string,
  days: number,
  rol: AuditorSiteRole,
  targetRequiredDays: number,
  otherAssignedDaysSum: number
): string | null {
  if (!isValidUuid(auditorId)) {
    return 'Seleccione un auditor válido.';
  }
  assertValidUuid(auditorId, 'auditor');
  if (!isValidQuarterDayAmount(days) || days <= 0) {
    return 'Las jornadas asignadas al auditor deben ser mayores a 0 en múltiplos de 0.25 días.';
  }
  if (!['AUDITOR_LIDER', 'AUDITOR', 'AUDITOR_EN_ENTRENAMIENTO', 'EXPERTO_TECNICO'].includes(rol)) {
    return 'Rol de auditor inválido.';
  }
  const projected = roundAuditDaysQuarter(otherAssignedDaysSum + days);
  if (projected > targetRequiredDays + 0.001) {
    return `La suma (${projected.toFixed(2)} d) excede los días requeridos del sitio (${targetRequiredDays.toFixed(2)} d).`;
  }
  return null;
}

export function buildCampaignAsignacionRows(
  programs: ReadonlyArray<ProgramaAuditoriaEntity>,
  temporalSites: ReadonlyArray<AuditoriaSitioTemporalEntity>,
  referenceIsoDate: string = new Date().toISOString().slice(0, 10)
): CampaignAsignacionRow[] {
  const rows: CampaignAsignacionRow[] = [];

  for (const program of programs) {
    if (program.deleted_at) continue;
    const activeAudits = program.auditorias.filter((a) => !a.deleted_at);
    if (activeAudits.length === 0) continue;

    // Compuerta: Paso 6 completo (+ Paso 5 tiempo si temporal está encendido)
    const allHaveTime = activeAudits.every((a) => {
      const sites = (a.sitiosPlan || []).filter((s) => !s.deleted_at);
      return sites.length > 0 && sites.every((s) => s.tiempo_auditoria > 0);
    });
    if (!allHaveTime) continue;

    const auditIds = new Set(activeAudits.map((a) => a.id));
    const campaignTemporals = temporalSites.filter(
      (t) => !t.deleted_at && auditIds.has(t.id_auditoria)
    );
    const hasMissingTemporalTime = activeAudits.some((a) => a.tiene_sitio_temporal === true) &&
      (campaignTemporals.length === 0 || campaignTemporals.some((t) => t.tiempo_auditoria <= 0));
    if (hasMissingTemporalTime) continue;

    const reconciliations: SiteAssignmentReconciliation[] = [];

    for (const a of activeAudits) {
      for (const s of (a.sitiosPlan || []).filter((sp) => !sp.deleted_at)) {
        const bal = computeSiteDayBalance(s);
        reconciliations.push({
          kind: 'REGULAR',
          targetId: s.id,
          auditId: a.id,
          label: `${a.numero_certificado} · ${s.numero_sitio === 0 ? 'Sitio 0 HQ' : `Sitio #${s.numero_sitio}`} (${s.nombre_sitio})`,
          requiredDays: bal.demandedDays,
          assignedDays: bal.assignedDays,
          deltaDays: bal.delta,
          isBalanced: bal.isBalanced,
          hasNoTeam: bal.assignedDays <= 0,
          coveragePct: bal.demandedDays > 0 ? Math.min(100, Math.round((bal.assignedDays / bal.demandedDays) * 100)) : 0,
        });
      }
    }

    for (const t of campaignTemporals) {
      const assigned = roundAuditDaysQuarter(
        t.equipoTemporal.filter((m) => !m.deleted_at).reduce((s, m) => s + m.tiempo_auditoria, 0)
      );
      const delta = roundAuditDaysQuarter(assigned - t.tiempo_auditoria);
      reconciliations.push({
        kind: 'TEMPORAL',
        targetId: t.id,
        auditId: t.id_auditoria,
        label: `⏱️ ${t.etiqueta} (Temporal)`,
        requiredDays: t.tiempo_auditoria,
        assignedDays: assigned,
        deltaDays: delta,
        isBalanced: t.tiempo_auditoria > 0 && Math.abs(delta) <= 0.001,
        hasNoTeam: assigned <= 0,
        coveragePct: t.tiempo_auditoria > 0 ? Math.min(100, Math.round((assigned / t.tiempo_auditoria) * 100)) : 0,
      });
    }

    const totalRequiredDays = roundAuditDaysQuarter(
      reconciliations.reduce((sum, r) => sum + r.requiredDays, 0)
    );
    const totalAssignedDays = roundAuditDaysQuarter(
      reconciliations.reduce((sum, r) => sum + r.assignedDays, 0)
    );
    const anyNoTeam = reconciliations.some((r) => r.hasNoTeam);
    const allBalanced = reconciliations.every((r) => r.isBalanced);
    const statusKey: Exclude<AsignacionStatusFilter, 'ALL'> =
      totalAssignedDays === 0 || (anyNoTeam && !allBalanced)
        ? totalAssignedDays === 0
          ? 'SIN_ASIGNAR'
          : 'DESCUADRADO'
        : allBalanced
        ? 'COMPLETO'
        : 'DESCUADRADO';

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
      siteReconciliations: reconciliations,
      totalRequiredDays,
      totalAssignedDays,
      statusKey,
      hasCompetencyWarning: false,
      hasRotationWarning: false,
    });
  }

  return rows;
}
```

---

## 5. Orquestación UI y Estado
*(Implementada en Step 7.2.)*

---

## 6. Matriz RBAC del Paso 7.1

| Rol | Ve Equipo Asignado | Asigna/Edita Auditores (`equipo_auditor_sitio` / `_temporal`) |
| :--- | :--- | :--- |
| **`ADMIN`** | Completo | Sí |
| **`WORKER`** | Completo | Sí |
| **`AUDITOR`** | Solo auditorías donde está asignado | No |
| **`CLIENT`** | Solo sus organizaciones | No |

---

## 7. Pruebas Automatizadas (`src/lib/asignacionDomain.test.ts`)
1. `validateAuditorTimeAssignment`: rechaza exceder el presupuesto (`2.00 + 1.50 > 3.00`) o usar múltiplos no `0.25d`.
2. `buildCampaignAsignacionRows`: excluye campañas sin tiempo en Paso 6 o sin tiempo en Paso 5 cuando `tiene_sitio_temporal = true`; detecta exactamente `'SIN_ASIGNAR'`, `'DESCUADRADO'` y `'COMPLETO'`.
3. `evaluateAuditorCompetencyMatch`: distingue calificación completa (`norma + sector_iaf + subsector`) vs faltante IAF/subsector.

---

## 8. Criterios de Aceptación (Done Criteria)
- [ ] `equipo_auditor_sitio_temporal` creado con RLS, índices parciales, `REVOKE DELETE` y `fn_sync_equipo_auditor_completo`.
- [ ] `src/lib/asignacionDomain.ts` y tests pasan al 100%.
