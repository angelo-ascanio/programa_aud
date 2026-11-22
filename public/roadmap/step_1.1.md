# Step 1.1 — Base de Datos: Compartición de `Contacto` y `Turno` dentro del Conglomerado

## 1. Objetivo y Alcance Estricto
Implementar exclusivamente la capa de esquema SQL, funciones de pertenencia, triggers de integridad de Conglomerado e índices parciales para compartir registros de **`Contacto` (`contacto_certificado`)** y **`Turno` (`turno`)** entre certificados del mismo **Conglomerado (`grupo_empresarial`)**.

**Límites estrictos:**
- **NO** modificar todavía `proceso`, `requisitos_por_proceso`, `sitio`, `procesos_por_sitio`, `02_cobertura_normativa.sql` ni `04_rls.sql` (corresponden a los Steps 1.2 y 1.3).
- **NO** modificar código TypeScript de `src/` en este paso.

---

## 2. Archivos Afectados
- `public/supabase/queries/01_creacion.sql`
- `public/supabase/queries/03_indices_optimizacion.sql`
- `public/supabase/queries/00_delete_tables.sql` *(solo si requiere listar las nuevas tablas en el comentario/orden de drop explícito previo al `DROP SCHEMA public CASCADE`)*

---

## 3. Decisiones Técnicas Detalladas

### 3.1 Nuevas Tablas Puente en `01_creacion.sql`
1. **`public.contacto_certificado_compartido`**:
   - Columnas:
     - `id UUID PRIMARY KEY DEFAULT uuid_generate_v4()`
     - `id_contacto UUID NOT NULL REFERENCES public.contacto_certificado(id) ON DELETE RESTRICT`
     - `id_certificado UUID NOT NULL REFERENCES public.certificado(id) ON DELETE RESTRICT` *(certificado destino que recibe acceso compartido al contacto)*
     - `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
     - `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
     - `deleted_at TIMESTAMPTZ DEFAULT NULL`
     - `deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL`
   - Nota de diseño: `contacto_certificado.id_certificado` se conserva intacto como certificado propietario/origen, garantizando compatibilidad 100% con contactos no compartidos (ej. Contacto "C").

2. **`public.turno_certificado_compartido`**:
   - Columnas:
     - `id UUID PRIMARY KEY DEFAULT uuid_generate_v4()`
     - `id_turno UUID NOT NULL REFERENCES public.turno(id) ON DELETE RESTRICT`
     - `id_certificado UUID NOT NULL REFERENCES public.certificado(id) ON DELETE RESTRICT` *(certificado destino)*
     - `id_certificado_origen UUID NULL REFERENCES public.certificado(id) ON DELETE SET NULL` *(trazabilidad opcional del certificado desde donde se compartió)*
     - `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
     - `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
     - `deleted_at TIMESTAMPTZ DEFAULT NULL`
     - `deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL`
   - Nota de diseño: `public.turno` es un catálogo global por horario `(hora_entrada, hora_salida)`. Esta tabla registra explícitamente la pertenencia compartida a un certificado para que aparezca en `Certificado Y → Turnos` y pueda vincularse/desvincularse limpiamente incluso antes de asignar el turno en `turnos_por_sitio`.

### 3.2 Funciones Helper de Pertenencia SQL (`STABLE SECURITY DEFINER`)
Crear funciones reutilizables (sin exposición de datos ajenos):
- `public.contacto_pertenece_a_certificado(p_id_contacto UUID, p_id_certificado UUID) RETURNS BOOLEAN`:
  - Retorna `TRUE` si existe `contacto_certificado` activo (`deleted_at IS NULL`) con `id = p_id_contacto` y `(id_certificado = p_id_certificado OR EXISTS (SELECT 1 FROM public.contacto_certificado_compartido ccc WHERE ccc.id_contacto = p_id_contacto AND ccc.id_certificado = p_id_certificado AND ccc.deleted_at IS NULL))`.
- `public.turno_pertenece_a_certificado(p_id_turno UUID, p_id_certificado UUID) RETURNS BOOLEAN`:
  - Retorna `TRUE` si el turno está activo y está vinculado al certificado ya sea vía `turnos_por_sitio` en un sitio del certificado o vía `turno_certificado_compartido` activo.

### 3.3 Triggers de Validación de Conglomerado e Integridad (`BEFORE INSERT OR UPDATE`)
1. **`fn_validar_contacto_compartido()` / `trg_validar_contacto_compartido`**:
   - Ignorar si `NEW.deleted_at IS NOT NULL`.
   - Verificar que `contacto_certificado` exista y `deleted_at IS NULL`; obtener `v_owner_cert_id`, `v_contact_nombre`, `v_owner_org`, `v_owner_grupo`.
   - Bloquear auto-compartición: si `NEW.id_certificado = v_owner_cert_id`, lanzar excepción descriptiva (`ERRCODE = 'P0001'`).
   - Verificar que el certificado destino exista, esté activo (`deleted_at IS NULL`) y su organización tenga `id_grupo_empresarial IS NOT NULL` y activa.
   - **Regla de Conglomerado:** Si `v_owner_grupo IS NULL OR v_target_grupo IS NULL OR v_owner_grupo IS DISTINCT FROM v_target_grupo`, lanzar excepción (`ERRCODE = 'P0001'`): solo se permite compartir entre certificados del mismo conglomerado.
   - **Regla anti-duplicado de nombre en destino:** Verificar que no exista otro contacto activo distinto en `NEW.id_certificado` (propio o ya compartido) con `LOWER(TRIM(nombre)) = LOWER(TRIM(v_contact_nombre))`.

2. **`fn_validar_turno_compartido()` / `trg_validar_turno_compartido`**:
   - Ignorar si `NEW.deleted_at IS NOT NULL`.
   - Verificar que `turno` (`NEW.id_turno`) y `certificado` (`NEW.id_certificado`) existan y estén activos (`deleted_at IS NULL`), con organización activa e `id_grupo_empresarial IS NOT NULL`.
   - Si `NEW.id_certificado_origen IS NOT NULL`, bloquear `NEW.id_certificado = NEW.id_certificado_origen` y validar que ambos certificados pertenezcan al mismo `id_grupo_empresarial` activo.

### 3.4 Soft-Delete, Triggers de Metadatos y `audit_log`
- Asegurar que `contacto_certificado_compartido` y `turno_certificado_compartido` tengan:
  - Triggers `trg_sync_soft_delete_*` (`fn_sync_soft_delete_child_metadata`).
  - Triggers `fn_prevent_hard_delete` (`BEFORE DELETE`).
  - Triggers de auditoría `audit_trigger_func()` (`AFTER INSERT OR UPDATE OR DELETE`).
  - Trigger `updated_at` si aplica al bloque estándar de tablas hijas.

### 3.5 Índices Parciales en `03_indices_optimizacion.sql`
- `CREATE UNIQUE INDEX IF NOT EXISTS uq_contacto_cert_compartido_active ON public.contacto_certificado_compartido (id_contacto, id_certificado) WHERE deleted_at IS NULL;`
- `CREATE INDEX IF NOT EXISTS idx_contacto_cert_compartido_cert ON public.contacto_certificado_compartido (id_certificado) WHERE deleted_at IS NULL;`
- `CREATE UNIQUE INDEX IF NOT EXISTS uq_turno_cert_compartido_active ON public.turno_certificado_compartido (id_turno, id_certificado) WHERE deleted_at IS NULL;`
- `CREATE INDEX IF NOT EXISTS idx_turno_cert_compartido_cert ON public.turno_certificado_compartido (id_certificado) WHERE deleted_at IS NULL;`

---

## 4. Criterios de Aceptación y Verificación
1. **Idempotencia SQL:** Ejecutar en orden `00_delete_tables.sql` → `01_creacion.sql` → `02_cobertura_normativa.sql` → `03_indices_optimizacion.sql` → `04_rls.sql` → `05_usuarios.sql` → `06_datos_prueba.sql` sin errores ni advertencias fatales; re-ejecutar `01` y `03` verificando idempotencia.
2. **Pruebas de Integridad en PostgreSQL:**
   - Compartir un `contacto_certificado` de Certificado X a Certificado Y del mismo conglomerado **permite** la inserción y `contacto_pertenece_a_certificado(contact_id, Y)` devuelve `TRUE`.
   - Intentar compartir hacia el mismo certificado origen o hacia un certificado de **otro conglomerado** es rechazado con `ERRCODE = 'P0001'`.
   - Intentar ejecutar `DELETE FROM public.contacto_certificado_compartido` o `turno_certificado_compartido` dispara `fn_prevent_hard_delete`.
   - Intentar compartir un contacto duplicando nombre activo en destino es rechazado limpiamente.
3. Verificar que los tests unitarios existentes (`npm run lint && npm test`) sigan pasando al 100%.
