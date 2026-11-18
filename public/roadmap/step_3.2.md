# Step 3.2 — Detail View de `Programación` en 3 Zonas (`'read' | 'add' | 'edit'`): Flujo en 2 Pasos y Multi-Fecha 1:N

## Objetivo
Migrar completamente el Detail View maestro de **`Programación`** (centrado en `programa_auditoria` como entidad superior + sus `auditoria` vinculadas y `auditoria_fecha` 1:N) a la plantilla canónica **`renderDetailPageTemplate` (`src/views/detailTemplate.ts`)** de **3 Zonas** y modos **`'read' | 'add' | 'edit'`**, estructurando el **Flujo de Planificación en 2 Pasos**:
- **Paso 1:** Vinculación de certificados (**Individual**, **Nivel 1 Intra-Org** o **Nivel 2 Inter-Org**), etiqueta descriptiva, naturaleza (`Combinada`, `Integrada`, `Conjunta`, `Simultánea`, `Multientidad`, `Multisitio`), referencia opcional de evolución de ciclo, y selección de `tipo_auditoria` / `metodologia` por certificado.
- **Paso 2 ("The Hard Magic" — orquestado aquí y detallado en Step 4.1):** selector de certificado dentro de la campaña, **Gestor Relacional de Fechas 1:N (`auditoria_fecha`: `Programación` / `Reprogramación`, `PREPROGRAMADA_MES` vs `REAL`, `observacion`)**, sincronización opcional de fecha grupal, y pestañas de planificación granular (`Sitios → Procesos → Turnos → Auditores + Días`).

---

## Archivos a Modificar / Crear
- `src/views/programacionView.ts` (reestructuración de `renderProgramDetailView` en 3 Zonas `'read' | 'add' | 'edit'` con Paso 1 + Paso 2 + historial 1:N de fechas)
- `src/views/sitioAuditoriaView.ts` (sub-vista declarativa en 3 Zonas para inspeccionar un `sitios_por_auditoria` puntual desde el detalle)
- `src/views/auditoriasView.ts` (precedencia hoja-a-raíz en dominio `auditorias`)
- `src/main.ts` (máquina `'read' | 'add' | 'edit'`, form `#programaAuditDetailForm`, navegación Paso 1 ↔ Paso 2, cambio de certificado activo en Paso 2, acciones `[←]`, `[✏️]`, `[🕒]`, `[🗄️]`, toast `#archiveGovernanceToast`, alta/reprogramación de `auditoria_fecha`)
- Pruebas (`src/lib/auditDetailViews.test.ts` + `src/lib/phase62UiIntegrity.test.ts`)

---

## Especificación Técnica Detallada

### 1. Máquina de Estados del Detail View (`'read' | 'add' | 'edit'`)
```ts
export type ProgramDetailMode = 'read' | 'add' | 'edit';

export function resolveProgramDetailMode(
  state: AuditPlanningViewState,
  isStaff: boolean,
  selectedProgram?: ProgramaAuditoriaEntity
): ProgramDetailMode {
  if (!isStaff) return 'read';
  if (state.isCreating && !state.selectedProgramId) return 'add';
  if (selectedProgram && state.isEditingAttributes) return 'edit';
  return 'read';
}
```
- **Bloqueo RBAC:** `CLIENT`, `AUDITOR` y cuentas no aprobadas resuelven siempre a `'read'`; ningún control de creación, vinculación, reprogramación ni archivo se renderiza para ellos.
- **Aislamiento Nivel 2 en `'read'`:** si un `CLIENT` accede a un programa `NIVEL_2_INTER_ORG`, solo ve sus propias auditorías/certificados autorizados por RLS, nunca nombres ni metadatos de otras organizaciones.

---

### 2. Cabecera Única Icon-Only (`detailTemplate.ts`)
- **Izquierda:**
  - Botón volver `[←]` (`data-nav-back="true"`, `w-9 h-9`) regresando vía `popToParentBreadcrumb`.
  - Ícono `📋` + `<h1>`: `'Nuevo Programa de Auditoría'` en `'add'`, o **`program.etiqueta`** (`Planta Santa Cruz`) + código `PROG-2026-001` y pill de vinculación (`Nivel 1 · Integrada`) + pill de estado global (`computeProgramPlanningStatus`).
- **Derecha en `'read'`:**
  - `[✏️]` `#startEditProgramBtn` (`w-9 h-9`, solo staff `ADMIN`/`WORKER`).
  - `[🕒]` `data-action="open-changelog"` (`table_name = 'programa_auditoria'`).
  - `[🗄️]` `renderArchivarButtonHtml({ tableName: 'programa_auditoria', iconOnly: true, ... })` (solo staff `ADMIN`/`WORKER`).
- **Derecha en `'add'` o `'edit'` (`customTopActionsHtml`):**
  - Se ocultan `[✏️]`, `[🕒]` y `[🗄️]`.
  - Únicamente dos botones icon-only `w-9 h-9` en este orden exacto:
    1. **Guardar (PRIMERO):** `<button type="submit" id="saveProgramFormBtn" form="programaAuditDetailForm" ...>` (`bg-emerald-600 text-white`).
    2. **Cancelar (SEGUNDO):** `<button type="button" id="cancelEditProgramBtn" ...>` (`bg-rose-50 text-rose-700`).
  - **Cero botones Guardar/Cancelar al final del formulario.**

---

### 3. Indicador de Pasos (`Paso 1: Vinculación y Alcance` ↔ `Paso 2: Fechas, Sitios y Auditores`)
- Stepper limpio en la parte superior del cuerpo (no bloqueante al editar un programa existente, y en `'add'` guía al usuario a guardar el Paso 1 para habilitar el Paso 2 de asignación granular):
  - **En `'add'`:** el formulario crea el `programa_auditoria` + sus `auditoria` iniciales (+ fecha inicial `#1` si se capturó) y al guardar transiciona suavemente al **Paso 2** sobre el programa recién persistido (con toast en `#archiveGovernanceToast`).
  - **En `'read'` / `'edit'`:** el usuario puede inspeccionar/editar tanto los datos del **Paso 1** (Zona 1 + Zona 2) como operar libremente en el **Paso 2** (Zona 3).

---

### 4. Zona 1 y Zona 2 — Paso 1: Configuración de Vinculación y Certificados Participantes
1. **Zona 1 — Relaciones y Naturaleza de Vinculación (`customParentZoneHtml`):**
   - **Nivel de Vinculación (`nivel_vinculacion`):** radio/selector limpio:
     - `Individual` (1 certificado, 1 organización).
     - `Nivel 1 — Intra-Organización` (2+ certificados de la **misma organización**).
     - `Nivel 2 — Inter-Organización` (2+ certificados de **distintas organizaciones**).
   - **Naturaleza (`tipo_vinculacion`):**
     - Bloqueado en `'Individual'` si nivel es `INDIVIDUAL`; o seleccionable entre `Combinada | Integrada | Conjunta | Simultánea | Multientidad | Multisitio` en Nivel 1 / Nivel 2 (con tooltip explicativo conciso de cada naturaleza ISO).
   - **Evolución de Ciclo Anterior (`id_ciclo_origen`, opcional):** selector filtrado a programas previos relacionados (permite enlazar, por ejemplo, un ciclo anterior `Combinada` con el nuevo ciclo `Integrada`), mostrando salto contextual `→` en `'read'`.
2. **Zona 2 — Atributos Maestros y Lista de Certificados Vinculados (`<form id="programaAuditDetailForm">`):**
   - **`etiqueta` (obligatorio `*`):** nombre descriptivo de la visita/campaña (ej. `Planta Santa Cruz`).
   - **`codigo_programa`:** ej. `PROG-2026-001` (sugerido automático por año/correlativo, editable).
   - **`notas`:** observaciones generales de la campaña.
   - **Constructor de Certificados del Programa (Paso 1):**
     - En `INDIVIDUAL`: selector de 1 certificado (pre-poblado si viene desde el filtro de *Certificados Pendientes de Programar*).
     - En `NIVEL_1_INTRA_ORG`: selector de Organización + checklist/agregador de `2..N` certificados activos de esa misma organización (impidiendo mezclar organizaciones distintas).
     - En `NIVEL_2_INTER_ORG`: agregador multi-organización (`Organización → Certificado`, identificando visualmente qué organizaciones participan).
     - Para cada certificado incluido en la tabla/lista del Paso 1:
       - `codigo_auditoria` (ej. `AUD-2026-001`).
       - `id_tipo_auditoria` (`Etapa 1`, `Etapa 2`, `Seguimiento 1`, `Renovación`, etc. — opcional en borrador).
       - `id_metodologia` (`Presencial`, `Remota`, `Mixta` — opcional en borrador).
       - `estado_ciclo` (`AuditCycleStatus`) + pill del `AuditDynamicTag` calculado.
       - Opcional en `'add'`: captura rápida de **Fecha Inicial (#1)** (`PREPROGRAMADA_MES` Mes/Año o `REAL` Fecha Inicio → Fecha Fin) aplicable a todas las auditorías creadas en Paso 1.
   - **Validación y Toasts:** errores en único banner `bg-rose-50` dentro de Zona 2; éxitos mediante `showFloatingToast(..., 'success', 4500)` en `#archiveGovernanceToast`.

---

### 5. Zona 3 — Paso 2: Selector de Auditoría por Certificado, Gestor Multi-Fecha 1:N y Pestañas Hijas
En modos `'read'` y `'edit'`:
1. **Selector / Barra de Certificados de la Campaña (si hay `>= 2` certificados vinculados):**
   - Chips o sub-tabs limpios por cada `auditoria` (`FN-QMS-2024-001 · ISO 9001`, `FN-EMS-2024-002 · ISO 14001`, etc.) mostrando su % de completitud y cuadre de días (`Cubo 1 vs Cubo 2`), más resumen global de la campaña.
2. **Gestor Relacional Multi-Fecha 1:N (`auditoria_fecha`) para la Auditoría Activa:**
   - Muestra **Fecha Vigente Actual** destacada (`MAX(numero_secuencia)`, ej. `Reprogramación #2 · 10/06/2026 → 12/06/2026 (3 días calendario)` o `Pre-programada: Sep 2026`).
   - **Línea de Tiempo de Secuencias (`1, 2, 3...`):** lista ordenada con `#numero_secuencia`, `tag` (`Programación` | `Reprogramación`), tipo (`Real` | `Mes/Año`), fechas o mes/año, y `observacion`.
   - **Acciones Staff (`ADMIN`/`WORKER`):**
     - Botón `+ Programar Fecha` (si no hay secuencias) o `+ Reprogramar Fecha` (crea `seq + 1` con `tag = 'Reprogramación'`, selector `PREPROGRAMADA_MES` vs `REAL`, inputs de mes/año o `fecha_inicio`/`fecha_fin` y campo `observacion`).
     - Checkbox/acción opcional `"Aplicar también a los demás certificados vinculados de esta campaña"` (propaga la nueva secuencia a las auditorías hermanas del programa).
3. **Pestañas Hijas del Paso 2 (`Zona 3`):**
   - **`planificacion` (`🌳 Planificador Visual Paso 2`):** Árbol/Acordeón `Sitios → Procesos del Sitio → Turnos → Auditores + Días (0.25d)` + panel **"Historial del Certificado"** (implementados íntegramente en **Step 4.1**).
   - **`equipo_resumen` (`👥 Equipo y Carga Días`):** tabla `table-fixed` consolidada por auditor (días asignados vs rango calendario real, rol y calificación `auditor_esta_calificado`), clicable hacia `Auditor`.
   - **`hallazgos` (`🔍 Hallazgos y Comentarios`):** resumen de `hallazgo` y `comentarios_por_auditoria`, sin botones en `<td>`.

---

## Criterios de Verificación de Step 3.2
1. `Programación` Detail View cumple `renderDetailPageTemplate` (Guardar-primero / Cancelar-segundo arriba a la derecha, cero botones al pie, `#archiveGovernanceToast`, breadcrumbs en 1 línea `<= 24` chars).
2. En **Paso 1**, se puede crear un programa `Individual`, `Nivel 1 Intra-Org` (validando misma organización) o `Nivel 2 Inter-Org` (vinculando 2+ organizaciones) y definir el tipo de auditoría de cada certificado.
3. En **Paso 2**, se puede registrar una fecha `PREPROGRAMADA_MES` (`seq #1`) y luego agregar una `Reprogramación` `REAL` (`seq #2`) con `observacion`, preservando ambas en `auditoria_fecha` y mostrando `#2` como vigente.
4. `AUDITOR` y `CLIENT` solo acceden en `'read'`, y `CLIENT` en Nivel 2 jamás visualiza certificados de otras organizaciones.
