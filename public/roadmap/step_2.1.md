# Paso 2.1: Dominio Puro de `Vínculo` en Bloque 2 (`src/lib/vinculoDomain.ts`)

## Objetivo del Paso
Transformar la lógica pura de `src/lib/vinculoDomain.ts` para convertir a `'Vínculo'` en un **organizador estructural de Cajas Agrupadoras** perteneciente al Bloque 2 (`Certificación`), completamente aislado de las auditorías ejecutadas, soportando naturaleza heredada + override por certificado, flujo de pop-up colapsado/expandible y regla obligatoria de desvinculación previa antes de mover un certificado a otra caja.

---

## Archivos Afectados
- `src/lib/vinculoDomain.ts`
- `src/lib/vinculoDomain.test.ts`

---

## Cambios Técnicos Detallados

### 1. Modelo de Datos y Naturaleza por Certificado
- Extender `VinculoCertificadoItem`:
  - `tipo_vinculacion_override?: AuditLinkNature | null` (`null` / `undefined` = hereda la naturaleza predeterminada de la caja `vinculo.tipo_vinculacion`).
- Añadir función pura **`resolveCertEffectiveNatureInBox(box, linkItem)`**:
  - Retorna `linkItem.tipo_vinculacion_override || box.tipo_vinculacion`.
  - Añadir helper **`isCertNatureOverridden(box, linkItem)`** para indicar si difiere de la caja padre.
- Actualizar el estado de vista **`VinculoViewState`**:
  - Añadir estado para el **Pop-up Modal de Asignación desde Certificado `LIBRE`**:
    - `assignModalCertId: string | null`
    - `assignModalExpandedBoxIds: string[]` *(cajas expandidas en el modal; por defecto vacío = todas colapsadas)*
    - `assignModalErrorMessage: string | null`
  - Simplificar cualquier estado heredado de acoplamiento a Block 1 (mantener `selectedConglomeradoId`, `editingBoxId`, `boxFormDraft`, `isCreatingBox`, `newBoxDraft`, `editErrorMessage`, filtros y vista Multi).

### 2. Aislamiento Estructural y Reglas de Re-vinculación
1. **Desvinculación sin bloqueos por auditoría (`canDetachCertificateFromVinculo`):**
   - Actualizar `canDetachCertificateFromVinculo(params)` para que **NO** bloquee la desvinculación cuando existan auditorías activas, en curso o cerradas en Bloque 1.
   - Una caja agrupadora puede quedarse vacía (0 certificados) sin marcarse como eliminada; solo el archivado explícito de la caja verifica si está vacía o solicita confirmación.
2. **Regla estricta de Re-vinculación (`validateAssignCertToBox` / `planAssignCertToBox`):**
   - Un certificado actualmente asignado a una caja `A` **no** puede moverse directamente a una caja `B`.
   - Si el certificado no está `LIBRE`, la función devuelve `{ ok: false, errorMessage: 'Para cambiar de caja, primero desvincule el certificado para devolverlo a LIBRE y luego asígnelo a la nueva caja.' }` (sin exponer UUIDs).
   - Validar pertenencia al mismo `Conglomerado` (`id_grupo_empresarial`) y coherencia de `nivel_vinculacion` si la caja está configurada como `INDIVIDUAL` (máx 1) o `NIVEL_1_INTRA_ORG` (misma organización).
   - Soportar explícitamente **Etiqueta** (ej. `'Planta Turmero'`) + **Naturaleza predeterminada** (`tipo_vinculacion`) al crear o editar caja, derivando automáticamente `nivel_vinculacion` y `es_vinculada` sin fricción para el usuario.
3. **Mutación pura de override (`validateCertNatureOverride`):**
   - Valida que el certificado esté activo en la caja y que la naturaleza elegida sea una de las válidas (`AuditLinkNature`) o `null` ("Heredar de la caja").

### 3. Visibilidad RBAC Bloque 2 y Búsqueda Multi View
- **RBAC (`scopeVinculoConglomeradosByRole`):**
  - `ADMIN` / `WORKER`: acceso total de lectura y edición en todos los conglomerados.
  - `CLIENT`: solo lectura aislada Nivel 2 (únicamente conglomerados donde tiene al menos una organización en `authorizedClientOrgIds`, y únicamente sus certificados/cajas visibles sin revelar organizaciones de terceros).
  - `AUDITOR`: acceso denegado a datos del módulo Bloque 2 `Vínculo` (retorna conjunto vacío / bloqueo explícito de Bloque 2).
- **Multi View por Conglomerado:**
  - En las métricas y tarjetas del Conglomerado (`buildVinculoConglomeradoRows`), usar `resolveShortConglomeradoName` para mostrar el identificador corto limpio, total de cajas agrupadoras, total de certificados asignados y total en estado `LIBRE`.
  - Mantener filtros facetados y ordenamiento compatibles con `universalTemplate`.

### 4. Pruebas Unitarias (`src/lib/vinculoDomain.test.ts`)
- Verificar que un certificado recién agregado hereda `box.tipo_vinculacion` cuando `tipo_vinculacion_override` es `null`.
- Verificar que un certificado dentro de una caja puede sobreescribir su naturaleza individualmente sin modificar la naturaleza base de la caja ni de los demás miembros.
- Verificar que `canDetachCertificateFromVinculo` permite desvincular incluso si existen auditorías activas/cerradas asociadas al mismo certificado.
- Verificar bloqueo de re-vinculación directa Caja A → Caja B (exige pasar por `LIBRE`).
- Verificar estado de modal colapsado por defecto (`assignModalExpandedBoxIds = []`) y expansión/colapso por caja.
- Verificar RBAC de los 4 roles (`AUDITOR` denegado, `CLIENT` aislado Nivel 2 solo lectura, `ADMIN`/`WORKER` RW).

---

## Criterios de Aceptación y Verificación
- `npm test -- src/lib/vinculoDomain.test.ts` pasa al 100%.
- `npx tsc --noEmit` sin errores y cero `: any` / `as any`.
- Zero-UUID verificado en todos los mensajes de error retornados por `vinculoDomain.ts`.
