# Paso 4.2: Interfaz del Wizard `+ Auditoría` (3 Fases) y Persistencia Transaccional

## Objetivo del Paso
Actualizar `src/views/auditWizardModal.ts` y la persistencia/handlers en `src/main.ts` para renderizar las 3 nuevas fases del pop-up `+ Auditoría`, incluyendo toggles ON por defecto en Fase 2, tabla unificada de 2 columnas (`Relación / Naturaleza` | `Tipo de Auditoría`) en Fase 3, codenames/abreviaciones compactas y guardado atómico de `programa_auditoria`, `auditoria` (con `tipo_vinculacion` individual) y `auditoria_fecha`.

---

## Archivos Afectados
- `src/views/auditWizardModal.ts`
- `src/views/auditWizardModal.test.ts`
- `src/main.ts` (handlers del modal wizard, `createStep3CampaignCycle`, `loadLiveAudits` / navegación post-creación hacia `Relación` o `Designación → Tipo`)

---

## Cambios Técnicos Detallados

### 1. Rediseño UI de `src/views/auditWizardModal.ts`
Mantener diseño minimalista, 100% español, Zero-UUID, y tabla `table-fixed` `<colgroup>` sumando `100%` con cero `<button>` dentro de `<tbody>`:

1. **Indicador de Progreso (3 Pasos):**
   - `1. Empresa / Conglomerado` → `2. Vínculo y Certificados` → `3. Fecha, Relación y Tipo`.
2. **Fase 1 (`renderWizardStep1`):**
   - Selectores bidireccionales de `Conglomerado` (usando `resolveShortConglomeradoName`) y `Organización` (usando `resolveShortOrganizacionName`).
3. **Fase 2 (`renderWizardStep2`):**
   - Selector de cajas `Vínculo` pertenecientes al conglomerado/organización seleccionados (mostrando etiqueta limpia de la caja y naturaleza predeterminada).
   - Debajo de la caja seleccionada, lista limpia de todos sus certificados miembros con **interruptor/checkbox ON por defecto (`checked`)** (`data-action="toggle-wizard-cert"`):
     - Cada ítem muestra `numero_certificado`, `norma_codigo`, `resolveShortOrganizacionName(...)` y su naturaleza base heredada/override.
     - Botones rápidos compactos en cabecera de lista: `Activar todos` / `Solo 1º` si hay varios miembros.
     - Si un certificado no tiene Alcance activo, mostrar indicador limpio discreto junto a enlace/nota (solo bloquea si su toggle permanece en ON).
     - Enlace secundario discreto a `#/certificacion/vinculo` ("Gestionar cajas en Vínculo") en caso de que el conglomerado no tenga cajas creadas aún.
4. **Fase 3 (`renderWizardStep3`):**
   - Arriba: configuración de fecha programada (`PREPROGRAMADA_MES` con Año + Mes, o `PROGRAMADA_EXACTA` con fecha) + etiqueta opcional corta (con placeholder limpio generado con codename/nombre corto) + previsualización en vivo del codename resultante (ej. `2026-11 Seg.1`).
   - Debajo: **Tabla única de 2 columnas** (más columna identificadora compacta o cabecera de fila por certificado, implementando claramente las 2 columnas operativas solicitadas para los certificados en ON):
     - Configurar `<colgroup>` sumando `100%`:
       - Certificado (`34%`): `numero_certificado` + `norma_codigo` + empresa corta
       - **Columna 1 — `Relación / Naturaleza` (`33%`):** `<select data-action="wizard-cert-relacion">` pre-llenado con la naturaleza configurada en `Vínculo` (caja o override individual) y editable libremente.
       - **Columna 2 — `Tipo de Auditoría` (`33%`):** `<select data-action="wizard-cert-tipo">` con los tipos del catálogo `tipo_auditoria`.
     - Cabecera compacta sobre la tabla con selectores rápidos opcionales "Aplicar relación a todos" / "Aplicar tipo a todos" (`<select>` + `<button>` fuera de `<tbody>`).

### 2. Handlers y Persistencia en `src/main.ts`
- Enlazar eventos DOM en `src/main.ts`:
  - `toggle-wizard-cert`, `wizard-select-all-certs` (con preservación de estado en `state.auditWizard`).
  - `wizard-cert-relacion`, `wizard-apply-all-relacion`, `wizard-cert-tipo`, `wizard-apply-all-tipo`.
- Actualizar **`createStep3CampaignCycle(draft)`** (`src/main.ts` líneas `38404+`):
  - Determinar `nivel_vinculacion` efectivo a partir de los certificados realmente incluidos (`draft.certTypes`):
    - `1` cert → `'INDIVIDUAL'`
    - `>1` misma org → `'NIVEL_1_INTRA_ORG'`
    - `>1` distinta org → `'NIVEL_2_INTER_ORG'`
  - Calcular `programTipoVinculacion`: si todas las filas tienen la misma naturaleza en Col 1, usarla; si hay mezcla, usar `'Mixta'`.
  - Insertar `programa_auditoria` con `id_vinculo: draft.id_vinculo` (referencia de origen sin acoplamiento bloqueante), `nivel_vinculacion`, `tipo_vinculacion: programTipoVinculacion`, `es_vinculada`.
  - Insertar cada `auditoria` hija en el loop enviando explícitamente **`tipo_vinculacion: item.tipo_vinculacion`** en el `INSERT` de Supabase y en el objeto local `ProgramacionAuditEntity` (incluyendo manejo limpio de fallback local y rollback con `rollbackOrphanProgramAndAudits` + `archive_record` si falla alguna inserción o fecha inicial).
  - Redirigir post-creación de forma coherente hacia `designacion/tipo` o `relacion` con la auditoría recién creada seleccionada y toast en español con el codename compacto generado (`Ciclo creado: 2026-11 Seg.1`).

### 3. Pruebas (`src/views/auditWizardModal.test.ts`)
- Verificar renderizado de Fase 1, Fase 2 (toggles ON por defecto visibles, enlace Bloque 2 `#/certificacion/vinculo`) y Fase 3 (`<colgroup>` sumando `100%`, `0 <button>` en `<tbody>`, selects de `Relación / Naturaleza` y `Tipo de Auditoría` pre-poblados).
- Verificar ausencia de UUIDs en HTML generado y textos 100% en español.

---

## Criterios de Aceptación y Verificación
- `npm test -- src/views/auditWizardModal.test.ts` pasa al 100%.
- `npx tsc --noEmit`, `npm run lint` y `npm run build` exitosos.
- Prueba manual/integrada del flujo completo: crear ciclo seleccionando solo 1 de 3 certificados de una caja y validar que solo crea 1 auditoría con su relación y tipo elegidos.
