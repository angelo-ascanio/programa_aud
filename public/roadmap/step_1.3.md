# Step 1.3 — Base de Datos: `Sitio` Compartido, `procesos_por_sitio` por Certificado, Auditorías, Gobernanza Soft-Delete y RLS Nivel 2

## 1. Objetivo y Alcance Estricto
Completar la capa PostgreSQL añadiendo la compartición de **`Sitio` (`public.sitio`)** con resolución segura de `Sitio 0 (HQ)`, alcance por certificado en `procesos_por_sitio`, compatibilidad con los triggers de auditoría (`sitios_por_auditoria`, `procesos_sitio_auditoria`), gobernanza de archivo lógico (`archive_record` / `get_archive_dependency_summary`) y actualización integral de **políticas RLS (4 roles + aislamiento Nivel 2 `CLIENT`)** en `04_rls.sql`.

**Límites estrictos:**
- Ejecutar cambios únicamente en los archivos SQL indicados.
- **NO** implementar aún lógica frontend TypeScript en `src/` (inicia en Step 2.1).

---

## 2. Archivos Afectados
- `public/supabase/queries/01_creacion.sql`
- `public/supabase/queries/03_indices_optimizacion.sql`
- `public/supabase/queries/04_rls.sql`
- `public/supabase/queries/06_datos_prueba.sql` *(solo datos demostrativos mínimos e idempotentes de ejemplo compartición en conglomerado, preservando todas las cuentas e IDs existentes)*

---

## 3. Decisiones Técnicas Detalladas

### 3.1 Nueva Tabla Puente `public.sitio_certificado_compartido` (`01_creacion.sql`)
- Columnas:
  - `id UUID PRIMARY KEY DEFAULT uuid_generate_v4()`
  - `id_sitio UUID NOT NULL REFERENCES public.sitio(id) ON DELETE RESTRICT`
  - `id_certificado UUID NOT NULL REFERENCES public.certificado(id) ON DELETE RESTRICT` *(certificado destino)*
  - `numero_sitio INTEGER NOT NULL CHECK (numero_sitio >= 0)` *(número operativo del sitio dentro del certificado destino: permite asignar `>= 1` si el certificado destino ya posee su propio `Sitio 0 HQ`, o `0` si aún no tiene Sede Principal)*
  - `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
  - `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
  - `deleted_at TIMESTAMPTZ DEFAULT NULL`
  - `deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL`
- Función helper:
  - `public.sitio_pertenece_a_certificado(p_id_sitio UUID, p_id_certificado UUID) RETURNS BOOLEAN`: `TRUE` si `sitio` está activo (`deleted_at IS NULL`) y (`s.id_certificado = p_id_certificado` OR existe fila activa en `sitio_certificado_compartido`).
- Trigger `fn_validar_sitio_compartido()`:
  - Valida `sitio` y `certificado` destino activos, bloquea auto-compartición, exige mismo `id_grupo_empresarial` activo entre organización del sitio origen y del certificado destino.
  - Si `NEW.numero_sitio IS NULL`, asigna automáticamente `0` si `NEW.id_certificado` no tiene `Sitio 0` activo (ni propio ni compartido), o `MAX(numero_sitio) + 1` sobre sitios propios + compartidos del certificado destino.
  - Valida unicidad de `NEW.numero_sitio` dentro de todos los sitios activos (propios en `sitio` + compartidos en `sitio_certificado_compartido`) de `NEW.id_certificado`.
  - Igualmente en `sitio` (`BEFORE INSERT OR UPDATE`), validar que `sitio.numero_sitio` no colisione con ningún `sitio_certificado_compartido.numero_sitio` activo del mismo certificado.

### 3.2 Alcance por Certificado en `public.procesos_por_sitio` (`01_creacion.sql`)
- Añadir columna **`id_certificado UUID REFERENCES public.certificado(id) ON DELETE RESTRICT`** a `public.procesos_por_sitio`:
  - Backfill idempotente desde `sitio.id_certificado` para filas existentes y aplicar `NOT NULL`.
  - Trigger `BEFORE INSERT` para autocompletar `NEW.id_certificado := s.id_certificado` cuando el caller legado no envíe `id_certificado`.
- Actualizar índice único en `03_indices_optimizacion.sql`:
  - Reemplazar unicidad antigua `(id_sitio, id_proceso)` por `uq_procesos_por_sitio_cert_active ON public.procesos_por_sitio (id_certificado, id_sitio, id_proceso) WHERE deleted_at IS NULL;` y crear índice lookup `(id_certificado, id_sitio)`.
  - Razón crítica: si un Sitio `S` es compartido entre Cert X (ISO 9001) y Cert Y (ISO 14001), Cert Y puede vincular solo los procesos pertinentes a Y en `S` sin afectar ni contaminar la matriz `S × Procesos` de Cert X.
- Actualizar **`fn_validar_proceso_por_sitio_certificado()`**:
  - Verificar `public.sitio_pertenece_a_certificado(NEW.id_sitio, NEW.id_certificado)` y `public.proceso_pertenece_a_certificado(NEW.id_proceso, NEW.id_certificado)`.

### 3.3 Compatibilidad de Triggers de Planificación/Ejecución de Auditorías (`01_creacion.sql`)
Actualizar estrictamente la comprobación de pertenencia al certificado en:
1. **`fn_validar_sitio_auditoria_certificado()`** (`sitios_por_auditoria`): usar `public.sitio_pertenece_a_certificado(NEW.id_sitio, v_cert_auditoria)` en lugar de `v_cert_auditoria IS DISTINCT FROM v_cert_sitio`.
2. **`fn_validar_proceso_sitio_auditoria_certificado()`** (`procesos_sitio_auditoria`): verificar que `pps.id_certificado = v_cert_auditoria` y `public.proceso_pertenece_a_certificado(v_proceso_del_sitio, v_cert_auditoria)`.
3. **`fn_auto_asignar_sitio_principal_auditoria()`**: al pre-seleccionar `Sitio 0 (HQ)` en una auditoría nueva, buscar primero `sitio` propio con `numero_sitio = 0`, y si no existe propio, buscar en `sitio_certificado_compartido` con `numero_sitio = 0`.
4. Verificar `fn_validar_turno_sitio_auditoria()` (`turnos_sitio_auditoria`): ya valida `v_sitio_aud = v_sitio_turno` sobre `id_sitio`, por lo que al permitir `sitios_por_auditoria` sobre sitios compartidos, los `turnos_por_sitio` físicos del sitio compartido operan sin conflicto.

### 3.4 Gobernanza de Archivo Lógico (`archive_record`, `get_archive_dependency_summary`, `fn_guard_parent_archival`, `audit_log`)
- En `01_creacion.sql`:
  - Registrar las 4 tablas `*_compartido` (`contacto_certificado_compartido`, `turno_certificado_compartido`, `proceso_certificado_compartido`, `sitio_certificado_compartido`) con `fn_prevent_hard_delete`, `fn_sync_soft_delete_child_metadata` y `audit_trigger_func`.
  - En `get_archive_dependency_summary` + `fn_guard_parent_archival`:
    - `WHEN 'contacto_certificado'`: añadir conteo de comparticiones activas en `contacto_certificado_compartido`.
    - `WHEN 'turno'`: añadir conteo de comparticiones activas en `turno_certificado_compartido`.
    - `WHEN 'proceso'`: añadir conteo de comparticiones activas en `proceso_certificado_compartido`.
    - `WHEN 'sitio'`: añadir conteo de comparticiones activas en `sitio_certificado_compartido`.
    - `WHEN 'certificado'`: incluir comparticiones activas salientes/entrantes si aplica o validar limpieza previa.
    - Permitir desvincular (`archive_record`) limpiamente sobre las 4 tablas `*_compartido`.
- En `04_rls.sql`:
  - Añadir las 4 tablas a `REVOKE DELETE` (`PUBLIC`, `anon`, `authenticated`) y a la lista permitida de `public.archive_record(TEXT, UUID, TEXT)`.

### 3.5 Políticas RLS + Aislamiento Nivel 2 `CLIENT` (`04_rls.sql`)
1. **Políticas `SELECT / INSERT / UPDATE` para las 4 tablas `*_compartido`:**
   - `INSERT` / `UPDATE`: estrictamente `public.is_approved_worker()` / `is_approved_admin()`.
   - **`SELECT` con Aislamiento Nivel 2 sin fugas:**
     - `ADMIN` y `WORKER` aprobados ven todas las filas activas (`ADMIN` también archivadas).
     - `CLIENT`: solo ve filas de `*_certificado_compartido` cuyo `id_certificado` pertenece a una organización autorizada (`EXISTS (SELECT 1 FROM public.certificado c WHERE c.id = tabla.id_certificado AND c.deleted_at IS NULL AND public.has_client_org_access(c.id_organizacion))`). **Nunca** ve filas puente apuntando a otras organizaciones hermanas no autorizadas.
     - `AUDITOR`: solo ve filas cuyo `id_certificado` pase `public.is_auditor_for_cert(id_certificado)`.
2. **Actualización de políticas `SELECT` en tablas padre/hijas:**
   - `contacto_certificado` (y `telefono_contacto_certificado`, `email_contacto_certificado`): `CLIENT` / `AUDITOR` ven el contacto si `has_client_org_access` o `is_auditor_for_cert` aplica sobre `c.id_certificado` propietario **OR** sobre cualquier certificado destino activo en `contacto_certificado_compartido`!
   - `proceso` y `requisitos_por_proceso`:
     - `proceso_select`: visible para `CLIENT`/`AUDITOR` vía propietario **OR** `proceso_certificado_compartido`.
     - `req_proceso_select`: verificar acceso sobre **`requisitos_por_proceso.id_certificado`** (no solo `p.id_certificado`!) para que Client B pueda leer las cláusulas de `P` correspondientes al certificado Y de Org B, **sin ver jamás las cláusulas de `P` en Certificado X de Org A**!
   - `sitio`, `turnos_por_sitio`, `procesos_por_sitio`:
     - `sitio_select` y `turnos_sitio_select`: visible vía propietario **OR** `sitio_certificado_compartido`.
     - `procesos_por_sitio_select`: visible vía `procesos_por_sitio.id_certificado` (garantizando aislamiento Nivel 2 entre Org A y Org B en sitios compartidos).

---

## 4. Criterios de Aceptación y Verificación
1. **Ejecución limpia e idempotente** de toda la secuencia SQL `00`–`07` y verificación del conteo esperado de políticas RLS, índices parciales y triggers `fn_prevent_hard_delete` / `REVOKE DELETE`.
2. **Aislamiento Nivel 2 (`CLIENT`) y `AUDITOR`:**
   - Con un contacto/proceso/sitio compartido de Org A (Cert X) a Org B (Cert Y), un usuario `CLIENT` autorizado solo en Org B:
     - Puede hacer `SELECT` del contacto/proceso/sitio y de sus `requisitos_por_proceso` de Cert Y.
     - Obtiene `0` filas de `requisitos_por_proceso` de Cert X y `0` filas de `*_compartido` que apunten a Cert X / otras orgs.
     - No puede ejecutar `INSERT`/`UPDATE` ni `archive_record` sobre tablas puente (rechazado por RLS).
3. **Auditoría en Sitio/Proceso Compartido:** Insertar `sitios_por_auditoria` y `procesos_sitio_auditoria` en Cert Y apuntando a un `sitio` y `proceso` compartidos desde Cert X funciona sin error; en un certificado de otro conglomerado falla por trigger.
4. `npm run lint && npm test` en verde.
