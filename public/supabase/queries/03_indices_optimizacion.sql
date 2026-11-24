-- ============================================================================
-- FILE 3: 03_INDICES_OPTIMIZACION.SQL (Índices B-tree, GiST y Parciales Soft-Delete)
-- ============================================================================

-- Limpieza idempotente de restricciones UNIQUE globales heredadas (si existen en instancias previas)
DO $$
BEGIN
    ALTER TABLE public.norma DROP CONSTRAINT IF EXISTS norma_codigo_key;
    ALTER TABLE public.requisito DROP CONSTRAINT IF EXISTS unique_norma_requisito_codigo;
    ALTER TABLE public.sector_iaf DROP CONSTRAINT IF EXISTS sector_iaf_sector_key;
    ALTER TABLE public.subsector_iaf DROP CONSTRAINT IF EXISTS unique_subsector_codigo;
    ALTER TABLE public.organismo_acreditacion DROP CONSTRAINT IF EXISTS organismo_acreditacion_codigo_key;
    ALTER TABLE public.estatus DROP CONSTRAINT IF EXISTS estatus_estatus_key;
    ALTER TABLE public.tipo_auditoria DROP CONSTRAINT IF EXISTS tipo_auditoria_tipo_key;
    ALTER TABLE public.metodologia_auditoria DROP CONSTRAINT IF EXISTS metodologia_auditoria_metodologia_key;
    ALTER TABLE public.certificado DROP CONSTRAINT IF EXISTS certificado_numero_certificado_key;
    ALTER TABLE public.sitio DROP CONSTRAINT IF EXISTS unique_sitio_certificado;
    ALTER TABLE public.proceso DROP CONSTRAINT IF EXISTS unique_proceso_certificado;
    ALTER TABLE public.requisitos_no_aplicables_certificado DROP CONSTRAINT IF EXISTS unique_cert_requisito_no_aplicable;
    ALTER TABLE public.turno DROP CONSTRAINT IF EXISTS unique_horario_turno;
    ALTER TABLE public.turnos_por_sitio DROP CONSTRAINT IF EXISTS unique_sitio_turno;
    ALTER TABLE public.sitios_por_auditoria DROP CONSTRAINT IF EXISTS unique_auditoria_sitio;
    DROP INDEX IF EXISTS public.idx_auditoria_fecha;
    DROP INDEX IF EXISTS public.idx_proc_sitio_aud_compuesto;
    DROP INDEX IF EXISTS public.uq_sitio_cert_numero_active;
    DROP INDEX IF EXISTS public.uq_proceso_cert_nombre_active;
    DROP INDEX IF EXISTS public.uq_req_no_aplicable_cert_req_active;
    DROP INDEX IF EXISTS public.uq_fecha_certificado_tipo_fecha_active;
    DROP INDEX IF EXISTS public.uq_contacto_certificado_nombre_active;
    DROP INDEX IF EXISTS public.uq_contacto_cert_compartido_active;
    DROP INDEX IF EXISTS public.uq_turno_cert_compartido_active;
    DROP INDEX IF EXISTS public.uq_procesos_por_sitio_cert_active;
    DROP INDEX IF EXISTS public.uq_procesos_por_sitio_active;
    DROP INDEX IF EXISTS public.uq_sitio_cert_compartido_active;
    DROP INDEX IF EXISTS public.uq_sitio_cert_compartido_num_active;
    DROP INDEX IF EXISTS public.uq_proceso_cert_compartido_active;
END $$;

-- Índices Únicos Parciales (WHERE deleted_at IS NULL) para llaves de negocio mutables
CREATE UNIQUE INDEX IF NOT EXISTS uq_norma_codigo_active ON public.norma (codigo) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_requisito_norma_codigo_active ON public.requisito (id_norma, codigo) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_requisito_external_key_active ON public.requisito (external_key) WHERE external_key IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_requisito_traduccion_lang_active ON public.requisito_traduccion (id_requisito, lang) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_sector_iaf_numero_active ON public.sector_iaf (sector) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_subsector_codigo_active ON public.subsector_iaf (codigo) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_organismo_codigo_active ON public.organismo_acreditacion (codigo) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_estatus_nombre_active ON public.estatus (estatus) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_tipo_auditoria_nombre_active ON public.tipo_auditoria (tipo) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_metodologia_nombre_active ON public.metodologia_auditoria (metodologia) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_grupo_empresarial_nombre_active ON public.grupo_empresarial (LOWER(TRIM(nombre))) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_grupo_empresarial_codigo_active ON public.grupo_empresarial (codigo_grupo) WHERE codigo_grupo IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_grupo_empresarial_abrev_active ON public.grupo_empresarial (LOWER(TRIM(abreviacion))) WHERE abreviacion IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_certificado_numero_active ON public.certificado (numero_certificado) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_alcance_cert_active ON public.alcance (id_certificado) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_alcance_compartido_cert_active ON public.alcance_certificado_compartido (id_certificado) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_alcance_compartido_pair_active ON public.alcance_certificado_compartido (id_alcance, id_certificado) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_alcance_compartido_alcance ON public.alcance_certificado_compartido (id_alcance) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_certificado_version_numero_active ON public.certificado_version (id_certificado, version_numero) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_certificado_version_actual_active ON public.certificado_version (id_certificado) WHERE es_version_actual = TRUE AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_certificado_version_org_ver ON public.certificado_version (id_organizacion_version) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_certificado_version_cert_lookup ON public.certificado_version (id_certificado, es_version_actual DESC, version_numero DESC) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_sitio_cert_numero_active ON public.sitio (id_certificado_version, numero_sitio) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_proceso_cert_nombre_active ON public.proceso (id_certificado_version, LOWER(TRIM(nombre_proceso))) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_req_no_aplicable_cert_req_active ON public.requisitos_no_aplicables_certificado (id_certificado_version, id_requisito) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_turno_horario_active ON public.turno (hora_entrada, hora_salida) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_turnos_por_sitio_active ON public.turnos_por_sitio (id_sitio, id_turno) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_sitios_por_auditoria_active ON public.sitios_por_auditoria (id_auditoria, id_sitio) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_fecha_certificado_tipo_fecha_active ON public.fecha_certificado (id_certificado_version, tipo_fecha, fecha) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_contacto_certificado_nombre_active ON public.contacto_certificado (id_certificado_version, LOWER(TRIM(nombre))) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_telefono_contacto_active ON public.telefono_contacto_certificado (id_contacto, TRIM(telefono)) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_email_contacto_active ON public.email_contacto_certificado (id_contacto, LOWER(TRIM(email))) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_contacto_cert_compartido_active ON public.contacto_certificado_compartido (id_contacto, id_certificado_version) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_turno_cert_compartido_active ON public.turno_certificado_compartido (id_turno, id_certificado_version) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_vinculo_codigo_active ON public.vinculo (codigo_vinculo) WHERE codigo_vinculo IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_vinculo_certificado_cert_active ON public.vinculo_certificado (id_certificado) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_programa_auditoria_codigo_active ON public.programa_auditoria (codigo_programa) WHERE codigo_programa IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_auditoria_codigo_active ON public.auditoria (codigo_auditoria) WHERE codigo_auditoria IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_auditoria_programa_cert_active ON public.auditoria (id_programa_auditoria, id_certificado) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_auditoria_fecha_secuencia_active ON public.auditoria_fecha (id_auditoria, numero_secuencia) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_config_alerta_clave_active ON public.configuracion_alerta_auditoria (clave) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_procesos_por_sitio_active ON public.procesos_por_sitio (id_certificado_version, id_sitio, id_proceso) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_procesos_por_sitio_cert_sitio ON public.procesos_por_sitio (id_certificado_version, id_sitio) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_turnos_sitio_auditoria_active ON public.turnos_sitio_auditoria (id_sitios_por_auditoria, id_turnos_por_sitio) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_procesos_sitio_auditoria_active ON public.procesos_sitio_auditoria (id_sitios_por_auditoria, id_procesos_por_sitio) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_turnos_proceso_sitio_aud_active ON public.turnos_proceso_sitio_auditoria (id_procesos_sitio_auditoria, id_turnos_sitio_auditoria) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_equipo_auditor_sitio_active ON public.equipo_auditor_sitio (id_sitios_por_auditoria, id_auditor) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_equipo_auditor_proceso_sitio_active ON public.equipo_auditor_proceso_sitio (id_procesos_sitio_auditoria, id_auditor) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_sitio_temporal_auditoria_etiqueta_active
    ON public.auditoria_sitio_temporal (id_auditoria, LOWER(TRIM(etiqueta))) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_sitio_temporal_certificado_active
    ON public.auditoria_sitio_temporal_certificado (id_sitio_temporal, id_auditoria_certificado) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_equipo_auditor_sitio_temporal_active
    ON public.equipo_auditor_sitio_temporal (id_sitio_temporal, id_auditor) WHERE deleted_at IS NULL;

-- Jerarquía LTREE y Requisitos
CREATE INDEX IF NOT EXISTS idx_requisito_ruta_gist ON public.requisito USING GIST (ruta_materializada) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_requisito_padre ON public.requisito (id_requisito_padre) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_requisito_norma_padre ON public.requisito (id_norma, id_requisito_padre) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_requisito_norma_codigo ON public.requisito (id_norma, codigo) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_requisito_norma_obligatorio_active ON public.requisito (id_norma, es_obligatorio) INCLUDE (ruta_materializada, codigo) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_requisito_traduccion_lookup ON public.requisito_traduccion (id_requisito, lang) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_requisito_traduccion_fts_gin ON public.requisito_traduccion USING GIN (to_tsvector('simple', COALESCE(title, '') || ' ' || COALESCE(content_html, ''))) WHERE deleted_at IS NULL;

-- Conglomerados, Organizaciones y Acceso Cliente
CREATE INDEX IF NOT EXISTS idx_grupo_empresarial_nombre ON public.grupo_empresarial (nombre) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_organizacion_grupo_empresarial ON public.organizacion (id_grupo_empresarial) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_organizacion_nombre ON public.organizacion (nombre) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_organizacion_rif ON public.organizacion (rif) WHERE rif IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_organizacion_active ON public.organizacion (id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_organizacion_version_numero_active ON public.organizacion_version (id_organizacion, version_numero) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_organizacion_version_actual_active ON public.organizacion_version (id_organizacion) WHERE es_version_actual = TRUE AND deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_organizacion_version_nombre_actual_active ON public.organizacion_version (LOWER(TRIM(nombre))) WHERE es_version_actual = TRUE AND deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_organizacion_version_abrev_actual_active ON public.organizacion_version (LOWER(TRIM(abreviacion))) WHERE es_version_actual = TRUE AND deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_organizacion_version_rif_actual_active ON public.organizacion_version (UPPER(TRIM(rif))) WHERE es_version_actual = TRUE AND rif IS NOT NULL AND TRIM(rif) <> '' AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_organizacion_version_org_lookup ON public.organizacion_version (id_organizacion, es_version_actual DESC, version_numero DESC) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_client_org_access_lookup ON public.client_organization_access (id_usuario, id_organizacion, estado) WHERE deleted_at IS NULL;

-- Certificados
CREATE INDEX IF NOT EXISTS idx_certificado_numero ON public.certificado (numero_certificado) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_certificado_organizacion ON public.certificado (id_organizacion) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_certificado_norma_iaf ON public.certificado (id_norma, id_sector_iaf) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_certificado_subsector_iaf ON public.certificado (id_subsector_iaf) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_certificado_active ON public.certificado (id, id_estatus) WHERE deleted_at IS NULL;

-- Fechas y Contactos del Certificado (Versionados por id_certificado_version)
CREATE INDEX IF NOT EXISTS idx_fecha_certificado_lookup ON public.fecha_certificado (id_certificado_version, fecha DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_contacto_certificado_lookup ON public.contacto_certificado (id_certificado_version, nombre) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_telefono_contacto_lookup ON public.telefono_contacto_certificado (id_contacto) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_email_contacto_lookup ON public.email_contacto_certificado (id_contacto) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_contacto_cert_compartido_cert ON public.contacto_certificado_compartido (id_certificado_version) WHERE deleted_at IS NULL;

-- Competencias de Auditores
CREATE INDEX IF NOT EXISTS idx_auditor_nombre ON public.auditor (nombre) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_norma_auditor_compuesta ON public.norma_auditor (id_auditor, id_norma);
CREATE INDEX IF NOT EXISTS idx_norma_auditor_norma_lookup ON public.norma_auditor (id_norma, id_auditor);
CREATE INDEX IF NOT EXISTS idx_sector_iaf_auditor_compuesta ON public.sector_iaf_auditor (id_auditor, id_sector_iaf);
CREATE INDEX IF NOT EXISTS idx_sector_iaf_auditor_sector_lookup ON public.sector_iaf_auditor (id_sector_iaf, id_auditor);

-- Sub-Sectores IAF y Acreditaciones (Fase 1 & Refactorización Alcance Multi-Sector)
CREATE INDEX IF NOT EXISTS idx_subsector_sector ON public.subsector_iaf (id_sector_iaf, codigo) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_subsector_codigo ON public.subsector_iaf (codigo) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_subsector_auditor ON public.subsector_iaf_auditor (id_auditor, id_subsector_iaf);
CREATE UNIQUE INDEX IF NOT EXISTS uq_acreditacion_sector_active ON public.acreditacion_norma_sector_iaf (id_acreditacion_norma, id_sector_iaf) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_acreditacion_norma_org ON public.acreditacion_norma (id_organismo, id_norma, id_estatus) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_acreditacion_norma_estatus ON public.acreditacion_norma (id_estatus) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_acreditacion_norma_sector_lookup ON public.acreditacion_norma_sector_iaf (id_acreditacion_norma, id_sector_iaf) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_acreditacion_sector_norma_lookup ON public.acreditacion_norma_sector_iaf (id_sector_iaf, id_acreditacion_norma) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_organismo_codigo ON public.organismo_acreditacion (codigo) WHERE deleted_at IS NULL;

-- Sitios (Site 0 first), Procesos y Requisitos (Versionados)
CREATE INDEX IF NOT EXISTS idx_sitio_cert_numero ON public.sitio (id_certificado_version, numero_sitio) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_sitio_cert_compartido_active ON public.sitio_certificado_compartido (id_sitio, id_certificado_version) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_sitio_cert_compartido_num_active ON public.sitio_certificado_compartido (id_certificado_version, numero_sitio) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sitio_cert_compartido_cert ON public.sitio_certificado_compartido (id_certificado_version) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sitio_cert_compartido_sitio ON public.sitio_certificado_compartido (id_sitio) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_proceso_cert_tipo ON public.proceso (id_certificado_version, tipo) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_proceso_certificado ON public.proceso (id_certificado_version) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_proceso_cert_compartido_active ON public.proceso_certificado_compartido (id_proceso, id_certificado_version) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_proceso_cert_compartido_cert ON public.proceso_certificado_compartido (id_certificado_version) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_proceso_cert_compartido_sync_active ON public.proceso_certificado_compartido (id_proceso, id_certificado_version) WHERE deleted_at IS NULL AND sincronizar_requisitos = TRUE;
CREATE INDEX IF NOT EXISTS idx_turnos_por_sitio_lookup ON public.turnos_por_sitio (id_sitio, id_turno) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_turno_cert_compartido_cert ON public.turno_certificado_compartido (id_certificado_version) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_procesos_por_sitio_lookup ON public.procesos_por_sitio (id_sitio, id_proceso) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_req_proceso_lookup ON public.requisitos_por_proceso (id_proceso, id_requisito);
CREATE INDEX IF NOT EXISTS idx_req_proceso_proc_cert ON public.requisitos_por_proceso (id_proceso, id_certificado);
CREATE INDEX IF NOT EXISTS idx_req_proceso_proc_cert_version ON public.requisitos_por_proceso (id_proceso, id_certificado_version);
CREATE INDEX IF NOT EXISTS idx_req_proceso_cert_lookup ON public.requisitos_por_proceso (id_certificado_version, id_proceso, id_requisito);
CREATE INDEX IF NOT EXISTS idx_req_no_aplicables_certificado ON public.requisitos_no_aplicables_certificado (id_certificado_version, id_requisito) WHERE deleted_at IS NULL;

-- Auditorías y Evaluaciones de Campo
CREATE INDEX IF NOT EXISTS idx_equipo_auditor_lookup ON public.equipo_auditor (id_auditoria, id_auditor);
CREATE INDEX IF NOT EXISTS idx_sitios_auditoria_compuesto ON public.sitios_por_auditoria (id_auditoria, id_sitio) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_procesos_sitio_auditoria_compuesto ON public.procesos_sitio_auditoria (id_sitios_por_auditoria, id_proceso) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_turnos_proceso_sitio_aud_lookup ON public.turnos_proceso_sitio_auditoria (id_procesos_sitio_auditoria, id_turnos_sitio_auditoria) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_equipo_auditor_sitio_lookup ON public.equipo_auditor_sitio (id_sitios_por_auditoria, id_auditor) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_equipo_auditor_sitio_auditor ON public.equipo_auditor_sitio (id_auditor) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_equipo_auditor_proceso_lookup ON public.equipo_auditor_proceso_sitio (id_procesos_sitio_auditoria, id_auditor) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_equipo_auditor_proceso_auditor ON public.equipo_auditor_proceso_sitio (id_auditor) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_vinculo_grupo_nivel ON public.vinculo (id_grupo_empresarial, nivel_vinculacion) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_vinculo_grupo_active ON public.vinculo (id_grupo_empresarial) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_vinculo_certificado_vinculo ON public.vinculo_certificado (id_vinculo, id_certificado) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_programa_auditoria_vinculo ON public.programa_auditoria (id_vinculo) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_programa_auditoria_grupo_active ON public.programa_auditoria (id_grupo_empresarial) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_programa_auditoria_nivel_tipo ON public.programa_auditoria (nivel_vinculacion, tipo_vinculacion) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_auditoria_programa_estado ON public.auditoria (id_programa_auditoria, estado_ciclo) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_auditoria_certificado_ciclo ON public.auditoria (id_certificado, estado_ciclo) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_auditoria_cert_version_active ON public.auditoria (id_certificado_version, estado_ciclo) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_auditoria_certificado_active ON public.auditoria (id_certificado) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_auditoria_tipo_vinculacion ON public.auditoria (tipo_vinculacion) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_auditoria_cert_recent ON public.auditoria (id_certificado, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_auditoria_fecha_vigencia ON public.auditoria_fecha (id_auditoria, numero_secuencia DESC) WHERE deleted_at IS NULL;
DROP INDEX IF EXISTS public.idx_auditoria_fecha_rango_real;
CREATE INDEX IF NOT EXISTS idx_auditoria_fecha_rango_plan_y_real
    ON public.auditoria_fecha (fecha_inicio, fecha_fin)
    WHERE tipo_fecha IN ('PROGRAMADA_EXACTA', 'REAL') AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_auditoria_fecha_tipo_seq
    ON public.auditoria_fecha (id_auditoria, tipo_fecha, numero_secuencia DESC)
    WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_auditoria_fecha_preprog_mes ON public.auditoria_fecha (anio, mes) WHERE tipo_fecha = 'PREPROGRAMADA_MES' AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_hallazgo_auditoria ON public.hallazgo (id_auditoria, tipo) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_hallazgo_requisito_auditoria ON public.hallazgo (id_auditoria, id_requisito) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_hallazgo_auditoria_nc_vencimientos
    ON public.hallazgo (id_auditoria, tipo, cerrado, fecha_limite_cierre) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_auditoria_cierre_estado
    ON public.auditoria (estado_ciclo, fecha_cierre_auditoria) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_auditoria_revision_cola
    ON public.auditoria (revisado, fecha_cierre_auditoria DESC)
    WHERE estado_ciclo = 'Cerrada' AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sitio_temporal_auditoria
    ON public.auditoria_sitio_temporal (id_auditoria) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sitio_temporal_cert_lookup
    ON public.auditoria_sitio_temporal_certificado (id_auditoria_certificado) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_equipo_auditor_sitio_temp_lookup
    ON public.equipo_auditor_sitio_temporal (id_sitio_temporal, id_auditor) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_equipo_auditor_sitio_temp_auditor
    ON public.equipo_auditor_sitio_temporal (id_auditor) WHERE deleted_at IS NULL;

-- Índice Forense de Trazabilidad Inmutable
CREATE INDEX IF NOT EXISTS idx_audit_log_entity_lookup ON public.audit_log (table_name, record_id);