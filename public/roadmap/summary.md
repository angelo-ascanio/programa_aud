# Hoja de Ruta Maestra — Evolución Bloque 1 (`Auditoría`), `Conglomerado` y `Resumen`

> **Origen de especificación:** `public/prompting/future_changes.txt`  
> **Arquitectura objetivo:** `programa_aud` (TypeScript estricto `0 any`, PostgreSQL/Supabase con Soft-Delete & RLS, patrón canónico Multi View / Detail View en `public/certificado/*`).

---

## 1. Visión General de Cambios

Esta hoja de ruta traduce de forma incremental, modular y verificable cada transformación funcional y de experiencia de usuario solicitada en `public/prompting/future_changes.txt`:

1. **Bloque 1 (`Auditoría`) — Navegación y Estructura:**
   - Reordenamiento del menú superior de Bloque 1: **`Calendario`** y **`Vínculo`** al inicio seguidos de un **separador visual**, y a continuación el flujo de campaña/auditoría: **`Designación`** *(hover lateral izquierda/derecha con cierre automático al salir del bloque)* `>` (`Tipo`, `Fecha` *(nuevo)*, `Sitio`, `Temporal`), **`Tiempo`**, **`Auditor`** *(antes `Asignación`)*, **`Proceso`** y **`Turno`** *(división de `Programa`)*, **`Resultado`**, **`Revisión`** y **`Resumen`** *(nuevo)*.
   - **Breadcrumb In-Card exclusivo de Detail Views:** Se elimina la barra externa superior (`renderAuditPipelineStepper`) y se traslada **dentro de la tarjeta principal** únicamente en las **Detail Views** (nunca en Multi Views, ni en `Calendario`, ni en `Vínculo`). Empieza en **`1. Designación`** *(expande subsecciones en hover a la derecha)*, sigue con `2. Tiempo`, `3. Auditor`, `4. Proceso`, `5. Turno`, `6. Resultado`, `7. Revisión`, y cierra con **`Resumen`** visualmente separado del track secuencial 1–7.
   - **Persistencia de auditoría seleccionada:** Cambiar de auditoría dentro de una Detail View (por defecto la más reciente, o moverse con flechas `◀ / ▶`) se mantiene intacto al saltar entre secciones mediante el Breadcrumb In-Card.
   - **Botón persistente `+ Auditoría` + Wizard de 3 Fases:** Presente en todas las vistas basadas en Certificado para crear lotes vinculados de auditorías (`Conglomerado` → `Vínculo` → `Tipo` por certificado) y redirigir inmediatamente a `Designación → Tipo`.

2. **Reorganización de Flujo por Entidad Base:**
   - **`Conglomerado` (`Certificación`):** Tabs renombradas a **`Organizaciones`** (corrigiendo conteo real de certificados, filtro de selector solo para organizaciones aisladas `SOLO`, y desvinculación/separación segura desde conglomerado) y **`Auditorías`** (orden descendente más reciente primero, columna `estatus_auditoria` automática y navegación directa a `Resumen`).
   - **`Vínculo` (Many-to-One sobre Conglomerado):** Multi View centrada en **`Conglomerado`**; Detail View interactiva por **Cajas Agrupadoras** (`LIBRE` + Cajas con `Naturaleza`, etiqueta y `sitio_temporal`), soportando patrones multi-empresa y multi-sitio encadenados, sin children zone y con navegación directa de cada certificado a su `Resumen`.
   - **Secciones `1..7` + `Resumen` (Certificate-Based):** Todas las Multi Views operan sobre **Certificados**; al entrar al detalle se selecciona primero la auditoría (por defecto la más reciente) con navegación **`◀ / ▶`** *(y selector adicional entre auditorías vinculadas únicamente en `Designación → Tipo` y `Designación → Sitio`)*.
   - **Simplificaciones clave:**
     - `Designación → Fecha` y `Designación → Temporal` sincronizan fechas programadas y sitio temporal a todo el lote vinculado.
     - `Programa` se divide en **`4. Proceso`** (con *"Seleccionar todos por sitio"*) y **`5. Turno`** (matriz anti-fatiga por sitio × turnos habilitados del sitio + propagación a homónimos).
     - `Resultado` se reduce estrictamente a **2 bloques**: fechas reales exactas (`add/remove`) y No Conformidades (`id_requisito` + plazos configurables `+15d Plan` / `+45d Cierre` mediante popup en Multi View, **sin generar eventos en Calendario**).
     - `Revisión` se simplifica a fecha de revisión (`fecha_revision`) + comentario opcional.
     - `Resumen` concentra el estado de cada sección y calcula automáticamente **`estatus_auditoria`** evaluando pasos en paralelo.

---

## 2. Matriz de Impacto Arquitectónico

| Capa | Archivos / Módulos Clave Impactados |
| :--- | :--- |
| **PostgreSQL / Supabase** | `public/supabase/queries/01_creacion.sql`, `03_indices_optimizacion.sql`, `04_rls.sql`, `06_datos_prueba.sql` |
| **Navegación & RBAC** | `src/lib/healthCheck.ts`, `src/lib/accessControl.ts`, `src/lib/breadcrumb.ts`, `src/views/header.ts`, `src/views/auditoriasView.ts` |
| **Dominios Puros (`src/lib/`)** | `conglomeradoDomain.ts`, `vinculoDomain.ts`, `auditPlanningEngine.ts`, `designacionTipoDomain.ts`, **`designacionFechaDomain.ts` (nuevo)**, `designacionSitioDomain.ts`, `designacionTemporalDomain.ts`, `tiempoDomain.ts`, `asignacionDomain.ts`, `programaCertificadoDomain.ts`, `turnoDomain.ts`, `resultadoDomain.ts`, `revisionDomain.ts`, **`resumenDomain.ts` (nuevo)**, `auditAlertsEngine.ts`, `pipelineEngine.ts`, **`auditWizardDomain.ts` (nuevo)** |
| **Vistas UI (`src/views/`)** | `conglomeradoView.ts`, `vinculoView.ts`, `designacionTipoView.ts`, **`designacionFechaView.ts` (nuevo)**, `designacionSitioView.ts`, `designacionTemporalView.ts`, `tiempoView.ts`, `asignacionView.ts`, `programaProcesosView.ts`, `programaTurnosView.ts`, `resultadoView.ts`, `revisionView.ts`, **`resumenView.ts` (nuevo)**, `calendarioView.ts`, **`auditWizardModal.ts` (nuevo)**, `detailTemplate.ts` |
| **Orquestador & Estado** | `src/main.ts` (persistencia de selección `certId + auditId`, handlers del Wizard, cajas de `Vínculo`, matriz de `Turno`, popup NC, etc.) |
| **Documentación** | `public/doc/project_resume.md`, `public/doc/architecture/*.md` *(actualizado exclusivamente en `step_final.md`)* |

---

## 3. Reglas e Invariantes Obligatorios en Todos los Pasos

1. **Zero-UUID Invariant:** Ningún UUID v4 crudo ni prefijo técnico puede renderizarse en UI, atributos visibles, mensajes de error o `<select>` labels visibles (`src/lib/zeroUuid.ts`).
2. **Contratos Canónicos (`public/certificado/`):**
   - Multi Views vía `renderUniversalTemplate` con `table-fixed`, `<colgroup>` sumando **`100%`**, single `✕` en búsqueda (`type="text"`), facetas reactivas y toggle `grid | list`.
   - **Cero `<button>` dentro de `<tbody>`:** Las filas operan mediante clic de fila o controles fuera de `<tbody>` (toolbars, drawers, paneles interactivos o matriz dedicada fuera de tablas maestras).
   - Unificación `read | add | edit` en Detail Views usando `renderDetailPageTemplate` o shell canónico con estado persistido al preservar viewport (`runWithPlannerPreservedViewport`).
3. **Soft-Delete & Gobernanza:** Prohibido `.delete()` directo; toda desvinculación/archivo en tablas protegidas pasa por `archive_record` (`deleted_at`, `deleted_by`, `delete_reason`) o reasignación explícita bajo triggers RLS.
4. **RBAC (4 Roles) & Aislamiento Nivel 2:**
   - `ADMIN` y `WORKER`: Lectura/escritura operativa (con capacidades administrativas reservadas según `rbac.ts`).
   - `AUDITOR`: Acceso solo a auditorías asignadas; mutación limitada a `Resultado` (hallazgos/fechas reales según asignación) y lectura en el resto.
   - `CLIENT`: Solo lectura estrictamente filtrada a sus organizaciones autorizadas (`authorizedClientOrgIds`), sin fuga entre organizaciones distintas dentro de un mismo `Conglomerado` o `Vínculo` Nivel 2.
5. **Calendario sin contaminación de NC:** Los plazos de `Plan` (`+15d`) y `Cierre` (`+45d`) de `Resultado` se calculan y muestran exclusivamente en `Resultado` y `Resumen`; **NO** generan eventos en `Calendario`.

---

## 4. Índice Secuencial de Pasos

| Paso | Archivo | Alcance Principal | Dependencias Previas |
| :--- | :--- | :--- | :--- |
| **1.1** | `step_1.1.md` | SQL/DDL, triggers y semillas (`dias_limite_cierre_nc`, `dias_limite_plan_nc`, `hallazgo.id_proceso` nullable, simplificación `Revisión`, RPC separación org, semillas Nivel 2 realistas) | Ninguna |
| **2.1** | `step_2.1.md` | Menú Bloque 1 (orden + separador + hover `Designación` auto-colapsable), Breadcrumb In-Card (Detail Views `1..7` + `Resumen`), estado compartido `certId/auditId`, botón `+ Auditoría` & Wizard 3 fases | `step_1.1` |
| **3.1** | `step_3.1.md` | `Conglomerado` Detail View: Tabs `Organizaciones` (conteo real, filtro `SOLO`, remover miembro) & `Auditorías` (orden reciente, `estatus_auditoria`, link a `Resumen`) | `step_1.1`, `step_2.1` |
| **4.1** | `step_4.1.md` | `Vínculo`: Multi View por `Conglomerado` y Detail View basada en **Cajas Agrupadoras** (`LIBRE`, `Naturaleza`, etiqueta, temporal, link a `Resumen`, multi-sitio/multi-org) | `step_1.1`, `step_2.1` |
| **5.1** | `step_5.1.md` | Shell común Certificate-Based + **`Designación`** (`Tipo`, `Fecha` *[Nuevo]*, `Sitio`, `Temporal`) con sincronización de lote vinculado y navegación `◀/▶` | `step_1.1`, `step_2.1` |
| **6.1** | `step_6.1.md` | **`2. Tiempo`** (días por sitio `0.25d`) y **`3. Auditor`** *(antes `Asignación`)* (múltiples auditores cuya suma == días requeridos + `Sitio Temporal`) | `step_5.1` |
| **7.1** | `step_7.1.md` | División de `Programa` en **`4. Proceso`** (por sitio + *Seleccionar todos*) y **`5. Turno`** (matriz anti-fatiga Sitio × Proceso × Turno del sitio + batch) | `step_5.1`, `step_6.1` |
| **8.1** | `step_8.1.md` | Simplificación de **`6. Resultado`** (fechas reales + NCs por cláusula + popup `+15d/+45d`, sin eventos en Calendario) y **`7. Revisión`** (`fecha_revision` + comentario) | `step_1.1`, `step_5.1` |
| **9.1** | `step_9.1.md` | Nueva sección **`Resumen`**, motor paralelo automático **`estatus_auditoria`** y sincronización de `Calendario` (`calendarioView.ts`) | `step_3.1` .. `step_8.1` |
| **Final** | `step_final.md` | Validación integral: reset DB `00`–`07.sql`, suite `node:test`, `lint`/`build`, E2E Chromium 4 roles × viewports (`1440×900` & `390×844`), sincronización `public/doc/` | Todos |

---

## 5. Estrategia de Verificación por Paso

Cada paso incluye pruebas unitarias (`node:test` sobre módulos puros en `src/lib/`), verificación de compilación (`npm run lint`, `npm run build`), y comprobaciones específicas en navegador sobre `http://localhost:3000`. Ningún paso posterior debe romper pruebas de regresión de pasos anteriores.
