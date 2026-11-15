# Step 2.4: Bloque `Extra` — `norma` y Entidad Hija `requisito` (Árbol LTREE)

## 1. Objetivo
Migrar **`norma`** a Multi View Clean List + Detail View `'read' | 'add' | 'edit'`, y convertir el catálogo jerárquico **`requisito`** (LTREE) en una sub-entidad completa con Detail View `'read' | 'add' | 'edit'` (reemplazando el modal de solo lectura `#inspectClauseBackdrop` y el modal `#newAccreditationBackdrop`).

---

## 2. Brechas Detectadas en los Archivos Actuales
1. **`src/views/normaView.ts` (888 líneas):**
   - Tabla principal incluye columna `acciones` (`Ver Detalle →`), carece de `tableId`, `defaultWidthPct`, `minWidthPx` y `getRowAttrs`.
   - Grid no convierte la tarjeta en contenedor clicable completo.
   - Sin `+ Nueva Norma` ni modo `'add' | 'edit'` para editar `esquema`, `codigo`, `titulo`, `estatus`, `fecha_publicacion`, `norma`.
   - Pestaña `requisitos`: al hacer clic en una cláusula se abre un modal `#inspectClauseBackdrop` de solo lectura y no existe creación ni edición de cláusulas ni gestión jerárquica de `id_requisito_padre` / `ruta_materializada`.
   - Pestaña `acreditacion`: botón `+` abre `#newAccreditationBackdrop` modal en lugar de navegar al flujo unificado de `acreditacionView` en modo `'add'`.
   - Verifica `isStaff` sin comprobar `status === 'APPROVED'`.
2. **Esquema SQL (`public/supabase/queries/01_creacion.sql`):**
   - `public.norma`: `esquema VARCHAR(50) NOT NULL`, `codigo VARCHAR(50) NOT NULL`, `titulo VARCHAR(255) NOT NULL`, `estatus VARCHAR(50) NOT NULL DEFAULT 'Vigente' CHECK (estatus IN ('Vigente', 'En Revisión', 'Obsoleta'))`, `fecha_publicacion DATE`, `norma VARCHAR(100) NOT NULL`. *(Trigger `trg_norma_sync_codigo_titulo` sincroniza si alguno queda vacío).*
   - `public.requisito`: `id_norma UUID NOT NULL REFERENCES norma(id) ON DELETE CASCADE`, `id_requisito_padre UUID REFERENCES requisito(id) ON DELETE RESTRICT`, `codigo VARCHAR(30) NOT NULL`, `ruta_materializada LTREE`. *(Nota: `titulo` y `descripcion` extendidos en `RequisitoLtree` de cliente se mantienen enriquecidos en `extraDomain.ts` y solo se envían columnas reales SQL al guardar, salvo que existan en el esquema).*

---

## 3. Archivos Objetivo
1. `src/lib/extraDomain.ts` (helpers puros de jerarquía LTREE y validadores de `norma` + `requisito`)
2. `src/views/normaView.ts`
3. `src/views/requisitoView.ts` *(nuevo)*
4. `src/views/extraView.ts`
5. `src/main.ts` (estado de edición/creación de `norma` y `requisito`, navegación desde `certificadoView > no_aplicables` y `procesoView > requisitos`, breadcrumb `'requisito'`)

---

## 4. Lógica Pura LTREE y Contratos (`src/lib/extraDomain.ts`)

```ts
export type NormaDetailMode = 'read' | 'add' | 'edit';
export type RequisitoDetailMode = 'read' | 'add' | 'edit';

export interface NormaFormDraft {
  esquema: string;            // max 50, requerido
  codigo: string;             // max 50, requerido (ej: "ISO 9001:2015")
  norma: string;              // max 100, requerido (normalizado si coincide con código)
  titulo: string;             // max 255, requerido
  estatus: 'Vigente' | 'En Revisión' | 'Obsoleta';
  fecha_publicacion: string;  // YYYY-MM-DD opcional (NULL si '')
}

export interface RequisitoFormDraft {
  id_norma: string;
  id_requisito_padre: string; // '' representa cláusula raíz (NULL en BD)
  codigo: string;             // max 30, formato ej: "4", "4.1", "8.5.1"
  ruta_materializada: string; // derivado automáticamente ej: "4.4_1.8_5_1"
}
```
- **Motor puro LTREE (`computeRequisitoLtreePath` & `filterValidParentRequisitos`):**
  - `sanitizeLtreeLabel(codigo)`: convierte `8.5.1` o `A.5.1` a etiqueta LTREE válida PostgreSQL (`[A-Za-z0-9_]+`, reemplazando `.` o `-` por `_`, ej. `8_5_1`).
  - `computeRequisitoLtreePath(codigo, parentReq?)`: si hay padre con `ruta_materializada`, concatena `${parentReq.ruta_materializada}.${sanitizeLtreeLabel(codigo)}`; si es raíz, devuelve `${sanitizeLtreeLabel(codigo)}`.
  - `filterValidParentRequisitos(allReqs, idNorma, excludeRequisitoId?)`: filtra exclusivamente requisitos activos de `id_norma` y excluye el propio requisito y sus descendientes (`ruta_materializada` descendente) para evitar ciclos en árbol.

---

## 5. Especificación de Vistas

### 5.1 `src/views/normaView.ts`
- **Multi View (`tableId: 'extra-normas-main'`):**
  - Columnas (`100%`): `codigo` (18%), `titulo` (34%), `esquema` (16%), `estatus` (12%), `clausulas_count` (10%), `acreditaciones_count` (10%). Eliminar columna `acciones`.
  - `getRowAttrs` en tabla + clic completo en tarjeta Grid (`data-action="select-norma"`).
  - CTA `+` (`open-create-norma`) para Staff aprobado.
- **Detail View (`'read' | 'add' | 'edit'`):**
  - Cabecera: `renderDetailFormTopActions` (`#saveNormaFormBtn` primero, `#cancelEditNormaBtn` segundo), `isCreateMode: mode === 'add'`.
  - Zona 2 (`#normaDetailForm`): `codigo`, `esquema`, `norma`, `estatus`, `fecha_publicacion`, `titulo`, sin botones al pie.
  - Zona 3 (solo `'read' | 'edit'`):
    - **Pestaña `requisitos`:** `renderListViewTable` (`tableId: 'norma-tab-requisitos'`, suma 100%) ordenado jerárquicamente por `ruta_materializada`, fila clicable (`data-action="select-requisito"` → navega a `requisitoView` `'read'`), y botón `+ Nuevo Requisito` en cabecera de pestaña → navega a `requisitoView` `'add'` con `id_norma` preseleccionado.
    - **Pestaña `acreditacion`:** `renderListViewTable` (`tableId: 'norma-tab-acreditaciones'`), fila clicable → `acreditacionView` `'read'`; botón `+` en cabecera de pestaña navega a `acreditacionView` `'add'` con `id_norma` preseleccionado (eliminar modal `#newAccreditationBackdrop`).
    - **Pestaña `certificados`:** `renderListViewTable` (`tableId: 'norma-tab-certificados'`).

### 5.2 Nueva Vista `src/views/requisitoView.ts`
- **Detail View (`'read' | 'add' | 'edit'`):**
  - Cabecera: `renderDetailFormTopActions` (`#saveRequisitoFormBtn` primero, `#cancelEditRequisitoBtn` segundo).
  - **Zona 1 (`customParentZoneHtml`):**
    - `'read'`: chip padre **`Norma`** (`navAction` → `norma`) y, si `id_requisito_padre` existe, chip **`Cláusula Padre`** (`navAction` → `requisito` padre).
    - `'add' | 'edit'`: 2 tarjetas `<select form="requisitoDetailForm">`:
      1. `id_norma` (obligatorio `*`, cambiarla recalcula y limpia en vivo `id_requisito_padre`).
      2. `id_requisito_padre` (opcional — `"Ninguno (Cláusula raíz)"`, filtrado en vivo por `filterValidParentRequisitos` al cambiar `id_norma`).
  - **Zona 2 (`#requisitoDetailForm`):**
    - `codigo` (requerido `*`, `maxlength="30"`), previsualización reactiva de `ruta_materializada` (solo lectura calculada, tipografía `font-mono`), y visualización de `titulo` / `descripcion` si existen en catálogo enriquecido.
  - **Zona 3 (oculta si `isCreateMode`):**
    - Pestaña `subrequisitos` (`renderListViewTable` de cláusulas hijas directas donde `id_requisito_padre === req.id`, clicables).
    - Pestaña `procesos` (`requisitos_por_proceso`, read-only clicable hacia `proceso`).

---

## 6. Nota de Integración con `select-no-aplicable` (`src/main.ts`)
- Mantener soporte temporal de navegación desde `certificado` → `no_aplicables` hasta completar **Step 4.1**, donde `select-no-aplicable` pasará a abrir `noAplicableView` (y desde allí el chip `Requisito` navegará a `requisitoView`).

---

## 7. Verificación de Step 2.4
- Pruebas unitarias para `computeRequisitoLtreePath` y prevención de ciclos en `filterValidParentRequisitos`.
- Verificar eliminación de `#inspectClauseBackdrop` y `#newAccreditationBackdrop`.
- `npx tsx --test src/lib/*.test.ts && npm run lint && npm run build`.
