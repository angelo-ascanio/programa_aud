# Step 2.1 — Dominio Pure TypeScript de `Designación → Sitio`: Modelo Activo Único, Filtros (30–80+ Sitios), Ordenamiento y Sitios Compartidos

**Pilar:** 2 (`Auditoría > Designación > Sitio` Overhaul e Integración de Sitios Compartidos)  
**Dependencias:** Independiente del Pilar 1 (puede ejecutarse después de `step_1.3.md` o en paralelo tras `summary.md`)  
**Objetivo:** Evolucionar `src/lib/designacionSitioDomain.ts` para soportar:
1. Unificación transparente de sitios propios y sitios compartidos (`sitio_certificado_compartido`), incluyendo `numero_sitio === 0` (HQ obligatorio) cuando el HQ sea un sitio compartido en ese certificado, y `sharedFromCertLabel` / `personal_count`.
2. Construcción enfocada del modelo de auditoría activa (en lugar de expandir todos los hermanos simultáneamente), preservando el cálculo cross-sibling necesario para el filtro `LINK_SELECTED`.
3. Motor puro de filtrado de sitios (`ALL`, `SELECTED`, `UNSELECTED`, `LINK_SELECTED`, `NOT_AUDITED_LAST_N` con parámetro entero `N >= 0`, más `SHARED_ONLY` y `UNVISITED_CYCLE`).
4. Motor puro de ordenamiento de sitios (`SITE_NUMBER`, `SELECTED_FIRST`, `LEAST_RECENTLY_AUDITED`, `PERSONAL_DESC`, `NAME_ASC`).

---

## 1. Archivos a Modificar

- `src/lib/designacionSitioDomain.ts`
- `src/lib/designacionSitioDomain.test.ts`

---

## 2. Especificación Técnica Detallada

### 2.1 Tipos de Filtro y Ordenamiento en `src/lib/designacionSitioDomain.ts`
Definir de forma estricta (`0 any`):

```typescript
export type SitioDetailFilterMode =
  | 'ALL'
  | 'SELECTED'
  | 'UNSELECTED'
  | 'LINK_SELECTED'
  | 'NOT_AUDITED_LAST_N'
  | 'SHARED_ONLY'
  | 'UNVISITED_CYCLE';

export type SitioDetailSortMode =
  | 'SITE_NUMBER'
  | 'SELECTED_FIRST'
  | 'LEAST_RECENTLY_AUDITED'
  | 'PERSONAL_DESC'
  | 'NAME_ASC';

export interface SitioDetailQueryOptions {
  filterMode: SitioDetailFilterMode;
  notAuditedLastN: number; // entero >= 0, default 1
  sortMode: SitioDetailSortMode;
  searchQuery?: string; // búsqueda rápida opcional en catálogos grandes
}
```

### 2.2 Enriquecimiento de `SitioAssignmentItem` y Datos Históricos por Sitio
Extender `SitioAssignmentItem` con metadatos puros y ligeros (sin UUIDs en textos):
- `isSharedSite: boolean` (`Boolean(site.sharedFromCertId)`)
- `sharedFromCertLabel: string | null`
- `personalCount: number | null` (`typeof site.personal_count === 'number' ? site.personal_count : null`)
- `pastVisitCount: number`
- `lastAuditedIso: string | null`
- `isSelectedInLinkedSibling: boolean` (`true` si algún otro certificado hermano del mismo vínculo/`programa_auditoria` tiene este `site.id` en su `sitiosPlan` activo!)
- `linkedSiblingCertLabels: string[]` (ej. `['CERT-IND-02']` — etiqueta corta para tooltip/subtexto discreto cuando aplica `LINK_SELECTED`)
- `auditedInLastPriorIndices: Set<number>` o `priorAuditDistance: number | null` (índice `1` = última auditoría previa, `2` = penúltima auditoría previa, etc., o `null` si nunca fue incluido en auditorías previas).

### 2.3 Regla Exacta para `NOT_AUDITED_LAST_N` (con Entero `N >= 0`)
Implementar `computePriorAuditsExclusionSet(...)` y `filterAndSortSitioAssignments(...)`:
1. Obtener las auditorías del mismo certificado (`id_certificado === activeAudit.id_certificado`), activas (`!deleted_at`) y no canceladas (`estado_ciclo !== 'Cancelada'`), ordenadas cronológicamente usando `collectChronologicalCertAudits(activeAudit, allAudits)`.
2. Identificar el índice `currentIdx` de `activeAudit`.
3. Tomar **únicamente las auditorías estrictamente anteriores** a `activeAudit`:
   `const priorAudits = certAudits.slice(0, currentIdx);`
   - Nota crítica: las auditorías futuras (`idx > currentIdx`) y la auditoría actual (`idx === currentIdx`) **NUNCA** bloquean un sitio bajo `NOT_AUDITED_LAST_N`.
4. Normalizar `N = Math.max(0, Math.trunc(Number.isFinite(notAuditedLastN) ? notAuditedLastN : 1))`:
   - Si **`N === 0`**: el conjunto de sitios excluidos está vacío (`new Set()`), por lo tanto **todos los sitios quedan disponibles/visibles**.
   - Si **`N >= 1`**: tomar las últimas `N` auditorías previas:
     `const windowPrior = priorAudits.slice(-N);`
   - Un sitio `site.id` queda **fuera de alcance (excluido del resultado)** si aparece en `sitiosPlan` (activo, `!sp.deleted_at`) de **al menos una** de esas `windowPrior` auditorías.
   - Nota sobre `Sitio 0 (HQ)`: Aplicar la regla con total honestidad y consistencia (`N = 1` oculta los sitios auditados en la última auditoría previa, incluido `Sitio 0` si estuvo en ella, tal como indica `future_changes.txt`: *"the sites selected there are now out of bounds"*). En el resumen numérico de la UI se mostrará `"Mostrando X de Y"` y el conteo real de seleccionados (`selectedCount`) nunca se altera.

### 2.4 Semántica Exacta de Todos los Filtros
- `ALL`: Muestra todos los sitios candidatos del certificado (propios + compartidos).
- `SELECTED`: Muestra los sitios con `item.isSelected === true` en `activeAudit`.
- `UNSELECTED`: Muestra los sitios con `item.isSelected === false` en `activeAudit`.
- `LINK_SELECTED`: Muestra los sitios con `item.isSelectedInLinkedSibling === true` (sitios ya marcados en otra auditoría vinculada del mismo `programa_auditoria`).
  - *Caso edge:* Si la auditoría no tiene hermanos vinculados (`siblingsCount <= 1`), `LINK_SELECTED` puede mostrar lista vacía con estado vacío breve (`"Sin sitios seleccionados en certificados vinculados"`) o bien ocultar la opción del `<select>` en UI cuando `siblingsCount <= 1` (se recomienda ocultar o deshabilitar la opción en `<select>` si `siblingsCount <= 1`, y en dominio devolver 0 ítems limpiamente).
- `NOT_AUDITED_LAST_N`: Muestra solo los sitios NO incluidos en las últimas `N` auditorías previas (`N = 0` -> todos).
- `SHARED_ONLY`: Muestra únicamente sitios compartidos (`item.isSharedSite === true`).
- `UNVISITED_CYCLE`: Muestra sitios que no han tenido ninguna auditoría previa (`item.pastVisitCount === 0` y no seleccionados aún, o `pastVisitCount === 0`).

### 2.5 Semántica Exacta del Ordenamiento (`sortSitioAssignmentItems`)
- `SITE_NUMBER`: `numero_sitio ASC` (`Sitio 0` siempre primero, luego `1, 2, ...`, conservando el orden numérico operativo dentro del certificado receptor).
- `SELECTED_FIRST`: `isSelected === true` primero (`Sitio 0` arriba dentro de seleccionados), luego `numero_sitio ASC`.
- `LEAST_RECENTLY_AUDITED`: menor `pastVisitCount ASC`, luego `lastAuditedIso` más antiguo (`null` / nunca auditado primero), desempate por `numero_sitio ASC`.
- `PERSONAL_DESC`: mayor `personal_count DESC` primero (los que tengan `null` al final), desempate por `numero_sitio ASC`.
- `NAME_ASC`: orden alfabético español (`localeCompare('es', { sensitivity: 'base' })`), desempate por `numero_sitio ASC`.

### 2.6 Compatibilidad de Sitios Compartidos en `validateAuditSiteToggle`, `buildSiteCycleMatrixForAudit` y `buildCertificateSitioRows`
- Verificar que `validateAuditSiteToggle` evalúe `isPrincipalHqSite(targetSite)` usando el `targetSite` de `certificateSites` (cuyo `numero_sitio` ya refleja `sitio_certificado_compartido.numero_sitio` en el certificado receptor!) **con prioridad sobre** cualquier `numero_sitio` heredado de `existingPlan` si diferían.
- Verificar que `buildCertificateSitioRows` refleje correctamente en Multi View el conteo de sitios propios + compartidos (`totalAvailableSites` y `selectedSitesCount`) sin distinguirlos ni omitir los compartidos.

---

## 3. Checklist de Implementación

1. [ ] Definir `SitioDetailFilterMode`, `SitioDetailSortMode`, `SitioDetailQueryOptions`, `SITIO_DETAIL_FILTER_OPTIONS` y `SITIO_DETAIL_SORT_OPTIONS` en `src/lib/designacionSitioDomain.ts`.
2. [ ] Extender `SitioAssignmentItem` con `isSharedSite`, `sharedFromCertLabel`, `personalCount`, `pastVisitCount`, `lastAuditedIso`, `isSelectedInLinkedSibling` y `linkedSiblingCertLabels`.
3. [ ] Actualizar `buildSitioLinkedAuditModels` (o añadir `buildActiveSitioAuditModel`) para calcular `isSelectedInLinkedSibling` cruzando los hermanos del mismo `programa_auditoria` y retornar el modelo listo para el certificado activo.
4. [ ] Implementar `filterAndSortSitioAssignments(items, activeAudit, allAudits, options)` con la lógica exacta de `NOT_AUDITED_LAST_N` (`N = 0` vs `N >= 1`), `LINK_SELECTED`, `SHARED_ONLY`, `UNVISITED_CYCLE`, búsqueda textual rápida y los 5 modos de ordenamiento.
5. [ ] Asegurar prioridad de `targetSite.numero_sitio` en `validateAuditSiteToggle` para sitios compartidos cuyo número en destino difiere del certificado origen.
6. [ ] Agregar pruebas exhaustivas en `src/lib/designacionSitioDomain.test.ts` (cubriendo 80+ sitios simulados, sitios compartidos como sede secundaria y como Sitio 0 HQ, `NOT_AUDITED_LAST_N` con `N=0, 1, 2, 5` excluyendo futuras/canceladas, `LINK_SELECTED` y todos los ordenamientos).

---

## 4. Criterios de Verificación y Aceptación

- **Tests unitarios:**
  ```bash
  npx tsx --test src/lib/designacionSitioDomain.test.ts
  ```
- **Aserciones obligatorias:**
  - Un sitio compartido aparece en `siteItems` con `isSharedSite: true`, `canToggle: true` (si no es HQ ni último sitio), y `numero_sitio` correspondiente al certificado receptor.
  - Con auditorías pasadas `[A1, A2]` y futura `[A4]` respecto a actual `[A3]`: `NOT_AUDITED_LAST_N` con `N=0` devuelve todos; `N=1` excluye solo sitios en `A2`; `N=2` excluye sitios en `A1 ∪ A2`; `A4` nunca afecta el filtro.
  - `LINK_SELECTED` detecta exactamente los `id_sitio` marcados en auditorías hermanas del vínculo sin incluir sitios solo seleccionados en la auditoría actual si no están en hermanas.
  - Rendimiento de `filterAndSortSitioAssignments` con 100 sitios < `5ms`.
