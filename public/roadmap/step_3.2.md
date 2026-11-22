# Step 3.2 — Interfaz de Usuario: `Compartir` en `Proceso` y `Sitio` con Resolución Visual de Requisitos entre Normas

## 1. Objetivo y Alcance Estricto
Completar la interfaz de usuario para **`Proceso`** y **`Sitio`** en `certificadoView.ts`, `shareModalView.ts`, `procesoView.ts`, `sitioView.ts` y `src/main.ts`, exponiendo de manera clara, sencilla y visual:
- Botón **`Compartir`** en `Certificado → Procesos` y `Certificado → Sitios` (solo `ADMIN` / `WORKER`).
- Panel guiado de **Resolución de Requisitos por Norma Destino** cuando un `Proceso` (o un `Sitio` con procesos seleccionados) se comparte hacia un certificado bajo una norma diferente o con exclusiones ISO 4.3.
- Selección segura de cascada de `Turnos` y `Procesos` + asignación de `numero_sitio` en **`Compartir Sitios`**.
- Contexto por certificado y desvinculación segura en `procesoView.ts` y `sitioView.ts`.

**Límites estrictos:**
- **NO** modificar todavía `public/doc/` (corresponde a `step_final.md`).
- Respetar `table-fixed`, `<colgroup>` = `100%`, `0 <button>` en `<tbody>`, Zero-UUID y aislamiento Nivel 2 `CLIENT`.

---

## 2. Archivos Afectados
- `src/views/shareModalView.ts` *(extensión para modos `'proceso'` y `'sitio'` con panel de resolución normativa)*
- `src/views/shareModalView.test.ts` *(tests adicionales para `9001 → 14001`, `4.4.1/4.4.2 → 4.4`, alerta `8.2`, omisión `8.3` y cascada `Sitio`)*
- `src/views/certificadoView.ts` *(botón `Compartir` en `renderProcesosChildTab` y `renderSitiosChildTab`, chips informativos no interactivos de compartido en `<tbody>`)*
- `src/views/procesoView.ts` *(lectura de requisitos scoped al `activeCertId`, ocultando cláusulas de otras normas, badge de compartición seguro según RBAC y botón `Desvincular` para staff)*
- `src/views/sitioView.ts` *(mostrar `numero_sitio` contextual, `procesos_por_sitio` filtrados por `activeCertId`, badge compartido RBAC-seguro y botón `Desvincular` para staff)*
- `src/main.ts` *(manejo completo de eventos del modal de resolución de cláusulas y cascada de sitios, llamadas a `persistShareProcesos` / `persistShareSitios` / `persistUnlinkSharedChild`, recálculo automático de cobertura normativa HUD tras compartir)*

---

## 3. Decisiones Técnicas Detalladas

### 3.1 Modal `Compartir Procesos` con Resolución Normativa Guiada (`shareModalView.ts`)
1. **Paso 1 y Paso 2 (Simple por defecto):**
   - Seleccionar proceso(s) origen del Certificado X y certificado(s) destino "Y" del mismo Conglomerado.
   - Si todos los destinos comparten **la misma norma** y no tienen bloqueos ISO 4.3, muestra un resumen verde compacto: `"Compatibilidad directa (misma norma): se vincularán sus cláusulas aplicables automáticamente"`.
2. **Panel "Resolución de Requisitos por Norma Destino" (cuando aplica cruce de normas o exclusiones 4.3):**
   - Renderiza un bloque por cada `(Proceso × Certificado Destino)` con norma distinta o exclusiones, agrupando visualmente las filas del plan generado por `resolveProcesoClausesForTargetCert`:
     - **Mapeo Equivalente / Jerárquico (`EXACT_SAME_NORM`, `HLS_EQUIVALENT`, `HIERARCHICAL_ROLLUP`, `HIERARCHICAL_ROLLDOWN`):**
       - Checkbox **marcado por defecto**.
       - Ejemplo visual claro: `4.4.1, 4.4.2 (ISO 9001:2015) → 4.4 Sistema de gestión ambiental (ISO 14001:2015)` con badge `Mapeo Jerárquico`.
     - **Conflicto Semántico (`SEMANTIC_COLLISION`):**
       - Banner ámbar de advertencia y checkbox **desmarcado por defecto**.
       - Comparación lado a lado obligatoria: ej. `Origen: 8.2 Requisitos para los productos y servicios` **≠** `Destino: 8.2 Preparación y respuesta ante emergencias`, con selector desplegable opcional para sustituir por otra cláusula válida de la norma destino (ej. `8.1`) o dejar desmarcado.
     - **Sin Equivalencia en Norma Destino (`NO_EQUIVALENT`):**
       - Badge gris neutro: ej. `8.3 Diseño y desarrollo — No existe en ISO 14001:2015 (Omitida automáticamente)`, más selector opcional `"Asignar cláusula equivalente manual (opcional)"` si el usuario desea vincular otro requisito de destino.
     - **Excluida por ISO 4.3 en Destino (`EXCLUDED_ISO43`):**
       - Fila bloqueada (`disabled`) en tono rosa indicando la cláusula excluyente en el certificado destino.

### 3.2 Modal `Compartir Sitios` con Cascada Segura (`shareModalView.ts`)
- Paso 1: Seleccionar `Sitio(s)` de Certificado X (con indicador `Sitio 0 (HQ)` o `Sede #N`).
- Paso 2: Seleccionar Certificado(s) destino "Y" del mismo Conglomerado, mostrando preview automático del **`N° Sede asignado en destino`** (por ejemplo: `"Se asignará como Sede #1 porque [Certificado Y] ya tiene Sitio 0"` o `"Se asignará como Sitio 0 (HQ)"` si Y no tiene HQ).
- Paso 3 (Opcional, colapsable/simple):
  - **Propagar Turnos del Sitio** (checkboxes pre-marcados de `turnos_por_sitio` asociados al sitio).
  - **Propagar Procesos del Sitio** (checkboxes de `procesos_por_sitio` asociados al sitio; si se marcan procesos que aún no existen en un destino de distinta norma, **reutiliza inline el mismo sub-panel de Resolución de Requisitos por Norma Destino** para evitar mezclar cláusulas).

### 3.3 Detalle de `Proceso` y `Sitio` (`procesoView.ts`, `sitioView.ts`) & Recálculo Vivo
- En `procesoView.ts`:
  - Recibir/mantener `activeCertId` para mostrar **únicamente** la norma, requisitos vinculados (`requisitos_por_proceso` de `activeCertId`), hallazgos y auditorías correspondientes al certificado desde el cual se abrió el proceso.
  - Al añadir/quitar cláusulas dentro de `proceso-tab-requisitos` en Certificado Y, operar exclusivamente sobre `(id_proceso, id_certificado = Y)` sin alterar X.
  - Mostrar badge de compartición (sanitizado para `CLIENT` sin filtrar orgs hermanas) y botón **`Desvincular de este certificado`** para `ADMIN`/`WORKER` cuando `activeCertId !== ownerCertId`.
- En `sitioView.ts`:
  - Mostrar `numero_sitio` correspondiente a `activeCertId` y procesos filtrados por `id_certificado = activeCertId`.
  - Mostrar badge de compartición sanitizado para `CLIENT` y botón **`Desvincular de este certificado`** para `ADMIN`/`WORKER` (protegido si ya existen `sitios_por_auditoria` activos en ese certificado).
- En `src/main.ts`:
  - Tras confirmar `Compartir Proceso`, refrescar el reporte `resumen_cobertura_certificado` / `coverageEngine` del certificado destino para que su HUD de cobertura normativo refleje al instante las nuevas cláusulas resueltas.

---

## 4. Criterios de Aceptación y Verificación
1. **Tests de Vista (`src/views/shareModalView.test.ts` + `procesoView` / `sitioView`):**
   - `cert-tab-procesos` y `cert-tab-sitios` renderizan botón `Compartir` solo para `ADMIN`/`WORKER` y mantienen `0 <button>` en `<tbody>`.
   - El modal en modo `proceso` (ISO 9001 → ISO 14001) renderiza `4.4.1 / 4.4.2 → 4.4` marcado, `8.2` con advertencia semántica **desmarcado**, y `8.3` como omitido sin equivalencia.
   - El modal en modo `sitio` muestra el `numero_sitio` resuelto sin colisionar `Sitio 0` y renderiza resolución de cláusulas cuando incluye procesos hacia otra norma.
   - `CLIENT` y `AUDITOR` no visualizan controles de mutación ni metadatos de certificados de organizaciones no autorizadas.
2. Ejecutar `npm run lint && npm test && npm run build` con **0 errores**.
