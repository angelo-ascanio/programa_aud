# Step 11.1: `Revisión` — Compuerta Final de Control de Calidad Post-Cierre (`BD`, `RLS`, `revisionDomain.ts`, `revisionView.ts`)

## 1. Identificador, Nombre y Dependencias
* **Step ID:** `11.1`
* **Nombre Corto (UI):** `Revisión` (`#/auditorias/revision`)
* **Bloque / Sub-sección:** Bloque 1 — `Auditoría` → `Revisión` (Última etapa del pipeline)
* **Dependencias:** `step_10.2.md` (`estado_ciclo = 'Cerrada'` + `fecha_cierre_auditoria`)

---

## 2. Alcance Exacto y Reglas de Negocio
1. **Compuerta Estricta Post-Cierre (`estado_ciclo === 'Cerrada'`):**
   * Solo aparecen en la cola de `Revisión` las auditorías que completaron `Resultado` (Paso 10) y fueron marcadas como **`'Cerrada'`** con `fecha_cierre_auditoria IS NOT NULL`.
   * Ninguna auditoría en `Programada`, `En Ejecución` o `Auditada` sin cierre formal puede marcarse como revisada (`revisado = TRUE`).
2. **Atributos de Control QA (`public.auditoria`):**
   * `revisado`: `BOOLEAN NOT NULL DEFAULT FALSE`
   * `fecha_revision`: `DATE NULL`
   * `revisado_por`: `UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL` *(almacenado internamente; UI muestra el nombre completo desde `profiles` — **Zero-UUID**)*
   * `documentacion_completa`: `BOOLEAN NOT NULL DEFAULT FALSE`
   * `resumen_revision`: `TEXT NULL` *(notas breves / observaciones de control de calidad del expediente)*
3. **Flujo Simple y Enfocado:**
   * Multi View con filtro default o facet rápido entre **`Pendientes de Revisión`** (`revisado = false`) y **`Revisadas`** (`revisado = true`).
   * Detail View limpio con resumen consolidado del ciclo (Fechas `REAL`, Fecha de Cierre, conteo NC cerradas/totales, enlaces de verificación documental) + formulario QA compacto para aprobar la revisión con `fecha_revision` (default hoy), checkbox `documentacion_completa` y `resumen_revision`.

---

## 3. Cambios Exactos en Base de Datos (`01`, `03`, `04`, `06`)

### 3.1 `public/supabase/queries/01_creacion.sql`
```sql
ALTER TABLE public.auditoria
    ADD COLUMN IF NOT EXISTS revisado BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS fecha_revision DATE NULL,
    ADD COLUMN IF NOT EXISTS revisado_por UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS documentacion_completa BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS resumen_revision TEXT NULL;

-- Trigger de integridad QA: bloquear revisado = TRUE si no está Cerrada o falta fecha_revision
CREATE OR REPLACE FUNCTION public.fn_validar_revision_auditoria()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NEW.deleted_at IS NOT NULL THEN
        RETURN NEW;
    END IF;

    IF NEW.revisado = TRUE THEN
        IF NEW.estado_ciclo IS DISTINCT FROM 'Cerrada' OR NEW.fecha_cierre_auditoria IS NULL THEN
            RAISE EXCEPTION 'Compuerta Paso 11 (Revisión): La auditoría debe estar Cerrada con Fecha de Cierre antes de aprobar su revisión.'
                USING ERRCODE = 'P0001';
        END IF;

        IF NEW.fecha_revision IS NULL THEN
            NEW.fecha_revision := CURRENT_DATE;
        END IF;

        IF NEW.revisado_por IS NULL THEN
            NEW.revisado_por := auth.uid();
        END IF;

        IF NEW.fecha_revision < NEW.fecha_cierre_auditoria THEN
            RAISE EXCEPTION 'La fecha de revisión no puede ser anterior a la fecha de cierre de la auditoría.'
                USING ERRCODE = 'P0001';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validar_revision_auditoria ON public.auditoria;
CREATE TRIGGER trg_validar_revision_auditoria
    BEFORE INSERT OR UPDATE OF revisado, fecha_revision, estado_ciclo ON public.auditoria
    FOR EACH ROW EXECUTE FUNCTION public.fn_validar_revision_auditoria();
```

### 3.2 `public/supabase/queries/03_indices_optimizacion.sql`
```sql
CREATE INDEX IF NOT EXISTS idx_auditoria_revision_cola
    ON public.auditoria (revisado, fecha_cierre_auditoria DESC)
    WHERE estado_ciclo = 'Cerrada' AND deleted_at IS NULL;
```

### 3.3 `public/supabase/queries/04_rls.sql`
* Solo `ADMIN` y `WORKER` (`is_approved_worker()`) pueden actualizar `revisado`, `fecha_revision`, `revisado_por`, `documentacion_completa`, `resumen_revision`.
* `AUDITOR` y `CLIENT` pueden consultar únicamente el estado de revisión de sus auditorías asignadas / organizaciones autorizadas.

### 3.4 `public/supabase/queries/06_datos_prueba.sql`
* Dejar la auditoría `'Cerrada'` de prueba del Step 10.1 con `revisado = FALSE` para que aparezca inmediatamente en `Pendientes de Revisión` tras `POST /api/reset-db`, más opcionalmente 1 auditoría histórica con `revisado = TRUE` en el historial.

---

## 4. Lógica Pura (`src/lib/revisionDomain.ts`)

```typescript
import { assertValidUuid } from './zeroUuid';
import { resolveLatestRealExecutionDate } from './auditPlanningEngine';
import type { Phase5FindingEntity, ProgramacionAuditEntity } from './auditExecution';

export type RevisionQueueFilter = 'ALL' | 'PENDIENTE' | 'REVISADA';

export interface RevisionAuditSummaryRow {
  audit: ProgramacionAuditEntity;
  realEndIso: string | null;
  closingDateIso: string;
  totalNcs: number;
  openNcs: number;
  revisado: boolean;
  fechaRevision: string | null;
  documentacionCompleta: boolean;
  revisadoPorNombre: string | null;
  resumenRevision: string | null;
}

export interface RevisionFormDraft {
  id_auditoria: string;
  revisado: boolean;
  fecha_revision: string;
  documentacion_completa: boolean;
  resumen_revision: string;
}

export function buildRevisionQueueRows(
  audits: ReadonlyArray<ProgramacionAuditEntity>,
  findings: ReadonlyArray<Phase5FindingEntity>,
  actorNameById: ReadonlyMap<string, string>
): RevisionAuditSummaryRow[] {
  const rows: RevisionAuditSummaryRow[] = [];

  for (const audit of audits) {
    if (audit.deleted_at) continue;
    if (audit.estado_ciclo !== 'Cerrada' || !audit.fecha_cierre_auditoria) continue;

    const realEntry = resolveLatestRealExecutionDate(audit.fechas);
    const auditNcs = findings.filter(
      (f) => !f.deleted_at && f.id_auditoria === audit.id && (f.tipo === 'NC_MAYOR' || f.tipo === 'NC_MENOR')
    );

    rows.push({
      audit,
      realEndIso: realEntry?.fecha_fin || realEntry?.fecha_inicio || null,
      closingDateIso: audit.fecha_cierre_auditoria,
      totalNcs: auditNcs.length,
      openNcs: auditNcs.filter((nc) => !nc.cerrado).length,
      revisado: Boolean(audit.revisado),
      fechaRevision: audit.fecha_revision ?? null,
      documentacionCompleta: Boolean(audit.documentacion_completa),
      revisadoPorNombre: audit.revisado_por ? actorNameById.get(audit.revisado_por) || 'Coordinador QA' : null,
      resumenRevision: audit.resumen_revision ?? null,
    });
  }

  return rows.sort((a, b) => {
    if (a.revisado !== b.revisado) return a.revisado ? 1 : -1;
    return b.closingDateIso.localeCompare(a.closingDateIso);
  });
}

export function validateRevisionDraft(
  draft: RevisionFormDraft,
  audit: ProgramacionAuditEntity | undefined
): string | null {
  assertValidUuid(draft.id_auditoria, 'auditoría');
  if (!audit || audit.deleted_at) {
    return 'La auditoría seleccionada no existe o está archivada.';
  }
  if (audit.estado_ciclo !== 'Cerrada' || !audit.fecha_cierre_auditoria) {
    return 'Solo pueden revisarse auditorías cerradas con fecha de cierre registrada en Resultado.';
  }
  if (draft.revisado) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.fecha_revision)) {
      return 'Indique una fecha de revisión válida (YYYY-MM-DD).';
    }
    if (draft.fecha_revision < audit.fecha_cierre_auditoria) {
      return 'La fecha de revisión no puede ser anterior a la fecha de cierre de la auditoría.';
    }
    if (!draft.documentacion_completa) {
      return 'Confirme que la documentación del expediente está completa antes de aprobar la revisión.';
    }
  }
  return null;
}
```

---

## 5. Orquestación UI y Estado (`src/views/revisionView.ts` y `src/main.ts`)

### 5.1 Columnas `table-fixed` + `<colgroup>` (`tableId: 'revision-main'`)

| `col.id` | `header` | `defaultWidthPct` | `minWidthPx` | Contenido Celda |
| :--- | :--- | :---: | :---: | :--- |
| `auditoria` | `Certificado & Org` | `30%` | `185` | N° Certificado · Organización · Código auditoría |
| `cierre` | `Fecha Cierre` | `16%` | `115` | `fecha_cierre_auditoria` (`font-mono`) |
| `hallazgos` | `Resumen NC` | `16%` | `115` | `0 NCs` o `N NCs (K cerradas)` |
| `documentacion` | `Documentación` | `18%` | `130` | `Completa ✓` vs `Pendiente verificar` |
| `estado_revision` | `Revisión QA` | `20%` | `140` | `Pendiente Revisión` vs `Revisada (DD/MM/YYYY)` |
| **Total** | | **`100%`** | | **0 botones dentro de `<td>`** |

### 5.2 Estado y Handler en `src/main.ts`
```typescript
export interface RevisionViewState {
  query: string;
  viewMode: UniversalViewMode;
  isSidebarOpen: boolean;
  sortColumn: 'auditoria' | 'cierre' | 'estado_revision' | null;
  sortDirection: SortDirection;
  facetSelections: MultiViewSelectionMap;
  selectedAuditId: string | null;
  formDraft?: RevisionFormDraft;
  savingRevision: boolean;
  editErrorMessage: string | null;
}
```
* Handler `saveAuditRevision(draft)`: valida `validateRevisionDraft`, actualiza `public.auditoria` (`revisado`, `fecha_revision`, `revisado_por = profile.id`, `documentacion_completa`, `resumen_revision`) y recarga `programacionAudits`.

---

## 6. Matriz RBAC del Paso 11.1

| Rol | Ve Cola `Revisión` (`Cerrada`) | Aprobar / Editar Revisión QA |
| :--- | :--- | :--- |
| **`ADMIN`** | Todas las cerradas | Sí |
| **`WORKER`** | Todas las cerradas activas | Sí |
| **`AUDITOR`** | Solo sus auditorías cerradas asignadas | No (solo lectura) |
| **`CLIENT`** | Solo auditorías cerradas de sus orgs | No (solo lectura) |

---

## 7. Pruebas Automatizadas (`src/lib/revisionDomain.test.ts`)
1. `buildRevisionQueueRows`: filtra exclusivamente auditorías en `'Cerrada'` con `fecha_cierre_auditoria`, ordenando `Pendiente` primero.
2. `validateRevisionDraft`: rechaza revisión si `documentacion_completa = false` o si `fecha_revision < fecha_cierre_auditoria` o si la auditoría no está cerrada.
3. Render `revisionView`: suma `100%` en `<colgroup>`, cero `<button` en `<tbody>`, y nunca expone UUIDs (`revisado_por` muestra nombre legible).

---

## 8. Criterios de Aceptación (Done Criteria)
- [ ] Subvista `#/auditorias/revision` operativa bajo `Auditoría`.
- [ ] Solo muestra auditorías cerradas desde `Resultado` (Paso 10).
- [ ] Trigger DB + validación cliente impiden aprobar revisión sin cierre ni verificación documental.
