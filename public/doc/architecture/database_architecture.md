# Arquitectura de Base de Datos y Motor Normativo (`programa_aud`)

> Documento técnico complementario de [`project_resume.md`](../project_resume.md). Detalla la capa de persistencia en **PostgreSQL (Supabase)** implementada en `public/supabase/queries/` (`00_delete_tables.sql` a `07_normas_requisitos_csv.sql`), incorporando el esquema normalizado de **50 tablas**, las capas **`grupo_empresarial` (Conglomerados)**, **`vinculo` / `vinculo_certificado`**, **Sitios Temporales (`auditoria_sitio_temporal*`, `equipo_auditor_sitio_temporal`)**, `auditoria_fecha` (`PREPROGRAMADA_MES` | `PROGRAMADA_EXACTA` | `REAL`), plazos NC/revisión QA en `hallazgo`/`auditoria`/`configuracion_alerta_auditoria`, el catálogo normativo bilingüe (`requisito` + `requisito_traduccion`), el motor descendente `LTREE` de cobertura normativa, las guardias ISO 17021-1 / ISO 4.3, la arquitectura **Soft-Delete en 43 tablas** y la protección anti-escalamiento RBAC.

---

## 1. Secuencia de Despliegue SQL (`00` – `07`)

Los 8 scripts en `public/supabase/queries/` se ejecutan de forma determinista y en orden lexicográfico estricto (tanto en el SQL Editor de Supabase como vía `POST /api/reset-db`):

| Orden | Archivo | Propósito Principal |
| :---: | :--- | :--- |
| 0 | `00_delete_tables.sql` | Reinicio limpio del esquema `public` (`DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;`) y restauración de privilegios base para `postgres`, `anon`, `authenticated`, `service_role` y `public`. |
| 1 | `01_creacion.sql` | Extensiones (`uuid-ossp`, `ltree`), 3 tipos `ENUM`, **50 tablas relacionales**, columnas `deleted_at`/`deleted_by`/`delete_reason`, `handle_new_user()`, **223 triggers vivos** en `pg_trigger` (prevención de hard-delete en **42 tablas**, sincronización soft-delete en **42 tablas** en `01` + `client_organization_access`, `get_archive_dependency_summary()` y `fn_guard_parent_archival()` en **26 tablas padre**, auto-bucket 1:1 y limpieza en `grupo_empresarial`, compuerta `vinculo`/`vinculo_certificado`, pre-asignación `Sitio 0`, sitios temporales, fechas `PROGRAMADA_EXACTA`/`REAL`, cálculo NC `+15d`/`+60d`, cierre y revisión QA, guardias ISO 4.3, `audit_log` inmutable en **44 tablas** y triggers `updated_at`). |
| 2 | `02_cobertura_normativa.sql` | Motor jerárquico descendente de cobertura `LTREE` ejecutado en **`SECURITY INVOKER`** (`evaluar_cobertura_certificado`, `cobertura_normativa_certificado`, `resumen_cobertura_certificado`) y funciones de validación de competencias técnicas de auditores (`auditor_esta_calificado`, `auditores_calificados_para_certificado`) filtrando registros archivados (`deleted_at IS NULL`). |
| 3 | `03_indices_optimizacion.sql` | **110 índices especializados** en script (**161 índices vivos** totales incluyendo claves primarias y restricciones): **40 índices únicos parciales** (`WHERE deleted_at IS NULL`) más **70 índices `GiST`, `GIN` y `B-tree`** (sumando **94 índices parciales `WHERE deleted_at IS NULL`** en `03`) sobre conglomerados, vínculos, sitios temporales, jerarquía `LTREE`, cobertura obligatoria, traducciones ES/EN, Sitio 0, `procesos_por_sitio`, programas, `auditoria_fecha`, planificación por sitio/proceso, cola de revisión QA (`idx_auditoria_revision_cola`) y bitácora forense. |
| 4 | `04_rls.sql` | Doble capa DCL (`REVOKE DELETE` en **45 tablas** + `GRANT` + `REVOKE EXECUTE` sobre `PUBLIC`/`anon` en cobertura/RPCs críticos) y Row Level Security (`ENABLE ROW LEVEL SECURITY`) en las **50 tablas**, **7 funciones auxiliares `SECURITY DEFINER`**, RPC `archive_record(p_table, p_record_id, p_reason)` sobre **43 tablas** (**23** núcleo + **20** hijas/acceso), RPC transaccional **`declarar_no_aplicable_con_mutacion`**, y **149 políticas granulares** incluyendo aislamiento **Nivel 2 Inter-Org** para `CLIENT`. |
| 5 | `05_usuarios.sql` | Limpieza e inserción de las 4 cuentas de prueba confirmadas en `auth.users` y `public.profiles` (`ADMIN`, `WORKER`, `AUDITOR`, `CLIENT`) con contraseña `Password123*`. |
| 6 | `06_datos_prueba.sql` | Semillero idempotente compatible con índices únicos parciales (`ON CONFLICT (...) WHERE deleted_at IS NULL`) para catálogos, sub-sectores IAF, acreditaciones, normas, cláusulas base `ltree`, auditores con competencias M:N, **2 conglomerados** (`CONG-IND-01` multi-empresa y `CONG-CYB-01` auto 1:1), **3 organizaciones** (`Iberometal Componentes S.A.`, `CyberCloud Solutions S.L.`, `Example, C.A.`), **4 vínculos persistentes** (`VINC-IND-01`, `VINC-IND-02`, `VINC-N1-01`, `VINC-N2-01` + 3 certificados `LIBRE`), certificados con `id_subsector_iaf` y `alcance`, sitios (con Sitio 0), procesos, **10 vínculos `procesos_por_sitio`**, configuración de alertas **`DEFAULT`** (`15d`/`60d`), **9 campañas `programa_auditoria`** (históricas, año en curso, Nivel 2 Inter-Org y ciclos futuros `+1`/`+2`), **14 auditorías** (`AUD-2022-001` revisada QA con `FN-ISMS-2025-003`, `AUD-2023-001` cerrada pendiente QA, campañas activas y futuras), sitio temporal (`Sitio Temporal — Obra Planta Sur`), `auditoria_fecha` 1:N (`PREPROGRAMADA_MES`: 8, `PROGRAMADA_EXACTA`: 8, `REAL`: 5), equipos Dual-Bucket y hallazgos CAPA. |
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

## 3. Modelo Entidad-Relación: 50 Tablas y Gobernanza Soft-Delete

- **23 tablas núcleo (`v_core_tables`) con retención completa (`deleted_at`, `deleted_by`, `delete_reason`) y `fn_prevent_hard_delete`:**  
  `norma`, `requisito`, `sector_iaf`, `subsector_iaf`, `organismo_acreditacion`, `acreditacion_norma`, `estatus`, `tipo_auditoria`, `metodologia_auditoria`, `auditor`, **`grupo_empresarial`**, `organizacion`, `certificado`, `fecha_certificado`, `contacto_certificado`, `sitio`, `proceso`, `turno`, **`vinculo`**, `programa_auditoria`, `auditoria`, **`auditoria_sitio_temporal`**, `hallazgo`.
- **20 tablas operativas hijas y acceso habilitadas en `archive_record` (`04_rls.sql`):**  
  - **19 tablas hijas (`v_child_tables` en `01_creacion.sql`) con retención (`deleted_at`, `deleted_by`), `fn_prevent_hard_delete` y `REVOKE DELETE`:** `requisito_traduccion`, `acreditacion_norma_sector_iaf`, `requisitos_no_aplicables_certificado`, `turnos_por_sitio`, `procesos_por_sitio`, **`vinculo_certificado`**, `auditoria_fecha`, `configuracion_alerta_auditoria`, `comentarios_por_auditoria`, `sitios_por_auditoria`, **`auditoria_sitio_temporal_certificado`**, `turnos_sitio_auditoria`, `procesos_sitio_auditoria`, `turnos_proceso_sitio_auditoria`, `equipo_auditor_sitio`, **`equipo_auditor_sitio_temporal`**, `equipo_auditor_proceso_sitio`, `telefono_contacto_certificado`, `email_contacto_certificado`.
  - **1 tabla de acceso cliente con sincronización `trg_sync_soft_delete_client_organization_access`, `REVOKE DELETE` y `archive_record`:** `client_organization_access`.
- **5 tablas de enlace M:N puras (únicas tablas con `DELETE` físico habilitado para desvinculación/sincronización/podado):**  
  `norma_auditor`, `sector_iaf_auditor`, `subsector_iaf_auditor`, `requisitos_por_proceso`, `equipo_auditor` (sincronizada automáticamente desde `equipo_auditor_sitio`, `equipo_auditor_sitio_temporal` y `equipo_auditor_proceso_sitio`).

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

### 3.3 Dominio 2: Conglomerados, Organizaciones, Certificados, Sub-entidades y Procesos por Sitio (15 tablas)
| Tabla | Propósito | Retención / Claves Destacadas |
| :--- | :--- | :--- |
| **`grupo_empresarial`** *(Nueva)* | Contenedor corporativo o individual 1:1 (`codigo_grupo`, `nombre`, `es_individual_auto`, `notas`). Permite agrupar empresas hermanas para vinculación Nivel 2. | Soft-delete completo + guardia (`trg_guard_archival_grupo_empresarial`); auto-creación y limpieza vía `organizacion`; `uq_grupo_empresarial_codigo_active` |
| `organizacion` *(Ampliada)* | Empresas titulares sujetas a certificación (`id_grupo_empresarial NOT NULL FK RESTRICT`, `nombre`, `rif`, `direccion_fiscal`). | Soft-delete completo + guardia; triggers `trg_organizacion_auto_grupo` y `trg_sincronizar_limpieza_grupo_empresarial` |
| `client_organization_access` | Vinculación aprobada entre usuarios `CLIENT` y organizaciones (`estado`, `aprobado_por`, `motivo_rechazo`). | Soft-delete (`deleted_at`, `deleted_by`) + `REVOKE DELETE` + `archive_record` |
| `certificado` | Certificados con **5 FKs `RESTRICT`** (`id_norma`, `id_estatus`, `id_sector_iaf`, **`id_subsector_iaf NOT NULL`**, `id_organizacion`), `numero_certificado`, `alcance` (`VARCHAR(1000)`) y `multisitio`. | Soft-delete completo + guardia; `uq_certificado_numero_active`; `idx_certificado_subsector_iaf` |
| `fecha_certificado` | Hitos cronológicos del ciclo de certificación (`Otorgamiento`, `Renovación`, `Vencimiento`, `Modificación`, `Suspensión`, `Cancelación`, `Ultima Auditoría`). | Soft-delete completo; `uq_fecha_certificado_tipo_fecha_active` |
| `contacto_certificado`, `telefono_contacto_certificado`, `email_contacto_certificado` | Directorio normalizado de contactos y canales de teléfono/correo por certificado. | Soft-delete + guardia en `contacto_certificado` + índices únicos parciales |
| `sitio` | Sedes físicas o virtuales bajo la **Convención Sitio 0** (`CHECK (numero_sitio >= 0)`). | Soft-delete completo + guardia de Sitio 0; `uq_sitio_cert_numero_active` |
| `proceso` | Procesos auditables clasificados (`Estratégico`, `Medular`, `De Apoyo`, `Otro`). | Soft-delete completo + guardia; `uq_proceso_cert_nombre_active` |
| `procesos_por_sitio` | Catálogo maestro que define qué procesos aplican en cada sede física (`id_sitio FK CASCADE`, `id_proceso FK CASCADE`). | Soft-delete hijo + `fn_prevent_hard_delete` + guardia (`v_guarded_parents`); `uq_procesos_por_sitio_active`; `trg_validar_proceso_por_sitio_certificado` |
| `requisitos_por_proceso` | Mapeo M:N de cláusulas ISO auditadas en cada proceso. | Enlace M:N puro; `trg_guard_req_proceso_against_exclusion` y `trg_smart_prune_process_clauses_on_exclusion` |
| `requisitos_no_aplicables_certificado` | Exclusiones formales justificadas (ISO 9001 Cláusula 4.3). | Soft-delete hijo + `fn_prevent_hard_delete` + `trg_smart_prune_process_clauses_on_exclusion`; `uq_req_no_aplicable_cert_req_active` |
| `turno`, `turnos_por_sitio` | Catálogo de horarios laborales y su asignación 1:N por sede. | Soft-delete + guardia; `uq_turno_horario_active`, `uq_turnos_por_sitio_active` |

### 3.4 Dominio 3: Vínculos, Programas, Fechas 1:N, Sitios Temporales, Planificación y Revisión QA (18 tablas)
| Tabla | Propósito | Retención / Claves Destacadas |
| :--- | :--- | :--- |
| **`vinculo`** *(Nueva)* | Compromiso operativo persistente entre certificados del mismo conglomerado (`id_grupo_empresarial NOT NULL`, `codigo_vinculo`, `etiqueta`, `nivel_vinculacion`, `tipo_vinculacion` con `'Mixta'` sin `'Multisitio'`, `es_vinculada`, `tiene_sitio_temporal`, `notas`). | Soft-delete completo + guardia (`trg_guard_archival_vinculo`); `check_vinculo_coherencia`; `uq_vinculo_codigo_active` |
| **`vinculo_certificado`** *(Nueva)* | Membrecía 1:N de certificados comprometidos en un `vinculo` (`id_vinculo`, `id_certificado`). Impide crear auditorías sobre certificados `LIBRE`. | Soft-delete hijo + `fn_prevent_hard_delete`; `uq_vinculo_certificado_cert_active`; `trg_validar_vinculo_certificado` y `trg_validar_desvinculacion_certificado` |
| `programa_auditoria` *(Ampliada)* | Contenedor de campañas de auditoría (`id_vinculo`, `id_grupo_empresarial`, `codigo_programa`, `etiqueta`, `nivel_vinculacion`, `tipo_vinculacion` en 7 naturalezas sin `'Multisitio'`, `es_vinculada`, `tiene_sitio_temporal`, `id_ciclo_origen FK SELF`, `notas`). | Soft-delete completo + guardia; `uq_programa_auditoria_codigo_active`; `trg_validar_cambio_nivel_programa` |
| `auditoria` *(Ampliada)* | Auditoría por certificado dentro de un programa (`id_programa_auditoria`, `codigo_auditoria`, `id_certificado`, `id_tipo_auditoria`, `id_metodologia`, `tiempo_auditoria` `0.25d`, `estado_ciclo` incl. `'Cerrada'`, `tiene_sitio_temporal`, `fecha_cierre_auditoria`, `revisado`, `fecha_revision`, `revisado_por`, `documentacion_completa`, `resumen_revision`, `objetivo`). | Soft-delete completo + guardia; compuerta Paso 2 `trg_validar_auditoria_en_programa`; `trg_auto_asignar_sitio_principal_auditoria`; `trg_guard_apagar_temporal_auditoria`; `trg_validar_cierre_auditoria`; `trg_validar_revision_auditoria` |
| `auditoria_fecha` *(Ampliada)* | Cronología histórica 1:N por auditoría (`numero_secuencia >= 1`, `tipo_fecha`: `PREPROGRAMADA_MES` \| `PROGRAMADA_EXACTA` \| `REAL`, `tag`: `Programación` \| `Reprogramación`, `anio`, `mes`, `fecha_inicio`, `fecha_fin`, `observacion`). | Soft-delete hijo + `fn_prevent_hard_delete`; `uq_auditoria_fecha_secuencia_active`; `trg_validar_auditoria_fecha_secuencia` |
| `configuracion_alerta_auditoria` *(Ampliada)* | Umbrales globales de calendario y NC (`clave = 'DEFAULT'`, `dias_aviso_proxima`, `dias_aviso_preprogramada_sin_confirmar`, `alertar_atrasadas`, `alertar_conflicto_auditor`, `alertar_desfase_dias_o_span`, `ciclos_rotacion_auditor_lider`, **`dias_limite_plan_accion`**, **`dias_limite_cierre_nc`**, `alertas_activas`). | Soft-delete hijo + `fn_prevent_hard_delete`; `uq_config_alerta_clave_active` |
| `sitios_por_auditoria` | Sedes asignadas a la auditoría con `tiempo_auditoria` (`0.25d`), `modalidad_evaluacion`, `fecha_inicio`, `fecha_fin` y `notas_sitio`. | Soft-delete hijo + guardia; `trg_validar_sitio_auditoria_certificado`; `trg_recalcular_tiempo_auditoria_desde_sitios` |
| **`auditoria_sitio_temporal`** *(Nueva)* | Sitios temporales o proyectos de obra (`id_auditoria`, `etiqueta`, `comentario`, `tiempo_auditoria` `0.25d`) cuando `tiene_sitio_temporal = TRUE`. | Soft-delete completo + guardia; `uq_sitio_temporal_auditoria_etiqueta_active`; `trg_validar_sitio_temporal_auditoria` |
| **`auditoria_sitio_temporal_certificado`** *(Nueva)* | Atribución M:N de un sitio temporal hacia múltiples certificados dentro de la misma campaña (`id_sitio_temporal`, `id_auditoria_certificado`). | Soft-delete hijo + `fn_prevent_hard_delete`; `uq_sitio_temporal_certificado_active`; `trg_validar_sitio_temporal_certificado` |
| `turnos_sitio_auditoria` | Turnos operativos habilitados para cada sede dentro de la auditoría. | Soft-delete hijo + guardia; `trg_validar_turno_sitio_auditoria` |
| `procesos_sitio_auditoria` | Procesos evaluados por sede en la auditoría (`id_sitios_por_auditoria`, `id_procesos_por_sitio NOT NULL`, `id_proceso` auto-sincronizado, `notas`). | Soft-delete hijo + guardia; `trg_validar_proceso_sitio_auditoria_certificado` |
| `turnos_proceso_sitio_auditoria` | Asignación M:N de `1..N` turnos auditados por cada proceso en sede (`id_procesos_sitio_auditoria`, `id_turnos_sitio_auditoria`). | Soft-delete hijo + `fn_prevent_hard_delete`; `trg_validar_turno_proceso_sitio_auditoria` |
| `equipo_auditor_sitio` | **Cubo 1** regular: auditores por sede (`rol_auditor`, `tiempo_auditoria` `0.25d`, `asignacion_completa_sitio`). | Soft-delete hijo + `fn_prevent_hard_delete`; `trg_sync_equipo_auditor_desde_sitio` |
| **`equipo_auditor_sitio_temporal`** *(Nueva)* | Asignación de auditores y horas (`0.25d`) sobre sitios temporales (`id_sitio_temporal`, `id_auditor`, `rol_auditor`, `tiempo_auditoria`). | Soft-delete hijo + `fn_prevent_hard_delete`; `trg_validar_equipo_auditor_sitio_temporal`; `trg_sync_equipo_auditor_desde_sitio_temporal` |
| `equipo_auditor_proceso_sitio` | **Cubo 2** por proceso en sede (`id_procesos_sitio_auditoria`, `id_auditor`, `rol_en_proceso`). | Soft-delete hijo + `fn_prevent_hard_delete`; `trg_sync_equipo_auditor_desde_proceso` |
| `equipo_auditor` | Tabla resumen M:N `(id_auditoria, id_auditor, rol_auditor)` consolidada por `fn_sync_equipo_auditor_completo()` (sitios regulares + temporales + procesos). | Enlace M:N puro |
| `comentarios_por_auditoria` | Bitácora técnica de observaciones por evento de auditoría. | Soft-delete hijo + `fn_prevent_hard_delete` |
| `hallazgo` *(Ampliada)* | No conformidades y observaciones ISO (`id_sitio`, `tipo`: `tipo_hallazgo`, `descripcion`, `evidencia`, **`fecha_limite_plan`**, **`fecha_entrega_plan`**, **`fecha_limite_cierre`**, **`fecha_cierre_real`**, `cerrado`). | Soft-delete completo; `trg_auto_calcular_fechas_hallazgo` (`+15d`/`+60d`) |

---

## 4. Triggers de Retención Lógica, Integridad e ISO 4.3 (**223 Triggers Vivos**)

### 4.1 Mecanismo Soft-Delete, Prevención de Hard-Delete y Guardias de Archivo
1. **`fn_prevent_hard_delete()` (`42` triggers):** Instalado `BEFORE DELETE` sobre las **23 tablas núcleo** y **19 tablas hijas**; bloquea cualquier `DELETE` físico.
2. **`fn_sync_soft_delete_metadata()` / `fn_sync_soft_delete_child_metadata()` (`43` triggers):** Sincronizan `deleted_by = COALESCE(NEW.deleted_by, auth.uid())` al archivar y limpian `deleted_by`/`delete_reason` al restaurar sobre las 23 núcleo, 19 hijas y `client_organization_access`.
3. **`get_archive_dependency_summary(p_table, p_record_id)` y `fn_guard_parent_archival()` (`26` tablas padre):** Bloquean `BEFORE UPDATE` el archivo de cualquier padre que conserve hijos activos (`WHERE deleted_at IS NULL`), incluyendo **`grupo_empresarial`**, **`vinculo`**, **`auditoria_sitio_temporal`**, `procesos_por_sitio`, `programa_auditoria`, `auditor`, `procesos_sitio_auditoria` y la protección especial de **Sitio 0** ante sedes secundarias activas.

### 4.2 Triggers de Conglomerado, Vínculo, Sitios Temporales, Fechas, Resultado y Revisión QA (`01_creacion.sql`)
1. **`trg_organizacion_auto_grupo` & `trg_sincronizar_limpieza_grupo_empresarial`:** Crean automáticamente un `grupo_empresarial` 1:1 (`es_individual_auto = TRUE`) cuando una organización se inserta sin grupo y archivan automáticamente el bucket individual huérfano cuando todas sus organizaciones migran a un conglomerado corporativo.
2. **`trg_validar_vinculo_certificado` & `trg_validar_desvinculacion_certificado`:** Validan pertenencia al mismo `id_grupo_empresarial`, cardinalidad `INDIVIDUAL`/`NIVEL_1_INTRA_ORG` y bloquean desvincular certificados con auditorías activas.
3. **`trg_validar_auditoria_en_programa` & `trg_auto_asignar_sitio_principal_auditoria`:** Hacen cumplir la **Compuerta Insalvable del Paso 2** (bloqueando certificados `LIBRE`), validan reglas de programa y pre-seleccionan automáticamente `Sitio 0 (HQ)` en `sitios_por_auditoria` al crear una auditoría.
4. **`trg_recalcular_tiempo_auditoria_desde_sitios`:** Mantiene `auditoria.tiempo_auditoria` sincronizado con la suma exacta de sus `sitios_por_auditoria` activos.
5. **`trg_validar_sitio_temporal_auditoria`, `trg_validar_sitio_temporal_certificado` & `trg_guard_apagar_temporal_auditoria`:** Exigen `tiene_sitio_temporal = TRUE`, garantizan misma campaña para atribución multicertificado y bloquean apagar el switch si existen temporales activos.
6. **`trg_auto_calcular_fechas_hallazgo`, `trg_validar_cierre_auditoria` & `trg_validar_revision_auditoria`:** Calculan automáticamente `fecha_limite_plan` (`+15d`) y `fecha_limite_cierre` (`+60d`) desde la fecha `REAL` y la tabla `configuracion_alerta_auditoria`; bloquean cerrar auditorías sin fecha `REAL` ni `fecha_cierre_auditoria`; y bloquean aprobar revisión QA (`revisado = TRUE`) si la auditoría no está `'Cerrada'`, falta `documentacion_completa = TRUE` o `fecha_revision < fecha_cierre_auditoria`.
7. **`fn_sync_equipo_auditor_completo()` (`trg_sync_equipo_auditor_desde_sitio`, `trg_sync_equipo_auditor_desde_sitio_temporal`, `trg_sync_equipo_auditor_desde_proceso`):** Consolidan en tiempo real la tabla `equipo_auditor` desde sitios regulares, temporales y procesos para sostener RLS `is_assigned_auditor`.

### 4.3 Guardias ISO 4.3, `audit_log` Inmutable y Timestamps (**223 Triggers Totales**)
- **`trg_guard_req_proceso_against_exclusion` & `trg_smart_prune_process_clauses_on_exclusion`:** Bloquean asignaciones sobre cláusulas excluidas (`REQ_EXCLUDED_BY_ISO43`) y ejecutan el podado inteligente descendente `<@` garantizando $C_{\text{eff}}(K) = \left(\bigcup \text{Subtree}(c)\right) \setminus E_{\text{eff}}(K)$.
- **`trg_audit_log_immutable` + triggers `audit_*_trigger` sobre `44` tablas:** Registran snapshots `JSONB` de auditoría forense (`16` tablas explícitas incl. `profiles`, `grupo_empresarial` y `vinculo` + `28` tablas de `v_extra_audit_tables`).
- **Triggers `update_*_modtime`, `trg_norma_sync_codigo_titulo` y `trg_protect_profile_rbac_fields`:** Completan exactamente los **223 triggers vivos** registrados en `pg_trigger`.

---

## 5. Motor de Cobertura Normativa LTREE y Competencias (`02_cobertura_normativa.sql`)

Todas las funciones de cobertura operan sobre registros activos (`deleted_at IS NULL`) en modo **`STABLE SECURITY INVOKER SET search_path = public, pg_temp`**:
- `public.evaluar_cobertura_certificado(p_id_certificado UUID)` (`'NO_APLICABLE'`, `'CUBIERTO'`, `'PENDIENTE'`, `'INFORMATIVA'`, `'PARCIAL'`, `'MIXTO'`).
- `public.cobertura_normativa_certificado(p_id_certificado UUID)`.
- `public.resumen_cobertura_certificado(p_id_certificado UUID)`.
- `public.auditor_esta_calificado(...)` y `public.auditores_calificados_para_certificado(...)` (`SECURITY DEFINER`).

---

## 6. Índices Únicos Parciales y Optimización (`03_indices_optimizacion.sql`)

`03_indices_optimizacion.sql` define **110 índices** (**94 parciales** con `WHERE deleted_at IS NULL`; **161 índices vivos** totales en PostgreSQL):
- **40 Índices Únicos Parciales (`WHERE deleted_at IS NULL`):** Incluyen `uq_grupo_empresarial_codigo_active`, `uq_vinculo_codigo_active`, `uq_vinculo_certificado_cert_active`, `uq_sitio_temporal_auditoria_etiqueta_active`, `uq_sitio_temporal_certificado_active`, `uq_equipo_auditor_sitio_temporal_active`, `uq_programa_auditoria_codigo_active`, `uq_auditoria_codigo_active`, `uq_auditoria_programa_cert_active`, `uq_auditoria_fecha_secuencia_active`, `uq_config_alerta_clave_active`, `uq_procesos_por_sitio_active`, `uq_turnos_sitio_auditoria_active`, `uq_procesos_sitio_auditoria_active`, `uq_turnos_proceso_sitio_aud_active`, `uq_equipo_auditor_sitio_active` y `uq_equipo_auditor_proceso_sitio_active`.
- **70 Índices `GiST`, `GIN` y `B-tree`:** Cubren jerarquía `LTREE` (`idx_requisito_ruta_gist`, `idx_requisito_norma_obligatorio_active`), traducciones FTS (`idx_requisito_traduccion_fts_gin`), `grupo_empresarial`, `vinculo`, `auditoria_sitio_temporal*`, `procesos_por_sitio`, `auditoria_fecha` (`PROGRAMADA_EXACTA`/`REAL`/`PREPROGRAMADA_MES`), cola de revisión QA (`idx_auditoria_revision_cola ON public.auditoria (revisado, fecha_cierre_auditoria DESC) WHERE estado_ciclo = 'Cerrada' AND deleted_at IS NULL`) y bitácora forense.

---

## 7. Datos de Prueba, Identidades y Catálogo Normativo CSV (`05`, `06` y `07`)

- **`05_usuarios.sql`:** 4 cuentas confirmadas (`Password123*`): `admin@fondonorma.test` (`ADMIN`), `worker@fondonorma.test` (`WORKER`), `auditor@fondonorma.test` (`AUDITOR`) y `client@fondonorma.test` (`CLIENT`).
- **`06_datos_prueba.sql`:** Semillero idempotente de catálogos, **2 conglomerados** (`CONG-IND-01` y `CONG-CYB-01`), **3 organizaciones** (`Iberometal Componentes S.A.`, `CyberCloud Solutions S.L.`, `Example, C.A.`), **4 vínculos** (`VINC-IND-01`, `VINC-IND-02`, `VINC-N1-01`, `VINC-N2-01`), **3 certificados `LIBRE`**, **10 vínculos `procesos_por_sitio`**, configuración de alertas `DEFAULT`, y **9 programas (`14` auditorías)** cubriendo históricos QA (`AUD-2022-001` sobre `FN-ISMS-2025-003` revisada; `AUD-2023-001` cerrada pendiente QA), campañas activas (`PROG-2026-001` con sitio temporal `Sitio Temporal — Obra Planta Sur`, `PROG-2026-002` Nivel 2 Inter-Org, `PROG-2026-003` parcial) y ciclos futuros (`PROG-2027-001`, `PROG-2028-001`).
- **`07_normas_requisitos_csv.sql` (`5,261` líneas · `~1.33 MB`):** Generado por `scripts/buildNormasSeed.ts` con **8 normas**, **2,188 cláusulas `LTREE` (`1,673` obligatorias / `515` informativas)** y **2,684 traducciones HTML bilingües ES/EN (`1,342` ES / `1,342` EN)**.
