-- ============================================================================
-- FILE 2: 02_COBERTURA_NORMATIVA.SQL (Motor de Cálculo LTREE y Competencias)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.evaluar_cobertura_certificado_version(p_id_certificado_version UUID)
RETURNS TABLE (
    id_requisito UUID,
    codigo VARCHAR,
    ruta_materializada LTREE,
    estado_cobertura TEXT
)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
    RETURN QUERY
    WITH CertNorma AS (
        SELECT c.id_norma, cv.id AS id_certificado_version, c.id AS id_certificado
        FROM public.certificado_version cv
        INNER JOIN public.certificado c ON c.id = cv.id_certificado
        INNER JOIN public.norma n ON n.id = c.id_norma
        WHERE cv.id = p_id_certificado_version
          AND cv.deleted_at IS NULL
          AND c.deleted_at IS NULL
          AND n.deleted_at IS NULL
    ),
    ExclusionsDir AS (
        SELECT DISTINCT req.id, req.codigo, req.ruta_materializada
        FROM public.requisitos_no_aplicables_certificado rna
        INNER JOIN public.requisito req ON req.id = rna.id_requisito
        INNER JOIN CertNorma cn ON req.id_norma = cn.id_norma
        WHERE rna.id_certificado_version = cn.id_certificado_version
          AND rna.deleted_at IS NULL
          AND req.deleted_at IS NULL
    ),
    ProcessDir AS (
        SELECT DISTINCT req.id, req.codigo, req.ruta_materializada
        FROM public.requisitos_por_proceso rpp
        INNER JOIN public.proceso p ON p.id = rpp.id_proceso
        INNER JOIN public.requisito req ON req.id = rpp.id_requisito
        INNER JOIN CertNorma cn ON req.id_norma = cn.id_norma
        WHERE rpp.id_certificado_version = cn.id_certificado_version
          AND public.proceso_pertenece_a_certificado_version(p.id, cn.id_certificado_version)
          AND p.deleted_at IS NULL
          AND req.deleted_at IS NULL
    ),
    EffectiveReqState AS (
        SELECT
            r_all.id,
            r_all.codigo,
            r_all.ruta_materializada,
            r_all.es_obligatorio,
            EXISTS (
                SELECT 1
                FROM ExclusionsDir ed
                WHERE r_all.id = ed.id
                   OR (
                       r_all.ruta_materializada IS NOT NULL
                       AND ed.ruta_materializada IS NOT NULL
                       AND r_all.ruta_materializada <@ ed.ruta_materializada
                   )
            ) AS in_e_eff,
            EXISTS (
                SELECT 1
                FROM ProcessDir pd
                WHERE r_all.id = pd.id
                   OR (
                       r_all.ruta_materializada IS NOT NULL
                       AND pd.ruta_materializada IS NOT NULL
                       AND r_all.ruta_materializada <@ pd.ruta_materializada
                   )
            ) AS in_p_subtree
        FROM public.requisito r_all
        INNER JOIN CertNorma cn ON r_all.id_norma = cn.id_norma
        WHERE r_all.deleted_at IS NULL
    ),
    SubtreeStats AS (
        SELECT
            parent.id,
            parent.in_e_eff,
            (NOT parent.in_e_eff AND parent.in_p_subtree) AS in_c_eff,
            COUNT(child.id) FILTER (WHERE child.es_obligatorio = TRUE) AS total_mand_desc,
            COUNT(child.id) FILTER (WHERE child.es_obligatorio = TRUE AND child.in_e_eff) AS excl_mand_desc,
            COUNT(child.id) FILTER (WHERE child.es_obligatorio = TRUE AND NOT child.in_e_eff AND child.in_p_subtree) AS cov_mand_desc,
            COUNT(child.id) FILTER (WHERE child.es_obligatorio = TRUE AND NOT child.in_e_eff AND NOT child.in_p_subtree) AS pend_mand_desc
        FROM EffectiveReqState parent
        LEFT JOIN EffectiveReqState child
          ON parent.es_obligatorio = FALSE
         AND NOT parent.in_e_eff
         AND NOT parent.in_p_subtree
         AND child.id <> parent.id
         AND parent.ruta_materializada IS NOT NULL
         AND child.ruta_materializada IS NOT NULL
         AND child.ruta_materializada <@ parent.ruta_materializada
        GROUP BY parent.id, parent.in_e_eff, parent.in_p_subtree
    )
    SELECT
        req.id AS id_requisito,
        req.codigo,
        req.ruta_materializada,
        CASE
            WHEN ss.in_e_eff THEN 'NO_APLICABLE'
            WHEN ss.in_c_eff THEN 'CUBIERTO'
            WHEN req.es_obligatorio = FALSE THEN
                CASE
                    WHEN ss.total_mand_desc = 0 THEN 'INFORMATIVA'
                    WHEN ss.pend_mand_desc = 0 AND ss.cov_mand_desc > 0 AND ss.excl_mand_desc > 0 THEN 'MIXTO'
                    WHEN ss.pend_mand_desc = 0 AND ss.cov_mand_desc > 0 THEN 'CUBIERTO'
                    WHEN ss.pend_mand_desc = 0 AND ss.excl_mand_desc > 0 THEN 'NO_APLICABLE'
                    WHEN ss.cov_mand_desc > 0 OR ss.excl_mand_desc > 0 THEN 'PARCIAL'
                    ELSE 'PENDIENTE'
                END
            ELSE 'PENDIENTE'
        END AS estado_cobertura
    FROM public.requisito req
    INNER JOIN SubtreeStats ss ON ss.id = req.id
    WHERE req.deleted_at IS NULL
    ORDER BY req.ruta_materializada ASC NULLS LAST, req.codigo ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.resumen_cobertura_certificado_version(p_id_certificado_version UUID)
RETURNS TABLE (
    id_certificado_version UUID,
    id_certificado UUID,
    total_obligatorios INTEGER,
    cubiertos_por_proceso INTEGER,
    excluidos_no_aplicables INTEGER,
    pendientes INTEGER,
    porcentaje_cobertura NUMERIC(5,2),
    cobertura_completa BOOLEAN
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, pg_temp AS $$
    WITH CertVerScope AS (
        SELECT cv.id AS id_certificado_version, c.id AS id_certificado, c.id_norma
        FROM public.certificado_version cv
        INNER JOIN public.certificado c ON c.id = cv.id_certificado
        INNER JOIN public.norma n ON n.id = c.id_norma
        WHERE cv.id = p_id_certificado_version
          AND cv.deleted_at IS NULL
          AND c.deleted_at IS NULL
          AND n.deleted_at IS NULL
    ),
    MandatoryEval AS (
        SELECT
            cvs.id_certificado_version,
            ev.id_requisito,
            ev.estado_cobertura
        FROM CertVerScope cvs
        LEFT JOIN public.evaluar_cobertura_certificado_version(p_id_certificado_version) ev ON TRUE
        LEFT JOIN public.requisito r
          ON r.id = ev.id_requisito
         AND r.deleted_at IS NULL
         AND r.es_obligatorio = TRUE
        WHERE ev.id_requisito IS NULL OR r.id IS NOT NULL
    ),
    Agg AS (
        SELECT
            cvs.id_certificado_version,
            cvs.id_certificado,
            COUNT(me.id_requisito) FILTER (WHERE me.id_requisito IS NOT NULL)::INTEGER AS total_obligatorios,
            COUNT(me.id_requisito) FILTER (WHERE me.estado_cobertura = 'CUBIERTO')::INTEGER AS cubiertos_por_proceso,
            COUNT(me.id_requisito) FILTER (WHERE me.estado_cobertura = 'NO_APLICABLE')::INTEGER AS excluidos_no_aplicables,
            COUNT(me.id_requisito) FILTER (WHERE me.estado_cobertura = 'PENDIENTE')::INTEGER AS pendientes
        FROM CertVerScope cvs
        LEFT JOIN MandatoryEval me ON me.id_certificado_version = cvs.id_certificado_version
        GROUP BY cvs.id_certificado_version, cvs.id_certificado
    )
    SELECT
        a.id_certificado_version,
        a.id_certificado,
        a.total_obligatorios,
        a.cubiertos_por_proceso,
        a.excluidos_no_aplicables,
        a.pendientes,
        CASE
            WHEN a.total_obligatorios = 0 THEN 100.00::NUMERIC(5,2)
            ELSE ROUND(
                (((a.cubiertos_por_proceso + a.excluidos_no_aplicables)::NUMERIC / a.total_obligatorios::NUMERIC) * 100.0),
                2
            )::NUMERIC(5,2)
        END AS porcentaje_cobertura,
        (a.pendientes = 0) AS cobertura_completa
    FROM Agg a;
$$;

CREATE OR REPLACE FUNCTION public.evaluar_cobertura_certificado(p_id_certificado UUID)
RETURNS TABLE (
    id_requisito UUID,
    codigo VARCHAR,
    ruta_materializada LTREE,
    estado_cobertura TEXT
)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE
    v_version_id UUID;
BEGIN
    SELECT cv.id INTO v_version_id
    FROM public.certificado_version cv
    INNER JOIN public.certificado c ON c.id = cv.id_certificado
    WHERE cv.id_certificado = p_id_certificado
      AND cv.deleted_at IS NULL
      AND c.deleted_at IS NULL
    ORDER BY cv.es_version_actual DESC, cv.version_numero DESC
    LIMIT 1;

    IF v_version_id IS NULL THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT ev.id_requisito, ev.codigo, ev.ruta_materializada, ev.estado_cobertura
    FROM public.evaluar_cobertura_certificado_version(v_version_id) ev;
END;
$$;

CREATE OR REPLACE FUNCTION public.cobertura_normativa_certificado(p_id_certificado UUID)
RETURNS TABLE (
    id_requisito UUID,
    codigo VARCHAR,
    estado_cobertura TEXT
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, pg_temp AS $$
    SELECT id_requisito, codigo, estado_cobertura
    FROM public.evaluar_cobertura_certificado(p_id_certificado);
$$;

CREATE OR REPLACE FUNCTION public.resumen_cobertura_certificado(p_id_certificado UUID)
RETURNS TABLE (
    id_certificado UUID,
    total_obligatorios INTEGER,
    cubiertos_por_proceso INTEGER,
    excluidos_no_aplicables INTEGER,
    pendientes INTEGER,
    porcentaje_cobertura NUMERIC(5,2),
    cobertura_completa BOOLEAN
)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE
    v_version_id UUID;
BEGIN
    SELECT cv.id INTO v_version_id
    FROM public.certificado_version cv
    INNER JOIN public.certificado c ON c.id = cv.id_certificado
    WHERE cv.id_certificado = p_id_certificado
      AND cv.deleted_at IS NULL
      AND c.deleted_at IS NULL
    ORDER BY cv.es_version_actual DESC, cv.version_numero DESC
    LIMIT 1;

    IF v_version_id IS NULL THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT
        r.id_certificado,
        r.total_obligatorios,
        r.cubiertos_por_proceso,
        r.excluidos_no_aplicables,
        r.pendientes,
        r.porcentaje_cobertura,
        r.cobertura_completa
    FROM public.resumen_cobertura_certificado_version(v_version_id) r;
END;
$$;

-- ============================================================================
-- Validación de Competencias Técnicas de Auditores (ISO/IEC 17021-1)
-- Verifica competencias activas por auditor, norma ISO, sector IAF y sub-sector IAF
-- ============================================================================
CREATE OR REPLACE FUNCTION public.auditor_esta_calificado(
    p_id_auditor UUID,
    p_id_norma UUID,
    p_id_sector_iaf UUID,
    p_id_subsector_iaf UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.auditor a
        INNER JOIN public.norma_auditor na
            ON na.id_auditor = a.id
        INNER JOIN public.norma n
            ON n.id = na.id_norma
        INNER JOIN public.sector_iaf_auditor sa
            ON sa.id_auditor = a.id
        INNER JOIN public.sector_iaf s
            ON s.id = sa.id_sector_iaf
        LEFT JOIN public.subsector_iaf_auditor ssa
            ON ssa.id_auditor = a.id AND ssa.id_subsector_iaf = p_id_subsector_iaf
        LEFT JOIN public.subsector_iaf ss
            ON ss.id = ssa.id_subsector_iaf AND ss.deleted_at IS NULL
        WHERE a.id = p_id_auditor
          AND a.deleted_at IS NULL
          AND na.id_norma = p_id_norma
          AND n.deleted_at IS NULL
          AND sa.id_sector_iaf = p_id_sector_iaf
          AND s.deleted_at IS NULL
          AND (p_id_subsector_iaf IS NULL OR (ssa.id_subsector_iaf IS NOT NULL AND ss.id IS NOT NULL))
    );
$$;

CREATE OR REPLACE FUNCTION public.auditores_calificados_para_certificado(p_id_certificado UUID)
RETURNS TABLE (
    id_auditor UUID,
    nombre VARCHAR
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT a.id AS id_auditor, a.nombre
    FROM public.certificado c
    INNER JOIN public.norma n ON n.id = c.id_norma
    INNER JOIN public.sector_iaf s ON s.id = c.id_sector_iaf
    INNER JOIN public.norma_auditor na ON na.id_norma = c.id_norma
    INNER JOIN public.sector_iaf_auditor sa ON sa.id_sector_iaf = c.id_sector_iaf AND sa.id_auditor = na.id_auditor
    INNER JOIN public.auditor a ON a.id = na.id_auditor
    WHERE c.id = p_id_certificado
      AND c.deleted_at IS NULL
      AND n.deleted_at IS NULL
      AND s.deleted_at IS NULL
      AND a.deleted_at IS NULL
    ORDER BY a.nombre ASC;
$$;