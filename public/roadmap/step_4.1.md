# Paso 4.1: Dominio y Validación del Wizard `+ Auditoría` en 3 Fases

## Objetivo del Paso
Rediseñar el dominio puro del asistente modal `+ Auditoría` (`src/lib/auditWizardDomain.ts` y utilidades de validación en `src/lib/auditPlanningPersistence.ts`) para soportar el nuevo flujo en 3 fases:
- **Fase 1:** Selección bidireccional `Conglomerado` ↔ `Organización`.
- **Fase 2:** Selección de caja `Vínculo` listando sus certificados con **toggles ON por defecto** para auditar todos, un subconjunto o un único certificado.
- **Fase 3:** Fecha programada + tabla unificada de 2 columnas para los certificados activos (**Col 1: `Relación / Naturaleza`**, **Col 2: `Tipo de Auditoría`**).

---

## Archivos Afectados
- `src/lib/auditWizardDomain.ts`
- `src/lib/auditWizardDomain.test.ts`
- `src/lib/auditPlanningPersistence.ts`
- `src/lib/auditPlanningPersistence.test.ts`

---

## Cambios Técnicos Detallados

### 1. Nuevo Modelo de Estado (`AuditWizardState` en `src/lib/auditWizardDomain.ts`)
- Actualizar tipos del estado de las 3 fases:
  - `step: 1 | 2 | 3`
  - **Fase 1:** `selectedConglomeradoId: string | null`, `selectedOrganizacionId: string | null`
  - **Fase 2:**
    - `selectedVinculoId: string | null`
    - `vinculoMembers: WizardVinculoCertOption[]` donde cada ítem incluye:
      - `id_certificado`, `numero_certificado`, `norma_codigo`, `id_organizacion`, `organizacion_nombre`, `organizacion_abreviacion`
      - **`enabled: boolean`** *(inicializado en `true` — ON por defecto — al seleccionar la caja `Vínculo`)*
      - **`baseNaturaleza: AuditLinkNature`** *(resuelta vía `resolveCertEffectiveNatureInBox(box, link)` respetando overrides de Bloque 2)*
      - `hasActiveAlcance: boolean`
  - **Fase 3:**
    - `dateMode: 'PREPROGRAMADA_MES' | 'PROGRAMADA_EXACTA'`, `anio: number`, `mes: number`, `fecha_programada: string`, `etiqueta: string`, `observacion: string`
    - **`certEntries: Record<string, WizardCertPhase3Entry>`** para cada certificado activo (`enabled === true`), con:
      - `id_tipo_auditoria: string`
      - `tipo_vinculacion: AuditLinkNature` *(pre-rellenado con `baseNaturaleza` y editable por certificado)*
    - Soporte de acción rápida opcional en lote (`applySameRelacionToAllWizardCerts` / `applySameTipoToAllWizardCerts`) para agilizar auditorías homogéneas.

### 2. Reglas Puras por Fase
1. **Fase 1 (`selectWizardConglomerado` / `selectWizardOrganizacion`):**
   - Mantener selección bidireccional limpia: elegir organización pre-selecciona automáticamente su conglomerado; elegir conglomerado filtra las organizaciones disponibles.
   - Validar paso 1 → 2 exigiendo al menos conglomerado u organización válida.
2. **Fase 2 (`selectWizardVinculo` + `toggleWizardVinculoCert` + `setAllWizardVinculoCerts`):**
   - Al elegir una caja `Vínculo`, cargar todos sus certificados miembros con `enabled: true` y pre-cargar en `certEntries` su `baseNaturaleza` (heredada u overridden en Bloque 2) y un tipo de auditoría sugerido o por seleccionar.
   - `toggleWizardVinculoCert(state, certId)` alterna `enabled` sin eliminar el certificado de la lista visual.
   - Permitir que queden activos **todos**, un **subconjunto** (ej. 2 de 4) o **1 solo** certificado.
   - Al avanzar de Fase 2 → Fase 3 (`advanceWizardStep`):
     - Exigir al menos **1 certificado con `enabled === true`**.
     - Exigir **Alcance activo** únicamente para los certificados **activados (`enabled === true`)** (si un certificado sin alcance fue apagado con toggle OFF, NO debe bloquear el avance).
3. **Fase 3 (`setWizardCertRelacion`, `setWizardCertTipo`, `buildStep3NewCycleDraftFromWizard`):**
   - Validar fecha programada (`anio`/`mes` o `fecha_programada`) y que cada certificado con `enabled === true` tenga `tipo_vinculacion` válido y `id_tipo_auditoria` válido.
   - Construir `Step3NewCycleDraft` (extendido con `tipo_vinculacion` por certificado en `certTypes` y `enabledCertCount`):
     - Si solo **1** certificado quedó en `ON`, derivar automáticamente nivel de campaña `INDIVIDUAL` (o respetar el nivel compatible: `INDIVIDUAL` para 1 cert, `NIVEL_1_INTRA_ORG` si todos los certs `ON` son de la misma organización, `NIVEL_2_INTER_ORG` si los certs `ON` pertenecen a distintas organizaciones del mismo conglomerado).
     - Si los certificados `ON` tienen naturalezas homogéneas en Col 1, usar esa naturaleza en `programa_auditoria.tipo_vinculacion`; si difieren entre filas, usar `'Mixta'` en el programa cabecera mientras cada `auditoria` hija conserva su `tipo_vinculacion` individual exacto.
     - Pre-calcular sugerencia limpia de `etiqueta` usando nombres cortos (`resolveShortConglomeradoName` / `formatAuditCodename` cuando falte etiqueta explícita).

### 3. Ajuste en `src/lib/auditPlanningPersistence.ts`
- Extender `Step3NewCycleCertTypeDraft` con `tipo_vinculacion: AuditLinkNature`.
- En `validateStep3NewCycleDraft(...)`:
  - **No** exigir que `draft.certTypes` contenga todos los certificados de la caja `vinculo`: permitir explícitamente cualquier subconjunto no vacío `>= 1` de certificados activos del mismo conglomerado (incluso 1 solo certificado, ajustando el nivel derivado sin rechazar subconjuntos).
  - Validar que cada `certTypes[i]` tenga `id_tipo_auditoria` y `tipo_vinculacion` válidos y cuente con Alcance activo.

### 4. Pruebas Unitarias
- **`src/lib/auditWizardDomain.test.ts`:**
  - Selección bidireccional Fase 1 (`Conglomerado` ↔ `Organización`).
  - Carga Fase 2 con toggles **ON por defecto**, apagado parcial (subconjunto) y apagado hasta dejar 1 solo certificado.
  - Verificación de que un certificado sin alcance en `OFF` no bloquea el paso a Fase 3, mientras que uno en `ON` sin alcance sí muestra error limpio sin UUIDs.
  - Pre-llenado de Col 1 (`Relación / Naturaleza`) desde override de caja `Vínculo` y edición independiente por fila junto con Col 2 (`Tipo de Auditoría`) en Fase 3.
  - Generación de `Step3NewCycleDraft` con 1 certificado (`INDIVIDUAL`), subconjunto misma org (`NIVEL_1_INTRA_ORG`) y multi-empresa (`NIVEL_2_INTER_ORG`), más naturaleza mixta vs homogénea.
- **`src/lib/auditPlanningPersistence.test.ts`:** validar aceptación de subconjuntos de caja y `tipo_vinculacion` por certificado.

---

## Criterios de Aceptación y Verificación
- `npm test -- src/lib/auditWizardDomain.test.ts src/lib/auditPlanningPersistence.test.ts` pasa al 100%.
- `npx tsc --noEmit` sin errores ni `: any`.
- Cero UUIDs en validaciones/mensajes de error.
