# Step 1.3 — UI Simplificada de Compartición de Procesos/Requisitos, Mensajería Clara y Wiring en `main.ts`

**Pilar:** 1 (Compartición Simplificada de Procesos y Requisitos)  
**Dependencias:** `step_1.1.md`, `step_1.2.md`  
**Objetivo:** Eliminar la pesada matriz de resolución cruzada de cláusulas en `shareModalView.ts`, mostrar mensajes nítidos comparando norma origen vs destino, permitir compartir proceso + requisitos **juntos y por separado** desde el modal y desde `procesoView.ts`, y mantener sincronizado el estado cliente en `src/main.ts`.

---

## 1. Archivos a Modificar

- `src/views/shareModalView.ts`
- `src/views/procesoView.ts`
- `src/views/certificadoView.ts` (verificar botón `Compartir` en tab Procesos y badge/texto si muestra estado de compartición)
- `src/main.ts` (handlers de modal `shareModal`, handler de sincronización de requisitos en `procesoView`, propagación en `applyProcesoRequirementsToClientState` y `rollbackProcesoRequirementsInClientState`, hidratación de `sincronizar_requisitos`)
- Tests:
  - `src/views/shareModalView.test.ts`
  - `src/views/procesoView.test.ts`
  - `src/views/certificadoView.test.ts`

---

## 2. Especificación Técnica Detallada

### 2.1 Limpieza y Nuevo Paso 3 en `src/views/shareModalView.ts`
- **Estado `ShareModalState`:**
  - Eliminar la necesidad de `clauseSelectionsByPairKey` en la UI (dejarlo deprecado/opcional o removerlo junto con `buildSelectedMapForResolutionPlan` y `resolveSelectedTargetReqIdsForEntry`).
  - Añadir opciones simples en `ShareModalState`:
    - `shareProcesoWithRequisitos: boolean` (default `true`)
    - `syncRequisitosSameNorm: boolean` (default `true`)
- **Reemplazar `renderCrossStandardClauseResolutionPanel` y `renderSingleClauseResolutionEntryRow` por `renderProcesoNormRulePreviewPanel`:**
  - Cuando `kind === 'proceso'` (o cuando `kind === 'sitio'` tiene procesos marcados en cascada):
    - Si existen destinos de la **misma norma** que `sourceCert`:
      - Mostrar un control limpio con checkbox `data-action="toggle-share-proceso-reqs"`:
        - Etiqueta: **"Compartir también las cláusulas normativas y mantenerlas sincronizadas (misma norma)"**
        - Nota corta: si está marcado -> copia y sincroniza los requisitos del proceso en certificados de la misma norma (respetando exclusiones ISO 4.3). Si se desmarca -> comparte solo el proceso vacío para gestionar/compartir requisitos por separado después.
    - Para cada destino seleccionado, renderizar una **tarjeta resumen de 1–2 líneas** (sin listas interminables de cláusulas ni `<select>` de colisiones):
      - **Misma norma (`sameNorm === true`):**
        - Chip verde: `Misma norma (${target.norma_codigo})`
        - Texto claro: *"Se compartirá el proceso junto con N cláusula(s) aplicable(s) y sincronización activa."* (o *"Se compartirá solo el proceso vacío; requisitos independientes."* si el usuario desmarcó el checkbox).
      - **Norma distinta (`sameNorm === false`):**
        - Chip neutro/informativo: `Norma distinta (${sourceCert.norma_codigo} → ${target.norma_codigo})`
        - Mensaje explícito exigido por `future_changes.txt`: *"Los certificados pertenecen a normas distintas. Se compartirá únicamente el proceso vacío (0 requisitos); cada norma mantiene sus cláusulas de forma independiente."*
  - Resultado UX: El modal abre y responde en `< 1ms` aunque el proceso tenga 40 cláusulas y 5 certificados destino.

### 2.2 Compartir / Sincronizar Requisitos por Separado en `src/views/procesoView.ts`
- En la pestaña **Requisitos** del detalle de proceso (`renderProcesoRequisitosTab`):
  - Detectar si el proceso tiene vínculos compartidos en el conglomerado:
    - **Grupo A — Misma norma (`sameNormPeers`):** Mostrar indicador compacto y un botón directo `data-action="sync-shared-proceso-reqs"`:
      - Si está sincronizado: `"Sincronización activa con N cert(s) de ${norma_codigo}"` + botón `"Sincronizar Requisitos Ahora"` (útil si el proceso se compartió inicialmente vacío o si se desea forzar alineación tras quitar una exclusión ISO 4.3).
      - También incluir toggle o acción `"Compartir conjunto de cláusulas"` para activar `sincronizar_requisitos = TRUE` y propagar el set actual hacia los certificados hermanos de la misma norma que lo recibieron vacío.
    - **Grupo B — Norma distinta (`diffNormPeers`):** Mostrar nota breve Zero-UUID:
      - *"Compartido con N cert(s) de otra norma con requisitos independientes (no se mezclan cláusulas entre normas)."*
- En el banner superior del proceso compartido (si aplica), mantener únicamente etiquetas de certificado/norma sin UUIDs.

### 2.3 Wiring y Propagación Reactiva en `src/main.ts`
1. **Hidratación (`loadLiveCertificates`, ~línea 30218):**
   - Actualizar select de `proceso_certificado_compartido` para incluir `sincronizar_requisitos`:
     ```ts
     .from('proceso_certificado_compartido')
     .select('id, id_proceso, id_certificado, sincronizar_requisitos')
     .is('deleted_at', null)
     ```
2. **Eventos del Modal (`#shareModalBackdrop`):**
   - Remover listeners obsoletos `toggle-share-clause-entry` y `change-share-clause-manual`.
   - Agregar listener `input[data-action="toggle-share-proceso-reqs"]` para actualizar `shareProcesoWithRequisitos` y `syncRequisitosSameNorm`.
   - En `confirmShareChildBtn` (`kind === 'proceso'` y `kind === 'sitio'`):
     - Invocar `planShareProcesos(...)` / `planShareSitiosWithCascade(...)` sin `resolveProcesoClausesForTargetCert`.
     - Pasar `sincronizar_requisitos` dentro de `ShareProcesoTargetPayload` a `persistShareProcesos` / `persistShareSitios`.
     - Mostrar toast Zero-UUID claro diferenciando compartición misma norma vs norma distinta.
3. **Mutaciones de Cláusulas en `requisitos_por_proceso` (~líneas 18125, 18415, 18505, 21735):**
   - Al agregar o quitar una cláusula en `procesoView` o cockpit:
     - Usar `getSyncedSameNormPeerCertIds(...)` de `procesoDomain.ts`.
     - En estado optimista cliente (`applyProcesoRequirementsToClientState` / `rollbackProcesoRequirementsInClientState`), propagar la inserción/eliminación también a los certificados hermanos de la **misma norma** con `sincronizar_requisitos = true` (filtrando cláusulas bloqueadas por ISO 4.3 en cada hermano!), y refrescar sus caches de cobertura (`refreshCoverageCachesForCert`).
     - En base de datos, el trigger `trg_sync_req_proceso_same_norm` (del `step_1.1.md`) sincroniza las filas en PostgreSQL automáticamente dentro de la misma operación, y recargamos silenciosamente si hubiera discrepancia por exclusión ISO 4.3.
4. **Handler `data-action="sync-shared-proceso-reqs"`:**
   - Ejecuta `persistSyncProcesoRequisitos(...)`, actualiza estado cliente o llama `loadLiveCertificates()`, refresca coberturas y muestra toast resumen claro.

---

## 3. Checklist de Implementación

1. [ ] Limpiar `ShareModalState` y reemplazar `renderCrossStandardClauseResolutionPanel` por `renderProcesoNormRulePreviewPanel` en `src/views/shareModalView.ts`.
2. [ ] Simplificar sección de cascada de procesos en `renderSitioCascadeStep` (`src/views/shareModalView.ts`) para usar la vista resumen binaria.
3. [ ] Añadir panel/botón compacto de compartición y sincronización de requisitos por misma norma + nota de independencia en norma distinta dentro de `src/views/procesoView.ts`.
4. [ ] Revisar badges de proceso compartido en `src/views/certificadoView.ts` para coherencia visual y Zero-UUID.
5. [ ] Actualizar `src/main.ts` (`loadLiveCertificates`, handlers de `shareModal`, propagación optimista en `applyProcesoRequirementsToClientState` / `rollbackProcesoRequirementsInClientState`, y `sync-shared-proceso-reqs`).
6. [ ] Actualizar y ampliar `src/views/shareModalView.test.ts`, `src/views/procesoView.test.ts` y `src/views/certificadoView.test.ts`.

---

## 4. Criterios de Verificación y Aceptación

- **Tests de vistas (`node:test`):**
  ```bash
  npx tsx --test src/views/shareModalView.test.ts src/views/procesoView.test.ts src/views/certificadoView.test.ts
  ```
- **Aserciones clave en pruebas:**
  - `shareModalView` NO renderiza dropdowns `change-share-clause-manual` ni paneles de colisión semántica.
  - Al seleccionar un certificado destino de la misma norma, aparece el mensaje claro de compartición conjunta (proceso + requisitos) y el checkbox opcional para compartir con/sin requisitos.
  - Al seleccionar un certificado destino de norma distinta, aparece el mensaje claro de proceso vacío (0 requisitos, sin mezcla entre normas).
  - En `procesoView`, un proceso compartido con misma norma expone el control de sincronización/compartición de requisitos; uno compartido solo con norma distinta indica independencia de requisitos.
- **Validación estática:** `npm run lint` y `npm run build` sin errores.
