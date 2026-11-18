-- ============================================================================
-- FILE 6: 06_DATOS_PRUEBA.SQL (Semillero Idempotente y Solicitudes Aprobadas)
-- ============================================================================

-- 1. Estatus Operativos Estandarizados (8 Valores Canónicos Title-Case)
INSERT INTO public.estatus (id, estatus) VALUES
    ('a0000000-0000-0000-0000-000000000001', 'Activo'),
    ('a0000000-0000-0000-0000-000000000002', 'Estudio'),
    ('a0000000-0000-0000-0000-000000000003', 'Suspendido'),
    ('a0000000-0000-0000-0000-000000000004', 'Cancelado'),
    ('a0000000-0000-0000-0000-000000000005', 'Planificado'),
    ('a0000000-0000-0000-0000-000000000006', 'En Ejecución'),
    ('a0000000-0000-0000-0000-000000000007', 'En Espera'),
    ('a0000000-0000-0000-0000-000000000008', 'Inactivo')
ON CONFLICT (estatus) WHERE deleted_at IS NULL DO UPDATE SET updated_at = NOW();

-- 2. Modalidades de Auditoría Estandarizadas (9 Modalidades Canónicas Title-Case)
INSERT INTO public.tipo_auditoria (id, tipo) VALUES
    ('b0000000-0000-0000-0000-000000000001', 'Etapa 1'),
    ('b0000000-0000-0000-0000-000000000002', 'Etapa 2'),
    ('b0000000-0000-0000-0000-000000000003', 'Seguimiento 1'),
    ('b0000000-0000-0000-0000-000000000004', 'Seguimiento 2'),
    ('b0000000-0000-0000-0000-000000000005', 'Renovación'),
    ('b0000000-0000-0000-0000-000000000006', 'Diagnóstico'),
    ('b0000000-0000-0000-0000-000000000007', 'Extraordinaria'),
    ('b0000000-0000-0000-0000-000000000008', 'Especial'),
    ('b0000000-0000-0000-0000-000000000009', 'Otro')
ON CONFLICT (tipo) WHERE deleted_at IS NULL DO UPDATE SET updated_at = NOW();

-- 3. Metodologías de Auditoría Estandarizadas (3 Métodos Canónicos Title-Case)
INSERT INTO public.metodologia_auditoria (id, metodologia) VALUES
    ('c0000000-0000-0000-0000-000000000001', 'Presencial'),
    ('c0000000-0000-0000-0000-000000000002', 'Remota'),
    ('c0000000-0000-0000-0000-000000000003', 'Mixta')
ON CONFLICT (metodologia) WHERE deleted_at IS NULL DO UPDATE SET updated_at = NOW();

-- 4. Sectores IAF Principales (con Descripción Obligatoria)
INSERT INTO public.sector_iaf (id, sector, descripcion) VALUES
    ('d0000000-0000-0000-0000-000000000014', 14, 'Productos de caucho y plástico'),
    ('d0000000-0000-0000-0000-000000000017', 17, 'Metales básicos y productos metálicos elaborados'),
    ('d0000000-0000-0000-0000-000000000028', 28, 'Construcción e ingeniería civil'),
    ('d0000000-0000-0000-0000-000000000033', 33, 'Tecnologías de la información'),
    ('d0000000-0000-0000-0000-000000000035', 35, 'Otros servicios profesionales y empresariales')
ON CONFLICT (sector) WHERE deleted_at IS NULL DO UPDATE SET
    descripcion = EXCLUDED.descripcion,
    updated_at = NOW();

-- 5. Sub-Sectores IAF Jerárquicos con Categoría de Riesgo (Fase 1)
INSERT INTO public.subsector_iaf (id, id_sector_iaf, codigo, descripcion, categoria_riesgo) VALUES
    ('da000000-0000-0000-0000-000000000171', 'd0000000-0000-0000-0000-000000000017', '17.1', 'Fabricación de metales básicos, fundición y siderurgia', 'ALTO'),
    ('da000000-0000-0000-0000-000000000172', 'd0000000-0000-0000-0000-000000000017', '17.2', 'Fabricación de productos metálicos elaborados, troquelado y conformado', 'MEDIO'),
    ('da000000-0000-0000-0000-000000000281', 'd0000000-0000-0000-0000-000000000028', '28.1', 'Construcción de edificios y obras de ingeniería civil', 'MEDIO'),
    ('da000000-0000-0000-0000-000000000331', 'd0000000-0000-0000-0000-000000000033', '33.1', 'Servicios de tecnologías de información y desarrollo de software', 'BAJO')
ON CONFLICT (codigo) WHERE deleted_at IS NULL DO UPDATE SET
    descripcion = EXCLUDED.descripcion,
    categoria_riesgo = EXCLUDED.categoria_riesgo,
    updated_at = NOW();

-- 6. Organismos de Acreditación (Fase 1)
INSERT INTO public.organismo_acreditacion (id, codigo, nombre, pais, sitio_web) VALUES
    ('db000000-0000-0000-0000-000000000001', 'ENAC', 'Entidad Nacional de Acreditación', 'España', 'https://www.enac.es'),
    ('db000000-0000-0000-0000-000000000002', 'UKAS', 'United Kingdom Accreditation Service', 'Reino Unido', 'https://www.ukas.com'),
    ('db000000-0000-0000-0000-000000000003', 'ANAB', 'ANSI National Accreditation Board', 'Estados Unidos', 'https://anab.ansi.org')
ON CONFLICT (codigo) WHERE deleted_at IS NULL DO UPDATE SET
    nombre = EXCLUDED.nombre,
    pais = EXCLUDED.pais,
    sitio_web = EXCLUDED.sitio_web,
    updated_at = NOW();

-- 7. Normas Certificables Expandidas (Código, Título, Estatus, Fecha)
INSERT INTO public.norma (id, esquema, codigo, titulo, estatus, fecha_publicacion, norma) VALUES
    ('e0000000-0000-0000-0000-000000009001', 'SGC - Calidad', 'ISO 9001:2015', 'Sistemas de Gestión de la Calidad — Requisitos', 'Vigente', '2015-09-15', 'ISO 9001:2015'),
    ('e0000000-0000-0000-0000-000000014001', 'SGA - Gestión Ambiental', 'ISO 14001:2015', 'Sistemas de Gestión Ambiental — Requisitos con orientación para su uso', 'Vigente', '2015-09-15', 'ISO 14001:2015'),
    ('e0000000-0000-0000-0000-000000045001', 'SST - Seguridad y Salud Laboral', 'ISO 45001:2018', 'Sistemas de Gestión de la Seguridad y Salud en el Trabajo — Requisitos', 'Vigente', '2018-03-12', 'ISO 45001:2018'),
    ('e0000000-0000-0000-0000-000000027001', 'SGSI - Seguridad de la Información', 'ISO/IEC 27001:2022', 'Seguridad de la información, ciberseguridad y protección de la privacidad — Sistemas de gestión', 'Vigente', '2022-10-25', 'ISO/IEC 27001:2022')
ON CONFLICT (codigo) WHERE deleted_at IS NULL DO UPDATE SET
    esquema = EXCLUDED.esquema,
    titulo = EXCLUDED.titulo,
    estatus = EXCLUDED.estatus,
    fecha_publicacion = EXCLUDED.fecha_publicacion,
    norma = EXCLUDED.norma,
    updated_at = NOW();

-- 8. Acreditaciones Otorgadas a Normas y Alcance Multi-Sector IAF
INSERT INTO public.acreditacion_norma (id, id_organismo, id_norma, id_estatus, numero_acreditacion, fecha_concesion, fecha_vencimiento) VALUES
    ('dc000000-0000-0000-0000-000000000001', 'db000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000009001', 'a0000000-0000-0000-0000-000000000001', '01/C-SC001', '2020-01-15', '2028-01-14'),
    ('dc000000-0000-0000-0000-000000000002', 'db000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000014001', 'a0000000-0000-0000-0000-000000000001', '0044-EMS', '2021-06-01', '2027-05-31'),
    ('dc000000-0000-0000-0000-000000000003', 'db000000-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-000000027001', 'a0000000-0000-0000-0000-000000000001', 'ANAB-ISMS-089', '2023-02-10', '2029-02-09')
ON CONFLICT (id) DO UPDATE SET
    id_estatus = EXCLUDED.id_estatus,
    updated_at = NOW();

INSERT INTO public.acreditacion_norma_sector_iaf (id, id_acreditacion_norma, id_sector_iaf) VALUES
    ('dd000000-0000-0000-0000-000000000001', 'dc000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000017'),
    ('dd000000-0000-0000-0000-000000000002', 'dc000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000017'),
    ('dd000000-0000-0000-0000-000000000003', 'dc000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000033')
ON CONFLICT (id_acreditacion_norma, id_sector_iaf) WHERE deleted_at IS NULL DO NOTHING;

-- 9. Requisitos Clave Jerárquicos con LTREE (sincronizados con external_key de 07_normas_requisitos_csv.sql)
INSERT INTO public.requisito (id, id_norma, id_requisito_padre, codigo, ruta_materializada, explicit_code, external_key) VALUES
    ('f0000000-0000-0000-0000-000000000004', 'e0000000-0000-0000-0000-000000009001', NULL, '4', '4'::ltree, FALSE, 'clause_iso_9001_2015_0006'),
    ('f0000000-0000-0000-0000-000000000041', 'e0000000-0000-0000-0000-000000009001', 'f0000000-0000-0000-0000-000000000004', '4.1', '4.4_1'::ltree, FALSE, 'clause_iso_9001_2015_0007'),
    ('f0000000-0000-0000-0000-000000000042', 'e0000000-0000-0000-0000-000000009001', 'f0000000-0000-0000-0000-000000000004', '4.2', '4.4_2'::ltree, FALSE, 'clause_iso_9001_2015_0008'),
    ('f0000000-0000-0000-0000-000000000005', 'e0000000-0000-0000-0000-000000009001', NULL, '5', '5'::ltree, FALSE, 'clause_iso_9001_2015_0028'),
    ('f0000000-0000-0000-0000-000000000051', 'e0000000-0000-0000-0000-000000009001', 'f0000000-0000-0000-0000-000000000005', '5.1', '5.5_1'::ltree, FALSE, 'clause_iso_9001_2015_0029'),
    ('f0000000-0000-0000-0000-000000000008', 'e0000000-0000-0000-0000-000000009001', NULL, '8', '8'::ltree, FALSE, 'clause_iso_9001_2015_0152'),
    ('f0000000-0000-0000-0000-000000000085', 'e0000000-0000-0000-0000-000000009001', 'f0000000-0000-0000-0000-000000000008', '8.5', '8.8_5'::ltree, FALSE, 'clause_iso_9001_2015_0244')
ON CONFLICT (id_norma, codigo) WHERE deleted_at IS NULL DO UPDATE SET
    external_key = EXCLUDED.external_key,
    explicit_code = EXCLUDED.explicit_code,
    updated_at = NOW();

-- 10. Auditores y Matriz de Competencias Normativas y de Sub-Sectores
INSERT INTO public.auditor (id, nombre) VALUES
    ('33333333-3333-3333-3333-333333333333', 'Auditor Técnico Evaluador'),
    ('10000000-0000-0000-0000-000000000001', 'Ing. Carlos Mendoza (Auditor Líder)')
ON CONFLICT (id) DO UPDATE SET
    nombre = EXCLUDED.nombre,
    updated_at = NOW();

INSERT INTO public.norma_auditor (id_auditor, id_norma) VALUES
    ('33333333-3333-3333-3333-333333333333', 'e0000000-0000-0000-0000-000000009001'),
    ('33333333-3333-3333-3333-333333333333', 'e0000000-0000-0000-0000-000000014001'),
    ('33333333-3333-3333-3333-333333333333', 'e0000000-0000-0000-0000-000000027001'),
    ('10000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000009001'),
    ('10000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000014001'),
    ('10000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000045001')
ON CONFLICT (id_auditor, id_norma) DO NOTHING;

INSERT INTO public.sector_iaf_auditor (id_auditor, id_sector_iaf) VALUES
    ('33333333-3333-3333-3333-333333333333', 'd0000000-0000-0000-0000-000000000017'),
    ('33333333-3333-3333-3333-333333333333', 'd0000000-0000-0000-0000-000000000033'),
    ('10000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000017'),
    ('10000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000028')
ON CONFLICT (id_auditor, id_sector_iaf) DO NOTHING;

INSERT INTO public.subsector_iaf_auditor (id_auditor, id_subsector_iaf) VALUES
    ('10000000-0000-0000-0000-000000000001', 'da000000-0000-0000-0000-000000000171'),
    ('10000000-0000-0000-0000-000000000001', 'da000000-0000-0000-0000-000000000172'),
    ('33333333-3333-3333-3333-333333333333', 'da000000-0000-0000-0000-000000000171'),
    ('33333333-3333-3333-3333-333333333333', 'da000000-0000-0000-0000-000000000172'),
    ('33333333-3333-3333-3333-333333333333', 'da000000-0000-0000-0000-000000000331')
ON CONFLICT (id_auditor, id_subsector_iaf) DO NOTHING;

-- 11. Organizaciones Clientes
INSERT INTO public.organizacion (id, nombre, rif, direccion_fiscal) VALUES
    ('30000000-0000-0000-0000-000000000001', 'Iberometal Componentes S.A.', 'J-30492817-0', 'Zona Industrial Carabobo, Valencia, Edo. Carabobo'),
    ('30000000-0000-0000-0000-000000000002', 'CyberCloud Solutions S.L.', 'J-40819234-5', 'Torre David, Piso 14, Chacao, Caracas'),
    ('30000000-0000-0000-0000-000000000003', 'Example, C.A.', 'J-50112233-4', 'Zona Industrial Santa Cruz, Parcela 12, Edo. Aragua')
ON CONFLICT (id) DO UPDATE SET
    nombre = EXCLUDED.nombre,
    rif = EXCLUDED.rif,
    direccion_fiscal = EXCLUDED.direccion_fiscal,
    updated_at = NOW();

-- 12. Solicitud de Acceso Aprobada para Usuario Cliente (solo Iberometal -> aislamiento Nivel 2 frente a CyberCloud)
INSERT INTO public.client_organization_access (id, id_usuario, id_organizacion, estado, aprobado_por, fecha_respuesta) VALUES
    (
        'c1000000-0000-0000-0000-000000000001',
        '44444444-4444-4444-4444-444444444444', -- Client user
        '30000000-0000-0000-0000-000000000001', -- Iberometal (Org A)
        'APPROVED',
        '22222222-2222-2222-2222-222222222222', -- Approved by Worker
        NOW()
    )
ON CONFLICT (id_usuario, id_organizacion) DO UPDATE SET estado = 'APPROVED', fecha_respuesta = NOW();

-- 13. Certificados (incluye >= 2 certificados Activo/Estudio SIN auditoría programada)
INSERT INTO public.certificado (id, id_norma, id_estatus, id_sector_iaf, id_subsector_iaf, id_organizacion, numero_certificado, alcance, multisitio) VALUES
    (
        '40000000-0000-0000-0000-000000000001',
        'e0000000-0000-0000-0000-000000009001',
        'a0000000-0000-0000-0000-000000000001', -- Activo
        'd0000000-0000-0000-0000-000000000017', -- Sector 17
        'da000000-0000-0000-0000-000000000171', -- Sub-Sector 17.1 (ALTO)
        '30000000-0000-0000-0000-000000000001', -- Iberometal (Org A)
        'FN-QMS-2024-001',
        'Diseño, manufactura, estampado, fundición y comercialización de piezas metálicas y componentes troquelados para la industria automotriz y de línea blanca nacional.',
        TRUE
    ),
    (
        '40000000-0000-0000-0000-000000000002',
        'e0000000-0000-0000-0000-000000014001',
        'a0000000-0000-0000-0000-000000000001', -- Activo (SIN AUDITORÍA PROGRAMADA #1)
        'd0000000-0000-0000-0000-000000000017', -- Sector 17
        'da000000-0000-0000-0000-000000000172', -- Sub-Sector 17.2
        '30000000-0000-0000-0000-000000000001', -- Iberometal (Org A)
        'FN-EMS-2025-002',
        'Gestión ambiental de procesos de estampado, fundición controlada y tratamiento superficial en planta industrial.',
        FALSE
    ),
    (
        '40000000-0000-0000-0000-000000000003',
        'e0000000-0000-0000-0000-000000027001',
        'a0000000-0000-0000-0000-000000000001', -- Activo (Org B en Nivel 2)
        'd0000000-0000-0000-0000-000000000033', -- Sector 33
        'da000000-0000-0000-0000-000000000331', -- Sub-Sector 33.1
        '30000000-0000-0000-0000-000000000002', -- CyberCloud (Org B)
        'FN-ISMS-2025-003',
        'Operación de centros de datos cloud, desarrollo de software seguro y servicios administrados de ciberseguridad.',
        FALSE
    ),
    (
        '40000000-0000-0000-0000-000000000004',
        'e0000000-0000-0000-0000-000000009001',
        'a0000000-0000-0000-0000-000000000001', -- Activo (Example, C.A. SGC)
        'd0000000-0000-0000-0000-000000000017',
        'da000000-0000-0000-0000-000000000172',
        '30000000-0000-0000-0000-000000000003', -- Example, C.A.
        'FN-QMS-2025-004',
        'Manufactura de estructuras metálicas y ensambles industriales bajo Sistema de Gestión de Calidad.',
        FALSE
    ),
    (
        '40000000-0000-0000-0000-000000000005',
        'e0000000-0000-0000-0000-000000014001',
        'a0000000-0000-0000-0000-000000000001', -- Activo (Example, C.A. SGA)
        'd0000000-0000-0000-0000-000000000017',
        'da000000-0000-0000-0000-000000000172',
        '30000000-0000-0000-0000-000000000003', -- Example, C.A.
        'FN-EMS-2025-005',
        'Gestión ambiental en Planta Santa Cruz para fabricación y acabado metálico.',
        FALSE
    ),
    (
        '40000000-0000-0000-0000-000000000006',
        'e0000000-0000-0000-0000-000000045001',
        'a0000000-0000-0000-0000-000000000001', -- Activo (Example, C.A. SST - Parcial)
        'd0000000-0000-0000-0000-000000000017',
        'da000000-0000-0000-0000-000000000172',
        '30000000-0000-0000-0000-000000000003', -- Example, C.A.
        'FN-SST-2026-006',
        'Gestión de seguridad y salud en el trabajo en operaciones metalmecánicas.',
        FALSE
    ),
    (
        '40000000-0000-0000-0000-000000000007',
        'e0000000-0000-0000-0000-000000027001',
        'a0000000-0000-0000-0000-000000000002', -- Estudio (SIN AUDITORÍA PROGRAMADA #2)
        'd0000000-0000-0000-0000-000000000033',
        'da000000-0000-0000-0000-000000000331',
        '30000000-0000-0000-0000-000000000002', -- CyberCloud
        'FN-ISMS-2026-007',
        'Ampliación de alcance en servicios de analítica segura de datos en la nube.',
        FALSE
    ),
    (
        '40000000-0000-0000-0000-000000000008',
        'e0000000-0000-0000-0000-000000009001',
        'a0000000-0000-0000-0000-000000000002', -- Estudio (SIN AUDITORÍA PROGRAMADA #3)
        'd0000000-0000-0000-0000-000000000017',
        'da000000-0000-0000-0000-000000000172',
        '30000000-0000-0000-0000-000000000001', -- Iberometal (Org A)
        'FN-QMS-2026-008',
        'Línea experimental de mecanizado CNC en evaluación inicial de certificación.',
        FALSE
    )
ON CONFLICT (numero_certificado) WHERE deleted_at IS NULL DO UPDATE SET
    id_estatus = EXCLUDED.id_estatus,
    id_subsector_iaf = EXCLUDED.id_subsector_iaf,
    alcance = EXCLUDED.alcance,
    multisitio = EXCLUDED.multisitio,
    updated_at = NOW();

-- 14. Sitios Físicos con Convención Sitio 0 (Sede Principal)
INSERT INTO public.sitio (id, id_certificado, numero_sitio, nombre_sitio, direccion_sitio) VALUES
    ('50000000-0000-0000-0000-000000000000', '40000000-0000-0000-0000-000000000001', 0, 'Sede Principal HQ', 'Av. Industrial 100, Valencia, Edo. Carabobo'),
    ('50000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 1, 'Planta Valencia', 'Zona Industrial Carabobo, Galpón 4-B, Valencia'),
    ('50000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000002', 0, 'Planta Ambiental Valencia', 'Zona Industrial Carabobo, Sector Sur, Valencia'),
    ('50000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000003', 0, 'Centro de Datos Chacao', 'Torre David, Piso 14, Chacao, Caracas'),
    ('50000000-0000-0000-0000-000000000004', '40000000-0000-0000-0000-000000000004', 0, 'Planta Santa Cruz', 'Zona Industrial Santa Cruz, Parcela 12, Aragua'),
    ('50000000-0000-0000-0000-000000000005', '40000000-0000-0000-0000-000000000005', 0, 'Planta Santa Cruz SGA', 'Zona Industrial Santa Cruz, Parcela 12, Aragua'),
    ('50000000-0000-0000-0000-000000000006', '40000000-0000-0000-0000-000000000006', 0, 'Planta Santa Cruz SST', 'Zona Industrial Santa Cruz, Parcela 12, Aragua')
ON CONFLICT (id_certificado, numero_sitio) WHERE deleted_at IS NULL DO UPDATE SET
    nombre_sitio = EXCLUDED.nombre_sitio,
    direccion_sitio = EXCLUDED.direccion_sitio,
    updated_at = NOW();

-- 15. Turnos y Asignación por Sitio (activos en Sitio 0 y Sitio 1 + sedes adicionales)
INSERT INTO public.turno (id, hora_entrada, hora_salida) VALUES
    ('70000000-0000-0000-0000-000000000001', '07:00:00', '15:00:00'),
    ('70000000-0000-0000-0000-000000000002', '15:00:00', '23:00:00')
ON CONFLICT (hora_entrada, hora_salida) WHERE deleted_at IS NULL DO NOTHING;

INSERT INTO public.turnos_por_sitio (id, id_sitio, id_turno) VALUES
    ('71000000-0000-0000-0000-000000000000', '50000000-0000-0000-0000-000000000000', '70000000-0000-0000-0000-000000000001'),
    ('71000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001'),
    ('71000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000002'),
    ('71000000-0000-0000-0000-000000000003', '50000000-0000-0000-0000-000000000003', '70000000-0000-0000-0000-000000000001'),
    ('71000000-0000-0000-0000-000000000004', '50000000-0000-0000-0000-000000000004', '70000000-0000-0000-0000-000000000001'),
    ('71000000-0000-0000-0000-000000000005', '50000000-0000-0000-0000-000000000004', '70000000-0000-0000-0000-000000000002'),
    ('71000000-0000-0000-0000-000000000006', '50000000-0000-0000-0000-000000000005', '70000000-0000-0000-0000-000000000001'),
    ('71000000-0000-0000-0000-000000000007', '50000000-0000-0000-0000-000000000006', '70000000-0000-0000-0000-000000000001')
ON CONFLICT (id_sitio, id_turno) WHERE deleted_at IS NULL DO NOTHING;

-- 16. Procesos Operativos con Categorización 'tipo' (Fase 1)
INSERT INTO public.proceso (id, id_certificado, nombre_proceso, tipo) VALUES
    ('60000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'Troquelado y Fundición', 'Medular'),
    ('60000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001', 'Dirección Estratégica y Calidad', 'Estratégico'),
    ('60000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000001', 'Mantenimiento y Logística', 'De Apoyo'),
    ('60000000-0000-0000-0000-000000000004', '40000000-0000-0000-0000-000000000002', 'Control de Efluentes y Emisiones', 'Medular'),
    ('60000000-0000-0000-0000-000000000005', '40000000-0000-0000-0000-000000000003', 'Gestión de Incidentes y SOC', 'Medular'),
    ('60000000-0000-0000-0000-000000000006', '40000000-0000-0000-0000-000000000004', 'Fabricación de Estructuras', 'Medular'),
    ('60000000-0000-0000-0000-000000000007', '40000000-0000-0000-0000-000000000004', 'Revisión por la Dirección Integrada', 'Estratégico'),
    ('60000000-0000-0000-0000-000000000008', '40000000-0000-0000-0000-000000000005', 'Manejo de Residuos Industriales', 'Medular'),
    ('60000000-0000-0000-0000-000000000009', '40000000-0000-0000-0000-000000000006', 'Control de Riesgos Mecánicos', 'Medular'),
    ('60000000-0000-0000-0000-000000000010', '40000000-0000-0000-0000-000000000006', 'Vigilancia Ocupacional y Brigadas', 'De Apoyo')
ON CONFLICT (id_certificado, nombre_proceso) WHERE deleted_at IS NULL DO UPDATE SET
    tipo = EXCLUDED.tipo,
    updated_at = NOW();

-- 16b. Procesos por Sitio (Step 1.1.2 / 1.2.2)
INSERT INTO public.procesos_por_sitio (id, id_sitio, id_proceso) VALUES
    ('61000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000000', '60000000-0000-0000-0000-000000000002'), -- Sitio 0 HQ: Dirección Estratégica
    ('61000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001'), -- Sitio 1 Valencia: Troquelado
    ('61000000-0000-0000-0000-000000000003', '50000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000003'), -- Sitio 1 Valencia: Mantenimiento
    ('61000000-0000-0000-0000-000000000004', '50000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000004'), -- Iberometal 2do cert: Efluentes
    ('61000000-0000-0000-0000-000000000005', '50000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-000000000005'), -- CyberCloud (2da org): SOC
    ('61000000-0000-0000-0000-000000000006', '50000000-0000-0000-0000-000000000004', '60000000-0000-0000-0000-000000000006'), -- Example QMS: Fabricación
    ('61000000-0000-0000-0000-000000000007', '50000000-0000-0000-0000-000000000004', '60000000-0000-0000-0000-000000000007'), -- Example QMS: Revisión Dirección
    ('61000000-0000-0000-0000-000000000008', '50000000-0000-0000-0000-000000000005', '60000000-0000-0000-0000-000000000008'), -- Example EMS: Residuos
    ('61000000-0000-0000-0000-000000000009', '50000000-0000-0000-0000-000000000006', '60000000-0000-0000-0000-000000000009'), -- Example SST: Riesgos Mecánicos
    ('61000000-0000-0000-0000-000000000010', '50000000-0000-0000-0000-000000000006', '60000000-0000-0000-0000-000000000010')  -- Example SST: Vigilancia Ocupacional
ON CONFLICT (id_sitio, id_proceso) WHERE deleted_at IS NULL DO UPDATE SET updated_at = NOW();

-- 17. Mapeo de Requisitos por Proceso
INSERT INTO public.requisitos_por_proceso (id_proceso, id_requisito) VALUES
    ('60000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000041'),
    ('60000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000085')
ON CONFLICT (id_proceso, id_requisito) DO NOTHING;

-- 18. Requisitos No Aplicables con Justificación Obligatoria (Fase 1)
INSERT INTO public.requisitos_no_aplicables_certificado (id, id_certificado, id_requisito, justificacion) VALUES
    (
        'ea000000-0000-0000-0000-000000000001',
        '40000000-0000-0000-0000-000000000001',
        'f0000000-0000-0000-0000-000000000051',
        'La organización no realiza diseño ni desarrollo de nuevos productos; la fabricación y estampado se ejecutan estrictamente bajo planos de ingeniería y especificaciones provistas por los clientes (exclusión justificada según ISO 9001 cláusula 4.3).'
    )
ON CONFLICT (id_certificado, id_requisito) WHERE deleted_at IS NULL DO UPDATE SET
    justificacion = EXCLUDED.justificacion,
    updated_at = NOW();

-- 18b. Configuración Inicial de Alertas de Calendario (Step 1.2.2)
INSERT INTO public.configuracion_alerta_auditoria (
    id,
    clave,
    dias_aviso_proxima,
    dias_aviso_preprogramada_sin_confirmar,
    alertar_atrasadas,
    alertar_conflicto_auditor,
    alertar_desfase_dias_o_span,
    ciclos_rotacion_auditor_lider,
    alertas_activas,
    updated_by
) VALUES (
    'ca000000-0000-0000-0000-000000000001',
    'DEFAULT',
    15,
    30,
    TRUE,
    TRUE,
    TRUE,
    3,
    TRUE,
    '11111111-1111-1111-1111-111111111111'
)
ON CONFLICT (clave) WHERE deleted_at IS NULL DO UPDATE SET
    dias_aviso_proxima = EXCLUDED.dias_aviso_proxima,
    dias_aviso_preprogramada_sin_confirmar = EXCLUDED.dias_aviso_preprogramada_sin_confirmar,
    alertar_atrasadas = EXCLUDED.alertar_atrasadas,
    alertar_conflicto_auditor = EXCLUDED.alertar_conflicto_auditor,
    alertar_desfase_dias_o_span = EXCLUDED.alertar_desfase_dias_o_span,
    ciclos_rotacion_auditor_lider = EXCLUDED.ciclos_rotacion_auditor_lider,
    alertas_activas = EXCLUDED.alertas_activas,
    updated_at = NOW();

-- 19. Programas de Auditoría (4 Escenarios Reales: Individual Histórico, Nivel 1 Evolucionado, Nivel 2 Inter-Org y Parcial)
INSERT INTO public.programa_auditoria (id, codigo_programa, etiqueta, nivel_vinculacion, tipo_vinculacion, es_vinculada, id_ciclo_origen, notas) VALUES
    (
        '7a000000-0000-0000-0000-000000000001',
        'PROG-2024-001',
        'Auditoría Etapa 2 Iberometal SGC',
        'INDIVIDUAL',
        'Individual',
        FALSE,
        NULL,
        'Escenario A: Auditoría individual histórica completada el año anterior.'
    ),
    (
        '7a000000-0000-0000-0000-000000000002',
        'PROG-2025-001',
        'Planta Santa Cruz (Ciclo Combinado Año 1)',
        'NIVEL_1_INTRA_ORG',
        'Combinada',
        TRUE,
        NULL,
        'Ciclo base Año 1 ejecutado como auditoría combinada SGC + SGA.'
    ),
    (
        '7a000000-0000-0000-0000-000000000004',
        'PROG-2026-002',
        'Campaña Multientidad Iberometal + CyberCloud',
        'NIVEL_2_INTER_ORG',
        'Multientidad',
        TRUE,
        NULL,
        'Escenario C: Campaña inter-organizacional con preprogramación mensual próxima a ventana.'
    ),
    (
        '7a000000-0000-0000-0000-000000000005',
        'PROG-2026-003',
        'Auditoría SST Individual Example',
        'INDIVIDUAL',
        'Individual',
        FALSE,
        NULL,
        'Escenario D: Auditoría en programación con desfase parcial de días y proceso pendiente.'
    )
ON CONFLICT (codigo_programa) WHERE codigo_programa IS NOT NULL AND deleted_at IS NULL DO UPDATE SET
    etiqueta = EXCLUDED.etiqueta,
    nivel_vinculacion = EXCLUDED.nivel_vinculacion,
    tipo_vinculacion = EXCLUDED.tipo_vinculacion,
    es_vinculada = EXCLUDED.es_vinculada,
    id_ciclo_origen = EXCLUDED.id_ciclo_origen,
    notas = EXCLUDED.notas,
    updated_at = NOW();

-- Programa Año 2 evolucionado (referencia id_ciclo_origen -> PROG-2025-001)
INSERT INTO public.programa_auditoria (id, codigo_programa, etiqueta, nivel_vinculacion, tipo_vinculacion, es_vinculada, id_ciclo_origen, notas) VALUES
    (
        '7a000000-0000-0000-0000-000000000003',
        'PROG-2026-001',
        'Planta Santa Cruz',
        'NIVEL_1_INTRA_ORG',
        'Integrada',
        TRUE,
        '7a000000-0000-0000-0000-000000000002',
        'Escenario B: Evolución de Combinada a Integrada (6.00 días-auditor ejecutados por 2 auditores en 3 días calendario).'
    )
ON CONFLICT (codigo_programa) WHERE codigo_programa IS NOT NULL AND deleted_at IS NULL DO UPDATE SET
    etiqueta = EXCLUDED.etiqueta,
    nivel_vinculacion = EXCLUDED.nivel_vinculacion,
    tipo_vinculacion = EXCLUDED.tipo_vinculacion,
    es_vinculada = EXCLUDED.es_vinculada,
    id_ciclo_origen = EXCLUDED.id_ciclo_origen,
    notas = EXCLUDED.notas,
    updated_at = NOW();

-- 19b. Auditorías por Certificado dentro de cada Programa (sin columnas planas de fecha)
INSERT INTO public.auditoria (id, id_programa_auditoria, codigo_auditoria, id_certificado, id_tipo_auditoria, id_metodologia, tiempo_auditoria, estado_ciclo, objetivo) VALUES
    (
        '80000000-0000-0000-0000-000000000001',
        '7a000000-0000-0000-0000-000000000001',
        'AUD-2024-001',
        '40000000-0000-0000-0000-000000000001', -- FN-QMS-2024-001 (Iberometal)
        'b0000000-0000-0000-0000-000000000002', -- Etapa 2
        'c0000000-0000-0000-0000-000000000001', -- Presencial
        4.00,
        'Auditada',
        'Evaluación inicial Etapa 2 en Sede Principal HQ y Planta Valencia.'
    ),
    (
        '80000000-0000-0000-0000-000000000002',
        '7a000000-0000-0000-0000-000000000002',
        'AUD-2025-001',
        '40000000-0000-0000-0000-000000000004', -- FN-QMS-2025-004 (Example, C.A.)
        'b0000000-0000-0000-0000-000000000002', -- Etapa 2
        'c0000000-0000-0000-0000-000000000001', -- Presencial
        3.00,
        'Auditada',
        'Auditoría combinada Año 1 para sistema de gestión de calidad.'
    ),
    (
        '80000000-0000-0000-0000-000000000003',
        '7a000000-0000-0000-0000-000000000002',
        'AUD-2025-002',
        '40000000-0000-0000-0000-000000000005', -- FN-EMS-2025-005 (Example, C.A.)
        'b0000000-0000-0000-0000-000000000002', -- Etapa 2
        'c0000000-0000-0000-0000-000000000001', -- Presencial
        3.00,
        'Auditada',
        'Auditoría combinada Año 1 para sistema de gestión ambiental.'
    ),
    (
        '80000000-0000-0000-0000-000000000004',
        '7a000000-0000-0000-0000-000000000003',
        'AUD-2026-001',
        '40000000-0000-0000-0000-000000000004', -- FN-QMS-2025-004 (Example, C.A.)
        'b0000000-0000-0000-0000-000000000003', -- Seguimiento 1
        'c0000000-0000-0000-0000-000000000001', -- Presencial
        3.00,
        'Reprogramada',
        'Seguimiento integrado Año 2 SGC en Planta Santa Cruz.'
    ),
    (
        '80000000-0000-0000-0000-000000000005',
        '7a000000-0000-0000-0000-000000000003',
        'AUD-2026-002',
        '40000000-0000-0000-0000-000000000005', -- FN-EMS-2025-005 (Example, C.A.)
        'b0000000-0000-0000-0000-000000000003', -- Seguimiento 1
        'c0000000-0000-0000-0000-000000000001', -- Presencial
        3.00,
        'Reprogramada',
        'Seguimiento integrado Año 2 SGA en Planta Santa Cruz.'
    ),
    (
        '80000000-0000-0000-0000-000000000006',
        '7a000000-0000-0000-0000-000000000004',
        'AUD-2026-003',
        '40000000-0000-0000-0000-000000000001', -- FN-QMS-2024-001 (Iberometal - Org A)
        'b0000000-0000-0000-0000-000000000005', -- Renovación
        'c0000000-0000-0000-0000-000000000003', -- Mixta
        2.00,
        'En Programación',
        'Renovación coordinada en campaña multientidad (Org A).'
    ),
    (
        '80000000-0000-0000-0000-000000000007',
        '7a000000-0000-0000-0000-000000000004',
        'AUD-2026-004',
        '40000000-0000-0000-0000-000000000003', -- FN-ISMS-2025-003 (CyberCloud - Org B)
        'b0000000-0000-0000-0000-000000000005', -- Renovación
        'c0000000-0000-0000-0000-000000000002', -- Remota
        2.00,
        'En Programación',
        'Renovación coordinada en campaña multientidad (Org B).'
    ),
    (
        '80000000-0000-0000-0000-000000000008',
        '7a000000-0000-0000-0000-000000000005',
        'AUD-2026-005',
        '40000000-0000-0000-0000-000000000006', -- FN-SST-2026-006 (Example, C.A.)
        'b0000000-0000-0000-0000-000000000001', -- Etapa 1
        'c0000000-0000-0000-0000-000000000001', -- Presencial
        2.50,
        'En Programación',
        'Diagnóstico inicial SST con asignación parcial pendiente de completar.'
    )
ON CONFLICT (codigo_auditoria) WHERE codigo_auditoria IS NOT NULL AND deleted_at IS NULL DO UPDATE SET
    id_programa_auditoria = EXCLUDED.id_programa_auditoria,
    id_certificado = EXCLUDED.id_certificado,
    id_tipo_auditoria = EXCLUDED.id_tipo_auditoria,
    id_metodologia = EXCLUDED.id_metodologia,
    tiempo_auditoria = EXCLUDED.tiempo_auditoria,
    estado_ciclo = EXCLUDED.estado_ciclo,
    objetivo = EXCLUDED.objetivo,
    updated_at = NOW();

-- 19c. Fechas 1:N de Auditoría (PREPROGRAMADA_MES y REAL con numero_secuencia)
INSERT INTO public.auditoria_fecha (
    id, id_auditoria, numero_secuencia, tag, tipo_fecha, anio, mes, fecha_inicio, fecha_fin, observacion
) VALUES
    -- Escenario A (Histórico año anterior)
    (
        '81000000-0000-0000-0000-000000000001',
        '80000000-0000-0000-0000-000000000001',
        1,
        'Programación',
        'REAL',
        NULL,
        NULL,
        (CURRENT_DATE - INTERVAL '1 year')::DATE,
        (CURRENT_DATE - INTERVAL '1 year' + INTERVAL '3 days')::DATE,
        'Ejecución histórica Etapa 2 completada conforme al plan.'
    ),
    -- Escenario B Año 1 Combinada (Año anterior)
    (
        '81000000-0000-0000-0000-000000000002',
        '80000000-0000-0000-0000-000000000002',
        1,
        'Programación',
        'REAL',
        NULL,
        NULL,
        (CURRENT_DATE - INTERVAL '1 year' + INTERVAL '15 days')::DATE,
        (CURRENT_DATE - INTERVAL '1 year' + INTERVAL '17 days')::DATE,
        'Evaluación SGC Año 1 en esquema Combinado.'
    ),
    (
        '81000000-0000-0000-0000-000000000003',
        '80000000-0000-0000-0000-000000000003',
        1,
        'Programación',
        'REAL',
        NULL,
        NULL,
        (CURRENT_DATE - INTERVAL '1 year' + INTERVAL '15 days')::DATE,
        (CURRENT_DATE - INTERVAL '1 year' + INTERVAL '17 days')::DATE,
        'Evaluación SGA Año 1 en esquema Combinado.'
    ),
    -- Escenario B Año 2 Integrada (seq=1 PREPROGRAMADA_MES + seq=2 REAL 3 días calendario)
    (
        '81000000-0000-0000-0000-000000000004',
        '80000000-0000-0000-0000-000000000004',
        1,
        'Programación',
        'PREPROGRAMADA_MES',
        EXTRACT(YEAR FROM (CURRENT_DATE + INTERVAL '20 days'))::SMALLINT,
        EXTRACT(MONTH FROM (CURRENT_DATE + INTERVAL '20 days'))::SMALLINT,
        NULL,
        NULL,
        'Pre-programación anual de ventana para Planta Santa Cruz.'
    ),
    (
        '81000000-0000-0000-0000-000000000005',
        '80000000-0000-0000-0000-000000000004',
        2,
        'Reprogramación',
        'REAL',
        NULL,
        NULL,
        (CURRENT_DATE + INTERVAL '20 days')::DATE,
        (CURRENT_DATE + INTERVAL '22 days')::DATE,
        'Reprogramado por parada de planta'
    ),
    (
        '81000000-0000-0000-0000-000000000006',
        '80000000-0000-0000-0000-000000000005',
        1,
        'Programación',
        'PREPROGRAMADA_MES',
        EXTRACT(YEAR FROM (CURRENT_DATE + INTERVAL '20 days'))::SMALLINT,
        EXTRACT(MONTH FROM (CURRENT_DATE + INTERVAL '20 days'))::SMALLINT,
        NULL,
        NULL,
        'Pre-programación anual de ventana para Planta Santa Cruz.'
    ),
    (
        '81000000-0000-0000-0000-000000000007',
        '80000000-0000-0000-0000-000000000005',
        2,
        'Reprogramación',
        'REAL',
        NULL,
        NULL,
        (CURRENT_DATE + INTERVAL '20 days')::DATE,
        (CURRENT_DATE + INTERVAL '22 days')::DATE,
        'Reprogramado por parada de planta'
    ),
    -- Escenario C Nivel 2 Inter-Org (PREPROGRAMADA_MES próxima a vencer ventana <= 30d)
    (
        '81000000-0000-0000-0000-000000000008',
        '80000000-0000-0000-0000-000000000006',
        1,
        'Programación',
        'PREPROGRAMADA_MES',
        EXTRACT(YEAR FROM (CURRENT_DATE + INTERVAL '20 days'))::SMALLINT,
        EXTRACT(MONTH FROM (CURRENT_DATE + INTERVAL '20 days'))::SMALLINT,
        NULL,
        NULL,
        'Pendiente de confirmación de fechas exactas con Iberometal.'
    ),
    (
        '81000000-0000-0000-0000-000000000009',
        '80000000-0000-0000-0000-000000000007',
        1,
        'Programación',
        'PREPROGRAMADA_MES',
        EXTRACT(YEAR FROM (CURRENT_DATE + INTERVAL '20 days'))::SMALLINT,
        EXTRACT(MONTH FROM (CURRENT_DATE + INTERVAL '20 days'))::SMALLINT,
        NULL,
        NULL,
        'Pendiente de confirmación de fechas exactas con CyberCloud.'
    ),
    -- Escenario D Parcial / Atrasada
    (
        '81000000-0000-0000-0000-000000000010',
        '80000000-0000-0000-0000-000000000008',
        1,
        'Programación',
        'REAL',
        NULL,
        NULL,
        (CURRENT_DATE - INTERVAL '5 days')::DATE,
        (CURRENT_DATE - INTERVAL '3 days')::DATE,
        'Ventana preliminar vencida sin cierre de asignación.'
    )
ON CONFLICT (id_auditoria, numero_secuencia) WHERE deleted_at IS NULL DO UPDATE SET
    tag = EXCLUDED.tag,
    tipo_fecha = EXCLUDED.tipo_fecha,
    anio = EXCLUDED.anio,
    mes = EXCLUDED.mes,
    fecha_inicio = EXCLUDED.fecha_inicio,
    fecha_fin = EXCLUDED.fecha_fin,
    observacion = EXCLUDED.observacion,
    updated_at = NOW();

-- 20. Sitios en Alcance de las Auditorías (con Cubo 1 tiempo_auditoria en 0.25d y modalidad)
INSERT INTO public.sitios_por_auditoria (id, id_auditoria, id_sitio, tiempo_auditoria, modalidad_evaluacion, fecha_inicio, fecha_fin, notas_sitio) VALUES
    -- Escenario A: Sitio 0 (1.50d) + Sitio 1 (2.50d) = 4.00d
    (
        '90000000-0000-0000-0000-000000000000',
        '80000000-0000-0000-0000-000000000001',
        '50000000-0000-0000-0000-000000000000',
        1.50,
        'Presencial',
        (CURRENT_DATE - INTERVAL '1 year')::DATE,
        (CURRENT_DATE - INTERVAL '1 year' + INTERVAL '1 day')::DATE,
        'Evaluación de alta dirección y sistema documental en HQ.'
    ),
    (
        '90000000-0000-0000-0000-000000000001',
        '80000000-0000-0000-0000-000000000001',
        '50000000-0000-0000-0000-000000000001',
        2.50,
        'Presencial',
        (CURRENT_DATE - INTERVAL '1 year' + INTERVAL '1 day')::DATE,
        (CURRENT_DATE - INTERVAL '1 year' + INTERVAL '3 days')::DATE,
        'Evaluación operativa en planta productiva Valencia.'
    ),
    -- Escenario B Año 1 Combinada
    (
        '90000000-0000-0000-0000-000000000002',
        '80000000-0000-0000-0000-000000000002',
        '50000000-0000-0000-0000-000000000004',
        3.00,
        'Presencial',
        (CURRENT_DATE - INTERVAL '1 year' + INTERVAL '15 days')::DATE,
        (CURRENT_DATE - INTERVAL '1 year' + INTERVAL '17 days')::DATE,
        'Alcance SGC Año 1 en Planta Santa Cruz.'
    ),
    (
        '90000000-0000-0000-0000-000000000003',
        '80000000-0000-0000-0000-000000000003',
        '50000000-0000-0000-0000-000000000005',
        3.00,
        'Presencial',
        (CURRENT_DATE - INTERVAL '1 year' + INTERVAL '15 days')::DATE,
        (CURRENT_DATE - INTERVAL '1 year' + INTERVAL '17 days')::DATE,
        'Alcance SGA Año 1 en Planta Santa Cruz.'
    ),
    -- Escenario B Año 2 Integrada (6.00 días-auditor totales entre ambos certificados)
    (
        '90000000-0000-0000-0000-000000000004',
        '80000000-0000-0000-0000-000000000004',
        '50000000-0000-0000-0000-000000000004',
        3.00,
        'Presencial',
        (CURRENT_DATE + INTERVAL '20 days')::DATE,
        (CURRENT_DATE + INTERVAL '22 days')::DATE,
        'Planta Santa Cruz - Bloque Calidad Integrado.'
    ),
    (
        '90000000-0000-0000-0000-000000000005',
        '80000000-0000-0000-0000-000000000005',
        '50000000-0000-0000-0000-000000000005',
        3.00,
        'Presencial',
        (CURRENT_DATE + INTERVAL '20 days')::DATE,
        (CURRENT_DATE + INTERVAL '22 days')::DATE,
        'Planta Santa Cruz - Bloque Ambiental Integrado.'
    ),
    -- Escenario C Nivel 2 Inter-Org
    (
        '90000000-0000-0000-0000-000000000006',
        '80000000-0000-0000-0000-000000000006',
        '50000000-0000-0000-0000-000000000001',
        2.00,
        'Mixta',
        NULL,
        NULL,
        'Pendiente de fecha exacta en Planta Valencia.'
    ),
    (
        '90000000-0000-0000-0000-000000000007',
        '80000000-0000-0000-0000-000000000007',
        '50000000-0000-0000-0000-000000000003',
        2.00,
        'Remota',
        NULL,
        NULL,
        'Pendiente de fecha exacta en Centro de Datos Chacao.'
    ),
    -- Escenario D Parcial (2.50d requeridos vs 1.50d asignados en Cubo 2)
    (
        '90000000-0000-0000-0000-000000000008',
        '80000000-0000-0000-0000-000000000008',
        '50000000-0000-0000-0000-000000000006',
        2.50,
        'Presencial',
        (CURRENT_DATE - INTERVAL '5 days')::DATE,
        (CURRENT_DATE - INTERVAL '3 days')::DATE,
        'Sede SST con asignación parcial en curso.'
    )
ON CONFLICT (id_auditoria, id_sitio) WHERE deleted_at IS NULL DO UPDATE SET
    tiempo_auditoria = EXCLUDED.tiempo_auditoria,
    modalidad_evaluacion = EXCLUDED.modalidad_evaluacion,
    fecha_inicio = EXCLUDED.fecha_inicio,
    fecha_fin = EXCLUDED.fecha_fin,
    notas_sitio = EXCLUDED.notas_sitio;

-- 20b. Turnos por Sitio en Auditoría
INSERT INTO public.turnos_sitio_auditoria (id, id_sitios_por_auditoria, id_turnos_por_sitio) VALUES
    ('95000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000000', '71000000-0000-0000-0000-000000000000'), -- AUD-2024 Sitio 0 Turno 1
    ('95000000-0000-0000-0000-000000000002', '90000000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-000000000001'), -- AUD-2024 Sitio 1 Turno 1
    ('95000000-0000-0000-0000-000000000003', '90000000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-000000000002'), -- AUD-2024 Sitio 1 Turno 2
    ('95000000-0000-0000-0000-000000000004', '90000000-0000-0000-0000-000000000004', '71000000-0000-0000-0000-000000000004'), -- Escenario B QMS Turno 1
    ('95000000-0000-0000-0000-000000000005', '90000000-0000-0000-0000-000000000004', '71000000-0000-0000-0000-000000000005'), -- Escenario B QMS Turno 2
    ('95000000-0000-0000-0000-000000000006', '90000000-0000-0000-0000-000000000005', '71000000-0000-0000-0000-000000000006'), -- Escenario B EMS Turno 1
    ('95000000-0000-0000-0000-000000000007', '90000000-0000-0000-0000-000000000008', '71000000-0000-0000-0000-000000000007')  -- Escenario D SST Turno 1
ON CONFLICT (id_sitios_por_auditoria, id_turnos_por_sitio) WHERE deleted_at IS NULL DO NOTHING;

-- 20c. Procesos por Sitio en Auditoría (rediseñado con id_procesos_por_sitio, sin id_turnos_sitio_auditoria)
INSERT INTO public.procesos_sitio_auditoria (id, id_sitios_por_auditoria, id_procesos_por_sitio, id_proceso, notas) VALUES
    ('96000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000000', '61000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000002', 'Entrevista de Dirección en HQ.'),
    ('96000000-0000-0000-0000-000000000002', '90000000-0000-0000-0000-000000000001', '61000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000001', 'Muestreo en líneas de troquelado y fundición.'),
    ('96000000-0000-0000-0000-000000000003', '90000000-0000-0000-0000-000000000004', '61000000-0000-0000-0000-000000000006', '60000000-0000-0000-0000-000000000006', 'Evaluación multi-turno de fabricación integrada.'),
    ('96000000-0000-0000-0000-000000000004', '90000000-0000-0000-0000-000000000004', '61000000-0000-0000-0000-000000000007', '60000000-0000-0000-0000-000000000007', 'Revisión por la Dirección Integrada.'),
    ('96000000-0000-0000-0000-000000000005', '90000000-0000-0000-0000-000000000005', '61000000-0000-0000-0000-000000000008', '60000000-0000-0000-0000-000000000008', 'Verificación de almacenamiento temporal y residuos.'),
    ('96000000-0000-0000-0000-000000000006', '90000000-0000-0000-0000-000000000008', '61000000-0000-0000-0000-000000000009', '60000000-0000-0000-0000-000000000009', 'Proceso SST con evaluador asignado.'),
    ('96000000-0000-0000-0000-000000000007', '90000000-0000-0000-0000-000000000008', '61000000-0000-0000-0000-000000000010', '60000000-0000-0000-0000-000000000010', 'Proceso SST pendiente de asignación de auditor.')
ON CONFLICT (id_sitios_por_auditoria, id_procesos_por_sitio) WHERE deleted_at IS NULL DO UPDATE SET
    id_proceso = EXCLUDED.id_proceso,
    notas = EXCLUDED.notas,
    updated_at = NOW();

-- 20d. Puente M:N Turnos por Proceso en Sitio de Auditoría (1..N turnos por proceso)
INSERT INTO public.turnos_proceso_sitio_auditoria (id, id_procesos_sitio_auditoria, id_turnos_sitio_auditoria) VALUES
    ('97000000-0000-0000-0000-000000000001', '96000000-0000-0000-0000-000000000001', '95000000-0000-0000-0000-000000000001'),
    ('97000000-0000-0000-0000-000000000002', '96000000-0000-0000-0000-000000000002', '95000000-0000-0000-0000-000000000002'),
    ('97000000-0000-0000-0000-000000000003', '96000000-0000-0000-0000-000000000002', '95000000-0000-0000-0000-000000000003'),
    -- Escenario B: múltiples turnos en el mismo proceso integrado
    ('97000000-0000-0000-0000-000000000004', '96000000-0000-0000-0000-000000000003', '95000000-0000-0000-0000-000000000004'),
    ('97000000-0000-0000-0000-000000000005', '96000000-0000-0000-0000-000000000003', '95000000-0000-0000-0000-000000000005'),
    ('97000000-0000-0000-0000-000000000006', '96000000-0000-0000-0000-000000000004', '95000000-0000-0000-0000-000000000004'),
    ('97000000-0000-0000-0000-000000000007', '96000000-0000-0000-0000-000000000005', '95000000-0000-0000-0000-000000000006'),
    -- Escenario D
    ('97000000-0000-0000-0000-000000000008', '96000000-0000-0000-0000-000000000006', '95000000-0000-0000-0000-000000000007')
ON CONFLICT (id_procesos_sitio_auditoria, id_turnos_sitio_auditoria) WHERE deleted_at IS NULL DO NOTHING;

-- 21. Equipos de Auditores por Sitio (Cubo 2) y por Proceso (sincroniza equipo_auditor vía triggers)
INSERT INTO public.equipo_auditor_sitio (id, id_sitios_por_auditoria, id_auditor, rol_auditor, tiempo_auditoria, asignacion_completa_sitio) VALUES
    -- Escenario A (4.00d totales)
    ('98000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000001', 'AUDITOR_LIDER', 1.50, TRUE),
    ('98000000-0000-0000-0000-000000000002', '90000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'AUDITOR_LIDER', 1.00, FALSE),
    ('98000000-0000-0000-0000-000000000003', '90000000-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'AUDITOR', 1.50, TRUE),
    -- Escenario B Año 1 Combinada
    ('98000000-0000-0000-0000-000000000004', '90000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'AUDITOR_LIDER', 3.00, TRUE),
    ('98000000-0000-0000-0000-000000000005', '90000000-0000-0000-0000-000000000003', '33333333-3333-3333-3333-333333333333', 'AUDITOR_LIDER', 3.00, TRUE),
    -- Escenario B Año 2 Integrada: 6.00 días-auditor = 3.00d Carlos Mendoza + 3.00d Auditor Técnico en 3 días calendario
    ('98000000-0000-0000-0000-000000000006', '90000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', 'AUDITOR_LIDER', 1.50, TRUE),
    ('98000000-0000-0000-0000-000000000007', '90000000-0000-0000-0000-000000000004', '33333333-3333-3333-3333-333333333333', 'AUDITOR', 1.50, FALSE),
    ('98000000-0000-0000-0000-000000000008', '90000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001', 'AUDITOR_LIDER', 1.50, TRUE),
    ('98000000-0000-0000-0000-000000000009', '90000000-0000-0000-0000-000000000005', '33333333-3333-3333-3333-333333333333', 'AUDITOR', 1.50, TRUE),
    -- Escenario C Nivel 2 (asigna auditor en Org B para RLS AUDITOR y en Org A)
    ('98000000-0000-0000-0000-000000000010', '90000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000001', 'AUDITOR_LIDER', 2.00, TRUE),
    ('98000000-0000-0000-0000-000000000011', '90000000-0000-0000-0000-000000000007', '33333333-3333-3333-3333-333333333333', 'AUDITOR_LIDER', 2.00, TRUE),
    -- Escenario D Parcial: 1.50d asignados vs 2.50d requeridos (-1.00d de desfase)
    ('98000000-0000-0000-0000-000000000012', '90000000-0000-0000-0000-000000000008', '10000000-0000-0000-0000-000000000001', 'AUDITOR_LIDER', 1.50, FALSE)
ON CONFLICT (id_sitios_por_auditoria, id_auditor) WHERE deleted_at IS NULL DO UPDATE SET
    rol_auditor = EXCLUDED.rol_auditor,
    tiempo_auditoria = EXCLUDED.tiempo_auditoria,
    asignacion_completa_sitio = EXCLUDED.asignacion_completa_sitio,
    updated_at = NOW();

INSERT INTO public.equipo_auditor_proceso_sitio (id, id_procesos_sitio_auditoria, id_auditor, rol_en_proceso) VALUES
    -- Escenario A
    ('99000000-0000-0000-0000-000000000001', '96000000-0000-0000-0000-000000000002', '33333333-3333-3333-3333-333333333333', 'EVALUADOR'),
    ('99000000-0000-0000-0000-000000000002', '96000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'LIDER_PROCESO'),
    -- Escenario B Año 2 Integrada (asignación granular complementaria en proceso de fabricación)
    ('99000000-0000-0000-0000-000000000003', '96000000-0000-0000-0000-000000000003', '33333333-3333-3333-3333-333333333333', 'EVALUADOR'),
    ('99000000-0000-0000-0000-000000000004', '96000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', 'LIDER_PROCESO'),
    -- Escenario D Parcial (solo 1 de 2 procesos asignados)
    ('99000000-0000-0000-0000-000000000005', '96000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000001', 'LIDER_PROCESO')
ON CONFLICT (id_procesos_sitio_auditoria, id_auditor) WHERE deleted_at IS NULL DO UPDATE SET
    rol_en_proceso = EXCLUDED.rol_en_proceso;

-- 22. Hallazgos de Campo
INSERT INTO public.hallazgo (id, id_auditoria, id_requisito, id_proceso, tipo, descripcion, evidencia, cerrado) VALUES
    (
        'a1000000-0000-0000-0000-000000000001',
        '80000000-0000-0000-0000-000000000001',
        'f0000000-0000-0000-0000-000000000085',
        '60000000-0000-0000-0000-000000000001',
        'NC_MENOR',
        'Descalibración en pie de rey en la línea 2 de fundición.',
        'Registro fotográfico de instrumento CAL-09 sin verificación.',
        FALSE
    )
ON CONFLICT (id) DO NOTHING;

-- 23. Fechas del Certificado (Step 2.1)
INSERT INTO public.fecha_certificado (id, id_certificado, fecha, tipo_fecha) VALUES
    ('91000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '2024-01-15', 'Otorgamiento'),
    ('91000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001', '2024-11-20', 'Ultima Auditoría'),
    ('91000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000001', '2027-01-14', 'Vencimiento')
ON CONFLICT (id_certificado, tipo_fecha, fecha) WHERE deleted_at IS NULL DO UPDATE SET
    tipo_fecha = EXCLUDED.tipo_fecha,
    fecha = EXCLUDED.fecha,
    updated_at = NOW();

-- 24. Contactos Autorizados del Certificado (Step 2.1)
INSERT INTO public.contacto_certificado (id, id_certificado, nombre, cargo) VALUES
    ('92000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'Ing. María Fernanda Rojas', 'Gerente de Aseguramiento de Calidad'),
    ('92000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001', 'Lic. Alejandro Peña', 'Coordinador SGC')
ON CONFLICT (id_certificado, LOWER(TRIM(nombre))) WHERE deleted_at IS NULL DO UPDATE SET
    cargo = EXCLUDED.cargo,
    updated_at = NOW();

-- 25. Teléfonos de Contactos del Certificado (Step 2.1)
INSERT INTO public.telefono_contacto_certificado (id, id_contacto, telefono, tipo_telefono) VALUES
    ('93000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000001', '+58 241 832-4100', 'Oficina'),
    ('93000000-0000-0000-0000-000000000002', '92000000-0000-0000-0000-000000000001', '+58 414 490-1122', 'Móvil'),
    ('93000000-0000-0000-0000-000000000003', '92000000-0000-0000-0000-000000000002', '+58 241 832-4155', 'Directo')
ON CONFLICT (id_contacto, TRIM(telefono)) WHERE deleted_at IS NULL DO UPDATE SET
    tipo_telefono = EXCLUDED.tipo_telefono,
    updated_at = NOW();

-- 26. Emails de Contactos del Certificado (Step 2.1)
INSERT INTO public.email_contacto_certificado (id, id_contacto, email, tipo_email) VALUES
    ('94000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000001', 'mrojas@iberometal.com', 'Trabajo'),
    ('94000000-0000-0000-0000-000000000002', '92000000-0000-0000-0000-000000000001', 'calidad@iberometal.com', 'Alternativo'),
    ('94000000-0000-0000-0000-000000000003', '92000000-0000-0000-0000-000000000002', 'apena@iberometal.com', 'Trabajo')
ON CONFLICT (id_contacto, LOWER(TRIM(email))) WHERE deleted_at IS NULL DO UPDATE SET
    tipo_email = EXCLUDED.tipo_email,
    updated_at = NOW();