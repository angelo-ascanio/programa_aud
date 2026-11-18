# Step 3.2.1 — Detail View `Programación` en 3 Zonas (`detailTemplate.ts`): Shell, Modos `'read' | 'add' | 'edit'` y **Paso 1** (Vinculación de Certificados)

## Objetivo
Construir la primera mitad del Detail View maestro de **`Programación`** (`programa_auditoria`) sobre **`renderDetailPageTemplate` (`src/views/detailTemplate.ts`)** cumpliendo estrictamente la cabecera icon-only, Guardar-primero / Cancelar-segundo arriba a la derecha, cero botones al pie, `#archiveGovernanceToast`, breadcrumbs en 1 línea `<= 24` chars, RBAC estricto y el formulario completo del **Paso 1** (vinculación **Individual / Nivel 1 / Nivel 2**, etiqueta, naturaleza y asignación inicial de certificados).

*(La Zona 3 de Paso 2: selector por certificado, gestor de fechas 1:N `auditoria_fecha`, pestañas hijas y `sitioAuditoriaView.ts` se implementan en `Step 3.2.2`).*

---

## Archivos a Modificar
- `src/views/programacionView.ts` (`resolveProgramDetailMode`, cabecera icon-only, stepper Paso 1 ↔ Paso 2, Zona 1 y Zona 2 de Paso 1)
- `src/views/auditoriasView.ts` (resolución de precedencia hoja-a-raíz en dominio `auditorias`)
- `src/main.ts` (máquina `'read' | 'add' | 'edit'`, listeners `#programaAuditDetailForm`, cascada Nivel 1 / Nivel 2 / Individual, acciones `[←]`, `[✏️]`, `[🕒]`, `[🗄️]`, toast `#archiveGovernanceToast`)

---

## Especificación Técnica Detallada

### 1. Máquina de Estados y Bloqueo RBAC
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
- `CLIENT`, `AUDITOR` y cuentas no aprobadas resuelven siempre a `'read'`.
- En `'read'` para `CLIENT` dentro de un programa `NIVEL_2_INTER_ORG`, solo se muestran certificados/auditorías de su(s) organización(es) aprobada(s).

### 2. Cabecera Única Icon-Only (`detailTemplate.ts`)
- **Izquierda:**
  - Botón volver `[←]` (`data-nav-back="true"`, `w-9 h-9`) vía `popToParentBreadcrumb`.
  - Ícono `📋` + `<h1>`: `'Nuevo Programa de Auditoría'` en `'add'`, o **`program.etiqueta`** + código `PROG-2026-001` + pill de vinculación (`Nivel 1 · Integrada`) + pill de estado global (`computeProgramPlanningStatus`).
- **Derecha en `'read'`:** `[✏️]` (`#startEditProgramBtn`, solo staff), `[🕒]` (`table_name = 'programa_auditoria'`), `[🗄️]` (`renderArchivarButtonHtml`, solo staff).
- **Derecha en `'add'` o `'edit'` (`customTopActionsHtml`):**
  - Se ocultan `[✏️]`, `[🕒]` y `[🗄️]`.
  - Únicamente dos botones icon-only `w-9 h-9` en este orden exacto:
    1. **Guardar (PRIMERO):** `<button type="submit" id="saveProgramFormBtn" form="programaAuditDetailForm" ...>` (`bg-emerald-600 text-white`).
    2. **Cancelar (SEGUNDO):** `<button type="button" id="cancelEditProgramBtn" ...>` (`bg-rose-50 text-rose-700`).
  - **Cero botones Guardar/Cancelar al final del formulario.**

### 3. Stepper y Zona 1 + Zona 2 — **Paso 1: Vinculación y Certificados**
1. **Indicador de Pasos (`Paso 1: Vinculación y Alcance` ↔ `Paso 2: Fechas, Sitios y Auditores`):**
   - En `'add'`: al guardar Paso 1 (`saveProgramaAuditoriaStep1`), crea el programa y sus auditorías iniciales y transiciona automáticamente al **Paso 2** con toast en `#archiveGovernanceToast`.
   - En `'read'` / `'edit'`: navegación libre entre Paso 1 (Zona 1 + Zona 2) y Paso 2 (Zona 3).
2. **Zona 1 — Naturaleza y Ciclo (`customParentZoneHtml`):**
   - **Nivel de Vinculación (`nivel_vinculacion`):** `Individual` | `Nivel 1 — Intra-Organización` | `Nivel 2 — Inter-Organización`.
   - **Naturaleza (`tipo_vinculacion`):** `'Individual'` bloqueado en modo individual; `Combinada | Integrada | Conjunta | Simultánea | Multientidad | Multisitio` en Nivel 1 / Nivel 2.
   - **Evolución de Ciclo Anterior (`id_ciclo_origen`, opcional):** enlace a programa previo (ej. ciclo `Combinada` anterior) con salto contextual `→` en `'read'`.
3. **Zona 2 — Atributos Maestros y Constructor de Certificados (`<form id="programaAuditDetailForm">`):**
   - **`etiqueta` (`*`):** nombre descriptivo (ej. `Planta Santa Cruz`).
   - **`codigo_programa`:** sugerido automático o editable.
   - **`notas`:** observaciones generales de la campaña.
   - **Selector / Lista de Certificados Participantes:**
     - `INDIVIDUAL`: 1 certificado (pre-seleccionado si proviene de *Certificados Sin Programar*).
     - `NIVEL_1_INTRA_ORG`: selector de Organización + selección múltiple de `2..N` certificados de esa misma organización.
     - `NIVEL_2_INTER_ORG`: agregador multi-organización (`Organización → Certificado`).
     - Por cada certificado participante: `codigo_auditoria`, `id_tipo_auditoria` (`Etapa 1`, `Seguimiento 1`, `Renovación`, etc.), `id_metodologia` (`Presencial`, `Remota`, `Mixta`) y `estado_ciclo`.
     - Captura rápida opcional en `'add'` de **Fecha Inicial (#1)** (`PREPROGRAMADA_MES` o `REAL`) para poblar `auditoria_fecha` inicial al guardar.
   - Errores en único banner `bg-rose-50` dentro de Zona 2; éxitos con `showFloatingToast(..., 'success', 4500)` en `#archiveGovernanceToast`.

---

## Criterios de Verificación de Step 3.2.1
1. Cabecera cumple exactamente Guardar-primero / Cancelar-segundo arriba a la derecha, cero botones al pie y breadcrumbs 1 línea `<= 24` chars.
2. Paso 1 permite crear programas `Individual`, `Nivel 1 Intra-Org` (validando homogeneidad de organización) y `Nivel 2 Inter-Org` (múltiples organizaciones), con toast de confirmación y transición a Paso 2.
3. `AUDITOR` y `CLIENT` solo ven modo `'read'` y `CLIENT` en Nivel 2 no ve certificados de otras organizaciones.
