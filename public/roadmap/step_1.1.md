# Step 1.1 — Esquema PostgreSQL, Triggers, RPC de Conglomerado y Semillas (`01`–`06`)

## 1. Objetivo y Alcance
Preparar la base de datos PostgreSQL / Supabase para soportar todas las simplificaciones y nuevas operaciones solicitadas en `public/prompting/future_changes.txt` sin romper compatibilidad con los datos existentes ni las compuertas ISO/IEC 17021-1:
1. Soportar plazos configurables de **`+15 días` (`Plan`)** y **`+45 días` (`Cierre`)** en `configuracion_alerta_auditoria` y disparadores asociados.
2. Permitir crear No Conformidades (`hallazgo`) en el flujo simplificado de `Resultado` seleccionando únicamente la **cláusula (`id_requisito`)**, haciendo `id_proceso` opcional (`NULL` permitido).
3. Alinear la compuerta de **`Revisión`** (`fn_validar_revision_auditoria` / columnas de `auditoria`) para guardar `fecha_revision` y comentario opcional (`resumen_revision`) de forma directa y consistente.
4. Proveer operación segura en base de datos para **remover/desvincular una organización de un `Conglomerado` multi-empresa** hacia un nuevo bucket individual (`es_individual_auto = TRUE`), validando integridad de vínculos Nivel 2 activos.
5. Enriquecer `06_datos_prueba.sql` con escenarios deterministas de `future_changes.txt` (incluyendo el conglomerado multi-empresa de 2 organizaciones con `3×{9001, 14001, 45001}` encadenados en sitios 1–3 y 2 certificados combinados en el 4º sitio, más fechas reales discretas y NCs simplificadas).

---

## 2. Archivos y Áreas Afectadas
- `public/supabase/queries/01_creacion.sql`
- `public/supabase/queries/03_indices_optimizacion.sql`
- `public/supabase/queries/04_rls.sql`
- `public/supabase/queries/06_datos_prueba.sql`
- `src/lib/phase11SqlMigration.test.ts` (ampliación de aserciones estructurales SQL)
- `src/lib/auditAlertsEngine.ts` (alineación de tipos/defaults de configuración NC)

---

## 3. Tareas Detalladas de Implementación

### 3.1 Configuración de Plazos NC (`+15 días` Plan / `+45 días` Cierre)
- En `public/supabase/queries/01_creacion.sql`:
  - Actualizar `public.configuracion_alerta_auditoria`:
    - Cambiar el `DEFAULT` de `dias_limite_cierre_nc` de `60` a `45` (y su restricción `CHECK` para permitir rango positivo razonable `BETWEEN 1 AND 365`).
    - Agregar columna `dias_limite_plan_nc INTEGER NOT NULL DEFAULT 15 CHECK (dias_limite_plan_nc BETWEEN 1 AND 180)` para parametrizar también el plazo de entrega del Plan de Acción desde el popup de `Resultado`.
  - Actualizar `fn_sincronizar_plazo_nc_auditoria()` y cualquier referencia con valor fijo `60` para leer dinámicamente `dias_limite_plan_nc` (fallback `15`) y `dias_limite_cierre_nc` (fallback `45`) calculados desde `MAX(auditoria_fecha.fecha_fin)` de tipo `'REAL'` (o fecha real más reciente).
  - Asegurar que esta actualización de plazos **no cree filas ni eventos adicionales en tablas de calendario**; los vencimientos se derivan solo para `Resultado` y `Resumen`.

### 3.2 Simplificación de `public.hallazgo` y `Revisión` en `public.auditoria`
- **`hallazgo` (`01_creacion.sql`):**
  - Cambiar `id_proceso UUID NOT NULL REFERENCES public.proceso(id)` → `id_proceso UUID REFERENCES public.proceso(id) ON DELETE RESTRICT` (permitiendo `NULL` cuando la NC se registra directamente por cláusula `id_requisito` en el flujo simplificado de `Resultado`).
  - Mantener `id_requisito UUID NOT NULL REFERENCES public.requisito(id)` y agregar soporte de fechas reales individuales por NC:
    - Reutilizar/asegurar `fecha_plan_accion` / `fecha_entrega_plan` (`DATE`, fecha real de entrega del Plan) y `fecha_cierre_real` (`DATE`, fecha real de cierre de la NC), manteniendo coherencia con `resultadoDomain.ts`.
- **`auditoria` y `fn_validar_revision_auditoria()` (`01_creacion.sql`):**
  - Revisar `fn_validar_revision_auditoria()` para que no lance excepciones artificiales cuando se registre `fecha_revision` y `resumen_revision` desde la vista simplificada de `Revisión`:
    - Si `fecha_revision` está informada, exigir únicamente consistencia temporal básica (`fecha_revision >= MIN(fecha_real)` solo si existen fechas reales, o validación no bloqueante si no se han cargado fechas reales aún, y RBAC `ADMIN`/`WORKER`).
    - Auto-reconciliar `documentacion_completa` / `fecha_cierre_auditoria` o desacoplar el bloqueo rígido heredado de `estado_ciclo <> 'Cerrada'`, manteniendo el registro de `usuario_revisor_id` cuando exista perfil staff válido.

### 3.3 Desvinculación Segura de Organización desde `Conglomerado`
- En `01_creacion.sql` y `04_rls.sql`:
  - Crear función `SECURITY DEFINER` `public.fn_desvincular_organizacion_conglomerado(p_id_organizacion UUID, p_motivo TEXT DEFAULT 'Separación administrativa')`:
    1. Verificar rol `ADMIN` o `WORKER` aprobado (`fn_is_approved_staff()`).
    2. Validar que la organización pertenezca actualmente a un `grupo_empresarial` con **más de 1 miembro activo** (si ya está sola, retornar error legible sin UUIDs).
    3. Verificar si la organización tiene algún certificado comprometido en un `vinculo_certificado` activo que también agrupe certificados de **otra** organización del mismo conglomerado (si existe cruce Nivel 2 activo, bloquear con mensaje claro indicando desvincular el `Vínculo` primero).
    4. Crear un nuevo `public.grupo_empresarial` con `es_individual_auto = TRUE`, `nombre = org.nombre`, `estatus = 'Activo'` y actualizar `organizacion.id_grupo_empresarial` al nuevo bucket.
    5. Registrar entrada en `public.audit_log` y otorgar `GRANT EXECUTE` a `authenticated`.
- Verificar que `fn_sincronizar_limpieza_grupo_empresarial` no archive el conglomerado padre si aún conserva al menos 1 miembro, y funcione limpiamente con la función de re-bucketing.

### 3.4 Índices y Políticas RLS (`03_indices_optimizacion.sql`, `04_rls.sql`)
- En `03_indices_optimizacion.sql`:
  - Índice parcial para consultas ordenadas por fecha más reciente de auditorías por certificado: `idx_auditoria_cert_recent (id_certificado, created_at DESC) WHERE deleted_at IS NULL`.
  - Índice para consulta rápida de `programa_auditoria` y vínculos por `id_grupo_empresarial`.
- En `04_rls.sql`:
  - Verificar permisos `SELECT/INSERT/UPDATE` de `configuracion_alerta_auditoria` para `ADMIN`/`WORKER` (y lectura para `AUDITOR`/`CLIENT` si aplica) preservando `REVOKE DELETE`.
  - Verificar políticas RLS sobre `hallazgo` cuando `id_proceso IS NULL` (las políticas no deben depender de `JOIN proceso` para filtrar acceso; deben validar vía `auditoria → organizacion`).

### 3.5 Semillas Deterministas (`06_datos_prueba.sql`)
- Actualizar `configuracion_alerta_auditoria` semilla con `dias_limite_plan_nc = 15`, `dias_limite_cierre_nc = 45`.
- Añadir/ajustar en `06_datos_prueba.sql` el escenario completo de pruebas descrito en `future_changes.txt`:
  - Un `Conglomerado` multi-empresa con 2 organizaciones (`Organización Grande` con 10 certificados: `3×3` encadenados `9001+14001+45001` en sitios principales 1..3 + 1 certificado en 4º sitio; y `Organización Pequeña` con 1 certificado `ISO 22000` en el 4º sitio, enlazados en un vínculo `COMBINADA` de 4º sitio).
  - Auditorías de prueba cubriendo fechas `REAL` discretas (ej. `2026-11-18`, `2026-11-19`, `2026-11-20`), hallazgos sin `id_proceso` (solo `id_requisito`) con `fecha_plan_accion`/`fecha_cierre_real`, y auditorías en distintos niveles de avance para probar `estatus_auditoria`.
- Ejecutar y comprobar que el flujo completo `00` → `07` sea idempotente (`ON CONFLICT DO NOTHING` / `DO UPDATE`).

---

## 4. Lista de Verificación
- [ ] `dias_limite_plan_nc = 15` y `dias_limite_cierre_nc = 45` definidos en `01_creacion.sql` y reflejados en `06_datos_prueba.sql`.
- [ ] `hallazgo.id_proceso` acepta `NULL` sin errores en triggers ni RLS.
- [ ] `fn_validar_revision_auditoria()` permite guardar `fecha_revision` + `resumen_revision` desde `ADMIN`/`WORKER` sin errores espurios.
- [ ] `fn_desvincular_organizacion_conglomerado` mueve una organización a un bucket individual 1:1 y protege vínculos Nivel 2 cruzados con mensaje libre de UUID.
- [ ] Tests de SQL en `src/lib/phase11SqlMigration.test.ts` y `src/lib/step101SqlSchema.test.ts` actualizados y pasando al 100%, más `npm run lint` y `npm run build` limpios.
