# Fase 1: Contratos de Estado, Lógica Pura de Cascada y Validación Unificada

**Archivos Objetivo:**
- `src/lib/multisiteSampling.ts`
- `src/lib/breadcrumb.ts` (verificación de etiqueta `"Nuevo Certificado"`)

---

## 1. Objetivo de la Fase

Desacoplar en TypeScript puro (sin dependencias DOM) el nuevo modelo de estado de la vista `Certificado`, las reglas de filtrado en cascada entre **`id_sector_iaf`** y **`id_subsector_iaf`**, y la validación integral tanto para **Modo Alta** (`add`) como para **Modo Edición** (`edit`), dejando listo el contrato tipado para las Fases 2 y 3.

---

## 2. Tareas Detalladas

### 2.1 Evolución de `CertificadoViewState` en `src/lib/multisiteSampling.ts`
1. Definir un tipo explícito de modo y borrador de formulario unificado:
   ```ts
   export type CertificadoDetailMode = 'read' | 'add' | 'edit';

   export interface CertificadoFormDraft {
     id_organizacion: string;
     id_norma: string;
     id_estatus: string;
     id_sector_iaf: string;
     id_subsector_iaf: string;
     numero_certificado: string;
     multisitio: boolean;
     alcance: string;
   }
   ```
2. Actualizar `CertificadoViewState`:
   - Mantener `selectedCertId: string | null`, `isCreating?: boolean`, `isEditingAttributes: boolean` (por compatibilidad con callers existentes) y añadir `formDraft?: CertificadoFormDraft`.
   - Consolidar `createErrorMessage?: string | null` / `editErrorMessage?: string | null` para que el Detail View muestre errores de validación tanto en Alta como en Edición.
   - Deprecar/eliminar de `CertificadoViewState` las banderas obsoletas de creación inline dentro de las pestañas `Fecha` y `Contacto` (`isCreatingFecha`, `fechaErrorMessage`, `isCreatingContacto`, `contactoErrorMessage`, `previewFechaId`, `previewContactoId`) una vez completada la Fase 4 (o marcarlas opcionales en Fase 1 y retirarlas en Fase 4 para mantener compilación verde en cada paso).
3. Proveer una fábrica pura `createEmptyCertificadoFormDraft()`:
   - Devuelve todos los campos de cadena en `''` (`id_organizacion: ''`, `id_norma: ''`, `id_estatus: ''`, `id_sector_iaf: ''`, `id_subsector_iaf: ''`, `numero_certificado: ''`, `alcance: ''`) y `multisitio: false`.
   - Proveer `createCertificadoFormDraftFromEntity(cert: CertificadoDetailEntity): CertificadoFormDraft` para poblar el Modo Lectura y el Modo Edición desde un certificado existente.

### 2.2 Motor Puro de Cascada Padre-Hijo (`id_sector_iaf` → `id_subsector_iaf`)
Implementar y exportar en `src/lib/multisiteSampling.ts`:
1. **`filterSubsectoresBySectorIaf(params)`:**
   - **Entradas:**
     - `sectorId: string` (UUID del `sector_iaf` seleccionado, o `''`).
     - `sectores: ReadonlyArray<{ id: string; sector: number; descripcion: string }>`
     - `subsectores: ReadonlyArray<{ id: string; id_sector_iaf: string; sector_numero: number; codigo: string; descripcion: string; categoria_riesgo?: string }>`
   - **Reglas de negocio:**
     - Si `sectorId` está vacío (`''`), retorna `[]` (no habilita sub-sectores huérfanos).
     - Resuelve el sector seleccionado por `id === sectorId` y filtra `subsectores` donde `sub.id_sector_iaf === sectorId` (o, si el catálogo live/seed comparte `sector_numero`, `sub.sector_numero === matchedSector.sector`).
     - Ordena los resultados de forma determinista por código numérico/lexicográfico (`17.1`, `17.2`, `17.3`, ...).
2. **`reconcileSubsectorSelectionOnSectorChange(params)`:**
   - Dado un nuevo `nextSectorId` y el `currentSubsectorId` actual, verifica si `currentSubsectorId` pertenece a los candidatos devueltos por `filterSubsectoresBySectorIaf`.
   - Si pertenece, lo conserva; si no pertenece (o si `nextSectorId === ''`), devuelve `''` para forzar una selección válida en el hijo.

### 2.3 Validación Unificada de Certificado (`validateCertificadoFormDraft`)
Implementar `validateCertificadoFormDraft(params)` en `src/lib/multisiteSampling.ts` para validar simultáneamente Alta (`mode: 'add'`) y Edición (`mode: 'edit'`):
- Verifica que los 5 IDs padres obligatorios (`id_organizacion`, `id_norma`, `id_estatus`, `id_sector_iaf`, `id_subsector_iaf`) no estén vacíos (`trim().length > 0`).
- Verifica coherencia jerárquica: `id_subsector_iaf` debe existir dentro de `filterSubsectoresBySectorIaf` para el `id_sector_iaf` elegido.
- Verifica `numero_certificado`: longitud entre `3` y `100` caracteres y unicidad case-insensitive frente a `existingCertificates` (excluyendo `currentCertId` cuando `mode === 'edit'`).
- Verifica `alcance` mediante `validateAlcance()` (entre `10` y `1000` caracteres).
- Normaliza espacios (`trim()`) y retorna `{ valid: boolean; error?: string; normalized?: CertificadoFormDraft }`.
- Mantener `validateCertificadoEditInput` como wrapper/alias compatible si alguna prueba unitaria heredada lo importa, o actualizarlo en `step_final.md`.

### 2.4 Soporte de Ruta Alta en `src/lib/breadcrumb.ts`
- Revisar `pushBreadcrumb` para que el segmento de creación `"Nuevo Certificado"` use un `id` determinista (ej. `'cert-new'`) con `route: 'certificacion'`, `subview: 'certificates'`, `entityType: 'cert'`, y no produzca duplicados al re-renderizar ni exponga UUIDs.

---

## 3. Criterios de Verificación de la Fase 1

- `npx tsc --noEmit` sin errores tras actualizar `src/lib/multisiteSampling.ts`.
- Todas las funciones nuevas (`createEmptyCertificadoFormDraft`, `filterSubsectoresBySectorIaf`, `reconcileSubsectorSelectionOnSectorChange`, `validateCertificadoFormDraft`) son 100% puras y exportadas para pruebas unitarias en `node:test`.
