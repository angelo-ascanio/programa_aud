# Step 5.2: `Designación → Temporal` — Lógica Pura (`src/lib/designacionTemporalDomain.ts`) y Vista UI (`src/views/designacionTemporalView.ts`)

## 1. Identificador, Nombre y Dependencias
* **Step ID:** `5.2`
* **Nombre Corto (UI):** `Temporal` (bajo `Designación`)
* **Bloque / Sub-sección:** Bloque 1 — `Auditoría` → `Designación` → `Temporal`
* **Dependencias:** `step_5.1.md`, `step_4.3.md`

---

## 2. Alcance Exacto y Reglas de Negocio
1. **Filtrado Estricto de Entrada (`tiene_sitio_temporal === true`):**
   * La lista de `Temporal` muestra **únicamente** campañas/auditorías donde al menos una auditoría activa tiene `tiene_sitio_temporal = true` Y ya completó Paso 3 (`Tipo`, con fecha y tipo asignados).
   * Si el usuario abre `Temporal` y no tiene campañas activas con temporal, muestra estado vacío claro con botón directo hacia **`Paso 4: Sitio`** para activar `tiene_sitio_temporal`.
2. **Atributos y Reglas del Sitio Temporal:**
   * `etiqueta`: por defecto `'Sitio Temporal'` si el campo queda vacío.
   * `comentario`: notas opcionales del proyecto/obra temporal.
   * `tiempo_auditoria`: pasos de `0.25d` (`0.25`, `0.50`, `0.75`, `1.00`, ...).
   * **Asociación M:N a Certificados del Vínculo:** Checkboxes por cada certificado participante en el `programa_auditoria` para definir exactamente sobre qué certificados aplica este tiempo temporal (mínimo 1 certificado seleccionado).
3. **Filtros Rápidos de Control Operativo (Facets):**
   * `Sin tiempo asignado`: sitios temporales con `tiempo_auditoria <= 0` o auditorías marcadas `tiene_sitio_temporal = TRUE` que todavía tienen `0` sitios temporales creados.
   * `Sin auditores asignados`: sitios temporales donde `SUM(equipo_auditor_sitio_temporal.tiempo_auditoria) < tiempo_auditoria`.
   * `Completos`: tiempo `> 0`, `>= 1` certificado asociado y equipo cuadrado.

---

## 3. Cambios Exactos en Base de Datos
Ninguno adicional (usa `auditoria_sitio_temporal` y `auditoria_sitio_temporal_certificado` de Step 5.1; añade registro en `src/lib/archiveGovernance.ts`).

---

## 4. Lógica Pura (`src/lib/designacionTemporalDomain.ts`)

```typescript
import { assertValidUuid, isValidUuid } from './zeroUuid';
import {
  roundAuditDaysQuarter,
  type ProgramaAuditoriaEntity,
} from './auditPlanningEngine';
import type { ProgramacionAuditEntity } from './auditExecution';

export interface TemporalSiteCertLink {
  id: string;
  id_sitio_temporal: string;
  id_auditoria_certificado: string;
  numero_certificado: string;
  organizacion_nombre: string;
  norma_codigo: string;
  deleted_at?: string | null;
}

export interface TemporalSiteTeamAssignment {
  id: string;
  id_sitio_temporal: string;
  id_auditor: string;
  auditor_nombre: string;
  rol_auditor: 'AUDITOR_LIDER' | 'AUDITOR' | 'AUDITOR_EN_ENTRENAMIENTO' | 'EXPERTO_TECNICO';
  tiempo_auditoria: number;
  deleted_at?: string | null;
}

export interface AuditoriaSitioTemporalEntity {
  id: string;
  id_auditoria: string;
  etiqueta: string;
  comentario: string | null;
  tiempo_auditoria: number;
  certificados: TemporalSiteCertLink[];
  equipoTemporal: TemporalSiteTeamAssignment[];
  deleted_at?: string | null;
  deleted_by?: string | null;
  delete_reason?: string | null;
}

export interface TemporalSiteFormDraft {
  id_auditoria: string;
  etiqueta: string;
  comentario: string;
  tiempo_auditoria: number;
  targetAuditCertIds: string[];
}

export type TemporalPendingStatus =
  | 'SIN_SITIO_TEMPORAL'
  | 'SIN_TIEMPO'
  | 'SIN_AUDITORES'
  | 'COMPLETO';

export interface CampaignTemporalRow {
  program: ProgramaAuditoriaEntity;
  anchorAudit: ProgramacionAuditEntity;
  temporalSites: AuditoriaSitioTemporalEntity[];
  totalTemporalDays: number;
  assignedTemporalDays: number;
  pendingStatus: TemporalPendingStatus;
  missingTimeCount: number;
  missingAuditorCount: number;
}

export function createEmptyTemporalSiteDraft(
  anchorAuditId: string,
  defaultCertAuditIds: ReadonlyArray<string>
): TemporalSiteFormDraft {
  return {
    id_auditoria: anchorAuditId,
    etiqueta: 'Sitio Temporal',
    comentario: '',
    tiempo_auditoria: 1.0,
    targetAuditCertIds: defaultCertAuditIds.slice(),
  };
}

export function validateTemporalSiteDraft(
  draft: TemporalSiteFormDraft,
  campaignAudits: ReadonlyArray<ProgramacionAuditEntity>
): string | null {
  if (!isValidUuid(draft.id_auditoria)) {
    return 'Auditoría ancla inválida para el sitio temporal.';
  }
  const anchor = campaignAudits.find((a) => !a.deleted_at && a.id === draft.id_auditoria);
  if (!anchor || anchor.tiene_sitio_temporal !== true) {
    return 'La auditoría debe tener activo el indicador de Sitio Temporal (Paso 4: Sitio).';
  }
  const rounded = roundAuditDaysQuarter(draft.tiempo_auditoria);
  if (rounded <= 0 || Math.abs(rounded - draft.tiempo_auditoria) > 0.001) {
    return 'El tiempo del sitio temporal debe ser mayor a 0 en múltiplos de 0.25 días.';
  }
  if (draft.targetAuditCertIds.length === 0) {
    return 'Seleccione al menos un certificado al cual aplica este sitio temporal.';
  }
  const allowedIds = new Set(campaignAudits.filter((a) => !a.deleted_at).map((a) => a.id));
  for (const id of draft.targetAuditCertIds) {
    assertValidUuid(id, 'certificado en campaña');
    if (!allowedIds.has(id)) {
      return 'Uno de los certificados asociados no pertenece a la campaña actual.';
    }
  }
  return null;
}

export function computeCampaignTemporalRows(
  programs: ReadonlyArray<ProgramaAuditoriaEntity>,
  temporalSites: ReadonlyArray<AuditoriaSitioTemporalEntity>
): CampaignTemporalRow[] {
  const rows: CampaignTemporalRow[] = [];

  for (const program of programs) {
    if (program.deleted_at) continue;
    const activeAudits = program.auditorias.filter((a) => !a.deleted_at);
    const temporalAudits = activeAudits.filter((a) => a.tiene_sitio_temporal === true);
    if (temporalAudits.length === 0) continue;

    // Requiere Paso 3 (Tipo) completo en al menos el ancla
    const anchorAudit = temporalAudits[0];
    const hasStep3 = Boolean(anchorAudit.id_tipo_auditoria) &&
      ((anchorAudit.fechas || []).some((f) => !f.deleted_at && f.tipo_fecha !== 'REAL') || Boolean(anchorAudit.latestDate));
    if (!hasStep3) continue;

    const auditIds = new Set(activeAudits.map((a) => a.id));
    const relatedTemporals = temporalSites.filter(
      (t) => !t.deleted_at && auditIds.has(t.id_auditoria)
    );

    const totalTemporalDays = roundAuditDaysQuarter(
      relatedTemporals.reduce((s, t) => s + (t.tiempo_auditoria || 0), 0)
    );
    const assignedTemporalDays = roundAuditDaysQuarter(
      relatedTemporals.reduce(
        (s, t) =>
          s +
          t.equipoTemporal
            .filter((m) => !m.deleted_at)
            .reduce((ms, m) => ms + (m.tiempo_auditoria || 0), 0),
        0
      )
    );

    const missingTimeCount = relatedTemporals.filter((t) => (t.tiempo_auditoria || 0) <= 0).length;
    const missingAuditorCount = relatedTemporals.filter((t) => {
      const sumTeam = t.equipoTemporal
        .filter((m) => !m.deleted_at)
        .reduce((ms, m) => ms + (m.tiempo_auditoria || 0), 0);
      return t.tiempo_auditoria > 0 && Math.abs(sumTeam - t.tiempo_auditoria) > 0.001;
    }).length;

    const pendingStatus: TemporalPendingStatus =
      relatedTemporals.length === 0
        ? 'SIN_SITIO_TEMPORAL'
        : missingTimeCount > 0
        ? 'SIN_TIEMPO'
        : missingAuditorCount > 0
        ? 'SIN_AUDITORES'
        : 'COMPLETO';

    rows.push({
      program,
      anchorAudit,
      temporalSites: relatedTemporals,
      totalTemporalDays,
      assignedTemporalDays,
      pendingStatus,
      missingTimeCount,
      missingAuditorCount,
    });
  }

  return rows;
}
```

---

## 5. Orquestación UI y Estado (`src/views/designacionTemporalView.ts` y `src/main.ts`)

### 5.1 Columnas `table-fixed` + `<colgroup>` (`tableId: 'designacion-temporal-main'`)

| `col.id` | `header` | `defaultWidthPct` | `minWidthPx` | Contenido Celda |
| :--- | :--- | :---: | :---: | :--- |
| `campania` | `Campaña / Vínculo` | `32%` | `190` | Etiqueta + código + fecha programada |
| `temporales` | `Sitios Temporales` | `26%` | `170` | Etiquetas de sitios temporales o `"Sin configurar"` |
| `tiempo` | `Tiempo Total` | `14%` | `105` | `X.XX d` (`tabular-nums`, derecha) |
| `certificados` | `Certs. Asociados` | `14%` | `110` | `N certs cubiertos` |
| `estado` | `Estado` | `14%` | `120` | Badges `Sin tiempo` / `Sin auditores` / `Completo` |
| **Total** | | **`100%`** | | **0 botones dentro de `<td>`** |

### 5.2 Detail View (`designacionTemporalView.ts`) y Estado en `src/main.ts`
* **Facets Multi View:**
  * `Pendientes`: `Sin sitio configurado`, `Sin tiempo asignado`, `Sin auditores asignados`, `Completo`.
* **Detail View:**
  * Formulario para agregar/editar cada `Sitio Temporal` (`etiqueta` default `'Sitio Temporal'`, `comentario`, stepper/input `0.25d` para `tiempo_auditoria`, checkboxes multi-certificado dentro de la campaña).
  * Enlace rápido paralelo hacia **`Paso 6: Tiempo`**, **`Paso 7: Asignación`** (para asignar auditores al sitio temporal) y **`Paso 8: Programa`**.
* Añadir `allTemporalSites: AuditoriaSitioTemporalEntity[]` en `state.domainData` + `designacionTemporalDomain` en `AppState`, hidratado desde Supabase `auditoria_sitio_temporal` + `auditoria_sitio_temporal_certificado` + `equipo_auditor_sitio_temporal`.

---

## 6. Matriz RBAC del Paso 5.2

| Rol | Ve Temporal | Crear / Editar / Archivar Sitio Temporal |
| :--- | :--- | :--- |
| **`ADMIN`** | Todas las campañas con temporal | Sí + Restaurar |
| **`WORKER`** | Todas activas con temporal | Sí |
| **`AUDITOR`** | Solo auditorías asignadas | No |
| **`CLIENT`** | Solo sus certificados | No |

---

## 7. Pruebas Automatizadas (`src/lib/designacionTemporalDomain.test.ts`)
1. `computeCampaignTemporalRows`: excluye auditorías con `tiene_sitio_temporal = false` y las que aún no completan Paso 3; clasifica `SIN_TIEMPO`, `SIN_AUDITORES`, `COMPLETO`.
2. `validateTemporalSiteDraft`: normaliza/permite etiqueta por defecto `'Sitio Temporal'`, rechaza `0.10d` (no múltiplo `0.25d`) y exige al menos 1 certificado de la campaña.
3. Render `designacionTemporalView`: `<colgroup>` suma `100%`, cero `<button` en `<tbody>`, Zero-UUID.

---

## 8. Criterios de Aceptación (Done Criteria)
- [ ] Subvista `#/auditorias/designacion/temporal` filtra exclusivamente auditorías con `tiene_sitio_temporal = TRUE` y Paso 3 completo.
- [ ] Permite múltiples sitios temporales, tiempo en `0.25d` y asociación M:N a certificados del grupo.
- [ ] Filtros `Sin tiempo asignado` y `Sin auditores asignados` operativos.
