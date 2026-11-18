# Step Final: Verificación Integral, Pruebas Automatizadas (`node:test`) y Compuertas de Calidad

## 1. Objetivo
Ejecutar la validación completa de extremo a extremo tras finalizar los Steps `1.1` a `4.2`: integridad de esquema SQL y políticas RLS sobre los datos CSV reales, suites unitarias en `node:test`, auditoría estática (`tsc --noEmit`, `0 any`, Zero-UUID, Clean List), build de producción y verificación interactiva en navegador Chromium (`1440x900` y `390x844`).

---

## 2. Verificación SQL, CSV y RLS

### 2.1 Conteos y Unicidad en Base de Datos
Ejecutar verificación contra PostgreSQL/Supabase después de aplicar `01_creacion.sql`, `03_indices_optimizacion.sql`, `04_rls.sql` y `07_normas_requisitos_csv.sql`:
- `SELECT COUNT(*) FROM public.norma WHERE deleted_at IS NULL;` → **8 normas**.
- `SELECT COUNT(*) FROM public.requisito WHERE deleted_at IS NULL;` → **2,188 cláusulas** (distribución exacta: `iso9001_2015`: 350, `iso14001_2015`: 205, `iso45001_2018`: 307, `iso22000_2018`: 480, `iso27001_2022`: 167, `ntf4073_2022`: 138, `iso17065_2012`: 307, `iso50001_2018`: 234).
- `SELECT COUNT(*) FROM public.requisito_traduccion WHERE deleted_at IS NULL;` → **2,684 traducciones** (`1,342` en `'es'`, `1,342` en `'en'`).
- Verificar que los 11 códigos reparados (`3.10`, `3.20`, `3.30`, `3.40`, `7.10`) coexisten sin colisiones en `uq_requisito_norma_codigo_active`.
- Verificar que `cobertura_normativa_certificado(<id_certificado>)` sigue operando correctamente con los árboles `LTREE` completos.

### 2.2 Verificación de Seguridad RLS y Soft-Delete
- Confirmar que `DELETE FROM public.requisito_traduccion` falla para `anon` y `authenticated` (`REVOKE DELETE` + `fn_prevent_hard_delete()`).
- Confirmar que `CLIENT`, `AUDITOR` y `PENDING_WORKER` pueden hacer `SELECT` de traducciones activas pero reciben error RLS al intentar `INSERT` o `UPDATE` en `requisito` o `requisito_traduccion`.
- Confirmar que `ADMIN` y `WORKER` aprobados registran entradas en `public.audit_log` al editar traducciones.

---

## 3. Suite de Pruebas Unitarias (`npx --yes tsx --test src/lib/*.test.ts`)

Ampliar y ejecutar las suites existentes más nuevas pruebas dedicadas:
1. **`requisitoCsvImporter.test.ts` (nueva):**
   - Parseo de 2,188 filas de `standard.clause.csv` y 2,684 filas de `standard.clause.translation.csv` sin errores.
   - Reparación exacta de los 11 códigos con cero final truncado (`3.10`, `3.20`, `3.30`, `3.40`, `7.10`).
   - Validez de sintaxis `LTREE` en los 2,188 nodos hasta profundidad 7 y preservación de UUIDs históricos `f0000000-...`.
2. **`clauseRenderer.test.ts` (nueva):**
   - Sanitización XSS (`<script>`, `onclick=`, `javascript:`, `<iframe/>` removidos; `<a href="https://...">` recibe `rel="noopener noreferrer"`).
   - Expansión recursiva multinivel de `{clause_...}` (ej. `1 -> 1.a`, `4.4 -> 4.4.1 -> 4.4.1.a`) en `ES` y `EN`.
   - Guardia anti-ciclos determinista (`cycleDetected: true`).
   - Degradación segura para placeholders faltantes (`{clause_9.1.3}`) y contenido vacío (`iso45001_2018` `3.2` ES → fallback a EN con aviso).
   - Indexador `collectClauseIndexText` para búsquedas en español e inglés.
3. **`richTextEditor.test.ts` (nueva):**
   - `insertTextAtCursor` y `buildChildPlaceholderSuggestions` (orden numérico, detección `alreadyInserted`, exclusión de archivados).
   - `normalizeEditorHtmlOutput` sanitizando HTML de usuario.
4. **Actualización de Suites Transversales (`extraDomain.test.ts`, `detailViewsPhase42.test.ts`, `phase421DetailTemplate.test.ts`, `phase62UiIntegrity.test.ts`, `step1Primitives.test.ts`):**
   - Verificar que `Norma` Detail View abre en pestaña `Requisitos`, muestra solo Nivel 1 por defecto y filtra cross-level al recibir `normaRequisitoQuery`.
   - Verificar toggle `ES` / `EN` / `Lado a Lado`, vecinos, padre/hijos y botón `Ir a Norma` en `requisitoView`.
   - Verificar `renderDetailFormTopActions` (Guardar `bg-emerald-600` antes que Cancelar `bg-rose-50`), cero `<button>` en `<tbody>`, `<colgroup>` sumando `100%`, `assertZeroUuidExposure` y bloqueo RBAC para no-staff.

---

## 4. Auditoría Estática y Compuertas CLI

Ejecutar y confirmar **0 errores**:
- `npx --yes tsx --test src/lib/*.test.ts` → **100% PASS**.
- `npm run lint` (`tsc --noEmit`) → **0 errores** y **0 usos de `any`** en `src/`.
- Auditoría estática (`grep`):
  - Cero botones en `<tbody>` en `normaView.ts` y `requisitoView.ts`.
  - Cero botones guardar/cancelar al pie del `<form>` en Zona 2.
  - Cero `window.alert` / `window.prompt` / `window.confirm`.
  - Cero UUIDs crudos expuestos en UI o placeholders.
- `npm run build` → compilación Vite de producción exitosa.

---

## 5. Verificación Visual e Interactiva en Chromium (`playwright-cli`)

### 5.1 Flujos E2E como `ADMIN` / `WORKER` (`1440x900` y `390x844`)
1. **Norma Multi View:** confirmar las 8 normas visibles, conteo real de cláusulas (`350`, `480`, `167`, `138`...), facetas reactivas sin desbordamiento horizontal (`scrollWidth <= clientWidth`).
2. **Norma Detail (`ISO 9001:2015` y `ISO 22000:2018`):**
   - Confirmar pestaña `Requisitos` activa por defecto mostrando únicamente capítulos Nivel 1 (`1`..`10`).
   - Buscar `5.1.2` y `leadership` / `liderazgo` en `#normaRequisitoSearchInput` y verificar resultados multinivel inmediatos.
3. **Requisito Detail (`'read'`):**
   - Abrir cláusula `1` o `4.4` de `ISO 9001:2015`: verificar placeholders `{clause_...}` expandidos visualmente.
   - Alternar `ES`, `EN` y `Lado a Lado` comprobando contraste y legibilidad.
   - Probar navegación de vecinos (`Siguiente →` / píldora hermana), enlace a Cláusula Padre, salto a Sub-cláusula y retorno en un clic mediante `Ir a Norma` (sin bucles en breadcrumb).
4. **Autoría In-App en Norma sin Traducción (`ISO/IEC 27001:2022` o `NTF 4073:2022`):**
   - Abrir cláusula con hijos directos en modo `'edit'`.
   - Redactar en `ES` e `EN` usando el Rich Text HTML Editor, insertar hijo directo mediante botón `{ }` y mediante trigger `{`, previsualizar en `Vista Previa`, guardar desde cabecera y comprobar persistencia + `showFloatingToast`.
5. **Verificación RBAC (`CLIENT` / `AUDITOR`):**
   - Verificar que el botón de edición `✏️`, creación `+`, y editor enriquecido no están disponibles, manteniendo lectura bilingüe limpia.
6. **Consola y Red:** cero excepciones no controladas ni respuestas HTTP 400/403 inesperadas.
