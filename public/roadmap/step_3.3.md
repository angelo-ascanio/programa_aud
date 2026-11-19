# Step 3.3: `Designación → Tipo` — Vista UI (`designacionTipoView.ts`), Filtro Anti-Futuro y Timeline de Reprogramaciones

## 1. Identificador, Nombre y Dependencias
* **Step ID:** `3.3`
* **Nombre Corto (UI):** `Tipo` (bajo `Designación`)
* **Bloque / Sub-sección:** Bloque 1 — `Auditoría` → `Designación` → `Tipo`
* **Dependencias:** `step_3.1.md`, `step_3.2.md`, `step_2.3.md`

---

## 2. Alcance Exacto y Reglas de Negocio
1. **Cola Multi View Protegida contra Errores de Futuro (`PROXIMAS` por defecto):**
   * Al entrar a `#/auditorias/designacion/tipo`, el selector segmentado de horizonte temporal arranca activo en **`Próximas a ejecutar (N)`** (`preset = 'PROXIMAS'`), con botones para cambiar a **`Preprogramadas Mes (N)`**, **`Futuro +1/+3 años (N)`** y **`Todas (N)`**.
   * Orden default fijo: `urgency.rank ASC` + `effectiveStartIso ASC`.
2. **Creación de Nuevo Ciclo / Campaña desde `Vínculo` (`'add'`):**
   * Selector de `Vínculo` configurado (`INDIVIDUAL` o `VINCULADO` — **nunca muestra certificados `LIBRE`**; si existen certificados `LIBRE`, muestra enlace rápido *"Hay N certificados Libres sin vínculo → Ir a Vínculo"*).
   * Toggle limpio de fecha inicial: `(o) Preprogramación Mes + Año` (`PREPROGRAMADA_MES`) vs `(o) Fecha Exacta` (`PROGRAMADA_EXACTA`).
   * **Matriz de Tipo de Auditoría por Certificado:** Lista cada certificado integrante del vínculo con su propio `<select>` de `tipo_auditoria` (ej.: Cert ISO 9001 = `Renovación`, Cert ISO 14001 = `Seguimiento 2` en auditoría combinada/mixta).
3. **Detail View con Historial de Reprogramaciones 1:N (`'read' | 'edit'`):**
   * Zone 1: Chips navegables a `Conglomerado` y `Vínculo` padre, más **Pipeline Stepper Bar** (resaltando `Tipo` activo y enlace paralelo a `Paso 4: Sitio →`).
   * Banner Preventivo Automático si `row.urgency.isFutureTrapRisk === true`: *"⚠️ Ciclo Futuro (Año YYYY): Confirme que no corresponde trabajar el ciclo vigente."*
   * Tab 1 `fechas` (*Programación y Reprogramaciones 1:N*): Timeline cronológico mostrando `Programación #1`, `Reprogramación #2`, ..., `Vigente` + formulario inline para **Reprogramar** (agregando `numero_secuencia + 1` con motivo en `observacion`, nunca sobrescribiendo el historial).
   * Tab 2 `certificados` (*Tipos por Certificado*): Edición de `id_tipo_auditoria` por certificado + botón directo **"Configurar Sitios (Paso 4) →"** y **"Ir a Programa de Cert. (Paso 8) →"**.

---

## 3. Cambios Exactos en Base de Datos
Ninguno adicional (usa `programa_auditoria`, `auditoria` y `auditoria_fecha`).

---

## 4. Lógica Pura Consumida
* `buildCampaignStep3Rows`, `matchesTipoQueuePreset`, `validateStep3NewCycleDraft`, `buildNextReprogramDateSequence` desde `src/lib/designacionTipoDomain.ts`.

---

## 5. Orquestación UI y Estado (`src/views/designacionTipoView.ts`, `auditoriasView.ts`, `src/main.ts`)

### 5.1 Columnas `table-fixed` + `<colgroup>` (`tableId: 'designacion-tipo-main'`)

| `col.id` | `header` | `defaultWidthPct` | `minWidthPx` | Contenido Celda |
| :--- | :--- | :---: | :---: | :--- |
| `urgencia` | `Ventana` | `15%` | `115` | Badge urgencia (`Vencida`, `Próxima 14d`, `Año +2`) |
| `campania` | `Campaña / Vínculo` | `28%` | `180` | Etiqueta campaña + código + naturaleza vínculo |
| `fecha_vigente` | `Fecha Programada` | `21%` | `150` | Mes/Año o Rango exacto + badge `Reprog. #N` |
| `tipos_cert` | `Certificados & Tipos` | `24%` | `175` | Conteo certs + resumen `ISO 9001: Seg. 1 · ISO 14001: Seg. 1` |
| `estado_paso` | `Designación` | `12%` | `105` | `Tipo ✓ · Sitio ✓/○` |
| **Total** | | **`100%`** | | **0 botones dentro de `<td>`** |

### 5.2 Estado en `src/main.ts`
```typescript
export interface DesignacionTipoViewState {
  queuePreset: TipoQueuePreset;
  query: string;
  viewMode: UniversalViewMode;
  isSidebarOpen: boolean;
  sortColumn: 'urgencia' | 'campania' | 'fecha_vigente' | null;
  sortDirection: SortDirection;
  facetSelections: MultiViewSelectionMap;
  selectedProgramId: string | null;
  activeChildTab: 'fechas' | 'certificados';
  isCreating: boolean;
  isEditingAttributes: boolean;
  newCycleDraft?: Step3NewCycleDraft;
  reprogramDraft?: ReprogramDateDraft;
  isReprogramming: boolean;
  editErrorMessage: string | null;
}
```
* Handlers en `src/main.ts`:
  * `createStep3CampaignCycle`: inserta `programa_auditoria` (`id_vinculo`, `id_grupo_empresarial`, `tiene_sitio_temporal` heredado), luego 1 fila `auditoria` por certificado del vínculo (heredando `tiene_sitio_temporal`) y 1 fila `auditoria_fecha` (`numero_secuencia = 1`, `tag = 'Programación'`, `PREPROGRAMADA_MES` o `PROGRAMADA_EXACTA`).
  * `appendReprogramacionToCampaign`: para todas las auditorías de la campaña (o una específica), inserta una nueva fila `auditoria_fecha` con `numero_secuencia + 1`, `tag = 'Reprogramación'` y `observacion`.

### 5.3 Cumplimiento Zero-UUID
* Todos los `<select>` (`Vínculo`, `Tipo de Auditoría`) usan etiquetas humanas; ningún mensaje ni badge imprime UUIDs.

---

## 6. Matriz RBAC del Paso 3.3

| Rol | Acceso Vista `Tipo` | Crear Ciclo / Reprogramar | Archivar |
| :--- | :--- | :--- | :--- |
| **`ADMIN`** | Completo | Sí | Sí + Restaurar |
| **`WORKER`** | Completo | Sí | Sí |
| **`AUDITOR`** | Solo lectura de asignadas | No | No |
| **`CLIENT`** | Solo lectura de sus orgs | No | No |

---

## 7. Pruebas Automatizadas
* Test de render (`designacionTipoView.test.ts` o dentro de `designacionTipoDomain.test.ts`):
  * Verifica que `queuePreset = 'PROXIMAS'` por defecto muestra la campaña cercana y oculta la campaña `+2 años`.
  * Verifica `<colgroup>` = `100%`, cero `<button` en `<tbody>`, y presencia de banner de advertencia cuando se abre una campaña futura.

---

## 8. Criterios de Aceptación (Done Criteria)
- [ ] Subvista `#/auditorias/designacion/tipo` operativa bajo el menú `Designación`.
- [ ] Reprogramación ilimitada 1:N preserva secuencia `#1, #2, ...` en `auditoria_fecha`.
- [ ] Selector de Tipo de Auditoría configurable por cada certificado del grupo vinculado.
- [ ] Filtro por defecto `"Próximas a ejecutar"` protege contra errores de ciclos `+1/+3` años.
