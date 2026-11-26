# Paso 1.3 — Catálogo UI, Dominio y Persistencia de `Certificación → Experto` (Bloque 2)

## 1. Objetivo
Implementar de punta a punta la nueva sección **`Experto`** (`experto_tecnico`) en Bloque 2 **`Certificación`** inmediatamente después de **`Auditor`**, permitiendo consultar, filtrar, crear, editar, archivar y gestionar disponibilidad/estatus, notas, teléfonos, emails y competencias exclusivas en **`Sector IAF`** / **`Sub-Sector IAF`**.

---

## 2. Archivos Involucrados
- `src/lib/healthCheck.ts` (`CERTIFICACION_NAV_ITEMS`, `VALID_DOMAIN_SUBVIEWS` o subviews de `certificacion`)
- `src/lib/accessControl.ts` (`normalizeDomainSubview`, `canAccessSubview` para los 4 roles)
- `src/lib/expertoTecnicoDomain.ts` **(nuevo)**
- `src/lib/expertoTecnicoPersistence.ts` **(nuevo)**
- `src/views/expertoTecnicoView.ts` **(nuevo)**
- `src/lib/archiveGovernance.ts` (soporte `archiveConfig` para `'experto_tecnico'`)
- `src/main.ts` (estado, hidratación desde Supabase, handlers CRUD de ficha, teléfonos, emails y competencias IAF, navegación)
- `src/lib/expertoTecnicoDomain.test.ts` **(nuevo)**
- `src/views/expertoTecnicoView.test.ts` **(nuevo)**

---

## 3. Especificación Técnica Detallada

### 3.1. Navegación y RBAC (`healthCheck.ts`, `accessControl.ts`)
- En `CERTIFICACION_NAV_ITEMS`: insertar `{ id: 'experts', label: 'Experto', symbol: '🔬', tooltip: 'Expertos Técnicos por Sector y Sub-Sector IAF' }` **inmediatamente después** de `{ id: 'auditors', label: 'Auditor', ... }` (antes del elemento siguiente).
- Registrar `'experts'` (y alias `'experto'` / `'experto_tecnico'` en normalizador) dentro de los subviews válidos de `certificacion`.
- Permisos por rol:
  - `ADMIN` / `WORKER`: lectura + creación, edición, teléfonos, emails, competencias IAF y archivado (solo `ADMIN` ve archivados o según política `canArchiveRecord`).
  - `AUDITOR`: solo lectura.
  - `CLIENT`: bloqueado en catálogo maestro `Experto` (misma restricción que `Auditor` en Bloque 2, verificando `canAccessSubview`).

### 3.2. Dominio Puro (`src/lib/expertoTecnicoDomain.ts`)
- Interfaces TypeScript estrictas (`0 any`):
  - `ExpertoDisponibilidad = 'Disponible' | 'No disponible'`
  - `ExpertoTelefonoItem`, `ExpertoEmailItem`, `ExpertoSectorLink`, `ExpertoSubsectorLink`
  - `ExpertoAuditHistorialItem` (auditorías donde ha sido asignado en `experto_tecnico_auditoria` con días y observación)
  - `ExpertoTecnicoDetailEntity`
  - `ExpertoTecnicoViewState` (`selectedExpertoId`, `activeChildTab: 'competencias' | 'contacto' | 'historial'`, `query`, `viewMode`, `isSidebarOpen`, `facetSelections`, `sortColumn`, `sortDirection`, `isEditingAttributes`, `isCreating`, `formDraft`, `editErrorMessage`, estados inline para teléfonos/emails y modal/vista de nueva competencia IAF)
- Validaciones puras:
  - `nombre` obligatorio (máx. 150 chars, sin UUIDs crudos).
  - `estatus` estrictamente `'Disponible' | 'No disponible'`.
  - `notas` opcionales (texto sanitizado sin UUIDs).
  - Validación de formato de email, teléfono y selección en cascada `Sector IAF` → `Sub-Sector IAF` (reutilizando `filterSubsectoresBySectorIaf` de `multisiteSampling.ts`).
  - Helper `evaluateExpertoCompetencyMatch(experto, sectorNumero, subsectorCodigo)`: devuelve si el experto cubre exactamente el subsector (`'SUBSECTOR_EXACT'`), todo el sector padre (`'SECTOR_FULL'`), o no cubre (`'NONE'`). **Nunca evalúa normas ISO.**

### 3.3. Persistencia (`src/lib/expertoTecnicoPersistence.ts` + `src/main.ts`)
- Funciones tipadas sobre `SupabaseClient`:
  - Hidratar `experto_tecnico` + `telefono_experto_tecnico` + `email_experto_tecnico` + `sector_iaf_experto` + `subsector_iaf_experto` + historial desde `experto_tecnico_auditoria`.
  - `createExpertoTecnico`, `updateExpertoTecnico` (nombre, estatus, notas).
  - `addExpertoTelefono` / `archiveExpertoTelefono`.
  - `addExpertoEmail` / `archiveExpertoEmail`.
  - `linkExpertoSectorIaf` / `unlinkExpertoSectorIaf`.
  - `linkExpertoSubsectorIaf` / `unlinkExpertoSubsectorIaf`.
  - Guardia de RBAC (`assertApprovedStaffForMutation`) y verificación `assertValidUuid` sin exponer UUIDs en errores.

### 3.4. UI Multi View y Detail View (`src/views/expertoTecnicoView.ts`)
- **Multi View (`renderUniversalTemplate`):**
  - Título: `Expertos Técnicos` / acción `+ Nuevo Experto` (solo staff).
  - Facetas laterales reactivas: **Disponibilidad** (`Disponible`, `No disponible`), **Sector IAF**, **Sub-Sector IAF**.
  - Búsqueda única por nombre, notas, sector IAF, subsector IAF, email o teléfono.
  - Vista **List** (`table-fixed`, `<colgroup>` 100%, `0 <button>` en `<tbody>`): columnas `Experto & Notas`, `Disponibilidad`, `Sectores / Sub-Sectores IAF`, `Contacto` (teléfono/email principal), `Auditorías`.
  - Vista **Grid** con tarjetas equivalentes mostrando badge de disponibilidad, competencias IAF y contacto.
- **Detail View (`renderDetailPageTemplate`):**
  - Zona superior: nombre, badge `Disponible` (verde) / `No disponible` (gris/ámbar), acciones `Editar`, `Historial de Cambios`, `Archivar`.
  - Ficha editable: `Nombre Completo`, `Disponibilidad para trabajar` (`Disponible` / `No disponible`), `Notas del Perfil`.
  - Sub-pestañas ordenadas:
    1. **`Sectores y Sub-Sectores IAF`**: 2 tablas (`sector_iaf_experto` y `subsector_iaf_experto`) con botón `+ Asignar Sector / Sub-Sector IAF` (selector en cascada Sector → Subsector, **cero normas ISO**) y desvinculación controlada para staff.
    2. **`Teléfonos y Emails`**: gestión directa de múltiples teléfonos (`telefono`, `tipo_telefono`) y emails (`email`, `tipo_email`) con alta inline y soft-delete (`deleted_at`).
    3. **`Historial de Auditorías`**: tabla de auditorías donde ha participado (`codigo`, organización, certificado, días asignados, observación) con navegación a la auditoría correspondiente.

---

## 4. Criterios de Aceptación
1. En el menú **`Certificación`**, **`Experto`** aparece inmediatamente debajo/después de **`Auditor`**.
2. Cada experto permite configurar disponibilidad (`Disponible` / `No disponible`), `notas`, múltiples `teléfonos`, múltiples `emails` y competencias únicamente de `Sector IAF` y/o `Sub-Sector IAF`.
3. `Zero-UUID`, `0 any`, `table-fixed` + `<colgroup>` 100%, `0 <button>` en `<tbody>` y control estricto de los 4 roles.

---

## 5. Verificación
- `npx tsx --test src/lib/expertoTecnicoDomain.test.ts src/views/expertoTecnicoView.test.ts src/lib/accessControl.test.ts src/lib/healthCheck.test.ts`
- `npx tsc --noEmit && npm run lint && npm run build`
