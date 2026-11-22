# Step 2.2 — Dominio Puro: Motor de Resolución de Conflictos Normativos `Proceso ↔ Requisito` entre Estándares y Cobertura

## 1. Objetivo y Alcance Estricto
Construir el motor determinista de resolución de cláusulas normativas (**`src/lib/procesoClauseResolver.ts`**) que permite compartir cualquier **`Proceso`** entre certificados del mismo **Conglomerado** —incluso bajo normas ISO distintas (p. ej. **ISO 9001 → ISO 14001**, **ISO 9001 → ISO 45001**, **ISO 14001 → ISO 9001**, **ISO 9001 → ISO/IEC 27001**)— resolviendo conflictos de granularidad, colisiones semánticas, cláusulas inexistentes y exclusiones ISO 4.3, e integrarlo en `coverageEngine.ts` y `procesoDomain.ts`.

**Límites estrictos:**
- **NO** implementar aún la cascada de `Sitio` (`step_2.3.md`), persistencia (`step_2.4.md`) ni UI (`step_3.1.md` / `step_3.2.md`).

---

## 2. Archivos Afectados
- `src/lib/procesoClauseResolver.ts` *(nuevo módulo puro)*
- `src/lib/procesoClauseResolver.test.ts` *(nueva suite `node:test`)*
- `src/lib/multisiteSampling.ts` *(soporte de mapa por certificado en `ProcessEntity`: `requisitos_by_certificado?: Record<string, { clausulas_cubiertas: string[]; requisitos_detalle?: ProcessRequirementMapping[] }>`)*
- `src/lib/coverageEngine.ts` *(lectura por certificado en `collectActiveProcessLinks` y `previewNonApplicableSmartMutation` / `applyNonApplicableSmartMutationToState`)*
- `src/lib/procesoDomain.ts` *(resolución de `ProcesoDetailEntity` por `activeCertId`, verificación `canArchiveProceso` con comparticiones activas)*
- `src/lib/coverageEngine.test.ts` y `src/lib/procesoDomain.test.ts` *(casos adicionales de procesos compartidos entre normas distintas y Smart Mutation aislada)*

---

## 3. Decisiones Técnicas Detalladas

### 3.1 Registro de Concordancia HLS (Annex SL) y Detección de Colisiones Semánticas (`procesoClauseResolver.ts`)
1. **Clasificación de Estados de Resolución (`ClauseResolutionStatus`):**
   - `'EXACT_SAME_NORM'`: Misma `id_norma` (o mismo código normalizado de norma) y misma cláusula activa en destino (`preselected = true`).
   - `'HIERARCHICAL_ROLLUP'`: La cláusula origen es más granular que la norma destino y asciende por jerarquía de código/LTREE dentro de capítulos estructuralmente compatibles (ej. **ISO 9001 `4.4.1` y `4.4.2` → ISO 14001 `4.4`**). Deduplica múltiples subcláusulas colapsadas hacia el mismo padre destino, registra todas las cláusulas origen agrupadas (`sourceClauses: ['4.4.1', '4.4.2']`) y deja `preselected = true`.
   - `'HIERARCHICAL_ROLLDOWN'`: La cláusula origen es padre general en una norma y la norma destino exige/ofrece el padre o sus subcláusulas hijas (ej. **ISO 14001 `4.4` → ISO 9001 `4.4`** con nota informativa de cobertura descendente `<@` sobre `4.4.1` y `4.4.2`, o expansión opcional si no existe nodo `4.4` suelto).
   - `'HLS_EQUIVALENT'`: Cláusulas estructurales del Marco Armonizado ISO (capítulos `4.1`, `4.2`, `4.3`, `5.1`, `5.2`, `5.3`, `6.1`, `6.2`, `6.3`, `7.1`, `7.2`, `7.3`, `7.4`, `7.5`, `9.1`, `9.2`, `9.3`, `10.1`, `10.2`, `10.3`) cuya compatibilidad temática entre normas está validada en el registro HLS y cuya similitud de título supera el umbral de seguridad (`preselected = true`, mostrando título origen y título destino).
   - `'SEMANTIC_COLLISION'`: Mismo código de cláusula en origen y destino, pero **distinto significado normativo**. Reglas explícitas obligatorias:
     - **Tabla explícita de colisiones conocidas entre disciplinas ISO:** especialmente **`8.2`** (`ISO 9001: Requisitos para los productos y servicios` ≠ `ISO 14001/45001: Preparación y respuesta ante emergencias` ≠ `ISO/IEC 27001: Evaluación de riesgos de seguridad de la información`), **`8.3`** (`ISO 9001: Diseño y desarrollo` ≠ `ISO 27001: Tratamiento de riesgos` / `ISO 45001: Contratación/diseño SST`), **`8.1`** (cuando cambia radicalmente el enfoque operacional, marcado al menos con revisión cuidadosa o alerta informativa), **`7.1.x`**.
     - **Red de seguridad dinámica (para normas importadas por CSV):** comparar tokens normalizados de título/descripción (`normalizeSearchToken` sin stopwords). Si el código coincide en capítulo `8` o subcláusulas técnicas y la similitud semántica entre títulos es baja (sin pertenecer al núcleo HLS común), clasificar obligatoriamente como `'SEMANTIC_COLLISION'`.
     - **Comportamiento seguro:** **`preselected = false`**, exige decisión explícita del usuario (confirmar destino, sustituir por otra cláusula del catálogo destino o dejar sin vincular).
   - `'NO_EQUIVALENT'`: La cláusula origen **no existe** en la norma destino (ej. **ISO 9001 `8.3` hacia ISO 14001**, o **ISO/IEC 27001 `A.11.2.6` hacia ISO 9001**). **`preselected = false`**, se omite limpiamente y permite seleccionar opcionalmente una cláusula sustituta de `targetNormaReqs`.
   - `'EXCLUDED_ISO43'`: La cláusula destino sugerida está bloqueada en `targetCert` por `requisitos_no_aplicables_certificado` (directa o vía LTREE `<@`). **`disabled = true`, `preselected = false`**, mostrando el código y justificación de la exclusión ISO 4.3.

2. **Funciones Puras Exportadas en `procesoClauseResolver.ts`:**
   - `resolveProcesoClausesForTargetCert({ proceso, sourceCert, targetCert, requirementsCatalog, archivedNoAplicableIds })`: devuelve `ProcesoTargetClauseResolutionPlan` con:
     - `isCrossStandard: boolean`
     - `entries: ClauseResolutionEntry[]` (cada entrada incluye `sourceClauses`, `targetCandidate`, `status`, `preselected`, `disabled`, `warningMessage`, `blockingExclusionCodigo`)
     - `summaryCounts`: `{ autoMappedCount, hierarchicalCount, semanticCollisionCount, noEquivalentCount, excludedIso43Count }`
     - `availableManualTargetOptions`: catálogo ordenado de cláusulas válidas (no excluidas por ISO 4.3) de `targetCert.id_norma` para asignación manual opcional.
   - `buildFinalTargetRequisitoIds({ resolutionPlan, selectedTargetReqIdsByEntryKey, extraManualTargetReqIds })`: valida contra `canLinkRequisitoToProceso` en `targetCert`, deduplica IDs finales de `requisito` pertenecientes estrictamente a `targetCert.id_norma`, y ordena jerárquicamente padre-antes-de-hijo para persistencia segura.

### 3.2 Actualización de `coverageEngine.ts` y `procesoDomain.ts`
1. **`coverageEngine.ts`**:
   - En `collectActiveProcessLinks`: para cada proceso `proc` dentro de `cert`, leer preferentemente `proc.requisitos_by_certificado?.[cert.id]` cuando exista, con fallback a `proc.clausulas_cubiertas` / `proc.requisitos_detalle` cuando el proceso es propio o ya hidratado para ese certificado.
   - En `applyNonApplicableSmartMutationToState`: al podar cláusulas por exclusión ISO 4.3 en `targetCertId`, actualizar únicamente `requisitos_by_certificado[targetCertId]` (y `clausulas_cubiertas` del objeto `cert` correspondiente a `targetCertId`) sin tocar jamás los requisitos del proceso en otros certificados compartidos.
2. **`procesoDomain.ts`**:
   - Actualizar `resolveProcesoDetailById({ procesoId, activeCertId?, certificates, ... })`: si `activeCertId` se provee, prioriza la entrada de `certificates` con `cert.id === activeCertId` para mostrar las cláusulas, hallazgos y auditorías correspondientes a **ese certificado específico**.
   - Actualizar `canArchiveProceso`: bloquear archivado si `sharedCertsCount > 0` además de hallazgos o auditorías activas.

---

## 4. Criterios de Aceptación y Verificación
1. **Suite `src/lib/procesoClauseResolver.test.ts`:**
   - Misma norma (`ISO 9001 → ISO 9001`): mapeo directo 1:1, bloqueando automáticamente cláusula excluida por ISO 4.3 en destino.
   - Granularidad jerárquica (`ISO 9001 [4.4.1, 4.4.2] → ISO 14001`): produce una sola sugerencia `'HIERARCHICAL_ROLLUP'` hacia `4.4` (sin duplicados), preseleccionada.
   - Granularidad inversa (`ISO 14001 [4.4] → ISO 9001`): sugiere `'HIERARCHICAL_ROLLDOWN'` hacia `4.4` en ISO 9001.
   - Colisión semántica (`ISO 9001 [8.2] → ISO 14001`): clasificada como `'SEMANTIC_COLLISION'`, **`preselected = false`**, exponiendo título origen (*Productos y servicios*) vs destino (*Preparación y respuesta ante emergencias*). Mismo control para `ISO 9001 [8.2] → ISO/IEC 27001`.
   - Cláusula inexistente (`ISO 9001 [8.3] → ISO 14001` y `ISO 27001 [A.11.2.6] → ISO 9001`): clasificada como `'NO_EQUIVALENT'`, **`preselected = false`**, sin errores ni bloqueo, permitiendo sustitución manual con cláusula de la norma destino.
   - Verificación estricta de que `buildFinalTargetRequisitoIds` jamás devuelve un `id_requisito` de una `id_norma` ajena a `targetCert`.
2. **Pruebas de Cobertura (`coverageEngine.test.ts`):**
   - Proceso `P` compartido entre Cert X (9001) y Cert Y (14001) evalúa cobertura 100% independiente en cada certificado.
   - Smart Mutation por exclusión en Cert Z (9001) poda `(P, Z)` sin alterar `(P, X)`.
3. Ejecutar `npm run lint && npm test` con **100% de éxito**.
