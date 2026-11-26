# Paso 1.4 — Asignación Global de `Experto Técnico` e Indicador de Brecha IAF en Bloque 1 `Auditor`

## 1. Objetivo
Integrar en **Bloque 1 → `Auditor`** (`asignacionDomain.ts`, `asignacionView.ts` y persistencia):
1. La **detección automática e indicación no bloqueante** cuando el equipo auditor asignado incluye al menos un auditor (o todos los auditores) sin competencia completa en el **Sector / Sub-Sector IAF** de la auditoría o lote vinculado.
2. El panel de **Experto(s) Técnico(s) de la Auditoría** (alcance global sobre toda la auditoría / lote vinculado, **NO por sitio**), permitiendo elegir uno o varios expertos elegibles según los Sectores/Sub-Sectores IAF presentes en la auditoría/lote, asignar **días (`0.25d`)** y añadir una **observación opcional**.

---

## 2. Archivos Involucrados
- `src/lib/auditExecution.ts` (tipar `expertoTecnicoAsignaciones?: ExpertoTecnicoAuditoriaEntity[]` dentro de `ProgramacionAuditEntity` o mapa compartido)
- `src/lib/asignacionDomain.ts`
- `src/lib/expertoTecnicoPersistence.ts` (o `src/lib/auditPlanningPersistence.ts` — funciones CRUD para `experto_tecnico_auditoria`)
- `src/views/asignacionView.ts`
- `src/lib/resumenDomain.ts` (incluir conteo/nota de expertos técnicos asignados en tarjeta resumen de `Auditor` si aplica)
- `src/main.ts` (hidratación de `experto_tecnico_auditoria` y handlers de alta/edición de días-observación/retiro)
- `src/lib/asignacionDomain.test.ts`
- `src/lib/asignacionView.test.ts`

---

## 3. Especificación Técnica Detallada

### 3.1. Regla de Negocio: Equipo Auditor vs Experto Técnico
- **Auditores (`equipo_auditor_sitio` / `equipo_auditor_sitio_temporal`)**: continúan asignándose por sitio/unidad auditable para cuadrar `SUM(días) === días requeridos`.
  - Nota de limpieza: evaluar si `ROLE_OPTIONS` en `asignacionDomain.ts` / `asignacionView.ts` debe mantener `'EXPERTO_TECNICO'` por compatibilidad histórica en SQL o removerlo del selector de auditores por sitio para evitar confusión con la nueva sección global de Experto Técnico (decisión recomendada: ocultar `'EXPERTO_TECNICO'` del `<select>` de roles por sitio nuevo mientras se preservan lecturas históricas si hubiera filas previas, ya que el Experto Técnico ahora vive como entidad y asignación global propia).
- **Indicador de Brecha IAF del Equipo Auditor (`computeAuditIafGapStatus`):**
  - Inspecciona a todos los auditores asignados en los sitios (permanentes y temporales) de la auditoría activa (y, si es lote vinculado, el contexto completo de sectores/subsectores IAF presentes en la auditoría/lote vinculado):
    - Si `assignedAuditors.length > 0` y **al menos uno** (o **todos**) los auditores asignados no tienen competencia `FULL` en el Sector/Sub-Sector IAF requerido (`match.level === 'NORMA_ONLY'` o `'PARTIAL'` por falta de sector/subsector):
      - Generar estado `hasIafSectorGap = true`, especificando **de forma clara y no bloqueante** si *parte del equipo* o *todo el equipo* carece de competencia sectorial/subsectorial IAF (ej. `"Equipo sin competencia IAF completa en Sub-Sector 13.2 (Cubierto en norma ISO 45001:2018)"`), e indicando si ya hay ≥ 1 Experto Técnico cubriendo ese sector/subsector o si el coordinador puede decidir agregar uno.
  - **No obligatorio:** nunca impedir guardar ni avanzar de paso por falta de experto técnico; es una **decisión asistida e informativa**.

### 3.2. Alcance Global de la Asignación de Experto Técnico
- `collectAuditScopeIafRequirements(activeAudit, audits, programs, certificados)`:
  - Recolecta todos los pares `(sector_iaf, subsector_iaf)` presentes en la auditoría actual y en sus hermanas vinculadas (si pertenece a un lote/campaña vinculado).
- **Elegibilidad y Ranking de Expertos (`rankEligibleExpertosForAudit`):**
  - Lista expertos activos (`!deleted_at`), priorizando:
    1. Disponibles (`estatus === 'Disponible'`) que cubren **exactamente** alguno de los Sub-Sectores IAF o el Sector IAF completo del alcance de la auditoría/lote.
    2. Disponibles con cobertura parcial en lote.
    3. Marcar claramente en el `<select>` si un experto está `No disponible` (permitiendo advertir al coordinador o filtrarlo según estatus).
- **Campos de asignación por experto en `experto_tecnico_auditoria`:**
  - Experto Técnico (`id_experto_tecnico`)
  - **Días asignados** (`dias_asignados`, incrementos de `0.25`, `> 0`) — **Nota:** los días del experto técnico son independientes del balance `SUM(días por sitio)` de los auditores.
  - **Observación** (`observacion`, campo de texto opcional, máx. 500 caracteres, útil para anotar alcance técnico específico, fechas o foco de acompañamiento).
- **Comportamiento en Auditoría Vinculada (Lote):**
  - Un solo experto técnico (o varios si el coordinador lo decide) puede cubrir toda la auditoría / lote vinculado aunque haya múltiples auditores y múltiples sitios. Mostrar claramente qué sectores/subsectores IAF del lote cubre cada experto asignado.

### 3.3. UI en `asignacionView.ts` (Preparada para Refactor "Less Is More" del Paso 4.3)
- En el detalle de `3. Auditor`, incluir:
  1. **Indicador visual no bloqueante de Brecha IAF** cuando el equipo auditor presente falta de competencia sectorial/subsectorial IAF (badge/aviso claro indicando los auditores sin sector y si el experto técnico ya cubre la brecha o está disponible para decidir asignarlo).
  2. **Sección `Expertos Técnicos de la Auditoría (Alcance Global)`**:
     - Lista los expertos asignados a la auditoría con su nombre, competencias IAF que cubren del lote/certificado, `dias_asignados` (editable en `±0.25d`), `observacion` (editable/visible) y botón `Quitar` (solo staff).
     - Formulario inline compacto para staff: `<select>` de Experto Técnico competente en los Sectores/Sub-Sectores IAF de la auditoría/lote, `<input type="number" step="0.25" min="0.25">` de días, `<input>` opcional de observación y botón `Agregar Experto`.

---

## 4. Criterios de Aceptación
1. En un certificado `13.2` + `ISO 45001` con un auditor que solo tiene `ISO 45001`, el sistema muestra claramente la indicación no bloqueante de falta de competencia IAF en el equipo auditor.
2. El staff puede agregar 1 o múltiples expertos técnicos calificados en `13.2` o `13` con días (`0.25d`) y observación opcional a nivel global de auditoría (sin elegir sitio), editar sus días/observación y retirarlos.
3. No bloquea el guardado si el staff decide no asignar experto técnico.
4. `AUDITOR` y `CLIENT` (aislamiento Nivel 2) ven las asignaciones de expertos en modo **solo lectura**.

---

## 5. Verificación
- `npx tsx --test src/lib/asignacionDomain.test.ts src/lib/asignacionView.test.ts src/lib/resumenDomain.test.ts`
- `npx tsc --noEmit && npm run lint && npm run build`
