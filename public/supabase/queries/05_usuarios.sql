-- ============================================================================
-- FILE 5: 05_USUARIOS.SQL (SCRIPT DE USUARIOS DE PRUEBA: SUPABASE AUTH + PROFILES RBAC REDISEÑADO)
-- ============================================================================

DELETE FROM auth.users
WHERE email IN (
    'admin@fondonorma.test', 
    'worker@fondonorma.test', 
    'auditor@fondonorma.test', 
    'client@fondonorma.test',
    'user@fondonorma.test'
)
AND id NOT IN (
    '11111111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222222',
    '33333333-3333-3333-3333-333333333333',
    '44444444-4444-4444-4444-444444444444'
);

-- Nota: Supabase GoTrue requiere que confirmation_token, email_change,
-- email_change_token_new y recovery_token sean '' (cadena vacía), nunca NULL,
-- para evitar error 500 "Database error querying schema" al iniciar sesión.
INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    last_sign_in_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
)
VALUES
(
    '00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111',
    'authenticated', 'authenticated', 'admin@fondonorma.test', crypt('Password123*', gen_salt('bf')),
    NOW(), NOW(), '{"provider": "email", "providers": ["email"]}', '{"nombre": "Administrador Principal", "role": "ADMIN"}', NOW(), NOW(),
    '', '', '', ''
),
(
    '00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222',
    'authenticated', 'authenticated', 'worker@fondonorma.test', crypt('Password123*', gen_salt('bf')),
    NOW(), NOW(), '{"provider": "email", "providers": ["email"]}', '{"nombre": "Gestor Operativo", "role": "WORKER"}', NOW(), NOW(),
    '', '', '', ''
),
(
    '00000000-0000-0000-0000-000000000000', '33333333-3333-3333-3333-333333333333',
    'authenticated', 'authenticated', 'auditor@fondonorma.test', crypt('Password123*', gen_salt('bf')),
    NOW(), NOW(), '{"provider": "email", "providers": ["email"]}', '{"nombre": "Auditor Técnico", "role": "AUDITOR"}', NOW(), NOW(),
    '', '', '', ''
),
(
    '00000000-0000-0000-0000-000000000000', '44444444-4444-4444-4444-444444444444',
    'authenticated', 'authenticated', 'client@fondonorma.test', crypt('Password123*', gen_salt('bf')),
    NOW(), NOW(), '{"provider": "email", "providers": ["email"]}', '{"nombre": "Cliente Empresa Iberometal", "role": "CLIENT"}', NOW(), NOW(),
    '', '', '', ''
)
ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    encrypted_password = EXCLUDED.encrypted_password,
    email_confirmed_at = EXCLUDED.email_confirmed_at,
    raw_user_meta_data = EXCLUDED.raw_user_meta_data,
    confirmation_token = '',
    email_change = '',
    email_change_token_new = '',
    recovery_token = '',
    updated_at = NOW();

INSERT INTO public.profiles (id, nombre, role, status, created_at, updated_at)
VALUES 
    ('11111111-1111-1111-1111-111111111111', 'Administrador Principal', 'ADMIN', 'APPROVED', NOW(), NOW()),
    ('22222222-2222-2222-2222-222222222222', 'Gestor Operativo', 'WORKER', 'APPROVED', NOW(), NOW()),
    ('33333333-3333-3333-3333-333333333333', 'Auditor Técnico', 'AUDITOR', 'APPROVED', NOW(), NOW()),
    ('44444444-4444-4444-4444-444444444444', 'Cliente Empresa Iberometal', 'CLIENT', 'APPROVED', NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, status = EXCLUDED.status, updated_at = NOW();

-- ============================================================================
-- PROVISIÓN IDEMPOTENTE DE LOS 47 AUDITORES REALES (public/Auditores.csv)
-- ============================================================================
-- Limpieza idempotente previa de correos conflictivos fuera de los UUIDs determinísticos
DELETE FROM auth.users au
USING (VALUES
    ('10000000-0000-0000-0000-000000000001'::UUID, 'keylasoteldo@gmail.com'),
    ('10000000-0000-0000-0000-000000000002'::UUID, 'frojas301@gmail.com'),
    ('10000000-0000-0000-0000-000000000003'::UUID, 'joserpolofaria@gmail.com'),
    ('10000000-0000-0000-0000-000000000004'::UUID, 'leorojas48@gmail.com'),
    ('10000000-0000-0000-0000-000000000005'::UUID, 'nordyfuentes@gmail.com'),
    ('10000000-0000-0000-0000-000000000006'::UUID, 'fernandezmz@hotmail.com'),
    ('10000000-0000-0000-0000-000000000007'::UUID, 'nelson.arteaga@gmail.com'),
    ('10000000-0000-0000-0000-000000000008'::UUID, 'fondonorma.yblanco@gmail.com'),
    ('10000000-0000-0000-0000-000000000009'::UUID, 'ejcamar@gmail.com'),
    ('10000000-0000-0000-0000-000000000010'::UUID, 'idiaz25@gmail.com'),
    ('10000000-0000-0000-0000-000000000011'::UUID, 'calidad.aksanchez@gmail.com'),
    ('10000000-0000-0000-0000-000000000012'::UUID, 'servicios@betzygil.com'),
    ('10000000-0000-0000-0000-000000000013'::UUID, 'carlosalfonso2027@gmail.com'),
    ('10000000-0000-0000-0000-000000000014'::UUID, 'carlosedurado.gonzalez@gmail.com'),
    ('10000000-0000-0000-0000-000000000015'::UUID, 'villarrealcmg@gmail.com'),
    ('10000000-0000-0000-0000-000000000016'::UUID, 'daneypf@gmail.com'),
    ('10000000-0000-0000-0000-000000000017'::UUID, 'denisecolina22@gmail.com'),
    ('10000000-0000-0000-0000-000000000018'::UUID, 'dinfante.consultor@gmail.com'),
    ('10000000-0000-0000-0000-000000000019'::UUID, 'gennymendoza62@gmail.com'),
    ('10000000-0000-0000-0000-000000000020'::UUID, 'quality.s.consulting@gmail.com'),
    ('10000000-0000-0000-0000-000000000021'::UUID, 'quality.gi@gmail.com'),
    ('10000000-0000-0000-0000-000000000022'::UUID, 'joseg.goncalvesm@gmail.com'),
    ('10000000-0000-0000-0000-000000000023'::UUID, 'paulo.torrealba@gmail.com'),
    ('10000000-0000-0000-0000-000000000024'::UUID, 'hh3026@gmail.com'),
    ('10000000-0000-0000-0000-000000000025'::UUID, 'karol.sanchez13@gmail.com'),
    ('10000000-0000-0000-0000-000000000026'::UUID, 'ladera.managementsolutions@gmail.com'),
    ('10000000-0000-0000-0000-000000000027'::UUID, 'matamoros1978@gmail.com'),
    ('10000000-0000-0000-0000-000000000028'::UUID, 'luisb.mb1001@gmail.com'),
    ('10000000-0000-0000-0000-000000000029'::UUID, 'zulairamsavir@gmail.com'),
    ('10000000-0000-0000-0000-000000000030'::UUID, 'magyory.suarez@gmail.com'),
    ('10000000-0000-0000-0000-000000000031'::UUID, 'quintana1manuel@gmail.com'),
    ('10000000-0000-0000-0000-000000000032'::UUID, 'mrmconsultores.rivasmarquez@gmail.com'),
    ('10000000-0000-0000-0000-000000000033'::UUID, 'mariauxiliadoracadenas@gmail.com'),
    ('10000000-0000-0000-0000-000000000034'::UUID, 'ximenapacheco@gmail.com'),
    ('10000000-0000-0000-0000-000000000035'::UUID, 'oscareriosu@gmail.com'),
    ('10000000-0000-0000-0000-000000000036'::UUID, 'quinteroarjona@gmail.com'),
    ('10000000-0000-0000-0000-000000000037'::UUID, 'pcgs20@gmail.com'),
    ('10000000-0000-0000-0000-000000000038'::UUID, 'pmp.calidad@gmail.com'),
    ('10000000-0000-0000-0000-000000000039'::UUID, 'ing.pedrovargas@gmail.com'),
    ('10000000-0000-0000-0000-000000000040'::UUID, 'qsheca@gmail.com'),
    ('10000000-0000-0000-0000-000000000041'::UUID, 'sheilar.teresa@gmail.com'),
    ('10000000-0000-0000-0000-000000000042'::UUID, 'blancovic2000@gmail.com'),
    ('10000000-0000-0000-0000-000000000043'::UUID, 'wpeuchert@hotmail.com'),
    ('10000000-0000-0000-0000-000000000044'::UUID, 'yamiladumont@gmail.com'),
    ('10000000-0000-0000-0000-000000000045'::UUID, 'yanellys_castellanos@yahoo.com'),
    ('10000000-0000-0000-0000-000000000046'::UUID, 'agroauditora@gmail.com'),
    ('10000000-0000-0000-0000-000000000047'::UUID, 'yurima12.fondonorma@gmail.com')
) AS expected(expected_id, expected_email)
WHERE LOWER(au.email) = expected.expected_email
  AND au.id IS DISTINCT FROM expected.expected_id
  AND au.id NOT IN (
    '11111111-1111-1111-1111-111111111111'::UUID,
    '22222222-2222-2222-2222-222222222222'::UUID,
    '33333333-3333-3333-3333-333333333333'::UUID,
    '44444444-4444-4444-4444-444444444444'::UUID
  );

INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    last_sign_in_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
)
VALUES
(
    '00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000001',
    'authenticated', 'authenticated', 'keylasoteldo@gmail.com', crypt('KS4165827', gen_salt('bf')),
    NOW(), NOW(), '{"provider": "email", "providers": ["email"]}', '{"nombre":"Keyla Cristina Soteldo de Páez","role":"AUDITOR","siglas":"KS"}'::jsonb, NOW(), NOW(),
    '', '', '', ''
),
(
    '00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000002',
    'authenticated', 'authenticated', 'frojas301@gmail.com', crypt('FR2995963', gen_salt('bf')),
    NOW(), NOW(), '{"provider": "email", "providers": ["email"]}', '{"nombre":"Félix Horacio Rojas Machado","role":"AUDITOR","siglas":"FR"}'::jsonb, NOW(), NOW(),
    '', '', '', ''
),
(
    '00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000003',
    'authenticated', 'authenticated', 'joserpolofaria@gmail.com', crypt('JRP5684384', gen_salt('bf')),
    NOW(), NOW(), '{"provider": "email", "providers": ["email"]}', '{"nombre":"José Ramón Polo Faría","role":"AUDITOR","siglas":"JRP"}'::jsonb, NOW(), NOW(),
    '', '', '', ''
),
(
    '00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000004',
    'authenticated', 'authenticated', 'leorojas48@gmail.com', crypt('LR5365320', gen_salt('bf')),
    NOW(), NOW(), '{"provider": "email", "providers": ["email"]}', '{"nombre":"Leonardo Antonio Rojas Gómez","role":"AUDITOR","siglas":"LR"}'::jsonb, NOW(), NOW(),
    '', '', '', ''
),
(
    '00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000005',
    'authenticated', 'authenticated', 'nordyfuentes@gmail.com', crypt('NF5884819', gen_salt('bf')),
    NOW(), NOW(), '{"provider": "email", "providers": ["email"]}', '{"nombre":"Nordy Armando Fuentes","role":"AUDITOR","siglas":"NF"}'::jsonb, NOW(), NOW(),
    '', '', '', ''
),
(
    '00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000006',
    'authenticated', 'authenticated', 'fernandezmz@hotmail.com', crypt('MF8417973', gen_salt('bf')),
    NOW(), NOW(), '{"provider": "email", "providers": ["email"]}', '{"nombre":"Manuel Arturo Fernández Martínez","role":"AUDITOR","siglas":"MF"}'::jsonb, NOW(), NOW(),
    '', '', '', ''
),
(
    '00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000007',
    'authenticated', 'authenticated', 'nelson.arteaga@gmail.com', crypt('NA5584108', gen_salt('bf')),
    NOW(), NOW(), '{"provider": "email", "providers": ["email"]}', '{"nombre":"Nelson Rafael Arteaga Quevedo","role":"AUDITOR","siglas":"NA"}'::jsonb, NOW(), NOW(),
    '', '', '', ''
),
(
    '00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000008',
    'authenticated', 'authenticated', 'fondonorma.yblanco@gmail.com', crypt('YB12500820', gen_salt('bf')),
    NOW(), NOW(), '{"provider": "email", "providers": ["email"]}', '{"nombre":"Yuliber Alejandra Blanco Díaz","role":"AUDITOR","siglas":"YB"}'::jsonb, NOW(), NOW(),
    '', '', '', ''
),
(
    '00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000009',
    'authenticated', 'authenticated', 'ejcamar@gmail.com', crypt('ECH3395125', gen_salt('bf')),
    NOW(), NOW(), '{"provider": "email", "providers": ["email"]}', '{"nombre":"Edgar José Cachutt Márquez","role":"AUDITOR","siglas":"ECH"}'::jsonb, NOW(), NOW(),
    '', '', '', ''
),
(
    '00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000010',
    'authenticated', 'authenticated', 'idiaz25@gmail.com', crypt('ID6965204', gen_salt('bf')),
    NOW(), NOW(), '{"provider": "email", "providers": ["email"]}', '{"nombre":"Ismael Enrique Díaz Valera","role":"AUDITOR","siglas":"ID"}'::jsonb, NOW(), NOW(),
    '', '', '', ''
),
(
    '00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000011',
    'authenticated', 'authenticated', 'calidad.aksanchez@gmail.com', crypt('AKS10337391', gen_salt('bf')),
    NOW(), NOW(), '{"provider": "email", "providers": ["email"]}', '{"nombre":"Ana Karina Sanchez","role":"AUDITOR","siglas":"AKS"}'::jsonb, NOW(), NOW(),
    '', '', '', ''
),
(
    '00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000012',
    'authenticated', 'authenticated', 'servicios@betzygil.com', crypt('BG9648747', gen_salt('bf')),
    NOW(), NOW(), '{"provider": "email", "providers": ["email"]}', '{"nombre":"Betzy Gil","role":"AUDITOR","siglas":"BG"}'::jsonb, NOW(), NOW(),
    '', '', '', ''
),
(
    '00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000013',
    'authenticated', 'authenticated', 'carlosalfonso2027@gmail.com', crypt('CV3430457', gen_salt('bf')),
    NOW(), NOW(), '{"provider": "email", "providers": ["email"]}', '{"nombre":"Carlos Vasquez","role":"AUDITOR","siglas":"CV"}'::jsonb, NOW(), NOW(),
    '', '', '', ''
),
(
    '00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000014',
    'authenticated', 'authenticated', 'carlosedurado.gonzalez@gmail.com', crypt('CG21229844', gen_salt('bf')),
    NOW(), NOW(), '{"provider": "email", "providers": ["email"]}', '{"nombre":"Carlos Gonzalez","role":"AUDITOR","siglas":"CG"}'::jsonb, NOW(), NOW(),
    '', '', '', ''
),
(
    '00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000015',
    'authenticated', 'authenticated', 'villarrealcmg@gmail.com', crypt('CVC9328705', gen_salt('bf')),
    NOW(), NOW(), '{"provider": "email", "providers": ["email"]}', '{"nombre":"Carlos Villareal","role":"AUDITOR","siglas":"CVC"}'::jsonb, NOW(), NOW(),
    '', '', '', ''
),
(
    '00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000016',
    'authenticated', 'authenticated', 'daneypf@gmail.com', crypt('DPZ11405571', gen_salt('bf')),
    NOW(), NOW(), '{"provider": "email", "providers": ["email"]}', '{"nombre":"Daney Penaloza","role":"AUDITOR","siglas":"DPZ"}'::jsonb, NOW(), NOW(),
    '', '', '', ''
),
(
    '00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000017',
    'authenticated', 'authenticated', 'denisecolina22@gmail.com', crypt('DC13405896', gen_salt('bf')),
    NOW(), NOW(), '{"provider": "email", "providers": ["email"]}', '{"nombre":"Denise Colina","role":"AUDITOR","siglas":"DC"}'::jsonb, NOW(), NOW(),
    '', '', '', ''
),
(
    '00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000018',
    'authenticated', 'authenticated', 'dinfante.consultor@gmail.com', crypt('DI20722562', gen_salt('bf')),
    NOW(), NOW(), '{"provider": "email", "providers": ["email"]}', '{"nombre":"Douglas Infante","role":"AUDITOR","siglas":"DI"}'::jsonb, NOW(), NOW(),
    '', '', '', ''
),
(
    '00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000019',
    'authenticated', 'authenticated', 'gennymendoza62@gmail.com', crypt('GM6523376', gen_salt('bf')),
    NOW(), NOW(), '{"provider": "email", "providers": ["email"]}', '{"nombre":"Genny Mendoza","role":"AUDITOR","siglas":"GM"}'::jsonb, NOW(), NOW(),
    '', '', '', ''
),
(
    '00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000020',
    'authenticated', 'authenticated', 'quality.s.consulting@gmail.com', crypt('GV6917851', gen_salt('bf')),
    NOW(), NOW(), '{"provider": "email", "providers": ["email"]}', '{"nombre":"Gilberto Villalba","role":"AUDITOR","siglas":"GV"}'::jsonb, NOW(), NOW(),
    '', '', '', ''
),
(
    '00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000021',
    'authenticated', 'authenticated', 'quality.gi@gmail.com', crypt('IG5594199', gen_salt('bf')),
    NOW(), NOW(), '{"provider": "email", "providers": ["email"]}', '{"nombre":"Ivan Gonzalez","role":"AUDITOR","siglas":"IG"}'::jsonb, NOW(), NOW(),
    '', '', '', ''
),
(
    '00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000022',
    'authenticated', 'authenticated', 'joseg.goncalvesm@gmail.com', crypt('JG10756009', gen_salt('bf')),
    NOW(), NOW(), '{"provider": "email", "providers": ["email"]}', '{"nombre":"Jose Gregorio Goncalves","role":"AUDITOR","siglas":"JG"}'::jsonb, NOW(), NOW(),
    '', '', '', ''
),
(
    '00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000023',
    'authenticated', 'authenticated', 'paulo.torrealba@gmail.com', crypt('JPT14485899', gen_salt('bf')),
    NOW(), NOW(), '{"provider": "email", "providers": ["email"]}', '{"nombre":"Juan Paulo Torrealba","role":"AUDITOR","siglas":"JPT"}'::jsonb, NOW(), NOW(),
    '', '', '', ''
),
(
    '00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000024',
    'authenticated', 'authenticated', 'hh3026@gmail.com', crypt('JH3507585', gen_salt('bf')),
    NOW(), NOW(), '{"provider": "email", "providers": ["email"]}', '{"nombre":"Juan Hermann","role":"AUDITOR","siglas":"JH"}'::jsonb, NOW(), NOW(),
    '', '', '', ''
),
(
    '00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000025',
    'authenticated', 'authenticated', 'karol.sanchez13@gmail.com', crypt('KSG17039885', gen_salt('bf')),
    NOW(), NOW(), '{"provider": "email", "providers": ["email"]}', '{"nombre":"Karol Yulay Sánchez De Ghiano","role":"AUDITOR","siglas":"KSG"}'::jsonb, NOW(), NOW(),
    '', '', '', ''
),
(
    '00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000026',
    'authenticated', 'authenticated', 'ladera.managementsolutions@gmail.com', crypt('LL12764568', gen_salt('bf')),
    NOW(), NOW(), '{"provider": "email", "providers": ["email"]}', '{"nombre":"Leonardo Ladera","role":"AUDITOR","siglas":"LL"}'::jsonb, NOW(), NOW(),
    '', '', '', ''
),
(
    '00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000027',
    'authenticated', 'authenticated', 'matamoros1978@gmail.com', crypt('LM13909537', gen_salt('bf')),
    NOW(), NOW(), '{"provider": "email", "providers": ["email"]}', '{"nombre":"Luis Matamoros","role":"AUDITOR","siglas":"LM"}'::jsonb, NOW(), NOW(),
    '', '', '', ''
),
(
    '00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000028',
    'authenticated', 'authenticated', 'luisb.mb1001@gmail.com', crypt('LB5305469', gen_salt('bf')),
    NOW(), NOW(), '{"provider": "email", "providers": ["email"]}', '{"nombre":"Luis Blanco","role":"AUDITOR","siglas":"LB"}'::jsonb, NOW(), NOW(),
    '', '', '', ''
),
(
    '00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000029',
    'authenticated', 'authenticated', 'zulairamsavir@gmail.com', crypt('LMR5268661', gen_salt('bf')),
    NOW(), NOW(), '{"provider": "email", "providers": ["email"]}', '{"nombre":"Luz María Rivas Sánchez","role":"AUDITOR","siglas":"LMR"}'::jsonb, NOW(), NOW(),
    '', '', '', ''
),
(
    '00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000030',
    'authenticated', 'authenticated', 'magyory.suarez@gmail.com', crypt('MS11294442', gen_salt('bf')),
    NOW(), NOW(), '{"provider": "email", "providers": ["email"]}', '{"nombre":"Magyory Suarez","role":"AUDITOR","siglas":"MS"}'::jsonb, NOW(), NOW(),
    '', '', '', ''
),
(
    '00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000031',
    'authenticated', 'authenticated', 'quintana1manuel@gmail.com', crypt('MQ12640951', gen_salt('bf')),
    NOW(), NOW(), '{"provider": "email", "providers": ["email"]}', '{"nombre":"Manuel Quintana","role":"AUDITOR","siglas":"MQ"}'::jsonb, NOW(), NOW(),
    '', '', '', ''
),
(
    '00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000032',
    'authenticated', 'authenticated', 'mrmconsultores.rivasmarquez@gmail.com', crypt('MR10717513', gen_salt('bf')),
    NOW(), NOW(), '{"provider": "email", "providers": ["email"]}', '{"nombre":"Maria Rivas","role":"AUDITOR","siglas":"MR"}'::jsonb, NOW(), NOW(),
    '', '', '', ''
),
(
    '00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000033',
    'authenticated', 'authenticated', 'mariauxiliadoracadenas@gmail.com', crypt('MAC4923686', gen_salt('bf')),
    NOW(), NOW(), '{"provider": "email", "providers": ["email"]}', '{"nombre":"Maria Auxiliadora Cadena","role":"AUDITOR","siglas":"MAC"}'::jsonb, NOW(), NOW(),
    '', '', '', ''
),
(
    '00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000034',
    'authenticated', 'authenticated', 'ximenapacheco@gmail.com', crypt('XP14261576', gen_salt('bf')),
    NOW(), NOW(), '{"provider": "email", "providers": ["email"]}', '{"nombre":"Ximena Pacheco","role":"AUDITOR","siglas":"XP"}'::jsonb, NOW(), NOW(),
    '', '', '', ''
),
(
    '00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000035',
    'authenticated', 'authenticated', 'oscareriosu@gmail.com', crypt('OR7130716', gen_salt('bf')),
    NOW(), NOW(), '{"provider": "email", "providers": ["email"]}', '{"nombre":"Óscar Ríos","role":"AUDITOR","siglas":"OR"}'::jsonb, NOW(), NOW(),
    '', '', '', ''
),
(
    '00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000036',
    'authenticated', 'authenticated', 'quinteroarjona@gmail.com', crypt('OQ7130726', gen_salt('bf')),
    NOW(), NOW(), '{"provider": "email", "providers": ["email"]}', '{"nombre":"Oscar Quintero","role":"AUDITOR","siglas":"OQ"}'::jsonb, NOW(), NOW(),
    '', '', '', ''
),
(
    '00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000037',
    'authenticated', 'authenticated', 'pcgs20@gmail.com', crypt('PG9224637', gen_salt('bf')),
    NOW(), NOW(), '{"provider": "email", "providers": ["email"]}', '{"nombre":"Pablo César Galvis Salamanca","role":"AUDITOR","siglas":"PG"}'::jsonb, NOW(), NOW(),
    '', '', '', ''
),
(
    '00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000038',
    'authenticated', 'authenticated', 'pmp.calidad@gmail.com', crypt('PM13727311', gen_salt('bf')),
    NOW(), NOW(), '{"provider": "email", "providers": ["email"]}', '{"nombre":"Pablo Mora","role":"AUDITOR","siglas":"PM"}'::jsonb, NOW(), NOW(),
    '', '', '', ''
),
(
    '00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000039',
    'authenticated', 'authenticated', 'ing.pedrovargas@gmail.com', crypt('PV10929397', gen_salt('bf')),
    NOW(), NOW(), '{"provider": "email", "providers": ["email"]}', '{"nombre":"Pedro Vargas","role":"AUDITOR","siglas":"PV"}'::jsonb, NOW(), NOW(),
    '', '', '', ''
),
(
    '00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000040',
    'authenticated', 'authenticated', 'qsheca@gmail.com', crypt('RA7091039', gen_salt('bf')),
    NOW(), NOW(), '{"provider": "email", "providers": ["email"]}', '{"nombre":"Ricardo Araujo","role":"AUDITOR","siglas":"RA"}'::jsonb, NOW(), NOW(),
    '', '', '', ''
),
(
    '00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000041',
    'authenticated', 'authenticated', 'sheilar.teresa@gmail.com', crypt('SP15912976', gen_salt('bf')),
    NOW(), NOW(), '{"provider": "email", "providers": ["email"]}', '{"nombre":"Sheilar Peña","role":"AUDITOR","siglas":"SP"}'::jsonb, NOW(), NOW(),
    '', '', '', ''
),
(
    '00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000042',
    'authenticated', 'authenticated', 'blancovic2000@gmail.com', crypt('VB4803380', gen_salt('bf')),
    NOW(), NOW(), '{"provider": "email", "providers": ["email"]}', '{"nombre":"Victor Blanco","role":"AUDITOR","siglas":"VB"}'::jsonb, NOW(), NOW(),
    '', '', '', ''
),
(
    '00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000043',
    'authenticated', 'authenticated', 'wpeuchert@hotmail.com', crypt('WP6949008', gen_salt('bf')),
    NOW(), NOW(), '{"provider": "email", "providers": ["email"]}', '{"nombre":"Wolfgang Peuchert","role":"AUDITOR","siglas":"WP"}'::jsonb, NOW(), NOW(),
    '', '', '', ''
),
(
    '00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000044',
    'authenticated', 'authenticated', 'yamiladumont@gmail.com', crypt('YD11821514', gen_salt('bf')),
    NOW(), NOW(), '{"provider": "email", "providers": ["email"]}', '{"nombre":"Yamila Dumont","role":"AUDITOR","siglas":"YD"}'::jsonb, NOW(), NOW(),
    '', '', '', ''
),
(
    '00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000045',
    'authenticated', 'authenticated', 'yanellys_castellanos@yahoo.com', crypt('YC7137643', gen_salt('bf')),
    NOW(), NOW(), '{"provider": "email", "providers": ["email"]}', '{"nombre":"Yurima Carrillo","role":"AUDITOR","siglas":"YC"}'::jsonb, NOW(), NOW(),
    '', '', '', ''
),
(
    '00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000046',
    'authenticated', 'authenticated', 'agroauditora@gmail.com', crypt('YJ11049843', gen_salt('bf')),
    NOW(), NOW(), '{"provider": "email", "providers": ["email"]}', '{"nombre":"Yarleska Jimenez","role":"AUDITOR","siglas":"YJ"}'::jsonb, NOW(), NOW(),
    '', '', '', ''
),
(
    '00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000047',
    'authenticated', 'authenticated', 'yurima12.fondonorma@gmail.com', crypt('YC12310919', gen_salt('bf')),
    NOW(), NOW(), '{"provider": "email", "providers": ["email"]}', '{"nombre":"Yurima Carrillo","role":"AUDITOR","siglas":"YC"}'::jsonb, NOW(), NOW(),
    '', '', '', ''
)
ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    encrypted_password = EXCLUDED.encrypted_password,
    email_confirmed_at = EXCLUDED.email_confirmed_at,
    raw_app_meta_data = EXCLUDED.raw_app_meta_data,
    raw_user_meta_data = EXCLUDED.raw_user_meta_data,
    confirmation_token = '',
    email_change = '',
    email_change_token_new = '',
    recovery_token = '',
    updated_at = NOW();

INSERT INTO public.profiles (id, nombre, role, status, created_at, updated_at)
VALUES
    ('10000000-0000-0000-0000-000000000001', 'Keyla Cristina Soteldo de Páez', 'AUDITOR', 'APPROVED', NOW(), NOW()),
    ('10000000-0000-0000-0000-000000000002', 'Félix Horacio Rojas Machado', 'AUDITOR', 'APPROVED', NOW(), NOW()),
    ('10000000-0000-0000-0000-000000000003', 'José Ramón Polo Faría', 'AUDITOR', 'APPROVED', NOW(), NOW()),
    ('10000000-0000-0000-0000-000000000004', 'Leonardo Antonio Rojas Gómez', 'AUDITOR', 'APPROVED', NOW(), NOW()),
    ('10000000-0000-0000-0000-000000000005', 'Nordy Armando Fuentes', 'AUDITOR', 'APPROVED', NOW(), NOW()),
    ('10000000-0000-0000-0000-000000000006', 'Manuel Arturo Fernández Martínez', 'AUDITOR', 'APPROVED', NOW(), NOW()),
    ('10000000-0000-0000-0000-000000000007', 'Nelson Rafael Arteaga Quevedo', 'AUDITOR', 'APPROVED', NOW(), NOW()),
    ('10000000-0000-0000-0000-000000000008', 'Yuliber Alejandra Blanco Díaz', 'AUDITOR', 'APPROVED', NOW(), NOW()),
    ('10000000-0000-0000-0000-000000000009', 'Edgar José Cachutt Márquez', 'AUDITOR', 'APPROVED', NOW(), NOW()),
    ('10000000-0000-0000-0000-000000000010', 'Ismael Enrique Díaz Valera', 'AUDITOR', 'APPROVED', NOW(), NOW()),
    ('10000000-0000-0000-0000-000000000011', 'Ana Karina Sanchez', 'AUDITOR', 'APPROVED', NOW(), NOW()),
    ('10000000-0000-0000-0000-000000000012', 'Betzy Gil', 'AUDITOR', 'APPROVED', NOW(), NOW()),
    ('10000000-0000-0000-0000-000000000013', 'Carlos Vasquez', 'AUDITOR', 'APPROVED', NOW(), NOW()),
    ('10000000-0000-0000-0000-000000000014', 'Carlos Gonzalez', 'AUDITOR', 'APPROVED', NOW(), NOW()),
    ('10000000-0000-0000-0000-000000000015', 'Carlos Villareal', 'AUDITOR', 'APPROVED', NOW(), NOW()),
    ('10000000-0000-0000-0000-000000000016', 'Daney Penaloza', 'AUDITOR', 'APPROVED', NOW(), NOW()),
    ('10000000-0000-0000-0000-000000000017', 'Denise Colina', 'AUDITOR', 'APPROVED', NOW(), NOW()),
    ('10000000-0000-0000-0000-000000000018', 'Douglas Infante', 'AUDITOR', 'APPROVED', NOW(), NOW()),
    ('10000000-0000-0000-0000-000000000019', 'Genny Mendoza', 'AUDITOR', 'APPROVED', NOW(), NOW()),
    ('10000000-0000-0000-0000-000000000020', 'Gilberto Villalba', 'AUDITOR', 'APPROVED', NOW(), NOW()),
    ('10000000-0000-0000-0000-000000000021', 'Ivan Gonzalez', 'AUDITOR', 'APPROVED', NOW(), NOW()),
    ('10000000-0000-0000-0000-000000000022', 'Jose Gregorio Goncalves', 'AUDITOR', 'APPROVED', NOW(), NOW()),
    ('10000000-0000-0000-0000-000000000023', 'Juan Paulo Torrealba', 'AUDITOR', 'APPROVED', NOW(), NOW()),
    ('10000000-0000-0000-0000-000000000024', 'Juan Hermann', 'AUDITOR', 'APPROVED', NOW(), NOW()),
    ('10000000-0000-0000-0000-000000000025', 'Karol Yulay Sánchez De Ghiano', 'AUDITOR', 'APPROVED', NOW(), NOW()),
    ('10000000-0000-0000-0000-000000000026', 'Leonardo Ladera', 'AUDITOR', 'APPROVED', NOW(), NOW()),
    ('10000000-0000-0000-0000-000000000027', 'Luis Matamoros', 'AUDITOR', 'APPROVED', NOW(), NOW()),
    ('10000000-0000-0000-0000-000000000028', 'Luis Blanco', 'AUDITOR', 'APPROVED', NOW(), NOW()),
    ('10000000-0000-0000-0000-000000000029', 'Luz María Rivas Sánchez', 'AUDITOR', 'APPROVED', NOW(), NOW()),
    ('10000000-0000-0000-0000-000000000030', 'Magyory Suarez', 'AUDITOR', 'APPROVED', NOW(), NOW()),
    ('10000000-0000-0000-0000-000000000031', 'Manuel Quintana', 'AUDITOR', 'APPROVED', NOW(), NOW()),
    ('10000000-0000-0000-0000-000000000032', 'Maria Rivas', 'AUDITOR', 'APPROVED', NOW(), NOW()),
    ('10000000-0000-0000-0000-000000000033', 'Maria Auxiliadora Cadena', 'AUDITOR', 'APPROVED', NOW(), NOW()),
    ('10000000-0000-0000-0000-000000000034', 'Ximena Pacheco', 'AUDITOR', 'APPROVED', NOW(), NOW()),
    ('10000000-0000-0000-0000-000000000035', 'Óscar Ríos', 'AUDITOR', 'APPROVED', NOW(), NOW()),
    ('10000000-0000-0000-0000-000000000036', 'Oscar Quintero', 'AUDITOR', 'APPROVED', NOW(), NOW()),
    ('10000000-0000-0000-0000-000000000037', 'Pablo César Galvis Salamanca', 'AUDITOR', 'APPROVED', NOW(), NOW()),
    ('10000000-0000-0000-0000-000000000038', 'Pablo Mora', 'AUDITOR', 'APPROVED', NOW(), NOW()),
    ('10000000-0000-0000-0000-000000000039', 'Pedro Vargas', 'AUDITOR', 'APPROVED', NOW(), NOW()),
    ('10000000-0000-0000-0000-000000000040', 'Ricardo Araujo', 'AUDITOR', 'APPROVED', NOW(), NOW()),
    ('10000000-0000-0000-0000-000000000041', 'Sheilar Peña', 'AUDITOR', 'APPROVED', NOW(), NOW()),
    ('10000000-0000-0000-0000-000000000042', 'Victor Blanco', 'AUDITOR', 'APPROVED', NOW(), NOW()),
    ('10000000-0000-0000-0000-000000000043', 'Wolfgang Peuchert', 'AUDITOR', 'APPROVED', NOW(), NOW()),
    ('10000000-0000-0000-0000-000000000044', 'Yamila Dumont', 'AUDITOR', 'APPROVED', NOW(), NOW()),
    ('10000000-0000-0000-0000-000000000045', 'Yurima Carrillo', 'AUDITOR', 'APPROVED', NOW(), NOW()),
    ('10000000-0000-0000-0000-000000000046', 'Yarleska Jimenez', 'AUDITOR', 'APPROVED', NOW(), NOW()),
    ('10000000-0000-0000-0000-000000000047', 'Yurima Carrillo', 'AUDITOR', 'APPROVED', NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET
    nombre = EXCLUDED.nombre,
    role = EXCLUDED.role,
    status = EXCLUDED.status,
    updated_at = NOW();
