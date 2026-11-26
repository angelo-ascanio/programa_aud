# Paso 2.1: Capa de Dominio, Validación, Persistencia, Auth y Sincronización Live (`src/lib/` + `src/main.ts`)

## 1. Objetivo del Paso
Actualizar las estructuras TypeScript (`strict: true`, `0 any`), validadores, motor de persistencia CRUD, resolución de actores de auditoría e hidratación en vivo desde PostgreSQL para reflejar fielmente los nuevos atributos y tablas hijas (`telefono_auditor`, `email_auditor`, `evaluacion_in_situ_auditor`), garantizando compatibilidad total con los 47 auditores autenticados como `AUDITOR` y con `auditor@fondonorma.test`.

> **Alcance estricto:** Capa de dominio (`src/lib/`), módulo de persistencia de auditor, carga/guardado en `src/main.ts`, verificación de `authView.ts` y tests unitarios de dominio (`competencyMatrix.test.ts`, etc.). El rediseño visual de Multi View y Detail View se ejecuta en los **Pasos 3.1 y 3.2**.

---

## 2. Archivos Permitidos a Modificar
- `src/lib/competencyMatrix.ts`
- `src/lib/auditorPersistence.ts` *(nuevo módulo modular siguiendo el patrón de `expertoTecnicoPersistence.ts`)*
- `src/lib/auditLog.ts`
- `src/lib/accessControl.ts` (solo si requiere ajuste menor de normalización/identidad para homónimos o auditor real)
- `src/views/authView.ts` (revisión/preservación sin eliminar `auditor@fondonorma.test`)
- `src/main.ts` (hidratación `auditorsRes` + tablas hijas, CRUD handlers, `actorDirectory` desde `profiles`, archive tables)
- `src/lib/competencyMatrix.test.ts` (y `src/lib/auditorPersistence.test.ts`)

---

## 3. Diseño Técnico Detallado

### 3.1 Tipos Estrictos y Estado de Evaluación In Situ (`src/lib/competencyMatrix.ts`)
1. **Nuevas interfaces (`0 any`):**
   - `TelefonoAuditorEntity`: `{ id, id_auditor, telefono, tipo_telefono, es_principal, created_at?, deleted_at? }`
   - `EmailAuditorEntity`: `{ id, id_auditor, email, tipo_email, es_principal, created_at?, deleted_at? }`
   - `EvaluacionInSituAuditorEntity`: `{ id, id_auditor, etiqueta_periodo?, norma_referencia?, sector_area_evaluado?, ultima_evaluacion_fecha?, proxima_evaluacion_fecha?, ultima_evaluacion_texto?, proxima_evaluacion_texto?, observaciones?, deleted_at? }`
   - Extender `AuditorDetailEntity` y `AuditorFormDraft` con:
     - `siglas: string`
     - `cedula_identidad: string`
     - `profesion: string`
     - `esquemas_complementarios: string` *(ej. `MARCA`, `HACCP`)*
     - `anio_actualizacion_normas: number | null`
     - `sistema_gestion_secundario: string`
     - `ultima_evaluacion_in_situ_texto: string`
     - `proxima_evaluacion_in_situ_texto: string`
     - `ultima_evaluacion_in_situ_fecha: string | null`
     - `proxima_evaluacion_in_situ_fecha: string | null`
     - `sin_registro_evaluacion: boolean`
     - `sector_area_evaluado_texto: string`
     - `observaciones_evaluacion: string`
     - `anio_actualizacion_sectores: number | null`
     - `observacion_sectores: string`
     - `telefonos: TelefonoAuditorEntity[]`
     - `emails: EmailAuditorEntity[]`
     - `evaluaciones_in_situ: EvaluacionInSituAuditorEntity[]`
   - **Retrocompatibilidad temporal:** mantener `codigo_credencial` como alias calculado (`siglas` o valor legacy en fallbacks), `titulo_profesional` sincronizado con `profesion`, `telefono` y `email` derivados del contacto principal activo (`es_principal = true` o primer activo) para que vistas existentes y tests no se rompan mientras llegan los Pasos 3.1–4.1.

2. **Evaluación de Vigencia Real Basada en Evaluación In Situ:**
   - Nueva función pura `evaluateAuditorInSituStatus(auditor, referenceDate?)`:
     - `'Pendiente Evaluación'` / `'Condicionado'` si `observaciones_evaluacion` u `observacion_sectores` contiene `'PENDIENTE'` o `'CONDICIONAD'` o `'FALTA EVALUACIÓN'`.
     - `'S/R'` si `sin_registro_evaluacion` es `true` o no hay `proxima_evaluacion_in_situ_fecha`.
     - `'Vencido'` si `proxima_evaluacion_in_situ_fecha < referenceDate`.
     - `'Por Vencer'` si está dentro de 90 días.
     - `'Vigente'` en caso contrario.
   - Clasificador puro `classifyAuditorObservacionSector(auditor)`:
     - Detecta si `observacion_sectores` exige **Experto Técnico** (`requiereExpertoTecnico: boolean`, `sectoresCondicionados: number[]`, `textoAlerta: string`) para consumo en **Paso 3.1**, **Paso 3.2** y **Paso 4.1 (`3. Auditor`)**.

3. **Validación Centrada en Cédula (`validateAuditorDraft`):**
   - Permitir homónimos exactos en `nombre` y `siglas` (ej. ambas `Yurima Carrillo` / `YC`).
   - Exigir `nombre` (>= 3 chars), `siglas` (2–12 chars alfanuméricos, recomendable mayúsculas) y `cedula_identidad` válida (obligatoria para nuevos auditores, sin duplicados entre registros activos distintos al `editingAuditorId`, comparando `UPPER(TRIM(cedula))`).
   - Validar años opcionales (`anio_actualizacion_normas`, `anio_actualizacion_sectores`) en rango `1990..2100`.
   - Mantener **Zero-UUID** en todos los mensajes de error (`translateAuditorPersistenceError`).

4. **Sincronización de `INITIAL_AUDITORES_DETAILED`:**
   - Actualizar el arreglo fallback en `competencyMatrix.ts` para usar los UUIDs y campos reales de los primeros auditores reales del CSV (conservando las interfaces requeridas por tests de unidad que prueban expiración/filtros o actualizando `competencyMatrix.test.ts` de forma explícita y limpia).

### 3.2 Módulo `src/lib/auditorPersistence.ts`
- Seguir el patrón exacto de `src/lib/expertoTecnicoPersistence.ts`:
  - `saveAuditorProfile(client, payload)` → `INSERT` o `UPDATE` en `public.auditor` (usando `omitUndefined` / nullables limpios y retorno de fila completa).
  - `addTelefonoAuditor`, `deleteTelefonoAuditor` (soft delete `deleted_at = NOW()`), `setPrimaryTelefonoAuditor`.
  - `addEmailAuditor`, `deleteEmailAuditor` (soft delete), `setPrimaryEmailAuditor`.
  - `addEvaluacionInSituAuditor`, `updateEvaluacionInSituAuditor`, `deleteEvaluacionInSituAuditor` (soft delete) + recálculo automático de los campos resumen (`ultima_evaluacion_in_situ_*`, `proxima_evaluacion_in_situ_*`, `sin_registro_evaluacion`) en `public.auditor`.
  - Traductor de errores PostgreSQL (`uq_auditor_cedula_active` → *"Ya existe un auditor activo con esa cédula de identidad."*, `uq_telefono_auditor_per_auditor_active`, `uq_email_auditor_per_auditor_active`, `P0001`, Zero-UUID).

### 3.3 Hidratación en Vivo, Actor Directory y Auth (`src/main.ts`, `src/lib/auditLog.ts`, `src/views/authView.ts`)
1. **Hidratación en `src/main.ts`:**
   - Actualizar `auditorsRes` para seleccionar todas las columnas nuevas de `public.auditor` + consultas en paralelo a `telefono_auditor` (`WHERE deleted_at IS NULL`), `email_auditor` (`WHERE deleted_at IS NULL`), `evaluacion_in_situ_auditor` (`WHERE deleted_at IS NULL`).
   - Mapear los enlaces `norma_auditor`, `sector_iaf_auditor`, `subsector_iaf_auditor` y construir `AuditorDetailEntity` completo desde DB **sin depender de `INITIAL_AUDITORES_DETAILED` para los 47 auditores reales** cuando la DB responde datos reales.
   - Mantener los fallbacks cuando la app arranca sin sesión/modo unit test.
2. **Actor Directory y Bitácora (`src/lib/auditLog.ts` + `src/main.ts`):**
   - Asegurar que cuando la app carga `profiles` (y/o `auditor` + `email_auditor`), el mapa `actorDirectory` incluya los nombres y correos reales de los 47 auditores para que cualquier acción de un auditor logueado (ej. creación de hallazgos o comentarios) muestre su nombre real y correo en el historial de auditoría sin mostrar jamás UUIDs crudos.
3. **Verificación de `src/views/authView.ts`:**
   - Confirmar que el panel de botones rápidos de prueba conserva **exactamente** los 4 roles (`Admin`, `Worker`, `Auditor` con `auditor@fondonorma.test` / `Password123*`, `Client`) y que el formulario estándar de correo + contraseña acepta sin restricciones ni validaciones artificiosas las contraseñas `SIGLAS + CEDULA` (ej. `AKS10337391`).

---

## 4. Criterios de Verificación del Paso 2.1
1. `npx tsc --noEmit` con **0 errores** y verificación de `0 any` en archivos tocados.
2. `npm test` en verde (incluyendo tests unitarios de `validateAuditorDraft` permitiendo homónimos con cédula distinta y bloqueando cédula repetida, `evaluateAuditorInSituStatus`, `classifyAuditorObservacionSector`, y `auditorPersistence.ts` con mocks).
3. Verificación en navegador/dev server:
   - Inicio de sesión con botón `Auditor` (`auditor@fondonorma.test`) → OK, navegación restringida de `AUDITOR`.
   - Inicio de sesión manual con correo/contraseña real CSV (`calidad.aksanchez@gmail.com` / `AKS10337391`) → OK, `profile.nombre` real, hidratación completa de los 48 auditores desde PostgreSQL.
