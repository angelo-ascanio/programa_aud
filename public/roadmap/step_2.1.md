# Step 2.1 — Dominio Puro: Elegibilidad en Conglomerado y Compartición de `Contacto` y `Turno`

## 1. Objetivo y Alcance Estricto
Implementar la lógica de dominio pura en TypeScript estricto (`strict: true`, `0 any`) para calcular certificados elegibles dentro del mismo **Conglomerado (`grupo_empresarial`)** y resolver la compartición/desvinculación de **`Contacto`** (`contacto_certificado`) y **`Turno`** (`turno` + `turnos_por_sitio`), junto con sus validaciones, resguardos de archivo y batería completa de pruebas unitarias (`node:test`).

**Límites estrictos:**
- **NO** implementar aún el resolvedor normativo de `Proceso ↔ Requisito` (`step_2.2.md`), cascada de `Sitio` (`step_2.3.md`), persistencia Supabase (`step_2.4.md`) ni vistas UI (`step_3.1.md`).

---

## 2. Archivos Afectados
- `src/lib/multisiteSampling.ts` *(extensión de interfaces de solo lectura/metadatos de compartición en `ContactoCertificadoEntity`, `ShiftEntity`, `CertificadoDetailEntity` sin romper campos existentes)*
- `src/lib/certificadoShareDomain.ts` *(nuevo módulo puro)*
- `src/lib/certificadoShareDomain.test.ts` *(nueva suite `node:test`)*
- `src/lib/certificadoSubEntities.ts` *(soporte de contexto de certificado compartido en `resolveContactoDetailById` y `canArchiveContacto`)*
- `src/lib/turnoDomain.ts` *(soporte de compartición y `canArchiveTurno` considerando `turno_certificado_compartido`)*
- `src/lib/archiveGovernance.ts` *(soporte de resumen de dependencias para comparticiones activas de contacto y turno, y allowlist de las 4 tablas `*_compartido`)*

---

## 3. Decisiones Técnicas Detalladas

### 3.1 Contratos de Datos y Aislamiento (`src/lib/multisiteSampling.ts` & `src/lib/certificadoShareDomain.ts`)
1. Definir metadatos ligeros y opcionales de compartición (compatibles con semillas e hidratación parcial):
   ```ts
   export type ShareableChildKind = 'contacto' | 'turno' | 'proceso' | 'sitio';

   export interface CertificateShareLinkRef {
     linkId: string;
     targetCertId: string;
     targetNumeroCertificado?: string;
     targetOrganizacionNombre?: string;
     targetNormaCodigo?: string;
     numeroSitioAsignado?: number;
   }
   ```
   - En `ContactoCertificadoEntity`, `ProcessEntity`, `SiteEntity`, `ShiftEntity`: campos opcionales `ownerCertId?: string`, `sharedFromCertId?: string | null`, `sharedFromCertLabel?: string | null` (sanitizado para `CLIENT`), y `sharedTargets?: CertificateShareLinkRef[]`.
2. **`getEligibleShareTargetCertificates(params)`**:
   - Recibe `sourceCert`, `allCertificates`, `organizaciones`, `conglomerados`, y opcionalmente `profile` / `authorizedClientOrgIds`.
   - Encuentra `sourceOrg` y valida que tenga `id_grupo_empresarial` activo (`hasOrganizationValidConglomerado`). Si la organización no pertenece a un conglomerado activo, retorna `[]` con razón descriptiva (`missingConglomeradoReason`).
   - Filtra `allCertificates` donde:
     - `!c.deleted_at` y `c.id !== sourceCert.id`
     - `targetOrg` activa con `targetOrg.id_grupo_empresarial === sourceGroupId`
     - Aplica filtro de visibilidad RBAC si se consulta en contexto no-staff: para `ADMIN` y `WORKER` aprobados incluye todos los certificados elegibles del conglomerado; para `CLIENT` solo devuelve certificados cuya organización esté en `authorizedClientOrgIds` (nunca expone certificados de empresas hermanas sin autorización Nivel 2).
   - Valida todo UUID mediante `isValidUuid()` / `assertValidUuid()` de `src/lib/zeroUuid.ts` (regla Zero-UUID).

### 3.2 Compartición Pura de `Contacto` (`planShareContactos`)
- Entrada: `sourceCert`, `selectedContactoIds`, `targetCertIds`, `allCertificates`, `organizaciones`, `conglomerados`.
- Reglas de negocio validadas deterministamente:
  - Verifica que al menos 1 contacto y 1 certificado destino estén seleccionados.
  - Excluye el certificado propietario del contacto (`contacto.ownerCertId || contacto.id_certificado`).
  - Detecta si el contacto ya está compartido activamente con `targetCert` → marcado como `ALREADY_SHARED` (omitido de nuevas inserciones sin error).
  - Detecta colisión de nombre normalizado (`LOWER(TRIM(nombre))`) contra contactos activos propios o ya compartidos en `targetCert` → produce conflicto claro `DUPLICATE_CONTACT_NAME` (sin UUIDs crudos, indicando el nombre del contacto y código de certificado destino).
  - Devuelve plan estructurado: `toCreateLinks`, `alreadyShared`, `conflicts`, `isExecutable`.
- **Desvinculación (`canUnlinkContactoFromCert`)**: solo permite desvincular de un certificado cuando `certId !== ownerCertId` (en el certificado propietario se archiva, en el certificado receptor se desvincula).

### 3.3 Compartición Pura de `Turno` (`planShareTurnos`)
- Entrada: `sourceCert`, `selectedTurnoIds`, `targetCertIds`, `autoLinkTargetSites` (`boolean`, por defecto `true` hacia `Sitio 0 HQ` o sedes activas disponibles en destino), `allCertificates`, `organizaciones`, `conglomerados`.
- Reglas:
  - Resuelve `id_turno` canónico de cada turno seleccionado de `sourceCert.turnos`.
  - Genera `certLinksToCreate` (`turno_certificado_compartido`: `{ id_turno, id_certificado: targetCertId, id_certificado_origen: sourceCert.id }`) omitiendo los ya vinculados.
  - Si `autoLinkTargetSites === true` y `targetCert.sitios` posee sedes activas (priorizando `Sitio 0` / o todas las sedes seleccionadas si se provee mapa opcional `targetSiteIdsByCertId`), genera `turnosPorSitioToCreate` omitiendo pares `(id_sitio, id_turno)` ya existentes.

### 3.4 Actualización de Resolución de Detalle y Gobernanza de Archivo
- En `src/lib/certificadoSubEntities.ts`:
  - `resolveContactoDetailById`, `resolveTelefonoDetailById`, `resolveEmailDetailById`: soportar `activeCertContextId` opcional para mostrar el contexto del certificado desde el cual se abrió el contacto compartido (respetando `ownerCertId` vs certificado vinculado).
  - `canArchiveContacto`: además de verificar teléfonos y correos activos, bloquear si `sharedTargetsCount > 0` con mensaje claro Zero-UUID.
- En `src/lib/turnoDomain.ts`:
  - `resolveTurnoDetailById`: mantener resolución across all sites (propios y compartidos).
  - `canArchiveTurno`: bloquear cuando `assignedSitiosCount > 0 || sharedCertificatesCount > 0`.
- En `src/lib/archiveGovernance.ts`:
  - Registrar las 4 tablas `*_compartido` en la lista de tablas soft-delete soportadas y actualizar `resolveArchiveDependenciesClientSide` para `contacto_certificado` y `turno`.

---

## 4. Criterios de Aceptación y Verificación
1. **Suite `src/lib/certificadoShareDomain.test.ts` (mínimo 12 casos):**
   - Elegibilidad estricta dentro del mismo Conglomerado (certificados de otro conglomerado rechazados).
   - Aislamiento `CLIENT` Nivel 2: un cliente autorizado solo en Org A no recibe certificados de Org B en `getEligibleShareTargetCertificates`.
   - Escenario literal de `future_changes.txt`: Contactos "A", "B", "C" en X → compartir "A" y "B" con "Y", dejando "C" exclusivo en "X".
   - Prevención de auto-compartición, duplicados idempotentes y detección de colisión de nombre en destino.
   - Compartición de `Turno` con y sin asignación automática a `Sitio 0` del certificado destino.
   - Guardias de archivado cuando existen vínculos compartidos activos y validación Zero-UUID en todos los mensajes de error.
2. Ejecutar `npm run lint && npm test` con **0 errores TypeScript** y **100% de tests pasando**.
