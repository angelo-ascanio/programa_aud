# Paso 3.2: Interfaz de `Relación`, Pop-up Selector y Cableado de Rutas

## Objetivo del Paso
Implementar `src/views/relacionView.ts` (Vista Multi centrada en Organizaciones/Conglomerados + Pop-up Selector de Certificado/Auditoría + Vista Detalle limpia inspirada en `Tipo`), integrar `'Relación'` como Paso 1 en `src/views/auditoriasView.ts` y cablear la persistencia y eventos en `src/main.ts`.

---

## Archivos Afectados
- `src/views/relacionView.ts` *(nuevo)*
- `src/views/relacionView.test.ts` *(nuevo)*
- `src/views/auditoriasView.ts` (reemplazar rama `'vinculo'` por `'relacion'`, actualizar tarjeta/stepper a Paso 1 `Relación`)
- `src/views/designacionTipoView.ts` (ajuste mínimo de textos/copy para reflejar que `Tipo` es sub-paso 2.1 dentro de `Designación` después de `Relación`)
- `src/views/resumenView.ts` (etiqueta Paso 1 → `Relación` y enlace de navegación `targetSubview: 'relacion'`)
- `src/main.ts` (estado `relacionDomain`, renderización de `relacion`, handlers de Picker Pop-up, cambio de `tipo_vinculacion` por auditoría o lote y sincronización con `designacion/tipo`)

---

## Cambios Técnicos Detallados

### 1. Vista `src/views/relacionView.ts` ("Less Is More" estilo `Tipo`)
1. **Multi View (`renderRelacionMultiView`):**
   - Usa `renderUniversalTemplate` con `table-fixed` + `<colgroup>` cuya suma exacta sea **`100%`** y **cero `<button>` dentro de `<tbody>`**.
   - Filas y tarjetas centradas en **Organizaciones / Conglomerados**:
     - Col 1: Organización / Conglomerado (nombre corto + código/grupo breve)
     - Col 2: Certificados y codenames activos (`2026-11 Seg.1`, etc.)
     - Col 3: Naturaleza predominante (`Combinada`, `Integrada`, `Individual`, etc.)
     - Col 4: Base en Bloque 2 (`Vínculo` etiqueta limpia o `Libre`)
     - Col 5: Estado / Ciclo actual
   - Hacer clic en una fila o tarjeta dispara `data-action="open-relacion-picker"` abriendo el **Pop-up Selector**.
   - Barra lateral de facetas conectada a `facetSelections` (Conglomerado, Relación/Naturaleza, Nivel, Estado de Ciclo).

2. **Pop-up Selector de Certificado / Auditoría (`renderRelacionPickerModal`):**
   - Modal centrado y limpio al hacer clic en una Organización/Conglomerado en Multi View.
   - Agrupa por certificado (`numero_certificado` + `norma_codigo`) y lista cada auditoría seleccionable con su **codename compacto** (`2026-11 Seg.1`), naturaleza actual y estado.
   - Al hacer clic en una auditoría o certificado (`data-action="select-relacion-audit"`), cierra el modal, actualiza `selectedCertId` / `selectedAuditId`, actualiza breadcrumbs y abre la Vista Detalle de `Relación`.

3. **Detail View (`renderRelacionDetailView`):**
   - Estructura idéntica en limpieza a `designacionTipoView.ts`:
     - Envuelto en `renderAuditSectionShell({ compactMode: true, currentStepId: 'relacion', ... })` con Zone 1 chips + Pipeline Stepper Bar (`1. Relación` → `2. Designación` → ...).
     - Sin banners largos ni texto explicativo repetitivo.
     - Si el usuario tiene permisos de escritura (`ADMIN`/`WORKER`), barra de acción rápida opcional ("Aplicar naturaleza base de Vínculo" / selector maestro de campaña cuando es lote multi-certificado) y botón `+ Auditoría` estándar de Bloque 1.
     - Tabla única con `table-fixed` y `<colgroup>` sumando **`100%`** (cero `<button>` en `<tbody>`):
       - Col 1 (`22%`): Certificado y Norma
       - Col 2 (`18%`): Codename / Auditoría (`2026-11 Seg.1`)
       - Col 3 (`22%`): Base Bloque 2 (`Vínculo`: etiqueta limpia o `Sin caja`)
       - Col 4 (`24%`): **Relación de Auditoría** (`<select data-action="change-audit-relacion">` para staff o badge limpio read-only para `AUDITOR`/`CLIENT`)
       - Col 5 (`14%`): Estado (`Confirmada`, `Personalizada`, `Pendiente`)

### 2. Cableado en `src/main.ts` y Vistas Relacionadas
- En `src/main.ts`:
  - Añadir `relacionDomain: RelacionViewState` en `AppState` (inicializado con `DEFAULT_RELACION_VIEW_STATE`) y limpiarlo junto con las selecciones al cambiar de dominio o contexto cuando corresponda.
  - Al cambiar de paso dentro de una misma auditoría (navegación horizontal en Stepper Bar), preservar `selectedAuditId` y `selectedCertId` entre `'relacion'` ↔ `'designacion/tipo'` ↔ demás pasos.
  - Implementar `updateSingleAuditRelacion(auditId, tipoVinculacion)`:
    - Actualiza `auditoria.tipo_vinculacion` en Supabase (solo `ADMIN`/`WORKER`, validado con `assertApprovedStaffForMutation`).
    - Opcionalmente sincroniza `programa_auditoria.tipo_vinculacion` / `es_vinculada` únicamente si todas las auditorías activas del lote quedan homogéneas o marca `'Mixta'` cuando coexisten naturalezas distintas dentro del mismo lote, **nunca** modificando `vinculo` / `vinculo_certificado` de Bloque 2.
    - Envuelve re-renderizado en `runWithPlannerPreservedViewport`.
- En `auditoriasView.ts` y `resumenView.ts`:
  - Conectar `activeSub === 'relacion'` a `renderRelacionView(...)` y asegurar que el Step 1 de `resumenView.ts` apunte a `'relacion'`.

### 3. Pruebas (`src/views/relacionView.test.ts`)
- Verificar en Multi View: tabla con `table-fixed` + `<colgroup>` = `100%` y `0 <button>` en `<tbody>`.
- Verificar que hacer clic en una organización/conglomerado renderiza el Picker Pop-up con sus certificados y codenames compactos.
- Verificar en Detail View: `renderAuditSectionShell` muestra `Relación` como Paso 1 antes de `Designación`, tabla `<colgroup>` = `100%`, `0 <button>` en `<tbody>`, selector editable solo para `ADMIN`/`WORKER` y solo lectura para `AUDITOR`/`CLIENT`.

---

## Criterios de Aceptación y Verificación
- `npm test -- src/views/relacionView.test.ts` pasa al 100%.
- `npx tsc --noEmit`, `npm run lint` y `npm run build` exitosos.
- Navegación fluida en Bloque 1: `Relación` → `Designación {Tipo, Fecha, Sitio, Temporal}` sin referencias rotas a `auditorias/vinculo`.
