# Paso 4.1: Integración en Bloque 1 (`3. Auditor` y Flujos de Auditoría), Homónimos, Alertas y Sincronización Transversal

## 1. Objetivo del Paso
Propagar la nueva estructura real de los 47 auditores al **Bloque 1 (`Auditoría`)**, las alertas operativas, la sincronización en vivo del historial de auditorías, la visibilidad en el dashboard y el comportamiento autenticado de cualquier auditor real (`role = 'AUDITOR'`).

> **Alcance estricto:** Integraciones en Bloque 1 (`3. Auditor`, `Resumen`, alertas, ejecución, dashboard, trazabilidad `audit_log`), manteniendo la disciplina visual **"Less Is More"** en `asignacionView.ts` y pruebas unitarias/integración asociadas.

---

## 2. Archivos Permitidos a Modificar
- `src/lib/asignacionDomain.ts`
- `src/views/asignacionView.ts`
- `src/lib/auditAlertsEngine.ts`
- `src/lib/auditExecution.ts`
- `src/views/resumenView.ts`
- `src/lib/dashboardDomain.ts` (si muestra resúmenes o etiquetas de auditores)
- `src/views/auditorView.ts` (inyección/sincronización en vivo de `historialAuditorias` desde `allProgrammedAudits`)
- `src/main.ts` (construcción dinámica de `historialAuditorias`, mapeo de `actorDirectory` desde `profiles` + `auditor`)
- Tests relacionados (`asignacionDomain.test.ts`, `asignacionView.test.ts`, `auditExecution.test.ts`, `accessControl.test.ts`, etc.)

---

## 3. Cambios Funcionales Detallados

### 3.1 Desambiguación de Homónimos (`Yurima Carrillo` / `YC`) en Todo el Sistema
- Crear helper compartido `formatAuditorDisplayLabel(auditor, options?)` en `src/lib/competencyMatrix.ts` (o reutilizado desde `asignacionDomain.ts`):
  - Formato recomendado en selects y listas compactas: `Yurima Carrillo (YC · C.I. 7137643)` vs `Yurima Carrillo (YC · C.I. 12310919)` (cuando hay homónimos o en selectores de asignación siempre mostrar `Nombre (SIGLAS · C.I.)` o `Nombre (SIGLAS)` con `C.I.` en disambiguation).
- Aplicarlo en:
  - `3. Auditor` (`src/views/asignacionView.ts` — `<select>` de asignación por sitio y badges de equipo asignado).
  - `Resumen` (`src/views/resumenView.ts` — tabla/listado de equipo asignado).
  - `calendarioDomain.ts` / `programacionView.ts` si muestran nombres de auditores en filtros o tarjetas.
  - **Cero UUIDs** en etiquetas `<option>` visibles o `title`.

### 3.2 Indicadores No Bloqueantes en `3. Auditor` (`asignacionDomain.ts` + `asignacionView.ts`)
Respetando estrictamente el estándar limpio **"Less Is More"** de `asignacionView.ts`:
1. **Indicador de Estado de Evaluación In Situ:**
   - Al seleccionar o mostrar un auditor asignado en `3. Auditor`, evaluar `evaluateAuditorInSituStatus(auditor)`:
     - Si está **`Vencido`** o **`S/R`** o **`Pendiente Evaluación`** (ej. `14001 pendiente evaluacion in situ` o `FALTA EVALUACIÓN IN SITU 14001 Y 45001`), mostrar una advertencia discreta y no bloqueante junto al miembro o selector (manteniendo permitido asignar si la coordinación así lo decide, igual que la brecha IAF).
2. **Alerta Inteligente por `observacion_sectores` (Recomendación / Requisito de Experto Técnico):**
   - Evaluar `classifyAuditorObservacionSector(auditor)` frente a los sectores IAF de los certificados incluidos en la auditoría:
     - Si el auditor tiene nota sectorial relevante para alguno de los sectores auditados (por ejemplo, `Nelson Arteaga` con `"Acompañado con experto técnico para el sector 13"` o `Yuliber Blanco` en sectores `7, 9 y 13` o `Nordy Fuentes` en `4, 5 y 38`) y aún **no** hay un Experto Técnico asignado en la auditoría (`experto_tecnico_auditoria`), mostrar un aviso claro no bloqueante recomendando asignar un **Experto Técnico** desde el mismo panel de Experto Técnico existente en `3. Auditor`!
     - Si ya existe un Experto Técnico asignado en la auditoría que cubre ese sector, mostrar confirmación discreta positiva (`Cubierto con Experto Técnico asignado`).

### 3.3 Sincronización En Vivo del `Historial de Auditorías` (`src/main.ts` + `src/views/auditorView.ts`)
- **Problema actual detectado:** `src/main.ts` línea 35991 obtiene `historialAuditorias: seedMatch?.historialAuditorias ?? []`, lo que deja en `0` el historial de auditores reales desde DB que no estaban en `INITIAL_AUDITORES_DETAILED`, y no refleja nuevas asignaciones creadas en tiempo real!
- **Solución:** Construir un índice en vivo `Map<auditorId, AuditoriaRealizadaEntity[]>` a partir de `allProgrammedAudits` (recorriendo `aud.equipo` de `equipo_auditor_sitio` y `aud.auditor_lider_id`), ordenando de más reciente a más antigua y sin duplicar auditorías multi-sitio. Al asignar o quitar un auditor en `3. Auditor`, su pestaña `Historial de Auditorías` y columna `Auditorías` en Bloque 2 se actualizan automáticamente.

### 3.4 Trazabilidad y Sesión de Auditores Reales (`role = 'AUDITOR'`)
- Verificar con pruebas específicas de `accessControl.ts` + `auditLog.ts`:
  - Cuando un usuario del CSV (por ejemplo `Keyla Soteldo` `1000...0001`, `Leonardo Rojas` `1000...0004`, o `Ana Karina Sanchez`) inicia sesión:
    - En `Bloque 1 → Auditorías`: visualiza **únicamente** las auditorías donde forma parte de `equipo_auditor_sitio` / `auditor_lider_id`.
    - En `Dashboard`: métricas acotadas a su participación.
    - En `Bloque 2 → Auditor`: puede consultar el catálogo completo en modo estricto **solo lectura** (cero botones de edición/creación/competencia/archivo).
    - En `audit_log`: si registra hallazgos o comentarios en sus auditorías asignadas, la bitácora resuelve su `nombre` y `correo` real desde `actorDirectory` sin exponer su UUID.

### 3.5 Alertas Operativas (`auditAlertsEngine.ts`)
- Integrar de manera opcional/limpia en el resumen de salud/alertas del equipo (sin saturar la UI) conteos de auditores próximos a vencer o con evaluación in situ vencida cuando formen parte de auditorías activas (`Pendiente` / `En Curso`).

---

## 4. Criterios de Verificación del Paso 4.1
1. `npx tsc --noEmit` y `npm test` en verde completo (incluyendo nuevos tests de homónimos `Yurima Carrillo` en `asignacionDomain.test.ts` / `asignacionView.test.ts`, alerta no bloqueante por `observacion_sectores` + Experto Técnico, y sincronización en vivo de `historialAuditorias`).
2. Prueba en navegador (dev server):
   - En `Bloque 1 → 3. Auditor`, asignar a `Nelson Arteaga` o `Yuliber Blanco` en una auditoría de Sector `13` y verificar aviso no bloqueante de Experto Técnico; comprobar que al seleccionar entre ambas `Yurima Carrillo` se distinguen sin ambigüedad por `YC · C.I.`.
   - Comprobar que al volver a `Bloque 2 → Auditor` → `Historial de Auditorías`, la auditoría recién asignada aparece en vivo.
   - Iniciar sesión con un auditor real del CSV asignado a una auditoría (`KS4165827` / `keylasoteldo@gmail.com` o `LR5365320` / `leorojas48@gmail.com`) y comprobar su vista acotada + modo lectura en Bloque 2.
