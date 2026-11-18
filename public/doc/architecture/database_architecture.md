# Arquitectura de Base de Datos y Motor Normativo (`programa_aud`)

> Documento técnico complementario de [`project_resume.md`](../project_resume.md). Detalla la capa de persistencia en **PostgreSQL (Supabase)** implementada en `public/supabase/queries/` (`00_delete_tables.sql` a `07_normas_requisitos_csv.sql`), incorporando el esquema normalizado de **44 tablas**, la arquitectura 1:N de **Programas, Fechas, Alertas y Planificación Sitio–Proceso (`procesos_por_sitio`)**, el catálogo normativo bilingüe (`requisito` + `requisito_traduccion`), el motor descendente `LTREE` de cobertura normativa, las guardias ISO 17021-1 / ISO 4.3, la arquitectura **Soft-Delete en 37 tablas** y la protección anti-escalamiento RBAC.

---

## 1. Secuencia de Despliegue SQL (`00` – `07`)

Los 8 scripts en `public/supabase/queries/` se ejecutan de forma determinista y en orden lexicográfico estricto (tanto en el SQL Editor de Supabase como vía `POST /api/reset-db`):

| Orden | Archivo | Propósito Principal |
| :---: | :--- | :--- |
| 0 | `00_delete_tables.sql` | Reinicio limpio del esquema `public` (`DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;`) y restauración de privilegios base para `postgres`, `anon`, `authenticated`, `service_role` y `public`. |
| 1 | `01_creacion.sql` | Extensiones (`uuid-ossp`, `ltree`), 3 tipos `ENUM`, **44 tablas relacionales**, columnas `deleted_at`/`deleted_by`/`delete_reason`, `handle_new_user()`, **182 triggers vivos** en `pg_trigger` (prevención de hard-delete en **36 tablas**, sincronización soft-delete en **37 tablas**, `get_archive_dependency_summary()` y `fn_guard_parent_archival()` en **23 tablas padre**, `fn_protect_profile_rbac_fields()`, integridad programa/fechas 1:N, integridad sitio-proceso `procesos_por_sitio` y sincronización automática hacia `equipo_auditor`, guardias ISO 4.3 `fn_guard_req_proceso_against_exclusion` / `fn_smart_prune_process_clauses_on_exclusion`, `audit_log` inmutable con **38 triggers de auditoría** y **31 triggers `updated_at`**). |
| 2 | `02_cobertura_normativa.sql` | Motor jerárquico descendente de cobertura `LTREE` ejecutado en **`SECURITY INVOKER`** (`evaluar_cobertura_certificado`, `cobertura_normativa_certificado`, `resumen_cobertura_certificado`) y funciones de validación de competencias técnicas de auditores (`auditor_esta_calificado`, `auditores_calificados_para_certificado`) filtrando registros archivados (`deleted_at IS NULL`). |
| 3 | `03_indices_optimizacion.sql` | **90 índices especializados** en script (**135 índices vivos** totales incluyendo claves primarias y restricciones): **33 índices únicos parciales** (`WHERE deleted_at IS NULL`) más **57 índices `GiST`, `GIN` y `B-tree`** (sumando **77 índices parciales `WHERE deleted_at IS NULL`** en `03`) sobre jerarquía `LTREE`, cobertura obligatoria, traducciones ES/EN, Sitio 0, `procesos_por_sitio`, programas, `auditoria_fecha`, planificación por sitio/proceso y bitácora forense. |
| 4 | `04_rls.sql` | Doble capa DCL (`REVOKE DELETE` en **39 tablas** + `GRANT` + `REVOKE EXECUTE` sobre `PUBLIC`/`anon` en cobertura/RPCs críticos) y Row Level Security (`ENABLE ROW LEVEL SECURITY`) en las **44 tablas**, **7 funciones auxiliares `SECURITY DEFINER`**, RPC `archive_record(p_table, p_record_id, p_reason)` sobre **37 tablas** (**20** núcleo + **17** hijas/acceso), RPC transaccional **`declarar_no_aplicable_con_mutacion`**, y **131 políticas granulares** incluyendo aislamiento **Nivel 2 Inter-Org** para `CLIENT`. |
| 5 | `05_usuarios.sql` | Limpieza e inserción de las 4 cuentas de prueba confirmadas en `auth.users` y `public.profiles` (`ADMIN`, `WORKER`, `AUDITOR`, `CLIENT`) con contraseña `Password123*`. |
| 6 | `06_datos_prueba.sql` | Semillero idempotente compatible con índices únicos parciales (`ON CONFLICT (...) WHERE deleted_at IS NULL`) para catálogos, sub-sectores IAF, acreditaciones, normas, cláusulas base `ltree`, auditores con competencias M:N, organizaciones (`Iberometal Componentes S.A.`, `CyberCloud Solutions S.L.`, `Example, C.A.`), acceso cliente, certificados con `id_subsector_iaf` y `alcance`, `fecha_certificado`, `contacto_certificado`, Sitios (con Sitio 0), procesos, **10 vínculos `procesos_por_sitio`**, configuración de alertas **`DEFAULT`**, **5 programas de auditoría** (`PROG-2024-001`, `PROG-2025-001`, `PROG-2026-001`, `PROG-2026-002` Nivel 2 Inter-Org, `PROG-2026-003`), `auditoria_fecha` 1:N (`PREPROGRAMADA_MES` y `REAL`/`Reprogramación`), sitios/turnos/procesos por auditoría, equipos Dual-Bucket (`equipo_auditor_sitio` + `equipo_auditor_proceso_sitio`) y hallazgos. |
| 7 | `07_normas_requisitos_csv.sql` | Script SQL generado deterministamente por `scripts/buildNormasSeed.ts` (`5,261` líneas, `~1.33 MB`) con `UPSERT` topológico idempotente para las **8 normas canónicas**, **2,188 cláusulas `LTREE` (`requisito`: `1,673` obligatorias / `515` informativas)** y **2,684 traducciones HTML bilingües ES/EN (`requisito_traduccion`)**, preservando 7 UUIDs históricos y cualquier override `obligatorio_origen = 'MANUAL'`. |

---

## 2. Infraestructura Base, Extensiones, Tipos Enumerados y Zero-UUID (`01_creacion.sql`)

### 2.1 Extensiones PostgreSQL y Claves Zero-UUID
- **`uuid-ossp`:** Generación automática de claves primarias UUID v4 en base de datos mediante `uuid_generate_v4()` (y UUIDs deterministas RFC 4122 v4 en `07_normas_requisitos_csv.sql` vía FNV-1a de 128 bits). El diseño **Zero-UUID** prohíbe exponer estos UUIDs en la interfaz de usuario o generar identificadores sintéticos en cliente; toda FK se valida mediante `isValidUuid()` / `assertValidUuid()`.
- **`ltree`:** Almacenamiento e indexación `GiST` (`idx_requisito_ruta_gist`) de rutas jerárquicas materializadas para cláusulas normativas ISO (ej. `4`, `4.4_1`, `5.5_1`, `8.8_5`, `A.A_5.A_5_1`), usada en navegación documental y propagación descendente `<@` del motor de cobertura e ISO 4.3.

### 2.2 Tipos Enumerados (`public.*`)
- **`public.user_status`:** `'PENDING'`, `'APPROVED'`, `'REJECTED'`.
- **`public.user_role`:** `'ADMIN'`, `'WORKER'`, `'AUDITOR'`, `'CLIENT'`.
- **`public.tipo_hallazgo`:** `'NC_MAYOR'`, `'NC_MENOR'`, `'OBSERVACION'`, `'OPORTUNIDAD_MEJORA'`.

### 2.3 Identidad de Usuarios, Máquina de Estados y Protección RBAC
- **`public.profiles`:** Extiende `auth.users(id)` (`ON DELETE CASCADE`) con `nombre`, `role` (`DEFAULT 'CLIENT'`), `status` (`DEFAULT 'APPROVED'`), `created_at` y `updated_at`.
- **Trigger `on_auth_user_created` (`public.handle_new_user()`):** Se ejecuta `AFTER INSERT ON auth.users`; asigna `APPROVED` inmediato a `CLIENT` y fuerza `PENDING` para `ADMIN`, `WORKER` o `AUDITOR`.
- **Guardia anti-escalamiento `trg_protect_profile_rbac_fields` (`public.fn_protect_profile_rbac_fields()`):** Trigger `BEFORE UPDATE ON public.profiles` que bloquea cualquier alteración de `role` o `status` si quien ejecuta no cumple `public.is_approved_admin()`.

---

## 3. Modelo Entidad-Relación: 44 Tablas y Gobernanza Soft-Delete

- **20 tablas núcleo (`v_core_tables`) con retención completa (`deleted_at`, `deleted_by`, `delete_reason`) y `fn_prevent_hard_delete`:**  
  `norma`, `requisito`, `sector_iaf`, `subsector_iaf`, `organismo_acreditacion`, `acreditacion_norma`, `estatus`, `tipo_auditoria`, `metodologia_auditoria`, `auditor`, `organizacion`, `certificado`, `fecha_certificado`, `contacto_certificado`, `sitio`, `proceso`, `turno`, **`programa_auditoria`**, `auditoria`, `hallazgo`.
- **17 tablas operativas hijas y acceso habilitadas en `archive_record` (`04_rls.sql`):**  
  - **16 tablas hijas (`v_child_tables`) con retención (`deleted_at`, `deleted_by`), `fn_prevent_hard_delete` y `REVOKE DELETE`:** `requisito_traduccion`, `acreditacion_norma_sector_iaf`, `requisitos_no_aplicables_certificado`, `turnos_por_sitio`, **`procesos_por_sitio`**, **`auditoria_fecha`**, **`configuracion_alerta_auditoria`**, `comentarios_por_auditoria`, `sitios_por_auditoria`, `turnos_sitio_auditoria`, `procesos_sitio_auditoria`, **`turnos_proceso_sitio_auditoria`**, **`equipo_auditor_sitio`**, **`equipo_auditor_proceso_sitio`**, `telefono_contacto_certificado`, `email_contacto_certificado`.
  - **1 tabla de acceso cliente con sincronización `trg_sync_soft_delete_client_organization_access`, `REVOKE DELETE` y `archive_record`:** `client_organization_access`.
- **5 tablas de enlace M:N puras (únicas tablas con `DELETE` físico habilitado para desvinculación/sincronización/podado):**  
  `norma_auditor`, `sector_iaf_auditor`, `subsector_iaf_auditor`, `requisitos_por_proceso`, `equipo_auditor` (ahora mantenida automáticamente como tabla resumen sincronizada desde `equipo_auditor_sitio` y `equipo_auditor_proceso_sitio`).

### 3.1 Gobernanza e Identidad (2 tablas)
| Tabla | Propósito | Claves / Gobernanza Destacada |
| :--- | :--- | :--- |
| `public.profiles` | Perfil operativo, rol RBAC y estado de aprobación del usuario autenticado. | `id PK FK auth.users(id)`, `trg_protect_profile_rbac_fields`, `audit_profiles_trigger`, `REVOKE DELETE` |
| `public.audit_log` | Bitácora forense inmutable (`INSERT`, `UPDATE`, `DELETE` incluyendo vínculos podados por Smart Mutation) con `old_data`/`new_data` (`JSONB`), `performed_by` y `performed_at`. | `id BIGINT IDENTITY PK`, `trg_audit_log_immutable`, `REVOKE DELETE` |

### 3.2 Dominio 1: Catálogos Maestros, Traducciones, Acreditación y Competencias (15 tablas)
| Tabla | Propósito | Retención / Claves Destacadas |
| :--- | :--- | :--- |
| `norma` | Normas certificables (`codigo`, `titulo`, `esquema`, `fecha_publicacion`, `estatus`, `norma`). | Soft-delete completo + guardia de archivo; `uq_norma_codigo_active`; `trg_norma_sync_codigo_titulo` |
| `requisito` | Cláusulas normativas jerárquicas (`explicit_code BOOLEAN`, `external_key VARCHAR(100)`, `es_obligatorio BOOLEAN NOT NULL DEFAULT TRUE`, `obligatorio_origen VARCHAR(20)`). | Soft-delete completo + guardia; `ruta_materializada LTREE`; `chk_requisito_obligatorio_origen`; `uq_requisito_norma_codigo_active`; `uq_requisito_external_key_active` |
| `requisito_traduccion` | Contenido normativo bilingüe HTML (`lang IN ('es', 'en')`, `title VARCHAR(500)`, `content_html TEXT` con `{clause_...}`). | Soft-delete hijo + `fn_prevent_hard_delete` + `audit_requisito_traduccion_trigger`; `uq_requisito_traduccion_lang_active` |
| `sector_iaf` | Sectores productivos IAF principales (`sector INTEGER`). | Soft-delete completo + guardia; `uq_sector_iaf_numero_active` |
| `subsector_iaf` | Sub-sectores IAF jerárquicos (`17.1`, `17.2`, `28.1`, `33.1`) con riesgo (`ALTO`, `MEDIO`, `BAJO`). | Soft-delete completo + guardia; `id_sector_iaf FK RESTRICT`; `uq_subsector_codigo_active` |
| `organismo_acreditacion` | Entidades acreditadoras (`codigo`, `nombre`, `pais`, `sitio_web`). | Soft-delete completo + guardia; `uq_organismo_codigo_active` |
| `acreditacion_norma` | Acreditaciones por organismo y norma certificable. | Soft-delete completo + guardia |
| `acreditacion_norma_sector_iaf` | Alcance multisector M:N de cada acreditación. | Soft-delete hijo + `fn_prevent_hard_delete`; `uq_acreditacion_sector_active` |
| `estatus` | Estados operativos canónicos (`Activo`, `Estudio`, `Suspendido`, `Cancelado`, `Planificado`, `En Ejecución`, `En Espera`, `Inactivo`). | Soft-delete completo + guardia; `uq_estatus_nombre_active` |
| `tipo_auditoria` | Modalidades de ciclo (`Etapa 1`, `Etapa 2`, `Seguimiento 1`, `Seguimiento 2`, `Renovación`, `Diagnóstico`, `Extraordinaria`, `Especial`, `Otro`). | Soft-delete completo + guardia; `uq_tipo_auditoria_nombre_active` |
| `metodologia_auditoria` | Modalidades (`Presencial`, `Remota`, `Mixta`). | Soft-delete completo + guardia; `uq_metodologia_nombre_active` |
| `auditor` | Registro nominal de auditores. | Soft-delete completo + guardia (`trg_guard_archival_auditor`) |
| `norma_auditor`, `sector_iaf_auditor`, `subsector_iaf_auditor` | Matrices M:N de normas, sectores IAF y sub-sectores IAF calificados por auditor. | Enlace M:N puro |

### 3.3 Dominio 2: Organizaciones, Certificados, Sub-entidades y Procesos por Sitio (14 tablas)
| Tabla | Propósito | Retención / Claves Destacadas |
| :--- | :--- | :--- |
| `organizacion` | Empresas titulares sujetas a certificación (`nombre`, `rif`, `direccion_fiscal`). | Soft-delete completo + guardia |
| `client_organization_access` | Vinculación aprobada entre usuarios `CLIENT` y organizaciones (`estado`, `aprobado_por`, `motivo_rechazo`). | Soft-delete (`deleted_at`, `deleted_by`) + `REVOKE DELETE` + `archive_record` |
| `certificado` | Certificados con **5 FKs `RESTRICT`** (`id_norma`, `id_estatus`, `id_sector_iaf`, **`id_subsector_iaf NOT NULL`**, `id_organizacion`), `numero_certificado`, `alcance` (`VARCHAR(1000)`) y `multisitio`. | Soft-delete completo + guardia; `uq_certificado_numero_active`; `idx_certificado_subsector_iaf` |
| `fecha_certificado` | Hitos cronológicos del ciclo de certificación (`Otorgamiento`, `Renovación`, `Vencimiento`, `Modificación`, `Suspensión`, `Cancelación`, `Ultima Auditoría`). | Soft-delete completo; `uq_fecha_certificado_tipo_fecha_active` |
| `contacto_certificado`, `telefono_contacto_certificado`, `email_contacto_certificado` | Directorio normalizado de contactos y canales de teléfono/correo por certificado. | Soft-delete + guardia en `contacto_certificado` + índices únicos parciales |
| `sitio` | Sedes físicas o virtuales bajo la **Convención Sitio 0** (`CHECK (numero_sitio >= 0)`). | Soft-delete completo + guardia de Sitio 0; `uq_sitio_cert_numero_active` |
| `proceso` | Procesos auditables clasificados (`Estratégico`, `Medular`, `De Apoyo`, `Otro`). | Soft-delete completo + guardia; `uq_proceso_cert_nombre_active` |
| **`procesos_por_sitio`** *(Nueva)* | Catálogo maestro que define qué procesos aplican en cada sede física (`id_sitio FK CASCADE`, `id_proceso FK CASCADE`). | Soft-delete hijo + `fn_prevent_hard_delete` + guardia (`v_guarded_parents`); `uq_procesos_por_sitio_active`; `trg_validar_proceso_por_sitio_certificado` |
| `requisitos_por_proceso` | Mapeo M:N de cláusulas ISO auditadas en cada proceso. | Enlace M:N puro; `trg_guard_req_proceso_against_exclusion` y `trg_smart_prune_process_clauses_on_exclusion` |
| `requisitos_no_aplicables_certificado` | Exclusiones formales justificadas (ISO 9001 Cláusula 4.3). | Soft-delete hijo + `fn_prevent_hard_delete` + `trg_smart_prune_process_clauses_on_exclusion`; `uq_req_no_aplicable_cert_req_active` |
| `turno`, `turnos_por_sitio` | Catálogo de horarios laborales y su asignación 1:N por sede. | Soft-delete + guardia; `uq_turno_horario_active`, `uq_turnos_por_sitio_active` |

### 3.4 Dominio 3: Programas, Fechas 1:N, Planificación Sitio–Proceso–Turno y Hallazgos (13 tablas)
| Tabla | Propósito | Retención / Claves Destacadas |
| :--- | :--- | :--- |
| **`programa_auditoria`** *(Nueva)* | Contenedor de campañas de auditoría (`codigo_programa`, `etiqueta`, `nivel_vinculacion`: `INDIVIDUAL` \| `NIVEL_1_INTRA_ORG` \| `NIVEL_2_INTER_ORG`, `tipo_vinculacion` en 7 naturalezas, `es_vinculada`, `id_ciclo_origen FK SELF`, `notas`). | Soft-delete completo + guardia; `uq_programa_auditoria_codigo_active`; `trg_validar_cambio_nivel_programa` |
| `auditoria` *(Refactorizada)* | Auditoría por certificado dentro de un programa (`id_programa_auditoria NOT NULL FK CASCADE`, `codigo_auditoria`, `id_certificado`, `id_tipo_auditoria`, `id_metodologia`, `tiempo_auditoria` múltiplos de `0.25d`, `estado_ciclo` en 7 estados: `Por programar`, `En programación`, `Programada`, `En curso`, `Auditada`, `Con hallazgos`, `Cerrada`). Sin columnas planas de fecha. | Soft-delete completo + guardia; `CHECK (MOD((tiempo_auditoria * 4), 1) = 0)`; `uq_auditoria_codigo_active`, `uq_auditoria_programa_cert_active`; `trg_validar_auditoria_en_programa` |
| **`auditoria_fecha`** *(Nueva)* | Cronología histórica 1:N por auditoría (`numero_secuencia >= 1`, `tipo_fecha`: `PREPROGRAMADA_MES` \| `REAL`, `tag`: `Programación` \| `Reprogramación`, `anio`, `mes`, `fecha_inicio`, `fecha_fin`, `motivo`). | Soft-delete hijo + `fn_prevent_hard_delete`; `uq_auditoria_fecha_secuencia_active`; `trg_validar_auditoria_fecha_secuencia` |
| **`configuracion_alerta_auditoria`** *(Nueva)* | Umbrales globales de alertas de calendario (`clave = 'DEFAULT'`, `dias_aviso_proxima`, `dias_aviso_preprogramada_sin_confirmar`, `alertar_atrasadas`, `alertar_conflicto_auditor`, `alertar_desfase_dias_o_span`, `ciclos_rotacion_auditor_lider`, `alertas_activas`). | Soft-delete hijo + `fn_prevent_hard_delete`; `uq_config_alerta_clave_active` |
| `sitios_por_auditoria` *(Ampliada)* | Sedes asignadas a la auditoría con `tiempo_auditoria`, `modalidad_evaluacion` (`Presencial`/`Remota`/`Mixta`), `fecha_inicio`, `fecha_fin` y `notas_sitio`. | Soft-delete hijo + guardia; `uq_sitios_por_auditoria_active`; `trg_validar_sitio_auditoria_certificado` |
| `turnos_sitio_auditoria` | Turnos operativos habilitados para cada sede dentro de la auditoría. | Soft-delete hijo + guardia; `uq_turnos_sitio_auditoria_active`; `trg_validar_turno_sitio_auditoria` |
| `procesos_sitio_auditoria` *(Refactorizada)* | Procesos evaluados por sede en la auditoría (`id_sitios_por_auditoria`, **`id_procesos_por_sitio NOT NULL`**, `id_proceso` auto-sincronizado por trigger, `notas`). Sin columna `id_turnos_sitio_auditoria`. | Soft-delete hijo + guardia; `uq_procesos_sitio_auditoria_active`; `trg_validar_proceso_sitio_auditoria_certificado` |
| **`turnos_proceso_sitio_auditoria`** *(Nueva)* | Asignación M:N de `1..N` turnos auditados por cada proceso en sede (`id_procesos_sitio_auditoria`, `id_turnos_sitio_auditoria`). | Soft-delete hijo + `fn_prevent_hard_delete`; `uq_turnos_proceso_sitio_aud_active`; `trg_validar_turno_proceso_sitio_auditoria` |
| **`equipo_auditor_sitio`** *(Nueva)* | **Cubo 1** del balanceo: asignación de auditores a nivel de sitio (`rol_auditor`: `AUDITOR_LIDER` \| `AUDITOR` \| `EXPERTO_TECNICO`, `tiempo_auditoria` `0.25d`, `asignacion_completa_sitio`). | Soft-delete hijo + `fn_prevent_hard_delete`; `uq_equipo_auditor_sitio_active`; triggers de validación y auto-sync a `equipo_auditor` |
| **`equipo_auditor_proceso_sitio`** *(Nueva)* | **Cubo 2** del balanceo: override granular de evaluadores por proceso y sitio (`rol_en_proceso`: `AUDITOR` \| `EXPERTO_TECNICO`, `tiempo_auditoria` `0.25d`). | Soft-delete hijo + `fn_prevent_hard_delete`; `uq_equipo_auditor_proceso_sitio_active`; triggers de validación y auto-sync a `equipo_auditor` |
| `equipo_auditor` | Tabla resumen M:N `(id_auditoria, id_auditor, rol_auditor)` mantenida automáticamente por triggers desde `equipo_auditor_sitio` y `equipo_auditor_proceso_sitio` para conservar Compatibilidad RLS `is_assigned_auditor`. | Enlace M:N puro |
| `comentarios_por_auditoria` | Bitácora técnica de observaciones por evento de auditoría. | Soft-delete hijo + `fn_prevent_hard_delete` |
| `hallazgo` | No conformidades y observaciones ISO (`tipo`: `tipo_hallazgo`), evidencia, proceso, requisito y cierre (`cerrado`). | Soft-delete completo; `id_auditoria FK CASCADE` |

---

## 4. Triggers de Retención Lógica, Integridad Bloque 1 e ISO 4.3 (**182 Triggers Vivos**)

### 4.1 Mecanismo Soft-Delete, Prevención de Hard-Delete y Guardias de Archivo
1. **`fn_prevent_hard_delete()` (`36` triggers):** Instalado `BEFORE DELETE` sobre las **20 tablas núcleo** y **16 tablas hijas**; bloquea cualquier `DELETE` físico.
2. **`fn_sync_soft_delete_metadata()` / `fn_sync_soft_delete_child_metadata()` (`37` triggers):** Sincronizan `deleted_by = COALESCE(NEW.deleted_by, auth.uid())` al archivar y limpian `deleted_by`/`delete_reason` al restaurar sobre las 20 núcleo, 16 hijas y `client_organization_access`.
3. **`get_archive_dependency_summary(p_table, p_record_id)` y `fn_guard_parent_archival()` (`23` tablas padre):** Bloquean `BEFORE UPDATE` el archivo de cualquier padre que conserve hijos activos (`WHERE deleted_at IS NULL`), incluyendo **`procesos_por_sitio`**, **`programa_auditoria`**, **`auditor`**, **`procesos_sitio_auditoria`** y la protección especial de **Sitio 0** ante sedes secundarias activas.

### 4.2 Triggers de Integridad de Programa, Fechas 1:N, Sitio–Proceso y Sincronización de Equipo (`01_creacion.sql`)
1. **`trg_validar_auditoria_en_programa`:** Bloquea la fila padre de `programa_auditoria` (`FOR UPDATE`), verifica máximo 1 auditoría activa si `nivel_vinculacion = 'INDIVIDUAL'`, misma `id_organizacion` si `'NIVEL_1_INTRA_ORG'`, elegibilidad multiorgánica si `'NIVEL_2_INTER_ORG'` y unicidad activa de `(id_programa_auditoria, id_certificado)`.
2. **`trg_validar_cambio_nivel_programa`:** Impide degradar `programa_auditoria.nivel_vinculacion` si sus auditorías activas violan la nueva restricción (ej. múltiples certificados hacia `INDIVIDUAL` o múltiples organizaciones hacia `NIVEL_1_INTRA_ORG`).
3. **`trg_validar_auditoria_fecha_secuencia`:** Valida `numero_secuencia >= 1` y consistencia entre `PREPROGRAMADA_MES` (`anio`, `mes`) y `REAL` (`fecha_inicio`, `fecha_fin`) en auditoría activa.
4. **`trg_validar_sitio_auditoria_certificado` & `trg_validar_turno_sitio_auditoria`:** Verifican pertenencia de `sitio` y `turnos_por_sitio` al certificado y sede de la auditoría.
5. **`trg_validar_proceso_por_sitio_certificado`:** Garantiza en `procesos_por_sitio` que `sitio.id_certificado = proceso.id_certificado`.
6. **`trg_validar_proceso_sitio_auditoria_certificado`:** Exige un `id_procesos_por_sitio` activo perteneciente al mismo `id_sitio` y `id_certificado`, y auto-completa `NEW.id_proceso = v_pps_proceso`.
7. **`trg_validar_turno_proceso_sitio_auditoria`:** Verifica que el proceso (`procesos_sitio_auditoria`) y el turno (`turnos_sitio_auditoria`) pertenezcan al mismo `id_sitios_por_auditoria`.
8. **`trg_validar_equipo_auditor_sitio` & `trg_validar_equipo_auditor_proceso_sitio`:** Validan auditor/sede/proceso activos e integridad de roles.
9. **`trg_sync_equipo_auditor_desde_sitio` & `trg_sync_equipo_auditor_desde_proceso`:** Mantienen sincronizada en tiempo real la tabla resumen `equipo_auditor`, promoviendo `AUDITOR_LIDER` o consolidando evaluadores de `Cubo 1` y `Cubo 2` para que las políticas RLS basadas en `is_assigned_auditor` funcionen sin fricción.

### 4.3 Guardias ISO 4.3, `audit_log` Inmutable y Timestamps (**182 Triggers Totales**)
- **`trg_guard_req_proceso_against_exclusion` & `trg_smart_prune_process_clauses_on_exclusion`:** Bloquean asignaciones sobre cláusulas excluidas (`REQ_EXCLUDED_BY_ISO43`) y ejecutan el podado inteligente descendente `<@` garantizando $C_{\text{eff}}(K) = \left(\bigcup \text{Subtree}(c)\right) \setminus E_{\text{eff}}(K)$.
- **`trg_audit_log_immutable` + `38` triggers `audit_*_trigger`:** Registran snapshots `JSONB` de auditoría forense en `14` tablas explícitas (incluyendo `profiles`) + `24` tablas de `v_extra_audit_tables` (abarcando todas las nuevas tablas del Bloque 1 y `procesos_por_sitio`).
- **`31` triggers `update_*_modtime`:** Actualizan `NEW.updated_at = NOW()` en cada mutación.
- **`trg_norma_sync_codigo_titulo` y `trg_protect_profile_rbac_fields`:** Completan exactamente los **182 triggers vivos** registrados en `pg_trigger`.

---

## 5. Motor de Cobertura Normativa LTREE y Competencias (`02_cobertura_normativa.sql`)

Todas las funciones de cobertura operan sobre registros activos (`deleted_at IS NULL`) en modo **`STABLE SECURITY INVOKER SET search_path = public, pg_temp`**:
- `public.evaluar_cobertura_certificado(p_id_certificado UUID)` (`'NO_APLICABLE'`, `'CUBIERTO'`, `'PENDIENTE'`, `'INFORMATIVA'`, `'PARCIAL'`, `'MIXTO'`).
- `public.cobertura_normativa_certificado(p_id_certificado UUID)`.
- `public.resumen_cobertura_certificado(p_id_certificado UUID)`.
- `public.auditor_esta_calificado(...)` y `public.auditores_calificados_para_certificado(...)` (`SECURITY DEFINER`).

---

## 6. Índices Únicos Parciales y Optimización (`03_indices_optimizacion.sql`)

`03_indices_optimizacion.sql` define **90 índices** (**77 parciales** con `WHERE deleted_at IS NULL`; **135 índices vivos** totales en PostgreSQL):
- **33 Índices Únicos Parciales (`WHERE deleted_at IS NULL`):** Incluyen los 22 previos más `uq_programa_auditoria_codigo_active`, `uq_auditoria_codigo_active`, `uq_auditoria_programa_cert_active`, `uq_auditoria_fecha_secuencia_active`, `uq_config_alerta_clave_active`, `uq_procesos_por_sitio_active`, `uq_turnos_sitio_auditoria_active`, `uq_procesos_sitio_auditoria_active`, `uq_turnos_proceso_sitio_aud_active`, `uq_equipo_auditor_sitio_active` y `uq_equipo_auditor_proceso_sitio_active`.
- **57 Índices `GiST`, `GIN` y `B-tree`:** Cubren jerarquía `LTREE` (`idx_requisito_ruta_gist`, `idx_requisito_norma_obligatorio_active` con `INCLUDE (ruta_materializada, codigo)`), traducciones FTS (`idx_requisito_traduccion_fts_gin`), `procesos_por_sitio` (`idx_procesos_por_sitio_lookup`), programas (`idx_programa_auditoria_nivel_tipo`), ciclos (`idx_auditoria_programa_estado`, `idx_auditoria_certificado_ciclo`), cronología `auditoria_fecha` (`idx_auditoria_fecha_vigencia`, `idx_auditoria_fecha_rango_real`, `idx_auditoria_fecha_preprog_mes`), planificación granular (`idx_turnos_proceso_sitio_aud_lookup`, `idx_equipo_auditor_sitio_lookup`, `idx_equipo_auditor_proceso_lookup`) y bitácora forense (`idx_audit_log_entity_lookup`).

---

## 7. Datos de Prueba, Identidades y Catálogo Normativo CSV (`05`, `06` y `07`)

- **`05_usuarios.sql`:** 4 cuentas confirmadas (`Password123*`): `admin@fondonorma.test` (`ADMIN`), `worker@fondonorma.test` (`WORKER`), `auditor@fondonorma.test` (`AUDITOR`) y `client@fondonorma.test` (`CLIENT`).
- **`06_datos_prueba.sql`:** Semillero idempotente de catálogos, organizaciones (`Iberometal Componentes S.A.`, `CyberCloud Solutions S.L.`, `Example, C.A.`), certificados vigentes/en estudio, **10 vínculos `procesos_por_sitio`**, configuración de alertas `DEFAULT`, y **5 campañas reales**:
  - `PROG-2024-001` (`INDIVIDUAL`, `Auditada`, Iberometal QMS)
  - `PROG-2025-001` (`NIVEL_1_INTRA_ORG` `Combinada` Año 1, Example, C.A.)
  - `PROG-2026-001` (`NIVEL_1_INTRA_ORG` `Integrada` Año 2 con `id_ciclo_origen → PROG-2025-001`, 6.00 días-auditor, 2 auditores en 3 días calendario, historial de reprogramaciones `#1` y `#2`)
  - `PROG-2026-002` (`NIVEL_2_INTER_ORG` `Multientidad` con `FN-QMS-2024-001` Iberometal + `FN-ISMS-2025-003` CyberCloud y fecha `PREPROGRAMADA_MES` próxima a ventana)
  - `PROG-2026-003` (`INDIVIDUAL` en estado `En programación` con desfase parcial de días y proceso pendiente).
- **`07_normas_requisitos_csv.sql` (`5,261` líneas · `~1.33 MB`):** Generado por `scripts/buildNormasSeed.ts` con **8 normas**, **2,188 cláusulas `LTREE` (`1,673` obligatorias / `515` informativas)** y **2,684 traducciones HTML bilingües ES/EN (`1,342` ES / `1,342` EN)**.
