# Step 4.1: Árbol `Certificado` — `requisitos_no_aplicables_certificado` y `turno`

## 1. Objetivo
1. Crear la **Detail View completa (`'read' | 'add' | 'edit'`)** para **`requisitos_no_aplicables_certificado`** (`noAplicableView.ts`), reemplazando el comportamiento actual donde la pestaña `no_aplicables` de `certificadoView.ts` salta a un modal de Norma sin permitir declarar o editar exclusiones ISO 4.3 por certificado.
2. Migrar **`turnoView.ts`** (`turno`) a paridad canónica completa (`'read' | 'add' | 'edit'`, cabecera Guardar-primero / Cancelar-segundo, cero botones al pie, toast flotante y tabla limpia en pestaña `sitios`).

---

## 2. Brechas Detectadas en los Archivos Actuales
1. **`requisitos_no_aplicables_certificado` (`certificadoView.ts`, `src/main.ts` líneas 7980–8081):**
   - La pestaña `cert-tab-no_aplicables` existe en `certificadoView.ts` (líneas 1667–1745) con `renderListViewTable` limpio, pero:
     - **No hay botón `+ Declarar Exclusión`** en la cabecera de la pestaña.
     - Al hacer clic en una fila (`data-action="select-no-aplicable"`), `main.ts` navega a `normaView` abriendo `#inspectClauseBackdrop` en lugar de abrir una Detail View propia de la exclusión donde pueda leerse/editarse/archivarse la `justificacion` bajo cláusula ISO 4.3.
   - **Esquema SQL (`public/supabase/queries/01_creacion.sql`):**
     - `public.requisitos_no_aplicables_certificado`: `id UUID PRIMARY KEY`, `id_certificado UUID NOT NULL`, `id_requisito UUID NOT NULL`, `justificacion TEXT NOT NULL DEFAULT ''`, `deleted_at`, `deleted_by`.
     - Está incluida en `v_child_tables` de `archive_record` (`04_rls.sql`).
2. **`src/views/turnoView.ts` (532 líneas) & `src/lib/turnoDomain.ts` (392 líneas):**
   - Solo soporta `'read' | 'edit'` (sin modo `'add'`).
   - En `'edit'` usa el botón por defecto `[✕]` en cabecera y renderiza **botones al pie del formulario** (`Cancelar` y `💾 Guardar Cambios`).
   - Renderiza **banner verde inline `saveSuccessMessage`**.
   - La pestaña `sitios` en `turnoView.ts` usa un `<table>` HTML crudo con `overflow-x-auto` en lugar de `renderListViewTable` (`table-fixed`).
   - En `certificadoView.ts > turnos`, falta acción `+ Nuevo Turno` para abrir `turnoView` en `'add'` (y/o vincular turno al certificado/sitio).
   - **Esquema SQL:** `public.turno` tiene `id`, `hora_entrada TIME NOT NULL`, `hora_salida TIME NOT NULL`, `deleted_at`, `deleted_by`, `delete_reason`. *(Nota: `descripcion` y `empleados_activos` se derivan/preservan en estado de dominio si no existen como columnas directas en PostgreSQL).*

---

## 3. Archivos Objetivo
1. `src/lib/certificadoSubEntities.ts` o `src/lib/noAplicableDomain.ts` *(nuevo módulo puro para `requisitos_no_aplicables_certificado`)*
2. `src/views/noAplicableView.ts` *(nuevo)*
3. `src/lib/turnoDomain.ts`
4. `src/views/turnoView.ts`
5. `src/views/certificadoView.ts` (botón `+` en cabeceras de pestañas `no_aplicables` y `turnos`)
6. `src/views/certificacionView.ts`
7. `src/main.ts` (estado `noAplicableDomain`, filtros por norma del certificado, CRUD Supabase, breadcrumbs `'no_aplicable'` y `'turno'`)

---

## 4. Contratos de Dominio

### 4.1 `requisitos_no_aplicables_certificado`
```ts
export type NoAplicableDetailMode = 'read' | 'add' | 'edit';

export interface NoAplicableFormDraft {
  id_certificado: string;
  id_requisito: string;
  justificacion: string; // mínimo 15 caracteres (sustento técnico ISO 4.3)
}

export interface NoAplicableViewState {
  selectedNoAplicableId: string | null;
  originatingCertId: string | null;
  isCreating?: boolean;
  isEditingAttributes?: boolean;
  formDraft?: NoAplicableFormDraft;
  editErrorMessage?: string | null;
  archiveConfirmOpen?: boolean;
  archiveErrorMessage?: string | null;
}
```
- **Filtro en vivo por Norma del Certificado (`filterRequisitosForCertificado`):**
  - Dado `draft.id_certificado`, resuelve `cert.id_norma` y filtra `requirementsCatalog` exclusivamente a las cláusulas activas de esa norma (en modo `'add'`, excluye además los `id_requisito` ya marcados como no aplicables en ese certificado para evitar duplicados).
  - Al cambiar `id_certificado` en Zona 1, resetea `id_requisito` si la cláusula seleccionada no pertenece a la nueva norma.

### 4.2 `turno` (`src/lib/turnoDomain.ts`)
- Reemplazar/unificar `TurnoEditDraft` → `TurnoFormDraft`, añadir `TurnoDetailMode = 'read' | 'add' | 'edit'`, `resolveTurnoDetailMode(state, isStaff, selectedTurno)`.
- Eliminar `saveSuccessMessage` de `TurnoViewState`.
- Añadir `isCreating?: boolean` + `createEmptyTurnoFormDraft()` + `validateTurnoFormDraft(draft)` (valida formato `HH:MM`, hora entrada ≠ hora salida).

---

## 5. Diseño de Vistas

### 5.1 Nueva Vista `src/views/noAplicableView.ts`
- **Cabecera:** `renderDetailFormTopActions` (`#saveNoAplicableBtn` primero, `#cancelNoAplicableBtn` segundo); `isCreateMode: mode === 'add'`.
- **Zona 1 (`customParentZoneHtml`):**
  - `'read'`:
    - Chip `Organización` (`navAction` → `org`).
    - Chip `Certificado` (`navAction` → `cert`, tab `no_aplicables`).
    - Chip `Norma` (`navAction` → `norma`).
    - Chip `Cláusula / Requisito` (`navAction` → `requisito` de Step 2.4).
  - `'add' | 'edit'`:
    - `<select form="noAplicableDetailForm" id="naSelectCertificado">` (preseleccionado si viene desde Certificado, actualiza norma y filtra requisitos en vivo).
    - `<select form="noAplicableDetailForm" id="naSelectRequisito">` (solo requisitos pertenecientes a la Norma del Certificado seleccionado).
- **Zona 2 (`#noAplicableDetailForm`):**
  - `justificacion` (`<textarea rows="4">`, obligatorio `*`, ayuda ISO/IEC 17021-1 Cláusula 4.3).
  - En `'read'`: resumen de la cláusula (`codigo`, `titulo`, `justificacion` legible).
  - Cero botones al pie; errores inline `role="alert"`; toast flotante `showFloatingToast`.
- **Zona 3:** `''` (entidad hoja).

### 5.2 Overhaul `src/views/turnoView.ts`
- **Cabecera:** `renderDetailFormTopActions` (`#saveTurnoFormBtn` primero, `#cancelEditTurnoBtn` segundo), `isCreateMode: mode === 'add'`.
- **Zona 1:** En `'read'`, chips hacia `Certificado` y `Sede` origen si existen; en `'add'`, selector opcional de `Sitio` inicial para crear el turno y su primer vínculo en `turnos_por_sitio` si nace desde un Sitio/Certificado.
- **Zona 2 (`#turnoDetailForm`):** `hora_entrada`, `hora_salida`, `descripcion` derivada/visual; sin botones al pie y sin banner verde `saveSuccessMessage`.
- **Zona 3 (oculta si `isCreateMode`):**
  - Pestaña `sitios`: reemplazar tabla HTML cruda por `renderListViewTable` (`tableId: 'turno-tab-sitios'`, `getRowAttrs` → `select-sitio-preview`).
  - Pestaña `auditorias`: `renderListViewTable` (`tableId: 'turno-tab-auditorias'`, enlace read-only).

### 5.3 Conexión desde `src/views/certificadoView.ts`
- En la barra superior de `cert-tab-no_aplicables`: mostrar botón `+ Declarar Exclusión` (`data-action="open-create-no-aplicable" data-cert-id="..."`) para Staff aprobado.
- En filas de `cert-tab-no_aplicables`: `data-action="select-no-aplicable"` pasa a abrir `noAplicableView` en `'read'` usando `data-no-aplicable-id`.
- En `cert-tab-turnos`: mostrar botón `+ Nuevo Turno` (`data-action="open-create-turno" data-cert-id="..."`) para Staff aprobado.

---

## 6. Verificación de Step 4.1
- Probar filtro dinámico `Certificado` → `Norma` → `Requisitos disponibles` al crear una exclusión ISO 4.3.
- Verificar archivo lógico vía `archive_record('requisitos_no_aplicables_certificado', id, reason)` y `archive_record('turno', id, reason)`.
- `npx tsx --test src/lib/turnoDomain.test.ts src/lib/*.test.ts && npm run lint && npm run build`.
