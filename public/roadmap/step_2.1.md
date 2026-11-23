# Step 2.1 — Dominio Puro: Versionado de `Organización`, `abreviacion`, Guardia Anti-No-Op y Resolución de Certificados

## Objetivo del Paso
Implementar en TypeScript estricto (`strict: true`, **0 `any`**) los modelos de datos, validadores, **Guardia Anti-No-Op**, planificador de resolución de versiones de certificado y capa de persistencia/fallback para el versionado de organizaciones e incorporación de `abreviacion`.

---

## Archivos a Crear / Modificar
- `src/lib/activeCertificates.ts`
- `src/lib/organizacionVersionDomain.ts` *(nuevo)*
- `src/lib/organizacionVersionDomain.test.ts` *(nuevo)*
- `src/lib/activeCertificates.test.ts`

---

## Especificación Técnica Detallada

### 1. Extensión de Tipos e Invariantes (`src/lib/activeCertificates.ts`)
1. Definir `OrganizacionVersionEntity`:
   ```ts
   export interface OrganizacionVersionEntity {
     id: string;
     id_organizacion: string;
     version_numero: number;
     es_version_actual: boolean;
     notas_version: string | null;
     nombre: string;
     abreviacion: string;
     rif: string | null;
     direccion_fiscal: string | null;
     created_at?: string;
     updated_at?: string;
     deleted_at?: string | null;
   }
   ```
2. Extender `OrganizacionEntity`:
   - Añadir `abreviacion: string`, `id_organizacion_version_actual?: string`, `version_actual_numero?: number`, `versiones?: OrganizacionVersionEntity[]`.
   - Actualizar `INITIAL_ORGANIZACIONES` con `abreviacion`, `id_organizacion_version_actual`, `version_actual_numero` y `versiones` (incluyendo ejemplo `v1 -> v2` en la organización demostrativa de `CONG-IND-01`).
3. Extender `OrganizacionFormDraft` y `validateOrganizacionDraft(...)`:
   - Incluir `abreviacion: string` y `notas_version?: string`.
   - Validar `abreviacion`: obligatorio tras `trim()`, longitud `2..30`, sin UUIDs (`containsRawUuid`), sin duplicidad activa case-insensitive entre otras organizaciones activas (`organizaciones`). Mensajes claros en español.

### 2. Motor Puro de Versionado de Organización (`src/lib/organizacionVersionDomain.ts`)
1. **`normalizeOrganizacionComparableFields(draft)`:** normaliza espacios internos (`replace(/\s+/g, ' ').trim()`), canoniza `abreviacion` y `rif` (`trim().toUpperCase()` vs valor normalizado) y `direccion_fiscal` (`trim()`).
2. **`hasOrganizacionVersionChanges(activeVersion, draft): boolean` (Guardia Anti-No-Op):**
   - Compara `(nombre, abreviacion, rif, direccion_fiscal)` normalizados entre `activeVersion` y `draft`.
   - Devuelve `false` si los 4 campos son equivalentes; `true` si al menos uno cambió.
3. **`validateNewOrganizacionVersionDraft(activeVersion, draft, existingOrgs):` `{ valid: boolean; errorMessage: string | null }`**
   - Si `!hasOrganizacionVersionChanges(activeVersion, draft)` devuelve exactamente:
     `'No se detectaron cambios respecto a la versión activa. Modifique al menos un campo (Nombre, Abreviación, RIF o Dirección Fiscal) para crear una nueva versión.'`
   - Verifica `validateOrganizacionDraft(...)` (excluyendo `activeVersion.id_organizacion` de colisión consigo misma).
4. **Resolución de Versiones de Certificado Post-Creación (`CertVersionOrgResolutionItem`, `CertVersionOrgAction = 'MANTENER_ANTERIOR' | 'VINCULAR_NUEVA'`):**
   - `buildDefaultCertVersionOrgResolutions(certificados, activeOrgVersionId)`:
     - Recorre todas las `certificado_version` no eliminadas pertenecientes a la organización (`id_certificado`, `id_certificado_version`, `numero_certificado`, `norma_codigo`, `version_numero`, `es_version_actual`, `id_organizacion_version`).
     - Aplica la regla obligatoria de preselección:
       - Versiones históricas (`es_version_actual === false`) → `'MANTENER_ANTERIOR'` (**`Mantener en versión anterior de organización`**).
       - Versión actual (`es_version_actual === true`) → `'VINCULAR_NUEVA'` (**`Vincular a nueva versión de organización`**).
   - `validateCertVersionOrgResolutions(resolutions)`: valida que toda versión listada posea acción explícita y cero UUIDs en mensajes de error.
5. **Persistencia Transaccional (`persistCreateOrganizacionVersion`, `persistResolveCertVersionsOrg`):**
   - Cliente tipado estructural sin `any` llamando a `fn_crear_version_organizacion` y `fn_resolver_cert_versiones_organizacion` vía `.rpc(...)`.
   - Traductor de errores PostgreSQL en español Zero-UUID (`translateOrganizacionVersionDbError`), cubriendo `P0001` (incluyendo Anti-No-Op), `23505` (nombre/abreviación/RIF duplicados en versión activa) y `42501` (RLS).

### 3. Pruebas Unitarias (`organizacionVersionDomain.test.ts` y `activeCertificates.test.ts`)
- Rechazo de `abreviacion` vacía, `< 2` chars, `> 30` chars, duplicada activa o con UUID crudo.
- Bloqueo Anti-No-Op cuando solo cambian espacios múltiples o mayúsculas/minúsculas equivalentes en `rif` sin cambios reales, y paso exitoso cuando cambia cualquiera de los 4 campos (`nombre`, `abreviacion`, `rif` o `direccion_fiscal`).
- Preselección por defecto correcta del modal: `v1` histórica de certificado → `MANTENER_ANTERIOR`, `v2` actual → `VINCULAR_NUEVA`, y soporte de override manual del usuario.
- Mock estructural de RPC comprobando parámetros exactos y saneado Zero-UUID ante fallos `P0001`/`23505`/`42501`.

---

## Criterios de Aceptación y Verificación
- Ejecutar `node --test src/lib/organizacionVersionDomain.test.ts src/lib/activeCertificates.test.ts` en verde (100% pass).
- Cero `any` (`: any`, `as any`) ni UUIDs expuestos en mensajes.
- Todas las etiquetas y mensajes de validación en español.
