# Step 3.2 — Detail Views Unificados en 3 Zonas (`'read' | 'add' | 'edit'`) para `Auditoría` y Sub-Entidades

## Objetivo
Migrar completamente el detalle de `Auditoría` (`programacionView.ts`) y sus sub-entidades navegables (`Sitio en Auditoría` / `Proceso en Sitio Auditado`) a la plantilla canónica **`renderDetailPageTemplate` (`src/views/detailTemplate.ts`)** de **3 Zonas** y modos **`'read' | 'add' | 'edit'`**, aplicando las reglas exactas de cabecera (Guardar primero / Cancelar segundo, sin botones al pie, toast flotante `#archiveGovernanceToast`, breadcrumbs en 1 línea ≤24 chars, RBAC estricto y Cero-UUID).

---

## Archivos a Modificar / Crear
- `src/views/programacionView.ts` (reestructuración de `renderAuditDetailView` a 3 Zonas `'read' | 'add' | 'edit'`)
- `src/views/sitioAuditoriaView.ts` (nuevo módulo declarativo opcional para inspeccionar/editar un `sitios_por_auditoria` específico como sub-entidad en 3 Zonas si el usuario navega a una sede desde el detalle)
- `src/views/auditoriasView.ts` (resolución de precedencia hoja-a-raíz en dominio `auditorias`)
- `src/main.ts` (gestión de modos `'read' | 'add' | 'edit'`, listeners `#auditoriaDetailForm`, cascada `certificado`, acciones `[←]`, `[✏️]`, `[🕒]`, `[🗄️]`, toast `#archiveGovernanceToast`)
- Pruebas (`src/lib/auditDetailViews.test.ts` + `src/lib/phase62UiIntegrity.test.ts`)

---

## Especificación Técnica Detallada

### 1. Máquina de Estados del Detail View de `Auditoría`
En espejo exacto con `resolveCertificadoDetailMode`:
```ts
export type AuditDetailMode = 'read' | 'add' | 'edit';

export function resolveAuditDetailMode(
  state: AuditPlanningViewState,
  isStaff: boolean,
  selectedAudit?: ProgramacionAuditEntity
): AuditDetailMode {
  if (!isStaff) return 'read';
  if (state.isCreating && !state.selectedAuditId) return 'add';
  if (selectedAudit && state.isEditingAttributes) return 'edit';
  return 'read';
}
```
- **Bloqueo RBAC:** `CLIENT`, `AUDITOR` y cuentas no aprobadas resuelven siempre a `'read'`; ningún control de mutación estructural de la programación se renderiza en el DOM para ellos.

### 2. Cabecera Única Icon-Only (`detailTemplate.ts`)
- **Izquierda:**
  - Botón volver `[←]` (`data-nav-back="true"`, `w-9 h-9`, icon-only) regresando vía `popToParentBreadcrumb`.
  - Ícono `📋` + `<h1>`: muestra `'Nueva Auditoría'` en `'add'`, o `audit.codigo_auditoria || 'Borrador de Auditoría'` + pill compacto del tag dinámico (`computeAuditPlanningStatus`) en `'read'`/`'edit'`.
- **Derecha en `'read'`:**
  - `[✏️]` `#startEditAuditBtn` (`w-9 h-9`, solo staff `ADMIN`/`WORKER`).
  - `[🕒]` `data-action="open-changelog"` (`table_name = 'auditoria'`).
  - `[🗄️]` `renderArchivarButtonHtml({ tableName: 'auditoria', iconOnly: true, ... })` (solo staff `ADMIN`/`WORKER`).
- **Derecha en `'add'` o `'edit'` (`customTopActionsHtml`):**
  - Se ocultan `[✏️]`, `[🕒]` y `[🗄️]`.
  - Se renderizan **únicamente dos botones icon-only `w-9 h-9` en este orden exacto:**
    1. **Guardar (PRIMERO):** `<button type="submit" id="saveAuditFormBtn" form="auditoriaDetailForm" ...>` (`bg-emerald-600 text-white`, tooltip `"Crear borrador de auditoría"` / `"Guardar cambios"`).
    2. **Cancelar (SEGUNDO):** `<button type="button" id="cancelEditAuditBtn" ...>` (`bg-rose-50 text-rose-700`, tooltip `"Cancelar creación"` / `"Cancelar edición"`).
  - **Cero botones Guardar/Cancelar al final del formulario.**

### 3. Zona 1 — Relaciones Superiores (`customParentZoneHtml`)
Grilla compacta `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5`:
1. **Certificado (`#auditParentCertificadoSelect`, `name="id_certificado"`, OBLIGATORIO `*`):**
   - Muestra `numero_certificado · organizacion_nombre (norma_codigo)`.
   - Al cambiar en `'add'`/`'edit'` (listener `change` en `main.ts`), actualiza `formDraft.id_certificado` y refresca en vivo la vista previa del panel **"Historial del Certificado"** (implementado en Step 4.1) y el catálogo de sitios/procesos disponibles del certificado.
2. **Tipo / Modalidad de Auditoría (`#auditParentTipoSelect`, `name="id_tipo_auditoria"`, opcional en borrador):**
   - Opción vacía explícita `"— Pendiente de definir (Borrador) —"`.
3. **Metodología de Auditoría (`#auditParentMetodologiaSelect`, `name="id_metodologia"`, opcional en borrador):**
   - Opción vacía explícita `"— Pendiente de definir (Borrador) —"`.
- **Comportamiento en `'read'`:** Los `<select>` llevan `disabled` y muestran el botón de salto contextual `→` (`data-parent-nav="true"`) hacia `Certificado`, `Tipo` o `Metodología` respetando permisos RBAC y previniendo ciclos en `breadcrumb.ts`.

### 4. Zona 2 — Atributos Directos (`<form id="auditoriaDetailForm">`)
Contiene exclusivamente los atributos mutables propios de `public.auditoria` + indicador en vivo del balance dual:
1. **Código de Auditoría (`#auditCodigoInput`):** ej. `AUD-2025-004` (opcional en borrador inicial, sugerible automáticamente por año/secuencia).
2. **Estado de Ciclo Persistido (`#auditEstadoCicloSelect`):** selector controlado de `AuditCycleStatus` (`Borrador`, `En Programación`, `Programada`, `En Ejecución`, `Auditada`, `Reprogramada`, `Cancelada`) + badge informativo del `AuditDynamicTag` calculado al lado para transparencia total.
3. **Fechas (`fecha_programacion`, `fecha_fin`, `fecha_reprogramacion`):**
   - `<input type="date">` opcionales en borrador; validación inline si `fecha_fin < fecha_programacion`.
   - `fecha_reprogramacion` visible/editable especialmente cuando `estado_ciclo === 'Reprogramada'` o ya tiene valor.
4. **Días-Auditor Planificados (`tiempo_auditoria` — Resumen Cubo 1 vs Cubo 2):**
   - Muestra total requerido en sitios (`Σ sitios_por_auditoria.tiempo_auditoria`) vs total asignado a auditores (`Σ equipo_auditor_sitio.tiempo_auditoria`), con indicador visual de cuadre (`Cuadrado ✓` / delta).
5. **Objetivo / Notas de Alcance (`#auditObjetivoInput`):** `<textarea rows="2" maxlength="1000">`.
- **Retroalimentación:**
  - Errores de validación → único banner inline `bg-rose-50` dentro de Zona 2.
  - Éxitos (`INSERT`, `UPDATE`, archivo lógico, guardado parcial de planificador) → `showFloatingToast(..., 'success', 4500)` en `#archiveGovernanceToast` (sin barras verdes inline que desplacen el layout).

### 5. Zona 3 — Pestañas Hijas en `'read' | 'edit'` (`renderDetailPageTemplate` Zona 3)
- En modo **`'add'`**, la Zona 3 de tablas dependientes se omite hasta crear el registro padre (aunque el panel colapsable **"Historial del Certificado"** en Step 4.1 ya orienta al planificador desde `'add'` al elegir certificado!).
- En modos **`'read'`** y **`'edit'`**, la Zona 3 presenta pestañas claras:
  1. **`planificacion` (`🌳 Planificador Visual`)**: pestaña principal por defecto en `Programación`, detallando el Constructor Tipo Árbol/Acordeón (`Sitios → Procesos → Turnos → Auditores + Días`) que se implementa íntegramente en **Step 4.1**.
  2. **`equipo_resumen` (`👥 Equipo y Carga Días`)**: tabla `table-fixed` consolidada por auditor con suma de días asignados a través de todos los sitios de esta auditoría, rol principal y estado de calificación normativa/IAF (`auditor_esta_calificado`). Clic en fila navega a `Auditor` (`pushBreadcrumb`).
  3. **`hallazgos` (`🔍 Hallazgos y Comentarios`)**: resumen en lectura de hallazgos (`hallazgo`) y bitácora de `comentarios_por_auditoria`, sin botones dentro de `<td>`.
- **Precedencia en `auditoriasView.ts`:**
  - Si se navega a un sitio de auditoría (`selectedSitioAuditoriaId` → `sitioAuditoriaView.ts`), se renderiza con breadcrumb propio (`Auditoría > AUD-2025-001 > Planta Valencia`) y retorno limpio con `[←]`.

---

## Criterios de Verificación de Step 3.2
1. `Auditoria` Detail View usa exactamente `renderDetailPageTemplate`, botones Guardar-primero / Cancelar-segundo arriba a la derecha y cero botones abajo.
2. Se puede crear un borrador mínimo de auditoría eligiendo únicamente `Certificado` (y opcionalmente código/tipo/fecha), guardarlo con toast en `#archiveGovernanceToast`, y continuar la asignación detallada sin errores.
3. Breadcrumbs de `Auditoría` y sus padres/hijos nunca exceden 1 línea ni 4 segmentos visibles (`collapseBreadcrumbForDisplay`), truncando a 24 chars y sin ciclos al saltar entre `Auditoría ↔ Certificado ↔ Auditor`.
4. `AUDITOR` y `CLIENT` solo ven modo `'read'` sin botones de edición ni archivo.
