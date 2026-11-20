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
    nombre VARCHAR(200) NOT NULL,
    rif VARCHAR(50),
    direccion_fiscal TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    delete_reason TEXT
);

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

        v_base_nombre := LEFT(COALESCE(NULLIF(TRIM(NEW.nombre), ''), 'Conglomerado Individual'), 220);
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
    alcance VARCHAR(1000) NOT NULL DEFAULT '',
    multisitio BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    delete_reason TEXT
);

CREATE TABLE IF NOT EXISTS fecha_certificado (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    id_certificado UUID NOT NULL REFERENCES certificado(id) ON DELETE CASCADE,
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

CREATE TABLE IF NOT EXISTS sitio (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    id_certificado UUID NOT NULL REFERENCES certificado(id) ON DELETE CASCADE,
    numero_sitio INTEGER NOT NULL CHECK (numero_sitio >= 0),
    nombre_sitio VARCHAR(150) NOT NULL,
    direccion_sitio TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    delete_reason TEXT
);

CREATE TABLE IF NOT EXISTS proceso (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    id_certificado UUID NOT NULL REFERENCES certificado(id) ON DELETE CASCADE,
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
    id_requisito UUID NOT NULL REFERENCES requisito(id) ON DELETE CASCADE,
    PRIMARY KEY (id_proceso, id_requisito)
);

CREATE TABLE IF NOT EXISTS requisitos_no_aplicables_certificado (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    id_certificado UUID NOT NULL REFERENCES certificado(id) ON DELETE CASCADE,
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

CREATE TABLE IF NOT EXISTS public.procesos_por_sitio (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    id_sitio UUID NOT NULL REFERENCES public.sitio(id) ON DELETE RESTRICT,
    id_proceso UUID NOT NULL REFERENCES public.proceso(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Dominio 3: Planificación y Ejecución de Auditorías
CREATE TABLE IF NOT EXISTS public.programa_auditoria (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
                'Multisitio'
            )
        ),
    es_vinculada BOOLEAN NOT NULL DEFAULT FALSE,
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
    id_tipo_auditoria UUID NULL REFERENCES public.tipo_auditoria(id) ON DELETE RESTRICT,
    id_metodologia UUID NULL REFERENCES public.metodologia_auditoria(id) ON DELETE RESTRICT,
    tiempo_auditoria NUMERIC(6,2) NOT NULL DEFAULT 0
        CHECK (tiempo_auditoria >= 0 AND MOD((tiempo_auditoria * 4)::NUMERIC, 1) = 0),
    estado_ciclo VARCHAR(30) NOT NULL DEFAULT 'Borrador'
        CHECK (estado_ciclo IN (
            'Borrador',
            'En Programación',
            'Programada',
            'En Ejecución',
            'Auditada',
            'Reprogramada',
            'Cancelada'
        )),
    objetivo TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    delete_reason TEXT
);

CREATE TABLE IF NOT EXISTS public.auditoria_fecha (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    id_auditoria UUID NOT NULL REFERENCES public.auditoria(id) ON DELETE CASCADE,
    numero_secuencia INTEGER NOT NULL CHECK (numero_secuencia >= 1),
    tag VARCHAR(30) NOT NULL DEFAULT 'Programación'
        CONSTRAINT check_auditoria_fecha_tag CHECK (tag IN ('Programación', 'Reprogramación')),
    tipo_fecha VARCHAR(30) NOT NULL
        CONSTRAINT check_auditoria_fecha_tipo CHECK (tipo_fecha IN ('PREPROGRAMADA_MES', 'REAL')),
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
            tipo_fecha = 'REAL'
            AND fecha_inicio IS NOT NULL
            AND fecha_fin IS NOT NULL
            AND fecha_fin >= fecha_inicio
        )
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
    alertas_activas BOOLEAN NOT NULL DEFAULT TRUE,
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

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
    id_proceso UUID NOT NULL REFERENCES public.proceso(id) ON DELETE RESTRICT,
    tipo public.tipo_hallazgo NOT NULL,
    descripcion TEXT NOT NULL,
    evidencia TEXT,
    cerrado BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    delete_reason TEXT
);

-- Triggers de Coherencia de Vinculación (programa_auditoria <-> auditoria) y Multi-Fecha 1:N
CREATE OR REPLACE FUNCTION public.fn_validar_auditoria_en_programa()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_nivel_programa VARCHAR(30);
    v_programa_deleted TIMESTAMPTZ;
    v_cert_org UUID;
    v_cert_deleted TIMESTAMPTZ;
    v_active_count INTEGER;
BEGIN
    IF NEW.deleted_at IS NOT NULL THEN
        RETURN NEW;
    END IF;

    SELECT pa.nivel_vinculacion, pa.deleted_at
      INTO v_nivel_programa, v_programa_deleted
    FROM public.programa_auditoria pa
    WHERE pa.id = NEW.id_programa_auditoria
    FOR UPDATE;

    IF NOT FOUND OR v_programa_deleted IS NOT NULL THEN
        RAISE EXCEPTION 'Operación bloqueada: el programa de auditoría % no existe o está archivado.',
            NEW.id_programa_auditoria
            USING ERRCODE = 'P0001';
    END IF;

    SELECT c.id_organizacion, c.deleted_at
      INTO v_cert_org, v_cert_deleted
    FROM public.certificado c
    WHERE c.id = NEW.id_certificado;

    IF v_cert_org IS NULL OR v_cert_deleted IS NOT NULL THEN
        RAISE EXCEPTION 'Operación bloqueada: el certificado % no existe o está archivado.',
            NEW.id_certificado
            USING ERRCODE = 'P0001';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.auditoria a
        WHERE a.id_programa_auditoria = NEW.id_programa_auditoria
          AND a.id_certificado = NEW.id_certificado
          AND a.id <> NEW.id
          AND a.deleted_at IS NULL
    ) THEN
        RAISE EXCEPTION 'Operación bloqueada: el certificado % ya se encuentra vinculado activamente al programa %.',
            NEW.id_certificado, NEW.id_programa_auditoria
            USING ERRCODE = 'P0001';
    END IF;

    IF v_nivel_programa = 'INDIVIDUAL' THEN
        SELECT COUNT(*)::INTEGER INTO v_active_count
        FROM public.auditoria a
        WHERE a.id_programa_auditoria = NEW.id_programa_auditoria
          AND a.id <> NEW.id
          AND a.deleted_at IS NULL;

        IF v_active_count >= 1 THEN
            RAISE EXCEPTION 'Violación de Vinculación Individual: el programa % solo admite una auditoría activa.',
                NEW.id_programa_auditoria
                USING ERRCODE = 'P0001';
        END IF;
    ELSIF v_nivel_programa = 'NIVEL_1_INTRA_ORG' THEN
        IF EXISTS (
            SELECT 1
            FROM public.auditoria a
            JOIN public.certificado c ON c.id = a.id_certificado
            WHERE a.id_programa_auditoria = NEW.id_programa_auditoria
              AND a.id <> NEW.id
              AND a.deleted_at IS NULL
              AND c.id_organizacion IS DISTINCT FROM v_cert_org
        ) THEN
            RAISE EXCEPTION 'Violación de Vinculación Nivel 1: Todos los certificados de una auditoría intra-organizacional deben pertenecer a la misma organización.'
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
        RAISE EXCEPTION 'Operación bloqueada: la auditoría % no existe o está archivada.',
            NEW.id_auditoria
            USING ERRCODE = 'P0001';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validar_auditoria_fecha_secuencia ON public.auditoria_fecha;
CREATE TRIGGER trg_validar_auditoria_fecha_secuencia
    BEFORE INSERT OR UPDATE OF id_auditoria, numero_secuencia, deleted_at ON public.auditoria_fecha
    FOR EACH ROW EXECUTE FUNCTION public.fn_validar_auditoria_fecha_secuencia();

-- Triggers de Integridad Subconjunto ISO/IEC 17021-1
CREATE OR REPLACE FUNCTION public.fn_validar_proceso_por_sitio_certificado()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_cert_sitio UUID;
    v_sitio_deleted TIMESTAMPTZ;
    v_cert_proceso UUID;
    v_proceso_deleted TIMESTAMPTZ;
BEGIN
    IF NEW.deleted_at IS NOT NULL THEN
        RETURN NEW;
    END IF;

    SELECT s.id_certificado, s.deleted_at
      INTO v_cert_sitio, v_sitio_deleted
    FROM public.sitio s
    WHERE s.id = NEW.id_sitio;

    IF NOT FOUND OR v_sitio_deleted IS NOT NULL THEN
        RAISE EXCEPTION 'Violación de Integridad ISO/IEC 17021-1: El sitio % no existe o está archivado.',
            NEW.id_sitio
            USING ERRCODE = 'P0001';
    END IF;

    SELECT p.id_certificado, p.deleted_at
      INTO v_cert_proceso, v_proceso_deleted
    FROM public.proceso p
    WHERE p.id = NEW.id_proceso;

    IF NOT FOUND OR v_proceso_deleted IS NOT NULL THEN
        RAISE EXCEPTION 'Violación de Integridad ISO/IEC 17021-1: El proceso % no existe o está archivado.',
            NEW.id_proceso
            USING ERRCODE = 'P0001';
    END IF;

    IF v_cert_sitio IS DISTINCT FROM v_cert_proceso THEN
        RAISE EXCEPTION 'Violación de Integridad ISO/IEC 17021-1: El proceso % pertenece al certificado %, incoherente con el certificado % del sitio %.',
            NEW.id_proceso, v_cert_proceso, v_cert_sitio, NEW.id_sitio
            USING ERRCODE = 'P0001';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validar_proceso_por_sitio_certificado ON public.procesos_por_sitio;
CREATE TRIGGER trg_validar_proceso_por_sitio_certificado
    BEFORE INSERT OR UPDATE OF id_sitio, id_proceso, deleted_at ON public.procesos_por_sitio
    FOR EACH ROW EXECUTE FUNCTION public.fn_validar_proceso_por_sitio_certificado();

CREATE OR REPLACE FUNCTION public.fn_validar_sitio_auditoria_certificado()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_cert_auditoria UUID;
    v_cert_sitio UUID;
BEGIN
    SELECT id_certificado INTO v_cert_auditoria FROM public.auditoria WHERE id = NEW.id_auditoria;
    SELECT id_certificado INTO v_cert_sitio FROM public.sitio WHERE id = NEW.id_sitio;

    IF v_cert_auditoria IS NULL OR v_cert_sitio IS NULL OR v_cert_auditoria IS DISTINCT FROM v_cert_sitio THEN
        RAISE EXCEPTION 'Violación de Integridad ISO/IEC 17021-1: El sitio % pertenece al certificado %, incoherente con el certificado % de la auditoría.',
            NEW.id_sitio, v_cert_sitio, v_cert_auditoria;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validar_sitio_auditoria_certificado ON public.sitios_por_auditoria;
CREATE TRIGGER trg_validar_sitio_auditoria_certificado
    BEFORE INSERT OR UPDATE ON public.sitios_por_auditoria
    FOR EACH ROW EXECUTE FUNCTION public.fn_validar_sitio_auditoria_certificado();

CREATE OR REPLACE FUNCTION public.fn_validar_turno_sitio_auditoria()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_sitio_aud UUID;
    v_sitio_turno UUID;
BEGIN
    SELECT id_sitio INTO v_sitio_aud FROM public.sitios_por_auditoria WHERE id = NEW.id_sitios_por_auditoria;
    SELECT id_sitio INTO v_sitio_turno FROM public.turnos_por_sitio WHERE id = NEW.id_turnos_por_sitio;

    IF v_sitio_aud IS NULL OR v_sitio_turno IS NULL OR v_sitio_aud IS DISTINCT FROM v_sitio_turno THEN
        RAISE EXCEPTION 'Violación de Integridad ISO/IEC 17021-1: El turno por sitio % pertenece al sitio %, incoherente con el sitio % asignado a la auditoría.',
            NEW.id_turnos_por_sitio, v_sitio_turno, v_sitio_aud;
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
    v_sa_deleted TIMESTAMPTZ;
    v_aud_deleted TIMESTAMPTZ;
    v_sitio_pps UUID;
    v_proceso_del_sitio UUID;
    v_cert_proceso UUID;
    v_pps_deleted TIMESTAMPTZ;
    v_proc_deleted TIMESTAMPTZ;
BEGIN
    IF NEW.deleted_at IS NOT NULL THEN
        RETURN NEW;
    END IF;

    SELECT sa.id_sitio, a.id_certificado, sa.deleted_at, a.deleted_at
      INTO v_sitio_sa, v_cert_auditoria, v_sa_deleted, v_aud_deleted
    FROM public.sitios_por_auditoria sa
    JOIN public.auditoria a ON a.id = sa.id_auditoria
    WHERE sa.id = NEW.id_sitios_por_auditoria;

    IF NOT FOUND OR v_sa_deleted IS NOT NULL OR v_aud_deleted IS NOT NULL THEN
        RAISE EXCEPTION 'Violación de Integridad ISO/IEC 17021-1: El sitio de auditoría % o su auditoría no existe o está archivado.',
            NEW.id_sitios_por_auditoria
            USING ERRCODE = 'P0001';
    END IF;

    SELECT pps.id_sitio, pps.id_proceso, p.id_certificado, pps.deleted_at, p.deleted_at
      INTO v_sitio_pps, v_proceso_del_sitio, v_cert_proceso, v_pps_deleted, v_proc_deleted
    FROM public.procesos_por_sitio pps
    JOIN public.proceso p ON p.id = pps.id_proceso
    WHERE pps.id = NEW.id_procesos_por_sitio;

    IF NOT FOUND OR v_pps_deleted IS NOT NULL OR v_proc_deleted IS NOT NULL THEN
        RAISE EXCEPTION 'Violación de Integridad ISO/IEC 17021-1: La asignación proceso-sitio % o su proceso no existe o está archivado.',
            NEW.id_procesos_por_sitio
            USING ERRCODE = 'P0001';
    END IF;

    IF v_sitio_pps IS DISTINCT FROM v_sitio_sa THEN
        RAISE EXCEPTION 'Violación de Integridad ISO/IEC 17021-1: El proceso por sitio % corresponde al sitio %, incoherente con el sitio % de la auditoría.',
            NEW.id_procesos_por_sitio, v_sitio_pps, v_sitio_sa
            USING ERRCODE = 'P0001';
    END IF;

    IF v_cert_auditoria IS DISTINCT FROM v_cert_proceso THEN
        RAISE EXCEPTION 'Violación de Integridad ISO/IEC 17021-1: El proceso % pertenece al certificado %, incoherente con el certificado % de la auditoría.',
            v_proceso_del_sitio, v_cert_proceso, v_cert_auditoria
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

CREATE OR REPLACE FUNCTION public.fn_sync_equipo_auditor_desde_sitio()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_id_auditoria UUID;
BEGIN
    IF NEW.deleted_at IS NOT NULL THEN
        RETURN NEW;
    END IF;

    SELECT sa.id_auditoria INTO v_id_auditoria
    FROM public.sitios_por_auditoria sa
    WHERE sa.id = NEW.id_sitios_por_auditoria;

    IF v_id_auditoria IS NOT NULL THEN
        INSERT INTO public.equipo_auditor (id_auditoria, id_auditor, rol_auditor)
        VALUES (v_id_auditoria, NEW.id_auditor, NEW.rol_auditor)
        ON CONFLICT (id_auditoria, id_auditor) DO UPDATE
        SET rol_auditor = CASE
            WHEN public.equipo_auditor.rol_auditor = 'AUDITOR_LIDER' OR EXCLUDED.rol_auditor = 'AUDITOR_LIDER'
                THEN 'AUDITOR_LIDER'
            ELSE EXCLUDED.rol_auditor
        END;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_equipo_auditor_desde_sitio ON public.equipo_auditor_sitio;
CREATE TRIGGER trg_sync_equipo_auditor_desde_sitio
    AFTER INSERT OR UPDATE OF id_sitios_por_auditoria, id_auditor, rol_auditor, deleted_at ON public.equipo_auditor_sitio
    FOR EACH ROW EXECUTE FUNCTION public.fn_sync_equipo_auditor_desde_sitio();

CREATE OR REPLACE FUNCTION public.fn_sync_equipo_auditor_desde_proceso()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_id_auditoria UUID;
    v_rol_resumen VARCHAR(50);
BEGIN
    IF NEW.deleted_at IS NOT NULL THEN
        RETURN NEW;
    END IF;

    SELECT sa.id_auditoria INTO v_id_auditoria
    FROM public.procesos_sitio_auditoria psa
    JOIN public.sitios_por_auditoria sa ON sa.id = psa.id_sitios_por_auditoria
    WHERE psa.id = NEW.id_procesos_sitio_auditoria;

    IF v_id_auditoria IS NOT NULL THEN
        v_rol_resumen := CASE NEW.rol_en_proceso
            WHEN 'APOYO_TECNICO' THEN 'EXPERTO_TECNICO'
            ELSE 'AUDITOR'
        END;

        INSERT INTO public.equipo_auditor (id_auditoria, id_auditor, rol_auditor)
        VALUES (v_id_auditoria, NEW.id_auditor, v_rol_resumen)
        ON CONFLICT (id_auditoria, id_auditor) DO NOTHING;
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

DROP TRIGGER IF EXISTS update_sitio_modtime ON public.sitio;
CREATE TRIGGER update_sitio_modtime BEFORE UPDATE ON public.sitio FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_proceso_modtime ON public.proceso;
CREATE TRIGGER update_proceso_modtime BEFORE UPDATE ON public.proceso FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_turno_modtime ON public.turno;
CREATE TRIGGER update_turno_modtime BEFORE UPDATE ON public.turno FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

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

-- ============================================================================
-- Fase 1.1, Certificado Step 2.1 & Auditoría Steps 1.1.1-1.1.2: Columnas FK / Soft-Delete Idempotentes
-- ============================================================================
ALTER TABLE public.organizacion
    ADD COLUMN IF NOT EXISTS id_grupo_empresarial UUID NULL REFERENCES public.grupo_empresarial(id) ON DELETE RESTRICT;

ALTER TABLE public.certificado
    ADD COLUMN IF NOT EXISTS id_subsector_iaf UUID REFERENCES public.subsector_iaf(id) ON DELETE RESTRICT;

ALTER TABLE public.auditoria
    ADD COLUMN IF NOT EXISTS id_programa_auditoria UUID REFERENCES public.programa_auditoria(id) ON DELETE RESTRICT;
ALTER TABLE public.auditoria
    ADD COLUMN IF NOT EXISTS codigo_auditoria VARCHAR(40) NULL;
ALTER TABLE public.auditoria
    ADD COLUMN IF NOT EXISTS tiempo_auditoria NUMERIC(6,2) NOT NULL DEFAULT 0;
ALTER TABLE public.auditoria
    ADD COLUMN IF NOT EXISTS estado_ciclo VARCHAR(30) NOT NULL DEFAULT 'Borrador';
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

DO $$
DECLARE
    v_tbl TEXT;
    v_core_tables TEXT[] := ARRAY[
        'norma', 'requisito', 'sector_iaf', 'subsector_iaf',
        'organismo_acreditacion', 'acreditacion_norma',
        'estatus', 'tipo_auditoria', 'metodologia_auditoria', 'auditor',
        'grupo_empresarial', 'organizacion', 'certificado', 'fecha_certificado', 'contacto_certificado',
        'sitio', 'proceso', 'turno',
        'programa_auditoria', 'auditoria', 'hallazgo'
    ];
    v_child_tables TEXT[] := ARRAY[
        'requisito_traduccion',
        'acreditacion_norma_sector_iaf',
        'requisitos_no_aplicables_certificado', 'turnos_por_sitio', 'procesos_por_sitio',
        'auditoria_fecha', 'configuracion_alerta_auditoria',
        'comentarios_por_auditoria', 'sitios_por_auditoria',
        'turnos_sitio_auditoria', 'procesos_sitio_auditoria', 'turnos_proceso_sitio_auditoria',
        'equipo_auditor_sitio', 'equipo_auditor_proceso_sitio',
        'telefono_contacto_certificado', 'email_contacto_certificado',
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

        WHEN 'organizacion' THEN
            SELECT COUNT(*)::INTEGER INTO v_count
            FROM public.certificado WHERE id_organizacion = p_record_id AND deleted_at IS NULL;
            IF v_count > 0 THEN
                v_deps := v_deps || jsonb_build_array(jsonb_build_object('table', 'certificado', 'label', 'Certificados activos', 'count', v_count));
                v_total := v_total + v_count;
            END IF;

        WHEN 'certificado' THEN
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
        'grupo_empresarial', 'organizacion', 'certificado', 'fecha_certificado', 'contacto_certificado',
        'sitio', 'proceso', 'turno',
        'programa_auditoria', 'auditoria', 'hallazgo'
    ];
    v_child_tables TEXT[] := ARRAY[
        'requisito_traduccion',
        'acreditacion_norma_sector_iaf',
        'requisitos_no_aplicables_certificado', 'turnos_por_sitio', 'procesos_por_sitio',
        'auditoria_fecha', 'configuracion_alerta_auditoria',
        'comentarios_por_auditoria', 'sitios_por_auditoria',
        'turnos_sitio_auditoria', 'procesos_sitio_auditoria', 'turnos_proceso_sitio_auditoria',
        'equipo_auditor_sitio', 'equipo_auditor_proceso_sitio',
        'telefono_contacto_certificado', 'email_contacto_certificado'
    ];
    v_guarded_parents TEXT[] := ARRAY[
        'grupo_empresarial', 'organizacion', 'certificado', 'contacto_certificado', 'norma', 'requisito',
        'sector_iaf', 'subsector_iaf', 'organismo_acreditacion', 'acreditacion_norma',
        'sitio', 'proceso', 'procesos_por_sitio',
        'turno', 'programa_auditoria', 'auditoria', 'auditor', 'estatus', 'tipo_auditoria',
        'metodologia_auditoria', 'sitios_por_auditoria',
        'turnos_por_sitio', 'turnos_sitio_auditoria', 'procesos_sitio_auditoria'
    ];
    v_extra_audit_tables TEXT[] := ARRAY[
        'requisito', 'requisito_traduccion', 'sector_iaf', 'acreditacion_norma_sector_iaf',
        'estatus', 'tipo_auditoria',
        'metodologia_auditoria', 'auditor',
        'turnos_por_sitio', 'procesos_por_sitio',
        'programa_auditoria', 'auditoria_fecha', 'configuracion_alerta_auditoria',
        'comentarios_por_auditoria',
        'sitios_por_auditoria', 'turnos_sitio_auditoria',
        'procesos_sitio_auditoria', 'turnos_proceso_sitio_auditoria',
        'equipo_auditor_sitio', 'equipo_auditor_proceso_sitio',
        'fecha_certificado', 'contacto_certificado',
        'telefono_contacto_certificado', 'email_contacto_certificado'
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
    v_cert_id UUID;
    v_cert_norma UUID;
    v_req_norma UUID;
    v_req_path LTREE;
    v_blocking_code VARCHAR;
BEGIN
    SELECT p.id_certificado, c.id_norma
      INTO v_cert_id, v_cert_norma
    FROM public.proceso p
    JOIN public.certificado c ON c.id = p.id_certificado
    WHERE p.id = NEW.id_proceso
      AND p.deleted_at IS NULL
      AND c.deleted_at IS NULL;

    IF v_cert_id IS NULL OR v_cert_norma IS NULL THEN
        RAISE EXCEPTION 'Operación bloqueada: el proceso % o su certificado asociado no existe o está archivado.', NEW.id_proceso
            USING ERRCODE = 'P0001';
    END IF;

    SELECT r.id_norma, r.ruta_materializada
      INTO v_req_norma, v_req_path
    FROM public.requisito r
    WHERE r.id = NEW.id_requisito
      AND r.deleted_at IS NULL;

    IF v_req_norma IS NULL THEN
        RAISE EXCEPTION 'Operación bloqueada: la cláusula % no existe o está archivada.', NEW.id_requisito
            USING ERRCODE = 'P0001';
    END IF;

    IF v_req_norma IS DISTINCT FROM v_cert_norma THEN
        RAISE EXCEPTION 'Violación de Integridad Normativa: la cláusula % pertenece a una norma distinta a la del certificado.', NEW.id_requisito
            USING ERRCODE = 'P0001';
    END IF;

    SELECT r_excl.codigo
      INTO v_blocking_code
    FROM public.requisitos_no_aplicables_certificado rna
    JOIN public.requisito r_excl ON r_excl.id = rna.id_requisito
    WHERE rna.id_certificado = v_cert_id
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
-- se podan únicamente '8.3' y sus descendientes (<@), preservando '8' para el resto de cláusulas no excluidas.
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
        RAISE EXCEPTION 'Violación de Integridad Normativa: la cláusula excluida % no pertenece a la norma del certificado %.',
            NEW.id_requisito, NEW.id_certificado
            USING ERRCODE = 'P0001';
    END IF;

    DELETE FROM public.requisitos_por_proceso rpp
    USING public.proceso p, public.requisito r_link
    WHERE rpp.id_proceso = p.id
      AND rpp.id_requisito = r_link.id
      AND p.id_certificado = NEW.id_certificado
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
    AFTER INSERT OR UPDATE OF id_certificado, id_requisito, deleted_at ON public.requisitos_no_aplicables_certificado
    FOR EACH ROW EXECUTE FUNCTION public.fn_smart_prune_process_clauses_on_exclusion();