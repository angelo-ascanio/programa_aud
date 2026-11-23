# Step 1.2 — Dominio Pure TypeScript y Persistencia Transaccional para Compartición Binaria de Procesos y Requisitos

**Pilar:** 1 (Compartición Simplificada de Procesos y Requisitos)  
**Dependencias:** `step_1.1.md`  
**Objetivo:** Reemplazar la lógica lenta de mapeo semántico cruzado por un planificador determinista y rápido basado exclusivamente en la igualdad de norma (`id_norma`), soportando compartir proceso + requisitos **juntos y por separado**, tanto en compartición directa de procesos como en cascada desde sitios.

---

## 1. Archivos a Modificar

- `src/lib/multisiteSampling.ts` (añadir campo opcional `sincronizar_requisitos?: boolean` en `CertificateShareLinkRef` si aplica)
- `src/lib/certificadoShareDomain.ts` (nuevo planificador binario de compartición de procesos y requisitos `planShareProcesos` / `planSyncProcesoRequisitos`)
- `src/lib/procesoClauseResolver.ts` (simplificar/deprecar resolución cruzada pesada; mantener wrappers seguros solo si algún módulo legado los importa o migrar directamente a `certificadoShareDomain.ts`)
- `src/lib/sitioShareDomain.ts` (sustituir llamada a `resolveProcesoClausesForTargetCert` en cascada de sitios por la regla binaria de norma)
- `src/lib/certificadoSharePersistence.ts` (persistir `sincronizar_requisitos`, soportar `persistSyncProcesoRequisitos`, hidratar `sincronizar_requisitos` en `assembleSharedCertificateCollections`)
- `src/lib/procesoDomain.ts` (helpers puros para detectar hermanos sincronizados de misma norma vs independientes de norma distinta)
- Tests:
  - `src/lib/certificadoShareDomain.test.ts`
  - `src/lib/certificadoSharePersistence.test.ts`
  - `src/lib/sitioShareDomain.test.ts`
  - `src/lib/procesoClauseResolver.test.ts`
  - `src/lib/procesoDomain.test.ts`

---

## 2. Especificación Técnica Detallada

### 2.1 Regla Binaria Determinista en `src/lib/certificadoShareDomain.ts`
Definir tipos y funciones puras (`0 any`):

```typescript
export type ProcessShareMode = 'PROCESS_AND_REQS_SYNC' | 'PROCESS_ONLY_INDEPENDENT';

export interface PlanProcesoTargetOutcome {
  id_proceso: string;
  nombre_proceso: string;
  id_certificado_origen: string;
  id_certificado_destino: string;
  target_numero_certificado: string;
  target_norma_codigo: string;
  sameNorm: boolean;
  mode: ProcessShareMode;
  sincronizar_requisitos: boolean;
  requisitoIds: string[];
  excludedByIso43Codes: string[];
  summaryMessage: string; // Zero-UUID, claro para el usuario
}
```

- **`planShareProcesos(params)`:**
  - Para cada `(proceso, targetCert)`:
    1. Validar que pertenecen al mismo conglomerado activo (`getEligibleShareTargetCertificates`), que no sea autoshare, que no esté duplicado por nombre ni ya vinculado en `targetCert`.
    2. Comparar norma: `const sameNorm = sourceCert.id_norma.trim() === targetCert.id_norma.trim();`
    3. **Caso `sameNorm === true`:**
       - Evaluar parámetro `shareWithRequisitos: boolean` (default `true` cuando es misma norma, pero permite `false` para compartir **por separado**, i.e., primero el proceso y luego los requisitos).
       - Si `shareWithRequisitos === true`:
         - Obtener los `RequisitoLtree` correspondientes a `proceso.clausulas_cubiertas` / `requisitos_detalle` bajo `sourceCert.id_norma`.
         - Filtrar únicamente los bloqueados por `requisitos_no_aplicables_certificado` de `targetCert` usando `isClauseBlockedByCertificateExclusions` / `canLinkRequisitoToProceso`.
         - Establecer `sincronizar_requisitos = Boolean(syncRequisitosWithSameNorm)` (default `true` cuando se comparten juntos).
         - Mensaje claro: `"Misma norma (${sourceCert.norma_codigo}): se compartirá el proceso con ${requisitoIds.length} cláusula(s) aplicable(s)${excluded.length > 0 ? ` (${excluded.length} omitida(s) por exclusión ISO 4.3 en destino)` : ''}."`
       - Si `shareWithRequisitos === false`:
         - `requisitoIds = []`, `sincronizar_requisitos = false`.
         - Mensaje claro: `"Misma norma (${sourceCert.norma_codigo}): se compartirá solo la estructura del proceso (sin requisitos por ahora); podrá sincronizar cláusulas luego."`
    4. **Caso `sameNorm === false`:**
       - Ignorar `shareWithRequisitos` / forzar determinísticamente:
         - `requisitoIds = []`
         - `sincronizar_requisitos = false`
         - `mode = 'PROCESS_ONLY_INDEPENDENT'`
       - Mensaje claro: `"Norma distinta (${sourceCert.norma_codigo} → ${targetCert.norma_codigo}): se compartirá únicamente el proceso vacío (0 requisitos). Las cláusulas se asignan por separado en cada norma."`

- **`planSyncProcesoRequisitos(params)` (Compartir/Sincronizar Requisitos por Separado):**
  - Dado un proceso compartido entre certificados `[C_src, C_tgt1, C_tgt2, ...]`:
    - Filtra solo certificados destino con **`c.id_norma === sourceCert.id_norma`** (misma norma).
    - Calcula `requisitoIdsToInsert` (presentes en `sourceCert`, ausentes en `targetCert`, no excluidos por ISO 4.3 en `targetCert`) y `requisitoIdsToRemove` (opcional cuando `replaceMode = 'MIRROR'`).
    - Devuelve advertencia Zero-UUID informando cuántos certificados de norma distinta permanecen independientes sin tocar.

### 2.2 Simplificación de `src/lib/sitioShareDomain.ts`
- En `planShareSitiosWithCascade`:
  - Cuando un sitio compartido arrastra procesos marcados por el usuario (`candidateProcessesForCascade`):
  - Eliminar el uso de `resolveProcesoClausesForTargetCert` y `buildFinalTargetRequisitoIds`.
  - Usar la nueva función binaria determinista de `certificadoShareDomain.ts` (`sameNorm ? copy applicable reqs & sync=true : empty reqs [] & sync=false`).
  - Reducir `ProcesoCascadeSharePlan` a incluir directamente `sameNorm`, `sincronizar_requisitos`, `requisitoIds`, `excludedByIso43Codes` y `summaryMessage` (sin `resolutionPlan` complejo ni `requiresUserConfirmation` por colisiones semánticas).

### 2.3 Deprecación Limpia de `src/lib/procesoClauseResolver.ts`
- Verificar si algún otro módulo fuera de `shareModalView.ts`, `sitioShareDomain.ts` y `main.ts` importa `procesoClauseResolver.ts` (validado en auditoría previa: solo esos 3 módulos + `procesoClauseResolver.test.ts`).
- Reemplazar o aligerar sus exportaciones para delegar a la regla binaria simple (eliminando la heurística lenta de tokens/colisiones HLS en tiempo de UI), o marcarlo `@deprecated` mientras `procesoClauseResolver.test.ts` se actualiza/simplifica para validar exclusivamente:
  - Misma norma -> copia directa filtrando ISO 4.3
  - Norma distinta -> siempre `0` requisitos e independiente.

### 2.4 Persistencia Transaccional & Hidratación en `src/lib/certificadoSharePersistence.ts`
- **En `persistShareProcesos`:**
  - Aceptar `sincronizar_requisitos?: boolean` por enlace en `ShareProcesoTargetPayload`.
  - Al insertar/reactivar en `proceso_certificado_compartido`, incluir `sincronizar_requisitos: Boolean(link.sincronizar_requisitos)` tanto en `insertPayload` como en `restorePayload`.
  - Si `link.requisitoIds.length > 0`, persistir `requisitos_por_proceso` exactamente como ahora (con rollback compensatorio vía `archive_record` en caso de error).
- **Nueva función `persistSyncProcesoRequisitos(supabase, params)`:**
  - Invoca `supabase.rpc('fn_sync_shared_process_requisitos', ...)` cuando el RPC está disponible en PostgreSQL, con fallback transaccional seguro sobre `proceso_certificado_compartido.update({ sincronizar_requisitos })` + `requisitos_por_proceso` upsert/delete para entornos test/offline mockeados.
  - Si `mirrorMode` falla parcialmente, traduce error con `translateShareDbError` (Zero-UUID).
- **En `assembleSharedCertificateCollections` (`procesosCompartidosRows`):**
  - Leer `Boolean(link.sincronizar_requisitos)` y adjuntarlo a `CertificateShareLinkRef` (`sharedTargets`) y al mapa de origen compartido para que la UI sepa en todo momento qué enlaces están sincronizados en requisitos y cuáles son independientes.

### 2.5 Helpers en `src/lib/procesoDomain.ts`
- Añadir `getSyncedSameNormPeerCertIds({ procesoId, activeCertId, certificates })`: devuelve los IDs de certificados vinculados al proceso que comparten **la misma `id_norma`** y tienen `sincronizar_requisitos = true` (para reflejo optimista instantáneo en estado cliente al editar cláusulas).

---

## 3. Checklist de Implementación

1. [ ] Actualizar `CertificateShareLinkRef` en `src/lib/multisiteSampling.ts` con `sincronizar_requisitos?: boolean`.
2. [ ] Implementar `planShareProcesos` y `planSyncProcesoRequisitos` en `src/lib/certificadoShareDomain.ts` (0 `any`, Zero-UUID).
3. [ ] Refactorizar `src/lib/sitioShareDomain.ts` para usar la regla binaria en `planShareSitiosWithCascade` sin `resolveProcesoClausesForTargetCert`.
4. [ ] Limpiar/simplificar `src/lib/procesoClauseResolver.ts` eliminando la resolución semántica lenta entre normas distintas.
5. [ ] Actualizar `persistShareProcesos`, agregar `persistSyncProcesoRequisitos` y propagar `sincronizar_requisitos` en `assembleSharedCertificateCollections` dentro de `src/lib/certificadoSharePersistence.ts`.
6. [ ] Agregar `getSyncedSameNormPeerCertIds` en `src/lib/procesoDomain.ts`.
7. [ ] Actualizar y ampliar las pruebas unitarias (`certificadoShareDomain.test.ts`, `certificadoSharePersistence.test.ts`, `sitioShareDomain.test.ts`, `procesoClauseResolver.test.ts`, `procesoDomain.test.ts`).

---

## 4. Criterios de Verificación y Aceptación

- **Tests unitarios (`node:test`):**
  ```bash
  npx tsx --test \
    src/lib/certificadoShareDomain.test.ts \
    src/lib/certificadoSharePersistence.test.ts \
    src/lib/sitioShareDomain.test.ts \
    src/lib/procesoClauseResolver.test.ts \
    src/lib/procesoDomain.test.ts
  ```
- **Casos obligatorios cubiertos:**
  1. Compartir proceso entre `ISO 9001 → ISO 9001`: comparte proceso + cláusulas aplicables + excluye cláusulas bloqueadas por ISO 4.3 en destino + `sincronizar_requisitos = true`.
  2. Compartir proceso entre `ISO 9001 → ISO 9001` con `shareWithRequisitos = false`: comparte solo el proceso vacío + `sincronizar_requisitos = false`, y luego `planSyncProcesoRequisitos` permite compartir/sincronizar los requisitos por separado.
  3. Compartir proceso entre `ISO 9001 → ISO 14001`: comparte únicamente el proceso, `requisitoIds = []`, `sincronizar_requisitos = false`, sin intentar mapear cláusulas entre normas.
  4. Cascada desde Sitio hacia cert misma norma vs norma distinta aplica exactamente la misma regla binaria.
  5. Rollback compensatorio intacto si falla la inserción de `requisitos_por_proceso`.
- **Compilación estricta:** `0 any` en todos los archivos tocados.
