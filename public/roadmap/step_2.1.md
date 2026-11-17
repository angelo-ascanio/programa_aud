# Step 2.1 — `Procesos del Sitio` (`procesos_por_sitio`) en Certificación y Motores Puros de Planificación de Auditoría

## Objetivo
Implementar las capas puras de dominio y pruebas unitarias (`node:test`) con `0 any`:
1. Extender el dominio `Sitio` (`src/lib/sitioDomain.ts` + `src/views/sitioView.ts`) para gestionar **`Procesos del Sitio` (`procesos_por_sitio`)** en espejo con `Turnos del Sitio`.
2. Crear **`src/lib/auditPlanningEngine.ts`** y actualizar **`src/lib/auditDomain.ts` / `src/lib/auditExecution.ts`** con los contratos TypeScript de la nueva jerarquía relacional, máquina de estados vs etiquetas dinámicas, balanceador dual-bucket `tiempo_auditoria`, evaluador de completitud por sitio/proceso/turno/auditor y constructor de **"Historial del Certificado"** con alertas de rotación ISO/IEC 17021-1.

---

## Archivos a Crear / Modificar
- **Modificar:** `src/lib/sitioDomain.ts`
- **Modificar:** `src/views/sitioView.ts` (sección de pestaña `Procesos del Sitio` + interfaz de estado)
- **Crear:** `src/lib/auditPlanningEngine.ts`
- **Modificar:** `src/lib/auditDomain.ts`
- **Modificar:** `src/lib/auditExecution.ts`
- **Crear:** `src/lib/auditPlanningEngine.test.ts`
- **Modificar / Ampliar:** `src/lib/sitioDomain.test.ts` (o crear `src/lib/procesosPorSitio.test.ts` si no existe) y `src/lib/auditDomain.test.ts`

---

## Especificación Técnica Detallada

### 1. Extensión de `Sitio` (`sitioDomain.ts` + `sitioView.ts`)
1. **Contratos en `sitioDomain.ts`:**
   - `ProcesoPorSitioLink`: `{ id: string; id_sitio: string; id_proceso: string; nombre_proceso: string; tipo_proceso: string; deleted_at?: string | null }`.
   - Ampliar `SitioEntity` (en `multisiteSampling.ts` / `sitioDomain.ts`) con `procesos_por_sitio?: ProcesoPorSitioLink[]` y `procesos_vinculados?: string[]` (paralelo a `turnos_vinculados`).
   - Función pura `getAvailableProcesosForSitio(sitioId: string, cert: CertificadoDetailEntity)`: devuelve los procesos activos del mismo `cert.id` que aún no están vinculados a `sitioId`.
   - Función pura `validateProcesoPorSitioAssignment(sitioId: string, procesoId: string, cert: CertificadoDetailEntity)`: garantiza que ambos pertenezcan al mismo certificado y evita duplicados activos.
   - `SiteAuditDependencySummary` / métricas en tarjeta de `Sitio`: mostrar conteo de `procesos_vinculados` junto a `turnos_vinculados`.
2. **Pestaña `Procesos del Sitio` en `sitioView.ts`:**
   - Ampliar las pestañas hijas del Detail View de `Sitio`: `'turnos' | 'procesos' | 'auditorias'`.
   - En la pestaña `'procesos'`:
     - Tabla `table-fixed` con `<colgroup>` (`Proceso`, `Tipo`, `Cláusulas Cubiertas`, sin botones dentro de `<td>`; fila clicable hacia el Detail View de `Proceso`).
     - En modo `'read'` para `ADMIN`/`WORKER` aprobados (o sección de gestión de vínculos con selector filtrado al certificado + botón `+ Vincular Proceso` / desvinculación vía `archive_record('procesos_por_sitio', id)` con `#archiveGovernanceToast`).
     - Regla explícita de empty state: advertir si un sitio aún no tiene procesos vinculados, explicando que el planificador de auditorías requiere procesos activos del sitio.

### 2. Contratos y Motor Puro `src/lib/auditPlanningEngine.ts`
Definir con tipado estricto (`0 any`) los modelos canónicos del Bloque 1:

1. **Enumeraciones y Estados:**
   ```ts
   export type AuditCycleStatus =
     | 'Borrador'
     | 'En Programación'
     | 'Programada'
     | 'En Ejecución'
     | 'Auditada'
     | 'Reprogramada'
     | 'Cancelada';

   export type AuditDynamicTag =
     | 'Borrador / En Programación'
     | 'Parcialmente Asignada'
     | 'Programada / Lista'
     | 'En Ejecución'
     | 'Auditada'
     | 'Reprogramada'
     | 'Cancelada';
   ```
2. **Contratos de Árbol Relacional (`AuditoriaPlanningTree`):**
   - `AuditoriaTurnoProcesoLink`: `{ id: string; id_procesos_sitio_auditoria: string; id_turnos_sitio_auditoria: string; id_turnos_por_sitio: string; horario_label: string }`.
   - `AuditoriaEquipoProcesoLink`: `{ id: string; id_procesos_sitio_auditoria: string; id_auditor: string; auditor_nombre: string; rol_en_proceso: 'LIDER_PROCESO' | 'EVALUADOR' | 'APOYO_TECNICO' | 'OBSERVADOR' }`.
   - `AuditoriaProcesoSitioItem`: `{ id: string; id_sitios_por_auditoria: string; id_procesos_por_sitio: string; id_proceso: string; nombre_proceso: string; tipo_proceso: string; turnos: AuditoriaTurnoProcesoLink[]; auditores: AuditoriaEquipoProcesoLink[]; notas?: string | null }`.
   - `AuditoriaEquipoSitioItem`: `{ id: string; id_sitios_por_auditoria: string; id_auditor: string; auditor_nombre: string; rol_auditor: 'AUDITOR_LIDER' | 'AUDITOR' | 'AUDITOR_EN_ENTRENAMIENTO' | 'EXPERTO_TECNICO'; tiempo_auditoria: number; asignacion_completa_sitio: boolean }`.
   - `AuditoriaSitioPlanItem`: `{ id: string; id_auditoria: string; id_sitio: string; numero_sitio: number; nombre_sitio: string; tiempo_auditoria: number; modalidad_evaluacion?: 'Presencial' | 'Remota' | 'Mixta' | null; fecha_inicio?: string | null; fecha_fin?: string | null; turnos_sitio: TurnoSitioAuditoriaItem[]; procesos: AuditoriaProcesoSitioItem[]; equipo_sitio: AuditoriaEquipoSitioItem[] }`.

3. **Funciones Puras Obligatorias en `auditPlanningEngine.ts`:**
   - `roundAuditDaysQuarter(value: number): number`: redondea y valida múltiplos exactos de `0.25d` (`>= 0`, `NUMERIC(6,2)`).
   - `computeSiteDayBalance(site: AuditoriaSitioPlanItem)`: calcula `{ requiredDays, assignedDays, delta, status: 'balanced' | 'under' | 'over' | 'empty', label }`.
   - `computeAuditDayBalance(sitios: ReadonlyArray<AuditoriaSitioPlanItem>, auditPlannedDays?: number)`: suma Cubo 1 vs Cubo 2 en toda la auditoría, y consolida `auditorTotals: Array<{ id_auditor, auditor_nombre, totalDays, siteBreakdown }>`.
   - `evaluateSitePlanningCompleteness(site: AuditoriaSitioPlanItem)`: verifica que existan `procesos.length > 0`, que cada proceso tenga `turnos.length >= 1` y `>= 1` auditor efectivo (explícito en `equipo_auditor_proceso_sitio` OR cubierto por un miembro en `equipo_auditor_sitio` con `asignacion_completa_sitio === true`), y retorna lista legible de pendientes (`missingItems: string[]`).
   - `computeAuditPlanningStatus(audit, todayIso)`:
     - Calcula `primaryTag: AuditDynamicTag`, `isOverdue: boolean` (`Atrasada / Vencida` cuando `(fecha_fin || fecha_programacion) < todayIso` y ciclo no terminal), `completionPercent: number` (0..100), `balanceSummary`, y `pendingReasons: string[]`.
     - Garantiza que un borrador incompleto jamás lance excepción de validación al guardarse mientras tenga `id_certificado` válido.
   - `buildCertificateAuditHistoryDigest(certId, currentAuditId, allAudits, certDetail)`:
     - Construye el historial ordenado cronológicamente (más reciente primero) excluyendo `currentAuditId`.
     - Detecta **alerta de rotación ISO/IEC 17021-1** (mismo `AUDITOR_LIDER` en `>= 3` ciclos consecutivos previos) y calcula qué `proceso` del certificado no fue auditado en la última auditoría completada/programada.
   - `resolveEffectiveAuditorsForProcess(site, procesoItem)`: une asignaciones de `equipo_auditor_sitio` con `asignacion_completa_sitio = true` y asignaciones directas en `equipo_auditor_proceso_sitio` deduplicadas por `id_auditor` (resolviendo rol).

4. **Compatibilidad con `auditDomain.ts` y `auditExecution.ts`:**
   - Ampliar `ProgramacionAuditEntity` y `AuditFormDraft` en `auditExecution.ts` con `codigo_auditoria`, `fecha_fin`, `tiempo_auditoria`, `estado_ciclo`, `objetivo`, `sitiosPlan: AuditoriaSitioPlanItem[]`, manteniendo `sitiosMuestreo`, `matrizNormativa` y `equipo` derivados automáticamente del árbol para no romper `resultadoView.ts` ni las métricas existentes del dashboard.
   - Actualizar `validateProgramacionAuditDraft` para permitir modo **borrador progresivo** (solo `id_certificado` obligatorio si `estado_ciclo === 'Borrador' | 'En Programación'`) vs **cierre a `Programada`** cuando el usuario solicita marcarla como lista.

---

## Pruebas Unitarias (`node:test`)
- `auditPlanningEngine.test.ts`:
  - Redondeo de `0.25d` y balanceo dual-bucket (cuadrado, faltante, exceso, un auditor en 3 sitios con días distintos).
  - Completitud híbrida: auditor asignado a todo el sitio vs granular M:N en co-evaluación (2 auditores en 1 proceso, 1 auditor en varios procesos).
  - Máquina de estados vs tags (`Borrador / En Programación`, `Parcialmente Asignada`, `Programada / Lista`, `Atrasada / Vencida`).
  - Generador de historial del certificado + alerta de rotación de auditor líder + procesos no cubiertos recientemente.
- `sitioDomain.test.ts` / `procesosPorSitio.test.ts`:
  - Validación cruzada de certificado en `procesos_por_sitio`, filtrado de disponibles y prevención de duplicados.

---

## Criterios de Verificación de Step 2.1
1. `npx tsx --test src/lib/auditPlanningEngine.test.ts src/lib/auditDomain.test.ts src/lib/sitioDomain.test.ts` pasa al 100%.
2. `npm run lint` (`tsc --noEmit`) pasa con `0` errores y `0 any`.
3. `Sitio` Detail View muestra y administra correctamente la pestaña `Procesos del Sitio`.
