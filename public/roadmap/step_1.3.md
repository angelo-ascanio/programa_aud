# Step 1.3: `Conglomerado` — Vistas UI (`conglomeradoView.ts`, `organizacionView.ts`, `certificacionView.ts`), Menú y `src/main.ts`

## 1. Identificador, Nombre y Dependencias
* **Step ID:** `1.3`
* **Nombre Corto (UI):** `Conglomerado`
* **Bloque / Sub-sección:** Bloque 2 — `Certificación` → `Conglomerado` (1ª sub-sección antes de `Organización`)
* **Dependencias:** `step_1.1.md`, `step_1.2.md`

---

## 2. Alcance Exacto y Reglas de Negocio
1. **Orden en `Certificación`:** En `src/lib/healthCheck.ts` (`CERTIFICACION_NAV_ITEMS`), insertar `{ id: 'conglomerados', label: 'Conglomerado', symbol: '🏛️' }` en **primera posición** antes de `organizations`, `certificates`, `auditors`.
2. **Multi View Clean List (`conglomerados-main`):**
   * Facets reactivos ($S_{-k}$):
     * `Estado Agrupación`: `Organizaciones solas / sin agrupar` (`SOLO`) vs `Conglomerados multi-empresa` (`MULTI_ORG`).
     * `Certificados`: `Con certificados` (`> 0`) vs `Sin certificados` (`0`).
   * **Cero botones dentro de `<tbody>` (`<td>`)** — clic en toda la fila (`data-action="select-conglomerado"`) o tarjeta abre el Detail View (`'read' | 'add' | 'edit'`).
3. **Detail View Unificado (`conglomeradoView.ts`):**
   * Tabs hijos:
     * `organizaciones` (*Organizaciones miembro*): tabla de organizaciones + acción `ADMIN`/`WORKER` para **"Mover otra organización sola a este conglomerado"** (con previsualización `"El conglomerado origen quedará vacío y se archivará automáticamente"`).
     * `vinculos` (*Vínculos de Auditoría asociados*): vista de solo lectura/navegación hacia `programa_auditoria` dentro del grupo.
4. **Integración en `organizacionView.ts`:**
   * Mostrar chip padre `Conglomerado` en Zone 1 navegable a `#/certificacion/conglomerados`.
   * En modo `'add'`: campo opcional *"Conglomerado destino (dejar en automático para crear grupo propio 1:1)"*.
   * En modo `'edit'`: selector de re-agrupación hacia otro conglomerado existente o botón *"Separar a grupo individual propio"*, activando limpieza automática de grupo origen si queda vacío.

---

## 3. Cambios Exactos en Base de Datos
Ninguno adicional en este paso (usa consultas Supabase `select('*')` sobre `public.grupo_empresarial` y `public.organizacion`).

---

## 4. Lógica Pura & Contratos UI (`src/lib/accessControl.ts`, `src/lib/breadcrumb.ts`, `src/lib/healthCheck.ts`)

### 4.1 `src/lib/healthCheck.ts` y `src/lib/accessControl.ts`
* `VALID_DOMAIN_SUBVIEWS.certificacion`: `['conglomerados', 'organizations', 'certificates', 'auditors']`.
* `normalizeDomainSubview('certificacion', raw)`: acepta `'conglomerados'` (alias `'conglomerate'`, `'grupos'`).
* `getVisibleDomainMenus(profile)`: `AUDITOR` sigue sin recibir el bloque `certificacion` (bloqueado tanto en menú como en `canAccessRoute`).

### 4.2 `src/lib/breadcrumb.ts`
* Ampliar `BreadcrumbEntityType` con `'conglomerado'`.
* `getSubviewLabel('certificacion', 'conglomerados')` → `'Conglomerado'`.

---

## 5. Orquestación UI y Estado (`src/views/conglomeradoView.ts`, `organizacionView.ts`, `certificacionView.ts`, `src/main.ts`)

### 5.1 Columnas `table-fixed` + `<colgroup>` en `conglomeradoView.ts` (`tableId: 'conglomerados-main'`)

| `col.id` | `header` | `defaultWidthPct` | `minWidthPx` | Contenido Celda |
| :--- | :--- | :---: | :---: | :--- |
| `conglomerado` | `Conglomerado` | `38%` | `200` | Nombre + Código grupo (o `"Auto 1:1"` si `es_individual_auto`) |
| `tipo_agrupacion` | `Composición` | `24%` | `150` | Badge `Sola (1 org)` vs `Multi-empresa (N orgs)` |
| `organizaciones` | `Empresas` | `24%` | `160` | Nombres truncados separados por `·` (si `CLIENT`, solo su org) |
| `certificados` | `Certificados` | `14%` | `100` | Conteo total `N certs` (`tabular-nums`, alineación derecha) |
| **Total** | | **`100%`** | | **0 botones dentro de `<td>`** |

### 5.2 Estado en `src/main.ts`
```typescript
export interface ConglomeradoViewState {
  query: string;
  viewMode: UniversalViewMode;
  isSidebarOpen: boolean;
  sortColumn: 'conglomerado' | 'tipo_agrupacion' | 'certificados' | null;
  sortDirection: SortDirection;
  facetSelections: MultiViewSelectionMap;
  selectedConglomeradoId: string | null;
  activeChildTab: 'organizaciones' | 'vinculos';
  isCreating: boolean;
  isEditingAttributes: boolean;
  formDraft?: ConglomeradoFormDraft;
  editErrorMessage: string | null;
  rebucketTargetOrgId: string;
  rebucketFeedback: string | null;
}
```
* Añadir `allConglomerados: ConglomeradoEntity[]` en `state.domainData` e hidratar vía `fetchAllPagedRows(supabase.from('grupo_empresarial').select('*'))`.
* En `src/views/certificacionView.ts`:
  * Incluir pestaña/subsección `'conglomerados'` antes de `'organizations'`.
  * Enrutar a `renderConglomeradoView(...)` cuando `activeSubSection === 'conglomerados'`.
* Handlers en `src/main.ts`:
  * `createConglomerado` / `updateConglomerado` con validación Zero-UUID y recarga del snapshot `organizacion` + `grupo_empresarial`.
  * `rebucketOrganizacion(orgId, targetGroupId)`: ejecuta `UPDATE public.organizacion SET id_grupo_empresarial = targetGroupId WHERE id = orgId` y re-hidrata `allConglomerados` + `allOrganizaciones` para reflejar el archivo automático del grupo origen vacío.
  * `mostrar-archivados` + `restaurar` para `ADMIN` en `grupo_empresarial`.

### 5.3 Cumplimiento Zero-UUID
* Nunca mostrar `grupo.id` ni `id_grupo_empresarial` en tarjetas, selects (`<option value="uuid">Nombre legible (N orgs)</option>`), breadcrumbs o mensajes de error.

---

## 6. Matriz RBAC del Paso 1.3

| Rol | Ve `Conglomerado` en Nav | Crear / Editar / Re-agrupar | Archivar / Restaurar |
| :--- | :--- | :--- | :--- |
| **`ADMIN`** | Sí (#1 en `Certificación`) | Sí | Archivar + Restaurar |
| **`WORKER`** | Sí (#1 en `Certificación`) | Sí | Archivar (sin restaurar) |
| **`AUDITOR`** | **NO** (Bloque `Certificación` oculto) | No | No |
| **`CLIENT`** | Sí (solo su conglomerado; `rebucket` oculto; otras orgs ocultas) | No | No |

---

## 7. Pruebas Automatizadas / E2E
* Test unitario en `src/lib/conglomeradoDomain.test.ts` verificando orden de menú (`Conglomerado` índice 0 antes de `Organización`) y normalización de ruta `#/certificacion/conglomerados`.
* Test de render (`node:test`) asegurando que `renderConglomeradoView` suma exactamente `100%` en `<colgroup>`, no contiene `<button` dentro de `<tbody>` y no expone UUIDs en texto visible.

---

## 8. Criterios de Aceptación (Done Criteria)
- [ ] `Conglomerado` aparece como 1ª sub-sección en el menú `Certificación` para `ADMIN`, `WORKER` y `CLIENT`, y permanece oculto para `AUDITOR`.
- [ ] Filtro `Organizaciones solas / sin agrupar` funciona en Multi View junto al toggle `[⊞ Tarjetas | ☰ Tabla]`.
- [ ] Mover una organización sola hacia otro conglomerado ejecuta la fusión en Supabase y desaparece el grupo origen vacío sin intervención manual.
- [ ] Cero botones en `<tbody>`, `<colgroup>` = `100%`, Zero-UUID y `tsc --noEmit` con `0` errores.
