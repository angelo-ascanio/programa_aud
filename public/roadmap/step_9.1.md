# Step 9.1: `Calendario` — Vista Año / Trimestre (`Q1`–`Q4`) / Mes / Timeline con Conteos y Badges de Etapa Clicables

## 1. Identificador, Nombre y Dependencias
* **Step ID:** `9.1`
* **Nombre Corto (UI):** `Calendario`
* **Bloque / Sub-sección:** Bloque 1 — `Auditoría` → `Calendario` (`#/auditorias/calendar`)
* **Dependencias:** `step_3.3.md`, `step_4.3.md`, `step_5.2.md`, `step_6.2.md`, `step_7.2.md`, `step_8.3.md`

---

## 2. Alcance Exacto y Reglas de Negocio
1. **Conmutador Instantáneo de 4 Granularidades (`CalendarDisplayMode`):**
   * **`anio` (*Año*):** Matriz compacta de los 12 meses del año seleccionado (`Ene`–`Dic`) mostrando en cada celda el conteo total de auditorías/campañas + desglose rápido por estado y clic para hacer zoom a ese mes.
   * **`trimestre` (*Trimestre `Q1`–`Q4`*):** Tarjetas por trimestre (`Q1 Ene–Mar`, `Q2 Abr–Jun`, `Q3 Jul–Sep`, `Q4 Oct–Dic`) con el **conteo exacto por trimestre y mes** (`"Q2 · 5 auditorías"`), lista de eventos y badges de etapa.
   * **`mes` (*Mes*):** Cuadrícula mensual tradicional (`Lun`–`Dom`) con contador del mes y tarjetas/píldoras de auditoría dentro de cada día (y banda superior de `PREPROGRAMADA_MES` del mes sin día exacto).
   * **`timeline` (*Timeline / Gantt*):** Vista cronológica horizontal/lista por mes y trimestre con barras de duración `[fecha_inicio → fecha_fin]` y columnas `table-fixed` en modo tabla.
2. **Contadores Exactos por Periodo:**
   * Toda barra superior del calendario muestra: Total Año (`N`), `Q1 (n)`, `Q2 (n)`, `Q3 (n)`, `Q4 (n)` y Mes activo (`n`) calculados consistentemente sobre fecha `REAL` (si ya ejecutada) o `PROGRAMADA_EXACTA` / `PREPROGRAMADA_MES` vigente (Paso 3).
3. **Badge Clicable de Etapa del Pipeline (1 Palabra) con Deep-Link Directo:**
   * Evaluado por `resolveCurrentPipelineStage(audit, temporalSites)` (`src/lib/pipelineEngine.ts`):
     * `'Vínculo'` → `#/auditorias/vinculo`
     * `'Tipo'` → `#/auditorias/designacion/tipo`
     * `'Sitio'` → `#/auditorias/designacion/sitio`
     * `'Temporal'` → `#/auditorias/designacion/temporal`
     * `'Tiempo'` → `#/auditorias/tiempo`
     * `'Asignación'` → `#/auditorias/asignacion`
     * `'Programa'` → `#/auditorias/programa`
     * `'Resultado'` → `#/auditorias/resultado` (para auditorías ejecutadas/listas para resultado)
     * `'Revisión'` → `#/auditorias/revision` (si ya está `'Cerrada'` y pendiente de QA)
     * `'Finalizada'` → `#/auditorias/revision`
   * Al hacer clic en el badge o píldora del evento en el calendario, `main.ts` navega directamente a la subvista exacta del paso y pre-selecciona `selectedProgramId` / `selectedAuditId` correspondiente sin perder contexto.

---

## 3. Cambios Exactos en Base de Datos
Ninguno adicional (consume `programa_auditoria`, `auditoria`, `auditoria_fecha`, `sitios_por_auditoria`, `auditoria_sitio_temporal`).

---

## 4. Lógica Pura (`src/lib/pipelineEngine.ts` + actualización `src/lib/auditExecution.ts` y `calendarioView.ts`)
* Actualizar `CalendarDisplayMode = 'anio' | 'trimestre' | 'mes' | 'timeline'`.
* Definir `resolveCurrentPipelineStage(programOrAudit, temporalSites)`:
```typescript
export type PipelineStageOneWord =
  | 'Vínculo'
  | 'Tipo'
  | 'Sitio'
  | 'Temporal'
  | 'Tiempo'
  | 'Asignación'
  | 'Programa'
  | 'Resultado'
  | 'Revisión'
  | 'Finalizada';

export interface PipelineStageBadgeMeta {
  stage: PipelineStageOneWord;
  targetSubview: string;
  badgeClass: string;
}
```
* Funciones puras `computeCalendarPeriodCounts(scopedEvents, selectedYear)`: retorna conteos por año, `Q1..Q4` y meses `1..12` (separando `PROGRAMADA_EXACTA`, `PREPROGRAMADA_MES` y `REAL`).

---

## 5. Orquestación UI y Estado (`src/views/calendarioView.ts` y `src/main.ts`)
* Extender `CalendarioViewState` en `auditExecution.ts`:
  * `displayMode: 'anio' | 'trimestre' | 'mes' | 'timeline'`
  * `selectedQuarter: 1 | 2 | 3 | 4`
  * Facets adicionales por **`Etapa del Pipeline`** (`Tipo`, `Sitio`, `Temporal`, `Tiempo`, `Asignación`, `Programa`, `Resultado`, `Revisión`).
* **Atributos de Deep-Link en Píldora / Botón de Etapa (`calendarioView.ts`):**
  * `data-action="jump-pipeline-stage"`
  * `data-target-subview="designacion/sitio"` (o el que corresponda)
  * `data-program-id="..."`
  * `data-audit-id="..."`
* Nota Clean List en modo tabla de Timeline: mantener `<colgroup>` sumando `100%` y cero `<button>` dentro de `<td>` (los clics en fila en modo tabla abren el paso correspondiente o Detail View). En las tarjetas del Calendario Mensual/Trimestral/Anual sí se renderizan botones/badges clicables directos.

---

## 6. Matriz RBAC del Paso 9.1

| Rol | Ve `Calendario` | Deep-Link por Badge |
| :--- | :--- | :--- |
| **`ADMIN`** | Todas las auditorías | Directo al paso exacto con capacidad de edición |
| **`WORKER`** | Todas activas | Directo al paso exacto con capacidad de edición |
| **`AUDITOR`** | Solo auditorías asignadas | Navega en lectura (o a `Resultado` en sus asignadas) |
| **`CLIENT`** | Solo sus certificados (oculta hermanas Nivel 2) | Navega en solo lectura |

---

## 7. Pruebas Automatizadas (`src/lib/calendarioDomain.test.ts` o dentro de `auditPlanningEngine.test.ts`)
1. `resolveCurrentPipelineStage`: recorre ordenadamente los 10 estados desde `'Tipo'` hasta `'Finalizada'` conforme se satisfacen los predicados.
2. `computeCalendarPeriodCounts`: suma con exactitud conteos por `Q1..Q4` y meses `1..12` incluyendo fechas `PREPROGRAMADA_MES` y `PROGRAMADA_EXACTA` / `REAL`.
3. Test de render en `calendarioView`: presencia del selector `[Año | Trimestre | Mes | Timeline]` y atributos `data-target-subview` sin exposición de UUIDs.

---

## 8. Criterios de Aceptación (Done Criteria)
- [ ] Modos `Año`, `Trimestre (Q1–Q4)`, `Mes` y `Timeline` operan con conteos exactos por periodo.
- [ ] Cada auditoría muestra su badge de etapa de **1 palabra** (`Vínculo`, `Tipo`, `Sitio`, `Temporal`, `Tiempo`, `Asignación`, `Programa`, `Resultado`, `Revisión`).
- [ ] Clicar el badge redirige directamente a la subvista y registro exactos sin perder contexto.
