# Step 2.1 — `Procesos del Sitio`, Vinculación en 2 Niveles, Motor Multi-Fecha 1:N y Motor de Alertas (`node:test`)

## Objetivo
Implementar las capas puras de dominio y pruebas unitarias (`node:test`) con `strict: true` y `0 any`:
1. Extender el dominio `Sitio` (`src/lib/sitioDomain.ts` + `src/views/sitioView.ts`) para gestionar **`Procesos del Sitio` (`procesos_por_sitio`)** en espejo con `Turnos del Sitio`.
2. Crear **`src/lib/auditPlanningEngine.ts`** y actualizar **`src/lib/auditDomain.ts` / `src/lib/auditExecution.ts`** con:
   - Entidad maestra superior **`ProgramaAuditoriaEntity`** (`INDIVIDUAL`, `NIVEL_1_INTRA_ORG`, `NIVEL_2_INTER_ORG` + taxonomía `Individual | Combinada | Integrada | Conjunta | Simultánea | Multientidad | Multisitio`, evolución `id_ciclo_origen`).
   - Motor relacional Multi-Fecha 1:N **`AuditDateEntry`** (`PREPROGRAMADA_MES` vs `REAL`, `numero_secuencia`, `tag`, `observacion`, resolvedor `resolveLatestAuditDate`).
   - Cálculo de **Span Calendario vs. Días-Auditor** (`6.00d` / `2 auditores` en `3 días calendario`) y detección de **traslape/doble asignación de auditores** en fechas reales.
   - Filtro de **Certificados Sin Auditoría Programada por `estatus`** (`findUnprogrammedCertificatesByStatus`).
   - Motor configurable de **Alertas Inteligentes del Calendario** (`computeAuditAlerts` con `AlertConfigEntity`).
   - Balanceo dual-bucket `tiempo_auditoria` (`0.25d`), completitud `Sitio → Proceso → Turnos → Auditores`, e **Historial del Certificado** con evolución de ciclo y rotación ISO/IEC 17021-1.

---

## Archivos a Crear / Modificar
- **Modificar:** `src/lib/sitioDomain.ts`
- **Modificar:** `src/views/sitioView.ts` (pestaña `'procesos'` — `Procesos del Sitio`)
- **Crear:** `src/lib/auditPlanningEngine.ts`
- **Modificar:** `src/lib/auditDomain.ts`
- **Modificar:** `src/lib/auditExecution.ts`
- **Crear:** `src/lib/auditPlanningEngine.test.ts`
- **Modificar / Ampliar:** `src/lib/sitioDomain.test.ts` y `src/lib/auditDomain.test.ts`

---

## Especificación Técnica Detallada

### 1. Extensión de `Sitio` (`sitioDomain.ts` + `sitioView.ts`)
1. **Contratos en `sitioDomain.ts`:**
   - `ProcesoPorSitioLink`: `{ id: string; id_sitio: string; id_proceso: string; nombre_proceso: string; tipo_proceso: string; deleted_at?: string | null }`.
   - Ampliar `SitioEntity` con `procesos_por_sitio?: ProcesoPorSitioLink[]` y `procesos_vinculados?: string[]`.
   - Funciones puras `getAvailableProcesosForSitio(sitioId, cert)` y `validateProcesoPorSitioAssignment(sitioId, procesoId, cert)` (garantiza pertenencia al mismo certificado y evita duplicados activos).
2. **Pestaña `Procesos del Sitio` en `sitioView.ts`:**
   - Pestañas hijas del Detail View de `Sitio`: `'turnos' | 'procesos' | 'auditorias'`.
   - Tabla `table-fixed` con `<colgroup>` suma `100%` (`Proceso`, `Tipo`, `Cláusulas Cubiertas`), **cero `<button>` en `<td>`**, fila clicable hacia `Proceso`.
   - Controles de vinculación/archivo solo para `ADMIN`/`WORKER` aprobados (`archive_record('procesos_por_sitio', id)` + `#archiveGovernanceToast`).
   - Empty state claro cuando un sitio carece de procesos vinculados.

---

### 2. Contratos y Motor Puro `src/lib/auditPlanningEngine.ts`

1. **Tipos de Vinculación en 2 Niveles y Taxonomía:**
   ```ts
   export type AuditLinkLevel = 'INDIVIDUAL' | 'NIVEL_1_INTRA_ORG' | 'NIVEL_2_INTER_ORG';

   export type AuditLinkNature =
     | 'Individual'
     | 'Combinada'
     | 'Integrada'
     | 'Conjunta'
     | 'Simultánea'
     | 'Multientidad'
     | 'Multisitio';

   export interface ProgramaAuditoriaEntity {
     id: string;
     codigo_programa: string | null;
     etiqueta: string;
     nivel_vinculacion: AuditLinkLevel;
     tipo_vinculacion: AuditLinkNature;
     es_vinculada: boolean;
     id_ciclo_origen?: string | null;
     notas?: string | null;
     auditorias: ProgramacionAuditEntity[];
     deleted_at?: string | null;
   }
   ```
   - `validateProgramLinkingRules(nivel, tipo, selectedCerts)`:
     - `'INDIVIDUAL'`: exige `tipo === 'Individual'` y exactamente `1` certificado.
     - `'NIVEL_1_INTRA_ORG'`: exige `tipo !== 'Individual'`, `>= 1` certificados (para borrador; `>= 2` para completar vínculo) y **todos con el mismo `id_organizacion`**.
     - `'NIVEL_2_INTER_ORG'`: exige `tipo !== 'Individual'` y admite certificados de `2+` organizaciones distintas.

2. **Contratos y Motor Multi-Fecha 1:N (`AuditDateEntry`):**
   ```ts
   export type AuditDatePrecision = 'PREPROGRAMADA_MES' | 'REAL';
   export type AuditDateTag = 'Programación' | 'Reprogramación';

   export interface AuditDateEntry {
     id: string;
     id_auditoria: string;
     numero_secuencia: number;
     tag: AuditDateTag;
     tipo_fecha: AuditDatePrecision;
     anio: number | null;
     mes: number | null; // 1..12
     fecha_inicio: string | null; // YYYY-MM-DD
     fecha_fin: string | null;    // YYYY-MM-DD
     observacion?: string | null;
     deleted_at?: string | null;
   }
   ```
   - `resolveLatestAuditDate(fechas: ReadonlyArray<AuditDateEntry>): AuditDateEntry | null`: filtra activas (`!deleted_at`), ordena por `numero_secuencia DESC` y devuelve la más reciente.
   - `getNextAuditDateSequence(fechas: ReadonlyArray<AuditDateEntry>): number`: retorna `max(numero_secuencia) + 1` (o `1`).
   - `formatAuditDateLabel(entry: AuditDateEntry | null): string`: ej. `"10/06/2026 – 12/06/2026 (Reprogramación #2)"` o `"Sep 2026 · Pre-programada (#1)"` o `"Sin fecha definida"`.
   - `getPreprogrammedMonthStartIso(entry: AuditDateEntry): string | null`: calcula el primer día ISO (`YYYY-MM-01`) del mes/año preprogramado para comparar umbrales de alerta.

3. **Rango Calendario Real vs. Días-Auditor y Conflictos de Agenda:**
   - `computeAuditCalendarSpanDays(latestDate: AuditDateEntry | null): number | null`:
     - Si `tipo_fecha === 'REAL'`, devuelve días calendario inclusivos `(fecha_fin - fecha_inicio) + 1`. Si es `PREPROGRAMADA_MES` o `null`, retorna `null`.
   - `validateAuditorCapacityAgainstSpan(auditorTotals, calendarSpanDays)`:
     - Calcula para cada auditor si `totalDays > calendarSpanDays` (cuando `calendarSpanDays !== null`), generando advertencia descriptiva no bloqueante (ej. `"Auditor X tiene 4.00d en un rango de 3 días calendario"`), mientras valida positivamente casos como **2 auditores × 3.00d = 6.00 días-auditor en 3 días calendario**.
   - `detectAuditorScheduleConflicts(allPrograms)`:
     - Compara únicamente auditorías activas con fecha vigente `REAL` no terminal (`estado_ciclo NOT IN ('Auditada', 'Cancelada')`). Si un mismo `id_auditor` participa en dos programas cuyas ventanas `[fecha_inicio, fecha_fin]` se solapan (excluyendo auditorías dentro del mismo `programa_auditoria` si comparten visita), emite un conflicto legible con los códigos de programa y fechas superpuestas (**sin UUIDs**).

4. **Máquina de Estados, Etiquetas Dinámicas y Balanceo Dual-Bucket:**
   - Mantiene `AuditCycleStatus` y `AuditDynamicTag` + `roundAuditDaysQuarter(value)` (`0.25d`), `computeSiteDayBalance`, `computeAuditDayBalance`, `evaluateSitePlanningCompleteness`, `resolveEffectiveAuditorsForProcess`, `computeAuditPlanningStatus(audit, todayIso)` (ahora leyendo fecha vigente desde `resolveLatestAuditDate(audit.fechas)` en lugar de `fecha_programacion`).
   - `computeProgramPlanningStatus(program, todayIso)`: agrega el progreso de todas las `auditorias` vinculadas, total de días-auditor (Cubo 1 vs Cubo 2), rango calendario consolidado del programa y estado global.

5. **Filtro de Certificados Sin Programar por `estatus`:**
   ```ts
   export interface UnprogrammedCertificateFilter {
     estatusIds?: string[];
     estatusNames?: string[];
     normaId?: string | null;
     organizacionId?: string | null;
     searchQuery?: string;
   }
   ```
   - `findUnprogrammedCertificatesByStatus(certificates, allPrograms, filter)`:
     - Identifica certificados activos (`!deleted_at`) que **no tienen ninguna `auditoria` activa con ciclo pendiente/en curso** (i.e., sin auditorías en absoluto o únicamente con auditorías cerradas `'Auditada'` / `'Cancelada'`, o configurable para `"Sin ninguna auditoría activa futura"`).
     - Filtra por `estatus` del certificado (`Activo`, `Estudio`, `Suspendido`, `Planificado`, `En Espera`, etc.), norma, organización y texto libre.
     - Devuelve también resumen de conteos por `estatus` para renderizar chips/facetas instantáneas en `Programación`.

6. **Motor de Alertas Inteligentes Configurables (`AlertConfigEntity`):**
   ```ts
   export interface AlertConfigEntity {
     id: string;
     clave: string;
     dias_aviso_proxima: number;
     dias_aviso_preprogramada_sin_confirmar: number;
     alertar_atrasadas: boolean;
     alertar_conflicto_auditor: boolean;
     alertar_desfase_dias_o_span: boolean;
     ciclos_rotacion_auditor_lider: number;
     alertas_activas: boolean;
   }

   export type AuditAlertCategory =
     | 'PROXIMA'
     | 'PREPROGRAMADA_SIN_CONFIRMAR'
     | 'ATRASADA'
     | 'CONFLICTO_AUDITOR'
     | 'DESFASE_DIAS_SPAN';
   ```
   - `computeAuditAlerts(programs, config, todayIso)`:
     - **`ATRASADA` (`rose`):** fecha vigente `REAL` con `fecha_fin < todayIso` y `estado_ciclo NOT IN ('Auditada', 'Cancelada')`.
     - **`PROXIMA` (`amber`/`sky`):** fecha vigente `REAL` (última secuencia `MAX(numero_secuencia)`) cuyo `fecha_inicio` está entre `todayIso` y `todayIso + config.dias_aviso_proxima`.
     - **`PREPROGRAMADA_SIN_CONFIRMAR` (`amber`):** fecha vigente `PREPROGRAMADA_MES` cuya fecha de inicio de mes (`YYYY-MM-01`) está dentro de `<= config.dias_aviso_preprogramada_sin_confirmar` días (o ya inició el mes) y aún no tiene fecha `REAL` ni programación completa.
     - **`CONFLICTO_AUDITOR` (`rose`):** doble asignación en fechas reales superpuestas entre programas distintos.
     - **`DESFASE_DIAS_SPAN` (`amber`):** `delta !== 0` entre Cubo 1 y Cubo 2 o exceso de días asignados a un auditor sobre el span calendario real.

7. **Historial del Certificado + Evolución de Ciclos + Rotación ISO/IEC 17021-1:**
   - `buildCertificateAuditHistoryDigest(certId, currentAuditId, allPrograms, certDetail, rotationThreshold)`:
     - Incluye en cada ítem histórico si formó parte de un programa vinculado (`etiqueta`, `tipo_vinculacion`, `nivel_vinculacion`) para evidenciar la **evolución entre ciclos** (ej. `Año 1: Combinada → Año 2: Integrada`).
     - Detecta rotación de Auditor Líder usando `config.ciclos_rotacion_auditor_lider` (default `3`).

8. **Compatibilidad con `auditDomain.ts` y `auditExecution.ts`:**
   - Añadir a `ProgramacionAuditEntity` y `AuditFormDraft`: `id_programa_auditoria`, `fechas: AuditDateEntry[]`, `latestDate: AuditDateEntry | null`, `codigo_auditoria`, `tiempo_auditoria`, `estado_ciclo`, `objetivo`, `sitiosPlan: AuditoriaSitioPlanItem[]`.
   - Eliminar dependencias rígidas a `fecha_programacion` / `fecha_reprogramacion` como columnas de BD (manteniendo getters derivados compatibles si `resultadoView.ts` u otro consumidor de lectura requiere fecha legible).

---

## Pruebas Unitarias (`node:test`)
- `auditPlanningEngine.test.ts`:
  - Vinculación: rechazo de 2 organizaciones en `NIVEL_1_INTRA_ORG`, rechazo de 2 certs en `INDIVIDUAL`, aceptación en `NIVEL_2_INTER_ORG`, evolución `Combinada → Integrada`.
  - Multi-Fecha 1:N: `resolveLatestAuditDate` con múltiples `Reprogramación`, validación estricta `PREPROGRAMADA_MES` vs `REAL`.
  - Días-Auditor vs Span Calendario: `6.00d` / `2 auditores` en `3 días calendario` (válido y cuadrado) vs `4.00d` en `1 auditor` en `3 días` (alerta de span) + conflicto por solapamiento entre programas.
  - Filtro de certificados sin programar por `estatus` (`Activo`, `Estudio`, etc.).
  - Alertas configurables con distintos umbrales (`dias_aviso_proxima`, `dias_aviso_preprogramada_sin_confirmar`).
  - Máquina de estados vs tags, completitud híbrida e historial + rotación.
- `sitioDomain.test.ts` / `auditDomain.test.ts`:
  - Validación cruzada de certificado en `procesos_por_sitio` y compatibilidad de contratos actualizados.

---

## Criterios de Verificación de Step 2.1
1. `npx tsx --test src/lib/auditPlanningEngine.test.ts src/lib/auditDomain.test.ts src/lib/sitioDomain.test.ts` pasa al 100%.
2. `npm run lint` (`tsc --noEmit`) pasa con `0` errores y `0 any`.
3. `Sitio` Detail View administra correctamente `Procesos del Sitio`.
