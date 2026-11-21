# Step 8.1 — Simplificación de `6. Resultado` (`+15d/+45d` Popup) y `7. Revisión`

## 1. Objetivo y Alcance
Descomprimir y simplificar drásticamente **`Resultado`** (Paso 6) y **`Revisión`** (Paso 7) siguiendo exactamente `public/prompting/future_changes.txt`:
1. **`6. Resultado` (`#/auditorias/resultado`):**
   - **Multi View:** Basada en **Certificados**, incluyendo un botón compacto **`⚙ Plazos NC`** en la barra de acciones de la Multi View que abre un **popup sencillo** para configurar los desplazamientos por defecto de **`Plan` (`+15` días)** y **`Cierre` (`+45` días)** persistidos en `configuracion_alerta_auditoria`.
   - **Detail View (`auditSectionShell`, selector `◀ / ▶` únicamente):** Limpiar el ruido actual y mostrar **únicamente 2 bloques claros**:
     - **Bloque A — Fechas Reales Auditadas (`auditoria_fecha` `tipo_fecha = 'REAL'`):** Lista limpia de fechas exactas discretas con acción simple de agregar una fecha exacta (`<input type="date">`) y remover cualquiera existente (`archive_record`), permitiendo registrar múltiples días sueltos o consecutivos (ej. `2026-11-18`, `2026-11-19`, `2026-11-20`).
     - **Bloque B — No Conformidades (`hallazgo`):** Agregar nueva NC seleccionando la **cláusula específica de la norma auditada (`id_requisito`)** (sin exigir proceso, aprovechando `id_proceso NULL` del Step 1.1) + descripción/tipo. A partir de la **última fecha real auditada** (`MAX(fecha_real)`), calcular automáticamente:
       - **`Fecha Límite Plan`** = `última fecha real + dias_limite_plan_nc` (default `+15` días)
       - **`Fecha Límite Cierre`** = `última fecha real + dias_limite_cierre_nc` (default `+45` días)
     - Dentro de cada NC por separado, capturar las **fechas reales de ejecución**: **`Fecha Real Plan`** (`fecha_plan_accion`) y **`Fecha Real Cierre`** (`fecha_cierre_real`), indicando si entregó/cerró en tiempo o vencida.
     - **Restricción explícita de `future_changes.txt`:** Las fechas límite o de vencimiento de `Plan` y `Cierre` **NO** deben generar eventos en `Calendario`; viven exclusivamente en `Resultado` y `Resumen`.
2. **`7. Revisión` (`#/auditorias/revision`):**
   - **Multi View:** Basada en **Certificados**.
   - **Detail View (`auditSectionShell`, selector `◀ / ▶` únicamente):** Ultra simple y directa:
     - Campo **`Fecha de Revisión`** (`fecha_revision`, `<input type="date">`)
     - Campo opcional **`Comentario / Observaciones`** (`resumen_revision`, `<textarea>`)
     - Botón **`Guardar Revisión`** (visible para `ADMIN`/`WORKER`; solo lectura para `AUDITOR`/`CLIENT`).

---

## 2. Archivos y Áreas Afectadas
- `src/lib/auditAlertsEngine.ts` (soporte de `dias_limite_plan_nc: 15` y `dias_limite_cierre_nc: 45` sin generación de eventos calendario para NCs)
- `src/lib/resultadoDomain.ts` (cálculo puro de `MAX(fecha_real)`, plazos `+Plan / +Cierre` por NC, simplificación de creación NC con `id_requisito` sin proceso obligatorio, y estado `COMPLETO / PENDIENTE` de `Resultado`)
- `src/views/resultadoView.ts` (Multi View basada en Certificados + Popup de configuración `+15d / +45d` + Detail View estrictamente de 2 bloques)
- `src/lib/revisionDomain.ts` (simplificación de validación de guardado: `fecha_revision` requerida + `resumen_revision` opcional)
- `src/views/revisionView.ts` (Multi View basada en Certificados + Detail View minimalista `fecha_revision` + `comentario`)
- `src/main.ts` (handlers de agregar/archivar fechas `REAL` discretas, alta/actualización de NCs con `fecha_plan_accion`/`fecha_cierre_real`, popup de plazos `configuracion_alerta_auditoria`, y guardado simplificado de `Revisión`)
- `src/lib/auditExecution.test.ts`, **`src/lib/resultadoDomain.test.ts`**, **`src/lib/revisionDomain.test.ts`**

---

## 3. Tareas Detalladas de Implementación

### 3.1 `6. Resultado` (`resultadoDomain.ts` + `resultadoView.ts`)
- **Multi View (Certificate-Based):**
  - Columnas `table-fixed` (`<colgroup>` = `100%`):
    - `Certificado & Org`
    - `Última Auditoría` (`tipo`, `última fecha real o programada`)
    - `Fechas Reales` (`X días` o `'Sin registrar'`)
    - `No Conformidades` (`X abiertas / Y cerradas` o `'0 NCs'`)
    - `Estado Resultado` (`Pendiente` / `Con NCs Abiertas` / `Completo ✓`)
  - Botón en toolbar/header de tarjeta (nunca en `<tbody>`): **`⚙ Plazos NC (+15d / +45d)`**.
  - Al pulsar `⚙ Plazos NC`, abrir modal sencillo con 2 inputs numéricos (`Días para Plan de Acción` default `15`; `Días para Cierre de NC` default `45`) y botón `Guardar Configuración` (`UPDATE configuracion_alerta_auditoria`).
- **Detail View (`auditSectionShell`, `◀ / ▶` únicamente):**
  - **Bloque 1 — Fechas Reales Auditadas:**
    - Pills/lista cronológica de fechas exactas registradas (`YYYY-MM-DD` / formato legible `DD/MM/YYYY`), ej. `18/11/2026`, `19/11/2026`, `20/11/2026` con `×` (para `ADMIN`/`WORKER`/`AUDITOR` asignado) para archivar (`archive_record`).
    - Mini-form horizontal: `<input type="date" id="resultadoNewRealDate">` + botón **`+ Agregar Fecha Real`** (permitiendo agregar una a una de forma instantánea y recalcular inmediatamente los vencimientos `+Plan / +Cierre` a partir de `MAX(fecha_real)`).
  - **Bloque 2 — No Conformidades (`hallazgo`):**
    - Si hay fechas reales cargadas, mostrar barra resumen superior: *"Última fecha real: [DD/MM/YYYY] · Límite Plan (+15d): [DD/MM/YYYY] · Límite Cierre (+45d): [DD/MM/YYYY]"*. (Si aún no hay fecha real, avisar con claridad que las fechas límite se calcularán al registrar al menos 1 fecha real).
    - Formulario limpio **`+ Nueva No Conformidad`**:
      - `<select>` de **Cláusula de la Norma** filtrado estrictamente por la norma del certificado de esa auditoría (`requisito.norma === audit.norma_codigo`, mostrando `codigo + titulo` sin UUIDs).
      - Selector compacto `Tipo / Gravedad` (`NC Mayor`, `NC Menor`) y `<textarea>` breve de hallazgo/evidencia.
    - Lista de tarjetas de cada NC registrada (una tarjeta por NC):
      - Muestra cláusula (`codigo - titulo`), tipo, descripción y fechas límite esperadas (`Plan: [fecha]` · `Cierre: [fecha]`).
      - Controles individuales por NC para capturar/editar sus fechas reales de cumplimiento:
        - `Fecha Real Plan` (`<input type="date">`, `fecha_plan_accion`)
        - `Fecha Real Cierre` (`<input type="date">`, `fecha_cierre_real`)
        - Botón `Guardar fechas NC` (y estado visual automático: `Plan pendiente`, `En ejecución de cierre`, `Cerrada ✓`, `Vencida`).
- **Nota explícita de Calendario:** Verificar en `calendarioView.ts` / `auditAlertsEngine.ts` que ningún plazo de `Plan` ni `Cierre` genere eventos automáticos dentro del calendario.

### 3.2 `7. Revisión` (`revisionDomain.ts` + `revisionView.ts`)
- **Multi View (Certificate-Based):**
  - Columnas `table-fixed` (`<colgroup>` = `100%`):
    - `Certificado & Org`
    - `Última Auditoría`
    - `Fecha de Revisión` (`DD/MM/YYYY` o `'Pendiente'`)
    - `Estado` (`Pendiente` / `Revisada ✓`)
- **Detail View (`auditSectionShell`, `◀ / ▶` únicamente):**
  - Eliminar formularios complejos o checklist pesados heredados si entorpecen el flujo; mostrar:
    1. Resumen compacto de contexto de la auditoría (`Tipo`, fechas reales, total NCs cerradas/abiertas).
    2. Input **`Fecha de Revisión`** (`<input type="date" id="revisionDateInput">`, requerido al guardar).
    3. Textarea **`Comentario de Revisión (Opcional)`** (`<textarea id="revisionCommentInput">`).
    4. Botón **`Guardar Revisión`** (actualiza `fecha_revision` y `resumen_revision` en `public.auditoria`, compatible con trigger actualizado en Step 1.1).

---

## 4. Lista de Verificación
- [ ] `Resultado` Multi View opera por Certificados y posee popup funcional `⚙ Plazos NC` (`+15d Plan` / `+45d Cierre`).
- [ ] `Resultado` Detail View muestra solo los 2 bloques: Fechas Reales exactas (add/remove) y NCs por cláusula (`id_requisito`) con fechas individuales `Plan` y `Cierre` reales y límites calculados desde la última fecha real.
- [ ] Plazos NC (`Plan`/`Cierre`) NO generan eventos en `Calendario`.
- [ ] `Revisión` Multi View opera por Certificados y su Detail View se limita a `fecha_revision` + comentario opcional + guardar.
- [ ] RBAC respetado (`AUDITOR` solo muta ejecución en auditorías asignadas; `CLIENT` solo lectura en sus orgs; `ADMIN`/`WORKER` acceso operativo completo) y tests pasando.
