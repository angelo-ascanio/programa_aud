# Paso 3.1: Arquitectura del Pipeline y Dominio Puro de `Relación` (Paso 1 de Auditoría)

## Objetivo del Paso
Reemplazar `'vinculo'` dentro del **Bloque 1 `Auditoría`** por la nueva sección **`'Relación'`** (`#/auditorias/relacion`), ubicándola como **Paso 1 del flujo ANTES de `Designación`** (`Relación` → `Designación {Tipo, Fecha, Sitio, Temporal}` → `Tiempo` → `Auditor` → `Proceso` → `Turno` → `Resultado` → `Revisión` + `Resumen`), e implementar su dominio puro en `src/lib/relacionDomain.ts`.

---

## Archivos Afectados
- `src/lib/healthCheck.ts` (`AUDITORIAS_NAV_ITEMS`, `AUDIT_CARD_PIPELINE_STEPS`)
- `src/lib/accessControl.ts` (`VALID_DOMAIN_SUBVIEWS`, `normalizeDomainSubview`, alias de compatibilidad `#/auditorias/vinculo` → `relacion` o redirección controlada)
- `src/lib/breadcrumb.ts` (etiquetas y `subview` para `'relacion'`)
- `src/lib/pipelineEngine.ts` (`PipelineStageOneWord`, `PIPELINE_STAGE_ORDER`, `getPipelineStageBadgeMeta`, `resolveCurrentPipelineStage`)
- `src/lib/resumenDomain.ts` (alineación de etapa Paso 1 `Relación` en la matriz de completitud/resumen)
- `src/views/auditCardBreadcrumb.ts` (stepper bar de tarjeta de auditoría con Paso 1 `Relación`)
- `src/lib/relacionDomain.ts` *(nuevo)*
- `src/lib/relacionDomain.test.ts` *(nuevo)*
- `src/lib/pipelineEngine.test.ts` *(actualizar expectativas de `Vínculo` → `Relación`)*

---

## Cambios Técnicos Detallados

### 1. Reordenamiento del Pipeline de Auditoría
- **`src/lib/healthCheck.ts`:**
  - En `AUDITORIAS_NAV_ITEMS`, reemplazar `{ id: 'vinculo', ... }` por `{ id: 'relacion', label: 'Relación', icon: 'link', subroute: '#/auditorias/relacion' }` inmediatamente antes de `designacion` (`Tipo`, `Fecha`, `Sitio`, `Temporal`).
  - Actualizar `AUDIT_CARD_PIPELINE_STEPS`:
    - Paso 1: `Relación` (`id: 'relacion'`)
    - Paso 2: `Designación` (`id: 'designacion/tipo'`, abarcando `{Tipo, Fecha, Sitio, Temporal}`)
    - Paso 3..8: `Tiempo`, `Auditor`, `Proceso`, `Turno`, `Resultado`, `Revisión` (+ enlace contextual `Resumen`).
- **`src/lib/accessControl.ts`:**
  - Reemplazar `'vinculo'` por `'relacion'` en `VALID_DOMAIN_SUBVIEWS.auditorias`.
  - Si `normalizeDomainSubview('auditorias', 'vinculo')` recibe un hash antiguo `#/auditorias/vinculo`, mapear de forma segura a `'relacion'` (para `AUDITOR` sigue aplicando RBAC por auditorías asignadas; en Bloque 2 `Vínculo` vive en `certificacion/vinculo`).
- **`src/lib/pipelineEngine.ts`:**
  - Actualizar `PipelineStageOneWord` reemplazando `'Vínculo'` por `'Relación'`.
  - En `PIPELINE_STAGE_ORDER` y `getPipelineStageBadgeMeta`: Paso 1 `'Relación'` apunta a `targetSubview: 'relacion'`.
  - En `resolveCurrentPipelineStage`: si la auditoría/campaña aún no tiene relación/naturaleza confirmada ni tipo designado, retornar `'Relación'` (o evaluar completitud de relación → tipo → fecha → sitio).

### 2. Dominio Puro `src/lib/relacionDomain.ts`
Exportar tipos, constantes y funciones puras (strict TypeScript, cero `: any`):

1. **Estado (`RelacionViewState` y `DEFAULT_RELACION_VIEW_STATE`):**
   - `selectedOrgId: string | null`
   - `selectedConglomeradoId: string | null`
   - `selectedCertId: string | null`
   - `selectedAuditId: string | null`
   - `pickerTargetGroupKey: string | null` *(clave de la Organización o Conglomerado cuyo Pop-up Selector está abierto)*
   - `query: string`, `viewMode: UniversalViewMode`, `sortColumn`, `sortDirection`, `isSidebarOpen`, `facetSelections`
   - `savingAuditId: string | null`, `editErrorMessage: string | null`

2. **Vista Multi centrada en Organizaciones / Conglomerados (`buildRelacionMultiRows`):**
   - Agrupar las auditorías y certificados activos (filtrados por RBAC: `ADMIN`/`WORKER` todo, `AUDITOR` solo sus auditorías asignadas, `CLIENT` aislado Nivel 2 por `authorizedClientOrgIds`) alrededor de **Organizaciones y/o Conglomerados**.
   - Cada fila/tarjeta Multi expone:
     - Nombre corto (`resolveShortOrganizacionName` / `resolveShortConglomeradoName`)
     - Cajas `Vínculo` asociadas (solo si el rol puede ver contexto estructural o etiqueta derivada de campaña sin filtrar terceros)
     - Lista compacta de certificados y auditorías con su **codename compacto** (`formatAuditCodename`, ej. `2026-11 Seg.1`) y su naturaleza actual (`Combinada`, `Integrada`, `Individual`, etc.).
   - **Facetas laterales adaptadas a Relación y Ciclo:**
     - `Conglomerado` (nombre corto)
     - `Relación / Naturaleza` (`Individual`, `Combinada`, `Integrada`, `Conjunta`, `Simultánea`, `Multientidad`, `Mixta`)
     - `Nivel de Vinculación` (`INDIVIDUAL`, `NIVEL_1_INTRA_ORG`, `NIVEL_2_INTER_ORG`)
     - `Estado de Ciclo` (`En Programación`, `Programada`, `En Ejecución`, `Cerrada`, etc.)
     - `Base Vínculo` (`Con caja Bloque 2` / `Personalizada o Libre`)

3. **Pop-up Selector al hacer clic en Multi View (`buildRelacionPickerModel`):**
   - Dado un registro de Organización/Conglomerado seleccionado en Multi View, construye el modelo del modal selector agrupado por certificado, listando sus auditorías activas/históricas ordenadas de más reciente a más antigua con `formatAuditCodename` + estado de ciclo + naturaleza actual, permitiendo entrar directamente al Detail View de ese certificado/auditoría.

4. **Vista Detalle (`buildRelacionDetailModel`):**
   - Toma el contexto seleccionado (`selectedCertId`, `selectedAuditId`, campaña/programa y caja `Vínculo` base en Bloque 2 si el certificado pertenece a una).
   - Para cada auditoría del lote/campaña o certificado seleccionado:
     - Calcula **`baseVinculoNature`**: naturaleza predeterminada u overridden proveniente de la caja de Bloque 2 `Vínculo` (`resolveCertEffectiveNatureInBox`), o `'Individual'` si el certificado está `LIBRE`.
     - Calcula **`effectiveAuditNature`**: `audit.tipo_vinculacion ?? program.tipo_vinculacion ?? baseVinculoNature`.
     - Calcula **`matchesVinculoBase`**: booleano limpio que indica si la auditoría usa la base de Bloque 2 o fue ajustada específicamente para ese ciclo en `Relación`.
     - Exporta validación pura **`validateAuditRelacionUpdate({ auditId, tipoVinculacion, audits, profile })`** para confirmar/modificar la naturaleza específica de la auditoría o del lote sin tocar ni mutar las cajas estructurales de Bloque 2 `Vínculo`.

### 3. Pruebas Unitarias
- **`src/lib/relacionDomain.test.ts`:**
  - Agrupación Multi View por Organización/Conglomerado y filtros por naturaleza/ciclo.
  - Generación del Picker Pop-up ordenado con codenames compactos (`YYYY-MM ShortTipo`).
  - Cálculo de `baseVinculoNature` desde Bloque 2 vs `effectiveAuditNature` específico de Bloque 1 y verificación de que cambiar la relación de la auditoría **no** altera `vinculo`/`vinculo_certificado`.
  - RBAC para los 4 roles (`ADMIN`, `WORKER`, `AUDITOR`, `CLIENT`).
- Actualizar **`src/lib/pipelineEngine.test.ts`** para el nuevo Paso 1 `'Relación'`.

---

## Criterios de Aceptación y Verificación
- `npm test -- src/lib/relacionDomain.test.ts src/lib/pipelineEngine.test.ts` pasa al 100%.
- `npx tsc --noEmit` sin errores y cero `: any`.
- Cero UUIDs en textos o errores de `relacionDomain.ts`.
