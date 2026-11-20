import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  INITIAL_CONGLOMERADOS,
  buildConglomeradosWithStats,
  createConglomeradoDraftFromEntity,
  createEmptyConglomeradoFormDraft,
  filterConglomeradosByBucketKind,
  hasOrganizationValidConglomerado,
  planOrganizationRebucket,
  resolveConglomeradoBucketKind,
  scopeConglomeradosForProfile,
  validateConglomeradoDraft,
  type ConglomeradoEntity,
} from './conglomeradoDomain';
import { INITIAL_ORGANIZACIONES, type OrganizacionEntity } from './activeCertificates';
import type { UserProfile } from './healthCheck';
import { containsRawUuid } from './zeroUuid';

const ADMIN_PROFILE: UserProfile = {
  id: '11111111-1111-1111-1111-111111111111',
  email: 'admin@example.com',
  full_name: 'Admin Principal',
  role: 'ADMIN',
  status: 'APPROVED',
};

const WORKER_PROFILE: UserProfile = {
  id: '22222222-2222-2222-2222-222222222222',
  email: 'worker@example.com',
  full_name: 'Analista Operaciones',
  role: 'WORKER',
  status: 'APPROVED',
};

const AUDITOR_PROFILE: UserProfile = {
  id: '33333333-3333-3333-3333-333333333333',
  email: 'auditor@example.com',
  full_name: 'Auditor Líder',
  role: 'AUDITOR',
  status: 'APPROVED',
};

const CLIENT_PROFILE: UserProfile = {
  id: '44444444-4444-4444-4444-444444444444',
  email: 'cliente@example.com',
  full_name: 'Contacto Cliente',
  role: 'CLIENT',
  status: 'APPROVED',
};

const PENDING_CLIENT_PROFILE: UserProfile = {
  ...CLIENT_PROFILE,
  status: 'PENDING',
};

test('Step 1.2: validateConglomeradoDraft rejects short names, case-insensitive duplicate names, and duplicate codes', () => {
  assert.ok(
    validateConglomeradoDraft(
      { codigo_grupo: 'CONG-X', nombre: 'A', notas: '' },
      INITIAL_CONGLOMERADOS
    )
  );

  const dupNameError = validateConglomeradoDraft(
    { codigo_grupo: 'CONG-NEW', nombre: '  grupo industrial iberometal ', notas: '' },
    INITIAL_CONGLOMERADOS
  );
  assert.ok(dupNameError);
  assert.match(dupNameError, /Ya existe un conglomerado activo/i);

  const dupCodeError = validateConglomeradoDraft(
    { codigo_grupo: 'cong-cyb-01', nombre: 'Grupo Nuevo Válido', notas: '' },
    INITIAL_CONGLOMERADOS
  );
  assert.ok(dupCodeError);
  assert.match(dupCodeError, /código de conglomerado/i);

  // Editing same record with its own name and code must pass cleanly
  const sameEditOk = validateConglomeradoDraft(
    createConglomeradoDraftFromEntity(INITIAL_CONGLOMERADOS[0]),
    INITIAL_CONGLOMERADOS,
    INITIAL_CONGLOMERADOS[0].id
  );
  assert.equal(sameEditOk, null);

  // Empty code is allowed (optional) and archived duplicates do not block
  const archivedGroup: ConglomeradoEntity = {
    id: '20000000-0000-0000-0000-000000000099',
    codigo_grupo: 'CONG-ARC',
    nombre: 'Grupo Archivado',
    es_individual_auto: false,
    notas: null,
    deleted_at: '2026-10-01T00:00:00Z',
  };
  assert.equal(
    validateConglomeradoDraft(
      { codigo_grupo: 'CONG-ARC', nombre: 'Grupo Archivado', notas: '' },
      [...INITIAL_CONGLOMERADOS, archivedGroup]
    ),
    null
  );
});

test('Step 1.2: buildConglomeradosWithStats classifies SOLO vs MULTI_ORG, counts certificates, and filters SOLO buckets', () => {
  const extraEmptyGroup: ConglomeradoEntity = {
    id: '20000000-0000-0000-0000-000000000010',
    codigo_grupo: 'CONG-VAC-01',
    nombre: 'Grupo Vacío Temporal',
    es_individual_auto: false,
    notas: null,
  };

  const certs = [
    { id_organizacion: '30000000-0000-0000-0000-000000000001' },
    { id_organizacion: '30000000-0000-0000-0000-000000000001' },
    { id_organizacion: '30000000-0000-0000-0000-000000000003' },
    { id_organizacion: '30000000-0000-0000-0000-000000000003', deleted_at: '2026-01-01T00:00:00Z' },
    { id_organizacion: '30000000-0000-0000-0000-000000000002' },
  ];

  const stats = buildConglomeradosWithStats(
    [...INITIAL_CONGLOMERADOS, extraEmptyGroup],
    INITIAL_ORGANIZACIONES,
    certs
  );

  const multiGroup = stats.find((g) => g.id === '20000000-0000-0000-0000-000000000001');
  assert.ok(multiGroup);
  assert.equal(multiGroup.bucketKind, 'MULTI_ORG');
  assert.equal(multiGroup.organizacionesCount, 2);
  assert.equal(multiGroup.certificadosCount, 3);

  const soloGroup = stats.find((g) => g.id === '20000000-0000-0000-0000-000000000002');
  assert.ok(soloGroup);
  assert.equal(soloGroup.bucketKind, 'SOLO');
  assert.equal(soloGroup.organizacionesCount, 1);
  assert.equal(soloGroup.certificadosCount, 1);

  const vacioGroup = stats.find((g) => g.id === '20000000-0000-0000-0000-000000000010');
  assert.ok(vacioGroup);
  assert.equal(vacioGroup.bucketKind, 'VACIO');

  const onlySolo = filterConglomeradosByBucketKind(stats, 'SOLO');
  assert.equal(onlySolo.length, 2);
  assert.ok(onlySolo.every((g) => g.bucketKind === 'SOLO'));
  assert.equal(filterConglomeradosByBucketKind(stats, 'ALL').length, stats.length);
  assert.equal(resolveConglomeradoBucketKind(0), 'VACIO');
  assert.equal(resolveConglomeradoBucketKind(1), 'SOLO');
  assert.equal(resolveConglomeradoBucketKind(3), 'MULTI_ORG');
});

test('Step 1.2: planOrganizationRebucket predicts auto-archive of source group and rejects invalid/same/archived targets without leaking UUIDs', () => {
  // Move CyberCloud (sole org in CONG-CYB-01) -> CONG-IND-01 (currently 2 orgs)
  const validMove = planOrganizationRebucket(
    '30000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000001',
    INITIAL_ORGANIZACIONES,
    INITIAL_CONGLOMERADOS
  );
  assert.equal(validMove.valid, true);
  assert.equal(validMove.errorMessage, null);
  assert.equal(validMove.sourceGroupId, '20000000-0000-0000-0000-000000000002');
  assert.equal(validMove.targetGroupId, '20000000-0000-0000-0000-000000000001');
  assert.equal(validMove.sourceRemainingOrgCount, 0);
  assert.equal(validMove.willArchiveSourceGroup, true);
  assert.equal(validMove.targetNewOrgCount, 3);

  // Move Iberometal (one of 2 orgs in CONG-IND-01) -> CONG-CYB-01 => source survives
  const surviveMove = planOrganizationRebucket(
    '30000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000002',
    INITIAL_ORGANIZACIONES,
    INITIAL_CONGLOMERADOS
  );
  assert.equal(surviveMove.valid, true);
  assert.equal(surviveMove.sourceRemainingOrgCount, 1);
  assert.equal(surviveMove.willArchiveSourceGroup, false);
  assert.equal(surviveMove.targetNewOrgCount, 2);

  // Same group must be rejected
  const sameGroup = planOrganizationRebucket(
    '30000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    INITIAL_ORGANIZACIONES,
    INITIAL_CONGLOMERADOS
  );
  assert.equal(sameGroup.valid, false);
  assert.ok(sameGroup.errorMessage);
  assert.equal(containsRawUuid(sameGroup.errorMessage), false);

  // Archived target group must be rejected
  const archivedGroup: ConglomeradoEntity = {
    id: '20000000-0000-0000-0000-000000000088',
    codigo_grupo: 'CONG-DEAD',
    nombre: 'Conglomerado Archivado',
    es_individual_auto: false,
    notas: null,
    deleted_at: '2026-10-01T00:00:00Z',
  };
  const archivedTarget = planOrganizationRebucket(
    '30000000-0000-0000-0000-000000000002',
    archivedGroup.id,
    INITIAL_ORGANIZACIONES,
    [...INITIAL_CONGLOMERADOS, archivedGroup]
  );
  assert.equal(archivedTarget.valid, false);
  assert.ok(archivedTarget.errorMessage);
  assert.equal(containsRawUuid(archivedTarget.errorMessage), false);

  // Malformed UUIDs must be rejected without exposing UUID text
  const badUuid = planOrganizationRebucket(
    'not-a-uuid',
    '12345678-1234-4123-8123-123456789012',
    INITIAL_ORGANIZACIONES,
    INITIAL_CONGLOMERADOS
  );
  assert.equal(badUuid.valid, false);
  assert.ok(badUuid.errorMessage);
  assert.equal(containsRawUuid(badUuid.errorMessage), false);
});

test('Step 1.2: scopeConglomeradosForProfile enforces strict CLIENT isolation without leaking sibling companies and blocks AUDITOR', () => {
  const threeCompanyGroup: ConglomeradoEntity = {
    id: '20000000-0000-0000-0000-000000000050',
    codigo_grupo: 'CONG-HOLDING',
    nombre: 'Holding Corporativo Tres Empresas',
    es_individual_auto: false,
    notas: null,
  };

  const holdingOrgs: OrganizacionEntity[] = [
    {
      id: '30000000-0000-0000-0000-000000000051',
      id_grupo_empresarial: threeCompanyGroup.id,
      nombre: 'Empresa Alfa S.A.',
      rif: 'J-10000001-1',
      certificados_count: 2,
    },
    {
      id: '30000000-0000-0000-0000-000000000052',
      id_grupo_empresarial: threeCompanyGroup.id,
      nombre: 'Empresa Hermana Secreta Beta S.A.',
      rif: 'J-10000002-2',
      certificados_count: 5,
    },
    {
      id: '30000000-0000-0000-0000-000000000053',
      id_grupo_empresarial: threeCompanyGroup.id,
      nombre: 'Empresa Hermana Secreta Gamma S.A.',
      rif: 'J-10000003-3',
      certificados_count: 3,
    },
  ];

  const stats = buildConglomeradosWithStats(
    [...INITIAL_CONGLOMERADOS, threeCompanyGroup],
    [...INITIAL_ORGANIZACIONES, ...holdingOrgs],
    []
  );

  // ADMIN and WORKER see all groups & orgs
  assert.equal(scopeConglomeradosForProfile(stats, ADMIN_PROFILE, []).length, 4);
  assert.equal(scopeConglomeradosForProfile(stats, WORKER_PROFILE, []).length, 4);

  // AUDITOR receives [] (Block 2 forbidden)
  assert.deepEqual(scopeConglomeradosForProfile(stats, AUDITOR_PROFILE, []), []);

  // Unapproved / null profiles receive []
  assert.deepEqual(scopeConglomeradosForProfile(stats, PENDING_CLIENT_PROFILE, ['30000000-0000-0000-0000-000000000051']), []);
  assert.deepEqual(scopeConglomeradosForProfile(stats, null, []), []);

  // CLIENT assigned only to Empresa Alfa must only see threeCompanyGroup with 1 org & count=2 (no Beta/Gamma leakage)
  const clientScoped = scopeConglomeradosForProfile(
    stats,
    CLIENT_PROFILE,
    ['30000000-0000-0000-0000-000000000051']
  );
  assert.equal(clientScoped.length, 1);
  assert.equal(clientScoped[0].id, threeCompanyGroup.id);
  assert.equal(clientScoped[0].organizacionesCount, 1);
  assert.equal(clientScoped[0].certificadosCount, 2);
  assert.equal(clientScoped[0].bucketKind, 'SOLO');
  assert.deepEqual(
    clientScoped[0].organizaciones.map((o) => o.nombre),
    ['Empresa Alfa S.A.']
  );
});

test('Step 1.2: hasOrganizationValidConglomerado and draft helpers behave consistently', () => {
  const emptyDraft = createEmptyConglomeradoFormDraft();
  assert.deepEqual(emptyDraft, { codigo_grupo: '', nombre: '', notas: '' });

  assert.equal(hasOrganizationValidConglomerado(INITIAL_ORGANIZACIONES[0], INITIAL_CONGLOMERADOS), true);
  assert.equal(hasOrganizationValidConglomerado(undefined, INITIAL_CONGLOMERADOS), false);
  assert.equal(
    hasOrganizationValidConglomerado(
      { ...INITIAL_ORGANIZACIONES[0], deleted_at: '2026-01-01T00:00:00Z' },
      INITIAL_CONGLOMERADOS
    ),
    false
  );
  assert.equal(
    hasOrganizationValidConglomerado(
      { ...INITIAL_ORGANIZACIONES[0], id_grupo_empresarial: '20000000-0000-0000-0000-000000009999' },
      INITIAL_CONGLOMERADOS
    ),
    false
  );
});

test('Step 1.2: 06_datos_prueba.sql seeds >=1 MULTI_ORG and >=1 SOLO conglomerado and links organizaciones idempotently', () => {
  const sql06 = fs.readFileSync(
    path.resolve(process.cwd(), 'public/supabase/queries/06_datos_prueba.sql'),
    'utf8'
  );
  assert.match(sql06, /INSERT INTO public\.grupo_empresarial/i);
  assert.ok(sql06.includes('20000000-0000-0000-0000-000000000001'));
  assert.ok(sql06.includes('20000000-0000-0000-0000-000000000002'));
  assert.ok(sql06.includes('CONG-IND-01'));
  assert.ok(sql06.includes('CONG-CYB-01'));
  assert.match(sql06, /INSERT INTO public\.organizacion\s*\(\s*id,\s*id_grupo_empresarial/i);
});
