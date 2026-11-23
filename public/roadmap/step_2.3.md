# Step 2.3 — Dominio Puro: `Alcance` Bilingüe sin Límite, Compartición con Conflicto y Bloqueo de Auditoría

## Objetivo del Paso
Implementar el motor de dominio puro para la nueva tabla **`alcance`** (`src/lib/alcanceDomain.ts`) y la persistencia transaccional de compartición/reemplazo (`alcance` + `alcance_certificado_compartido` en `src/lib/certificadoSharePersistence.ts`), garantizando:
1. Valor único vigente en español obligatorio (`alcance_es`) e inglés opcional (`alcance_en`), **sin tracking histórico de cambios y sin límite de caracteres** (soporte igualitario para textos cortos de 1 línea y extensos multilínea).
2. Regla estricta de que **certificados sin alcance existen válidamente pero no pueden generar auditorías** (`vinculoDomain.ts`, `auditWizardDomain.ts`, `designacionTipoDomain.ts`).
3. Planificador de compartición dentro del mismo **`Conglomerado`** con detección de conflicto cuando el certificado destino ya tiene alcance, generando el payload de comparación ES/EN para el modal de resolución (`Cancelar` vs `Continuar y Reemplazar Alcance`).

---

## Archivos a Crear / Modificar
- `src/lib/alcanceDomain.ts` *(nuevo)*
- `src/lib/alcanceDomain.test.ts` *(nuevo)*
- `src/lib/certificadoShareDomain.ts`
- `src/lib/certificadoSharePersistence.ts`
- `src/lib/vinculoDomain.ts`
- `src/lib/auditWizardDomain.ts`
- `src/lib/designacionTipoDomain.ts`
- `src/lib/vinculoDomain.test.ts`
- `src/lib/auditWizardDomain.test.ts`
- `src/lib/certificadoShareDomain.test.ts`
- `src/lib/certificadoSharePersistence.test.ts`

---

## Especificación Técnica Detallada

### 1. Entidad y Validación Pura (`src/lib/alcanceDomain.ts`)
1. **`AlcanceCertificadoEntity`:**
   ```ts
   export interface AlcanceCertificadoEntity {
     id: string;
     id_certificado: string; // Propietario del registro alcance
     alcance_es: string; // Obligatorio, sin tope de caracteres
     alcance_en: string | null; // Opcional, sin tope de caracteres
     esCompartido: boolean; // true si este certificado lo consume vía alcance_certificado_compartido
     id_share_link?: string | null;
     origenCertificadoNumero?: string | null;
     sharedTargetCerts?: Array<{ linkId: string; certId: string; numero_certificado: string }>;
     deleted_at?: string | null;
   }
   ```
2. **`AlcanceFormDraft` y `validateAlcanceDraft(draft)`:**
   - Recorta únicamente bordes exteriores (`trim()`) preservando saltos de línea y párrafos internos tanto para textos cortos como largos.
   - Exige `alcance_es.trim().length >= 1` (sin mínimo de 10 chars ni máximo artificial).
   - Normaliza `alcance_en`: si está vacío o solo espacios → `null`; si tiene contenido → se conserva íntegro sin límite máximo.
   - Aplica control `containsRawUuid` Zero-UUID sobre errores y validación segura.
3. **`hasCertificateActiveAlcance(cert)` y `assertCertificateCanGenerateAudits(cert)`:**
   - Verifica que `cert.alcanceDetalle` exista, no esté archivado y tenga `alcance_es.trim().length > 0`.
   - Si no tiene alcance, retorna `{ allowed: false, reason: 'El certificado [N°] no posee un Alcance activo registrado. Registre o comparta un Alcance en español en Certificación → Certificado antes de generar auditorías.' }` (cero UUIDs).

### 2. Planificador de Compartición de `Alcance` y Comparación de Conflictos (`certificadoShareDomain.ts`, `alcanceDomain.ts`)
1. **`planShareAlcance({ sourceCert, selectedTargetCertIds, allCertificates, organizaciones, conglomerados, profile })`:**
   - Reutiliza `getEligibleShareTargetCertificates` para restringir estrictamente al **mismo `Conglomerado` activo** y respetar aislamiento `CLIENT`.
   - Para cada certificado destino seleccionado, clasifica:
     - `conflictStatus: 'SIN_ALCANCE'` → el destino no tiene alcance propio ni compartido; se enlaza directamente.
     - `conflictStatus: 'YA_MISMO_ALCANCE'` → el destino ya comparte exactamente ese mismo `id_alcance` (sin acción destructiva).
     - `conflictStatus: 'CONFLICTO_EXISTENTE'` → el destino ya posee un alcance propio o compartido distinto. Construye **`AlcanceShareConflictItem`** con:
       - `targetCertId`, `targetNumeroCertificado`, `targetOrganizacionNombre`, `targetIsShared`, `targetOriginCertNumero`
       - `incomingScope`: `{ alcance_es, alcance_en, sourceCertNumero }`
       - `existingScope`: `{ alcance_es, alcance_en, originLabel }`
   - Marca `requiresConflictConfirmation = conflicts.length > 0`.
2. **Validación de Decisión:**
   - Si `conflicts.length > 0` y no se recibió confirmación explícita (`confirmOverwrite === true`), el planificador exige abrir el popup comparativo sin ejecutar ninguna escritura.

### 3. Persistencia Transaccional (`src/lib/certificadoSharePersistence.ts`)
- **`persistSaveOwnAlcance(supabase, { certId, alcance_es, alcance_en, existingAlcanceId? })`:** guarda o actualiza directamente el registro único vigente en `public.alcance` (si el certificado tenía un `alcance_certificado_compartido` previo al definir uno propio, lo archiva antes).
- **`persistShareAlcance(supabase, { id_alcance, targetCertIds, replaceExisting })`:**
  - Invoca `fn_compartir_alcance_con_resolucion` vía `.rpc(...)` con fallback transaccional limpio (`archive_record` de alcances/enlaces previos del destino + upsert/insert en `alcance_certificado_compartido`).
  - Traductor Zero-UUID en español para `CONFLICTO_ALCANCE_EXISTENTE`, violación de conglomerado, unique violation `23505` y RLS `42501`.
- **`persistUnlinkSharedAlcance(supabase, shareLinkId)`:** archiva el vínculo `alcance_certificado_compartido` dejando al certificado destino sin alcance.

### 4. Bloqueo de Generación de Auditorías sin `Alcance` (`vinculoDomain.ts`, `auditWizardDomain.ts`, `designacionTipoDomain.ts`)
- Actualizar `CertificateCommitmentSummary` en `vinculoDomain.ts`: agregar `hasAlcance: boolean` y considerar `!hasAlcance` en `canGenerateAudits` (`blockReason` descriptivo en español indicando que el certificado aún no posee `Alcance`). *(Asegurar compatibilidad con objetos ref mínimos donde `alcanceDetalle` no se pase o definiendo bandera explícita en summaries).*
- Actualizar `auditWizardDomain.ts` y `designacionTipoDomain.ts`: impedir avanzar a crear un nuevo programa/auditoría si cualquier certificado del vínculo carece de `Alcance` activo, devolviendo mensaje claro en español con los códigos de certificado sin alcance.

---

## Criterios de Aceptación y Verificación
- Textos cortos (e.g. `"Servicios TI."`) y textos extensos (`> 5000` chars) pasan `validateAlcanceDraft` sin límite de longitud.
- `planShareAlcance` detecta exactamente qué certificados destino tienen conflicto, arma comparación `incomingScope` vs `existingScope` (ES + EN) y bloquea persistencia si `replaceExisting = false`.
- `vinculoDomain` y `auditWizardDomain` permiten certificados/vínculos sin `Alcance`, pero bloquean la generación de auditorías con mensaje claro en español sin UUIDs.
- `node --test src/lib/alcanceDomain.test.ts src/lib/vinculoDomain.test.ts src/lib/auditWizardDomain.test.ts src/lib/certificadoShareDomain.test.ts src/lib/certificadoSharePersistence.test.ts` en verde.
