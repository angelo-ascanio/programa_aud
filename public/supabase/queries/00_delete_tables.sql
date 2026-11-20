-- ============================================================================
-- FILE 0: 00_DELETE_TABLES.SQL (Reinicio Seguro del Esquema Public)
-- Jerarquía principal de Certificación y Auditorías:
--   grupo_empresarial (Conglomerado; obligatorio sobre organizacion)
--     └── organizacion -> certificado -> sitio / proceso
--   programa_auditoria (INDIVIDUAL | NIVEL_1_INTRA_ORG | NIVEL_2_INTER_ORG)
--     └── auditoria (1 por certificado participante)
--           ├── auditoria_fecha (1:N PREPROGRAMADA_MES | REAL)
--           └── sitios_por_auditoria -> procesos_sitio_auditoria -> turnos_proceso_sitio_auditoria
-- ============================================================================
DROP TABLE IF EXISTS public.organizacion CASCADE;
DROP TABLE IF EXISTS public.grupo_empresarial CASCADE;

DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;

GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON SCHEMA public TO postgres, service_role;
GRANT ALL ON SCHEMA public TO public;

-- Recreación limpia de extensiones requeridas tras reiniciar el esquema public
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "ltree";