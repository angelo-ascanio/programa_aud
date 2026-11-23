-- ============================================================================
-- FILE 1: 01_CREACION.SQL (Fase 1: Infraestructura Base, Auth, Audit Log + DDL)
-- ============================================================================

-- 1. Extensiones PostgreSQL
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "ltree";

-- 2. Tipos Enumerados (aislados en esquema public)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public' AND t.typname = 'user_status'
    ) THEN
        CREATE TYPE public.user_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public' AND t.typname = 'user_role'
    ) THEN
        CREATE TYPE public.user_role AS ENUM ('ADMIN', 'WORKER', 'AUDITOR', 'CLIENT');
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public' AND t.typname = 'tipo_hallazgo'
    ) THEN
        CREATE TYPE public.tipo_hallazgo AS ENUM ('NC_MAYOR', 'NC_MENOR', 'OBSERVACION', 'OPORTUNIDAD_MEJORA');
    END IF;
END $$;

-- 3. Perfiles de Usuario y Máquina de Estados (RBAC)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    nombre VARCHAR(150) NOT NULL,
    role public.user_role NOT NULL DEFAULT 'CLIENT',
    status public.user_status NOT NULL DEFAULT 'APPROVED',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Disparador de Autoregisto en auth.users:
--   * CLIENT -> APPROVED automático
--   * ADMIN / WORKER / AUDITOR -> PENDING obligatorio (aprobación administrativa)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_raw_role TEXT;
    v_role public.user_role;
    v_status public.user_status;
    v_nombre VARCHAR(150);
BEGIN
    v_raw_role := UPPER(NULLIF(TRIM(NEW.raw_user_meta_data->>'role'), ''));

    BEGIN
        v_role := COALESCE(v_raw_role::public.user_role, 'CLIENT');
    EXCEPTION
        WHEN invalid_text_representation THEN
            v_role := 'CLIENT';
    END;

    IF v_role = 'CLIENT' THEN
        v_status := 'APPROVED';
    ELSE
        v_status := 'PENDING';
    END IF;

    v_nombre := LEFT(
        COALESCE(
            NULLIF(TRIM(NEW.raw_user_meta_data->>'nombre'), ''),
            NEW.email,
            'Usuario'
        ),
        150
    );

    INSERT INTO public.profiles (id, nombre, role, status)
    VALUES (NEW.id, v_nombre, v_role, v_status)
    ON CONFLICT (id) DO UPDATE SET
        nombre = EXCLUDED.nombre,
        updated_at = NOW();

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Dominio 1: Catálogos Base, Normas, Acreditación y Competencias
CREATE TABLE IF NOT EXISTS norma (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    esquema VARCHAR(50) NOT NULL,
    codigo VARCHAR(50) NOT NULL,
    titulo VARCHAR(255) NOT NULL,
    estatus VARCHAR(50) NOT NULL DEFAULT 'Vigente' CHECK (estatus IN ('Vigente', 'En Revisión', 'Obsoleta')),
    fecha_publicacion DATE,
    norma VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    delete_reason TEXT
);

CREATE OR REPLACE FUNCTION public.fn_norma_sync_codigo_titulo()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.codigo IS NULL OR TRIM(NEW.codigo) = '' THEN
        NEW.codigo := COALESCE(NULLIF(NEW.norma, ''), 'NORMA-DEF');
    END IF;
    IF NEW.norma IS NULL OR TRIM(NEW.norma) = '' THEN
        NEW.norma := NEW.codigo;
    END IF;
    IF NEW.titulo IS NULL OR TRIM(NEW.titulo) = '' THEN
        NEW.titulo := NEW.norma;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_norma_sync_codigo_titulo ON public.norma;
CREATE TRIGGER trg_norma_sync_codigo_titulo
    BEFORE INSERT OR UPDATE ON public.norma
    FOR EACH ROW EXECUTE FUNCTION public.fn_norma_sync_codigo_titulo();

CREATE TABLE IF NOT EXISTS requisito (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    id_norma UUID NOT NULL REFERENCES norma(id) ON DELETE CASCADE,
    id_requisito_padre UUID REFERENCES requisito(id) ON DELETE RESTRICT,
    codigo VARCHAR(30) NOT NULL,
    ruta_materializada LTREE,
    explicit_code BOOLEAN NOT NULL DEFAULT FALSE,
    external_key VARCHAR(100) NULL,
    es_obligatorio BOOLEAN NOT NULL DEFAULT TRUE,
    obligatorio_origen VARCHAR(20) NOT NULL DEFAULT 'AUTO_TEXT',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    delete_reason TEXT
);

CREATE TABLE IF NOT EXISTS public.requisito_traduccion (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    id_requisito UUID NOT NULL REFERENCES public.requisito(id) ON DELETE CASCADE,
    lang VARCHAR(5) NOT NULL CHECK (lang IN ('es', 'en')),
    title VARCHAR(500) NOT NULL DEFAULT '',
    content_html TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sector_iaf (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sector INTEGER NOT NULL,
    descripcion TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    delete_reason TEXT
);

CREATE TABLE IF NOT EXISTS subsector_iaf (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    id_sector_iaf UUID NOT NULL REFERENCES sector_iaf(id) ON DELETE RESTRICT,
    codigo VARCHAR(10) NOT NULL,
    descripcion TEXT NOT NULL,
    categoria_riesgo VARCHAR(20) NOT NULL DEFAULT 'MEDIO' CHECK (categoria_riesgo IN ('ALTO', 'MEDIO', 'BAJO')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    delete_reason TEXT
);

CREATE TABLE IF NOT EXISTS estatus (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    estatus VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    delete_reason TEXT
);

CREATE TABLE IF NOT EXISTS organismo_acreditacion (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    codigo VARCHAR(20) NOT NULL,
    nombre VARCHAR(255) NOT NULL,
    pais VARCHAR(100) NOT NULL,
    sitio_web VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    delete_reason TEXT
);

CREATE TABLE IF NOT EXISTS acreditacion_norma (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    id_organismo UUID NOT NULL REFERENCES organismo_acreditacion(id) ON DELETE CASCADE,
    id_norma UUID NOT NULL REFERENCES norma(id) ON DELETE CASCADE,
    id_estatus UUID NOT NULL REFERENCES estatus(id) ON DELETE RESTRICT,
    numero_acreditacion VARCHAR(100) NOT NULL,
    fecha_concesion DATE NOT NULL,
    fecha_vencimiento DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    delete_reason TEXT
);

CREATE TABLE IF NOT EXISTS acreditacion_norma_sector_iaf (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    id_acreditacion_norma UUID NOT NULL REFERENCES acreditacion_norma(id) ON DELETE CASCADE,
    id_sector_iaf UUID NOT NULL REFERENCES sector_iaf(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS tipo_auditoria (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tipo VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    delete_reason TEXT
);

CREATE TABLE IF NOT EXISTS metodologia_auditoria (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    metodologia VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    delete_reason TEXT
);

CREATE TABLE IF NOT EXISTS auditor (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre VARCHAR(150) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    delete_reason TEXT
);

CREATE TABLE IF NOT EXISTS norma_auditor (
    id_auditor UUID NOT NULL REFERENCES auditor(id) ON DELETE CASCADE,
    id_norma UUID NOT NULL REFERENCES norma(id) ON DELETE CASCADE,
    PRIMARY KEY (id_auditor, id_norma)
);

CREATE TABLE IF NOT EXISTS sector_iaf_auditor (
    id_auditor UUID NOT NULL REFERENCES auditor(id) ON DELETE CASCADE,
    id_sector_iaf UUID NOT NULL REFERENCES sector_iaf(id) ON DELETE CASCADE,
    PRIMARY KEY (id_auditor, id_sector_iaf)
);

CREATE TABLE IF NOT EXISTS subsector_iaf_auditor (
    id_auditor UUID NOT NULL REFERENCES auditor(id) ON DELETE CASCADE,
    id_subsector_iaf UUID NOT NULL REFERENCES subsector_iaf(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id_auditor, id_subsector_iaf)
);

-- Dominio 2: Conglomerados, Organizaciones, Certificados, Sitios, Procesos y Acceso Cliente
CREATE TABLE IF NOT EXISTS public.grupo_empresarial (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    codigo_grupo VARCHAR(40) NULL,
    nombre VARCHAR(220) NOT NULL,
    es_individual_auto BOOLEAN NOT NULL DEFAULT TRUE,
    notas TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    delete_reason TEXT
);

CREATE TABLE IF NOT EXISTS organizacion (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    id_grupo_empresarial UUID NOT NULL REFERENCES public.grupo_empresarial(id) ON DELETE RESTRICT,
    nombre VARCHAR(255) NOT NULL,
    abreviacion VARCHAR(30) NULL,
    rif VARCHAR(50),
    direccion_fiscal TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    delete_reason TEXT
);

-- Compatibilidad idempotente en el contenedor public.organizacion (Step 1.1)
ALTER TABLE public.organizacion
    ADD COLUMN IF NOT EXISTS abreviacion VARCHAR(30) NULL;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'organizacion'
          AND column_name = 'nombre'
          AND character_maximum_length IS NOT NULL
          AND character_maximum_length < 255
    ) THEN
        ALTER TABLE public.organizacion ALTER COLUMN nombre TYPE VARCHAR(255);
    END IF;
END $$;

-- Tabla versionada de organizaciones (Contenedor Estable + Instantánea Versionada - Step 1.1)
CREATE TABLE IF NOT EXISTS public.organizacion_version (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    id_organizacion UUID NOT NULL REFERENCES public.organizacion(id) ON DELETE CASCADE,
    version_numero INTEGER NOT NULL CHECK (version_numero >= 1),
    es_version_actual BOOLEAN NOT NULL DEFAULT TRUE,
    notas_version TEXT NULL,
    nombre VARCHAR(255) NOT NULL,
    abreviacion VARCHAR(30) NOT NULL CHECK (LENGTH(TRIM(abreviacion)) BETWEEN 2 AND 30),
    rif VARCHAR(50) NULL,
    direccion_fiscal TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    delete_reason TEXT NULL
);

CREATE OR REPLACE FUNCTION public.fn_generar_abreviacion_organizacion(
    p_nombre TEXT,
    p_exclude_org_id UUID DEFAULT NULL
)
RETURNS VARCHAR(30)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_limpio TEXT;
    v_base VARCHAR(24);
    v_candidato VARCHAR(30);
    v_sufijo INTEGER := 1;
BEGIN
    v_limpio := TRANSLATE(
        UPPER(TRIM(COALESCE(p_nombre, ''))),
        'ÁÀÂÄÃÉÈÊËÍÌÎÏÓÒÔÖÕÚÙÛÜÑÇ',
        'AAAAAEEEEIIIIOOOOOUUUUNC'
    );
    v_limpio := REGEXP_REPLACE(v_limpio, '[^A-Z0-9 -]+', '', 'g');
    v_limpio := TRIM(REGEXP_REPLACE(v_limpio, '\s+', ' ', 'g'));

    IF LENGTH(v_limpio) < 2 THEN
        v_base := 'ORGANIZACION';
    ELSE
        v_base := LEFT(v_limpio, 24);
        v_base := TRIM(REGEXP_REPLACE(v_base, '[- ]+$', '', 'g'));
        IF LENGTH(v_base) < 2 THEN
            v_base := 'ORG';
        END IF;
    END IF;

    v_candidato := v_base;
    WHILE EXISTS (
        SELECT 1
        FROM public.organizacion_version ov
        WHERE LOWER(TRIM(ov.abreviacion)) = LOWER(TRIM(v_candidato))
          AND ov.es_version_actual = TRUE
          AND ov.deleted_at IS NULL
          AND ov.id_organizacion IS DISTINCT FROM p_exclude_org_id
    ) LOOP
        v_sufijo := v_sufijo + 1;
        v_candidato := LEFT(v_base, 24) || '-' || v_sufijo::TEXT;
    END LOOP;

    RETURN v_candidato;
END;
$$;

-- Backfill Idempotente (Step 1.1): migra filas existentes de organizacion a version_numero = 1
DO $$
DECLARE
    r_org RECORD;
    v_abrev VARCHAR(30);
    v_base_abrev VARCHAR(24);
    v_sufijo INTEGER;
BEGIN
    FOR r_org IN
        SELECT o.*
        FROM public.organizacion o
        WHERE NOT EXISTS (
            SELECT 1
            FROM public.organizacion_version ov
            WHERE ov.id_organizacion = o.id
        )
        ORDER BY o.created_at ASC, o.id ASC
    LOOP
        v_abrev := NULLIF(TRIM(REGEXP_REPLACE(COALESCE(r_org.abreviacion, ''), '\s+', ' ', 'g')), '');
        IF v_abrev IS NULL OR LENGTH(v_abrev) < 2 OR LENGTH(v_abrev) > 30 THEN
            v_abrev := public.fn_generar_abreviacion_organizacion(r_org.nombre, r_org.id);
        ELSIF r_org.deleted_at IS NULL AND EXISTS (
            SELECT 1
            FROM public.organizacion_version ov
            WHERE LOWER(TRIM(ov.abreviacion)) = LOWER(TRIM(v_abrev))
              AND ov.es_version_actual = TRUE
              AND ov.deleted_at IS NULL
              AND ov.id_organizacion IS DISTINCT FROM r_org.id
        ) THEN
            v_base_abrev := LEFT(v_abrev, 24);
            v_sufijo := 2;
            v_abrev := v_base_abrev || '-' || v_sufijo::TEXT;
            WHILE EXISTS (
                SELECT 1
                FROM public.organizacion_version ov
                WHERE LOWER(TRIM(ov.abreviacion)) = LOWER(TRIM(v_abrev))
                  AND ov.es_version_actual = TRUE
                  AND ov.deleted_at IS NULL
                  AND ov.id_organizacion IS DISTINCT FROM r_org.id
            ) LOOP
                v_sufijo := v_sufijo + 1;
                v_abrev := v_base_abrev || '-' || v_sufijo::TEXT;
            END LOOP;
        END IF;

        INSERT INTO public.organizacion_version (
            id_organizacion,
            version_numero,
            es_version_actual,
            notas_version,
            nombre,
            abreviacion,
            rif,
            direccion_fiscal,
            created_at,
            updated_at,
            deleted_at,
            deleted_by,
            delete_reason
        ) VALUES (
            r_org.id,
            1,
            TRUE,
            'Versión inicial migrada automáticamente.',
            LEFT(COALESCE(NULLIF(TRIM(r_org.nombre), ''), 'Organización sin nombre'), 255),
            v_abrev,
            NULLIF(TRIM(COALESCE(r_org.rif, '')), ''),
            NULLIF(TRIM(COALESCE(r_org.direccion_fiscal, '')), ''),
            COALESCE(r_org.created_at, NOW()),
            COALESCE(r_org.updated_at, NOW()),
            r_org.deleted_at,
            r_org.deleted_by,
            r_org.delete_reason
        );

        IF r_org.abreviacion IS DISTINCT FROM v_abrev THEN
            UPDATE public.organizacion
            SET abreviacion = v_abrev
            WHERE id = r_org.id;
        END IF;
    END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.fn_validar_organizacion_version()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_org_deleted TIMESTAMPTZ;
    v_max_ver INTEGER := 0;
    v_self_id UUID;
BEGIN
    IF NEW.deleted_at IS NOT NULL THEN
        IF TG_OP = 'INSERT' THEN
            SELECT o.deleted_at INTO v_org_deleted
            FROM public.organizacion o
            WHERE o.id = NEW.id_organizacion;

            IF NOT FOUND OR v_org_deleted IS NULL THEN
                RAISE EXCEPTION 'Operación bloqueada: no se permite registrar una versión pre-archivada para una organización activa.'
                    USING ERRCODE = 'P0001';
            END IF;
        END IF;
        RETURN NEW;
    END IF;

    SELECT o.deleted_at INTO v_org_deleted
    FROM public.organizacion o
    WHERE o.id = NEW.id_organizacion;

    IF NOT FOUND OR v_org_deleted IS NOT NULL THEN
        RAISE EXCEPTION 'Operación bloqueada: la organización contenedora no existe o se encuentra archivada.'
            USING ERRCODE = 'P0001';
    END IF;

    NEW.nombre := TRIM(REGEXP_REPLACE(COALESCE(NEW.nombre, ''), '\s+', ' ', 'g'));
    NEW.abreviacion := TRIM(REGEXP_REPLACE(COALESCE(NEW.abreviacion, ''), '\s+', ' ', 'g'));
    NEW.rif := NULLIF(TRIM(REGEXP_REPLACE(COALESCE(NEW.rif, ''), '\s+', ' ', 'g')), '');
    NEW.direccion_fiscal := NULLIF(TRIM(REGEXP_REPLACE(COALESCE(NEW.direccion_fiscal, ''), '\s+', ' ', 'g')), '');

    IF LENGTH(NEW.nombre) < 2 OR LENGTH(NEW.nombre) > 255 THEN
        RAISE EXCEPTION 'Validación fallida: el nombre de la organización debe contener entre 2 y 255 caracteres.'
            USING ERRCODE = 'P0001';
    END IF;

    IF LENGTH(NEW.abreviacion) < 2 OR LENGTH(NEW.abreviacion) > 30 THEN
        RAISE EXCEPTION 'Validación fallida: la abreviación de la organización debe contener entre 2 y 30 caracteres.'
            USING ERRCODE = 'P0001';
    END IF;

    IF NEW.nombre ~* '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
       OR NEW.abreviacion ~* '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' THEN
        RAISE EXCEPTION 'Formato inválido: no se permiten identificadores internos en nombre o abreviación de la organización.'
            USING ERRCODE = 'P0001';
    END IF;

    IF TG_OP = 'INSERT' THEN
        SELECT COALESCE(MAX(ov.version_numero), 0) INTO v_max_ver
        FROM public.organizacion_version ov
        WHERE ov.id_organizacion = NEW.id_organizacion;

        IF NEW.version_numero IS DISTINCT FROM (v_max_ver + 1) THEN
            RAISE EXCEPTION 'Secuencia de versión inválida: el número de versión para la organización debe ser secuencial.'
                USING ERRCODE = 'P0001';
        END IF;
    ELSIF TG_OP = 'UPDATE' AND NEW.version_numero IS DISTINCT FROM OLD.version_numero THEN
        RAISE EXCEPTION 'Operación bloqueada: el número de versión de la organización es inmutable.'
            USING ERRCODE = 'P0001';
    END IF;

    IF NEW.es_version_actual = TRUE AND pg_trigger_depth() <= 1 THEN
        IF TG_OP = 'UPDATE' THEN
            v_self_id := OLD.id;
        ELSE
            v_self_id := NEW.id;
        END IF;

        UPDATE public.organizacion_version
        SET es_version_actual = FALSE,
            updated_at = NOW()
        WHERE id_organizacion = NEW.id_organizacion
          AND id IS DISTINCT FROM v_self_id
          AND es_version_actual = TRUE
          AND deleted_at IS NULL;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validar_organizacion_version ON public.organizacion_version;
CREATE TRIGGER trg_validar_organizacion_version
    BEFORE INSERT OR UPDATE ON public.organizacion_version
    FOR EACH ROW EXECUTE FUNCTION public.fn_validar_organizacion_version();

CREATE OR REPLACE FUNCTION public.fn_sincronizar_cache_organizacion_desde_version()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NEW.es_version_actual = TRUE AND NEW.deleted_at IS NULL THEN
        UPDATE public.organizacion o
        SET nombre = NEW.nombre,
            abreviacion = NEW.abreviacion,
            rif = NEW.rif,
            direccion_fiscal = NEW.direccion_fiscal,
            updated_at = NOW()
        WHERE o.id = NEW.id_organizacion
          AND (
              o.nombre IS DISTINCT FROM NEW.nombre
              OR o.abreviacion IS DISTINCT FROM NEW.abreviacion
              OR o.rif IS DISTINCT FROM NEW.rif
              OR o.direccion_fiscal IS DISTINCT FROM NEW.direccion_fiscal
          );
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sincronizar_cache_organizacion_desde_version ON public.organizacion_version;
CREATE TRIGGER trg_sincronizar_cache_organizacion_desde_version
    AFTER INSERT OR UPDATE OF es_version_actual, nombre, abreviacion, rif, direccion_fiscal, deleted_at ON public.organizacion_version
    FOR EACH ROW EXECUTE FUNCTION public.fn_sincronizar_cache_organizacion_desde_version();

CREATE OR REPLACE FUNCTION public.fn_sincronizar_organizacion_version_inicial_legacy()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_abrev VARCHAR(30);
BEGIN
    IF pg_trigger_depth() > 1 THEN
        RETURN NEW;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.organizacion_version ov
        WHERE ov.id_organizacion = NEW.id
    ) THEN
        v_abrev := NULLIF(TRIM(REGEXP_REPLACE(COALESCE(NEW.abreviacion, ''), '\s+', ' ', 'g')), '');
        IF v_abrev IS NULL OR LENGTH(v_abrev) < 2 OR LENGTH(v_abrev) > 30 THEN
            v_abrev := public.fn_generar_abreviacion_organizacion(NEW.nombre, NEW.id);
        END IF;

        INSERT INTO public.organizacion_version (
            id_organizacion,
            version_numero,
            es_version_actual,
            notas_version,
            nombre,
            abreviacion,
            rif,
            direccion_fiscal,
            deleted_at,
            deleted_by,
            delete_reason
        ) VALUES (
            NEW.id,
            1,
            TRUE,
            'Versión inicial generada automáticamente desde contenedor.',
            LEFT(COALESCE(NULLIF(TRIM(NEW.nombre), ''), 'Organización sin nombre'), 255),
            v_abrev,
            NULLIF(TRIM(COALESCE(NEW.rif, '')), ''),
            NULLIF(TRIM(COALESCE(NEW.direccion_fiscal, '')), ''),
            NEW.deleted_at,
            NEW.deleted_by,
            NEW.delete_reason
        );
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sincronizar_organizacion_version_inicial_legacy ON public.organizacion;
CREATE TRIGGER trg_sincronizar_organizacion_version_inicial_legacy
    AFTER INSERT ON public.organizacion
    FOR EACH ROW EXECUTE FUNCTION public.fn_sincronizar_organizacion_version_inicial_legacy();

CREATE OR REPLACE FUNCTION public.fn_cascada_archivo_organizacion_versiones()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
        UPDATE public.organizacion_version
        SET deleted_at = NEW.deleted_at,
            deleted_by = COALESCE(NEW.deleted_by, auth.uid()),
            delete_reason = COALESCE(NULLIF(TRIM(NEW.delete_reason), ''), 'Archivo en cascada de organización contenedora'),
            updated_at = NOW()
        WHERE id_organizacion = NEW.id
          AND deleted_at IS NULL;
    ELSIF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
        UPDATE public.organizacion_version
        SET deleted_at = NULL,
            deleted_by = NULL,
            delete_reason = NULL,
            updated_at = NOW()
        WHERE id_organizacion = NEW.id
          AND deleted_at = OLD.deleted_at;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cascada_archivo_organizacion_versiones ON public.organizacion;
CREATE TRIGGER trg_cascada_archivo_organizacion_versiones
    AFTER UPDATE OF deleted_at ON public.organizacion
    FOR EACH ROW EXECUTE FUNCTION public.fn_cascada_archivo_organizacion_versiones();

-- Trigger 1 (Step 1.1): Auto-creación 1:1 si organizacion entra sin id_grupo_empresarial + validación de grupo activo
CREATE OR REPLACE FUNCTION public.fn_auto_asignar_grupo_organizacion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_grupo_id UUID;
    v_grupo_deleted TIMESTAMPTZ;
    v_base_nombre VARCHAR(220);
    v_candidate_nombre VARCHAR(220);
    v_suffix INTEGER := 1;
BEGIN
    IF NEW.deleted_at IS NOT NULL THEN
        RETURN NEW;
    END IF;

    IF NEW.id_grupo_empresarial IS NULL THEN
        IF TG_OP = 'INSERT' AND NEW.id IS NOT NULL THEN
            SELECT o.id_grupo_empresarial
              INTO v_grupo_id
            FROM public.organizacion o
            JOIN public.grupo_empresarial g ON g.id = o.id_grupo_empresarial
            WHERE o.id = NEW.id
              AND g.deleted_at IS NULL
            LIMIT 1;

            IF v_grupo_id IS NOT NULL THEN
                NEW.id_grupo_empresarial := v_grupo_id;
                RETURN NEW;
            END IF;
        END IF;

        v_base_nombre := LEFT(COALESCE(NULLIF(TRIM(NEW.nombre), ''), 'Organización'), 220);
        v_candidate_nombre := v_base_nombre;

        WHILE EXISTS (
            SELECT 1
            FROM public.grupo_empresarial g
            WHERE LOWER(TRIM(g.nombre)) = LOWER(TRIM(v_candidate_nombre))
              AND g.deleted_at IS NULL
        ) LOOP
            v_suffix := v_suffix + 1;
            v_candidate_nombre := LEFT(v_base_nombre, 200) || ' (' || v_suffix || ')';
        END LOOP;

        INSERT INTO public.grupo_empresarial (nombre, es_individual_auto, notas)
        VALUES (
            v_candidate_nombre,
            TRUE,
            'Grupo individual creado automáticamente para organización independiente.'
        )
        RETURNING id INTO v_grupo_id;

        NEW.id_grupo_empresarial := v_grupo_id;
        RETURN NEW;
    END IF;

    SELECT g.deleted_at INTO v_grupo_deleted
    FROM public.grupo_empresarial g
    WHERE g.id = NEW.id_grupo_empresarial;

    IF NOT FOUND OR v_grupo_deleted IS NOT NULL THEN
        RAISE EXCEPTION 'Operación bloqueada: el conglomerado destino no existe o está archivado.'
            USING ERRCODE = 'P0001';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_asignar_grupo_organizacion ON public.organizacion;
CREATE TRIGGER trg_auto_asignar_grupo_organizacion
    BEFORE INSERT OR UPDATE OF id_grupo_empresarial ON public.organizacion
    FOR EACH ROW EXECUTE FUNCTION public.fn_auto_asignar_grupo_organizacion();

-- Trigger 2 (Step 1.1): Recalcular es_individual_auto y archivar grupos vacíos al mover/archivar organizaciones
CREATE OR REPLACE FUNCTION public.fn_sincronizar_limpieza_grupo_empresarial()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_old_count INTEGER := 0;
    v_new_count INTEGER := 0;
BEGIN
    IF TG_OP = 'UPDATE' AND OLD.id_grupo_empresarial IS NOT NULL
       AND (NEW.id_grupo_empresarial IS DISTINCT FROM OLD.id_grupo_empresarial
            OR (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)) THEN
        SELECT COUNT(*)::INTEGER INTO v_old_count
        FROM public.organizacion o
        WHERE o.id_grupo_empresarial = OLD.id_grupo_empresarial
          AND o.deleted_at IS NULL;

        IF v_old_count = 0 THEN
            UPDATE public.grupo_empresarial
            SET deleted_at = NOW(),
                deleted_by = COALESCE(NEW.deleted_by, auth.uid()),
                delete_reason = 'Limpieza automática: grupo sin organizaciones activas',
                updated_at = NOW()
            WHERE id = OLD.id_grupo_empresarial
              AND deleted_at IS NULL;
        ELSE
            UPDATE public.grupo_empresarial
            SET es_individual_auto = (v_old_count = 1),
                updated_at = NOW()
            WHERE id = OLD.id_grupo_empresarial
              AND deleted_at IS NULL;
        END IF;
    END IF;

    IF TG_OP = 'UPDATE' AND OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL
       AND NEW.id_grupo_empresarial IS NOT NULL THEN
        UPDATE public.grupo_empresarial g
        SET deleted_at = NULL,
            deleted_by = NULL,
            delete_reason = NULL,
            updated_at = NOW()
        WHERE g.id = NEW.id_grupo_empresarial
          AND g.deleted_at IS NOT NULL
          AND g.delete_reason = 'Limpieza automática: grupo sin organizaciones activas'
          AND NOT EXISTS (
              SELECT 1 FROM public.grupo_empresarial g2
              WHERE LOWER(TRIM(g2.nombre)) = LOWER(TRIM(g.nombre))
                AND g2.deleted_at IS NULL
                AND g2.id <> g.id
          );
    END IF;

    IF NEW.id_grupo_empresarial IS NOT NULL AND NEW.deleted_at IS NULL THEN
        SELECT COUNT(*)::INTEGER INTO v_new_count
        FROM public.organizacion o
        WHERE o.id_grupo_empresarial = NEW.id_grupo_empresarial
          AND o.deleted_at IS NULL;

        UPDATE public.grupo_empresarial
        SET es_individual_auto = (v_new_count <= 1),
            updated_at = NOW()
        WHERE id = NEW.id_grupo_empresarial
          AND deleted_at IS NULL;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sincronizar_limpieza_grupo_empresarial ON public.organizacion;
CREATE TRIGGER trg_sincronizar_limpieza_grupo_empresarial
    AFTER INSERT OR UPDATE OF id_grupo_empresarial, deleted_at ON public.organizacion
    FOR EACH ROW EXECUTE FUNCTION public.fn_sincronizar_limpieza_grupo_empresarial();

-- Helper Staff RBAC y RPC de Desvinculación Segura de Organización desde Conglomerado (Step 1.1)
CREATE OR REPLACE FUNCTION public.fn_is_approved_staff()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.role IN ('ADMIN', 'WORKER')
          AND p.status = 'APPROVED'
    );
$$;

CREATE OR REPLACE FUNCTION public.is_approved_staff()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.role IN ('ADMIN', 'WORKER')
          AND p.status = 'APPROVED'
    );
$$;

CREATE OR REPLACE FUNCTION public.fn_desvincular_organizacion_conglomerado(
    p_id_organizacion UUID,
    p_motivo TEXT DEFAULT 'Separación administrativa'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_org_nombre VARCHAR(220);
    v_old_grupo_id UUID;
    v_org_deleted TIMESTAMPTZ;
    v_active_members_count INTEGER := 0;
    v_conflict_label VARCHAR(200);
    v_conflict_code VARCHAR(80);
    v_base_nombre VARCHAR(220);
    v_candidate_nombre VARCHAR(220);
    v_suffix INTEGER := 1;
    v_new_grupo_id UUID;
    v_clean_motivo TEXT;
BEGIN
    IF NOT public.fn_is_approved_staff() THEN
        RAISE EXCEPTION 'Acceso denegado: solo personal administrativo autorizado puede desvincular organizaciones de un conglomerado.'
            USING ERRCODE = 'P0001';
    END IF;

    IF p_id_organizacion IS NULL THEN
        RAISE EXCEPTION 'Operación bloqueada: debe indicar una organización válida para desvincular.'
            USING ERRCODE = 'P0001';
    END IF;

    SELECT COALESCE(NULLIF(TRIM(ov.nombre), ''), o.nombre), o.id_grupo_empresarial, o.deleted_at
      INTO v_org_nombre, v_old_grupo_id, v_org_deleted
    FROM public.organizacion o
    LEFT JOIN public.organizacion_version ov
      ON ov.id_organizacion = o.id
     AND ov.es_version_actual = TRUE
     AND ov.deleted_at IS NULL
    WHERE o.id = p_id_organizacion
    FOR UPDATE OF o;

    IF NOT FOUND OR v_org_deleted IS NOT NULL THEN
        RAISE EXCEPTION 'Operación bloqueada: la organización seleccionada no existe o se encuentra archivada.'
            USING ERRCODE = 'P0001';
    END IF;

    SELECT COUNT(*)::INTEGER INTO v_active_members_count
    FROM public.organizacion o
    WHERE o.id_grupo_empresarial = v_old_grupo_id
      AND o.deleted_at IS NULL;

    IF v_active_members_count <= 1 THEN
        RAISE EXCEPTION 'Operación bloqueada: la organización "%" ya pertenece a un grupo individual y no requiere separación.',
            COALESCE(NULLIF(TRIM(v_org_nombre), ''), 'seleccionada')
            USING ERRCODE = 'P0001';
    END IF;

    -- Validar que la organización no comparta un vínculo Nivel 2 activo con otras organizaciones del conglomerado
    SELECT v.etiqueta, v.codigo_vinculo
      INTO v_conflict_label, v_conflict_code
    FROM public.certificado c_self
    JOIN public.vinculo_certificado vc_self
      ON vc_self.id_certificado = c_self.id AND vc_self.deleted_at IS NULL
    JOIN public.vinculo v
      ON v.id = vc_self.id_vinculo AND v.deleted_at IS NULL
    WHERE c_self.id_organizacion = p_id_organizacion
      AND c_self.deleted_at IS NULL
      AND EXISTS (
          SELECT 1
          FROM public.vinculo_certificado vc_other
          JOIN public.certificado c_other ON c_other.id = vc_other.id_certificado
          WHERE vc_other.id_vinculo = v.id
            AND vc_other.deleted_at IS NULL
            AND c_other.deleted_at IS NULL
            AND c_other.id_organizacion IS DISTINCT FROM p_id_organizacion
      )
    LIMIT 1;

    IF FOUND THEN
        RAISE EXCEPTION 'Operación bloqueada: la organización participa en el vínculo inter-organizacional activo "%". Desvincule o ajuste ese vínculo antes de separar la organización.',
            COALESCE(NULLIF(TRIM(v_conflict_label), ''), NULLIF(TRIM(v_conflict_code), ''), 'Vínculo Nivel 2')
            USING ERRCODE = 'P0001';
    END IF;

    v_clean_motivo := COALESCE(NULLIF(TRIM(p_motivo), ''), 'Separación administrativa');
    v_base_nombre := LEFT(COALESCE(NULLIF(TRIM(v_org_nombre), ''), 'Conglomerado Individual'), 220);
    v_candidate_nombre := v_base_nombre;

    WHILE EXISTS (
        SELECT 1 FROM public.grupo_empresarial g
        WHERE LOWER(TRIM(g.nombre)) = LOWER(TRIM(v_candidate_nombre))
          AND g.deleted_at IS NULL
    ) LOOP
        v_suffix := v_suffix + 1;
        v_candidate_nombre := LEFT(v_base_nombre, 200) || ' (' || v_suffix || ')';
    END LOOP;

    INSERT INTO public.grupo_empresarial (nombre, es_individual_auto, estatus, notas)
    VALUES (
        v_candidate_nombre,
        TRUE,
        'Activo',
        'Grupo individual generado por desvinculación: ' || LEFT(v_clean_motivo, 300)
    )
    RETURNING id INTO v_new_grupo_id;

    UPDATE public.organizacion
    SET id_grupo_empresarial = v_new_grupo_id,
        updated_at = NOW()
    WHERE id = p_id_organizacion
      AND deleted_at IS NULL;

    INSERT INTO public.audit_log (table_name, operation, record_id, old_data, new_data, performed_by)
    VALUES (
        'organizacion',
        'UPDATE',
        p_id_organizacion,
        jsonb_build_object(
            'id_grupo_empresarial', v_old_grupo_id,
            'accion', 'desvincular_conglomerado'
        ),
        jsonb_build_object(
            'id_grupo_empresarial', v_new_grupo_id,
            'grupo_nombre', v_candidate_nombre,
            'es_individual_auto', TRUE,
            'motivo', v_clean_motivo
        ),
        auth.uid()
    );

    RETURN v_new_grupo_id;
END;
$$;

-- RPCs transaccionales de Versionado de Organización (Step 1.1)
CREATE OR REPLACE FUNCTION public.fn_crear_version_organizacion(
    p_id_organizacion UUID,
    p_nombre TEXT,
    p_abreviacion TEXT,
    p_rif TEXT DEFAULT NULL,
    p_direccion_fiscal TEXT DEFAULT NULL,
    p_notas_version TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_org_deleted TIMESTAMPTZ;
    v_nombre TEXT;
    v_abreviacion TEXT;
    v_rif TEXT;
    v_direccion_fiscal TEXT;
    v_notas TEXT;
    v_active_id UUID;
    v_active_num INTEGER;
    v_cur_nombre TEXT;
    v_cur_abrev TEXT;
    v_cur_rif TEXT;
    v_cur_dir TEXT;
    v_max_num INTEGER := 0;
    v_new_version_id UUID;
BEGIN
    IF NOT public.is_approved_worker() THEN
        RAISE EXCEPTION 'Acceso denegado: solo personal ADMIN o WORKER aprobado puede crear versiones de organización.'
            USING ERRCODE = 'P0001';
    END IF;

    IF p_id_organizacion IS NULL THEN
        RAISE EXCEPTION 'Operación bloqueada: debe indicar una organización válida para versionar.'
            USING ERRCODE = 'P0001';
    END IF;

    SELECT o.deleted_at INTO v_org_deleted
    FROM public.organizacion o
    WHERE o.id = p_id_organizacion
    FOR UPDATE;

    IF NOT FOUND OR v_org_deleted IS NOT NULL THEN
        RAISE EXCEPTION 'Operación bloqueada: la organización seleccionada no existe o se encuentra archivada.'
            USING ERRCODE = 'P0001';
    END IF;

    v_nombre := TRIM(REGEXP_REPLACE(COALESCE(p_nombre, ''), '\s+', ' ', 'g'));
    v_abreviacion := TRIM(REGEXP_REPLACE(COALESCE(p_abreviacion, ''), '\s+', ' ', 'g'));
    v_rif := NULLIF(TRIM(REGEXP_REPLACE(COALESCE(p_rif, ''), '\s+', ' ', 'g')), '');
    v_direccion_fiscal := NULLIF(TRIM(REGEXP_REPLACE(COALESCE(p_direccion_fiscal, ''), '\s+', ' ', 'g')), '');
    v_notas := NULLIF(TRIM(COALESCE(p_notas_version, '')), '');

    IF LENGTH(v_nombre) < 2 OR LENGTH(v_nombre) > 255 THEN
        RAISE EXCEPTION 'Validación fallida: el nombre de la organización debe contener entre 2 y 255 caracteres.'
            USING ERRCODE = 'P0001';
    END IF;

    IF LENGTH(v_abreviacion) < 2 OR LENGTH(v_abreviacion) > 30 THEN
        RAISE EXCEPTION 'Validación fallida: la abreviación de la organización debe contener entre 2 y 30 caracteres.'
            USING ERRCODE = 'P0001';
    END IF;

    IF v_nombre ~* '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
       OR v_abreviacion ~* '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' THEN
        RAISE EXCEPTION 'Formato inválido: no se permiten identificadores internos en nombre o abreviación.'
            USING ERRCODE = 'P0001';
    END IF;

    SELECT ov.id, ov.version_numero, ov.nombre, ov.abreviacion, ov.rif, ov.direccion_fiscal
      INTO v_active_id, v_active_num, v_cur_nombre, v_cur_abrev, v_cur_rif, v_cur_dir
    FROM public.organizacion_version ov
    WHERE ov.id_organizacion = p_id_organizacion
      AND ov.es_version_actual = TRUE
      AND ov.deleted_at IS NULL
    FOR UPDATE;

    IF v_active_id IS NOT NULL THEN
        IF TRIM(REGEXP_REPLACE(COALESCE(v_cur_nombre, ''), '\s+', ' ', 'g')) = v_nombre
           AND UPPER(TRIM(REGEXP_REPLACE(COALESCE(v_cur_abrev, ''), '\s+', ' ', 'g'))) = UPPER(v_abreviacion)
           AND UPPER(TRIM(REGEXP_REPLACE(COALESCE(v_cur_rif, ''), '\s+', ' ', 'g'))) = UPPER(COALESCE(v_rif, ''))
           AND TRIM(REGEXP_REPLACE(COALESCE(v_cur_dir, ''), '\s+', ' ', 'g')) = COALESCE(v_direccion_fiscal, '') THEN
            RAISE EXCEPTION 'No se detectaron cambios respecto a la versión activa. Modifique al menos un campo (Nombre, Abreviación, RIF o Dirección Fiscal) para crear una nueva versión.'
                USING ERRCODE = 'P0001';
        END IF;
    END IF;

    SELECT COALESCE(MAX(ov.version_numero), 0) INTO v_max_num
    FROM public.organizacion_version ov
    WHERE ov.id_organizacion = p_id_organizacion;

    IF v_active_id IS NOT NULL THEN
        UPDATE public.organizacion_version
        SET es_version_actual = FALSE,
            updated_at = NOW()
        WHERE id = v_active_id;
    END IF;

    INSERT INTO public.organizacion_version (
        id_organizacion,
        version_numero,
        es_version_actual,
        notas_version,
        nombre,
        abreviacion,
        rif,
        direccion_fiscal
    ) VALUES (
        p_id_organizacion,
        v_max_num + 1,
        TRUE,
        v_notas,
        v_nombre,
        v_abreviacion,
        v_rif,
        v_direccion_fiscal
    )
    RETURNING id INTO v_new_version_id;

    INSERT INTO public.audit_log (
        table_name,
        operation,
        record_id,
        old_data,
        new_data,
        performed_by
    ) VALUES (
        'organizacion_version',
        'INSERT',
        v_new_version_id,
        CASE WHEN v_active_id IS NOT NULL THEN jsonb_build_object(
            'accion', 'crear_version_organizacion',
            'version_anterior_numero', v_active_num,
            'nombre', v_cur_nombre,
            'abreviacion', v_cur_abrev,
            'rif', v_cur_rif
        ) ELSE NULL END,
        jsonb_build_object(
            'accion', 'crear_version_organizacion',
            'id_organizacion', p_id_organizacion,
            'version_numero', v_max_num + 1,
            'es_version_actual', TRUE,
            'nombre', v_nombre,
            'abreviacion', v_abreviacion,
            'rif', v_rif,
            'notas_version', v_notas
        ),
        auth.uid()
    );

    RETURN v_new_version_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_resolver_cert_versiones_organizacion(
    p_id_nueva_org_version UUID,
    p_cert_version_ids_migrar UUID[]
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_org_id UUID;
    v_is_actual BOOLEAN;
    v_ov_deleted TIMESTAMPTZ;
    v_org_deleted TIMESTAMPTZ;
    v_org_ver_num INTEGER;
    v_ids UUID[];
    v_valid_count INTEGER := 0;
    v_updated_count INTEGER := 0;
BEGIN
    IF NOT public.is_approved_worker() THEN
        RAISE EXCEPTION 'Acceso denegado: solo personal ADMIN o WORKER aprobado puede resolver versiones de certificados.'
            USING ERRCODE = 'P0001';
    END IF;

    IF p_id_nueva_org_version IS NULL THEN
        RAISE EXCEPTION 'Operación bloqueada: debe indicar una versión destino válida de la organización.'
            USING ERRCODE = 'P0001';
    END IF;

    SELECT ov.id_organizacion, ov.es_version_actual, ov.deleted_at, o.deleted_at, ov.version_numero
      INTO v_org_id, v_is_actual, v_ov_deleted, v_org_deleted, v_org_ver_num
    FROM public.organizacion_version ov
    JOIN public.organizacion o ON o.id = ov.id_organizacion
    WHERE ov.id = p_id_nueva_org_version;

    IF NOT FOUND OR v_ov_deleted IS NOT NULL OR v_org_deleted IS NOT NULL THEN
        RAISE EXCEPTION 'Operación bloqueada: la versión destino de la organización no existe o se encuentra archivada.'
            USING ERRCODE = 'P0001';
    END IF;

    IF v_is_actual IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION 'Operación bloqueada: solo es posible migrar certificados hacia la versión activa actual de la organización.'
            USING ERRCODE = 'P0001';
    END IF;

    IF p_cert_version_ids_migrar IS NULL OR COALESCE(array_length(p_cert_version_ids_migrar, 1), 0) = 0 THEN
        RETURN 0;
    END IF;

    SELECT ARRAY(
        SELECT DISTINCT x
        FROM unnest(p_cert_version_ids_migrar) AS x
        WHERE x IS NOT NULL
    ) INTO v_ids;

    IF COALESCE(array_length(v_ids, 1), 0) = 0 THEN
        RETURN 0;
    END IF;

    IF to_regclass('public.certificado_version') IS NULL THEN
        RAISE EXCEPTION 'Operación bloqueada: la estructura de versiones de certificado aún no está disponible en la base de datos.'
            USING ERRCODE = 'P0001';
    END IF;

    EXECUTE '
        SELECT COUNT(*)::INTEGER
        FROM public.certificado_version cv
        JOIN public.certificado c ON c.id = cv.id_certificado
        WHERE cv.id = ANY($1)
          AND cv.deleted_at IS NULL
          AND c.deleted_at IS NULL
          AND c.id_organizacion = $2
    '
    INTO v_valid_count
    USING v_ids, v_org_id;

    IF v_valid_count IS DISTINCT FROM array_length(v_ids, 1) THEN
        RAISE EXCEPTION 'Operación bloqueada: una o más versiones de certificado seleccionadas no pertenecen a la organización o están archivadas.'
            USING ERRCODE = 'P0001';
    END IF;

    EXECUTE '
        UPDATE public.certificado_version
        SET id_organizacion_version = $1,
            updated_at = NOW()
        WHERE id = ANY($2)
          AND deleted_at IS NULL
          AND id_organizacion_version IS DISTINCT FROM $1
    '
    USING p_id_nueva_org_version, v_ids;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    INSERT INTO public.audit_log (
        table_name,
        operation,
        record_id,
        old_data,
        new_data,
        performed_by
    ) VALUES (
        'organizacion_version',
        'UPDATE',
        p_id_nueva_org_version,
        jsonb_build_object(
            'accion', 'resolver_cert_versiones_organizacion',
            'certificado_versiones_solicitadas', array_length(v_ids, 1)
        ),
        jsonb_build_object(
            'accion', 'resolver_cert_versiones_organizacion',
            'id_organizacion', v_org_id,
            'version_numero_destino', v_org_ver_num,
            'certificado_versiones_migradas', v_updated_count
        ),
        auth.uid()
    );

    RETURN v_updated_count;
END;
$$;

CREATE TABLE IF NOT EXISTS client_organization_access (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    id_usuario UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    id_organizacion UUID NOT NULL REFERENCES public.organizacion(id) ON DELETE CASCADE,
    estado public.user_status NOT NULL DEFAULT 'PENDING',
    aprobado_por UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    fecha_solicitud TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    fecha_respuesta TIMESTAMPTZ,
    motivo_rechazo TEXT,
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    CONSTRAINT unique_usuario_organizacion UNIQUE (id_usuario, id_organizacion)
);

CREATE TABLE IF NOT EXISTS certificado (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    id_norma UUID NOT NULL REFERENCES norma(id) ON DELETE RESTRICT,
    id_estatus UUID NOT NULL REFERENCES estatus(id) ON DELETE RESTRICT,
    id_sector_iaf UUID NOT NULL REFERENCES sector_iaf(id) ON DELETE RESTRICT,
    id_subsector_iaf UUID NOT NULL REFERENCES subsector_iaf(id) ON DELETE RESTRICT,
    id_organizacion UUID NOT NULL REFERENCES organizacion(id) ON DELETE RESTRICT,
    numero_certificado VARCHAR(100) NOT NULL,
    multisitio BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    delete_reason TEXT
);

-- ============================================================================
-- Step 1.2: Tabla independiente public.alcance (no versionada) y compartición
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.alcance (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    id_certificado UUID NOT NULL REFERENCES public.certificado(id) ON DELETE CASCADE,
    alcance_es TEXT NOT NULL CHECK (LENGTH(TRIM(alcance_es)) >= 1),
    alcance_en TEXT NULL CHECK (alcance_en IS NULL OR LENGTH(TRIM(alcance_en)) >= 1),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    delete_reason TEXT
);

CREATE TABLE IF NOT EXISTS public.alcance_certificado_compartido (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    id_alcance UUID NOT NULL REFERENCES public.alcance(id) ON DELETE RESTRICT,
    id_certificado UUID NOT NULL REFERENCES public.certificado(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Backfill idempotente desde certificado.alcance previo al DROP COLUMN
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'certificado'
          AND column_name = 'alcance'
    ) THEN
        EXECUTE '
            INSERT INTO public.alcance (
                id_certificado,
                alcance_es,
                created_at,
                updated_at,
                deleted_at,
                deleted_by,
                delete_reason
            )
            SELECT
                c.id,
                TRIM(c.alcance),
                COALESCE(c.created_at, NOW()),
                COALESCE(c.updated_at, NOW()),
                c.deleted_at,
                c.deleted_by,
                CASE
                    WHEN c.deleted_at IS NOT NULL THEN COALESCE(c.delete_reason, ''Respaldo de alcance en certificado archivado'')
                    ELSE NULL
                END
            FROM public.certificado c
            WHERE LENGTH(TRIM(COALESCE(c.alcance, ''''))) > 0
              AND NOT EXISTS (
                  SELECT 1
                  FROM public.alcance a
                  WHERE a.id_certificado = c.id
              )
        ';

        ALTER TABLE public.certificado DROP COLUMN IF EXISTS alcance;
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public.fn_normalizar_alcance_bilingue()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_cert_deleted TIMESTAMPTZ;
BEGIN
    NEW.alcance_es := TRIM(COALESCE(NEW.alcance_es, ''));
    NEW.alcance_en := NULLIF(TRIM(COALESCE(NEW.alcance_en, '')), '');

    IF NEW.deleted_at IS NOT NULL THEN
        RETURN NEW;
    END IF;

    IF LENGTH(NEW.alcance_es) < 1 THEN
        RAISE EXCEPTION 'Operación bloqueada: el Alcance en español es obligatorio.'
            USING ERRCODE = 'P0001';
    END IF;

    SELECT c.deleted_at INTO v_cert_deleted
    FROM public.certificado c
    WHERE c.id = NEW.id_certificado;

    IF NOT FOUND OR v_cert_deleted IS NOT NULL THEN
        RAISE EXCEPTION 'Operación bloqueada: el certificado asociado al Alcance no existe o está archivado.'
            USING ERRCODE = 'P0001';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.alcance_certificado_compartido acc
        WHERE acc.id_certificado = NEW.id_certificado
          AND acc.deleted_at IS NULL
    ) THEN
        RAISE EXCEPTION 'Conflicto de Alcance: el certificado ya utiliza un Alcance compartido activo. Desvincule o reemplace el Alcance compartido antes de registrar uno propio.'
            USING ERRCODE = 'P0001';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalizar_alcance_bilingue ON public.alcance;
CREATE TRIGGER trg_normalizar_alcance_bilingue
    BEFORE INSERT OR UPDATE OF id_certificado, alcance_es, alcance_en, deleted_at ON public.alcance
    FOR EACH ROW EXECUTE FUNCTION public.fn_normalizar_alcance_bilingue();

CREATE OR REPLACE FUNCTION public.fn_validar_alcance_compartido()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_owner_cert_id UUID;
    v_alcance_deleted TIMESTAMPTZ;
    v_owner_cert_deleted TIMESTAMPTZ;
    v_owner_org_deleted TIMESTAMPTZ;
    v_owner_grupo_id UUID;
    v_owner_grupo_deleted TIMESTAMPTZ;
    v_target_cert_deleted TIMESTAMPTZ;
    v_target_org_deleted TIMESTAMPTZ;
    v_target_grupo_id UUID;
    v_target_grupo_deleted TIMESTAMPTZ;
BEGIN
    IF NEW.deleted_at IS NOT NULL THEN
        RETURN NEW;
    END IF;

    SELECT a.id_certificado,
           a.deleted_at,
           c_owner.deleted_at,
           o_owner.deleted_at,
           o_owner.id_grupo_empresarial,
           g_owner.deleted_at
      INTO v_owner_cert_id,
           v_alcance_deleted,
           v_owner_cert_deleted,
           v_owner_org_deleted,
           v_owner_grupo_id,
           v_owner_grupo_deleted
    FROM public.alcance a
    JOIN public.certificado c_owner ON c_owner.id = a.id_certificado
    JOIN public.organizacion o_owner ON o_owner.id = c_owner.id_organizacion
    LEFT JOIN public.grupo_empresarial g_owner ON g_owner.id = o_owner.id_grupo_empresarial
    WHERE a.id = NEW.id_alcance;

    IF NOT FOUND OR v_alcance_deleted IS NOT NULL THEN
        RAISE EXCEPTION 'Operación bloqueada: el Alcance seleccionado no existe o está archivado.'
            USING ERRCODE = 'P0001';
    END IF;

    IF v_owner_cert_deleted IS NOT NULL OR v_owner_org_deleted IS NOT NULL THEN
        RAISE EXCEPTION 'Operación bloqueada: el certificado u organización origen del Alcance está archivado.'
            USING ERRCODE = 'P0001';
    END IF;

    IF NEW.id_certificado = v_owner_cert_id THEN
        RAISE EXCEPTION 'Operación bloqueada: no puede compartir un Alcance con el mismo certificado propietario.'
            USING ERRCODE = 'P0001';
    END IF;

    SELECT c_target.deleted_at,
           o_target.deleted_at,
           o_target.id_grupo_empresarial,
           g_target.deleted_at
      INTO v_target_cert_deleted,
           v_target_org_deleted,
           v_target_grupo_id,
           v_target_grupo_deleted
    FROM public.certificado c_target
    JOIN public.organizacion o_target ON o_target.id = c_target.id_organizacion
    LEFT JOIN public.grupo_empresarial g_target ON g_target.id = o_target.id_grupo_empresarial
    WHERE c_target.id = NEW.id_certificado;

    IF NOT FOUND OR v_target_cert_deleted IS NOT NULL OR v_target_org_deleted IS NOT NULL THEN
        RAISE EXCEPTION 'Operación bloqueada: el certificado destino o su organización no existe o está archivada.'
            USING ERRCODE = 'P0001';
    END IF;

    IF v_owner_grupo_id IS NULL
       OR v_owner_grupo_deleted IS NOT NULL
       OR v_target_grupo_id IS NULL
       OR v_target_grupo_deleted IS NOT NULL
       OR v_owner_grupo_id IS DISTINCT FROM v_target_grupo_id THEN
        RAISE EXCEPTION 'Violación de Conglomerado: solo se permite compartir el Alcance entre certificados pertenecientes al mismo conglomerado activo.'
            USING ERRCODE = 'P0001';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.alcance a_own
        WHERE a_own.id_certificado = NEW.id_certificado
          AND a_own.deleted_at IS NULL
    ) THEN
        RAISE EXCEPTION 'Conflicto de Alcance: el certificado destino ya posee un Alcance propio activo. Resuelva o archive el Alcance actual antes de compartir uno nuevo.'
            USING ERRCODE = 'P0001';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.alcance_certificado_compartido acc_other
        WHERE acc_other.id_certificado = NEW.id_certificado
          AND acc_other.deleted_at IS NULL
          AND acc_other.id IS DISTINCT FROM NEW.id
    ) THEN
        RAISE EXCEPTION 'Conflicto de Alcance: el certificado destino ya utiliza otro Alcance compartido activo. Reemplace explícitamente la compartición existente.'
            USING ERRCODE = 'P0001';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validar_alcance_compartido ON public.alcance_certificado_compartido;
CREATE TRIGGER trg_validar_alcance_compartido
    BEFORE INSERT OR UPDATE OF id_alcance, id_certificado, deleted_at ON public.alcance_certificado_compartido
    FOR EACH ROW EXECUTE FUNCTION public.fn_validar_alcance_compartido();

CREATE OR REPLACE FUNCTION public.certificado_tiene_alcance_activo(p_id_certificado UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.alcance a
        WHERE a.id_certificado = p_id_certificado
          AND a.deleted_at IS NULL
          AND LENGTH(TRIM(a.alcance_es)) >= 1
    ) OR EXISTS (
        SELECT 1
        FROM public.alcance_certificado_compartido acc
        JOIN public.alcance a ON a.id = acc.id_alcance
        WHERE acc.id_certificado = p_id_certificado
          AND acc.deleted_at IS NULL
          AND a.deleted_at IS NULL
          AND LENGTH(TRIM(a.alcance_es)) >= 1
    );
$$;

-- ============================================================================
-- Step 1.2: Versionado de Certificado (public.certificado_version)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.certificado_version (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    id_certificado UUID NOT NULL REFERENCES public.certificado(id) ON DELETE CASCADE,
    id_organizacion_version UUID NOT NULL REFERENCES public.organizacion_version(id) ON DELETE RESTRICT,
    version_numero INTEGER NOT NULL CHECK (version_numero >= 1),
    es_version_actual BOOLEAN NOT NULL DEFAULT TRUE,
    notas_version TEXT NULL,
    id_estatus UUID NOT NULL REFERENCES public.estatus(id) ON DELETE RESTRICT,
    id_sector_iaf UUID NOT NULL REFERENCES public.sector_iaf(id) ON DELETE RESTRICT,
    id_subsector_iaf UUID NOT NULL REFERENCES public.subsector_iaf(id) ON DELETE RESTRICT,
    multisitio BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    delete_reason TEXT
);

-- Backfill idempotente hacia version_numero = 1 para todo certificado sin versión
INSERT INTO public.certificado_version (
    id_certificado,
    id_organizacion_version,
    version_numero,
    es_version_actual,
    notas_version,
    id_estatus,
    id_sector_iaf,
    id_subsector_iaf,
    multisitio,
    created_at,
    updated_at,
    deleted_at,
    deleted_by,
    delete_reason
)
SELECT
    c.id,
    ov.id,
    1,
    TRUE,
    'Versión inicial migrada automáticamente.',
    c.id_estatus,
    c.id_sector_iaf,
    c.id_subsector_iaf,
    c.multisitio,
    COALESCE(c.created_at, NOW()),
    COALESCE(c.updated_at, NOW()),
    c.deleted_at,
    c.deleted_by,
    c.delete_reason
FROM public.certificado c
JOIN LATERAL (
    SELECT ov0.id
    FROM public.organizacion_version ov0
    WHERE ov0.id_organizacion = c.id_organizacion
    ORDER BY (ov0.deleted_at IS NULL) DESC, ov0.es_version_actual DESC, ov0.version_numero DESC
    LIMIT 1
) ov ON TRUE
WHERE NOT EXISTS (
    SELECT 1
    FROM public.certificado_version cv
    WHERE cv.id_certificado = c.id
);

CREATE OR REPLACE FUNCTION public.fn_validar_certificado_version()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_cert_org UUID;
    v_cert_deleted TIMESTAMPTZ;
    v_ov_org UUID;
    v_ov_deleted TIMESTAMPTZ;
    v_max_ver INTEGER := 0;
    v_self_id UUID;
BEGIN
    IF NEW.deleted_at IS NOT NULL THEN
        IF TG_OP = 'INSERT' THEN
            SELECT c.deleted_at INTO v_cert_deleted
            FROM public.certificado c
            WHERE c.id = NEW.id_certificado;

            IF NOT FOUND OR v_cert_deleted IS NULL THEN
                RAISE EXCEPTION 'Operación bloqueada: no se permite registrar una versión pre-archivada para un certificado activo.'
                    USING ERRCODE = 'P0001';
            END IF;
        END IF;
        RETURN NEW;
    END IF;

    SELECT c.id_organizacion, c.deleted_at
      INTO v_cert_org, v_cert_deleted
    FROM public.certificado c
    WHERE c.id = NEW.id_certificado;

    IF NOT FOUND OR v_cert_deleted IS NOT NULL THEN
        RAISE EXCEPTION 'Operación bloqueada: el certificado contenedor no existe o se encuentra archivado.'
            USING ERRCODE = 'P0001';
    END IF;

    SELECT ov.id_organizacion, ov.deleted_at
      INTO v_ov_org, v_ov_deleted
    FROM public.organizacion_version ov
    WHERE ov.id = NEW.id_organizacion_version;

    IF NOT FOUND OR v_ov_deleted IS NOT NULL THEN
        RAISE EXCEPTION 'Operación bloqueada: la versión de organización asociada no existe o se encuentra archivada.'
            USING ERRCODE = 'P0001';
    END IF;

    IF v_ov_org IS DISTINCT FROM v_cert_org THEN
        RAISE EXCEPTION 'Violación de Integridad: la versión de organización seleccionada no pertenece a la organización del certificado.'
            USING ERRCODE = 'P0001';
    END IF;

    IF TG_OP = 'INSERT' THEN
        SELECT COALESCE(MAX(cv.version_numero), 0) INTO v_max_ver
        FROM public.certificado_version cv
        WHERE cv.id_certificado = NEW.id_certificado;

        IF NEW.version_numero IS DISTINCT FROM (v_max_ver + 1) THEN
            RAISE EXCEPTION 'Secuencia de versión inválida: el número de versión del certificado debe ser secuencial.'
                USING ERRCODE = 'P0001';
        END IF;
    ELSIF TG_OP = 'UPDATE' AND NEW.version_numero IS DISTINCT FROM OLD.version_numero THEN
        RAISE EXCEPTION 'Operación bloqueada: el número de versión del certificado es inmutable.'
            USING ERRCODE = 'P0001';
    END IF;

    IF NEW.es_version_actual = TRUE AND pg_trigger_depth() <= 1 THEN
        IF TG_OP = 'UPDATE' THEN
            v_self_id := OLD.id;
        ELSE
            v_self_id := NEW.id;
        END IF;

        UPDATE public.certificado_version
        SET es_version_actual = FALSE,
            updated_at = NOW()
        WHERE id_certificado = NEW.id_certificado
          AND id IS DISTINCT FROM v_self_id
          AND es_version_actual = TRUE
          AND deleted_at IS NULL;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validar_certificado_version ON public.certificado_version;
CREATE TRIGGER trg_validar_certificado_version
    BEFORE INSERT OR UPDATE ON public.certificado_version
    FOR EACH ROW EXECUTE FUNCTION public.fn_validar_certificado_version();

CREATE OR REPLACE FUNCTION public.fn_sincronizar_cache_certificado_desde_version()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NEW.es_version_actual = TRUE AND NEW.deleted_at IS NULL THEN
        UPDATE public.certificado c
        SET id_estatus = NEW.id_estatus,
            id_sector_iaf = NEW.id_sector_iaf,
            id_subsector_iaf = NEW.id_subsector_iaf,
            multisitio = NEW.multisitio,
            updated_at = NOW()
        WHERE c.id = NEW.id_certificado
          AND (
              c.id_estatus IS DISTINCT FROM NEW.id_estatus
              OR c.id_sector_iaf IS DISTINCT FROM NEW.id_sector_iaf
              OR c.id_subsector_iaf IS DISTINCT FROM NEW.id_subsector_iaf
              OR c.multisitio IS DISTINCT FROM NEW.multisitio
          );
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sincronizar_cache_certificado_desde_version ON public.certificado_version;
CREATE TRIGGER trg_sincronizar_cache_certificado_desde_version
    AFTER INSERT OR UPDATE OF es_version_actual, id_estatus, id_sector_iaf, id_subsector_iaf, multisitio, deleted_at ON public.certificado_version
    FOR EACH ROW EXECUTE FUNCTION public.fn_sincronizar_cache_certificado_desde_version();

CREATE OR REPLACE FUNCTION public.fn_sincronizar_certificado_version_inicial_legacy()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_org_version_id UUID;
BEGIN
    IF pg_trigger_depth() > 1 THEN
        RETURN NEW;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.certificado_version cv
        WHERE cv.id_certificado = NEW.id
    ) THEN
        SELECT ov.id INTO v_org_version_id
        FROM public.organizacion_version ov
        WHERE ov.id_organizacion = NEW.id_organizacion
          AND ov.deleted_at IS NULL
        ORDER BY ov.es_version_actual DESC, ov.version_numero DESC
        LIMIT 1;

        IF v_org_version_id IS NULL THEN
            RAISE EXCEPTION 'Operación bloqueada: la organización del certificado no cuenta con una versión activa registrada.'
                USING ERRCODE = 'P0001';
        END IF;

        INSERT INTO public.certificado_version (
            id_certificado,
            id_organizacion_version,
            version_numero,
            es_version_actual,
            notas_version,
            id_estatus,
            id_sector_iaf,
            id_subsector_iaf,
            multisitio,
            deleted_at,
            deleted_by,
            delete_reason
        ) VALUES (
            NEW.id,
            v_org_version_id,
            1,
            TRUE,
            'Versión inicial generada automáticamente desde contenedor.',
            NEW.id_estatus,
            NEW.id_sector_iaf,
            NEW.id_subsector_iaf,
            NEW.multisitio,
            NEW.deleted_at,
            NEW.deleted_by,
            NEW.delete_reason
        );
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sincronizar_certificado_version_inicial_legacy ON public.certificado;
CREATE TRIGGER trg_sincronizar_certificado_version_inicial_legacy
    AFTER INSERT ON public.certificado
    FOR EACH ROW EXECUTE FUNCTION public.fn_sincronizar_certificado_version_inicial_legacy();

CREATE OR REPLACE FUNCTION public.fn_cascada_archivo_certificado_versiones()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
        UPDATE public.certificado_version
        SET deleted_at = NEW.deleted_at,
            deleted_by = COALESCE(NEW.deleted_by, auth.uid()),
            delete_reason = COALESCE(NULLIF(TRIM(NEW.delete_reason), ''), 'Archivo en cascada de certificado contenedor'),
            updated_at = NOW()
        WHERE id_certificado = NEW.id
          AND deleted_at IS NULL;
    ELSIF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
        UPDATE public.certificado_version
        SET deleted_at = NULL,
            deleted_by = NULL,
            delete_reason = NULL,
            updated_at = NOW()
        WHERE id_certificado = NEW.id
          AND deleted_at = OLD.deleted_at;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cascada_archivo_certificado_versiones ON public.certificado;
CREATE TRIGGER trg_cascada_archivo_certificado_versiones
    AFTER UPDATE OF deleted_at ON public.certificado
    FOR EACH ROW EXECUTE FUNCTION public.fn_cascada_archivo_certificado_versiones();

-- Trigger reutilizable para resolver/validar alcance por versión de certificado
CREATE OR REPLACE FUNCTION public.fn_resolver_cert_version_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_cv_cert_id UUID;
    v_cv_deleted TIMESTAMPTZ;
BEGIN
    IF NEW.id_certificado_version IS NULL THEN
        IF NEW.id_certificado IS NULL THEN
            IF NULLIF(to_jsonb(NEW)->>'deleted_at', '') IS NOT NULL THEN
                RETURN NEW;
            END IF;
            RAISE EXCEPTION 'Operación bloqueada: debe indicar la versión del certificado o su certificado contenedor.'
                USING ERRCODE = 'P0001';
        END IF;

        SELECT cv.id INTO NEW.id_certificado_version
        FROM public.certificado_version cv
        WHERE cv.id_certificado = NEW.id_certificado
          AND cv.deleted_at IS NULL
        ORDER BY cv.es_version_actual DESC, cv.version_numero DESC
        LIMIT 1;

        IF NEW.id_certificado_version IS NULL THEN
            SELECT cv.id INTO NEW.id_certificado_version
            FROM public.certificado_version cv
            WHERE cv.id_certificado = NEW.id_certificado
            ORDER BY cv.es_version_actual DESC, cv.version_numero DESC
            LIMIT 1;
        END IF;

        IF NEW.id_certificado_version IS NULL THEN
            RAISE EXCEPTION 'Operación bloqueada: el certificado indicado no posee ninguna versión registrada.'
                USING ERRCODE = 'P0001';
        END IF;
    ELSE
        SELECT cv.id_certificado, cv.deleted_at
          INTO v_cv_cert_id, v_cv_deleted
        FROM public.certificado_version cv
        WHERE cv.id = NEW.id_certificado_version;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Operación bloqueada: la versión de certificado indicada no existe.'
                USING ERRCODE = 'P0001';
        END IF;

        IF NULLIF(to_jsonb(NEW)->>'deleted_at', '') IS NULL AND v_cv_deleted IS NOT NULL THEN
            RAISE EXCEPTION 'Operación bloqueada: la versión de certificado seleccionada se encuentra archivada.'
                USING ERRCODE = 'P0001';
        END IF;

        IF NEW.id_certificado IS NULL THEN
            NEW.id_certificado := v_cv_cert_id;
        ELSIF NEW.id_certificado IS DISTINCT FROM v_cv_cert_id THEN
            RAISE EXCEPTION 'Violación de Integridad: la versión de certificado indicada no corresponde al certificado del registro.'
                USING ERRCODE = 'P0001';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

-- ============================================================================
-- Step 1.3: RPCs de Clonación, Migración y Compartición/Reemplazo de Alcance
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_clonar_version_certificado(
    p_id_certificado UUID,
    p_id_estatus UUID DEFAULT NULL,
    p_id_sector_iaf UUID DEFAULT NULL,
    p_id_subsector_iaf UUID DEFAULT NULL,
    p_multisitio BOOLEAN DEFAULT NULL,
    p_id_organizacion_version UUID DEFAULT NULL,
    p_notas_version TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_cert RECORD;
    v_source public.certificado_version%ROWTYPE;
    v_org_version_id UUID;
    v_org_version_org UUID;
    v_org_version_deleted TIMESTAMPTZ;
    v_cert_grupo_id UUID;
    v_cert_grupo_deleted TIMESTAMPTZ;
    v_estatus_id UUID;
    v_sector_id UUID;
    v_subsector_id UUID;
    v_ss_sector_id UUID;
    v_multisitio BOOLEAN;
    v_max_ver INTEGER := 0;
    v_next_ver INTEGER := 1;
    v_notas TEXT;
    v_new_version_id UUID;
    v_sitio_map JSONB := '{}'::JSONB;
    v_proceso_map JSONB := '{}'::JSONB;
    v_sitio_rec RECORD;
    v_new_sitio_id UUID;
    v_tps_rec RECORD;
    v_proc_rec RECORD;
    v_new_proc_id UUID;
    v_tcc_rec RECORD;
    v_scc_rec RECORD;
    v_pcc_rec RECORD;
    v_ccc_rec RECORD;
    v_pps_rec RECORD;
    v_mapped_sitio UUID;
    v_mapped_proc UUID;
    v_cc_rec RECORD;
    v_new_cc_id UUID;
    v_cnt_sitios INTEGER := 0;
    v_cnt_turnos_sitio INTEGER := 0;
    v_cnt_procesos INTEGER := 0;
    v_cnt_pps INTEGER := 0;
    v_cnt_exclusiones INTEGER := 0;
    v_cnt_reqs INTEGER := 0;
    v_cnt_contactos INTEGER := 0;
    v_cnt_compartidos INTEGER := 0;
    v_row_delta INTEGER := 0;
BEGIN
    IF NOT public.is_approved_worker() THEN
        RAISE EXCEPTION 'Acceso denegado: solo personal ADMIN o WORKER aprobado puede clonar versiones de certificados.'
            USING ERRCODE = 'P0001';
    END IF;

    IF p_id_certificado IS NULL THEN
        RAISE EXCEPTION 'Operación bloqueada: debe indicar un certificado válido para crear la nueva versión.'
            USING ERRCODE = 'P0001';
    END IF;

    SELECT c.id,
           c.id_organizacion,
           c.id_norma,
           c.deleted_at,
           o.deleted_at AS org_deleted,
           o.id_grupo_empresarial,
           g.deleted_at AS grupo_deleted
      INTO v_cert
    FROM public.certificado c
    JOIN public.organizacion o ON o.id = c.id_organizacion
    LEFT JOIN public.grupo_empresarial g ON g.id = o.id_grupo_empresarial
    WHERE c.id = p_id_certificado
    FOR UPDATE OF c;

    IF NOT FOUND OR v_cert.deleted_at IS NOT NULL OR v_cert.org_deleted IS NOT NULL THEN
        RAISE EXCEPTION 'Operación bloqueada: el certificado o su organización no existe o se encuentra archivado.'
            USING ERRCODE = 'P0001';
    END IF;

    v_cert_grupo_id := v_cert.id_grupo_empresarial;
    v_cert_grupo_deleted := v_cert.grupo_deleted;

    SELECT cv.*
      INTO v_source
    FROM public.certificado_version cv
    WHERE cv.id_certificado = p_id_certificado
      AND cv.deleted_at IS NULL
    ORDER BY cv.es_version_actual DESC, cv.version_numero DESC
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Operación bloqueada: el certificado no posee una versión activa base para clonar.'
            USING ERRCODE = 'P0001';
    END IF;

    IF p_id_organizacion_version IS NOT NULL THEN
        SELECT ov.id, ov.id_organizacion, ov.deleted_at
          INTO v_org_version_id, v_org_version_org, v_org_version_deleted
        FROM public.organizacion_version ov
        WHERE ov.id = p_id_organizacion_version;

        IF NOT FOUND OR v_org_version_deleted IS NOT NULL THEN
            RAISE EXCEPTION 'Operación bloqueada: la versión de organización seleccionada no existe o está archivada.'
                USING ERRCODE = 'P0001';
        END IF;

        IF v_org_version_org IS DISTINCT FROM v_cert.id_organizacion THEN
            RAISE EXCEPTION 'Violación de Integridad: la versión de organización seleccionada no corresponde a la organización del certificado.'
                USING ERRCODE = 'P0001';
        END IF;
    ELSE
        SELECT ov.id
          INTO v_org_version_id
        FROM public.organizacion_version ov
        WHERE ov.id = v_source.id_organizacion_version
          AND ov.id_organizacion = v_cert.id_organizacion
          AND ov.deleted_at IS NULL;

        IF v_org_version_id IS NULL THEN
            SELECT ov.id
              INTO v_org_version_id
            FROM public.organizacion_version ov
            WHERE ov.id_organizacion = v_cert.id_organizacion
              AND ov.deleted_at IS NULL
            ORDER BY ov.es_version_actual DESC, ov.version_numero DESC
            LIMIT 1;
        END IF;

        IF v_org_version_id IS NULL THEN
            RAISE EXCEPTION 'Operación bloqueada: la organización del certificado no cuenta con una versión activa registrada.'
                USING ERRCODE = 'P0001';
        END IF;
    END IF;

    v_estatus_id := COALESCE(p_id_estatus, v_source.id_estatus);
    v_sector_id := COALESCE(p_id_sector_iaf, v_source.id_sector_iaf);
    v_subsector_id := COALESCE(p_id_subsector_iaf, v_source.id_subsector_iaf);
    v_multisitio := COALESCE(p_multisitio, v_source.multisitio);

    IF NOT EXISTS (SELECT 1 FROM public.estatus e WHERE e.id = v_estatus_id AND e.deleted_at IS NULL) THEN
        RAISE EXCEPTION 'Operación bloqueada: el estatus seleccionado no existe o está archivado.'
            USING ERRCODE = 'P0001';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.sector_iaf s WHERE s.id = v_sector_id AND s.deleted_at IS NULL) THEN
        RAISE EXCEPTION 'Operación bloqueada: el sector IAF seleccionado no existe o está archivado.'
            USING ERRCODE = 'P0001';
    END IF;

    SELECT ss.id_sector_iaf
      INTO v_ss_sector_id
    FROM public.subsector_iaf ss
    WHERE ss.id = v_subsector_id
      AND ss.deleted_at IS NULL;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Operación bloqueada: el subsector IAF seleccionado no existe o está archivado.'
            USING ERRCODE = 'P0001';
    END IF;

    IF v_ss_sector_id IS DISTINCT FROM v_sector_id THEN
        RAISE EXCEPTION 'Violación de Integridad IAF: el subsector seleccionado no pertenece al sector IAF de la versión.'
            USING ERRCODE = 'P0001';
    END IF;

    SELECT COALESCE(MAX(cv.version_numero), 0)
      INTO v_max_ver
    FROM public.certificado_version cv
    WHERE cv.id_certificado = p_id_certificado;

    v_next_ver := v_max_ver + 1;
    v_notas := COALESCE(
        NULLIF(TRIM(p_notas_version), ''),
        'Versión ' || v_next_ver::TEXT || ' clonada desde v' || v_source.version_numero::TEXT || '.'
    );

    UPDATE public.certificado_version
    SET es_version_actual = FALSE,
        updated_at = NOW()
    WHERE id_certificado = p_id_certificado
      AND es_version_actual = TRUE
      AND deleted_at IS NULL;

    v_new_version_id := uuid_generate_v4();

    INSERT INTO public.certificado_version (
        id,
        id_certificado,
        id_organizacion_version,
        version_numero,
        es_version_actual,
        notas_version,
        id_estatus,
        id_sector_iaf,
        id_subsector_iaf,
        multisitio
    ) VALUES (
        v_new_version_id,
        p_id_certificado,
        v_org_version_id,
        v_next_ver,
        TRUE,
        v_notas,
        v_estatus_id,
        v_sector_id,
        v_subsector_id,
        v_multisitio
    );

    -- 1. Clonar sitios propios y turnos_por_sitio
    FOR v_sitio_rec IN
        SELECT s.*
        FROM public.sitio s
        WHERE s.id_certificado_version = v_source.id
          AND s.deleted_at IS NULL
        ORDER BY s.numero_sitio ASC, s.created_at ASC, s.id ASC
    LOOP
        v_new_sitio_id := uuid_generate_v4();

        INSERT INTO public.sitio (
            id,
            id_certificado,
            id_certificado_version,
            numero_sitio,
            nombre_sitio,
            direccion_sitio,
            personal_count
        ) VALUES (
            v_new_sitio_id,
            p_id_certificado,
            v_new_version_id,
            v_sitio_rec.numero_sitio,
            v_sitio_rec.nombre_sitio,
            v_sitio_rec.direccion_sitio,
            v_sitio_rec.personal_count
        );

        v_sitio_map := v_sitio_map || jsonb_build_object(v_sitio_rec.id::TEXT, v_new_sitio_id::TEXT);
        v_cnt_sitios := v_cnt_sitios + 1;

        FOR v_tps_rec IN
            SELECT tps.id_turno
            FROM public.turnos_por_sitio tps
            JOIN public.turno t ON t.id = tps.id_turno
            WHERE tps.id_sitio = v_sitio_rec.id
              AND tps.deleted_at IS NULL
              AND t.deleted_at IS NULL
            ORDER BY tps.created_at ASC, tps.id ASC
        LOOP
            INSERT INTO public.turnos_por_sitio (id_sitio, id_turno)
            VALUES (v_new_sitio_id, v_tps_rec.id_turno);
            v_cnt_turnos_sitio := v_cnt_turnos_sitio + 1;
        END LOOP;
    END LOOP;

    -- 2. Clonar procesos propios
    FOR v_proc_rec IN
        SELECT p.*
        FROM public.proceso p
        WHERE p.id_certificado_version = v_source.id
          AND p.deleted_at IS NULL
        ORDER BY p.created_at ASC, p.id ASC
    LOOP
        v_new_proc_id := uuid_generate_v4();

        INSERT INTO public.proceso (
            id,
            id_certificado,
            id_certificado_version,
            nombre_proceso,
            tipo
        ) VALUES (
            v_new_proc_id,
            p_id_certificado,
            v_new_version_id,
            v_proc_rec.nombre_proceso,
            v_proc_rec.tipo
        );

        v_proceso_map := v_proceso_map || jsonb_build_object(v_proc_rec.id::TEXT, v_new_proc_id::TEXT);
        v_cnt_procesos := v_cnt_procesos + 1;
    END LOOP;

    -- 3. Clonar comparticiones activas del mismo conglomerado (turno, sitio, proceso, contacto)
    IF v_cert_grupo_id IS NOT NULL AND v_cert_grupo_deleted IS NULL THEN
        FOR v_tcc_rec IN
            SELECT tcc.id_turno, tcc.id_certificado_origen
            FROM public.turno_certificado_compartido tcc
            JOIN public.turno t ON t.id = tcc.id_turno
            LEFT JOIN public.certificado c_orig ON c_orig.id = tcc.id_certificado_origen
            LEFT JOIN public.organizacion o_orig ON o_orig.id = c_orig.id_organizacion
            LEFT JOIN public.grupo_empresarial g_orig ON g_orig.id = o_orig.id_grupo_empresarial
            WHERE tcc.id_certificado_version = v_source.id
              AND tcc.deleted_at IS NULL
              AND t.deleted_at IS NULL
              AND (
                  tcc.id_certificado_origen IS NULL
                  OR (
                      tcc.id_certificado_origen <> p_id_certificado
                      AND c_orig.deleted_at IS NULL
                      AND o_orig.deleted_at IS NULL
                      AND g_orig.deleted_at IS NULL
                      AND o_orig.id_grupo_empresarial = v_cert_grupo_id
                  )
              )
        LOOP
            INSERT INTO public.turno_certificado_compartido (
                id_turno,
                id_certificado,
                id_certificado_version,
                id_certificado_origen
            ) VALUES (
                v_tcc_rec.id_turno,
                p_id_certificado,
                v_new_version_id,
                v_tcc_rec.id_certificado_origen
            );
            v_cnt_compartidos := v_cnt_compartidos + 1;
        END LOOP;

        FOR v_scc_rec IN
            SELECT scc.id_sitio, scc.numero_sitio
            FROM public.sitio_certificado_compartido scc
            JOIN public.sitio s_src ON s_src.id = scc.id_sitio
            JOIN public.certificado c_orig ON c_orig.id = s_src.id_certificado
            JOIN public.organizacion o_orig ON o_orig.id = c_orig.id_organizacion
            JOIN public.grupo_empresarial g_orig ON g_orig.id = o_orig.id_grupo_empresarial
            WHERE scc.id_certificado_version = v_source.id
              AND scc.deleted_at IS NULL
              AND s_src.deleted_at IS NULL
              AND c_orig.id <> p_id_certificado
              AND c_orig.deleted_at IS NULL
              AND o_orig.deleted_at IS NULL
              AND g_orig.deleted_at IS NULL
              AND o_orig.id_grupo_empresarial = v_cert_grupo_id
              AND NOT EXISTS (
                  SELECT 1
                  FROM public.sitio s_new
                  WHERE s_new.id_certificado_version = v_new_version_id
                    AND s_new.numero_sitio = scc.numero_sitio
                    AND s_new.deleted_at IS NULL
              )
        LOOP
            INSERT INTO public.sitio_certificado_compartido (
                id_sitio,
                id_certificado,
                id_certificado_version,
                numero_sitio
            ) VALUES (
                v_scc_rec.id_sitio,
                p_id_certificado,
                v_new_version_id,
                v_scc_rec.numero_sitio
            );
            v_cnt_compartidos := v_cnt_compartidos + 1;
        END LOOP;

        FOR v_pcc_rec IN
            SELECT pcc.id_proceso,
                   pcc.sincronizar_requisitos,
                   c_orig.id_norma AS orig_norma,
                   p_src.nombre_proceso
            FROM public.proceso_certificado_compartido pcc
            JOIN public.proceso p_src ON p_src.id = pcc.id_proceso
            JOIN public.certificado c_orig ON c_orig.id = p_src.id_certificado
            JOIN public.organizacion o_orig ON o_orig.id = c_orig.id_organizacion
            JOIN public.grupo_empresarial g_orig ON g_orig.id = o_orig.id_grupo_empresarial
            WHERE pcc.id_certificado_version = v_source.id
              AND pcc.deleted_at IS NULL
              AND p_src.deleted_at IS NULL
              AND c_orig.id <> p_id_certificado
              AND c_orig.deleted_at IS NULL
              AND o_orig.deleted_at IS NULL
              AND g_orig.deleted_at IS NULL
              AND o_orig.id_grupo_empresarial = v_cert_grupo_id
              AND NOT EXISTS (
                  SELECT 1
                  FROM public.proceso p_new
                  WHERE p_new.id_certificado_version = v_new_version_id
                    AND p_new.deleted_at IS NULL
                    AND LOWER(TRIM(p_new.nombre_proceso)) = LOWER(TRIM(p_src.nombre_proceso))
              )
        LOOP
            INSERT INTO public.proceso_certificado_compartido (
                id_proceso,
                id_certificado,
                id_certificado_version,
                sincronizar_requisitos
            ) VALUES (
                v_pcc_rec.id_proceso,
                p_id_certificado,
                v_new_version_id,
                (v_pcc_rec.sincronizar_requisitos AND v_pcc_rec.orig_norma = v_cert.id_norma)
            );
            v_cnt_compartidos := v_cnt_compartidos + 1;
        END LOOP;

        FOR v_ccc_rec IN
            SELECT ccc.id_contacto
            FROM public.contacto_certificado_compartido ccc
            JOIN public.contacto_certificado cc_src ON cc_src.id = ccc.id_contacto
            JOIN public.certificado c_orig ON c_orig.id = cc_src.id_certificado
            JOIN public.organizacion o_orig ON o_orig.id = c_orig.id_organizacion
            JOIN public.grupo_empresarial g_orig ON g_orig.id = o_orig.id_grupo_empresarial
            WHERE ccc.id_certificado_version = v_source.id
              AND ccc.deleted_at IS NULL
              AND cc_src.deleted_at IS NULL
              AND c_orig.id <> p_id_certificado
              AND c_orig.deleted_at IS NULL
              AND o_orig.deleted_at IS NULL
              AND g_orig.deleted_at IS NULL
              AND o_orig.id_grupo_empresarial = v_cert_grupo_id
        LOOP
            INSERT INTO public.contacto_certificado_compartido (
                id_contacto,
                id_certificado,
                id_certificado_version
            ) VALUES (
                v_ccc_rec.id_contacto,
                p_id_certificado,
                v_new_version_id
            );
            v_cnt_compartidos := v_cnt_compartidos + 1;
        END LOOP;
    END IF;

    -- 4. Clonar procesos_por_sitio mapeando sitios y procesos propios/compartidos
    FOR v_pps_rec IN
        SELECT pps.id_sitio, pps.id_proceso
        FROM public.procesos_por_sitio pps
        WHERE pps.id_certificado_version = v_source.id
          AND pps.deleted_at IS NULL
        ORDER BY pps.created_at ASC, pps.id ASC
    LOOP
        v_mapped_sitio := COALESCE((NULLIF(v_sitio_map->>v_pps_rec.id_sitio::TEXT, ''))::UUID, v_pps_rec.id_sitio);
        v_mapped_proc := COALESCE((NULLIF(v_proceso_map->>v_pps_rec.id_proceso::TEXT, ''))::UUID, v_pps_rec.id_proceso);

        IF public.sitio_pertenece_a_certificado_version(v_mapped_sitio, v_new_version_id)
           AND public.proceso_pertenece_a_certificado_version(v_mapped_proc, v_new_version_id) THEN
            INSERT INTO public.procesos_por_sitio (
                id_certificado,
                id_certificado_version,
                id_sitio,
                id_proceso
            ) VALUES (
                p_id_certificado,
                v_new_version_id,
                v_mapped_sitio,
                v_mapped_proc
            )
            ON CONFLICT (id_certificado_version, id_sitio, id_proceso) WHERE deleted_at IS NULL DO NOTHING;

            GET DIAGNOSTICS v_row_delta = ROW_COUNT;
            v_cnt_pps := v_cnt_pps + COALESCE(v_row_delta, 0);
        END IF;
    END LOOP;

    -- 5. Clonar exclusiones ISO 4.3 ANTES de requisitos_por_proceso (evita disparo de trg_guard_req_proceso_against_exclusion)
    INSERT INTO public.requisitos_no_aplicables_certificado (
        id_certificado,
        id_certificado_version,
        id_requisito,
        justificacion
    )
    SELECT p_id_certificado,
           v_new_version_id,
           rna.id_requisito,
           rna.justificacion
    FROM public.requisitos_no_aplicables_certificado rna
    JOIN public.requisito r ON r.id = rna.id_requisito
    WHERE rna.id_certificado_version = v_source.id
      AND rna.deleted_at IS NULL
      AND r.deleted_at IS NULL
    ON CONFLICT (id_certificado_version, id_requisito) WHERE deleted_at IS NULL DO NOTHING;

    GET DIAGNOSTICS v_cnt_exclusiones = ROW_COUNT;

    -- 6. Clonar requisitos_por_proceso filtrando cláusulas excluidas en v_new_version_id
    INSERT INTO public.requisitos_por_proceso (
        id_proceso,
        id_certificado,
        id_certificado_version,
        id_requisito
    )
    SELECT COALESCE((NULLIF(v_proceso_map->>rpp.id_proceso::TEXT, ''))::UUID, rpp.id_proceso),
           p_id_certificado,
           v_new_version_id,
           rpp.id_requisito
    FROM public.requisitos_por_proceso rpp
    JOIN public.requisito r_req ON r_req.id = rpp.id_requisito
    WHERE rpp.id_certificado_version = v_source.id
      AND r_req.deleted_at IS NULL
      AND r_req.id_norma = v_cert.id_norma
      AND public.proceso_pertenece_a_certificado_version(
          COALESCE((NULLIF(v_proceso_map->>rpp.id_proceso::TEXT, ''))::UUID, rpp.id_proceso),
          v_new_version_id
      )
      AND NOT EXISTS (
          SELECT 1
          FROM public.requisitos_no_aplicables_certificado rna
          JOIN public.requisito r_excl ON r_excl.id = rna.id_requisito
          WHERE rna.id_certificado_version = v_new_version_id
            AND rna.deleted_at IS NULL
            AND r_excl.deleted_at IS NULL
            AND r_excl.id_norma = v_cert.id_norma
            AND (
                r_excl.id = r_req.id
                OR (
                    r_req.ruta_materializada IS NOT NULL
                    AND r_excl.ruta_materializada IS NOT NULL
                    AND r_req.ruta_materializada <@ r_excl.ruta_materializada
                )
            )
      )
    ON CONFLICT (id_proceso, id_certificado_version, id_requisito) DO NOTHING;

    GET DIAGNOSTICS v_cnt_reqs = ROW_COUNT;

    -- 7. Clonar contacto_certificado (+ teléfonos y emails activos). PROHIBIDO clonar fecha_certificado o alcance.
    FOR v_cc_rec IN
        SELECT cc.*
        FROM public.contacto_certificado cc
        WHERE cc.id_certificado_version = v_source.id
          AND cc.deleted_at IS NULL
          AND NOT EXISTS (
              SELECT 1
              FROM public.contacto_certificado_compartido ccc
              JOIN public.contacto_certificado cc_sh ON cc_sh.id = ccc.id_contacto
              WHERE ccc.id_certificado_version = v_new_version_id
                AND ccc.deleted_at IS NULL
                AND cc_sh.deleted_at IS NULL
                AND LOWER(TRIM(cc_sh.nombre)) = LOWER(TRIM(cc.nombre))
          )
        ORDER BY cc.created_at ASC, cc.id ASC
    LOOP
        v_new_cc_id := uuid_generate_v4();

        INSERT INTO public.contacto_certificado (
            id,
            id_certificado,
            id_certificado_version,
            nombre,
            cargo
        ) VALUES (
            v_new_cc_id,
            p_id_certificado,
            v_new_version_id,
            v_cc_rec.nombre,
            v_cc_rec.cargo
        );

        INSERT INTO public.telefono_contacto_certificado (
            id_contacto,
            telefono,
            tipo_telefono
        )
        SELECT v_new_cc_id,
               t.telefono,
               t.tipo_telefono
        FROM public.telefono_contacto_certificado t
        WHERE t.id_contacto = v_cc_rec.id
          AND t.deleted_at IS NULL;

        INSERT INTO public.email_contacto_certificado (
            id_contacto,
            email,
            tipo_email
        )
        SELECT v_new_cc_id,
               e.email,
               e.tipo_email
        FROM public.email_contacto_certificado e
        WHERE e.id_contacto = v_cc_rec.id
          AND e.deleted_at IS NULL;

        v_cnt_contactos := v_cnt_contactos + 1;
    END LOOP;

    INSERT INTO public.audit_log (
        table_name,
        operation,
        record_id,
        old_data,
        new_data,
        performed_by
    ) VALUES (
        'certificado_version',
        'INSERT',
        v_new_version_id,
        jsonb_build_object(
            'accion', 'clonar_version_certificado',
            'source_version_numero', v_source.version_numero
        ),
        jsonb_build_object(
            'accion', 'clonar_version_certificado',
            'id_certificado', p_id_certificado,
            'version_numero', v_next_ver,
            'es_version_actual', TRUE,
            'cloned_counts', jsonb_build_object(
                'sitios', v_cnt_sitios,
                'turnos_por_sitio', v_cnt_turnos_sitio,
                'procesos', v_cnt_procesos,
                'procesos_por_sitio', v_cnt_pps,
                'exclusiones', v_cnt_exclusiones,
                'requisitos_por_proceso', v_cnt_reqs,
                'contactos', v_cnt_contactos,
                'compartidos', v_cnt_compartidos
            )
        ),
        auth.uid()
    );

    RETURN jsonb_build_object(
        'new_version_id', v_new_version_id,
        'source_version_id', v_source.id,
        'version_numero', v_next_ver,
        'sitio_map', v_sitio_map,
        'proceso_map', v_proceso_map,
        'cloned_counts', jsonb_build_object(
            'sitios', v_cnt_sitios,
            'turnos_por_sitio', v_cnt_turnos_sitio,
            'procesos', v_cnt_procesos,
            'procesos_por_sitio', v_cnt_pps,
            'exclusiones', v_cnt_exclusiones,
            'requisitos_por_proceso', v_cnt_reqs,
            'contactos', v_cnt_contactos,
            'compartidos', v_cnt_compartidos
        )
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_migrar_auditorias_version_certificado(
    p_source_version_id UUID,
    p_target_version_id UUID,
    p_audit_ids_migrar UUID[] DEFAULT ARRAY[]::UUID[],
    p_sitio_map JSONB DEFAULT '{}'::JSONB,
    p_proceso_map JSONB DEFAULT '{}'::JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_src RECORD;
    v_tgt RECORD;
    v_total_source_audits INTEGER := 0;
    v_audit_ids UUID[] := ARRAY[]::UUID[];
    v_valid_count INTEGER := 0;
    v_aud_id UUID;
    v_migrated_count INTEGER := 0;
    v_kept_count INTEGER := 0;
    v_sa RECORD;
    v_cand_sitio UUID;
    v_new_sitio_id UUID;
    v_old_sitio_num INTEGER;
    v_tsa RECORD;
    v_turno_id UUID;
    v_new_tps_id UUID;
    v_psa RECORD;
    v_cand_proc UUID;
    v_new_proc_id UUID;
    v_old_proc_name VARCHAR(150);
    v_new_pps_id UUID;
    v_h RECORD;
    v_h_sitio UUID;
    v_h_proc UUID;
    v_sitio_map_safe JSONB := COALESCE(p_sitio_map, '{}'::JSONB);
    v_proceso_map_safe JSONB := COALESCE(p_proceso_map, '{}'::JSONB);
BEGIN
    IF NOT public.is_approved_worker() THEN
        RAISE EXCEPTION 'Acceso denegado: solo personal ADMIN o WORKER aprobado puede migrar auditorías entre versiones.'
            USING ERRCODE = 'P0001';
    END IF;

    IF p_source_version_id IS NULL OR p_target_version_id IS NULL THEN
        RAISE EXCEPTION 'Operación bloqueada: debe indicar la versión origen y la versión destino del certificado.'
            USING ERRCODE = 'P0001';
    END IF;

    IF p_source_version_id = p_target_version_id THEN
        RAISE EXCEPTION 'Operación bloqueada: la versión origen y la versión destino deben ser distintas.'
            USING ERRCODE = 'P0001';
    END IF;

    SELECT cv.id, cv.id_certificado, cv.version_numero, cv.deleted_at, c.deleted_at AS cert_deleted
      INTO v_src
    FROM public.certificado_version cv
    JOIN public.certificado c ON c.id = cv.id_certificado
    WHERE cv.id = p_source_version_id
    FOR UPDATE OF cv;

    IF NOT FOUND OR v_src.deleted_at IS NOT NULL OR v_src.cert_deleted IS NOT NULL THEN
        RAISE EXCEPTION 'Operación bloqueada: la versión origen del certificado no existe o está archivada.'
            USING ERRCODE = 'P0001';
    END IF;

    SELECT cv.id, cv.id_certificado, cv.version_numero, cv.deleted_at, c.deleted_at AS cert_deleted
      INTO v_tgt
    FROM public.certificado_version cv
    JOIN public.certificado c ON c.id = cv.id_certificado
    WHERE cv.id = p_target_version_id
    FOR UPDATE OF cv;

    IF NOT FOUND OR v_tgt.deleted_at IS NOT NULL OR v_tgt.cert_deleted IS NOT NULL THEN
        RAISE EXCEPTION 'Operación bloqueada: la versión destino del certificado no existe o está archivada.'
            USING ERRCODE = 'P0001';
    END IF;

    IF v_src.id_certificado IS DISTINCT FROM v_tgt.id_certificado THEN
        RAISE EXCEPTION 'Violación de Integridad: solo se pueden migrar auditorías entre versiones pertenecientes al mismo certificado.'
            USING ERRCODE = 'P0001';
    END IF;

    SELECT COUNT(*)::INTEGER
      INTO v_total_source_audits
    FROM public.auditoria a
    WHERE a.id_certificado_version = p_source_version_id
      AND a.deleted_at IS NULL;

    SELECT COALESCE(ARRAY(
        SELECT DISTINCT x
        FROM unnest(COALESCE(p_audit_ids_migrar, ARRAY[]::UUID[])) AS x
        WHERE x IS NOT NULL
    ), ARRAY[]::UUID[])
      INTO v_audit_ids;

    IF COALESCE(array_length(v_audit_ids, 1), 0) = 0 THEN
        RETURN jsonb_build_object(
            'migrated_count', 0,
            'kept_count', v_total_source_audits,
            'source_version_id', p_source_version_id,
            'target_version_id', p_target_version_id
        );
    END IF;

    SELECT COUNT(*)::INTEGER
      INTO v_valid_count
    FROM public.auditoria a
    WHERE a.id = ANY(v_audit_ids)
      AND a.id_certificado_version = p_source_version_id
      AND a.deleted_at IS NULL;

    IF v_valid_count IS DISTINCT FROM array_length(v_audit_ids, 1) THEN
        RAISE EXCEPTION 'Operación bloqueada: una o más auditorías seleccionadas no pertenecen a la versión origen o se encuentran archivadas.'
            USING ERRCODE = 'P0001';
    END IF;

    FOREACH v_aud_id IN ARRAY v_audit_ids LOOP
        -- 1. Reasignar auditoría hacia la versión destino (preserva auditoria_fecha, equipos, comentarios y sitios temporales)
        UPDATE public.auditoria
        SET id_certificado_version = p_target_version_id,
            updated_at = NOW()
        WHERE id = v_aud_id
          AND id_certificado_version = p_source_version_id
          AND deleted_at IS NULL;

        -- 2. Remapear sitios_por_auditoria, turnos_sitio_auditoria y procesos_sitio_auditoria
        FOR v_sa IN
            SELECT sa.*
            FROM public.sitios_por_auditoria sa
            WHERE sa.id_auditoria = v_aud_id
              AND sa.deleted_at IS NULL
            ORDER BY sa.created_at ASC, sa.id ASC
            FOR UPDATE OF sa
        LOOP
            v_new_sitio_id := NULL;

            IF v_sitio_map_safe ? v_sa.id_sitio::TEXT THEN
                v_cand_sitio := (NULLIF(v_sitio_map_safe->>v_sa.id_sitio::TEXT, ''))::UUID;
                IF v_cand_sitio IS NOT NULL
                   AND public.sitio_pertenece_a_certificado_version(v_cand_sitio, p_target_version_id) THEN
                    v_new_sitio_id := v_cand_sitio;
                END IF;
            END IF;

            IF v_new_sitio_id IS NULL
               AND public.sitio_pertenece_a_certificado_version(v_sa.id_sitio, p_target_version_id) THEN
                v_new_sitio_id := v_sa.id_sitio;
            END IF;

            IF v_new_sitio_id IS NULL THEN
                SELECT s.numero_sitio INTO v_old_sitio_num
                FROM public.sitio s
                WHERE s.id = v_sa.id_sitio;

                IF v_old_sitio_num IS NOT NULL THEN
                    SELECT s_tgt.id INTO v_new_sitio_id
                    FROM public.sitio s_tgt
                    WHERE s_tgt.id_certificado_version = p_target_version_id
                      AND s_tgt.numero_sitio = v_old_sitio_num
                      AND s_tgt.deleted_at IS NULL
                    LIMIT 1;

                    IF v_new_sitio_id IS NULL THEN
                        SELECT scc.id_sitio INTO v_new_sitio_id
                        FROM public.sitio_certificado_compartido scc
                        JOIN public.sitio s_sh ON s_sh.id = scc.id_sitio
                        WHERE scc.id_certificado_version = p_target_version_id
                          AND scc.numero_sitio = v_old_sitio_num
                          AND scc.deleted_at IS NULL
                          AND s_sh.deleted_at IS NULL
                        LIMIT 1;
                    END IF;
                END IF;
            END IF;

            IF v_new_sitio_id IS NULL THEN
                RAISE EXCEPTION 'Migración bloqueada: no existe un sitio equivalente en la versión destino del certificado para reasignar la auditoría.'
                    USING ERRCODE = 'P0001';
            END IF;

            IF v_new_sitio_id IS DISTINCT FROM v_sa.id_sitio THEN
                UPDATE public.sitios_por_auditoria
                SET id_sitio = v_new_sitio_id
                WHERE id = v_sa.id;
            END IF;

            -- Remapear turnos_sitio_auditoria del sitio
            FOR v_tsa IN
                SELECT tsa.*
                FROM public.turnos_sitio_auditoria tsa
                WHERE tsa.id_sitios_por_auditoria = v_sa.id
                  AND tsa.deleted_at IS NULL
                FOR UPDATE OF tsa
            LOOP
                SELECT tps.id_turno INTO v_turno_id
                FROM public.turnos_por_sitio tps
                WHERE tps.id = v_tsa.id_turnos_por_sitio;

                SELECT tps_new.id INTO v_new_tps_id
                FROM public.turnos_por_sitio tps_new
                WHERE tps_new.id_sitio = v_new_sitio_id
                  AND tps_new.id_turno = v_turno_id
                  AND tps_new.deleted_at IS NULL
                LIMIT 1;

                IF v_new_tps_id IS NULL THEN
                    RAISE EXCEPTION 'Migración bloqueada: el sitio equivalente en la versión destino no dispone de uno de los turnos asignados a la auditoría.'
                        USING ERRCODE = 'P0001';
                END IF;

                IF v_new_tps_id IS DISTINCT FROM v_tsa.id_turnos_por_sitio THEN
                    UPDATE public.turnos_sitio_auditoria
                    SET id_turnos_por_sitio = v_new_tps_id
                    WHERE id = v_tsa.id;
                END IF;
            END LOOP;

            -- Remapear procesos_sitio_auditoria del sitio
            FOR v_psa IN
                SELECT psa.*
                FROM public.procesos_sitio_auditoria psa
                WHERE psa.id_sitios_por_auditoria = v_sa.id
                  AND psa.deleted_at IS NULL
                FOR UPDATE OF psa
            LOOP
                v_new_proc_id := NULL;

                IF v_proceso_map_safe ? v_psa.id_proceso::TEXT THEN
                    v_cand_proc := (NULLIF(v_proceso_map_safe->>v_psa.id_proceso::TEXT, ''))::UUID;
                    IF v_cand_proc IS NOT NULL
                       AND public.proceso_pertenece_a_certificado_version(v_cand_proc, p_target_version_id) THEN
                        v_new_proc_id := v_cand_proc;
                    END IF;
                END IF;

                IF v_new_proc_id IS NULL
                   AND public.proceso_pertenece_a_certificado_version(v_psa.id_proceso, p_target_version_id) THEN
                    v_new_proc_id := v_psa.id_proceso;
                END IF;

                IF v_new_proc_id IS NULL THEN
                    SELECT p_old.nombre_proceso INTO v_old_proc_name
                    FROM public.proceso p_old
                    WHERE p_old.id = v_psa.id_proceso;

                    IF v_old_proc_name IS NOT NULL THEN
                        SELECT p_tgt.id INTO v_new_proc_id
                        FROM public.proceso p_tgt
                        WHERE p_tgt.id_certificado_version = p_target_version_id
                          AND p_tgt.deleted_at IS NULL
                          AND LOWER(TRIM(p_tgt.nombre_proceso)) = LOWER(TRIM(v_old_proc_name))
                        LIMIT 1;

                        IF v_new_proc_id IS NULL THEN
                            SELECT pcc.id_proceso INTO v_new_proc_id
                            FROM public.proceso_certificado_compartido pcc
                            JOIN public.proceso p_sh ON p_sh.id = pcc.id_proceso
                            WHERE pcc.id_certificado_version = p_target_version_id
                              AND pcc.deleted_at IS NULL
                              AND p_sh.deleted_at IS NULL
                              AND LOWER(TRIM(p_sh.nombre_proceso)) = LOWER(TRIM(v_old_proc_name))
                            LIMIT 1;
                        END IF;
                    END IF;
                END IF;

                IF v_new_proc_id IS NULL THEN
                    RAISE EXCEPTION 'Migración bloqueada: no existe un proceso equivalente en la versión destino del certificado para reasignar la auditoría.'
                        USING ERRCODE = 'P0001';
                END IF;

                SELECT pps_new.id INTO v_new_pps_id
                FROM public.procesos_por_sitio pps_new
                WHERE pps_new.id_certificado_version = p_target_version_id
                  AND pps_new.id_sitio = v_new_sitio_id
                  AND pps_new.id_proceso = v_new_proc_id
                  AND pps_new.deleted_at IS NULL
                LIMIT 1;

                IF v_new_pps_id IS NULL THEN
                    RAISE EXCEPTION 'Migración bloqueada: el proceso equivalente en la versión destino no está asignado al sitio destino correspondiente.'
                        USING ERRCODE = 'P0001';
                END IF;

                IF v_new_pps_id IS DISTINCT FROM v_psa.id_procesos_por_sitio
                   OR v_new_proc_id IS DISTINCT FROM v_psa.id_proceso THEN
                    UPDATE public.procesos_sitio_auditoria
                    SET id_procesos_por_sitio = v_new_pps_id,
                        id_proceso = v_new_proc_id,
                        updated_at = NOW()
                    WHERE id = v_psa.id;
                END IF;
            END LOOP;
        END LOOP;

        -- 3. Remapear hallazgos activos de la auditoría (preservando id_proceso NULL si aplica)
        FOR v_h IN
            SELECT h.*
            FROM public.hallazgo h
            WHERE h.id_auditoria = v_aud_id
              AND h.deleted_at IS NULL
            FOR UPDATE OF h
        LOOP
            v_h_sitio := v_h.id_sitio;
            v_h_proc := v_h.id_proceso;

            IF v_h.id_sitio IS NOT NULL THEN
                v_h_sitio := NULL;

                IF v_sitio_map_safe ? v_h.id_sitio::TEXT THEN
                    v_cand_sitio := (NULLIF(v_sitio_map_safe->>v_h.id_sitio::TEXT, ''))::UUID;
                    IF v_cand_sitio IS NOT NULL
                       AND public.sitio_pertenece_a_certificado_version(v_cand_sitio, p_target_version_id) THEN
                        v_h_sitio := v_cand_sitio;
                    END IF;
                END IF;

                IF v_h_sitio IS NULL
                   AND public.sitio_pertenece_a_certificado_version(v_h.id_sitio, p_target_version_id) THEN
                    v_h_sitio := v_h.id_sitio;
                END IF;

                IF v_h_sitio IS NULL THEN
                    SELECT s.numero_sitio INTO v_old_sitio_num
                    FROM public.sitio s
                    WHERE s.id = v_h.id_sitio;

                    IF v_old_sitio_num IS NOT NULL THEN
                        SELECT s_tgt.id INTO v_h_sitio
                        FROM public.sitio s_tgt
                        WHERE s_tgt.id_certificado_version = p_target_version_id
                          AND s_tgt.numero_sitio = v_old_sitio_num
                          AND s_tgt.deleted_at IS NULL
                        LIMIT 1;

                        IF v_h_sitio IS NULL THEN
                            SELECT scc.id_sitio INTO v_h_sitio
                            FROM public.sitio_certificado_compartido scc
                            JOIN public.sitio s_sh ON s_sh.id = scc.id_sitio
                            WHERE scc.id_certificado_version = p_target_version_id
                              AND scc.numero_sitio = v_old_sitio_num
                              AND scc.deleted_at IS NULL
                              AND s_sh.deleted_at IS NULL
                            LIMIT 1;
                        END IF;
                    END IF;
                END IF;

                IF v_h_sitio IS NULL THEN
                    RAISE EXCEPTION 'Migración bloqueada: un hallazgo apunta a un sitio sin equivalente activo en la versión destino.'
                        USING ERRCODE = 'P0001';
                END IF;
            END IF;

            IF v_h.id_proceso IS NOT NULL THEN
                v_h_proc := NULL;

                IF v_proceso_map_safe ? v_h.id_proceso::TEXT THEN
                    v_cand_proc := (NULLIF(v_proceso_map_safe->>v_h.id_proceso::TEXT, ''))::UUID;
                    IF v_cand_proc IS NOT NULL
                       AND public.proceso_pertenece_a_certificado_version(v_cand_proc, p_target_version_id) THEN
                        v_h_proc := v_cand_proc;
                    END IF;
                END IF;

                IF v_h_proc IS NULL
                   AND public.proceso_pertenece_a_certificado_version(v_h.id_proceso, p_target_version_id) THEN
                    v_h_proc := v_h.id_proceso;
                END IF;

                IF v_h_proc IS NULL THEN
                    SELECT p_old.nombre_proceso INTO v_old_proc_name
                    FROM public.proceso p_old
                    WHERE p_old.id = v_h.id_proceso;

                    IF v_old_proc_name IS NOT NULL THEN
                        SELECT p_tgt.id INTO v_h_proc
                        FROM public.proceso p_tgt
                        WHERE p_tgt.id_certificado_version = p_target_version_id
                          AND p_tgt.deleted_at IS NULL
                          AND LOWER(TRIM(p_tgt.nombre_proceso)) = LOWER(TRIM(v_old_proc_name))
                        LIMIT 1;

                        IF v_h_proc IS NULL THEN
                            SELECT pcc.id_proceso INTO v_h_proc
                            FROM public.proceso_certificado_compartido pcc
                            JOIN public.proceso p_sh ON p_sh.id = pcc.id_proceso
                            WHERE pcc.id_certificado_version = p_target_version_id
                              AND pcc.deleted_at IS NULL
                              AND p_sh.deleted_at IS NULL
                              AND LOWER(TRIM(p_sh.nombre_proceso)) = LOWER(TRIM(v_old_proc_name))
                            LIMIT 1;
                        END IF;
                    END IF;
                END IF;

                IF v_h_proc IS NULL THEN
                    RAISE EXCEPTION 'Migración bloqueada: un hallazgo apunta a un proceso sin equivalente activo en la versión destino.'
                        USING ERRCODE = 'P0001';
                END IF;
            END IF;

            IF v_h_sitio IS DISTINCT FROM v_h.id_sitio
               OR v_h_proc IS DISTINCT FROM v_h.id_proceso THEN
                UPDATE public.hallazgo
                SET id_sitio = v_h_sitio,
                    id_proceso = v_h_proc,
                    updated_at = NOW()
                WHERE id = v_h.id;
            END IF;
        END LOOP;

        v_migrated_count := v_migrated_count + 1;
    END LOOP;

    v_kept_count := GREATEST(0, v_total_source_audits - v_migrated_count);

    INSERT INTO public.audit_log (
        table_name,
        operation,
        record_id,
        old_data,
        new_data,
        performed_by
    ) VALUES (
        'auditoria',
        'UPDATE',
        p_target_version_id,
        jsonb_build_object(
            'accion', 'migrar_auditorias_version_certificado',
            'source_version_numero', v_src.version_numero,
            'auditorias_en_origen_previas', v_total_source_audits
        ),
        jsonb_build_object(
            'accion', 'migrar_auditorias_version_certificado',
            'id_certificado', v_src.id_certificado,
            'target_version_numero', v_tgt.version_numero,
            'migrated_count', v_migrated_count,
            'kept_count', v_kept_count
        ),
        auth.uid()
    );

    RETURN jsonb_build_object(
        'migrated_count', v_migrated_count,
        'kept_count', v_kept_count,
        'source_version_id', p_source_version_id,
        'target_version_id', p_target_version_id
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_compartir_alcance_con_resolucion(
    p_id_alcance UUID,
    p_target_cert_ids UUID[],
    p_reemplazar_existentes BOOLEAN DEFAULT FALSE
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_owner RECORD;
    v_target_ids UUID[] := ARRAY[]::UUID[];
    v_target_id UUID;
    v_tgt RECORD;
    v_conflict_own_id UUID;
    v_conflict_shared_id UUID;
    v_linked_count INTEGER := 0;
    v_replaced_count INTEGER := 0;
    v_skipped_count INTEGER := 0;
    v_replace BOOLEAN := COALESCE(p_reemplazar_existentes, FALSE);
BEGIN
    IF NOT public.is_approved_worker() THEN
        RAISE EXCEPTION 'Acceso denegado: solo personal ADMIN o WORKER aprobado puede compartir alcances entre certificados.'
            USING ERRCODE = 'P0001';
    END IF;

    IF p_id_alcance IS NULL THEN
        RAISE EXCEPTION 'Operación bloqueada: debe seleccionar un Alcance válido para compartir.'
            USING ERRCODE = 'P0001';
    END IF;

    SELECT a.id,
           a.id_certificado AS owner_cert_id,
           a.deleted_at AS alcance_deleted,
           c.deleted_at AS cert_deleted,
           o.deleted_at AS org_deleted,
           o.id_grupo_empresarial AS grupo_id,
           g.deleted_at AS grupo_deleted
      INTO v_owner
    FROM public.alcance a
    JOIN public.certificado c ON c.id = a.id_certificado
    JOIN public.organizacion o ON o.id = c.id_organizacion
    LEFT JOIN public.grupo_empresarial g ON g.id = o.id_grupo_empresarial
    WHERE a.id = p_id_alcance
    FOR UPDATE OF a;

    IF NOT FOUND OR v_owner.alcance_deleted IS NOT NULL THEN
        RAISE EXCEPTION 'Operación bloqueada: el Alcance seleccionado no existe o está archivado.'
            USING ERRCODE = 'P0001';
    END IF;

    IF v_owner.cert_deleted IS NOT NULL OR v_owner.org_deleted IS NOT NULL THEN
        RAISE EXCEPTION 'Operación bloqueada: el certificado u organización origen del Alcance está archivado.'
            USING ERRCODE = 'P0001';
    END IF;

    IF v_owner.grupo_id IS NULL OR v_owner.grupo_deleted IS NOT NULL THEN
        RAISE EXCEPTION 'Violación de Conglomerado: el certificado propietario del Alcance no pertenece a un conglomerado activo.'
            USING ERRCODE = 'P0001';
    END IF;

    SELECT COALESCE(ARRAY(
        SELECT DISTINCT x
        FROM unnest(COALESCE(p_target_cert_ids, ARRAY[]::UUID[])) AS x
        WHERE x IS NOT NULL
    ), ARRAY[]::UUID[])
      INTO v_target_ids;

    IF COALESCE(array_length(v_target_ids, 1), 0) = 0 THEN
        RETURN jsonb_build_object(
            'linked_count', 0,
            'replaced_count', 0,
            'skipped_count', 0
        );
    END IF;

    FOREACH v_target_id IN ARRAY v_target_ids LOOP
        IF v_target_id = v_owner.owner_cert_id THEN
            RAISE EXCEPTION 'Operación bloqueada: no puede compartir un Alcance con el mismo certificado propietario.'
                USING ERRCODE = 'P0001';
        END IF;

        SELECT c.id,
               c.deleted_at AS cert_deleted,
               o.deleted_at AS org_deleted,
               o.id_grupo_empresarial AS grupo_id,
               g.deleted_at AS grupo_deleted
          INTO v_tgt
        FROM public.certificado c
        JOIN public.organizacion o ON o.id = c.id_organizacion
        LEFT JOIN public.grupo_empresarial g ON g.id = o.id_grupo_empresarial
        WHERE c.id = v_target_id
        FOR UPDATE OF c;

        IF NOT FOUND OR v_tgt.cert_deleted IS NOT NULL OR v_tgt.org_deleted IS NOT NULL THEN
            RAISE EXCEPTION 'Operación bloqueada: uno de los certificados destino o su organización no existe o está archivada.'
                USING ERRCODE = 'P0001';
        END IF;

        IF v_tgt.grupo_id IS NULL
           OR v_tgt.grupo_deleted IS NOT NULL
           OR v_tgt.grupo_id IS DISTINCT FROM v_owner.grupo_id THEN
            RAISE EXCEPTION 'Violación de Conglomerado: solo se permite compartir el Alcance entre certificados pertenecientes al mismo conglomerado activo.'
                USING ERRCODE = 'P0001';
        END IF;

        IF EXISTS (
            SELECT 1
            FROM public.alcance_certificado_compartido acc_same
            WHERE acc_same.id_alcance = p_id_alcance
              AND acc_same.id_certificado = v_target_id
              AND acc_same.deleted_at IS NULL
        ) THEN
            v_skipped_count := v_skipped_count + 1;
            CONTINUE;
        END IF;

        SELECT a_own.id
          INTO v_conflict_own_id
        FROM public.alcance a_own
        WHERE a_own.id_certificado = v_target_id
          AND a_own.deleted_at IS NULL
        LIMIT 1
        FOR UPDATE;

        SELECT acc_other.id
          INTO v_conflict_shared_id
        FROM public.alcance_certificado_compartido acc_other
        WHERE acc_other.id_certificado = v_target_id
          AND acc_other.deleted_at IS NULL
          AND acc_other.id_alcance <> p_id_alcance
        LIMIT 1
        FOR UPDATE;

        IF v_conflict_own_id IS NOT NULL OR v_conflict_shared_id IS NOT NULL THEN
            IF NOT v_replace THEN
                RAISE EXCEPTION 'CONFLICTO_ALCANCE_EXISTENTE: El certificado destino ya posee un alcance registrado. Confirme el reemplazo para continuar.'
                    USING ERRCODE = 'P0001';
            END IF;

            IF v_conflict_own_id IS NOT NULL THEN
                UPDATE public.alcance
                SET deleted_at = NOW(),
                    deleted_by = auth.uid(),
                    delete_reason = 'Reemplazado al compartir alcance en conglomerado',
                    updated_at = NOW()
                WHERE id = v_conflict_own_id
                  AND deleted_at IS NULL;
            END IF;

            IF v_conflict_shared_id IS NOT NULL THEN
                UPDATE public.alcance_certificado_compartido
                SET deleted_at = NOW(),
                    deleted_by = auth.uid(),
                    updated_at = NOW()
                WHERE id = v_conflict_shared_id
                  AND deleted_at IS NULL;
            END IF;

            v_replaced_count := v_replaced_count + 1;
        END IF;

        INSERT INTO public.alcance_certificado_compartido (
            id_alcance,
            id_certificado
        ) VALUES (
            p_id_alcance,
            v_target_id
        );

        v_linked_count := v_linked_count + 1;
    END LOOP;

    INSERT INTO public.audit_log (
        table_name,
        operation,
        record_id,
        old_data,
        new_data,
        performed_by
    ) VALUES (
        'alcance_certificado_compartido',
        'INSERT',
        p_id_alcance,
        jsonb_build_object(
            'accion', 'compartir_alcance_con_resolucion',
            'certificados_solicitados', array_length(v_target_ids, 1),
            'reemplazar_existentes', v_replace
        ),
        jsonb_build_object(
            'accion', 'compartir_alcance_con_resolucion',
            'linked_count', v_linked_count,
            'replaced_count', v_replaced_count,
            'skipped_count', v_skipped_count
        ),
        auth.uid()
    );

    RETURN jsonb_build_object(
        'linked_count', v_linked_count,
        'replaced_count', v_replaced_count,
        'skipped_count', v_skipped_count
    );
END;
$$;

CREATE TABLE IF NOT EXISTS fecha_certificado (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    id_certificado UUID NOT NULL REFERENCES certificado(id) ON DELETE CASCADE,
    id_certificado_version UUID NOT NULL REFERENCES public.certificado_version(id) ON DELETE CASCADE,
    fecha DATE NOT NULL,
    tipo_fecha VARCHAR(40) NOT NULL CHECK (tipo_fecha IN (
        'Otorgamiento',
        'Renovación',
        'Vencimiento',
        'Modificación',
        'Suspensión',
        'Cancelación',
        'Ultima Auditoría'
    )),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    delete_reason TEXT
);

CREATE TABLE IF NOT EXISTS contacto_certificado (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    id_certificado UUID NOT NULL REFERENCES certificado(id) ON DELETE CASCADE,
    id_certificado_version UUID NOT NULL REFERENCES public.certificado_version(id) ON DELETE CASCADE,
    nombre VARCHAR(180) NOT NULL,
    cargo VARCHAR(150) NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    delete_reason TEXT
);

CREATE TABLE IF NOT EXISTS telefono_contacto_certificado (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    id_contacto UUID NOT NULL REFERENCES contacto_certificado(id) ON DELETE CASCADE,
    telefono VARCHAR(50) NOT NULL,
    tipo_telefono VARCHAR(40) NOT NULL DEFAULT 'Oficina',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS email_contacto_certificado (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    id_contacto UUID NOT NULL REFERENCES contacto_certificado(id) ON DELETE CASCADE,
    email VARCHAR(200) NOT NULL,
    tipo_email VARCHAR(40) NOT NULL DEFAULT 'Trabajo',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.contacto_certificado_compartido (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    id_contacto UUID NOT NULL REFERENCES public.contacto_certificado(id) ON DELETE RESTRICT,
    id_certificado UUID NOT NULL REFERENCES public.certificado(id) ON DELETE RESTRICT,
    id_certificado_version UUID NOT NULL REFERENCES public.certificado_version(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sitio (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    id_certificado UUID NOT NULL REFERENCES certificado(id) ON DELETE CASCADE,
    id_certificado_version UUID NOT NULL REFERENCES public.certificado_version(id) ON DELETE CASCADE,
    numero_sitio INTEGER NOT NULL CHECK (numero_sitio >= 0),
    nombre_sitio VARCHAR(150) NOT NULL,
    direccion_sitio TEXT NOT NULL,
    personal_count INTEGER NOT NULL DEFAULT 10 CHECK (personal_count BETWEEN 1 AND 50000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    delete_reason TEXT
);

CREATE TABLE IF NOT EXISTS public.sitio_certificado_compartido (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    id_sitio UUID NOT NULL REFERENCES public.sitio(id) ON DELETE RESTRICT,
    id_certificado UUID NOT NULL REFERENCES public.certificado(id) ON DELETE RESTRICT,
    id_certificado_version UUID NOT NULL REFERENCES public.certificado_version(id) ON DELETE RESTRICT,
    numero_sitio INTEGER NOT NULL CHECK (numero_sitio >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS proceso (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    id_certificado UUID NOT NULL REFERENCES certificado(id) ON DELETE CASCADE,
    id_certificado_version UUID NOT NULL REFERENCES public.certificado_version(id) ON DELETE CASCADE,
    nombre_proceso VARCHAR(150) NOT NULL,
    tipo VARCHAR(30) NOT NULL DEFAULT 'Medular' CONSTRAINT check_proceso_tipo CHECK (tipo IN ('Estratégico', 'Medular', 'De Apoyo', 'Otro')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    delete_reason TEXT
);

CREATE TABLE IF NOT EXISTS requisitos_por_proceso (
    id_proceso UUID NOT NULL REFERENCES proceso(id) ON DELETE CASCADE,
    id_certificado UUID NOT NULL REFERENCES certificado(id) ON DELETE CASCADE,
    id_certificado_version UUID NOT NULL REFERENCES public.certificado_version(id) ON DELETE CASCADE,
    id_requisito UUID NOT NULL REFERENCES requisito(id) ON DELETE CASCADE,
    PRIMARY KEY (id_proceso, id_certificado_version, id_requisito)
);

CREATE TABLE IF NOT EXISTS public.proceso_certificado_compartido (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    id_proceso UUID NOT NULL REFERENCES public.proceso(id) ON DELETE RESTRICT,
    id_certificado UUID NOT NULL REFERENCES public.certificado(id) ON DELETE RESTRICT,
    id_certificado_version UUID NOT NULL REFERENCES public.certificado_version(id) ON DELETE RESTRICT,
    sincronizar_requisitos BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS requisitos_no_aplicables_certificado (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    id_certificado UUID NOT NULL REFERENCES certificado(id) ON DELETE CASCADE,
    id_certificado_version UUID NOT NULL REFERENCES public.certificado_version(id) ON DELETE CASCADE,
    id_requisito UUID NOT NULL REFERENCES requisito(id) ON DELETE CASCADE,
    justificacion TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS turno (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    hora_entrada TIME NOT NULL,
    hora_salida TIME NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    delete_reason TEXT
);

CREATE TABLE IF NOT EXISTS turnos_por_sitio (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    id_sitio UUID NOT NULL REFERENCES sitio(id) ON DELETE CASCADE,
    id_turno UUID NOT NULL REFERENCES turno(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.turno_certificado_compartido (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    id_turno UUID NOT NULL REFERENCES public.turno(id) ON DELETE RESTRICT,
    id_certificado UUID NOT NULL REFERENCES public.certificado(id) ON DELETE RESTRICT,
    id_certificado_version UUID NOT NULL REFERENCES public.certificado_version(id) ON DELETE RESTRICT,
    id_certificado_origen UUID NULL REFERENCES public.certificado(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.procesos_por_sitio (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    id_certificado UUID NOT NULL REFERENCES public.certificado(id) ON DELETE RESTRICT,
    id_certificado_version UUID NOT NULL REFERENCES public.certificado_version(id) ON DELETE RESTRICT,
    id_sitio UUID NOT NULL REFERENCES public.sitio(id) ON DELETE RESTRICT,
    id_proceso UUID NOT NULL REFERENCES public.proceso(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Dominio 3: Planificación y Ejecución de Auditorías
CREATE TABLE IF NOT EXISTS public.vinculo (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    id_grupo_empresarial UUID NOT NULL REFERENCES public.grupo_empresarial(id) ON DELETE RESTRICT,
    codigo_vinculo VARCHAR(40) NULL,
    etiqueta VARCHAR(180) NOT NULL,
    nivel_vinculacion VARCHAR(30) NOT NULL DEFAULT 'INDIVIDUAL'
        CONSTRAINT check_vinculo_nivel CHECK (
            nivel_vinculacion IN ('INDIVIDUAL', 'NIVEL_1_INTRA_ORG', 'NIVEL_2_INTER_ORG')
        ),
    tipo_vinculacion VARCHAR(30) NOT NULL DEFAULT 'Individual'
        CONSTRAINT check_vinculo_tipo CHECK (
            tipo_vinculacion IN (
                'Individual', 'Combinada', 'Integrada',
                'Conjunta', 'Simultánea', 'Multientidad', 'Mixta'
            )
        ),
    es_vinculada BOOLEAN NOT NULL DEFAULT FALSE,
    tiene_sitio_temporal BOOLEAN NOT NULL DEFAULT FALSE,
    notas TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    delete_reason TEXT,
    CONSTRAINT check_vinculo_coherencia CHECK (
        (nivel_vinculacion = 'INDIVIDUAL' AND tipo_vinculacion = 'Individual' AND es_vinculada = FALSE)
        OR (nivel_vinculacion IN ('NIVEL_1_INTRA_ORG', 'NIVEL_2_INTER_ORG') AND tipo_vinculacion <> 'Individual' AND es_vinculada = TRUE)
    )
);

CREATE TABLE IF NOT EXISTS public.vinculo_certificado (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    id_vinculo UUID NOT NULL REFERENCES public.vinculo(id) ON DELETE CASCADE,
    id_certificado UUID NOT NULL REFERENCES public.certificado(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.programa_auditoria (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    id_vinculo UUID NULL REFERENCES public.vinculo(id) ON DELETE RESTRICT,
    id_grupo_empresarial UUID NULL REFERENCES public.grupo_empresarial(id) ON DELETE RESTRICT,
    codigo_programa VARCHAR(40) NULL,
    etiqueta VARCHAR(180) NOT NULL,
    nivel_vinculacion VARCHAR(30) NOT NULL DEFAULT 'INDIVIDUAL'
        CONSTRAINT check_programa_nivel_vinculacion CHECK (
            nivel_vinculacion IN ('INDIVIDUAL', 'NIVEL_1_INTRA_ORG', 'NIVEL_2_INTER_ORG')
        ),
    tipo_vinculacion VARCHAR(30) NOT NULL DEFAULT 'Individual'
        CONSTRAINT check_programa_tipo_vinculacion CHECK (
            tipo_vinculacion IN (
                'Individual',
                'Combinada',
                'Integrada',
                'Conjunta',
                'Simultánea',
                'Multientidad',
                'Mixta'
            )
        ),
    es_vinculada BOOLEAN NOT NULL DEFAULT FALSE,
    tiene_sitio_temporal BOOLEAN NOT NULL DEFAULT FALSE,
    id_ciclo_origen UUID NULL REFERENCES public.programa_auditoria(id) ON DELETE SET NULL,
    notas TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    delete_reason TEXT,
    CONSTRAINT check_programa_coherencia_individual CHECK (
        (nivel_vinculacion = 'INDIVIDUAL' AND tipo_vinculacion = 'Individual' AND es_vinculada = FALSE)
        OR (nivel_vinculacion IN ('NIVEL_1_INTRA_ORG', 'NIVEL_2_INTER_ORG') AND tipo_vinculacion <> 'Individual' AND es_vinculada = TRUE)
    ),
    CONSTRAINT check_programa_ciclo_origen_distinto CHECK (
        id_ciclo_origen IS NULL OR id_ciclo_origen <> id
    )
);

CREATE TABLE IF NOT EXISTS public.auditoria (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    id_programa_auditoria UUID NOT NULL REFERENCES public.programa_auditoria(id) ON DELETE RESTRICT,
    codigo_auditoria VARCHAR(40) NULL,
    id_certificado UUID NOT NULL REFERENCES public.certificado(id) ON DELETE RESTRICT,
    id_certificado_version UUID NOT NULL REFERENCES public.certificado_version(id) ON DELETE RESTRICT,
    id_tipo_auditoria UUID NULL REFERENCES public.tipo_auditoria(id) ON DELETE RESTRICT,
    id_metodologia UUID NULL REFERENCES public.metodologia_auditoria(id) ON DELETE RESTRICT,
    tiempo_auditoria NUMERIC(6,2) NOT NULL DEFAULT 0
        CHECK (tiempo_auditoria >= 0 AND MOD((tiempo_auditoria * 4)::NUMERIC, 1) = 0),
    estado_ciclo VARCHAR(30) NOT NULL DEFAULT 'Borrador'
        CONSTRAINT auditoria_estado_ciclo_check CHECK (estado_ciclo IN (
            'Borrador',
            'En Programación',
            'Programada',
            'En Ejecución',
            'Auditada',
            'Cerrada',
            'Reprogramada',
            'Cancelada'
        )),
    fecha_cierre_auditoria DATE NULL,
    revisado BOOLEAN NOT NULL DEFAULT FALSE,
    fecha_revision DATE NULL,
    revisado_por UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
    usuario_revisor_id UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
    documentacion_completa BOOLEAN NOT NULL DEFAULT FALSE,
    resumen_revision TEXT NULL,
    tiene_sitio_temporal BOOLEAN NOT NULL DEFAULT FALSE,
    objetivo TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    delete_reason TEXT
);

-- Migración idempotente Step 10.1: ampliar estado_ciclo con 'Cerrada' y fecha_cierre_auditoria
ALTER TABLE public.auditoria
    DROP CONSTRAINT IF EXISTS auditoria_estado_ciclo_check;
ALTER TABLE public.auditoria
    ADD CONSTRAINT auditoria_estado_ciclo_check CHECK (
        estado_ciclo IN (
            'Borrador',
            'En Programación',
            'Programada',
            'En Ejecución',
            'Auditada',
            'Cerrada',
            'Reprogramada',
            'Cancelada'
        )
    );
ALTER TABLE public.auditoria
    ADD COLUMN IF NOT EXISTS fecha_cierre_auditoria DATE NULL;

-- Migración idempotente Step 11.1 + Step 1.1: atributos QA de Revisión Post-Cierre
ALTER TABLE public.auditoria
    ADD COLUMN IF NOT EXISTS revisado BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS fecha_revision DATE NULL,
    ADD COLUMN IF NOT EXISTS revisado_por UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS usuario_revisor_id UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS documentacion_completa BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS resumen_revision TEXT NULL;

CREATE TABLE IF NOT EXISTS public.auditoria_fecha (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    id_auditoria UUID NOT NULL REFERENCES public.auditoria(id) ON DELETE CASCADE,
    numero_secuencia INTEGER NOT NULL CHECK (numero_secuencia >= 1),
    tag VARCHAR(30) NOT NULL DEFAULT 'Programación'
        CONSTRAINT check_auditoria_fecha_tag CHECK (tag IN ('Programación', 'Reprogramación')),
    tipo_fecha VARCHAR(30) NOT NULL
        CONSTRAINT check_auditoria_fecha_tipo CHECK (tipo_fecha IN ('PREPROGRAMADA_MES', 'PROGRAMADA_EXACTA', 'REAL')),
    anio SMALLINT NULL CHECK (anio IS NULL OR (anio BETWEEN 2000 AND 2100)),
    mes SMALLINT NULL CHECK (mes IS NULL OR (mes BETWEEN 1 AND 12)),
    fecha_inicio DATE NULL,
    fecha_fin DATE NULL,
    observacion TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    CONSTRAINT check_auditoria_fecha_payload CHECK (
        (
            tipo_fecha = 'PREPROGRAMADA_MES'
            AND anio IS NOT NULL
            AND mes IS NOT NULL
            AND fecha_inicio IS NULL
            AND fecha_fin IS NULL
        )
        OR (
            tipo_fecha IN ('PROGRAMADA_EXACTA', 'REAL')
            AND fecha_inicio IS NOT NULL
            AND fecha_fin IS NOT NULL
            AND fecha_fin >= fecha_inicio
        )
    )
);

-- Migración idempotente Step 3.1: separar PROGRAMADA_EXACTA vs REAL en instalaciones previas
ALTER TABLE public.auditoria_fecha
    DROP CONSTRAINT IF EXISTS check_auditoria_fecha_tipo;
ALTER TABLE public.auditoria_fecha
    DROP CONSTRAINT IF EXISTS check_auditoria_fecha_payload;

UPDATE public.auditoria_fecha af
SET tipo_fecha = 'PROGRAMADA_EXACTA'
FROM public.auditoria a
WHERE a.id = af.id_auditoria
  AND af.tipo_fecha = 'REAL'
  AND a.estado_ciclo NOT IN ('Auditada', 'Cerrada');

ALTER TABLE public.auditoria_fecha
    ADD CONSTRAINT check_auditoria_fecha_tipo
        CHECK (tipo_fecha IN ('PREPROGRAMADA_MES', 'PROGRAMADA_EXACTA', 'REAL'));

ALTER TABLE public.auditoria_fecha
    ADD CONSTRAINT check_auditoria_fecha_payload CHECK (
        (
            tipo_fecha = 'PREPROGRAMADA_MES'
            AND anio IS NOT NULL
            AND mes IS NOT NULL
            AND fecha_inicio IS NULL
            AND fecha_fin IS NULL
        )
        OR (
            tipo_fecha IN ('PROGRAMADA_EXACTA', 'REAL')
            AND fecha_inicio IS NOT NULL
            AND fecha_fin IS NOT NULL
            AND fecha_fin >= fecha_inicio
        )
    );

CREATE TABLE IF NOT EXISTS public.configuracion_alerta_auditoria (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clave VARCHAR(40) NOT NULL DEFAULT 'DEFAULT',
    dias_aviso_proxima INTEGER NOT NULL DEFAULT 15 CHECK (dias_aviso_proxima BETWEEN 1 AND 365),
    dias_aviso_preprogramada_sin_confirmar INTEGER NOT NULL DEFAULT 30 CHECK (dias_aviso_preprogramada_sin_confirmar BETWEEN 1 AND 365),
    alertar_atrasadas BOOLEAN NOT NULL DEFAULT TRUE,
    alertar_conflicto_auditor BOOLEAN NOT NULL DEFAULT TRUE,
    alertar_desfase_dias_o_span BOOLEAN NOT NULL DEFAULT TRUE,
    ciclos_rotacion_auditor_lider INTEGER NOT NULL DEFAULT 3 CHECK (ciclos_rotacion_auditor_lider BETWEEN 2 AND 10),
    dias_limite_plan_accion INTEGER NOT NULL DEFAULT 15 CHECK (dias_limite_plan_accion BETWEEN 1 AND 180),
    dias_limite_plan_nc INTEGER NOT NULL DEFAULT 15 CHECK (dias_limite_plan_nc BETWEEN 1 AND 180),
    dias_limite_cierre_nc INTEGER NOT NULL DEFAULT 45 CHECK (dias_limite_cierre_nc BETWEEN 1 AND 365),
    alertas_activas BOOLEAN NOT NULL DEFAULT TRUE,
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Migración idempotente Step 10.1 + Step 1.1: offsets configurables (+15d Plan / +45d Cierre) para No Conformidades
ALTER TABLE public.configuracion_alerta_auditoria
    ADD COLUMN IF NOT EXISTS dias_limite_plan_accion INTEGER NOT NULL DEFAULT 15
        CHECK (dias_limite_plan_accion BETWEEN 1 AND 180),
    ADD COLUMN IF NOT EXISTS dias_limite_plan_nc INTEGER NOT NULL DEFAULT 15
        CHECK (dias_limite_plan_nc BETWEEN 1 AND 180),
    ADD COLUMN IF NOT EXISTS dias_limite_cierre_nc INTEGER NOT NULL DEFAULT 45
        CHECK (dias_limite_cierre_nc BETWEEN 1 AND 365);

ALTER TABLE public.configuracion_alerta_auditoria
    ALTER COLUMN dias_limite_plan_nc SET DEFAULT 15,
    ALTER COLUMN dias_limite_cierre_nc SET DEFAULT 45;

CREATE OR REPLACE FUNCTION public.fn_sync_config_alerta_plan_nc()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        NEW.dias_limite_plan_nc := COALESCE(NEW.dias_limite_plan_nc, NEW.dias_limite_plan_accion, 15);
        NEW.dias_limite_plan_accion := COALESCE(NEW.dias_limite_plan_accion, NEW.dias_limite_plan_nc, 15);
        IF NEW.dias_limite_plan_nc IS DISTINCT FROM NEW.dias_limite_plan_accion AND NEW.dias_limite_plan_nc <> 15 THEN
            NEW.dias_limite_plan_accion := NEW.dias_limite_plan_nc;
        ELSE
            NEW.dias_limite_plan_nc := NEW.dias_limite_plan_accion;
        END IF;
    ELSIF TG_OP = 'UPDATE' THEN
        IF NEW.dias_limite_plan_nc IS DISTINCT FROM OLD.dias_limite_plan_nc THEN
            NEW.dias_limite_plan_accion := NEW.dias_limite_plan_nc;
        ELSIF NEW.dias_limite_plan_accion IS DISTINCT FROM OLD.dias_limite_plan_accion THEN
            NEW.dias_limite_plan_nc := NEW.dias_limite_plan_accion;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_config_alerta_plan_nc ON public.configuracion_alerta_auditoria;
CREATE TRIGGER trg_sync_config_alerta_plan_nc
    BEFORE INSERT OR UPDATE OF dias_limite_plan_nc, dias_limite_plan_accion ON public.configuracion_alerta_auditoria
    FOR EACH ROW EXECUTE FUNCTION public.fn_sync_config_alerta_plan_nc();

CREATE TABLE IF NOT EXISTS comentarios_por_auditoria (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    id_auditoria UUID NOT NULL REFERENCES auditoria(id) ON DELETE CASCADE,
    comentario TEXT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS equipo_auditor (
    id_auditoria UUID NOT NULL REFERENCES auditoria(id) ON DELETE CASCADE,
    id_auditor UUID NOT NULL REFERENCES auditor(id) ON DELETE CASCADE,
    rol_auditor VARCHAR(50) NOT NULL DEFAULT 'AUDITOR',
    PRIMARY KEY (id_auditoria, id_auditor)
);

CREATE TABLE IF NOT EXISTS sitios_por_auditoria (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    id_auditoria UUID NOT NULL REFERENCES auditoria(id) ON DELETE CASCADE,
    id_sitio UUID NOT NULL REFERENCES sitio(id) ON DELETE RESTRICT,
    tiempo_auditoria NUMERIC(6,2) NOT NULL DEFAULT 0
        CHECK (tiempo_auditoria >= 0 AND MOD((tiempo_auditoria * 4)::NUMERIC, 1) = 0),
    modalidad_evaluacion VARCHAR(20) NULL
        CHECK (modalidad_evaluacion IS NULL OR modalidad_evaluacion IN ('Presencial', 'Remota', 'Mixta')),
    fecha_inicio DATE NULL,
    fecha_fin DATE NULL
        CHECK (fecha_fin IS NULL OR fecha_inicio IS NULL OR fecha_fin >= fecha_inicio),
    notas_sitio TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.auditoria_sitio_temporal (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    id_auditoria UUID NOT NULL REFERENCES public.auditoria(id) ON DELETE CASCADE,
    etiqueta VARCHAR(180) NOT NULL DEFAULT 'Sitio Temporal',
    comentario TEXT NULL,
    tiempo_auditoria NUMERIC(6,2) NOT NULL DEFAULT 0
        CHECK (tiempo_auditoria >= 0 AND MOD((tiempo_auditoria * 4)::NUMERIC, 1) = 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    delete_reason TEXT
);

CREATE TABLE IF NOT EXISTS public.auditoria_sitio_temporal_certificado (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    id_sitio_temporal UUID NOT NULL REFERENCES public.auditoria_sitio_temporal(id) ON DELETE CASCADE,
    id_auditoria_certificado UUID NOT NULL REFERENCES public.auditoria(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS turnos_sitio_auditoria (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    id_sitios_por_auditoria UUID NOT NULL REFERENCES sitios_por_auditoria(id) ON DELETE CASCADE,
    id_turnos_por_sitio UUID NOT NULL REFERENCES turnos_por_sitio(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.procesos_sitio_auditoria (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    id_sitios_por_auditoria UUID NOT NULL REFERENCES public.sitios_por_auditoria(id) ON DELETE CASCADE,
    id_procesos_por_sitio UUID NOT NULL REFERENCES public.procesos_por_sitio(id) ON DELETE RESTRICT,
    id_proceso UUID NOT NULL REFERENCES public.proceso(id) ON DELETE RESTRICT,
    notas TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.turnos_proceso_sitio_auditoria (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    id_procesos_sitio_auditoria UUID NOT NULL REFERENCES public.procesos_sitio_auditoria(id) ON DELETE CASCADE,
    id_turnos_sitio_auditoria UUID NOT NULL REFERENCES public.turnos_sitio_auditoria(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.equipo_auditor_sitio (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    id_sitios_por_auditoria UUID NOT NULL REFERENCES public.sitios_por_auditoria(id) ON DELETE CASCADE,
    id_auditor UUID NOT NULL REFERENCES public.auditor(id) ON DELETE RESTRICT,
    rol_auditor VARCHAR(50) NOT NULL DEFAULT 'AUDITOR'
        CHECK (rol_auditor IN ('AUDITOR_LIDER', 'AUDITOR', 'AUDITOR_EN_ENTRENAMIENTO', 'EXPERTO_TECNICO')),
    tiempo_auditoria NUMERIC(6,2) NOT NULL DEFAULT 0
        CHECK (tiempo_auditoria >= 0 AND MOD((tiempo_auditoria * 4)::NUMERIC, 1) = 0),
    asignacion_completa_sitio BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.equipo_auditor_sitio_temporal (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    id_sitio_temporal UUID NOT NULL REFERENCES public.auditoria_sitio_temporal(id) ON DELETE CASCADE,
    id_auditor UUID NOT NULL REFERENCES public.auditor(id) ON DELETE RESTRICT,
    rol_auditor VARCHAR(50) NOT NULL DEFAULT 'AUDITOR'
        CHECK (rol_auditor IN ('AUDITOR_LIDER', 'AUDITOR', 'AUDITOR_EN_ENTRENAMIENTO', 'EXPERTO_TECNICO')),
    tiempo_auditoria NUMERIC(6,2) NOT NULL DEFAULT 0
        CHECK (tiempo_auditoria >= 0 AND MOD((tiempo_auditoria * 4)::NUMERIC, 1) = 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.equipo_auditor_proceso_sitio (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    id_procesos_sitio_auditoria UUID NOT NULL REFERENCES public.procesos_sitio_auditoria(id) ON DELETE CASCADE,
    id_auditor UUID NOT NULL REFERENCES public.auditor(id) ON DELETE RESTRICT,
    rol_en_proceso VARCHAR(50) NOT NULL DEFAULT 'EVALUADOR'
        CHECK (rol_en_proceso IN ('LIDER_PROCESO', 'EVALUADOR', 'APOYO_TECNICO', 'OBSERVADOR')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.hallazgo (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    id_auditoria UUID NOT NULL REFERENCES public.auditoria(id) ON DELETE CASCADE,
    id_requisito UUID NOT NULL REFERENCES public.requisito(id) ON DELETE RESTRICT,
    id_proceso UUID NULL REFERENCES public.proceso(id) ON DELETE RESTRICT,
    id_sitio UUID NULL REFERENCES public.sitio(id) ON DELETE RESTRICT,
    tipo public.tipo_hallazgo NOT NULL,
    descripcion TEXT NOT NULL,
    evidencia TEXT,
    fecha_limite_plan DATE NULL,
    fecha_entrega_plan DATE NULL,
    fecha_limite_cierre DATE NULL,
    fecha_cierre_real DATE NULL,
    cerrado BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    delete_reason TEXT
);

-- Migración idempotente Step 10.1 + Step 1.1: extender hallazgo y permitir id_proceso NULL (flujo por cláusula)
ALTER TABLE public.hallazgo
    ADD COLUMN IF NOT EXISTS id_sitio UUID NULL REFERENCES public.sitio(id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS fecha_limite_plan DATE NULL,
    ADD COLUMN IF NOT EXISTS fecha_entrega_plan DATE NULL,
    ADD COLUMN IF NOT EXISTS fecha_limite_cierre DATE NULL,
    ADD COLUMN IF NOT EXISTS fecha_cierre_real DATE NULL;

ALTER TABLE public.hallazgo
    ALTER COLUMN id_proceso DROP NOT NULL;

-- Triggers de Vínculo Persistente (Step 2.1: vinculo <-> vinculo_certificado)
CREATE OR REPLACE FUNCTION public.fn_validar_vinculo_certificado()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_vinculo_grupo UUID;
    v_vinculo_nivel VARCHAR(30);
    v_vinculo_deleted TIMESTAMPTZ;
    v_cert_org UUID;
    v_cert_grupo UUID;
    v_cert_deleted TIMESTAMPTZ;
    v_active_count INTEGER;
BEGIN
    IF NEW.deleted_at IS NOT NULL THEN
        RETURN NEW;
    END IF;

    SELECT v.id_grupo_empresarial, v.nivel_vinculacion, v.deleted_at
      INTO v_vinculo_grupo, v_vinculo_nivel, v_vinculo_deleted
    FROM public.vinculo v
    WHERE v.id = NEW.id_vinculo
    FOR UPDATE;

    IF NOT FOUND OR v_vinculo_deleted IS NOT NULL THEN
        RAISE EXCEPTION 'Operación bloqueada: el vínculo seleccionado no existe o está archivado.'
            USING ERRCODE = 'P0001';
    END IF;

    SELECT c.id_organizacion, o.id_grupo_empresarial, c.deleted_at
      INTO v_cert_org, v_cert_grupo, v_cert_deleted
    FROM public.certificado c
    JOIN public.organizacion o ON o.id = c.id_organizacion
    WHERE c.id = NEW.id_certificado
      AND o.deleted_at IS NULL;

    IF v_cert_org IS NULL OR v_cert_deleted IS NOT NULL THEN
        RAISE EXCEPTION 'Operación bloqueada: el certificado o su organización no existe o está archivada.'
            USING ERRCODE = 'P0001';
    END IF;

    IF v_cert_grupo IS DISTINCT FROM v_vinculo_grupo THEN
        RAISE EXCEPTION 'Violación de Conglomerado: solo pueden vincularse certificados pertenecientes al mismo conglomerado.'
            USING ERRCODE = 'P0001';
    END IF;

    IF v_vinculo_nivel = 'INDIVIDUAL' THEN
        SELECT COUNT(*)::INTEGER INTO v_active_count
        FROM public.vinculo_certificado vc
        WHERE vc.id_vinculo = NEW.id_vinculo
          AND vc.id <> NEW.id
          AND vc.deleted_at IS NULL;
        IF v_active_count >= 1 THEN
            RAISE EXCEPTION 'Un vínculo Individual admite exactamente un certificado activo.'
                USING ERRCODE = 'P0001';
        END IF;
    ELSIF v_vinculo_nivel = 'NIVEL_1_INTRA_ORG' THEN
        IF EXISTS (
            SELECT 1
            FROM public.vinculo_certificado vc
            JOIN public.certificado c ON c.id = vc.id_certificado
            WHERE vc.id_vinculo = NEW.id_vinculo
              AND vc.id <> NEW.id
              AND vc.deleted_at IS NULL
              AND c.id_organizacion IS DISTINCT FROM v_cert_org
        ) THEN
            RAISE EXCEPTION 'Violación Nivel 1 Intra-Org: todos los certificados deben pertenecer a la misma organización.'
                USING ERRCODE = 'P0001';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validar_vinculo_certificado ON public.vinculo_certificado;
CREATE TRIGGER trg_validar_vinculo_certificado
    BEFORE INSERT OR UPDATE OF id_vinculo, id_certificado, deleted_at ON public.vinculo_certificado
    FOR EACH ROW EXECUTE FUNCTION public.fn_validar_vinculo_certificado();

CREATE OR REPLACE FUNCTION public.fn_validar_desvinculacion_certificado()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_remaining INTEGER;
BEGIN
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
        IF EXISTS (
            SELECT 1
            FROM public.auditoria a
            JOIN public.programa_auditoria pa ON pa.id = a.id_programa_auditoria
            WHERE pa.id_vinculo = OLD.id_vinculo
              AND a.id_certificado = OLD.id_certificado
              AND a.deleted_at IS NULL
              AND a.estado_ciclo NOT IN ('Cerrada', 'Cancelada', 'Auditada')
        ) THEN
            RAISE EXCEPTION 'No se puede desvincular el certificado: existen auditorías pendientes o en ejecución bajo este vínculo.'
                USING ERRCODE = 'P0001';
        END IF;

        SELECT COUNT(*)::INTEGER INTO v_remaining
        FROM public.vinculo_certificado vc
        WHERE vc.id_vinculo = OLD.id_vinculo
          AND vc.id <> OLD.id
          AND vc.deleted_at IS NULL;

        IF v_remaining = 0 THEN
            UPDATE public.vinculo
            SET deleted_at = NOW(),
                deleted_by = COALESCE(NEW.deleted_by, auth.uid()),
                delete_reason = 'Limpieza automática: vínculo sin certificados activos'
            WHERE id = OLD.id_vinculo
              AND deleted_at IS NULL;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validar_desvinculacion_certificado ON public.vinculo_certificado;
CREATE TRIGGER trg_validar_desvinculacion_certificado
    AFTER UPDATE OF deleted_at ON public.vinculo_certificado
    FOR EACH ROW EXECUTE FUNCTION public.fn_validar_desvinculacion_certificado();

-- Triggers de Coherencia de Vinculación (programa_auditoria <-> auditoria) y Compuerta Paso 2
CREATE OR REPLACE FUNCTION public.fn_validar_auditoria_en_programa()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_nivel_programa VARCHAR(30);
    v_programa_deleted TIMESTAMPTZ;
    v_programa_vinculo UUID;
    v_programa_temporal BOOLEAN;
    v_cert_org UUID;
    v_cert_grupo UUID;
    v_cert_deleted TIMESTAMPTZ;
    v_active_count INTEGER;
BEGIN
    IF NEW.deleted_at IS NOT NULL THEN
        RETURN NEW;
    END IF;

    SELECT pa.nivel_vinculacion, pa.deleted_at, pa.id_vinculo, pa.tiene_sitio_temporal
      INTO v_nivel_programa, v_programa_deleted, v_programa_vinculo, v_programa_temporal
    FROM public.programa_auditoria pa
    WHERE pa.id = NEW.id_programa_auditoria
    FOR UPDATE;

    IF NOT FOUND OR v_programa_deleted IS NOT NULL THEN
        RAISE EXCEPTION 'Operación bloqueada: la campaña de auditoría no existe o está archivada.'
            USING ERRCODE = 'P0001';
    END IF;

    SELECT c.id_organizacion, o.id_grupo_empresarial, c.deleted_at
      INTO v_cert_org, v_cert_grupo, v_cert_deleted
    FROM public.certificado c
    JOIN public.organizacion o ON o.id = c.id_organizacion
    WHERE c.id = NEW.id_certificado
      AND o.deleted_at IS NULL;

    IF v_cert_org IS NULL OR v_cert_deleted IS NOT NULL THEN
        RAISE EXCEPTION 'Operación bloqueada: el certificado o su organización no existe o está archivada.'
            USING ERRCODE = 'P0001';
    END IF;

    -- Compuerta Paso 2 (Insalvable): El certificado NO puede estar LIBRE
    IF NOT EXISTS (
        SELECT 1
        FROM public.vinculo_certificado vc
        JOIN public.vinculo v ON v.id = vc.id_vinculo
        WHERE vc.id_certificado = NEW.id_certificado
          AND vc.deleted_at IS NULL
          AND v.deleted_at IS NULL
          AND (v_programa_vinculo IS NULL OR v.id = v_programa_vinculo)
    ) THEN
        RAISE EXCEPTION 'Compuerta Paso 2 (Vínculo): El certificado se encuentra LIBRE o no pertenece al vínculo activo de esta campaña. Configúrelo primero en Auditoría → Vínculo.'
            USING ERRCODE = 'P0001';
    END IF;

    IF TG_OP = 'INSERT' AND NEW.tiene_sitio_temporal = FALSE AND v_programa_temporal = TRUE THEN
        NEW.tiene_sitio_temporal := TRUE;
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.auditoria a
        WHERE a.id_programa_auditoria = NEW.id_programa_auditoria
          AND a.id_certificado = NEW.id_certificado
          AND a.id <> NEW.id
          AND a.deleted_at IS NULL
    ) THEN
        RAISE EXCEPTION 'Operación bloqueada: el certificado ya tiene una auditoría activa en esta campaña.'
            USING ERRCODE = 'P0001';
    END IF;

    IF v_nivel_programa = 'INDIVIDUAL' THEN
        SELECT COUNT(*)::INTEGER INTO v_active_count
        FROM public.auditoria a
        WHERE a.id_programa_auditoria = NEW.id_programa_auditoria
          AND a.id <> NEW.id
          AND a.deleted_at IS NULL;
        IF v_active_count >= 1 THEN
            RAISE EXCEPTION 'Violación Individual: la campaña solo admite un certificado.'
                USING ERRCODE = 'P0001';
        END IF;
    ELSIF v_nivel_programa = 'NIVEL_1_INTRA_ORG' THEN
        IF EXISTS (
            SELECT 1 FROM public.auditoria a
            JOIN public.certificado c ON c.id = a.id_certificado
            WHERE a.id_programa_auditoria = NEW.id_programa_auditoria
              AND a.id <> NEW.id
              AND a.deleted_at IS NULL
              AND c.id_organizacion IS DISTINCT FROM v_cert_org
        ) THEN
            RAISE EXCEPTION 'Violación Nivel 1: los certificados deben pertenecer a la misma organización.'
                USING ERRCODE = 'P0001';
        END IF;
    ELSIF v_nivel_programa = 'NIVEL_2_INTER_ORG' THEN
        IF EXISTS (
            SELECT 1 FROM public.auditoria a
            JOIN public.certificado c ON c.id = a.id_certificado
            JOIN public.organizacion o ON o.id = c.id_organizacion
            WHERE a.id_programa_auditoria = NEW.id_programa_auditoria
              AND a.id <> NEW.id
              AND a.deleted_at IS NULL
              AND o.id_grupo_empresarial IS DISTINCT FROM v_cert_grupo
        ) THEN
            RAISE EXCEPTION 'Violación Nivel 2: todos los certificados vinculados deben pertenecer al mismo conglomerado.'
                USING ERRCODE = 'P0001';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validar_auditoria_en_programa ON public.auditoria;
CREATE TRIGGER trg_validar_auditoria_en_programa
    BEFORE INSERT OR UPDATE OF id_programa_auditoria, id_certificado, deleted_at ON public.auditoria
    FOR EACH ROW EXECUTE FUNCTION public.fn_validar_auditoria_en_programa();

-- Step 1.2: Bloquear generación de auditorías cuando el certificado no cuenta con Alcance activo
CREATE OR REPLACE FUNCTION public.fn_validar_auditoria_requiere_alcance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NEW.deleted_at IS NOT NULL THEN
        RETURN NEW;
    END IF;

    IF NOT public.certificado_tiene_alcance_activo(NEW.id_certificado) THEN
        RAISE EXCEPTION 'Operación bloqueada: el certificado seleccionado no cuenta con un Alcance activo registrado o compartido. Defina el Alcance en español antes de generar auditorías.'
            USING ERRCODE = 'P0001';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validar_auditoria_requiere_alcance ON public.auditoria;
CREATE TRIGGER trg_validar_auditoria_requiere_alcance
    BEFORE INSERT ON public.auditoria
    FOR EACH ROW EXECUTE FUNCTION public.fn_validar_auditoria_requiere_alcance();

-- Step 4.1 + Step 1.2: Pre-selección automática de Sitio 0 (Sede Principal HQ) en la versión de certificado de la auditoría
CREATE OR REPLACE FUNCTION public.fn_auto_asignar_sitio_principal_auditoria()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_sitio_hq_id UUID;
BEGIN
    IF NEW.deleted_at IS NOT NULL THEN
        RETURN NEW;
    END IF;

    SELECT s.id INTO v_sitio_hq_id
    FROM public.sitio s
    WHERE s.id_certificado_version = NEW.id_certificado_version
      AND s.numero_sitio = 0
      AND s.deleted_at IS NULL
    ORDER BY s.created_at ASC, s.id ASC
    LIMIT 1;

    IF v_sitio_hq_id IS NULL THEN
        SELECT s.id INTO v_sitio_hq_id
        FROM public.sitio_certificado_compartido scc
        JOIN public.sitio s ON s.id = scc.id_sitio
        WHERE scc.id_certificado_version = NEW.id_certificado_version
          AND scc.numero_sitio = 0
          AND scc.deleted_at IS NULL
          AND s.deleted_at IS NULL
        ORDER BY scc.created_at ASC, s.id ASC
        LIMIT 1;
    END IF;

    IF v_sitio_hq_id IS NOT NULL THEN
        INSERT INTO public.sitios_por_auditoria (
            id_auditoria,
            id_sitio,
            tiempo_auditoria,
            modalidad_evaluacion
        )
        SELECT NEW.id, v_sitio_hq_id, 0, 'Presencial'
        WHERE NOT EXISTS (
            SELECT 1 FROM public.sitios_por_auditoria sa
            WHERE sa.id_auditoria = NEW.id
              AND sa.id_sitio = v_sitio_hq_id
              AND sa.deleted_at IS NULL
        );
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_asignar_sitio_principal_auditoria ON public.auditoria;
CREATE TRIGGER trg_auto_asignar_sitio_principal_auditoria
    AFTER INSERT ON public.auditoria
    FOR EACH ROW EXECUTE FUNCTION public.fn_auto_asignar_sitio_principal_auditoria();

-- Step 1.1 (Future Changes): Generadores RPC deterministas de códigos únicos (programa_auditoria y auditoria)
CREATE OR REPLACE FUNCTION public.fn_next_programa_auditoria_codigo(p_year INTEGER)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_year INTEGER;
    v_max_seq BIGINT := 0;
    v_next_seq BIGINT := 1;
    v_seq_str TEXT;
    v_candidate TEXT;
BEGIN
    IF NOT public.is_approved_staff() THEN
        RAISE EXCEPTION 'Acceso denegado: solo personal administrativo autorizado puede generar códigos de programa.'
            USING ERRCODE = 'P0001';
    END IF;

    v_year := COALESCE(p_year, EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER);
    IF v_year < 1900 OR v_year > 2999 THEN
        v_year := EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER;
    END IF;

    SELECT COALESCE(
        MAX(
            CASE
                WHEN LENGTH(SUBSTRING(UPPER(TRIM(pa.codigo_programa)) FROM ('^PROG-' || v_year::TEXT || '-([0-9]+)$'))) <= 12
                THEN (SUBSTRING(UPPER(TRIM(pa.codigo_programa)) FROM ('^PROG-' || v_year::TEXT || '-([0-9]+)$')))::BIGINT
                ELSE 0
            END
        ),
        0
    )
    INTO v_max_seq
    FROM public.programa_auditoria pa
    WHERE pa.deleted_at IS NULL
      AND pa.codigo_programa IS NOT NULL
      AND UPPER(TRIM(pa.codigo_programa)) ~ ('^PROG-' || v_year::TEXT || '-[0-9]+$');

    v_next_seq := v_max_seq + 1;
    LOOP
        v_seq_str := CASE
            WHEN v_next_seq < 1000 THEN LPAD(v_next_seq::TEXT, 3, '0')
            ELSE v_next_seq::TEXT
        END;
        v_candidate := LEFT('PROG-' || v_year::TEXT || '-' || v_seq_str, 40);
        EXIT WHEN NOT EXISTS (
            SELECT 1
            FROM public.programa_auditoria pa2
            WHERE pa2.deleted_at IS NULL
              AND UPPER(TRIM(pa2.codigo_programa)) = v_candidate
        );
        v_next_seq := v_next_seq + 1;
    END LOOP;

    RETURN v_candidate;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_next_auditoria_codigo(p_year INTEGER, p_cert_short TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_year INTEGER;
    v_clean_cert TEXT;
    v_prefix_base TEXT;
    v_max_seq BIGINT := 0;
    v_next_seq BIGINT := 1;
    v_seq_str TEXT;
    v_max_cert_len INTEGER;
    v_capped_cert TEXT;
    v_candidate TEXT;
BEGIN
    IF NOT public.is_approved_staff() THEN
        RAISE EXCEPTION 'Acceso denegado: solo personal administrativo autorizado puede generar códigos de auditoría.'
            USING ERRCODE = 'P0001';
    END IF;

    v_year := COALESCE(p_year, EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER);
    IF v_year < 1900 OR v_year > 2999 THEN
        v_year := EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER;
    END IF;

    v_clean_cert := REGEXP_REPLACE(UPPER(COALESCE(p_cert_short, '')), '[^A-Z0-9-]', '', 'g');
    v_clean_cert := REGEXP_REPLACE(v_clean_cert, '^-+|-+$', '', 'g');
    v_clean_cert := REGEXP_REPLACE(v_clean_cert, '-{2,}', '-', 'g');
    IF v_clean_cert = '' THEN
        v_clean_cert := 'CERT';
    END IF;
    v_clean_cert := REGEXP_REPLACE(RIGHT(v_clean_cert, 8), '^-+|-+$', '', 'g');
    IF v_clean_cert = '' THEN
        v_clean_cert := 'CERT';
    END IF;

    v_prefix_base := 'AUD-' || v_year::TEXT || '-';

    SELECT COALESCE(
        MAX(
            CASE
                WHEN LENGTH(SUBSTRING(UPPER(TRIM(a.codigo_auditoria)) FROM ('^AUD-' || v_year::TEXT || '-' || v_clean_cert || '-([0-9]+)$'))) <= 12
                THEN (SUBSTRING(UPPER(TRIM(a.codigo_auditoria)) FROM ('^AUD-' || v_year::TEXT || '-' || v_clean_cert || '-([0-9]+)$')))::BIGINT
                ELSE 0
            END
        ),
        0
    )
    INTO v_max_seq
    FROM public.auditoria a
    WHERE a.deleted_at IS NULL
      AND a.codigo_auditoria IS NOT NULL
      AND UPPER(TRIM(a.codigo_auditoria)) ~ ('^AUD-' || v_year::TEXT || '-' || v_clean_cert || '-[0-9]+$');

    v_next_seq := v_max_seq + 1;
    LOOP
        v_seq_str := CASE
            WHEN v_next_seq < 100 THEN LPAD(v_next_seq::TEXT, 2, '0')
            ELSE v_next_seq::TEXT
        END;
        v_max_cert_len := GREATEST(1, 40 - LENGTH(v_prefix_base) - LENGTH(v_seq_str) - 1);
        v_capped_cert := COALESCE(
            NULLIF(REGEXP_REPLACE(LEFT(v_clean_cert, v_max_cert_len), '-+$', ''), ''),
            LEFT('CERT', v_max_cert_len)
        );
        v_candidate := LEFT(v_prefix_base || v_capped_cert || '-' || v_seq_str, 40);
        EXIT WHEN NOT EXISTS (
            SELECT 1
            FROM public.auditoria a2
            WHERE a2.deleted_at IS NULL
              AND UPPER(TRIM(a2.codigo_auditoria)) = v_candidate
        );
        v_next_seq := v_next_seq + 1;
    END LOOP;

    RETURN v_candidate;
END;
$$;

REVOKE ALL ON FUNCTION public.is_approved_staff() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_approved_staff() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_approved_staff() TO authenticated;

REVOKE ALL ON FUNCTION public.fn_next_programa_auditoria_codigo(INTEGER) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_next_programa_auditoria_codigo(INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_next_programa_auditoria_codigo(INTEGER) TO authenticated;

REVOKE ALL ON FUNCTION public.fn_next_auditoria_codigo(INTEGER, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_next_auditoria_codigo(INTEGER, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_next_auditoria_codigo(INTEGER, TEXT) TO authenticated;

-- Step 5.1: Validación y Guardia de Sitios Temporales (auditoria_sitio_temporal / auditoria_sitio_temporal_certificado)
DROP TRIGGER IF EXISTS trg_validar_toggle_sitio_temporal_auditoria ON public.auditoria;
DROP FUNCTION IF EXISTS public.fn_validar_toggle_sitio_temporal_auditoria();

-- Trigger 1: Validar que auditoría ancla tiene_sitio_temporal = TRUE y está activa
CREATE OR REPLACE FUNCTION public.fn_validar_sitio_temporal_auditoria()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_tiene_temporal BOOLEAN;
    v_aud_deleted TIMESTAMPTZ;
BEGIN
    IF NEW.deleted_at IS NOT NULL THEN
        RETURN NEW;
    END IF;

    IF TRIM(COALESCE(NEW.etiqueta, '')) = '' THEN
        NEW.etiqueta := 'Sitio Temporal';
    END IF;

    SELECT a.tiene_sitio_temporal, a.deleted_at
      INTO v_tiene_temporal, v_aud_deleted
    FROM public.auditoria a
    WHERE a.id = NEW.id_auditoria;

    IF NOT FOUND OR v_aud_deleted IS NOT NULL THEN
        RAISE EXCEPTION 'Operación bloqueada: la auditoría asociada al sitio temporal no existe o está archivada.'
            USING ERRCODE = 'P0001';
    END IF;

    IF v_tiene_temporal IS NOT TRUE THEN
        RAISE EXCEPTION 'Compuerta Paso 4/5: Active "Sitio Temporal" en la auditoría antes de registrar sitios temporales.'
            USING ERRCODE = 'P0001';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validar_sitio_temporal_auditoria ON public.auditoria_sitio_temporal;
CREATE TRIGGER trg_validar_sitio_temporal_auditoria
    BEFORE INSERT OR UPDATE OF id_auditoria, etiqueta, deleted_at ON public.auditoria_sitio_temporal
    FOR EACH ROW EXECUTE FUNCTION public.fn_validar_sitio_temporal_auditoria();

-- Trigger 2: Validar mismo programa_auditoria al asociar certificados al sitio temporal
CREATE OR REPLACE FUNCTION public.fn_validar_sitio_temporal_certificado()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_prog_anchor UUID;
    v_temp_deleted TIMESTAMPTZ;
    v_anchor_deleted TIMESTAMPTZ;
    v_prog_target UUID;
    v_aud_deleted TIMESTAMPTZ;
BEGIN
    IF NEW.deleted_at IS NOT NULL THEN
        RETURN NEW;
    END IF;

    SELECT a.id_programa_auditoria, st.deleted_at, a.deleted_at
      INTO v_prog_anchor, v_temp_deleted, v_anchor_deleted
    FROM public.auditoria_sitio_temporal st
    JOIN public.auditoria a ON a.id = st.id_auditoria
    WHERE st.id = NEW.id_sitio_temporal;

    IF v_prog_anchor IS NULL OR v_temp_deleted IS NOT NULL OR v_anchor_deleted IS NOT NULL THEN
        RAISE EXCEPTION 'Operación bloqueada: el sitio temporal no existe o está archivado.'
            USING ERRCODE = 'P0001';
    END IF;

    SELECT a.id_programa_auditoria, a.deleted_at
      INTO v_prog_target, v_aud_deleted
    FROM public.auditoria a
    WHERE a.id = NEW.id_auditoria_certificado;

    IF v_prog_target IS NULL OR v_aud_deleted IS NOT NULL THEN
        RAISE EXCEPTION 'Operación bloqueada: el certificado de auditoría asociado no existe o está archivado.'
            USING ERRCODE = 'P0001';
    END IF;

    IF v_prog_anchor IS DISTINCT FROM v_prog_target THEN
        RAISE EXCEPTION 'Violación de Vínculo: solo se pueden asociar certificados pertenecientes a la misma campaña de auditoría.'
            USING ERRCODE = 'P0001';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validar_sitio_temporal_certificado ON public.auditoria_sitio_temporal_certificado;
CREATE TRIGGER trg_validar_sitio_temporal_certificado
    BEFORE INSERT OR UPDATE OF id_sitio_temporal, id_auditoria_certificado, deleted_at ON public.auditoria_sitio_temporal_certificado
    FOR EACH ROW EXECUTE FUNCTION public.fn_validar_sitio_temporal_certificado();

-- Trigger 3: Guardia al apagar tiene_sitio_temporal en auditoría
CREATE OR REPLACE FUNCTION public.fn_guard_apagar_temporal_auditoria()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NEW.deleted_at IS NOT NULL THEN
        RETURN NEW;
    END IF;

    IF OLD.tiene_sitio_temporal = TRUE AND NEW.tiene_sitio_temporal = FALSE THEN
        IF EXISTS (
            SELECT 1 FROM public.auditoria_sitio_temporal st
            WHERE st.id_auditoria = NEW.id
              AND st.deleted_at IS NULL
        ) OR EXISTS (
            SELECT 1 FROM public.auditoria_sitio_temporal_certificado stc
            JOIN public.auditoria_sitio_temporal st ON st.id = stc.id_sitio_temporal
            WHERE stc.id_auditoria_certificado = NEW.id
              AND stc.deleted_at IS NULL
              AND st.deleted_at IS NULL
        ) THEN
            RAISE EXCEPTION 'No se puede desactivar Sitio Temporal: existen sitios temporales activos asociados. Archívelos en Paso 5 (Temporal).'
                USING ERRCODE = 'P0001';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_apagar_temporal_auditoria ON public.auditoria;
CREATE TRIGGER trg_guard_apagar_temporal_auditoria
    BEFORE UPDATE OF tiene_sitio_temporal, deleted_at ON public.auditoria
    FOR EACH ROW EXECUTE FUNCTION public.fn_guard_apagar_temporal_auditoria();

CREATE OR REPLACE FUNCTION public.fn_validar_cambio_nivel_programa()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_active_count INTEGER;
    v_distinct_orgs INTEGER;
BEGIN
    IF NEW.deleted_at IS NOT NULL THEN
        RETURN NEW;
    END IF;

    IF NEW.nivel_vinculacion IS NOT DISTINCT FROM OLD.nivel_vinculacion THEN
        RETURN NEW;
    END IF;

    SELECT COUNT(*)::INTEGER, COUNT(DISTINCT c.id_organizacion)::INTEGER
      INTO v_active_count, v_distinct_orgs
    FROM public.auditoria a
    JOIN public.certificado c ON c.id = a.id_certificado
    WHERE a.id_programa_auditoria = NEW.id
      AND a.deleted_at IS NULL;

    IF NEW.nivel_vinculacion = 'INDIVIDUAL' AND v_active_count > 1 THEN
        RAISE EXCEPTION 'Violación de Vinculación Individual: no se puede cambiar a INDIVIDUAL porque existen % auditorías activas vinculadas.',
            v_active_count
            USING ERRCODE = 'P0001';
    END IF;

    IF NEW.nivel_vinculacion = 'NIVEL_1_INTRA_ORG' AND v_distinct_orgs > 1 THEN
        RAISE EXCEPTION 'Violación de Vinculación Nivel 1: no se puede cambiar a NIVEL_1_INTRA_ORG porque existen certificados de % organizaciones distintas.',
            v_distinct_orgs
            USING ERRCODE = 'P0001';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validar_cambio_nivel_programa ON public.programa_auditoria;
CREATE TRIGGER trg_validar_cambio_nivel_programa
    BEFORE UPDATE OF nivel_vinculacion ON public.programa_auditoria
    FOR EACH ROW EXECUTE FUNCTION public.fn_validar_cambio_nivel_programa();

CREATE OR REPLACE FUNCTION public.fn_validar_auditoria_fecha_secuencia()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_aud_deleted TIMESTAMPTZ;
    v_has_plan BOOLEAN;
BEGIN
    IF NEW.deleted_at IS NOT NULL THEN
        RETURN NEW;
    END IF;

    IF NEW.numero_secuencia IS NULL OR NEW.numero_secuencia < 1 THEN
        RAISE EXCEPTION 'Violación de Secuencia Multi-Fecha: numero_secuencia debe ser mayor o igual a 1.'
            USING ERRCODE = 'P0001';
    END IF;

    SELECT a.deleted_at INTO v_aud_deleted
    FROM public.auditoria a
    WHERE a.id = NEW.id_auditoria;

    IF NOT FOUND OR v_aud_deleted IS NOT NULL THEN
        RAISE EXCEPTION 'Operación bloqueada: la auditoría no existe o está archivada.'
            USING ERRCODE = 'P0001';
    END IF;

    IF NEW.tipo_fecha = 'REAL' THEN
        SELECT EXISTS (
            SELECT 1 FROM public.sitios_por_auditoria sa
            WHERE sa.id_auditoria = NEW.id_auditoria AND sa.deleted_at IS NULL
        ) INTO v_has_plan;

        IF NOT v_has_plan THEN
            RAISE EXCEPTION 'No se pueden registrar fechas REALES de ejecución sin haber designado al menos un sitio en Paso 4 (Sitio).'
                USING ERRCODE = 'P0001';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validar_auditoria_fecha_secuencia ON public.auditoria_fecha;
CREATE TRIGGER trg_validar_auditoria_fecha_secuencia
    BEFORE INSERT OR UPDATE OF id_auditoria, numero_secuencia, tipo_fecha, deleted_at ON public.auditoria_fecha
    FOR EACH ROW EXECUTE FUNCTION public.fn_validar_auditoria_fecha_secuencia();

-- Triggers de Integridad Subconjunto ISO/IEC 17021-1 (Version-Aware)
CREATE OR REPLACE FUNCTION public.fn_default_procesos_por_sitio_certificado()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_cert_sitio UUID;
    v_cert_ver_sitio UUID;
BEGIN
    IF NEW.id_sitio IS NOT NULL THEN
        IF NEW.id_certificado IS NULL AND NEW.id_certificado_version IS NULL THEN
            SELECT s.id_certificado, s.id_certificado_version
              INTO v_cert_sitio, v_cert_ver_sitio
            FROM public.sitio s
            WHERE s.id = NEW.id_sitio;

            NEW.id_certificado := v_cert_sitio;
            NEW.id_certificado_version := v_cert_ver_sitio;
        ELSIF NEW.id_certificado IS NOT NULL AND NEW.id_certificado_version IS NULL THEN
            SELECT s.id_certificado, s.id_certificado_version
              INTO v_cert_sitio, v_cert_ver_sitio
            FROM public.sitio s
            WHERE s.id = NEW.id_sitio;

            IF v_cert_sitio = NEW.id_certificado AND v_cert_ver_sitio IS NOT NULL THEN
                NEW.id_certificado_version := v_cert_ver_sitio;
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_01_default_procesos_por_sitio_certificado ON public.procesos_por_sitio;
CREATE TRIGGER trg_01_default_procesos_por_sitio_certificado
    BEFORE INSERT ON public.procesos_por_sitio
    FOR EACH ROW EXECUTE FUNCTION public.fn_default_procesos_por_sitio_certificado();

CREATE OR REPLACE FUNCTION public.fn_validar_proceso_por_sitio_certificado()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_cert_deleted TIMESTAMPTZ;
    v_cv_deleted TIMESTAMPTZ;
    v_sitio_deleted TIMESTAMPTZ;
    v_proceso_deleted TIMESTAMPTZ;
BEGIN
    IF NEW.deleted_at IS NOT NULL THEN
        RETURN NEW;
    END IF;

    IF NEW.id_certificado IS NULL OR NEW.id_certificado_version IS NULL THEN
        RAISE EXCEPTION 'Operación bloqueada: debe indicar el certificado y su versión de alcance al vincular un proceso con un sitio.'
            USING ERRCODE = 'P0001';
    END IF;

    SELECT c.deleted_at INTO v_cert_deleted
    FROM public.certificado c
    WHERE c.id = NEW.id_certificado;

    IF NOT FOUND OR v_cert_deleted IS NOT NULL THEN
        RAISE EXCEPTION 'Violación de Integridad ISO/IEC 17021-1: El certificado de alcance no existe o está archivado.'
            USING ERRCODE = 'P0001';
    END IF;

    SELECT cv.deleted_at INTO v_cv_deleted
    FROM public.certificado_version cv
    WHERE cv.id = NEW.id_certificado_version
      AND cv.id_certificado = NEW.id_certificado;

    IF NOT FOUND OR v_cv_deleted IS NOT NULL THEN
        RAISE EXCEPTION 'Violación de Integridad ISO/IEC 17021-1: La versión del certificado no existe, no corresponde al certificado o está archivada.'
            USING ERRCODE = 'P0001';
    END IF;

    SELECT s.deleted_at INTO v_sitio_deleted
    FROM public.sitio s
    WHERE s.id = NEW.id_sitio;

    IF NOT FOUND OR v_sitio_deleted IS NOT NULL THEN
        RAISE EXCEPTION 'Violación de Integridad ISO/IEC 17021-1: El sitio seleccionado no existe o está archivado.'
            USING ERRCODE = 'P0001';
    END IF;

    SELECT p.deleted_at INTO v_proceso_deleted
    FROM public.proceso p
    WHERE p.id = NEW.id_proceso;

    IF NOT FOUND OR v_proceso_deleted IS NOT NULL THEN
        RAISE EXCEPTION 'Violación de Integridad ISO/IEC 17021-1: El proceso seleccionado no existe o está archivado.'
            USING ERRCODE = 'P0001';
    END IF;

    IF NOT public.sitio_pertenece_a_certificado_version(NEW.id_sitio, NEW.id_certificado_version) THEN
        RAISE EXCEPTION 'Violación de Integridad ISO/IEC 17021-1: El sitio seleccionado no pertenece ni está compartido con la versión del certificado indicada.'
            USING ERRCODE = 'P0001';
    END IF;

    IF NOT public.proceso_pertenece_a_certificado_version(NEW.id_proceso, NEW.id_certificado_version) THEN
        RAISE EXCEPTION 'Violación de Integridad ISO/IEC 17021-1: El proceso seleccionado no pertenece ni está compartido con la versión del certificado indicada.'
            USING ERRCODE = 'P0001';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validar_proceso_por_sitio_certificado ON public.procesos_por_sitio;
CREATE TRIGGER trg_validar_proceso_por_sitio_certificado
    BEFORE INSERT OR UPDATE OF id_certificado, id_certificado_version, id_sitio, id_proceso, deleted_at ON public.procesos_por_sitio
    FOR EACH ROW EXECUTE FUNCTION public.fn_validar_proceso_por_sitio_certificado();

CREATE OR REPLACE FUNCTION public.fn_validar_sitio_auditoria_certificado()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_cert_auditoria UUID;
    v_cert_ver_auditoria UUID;
    v_aud_deleted TIMESTAMPTZ;
    v_sitio_deleted TIMESTAMPTZ;
BEGIN
    IF NEW.deleted_at IS NOT NULL THEN
        RETURN NEW;
    END IF;

    SELECT id_certificado, id_certificado_version, deleted_at
      INTO v_cert_auditoria, v_cert_ver_auditoria, v_aud_deleted
    FROM public.auditoria
    WHERE id = NEW.id_auditoria;

    SELECT deleted_at
      INTO v_sitio_deleted
    FROM public.sitio
    WHERE id = NEW.id_sitio;

    IF v_cert_auditoria IS NULL OR v_cert_ver_auditoria IS NULL OR v_aud_deleted IS NOT NULL THEN
        RAISE EXCEPTION 'Operación bloqueada: la auditoría no existe o está archivada.'
            USING ERRCODE = 'P0001';
    END IF;

    IF NOT FOUND OR v_sitio_deleted IS NOT NULL THEN
        RAISE EXCEPTION 'Operación bloqueada: el sitio maestro no existe o está archivado.'
            USING ERRCODE = 'P0001';
    END IF;

    IF NOT public.sitio_pertenece_a_certificado_version(NEW.id_sitio, v_cert_ver_auditoria) THEN
        RAISE EXCEPTION 'Violación ISO/IEC 17021-1: el sitio seleccionado no pertenece ni está compartido con la versión del certificado de la auditoría.'
            USING ERRCODE = 'P0001';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validar_sitio_auditoria_certificado ON public.sitios_por_auditoria;
CREATE TRIGGER trg_validar_sitio_auditoria_certificado
    BEFORE INSERT OR UPDATE ON public.sitios_por_auditoria
    FOR EACH ROW EXECUTE FUNCTION public.fn_validar_sitio_auditoria_certificado();

-- Trigger: Mantener auditoria.tiempo_auditoria sincronizado con la suma de sitios_por_auditoria activos
CREATE OR REPLACE FUNCTION public.fn_recalcular_tiempo_auditoria_desde_sitios()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_aud_id UUID;
    v_sum NUMERIC(6,2);
BEGIN
    v_aud_id := COALESCE(NEW.id_auditoria, OLD.id_auditoria);
    IF v_aud_id IS NULL THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    SELECT COALESCE(SUM(sa.tiempo_auditoria), 0)::NUMERIC(6,2)
      INTO v_sum
    FROM public.sitios_por_auditoria sa
    WHERE sa.id_auditoria = v_aud_id
      AND sa.deleted_at IS NULL;

    UPDATE public.auditoria
    SET tiempo_auditoria = v_sum,
        updated_at = NOW()
    WHERE id = v_aud_id
      AND tiempo_auditoria IS DISTINCT FROM v_sum;

    RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_recalcular_tiempo_auditoria_desde_sitios ON public.sitios_por_auditoria;
CREATE TRIGGER trg_recalcular_tiempo_auditoria_desde_sitios
    AFTER INSERT OR UPDATE OF tiempo_auditoria, deleted_at ON public.sitios_por_auditoria
    FOR EACH ROW EXECUTE FUNCTION public.fn_recalcular_tiempo_auditoria_desde_sitios();

CREATE OR REPLACE FUNCTION public.fn_validar_turno_sitio_auditoria()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_sitio_aud UUID;
    v_sa_deleted TIMESTAMPTZ;
    v_sitio_turno UUID;
    v_tps_deleted TIMESTAMPTZ;
BEGIN
    IF NEW.deleted_at IS NOT NULL THEN
        RETURN NEW;
    END IF;

    SELECT id_sitio, deleted_at INTO v_sitio_aud, v_sa_deleted
    FROM public.sitios_por_auditoria
    WHERE id = NEW.id_sitios_por_auditoria;

    SELECT id_sitio, deleted_at INTO v_sitio_turno, v_tps_deleted
    FROM public.turnos_por_sitio
    WHERE id = NEW.id_turnos_por_sitio;

    IF v_sitio_aud IS NULL OR v_sa_deleted IS NOT NULL THEN
        RAISE EXCEPTION 'Violación de Integridad ISO/IEC 17021-1: El sitio de auditoría seleccionado no existe o está archivado.'
            USING ERRCODE = 'P0001';
    END IF;

    IF v_sitio_turno IS NULL OR v_tps_deleted IS NOT NULL THEN
        RAISE EXCEPTION 'Violación de Integridad ISO/IEC 17021-1: El turno por sitio seleccionado no existe o está archivado.'
            USING ERRCODE = 'P0001';
    END IF;

    IF v_sitio_aud IS DISTINCT FROM v_sitio_turno THEN
        RAISE EXCEPTION 'Violación de Integridad ISO/IEC 17021-1: El turno por sitio corresponde a un sitio distinto al sitio de la auditoría.'
            USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validar_turno_sitio_auditoria ON public.turnos_sitio_auditoria;
CREATE TRIGGER trg_validar_turno_sitio_auditoria
    BEFORE INSERT OR UPDATE ON public.turnos_sitio_auditoria
    FOR EACH ROW EXECUTE FUNCTION public.fn_validar_turno_sitio_auditoria();

CREATE OR REPLACE FUNCTION public.fn_validar_proceso_sitio_auditoria_certificado()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_sitio_sa UUID;
    v_cert_auditoria UUID;
    v_cert_ver_auditoria UUID;
    v_sa_deleted TIMESTAMPTZ;
    v_aud_deleted TIMESTAMPTZ;
    v_cert_pps UUID;
    v_cert_ver_pps UUID;
    v_sitio_pps UUID;
    v_proceso_del_sitio UUID;
    v_pps_deleted TIMESTAMPTZ;
    v_proc_deleted TIMESTAMPTZ;
BEGIN
    IF NEW.deleted_at IS NOT NULL THEN
        RETURN NEW;
    END IF;

    SELECT sa.id_sitio, a.id_certificado, a.id_certificado_version, sa.deleted_at, a.deleted_at
      INTO v_sitio_sa, v_cert_auditoria, v_cert_ver_auditoria, v_sa_deleted, v_aud_deleted
    FROM public.sitios_por_auditoria sa
    JOIN public.auditoria a ON a.id = sa.id_auditoria
    WHERE sa.id = NEW.id_sitios_por_auditoria;

    IF NOT FOUND OR v_sa_deleted IS NOT NULL OR v_aud_deleted IS NOT NULL THEN
        RAISE EXCEPTION 'Violación de Integridad ISO/IEC 17021-1: El sitio de auditoría o su auditoría no existe o está archivado.'
            USING ERRCODE = 'P0001';
    END IF;

    SELECT pps.id_certificado, pps.id_certificado_version, pps.id_sitio, pps.id_proceso, pps.deleted_at, p.deleted_at
      INTO v_cert_pps, v_cert_ver_pps, v_sitio_pps, v_proceso_del_sitio, v_pps_deleted, v_proc_deleted
    FROM public.procesos_por_sitio pps
    JOIN public.proceso p ON p.id = pps.id_proceso
    WHERE pps.id = NEW.id_procesos_por_sitio;

    IF NOT FOUND OR v_pps_deleted IS NOT NULL OR v_proc_deleted IS NOT NULL THEN
        RAISE EXCEPTION 'Violación de Integridad ISO/IEC 17021-1: La asignación proceso-sitio o su proceso no existe o está archivado.'
            USING ERRCODE = 'P0001';
    END IF;

    IF v_sitio_pps IS DISTINCT FROM v_sitio_sa THEN
        RAISE EXCEPTION 'Violación de Integridad ISO/IEC 17021-1: El proceso por sitio corresponde a un sitio distinto al de la auditoría.'
            USING ERRCODE = 'P0001';
    END IF;

    IF v_cert_pps IS DISTINCT FROM v_cert_auditoria OR v_cert_ver_pps IS DISTINCT FROM v_cert_ver_auditoria THEN
        RAISE EXCEPTION 'Violación de Integridad ISO/IEC 17021-1: La asignación proceso-sitio pertenece a una versión de certificado distinta a la de la auditoría.'
            USING ERRCODE = 'P0001';
    END IF;

    IF NOT public.proceso_pertenece_a_certificado_version(v_proceso_del_sitio, v_cert_ver_auditoria) THEN
        RAISE EXCEPTION 'Violación de Integridad ISO/IEC 17021-1: El proceso no pertenece ni está compartido con la versión del certificado de la auditoría.'
            USING ERRCODE = 'P0001';
    END IF;

    NEW.id_proceso := v_proceso_del_sitio;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validar_proceso_sitio_auditoria_certificado ON public.procesos_sitio_auditoria;
CREATE TRIGGER trg_validar_proceso_sitio_auditoria_certificado
    BEFORE INSERT OR UPDATE ON public.procesos_sitio_auditoria
    FOR EACH ROW EXECUTE FUNCTION public.fn_validar_proceso_sitio_auditoria_certificado();

CREATE OR REPLACE FUNCTION public.fn_validar_turno_proceso_sitio_auditoria()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_psa_sitio_aud UUID;
    v_psa_deleted TIMESTAMPTZ;
    v_tsa_sitio_aud UUID;
    v_tsa_deleted TIMESTAMPTZ;
BEGIN
    IF NEW.deleted_at IS NOT NULL THEN
        RETURN NEW;
    END IF;

    SELECT psa.id_sitios_por_auditoria, psa.deleted_at
      INTO v_psa_sitio_aud, v_psa_deleted
    FROM public.procesos_sitio_auditoria psa
    WHERE psa.id = NEW.id_procesos_sitio_auditoria;

    IF NOT FOUND OR v_psa_deleted IS NOT NULL THEN
        RAISE EXCEPTION 'Violación de Integridad ISO/IEC 17021-1: El proceso en sitio de auditoría % no existe o está archivado.',
            NEW.id_procesos_sitio_auditoria
            USING ERRCODE = 'P0001';
    END IF;

    SELECT tsa.id_sitios_por_auditoria, tsa.deleted_at
      INTO v_tsa_sitio_aud, v_tsa_deleted
    FROM public.turnos_sitio_auditoria tsa
    WHERE tsa.id = NEW.id_turnos_sitio_auditoria;

    IF NOT FOUND OR v_tsa_deleted IS NOT NULL THEN
        RAISE EXCEPTION 'Violación de Integridad ISO/IEC 17021-1: El turno en sitio de auditoría % no existe o está archivado.',
            NEW.id_turnos_sitio_auditoria
            USING ERRCODE = 'P0001';
    END IF;

    IF v_psa_sitio_aud IS DISTINCT FROM v_tsa_sitio_aud THEN
        RAISE EXCEPTION 'Violación de Integridad ISO/IEC 17021-1: El turno % pertenece al sitio de auditoría %, distinto al sitio de auditoría % del proceso.',
            NEW.id_turnos_sitio_auditoria, v_tsa_sitio_aud, v_psa_sitio_aud
            USING ERRCODE = 'P0001';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validar_turno_proceso_sitio_auditoria ON public.turnos_proceso_sitio_auditoria;
CREATE TRIGGER trg_validar_turno_proceso_sitio_auditoria
    BEFORE INSERT OR UPDATE ON public.turnos_proceso_sitio_auditoria
    FOR EACH ROW EXECUTE FUNCTION public.fn_validar_turno_proceso_sitio_auditoria();

CREATE OR REPLACE FUNCTION public.fn_validar_equipo_auditor_sitio()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_sa_deleted TIMESTAMPTZ;
    v_auditor_deleted TIMESTAMPTZ;
BEGIN
    IF NEW.deleted_at IS NOT NULL THEN
        RETURN NEW;
    END IF;

    SELECT sa.deleted_at INTO v_sa_deleted
    FROM public.sitios_por_auditoria sa
    WHERE sa.id = NEW.id_sitios_por_auditoria;

    IF NOT FOUND OR v_sa_deleted IS NOT NULL THEN
        RAISE EXCEPTION 'Violación de Integridad ISO/IEC 17021-1: El sitio de auditoría % no existe o está archivado.',
            NEW.id_sitios_por_auditoria
            USING ERRCODE = 'P0001';
    END IF;

    SELECT a.deleted_at INTO v_auditor_deleted
    FROM public.auditor a
    WHERE a.id = NEW.id_auditor;

    IF NOT FOUND OR v_auditor_deleted IS NOT NULL THEN
        RAISE EXCEPTION 'Violación de Integridad ISO/IEC 17021-1: El auditor % no existe o está archivado.',
            NEW.id_auditor
            USING ERRCODE = 'P0001';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validar_equipo_auditor_sitio ON public.equipo_auditor_sitio;
CREATE TRIGGER trg_validar_equipo_auditor_sitio
    BEFORE INSERT OR UPDATE ON public.equipo_auditor_sitio
    FOR EACH ROW EXECUTE FUNCTION public.fn_validar_equipo_auditor_sitio();

CREATE OR REPLACE FUNCTION public.fn_validar_equipo_auditor_proceso_sitio()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_psa_deleted TIMESTAMPTZ;
    v_auditor_deleted TIMESTAMPTZ;
BEGIN
    IF NEW.deleted_at IS NOT NULL THEN
        RETURN NEW;
    END IF;

    SELECT psa.deleted_at INTO v_psa_deleted
    FROM public.procesos_sitio_auditoria psa
    WHERE psa.id = NEW.id_procesos_sitio_auditoria;

    IF NOT FOUND OR v_psa_deleted IS NOT NULL THEN
        RAISE EXCEPTION 'Violación de Integridad ISO/IEC 17021-1: El proceso en sitio de auditoría % no existe o está archivado.',
            NEW.id_procesos_sitio_auditoria
            USING ERRCODE = 'P0001';
    END IF;

    SELECT a.deleted_at INTO v_auditor_deleted
    FROM public.auditor a
    WHERE a.id = NEW.id_auditor;

    IF NOT FOUND OR v_auditor_deleted IS NOT NULL THEN
        RAISE EXCEPTION 'Violación de Integridad ISO/IEC 17021-1: El auditor % no existe o está archivado.',
            NEW.id_auditor
            USING ERRCODE = 'P0001';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validar_equipo_auditor_proceso_sitio ON public.equipo_auditor_proceso_sitio;
CREATE TRIGGER trg_validar_equipo_auditor_proceso_sitio
    BEFORE INSERT OR UPDATE ON public.equipo_auditor_proceso_sitio
    FOR EACH ROW EXECUTE FUNCTION public.fn_validar_equipo_auditor_proceso_sitio();

CREATE OR REPLACE FUNCTION public.fn_validar_equipo_auditor_sitio_temporal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_temp_deleted TIMESTAMPTZ;
    v_auditor_deleted TIMESTAMPTZ;
BEGIN
    IF NEW.deleted_at IS NOT NULL THEN
        RETURN NEW;
    END IF;

    SELECT st.deleted_at INTO v_temp_deleted
    FROM public.auditoria_sitio_temporal st
    WHERE st.id = NEW.id_sitio_temporal;

    IF NOT FOUND OR v_temp_deleted IS NOT NULL THEN
        RAISE EXCEPTION 'Operación bloqueada: el sitio temporal está archivado o no existe.'
            USING ERRCODE = 'P0001';
    END IF;

    SELECT a.deleted_at INTO v_auditor_deleted
    FROM public.auditor a
    WHERE a.id = NEW.id_auditor;

    IF NOT FOUND OR v_auditor_deleted IS NOT NULL THEN
        RAISE EXCEPTION 'Operación bloqueada: el auditor seleccionado está archivado o no existe.'
            USING ERRCODE = 'P0001';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validar_equipo_auditor_sitio_temporal ON public.equipo_auditor_sitio_temporal;
CREATE TRIGGER trg_validar_equipo_auditor_sitio_temporal
    BEFORE INSERT OR UPDATE ON public.equipo_auditor_sitio_temporal
    FOR EACH ROW EXECUTE FUNCTION public.fn_validar_equipo_auditor_sitio_temporal();

-- Reconciliación consolidada hacia public.equipo_auditor (sitios regulares + sitios temporales + procesos)
CREATE OR REPLACE FUNCTION public.fn_sync_equipo_auditor_completo(p_id_auditoria UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF p_id_auditoria IS NULL THEN
        RETURN;
    END IF;

    DELETE FROM public.equipo_auditor WHERE id_auditoria = p_id_auditoria;

    INSERT INTO public.equipo_auditor (id_auditoria, id_auditor, rol_auditor)
    SELECT p_id_auditoria, sub.id_auditor,
           CASE MIN(sub.prio)
               WHEN 1 THEN 'AUDITOR_LIDER'
               WHEN 2 THEN 'AUDITOR'
               WHEN 3 THEN 'EXPERTO_TECNICO'
               ELSE 'AUDITOR_EN_ENTRENAMIENTO'
           END
    FROM (
        SELECT eas.id_auditor,
               CASE eas.rol_auditor
                   WHEN 'AUDITOR_LIDER' THEN 1
                   WHEN 'AUDITOR' THEN 2
                   WHEN 'EXPERTO_TECNICO' THEN 3
                   ELSE 4
               END AS prio
        FROM public.equipo_auditor_sitio eas
        JOIN public.sitios_por_auditoria sa ON sa.id = eas.id_sitios_por_auditoria
        WHERE sa.id_auditoria = p_id_auditoria AND sa.deleted_at IS NULL AND eas.deleted_at IS NULL
        UNION ALL
        SELECT east.id_auditor,
               CASE east.rol_auditor
                   WHEN 'AUDITOR_LIDER' THEN 1
                   WHEN 'AUDITOR' THEN 2
                   WHEN 'EXPERTO_TECNICO' THEN 3
                   ELSE 4
               END AS prio
        FROM public.equipo_auditor_sitio_temporal east
        JOIN public.auditoria_sitio_temporal st ON st.id = east.id_sitio_temporal
        LEFT JOIN public.auditoria_sitio_temporal_certificado stc
               ON stc.id_sitio_temporal = st.id AND stc.deleted_at IS NULL
        WHERE st.deleted_at IS NULL
          AND east.deleted_at IS NULL
          AND (st.id_auditoria = p_id_auditoria OR stc.id_auditoria_certificado = p_id_auditoria)
        UNION ALL
        SELECT eaps.id_auditor,
               CASE eaps.rol_en_proceso
                   WHEN 'APOYO_TECNICO' THEN 3
                   ELSE 2
               END AS prio
        FROM public.equipo_auditor_proceso_sitio eaps
        JOIN public.procesos_sitio_auditoria psa ON psa.id = eaps.id_procesos_sitio_auditoria
        JOIN public.sitios_por_auditoria sa ON sa.id = psa.id_sitios_por_auditoria
        WHERE sa.id_auditoria = p_id_auditoria
          AND sa.deleted_at IS NULL
          AND psa.deleted_at IS NULL
          AND eaps.deleted_at IS NULL
    ) sub
    GROUP BY sub.id_auditor;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_sync_equipo_auditor_desde_sitio()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_id_auditoria UUID;
    v_old_id_auditoria UUID;
BEGIN
    SELECT sa.id_auditoria INTO v_id_auditoria
    FROM public.sitios_por_auditoria sa
    WHERE sa.id = NEW.id_sitios_por_auditoria;

    IF v_id_auditoria IS NOT NULL THEN
        PERFORM public.fn_sync_equipo_auditor_completo(v_id_auditoria);
    END IF;

    IF TG_OP = 'UPDATE' AND OLD.id_sitios_por_auditoria IS DISTINCT FROM NEW.id_sitios_por_auditoria THEN
        SELECT sa.id_auditoria INTO v_old_id_auditoria
        FROM public.sitios_por_auditoria sa
        WHERE sa.id = OLD.id_sitios_por_auditoria;

        IF v_old_id_auditoria IS NOT NULL AND v_old_id_auditoria IS DISTINCT FROM v_id_auditoria THEN
            PERFORM public.fn_sync_equipo_auditor_completo(v_old_id_auditoria);
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_equipo_auditor_desde_sitio ON public.equipo_auditor_sitio;
CREATE TRIGGER trg_sync_equipo_auditor_desde_sitio
    AFTER INSERT OR UPDATE OF id_sitios_por_auditoria, id_auditor, rol_auditor, deleted_at ON public.equipo_auditor_sitio
    FOR EACH ROW EXECUTE FUNCTION public.fn_sync_equipo_auditor_desde_sitio();

CREATE OR REPLACE FUNCTION public.fn_sync_equipo_auditor_desde_sitio_temporal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_aud_id UUID;
BEGIN
    FOR v_aud_id IN
        SELECT DISTINCT aud_id
        FROM (
            SELECT st.id_auditoria AS aud_id
            FROM public.auditoria_sitio_temporal st
            WHERE st.id IN (NEW.id_sitio_temporal, COALESCE(OLD.id_sitio_temporal, NEW.id_sitio_temporal))
            UNION
            SELECT stc.id_auditoria_certificado AS aud_id
            FROM public.auditoria_sitio_temporal_certificado stc
            WHERE stc.id_sitio_temporal IN (NEW.id_sitio_temporal, COALESCE(OLD.id_sitio_temporal, NEW.id_sitio_temporal))
              AND stc.deleted_at IS NULL
        ) affected
        WHERE aud_id IS NOT NULL
    LOOP
        PERFORM public.fn_sync_equipo_auditor_completo(v_aud_id);
    END LOOP;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_equipo_auditor_desde_sitio_temporal ON public.equipo_auditor_sitio_temporal;
CREATE TRIGGER trg_sync_equipo_auditor_desde_sitio_temporal
    AFTER INSERT OR UPDATE OF id_sitio_temporal, id_auditor, rol_auditor, deleted_at ON public.equipo_auditor_sitio_temporal
    FOR EACH ROW EXECUTE FUNCTION public.fn_sync_equipo_auditor_desde_sitio_temporal();

CREATE OR REPLACE FUNCTION public.fn_sync_equipo_auditor_desde_proceso()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_id_auditoria UUID;
BEGIN
    SELECT sa.id_auditoria INTO v_id_auditoria
    FROM public.procesos_sitio_auditoria psa
    JOIN public.sitios_por_auditoria sa ON sa.id = psa.id_sitios_por_auditoria
    WHERE psa.id = NEW.id_procesos_sitio_auditoria;

    IF v_id_auditoria IS NOT NULL THEN
        PERFORM public.fn_sync_equipo_auditor_completo(v_id_auditoria);
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_equipo_auditor_desde_proceso ON public.equipo_auditor_proceso_sitio;
CREATE TRIGGER trg_sync_equipo_auditor_desde_proceso
    AFTER INSERT OR UPDATE OF id_procesos_sitio_auditoria, id_auditor, rol_en_proceso, deleted_at ON public.equipo_auditor_proceso_sitio
    FOR EACH ROW EXECUTE FUNCTION public.fn_sync_equipo_auditor_desde_proceso();

-- Sistema de Audit Log Inmutable
CREATE TABLE IF NOT EXISTS public.audit_log (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    table_name TEXT NOT NULL,
    operation TEXT NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
    record_id UUID NOT NULL,
    old_data JSONB,
    new_data JSONB,
    performed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    performed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Garantía de inmutabilidad en capa de datos (bloqueo de UPDATE/DELETE)
CREATE OR REPLACE FUNCTION public.prevent_audit_log_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RAISE EXCEPTION 'Violación de Inmutabilidad: no se permiten operaciones % sobre public.audit_log.', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_log_immutable ON public.audit_log;
CREATE TRIGGER trg_audit_log_immutable
    BEFORE UPDATE OR DELETE ON public.audit_log
    FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_log_mutation();

CREATE OR REPLACE FUNCTION public.audit_trigger_func()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    current_user_id UUID;
    target_record_id UUID;
BEGIN
    current_user_id := auth.uid();
    IF (TG_OP = 'DELETE') THEN
        target_record_id := OLD.id;
        INSERT INTO public.audit_log (table_name, operation, record_id, old_data, performed_by)
        VALUES (TG_TABLE_NAME, TG_OP, target_record_id, to_jsonb(OLD), current_user_id);
        RETURN OLD;
    ELSIF (TG_OP = 'UPDATE') THEN
        target_record_id := NEW.id;
        INSERT INTO public.audit_log (table_name, operation, record_id, old_data, new_data, performed_by)
        VALUES (TG_TABLE_NAME, TG_OP, target_record_id, to_jsonb(OLD), to_jsonb(NEW), current_user_id);
        RETURN NEW;
    ELSIF (TG_OP = 'INSERT') THEN
        target_record_id := NEW.id;
        INSERT INTO public.audit_log (table_name, operation, record_id, new_data, performed_by)
        VALUES (TG_TABLE_NAME, TG_OP, target_record_id, to_jsonb(NEW), current_user_id);
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$;

-- Triggers de Auditoría Inmutable para Entidades Principales y Secundarias
DROP TRIGGER IF EXISTS audit_grupo_empresarial_trigger ON public.grupo_empresarial;
CREATE TRIGGER audit_grupo_empresarial_trigger AFTER INSERT OR UPDATE OR DELETE ON public.grupo_empresarial FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

DROP TRIGGER IF EXISTS audit_vinculo_trigger ON public.vinculo;
CREATE TRIGGER audit_vinculo_trigger AFTER INSERT OR UPDATE OR DELETE ON public.vinculo FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

DROP TRIGGER IF EXISTS audit_organizacion_trigger ON public.organizacion;
CREATE TRIGGER audit_organizacion_trigger AFTER INSERT OR UPDATE OR DELETE ON public.organizacion FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

DROP TRIGGER IF EXISTS audit_certificado_trigger ON public.certificado;
CREATE TRIGGER audit_certificado_trigger AFTER INSERT OR UPDATE OR DELETE ON public.certificado FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

DROP TRIGGER IF EXISTS audit_sitio_trigger ON public.sitio;
CREATE TRIGGER audit_sitio_trigger AFTER INSERT OR UPDATE OR DELETE ON public.sitio FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

DROP TRIGGER IF EXISTS audit_proceso_trigger ON public.proceso;
CREATE TRIGGER audit_proceso_trigger AFTER INSERT OR UPDATE OR DELETE ON public.proceso FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

DROP TRIGGER IF EXISTS audit_turno_trigger ON public.turno;
CREATE TRIGGER audit_turno_trigger AFTER INSERT OR UPDATE OR DELETE ON public.turno FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

DROP TRIGGER IF EXISTS audit_auditoria_trigger ON public.auditoria;
CREATE TRIGGER audit_auditoria_trigger AFTER INSERT OR UPDATE OR DELETE ON public.auditoria FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

DROP TRIGGER IF EXISTS audit_client_access_trigger ON public.client_organization_access;
CREATE TRIGGER audit_client_access_trigger AFTER INSERT OR UPDATE OR DELETE ON public.client_organization_access FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

DROP TRIGGER IF EXISTS audit_subsector_iaf_trigger ON public.subsector_iaf;
CREATE TRIGGER audit_subsector_iaf_trigger AFTER INSERT OR UPDATE OR DELETE ON public.subsector_iaf FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

DROP TRIGGER IF EXISTS audit_organismo_acreditacion_trigger ON public.organismo_acreditacion;
CREATE TRIGGER audit_organismo_acreditacion_trigger AFTER INSERT OR UPDATE OR DELETE ON public.organismo_acreditacion FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

DROP TRIGGER IF EXISTS audit_acreditacion_norma_trigger ON public.acreditacion_norma;
CREATE TRIGGER audit_acreditacion_norma_trigger AFTER INSERT OR UPDATE OR DELETE ON public.acreditacion_norma FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

DROP TRIGGER IF EXISTS audit_req_no_aplicables_trigger ON public.requisitos_no_aplicables_certificado;
CREATE TRIGGER audit_req_no_aplicables_trigger AFTER INSERT OR UPDATE OR DELETE ON public.requisitos_no_aplicables_certificado FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

DROP TRIGGER IF EXISTS audit_norma_trigger ON public.norma;
CREATE TRIGGER audit_norma_trigger AFTER INSERT OR UPDATE OR DELETE ON public.norma FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

DROP TRIGGER IF EXISTS audit_hallazgo_trigger ON public.hallazgo;
CREATE TRIGGER audit_hallazgo_trigger AFTER INSERT OR UPDATE OR DELETE ON public.hallazgo FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

-- Actualización Automática de Timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_profiles_modtime ON public.profiles;
CREATE TRIGGER update_profiles_modtime BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_grupo_empresarial_modtime ON public.grupo_empresarial;
CREATE TRIGGER update_grupo_empresarial_modtime BEFORE UPDATE ON public.grupo_empresarial FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_organizacion_modtime ON public.organizacion;
CREATE TRIGGER update_organizacion_modtime BEFORE UPDATE ON public.organizacion FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_organizacion_version_modtime ON public.organizacion_version;
CREATE TRIGGER update_organizacion_version_modtime BEFORE UPDATE ON public.organizacion_version FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_norma_modtime ON public.norma;
CREATE TRIGGER update_norma_modtime BEFORE UPDATE ON public.norma FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_requisito_modtime ON public.requisito;
CREATE TRIGGER update_requisito_modtime BEFORE UPDATE ON public.requisito FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_requisito_traduccion_modtime ON public.requisito_traduccion;
CREATE TRIGGER update_requisito_traduccion_modtime BEFORE UPDATE ON public.requisito_traduccion FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_sector_iaf_modtime ON public.sector_iaf;
CREATE TRIGGER update_sector_iaf_modtime BEFORE UPDATE ON public.sector_iaf FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_subsector_iaf_modtime ON public.subsector_iaf;
CREATE TRIGGER update_subsector_iaf_modtime BEFORE UPDATE ON public.subsector_iaf FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_organismo_acreditacion_modtime ON public.organismo_acreditacion;
CREATE TRIGGER update_organismo_acreditacion_modtime BEFORE UPDATE ON public.organismo_acreditacion FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_acreditacion_norma_modtime ON public.acreditacion_norma;
CREATE TRIGGER update_acreditacion_norma_modtime BEFORE UPDATE ON public.acreditacion_norma FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_acreditacion_norma_sector_iaf_modtime ON public.acreditacion_norma_sector_iaf;
CREATE TRIGGER update_acreditacion_norma_sector_iaf_modtime BEFORE UPDATE ON public.acreditacion_norma_sector_iaf FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_requisitos_no_aplicables_modtime ON public.requisitos_no_aplicables_certificado;
CREATE TRIGGER update_requisitos_no_aplicables_modtime BEFORE UPDATE ON public.requisitos_no_aplicables_certificado FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_estatus_modtime ON public.estatus;
CREATE TRIGGER update_estatus_modtime BEFORE UPDATE ON public.estatus FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_tipo_auditoria_modtime ON public.tipo_auditoria;
CREATE TRIGGER update_tipo_auditoria_modtime BEFORE UPDATE ON public.tipo_auditoria FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_metodologia_auditoria_modtime ON public.metodologia_auditoria;
CREATE TRIGGER update_metodologia_auditoria_modtime BEFORE UPDATE ON public.metodologia_auditoria FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_auditor_modtime ON public.auditor;
CREATE TRIGGER update_auditor_modtime BEFORE UPDATE ON public.auditor FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_certificado_modtime ON public.certificado;
CREATE TRIGGER update_certificado_modtime BEFORE UPDATE ON public.certificado FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_certificado_version_modtime ON public.certificado_version;
CREATE TRIGGER update_certificado_version_modtime BEFORE UPDATE ON public.certificado_version FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_alcance_modtime ON public.alcance;
CREATE TRIGGER update_alcance_modtime BEFORE UPDATE ON public.alcance FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_alcance_certificado_compartido_modtime ON public.alcance_certificado_compartido;
CREATE TRIGGER update_alcance_certificado_compartido_modtime BEFORE UPDATE ON public.alcance_certificado_compartido FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_sitio_modtime ON public.sitio;
CREATE TRIGGER update_sitio_modtime BEFORE UPDATE ON public.sitio FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_proceso_modtime ON public.proceso;
CREATE TRIGGER update_proceso_modtime BEFORE UPDATE ON public.proceso FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_turno_modtime ON public.turno;
CREATE TRIGGER update_turno_modtime BEFORE UPDATE ON public.turno FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_vinculo_modtime ON public.vinculo;
CREATE TRIGGER update_vinculo_modtime BEFORE UPDATE ON public.vinculo FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_vinculo_certificado_modtime ON public.vinculo_certificado;
CREATE TRIGGER update_vinculo_certificado_modtime BEFORE UPDATE ON public.vinculo_certificado FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_programa_auditoria_modtime ON public.programa_auditoria;
CREATE TRIGGER update_programa_auditoria_modtime BEFORE UPDATE ON public.programa_auditoria FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_auditoria_modtime ON public.auditoria;
CREATE TRIGGER update_auditoria_modtime BEFORE UPDATE ON public.auditoria FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_auditoria_fecha_modtime ON public.auditoria_fecha;
CREATE TRIGGER update_auditoria_fecha_modtime BEFORE UPDATE ON public.auditoria_fecha FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_configuracion_alerta_auditoria_modtime ON public.configuracion_alerta_auditoria;
CREATE TRIGGER update_configuracion_alerta_auditoria_modtime BEFORE UPDATE ON public.configuracion_alerta_auditoria FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_procesos_por_sitio_modtime ON public.procesos_por_sitio;
CREATE TRIGGER update_procesos_por_sitio_modtime BEFORE UPDATE ON public.procesos_por_sitio FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_procesos_sitio_auditoria_modtime ON public.procesos_sitio_auditoria;
CREATE TRIGGER update_procesos_sitio_auditoria_modtime BEFORE UPDATE ON public.procesos_sitio_auditoria FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_equipo_auditor_sitio_modtime ON public.equipo_auditor_sitio;
CREATE TRIGGER update_equipo_auditor_sitio_modtime BEFORE UPDATE ON public.equipo_auditor_sitio FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_equipo_auditor_sitio_temporal_modtime ON public.equipo_auditor_sitio_temporal;
CREATE TRIGGER update_equipo_auditor_sitio_temporal_modtime BEFORE UPDATE ON public.equipo_auditor_sitio_temporal FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_auditoria_sitio_temporal_modtime ON public.auditoria_sitio_temporal;
CREATE TRIGGER update_auditoria_sitio_temporal_modtime BEFORE UPDATE ON public.auditoria_sitio_temporal FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_auditoria_sitio_temporal_certificado_modtime ON public.auditoria_sitio_temporal_certificado;
CREATE TRIGGER update_auditoria_sitio_temporal_certificado_modtime BEFORE UPDATE ON public.auditoria_sitio_temporal_certificado FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_hallazgo_modtime ON public.hallazgo;
CREATE TRIGGER update_hallazgo_modtime BEFORE UPDATE ON public.hallazgo FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_fecha_certificado_modtime ON public.fecha_certificado;
CREATE TRIGGER update_fecha_certificado_modtime BEFORE UPDATE ON public.fecha_certificado FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_contacto_certificado_modtime ON public.contacto_certificado;
CREATE TRIGGER update_contacto_certificado_modtime BEFORE UPDATE ON public.contacto_certificado FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_telefono_contacto_certificado_modtime ON public.telefono_contacto_certificado;
CREATE TRIGGER update_telefono_contacto_certificado_modtime BEFORE UPDATE ON public.telefono_contacto_certificado FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_email_contacto_certificado_modtime ON public.email_contacto_certificado;
CREATE TRIGGER update_email_contacto_certificado_modtime BEFORE UPDATE ON public.email_contacto_certificado FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_contacto_certificado_compartido_modtime ON public.contacto_certificado_compartido;
CREATE TRIGGER update_contacto_certificado_compartido_modtime BEFORE UPDATE ON public.contacto_certificado_compartido FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_turno_certificado_compartido_modtime ON public.turno_certificado_compartido;
CREATE TRIGGER update_turno_certificado_compartido_modtime BEFORE UPDATE ON public.turno_certificado_compartido FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_proceso_certificado_compartido_modtime ON public.proceso_certificado_compartido;
CREATE TRIGGER update_proceso_certificado_compartido_modtime BEFORE UPDATE ON public.proceso_certificado_compartido FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_sitio_certificado_compartido_modtime ON public.sitio_certificado_compartido;
CREATE TRIGGER update_sitio_certificado_compartido_modtime BEFORE UPDATE ON public.sitio_certificado_compartido FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- Fase 1.1, Certificado Step 2.1 & Auditoría Steps 1.1.1-1.1.2: Columnas FK / Soft-Delete Idempotentes
-- ============================================================================
ALTER TABLE public.organizacion
    ADD COLUMN IF NOT EXISTS id_grupo_empresarial UUID NULL REFERENCES public.grupo_empresarial(id) ON DELETE RESTRICT;

ALTER TABLE public.certificado
    ADD COLUMN IF NOT EXISTS id_subsector_iaf UUID REFERENCES public.subsector_iaf(id) ON DELETE RESTRICT;

-- Step 2.1: Migración idempotente en programa_auditoria y auditoria (Mixta, id_vinculo, id_grupo_empresarial, tiene_sitio_temporal)
UPDATE public.programa_auditoria
SET tipo_vinculacion = 'Mixta'
WHERE tipo_vinculacion = 'Multisitio';

ALTER TABLE public.programa_auditoria
    DROP CONSTRAINT IF EXISTS check_programa_tipo_vinculacion;
ALTER TABLE public.programa_auditoria
    ADD CONSTRAINT check_programa_tipo_vinculacion CHECK (
        tipo_vinculacion IN (
            'Individual', 'Combinada', 'Integrada',
            'Conjunta', 'Simultánea', 'Multientidad', 'Mixta'
        )
    );

ALTER TABLE public.programa_auditoria
    ADD COLUMN IF NOT EXISTS id_vinculo UUID NULL REFERENCES public.vinculo(id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS id_grupo_empresarial UUID NULL REFERENCES public.grupo_empresarial(id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS tiene_sitio_temporal BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.auditoria
    ADD COLUMN IF NOT EXISTS id_programa_auditoria UUID REFERENCES public.programa_auditoria(id) ON DELETE RESTRICT;
ALTER TABLE public.auditoria
    ADD COLUMN IF NOT EXISTS codigo_auditoria VARCHAR(40) NULL;
ALTER TABLE public.auditoria
    ADD COLUMN IF NOT EXISTS tiempo_auditoria NUMERIC(6,2) NOT NULL DEFAULT 0;
ALTER TABLE public.auditoria
    ADD COLUMN IF NOT EXISTS estado_ciclo VARCHAR(30) NOT NULL DEFAULT 'Borrador';
ALTER TABLE public.auditoria
    ADD COLUMN IF NOT EXISTS tiene_sitio_temporal BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.auditoria
    ADD COLUMN IF NOT EXISTS objetivo TEXT NULL;
ALTER TABLE public.auditoria
    ALTER COLUMN id_tipo_auditoria DROP NOT NULL;
ALTER TABLE public.auditoria
    ALTER COLUMN id_metodologia DROP NOT NULL;
ALTER TABLE public.auditoria
    DROP COLUMN IF EXISTS fecha_programacion;
ALTER TABLE public.auditoria
    DROP COLUMN IF EXISTS fecha_reprogramacion;

ALTER TABLE public.sitios_por_auditoria
    ADD COLUMN IF NOT EXISTS tiempo_auditoria NUMERIC(6,2) NOT NULL DEFAULT 0;
ALTER TABLE public.sitios_por_auditoria
    ADD COLUMN IF NOT EXISTS modalidad_evaluacion VARCHAR(20) NULL;
ALTER TABLE public.sitios_por_auditoria
    ADD COLUMN IF NOT EXISTS fecha_inicio DATE NULL;
ALTER TABLE public.sitios_por_auditoria
    ADD COLUMN IF NOT EXISTS fecha_fin DATE NULL;
ALTER TABLE public.sitios_por_auditoria
    ADD COLUMN IF NOT EXISTS notas_sitio TEXT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.sitios_por_auditoria'::regclass
          AND contype = 'c'
          AND pg_get_constraintdef(oid) ILIKE '%tiempo_auditoria * 4%'
    ) THEN
        ALTER TABLE public.sitios_por_auditoria
            ADD CONSTRAINT chk_sitios_por_auditoria_tiempo_quarter
            CHECK (tiempo_auditoria >= 0 AND MOD((tiempo_auditoria * 4)::NUMERIC, 1) = 0);
    END IF;
END $$;

ALTER TABLE public.procesos_sitio_auditoria
    ADD COLUMN IF NOT EXISTS id_procesos_por_sitio UUID REFERENCES public.procesos_por_sitio(id) ON DELETE RESTRICT;
ALTER TABLE public.procesos_sitio_auditoria
    ADD COLUMN IF NOT EXISTS notas TEXT;
ALTER TABLE public.procesos_sitio_auditoria
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.procesos_sitio_auditoria
    DROP COLUMN IF EXISTS id_turnos_sitio_auditoria;

ALTER TABLE public.requisito
    ADD COLUMN IF NOT EXISTS explicit_code BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.requisito
    ADD COLUMN IF NOT EXISTS external_key VARCHAR(100) NULL;
ALTER TABLE public.requisito
    ADD COLUMN IF NOT EXISTS es_obligatorio BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.requisito
    ADD COLUMN IF NOT EXISTS obligatorio_origen VARCHAR(20) NOT NULL DEFAULT 'AUTO_TEXT';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_requisito_obligatorio_origen'
          AND conrelid = 'public.requisito'::regclass
    ) THEN
        ALTER TABLE public.requisito
            ADD CONSTRAINT chk_requisito_obligatorio_origen
            CHECK (obligatorio_origen IN ('AUTO_TEXT', 'AUTO_INHERITED', 'AUTO_CHAPTER', 'AUTO_STRUCTURAL', 'MANUAL'));
    END IF;
END $$;

-- Step 1.2: Evolución idempotente de id_certificado_version en sub-entidades, M:N, comparticiones y auditoria
ALTER TABLE public.requisitos_por_proceso
    ADD COLUMN IF NOT EXISTS id_certificado UUID REFERENCES public.certificado(id) ON DELETE CASCADE;

UPDATE public.requisitos_por_proceso rpp
SET id_certificado = p.id_certificado
FROM public.proceso p
WHERE rpp.id_proceso = p.id
  AND rpp.id_certificado IS NULL;

ALTER TABLE public.requisitos_por_proceso
    ALTER COLUMN id_certificado SET NOT NULL;

ALTER TABLE public.procesos_por_sitio
    ADD COLUMN IF NOT EXISTS id_certificado UUID REFERENCES public.certificado(id) ON DELETE RESTRICT;

UPDATE public.procesos_por_sitio pps
SET id_certificado = s.id_certificado
FROM public.sitio s
WHERE pps.id_sitio = s.id
  AND pps.id_certificado IS NULL;

ALTER TABLE public.procesos_por_sitio
    ALTER COLUMN id_certificado SET NOT NULL;

DO $$
DECLARE
    v_tbl TEXT;
    v_versioned_tables TEXT[] := ARRAY[
        'fecha_certificado',
        'contacto_certificado',
        'contacto_certificado_compartido',
        'sitio',
        'sitio_certificado_compartido',
        'proceso',
        'requisitos_por_proceso',
        'proceso_certificado_compartido',
        'requisitos_no_aplicables_certificado',
        'turno_certificado_compartido',
        'procesos_por_sitio',
        'auditoria'
    ];
BEGIN
    FOREACH v_tbl IN ARRAY v_versioned_tables LOOP
        IF v_tbl IN (
            'auditoria',
            'procesos_por_sitio',
            'contacto_certificado_compartido',
            'sitio_certificado_compartido',
            'proceso_certificado_compartido',
            'turno_certificado_compartido'
        ) THEN
            EXECUTE format(
                'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS id_certificado_version UUID REFERENCES public.certificado_version(id) ON DELETE RESTRICT',
                v_tbl
            );
        ELSE
            EXECUTE format(
                'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS id_certificado_version UUID REFERENCES public.certificado_version(id) ON DELETE CASCADE',
                v_tbl
            );
        END IF;

        EXECUTE format(
            'UPDATE public.%I t SET id_certificado_version = COALESCE((
                SELECT cv.id FROM public.certificado_version cv
                WHERE cv.id_certificado = t.id_certificado AND cv.deleted_at IS NULL
                ORDER BY cv.es_version_actual DESC, cv.version_numero DESC LIMIT 1
            ), (
                SELECT cv.id FROM public.certificado_version cv
                WHERE cv.id_certificado = t.id_certificado
                ORDER BY cv.es_version_actual DESC, cv.version_numero DESC LIMIT 1
            )) WHERE t.id_certificado_version IS NULL AND t.id_certificado IS NOT NULL',
            v_tbl
        );

        EXECUTE format(
            'ALTER TABLE public.%I ALTER COLUMN id_certificado_version SET NOT NULL',
            v_tbl
        );

        EXECUTE format('DROP TRIGGER IF EXISTS trg_02_resolver_cert_version_scope_%I ON public.%I', v_tbl, v_tbl);
        IF v_tbl = 'requisitos_por_proceso' THEN
            EXECUTE format(
                'CREATE TRIGGER trg_02_resolver_cert_version_scope_%I BEFORE INSERT OR UPDATE OF id_certificado, id_certificado_version ON public.%I FOR EACH ROW EXECUTE FUNCTION public.fn_resolver_cert_version_scope()',
                v_tbl, v_tbl
            );
        ELSE
            EXECUTE format(
                'CREATE TRIGGER trg_02_resolver_cert_version_scope_%I BEFORE INSERT OR UPDATE OF id_certificado, id_certificado_version, deleted_at ON public.%I FOR EACH ROW EXECUTE FUNCTION public.fn_resolver_cert_version_scope()',
                v_tbl, v_tbl
            );
        END IF;
    END LOOP;
END $$;

DO $$
DECLARE
    v_pk_name TEXT;
    v_pk_cols TEXT[];
BEGIN
    DELETE FROM public.requisitos_por_proceso a
    USING public.requisitos_por_proceso b
    WHERE a.ctid < b.ctid
      AND a.id_proceso = b.id_proceso
      AND a.id_certificado_version = b.id_certificado_version
      AND a.id_requisito = b.id_requisito;

    SELECT c.conname,
           ARRAY(
               SELECT a.attname::TEXT
               FROM unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord)
               JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
               ORDER BY k.ord
           )
      INTO v_pk_name, v_pk_cols
    FROM pg_constraint c
    WHERE c.conrelid = 'public.requisitos_por_proceso'::regclass
      AND c.contype = 'p'
    LIMIT 1;

    IF v_pk_name IS NOT NULL AND v_pk_cols IS DISTINCT FROM ARRAY['id_proceso', 'id_certificado_version', 'id_requisito'] THEN
        EXECUTE format('ALTER TABLE public.requisitos_por_proceso DROP CONSTRAINT %I', v_pk_name);
        v_pk_name := NULL;
    END IF;

    IF v_pk_name IS NULL THEN
        ALTER TABLE public.requisitos_por_proceso
            ADD CONSTRAINT requisitos_por_proceso_pkey PRIMARY KEY (id_proceso, id_certificado_version, id_requisito);
    END IF;
END $$;

-- Step 1.1 (Compartición Simplificada Misma Norma vs. Norma Distinta): Evolución idempotente de proceso_certificado_compartido
ALTER TABLE public.proceso_certificado_compartido
    ADD COLUMN IF NOT EXISTS sincronizar_requisitos BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE public.proceso_certificado_compartido pcc
SET sincronizar_requisitos = FALSE,
    updated_at = NOW()
FROM public.proceso p
JOIN public.certificado c_owner ON c_owner.id = p.id_certificado,
     public.certificado c_target
WHERE pcc.id_proceso = p.id
  AND c_target.id = pcc.id_certificado
  AND pcc.sincronizar_requisitos = TRUE
  AND c_owner.id_norma IS DISTINCT FROM c_target.id_norma;

DO $$
DECLARE
    v_tbl TEXT;
    v_core_tables TEXT[] := ARRAY[
        'norma', 'requisito', 'sector_iaf', 'subsector_iaf',
        'organismo_acreditacion', 'acreditacion_norma',
        'estatus', 'tipo_auditoria', 'metodologia_auditoria', 'auditor',
        'grupo_empresarial', 'organizacion', 'organizacion_version', 'certificado', 'certificado_version', 'alcance', 'fecha_certificado', 'contacto_certificado',
        'sitio', 'proceso', 'turno',
        'vinculo', 'programa_auditoria', 'auditoria', 'auditoria_sitio_temporal', 'hallazgo'
    ];
    v_child_tables TEXT[] := ARRAY[
        'requisito_traduccion',
        'acreditacion_norma_sector_iaf',
        'alcance_certificado_compartido',
        'requisitos_no_aplicables_certificado', 'turnos_por_sitio', 'procesos_por_sitio',
        'vinculo_certificado', 'auditoria_fecha', 'configuracion_alerta_auditoria',
        'comentarios_por_auditoria', 'sitios_por_auditoria',
        'auditoria_sitio_temporal_certificado',
        'turnos_sitio_auditoria', 'procesos_sitio_auditoria', 'turnos_proceso_sitio_auditoria',
        'equipo_auditor_sitio', 'equipo_auditor_proceso_sitio',
        'telefono_contacto_certificado', 'email_contacto_certificado',
        'contacto_certificado_compartido', 'turno_certificado_compartido',
        'proceso_certificado_compartido', 'sitio_certificado_compartido',
        'client_organization_access'
    ];
BEGIN
    FOREACH v_tbl IN ARRAY v_core_tables LOOP
        EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL', v_tbl);
        EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL', v_tbl);
        EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS delete_reason TEXT', v_tbl);
    END LOOP;

    FOREACH v_tbl IN ARRAY v_child_tables LOOP
        EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL', v_tbl);
        EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL', v_tbl);
    END LOOP;
END $$;

-- ============================================================================
-- Fase 1.1: Prevención de Hard-Delete, Sincronización Soft-Delete & Audit Log
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_prevent_hard_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RAISE EXCEPTION 'Operación bloqueada: la tabla public.% utiliza retención lógica (soft-delete). Actualice deleted_at en lugar de ejecutar DELETE.', TG_TABLE_NAME;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_sync_soft_delete_metadata()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
        NEW.deleted_by := COALESCE(NEW.deleted_by, auth.uid());
    ELSIF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
        NEW.deleted_by := NULL;
        NEW.delete_reason := NULL;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_sync_soft_delete_child_metadata()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
        NEW.deleted_by := COALESCE(NEW.deleted_by, auth.uid());
    ELSIF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
        NEW.deleted_by := NULL;
    END IF;
    RETURN NEW;
END;
$$;

-- Guardia RBAC para public.profiles (impide auto-escalamiento de role o status)
CREATE OR REPLACE FUNCTION public.is_approved_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'ADMIN' AND status = 'APPROVED'
    );
$$;

CREATE OR REPLACE FUNCTION public.fn_protect_profile_rbac_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_jwt_role TEXT;
BEGIN
    v_jwt_role := COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), '');

    -- Permite ejecución administrativa directa en migraciones/semilleros (postgres / service_role sin JWT de usuario)
    IF auth.uid() IS NULL AND (
        session_user IN ('postgres', 'supabase_admin', 'service_role')
        OR v_jwt_role = 'service_role'
    ) THEN
        RETURN NEW;
    END IF;

    IF NOT public.is_approved_admin() THEN
        IF NEW.role IS DISTINCT FROM OLD.role OR NEW.status IS DISTINCT FROM OLD.status THEN
            RAISE EXCEPTION 'Violación RBAC: solo un administrador aprobado puede modificar role o status.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_rbac_fields ON public.profiles;
CREATE TRIGGER trg_protect_profile_rbac_fields
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.fn_protect_profile_rbac_fields();

DROP TRIGGER IF EXISTS audit_profiles_trigger ON public.profiles;
CREATE TRIGGER audit_profiles_trigger
    AFTER INSERT OR UPDATE OR DELETE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

-- ============================================================================
-- Fase 1.1: RPC de Dependencias Activas y Guardia de Archival en Padres
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_archive_dependency_summary(p_table TEXT, p_record_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_deps JSONB := '[]'::jsonb;
    v_total INTEGER := 0;
    v_count INTEGER := 0;
    v_sitio_numero INTEGER;
    v_sitio_cert_id UUID;
BEGIN
    CASE p_table
        WHEN 'grupo_empresarial' THEN
            SELECT COUNT(*)::INTEGER INTO v_count
            FROM public.organizacion WHERE id_grupo_empresarial = p_record_id AND deleted_at IS NULL;
            IF v_count > 0 THEN
                v_deps := v_deps || jsonb_build_array(jsonb_build_object('table', 'organizacion', 'label', 'Organizaciones activas vinculadas', 'count', v_count));
                v_total := v_total + v_count;
            END IF;

            SELECT COUNT(*)::INTEGER INTO v_count
            FROM public.vinculo WHERE id_grupo_empresarial = p_record_id AND deleted_at IS NULL;
            IF v_count > 0 THEN
                v_deps := v_deps || jsonb_build_array(jsonb_build_object('table', 'vinculo', 'label', 'Vínculos de auditoría activos', 'count', v_count));
                v_total := v_total + v_count;
            END IF;

            IF EXISTS (
                SELECT 1
                FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name = 'programa_auditoria'
                  AND column_name = 'id_grupo_empresarial'
            ) THEN
                EXECUTE 'SELECT COUNT(*)::INTEGER FROM public.programa_auditoria WHERE id_grupo_empresarial = $1 AND deleted_at IS NULL'
                INTO v_count
                USING p_record_id;
                IF v_count > 0 THEN
                    v_deps := v_deps || jsonb_build_array(jsonb_build_object('table', 'programa_auditoria', 'label', 'Programas de auditoría vinculados', 'count', v_count));
                    v_total := v_total + v_count;
                END IF;
            END IF;

        WHEN 'vinculo' THEN
            SELECT COUNT(*)::INTEGER INTO v_count
            FROM public.vinculo_certificado WHERE id_vinculo = p_record_id AND deleted_at IS NULL;
            IF v_count > 0 THEN
                v_deps := v_deps || jsonb_build_array(jsonb_build_object('table', 'vinculo_certificado', 'label', 'Certificados activos en el vínculo', 'count', v_count));
                v_total := v_total + v_count;
            END IF;

            SELECT COUNT(*)::INTEGER INTO v_count
            FROM public.programa_auditoria pa
            WHERE pa.id_vinculo = p_record_id
              AND pa.deleted_at IS NULL
              AND EXISTS (
                  SELECT 1 FROM public.auditoria a
                  WHERE a.id_programa_auditoria = pa.id
                    AND a.deleted_at IS NULL
                    AND a.estado_ciclo NOT IN ('Cerrada', 'Cancelada', 'Auditada')
              );
            IF v_count > 0 THEN
                v_deps := v_deps || jsonb_build_array(jsonb_build_object('table', 'programa_auditoria', 'label', 'Campañas con auditorías pendientes bajo este vínculo', 'count', v_count));
                v_total := v_total + v_count;
            END IF;

        WHEN 'organizacion' THEN
            SELECT COUNT(*)::INTEGER INTO v_count
            FROM public.certificado WHERE id_organizacion = p_record_id AND deleted_at IS NULL;
            IF v_count > 0 THEN
                v_deps := v_deps || jsonb_build_array(jsonb_build_object('table', 'certificado', 'label', 'Certificados activos', 'count', v_count));
                v_total := v_total + v_count;
            END IF;

            IF to_regclass('public.certificado_version') IS NOT NULL THEN
                EXECUTE '
                    SELECT COUNT(*)::INTEGER
                    FROM public.certificado_version cv
                    JOIN public.organizacion_version ov ON ov.id = cv.id_organizacion_version
                    WHERE ov.id_organizacion = $1
                      AND cv.deleted_at IS NULL
                '
                INTO v_count
                USING p_record_id;
                IF v_count > 0 THEN
                    v_deps := v_deps || jsonb_build_array(jsonb_build_object('table', 'certificado_version', 'label', 'Versiones de certificado vinculadas a la organización', 'count', v_count));
                    v_total := v_total + v_count;
                END IF;
            END IF;

        WHEN 'organizacion_version' THEN
            IF to_regclass('public.certificado_version') IS NOT NULL THEN
                EXECUTE '
                    SELECT COUNT(*)::INTEGER
                    FROM public.certificado_version
                    WHERE id_organizacion_version = $1
                      AND deleted_at IS NULL
                '
                INTO v_count
                USING p_record_id;
                IF v_count > 0 THEN
                    v_deps := v_deps || jsonb_build_array(jsonb_build_object('table', 'certificado_version', 'label', 'Versiones de certificado vinculadas', 'count', v_count));
                    v_total := v_total + v_count;
                END IF;
            END IF;

        WHEN 'certificado' THEN
            SELECT COUNT(*)::INTEGER INTO v_count
            FROM public.vinculo_certificado WHERE id_certificado = p_record_id AND deleted_at IS NULL;
            IF v_count > 0 THEN
                v_deps := v_deps || jsonb_build_array(jsonb_build_object('table', 'vinculo_certificado', 'label', 'Vínculos de auditoría activos', 'count', v_count));
                v_total := v_total + v_count;
            END IF;

            SELECT COUNT(*)::INTEGER INTO v_count
            FROM public.alcance WHERE id_certificado = p_record_id AND deleted_at IS NULL;
            IF v_count > 0 THEN
                v_deps := v_deps || jsonb_build_array(jsonb_build_object('table', 'alcance', 'label', 'Alcances activos del certificado', 'count', v_count));
                v_total := v_total + v_count;
            END IF;

            SELECT COUNT(*)::INTEGER INTO v_count
            FROM public.alcance_certificado_compartido WHERE id_certificado = p_record_id AND deleted_at IS NULL;
            IF v_count > 0 THEN
                v_deps := v_deps || jsonb_build_array(jsonb_build_object('table', 'alcance_certificado_compartido', 'label', 'Alcances compartidos recibidos por el certificado', 'count', v_count));
                v_total := v_total + v_count;
            END IF;

            SELECT COUNT(*)::INTEGER INTO v_count
            FROM public.sitio WHERE id_certificado = p_record_id AND deleted_at IS NULL;
            IF v_count > 0 THEN
                v_deps := v_deps || jsonb_build_array(jsonb_build_object('table', 'sitio', 'label', 'Sitios operativos', 'count', v_count));
                v_total := v_total + v_count;
            END IF;

            SELECT COUNT(*)::INTEGER INTO v_count
            FROM public.proceso WHERE id_certificado = p_record_id AND deleted_at IS NULL;
            IF v_count > 0 THEN
                v_deps := v_deps || jsonb_build_array(jsonb_build_object('table', 'proceso', 'label', 'Procesos operativos', 'count', v_count));
                v_total := v_total + v_count;
            END IF;

            SELECT COUNT(*)::INTEGER INTO v_count
            FROM public.auditoria WHERE id_certificado = p_record_id AND deleted_at IS NULL;
            IF v_count > 0 THEN
                v_deps := v_deps || jsonb_build_array(jsonb_build_object('table', 'auditoria', 'label', 'Auditorías vinculadas', 'count', v_count));
                v_total := v_total + v_count;
            END IF;

            SELECT COUNT(*)::INTEGER INTO v_count
            FROM public.requisitos_no_aplicables_certificado WHERE id_certificado = p_record_id AND deleted_at IS NULL;
            IF v_count > 0 THEN
                v_deps := v_deps || jsonb_build_array(jsonb_build_object('table', 'requisitos_no_aplicables_certificado', 'label', 'Exclusiones normativas', 'count', v_count));
                v_total := v_total + v_count;
            END IF;

            SELECT COUNT(*)::INTEGER INTO v_count
            FROM public.fecha_certificado WHERE id_certificado = p_record_id AND deleted_at IS NULL;
            IF v_count > 0 THEN
                v_deps := v_deps || jsonb_build_array(jsonb_build_object('table', 'fecha_certificado', 'label', 'Fechas del certificado', 'count', v_count));
                v_total := v_total + v_count;
            END IF;

            SELECT COUNT(*)::INTEGER INTO v_count
            FROM public.contacto_certificado WHERE id_certificado = p_record_id AND deleted_at IS NULL;
            IF v_count > 0 THEN
                v_deps := v_deps || jsonb_build_array(jsonb_build_object('table', 'contacto_certificado', 'label', 'Contactos del certificado', 'count', v_count));
                v_total := v_total + v_count;
            END IF;

            SELECT COUNT(*)::INTEGER INTO v_count
            FROM public.procesos_por_sitio WHERE id_certificado = p_record_id AND deleted_at IS NULL;
            IF v_count > 0 THEN
                v_deps := v_deps || jsonb_build_array(jsonb_build_object('table', 'procesos_por_sitio', 'label', 'Asignaciones proceso-sitio bajo el certificado', 'count', v_count));
                v_total := v_total + v_count;
            END IF;

            SELECT COUNT(*)::INTEGER INTO v_count
            FROM public.contacto_certificado_compartido WHERE id_certificado = p_record_id AND deleted_at IS NULL;
            IF v_count > 0 THEN
                v_deps := v_deps || jsonb_build_array(jsonb_build_object('table', 'contacto_certificado_compartido', 'label', 'Contactos compartidos recibidos por el certificado', 'count', v_count));
                v_total := v_total + v_count;
            END IF;

            SELECT COUNT(*)::INTEGER INTO v_count
            FROM public.turno_certificado_compartido
            WHERE (id_certificado = p_record_id OR id_certificado_origen = p_record_id)
              AND deleted_at IS NULL;
            IF v_count > 0 THEN
                v_deps := v_deps || jsonb_build_array(jsonb_build_object('table', 'turno_certificado_compartido', 'label', 'Turnos compartidos vinculados al certificado', 'count', v_count));
                v_total := v_total + v_count;
            END IF;

            SELECT COUNT(*)::INTEGER INTO v_count
            FROM public.proceso_certificado_compartido WHERE id_certificado = p_record_id AND deleted_at IS NULL;
            IF v_count > 0 THEN
                v_deps := v_deps || jsonb_build_array(jsonb_build_object('table', 'proceso_certificado_compartido', 'label', 'Procesos compartidos recibidos por el certificado', 'count', v_count));
                v_total := v_total + v_count;
            END IF;

            SELECT COUNT(*)::INTEGER INTO v_count
            FROM public.sitio_certificado_compartido WHERE id_certificado = p_record_id AND deleted_at IS NULL;
            IF v_count > 0 THEN
                v_deps := v_deps || jsonb_build_array(jsonb_build_object('table', 'sitio_certificado_compartido', 'label', 'Sitios compartidos recibidos por el certificado', 'count', v_count));
                v_total := v_total + v_count;
            END IF;

        WHEN 'certificado_version' THEN
            SELECT COUNT(*)::INTEGER INTO v_count
            FROM public.sitio WHERE id_certificado_version = p_record_id AND deleted_at IS NULL;
            IF v_count > 0 THEN
                v_deps := v_deps || jsonb_build_array(jsonb_build_object('table', 'sitio', 'label', 'Sitios operativos en la versión', 'count', v_count));
                v_total := v_total + v_count;
            END IF;

            SELECT COUNT(*)::INTEGER INTO v_count
            FROM public.proceso WHERE id_certificado_version = p_record_id AND deleted_at IS NULL;
            IF v_count > 0 THEN
                v_deps := v_deps || jsonb_build_array(jsonb_build_object('table', 'proceso', 'label', 'Procesos operativos en la versión', 'count', v_count));
                v_total := v_total + v_count;
            END IF;

            SELECT COUNT(*)::INTEGER INTO v_count
            FROM public.auditoria WHERE id_certificado_version = p_record_id AND deleted_at IS NULL;
            IF v_count > 0 THEN
                v_deps := v_deps || jsonb_build_array(jsonb_build_object('table', 'auditoria', 'label', 'Auditorías vinculadas a la versión', 'count', v_count));
                v_total := v_total + v_count;
            END IF;

            SELECT COUNT(*)::INTEGER INTO v_count
            FROM public.requisitos_no_aplicables_certificado WHERE id_certificado_version = p_record_id AND deleted_at IS NULL;
            IF v_count > 0 THEN
                v_deps := v_deps || jsonb_build_array(jsonb_build_object('table', 'requisitos_no_aplicables_certificado', 'label', 'Exclusiones normativas de la versión', 'count', v_count));
                v_total := v_total + v_count;
            END IF;

            SELECT COUNT(*)::INTEGER INTO v_count
            FROM public.fecha_certificado WHERE id_certificado_version = p_record_id AND deleted_at IS NULL;
            IF v_count > 0 THEN
                v_deps := v_deps || jsonb_build_array(jsonb_build_object('table', 'fecha_certificado', 'label', 'Fechas de la versión', 'count', v_count));
                v_total := v_total + v_count;
            END IF;

            SELECT COUNT(*)::INTEGER INTO v_count
            FROM public.contacto_certificado WHERE id_certificado_version = p_record_id AND deleted_at IS NULL;
            IF v_count > 0 THEN
                v_deps := v_deps || jsonb_build_array(jsonb_build_object('table', 'contacto_certificado', 'label', 'Contactos de la versión', 'count', v_count));
                v_total := v_total + v_count;
            END IF;

            SELECT COUNT(*)::INTEGER INTO v_count
            FROM public.procesos_por_sitio WHERE id_certificado_version = p_record_id AND deleted_at IS NULL;
            IF v_count > 0 THEN
                v_deps := v_deps || jsonb_build_array(jsonb_build_object('table', 'procesos_por_sitio', 'label', 'Asignaciones proceso-sitio de la versión', 'count', v_count));
                v_total := v_total + v_count;
            END IF;

            SELECT COUNT(*)::INTEGER INTO v_count
            FROM public.contacto_certificado_compartido WHERE id_certificado_version = p_record_id AND deleted_at IS NULL;
            IF v_count > 0 THEN
                v_deps := v_deps || jsonb_build_array(jsonb_build_object('table', 'contacto_certificado_compartido', 'label', 'Contactos compartidos recibidos en la versión', 'count', v_count));
                v_total := v_total + v_count;
            END IF;

            SELECT COUNT(*)::INTEGER INTO v_count
            FROM public.turno_certificado_compartido WHERE id_certificado_version = p_record_id AND deleted_at IS NULL;
            IF v_count > 0 THEN
                v_deps := v_deps || jsonb_build_array(jsonb_build_object('table', 'turno_certificado_compartido', 'label', 'Turnos compartidos recibidos en la versión', 'count', v_count));
                v_total := v_total + v_count;
            END IF;

            SELECT COUNT(*)::INTEGER INTO v_count
            FROM public.proceso_certificado_compartido WHERE id_certificado_version = p_record_id AND deleted_at IS NULL;
            IF v_count > 0 THEN
                v_deps := v_deps || jsonb_build_array(jsonb_build_object('table', 'proceso_certificado_compartido', 'label', 'Procesos compartidos recibidos en la versión', 'count', v_count));
                v_total := v_total + v_count;
            END IF;

            SELECT COUNT(*)::INTEGER INTO v_count
            FROM public.sitio_certificado_compartido WHERE id_certificado_version = p_record_id AND deleted_at IS NULL;
            IF v_count > 0 THEN
                v_deps := v_deps || jsonb_build_array(jsonb_build_object('table', 'sitio_certificado_compartido', 'label', 'Sitios compartidos recibidos en la versión', 'count', v_count));
                v_total := v_total + v_count;
            END IF;

        WHEN 'alcance' THEN
            SELECT COUNT(*)::INTEGER INTO v_count
            FROM public.alcance_certificado_compartido WHERE id_alcance = p_record_id AND deleted_at IS NULL;
            IF v_count > 0 THEN
                v_deps := v_deps || jsonb_build_array(jsonb_build_object('table', 'alcance_certificado_compartido', 'label', 'Certificados que reutilizan este alcance compartido', 'count', v_count));
                v_total := v_total + v_count;
            END IF;

            SELECT COUNT(*)::INTEGER INTO v_count
            FROM public.alcance a
            JOIN public.auditoria au ON au.id_certificado = a.id_certificado
            WHERE a.id = p_record_id
              AND au.deleted_at IS NULL;
            IF v_count > 0 THEN
                v_deps := v_deps || jsonb_build_array(jsonb_build_object('table', 'auditoria', 'label', 'Auditorías activas asociadas al certificado del alcance', 'count', v_count));
                v_total := v_total + v_count;
            END IF;

        WHEN 'contacto_certificado' THEN
            SELECT COUNT(*)::INTEGER INTO v_count
            FROM public.telefono_contacto_certificado WHERE id_contacto = p_record_id AND deleted_at IS NULL;
            IF v_count > 0 THEN
                v_deps := v_deps || jsonb_build_array(jsonb_build_object('table', 'telefono_contacto_certificado', 'label', 'Teléfonos del contacto', 'count', v_count));
                v_total := v_total + v_count;
            END IF;

            SELECT COUNT(*)::INTEGER INTO v_count
            FROM public.email_contacto_certificado WHERE id_contacto = p_record_id AND deleted_at IS NULL;
            IF v_count > 0 THEN
                v_deps := v_deps || jsonb_build_array(jsonb_build_object('table', 'email_contacto_certificado', 'label', 'Correos del contacto', 'count', v_count));
                v_total := v_total + v_count;
            END IF;

            SELECT COUNT(*)::INTEGER INTO v_count
            FROM public.contacto_certificado_compartido WHERE id_contacto = p_record_id AND deleted_at IS NULL;
            IF v_count > 0 THEN
                v_deps := v_deps || jsonb_build_array(jsonb_build_object('table', 'contacto_certificado_compartido', 'label', 'Comparticiones activas del contacto en conglomerado', 'count', v_count));
                v_total := v_total + v_count;
            END IF;

        WHEN 'sitio' THEN
            SELECT numero_sitio, id_certificado INTO v_sitio_numero, v_sitio_cert_id
            FROM public.sitio WHERE id = p_record_id;

            IF v_sitio_numero = 0 AND v_sitio_cert_id IS NOT NULL THEN
                SELECT COUNT(*)::INTEGER INTO v_count
                FROM public.sitio
                WHERE id_certificado = v_sitio_cert_id
                  AND id <> p_record_id
                  AND numero_sitio > 0
                  AND deleted_at IS NULL;
                IF v_count > 0 THEN
                    v_deps := v_deps || jsonb_build_array(jsonb_build_object('table', 'sitio', 'label', 'Sedes secundarias dependientes de Sitio 0', 'count', v_count));
                    v_total := v_total + v_count;
                END IF;
            END IF;

            SELECT COUNT(*)::INTEGER INTO v_count
            FROM public.sitios_por_auditoria WHERE id_sitio = p_record_id AND deleted_at IS NULL;
            IF v_count > 0 THEN
                v_deps := v_deps || jsonb_build_array(jsonb_build_object('table', 'sitios_por_auditoria', 'label', 'Auditorías asignadas al sitio', 'count', v_count));
                v_total := v_total + v_count;
            END IF;

            SELECT COUNT(*)::INTEGER INTO v_count
            FROM public.turnos_por_sitio WHERE id_sitio = p_record_id AND deleted_at IS NULL;
            IF v_count > 0 THEN
                v_deps := v_deps || jsonb_build_array(jsonb_build_object('table', 'turnos_por_sitio', 'label', 'Turnos asignados al sitio', 'count', v_count));
                v_total := v_total + v_count;
            END IF;

            SELECT COUNT(*)::INTEGER INTO v_count
            FROM public.procesos_por_sitio WHERE id_sitio = p_record_id AND deleted_at IS NULL;
            IF v_count > 0 THEN
                v_deps := v_deps || jsonb_build_array(jsonb_build_object('table', 'procesos_por_sitio', 'label', 'Procesos asignados al sitio', 'count', v_count));
                v_total := v_total + v_count;
            END IF;

            SELECT COUNT(*)::INTEGER INTO v_count
            FROM public.sitio_certificado_compartido WHERE id_sitio = p_record_id AND deleted_at IS NULL;
            IF v_count > 0 THEN
                v_deps := v_deps || jsonb_build_array(jsonb_build_object('table', 'sitio_certificado_compartido', 'label', 'Comparticiones activas del sitio en conglomerado', 'count', v_count));
                v_total := v_total + v_count;
            END IF;

        WHEN 'proceso' THEN
            SELECT COUNT(*)::INTEGER INTO v_count
            FROM public.hallazgo WHERE id_proceso = p_record_id AND deleted_at IS NULL;
            IF v_count > 0 THEN
                v_deps := v_deps || jsonb_build_array(jsonb_build_object('table', 'hallazgo', 'label', 'Hallazgos vinculados al proceso', 'count', v_count));
                v_total := v_total + v_count;
            END IF;

            SELECT COUNT(*)::INTEGER INTO v_count
            FROM public.procesos_por_sitio WHERE id_proceso = p_record_id AND deleted_at IS NULL;
            IF v_count > 0 THEN
                v_deps := v_deps || jsonb_build_array(jsonb_build_object('table', 'procesos_por_sitio', 'label', 'Sitios con este proceso asignado', 'count', v_count));
                v_total := v_total + v_count;
            END IF;

            SELECT COUNT(*)::INTEGER INTO v_count
            FROM public.procesos_sitio_auditoria WHERE id_proceso = p_record_id AND deleted_at IS NULL;
            IF v_count > 0 THEN
                v_deps := v_deps || jsonb_build_array(jsonb_build_object('table', 'procesos_sitio_auditoria', 'label', 'Auditorías programadas para el proceso', 'count', v_count));
                v_total := v_total + v_count;
            END IF;

            SELECT COUNT(*)::INTEGER INTO v_count
            FROM public.proceso_certificado_compartido WHERE id_proceso = p_record_id AND deleted_at IS NULL;
            IF v_count > 0 THEN
                v_deps := v_deps || jsonb_build_array(jsonb_build_object('table', 'proceso_certificado_compartido', 'label', 'Comparticiones activas del proceso en conglomerado', 'count', v_count));
                v_total := v_total + v_count;
            END IF;

        WHEN 'procesos_por_sitio' THEN
            SELECT COUNT(*)::INTEGER INTO v_count
            FROM public.procesos_sitio_auditoria WHERE id_procesos_por_sitio = p_record_id AND deleted_at IS NULL;
            IF v_count > 0 THEN
                v_deps := v_deps || jsonb_build_array(jsonb_build_object('table', 'procesos_sitio_auditoria', 'label', 'Auditorías programadas para el proceso en el sitio', 'count', v_count));
                v_total := v_total + v_count;
            END IF;

        WHEN 'turno' THEN
            SELECT COUNT(*)::INTEGER INTO v_count
            FROM public.turnos_por_sitio WHERE id_turno = p_record_id AND deleted_at IS NULL;
            IF v_count > 0 THEN
                v_deps := v_deps || jsonb_build_array(jsonb_build_object('table', 'turnos_por_sitio', 'label', 'Sedes con este turno asignado', 'count', v_count));
                v_total := v_total + v_count;
            END IF;

            SELECT COUNT(*)::INTEGER INTO v_count
            FROM public.turno_certificado_compartido WHERE id_turno = p_record_id AND deleted_at IS NULL;
            IF v_count > 0 THEN
                v_deps := v_deps || jsonb_build_array(jsonb_build_object('table', 'turno_certificado_compartido', 'label', 'Comparticiones activas del turno en conglomerado', 'count', v_count));
                v_total := v_total + v_count;
            END IF;

        WHEN 'programa_auditoria' THEN
            SELECT COUNT(*)::INTEGER INTO v_count
            FROM public.auditoria WHERE id_programa_auditoria = p_record_id AND deleted_at IS NULL;
            IF v_count > 0 THEN
                v_deps := v_deps || jsonb_build_array(jsonb_build_object('table', 'auditoria', 'label', 'Auditorías vinculadas al programa', 'count', v_count));
                v_total := v_total + v_count;
            END IF;

        WHEN 'auditoria' THEN
            SELECT COUNT(*)::INTEGER INTO v_count
            FROM public.auditoria_fecha WHERE id_auditoria = p_record_id AND deleted_at IS NULL;
            IF v_count > 0 THEN
                v_deps := v_deps || jsonb_build_array(jsonb_build_object('table', 'auditoria_fecha', 'label', 'Revisiones de fecha de la auditoría', 'count', v_count));
                v_total := v_total + v_count;
            END IF;

            SELECT COUNT(*)::INTEGER INTO v_count
            FROM public.hallazgo WHERE id_auditoria = p_record_id AND deleted_at IS NULL;
            IF v_count > 0 THEN
                v_deps := v_deps || jsonb_build_array(jsonb_build_object('table', 'hallazgo', 'label', 'Hallazgos de la auditoría', 'count', v_count));
                v_total := v_total + v_count;
            END IF;

            SELECT COUNT(*)::INTEGER INTO v_count
            FROM public.sitios_por_auditoria WHERE id_auditoria = p_record_id AND deleted_at IS NULL;
            IF v_count > 0 THEN
                v_deps := v_deps || jsonb_build_array(jsonb_build_object('table', 'sitios_por_auditoria', 'label', 'Sitios en el alcance de la auditoría', 'count', v_count));
                v_total := v_total + v_count;
            END IF;

            SELECT COUNT(*)::INTEGER INTO v_count
            FROM public.comentarios_por_auditoria WHERE id_auditoria = p_record_id AND deleted_at IS NULL;
            IF v_count > 0 THEN
                v_deps := v_deps || jsonb_build_array(jsonb_build_object('table', 'comentarios_por_auditoria', 'label', 'Comentarios de seguimiento', 'count', v_count));
                v_total := v_total + v_count;
            END IF;

            SELECT COUNT(*)::INTEGER INTO v_count
            FROM public.auditoria_sitio_temporal WHERE id_auditoria = p_record_id AND deleted_at IS NULL;
            IF v_count > 0 THEN
                v_deps := v_deps || jsonb_build_array(jsonb_build_object('table', 'auditoria_sitio_temporal', 'label', 'Sitios temporales registrados en la auditoría', 'count', v_count));
                v_total := v_total + v_count;
            END IF;

            SELECT COUNT(*)::INTEGER INTO v_count
            FROM public.auditoria_sitio_temporal_certificado WHERE id_auditoria_certificado = p_record_id AND deleted_at IS NULL;
            IF v_count > 0 THEN
                v_deps := v_deps || jsonb_build_array(jsonb_build_object('table', 'auditoria_sitio_temporal_certificado', 'label', 'Vínculos activos con sitios temporales', 'count', v_count));
                v_total := v_total + v_count;
            END IF;

        WHEN 'auditoria_sitio_temporal' THEN
            SELECT COUNT(*)::INTEGER INTO v_count
            FROM public.auditoria_sitio_temporal_certificado WHERE id_sitio_temporal = p_record_id AND deleted_at IS NULL;
            IF v_count > 0 THEN
                v_deps := v_deps || jsonb_build_array(jsonb_build_object('table', 'auditoria_sitio_temporal_certificado', 'label', 'Certificados vinculados al sitio temporal', 'count', v_count));
                v_total := v_total + v_count;
            END IF;

            SELECT COUNT(*)::INTEGER INTO v_count
            FROM public.equipo_auditor_sitio_temporal WHERE id_sitio_temporal = p_record_id AND deleted_at IS NULL;
            IF v_count > 0 THEN
                v_deps := v_deps || jsonb_build_array(jsonb_build_object('table', 'equipo_auditor_sitio_temporal', 'label', 'Auditores asignados al sitio temporal', 'count', v_count));
                v_total := v_total + v_count;
            END IF;

        WHEN 'norma' THEN
            SELECT COUNT(*)::INTEGER INTO v_count
            FROM public.certificado WHERE id_norma = p_record_id AND deleted_at IS NULL;
            IF v_count > 0 THEN
                v_deps := v_deps || jsonb_build_array(jsonb_build_object('table', 'certificado', 'label', 'Certificados emitidos bajo la norma', 'count', v_count));
                v_total := v_total + v_count;
            END IF;

            SELECT COUNT(*)::INTEGER INTO v_count
            FROM public.requisito WHERE id_norma = p_record_id AND deleted_at IS NULL;
            IF v_count > 0 THEN
                v_deps := v_deps || jsonb_build_array(jsonb_build_object('table', 'requisito', 'label', 'Cláusulas de la norma', 'count', v_count));
                v_total := v_total + v_count;
            END IF;

            SELECT COUNT(*)::INTEGER INTO v_count
            FROM public.acreditacion_norma WHERE id_norma = p_record_id AND deleted_at IS NULL;
            IF v_count > 0 THEN
                v_deps := v_deps || jsonb_build_array(jsonb_build_object('table', 'acreditacion_norma', 'label', 'Acreditaciones vinculadas', 'count', v_count));
                v_total := v_total + v_count;
            END IF;

        WHEN 'requisito' THEN
            SELECT COUNT(*)::INTEGER INTO v_count
            FROM public.requisito WHERE id_requisito_padre = p_record_id AND deleted_at IS NULL;
            IF v_count > 0 THEN
                v_deps := v_deps || jsonb_build_array(jsonb_build_object('table', 'requisito', 'label', 'Sub-cláusulas dependientes', 'count', v_count));
                v_total := v_total + v_count;
            END IF;

            SELECT COUNT(*)::INTEGER INTO v_count
            FROM public.hallazgo WHERE id_requisito = p_record_id AND deleted_at IS NULL;
            IF v_count > 0 THEN
                v_deps := v_deps || jsonb_build_array(jsonb_build_object('table', 'hallazgo', 'label', 'Hallazgos vinculados a la cláusula', 'count', v_count));
                v_total := v_total + v_count;
            END IF;

            SELECT COUNT(*)::INTEGER INTO v_count
            FROM public.requisitos_no_aplicables_certificado WHERE id_requisito = p_record_id AND deleted_at IS NULL;
            IF v_count > 0 THEN
                v_deps := v_deps || jsonb_build_array(jsonb_build_object('table', 'requisitos_no_aplicables_certificado', 'label', 'Exclusiones en certificados', 'count', v_count));
                v_total := v_total + v_count;
            END IF;

        WHEN 'sector_iaf' THEN
            SELECT COUNT(*)::INTEGER INTO v_count
            FROM public.subsector_iaf WHERE id_sector_iaf = p_record_id AND deleted_at IS NULL;
            IF v_count > 0 THEN
                v_deps := v_deps || jsonb_build_array(jsonb_build_object('table', 'subsector_iaf', 'label', 'Sub-sectores IAF', 'count', v_count));
                v_total := v_total + v_count;
            END IF;

            SELECT COUNT(*)::INTEGER INTO v_count
            FROM public.certificado WHERE id_sector_iaf = p_record_id AND deleted_at IS NULL;
            IF v_count > 0 THEN
                v_deps := v_deps || jsonb_build_array(jsonb_build_object('table', 'certificado', 'label', 'Certificados en este sector', 'count', v_count));
                v_total := v_total + v_count;
            END IF;

            SELECT COUNT(*)::INTEGER INTO v_count
            FROM public.acreditacion_norma_sector_iaf WHERE id_sector_iaf = p_record_id AND deleted_at IS NULL;
            IF v_count > 0 THEN
                v_deps := v_deps || jsonb_build_array(jsonb_build_object('table', 'acreditacion_norma_sector_iaf', 'label', 'Acreditaciones vinculadas a este sector', 'count', v_count));
                v_total := v_total + v_count;
            END IF;

        WHEN 'subsector_iaf' THEN
            SELECT COUNT(*)::INTEGER INTO v_count
            FROM public.certificado WHERE id_subsector_iaf = p_record_id AND deleted_at IS NULL;
            IF v_count > 0 THEN
                v_deps := v_deps || jsonb_build_array(jsonb_build_object('table', 'certificado', 'label', 'Certificados en este sub-sector IAF', 'count', v_count));
                v_total := v_total + v_count;
            END IF;

        WHEN 'organismo_acreditacion' THEN
            SELECT COUNT(*)::INTEGER INTO v_count
            FROM public.acreditacion_norma WHERE id_organismo = p_record_id AND deleted_at IS NULL;
            IF v_count > 0 THEN
                v_deps := v_deps || jsonb_build_array(jsonb_build_object('table', 'acreditacion_norma', 'label', 'Acreditaciones otorgadas', 'count', v_count));
                v_total := v_total + v_count;
            END IF;

        WHEN 'acreditacion_norma' THEN
            SELECT COUNT(*)::INTEGER INTO v_count
            FROM public.acreditacion_norma_sector_iaf WHERE id_acreditacion_norma = p_record_id AND deleted_at IS NULL;
            IF v_count > 0 THEN
                v_deps := v_deps || jsonb_build_array(jsonb_build_object('table', 'acreditacion_norma_sector_iaf', 'label', 'Sectores IAF vinculados al alcance', 'count', v_count));
                v_total := v_total + v_count;
            END IF;

        WHEN 'estatus' THEN
            SELECT COUNT(*)::INTEGER INTO v_count
            FROM public.certificado WHERE id_estatus = p_record_id AND deleted_at IS NULL;
            IF v_count > 0 THEN
                v_deps := v_deps || jsonb_build_array(jsonb_build_object('table', 'certificado', 'label', 'Certificados con este estatus', 'count', v_count));
                v_total := v_total + v_count;
            END IF;

            SELECT COUNT(*)::INTEGER INTO v_count
            FROM public.acreditacion_norma WHERE id_estatus = p_record_id AND deleted_at IS NULL;
            IF v_count > 0 THEN
                v_deps := v_deps || jsonb_build_array(jsonb_build_object('table', 'acreditacion_norma', 'label', 'Acreditaciones con este estatus', 'count', v_count));
                v_total := v_total + v_count;
            END IF;

        WHEN 'tipo_auditoria' THEN
            SELECT COUNT(*)::INTEGER INTO v_count
            FROM public.auditoria WHERE id_tipo_auditoria = p_record_id AND deleted_at IS NULL;
            IF v_count > 0 THEN
                v_deps := v_deps || jsonb_build_array(jsonb_build_object('table', 'auditoria', 'label', 'Auditorías con este tipo', 'count', v_count));
                v_total := v_total + v_count;
            END IF;

        WHEN 'metodologia_auditoria' THEN
            SELECT COUNT(*)::INTEGER INTO v_count
            FROM public.auditoria WHERE id_metodologia = p_record_id AND deleted_at IS NULL;
            IF v_count > 0 THEN
                v_deps := v_deps || jsonb_build_array(jsonb_build_object('table', 'auditoria', 'label', 'Auditorías con esta metodología', 'count', v_count));
                v_total := v_total + v_count;
            END IF;

        WHEN 'sitios_por_auditoria' THEN
            SELECT COUNT(*)::INTEGER INTO v_count
            FROM public.turnos_sitio_auditoria WHERE id_sitios_por_auditoria = p_record_id AND deleted_at IS NULL;
            IF v_count > 0 THEN
                v_deps := v_deps || jsonb_build_array(jsonb_build_object('table', 'turnos_sitio_auditoria', 'label', 'Turnos programados en el sitio de auditoría', 'count', v_count));
                v_total := v_total + v_count;
            END IF;

            SELECT COUNT(*)::INTEGER INTO v_count
            FROM public.procesos_sitio_auditoria WHERE id_sitios_por_auditoria = p_record_id AND deleted_at IS NULL;
            IF v_count > 0 THEN
                v_deps := v_deps || jsonb_build_array(jsonb_build_object('table', 'procesos_sitio_auditoria', 'label', 'Procesos programados en el sitio de auditoría', 'count', v_count));
                v_total := v_total + v_count;
            END IF;

            SELECT COUNT(*)::INTEGER INTO v_count
            FROM public.equipo_auditor_sitio WHERE id_sitios_por_auditoria = p_record_id AND deleted_at IS NULL;
            IF v_count > 0 THEN
                v_deps := v_deps || jsonb_build_array(jsonb_build_object('table', 'equipo_auditor_sitio', 'label', 'Auditores asignados al sitio de auditoría', 'count', v_count));
                v_total := v_total + v_count;
            END IF;

        WHEN 'turnos_por_sitio' THEN
            SELECT COUNT(*)::INTEGER INTO v_count
            FROM public.turnos_sitio_auditoria WHERE id_turnos_por_sitio = p_record_id AND deleted_at IS NULL;
            IF v_count > 0 THEN
                v_deps := v_deps || jsonb_build_array(jsonb_build_object('table', 'turnos_sitio_auditoria', 'label', 'Auditorías programadas en este turno del sitio', 'count', v_count));
                v_total := v_total + v_count;
            END IF;

        WHEN 'turnos_sitio_auditoria' THEN
            SELECT COUNT(*)::INTEGER INTO v_count
            FROM public.turnos_proceso_sitio_auditoria WHERE id_turnos_sitio_auditoria = p_record_id AND deleted_at IS NULL;
            IF v_count > 0 THEN
                v_deps := v_deps || jsonb_build_array(jsonb_build_object('table', 'turnos_proceso_sitio_auditoria', 'label', 'Procesos vinculados a este turno de auditoría', 'count', v_count));
                v_total := v_total + v_count;
            END IF;

        WHEN 'procesos_sitio_auditoria' THEN
            SELECT COUNT(*)::INTEGER INTO v_count
            FROM public.turnos_proceso_sitio_auditoria WHERE id_procesos_sitio_auditoria = p_record_id AND deleted_at IS NULL;
            IF v_count > 0 THEN
                v_deps := v_deps || jsonb_build_array(jsonb_build_object('table', 'turnos_proceso_sitio_auditoria', 'label', 'Turnos asignados al proceso en la auditoría', 'count', v_count));
                v_total := v_total + v_count;
            END IF;

            SELECT COUNT(*)::INTEGER INTO v_count
            FROM public.equipo_auditor_proceso_sitio WHERE id_procesos_sitio_auditoria = p_record_id AND deleted_at IS NULL;
            IF v_count > 0 THEN
                v_deps := v_deps || jsonb_build_array(jsonb_build_object('table', 'equipo_auditor_proceso_sitio', 'label', 'Auditores asignados al proceso en la auditoría', 'count', v_count));
                v_total := v_total + v_count;
            END IF;

        WHEN 'auditor' THEN
            SELECT COUNT(*)::INTEGER INTO v_count
            FROM public.equipo_auditor_sitio WHERE id_auditor = p_record_id AND deleted_at IS NULL;
            IF v_count > 0 THEN
                v_deps := v_deps || jsonb_build_array(jsonb_build_object('table', 'equipo_auditor_sitio', 'label', 'Asignaciones del auditor en sitios de auditoría', 'count', v_count));
                v_total := v_total + v_count;
            END IF;

            SELECT COUNT(*)::INTEGER INTO v_count
            FROM public.equipo_auditor_sitio_temporal WHERE id_auditor = p_record_id AND deleted_at IS NULL;
            IF v_count > 0 THEN
                v_deps := v_deps || jsonb_build_array(jsonb_build_object('table', 'equipo_auditor_sitio_temporal', 'label', 'Asignaciones del auditor en sitios temporales', 'count', v_count));
                v_total := v_total + v_count;
            END IF;

            SELECT COUNT(*)::INTEGER INTO v_count
            FROM public.equipo_auditor_proceso_sitio WHERE id_auditor = p_record_id AND deleted_at IS NULL;
            IF v_count > 0 THEN
                v_deps := v_deps || jsonb_build_array(jsonb_build_object('table', 'equipo_auditor_proceso_sitio', 'label', 'Asignaciones del auditor en procesos de auditoría', 'count', v_count));
                v_total := v_total + v_count;
            END IF;

        ELSE
            NULL;
    END CASE;

    RETURN jsonb_build_object(
        'can_archive', v_total = 0,
        'total_active_dependencies', v_total,
        'dependencies', v_deps
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_archive_dependency_summary(TEXT, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_guard_parent_archival()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_summary JSONB;
    v_total INTEGER;
    v_first_label TEXT;
BEGIN
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
        IF TG_TABLE_NAME = 'grupo_empresarial' THEN
            IF EXISTS (SELECT 1 FROM public.organizacion o WHERE o.id_grupo_empresarial = NEW.id AND o.deleted_at IS NULL) THEN
                RAISE EXCEPTION 'No se puede archivar manualmente el conglomerado mientras tenga organizaciones activas vinculadas.'
                    USING ERRCODE = 'P0001';
            END IF;
        ELSIF TG_TABLE_NAME = 'organizacion_version' THEN
            IF EXISTS (
                SELECT 1
                FROM public.organizacion o
                WHERE o.id = NEW.id_organizacion
                  AND o.deleted_at IS NULL
                  AND (
                      OLD.es_version_actual = TRUE
                      OR NOT EXISTS (
                          SELECT 1
                          FROM public.organizacion_version ov2
                          WHERE ov2.id_organizacion = NEW.id_organizacion
                            AND ov2.id <> NEW.id
                            AND ov2.deleted_at IS NULL
                      )
                  )
            ) THEN
                RAISE EXCEPTION 'Operación bloqueada: no se puede archivar la versión activa o única de una organización mientras el contenedor siga activo.'
                    USING ERRCODE = 'P0001';
            END IF;
        ELSIF TG_TABLE_NAME = 'certificado_version' THEN
            IF EXISTS (
                SELECT 1
                FROM public.certificado c
                WHERE c.id = NEW.id_certificado
                  AND c.deleted_at IS NULL
                  AND (
                      OLD.es_version_actual = TRUE
                      OR NOT EXISTS (
                          SELECT 1
                          FROM public.certificado_version cv2
                          WHERE cv2.id_certificado = NEW.id_certificado
                            AND cv2.id <> NEW.id
                            AND cv2.deleted_at IS NULL
                      )
                  )
            ) THEN
                RAISE EXCEPTION 'Operación bloqueada: no se puede archivar la versión activa o única de un certificado mientras el contenedor siga activo.'
                    USING ERRCODE = 'P0001';
            END IF;
        END IF;

        v_summary := public.get_archive_dependency_summary(TG_TABLE_NAME, NEW.id);
        v_total := COALESCE((v_summary->>'total_active_dependencies')::INTEGER, 0);
        IF v_total > 0 THEN
            v_first_label := COALESCE(v_summary->'dependencies'->0->>'label', 'registros hijos activos');
            RAISE EXCEPTION 'Operación bloqueada: no se puede archivar el registro de public.% porque tiene % dependencia(s) activa(s) (ej. %). Archive o desvincule primero los registros dependientes.',
                TG_TABLE_NAME, v_total, v_first_label;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

-- ============================================================================
-- Fase 1.1: Asociación Masiva de Triggers Soft-Delete, Guardia y Audit Log
-- ============================================================================
DO $$
DECLARE
    v_tbl TEXT;
    v_core_tables TEXT[] := ARRAY[
        'norma', 'requisito', 'sector_iaf', 'subsector_iaf',
        'organismo_acreditacion', 'acreditacion_norma',
        'estatus', 'tipo_auditoria', 'metodologia_auditoria', 'auditor',
        'grupo_empresarial', 'organizacion', 'organizacion_version', 'certificado', 'certificado_version', 'alcance', 'fecha_certificado', 'contacto_certificado',
        'sitio', 'proceso', 'turno',
        'vinculo', 'programa_auditoria', 'auditoria', 'auditoria_sitio_temporal', 'hallazgo'
    ];
    v_child_tables TEXT[] := ARRAY[
        'requisito_traduccion',
        'acreditacion_norma_sector_iaf',
        'alcance_certificado_compartido',
        'requisitos_no_aplicables_certificado', 'turnos_por_sitio', 'procesos_por_sitio',
        'vinculo_certificado', 'auditoria_fecha', 'configuracion_alerta_auditoria',
        'comentarios_por_auditoria', 'sitios_por_auditoria',
        'auditoria_sitio_temporal_certificado',
        'turnos_sitio_auditoria', 'procesos_sitio_auditoria', 'turnos_proceso_sitio_auditoria',
        'equipo_auditor_sitio', 'equipo_auditor_sitio_temporal', 'equipo_auditor_proceso_sitio',
        'telefono_contacto_certificado', 'email_contacto_certificado',
        'contacto_certificado_compartido', 'turno_certificado_compartido',
        'proceso_certificado_compartido', 'sitio_certificado_compartido'
    ];
    v_guarded_parents TEXT[] := ARRAY[
        'grupo_empresarial', 'organizacion', 'organizacion_version', 'certificado', 'certificado_version', 'alcance', 'contacto_certificado', 'norma', 'requisito',
        'sector_iaf', 'subsector_iaf', 'organismo_acreditacion', 'acreditacion_norma',
        'sitio', 'proceso', 'procesos_por_sitio',
        'turno', 'vinculo', 'programa_auditoria', 'auditoria', 'auditoria_sitio_temporal', 'auditor', 'estatus', 'tipo_auditoria',
        'metodologia_auditoria', 'sitios_por_auditoria',
        'turnos_por_sitio', 'turnos_sitio_auditoria', 'procesos_sitio_auditoria'
    ];
    v_extra_audit_tables TEXT[] := ARRAY[
        'organizacion_version', 'certificado_version', 'alcance', 'alcance_certificado_compartido',
        'requisito', 'requisito_traduccion', 'sector_iaf', 'acreditacion_norma_sector_iaf',
        'estatus', 'tipo_auditoria',
        'metodologia_auditoria', 'auditor',
        'turnos_por_sitio', 'procesos_por_sitio',
        'vinculo_certificado', 'programa_auditoria', 'auditoria_fecha', 'configuracion_alerta_auditoria',
        'comentarios_por_auditoria',
        'sitios_por_auditoria', 'auditoria_sitio_temporal', 'auditoria_sitio_temporal_certificado', 'turnos_sitio_auditoria',
        'procesos_sitio_auditoria', 'turnos_proceso_sitio_auditoria',
        'equipo_auditor_sitio', 'equipo_auditor_sitio_temporal', 'equipo_auditor_proceso_sitio',
        'fecha_certificado', 'contacto_certificado',
        'telefono_contacto_certificado', 'email_contacto_certificado',
        'contacto_certificado_compartido', 'turno_certificado_compartido',
        'proceso_certificado_compartido', 'sitio_certificado_compartido'
    ];
BEGIN
    FOREACH v_tbl IN ARRAY v_core_tables LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_prevent_hard_delete_%I ON public.%I', v_tbl, v_tbl);
        EXECUTE format(
            'CREATE TRIGGER trg_prevent_hard_delete_%I BEFORE DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.fn_prevent_hard_delete()',
            v_tbl, v_tbl
        );

        EXECUTE format('DROP TRIGGER IF EXISTS trg_sync_soft_delete_%I ON public.%I', v_tbl, v_tbl);
        EXECUTE format(
            'CREATE TRIGGER trg_sync_soft_delete_%I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.fn_sync_soft_delete_metadata()',
            v_tbl, v_tbl
        );
    END LOOP;

    FOREACH v_tbl IN ARRAY v_child_tables LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_prevent_hard_delete_%I ON public.%I', v_tbl, v_tbl);
        EXECUTE format(
            'CREATE TRIGGER trg_prevent_hard_delete_%I BEFORE DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.fn_prevent_hard_delete()',
            v_tbl, v_tbl
        );

        EXECUTE format('DROP TRIGGER IF EXISTS trg_sync_soft_delete_%I ON public.%I', v_tbl, v_tbl);
        EXECUTE format(
            'CREATE TRIGGER trg_sync_soft_delete_%I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.fn_sync_soft_delete_child_metadata()',
            v_tbl, v_tbl
        );
    END LOOP;

    DROP TRIGGER IF EXISTS trg_sync_soft_delete_client_organization_access ON public.client_organization_access;
    CREATE TRIGGER trg_sync_soft_delete_client_organization_access
        BEFORE UPDATE ON public.client_organization_access
        FOR EACH ROW EXECUTE FUNCTION public.fn_sync_soft_delete_child_metadata();

    FOREACH v_tbl IN ARRAY v_guarded_parents LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_guard_archival_%I ON public.%I', v_tbl, v_tbl);
        EXECUTE format(
            'CREATE TRIGGER trg_guard_archival_%I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.fn_guard_parent_archival()',
            v_tbl, v_tbl
        );
    END LOOP;

    FOREACH v_tbl IN ARRAY v_extra_audit_tables LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS audit_%I_trigger ON public.%I', v_tbl, v_tbl);
        EXECUTE format(
            'CREATE TRIGGER audit_%I_trigger AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func()',
            v_tbl, v_tbl
        );
    END LOOP;
END $$;

-- ============================================================================
-- Step 1.2: Guardia de Exclusión en requisitos_por_proceso y Smart-Mutation
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_guard_req_proceso_against_exclusion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_proc_owner_cert_id UUID;
    v_proc_owner_cert_ver_id UUID;
    v_cert_norma UUID;
    v_req_norma UUID;
    v_req_path LTREE;
    v_blocking_code VARCHAR;
BEGIN
    SELECT p.id_certificado, p.id_certificado_version
      INTO v_proc_owner_cert_id, v_proc_owner_cert_ver_id
    FROM public.proceso p
    WHERE p.id = NEW.id_proceso
      AND p.deleted_at IS NULL;

    IF v_proc_owner_cert_id IS NULL THEN
        RAISE EXCEPTION 'Operación bloqueada: el proceso seleccionado no existe o está archivado.'
            USING ERRCODE = 'P0001';
    END IF;

    IF NEW.id_certificado IS NULL THEN
        NEW.id_certificado := v_proc_owner_cert_id;
    END IF;

    IF NEW.id_certificado_version IS NULL THEN
        SELECT cv.id INTO NEW.id_certificado_version
        FROM public.certificado_version cv
        WHERE cv.id_certificado = NEW.id_certificado
          AND cv.deleted_at IS NULL
        ORDER BY cv.es_version_actual DESC, cv.version_numero DESC
        LIMIT 1;
    END IF;

    SELECT c.id_norma
      INTO v_cert_norma
    FROM public.certificado c
    WHERE c.id = NEW.id_certificado
      AND c.deleted_at IS NULL;

    IF v_cert_norma IS NULL THEN
        RAISE EXCEPTION 'Operación bloqueada: el certificado asociado no existe o está archivado.'
            USING ERRCODE = 'P0001';
    END IF;

    IF NOT public.proceso_pertenece_a_certificado_version(NEW.id_proceso, NEW.id_certificado_version) THEN
        RAISE EXCEPTION 'Operación bloqueada: el proceso no pertenece ni está compartido activamente con la versión del certificado indicada.'
            USING ERRCODE = 'P0001';
    END IF;

    SELECT r.id_norma, r.ruta_materializada
      INTO v_req_norma, v_req_path
    FROM public.requisito r
    WHERE r.id = NEW.id_requisito
      AND r.deleted_at IS NULL;

    IF v_req_norma IS NULL THEN
        RAISE EXCEPTION 'Operación bloqueada: la cláusula seleccionada no existe o está archivada.'
            USING ERRCODE = 'P0001';
    END IF;

    IF v_req_norma IS DISTINCT FROM v_cert_norma THEN
        RAISE EXCEPTION 'Violación de Integridad Normativa: la cláusula pertenece a una norma distinta a la del certificado.'
            USING ERRCODE = 'P0001';
    END IF;

    SELECT r_excl.codigo
      INTO v_blocking_code
    FROM public.requisitos_no_aplicables_certificado rna
    JOIN public.requisito r_excl ON r_excl.id = rna.id_requisito
    WHERE rna.id_certificado_version = NEW.id_certificado_version
      AND rna.deleted_at IS NULL
      AND r_excl.deleted_at IS NULL
      AND r_excl.id_norma = v_cert_norma
      AND (
          r_excl.id = NEW.id_requisito
          OR (
              v_req_path IS NOT NULL
              AND r_excl.ruta_materializada IS NOT NULL
              AND v_req_path <@ r_excl.ruta_materializada
          )
      )
    LIMIT 1;

    IF v_blocking_code IS NOT NULL THEN
        RAISE EXCEPTION 'REQ_EXCLUDED_BY_ISO43: La cláusula está excluida como No Aplicable bajo la cláusula % en este certificado.', v_blocking_code
            USING ERRCODE = 'P0001';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_req_proceso_against_exclusion ON public.requisitos_por_proceso;
CREATE TRIGGER trg_guard_req_proceso_against_exclusion
    BEFORE INSERT OR UPDATE ON public.requisitos_por_proceso
    FOR EACH ROW EXECUTE FUNCTION public.fn_guard_req_proceso_against_exclusion();

-- Invariante Smart Mutation:
-- C_eff(K) = (Union Subtree(c)) \ E_eff(K).
-- Si un proceso cubre un ancestro (ej. '8') y se excluye un hijo ('8.3'),
-- se podan únicamente '8.3' y sus descendientes (<@) dentro de la versión del certificado afectado (NEW.id_certificado_version),
-- preservando '8' y manteniendo intactos los mapeos de certificados hermanos que comparten el proceso.
CREATE OR REPLACE FUNCTION public.fn_smart_prune_process_clauses_on_exclusion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_cert_norma UUID;
    v_excl_norma UUID;
    v_excl_path LTREE;
BEGIN
    IF NEW.deleted_at IS NOT NULL THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE'
       AND OLD.deleted_at IS NULL
       AND OLD.id_certificado IS NOT DISTINCT FROM NEW.id_certificado
       AND OLD.id_certificado_version IS NOT DISTINCT FROM NEW.id_certificado_version
       AND OLD.id_requisito IS NOT DISTINCT FROM NEW.id_requisito THEN
        RETURN NEW;
    END IF;

    SELECT c.id_norma INTO v_cert_norma
    FROM public.certificado c
    WHERE c.id = NEW.id_certificado
      AND c.deleted_at IS NULL;

    SELECT r.id_norma, r.ruta_materializada INTO v_excl_norma, v_excl_path
    FROM public.requisito r
    WHERE r.id = NEW.id_requisito
      AND r.deleted_at IS NULL;

    IF v_cert_norma IS NULL OR v_excl_norma IS NULL THEN
        RAISE EXCEPTION 'Operación bloqueada: el certificado o la cláusula excluida no existe o está archivada.'
            USING ERRCODE = 'P0001';
    END IF;

    IF v_excl_norma IS DISTINCT FROM v_cert_norma THEN
        RAISE EXCEPTION 'Violación de Integridad Normativa: la cláusula excluida no pertenece a la norma del certificado.'
            USING ERRCODE = 'P0001';
    END IF;

    DELETE FROM public.requisitos_por_proceso rpp
    USING public.proceso p, public.requisito r_link
    WHERE rpp.id_proceso = p.id
      AND rpp.id_requisito = r_link.id
      AND rpp.id_certificado_version = NEW.id_certificado_version
      AND public.proceso_pertenece_a_certificado_version(rpp.id_proceso, NEW.id_certificado_version)
      AND p.deleted_at IS NULL
      AND r_link.id_norma = v_excl_norma
      AND (
          r_link.id = NEW.id_requisito
          OR (
              r_link.ruta_materializada IS NOT NULL
              AND v_excl_path IS NOT NULL
              AND r_link.ruta_materializada <@ v_excl_path
          )
      );

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_smart_prune_process_clauses_on_exclusion ON public.requisitos_no_aplicables_certificado;
CREATE TRIGGER trg_smart_prune_process_clauses_on_exclusion
    AFTER INSERT OR UPDATE OF id_certificado, id_certificado_version, id_requisito, deleted_at ON public.requisitos_no_aplicables_certificado
    FOR EACH ROW EXECUTE FUNCTION public.fn_smart_prune_process_clauses_on_exclusion();

-- ============================================================================
-- Step 4.1: Backfill idempotente de Sitio 0 (HQ) en auditorías activas sin sitios
-- ============================================================================
INSERT INTO public.sitios_por_auditoria (
    id_auditoria,
    id_sitio,
    tiempo_auditoria,
    modalidad_evaluacion
)
SELECT
    a.id,
    s.id,
    0,
    'Presencial'
FROM public.auditoria a
JOIN LATERAL (
    SELECT s0.id
    FROM public.sitio s0
    WHERE s0.id_certificado_version = a.id_certificado_version
      AND s0.numero_sitio = 0
      AND s0.deleted_at IS NULL
    ORDER BY s0.created_at ASC, s0.id ASC
    LIMIT 1
) s ON TRUE
WHERE a.deleted_at IS NULL
  AND NOT EXISTS (
      SELECT 1
      FROM public.sitios_por_auditoria sa
      WHERE sa.id_auditoria = a.id
        AND sa.deleted_at IS NULL
  );

-- ============================================================================
-- Step 10.1 + Step 1.1: Cálculo Automático de Plazos NC (+15d Plan / +45d Cierre) y Revisión Simplificada
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_auto_calcular_fechas_hallazgo()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_last_real DATE;
    v_dias_plan INTEGER := 15;
    v_dias_cierre INTEGER := 45;
BEGIN
    IF NEW.deleted_at IS NOT NULL THEN
        RETURN NEW;
    END IF;

    SELECT COALESCE(MAX(af.fecha_fin), MAX(af.fecha_inicio))
      INTO v_last_real
    FROM public.auditoria_fecha af
    WHERE af.id_auditoria = NEW.id_auditoria
      AND af.tipo_fecha = 'REAL'
      AND af.deleted_at IS NULL;

    IF v_last_real IS NULL THEN
        SELECT COALESCE(MAX(af.fecha_fin), MAX(af.fecha_inicio), CURRENT_DATE)
          INTO v_last_real
        FROM public.auditoria_fecha af
        WHERE af.id_auditoria = NEW.id_auditoria
          AND af.deleted_at IS NULL;
    END IF;

    SELECT COALESCE(c.dias_limite_plan_nc, c.dias_limite_plan_accion, 15),
           COALESCE(c.dias_limite_cierre_nc, 45)
      INTO v_dias_plan, v_dias_cierre
    FROM public.configuracion_alerta_auditoria c
    WHERE c.clave = 'DEFAULT' AND c.deleted_at IS NULL
    LIMIT 1;

    IF NEW.tipo IN ('NC_MAYOR', 'NC_MENOR') THEN
        IF NEW.fecha_limite_plan IS NULL THEN
            NEW.fecha_limite_plan := v_last_real + COALESCE(v_dias_plan, 15);
        END IF;
        IF NEW.fecha_limite_cierre IS NULL THEN
            NEW.fecha_limite_cierre := v_last_real + COALESCE(v_dias_cierre, 45);
        END IF;
    END IF;

    IF NEW.cerrado = TRUE AND NEW.fecha_cierre_real IS NULL THEN
        NEW.fecha_cierre_real := CURRENT_DATE;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_calcular_fechas_hallazgo ON public.hallazgo;
CREATE TRIGGER trg_auto_calcular_fechas_hallazgo
    BEFORE INSERT OR UPDATE OF cerrado ON public.hallazgo
    FOR EACH ROW EXECUTE FUNCTION public.fn_auto_calcular_fechas_hallazgo();

-- Sincronización dinámica de vencimientos NC al registrar/editar/archivar fechas REALES (sin generar eventos de calendario)
CREATE OR REPLACE FUNCTION public.fn_sincronizar_plazo_nc_auditoria()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_auditoria_id UUID;
    v_last_real DATE;
    v_dias_plan INTEGER := 15;
    v_dias_cierre INTEGER := 45;
BEGIN
    v_auditoria_id := COALESCE(NEW.id_auditoria, OLD.id_auditoria);
    IF v_auditoria_id IS NULL THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    IF COALESCE(NEW.tipo_fecha, '') <> 'REAL' AND COALESCE(OLD.tipo_fecha, '') <> 'REAL' THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    SELECT COALESCE(MAX(af.fecha_fin), MAX(af.fecha_inicio))
      INTO v_last_real
    FROM public.auditoria_fecha af
    WHERE af.id_auditoria = v_auditoria_id
      AND af.tipo_fecha = 'REAL'
      AND af.deleted_at IS NULL;

    IF v_last_real IS NULL THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    SELECT COALESCE(c.dias_limite_plan_nc, c.dias_limite_plan_accion, 15),
           COALESCE(c.dias_limite_cierre_nc, 45)
      INTO v_dias_plan, v_dias_cierre
    FROM public.configuracion_alerta_auditoria c
    WHERE c.clave = 'DEFAULT' AND c.deleted_at IS NULL
    LIMIT 1;

    UPDATE public.hallazgo h
    SET fecha_limite_plan = v_last_real + COALESCE(v_dias_plan, 15),
        fecha_limite_cierre = v_last_real + COALESCE(v_dias_cierre, 45),
        updated_at = NOW()
    WHERE h.id_auditoria = v_auditoria_id
      AND h.deleted_at IS NULL
      AND h.cerrado = FALSE
      AND h.tipo IN ('NC_MAYOR', 'NC_MENOR')
      AND (
          h.fecha_limite_plan IS DISTINCT FROM (v_last_real + COALESCE(v_dias_plan, 15))
          OR h.fecha_limite_cierre IS DISTINCT FROM (v_last_real + COALESCE(v_dias_cierre, 45))
      );

    RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sincronizar_plazo_nc_auditoria ON public.auditoria_fecha;
CREATE TRIGGER trg_sincronizar_plazo_nc_auditoria
    AFTER INSERT OR UPDATE OF tipo_fecha, fecha_inicio, fecha_fin, deleted_at ON public.auditoria_fecha
    FOR EACH ROW EXECUTE FUNCTION public.fn_sincronizar_plazo_nc_auditoria();

CREATE OR REPLACE FUNCTION public.fn_resincronizar_nc_al_cambiar_config()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_dias_plan INTEGER := 15;
    v_dias_cierre INTEGER := 45;
BEGIN
    IF NEW.deleted_at IS NOT NULL OR NEW.clave <> 'DEFAULT' THEN
        RETURN NEW;
    END IF;

    v_dias_plan := COALESCE(NEW.dias_limite_plan_nc, NEW.dias_limite_plan_accion, 15);
    v_dias_cierre := COALESCE(NEW.dias_limite_cierre_nc, 45);

    UPDATE public.hallazgo h
    SET fecha_limite_plan = af_agg.last_real + v_dias_plan,
        fecha_limite_cierre = af_agg.last_real + v_dias_cierre,
        updated_at = NOW()
    FROM (
        SELECT af.id_auditoria,
               COALESCE(MAX(af.fecha_fin), MAX(af.fecha_inicio)) AS last_real
        FROM public.auditoria_fecha af
        WHERE af.tipo_fecha = 'REAL'
          AND af.deleted_at IS NULL
        GROUP BY af.id_auditoria
    ) af_agg
    WHERE h.id_auditoria = af_agg.id_auditoria
      AND h.deleted_at IS NULL
      AND h.cerrado = FALSE
      AND h.tipo IN ('NC_MAYOR', 'NC_MENOR')
      AND (
          h.fecha_limite_plan IS DISTINCT FROM (af_agg.last_real + v_dias_plan)
          OR h.fecha_limite_cierre IS DISTINCT FROM (af_agg.last_real + v_dias_cierre)
      );

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_resincronizar_nc_al_cambiar_config ON public.configuracion_alerta_auditoria;
CREATE TRIGGER trg_resincronizar_nc_al_cambiar_config
    AFTER INSERT OR UPDATE OF dias_limite_plan_nc, dias_limite_plan_accion, dias_limite_cierre_nc, deleted_at ON public.configuracion_alerta_auditoria
    FOR EACH ROW EXECUTE FUNCTION public.fn_resincronizar_nc_al_cambiar_config();

CREATE OR REPLACE FUNCTION public.fn_validar_cierre_auditoria()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NEW.deleted_at IS NOT NULL THEN
        RETURN NEW;
    END IF;

    IF NEW.estado_ciclo = 'Cerrada' THEN
        IF NEW.fecha_cierre_auditoria IS NULL THEN
            RAISE EXCEPTION 'Compuerta Resultado: Debe registrar la Fecha de Cierre de Auditoría antes de marcarla como Cerrada.'
                USING ERRCODE = 'P0001';
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM public.auditoria_fecha af
            WHERE af.id_auditoria = NEW.id
              AND af.tipo_fecha = 'REAL'
              AND af.deleted_at IS NULL
        ) THEN
            RAISE EXCEPTION 'Compuerta Resultado: Debe registrar al menos una fecha REAL de ejecución antes de cerrar la auditoría.'
                USING ERRCODE = 'P0001';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validar_cierre_auditoria ON public.auditoria;
CREATE TRIGGER trg_validar_cierre_auditoria
    BEFORE INSERT OR UPDATE OF estado_ciclo, fecha_cierre_auditoria ON public.auditoria
    FOR EACH ROW EXECUTE FUNCTION public.fn_validar_cierre_auditoria();

-- Trigger de Revisión Simplificada (Step 1.1): guardar fecha_revision + resumen_revision sin bloqueos rígidos
CREATE OR REPLACE FUNCTION public.fn_validar_revision_auditoria()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_min_real_date DATE;
    v_actor_id UUID;
BEGIN
    IF NEW.deleted_at IS NOT NULL THEN
        RETURN NEW;
    END IF;

    IF NEW.resumen_revision IS NOT NULL THEN
        NEW.resumen_revision := NULLIF(TRIM(NEW.resumen_revision), '');
    END IF;

    IF NEW.fecha_revision IS NOT NULL THEN
        NEW.revisado := TRUE;
    END IF;

    IF NEW.revisado = TRUE THEN
        IF NEW.fecha_revision IS NULL THEN
            NEW.fecha_revision := CURRENT_DATE;
        END IF;

        v_actor_id := COALESCE(NEW.usuario_revisor_id, NEW.revisado_por, auth.uid());
        IF v_actor_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = v_actor_id
              AND p.role IN ('ADMIN', 'WORKER')
              AND p.status = 'APPROVED'
        ) THEN
            NEW.usuario_revisor_id := v_actor_id;
            NEW.revisado_por := COALESCE(NEW.revisado_por, v_actor_id);
        ELSIF NEW.usuario_revisor_id IS NULL AND NEW.revisado_por IS NOT NULL THEN
            NEW.usuario_revisor_id := NEW.revisado_por;
        ELSIF NEW.revisado_por IS NULL AND NEW.usuario_revisor_id IS NOT NULL THEN
            NEW.revisado_por := NEW.usuario_revisor_id;
        END IF;

        SELECT MIN(COALESCE(af.fecha_inicio, af.fecha_fin))
          INTO v_min_real_date
        FROM public.auditoria_fecha af
        WHERE af.id_auditoria = NEW.id
          AND af.tipo_fecha = 'REAL'
          AND af.deleted_at IS NULL;

        IF v_min_real_date IS NOT NULL AND NEW.fecha_revision < v_min_real_date THEN
            RAISE EXCEPTION 'La fecha de revisión no puede ser anterior a la primera fecha real de ejecución.'
                USING ERRCODE = 'P0001';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validar_revision_auditoria ON public.auditoria;
CREATE TRIGGER trg_validar_revision_auditoria
    BEFORE INSERT OR UPDATE OF revisado, fecha_revision, resumen_revision, usuario_revisor_id, revisado_por, documentacion_completa, estado_ciclo ON public.auditoria
    FOR EACH ROW EXECUTE FUNCTION public.fn_validar_revision_auditoria();

-- ============================================================================
-- Step 1.1 & Step 1.2: Pertenencia y Validación de Contacto y Turno (por versión)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.contacto_pertenece_a_certificado_version(
    p_id_contacto UUID,
    p_id_certificado_version UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.contacto_certificado cc
        WHERE cc.id = p_id_contacto
          AND cc.deleted_at IS NULL
          AND (
              cc.id_certificado_version = p_id_certificado_version
              OR EXISTS (
                  SELECT 1
                  FROM public.contacto_certificado_compartido ccc
                  WHERE ccc.id_contacto = cc.id
                    AND ccc.id_certificado_version = p_id_certificado_version
                    AND ccc.deleted_at IS NULL
              )
          )
    );
$$;

CREATE OR REPLACE FUNCTION public.contacto_pertenece_a_certificado(
    p_id_contacto UUID,
    p_id_certificado UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT COALESCE((
        SELECT public.contacto_pertenece_a_certificado_version(p_id_contacto, cv.id)
        FROM public.certificado_version cv
        WHERE cv.id_certificado = p_id_certificado
          AND cv.deleted_at IS NULL
        ORDER BY cv.es_version_actual DESC, cv.version_numero DESC
        LIMIT 1
    ), FALSE);
$$;

CREATE OR REPLACE FUNCTION public.turno_pertenece_a_certificado_version(
    p_id_turno UUID,
    p_id_certificado_version UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.turno t
        WHERE t.id = p_id_turno
          AND t.deleted_at IS NULL
          AND (
              EXISTS (
                  SELECT 1
                  FROM public.turno_certificado_compartido tcc
                  WHERE tcc.id_turno = t.id
                    AND tcc.id_certificado_version = p_id_certificado_version
                    AND tcc.deleted_at IS NULL
              )
              OR EXISTS (
                  SELECT 1
                  FROM public.turnos_por_sitio tps
                  JOIN public.sitio s ON s.id = tps.id_sitio
                  WHERE tps.id_turno = t.id
                    AND tps.deleted_at IS NULL
                    AND s.id_certificado_version = p_id_certificado_version
                    AND s.deleted_at IS NULL
              )
          )
    );
$$;

CREATE OR REPLACE FUNCTION public.turno_pertenece_a_certificado(
    p_id_turno UUID,
    p_id_certificado UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT COALESCE((
        SELECT public.turno_pertenece_a_certificado_version(p_id_turno, cv.id)
        FROM public.certificado_version cv
        WHERE cv.id_certificado = p_id_certificado
          AND cv.deleted_at IS NULL
        ORDER BY cv.es_version_actual DESC, cv.version_numero DESC
        LIMIT 1
    ), FALSE);
$$;

REVOKE ALL ON FUNCTION public.contacto_pertenece_a_certificado_version(UUID, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.contacto_pertenece_a_certificado_version(UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.contacto_pertenece_a_certificado_version(UUID, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.contacto_pertenece_a_certificado(UUID, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.contacto_pertenece_a_certificado(UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.contacto_pertenece_a_certificado(UUID, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.turno_pertenece_a_certificado_version(UUID, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.turno_pertenece_a_certificado_version(UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.turno_pertenece_a_certificado_version(UUID, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.turno_pertenece_a_certificado(UUID, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.turno_pertenece_a_certificado(UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.turno_pertenece_a_certificado(UUID, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_validar_contacto_compartido()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_owner_cert_id UUID;
    v_contact_nombre VARCHAR(180);
    v_contact_deleted TIMESTAMPTZ;
    v_owner_cert_deleted TIMESTAMPTZ;
    v_owner_org_deleted TIMESTAMPTZ;
    v_owner_grupo_id UUID;
    v_owner_grupo_deleted TIMESTAMPTZ;
    v_target_cert_deleted TIMESTAMPTZ;
    v_target_org_deleted TIMESTAMPTZ;
    v_target_grupo_id UUID;
    v_target_grupo_deleted TIMESTAMPTZ;
BEGIN
    IF NEW.deleted_at IS NOT NULL THEN
        RETURN NEW;
    END IF;

    SELECT cc.id_certificado,
           cc.nombre,
           cc.deleted_at,
           c_owner.deleted_at,
           o_owner.deleted_at,
           o_owner.id_grupo_empresarial,
           g_owner.deleted_at
      INTO v_owner_cert_id,
           v_contact_nombre,
           v_contact_deleted,
           v_owner_cert_deleted,
           v_owner_org_deleted,
           v_owner_grupo_id,
           v_owner_grupo_deleted
    FROM public.contacto_certificado cc
    JOIN public.certificado c_owner ON c_owner.id = cc.id_certificado
    JOIN public.organizacion o_owner ON o_owner.id = c_owner.id_organizacion
    LEFT JOIN public.grupo_empresarial g_owner ON g_owner.id = o_owner.id_grupo_empresarial
    WHERE cc.id = NEW.id_contacto;

    IF NOT FOUND OR v_contact_deleted IS NOT NULL THEN
        RAISE EXCEPTION 'Operación bloqueada: el contacto seleccionado no existe o está archivado.'
            USING ERRCODE = 'P0001';
    END IF;

    IF v_owner_cert_deleted IS NOT NULL OR v_owner_org_deleted IS NOT NULL THEN
        RAISE EXCEPTION 'Operación bloqueada: el certificado u organización origen del contacto está archivado.'
            USING ERRCODE = 'P0001';
    END IF;

    IF NEW.id_certificado = v_owner_cert_id THEN
        RAISE EXCEPTION 'Operación bloqueada: no puede compartir un contacto con el mismo certificado al que ya pertenece.'
            USING ERRCODE = 'P0001';
    END IF;

    SELECT c_target.deleted_at,
           o_target.deleted_at,
           o_target.id_grupo_empresarial,
           g_target.deleted_at
      INTO v_target_cert_deleted,
           v_target_org_deleted,
           v_target_grupo_id,
           v_target_grupo_deleted
    FROM public.certificado c_target
    JOIN public.organizacion o_target ON o_target.id = c_target.id_organizacion
    LEFT JOIN public.grupo_empresarial g_target ON g_target.id = o_target.id_grupo_empresarial
    WHERE c_target.id = NEW.id_certificado;

    IF NOT FOUND OR v_target_cert_deleted IS NOT NULL OR v_target_org_deleted IS NOT NULL THEN
        RAISE EXCEPTION 'Operación bloqueada: el certificado destino o su organización no existe o está archivada.'
            USING ERRCODE = 'P0001';
    END IF;

    IF v_owner_grupo_id IS NULL
       OR v_owner_grupo_deleted IS NOT NULL
       OR v_target_grupo_id IS NULL
       OR v_target_grupo_deleted IS NOT NULL
       OR v_owner_grupo_id IS DISTINCT FROM v_target_grupo_id THEN
        RAISE EXCEPTION 'Violación de Conglomerado: solo se permite compartir contactos entre certificados pertenecientes al mismo conglomerado activo.'
            USING ERRCODE = 'P0001';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.contacto_certificado cc_own
        WHERE cc_own.id_certificado_version = NEW.id_certificado_version
          AND cc_own.deleted_at IS NULL
          AND cc_own.id <> NEW.id_contacto
          AND LOWER(TRIM(cc_own.nombre)) = LOWER(TRIM(v_contact_nombre))
    ) OR EXISTS (
        SELECT 1
        FROM public.contacto_certificado_compartido ccc_other
        JOIN public.contacto_certificado cc_shared ON cc_shared.id = ccc_other.id_contacto
        WHERE ccc_other.id_certificado_version = NEW.id_certificado_version
          AND ccc_other.deleted_at IS NULL
          AND ccc_other.id IS DISTINCT FROM NEW.id
          AND cc_shared.deleted_at IS NULL
          AND cc_shared.id <> NEW.id_contacto
          AND LOWER(TRIM(cc_shared.nombre)) = LOWER(TRIM(v_contact_nombre))
    ) THEN
        RAISE EXCEPTION 'Conflicto de Contacto: ya existe un contacto activo llamado "%" en el certificado destino.',
            TRIM(v_contact_nombre)
            USING ERRCODE = 'P0001';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validar_contacto_compartido ON public.contacto_certificado_compartido;
CREATE TRIGGER trg_validar_contacto_compartido
    BEFORE INSERT OR UPDATE OF id_contacto, id_certificado, id_certificado_version, deleted_at ON public.contacto_certificado_compartido
    FOR EACH ROW EXECUTE FUNCTION public.fn_validar_contacto_compartido();

CREATE OR REPLACE FUNCTION public.fn_validar_turno_compartido()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_turno_deleted TIMESTAMPTZ;
    v_target_cert_deleted TIMESTAMPTZ;
    v_target_org_deleted TIMESTAMPTZ;
    v_target_grupo_id UUID;
    v_target_grupo_deleted TIMESTAMPTZ;
    v_origen_cert_deleted TIMESTAMPTZ;
    v_origen_org_deleted TIMESTAMPTZ;
    v_origen_grupo_id UUID;
    v_origen_grupo_deleted TIMESTAMPTZ;
BEGIN
    IF NEW.deleted_at IS NOT NULL THEN
        RETURN NEW;
    END IF;

    SELECT t.deleted_at
      INTO v_turno_deleted
    FROM public.turno t
    WHERE t.id = NEW.id_turno;

    IF NOT FOUND OR v_turno_deleted IS NOT NULL THEN
        RAISE EXCEPTION 'Operación bloqueada: el turno seleccionado no existe o está archivado.'
            USING ERRCODE = 'P0001';
    END IF;

    SELECT c_target.deleted_at,
           o_target.deleted_at,
           o_target.id_grupo_empresarial,
           g_target.deleted_at
      INTO v_target_cert_deleted,
           v_target_org_deleted,
           v_target_grupo_id,
           v_target_grupo_deleted
    FROM public.certificado c_target
    JOIN public.organizacion o_target ON o_target.id = c_target.id_organizacion
    LEFT JOIN public.grupo_empresarial g_target ON g_target.id = o_target.id_grupo_empresarial
    WHERE c_target.id = NEW.id_certificado;

    IF NOT FOUND OR v_target_cert_deleted IS NOT NULL OR v_target_org_deleted IS NOT NULL THEN
        RAISE EXCEPTION 'Operación bloqueada: el certificado destino o su organización no existe o está archivada.'
            USING ERRCODE = 'P0001';
    END IF;

    IF v_target_grupo_id IS NULL OR v_target_grupo_deleted IS NOT NULL THEN
        RAISE EXCEPTION 'Violación de Conglomerado: el certificado destino debe pertenecer a un conglomerado activo.'
            USING ERRCODE = 'P0001';
    END IF;

    IF NEW.id_certificado_origen IS NOT NULL THEN
        IF NEW.id_certificado = NEW.id_certificado_origen THEN
            RAISE EXCEPTION 'Operación bloqueada: no puede compartir un turno hacia el mismo certificado origen.'
                USING ERRCODE = 'P0001';
        END IF;

        SELECT c_orig.deleted_at,
               o_orig.deleted_at,
               o_orig.id_grupo_empresarial,
               g_orig.deleted_at
          INTO v_origen_cert_deleted,
               v_origen_org_deleted,
               v_origen_grupo_id,
               v_origen_grupo_deleted
        FROM public.certificado c_orig
        JOIN public.organizacion o_orig ON o_orig.id = c_orig.id_organizacion
        LEFT JOIN public.grupo_empresarial g_orig ON g_orig.id = o_orig.id_grupo_empresarial
        WHERE c_orig.id = NEW.id_certificado_origen;

        IF NOT FOUND OR v_origen_cert_deleted IS NOT NULL OR v_origen_org_deleted IS NOT NULL THEN
            RAISE EXCEPTION 'Operación bloqueada: el certificado origen o su organización no existe o está archivada.'
                USING ERRCODE = 'P0001';
        END IF;

        IF v_origen_grupo_id IS NULL
           OR v_origen_grupo_deleted IS NOT NULL
           OR v_origen_grupo_id IS DISTINCT FROM v_target_grupo_id THEN
            RAISE EXCEPTION 'Violación de Conglomerado: solo se permite compartir turnos entre certificados pertenecientes al mismo conglomerado activo.'
                USING ERRCODE = 'P0001';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validar_turno_compartido ON public.turno_certificado_compartido;
CREATE TRIGGER trg_validar_turno_compartido
    BEFORE INSERT OR UPDATE OF id_turno, id_certificado, id_certificado_version, id_certificado_origen, deleted_at ON public.turno_certificado_compartido
    FOR EACH ROW EXECUTE FUNCTION public.fn_validar_turno_compartido();

-- ============================================================================
-- Step 1.2: Pertenencia y Validación de Proceso (por versión)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.proceso_pertenece_a_certificado_version(
    p_id_proceso UUID,
    p_id_certificado_version UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.proceso p
        WHERE p.id = p_id_proceso
          AND p.deleted_at IS NULL
          AND (
              p.id_certificado_version = p_id_certificado_version
              OR EXISTS (
                  SELECT 1
                  FROM public.proceso_certificado_compartido pcc
                  WHERE pcc.id_proceso = p.id
                    AND pcc.id_certificado_version = p_id_certificado_version
                    AND pcc.deleted_at IS NULL
              )
          )
    );
$$;

CREATE OR REPLACE FUNCTION public.proceso_pertenece_a_certificado(
    p_id_proceso UUID,
    p_id_certificado UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT COALESCE((
        SELECT public.proceso_pertenece_a_certificado_version(p_id_proceso, cv.id)
        FROM public.certificado_version cv
        WHERE cv.id_certificado = p_id_certificado
          AND cv.deleted_at IS NULL
        ORDER BY cv.es_version_actual DESC, cv.version_numero DESC
        LIMIT 1
    ), FALSE);
$$;

REVOKE ALL ON FUNCTION public.proceso_pertenece_a_certificado_version(UUID, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.proceso_pertenece_a_certificado_version(UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.proceso_pertenece_a_certificado_version(UUID, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.proceso_pertenece_a_certificado(UUID, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.proceso_pertenece_a_certificado(UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.proceso_pertenece_a_certificado(UUID, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_validar_proceso_compartido()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_owner_cert_id UUID;
    v_owner_norma UUID;
    v_proc_nombre VARCHAR(150);
    v_proc_deleted TIMESTAMPTZ;
    v_owner_cert_deleted TIMESTAMPTZ;
    v_owner_org_deleted TIMESTAMPTZ;
    v_owner_grupo_id UUID;
    v_owner_grupo_deleted TIMESTAMPTZ;
    v_target_norma UUID;
    v_target_cert_deleted TIMESTAMPTZ;
    v_target_org_deleted TIMESTAMPTZ;
    v_target_grupo_id UUID;
    v_target_grupo_deleted TIMESTAMPTZ;
BEGIN
    IF NEW.deleted_at IS NOT NULL THEN
        RETURN NEW;
    END IF;

    NEW.sincronizar_requisitos := COALESCE(NEW.sincronizar_requisitos, FALSE);

    SELECT p.id_certificado,
           c_owner.id_norma,
           p.nombre_proceso,
           p.deleted_at,
           c_owner.deleted_at,
           o_owner.deleted_at,
           o_owner.id_grupo_empresarial,
           g_owner.deleted_at
      INTO v_owner_cert_id,
           v_owner_norma,
           v_proc_nombre,
           v_proc_deleted,
           v_owner_cert_deleted,
           v_owner_org_deleted,
           v_owner_grupo_id,
           v_owner_grupo_deleted
    FROM public.proceso p
    JOIN public.certificado c_owner ON c_owner.id = p.id_certificado
    JOIN public.organizacion o_owner ON o_owner.id = c_owner.id_organizacion
    LEFT JOIN public.grupo_empresarial g_owner ON g_owner.id = o_owner.id_grupo_empresarial
    WHERE p.id = NEW.id_proceso;

    IF NOT FOUND OR v_proc_deleted IS NOT NULL THEN
        RAISE EXCEPTION 'Operación bloqueada: el proceso seleccionado no existe o está archivado.'
            USING ERRCODE = 'P0001';
    END IF;

    IF v_owner_cert_deleted IS NOT NULL OR v_owner_org_deleted IS NOT NULL THEN
        RAISE EXCEPTION 'Operación bloqueada: el certificado u organización origen del proceso está archivado.'
            USING ERRCODE = 'P0001';
    END IF;

    IF NEW.id_certificado = v_owner_cert_id THEN
        RAISE EXCEPTION 'Operación bloqueada: no puede compartir un proceso con el mismo certificado al que ya pertenece.'
            USING ERRCODE = 'P0001';
    END IF;

    SELECT c_target.id_norma,
           c_target.deleted_at,
           o_target.deleted_at,
           o_target.id_grupo_empresarial,
           g_target.deleted_at
      INTO v_target_norma,
           v_target_cert_deleted,
           v_target_org_deleted,
           v_target_grupo_id,
           v_target_grupo_deleted
    FROM public.certificado c_target
    JOIN public.organizacion o_target ON o_target.id = c_target.id_organizacion
    LEFT JOIN public.grupo_empresarial g_target ON g_target.id = o_target.id_grupo_empresarial
    WHERE c_target.id = NEW.id_certificado;

    IF NOT FOUND OR v_target_cert_deleted IS NOT NULL OR v_target_org_deleted IS NOT NULL THEN
        RAISE EXCEPTION 'Operación bloqueada: el certificado destino o su organización no existe o está archivada.'
            USING ERRCODE = 'P0001';
    END IF;

    IF v_owner_grupo_id IS NULL
       OR v_owner_grupo_deleted IS NOT NULL
       OR v_target_grupo_id IS NULL
       OR v_target_grupo_deleted IS NOT NULL
       OR v_owner_grupo_id IS DISTINCT FROM v_target_grupo_id THEN
        RAISE EXCEPTION 'Violación de Conglomerado: solo se permite compartir procesos entre certificados pertenecientes al mismo conglomerado activo.'
            USING ERRCODE = 'P0001';
    END IF;

    IF v_owner_norma IS DISTINCT FROM v_target_norma THEN
        IF NEW.sincronizar_requisitos = TRUE THEN
            RAISE EXCEPTION 'Operación bloqueada: la sincronización de requisitos solo aplica entre certificados de la misma norma.'
                USING ERRCODE = 'P0001';
        END IF;
        NEW.sincronizar_requisitos := FALSE;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.proceso p_own
        WHERE p_own.id_certificado_version = NEW.id_certificado_version
          AND p_own.deleted_at IS NULL
          AND p_own.id <> NEW.id_proceso
          AND LOWER(TRIM(p_own.nombre_proceso)) = LOWER(TRIM(v_proc_nombre))
    ) OR EXISTS (
        SELECT 1
        FROM public.proceso_certificado_compartido pcc_other
        JOIN public.proceso p_shared ON p_shared.id = pcc_other.id_proceso
        WHERE pcc_other.id_certificado_version = NEW.id_certificado_version
          AND pcc_other.deleted_at IS NULL
          AND pcc_other.id IS DISTINCT FROM NEW.id
          AND p_shared.deleted_at IS NULL
          AND p_shared.id <> NEW.id_proceso
          AND LOWER(TRIM(p_shared.nombre_proceso)) = LOWER(TRIM(v_proc_nombre))
    ) THEN
        RAISE EXCEPTION 'Conflicto de Proceso: ya existe un proceso activo llamado "%" en el certificado destino.',
            TRIM(v_proc_nombre)
            USING ERRCODE = 'P0001';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validar_proceso_compartido ON public.proceso_certificado_compartido;
CREATE TRIGGER trg_validar_proceso_compartido
    BEFORE INSERT OR UPDATE OF id_proceso, id_certificado, id_certificado_version, sincronizar_requisitos, deleted_at ON public.proceso_certificado_compartido
    FOR EACH ROW EXECUTE FUNCTION public.fn_validar_proceso_compartido();

-- ============================================================================
-- Step 1.1 & Step 1.2 (Sincronización de Requisitos Misma Norma por versión)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_sync_shared_process_requisitos(
    p_id_proceso UUID,
    p_source_cert_id UUID,
    p_target_cert_id UUID DEFAULT NULL,
    p_enable_sync BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_owner_cert_id UUID;
    v_owner_cert_ver_id UUID;
    v_source_cert_ver_id UUID;
    v_target_cert_ver_id UUID;
    v_source_norma UUID;
    v_target_norma UUID;
    v_target_ids UUID[] := ARRAY[]::UUID[];
    v_target_id UUID;
    v_synced_certs_count INTEGER := 0;
    v_inserted_count INTEGER := 0;
    v_deleted_count INTEGER := 0;
    v_skipped_excluded_count INTEGER := 0;
    v_row_delta INTEGER := 0;
    v_row_excluded INTEGER := 0;
    v_source_is_synced BOOLEAN := FALSE;
BEGIN
    IF NOT public.is_approved_worker() THEN
        RAISE EXCEPTION 'Operación bloqueada: solo el personal staff aprobado puede sincronizar requisitos de procesos compartidos.'
            USING ERRCODE = 'P0001';
    END IF;

    SELECT p.id_certificado, p.id_certificado_version
      INTO v_owner_cert_id, v_owner_cert_ver_id
    FROM public.proceso p
    WHERE p.id = p_id_proceso
      AND p.deleted_at IS NULL;

    IF v_owner_cert_id IS NULL THEN
        RAISE EXCEPTION 'Operación bloqueada: el proceso seleccionado no existe o está archivado.'
            USING ERRCODE = 'P0001';
    END IF;

    SELECT c.id_norma
      INTO v_source_norma
    FROM public.certificado c
    WHERE c.id = p_source_cert_id
      AND c.deleted_at IS NULL;

    IF v_source_norma IS NULL THEN
        RAISE EXCEPTION 'Operación bloqueada: el certificado origen no existe o está archivado.'
            USING ERRCODE = 'P0001';
    END IF;

    IF p_source_cert_id = v_owner_cert_id THEN
        v_source_cert_ver_id := v_owner_cert_ver_id;
    ELSE
        SELECT COALESCE(
            (
                SELECT pcc.id_certificado_version
                FROM public.proceso_certificado_compartido pcc
                WHERE pcc.id_proceso = p_id_proceso
                  AND pcc.id_certificado = p_source_cert_id
                  AND pcc.deleted_at IS NULL
                ORDER BY pcc.created_at DESC
                LIMIT 1
            ),
            (
                SELECT cv.id
                FROM public.certificado_version cv
                WHERE cv.id_certificado = p_source_cert_id
                  AND cv.deleted_at IS NULL
                ORDER BY cv.es_version_actual DESC, cv.version_numero DESC
                LIMIT 1
            )
        )
        INTO v_source_cert_ver_id;
    END IF;

    IF v_source_cert_ver_id IS NULL
       OR NOT public.proceso_pertenece_a_certificado_version(p_id_proceso, v_source_cert_ver_id) THEN
        RAISE EXCEPTION 'Operación bloqueada: el proceso no pertenece ni está compartido activamente con el certificado origen.'
            USING ERRCODE = 'P0001';
    END IF;

    IF p_target_cert_id IS NOT NULL THEN
        IF p_target_cert_id = p_source_cert_id THEN
            RAISE EXCEPTION 'Operación bloqueada: el certificado destino debe ser distinto al certificado origen.'
                USING ERRCODE = 'P0001';
        END IF;

        SELECT c.id_norma
          INTO v_target_norma
        FROM public.certificado c
        WHERE c.id = p_target_cert_id
          AND c.deleted_at IS NULL;

        IF v_target_norma IS NULL THEN
            RAISE EXCEPTION 'Operación bloqueada: el certificado destino no existe o está archivado.'
                USING ERRCODE = 'P0001';
        END IF;

        IF v_target_norma IS DISTINCT FROM v_source_norma THEN
            RAISE EXCEPTION 'Operación bloqueada: no es posible sincronizar requisitos entre certificados de normas distintas.'
                USING ERRCODE = 'P0001';
        END IF;

        IF NOT public.proceso_pertenece_a_certificado(p_id_proceso, p_target_cert_id) THEN
            RAISE EXCEPTION 'Operación bloqueada: el proceso no está compartido activamente con el certificado destino.'
                USING ERRCODE = 'P0001';
        END IF;

        IF COALESCE(p_enable_sync, TRUE) THEN
            UPDATE public.proceso_certificado_compartido
            SET sincronizar_requisitos = TRUE,
                updated_at = NOW()
            WHERE id_proceso = p_id_proceso
              AND id_certificado IN (p_target_cert_id, p_source_cert_id)
              AND deleted_at IS NULL
              AND sincronizar_requisitos = FALSE;
        END IF;

        v_target_ids := ARRAY[p_target_cert_id];
    ELSE
        v_source_is_synced := (p_source_cert_id = v_owner_cert_id)
            OR EXISTS (
                SELECT 1
                FROM public.proceso_certificado_compartido pcc_src
                WHERE pcc_src.id_proceso = p_id_proceso
                  AND pcc_src.id_certificado_version = v_source_cert_ver_id
                  AND pcc_src.deleted_at IS NULL
                  AND pcc_src.sincronizar_requisitos = TRUE
            );

        IF v_source_is_synced THEN
            SELECT COALESCE(ARRAY_AGG(c_peer.id ORDER BY c_peer.numero_certificado, c_peer.id), ARRAY[]::UUID[])
              INTO v_target_ids
            FROM public.certificado c_peer
            WHERE c_peer.deleted_at IS NULL
              AND c_peer.id_norma = v_source_norma
              AND c_peer.id <> p_source_cert_id
              AND (
                  c_peer.id = v_owner_cert_id
                  OR EXISTS (
                      SELECT 1
                      FROM public.proceso_certificado_compartido pcc_tgt
                      WHERE pcc_tgt.id_proceso = p_id_proceso
                        AND pcc_tgt.id_certificado = c_peer.id
                        AND pcc_tgt.deleted_at IS NULL
                        AND pcc_tgt.sincronizar_requisitos = TRUE
                  )
              );
        END IF;
    END IF;

    FOREACH v_target_id IN ARRAY v_target_ids LOOP
        IF v_target_id = v_owner_cert_id THEN
            v_target_cert_ver_id := v_owner_cert_ver_id;
        ELSE
            SELECT COALESCE(
                (
                    SELECT pcc.id_certificado_version
                    FROM public.proceso_certificado_compartido pcc
                    WHERE pcc.id_proceso = p_id_proceso
                      AND pcc.id_certificado = v_target_id
                      AND pcc.deleted_at IS NULL
                    ORDER BY pcc.created_at DESC
                    LIMIT 1
                ),
                (
                    SELECT cv.id
                    FROM public.certificado_version cv
                    WHERE cv.id_certificado = v_target_id
                      AND cv.deleted_at IS NULL
                    ORDER BY cv.es_version_actual DESC, cv.version_numero DESC
                    LIMIT 1
                )
            )
            INTO v_target_cert_ver_id;
        END IF;

        IF v_target_cert_ver_id IS NULL THEN
            CONTINUE;
        END IF;

        v_synced_certs_count := v_synced_certs_count + 1;

        DELETE FROM public.requisitos_por_proceso rpp
        WHERE rpp.id_proceso = p_id_proceso
          AND rpp.id_certificado_version = v_target_cert_ver_id
          AND NOT EXISTS (
              SELECT 1
              FROM public.requisitos_por_proceso rpp_src
              WHERE rpp_src.id_proceso = p_id_proceso
                AND rpp_src.id_certificado_version = v_source_cert_ver_id
                AND rpp_src.id_requisito = rpp.id_requisito
          );
        GET DIAGNOSTICS v_row_delta = ROW_COUNT;
        v_deleted_count := v_deleted_count + COALESCE(v_row_delta, 0);

        SELECT COUNT(*)
          INTO v_row_excluded
        FROM public.requisitos_por_proceso rpp_src
        JOIN public.requisito r_src ON r_src.id = rpp_src.id_requisito
        WHERE rpp_src.id_proceso = p_id_proceso
          AND rpp_src.id_certificado_version = v_source_cert_ver_id
          AND r_src.deleted_at IS NULL
          AND r_src.id_norma = v_source_norma
          AND EXISTS (
              SELECT 1
              FROM public.requisitos_no_aplicables_certificado rna
              JOIN public.requisito r_excl ON r_excl.id = rna.id_requisito
              WHERE rna.id_certificado_version = v_target_cert_ver_id
                AND rna.deleted_at IS NULL
                AND r_excl.deleted_at IS NULL
                AND r_excl.id_norma = v_source_norma
                AND (
                    r_excl.id = r_src.id
                    OR (
                        r_src.ruta_materializada IS NOT NULL
                        AND r_excl.ruta_materializada IS NOT NULL
                        AND r_src.ruta_materializada <@ r_excl.ruta_materializada
                    )
                )
          );
        v_skipped_excluded_count := v_skipped_excluded_count + COALESCE(v_row_excluded, 0);

        INSERT INTO public.requisitos_por_proceso (id_proceso, id_certificado, id_certificado_version, id_requisito)
        SELECT p_id_proceso, v_target_id, v_target_cert_ver_id, rpp_src.id_requisito
        FROM public.requisitos_por_proceso rpp_src
        JOIN public.requisito r_src ON r_src.id = rpp_src.id_requisito
        WHERE rpp_src.id_proceso = p_id_proceso
          AND rpp_src.id_certificado_version = v_source_cert_ver_id
          AND r_src.deleted_at IS NULL
          AND r_src.id_norma = v_source_norma
          AND NOT EXISTS (
              SELECT 1
              FROM public.requisitos_no_aplicables_certificado rna
              JOIN public.requisito r_excl ON r_excl.id = rna.id_requisito
              WHERE rna.id_certificado_version = v_target_cert_ver_id
                AND rna.deleted_at IS NULL
                AND r_excl.deleted_at IS NULL
                AND r_excl.id_norma = v_source_norma
                AND (
                    r_excl.id = r_src.id
                    OR (
                        r_src.ruta_materializada IS NOT NULL
                        AND r_excl.ruta_materializada IS NOT NULL
                        AND r_src.ruta_materializada <@ r_excl.ruta_materializada
                    )
                )
          )
        ON CONFLICT (id_proceso, id_certificado_version, id_requisito) DO NOTHING;
        GET DIAGNOSTICS v_row_delta = ROW_COUNT;
        v_inserted_count := v_inserted_count + COALESCE(v_row_delta, 0);
    END LOOP;

    RETURN jsonb_build_object(
        'synced_certs_count', v_synced_certs_count,
        'inserted_count', v_inserted_count,
        'deleted_count', v_deleted_count,
        'skipped_excluded_count', v_skipped_excluded_count
    );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_sync_shared_process_requisitos(UUID, UUID, UUID, BOOLEAN) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_sync_shared_process_requisitos(UUID, UUID, UUID, BOOLEAN) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_sync_shared_process_requisitos(UUID, UUID, UUID, BOOLEAN) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_sync_req_proceso_same_norm()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_proc_id UUID;
    v_cert_id UUID;
    v_cert_ver_id UUID;
    v_req_id UUID;
    v_owner_cert_id UUID;
    v_owner_cert_ver_id UUID;
    v_norma UUID;
    v_req_norma UUID;
    v_req_path LTREE;
    v_is_synced_participant BOOLEAN := FALSE;
    v_sibling RECORD;
BEGIN
    IF pg_trigger_depth() > 1 THEN
        RETURN NULL;
    END IF;

    IF TG_OP = 'INSERT' THEN
        v_proc_id := NEW.id_proceso;
        v_cert_id := NEW.id_certificado;
        v_cert_ver_id := NEW.id_certificado_version;
        v_req_id := NEW.id_requisito;
    ELSE
        v_proc_id := OLD.id_proceso;
        v_cert_id := OLD.id_certificado;
        v_cert_ver_id := OLD.id_certificado_version;
        v_req_id := OLD.id_requisito;
    END IF;

    SELECT p.id_certificado, p.id_certificado_version
      INTO v_owner_cert_id, v_owner_cert_ver_id
    FROM public.proceso p
    WHERE p.id = v_proc_id
      AND p.deleted_at IS NULL;

    IF v_owner_cert_id IS NULL THEN
        RETURN NULL;
    END IF;

    SELECT c.id_norma
      INTO v_norma
    FROM public.certificado c
    WHERE c.id = v_cert_id
      AND c.deleted_at IS NULL;

    IF v_norma IS NULL THEN
        RETURN NULL;
    END IF;

    v_is_synced_participant := (v_cert_ver_id = v_owner_cert_ver_id)
        OR EXISTS (
            SELECT 1
            FROM public.proceso_certificado_compartido pcc_self
            WHERE pcc_self.id_proceso = v_proc_id
              AND pcc_self.id_certificado_version = v_cert_ver_id
              AND pcc_self.deleted_at IS NULL
              AND pcc_self.sincronizar_requisitos = TRUE
        );

    IF NOT v_is_synced_participant THEN
        RETURN NULL;
    END IF;

    IF TG_OP = 'INSERT' THEN
        SELECT r.id_norma, r.ruta_materializada
          INTO v_req_norma, v_req_path
        FROM public.requisito r
        WHERE r.id = v_req_id
          AND r.deleted_at IS NULL;

        IF v_req_norma IS NULL OR v_req_norma IS DISTINCT FROM v_norma THEN
            RETURN NULL;
        END IF;
    END IF;

    FOR v_sibling IN
        SELECT
            c_peer.id AS cert_id,
            COALESCE(
                (
                    SELECT pcc_peer.id_certificado_version
                    FROM public.proceso_certificado_compartido pcc_peer
                    WHERE pcc_peer.id_proceso = v_proc_id
                      AND pcc_peer.id_certificado = c_peer.id
                      AND pcc_peer.deleted_at IS NULL
                      AND pcc_peer.sincronizar_requisitos = TRUE
                    ORDER BY pcc_peer.created_at DESC
                    LIMIT 1
                ),
                v_owner_cert_ver_id
            ) AS cert_version_id
        FROM public.certificado c_peer
        WHERE c_peer.deleted_at IS NULL
          AND c_peer.id_norma = v_norma
          AND c_peer.id <> v_cert_id
          AND (
              c_peer.id = v_owner_cert_id
              OR EXISTS (
                  SELECT 1
                  FROM public.proceso_certificado_compartido pcc_peer
                  WHERE pcc_peer.id_proceso = v_proc_id
                    AND pcc_peer.id_certificado = c_peer.id
                    AND pcc_peer.deleted_at IS NULL
                    AND pcc_peer.sincronizar_requisitos = TRUE
              )
          )
    LOOP
        IF v_sibling.cert_version_id IS NULL THEN
            CONTINUE;
        END IF;

        IF TG_OP = 'INSERT' THEN
            IF NOT EXISTS (
                SELECT 1
                FROM public.requisitos_no_aplicables_certificado rna
                JOIN public.requisito r_excl ON r_excl.id = rna.id_requisito
                WHERE rna.id_certificado_version = v_sibling.cert_version_id
                  AND rna.deleted_at IS NULL
                  AND r_excl.deleted_at IS NULL
                  AND r_excl.id_norma = v_norma
                  AND (
                      r_excl.id = v_req_id
                      OR (
                          v_req_path IS NOT NULL
                          AND r_excl.ruta_materializada IS NOT NULL
                          AND v_req_path <@ r_excl.ruta_materializada
                      )
                  )
            ) THEN
                INSERT INTO public.requisitos_por_proceso (id_proceso, id_certificado, id_certificado_version, id_requisito)
                VALUES (v_proc_id, v_sibling.cert_id, v_sibling.cert_version_id, v_req_id)
                ON CONFLICT (id_proceso, id_certificado_version, id_requisito) DO NOTHING;
            END IF;
        ELSE
            DELETE FROM public.requisitos_por_proceso rpp
            WHERE rpp.id_proceso = v_proc_id
              AND rpp.id_certificado_version = v_sibling.cert_version_id
              AND rpp.id_requisito = v_req_id;
        END IF;
    END LOOP;

    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_req_proceso_same_norm ON public.requisitos_por_proceso;
CREATE TRIGGER trg_sync_req_proceso_same_norm
    AFTER INSERT OR DELETE ON public.requisitos_por_proceso
    FOR EACH ROW EXECUTE FUNCTION public.fn_sync_req_proceso_same_norm();

-- ============================================================================
-- Step 1.3 & Step 1.2: Compartición Selectiva de Sitio & Sitio 0 HQ (por versión)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.sitio_pertenece_a_certificado_version(
    p_id_sitio UUID,
    p_id_certificado_version UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.sitio s
        WHERE s.id = p_id_sitio
          AND s.deleted_at IS NULL
          AND (
              s.id_certificado_version = p_id_certificado_version
              OR EXISTS (
                  SELECT 1
                  FROM public.sitio_certificado_compartido scc
                  WHERE scc.id_sitio = s.id
                    AND scc.id_certificado_version = p_id_certificado_version
                    AND scc.deleted_at IS NULL
              )
          )
    );
$$;

CREATE OR REPLACE FUNCTION public.sitio_pertenece_a_certificado(
    p_id_sitio UUID,
    p_id_certificado UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT COALESCE((
        SELECT public.sitio_pertenece_a_certificado_version(p_id_sitio, cv.id)
        FROM public.certificado_version cv
        WHERE cv.id_certificado = p_id_certificado
          AND cv.deleted_at IS NULL
        ORDER BY cv.es_version_actual DESC, cv.version_numero DESC
        LIMIT 1
    ), FALSE);
$$;

REVOKE ALL ON FUNCTION public.sitio_pertenece_a_certificado_version(UUID, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sitio_pertenece_a_certificado_version(UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.sitio_pertenece_a_certificado_version(UUID, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.sitio_pertenece_a_certificado(UUID, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sitio_pertenece_a_certificado(UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.sitio_pertenece_a_certificado(UUID, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_validar_sitio_compartido()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_owner_cert_id UUID;
    v_sitio_deleted TIMESTAMPTZ;
    v_owner_cert_deleted TIMESTAMPTZ;
    v_owner_org_deleted TIMESTAMPTZ;
    v_owner_grupo_id UUID;
    v_owner_grupo_deleted TIMESTAMPTZ;
    v_target_cert_deleted TIMESTAMPTZ;
    v_target_org_deleted TIMESTAMPTZ;
    v_target_grupo_id UUID;
    v_target_grupo_deleted TIMESTAMPTZ;
    v_has_sitio_0 BOOLEAN := FALSE;
    v_max_own_num INTEGER := -1;
    v_max_shared_num INTEGER := -1;
BEGIN
    IF NEW.deleted_at IS NOT NULL THEN
        RETURN NEW;
    END IF;

    SELECT s.id_certificado,
           s.deleted_at,
           c_owner.deleted_at,
           o_owner.deleted_at,
           o_owner.id_grupo_empresarial,
           g_owner.deleted_at
      INTO v_owner_cert_id,
           v_sitio_deleted,
           v_owner_cert_deleted,
           v_owner_org_deleted,
           v_owner_grupo_id,
           v_owner_grupo_deleted
    FROM public.sitio s
    JOIN public.certificado c_owner ON c_owner.id = s.id_certificado
    JOIN public.organizacion o_owner ON o_owner.id = c_owner.id_organizacion
    LEFT JOIN public.grupo_empresarial g_owner ON g_owner.id = o_owner.id_grupo_empresarial
    WHERE s.id = NEW.id_sitio;

    IF NOT FOUND OR v_sitio_deleted IS NOT NULL THEN
        RAISE EXCEPTION 'Operación bloqueada: el sitio seleccionado no existe o está archivado.'
            USING ERRCODE = 'P0001';
    END IF;

    IF v_owner_cert_deleted IS NOT NULL OR v_owner_org_deleted IS NOT NULL THEN
        RAISE EXCEPTION 'Operación bloqueada: el certificado u organización origen del sitio está archivado.'
            USING ERRCODE = 'P0001';
    END IF;

    IF NEW.id_certificado = v_owner_cert_id THEN
        RAISE EXCEPTION 'Operación bloqueada: no puede compartir un sitio con el mismo certificado al que ya pertenece.'
            USING ERRCODE = 'P0001';
    END IF;

    SELECT c_target.deleted_at,
           o_target.deleted_at,
           o_target.id_grupo_empresarial,
           g_target.deleted_at
      INTO v_target_cert_deleted,
           v_target_org_deleted,
           v_target_grupo_id,
           v_target_grupo_deleted
    FROM public.certificado c_target
    JOIN public.organizacion o_target ON o_target.id = c_target.id_organizacion
    LEFT JOIN public.grupo_empresarial g_target ON g_target.id = o_target.id_grupo_empresarial
    WHERE c_target.id = NEW.id_certificado;

    IF NOT FOUND OR v_target_cert_deleted IS NOT NULL OR v_target_org_deleted IS NOT NULL THEN
        RAISE EXCEPTION 'Operación bloqueada: el certificado destino o su organización no existe o está archivada.'
            USING ERRCODE = 'P0001';
    END IF;

    IF v_owner_grupo_id IS NULL
       OR v_owner_grupo_deleted IS NOT NULL
       OR v_target_grupo_id IS NULL
       OR v_target_grupo_deleted IS NOT NULL
       OR v_owner_grupo_id IS DISTINCT FROM v_target_grupo_id THEN
        RAISE EXCEPTION 'Violación de Conglomerado: solo se permite compartir sitios entre certificados pertenecientes al mismo conglomerado activo.'
            USING ERRCODE = 'P0001';
    END IF;

    IF NEW.numero_sitio IS NULL THEN
        SELECT EXISTS (
            SELECT 1
            FROM public.sitio s0
            WHERE s0.id_certificado_version = NEW.id_certificado_version
              AND s0.numero_sitio = 0
              AND s0.deleted_at IS NULL
        ) OR EXISTS (
            SELECT 1
            FROM public.sitio_certificado_compartido scc0
            JOIN public.sitio s_src ON s_src.id = scc0.id_sitio
            WHERE scc0.id_certificado_version = NEW.id_certificado_version
              AND scc0.numero_sitio = 0
              AND scc0.deleted_at IS NULL
              AND s_src.deleted_at IS NULL
              AND scc0.id IS DISTINCT FROM NEW.id
        )
        INTO v_has_sitio_0;

        IF NOT v_has_sitio_0 THEN
            NEW.numero_sitio := 0;
        ELSE
            SELECT COALESCE(MAX(s_own.numero_sitio), -1)
              INTO v_max_own_num
            FROM public.sitio s_own
            WHERE s_own.id_certificado_version = NEW.id_certificado_version
              AND s_own.deleted_at IS NULL;

            SELECT COALESCE(MAX(scc_other.numero_sitio), -1)
              INTO v_max_shared_num
            FROM public.sitio_certificado_compartido scc_other
            JOIN public.sitio s_src ON s_src.id = scc_other.id_sitio
            WHERE scc_other.id_certificado_version = NEW.id_certificado_version
              AND scc_other.deleted_at IS NULL
              AND s_src.deleted_at IS NULL
              AND scc_other.id IS DISTINCT FROM NEW.id;

            NEW.numero_sitio := GREATEST(v_max_own_num, v_max_shared_num, 0) + 1;
        END IF;
    END IF;

    IF NEW.numero_sitio < 0 THEN
        RAISE EXCEPTION 'Operación bloqueada: el número de sitio operativo debe ser mayor o igual a 0.'
            USING ERRCODE = 'P0001';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.sitio s_own
        WHERE s_own.id_certificado_version = NEW.id_certificado_version
          AND s_own.numero_sitio = NEW.numero_sitio
          AND s_own.deleted_at IS NULL
          AND s_own.id <> NEW.id_sitio
    ) OR EXISTS (
        SELECT 1
        FROM public.sitio_certificado_compartido scc_other
        JOIN public.sitio s_src ON s_src.id = scc_other.id_sitio
        WHERE scc_other.id_certificado_version = NEW.id_certificado_version
          AND scc_other.numero_sitio = NEW.numero_sitio
          AND scc_other.deleted_at IS NULL
          AND s_src.deleted_at IS NULL
          AND scc_other.id IS DISTINCT FROM NEW.id
    ) THEN
        RAISE EXCEPTION 'Conflicto de Sitio: ya existe un sitio activo (propio o compartido) con el mismo número operativo en la versión de certificado destino.'
            USING ERRCODE = 'P0001';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validar_sitio_compartido ON public.sitio_certificado_compartido;
CREATE TRIGGER trg_validar_sitio_compartido
    BEFORE INSERT OR UPDATE OF id_sitio, id_certificado, id_certificado_version, numero_sitio, deleted_at ON public.sitio_certificado_compartido
    FOR EACH ROW EXECUTE FUNCTION public.fn_validar_sitio_compartido();

CREATE OR REPLACE FUNCTION public.fn_validar_sitio_numero_unico_compartido()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NEW.deleted_at IS NOT NULL THEN
        RETURN NEW;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.sitio_certificado_compartido scc
        JOIN public.sitio s_src ON s_src.id = scc.id_sitio
        WHERE scc.id_certificado_version = NEW.id_certificado_version
          AND scc.numero_sitio = NEW.numero_sitio
          AND scc.deleted_at IS NULL
          AND s_src.deleted_at IS NULL
          AND scc.id_sitio <> NEW.id
    ) THEN
        RAISE EXCEPTION 'Conflicto de Sitio: el número de sitio indicado ya está ocupado por un sitio compartido activo en la versión del certificado.'
            USING ERRCODE = 'P0001';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validar_sitio_numero_unico_compartido ON public.sitio;
CREATE TRIGGER trg_validar_sitio_numero_unico_compartido
    BEFORE INSERT OR UPDATE OF id_certificado, id_certificado_version, numero_sitio, deleted_at ON public.sitio
    FOR EACH ROW EXECUTE FUNCTION public.fn_validar_sitio_numero_unico_compartido();