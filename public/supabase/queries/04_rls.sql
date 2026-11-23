-- ============================================================================
-- FILE 4: 04_RLS.SQL (Políticas Row Level Security Granulares y DCL - Fase 1.2)
-- ============================================================================

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO authenticated;

GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon;
GRANT EXECUTE ON ALL ROUTINES IN SCHEMA public TO anon;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO anon, authenticated;

-- Defensa en profundidad (Fase 1.2): revocar DELETE físico en tablas protegidas por soft-delete / inmutabilidad
DO $$
DECLARE
    v_tbl TEXT;
    v_non_deletable_tables TEXT[] := ARRAY[
        'norma', 'requisito', 'requisito_traduccion', 'sector_iaf', 'subsector_iaf',
        'organismo_acreditacion', 'acreditacion_norma', 'acreditacion_norma_sector_iaf',
        'estatus', 'tipo_auditoria', 'metodologia_auditoria', 'auditor',
        'grupo_empresarial', 'organizacion', 'certificado', 'fecha_certificado', 'contacto_certificado',
        'sitio', 'proceso', 'turno',
        'vinculo', 'vinculo_certificado', 'programa_auditoria', 'auditoria', 'auditoria_fecha',
        'configuracion_alerta_auditoria', 'hallazgo',
        'requisitos_no_aplicables_certificado', 'turnos_por_sitio', 'procesos_por_sitio',
        'comentarios_por_auditoria', 'sitios_por_auditoria',
        'auditoria_sitio_temporal', 'auditoria_sitio_temporal_certificado',
        'turnos_sitio_auditoria', 'procesos_sitio_auditoria', 'turnos_proceso_sitio_auditoria',
        'equipo_auditor_sitio', 'equipo_auditor_sitio_temporal', 'equipo_auditor_proceso_sitio',
        'telefono_contacto_certificado', 'email_contacto_certificado',
        'contacto_certificado_compartido', 'turno_certificado_compartido',
        'proceso_certificado_compartido', 'sitio_certificado_compartido',
        'profiles', 'client_organization_access', 'audit_log'
    ];
BEGIN
    FOREACH v_tbl IN ARRAY v_non_deletable_tables LOOP
        EXECUTE format('REVOKE DELETE ON public.%I FROM anon, authenticated', v_tbl);
    END LOOP;
END $$;

-- Funciones Auxiliares SECURITY DEFINER (con aislamiento estricto de registros archivados)
CREATE OR REPLACE FUNCTION public.get_auth_user_role()
RETURNS public.user_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT role FROM public.profiles WHERE id = auth.uid() AND status = 'APPROVED';
$$;

CREATE OR REPLACE FUNCTION public.is_approved_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'ADMIN' AND status = 'APPROVED'
    );
$$;

CREATE OR REPLACE FUNCTION public.is_approved_worker()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role IN ('ADMIN', 'WORKER') AND status = 'APPROVED'
    );
$$;

CREATE OR REPLACE FUNCTION public.is_assigned_auditor(p_id_auditoria UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.equipo_auditor ea
        JOIN public.auditoria a ON a.id = ea.id_auditoria
        JOIN public.certificado c ON c.id = a.id_certificado
        JOIN public.profiles p ON p.id = auth.uid()
        WHERE ea.id_auditoria = p_id_auditoria
          AND ea.id_auditor = auth.uid()
          AND a.deleted_at IS NULL
          AND c.deleted_at IS NULL
          AND p.role IN ('ADMIN', 'AUDITOR')
          AND p.status = 'APPROVED'
    );
$$;

CREATE OR REPLACE FUNCTION public.has_client_org_access(p_id_organizacion UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.client_organization_access coa
        JOIN public.organizacion o ON o.id = coa.id_organizacion
        JOIN public.profiles p ON p.id = auth.uid()
        WHERE coa.id_usuario = auth.uid()
          AND coa.id_organizacion = p_id_organizacion
          AND coa.estado = 'APPROVED'
          AND coa.deleted_at IS NULL
          AND o.deleted_at IS NULL
          AND p.role = 'CLIENT'
          AND p.status = 'APPROVED'
    );
$$;

CREATE OR REPLACE FUNCTION public.is_auditor_for_cert(p_id_certificado UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.auditoria a
        JOIN public.certificado c ON c.id = a.id_certificado
        JOIN public.equipo_auditor ea ON ea.id_auditoria = a.id
        JOIN public.profiles p ON p.id = auth.uid()
        WHERE a.id_certificado = p_id_certificado
          AND a.deleted_at IS NULL
          AND c.deleted_at IS NULL
          AND ea.id_auditor = auth.uid()
          AND p.role IN ('ADMIN', 'AUDITOR')
          AND p.status = 'APPROVED'
    );
$$;

CREATE OR REPLACE FUNCTION public.is_auditor_for_org(p_id_organizacion UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.organizacion o
        JOIN public.certificado c ON c.id_organizacion = o.id
        JOIN public.auditoria a ON a.id_certificado = c.id
        JOIN public.equipo_auditor ea ON ea.id_auditoria = a.id
        JOIN public.profiles p ON p.id = auth.uid()
        WHERE c.id_organizacion = p_id_organizacion
          AND o.deleted_at IS NULL
          AND c.deleted_at IS NULL
          AND a.deleted_at IS NULL
          AND ea.id_auditor = auth.uid()
          AND p.role IN ('ADMIN', 'AUDITOR')
          AND p.status = 'APPROVED'
    );
$$;

-- Verificación idempotente del trigger RBAC sobre public.profiles (después de declarar is_approved_admin)
DROP TRIGGER IF EXISTS trg_protect_profile_rbac_fields ON public.profiles;
CREATE TRIGGER trg_protect_profile_rbac_fields
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.fn_protect_profile_rbac_fields();

-- Permisos de Ejecución (DCL)
GRANT EXECUTE ON FUNCTION public.get_auth_user_role() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_approved_admin() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_approved_worker() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_assigned_auditor(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_auditor_for_cert(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_auditor_for_org(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_client_org_access(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auditor_esta_calificado(UUID, UUID, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auditores_calificados_para_certificado(UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.evaluar_cobertura_certificado(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.evaluar_cobertura_certificado(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.evaluar_cobertura_certificado(UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.cobertura_normativa_certificado(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cobertura_normativa_certificado(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.cobertura_normativa_certificado(UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.resumen_cobertura_certificado(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.resumen_cobertura_certificado(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.resumen_cobertura_certificado(UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_archive_dependency_summary(TEXT, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_archive_dependency_summary(TEXT, UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_is_approved_staff() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_is_approved_staff() FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_is_approved_staff() TO authenticated;
REVOKE ALL ON FUNCTION public.fn_desvincular_organizacion_conglomerado(UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_desvincular_organizacion_conglomerado(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_desvincular_organizacion_conglomerado(UUID, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.is_approved_staff() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_approved_staff() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_approved_staff() TO authenticated;
REVOKE ALL ON FUNCTION public.fn_next_programa_auditoria_codigo(INTEGER) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_next_programa_auditoria_codigo(INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_next_programa_auditoria_codigo(INTEGER) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_next_auditoria_codigo(INTEGER, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_next_auditoria_codigo(INTEGER, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_next_auditoria_codigo(INTEGER, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.contacto_pertenece_a_certificado(UUID, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.contacto_pertenece_a_certificado(UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.contacto_pertenece_a_certificado(UUID, UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.turno_pertenece_a_certificado(UUID, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.turno_pertenece_a_certificado(UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.turno_pertenece_a_certificado(UUID, UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.proceso_pertenece_a_certificado(UUID, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.proceso_pertenece_a_certificado(UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.proceso_pertenece_a_certificado(UUID, UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.sitio_pertenece_a_certificado(UUID, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sitio_pertenece_a_certificado(UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.sitio_pertenece_a_certificado(UUID, UUID) TO authenticated;

-- RPC segura para archivo lógico por WORKER/ADMIN sin relajar políticas SELECT (evita bloqueo WCO de PG en UPDATE)
CREATE OR REPLACE FUNCTION public.archive_record(
    p_table TEXT,
    p_record_id UUID,
    p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_core_tables TEXT[] := ARRAY[
        'norma', 'requisito', 'sector_iaf', 'subsector_iaf',
        'organismo_acreditacion', 'acreditacion_norma',
        'estatus', 'tipo_auditoria', 'metodologia_auditoria', 'auditor',
        'grupo_empresarial', 'organizacion', 'certificado', 'fecha_certificado', 'contacto_certificado',
        'sitio', 'proceso', 'turno',
        'vinculo', 'programa_auditoria', 'auditoria', 'auditoria_sitio_temporal', 'hallazgo'
    ];
    v_child_tables TEXT[] := ARRAY[
        'requisito_traduccion',
        'acreditacion_norma_sector_iaf',
        'requisitos_no_aplicables_certificado', 'turnos_por_sitio', 'procesos_por_sitio',
        'vinculo_certificado', 'auditoria_fecha', 'configuracion_alerta_auditoria',
        'comentarios_por_auditoria', 'sitios_por_auditoria',
        'auditoria_sitio_temporal_certificado',
        'turnos_sitio_auditoria', 'procesos_sitio_auditoria', 'turnos_proceso_sitio_auditoria',
        'equipo_auditor_sitio', 'equipo_auditor_sitio_temporal', 'equipo_auditor_proceso_sitio',
        'telefono_contacto_certificado', 'email_contacto_certificado',
        'contacto_certificado_compartido', 'turno_certificado_compartido',
        'proceso_certificado_compartido', 'sitio_certificado_compartido',
        'client_organization_access'
    ];
    v_updated_id UUID;
BEGIN
    IF NOT public.is_approved_worker() THEN
        RAISE EXCEPTION 'Acceso denegado: solo personal aprobado (ADMIN o WORKER) puede archivar registros.';
    END IF;

    IF p_table = ANY(v_core_tables) THEN
        EXECUTE format(
            'UPDATE public.%I SET deleted_at = NOW(), deleted_by = COALESCE($2, deleted_by), delete_reason = COALESCE(NULLIF(TRIM($3), ''''), delete_reason) WHERE id = $1 AND deleted_at IS NULL RETURNING id',
            p_table
        ) USING p_record_id, auth.uid(), p_reason INTO v_updated_id;
    ELSIF p_table = ANY(v_child_tables) THEN
        EXECUTE format(
            'UPDATE public.%I SET deleted_at = NOW(), deleted_by = COALESCE($2, deleted_by) WHERE id = $1 AND deleted_at IS NULL RETURNING id',
            p_table
        ) USING p_record_id, auth.uid() INTO v_updated_id;
    ELSE
        RAISE EXCEPTION 'Tabla no válida o no habilitada para archivo lógico: %', p_table;
    END IF;

    IF v_updated_id IS NULL THEN
        RAISE EXCEPTION 'No se encontró un registro activo con id % en public.%', p_record_id, p_table;
    END IF;

    RETURN jsonb_build_object(
        'ok', true,
        'table', p_table,
        'record_id', v_updated_id,
        'archived_by', auth.uid()
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.archive_record(TEXT, UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.archive_record(TEXT, UUID, TEXT) TO authenticated;

-- RPC transaccional Smart-Mutation para exclusiones ISO 4.3 (requisitos_no_aplicables_certificado)
CREATE OR REPLACE FUNCTION public.declarar_no_aplicable_con_mutacion(
    p_id_certificado UUID,
    p_id_requisito UUID,
    p_justificacion TEXT,
    p_existing_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_justificacion TEXT;
    v_cert_norma UUID;
    v_excl_norma UUID;
    v_excl_path LTREE;
    v_excl_codigo VARCHAR;
    v_pruned_links JSONB := '[]'::jsonb;
    v_pruned_count INTEGER := 0;
    v_saved_id UUID;
    v_active_id UUID;
BEGIN
    IF NOT public.is_approved_worker() THEN
        RAISE EXCEPTION 'Acceso denegado: solo personal aprobado (ADMIN o WORKER) puede declarar exclusiones normativas.';
    END IF;

    v_justificacion := TRIM(COALESCE(p_justificacion, ''));
    IF LENGTH(v_justificacion) < 10 THEN
        RAISE EXCEPTION 'La justificación técnica de no aplicabilidad debe contener al menos 10 caracteres.'
            USING ERRCODE = 'P0001';
    END IF;

    SELECT c.id_norma INTO v_cert_norma
    FROM public.certificado c
    WHERE c.id = p_id_certificado
      AND c.deleted_at IS NULL;

    SELECT r.id_norma, r.ruta_materializada, r.codigo
      INTO v_excl_norma, v_excl_path, v_excl_codigo
    FROM public.requisito r
    WHERE r.id = p_id_requisito
      AND r.deleted_at IS NULL;

    IF v_cert_norma IS NULL OR v_excl_norma IS NULL THEN
        RAISE EXCEPTION 'Operación bloqueada: el certificado o la cláusula seleccionada no existe o está archivada.'
            USING ERRCODE = 'P0001';
    END IF;

    IF v_excl_norma IS DISTINCT FROM v_cert_norma THEN
        RAISE EXCEPTION 'Violación de Integridad Normativa: la cláusula % pertenece a una norma distinta a la del certificado.', p_id_requisito
            USING ERRCODE = 'P0001';
    END IF;

    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id_proceso', p.id,
                'nombre_proceso', p.nombre_proceso,
                'id_requisito', r_link.id,
                'codigo', r_link.codigo
            )
            ORDER BY p.nombre_proceso ASC, r_link.ruta_materializada ASC
        ),
        '[]'::jsonb
    )
    INTO v_pruned_links
    FROM public.requisitos_por_proceso rpp
    JOIN public.proceso p ON p.id = rpp.id_proceso
    JOIN public.requisito r_link ON r_link.id = rpp.id_requisito
    WHERE rpp.id_certificado = p_id_certificado
      AND public.proceso_pertenece_a_certificado(p.id, p_id_certificado)
      AND p.deleted_at IS NULL
      AND r_link.deleted_at IS NULL
      AND r_link.id_norma = v_excl_norma
      AND (
          r_link.id = p_id_requisito
          OR (
              r_link.ruta_materializada IS NOT NULL
              AND v_excl_path IS NOT NULL
              AND r_link.ruta_materializada <@ v_excl_path
          )
      );

    v_pruned_count := COALESCE(jsonb_array_length(v_pruned_links), 0);

    IF p_existing_id IS NOT NULL THEN
        UPDATE public.requisitos_no_aplicables_certificado
        SET id_certificado = p_id_certificado,
            id_requisito = p_id_requisito,
            justificacion = v_justificacion,
            deleted_at = NULL,
            deleted_by = NULL,
            updated_at = NOW()
        WHERE id = p_existing_id
        RETURNING id INTO v_saved_id;

        IF v_saved_id IS NULL THEN
            RAISE EXCEPTION 'No se encontró la exclusión con id % para actualizar.', p_existing_id
                USING ERRCODE = 'P0001';
        END IF;
    ELSE
        SELECT id INTO v_active_id
        FROM public.requisitos_no_aplicables_certificado
        WHERE id_certificado = p_id_certificado
          AND id_requisito = p_id_requisito
          AND deleted_at IS NULL
        LIMIT 1;

        IF v_active_id IS NOT NULL THEN
            UPDATE public.requisitos_no_aplicables_certificado
            SET justificacion = v_justificacion,
                updated_at = NOW()
            WHERE id = v_active_id
            RETURNING id INTO v_saved_id;
        ELSE
            INSERT INTO public.requisitos_no_aplicables_certificado (
                id_certificado,
                id_requisito,
                justificacion
            ) VALUES (
                p_id_certificado,
                p_id_requisito,
                v_justificacion
            )
            RETURNING id INTO v_saved_id;
        END IF;
    END IF;

    IF v_pruned_count > 0 THEN
        INSERT INTO public.audit_log (
            table_name,
            operation,
            record_id,
            old_data,
            new_data,
            performed_by
        ) VALUES (
            'requisitos_por_proceso',
            'DELETE',
            v_saved_id,
            jsonb_build_object(
                'smart_mutation_pruned_links', v_pruned_links,
                'pruned_count', v_pruned_count,
                'exclusion_id', v_saved_id,
                'id_certificado', p_id_certificado,
                'id_requisito', p_id_requisito,
                'codigo_exclusion', v_excl_codigo
            ),
            NULL,
            auth.uid()
        );
    END IF;

    RETURN jsonb_build_object(
        'id', v_saved_id,
        'pruned_count', v_pruned_count,
        'pruned_links', v_pruned_links
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.declarar_no_aplicable_con_mutacion(UUID, UUID, TEXT, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.declarar_no_aplicable_con_mutacion(UUID, UUID, TEXT, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.declarar_no_aplicable_con_mutacion(UUID, UUID, TEXT, UUID) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_sync_shared_process_requisitos(UUID, UUID, UUID, BOOLEAN) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_sync_shared_process_requisitos(UUID, UUID, UUID, BOOLEAN) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_sync_shared_process_requisitos(UUID, UUID, UUID, BOOLEAN) TO authenticated;

-- Activación RLS en todas las tablas públicas (45 tablas)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_organization_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grupo_empresarial ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.certificado ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fecha_certificado ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacto_certificado ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telefono_contacto_certificado ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_contacto_certificado ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacto_certificado_compartido ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vinculo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vinculo_certificado ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.programa_auditoria ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auditoria ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auditoria_fecha ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.configuracion_alerta_auditoria ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hallazgo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.norma ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.requisito ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.requisito_traduccion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sector_iaf ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subsector_iaf ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organismo_acreditacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.acreditacion_norma ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.acreditacion_norma_sector_iaf ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estatus ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tipo_auditoria ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.metodologia_auditoria ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auditor ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.norma_auditor ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sector_iaf_auditor ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subsector_iaf_auditor ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sitio ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sitio_certificado_compartido ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proceso ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proceso_certificado_compartido ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.requisitos_por_proceso ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.requisitos_no_aplicables_certificado ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.turno ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.turnos_por_sitio ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.turno_certificado_compartido ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.procesos_por_sitio ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comentarios_por_auditoria ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipo_auditor ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sitios_por_auditoria ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.turnos_sitio_auditoria ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.procesos_sitio_auditoria ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.turnos_proceso_sitio_auditoria ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipo_auditor_sitio ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipo_auditor_proceso_sitio ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auditoria_sitio_temporal ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auditoria_sitio_temporal_certificado ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipo_auditor_sitio_temporal ENABLE ROW LEVEL SECURITY;

-- Limpieza total e idempotente de políticas previas
DO $$
DECLARE
    pol record;
BEGIN
    FOR pol IN SELECT policyname, tablename FROM pg_policies WHERE schemaname = 'public' LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);
    END LOOP;
END $$;

-- ============================================================================
-- 1. Catálogos Base y Turnos (SELECT activo p/ anon+auth, ADMIN ve archivados;
--    INSERT/UPDATE granulares para ADMIN/WORKER; SIN FOR DELETE)
-- ============================================================================

-- NORMA
CREATE POLICY "catalog_norma_select" ON public.norma
    FOR SELECT USING (deleted_at IS NULL OR public.is_approved_admin());
CREATE POLICY "catalog_norma_insert_worker" ON public.norma
    FOR INSERT TO authenticated WITH CHECK (public.is_approved_worker() AND deleted_at IS NULL);
CREATE POLICY "catalog_norma_update_worker" ON public.norma
    FOR UPDATE TO authenticated
    USING (public.is_approved_admin() OR (deleted_at IS NULL AND public.is_approved_worker()))
    WITH CHECK (public.is_approved_worker() AND (deleted_at IS NULL OR public.is_approved_admin() OR deleted_by = auth.uid()));

-- REQUISITO
CREATE POLICY "catalog_requisito_select" ON public.requisito
    FOR SELECT USING (deleted_at IS NULL OR public.is_approved_admin());
CREATE POLICY "catalog_requisito_insert_worker" ON public.requisito
    FOR INSERT TO authenticated WITH CHECK (public.is_approved_worker() AND deleted_at IS NULL);
CREATE POLICY "catalog_requisito_update_worker" ON public.requisito
    FOR UPDATE TO authenticated
    USING (public.is_approved_admin() OR (deleted_at IS NULL AND public.is_approved_worker()))
    WITH CHECK (public.is_approved_worker() AND (deleted_at IS NULL OR public.is_approved_admin() OR deleted_by = auth.uid()));

-- REQUISITO_TRADUCCION
CREATE POLICY "catalog_requisito_traduccion_select" ON public.requisito_traduccion
    FOR SELECT USING (
        public.is_approved_admin()
        OR (
            deleted_at IS NULL
            AND EXISTS (
                SELECT 1 FROM public.requisito r
                WHERE r.id = requisito_traduccion.id_requisito
                  AND r.deleted_at IS NULL
            )
        )
    );
CREATE POLICY "catalog_requisito_traduccion_insert_worker" ON public.requisito_traduccion
    FOR INSERT TO authenticated WITH CHECK (public.is_approved_worker() AND deleted_at IS NULL);
CREATE POLICY "catalog_requisito_traduccion_update_worker" ON public.requisito_traduccion
    FOR UPDATE TO authenticated
    USING (public.is_approved_admin() OR (deleted_at IS NULL AND public.is_approved_worker()))
    WITH CHECK (public.is_approved_worker() AND (deleted_at IS NULL OR public.is_approved_admin() OR deleted_by = auth.uid()));

-- SECTOR_IAF
CREATE POLICY "catalog_sector_iaf_select" ON public.sector_iaf
    FOR SELECT USING (deleted_at IS NULL OR public.is_approved_admin());
CREATE POLICY "catalog_sector_iaf_insert_worker" ON public.sector_iaf
    FOR INSERT TO authenticated WITH CHECK (public.is_approved_worker() AND deleted_at IS NULL);
CREATE POLICY "catalog_sector_iaf_update_worker" ON public.sector_iaf
    FOR UPDATE TO authenticated
    USING (public.is_approved_admin() OR (deleted_at IS NULL AND public.is_approved_worker()))
    WITH CHECK (public.is_approved_worker() AND (deleted_at IS NULL OR public.is_approved_admin() OR deleted_by = auth.uid()));

-- SUBSECTOR_IAF
CREATE POLICY "catalog_subsector_iaf_select" ON public.subsector_iaf
    FOR SELECT USING (deleted_at IS NULL OR public.is_approved_admin());
CREATE POLICY "catalog_subsector_iaf_insert_worker" ON public.subsector_iaf
    FOR INSERT TO authenticated WITH CHECK (public.is_approved_worker() AND deleted_at IS NULL);
CREATE POLICY "catalog_subsector_iaf_update_worker" ON public.subsector_iaf
    FOR UPDATE TO authenticated
    USING (public.is_approved_admin() OR (deleted_at IS NULL AND public.is_approved_worker()))
    WITH CHECK (public.is_approved_worker() AND (deleted_at IS NULL OR public.is_approved_admin() OR deleted_by = auth.uid()));

-- ORGANISMO_ACREDITACION
CREATE POLICY "catalog_organismo_acreditacion_select" ON public.organismo_acreditacion
    FOR SELECT USING (deleted_at IS NULL OR public.is_approved_admin());
CREATE POLICY "catalog_organismo_insert_worker" ON public.organismo_acreditacion
    FOR INSERT TO authenticated WITH CHECK (public.is_approved_worker() AND deleted_at IS NULL);
CREATE POLICY "catalog_organismo_update_worker" ON public.organismo_acreditacion
    FOR UPDATE TO authenticated
    USING (public.is_approved_admin() OR (deleted_at IS NULL AND public.is_approved_worker()))
    WITH CHECK (public.is_approved_worker() AND (deleted_at IS NULL OR public.is_approved_admin() OR deleted_by = auth.uid()));

-- ACREDITACION_NORMA
CREATE POLICY "catalog_acreditacion_norma_select" ON public.acreditacion_norma
    FOR SELECT USING (deleted_at IS NULL OR public.is_approved_admin());
CREATE POLICY "catalog_acreditacion_insert_worker" ON public.acreditacion_norma
    FOR INSERT TO authenticated WITH CHECK (public.is_approved_worker() AND deleted_at IS NULL);
CREATE POLICY "catalog_acreditacion_update_worker" ON public.acreditacion_norma
    FOR UPDATE TO authenticated
    USING (public.is_approved_admin() OR (deleted_at IS NULL AND public.is_approved_worker()))
    WITH CHECK (public.is_approved_worker() AND (deleted_at IS NULL OR public.is_approved_admin() OR deleted_by = auth.uid()));

-- ACREDITACION_NORMA_SECTOR_IAF (Soft-delete child link table)
CREATE POLICY "catalog_acreditacion_sector_select" ON public.acreditacion_norma_sector_iaf
    FOR SELECT USING (deleted_at IS NULL OR public.is_approved_admin());
CREATE POLICY "catalog_acreditacion_sector_insert_worker" ON public.acreditacion_norma_sector_iaf
    FOR INSERT TO authenticated WITH CHECK (public.is_approved_worker() AND deleted_at IS NULL);
CREATE POLICY "catalog_acreditacion_sector_update_worker" ON public.acreditacion_norma_sector_iaf
    FOR UPDATE TO authenticated
    USING (public.is_approved_admin() OR (deleted_at IS NULL AND public.is_approved_worker()))
    WITH CHECK (public.is_approved_worker() AND (deleted_at IS NULL OR public.is_approved_admin() OR deleted_by = auth.uid()));

-- ESTATUS
CREATE POLICY "catalog_estatus_select" ON public.estatus
    FOR SELECT USING (deleted_at IS NULL OR public.is_approved_admin());
CREATE POLICY "catalog_estatus_insert_worker" ON public.estatus
    FOR INSERT TO authenticated WITH CHECK (public.is_approved_worker() AND deleted_at IS NULL);
CREATE POLICY "catalog_estatus_update_worker" ON public.estatus
    FOR UPDATE TO authenticated
    USING (public.is_approved_admin() OR (deleted_at IS NULL AND public.is_approved_worker()))
    WITH CHECK (public.is_approved_worker() AND (deleted_at IS NULL OR public.is_approved_admin() OR deleted_by = auth.uid()));

-- TIPO_AUDITORIA
CREATE POLICY "catalog_tipo_auditoria_select" ON public.tipo_auditoria
    FOR SELECT USING (deleted_at IS NULL OR public.is_approved_admin());
CREATE POLICY "catalog_tipo_auditoria_insert_worker" ON public.tipo_auditoria
    FOR INSERT TO authenticated WITH CHECK (public.is_approved_worker() AND deleted_at IS NULL);
CREATE POLICY "catalog_tipo_auditoria_update_worker" ON public.tipo_auditoria
    FOR UPDATE TO authenticated
    USING (public.is_approved_admin() OR (deleted_at IS NULL AND public.is_approved_worker()))
    WITH CHECK (public.is_approved_worker() AND (deleted_at IS NULL OR public.is_approved_admin() OR deleted_by = auth.uid()));

-- METODOLOGIA_AUDITORIA
CREATE POLICY "catalog_metodologia_select" ON public.metodologia_auditoria
    FOR SELECT USING (deleted_at IS NULL OR public.is_approved_admin());
CREATE POLICY "catalog_metodologia_insert_worker" ON public.metodologia_auditoria
    FOR INSERT TO authenticated WITH CHECK (public.is_approved_worker() AND deleted_at IS NULL);
CREATE POLICY "catalog_metodologia_update_worker" ON public.metodologia_auditoria
    FOR UPDATE TO authenticated
    USING (public.is_approved_admin() OR (deleted_at IS NULL AND public.is_approved_worker()))
    WITH CHECK (public.is_approved_worker() AND (deleted_at IS NULL OR public.is_approved_admin() OR deleted_by = auth.uid()));

-- AUDITOR
CREATE POLICY "catalog_auditor_select" ON public.auditor
    FOR SELECT USING (deleted_at IS NULL OR public.is_approved_admin());
CREATE POLICY "catalog_auditor_insert_worker" ON public.auditor
    FOR INSERT TO authenticated WITH CHECK (public.is_approved_worker() AND deleted_at IS NULL);
CREATE POLICY "catalog_auditor_update_worker" ON public.auditor
    FOR UPDATE TO authenticated
    USING (public.is_approved_admin() OR (deleted_at IS NULL AND public.is_approved_worker()))
    WITH CHECK (public.is_approved_worker() AND (deleted_at IS NULL OR public.is_approved_admin() OR deleted_by = auth.uid()));

-- TURNO
CREATE POLICY "catalog_turno_select" ON public.turno
    FOR SELECT USING (deleted_at IS NULL OR public.is_approved_admin());
CREATE POLICY "catalog_turno_insert_worker" ON public.turno
    FOR INSERT TO authenticated WITH CHECK (public.is_approved_worker() AND deleted_at IS NULL);
CREATE POLICY "catalog_turno_update_worker" ON public.turno
    FOR UPDATE TO authenticated
    USING (public.is_approved_admin() OR (deleted_at IS NULL AND public.is_approved_worker()))
    WITH CHECK (public.is_approved_worker() AND (deleted_at IS NULL OR public.is_approved_admin() OR deleted_by = auth.uid()));

-- ============================================================================
-- 2. Tablas de Unión Puras M:N de Competencias (INSERT + DELETE controlado)
-- ============================================================================

-- NORMA_AUDITOR
CREATE POLICY "catalog_norma_auditor_select" ON public.norma_auditor
    FOR SELECT USING (
        public.is_approved_admin()
        OR EXISTS (SELECT 1 FROM public.auditor a WHERE a.id = norma_auditor.id_auditor AND a.deleted_at IS NULL)
    );
CREATE POLICY "catalog_norma_auditor_insert_worker" ON public.norma_auditor
    FOR INSERT TO authenticated WITH CHECK (public.is_approved_worker());
CREATE POLICY "catalog_norma_auditor_delete_worker" ON public.norma_auditor
    FOR DELETE TO authenticated USING (public.is_approved_worker());

-- SECTOR_IAF_AUDITOR
CREATE POLICY "catalog_sector_iaf_auditor_select" ON public.sector_iaf_auditor
    FOR SELECT USING (
        public.is_approved_admin()
        OR EXISTS (SELECT 1 FROM public.auditor a WHERE a.id = sector_iaf_auditor.id_auditor AND a.deleted_at IS NULL)
    );
CREATE POLICY "catalog_sector_iaf_auditor_insert_worker" ON public.sector_iaf_auditor
    FOR INSERT TO authenticated WITH CHECK (public.is_approved_worker());
CREATE POLICY "catalog_sector_iaf_auditor_delete_worker" ON public.sector_iaf_auditor
    FOR DELETE TO authenticated USING (public.is_approved_worker());

-- SUBSECTOR_IAF_AUDITOR
CREATE POLICY "catalog_subsector_iaf_auditor_select" ON public.subsector_iaf_auditor
    FOR SELECT USING (
        public.is_approved_admin()
        OR EXISTS (SELECT 1 FROM public.auditor a WHERE a.id = subsector_iaf_auditor.id_auditor AND a.deleted_at IS NULL)
    );
CREATE POLICY "catalog_subsector_iaf_auditor_insert_worker" ON public.subsector_iaf_auditor
    FOR INSERT TO authenticated WITH CHECK (public.is_approved_worker());
CREATE POLICY "catalog_subsector_iaf_auditor_delete_worker" ON public.subsector_iaf_auditor
    FOR DELETE TO authenticated USING (public.is_approved_worker());

-- ============================================================================
-- 3. Gobernanza de Perfiles, Acceso Cliente y Audit Log
-- ============================================================================

-- PROFILES (Admin + Auto-servicio seguro protegido por trg_protect_profile_rbac_fields)
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT TO authenticated
    USING (auth.uid() = id OR public.is_approved_worker());

CREATE POLICY "profiles_update_admin_only" ON public.profiles FOR UPDATE TO authenticated
    USING (public.is_approved_admin())
    WITH CHECK (public.is_approved_admin());

CREATE POLICY "profiles_update_self" ON public.profiles FOR UPDATE TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- CLIENT_ORGANIZATION_ACCESS
CREATE POLICY "client_access_select" ON public.client_organization_access FOR SELECT TO authenticated
    USING (
        public.is_approved_admin()
        OR (deleted_at IS NULL AND (auth.uid() = id_usuario OR public.is_approved_worker()))
    );

CREATE POLICY "client_access_insert_self" ON public.client_organization_access FOR INSERT TO authenticated
    WITH CHECK (
        deleted_at IS NULL
        AND (
            (auth.uid() = id_usuario AND estado = 'PENDING')
            OR public.is_approved_worker()
        )
    );

CREATE POLICY "client_access_update_worker" ON public.client_organization_access FOR UPDATE TO authenticated
    USING (public.is_approved_admin() OR (deleted_at IS NULL AND public.is_approved_worker()))
    WITH CHECK (public.is_approved_worker() AND (deleted_at IS NULL OR public.is_approved_admin() OR deleted_by = auth.uid()));

-- ============================================================================
-- 4. Dominio Operativo: Conglomerados, Organizaciones, Certificados, Sitios, Procesos
--    (SELECT oculta deleted_at IS NOT NULL salvo ADMIN; INSERT/UPDATE granulares; SIN FOR DELETE)
-- ============================================================================

-- GRUPO_EMPRESARIAL (Conglomerado; aislamiento Nivel 2 para CLIENT sin fuga de orgs hermanas)
CREATE POLICY "grupo_empresarial_select" ON public.grupo_empresarial FOR SELECT TO authenticated
    USING (
        public.is_approved_admin()
        OR (
            deleted_at IS NULL
            AND (
                public.is_approved_worker()
                OR EXISTS (
                    SELECT 1 FROM public.organizacion o
                    WHERE o.id_grupo_empresarial = grupo_empresarial.id
                      AND o.deleted_at IS NULL
                      AND (
                          public.has_client_org_access(o.id)
                          OR public.is_auditor_for_org(o.id)
                      )
                )
            )
        )
    );
CREATE POLICY "grupo_empresarial_insert_worker" ON public.grupo_empresarial
    FOR INSERT TO authenticated WITH CHECK (public.is_approved_worker() AND deleted_at IS NULL);
CREATE POLICY "grupo_empresarial_update_worker" ON public.grupo_empresarial
    FOR UPDATE TO authenticated
    USING (public.is_approved_admin() OR (deleted_at IS NULL AND public.is_approved_worker()))
    WITH CHECK (public.is_approved_worker() AND (deleted_at IS NULL OR public.is_approved_admin() OR deleted_by = auth.uid()));

-- ORGANIZACION
CREATE POLICY "organizacion_select" ON public.organizacion FOR SELECT TO authenticated
    USING (
        public.is_approved_admin()
        OR (
            deleted_at IS NULL
            AND (
                public.is_approved_worker()
                OR public.has_client_org_access(id)
                OR public.is_auditor_for_org(id)
            )
        )
    );
CREATE POLICY "organizacion_insert_worker" ON public.organizacion
    FOR INSERT TO authenticated WITH CHECK (public.is_approved_worker() AND deleted_at IS NULL);
CREATE POLICY "organizacion_update_worker" ON public.organizacion
    FOR UPDATE TO authenticated
    USING (public.is_approved_admin() OR (deleted_at IS NULL AND public.is_approved_worker()))
    WITH CHECK (public.is_approved_worker() AND (deleted_at IS NULL OR public.is_approved_admin() OR deleted_by = auth.uid()));

-- CERTIFICADO
CREATE POLICY "certificado_select" ON public.certificado FOR SELECT TO authenticated
    USING (
        public.is_approved_admin()
        OR (
            deleted_at IS NULL
            AND (
                public.is_approved_worker()
                OR public.has_client_org_access(id_organizacion)
                OR public.is_auditor_for_cert(id)
            )
        )
    );
CREATE POLICY "certificado_insert_worker" ON public.certificado
    FOR INSERT TO authenticated WITH CHECK (public.is_approved_worker() AND deleted_at IS NULL);
CREATE POLICY "certificado_update_worker" ON public.certificado
    FOR UPDATE TO authenticated
    USING (public.is_approved_admin() OR (deleted_at IS NULL AND public.is_approved_worker()))
    WITH CHECK (public.is_approved_worker() AND (deleted_at IS NULL OR public.is_approved_admin() OR deleted_by = auth.uid()));

-- FECHA_CERTIFICADO
CREATE POLICY "fecha_certificado_select" ON public.fecha_certificado FOR SELECT TO authenticated
    USING (
        public.is_approved_admin()
        OR (
            deleted_at IS NULL
            AND (
                public.is_approved_worker()
                OR EXISTS (
                    SELECT 1 FROM public.certificado c
                    WHERE c.id = fecha_certificado.id_certificado
                      AND c.deleted_at IS NULL
                      AND (public.has_client_org_access(c.id_organizacion) OR public.is_auditor_for_cert(c.id))
                )
            )
        )
    );
CREATE POLICY "fecha_certificado_insert_worker" ON public.fecha_certificado
    FOR INSERT TO authenticated WITH CHECK (public.is_approved_worker() AND deleted_at IS NULL);
CREATE POLICY "fecha_certificado_update_worker" ON public.fecha_certificado
    FOR UPDATE TO authenticated
    USING (public.is_approved_admin() OR (deleted_at IS NULL AND public.is_approved_worker()))
    WITH CHECK (public.is_approved_worker() AND (deleted_at IS NULL OR public.is_approved_admin() OR deleted_by = auth.uid()));

-- CONTACTO_CERTIFICADO
CREATE POLICY "contacto_certificado_select" ON public.contacto_certificado FOR SELECT TO authenticated
    USING (
        public.is_approved_admin()
        OR (
            deleted_at IS NULL
            AND (
                public.is_approved_worker()
                OR EXISTS (
                    SELECT 1 FROM public.certificado c
                    WHERE c.id = contacto_certificado.id_certificado
                      AND c.deleted_at IS NULL
                      AND (public.has_client_org_access(c.id_organizacion) OR public.is_auditor_for_cert(c.id))
                )
                OR EXISTS (
                    SELECT 1
                    FROM public.contacto_certificado_compartido ccc
                    JOIN public.certificado c ON c.id = ccc.id_certificado
                    WHERE ccc.id_contacto = contacto_certificado.id
                      AND ccc.deleted_at IS NULL
                      AND c.deleted_at IS NULL
                      AND (public.has_client_org_access(c.id_organizacion) OR public.is_auditor_for_cert(c.id))
                )
            )
        )
    );
CREATE POLICY "contacto_certificado_insert_worker" ON public.contacto_certificado
    FOR INSERT TO authenticated WITH CHECK (public.is_approved_worker() AND deleted_at IS NULL);
CREATE POLICY "contacto_certificado_update_worker" ON public.contacto_certificado
    FOR UPDATE TO authenticated
    USING (public.is_approved_admin() OR (deleted_at IS NULL AND public.is_approved_worker()))
    WITH CHECK (public.is_approved_worker() AND (deleted_at IS NULL OR public.is_approved_admin() OR deleted_by = auth.uid()));

-- CONTACTO_CERTIFICADO_COMPARTIDO (Aislamiento Nivel 2: CLIENT solo ve filas cuyo id_certificado pertenece a su org)
CREATE POLICY "contacto_cert_compartido_select" ON public.contacto_certificado_compartido FOR SELECT TO authenticated
    USING (
        public.is_approved_admin()
        OR (
            deleted_at IS NULL
            AND (
                public.is_approved_worker()
                OR EXISTS (
                    SELECT 1 FROM public.certificado c
                    WHERE c.id = contacto_certificado_compartido.id_certificado
                      AND c.deleted_at IS NULL
                      AND (public.has_client_org_access(c.id_organizacion) OR public.is_auditor_for_cert(c.id))
                )
            )
        )
    );
CREATE POLICY "contacto_cert_compartido_insert_worker" ON public.contacto_certificado_compartido
    FOR INSERT TO authenticated WITH CHECK (public.is_approved_worker() AND deleted_at IS NULL);
CREATE POLICY "contacto_cert_compartido_update_worker" ON public.contacto_certificado_compartido
    FOR UPDATE TO authenticated
    USING (public.is_approved_admin() OR (deleted_at IS NULL AND public.is_approved_worker()))
    WITH CHECK (public.is_approved_worker() AND (deleted_at IS NULL OR public.is_approved_admin() OR deleted_by = auth.uid()));

-- TELEFONO_CONTACTO_CERTIFICADO
CREATE POLICY "telefono_contacto_certificado_select" ON public.telefono_contacto_certificado FOR SELECT TO authenticated
    USING (
        public.is_approved_admin()
        OR (
            deleted_at IS NULL
            AND (
                public.is_approved_worker()
                OR EXISTS (
                    SELECT 1 FROM public.contacto_certificado cc
                    JOIN public.certificado c ON c.id = cc.id_certificado
                    WHERE cc.id = telefono_contacto_certificado.id_contacto
                      AND cc.deleted_at IS NULL
                      AND c.deleted_at IS NULL
                      AND (public.has_client_org_access(c.id_organizacion) OR public.is_auditor_for_cert(c.id))
                )
                OR EXISTS (
                    SELECT 1 FROM public.contacto_certificado cc
                    JOIN public.contacto_certificado_compartido ccc ON ccc.id_contacto = cc.id
                    JOIN public.certificado c ON c.id = ccc.id_certificado
                    WHERE cc.id = telefono_contacto_certificado.id_contacto
                      AND cc.deleted_at IS NULL
                      AND ccc.deleted_at IS NULL
                      AND c.deleted_at IS NULL
                      AND (public.has_client_org_access(c.id_organizacion) OR public.is_auditor_for_cert(c.id))
                )
            )
        )
    );
CREATE POLICY "telefono_contacto_certificado_insert_worker" ON public.telefono_contacto_certificado
    FOR INSERT TO authenticated WITH CHECK (public.is_approved_worker() AND deleted_at IS NULL);
CREATE POLICY "telefono_contacto_certificado_update_worker" ON public.telefono_contacto_certificado
    FOR UPDATE TO authenticated
    USING (public.is_approved_admin() OR (deleted_at IS NULL AND public.is_approved_worker()))
    WITH CHECK (public.is_approved_worker() AND (deleted_at IS NULL OR public.is_approved_admin() OR deleted_by = auth.uid()));

-- EMAIL_CONTACTO_CERTIFICADO
CREATE POLICY "email_contacto_certificado_select" ON public.email_contacto_certificado FOR SELECT TO authenticated
    USING (
        public.is_approved_admin()
        OR (
            deleted_at IS NULL
            AND (
                public.is_approved_worker()
                OR EXISTS (
                    SELECT 1 FROM public.contacto_certificado cc
                    JOIN public.certificado c ON c.id = cc.id_certificado
                    WHERE cc.id = email_contacto_certificado.id_contacto
                      AND cc.deleted_at IS NULL
                      AND c.deleted_at IS NULL
                      AND (public.has_client_org_access(c.id_organizacion) OR public.is_auditor_for_cert(c.id))
                )
                OR EXISTS (
                    SELECT 1 FROM public.contacto_certificado cc
                    JOIN public.contacto_certificado_compartido ccc ON ccc.id_contacto = cc.id
                    JOIN public.certificado c ON c.id = ccc.id_certificado
                    WHERE cc.id = email_contacto_certificado.id_contacto
                      AND cc.deleted_at IS NULL
                      AND ccc.deleted_at IS NULL
                      AND c.deleted_at IS NULL
                      AND (public.has_client_org_access(c.id_organizacion) OR public.is_auditor_for_cert(c.id))
                )
            )
        )
    );
CREATE POLICY "email_contacto_certificado_insert_worker" ON public.email_contacto_certificado
    FOR INSERT TO authenticated WITH CHECK (public.is_approved_worker() AND deleted_at IS NULL);
CREATE POLICY "email_contacto_certificado_update_worker" ON public.email_contacto_certificado
    FOR UPDATE TO authenticated
    USING (public.is_approved_admin() OR (deleted_at IS NULL AND public.is_approved_worker()))
    WITH CHECK (public.is_approved_worker() AND (deleted_at IS NULL OR public.is_approved_admin() OR deleted_by = auth.uid()));

-- SITIO
CREATE POLICY "sitio_select" ON public.sitio FOR SELECT TO authenticated
    USING (
        public.is_approved_admin()
        OR (
            deleted_at IS NULL
            AND (
                public.is_approved_worker()
                OR EXISTS (
                    SELECT 1 FROM public.certificado c
                    WHERE c.id = sitio.id_certificado
                      AND c.deleted_at IS NULL
                      AND (public.has_client_org_access(c.id_organizacion) OR public.is_auditor_for_cert(c.id))
                )
                OR EXISTS (
                    SELECT 1
                    FROM public.sitio_certificado_compartido scc
                    JOIN public.certificado c ON c.id = scc.id_certificado
                    WHERE scc.id_sitio = sitio.id
                      AND scc.deleted_at IS NULL
                      AND c.deleted_at IS NULL
                      AND (public.has_client_org_access(c.id_organizacion) OR public.is_auditor_for_cert(c.id))
                )
            )
        )
    );
CREATE POLICY "sitio_insert_worker" ON public.sitio
    FOR INSERT TO authenticated WITH CHECK (public.is_approved_worker() AND deleted_at IS NULL);
CREATE POLICY "sitio_update_worker" ON public.sitio
    FOR UPDATE TO authenticated
    USING (public.is_approved_admin() OR (deleted_at IS NULL AND public.is_approved_worker()))
    WITH CHECK (public.is_approved_worker() AND (deleted_at IS NULL OR public.is_approved_admin() OR deleted_by = auth.uid()));

-- SITIO_CERTIFICADO_COMPARTIDO (Aislamiento Nivel 2: CLIENT solo ve filas cuyo id_certificado pertenece a su org)
CREATE POLICY "sitio_cert_compartido_select" ON public.sitio_certificado_compartido FOR SELECT TO authenticated
    USING (
        public.is_approved_admin()
        OR (
            deleted_at IS NULL
            AND (
                public.is_approved_worker()
                OR EXISTS (
                    SELECT 1 FROM public.certificado c
                    WHERE c.id = sitio_certificado_compartido.id_certificado
                      AND c.deleted_at IS NULL
                      AND (public.has_client_org_access(c.id_organizacion) OR public.is_auditor_for_cert(c.id))
                )
            )
        )
    );
CREATE POLICY "sitio_cert_compartido_insert_worker" ON public.sitio_certificado_compartido
    FOR INSERT TO authenticated WITH CHECK (public.is_approved_worker() AND deleted_at IS NULL);
CREATE POLICY "sitio_cert_compartido_update_worker" ON public.sitio_certificado_compartido
    FOR UPDATE TO authenticated
    USING (public.is_approved_admin() OR (deleted_at IS NULL AND public.is_approved_worker()))
    WITH CHECK (public.is_approved_worker() AND (deleted_at IS NULL OR public.is_approved_admin() OR deleted_by = auth.uid()));

-- PROCESO
CREATE POLICY "proceso_select" ON public.proceso FOR SELECT TO authenticated
    USING (
        public.is_approved_admin()
        OR (
            deleted_at IS NULL
            AND (
                public.is_approved_worker()
                OR EXISTS (
                    SELECT 1 FROM public.certificado c
                    WHERE c.id = proceso.id_certificado
                      AND c.deleted_at IS NULL
                      AND (public.has_client_org_access(c.id_organizacion) OR public.is_auditor_for_cert(c.id))
                )
                OR EXISTS (
                    SELECT 1
                    FROM public.proceso_certificado_compartido pcc
                    JOIN public.certificado c ON c.id = pcc.id_certificado
                    WHERE pcc.id_proceso = proceso.id
                      AND pcc.deleted_at IS NULL
                      AND c.deleted_at IS NULL
                      AND (public.has_client_org_access(c.id_organizacion) OR public.is_auditor_for_cert(c.id))
                )
            )
        )
    );
CREATE POLICY "proceso_insert_worker" ON public.proceso
    FOR INSERT TO authenticated WITH CHECK (public.is_approved_worker() AND deleted_at IS NULL);
CREATE POLICY "proceso_update_worker" ON public.proceso
    FOR UPDATE TO authenticated
    USING (public.is_approved_admin() OR (deleted_at IS NULL AND public.is_approved_worker()))
    WITH CHECK (public.is_approved_worker() AND (deleted_at IS NULL OR public.is_approved_admin() OR deleted_by = auth.uid()));

-- PROCESO_CERTIFICADO_COMPARTIDO (Aislamiento Nivel 2: CLIENT solo ve filas cuyo id_certificado pertenece a su org)
CREATE POLICY "proceso_cert_compartido_select" ON public.proceso_certificado_compartido FOR SELECT TO authenticated
    USING (
        public.is_approved_admin()
        OR (
            deleted_at IS NULL
            AND (
                public.is_approved_worker()
                OR EXISTS (
                    SELECT 1 FROM public.certificado c
                    WHERE c.id = proceso_certificado_compartido.id_certificado
                      AND c.deleted_at IS NULL
                      AND (public.has_client_org_access(c.id_organizacion) OR public.is_auditor_for_cert(c.id))
                )
            )
        )
    );
CREATE POLICY "proceso_cert_compartido_insert_worker" ON public.proceso_certificado_compartido
    FOR INSERT TO authenticated WITH CHECK (public.is_approved_worker() AND deleted_at IS NULL);
CREATE POLICY "proceso_cert_compartido_update_worker" ON public.proceso_certificado_compartido
    FOR UPDATE TO authenticated
    USING (public.is_approved_admin() OR (deleted_at IS NULL AND public.is_approved_worker()))
    WITH CHECK (public.is_approved_worker() AND (deleted_at IS NULL OR public.is_approved_admin() OR deleted_by = auth.uid()));

-- REQUISITOS_POR_PROCESO (M:N pura por Certificado — aislamiento estricto sobre requisitos_por_proceso.id_certificado)
CREATE POLICY "req_proceso_select" ON public.requisitos_por_proceso FOR SELECT TO authenticated
    USING (
        public.is_approved_admin()
        OR EXISTS (
            SELECT 1 FROM public.proceso p
            JOIN public.certificado c ON c.id = requisitos_por_proceso.id_certificado
            WHERE p.id = requisitos_por_proceso.id_proceso
              AND p.deleted_at IS NULL
              AND c.deleted_at IS NULL
              AND (
                  public.is_approved_worker()
                  OR public.has_client_org_access(c.id_organizacion)
                  OR public.is_auditor_for_cert(c.id)
              )
        )
    );
CREATE POLICY "req_proceso_insert_worker" ON public.requisitos_por_proceso
    FOR INSERT TO authenticated WITH CHECK (public.is_approved_worker());
CREATE POLICY "req_proceso_delete_worker" ON public.requisitos_por_proceso
    FOR DELETE TO authenticated USING (public.is_approved_worker());

-- REQUISITOS_NO_APLICABLES_CERTIFICADO
CREATE POLICY "req_no_aplicables_select" ON public.requisitos_no_aplicables_certificado FOR SELECT TO authenticated
    USING (
        public.is_approved_admin()
        OR (
            deleted_at IS NULL
            AND (
                public.is_approved_worker()
                OR EXISTS (
                    SELECT 1 FROM public.certificado c
                    WHERE c.id = requisitos_no_aplicables_certificado.id_certificado
                      AND c.deleted_at IS NULL
                      AND (public.has_client_org_access(c.id_organizacion) OR public.is_auditor_for_cert(c.id))
                )
            )
        )
    );
CREATE POLICY "req_no_aplicables_insert_worker" ON public.requisitos_no_aplicables_certificado
    FOR INSERT TO authenticated WITH CHECK (public.is_approved_worker() AND deleted_at IS NULL);
CREATE POLICY "req_no_aplicables_update_worker" ON public.requisitos_no_aplicables_certificado
    FOR UPDATE TO authenticated
    USING (public.is_approved_admin() OR (deleted_at IS NULL AND public.is_approved_worker()))
    WITH CHECK (public.is_approved_worker() AND (deleted_at IS NULL OR public.is_approved_admin() OR deleted_by = auth.uid()));

-- TURNOS_POR_SITIO
CREATE POLICY "turnos_sitio_select" ON public.turnos_por_sitio FOR SELECT TO authenticated
    USING (
        public.is_approved_admin()
        OR (
            deleted_at IS NULL
            AND (
                public.is_approved_worker()
                OR EXISTS (
                    SELECT 1 FROM public.sitio s
                    JOIN public.certificado c ON c.id = s.id_certificado
                    WHERE s.id = turnos_por_sitio.id_sitio
                      AND s.deleted_at IS NULL
                      AND c.deleted_at IS NULL
                      AND (public.has_client_org_access(c.id_organizacion) OR public.is_auditor_for_cert(c.id))
                )
                OR EXISTS (
                    SELECT 1 FROM public.sitio s
                    JOIN public.sitio_certificado_compartido scc ON scc.id_sitio = s.id
                    JOIN public.certificado c ON c.id = scc.id_certificado
                    WHERE s.id = turnos_por_sitio.id_sitio
                      AND s.deleted_at IS NULL
                      AND scc.deleted_at IS NULL
                      AND c.deleted_at IS NULL
                      AND (public.has_client_org_access(c.id_organizacion) OR public.is_auditor_for_cert(c.id))
                )
            )
        )
    );
CREATE POLICY "turnos_sitio_insert_worker" ON public.turnos_por_sitio
    FOR INSERT TO authenticated WITH CHECK (public.is_approved_worker() AND deleted_at IS NULL);
CREATE POLICY "turnos_sitio_update_worker" ON public.turnos_por_sitio
    FOR UPDATE TO authenticated
    USING (public.is_approved_admin() OR (deleted_at IS NULL AND public.is_approved_worker()))
    WITH CHECK (public.is_approved_worker() AND (deleted_at IS NULL OR public.is_approved_admin() OR deleted_by = auth.uid()));

-- TURNO_CERTIFICADO_COMPARTIDO (Aislamiento Nivel 2: CLIENT solo ve filas cuyo id_certificado pertenece a su org)
CREATE POLICY "turno_cert_compartido_select" ON public.turno_certificado_compartido FOR SELECT TO authenticated
    USING (
        public.is_approved_admin()
        OR (
            deleted_at IS NULL
            AND (
                public.is_approved_worker()
                OR EXISTS (
                    SELECT 1 FROM public.certificado c
                    WHERE c.id = turno_certificado_compartido.id_certificado
                      AND c.deleted_at IS NULL
                      AND (public.has_client_org_access(c.id_organizacion) OR public.is_auditor_for_cert(c.id))
                )
            )
        )
    );
CREATE POLICY "turno_cert_compartido_insert_worker" ON public.turno_certificado_compartido
    FOR INSERT TO authenticated WITH CHECK (public.is_approved_worker() AND deleted_at IS NULL);
CREATE POLICY "turno_cert_compartido_update_worker" ON public.turno_certificado_compartido
    FOR UPDATE TO authenticated
    USING (public.is_approved_admin() OR (deleted_at IS NULL AND public.is_approved_worker()))
    WITH CHECK (public.is_approved_worker() AND (deleted_at IS NULL OR public.is_approved_admin() OR deleted_by = auth.uid()));

-- PROCESOS_POR_SITIO (Alcance por certificado: aislamiento estricto por procesos_por_sitio.id_certificado)
CREATE POLICY "procesos_por_sitio_select" ON public.procesos_por_sitio FOR SELECT TO authenticated
    USING (
        public.is_approved_admin()
        OR (
            deleted_at IS NULL
            AND (
                public.is_approved_worker()
                OR EXISTS (
                    SELECT 1 FROM public.sitio s
                    JOIN public.certificado c ON c.id = procesos_por_sitio.id_certificado
                    WHERE s.id = procesos_por_sitio.id_sitio
                      AND s.deleted_at IS NULL
                      AND c.deleted_at IS NULL
                      AND (public.has_client_org_access(c.id_organizacion) OR public.is_auditor_for_cert(c.id))
                )
            )
        )
    );
CREATE POLICY "procesos_por_sitio_insert_worker" ON public.procesos_por_sitio
    FOR INSERT TO authenticated WITH CHECK (public.is_approved_worker() AND deleted_at IS NULL);
CREATE POLICY "procesos_por_sitio_update_worker" ON public.procesos_por_sitio
    FOR UPDATE TO authenticated
    USING (public.is_approved_admin() OR (deleted_at IS NULL AND public.is_approved_worker()))
    WITH CHECK (public.is_approved_worker() AND (deleted_at IS NULL OR public.is_approved_admin() OR deleted_by = auth.uid()));

-- ============================================================================
-- 5. Planificación y Ejecución de Auditorías (con Aislamiento Nivel 2)
-- ============================================================================

-- VINCULO (Compromiso persistente de vinculación; aislamiento Nivel 2 sin fugas entre empresas hermanas)
CREATE POLICY "vinculo_select" ON public.vinculo FOR SELECT TO authenticated
    USING (
        public.is_approved_admin()
        OR (
            deleted_at IS NULL
            AND (
                public.is_approved_worker()
                OR EXISTS (
                    SELECT 1 FROM public.vinculo_certificado vc
                    JOIN public.certificado c ON c.id = vc.id_certificado
                    WHERE vc.id_vinculo = vinculo.id
                      AND vc.deleted_at IS NULL
                      AND c.deleted_at IS NULL
                      AND (
                          public.has_client_org_access(c.id_organizacion)
                          OR public.is_auditor_for_cert(c.id)
                      )
                )
            )
        )
    );
CREATE POLICY "vinculo_insert_worker" ON public.vinculo
    FOR INSERT TO authenticated WITH CHECK (public.is_approved_worker() AND deleted_at IS NULL);
CREATE POLICY "vinculo_update_worker" ON public.vinculo
    FOR UPDATE TO authenticated
    USING (public.is_approved_admin() OR (deleted_at IS NULL AND public.is_approved_worker()))
    WITH CHECK (public.is_approved_worker() AND (deleted_at IS NULL OR public.is_approved_admin() OR deleted_by = auth.uid()));

-- VINCULO_CERTIFICADO (Aislamiento estricto: CLIENT solo ve sus propios certificados, nunca empresas hermanas)
CREATE POLICY "vinculo_certificado_select" ON public.vinculo_certificado FOR SELECT TO authenticated
    USING (
        public.is_approved_admin()
        OR (
            deleted_at IS NULL
            AND (
                public.is_approved_worker()
                OR EXISTS (
                    SELECT 1 FROM public.certificado c
                    WHERE c.id = vinculo_certificado.id_certificado
                      AND c.deleted_at IS NULL
                      AND (
                          public.has_client_org_access(c.id_organizacion)
                          OR public.is_auditor_for_cert(c.id)
                      )
                )
            )
        )
    );
CREATE POLICY "vinculo_certificado_insert_worker" ON public.vinculo_certificado
    FOR INSERT TO authenticated WITH CHECK (public.is_approved_worker() AND deleted_at IS NULL);
CREATE POLICY "vinculo_certificado_update_worker" ON public.vinculo_certificado
    FOR UPDATE TO authenticated
    USING (public.is_approved_admin() OR (deleted_at IS NULL AND public.is_approved_worker()))
    WITH CHECK (public.is_approved_worker() AND (deleted_at IS NULL OR public.is_approved_admin() OR deleted_by = auth.uid()));

-- PROGRAMA_AUDITORIA (Cabecera maestra; en Nivel 2 Inter-Org, CLIENT solo ve la cabecera
-- donde participa su organización, mientras auditoria y tablas hijas bloquean Org B)
CREATE POLICY "programa_auditoria_select" ON public.programa_auditoria FOR SELECT TO authenticated
    USING (
        public.is_approved_admin()
        OR (
            deleted_at IS NULL
            AND (
                public.is_approved_worker()
                OR EXISTS (
                    SELECT 1 FROM public.auditoria a
                    JOIN public.certificado c ON c.id = a.id_certificado
                    WHERE a.id_programa_auditoria = programa_auditoria.id
                      AND a.deleted_at IS NULL
                      AND c.deleted_at IS NULL
                      AND (
                          public.is_assigned_auditor(a.id)
                          OR public.has_client_org_access(c.id_organizacion)
                      )
                )
            )
        )
    );
CREATE POLICY "programa_auditoria_insert_worker" ON public.programa_auditoria
    FOR INSERT TO authenticated WITH CHECK (public.is_approved_worker() AND deleted_at IS NULL);
CREATE POLICY "programa_auditoria_update_worker" ON public.programa_auditoria
    FOR UPDATE TO authenticated
    USING (public.is_approved_admin() OR (deleted_at IS NULL AND public.is_approved_worker()))
    WITH CHECK (public.is_approved_worker() AND (deleted_at IS NULL OR public.is_approved_admin() OR deleted_by = auth.uid()));

-- AUDITORIA (Step 10.1 + Step 11.1 RBAC: solo ADMIN/WORKER mutan cierre y campos QA de revisión; AUDITOR/CLIENT solo lectura acotada)
CREATE POLICY "auditoria_select" ON public.auditoria FOR SELECT TO authenticated
    USING (
        public.is_approved_admin()
        OR (
            deleted_at IS NULL
            AND (
                public.is_approved_worker()
                OR public.is_assigned_auditor(id)
                OR EXISTS (
                    SELECT 1 FROM public.certificado c
                    WHERE c.id = auditoria.id_certificado
                      AND c.deleted_at IS NULL
                      AND public.has_client_org_access(c.id_organizacion)
                )
            )
        )
    );
CREATE POLICY "auditoria_insert_worker" ON public.auditoria
    FOR INSERT TO authenticated
    WITH CHECK (
        public.is_approved_worker()
        AND deleted_at IS NULL
        AND (
            (estado_ciclo <> 'Cerrada' AND fecha_cierre_auditoria IS NULL)
            OR (fecha_cierre_auditoria IS NOT NULL AND public.is_approved_worker())
        )
        AND (
            revisado = FALSE
            OR (
                revisado = TRUE
                AND public.is_approved_worker()
            )
        )
    );
CREATE POLICY "auditoria_update_worker" ON public.auditoria
    FOR UPDATE TO authenticated
    USING (public.is_approved_admin() OR (deleted_at IS NULL AND public.is_approved_worker()))
    WITH CHECK (
        public.is_approved_worker()
        AND (deleted_at IS NULL OR public.is_approved_admin() OR deleted_by = auth.uid())
        AND (
            (estado_ciclo <> 'Cerrada' AND fecha_cierre_auditoria IS NULL)
            OR (fecha_cierre_auditoria IS NOT NULL AND public.is_approved_worker())
        )
        AND (
            revisado = FALSE
            OR (
                revisado = TRUE
                AND public.is_approved_worker()
            )
        )
    );

-- AUDITORIA_FECHA (Multi-fecha 1:N; aislamiento Nivel 2 por certificado/organización)
CREATE POLICY "auditoria_fecha_select" ON public.auditoria_fecha FOR SELECT TO authenticated
    USING (
        public.is_approved_admin()
        OR (
            deleted_at IS NULL
            AND (
                public.is_approved_worker()
                OR public.is_assigned_auditor(id_auditoria)
                OR EXISTS (
                    SELECT 1 FROM public.auditoria a
                    JOIN public.certificado c ON c.id = a.id_certificado
                    WHERE a.id = auditoria_fecha.id_auditoria
                      AND a.deleted_at IS NULL
                      AND c.deleted_at IS NULL
                      AND public.has_client_org_access(c.id_organizacion)
                )
            )
        )
    );
CREATE POLICY "auditoria_fecha_insert_worker" ON public.auditoria_fecha
    FOR INSERT TO authenticated WITH CHECK (public.is_approved_worker() AND deleted_at IS NULL);
CREATE POLICY "auditoria_fecha_update_worker" ON public.auditoria_fecha
    FOR UPDATE TO authenticated
    USING (public.is_approved_admin() OR (deleted_at IS NULL AND public.is_approved_worker()))
    WITH CHECK (public.is_approved_worker() AND (deleted_at IS NULL OR public.is_approved_admin() OR deleted_by = auth.uid()));

-- CONFIGURACION_ALERTA_AUDITORIA (Lectura para usuarios aprobados, mutación solo ADMIN/WORKER)
CREATE POLICY "configuracion_alerta_auditoria_select" ON public.configuracion_alerta_auditoria FOR SELECT TO authenticated
    USING (
        public.is_approved_admin()
        OR (
            deleted_at IS NULL
            AND EXISTS (
                SELECT 1 FROM public.profiles p
                WHERE p.id = auth.uid()
                  AND p.status = 'APPROVED'
            )
        )
    );
CREATE POLICY "configuracion_alerta_auditoria_insert_worker" ON public.configuracion_alerta_auditoria
    FOR INSERT TO authenticated WITH CHECK (public.is_approved_worker() AND deleted_at IS NULL);
CREATE POLICY "configuracion_alerta_auditoria_update_worker" ON public.configuracion_alerta_auditoria
    FOR UPDATE TO authenticated
    USING (public.is_approved_admin() OR (deleted_at IS NULL AND public.is_approved_worker()))
    WITH CHECK (public.is_approved_worker() AND (deleted_at IS NULL OR public.is_approved_admin() OR deleted_by = auth.uid()));

-- EQUIPO_AUDITOR (M:N pura — retiene INSERT, UPDATE rol y DELETE para desasignación de auditores)
CREATE POLICY "equipo_auditor_select" ON public.equipo_auditor FOR SELECT TO authenticated
    USING (
        public.is_approved_admin()
        OR EXISTS (
            SELECT 1 FROM public.auditoria a
            JOIN public.certificado c ON c.id = a.id_certificado
            WHERE a.id = equipo_auditor.id_auditoria
              AND a.deleted_at IS NULL
              AND c.deleted_at IS NULL
              AND (public.is_approved_worker() OR public.is_assigned_auditor(equipo_auditor.id_auditoria))
        )
    );
CREATE POLICY "equipo_auditor_insert_worker" ON public.equipo_auditor
    FOR INSERT TO authenticated WITH CHECK (public.is_approved_worker());
CREATE POLICY "equipo_auditor_update_worker" ON public.equipo_auditor
    FOR UPDATE TO authenticated USING (public.is_approved_worker()) WITH CHECK (public.is_approved_worker());
CREATE POLICY "equipo_auditor_delete_worker" ON public.equipo_auditor
    FOR DELETE TO authenticated USING (public.is_approved_worker());

-- HALLAZGO (Auditor asignado puede insertar/actualizar hallazgos activos, pero NO archivarlos)
CREATE POLICY "hallazgo_select" ON public.hallazgo FOR SELECT TO authenticated
    USING (
        public.is_approved_admin()
        OR (
            deleted_at IS NULL
            AND (
                public.is_approved_worker()
                OR public.is_assigned_auditor(id_auditoria)
                OR EXISTS (
                    SELECT 1 FROM public.auditoria a
                    JOIN public.certificado c ON a.id_certificado = c.id
                    WHERE a.id = hallazgo.id_auditoria
                      AND a.deleted_at IS NULL
                      AND c.deleted_at IS NULL
                      AND public.has_client_org_access(c.id_organizacion)
                )
            )
        )
    );
CREATE POLICY "hallazgo_insert_auditor_or_worker" ON public.hallazgo
    FOR INSERT TO authenticated
    WITH CHECK (
        deleted_at IS NULL
        AND (public.is_approved_worker() OR public.is_assigned_auditor(id_auditoria))
    );
CREATE POLICY "hallazgo_update_auditor_or_worker" ON public.hallazgo
    FOR UPDATE TO authenticated
    USING (
        public.is_approved_admin()
        OR (
            deleted_at IS NULL
            AND (public.is_approved_worker() OR public.is_assigned_auditor(id_auditoria))
        )
    )
    WITH CHECK (
        (
            deleted_at IS NULL
            AND (public.is_approved_worker() OR public.is_assigned_auditor(id_auditoria))
        )
        OR (
            deleted_at IS NOT NULL
            AND public.is_approved_worker()
            AND (public.is_approved_admin() OR deleted_by = auth.uid())
        )
    );

-- SITIOS_POR_AUDITORIA
CREATE POLICY "sitios_por_auditoria_select" ON public.sitios_por_auditoria FOR SELECT TO authenticated
    USING (
        public.is_approved_admin()
        OR (
            deleted_at IS NULL
            AND (
                public.is_approved_worker()
                OR public.is_assigned_auditor(id_auditoria)
                OR EXISTS (
                    SELECT 1 FROM public.auditoria a
                    JOIN public.certificado c ON a.id_certificado = c.id
                    WHERE a.id = sitios_por_auditoria.id_auditoria
                      AND a.deleted_at IS NULL
                      AND c.deleted_at IS NULL
                      AND public.has_client_org_access(c.id_organizacion)
                )
            )
        )
    );
CREATE POLICY "sitios_por_auditoria_insert_worker" ON public.sitios_por_auditoria
    FOR INSERT TO authenticated WITH CHECK (public.is_approved_worker() AND deleted_at IS NULL);
CREATE POLICY "sitios_por_auditoria_update_worker" ON public.sitios_por_auditoria
    FOR UPDATE TO authenticated
    USING (public.is_approved_admin() OR (deleted_at IS NULL AND public.is_approved_worker()))
    WITH CHECK (public.is_approved_worker() AND (deleted_at IS NULL OR public.is_approved_admin() OR deleted_by = auth.uid()));

-- TURNOS_SITIO_AUDITORIA
CREATE POLICY "turnos_sitio_auditoria_select" ON public.turnos_sitio_auditoria FOR SELECT TO authenticated
    USING (
        public.is_approved_admin()
        OR (
            deleted_at IS NULL
            AND (
                public.is_approved_worker()
                OR EXISTS (
                    SELECT 1 FROM public.sitios_por_auditoria sa
                    WHERE sa.id = turnos_sitio_auditoria.id_sitios_por_auditoria
                      AND sa.deleted_at IS NULL
                      AND (
                          public.is_assigned_auditor(sa.id_auditoria)
                          OR EXISTS (
                              SELECT 1 FROM public.auditoria a
                              JOIN public.certificado c ON a.id_certificado = c.id
                              WHERE a.id = sa.id_auditoria
                                AND a.deleted_at IS NULL
                                AND c.deleted_at IS NULL
                                AND public.has_client_org_access(c.id_organizacion)
                          )
                      )
                )
            )
        )
    );
CREATE POLICY "turnos_sitio_auditoria_insert_worker" ON public.turnos_sitio_auditoria
    FOR INSERT TO authenticated WITH CHECK (public.is_approved_worker() AND deleted_at IS NULL);
CREATE POLICY "turnos_sitio_auditoria_update_worker" ON public.turnos_sitio_auditoria
    FOR UPDATE TO authenticated
    USING (public.is_approved_admin() OR (deleted_at IS NULL AND public.is_approved_worker()))
    WITH CHECK (public.is_approved_worker() AND (deleted_at IS NULL OR public.is_approved_admin() OR deleted_by = auth.uid()));

-- PROCESOS_SITIO_AUDITORIA
CREATE POLICY "procesos_sitio_auditoria_select" ON public.procesos_sitio_auditoria FOR SELECT TO authenticated
    USING (
        public.is_approved_admin()
        OR (
            deleted_at IS NULL
            AND (
                public.is_approved_worker()
                OR EXISTS (
                    SELECT 1 FROM public.sitios_por_auditoria sa
                    WHERE sa.id = procesos_sitio_auditoria.id_sitios_por_auditoria
                      AND sa.deleted_at IS NULL
                      AND (
                          public.is_assigned_auditor(sa.id_auditoria)
                          OR EXISTS (
                              SELECT 1 FROM public.auditoria a
                              JOIN public.certificado c ON a.id_certificado = c.id
                              WHERE a.id = sa.id_auditoria
                                AND a.deleted_at IS NULL
                                AND c.deleted_at IS NULL
                                AND public.has_client_org_access(c.id_organizacion)
                          )
                      )
                )
            )
        )
    );
CREATE POLICY "procesos_sitio_auditoria_insert_worker" ON public.procesos_sitio_auditoria
    FOR INSERT TO authenticated WITH CHECK (public.is_approved_worker() AND deleted_at IS NULL);
CREATE POLICY "procesos_sitio_auditoria_update_worker" ON public.procesos_sitio_auditoria
    FOR UPDATE TO authenticated
    USING (public.is_approved_admin() OR (deleted_at IS NULL AND public.is_approved_worker()))
    WITH CHECK (public.is_approved_worker() AND (deleted_at IS NULL OR public.is_approved_admin() OR deleted_by = auth.uid()));

-- TURNOS_PROCESO_SITIO_AUDITORIA
CREATE POLICY "turnos_proceso_sitio_auditoria_select" ON public.turnos_proceso_sitio_auditoria FOR SELECT TO authenticated
    USING (
        public.is_approved_admin()
        OR (
            deleted_at IS NULL
            AND (
                public.is_approved_worker()
                OR EXISTS (
                    SELECT 1 FROM public.procesos_sitio_auditoria psa
                    JOIN public.sitios_por_auditoria sa ON sa.id = psa.id_sitios_por_auditoria
                    WHERE psa.id = turnos_proceso_sitio_auditoria.id_procesos_sitio_auditoria
                      AND psa.deleted_at IS NULL
                      AND sa.deleted_at IS NULL
                      AND (
                          public.is_assigned_auditor(sa.id_auditoria)
                          OR EXISTS (
                              SELECT 1 FROM public.auditoria a
                              JOIN public.certificado c ON a.id_certificado = c.id
                              WHERE a.id = sa.id_auditoria
                                AND a.deleted_at IS NULL
                                AND c.deleted_at IS NULL
                                AND public.has_client_org_access(c.id_organizacion)
                          )
                      )
                )
            )
        )
    );
CREATE POLICY "turnos_proceso_sitio_auditoria_insert_worker" ON public.turnos_proceso_sitio_auditoria
    FOR INSERT TO authenticated WITH CHECK (public.is_approved_worker() AND deleted_at IS NULL);
CREATE POLICY "turnos_proceso_sitio_auditoria_update_worker" ON public.turnos_proceso_sitio_auditoria
    FOR UPDATE TO authenticated
    USING (public.is_approved_admin() OR (deleted_at IS NULL AND public.is_approved_worker()))
    WITH CHECK (public.is_approved_worker() AND (deleted_at IS NULL OR public.is_approved_admin() OR deleted_by = auth.uid()));

-- EQUIPO_AUDITOR_SITIO
CREATE POLICY "equipo_auditor_sitio_select" ON public.equipo_auditor_sitio FOR SELECT TO authenticated
    USING (
        public.is_approved_admin()
        OR (
            deleted_at IS NULL
            AND (
                public.is_approved_worker()
                OR EXISTS (
                    SELECT 1 FROM public.sitios_por_auditoria sa
                    WHERE sa.id = equipo_auditor_sitio.id_sitios_por_auditoria
                      AND sa.deleted_at IS NULL
                      AND (
                          public.is_assigned_auditor(sa.id_auditoria)
                          OR EXISTS (
                              SELECT 1 FROM public.auditoria a
                              JOIN public.certificado c ON a.id_certificado = c.id
                              WHERE a.id = sa.id_auditoria
                                AND a.deleted_at IS NULL
                                AND c.deleted_at IS NULL
                                AND public.has_client_org_access(c.id_organizacion)
                          )
                      )
                )
            )
        )
    );
CREATE POLICY "equipo_auditor_sitio_insert_worker" ON public.equipo_auditor_sitio
    FOR INSERT TO authenticated WITH CHECK (public.is_approved_worker() AND deleted_at IS NULL);
CREATE POLICY "equipo_auditor_sitio_update_worker" ON public.equipo_auditor_sitio
    FOR UPDATE TO authenticated
    USING (public.is_approved_admin() OR (deleted_at IS NULL AND public.is_approved_worker()))
    WITH CHECK (public.is_approved_worker() AND (deleted_at IS NULL OR public.is_approved_admin() OR deleted_by = auth.uid()));

-- EQUIPO_AUDITOR_PROCESO_SITIO
CREATE POLICY "equipo_auditor_proceso_sitio_select" ON public.equipo_auditor_proceso_sitio FOR SELECT TO authenticated
    USING (
        public.is_approved_admin()
        OR (
            deleted_at IS NULL
            AND (
                public.is_approved_worker()
                OR EXISTS (
                    SELECT 1 FROM public.procesos_sitio_auditoria psa
                    JOIN public.sitios_por_auditoria sa ON sa.id = psa.id_sitios_por_auditoria
                    WHERE psa.id = equipo_auditor_proceso_sitio.id_procesos_sitio_auditoria
                      AND psa.deleted_at IS NULL
                      AND sa.deleted_at IS NULL
                      AND (
                          public.is_assigned_auditor(sa.id_auditoria)
                          OR EXISTS (
                              SELECT 1 FROM public.auditoria a
                              JOIN public.certificado c ON a.id_certificado = c.id
                              WHERE a.id = sa.id_auditoria
                                AND a.deleted_at IS NULL
                                AND c.deleted_at IS NULL
                                AND public.has_client_org_access(c.id_organizacion)
                          )
                      )
                )
            )
        )
    );
CREATE POLICY "equipo_auditor_proceso_sitio_insert_worker" ON public.equipo_auditor_proceso_sitio
    FOR INSERT TO authenticated WITH CHECK (public.is_approved_worker() AND deleted_at IS NULL);
CREATE POLICY "equipo_auditor_proceso_sitio_update_worker" ON public.equipo_auditor_proceso_sitio
    FOR UPDATE TO authenticated
    USING (public.is_approved_admin() OR (deleted_at IS NULL AND public.is_approved_worker()))
    WITH CHECK (public.is_approved_worker() AND (deleted_at IS NULL OR public.is_approved_admin() OR deleted_by = auth.uid()));

-- COMENTARIOS_POR_AUDITORIA (Auditor asignado puede insertar/editar comentarios activos, pero NO archivarlos)
CREATE POLICY "comentarios_auditoria_select" ON public.comentarios_por_auditoria FOR SELECT TO authenticated
    USING (
        public.is_approved_admin()
        OR (
            deleted_at IS NULL
            AND (
                public.is_approved_worker()
                OR public.is_assigned_auditor(id_auditoria)
                OR EXISTS (
                    SELECT 1 FROM public.auditoria a
                    JOIN public.certificado c ON a.id_certificado = c.id
                    WHERE a.id = comentarios_por_auditoria.id_auditoria
                      AND a.deleted_at IS NULL
                      AND c.deleted_at IS NULL
                      AND public.has_client_org_access(c.id_organizacion)
                )
            )
        )
    );
CREATE POLICY "comentarios_auditoria_insert_worker_or_auditor" ON public.comentarios_por_auditoria
    FOR INSERT TO authenticated
    WITH CHECK (
        deleted_at IS NULL
        AND (public.is_approved_worker() OR public.is_assigned_auditor(id_auditoria))
    );
CREATE POLICY "comentarios_auditoria_update_worker_or_auditor" ON public.comentarios_por_auditoria
    FOR UPDATE TO authenticated
    USING (
        public.is_approved_admin()
        OR (
            deleted_at IS NULL
            AND (public.is_approved_worker() OR public.is_assigned_auditor(id_auditoria))
        )
    )
    WITH CHECK (
        (
            deleted_at IS NULL
            AND (public.is_approved_worker() OR public.is_assigned_auditor(id_auditoria))
        )
        OR (
            deleted_at IS NOT NULL
            AND public.is_approved_worker()
            AND (public.is_approved_admin() OR deleted_by = auth.uid())
        )
    );

-- AUDITORIA_SITIO_TEMPORAL (Step 5.1: Designación -> Temporal)
CREATE POLICY "auditoria_sitio_temporal_select" ON public.auditoria_sitio_temporal FOR SELECT TO authenticated
    USING (
        public.is_approved_admin()
        OR (
            deleted_at IS NULL
            AND (
                public.is_approved_worker()
                OR public.is_assigned_auditor(id_auditoria)
                OR EXISTS (
                    SELECT 1 FROM public.auditoria a
                    JOIN public.certificado c ON c.id = a.id_certificado
                    WHERE a.id = auditoria_sitio_temporal.id_auditoria
                      AND a.deleted_at IS NULL
                      AND c.deleted_at IS NULL
                      AND public.has_client_org_access(c.id_organizacion)
                )
            )
        )
    );
CREATE POLICY "auditoria_sitio_temporal_insert_worker" ON public.auditoria_sitio_temporal
    FOR INSERT TO authenticated WITH CHECK (public.is_approved_worker() AND deleted_at IS NULL);
CREATE POLICY "auditoria_sitio_temporal_update_worker" ON public.auditoria_sitio_temporal
    FOR UPDATE TO authenticated
    USING (public.is_approved_admin() OR (deleted_at IS NULL AND public.is_approved_worker()))
    WITH CHECK (public.is_approved_worker() AND (deleted_at IS NULL OR public.is_approved_admin() OR deleted_by = auth.uid()));

-- AUDITORIA_SITIO_TEMPORAL_CERTIFICADO (Step 5.1: Atribución M:N a certificados de la misma campaña)
CREATE POLICY "auditoria_sitio_temporal_cert_select" ON public.auditoria_sitio_temporal_certificado FOR SELECT TO authenticated
    USING (
        public.is_approved_admin()
        OR (
            deleted_at IS NULL
            AND (
                public.is_approved_worker()
                OR public.is_assigned_auditor(id_auditoria_certificado)
                OR EXISTS (
                    SELECT 1 FROM public.auditoria a
                    JOIN public.certificado c ON c.id = a.id_certificado
                    WHERE a.id = auditoria_sitio_temporal_certificado.id_auditoria_certificado
                      AND a.deleted_at IS NULL
                      AND c.deleted_at IS NULL
                      AND public.has_client_org_access(c.id_organizacion)
                )
            )
        )
    );
CREATE POLICY "auditoria_sitio_temporal_cert_insert_worker" ON public.auditoria_sitio_temporal_certificado
    FOR INSERT TO authenticated WITH CHECK (public.is_approved_worker() AND deleted_at IS NULL);
CREATE POLICY "auditoria_sitio_temporal_cert_update_worker" ON public.auditoria_sitio_temporal_certificado
    FOR UPDATE TO authenticated
    USING (public.is_approved_admin() OR (deleted_at IS NULL AND public.is_approved_worker()))
    WITH CHECK (public.is_approved_worker() AND (deleted_at IS NULL OR public.is_approved_admin() OR deleted_by = auth.uid()));

-- EQUIPO_AUDITOR_SITIO_TEMPORAL (Step 7.1: Asignación -> Auditores en Sitio Temporal)
CREATE POLICY "equipo_auditor_sitio_temporal_select" ON public.equipo_auditor_sitio_temporal FOR SELECT TO authenticated
    USING (
        public.is_approved_admin()
        OR (
            deleted_at IS NULL
            AND (
                public.is_approved_worker()
                OR EXISTS (
                    SELECT 1 FROM public.auditoria_sitio_temporal st
                    WHERE st.id = equipo_auditor_sitio_temporal.id_sitio_temporal
                      AND st.deleted_at IS NULL
                      AND (
                          public.is_assigned_auditor(st.id_auditoria)
                          OR EXISTS (
                              SELECT 1 FROM public.auditoria_sitio_temporal_certificado stc
                              WHERE stc.id_sitio_temporal = st.id
                                AND stc.deleted_at IS NULL
                                AND public.is_assigned_auditor(stc.id_auditoria_certificado)
                          )
                          OR EXISTS (
                              SELECT 1 FROM public.auditoria a
                              JOIN public.certificado c ON c.id = a.id_certificado
                              WHERE a.id = st.id_auditoria
                                AND a.deleted_at IS NULL
                                AND c.deleted_at IS NULL
                                AND public.has_client_org_access(c.id_organizacion)
                          )
                          OR EXISTS (
                              SELECT 1 FROM public.auditoria_sitio_temporal_certificado stc
                              JOIN public.auditoria a ON a.id = stc.id_auditoria_certificado
                              JOIN public.certificado c ON c.id = a.id_certificado
                              WHERE stc.id_sitio_temporal = st.id
                                AND stc.deleted_at IS NULL
                                AND a.deleted_at IS NULL
                                AND c.deleted_at IS NULL
                                AND public.has_client_org_access(c.id_organizacion)
                          )
                      )
                )
            )
        )
    );
CREATE POLICY "equipo_auditor_sitio_temporal_insert_worker" ON public.equipo_auditor_sitio_temporal
    FOR INSERT TO authenticated WITH CHECK (public.is_approved_worker() AND deleted_at IS NULL);
CREATE POLICY "equipo_auditor_sitio_temporal_update_worker" ON public.equipo_auditor_sitio_temporal
    FOR UPDATE TO authenticated
    USING (public.is_approved_admin() OR (deleted_at IS NULL AND public.is_approved_worker()))
    WITH CHECK (public.is_approved_worker() AND (deleted_at IS NULL OR public.is_approved_admin() OR deleted_by = auth.uid()));

-- ============================================================================
-- 6. AUDIT_LOG (Lectura forense inmutable para ADMIN, WORKER y AUDITOR asignado)
-- ============================================================================
CREATE POLICY "audit_log_select_authorized" ON public.audit_log FOR SELECT TO authenticated
    USING (
        public.is_approved_worker()
        OR (table_name = 'auditoria' AND public.is_assigned_auditor(record_id))
        OR (
            table_name = 'hallazgo'
            AND EXISTS (
                SELECT 1 FROM public.hallazgo h
                WHERE h.id = audit_log.record_id
                  AND h.deleted_at IS NULL
                  AND public.is_assigned_auditor(h.id_auditoria)
            )
        )
    );