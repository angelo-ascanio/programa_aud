# Roadmap de Implementación Modular — Evolución Bloque 1 (`Auditoría`) y Catálogo `Experto`

Este roadmap desglosa en pasos atómicos, secuenciales e independientemente verificables todas las mejoras especificadas en `public/prompting/future_changes.txt` para `programa_aud` (SPA TypeScript estricta con Vite 6, Tailwind CSS v4, Express 5 y PostgreSQL/Supabase).

---

## 1. Visión General de los 5 Pilares Funcionales

1. **Pilar A — Catálogo `Experto` (`experto_tecnico`) y Asignación Global en `Auditor` + Optimización de Auditores (`Pasos 1.1 – 1.4`):**
   - Nueva sección **`Experto`** en Bloque 2 (`Certificación`), ubicada inmediatamente después de **`Auditor`**.
   - Competencia técnica estricta en **`Sector IAF`** y/o **`Sub-Sector IAF`** (sin normas ISO de sistemas de gestión).
   - Perfil completo con **disponibilidad / estatus operativo** (apto para trabajar o no), **notas**, **teléfonos**, **emails** y competencias IAF.
   - Integración dentro de **Bloque 1 → `Auditor`**: indicador **no bloqueante** cuando algún auditor o todo el equipo auditor carece de competencia sectorial/subsectorial IAF completa; selector de uno o múltiples expertos competentes en los sectores/subsectores IAF presentes en la auditoría o lote vinculado, asignando **días (`0.25d`)** y **observación opcional** a nivel de **toda la auditoría** (nunca por sitio).
   - Reevaluación y optimización de `public.auditor` + `experto_tecnico` en `public/supabase/queries/06_datos_prueba.sql`, sembrando brechas realistas (ej. Sector IAF `13` / Sub-Sector `13.2` + `ISO 45001:2018`) y expertos técnicos asignados.

2. **Pilar B — Reestructuración de Navegación: `Relación` dentro de `Designación` + Simplificación de `Tipo` (`Paso 2.1`):**
   - Mover **`Relación`** como **primer subpaso dentro de `1. Designación`**, antes de `Tipo`:
     - `1. Designación` → `{ Relación, Tipo, Fecha, Sitio, Temporal }`
     - `2. Tiempo`, `3. Auditor`, `4. Proceso`, `5. Turno`, `6. Resultado`, `7. Revisión` + `Resumen`.
   - Simplificar las opciones `<option>` del `<select>` de **`Tipo`** en `Designación → Tipo` y en el Wizard `+ Auditoría`: mostrar únicamente el nombre limpio (`Seguimiento 1`, `Renovación`, `Diagnóstico`, `Especial`, etc.) sin apéndices entre paréntesis como `(Vigilancia)` o `(${t.etapa_ciclo})`.

3. **Pilar C — Multi View Unificada basada en `Organización` + Pop-up Agrupado por Auditoría Vinculada (`Pasos 3.1 – 3.3`):**
   - Aplicado a las **13 secciones**: `Vínculo` (Bloque 2), `Relación`, `Tipo`, `Fecha`, `Sitio`, `Temporal`, `Tiempo`, `Auditor`, `Proceso`, `Turno`, `Resultado`, `Revisión` y `Resumen` (Bloque 1).
   - Multi View basada en **`Organización`**, conservando tarjeta para vista **Grid**, tabla para vista **List**, filtros reactivos laterales y barra única de búsqueda (por organización, certificado, norma, código/codename, etc.).
   - Al hacer clic en una organización (fila o tarjeta), se abre un **Pop-up Modal** que contiene:
     1. **Barra de búsqueda interna** para localizar rápidamente certificados cuando hay muchos.
     2. **Tabla estructurada (`table-fixed`, `<colgroup>` 100%, `0 <button>` en `<tbody>`)**:
        - **Columna 1:** agrupa certificados bajo una misma **auditoría vinculada** (y marca `Individual` cuando aplica).
        - **Columna 2:** lista **1 certificado por fila**.
        - **Columnas siguientes:** información específica relevante al dominio de la sección activa.
   - Al hacer clic en una fila de certificado dentro del pop-up, navega directamente a su **Vista Detalle**.

4. **Pilar D — Nuevo Template Unificado de Vista Detalle ("Less Is More") (`Paso 4.1`):**
   - Rediseño integral del shell de Vista Detalle (`auditSectionShell.ts`, `detailTemplate.ts`, `certificateAuditSelector.ts`, `auditCardBreadcrumb.ts`) para todo Bloque 1:
     - **Zona 1 (Zona de Datos Compacta):** reemplaza la antigua cabecera repetitiva. Muestra botones clicables con navegación directa:
       - Botón **Organización** con su **abreviación** → navega al detalle de Organización, con tooltip `"Organización: <Nombre Completo>"` (prohibido repetir nombre completo y abreviación en texto visible).
       - Botón **Certificado** con la **versión integrada** dentro del mismo botón (ej. `FN-EMS-2025-002 v2`, sin badge externo `v2`) → navega al detalle del Certificado.
       - Acciones a la derecha: `+ Auditoría` y `Historial de Cambios`.
       - Datos/badges esenciales del dominio con **tooltip indicando el nombre del campo** cuando no tengan etiqueta visible (ej. `"Fecha Programada: ..."`, `"Estatus del Certificado: ..."`, `"Código de Auditoría: ..."`), sin fechas duplicadas.
     - **Zona 2 (Fila Única de Selectores):** hasta **2 `<select>` en la misma fila**:
       - `<select>` 1 (Auditorías históricas y actual): opciones breves y representativas (ej. `"2026-01 Renov."`), nunca cadenas largas concatenadas.
       - `<select>` 2 (Certificados vinculados — **condicional**): visible **solo** si la auditoría vinculada agrupa >1 certificado; etiquetas limpias (ej. `"FN-SST-2025-010"`). Oculto en auditorías individuales.
     - **Zona 3 (Core de Dominio):** área limpia, directa y centrada en una sola acción/concepto por sección (`1:1`, `N:1`, `1:N`).

5. **Pilar E — Adopción de Zona 3 "Less Is More" en Secciones Restantes (`Pasos 4.2 – 4.4`) y Cierre Documental/E2E (`Paso Final`):**
   - `Tipo`, `Fecha` y `Sitio` marcan el estándar de simplicidad en Zona 3.
   - Refactorizar `Temporal`, `Tiempo`, `Auditor`, `Proceso`, `Turno`, `Resultado` y `Revisión` al mismo estándar directo y sin fricción.
   - Actualizar `/public/doc/` y ejecutar verificación total en PostgreSQL, Vitest/Node Test, TypeScript, ESLint, Build y Chromium.

---

## 2. Mapa de Ejecución y Dependencias

| Paso | Archivo | Alcance Principal | Depende de |
| :--- | :--- | :--- | :--- |
| **1.1** | `public/roadmap/step_1.1.md` | SQL DDL, triggers, audit log, archive governance, índices y RLS/DCL para `experto_tecnico` (+ teléfonos, emails, sectores/subsectores IAF, asignación global `experto_tecnico_auditoria`). | Base actual |
| **1.2** | `public/roadmap/step_1.2.md` | Revisión de `auditor` vs `experto_tecnico`, optimización de auditores en `06_datos_prueba.sql` (brechas IAF reales como `13`/`13.2` + `ISO 45001`) y semillero idempotente de expertos y asignaciones. | `1.1` |
| **1.3** | `public/roadmap/step_1.3.md` | Dominio TS, persistencia, navegación (después de `Auditor`) y Multi/Detail View de `Certificación → Experto`. | `1.1`, `1.2` |
| **1.4** | `public/roadmap/step_1.4.md` | Indicador no bloqueante de brecha IAF en equipo auditor + asignación global de Experto Técnico (días + observación opcional) dentro de Bloque 1 `Auditor`. | `1.2`, `1.3` |
| **2.1** | `public/roadmap/step_2.1.md` | Mover `Relación` dentro de `1. Designación` (antes de `Tipo`), renumerar `2..7 + Resumen` y simplificar `<option>` de `Tipo`. | Base actual |
| **3.1** | `public/roadmap/step_3.1.md` | Dominio y renderer compartido del Multi View por `Organización` + Pop-up Modal con búsqueda y tabla agrupada (Col 1: auditoría vinculada, Col 2: certificado por fila, Col 3+: dominio). | `2.1` |
| **3.2** | `public/roadmap/step_3.2.md` | Adoptar Multi View por `Organización` + Pop-up en `Vínculo` y `1. Designación` (`Relación`, `Tipo`, `Fecha`, `Sitio`, `Temporal`). | `3.1` |
| **3.3** | `public/roadmap/step_3.3.md` | Adoptar Multi View por `Organización` + Pop-up en `2. Tiempo`, `3. Auditor`, `4. Proceso`, `5. Turno`, `6. Resultado`, `7. Revisión` y `Resumen`. | `1.4`, `3.1` |
| **4.1** | `public/roadmap/step_4.1.md` | Rediseñar Template Unificado de Vista Detalle (Zona 1 Datos compactos sin repetición + Zona 2 2 selectores en 1 fila) y validar en `Relación`, `Tipo`, `Fecha`, `Sitio`, `Resumen`. | `2.1`, `3.2` |
| **4.2** | `public/roadmap/step_4.2.md` | Refactorizar Zona 3 ("Less Is More") para `1.5 Temporal` y `2. Tiempo`. | `3.2`, `3.3`, `4.1` |
| **4.3** | `public/roadmap/step_4.3.md` | Refactorizar Zona 3 ("Less Is More") para `3. Auditor` (conservando expertos globales + alerta brecha IAF), `4. Proceso` y `5. Turno`. | `1.4`, `3.3`, `4.1` |
| **4.4** | `public/roadmap/step_4.4.md` | Refactorizar Zona 3 ("Less Is More") para `6. Resultado` y `7. Revisión`. | `3.3`, `4.1` |
| **Final** | `public/roadmap/step_final.md` | Actualización de `/public/doc/project_resume.md` y `/public/doc/architecture/*.md` + Reset DB + Suite completa + Playwright Chromium (4 roles, desktop/mobile). | Todos |

---

## 3. Reglas Transversales e Invariantes (Obligatorias en Todos los Pasos)

- **TypeScript Estricto:** `strict: true` con **cero `any`** (`: any`, `as any`, `<any>`).
- **Zero-UUID Policy:** Nunca exponer UUIDs crudos en `textContent`, labels, tooltips, selects, tablas o mensajes de error al usuario (`src/lib/zeroUuid.ts`).
- **Idioma Español 100%:** Toda etiqueta visible, placeholder, tooltip, badge, alerta y mensaje de error debe estar en español natural y claro.
- **RBAC de 4 Roles (`ADMIN`, `WORKER`, `AUDITOR`, `CLIENT`):**
  - Solo `ADMIN` y `WORKER` aprobados mutan catálogos (`experto_tecnico`, competencias IAF) y planificación/ejecución según reglas vigentes.
  - `AUDITOR` en solo lectura salvo ejecución de hallazgos/fechas reales cuando esté asignado.
  - `CLIENT` estrictamente en solo lectura con aislamiento **Nivel 2** (`authorizedClientOrgIds` / `cliente_acceso_organizacion`).
- **Integridad de Tablas y Layout:**
  - Todas las tablas de Multi View y tablas dentro de Pop-up usan `table-fixed`, `<colgroup>` cuyas columnas suman exactamente `100%`, **0 elementos `<button>` dentro de `<tbody>`**, y un único `<input>` de búsqueda por Multi View (o dentro del Pop-up).
  - Respetar Soft-Delete (`deleted_at IS NULL`) en todas las consultas y cálculos de dominio.
- **Reconstrucción SQL desde Cero:** Los scripts en `public/supabase/queries/` (`00` → `07`) deben poder ejecutarse en un reset limpio y permitir una segunda ejecución idempotente de `06_datos_prueba.sql`.

---

## 4. Criterios Generales de Validación por Paso

Cada paso se considera terminado únicamente cuando cumple:
1. Sus **archivos objetivo** reflejan exactamente los criterios de aceptación descritos.
2. Sus **pruebas unitarias** (`npx tsx --test ...`) pasan al 100%.
3. El proyecto compila y valida sin errores (`npx tsc --noEmit`, `npm run lint`, `npm run build`).
4. En pasos con SQL (`1.1`, `1.2`, `Final`), la ejecución secuencial `00` → `07` + re-ejecución de `06_datos_prueba.sql` completa sin errores.
5. En pasos UI (`1.3`, `1.4`, `2.1`, `3.2`, `3.3`, `4.1`–`4.4`, `Final`), se valida en navegador real que no haya desbordes horizontales, botones dentro de `<tbody>`, UUIDs visibles ni regresiones RBAC.
