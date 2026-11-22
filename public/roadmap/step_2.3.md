# Step 2.3 — Dominio Puro: Compartición de `Sitio` en Cascada (`Sitio 0`, `Turnos` y `Procesos ↔ Requisitos`)

## 1. Objetivo y Alcance Estricto
Implementar la lógica pura en TypeScript estricto (`0 any`) para compartir **`Sitio`** entre certificados del mismo **Conglomerado**, resolviendo de forma segura:
1. Colisiones de `numero_sitio` (en especial **`Sitio 0 HQ`**) en el certificado destino.
2. Propagación opcional en cascada de **`turnos_por_sitio`** y **`procesos_por_sitio`** del sitio compartido, enlazando cada proceso seleccionado mediante el resolvedor normativo de `step_2.2.md` (`procesoClauseResolver.ts`) para garantizar que nunca se mezclen requisitos entre normas.
3. Aislamiento por `id_certificado` en `sitioDomain.ts`, `programaCertificadoDomain.ts` y `archiveGovernance.ts`.

**Límites estrictos:**
- **NO** implementar aún llamadas Supabase (`step_2.4.md`) ni vistas UI (`step_3.1.md`, `step_3.2.md`).

---

## 2. Archivos Afectados
- `src/lib/sitioShareDomain.ts` *(nuevo módulo puro)*
- `src/lib/sitioShareDomain.test.ts` *(nueva suite `node:test`)*
- `src/lib/sitioDomain.ts` *(filtrar `procesos_por_sitio` por `cert.id` cuando el sitio sea compartido; soportar `sharedFromCertId` y `canArchiveSitio` considerando comparticiones activas)*
- `src/lib/programaCertificadoDomain.ts` *(asegurar que `4. Proceso` y `5. Turno` sobre sitios compartidos filtren `procesos_por_sitio` activos pertenecientes al `certId` de la auditoría)*
- `src/lib/archiveGovernance.ts` *(actualizar dependencias de `sitio` y `procesos_por_sitio` con comparticiones activas)*

---

## 3. Decisiones Técnicas Detalladas

### 3.1 Resolución de `numero_sitio` y Elegibilidad de `Sitio` (`src/lib/sitioShareDomain.ts`)
1. **`resolveTargetNumeroSitioForSharedSite({ targetCert, preferredNumeroSitio, archivedSiteIds })`:**
   - Recopila todos los `numero_sitio` activos en `targetCert.sitios` (propios y compartidos).
   - Si `targetCert` **no tiene** `Sitio 0` activo y el sitio origen es `Sitio 0` (o si el usuario prefiere asignarlo como HQ cuando el destino está vacío): asigna `0`.
   - Si `targetCert` **ya posee** `Sitio 0` (o ya ocupa el `numero_sitio` original), calcula automáticamente `suggestNextNumeroSitio(targetCert.sitios)` (`max + 1`), permitiendo también edición manual validada mientras no colisione con ningún `numero_sitio` activo del destino.
   - Bloquea compartir un sitio hacia el mismo certificado propietario o hacia un certificado que ya comparte ese mismo `id_sitio`.

### 3.2 Planificación de Cascada de Hijos del Sitio (`planShareSitiosWithCascade`)
Cuando se selecciona compartir el Sitio `S` desde Certificado `X` hacia uno o varios Certificados `Y` del mismo Conglomerado:
1. **Turnos del Sitio (`turnos_por_sitio`):**
   - Por defecto incluye los `id_turno` vinculados activamente en `S` (`S.turnos_por_sitio` / `S.turnos_vinculados`).
   - Como `turnos_por_sitio` está ligado físicamente a `id_sitio` + `id_turno`, el plan asegura:
     - Registrar `turno_certificado_compartido` en `Y` para cada turno propagado que aún no pertenezca a `Y`, haciéndolo visible inmediatamente en `Certificado Y → Turnos` y en `5. Turno` de auditorías sobre `S` en `Y`.
2. **Procesos del Sitio (`procesos_por_sitio`):**
   - Permite al usuario elegir cuáles de los procesos actualmente asignados a `S` en `X` operan también para el sistema de gestión de `Y` (por defecto marcados aquellos seleccionados por el usuario, o ninguno si desea un sitio sin procesos iniciales).
   - **Regla crítica de procesos y normas:**
     - Si un proceso `P` seleccionado de `S` aún **no pertenece** ni está compartido con `Y`:
       - Invoca `resolveProcesoClausesForTargetCert` (`procesoClauseResolver.ts`) entre `X` y `Y` para generar su `ProcesoTargetClauseResolutionPlan`!
       - De este modo, compartir un Sitio desde ISO 9001 hacia ISO 14001 **nunca** salta el resolvedor de cláusulas (`4.4.1/4.4.2 → 4.4`, alerta `8.2`, omisión `8.3`, exclusión ISO 4.3).
     - Si `P` **ya está compartido o ya existe** en `Y`, reutiliza el vínculo existente de `P` en `Y` sin sobrescribir sus cláusulas previas y únicamente agrega el enlace `procesos_por_sitio` con `id_certificado = Y.id`, `id_sitio = S.id`, `id_proceso = P.id`.
   - Devuelve un `SitioShareExecutionPlan` determinista con:
     - `sitioLinksToCreate` (`id_sitio`, `id_certificado`, `numero_sitio`)
     - `turnoCertLinksToCreate` (`id_turno`, `id_certificado`, `id_certificado_origen`)
     - `procesoSharesWithClausePlans` (para resolver/confirmar en UI cuando hay cruce de normas o exclusiones 4.3)
     - `procesosPorSitioToCreate` (`id_certificado`, `id_sitio`, `id_proceso`)

### 3.3 Alcance Estricto por Certificado en `sitioDomain.ts` y `programaCertificadoDomain.ts`
- En `src/lib/multisiteSampling.ts`: añadir `id_certificado?: string` opcional en `ProcesoPorSitioLink`.
- En `src/lib/sitioDomain.ts`:
  - `resolveSitioDetailById({ sitioId, activeCertId?, ... })`: si el sitio está en varios certificados, usar `activeCertId` para escoger el contexto de certificado correcto y filtrar `procesos_por_sitio` donde `(!link.id_certificado || link.id_certificado === cert.id)`.
  - `getAvailableProcesosForSitio` y `validateProcesoPorSitioAssignment`: validar sobre el `cert.procesos` activo del certificado actual (incluyendo procesos propios y procesos compartidos activamente con `cert.id`), y verificar duplicados en `procesos_por_sitio` filtrados por `cert.id`.
  - `canArchiveSitio`: bloquear archivo si `sharedTargetsCount > 0` (indicando cuántos certificados hermanos comparten esta sede), mientras `canUnlinkSitioFromCert` permite desvincular una sede compartida de un certificado destino si no tiene `sitios_por_auditoria` activos en ese certificado.
- En `src/lib/programaCertificadoDomain.ts`:
  - Asegurar que al listar procesos elegibles de un sitio para una auditoría de `certId`, se filtren los `procesos_por_sitio` correspondientes a `certId` (o cuyo proceso pertenezca a `certId`).

---

## 4. Criterios de Aceptación y Verificación
1. **Suite `src/lib/sitioShareDomain.test.ts` (mínimo 10 casos):**
   - Compartir `Sitio 0` de Cert X hacia Cert Y que **ya** tiene su propio `Sitio 0` → asigna `numero_sitio >= 1` automáticamente en Y sin colisión.
   - Compartir `Sitio 0` de Cert X hacia Cert Y **sin** `Sitio 0` → permite `numero_sitio = 0`.
   - Compartir Sitio con 2 turnos y 2 procesos desde ISO 9001 hacia ISO 14001 → genera plan de compartición de turnos + planes de resolución de cláusulas para ambos procesos sin mezclar requisitos 9001 en 14001.
   - Sitio compartido donde Cert X tiene proceso `P_calidad` y Cert Y tiene proceso `P_ambiental`: `resolveSitioDetailById` con `activeCertId = X` solo muestra `P_calidad` y con `activeCertId = Y` solo muestra `P_ambiental`.
   - Guardia que impide desvincular un sitio de Cert Y si Cert Y ya tiene `sitios_por_auditoria` activos sobre esa sede.
2. Ejecutar `npm run lint && npm test` con **100% de éxito**.
