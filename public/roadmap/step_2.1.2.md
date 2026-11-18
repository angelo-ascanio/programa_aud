# Step 2.1.2 — Motor Puro Base (`auditPlanningEngine.ts` Parte A): Vinculación en 2 Niveles, Fechas 1:N y Balanceo Dual-Bucket

## Objetivo
Construir los **contratos base y reglas centrales de planificación** en `src/lib/auditPlanningEngine.ts` y alinear `src/lib/auditDomain.ts` / `src/lib/auditExecution.ts` (`strict: true`, `0 any`), cubriendo:
1. Contratos de la entidad maestra **`ProgramaAuditoriaEntity`** y validador de reglas **Individual vs. Nivel 1 Intra-Org vs. Nivel 2 Inter-Org**.
2. Contratos y resolvedor de fechas 1:N **`AuditDateEntry`** (`resolveLatestAuditDate`, `getNextAuditDateSequence`, `formatAuditDateLabel`).
3. Máquina de estados persistidos vs. etiquetas dinámicas (`AuditCycleStatus`, `AuditDynamicTag`), balanceo dual-bucket `0.25d` (`Cubo 1 vs Cubo 2`) y completitud `Sitio → Proceso → Turnos → Auditores`.

*(Los cálculos analíticos de Span Calendario, Conflictos de Agenda, Filtro de Certificados Sin Programar, Historial y Alertas Configurables se implementan en `Step 2.1.3`).*

---

## Archivos a Crear / Modificar
- **Crear:** `src/lib/auditPlanningEngine.ts` (Parte A: contratos, vinculación, fechas 1:N, cuadre dual-bucket, completitud y tags)
- **Modificar:** `src/lib/auditDomain.ts`
- **Modificar:** `src/lib/auditExecution.ts`
- **Crear:** `src/lib/auditPlanningEngine.test.ts` (pruebas base)
- **Modificar:** `src/lib/auditDomain.test.ts`

---

## Especificación Técnica Detallada

### 1. Vinculación en 2 Niveles (`ProgramaAuditoriaEntity`)
```ts
export type AuditLinkLevel = 'INDIVIDUAL' | 'NIVEL_1_INTRA_ORG' | 'NIVEL_2_INTER_ORG';

export type AuditLinkNature =
  | 'Individual'
  | 'Combinada'
  | 'Integrada'
  | 'Conjunta'
  | 'Simultánea'
  | 'Multientidad'
  | 'Multisitio';

export interface ProgramaAuditoriaEntity {
  id: string;
  codigo_programa: string | null;
  etiqueta: string;
  nivel_vinculacion: AuditLinkLevel;
  tipo_vinculacion: AuditLinkNature;
  es_vinculada: boolean;
  id_ciclo_origen?: string | null;
  notas?: string | null;
  auditorias: ProgramacionAuditEntity[];
  deleted_at?: string | null;
}
```
- **`validateProgramLinkingRules(nivel, tipo, selectedCerts)`:**
  - `'INDIVIDUAL'`: exige `tipo === 'Individual'` y exactamente `1` certificado.
  - `'NIVEL_1_INTRA_ORG'`: exige `tipo !== 'Individual'` y que **todos** los certificados seleccionados compartan exactamente el mismo `id_organizacion` (para cierre requiere `>= 2` certificados; en borrador inicial permite `>= 1`).
  - `'NIVEL_2_INTER_ORG'`: exige `tipo !== 'Individual'` y admite certificados de `2+` organizaciones distintas.

### 2. Contratos y Motor Multi-Fecha 1:N (`AuditDateEntry`)
```ts
export type AuditDatePrecision = 'PREPROGRAMADA_MES' | 'REAL';
export type AuditDateTag = 'Programación' | 'Reprogramación';

export interface AuditDateEntry {
  id: string;
  id_auditoria: string;
  numero_secuencia: number;
  tag: AuditDateTag;
  tipo_fecha: AuditDatePrecision;
  anio: number | null;
  mes: number | null;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  observacion?: string | null;
  deleted_at?: string | null;
}
```
- `resolveLatestAuditDate(fechas)`: filtra activas (`!deleted_at`), ordena por `numero_secuencia DESC` y devuelve la más reciente (o `null`).
- `getNextAuditDateSequence(fechas)`: devuelve `max(numero_secuencia) + 1` (o `1`).
- `validateAuditDateEntryInput(input)`: valida `anio` (`2000..2100`) + `mes` (`1..12`) en `PREPROGRAMADA_MES`, o `fecha_inicio <= fecha_fin` en `REAL`.
- `formatAuditDateLabel(entry)`: formatea texto legible sin UUIDs (ej. `"10/06/2026 – 12/06/2026 (Reprog. #2)"` o `"Sep 2026 · Preprogramada (#1)"`).

### 3. Árbol Relacional, Cuadre Dual-Bucket `0.25d` y Etiquetas Dinámicas
- Definir `AuditoriaTurnoProcesoLink`, `AuditoriaEquipoProcesoLink`, `AuditoriaProcesoSitioItem`, `AuditoriaEquipoSitioItem` y `AuditoriaSitioPlanItem`.
- `roundAuditDaysQuarter(value)`: redondea a múltiplos de `0.25d` (`>= 0`).
- `computeSiteDayBalance(site)` y `computeAuditDayBalance(sitios, auditPlannedDays)`: suman Cubo 1 (demanda por sitio) vs Cubo 2 (asignación a auditores por sitio) y consolidan `auditorTotals`.
- `resolveEffectiveAuditorsForProcess(site, procesoItem)`: combina asignados con `asignacion_completa_sitio = true` y asignados M:N en `equipo_auditor_proceso_sitio`.
- `evaluateSitePlanningCompleteness(site)`: exige `procesos.length > 0`, cada proceso con `>= 1` turno y `>= 1` auditor efectivo.
- `computeAuditPlanningStatus(audit, todayIso)`: calcula `primaryTag`, `isOverdue` (usando `resolveLatestAuditDate(audit.fechas)` cuando es `REAL`), `completionPercent`, `balanceSummary` y `pendingReasons`. Nunca bloquea guardado de borradores.
- `computeProgramPlanningStatus(program, todayIso)`: agrega completitud, días Cubo 1/2 y estado consolidado de las auditorías del programa.

### 4. Alineación de `auditDomain.ts` y `auditExecution.ts`
- Añadir `id_programa_auditoria`, `fechas: AuditDateEntry[]`, `latestDate`, `codigo_auditoria`, `tiempo_auditoria`, `estado_ciclo`, `objetivo` y `sitiosPlan` a `ProgramacionAuditEntity` / `AuditFormDraft`.
- Retirar `fecha_programacion` / `fecha_reprogramacion` como campos requeridos en formularios/validadores (exponiendo helpers derivados desde `latestDate` para compatibilidad con vistas de lectura como `resultadoView.ts`).

---

## Pruebas Unitarias (`node:test`)
- `auditPlanningEngine.test.ts` (Parte A):
  - Vinculación: rechazo de 2 orgs en `NIVEL_1_INTRA_ORG`, rechazo de 2 certs en `INDIVIDUAL`, aceptación en `NIVEL_2_INTER_ORG`.
  - Multi-Fecha 1:N: múltiples reprogramaciones (`seq 1..3`), `resolveLatestAuditDate`, validación `PREPROGRAMADA_MES` vs `REAL`.
  - Redondeo `0.25d`, cuadre dual-bucket, completitud híbrida (todo el sitio vs granular M:N) y tags dinámicos.
- `auditDomain.test.ts`: actualizado a contratos con `fechas[]` y `id_programa_auditoria`.

---

## Criterios de Verificación de Step 2.1.2
1. `npx tsx --test src/lib/auditPlanningEngine.test.ts src/lib/auditDomain.test.ts` pasa al 100%.
2. `npm run lint` (`tsc --noEmit`) pasa con `0` errores y `0 any`.
