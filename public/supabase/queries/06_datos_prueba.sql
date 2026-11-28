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

-- 2. Modalidades de Auditoría Estandarizadas (9 Modalidades Canónicas Title-Case + Abreviación)
INSERT INTO public.tipo_auditoria (id, tipo, abreviacion) VALUES
    ('b0000000-0000-0000-0000-000000000001', 'Etapa 1', 'Est.1'),
    ('b0000000-0000-0000-0000-000000000002', 'Etapa 2', 'Est.2'),
    ('b0000000-0000-0000-0000-000000000003', 'Seguimiento 1', 'Seg.1'),
    ('b0000000-0000-0000-0000-000000000004', 'Seguimiento 2', 'Seg.2'),
    ('b0000000-0000-0000-0000-000000000005', 'Renovación', 'Renov.'),
    ('b0000000-0000-0000-0000-000000000006', 'Diagnóstico', 'Diag.'),
    ('b0000000-0000-0000-0000-000000000007', 'Extraordinaria', 'Extra.'),
    ('b0000000-0000-0000-0000-000000000008', 'Especial', 'Esp.'),
    ('b0000000-0000-0000-0000-000000000009', 'Otro', 'Otro')
ON CONFLICT (tipo) WHERE deleted_at IS NULL DO UPDATE SET
    abreviacion = EXCLUDED.abreviacion,
    updated_at = NOW();

-- 3. Metodologías de Auditoría Estandarizadas (3 Métodos Canónicos Title-Case)
INSERT INTO public.metodologia_auditoria (id, metodologia) VALUES
    ('c0000000-0000-0000-0000-000000000001', 'Presencial'),
    ('c0000000-0000-0000-0000-000000000002', 'Remota'),
    ('c0000000-0000-0000-0000-000000000003', 'Mixta')
ON CONFLICT (metodologia) WHERE deleted_at IS NULL DO UPDATE SET updated_at = NOW();

-- 4. Sectores IAF Principales (con Descripción Obligatoria)
INSERT INTO public.sector_iaf (id, sector, descripcion) VALUES
    ('d0000000-0000-0000-0000-000000000001', 01, 'Agricultura, selvicultura y pesca'),
    ('d0000000-0000-0000-0000-000000000002', 02, 'Minería e industrias extractivas'),
    ('d0000000-0000-0000-0000-000000000003', 03, 'Productos alimenticios, bebidas y tabaco'),
    ('d0000000-0000-0000-0000-000000000004', 04, 'Textiles y productos textiles'),
    ('d0000000-0000-0000-0000-000000000005', 05, 'Cuero y productos del cuero'),
    ('d0000000-0000-0000-0000-000000000006', 06, 'Madera y productos de la madera'),
    ('d0000000-0000-0000-0000-000000000007', 07, 'Pulpa, papel y productos de papel'),
    ('d0000000-0000-0000-0000-000000000008', 08, 'Edición y publicación'),
    ('d0000000-0000-0000-0000-000000000009', 09, 'Artes gráficas'),
    ('d0000000-0000-0000-0000-000000000010', 10, 'Fabricación de coque y productos refinados de petróleo'),
    ('d0000000-0000-0000-0000-000000000011', 11, 'Combustible nuclear'),
    ('d0000000-0000-0000-0000-000000000012', 12, 'Químicos, productos químicos y fibras'),
    ('d0000000-0000-0000-0000-000000000013', 13, 'Productos farmacéuticos'),
    ('d0000000-0000-0000-0000-000000000014', 14, 'Productos de caucho y plástico'),
    ('d0000000-0000-0000-0000-000000000015', 15, 'Productos minerales no metálicos'),
    ('d0000000-0000-0000-0000-000000000016', 16, 'Hormigón, cemento, cal y yeso'),
    ('d0000000-0000-0000-0000-000000000017', 17, 'Metales básicos y fabricación de productos metálicos'),
    ('d0000000-0000-0000-0000-000000000018', 18, 'Maquinaria y equipo'),
    ('d0000000-0000-0000-0000-000000000019', 19, 'Equipos electrónico y óptico'),
    ('d0000000-0000-0000-0000-000000000020', 20, 'Construcción naval'),
    ('d0000000-0000-0000-0000-000000000021', 21, 'Aeroespacial'),
    ('d0000000-0000-0000-0000-000000000022', 22, 'Otros equipos de transporte'),
    ('d0000000-0000-0000-0000-000000000023', 23, 'Otras manufacturas no calificadas en otra parte'),
    ('d0000000-0000-0000-0000-000000000024', 24, 'Reciclaje'),
    ('d0000000-0000-0000-0000-000000000025', 25, 'Suministro de energía eléctrica'),
    ('d0000000-0000-0000-0000-000000000026', 26, 'Suministro de gas'),
    ('d0000000-0000-0000-0000-000000000027', 27, 'Suministro de agua'),
    ('d0000000-0000-0000-0000-000000000028', 28, 'Construcción e ingeniería civil'),
    ('d0000000-0000-0000-0000-000000000029', 29, 'Comercio, reparación de vehículos a motor, motocicletas y artículos personales y de uso doméstico'),
    ('d0000000-0000-0000-0000-000000000030', 30, 'Hoteles y restaurantes'),
    ('d0000000-0000-0000-0000-000000000031', 31, 'Transporte, almacenamiento y comunicaciones'),
    ('d0000000-0000-0000-0000-000000000032', 32, 'Intermediación financiera, actividad inmobiliaria y alquiler de máquina'),
    ('d0000000-0000-0000-0000-000000000033', 33, 'Tecnologías de la información'),
    ('d0000000-0000-0000-0000-000000000034', 34, 'Servicios de ingeniería'),
    ('d0000000-0000-0000-0000-000000000035', 35, 'Otros servicios profesionales y empresariales'),
    ('d0000000-0000-0000-0000-000000000036', 36, 'Administración pública'),
    ('d0000000-0000-0000-0000-000000000037', 37, 'Educación'),
    ('d0000000-0000-0000-0000-000000000038', 38, 'Salud y asistencia social'),
    ('d0000000-0000-0000-0000-000000000039', 39, 'Otros servicios sociales')
ON CONFLICT (sector) WHERE deleted_at IS NULL DO UPDATE SET
    descripcion = EXCLUDED.descripcion,
    updated_at = NOW();

-- 5. Sub-Sectores IAF Jerárquicos con Categoría de Riesgo (Fase 1 + Paso 1.2 Sector 13.2)
INSERT INTO public.subsector_iaf (id, id_sector_iaf, codigo, descripcion, categoria_riesgo) VALUES
    ('da000000-0000-0000-0000-000000000011', 'd0000000-0000-0000-0000-000000000001', '01.1', 'Agricultura, ganadería, caza y servicios relacionados.', 'ALTO'),
    ('da000000-0000-0000-0000-000000000012', 'd0000000-0000-0000-0000-000000000001', '01.2', 'Selvicultura y explotación forestal.', 'ALTO'),
    ('da000000-0000-0000-0000-000000000013', 'd0000000-0000-0000-0000-000000000001', '01.3', 'Pesca y acuicultura.', 'ALTO'),
    ('da000000-0000-0000-0000-000000000021', 'd0000000-0000-0000-0000-000000000002', '02.1', 'Extracción de antracita, hulla y lignito.', 'ALTO'),
    ('da000000-0000-0000-0000-000000000022', 'd0000000-0000-0000-0000-000000000002', '02.2', 'Extracción de petróleo y gas natural.', 'ALTO'),
    ('da000000-0000-0000-0000-000000000023', 'd0000000-0000-0000-0000-000000000002', '02.3', 'Extracción de minerales metálicos y no metálicos.', 'ALTO'),
    ('da000000-0000-0000-0000-000000000024', 'd0000000-0000-0000-0000-000000000002', '02.4', 'Actividades de apoyo a la industria extractiva.', 'ALTO'),
    ('da000000-0000-0000-0000-000000000031', 'd0000000-0000-0000-0000-000000000003', '03.1', 'Productos alimenticios y bebidas y tabaco manufacturado.', 'ALTO'),
    ('da000000-0000-0000-0000-000000000041', 'd0000000-0000-0000-0000-000000000004', '04.1', 'Prendas de vestir y prendas de piel.', 'ALTO'),
    ('da000000-0000-0000-0000-000000000051', 'd0000000-0000-0000-0000-000000000005', '05.1', 'Cuero y pieles.', 'ALTO'),
    ('da000000-0000-0000-0000-000000000061', 'd0000000-0000-0000-0000-000000000006', '06.1', 'Productos de madera y corcho.', 'ALTO'),
    ('da000000-0000-0000-0000-000000000062', 'd0000000-0000-0000-0000-000000000006', '06.2', 'Cestería y espartería.', 'ALTO'),
    ('da000000-0000-0000-0000-000000000071', 'd0000000-0000-0000-0000-000000000007', '07.1', 'Pulpa, papel y cartón.', 'ALTO'),
    ('da000000-0000-0000-0000-000000000081', 'd0000000-0000-0000-0000-000000000008', '08.1', 'Edición.', 'ALTO'),
    ('da000000-0000-0000-0000-000000000082', 'd0000000-0000-0000-0000-000000000008', '08.2', 'Actividades de grabación de sonido y edición musical.', 'ALTO'),
    ('da000000-0000-0000-0000-000000000091', 'd0000000-0000-0000-0000-000000000009', '09.1', 'Artes gráficas y reproducción de soportes grabados.', 'ALTO'),
    ('da000000-0000-0000-0000-000000000101', 'd0000000-0000-0000-0000-000000000010', '10.1', 'Coque y refino de petróleo', 'ALTO'),
    ('da000000-0000-0000-0000-000000000102', 'd0000000-0000-0000-0000-000000000010', '10.2', 'Productos refinados de petróleo.', 'ALTO'),
    ('da000000-0000-0000-0000-000000000111', 'd0000000-0000-0000-0000-000000000011', '11.1', 'Combustible nuclear y residuos radiactivos', 'ALTO'),
    ('da000000-0000-0000-0000-000000000121', 'd0000000-0000-0000-0000-000000000012', '12.1', 'Productos químicos.', 'ALTO'),
    ('da000000-0000-0000-0000-000000000122', 'd0000000-0000-0000-0000-000000000012', '12.2', 'Fibras Sintéticas y artificiales.', 'ALTO'),
    ('da000000-0000-0000-0000-000000000131', 'd0000000-0000-0000-0000-000000000013', '13.1', 'Productos y preparaciones farmacéuticos.', 'ALTO'),
    ('da000000-0000-0000-0000-000000000141', 'd0000000-0000-0000-0000-000000000014', '14.1', 'Productos de caucho y plásticos.', 'ALTO'),
    ('da000000-0000-0000-0000-000000000151', 'd0000000-0000-0000-0000-000000000015', '15.1', 'Productos cerámicos.', 'ALTO'),
    ('da000000-0000-0000-0000-000000000152', 'd0000000-0000-0000-0000-000000000015', '15.2', 'Ladrillos, tejas y productos de tierra cocida', 'ALTO'),
    ('da000000-0000-0000-0000-000000000153', 'd0000000-0000-0000-0000-000000000015', '15.3', 'Vidrio', 'ALTO'),
    ('da000000-0000-0000-0000-000000000161', 'd0000000-0000-0000-0000-000000000016', '16.1', 'Cemento, cal, yeso', 'ALTO'),
    ('da000000-0000-0000-0000-000000000162', 'd0000000-0000-0000-0000-000000000016', '16.2', 'Hormigón, piedra y productos abrasivos.', 'ALTO'),
    ('da000000-0000-0000-0000-000000000171', 'd0000000-0000-0000-0000-000000000017', '17.1', 'Productos de metalurgia', 'ALTO'),
    ('da000000-0000-0000-0000-000000000172', 'd0000000-0000-0000-0000-000000000017', '17.2', 'Productos metálicos', 'ALTO'),
    ('da000000-0000-0000-0000-000000000181', 'd0000000-0000-0000-0000-000000000018', '18.1', 'Fabricación y reparación de maquinarias y equipos', 'ALTO'),
    ('da000000-0000-0000-0000-000000000182', 'd0000000-0000-0000-0000-000000000018', '18.2', 'Fabricación de aparatos electrodomésticos no eléctricos.', 'ALTO'),
    ('da000000-0000-0000-0000-000000000191', 'd0000000-0000-0000-0000-000000000019', '19.1', 'Fabricación de productos informáticos, eléctricos y ópticos y equipos de comunicación.', 'ALTO'),
    ('da000000-0000-0000-0000-000000000192', 'd0000000-0000-0000-0000-000000000019', '19.2', 'Fabricación de material y equipo óptico', 'ALTO'),
    ('da000000-0000-0000-0000-000000000193', 'd0000000-0000-0000-0000-000000000019', '19.3', 'Reparación de equipos electrónicos y ópticos.', 'ALTO'),
    ('da000000-0000-0000-0000-000000000194', 'd0000000-0000-0000-0000-000000000019', '19.4', 'Fabricación de instrumentos y suministros médicos y odontológicos.', 'ALTO'),
    ('da000000-0000-0000-0000-000000000201', 'd0000000-0000-0000-0000-000000000020', '20.1', 'Construcción de barcos, estructuras flotantes y embarcaciones de recreo y deportes.', 'ALTO'),
    ('da000000-0000-0000-0000-000000000202', 'd0000000-0000-0000-0000-000000000020', '20.2', 'Reparación y mantenimiento naval.', 'ALTO'),
    ('da000000-0000-0000-0000-000000000211', 'd0000000-0000-0000-0000-000000000021', '21.1', 'Fabricación de aeronaves, vehículos espaciales y equipos relacionados.', 'ALTO'),
    ('da000000-0000-0000-0000-000000000212', 'd0000000-0000-0000-0000-000000000021', '21.2', 'Reparación y mantenimiento de aeronaves y vehículos espaciales.', 'ALTO'),
    ('da000000-0000-0000-0000-000000000221', 'd0000000-0000-0000-0000-000000000022', '22.1', 'Fabricación de vehículos a motor, remolques, semirremolques.', 'ALTO'),
    ('da000000-0000-0000-0000-000000000222', 'd0000000-0000-0000-0000-000000000022', '22.2', 'Fabricación de locomotoras, material ferroviario y vehículos militares.', 'ALTO'),
    ('da000000-0000-0000-0000-000000000223', 'd0000000-0000-0000-0000-000000000022', '22.3', 'Fabricación de bicicletas, motocicletas y otros.', 'ALTO'),
    ('da000000-0000-0000-0000-000000000224', 'd0000000-0000-0000-0000-000000000022', '22.4', 'Reparación y mantenimiento de material de transporte.', 'ALTO'),
    ('da000000-0000-0000-0000-000000000231', 'd0000000-0000-0000-0000-000000000023', '23.1', 'Fabricación de muebles y colchones.', 'MEDIO'),
    ('da000000-0000-0000-0000-000000000232', 'd0000000-0000-0000-0000-000000000023', '23.2', 'Fabricación de monedas, artículos de joyería, bisutería y artículos deportivos.', 'MEDIO'),
    ('da000000-0000-0000-0000-000000000233', 'd0000000-0000-0000-0000-000000000023', '23.3', 'Fabricación de juegos, juguetes e instrumentos musicales.', 'MEDIO'),
    ('da000000-0000-0000-0000-000000000241', 'd0000000-0000-0000-0000-000000000024', '24.1', 'Recuperación, y tratamiento, eliminación y valoración de residuos.', 'MEDIO'),
    ('da000000-0000-0000-0000-000000000251', 'd0000000-0000-0000-0000-000000000025', '25.1', 'Producción, transporte, distribución y comercialización de energía eléctrica.', 'MEDIO'),
    ('da000000-0000-0000-0000-000000000261', 'd0000000-0000-0000-0000-000000000026', '26.1', 'Producción, distribución y comercialización de gas.', 'ALTO'),
    ('da000000-0000-0000-0000-000000000271', 'd0000000-0000-0000-0000-000000000027', '27.1', 'Producción y distribución de vapor y aire acondicionado.', 'ALTO'),
    ('da000000-0000-0000-0000-000000000272', 'd0000000-0000-0000-0000-000000000027', '27.2', 'Captación, tratamiento y distribución de agua.', 'ALTO'),
    ('da000000-0000-0000-0000-000000000273', 'd0000000-0000-0000-0000-000000000027', '27.3', 'Recolección y tratamiento de aguas residuales', 'ALTO'),
    ('da000000-0000-0000-0000-000000000281', 'd0000000-0000-0000-0000-000000000028', '28.1', 'Construcción edificios.', 'ALTO'),
    ('da000000-0000-0000-0000-000000000282', 'd0000000-0000-0000-0000-000000000028', '28.2', 'Ingeniería civil.', 'ALTO'),
    ('da000000-0000-0000-0000-000000000283', 'd0000000-0000-0000-0000-000000000028', '28.3', 'Construcción especializada', 'ALTO'),
    ('da000000-0000-0000-0000-000000000291', 'd0000000-0000-0000-0000-000000000029', '29.1', 'Ventas y reparación de vehículos a motor y motocicletas', 'ALTO'),
    ('da000000-0000-0000-0000-000000000292', 'd0000000-0000-0000-0000-000000000029', '29.2', 'Comercio al mayor e intermediaros, comercio al por menor.', 'ALTO'),
    ('da000000-0000-0000-0000-000000000293', 'd0000000-0000-0000-0000-000000000029', '29.3', 'Reparación de efectos personales y artículos de uso domésticos', 'ALTO'),
    ('da000000-0000-0000-0000-000000000301', 'd0000000-0000-0000-0000-000000000030', '30.1', 'Servicios de alojamiento.', 'ALTO'),
    ('da000000-0000-0000-0000-000000000302', 'd0000000-0000-0000-0000-000000000030', '30.2', 'Servicio de comidas y bebidas', 'ALTO'),
    ('da000000-0000-0000-0000-000000000311', 'd0000000-0000-0000-0000-000000000031', '31.1', 'Transporte terrestre y por tuberías', 'ALTO'),
    ('da000000-0000-0000-0000-000000000312', 'd0000000-0000-0000-0000-000000000031', '31.2', 'Transporte marítimo.', 'ALTO'),
    ('da000000-0000-0000-0000-000000000313', 'd0000000-0000-0000-0000-000000000031', '31.3', 'Transporte aéreo', 'ALTO'),
    ('da000000-0000-0000-0000-000000000314', 'd0000000-0000-0000-0000-000000000031', '31.4', 'Almacenamiento y actividades anexas al transporte', 'ALTO'),
    ('da000000-0000-0000-0000-000000000315', 'd0000000-0000-0000-0000-000000000031', '31.5', 'Actividades postales y de correo.', 'ALTO'),
    ('da000000-0000-0000-0000-000000000316', 'd0000000-0000-0000-0000-000000000031', '31.6', 'Actividades de telecomunicaciones', 'ALTO'),
    ('da000000-0000-0000-0000-000000000317', 'd0000000-0000-0000-0000-000000000031', '31.7', 'Actividades de agencia de viajes y operadores turísticos.', 'ALTO'),
    ('da000000-0000-0000-0000-000000000321', 'd0000000-0000-0000-0000-000000000032', '32.1', 'Servicios financieros y actividades auxiliares', 'ALTO'),
    ('da000000-0000-0000-0000-000000000322', 'd0000000-0000-0000-0000-000000000032', '32.2', 'Seguros, reaseguros , fondo de reservaciones y actividades auxiliares', 'ALTO'),
    ('da000000-0000-0000-0000-000000000323', 'd0000000-0000-0000-0000-000000000032', '32.3', 'Actividades inmobiliarias.', 'ALTO'),
    ('da000000-0000-0000-0000-000000000324', 'd0000000-0000-0000-0000-000000000032', '32.4', 'Actividades de alquiler.', 'ALTO'),
    ('da000000-0000-0000-0000-000000000331', 'd0000000-0000-0000-0000-000000000033', '33.1', 'Servicio de informática', 'ALTO'),
    ('da000000-0000-0000-0000-000000000341', 'd0000000-0000-0000-0000-000000000034', '34.1', 'Servicios técnicos de arquitectura, ingeniería, ensayos y análisis técnicos', 'ALTO'),
    ('da000000-0000-0000-0000-000000000342', 'd0000000-0000-0000-0000-000000000034', '34.2', 'Investigación y desarrollo', 'ALTO'),
    ('da000000-0000-0000-0000-000000000343', 'd0000000-0000-0000-0000-000000000034', '34.3', 'Otras actividades profesionales, científicas y técnicas.', 'ALTO'),
    ('da000000-0000-0000-0000-000000000351', 'd0000000-0000-0000-0000-000000000035', '35.1', 'Publicidad.', 'ALTO'),
    ('da000000-0000-0000-0000-000000000352', 'd0000000-0000-0000-0000-000000000035', '35.2', 'Seguridad e investigación.', 'ALTO'),
    ('da000000-0000-0000-0000-000000000353', 'd0000000-0000-0000-0000-000000000035', '35.3', 'Actividades de limpieza', 'ALTO'),
    ('da000000-0000-0000-0000-000000000354', 'd0000000-0000-0000-0000-000000000035', '35.4', 'Actividades fotográficas', 'ALTO'),
    ('da000000-0000-0000-0000-000000000355', 'd0000000-0000-0000-0000-000000000035', '35.5', 'Actividades de contabilidad, auditoría Y consultoría fiscal.', 'ALTO'),
    ('da000000-0000-0000-0000-000000000356', 'd0000000-0000-0000-0000-000000000035', '35.6', 'Actividades de sociedades de gestores de participaciones.', 'ALTO'),
    ('da000000-0000-0000-0000-000000000357', 'd0000000-0000-0000-0000-000000000035', '35.7', 'Actividades de consultoría para la gestión empresarial.', 'ALTO'),
    ('da000000-0000-0000-0000-000000000358', 'd0000000-0000-0000-0000-000000000035', '35.8', 'Estudio de mercado y encuesta de opinión y actividades de interpretación', 'ALTO'),
    ('da000000-0000-0000-0000-000000000359', 'd0000000-0000-0000-0000-000000000035', '35.9', 'Actividades de las agencias de selección de personal.', 'ALTO'),
    ('da000000-0000-0000-0000-000000003510', 'd0000000-0000-0000-0000-000000000035', '35.10', 'Actividades de los centros de llamadas.', 'ALTO'),
    ('da000000-0000-0000-0000-000000003511', 'd0000000-0000-0000-0000-000000000035', '35.11', 'Actividades de servicios administrativos y de apoyo.', 'ALTO'),
    ('da000000-0000-0000-0000-000000000361', 'd0000000-0000-0000-0000-000000000036', '36.1', 'Administración pública, defensa y seguridad social obligatorio.', 'BAJO'),
    ('da000000-0000-0000-0000-000000000362', 'd0000000-0000-0000-0000-000000000036', '36.2', 'Actividad jurídica', 'BAJO'),
    ('da000000-0000-0000-0000-000000000371', 'd0000000-0000-0000-0000-000000000037', '37.1', 'Enseñanza infantil, secundaria y superior.', 'BAJO'),
    ('da000000-0000-0000-0000-000000000372', 'd0000000-0000-0000-0000-000000000037', '37.2', 'Otras actividades educativas y actividades de apoyo.', 'BAJO'),
    ('da000000-0000-0000-0000-000000000381', 'd0000000-0000-0000-0000-000000000038', '38.1', 'Actividades veterinarias.', 'ALTO'),
    ('da000000-0000-0000-0000-000000000382', 'd0000000-0000-0000-0000-000000000038', '38.2', 'Actividades sanitarias.', 'ALTO'),
    ('da000000-0000-0000-0000-000000000383', 'd0000000-0000-0000-0000-000000000038', '38.3', 'Asistencia en establecimientos asistenciales y actividades de servicios sociales sin alojamiento', 'ALTO'),
    ('da000000-0000-0000-0000-000000000391', 'd0000000-0000-0000-0000-000000000039', '39.1', 'Actividades cinematográficas, de video y de programas de televisión, grabaciones de sonidos y edición musical.', 'BAJO'),
    ('da000000-0000-0000-0000-000000000392', 'd0000000-0000-0000-0000-000000000039', '39.2', 'Actividades de programación y emisión de radio y televisión', 'BAJO'),
    ('da000000-0000-0000-0000-000000000393', 'd0000000-0000-0000-0000-000000000039', '39.3', 'Actividades de las sedes centrales y de consultoría de gestión empresarial', 'BAJO'),
    ('da000000-0000-0000-0000-000000000394', 'd0000000-0000-0000-0000-000000000039', '39.4', 'Servicios de reservas y actividades relacionadas, conversiones y ferias, servicios personales.', 'BAJO'),
    ('da000000-0000-0000-0000-000000000395', 'd0000000-0000-0000-0000-000000000039', '39.5', 'Actividades artísticas, recreativas, de entrenamiento y asociativas.', 'BAJO')
ON CONFLICT (codigo) WHERE deleted_at IS NULL DO UPDATE SET
    descripcion = EXCLUDED.descripcion,
    categoria_riesgo = EXCLUDED.categoria_riesgo,
    updated_at = NOW();

-- 6. Organismos de Acreditación (Fase 1)
INSERT INTO public.organismo_acreditacion (id, codigo, nombre, pais, sitio_web) VALUES
    ('db000000-0000-0000-0000-000000000001', 'ONAC', 'Organismo Nacional de Acreditación de Colombia', 'Colombia', 'https://www.onac.org.co'),
    ('db000000-0000-0000-0000-000000000002', 'SENCAMER', 'Servicio Desconcentrado de Normalización, Calidad, Metrología y Reglamentos Técnicos', 'Venezuela', 'https://www.sencamer.org.ve')
ON CONFLICT (codigo) WHERE deleted_at IS NULL DO UPDATE SET
    nombre = EXCLUDED.nombre,
    pais = EXCLUDED.pais,
    sitio_web = EXCLUDED.sitio_web,
    updated_at = NOW();

-- 7. Normas Certificables Expandidas (Código, Título, Estatus, Fecha)
INSERT INTO public.norma (id, esquema, codigo, titulo, estatus, fecha_publicacion, norma) VALUES
    ('e0000000-0000-0000-0000-000000009001', 'SGC', 'ISO 9001:2015', 'Sistemas de Gestión de la Calidad — Requisitos', 'Vigente', '2015-09-15', 'ISO 9001:2015'),
    ('e0000000-0000-0000-0000-000000014001', 'SGA', 'ISO 14001:2015', 'Sistemas de Gestión Ambiental — Requisitos con orientación para su uso', 'Vigente', '2015-09-15', 'ISO 14001:2015'),
    ('e0000000-0000-0000-0000-000000045001', 'SST', 'ISO 45001:2018', 'Sistemas de Gestión de la Seguridad y Salud en el Trabajo — Requisitos', 'Vigente', '2018-03-12', 'ISO 45001:2018'),
    ('e0000000-0000-0000-0000-000000027001', 'SGSI', 'ISO/IEC 27001:2022', 'Seguridad de la información, ciberseguridad y protección de la privacidad — Sistemas de gestión', 'Vigente', '2022-10-25', 'ISO/IEC 27001:2022'),
    ('e0000000-0000-0000-0000-000000022000', 'SGIA', 'ISO 22000:2018', 'Sistemas de Gestión de la Inocuidad de los Alimentos — Requisitos', 'Vigente', '2018-06-19', 'ISO 22000:2018')
ON CONFLICT (codigo) WHERE deleted_at IS NULL DO UPDATE SET
    esquema = EXCLUDED.esquema,
    titulo = EXCLUDED.titulo,
    estatus = EXCLUDED.estatus,
    fecha_publicacion = EXCLUDED.fecha_publicacion,
    norma = EXCLUDED.norma,
    updated_at = NOW();

-- 8. Acreditaciones Otorgadas a Normas y Alcance Multi-Sector IAF
INSERT INTO public.acreditacion_norma (id, id_organismo, id_norma, id_estatus, numero_acreditacion, fecha_concesion, fecha_vencimiento) VALUES
    ('dc000000-0000-0000-0000-000000000001', 'db000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000009001', 'a0000000-0000-0000-0000-000000000001', 'ONAC-SC001', '2020-01-15', '2028-01-14'),
    ('dc000000-0000-0000-0000-000000000002', 'db000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000014001', 'a0000000-0000-0000-0000-000000000001', 'SENCAMER-0044', '2021-06-01', '2027-05-31'),
    ('dc000000-0000-0000-0000-000000000003', 'db000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000027001', 'a0000000-0000-0000-0000-000000000001', 'ONAC-089', '2023-02-10', '2029-02-09'),
    ('dc000000-0000-0000-0000-000000000004', 'db000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000045001', 'a0000000-0000-0000-0000-000000000001', 'SENCAMER-112', '2022-04-01', '2028-03-31'),
    ('dc000000-0000-0000-0000-000000000005', 'db000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000022000', 'a0000000-0000-0000-0000-000000000001', 'ONAC-FS022', '2022-09-15', '2028-09-14')
ON CONFLICT (id) DO UPDATE SET
    id_organismo = EXCLUDED.id_organismo,
    id_norma = EXCLUDED.id_norma,
    id_estatus = EXCLUDED.id_estatus,
    numero_acreditacion = EXCLUDED.numero_acreditacion,
    fecha_concesion = EXCLUDED.fecha_concesion,
    fecha_vencimiento = EXCLUDED.fecha_vencimiento,
    updated_at = NOW();

INSERT INTO public.acreditacion_norma_sector_iaf (id, id_acreditacion_norma, id_sector_iaf) VALUES
    ('dd000000-0000-0000-0000-000000000001', 'dc000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000017'),
    ('dd000000-0000-0000-0000-000000000002', 'dc000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000017'),
    ('dd000000-0000-0000-0000-000000000003', 'dc000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000033'),
    ('dd000000-0000-0000-0000-000000000004', 'dc000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000017'),
    ('dd000000-0000-0000-0000-000000000005', 'dc000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000003'),
    ('dd000000-0000-0000-0000-000000000006', 'dc000000-0000-0000-0000-000000000005', 'd0000000-0000-0000-0000-000000000003'),
    ('dd000000-0000-0000-0000-000000000007', 'dc000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000013')
ON CONFLICT (id_acreditacion_norma, id_sector_iaf) WHERE deleted_at IS NULL DO NOTHING;

-- 9. Requisitos Clave Jerárquicos con LTREE (pre-sembrado determinista 06<->07 para ISO 9001, 14001, 45001 y 27001)
INSERT INTO public.requisito (id, id_norma, id_requisito_padre, codigo, ruta_materializada, explicit_code, external_key, es_obligatorio, obligatorio_origen) VALUES
    ('f0000000-0000-0000-0000-000000000004', 'e0000000-0000-0000-0000-000000009001', NULL, '4', '4'::ltree, FALSE, 'clause_iso_9001_2015_0006', FALSE, 'AUTO_TEXT'),
    ('f0000000-0000-0000-0000-000000000005', 'e0000000-0000-0000-0000-000000009001', NULL, '5', '5'::ltree, FALSE, 'clause_iso_9001_2015_0028', FALSE, 'AUTO_TEXT'),
    ('2dcad943-5229-48b1-858b-915d5c9fe55a', 'e0000000-0000-0000-0000-000000009001', NULL, '6', '6'::ltree, FALSE, 'clause_iso_9001_2015_0061', FALSE, 'AUTO_TEXT'),
    ('47efd30a-da93-4844-bf08-bd36daabe4a7', 'e0000000-0000-0000-0000-000000009001', NULL, '7', '7'::ltree, FALSE, 'clause_iso_9001_2015_0093', FALSE, 'AUTO_TEXT'),
    ('f0000000-0000-0000-0000-000000000008', 'e0000000-0000-0000-0000-000000009001', NULL, '8', '8'::ltree, FALSE, 'clause_iso_9001_2015_0152', FALSE, 'AUTO_TEXT'),
    ('6281baf8-4877-42fa-904e-9d7c9ff2bae9', 'e0000000-0000-0000-0000-000000009001', NULL, '9', '9'::ltree, FALSE, 'clause_iso_9001_2015_0280', FALSE, 'AUTO_TEXT'),
    ('4d3d662e-b0a9-407c-83be-fc5a3d2d586f', 'e0000000-0000-0000-0000-000000009001', NULL, '10', '10'::ltree, FALSE, 'clause_iso_9001_2015_0329', FALSE, 'AUTO_TEXT'),
    ('c00733fb-996e-4557-a51a-395bbaf76313', 'e0000000-0000-0000-0000-000000014001', NULL, '4', '4'::ltree, FALSE, 'clause_iso_14001_2015_0041', FALSE, 'AUTO_TEXT'),
    ('c90980bd-a90a-4449-a87b-580d43fa7955', 'e0000000-0000-0000-0000-000000014001', NULL, '5', '5'::ltree, FALSE, 'clause_iso_14001_2015_0054', FALSE, 'AUTO_TEXT'),
    ('350ea7ef-bde0-432b-8e07-e1eb4fff0967', 'e0000000-0000-0000-0000-000000014001', NULL, '6', '6'::ltree, FALSE, 'clause_iso_14001_2015_0074', FALSE, 'AUTO_TEXT'),
    ('ada8433f-4176-40bb-bf82-3e1f38995507', 'e0000000-0000-0000-0000-000000014001', NULL, '7', '7'::ltree, FALSE, 'clause_iso_14001_2015_0108', FALSE, 'AUTO_TEXT'),
    ('1c9e64a0-23e7-4e04-8558-436e378ec618', 'e0000000-0000-0000-0000-000000014001', NULL, '8', '8'::ltree, FALSE, 'clause_iso_14001_2015_0141', FALSE, 'AUTO_TEXT'),
    ('b39b80be-2051-4cda-a235-15142e8c7956', 'e0000000-0000-0000-0000-000000014001', NULL, '9', '9'::ltree, FALSE, 'clause_iso_14001_2015_0154', FALSE, 'AUTO_TEXT'),
    ('1d919a40-1ad2-4810-bd41-180e38aa9e28', 'e0000000-0000-0000-0000-000000014001', NULL, '10', '10'::ltree, FALSE, 'clause_iso_14001_2015_0192', FALSE, 'AUTO_TEXT'),
    ('8c19e682-9a09-4c92-9847-44b0bd2ddc2a', 'e0000000-0000-0000-0000-000000045001', NULL, '4', '4'::ltree, FALSE, 'clause_iso_45001_2018_0047', FALSE, 'AUTO_TEXT'),
    ('1916f2e2-ff7a-40ee-8a6e-dba8ba2b98da', 'e0000000-0000-0000-0000-000000045001', NULL, '5', '5'::ltree, FALSE, 'clause_iso_45001_2018_0058', FALSE, 'AUTO_TEXT'),
    ('9d8c5d63-ae58-49c7-a5e7-db43cea0530b', 'e0000000-0000-0000-0000-000000045001', NULL, '6', '6'::ltree, FALSE, 'clause_iso_45001_2018_0105', FALSE, 'AUTO_TEXT'),
    ('2d872fe5-41c3-4e19-8836-5f714e9b0c5d', 'e0000000-0000-0000-0000-000000045001', NULL, '7', '7'::ltree, FALSE, 'clause_iso_45001_2018_0169', FALSE, 'AUTO_TEXT'),
    ('f63fd9d8-e90f-4544-a462-4d6e06661a80', 'e0000000-0000-0000-0000-000000045001', NULL, '8', '8'::ltree, FALSE, 'clause_iso_45001_2018_0207', FALSE, 'AUTO_TEXT'),
    ('6535fb39-4de1-4f69-bb16-3bf9955c6e41', 'e0000000-0000-0000-0000-000000045001', NULL, '9', '9'::ltree, FALSE, 'clause_iso_45001_2018_0240', FALSE, 'AUTO_TEXT'),
    ('665411e0-cef2-435c-90d3-9c561652abf8', 'e0000000-0000-0000-0000-000000045001', NULL, '10', '10'::ltree, FALSE, 'clause_iso_45001_2018_0287', FALSE, 'AUTO_TEXT'),
    ('f1524420-7c57-4f1e-9401-7a282f1d755e', 'e0000000-0000-0000-0000-000000027001', NULL, '4', '4'::ltree, FALSE, 'clause_iso_27001_20222_0004', FALSE, 'AUTO_STRUCTURAL'),
    ('f6548a96-095d-42b4-9154-a96e1c1f960c', 'e0000000-0000-0000-0000-000000027001', NULL, '5', '5'::ltree, FALSE, 'clause_iso_27001_20222_0015', FALSE, 'AUTO_STRUCTURAL'),
    ('8559e8e1-45a4-4c53-8044-e2c72f1b36c7', 'e0000000-0000-0000-0000-000000027001', NULL, '6', '6'::ltree, FALSE, 'clause_iso_27001_20222_0036', FALSE, 'AUTO_STRUCTURAL'),
    ('873e158a-0888-4608-89ae-2a5e2109d79c', 'e0000000-0000-0000-0000-000000027001', NULL, '7', '7'::ltree, FALSE, 'clause_iso_27001_20222_0082', FALSE, 'AUTO_STRUCTURAL'),
    ('6fe76bb4-d757-40ba-85e3-f61089b26446', 'e0000000-0000-0000-0000-000000027001', NULL, '8', '8'::ltree, FALSE, 'clause_iso_27001_20222_0116', FALSE, 'AUTO_STRUCTURAL'),
    ('e7e45705-a9b4-4b67-9265-4e971dba0907', 'e0000000-0000-0000-0000-000000027001', NULL, '9', '9'::ltree, FALSE, 'clause_iso_27001_20222_0120', FALSE, 'AUTO_STRUCTURAL'),
    ('74dce637-802c-4e6d-a9ab-6ad516a8b4e1', 'e0000000-0000-0000-0000-000000027001', NULL, '10', '10'::ltree, FALSE, 'clause_iso_27001_20222_0153', FALSE, 'AUTO_STRUCTURAL')
ON CONFLICT (id_norma, codigo) WHERE deleted_at IS NULL DO UPDATE SET
    id_requisito_padre = EXCLUDED.id_requisito_padre,
    ruta_materializada = EXCLUDED.ruta_materializada,
    explicit_code = EXCLUDED.explicit_code,
    external_key = EXCLUDED.external_key,
    es_obligatorio = EXCLUDED.es_obligatorio,
    obligatorio_origen = EXCLUDED.obligatorio_origen,
    updated_at = NOW();

INSERT INTO public.requisito (id, id_norma, id_requisito_padre, codigo, ruta_materializada, explicit_code, external_key, es_obligatorio, obligatorio_origen) VALUES
    ('f0000000-0000-0000-0000-000000000041', 'e0000000-0000-0000-0000-000000009001', 'f0000000-0000-0000-0000-000000000004', '4.1', '4.4_1'::ltree, FALSE, 'clause_iso_9001_2015_0007', TRUE, 'AUTO_TEXT'),
    ('f0000000-0000-0000-0000-000000000042', 'e0000000-0000-0000-0000-000000009001', 'f0000000-0000-0000-0000-000000000004', '4.2', '4.4_2'::ltree, FALSE, 'clause_iso_9001_2015_0008', TRUE, 'AUTO_TEXT'),
    ('35dc2efc-9ded-4596-8374-fc34cc9846e5', 'e0000000-0000-0000-0000-000000009001', 'f0000000-0000-0000-0000-000000000004', '4.3', '4.4_3'::ltree, FALSE, 'clause_iso_9001_2015_0011', TRUE, 'AUTO_TEXT'),
    ('31dc28b0-2a89-4182-99eb-fc20c8984099', 'e0000000-0000-0000-0000-000000009001', 'f0000000-0000-0000-0000-000000000004', '4.4', '4.4_4'::ltree, FALSE, 'clause_iso_9001_2015_0015', FALSE, 'AUTO_TEXT'),
    ('f0000000-0000-0000-0000-000000000051', 'e0000000-0000-0000-0000-000000009001', 'f0000000-0000-0000-0000-000000000005', '5.1', '5.5_1'::ltree, FALSE, 'clause_iso_9001_2015_0029', FALSE, 'AUTO_TEXT'),
    ('b5d02c89-71e9-4c9b-a33a-8c1344a43cc0', 'e0000000-0000-0000-0000-000000009001', 'f0000000-0000-0000-0000-000000000005', '5.2', '5.5_2'::ltree, FALSE, 'clause_iso_9001_2015_0045', FALSE, 'AUTO_TEXT'),
    ('c1d27e04-2065-4466-9003-ac7c48a20475', 'e0000000-0000-0000-0000-000000009001', 'f0000000-0000-0000-0000-000000000005', '5.3', '5.5_3'::ltree, FALSE, 'clause_iso_9001_2015_0055', TRUE, 'AUTO_TEXT'),
    ('2ecadad6-974a-4c7c-ac53-3b6a5b9fe3c7', 'e0000000-0000-0000-0000-000000009001', '2dcad943-5229-48b1-858b-915d5c9fe55a', '6.1', '6.6_1'::ltree, FALSE, 'clause_iso_9001_2015_0062', FALSE, 'AUTO_TEXT'),
    ('2fcd1b00-a8b4-4f46-b445-98e4da9cda1d', 'e0000000-0000-0000-0000-000000009001', '2dcad943-5229-48b1-858b-915d5c9fe55a', '6.2', '6.6_2'::ltree, FALSE, 'clause_iso_9001_2015_0073', FALSE, 'AUTO_TEXT'),
    ('38ed7cd6-d7fc-4a78-be34-b47e49aed1fb', 'e0000000-0000-0000-0000-000000009001', '2dcad943-5229-48b1-858b-915d5c9fe55a', '6.3', '6.6_3'::ltree, FALSE, 'clause_iso_9001_2015_0088', TRUE, 'AUTO_TEXT'),
    ('42efcb2b-b1a4-4195-849a-2035d7abdfee', 'e0000000-0000-0000-0000-000000009001', '47efd30a-da93-4844-bf08-bd36daabe4a7', '7.1', '7.7_1'::ltree, FALSE, 'clause_iso_9001_2015_0094', FALSE, 'AUTO_TEXT'),
    ('a26efba3-e5bc-412d-81ca-4e0d60057a3e', 'e0000000-0000-0000-0000-000000009001', '47efd30a-da93-4844-bf08-bd36daabe4a7', '7.2', '7.7_2'::ltree, FALSE, 'clause_iso_9001_2015_0119', TRUE, 'AUTO_TEXT'),
    ('1f767c2f-7773-411d-8ad2-52d1db087a76', 'e0000000-0000-0000-0000-000000009001', '47efd30a-da93-4844-bf08-bd36daabe4a7', '7.3', '7.7_3'::ltree, FALSE, 'clause_iso_9001_2015_0124', TRUE, 'AUTO_TEXT'),
    ('227680e8-bc54-4fbe-8165-d288e8088eed', 'e0000000-0000-0000-0000-000000009001', '47efd30a-da93-4844-bf08-bd36daabe4a7', '7.4', '7.7_4'::ltree, FALSE, 'clause_iso_9001_2015_0129', TRUE, 'AUTO_TEXT'),
    ('b2739201-ce87-4e47-ac0f-192be80acd84', 'e0000000-0000-0000-0000-000000009001', '47efd30a-da93-4844-bf08-bd36daabe4a7', '7.5', '7.7_5'::ltree, FALSE, 'clause_iso_9001_2015_0135', FALSE, 'AUTO_TEXT'),
    ('2478c2a5-c27a-48f7-aca8-ebcbee0f5424', 'e0000000-0000-0000-0000-000000009001', 'f0000000-0000-0000-0000-000000000008', '8.1', '8.8_1'::ltree, FALSE, 'clause_iso_9001_2015_0153', TRUE, 'AUTO_TEXT'),
    ('b480611a-c93b-4458-a918-93d656123673', 'e0000000-0000-0000-0000-000000009001', 'f0000000-0000-0000-0000-000000000008', '8.2', '8.8_2'::ltree, FALSE, 'clause_iso_9001_2015_0163', FALSE, 'AUTO_TEXT'),
    ('a15db0ef-de9f-45a1-a680-ce2d6916d18a', 'e0000000-0000-0000-0000-000000009001', 'f0000000-0000-0000-0000-000000000008', '8.3', '8.8_3'::ltree, FALSE, 'clause_iso_9001_2015_0186', FALSE, 'AUTO_TEXT'),
    ('5c72a6fc-5518-41ea-971f-9cac1e0b8629', 'e0000000-0000-0000-0000-000000009001', 'f0000000-0000-0000-0000-000000000008', '8.4', '8.8_4'::ltree, FALSE, 'clause_iso_9001_2015_0222', FALSE, 'AUTO_TEXT'),
    ('f0000000-0000-0000-0000-000000000085', 'e0000000-0000-0000-0000-000000009001', 'f0000000-0000-0000-0000-000000000008', '8.5', '8.8_5'::ltree, FALSE, 'clause_iso_9001_2015_0244', FALSE, 'AUTO_TEXT'),
    ('d87c648c-8cba-4522-91ce-4334b2156981', 'e0000000-0000-0000-0000-000000009001', 'f0000000-0000-0000-0000-000000000008', '8.6', '8.8_6'::ltree, FALSE, 'clause_iso_9001_2015_0266', TRUE, 'AUTO_TEXT'),
    ('df7c6f91-d88e-439f-8582-105fab155e7c', 'e0000000-0000-0000-0000-000000009001', 'f0000000-0000-0000-0000-000000000008', '8.7', '8.8_7'::ltree, FALSE, 'clause_iso_9001_2015_0269', FALSE, 'AUTO_TEXT'),
    ('6381bc8b-9b89-4865-a74c-d1f99ef2b956', 'e0000000-0000-0000-0000-000000009001', '6281baf8-4877-42fa-904e-9d7c9ff2bae9', '9.1', '9.9_1'::ltree, FALSE, 'clause_iso_9001_2015_0281', FALSE, 'AUTO_TEXT'),
    ('6a840627-c8e1-4f99-a6ab-4c019ff07c52', 'e0000000-0000-0000-0000-000000009001', '6281baf8-4877-42fa-904e-9d7c9ff2bae9', '9.2', '9.9_2'::ltree, FALSE, 'clause_iso_9001_2015_0296', FALSE, 'AUTO_TEXT'),
    ('c942a690-6bbd-46c2-b165-62843931cf51', 'e0000000-0000-0000-0000-000000009001', '6281baf8-4877-42fa-904e-9d7c9ff2bae9', '9.3', '9.9_3'::ltree, FALSE, 'clause_iso_9001_2015_0309', FALSE, 'AUTO_TEXT'),
    ('403b1320-7e53-4abe-b141-6fc44a2fab7d', 'e0000000-0000-0000-0000-000000009001', '4d3d662e-b0a9-407c-83be-fc5a3d2d586f', '10.1', '10.10_1'::ltree, FALSE, 'clause_iso_9001_2015_0330', TRUE, 'AUTO_TEXT'),
    ('443b196c-0af0-49aa-930e-26b0462fa531', 'e0000000-0000-0000-0000-000000009001', '4d3d662e-b0a9-407c-83be-fc5a3d2d586f', '10.2', '10.10_2'::ltree, FALSE, 'clause_iso_9001_2015_0334', FALSE, 'AUTO_TEXT'),
    ('444a23f6-12b1-4790-bccb-0b9abe2a51eb', 'e0000000-0000-0000-0000-000000009001', '4d3d662e-b0a9-407c-83be-fc5a3d2d586f', '10.3', '10.10_3'::ltree, FALSE, 'clause_iso_9001_2015_0350', TRUE, 'AUTO_TEXT'),
    ('c107358e-ea84-4fe6-a2e4-9534bbf764a6', 'e0000000-0000-0000-0000-000000014001', 'c00733fb-996e-4557-a51a-395bbaf76313', '4.1', '4.4_1'::ltree, FALSE, 'clause_iso_14001_2015_0042', TRUE, 'AUTO_TEXT'),
    ('c2073721-ac24-4ee1-adcd-d191bcf76639', 'e0000000-0000-0000-0000-000000014001', 'c00733fb-996e-4557-a51a-395bbaf76313', '4.2', '4.4_2'::ltree, FALSE, 'clause_iso_14001_2015_0043', TRUE, 'AUTO_TEXT'),
    ('c6073d6d-ea32-439d-9df3-ff5dc0f76c85', 'e0000000-0000-0000-0000-000000014001', 'c00733fb-996e-4557-a51a-395bbaf76313', '4.3', '4.4_3'::ltree, FALSE, 'clause_iso_14001_2015_0047', TRUE, 'AUTO_TEXT'),
    ('c20975b8-3e5c-4e10-9998-0a0e3cfa6e50', 'e0000000-0000-0000-0000-000000014001', 'c00733fb-996e-4557-a51a-395bbaf76313', '4.4', '4.4_4'::ltree, FALSE, 'clause_iso_14001_2015_0053', TRUE, 'AUTO_TEXT'),
    ('c8097f2a-9f38-4a8e-b14e-5a5042fa77c2', 'e0000000-0000-0000-0000-000000014001', 'c90980bd-a90a-4449-a87b-580d43fa7955', '5.1', '5.5_1'::ltree, FALSE, 'clause_iso_14001_2015_0055', TRUE, 'AUTO_TEXT'),
    ('c80bbdc1-840a-42b5-9ae8-040542fcb659', 'e0000000-0000-0000-0000-000000014001', 'c90980bd-a90a-4449-a87b-580d43fa7955', '5.2', '5.5_2'::ltree, FALSE, 'clause_iso_14001_2015_0065', TRUE, 'AUTO_TEXT'),
    ('300ea010-4a0f-4634-a389-d33a4aff0188', 'e0000000-0000-0000-0000-000000014001', 'c90980bd-a90a-4449-a87b-580d43fa7955', '5.3', '5.5_3'::ltree, FALSE, 'clause_iso_14001_2015_0071', TRUE, 'AUTO_TEXT'),
    ('340ea65c-c6ab-48f0-a8b6-606e4eff07d4', 'e0000000-0000-0000-0000-000000014001', '350ea7ef-bde0-432b-8e07-e1eb4fff0967', '6.1', '6.6_1'::ltree, FALSE, 'clause_iso_14001_2015_0075', FALSE, 'AUTO_TEXT'),
    ('47ffbb4e-79bd-4e02-a043-1a84c317c356', 'e0000000-0000-0000-0000-000000014001', '350ea7ef-bde0-432b-8e07-e1eb4fff0967', '6.2', '6.6_2'::ltree, FALSE, 'clause_iso_14001_2015_0095', FALSE, 'AUTO_TEXT'),
    ('aca841ac-3699-4400-9c84-d21237995374', 'e0000000-0000-0000-0000-000000014001', 'ada8433f-4176-40bb-bf82-3e1f38995507', '7.1', '7.7_1'::ltree, FALSE, 'clause_iso_14001_2015_0109', TRUE, 'AUTO_TEXT'),
    ('afa607ce-84df-4982-b0bd-cc0caa9636e6', 'e0000000-0000-0000-0000-000000014001', 'ada8433f-4176-40bb-bf82-3e1f38995507', '7.2', '7.7_2'::ltree, FALSE, 'clause_iso_14001_2015_0110', TRUE, 'AUTO_TEXT'),
    ('b4a60fad-bf8b-4211-bb4d-cbf5af963ec5', 'e0000000-0000-0000-0000-000000014001', 'ada8433f-4176-40bb-bf82-3e1f38995507', '7.3', '7.7_3'::ltree, FALSE, 'clause_iso_14001_2015_0115', TRUE, 'AUTO_TEXT'),
    ('29a2f645-006b-4d49-9b67-4ff1c494213d', 'e0000000-0000-0000-0000-000000014001', 'ada8433f-4176-40bb-bf82-3e1f38995507', '7.4', '7.7_4'::ltree, FALSE, 'clause_iso_14001_2015_0120', FALSE, 'AUTO_TEXT'),
    ('23a0ae3c-2598-41c0-b7e1-46cebe91d934', 'e0000000-0000-0000-0000-000000014001', 'ada8433f-4176-40bb-bf82-3e1f38995507', '7.5', '7.7_5'::ltree, FALSE, 'clause_iso_14001_2015_0130', FALSE, 'AUTO_TEXT'),
    ('1f9e6959-2151-4f79-8881-1d213a8ecad1', 'e0000000-0000-0000-0000-000000014001', '1c9e64a0-23e7-4e04-8558-436e378ec618', '8.1', '8.8_1'::ltree, FALSE, 'clause_iso_14001_2015_0142', TRUE, 'AUTO_TEXT'),
    ('229e6e12-8dfb-492a-95dd-7d303d8ecf8a', 'e0000000-0000-0000-0000-000000014001', '1c9e64a0-23e7-4e04-8558-436e378ec618', '8.2', '8.8_2'::ltree, FALSE, 'clause_iso_14001_2015_0147', TRUE, 'AUTO_TEXT'),
    ('b49b8251-7363-4245-a26e-7af12f8c7ae9', 'e0000000-0000-0000-0000-000000014001', 'b39b80be-2051-4cda-a235-15142e8c7956', '9.1', '9.9_1'::ltree, FALSE, 'clause_iso_14001_2015_0155', FALSE, 'AUTO_TEXT'),
    ('b3994227-ca76-4c6f-89a0-94232e8a3abf', 'e0000000-0000-0000-0000-000000014001', 'b39b80be-2051-4cda-a235-15142e8c7956', '9.2', '9.9_2'::ltree, FALSE, 'clause_iso_14001_2015_0166', FALSE, 'AUTO_TEXT'),
    ('b197006a-6679-4b62-90cc-936c2c87f902', 'e0000000-0000-0000-0000-000000014001', 'b39b80be-2051-4cda-a235-15142e8c7956', '9.3', '9.9_3'::ltree, FALSE, 'clause_iso_14001_2015_0176', TRUE, 'AUTO_TEXT'),
    ('1e919bd3-0c61-4fcb-ba91-568b39aa9fbb', 'e0000000-0000-0000-0000-000000014001', '1d919a40-1ad2-4810-bd41-180e38aa9e28', '10.1', '10.10_1'::ltree, FALSE, 'clause_iso_14001_2015_0193', TRUE, 'AUTO_TEXT'),
    ('2391a3b2-7bae-448e-94f7-68503eaaa79a', 'e0000000-0000-0000-0000-000000014001', '1d919a40-1ad2-4810-bd41-180e38aa9e28', '10.2', '10.10_2'::ltree, FALSE, 'clause_iso_14001_2015_0194', TRUE, 'AUTO_TEXT'),
    ('922dcb09-e643-4f59-9b20-8fc9ad6dde61', 'e0000000-0000-0000-0000-000000014001', '1d919a40-1ad2-4810-bd41-180e38aa9e28', '10.3', '10.10_3'::ltree, FALSE, 'clause_iso_14001_2015_0205', TRUE, 'AUTO_TEXT'),
    ('8f19eb3b-ff28-4d0f-b0fe-a2d3b02dc7b3', 'e0000000-0000-0000-0000-000000045001', '8c19e682-9a09-4c92-9847-44b0bd2ddc2a', '4.1', '4.4_1'::ltree, FALSE, 'clause_iso_45001_2018_0048', TRUE, 'AUTO_TEXT'),
    ('8e19e9a8-76ff-4cc4-b67c-d5b6af2dc620', 'e0000000-0000-0000-0000-000000045001', '8c19e682-9a09-4c92-9847-44b0bd2ddc2a', '4.2', '4.4_2'::ltree, FALSE, 'clause_iso_45001_2018_0049', TRUE, 'AUTO_TEXT'),
    ('2016fde7-66a9-4787-8b00-9db7b12b8aaf', 'e0000000-0000-0000-0000-000000045001', '8c19e682-9a09-4c92-9847-44b0bd2ddc2a', '4.3', '4.4_3'::ltree, FALSE, 'clause_iso_45001_2018_0053', TRUE, 'AUTO_TEXT'),
    ('1c16f79b-e36c-4cb3-9e8f-563bad2b8463', 'e0000000-0000-0000-0000-000000045001', '8c19e682-9a09-4c92-9847-44b0bd2ddc2a', '4.4', '4.4_4'::ltree, FALSE, 'clause_iso_45001_2018_0057', TRUE, 'AUTO_TEXT'),
    ('1a16f475-0621-4129-b9f3-ae85bb2b9a6d', 'e0000000-0000-0000-0000-000000045001', '1916f2e2-ff7a-40ee-8a6e-dba8ba2b98da', '5.1', '5.5_1'::ltree, FALSE, 'clause_iso_45001_2018_0059', TRUE, 'AUTO_TEXT'),
    ('18127421-6367-4bf9-8376-e95529263769', 'e0000000-0000-0000-0000-000000045001', '1916f2e2-ff7a-40ee-8a6e-dba8ba2b98da', '5.2', '5.5_2'::ltree, FALSE, 'clause_iso_45001_2018_0073', TRUE, 'AUTO_TEXT'),
    ('8f0f5ddf-d38e-47d3-b1f3-f72f404b2c77', 'e0000000-0000-0000-0000-000000045001', '1916f2e2-ff7a-40ee-8a6e-dba8ba2b98da', '5.3', '5.5_3'::ltree, FALSE, 'clause_iso_45001_2018_0080', TRUE, 'AUTO_TEXT'),
    ('900f5f72-3201-4022-bd5c-d9d8414b2e0a', 'e0000000-0000-0000-0000-000000045001', '1916f2e2-ff7a-40ee-8a6e-dba8ba2b98da', '5.4', '5.5_4'::ltree, FALSE, 'clause_iso_45001_2018_0083', TRUE, 'AUTO_TEXT'),
    ('9e8c5ef6-fcf2-4856-b1dd-0cfccfa0549e', 'e0000000-0000-0000-0000-000000045001', '9d8c5d63-ae58-49c7-a5e7-db43cea0530b', '6.1', '6.6_1'::ltree, FALSE, 'clause_iso_45001_2018_0106', FALSE, 'AUTO_TEXT'),
    ('2d84f14e-7c2b-4b62-8f17-ce643e98b496', 'e0000000-0000-0000-0000-000000045001', '9d8c5d63-ae58-49c7-a5e7-db43cea0530b', '6.2', '6.6_2'::ltree, FALSE, 'clause_iso_45001_2018_0151', FALSE, 'AUTO_TEXT'),
    ('1a895093-2943-48c7-8412-4c27cb9e0fbb', 'e0000000-0000-0000-0000-000000045001', '2d872fe5-41c3-4e19-8836-5f714e9b0c5d', '7.1', '7.7_1'::ltree, FALSE, 'clause_iso_45001_2018_0170', TRUE, 'AUTO_TEXT'),
    ('19894f00-811a-461c-a5f3-9abaca9e0e28', 'e0000000-0000-0000-0000-000000045001', '2d872fe5-41c3-4e19-8836-5f714e9b0c5d', '7.2', '7.7_2'::ltree, FALSE, 'clause_iso_45001_2018_0171', TRUE, 'AUTO_TEXT'),
    ('20895a05-48be-414d-ae49-01a1d19e192d', 'e0000000-0000-0000-0000-000000045001', '2d872fe5-41c3-4e19-8836-5f714e9b0c5d', '7.3', '7.7_3'::ltree, FALSE, 'clause_iso_45001_2018_0176', TRUE, 'AUTO_TEXT'),
    ('33782ecd-f75e-4255-ac2f-147dc4b3cb05', 'e0000000-0000-0000-0000-000000045001', '2d872fe5-41c3-4e19-8836-5f714e9b0c5d', '7.4', '7.7_4'::ltree, FALSE, 'clause_iso_45001_2018_0183', FALSE, 'AUTO_TEXT'),
    ('307a68ab-17e8-4dcb-a338-40ab41b6ce63', 'e0000000-0000-0000-0000-000000045001', '2d872fe5-41c3-4e19-8836-5f714e9b0c5d', '7.5', '7.7_5'::ltree, FALSE, 'clause_iso_45001_2018_0196', FALSE, 'AUTO_TEXT'),
    ('f53fd845-7f2c-4cdd-98ae-7b351566321d', 'e0000000-0000-0000-0000-000000045001', 'f63fd9d8-e90f-4544-a462-4d6e06661a80', '8.1', '8.8_1'::ltree, FALSE, 'clause_iso_45001_2018_0208', FALSE, 'AUTO_TEXT'),
    ('6142c0e0-56b9-4194-8296-0712916933e8', 'e0000000-0000-0000-0000-000000045001', 'f63fd9d8-e90f-4544-a462-4d6e06661a80', '8.2', '8.8_2'::ltree, FALSE, 'clause_iso_45001_2018_0232', TRUE, 'AUTO_TEXT'),
    ('6435f9a6-473d-422e-a418-077c945c6cae', 'e0000000-0000-0000-0000-000000045001', '6535fb39-4de1-4f69-bb16-3bf9955c6e41', '9.1', '9.9_1'::ltree, FALSE, 'clause_iso_45001_2018_0241', FALSE, 'AUTO_TEXT'),
    ('6633be35-e037-4319-9a57-d5f5965a313d', 'e0000000-0000-0000-0000-000000045001', '6535fb39-4de1-4f69-bb16-3bf9955c6e41', '9.2', '9.9_2'::ltree, FALSE, 'clause_iso_45001_2018_0257', FALSE, 'AUTO_TEXT'),
    ('eb390cc2-2926-49a2-9e90-82349b5eb64a', 'e0000000-0000-0000-0000-000000045001', '6535fb39-4de1-4f69-bb16-3bf9955c6e41', '9.3', '9.9_3'::ltree, FALSE, 'clause_iso_45001_2018_0270', TRUE, 'AUTO_TEXT'),
    ('7554297d-bda0-4a85-a27e-2b8d1552aa65', 'e0000000-0000-0000-0000-000000045001', '665411e0-cef2-435c-90d3-9c561652abf8', '10.1', '10.10_1'::ltree, FALSE, 'clause_iso_45001_2018_0288', TRUE, 'AUTO_TEXT'),
    ('745427ea-8160-411a-ab51-2dd01452a8d2', 'e0000000-0000-0000-0000-000000045001', '665411e0-cef2-435c-90d3-9c561652abf8', '10.2', '10.10_2'::ltree, FALSE, 'clause_iso_45001_2018_0289', TRUE, 'AUTO_TEXT'),
    ('7ca87b8c-8276-4f88-819c-08e2acceee94', 'e0000000-0000-0000-0000-000000045001', '665411e0-cef2-435c-90d3-9c561652abf8', '10.3', '10.10_3'::ltree, FALSE, 'clause_iso_45001_2018_0302', TRUE, 'AUTO_TEXT'),
    ('f25245b3-82fd-4f59-8386-4d05301d76f1', 'e0000000-0000-0000-0000-000000027001', 'f1524420-7c57-4f1e-9401-7a282f1d755e', '4.1', '4.4_1'::ltree, FALSE, 'clause_iso_27001_20222_0005', TRUE, 'AUTO_STRUCTURAL'),
    ('f3524746-9bb2-4364-b15a-86322d1d7238', 'e0000000-0000-0000-0000-000000027001', 'f1524420-7c57-4f1e-9401-7a282f1d755e', '4.2', '4.4_2'::ltree, FALSE, 'clause_iso_27001_20222_0006', FALSE, 'AUTO_STRUCTURAL'),
    ('fb549275-7d2e-4fab-aa46-cda7191f9153', 'e0000000-0000-0000-0000-000000027001', 'f1524420-7c57-4f1e-9401-7a282f1d755e', '4.3', '4.4_3'::ltree, FALSE, 'clause_iso_27001_20222_0010', FALSE, 'AUTO_STRUCTURAL'),
    ('f7548c29-7b67-4a7f-b6a6-2aeb1d1f979f', 'e0000000-0000-0000-0000-000000027001', 'f1524420-7c57-4f1e-9401-7a282f1d755e', '4.4', '4.4_4'::ltree, FALSE, 'clause_iso_27001_20222_0014', TRUE, 'AUTO_STRUCTURAL'),
    ('f5548903-f321-44a9-947d-83211f1f9ac5', 'e0000000-0000-0000-0000-000000027001', 'f6548a96-095d-42b4-9154-a96e1c1f960c', '5.1', '5.5_1'::ltree, FALSE, 'clause_iso_27001_20222_0016', FALSE, 'AUTO_STRUCTURAL'),
    ('0656e25d-58bc-41d7-ab8e-8bd7ac1829f7', 'e0000000-0000-0000-0000-000000027001', 'f6548a96-095d-42b4-9154-a96e1c1f960c', '5.2', '5.5_2'::ltree, FALSE, 'clause_iso_27001_20222_0025', FALSE, 'AUTO_STRUCTURAL'),
    ('8859ed9a-20b7-447c-8236-530e2a1b2ee8', 'e0000000-0000-0000-0000-000000027001', 'f6548a96-095d-42b4-9154-a96e1c1f960c', '5.3', '5.5_3'::ltree, FALSE, 'clause_iso_27001_20222_0033', FALSE, 'AUTO_STRUCTURAL'),
    ('8459e74e-d372-4218-8d2c-a75a2e1b3534', 'e0000000-0000-0000-0000-000000027001', '8559e8e1-45a4-4c53-8044-e2c72f1b36c7', '6.1', '6.6_1'::ltree, FALSE, 'clause_iso_27001_20222_0037', FALSE, 'AUTO_STRUCTURAL'),
    ('814d16a2-3277-49ac-9dd5-1f2aa722af74', 'e0000000-0000-0000-0000-000000027001', '8559e8e1-45a4-4c53-8044-e2c72f1b36c7', '6.2', '6.6_2'::ltree, FALSE, 'clause_iso_27001_20222_0068', FALSE, 'AUTO_STRUCTURAL'),
    ('863e13f7-32f3-4b5d-a82f-fbd12409dc55', 'e0000000-0000-0000-0000-000000027001', '8559e8e1-45a4-4c53-8044-e2c72f1b36c7', '6.3', '6.6_3'::ltree, FALSE, 'clause_iso_27001_20222_0081', TRUE, 'AUTO_STRUCTURAL'),
    ('883e171d-778b-40c3-b2db-829b2209d92f', 'e0000000-0000-0000-0000-000000027001', '873e158a-0888-4608-89ae-2a5e2109d79c', '7.1', '7.7_1'::ltree, FALSE, 'clause_iso_27001_20222_0083', TRUE, 'AUTO_STRUCTURAL'),
    ('813e0c18-3343-44a6-9a9f-27601f09d476', 'e0000000-0000-0000-0000-000000027001', '873e158a-0888-4608-89ae-2a5e2109d79c', '7.2', '7.7_2'::ltree, FALSE, 'clause_iso_27001_20222_0084', FALSE, 'AUTO_STRUCTURAL'),
    ('7e3e075f-73e8-4d15-b0b8-dc792c09e8ed', 'e0000000-0000-0000-0000-000000027001', '873e158a-0888-4608-89ae-2a5e2109d79c', '7.3', '7.7_3'::ltree, FALSE, 'clause_iso_27001_20222_0089', FALSE, 'AUTO_STRUCTURAL'),
    ('08411f34-4951-4de2-9b08-a5282a0c245e', 'e0000000-0000-0000-0000-000000027001', '873e158a-0888-4608-89ae-2a5e2109d79c', '7.4', '7.7_4'::ltree, FALSE, 'clause_iso_27001_20222_0093', FALSE, 'AUTO_STRUCTURAL'),
    ('03411755-91f7-4f8b-9b9a-6737210c1633', 'e0000000-0000-0000-0000-000000027001', '873e158a-0888-4608-89ae-2a5e2109d79c', '7.5', '7.7_5'::ltree, FALSE, 'clause_iso_27001_20222_0098', FALSE, 'AUTO_STRUCTURAL'),
    ('70e76d47-111e-4425-9e6c-d1cd8ab265d9', 'e0000000-0000-0000-0000-000000027001', '6fe76bb4-d757-40ba-85e3-f61089b26446', '8.1', '8.8_1'::ltree, FALSE, 'clause_iso_27001_20222_0117', TRUE, 'AUTO_STRUCTURAL'),
    ('65e75bf6-f302-4c7c-a763-e19693b27404', 'e0000000-0000-0000-0000-000000027001', '6fe76bb4-d757-40ba-85e3-f61089b26446', '8.2', '8.8_2'::ltree, FALSE, 'clause_iso_27001_20222_0118', TRUE, 'AUTO_STRUCTURAL'),
    ('66e75d89-9b2b-4f27-bdd9-c33394b27597', 'e0000000-0000-0000-0000-000000027001', '6fe76bb4-d757-40ba-85e3-f61089b26446', '8.3', '8.8_3'::ltree, FALSE, 'clause_iso_27001_20222_0119', TRUE, 'AUTO_STRUCTURAL'),
    ('e6e45572-1ad7-4dbc-b36f-d72a1cba0774', 'e0000000-0000-0000-0000-000000027001', 'e7e45705-a9b4-4b67-9265-4e971dba0907', '9.1', '9.9_1'::ltree, FALSE, 'clause_iso_27001_20222_0121', FALSE, 'AUTO_STRUCTURAL'),
    ('efe4639d-ea09-495f-a820-871f15b9fc6f', 'e0000000-0000-0000-0000-000000027001', 'e7e45705-a9b4-4b67-9265-4e971dba0907', '9.2', '9.9_2'::ltree, FALSE, 'clause_iso_27001_20222_0128', FALSE, 'AUTO_STRUCTURAL'),
    ('e9e21b94-eafb-40fe-9cd3-02048fb6eae6', 'e0000000-0000-0000-0000-000000027001', 'e7e45705-a9b4-4b67-9265-4e971dba0907', '9.3', '9.9_3'::ltree, FALSE, 'clause_iso_27001_20222_0138', FALSE, 'AUTO_STRUCTURAL'),
    ('71dce17e-9fed-4ebc-a16f-065617a8b674', 'e0000000-0000-0000-0000-000000027001', '74dce637-802c-4e6d-a9ab-6ad516a8b4e1', '10.1', '10.10_1'::ltree, FALSE, 'clause_iso_27001_20222_0154', TRUE, 'AUTO_STRUCTURAL'),
    ('72dce311-2ec9-4c67-af1f-faf318a8b807', 'e0000000-0000-0000-0000-000000027001', '74dce637-802c-4e6d-a9ab-6ad516a8b4e1', '10.2', '10.10_2'::ltree, FALSE, 'clause_iso_27001_20222_0155', FALSE, 'AUTO_STRUCTURAL')
ON CONFLICT (id_norma, codigo) WHERE deleted_at IS NULL DO UPDATE SET
    id_requisito_padre = EXCLUDED.id_requisito_padre,
    ruta_materializada = EXCLUDED.ruta_materializada,
    explicit_code = EXCLUDED.explicit_code,
    external_key = EXCLUDED.external_key,
    es_obligatorio = EXCLUDED.es_obligatorio,
    obligatorio_origen = EXCLUDED.obligatorio_origen,
    updated_at = NOW();

-- 10. Auditores y Matriz de Competencias Reales (1 tester 3333... + 47 auditores reales de public/Auditores.csv - Paso 1.2)
-- Calibración Paso 1.2: CONG-IND-01, CONG-CYB-01 y CONG-ALM-01 preservan sus asignaciones operativas;
-- Leonardo Antonio Rojas Gómez (1000...0004) y Keyla Cristina Soteldo de Páez (1000...0001) poseen ISO 45001:2018 real sin Sector 13
-- preservando la brecha sectorial IAF de LABCENTRO (AUD-FAR-2026-001) asistida por Experto Técnico (Dra. Sofía Quintero).
INSERT INTO public.auditor (
    id, nombre, siglas, cedula_identidad, profesion, esquemas_complementarios,
    anio_actualizacion_normas, sistema_gestion_secundario,
    ultima_evaluacion_in_situ_texto, proxima_evaluacion_in_situ_texto,
    ultima_evaluacion_in_situ_fecha, proxima_evaluacion_in_situ_fecha,
    sin_registro_evaluacion, sector_area_evaluado_texto, observaciones_evaluacion,
    anio_actualizacion_sectores, observacion_sectores
) VALUES
    ('33333333-3333-3333-3333-333333333333', 'Auditor de Prueba', 'TEST', NULL, 'Auditor Técnico de Plataforma', NULL, 2024, NULL, NULL, NULL, NULL, NULL, TRUE, NULL, 'Cuenta de pruebas RBAC', NULL, NULL),
    ('10000000-0000-0000-0000-000000000001', 'Keyla Cristina Soteldo de Páez', 'KS', '4165827', 'INGENIERO METALÚRGICO', NULL, 2021, NULL, '01/09/2024', '01/09/2027', '2024-09-01'::DATE, '2027-09-01'::DATE, FALSE, '33 / 33.18', NULL, NULL, NULL),
    ('10000000-0000-0000-0000-000000000002', 'Félix Horacio Rojas Machado', 'FR', '2995963', 'INGENIERO QUÍMICO', NULL, 2020, NULL, 'may-15 / nov-24', 'may-18 / nov-27', '2024-11-01'::DATE, '2027-11-01'::DATE, FALSE, '4', NULL, NULL, NULL),
    ('10000000-0000-0000-0000-000000000003', 'José Ramón Polo Faría', 'JRP', '5684384', 'INGENIERO INDUSTRIAL', NULL, 2020, NULL, '01/11/2023', '01/11/2026', '2023-11-01'::DATE, '2026-11-01'::DATE, FALSE, '34 / 34.1', 'SECTOR 9 Y 38 CON EXPERTO TÉCNICO', NULL, 'Sector 9 y 38 con Experto tecnico.'),
    ('10000000-0000-0000-0000-000000000004', 'Leonardo Antonio Rojas Gómez', 'LR', '5365320', 'INGENIERO QUÍMICO', NULL, 2021, NULL, '01/08/2021', '01/08/2024', '2021-08-01'::DATE, '2024-08-01'::DATE, FALSE, '3 / 3.1', NULL, NULL, NULL),
    ('10000000-0000-0000-0000-000000000005', 'Nordy Armando Fuentes', 'NF', '5884819', 'INGENIERO INDUSTRIAL', NULL, 2023, NULL, '01/08/2022', '01/08/2025', '2022-08-01'::DATE, '2025-08-01'::DATE, FALSE, '7 / 7.1', 'SECTOR 4, 5 Y 38  CON EXP TÉCNICO', NULL, 'SECTOR 4, 5 y 38  CON EXP TECNICO'),
    ('10000000-0000-0000-0000-000000000006', 'Manuel Arturo Fernández Martínez', 'MF', '8417973', 'INGENIERO MECÁNICO', NULL, 2023, NULL, '01/09/2024', '01/09/2027', '2024-09-01'::DATE, '2027-09-01'::DATE, FALSE, '34 / SERVICIO DE BUCEO', NULL, NULL, NULL),
    ('10000000-0000-0000-0000-000000000007', 'Nelson Rafael Arteaga Quevedo', 'NA', '5584108', 'INGENIERO QUÍMICO', NULL, 2020, NULL, '01/08/2014', '01/08/2017', '2014-08-01'::DATE, '2017-08-01'::DATE, FALSE, NULL, NULL, NULL, 'Acompañado con experto técnico para el  sector 13'),
    ('10000000-0000-0000-0000-000000000008', 'Yuliber Alejandra Blanco Díaz', 'YB', '12500820', 'INGENIERO EN SISTEMAS DE CALIDAD Y AMBIENTE / TSU EN QUÍMICA', NULL, 2024, NULL, '01/05/2023', '01/05/2026', '2023-05-01'::DATE, '2026-05-01'::DATE, FALSE, '12 / 12.1', 'CONDICIONADA A IR CON EXPERTO TÉCNICO EN SECTOR 9', NULL, 'Acompañada con experto tecnico en sector 7,  9 y 13'),
    ('10000000-0000-0000-0000-000000000009', 'Edgar José Cachutt Márquez', 'ECH', '3395125', 'INGENIERO CIVIL', NULL, 2020, NULL, '01/09/2019', '01/09/2022', '2019-09-01'::DATE, '2022-09-01'::DATE, FALSE, '34 / 34.1', 'SECTOR 15 CON EXP TÉCNICO', NULL, 'SECTOR 15  CON EXP TECNICO'),
    ('10000000-0000-0000-0000-000000000010', 'Ismael Enrique Díaz Valera', 'ID', '6965204', 'INGENIERO ELECTRICISTA', NULL, 2022, NULL, '01/09/2019', '01/09/2022', '2019-09-01'::DATE, '2022-09-01'::DATE, FALSE, '34 / 34.1', NULL, NULL, NULL),
    ('10000000-0000-0000-0000-000000000011', 'Ana Karina Sanchez', 'AKS', '10337391', 'LICENCIADA EN ADMINISTRACIÓN', NULL, 2024, NULL, '01/10/2024', '01/10/2027', '2024-10-01'::DATE, '2027-10-01'::DATE, FALSE, '31 / 31.6', NULL, NULL, NULL),
    ('10000000-0000-0000-0000-000000000012', 'Betzy Gil', 'BG', '9648747', 'INGENIERO MECÁNICO', NULL, 2024, NULL, '01/11/2024', '01/11/2027', '2024-11-01'::DATE, '2027-11-01'::DATE, FALSE, '14 / 14.1', '14001 PENDIENTE EVALUACIÓN IN SITU', NULL, '14001 pendiente evaluacion in situ'),
    ('10000000-0000-0000-0000-000000000013', 'Carlos Vasquez', 'CV', '3430457', 'INGENIERO MECÁNICO', NULL, 2020, NULL, '01/02/2024', '01/02/2027', '2024-02-01'::DATE, '2027-02-01'::DATE, FALSE, '29 / 29.2', NULL, NULL, NULL),
    ('10000000-0000-0000-0000-000000000014', 'Carlos Gonzalez', 'CG', '21229844', 'INGENIERO EN ALIMENTOS', NULL, 2022, NULL, '01/06/2022', '01/06/2025', '2022-06-01'::DATE, '2025-06-01'::DATE, FALSE, '3 / 3.1', NULL, NULL, NULL),
    ('10000000-0000-0000-0000-000000000015', 'Carlos Villareal', 'CVC', '9328705', 'INGENIERO INDUSTRIAL', NULL, 2023, NULL, '01/05/2023', '01/05/2026', '2023-05-01'::DATE, '2026-05-01'::DATE, FALSE, '12 / 12.1', NULL, NULL, NULL),
    ('10000000-0000-0000-0000-000000000016', 'Daney Penaloza', 'DPZ', '11405571', 'INGENIERO QUÍMICO', NULL, 2024, NULL, 'S/R', NULL, NULL, NULL, TRUE, NULL, NULL, NULL, NULL),
    ('10000000-0000-0000-0000-000000000017', 'Denise Colina', 'DC', '13405896', 'INGENIERO INDUSTRIAL', NULL, 2024, NULL, '01/10/2024', '01/10/2027', '2024-10-01'::DATE, '2027-10-01'::DATE, FALSE, '9 / 9.1', NULL, NULL, NULL),
    ('10000000-0000-0000-0000-000000000018', 'Douglas Infante', 'DI', '20722562', 'INGENIERO QUÍMICO', NULL, 2024, NULL, '01/07/2024', '01/07/2027', '2024-07-01'::DATE, '2027-07-01'::DATE, FALSE, '3 / 3.1', NULL, NULL, NULL),
    ('10000000-0000-0000-0000-000000000019', 'Genny Mendoza', 'GM', '6523376', 'INGENIERO INDUSTRIAL', NULL, 2020, NULL, '01/07/2024', '01/07/2027', '2024-07-01'::DATE, '2027-07-01'::DATE, FALSE, '34 / 34.1', NULL, NULL, NULL),
    ('10000000-0000-0000-0000-000000000020', 'Gilberto Villalba', 'GV', '6917851', 'INGENIERO INDUSTRIAL', NULL, 2024, NULL, '01/06/2024', '01/06/2027', '2024-06-01'::DATE, '2027-06-01'::DATE, FALSE, '29 / 29.2', 'CALIFICADO / AUDITOR EN FORMACIÓN SECTOR 29 Y 33', NULL, 'Calificado'),
    ('10000000-0000-0000-0000-000000000021', 'Ivan Gonzalez', 'IG', '5594199', 'LICENCIADO EN BIOLOGÍA', NULL, 2024, NULL, '01/10/2019', '01/10/2022', '2019-10-01'::DATE, '2022-10-01'::DATE, FALSE, '3 / 3.1', 'CONDICIONADO CON EXPERTO TÉCNICO PARA LOS SECTORES 13 Y 38', NULL, 'En los sectores 13 y 38 se recomienda asignar un experto técnico.'),
    ('10000000-0000-0000-0000-000000000022', 'Jose Gregorio Goncalves', 'JG', '10756009', 'INGENIERO METALÚRGICO', NULL, 2020, NULL, '01/06/2012', '01/06/2015', '2012-06-01'::DATE, '2015-06-01'::DATE, FALSE, NULL, NULL, NULL, NULL),
    ('10000000-0000-0000-0000-000000000023', 'Juan Paulo Torrealba', 'JPT', '14485899', 'LICENCIADO EN EDUCACIÓN', NULL, 2026, NULL, '09/04/2026', '09/04/2029', '2026-04-09'::DATE, '2029-04-09'::DATE, FALSE, '37 / 37.2', NULL, NULL, NULL),
    ('10000000-0000-0000-0000-000000000024', 'Juan Hermann', 'JH', '3507585', 'LICENCIADO EN CIENCIAS NAVALES', NULL, 2020, NULL, '01/03/2025', '01/03/2028', '2025-03-01'::DATE, '2028-03-01'::DATE, FALSE, '35 / SERVICIOS', 'SECTOR 24 CON EXPERTO TÉCNICO', NULL, 'Sector 24 con experto tecnico.'),
    ('10000000-0000-0000-0000-000000000025', 'Karol Yulay Sánchez De Ghiano', 'KSG', '17039885', 'INGENIERO MECÁNICO', NULL, NULL, NULL, 'S/R', NULL, NULL, NULL, TRUE, NULL, NULL, NULL, NULL),
    ('10000000-0000-0000-0000-000000000026', 'Leonardo Ladera', 'LL', '12764568', 'INGENIERO INDUSTRIAL', NULL, 2024, NULL, '01/08/2024', '01/08/2027', '2024-08-01'::DATE, '2027-08-01'::DATE, FALSE, '29 / 35.2', NULL, NULL, NULL),
    ('10000000-0000-0000-0000-000000000027', 'Luis Matamoros', 'LM', '13909537', 'INGENIERO MATERIALES', NULL, 2024, NULL, '01/11/2024', '01/11/2027', '2024-11-01'::DATE, '2027-11-01'::DATE, FALSE, '18 / 18.1', NULL, NULL, NULL),
    ('10000000-0000-0000-0000-000000000028', 'Luis Blanco', 'LB', '5305469', 'MÉDICO VETERINARIO', NULL, 2023, NULL, '01/11/2022', '01/11/2025', '2022-11-01'::DATE, '2025-11-01'::DATE, FALSE, '3 / 3.1', NULL, NULL, NULL),
    ('10000000-0000-0000-0000-000000000029', 'Luz María Rivas Sánchez', 'LMR', '5268661', 'INGENIERO QUÍMICO', NULL, 2023, NULL, 'S/R', NULL, NULL, NULL, TRUE, NULL, 'CONDICIONADO A EVALUACION IN SITU', NULL, NULL),
    ('10000000-0000-0000-0000-000000000030', 'Magyory Suarez', 'MS', '11294442', 'LICENCIADA EN BIBLIOTECOLOGÍA', NULL, 2020, NULL, '01/10/2015', '01/10/2018', '2015-10-01'::DATE, '2018-10-01'::DATE, FALSE, NULL, NULL, NULL, NULL),
    ('10000000-0000-0000-0000-000000000031', 'Manuel Quintana', 'MQ', '12640951', 'INGENIERO', NULL, 2022, NULL, '01/12/2022', '01/12/2025', '2022-12-01'::DATE, '2025-12-01'::DATE, FALSE, '31 / 31.2', 'FALTA EVALUACIÓN IN SITU 14001 Y 45001', NULL, NULL),
    ('10000000-0000-0000-0000-000000000032', 'Maria Rivas', 'MR', '10717513', 'INGENIERO CIVIL', NULL, 2020, NULL, 'S/R', NULL, NULL, NULL, TRUE, NULL, NULL, NULL, NULL),
    ('10000000-0000-0000-0000-000000000033', 'Maria Auxiliadora Cadena', 'MAC', '4923686', 'INGENIERO AERONÁUTICO', NULL, 2020, NULL, '01/07/2024', '01/07/2027', '2024-07-01'::DATE, '2027-07-01'::DATE, FALSE, '35 / 35.2', NULL, NULL, NULL),
    ('10000000-0000-0000-0000-000000000034', 'Ximena Pacheco', 'XP', '14261576', 'INGENIERO QUÍMICO', NULL, 2021, NULL, '01/12/2021', 'dic-24', '2021-12-01'::DATE, '2024-12-31'::DATE, FALSE, '34', NULL, NULL, NULL),
    ('10000000-0000-0000-0000-000000000035', 'Óscar Ríos', 'OR', '7130716', 'INGENIERO QUÍMICO', 'MARCA', NULL, NULL, 'S/R', NULL, NULL, NULL, TRUE, NULL, NULL, NULL, NULL),
    ('10000000-0000-0000-0000-000000000036', 'Oscar Quintero', 'OQ', '7130726', 'INGENIERO INDUSTRIAL', NULL, 2023, NULL, 'dic-21 / ago-23', 'dic-24 / ago-26', '2023-08-01'::DATE, '2026-08-01'::DATE, FALSE, '29 / 37 / 37.1', 'SECTOR 5 CON EXP TÉCNICO', NULL, 'SECTOR 5 CON EXP TECNICO'),
    ('10000000-0000-0000-0000-000000000037', 'Pablo César Galvis Salamanca', 'PG', '9224637', 'INGENIERO INDUSTRIAL', NULL, 2022, NULL, 'S/R', NULL, NULL, NULL, TRUE, NULL, 'CONDICIONADO A EVALUACIÓN IN SITU', NULL, NULL),
    ('10000000-0000-0000-0000-000000000038', 'Pablo Mora', 'PM', '13727311', 'INGENIERO CIVIL', NULL, 2020, NULL, '01/09/2023', '01/09/2026', '2023-09-01'::DATE, '2026-09-01'::DATE, FALSE, '34 / 34.1', NULL, NULL, NULL),
    ('10000000-0000-0000-0000-000000000039', 'Pedro Vargas', 'PV', '10929397', 'INGENIERO METALÚRGICO', NULL, 2020, NULL, '01/11/2024', '01/11/2027', '2024-11-01'::DATE, '2027-11-01'::DATE, FALSE, '17 / 17.2', NULL, NULL, NULL),
    ('10000000-0000-0000-0000-000000000040', 'Ricardo Araujo', 'RA', '7091039', 'INGENIERO QUÍMICO', NULL, 2020, NULL, '01/06/2022', '01/06/2025', '2022-06-01'::DATE, '2025-06-01'::DATE, FALSE, '3 / 3.2', NULL, NULL, NULL),
    ('10000000-0000-0000-0000-000000000041', 'Sheilar Peña', 'SP', '15912976', 'LICENCIADA EN QUÍMICA', NULL, 2022, NULL, 'nov-22 / oct-23', 'nov-25 / oct-26', '2023-10-01'::DATE, '2026-10-01'::DATE, FALSE, '12 / 12.1 / 38 / 38.2', 'FALTA EVALUACIÓN IN SITU 14001', NULL, NULL),
    ('10000000-0000-0000-0000-000000000042', 'Victor Blanco', 'VB', '4803380', 'INGENIERO ELECTRICISTA', NULL, 2022, NULL, '01/08/2024', '01/08/2027', '2024-08-01'::DATE, '2027-08-01'::DATE, FALSE, '19 / 19.1', NULL, NULL, NULL),
    ('10000000-0000-0000-0000-000000000043', 'Wolfgang Peuchert', 'WP', '6949008', 'INGENIERO INDUSTRIAL', NULL, 2020, NULL, 'S/R', NULL, NULL, NULL, TRUE, NULL, NULL, NULL, NULL),
    ('10000000-0000-0000-0000-000000000044', 'Yamila Dumont', 'YD', '11821514', 'INGENIERO INDUSTRIAL', NULL, 2022, NULL, 'ago-22 / oct-22', 'ago-25 / oct-25', '2022-10-01'::DATE, '2025-10-01'::DATE, FALSE, '7 / 7.1 / 3 / 3.1', NULL, NULL, NULL),
    ('10000000-0000-0000-0000-000000000045', 'Yurima Carrillo', 'YC', '7137643', 'INGENIERO EN INFORMACIÓN', NULL, NULL, NULL, 'S/R', NULL, NULL, NULL, TRUE, NULL, 'CONDICIONA A EVALUACIÓN INSITU', NULL, NULL),
    ('10000000-0000-0000-0000-000000000046', 'Yarleska Jimenez', 'YJ', '11049843', 'INGENIERO AGRÓNOMO', 'HACCP', NULL, NULL, 'S/R', NULL, NULL, NULL, TRUE, NULL, NULL, NULL, NULL),
    ('10000000-0000-0000-0000-000000000047', 'Yurima Carrillo', 'YC', '12310919', 'INGENIERO QUÍMICO', NULL, 2022, NULL, 'jun-22 / oct-24', 'jun-25 / oct-27', '2024-10-01'::DATE, '2027-10-01'::DATE, FALSE, '12/ 12.02 / 37 / 37.1', NULL, NULL, NULL)
ON CONFLICT (id) DO UPDATE SET
    nombre = EXCLUDED.nombre,
    siglas = EXCLUDED.siglas,
    cedula_identidad = EXCLUDED.cedula_identidad,
    profesion = EXCLUDED.profesion,
    esquemas_complementarios = EXCLUDED.esquemas_complementarios,
    anio_actualizacion_normas = EXCLUDED.anio_actualizacion_normas,
    sistema_gestion_secundario = EXCLUDED.sistema_gestion_secundario,
    ultima_evaluacion_in_situ_texto = EXCLUDED.ultima_evaluacion_in_situ_texto,
    proxima_evaluacion_in_situ_texto = EXCLUDED.proxima_evaluacion_in_situ_texto,
    ultima_evaluacion_in_situ_fecha = EXCLUDED.ultima_evaluacion_in_situ_fecha,
    proxima_evaluacion_in_situ_fecha = EXCLUDED.proxima_evaluacion_in_situ_fecha,
    sin_registro_evaluacion = EXCLUDED.sin_registro_evaluacion,
    sector_area_evaluado_texto = EXCLUDED.sector_area_evaluado_texto,
    observaciones_evaluacion = EXCLUDED.observaciones_evaluacion,
    anio_actualizacion_sectores = EXCLUDED.anio_actualizacion_sectores,
    observacion_sectores = EXCLUDED.observacion_sectores,
    deleted_at = NULL,
    deleted_by = NULL,
    delete_reason = NULL,
    updated_at = NOW();

INSERT INTO public.telefono_auditor (id, id_auditor, telefono, tipo_telefono, es_principal) VALUES
    ('1a100000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '04166225576', 'Móvil', TRUE),
    ('1a100000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', '52 81 3056 1157', 'Internacional', TRUE),
    ('1a100000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000003', '02129074632', 'Oficina', TRUE),
    ('1a100000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000004', '04144222939', 'Móvil', TRUE),
    ('1a100000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000005', '04126018407', 'Móvil', TRUE),
    ('1a100000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000005', '02123698762', 'Oficina', FALSE),
    ('1a100000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000006', '04143628302', 'Móvil', TRUE),
    ('1a100000-0000-0000-0000-000000000008', '10000000-0000-0000-0000-000000000007', '04142382235', 'Móvil', TRUE),
    ('1a100000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-000000000007', '04122900959', 'Móvil', FALSE),
    ('1a100000-0000-0000-0000-000000000010', '10000000-0000-0000-0000-000000000008', '04242873734', 'Móvil', TRUE),
    ('1a100000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-000000000009', '04141337037', 'Móvil', TRUE),
    ('1a100000-0000-0000-0000-000000000012', '10000000-0000-0000-0000-000000000009', '02123780317', 'Oficina', FALSE),
    ('1a100000-0000-0000-0000-000000000013', '10000000-0000-0000-0000-000000000010', '4140186939', 'Móvil', TRUE),
    ('1a100000-0000-0000-0000-000000000014', '10000000-0000-0000-0000-000000000011', '04129411926', 'Móvil', TRUE),
    ('1a100000-0000-0000-0000-000000000015', '10000000-0000-0000-0000-000000000011', '04143149127', 'Móvil', FALSE),
    ('1a100000-0000-0000-0000-000000000016', '10000000-0000-0000-0000-000000000011', '04166286743', 'Móvil', FALSE),
    ('1a100000-0000-0000-0000-000000000017', '10000000-0000-0000-0000-000000000012', '04166435173', 'Móvil', TRUE),
    ('1a100000-0000-0000-0000-000000000018', '10000000-0000-0000-0000-000000000012', '04243313995', 'Móvil', FALSE),
    ('1a100000-0000-0000-0000-000000000019', '10000000-0000-0000-0000-000000000013', '02129413013', 'Oficina', TRUE),
    ('1a100000-0000-0000-0000-000000000020', '10000000-0000-0000-0000-000000000013', '02129433680', 'Oficina', FALSE),
    ('1a100000-0000-0000-0000-000000000021', '10000000-0000-0000-0000-000000000013', '04166127356', 'Móvil', FALSE),
    ('1a100000-0000-0000-0000-000000000022', '10000000-0000-0000-0000-000000000014', '04166435173', 'Móvil', TRUE),
    ('1a100000-0000-0000-0000-000000000023', '10000000-0000-0000-0000-000000000014', '04243313995', 'Móvil', FALSE),
    ('1a100000-0000-0000-0000-000000000024', '10000000-0000-0000-0000-000000000015', '02123776512', 'Oficina', TRUE),
    ('1a100000-0000-0000-0000-000000000025', '10000000-0000-0000-0000-000000000015', '04141111168', 'Móvil', FALSE),
    ('1a100000-0000-0000-0000-000000000026', '10000000-0000-0000-0000-000000000015', '04141403572', 'Móvil', FALSE),
    ('1a100000-0000-0000-0000-000000000027', '10000000-0000-0000-0000-000000000016', '04128830633', 'Móvil', TRUE),
    ('1a100000-0000-0000-0000-000000000028', '10000000-0000-0000-0000-000000000016', '04163318784', 'Móvil', FALSE),
    ('1a100000-0000-0000-0000-000000000029', '10000000-0000-0000-0000-000000000017', '02123424191', 'Oficina', TRUE),
    ('1a100000-0000-0000-0000-000000000030', '10000000-0000-0000-0000-000000000017', '04129749664', 'Móvil', FALSE),
    ('1a100000-0000-0000-0000-000000000031', '10000000-0000-0000-0000-000000000018', '4121414006', 'Móvil', TRUE),
    ('1a100000-0000-0000-0000-000000000032', '10000000-0000-0000-0000-000000000019', '(507)62491341', 'Internacional', TRUE),
    ('1a100000-0000-0000-0000-000000000033', '10000000-0000-0000-0000-000000000020', '02126625223', 'Oficina', TRUE),
    ('1a100000-0000-0000-0000-000000000034', '10000000-0000-0000-0000-000000000020', '04241371144', 'Móvil', FALSE),
    ('1a100000-0000-0000-0000-000000000035', '10000000-0000-0000-0000-000000000020', '04166225360', 'Móvil', FALSE),
    ('1a100000-0000-0000-0000-000000000036', '10000000-0000-0000-0000-000000000021', '04242377181', 'Móvil', TRUE),
    ('1a100000-0000-0000-0000-000000000037', '10000000-0000-0000-0000-000000000021', '04162016881', 'Móvil', FALSE),
    ('1a100000-0000-0000-0000-000000000038', '10000000-0000-0000-0000-000000000021', '02124841963', 'Oficina', FALSE),
    ('1a100000-0000-0000-0000-000000000039', '10000000-0000-0000-0000-000000000022', '(34)610903698', 'Internacional', TRUE),
    ('1a100000-0000-0000-0000-000000000040', '10000000-0000-0000-0000-000000000023', '4241126443', 'Móvil', TRUE),
    ('1a100000-0000-0000-0000-000000000041', '10000000-0000-0000-0000-000000000024', '04242210028', 'Móvil', TRUE),
    ('1a100000-0000-0000-0000-000000000042', '10000000-0000-0000-0000-000000000025', '04249699059', 'Móvil', TRUE),
    ('1a100000-0000-0000-0000-000000000043', '10000000-0000-0000-0000-000000000026', '04142587906', 'Móvil', TRUE),
    ('1a100000-0000-0000-0000-000000000044', '10000000-0000-0000-0000-000000000027', '04142446080', 'Móvil', TRUE),
    ('1a100000-0000-0000-0000-000000000045', '10000000-0000-0000-0000-000000000028', '04142677980', 'Móvil', TRUE),
    ('1a100000-0000-0000-0000-000000000046', '10000000-0000-0000-0000-000000000029', '04243578561', 'Móvil', TRUE),
    ('1a100000-0000-0000-0000-000000000047', '10000000-0000-0000-0000-000000000030', '04126510992', 'Móvil', TRUE),
    ('1a100000-0000-0000-0000-000000000048', '10000000-0000-0000-0000-000000000031', '04241436128', 'Móvil', TRUE),
    ('1a100000-0000-0000-0000-000000000049', '10000000-0000-0000-0000-000000000032', '04146864396', 'Móvil', TRUE),
    ('1a100000-0000-0000-0000-000000000050', '10000000-0000-0000-0000-000000000033', '04125874740', 'Móvil', TRUE),
    ('1a100000-0000-0000-0000-000000000051', '10000000-0000-0000-0000-000000000034', '04122902647', 'Móvil', TRUE),
    ('1a100000-0000-0000-0000-000000000052', '10000000-0000-0000-0000-000000000035', '04144977127', 'Móvil', TRUE),
    ('1a100000-0000-0000-0000-000000000053', '10000000-0000-0000-0000-000000000036', '04144977127', 'Móvil', TRUE),
    ('1a100000-0000-0000-0000-000000000054', '10000000-0000-0000-0000-000000000037', '04166105989', 'Móvil', TRUE),
    ('1a100000-0000-0000-0000-000000000055', '10000000-0000-0000-0000-000000000038', '04128664191', 'Móvil', TRUE),
    ('1a100000-0000-0000-0000-000000000056', '10000000-0000-0000-0000-000000000038', '04140482999', 'Móvil', FALSE),
    ('1a100000-0000-0000-0000-000000000057', '10000000-0000-0000-0000-000000000039', '04143728445', 'Móvil', TRUE),
    ('1a100000-0000-0000-0000-000000000058', '10000000-0000-0000-0000-000000000040', '04163481067', 'Móvil', TRUE),
    ('1a100000-0000-0000-0000-000000000059', '10000000-0000-0000-0000-000000000040', '04167326088', 'Móvil', FALSE),
    ('1a100000-0000-0000-0000-000000000060', '10000000-0000-0000-0000-000000000041', '04169592484', 'Móvil', TRUE),
    ('1a100000-0000-0000-0000-000000000061', '10000000-0000-0000-0000-000000000041', '04129960761', 'Móvil', FALSE),
    ('1a100000-0000-0000-0000-000000000062', '10000000-0000-0000-0000-000000000042', '02123725760', 'Oficina', TRUE),
    ('1a100000-0000-0000-0000-000000000063', '10000000-0000-0000-0000-000000000042', '04142722741', 'Móvil', FALSE),
    ('1a100000-0000-0000-0000-000000000064', '10000000-0000-0000-0000-000000000043', '04143300538', 'Móvil', TRUE),
    ('1a100000-0000-0000-0000-000000000065', '10000000-0000-0000-0000-000000000044', '04129552411', 'Móvil', TRUE),
    ('1a100000-0000-0000-0000-000000000066', '10000000-0000-0000-0000-000000000045', '04144843822', 'Móvil', TRUE),
    ('1a100000-0000-0000-0000-000000000067', '10000000-0000-0000-0000-000000000046', '04242840705', 'Móvil', TRUE),
    ('1a100000-0000-0000-0000-000000000068', '10000000-0000-0000-0000-000000000047', '04166093375', 'Móvil', TRUE)
ON CONFLICT (id) DO UPDATE SET
    id_auditor = EXCLUDED.id_auditor,
    telefono = EXCLUDED.telefono,
    tipo_telefono = EXCLUDED.tipo_telefono,
    es_principal = EXCLUDED.es_principal,
    deleted_at = NULL,
    deleted_by = NULL,
    updated_at = NOW();

INSERT INTO public.email_auditor (id, id_auditor, email, tipo_email, es_principal) VALUES
    ('1a200000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'keylasoteldo@gmail.com', 'Principal', TRUE),
    ('1a200000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'frojas301@gmail.com', 'Principal', TRUE),
    ('1a200000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000003', 'joserpolofaria@gmail.com', 'Principal', TRUE),
    ('1a200000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000004', 'leorojas48@gmail.com', 'Principal', TRUE),
    ('1a200000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000005', 'nordyfuentes@gmail.com', 'Principal', TRUE),
    ('1a200000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000006', 'fernandezmz@hotmail.com', 'Principal', TRUE),
    ('1a200000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000007', 'nelson.arteaga@gmail.com', 'Principal', TRUE),
    ('1a200000-0000-0000-0000-000000000008', '10000000-0000-0000-0000-000000000008', 'fondonorma.yblanco@gmail.com', 'Principal', TRUE),
    ('1a200000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-000000000009', 'ejcamar@gmail.com', 'Principal', TRUE),
    ('1a200000-0000-0000-0000-000000000010', '10000000-0000-0000-0000-000000000010', 'idiaz25@gmail.com', 'Principal', TRUE),
    ('1a200000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-000000000011', 'calidad.aksanchez@gmail.com', 'Principal', TRUE),
    ('1a200000-0000-0000-0000-000000000012', '10000000-0000-0000-0000-000000000012', 'servicios@betzygil.com', 'Principal', TRUE),
    ('1a200000-0000-0000-0000-000000000013', '10000000-0000-0000-0000-000000000012', 'bbgg0710@gmail.com', 'Secundario', FALSE),
    ('1a200000-0000-0000-0000-000000000014', '10000000-0000-0000-0000-000000000013', 'carlosalfonso2027@gmail.com', 'Principal', TRUE),
    ('1a200000-0000-0000-0000-000000000015', '10000000-0000-0000-0000-000000000014', 'carlosedurado.gonzalez@gmail.com', 'Principal', TRUE),
    ('1a200000-0000-0000-0000-000000000016', '10000000-0000-0000-0000-000000000015', 'villarrealcmg@gmail.com', 'Principal', TRUE),
    ('1a200000-0000-0000-0000-000000000017', '10000000-0000-0000-0000-000000000016', 'daneypf@gmail.com', 'Principal', TRUE),
    ('1a200000-0000-0000-0000-000000000018', '10000000-0000-0000-0000-000000000016', 'daneypf@hotmail.com', 'Secundario', FALSE),
    ('1a200000-0000-0000-0000-000000000019', '10000000-0000-0000-0000-000000000017', 'denisecolina22@gmail.com', 'Principal', TRUE),
    ('1a200000-0000-0000-0000-000000000020', '10000000-0000-0000-0000-000000000018', 'dinfante.consultor@gmail.com', 'Principal', TRUE),
    ('1a200000-0000-0000-0000-000000000021', '10000000-0000-0000-0000-000000000019', 'gennymendoza62@gmail.com', 'Principal', TRUE),
    ('1a200000-0000-0000-0000-000000000022', '10000000-0000-0000-0000-000000000020', 'quality.s.consulting@gmail.com', 'Principal', TRUE),
    ('1a200000-0000-0000-0000-000000000023', '10000000-0000-0000-0000-000000000021', 'quality.gi@gmail.com', 'Principal', TRUE),
    ('1a200000-0000-0000-0000-000000000024', '10000000-0000-0000-0000-000000000022', 'joseg.goncalvesm@gmail.com', 'Principal', TRUE),
    ('1a200000-0000-0000-0000-000000000025', '10000000-0000-0000-0000-000000000023', 'paulo.torrealba@gmail.com', 'Principal', TRUE),
    ('1a200000-0000-0000-0000-000000000026', '10000000-0000-0000-0000-000000000024', 'hh3026@gmail.com', 'Principal', TRUE),
    ('1a200000-0000-0000-0000-000000000027', '10000000-0000-0000-0000-000000000025', 'karol.sanchez13@gmail.com', 'Principal', TRUE),
    ('1a200000-0000-0000-0000-000000000028', '10000000-0000-0000-0000-000000000026', 'ladera.managementsolutions@gmail.com', 'Principal', TRUE),
    ('1a200000-0000-0000-0000-000000000029', '10000000-0000-0000-0000-000000000027', 'matamoros1978@gmail.com', 'Principal', TRUE),
    ('1a200000-0000-0000-0000-000000000030', '10000000-0000-0000-0000-000000000028', 'luisb.mb1001@gmail.com', 'Principal', TRUE),
    ('1a200000-0000-0000-0000-000000000031', '10000000-0000-0000-0000-000000000029', 'zulairamsavir@gmail.com', 'Principal', TRUE),
    ('1a200000-0000-0000-0000-000000000032', '10000000-0000-0000-0000-000000000030', 'magyory.suarez@gmail.com', 'Principal', TRUE),
    ('1a200000-0000-0000-0000-000000000033', '10000000-0000-0000-0000-000000000031', 'quintana1manuel@gmail.com', 'Principal', TRUE),
    ('1a200000-0000-0000-0000-000000000034', '10000000-0000-0000-0000-000000000032', 'mrmconsultores.rivasmarquez@gmail.com', 'Principal', TRUE),
    ('1a200000-0000-0000-0000-000000000035', '10000000-0000-0000-0000-000000000033', 'mariauxiliadoracadenas@gmail.com', 'Principal', TRUE),
    ('1a200000-0000-0000-0000-000000000036', '10000000-0000-0000-0000-000000000034', 'ximenapacheco@gmail.com', 'Principal', TRUE),
    ('1a200000-0000-0000-0000-000000000037', '10000000-0000-0000-0000-000000000035', 'oscareriosu@gmail.com', 'Principal', TRUE),
    ('1a200000-0000-0000-0000-000000000038', '10000000-0000-0000-0000-000000000036', 'quinteroarjona@gmail.com', 'Principal', TRUE),
    ('1a200000-0000-0000-0000-000000000039', '10000000-0000-0000-0000-000000000037', 'pcgs20@gmail.com', 'Principal', TRUE),
    ('1a200000-0000-0000-0000-000000000040', '10000000-0000-0000-0000-000000000038', 'pmp.calidad@gmail.com', 'Principal', TRUE),
    ('1a200000-0000-0000-0000-000000000041', '10000000-0000-0000-0000-000000000039', 'ing.pedrovargas@gmail.com', 'Principal', TRUE),
    ('1a200000-0000-0000-0000-000000000042', '10000000-0000-0000-0000-000000000039', 'pvargas@orinoco-iron.com', 'Secundario', FALSE),
    ('1a200000-0000-0000-0000-000000000043', '10000000-0000-0000-0000-000000000040', 'qsheca@gmail.com', 'Principal', TRUE),
    ('1a200000-0000-0000-0000-000000000044', '10000000-0000-0000-0000-000000000041', 'sheilar.teresa@gmail.com', 'Principal', TRUE),
    ('1a200000-0000-0000-0000-000000000045', '10000000-0000-0000-0000-000000000042', 'blancovic2000@gmail.com', 'Principal', TRUE),
    ('1a200000-0000-0000-0000-000000000046', '10000000-0000-0000-0000-000000000043', 'wpeuchert@hotmail.com', 'Principal', TRUE),
    ('1a200000-0000-0000-0000-000000000047', '10000000-0000-0000-0000-000000000044', 'yamiladumont@gmail.com', 'Principal', TRUE),
    ('1a200000-0000-0000-0000-000000000048', '10000000-0000-0000-0000-000000000045', 'yanellys_castellanos@yahoo.com', 'Principal', TRUE),
    ('1a200000-0000-0000-0000-000000000049', '10000000-0000-0000-0000-000000000046', 'agroauditora@gmail.com', 'Principal', TRUE),
    ('1a200000-0000-0000-0000-000000000050', '10000000-0000-0000-0000-000000000047', 'yurima12.fondonorma@gmail.com', 'Principal', TRUE)
ON CONFLICT (id) DO UPDATE SET
    id_auditor = EXCLUDED.id_auditor,
    email = EXCLUDED.email,
    tipo_email = EXCLUDED.tipo_email,
    es_principal = EXCLUDED.es_principal,
    deleted_at = NULL,
    deleted_by = NULL,
    updated_at = NOW();

INSERT INTO public.evaluacion_in_situ_auditor (
    id, id_auditor, etiqueta_periodo, norma_referencia, sector_area_evaluado,
    ultima_evaluacion_fecha, proxima_evaluacion_fecha,
    ultima_evaluacion_texto, proxima_evaluacion_texto, observaciones
) VALUES
    ('1a300000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Evaluación Principal', NULL, '33 / 33.18', '2024-09-01'::DATE, '2027-09-01'::DATE, '01/09/2024', '01/09/2027', NULL),
    ('1a300000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'Evaluación 1 (may-15)', NULL, '4', '2015-05-01'::DATE, '2018-05-01'::DATE, 'may-15', 'may-18', NULL),
    ('1a300000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002', 'Evaluación 2 (nov-24)', NULL, '4', '2024-11-01'::DATE, '2027-11-01'::DATE, 'nov-24', 'nov-27', NULL),
    ('1a300000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000003', 'Evaluación Principal', NULL, '34 / 34.1', '2023-11-01'::DATE, '2026-11-01'::DATE, '01/11/2023', '01/11/2026', 'SECTOR 9 Y 38 CON EXPERTO TÉCNICO'),
    ('1a300000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000004', 'Evaluación Principal', NULL, '3 / 3.1', '2021-08-01'::DATE, '2024-08-01'::DATE, '01/08/2021', '01/08/2024', NULL),
    ('1a300000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000005', 'Evaluación Principal', NULL, '7 / 7.1', '2022-08-01'::DATE, '2025-08-01'::DATE, '01/08/2022', '01/08/2025', 'SECTOR 4, 5 Y 38  CON EXP TÉCNICO'),
    ('1a300000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000006', 'Evaluación Principal', NULL, '34 / SERVICIO DE BUCEO', '2024-09-01'::DATE, '2027-09-01'::DATE, '01/09/2024', '01/09/2027', NULL),
    ('1a300000-0000-0000-0000-000000000008', '10000000-0000-0000-0000-000000000007', 'Evaluación Principal', NULL, NULL, '2014-08-01'::DATE, '2017-08-01'::DATE, '01/08/2014', '01/08/2017', NULL),
    ('1a300000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-000000000008', 'Evaluación Principal', NULL, '12 / 12.1', '2023-05-01'::DATE, '2026-05-01'::DATE, '01/05/2023', '01/05/2026', 'CONDICIONADA A IR CON EXPERTO TÉCNICO EN SECTOR 9'),
    ('1a300000-0000-0000-0000-000000000010', '10000000-0000-0000-0000-000000000009', 'Evaluación Principal', NULL, '34 / 34.1', '2019-09-01'::DATE, '2022-09-01'::DATE, '01/09/2019', '01/09/2022', 'SECTOR 15 CON EXP TÉCNICO'),
    ('1a300000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-000000000010', 'Evaluación Principal', NULL, '34 / 34.1', '2019-09-01'::DATE, '2022-09-01'::DATE, '01/09/2019', '01/09/2022', NULL),
    ('1a300000-0000-0000-0000-000000000012', '10000000-0000-0000-0000-000000000011', 'Evaluación Principal', NULL, '31 / 31.6', '2024-10-01'::DATE, '2027-10-01'::DATE, '01/10/2024', '01/10/2027', NULL),
    ('1a300000-0000-0000-0000-000000000013', '10000000-0000-0000-0000-000000000012', 'Evaluación Principal', NULL, '14 / 14.1', '2024-11-01'::DATE, '2027-11-01'::DATE, '01/11/2024', '01/11/2027', '14001 PENDIENTE EVALUACIÓN IN SITU'),
    ('1a300000-0000-0000-0000-000000000014', '10000000-0000-0000-0000-000000000013', 'Evaluación Principal', NULL, '29 / 29.2', '2024-02-01'::DATE, '2027-02-01'::DATE, '01/02/2024', '01/02/2027', NULL),
    ('1a300000-0000-0000-0000-000000000015', '10000000-0000-0000-0000-000000000014', 'Evaluación Principal', NULL, '3 / 3.1', '2022-06-01'::DATE, '2025-06-01'::DATE, '01/06/2022', '01/06/2025', NULL),
    ('1a300000-0000-0000-0000-000000000016', '10000000-0000-0000-0000-000000000015', 'Evaluación Principal', NULL, '12 / 12.1', '2023-05-01'::DATE, '2026-05-01'::DATE, '01/05/2023', '01/05/2026', NULL),
    ('1a300000-0000-0000-0000-000000000017', '10000000-0000-0000-0000-000000000017', 'Evaluación Principal', NULL, '9 / 9.1', '2024-10-01'::DATE, '2027-10-01'::DATE, '01/10/2024', '01/10/2027', NULL),
    ('1a300000-0000-0000-0000-000000000018', '10000000-0000-0000-0000-000000000018', 'Evaluación Principal', NULL, '3 / 3.1', '2024-07-01'::DATE, '2027-07-01'::DATE, '01/07/2024', '01/07/2027', NULL),
    ('1a300000-0000-0000-0000-000000000019', '10000000-0000-0000-0000-000000000019', 'Evaluación Principal', NULL, '34 / 34.1', '2024-07-01'::DATE, '2027-07-01'::DATE, '01/07/2024', '01/07/2027', NULL),
    ('1a300000-0000-0000-0000-000000000020', '10000000-0000-0000-0000-000000000020', 'Evaluación Principal', NULL, '29 / 29.2', '2024-06-01'::DATE, '2027-06-01'::DATE, '01/06/2024', '01/06/2027', 'CALIFICADO / AUDITOR EN FORMACIÓN SECTOR 29 Y 33'),
    ('1a300000-0000-0000-0000-000000000021', '10000000-0000-0000-0000-000000000021', 'Evaluación Principal', NULL, '3 / 3.1', '2019-10-01'::DATE, '2022-10-01'::DATE, '01/10/2019', '01/10/2022', 'CONDICIONADO CON EXPERTO TÉCNICO PARA LOS SECTORES 13 Y 38'),
    ('1a300000-0000-0000-0000-000000000022', '10000000-0000-0000-0000-000000000022', 'Evaluación Principal', NULL, NULL, '2012-06-01'::DATE, '2015-06-01'::DATE, '01/06/2012', '01/06/2015', NULL),
    ('1a300000-0000-0000-0000-000000000023', '10000000-0000-0000-0000-000000000023', 'Evaluación Principal', NULL, '37 / 37.2', '2026-04-09'::DATE, '2029-04-09'::DATE, '09/04/2026', '09/04/2029', NULL),
    ('1a300000-0000-0000-0000-000000000024', '10000000-0000-0000-0000-000000000024', 'Evaluación Principal', NULL, '35 / SERVICIOS', '2025-03-01'::DATE, '2028-03-01'::DATE, '01/03/2025', '01/03/2028', 'SECTOR 24 CON EXPERTO TÉCNICO'),
    ('1a300000-0000-0000-0000-000000000025', '10000000-0000-0000-0000-000000000026', 'Evaluación Principal', NULL, '29 / 35.2', '2024-08-01'::DATE, '2027-08-01'::DATE, '01/08/2024', '01/08/2027', NULL),
    ('1a300000-0000-0000-0000-000000000026', '10000000-0000-0000-0000-000000000027', 'Evaluación Principal', NULL, '18 / 18.1', '2024-11-01'::DATE, '2027-11-01'::DATE, '01/11/2024', '01/11/2027', NULL),
    ('1a300000-0000-0000-0000-000000000027', '10000000-0000-0000-0000-000000000028', 'Evaluación Principal', NULL, '3 / 3.1', '2022-11-01'::DATE, '2025-11-01'::DATE, '01/11/2022', '01/11/2025', NULL),
    ('1a300000-0000-0000-0000-000000000028', '10000000-0000-0000-0000-000000000030', 'Evaluación Principal', NULL, NULL, '2015-10-01'::DATE, '2018-10-01'::DATE, '01/10/2015', '01/10/2018', NULL),
    ('1a300000-0000-0000-0000-000000000029', '10000000-0000-0000-0000-000000000031', 'Evaluación Principal', NULL, '31 / 31.2', '2022-12-01'::DATE, '2025-12-01'::DATE, '01/12/2022', '01/12/2025', 'FALTA EVALUACIÓN IN SITU 14001 Y 45001'),
    ('1a300000-0000-0000-0000-000000000030', '10000000-0000-0000-0000-000000000033', 'Evaluación Principal', NULL, '35 / 35.2', '2024-07-01'::DATE, '2027-07-01'::DATE, '01/07/2024', '01/07/2027', NULL),
    ('1a300000-0000-0000-0000-000000000031', '10000000-0000-0000-0000-000000000034', 'Evaluación Principal', NULL, '34', '2021-12-01'::DATE, '2024-12-31'::DATE, '01/12/2021', 'dic-24', NULL),
    ('1a300000-0000-0000-0000-000000000032', '10000000-0000-0000-0000-000000000036', 'Evaluación 1 (dic-21)', NULL, '29', '2021-12-01'::DATE, '2024-12-01'::DATE, 'dic-21', 'dic-24', 'SECTOR 5 CON EXP TÉCNICO'),
    ('1a300000-0000-0000-0000-000000000033', '10000000-0000-0000-0000-000000000036', 'Evaluación 2 (ago-23)', NULL, '37 / 37.1', '2023-08-01'::DATE, '2026-08-01'::DATE, 'ago-23', 'ago-26', 'SECTOR 5 CON EXP TÉCNICO'),
    ('1a300000-0000-0000-0000-000000000034', '10000000-0000-0000-0000-000000000038', 'Evaluación Principal', NULL, '34 / 34.1', '2023-09-01'::DATE, '2026-09-01'::DATE, '01/09/2023', '01/09/2026', NULL),
    ('1a300000-0000-0000-0000-000000000035', '10000000-0000-0000-0000-000000000039', 'Evaluación Principal', NULL, '17 / 17.2', '2024-11-01'::DATE, '2027-11-01'::DATE, '01/11/2024', '01/11/2027', NULL),
    ('1a300000-0000-0000-0000-000000000036', '10000000-0000-0000-0000-000000000040', 'Evaluación Principal', NULL, '3 / 3.2', '2022-06-01'::DATE, '2025-06-01'::DATE, '01/06/2022', '01/06/2025', NULL),
    ('1a300000-0000-0000-0000-000000000037', '10000000-0000-0000-0000-000000000041', 'Evaluación 1 (nov-22)', NULL, '12 / 12.1', '2022-11-01'::DATE, '2025-11-01'::DATE, 'nov-22', 'nov-25', 'FALTA EVALUACIÓN IN SITU 14001'),
    ('1a300000-0000-0000-0000-000000000038', '10000000-0000-0000-0000-000000000041', 'Evaluación 2 (oct-23)', NULL, '38 / 38.2', '2023-10-01'::DATE, '2026-10-01'::DATE, 'oct-23', 'oct-26', 'FALTA EVALUACIÓN IN SITU 14001'),
    ('1a300000-0000-0000-0000-000000000039', '10000000-0000-0000-0000-000000000042', 'Evaluación Principal', NULL, '19 / 19.1', '2024-08-01'::DATE, '2027-08-01'::DATE, '01/08/2024', '01/08/2027', NULL),
    ('1a300000-0000-0000-0000-000000000040', '10000000-0000-0000-0000-000000000044', 'Evaluación 1 (ago-22)', NULL, '7 / 7.1', '2022-08-01'::DATE, '2025-08-01'::DATE, 'ago-22', 'ago-25', NULL),
    ('1a300000-0000-0000-0000-000000000041', '10000000-0000-0000-0000-000000000044', 'Evaluación 2 (oct-22)', NULL, '3 / 3.1', '2022-10-01'::DATE, '2025-10-01'::DATE, 'oct-22', 'oct-25', NULL),
    ('1a300000-0000-0000-0000-000000000042', '10000000-0000-0000-0000-000000000047', 'Evaluación 1 (jun-22)', NULL, '12/ 12.02', '2022-06-01'::DATE, '2025-06-01'::DATE, 'jun-22', 'jun-25', NULL),
    ('1a300000-0000-0000-0000-000000000043', '10000000-0000-0000-0000-000000000047', 'Evaluación 2 (oct-24)', NULL, '37 / 37.1', '2024-10-01'::DATE, '2027-10-01'::DATE, 'oct-24', 'oct-27', NULL)
ON CONFLICT (id) DO UPDATE SET
    id_auditor = EXCLUDED.id_auditor,
    etiqueta_periodo = EXCLUDED.etiqueta_periodo,
    norma_referencia = EXCLUDED.norma_referencia,
    sector_area_evaluado = EXCLUDED.sector_area_evaluado,
    ultima_evaluacion_fecha = EXCLUDED.ultima_evaluacion_fecha,
    proxima_evaluacion_fecha = EXCLUDED.proxima_evaluacion_fecha,
    ultima_evaluacion_texto = EXCLUDED.ultima_evaluacion_texto,
    proxima_evaluacion_texto = EXCLUDED.proxima_evaluacion_texto,
    observaciones = EXCLUDED.observaciones,
    deleted_at = NULL,
    deleted_by = NULL,
    updated_at = NOW();

-- Sincronización limpia e idempotente de vínculos M:N para los 47 auditores reales (preservando 3333... intocable)
DELETE FROM public.norma_auditor
WHERE id_auditor BETWEEN '10000000-0000-0000-0000-000000000001'::UUID AND '10000000-0000-0000-0000-000000000047'::UUID;

DELETE FROM public.sector_iaf_auditor
WHERE id_auditor BETWEEN '10000000-0000-0000-0000-000000000001'::UUID AND '10000000-0000-0000-0000-000000000047'::UUID;

DELETE FROM public.subsector_iaf_auditor
WHERE id_auditor BETWEEN '10000000-0000-0000-0000-000000000001'::UUID AND '10000000-0000-0000-0000-000000000047'::UUID;

INSERT INTO public.norma_auditor (id_auditor, id_norma) VALUES
    -- Auditor Técnico Evaluador (RLS auditor@fondonorma.test): 9001, 14001, 45001, 27001, 22000
    ('33333333-3333-3333-3333-333333333333', 'e0000000-0000-0000-0000-000000009001'),
    ('33333333-3333-3333-3333-333333333333', 'e0000000-0000-0000-0000-000000014001'),
    ('33333333-3333-3333-3333-333333333333', 'e0000000-0000-0000-0000-000000045001'),
    ('33333333-3333-3333-3333-333333333333', 'e0000000-0000-0000-0000-000000027001'),
    ('33333333-3333-3333-3333-333333333333', 'e0000000-0000-0000-0000-000000022000'),
    -- Keyla Cristina Soteldo de Páez (KS, C.I. 4165827)
    ('10000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000009001'),
    ('10000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000014001'),
    ('10000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000045001'),
    -- Félix Horacio Rojas Machado (FR, C.I. 2995963)
    ('10000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000009001'),
    -- José Ramón Polo Faría (JRP, C.I. 5684384)
    ('10000000-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-000000009001'),
    -- Leonardo Antonio Rojas Gómez (LR, C.I. 5365320)
    ('10000000-0000-0000-0000-000000000004', 'e0000000-0000-0000-0000-000000009001'),
    ('10000000-0000-0000-0000-000000000004', 'e0000000-0000-0000-0000-000000014001'),
    ('10000000-0000-0000-0000-000000000004', 'e0000000-0000-0000-0000-000000045001'),
    -- Nordy Armando Fuentes (NF, C.I. 5884819)
    ('10000000-0000-0000-0000-000000000005', 'e0000000-0000-0000-0000-000000009001'),
    -- Manuel Arturo Fernández Martínez (MF, C.I. 8417973)
    ('10000000-0000-0000-0000-000000000006', 'e0000000-0000-0000-0000-000000009001'),
    ('10000000-0000-0000-0000-000000000006', 'e0000000-0000-0000-0000-000000014001'),
    ('10000000-0000-0000-0000-000000000006', 'e0000000-0000-0000-0000-000000045001'),
    -- Nelson Rafael Arteaga Quevedo (NA, C.I. 5584108)
    ('10000000-0000-0000-0000-000000000007', 'e0000000-0000-0000-0000-000000009001'),
    -- Yuliber Alejandra Blanco Díaz (YB, C.I. 12500820)
    ('10000000-0000-0000-0000-000000000008', 'e0000000-0000-0000-0000-000000009001'),
    -- Edgar José Cachutt Márquez (ECH, C.I. 3395125)
    ('10000000-0000-0000-0000-000000000009', 'e0000000-0000-0000-0000-000000009001'),
    -- Ismael Enrique Díaz Valera (ID, C.I. 6965204)
    ('10000000-0000-0000-0000-000000000010', 'e0000000-0000-0000-0000-000000009001'),
    ('10000000-0000-0000-0000-000000000010', 'e0000000-0000-0000-0000-000000014001'),
    ('10000000-0000-0000-0000-000000000010', 'e0000000-0000-0000-0000-000000045001'),
    -- Ana Karina Sanchez (AKS, C.I. 10337391)
    ('10000000-0000-0000-0000-000000000011', 'e0000000-0000-0000-0000-000000009001'),
    -- Betzy Gil (BG, C.I. 9648747)
    ('10000000-0000-0000-0000-000000000012', 'e0000000-0000-0000-0000-000000009001'),
    ('10000000-0000-0000-0000-000000000012', 'e0000000-0000-0000-0000-000000014001'),
    -- Carlos Vasquez (CV, C.I. 3430457)
    ('10000000-0000-0000-0000-000000000013', 'e0000000-0000-0000-0000-000000009001'),
    -- Carlos Gonzalez (CG, C.I. 21229844)
    ('10000000-0000-0000-0000-000000000014', 'e0000000-0000-0000-0000-000000009001'),
    ('10000000-0000-0000-0000-000000000014', 'e0000000-0000-0000-0000-000000022000'),
    -- Carlos Villareal (CVC, C.I. 9328705)
    ('10000000-0000-0000-0000-000000000015', 'e0000000-0000-0000-0000-000000009001'),
    -- Daney Penaloza (DPZ, C.I. 11405571)
    ('10000000-0000-0000-0000-000000000016', 'e0000000-0000-0000-0000-000000009001'),
    -- Denise Colina (DC, C.I. 13405896)
    ('10000000-0000-0000-0000-000000000017', 'e0000000-0000-0000-0000-000000009001'),
    -- Douglas Infante (DI, C.I. 20722562)
    ('10000000-0000-0000-0000-000000000018', 'e0000000-0000-0000-0000-000000009001'),
    ('10000000-0000-0000-0000-000000000018', 'e0000000-0000-0000-0000-000000014001'),
    -- Genny Mendoza (GM, C.I. 6523376)
    ('10000000-0000-0000-0000-000000000019', 'e0000000-0000-0000-0000-000000009001'),
    -- Gilberto Villalba (GV, C.I. 6917851)
    ('10000000-0000-0000-0000-000000000020', 'e0000000-0000-0000-0000-000000009001'),
    -- Ivan Gonzalez (IG, C.I. 5594199)
    ('10000000-0000-0000-0000-000000000021', 'e0000000-0000-0000-0000-000000009001'),
    ('10000000-0000-0000-0000-000000000021', 'e0000000-0000-0000-0000-000000022000'),
    -- Jose Gregorio Goncalves (JG, C.I. 10756009)
    ('10000000-0000-0000-0000-000000000022', 'e0000000-0000-0000-0000-000000009001'),
    -- Juan Paulo Torrealba (JPT, C.I. 14485899)
    ('10000000-0000-0000-0000-000000000023', 'e0000000-0000-0000-0000-000000009001'),
    -- Juan Hermann (JH, C.I. 3507585)
    ('10000000-0000-0000-0000-000000000024', 'e0000000-0000-0000-0000-000000009001'),
    ('10000000-0000-0000-0000-000000000024', 'e0000000-0000-0000-0000-000000014001'),
    -- Karol Yulay Sánchez De Ghiano (KSG, C.I. 17039885)
    ('10000000-0000-0000-0000-000000000025', 'e0000000-0000-0000-0000-000000009001'),
    -- Leonardo Ladera (LL, C.I. 12764568)
    ('10000000-0000-0000-0000-000000000026', 'e0000000-0000-0000-0000-000000009001'),
    -- Luis Matamoros (LM, C.I. 13909537)
    ('10000000-0000-0000-0000-000000000027', 'e0000000-0000-0000-0000-000000009001'),
    -- Luis Blanco (LB, C.I. 5305469)
    ('10000000-0000-0000-0000-000000000028', 'e0000000-0000-0000-0000-000000009001'),
    ('10000000-0000-0000-0000-000000000028', 'e0000000-0000-0000-0000-000000022000'),
    -- Luz María Rivas Sánchez (LMR, C.I. 5268661)
    ('10000000-0000-0000-0000-000000000029', 'e0000000-0000-0000-0000-000000009001'),
    -- Magyory Suarez (MS, C.I. 11294442)
    ('10000000-0000-0000-0000-000000000030', 'e0000000-0000-0000-0000-000000009001'),
    -- Manuel Quintana (MQ, C.I. 12640951)
    ('10000000-0000-0000-0000-000000000031', 'e0000000-0000-0000-0000-000000009001'),
    ('10000000-0000-0000-0000-000000000031', 'e0000000-0000-0000-0000-000000014001'),
    ('10000000-0000-0000-0000-000000000031', 'e0000000-0000-0000-0000-000000045001'),
    -- Maria Rivas (MR, C.I. 10717513)
    ('10000000-0000-0000-0000-000000000032', 'e0000000-0000-0000-0000-000000009001'),
    -- Maria Auxiliadora Cadena (MAC, C.I. 4923686)
    ('10000000-0000-0000-0000-000000000033', 'e0000000-0000-0000-0000-000000009001'),
    ('10000000-0000-0000-0000-000000000033', 'e0000000-0000-0000-0000-000000014001'),
    -- Ximena Pacheco (XP, C.I. 14261576)
    ('10000000-0000-0000-0000-000000000034', 'e0000000-0000-0000-0000-000000009001'),
    ('10000000-0000-0000-0000-000000000034', 'e0000000-0000-0000-0000-000000014001'),
    ('10000000-0000-0000-0000-000000000034', 'e0000000-0000-0000-0000-000000045001'),
    -- Oscar Quintero (OQ, C.I. 7130726)
    ('10000000-0000-0000-0000-000000000036', 'e0000000-0000-0000-0000-000000009001'),
    -- Pablo César Galvis Salamanca (PG, C.I. 9224637)
    ('10000000-0000-0000-0000-000000000037', 'e0000000-0000-0000-0000-000000009001'),
    -- Pablo Mora (PM, C.I. 13727311)
    ('10000000-0000-0000-0000-000000000038', 'e0000000-0000-0000-0000-000000009001'),
    -- Pedro Vargas (PV, C.I. 10929397)
    ('10000000-0000-0000-0000-000000000039', 'e0000000-0000-0000-0000-000000009001'),
    -- Ricardo Araujo (RA, C.I. 7091039)
    ('10000000-0000-0000-0000-000000000040', 'e0000000-0000-0000-0000-000000009001'),
    ('10000000-0000-0000-0000-000000000040', 'e0000000-0000-0000-0000-000000014001'),
    ('10000000-0000-0000-0000-000000000040', 'e0000000-0000-0000-0000-000000045001'),
    -- Sheilar Peña (SP, C.I. 15912976)
    ('10000000-0000-0000-0000-000000000041', 'e0000000-0000-0000-0000-000000009001'),
    ('10000000-0000-0000-0000-000000000041', 'e0000000-0000-0000-0000-000000014001'),
    -- Victor Blanco (VB, C.I. 4803380)
    ('10000000-0000-0000-0000-000000000042', 'e0000000-0000-0000-0000-000000009001'),
    -- Wolfgang Peuchert (WP, C.I. 6949008)
    ('10000000-0000-0000-0000-000000000043', 'e0000000-0000-0000-0000-000000014001'),
    ('10000000-0000-0000-0000-000000000043', 'e0000000-0000-0000-0000-000000045001'),
    -- Yamila Dumont (YD, C.I. 11821514)
    ('10000000-0000-0000-0000-000000000044', 'e0000000-0000-0000-0000-000000009001'),
    ('10000000-0000-0000-0000-000000000044', 'e0000000-0000-0000-0000-000000022000'),
    -- Yurima Carrillo (YC, C.I. 7137643)
    ('10000000-0000-0000-0000-000000000045', 'e0000000-0000-0000-0000-000000009001'),
    ('10000000-0000-0000-0000-000000000045', 'e0000000-0000-0000-0000-000000014001'),
    -- Yarleska Jimenez (YJ, C.I. 11049843)
    ('10000000-0000-0000-0000-000000000046', 'e0000000-0000-0000-0000-000000022000'),
    -- Yurima Carrillo (YC, C.I. 12310919)
    ('10000000-0000-0000-0000-000000000047', 'e0000000-0000-0000-0000-000000009001'),
    ('10000000-0000-0000-0000-000000000047', 'e0000000-0000-0000-0000-000000014001')
ON CONFLICT (id_auditor, id_norma) DO NOTHING;

INSERT INTO public.sector_iaf_auditor (id_auditor, id_sector_iaf) VALUES
    -- Auditor Técnico Evaluador: 03, 17, 33
    ('33333333-3333-3333-3333-333333333333', 'd0000000-0000-0000-0000-000000000003'),
    ('33333333-3333-3333-3333-333333333333', 'd0000000-0000-0000-0000-000000000017'),
    ('33333333-3333-3333-3333-333333333333', 'd0000000-0000-0000-0000-000000000033'),
    -- Keyla Cristina Soteldo de Páez (KS)
    ('10000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000017'),
    ('10000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000018'),
    ('10000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000031'),
    ('10000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000033'),
    ('10000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000034'),
    ('10000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000035'),
    -- Félix Horacio Rojas Machado (FR)
    ('10000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000002'),
    ('10000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000004'),
    ('10000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000010'),
    ('10000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000012'),
    ('10000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000014'),
    ('10000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000016'),
    ('10000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000026'),
    ('10000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000034'),
    -- José Ramón Polo Faría (JRP)
    ('10000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000009'),
    ('10000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000029'),
    ('10000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000030'),
    ('10000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000031'),
    ('10000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000032'),
    ('10000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000034'),
    ('10000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000035'),
    ('10000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000038'),
    -- Leonardo Antonio Rojas Gómez (LR)
    ('10000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000003'),
    ('10000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000010'),
    ('10000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000012'),
    ('10000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000014'),
    ('10000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000016'),
    ('10000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000026'),
    ('10000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000031'),
    ('10000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000034'),
    -- Nordy Armando Fuentes (NF)
    ('10000000-0000-0000-0000-000000000005', 'd0000000-0000-0000-0000-000000000004'),
    ('10000000-0000-0000-0000-000000000005', 'd0000000-0000-0000-0000-000000000005'),
    ('10000000-0000-0000-0000-000000000005', 'd0000000-0000-0000-0000-000000000006'),
    ('10000000-0000-0000-0000-000000000005', 'd0000000-0000-0000-0000-000000000007'),
    ('10000000-0000-0000-0000-000000000005', 'd0000000-0000-0000-0000-000000000029'),
    ('10000000-0000-0000-0000-000000000005', 'd0000000-0000-0000-0000-000000000031'),
    ('10000000-0000-0000-0000-000000000005', 'd0000000-0000-0000-0000-000000000034'),
    ('10000000-0000-0000-0000-000000000005', 'd0000000-0000-0000-0000-000000000038'),
    -- Manuel Arturo Fernández Martínez (MF)
    ('10000000-0000-0000-0000-000000000006', 'd0000000-0000-0000-0000-000000000016'),
    ('10000000-0000-0000-0000-000000000006', 'd0000000-0000-0000-0000-000000000017'),
    ('10000000-0000-0000-0000-000000000006', 'd0000000-0000-0000-0000-000000000018'),
    ('10000000-0000-0000-0000-000000000006', 'd0000000-0000-0000-0000-000000000022'),
    ('10000000-0000-0000-0000-000000000006', 'd0000000-0000-0000-0000-000000000029'),
    ('10000000-0000-0000-0000-000000000006', 'd0000000-0000-0000-0000-000000000031'),
    ('10000000-0000-0000-0000-000000000006', 'd0000000-0000-0000-0000-000000000034'),
    -- Nelson Rafael Arteaga Quevedo (NA)
    ('10000000-0000-0000-0000-000000000007', 'd0000000-0000-0000-0000-000000000010'),
    ('10000000-0000-0000-0000-000000000007', 'd0000000-0000-0000-0000-000000000012'),
    ('10000000-0000-0000-0000-000000000007', 'd0000000-0000-0000-0000-000000000013'),
    ('10000000-0000-0000-0000-000000000007', 'd0000000-0000-0000-0000-000000000014'),
    ('10000000-0000-0000-0000-000000000007', 'd0000000-0000-0000-0000-000000000016'),
    ('10000000-0000-0000-0000-000000000007', 'd0000000-0000-0000-0000-000000000026'),
    ('10000000-0000-0000-0000-000000000007', 'd0000000-0000-0000-0000-000000000034'),
    -- Yuliber Alejandra Blanco Díaz (YB)
    ('10000000-0000-0000-0000-000000000008', 'd0000000-0000-0000-0000-000000000007'),
    ('10000000-0000-0000-0000-000000000008', 'd0000000-0000-0000-0000-000000000009'),
    ('10000000-0000-0000-0000-000000000008', 'd0000000-0000-0000-0000-000000000010'),
    ('10000000-0000-0000-0000-000000000008', 'd0000000-0000-0000-0000-000000000012'),
    ('10000000-0000-0000-0000-000000000008', 'd0000000-0000-0000-0000-000000000013'),
    ('10000000-0000-0000-0000-000000000008', 'd0000000-0000-0000-0000-000000000014'),
    ('10000000-0000-0000-0000-000000000008', 'd0000000-0000-0000-0000-000000000029'),
    ('10000000-0000-0000-0000-000000000008', 'd0000000-0000-0000-0000-000000000031'),
    -- Edgar José Cachutt Márquez (ECH)
    ('10000000-0000-0000-0000-000000000009', 'd0000000-0000-0000-0000-000000000010'),
    ('10000000-0000-0000-0000-000000000009', 'd0000000-0000-0000-0000-000000000015'),
    ('10000000-0000-0000-0000-000000000009', 'd0000000-0000-0000-0000-000000000016'),
    ('10000000-0000-0000-0000-000000000009', 'd0000000-0000-0000-0000-000000000028'),
    ('10000000-0000-0000-0000-000000000009', 'd0000000-0000-0000-0000-000000000031'),
    ('10000000-0000-0000-0000-000000000009', 'd0000000-0000-0000-0000-000000000034'),
    -- Ismael Enrique Díaz Valera (ID)
    ('10000000-0000-0000-0000-000000000010', 'd0000000-0000-0000-0000-000000000019'),
    ('10000000-0000-0000-0000-000000000010', 'd0000000-0000-0000-0000-000000000025'),
    ('10000000-0000-0000-0000-000000000010', 'd0000000-0000-0000-0000-000000000032'),
    ('10000000-0000-0000-0000-000000000010', 'd0000000-0000-0000-0000-000000000033'),
    ('10000000-0000-0000-0000-000000000010', 'd0000000-0000-0000-0000-000000000034'),
    -- Ana Karina Sanchez (AKS)
    ('10000000-0000-0000-0000-000000000011', 'd0000000-0000-0000-0000-000000000031'),
    -- Betzy Gil (BG)
    ('10000000-0000-0000-0000-000000000012', 'd0000000-0000-0000-0000-000000000014'),
    ('10000000-0000-0000-0000-000000000012', 'd0000000-0000-0000-0000-000000000018'),
    -- Carlos Vasquez (CV)
    ('10000000-0000-0000-0000-000000000013', 'd0000000-0000-0000-0000-000000000017'),
    ('10000000-0000-0000-0000-000000000013', 'd0000000-0000-0000-0000-000000000018'),
    ('10000000-0000-0000-0000-000000000013', 'd0000000-0000-0000-0000-000000000022'),
    ('10000000-0000-0000-0000-000000000013', 'd0000000-0000-0000-0000-000000000029'),
    -- Carlos Gonzalez (CG)
    ('10000000-0000-0000-0000-000000000014', 'd0000000-0000-0000-0000-000000000003'),
    ('10000000-0000-0000-0000-000000000014', 'd0000000-0000-0000-0000-000000000035'),
    -- Carlos Villareal (CVC)
    ('10000000-0000-0000-0000-000000000015', 'd0000000-0000-0000-0000-000000000012'),
    -- Daney Penaloza (DPZ)
    ('10000000-0000-0000-0000-000000000016', 'd0000000-0000-0000-0000-000000000003'),
    ('10000000-0000-0000-0000-000000000016', 'd0000000-0000-0000-0000-000000000031'),
    -- Denise Colina (DC)
    ('10000000-0000-0000-0000-000000000017', 'd0000000-0000-0000-0000-000000000009'),
    ('10000000-0000-0000-0000-000000000017', 'd0000000-0000-0000-0000-000000000010'),
    ('10000000-0000-0000-0000-000000000017', 'd0000000-0000-0000-0000-000000000012'),
    -- Douglas Infante (DI)
    ('10000000-0000-0000-0000-000000000018', 'd0000000-0000-0000-0000-000000000003'),
    ('10000000-0000-0000-0000-000000000018', 'd0000000-0000-0000-0000-000000000012'),
    ('10000000-0000-0000-0000-000000000018', 'd0000000-0000-0000-0000-000000000014'),
    ('10000000-0000-0000-0000-000000000018', 'd0000000-0000-0000-0000-000000000031'),
    -- Genny Mendoza (GM)
    ('10000000-0000-0000-0000-000000000019', 'd0000000-0000-0000-0000-000000000010'),
    ('10000000-0000-0000-0000-000000000019', 'd0000000-0000-0000-0000-000000000034'),
    -- Gilberto Villalba (GV)
    ('10000000-0000-0000-0000-000000000020', 'd0000000-0000-0000-0000-000000000018'),
    ('10000000-0000-0000-0000-000000000020', 'd0000000-0000-0000-0000-000000000029'),
    -- Ivan Gonzalez (IG)
    ('10000000-0000-0000-0000-000000000021', 'd0000000-0000-0000-0000-000000000003'),
    ('10000000-0000-0000-0000-000000000021', 'd0000000-0000-0000-0000-000000000013'),
    ('10000000-0000-0000-0000-000000000021', 'd0000000-0000-0000-0000-000000000029'),
    ('10000000-0000-0000-0000-000000000021', 'd0000000-0000-0000-0000-000000000038'),
    -- Jose Gregorio Goncalves (JG)
    ('10000000-0000-0000-0000-000000000022', 'd0000000-0000-0000-0000-000000000017'),
    ('10000000-0000-0000-0000-000000000022', 'd0000000-0000-0000-0000-000000000018'),
    -- Juan Paulo Torrealba (JPT)
    ('10000000-0000-0000-0000-000000000023', 'd0000000-0000-0000-0000-000000000037'),
    -- Juan Hermann (JH)
    ('10000000-0000-0000-0000-000000000024', 'd0000000-0000-0000-0000-000000000020'),
    ('10000000-0000-0000-0000-000000000024', 'd0000000-0000-0000-0000-000000000024'),
    ('10000000-0000-0000-0000-000000000024', 'd0000000-0000-0000-0000-000000000031'),
    ('10000000-0000-0000-0000-000000000024', 'd0000000-0000-0000-0000-000000000035'),
    ('10000000-0000-0000-0000-000000000024', 'd0000000-0000-0000-0000-000000000036'),
    ('10000000-0000-0000-0000-000000000024', 'd0000000-0000-0000-0000-000000000037'),
    -- Leonardo Ladera (LL)
    ('10000000-0000-0000-0000-000000000026', 'd0000000-0000-0000-0000-000000000029'),
    ('10000000-0000-0000-0000-000000000026', 'd0000000-0000-0000-0000-000000000038'),
    -- Luis Matamoros (LM)
    ('10000000-0000-0000-0000-000000000027', 'd0000000-0000-0000-0000-000000000006'),
    ('10000000-0000-0000-0000-000000000027', 'd0000000-0000-0000-0000-000000000015'),
    ('10000000-0000-0000-0000-000000000027', 'd0000000-0000-0000-0000-000000000017'),
    ('10000000-0000-0000-0000-000000000027', 'd0000000-0000-0000-0000-000000000018'),
    ('10000000-0000-0000-0000-000000000027', 'd0000000-0000-0000-0000-000000000034'),
    -- Luis Blanco (LB)
    ('10000000-0000-0000-0000-000000000028', 'd0000000-0000-0000-0000-000000000003'),
    ('10000000-0000-0000-0000-000000000028', 'd0000000-0000-0000-0000-000000000038'),
    -- Magyory Suarez (MS)
    ('10000000-0000-0000-0000-000000000030', 'd0000000-0000-0000-0000-000000000031'),
    ('10000000-0000-0000-0000-000000000030', 'd0000000-0000-0000-0000-000000000035'),
    ('10000000-0000-0000-0000-000000000030', 'd0000000-0000-0000-0000-000000000037'),
    ('10000000-0000-0000-0000-000000000030', 'd0000000-0000-0000-0000-000000000039'),
    -- Manuel Quintana (MQ)
    ('10000000-0000-0000-0000-000000000031', 'd0000000-0000-0000-0000-000000000031'),
    -- Maria Rivas (MR)
    ('10000000-0000-0000-0000-000000000032', 'd0000000-0000-0000-0000-000000000010'),
    ('10000000-0000-0000-0000-000000000032', 'd0000000-0000-0000-0000-000000000016'),
    ('10000000-0000-0000-0000-000000000032', 'd0000000-0000-0000-0000-000000000028'),
    ('10000000-0000-0000-0000-000000000032', 'd0000000-0000-0000-0000-000000000034'),
    ('10000000-0000-0000-0000-000000000032', 'd0000000-0000-0000-0000-000000000035'),
    -- Maria Auxiliadora Cadena (MAC)
    ('10000000-0000-0000-0000-000000000033', 'd0000000-0000-0000-0000-000000000001'),
    ('10000000-0000-0000-0000-000000000033', 'd0000000-0000-0000-0000-000000000003'),
    ('10000000-0000-0000-0000-000000000033', 'd0000000-0000-0000-0000-000000000035'),
    -- Ximena Pacheco (XP)
    ('10000000-0000-0000-0000-000000000034', 'd0000000-0000-0000-0000-000000000012'),
    ('10000000-0000-0000-0000-000000000034', 'd0000000-0000-0000-0000-000000000014'),
    ('10000000-0000-0000-0000-000000000034', 'd0000000-0000-0000-0000-000000000024'),
    ('10000000-0000-0000-0000-000000000034', 'd0000000-0000-0000-0000-000000000031'),
    ('10000000-0000-0000-0000-000000000034', 'd0000000-0000-0000-0000-000000000034'),
    -- Óscar Ríos (OR)
    ('10000000-0000-0000-0000-000000000035', 'd0000000-0000-0000-0000-000000000010'),
    ('10000000-0000-0000-0000-000000000035', 'd0000000-0000-0000-0000-000000000012'),
    ('10000000-0000-0000-0000-000000000035', 'd0000000-0000-0000-0000-000000000014'),
    ('10000000-0000-0000-0000-000000000035', 'd0000000-0000-0000-0000-000000000035'),
    -- Oscar Quintero (OQ)
    ('10000000-0000-0000-0000-000000000036', 'd0000000-0000-0000-0000-000000000005'),
    ('10000000-0000-0000-0000-000000000036', 'd0000000-0000-0000-0000-000000000029'),
    ('10000000-0000-0000-0000-000000000036', 'd0000000-0000-0000-0000-000000000035'),
    ('10000000-0000-0000-0000-000000000036', 'd0000000-0000-0000-0000-000000000037'),
    -- Pablo Mora (PM)
    ('10000000-0000-0000-0000-000000000038', 'd0000000-0000-0000-0000-000000000010'),
    ('10000000-0000-0000-0000-000000000038', 'd0000000-0000-0000-0000-000000000016'),
    ('10000000-0000-0000-0000-000000000038', 'd0000000-0000-0000-0000-000000000028'),
    ('10000000-0000-0000-0000-000000000038', 'd0000000-0000-0000-0000-000000000034'),
    -- Pedro Vargas (PV)
    ('10000000-0000-0000-0000-000000000039', 'd0000000-0000-0000-0000-000000000017'),
    ('10000000-0000-0000-0000-000000000039', 'd0000000-0000-0000-0000-000000000018'),
    -- Ricardo Araujo (RA)
    ('10000000-0000-0000-0000-000000000040', 'd0000000-0000-0000-0000-000000000003'),
    ('10000000-0000-0000-0000-000000000040', 'd0000000-0000-0000-0000-000000000010'),
    ('10000000-0000-0000-0000-000000000040', 'd0000000-0000-0000-0000-000000000012'),
    ('10000000-0000-0000-0000-000000000040', 'd0000000-0000-0000-0000-000000000014'),
    -- Sheilar Peña (SP)
    ('10000000-0000-0000-0000-000000000041', 'd0000000-0000-0000-0000-000000000010'),
    ('10000000-0000-0000-0000-000000000041', 'd0000000-0000-0000-0000-000000000012'),
    ('10000000-0000-0000-0000-000000000041', 'd0000000-0000-0000-0000-000000000038'),
    -- Victor Blanco (VB)
    ('10000000-0000-0000-0000-000000000042', 'd0000000-0000-0000-0000-000000000019'),
    ('10000000-0000-0000-0000-000000000042', 'd0000000-0000-0000-0000-000000000025'),
    -- Wolfgang Peuchert (WP)
    ('10000000-0000-0000-0000-000000000043', 'd0000000-0000-0000-0000-000000000029'),
    ('10000000-0000-0000-0000-000000000043', 'd0000000-0000-0000-0000-000000000034'),
    -- Yamila Dumont (YD)
    ('10000000-0000-0000-0000-000000000044', 'd0000000-0000-0000-0000-000000000007'),
    ('10000000-0000-0000-0000-000000000044', 'd0000000-0000-0000-0000-000000000015'),
    ('10000000-0000-0000-0000-000000000044', 'd0000000-0000-0000-0000-000000000031'),
    -- Yurima Carrillo (YC)
    ('10000000-0000-0000-0000-000000000045', 'd0000000-0000-0000-0000-000000000010'),
    ('10000000-0000-0000-0000-000000000045', 'd0000000-0000-0000-0000-000000000012'),
    ('10000000-0000-0000-0000-000000000045', 'd0000000-0000-0000-0000-000000000014'),
    ('10000000-0000-0000-0000-000000000045', 'd0000000-0000-0000-0000-000000000037'),
    -- Yarleska Jimenez (YJ)
    ('10000000-0000-0000-0000-000000000046', 'd0000000-0000-0000-0000-000000000003'),
    -- Yurima Carrillo (YC)
    ('10000000-0000-0000-0000-000000000047', 'd0000000-0000-0000-0000-000000000010'),
    ('10000000-0000-0000-0000-000000000047', 'd0000000-0000-0000-0000-000000000012'),
    ('10000000-0000-0000-0000-000000000047', 'd0000000-0000-0000-0000-000000000014'),
    ('10000000-0000-0000-0000-000000000047', 'd0000000-0000-0000-0000-000000000037')
ON CONFLICT (id_auditor, id_sector_iaf) DO NOTHING;

INSERT INTO public.subsector_iaf_auditor (id_auditor, id_subsector_iaf) VALUES
    -- Auditor Técnico Evaluador: 03.1, 17.1, 17.2, 33.1
    ('33333333-3333-3333-3333-333333333333', 'da000000-0000-0000-0000-000000000031'),
    ('33333333-3333-3333-3333-333333333333', 'da000000-0000-0000-0000-000000000171'),
    ('33333333-3333-3333-3333-333333333333', 'da000000-0000-0000-0000-000000000172'),
    ('33333333-3333-3333-3333-333333333333', 'da000000-0000-0000-0000-000000000331'),
    -- Keyla Cristina Soteldo de Páez (KS)
    ('10000000-0000-0000-0000-000000000001', 'da000000-0000-0000-0000-000000000171'),
    ('10000000-0000-0000-0000-000000000001', 'da000000-0000-0000-0000-000000000172'),
    ('10000000-0000-0000-0000-000000000001', 'da000000-0000-0000-0000-000000000181'),
    ('10000000-0000-0000-0000-000000000001', 'da000000-0000-0000-0000-000000000182'),
    ('10000000-0000-0000-0000-000000000001', 'da000000-0000-0000-0000-000000000314'),
    ('10000000-0000-0000-0000-000000000001', 'da000000-0000-0000-0000-000000000331'),
    ('10000000-0000-0000-0000-000000000001', 'da000000-0000-0000-0000-000000000341'),
    ('10000000-0000-0000-0000-000000000001', 'da000000-0000-0000-0000-000000000357'),
    -- Félix Horacio Rojas Machado (FR)
    ('10000000-0000-0000-0000-000000000002', 'da000000-0000-0000-0000-000000000022'),
    ('10000000-0000-0000-0000-000000000002', 'da000000-0000-0000-0000-000000000041'),
    ('10000000-0000-0000-0000-000000000002', 'da000000-0000-0000-0000-000000000101'),
    ('10000000-0000-0000-0000-000000000002', 'da000000-0000-0000-0000-000000000102'),
    ('10000000-0000-0000-0000-000000000002', 'da000000-0000-0000-0000-000000000121'),
    ('10000000-0000-0000-0000-000000000002', 'da000000-0000-0000-0000-000000000122'),
    ('10000000-0000-0000-0000-000000000002', 'da000000-0000-0000-0000-000000000141'),
    ('10000000-0000-0000-0000-000000000002', 'da000000-0000-0000-0000-000000000161'),
    ('10000000-0000-0000-0000-000000000002', 'da000000-0000-0000-0000-000000000261'),
    ('10000000-0000-0000-0000-000000000002', 'da000000-0000-0000-0000-000000000341'),
    -- José Ramón Polo Faría (JRP)
    ('10000000-0000-0000-0000-000000000003', 'da000000-0000-0000-0000-000000000091'),
    ('10000000-0000-0000-0000-000000000003', 'da000000-0000-0000-0000-000000000292'),
    ('10000000-0000-0000-0000-000000000003', 'da000000-0000-0000-0000-000000000301'),
    ('10000000-0000-0000-0000-000000000003', 'da000000-0000-0000-0000-000000000314'),
    ('10000000-0000-0000-0000-000000000003', 'da000000-0000-0000-0000-000000000321'),
    ('10000000-0000-0000-0000-000000000003', 'da000000-0000-0000-0000-000000000341'),
    ('10000000-0000-0000-0000-000000000003', 'da000000-0000-0000-0000-000000000356'),
    ('10000000-0000-0000-0000-000000000003', 'da000000-0000-0000-0000-000000000357'),
    ('10000000-0000-0000-0000-000000000003', 'da000000-0000-0000-0000-000000000382'),
    -- Leonardo Antonio Rojas Gómez (LR)
    ('10000000-0000-0000-0000-000000000004', 'da000000-0000-0000-0000-000000000031'),
    ('10000000-0000-0000-0000-000000000004', 'da000000-0000-0000-0000-000000000101'),
    ('10000000-0000-0000-0000-000000000004', 'da000000-0000-0000-0000-000000000102'),
    ('10000000-0000-0000-0000-000000000004', 'da000000-0000-0000-0000-000000000121'),
    ('10000000-0000-0000-0000-000000000004', 'da000000-0000-0000-0000-000000000122'),
    ('10000000-0000-0000-0000-000000000004', 'da000000-0000-0000-0000-000000000141'),
    ('10000000-0000-0000-0000-000000000004', 'da000000-0000-0000-0000-000000000161'),
    ('10000000-0000-0000-0000-000000000004', 'da000000-0000-0000-0000-000000000261'),
    ('10000000-0000-0000-0000-000000000004', 'da000000-0000-0000-0000-000000000311'),
    ('10000000-0000-0000-0000-000000000004', 'da000000-0000-0000-0000-000000000341'),
    ('10000000-0000-0000-0000-000000000004', 'da000000-0000-0000-0000-000000000343'),
    -- Nordy Armando Fuentes (NF)
    ('10000000-0000-0000-0000-000000000005', 'da000000-0000-0000-0000-000000000041'),
    ('10000000-0000-0000-0000-000000000005', 'da000000-0000-0000-0000-000000000051'),
    ('10000000-0000-0000-0000-000000000005', 'da000000-0000-0000-0000-000000000061'),
    ('10000000-0000-0000-0000-000000000005', 'da000000-0000-0000-0000-000000000071'),
    ('10000000-0000-0000-0000-000000000005', 'da000000-0000-0000-0000-000000000292'),
    ('10000000-0000-0000-0000-000000000005', 'da000000-0000-0000-0000-000000000314'),
    ('10000000-0000-0000-0000-000000000005', 'da000000-0000-0000-0000-000000000317'),
    ('10000000-0000-0000-0000-000000000005', 'da000000-0000-0000-0000-000000000341'),
    ('10000000-0000-0000-0000-000000000005', 'da000000-0000-0000-0000-000000000382'),
    -- Manuel Arturo Fernández Martínez (MF)
    ('10000000-0000-0000-0000-000000000006', 'da000000-0000-0000-0000-000000000161'),
    ('10000000-0000-0000-0000-000000000006', 'da000000-0000-0000-0000-000000000171'),
    ('10000000-0000-0000-0000-000000000006', 'da000000-0000-0000-0000-000000000172'),
    ('10000000-0000-0000-0000-000000000006', 'da000000-0000-0000-0000-000000000181'),
    ('10000000-0000-0000-0000-000000000006', 'da000000-0000-0000-0000-000000000221'),
    ('10000000-0000-0000-0000-000000000006', 'da000000-0000-0000-0000-000000000223'),
    ('10000000-0000-0000-0000-000000000006', 'da000000-0000-0000-0000-000000000224'),
    ('10000000-0000-0000-0000-000000000006', 'da000000-0000-0000-0000-000000000292'),
    ('10000000-0000-0000-0000-000000000006', 'da000000-0000-0000-0000-000000000314'),
    ('10000000-0000-0000-0000-000000000006', 'da000000-0000-0000-0000-000000000341'),
    -- Nelson Rafael Arteaga Quevedo (NA)
    ('10000000-0000-0000-0000-000000000007', 'da000000-0000-0000-0000-000000000101'),
    ('10000000-0000-0000-0000-000000000007', 'da000000-0000-0000-0000-000000000102'),
    ('10000000-0000-0000-0000-000000000007', 'da000000-0000-0000-0000-000000000121'),
    ('10000000-0000-0000-0000-000000000007', 'da000000-0000-0000-0000-000000000131'),
    ('10000000-0000-0000-0000-000000000007', 'da000000-0000-0000-0000-000000000141'),
    ('10000000-0000-0000-0000-000000000007', 'da000000-0000-0000-0000-000000000161'),
    ('10000000-0000-0000-0000-000000000007', 'da000000-0000-0000-0000-000000000261'),
    ('10000000-0000-0000-0000-000000000007', 'da000000-0000-0000-0000-000000000342'),
    -- Yuliber Alejandra Blanco Díaz (YB)
    ('10000000-0000-0000-0000-000000000008', 'da000000-0000-0000-0000-000000000071'),
    ('10000000-0000-0000-0000-000000000008', 'da000000-0000-0000-0000-000000000091'),
    ('10000000-0000-0000-0000-000000000008', 'da000000-0000-0000-0000-000000000101'),
    ('10000000-0000-0000-0000-000000000008', 'da000000-0000-0000-0000-000000000102'),
    ('10000000-0000-0000-0000-000000000008', 'da000000-0000-0000-0000-000000000121'),
    ('10000000-0000-0000-0000-000000000008', 'da000000-0000-0000-0000-000000000131'),
    ('10000000-0000-0000-0000-000000000008', 'da000000-0000-0000-0000-000000000141'),
    ('10000000-0000-0000-0000-000000000008', 'da000000-0000-0000-0000-000000000292'),
    ('10000000-0000-0000-0000-000000000008', 'da000000-0000-0000-0000-000000000314'),
    -- Edgar José Cachutt Márquez (ECH)
    ('10000000-0000-0000-0000-000000000009', 'da000000-0000-0000-0000-000000000101'),
    ('10000000-0000-0000-0000-000000000009', 'da000000-0000-0000-0000-000000000151'),
    ('10000000-0000-0000-0000-000000000009', 'da000000-0000-0000-0000-000000000161'),
    ('10000000-0000-0000-0000-000000000009', 'da000000-0000-0000-0000-000000000281'),
    ('10000000-0000-0000-0000-000000000009', 'da000000-0000-0000-0000-000000000311'),
    ('10000000-0000-0000-0000-000000000009', 'da000000-0000-0000-0000-000000000341'),
    -- Ismael Enrique Díaz Valera (ID)
    ('10000000-0000-0000-0000-000000000010', 'da000000-0000-0000-0000-000000000191'),
    ('10000000-0000-0000-0000-000000000010', 'da000000-0000-0000-0000-000000000192'),
    ('10000000-0000-0000-0000-000000000010', 'da000000-0000-0000-0000-000000000193'),
    ('10000000-0000-0000-0000-000000000010', 'da000000-0000-0000-0000-000000000194'),
    ('10000000-0000-0000-0000-000000000010', 'da000000-0000-0000-0000-000000000251'),
    ('10000000-0000-0000-0000-000000000010', 'da000000-0000-0000-0000-000000000321'),
    ('10000000-0000-0000-0000-000000000010', 'da000000-0000-0000-0000-000000000331'),
    ('10000000-0000-0000-0000-000000000010', 'da000000-0000-0000-0000-000000000341'),
    -- Ana Karina Sanchez (AKS)
    ('10000000-0000-0000-0000-000000000011', 'da000000-0000-0000-0000-000000000314'),
    -- Betzy Gil (BG)
    ('10000000-0000-0000-0000-000000000012', 'da000000-0000-0000-0000-000000000141'),
    ('10000000-0000-0000-0000-000000000012', 'da000000-0000-0000-0000-000000000181'),
    ('10000000-0000-0000-0000-000000000012', 'da000000-0000-0000-0000-000000000182'),
    -- Carlos Vasquez (CV)
    ('10000000-0000-0000-0000-000000000013', 'da000000-0000-0000-0000-000000000171'),
    ('10000000-0000-0000-0000-000000000013', 'da000000-0000-0000-0000-000000000172'),
    ('10000000-0000-0000-0000-000000000013', 'da000000-0000-0000-0000-000000000181'),
    ('10000000-0000-0000-0000-000000000013', 'da000000-0000-0000-0000-000000000182'),
    ('10000000-0000-0000-0000-000000000013', 'da000000-0000-0000-0000-000000000221'),
    ('10000000-0000-0000-0000-000000000013', 'da000000-0000-0000-0000-000000000222'),
    ('10000000-0000-0000-0000-000000000013', 'da000000-0000-0000-0000-000000000223'),
    ('10000000-0000-0000-0000-000000000013', 'da000000-0000-0000-0000-000000000291'),
    ('10000000-0000-0000-0000-000000000013', 'da000000-0000-0000-0000-000000000292'),
    -- Carlos Gonzalez (CG)
    ('10000000-0000-0000-0000-000000000014', 'da000000-0000-0000-0000-000000000031'),
    ('10000000-0000-0000-0000-000000000014', 'da000000-0000-0000-0000-000000000357'),
    ('10000000-0000-0000-0000-000000000014', 'da000000-0000-0000-0000-000000003511'),
    -- Carlos Villareal (CVC)
    ('10000000-0000-0000-0000-000000000015', 'da000000-0000-0000-0000-000000000121'),
    -- Daney Penaloza (DPZ)
    ('10000000-0000-0000-0000-000000000016', 'da000000-0000-0000-0000-000000000031'),
    ('10000000-0000-0000-0000-000000000016', 'da000000-0000-0000-0000-000000000314'),
    -- Denise Colina (DC)
    ('10000000-0000-0000-0000-000000000017', 'da000000-0000-0000-0000-000000000091'),
    ('10000000-0000-0000-0000-000000000017', 'da000000-0000-0000-0000-000000000101'),
    ('10000000-0000-0000-0000-000000000017', 'da000000-0000-0000-0000-000000000102'),
    ('10000000-0000-0000-0000-000000000017', 'da000000-0000-0000-0000-000000000121'),
    -- Douglas Infante (DI)
    ('10000000-0000-0000-0000-000000000018', 'da000000-0000-0000-0000-000000000031'),
    ('10000000-0000-0000-0000-000000000018', 'da000000-0000-0000-0000-000000000121'),
    ('10000000-0000-0000-0000-000000000018', 'da000000-0000-0000-0000-000000000141'),
    ('10000000-0000-0000-0000-000000000018', 'da000000-0000-0000-0000-000000000314'),
    -- Genny Mendoza (GM)
    ('10000000-0000-0000-0000-000000000019', 'da000000-0000-0000-0000-000000000101'),
    ('10000000-0000-0000-0000-000000000019', 'da000000-0000-0000-0000-000000000102'),
    ('10000000-0000-0000-0000-000000000019', 'da000000-0000-0000-0000-000000000341'),
    -- Gilberto Villalba (GV)
    ('10000000-0000-0000-0000-000000000020', 'da000000-0000-0000-0000-000000000181'),
    ('10000000-0000-0000-0000-000000000020', 'da000000-0000-0000-0000-000000000292'),
    -- Ivan Gonzalez (IG)
    ('10000000-0000-0000-0000-000000000021', 'da000000-0000-0000-0000-000000000031'),
    ('10000000-0000-0000-0000-000000000021', 'da000000-0000-0000-0000-000000000131'),
    ('10000000-0000-0000-0000-000000000021', 'da000000-0000-0000-0000-000000000292'),
    ('10000000-0000-0000-0000-000000000021', 'da000000-0000-0000-0000-000000000382'),
    ('10000000-0000-0000-0000-000000000021', 'da000000-0000-0000-0000-000000000383'),
    -- Jose Gregorio Goncalves (JG)
    ('10000000-0000-0000-0000-000000000022', 'da000000-0000-0000-0000-000000000171'),
    ('10000000-0000-0000-0000-000000000022', 'da000000-0000-0000-0000-000000000172'),
    ('10000000-0000-0000-0000-000000000022', 'da000000-0000-0000-0000-000000000181'),
    -- Juan Paulo Torrealba (JPT)
    ('10000000-0000-0000-0000-000000000023', 'da000000-0000-0000-0000-000000000371'),
    ('10000000-0000-0000-0000-000000000023', 'da000000-0000-0000-0000-000000000372'),
    -- Juan Hermann (JH)
    ('10000000-0000-0000-0000-000000000024', 'da000000-0000-0000-0000-000000000201'),
    ('10000000-0000-0000-0000-000000000024', 'da000000-0000-0000-0000-000000000202'),
    ('10000000-0000-0000-0000-000000000024', 'da000000-0000-0000-0000-000000000241'),
    ('10000000-0000-0000-0000-000000000024', 'da000000-0000-0000-0000-000000000312'),
    ('10000000-0000-0000-0000-000000000024', 'da000000-0000-0000-0000-000000000314'),
    ('10000000-0000-0000-0000-000000000024', 'da000000-0000-0000-0000-000000000361'),
    ('10000000-0000-0000-0000-000000000024', 'da000000-0000-0000-0000-000000000371'),
    ('10000000-0000-0000-0000-000000000024', 'da000000-0000-0000-0000-000000000372'),
    ('10000000-0000-0000-0000-000000000024', 'da000000-0000-0000-0000-000000003511'),
    -- Leonardo Ladera (LL)
    ('10000000-0000-0000-0000-000000000026', 'da000000-0000-0000-0000-000000000292'),
    ('10000000-0000-0000-0000-000000000026', 'da000000-0000-0000-0000-000000000382'),
    -- Luis Matamoros (LM)
    ('10000000-0000-0000-0000-000000000027', 'da000000-0000-0000-0000-000000000061'),
    ('10000000-0000-0000-0000-000000000027', 'da000000-0000-0000-0000-000000000151'),
    ('10000000-0000-0000-0000-000000000027', 'da000000-0000-0000-0000-000000000152'),
    ('10000000-0000-0000-0000-000000000027', 'da000000-0000-0000-0000-000000000153'),
    ('10000000-0000-0000-0000-000000000027', 'da000000-0000-0000-0000-000000000172'),
    ('10000000-0000-0000-0000-000000000027', 'da000000-0000-0000-0000-000000000181'),
    ('10000000-0000-0000-0000-000000000027', 'da000000-0000-0000-0000-000000000341'),
    -- Luis Blanco (LB)
    ('10000000-0000-0000-0000-000000000028', 'da000000-0000-0000-0000-000000000031'),
    ('10000000-0000-0000-0000-000000000028', 'da000000-0000-0000-0000-000000000381'),
    -- Magyory Suarez (MS)
    ('10000000-0000-0000-0000-000000000030', 'da000000-0000-0000-0000-000000000312'),
    ('10000000-0000-0000-0000-000000000030', 'da000000-0000-0000-0000-000000000314'),
    ('10000000-0000-0000-0000-000000000030', 'da000000-0000-0000-0000-000000000357'),
    ('10000000-0000-0000-0000-000000000030', 'da000000-0000-0000-0000-000000000371'),
    ('10000000-0000-0000-0000-000000000030', 'da000000-0000-0000-0000-000000000372'),
    ('10000000-0000-0000-0000-000000000030', 'da000000-0000-0000-0000-000000000393'),
    -- Manuel Quintana (MQ)
    ('10000000-0000-0000-0000-000000000031', 'da000000-0000-0000-0000-000000000311'),
    ('10000000-0000-0000-0000-000000000031', 'da000000-0000-0000-0000-000000000314'),
    -- Maria Rivas (MR)
    ('10000000-0000-0000-0000-000000000032', 'da000000-0000-0000-0000-000000000101'),
    ('10000000-0000-0000-0000-000000000032', 'da000000-0000-0000-0000-000000000161'),
    ('10000000-0000-0000-0000-000000000032', 'da000000-0000-0000-0000-000000000281'),
    ('10000000-0000-0000-0000-000000000032', 'da000000-0000-0000-0000-000000000341'),
    ('10000000-0000-0000-0000-000000000032', 'da000000-0000-0000-0000-000000000357'),
    ('10000000-0000-0000-0000-000000000032', 'da000000-0000-0000-0000-000000003511'),
    -- Maria Auxiliadora Cadena (MAC)
    ('10000000-0000-0000-0000-000000000033', 'da000000-0000-0000-0000-000000000011'),
    ('10000000-0000-0000-0000-000000000033', 'da000000-0000-0000-0000-000000000031'),
    ('10000000-0000-0000-0000-000000000033', 'da000000-0000-0000-0000-000000000351'),
    ('10000000-0000-0000-0000-000000000033', 'da000000-0000-0000-0000-000000000352'),
    ('10000000-0000-0000-0000-000000000033', 'da000000-0000-0000-0000-000000000356'),
    ('10000000-0000-0000-0000-000000000033', 'da000000-0000-0000-0000-000000000357'),
    ('10000000-0000-0000-0000-000000000033', 'da000000-0000-0000-0000-000000003511'),
    -- Ximena Pacheco (XP)
    ('10000000-0000-0000-0000-000000000034', 'da000000-0000-0000-0000-000000000121'),
    ('10000000-0000-0000-0000-000000000034', 'da000000-0000-0000-0000-000000000141'),
    ('10000000-0000-0000-0000-000000000034', 'da000000-0000-0000-0000-000000000241'),
    ('10000000-0000-0000-0000-000000000034', 'da000000-0000-0000-0000-000000000314'),
    ('10000000-0000-0000-0000-000000000034', 'da000000-0000-0000-0000-000000000341'),
    -- Óscar Ríos (OR)
    ('10000000-0000-0000-0000-000000000035', 'da000000-0000-0000-0000-000000000101'),
    ('10000000-0000-0000-0000-000000000035', 'da000000-0000-0000-0000-000000000102'),
    ('10000000-0000-0000-0000-000000000035', 'da000000-0000-0000-0000-000000000121'),
    ('10000000-0000-0000-0000-000000000035', 'da000000-0000-0000-0000-000000000122'),
    ('10000000-0000-0000-0000-000000000035', 'da000000-0000-0000-0000-000000000141'),
    ('10000000-0000-0000-0000-000000000035', 'da000000-0000-0000-0000-000000000356'),
    ('10000000-0000-0000-0000-000000000035', 'da000000-0000-0000-0000-000000000357'),
    ('10000000-0000-0000-0000-000000000035', 'da000000-0000-0000-0000-000000003511'),
    -- Oscar Quintero (OQ)
    ('10000000-0000-0000-0000-000000000036', 'da000000-0000-0000-0000-000000000051'),
    ('10000000-0000-0000-0000-000000000036', 'da000000-0000-0000-0000-000000000292'),
    ('10000000-0000-0000-0000-000000000036', 'da000000-0000-0000-0000-000000000356'),
    ('10000000-0000-0000-0000-000000000036', 'da000000-0000-0000-0000-000000000357'),
    ('10000000-0000-0000-0000-000000000036', 'da000000-0000-0000-0000-000000000359'),
    ('10000000-0000-0000-0000-000000000036', 'da000000-0000-0000-0000-000000000371'),
    ('10000000-0000-0000-0000-000000000036', 'da000000-0000-0000-0000-000000000372'),
    -- Pablo Mora (PM)
    ('10000000-0000-0000-0000-000000000038', 'da000000-0000-0000-0000-000000000101'),
    ('10000000-0000-0000-0000-000000000038', 'da000000-0000-0000-0000-000000000102'),
    ('10000000-0000-0000-0000-000000000038', 'da000000-0000-0000-0000-000000000161'),
    ('10000000-0000-0000-0000-000000000038', 'da000000-0000-0000-0000-000000000281'),
    ('10000000-0000-0000-0000-000000000038', 'da000000-0000-0000-0000-000000000341'),
    ('10000000-0000-0000-0000-000000000038', 'da000000-0000-0000-0000-000000000342'),
    -- Pedro Vargas (PV)
    ('10000000-0000-0000-0000-000000000039', 'da000000-0000-0000-0000-000000000171'),
    ('10000000-0000-0000-0000-000000000039', 'da000000-0000-0000-0000-000000000172'),
    ('10000000-0000-0000-0000-000000000039', 'da000000-0000-0000-0000-000000000181'),
    -- Ricardo Araujo (RA)
    ('10000000-0000-0000-0000-000000000040', 'da000000-0000-0000-0000-000000000031'),
    ('10000000-0000-0000-0000-000000000040', 'da000000-0000-0000-0000-000000000101'),
    ('10000000-0000-0000-0000-000000000040', 'da000000-0000-0000-0000-000000000102'),
    ('10000000-0000-0000-0000-000000000040', 'da000000-0000-0000-0000-000000000121'),
    ('10000000-0000-0000-0000-000000000040', 'da000000-0000-0000-0000-000000000141'),
    -- Sheilar Peña (SP)
    ('10000000-0000-0000-0000-000000000041', 'da000000-0000-0000-0000-000000000101'),
    ('10000000-0000-0000-0000-000000000041', 'da000000-0000-0000-0000-000000000102'),
    ('10000000-0000-0000-0000-000000000041', 'da000000-0000-0000-0000-000000000121'),
    ('10000000-0000-0000-0000-000000000041', 'da000000-0000-0000-0000-000000000381'),
    -- Victor Blanco (VB)
    ('10000000-0000-0000-0000-000000000042', 'da000000-0000-0000-0000-000000000191'),
    ('10000000-0000-0000-0000-000000000042', 'da000000-0000-0000-0000-000000000251'),
    -- Wolfgang Peuchert (WP)
    ('10000000-0000-0000-0000-000000000043', 'da000000-0000-0000-0000-000000000292'),
    ('10000000-0000-0000-0000-000000000043', 'da000000-0000-0000-0000-000000000341'),
    -- Yamila Dumont (YD)
    ('10000000-0000-0000-0000-000000000044', 'da000000-0000-0000-0000-000000000071'),
    ('10000000-0000-0000-0000-000000000044', 'da000000-0000-0000-0000-000000000153'),
    ('10000000-0000-0000-0000-000000000044', 'da000000-0000-0000-0000-000000000314'),
    -- Yurima Carrillo (YC)
    ('10000000-0000-0000-0000-000000000045', 'da000000-0000-0000-0000-000000000101'),
    ('10000000-0000-0000-0000-000000000045', 'da000000-0000-0000-0000-000000000121'),
    ('10000000-0000-0000-0000-000000000045', 'da000000-0000-0000-0000-000000000141'),
    ('10000000-0000-0000-0000-000000000045', 'da000000-0000-0000-0000-000000000371'),
    ('10000000-0000-0000-0000-000000000045', 'da000000-0000-0000-0000-000000000372'),
    -- Yarleska Jimenez (YJ)
    ('10000000-0000-0000-0000-000000000046', 'da000000-0000-0000-0000-000000000031'),
    -- Yurima Carrillo (YC)
    ('10000000-0000-0000-0000-000000000047', 'da000000-0000-0000-0000-000000000101'),
    ('10000000-0000-0000-0000-000000000047', 'da000000-0000-0000-0000-000000000121'),
    ('10000000-0000-0000-0000-000000000047', 'da000000-0000-0000-0000-000000000141'),
    ('10000000-0000-0000-0000-000000000047', 'da000000-0000-0000-0000-000000000371'),
    ('10000000-0000-0000-0000-000000000047', 'da000000-0000-0000-0000-000000000372')
ON CONFLICT (id_auditor, id_subsector_iaf) DO NOTHING;

-- 10b. Conglomerados / Grupos Empresariales
INSERT INTO public.grupo_empresarial (id, codigo_grupo, nombre, abreviacion, es_individual_auto, notas) VALUES
    ('20000000-0000-0000-0000-000000000001', 'CONG-IND-01', 'Grupo Industrial Iberometal', 'Iberometal', FALSE, 'Holding metalmecánico, estructuras pesadas y manufactura de precisión en el eje Carabobo–Aragua, habilitado para vinculación Nivel 1 y Nivel 2.'),
    ('20000000-0000-0000-0000-000000000002', 'CONG-CYB-01', 'CyberCloud Solutions S.L.', 'CyberCloud', TRUE, 'Grupo individual 1:1 creado para organización independiente.'),
    ('20000000-0000-0000-0000-000000000003', 'CONG-ALM-01', 'Corporación Alimentaria del Sur', 'Alimentos', FALSE, 'Conglomerado multi-empresa para pruebas 3x3 encadenado + 4º sitio Combinado (Step 1.1).')
ON CONFLICT (id) DO UPDATE SET
    codigo_grupo = EXCLUDED.codigo_grupo,
    nombre = EXCLUDED.nombre,
    abreviacion = EXCLUDED.abreviacion,
    es_individual_auto = EXCLUDED.es_individual_auto,
    notas = EXCLUDED.notas,
    updated_at = NOW();

-- 11. Organizaciones Clientes
INSERT INTO public.organizacion (id, id_grupo_empresarial, nombre, abreviacion, rif, direccion_fiscal) VALUES
    ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Iberometal Componentes S.A.', 'IBEROMETAL', 'J-30492817-0', 'Av. Industrial 100, Zona Industrial Municipal Norte, Valencia, Edo. Carabobo 2001'),
    ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 'CyberCloud Solutions S.L.', 'CYBERCLOUD', 'J-40819234-5', 'Torre David, Piso 14, Chacao, Caracas'),
    ('30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', 'Example, C.A.', 'EXAMPLE-CA', 'J-50112233-4', 'Zona Industrial Santa Cruz, Parcela 12, Carretera Nacional Cagua–Santa Cruz, Edo. Aragua 2123'),
    ('30000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000003', 'Organización Grande Alimentos S.A.', 'ORG-GRANDE-ALM', 'J-60111222-1', 'Complejo Agroindustrial Sur, Parcela A, Edo. Portuguesa'),
    ('30000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000003', 'Organización Pequeña Empaques C.A.', 'ORG-PEQ-EMP', 'J-60333444-2', 'Parque Industrial Envasado Sur, Nave 4, Edo. Portuguesa')
ON CONFLICT (id) DO UPDATE SET
    id_grupo_empresarial = EXCLUDED.id_grupo_empresarial,
    nombre = EXCLUDED.nombre,
    abreviacion = EXCLUDED.abreviacion,
    rif = EXCLUDED.rif,
    direccion_fiscal = EXCLUDED.direccion_fiscal,
    updated_at = NOW();

-- 11b. Versiones de Organización (Step 1.1 + Step 1.3: v1 -> v2 en Iberometal CONG-IND-01)
DO $$
DECLARE
    v_ov RECORD;
    v_existing_id UUID;
BEGIN
    FOR v_ov IN
        SELECT * FROM (VALUES
            ('31000000-0000-0000-0000-000000000001'::UUID, '30000000-0000-0000-0000-000000000001'::UUID, 1, FALSE, 'Versión inicial histórica previa a ampliación industrial.', 'Iberometal Componentes C.A.', 'IBEROMETAL', 'J-30492817-0', 'Av. Industrial 100, Galpón Inicial, Valencia, Edo. Carabobo'),
            ('31000000-0000-0000-0000-000000000101'::UUID, '30000000-0000-0000-0000-000000000001'::UUID, 2, TRUE, 'Actualización de razón social a S.A. y código postal fiscal.', 'Iberometal Componentes S.A.', 'IBEROMETAL', 'J-30492817-0', 'Av. Industrial 100, Zona Industrial Municipal Norte, Valencia, Edo. Carabobo 2001'),
            ('31000000-0000-0000-0000-000000000002'::UUID, '30000000-0000-0000-0000-000000000002'::UUID, 1, TRUE, 'Versión inicial CyberCloud Solutions S.L.', 'CyberCloud Solutions S.L.', 'CYBERCLOUD', 'J-40819234-5', 'Torre David, Piso 14, Chacao, Caracas'),
            ('31000000-0000-0000-0000-000000000003'::UUID, '30000000-0000-0000-0000-000000000003'::UUID, 1, TRUE, 'Versión inicial Example, C.A.', 'Example, C.A.', 'EXAMPLE-CA', 'J-50112233-4', 'Zona Industrial Santa Cruz, Parcela 12, Carretera Nacional Cagua–Santa Cruz, Edo. Aragua 2123'),
            ('31000000-0000-0000-0000-000000000004'::UUID, '30000000-0000-0000-0000-000000000004'::UUID, 1, TRUE, 'Versión inicial Organización Grande Alimentos S.A.', 'Organización Grande Alimentos S.A.', 'ORG-GRANDE-ALM', 'J-60111222-1', 'Complejo Agroindustrial Sur, Parcela A, Edo. Portuguesa'),
            ('31000000-0000-0000-0000-000000000005'::UUID, '30000000-0000-0000-0000-000000000005'::UUID, 1, TRUE, 'Versión inicial Organización Pequeña Empaques C.A.', 'Organización Pequeña Empaques C.A.', 'ORG-PEQ-EMP', 'J-60333444-2', 'Parque Industrial Envasado Sur, Nave 4, Edo. Portuguesa')
        ) AS t(target_id, id_organizacion, version_numero, es_version_actual, notas_version, nombre, abreviacion, rif, direccion_fiscal)
    LOOP
        IF EXISTS (SELECT 1 FROM public.organizacion_version ov WHERE ov.id = v_ov.target_id) THEN
            UPDATE public.organizacion_version
            SET es_version_actual = v_ov.es_version_actual,
                notas_version = v_ov.notas_version,
                nombre = v_ov.nombre,
                abreviacion = v_ov.abreviacion,
                rif = v_ov.rif,
                direccion_fiscal = v_ov.direccion_fiscal,
                deleted_at = NULL,
                deleted_by = NULL,
                delete_reason = NULL,
                updated_at = NOW()
            WHERE id = v_ov.target_id;
        ELSE
            SELECT ov.id INTO v_existing_id
            FROM public.organizacion_version ov
            WHERE ov.id_organizacion = v_ov.id_organizacion
              AND ov.version_numero = v_ov.version_numero
            LIMIT 1;

            IF v_existing_id IS NOT NULL THEN
                UPDATE public.organizacion_version
                SET id = v_ov.target_id,
                    es_version_actual = v_ov.es_version_actual,
                    notas_version = v_ov.notas_version,
                    nombre = v_ov.nombre,
                    abreviacion = v_ov.abreviacion,
                    rif = v_ov.rif,
                    direccion_fiscal = v_ov.direccion_fiscal,
                    deleted_at = NULL,
                    deleted_by = NULL,
                    delete_reason = NULL,
                    updated_at = NOW()
                WHERE id = v_existing_id;
            ELSE
                INSERT INTO public.organizacion_version (
                    id, id_organizacion, version_numero, es_version_actual, notas_version,
                    nombre, abreviacion, rif, direccion_fiscal
                ) VALUES (
                    v_ov.target_id, v_ov.id_organizacion, v_ov.version_numero, v_ov.es_version_actual,
                    v_ov.notas_version, v_ov.nombre, v_ov.abreviacion, v_ov.rif, v_ov.direccion_fiscal
                );
            END IF;
        END IF;
    END LOOP;
END $$;

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

-- 13. Certificados (Contenedores estables sin columna alcance · incluye FN-ISMS-2026-007 en Estudio SIN alcance y SIN auditorías)
INSERT INTO public.certificado (id, id_norma, id_estatus, id_sector_iaf, id_subsector_iaf, id_organizacion, numero_certificado, multisitio) VALUES
    (
        '40000000-0000-0000-0000-000000000001',
        'e0000000-0000-0000-0000-000000009001',
        'a0000000-0000-0000-0000-000000000001', -- Activo
        'd0000000-0000-0000-0000-000000000017', -- Sector 17
        'da000000-0000-0000-0000-000000000171', -- Sub-Sector 17.1 (ALTO)
        '30000000-0000-0000-0000-000000000001', -- Iberometal Componentes S.A.
        'FN-QMS-2024-001',
        TRUE
    ),
    (
        '40000000-0000-0000-0000-000000000002',
        'e0000000-0000-0000-0000-000000014001',
        'a0000000-0000-0000-0000-000000000001', -- Activo (SGA combinado/multisitio Iberometal · v1 -> v2)
        'd0000000-0000-0000-0000-000000000017', -- Sector 17
        'da000000-0000-0000-0000-000000000171', -- Sub-Sector 17.1 (ALTO)
        '30000000-0000-0000-0000-000000000001', -- Iberometal Componentes S.A.
        'FN-EMS-2025-002',
        TRUE
    ),
    (
        '40000000-0000-0000-0000-000000000010',
        'e0000000-0000-0000-0000-000000045001',
        'a0000000-0000-0000-0000-000000000001', -- Activo (SST multisitio Iberometal)
        'd0000000-0000-0000-0000-000000000017', -- Sector 17
        'da000000-0000-0000-0000-000000000171', -- Sub-Sector 17.1 (ALTO)
        '30000000-0000-0000-0000-000000000001', -- Iberometal Componentes S.A.
        'FN-SST-2025-010',
        TRUE
    ),
    (
        '40000000-0000-0000-0000-000000000003',
        'e0000000-0000-0000-0000-000000027001',
        'a0000000-0000-0000-0000-000000000001', -- Activo (CyberCloud)
        'd0000000-0000-0000-0000-000000000033', -- Sector 33
        'da000000-0000-0000-0000-000000000331', -- Sub-Sector 33.1
        '30000000-0000-0000-0000-000000000002', -- CyberCloud
        'FN-ISMS-2025-003',
        FALSE
    ),
    (
        '40000000-0000-0000-0000-000000000004',
        'e0000000-0000-0000-0000-000000009001',
        'a0000000-0000-0000-0000-000000000001', -- Activo (Example, C.A. SGC Multisitio)
        'd0000000-0000-0000-0000-000000000017',
        'da000000-0000-0000-0000-000000000172', -- Sub-Sector 17.2 (MEDIO)
        '30000000-0000-0000-0000-000000000003', -- Example, C.A.
        'FN-QMS-2025-004',
        TRUE
    ),
    (
        '40000000-0000-0000-0000-000000000005',
        'e0000000-0000-0000-0000-000000014001',
        'a0000000-0000-0000-0000-000000000001', -- Activo (Example, C.A. SGA Multisitio)
        'd0000000-0000-0000-0000-000000000017',
        'da000000-0000-0000-0000-000000000172', -- Sub-Sector 17.2 (MEDIO)
        '30000000-0000-0000-0000-000000000003', -- Example, C.A.
        'FN-EMS-2025-005',
        TRUE
    ),
    (
        '40000000-0000-0000-0000-000000000006',
        'e0000000-0000-0000-0000-000000045001',
        'a0000000-0000-0000-0000-000000000001', -- Activo (Example, C.A. SST)
        'd0000000-0000-0000-0000-000000000017',
        'da000000-0000-0000-0000-000000000172', -- Sub-Sector 17.2 (MEDIO)
        '30000000-0000-0000-0000-000000000003', -- Example, C.A.
        'FN-SST-2026-006',
        FALSE
    ),
    (
        '40000000-0000-0000-0000-000000000007',
        'e0000000-0000-0000-0000-000000027001',
        'a0000000-0000-0000-0000-000000000002', -- Estudio (SIN ALCANCE Y SIN AUDITORÍAS · bloqueo Step 1.2/1.3)
        'd0000000-0000-0000-0000-000000000033',
        'da000000-0000-0000-0000-000000000331',
        '30000000-0000-0000-0000-000000000002', -- CyberCloud
        'FN-ISMS-2026-007',
        FALSE
    ),
    (
        '40000000-0000-0000-0000-000000000008',
        'e0000000-0000-0000-0000-000000009001',
        'a0000000-0000-0000-0000-000000000002', -- Estudio (LIBRE · alcance compartido desde 40...0001 · sin auditorías)
        'd0000000-0000-0000-0000-000000000017',
        'da000000-0000-0000-0000-000000000172', -- Sub-Sector 17.2 (MEDIO)
        '30000000-0000-0000-0000-000000000001', -- Iberometal Componentes S.A.
        'FN-QMS-2026-008',
        FALSE
    ),
    (
        '40000000-0000-0000-0000-000000000009',
        'e0000000-0000-0000-0000-000000009001',
        'a0000000-0000-0000-0000-000000000001', -- Activo (Example, C.A. Logística)
        'd0000000-0000-0000-0000-000000000017',
        'da000000-0000-0000-0000-000000000172', -- Sub-Sector 17.2 (MEDIO)
        '30000000-0000-0000-0000-000000000003', -- Example, C.A.
        'FN-QMS-2026-009',
        FALSE
    ),
    -- Escenario Step 1.1 (CONG-ALM-01): Organización Grande (10 certs: 3x3 sitios 1..3 + 1 cert en 4º sitio) + Organización Pequeña (1 ISO 22000 en 4º sitio)
    ('40000000-0000-0000-0000-000000000101', 'e0000000-0000-0000-0000-000000009001', 'a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000003', 'da000000-0000-0000-0000-000000000031', '30000000-0000-0000-0000-000000000004', 'FN-ALM-S1-9001', FALSE),
    ('40000000-0000-0000-0000-000000000102', 'e0000000-0000-0000-0000-000000014001', 'a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000003', 'da000000-0000-0000-0000-000000000031', '30000000-0000-0000-0000-000000000004', 'FN-ALM-S1-14001', FALSE),
    ('40000000-0000-0000-0000-000000000103', 'e0000000-0000-0000-0000-000000045001', 'a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000003', 'da000000-0000-0000-0000-000000000031', '30000000-0000-0000-0000-000000000004', 'FN-ALM-S1-45001', FALSE),
    ('40000000-0000-0000-0000-000000000104', 'e0000000-0000-0000-0000-000000009001', 'a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000003', 'da000000-0000-0000-0000-000000000031', '30000000-0000-0000-0000-000000000004', 'FN-ALM-S2-9001', FALSE),
    ('40000000-0000-0000-0000-000000000105', 'e0000000-0000-0000-0000-000000014001', 'a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000003', 'da000000-0000-0000-0000-000000000031', '30000000-0000-0000-0000-000000000004', 'FN-ALM-S2-14001', FALSE),
    ('40000000-0000-0000-0000-000000000106', 'e0000000-0000-0000-0000-000000045001', 'a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000003', 'da000000-0000-0000-0000-000000000031', '30000000-0000-0000-0000-000000000004', 'FN-ALM-S2-45001', FALSE),
    ('40000000-0000-0000-0000-000000000107', 'e0000000-0000-0000-0000-000000009001', 'a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000003', 'da000000-0000-0000-0000-000000000031', '30000000-0000-0000-0000-000000000004', 'FN-ALM-S3-9001', FALSE),
    ('40000000-0000-0000-0000-000000000108', 'e0000000-0000-0000-0000-000000014001', 'a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000003', 'da000000-0000-0000-0000-000000000031', '30000000-0000-0000-0000-000000000004', 'FN-ALM-S3-14001', FALSE),
    ('40000000-0000-0000-0000-000000000109', 'e0000000-0000-0000-0000-000000045001', 'a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000003', 'da000000-0000-0000-0000-000000000031', '30000000-0000-0000-0000-000000000004', 'FN-ALM-S3-45001', FALSE),
    ('40000000-0000-0000-0000-000000000110', 'e0000000-0000-0000-0000-000000009001', 'a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000003', 'da000000-0000-0000-0000-000000000031', '30000000-0000-0000-0000-000000000004', 'FN-ALM-S4-9001', FALSE),
    ('40000000-0000-0000-0000-000000000111', 'e0000000-0000-0000-0000-000000022000', 'a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000003', 'da000000-0000-0000-0000-000000000031', '30000000-0000-0000-0000-000000000005', 'FN-EMP-S4-22000', FALSE)
ON CONFLICT (numero_certificado) WHERE deleted_at IS NULL DO UPDATE SET
    id_norma = EXCLUDED.id_norma,
    id_estatus = EXCLUDED.id_estatus,
    id_sector_iaf = EXCLUDED.id_sector_iaf,
    id_subsector_iaf = EXCLUDED.id_subsector_iaf,
    id_organizacion = EXCLUDED.id_organizacion,
    multisitio = EXCLUDED.multisitio,
    updated_at = NOW();

-- 13b. Alcances Independientes (public.alcance + alcance_certificado_compartido · 4000...0007 intencionalmente sin alcance)
INSERT INTO public.alcance (id, id_certificado, alcance_es, alcance_en) VALUES
    ('a1c00000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'Manufactura, estampado en frío/caliente, fundición de precisión, mecanizado de acabado y comercialización nacional de componentes metálicos troquelados para automoción y línea blanca (sin diseño de producto bajo plano del cliente).', 'Manufacture, cold/hot stamping, precision casting, finish machining, and national commercialization of stamped metal components for automotive and appliance industries (excluding product design under customer blueprints).'),
    ('a1c00000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000002', 'Gestión ambiental de operaciones de fundición controlada, tratamiento térmico, acabado superficial, manejo de residuos ferrosos, efluentes industriales y almacenamiento de insumos químicos.', 'Environmental management of controlled foundry operations, heat treatment, surface finishing, ferrous waste handling, industrial effluents, and chemical inputs storage.'),
    ('a1c00000-0000-0000-0000-000000000010', '40000000-0000-0000-0000-000000000010', 'Gestión de seguridad y salud en el trabajo en líneas de prensado hidráulico, fundición de aleaciones, izaje de cargas, mantenimiento eléctrico/mecánico y despacho industrial.', 'Occupational health and safety management in hydraulic press lines, alloy casting, load lifting, electrical/mechanical maintenance, and industrial dispatch.'),
    ('a1c00000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000003', 'Operación de centros de datos cloud, desarrollo de software seguro y servicios administrados de ciberseguridad.', 'Cloud data center operations, secure software development, and managed cybersecurity services.'),
    ('a1c00000-0000-0000-0000-000000000004', '40000000-0000-0000-0000-000000000004', 'Diseño de ingeniería de detalle, fabricación de estructuras metálicas pesadas, calderería, soldadura certificada, recubrimiento anticorrosivo y comercialización industrial.', 'Detail engineering design, heavy steel structure manufacturing, boilermaking, certified welding, anticorrosive coating, and industrial commercialization.'),
    ('a1c00000-0000-0000-0000-000000000005', '40000000-0000-0000-0000-000000000005', 'Gestión ambiental de fabricación estructural, granallado, cabinas de pintura industrial, control de emisiones atmosféricas y gestión integral de residuos peligrosos.', NULL),
    ('a1c00000-0000-0000-0000-000000000006', '40000000-0000-0000-0000-000000000006', 'Gestión de seguridad y salud laboral en trabajos en altura, soldadura, corte térmico y operación de puentes grúa en Planta Santa Cruz.', NULL),
    ('a1c00000-0000-0000-0000-000000000009', '40000000-0000-0000-0000-000000000009', 'Operaciones logísticas integradas, recepción, inspección en tránsito, consolidación de carga y despacho de estructuras y piezas metálicas para proyectos industriales.', 'Integrated logistics operations, receiving, in-transit inspection, cargo consolidation, and industrial metal parts dispatch.'),
    ('a1c00000-0000-0000-0000-000000000101', '40000000-0000-0000-0000-000000000101', 'SGC Sitio Principal 1 — Molinería y Recepción de Granos.', NULL),
    ('a1c00000-0000-0000-0000-000000000102', '40000000-0000-0000-0000-000000000102', 'SGA Sitio Principal 1 — Gestión Ambiental en Molinería.', NULL),
    ('a1c00000-0000-0000-0000-000000000103', '40000000-0000-0000-0000-000000000103', 'SST Sitio Principal 1 — Seguridad Operativa en Silos.', NULL),
    ('a1c00000-0000-0000-0000-000000000104', '40000000-0000-0000-0000-000000000104', 'SGC Sitio Principal 2 — Planta Procesadora Norte.', NULL),
    ('a1c00000-0000-0000-0000-000000000105', '40000000-0000-0000-0000-000000000105', 'SGA Sitio Principal 2 — Tratamiento de Aguas Norte.', NULL),
    ('a1c00000-0000-0000-0000-000000000106', '40000000-0000-0000-0000-000000000106', 'SST Sitio Principal 2 — Higiene Industrial Norte.', NULL),
    ('a1c00000-0000-0000-0000-000000000107', '40000000-0000-0000-0000-000000000107', 'SGC Sitio Principal 3 — Complejo Logístico Este.', NULL),
    ('a1c00000-0000-0000-0000-000000000108', '40000000-0000-0000-0000-000000000108', 'SGA Sitio Principal 3 — Emisiones y Flota Este.', NULL),
    ('a1c00000-0000-0000-0000-000000000109', '40000000-0000-0000-0000-000000000109', 'SST Sitio Principal 3 — Seguridad Vial y Carga Este.', NULL),
    ('a1c00000-0000-0000-0000-000000000110', '40000000-0000-0000-0000-000000000110', 'SGC 4º Sitio — Planta Envasado Sur (Organización Grande).', 'QMS 4th Site — South Packaging Plant (Large Organization).'),
    ('a1c00000-0000-0000-0000-000000000111', '40000000-0000-0000-0000-000000000111', 'SGSA ISO 22000 en 4º Sitio — Planta Envasado Sur (Organización Pequeña).', 'FSMS ISO 22000 at 4th Site — South Packaging Plant (Small Organization).')
ON CONFLICT (id_certificado) WHERE deleted_at IS NULL DO UPDATE SET
    alcance_es = EXCLUDED.alcance_es,
    alcance_en = EXCLUDED.alcance_en,
    updated_at = NOW();

INSERT INTO public.alcance_certificado_compartido (id, id_alcance, id_certificado) VALUES
    ('a1c50000-0000-0000-0000-000000000001', 'a1c00000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000008')
ON CONFLICT (id_certificado) WHERE deleted_at IS NULL DO UPDATE SET
    id_alcance = EXCLUDED.id_alcance,
    updated_at = NOW();

-- 13c. Versiones de Certificado (Step 1.2 + Step 1.3: IDs deterministas v1 + historial v1 -> v2 en FN-EMS-2025-002)
DO $$
DECLARE
    v_cv RECORD;
    v_existing_id UUID;
BEGIN
    FOR v_cv IN
        SELECT * FROM (VALUES
            ('41000000-0000-0000-0000-000000000001'::UUID, '40000000-0000-0000-0000-000000000001'::UUID, '31000000-0000-0000-0000-000000000101'::UUID, 1, TRUE, 'Versión vigente FN-QMS-2024-001.', 'a0000000-0000-0000-0000-000000000001'::UUID, 'd0000000-0000-0000-0000-000000000017'::UUID, 'da000000-0000-0000-0000-000000000171'::UUID, TRUE),
            ('41000000-0000-0000-0000-000000000002'::UUID, '40000000-0000-0000-0000-000000000002'::UUID, '31000000-0000-0000-0000-000000000001'::UUID, 1, FALSE, 'Versión histórica v1 (Otorgamiento 2022 y Renovación 2025 bajo Iberometal v1).', 'a0000000-0000-0000-0000-000000000001'::UUID, 'd0000000-0000-0000-0000-000000000017'::UUID, 'da000000-0000-0000-0000-000000000171'::UUID, TRUE),
            ('41000000-0000-0000-0000-000000000202'::UUID, '40000000-0000-0000-0000-000000000002'::UUID, '31000000-0000-0000-0000-000000000101'::UUID, 2, TRUE, 'Versión vigente v2 tras actualización organizacional a S.A. y programación de seguimiento futuro.', 'a0000000-0000-0000-0000-000000000001'::UUID, 'd0000000-0000-0000-0000-000000000017'::UUID, 'da000000-0000-0000-0000-000000000171'::UUID, TRUE),
            ('41000000-0000-0000-0000-000000000010'::UUID, '40000000-0000-0000-0000-000000000010'::UUID, '31000000-0000-0000-0000-000000000101'::UUID, 1, TRUE, 'Versión vigente FN-SST-2025-010.', 'a0000000-0000-0000-0000-000000000001'::UUID, 'd0000000-0000-0000-0000-000000000017'::UUID, 'da000000-0000-0000-0000-000000000171'::UUID, TRUE),
            ('41000000-0000-0000-0000-000000000003'::UUID, '40000000-0000-0000-0000-000000000003'::UUID, '31000000-0000-0000-0000-000000000002'::UUID, 1, TRUE, 'Versión vigente FN-ISMS-2025-003.', 'a0000000-0000-0000-0000-000000000001'::UUID, 'd0000000-0000-0000-0000-000000000033'::UUID, 'da000000-0000-0000-0000-000000000331'::UUID, FALSE),
            ('41000000-0000-0000-0000-000000000004'::UUID, '40000000-0000-0000-0000-000000000004'::UUID, '31000000-0000-0000-0000-000000000003'::UUID, 1, TRUE, 'Versión vigente FN-QMS-2025-004.', 'a0000000-0000-0000-0000-000000000001'::UUID, 'd0000000-0000-0000-0000-000000000017'::UUID, 'da000000-0000-0000-0000-000000000172'::UUID, TRUE),
            ('41000000-0000-0000-0000-000000000005'::UUID, '40000000-0000-0000-0000-000000000005'::UUID, '31000000-0000-0000-0000-000000000003'::UUID, 1, TRUE, 'Versión vigente FN-EMS-2025-005.', 'a0000000-0000-0000-0000-000000000001'::UUID, 'd0000000-0000-0000-0000-000000000017'::UUID, 'da000000-0000-0000-0000-000000000172'::UUID, TRUE),
            ('41000000-0000-0000-0000-000000000006'::UUID, '40000000-0000-0000-0000-000000000006'::UUID, '31000000-0000-0000-0000-000000000003'::UUID, 1, TRUE, 'Versión vigente FN-SST-2026-006.', 'a0000000-0000-0000-0000-000000000001'::UUID, 'd0000000-0000-0000-0000-000000000017'::UUID, 'da000000-0000-0000-0000-000000000172'::UUID, FALSE),
            ('41000000-0000-0000-0000-000000000007'::UUID, '40000000-0000-0000-0000-000000000007'::UUID, '31000000-0000-0000-0000-000000000002'::UUID, 1, TRUE, 'Versión vigente FN-ISMS-2026-007 (Estudio sin alcance).', 'a0000000-0000-0000-0000-000000000002'::UUID, 'd0000000-0000-0000-0000-000000000033'::UUID, 'da000000-0000-0000-0000-000000000331'::UUID, FALSE),
            ('41000000-0000-0000-0000-000000000008'::UUID, '40000000-0000-0000-0000-000000000008'::UUID, '31000000-0000-0000-0000-000000000101'::UUID, 1, TRUE, 'Versión vigente FN-QMS-2026-008.', 'a0000000-0000-0000-0000-000000000002'::UUID, 'd0000000-0000-0000-0000-000000000017'::UUID, 'da000000-0000-0000-0000-000000000172'::UUID, FALSE),
            ('41000000-0000-0000-0000-000000000009'::UUID, '40000000-0000-0000-0000-000000000009'::UUID, '31000000-0000-0000-0000-000000000003'::UUID, 1, TRUE, 'Versión vigente FN-QMS-2026-009.', 'a0000000-0000-0000-0000-000000000001'::UUID, 'd0000000-0000-0000-0000-000000000017'::UUID, 'da000000-0000-0000-0000-000000000172'::UUID, FALSE),
            ('41000000-0000-0000-0000-000000000101'::UUID, '40000000-0000-0000-0000-000000000101'::UUID, '31000000-0000-0000-0000-000000000004'::UUID, 1, TRUE, 'Versión inicial CONG-ALM-01.', 'a0000000-0000-0000-0000-000000000001'::UUID, 'd0000000-0000-0000-0000-000000000003'::UUID, 'da000000-0000-0000-0000-000000000031'::UUID, FALSE),
            ('41000000-0000-0000-0000-000000000102'::UUID, '40000000-0000-0000-0000-000000000102'::UUID, '31000000-0000-0000-0000-000000000004'::UUID, 1, TRUE, 'Versión inicial CONG-ALM-01.', 'a0000000-0000-0000-0000-000000000001'::UUID, 'd0000000-0000-0000-0000-000000000003'::UUID, 'da000000-0000-0000-0000-000000000031'::UUID, FALSE),
            ('41000000-0000-0000-0000-000000000103'::UUID, '40000000-0000-0000-0000-000000000103'::UUID, '31000000-0000-0000-0000-000000000004'::UUID, 1, TRUE, 'Versión inicial CONG-ALM-01.', 'a0000000-0000-0000-0000-000000000001'::UUID, 'd0000000-0000-0000-0000-000000000003'::UUID, 'da000000-0000-0000-0000-000000000031'::UUID, FALSE),
            ('41000000-0000-0000-0000-000000000104'::UUID, '40000000-0000-0000-0000-000000000104'::UUID, '31000000-0000-0000-0000-000000000004'::UUID, 1, TRUE, 'Versión inicial CONG-ALM-01.', 'a0000000-0000-0000-0000-000000000001'::UUID, 'd0000000-0000-0000-0000-000000000003'::UUID, 'da000000-0000-0000-0000-000000000031'::UUID, FALSE),
            ('41000000-0000-0000-0000-000000000105'::UUID, '40000000-0000-0000-0000-000000000105'::UUID, '31000000-0000-0000-0000-000000000004'::UUID, 1, TRUE, 'Versión inicial CONG-ALM-01.', 'a0000000-0000-0000-0000-000000000001'::UUID, 'd0000000-0000-0000-0000-000000000003'::UUID, 'da000000-0000-0000-0000-000000000031'::UUID, FALSE),
            ('41000000-0000-0000-0000-000000000106'::UUID, '40000000-0000-0000-0000-000000000106'::UUID, '31000000-0000-0000-0000-000000000004'::UUID, 1, TRUE, 'Versión inicial CONG-ALM-01.', 'a0000000-0000-0000-0000-000000000001'::UUID, 'd0000000-0000-0000-0000-000000000003'::UUID, 'da000000-0000-0000-0000-000000000031'::UUID, FALSE),
            ('41000000-0000-0000-0000-000000000107'::UUID, '40000000-0000-0000-0000-000000000107'::UUID, '31000000-0000-0000-0000-000000000004'::UUID, 1, TRUE, 'Versión inicial CONG-ALM-01.', 'a0000000-0000-0000-0000-000000000001'::UUID, 'd0000000-0000-0000-0000-000000000003'::UUID, 'da000000-0000-0000-0000-000000000031'::UUID, FALSE),
            ('41000000-0000-0000-0000-000000000108'::UUID, '40000000-0000-0000-0000-000000000108'::UUID, '31000000-0000-0000-0000-000000000004'::UUID, 1, TRUE, 'Versión inicial CONG-ALM-01.', 'a0000000-0000-0000-0000-000000000001'::UUID, 'd0000000-0000-0000-0000-000000000003'::UUID, 'da000000-0000-0000-0000-000000000031'::UUID, FALSE),
            ('41000000-0000-0000-0000-000000000109'::UUID, '40000000-0000-0000-0000-000000000109'::UUID, '31000000-0000-0000-0000-000000000004'::UUID, 1, TRUE, 'Versión inicial CONG-ALM-01.', 'a0000000-0000-0000-0000-000000000001'::UUID, 'd0000000-0000-0000-0000-000000000003'::UUID, 'da000000-0000-0000-0000-000000000031'::UUID, FALSE),
            ('41000000-0000-0000-0000-000000000110'::UUID, '40000000-0000-0000-0000-000000000110'::UUID, '31000000-0000-0000-0000-000000000004'::UUID, 1, TRUE, 'Versión inicial CONG-ALM-01.', 'a0000000-0000-0000-0000-000000000001'::UUID, 'd0000000-0000-0000-0000-000000000003'::UUID, 'da000000-0000-0000-0000-000000000031'::UUID, FALSE),
            ('41000000-0000-0000-0000-000000000111'::UUID, '40000000-0000-0000-0000-000000000111'::UUID, '31000000-0000-0000-0000-000000000005'::UUID, 1, TRUE, 'Versión inicial CONG-ALM-01.', 'a0000000-0000-0000-0000-000000000001'::UUID, 'd0000000-0000-0000-0000-000000000003'::UUID, 'da000000-0000-0000-0000-000000000031'::UUID, FALSE)
        ) AS t(target_id, id_certificado, id_organizacion_version, version_numero, es_version_actual, notas_version, id_estatus, id_sector_iaf, id_subsector_iaf, multisitio)
    LOOP
        IF EXISTS (SELECT 1 FROM public.certificado_version cv WHERE cv.id = v_cv.target_id) THEN
            UPDATE public.certificado_version
            SET id_organizacion_version = v_cv.id_organizacion_version,
                es_version_actual = v_cv.es_version_actual,
                notas_version = v_cv.notas_version,
                id_estatus = v_cv.id_estatus,
                id_sector_iaf = v_cv.id_sector_iaf,
                id_subsector_iaf = v_cv.id_subsector_iaf,
                multisitio = v_cv.multisitio,
                deleted_at = NULL,
                deleted_by = NULL,
                delete_reason = NULL,
                updated_at = NOW()
            WHERE id = v_cv.target_id;
        ELSE
            SELECT cv.id INTO v_existing_id
            FROM public.certificado_version cv
            WHERE cv.id_certificado = v_cv.id_certificado
              AND cv.version_numero = v_cv.version_numero
            LIMIT 1;

            IF v_existing_id IS NOT NULL THEN
                UPDATE public.certificado_version
                SET id = v_cv.target_id,
                    id_organizacion_version = v_cv.id_organizacion_version,
                    es_version_actual = v_cv.es_version_actual,
                    notas_version = v_cv.notas_version,
                    id_estatus = v_cv.id_estatus,
                    id_sector_iaf = v_cv.id_sector_iaf,
                    id_subsector_iaf = v_cv.id_subsector_iaf,
                    multisitio = v_cv.multisitio,
                    deleted_at = NULL,
                    deleted_by = NULL,
                    delete_reason = NULL,
                    updated_at = NOW()
                WHERE id = v_existing_id;
            ELSE
                INSERT INTO public.certificado_version (
                    id, id_certificado, id_organizacion_version, version_numero, es_version_actual,
                    notas_version, id_estatus, id_sector_iaf, id_subsector_iaf, multisitio
                ) VALUES (
                    v_cv.target_id, v_cv.id_certificado, v_cv.id_organizacion_version, v_cv.version_numero,
                    v_cv.es_version_actual, v_cv.notas_version, v_cv.id_estatus, v_cv.id_sector_iaf,
                    v_cv.id_subsector_iaf, v_cv.multisitio
                );
            END IF;
        END IF;
    END LOOP;
END $$;

-- 14. Sitios Físicos con Convención Sitio 0 (HQ) y Dotación personal_count (Paso 2.1)
INSERT INTO public.sitio (id, id_certificado, id_certificado_version, numero_sitio, nombre_sitio, direccion_sitio, personal_count) VALUES
    -- FN-QMS-2024-001 (Iberometal SGC · multisitio = TRUE · 4 sitios)
    ('50000000-0000-0000-0000-000000000000', '40000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001', 0, 'Sede Principal y Planta Fundición HQ', 'Av. Industrial 100, Zona Industrial Municipal Norte, Valencia, Edo. Carabobo', 195),
    ('50000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001', 1, 'Planta Troquelado y Estampado Valencia', 'Zona Industrial Carabobo, Galpón 4-B, Valencia, Edo. Carabobo', 88),
    ('50000000-0000-0000-0000-000000000010', '40000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001', 2, 'Centro Logístico y Almacén Central Guacara', 'Zona Industrial El Tigre, Parcela 8, Guacara, Edo. Carabobo', 36),
    ('50000000-0000-0000-0000-000000000011', '40000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001', 3, 'Oficina Comercial y Atención Automotriz Caracas', 'Av. Francisco de Miranda, Torre Empresarial, Piso 6, Chacao, Caracas', 16),

    -- FN-EMS-2025-002 (Iberometal SGA · v1 histórica 4100...0002 · 3 sitios)
    ('50000000-0000-0000-0000-000000001002', '40000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000002', 0, 'Complejo Industrial Ambiental HQ', 'Av. Industrial 100, Sector Sur y PTAR, Valencia, Edo. Carabobo', 160),
    ('50000000-0000-0000-0000-000000001012', '40000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000002', 1, 'Planta Tratamiento Superficial Valencia Sur', 'Zona Industrial Carabobo Sur, Galpón 7, Valencia, Edo. Carabobo', 52),
    ('50000000-0000-0000-0000-000000001013', '40000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000002', 2, 'Almacén de Insumos y Acopio Temporal Guacara', 'Zona Industrial El Tigre, Módulo C, Guacara, Edo. Carabobo', 24),

    -- FN-EMS-2025-002 (Iberometal SGA · v2 vigente 4100...0202 · multisitio = TRUE · 3 sitios)
    ('50000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000202', 0, 'Complejo Industrial Ambiental HQ', 'Av. Industrial 100, Sector Sur y PTAR, Valencia, Edo. Carabobo', 160),
    ('50000000-0000-0000-0000-000000000012', '40000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000202', 1, 'Planta Tratamiento Superficial Valencia Sur', 'Zona Industrial Carabobo Sur, Galpón 7, Valencia, Edo. Carabobo', 52),
    ('50000000-0000-0000-0000-000000000013', '40000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000202', 2, 'Almacén de Insumos y Acopio Temporal Guacara', 'Zona Industrial El Tigre, Módulo C, Guacara, Edo. Carabobo', 24),

    -- FN-SST-2025-010 (Iberometal SST · multisitio = TRUE · 3 sitios)
    ('50000000-0000-0000-0000-000000000020', '40000000-0000-0000-0000-000000000010', '41000000-0000-0000-0000-000000000010', 0, 'Complejo Industrial Seguridad HQ', 'Av. Industrial 100, Valencia, Edo. Carabobo', 185),
    ('50000000-0000-0000-0000-000000000021', '40000000-0000-0000-0000-000000000010', '41000000-0000-0000-0000-000000000010', 1, 'Planta Prensas Pesadas Valencia', 'Zona Industrial Carabobo, Galpón 4-B, Valencia, Edo. Carabobo', 76),
    ('50000000-0000-0000-0000-000000000022', '40000000-0000-0000-0000-000000000010', '41000000-0000-0000-0000-000000000010', 2, 'Oficina Administrativa y Servicio Médico Caracas', 'Av. Francisco de Miranda, Torre Empresarial, Piso 6, Chacao, Caracas', 14),

    -- FN-QMS-2026-008 (Iberometal Estudio · multisitio = FALSE · 1 sitio)
    ('50000000-0000-0000-0000-000000000023', '40000000-0000-0000-0000-000000000008', '41000000-0000-0000-0000-000000000008', 0, 'Taller Piloto Mecanizado CNC Valencia', 'Zona Industrial Municipal Norte, Nave Experimental 2, Valencia, Edo. Carabobo', 22),

    -- FN-QMS-2025-004 (Example, C.A. SGC · multisitio = TRUE · 3 sitios)
    ('50000000-0000-0000-0000-000000000004', '40000000-0000-0000-0000-000000000004', '41000000-0000-0000-0000-000000000004', 0, 'Planta Estructural Santa Cruz HQ', 'Zona Industrial Santa Cruz, Parcela 12, Edo. Aragua', 150),
    ('50000000-0000-0000-0000-000000000014', '40000000-0000-0000-0000-000000000004', '41000000-0000-0000-0000-000000000004', 1, 'Patio de Granallado y Pintura Industrial Cagua', 'Carretera Nacional Cagua–Santa Cruz, Sector Industrial Km 4, Cagua, Edo. Aragua', 64),
    ('50000000-0000-0000-0000-000000000015', '40000000-0000-0000-0000-000000000004', '41000000-0000-0000-0000-000000000004', 2, 'Oficina de Ingeniería Comercial y Licitaciones Caracas', 'Av. Principal de Las Mercedes, Edif. Metálica, Piso 3, Caracas', 18),

    -- FN-EMS-2025-005 (Example, C.A. SGA · multisitio = TRUE · 3 sitios)
    ('50000000-0000-0000-0000-000000000005', '40000000-0000-0000-0000-000000000005', '41000000-0000-0000-0000-000000000005', 0, 'Planta Estructural Santa Cruz SGA HQ', 'Zona Industrial Santa Cruz, Parcela 12, Edo. Aragua', 145),
    ('50000000-0000-0000-0000-000000000016', '40000000-0000-0000-0000-000000000005', '41000000-0000-0000-0000-000000000005', 1, 'Patio de Acabado Superficial Cagua SGA', 'Carretera Nacional Cagua–Santa Cruz, Sector Industrial Km 4, Cagua, Edo. Aragua', 58),
    ('50000000-0000-0000-0000-000000000017', '40000000-0000-0000-0000-000000000005', '41000000-0000-0000-0000-000000000005', 2, 'Oficina Administrativa Ambiental Maracay', 'Av. Las Delicias, Centro Corporativo Aragua, Piso 2, Maracay, Edo. Aragua', 12),

    -- FN-SST-2026-006 (Example, C.A. SST · multisitio = FALSE · 1 sitio)
    ('50000000-0000-0000-0000-000000000006', '40000000-0000-0000-0000-000000000006', '41000000-0000-0000-0000-000000000006', 0, 'Planta Santa Cruz SST', 'Zona Industrial Santa Cruz, Parcela 12, Edo. Aragua', 135),

    -- FN-QMS-2026-009 (Example, C.A. Logística · multisitio = FALSE · 1 sitio)
    ('50000000-0000-0000-0000-000000000007', '40000000-0000-0000-0000-000000000009', '41000000-0000-0000-0000-000000000009', 0, 'Centro Logístico Aragua', 'Zona Industrial Santa Cruz, Galpón Sur, Edo. Aragua', 38),

    -- CONG-CYB-01 (CyberCloud Solutions S.L.)
    ('50000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000003', '41000000-0000-0000-0000-000000000003', 0, 'Centro de Datos Chacao', 'Torre David, Piso 14, Chacao, Caracas', 55),

    -- CONG-ALM-01 (Corporación Alimentaria del Sur)
    ('50000000-0000-0000-0000-000000000101', '40000000-0000-0000-0000-000000000101', '41000000-0000-0000-0000-000000000101', 0, 'Sitio Principal 1 — Agroindustrial SGC', 'Complejo Sur, Módulo 1, Portuguesa', 150),
    ('50000000-0000-0000-0000-000000000102', '40000000-0000-0000-0000-000000000102', '41000000-0000-0000-0000-000000000102', 0, 'Sitio Principal 1 — Agroindustrial SGA', 'Complejo Sur, Módulo 1, Portuguesa', 150),
    ('50000000-0000-0000-0000-000000000103', '40000000-0000-0000-0000-000000000103', '41000000-0000-0000-0000-000000000103', 0, 'Sitio Principal 1 — Agroindustrial SST', 'Complejo Sur, Módulo 1, Portuguesa', 150),
    ('50000000-0000-0000-0000-000000000104', '40000000-0000-0000-0000-000000000104', '41000000-0000-0000-0000-000000000104', 0, 'Sitio Principal 2 — Procesadora Norte SGC', 'Zona Industrial Norte, Parcela 2, Portuguesa', 135),
    ('50000000-0000-0000-0000-000000000105', '40000000-0000-0000-0000-000000000105', '41000000-0000-0000-0000-000000000105', 0, 'Sitio Principal 2 — Procesadora Norte SGA', 'Zona Industrial Norte, Parcela 2, Portuguesa', 135),
    ('50000000-0000-0000-0000-000000000106', '40000000-0000-0000-0000-000000000106', '41000000-0000-0000-0000-000000000106', 0, 'Sitio Principal 2 — Procesadora Norte SST', 'Zona Industrial Norte, Parcela 2, Portuguesa', 135),
    ('50000000-0000-0000-0000-000000000107', '40000000-0000-0000-0000-000000000107', '41000000-0000-0000-0000-000000000107', 0, 'Sitio Principal 3 — Logística Este SGC', 'Complejo Este, Andén 3, Portuguesa', 125),
    ('50000000-0000-0000-0000-000000000108', '40000000-0000-0000-0000-000000000108', '41000000-0000-0000-0000-000000000108', 0, 'Sitio Principal 3 — Logística Este SGA', 'Complejo Este, Andén 3, Portuguesa', 125),
    ('50000000-0000-0000-0000-000000000109', '40000000-0000-0000-0000-000000000109', '41000000-0000-0000-0000-000000000109', 0, 'Sitio Principal 3 — Logística Este SST', 'Complejo Este, Andén 3, Portuguesa', 125),
    ('50000000-0000-0000-0000-000000000110', '40000000-0000-0000-0000-000000000110', '41000000-0000-0000-0000-000000000110', 0, '4º Sitio — Planta Envasado Sur (Org Grande)', 'Parque Industrial Envasado Sur, Nave 1, Portuguesa', 85),
    ('50000000-0000-0000-0000-000000000111', '40000000-0000-0000-0000-000000000111', '41000000-0000-0000-0000-000000000111', 0, '4º Sitio — Planta Envasado Sur (Org Pequeña)', 'Parque Industrial Envasado Sur, Nave 4, Portuguesa', 28)
ON CONFLICT (id_certificado_version, numero_sitio) WHERE deleted_at IS NULL DO UPDATE SET
    nombre_sitio = EXCLUDED.nombre_sitio,
    direccion_sitio = EXCLUDED.direccion_sitio,
    personal_count = EXCLUDED.personal_count,
    updated_at = NOW();

-- 15. Turnos y Asignación por Sitio (Catálogo Completo de 6 Turnos Estándar + 1–6 turnos distintos por certificado CONG-IND-01)
INSERT INTO public.turno (id, hora_entrada, hora_salida) VALUES
    ('70000000-0000-0000-0000-000000000001', '07:00:00', '15:00:00'), -- T1 Matutino
    ('70000000-0000-0000-0000-000000000002', '15:00:00', '23:00:00'), -- T2 Vespertino
    ('70000000-0000-0000-0000-000000000003', '23:00:00', '07:00:00'), -- T3 Nocturno
    ('70000000-0000-0000-0000-000000000004', '08:00:00', '17:00:00'), -- T4 Administrativo
    ('70000000-0000-0000-0000-000000000005', '06:00:00', '14:00:00'), -- T5 Recepción y Despacho
    ('70000000-0000-0000-0000-000000000006', '07:00:00', '19:00:00')  -- T6 Guardia / Brigada
ON CONFLICT (hora_entrada, hora_salida) WHERE deleted_at IS NULL DO NOTHING;

INSERT INTO public.turnos_por_sitio (id, id_sitio, id_turno) VALUES
    -- FN-QMS-2024-001 (5 turnos distintos: T1, T2, T3, T4, T5)
    ('71000000-0000-0000-0000-000000000000', '50000000-0000-0000-0000-000000000000', '70000000-0000-0000-0000-000000000001'), -- HQ T1
    ('71000000-0000-0000-0000-000000000010', '50000000-0000-0000-0000-000000000000', '70000000-0000-0000-0000-000000000002'), -- HQ T2
    ('71000000-0000-0000-0000-000000000011', '50000000-0000-0000-0000-000000000000', '70000000-0000-0000-0000-000000000003'), -- HQ T3
    ('71000000-0000-0000-0000-000000000012', '50000000-0000-0000-0000-000000000000', '70000000-0000-0000-0000-000000000004'), -- HQ T4
    ('71000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001'), -- Planta Valencia T1
    ('71000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000002'), -- Planta Valencia T2
    ('71000000-0000-0000-0000-000000000013', '50000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000003'), -- Planta Valencia T3
    ('71000000-0000-0000-0000-000000000014', '50000000-0000-0000-0000-000000000010', '70000000-0000-0000-0000-000000000005'), -- Guacara T5
    ('71000000-0000-0000-0000-000000000015', '50000000-0000-0000-0000-000000000010', '70000000-0000-0000-0000-000000000001'), -- Guacara T1
    ('71000000-0000-0000-0000-000000000016', '50000000-0000-0000-0000-000000000011', '70000000-0000-0000-0000-000000000004'), -- Caracas T4 Admin

    -- FN-EMS-2025-002 v1 histórica (6 turnos distintos en sitios v1)
    ('71000000-0000-0000-0000-000000001020', '50000000-0000-0000-0000-000000001002', '70000000-0000-0000-0000-000000000001'), -- HQ v1 T1
    ('71000000-0000-0000-0000-000000001021', '50000000-0000-0000-0000-000000001002', '70000000-0000-0000-0000-000000000002'), -- HQ v1 T2
    ('71000000-0000-0000-0000-000000001022', '50000000-0000-0000-0000-000000001002', '70000000-0000-0000-0000-000000000003'), -- HQ v1 T3
    ('71000000-0000-0000-0000-000000001023', '50000000-0000-0000-0000-000000001002', '70000000-0000-0000-0000-000000000006'), -- HQ v1 T6 Guardia
    ('71000000-0000-0000-0000-000000001024', '50000000-0000-0000-0000-000000001012', '70000000-0000-0000-0000-000000000001'), -- Planta Sur v1 T1
    ('71000000-0000-0000-0000-000000001025', '50000000-0000-0000-0000-000000001012', '70000000-0000-0000-0000-000000000002'), -- Planta Sur v1 T2
    ('71000000-0000-0000-0000-000000001026', '50000000-0000-0000-0000-000000001013', '70000000-0000-0000-0000-000000000005'), -- Acopio Guacara v1 T5
    ('71000000-0000-0000-0000-000000001027', '50000000-0000-0000-0000-000000001013', '70000000-0000-0000-0000-000000000004'), -- Acopio Guacara v1 T4 Admin

    -- FN-EMS-2025-002 v2 vigente (6 turnos distintos en sitios: T1, T2, T3, T6 en HQ; T1, T2 en Sur; T5, T4 en Acopio)
    ('71000000-0000-0000-0000-000000000020', '50000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000001'), -- HQ T1
    ('71000000-0000-0000-0000-000000000021', '50000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000002'), -- HQ T2
    ('71000000-0000-0000-0000-000000000022', '50000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000003'), -- HQ T3
    ('71000000-0000-0000-0000-000000000023', '50000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000006'), -- HQ T6 Guardia
    ('71000000-0000-0000-0000-000000000024', '50000000-0000-0000-0000-000000000012', '70000000-0000-0000-0000-000000000001'), -- Planta Sur T1
    ('71000000-0000-0000-0000-000000000025', '50000000-0000-0000-0000-000000000012', '70000000-0000-0000-0000-000000000002'), -- Planta Sur T2
    ('71000000-0000-0000-0000-000000000026', '50000000-0000-0000-0000-000000000013', '70000000-0000-0000-0000-000000000005'), -- Acopio Guacara T5
    ('71000000-0000-0000-0000-000000000027', '50000000-0000-0000-0000-000000000013', '70000000-0000-0000-0000-000000000004'), -- Acopio Guacara T4 Admin

    -- FN-SST-2025-010 (5 turnos distintos: T1, T2, T3, T6 en HQ; T1, T2 en Prensas; T4 en Caracas)
    ('71000000-0000-0000-0000-000000000030', '50000000-0000-0000-0000-000000000020', '70000000-0000-0000-0000-000000000001'), -- HQ T1
    ('71000000-0000-0000-0000-000000000031', '50000000-0000-0000-0000-000000000020', '70000000-0000-0000-0000-000000000002'), -- HQ T2
    ('71000000-0000-0000-0000-000000000032', '50000000-0000-0000-0000-000000000020', '70000000-0000-0000-0000-000000000003'), -- HQ T3
    ('71000000-0000-0000-0000-000000000033', '50000000-0000-0000-0000-000000000020', '70000000-0000-0000-0000-000000000006'), -- HQ T6 Brigada
    ('71000000-0000-0000-0000-000000000034', '50000000-0000-0000-0000-000000000021', '70000000-0000-0000-0000-000000000001'), -- Prensas T1
    ('71000000-0000-0000-0000-000000000035', '50000000-0000-0000-0000-000000000021', '70000000-0000-0000-0000-000000000002'), -- Prensas T2
    ('71000000-0000-0000-0000-000000000036', '50000000-0000-0000-0000-000000000022', '70000000-0000-0000-0000-000000000004'), -- Oficina Caracas T4 Admin

    -- FN-QMS-2026-008 (2 turnos distintos: T1, T2)
    ('71000000-0000-0000-0000-000000000040', '50000000-0000-0000-0000-000000000023', '70000000-0000-0000-0000-000000000001'), -- Taller CNC T1
    ('71000000-0000-0000-0000-000000000041', '50000000-0000-0000-0000-000000000023', '70000000-0000-0000-0000-000000000002'), -- Taller CNC T2

    -- CONG-CYB-01 (Centro de Datos Chacao)
    ('71000000-0000-0000-0000-000000000003', '50000000-0000-0000-0000-000000000003', '70000000-0000-0000-0000-000000000001'),

    -- FN-QMS-2025-004 (4 turnos distintos: T1, T2, T3, T4)
    ('71000000-0000-0000-0000-000000000004', '50000000-0000-0000-0000-000000000004', '70000000-0000-0000-0000-000000000001'), -- Santa Cruz HQ T1
    ('71000000-0000-0000-0000-000000000005', '50000000-0000-0000-0000-000000000004', '70000000-0000-0000-0000-000000000002'), -- Santa Cruz HQ T2
    ('71000000-0000-0000-0000-000000000050', '50000000-0000-0000-0000-000000000004', '70000000-0000-0000-0000-000000000003'), -- Santa Cruz HQ T3
    ('71000000-0000-0000-0000-000000000051', '50000000-0000-0000-0000-000000000004', '70000000-0000-0000-0000-000000000004'), -- Santa Cruz HQ T4
    ('71000000-0000-0000-0000-000000000052', '50000000-0000-0000-0000-000000000014', '70000000-0000-0000-0000-000000000001'), -- Cagua T1
    ('71000000-0000-0000-0000-000000000053', '50000000-0000-0000-0000-000000000014', '70000000-0000-0000-0000-000000000002'), -- Cagua T2
    ('71000000-0000-0000-0000-000000000054', '50000000-0000-0000-0000-000000000015', '70000000-0000-0000-0000-000000000004'), -- Caracas T4 Admin

    -- FN-EMS-2025-005 (4 turnos distintos: T1, T2, T6 en HQ; T1, T2 en Cagua; T4 en Maracay)
    ('71000000-0000-0000-0000-000000000006', '50000000-0000-0000-0000-000000000005', '70000000-0000-0000-0000-000000000001'), -- Santa Cruz SGA HQ T1
    ('71000000-0000-0000-0000-000000000060', '50000000-0000-0000-0000-000000000005', '70000000-0000-0000-0000-000000000002'), -- Santa Cruz SGA HQ T2
    ('71000000-0000-0000-0000-000000000061', '50000000-0000-0000-0000-000000000005', '70000000-0000-0000-0000-000000000006'), -- Santa Cruz SGA HQ T6
    ('71000000-0000-0000-0000-000000000062', '50000000-0000-0000-0000-000000000016', '70000000-0000-0000-0000-000000000001'), -- Cagua SGA T1
    ('71000000-0000-0000-0000-000000000063', '50000000-0000-0000-0000-000000000016', '70000000-0000-0000-0000-000000000002'), -- Cagua SGA T2
    ('71000000-0000-0000-0000-000000000064', '50000000-0000-0000-0000-000000000017', '70000000-0000-0000-0000-000000000004'), -- Maracay Admin T4

    -- FN-SST-2026-006 (2 turnos distintos: T1, T2)
    ('71000000-0000-0000-0000-000000000007', '50000000-0000-0000-0000-000000000006', '70000000-0000-0000-0000-000000000001'), -- Santa Cruz SST T1
    ('71000000-0000-0000-0000-000000000070', '50000000-0000-0000-0000-000000000006', '70000000-0000-0000-0000-000000000002'), -- Santa Cruz SST T2

    -- FN-QMS-2026-009 (1 turno: T5 Recepción y Despacho 06:00–14:00)
    ('71000000-0000-0000-0000-000000000080', '50000000-0000-0000-0000-000000000007', '70000000-0000-0000-0000-000000000005')  -- Centro Logístico Aragua T5
ON CONFLICT (id_sitio, id_turno) WHERE deleted_at IS NULL DO NOTHING;

-- 16. Procesos Operativos con Categorización 'tipo' (4–6 procesos por certificado CONG-IND-01)
INSERT INTO public.proceso (id, id_certificado, id_certificado_version, nombre_proceso, tipo) VALUES
    -- FN-QMS-2024-001 (Iberometal SGC · 6 procesos)
    ('60000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001', 'Troquelado y Fundición', 'Medular'),
    ('60000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001', 'Dirección Estratégica y Calidad', 'Estratégico'),
    ('60000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001', 'Mantenimiento y Logística', 'De Apoyo'),
    ('60000000-0000-0000-0000-000000000011', '40000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001', 'Fundición, Siderurgia y Control Metalúrgico', 'Medular'),
    ('60000000-0000-0000-0000-000000000012', '40000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001', 'Metrología y Competencia Técnica', 'De Apoyo'),
    ('60000000-0000-0000-0000-000000000013', '40000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001', 'Gestión Comercial y Atención al Cliente', 'Medular'),

    -- FN-EMS-2025-002 (Iberometal SGA · v1 histórica 4100...0002 · 5 procesos)
    ('60000000-0000-0000-0000-000000001004', '40000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000002', 'Control de Efluentes y Emisiones', 'Medular'),
    ('60000000-0000-0000-0000-000000001014', '40000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000002', 'Política Ambiental y Revisión por la Dirección', 'Estratégico'),
    ('60000000-0000-0000-0000-000000001015', '40000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000002', 'Tratamiento Superficial y Residuos Peligrosos', 'Medular'),
    ('60000000-0000-0000-0000-000000001016', '40000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000002', 'Respuesta ante Emergencias Ambientales', 'De Apoyo'),
    ('60000000-0000-0000-0000-000000001017', '40000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000002', 'Compras Químicas y Almacenamiento Seguro', 'De Apoyo'),

    -- FN-EMS-2025-002 (Iberometal SGA · v2 vigente 4100...0202 · 5 procesos)
    ('60000000-0000-0000-0000-000000000004', '40000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000202', 'Control de Efluentes y Emisiones', 'Medular'),
    ('60000000-0000-0000-0000-000000000014', '40000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000202', 'Política Ambiental y Revisión por la Dirección', 'Estratégico'),
    ('60000000-0000-0000-0000-000000000015', '40000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000202', 'Tratamiento Superficial y Residuos Peligrosos', 'Medular'),
    ('60000000-0000-0000-0000-000000000016', '40000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000202', 'Respuesta ante Emergencias Ambientales', 'De Apoyo'),
    ('60000000-0000-0000-0000-000000000017', '40000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000202', 'Compras Químicas y Almacenamiento Seguro', 'De Apoyo'),

    -- FN-SST-2025-010 (Iberometal SST · 5 procesos)
    ('60000000-0000-0000-0000-000000000018', '40000000-0000-0000-0000-000000000010', '41000000-0000-0000-0000-000000000010', 'Liderazgo SST y Participación de Trabajadores', 'Estratégico'),
    ('60000000-0000-0000-0000-000000000019', '40000000-0000-0000-0000-000000000010', '41000000-0000-0000-0000-000000000010', 'Control de Riesgos en Prensas y Fundición', 'Medular'),
    ('60000000-0000-0000-0000-000000000020', '40000000-0000-0000-0000-000000000010', '41000000-0000-0000-0000-000000000010', 'Izaje de Cargas y Operación Segura', 'Medular'),
    ('60000000-0000-0000-0000-000000000021', '40000000-0000-0000-0000-000000000010', '41000000-0000-0000-0000-000000000010', 'Mantenimiento Eléctrico, LOTO y Brigadas', 'De Apoyo'),
    ('60000000-0000-0000-0000-000000000022', '40000000-0000-0000-0000-000000000010', '41000000-0000-0000-0000-000000000010', 'Vigilancia Médica Ocupacional y Capacitación', 'De Apoyo'),

    -- FN-QMS-2026-008 (Iberometal Estudio CNC · 4 procesos)
    ('60000000-0000-0000-0000-000000000023', '40000000-0000-0000-0000-000000000008', '41000000-0000-0000-0000-000000000008', 'Planificación Estratégica Línea CNC', 'Estratégico'),
    ('60000000-0000-0000-0000-000000000024', '40000000-0000-0000-0000-000000000008', '41000000-0000-0000-0000-000000000008', 'Mecanizado CNC de Alta Precisión', 'Medular'),
    ('60000000-0000-0000-0000-000000000025', '40000000-0000-0000-0000-000000000008', '41000000-0000-0000-0000-000000000008', 'Verificación Dimensional y Trazabilidad', 'Medular'),
    ('60000000-0000-0000-0000-000000000026', '40000000-0000-0000-0000-000000000008', '41000000-0000-0000-0000-000000000008', 'Mantenimiento Preventivo y Calibración CNC', 'De Apoyo'),

    -- CONG-CYB-01 (CyberCloud)
    ('60000000-0000-0000-0000-000000000005', '40000000-0000-0000-0000-000000000003', '41000000-0000-0000-0000-000000000003', 'Gestión de Incidentes y SOC', 'Medular'),

    -- FN-QMS-2025-004 (Example, C.A. SGC · 6 procesos)
    ('60000000-0000-0000-0000-000000000006', '40000000-0000-0000-0000-000000000004', '41000000-0000-0000-0000-000000000004', 'Fabricación de Estructuras', 'Medular'),
    ('60000000-0000-0000-0000-000000000007', '40000000-0000-0000-0000-000000000004', '41000000-0000-0000-0000-000000000004', 'Revisión por la Dirección Integrada', 'Estratégico'),
    ('60000000-0000-0000-0000-000000000027', '40000000-0000-0000-0000-000000000004', '41000000-0000-0000-0000-000000000004', 'Diseño de Ingeniería y Planos Estructurales', 'Medular'),
    ('60000000-0000-0000-0000-000000000028', '40000000-0000-0000-0000-000000000004', '41000000-0000-0000-0000-000000000004', 'Granallado, Pintura y Ensayos No Destructivos', 'Medular'),
    ('60000000-0000-0000-0000-000000000029', '40000000-0000-0000-0000-000000000004', '41000000-0000-0000-0000-000000000004', 'Gestión Comercial y Licitaciones Industriales', 'Medular'),
    ('60000000-0000-0000-0000-000000000030', '40000000-0000-0000-0000-000000000004', '41000000-0000-0000-0000-000000000004', 'Compras, Talento Humano y Mantenimiento', 'De Apoyo'),

    -- FN-EMS-2025-005 (Example, C.A. SGA · 5 procesos)
    ('60000000-0000-0000-0000-000000000008', '40000000-0000-0000-0000-000000000005', '41000000-0000-0000-0000-000000000005', 'Manejo de Residuos Industriales', 'Medular'),
    ('60000000-0000-0000-0000-000000000031', '40000000-0000-0000-0000-000000000005', '41000000-0000-0000-0000-000000000005', 'Política Ambiental y Cumplimiento Legal SGA', 'Estratégico'),
    ('60000000-0000-0000-0000-000000000032', '40000000-0000-0000-0000-000000000005', '41000000-0000-0000-0000-000000000005', 'Control de Emisiones y Cabinas de Pintura', 'Medular'),
    ('60000000-0000-0000-0000-000000000033', '40000000-0000-0000-0000-000000000005', '41000000-0000-0000-0000-000000000005', 'Preparación y Respuesta Ambiental', 'De Apoyo'),
    ('60000000-0000-0000-0000-000000000034', '40000000-0000-0000-0000-000000000005', '41000000-0000-0000-0000-000000000005', 'Gestión Administrativa y Documental Ambiental', 'De Apoyo'),

    -- FN-SST-2026-006 (Example, C.A. SST · 4 procesos)
    ('60000000-0000-0000-0000-000000000009', '40000000-0000-0000-0000-000000000006', '41000000-0000-0000-0000-000000000006', 'Control de Riesgos Mecánicos', 'Medular'),
    ('60000000-0000-0000-0000-000000000010', '40000000-0000-0000-0000-000000000006', '41000000-0000-0000-0000-000000000006', 'Vigilancia Ocupacional y Brigadas', 'De Apoyo'),
    ('60000000-0000-0000-0000-000000000035', '40000000-0000-0000-0000-000000000006', '41000000-0000-0000-0000-000000000006', 'Liderazgo SST y Consulta de Trabajadores', 'Estratégico'),
    ('60000000-0000-0000-0000-000000000036', '40000000-0000-0000-0000-000000000006', '41000000-0000-0000-0000-000000000006', 'Trabajos en Altura, Soldadura e Izaje', 'Medular'),

    -- FN-QMS-2026-009 (Example, C.A. Logística · 4 procesos)
    ('60000000-0000-0000-0000-000000000037', '40000000-0000-0000-0000-000000000009', '41000000-0000-0000-0000-000000000009', 'Planificación Logística y Niveles de Servicio', 'Estratégico'),
    ('60000000-0000-0000-0000-000000000038', '40000000-0000-0000-0000-000000000009', '41000000-0000-0000-0000-000000000009', 'Recepción, Inspección en Tránsito y Almacenaje', 'Medular'),
    ('60000000-0000-0000-0000-000000000039', '40000000-0000-0000-0000-000000000009', '41000000-0000-0000-0000-000000000009', 'Consolidación de Carga y Despacho Industrial', 'Medular'),
    ('60000000-0000-0000-0000-000000000040', '40000000-0000-0000-0000-000000000009', '41000000-0000-0000-0000-000000000009', 'Mantenimiento de Flota, Montacargas y Compras', 'De Apoyo')
ON CONFLICT (id_certificado_version, LOWER(TRIM(nombre_proceso))) WHERE deleted_at IS NULL DO UPDATE SET
    nombre_proceso = EXCLUDED.nombre_proceso,
    tipo = EXCLUDED.tipo,
    updated_at = NOW();

-- 16b. Procesos por Sitio (Paso 2.1: Sitio 0 HQ concentra Medular/Estratégico; sedes secundarias solo procesos operativos propios)
INSERT INTO public.procesos_por_sitio (id, id_certificado, id_certificado_version, id_sitio, id_proceso) VALUES
    -- FN-QMS-2024-001: Sitio 0 HQ (6) · Sitio 1 Planta Valencia (3) · Sitio 2 Guacara (1) · Sitio 3 Caracas (1)
    ('61000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000000', '60000000-0000-0000-0000-000000000002'),
    ('61000000-0000-0000-0000-000000000011', '40000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000000', '60000000-0000-0000-0000-000000000001'),
    ('61000000-0000-0000-0000-000000000012', '40000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000000', '60000000-0000-0000-0000-000000000003'),
    ('61000000-0000-0000-0000-000000000013', '40000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000000', '60000000-0000-0000-0000-000000000011'),
    ('61000000-0000-0000-0000-000000000014', '40000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000000', '60000000-0000-0000-0000-000000000012'),
    ('61000000-0000-0000-0000-000000000015', '40000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000000', '60000000-0000-0000-0000-000000000013'),
    ('61000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001'),
    ('61000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000003'),
    ('61000000-0000-0000-0000-000000000016', '40000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000012'),
    ('61000000-0000-0000-0000-000000000017', '40000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000010', '60000000-0000-0000-0000-000000000003'),
    ('61000000-0000-0000-0000-000000000018', '40000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000011', '60000000-0000-0000-0000-000000000013'),

    -- FN-EMS-2025-002 v1 histórica (4100...0002): Sitio 0 HQ (5) · Sitio 1 Valencia Sur (2) · Sitio 2 Guacara (1)
    ('61000000-0000-0000-0000-000000001004', '40000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000001002', '60000000-0000-0000-0000-000000001004'),
    ('61000000-0000-0000-0000-000000001019', '40000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000001002', '60000000-0000-0000-0000-000000001014'),
    ('61000000-0000-0000-0000-000000001020', '40000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000001002', '60000000-0000-0000-0000-000000001015'),
    ('61000000-0000-0000-0000-000000001021', '40000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000001002', '60000000-0000-0000-0000-000000001016'),
    ('61000000-0000-0000-0000-000000001022', '40000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000001002', '60000000-0000-0000-0000-000000001017'),
    ('61000000-0000-0000-0000-000000001023', '40000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000001012', '60000000-0000-0000-0000-000000001015'),
    ('61000000-0000-0000-0000-000000001024', '40000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000001012', '60000000-0000-0000-0000-000000001016'),
    ('61000000-0000-0000-0000-000000001025', '40000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000001013', '60000000-0000-0000-0000-000000001017'),

    -- FN-EMS-2025-002 v2 vigente (4100...0202): Sitio 0 HQ (5) · Sitio 1 Valencia Sur (2) · Sitio 2 Guacara (1)
    ('61000000-0000-0000-0000-000000000004', '40000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000202', '50000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000004'),
    ('61000000-0000-0000-0000-000000000019', '40000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000202', '50000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000014'),
    ('61000000-0000-0000-0000-000000000020', '40000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000202', '50000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000015'),
    ('61000000-0000-0000-0000-000000000021', '40000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000202', '50000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000016'),
    ('61000000-0000-0000-0000-000000000022', '40000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000202', '50000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000017'),
    ('61000000-0000-0000-0000-000000000023', '40000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000202', '50000000-0000-0000-0000-000000000012', '60000000-0000-0000-0000-000000000015'),
    ('61000000-0000-0000-0000-000000000024', '40000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000202', '50000000-0000-0000-0000-000000000012', '60000000-0000-0000-0000-000000000016'),
    ('61000000-0000-0000-0000-000000000025', '40000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000202', '50000000-0000-0000-0000-000000000013', '60000000-0000-0000-0000-000000000017'),

    -- FN-SST-2025-010: Sitio 0 HQ (5) · Sitio 1 Prensas (2) · Sitio 2 Caracas (1)
    ('61000000-0000-0000-0000-000000000026', '40000000-0000-0000-0000-000000000010', '41000000-0000-0000-0000-000000000010', '50000000-0000-0000-0000-000000000020', '60000000-0000-0000-0000-000000000018'),
    ('61000000-0000-0000-0000-000000000027', '40000000-0000-0000-0000-000000000010', '41000000-0000-0000-0000-000000000010', '50000000-0000-0000-0000-000000000020', '60000000-0000-0000-0000-000000000019'),
    ('61000000-0000-0000-0000-000000000028', '40000000-0000-0000-0000-000000000010', '41000000-0000-0000-0000-000000000010', '50000000-0000-0000-0000-000000000020', '60000000-0000-0000-0000-000000000020'),
    ('61000000-0000-0000-0000-000000000029', '40000000-0000-0000-0000-000000000010', '41000000-0000-0000-0000-000000000010', '50000000-0000-0000-0000-000000000020', '60000000-0000-0000-0000-000000000021'),
    ('61000000-0000-0000-0000-000000000030', '40000000-0000-0000-0000-000000000010', '41000000-0000-0000-0000-000000000010', '50000000-0000-0000-0000-000000000020', '60000000-0000-0000-0000-000000000022'),
    ('61000000-0000-0000-0000-000000000031', '40000000-0000-0000-0000-000000000010', '41000000-0000-0000-0000-000000000010', '50000000-0000-0000-0000-000000000021', '60000000-0000-0000-0000-000000000019'),
    ('61000000-0000-0000-0000-000000000032', '40000000-0000-0000-0000-000000000010', '41000000-0000-0000-0000-000000000010', '50000000-0000-0000-0000-000000000021', '60000000-0000-0000-0000-000000000021'),
    ('61000000-0000-0000-0000-000000000033', '40000000-0000-0000-0000-000000000010', '41000000-0000-0000-0000-000000000010', '50000000-0000-0000-0000-000000000022', '60000000-0000-0000-0000-000000000022'),

    -- FN-QMS-2026-008: Sitio 0 Taller Piloto CNC (4)
    ('61000000-0000-0000-0000-000000000034', '40000000-0000-0000-0000-000000000008', '41000000-0000-0000-0000-000000000008', '50000000-0000-0000-0000-000000000023', '60000000-0000-0000-0000-000000000023'),
    ('61000000-0000-0000-0000-000000000035', '40000000-0000-0000-0000-000000000008', '41000000-0000-0000-0000-000000000008', '50000000-0000-0000-0000-000000000023', '60000000-0000-0000-0000-000000000024'),
    ('61000000-0000-0000-0000-000000000036', '40000000-0000-0000-0000-000000000008', '41000000-0000-0000-0000-000000000008', '50000000-0000-0000-0000-000000000023', '60000000-0000-0000-0000-000000000025'),
    ('61000000-0000-0000-0000-000000000037', '40000000-0000-0000-0000-000000000008', '41000000-0000-0000-0000-000000000008', '50000000-0000-0000-0000-000000000023', '60000000-0000-0000-0000-000000000026'),

    -- CONG-CYB-01 (CyberCloud)
    ('61000000-0000-0000-0000-000000000005', '40000000-0000-0000-0000-000000000003', '41000000-0000-0000-0000-000000000003', '50000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-000000000005'),

    -- FN-QMS-2025-004: Sitio 0 Santa Cruz HQ (6) · Sitio 1 Cagua (2) · Sitio 2 Caracas (2)
    ('61000000-0000-0000-0000-000000000006', '40000000-0000-0000-0000-000000000004', '41000000-0000-0000-0000-000000000004', '50000000-0000-0000-0000-000000000004', '60000000-0000-0000-0000-000000000006'),
    ('61000000-0000-0000-0000-000000000007', '40000000-0000-0000-0000-000000000004', '41000000-0000-0000-0000-000000000004', '50000000-0000-0000-0000-000000000004', '60000000-0000-0000-0000-000000000007'),
    ('61000000-0000-0000-0000-000000000038', '40000000-0000-0000-0000-000000000004', '41000000-0000-0000-0000-000000000004', '50000000-0000-0000-0000-000000000004', '60000000-0000-0000-0000-000000000027'),
    ('61000000-0000-0000-0000-000000000039', '40000000-0000-0000-0000-000000000004', '41000000-0000-0000-0000-000000000004', '50000000-0000-0000-0000-000000000004', '60000000-0000-0000-0000-000000000028'),
    ('61000000-0000-0000-0000-000000000040', '40000000-0000-0000-0000-000000000004', '41000000-0000-0000-0000-000000000004', '50000000-0000-0000-0000-000000000004', '60000000-0000-0000-0000-000000000029'),
    ('61000000-0000-0000-0000-000000000041', '40000000-0000-0000-0000-000000000004', '41000000-0000-0000-0000-000000000004', '50000000-0000-0000-0000-000000000004', '60000000-0000-0000-0000-000000000030'),
    ('61000000-0000-0000-0000-000000000042', '40000000-0000-0000-0000-000000000004', '41000000-0000-0000-0000-000000000004', '50000000-0000-0000-0000-000000000014', '60000000-0000-0000-0000-000000000028'),
    ('61000000-0000-0000-0000-000000000043', '40000000-0000-0000-0000-000000000004', '41000000-0000-0000-0000-000000000004', '50000000-0000-0000-0000-000000000014', '60000000-0000-0000-0000-000000000030'),
    ('61000000-0000-0000-0000-000000000044', '40000000-0000-0000-0000-000000000004', '41000000-0000-0000-0000-000000000004', '50000000-0000-0000-0000-000000000015', '60000000-0000-0000-0000-000000000027'),
    ('61000000-0000-0000-0000-000000000045', '40000000-0000-0000-0000-000000000004', '41000000-0000-0000-0000-000000000004', '50000000-0000-0000-0000-000000000015', '60000000-0000-0000-0000-000000000029'),

    -- FN-EMS-2025-005: Sitio 0 Santa Cruz SGA HQ (5) · Sitio 1 Cagua SGA (2) · Sitio 2 Maracay (1)
    ('61000000-0000-0000-0000-000000000008', '40000000-0000-0000-0000-000000000005', '41000000-0000-0000-0000-000000000005', '50000000-0000-0000-0000-000000000005', '60000000-0000-0000-0000-000000000008'),
    ('61000000-0000-0000-0000-000000000046', '40000000-0000-0000-0000-000000000005', '41000000-0000-0000-0000-000000000005', '50000000-0000-0000-0000-000000000005', '60000000-0000-0000-0000-000000000031'),
    ('61000000-0000-0000-0000-000000000047', '40000000-0000-0000-0000-000000000005', '41000000-0000-0000-0000-000000000005', '50000000-0000-0000-0000-000000000005', '60000000-0000-0000-0000-000000000032'),
    ('61000000-0000-0000-0000-000000000048', '40000000-0000-0000-0000-000000000005', '41000000-0000-0000-0000-000000000005', '50000000-0000-0000-0000-000000000005', '60000000-0000-0000-0000-000000000033'),
    ('61000000-0000-0000-0000-000000000049', '40000000-0000-0000-0000-000000000005', '41000000-0000-0000-0000-000000000005', '50000000-0000-0000-0000-000000000005', '60000000-0000-0000-0000-000000000034'),
    ('61000000-0000-0000-0000-000000000050', '40000000-0000-0000-0000-000000000005', '41000000-0000-0000-0000-000000000005', '50000000-0000-0000-0000-000000000016', '60000000-0000-0000-0000-000000000032'),
    ('61000000-0000-0000-0000-000000000051', '40000000-0000-0000-0000-000000000005', '41000000-0000-0000-0000-000000000005', '50000000-0000-0000-0000-000000000016', '60000000-0000-0000-0000-000000000033'),
    ('61000000-0000-0000-0000-000000000052', '40000000-0000-0000-0000-000000000005', '41000000-0000-0000-0000-000000000005', '50000000-0000-0000-0000-000000000017', '60000000-0000-0000-0000-000000000034'),

    -- FN-SST-2026-006: Sitio 0 Planta Santa Cruz SST (4)
    ('61000000-0000-0000-0000-000000000009', '40000000-0000-0000-0000-000000000006', '41000000-0000-0000-0000-000000000006', '50000000-0000-0000-0000-000000000006', '60000000-0000-0000-0000-000000000009'),
    ('61000000-0000-0000-0000-000000000010', '40000000-0000-0000-0000-000000000006', '41000000-0000-0000-0000-000000000006', '50000000-0000-0000-0000-000000000006', '60000000-0000-0000-0000-000000000010'),
    ('61000000-0000-0000-0000-000000000053', '40000000-0000-0000-0000-000000000006', '41000000-0000-0000-0000-000000000006', '50000000-0000-0000-0000-000000000006', '60000000-0000-0000-0000-000000000035'),
    ('61000000-0000-0000-0000-000000000054', '40000000-0000-0000-0000-000000000006', '41000000-0000-0000-0000-000000000006', '50000000-0000-0000-0000-000000000006', '60000000-0000-0000-0000-000000000036'),

    -- FN-QMS-2026-009: Sitio 0 Centro Logístico Aragua (4)
    ('61000000-0000-0000-0000-000000000055', '40000000-0000-0000-0000-000000000009', '41000000-0000-0000-0000-000000000009', '50000000-0000-0000-0000-000000000007', '60000000-0000-0000-0000-000000000037'),
    ('61000000-0000-0000-0000-000000000056', '40000000-0000-0000-0000-000000000009', '41000000-0000-0000-0000-000000000009', '50000000-0000-0000-0000-000000000007', '60000000-0000-0000-0000-000000000038'),
    ('61000000-0000-0000-0000-000000000057', '40000000-0000-0000-0000-000000000009', '41000000-0000-0000-0000-000000000009', '50000000-0000-0000-0000-000000000007', '60000000-0000-0000-0000-000000000039'),
    ('61000000-0000-0000-0000-000000000058', '40000000-0000-0000-0000-000000000009', '41000000-0000-0000-0000-000000000009', '50000000-0000-0000-0000-000000000007', '60000000-0000-0000-0000-000000000040')
ON CONFLICT (id_certificado_version, id_sitio, id_proceso) WHERE deleted_at IS NULL DO UPDATE SET updated_at = NOW();

-- 17. Mapeo de Requisitos por Proceso (Paso 2.2: Cobertura 100.00% en los 8 certificados CONG-IND-01)
INSERT INTO public.requisitos_por_proceso (id_proceso, id_certificado, id_certificado_version, id_requisito) VALUES
    -- FN-QMS-2024-001 (40...0001 / v1 41...0001 · ISO 9001:2015 · 8.3 excluida por ISO 4.3)
    -- 60...0002: Dirección Estratégica y Calidad (Estratégico)
    ('60000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000041'), -- 4.1
    ('60000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000042'), -- 4.2
    ('60000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001', '35dc2efc-9ded-4596-8374-fc34cc9846e5'), -- 4.3
    ('60000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001', '31dc28b0-2a89-4182-99eb-fc20c8984099'), -- 4.4
    ('60000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000051'), -- 5.1
    ('60000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001', 'b5d02c89-71e9-4c9b-a33a-8c1344a43cc0'), -- 5.2
    ('60000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001', 'c1d27e04-2065-4466-9003-ac7c48a20475'), -- 5.3
    ('60000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001', '2ecadad6-974a-4c7c-ac53-3b6a5b9fe3c7'), -- 6.1
    ('60000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001', '2fcd1b00-a8b4-4f46-b445-98e4da9cda1d'), -- 6.2
    ('60000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001', '38ed7cd6-d7fc-4a78-be34-b47e49aed1fb'), -- 6.3
    ('60000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001', 'c942a690-6bbd-46c2-b165-62843931cf51'), -- 9.3
    ('60000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001', '403b1320-7e53-4abe-b141-6fc44a2fab7d'), -- 10.1
    ('60000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001', '444a23f6-12b1-4790-bccb-0b9abe2a51eb'), -- 10.3
    -- 60...0001: Troquelado y Fundición (Medular · preserva 4.1 y 8.5 históricos)
    ('60000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000041'), -- 4.1
    ('60000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001', '2478c2a5-c27a-48f7-aca8-ebcbee0f5424'), -- 8.1
    ('60000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000085'), -- 8.5
    ('60000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001', 'd87c648c-8cba-4522-91ce-4334b2156981'), -- 8.6
    ('60000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001', 'df7c6f91-d88e-439f-8582-105fab155e7c'), -- 8.7
    -- 60...0011: Fundición, Siderurgia y Control Metalúrgico (Medular)
    ('60000000-0000-0000-0000-000000000011', '40000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001', '2478c2a5-c27a-48f7-aca8-ebcbee0f5424'), -- 8.1
    ('60000000-0000-0000-0000-000000000011', '40000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000085'), -- 8.5
    ('60000000-0000-0000-0000-000000000011', '40000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001', 'd87c648c-8cba-4522-91ce-4334b2156981'), -- 8.6
    ('60000000-0000-0000-0000-000000000011', '40000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001', 'df7c6f91-d88e-439f-8582-105fab155e7c'), -- 8.7
    ('60000000-0000-0000-0000-000000000011', '40000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001', '443b196c-0af0-49aa-930e-26b0462fa531'), -- 10.2
    -- 60...0013: Gestión Comercial y Atención al Cliente (Medular)
    ('60000000-0000-0000-0000-000000000013', '40000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001', 'b480611a-c93b-4458-a918-93d656123673'), -- 8.2
    ('60000000-0000-0000-0000-000000000013', '40000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000085'), -- 8.5
    ('60000000-0000-0000-0000-000000000013', '40000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001', '6381bc8b-9b89-4865-a74c-d1f99ef2b956'), -- 9.1
    -- 60...0003: Mantenimiento y Logística (De Apoyo)
    ('60000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001', '42efcb2b-b1a4-4195-849a-2035d7abdfee'), -- 7.1
    ('60000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001', '227680e8-bc54-4fbe-8165-d288e8088eed'), -- 7.4
    ('60000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001', '5c72a6fc-5518-41ea-971f-9cac1e0b8629'), -- 8.4
    ('60000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000085'), -- 8.5
    -- 60...0012: Metrología y Competencia Técnica (De Apoyo)
    ('60000000-0000-0000-0000-000000000012', '40000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001', '42efcb2b-b1a4-4195-849a-2035d7abdfee'), -- 7.1
    ('60000000-0000-0000-0000-000000000012', '40000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001', 'a26efba3-e5bc-412d-81ca-4e0d60057a3e'), -- 7.2
    ('60000000-0000-0000-0000-000000000012', '40000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001', '1f767c2f-7773-411d-8ad2-52d1db087a76'), -- 7.3
    ('60000000-0000-0000-0000-000000000012', '40000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001', 'b2739201-ce87-4e47-ac0f-192be80acd84'), -- 7.5
    ('60000000-0000-0000-0000-000000000012', '40000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001', '6381bc8b-9b89-4865-a74c-d1f99ef2b956'), -- 9.1
    ('60000000-0000-0000-0000-000000000012', '40000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001', '6a840627-c8e1-4f99-a6ab-4c019ff07c52'), -- 9.2
    ('60000000-0000-0000-0000-000000000012', '40000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001', '443b196c-0af0-49aa-930e-26b0462fa531'), -- 10.2

    -- FN-EMS-2025-002 v1 histórica (40...0002 / v1 41...0002 · ISO 14001:2015)
    ('60000000-0000-0000-0000-000000001014', '40000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000002', 'c107358e-ea84-4fe6-a2e4-9534bbf764a6'), -- 4.1
    ('60000000-0000-0000-0000-000000001014', '40000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000002', 'c2073721-ac24-4ee1-adcd-d191bcf76639'), -- 4.2
    ('60000000-0000-0000-0000-000000001014', '40000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000002', 'c6073d6d-ea32-439d-9df3-ff5dc0f76c85'), -- 4.3
    ('60000000-0000-0000-0000-000000001014', '40000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000002', 'c20975b8-3e5c-4e10-9998-0a0e3cfa6e50'), -- 4.4
    ('60000000-0000-0000-0000-000000001014', '40000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000002', 'c8097f2a-9f38-4a8e-b14e-5a5042fa77c2'), -- 5.1
    ('60000000-0000-0000-0000-000000001014', '40000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000002', 'c80bbdc1-840a-42b5-9ae8-040542fcb659'), -- 5.2
    ('60000000-0000-0000-0000-000000001014', '40000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000002', '300ea010-4a0f-4634-a389-d33a4aff0188'), -- 5.3
    ('60000000-0000-0000-0000-000000001014', '40000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000002', '340ea65c-c6ab-48f0-a8b6-606e4eff07d4'), -- 6.1
    ('60000000-0000-0000-0000-000000001014', '40000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000002', '47ffbb4e-79bd-4e02-a043-1a84c317c356'), -- 6.2
    ('60000000-0000-0000-0000-000000001014', '40000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000002', 'b197006a-6679-4b62-90cc-936c2c87f902'), -- 9.3
    ('60000000-0000-0000-0000-000000001014', '40000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000002', '1e919bd3-0c61-4fcb-ba91-568b39aa9fbb'), -- 10.1
    ('60000000-0000-0000-0000-000000001014', '40000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000002', '922dcb09-e643-4f59-9b20-8fc9ad6dde61'), -- 10.3
    ('60000000-0000-0000-0000-000000001004', '40000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000002', '1f9e6959-2151-4f79-8881-1d213a8ecad1'), -- 8.1
    ('60000000-0000-0000-0000-000000001004', '40000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000002', 'b49b8251-7363-4245-a26e-7af12f8c7ae9'), -- 9.1
    ('60000000-0000-0000-0000-000000001004', '40000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000002', '2391a3b2-7bae-448e-94f7-68503eaaa79a'), -- 10.2
    ('60000000-0000-0000-0000-000000001015', '40000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000002', '340ea65c-c6ab-48f0-a8b6-606e4eff07d4'), -- 6.1
    ('60000000-0000-0000-0000-000000001015', '40000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000002', '1f9e6959-2151-4f79-8881-1d213a8ecad1'), -- 8.1
    ('60000000-0000-0000-0000-000000001015', '40000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000002', '229e6e12-8dfb-492a-95dd-7d303d8ecf8a'), -- 8.2
    ('60000000-0000-0000-0000-000000001015', '40000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000002', '2391a3b2-7bae-448e-94f7-68503eaaa79a'), -- 10.2
    ('60000000-0000-0000-0000-000000001016', '40000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000002', 'afa607ce-84df-4982-b0bd-cc0caa9636e6'), -- 7.2
    ('60000000-0000-0000-0000-000000001016', '40000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000002', 'b4a60fad-bf8b-4211-bb4d-cbf5af963ec5'), -- 7.3
    ('60000000-0000-0000-0000-000000001016', '40000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000002', '29a2f645-006b-4d49-9b67-4ff1c494213d'), -- 7.4
    ('60000000-0000-0000-0000-000000001016', '40000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000002', '229e6e12-8dfb-492a-95dd-7d303d8ecf8a'), -- 8.2
    ('60000000-0000-0000-0000-000000001016', '40000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000002', 'b3994227-ca76-4c6f-89a0-94232e8a3abf'), -- 9.2
    ('60000000-0000-0000-0000-000000001017', '40000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000002', 'aca841ac-3699-4400-9c84-d21237995374'), -- 7.1
    ('60000000-0000-0000-0000-000000001017', '40000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000002', '29a2f645-006b-4d49-9b67-4ff1c494213d'), -- 7.4
    ('60000000-0000-0000-0000-000000001017', '40000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000002', '23a0ae3c-2598-41c0-b7e1-46cebe91d934'), -- 7.5
    ('60000000-0000-0000-0000-000000001017', '40000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000002', '1f9e6959-2151-4f79-8881-1d213a8ecad1'), -- 8.1
    ('60000000-0000-0000-0000-000000001017', '40000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000002', 'b49b8251-7363-4245-a26e-7af12f8c7ae9'), -- 9.1

    -- FN-EMS-2025-002 v2 vigente (40...0002 / v2 41...0202 · ISO 14001:2015 · sin exclusiones)
    -- 60...0014: Política Ambiental y Revisión por la Dirección (Estratégico)
    ('60000000-0000-0000-0000-000000000014', '40000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000202', 'c107358e-ea84-4fe6-a2e4-9534bbf764a6'), -- 4.1
    ('60000000-0000-0000-0000-000000000014', '40000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000202', 'c2073721-ac24-4ee1-adcd-d191bcf76639'), -- 4.2
    ('60000000-0000-0000-0000-000000000014', '40000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000202', 'c6073d6d-ea32-439d-9df3-ff5dc0f76c85'), -- 4.3
    ('60000000-0000-0000-0000-000000000014', '40000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000202', 'c20975b8-3e5c-4e10-9998-0a0e3cfa6e50'), -- 4.4
    ('60000000-0000-0000-0000-000000000014', '40000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000202', 'c8097f2a-9f38-4a8e-b14e-5a5042fa77c2'), -- 5.1
    ('60000000-0000-0000-0000-000000000014', '40000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000202', 'c80bbdc1-840a-42b5-9ae8-040542fcb659'), -- 5.2
    ('60000000-0000-0000-0000-000000000014', '40000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000202', '300ea010-4a0f-4634-a389-d33a4aff0188'), -- 5.3
    ('60000000-0000-0000-0000-000000000014', '40000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000202', '340ea65c-c6ab-48f0-a8b6-606e4eff07d4'), -- 6.1
    ('60000000-0000-0000-0000-000000000014', '40000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000202', '47ffbb4e-79bd-4e02-a043-1a84c317c356'), -- 6.2
    ('60000000-0000-0000-0000-000000000014', '40000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000202', 'b197006a-6679-4b62-90cc-936c2c87f902'), -- 9.3
    ('60000000-0000-0000-0000-000000000014', '40000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000202', '1e919bd3-0c61-4fcb-ba91-568b39aa9fbb'), -- 10.1
    ('60000000-0000-0000-0000-000000000014', '40000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000202', '922dcb09-e643-4f59-9b20-8fc9ad6dde61'), -- 10.3
    -- 60...0004: Control de Efluentes y Emisiones (Medular)
    ('60000000-0000-0000-0000-000000000004', '40000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000202', '1f9e6959-2151-4f79-8881-1d213a8ecad1'), -- 8.1
    ('60000000-0000-0000-0000-000000000004', '40000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000202', 'b49b8251-7363-4245-a26e-7af12f8c7ae9'), -- 9.1
    ('60000000-0000-0000-0000-000000000004', '40000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000202', '2391a3b2-7bae-448e-94f7-68503eaaa79a'), -- 10.2
    -- 60...0015: Tratamiento Superficial y Residuos Peligrosos (Medular)
    ('60000000-0000-0000-0000-000000000015', '40000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000202', '340ea65c-c6ab-48f0-a8b6-606e4eff07d4'), -- 6.1
    ('60000000-0000-0000-0000-000000000015', '40000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000202', '1f9e6959-2151-4f79-8881-1d213a8ecad1'), -- 8.1
    ('60000000-0000-0000-0000-000000000015', '40000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000202', '229e6e12-8dfb-492a-95dd-7d303d8ecf8a'), -- 8.2
    ('60000000-0000-0000-0000-000000000015', '40000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000202', '2391a3b2-7bae-448e-94f7-68503eaaa79a'), -- 10.2
    -- 60...0016: Respuesta ante Emergencias Ambientales (De Apoyo)
    ('60000000-0000-0000-0000-000000000016', '40000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000202', 'afa607ce-84df-4982-b0bd-cc0caa9636e6'), -- 7.2
    ('60000000-0000-0000-0000-000000000016', '40000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000202', 'b4a60fad-bf8b-4211-bb4d-cbf5af963ec5'), -- 7.3
    ('60000000-0000-0000-0000-000000000016', '40000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000202', '29a2f645-006b-4d49-9b67-4ff1c494213d'), -- 7.4
    ('60000000-0000-0000-0000-000000000016', '40000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000202', '229e6e12-8dfb-492a-95dd-7d303d8ecf8a'), -- 8.2
    ('60000000-0000-0000-0000-000000000016', '40000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000202', 'b3994227-ca76-4c6f-89a0-94232e8a3abf'), -- 9.2
    -- 60...0017: Compras Químicas y Almacenamiento Seguro (De Apoyo)
    ('60000000-0000-0000-0000-000000000017', '40000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000202', 'aca841ac-3699-4400-9c84-d21237995374'), -- 7.1
    ('60000000-0000-0000-0000-000000000017', '40000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000202', '29a2f645-006b-4d49-9b67-4ff1c494213d'), -- 7.4
    ('60000000-0000-0000-0000-000000000017', '40000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000202', '23a0ae3c-2598-41c0-b7e1-46cebe91d934'), -- 7.5
    ('60000000-0000-0000-0000-000000000017', '40000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000202', '1f9e6959-2151-4f79-8881-1d213a8ecad1'), -- 8.1
    ('60000000-0000-0000-0000-000000000017', '40000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000202', 'b49b8251-7363-4245-a26e-7af12f8c7ae9'), -- 9.1

    -- FN-SST-2025-010 (40...0010 / v1 41...0010 · ISO 45001:2018 · sin exclusiones)
    -- 60...0018: Liderazgo SST y Participación de Trabajadores (Estratégico)
    ('60000000-0000-0000-0000-000000000018', '40000000-0000-0000-0000-000000000010', '41000000-0000-0000-0000-000000000010', '8f19eb3b-ff28-4d0f-b0fe-a2d3b02dc7b3'), -- 4.1
    ('60000000-0000-0000-0000-000000000018', '40000000-0000-0000-0000-000000000010', '41000000-0000-0000-0000-000000000010', '8e19e9a8-76ff-4cc4-b67c-d5b6af2dc620'), -- 4.2
    ('60000000-0000-0000-0000-000000000018', '40000000-0000-0000-0000-000000000010', '41000000-0000-0000-0000-000000000010', '2016fde7-66a9-4787-8b00-9db7b12b8aaf'), -- 4.3
    ('60000000-0000-0000-0000-000000000018', '40000000-0000-0000-0000-000000000010', '41000000-0000-0000-0000-000000000010', '1c16f79b-e36c-4cb3-9e8f-563bad2b8463'), -- 4.4
    ('60000000-0000-0000-0000-000000000018', '40000000-0000-0000-0000-000000000010', '41000000-0000-0000-0000-000000000010', '1a16f475-0621-4129-b9f3-ae85bb2b9a6d'), -- 5.1
    ('60000000-0000-0000-0000-000000000018', '40000000-0000-0000-0000-000000000010', '41000000-0000-0000-0000-000000000010', '18127421-6367-4bf9-8376-e95529263769'), -- 5.2
    ('60000000-0000-0000-0000-000000000018', '40000000-0000-0000-0000-000000000010', '41000000-0000-0000-0000-000000000010', '8f0f5ddf-d38e-47d3-b1f3-f72f404b2c77'), -- 5.3
    ('60000000-0000-0000-0000-000000000018', '40000000-0000-0000-0000-000000000010', '41000000-0000-0000-0000-000000000010', '900f5f72-3201-4022-bd5c-d9d8414b2e0a'), -- 5.4
    ('60000000-0000-0000-0000-000000000018', '40000000-0000-0000-0000-000000000010', '41000000-0000-0000-0000-000000000010', '9e8c5ef6-fcf2-4856-b1dd-0cfccfa0549e'), -- 6.1
    ('60000000-0000-0000-0000-000000000018', '40000000-0000-0000-0000-000000000010', '41000000-0000-0000-0000-000000000010', '2d84f14e-7c2b-4b62-8f17-ce643e98b496'), -- 6.2
    ('60000000-0000-0000-0000-000000000018', '40000000-0000-0000-0000-000000000010', '41000000-0000-0000-0000-000000000010', 'eb390cc2-2926-49a2-9e90-82349b5eb64a'), -- 9.3
    ('60000000-0000-0000-0000-000000000018', '40000000-0000-0000-0000-000000000010', '41000000-0000-0000-0000-000000000010', '7554297d-bda0-4a85-a27e-2b8d1552aa65'), -- 10.1
    ('60000000-0000-0000-0000-000000000018', '40000000-0000-0000-0000-000000000010', '41000000-0000-0000-0000-000000000010', '7ca87b8c-8276-4f88-819c-08e2acceee94'), -- 10.3
    -- 60...0019: Control de Riesgos en Prensas y Fundición (Medular)
    ('60000000-0000-0000-0000-000000000019', '40000000-0000-0000-0000-000000000010', '41000000-0000-0000-0000-000000000010', '9e8c5ef6-fcf2-4856-b1dd-0cfccfa0549e'), -- 6.1
    ('60000000-0000-0000-0000-000000000019', '40000000-0000-0000-0000-000000000010', '41000000-0000-0000-0000-000000000010', 'f53fd845-7f2c-4cdd-98ae-7b351566321d'), -- 8.1
    ('60000000-0000-0000-0000-000000000019', '40000000-0000-0000-0000-000000000010', '41000000-0000-0000-0000-000000000010', '745427ea-8160-411a-ab51-2dd01452a8d2'), -- 10.2
    -- 60...0020: Izaje de Cargas y Operación Segura (Medular)
    ('60000000-0000-0000-0000-000000000020', '40000000-0000-0000-0000-000000000010', '41000000-0000-0000-0000-000000000010', 'f53fd845-7f2c-4cdd-98ae-7b351566321d'), -- 8.1
    ('60000000-0000-0000-0000-000000000020', '40000000-0000-0000-0000-000000000010', '41000000-0000-0000-0000-000000000010', '6142c0e0-56b9-4194-8296-0712916933e8'), -- 8.2
    ('60000000-0000-0000-0000-000000000020', '40000000-0000-0000-0000-000000000010', '41000000-0000-0000-0000-000000000010', '6435f9a6-473d-422e-a418-077c945c6cae'), -- 9.1
    -- 60...0021: Mantenimiento Eléctrico, LOTO y Brigadas (De Apoyo)
    ('60000000-0000-0000-0000-000000000021', '40000000-0000-0000-0000-000000000010', '41000000-0000-0000-0000-000000000010', '1a895093-2943-48c7-8412-4c27cb9e0fbb'), -- 7.1
    ('60000000-0000-0000-0000-000000000021', '40000000-0000-0000-0000-000000000010', '41000000-0000-0000-0000-000000000010', '33782ecd-f75e-4255-ac2f-147dc4b3cb05'), -- 7.4
    ('60000000-0000-0000-0000-000000000021', '40000000-0000-0000-0000-000000000010', '41000000-0000-0000-0000-000000000010', 'f53fd845-7f2c-4cdd-98ae-7b351566321d'), -- 8.1
    ('60000000-0000-0000-0000-000000000021', '40000000-0000-0000-0000-000000000010', '41000000-0000-0000-0000-000000000010', '6142c0e0-56b9-4194-8296-0712916933e8'), -- 8.2
    ('60000000-0000-0000-0000-000000000021', '40000000-0000-0000-0000-000000000010', '41000000-0000-0000-0000-000000000010', '6633be35-e037-4319-9a57-d5f5965a313d'), -- 9.2
    -- 60...0022: Vigilancia Médica Ocupacional y Capacitación (De Apoyo)
    ('60000000-0000-0000-0000-000000000022', '40000000-0000-0000-0000-000000000010', '41000000-0000-0000-0000-000000000010', '19894f00-811a-461c-a5f3-9abaca9e0e28'), -- 7.2
    ('60000000-0000-0000-0000-000000000022', '40000000-0000-0000-0000-000000000010', '41000000-0000-0000-0000-000000000010', '20895a05-48be-414d-ae49-01a1d19e192d'), -- 7.3
    ('60000000-0000-0000-0000-000000000022', '40000000-0000-0000-0000-000000000010', '41000000-0000-0000-0000-000000000010', '33782ecd-f75e-4255-ac2f-147dc4b3cb05'), -- 7.4
    ('60000000-0000-0000-0000-000000000022', '40000000-0000-0000-0000-000000000010', '41000000-0000-0000-0000-000000000010', '307a68ab-17e8-4dcb-a338-40ab41b6ce63'), -- 7.5
    ('60000000-0000-0000-0000-000000000022', '40000000-0000-0000-0000-000000000010', '41000000-0000-0000-0000-000000000010', '6435f9a6-473d-422e-a418-077c945c6cae'), -- 9.1
    ('60000000-0000-0000-0000-000000000022', '40000000-0000-0000-0000-000000000010', '41000000-0000-0000-0000-000000000010', '745427ea-8160-411a-ab51-2dd01452a8d2'), -- 10.2

    -- FN-QMS-2026-008 (40...0008 / v1 41...0008 · ISO 9001:2015 · 8.3 excluida por ISO 4.3)
    -- 60...0023: Planificación Estratégica Línea CNC (Estratégico)
    ('60000000-0000-0000-0000-000000000023', '40000000-0000-0000-0000-000000000008', '41000000-0000-0000-0000-000000000008', 'f0000000-0000-0000-0000-000000000041'), -- 4.1
    ('60000000-0000-0000-0000-000000000023', '40000000-0000-0000-0000-000000000008', '41000000-0000-0000-0000-000000000008', 'f0000000-0000-0000-0000-000000000042'), -- 4.2
    ('60000000-0000-0000-0000-000000000023', '40000000-0000-0000-0000-000000000008', '41000000-0000-0000-0000-000000000008', '35dc2efc-9ded-4596-8374-fc34cc9846e5'), -- 4.3
    ('60000000-0000-0000-0000-000000000023', '40000000-0000-0000-0000-000000000008', '41000000-0000-0000-0000-000000000008', '31dc28b0-2a89-4182-99eb-fc20c8984099'), -- 4.4
    ('60000000-0000-0000-0000-000000000023', '40000000-0000-0000-0000-000000000008', '41000000-0000-0000-0000-000000000008', 'f0000000-0000-0000-0000-000000000051'), -- 5.1
    ('60000000-0000-0000-0000-000000000023', '40000000-0000-0000-0000-000000000008', '41000000-0000-0000-0000-000000000008', 'b5d02c89-71e9-4c9b-a33a-8c1344a43cc0'), -- 5.2
    ('60000000-0000-0000-0000-000000000023', '40000000-0000-0000-0000-000000000008', '41000000-0000-0000-0000-000000000008', 'c1d27e04-2065-4466-9003-ac7c48a20475'), -- 5.3
    ('60000000-0000-0000-0000-000000000023', '40000000-0000-0000-0000-000000000008', '41000000-0000-0000-0000-000000000008', '2ecadad6-974a-4c7c-ac53-3b6a5b9fe3c7'), -- 6.1
    ('60000000-0000-0000-0000-000000000023', '40000000-0000-0000-0000-000000000008', '41000000-0000-0000-0000-000000000008', '2fcd1b00-a8b4-4f46-b445-98e4da9cda1d'), -- 6.2
    ('60000000-0000-0000-0000-000000000023', '40000000-0000-0000-0000-000000000008', '41000000-0000-0000-0000-000000000008', '38ed7cd6-d7fc-4a78-be34-b47e49aed1fb'), -- 6.3
    ('60000000-0000-0000-0000-000000000023', '40000000-0000-0000-0000-000000000008', '41000000-0000-0000-0000-000000000008', 'c942a690-6bbd-46c2-b165-62843931cf51'), -- 9.3
    ('60000000-0000-0000-0000-000000000023', '40000000-0000-0000-0000-000000000008', '41000000-0000-0000-0000-000000000008', '403b1320-7e53-4abe-b141-6fc44a2fab7d'), -- 10.1
    ('60000000-0000-0000-0000-000000000023', '40000000-0000-0000-0000-000000000008', '41000000-0000-0000-0000-000000000008', '444a23f6-12b1-4790-bccb-0b9abe2a51eb'), -- 10.3
    -- 60...0024: Mecanizado CNC de Alta Precisión (Medular)
    ('60000000-0000-0000-0000-000000000024', '40000000-0000-0000-0000-000000000008', '41000000-0000-0000-0000-000000000008', '2478c2a5-c27a-48f7-aca8-ebcbee0f5424'), -- 8.1
    ('60000000-0000-0000-0000-000000000024', '40000000-0000-0000-0000-000000000008', '41000000-0000-0000-0000-000000000008', 'b480611a-c93b-4458-a918-93d656123673'), -- 8.2
    ('60000000-0000-0000-0000-000000000024', '40000000-0000-0000-0000-000000000008', '41000000-0000-0000-0000-000000000008', 'f0000000-0000-0000-0000-000000000085'), -- 8.5
    ('60000000-0000-0000-0000-000000000024', '40000000-0000-0000-0000-000000000008', '41000000-0000-0000-0000-000000000008', 'df7c6f91-d88e-439f-8582-105fab155e7c'), -- 8.7
    -- 60...0025: Verificación Dimensional y Trazabilidad (Medular)
    ('60000000-0000-0000-0000-000000000025', '40000000-0000-0000-0000-000000000008', '41000000-0000-0000-0000-000000000008', 'f0000000-0000-0000-0000-000000000085'), -- 8.5
    ('60000000-0000-0000-0000-000000000025', '40000000-0000-0000-0000-000000000008', '41000000-0000-0000-0000-000000000008', 'd87c648c-8cba-4522-91ce-4334b2156981'), -- 8.6
    ('60000000-0000-0000-0000-000000000025', '40000000-0000-0000-0000-000000000008', '41000000-0000-0000-0000-000000000008', 'df7c6f91-d88e-439f-8582-105fab155e7c'), -- 8.7
    ('60000000-0000-0000-0000-000000000025', '40000000-0000-0000-0000-000000000008', '41000000-0000-0000-0000-000000000008', '6381bc8b-9b89-4865-a74c-d1f99ef2b956'), -- 9.1
    ('60000000-0000-0000-0000-000000000025', '40000000-0000-0000-0000-000000000008', '41000000-0000-0000-0000-000000000008', '443b196c-0af0-49aa-930e-26b0462fa531'), -- 10.2
    -- 60...0026: Mantenimiento Preventivo y Calibración CNC (De Apoyo)
    ('60000000-0000-0000-0000-000000000026', '40000000-0000-0000-0000-000000000008', '41000000-0000-0000-0000-000000000008', '42efcb2b-b1a4-4195-849a-2035d7abdfee'), -- 7.1
    ('60000000-0000-0000-0000-000000000026', '40000000-0000-0000-0000-000000000008', '41000000-0000-0000-0000-000000000008', 'a26efba3-e5bc-412d-81ca-4e0d60057a3e'), -- 7.2
    ('60000000-0000-0000-0000-000000000026', '40000000-0000-0000-0000-000000000008', '41000000-0000-0000-0000-000000000008', '1f767c2f-7773-411d-8ad2-52d1db087a76'), -- 7.3
    ('60000000-0000-0000-0000-000000000026', '40000000-0000-0000-0000-000000000008', '41000000-0000-0000-0000-000000000008', '227680e8-bc54-4fbe-8165-d288e8088eed'), -- 7.4
    ('60000000-0000-0000-0000-000000000026', '40000000-0000-0000-0000-000000000008', '41000000-0000-0000-0000-000000000008', 'b2739201-ce87-4e47-ac0f-192be80acd84'), -- 7.5
    ('60000000-0000-0000-0000-000000000026', '40000000-0000-0000-0000-000000000008', '41000000-0000-0000-0000-000000000008', '5c72a6fc-5518-41ea-971f-9cac1e0b8629'), -- 8.4
    ('60000000-0000-0000-0000-000000000026', '40000000-0000-0000-0000-000000000008', '41000000-0000-0000-0000-000000000008', '6a840627-c8e1-4f99-a6ab-4c019ff07c52'), -- 9.2

    -- FN-QMS-2025-004 (40...0004 / v1 41...0004 · ISO 9001:2015 · incluye diseño 8.3 en alcance)
    -- 60...0007: Revisión por la Dirección Integrada (Estratégico)
    ('60000000-0000-0000-0000-000000000007', '40000000-0000-0000-0000-000000000004', '41000000-0000-0000-0000-000000000004', 'f0000000-0000-0000-0000-000000000041'), -- 4.1
    ('60000000-0000-0000-0000-000000000007', '40000000-0000-0000-0000-000000000004', '41000000-0000-0000-0000-000000000004', 'f0000000-0000-0000-0000-000000000042'), -- 4.2
    ('60000000-0000-0000-0000-000000000007', '40000000-0000-0000-0000-000000000004', '41000000-0000-0000-0000-000000000004', '35dc2efc-9ded-4596-8374-fc34cc9846e5'), -- 4.3
    ('60000000-0000-0000-0000-000000000007', '40000000-0000-0000-0000-000000000004', '41000000-0000-0000-0000-000000000004', '31dc28b0-2a89-4182-99eb-fc20c8984099'), -- 4.4
    ('60000000-0000-0000-0000-000000000007', '40000000-0000-0000-0000-000000000004', '41000000-0000-0000-0000-000000000004', 'f0000000-0000-0000-0000-000000000051'), -- 5.1
    ('60000000-0000-0000-0000-000000000007', '40000000-0000-0000-0000-000000000004', '41000000-0000-0000-0000-000000000004', 'b5d02c89-71e9-4c9b-a33a-8c1344a43cc0'), -- 5.2
    ('60000000-0000-0000-0000-000000000007', '40000000-0000-0000-0000-000000000004', '41000000-0000-0000-0000-000000000004', 'c1d27e04-2065-4466-9003-ac7c48a20475'), -- 5.3
    ('60000000-0000-0000-0000-000000000007', '40000000-0000-0000-0000-000000000004', '41000000-0000-0000-0000-000000000004', '2ecadad6-974a-4c7c-ac53-3b6a5b9fe3c7'), -- 6.1
    ('60000000-0000-0000-0000-000000000007', '40000000-0000-0000-0000-000000000004', '41000000-0000-0000-0000-000000000004', '2fcd1b00-a8b4-4f46-b445-98e4da9cda1d'), -- 6.2
    ('60000000-0000-0000-0000-000000000007', '40000000-0000-0000-0000-000000000004', '41000000-0000-0000-0000-000000000004', '38ed7cd6-d7fc-4a78-be34-b47e49aed1fb'), -- 6.3
    ('60000000-0000-0000-0000-000000000007', '40000000-0000-0000-0000-000000000004', '41000000-0000-0000-0000-000000000004', 'c942a690-6bbd-46c2-b165-62843931cf51'), -- 9.3
    ('60000000-0000-0000-0000-000000000007', '40000000-0000-0000-0000-000000000004', '41000000-0000-0000-0000-000000000004', '403b1320-7e53-4abe-b141-6fc44a2fab7d'), -- 10.1
    ('60000000-0000-0000-0000-000000000007', '40000000-0000-0000-0000-000000000004', '41000000-0000-0000-0000-000000000004', '444a23f6-12b1-4790-bccb-0b9abe2a51eb'), -- 10.3
    -- 60...0027: Diseño de Ingeniería y Planos Estructurales (Medular · cubre 8.3)
    ('60000000-0000-0000-0000-000000000027', '40000000-0000-0000-0000-000000000004', '41000000-0000-0000-0000-000000000004', 'b2739201-ce87-4e47-ac0f-192be80acd84'), -- 7.5
    ('60000000-0000-0000-0000-000000000027', '40000000-0000-0000-0000-000000000004', '41000000-0000-0000-0000-000000000004', '2478c2a5-c27a-48f7-aca8-ebcbee0f5424'), -- 8.1
    ('60000000-0000-0000-0000-000000000027', '40000000-0000-0000-0000-000000000004', '41000000-0000-0000-0000-000000000004', 'b480611a-c93b-4458-a918-93d656123673'), -- 8.2
    ('60000000-0000-0000-0000-000000000027', '40000000-0000-0000-0000-000000000004', '41000000-0000-0000-0000-000000000004', 'a15db0ef-de9f-45a1-a680-ce2d6916d18a'), -- 8.3
    -- 60...0006: Fabricación de Estructuras (Medular)
    ('60000000-0000-0000-0000-000000000006', '40000000-0000-0000-0000-000000000004', '41000000-0000-0000-0000-000000000004', '2478c2a5-c27a-48f7-aca8-ebcbee0f5424'), -- 8.1
    ('60000000-0000-0000-0000-000000000006', '40000000-0000-0000-0000-000000000004', '41000000-0000-0000-0000-000000000004', 'f0000000-0000-0000-0000-000000000085'), -- 8.5
    ('60000000-0000-0000-0000-000000000006', '40000000-0000-0000-0000-000000000004', '41000000-0000-0000-0000-000000000004', 'df7c6f91-d88e-439f-8582-105fab155e7c'), -- 8.7
    ('60000000-0000-0000-0000-000000000006', '40000000-0000-0000-0000-000000000004', '41000000-0000-0000-0000-000000000004', '443b196c-0af0-49aa-930e-26b0462fa531'), -- 10.2
    -- 60...0028: Granallado, Pintura y Ensayos No Destructivos (Medular)
    ('60000000-0000-0000-0000-000000000028', '40000000-0000-0000-0000-000000000004', '41000000-0000-0000-0000-000000000004', 'f0000000-0000-0000-0000-000000000085'), -- 8.5
    ('60000000-0000-0000-0000-000000000028', '40000000-0000-0000-0000-000000000004', '41000000-0000-0000-0000-000000000004', 'd87c648c-8cba-4522-91ce-4334b2156981'), -- 8.6
    ('60000000-0000-0000-0000-000000000028', '40000000-0000-0000-0000-000000000004', '41000000-0000-0000-0000-000000000004', 'df7c6f91-d88e-439f-8582-105fab155e7c'), -- 8.7
    ('60000000-0000-0000-0000-000000000028', '40000000-0000-0000-0000-000000000004', '41000000-0000-0000-0000-000000000004', '6381bc8b-9b89-4865-a74c-d1f99ef2b956'), -- 9.1
    -- 60...0029: Gestión Comercial y Licitaciones Industriales (Medular)
    ('60000000-0000-0000-0000-000000000029', '40000000-0000-0000-0000-000000000004', '41000000-0000-0000-0000-000000000004', 'b480611a-c93b-4458-a918-93d656123673'), -- 8.2
    ('60000000-0000-0000-0000-000000000029', '40000000-0000-0000-0000-000000000004', '41000000-0000-0000-0000-000000000004', '6381bc8b-9b89-4865-a74c-d1f99ef2b956'), -- 9.1
    -- 60...0030: Compras, Talento Humano y Mantenimiento (De Apoyo)
    ('60000000-0000-0000-0000-000000000030', '40000000-0000-0000-0000-000000000004', '41000000-0000-0000-0000-000000000004', '42efcb2b-b1a4-4195-849a-2035d7abdfee'), -- 7.1
    ('60000000-0000-0000-0000-000000000030', '40000000-0000-0000-0000-000000000004', '41000000-0000-0000-0000-000000000004', 'a26efba3-e5bc-412d-81ca-4e0d60057a3e'), -- 7.2
    ('60000000-0000-0000-0000-000000000030', '40000000-0000-0000-0000-000000000004', '41000000-0000-0000-0000-000000000004', '1f767c2f-7773-411d-8ad2-52d1db087a76'), -- 7.3
    ('60000000-0000-0000-0000-000000000030', '40000000-0000-0000-0000-000000000004', '41000000-0000-0000-0000-000000000004', '227680e8-bc54-4fbe-8165-d288e8088eed'), -- 7.4
    ('60000000-0000-0000-0000-000000000030', '40000000-0000-0000-0000-000000000004', '41000000-0000-0000-0000-000000000004', 'b2739201-ce87-4e47-ac0f-192be80acd84'), -- 7.5
    ('60000000-0000-0000-0000-000000000030', '40000000-0000-0000-0000-000000000004', '41000000-0000-0000-0000-000000000004', '5c72a6fc-5518-41ea-971f-9cac1e0b8629'), -- 8.4
    ('60000000-0000-0000-0000-000000000030', '40000000-0000-0000-0000-000000000004', '41000000-0000-0000-0000-000000000004', '6a840627-c8e1-4f99-a6ab-4c019ff07c52'), -- 9.2
    ('60000000-0000-0000-0000-000000000030', '40000000-0000-0000-0000-000000000004', '41000000-0000-0000-0000-000000000004', '443b196c-0af0-49aa-930e-26b0462fa531'), -- 10.2

    -- FN-EMS-2025-005 (40...0005 / v1 41...0005 · ISO 14001:2015 · sin exclusiones)
    -- 60...0031: Política Ambiental y Cumplimiento Legal SGA (Estratégico)
    ('60000000-0000-0000-0000-000000000031', '40000000-0000-0000-0000-000000000005', '41000000-0000-0000-0000-000000000005', 'c107358e-ea84-4fe6-a2e4-9534bbf764a6'), -- 4.1
    ('60000000-0000-0000-0000-000000000031', '40000000-0000-0000-0000-000000000005', '41000000-0000-0000-0000-000000000005', 'c2073721-ac24-4ee1-adcd-d191bcf76639'), -- 4.2
    ('60000000-0000-0000-0000-000000000031', '40000000-0000-0000-0000-000000000005', '41000000-0000-0000-0000-000000000005', 'c6073d6d-ea32-439d-9df3-ff5dc0f76c85'), -- 4.3
    ('60000000-0000-0000-0000-000000000031', '40000000-0000-0000-0000-000000000005', '41000000-0000-0000-0000-000000000005', 'c20975b8-3e5c-4e10-9998-0a0e3cfa6e50'), -- 4.4
    ('60000000-0000-0000-0000-000000000031', '40000000-0000-0000-0000-000000000005', '41000000-0000-0000-0000-000000000005', 'c8097f2a-9f38-4a8e-b14e-5a5042fa77c2'), -- 5.1
    ('60000000-0000-0000-0000-000000000031', '40000000-0000-0000-0000-000000000005', '41000000-0000-0000-0000-000000000005', 'c80bbdc1-840a-42b5-9ae8-040542fcb659'), -- 5.2
    ('60000000-0000-0000-0000-000000000031', '40000000-0000-0000-0000-000000000005', '41000000-0000-0000-0000-000000000005', '300ea010-4a0f-4634-a389-d33a4aff0188'), -- 5.3
    ('60000000-0000-0000-0000-000000000031', '40000000-0000-0000-0000-000000000005', '41000000-0000-0000-0000-000000000005', '340ea65c-c6ab-48f0-a8b6-606e4eff07d4'), -- 6.1
    ('60000000-0000-0000-0000-000000000031', '40000000-0000-0000-0000-000000000005', '41000000-0000-0000-0000-000000000005', '47ffbb4e-79bd-4e02-a043-1a84c317c356'), -- 6.2
    ('60000000-0000-0000-0000-000000000031', '40000000-0000-0000-0000-000000000005', '41000000-0000-0000-0000-000000000005', 'b197006a-6679-4b62-90cc-936c2c87f902'), -- 9.3
    ('60000000-0000-0000-0000-000000000031', '40000000-0000-0000-0000-000000000005', '41000000-0000-0000-0000-000000000005', '1e919bd3-0c61-4fcb-ba91-568b39aa9fbb'), -- 10.1
    ('60000000-0000-0000-0000-000000000031', '40000000-0000-0000-0000-000000000005', '41000000-0000-0000-0000-000000000005', '922dcb09-e643-4f59-9b20-8fc9ad6dde61'), -- 10.3
    -- 60...0008: Manejo de Residuos Industriales (Medular)
    ('60000000-0000-0000-0000-000000000008', '40000000-0000-0000-0000-000000000005', '41000000-0000-0000-0000-000000000005', '1f9e6959-2151-4f79-8881-1d213a8ecad1'), -- 8.1
    ('60000000-0000-0000-0000-000000000008', '40000000-0000-0000-0000-000000000005', '41000000-0000-0000-0000-000000000005', '229e6e12-8dfb-492a-95dd-7d303d8ecf8a'), -- 8.2
    ('60000000-0000-0000-0000-000000000008', '40000000-0000-0000-0000-000000000005', '41000000-0000-0000-0000-000000000005', '2391a3b2-7bae-448e-94f7-68503eaaa79a'), -- 10.2
    -- 60...0032: Control de Emisiones y Cabinas de Pintura (Medular)
    ('60000000-0000-0000-0000-000000000032', '40000000-0000-0000-0000-000000000005', '41000000-0000-0000-0000-000000000005', '340ea65c-c6ab-48f0-a8b6-606e4eff07d4'), -- 6.1
    ('60000000-0000-0000-0000-000000000032', '40000000-0000-0000-0000-000000000005', '41000000-0000-0000-0000-000000000005', '1f9e6959-2151-4f79-8881-1d213a8ecad1'), -- 8.1
    ('60000000-0000-0000-0000-000000000032', '40000000-0000-0000-0000-000000000005', '41000000-0000-0000-0000-000000000005', 'b49b8251-7363-4245-a26e-7af12f8c7ae9'), -- 9.1
    ('60000000-0000-0000-0000-000000000032', '40000000-0000-0000-0000-000000000005', '41000000-0000-0000-0000-000000000005', '2391a3b2-7bae-448e-94f7-68503eaaa79a'), -- 10.2
    -- 60...0033: Preparación y Respuesta Ambiental (De Apoyo)
    ('60000000-0000-0000-0000-000000000033', '40000000-0000-0000-0000-000000000005', '41000000-0000-0000-0000-000000000005', 'afa607ce-84df-4982-b0bd-cc0caa9636e6'), -- 7.2
    ('60000000-0000-0000-0000-000000000033', '40000000-0000-0000-0000-000000000005', '41000000-0000-0000-0000-000000000005', 'b4a60fad-bf8b-4211-bb4d-cbf5af963ec5'), -- 7.3
    ('60000000-0000-0000-0000-000000000033', '40000000-0000-0000-0000-000000000005', '41000000-0000-0000-0000-000000000005', '29a2f645-006b-4d49-9b67-4ff1c494213d'), -- 7.4
    ('60000000-0000-0000-0000-000000000033', '40000000-0000-0000-0000-000000000005', '41000000-0000-0000-0000-000000000005', '229e6e12-8dfb-492a-95dd-7d303d8ecf8a'), -- 8.2
    ('60000000-0000-0000-0000-000000000033', '40000000-0000-0000-0000-000000000005', '41000000-0000-0000-0000-000000000005', 'b3994227-ca76-4c6f-89a0-94232e8a3abf'), -- 9.2
    -- 60...0034: Gestión Administrativa y Documental Ambiental (De Apoyo)
    ('60000000-0000-0000-0000-000000000034', '40000000-0000-0000-0000-000000000005', '41000000-0000-0000-0000-000000000005', 'aca841ac-3699-4400-9c84-d21237995374'), -- 7.1
    ('60000000-0000-0000-0000-000000000034', '40000000-0000-0000-0000-000000000005', '41000000-0000-0000-0000-000000000005', '29a2f645-006b-4d49-9b67-4ff1c494213d'), -- 7.4
    ('60000000-0000-0000-0000-000000000034', '40000000-0000-0000-0000-000000000005', '41000000-0000-0000-0000-000000000005', '23a0ae3c-2598-41c0-b7e1-46cebe91d934'), -- 7.5
    ('60000000-0000-0000-0000-000000000034', '40000000-0000-0000-0000-000000000005', '41000000-0000-0000-0000-000000000005', 'b49b8251-7363-4245-a26e-7af12f8c7ae9'), -- 9.1

    -- FN-SST-2026-006 (40...0006 / v1 41...0006 · ISO 45001:2018 · sin exclusiones)
    -- 60...0035: Liderazgo SST y Consulta de Trabajadores (Estratégico)
    ('60000000-0000-0000-0000-000000000035', '40000000-0000-0000-0000-000000000006', '41000000-0000-0000-0000-000000000006', '8f19eb3b-ff28-4d0f-b0fe-a2d3b02dc7b3'), -- 4.1
    ('60000000-0000-0000-0000-000000000035', '40000000-0000-0000-0000-000000000006', '41000000-0000-0000-0000-000000000006', '8e19e9a8-76ff-4cc4-b67c-d5b6af2dc620'), -- 4.2
    ('60000000-0000-0000-0000-000000000035', '40000000-0000-0000-0000-000000000006', '41000000-0000-0000-0000-000000000006', '2016fde7-66a9-4787-8b00-9db7b12b8aaf'), -- 4.3
    ('60000000-0000-0000-0000-000000000035', '40000000-0000-0000-0000-000000000006', '41000000-0000-0000-0000-000000000006', '1c16f79b-e36c-4cb3-9e8f-563bad2b8463'), -- 4.4
    ('60000000-0000-0000-0000-000000000035', '40000000-0000-0000-0000-000000000006', '41000000-0000-0000-0000-000000000006', '1a16f475-0621-4129-b9f3-ae85bb2b9a6d'), -- 5.1
    ('60000000-0000-0000-0000-000000000035', '40000000-0000-0000-0000-000000000006', '41000000-0000-0000-0000-000000000006', '18127421-6367-4bf9-8376-e95529263769'), -- 5.2
    ('60000000-0000-0000-0000-000000000035', '40000000-0000-0000-0000-000000000006', '41000000-0000-0000-0000-000000000006', '8f0f5ddf-d38e-47d3-b1f3-f72f404b2c77'), -- 5.3
    ('60000000-0000-0000-0000-000000000035', '40000000-0000-0000-0000-000000000006', '41000000-0000-0000-0000-000000000006', '900f5f72-3201-4022-bd5c-d9d8414b2e0a'), -- 5.4
    ('60000000-0000-0000-0000-000000000035', '40000000-0000-0000-0000-000000000006', '41000000-0000-0000-0000-000000000006', '9e8c5ef6-fcf2-4856-b1dd-0cfccfa0549e'), -- 6.1
    ('60000000-0000-0000-0000-000000000035', '40000000-0000-0000-0000-000000000006', '41000000-0000-0000-0000-000000000006', '2d84f14e-7c2b-4b62-8f17-ce643e98b496'), -- 6.2
    ('60000000-0000-0000-0000-000000000035', '40000000-0000-0000-0000-000000000006', '41000000-0000-0000-0000-000000000006', 'eb390cc2-2926-49a2-9e90-82349b5eb64a'), -- 9.3
    ('60000000-0000-0000-0000-000000000035', '40000000-0000-0000-0000-000000000006', '41000000-0000-0000-0000-000000000006', '7554297d-bda0-4a85-a27e-2b8d1552aa65'), -- 10.1
    ('60000000-0000-0000-0000-000000000035', '40000000-0000-0000-0000-000000000006', '41000000-0000-0000-0000-000000000006', '7ca87b8c-8276-4f88-819c-08e2acceee94'), -- 10.3
    -- 60...0009: Control de Riesgos Mecánicos (Medular)
    ('60000000-0000-0000-0000-000000000009', '40000000-0000-0000-0000-000000000006', '41000000-0000-0000-0000-000000000006', '9e8c5ef6-fcf2-4856-b1dd-0cfccfa0549e'), -- 6.1
    ('60000000-0000-0000-0000-000000000009', '40000000-0000-0000-0000-000000000006', '41000000-0000-0000-0000-000000000006', 'f53fd845-7f2c-4cdd-98ae-7b351566321d'), -- 8.1
    ('60000000-0000-0000-0000-000000000009', '40000000-0000-0000-0000-000000000006', '41000000-0000-0000-0000-000000000006', '745427ea-8160-411a-ab51-2dd01452a8d2'), -- 10.2
    -- 60...0036: Trabajos en Altura, Soldadura e Izaje (Medular)
    ('60000000-0000-0000-0000-000000000036', '40000000-0000-0000-0000-000000000006', '41000000-0000-0000-0000-000000000006', 'f53fd845-7f2c-4cdd-98ae-7b351566321d'), -- 8.1
    ('60000000-0000-0000-0000-000000000036', '40000000-0000-0000-0000-000000000006', '41000000-0000-0000-0000-000000000006', '6142c0e0-56b9-4194-8296-0712916933e8'), -- 8.2
    ('60000000-0000-0000-0000-000000000036', '40000000-0000-0000-0000-000000000006', '41000000-0000-0000-0000-000000000006', '6435f9a6-473d-422e-a418-077c945c6cae'), -- 9.1
    -- 60...0010: Vigilancia Ocupacional y Brigadas (De Apoyo)
    ('60000000-0000-0000-0000-000000000010', '40000000-0000-0000-0000-000000000006', '41000000-0000-0000-0000-000000000006', '1a895093-2943-48c7-8412-4c27cb9e0fbb'), -- 7.1
    ('60000000-0000-0000-0000-000000000010', '40000000-0000-0000-0000-000000000006', '41000000-0000-0000-0000-000000000006', '19894f00-811a-461c-a5f3-9abaca9e0e28'), -- 7.2
    ('60000000-0000-0000-0000-000000000010', '40000000-0000-0000-0000-000000000006', '41000000-0000-0000-0000-000000000006', '20895a05-48be-414d-ae49-01a1d19e192d'), -- 7.3
    ('60000000-0000-0000-0000-000000000010', '40000000-0000-0000-0000-000000000006', '41000000-0000-0000-0000-000000000006', '33782ecd-f75e-4255-ac2f-147dc4b3cb05'), -- 7.4
    ('60000000-0000-0000-0000-000000000010', '40000000-0000-0000-0000-000000000006', '41000000-0000-0000-0000-000000000006', '307a68ab-17e8-4dcb-a338-40ab41b6ce63'), -- 7.5
    ('60000000-0000-0000-0000-000000000010', '40000000-0000-0000-0000-000000000006', '41000000-0000-0000-0000-000000000006', '6142c0e0-56b9-4194-8296-0712916933e8'), -- 8.2
    ('60000000-0000-0000-0000-000000000010', '40000000-0000-0000-0000-000000000006', '41000000-0000-0000-0000-000000000006', '6435f9a6-473d-422e-a418-077c945c6cae'), -- 9.1
    ('60000000-0000-0000-0000-000000000010', '40000000-0000-0000-0000-000000000006', '41000000-0000-0000-0000-000000000006', '6633be35-e037-4319-9a57-d5f5965a313d'), -- 9.2
    ('60000000-0000-0000-0000-000000000010', '40000000-0000-0000-0000-000000000006', '41000000-0000-0000-0000-000000000006', '745427ea-8160-411a-ab51-2dd01452a8d2'), -- 10.2

    -- FN-QMS-2026-009 (40...0009 / v1 41...0009 · ISO 9001:2015 · 8.3 excluida por ISO 4.3)
    -- 60...0037: Planificación Logística y Niveles de Servicio (Estratégico)
    ('60000000-0000-0000-0000-000000000037', '40000000-0000-0000-0000-000000000009', '41000000-0000-0000-0000-000000000009', 'f0000000-0000-0000-0000-000000000041'), -- 4.1
    ('60000000-0000-0000-0000-000000000037', '40000000-0000-0000-0000-000000000009', '41000000-0000-0000-0000-000000000009', 'f0000000-0000-0000-0000-000000000042'), -- 4.2
    ('60000000-0000-0000-0000-000000000037', '40000000-0000-0000-0000-000000000009', '41000000-0000-0000-0000-000000000009', '35dc2efc-9ded-4596-8374-fc34cc9846e5'), -- 4.3
    ('60000000-0000-0000-0000-000000000037', '40000000-0000-0000-0000-000000000009', '41000000-0000-0000-0000-000000000009', '31dc28b0-2a89-4182-99eb-fc20c8984099'), -- 4.4
    ('60000000-0000-0000-0000-000000000037', '40000000-0000-0000-0000-000000000009', '41000000-0000-0000-0000-000000000009', 'f0000000-0000-0000-0000-000000000051'), -- 5.1
    ('60000000-0000-0000-0000-000000000037', '40000000-0000-0000-0000-000000000009', '41000000-0000-0000-0000-000000000009', 'b5d02c89-71e9-4c9b-a33a-8c1344a43cc0'), -- 5.2
    ('60000000-0000-0000-0000-000000000037', '40000000-0000-0000-0000-000000000009', '41000000-0000-0000-0000-000000000009', 'c1d27e04-2065-4466-9003-ac7c48a20475'), -- 5.3
    ('60000000-0000-0000-0000-000000000037', '40000000-0000-0000-0000-000000000009', '41000000-0000-0000-0000-000000000009', '2ecadad6-974a-4c7c-ac53-3b6a5b9fe3c7'), -- 6.1
    ('60000000-0000-0000-0000-000000000037', '40000000-0000-0000-0000-000000000009', '41000000-0000-0000-0000-000000000009', '2fcd1b00-a8b4-4f46-b445-98e4da9cda1d'), -- 6.2
    ('60000000-0000-0000-0000-000000000037', '40000000-0000-0000-0000-000000000009', '41000000-0000-0000-0000-000000000009', '38ed7cd6-d7fc-4a78-be34-b47e49aed1fb'), -- 6.3
    ('60000000-0000-0000-0000-000000000037', '40000000-0000-0000-0000-000000000009', '41000000-0000-0000-0000-000000000009', 'c942a690-6bbd-46c2-b165-62843931cf51'), -- 9.3
    ('60000000-0000-0000-0000-000000000037', '40000000-0000-0000-0000-000000000009', '41000000-0000-0000-0000-000000000009', '403b1320-7e53-4abe-b141-6fc44a2fab7d'), -- 10.1
    ('60000000-0000-0000-0000-000000000037', '40000000-0000-0000-0000-000000000009', '41000000-0000-0000-0000-000000000009', '444a23f6-12b1-4790-bccb-0b9abe2a51eb'), -- 10.3
    -- 60...0038: Recepción, Inspección en Tránsito y Almacenaje (Medular)
    ('60000000-0000-0000-0000-000000000038', '40000000-0000-0000-0000-000000000009', '41000000-0000-0000-0000-000000000009', '2478c2a5-c27a-48f7-aca8-ebcbee0f5424'), -- 8.1
    ('60000000-0000-0000-0000-000000000038', '40000000-0000-0000-0000-000000000009', '41000000-0000-0000-0000-000000000009', 'f0000000-0000-0000-0000-000000000085'), -- 8.5
    ('60000000-0000-0000-0000-000000000038', '40000000-0000-0000-0000-000000000009', '41000000-0000-0000-0000-000000000009', 'd87c648c-8cba-4522-91ce-4334b2156981'), -- 8.6
    ('60000000-0000-0000-0000-000000000038', '40000000-0000-0000-0000-000000000009', '41000000-0000-0000-0000-000000000009', 'df7c6f91-d88e-439f-8582-105fab155e7c'), -- 8.7
    -- 60...0039: Consolidación de Carga y Despacho Industrial (Medular)
    ('60000000-0000-0000-0000-000000000039', '40000000-0000-0000-0000-000000000009', '41000000-0000-0000-0000-000000000009', 'b480611a-c93b-4458-a918-93d656123673'), -- 8.2
    ('60000000-0000-0000-0000-000000000039', '40000000-0000-0000-0000-000000000009', '41000000-0000-0000-0000-000000000009', 'f0000000-0000-0000-0000-000000000085'), -- 8.5
    ('60000000-0000-0000-0000-000000000039', '40000000-0000-0000-0000-000000000009', '41000000-0000-0000-0000-000000000009', '6381bc8b-9b89-4865-a74c-d1f99ef2b956'), -- 9.1
    ('60000000-0000-0000-0000-000000000039', '40000000-0000-0000-0000-000000000009', '41000000-0000-0000-0000-000000000009', '443b196c-0af0-49aa-930e-26b0462fa531'), -- 10.2
    -- 60...0040: Mantenimiento de Flota, Montacargas y Compras (De Apoyo)
    ('60000000-0000-0000-0000-000000000040', '40000000-0000-0000-0000-000000000009', '41000000-0000-0000-0000-000000000009', '42efcb2b-b1a4-4195-849a-2035d7abdfee'), -- 7.1
    ('60000000-0000-0000-0000-000000000040', '40000000-0000-0000-0000-000000000009', '41000000-0000-0000-0000-000000000009', 'a26efba3-e5bc-412d-81ca-4e0d60057a3e'), -- 7.2
    ('60000000-0000-0000-0000-000000000040', '40000000-0000-0000-0000-000000000009', '41000000-0000-0000-0000-000000000009', '1f767c2f-7773-411d-8ad2-52d1db087a76'), -- 7.3
    ('60000000-0000-0000-0000-000000000040', '40000000-0000-0000-0000-000000000009', '41000000-0000-0000-0000-000000000009', '227680e8-bc54-4fbe-8165-d288e8088eed'), -- 7.4
    ('60000000-0000-0000-0000-000000000040', '40000000-0000-0000-0000-000000000009', '41000000-0000-0000-0000-000000000009', 'b2739201-ce87-4e47-ac0f-192be80acd84'), -- 7.5
    ('60000000-0000-0000-0000-000000000040', '40000000-0000-0000-0000-000000000009', '41000000-0000-0000-0000-000000000009', '5c72a6fc-5518-41ea-971f-9cac1e0b8629'), -- 8.4
    ('60000000-0000-0000-0000-000000000040', '40000000-0000-0000-0000-000000000009', '41000000-0000-0000-0000-000000000009', '6a840627-c8e1-4f99-a6ab-4c019ff07c52')  -- 9.2
ON CONFLICT (id_proceso, id_certificado_version, id_requisito) DO NOTHING;

-- 18. Requisitos No Aplicables con Justificación Obligatoria (Paso 2.2: ISO 9001 8.3)
UPDATE public.requisitos_no_aplicables_certificado
SET id_requisito = 'a15db0ef-de9f-45a1-a680-ce2d6916d18a',
    updated_at = NOW()
WHERE id = 'ea000000-0000-0000-0000-000000000001'
  AND id_requisito <> 'a15db0ef-de9f-45a1-a680-ce2d6916d18a'
  AND NOT EXISTS (
      SELECT 1
      FROM public.requisitos_no_aplicables_certificado rna
      WHERE rna.id_certificado = '40000000-0000-0000-0000-000000000001'
        AND rna.id_certificado_version = '41000000-0000-0000-0000-000000000001'
        AND rna.id_requisito = 'a15db0ef-de9f-45a1-a680-ce2d6916d18a'
        AND rna.deleted_at IS NULL
  );

INSERT INTO public.requisitos_no_aplicables_certificado (id, id_certificado, id_certificado_version, id_requisito, justificacion) VALUES
    (
        'ea000000-0000-0000-0000-000000000001',
        '40000000-0000-0000-0000-000000000001', -- FN-QMS-2024-001
        '41000000-0000-0000-0000-000000000001',
        'a15db0ef-de9f-45a1-a680-ce2d6916d18a', -- ISO 9001:2015 8.3
        'La organización no realiza diseño ni desarrollo de nuevos productos; la fabricación y estampado se ejecutan estrictamente bajo planos de ingeniería y especificaciones provistas por los clientes (exclusión justificada según ISO 9001 cláusula 4.3).'
    ),
    (
        'ea000000-0000-0000-0000-000000000002',
        '40000000-0000-0000-0000-000000000008', -- FN-QMS-2026-008
        '41000000-0000-0000-0000-000000000008',
        'a15db0ef-de9f-45a1-a680-ce2d6916d18a', -- ISO 9001:2015 8.3
        'El taller CNC opera exclusivamente bajo planos, tolerancias y modelos CAD suministrados por el cliente; no realiza diseño ni desarrollo de producto (exclusión justificada según ISO 9001 cláusula 4.3).'
    ),
    (
        'ea000000-0000-0000-0000-000000000003',
        '40000000-0000-0000-0000-000000000009', -- FN-QMS-2026-009
        '41000000-0000-0000-0000-000000000009',
        'a15db0ef-de9f-45a1-a680-ce2d6916d18a', -- ISO 9001:2015 8.3
        'El centro logístico ejecuta únicamente operaciones de almacenamiento, inspección en tránsito, consolidación de carga y despacho industrial sin diseño de productos (exclusión justificada según ISO 9001 cláusula 4.3).'
    )
ON CONFLICT (id_certificado_version, id_requisito) WHERE deleted_at IS NULL DO UPDATE SET
    justificacion = EXCLUDED.justificacion,
    updated_at = NOW();

-- 18b. Configuración Inicial de Alertas de Calendario (Step 1.2.2 + Step 1.1: +15d Plan / +45d Cierre)
INSERT INTO public.configuracion_alerta_auditoria (
    id,
    clave,
    dias_aviso_proxima,
    dias_aviso_preprogramada_sin_confirmar,
    alertar_atrasadas,
    alertar_conflicto_auditor,
    alertar_desfase_dias_o_span,
    ciclos_rotacion_auditor_lider,
    dias_limite_plan_accion,
    dias_limite_plan_nc,
    dias_limite_cierre_nc,
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
    15,
    15,
    45,
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
    dias_limite_plan_accion = EXCLUDED.dias_limite_plan_accion,
    dias_limite_plan_nc = EXCLUDED.dias_limite_plan_nc,
    dias_limite_cierre_nc = EXCLUDED.dias_limite_cierre_nc,
    alertas_activas = EXCLUDED.alertas_activas,
    updated_at = NOW();

-- 18b. Vínculos Persistentes y Certificados Vinculados (Paso 3.1: Integrada, Combinada, Multientidad N2, Individual + LIBRE)
-- Certificados en estado LIBRE (sin fila en vinculo_certificado ni en auditoria):
--   40...0007 (FN-ISMS-2026-007, CONG-CYB-01) y 40...0008 (FN-QMS-2026-008, CONG-IND-01)
--   Nota: 40...0002 (FN-EMS-2025-002) queda vinculado junto con 40...0010 (FN-SST-2025-010) en VINC-N1-02 (Combinada)
INSERT INTO public.vinculo (id, id_grupo_empresarial, codigo_vinculo, etiqueta, nivel_vinculacion, tipo_vinculacion, es_vinculada, tiene_sitio_temporal, notas) VALUES
    (
        '7c000000-0000-0000-0000-000000000001',
        '20000000-0000-0000-0000-000000000002', -- CONG-CYB-01
        'VINC-IND-01',
        'CyberCloud Solutions S.L. · FN-ISMS-2025-003',
        'INDIVIDUAL',
        'Individual',
        FALSE,
        FALSE,
        'Vínculo individual 1:1 en conglomerado CyberCloud.'
    ),
    (
        '7c000000-0000-0000-0000-000000000002',
        '20000000-0000-0000-0000-000000000001', -- CONG-IND-01
        'VINC-IND-02',
        'Example, C.A. · FN-SST-2026-006',
        'INDIVIDUAL',
        'Individual',
        FALSE,
        FALSE,
        'Vínculo individual para auditoría SST de Example, C.A.'
    ),
    (
        '7c000000-0000-0000-0000-000000000003',
        '20000000-0000-0000-0000-000000000001', -- CONG-IND-01
        'VINC-N1-01',
        'Planta Santa Cruz · SGC + SGA Integrado',
        'NIVEL_1_INTRA_ORG',
        'Integrada',
        TRUE,
        TRUE,
        'Vínculo intra-organizacional en CONG-IND-01 con evaluación de sitio temporal/proyecto.'
    ),
    (
        '7c000000-0000-0000-0000-000000000004',
        '20000000-0000-0000-0000-000000000001', -- CONG-IND-01
        'VINC-N2-01',
        'Conglomerado Iberometal · Multientidad Nivel 2',
        'NIVEL_2_INTER_ORG',
        'Multientidad',
        TRUE,
        TRUE,
        'Vínculo inter-organizacional dentro de CONG-IND-01 con evaluación de sitio temporal.'
    ),
    (
        '7c000000-0000-0000-0000-000000000005',
        '20000000-0000-0000-0000-000000000001', -- CONG-IND-01
        'VINC-N1-02',
        'Iberometal · SGA + SST Combinada',
        'NIVEL_1_INTRA_ORG',
        'Combinada',
        TRUE,
        FALSE,
        'Vínculo intra-organizacional Combinado en Iberometal Componentes S.A. (ISO 14001 + ISO 45001).'
    ),
    (
        '7c000000-0000-0000-0000-000000000101',
        '20000000-0000-0000-0000-000000000003', -- CONG-ALM-01
        'VINC-ALM-S1',
        'Sitio 1 · 9001 + 14001 + 45001 (Combinada)',
        'NIVEL_1_INTRA_ORG',
        'Combinada',
        TRUE,
        FALSE,
        'Bloque encadenado Sitio 1 para Organización Grande Alimentos S.A.'
    ),
    (
        '7c000000-0000-0000-0000-000000000102',
        '20000000-0000-0000-0000-000000000003', -- CONG-ALM-01
        'VINC-ALM-S2',
        'Sitio 2 · 9001 + 14001 + 45001 (Combinada)',
        'NIVEL_1_INTRA_ORG',
        'Combinada',
        TRUE,
        FALSE,
        'Bloque encadenado Sitio 2 para Organización Grande Alimentos S.A.'
    ),
    (
        '7c000000-0000-0000-0000-000000000103',
        '20000000-0000-0000-0000-000000000003', -- CONG-ALM-01
        'VINC-ALM-S3',
        'Sitio 3 · 9001 + 14001 + 45001 (Combinada)',
        'NIVEL_1_INTRA_ORG',
        'Combinada',
        TRUE,
        FALSE,
        'Bloque encadenado Sitio 3 para Organización Grande Alimentos S.A.'
    ),
    (
        '7c000000-0000-0000-0000-000000000104',
        '20000000-0000-0000-0000-000000000003', -- CONG-ALM-01
        'VINC-ALM-S4-N2',
        '4º Sitio · Grande (9001) + Pequeña (22000) Combinada',
        'NIVEL_2_INTER_ORG',
        'Combinada',
        TRUE,
        FALSE,
        'Vínculo Nivel 2 Combinado en el 4º sitio entre Organización Grande y Organización Pequeña.'
    )
ON CONFLICT (codigo_vinculo) WHERE codigo_vinculo IS NOT NULL AND deleted_at IS NULL DO UPDATE SET
    id_grupo_empresarial = EXCLUDED.id_grupo_empresarial,
    etiqueta = EXCLUDED.etiqueta,
    nivel_vinculacion = EXCLUDED.nivel_vinculacion,
    tipo_vinculacion = EXCLUDED.tipo_vinculacion,
    es_vinculada = EXCLUDED.es_vinculada,
    tiene_sitio_temporal = EXCLUDED.tiene_sitio_temporal,
    notas = EXCLUDED.notas,
    updated_at = NOW();

INSERT INTO public.vinculo_certificado (id, id_vinculo, id_certificado, tipo_vinculacion_override) VALUES
    ('7d000000-0000-0000-0000-000000000001', '7c000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000003', NULL), -- INDIVIDUAL (CyberCloud)
    ('7d000000-0000-0000-0000-000000000002', '7c000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000006', NULL), -- INDIVIDUAL (Example SST)
    ('7d000000-0000-0000-0000-000000000003', '7c000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000004', NULL), -- VINCULADO N1 (Example QMS)
    ('7d000000-0000-0000-0000-000000000004', '7c000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000005', NULL), -- VINCULADO N1 (Example EMS)
    ('7d000000-0000-0000-0000-000000000005', '7c000000-0000-0000-0000-000000000004', '40000000-0000-0000-0000-000000000001', NULL), -- VINCULADO N2 (Iberometal QMS)
    ('7d000000-0000-0000-0000-000000000006', '7c000000-0000-0000-0000-000000000004', '40000000-0000-0000-0000-000000000009', NULL), -- VINCULADO N2 (Example Logística)
    ('7d000000-0000-0000-0000-000000000007', '7c000000-0000-0000-0000-000000000005', '40000000-0000-0000-0000-000000000002', NULL), -- VINCULADO N1 Combinada (Iberometal EMS - hereda Combinada)
    ('7d000000-0000-0000-0000-000000000008', '7c000000-0000-0000-0000-000000000005', '40000000-0000-0000-0000-000000000010', 'Integrada'), -- VINCULADO N1 Combinada con override individual a Integrada (Iberometal SST)
    ('7d000000-0000-0000-0000-000000000101', '7c000000-0000-0000-0000-000000000101', '40000000-0000-0000-0000-000000000101', NULL), -- ALM S1 9001
    ('7d000000-0000-0000-0000-000000000102', '7c000000-0000-0000-0000-000000000101', '40000000-0000-0000-0000-000000000102', NULL), -- ALM S1 14001
    ('7d000000-0000-0000-0000-000000000103', '7c000000-0000-0000-0000-000000000101', '40000000-0000-0000-0000-000000000103', NULL), -- ALM S1 45001
    ('7d000000-0000-0000-0000-000000000104', '7c000000-0000-0000-0000-000000000102', '40000000-0000-0000-0000-000000000104', NULL), -- ALM S2 9001
    ('7d000000-0000-0000-0000-000000000105', '7c000000-0000-0000-0000-000000000102', '40000000-0000-0000-0000-000000000105', NULL), -- ALM S2 14001
    ('7d000000-0000-0000-0000-000000000106', '7c000000-0000-0000-0000-000000000102', '40000000-0000-0000-0000-000000000106', NULL), -- ALM S2 45001
    ('7d000000-0000-0000-0000-000000000107', '7c000000-0000-0000-0000-000000000103', '40000000-0000-0000-0000-000000000107', NULL), -- ALM S3 9001
    ('7d000000-0000-0000-0000-000000000108', '7c000000-0000-0000-0000-000000000103', '40000000-0000-0000-0000-000000000108', NULL), -- ALM S3 14001
    ('7d000000-0000-0000-0000-000000000109', '7c000000-0000-0000-0000-000000000103', '40000000-0000-0000-0000-000000000109', NULL), -- ALM S3 45001
    ('7d000000-0000-0000-0000-000000000110', '7c000000-0000-0000-0000-000000000104', '40000000-0000-0000-0000-000000000110', NULL), -- ALM S4 Grande 9001
    ('7d000000-0000-0000-0000-000000000111', '7c000000-0000-0000-0000-000000000104', '40000000-0000-0000-0000-000000000111', NULL)  -- ALM S4 Pequeña 22000
ON CONFLICT (id_certificado) WHERE deleted_at IS NULL DO UPDATE SET
    id_vinculo = EXCLUDED.id_vinculo,
    tipo_vinculacion_override = EXCLUDED.tipo_vinculacion_override,
    updated_at = NOW();

-- 19. Programas de Auditoría (4 Escenarios Reales: Individual Histórico, Nivel 1 Evolucionado, Nivel 2 Inter-Org y Parcial)
INSERT INTO public.programa_auditoria (id, id_vinculo, id_grupo_empresarial, codigo_programa, etiqueta, nivel_vinculacion, tipo_vinculacion, es_vinculada, tiene_sitio_temporal, id_ciclo_origen, notas) VALUES
    (
        '7a000000-0000-0000-0000-000000000001',
        NULL,
        '20000000-0000-0000-0000-000000000001', -- CONG-IND-01
        'PROG-2024-001',
        'Auditoría Etapa 2 Iberometal SGC',
        'INDIVIDUAL',
        'Individual',
        FALSE,
        FALSE,
        NULL,
        'Escenario A: Auditoría individual histórica completada el año anterior.'
    ),
    (
        '7a000000-0000-0000-0000-000000000002',
        '7c000000-0000-0000-0000-000000000003', -- VINC-N1-01
        '20000000-0000-0000-0000-000000000001', -- CONG-IND-01
        'PROG-2025-001',
        'Planta Santa Cruz (Ciclo Combinado Año 1)',
        'NIVEL_1_INTRA_ORG',
        'Combinada',
        TRUE,
        TRUE,
        NULL,
        'Ciclo base Año 1 ejecutado como auditoría combinada SGC + SGA.'
    ),
    (
        '7a000000-0000-0000-0000-000000000004',
        '7c000000-0000-0000-0000-000000000004', -- VINC-N2-01
        '20000000-0000-0000-0000-000000000001', -- CONG-IND-01
        'PROG-2026-002',
        'Campaña Multientidad Grupo Industrial Iberometal',
        'NIVEL_2_INTER_ORG',
        'Multientidad',
        TRUE,
        TRUE,
        NULL,
        'Escenario C: Campaña inter-organizacional en CONG-IND-01 con preprogramación mensual.'
    ),
    (
        '7a000000-0000-0000-0000-000000000005',
        '7c000000-0000-0000-0000-000000000002', -- VINC-IND-02
        '20000000-0000-0000-0000-000000000001', -- CONG-IND-01
        'PROG-2026-003',
        'Auditoría SST Individual Example',
        'INDIVIDUAL',
        'Individual',
        FALSE,
        FALSE,
        NULL,
        'Escenario D: Auditoría en programación con desfase parcial de días y proceso pendiente.'
    ),
    (
        '7a000000-0000-0000-0000-000000000008',
        NULL,
        '20000000-0000-0000-0000-000000000001', -- CONG-IND-01
        'PROG-2023-001',
        'Etapa 1 Histórica Iberometal SGC (Cerrada)',
        'INDIVIDUAL',
        'Individual',
        FALSE,
        FALSE,
        NULL,
        'Histórico cerrado con fecha REAL y hallazgos cerrados listo para Revisión (Paso 11).'
    ),
    (
        '7a000000-0000-0000-0000-000000000009',
        '7c000000-0000-0000-0000-000000000001', -- VINC-IND-01
        '20000000-0000-0000-0000-000000000002', -- CONG-CYB-01
        'PROG-2022-001',
        'Etapa 2 Histórica CyberCloud SGSI (Revisada QA)',
        'INDIVIDUAL',
        'Individual',
        FALSE,
        FALSE,
        NULL,
        'Histórico cerrado con revisión QA aprobada en Paso 11.'
    ),
    (
        '7a000000-0000-0000-0000-000000000010',
        NULL,
        '20000000-0000-0000-0000-000000000001', -- CONG-IND-01
        'PROG-2022-002',
        'Etapa 2 Histórica Iberometal SGC (1.er Ciclo)',
        'INDIVIDUAL',
        'Individual',
        FALSE,
        FALSE,
        NULL,
        'Histórico 1.er ciclo SGC Iberometal cerrado y aprobado por QA.'
    ),
    (
        '7a000000-0000-0000-0000-000000000012',
        NULL,
        '20000000-0000-0000-0000-000000000001', -- CONG-IND-01
        'PROG-2022-003',
        'Etapa 2 Histórica Iberometal SGA (1.er Ciclo)',
        'INDIVIDUAL',
        'Individual',
        FALSE,
        FALSE,
        NULL,
        'Histórico 1.er ciclo SGA Iberometal cerrado y aprobado por QA.'
    ),
    (
        '7a000000-0000-0000-0000-000000000013',
        '7c000000-0000-0000-0000-000000000005', -- VINC-N1-02
        '20000000-0000-0000-0000-000000000001', -- CONG-IND-01
        'PROG-2025-002',
        'Complejo Iberometal SGA + SST (Ciclo Base)',
        'NIVEL_1_INTRA_ORG',
        'Combinada',
        TRUE,
        FALSE,
        NULL,
        'Campaña combinada Nivel 1 Iberometal (Renovación SGA + Etapa 2 SST).'
    )
ON CONFLICT (codigo_programa) WHERE codigo_programa IS NOT NULL AND deleted_at IS NULL DO UPDATE SET
    id_vinculo = EXCLUDED.id_vinculo,
    id_grupo_empresarial = EXCLUDED.id_grupo_empresarial,
    etiqueta = EXCLUDED.etiqueta,
    nivel_vinculacion = EXCLUDED.nivel_vinculacion,
    tipo_vinculacion = EXCLUDED.tipo_vinculacion,
    es_vinculada = EXCLUDED.es_vinculada,
    tiene_sitio_temporal = EXCLUDED.tiene_sitio_temporal,
    id_ciclo_origen = EXCLUDED.id_ciclo_origen,
    notas = EXCLUDED.notas,
    updated_at = NOW();

-- Programa Año 2 evolucionado (referencia id_ciclo_origen -> PROG-2025-001) y ciclos futuros Año +1 / Año +2
INSERT INTO public.programa_auditoria (id, id_vinculo, id_grupo_empresarial, codigo_programa, etiqueta, nivel_vinculacion, tipo_vinculacion, es_vinculada, tiene_sitio_temporal, id_ciclo_origen, notas) VALUES
    (
        '7a000000-0000-0000-0000-000000000003',
        '7c000000-0000-0000-0000-000000000003', -- VINC-N1-01
        '20000000-0000-0000-0000-000000000001', -- CONG-IND-01
        'PROG-2026-001',
        'Planta Santa Cruz',
        'NIVEL_1_INTRA_ORG',
        'Integrada',
        TRUE,
        TRUE,
        '7a000000-0000-0000-0000-000000000002',
        'Escenario B: Evolución de Combinada a Integrada (6.00 días-auditor ejecutados por 2 auditores en 3 días calendario).'
    ),
    (
        '7a000000-0000-0000-0000-000000000006',
        '7c000000-0000-0000-0000-000000000003', -- VINC-N1-01
        '20000000-0000-0000-0000-000000000001', -- CONG-IND-01
        'PROG-2027-001',
        'Planta Santa Cruz — Ciclo Año +1',
        'NIVEL_1_INTRA_ORG',
        'Integrada',
        TRUE,
        FALSE,
        '7a000000-0000-0000-0000-000000000003',
        'Ciclo futuro Año +1 (Seguimiento 2) preprogramado por mes bajo Vínculo VINC-N1-01.'
    ),
    (
        '7a000000-0000-0000-0000-000000000007',
        '7c000000-0000-0000-0000-000000000003', -- VINC-N1-01
        '20000000-0000-0000-0000-000000000001', -- CONG-IND-01
        'PROG-2028-001',
        'Planta Santa Cruz — Ciclo Año +2',
        'NIVEL_1_INTRA_ORG',
        'Integrada',
        TRUE,
        FALSE,
        '7a000000-0000-0000-0000-000000000006',
        'Ciclo futuro Año +2 (Renovación) preprogramado por mes bajo Vínculo VINC-N1-01.'
    ),
    (
        '7a000000-0000-0000-0000-000000000104',
        '7c000000-0000-0000-0000-000000000104', -- VINC-ALM-S4-N2
        '20000000-0000-0000-0000-000000000003', -- CONG-ALM-01
        'PROG-ALM-2026-S4',
        '4º Sitio Planta Envasado Sur (Combinada)',
        'NIVEL_2_INTER_ORG',
        'Combinada',
        TRUE,
        FALSE,
        NULL,
        'Campaña Nivel 2 Combinada en 4º sitio con fechas reales discretas y NCs por cláusula.'
    ),
    -- Encadenamientos Paso 3.2 (Histórico SGC 2023, Cartera Activa y Ciclos Futuros +1/+2)
    (
        '7a000000-0000-0000-0000-000000000011',
        NULL,
        '20000000-0000-0000-0000-000000000001', -- CONG-IND-01
        'PROG-2023-002',
        'Seguimiento 1 Histórico Iberometal SGC',
        'INDIVIDUAL',
        'Individual',
        FALSE,
        FALSE,
        '7a000000-0000-0000-0000-000000000010',
        'Histórico Seguimiento 1 SGC Iberometal cerrado y aprobado por QA.'
    ),
    (
        '7a000000-0000-0000-0000-000000000014',
        '7c000000-0000-0000-0000-000000000005', -- VINC-N1-02
        '20000000-0000-0000-0000-000000000001', -- CONG-IND-01
        'PROG-2026-004',
        'Complejo Iberometal SGA + SST (Seguimiento 1)',
        'NIVEL_1_INTRA_ORG',
        'Combinada',
        TRUE,
        FALSE,
        '7a000000-0000-0000-0000-000000000013',
        'Programa en estado Borrador preprogramado a +4 meses bajo VINC-N1-02.'
    ),
    (
        '7a000000-0000-0000-0000-000000000015',
        '7c000000-0000-0000-0000-000000000002', -- VINC-IND-02
        '20000000-0000-0000-0000-000000000001', -- CONG-IND-01
        'PROG-2026-005',
        'Auditoría SST Individual Example (Programada)',
        'INDIVIDUAL',
        'Individual',
        FALSE,
        FALSE,
        '7a000000-0000-0000-0000-000000000005',
        'Auditoría programada con fechas exactas a 35 días bajo VINC-IND-02.'
    ),
    (
        '7a000000-0000-0000-0000-000000000016',
        '7c000000-0000-0000-0000-000000000004', -- VINC-N2-01
        '20000000-0000-0000-0000-000000000001', -- CONG-IND-01
        'PROG-2026-006',
        'Campaña de Campo En Ejecución Iberometal QMS',
        'NIVEL_2_INTER_ORG',
        'Multientidad',
        TRUE,
        FALSE,
        '7a000000-0000-0000-0000-000000000004',
        'Seguimiento 1 en ejecución activa hoy sobre Iberometal SGC bajo VINC-N2-01.'
    ),
    (
        '7a000000-0000-0000-0000-000000000017',
        '7c000000-0000-0000-0000-000000000005', -- VINC-N1-02
        '20000000-0000-0000-0000-000000000001', -- CONG-IND-01
        'PROG-2027-002',
        'Complejo Iberometal SGA + SST — Ciclo Año +1',
        'NIVEL_1_INTRA_ORG',
        'Combinada',
        TRUE,
        FALSE,
        '7a000000-0000-0000-0000-000000000014',
        'Ciclo futuro Año +1 (Seguimiento 2) preprogramado por mes bajo VINC-N1-02.'
    ),
    (
        '7a000000-0000-0000-0000-000000000018',
        '7c000000-0000-0000-0000-000000000005', -- VINC-N1-02
        '20000000-0000-0000-0000-000000000001', -- CONG-IND-01
        'PROG-2028-002',
        'Complejo Iberometal SGA + SST — Ciclo Año +2',
        'NIVEL_1_INTRA_ORG',
        'Combinada',
        TRUE,
        FALSE,
        '7a000000-0000-0000-0000-000000000017',
        'Ciclo futuro Año +2 (Renovación) preprogramado por mes bajo VINC-N1-02.'
    ),
    (
        '7a000000-0000-0000-0000-000000000019',
        '7c000000-0000-0000-0000-000000000004', -- VINC-N2-01
        '20000000-0000-0000-0000-000000000001', -- CONG-IND-01
        'PROG-2027-003',
        'Campaña Multientidad Iberometal + Logística — Ciclo Año +1',
        'NIVEL_2_INTER_ORG',
        'Multientidad',
        TRUE,
        FALSE,
        '7a000000-0000-0000-0000-000000000004',
        'Ciclo futuro Año +1 (Seguimiento 1) preprogramado por mes bajo VINC-N2-01.'
    ),
    (
        '7a000000-0000-0000-0000-000000000020',
        '7c000000-0000-0000-0000-000000000004', -- VINC-N2-01
        '20000000-0000-0000-0000-000000000001', -- CONG-IND-01
        'PROG-2028-003',
        'Campaña Multientidad Iberometal + Logística — Ciclo Año +2',
        'NIVEL_2_INTER_ORG',
        'Multientidad',
        TRUE,
        FALSE,
        '7a000000-0000-0000-0000-000000000019',
        'Ciclo futuro Año +2 (Seguimiento 2) preprogramado por mes bajo VINC-N2-01.'
    ),
    (
        '7a000000-0000-0000-0000-000000000021',
        '7c000000-0000-0000-0000-000000000002', -- VINC-IND-02
        '20000000-0000-0000-0000-000000000001', -- CONG-IND-01
        'PROG-2027-004',
        'Auditoría SST Individual Example — Ciclo Año +1',
        'INDIVIDUAL',
        'Individual',
        FALSE,
        FALSE,
        '7a000000-0000-0000-0000-000000000005',
        'Ciclo futuro Año +1 (Etapa 2) preprogramado por mes bajo VINC-IND-02.'
    ),
    (
        '7a000000-0000-0000-0000-000000000022',
        '7c000000-0000-0000-0000-000000000002', -- VINC-IND-02
        '20000000-0000-0000-0000-000000000001', -- CONG-IND-01
        'PROG-2028-004',
        'Auditoría SST Individual Example — Ciclo Año +2',
        'INDIVIDUAL',
        'Individual',
        FALSE,
        FALSE,
        '7a000000-0000-0000-0000-000000000021',
        'Ciclo futuro Año +2 (Seguimiento 2) preprogramado por mes bajo VINC-IND-02.'
    )
ON CONFLICT (codigo_programa) WHERE codigo_programa IS NOT NULL AND deleted_at IS NULL DO UPDATE SET
    id_vinculo = EXCLUDED.id_vinculo,
    id_grupo_empresarial = EXCLUDED.id_grupo_empresarial,
    etiqueta = EXCLUDED.etiqueta,
    nivel_vinculacion = EXCLUDED.nivel_vinculacion,
    tipo_vinculacion = EXCLUDED.tipo_vinculacion,
    es_vinculada = EXCLUDED.es_vinculada,
    tiene_sitio_temporal = EXCLUDED.tiene_sitio_temporal,
    id_ciclo_origen = EXCLUDED.id_ciclo_origen,
    notas = EXCLUDED.notas,
    updated_at = NOW();

-- 19b. Auditorías por Certificado dentro de cada Programa (sin columnas planas de fecha; incluye tipo_vinculacion por auditoría)
INSERT INTO public.auditoria (id, id_programa_auditoria, codigo_auditoria, id_certificado, id_tipo_auditoria, id_metodologia, tipo_vinculacion, tiempo_auditoria, estado_ciclo, tiene_sitio_temporal, objetivo) VALUES
    (
        '80000000-0000-0000-0000-000000000001',
        '7a000000-0000-0000-0000-000000000001',
        'AUD-2024-001',
        '40000000-0000-0000-0000-000000000001', -- FN-QMS-2024-001 (Iberometal)
        'b0000000-0000-0000-0000-000000000002', -- Etapa 2
        'c0000000-0000-0000-0000-000000000001', -- Presencial
        'Individual',
        4.00,
        'Auditada',
        FALSE,
        'Evaluación inicial Etapa 2 en Sede Principal HQ y Planta Valencia.'
    ),
    (
        '80000000-0000-0000-0000-000000000002',
        '7a000000-0000-0000-0000-000000000002',
        'AUD-2025-001',
        '40000000-0000-0000-0000-000000000004', -- FN-QMS-2025-004 (Example, C.A.)
        'b0000000-0000-0000-0000-000000000002', -- Etapa 2
        'c0000000-0000-0000-0000-000000000001', -- Presencial
        'Combinada',
        3.00,
        'Auditada',
        TRUE,
        'Auditoría combinada Año 1 para sistema de gestión de calidad.'
    ),
    (
        '80000000-0000-0000-0000-000000000003',
        '7a000000-0000-0000-0000-000000000002',
        'AUD-2025-002',
        '40000000-0000-0000-0000-000000000005', -- FN-EMS-2025-005 (Example, C.A.)
        'b0000000-0000-0000-0000-000000000002', -- Etapa 2
        'c0000000-0000-0000-0000-000000000001', -- Presencial
        'Combinada',
        3.00,
        'Auditada',
        TRUE,
        'Auditoría combinada Año 1 para sistema de gestión ambiental.'
    ),
    (
        '80000000-0000-0000-0000-000000000004',
        '7a000000-0000-0000-0000-000000000003',
        'AUD-2026-001',
        '40000000-0000-0000-0000-000000000004', -- FN-QMS-2025-004 (Example, C.A.)
        'b0000000-0000-0000-0000-000000000003', -- Seguimiento 1
        'c0000000-0000-0000-0000-000000000001', -- Presencial
        'Integrada',
        3.00,
        'Reprogramada',
        TRUE,
        'Seguimiento integrado Año 2 SGC en Planta Santa Cruz.'
    ),
    (
        '80000000-0000-0000-0000-000000000005',
        '7a000000-0000-0000-0000-000000000003',
        'AUD-2026-002',
        '40000000-0000-0000-0000-000000000005', -- FN-EMS-2025-005 (Example, C.A.)
        'b0000000-0000-0000-0000-000000000003', -- Seguimiento 1
        'c0000000-0000-0000-0000-000000000001', -- Presencial
        'Integrada',
        3.00,
        'Reprogramada',
        TRUE,
        'Seguimiento integrado Año 2 SGA en Planta Santa Cruz.'
    ),
    (
        '80000000-0000-0000-0000-000000000006',
        '7a000000-0000-0000-0000-000000000004',
        'AUD-2026-003',
        '40000000-0000-0000-0000-000000000001', -- FN-QMS-2024-001 (Iberometal - Org A)
        'b0000000-0000-0000-0000-000000000005', -- Renovación
        'c0000000-0000-0000-0000-000000000003', -- Mixta
        'Multientidad',
        4.00,
        'En Programación',
        TRUE,
        'Renovación coordinada en campaña multientidad (Org A).'
    ),
    (
        '80000000-0000-0000-0000-000000000007',
        '7a000000-0000-0000-0000-000000000004',
        'AUD-2026-004',
        '40000000-0000-0000-0000-000000000009', -- FN-QMS-2026-009 (Example, C.A. - Org hermana en CONG-IND-01)
        'b0000000-0000-0000-0000-000000000005', -- Renovación
        'c0000000-0000-0000-0000-000000000002', -- Remota
        'Multientidad',
        2.00,
        'En Programación',
        TRUE,
        'Renovación coordinada en campaña multientidad CONG-IND-01 (Org hermana).'
    ),
    (
        '80000000-0000-0000-0000-000000000008',
        '7a000000-0000-0000-0000-000000000005',
        'AUD-2026-005',
        '40000000-0000-0000-0000-000000000006', -- FN-SST-2026-006 (Example, C.A.)
        'b0000000-0000-0000-0000-000000000001', -- Etapa 1
        'c0000000-0000-0000-0000-000000000001', -- Presencial
        'Individual',
        2.50,
        'En Programación',
        FALSE,
        'Diagnóstico inicial SST con asignación parcial pendiente de completar.'
    ),
    -- Ciclos futuros multi-anuales (Año +1 Seguimiento 2 y Año +2 Renovación en VINC-N1-01)
    (
        '80000000-0000-0000-0000-000000000009',
        '7a000000-0000-0000-0000-000000000006',
        'AUD-2027-001',
        '40000000-0000-0000-0000-000000000004', -- FN-QMS-2025-004 (Example, C.A.)
        'b0000000-0000-0000-0000-000000000004', -- Seguimiento 2
        'c0000000-0000-0000-0000-000000000001', -- Presencial
        'Integrada',
        3.25,
        'Programada',
        FALSE,
        'Seguimiento 2 integrado Año +1 SGC en Planta Santa Cruz (preprogramado por mes).'
    ),
    (
        '80000000-0000-0000-0000-000000000010',
        '7a000000-0000-0000-0000-000000000006',
        'AUD-2027-002',
        '40000000-0000-0000-0000-000000000005', -- FN-EMS-2025-005 (Example, C.A.)
        'b0000000-0000-0000-0000-000000000004', -- Seguimiento 2
        'c0000000-0000-0000-0000-000000000001', -- Presencial
        'Integrada',
        3.25,
        'Programada',
        FALSE,
        'Seguimiento 2 integrado Año +1 SGA en Planta Santa Cruz (preprogramado por mes).'
    ),
    (
        '80000000-0000-0000-0000-000000000011',
        '7a000000-0000-0000-0000-000000000007',
        'AUD-2028-001',
        '40000000-0000-0000-0000-000000000004', -- FN-QMS-2025-004 (Example, C.A.)
        'b0000000-0000-0000-0000-000000000005', -- Renovación
        'c0000000-0000-0000-0000-000000000001', -- Presencial
        'Integrada',
        4.00,
        'Programada',
        FALSE,
        'Renovación integrada Año +2 SGC en Planta Santa Cruz (preprogramada por mes).'
    ),
    (
        '80000000-0000-0000-0000-000000000012',
        '7a000000-0000-0000-0000-000000000007',
        'AUD-2028-002',
        '40000000-0000-0000-0000-000000000005', -- FN-EMS-2025-005 (Example, C.A.)
        'b0000000-0000-0000-0000-000000000005', -- Renovación
        'c0000000-0000-0000-0000-000000000001', -- Presencial
        'Integrada',
        4.00,
        'Programada',
        FALSE,
        'Renovación integrada Año +2 SGA en Planta Santa Cruz (preprogramada por mes).'
    ),
    (
        '80000000-0000-0000-0000-000000000013',
        '7a000000-0000-0000-0000-000000000008',
        'AUD-2023-001',
        '40000000-0000-0000-0000-000000000001', -- FN-QMS-2024-001 (Iberometal)
        'b0000000-0000-0000-0000-000000000001', -- Etapa 1
        'c0000000-0000-0000-0000-000000000001', -- Presencial
        'Individual',
        2.00,
        'Auditada',
        FALSE,
        'Evaluación documental histórica Etapa 1 cerrada con fecha REAL y hallazgos resueltos.'
    ),
    (
        '80000000-0000-0000-0000-000000000014',
        '7a000000-0000-0000-0000-000000000009',
        'AUD-2022-001',
        '40000000-0000-0000-0000-000000000003', -- FN-ISMS-2025-003 (CyberCloud)
        'b0000000-0000-0000-0000-000000000002', -- Etapa 2
        'c0000000-0000-0000-0000-000000000002', -- Remota
        'Individual',
        2.00,
        'Auditada',
        FALSE,
        'Evaluación histórica Etapa 2 cerrada con expediente QA revisado y aprobado.'
    ),
    (
        '80000000-0000-0000-0000-000000000110',
        '7a000000-0000-0000-0000-000000000104',
        'AUD-ALM-2026-010',
        '40000000-0000-0000-0000-000000000110', -- FN-ALM-S4-9001 (Organización Grande 4º Sitio)
        'b0000000-0000-0000-0000-000000000003', -- Seguimiento 1
        'c0000000-0000-0000-0000-000000000001', -- Presencial
        'Combinada',
        3.00,
        'Auditada',
        FALSE,
        'Ejecución Combinada en 4º sitio con fechas reales discretas (2026-11-18..20) y NCs por cláusula.'
    ),
    (
        '80000000-0000-0000-0000-000000000111',
        '7a000000-0000-0000-0000-000000000104',
        'AUD-ALM-2026-011',
        '40000000-0000-0000-0000-000000000111', -- FN-EMP-S4-22000 (Organización Pequeña 4º Sitio)
        'b0000000-0000-0000-0000-000000000002', -- Etapa 2
        'c0000000-0000-0000-0000-000000000001', -- Presencial
        'Combinada',
        2.00,
        'Programada',
        FALSE,
        'Auditoría hermana ISO 22000 en 4º sitio vinculada en campaña Combinada Nivel 2.'
    ),
    -- Paso 3.2: Pasado Histórico Cerrado + QA Aprobada
    (
        '80000000-0000-0000-0000-000000000015',
        '7a000000-0000-0000-0000-000000000010',
        'AUD-2022-002',
        '40000000-0000-0000-0000-000000000001', -- FN-QMS-2024-001 (Iberometal)
        'b0000000-0000-0000-0000-000000000002', -- Etapa 2
        'c0000000-0000-0000-0000-000000000001', -- Presencial
        'Individual',
        6.25,
        'Auditada',
        FALSE,
        'Evaluación Etapa 2 del 1.er ciclo SGC Iberometal (4 sitios).'
    ),
    (
        '80000000-0000-0000-0000-000000000016',
        '7a000000-0000-0000-0000-000000000011',
        'AUD-2023-002',
        '40000000-0000-0000-0000-000000000001', -- FN-QMS-2024-001 (Iberometal)
        'b0000000-0000-0000-0000-000000000003', -- Seguimiento 1
        'c0000000-0000-0000-0000-000000000001', -- Presencial
        'Individual',
        4.50,
        'Auditada',
        FALSE,
        'Seguimiento 1 histórico SGC Iberometal (4 sitios).'
    ),
    (
        '80000000-0000-0000-0000-000000000017',
        '7a000000-0000-0000-0000-000000000012',
        'AUD-2022-003',
        '40000000-0000-0000-0000-000000000002', -- FN-EMS-2025-002 (Iberometal)
        'b0000000-0000-0000-0000-000000000002', -- Etapa 2
        'c0000000-0000-0000-0000-000000000001', -- Presencial
        'Individual',
        5.00,
        'Auditada',
        FALSE,
        'Evaluación Etapa 2 histórica del 1.er ciclo SGA Iberometal (3 sitios).'
    ),
    -- Paso 3.2: Recientes Completadas (Cola QA + Ventana NC)
    (
        '80000000-0000-0000-0000-000000000018',
        '7a000000-0000-0000-0000-000000000013',
        'AUD-2025-003',
        '40000000-0000-0000-0000-000000000002', -- FN-EMS-2025-002 (Iberometal)
        'b0000000-0000-0000-0000-000000000005', -- Renovación
        'c0000000-0000-0000-0000-000000000001', -- Presencial
        'Combinada',
        4.75,
        'Auditada',
        FALSE,
        'Renovación SGA Iberometal cerrada en campo pendiente de dictamen QA.'
    ),
    (
        '80000000-0000-0000-0000-000000000019',
        '7a000000-0000-0000-0000-000000000013',
        'AUD-2025-004',
        '40000000-0000-0000-0000-000000000010', -- FN-SST-2025-010 (Iberometal)
        'b0000000-0000-0000-0000-000000000002', -- Etapa 2
        'c0000000-0000-0000-0000-000000000001', -- Presencial
        'Integrada',
        5.00,
        'Auditada',
        FALSE,
        'Etapa 2 SST Iberometal ejecutada con seguimiento de cierre NC dentro de ventana vigente.'
    ),
    -- Paso 3.2: Ciclo Actual En Curso (Borrador, Programada, En Ejecución)
    (
        '80000000-0000-0000-0000-000000000020',
        '7a000000-0000-0000-0000-000000000014',
        'AUD-2026-006',
        '40000000-0000-0000-0000-000000000002', -- FN-EMS-2025-002 (Iberometal)
        'b0000000-0000-0000-0000-000000000003', -- Seguimiento 1
        'c0000000-0000-0000-0000-000000000001', -- Presencial
        'Combinada',
        3.50,
        'Borrador',
        FALSE,
        'Seguimiento 1 SGA Iberometal en borrador preliminar (+4 meses).'
    ),
    (
        '80000000-0000-0000-0000-000000000021',
        '7a000000-0000-0000-0000-000000000014',
        'AUD-2026-007',
        '40000000-0000-0000-0000-000000000010', -- FN-SST-2025-010 (Iberometal)
        'b0000000-0000-0000-0000-000000000003', -- Seguimiento 1
        'c0000000-0000-0000-0000-000000000001', -- Presencial
        'Integrada',
        3.75,
        'Borrador',
        FALSE,
        'Seguimiento 1 SST Iberometal en borrador preliminar (+4 meses).'
    ),
    (
        '80000000-0000-0000-0000-000000000022',
        '7a000000-0000-0000-0000-000000000015',
        'AUD-2026-008',
        '40000000-0000-0000-0000-000000000006', -- FN-SST-2026-006 (Example, C.A.)
        'b0000000-0000-0000-0000-000000000003', -- Seguimiento 1
        'c0000000-0000-0000-0000-000000000001', -- Presencial
        'Individual',
        1.75,
        'Programada',
        FALSE,
        'Seguimiento 1 SST Example con fechas exactas confirmadas a +35 días.'
    ),
    (
        '80000000-0000-0000-0000-000000000023',
        '7a000000-0000-0000-0000-000000000016',
        'AUD-2026-009',
        '40000000-0000-0000-0000-000000000001', -- FN-QMS-2024-001 (Iberometal)
        'b0000000-0000-0000-0000-000000000003', -- Seguimiento 1
        'c0000000-0000-0000-0000-000000000001', -- Presencial
        'Multientidad',
        4.50,
        'En Ejecución',
        FALSE,
        'Seguimiento 1 SGC Iberometal en ejecución activa de campo.'
    ),
    -- Paso 3.2: Ciclos Futuros Preventivos (Año +1 y Año +2)
    (
        '80000000-0000-0000-0000-000000000024',
        '7a000000-0000-0000-0000-000000000017',
        'AUD-2027-003',
        '40000000-0000-0000-0000-000000000002', -- FN-EMS-2025-002 (Iberometal)
        'b0000000-0000-0000-0000-000000000004', -- Seguimiento 2
        'c0000000-0000-0000-0000-000000000001', -- Presencial
        'Combinada',
        3.50,
        'Programada',
        FALSE,
        'Seguimiento 2 combinado Año +1 SGA Iberometal (preprogramado por mes).'
    ),
    (
        '80000000-0000-0000-0000-000000000025',
        '7a000000-0000-0000-0000-000000000017',
        'AUD-2027-004',
        '40000000-0000-0000-0000-000000000010', -- FN-SST-2025-010 (Iberometal)
        'b0000000-0000-0000-0000-000000000004', -- Seguimiento 2
        'c0000000-0000-0000-0000-000000000001', -- Presencial
        'Integrada',
        3.75,
        'Programada',
        FALSE,
        'Seguimiento 2 combinado Año +1 SST Iberometal (preprogramado por mes).'
    ),
    (
        '80000000-0000-0000-0000-000000000026',
        '7a000000-0000-0000-0000-000000000018',
        'AUD-2028-003',
        '40000000-0000-0000-0000-000000000002', -- FN-EMS-2025-002 (Iberometal)
        'b0000000-0000-0000-0000-000000000005', -- Renovación
        'c0000000-0000-0000-0000-000000000001', -- Presencial
        'Combinada',
        4.75,
        'Borrador',
        FALSE,
        'Renovación combinada Año +2 SGA Iberometal (preprogramada por mes).'
    ),
    (
        '80000000-0000-0000-0000-000000000027',
        '7a000000-0000-0000-0000-000000000018',
        'AUD-2028-004',
        '40000000-0000-0000-0000-000000000010', -- FN-SST-2025-010 (Iberometal)
        'b0000000-0000-0000-0000-000000000005', -- Renovación
        'c0000000-0000-0000-0000-000000000001', -- Presencial
        'Integrada',
        4.75,
        'Borrador',
        FALSE,
        'Renovación combinada Año +2 SST Iberometal (preprogramada por mes).'
    ),
    (
        '80000000-0000-0000-0000-000000000028',
        '7a000000-0000-0000-0000-000000000019',
        'AUD-2027-005',
        '40000000-0000-0000-0000-000000000001', -- FN-QMS-2024-001 (Iberometal)
        'b0000000-0000-0000-0000-000000000003', -- Seguimiento 1
        'c0000000-0000-0000-0000-000000000003', -- Mixta
        'Multientidad',
        4.50,
        'Programada',
        FALSE,
        'Seguimiento 1 multientidad Año +1 Iberometal SGC (preprogramado por mes).'
    ),
    (
        '80000000-0000-0000-0000-000000000029',
        '7a000000-0000-0000-0000-000000000019',
        'AUD-2027-006',
        '40000000-0000-0000-0000-000000000009', -- FN-QMS-2026-009 (Example Logística)
        'b0000000-0000-0000-0000-000000000003', -- Seguimiento 1
        'c0000000-0000-0000-0000-000000000002', -- Remota
        'Multientidad',
        1.00,
        'Programada',
        FALSE,
        'Seguimiento 1 multientidad Año +1 Example Logística (preprogramado por mes).'
    ),
    (
        '80000000-0000-0000-0000-000000000030',
        '7a000000-0000-0000-0000-000000000020',
        'AUD-2028-005',
        '40000000-0000-0000-0000-000000000001', -- FN-QMS-2024-001 (Iberometal)
        'b0000000-0000-0000-0000-000000000004', -- Seguimiento 2
        'c0000000-0000-0000-0000-000000000001', -- Presencial
        'Multientidad',
        4.50,
        'Borrador',
        FALSE,
        'Seguimiento 2 multientidad Año +2 Iberometal SGC (preprogramado por mes).'
    ),
    (
        '80000000-0000-0000-0000-000000000031',
        '7a000000-0000-0000-0000-000000000020',
        'AUD-2028-006',
        '40000000-0000-0000-0000-000000000009', -- FN-QMS-2026-009 (Example Logística)
        'b0000000-0000-0000-0000-000000000004', -- Seguimiento 2
        'c0000000-0000-0000-0000-000000000002', -- Remota
        'Multientidad',
        1.00,
        'Borrador',
        FALSE,
        'Seguimiento 2 multientidad Año +2 Example Logística (preprogramado por mes).'
    ),
    (
        '80000000-0000-0000-0000-000000000032',
        '7a000000-0000-0000-0000-000000000021',
        'AUD-2027-007',
        '40000000-0000-0000-0000-000000000006', -- FN-SST-2026-006 (Example SST)
        'b0000000-0000-0000-0000-000000000002', -- Etapa 2
        'c0000000-0000-0000-0000-000000000001', -- Presencial
        'Individual',
        2.50,
        'Programada',
        FALSE,
        'Etapa 2 SST Example Año +1 (preprogramada por mes).'
    ),
    (
        '80000000-0000-0000-0000-000000000033',
        '7a000000-0000-0000-0000-000000000022',
        'AUD-2028-007',
        '40000000-0000-0000-0000-000000000006', -- FN-SST-2026-006 (Example SST)
        'b0000000-0000-0000-0000-000000000004', -- Seguimiento 2
        'c0000000-0000-0000-0000-000000000001', -- Presencial
        'Individual',
        1.75,
        'Borrador',
        FALSE,
        'Seguimiento 2 SST Example Año +2 (preprogramado por mes).'
    )
ON CONFLICT (codigo_auditoria) WHERE codigo_auditoria IS NOT NULL AND deleted_at IS NULL DO UPDATE SET
    id_programa_auditoria = EXCLUDED.id_programa_auditoria,
    id_certificado = EXCLUDED.id_certificado,
    id_tipo_auditoria = EXCLUDED.id_tipo_auditoria,
    id_metodologia = EXCLUDED.id_metodologia,
    tipo_vinculacion = EXCLUDED.tipo_vinculacion,
    tiempo_auditoria = EXCLUDED.tiempo_auditoria,
    estado_ciclo = EXCLUDED.estado_ciclo,
    fecha_cierre_auditoria = NULL,
    revisado = FALSE,
    fecha_revision = NULL,
    revisado_por = NULL,
    usuario_revisor_id = NULL,
    documentacion_completa = FALSE,
    resumen_revision = NULL,
    tiene_sitio_temporal = EXCLUDED.tiene_sitio_temporal,
    objetivo = EXCLUDED.objetivo,
    updated_at = NOW();

-- Reconciliación idempotente de IDs deterministas para Sitio 0 auto-asignados por trg_auto_asignar_sitio_principal_auditoria
DO $$
DECLARE
    v_map RECORD;
BEGIN
    FOR v_map IN
        SELECT * FROM (VALUES
            ('90000000-0000-0000-0000-000000000000'::UUID, '80000000-0000-0000-0000-000000000001'::UUID, '50000000-0000-0000-0000-000000000000'::UUID),
            ('90000000-0000-0000-0000-000000000002'::UUID, '80000000-0000-0000-0000-000000000002'::UUID, '50000000-0000-0000-0000-000000000004'::UUID),
            ('90000000-0000-0000-0000-000000000003'::UUID, '80000000-0000-0000-0000-000000000003'::UUID, '50000000-0000-0000-0000-000000000005'::UUID),
            ('90000000-0000-0000-0000-000000000004'::UUID, '80000000-0000-0000-0000-000000000004'::UUID, '50000000-0000-0000-0000-000000000004'::UUID),
            ('90000000-0000-0000-0000-000000000005'::UUID, '80000000-0000-0000-0000-000000000005'::UUID, '50000000-0000-0000-0000-000000000005'::UUID),
            ('90000000-0000-0000-0000-000000000075'::UUID, '80000000-0000-0000-0000-000000000006'::UUID, '50000000-0000-0000-0000-000000000000'::UUID),
            ('90000000-0000-0000-0000-000000000007'::UUID, '80000000-0000-0000-0000-000000000007'::UUID, '50000000-0000-0000-0000-000000000007'::UUID),
            ('90000000-0000-0000-0000-000000000008'::UUID, '80000000-0000-0000-0000-000000000008'::UUID, '50000000-0000-0000-0000-000000000006'::UUID),
            ('90000000-0000-0000-0000-000000000076'::UUID, '80000000-0000-0000-0000-000000000009'::UUID, '50000000-0000-0000-0000-000000000004'::UUID),
            ('90000000-0000-0000-0000-000000000077'::UUID, '80000000-0000-0000-0000-000000000010'::UUID, '50000000-0000-0000-0000-000000000005'::UUID),
            ('90000000-0000-0000-0000-000000000078'::UUID, '80000000-0000-0000-0000-000000000011'::UUID, '50000000-0000-0000-0000-000000000004'::UUID),
            ('90000000-0000-0000-0000-000000000079'::UUID, '80000000-0000-0000-0000-000000000012'::UUID, '50000000-0000-0000-0000-000000000005'::UUID),
            ('90000000-0000-0000-0000-000000000009'::UUID, '80000000-0000-0000-0000-000000000013'::UUID, '50000000-0000-0000-0000-000000000000'::UUID),
            ('90000000-0000-0000-0000-000000000010'::UUID, '80000000-0000-0000-0000-000000000014'::UUID, '50000000-0000-0000-0000-000000000003'::UUID),
            ('90000000-0000-0000-0000-000000000110'::UUID, '80000000-0000-0000-0000-000000000110'::UUID, '50000000-0000-0000-0000-000000000110'::UUID),
            ('90000000-0000-0000-0000-000000000111'::UUID, '80000000-0000-0000-0000-000000000111'::UUID, '50000000-0000-0000-0000-000000000111'::UUID),
            ('90000000-0000-0000-0000-000000000011'::UUID, '80000000-0000-0000-0000-000000000015'::UUID, '50000000-0000-0000-0000-000000000000'::UUID),
            ('90000000-0000-0000-0000-000000000015'::UUID, '80000000-0000-0000-0000-000000000016'::UUID, '50000000-0000-0000-0000-000000000000'::UUID),
            ('90000000-0000-0000-0000-000000000019'::UUID, '80000000-0000-0000-0000-000000000017'::UUID, '50000000-0000-0000-0000-000000000002'::UUID),
            ('90000000-0000-0000-0000-000000000022'::UUID, '80000000-0000-0000-0000-000000000018'::UUID, '50000000-0000-0000-0000-000000000002'::UUID),
            ('90000000-0000-0000-0000-000000000025'::UUID, '80000000-0000-0000-0000-000000000019'::UUID, '50000000-0000-0000-0000-000000000020'::UUID),
            ('90000000-0000-0000-0000-000000000028'::UUID, '80000000-0000-0000-0000-000000000020'::UUID, '50000000-0000-0000-0000-000000000002'::UUID),
            ('90000000-0000-0000-0000-000000000031'::UUID, '80000000-0000-0000-0000-000000000021'::UUID, '50000000-0000-0000-0000-000000000020'::UUID),
            ('90000000-0000-0000-0000-000000000034'::UUID, '80000000-0000-0000-0000-000000000022'::UUID, '50000000-0000-0000-0000-000000000006'::UUID),
            ('90000000-0000-0000-0000-000000000035'::UUID, '80000000-0000-0000-0000-000000000023'::UUID, '50000000-0000-0000-0000-000000000000'::UUID),
            ('90000000-0000-0000-0000-000000000039'::UUID, '80000000-0000-0000-0000-000000000024'::UUID, '50000000-0000-0000-0000-000000000002'::UUID),
            ('90000000-0000-0000-0000-000000000042'::UUID, '80000000-0000-0000-0000-000000000025'::UUID, '50000000-0000-0000-0000-000000000020'::UUID),
            ('90000000-0000-0000-0000-000000000045'::UUID, '80000000-0000-0000-0000-000000000026'::UUID, '50000000-0000-0000-0000-000000000002'::UUID),
            ('90000000-0000-0000-0000-000000000048'::UUID, '80000000-0000-0000-0000-000000000027'::UUID, '50000000-0000-0000-0000-000000000020'::UUID),
            ('90000000-0000-0000-0000-000000000051'::UUID, '80000000-0000-0000-0000-000000000028'::UUID, '50000000-0000-0000-0000-000000000000'::UUID),
            ('90000000-0000-0000-0000-000000000055'::UUID, '80000000-0000-0000-0000-000000000029'::UUID, '50000000-0000-0000-0000-000000000007'::UUID),
            ('90000000-0000-0000-0000-000000000056'::UUID, '80000000-0000-0000-0000-000000000030'::UUID, '50000000-0000-0000-0000-000000000000'::UUID),
            ('90000000-0000-0000-0000-000000000060'::UUID, '80000000-0000-0000-0000-000000000031'::UUID, '50000000-0000-0000-0000-000000000007'::UUID),
            ('90000000-0000-0000-0000-000000000061'::UUID, '80000000-0000-0000-0000-000000000032'::UUID, '50000000-0000-0000-0000-000000000006'::UUID),
            ('90000000-0000-0000-0000-000000000062'::UUID, '80000000-0000-0000-0000-000000000033'::UUID, '50000000-0000-0000-0000-000000000006'::UUID)
        ) AS t(target_id, id_auditoria, id_sitio)
    LOOP
        UPDATE public.sitios_por_auditoria sa
        SET id = v_map.target_id
        WHERE sa.id_auditoria = v_map.id_auditoria
          AND sa.id_sitio = v_map.id_sitio
          AND sa.deleted_at IS NULL
          AND sa.id IS DISTINCT FROM v_map.target_id
          AND NOT EXISTS (
              SELECT 1 FROM public.sitios_por_auditoria existing
              WHERE existing.id = v_map.target_id
          );
    END LOOP;
END $$;

-- 20. Sitios en Alcance de las Auditorías (insertados antes de auditoria_fecha para validar compuerta REAL)
INSERT INTO public.sitios_por_auditoria (id, id_auditoria, id_sitio, tiempo_auditoria, modalidad_evaluacion, fecha_inicio, fecha_fin, notas_sitio) VALUES
    -- Escenario A: Sitio 0 HQ 195p (2.50d) >= Sitio 1 Planta Valencia 88p (1.50d) = 4.00d
    (
        '90000000-0000-0000-0000-000000000000',
        '80000000-0000-0000-0000-000000000001',
        '50000000-0000-0000-0000-000000000000',
        2.50,
        'Presencial',
        (CURRENT_DATE - INTERVAL '1 year')::DATE,
        (CURRENT_DATE - INTERVAL '1 year' + INTERVAL '2 days')::DATE,
        'Evaluación de alta dirección, procesos medulares y sistema documental en HQ (195 personas).'
    ),
    (
        '90000000-0000-0000-0000-000000000001',
        '80000000-0000-0000-0000-000000000001',
        '50000000-0000-0000-0000-000000000001',
        1.50,
        'Presencial',
        (CURRENT_DATE - INTERVAL '1 year' + INTERVAL '2 days')::DATE,
        (CURRENT_DATE - INTERVAL '1 year' + INTERVAL '3 days')::DATE,
        'Evaluación operativa en planta productiva Valencia (88 personas).'
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
    -- Escenario C Nivel 2 Inter-Org (Sitio 0 2.50d >= Sitio 1 1.50d = 4.00d en AUD-2026-003)
    (
        '90000000-0000-0000-0000-000000000075',
        '80000000-0000-0000-0000-000000000006',
        '50000000-0000-0000-0000-000000000000',
        2.50,
        'Mixta',
        NULL,
        NULL,
        'Pendiente de fecha exacta en HQ y Planta Fundición Iberometal (195 personas).'
    ),
    (
        '90000000-0000-0000-0000-000000000006',
        '80000000-0000-0000-0000-000000000006',
        '50000000-0000-0000-0000-000000000001',
        1.50,
        'Mixta',
        NULL,
        NULL,
        'Pendiente de fecha exacta en Planta Valencia (88 personas).'
    ),
    (
        '90000000-0000-0000-0000-000000000007',
        '80000000-0000-0000-0000-000000000007',
        '50000000-0000-0000-0000-000000000007',
        2.00,
        'Remota',
        NULL,
        NULL,
        'Pendiente de fecha exacta en Centro Logístico Aragua.'
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
    ),
    -- Auditoría histórica cerrada (AUD-2023-001): Sitio 0 HQ (2.00d)
    (
        '90000000-0000-0000-0000-000000000009',
        '80000000-0000-0000-0000-000000000013',
        '50000000-0000-0000-0000-000000000000',
        2.00,
        'Presencial',
        (CURRENT_DATE - INTERVAL '18 months')::DATE,
        (CURRENT_DATE - INTERVAL '18 months' + INTERVAL '2 days')::DATE,
        'Revisión documental Etapa 1 histórica en HQ.'
    ),
    -- Auditoría histórica revisada QA (AUD-2022-001): Sitio 0 Centro de Datos Chacao (2.00d)
    (
        '90000000-0000-0000-0000-000000000010',
        '80000000-0000-0000-0000-000000000014',
        '50000000-0000-0000-0000-000000000003',
        2.00,
        'Remota',
        (CURRENT_DATE - INTERVAL '30 months')::DATE,
        (CURRENT_DATE - INTERVAL '30 months' + INTERVAL '2 days')::DATE,
        'Evaluación histórica Etapa 2 SGSI en Centro de Datos Chacao.'
    ),
    -- Escenario Step 1.1: 4º Sitio Combinado en CONG-ALM-01
    (
        '90000000-0000-0000-0000-000000000110',
        '80000000-0000-0000-0000-000000000110',
        '50000000-0000-0000-0000-000000000110',
        3.00,
        'Presencial',
        '2026-11-18',
        '2026-11-20',
        '4º Sitio Planta Envasado Sur (Organización Grande).'
    ),
    (
        '90000000-0000-0000-0000-000000000111',
        '80000000-0000-0000-0000-000000000111',
        '50000000-0000-0000-0000-000000000111',
        2.00,
        'Presencial',
        NULL,
        NULL,
        '4º Sitio Planta Envasado Sur (Organización Pequeña ISO 22000).'
    ),
    -- Paso 3.2: Sitios proporcionales 0.25d para AUD-2022-002..AUD-2028-007 (8000...0015..0033)
    -- AUD-2022-002 (40...0001 Etapa 2: 3.00 + 1.75 + 1.00 + 0.50 = 6.25d)
    ('90000000-0000-0000-0000-000000000011', '80000000-0000-0000-0000-000000000015', '50000000-0000-0000-0000-000000000000', 3.00, 'Presencial', (CURRENT_DATE - INTERVAL '40 months')::DATE, (CURRENT_DATE - INTERVAL '40 months' + INTERVAL '2 days')::DATE, 'HQ y Planta Fundición Etapa 2.'),
    ('90000000-0000-0000-0000-000000000012', '80000000-0000-0000-0000-000000000015', '50000000-0000-0000-0000-000000000001', 1.75, 'Presencial', (CURRENT_DATE - INTERVAL '40 months' + INTERVAL '2 days')::DATE, (CURRENT_DATE - INTERVAL '40 months' + INTERVAL '3 days')::DATE, 'Planta Troquelado Valencia Etapa 2.'),
    ('90000000-0000-0000-0000-000000000013', '80000000-0000-0000-0000-000000000015', '50000000-0000-0000-0000-000000000010', 1.00, 'Presencial', (CURRENT_DATE - INTERVAL '40 months' + INTERVAL '3 days')::DATE, (CURRENT_DATE - INTERVAL '40 months' + INTERVAL '4 days')::DATE, 'Centro Logístico Guacara Etapa 2.'),
    ('90000000-0000-0000-0000-000000000014', '80000000-0000-0000-0000-000000000015', '50000000-0000-0000-0000-000000000011', 0.50, 'Presencial', (CURRENT_DATE - INTERVAL '40 months' + INTERVAL '4 days')::DATE, (CURRENT_DATE - INTERVAL '40 months' + INTERVAL '4 days')::DATE, 'Oficina Comercial Caracas Etapa 2.'),
    -- AUD-2023-002 (40...0001 Seg 1: 2.00 + 1.25 + 0.75 + 0.50 = 4.50d)
    ('90000000-0000-0000-0000-000000000015', '80000000-0000-0000-0000-000000000016', '50000000-0000-0000-0000-000000000000', 2.00, 'Presencial', (CURRENT_DATE - INTERVAL '28 months')::DATE, (CURRENT_DATE - INTERVAL '28 months' + INTERVAL '1 day')::DATE, 'HQ y Planta Fundición Seguimiento 1.'),
    ('90000000-0000-0000-0000-000000000016', '80000000-0000-0000-0000-000000000016', '50000000-0000-0000-0000-000000000001', 1.25, 'Presencial', (CURRENT_DATE - INTERVAL '28 months' + INTERVAL '1 day')::DATE, (CURRENT_DATE - INTERVAL '28 months' + INTERVAL '2 days')::DATE, 'Planta Troquelado Valencia Seguimiento 1.'),
    ('90000000-0000-0000-0000-000000000017', '80000000-0000-0000-0000-000000000016', '50000000-0000-0000-0000-000000000010', 0.75, 'Presencial', (CURRENT_DATE - INTERVAL '28 months' + INTERVAL '2 days')::DATE, (CURRENT_DATE - INTERVAL '28 months' + INTERVAL '3 days')::DATE, 'Centro Logístico Guacara Seguimiento 1.'),
    ('90000000-0000-0000-0000-000000000018', '80000000-0000-0000-0000-000000000016', '50000000-0000-0000-0000-000000000011', 0.50, 'Presencial', (CURRENT_DATE - INTERVAL '28 months' + INTERVAL '3 days')::DATE, (CURRENT_DATE - INTERVAL '28 months' + INTERVAL '3 days')::DATE, 'Oficina Comercial Caracas Seguimiento 1.'),
    -- AUD-2022-003 (40...0002 Etapa 2: 2.75 + 1.50 + 0.75 = 5.00d)
    ('90000000-0000-0000-0000-000000000019', '80000000-0000-0000-0000-000000000017', '50000000-0000-0000-0000-000000000002', 2.75, 'Presencial', (CURRENT_DATE - INTERVAL '46 months')::DATE, (CURRENT_DATE - INTERVAL '46 months' + INTERVAL '2 days')::DATE, 'Complejo Ambiental HQ Etapa 2.'),
    ('90000000-0000-0000-0000-000000000020', '80000000-0000-0000-0000-000000000017', '50000000-0000-0000-0000-000000000012', 1.50, 'Presencial', (CURRENT_DATE - INTERVAL '46 months' + INTERVAL '2 days')::DATE, (CURRENT_DATE - INTERVAL '46 months' + INTERVAL '3 days')::DATE, 'Planta Tratamiento Superficial Etapa 2.'),
    ('90000000-0000-0000-0000-000000000021', '80000000-0000-0000-0000-000000000017', '50000000-0000-0000-0000-000000000013', 0.75, 'Presencial', (CURRENT_DATE - INTERVAL '46 months' + INTERVAL '3 days')::DATE, (CURRENT_DATE - INTERVAL '46 months' + INTERVAL '3 days')::DATE, 'Almacén Insumos Guacara Etapa 2.'),
    -- AUD-2025-003 (40...0002 Renovación: 2.50 + 1.50 + 0.75 = 4.75d)
    ('90000000-0000-0000-0000-000000000022', '80000000-0000-0000-0000-000000000018', '50000000-0000-0000-0000-000000000002', 2.50, 'Presencial', (CURRENT_DATE - INTERVAL '10 months')::DATE, (CURRENT_DATE - INTERVAL '10 months' + INTERVAL '2 days')::DATE, 'Complejo Ambiental HQ Renovación.'),
    ('90000000-0000-0000-0000-000000000023', '80000000-0000-0000-0000-000000000018', '50000000-0000-0000-0000-000000000012', 1.50, 'Presencial', (CURRENT_DATE - INTERVAL '10 months' + INTERVAL '2 days')::DATE, (CURRENT_DATE - INTERVAL '10 months' + INTERVAL '3 days')::DATE, 'Planta Tratamiento Superficial Renovación.'),
    ('90000000-0000-0000-0000-000000000024', '80000000-0000-0000-0000-000000000018', '50000000-0000-0000-0000-000000000013', 0.75, 'Presencial', (CURRENT_DATE - INTERVAL '10 months' + INTERVAL '3 days')::DATE, (CURRENT_DATE - INTERVAL '10 months' + INTERVAL '3 days')::DATE, 'Almacén Insumos Guacara Renovación.'),
    -- AUD-2025-004 (40...0010 Etapa 2: 3.00 + 1.50 + 0.50 = 5.00d)
    ('90000000-0000-0000-0000-000000000025', '80000000-0000-0000-0000-000000000019', '50000000-0000-0000-0000-000000000020', 3.00, 'Presencial', (CURRENT_DATE - INTERVAL '12 days')::DATE, (CURRENT_DATE - INTERVAL '10 days')::DATE, 'Complejo Seguridad HQ Etapa 2.'),
    ('90000000-0000-0000-0000-000000000026', '80000000-0000-0000-0000-000000000019', '50000000-0000-0000-0000-000000000021', 1.50, 'Presencial', (CURRENT_DATE - INTERVAL '10 days')::DATE, (CURRENT_DATE - INTERVAL '9 days')::DATE, 'Planta Prensas Pesadas Valencia Etapa 2.'),
    ('90000000-0000-0000-0000-000000000027', '80000000-0000-0000-0000-000000000019', '50000000-0000-0000-0000-000000000022', 0.50, 'Presencial', (CURRENT_DATE - INTERVAL '9 days')::DATE, (CURRENT_DATE - INTERVAL '9 days')::DATE, 'Servicio Médico y Oficina Caracas Etapa 2.'),
    -- AUD-2026-006 (40...0002 Borrador Seg 1: 1.75 + 1.00 + 0.75 = 3.50d)
    ('90000000-0000-0000-0000-000000000028', '80000000-0000-0000-0000-000000000020', '50000000-0000-0000-0000-000000000002', 1.75, 'Presencial', NULL, NULL, 'Complejo Ambiental HQ Borrador Seg. 1.'),
    ('90000000-0000-0000-0000-000000000029', '80000000-0000-0000-0000-000000000020', '50000000-0000-0000-0000-000000000012', 1.00, 'Presencial', NULL, NULL, 'Planta Tratamiento Superficial Borrador Seg. 1.'),
    ('90000000-0000-0000-0000-000000000030', '80000000-0000-0000-0000-000000000020', '50000000-0000-0000-0000-000000000013', 0.75, 'Presencial', NULL, NULL, 'Almacén Insumos Guacara Borrador Seg. 1.'),
    -- AUD-2026-007 (40...0010 Borrador Seg 1: 2.00 + 1.25 + 0.50 = 3.75d)
    ('90000000-0000-0000-0000-000000000031', '80000000-0000-0000-0000-000000000021', '50000000-0000-0000-0000-000000000020', 2.00, 'Presencial', NULL, NULL, 'Complejo Seguridad HQ Borrador Seg. 1.'),
    ('90000000-0000-0000-0000-000000000032', '80000000-0000-0000-0000-000000000021', '50000000-0000-0000-0000-000000000021', 1.25, 'Presencial', NULL, NULL, 'Planta Prensas Pesadas Borrador Seg. 1.'),
    ('90000000-0000-0000-0000-000000000033', '80000000-0000-0000-0000-000000000021', '50000000-0000-0000-0000-000000000022', 0.50, 'Presencial', NULL, NULL, 'Oficina Administrativa Caracas Borrador Seg. 1.'),
    -- AUD-2026-008 (40...0006 Programada Seg 1: 1.75d)
    ('90000000-0000-0000-0000-000000000034', '80000000-0000-0000-0000-000000000022', '50000000-0000-0000-0000-000000000006', 1.75, 'Presencial', (CURRENT_DATE + INTERVAL '35 days')::DATE, (CURRENT_DATE + INTERVAL '36 days')::DATE, 'Planta Santa Cruz SST Programada Seg. 1.'),
    -- AUD-2026-009 (40...0001 En Ejecución Seg 1: 2.00 + 1.25 + 0.75 + 0.50 = 4.50d)
    ('90000000-0000-0000-0000-000000000035', '80000000-0000-0000-0000-000000000023', '50000000-0000-0000-0000-000000000000', 2.00, 'Presencial', (CURRENT_DATE - INTERVAL '1 day')::DATE, (CURRENT_DATE + INTERVAL '1 day')::DATE, 'HQ y Planta Fundición En Ejecución.'),
    ('90000000-0000-0000-0000-000000000036', '80000000-0000-0000-0000-000000000023', '50000000-0000-0000-0000-000000000001', 1.25, 'Presencial', CURRENT_DATE, (CURRENT_DATE + INTERVAL '1 day')::DATE, 'Planta Troquelado Valencia En Ejecución.'),
    ('90000000-0000-0000-0000-000000000037', '80000000-0000-0000-0000-000000000023', '50000000-0000-0000-0000-000000000010', 0.75, 'Presencial', CURRENT_DATE, (CURRENT_DATE + INTERVAL '1 day')::DATE, 'Centro Logístico Guacara En Ejecución.'),
    ('90000000-0000-0000-0000-000000000038', '80000000-0000-0000-0000-000000000023', '50000000-0000-0000-0000-000000000011', 0.50, 'Presencial', (CURRENT_DATE + INTERVAL '1 day')::DATE, (CURRENT_DATE + INTERVAL '1 day')::DATE, 'Oficina Comercial Caracas En Ejecución.'),
    -- AUD-2027-003 (40...0002 Seg 2 Año +1: 1.75 + 1.00 + 0.75 = 3.50d)
    ('90000000-0000-0000-0000-000000000039', '80000000-0000-0000-0000-000000000024', '50000000-0000-0000-0000-000000000002', 1.75, 'Presencial', NULL, NULL, 'Complejo Ambiental HQ Preprogramado Año +1.'),
    ('90000000-0000-0000-0000-000000000040', '80000000-0000-0000-0000-000000000024', '50000000-0000-0000-0000-000000000012', 1.00, 'Presencial', NULL, NULL, 'Planta Tratamiento Superficial Preprogramado Año +1.'),
    ('90000000-0000-0000-0000-000000000041', '80000000-0000-0000-0000-000000000024', '50000000-0000-0000-0000-000000000013', 0.75, 'Presencial', NULL, NULL, 'Almacén Insumos Guacara Preprogramado Año +1.'),
    -- AUD-2027-004 (40...0010 Seg 2 Año +1: 2.00 + 1.25 + 0.50 = 3.75d)
    ('90000000-0000-0000-0000-000000000042', '80000000-0000-0000-0000-000000000025', '50000000-0000-0000-0000-000000000020', 2.00, 'Presencial', NULL, NULL, 'Complejo Seguridad HQ Preprogramado Año +1.'),
    ('90000000-0000-0000-0000-000000000043', '80000000-0000-0000-0000-000000000025', '50000000-0000-0000-0000-000000000021', 1.25, 'Presencial', NULL, NULL, 'Planta Prensas Pesadas Preprogramado Año +1.'),
    ('90000000-0000-0000-0000-000000000044', '80000000-0000-0000-0000-000000000025', '50000000-0000-0000-0000-000000000022', 0.50, 'Presencial', NULL, NULL, 'Oficina Administrativa Caracas Preprogramado Año +1.'),
    -- AUD-2028-003 (40...0002 Renovación Año +2: 2.50 + 1.50 + 0.75 = 4.75d)
    ('90000000-0000-0000-0000-000000000045', '80000000-0000-0000-0000-000000000026', '50000000-0000-0000-0000-000000000002', 2.50, 'Presencial', NULL, NULL, 'Complejo Ambiental HQ Preprogramado Año +2.'),
    ('90000000-0000-0000-0000-000000000046', '80000000-0000-0000-0000-000000000026', '50000000-0000-0000-0000-000000000012', 1.50, 'Presencial', NULL, NULL, 'Planta Tratamiento Superficial Preprogramado Año +2.'),
    ('90000000-0000-0000-0000-000000000047', '80000000-0000-0000-0000-000000000026', '50000000-0000-0000-0000-000000000013', 0.75, 'Presencial', NULL, NULL, 'Almacén Insumos Guacara Preprogramado Año +2.'),
    -- AUD-2028-004 (40...0010 Renovación Año +2: 2.75 + 1.50 + 0.50 = 4.75d)
    ('90000000-0000-0000-0000-000000000048', '80000000-0000-0000-0000-000000000027', '50000000-0000-0000-0000-000000000020', 2.75, 'Presencial', NULL, NULL, 'Complejo Seguridad HQ Preprogramado Año +2.'),
    ('90000000-0000-0000-0000-000000000049', '80000000-0000-0000-0000-000000000027', '50000000-0000-0000-0000-000000000021', 1.50, 'Presencial', NULL, NULL, 'Planta Prensas Pesadas Preprogramado Año +2.'),
    ('90000000-0000-0000-0000-000000000050', '80000000-0000-0000-0000-000000000027', '50000000-0000-0000-0000-000000000022', 0.50, 'Presencial', NULL, NULL, 'Oficina Administrativa Caracas Preprogramado Año +2.'),
    -- AUD-2027-005 (40...0001 Seg 1 Año +1: 2.00 + 1.25 + 0.75 + 0.50 = 4.50d)
    ('90000000-0000-0000-0000-000000000051', '80000000-0000-0000-0000-000000000028', '50000000-0000-0000-0000-000000000000', 2.00, 'Mixta', NULL, NULL, 'HQ y Planta Fundición Preprogramado Año +1.'),
    ('90000000-0000-0000-0000-000000000052', '80000000-0000-0000-0000-000000000028', '50000000-0000-0000-0000-000000000001', 1.25, 'Presencial', NULL, NULL, 'Planta Troquelado Valencia Preprogramado Año +1.'),
    ('90000000-0000-0000-0000-000000000053', '80000000-0000-0000-0000-000000000028', '50000000-0000-0000-0000-000000000010', 0.75, 'Presencial', NULL, NULL, 'Centro Logístico Guacara Preprogramado Año +1.'),
    ('90000000-0000-0000-0000-000000000054', '80000000-0000-0000-0000-000000000028', '50000000-0000-0000-0000-000000000011', 0.50, 'Remota', NULL, NULL, 'Oficina Comercial Caracas Preprogramado Año +1.'),
    -- AUD-2027-006 (40...0009 Seg 1 Año +1: 1.00d)
    ('90000000-0000-0000-0000-000000000055', '80000000-0000-0000-0000-000000000029', '50000000-0000-0000-0000-000000000007', 1.00, 'Remota', NULL, NULL, 'Centro Logístico Aragua Preprogramado Año +1.'),
    -- AUD-2028-005 (40...0001 Seg 2 Año +2: 2.00 + 1.25 + 0.75 + 0.50 = 4.50d)
    ('90000000-0000-0000-0000-000000000056', '80000000-0000-0000-0000-000000000030', '50000000-0000-0000-0000-000000000000', 2.00, 'Presencial', NULL, NULL, 'HQ y Planta Fundición Preprogramado Año +2.'),
    ('90000000-0000-0000-0000-000000000057', '80000000-0000-0000-0000-000000000030', '50000000-0000-0000-0000-000000000001', 1.25, 'Presencial', NULL, NULL, 'Planta Troquelado Valencia Preprogramado Año +2.'),
    ('90000000-0000-0000-0000-000000000058', '80000000-0000-0000-0000-000000000030', '50000000-0000-0000-0000-000000000010', 0.75, 'Presencial', NULL, NULL, 'Centro Logístico Guacara Preprogramado Año +2.'),
    ('90000000-0000-0000-0000-000000000059', '80000000-0000-0000-0000-000000000030', '50000000-0000-0000-0000-000000000011', 0.50, 'Presencial', NULL, NULL, 'Oficina Comercial Caracas Preprogramado Año +2.'),
    -- AUD-2028-006 (40...0009 Seg 2 Año +2: 1.00d)
    ('90000000-0000-0000-0000-000000000060', '80000000-0000-0000-0000-000000000031', '50000000-0000-0000-0000-000000000007', 1.00, 'Remota', NULL, NULL, 'Centro Logístico Aragua Preprogramado Año +2.'),
    -- AUD-2027-007 (40...0006 Etapa 2 Año +1: 2.50d)
    ('90000000-0000-0000-0000-000000000061', '80000000-0000-0000-0000-000000000032', '50000000-0000-0000-0000-000000000006', 2.50, 'Presencial', NULL, NULL, 'Planta Santa Cruz SST Preprogramado Año +1.'),
    -- AUD-2028-007 (40...0006 Seg 2 Año +2: 1.75d)
    ('90000000-0000-0000-0000-000000000062', '80000000-0000-0000-0000-000000000033', '50000000-0000-0000-0000-000000000006', 1.75, 'Presencial', NULL, NULL, 'Planta Santa Cruz SST Preprogramado Año +2.'),
    -- Paso 4.1: Sitios proporcionales en futuras VINC-N1-01 (AUD-2027-001/002 y AUD-2028-001/002)
    -- AUD-2027-001 (40...0004 Seg 2 Año +1: 1.75 + 1.00 + 0.50 = 3.25d)
    ('90000000-0000-0000-0000-000000000076', '80000000-0000-0000-0000-000000000009', '50000000-0000-0000-0000-000000000004', 1.75, 'Presencial', NULL, NULL, 'Planta Estructural Santa Cruz HQ Preprogramado Año +1 (150 personas).'),
    ('90000000-0000-0000-0000-000000000080', '80000000-0000-0000-0000-000000000009', '50000000-0000-0000-0000-000000000014', 1.00, 'Presencial', NULL, NULL, 'Patio Granallado y Pintura Cagua Preprogramado Año +1 (64 personas).'),
    ('90000000-0000-0000-0000-000000000081', '80000000-0000-0000-0000-000000000009', '50000000-0000-0000-0000-000000000015', 0.50, 'Remota', NULL, NULL, 'Oficina Comercial Caracas Preprogramado Año +1 (18 personas).'),
    -- AUD-2027-002 (40...0005 Seg 2 Año +1: 1.75 + 1.00 + 0.50 = 3.25d)
    ('90000000-0000-0000-0000-000000000077', '80000000-0000-0000-0000-000000000010', '50000000-0000-0000-0000-000000000005', 1.75, 'Presencial', NULL, NULL, 'Planta Santa Cruz SGA HQ Preprogramado Año +1 (145 personas).'),
    ('90000000-0000-0000-0000-000000000082', '80000000-0000-0000-0000-000000000010', '50000000-0000-0000-0000-000000000016', 1.00, 'Presencial', NULL, NULL, 'Patio Acabado Superficial Cagua SGA Preprogramado Año +1 (58 personas).'),
    ('90000000-0000-0000-0000-000000000083', '80000000-0000-0000-0000-000000000010', '50000000-0000-0000-0000-000000000017', 0.50, 'Remota', NULL, NULL, 'Oficina Administrativa Ambiental Maracay Preprogramado Año +1 (12 personas).'),
    -- AUD-2028-001 (40...0004 Renovación Año +2: 2.25 + 1.25 + 0.50 = 4.00d)
    ('90000000-0000-0000-0000-000000000078', '80000000-0000-0000-0000-000000000011', '50000000-0000-0000-0000-000000000004', 2.25, 'Presencial', NULL, NULL, 'Planta Estructural Santa Cruz HQ Renovación Año +2 (150 personas).'),
    ('90000000-0000-0000-0000-000000000084', '80000000-0000-0000-0000-000000000011', '50000000-0000-0000-0000-000000000014', 1.25, 'Presencial', NULL, NULL, 'Patio Granallado y Pintura Cagua Renovación Año +2 (64 personas).'),
    ('90000000-0000-0000-0000-000000000085', '80000000-0000-0000-0000-000000000011', '50000000-0000-0000-0000-000000000015', 0.50, 'Remota', NULL, NULL, 'Oficina Comercial Caracas Renovación Año +2 (18 personas).'),
    -- AUD-2028-002 (40...0005 Renovación Año +2: 2.25 + 1.25 + 0.50 = 4.00d)
    ('90000000-0000-0000-0000-000000000079', '80000000-0000-0000-0000-000000000012', '50000000-0000-0000-0000-000000000005', 2.25, 'Presencial', NULL, NULL, 'Planta Santa Cruz SGA HQ Renovación Año +2 (145 personas).'),
    ('90000000-0000-0000-0000-000000000086', '80000000-0000-0000-0000-000000000012', '50000000-0000-0000-0000-000000000016', 1.25, 'Presencial', NULL, NULL, 'Patio Acabado Superficial Cagua SGA Renovación Año +2 (58 personas).'),
    ('90000000-0000-0000-0000-000000000087', '80000000-0000-0000-0000-000000000012', '50000000-0000-0000-0000-000000000017', 0.50, 'Remota', NULL, NULL, 'Oficina Administrativa Ambiental Maracay Renovación Año +2 (12 personas).')
ON CONFLICT (id_auditoria, id_sitio) WHERE deleted_at IS NULL DO UPDATE SET
    tiempo_auditoria = EXCLUDED.tiempo_auditoria,
    modalidad_evaluacion = EXCLUDED.modalidad_evaluacion,
    fecha_inicio = EXCLUDED.fecha_inicio,
    fecha_fin = EXCLUDED.fecha_fin,
    notas_sitio = EXCLUDED.notas_sitio;

-- 20a. Sitios Temporales / Proyectos de Obra y Atribución a Certificados (Step 5.1 + Paso 4.1)
INSERT INTO public.auditoria_sitio_temporal (id, id_auditoria, etiqueta, comentario, tiempo_auditoria) VALUES
    (
        '9a000000-0000-0000-0000-000000000001',
        '80000000-0000-0000-0000-000000000004', -- AUD-2026-001 (Planta Santa Cruz, PROG-2026-001 con tiene_sitio_temporal = TRUE)
        'Sitio Temporal — Obra Planta Sur',
        'Proyecto de ampliación nave B',
        1.00
    ),
    (
        '9a000000-0000-0000-0000-000000000002',
        '80000000-0000-0000-0000-000000000002', -- AUD-2025-001 (PROG-2025-001 con tiene_sitio_temporal = TRUE)
        'Montaje Puente Grúa Sector Norte',
        'Obra temporal concluida durante campaña combinada Año 1',
        0.50
    ),
    (
        '9a000000-0000-0000-0000-000000000003',
        '80000000-0000-0000-0000-000000000006', -- AUD-2026-003 (PROG-2026-002 multientidad con tiene_sitio_temporal = TRUE)
        'Frente de Obra Bahía Despacho',
        'Ampliación de andén de despacho inter-organizacional',
        0.75
    )
ON CONFLICT (id_auditoria, LOWER(TRIM(etiqueta))) WHERE deleted_at IS NULL DO UPDATE SET
    comentario = EXCLUDED.comentario,
    tiempo_auditoria = EXCLUDED.tiempo_auditoria,
    updated_at = NOW();

INSERT INTO public.auditoria_sitio_temporal_certificado (id, id_sitio_temporal, id_auditoria_certificado) VALUES
    ('9b000000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000004'), -- SGC FN-QMS-2025-004
    ('9b000000-0000-0000-0000-000000000002', '9a000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000005'), -- SGA FN-EMS-2025-005
    ('9b000000-0000-0000-0000-000000000003', '9a000000-0000-0000-0000-000000000002', '80000000-0000-0000-0000-000000000002'), -- Año 1 SGC FN-QMS-2025-004
    ('9b000000-0000-0000-0000-000000000004', '9a000000-0000-0000-0000-000000000002', '80000000-0000-0000-0000-000000000003'), -- Año 1 SGA FN-EMS-2025-005
    ('9b000000-0000-0000-0000-000000000005', '9a000000-0000-0000-0000-000000000003', '80000000-0000-0000-0000-000000000006'), -- Multientidad Iberometal SGC
    ('9b000000-0000-0000-0000-000000000006', '9a000000-0000-0000-0000-000000000003', '80000000-0000-0000-0000-000000000007')  -- Multientidad Example Logística
ON CONFLICT (id_sitio_temporal, id_auditoria_certificado) WHERE deleted_at IS NULL DO NOTHING;

-- 19c. Fechas 1:N de Auditoría (PREPROGRAMADA_MES, PROGRAMADA_EXACTA y REAL con numero_secuencia)
INSERT INTO public.auditoria_fecha (
    id, id_auditoria, numero_secuencia, tag, tipo_fecha, anio, mes, fecha_inicio, fecha_fin, observacion
) VALUES
    -- Escenario A (Histórico año anterior Auditada: seq 1 PROGRAMADA_EXACTA + seq 2 REAL)
    (
        '81000000-0000-0000-0000-000000000001',
        '80000000-0000-0000-0000-000000000001',
        1,
        'Programación',
        'PROGRAMADA_EXACTA',
        NULL,
        NULL,
        (CURRENT_DATE - INTERVAL '1 year')::DATE,
        (CURRENT_DATE - INTERVAL '1 year' + INTERVAL '3 days')::DATE,
        'Programación exacta aprobada Etapa 2.'
    ),
    (
        '81000000-0000-0000-0000-000000000011',
        '80000000-0000-0000-0000-000000000001',
        2,
        'Programación',
        'REAL',
        NULL,
        NULL,
        (CURRENT_DATE - INTERVAL '1 year')::DATE,
        (CURRENT_DATE - INTERVAL '1 year' + INTERVAL '3 days')::DATE,
        'Ejecución real histórica Etapa 2 completada conforme al plan.'
    ),
    -- Escenario B Año 1 Combinada (Auditada: seq 1 PROGRAMADA_EXACTA + seq 2 REAL)
    (
        '81000000-0000-0000-0000-000000000002',
        '80000000-0000-0000-0000-000000000002',
        1,
        'Programación',
        'PROGRAMADA_EXACTA',
        NULL,
        NULL,
        (CURRENT_DATE - INTERVAL '1 year' + INTERVAL '15 days')::DATE,
        (CURRENT_DATE - INTERVAL '1 year' + INTERVAL '17 days')::DATE,
        'Programación exacta SGC Año 1 en esquema Combinado.'
    ),
    (
        '81000000-0000-0000-0000-000000000012',
        '80000000-0000-0000-0000-000000000002',
        2,
        'Programación',
        'REAL',
        NULL,
        NULL,
        (CURRENT_DATE - INTERVAL '1 year' + INTERVAL '15 days')::DATE,
        (CURRENT_DATE - INTERVAL '1 year' + INTERVAL '17 days')::DATE,
        'Ejecución real SGC Año 1 en esquema Combinado.'
    ),
    (
        '81000000-0000-0000-0000-000000000003',
        '80000000-0000-0000-0000-000000000003',
        1,
        'Programación',
        'PROGRAMADA_EXACTA',
        NULL,
        NULL,
        (CURRENT_DATE - INTERVAL '1 year' + INTERVAL '15 days')::DATE,
        (CURRENT_DATE - INTERVAL '1 year' + INTERVAL '17 days')::DATE,
        'Programación exacta SGA Año 1 en esquema Combinado.'
    ),
    (
        '81000000-0000-0000-0000-000000000013',
        '80000000-0000-0000-0000-000000000003',
        2,
        'Programación',
        'REAL',
        NULL,
        NULL,
        (CURRENT_DATE - INTERVAL '1 year' + INTERVAL '15 days')::DATE,
        (CURRENT_DATE - INTERVAL '1 year' + INTERVAL '17 days')::DATE,
        'Ejecución real SGA Año 1 en esquema Combinado.'
    ),
    -- Escenario B Año 2 Integrada (Próxima <= 25 días: seq=1 PREPROGRAMADA_MES + seq=2 PROGRAMADA_EXACTA)
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
        'PROGRAMADA_EXACTA',
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
        'PROGRAMADA_EXACTA',
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
        'Pendiente de confirmación de fechas exactas con Example, C.A.'
    ),
    -- Escenario D Parcial / Atrasada (PROGRAMADA_EXACTA vencida)
    (
        '81000000-0000-0000-0000-000000000010',
        '80000000-0000-0000-0000-000000000008',
        1,
        'Programación',
        'PROGRAMADA_EXACTA',
        NULL,
        NULL,
        (CURRENT_DATE - INTERVAL '5 days')::DATE,
        (CURRENT_DATE - INTERVAL '3 days')::DATE,
        'Ventana preliminar vencida sin cierre de asignación.'
    ),
    -- Ciclos futuros multi-anuales (Año +1 y Año +2 en PREPROGRAMADA_MES)
    (
        '81000000-0000-0000-0000-000000000014',
        '80000000-0000-0000-0000-000000000009',
        1,
        'Programación',
        'PREPROGRAMADA_MES',
        EXTRACT(YEAR FROM (CURRENT_DATE + INTERVAL '1 year'))::SMALLINT,
        EXTRACT(MONTH FROM (CURRENT_DATE + INTERVAL '1 year'))::SMALLINT,
        NULL,
        NULL,
        'Preprogramación mensual ciclo futuro Año +1 (SGC).'
    ),
    (
        '81000000-0000-0000-0000-000000000015',
        '80000000-0000-0000-0000-000000000010',
        1,
        'Programación',
        'PREPROGRAMADA_MES',
        EXTRACT(YEAR FROM (CURRENT_DATE + INTERVAL '1 year'))::SMALLINT,
        EXTRACT(MONTH FROM (CURRENT_DATE + INTERVAL '1 year'))::SMALLINT,
        NULL,
        NULL,
        'Preprogramación mensual ciclo futuro Año +1 (SGA).'
    ),
    (
        '81000000-0000-0000-0000-000000000016',
        '80000000-0000-0000-0000-000000000011',
        1,
        'Programación',
        'PREPROGRAMADA_MES',
        EXTRACT(YEAR FROM (CURRENT_DATE + INTERVAL '2 years'))::SMALLINT,
        EXTRACT(MONTH FROM (CURRENT_DATE + INTERVAL '2 years'))::SMALLINT,
        NULL,
        NULL,
        'Preprogramación mensual ciclo futuro Año +2 Renovación (SGC).'
    ),
    (
        '81000000-0000-0000-0000-000000000017',
        '80000000-0000-0000-0000-000000000012',
        1,
        'Programación',
        'PREPROGRAMADA_MES',
        EXTRACT(YEAR FROM (CURRENT_DATE + INTERVAL '2 years'))::SMALLINT,
        EXTRACT(MONTH FROM (CURRENT_DATE + INTERVAL '2 years'))::SMALLINT,
        NULL,
        NULL,
        'Preprogramación mensual ciclo futuro Año +2 Renovación (SGA).'
    ),
    -- Auditoría histórica cerrada (AUD-2023-001: PROGRAMADA_EXACTA + REAL)
    (
        '81000000-0000-0000-0000-000000000018',
        '80000000-0000-0000-0000-000000000013',
        1,
        'Programación',
        'PROGRAMADA_EXACTA',
        NULL,
        NULL,
        (CURRENT_DATE - INTERVAL '18 months')::DATE,
        (CURRENT_DATE - INTERVAL '18 months' + INTERVAL '2 days')::DATE,
        'Programación exacta Etapa 1 histórica.'
    ),
    (
        '81000000-0000-0000-0000-000000000019',
        '80000000-0000-0000-0000-000000000013',
        2,
        'Programación',
        'REAL',
        NULL,
        NULL,
        (CURRENT_DATE - INTERVAL '18 months')::DATE,
        (CURRENT_DATE - INTERVAL '18 months' + INTERVAL '2 days')::DATE,
        'Ejecución real Etapa 1 histórica completada.'
    ),
    -- Auditoría histórica revisada QA (AUD-2022-001: PROGRAMADA_EXACTA + REAL)
    (
        '81000000-0000-0000-0000-000000000020',
        '80000000-0000-0000-0000-000000000014',
        1,
        'Programación',
        'PROGRAMADA_EXACTA',
        NULL,
        NULL,
        (CURRENT_DATE - INTERVAL '30 months')::DATE,
        (CURRENT_DATE - INTERVAL '30 months' + INTERVAL '2 days')::DATE,
        'Programación exacta Etapa 2 histórica.'
    ),
    (
        '81000000-0000-0000-0000-000000000021',
        '80000000-0000-0000-0000-000000000014',
        2,
        'Programación',
        'REAL',
        NULL,
        NULL,
        (CURRENT_DATE - INTERVAL '30 months')::DATE,
        (CURRENT_DATE - INTERVAL '30 months' + INTERVAL '2 days')::DATE,
        'Ejecución real Etapa 2 histórica completada.'
    ),
    -- Fechas REALES discretas Step 1.1 (AUD-ALM-2026-010: 2026-11-18, 2026-11-19, 2026-11-20)
    (
        '81000000-0000-0000-0000-000000000101',
        '80000000-0000-0000-0000-000000000110',
        1,
        'Programación',
        'REAL',
        NULL,
        NULL,
        '2026-11-18',
        '2026-11-18',
        'Día real 1 de auditoría en 4º sitio.'
    ),
    (
        '81000000-0000-0000-0000-000000000102',
        '80000000-0000-0000-0000-000000000110',
        2,
        'Programación',
        'REAL',
        NULL,
        NULL,
        '2026-11-19',
        '2026-11-19',
        'Día real 2 de auditoría en 4º sitio.'
    ),
    (
        '81000000-0000-0000-0000-000000000103',
        '80000000-0000-0000-0000-000000000110',
        3,
        'Programación',
        'REAL',
        NULL,
        NULL,
        '2026-11-20',
        '2026-11-20',
        'Día real 3 de auditoría en 4º sitio (base +15d Plan / +45d Cierre).'
    ),
    -- Paso 3.2: Fechas históricas, recientes, en curso y futuras (+1/+2)
    -- AUD-2022-002 (Histórico 2022 SGC -40 meses)
    ('81000000-0000-0000-0000-000000000022', '80000000-0000-0000-0000-000000000015', 1, 'Programación', 'PROGRAMADA_EXACTA', NULL, NULL, (CURRENT_DATE - INTERVAL '40 months')::DATE, (CURRENT_DATE - INTERVAL '40 months' + INTERVAL '4 days')::DATE, 'Programación exacta Etapa 2 histórica 1.er ciclo SGC.'),
    ('81000000-0000-0000-0000-000000000023', '80000000-0000-0000-0000-000000000015', 2, 'Programación', 'REAL', NULL, NULL, (CURRENT_DATE - INTERVAL '40 months')::DATE, (CURRENT_DATE - INTERVAL '40 months' + INTERVAL '4 days')::DATE, 'Ejecución real Etapa 2 histórica 1.er ciclo SGC.'),
    -- AUD-2023-002 (Histórico 2023 SGC -28 meses)
    ('81000000-0000-0000-0000-000000000024', '80000000-0000-0000-0000-000000000016', 1, 'Programación', 'PROGRAMADA_EXACTA', NULL, NULL, (CURRENT_DATE - INTERVAL '28 months')::DATE, (CURRENT_DATE - INTERVAL '28 months' + INTERVAL '3 days')::DATE, 'Programación exacta Seguimiento 1 histórico SGC.'),
    ('81000000-0000-0000-0000-000000000025', '80000000-0000-0000-0000-000000000016', 2, 'Programación', 'REAL', NULL, NULL, (CURRENT_DATE - INTERVAL '28 months')::DATE, (CURRENT_DATE - INTERVAL '28 months' + INTERVAL '3 days')::DATE, 'Ejecución real Seguimiento 1 histórico SGC.'),
    -- AUD-2022-003 (Histórico 2022 SGA -46 meses)
    ('81000000-0000-0000-0000-000000000026', '80000000-0000-0000-0000-000000000017', 1, 'Programación', 'PROGRAMADA_EXACTA', NULL, NULL, (CURRENT_DATE - INTERVAL '46 months')::DATE, (CURRENT_DATE - INTERVAL '46 months' + INTERVAL '3 days')::DATE, 'Programación exacta Etapa 2 histórica 1.er ciclo SGA.'),
    ('81000000-0000-0000-0000-000000000027', '80000000-0000-0000-0000-000000000017', 2, 'Programación', 'REAL', NULL, NULL, (CURRENT_DATE - INTERVAL '46 months')::DATE, (CURRENT_DATE - INTERVAL '46 months' + INTERVAL '3 days')::DATE, 'Ejecución real Etapa 2 histórica 1.er ciclo SGA.'),
    -- AUD-2025-003 (Renovación SGA -10 meses, Cerrada revisado = FALSE)
    ('81000000-0000-0000-0000-000000000028', '80000000-0000-0000-0000-000000000018', 1, 'Programación', 'PROGRAMADA_EXACTA', NULL, NULL, (CURRENT_DATE - INTERVAL '10 months')::DATE, (CURRENT_DATE - INTERVAL '10 months' + INTERVAL '3 days')::DATE, 'Programación exacta Renovación SGA Iberometal.'),
    ('81000000-0000-0000-0000-000000000029', '80000000-0000-0000-0000-000000000018', 2, 'Programación', 'REAL', NULL, NULL, (CURRENT_DATE - INTERVAL '10 months')::DATE, (CURRENT_DATE - INTERVAL '10 months' + INTERVAL '3 days')::DATE, 'Ejecución real Renovación SGA Iberometal en espera QA.'),
    -- AUD-2025-004 (Etapa 2 SST reciente -12 días, Auditada en ventana +15d/+45d)
    ('81000000-0000-0000-0000-000000000030', '80000000-0000-0000-0000-000000000019', 1, 'Programación', 'PROGRAMADA_EXACTA', NULL, NULL, (CURRENT_DATE - INTERVAL '12 days')::DATE, (CURRENT_DATE - INTERVAL '9 days')::DATE, 'Programación exacta Etapa 2 SST Iberometal.'),
    ('81000000-0000-0000-0000-000000000031', '80000000-0000-0000-0000-000000000019', 2, 'Programación', 'REAL', NULL, NULL, (CURRENT_DATE - INTERVAL '12 days')::DATE, (CURRENT_DATE - INTERVAL '9 days')::DATE, 'Ejecución real reciente Etapa 2 SST Iberometal.'),
    -- AUD-2026-006 y AUD-2026-007 (Borrador +4 meses PREPROGRAMADA_MES)
    ('81000000-0000-0000-0000-000000000032', '80000000-0000-0000-0000-000000000020', 1, 'Programación', 'PREPROGRAMADA_MES', EXTRACT(YEAR FROM (CURRENT_DATE + INTERVAL '4 months'))::SMALLINT, EXTRACT(MONTH FROM (CURRENT_DATE + INTERVAL '4 months'))::SMALLINT, NULL, NULL, 'Preprogramación mensual Borrador SGA Seguimiento 1.'),
    ('81000000-0000-0000-0000-000000000033', '80000000-0000-0000-0000-000000000021', 1, 'Programación', 'PREPROGRAMADA_MES', EXTRACT(YEAR FROM (CURRENT_DATE + INTERVAL '4 months'))::SMALLINT, EXTRACT(MONTH FROM (CURRENT_DATE + INTERVAL '4 months'))::SMALLINT, NULL, NULL, 'Preprogramación mensual Borrador SST Seguimiento 1.'),
    -- AUD-2026-008 (Programada +35 días PROGRAMADA_EXACTA)
    ('81000000-0000-0000-0000-000000000034', '80000000-0000-0000-0000-000000000022', 1, 'Programación', 'PROGRAMADA_EXACTA', NULL, NULL, (CURRENT_DATE + INTERVAL '35 days')::DATE, (CURRENT_DATE + INTERVAL '36 days')::DATE, 'Fecha exacta confirmada Seguimiento 1 SST Example.'),
    -- AUD-2026-009 (En Ejecución CURRENT_DATE - 1d .. + 1d PROGRAMADA_EXACTA)
    ('81000000-0000-0000-0000-000000000035', '80000000-0000-0000-0000-000000000023', 1, 'Programación', 'PROGRAMADA_EXACTA', NULL, NULL, (CURRENT_DATE - INTERVAL '1 day')::DATE, (CURRENT_DATE + INTERVAL '1 day')::DATE, 'Ejecución en curso de campaña SGC Iberometal.'),
    -- Futuras preventivas VINC-N1-02 (Año +1 / Año +2 PREPROGRAMADA_MES)
    ('81000000-0000-0000-0000-000000000036', '80000000-0000-0000-0000-000000000024', 1, 'Programación', 'PREPROGRAMADA_MES', EXTRACT(YEAR FROM (CURRENT_DATE + INTERVAL '1 year'))::SMALLINT, EXTRACT(MONTH FROM (CURRENT_DATE + INTERVAL '1 year'))::SMALLINT, NULL, NULL, 'Preprogramación mensual ciclo futuro Año +1 (SGA VINC-N1-02).'),
    ('81000000-0000-0000-0000-000000000037', '80000000-0000-0000-0000-000000000025', 1, 'Programación', 'PREPROGRAMADA_MES', EXTRACT(YEAR FROM (CURRENT_DATE + INTERVAL '1 year'))::SMALLINT, EXTRACT(MONTH FROM (CURRENT_DATE + INTERVAL '1 year'))::SMALLINT, NULL, NULL, 'Preprogramación mensual ciclo futuro Año +1 (SST VINC-N1-02).'),
    ('81000000-0000-0000-0000-000000000038', '80000000-0000-0000-0000-000000000026', 1, 'Programación', 'PREPROGRAMADA_MES', EXTRACT(YEAR FROM (CURRENT_DATE + INTERVAL '2 years'))::SMALLINT, EXTRACT(MONTH FROM (CURRENT_DATE + INTERVAL '2 years'))::SMALLINT, NULL, NULL, 'Preprogramación mensual ciclo futuro Año +2 Renovación (SGA VINC-N1-02).'),
    ('81000000-0000-0000-0000-000000000039', '80000000-0000-0000-0000-000000000027', 1, 'Programación', 'PREPROGRAMADA_MES', EXTRACT(YEAR FROM (CURRENT_DATE + INTERVAL '2 years'))::SMALLINT, EXTRACT(MONTH FROM (CURRENT_DATE + INTERVAL '2 years'))::SMALLINT, NULL, NULL, 'Preprogramación mensual ciclo futuro Año +2 Renovación (SST VINC-N1-02).'),
    -- Futuras preventivas VINC-N2-01 (Año +1 / Año +2 PREPROGRAMADA_MES)
    ('81000000-0000-0000-0000-000000000040', '80000000-0000-0000-0000-000000000028', 1, 'Programación', 'PREPROGRAMADA_MES', EXTRACT(YEAR FROM (CURRENT_DATE + INTERVAL '1 year'))::SMALLINT, EXTRACT(MONTH FROM (CURRENT_DATE + INTERVAL '1 year'))::SMALLINT, NULL, NULL, 'Preprogramación mensual ciclo futuro Año +1 (Iberometal SGC VINC-N2-01).'),
    ('81000000-0000-0000-0000-000000000041', '80000000-0000-0000-0000-000000000029', 1, 'Programación', 'PREPROGRAMADA_MES', EXTRACT(YEAR FROM (CURRENT_DATE + INTERVAL '1 year'))::SMALLINT, EXTRACT(MONTH FROM (CURRENT_DATE + INTERVAL '1 year'))::SMALLINT, NULL, NULL, 'Preprogramación mensual ciclo futuro Año +1 (Example Logística VINC-N2-01).'),
    ('81000000-0000-0000-0000-000000000042', '80000000-0000-0000-0000-000000000030', 1, 'Programación', 'PREPROGRAMADA_MES', EXTRACT(YEAR FROM (CURRENT_DATE + INTERVAL '2 years'))::SMALLINT, EXTRACT(MONTH FROM (CURRENT_DATE + INTERVAL '2 years'))::SMALLINT, NULL, NULL, 'Preprogramación mensual ciclo futuro Año +2 (Iberometal SGC VINC-N2-01).'),
    ('81000000-0000-0000-0000-000000000043', '80000000-0000-0000-0000-000000000031', 1, 'Programación', 'PREPROGRAMADA_MES', EXTRACT(YEAR FROM (CURRENT_DATE + INTERVAL '2 years'))::SMALLINT, EXTRACT(MONTH FROM (CURRENT_DATE + INTERVAL '2 years'))::SMALLINT, NULL, NULL, 'Preprogramación mensual ciclo futuro Año +2 (Example Logística VINC-N2-01).'),
    -- Futuras preventivas VINC-IND-02 (Año +1 / Año +2 PREPROGRAMADA_MES)
    ('81000000-0000-0000-0000-000000000044', '80000000-0000-0000-0000-000000000032', 1, 'Programación', 'PREPROGRAMADA_MES', EXTRACT(YEAR FROM (CURRENT_DATE + INTERVAL '1 year'))::SMALLINT, EXTRACT(MONTH FROM (CURRENT_DATE + INTERVAL '1 year'))::SMALLINT, NULL, NULL, 'Preprogramación mensual ciclo futuro Año +1 (SST VINC-IND-02).'),
    ('81000000-0000-0000-0000-000000000045', '80000000-0000-0000-0000-000000000033', 1, 'Programación', 'PREPROGRAMADA_MES', EXTRACT(YEAR FROM (CURRENT_DATE + INTERVAL '2 years'))::SMALLINT, EXTRACT(MONTH FROM (CURRENT_DATE + INTERVAL '2 years'))::SMALLINT, NULL, NULL, 'Preprogramación mensual ciclo futuro Año +2 (SST VINC-IND-02).')
ON CONFLICT (id_auditoria, numero_secuencia) WHERE deleted_at IS NULL DO UPDATE SET
    tag = EXCLUDED.tag,
    tipo_fecha = EXCLUDED.tipo_fecha,
    anio = EXCLUDED.anio,
    mes = EXCLUDED.mes,
    fecha_inicio = EXCLUDED.fecha_inicio,
    fecha_fin = EXCLUDED.fecha_fin,
    observacion = EXCLUDED.observacion,
    updated_at = NOW();

-- 20b. Turnos por Sitio en Auditoría (pasadas, en curso y futuras +1/+2; oficinas comerciales solo T4)
INSERT INTO public.turnos_sitio_auditoria (id, id_sitios_por_auditoria, id_turnos_por_sitio) VALUES
    ('95000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000000', '71000000-0000-0000-0000-000000000000'), -- AUD-2024 Sitio 0 T1
    ('95000000-0000-0000-0000-000000000002', '90000000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-000000000001'), -- AUD-2024 Sitio 1 T1
    ('95000000-0000-0000-0000-000000000003', '90000000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-000000000002'), -- AUD-2024 Sitio 1 T2
    ('95000000-0000-0000-0000-000000000004', '90000000-0000-0000-0000-000000000004', '71000000-0000-0000-0000-000000000004'), -- Escenario B QMS T1
    ('95000000-0000-0000-0000-000000000005', '90000000-0000-0000-0000-000000000004', '71000000-0000-0000-0000-000000000005'), -- Escenario B QMS T2
    ('95000000-0000-0000-0000-000000000006', '90000000-0000-0000-0000-000000000005', '71000000-0000-0000-0000-000000000006'), -- Escenario B EMS T1
    ('95000000-0000-0000-0000-000000000007', '90000000-0000-0000-0000-000000000008', '71000000-0000-0000-0000-000000000007'), -- Escenario D SST T1
    -- Escenario B Año 1, Multientidad N2 e Históricas base
    ('95000000-0000-0000-0000-000000000010', '90000000-0000-0000-0000-000000000002', '71000000-0000-0000-0000-000000000004'), -- AUD-2025-001 HQ T1
    ('95000000-0000-0000-0000-000000000011', '90000000-0000-0000-0000-000000000002', '71000000-0000-0000-0000-000000000005'), -- AUD-2025-001 HQ T2
    ('95000000-0000-0000-0000-000000000012', '90000000-0000-0000-0000-000000000003', '71000000-0000-0000-0000-000000000006'), -- AUD-2025-002 HQ T1
    ('95000000-0000-0000-0000-000000000013', '90000000-0000-0000-0000-000000000075', '71000000-0000-0000-0000-000000000000'), -- AUD-2026-003 Sitio 0 T1
    ('95000000-0000-0000-0000-000000000014', '90000000-0000-0000-0000-000000000075', '71000000-0000-0000-0000-000000000010'), -- AUD-2026-003 Sitio 0 T2
    ('95000000-0000-0000-0000-000000000015', '90000000-0000-0000-0000-000000000006', '71000000-0000-0000-0000-000000000001'), -- AUD-2026-003 Sitio 1 T1
    ('95000000-0000-0000-0000-000000000016', '90000000-0000-0000-0000-000000000007', '71000000-0000-0000-0000-000000000080'), -- AUD-2026-004 Logística T5
    ('95000000-0000-0000-0000-000000000017', '90000000-0000-0000-0000-000000000009', '71000000-0000-0000-0000-000000000000'), -- AUD-2023-001 HQ T1
    ('95000000-0000-0000-0000-000000000018', '90000000-0000-0000-0000-000000000010', '71000000-0000-0000-0000-000000000003'), -- AUD-2022-001 Chacao T1
    -- Futuras VINC-N1-01 (AUD-2027-001/002 y AUD-2028-001/002)
    ('95000000-0000-0000-0000-000000000019', '90000000-0000-0000-0000-000000000076', '71000000-0000-0000-0000-000000000004'), -- AUD-2027-001 HQ T1
    ('95000000-0000-0000-0000-000000000020', '90000000-0000-0000-0000-000000000076', '71000000-0000-0000-0000-000000000005'), -- AUD-2027-001 HQ T2
    ('95000000-0000-0000-0000-000000000021', '90000000-0000-0000-0000-000000000080', '71000000-0000-0000-0000-000000000052'), -- AUD-2027-001 Cagua T1
    ('95000000-0000-0000-0000-000000000022', '90000000-0000-0000-0000-000000000081', '71000000-0000-0000-0000-000000000054'), -- AUD-2027-001 Caracas T4 Admin
    ('95000000-0000-0000-0000-000000000023', '90000000-0000-0000-0000-000000000077', '71000000-0000-0000-0000-000000000006'), -- AUD-2027-002 HQ T1
    ('95000000-0000-0000-0000-000000000024', '90000000-0000-0000-0000-000000000077', '71000000-0000-0000-0000-000000000060'), -- AUD-2027-002 HQ T2
    ('95000000-0000-0000-0000-000000000025', '90000000-0000-0000-0000-000000000082', '71000000-0000-0000-0000-000000000062'), -- AUD-2027-002 Cagua SGA T1
    ('95000000-0000-0000-0000-000000000026', '90000000-0000-0000-0000-000000000083', '71000000-0000-0000-0000-000000000064'), -- AUD-2027-002 Maracay T4 Admin
    ('95000000-0000-0000-0000-000000000027', '90000000-0000-0000-0000-000000000078', '71000000-0000-0000-0000-000000000004'), -- AUD-2028-001 HQ T1
    ('95000000-0000-0000-0000-000000000028', '90000000-0000-0000-0000-000000000078', '71000000-0000-0000-0000-000000000005'), -- AUD-2028-001 HQ T2
    ('95000000-0000-0000-0000-000000000029', '90000000-0000-0000-0000-000000000084', '71000000-0000-0000-0000-000000000052'), -- AUD-2028-001 Cagua T1
    ('95000000-0000-0000-0000-000000000030', '90000000-0000-0000-0000-000000000085', '71000000-0000-0000-0000-000000000054'), -- AUD-2028-001 Caracas T4 Admin
    ('95000000-0000-0000-0000-000000000031', '90000000-0000-0000-0000-000000000079', '71000000-0000-0000-0000-000000000006'), -- AUD-2028-002 HQ T1
    ('95000000-0000-0000-0000-000000000032', '90000000-0000-0000-0000-000000000079', '71000000-0000-0000-0000-000000000060'), -- AUD-2028-002 HQ T2
    ('95000000-0000-0000-0000-000000000033', '90000000-0000-0000-0000-000000000086', '71000000-0000-0000-0000-000000000062'), -- AUD-2028-002 Cagua SGA T1
    ('95000000-0000-0000-0000-000000000034', '90000000-0000-0000-0000-000000000087', '71000000-0000-0000-0000-000000000064'), -- AUD-2028-002 Maracay T4 Admin
    -- Históricas y Recientes (AUD-2022-002..AUD-2025-004)
    ('95000000-0000-0000-0000-000000000035', '90000000-0000-0000-0000-000000000011', '71000000-0000-0000-0000-000000000000'), -- AUD-2022-002 HQ T1
    ('95000000-0000-0000-0000-000000000036', '90000000-0000-0000-0000-000000000011', '71000000-0000-0000-0000-000000000010'), -- AUD-2022-002 HQ T2
    ('95000000-0000-0000-0000-000000000037', '90000000-0000-0000-0000-000000000011', '71000000-0000-0000-0000-000000000011'), -- AUD-2022-002 HQ T3
    ('95000000-0000-0000-0000-000000000038', '90000000-0000-0000-0000-000000000012', '71000000-0000-0000-0000-000000000001'), -- AUD-2022-002 Valencia T1
    ('95000000-0000-0000-0000-000000000039', '90000000-0000-0000-0000-000000000012', '71000000-0000-0000-0000-000000000002'), -- AUD-2022-002 Valencia T2
    ('95000000-0000-0000-0000-000000000040', '90000000-0000-0000-0000-000000000013', '71000000-0000-0000-0000-000000000014'), -- AUD-2022-002 Guacara T5
    ('95000000-0000-0000-0000-000000000041', '90000000-0000-0000-0000-000000000014', '71000000-0000-0000-0000-000000000016'), -- AUD-2022-002 Caracas T4 Admin
    ('95000000-0000-0000-0000-000000000042', '90000000-0000-0000-0000-000000000015', '71000000-0000-0000-0000-000000000000'), -- AUD-2023-002 HQ T1
    ('95000000-0000-0000-0000-000000000043', '90000000-0000-0000-0000-000000000016', '71000000-0000-0000-0000-000000000001'), -- AUD-2023-002 Valencia T1
    ('95000000-0000-0000-0000-000000000044', '90000000-0000-0000-0000-000000000017', '71000000-0000-0000-0000-000000000014'), -- AUD-2023-002 Guacara T5
    ('95000000-0000-0000-0000-000000000045', '90000000-0000-0000-0000-000000000018', '71000000-0000-0000-0000-000000000016'), -- AUD-2023-002 Caracas T4 Admin
    ('95000000-0000-0000-0000-000000000046', '90000000-0000-0000-0000-000000000019', '71000000-0000-0000-0000-000000000020'), -- AUD-2022-003 SGA HQ T1
    ('95000000-0000-0000-0000-000000000047', '90000000-0000-0000-0000-000000000019', '71000000-0000-0000-0000-000000000021'), -- AUD-2022-003 SGA HQ T2
    ('95000000-0000-0000-0000-000000000048', '90000000-0000-0000-0000-000000000020', '71000000-0000-0000-0000-000000000024'), -- AUD-2022-003 SGA Sur T1
    ('95000000-0000-0000-0000-000000000049', '90000000-0000-0000-0000-000000000021', '71000000-0000-0000-0000-000000000026'), -- AUD-2022-003 SGA Guacara T5
    ('95000000-0000-0000-0000-000000000050', '90000000-0000-0000-0000-000000000022', '71000000-0000-0000-0000-000000000020'), -- AUD-2025-003 SGA HQ T1
    ('95000000-0000-0000-0000-000000000051', '90000000-0000-0000-0000-000000000022', '71000000-0000-0000-0000-000000000023'), -- AUD-2025-003 SGA HQ T6
    ('95000000-0000-0000-0000-000000000052', '90000000-0000-0000-0000-000000000023', '71000000-0000-0000-0000-000000000024'), -- AUD-2025-003 SGA Sur T1
    ('95000000-0000-0000-0000-000000000053', '90000000-0000-0000-0000-000000000024', '71000000-0000-0000-0000-000000000027'), -- AUD-2025-003 SGA Guacara T4
    ('95000000-0000-0000-0000-000000000054', '90000000-0000-0000-0000-000000000025', '71000000-0000-0000-0000-000000000030'), -- AUD-2025-004 SST HQ T1
    ('95000000-0000-0000-0000-000000000055', '90000000-0000-0000-0000-000000000025', '71000000-0000-0000-0000-000000000031'), -- AUD-2025-004 SST HQ T2
    ('95000000-0000-0000-0000-000000000056', '90000000-0000-0000-0000-000000000025', '71000000-0000-0000-0000-000000000033'), -- AUD-2025-004 SST HQ T6
    ('95000000-0000-0000-0000-000000000057', '90000000-0000-0000-0000-000000000026', '71000000-0000-0000-0000-000000000034'), -- AUD-2025-004 SST Prensas T1
    ('95000000-0000-0000-0000-000000000058', '90000000-0000-0000-0000-000000000027', '71000000-0000-0000-0000-000000000036'), -- AUD-2025-004 SST Caracas T4 Admin
    -- Ciclo actual Borrador / Programada / En Ejecución (AUD-2026-006..009)
    ('95000000-0000-0000-0000-000000000059', '90000000-0000-0000-0000-000000000028', '71000000-0000-0000-0000-000000000020'), -- AUD-2026-006 SGA HQ T1
    ('95000000-0000-0000-0000-000000000060', '90000000-0000-0000-0000-000000000029', '71000000-0000-0000-0000-000000000024'), -- AUD-2026-006 SGA Sur T1
    ('95000000-0000-0000-0000-000000000061', '90000000-0000-0000-0000-000000000030', '71000000-0000-0000-0000-000000000026'), -- AUD-2026-006 SGA Guacara T5
    ('95000000-0000-0000-0000-000000000062', '90000000-0000-0000-0000-000000000031', '71000000-0000-0000-0000-000000000030'), -- AUD-2026-007 SST HQ T1
    ('95000000-0000-0000-0000-000000000063', '90000000-0000-0000-0000-000000000032', '71000000-0000-0000-0000-000000000034'), -- AUD-2026-007 SST Prensas T1
    ('95000000-0000-0000-0000-000000000064', '90000000-0000-0000-0000-000000000033', '71000000-0000-0000-0000-000000000036'), -- AUD-2026-007 SST Caracas T4 Admin
    ('95000000-0000-0000-0000-000000000065', '90000000-0000-0000-0000-000000000034', '71000000-0000-0000-0000-000000000007'), -- AUD-2026-008 SST Example T1
    ('95000000-0000-0000-0000-000000000066', '90000000-0000-0000-0000-000000000034', '71000000-0000-0000-0000-000000000070'), -- AUD-2026-008 SST Example T2
    ('95000000-0000-0000-0000-000000000067', '90000000-0000-0000-0000-000000000035', '71000000-0000-0000-0000-000000000000'), -- AUD-2026-009 HQ T1
    ('95000000-0000-0000-0000-000000000068', '90000000-0000-0000-0000-000000000035', '71000000-0000-0000-0000-000000000010'), -- AUD-2026-009 HQ T2
    ('95000000-0000-0000-0000-000000000069', '90000000-0000-0000-0000-000000000036', '71000000-0000-0000-0000-000000000001'), -- AUD-2026-009 Valencia T1
    ('95000000-0000-0000-0000-000000000070', '90000000-0000-0000-0000-000000000036', '71000000-0000-0000-0000-000000000002'), -- AUD-2026-009 Valencia T2
    ('95000000-0000-0000-0000-000000000071', '90000000-0000-0000-0000-000000000037', '71000000-0000-0000-0000-000000000014'), -- AUD-2026-009 Guacara T5
    ('95000000-0000-0000-0000-000000000072', '90000000-0000-0000-0000-000000000038', '71000000-0000-0000-0000-000000000016'), -- AUD-2026-009 Caracas T4 Admin
    -- Ciclos Futuros Preventivos Año +1 / Año +2 (AUD-2027-003..007 y AUD-2028-003..007)
    ('95000000-0000-0000-0000-000000000073', '90000000-0000-0000-0000-000000000039', '71000000-0000-0000-0000-000000000020'), -- AUD-2027-003 SGA HQ T1
    ('95000000-0000-0000-0000-000000000074', '90000000-0000-0000-0000-000000000040', '71000000-0000-0000-0000-000000000024'), -- AUD-2027-003 SGA Sur T1
    ('95000000-0000-0000-0000-000000000075', '90000000-0000-0000-0000-000000000041', '71000000-0000-0000-0000-000000000026'), -- AUD-2027-003 SGA Guacara T5
    ('95000000-0000-0000-0000-000000000076', '90000000-0000-0000-0000-000000000042', '71000000-0000-0000-0000-000000000030'), -- AUD-2027-004 SST HQ T1
    ('95000000-0000-0000-0000-000000000077', '90000000-0000-0000-0000-000000000043', '71000000-0000-0000-0000-000000000034'), -- AUD-2027-004 SST Prensas T1
    ('95000000-0000-0000-0000-000000000078', '90000000-0000-0000-0000-000000000044', '71000000-0000-0000-0000-000000000036'), -- AUD-2027-004 SST Caracas T4 Admin
    ('95000000-0000-0000-0000-000000000079', '90000000-0000-0000-0000-000000000045', '71000000-0000-0000-0000-000000000020'), -- AUD-2028-003 SGA HQ T1
    ('95000000-0000-0000-0000-000000000080', '90000000-0000-0000-0000-000000000046', '71000000-0000-0000-0000-000000000024'), -- AUD-2028-003 SGA Sur T1
    ('95000000-0000-0000-0000-000000000081', '90000000-0000-0000-0000-000000000047', '71000000-0000-0000-0000-000000000026'), -- AUD-2028-003 SGA Guacara T5
    ('95000000-0000-0000-0000-000000000082', '90000000-0000-0000-0000-000000000048', '71000000-0000-0000-0000-000000000030'), -- AUD-2028-004 SST HQ T1
    ('95000000-0000-0000-0000-000000000083', '90000000-0000-0000-0000-000000000049', '71000000-0000-0000-0000-000000000034'), -- AUD-2028-004 SST Prensas T1
    ('95000000-0000-0000-0000-000000000084', '90000000-0000-0000-0000-000000000050', '71000000-0000-0000-0000-000000000036'), -- AUD-2028-004 SST Caracas T4 Admin
    ('95000000-0000-0000-0000-000000000085', '90000000-0000-0000-0000-000000000051', '71000000-0000-0000-0000-000000000000'), -- AUD-2027-005 HQ T1
    ('95000000-0000-0000-0000-000000000086', '90000000-0000-0000-0000-000000000052', '71000000-0000-0000-0000-000000000001'), -- AUD-2027-005 Valencia T1
    ('95000000-0000-0000-0000-000000000087', '90000000-0000-0000-0000-000000000053', '71000000-0000-0000-0000-000000000014'), -- AUD-2027-005 Guacara T5
    ('95000000-0000-0000-0000-000000000088', '90000000-0000-0000-0000-000000000054', '71000000-0000-0000-0000-000000000016'), -- AUD-2027-005 Caracas T4 Admin
    ('95000000-0000-0000-0000-000000000089', '90000000-0000-0000-0000-000000000055', '71000000-0000-0000-0000-000000000080'), -- AUD-2027-006 Logística T5
    ('95000000-0000-0000-0000-000000000090', '90000000-0000-0000-0000-000000000056', '71000000-0000-0000-0000-000000000000'), -- AUD-2028-005 HQ T1
    ('95000000-0000-0000-0000-000000000091', '90000000-0000-0000-0000-000000000057', '71000000-0000-0000-0000-000000000001'), -- AUD-2028-005 Valencia T1
    ('95000000-0000-0000-0000-000000000092', '90000000-0000-0000-0000-000000000058', '71000000-0000-0000-0000-000000000014'), -- AUD-2028-005 Guacara T5
    ('95000000-0000-0000-0000-000000000093', '90000000-0000-0000-0000-000000000059', '71000000-0000-0000-0000-000000000016'), -- AUD-2028-005 Caracas T4 Admin
    ('95000000-0000-0000-0000-000000000094', '90000000-0000-0000-0000-000000000060', '71000000-0000-0000-0000-000000000080'), -- AUD-2028-006 Logística T5
    ('95000000-0000-0000-0000-000000000095', '90000000-0000-0000-0000-000000000061', '71000000-0000-0000-0000-000000000007'), -- AUD-2027-007 Example SST T1
    ('95000000-0000-0000-0000-000000000096', '90000000-0000-0000-0000-000000000062', '71000000-0000-0000-0000-000000000007')  -- AUD-2028-007 Example SST T1
ON CONFLICT (id_sitios_por_auditoria, id_turnos_por_sitio) WHERE deleted_at IS NULL DO NOTHING;

-- 20c. Procesos por Sitio en Auditoría (cobertura en pasadas, activas y futuras +1/+2; preserva 9600...0007 sin auditor)
INSERT INTO public.procesos_sitio_auditoria (id, id_sitios_por_auditoria, id_procesos_por_sitio, id_proceso, notas) VALUES
    ('96000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000000', '61000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000002', 'Entrevista de Dirección en HQ.'),
    ('96000000-0000-0000-0000-000000000002', '90000000-0000-0000-0000-000000000001', '61000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000001', 'Muestreo en líneas de troquelado y fundición.'),
    ('96000000-0000-0000-0000-000000000003', '90000000-0000-0000-0000-000000000004', '61000000-0000-0000-0000-000000000006', '60000000-0000-0000-0000-000000000006', 'Evaluación multi-turno de fabricación integrada.'),
    ('96000000-0000-0000-0000-000000000004', '90000000-0000-0000-0000-000000000004', '61000000-0000-0000-0000-000000000007', '60000000-0000-0000-0000-000000000007', 'Revisión por la Dirección Integrada.'),
    ('96000000-0000-0000-0000-000000000005', '90000000-0000-0000-0000-000000000005', '61000000-0000-0000-0000-000000000008', '60000000-0000-0000-0000-000000000008', 'Verificación de almacenamiento temporal y residuos.'),
    ('96000000-0000-0000-0000-000000000006', '90000000-0000-0000-0000-000000000008', '61000000-0000-0000-0000-000000000009', '60000000-0000-0000-0000-000000000009', 'Proceso SST con evaluador asignado.'),
    ('96000000-0000-0000-0000-000000000007', '90000000-0000-0000-0000-000000000008', '61000000-0000-0000-0000-000000000010', '60000000-0000-0000-0000-000000000010', 'Proceso SST pendiente de asignación de auditor.'),
    -- Escenario B Año 1, Multientidad N2 e Históricas base
    ('96000000-0000-0000-0000-000000000010', '90000000-0000-0000-0000-000000000002', '61000000-0000-0000-0000-000000000006', '60000000-0000-0000-0000-000000000006', 'Fabricación de Estructuras Año 1.'),
    ('96000000-0000-0000-0000-000000000011', '90000000-0000-0000-0000-000000000002', '61000000-0000-0000-0000-000000000038', '60000000-0000-0000-0000-000000000027', 'Diseño de Ingeniería Año 1.'),
    ('96000000-0000-0000-0000-000000000012', '90000000-0000-0000-0000-000000000003', '61000000-0000-0000-0000-000000000008', '60000000-0000-0000-0000-000000000008', 'Residuos Industriales Año 1.'),
    ('96000000-0000-0000-0000-000000000013', '90000000-0000-0000-0000-000000000075', '61000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000002', 'Alta Dirección Renovación Multientidad.'),
    ('96000000-0000-0000-0000-000000000014', '90000000-0000-0000-0000-000000000075', '61000000-0000-0000-0000-000000000011', '60000000-0000-0000-0000-000000000001', 'Troquelado y Fundición HQ Multientidad.'),
    ('96000000-0000-0000-0000-000000000015', '90000000-0000-0000-0000-000000000006', '61000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000001', 'Planta Valencia Multientidad.'),
    ('96000000-0000-0000-0000-000000000016', '90000000-0000-0000-0000-000000000007', '61000000-0000-0000-0000-000000000055', '60000000-0000-0000-0000-000000000037', 'Planificación Logística Example.'),
    ('96000000-0000-0000-0000-000000000017', '90000000-0000-0000-0000-000000000007', '61000000-0000-0000-0000-000000000056', '60000000-0000-0000-0000-000000000038', 'Recepción y Almacenaje Example.'),
    ('96000000-0000-0000-0000-000000000018', '90000000-0000-0000-0000-000000000009', '61000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000002', 'Revisión documental Etapa 1 HQ.'),
    ('96000000-0000-0000-0000-000000000019', '90000000-0000-0000-0000-000000000010', '61000000-0000-0000-0000-000000000005', '60000000-0000-0000-0000-000000000005', 'Gestión de Incidentes y SOC Chacao.'),
    -- Futuras VINC-N1-01 (AUD-2027-001/002 y AUD-2028-001/002)
    ('96000000-0000-0000-0000-000000000020', '90000000-0000-0000-0000-000000000076', '61000000-0000-0000-0000-000000000006', '60000000-0000-0000-0000-000000000006', 'Fabricación Estructuras Seg. 2 Año +1.'),
    ('96000000-0000-0000-0000-000000000021', '90000000-0000-0000-0000-000000000076', '61000000-0000-0000-0000-000000000007', '60000000-0000-0000-0000-000000000007', 'Revisión Dirección Seg. 2 Año +1.'),
    ('96000000-0000-0000-0000-000000000022', '90000000-0000-0000-0000-000000000080', '61000000-0000-0000-0000-000000000042', '60000000-0000-0000-0000-000000000028', 'Granallado y Pintura Cagua Año +1.'),
    ('96000000-0000-0000-0000-000000000023', '90000000-0000-0000-0000-000000000081', '61000000-0000-0000-0000-000000000044', '60000000-0000-0000-0000-000000000027', 'Diseño Ingeniería Caracas Año +1.'),
    ('96000000-0000-0000-0000-000000000024', '90000000-0000-0000-0000-000000000077', '61000000-0000-0000-0000-000000000008', '60000000-0000-0000-0000-000000000008', 'Manejo Residuos SGA Año +1.'),
    ('96000000-0000-0000-0000-000000000025', '90000000-0000-0000-0000-000000000082', '61000000-0000-0000-0000-000000000050', '60000000-0000-0000-0000-000000000032', 'Emisiones Cabinas Cagua Año +1.'),
    ('96000000-0000-0000-0000-000000000026', '90000000-0000-0000-0000-000000000083', '61000000-0000-0000-0000-000000000052', '60000000-0000-0000-0000-000000000034', 'Gestión Documental SGA Maracay Año +1.'),
    ('96000000-0000-0000-0000-000000000027', '90000000-0000-0000-0000-000000000078', '61000000-0000-0000-0000-000000000006', '60000000-0000-0000-0000-000000000006', 'Fabricación Estructuras Renovación Año +2.'),
    ('96000000-0000-0000-0000-000000000028', '90000000-0000-0000-0000-000000000084', '61000000-0000-0000-0000-000000000042', '60000000-0000-0000-0000-000000000028', 'Granallado Cagua Renovación Año +2.'),
    ('96000000-0000-0000-0000-000000000029', '90000000-0000-0000-0000-000000000085', '61000000-0000-0000-0000-000000000045', '60000000-0000-0000-0000-000000000029', 'Licitaciones Caracas Renovación Año +2.'),
    ('96000000-0000-0000-0000-000000000030', '90000000-0000-0000-0000-000000000079', '61000000-0000-0000-0000-000000000008', '60000000-0000-0000-0000-000000000008', 'Manejo Residuos Renovación Año +2.'),
    ('96000000-0000-0000-0000-000000000031', '90000000-0000-0000-0000-000000000086', '61000000-0000-0000-0000-000000000050', '60000000-0000-0000-0000-000000000032', 'Emisiones Cagua Renovación Año +2.'),
    ('96000000-0000-0000-0000-000000000032', '90000000-0000-0000-0000-000000000087', '61000000-0000-0000-0000-000000000052', '60000000-0000-0000-0000-000000000034', 'Gestión Documental Maracay Renovación Año +2.'),
    -- Históricas y Recientes (AUD-2022-002..AUD-2025-004)
    ('96000000-0000-0000-0000-000000000033', '90000000-0000-0000-0000-000000000011', '61000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000002', 'Dirección Estratégica Etapa 2 1.er ciclo.'),
    ('96000000-0000-0000-0000-000000000034', '90000000-0000-0000-0000-000000000011', '61000000-0000-0000-0000-000000000013', '60000000-0000-0000-0000-000000000011', 'Control Metalúrgico HQ 1.er ciclo.'),
    ('96000000-0000-0000-0000-000000000035', '90000000-0000-0000-0000-000000000012', '61000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000001', 'Troquelado Valencia 1.er ciclo.'),
    ('96000000-0000-0000-0000-000000000036', '90000000-0000-0000-0000-000000000013', '61000000-0000-0000-0000-000000000017', '60000000-0000-0000-0000-000000000003', 'Logística Guacara 1.er ciclo.'),
    ('96000000-0000-0000-0000-000000000037', '90000000-0000-0000-0000-000000000014', '61000000-0000-0000-0000-000000000018', '60000000-0000-0000-0000-000000000013', 'Comercial Caracas 1.er ciclo.'),
    ('96000000-0000-0000-0000-000000000038', '90000000-0000-0000-0000-000000000015', '61000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000002', 'Dirección Estratégica Seg. 1 2023.'),
    ('96000000-0000-0000-0000-000000000039', '90000000-0000-0000-0000-000000000016', '61000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000001', 'Troquelado Valencia Seg. 1 2023.'),
    ('96000000-0000-0000-0000-000000000040', '90000000-0000-0000-0000-000000000017', '61000000-0000-0000-0000-000000000017', '60000000-0000-0000-0000-000000000003', 'Logística Guacara Seg. 1 2023.'),
    ('96000000-0000-0000-0000-000000000041', '90000000-0000-0000-0000-000000000018', '61000000-0000-0000-0000-000000000018', '60000000-0000-0000-0000-000000000013', 'Comercial Caracas Seg. 1 2023.'),
    ('96000000-0000-0000-0000-000000000042', '90000000-0000-0000-0000-000000000019', '61000000-0000-0000-0000-000000000004', '60000000-0000-0000-0000-000000000004', 'Efluentes y Emisiones HQ SGA 2022.'),
    ('96000000-0000-0000-0000-000000000043', '90000000-0000-0000-0000-000000000020', '61000000-0000-0000-0000-000000000023', '60000000-0000-0000-0000-000000000015', 'Residuos Peligrosos Sur SGA 2022.'),
    ('96000000-0000-0000-0000-000000000044', '90000000-0000-0000-0000-000000000021', '61000000-0000-0000-0000-000000000025', '60000000-0000-0000-0000-000000000017', 'Acopio Químicos Guacara SGA 2022.'),
    ('96000000-0000-0000-0000-000000000045', '90000000-0000-0000-0000-000000000022', '61000000-0000-0000-0000-000000000004', '60000000-0000-0000-0000-000000000004', 'Efluentes HQ Renovación SGA 2025.'),
    ('96000000-0000-0000-0000-000000000046', '90000000-0000-0000-0000-000000000023', '61000000-0000-0000-0000-000000000023', '60000000-0000-0000-0000-000000000015', 'Residuos Sur Renovación SGA 2025.'),
    ('96000000-0000-0000-0000-000000000047', '90000000-0000-0000-0000-000000000024', '61000000-0000-0000-0000-000000000025', '60000000-0000-0000-0000-000000000017', 'Acopio Guacara Renovación SGA 2025.'),
    ('96000000-0000-0000-0000-000000000048', '90000000-0000-0000-0000-000000000025', '61000000-0000-0000-0000-000000000026', '60000000-0000-0000-0000-000000000018', 'Liderazgo SST HQ Etapa 2.'),
    ('96000000-0000-0000-0000-000000000049', '90000000-0000-0000-0000-000000000025', '61000000-0000-0000-0000-000000000027', '60000000-0000-0000-0000-000000000019', 'Control Prensas HQ Etapa 2.'),
    ('96000000-0000-0000-0000-000000000050', '90000000-0000-0000-0000-000000000026', '61000000-0000-0000-0000-000000000031', '60000000-0000-0000-0000-000000000019', 'Riesgos Prensas Valencia Etapa 2.'),
    ('96000000-0000-0000-0000-000000000051', '90000000-0000-0000-0000-000000000027', '61000000-0000-0000-0000-000000000033', '60000000-0000-0000-0000-000000000022', 'Vigilancia Médica Caracas Etapa 2.'),
    -- Ciclo actual Borrador / Programada / En Ejecución (AUD-2026-006..009)
    ('96000000-0000-0000-0000-000000000052', '90000000-0000-0000-0000-000000000028', '61000000-0000-0000-0000-000000000004', '60000000-0000-0000-0000-000000000004', 'Efluentes HQ Borrador SGA.'),
    ('96000000-0000-0000-0000-000000000053', '90000000-0000-0000-0000-000000000029', '61000000-0000-0000-0000-000000000023', '60000000-0000-0000-0000-000000000015', 'Residuos Sur Borrador SGA.'),
    ('96000000-0000-0000-0000-000000000054', '90000000-0000-0000-0000-000000000030', '61000000-0000-0000-0000-000000000025', '60000000-0000-0000-0000-000000000017', 'Acopio Guacara Borrador SGA.'),
    ('96000000-0000-0000-0000-000000000055', '90000000-0000-0000-0000-000000000031', '61000000-0000-0000-0000-000000000026', '60000000-0000-0000-0000-000000000018', 'Liderazgo SST HQ Borrador.'),
    ('96000000-0000-0000-0000-000000000056', '90000000-0000-0000-0000-000000000032', '61000000-0000-0000-0000-000000000031', '60000000-0000-0000-0000-000000000019', 'Prensas Valencia Borrador SST.'),
    ('96000000-0000-0000-0000-000000000057', '90000000-0000-0000-0000-000000000033', '61000000-0000-0000-0000-000000000033', '60000000-0000-0000-0000-000000000022', 'Vigilancia Caracas Borrador SST.'),
    ('96000000-0000-0000-0000-000000000058', '90000000-0000-0000-0000-000000000034', '61000000-0000-0000-0000-000000000009', '60000000-0000-0000-0000-000000000009', 'Riesgos Mecánicos Programada Example.'),
    ('96000000-0000-0000-0000-000000000059', '90000000-0000-0000-0000-000000000034', '61000000-0000-0000-0000-000000000053', '60000000-0000-0000-0000-000000000035', 'Liderazgo SST Programada Example.'),
    ('96000000-0000-0000-0000-000000000060', '90000000-0000-0000-0000-000000000035', '61000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000002', 'Dirección Estratégica En Ejecución.'),
    ('96000000-0000-0000-0000-000000000061', '90000000-0000-0000-0000-000000000035', '61000000-0000-0000-0000-000000000011', '60000000-0000-0000-0000-000000000001', 'Fundición HQ En Ejecución.'),
    ('96000000-0000-0000-0000-000000000062', '90000000-0000-0000-0000-000000000036', '61000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000001', 'Troquelado Valencia En Ejecución.'),
    ('96000000-0000-0000-0000-000000000063', '90000000-0000-0000-0000-000000000037', '61000000-0000-0000-0000-000000000017', '60000000-0000-0000-0000-000000000003', 'Logística Guacara En Ejecución.'),
    ('96000000-0000-0000-0000-000000000064', '90000000-0000-0000-0000-000000000038', '61000000-0000-0000-0000-000000000018', '60000000-0000-0000-0000-000000000013', 'Comercial Caracas En Ejecución.'),
    -- Ciclos Futuros Preventivos Año +1 / Año +2 (AUD-2027-003..007 y AUD-2028-003..007)
    ('96000000-0000-0000-0000-000000000065', '90000000-0000-0000-0000-000000000039', '61000000-0000-0000-0000-000000000004', '60000000-0000-0000-0000-000000000004', 'Efluentes HQ Preprogramado Año +1.'),
    ('96000000-0000-0000-0000-000000000066', '90000000-0000-0000-0000-000000000040', '61000000-0000-0000-0000-000000000023', '60000000-0000-0000-0000-000000000015', 'Residuos Sur Preprogramado Año +1.'),
    ('96000000-0000-0000-0000-000000000067', '90000000-0000-0000-0000-000000000041', '61000000-0000-0000-0000-000000000025', '60000000-0000-0000-0000-000000000017', 'Acopio Guacara Preprogramado Año +1.'),
    ('96000000-0000-0000-0000-000000000068', '90000000-0000-0000-0000-000000000042', '61000000-0000-0000-0000-000000000026', '60000000-0000-0000-0000-000000000018', 'Liderazgo SST HQ Preprogramado Año +1.'),
    ('96000000-0000-0000-0000-000000000069', '90000000-0000-0000-0000-000000000043', '61000000-0000-0000-0000-000000000031', '60000000-0000-0000-0000-000000000019', 'Prensas Valencia Preprogramado Año +1.'),
    ('96000000-0000-0000-0000-000000000070', '90000000-0000-0000-0000-000000000044', '61000000-0000-0000-0000-000000000033', '60000000-0000-0000-0000-000000000022', 'Vigilancia Caracas Preprogramado Año +1.'),
    ('96000000-0000-0000-0000-000000000071', '90000000-0000-0000-0000-000000000045', '61000000-0000-0000-0000-000000000004', '60000000-0000-0000-0000-000000000004', 'Efluentes HQ Preprogramado Año +2.'),
    ('96000000-0000-0000-0000-000000000072', '90000000-0000-0000-0000-000000000046', '61000000-0000-0000-0000-000000000023', '60000000-0000-0000-0000-000000000015', 'Residuos Sur Preprogramado Año +2.'),
    ('96000000-0000-0000-0000-000000000073', '90000000-0000-0000-0000-000000000047', '61000000-0000-0000-0000-000000000025', '60000000-0000-0000-0000-000000000017', 'Acopio Guacara Preprogramado Año +2.'),
    ('96000000-0000-0000-0000-000000000074', '90000000-0000-0000-0000-000000000048', '61000000-0000-0000-0000-000000000026', '60000000-0000-0000-0000-000000000018', 'Liderazgo SST HQ Preprogramado Año +2.'),
    ('96000000-0000-0000-0000-000000000075', '90000000-0000-0000-0000-000000000049', '61000000-0000-0000-0000-000000000031', '60000000-0000-0000-0000-000000000019', 'Prensas Valencia Preprogramado Año +2.'),
    ('96000000-0000-0000-0000-000000000076', '90000000-0000-0000-0000-000000000050', '61000000-0000-0000-0000-000000000033', '60000000-0000-0000-0000-000000000022', 'Vigilancia Caracas Preprogramado Año +2.'),
    ('96000000-0000-0000-0000-000000000077', '90000000-0000-0000-0000-000000000051', '61000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000002', 'Dirección HQ Preprogramado Año +1.'),
    ('96000000-0000-0000-0000-000000000078', '90000000-0000-0000-0000-000000000052', '61000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000001', 'Troquelado Valencia Preprogramado Año +1.'),
    ('96000000-0000-0000-0000-000000000079', '90000000-0000-0000-0000-000000000053', '61000000-0000-0000-0000-000000000017', '60000000-0000-0000-0000-000000000003', 'Logística Guacara Preprogramado Año +1.'),
    ('96000000-0000-0000-0000-000000000080', '90000000-0000-0000-0000-000000000054', '61000000-0000-0000-0000-000000000018', '60000000-0000-0000-0000-000000000013', 'Comercial Caracas Preprogramado Año +1.'),
    ('96000000-0000-0000-0000-000000000081', '90000000-0000-0000-0000-000000000055', '61000000-0000-0000-0000-000000000055', '60000000-0000-0000-0000-000000000037', 'Planificación Logística Año +1.'),
    ('96000000-0000-0000-0000-000000000082', '90000000-0000-0000-0000-000000000056', '61000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000002', 'Dirección HQ Preprogramado Año +2.'),
    ('96000000-0000-0000-0000-000000000083', '90000000-0000-0000-0000-000000000057', '61000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000001', 'Troquelado Valencia Preprogramado Año +2.'),
    ('96000000-0000-0000-0000-000000000084', '90000000-0000-0000-0000-000000000058', '61000000-0000-0000-0000-000000000017', '60000000-0000-0000-0000-000000000003', 'Logística Guacara Preprogramado Año +2.'),
    ('96000000-0000-0000-0000-000000000085', '90000000-0000-0000-0000-000000000059', '61000000-0000-0000-0000-000000000018', '60000000-0000-0000-0000-000000000013', 'Comercial Caracas Preprogramado Año +2.'),
    ('96000000-0000-0000-0000-000000000086', '90000000-0000-0000-0000-000000000060', '61000000-0000-0000-0000-000000000055', '60000000-0000-0000-0000-000000000037', 'Planificación Logística Año +2.'),
    ('96000000-0000-0000-0000-000000000087', '90000000-0000-0000-0000-000000000061', '61000000-0000-0000-0000-000000000009', '60000000-0000-0000-0000-000000000009', 'Riesgos Mecánicos Example SST Año +1.'),
    ('96000000-0000-0000-0000-000000000088', '90000000-0000-0000-0000-000000000062', '61000000-0000-0000-0000-000000000009', '60000000-0000-0000-0000-000000000009', 'Riesgos Mecánicos Example SST Año +2.')
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
    ('97000000-0000-0000-0000-000000000008', '96000000-0000-0000-0000-000000000006', '95000000-0000-0000-0000-000000000007'),
    -- Escenario B Año 1, Multientidad N2 e Históricas base
    ('97000000-0000-0000-0000-000000000010', '96000000-0000-0000-0000-000000000010', '95000000-0000-0000-0000-000000000010'),
    ('97000000-0000-0000-0000-000000000011', '96000000-0000-0000-0000-000000000010', '95000000-0000-0000-0000-000000000011'),
    ('97000000-0000-0000-0000-000000000012', '96000000-0000-0000-0000-000000000011', '95000000-0000-0000-0000-000000000010'),
    ('97000000-0000-0000-0000-000000000013', '96000000-0000-0000-0000-000000000012', '95000000-0000-0000-0000-000000000012'),
    ('97000000-0000-0000-0000-000000000014', '96000000-0000-0000-0000-000000000013', '95000000-0000-0000-0000-000000000013'),
    ('97000000-0000-0000-0000-000000000015', '96000000-0000-0000-0000-000000000014', '95000000-0000-0000-0000-000000000014'),
    ('97000000-0000-0000-0000-000000000016', '96000000-0000-0000-0000-000000000015', '95000000-0000-0000-0000-000000000015'),
    ('97000000-0000-0000-0000-000000000017', '96000000-0000-0000-0000-000000000016', '95000000-0000-0000-0000-000000000016'),
    ('97000000-0000-0000-0000-000000000018', '96000000-0000-0000-0000-000000000017', '95000000-0000-0000-0000-000000000016'),
    ('97000000-0000-0000-0000-000000000019', '96000000-0000-0000-0000-000000000018', '95000000-0000-0000-0000-000000000017'),
    ('97000000-0000-0000-0000-000000000020', '96000000-0000-0000-0000-000000000019', '95000000-0000-0000-0000-000000000018'),
    -- Futuras VINC-N1-01 (AUD-2027-001/002 y AUD-2028-001/002)
    ('97000000-0000-0000-0000-000000000021', '96000000-0000-0000-0000-000000000020', '95000000-0000-0000-0000-000000000019'),
    ('97000000-0000-0000-0000-000000000022', '96000000-0000-0000-0000-000000000020', '95000000-0000-0000-0000-000000000020'),
    ('97000000-0000-0000-0000-000000000023', '96000000-0000-0000-0000-000000000021', '95000000-0000-0000-0000-000000000019'),
    ('97000000-0000-0000-0000-000000000024', '96000000-0000-0000-0000-000000000022', '95000000-0000-0000-0000-000000000021'),
    ('97000000-0000-0000-0000-000000000025', '96000000-0000-0000-0000-000000000023', '95000000-0000-0000-0000-000000000022'),
    ('97000000-0000-0000-0000-000000000026', '96000000-0000-0000-0000-000000000024', '95000000-0000-0000-0000-000000000023'),
    ('97000000-0000-0000-0000-000000000027', '96000000-0000-0000-0000-000000000024', '95000000-0000-0000-0000-000000000024'),
    ('97000000-0000-0000-0000-000000000028', '96000000-0000-0000-0000-000000000025', '95000000-0000-0000-0000-000000000025'),
    ('97000000-0000-0000-0000-000000000029', '96000000-0000-0000-0000-000000000026', '95000000-0000-0000-0000-000000000026'),
    ('97000000-0000-0000-0000-000000000030', '96000000-0000-0000-0000-000000000027', '95000000-0000-0000-0000-000000000027'),
    ('97000000-0000-0000-0000-000000000031', '96000000-0000-0000-0000-000000000027', '95000000-0000-0000-0000-000000000028'),
    ('97000000-0000-0000-0000-000000000032', '96000000-0000-0000-0000-000000000028', '95000000-0000-0000-0000-000000000029'),
    ('97000000-0000-0000-0000-000000000033', '96000000-0000-0000-0000-000000000029', '95000000-0000-0000-0000-000000000030'),
    ('97000000-0000-0000-0000-000000000034', '96000000-0000-0000-0000-000000000030', '95000000-0000-0000-0000-000000000031'),
    ('97000000-0000-0000-0000-000000000035', '96000000-0000-0000-0000-000000000030', '95000000-0000-0000-0000-000000000032'),
    ('97000000-0000-0000-0000-000000000036', '96000000-0000-0000-0000-000000000031', '95000000-0000-0000-0000-000000000033'),
    ('97000000-0000-0000-0000-000000000037', '96000000-0000-0000-0000-000000000032', '95000000-0000-0000-0000-000000000034'),
    -- Históricas y Recientes (AUD-2022-002..AUD-2025-004)
    ('97000000-0000-0000-0000-000000000038', '96000000-0000-0000-0000-000000000033', '95000000-0000-0000-0000-000000000035'),
    ('97000000-0000-0000-0000-000000000039', '96000000-0000-0000-0000-000000000034', '95000000-0000-0000-0000-000000000036'),
    ('97000000-0000-0000-0000-000000000040', '96000000-0000-0000-0000-000000000034', '95000000-0000-0000-0000-000000000037'),
    ('97000000-0000-0000-0000-000000000041', '96000000-0000-0000-0000-000000000035', '95000000-0000-0000-0000-000000000038'),
    ('97000000-0000-0000-0000-000000000042', '96000000-0000-0000-0000-000000000035', '95000000-0000-0000-0000-000000000039'),
    ('97000000-0000-0000-0000-000000000043', '96000000-0000-0000-0000-000000000036', '95000000-0000-0000-0000-000000000040'),
    ('97000000-0000-0000-0000-000000000044', '96000000-0000-0000-0000-000000000037', '95000000-0000-0000-0000-000000000041'),
    ('97000000-0000-0000-0000-000000000045', '96000000-0000-0000-0000-000000000038', '95000000-0000-0000-0000-000000000042'),
    ('97000000-0000-0000-0000-000000000046', '96000000-0000-0000-0000-000000000039', '95000000-0000-0000-0000-000000000043'),
    ('97000000-0000-0000-0000-000000000047', '96000000-0000-0000-0000-000000000040', '95000000-0000-0000-0000-000000000044'),
    ('97000000-0000-0000-0000-000000000048', '96000000-0000-0000-0000-000000000041', '95000000-0000-0000-0000-000000000045'),
    ('97000000-0000-0000-0000-000000000049', '96000000-0000-0000-0000-000000000042', '95000000-0000-0000-0000-000000000046'),
    ('97000000-0000-0000-0000-000000000050', '96000000-0000-0000-0000-000000000042', '95000000-0000-0000-0000-000000000047'),
    ('97000000-0000-0000-0000-000000000051', '96000000-0000-0000-0000-000000000043', '95000000-0000-0000-0000-000000000048'),
    ('97000000-0000-0000-0000-000000000052', '96000000-0000-0000-0000-000000000044', '95000000-0000-0000-0000-000000000049'),
    ('97000000-0000-0000-0000-000000000053', '96000000-0000-0000-0000-000000000045', '95000000-0000-0000-0000-000000000050'),
    ('97000000-0000-0000-0000-000000000054', '96000000-0000-0000-0000-000000000045', '95000000-0000-0000-0000-000000000051'),
    ('97000000-0000-0000-0000-000000000055', '96000000-0000-0000-0000-000000000046', '95000000-0000-0000-0000-000000000052'),
    ('97000000-0000-0000-0000-000000000056', '96000000-0000-0000-0000-000000000047', '95000000-0000-0000-0000-000000000053'),
    ('97000000-0000-0000-0000-000000000057', '96000000-0000-0000-0000-000000000048', '95000000-0000-0000-0000-000000000054'),
    ('97000000-0000-0000-0000-000000000058', '96000000-0000-0000-0000-000000000049', '95000000-0000-0000-0000-000000000055'),
    ('97000000-0000-0000-0000-000000000059', '96000000-0000-0000-0000-000000000049', '95000000-0000-0000-0000-000000000056'),
    ('97000000-0000-0000-0000-000000000060', '96000000-0000-0000-0000-000000000050', '95000000-0000-0000-0000-000000000057'),
    ('97000000-0000-0000-0000-000000000061', '96000000-0000-0000-0000-000000000051', '95000000-0000-0000-0000-000000000058'),
    -- Ciclo actual Borrador / Programada / En Ejecución (AUD-2026-006..009)
    ('97000000-0000-0000-0000-000000000062', '96000000-0000-0000-0000-000000000052', '95000000-0000-0000-0000-000000000059'),
    ('97000000-0000-0000-0000-000000000063', '96000000-0000-0000-0000-000000000053', '95000000-0000-0000-0000-000000000060'),
    ('97000000-0000-0000-0000-000000000064', '96000000-0000-0000-0000-000000000054', '95000000-0000-0000-0000-000000000061'),
    ('97000000-0000-0000-0000-000000000065', '96000000-0000-0000-0000-000000000055', '95000000-0000-0000-0000-000000000062'),
    ('97000000-0000-0000-0000-000000000066', '96000000-0000-0000-0000-000000000056', '95000000-0000-0000-0000-000000000063'),
    ('97000000-0000-0000-0000-000000000067', '96000000-0000-0000-0000-000000000057', '95000000-0000-0000-0000-000000000064'),
    ('97000000-0000-0000-0000-000000000068', '96000000-0000-0000-0000-000000000058', '95000000-0000-0000-0000-000000000065'),
    ('97000000-0000-0000-0000-000000000069', '96000000-0000-0000-0000-000000000059', '95000000-0000-0000-0000-000000000066'),
    ('97000000-0000-0000-0000-000000000070', '96000000-0000-0000-0000-000000000060', '95000000-0000-0000-0000-000000000067'),
    ('97000000-0000-0000-0000-000000000071', '96000000-0000-0000-0000-000000000061', '95000000-0000-0000-0000-000000000068'),
    ('97000000-0000-0000-0000-000000000072', '96000000-0000-0000-0000-000000000062', '95000000-0000-0000-0000-000000000069'),
    ('97000000-0000-0000-0000-000000000073', '96000000-0000-0000-0000-000000000062', '95000000-0000-0000-0000-000000000070'),
    ('97000000-0000-0000-0000-000000000074', '96000000-0000-0000-0000-000000000063', '95000000-0000-0000-0000-000000000071'),
    ('97000000-0000-0000-0000-000000000075', '96000000-0000-0000-0000-000000000064', '95000000-0000-0000-0000-000000000072'),
    -- Ciclos Futuros Preventivos Año +1 / Año +2 (AUD-2027-003..007 y AUD-2028-003..007)
    ('97000000-0000-0000-0000-000000000076', '96000000-0000-0000-0000-000000000065', '95000000-0000-0000-0000-000000000073'),
    ('97000000-0000-0000-0000-000000000077', '96000000-0000-0000-0000-000000000066', '95000000-0000-0000-0000-000000000074'),
    ('97000000-0000-0000-0000-000000000078', '96000000-0000-0000-0000-000000000067', '95000000-0000-0000-0000-000000000075'),
    ('97000000-0000-0000-0000-000000000079', '96000000-0000-0000-0000-000000000068', '95000000-0000-0000-0000-000000000076'),
    ('97000000-0000-0000-0000-000000000080', '96000000-0000-0000-0000-000000000069', '95000000-0000-0000-0000-000000000077'),
    ('97000000-0000-0000-0000-000000000081', '96000000-0000-0000-0000-000000000070', '95000000-0000-0000-0000-000000000078'),
    ('97000000-0000-0000-0000-000000000082', '96000000-0000-0000-0000-000000000071', '95000000-0000-0000-0000-000000000079'),
    ('97000000-0000-0000-0000-000000000083', '96000000-0000-0000-0000-000000000072', '95000000-0000-0000-0000-000000000080'),
    ('97000000-0000-0000-0000-000000000084', '96000000-0000-0000-0000-000000000073', '95000000-0000-0000-0000-000000000081'),
    ('97000000-0000-0000-0000-000000000085', '96000000-0000-0000-0000-000000000074', '95000000-0000-0000-0000-000000000082'),
    ('97000000-0000-0000-0000-000000000086', '96000000-0000-0000-0000-000000000075', '95000000-0000-0000-0000-000000000083'),
    ('97000000-0000-0000-0000-000000000087', '96000000-0000-0000-0000-000000000076', '95000000-0000-0000-0000-000000000084'),
    ('97000000-0000-0000-0000-000000000088', '96000000-0000-0000-0000-000000000077', '95000000-0000-0000-0000-000000000085'),
    ('97000000-0000-0000-0000-000000000089', '96000000-0000-0000-0000-000000000078', '95000000-0000-0000-0000-000000000086'),
    ('97000000-0000-0000-0000-000000000090', '96000000-0000-0000-0000-000000000079', '95000000-0000-0000-0000-000000000087'),
    ('97000000-0000-0000-0000-000000000091', '96000000-0000-0000-0000-000000000080', '95000000-0000-0000-0000-000000000088'),
    ('97000000-0000-0000-0000-000000000092', '96000000-0000-0000-0000-000000000081', '95000000-0000-0000-0000-000000000089'),
    ('97000000-0000-0000-0000-000000000093', '96000000-0000-0000-0000-000000000082', '95000000-0000-0000-0000-000000000090'),
    ('97000000-0000-0000-0000-000000000094', '96000000-0000-0000-0000-000000000083', '95000000-0000-0000-0000-000000000091'),
    ('97000000-0000-0000-0000-000000000095', '96000000-0000-0000-0000-000000000084', '95000000-0000-0000-0000-000000000092'),
    ('97000000-0000-0000-0000-000000000096', '96000000-0000-0000-0000-000000000085', '95000000-0000-0000-0000-000000000093'),
    ('97000000-0000-0000-0000-000000000097', '96000000-0000-0000-0000-000000000086', '95000000-0000-0000-0000-000000000094'),
    ('97000000-0000-0000-0000-000000000098', '96000000-0000-0000-0000-000000000087', '95000000-0000-0000-0000-000000000095'),
    ('97000000-0000-0000-0000-000000000099', '96000000-0000-0000-0000-000000000088', '95000000-0000-0000-0000-000000000096')
ON CONFLICT (id_procesos_sitio_auditoria, id_turnos_sitio_auditoria) WHERE deleted_at IS NULL DO NOTHING;

-- 21. Equipos de Auditores por Sitio (Cubo 2), Sitio Temporal y por Proceso (sincroniza equipo_auditor vía triggers)
-- Nota Paso 4.1: CERO auditores en auditorías futuras (AUD-2027-*, AUD-2028-*) ni en Borrador (AUD-2026-006/007); 100% calificados; sin traslapes.
INSERT INTO public.equipo_auditor_sitio (id, id_sitios_por_auditoria, id_auditor, rol_auditor, tiempo_auditoria, asignacion_completa_sitio) VALUES
    -- Escenario A (AUD-2024-001 · -1y: 2.50d HQ + 1.50d Valencia = 4.00d)
    ('98000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000001', 'AUDITOR_LIDER', 1.50, TRUE),
    ('98000000-0000-0000-0000-000000000015', '90000000-0000-0000-0000-000000000000', '33333333-3333-3333-3333-333333333333', 'AUDITOR', 1.00, FALSE),
    ('98000000-0000-0000-0000-000000000002', '90000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'AUDITOR_LIDER', 0.50, FALSE),
    ('98000000-0000-0000-0000-000000000003', '90000000-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'AUDITOR', 1.00, TRUE),
    -- Escenario B Año 1 Combinada (AUD-2025-001/002 · -1y+15d)
    ('98000000-0000-0000-0000-000000000004', '90000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'AUDITOR_LIDER', 3.00, TRUE),
    ('98000000-0000-0000-0000-000000000005', '90000000-0000-0000-0000-000000000003', '33333333-3333-3333-3333-333333333333', 'AUDITOR_LIDER', 3.00, TRUE),
    -- Escenario B Año 2 Integrada (AUD-2026-001/002 · +20d..+22d: campaña integrada válida)
    ('98000000-0000-0000-0000-000000000006', '90000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', 'AUDITOR_LIDER', 1.50, TRUE),
    ('98000000-0000-0000-0000-000000000007', '90000000-0000-0000-0000-000000000004', '33333333-3333-3333-3333-333333333333', 'AUDITOR', 1.50, FALSE),
    ('98000000-0000-0000-0000-000000000008', '90000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001', 'AUDITOR_LIDER', 1.50, TRUE),
    ('98000000-0000-0000-0000-000000000009', '90000000-0000-0000-0000-000000000005', '33333333-3333-3333-3333-333333333333', 'AUDITOR', 1.50, TRUE),
    -- Escenario C Nivel 2 Multientidad (AUD-2026-003/004 · PREPROGRAMADA_MES sin fechas exactas)
    ('98000000-0000-0000-0000-000000000016', '90000000-0000-0000-0000-000000000075', '10000000-0000-0000-0000-000000000001', 'AUDITOR_LIDER', 1.50, TRUE),
    ('98000000-0000-0000-0000-000000000017', '90000000-0000-0000-0000-000000000075', '10000000-0000-0000-0000-000000000003', 'AUDITOR', 1.00, FALSE),
    ('98000000-0000-0000-0000-000000000010', '90000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000001', 'AUDITOR_LIDER', 1.50, TRUE),
    ('98000000-0000-0000-0000-000000000011', '90000000-0000-0000-0000-000000000007', '33333333-3333-3333-3333-333333333333', 'AUDITOR_LIDER', 1.25, TRUE),
    ('98000000-0000-0000-0000-000000000018', '90000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000005', 'AUDITOR', 0.75, FALSE),
    -- Escenario D Parcial (AUD-2026-005 · -5d..-3d: 1.50d asignados vs 2.50d requeridos, 9600...0007 sin auditor)
    ('98000000-0000-0000-0000-000000000012', '90000000-0000-0000-0000-000000000008', '10000000-0000-0000-0000-000000000001', 'AUDITOR_LIDER', 1.50, FALSE),
    -- Auditoría histórica cerrada (AUD-2023-001 · -18m)
    ('98000000-0000-0000-0000-000000000013', '90000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-000000000001', 'AUDITOR_LIDER', 2.00, TRUE),
    -- Auditoría histórica revisada QA (AUD-2022-001 · -30m · CyberCloud ISO 27001)
    ('98000000-0000-0000-0000-000000000014', '90000000-0000-0000-0000-000000000010', '33333333-3333-3333-3333-333333333333', 'AUDITOR_LIDER', 1.25, TRUE),
    ('98000000-0000-0000-0000-000000000019', '90000000-0000-0000-0000-000000000010', '10000000-0000-0000-0000-000000000005', 'AUDITOR', 0.75, FALSE),
    -- Paso 4.1: Históricas y Recientes CONG-IND-01 (100% calificados, 6 auditores distribuidos sin traslapes)
    -- AUD-2022-002 (40...0001 · -40m · 6.25d): Laura Gómez (0003) + Miguel Torres (0004)
    ('98000000-0000-0000-0000-000000000020', '90000000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-000000000003', 'AUDITOR_LIDER', 2.00, FALSE),
    ('98000000-0000-0000-0000-000000000021', '90000000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-000000000004', 'AUDITOR', 1.00, FALSE),
    ('98000000-0000-0000-0000-000000000022', '90000000-0000-0000-0000-000000000012', '10000000-0000-0000-0000-000000000003', 'AUDITOR_LIDER', 1.75, TRUE),
    ('98000000-0000-0000-0000-000000000023', '90000000-0000-0000-0000-000000000013', '10000000-0000-0000-0000-000000000004', 'AUDITOR', 1.00, TRUE),
    ('98000000-0000-0000-0000-000000000024', '90000000-0000-0000-0000-000000000014', '10000000-0000-0000-0000-000000000003', 'AUDITOR_LIDER', 0.50, TRUE),
    -- AUD-2023-002 (40...0001 · -28m · 4.50d): Laura Gómez (0003) + Miguel Torres (0004)
    ('98000000-0000-0000-0000-000000000025', '90000000-0000-0000-0000-000000000015', '10000000-0000-0000-0000-000000000003', 'AUDITOR_LIDER', 2.00, TRUE),
    ('98000000-0000-0000-0000-000000000026', '90000000-0000-0000-0000-000000000016', '10000000-0000-0000-0000-000000000003', 'AUDITOR_LIDER', 1.25, TRUE),
    ('98000000-0000-0000-0000-000000000027', '90000000-0000-0000-0000-000000000017', '10000000-0000-0000-0000-000000000004', 'AUDITOR', 0.75, TRUE),
    ('98000000-0000-0000-0000-000000000028', '90000000-0000-0000-0000-000000000018', '10000000-0000-0000-0000-000000000004', 'AUDITOR', 0.50, TRUE),
    -- AUD-2022-003 (40...0002 ISO 14001 · -46m · 5.00d): Roberto Silva (0002) + Miguel Torres (0004)
    ('98000000-0000-0000-0000-000000000029', '90000000-0000-0000-0000-000000000019', '10000000-0000-0000-0000-000000000002', 'AUDITOR_LIDER', 2.75, TRUE),
    ('98000000-0000-0000-0000-000000000030', '90000000-0000-0000-0000-000000000020', '10000000-0000-0000-0000-000000000004', 'AUDITOR', 1.50, TRUE),
    ('98000000-0000-0000-0000-000000000031', '90000000-0000-0000-0000-000000000021', '10000000-0000-0000-0000-000000000004', 'AUDITOR', 0.75, TRUE),
    -- AUD-2025-003 (40...0002 ISO 14001 · -10m · 4.75d): Roberto Silva (0002) + Miguel Torres (0004)
    ('98000000-0000-0000-0000-000000000032', '90000000-0000-0000-0000-000000000022', '10000000-0000-0000-0000-000000000002', 'AUDITOR_LIDER', 2.50, TRUE),
    ('98000000-0000-0000-0000-000000000033', '90000000-0000-0000-0000-000000000023', '10000000-0000-0000-0000-000000000002', 'AUDITOR_LIDER', 1.50, TRUE),
    ('98000000-0000-0000-0000-000000000034', '90000000-0000-0000-0000-000000000024', '10000000-0000-0000-0000-000000000004', 'AUDITOR', 0.75, TRUE),
    -- AUD-2025-004 (40...0010 ISO 45001 · -12d..-9d · 5.00d): Roberto Silva (0002) + Miguel Torres (0004)
    ('98000000-0000-0000-0000-000000000035', '90000000-0000-0000-0000-000000000025', '10000000-0000-0000-0000-000000000002', 'AUDITOR_LIDER', 2.00, FALSE),
    ('98000000-0000-0000-0000-000000000036', '90000000-0000-0000-0000-000000000025', '10000000-0000-0000-0000-000000000004', 'AUDITOR', 1.00, FALSE),
    ('98000000-0000-0000-0000-000000000037', '90000000-0000-0000-0000-000000000026', '10000000-0000-0000-0000-000000000002', 'AUDITOR_LIDER', 1.50, TRUE),
    ('98000000-0000-0000-0000-000000000038', '90000000-0000-0000-0000-000000000027', '10000000-0000-0000-0000-000000000004', 'AUDITOR', 0.50, TRUE),
    -- AUD-2026-008 (40...0006 Programada SST · +35d..+36d · 1.75d): Roberto Silva (0002) sin traslape con +20d..+22d
    ('98000000-0000-0000-0000-000000000039', '90000000-0000-0000-0000-000000000034', '10000000-0000-0000-0000-000000000002', 'AUDITOR_LIDER', 1.75, TRUE),
    -- AUD-2026-009 (40...0001 En Ejecución · -1d..+1d · 4.50d): Auditor Técnico (3333...3333) + Laura Gómez (0003)
    ('98000000-0000-0000-0000-000000000040', '90000000-0000-0000-0000-000000000035', '33333333-3333-3333-3333-333333333333', 'AUDITOR_LIDER', 2.00, TRUE),
    ('98000000-0000-0000-0000-000000000041', '90000000-0000-0000-0000-000000000036', '10000000-0000-0000-0000-000000000003', 'AUDITOR', 1.25, TRUE),
    ('98000000-0000-0000-0000-000000000042', '90000000-0000-0000-0000-000000000037', '10000000-0000-0000-0000-000000000003', 'AUDITOR', 0.75, TRUE),
    ('98000000-0000-0000-0000-000000000043', '90000000-0000-0000-0000-000000000038', '33333333-3333-3333-3333-333333333333', 'AUDITOR_LIDER', 0.50, TRUE)
ON CONFLICT (id_sitios_por_auditoria, id_auditor) WHERE deleted_at IS NULL DO UPDATE SET
    rol_auditor = EXCLUDED.rol_auditor,
    tiempo_auditoria = EXCLUDED.tiempo_auditoria,
    asignacion_completa_sitio = EXCLUDED.asignacion_completa_sitio,
    updated_at = NOW();

INSERT INTO public.equipo_auditor_sitio_temporal (id, id_sitio_temporal, id_auditor, rol_auditor, tiempo_auditoria) VALUES
    ('9c000000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'AUDITOR', 1.00),
    ('9c000000-0000-0000-0000-000000000002', '9a000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'AUDITOR', 0.50),
    ('9c000000-0000-0000-0000-000000000003', '9a000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000003', 'AUDITOR', 0.75)
ON CONFLICT (id_sitio_temporal, id_auditor) WHERE deleted_at IS NULL DO UPDATE SET
    rol_auditor = EXCLUDED.rol_auditor,
    tiempo_auditoria = EXCLUDED.tiempo_auditoria,
    updated_at = NOW();

INSERT INTO public.equipo_auditor_proceso_sitio (id, id_procesos_sitio_auditoria, id_auditor, rol_en_proceso) VALUES
    -- Escenario A (AUD-2024-001)
    ('99000000-0000-0000-0000-000000000006', '96000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'LIDER_PROCESO'),
    ('99000000-0000-0000-0000-000000000001', '96000000-0000-0000-0000-000000000002', '33333333-3333-3333-3333-333333333333', 'EVALUADOR'),
    ('99000000-0000-0000-0000-000000000002', '96000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'LIDER_PROCESO'),
    -- Escenario B Año 2 Integrada (AUD-2026-001/002)
    ('99000000-0000-0000-0000-000000000003', '96000000-0000-0000-0000-000000000003', '33333333-3333-3333-3333-333333333333', 'EVALUADOR'),
    ('99000000-0000-0000-0000-000000000004', '96000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', 'LIDER_PROCESO'),
    ('99000000-0000-0000-0000-000000000007', '96000000-0000-0000-0000-000000000005', '33333333-3333-3333-3333-333333333333', 'LIDER_PROCESO'),
    -- Escenario D Parcial (9600...0007 queda intencionalmente SIN auditor asignado)
    ('99000000-0000-0000-0000-000000000005', '96000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000001', 'LIDER_PROCESO'),
    -- Escenario B Año 1, Multientidad N2 e Históricas base
    ('99000000-0000-0000-0000-000000000008', '96000000-0000-0000-0000-000000000010', '10000000-0000-0000-0000-000000000001', 'LIDER_PROCESO'),
    ('99000000-0000-0000-0000-000000000009', '96000000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-000000000001', 'EVALUADOR'),
    ('99000000-0000-0000-0000-000000000010', '96000000-0000-0000-0000-000000000012', '33333333-3333-3333-3333-333333333333', 'LIDER_PROCESO'),
    ('99000000-0000-0000-0000-000000000011', '96000000-0000-0000-0000-000000000013', '10000000-0000-0000-0000-000000000001', 'LIDER_PROCESO'),
    ('99000000-0000-0000-0000-000000000012', '96000000-0000-0000-0000-000000000014', '10000000-0000-0000-0000-000000000003', 'EVALUADOR'),
    ('99000000-0000-0000-0000-000000000013', '96000000-0000-0000-0000-000000000015', '10000000-0000-0000-0000-000000000001', 'LIDER_PROCESO'),
    ('99000000-0000-0000-0000-000000000014', '96000000-0000-0000-0000-000000000016', '33333333-3333-3333-3333-333333333333', 'LIDER_PROCESO'),
    ('99000000-0000-0000-0000-000000000015', '96000000-0000-0000-0000-000000000017', '10000000-0000-0000-0000-000000000005', 'EVALUADOR'),
    ('99000000-0000-0000-0000-000000000016', '96000000-0000-0000-0000-000000000018', '10000000-0000-0000-0000-000000000001', 'LIDER_PROCESO'),
    ('99000000-0000-0000-0000-000000000017', '96000000-0000-0000-0000-000000000019', '33333333-3333-3333-3333-333333333333', 'LIDER_PROCESO'),
    ('99000000-0000-0000-0000-000000000018', '96000000-0000-0000-0000-000000000019', '10000000-0000-0000-0000-000000000005', 'EVALUADOR'),
    -- Históricas y Recientes CONG-IND-01 (AUD-2022-002..AUD-2025-004)
    ('99000000-0000-0000-0000-000000000019', '96000000-0000-0000-0000-000000000033', '10000000-0000-0000-0000-000000000003', 'LIDER_PROCESO'),
    ('99000000-0000-0000-0000-000000000020', '96000000-0000-0000-0000-000000000034', '10000000-0000-0000-0000-000000000004', 'EVALUADOR'),
    ('99000000-0000-0000-0000-000000000021', '96000000-0000-0000-0000-000000000035', '10000000-0000-0000-0000-000000000003', 'LIDER_PROCESO'),
    ('99000000-0000-0000-0000-000000000022', '96000000-0000-0000-0000-000000000036', '10000000-0000-0000-0000-000000000004', 'EVALUADOR'),
    ('99000000-0000-0000-0000-000000000023', '96000000-0000-0000-0000-000000000037', '10000000-0000-0000-0000-000000000003', 'LIDER_PROCESO'),
    ('99000000-0000-0000-0000-000000000024', '96000000-0000-0000-0000-000000000038', '10000000-0000-0000-0000-000000000003', 'LIDER_PROCESO'),
    ('99000000-0000-0000-0000-000000000025', '96000000-0000-0000-0000-000000000039', '10000000-0000-0000-0000-000000000003', 'LIDER_PROCESO'),
    ('99000000-0000-0000-0000-000000000026', '96000000-0000-0000-0000-000000000040', '10000000-0000-0000-0000-000000000004', 'EVALUADOR'),
    ('99000000-0000-0000-0000-000000000027', '96000000-0000-0000-0000-000000000041', '10000000-0000-0000-0000-000000000004', 'EVALUADOR'),
    ('99000000-0000-0000-0000-000000000028', '96000000-0000-0000-0000-000000000042', '10000000-0000-0000-0000-000000000002', 'LIDER_PROCESO'),
    ('99000000-0000-0000-0000-000000000029', '96000000-0000-0000-0000-000000000043', '10000000-0000-0000-0000-000000000004', 'EVALUADOR'),
    ('99000000-0000-0000-0000-000000000030', '96000000-0000-0000-0000-000000000044', '10000000-0000-0000-0000-000000000004', 'EVALUADOR'),
    ('99000000-0000-0000-0000-000000000031', '96000000-0000-0000-0000-000000000045', '10000000-0000-0000-0000-000000000002', 'LIDER_PROCESO'),
    ('99000000-0000-0000-0000-000000000032', '96000000-0000-0000-0000-000000000046', '10000000-0000-0000-0000-000000000002', 'LIDER_PROCESO'),
    ('99000000-0000-0000-0000-000000000033', '96000000-0000-0000-0000-000000000047', '10000000-0000-0000-0000-000000000004', 'EVALUADOR'),
    ('99000000-0000-0000-0000-000000000034', '96000000-0000-0000-0000-000000000048', '10000000-0000-0000-0000-000000000002', 'LIDER_PROCESO'),
    ('99000000-0000-0000-0000-000000000035', '96000000-0000-0000-0000-000000000049', '10000000-0000-0000-0000-000000000004', 'EVALUADOR'),
    ('99000000-0000-0000-0000-000000000036', '96000000-0000-0000-0000-000000000050', '10000000-0000-0000-0000-000000000002', 'LIDER_PROCESO'),
    ('99000000-0000-0000-0000-000000000037', '96000000-0000-0000-0000-000000000051', '10000000-0000-0000-0000-000000000004', 'EVALUADOR'),
    -- Ciclo actual Programada / En Ejecución (AUD-2026-008/009; Borrador 006/007 y Futuras +1/+2 sin equipo)
    ('99000000-0000-0000-0000-000000000038', '96000000-0000-0000-0000-000000000058', '10000000-0000-0000-0000-000000000002', 'LIDER_PROCESO'),
    ('99000000-0000-0000-0000-000000000039', '96000000-0000-0000-0000-000000000059', '10000000-0000-0000-0000-000000000002', 'LIDER_PROCESO'),
    ('99000000-0000-0000-0000-000000000040', '96000000-0000-0000-0000-000000000060', '33333333-3333-3333-3333-333333333333', 'LIDER_PROCESO'),
    ('99000000-0000-0000-0000-000000000041', '96000000-0000-0000-0000-000000000061', '33333333-3333-3333-3333-333333333333', 'LIDER_PROCESO'),
    ('99000000-0000-0000-0000-000000000042', '96000000-0000-0000-0000-000000000062', '10000000-0000-0000-0000-000000000003', 'EVALUADOR'),
    ('99000000-0000-0000-0000-000000000043', '96000000-0000-0000-0000-000000000063', '10000000-0000-0000-0000-000000000003', 'EVALUADOR'),
    ('99000000-0000-0000-0000-000000000044', '96000000-0000-0000-0000-000000000064', '33333333-3333-3333-3333-333333333333', 'LIDER_PROCESO')
ON CONFLICT (id_procesos_sitio_auditoria, id_auditor) WHERE deleted_at IS NULL DO UPDATE SET
    rol_en_proceso = EXCLUDED.rol_en_proceso;

-- 22. Hallazgos de Campo (con sitio y plazos NC auto-calculables / verificables Step 10.1 + Paso 4.1)
-- Nota Paso 4.1: CERO hallazgos en futuras (AUD-2027-*, AUD-2028-*) ni en Borrador/En Programación/Programada.
INSERT INTO public.hallazgo (
    id, id_auditoria, id_requisito, id_proceso, id_sitio, tipo, descripcion, evidencia,
    fecha_limite_plan, fecha_entrega_plan, fecha_limite_cierre, fecha_cierre_real, cerrado
) VALUES
    (
        'a1000000-0000-0000-0000-000000000001',
        '80000000-0000-0000-0000-000000000001',
        'f0000000-0000-0000-0000-000000000085',
        '60000000-0000-0000-0000-000000000001',
        '50000000-0000-0000-0000-000000000001',
        'NC_MENOR',
        'Descalibración en pie de rey en la línea 2 de fundición.',
        'Registro fotográfico de instrumento CAL-09 sin verificación.',
        NULL,
        NULL,
        NULL,
        NULL,
        FALSE
    ),
    (
        'a1000000-0000-0000-0000-000000000004',
        '80000000-0000-0000-0000-000000000001',
        'c942a690-6bbd-46c2-b165-62843931cf51', -- 9.3 Revisión por la Dirección
        '60000000-0000-0000-0000-000000000002',
        '50000000-0000-0000-0000-000000000000',
        'OPORTUNIDAD_MEJORA',
        'Digitalizar el tablero de indicadores de chatarra metalúrgica en las actas trimestrales de revisión por la dirección.',
        'Acta de Revisión por la Dirección RD-2024-Q4 con anexos impresos consolidados manualmente.',
        NULL,
        NULL,
        NULL,
        NULL,
        FALSE
    ),
    (
        'a1000000-0000-0000-0000-000000000005',
        '80000000-0000-0000-0000-000000000002',
        'a15db0ef-de9f-45a1-a680-ce2d6916d18a', -- 8.3 Diseño y desarrollo (AUD-2025-001)
        '60000000-0000-0000-0000-000000000027',
        '50000000-0000-0000-0000-000000000004',
        'NC_MENOR',
        'Falta registro formal de validación de cambio estructural en plano REV-04 previo a liberación a taller.',
        'Plano EST-2025-114 emitido con firma de diseño sin acta de verificación multidisciplinaria.',
        (CURRENT_DATE - INTERVAL '1 year' + INTERVAL '32 days')::DATE,
        (CURRENT_DATE - INTERVAL '1 year' + INTERVAL '28 days')::DATE,
        (CURRENT_DATE - INTERVAL '1 year' + INTERVAL '62 days')::DATE,
        NULL,
        FALSE
    ),
    (
        'a1000000-0000-0000-0000-000000000006',
        '80000000-0000-0000-0000-000000000003',
        '1f9e6959-2151-4f79-8881-1d213a8ecad1', -- 8.1 ISO 14001 (AUD-2025-002)
        '60000000-0000-0000-0000-000000000008',
        '50000000-0000-0000-0000-000000000005',
        'OBSERVACION',
        'Etiquetado preventivo parcialmente desgastado en tambores de borra aceitosa del patio temporal.',
        'Inspección visual de área de almacenamiento temporal SGA-PAT-02.',
        NULL,
        NULL,
        NULL,
        NULL,
        FALSE
    ),
    (
        'a1000000-0000-0000-0000-000000000007',
        '80000000-0000-0000-0000-000000000003',
        '340ea65c-c6ab-48f0-a8b6-606e4eff07d4', -- 6.1 ISO 14001 (AUD-2025-002)
        '60000000-0000-0000-0000-000000000031',
        '50000000-0000-0000-0000-000000000005',
        'OPORTUNIDAD_MEJORA',
        'Unificar la matriz de aspectos ambientales significativos con el calendario de mantenimiento de extractores.',
        'Matriz MAA-2025-01 revisada con responsable ambiental en Planta Santa Cruz.',
        NULL,
        NULL,
        NULL,
        NULL,
        FALSE
    ),
    (
        'a1000000-0000-0000-0000-000000000002',
        '80000000-0000-0000-0000-000000000013',
        'f0000000-0000-0000-0000-000000000041',
        '60000000-0000-0000-0000-000000000002',
        '50000000-0000-0000-0000-000000000000',
        'NC_MAYOR',
        'Ausencia de matriz de partes interesadas y revisión periódica del contexto organizacional.',
        'Acta de revisión por la dirección sin anexo de contexto 4.1/4.2.',
        (CURRENT_DATE - INTERVAL '18 months' + INTERVAL '17 days')::DATE,
        (CURRENT_DATE - INTERVAL '18 months' + INTERVAL '12 days')::DATE,
        (CURRENT_DATE - INTERVAL '18 months' + INTERVAL '47 days')::DATE,
        (CURRENT_DATE - INTERVAL '18 months' + INTERVAL '45 days')::DATE,
        TRUE
    ),
    (
        'a1000000-0000-0000-0000-000000000003',
        '80000000-0000-0000-0000-000000000013',
        'f0000000-0000-0000-0000-000000000085',
        '60000000-0000-0000-0000-000000000002',
        '50000000-0000-0000-0000-000000000000',
        'NC_MENOR',
        'Control incompleto de registros de trazabilidad documental en archivo maestro.',
        'Listado maestro de documentos sin fecha de vigencia en 2 procedimientos.',
        (CURRENT_DATE - INTERVAL '18 months' + INTERVAL '17 days')::DATE,
        (CURRENT_DATE - INTERVAL '18 months' + INTERVAL '14 days')::DATE,
        (CURRENT_DATE - INTERVAL '18 months' + INTERVAL '47 days')::DATE,
        (CURRENT_DATE - INTERVAL '18 months' + INTERVAL '38 days')::DATE,
        TRUE
    ),
    (
        'a1000000-0000-0000-0000-000000000008',
        '80000000-0000-0000-0000-000000000014',
        '70e76d47-111e-4425-9e6c-d1cd8ab265d9', -- 8.1 ISO 27001 (AUD-2022-001 Cerrada)
        '60000000-0000-0000-0000-000000000005',
        '50000000-0000-0000-0000-000000000003',
        'OBSERVACION',
        'Fortalecer el registro de pruebas trimestrales de conmutación de enlace redundante en bitácora SOC.',
        'Bitácora de incidentes Q3 sin firma de cierre del operador de guardia.',
        NULL,
        NULL,
        NULL,
        (CURRENT_DATE - INTERVAL '30 months' + INTERVAL '15 days')::DATE,
        TRUE
    ),
    -- AUD-2022-002 (8000...0015 · Cerrada QA aprobada)
    (
        'a1000000-0000-0000-0000-000000000009',
        '80000000-0000-0000-0000-000000000015',
        'd87c648c-8cba-4522-91ce-4334b2156981', -- 8.6 Liberación de productos
        '60000000-0000-0000-0000-000000000011',
        '50000000-0000-0000-0000-000000000000',
        'NC_MAYOR',
        'Despacho de colada L-2022-088 sin certificado de ensayo mecánico firmado por responsable de laboratorio.',
        'Orden de despacho OD-4412 liberada sin firma de conformidad metalúrgica.',
        (CURRENT_DATE - INTERVAL '40 months' + INTERVAL '19 days')::DATE,
        (CURRENT_DATE - INTERVAL '40 months' + INTERVAL '14 days')::DATE,
        (CURRENT_DATE - INTERVAL '40 months' + INTERVAL '49 days')::DATE,
        (CURRENT_DATE - INTERVAL '40 months' + INTERVAL '22 days')::DATE,
        TRUE
    ),
    (
        'a1000000-0000-0000-0000-000000000010',
        '80000000-0000-0000-0000-000000000015',
        'b480611a-c93b-4458-a918-93d656123673', -- 8.2 Requisitos productos/servicios
        '60000000-0000-0000-0000-000000000013',
        '50000000-0000-0000-0000-000000000011',
        'OPORTUNIDAD_MEJORA',
        'Estandarizar encuesta post-entrega para pedidos especiales de autopartes automotrices.',
        'Registro comercial CRM-2022 con retroalimentación telefónica no tabulada.',
        NULL,
        NULL,
        NULL,
        (CURRENT_DATE - INTERVAL '40 months' + INTERVAL '20 days')::DATE,
        TRUE
    ),
    -- AUD-2023-002 (8000...0016 · Cerrada QA aprobada)
    (
        'a1000000-0000-0000-0000-000000000011',
        '80000000-0000-0000-0000-000000000016',
        'df7c6f91-d88e-439f-8582-105fab155e7c', -- 8.7 Salidas no conformes
        '60000000-0000-0000-0000-000000000001',
        '50000000-0000-0000-0000-000000000001',
        'NC_MENOR',
        'Piezas troqueladas segregadas en zona roja sin tarjeta de disposición de material no conforme.',
        'Lote TR-2304 en jaula de cuarentena de Planta Valencia sin identificación de rechazo.',
        (CURRENT_DATE - INTERVAL '28 months' + INTERVAL '18 days')::DATE,
        (CURRENT_DATE - INTERVAL '28 months' + INTERVAL '12 days')::DATE,
        (CURRENT_DATE - INTERVAL '28 months' + INTERVAL '48 days')::DATE,
        (CURRENT_DATE - INTERVAL '28 months' + INTERVAL '20 days')::DATE,
        TRUE
    ),
    (
        'a1000000-0000-0000-0000-000000000012',
        '80000000-0000-0000-0000-000000000016',
        '6a840627-c8e1-4f99-a6ab-4c019ff07c52', -- 9.2 Auditoría interna
        '60000000-0000-0000-0000-000000000012',
        '50000000-0000-0000-0000-000000000000',
        'OBSERVACION',
        'Incluir verificación cruzada de certificados de calibración externos dentro de la lista de verificación interna.',
        'Informe de auditoría interna AI-2023-02 de Metrología.',
        NULL,
        NULL,
        NULL,
        (CURRENT_DATE - INTERVAL '28 months' + INTERVAL '19 days')::DATE,
        TRUE
    ),
    -- AUD-2022-003 (8000...0017 · Cerrada QA aprobada ISO 14001)
    (
        'a1000000-0000-0000-0000-000000000013',
        '80000000-0000-0000-0000-000000000017',
        '1f9e6959-2151-4f79-8881-1d213a8ecad1', -- 8.1 Control operacional SGA
        '60000000-0000-0000-0000-000000000015',
        '50000000-0000-0000-0000-000000000012',
        'NC_MENOR',
        'Bandeja de contención secundaria de ácido sulfúrico en Planta Sur por debajo del 110% de capacidad del tanque.',
        'Medición de cubeto de seguridad área de decapado químico.',
        (CURRENT_DATE - INTERVAL '46 months' + INTERVAL '18 days')::DATE,
        (CURRENT_DATE - INTERVAL '46 months' + INTERVAL '13 days')::DATE,
        (CURRENT_DATE - INTERVAL '46 months' + INTERVAL '48 days')::DATE,
        (CURRENT_DATE - INTERVAL '46 months' + INTERVAL '18 days')::DATE,
        TRUE
    ),
    (
        'a1000000-0000-0000-0000-000000000014',
        '80000000-0000-0000-0000-000000000017',
        '229e6e12-8dfb-492a-95dd-7d303d8ecf8a', -- 8.2 Preparación y respuesta ante emergencias
        '60000000-0000-0000-0000-000000000016',
        '50000000-0000-0000-0000-000000000002',
        'OPORTUNIDAD_MEJORA',
        'Ejecutar simulacro conjunto de derrame químico con participación del turno nocturno.',
        'Cronograma anual de simulacros ambientales 2022 ejecutado solo en turno diurno.',
        NULL,
        NULL,
        NULL,
        (CURRENT_DATE - INTERVAL '46 months' + INTERVAL '18 days')::DATE,
        TRUE
    ),
    -- AUD-2025-003 (8000...0018 · Cerrada pendiente QA revisado = FALSE)
    (
        'a1000000-0000-0000-0000-000000000015',
        '80000000-0000-0000-0000-000000000018',
        'b49b8251-7363-4245-a26e-7af12f8c7ae9', -- 9.1 Seguimiento, medición, análisis y evaluación
        '60000000-0000-0000-0000-000000000004',
        '50000000-0000-0000-0000-000000000002',
        'NC_MAYOR',
        'Ausencia de monitoreo trimestral acreditado de partículas PM10 en chimenea del horno de inducción 2.',
        'Expediente de emisiones atmosféricas sin informe de laboratorio del 1.er trimestre.',
        (CURRENT_DATE - INTERVAL '10 months' + INTERVAL '18 days')::DATE,
        (CURRENT_DATE - INTERVAL '10 months' + INTERVAL '14 days')::DATE,
        (CURRENT_DATE - INTERVAL '10 months' + INTERVAL '48 days')::DATE,
        (CURRENT_DATE - INTERVAL '10 months' + INTERVAL '16 days')::DATE,
        TRUE
    ),
    (
        'a1000000-0000-0000-0000-000000000016',
        '80000000-0000-0000-0000-000000000018',
        'aca841ac-3699-4400-9c84-d21237995374', -- 7.1 Recursos SGA
        '60000000-0000-0000-0000-000000000017',
        '50000000-0000-0000-0000-000000000013',
        'OBSERVACION',
        'Actualizar ficha de datos de seguridad de solvente dieléctrico al formato SGA vigente en almacén Guacara.',
        'Carpeta de HDS en estante de recepción química.',
        NULL,
        NULL,
        NULL,
        (CURRENT_DATE - INTERVAL '10 months' + INTERVAL '15 days')::DATE,
        TRUE
    ),
    -- AUD-2025-004 (8000...0019 · Auditada reciente -12d..-9d: NC_MENOR abierta dentro de ventana +15d/+45d)
    (
        'a1000000-0000-0000-0000-000000000017',
        '80000000-0000-0000-0000-000000000019',
        'f53fd845-7f2c-4cdd-98ae-7b351566321d', -- 8.1 ISO 45001
        '60000000-0000-0000-0000-000000000019',
        '50000000-0000-0000-0000-000000000021',
        'NC_MENOR',
        'Candado de bloqueo LOTO en prensa hidráulica P-04 sin etiqueta identificadora del técnico de mantenimiento.',
        'Inspección en línea de prensas pesadas Valencia durante parada programada de cambio de troquel.',
        (CURRENT_DATE + INTERVAL '6 days')::DATE,
        NULL,
        (CURRENT_DATE + INTERVAL '36 days')::DATE,
        NULL,
        FALSE
    ),
    (
        'a1000000-0000-0000-0000-000000000018',
        '80000000-0000-0000-0000-000000000019',
        '19894f00-811a-461c-a5f3-9abaca9e0e28', -- 7.2 Competencia SST
        '60000000-0000-0000-0000-000000000022',
        '50000000-0000-0000-0000-000000000022',
        'OPORTUNIDAD_MEJORA',
        'Digitalizar la matriz de vigencia de exámenes médicos ocupacionales por puesto crítico.',
        'Archivo físico de Servicio Médico en Oficina Caracas.',
        NULL,
        NULL,
        NULL,
        NULL,
        FALSE
    ),
    -- AUD-2026-009 (8000...0023 · En Ejecución: máximo 1 observación preliminar)
    (
        'a1000000-0000-0000-0000-000000000019',
        '80000000-0000-0000-0000-000000000023',
        '2478c2a5-c27a-48f7-aca8-ebcbee0f5424', -- 8.1 ISO 9001
        '60000000-0000-0000-0000-000000000011',
        '50000000-0000-0000-0000-000000000000',
        'OBSERVACION',
        'Observación preliminar: actualizar instructivo de muestreo espectrométrico tras cambio de sensor óptico.',
        'Revisión en curso durante jornada de campo en laboratorio metalúrgico de HQ.',
        NULL,
        NULL,
        NULL,
        NULL,
        FALSE
    ),
    -- Hallazgos simplificados por cláusula únicamente (id_proceso IS NULL) con base 2026-11-20 (+15d/+45d)
    (
        'a1000000-0000-0000-0000-000000000101',
        '80000000-0000-0000-0000-000000000110',
        'f0000000-0000-0000-0000-000000000085',
        NULL,
        '50000000-0000-0000-0000-000000000110',
        'NC_MENOR',
        'Identificación incompleta de lote en línea de envasado primario.',
        'Etiqueta de tolva sin registro de turno durante muestreo en sitio.',
        NULL,
        '2026-12-01',
        NULL,
        NULL,
        FALSE
    ),
    (
        'a1000000-0000-0000-0000-000000000102',
        '80000000-0000-0000-0000-000000000110',
        'f0000000-0000-0000-0000-000000000042',
        NULL,
        '50000000-0000-0000-0000-000000000110',
        'NC_MAYOR',
        'Falta actualización de requisitos legales de partes interesadas en Planta Envasado Sur.',
        'Matriz normativa sin revisión vigente.',
        '2026-12-05',
        '2026-12-02',
        '2027-01-04',
        '2026-12-28',
        TRUE
    )
ON CONFLICT (id) DO UPDATE SET
    id_proceso = EXCLUDED.id_proceso,
    id_sitio = EXCLUDED.id_sitio,
    fecha_limite_plan = COALESCE(public.hallazgo.fecha_limite_plan, EXCLUDED.fecha_limite_plan),
    fecha_entrega_plan = EXCLUDED.fecha_entrega_plan,
    fecha_limite_cierre = COALESCE(public.hallazgo.fecha_limite_cierre, EXCLUDED.fecha_limite_cierre),
    fecha_cierre_real = EXCLUDED.fecha_cierre_real,
    cerrado = EXCLUDED.cerrado,
    updated_at = NOW();

-- 22a. Comentarios de Seguimiento Técnico por Auditoría (cerradas, en ejecución y reprogramadas)
INSERT INTO public.comentarios_por_auditoria (id, id_auditoria, comentario, timestamp) VALUES
    ('a2000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000001', 'Reunión de apertura ejecutada con gerencia de planta; instrumento CAL-09 retirado para recalibración inmediata.', NOW() - INTERVAL '362 days'),
    ('a2000000-0000-0000-0000-000000000002', '80000000-0000-0000-0000-000000000004', 'Coordinación integrada SGC+SGA confirmada tras reprogramación por parada de mantenimiento en Planta Santa Cruz.', NOW() - INTERVAL '2 days'),
    ('a2000000-0000-0000-0000-000000000003', '80000000-0000-0000-0000-000000000005', 'Ventana reprogramada sincronizada con auditor líder ambiental y frente de obra temporal Planta Sur.', NOW() - INTERVAL '2 days'),
    ('a2000000-0000-0000-0000-000000000004', '80000000-0000-0000-0000-000000000013', 'Expediente documental cerrado en campo tras verificación de acciones correctivas 4.1 y 8.5; pendiente revisión QA.', NOW() - INTERVAL '16 months'),
    ('a2000000-0000-0000-0000-000000000005', '80000000-0000-0000-0000-000000000015', 'Eficacia de NC mayor en liberación metalúrgica verificada con trazabilidad completa en 4 sitios.', NOW() - INTERVAL '39 months'),
    ('a2000000-0000-0000-0000-000000000006', '80000000-0000-0000-0000-000000000018', 'Informe de monitoreo PM10 acreditado cargado al expediente; listo para revisión de comité QA.', NOW() - INTERVAL '9 months'),
    ('a2000000-0000-0000-0000-000000000007', '80000000-0000-0000-0000-000000000019', 'Notificado plazo de +15 días para entrega de plan de acción LOTO en Planta Prensas Valencia.', NOW() - INTERVAL '8 days'),
    ('a2000000-0000-0000-0000-000000000008', '80000000-0000-0000-0000-000000000023', 'Jornada de campo en desarrollo en HQ y Valencia con cobertura de turno nocturno T3 confirmada.', NOW() - INTERVAL '4 hours')
ON CONFLICT (id) DO UPDATE SET
    comentario = EXCLUDED.comentario,
    timestamp = EXCLUDED.timestamp;

-- 22b. Cierre de auditorías históricas tras registrar fecha REAL y hallazgos resueltos (Step 10.1 + Step 11.1 Revisión)
UPDATE public.auditoria
SET estado_ciclo = 'Cerrada',
    fecha_cierre_auditoria = (CURRENT_DATE - INTERVAL '18 months' + INTERVAL '47 days')::DATE,
    revisado = FALSE,
    fecha_revision = NULL,
    revisado_por = NULL,
    usuario_revisor_id = NULL,
    documentacion_completa = FALSE,
    resumen_revision = NULL,
    updated_at = NOW()
WHERE id = '80000000-0000-0000-0000-000000000013'
  AND deleted_at IS NULL;

UPDATE public.auditoria
SET estado_ciclo = 'Cerrada',
    fecha_cierre_auditoria = (CURRENT_DATE - INTERVAL '30 months' + INTERVAL '20 days')::DATE,
    revisado = TRUE,
    fecha_revision = (CURRENT_DATE - INTERVAL '30 months' + INTERVAL '25 days')::DATE,
    revisado_por = '22222222-2222-2222-2222-222222222222',
    usuario_revisor_id = '22222222-2222-2222-2222-222222222222',
    documentacion_completa = TRUE,
    resumen_revision = 'Expediente documental completo y trazabilidad de cierre verificada por QA.',
    updated_at = NOW()
WHERE id = '80000000-0000-0000-0000-000000000014'
  AND deleted_at IS NULL;

UPDATE public.auditoria
SET estado_ciclo = 'Cerrada',
    fecha_cierre_auditoria = (CURRENT_DATE - INTERVAL '40 months' + INTERVAL '24 days')::DATE,
    revisado = TRUE,
    fecha_revision = (CURRENT_DATE - INTERVAL '40 months' + INTERVAL '28 days')::DATE,
    revisado_por = '22222222-2222-2222-2222-222222222222',
    usuario_revisor_id = '22222222-2222-2222-2222-222222222222',
    documentacion_completa = TRUE,
    resumen_revision = 'Ciclo inicial SGC Iberometal aprobado por QA con muestreo completo de los 4 sitios.',
    updated_at = NOW()
WHERE id = '80000000-0000-0000-0000-000000000015'
  AND deleted_at IS NULL;

UPDATE public.auditoria
SET estado_ciclo = 'Cerrada',
    fecha_cierre_auditoria = (CURRENT_DATE - INTERVAL '28 months' + INTERVAL '22 days')::DATE,
    revisado = TRUE,
    fecha_revision = (CURRENT_DATE - INTERVAL '28 months' + INTERVAL '26 days')::DATE,
    revisado_por = '22222222-2222-2222-2222-222222222222',
    usuario_revisor_id = '22222222-2222-2222-2222-222222222222',
    documentacion_completa = TRUE,
    resumen_revision = 'Seguimiento 1 histórico SGC Iberometal revisado y aprobado sin desviaciones documentales.',
    updated_at = NOW()
WHERE id = '80000000-0000-0000-0000-000000000016'
  AND deleted_at IS NULL;

UPDATE public.auditoria
SET estado_ciclo = 'Cerrada',
    fecha_cierre_auditoria = (CURRENT_DATE - INTERVAL '46 months' + INTERVAL '20 days')::DATE,
    revisado = TRUE,
    fecha_revision = (CURRENT_DATE - INTERVAL '46 months' + INTERVAL '25 days')::DATE,
    revisado_por = '22222222-2222-2222-2222-222222222222',
    usuario_revisor_id = '22222222-2222-2222-2222-222222222222',
    documentacion_completa = TRUE,
    resumen_revision = 'Ciclo inicial SGA Iberometal aprobado por QA conforme a requisitos ISO 14001:2015.',
    updated_at = NOW()
WHERE id = '80000000-0000-0000-0000-000000000017'
  AND deleted_at IS NULL;

UPDATE public.auditoria
SET estado_ciclo = 'Cerrada',
    fecha_cierre_auditoria = (CURRENT_DATE - INTERVAL '10 months' + INTERVAL '18 days')::DATE,
    revisado = FALSE,
    fecha_revision = NULL,
    revisado_por = NULL,
    usuario_revisor_id = NULL,
    documentacion_completa = FALSE,
    resumen_revision = NULL,
    updated_at = NOW()
WHERE id = '80000000-0000-0000-0000-000000000018'
  AND deleted_at IS NULL;

-- 23. Fechas del Certificado (Ciclos Trienales ISO/IEC 17021-1 para los 8 certificados CONG-IND-01 + CyberCloud)
INSERT INTO public.fecha_certificado (id, id_certificado, fecha, tipo_fecha) VALUES
    -- FN-QMS-2024-001 (Iberometal Componentes S.A. · 2.º Ciclo Recertificado)
    ('91000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '2021-03-15', 'Otorgamiento'),
    ('91000000-0000-0000-0000-000000000011', '40000000-0000-0000-0000-000000000001', '2024-03-15', 'Renovación'),
    ('91000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001', (CURRENT_DATE - INTERVAL '1 year')::DATE, 'Ultima Auditoría'),
    ('91000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000001', '2027-03-14', 'Vencimiento'),

    -- FN-EMS-2025-002 (Iberometal Componentes S.A. · 2.º Ciclo Recertificado reciente)
    ('91000000-0000-0000-0000-000000000012', '40000000-0000-0000-0000-000000000002', '2022-05-10', 'Otorgamiento'),
    ('91000000-0000-0000-0000-000000000013', '40000000-0000-0000-0000-000000000002', '2025-05-10', 'Renovación'),
    ('91000000-0000-0000-0000-000000000014', '40000000-0000-0000-0000-000000000002', '2025-04-18', 'Ultima Auditoría'),
    ('91000000-0000-0000-0000-000000000015', '40000000-0000-0000-0000-000000000002', '2028-05-09', 'Vencimiento'),

    -- FN-SST-2025-010 (Iberometal Componentes S.A. · 1.er Ciclo Vigente)
    ('91000000-0000-0000-0000-000000000016', '40000000-0000-0000-0000-000000000010', '2025-05-12', 'Otorgamiento'),
    ('91000000-0000-0000-0000-000000000017', '40000000-0000-0000-0000-000000000010', '2025-04-18', 'Ultima Auditoría'),
    ('91000000-0000-0000-0000-000000000018', '40000000-0000-0000-0000-000000000010', '2028-05-11', 'Vencimiento'),

    -- FN-QMS-2026-008 (Iberometal Componentes S.A. · En Estudio / Pre-certificación)
    ('91000000-0000-0000-0000-000000000019', '40000000-0000-0000-0000-000000000008', '2026-02-01', 'Modificación'),

    -- FN-QMS-2025-004 (Example, C.A. · 2.º Ciclo Recertificado)
    ('91000000-0000-0000-0000-000000000020', '40000000-0000-0000-0000-000000000004', '2022-06-20', 'Otorgamiento'),
    ('91000000-0000-0000-0000-000000000021', '40000000-0000-0000-0000-000000000004', '2025-06-20', 'Renovación'),
    ('91000000-0000-0000-0000-000000000022', '40000000-0000-0000-0000-000000000004', (CURRENT_DATE - INTERVAL '1 year' + INTERVAL '15 days')::DATE, 'Ultima Auditoría'),
    ('91000000-0000-0000-0000-000000000023', '40000000-0000-0000-0000-000000000004', '2028-06-19', 'Vencimiento'),

    -- FN-EMS-2025-005 (Example, C.A. · 1.er Ciclo Integrado con SGC)
    ('91000000-0000-0000-0000-000000000024', '40000000-0000-0000-0000-000000000005', '2025-06-20', 'Otorgamiento'),
    ('91000000-0000-0000-0000-000000000025', '40000000-0000-0000-0000-000000000005', (CURRENT_DATE - INTERVAL '1 year' + INTERVAL '15 days')::DATE, 'Ultima Auditoría'),
    ('91000000-0000-0000-0000-000000000026', '40000000-0000-0000-0000-000000000005', '2028-06-19', 'Vencimiento'),

    -- FN-SST-2026-006 (Example, C.A. · 1.er Ciclo Nuevo)
    ('91000000-0000-0000-0000-000000000027', '40000000-0000-0000-0000-000000000006', '2026-01-15', 'Otorgamiento'),
    ('91000000-0000-0000-0000-000000000028', '40000000-0000-0000-0000-000000000006', '2025-12-10', 'Ultima Auditoría'),
    ('91000000-0000-0000-0000-000000000029', '40000000-0000-0000-0000-000000000006', '2029-01-14', 'Vencimiento'),

    -- FN-QMS-2026-009 (Example, C.A. · 1.er Ciclo Nuevo Unidad Logística)
    ('91000000-0000-0000-0000-000000000030', '40000000-0000-0000-0000-000000000009', '2026-02-10', 'Otorgamiento'),
    ('91000000-0000-0000-0000-000000000031', '40000000-0000-0000-0000-000000000009', '2026-01-22', 'Ultima Auditoría'),
    ('91000000-0000-0000-0000-000000000032', '40000000-0000-0000-0000-000000000009', '2029-02-09', 'Vencimiento'),

    -- FN-ISMS-2025-003 (CyberCloud Solutions S.L. · Consistencia histórica CONG-CYB-01)
    ('91000000-0000-0000-0000-000000000033', '40000000-0000-0000-0000-000000000003', '2025-01-20', 'Otorgamiento'),
    ('91000000-0000-0000-0000-000000000034', '40000000-0000-0000-0000-000000000003', (CURRENT_DATE - INTERVAL '30 months')::DATE, 'Ultima Auditoría'),
    ('91000000-0000-0000-0000-000000000035', '40000000-0000-0000-0000-000000000003', '2028-01-19', 'Vencimiento')
ON CONFLICT (id_certificado_version, tipo_fecha, fecha) WHERE deleted_at IS NULL DO UPDATE SET
    tipo_fecha = EXCLUDED.tipo_fecha,
    fecha = EXCLUDED.fecha,
    updated_at = NOW();

-- 24. Contactos Autorizados del Certificado (Directorio Completo CONG-IND-01)
INSERT INTO public.contacto_certificado (id, id_certificado, nombre, cargo) VALUES
    -- Iberometal Componentes S.A.
    ('92000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'Ing. María Fernanda Rojas', 'Gerente de Aseguramiento de Calidad'),
    ('92000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001', 'Lic. Alejandro Peña', 'Coordinador SGC'),
    ('92000000-0000-0000-0000-000000000011', '40000000-0000-0000-0000-000000000002', 'Ing. Mariana Castellanos', 'Jefa de Gestión Ambiental'),
    ('92000000-0000-0000-0000-000000000012', '40000000-0000-0000-0000-000000000002', 'Téc. Luis Alberto Gómez', 'Supervisor de Efluentes y Residuos'),
    ('92000000-0000-0000-0000-000000000013', '40000000-0000-0000-0000-000000000010', 'Ing. Héctor Zambrano', 'Gerente SSL'),
    ('92000000-0000-0000-0000-000000000014', '40000000-0000-0000-0000-000000000010', 'Dra. Sofía Navarro', 'Médico Ocupacional'),
    ('92000000-0000-0000-0000-000000000015', '40000000-0000-0000-0000-000000000008', 'Ing. Ricardo Villalobos', 'Líder de Proyecto CNC'),
    -- Example, C.A.
    ('92000000-0000-0000-0000-000000000016', '40000000-0000-0000-0000-000000000004', 'Ing. Beatriz Morales', 'Directora de Calidad y Procesos'),
    ('92000000-0000-0000-0000-000000000017', '40000000-0000-0000-0000-000000000004', 'Ing. Gabriel Tovar', 'Coordinador de Control Dimensional'),
    ('92000000-0000-0000-0000-000000000018', '40000000-0000-0000-0000-000000000005', 'Ing. Beatriz Morales', 'Directora HSEQ'),
    ('92000000-0000-0000-0000-000000000019', '40000000-0000-0000-0000-000000000005', 'Téc. Paola Jiménez', 'Analista Ambiental'),
    ('92000000-0000-0000-0000-000000000020', '40000000-0000-0000-0000-000000000006', 'Ing. Oscar Paredes', 'Coordinador Corporativo SST'),
    ('92000000-0000-0000-0000-000000000021', '40000000-0000-0000-0000-000000000009', 'Lic. Verónica Salcedo', 'Jefa de Operaciones Logísticas')
ON CONFLICT (id_certificado_version, LOWER(TRIM(nombre))) WHERE deleted_at IS NULL DO UPDATE SET
    cargo = EXCLUDED.cargo,
    updated_at = NOW();

-- 25. Teléfonos de Contactos del Certificado (Directorio Completo CONG-IND-01)
INSERT INTO public.telefono_contacto_certificado (id, id_contacto, telefono, tipo_telefono) VALUES
    ('93000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000001', '+58 241 832-4100', 'Oficina'),
    ('93000000-0000-0000-0000-000000000002', '92000000-0000-0000-0000-000000000001', '+58 414 490-1122', 'Móvil'),
    ('93000000-0000-0000-0000-000000000003', '92000000-0000-0000-0000-000000000002', '+58 241 832-4155', 'Directo'),
    ('93000000-0000-0000-0000-000000000011', '92000000-0000-0000-0000-000000000011', '+58 241 832-4210', 'Oficina'),
    ('93000000-0000-0000-0000-000000000012', '92000000-0000-0000-0000-000000000011', '+58 414 490-2211', 'Móvil'),
    ('93000000-0000-0000-0000-000000000013', '92000000-0000-0000-0000-000000000012', '+58 241 832-4255', 'Directo'),
    ('93000000-0000-0000-0000-000000000014', '92000000-0000-0000-0000-000000000013', '+58 241 832-4310', 'Oficina'),
    ('93000000-0000-0000-0000-000000000015', '92000000-0000-0000-0000-000000000013', '+58 414 490-3311', 'Móvil'),
    ('93000000-0000-0000-0000-000000000016', '92000000-0000-0000-0000-000000000014', '+58 241 832-4355', 'Directo'),
    ('93000000-0000-0000-0000-000000000017', '92000000-0000-0000-0000-000000000015', '+58 241 832-4410', 'Oficina'),
    ('93000000-0000-0000-0000-000000000018', '92000000-0000-0000-0000-000000000015', '+58 412 490-4411', 'Móvil'),
    ('93000000-0000-0000-0000-000000000019', '92000000-0000-0000-0000-000000000016', '+58 243 261-5100', 'Oficina'),
    ('93000000-0000-0000-0000-000000000020', '92000000-0000-0000-0000-000000000016', '+58 414 345-5100', 'Móvil'),
    ('93000000-0000-0000-0000-000000000021', '92000000-0000-0000-0000-000000000017', '+58 243 261-5125', 'Directo'),
    ('93000000-0000-0000-0000-000000000022', '92000000-0000-0000-0000-000000000018', '+58 243 261-5200', 'Oficina'),
    ('93000000-0000-0000-0000-000000000023', '92000000-0000-0000-0000-000000000018', '+58 414 345-5100', 'Móvil'),
    ('93000000-0000-0000-0000-000000000024', '92000000-0000-0000-0000-000000000019', '+58 243 261-5240', 'Directo'),
    ('93000000-0000-0000-0000-000000000025', '92000000-0000-0000-0000-000000000020', '+58 243 261-5300', 'Oficina'),
    ('93000000-0000-0000-0000-000000000026', '92000000-0000-0000-0000-000000000020', '+58 412 345-5300', 'Móvil'),
    ('93000000-0000-0000-0000-000000000027', '92000000-0000-0000-0000-000000000021', '+58 243 261-5400', 'Oficina'),
    ('93000000-0000-0000-0000-000000000028', '92000000-0000-0000-0000-000000000021', '+58 414 345-5400', 'Móvil')
ON CONFLICT (id_contacto, TRIM(telefono)) WHERE deleted_at IS NULL DO UPDATE SET
    tipo_telefono = EXCLUDED.tipo_telefono,
    updated_at = NOW();

-- 26. Emails de Contactos del Certificado (Directorio Completo CONG-IND-01)
INSERT INTO public.email_contacto_certificado (id, id_contacto, email, tipo_email) VALUES
    ('94000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000001', 'mrojas@iberometal.com', 'Trabajo'),
    ('94000000-0000-0000-0000-000000000002', '92000000-0000-0000-0000-000000000001', 'calidad@iberometal.com', 'Alternativo'),
    ('94000000-0000-0000-0000-000000000003', '92000000-0000-0000-0000-000000000002', 'apena@iberometal.com', 'Trabajo'),
    ('94000000-0000-0000-0000-000000000011', '92000000-0000-0000-0000-000000000011', 'mcastellanos@iberometal.com', 'Trabajo'),
    ('94000000-0000-0000-0000-000000000012', '92000000-0000-0000-0000-000000000011', 'ambiente@iberometal.com', 'Alternativo'),
    ('94000000-0000-0000-0000-000000000013', '92000000-0000-0000-0000-000000000012', 'lgomez@iberometal.com', 'Trabajo'),
    ('94000000-0000-0000-0000-000000000014', '92000000-0000-0000-0000-000000000013', 'hzambrano@iberometal.com', 'Trabajo'),
    ('94000000-0000-0000-0000-000000000015', '92000000-0000-0000-0000-000000000013', 'sst@iberometal.com', 'Alternativo'),
    ('94000000-0000-0000-0000-000000000016', '92000000-0000-0000-0000-000000000014', 'snavarro@iberometal.com', 'Trabajo'),
    ('94000000-0000-0000-0000-000000000017', '92000000-0000-0000-0000-000000000015', 'rvillalobos@iberometal.com', 'Trabajo'),
    ('94000000-0000-0000-0000-000000000018', '92000000-0000-0000-0000-000000000015', 'cnc@iberometal.com', 'Alternativo'),
    ('94000000-0000-0000-0000-000000000019', '92000000-0000-0000-0000-000000000016', 'bmorales@example-industrial.com', 'Trabajo'),
    ('94000000-0000-0000-0000-000000000020', '92000000-0000-0000-0000-000000000016', 'calidad@example-industrial.com', 'Alternativo'),
    ('94000000-0000-0000-0000-000000000021', '92000000-0000-0000-0000-000000000017', 'gtovar@example-industrial.com', 'Trabajo'),
    ('94000000-0000-0000-0000-000000000022', '92000000-0000-0000-0000-000000000018', 'bmorales@example-industrial.com', 'Trabajo'),
    ('94000000-0000-0000-0000-000000000023', '92000000-0000-0000-0000-000000000018', 'hseq@example-industrial.com', 'Alternativo'),
    ('94000000-0000-0000-0000-000000000024', '92000000-0000-0000-0000-000000000019', 'pjimenez@example-industrial.com', 'Trabajo'),
    ('94000000-0000-0000-0000-000000000025', '92000000-0000-0000-0000-000000000020', 'oparedes@example-industrial.com', 'Trabajo'),
    ('94000000-0000-0000-0000-000000000026', '92000000-0000-0000-0000-000000000020', 'sst@example-industrial.com', 'Alternativo'),
    ('94000000-0000-0000-0000-000000000027', '92000000-0000-0000-0000-000000000021', 'vsalcedo@example-industrial.com', 'Trabajo'),
    ('94000000-0000-0000-0000-000000000028', '92000000-0000-0000-0000-000000000021', 'logistica@example-industrial.com', 'Alternativo')
ON CONFLICT (id_contacto, LOWER(TRIM(email))) WHERE deleted_at IS NULL DO UPDATE SET
    tipo_email = EXCLUDED.tipo_email,
    updated_at = NOW();

-- 27. Compartición Selectiva en Conglomerado CONG-IND-01 (Step 1.3)
INSERT INTO public.contacto_certificado_compartido (id, id_contacto, id_certificado) VALUES
    ('95000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002')
ON CONFLICT (id_contacto, id_certificado_version) WHERE deleted_at IS NULL DO UPDATE SET
    updated_at = NOW();

INSERT INTO public.turno_certificado_compartido (id, id_turno, id_certificado, id_certificado_origen) VALUES
    ('95000000-0000-0000-0000-000000000011', '70000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000010', '40000000-0000-0000-0000-000000000001')
ON CONFLICT (id_turno, id_certificado_version) WHERE deleted_at IS NULL DO UPDATE SET
    id_certificado_origen = EXCLUDED.id_certificado_origen,
    updated_at = NOW();

INSERT INTO public.proceso_certificado_compartido (id, id_proceso, id_certificado, sincronizar_requisitos) VALUES
    -- Misma norma (ISO 9001 -> ISO 9001): proceso + requisitos sincronizados (40...0001 -> 40...0004)
    ('95000000-0000-0000-0000-000000000021', '60000000-0000-0000-0000-000000000012', '40000000-0000-0000-0000-000000000004', TRUE),
    -- Norma distinta (ISO 9001 -> ISO 14001): solo proceso vacío sin sincronización (40...0001 -> 40...0002)
    ('95000000-0000-0000-0000-000000000022', '60000000-0000-0000-0000-000000000012', '40000000-0000-0000-0000-000000000002', FALSE)
ON CONFLICT (id_proceso, id_certificado_version) WHERE deleted_at IS NULL DO UPDATE SET
    sincronizar_requisitos = EXCLUDED.sincronizar_requisitos,
    updated_at = NOW();

INSERT INTO public.sitio_certificado_compartido (id, id_sitio, id_certificado, numero_sitio) VALUES
    ('95000000-0000-0000-0000-000000000031', '50000000-0000-0000-0000-000000000023', '40000000-0000-0000-0000-000000000004', 3)
ON CONFLICT (id_sitio, id_certificado_version) WHERE deleted_at IS NULL DO UPDATE SET
    numero_sitio = EXCLUDED.numero_sitio,
    updated_at = NOW();

INSERT INTO public.procesos_por_sitio (id, id_certificado, id_sitio, id_proceso) VALUES
    ('95000000-0000-0000-0000-000000000041', '40000000-0000-0000-0000-000000000004', '50000000-0000-0000-0000-000000000023', '60000000-0000-0000-0000-000000000012')
ON CONFLICT (id_certificado_version, id_sitio, id_proceso) WHERE deleted_at IS NULL DO UPDATE SET
    updated_at = NOW();

-- Requisitos alineados para el proceso compartido de misma norma (60...0012 en 40...0004; 40...0002 permanece vacío al ser norma distinta)
INSERT INTO public.requisitos_por_proceso (id_proceso, id_certificado, id_requisito) VALUES
    ('60000000-0000-0000-0000-000000000012', '40000000-0000-0000-0000-000000000004', '42efcb2b-b1a4-4195-849a-2035d7abdfee'), -- 7.1
    ('60000000-0000-0000-0000-000000000012', '40000000-0000-0000-0000-000000000004', 'a26efba3-e5bc-412d-81ca-4e0d60057a3e'), -- 7.2
    ('60000000-0000-0000-0000-000000000012', '40000000-0000-0000-0000-000000000004', '1f767c2f-7773-411d-8ad2-52d1db087a76'), -- 7.3
    ('60000000-0000-0000-0000-000000000012', '40000000-0000-0000-0000-000000000004', 'b2739201-ce87-4e47-ac0f-192be80acd84'), -- 7.5
    ('60000000-0000-0000-0000-000000000012', '40000000-0000-0000-0000-000000000004', '6381bc8b-9b89-4865-a74c-d1f99ef2b956'), -- 9.1
    ('60000000-0000-0000-0000-000000000012', '40000000-0000-0000-0000-000000000004', '6a840627-c8e1-4f99-a6ab-4c019ff07c52'), -- 9.2
    ('60000000-0000-0000-0000-000000000012', '40000000-0000-0000-0000-000000000004', '443b196c-0af0-49aa-930e-26b0462fa531')  -- 10.2
ON CONFLICT (id_proceso, id_certificado_version, id_requisito) DO NOTHING;

-- 28. Expertos Técnicos (Catálogo IAF) y Escenario Demostrativo Sector 13 / Sub-Sector 13.2 + ISO 45001:2018 (Paso 1.2)
INSERT INTO public.experto_tecnico (id, nombre, estatus, notas) VALUES
    ('1e000000-0000-0000-0000-000000000001', 'Dra. Sofía Quintero', 'Disponible', 'Química farmacéutica senior con 14 años en buenas prácticas de manufactura estéril.'),
    ('1e000000-0000-0000-0000-000000000002', 'Ing. Héctor Zambrano', 'Disponible', 'Especialista en procesos industriales farmacéuticos, biotecnología y control ambiental de áreas limpias.'),
    ('1e000000-0000-0000-0000-000000000003', 'Ing. Mariela Cárdenas', 'Disponible', 'Experta metalúrgica y procesos de fundición / tratamientos térmicos.'),
    ('1e000000-0000-0000-0000-000000000004', 'Lic. Gabriel Navarro', 'Disponible', 'Especialista en cadenas agroalimentarias y continuidad operativa de centros de datos.'),
    ('1e000000-0000-0000-0000-000000000005', 'Ing. Rodrigo Páez', 'No disponible', 'Temporalmente no disponible por licencia técnica hasta próximo trimestre.')
ON CONFLICT (id) DO UPDATE SET
    nombre = EXCLUDED.nombre,
    estatus = EXCLUDED.estatus,
    notas = EXCLUDED.notas,
    deleted_at = NULL,
    deleted_by = NULL,
    delete_reason = NULL,
    updated_at = NOW();

INSERT INTO public.telefono_experto_tecnico (id, id_experto_tecnico, telefono, tipo_telefono) VALUES
    ('1e100000-0000-0000-0000-000000000001', '1e000000-0000-0000-0000-000000000001', '+58 414 210-3101', 'Móvil'),
    ('1e100000-0000-0000-0000-000000000002', '1e000000-0000-0000-0000-000000000002', '+58 412 320-4201', 'Móvil'),
    ('1e100000-0000-0000-0000-000000000003', '1e000000-0000-0000-0000-000000000002', '+58 212 951-4202', 'Oficina'),
    ('1e100000-0000-0000-0000-000000000004', '1e000000-0000-0000-0000-000000000003', '+58 414 430-5301', 'Móvil'),
    ('1e100000-0000-0000-0000-000000000005', '1e000000-0000-0000-0000-000000000004', '+58 424 540-6401', 'Móvil'),
    ('1e100000-0000-0000-0000-000000000006', '1e000000-0000-0000-0000-000000000005', '+58 416 650-7501', 'Móvil')
ON CONFLICT (id) DO UPDATE SET
    id_experto_tecnico = EXCLUDED.id_experto_tecnico,
    telefono = EXCLUDED.telefono,
    tipo_telefono = EXCLUDED.tipo_telefono,
    deleted_at = NULL,
    deleted_by = NULL,
    updated_at = NOW();

INSERT INTO public.email_experto_tecnico (id, id_experto_tecnico, email, tipo_email) VALUES
    ('1e200000-0000-0000-0000-000000000001', '1e000000-0000-0000-0000-000000000001', 'squintero.experto@fondonorma.test', 'Trabajo'),
    ('1e200000-0000-0000-0000-000000000002', '1e000000-0000-0000-0000-000000000002', 'hzambrano.experto@fondonorma.test', 'Trabajo'),
    ('1e200000-0000-0000-0000-000000000003', '1e000000-0000-0000-0000-000000000003', 'mcardenas.experto@fondonorma.test', 'Trabajo'),
    ('1e200000-0000-0000-0000-000000000004', '1e000000-0000-0000-0000-000000000004', 'gnavarro.experto@fondonorma.test', 'Trabajo'),
    ('1e200000-0000-0000-0000-000000000005', '1e000000-0000-0000-0000-000000000005', 'rpaez.experto@fondonorma.test', 'Trabajo')
ON CONFLICT (id) DO UPDATE SET
    id_experto_tecnico = EXCLUDED.id_experto_tecnico,
    email = EXCLUDED.email,
    tipo_email = EXCLUDED.tipo_email,
    deleted_at = NULL,
    deleted_by = NULL,
    updated_at = NOW();

-- Competencias exclusivamente por Sector / Subsector IAF (sin asociación a normas ISO)
INSERT INTO public.sector_iaf_experto (id_experto_tecnico, id_sector_iaf) VALUES
    ('1e000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000013'), -- Ing. Héctor Zambrano: Sector 13 completo
    ('1e000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000017'), -- Ing. Mariela Cárdenas: Sector 17
    ('1e000000-0000-0000-0000-000000000005', 'd0000000-0000-0000-0000-000000000028')  -- Ing. Rodrigo Páez: Sector 28
ON CONFLICT (id_experto_tecnico, id_sector_iaf) DO NOTHING;

INSERT INTO public.subsector_iaf_experto (id_experto_tecnico, id_subsector_iaf) VALUES
    ('1e000000-0000-0000-0000-000000000001', 'da000000-0000-0000-0000-000000000131'), -- Dra. Sofía Quintero: Subsector 13.1
    ('1e000000-0000-0000-0000-000000000003', 'da000000-0000-0000-0000-000000000171'), -- Ing. Mariela Cárdenas: Subsector 17.1
    ('1e000000-0000-0000-0000-000000000004', 'da000000-0000-0000-0000-000000000031'), -- Lic. Gabriel Navarro: Subsector 03.1
    ('1e000000-0000-0000-0000-000000000004', 'da000000-0000-0000-0000-000000000331'), -- Lic. Gabriel Navarro: Subsector 33.1
    ('1e000000-0000-0000-0000-000000000005', 'da000000-0000-0000-0000-000000000281')  -- Ing. Rodrigo Páez: Subsector 28.1
ON CONFLICT (id_experto_tecnico, id_subsector_iaf) DO NOTHING;

-- Escenario Demostrativo Aislado: Sector IAF 13 / Subsector 13.1 + ISO 45001:2018 (sin alterar CONG-IND-01 / CONG-CYB-01 / CONG-ALM-01)
INSERT INTO public.grupo_empresarial (id, codigo_grupo, nombre, abreviacion, es_individual_auto, notas) VALUES
    ('20000000-0000-0000-0000-000000000004', 'CONG-FAR-01', 'Laboratorios Farmacéuticos del Centro C.A.', 'LabCentro', TRUE, 'Grupo individual demostrativo para escenario Sector IAF 13 / Subsector 13.1 + ISO 45001:2018 con brecha sectorial asistida por Experto Técnico.')
ON CONFLICT (id) DO UPDATE SET
    codigo_grupo = EXCLUDED.codigo_grupo,
    nombre = EXCLUDED.nombre,
    abreviacion = EXCLUDED.abreviacion,
    es_individual_auto = EXCLUDED.es_individual_auto,
    notas = EXCLUDED.notas,
    deleted_at = NULL,
    updated_at = NOW();

INSERT INTO public.organizacion (id, id_grupo_empresarial, nombre, abreviacion, rif, direccion_fiscal) VALUES
    ('30000000-0000-0000-0000-000000000006', '20000000-0000-0000-0000-000000000004', 'Laboratorios Farmacéuticos del Centro C.A.', 'LABCENTRO', 'J-70123456-7', 'Zona Industrial Los Guayos, Parcela F-14, Edo. Carabobo')
ON CONFLICT (id) DO UPDATE SET
    id_grupo_empresarial = EXCLUDED.id_grupo_empresarial,
    nombre = EXCLUDED.nombre,
    abreviacion = EXCLUDED.abreviacion,
    rif = EXCLUDED.rif,
    direccion_fiscal = EXCLUDED.direccion_fiscal,
    deleted_at = NULL,
    updated_at = NOW();

DO $$
DECLARE
    v_target_id UUID := '31000000-0000-0000-0000-000000000006'::UUID;
    v_org_id UUID := '30000000-0000-0000-0000-000000000006'::UUID;
    v_existing_id UUID;
BEGIN
    IF EXISTS (SELECT 1 FROM public.organizacion_version ov WHERE ov.id = v_target_id) THEN
        UPDATE public.organizacion_version
        SET es_version_actual = TRUE,
            notas_version = 'Versión inicial Laboratorios Farmacéuticos del Centro C.A.',
            nombre = 'Laboratorios Farmacéuticos del Centro C.A.',
            abreviacion = 'LABCENTRO',
            rif = 'J-70123456-7',
            direccion_fiscal = 'Zona Industrial Los Guayos, Parcela F-14, Edo. Carabobo',
            deleted_at = NULL,
            deleted_by = NULL,
            delete_reason = NULL,
            updated_at = NOW()
        WHERE id = v_target_id;
    ELSE
        SELECT ov.id INTO v_existing_id
        FROM public.organizacion_version ov
        WHERE ov.id_organizacion = v_org_id
          AND ov.version_numero = 1
        LIMIT 1;

        IF v_existing_id IS NOT NULL THEN
            UPDATE public.organizacion_version
            SET id = v_target_id,
                es_version_actual = TRUE,
                notas_version = 'Versión inicial Laboratorios Farmacéuticos del Centro C.A.',
                nombre = 'Laboratorios Farmacéuticos del Centro C.A.',
                abreviacion = 'LABCENTRO',
                rif = 'J-70123456-7',
                direccion_fiscal = 'Zona Industrial Los Guayos, Parcela F-14, Edo. Carabobo',
                deleted_at = NULL,
                deleted_by = NULL,
                delete_reason = NULL,
                updated_at = NOW()
            WHERE id = v_existing_id;
        ELSE
            INSERT INTO public.organizacion_version (
                id, id_organizacion, version_numero, es_version_actual, notas_version,
                nombre, abreviacion, rif, direccion_fiscal
            ) VALUES (
                v_target_id, v_org_id, 1, TRUE, 'Versión inicial Laboratorios Farmacéuticos del Centro C.A.',
                'Laboratorios Farmacéuticos del Centro C.A.', 'LABCENTRO', 'J-70123456-7',
                'Zona Industrial Los Guayos, Parcela F-14, Edo. Carabobo'
            );
        END IF;
    END IF;
END $$;

INSERT INTO public.certificado (id, id_norma, id_estatus, id_sector_iaf, id_subsector_iaf, id_organizacion, numero_certificado, multisitio) VALUES
    ('40000000-0000-0000-0000-000000000201', 'e0000000-0000-0000-0000-000000045001', 'a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000013', 'da000000-0000-0000-0000-000000000131', '30000000-0000-0000-0000-000000000006', 'FN-SST-2026-201', FALSE)
ON CONFLICT (numero_certificado) WHERE deleted_at IS NULL DO UPDATE SET
    id_norma = EXCLUDED.id_norma,
    id_estatus = EXCLUDED.id_estatus,
    id_sector_iaf = EXCLUDED.id_sector_iaf,
    id_subsector_iaf = EXCLUDED.id_subsector_iaf,
    id_organizacion = EXCLUDED.id_organizacion,
    multisitio = EXCLUDED.multisitio,
    deleted_at = NULL,
    updated_at = NOW();

-- Alcance registrado antes de generar la auditoría (trg_validar_auditoria_requiere_alcance)
INSERT INTO public.alcance (id, id_certificado, alcance_es, alcance_en) VALUES
    ('a1c00000-0000-0000-0000-000000000201', '40000000-0000-0000-0000-000000000201', 'Gestión de seguridad y salud en el trabajo en áreas de formulación estéril, síntesis, llenado aséptico, control microbiológico y almacenamiento de principios activos farmacéuticos (Subsector 13.1).', 'Occupational health and safety management in sterile formulation, synthesis, aseptic filling, microbiological control, and active pharmaceutical ingredient warehousing (Subsector 13.1).')
ON CONFLICT (id_certificado) WHERE deleted_at IS NULL DO UPDATE SET
    alcance_es = EXCLUDED.alcance_es,
    alcance_en = EXCLUDED.alcance_en,
    deleted_at = NULL,
    updated_at = NOW();

DO $$
DECLARE
    v_target_id UUID := '41000000-0000-0000-0000-000000000201'::UUID;
    v_cert_id UUID := '40000000-0000-0000-0000-000000000201'::UUID;
    v_existing_id UUID;
BEGIN
    IF EXISTS (SELECT 1 FROM public.certificado_version cv WHERE cv.id = v_target_id) THEN
        UPDATE public.certificado_version
        SET id_organizacion_version = '31000000-0000-0000-0000-000000000006'::UUID,
            es_version_actual = TRUE,
            notas_version = 'Versión vigente FN-SST-2026-201 (Sector 13 / Subsector 13.1).',
            id_estatus = 'a0000000-0000-0000-0000-000000000001'::UUID,
            id_sector_iaf = 'd0000000-0000-0000-0000-000000000013'::UUID,
            id_subsector_iaf = 'da000000-0000-0000-0000-000000000131'::UUID,
            multisitio = FALSE,
            deleted_at = NULL,
            deleted_by = NULL,
            delete_reason = NULL,
            updated_at = NOW()
        WHERE id = v_target_id;
    ELSE
        SELECT cv.id INTO v_existing_id
        FROM public.certificado_version cv
        WHERE cv.id_certificado = v_cert_id
          AND cv.version_numero = 1
        LIMIT 1;

        IF v_existing_id IS NOT NULL THEN
            UPDATE public.certificado_version
            SET id = v_target_id,
                id_organizacion_version = '31000000-0000-0000-0000-000000000006'::UUID,
                es_version_actual = TRUE,
                notas_version = 'Versión vigente FN-SST-2026-201 (Sector 13 / Subsector 13.1).',
                id_estatus = 'a0000000-0000-0000-0000-000000000001'::UUID,
                id_sector_iaf = 'd0000000-0000-0000-0000-000000000013'::UUID,
                id_subsector_iaf = 'da000000-0000-0000-0000-000000000131'::UUID,
                multisitio = FALSE,
                deleted_at = NULL,
                deleted_by = NULL,
                delete_reason = NULL,
                updated_at = NOW()
            WHERE id = v_existing_id;
        ELSE
            INSERT INTO public.certificado_version (
                id, id_certificado, id_organizacion_version, version_numero, es_version_actual,
                notas_version, id_estatus, id_sector_iaf, id_subsector_iaf, multisitio
            ) VALUES (
                v_target_id, v_cert_id, '31000000-0000-0000-0000-000000000006'::UUID, 1, TRUE,
                'Versión vigente FN-SST-2026-201 (Sector 13 / Subsector 13.1).',
                'a0000000-0000-0000-0000-000000000001'::UUID,
                'd0000000-0000-0000-0000-000000000013'::UUID,
                'da000000-0000-0000-0000-000000000131'::UUID,
                FALSE
            );
        END IF;
    END IF;
END $$;

INSERT INTO public.sitio (id, id_certificado, id_certificado_version, numero_sitio, nombre_sitio, direccion_sitio, personal_count) VALUES
    ('50000000-0000-0000-0000-000000000201', '40000000-0000-0000-0000-000000000201', '41000000-0000-0000-0000-000000000201', 0, 'Planta Farmacéutica Estéril Los Guayos HQ', 'Zona Industrial Los Guayos, Parcela F-14, Edo. Carabobo', 110)
ON CONFLICT (id_certificado_version, numero_sitio) WHERE deleted_at IS NULL DO UPDATE SET
    nombre_sitio = EXCLUDED.nombre_sitio,
    direccion_sitio = EXCLUDED.direccion_sitio,
    personal_count = EXCLUDED.personal_count,
    deleted_at = NULL,
    updated_at = NOW();

INSERT INTO public.vinculo (id, id_grupo_empresarial, codigo_vinculo, etiqueta, nivel_vinculacion, tipo_vinculacion, es_vinculada, tiene_sitio_temporal, notas) VALUES
    ('7c000000-0000-0000-0000-000000000201', '20000000-0000-0000-0000-000000000004', 'VINC-FAR-IND-01', 'Laboratorios Farmacéuticos del Centro C.A. · FN-SST-2026-201', 'INDIVIDUAL', 'Individual', FALSE, FALSE, 'Vínculo individual demostrativo para escenario Sector IAF 13 / Subsector 13.1 + ISO 45001:2018.')
ON CONFLICT (codigo_vinculo) WHERE codigo_vinculo IS NOT NULL AND deleted_at IS NULL DO UPDATE SET
    id_grupo_empresarial = EXCLUDED.id_grupo_empresarial,
    etiqueta = EXCLUDED.etiqueta,
    nivel_vinculacion = EXCLUDED.nivel_vinculacion,
    tipo_vinculacion = EXCLUDED.tipo_vinculacion,
    es_vinculada = EXCLUDED.es_vinculada,
    tiene_sitio_temporal = EXCLUDED.tiene_sitio_temporal,
    notas = EXCLUDED.notas,
    deleted_at = NULL,
    updated_at = NOW();

INSERT INTO public.vinculo_certificado (id, id_vinculo, id_certificado, tipo_vinculacion_override) VALUES
    ('7d000000-0000-0000-0000-000000000201', '7c000000-0000-0000-0000-000000000201', '40000000-0000-0000-0000-000000000201', NULL)
ON CONFLICT (id_certificado) WHERE deleted_at IS NULL DO UPDATE SET
    id_vinculo = EXCLUDED.id_vinculo,
    tipo_vinculacion_override = EXCLUDED.tipo_vinculacion_override,
    deleted_at = NULL,
    updated_at = NOW();

INSERT INTO public.programa_auditoria (id, id_vinculo, id_grupo_empresarial, codigo_programa, etiqueta, nivel_vinculacion, tipo_vinculacion, es_vinculada, tiene_sitio_temporal, id_ciclo_origen, notas) VALUES
    ('7a000000-0000-0000-0000-000000000201', '7c000000-0000-0000-0000-000000000201', '20000000-0000-0000-0000-000000000004', 'PROG-FAR-2026-001', 'Etapa 2 SST Laboratorios Farmacéuticos (Subsector 13.1)', 'INDIVIDUAL', 'Individual', FALSE, FALSE, NULL, 'Programa demostrativo ISO 45001:2018 en Sector 13 / Subsector 13.1 con brecha sectorial cubierta por Experto Técnico.')
ON CONFLICT (codigo_programa) WHERE codigo_programa IS NOT NULL AND deleted_at IS NULL DO UPDATE SET
    id_vinculo = EXCLUDED.id_vinculo,
    id_grupo_empresarial = EXCLUDED.id_grupo_empresarial,
    etiqueta = EXCLUDED.etiqueta,
    nivel_vinculacion = EXCLUDED.nivel_vinculacion,
    tipo_vinculacion = EXCLUDED.tipo_vinculacion,
    es_vinculada = EXCLUDED.es_vinculada,
    tiene_sitio_temporal = EXCLUDED.tiene_sitio_temporal,
    id_ciclo_origen = EXCLUDED.id_ciclo_origen,
    notas = EXCLUDED.notas,
    deleted_at = NULL,
    updated_at = NOW();

INSERT INTO public.auditoria (id, id_programa_auditoria, codigo_auditoria, id_certificado, id_tipo_auditoria, id_metodologia, tipo_vinculacion, tiempo_auditoria, estado_ciclo, tiene_sitio_temporal, objetivo) VALUES
    ('80000000-0000-0000-0000-000000000201', '7a000000-0000-0000-0000-000000000201', 'AUD-FAR-2026-001', '40000000-0000-0000-0000-000000000201', 'b0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 'Individual', 2.00, 'Programada', FALSE, 'Evaluación Etapa 2 ISO 45001:2018 en planta farmacéutica estéril (Subsector 13.1) con acompañamiento de Experto Técnico.')
ON CONFLICT (codigo_auditoria) WHERE codigo_auditoria IS NOT NULL AND deleted_at IS NULL DO UPDATE SET
    id_programa_auditoria = EXCLUDED.id_programa_auditoria,
    id_certificado = EXCLUDED.id_certificado,
    id_tipo_auditoria = EXCLUDED.id_tipo_auditoria,
    id_metodologia = EXCLUDED.id_metodologia,
    tipo_vinculacion = EXCLUDED.tipo_vinculacion,
    tiempo_auditoria = EXCLUDED.tiempo_auditoria,
    estado_ciclo = EXCLUDED.estado_ciclo,
    fecha_cierre_auditoria = NULL,
    revisado = FALSE,
    fecha_revision = NULL,
    revisado_por = NULL,
    usuario_revisor_id = NULL,
    documentacion_completa = FALSE,
    resumen_revision = NULL,
    tiene_sitio_temporal = EXCLUDED.tiene_sitio_temporal,
    objetivo = EXCLUDED.objetivo,
    deleted_at = NULL,
    updated_at = NOW();

DO $$
BEGIN
    UPDATE public.sitios_por_auditoria sa
    SET id = '90000000-0000-0000-0000-000000000201'::UUID
    WHERE sa.id_auditoria = '80000000-0000-0000-0000-000000000201'::UUID
      AND sa.id_sitio = '50000000-0000-0000-0000-000000000201'::UUID
      AND sa.deleted_at IS NULL
      AND sa.id IS DISTINCT FROM '90000000-0000-0000-0000-000000000201'::UUID
      AND NOT EXISTS (
          SELECT 1 FROM public.sitios_por_auditoria existing
          WHERE existing.id = '90000000-0000-0000-0000-000000000201'::UUID
      );
END $$;

INSERT INTO public.sitios_por_auditoria (id, id_auditoria, id_sitio, tiempo_auditoria, modalidad_evaluacion, fecha_inicio, fecha_fin, notas_sitio) VALUES
    ('90000000-0000-0000-0000-000000000201', '80000000-0000-0000-0000-000000000201', '50000000-0000-0000-0000-000000000201', 2.00, 'Presencial', (CURRENT_DATE + INTERVAL '45 days')::DATE, (CURRENT_DATE + INTERVAL '46 days')::DATE, 'Evaluación presencial en áreas limpias de formulación estéril y almacén de principios activos (110 personas).')
ON CONFLICT (id_auditoria, id_sitio) WHERE deleted_at IS NULL DO UPDATE SET
    tiempo_auditoria = EXCLUDED.tiempo_auditoria,
    modalidad_evaluacion = EXCLUDED.modalidad_evaluacion,
    fecha_inicio = EXCLUDED.fecha_inicio,
    fecha_fin = EXCLUDED.fecha_fin,
    notas_sitio = EXCLUDED.notas_sitio,
    deleted_at = NULL;

INSERT INTO public.auditoria_fecha (id, id_auditoria, numero_secuencia, tag, tipo_fecha, anio, mes, fecha_inicio, fecha_fin, observacion) VALUES
    ('81000000-0000-0000-0000-000000000201', '80000000-0000-0000-0000-000000000201', 1, 'Programación', 'PROGRAMADA_EXACTA', NULL, NULL, (CURRENT_DATE + INTERVAL '45 days')::DATE, (CURRENT_DATE + INTERVAL '46 days')::DATE, 'Fecha exacta confirmada Etapa 2 SST Laboratorios Farmacéuticos (Subsector 13.1).')
ON CONFLICT (id_auditoria, numero_secuencia) WHERE deleted_at IS NULL DO UPDATE SET
    tag = EXCLUDED.tag,
    tipo_fecha = EXCLUDED.tipo_fecha,
    anio = EXCLUDED.anio,
    mes = EXCLUDED.mes,
    fecha_inicio = EXCLUDED.fecha_inicio,
    fecha_fin = EXCLUDED.fecha_fin,
    observacion = EXCLUDED.observacion,
    deleted_at = NULL,
    updated_at = NOW();

-- Auditor calificado en ISO 45001:2018 (Leonardo Antonio Rojas Gómez) sin competencia en Sector 13 / Subsector 13.1
INSERT INTO public.equipo_auditor_sitio (id, id_sitios_por_auditoria, id_auditor, rol_auditor, tiempo_auditoria, asignacion_completa_sitio) VALUES
    ('98000000-0000-0000-0000-000000000201', '90000000-0000-0000-0000-000000000201', '10000000-0000-0000-0000-000000000004', 'AUDITOR_LIDER', 2.00, TRUE)
ON CONFLICT (id_sitios_por_auditoria, id_auditor) WHERE deleted_at IS NULL DO UPDATE SET
    rol_auditor = EXCLUDED.rol_auditor,
    tiempo_auditoria = EXCLUDED.tiempo_auditoria,
    asignacion_completa_sitio = EXCLUDED.asignacion_completa_sitio,
    deleted_at = NULL,
    updated_at = NOW();

-- Asignación global de Experto Técnico en Subsector 13.1 cubriendo la brecha sectorial IAF
INSERT INTO public.experto_tecnico_auditoria (id, id_auditoria, id_experto_tecnico, dias_asignados, observacion) VALUES
    ('1e300000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000201', '1e000000-0000-0000-0000-000000000001', 1.00, 'Acompañamiento técnico en áreas de formulación estéril y manejo de principios activos (Subsector 13.1).')
ON CONFLICT (id_auditoria, id_experto_tecnico) WHERE deleted_at IS NULL DO UPDATE SET
    dias_asignados = EXCLUDED.dias_asignados,
    observacion = EXCLUDED.observacion,
    deleted_at = NULL,
    deleted_by = NULL,
    updated_at = NOW();

-- 29. Conglomerado Nestlé Venezuela (Nestlé Venezuela, S.A. + Nestlé Cadipro, S.A.)
INSERT INTO public.grupo_empresarial (id, codigo_grupo, nombre, abreviacion, es_individual_auto, notas) VALUES
    ('75013027-4394-49f1-8405-c5fba8f82ed0', 'NESTLE', 'Nestlé Venezuela', 'NESTLÉ', FALSE, 'Agrupa "Nestlé Venezuela, S.A." y "Nestlé Cadipro, S.A."')
ON CONFLICT (id) DO UPDATE SET
    codigo_grupo = EXCLUDED.codigo_grupo,
    nombre = EXCLUDED.nombre,
    abreviacion = EXCLUDED.abreviacion,
    es_individual_auto = EXCLUDED.es_individual_auto,
    notas = EXCLUDED.notas,
    deleted_at = NULL,
    deleted_by = NULL,
    delete_reason = NULL,
    updated_at = NOW();

INSERT INTO public.organizacion (id, id_grupo_empresarial, nombre, abreviacion, rif, direccion_fiscal) VALUES
    ('41ece51a-97ac-4249-8686-5a08daf060c3', '75013027-4394-49f1-8405-c5fba8f82ed0', 'Nestlé Venezuela, S.A.', 'NESTLÉ', 'J-00012926-6', 'Calle Altagracia, Edificio P&G, Piso 3, Urbanización Sorokaima, Sector La Trinidad, Zona Postal 1080, Caracas, Venezuela'),
    ('78af57af-ce42-48e0-a488-ab11d61d0c19', '75013027-4394-49f1-8405-c5fba8f82ed0', 'Nestlé Cadipro, S.A.', 'NESTLÉ CADIPRO', 'J-00102438-7', 'Calle Altagracia, Edificio P&G, Piso 3, Urbanización Sorokaima, Sector La Trinidad, Zona Postal 1080, Caracas, Venezuela')
ON CONFLICT (id) DO UPDATE SET
    id_grupo_empresarial = EXCLUDED.id_grupo_empresarial,
    nombre = EXCLUDED.nombre,
    abreviacion = EXCLUDED.abreviacion,
    rif = EXCLUDED.rif,
    direccion_fiscal = EXCLUDED.direccion_fiscal,
    deleted_at = NULL,
    deleted_by = NULL,
    delete_reason = NULL,
    updated_at = NOW();

DO $$
DECLARE
    v_target_id UUID := '9494773f-b4c6-44bd-8bea-af51a29a0b22'::UUID;
    v_org_id UUID := '41ece51a-97ac-4249-8686-5a08daf060c3'::UUID;
    v_existing_id UUID;
BEGIN
    IF EXISTS (SELECT 1 FROM public.organizacion_version ov WHERE ov.id = v_target_id) THEN
        UPDATE public.organizacion_version
        SET es_version_actual = TRUE,
            notas_version = 'Versión inicial Nestlé Venezuela, S.A.',
            nombre = 'Nestlé Venezuela, S.A.',
            abreviacion = 'NESTLÉ',
            rif = 'J-00012926-6',
            direccion_fiscal = 'Calle Altagracia, Edificio P&G, Piso 3, Urbanización Sorokaima, Sector La Trinidad, Zona Postal 1080, Caracas, Venezuela',
            deleted_at = NULL,
            deleted_by = NULL,
            delete_reason = NULL,
            updated_at = NOW()
        WHERE id = v_target_id;
    ELSE
        SELECT ov.id INTO v_existing_id
        FROM public.organizacion_version ov
        WHERE ov.id_organizacion = v_org_id
          AND ov.version_numero = 1
        LIMIT 1;

        IF v_existing_id IS NOT NULL THEN
            UPDATE public.organizacion_version
            SET id = v_target_id,
                es_version_actual = TRUE,
                notas_version = 'Versión inicial Nestlé Venezuela, S.A.',
                nombre = 'Nestlé Venezuela, S.A.',
                abreviacion = 'NESTLÉ',
                rif = 'J-00012926-6',
                direccion_fiscal = 'Calle Altagracia, Edificio P&G, Piso 3, Urbanización Sorokaima, Sector La Trinidad, Zona Postal 1080, Caracas, Venezuela',
                deleted_at = NULL,
                deleted_by = NULL,
                delete_reason = NULL,
                updated_at = NOW()
            WHERE id = v_existing_id;
        ELSE
            INSERT INTO public.organizacion_version (
                id, id_organizacion, version_numero, es_version_actual, notas_version,
                nombre, abreviacion, rif, direccion_fiscal
            ) VALUES (
                v_target_id, v_org_id, 1, TRUE, 'Versión inicial Nestlé Venezuela, S.A.',
                'Nestlé Venezuela, S.A.', 'NESTLÉ', 'J-00012926-6',
                'Calle Altagracia, Edificio P&G, Piso 3, Urbanización Sorokaima, Sector La Trinidad, Zona Postal 1080, Caracas, Venezuela'
            )
            ON CONFLICT (id) DO NOTHING;
        END IF;
    END IF;
END $$;

DO $$
DECLARE
    v_target_id UUID := '189dd484-daa1-4a45-a283-fee1b0a82abf'::UUID;
    v_org_id UUID := '78af57af-ce42-48e0-a488-ab11d61d0c19'::UUID;
    v_existing_id UUID;
BEGIN
    IF EXISTS (SELECT 1 FROM public.organizacion_version ov WHERE ov.id = v_target_id) THEN
        UPDATE public.organizacion_version
        SET es_version_actual = TRUE,
            notas_version = 'Versión inicial Nestlé Cadipro, S.A.',
            nombre = 'Nestlé Cadipro, S.A.',
            abreviacion = 'NESTLÉ CADIPRO',
            rif = 'J-00102438-7',
            direccion_fiscal = 'Calle Altagracia, Edificio P&G, Piso 3, Urbanización Sorokaima, Sector La Trinidad, Zona Postal 1080, Caracas, Venezuela',
            deleted_at = NULL,
            deleted_by = NULL,
            delete_reason = NULL,
            updated_at = NOW()
        WHERE id = v_target_id;
    ELSE
        SELECT ov.id INTO v_existing_id
        FROM public.organizacion_version ov
        WHERE ov.id_organizacion = v_org_id
          AND ov.version_numero = 1
        LIMIT 1;

        IF v_existing_id IS NOT NULL THEN
            UPDATE public.organizacion_version
            SET id = v_target_id,
                es_version_actual = TRUE,
                notas_version = 'Versión inicial Nestlé Cadipro, S.A.',
                nombre = 'Nestlé Cadipro, S.A.',
                abreviacion = 'NESTLÉ CADIPRO',
                rif = 'J-00102438-7',
                direccion_fiscal = 'Calle Altagracia, Edificio P&G, Piso 3, Urbanización Sorokaima, Sector La Trinidad, Zona Postal 1080, Caracas, Venezuela',
                deleted_at = NULL,
                deleted_by = NULL,
                delete_reason = NULL,
                updated_at = NOW()
            WHERE id = v_existing_id;
        ELSE
            INSERT INTO public.organizacion_version (
                id, id_organizacion, version_numero, es_version_actual, notas_version,
                nombre, abreviacion, rif, direccion_fiscal
            ) VALUES (
                v_target_id, v_org_id, 1, TRUE, 'Versión inicial Nestlé Cadipro, S.A.',
                'Nestlé Cadipro, S.A.', 'NESTLÉ CADIPRO', 'J-00102438-7',
                'Calle Altagracia, Edificio P&G, Piso 3, Urbanización Sorokaima, Sector La Trinidad, Zona Postal 1080, Caracas, Venezuela'
            )
            ON CONFLICT (id) DO NOTHING;
        END IF;
    END IF;
END $$;

INSERT INTO public.certificado (id, id_norma, id_estatus, id_sector_iaf, id_subsector_iaf, id_organizacion, numero_certificado, multisitio) VALUES
    ('14c1c36d-636e-437e-97ba-08ad845908f1', 'e0000000-0000-0000-0000-000000009001', 'a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000003', 'da000000-0000-0000-0000-000000000031', '78af57af-ce42-48e0-a488-ab11d61d0c19', '9001-885-03-10-2020', FALSE),
    ('7b958a33-e557-44b6-b31e-17d74b506aba', 'e0000000-0000-0000-0000-000000014001', 'a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000003', 'da000000-0000-0000-0000-000000000031', '78af57af-ce42-48e0-a488-ab11d61d0c19', '14001-085-03-10-2020', FALSE),
    ('fe3d32fa-1b85-429f-8c40-f49dc41b1b5b', 'e0000000-0000-0000-0000-000000045001', 'a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000003', 'da000000-0000-0000-0000-000000000031', '78af57af-ce42-48e0-a488-ab11d61d0c19', '45001-041-03-10-2020', FALSE)
ON CONFLICT (numero_certificado) WHERE deleted_at IS NULL DO UPDATE SET
    id_norma = EXCLUDED.id_norma,
    id_estatus = EXCLUDED.id_estatus,
    id_sector_iaf = EXCLUDED.id_sector_iaf,
    id_subsector_iaf = EXCLUDED.id_subsector_iaf,
    id_organizacion = EXCLUDED.id_organizacion,
    multisitio = EXCLUDED.multisitio,
    deleted_at = NULL,
    deleted_by = NULL,
    delete_reason = NULL,
    updated_at = NOW();

DO $$
DECLARE
    v_rec RECORD;
    v_existing_id UUID;
BEGIN
    FOR v_rec IN
        SELECT *
        FROM (VALUES
            ('178d5ccc-2b6f-4e82-8855-05f9b2f7bada'::UUID, '14c1c36d-636e-437e-97ba-08ad845908f1'::UUID, 'Versión vigente 9001-885-03-10-2020.'),
            ('9796af20-43f6-4ea6-80d9-c9da191dc4f1'::UUID, '7b958a33-e557-44b6-b31e-17d74b506aba'::UUID, 'Versión vigente 14001-085-03-10-2020.'),
            ('2a36039f-fa67-47aa-b5d3-fd482e165097'::UUID, 'fe3d32fa-1b85-429f-8c40-f49dc41b1b5b'::UUID, 'Versión vigente 45001-041-03-10-2020.')
        ) AS t(target_id, cert_id, notas)
    LOOP
        IF EXISTS (SELECT 1 FROM public.certificado_version cv WHERE cv.id = v_rec.target_id) THEN
            UPDATE public.certificado_version
            SET id_organizacion_version = '189dd484-daa1-4a45-a283-fee1b0a82abf'::UUID,
                es_version_actual = TRUE,
                notas_version = v_rec.notas,
                id_estatus = 'a0000000-0000-0000-0000-000000000001'::UUID,
                id_sector_iaf = 'd0000000-0000-0000-0000-000000000003'::UUID,
                id_subsector_iaf = 'da000000-0000-0000-0000-000000000031'::UUID,
                multisitio = FALSE,
                deleted_at = NULL,
                deleted_by = NULL,
                delete_reason = NULL,
                updated_at = NOW()
            WHERE id = v_rec.target_id;
        ELSE
            SELECT cv.id INTO v_existing_id
            FROM public.certificado_version cv
            WHERE cv.id_certificado = v_rec.cert_id
              AND cv.version_numero = 1
            LIMIT 1;

            IF v_existing_id IS NOT NULL THEN
                UPDATE public.certificado_version
                SET id = v_rec.target_id,
                    id_organizacion_version = '189dd484-daa1-4a45-a283-fee1b0a82abf'::UUID,
                    es_version_actual = TRUE,
                    notas_version = v_rec.notas,
                    id_estatus = 'a0000000-0000-0000-0000-000000000001'::UUID,
                    id_sector_iaf = 'd0000000-0000-0000-0000-000000000003'::UUID,
                    id_subsector_iaf = 'da000000-0000-0000-0000-000000000031'::UUID,
                    multisitio = FALSE,
                    deleted_at = NULL,
                    deleted_by = NULL,
                    delete_reason = NULL,
                    updated_at = NOW()
                WHERE id = v_existing_id;
            ELSE
                INSERT INTO public.certificado_version (
                    id, id_certificado, id_organizacion_version, version_numero, es_version_actual,
                    notas_version, id_estatus, id_sector_iaf, id_subsector_iaf, multisitio
                ) VALUES (
                    v_rec.target_id, v_rec.cert_id, '189dd484-daa1-4a45-a283-fee1b0a82abf'::UUID, 1, TRUE,
                    v_rec.notas,
                    'a0000000-0000-0000-0000-000000000001'::UUID,
                    'd0000000-0000-0000-0000-000000000003'::UUID,
                    'da000000-0000-0000-0000-000000000031'::UUID,
                    FALSE
                )
                ON CONFLICT (id) DO NOTHING;
            END IF;
        END IF;
    END LOOP;
END $$;

INSERT INTO public.alcance (id, id_certificado, alcance_es, alcance_en) VALUES
    ('0e0dde35-a862-4f42-a509-efa0b1b615f0', '14c1c36d-636e-437e-97ba-08ad845908f1', 'Fabricación para uso industrial de leche en polvo entera (26% estabilizada), leche descremada, crema de leche; desde la recepción de la leche fresca hasta la entrega', 'Manufacture of whole milk powder (26% stabilized), skim milk, cream for industrial use; from the reception of fresh milk to delivery')
ON CONFLICT (id_certificado) WHERE deleted_at IS NULL DO UPDATE SET
    alcance_es = EXCLUDED.alcance_es,
    alcance_en = EXCLUDED.alcance_en,
    deleted_at = NULL,
    deleted_by = NULL,
    delete_reason = NULL,
    updated_at = NOW();

INSERT INTO public.alcance_certificado_compartido (id, id_alcance, id_certificado) VALUES
    ('340e351e-5edb-4b51-ab6d-01437afb32a9', '0e0dde35-a862-4f42-a509-efa0b1b615f0', '7b958a33-e557-44b6-b31e-17d74b506aba'),
    ('a9bef3bd-a9a0-4c50-942d-a5ac9835bc7a', '0e0dde35-a862-4f42-a509-efa0b1b615f0', 'fe3d32fa-1b85-429f-8c40-f49dc41b1b5b')
ON CONFLICT (id_certificado) WHERE deleted_at IS NULL DO UPDATE SET
    id_alcance = EXCLUDED.id_alcance,
    deleted_at = NULL,
    deleted_by = NULL,
    updated_at = NOW();

INSERT INTO public.sitio (id, id_certificado, id_certificado_version, numero_sitio, nombre_sitio, direccion_sitio, personal_count) VALUES
    ('6efe5ad5-81a8-4a06-8107-1b7b65712ca7', '14c1c36d-636e-437e-97ba-08ad845908f1', '178d5ccc-2b6f-4e82-8855-05f9b2f7bada', 0, 'Planta CADIPRO', 'Km. 1, Vía La Morita, San Rafael del Piñal, Municipio Fernández Feo, Edo. Táchira, Código Postal: 5032, Venezuela.', 102)
ON CONFLICT (id_certificado_version, numero_sitio) WHERE deleted_at IS NULL DO UPDATE SET
    nombre_sitio = EXCLUDED.nombre_sitio,
    direccion_sitio = EXCLUDED.direccion_sitio,
    personal_count = EXCLUDED.personal_count,
    deleted_at = NULL,
    deleted_by = NULL,
    delete_reason = NULL,
    updated_at = NOW();

INSERT INTO public.sitio_certificado_compartido (id, id_sitio, id_certificado, id_certificado_version, numero_sitio) VALUES
    ('0d5d541e-48cc-4d9a-a6e2-a34fe31c90e4', '6efe5ad5-81a8-4a06-8107-1b7b65712ca7', '7b958a33-e557-44b6-b31e-17d74b506aba', '9796af20-43f6-4ea6-80d9-c9da191dc4f1', 0),
    ('808731ec-951b-4dce-8234-74c18df3bb04', '6efe5ad5-81a8-4a06-8107-1b7b65712ca7', 'fe3d32fa-1b85-429f-8c40-f49dc41b1b5b', '2a36039f-fa67-47aa-b5d3-fd482e165097', 0)
ON CONFLICT (id_sitio, id_certificado_version) WHERE deleted_at IS NULL DO UPDATE SET
    numero_sitio = EXCLUDED.numero_sitio,
    deleted_at = NULL,
    deleted_by = NULL,
    updated_at = NOW();

INSERT INTO public.fecha_certificado (id, id_certificado, id_certificado_version, fecha, tipo_fecha) VALUES
    ('be804394-ed26-4ea7-99f3-798f4f73c498', '14c1c36d-636e-437e-97ba-08ad845908f1', '178d5ccc-2b6f-4e82-8855-05f9b2f7bada', '2020-10-30', 'Otorgamiento'),
    ('a0aa6eec-d6da-4b27-b9a8-e43f6d22a529', '14c1c36d-636e-437e-97ba-08ad845908f1', '178d5ccc-2b6f-4e82-8855-05f9b2f7bada', '2023-10-30', 'Renovación'),
    ('66da15fc-b450-4df9-b2f3-0b265f38880a', '14c1c36d-636e-437e-97ba-08ad845908f1', '178d5ccc-2b6f-4e82-8855-05f9b2f7bada', '2026-10-29', 'Vencimiento'),
    ('e11d23a2-2bd0-4e52-a722-ffce9ac3fbdd', '14c1c36d-636e-437e-97ba-08ad845908f1', '178d5ccc-2b6f-4e82-8855-05f9b2f7bada', '2026-03-27', 'Modificación'),
    ('04b9839a-0909-489b-aed7-c203af93ded7', '7b958a33-e557-44b6-b31e-17d74b506aba', '9796af20-43f6-4ea6-80d9-c9da191dc4f1', '2020-10-30', 'Otorgamiento'),
    ('62628bfa-dd20-4a1c-bf70-b9ffb3b4e69c', '7b958a33-e557-44b6-b31e-17d74b506aba', '9796af20-43f6-4ea6-80d9-c9da191dc4f1', '2023-10-30', 'Renovación'),
    ('c2f326e7-3e73-4297-8dc6-bdfeea56ada2', '7b958a33-e557-44b6-b31e-17d74b506aba', '9796af20-43f6-4ea6-80d9-c9da191dc4f1', '2026-10-29', 'Vencimiento'),
    ('c4416b44-4d8b-488d-bce6-37f45c7e22e9', '7b958a33-e557-44b6-b31e-17d74b506aba', '9796af20-43f6-4ea6-80d9-c9da191dc4f1', '2026-03-27', 'Modificación'),
    ('b94fc397-5abb-4ebd-b5e0-d8c81396611d', 'fe3d32fa-1b85-429f-8c40-f49dc41b1b5b', '2a36039f-fa67-47aa-b5d3-fd482e165097', '2020-10-30', 'Otorgamiento'),
    ('b6e1b28f-3ab0-4290-9968-dd6904d23e24', 'fe3d32fa-1b85-429f-8c40-f49dc41b1b5b', '2a36039f-fa67-47aa-b5d3-fd482e165097', '2023-10-30', 'Renovación'),
    ('846bcbac-3754-47e6-990d-41db3fbca127', 'fe3d32fa-1b85-429f-8c40-f49dc41b1b5b', '2a36039f-fa67-47aa-b5d3-fd482e165097', '2026-10-29', 'Vencimiento'),
    ('e8bcad93-79a8-4b7f-82f5-c85ab16480ad', 'fe3d32fa-1b85-429f-8c40-f49dc41b1b5b', '2a36039f-fa67-47aa-b5d3-fd482e165097', '2026-03-27', 'Modificación')
ON CONFLICT (id_certificado_version, tipo_fecha, fecha) WHERE deleted_at IS NULL DO UPDATE SET
    deleted_at = NULL,
    deleted_by = NULL,
    delete_reason = NULL,
    updated_at = NOW();

INSERT INTO public.contacto_certificado (id, id_certificado, id_certificado_version, nombre, cargo) VALUES
    ('df04e489-a83d-4262-b0dc-e82fdb8e9b24', '14c1c36d-636e-437e-97ba-08ad845908f1', '178d5ccc-2b6f-4e82-8855-05f9b2f7bada', 'Elena Torres', 'Jefe Cumplimiento de Calidad'),
    ('d0a3f64c-fd63-43b7-ac1e-4d15b4c48566', '14c1c36d-636e-437e-97ba-08ad845908f1', '178d5ccc-2b6f-4e82-8855-05f9b2f7bada', 'Luz Mora', 'Jefe de Calidad'),
    ('8faf3cfc-4f78-4317-82a4-8b8b7d61b7ae', '14c1c36d-636e-437e-97ba-08ad845908f1', '178d5ccc-2b6f-4e82-8855-05f9b2f7bada', 'Maria Vélez', 'Gerente')
ON CONFLICT (id_certificado_version, LOWER(TRIM(nombre))) WHERE deleted_at IS NULL DO UPDATE SET
    nombre = EXCLUDED.nombre,
    cargo = EXCLUDED.cargo,
    deleted_at = NULL,
    deleted_by = NULL,
    delete_reason = NULL,
    updated_at = NOW();

INSERT INTO public.telefono_contacto_certificado (id, id_contacto, telefono, tipo_telefono) VALUES
    ('c9131535-b25d-406a-abb8-16b2bc67810c', 'df04e489-a83d-4262-b0dc-e82fdb8e9b24', '0424-5307237', 'Móvil'),
    ('49921012-184e-482f-af8b-5e072373ce69', 'd0a3f64c-fd63-43b7-ac1e-4d15b4c48566', '0414-7375697', 'Móvil'),
    ('17b3c6fe-91f1-4026-a9d9-a549c241baf4', '8faf3cfc-4f78-4317-82a4-8b8b7d61b7ae', '0424-1444289', 'Móvil')
ON CONFLICT (id_contacto, TRIM(telefono)) WHERE deleted_at IS NULL DO UPDATE SET
    tipo_telefono = EXCLUDED.tipo_telefono,
    deleted_at = NULL,
    deleted_by = NULL,
    updated_at = NOW();

INSERT INTO public.email_contacto_certificado (id, id_contacto, email, tipo_email) VALUES
    ('81cbdd0f-23b4-46a4-8ec7-a23ccfe740a7', 'df04e489-a83d-4262-b0dc-e82fdb8e9b24', 'elena.Torres@ve.nestle.com', 'Trabajo'),
    ('96ffe550-95b9-468c-ab2e-0484efe6b237', 'd0a3f64c-fd63-43b7-ac1e-4d15b4c48566', 'luz.Mora@ve.nestle.com', 'Trabajo'),
    ('72498212-5724-4e8a-81e2-c09846f41549', '8faf3cfc-4f78-4317-82a4-8b8b7d61b7ae', 'maria.veliz@ve.nestle.com', 'Trabajo')
ON CONFLICT (id_contacto, LOWER(TRIM(email))) WHERE deleted_at IS NULL DO UPDATE SET
    email = EXCLUDED.email,
    tipo_email = EXCLUDED.tipo_email,
    deleted_at = NULL,
    deleted_by = NULL,
    updated_at = NOW();

INSERT INTO public.contacto_certificado_compartido (id, id_contacto, id_certificado, id_certificado_version) VALUES
    ('e8bf8b18-6106-4d4c-84f9-0b9d39ff5999', 'df04e489-a83d-4262-b0dc-e82fdb8e9b24', '7b958a33-e557-44b6-b31e-17d74b506aba', '9796af20-43f6-4ea6-80d9-c9da191dc4f1'),
    ('8febd42c-71e3-4307-95c4-a97430f46c0a', 'df04e489-a83d-4262-b0dc-e82fdb8e9b24', 'fe3d32fa-1b85-429f-8c40-f49dc41b1b5b', '2a36039f-fa67-47aa-b5d3-fd482e165097'),
    ('90c90b99-ac46-4859-bc6d-b5a4d8b67d81', 'd0a3f64c-fd63-43b7-ac1e-4d15b4c48566', '7b958a33-e557-44b6-b31e-17d74b506aba', '9796af20-43f6-4ea6-80d9-c9da191dc4f1'),
    ('b0087e05-c6f8-41ef-8b3a-cf5650b3b266', 'd0a3f64c-fd63-43b7-ac1e-4d15b4c48566', 'fe3d32fa-1b85-429f-8c40-f49dc41b1b5b', '2a36039f-fa67-47aa-b5d3-fd482e165097'),
    ('051ec085-3ddc-4a61-8676-4f3b68ea05ff', '8faf3cfc-4f78-4317-82a4-8b8b7d61b7ae', '7b958a33-e557-44b6-b31e-17d74b506aba', '9796af20-43f6-4ea6-80d9-c9da191dc4f1'),
    ('1d711e76-84a0-42d6-8db7-b51dd09f95a5', '8faf3cfc-4f78-4317-82a4-8b8b7d61b7ae', 'fe3d32fa-1b85-429f-8c40-f49dc41b1b5b', '2a36039f-fa67-47aa-b5d3-fd482e165097')
ON CONFLICT (id_contacto, id_certificado_version) WHERE deleted_at IS NULL DO UPDATE SET
    deleted_at = NULL,
    deleted_by = NULL,
    updated_at = NOW();

INSERT INTO public.proceso (id, id_certificado, id_certificado_version, nombre_proceso, tipo) VALUES
    ('277b91c1-13b4-40b2-8c87-aacda28a1cf9', 'fe3d32fa-1b85-429f-8c40-f49dc41b1b5b', '2a36039f-fa67-47aa-b5d3-fd482e165097', 'Calidad y SHE', 'Medular'),
    ('2b78cc36-3a6d-4c60-a15f-cc7d5861b9d0', 'fe3d32fa-1b85-429f-8c40-f49dc41b1b5b', '2a36039f-fa67-47aa-b5d3-fd482e165097', 'Aseguramiento de la Calidad', 'Medular'),
    ('3df50835-103e-42ac-94aa-5a2e00dc45a2', 'fe3d32fa-1b85-429f-8c40-f49dc41b1b5b', '2a36039f-fa67-47aa-b5d3-fd482e165097', 'Dirección', 'Estratégico'),
    ('d07d97d6-52a4-4d0b-8134-e1ac22b9e30f', 'fe3d32fa-1b85-429f-8c40-f49dc41b1b5b', '2a36039f-fa67-47aa-b5d3-fd482e165097', 'Comunicación', 'De Apoyo'),
    ('155653f1-6a58-433e-ae34-f717914b544a', 'fe3d32fa-1b85-429f-8c40-f49dc41b1b5b', '2a36039f-fa67-47aa-b5d3-fd482e165097', 'Recursos e Ingeniería técnica', 'De Apoyo'),
    ('e6e080f2-b7bd-493d-959d-5c025b404b17', 'fe3d32fa-1b85-429f-8c40-f49dc41b1b5b', '2a36039f-fa67-47aa-b5d3-fd482e165097', 'Logística Física, Preservación y Despacho', 'Medular'),
    ('ea8d2f87-3b50-42ff-8d25-5eb042a05fd4', 'fe3d32fa-1b85-429f-8c40-f49dc41b1b5b', '2a36039f-fa67-47aa-b5d3-fd482e165097', 'Finanzas y Control', 'Estratégico'),
    ('25b185b5-9d30-4b9f-938e-51f28166c90d', 'fe3d32fa-1b85-429f-8c40-f49dc41b1b5b', '2a36039f-fa67-47aa-b5d3-fd482e165097', 'Laboratorio de Aseguramiento', 'Medular'),
    ('6251ec94-fb7c-41f0-a1f7-82de11477809', 'fe3d32fa-1b85-429f-8c40-f49dc41b1b5b', '2a36039f-fa67-47aa-b5d3-fd482e165097', 'Servicio Médico Ocupacional', 'De Apoyo'),
    ('c76aef9e-8d19-4c3a-93a6-9f7ad32ad0e6', 'fe3d32fa-1b85-429f-8c40-f49dc41b1b5b', '2a36039f-fa67-47aa-b5d3-fd482e165097', 'Recursos Humanos', 'De Apoyo')
ON CONFLICT (id_certificado_version, LOWER(TRIM(nombre_proceso))) WHERE deleted_at IS NULL DO UPDATE SET
    nombre_proceso = EXCLUDED.nombre_proceso,
    tipo = EXCLUDED.tipo,
    deleted_at = NULL,
    deleted_by = NULL,
    delete_reason = NULL,
    updated_at = NOW();

INSERT INTO public.turnos_por_sitio (id, id_sitio, id_turno) VALUES
    ('29d2e2ac-d3bd-4d98-9a05-ae4133829eaa', '6efe5ad5-81a8-4a06-8107-1b7b65712ca7', '70000000-0000-0000-0000-000000000004')
ON CONFLICT (id_sitio, id_turno) WHERE deleted_at IS NULL DO UPDATE SET
    deleted_at = NULL,
    deleted_by = NULL;

INSERT INTO public.turno_certificado_compartido (id, id_turno, id_certificado, id_certificado_version, id_certificado_origen) VALUES
    ('2c88e8ec-85d1-4244-a64b-f2b170c10000', '70000000-0000-0000-0000-000000000004', 'fe3d32fa-1b85-429f-8c40-f49dc41b1b5b', '2a36039f-fa67-47aa-b5d3-fd482e165097', '14c1c36d-636e-437e-97ba-08ad845908f1')
ON CONFLICT (id_turno, id_certificado_version) WHERE deleted_at IS NULL DO UPDATE SET
    id_certificado_origen = EXCLUDED.id_certificado_origen,
    deleted_at = NULL,
    deleted_by = NULL,
    updated_at = NOW();