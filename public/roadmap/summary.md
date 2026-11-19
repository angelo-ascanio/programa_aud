# Roadmap Maestro: Reestructuración Integral de Bloques `Auditoría` y `Certificación` (`programa_aud`)

> **Propósito del Documento:** Plano arquitectónico definitivo (basado en la inspección directa de `public/supabase/queries/00`–`07`, `src/main.ts`, `src/lib/*` y `src/views/*`) para introducir la entidad superior **`Conglomerado`** (`grupo_empresarial`) en el **Bloque 2 (`Certificación`)** y reestructurar íntegramente el **Bloque 1 (`Auditoría`)** en un pipeline estricto de etapas de una sola palabra con control de paralelismo, trazabilidad multi-anual sin `<select>` limitantes, conciliación a `0.25d`, resultados con fechas reales/plazos NC y cierre QA en **`Revisión`**.
> **Regla de Ejecución:** Todos los cambios se implementan de forma incremental siguiendo el orden del **Índice Maestro de Ejecución (Sección 6)** a través de los 25 pasos atómicos (`step_1.1.md` → `step_11.1.md`) y el cierre en `step_final.md`.

---

## 1. Visión Ejecutiva y Taxonomía de Pasos (Nombre Corto de 1 Palabra)

### 1.1 Nueva Estructura de Navegación Global

* **Bloque 2 — `Certificación`** *(Acceso: `ADMIN`, `WORKER`, `CLIENT` con alcance aislado; **`AUDITOR` NO tiene acceso**)*:
  1. **`Conglomerado`** *(Nuevo, #1)* — `#/certificacion/conglomerados`
  2. **`Organización`** — `#/certificacion/organizations`
  3. **`Certificado`** — `#/certificacion/certificates`
  4. **`Auditor`** — `#/certificacion/auditors`
* **Bloque 1 — `Auditoría`** *(Acceso: `ADMIN`, `WORKER`, `AUDITOR` asignado, `CLIENT` restringido a sus organizaciones)*:
  ```text
  Auditoría = {
    "Vínculo",
    "Designación" = { "Tipo", "Sitio", "Temporal" },
    "Tiempo",
    "Asignación",
    "Programa",
    "Calendario",
    "Resultado",
    "Revisión"
  }
  ```

### 1.2 Tabla Taxonómica Completa del Pipeline

| Orden / Paso | Nombre Corto (UI) | Bloque / Grupo | Subruta Hash Canonical | Prerrequisitos Bloqueantes | Regla de Salto / Paralelismo | Tablas Primarias en BD |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Paso 1** | **`Conglomerado`** | `Certificación` | `#/certificacion/conglomerados` | Ninguno (Raíz de agrupación) | **Insalvable.** Toda `organizacion` pertenece a un `grupo_empresarial` activo (auto-creado 1:1 si está sola). | `grupo_empresarial`, `organizacion` (`id_grupo_empresarial`) |
| **Paso 2** | **`Vínculo`** | `Auditoría` | `#/auditorias/vinculo` | Paso 1 (`organizacion.id_grupo_empresarial` activo) | **Insalvable.** Certificados `LIBRE` no pueden generar auditorías. | `programa_auditoria`, `certificado`, `auditoria` |
| **Paso 3** | **`Tipo`** | `Auditoría` → `Designación` | `#/auditorias/designacion/tipo` | Paso 2 (`INDIVIDUAL` o `VINCULADO`) | **Insalvable.** Corre **en paralelo con Paso 4 (`Sitio`)**. | `auditoria`, `auditoria_fecha`, `tipo_auditoria` |
| **Paso 4** | **`Sitio`** | `Auditoría` → `Designación` | `#/auditorias/designacion/sitio` | Paso 2 (`INDIVIDUAL` o `VINCULADO`) | **Insalvable.** Corre **en paralelo con Paso 3 (`Tipo`)**. | `sitios_por_auditoria`, `auditoria` (`tiene_sitio_temporal`) |
| **Paso 5** | **`Temporal`** | `Auditoría` → `Designación` | `#/auditorias/designacion/temporal` | Paso 3 done + `auditoria.tiene_sitio_temporal = TRUE` | **Opcional / Saltable.** Corre **en paralelo con Pasos 6, 7 y 8**. | `auditoria_sitio_temporal`, `auditoria_sitio_temporal_certificado` |
| **Paso 6** | **`Tiempo`** | `Auditoría` | `#/auditorias/tiempo` | Paso 3 (`Tipo`) **AND** Paso 4 (`Sitio`) | **Insalvable.** Corre **en paralelo con Pasos 5, 7 y 8**. | `sitios_por_auditoria`, `auditoria_sitio_temporal`, `auditoria` |
| **Paso 7** | **`Asignación`** | `Auditoría` | `#/auditorias/asignacion` | Paso 6 (`Tiempo`) + Paso 5 (si `tiene_sitio_temporal = TRUE`) | **Insalvable.** Corre **en paralelo con Pasos 5, 6 (otros sitios) y 8**. | `equipo_auditor_sitio`, `equipo_auditor_sitio_temporal`, `equipo_auditor` |
| **Paso 8** | **`Programa`** *(8A `Procesos`, 8B `Turnos`)* | `Auditoría` | `#/auditorias/programa` | Paso 3 (`Tipo`) **AND** Paso 4 (`Sitio`) | **Insalvable.** Corre **en paralelo con Pasos 5, 6 y 7**. | `procesos_sitio_auditoria`, `turnos_sitio_auditoria`, `turnos_proceso_sitio_auditoria` |
| **Paso 9** | **`Calendario`** | `Auditoría` | `#/auditorias/calendar` | Paso 3 (`Tipo` con al menos 1 fecha) | **Vista transversal.** Deep-link directo por badge de etapa. | `auditoria`, `auditoria_fecha`, `programa_auditoria` |
| **Paso 10** | **`Resultado`** | `Auditoría` | `#/auditorias/resultado` | Pasos 3, 4, 6, 7 y 8 completos (o en ejecución) | **Insalvable para cierre.** `Cerrada` + `fecha_cierre_auditoria` desbloquea Paso 11. | `auditoria_fecha` (`REAL`), `hallazgo`, `configuracion_alerta_auditoria`, `auditoria` |
| **Paso 11** | **`Revisión`** | `Auditoría` | `#/auditorias/revision` | Paso 10 cerrado (`estado_ciclo = 'Cerrada'`) | **Compuerta QA final.** Marca `revisado = TRUE` con verificación documental. | `auditoria` (campos QA `revisado*`) |

---

## 2. Delta Completo de Base de Datos (`00` – `07`)

### 2.1 Estado Actual (Ground Truth Inspeccionado) vs. Estado Objetivo

El codebase actual posee **44 tablas**, **37 tablas con soft-delete**, **39 tablas con `REVOKE DELETE`**, **182 triggers** y **131 políticas RLS**. A continuación se detalla el delta exacto sin abreviaciones:

#### A. Nuevas Tablas (6 tablas → total objetivo = **50 tablas**, **43 con soft-delete**)

1. **`public.grupo_empresarial`** *(Core soft-delete con `deleted_at`, `deleted_by`, `delete_reason`)*:
   * Columnas: `id UUID PK`, `codigo_grupo VARCHAR(40) NULL`, `nombre VARCHAR(220) NOT NULL`, `es_individual_auto BOOLEAN NOT NULL DEFAULT TRUE`, `notas TEXT NULL`, `created_at`, `updated_at`, `deleted_at`, `deleted_by`, `delete_reason`.
   * Triggers automáticos:
     * `trg_auto_asignar_grupo_organizacion` (`BEFORE INSERT ON organizacion`): si `NEW.id_grupo_empresarial IS NULL`, crea un registro en `grupo_empresarial` con `nombre = NEW.nombre`, `es_individual_auto = TRUE` y asigna su `id` a `NEW.id_grupo_empresarial`.
     * `trg_sincronizar_limpieza_grupo_empresarial` (`AFTER UPDATE OF id_grupo_empresarial, deleted_at ON organizacion`): cuando una organización cambia de `id_grupo_empresarial` o se archiva (`deleted_at IS NOT NULL`), si el grupo anterior queda con `0` organizaciones activas (`deleted_at IS NULL`), el sistema archiva automáticamente dicho `grupo_empresarial` con `delete_reason = 'Limpieza automática: grupo sin organizaciones activas'`.
2. **`public.vinculo`** *(Core soft-delete — Paso 2)*:
   * Columnas: `id UUID PK`, `id_grupo_empresarial UUID NOT NULL REFERENCES grupo_empresarial(id) ON DELETE RESTRICT`, `codigo_vinculo VARCHAR(40) NULL`, `etiqueta VARCHAR(180) NOT NULL`, `nivel_vinculacion VARCHAR(30)` (`INDIVIDUAL` | `NIVEL_1_INTRA_ORG` | `NIVEL_2_INTER_ORG`), `tipo_vinculacion VARCHAR(30)` (`Individual` | `Combinada` | `Integrada` | `Conjunta` | `Simultánea` | `Multientidad` | `Mixta`), `es_vinculada BOOLEAN NOT NULL`, `tiene_sitio_temporal BOOLEAN NOT NULL DEFAULT FALSE`, `notas TEXT NULL`, `created_at`, `updated_at`, `deleted_at`, `deleted_by`, `delete_reason`.
3. **`public.vinculo_certificado`** *(Child soft-delete — Paso 2)*:
   * Columnas: `id UUID PK`, `id_vinculo UUID NOT NULL REFERENCES vinculo(id) ON DELETE CASCADE`, `id_certificado UUID NOT NULL REFERENCES certificado(id) ON DELETE RESTRICT`, `created_at`, `updated_at`, `deleted_at`, `deleted_by`.
   * Índice único parcial `uq_vinculo_certificado_cert_active ON vinculo_certificado(id_certificado) WHERE deleted_at IS NULL`: define exactamente el estado **`LIBRE`** (sin fila activa), **`INDIVIDUAL`** (`es_vinculada = FALSE`) o **`VINCULADO`** (`es_vinculada = TRUE`).
4. **`public.auditoria_sitio_temporal`** *(Core soft-delete con `deleted_at`, `deleted_by`, `delete_reason`)*:
   * Columnas: `id UUID PK`, `id_auditoria UUID NOT NULL REFERENCES auditoria(id) ON DELETE CASCADE`, `etiqueta VARCHAR(180) NOT NULL DEFAULT 'Sitio Temporal'`, `comentario TEXT NULL`, `tiempo_auditoria NUMERIC(6,2) NOT NULL DEFAULT 0 CHECK (tiempo_auditoria >= 0 AND MOD((tiempo_auditoria * 4)::NUMERIC, 1) = 0)`, `created_at`, `updated_at`, `deleted_at`, `deleted_by`, `delete_reason`.
   * Trigger `trg_validar_sitio_temporal_auditoria`: verifica que la auditoría existe, está activa y tiene `tiene_sitio_temporal = TRUE`.
3. **`public.auditoria_sitio_temporal_certificado`** *(Child soft-delete con `deleted_at`, `deleted_by`)*:
   * Columnas: `id UUID PK`, `id_sitio_temporal UUID NOT NULL REFERENCES auditoria_sitio_temporal(id) ON DELETE CASCADE`, `id_auditoria_certificado UUID NOT NULL REFERENCES auditoria(id) ON DELETE RESTRICT`, `created_at`, `deleted_at`, `deleted_by`.
   * Trigger `trg_validar_sitio_temporal_certificado`: exige que `id_sitio_temporal -> id_auditoria` y `id_auditoria_certificado` pertenezcan exactamente al **mismo `id_programa_auditoria`** activo.
4. **`public.equipo_auditor_sitio_temporal`** *(Child soft-delete con `deleted_at`, `deleted_by`)*:
   * Columnas: `id UUID PK`, `id_sitio_temporal UUID NOT NULL REFERENCES auditoria_sitio_temporal(id) ON DELETE CASCADE`, `id_auditor UUID NOT NULL REFERENCES auditor(id) ON DELETE RESTRICT`, `rol_auditor VARCHAR(50) NOT NULL DEFAULT 'AUDITOR' CHECK (rol_auditor IN ('AUDITOR_LIDER', 'AUDITOR', 'AUDITOR_EN_ENTRENAMIENTO', 'EXPERTO_TECNICO'))`, `tiempo_auditoria NUMERIC(6,2) NOT NULL DEFAULT 0 CHECK (tiempo_auditoria >= 0 AND MOD((tiempo_auditoria * 4)::NUMERIC, 1) = 0)`, `created_at`, `updated_at`, `deleted_at`, `deleted_by`.
   * Trigger de sincronización hacia `public.equipo_auditor` extendido (`fn_sync_equipo_auditor_desde_sitios`) para que `is_assigned_auditor()` en RLS reconozca auditores asignados únicamente a un `Sitio Temporal`.

#### B. Tablas Existentes Alteradas (7 tablas)

| Tabla Existente | Delta Exacto de Columnas / Constraints / Triggers | Motivo Funcional |
| :--- | :--- | :--- |
| **`organizacion`** | Añadir `id_grupo_empresarial UUID NOT NULL REFERENCES public.grupo_empresarial(id) ON DELETE RESTRICT`. | Agrupación obligatoria bajo `Conglomerado` (Paso 1). |
| **`programa_auditoria`** | 1) Añadir `id_grupo_empresarial UUID NULL REFERENCES public.grupo_empresarial(id) ON DELETE RESTRICT` (poblado automáticamente desde las organizaciones).<br>2) Añadir `tiene_sitio_temporal BOOLEAN NOT NULL DEFAULT FALSE`.<br>3) Estandarizar `check_programa_tipo_vinculacion`: reemplazar `'Multisitio'` por `'Mixta'` (`'Individual'`, `'Combinada'`, `'Integrada'`, `'Conjunta'`, `'Simultánea'`, `'Multientidad'`, `'Mixta'`) con migración `UPDATE programa_auditoria SET tipo_vinculacion = 'Mixta' WHERE tipo_vinculacion = 'Multisitio'`.<br>4) Actualizar `fn_validar_auditoria_en_programa()` para exigir que en `NIVEL_2_INTER_ORG` todos los certificados compartan el **mismo `id_grupo_empresarial` activo**. | Paso 2 (`Vínculo`), temporal heredable y aislamiento de `Conglomerado`. |
| **`auditoria`** | 1) Añadir `tiene_sitio_temporal BOOLEAN NOT NULL DEFAULT FALSE` (heredado al insertar desde `programa_auditoria.tiene_sitio_temporal`, editable por auditoría en Paso 4).<br>2) Ampliar `estado_ciclo CHECK` añadiendo **`'Cerrada'`** (`'Borrador'`, `'En Programación'`, `'Programada'`, `'En Ejecución'`, `'Auditada'`, **`'Cerrada'`**, `'Reprogramada'`, `'Cancelada'`).<br>3) Añadir `fecha_cierre_auditoria DATE NULL`.<br>4) Añadir campos de Paso 11 (`Revisión`): `revisado BOOLEAN NOT NULL DEFAULT FALSE`, `fecha_revision DATE NULL`, `revisado_por UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL`, `documentacion_completa BOOLEAN NOT NULL DEFAULT FALSE`, `resumen_revision TEXT NULL`.<br>5) Trigger `trg_validar_cierre_y_revision_auditoria`: bloquea `'Cerrada'` sin `fecha_cierre_auditoria`; bloquea `revisado = TRUE` si `estado_ciclo <> 'Cerrada'` o `fecha_revision IS NULL`. | Pasos 4, 5, 10 (`Resultado`) y 11 (`Revisión`). |
| **`auditoria_fecha`** | 1) Ampliar `check_auditoria_fecha_tipo` de `('PREPROGRAMADA_MES', 'REAL')` a **`('PREPROGRAMADA_MES', 'PROGRAMADA_EXACTA', 'REAL')`**.<br>2) Migrar datos actuales: registros `'REAL'` de auditorías con `estado_ciclo NOT IN ('Auditada', 'Cerrada')` se reclasifican a `'PROGRAMADA_EXACTA'` para distinguir fechas **programadas/reprogramadas** (Paso 3) de fechas **reales ejecutadas** (Paso 10).<br>3) Actualizar `check_auditoria_fecha_payload` para validar fechas exactas en ambos (`PROGRAMADA_EXACTA` y `REAL`). | Separación estricta entre `Tipo` (Paso 3) y `Resultado` (Paso 10). |
| **`sitios_por_auditoria`** | Trigger opcional/RPC helper `ensure_default_principal_site_for_audit` que pre-selecciona el sitio con `numero_sitio = 0` al crear/abrir en Paso 4 (`Sitio`). Trigger `fn_recalcular_tiempo_auditoria` mantiene sincronizado `auditoria.tiempo_auditoria` = suma de sitios regulares + parte proporcional/atribuida de sitios temporales. | Paso 4 (`Sitio`) y Paso 6 (`Tiempo`). |
| **`configuracion_alerta_auditoria`** | Añadir `dias_limite_plan_accion INTEGER NOT NULL DEFAULT 15 CHECK (dias_limite_plan_accion BETWEEN 1 AND 180)` y `dias_limite_cierre_nc INTEGER NOT NULL DEFAULT 60 CHECK (dias_limite_cierre_nc BETWEEN 1 AND 365)`. | Cálculo automático parametrizable de fechas límite NC en Paso 10 (`Resultado`). |
| **`hallazgo`** | Añadir `id_sitio UUID NULL REFERENCES public.sitio(id) ON DELETE RESTRICT`, `fecha_limite_plan DATE NULL`, `fecha_entrega_plan DATE NULL`, `fecha_limite_cierre DATE NULL`, `fecha_cierre_real DATE NULL`. Trigger `BEFORE INSERT` autocalcula `fecha_limite_plan` y `fecha_limite_cierre` a partir de `MAX(fecha_fin)` donde `tipo_fecha = 'REAL'` en `auditoria_fecha` + offsets de `configuracion_alerta_auditoria` (cuando no se proveen manualmente). | Paso 10 (`Resultado`). |

#### C. Gobernanza Soft-Delete, DCL, Índices y RLS (`00`, `01`, `03`, `04`, `06`)
* **`00_delete_tables.sql`:** Añadir `DROP TABLE IF EXISTS public.equipo_auditor_sitio_temporal CASCADE;`, `auditoria_sitio_temporal_certificado`, `auditoria_sitio_temporal` antes de `auditoria`, y `grupo_empresarial` después de `organizacion`.
* **`01_creacion.sql`:** Registrar las 4 nuevas tablas en `v_core_tables`/`v_child_tables` (`fn_prevent_hard_delete`), en `v_guarded_parents` (`grupo_empresarial`, `auditoria_sitio_temporal`), en `get_archive_dependency_summary()`, en `trg_audit_log_*` (38 → 42 triggers `audit_log`) y `update_updated_at_column`.
* **`03_indices_optimizacion.sql`:** Añadir índices parciales únicos (`WHERE deleted_at IS NULL`) para `grupo_empresarial`, `auditoria_sitio_temporal`, `auditoria_sitio_temporal_certificado`, `equipo_auditor_sitio_temporal`, e índice compuesto en `auditoria (estado_ciclo, revisado) WHERE deleted_at IS NULL` + `auditoria_fecha (fecha_inicio, fecha_fin) WHERE tipo_fecha IN ('PROGRAMADA_EXACTA', 'REAL') AND deleted_at IS NULL`.
* **`04_rls.sql`:**
  * Añadir las 4 tablas a `REVOKE DELETE` (`39 → 43` tablas) y a `archive_record()` (`37 → 41` tablas).
  * **Regla Crítica de Aislamiento Nivel 2 (`CLIENT`) en `grupo_empresarial`:** Un usuario `CLIENT` puede leer `grupo_empresarial` **únicamente** si existe al menos una `organizacion` activa en ese grupo donde `public.has_client_org_access(o.id)` sea `TRUE`. A través de `organizacion_select` (`has_client_org_access(id)`), las demás organizaciones co-miembros del mismo conglomerado quedan **completamente invisibles** para el cliente.
  * **Regla Crítica `AUDITOR`:** `AUDITOR` sigue bloqueado del **Bloque 2 (`Certificación`)** en UI y su acceso SQL se limita únicamente a `organizacion` / `certificado` / `auditoria` / `auditoria_sitio_temporal` vinculados a auditorías donde `is_assigned_auditor(id_auditoria)` sea `TRUE`. En `grupo_empresarial`, `AUDITOR` solo lee si está asignado a una auditoría de alguna organización del grupo (o se restringe la vista UI exclusivamente a `ADMIN`/`WORKER`/`CLIENT`).

---

## 3. Máquina de Estados del Pipeline y Algoritmo de "Revivificación" Multi-Anual

### 3.1 Predicados Canónicos de Elegibilidad (`src/lib/pipelineEngine.ts` + SQL)

Sea una entidad `certificado` (`C`), su `organizacion` (`O`), su `grupo_empresarial` (`G`), su `programa_auditoria` (`P`) y una `auditoria` (`A`):

1. **Estado del Certificado (`CertCommitmentStatus`):**
   * `SIN_CONGLOMERADO` *(bloqueado — imposible si trigger DB está activo, validado en memoria)*: `!O.id_grupo_empresarial`.
   * `LIBRE`: `C` no tiene ninguna `auditoria` activa (`deleted_at IS NULL`) cuyo `programa_auditoria` represente un vínculo/campaña vigente no cancelado, O fue desvinculado para re-agrupación. *(Nota operacional: para ciclos históricos completados, un certificado vuelve a quedar elegible como `LIBRE` para crear un nuevo vínculo de ciclo futuro o continúa dentro de su vínculo activo).*
   * `INDIVIDUAL`: existe `P` activo con `nivel_vinculacion = 'INDIVIDUAL'` y `es_vinculada = FALSE` al cual `C` está adscrito.
   * `VINCULADO`: existe `P` activo con `es_vinculada = TRUE` (`NIVEL_1_INTRA_ORG` o `NIVEL_2_INTER_ORG`) que asocia a `C` junto con `>= 1` certificados del mismo `G`.
2. **Predicados por Paso sobre una Auditoría `A` (`AuditPipelineStageState`):**
   * `step1Ok` (`Conglomerado`): `Boolean(O.id_grupo_empresarial)`.
   * `step2Ok` (`Vínculo`): `P.deleted_at IS NULL && (P.nivel_vinculacion === 'INDIVIDUAL' || countActiveCerts(P) >= 2) && sameConglomerado(P)`.
   * `step3Ok` (`Tipo`): `Boolean(A.id_tipo_auditoria) && getActiveDates(A).some(d => d.tipo_fecha === 'PREPROGRAMADA_MES' || d.tipo_fecha === 'PROGRAMADA_EXACTA')`.
   * `step4Ok` (`Sitio`): `getActiveSitios(A).length >= 1`.
   * `step5Applicable` (`Temporal`): `A.tiene_sitio_temporal === true`.
   * `step5Ok`: `!step5Applicable || (getActiveTemporales(A).length >= 1 && getActiveTemporales(A).every(t => t.tiempo_auditoria > 0 && t.certificadoIds.length >= 1))`.
   * `step6Ok` (`Tiempo`): `step3Ok && step4Ok && getActiveSitios(A).every(s => s.tiempo_auditoria > 0)`.
   * `step7Ok` (`Asignación`): `step6Ok && (!step5Applicable || step5Ok) && getActiveSitios(A).every(s => isBalanced(s)) && (!step5Applicable || getActiveTemporales(A).every(t => isTemporalBalanced(t)))`.
   * `step8AOk` (`Programa → Procesos`): `step3Ok && step4Ok && getActiveSitios(A).every(s => getActiveProcesos(s).length >= 1)`.
   * `step8BOk` (`Programa → Turnos`): `step8AOk && getActiveSitios(A).every(s => getActiveProcesos(s).every(pr => getActiveTurnos(pr).length >= 1))`.
   * `step8Ok` (`Programa`): `step8AOk && step8BOk`.
   * `step10Ok` (`Resultado`): `getRealExecutionDates(A).length >= 1 && A.estado_ciclo === 'Cerrada' && Boolean(A.fecha_cierre_auditoria)`.
   * `step11Ok` (`Revisión`): `step10Ok && A.revisado === true && Boolean(A.fecha_revision)`.

### 3.2 Etapa Activa de 1 Palabra (`resolveCurrentPipelineStage(A)`)

Usada en **Calendario**, badges de tablas y navegación cruzada:
1. Si `!step1Ok` → **`Conglomerado`**
2. Si `!step2Ok` → **`Vínculo`**
3. Si `!step3Ok` → **`Tipo`**
4. Si `!step4Ok` → **`Sitio`**
5. Si `step5Applicable && !step5Ok` → **`Temporal`** *(nota: no bloquea paralelismo de 6/7/8, pero resalta pendiente)*
6. Si `!step6Ok` → **`Tiempo`**
7. Si `!step7Ok` → **`Asignación`**
8. Si `!step8Ok` → **`Programa`**
9. Si `A.estado_ciclo !== 'Cerrada'` (o falta fecha `REAL`) → **`Resultado`**
10. Si `!A.revisado` → **`Revisión`**
11. Si `step11Ok` → **`Finalizada`** (badge verde esmeralda de solo lectura con enlace a `Revisión`).

### 3.3 Algoritmo de "Revivificación" y Protección Anti-Error Multi-Anual (Pasos 3 y 4)

Dado que el equipo de operaciones pre-programa campañas a **3–5 años vista** (Etapa 1, Etapa 2, Seguimiento 1, Seguimiento 2, Renovación), `Tipo` (Paso 3) y `Sitio` (Paso 4) acumularán cientos de auditorías futuras. Para evitar que un coordinador seleccione por error una auditoría de `2029` en lugar de la de `2026`:

1. **Cálculo de Ventana de Urgencia (`computeAuditUrgencyBucket(latestDate, referenceDate)`):**
   * Normaliza `PREPROGRAMADA_MES (anio, mes)` al último día del mes para vencimiento y al día `1` para inicio.
   * Clasifica en buckets ordenados por prioridad numérica ascendente:
     * `0 — VENCIDA` (`daysUntil < 0`, rojo `bg-rose-50 text-rose-800 border-rose-300`)
     * `1 — PROXIMA_30D` (`0 <= daysUntil <= 30`, ámbar intenso `bg-amber-100 text-amber-900 border-amber-300`)
     * `2 — ESTE_TRIMESTRE` (`31 <= daysUntil <= 90`, ámbar claro `bg-amber-50 text-amber-800 border-amber-200`)
     * `3 — ESTE_ANIO` (`mismo año calendario && daysUntil > 90`, cielo `bg-sky-50 text-sky-800 border-sky-200`)
     * `4 — ANIO_MAS_1` (`targetYear === currentYear + 1`, pizarra `bg-slate-100 text-slate-700 border-slate-200`)
     * `5 — FUTURO_LEJANO` (`targetYear >= currentYear + 2`, pizarra tenue `bg-slate-50 text-slate-500 border-slate-200`)
2. **Ordenamiento Default Inmutable:** `urgencyBucket ASC`, luego `effectiveStartDate ASC` (la más inminente siempre en la fila #1).
3. **Filtro Default Activo (`"Próximas a ejecutar"`):** En `Tipo` y `Sitio`, al entrar por defecto se pre-activa el preset de visibilidad `PROXIMAS` (`urgencyBucket <= 3`, es decir, vencidas + próximos 90 días + año en curso), ocultando visualmente `Año +1` y `Año +2/+3` tras un selector segmentado explícito `[Próximas a ejecutar (N) | Preprogramadas | Futuro +1/+3 años | Todas]`. Si el usuario intenta editar un registro con `urgencyBucket >= 4`, se muestra un banner de confirmación no bloqueante: `"Atención: esta auditoría pertenece a un ciclo futuro (Año +N). Verifique que no corresponde al ciclo actual."`

---

## 4. Arquitectura de Navegación Cruzada, Submenú Anidado y Barra Stepper

### 4.1 Submenú de 3er Nivel (`Designación`) y Rutas Hash

* En `src/lib/healthCheck.ts` (`DomainNavItem`), añadir `children?: ReadonlyArray<DomainNavItem>` para renderizar grupos anidados de 3er nivel dentro del dropdown `Auditoría`:
  ```text
  Auditoría ▼
    ├─ 🔗 Vínculo              → #/auditorias/vinculo
    ├─ 🧭 Designación          → (Grupo contenedor)
    │     ├─ 🏷️ Tipo           → #/auditorias/designacion/tipo
    │     ├─ 📍 Sitio          → #/auditorias/designacion/sitio
    │     └─ ⏱️ Temporal       → #/auditorias/designacion/temporal
    ├─ ⏳ Tiempo               → #/auditorias/tiempo
    ├─ 👥 Asignación           → #/auditorias/asignacion
    ├─ 📋 Programa             → #/auditorias/programa
    ├─ 🗓️ Calendario           → #/auditorias/calendar
    ├─ 📊 Resultado            → #/auditorias/resultado
    └─ ✅ Revisión             → #/auditorias/revision
  ```
* `parseHashRoute()` en `src/main.ts` y `normalizeDomainSubview()` en `src/lib/accessControl.ts` se actualizan para leer 2 y 3 segmentos (`#/auditorias/designacion/tipo` → `route='auditorias'`, `subview='designacion/tipo'`), manteniendo redirecciones limpias de alias heredados (`scheduling` → `vinculo`, `findings` → `resultado`, `calendar` → `calendar`).
* **Breadcrumbs (`src/lib/breadcrumb.ts`):** Ampliar `BreadcrumbEntityType` con `'conglomerado'`, `'vinculo'`, `'sitio_temporal'`, `'programa_auditoria_certificado'`, `'revision_auditoria'` y agregar etiquetas para todas las nuevas subvistas (`designacion/tipo` → `Designación · Tipo`, etc.).

### 4.2 Barra Interactiva de Pipeline Stepper dentro de Todo Detail View

Dentro de `detailTemplate.ts` (`betweenZone2AndZone3Html` o `extraActionButtonsHtml`), toda ficha de detalle del Bloque 1 renderiza una **Barra Pipeline Stepper** responsiva que muestra las 8+ etapas del contexto actual (`programa_auditoria` y/o `auditoria` individual seleccionada):
* **Nivel Vínculo/Campaña (`programa_auditoria`):** `[Vínculo ✓]` → `[Tipo ●]` → `[Sitio ○]` → `[Temporal ○]` → `[Tiempo ○]` → `[Asignación ○]` → `[Programa (Por Cert.) ○]` → `[Resultado]` → `[Revisión]`
* **Transición Grupo ↔ Certificado Individual:** En pasos grupales (`Vínculo`, `Tipo`, `Sitio`, `Temporal`, `Tiempo`, `Asignación`), cada fila/tarjeta de certificado integrante incluye un selector rápido `"Ir a Auditoría Individual →"` que preserva `selectedProgramId` y `selectedAuditId` al saltar a `Programa` (Paso 8A/8B), `Resultado` (Paso 10) o `Revisión` (Paso 11), y un chip superior `"← Volver al Vínculo Grupal"` para regresar sin perder el contexto.

---

## 5. Blueprint UX Responsivo (`1440px` y `390px`) para `Sitio` (Paso 4) y `Programa` (Paso 8)

Un `<select>` nativo no soporta metadatos históricos ni proyecciones futuras de ciclo. Ambas vistas reemplazan `<select>` por componentes dedicados **sin desbordamiento horizontal**.

### 5.1 Selector Matriz de Sitios por Ciclo (`Designación → Sitio`, Paso 4)

* **Desktop (`1440px`):** Lista de tarjetas compactas en pila vertical (una tarjeta por sitio elegible del certificado, `Sitio 0 HQ` fijado arriba y pre-marcado). Cada tarjeta se divide en 2 zonas horizontales limpias (`flex-row justify-between items-center gap-4`):
  * **Izquierda (`min-w-0 flex-1`):** `[Checkbox] Sitio 0 (HQ) · Planta Valencia` + Dirección resumida + Micro-badges: `"Última auditoría: 18/11/2025 (Seg. 1)"` + `"Ciclo: 2/3 visitas"`.
  * **Derecha (`shrink-0`):** **Tira de Ciclo Multi-Anual** con botones de paginación horizontal `◀` `[2024 ✓]` `[2025 ✓]` **`[2026 ● Actual]`** `[2027 📅]` `[2028 ○]` `▶` (máximo 5 columnas visibles en ventana deslizante controlada por estado local `cycleWindowOffset`).
* **Mobile (`390px`):** La tarjeta cambia a `flex-col gap-2.5`. La cabecera (`Sitio 0 + Checkbox`) ocupa 100% de ancho, los micro-badges envuelven en `flex-wrap`, y la **Tira de Ciclo** ocupa una fila compacta de 4 columnas visibles (`◀ [2025 ✓] [2026 ●] [2027 📅] ▶`) evitando cualquier scroll horizontal de página (`overflow-x-hidden`).

```text
+----------------------------------------------------------------------------------+
| [x] Sitio 0 (HQ) · Planta Valencia               Ultima: 18/11/2025 · Ciclo: 2/3 |
|     Zona Industrial Carabobo, Valencia                                           |
|     [<]  2024: ✓ Aud. | 2025: ✓ Aud. | [2026: ● SELEC.] | 2027: 📅 Pre |  [>]    |
+----------------------------------------------------------------------------------+
```

### 5.2 Selector Asistido de Procesos (8A) y Multi-Turnos (8B) con Drawer Histórico (`Programa`, Paso 8)

* **Regla Anti-Rotura de 3 Columnas:** Nunca usar 3 columnas rígidas en pantallas medianas o móviles. Se utiliza una lista de tarjetas de proceso de **ancho completo con Drawer Colapsable bajo demanda** (`Ver Programa Anterior / Futuro`):
  * **Cabecera por Sitio Seleccionado + Acciones Rápidas:** Botones `"Seleccionar todos los Medulares"`, `"Seleccionar no auditados en el último año"`, `"Copiar del ciclo anterior"`.
  * **Tarjeta de Proceso (`1440px` y `390px`):**
    * Fila 1: `[Checkbox] Nombre del Proceso` + Badge de clasificación (`Estratégico` índigo / `Medular` cielo / `De Apoyo` pizarra / `Otro` neutro) + Badge de Alerta de Cobertura: **`⚠️ Nunca auditado`** (rosa/ámbar prioritario) o **`Hace 2 años (Seg. 1 - 2024)`** o **`Auditado 1 de 3 veces`**.
    * Fila 2: Mini-tira de ciclo (`Año -2 ✓` · `Año -1 —` · **`Actual ●`** · `Año +1 📅`) con flechas `◀ / ▶` y enlace toggle `"📂 Ver programa ciclo anterior / futuro"` que despliega inline el detalle de turnos y auditores de la visita anterior sin sacar al usuario de su flujo de selección.
  * **Mini-Paso 8B (`Turnos`):** Para cada proceso marcado en 8A, se muestran únicamente los turnos configurados en `turnos_por_sitio` como chips/checkboxes táctiles (`min-h-[36px]`) permitiendo `1..N` turnos simultáneos y mostrando el contador `X turnos asignados`.

---

## 6. Índice Maestro de Ejecución (`step_1.1.md` → `step_final.md`)

| Archivo Step | Nombre / Enfoque | Archivos Objetivo | Depende de | Criterio de Aceptación Clave |
| :--- | :--- | :--- | :--- | :--- |
| **`step_1.1.md`** | `Conglomerado` · BD, Triggers & RLS | `00`, `01`, `03`, `04` SQL | Baseline | `grupo_empresarial` activo, auto-bucket 1:1 en insert `organizacion`, auto-archivo de grupos vacíos, RLS `CLIENT` sin fugas. |
| **`step_1.2.md`** | `Conglomerado` · Dominio & Seed | `src/lib/conglomeradoDomain.ts`, `archiveGovernance.ts`, `06_datos_prueba.sql` | `step_1.1` | Lógica pura de fusión/re-agrupación, filtro organizaciones solas, pruebas `node:test` verdes. |
| **`step_1.3.md`** | `Conglomerado` · Vistas & Orquestación | `src/views/conglomeradoView.ts`, `organizacionView.ts`, `certificacionView.ts`, `header.ts`, `main.ts` | `step_1.2` | Tab #1 en `Certificación`, Clean List `table-fixed` sin botones en `<td>`, re-agrupación rápida en UI. |
| **`step_2.1.md`** | `Vínculo` · BD, Estatus & Temporal Flag | `01`, `03`, `04`, `06` SQL | `step_1.1` | `tiene_sitio_temporal` en `programa_auditoria`/`auditoria`, `'Mixta'` estándar, validación mismo `grupo_empresarial`. |
| **`step_2.2.md`** | `Vínculo` · Lógica de Compromiso | `src/lib/vinculoDomain.ts`, `auditPlanningEngine.ts`, `auditPlanningPersistence.ts` | `step_2.1`, `step_1.2` | Estados `LIBRE`/`INDIVIDUAL`/`VINCULADO`, bloqueo estricto de auditorías sobre `LIBRE`, filtro `Libre`. |
| **`step_2.3.md`** | `Vínculo` · UI & Navegación `Designación` | `src/views/vinculoView.ts`, `auditoriasView.ts`, `header.ts`, `accessControl.ts`, `breadcrumb.ts`, `main.ts` | `step_2.2`, `step_1.3` | Shell de Bloque 1 con submenú 3er nivel `Designación = {Tipo, Sitio, Temporal}`, Zero-UUID. |
| **`step_3.1.md`** | `Tipo` · BD Multi-Fecha & Enum Precisión | `01`, `03`, `06` SQL | `step_2.1` | `PREPROGRAMADA_MES` vs `PROGRAMADA_EXACTA` vs `REAL`, secuencia ilimitada `#1..#N`, migración segura. |
| **`step_3.2.md`** | `Tipo` · Dominio & "Revivificación" | `src/lib/designacionTipoDomain.ts`, `auditAlertsEngine.ts` | `step_3.1`, `step_2.2` | Clasificador de urgencia nearest-first, protección anti-+3 años, constructor de historial de reprogramaciones. |
| **`step_3.3.md`** | `Tipo` · UI `designacionTipoView.ts` | `src/views/designacionTipoView.ts`, `main.ts` | `step_3.2`, `step_2.3` | Filtro default `Próximas a ejecutar`, badge urgencia, tabla `Tipo` por certificado, línea temporal reprogramaciones. |
| **`step_4.1.md`** | `Sitio` · BD & Herencia Temporal | `01`, `04` SQL | `step_3.1` | Default `numero_sitio = 0`, override por auditoría `auditoria.tiene_sitio_temporal` heredado desde Paso 2. |
| **`step_4.2.md`** | `Sitio` · Dominio Matriz Multi-Anual | `src/lib/designacionSitioDomain.ts` | `step_4.1`, `step_3.2` | Cálculo por sitio de `última auditoría`, conteo en ciclo y celdas proyectadas `Año -2..Año +2`. |
| **`step_4.3.md`** | `Sitio` · UI Matrix Card Selector | `src/views/designacionSitioView.ts`, `main.ts` | `step_4.2`, `step_3.3` | Selector custom de sitios sin `<select>`, pager `◀/▶`, toggle `tiene_sitio_temporal`, responsive `390px`/`1440px`. |
| **`step_5.1.md`** | `Temporal` · BD, Triggers & RLS | `00`, `01`, `03`, `04`, `06` SQL | `step_4.1` | `auditoria_sitio_temporal`, `auditoria_sitio_temporal_certificado`, `archive_record`, `REVOKE DELETE`. |
| **`step_5.2.md`** | `Temporal` · Dominio & UI Completa | `src/lib/designacionTemporalDomain.ts`, `src/views/designacionTemporalView.ts`, `main.ts` | `step_5.1`, `step_4.3` | Lista solo `tiene_sitio_temporal = TRUE`, label default `"Sitio Temporal"`, `0.25d`, M:N certs, filtros pendientes. |
| **`step_6.1.md`** | `Tiempo` · Constraints & Dominio `0.25d` | `01` SQL, `src/lib/tiempoDomain.ts` | `step_4.2`, `step_5.1` | Compuerta `Step3 && Step4`, validación `0.25d`, suma sitios regulares + resumen temporal por certificado. |
| **`step_6.2.md`** | `Tiempo` · UI `tiempoView.ts` | `src/views/tiempoView.ts`, `main.ts` | `step_6.1`, `step_5.2` | Facets `Incompletos` / `Completos`, steppers `0.25d` por sitio, resumen tiempo temporal, Stepper Bar. |
| **`step_7.1.md`** | `Asignación` · BD Temporal Team & Dominio | `00`, `01`, `03`, `04` SQL, `src/lib/asignacionDomain.ts` | `step_6.1`, `step_5.1` | `equipo_auditor_sitio_temporal`, sync hacia `equipo_auditor`, conciliación estricta `SUM == asignado`, competencias/rotación. |
| **`step_7.2.md`** | `Asignación` · UI `asignacionView.ts` | `src/views/asignacionView.ts`, `main.ts` | `step_7.1`, `step_6.2` | Barras `Asignado Xd / Requerido Yd`, badges IAF/rotación, filtros `Sin asignar`/`Descuadrado`/`Completo`. |
| **`step_8.1.md`** | `Programa` · Dominio Historial Procesos | `src/lib/programaCertificadoDomain.ts` | `step_4.2` | Predicados `8A`/`8B`, `"Última vez auditado"`, `"Nunca auditado"`, frecuencia en ciclo por proceso. |
| **`step_8.2.md`** | `Programa` · UI Mini-Paso 8A `Procesos` | `src/views/programaProcesosView.ts`, `programaView.ts`, `main.ts` | `step_8.1`, `step_6.2` | Tarjetas enriquecidas restringidas a `procesos_por_sitio`, drawer colapsable ciclo anterior/futuro, acciones rápidas. |
| **`step_8.3.md`** | `Programa` · UI Mini-Paso 8B `Turnos` | `src/views/programaTurnosView.ts`, `programaView.ts`, `main.ts` | `step_8.2` | Multi-turno `1..N` por proceso seleccionado, filtros `Pend. Procesos` / `Pend. Turnos` / `Completos`. |
| **`step_9.1.md`** | `Calendario` · Multi-Granularidad & Stages | `src/views/calendarioView.ts`, `auditPlanningEngine.ts`, `main.ts` | `step_3.3`..`step_8.3` | Año / Trimestre (`Q1`–`Q4`) / Mes / Timeline con conteos y badges de etapa de 1 palabra clicables. |
| **`step_10.1.md`** | `Resultado` · BD Reales, NC & Cierre | `01`, `03`, `04`, `06` SQL | `step_3.1`, `step_7.1` | `auditoria_fecha` `'REAL'`, offsets configurables en `configuracion_alerta_auditoria`, fechas NC en `hallazgo`, `'Cerrada'`. |
| **`step_10.2.md`** | `Resultado` · Dominio & UI `resultadoView` | `src/lib/resultadoDomain.ts`, `src/views/resultadoView.ts`, `main.ts` | `step_10.1`, `step_7.2` | Fechas reales vs `Días-Auditor` multi-auditor, cálculo auto plazos NC, `fecha_cierre_auditoria` editable + botón `Cerrar`. |
| **`step_11.1.md`** | `Revisión` · BD, RLS, Dominio & UI QA | `01`, `03`, `04` SQL, `src/lib/revisionDomain.ts`, `src/views/revisionView.ts`, `main.ts` | `step_10.2` | Solo auditorías `Cerrada`, campos `revisado`, `fecha_revision`, `revisado_por`, `documentacion_completa`, `resumen_revision`. |
| **`step_final.md`** | Verificación Integral & Sync `public/doc/` | Suite completa + Playwright + `public/doc/*` | `step_11.1` | `reset-db`, `lint`, `test`, `build`, recorrido E2E de 11 pasos en 4 roles y checklist doc. |
