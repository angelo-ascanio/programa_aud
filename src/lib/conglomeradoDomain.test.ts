import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  INITIAL_CONGLOMERADOS,
  buildConglomeradoAuditsList,
  buildConglomeradosWithStats,
  computeOrgActiveCertificatesMap,
  createConglomeradoDraftFromEntity,
  createEmptyConglomeradoFormDraft,
  filterConglomeradosByBucketKind,
  getEligibleSoloOrganizationsForRebucket,
  hasOrganizationValidConglomerado,
  planOrganizationRebucket,
  resolveConglomeradoBucketKind,
  resolveConglomeradoFormAbreviacion,
  scopeConglomeradosForProfile,
  validateConglomeradoDraft,
  validateOrganizationDetachFromConglomerado,
  type ActiveCertCountingRef,
  type ConglomeradoEntity,
  type ConglomeradoVinculoRef,
} from './conglomeradoDomain';
import { INITIAL_ORGANIZACIONES, type OrganizacionEntity } from './activeCertificates';
import type { UserProfile } from './healthCheck';
import {
  CERTIFICACION_NAV_ITEMS,
  getVisibleDomainMenus,
} from './healthCheck';
import { normalizeDomainSubview } from './accessControl';
import { getSubviewLabel } from './breadcrumb';
import { renderConglomeradoView, type ConglomeradoViewState } from '../views/conglomeradoView';
import { renderOrganizacionView, type OrganizacionViewState } from '../views/organizacionView';
import { renderCertificacionView } from '../views/certificacionView';
import { SAMPLE_CERTIFICATE_RECORDS } from './searchControls';
import { assertZeroUuidExposure, containsRawUuid } from './zeroUuid';
import type { ProgramacionAuditEntity } from './auditExecution';
import type { ProgramaAuditoriaEntity } from './auditPlanningEngine';

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
  assert.deepEqual(emptyDraft, { codigo_grupo: '', nombre: '', abreviacion: '', notas: '' });

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

function extractTbodyBlocks(html: string): string[] {
  return [...html.matchAll(/<tbody[\s\S]*?<\/tbody>/gi)].map((m) => m[0]);
}

function assertZeroUuidExposureInHtml(html: string, label: string): void {
  const withoutAttrs = html
    .replace(/\s(?:value|data-[a-z0-9-]+|href|id|for|name)="[^"]*"/gi, '')
    .replace(/\s(?:value|data-[a-z0-9-]+|href|id|for|name)='[^']*'/gi, '');
  assert.equal(
    containsRawUuid(withoutAttrs),
    false,
    `${label} must not expose raw UUIDs in visible HTML text`
  );
}

test('Step 1.3: CERTIFICACION_NAV_ITEMS puts Conglomerado first, normalizes subviews, and hides Block 2 from AUDITOR', () => {
  assert.equal(CERTIFICACION_NAV_ITEMS[0].id, 'conglomerados');
  assert.equal(CERTIFICACION_NAV_ITEMS[0].label, 'Conglomerado');
  assert.deepEqual(
    CERTIFICACION_NAV_ITEMS.map((i) => i.id),
    ['conglomerados', 'organizations', 'certificates', 'vinculo', 'auditors', 'experts']
  );

  for (const alias of ['conglomerados', 'conglomerado', 'conglomerate', 'grupos', ' CONGLOMERADOS ']) {
    assert.equal(normalizeDomainSubview('certificacion', alias), 'conglomerados');
  }
  assert.equal(getSubviewLabel('certificacion', 'conglomerados'), 'Conglomerado');

  const auditorMenus = getVisibleDomainMenus(AUDITOR_PROFILE);
  assert.equal(
    auditorMenus.some((m) => m.id === 'certificacion'),
    false,
    'AUDITOR must not see Block 2 Certificación menu'
  );

  const clientMenus = getVisibleDomainMenus(CLIENT_PROFILE);
  const clientCertMenu = clientMenus.find((m) => m.id === 'certificacion');
  assert.ok(clientCertMenu);
  assert.equal(clientCertMenu.items[0].id, 'conglomerados');
  assert.equal(clientCertMenu.items[0].label, 'Conglomerado');
  assert.equal(clientCertMenu.items.some((i) => i.id === 'experts'), false);
});

test('Step 1.3: renderConglomeradoView table enforces colgroup=100%, zero <button in tbody, reactive SOLO filter, and Zero-UUID UI', () => {
  const stats = buildConglomeradosWithStats(
    INITIAL_CONGLOMERADOS,
    INITIAL_ORGANIZACIONES,
    [
      { id_organizacion: '30000000-0000-0000-0000-000000000001' },
      { id_organizacion: '30000000-0000-0000-0000-000000000002' },
    ]
  );

  const baseState: ConglomeradoViewState = {
    selectedConglomeradoId: null,
    query: '',
    viewMode: 'list',
    sortColumn: null,
    sortDirection: 'none',
    isEditingAttributes: false,
    activeChildTab: 'organizaciones',
    isSidebarOpen: true,
    facetSelections: {},
    isCreating: false,
  };

  const listHtml = renderConglomeradoView({
    profile: ADMIN_PROFILE,
    state: baseState,
    conglomerados: stats,
    allOrganizaciones: INITIAL_ORGANIZACIONES,
  });

  // Verify <colgroup> percentage widths sum to 100%
  const colWidths = [...listHtml.matchAll(/<col[^>]*style="width:\s*([0-9.]+)%;"/gi)].map(
    (m) => Number(m[1])
  );
  assert.equal(colWidths.length, 4);
  const totalPct = colWidths.reduce((acc, v) => acc + v, 0);
  assert.ok(Math.abs(totalPct - 100) < 0.05, `Expected 100%, got ${totalPct}`);

  // Zero <button inside <tbody>
  for (const tbody of extractTbodyBlocks(listHtml)) {
    assert.equal(/<button\b/i.test(tbody), false, '<tbody> must never contain <button> elements');
  }
  assertZeroUuidExposureInHtml(listHtml, 'Conglomerado List Multi View');

  // Filtering SOLO facet isolates single-org buckets cleanly
  const soloHtml = renderConglomeradoView({
    profile: ADMIN_PROFILE,
    state: {
      ...baseState,
      facetSelections: { bucket: new Set(['SOLO']) },
    },
    conglomerados: stats,
    allOrganizaciones: INITIAL_ORGANIZACIONES,
  });
  assert.match(soloHtml, /CyberCloud Solutions S\.L\./);
  assert.equal(/Grupo Industrial Iberometal/.test(soloHtml), false);

  // Detail View with rebucket preview shows auto-archive warning & zero buttons in tbody
  const detailHtml = renderConglomeradoView({
    profile: ADMIN_PROFILE,
    state: {
      ...baseState,
      selectedConglomeradoId: INITIAL_CONGLOMERADOS[0].id,
      rebucketTargetOrgId: '30000000-0000-0000-0000-000000000002',
    },
    conglomerados: stats,
    allOrganizaciones: INITIAL_ORGANIZACIONES,
  });
  assert.match(detailHtml, /se archivará automáticamente/i);
  for (const tbody of extractTbodyBlocks(detailHtml)) {
    assert.equal(/<button\b/i.test(tbody), false, 'Detail <tbody> must not contain <button>');
  }
  assertZeroUuidExposureInHtml(detailHtml, 'Conglomerado Detail View');
});

test('Step 1.3: Organizacion Detail displays Conglomerado parent chip, optional group select, and Zero-UUID options', () => {
  const orgBaseState: OrganizacionViewState = {
    selectedOrganizacionId: INITIAL_ORGANIZACIONES[0].id,
    query: '',
    hasActiveCertificates: 'ALL',
    selectedSectorIaf: 'ALL',
    viewMode: 'grid',
    sortColumn: null,
    sortDirection: 'none',
    isEditingAttributes: false,
    activeChildTab: 'certificados',
    isSidebarOpen: true,
    isCreating: false,
  };

  const readHtml = renderOrganizacionView({
    profile: ADMIN_PROFILE,
    state: orgBaseState,
    organizaciones: INITIAL_ORGANIZACIONES,
    conglomerados: INITIAL_CONGLOMERADOS,
    certificados: [],
  });
  assert.match(readHtml, /Conglomerado/);
  assert.match(readHtml, /Grupo Industrial Iberometal/);
  assertZeroUuidExposureInHtml(readHtml, 'Organizacion Detail Read View');

  const editHtml = renderOrganizacionView({
    profile: ADMIN_PROFILE,
    state: { ...orgBaseState, isEditingAttributes: true },
    organizaciones: INITIAL_ORGANIZACIONES,
    conglomerados: INITIAL_CONGLOMERADOS,
    certificados: [],
  });
  assert.match(editHtml, /id="orgGrupoEmpresarialSelect"/);
  assert.match(editHtml, /Separar a grupo individual propio/);
  assertZeroUuidExposureInHtml(editHtml, 'Organizacion Detail Edit View');

  const addHtml = renderOrganizacionView({
    profile: ADMIN_PROFILE,
    state: { ...orgBaseState, selectedOrganizacionId: null, isCreating: true },
    organizaciones: INITIAL_ORGANIZACIONES,
    conglomerados: INITIAL_CONGLOMERADOS,
    certificados: [],
  });
  assert.match(addHtml, /Automático — Crear conglomerado individual propio \(1:1\)/);
  assertZeroUuidExposureInHtml(addHtml, 'Organizacion Detail Add View');

  // Certificacion dispatcher handles 'conglomerados' subview directly
  const certHtml = renderCertificacionView(ADMIN_PROFILE, {
    activeSubSection: 'conglomerados',
    filters: { query: '', selectedStatus: 'ALL', selectedStandard: 'ALL', viewMode: 'grid' },
    filteredCertificates: SAMPLE_CERTIFICATE_RECORDS,
    allCertificates: SAMPLE_CERTIFICATE_RECORDS,
    availableStatuses: [],
    availableStandards: [],
    organizations: [],
    sites: [],
    processes: [],
    shifts: [],
    loading: false,
    allConglomerados: INITIAL_CONGLOMERADOS,
    allOrganizaciones: INITIAL_ORGANIZACIONES,
  });
  assert.match(certHtml, /Conglomerados Empresariales/);
});

function buildTestProgramacionAudit(
  overrides: Partial<ProgramacionAuditEntity> & {
    id: string;
    codigo_auditoria: string;
    id_certificado: string;
    id_organizacion: string;
    organizacion_nombre: string;
  }
): ProgramacionAuditEntity {
  return {
    numero_certificado: 'CERT-001',
    norma_codigo: 'ISO 9001:2015',
    sector_iaf: 17,
    tipo_auditoria: 'Seguimiento 1',
    metodologia: 'Presencial',
    fecha_inicio: '',
    fecha_fin: '',
    dias_auditor: 2,
    estatus: 'Planificado',
    auditor_lider_id: '70000000-0000-0000-0000-000000000001',
    auditor_lider: 'Auditor Demo',
    sede_principal_direccion: 'Sede Central',
    equipo: [],
    sitiosMuestreo: [],
    matrizNormativa: [],
    ...overrides,
  };
}

test('Step 3.1: computeOrgActiveCertificatesMap counts only active non-deleted certificates matching organizacionView', () => {
  const orgA = '30000000-0000-0000-0000-000000000001';
  const orgB = '30000000-0000-0000-0000-000000000003';

  const refs: ActiveCertCountingRef[] = [
    { id: 'c1', id_organizacion: orgA, estatus: 'Activo' },
    { id: 'c2', id_organizacion: orgA, estatus: 'Vigente' },
    { id: 'c3', id_organizacion: orgA, estatus: 'Estudio' },
    { id: 'c4', id_organizacion: orgA, estatus: 'Suspendido' },
    { id: 'c5', id_organizacion: orgA, estatus: 'Cancelado' },
    { id: 'c6', id_organizacion: orgA, estatus: 'Activo', deleted_at: '2026-09-01T00:00:00Z' },
    { id: 'c7', organizacion_id: orgB, estatus: 'Inactivo' },
    { id: 'c8', organizacion_id: orgB, estatus: 'En Espera' },
  ];

  const counts = computeOrgActiveCertificatesMap(refs);
  assert.equal(counts.get(orgA), 3);
  assert.equal(counts.get(orgB), 0);
});

test('Step 3.1: getEligibleSoloOrganizationsForRebucket excludes MULTI_ORG organizations and target group members', () => {
  const anotherMultiGroup: ConglomeradoEntity = {
    id: '20000000-0000-0000-0000-000000000077',
    codigo_grupo: 'CONG-MULTI-2',
    nombre: 'Segundo Conglomerado Multi',
    es_individual_auto: false,
    notas: null,
  };
  const extraOrgs: OrganizacionEntity[] = [
    {
      id: '30000000-0000-0000-0000-000000000071',
      id_grupo_empresarial: anotherMultiGroup.id,
      nombre: 'Filial Multi Uno S.A.',
      rif: 'J-77000001-1',
    },
    {
      id: '30000000-0000-0000-0000-000000000072',
      id_grupo_empresarial: anotherMultiGroup.id,
      nombre: 'Filial Multi Dos S.A.',
      rif: 'J-77000002-2',
    },
  ];

  const stats = buildConglomeradosWithStats(
    [...INITIAL_CONGLOMERADOS, anotherMultiGroup],
    [...INITIAL_ORGANIZACIONES, ...extraOrgs],
    []
  );

  // Targeting CONG-IND-01 should only offer SOLO groups (CyberCloud and BioAlimentos), never Filial Multi Uno/Dos
  const eligible = getEligibleSoloOrganizationsForRebucket(stats, INITIAL_CONGLOMERADOS[0].id);
  const eligibleNames = eligible.map((item) => item.organizacion.nombre);
  assert.equal(eligible.length, 2);
  assert.ok(eligibleNames.includes('CyberCloud Solutions S.L.'));
  assert.ok(eligibleNames.includes('BioAlimentos del Sur S.A.'));
  assert.equal(eligibleNames.includes('Filial Multi Uno S.A.'), false);
  assert.equal(eligibleNames.includes('Filial Multi Dos S.A.'), false);

  // Targeting CyberCloud itself must exclude CyberCloud and still exclude MULTI_ORG members
  const eligibleForCyb = getEligibleSoloOrganizationsForRebucket(
    stats,
    INITIAL_CONGLOMERADOS[1].id
  );
  assert.deepEqual(
    eligibleForCyb.map((item) => item.organizacion.nombre),
    ['BioAlimentos del Sur S.A.']
  );
});

test('Step 3.1: validateOrganizationDetachFromConglomerado enforces MULTI_ORG requirement and blocks Nivel 2 inter-org links without raw UUIDs', () => {
  const stats = buildConglomeradosWithStats(INITIAL_CONGLOMERADOS, INITIAL_ORGANIZACIONES, []);
  const multiGroup = stats.find((g) => g.id === INITIAL_CONGLOMERADOS[0].id);
  const soloGroup = stats.find((g) => g.id === INITIAL_CONGLOMERADOS[1].id);
  assert.ok(multiGroup);
  assert.ok(soloGroup);

  const org1 = INITIAL_ORGANIZACIONES[0].id;
  const org2 = INITIAL_ORGANIZACIONES[2].id;

  // SOLO group cannot detach
  const soloCheck = validateOrganizationDetachFromConglomerado({
    group: soloGroup,
    orgId: INITIAL_ORGANIZACIONES[1].id,
  });
  assert.equal(soloCheck.valid, false);
  assert.ok(soloCheck.errorMessage);
  assert.equal(containsRawUuid(soloCheck.errorMessage), false);

  // Independent org in MULTI_ORG can detach
  const okDetach = validateOrganizationDetachFromConglomerado({
    group: multiGroup,
    orgId: org1,
    vinculos: [],
    auditPrograms: [],
  });
  assert.equal(okDetach.valid, true);
  assert.equal(okDetach.organization?.id, org1);

  // Active Nivel 2 vinculo involving both org1 and org2 blocks detachment cleanly
  const sharedVinculo: ConglomeradoVinculoRef = {
    id: '80000000-0000-0000-0000-000000000001',
    etiqueta: 'Programa Corporativo Nivel 2 Iberometal',
    codigo_vinculo: 'VIN-IND-01',
    certificados: [
      { id_certificado: 'c-1', id_organizacion: org1 },
      { id_certificado: 'c-2', id_organizacion: org2 },
    ],
  };
  const blockedByVinculo = validateOrganizationDetachFromConglomerado({
    group: multiGroup,
    orgId: org1,
    vinculos: [sharedVinculo],
    auditPrograms: [],
  });
  assert.equal(blockedByVinculo.valid, false);
  assert.ok(blockedByVinculo.errorMessage);
  assert.match(blockedByVinculo.errorMessage, /Programa Corporativo Nivel 2 Iberometal/);
  assert.equal(containsRawUuid(blockedByVinculo.errorMessage), false);

  // Active cross-org auditProgram also blocks detachment cleanly
  const activeCrossProgram: ProgramaAuditoriaEntity = {
    id: '90000000-0000-0000-0000-000000000001',
    codigo_programa: 'PRG-CORP-2026',
    etiqueta: 'Campaña Integrada Iberometal',
    nivel_vinculacion: 'NIVEL_2_INTER_ORG',
    tipo_vinculacion: 'Conjunta',
    es_vinculada: true,
    auditorias: [
      buildTestProgramacionAudit({
        id: 'a-1',
        codigo_auditoria: 'AUD-1',
        id_certificado: 'c-1',
        id_organizacion: org1,
        organizacion_nombre: 'Industrias Metálicas Ibéricas S.A.',
        estado_ciclo: 'Planificada',
      }),
      buildTestProgramacionAudit({
        id: 'a-2',
        codigo_auditoria: 'AUD-2',
        id_certificado: 'c-2',
        id_organizacion: org2,
        organizacion_nombre: 'Logística Ibérica Norte S.L.',
        estado_ciclo: 'Planificada',
      }),
    ],
  };
  const blockedByProgram = validateOrganizationDetachFromConglomerado({
    group: multiGroup,
    orgId: org1,
    vinculos: [],
    auditPrograms: [activeCrossProgram],
  });
  assert.equal(blockedByProgram.valid, false);
  assert.ok(blockedByProgram.errorMessage);
  assert.match(blockedByProgram.errorMessage, /Campaña Integrada Iberometal/);
  assert.equal(containsRawUuid(blockedByProgram.errorMessage), false);
});

test('Step 3.1: buildConglomeradoAuditsList computes estatus_auditoria, sorts most recent first, and isolates CLIENT orgs', () => {
  const stats = buildConglomeradosWithStats(INITIAL_CONGLOMERADOS, INITIAL_ORGANIZACIONES, []);
  const multiGroup = stats.find((g) => g.id === INITIAL_CONGLOMERADOS[0].id);
  assert.ok(multiGroup);

  const org1 = INITIAL_ORGANIZACIONES[0]; // Industrias Metálicas Ibéricas
  const org2 = INITIAL_ORGANIZACIONES[2]; // Logística Ibérica Norte

  const auditOld = buildTestProgramacionAudit({
    id: 'a0000000-0000-0000-0000-000000000001',
    codigo_auditoria: 'AUD-OLD-2025',
    id_certificado: 'c0000000-0000-0000-0000-000000000001',
    numero_certificado: 'CERT-IB-2025',
    id_organizacion: org1.id,
    organizacion_nombre: org1.nombre,
    fecha_inicio: '2025-04-10',
    estatus: 'Cerrado',
    estado_ciclo: 'Cerrada',
    revisado: true,
    fecha_cierre_auditoria: '2025-04-20',
    created_at: '2025-01-05T10:00:00Z',
  });

  const auditNewerSibling = buildTestProgramacionAudit({
    id: 'a0000000-0000-0000-0000-000000000002',
    codigo_auditoria: 'AUD-NEW-2026',
    id_certificado: 'c0000000-0000-0000-0000-000000000002',
    numero_certificado: 'CERT-LOG-2026',
    id_organizacion: org2.id,
    organizacion_nombre: org2.nombre,
    fecha_inicio: '2026-11-15',
    estatus: 'Planificado',
    estado_ciclo: 'Planificada',
    created_at: '2026-06-01T10:00:00Z',
  });

  const auditCancelled = buildTestProgramacionAudit({
    id: 'a0000000-0000-0000-0000-000000000003',
    codigo_auditoria: 'AUD-CAN-2026',
    id_certificado: 'c0000000-0000-0000-0000-000000000003',
    numero_certificado: 'CERT-IB-CAN',
    id_organizacion: org1.id,
    organizacion_nombre: org1.nombre,
    fecha_inicio: '2026-08-01',
    estatus: 'Cancelada',
    estado_ciclo: 'Cancelada',
    created_at: '2026-03-01T10:00:00Z',
  });

  const auditNoDate = buildTestProgramacionAudit({
    id: 'a0000000-0000-0000-0000-000000000004',
    codigo_auditoria: 'AUD-PEND-NODATE',
    id_certificado: 'c0000000-0000-0000-0000-000000000004',
    numero_certificado: 'CERT-IB-NODATE',
    id_organizacion: org1.id,
    organizacion_nombre: org1.nombre,
    fecha_inicio: '',
    created_at: '2026-02-01T10:00:00Z',
  });

  // Admin sees all 4 sorted descending by sortDateKey (2026-11-15 -> 2026-08-01 -> 2025-04-10 -> '')
  const adminList = buildConglomeradoAuditsList({
    group: multiGroup,
    programacionAudits: [auditOld, auditNoDate, auditNewerSibling, auditCancelled],
    profile: ADMIN_PROFILE,
  });
  assert.deepEqual(
    adminList.map((i) => i.audit.codigo_auditoria),
    ['AUD-NEW-2026', 'AUD-CAN-2026', 'AUD-OLD-2025', 'AUD-PEND-NODATE']
  );
  assert.equal(adminList[1].estatus_auditoria, 'Cancelada');
  assert.equal(adminList[2].estatus_auditoria, 'Completada ✓');
  assert.equal(adminList[3].dateLabel, 'Sin fecha');

  // CLIENT assigned only to org1 must NEVER see org2's audit (AUD-NEW-2026)
  const clientList = buildConglomeradoAuditsList({
    group: multiGroup,
    programacionAudits: [auditOld, auditNoDate, auditNewerSibling, auditCancelled],
    profile: CLIENT_PROFILE,
    authorizedClientOrgIds: [org1.id],
  });
  assert.deepEqual(
    clientList.map((i) => i.audit.codigo_auditoria),
    ['AUD-CAN-2026', 'AUD-OLD-2025', 'AUD-PEND-NODATE']
  );
  assert.equal(
    clientList.some((i) => i.audit.id_organizacion === org2.id),
    false
  );
});

test('Step 3.1: Conglomerado Detail View renders Organizaciones & Auditorías tabs, SOLO-only rebucket, detach outside tbody, and open-audit-resumen rows', () => {
  const stats = buildConglomeradosWithStats(INITIAL_CONGLOMERADOS, INITIAL_ORGANIZACIONES, []);
  const multiGroupId = INITIAL_CONGLOMERADOS[0].id;
  const org1 = INITIAL_ORGANIZACIONES[0];
  const org2 = INITIAL_ORGANIZACIONES[2];

  const certRefs: ActiveCertCountingRef[] = [
    { id: 'c1', id_organizacion: org1.id, estatus: 'Activo' },
    { id: 'c2', id_organizacion: org1.id, estatus: 'Vigente' },
    { id: 'c3', id_organizacion: org1.id, estatus: 'Cancelado' },
    { id: 'c4', id_organizacion: org2.id, estatus: 'Activo' },
  ];

  const audits: ProgramacionAuditEntity[] = [
    buildTestProgramacionAudit({
      id: 'a0000000-0000-0000-0000-000000000011',
      codigo_auditoria: 'AUD-IB-EARLY',
      id_certificado: 'c0000000-0000-0000-0000-000000000011',
      numero_certificado: 'CERT-IB-01',
      id_organizacion: org1.id,
      organizacion_nombre: org1.nombre,
      fecha_inicio: '2026-03-10',
      estatus: 'Planificado',
    }),
    buildTestProgramacionAudit({
      id: 'a0000000-0000-0000-0000-000000000012',
      codigo_auditoria: 'AUD-IB-LATEST',
      id_certificado: 'c0000000-0000-0000-0000-000000000012',
      numero_certificado: 'CERT-LOG-02',
      id_organizacion: org2.id,
      organizacion_nombre: org2.nombre,
      fecha_inicio: '2026-10-20',
      estatus: 'En Ejecución',
      estado_ciclo: 'En Ejecución',
    }),
  ];

  const baseState: ConglomeradoViewState = {
    selectedConglomeradoId: multiGroupId,
    query: '',
    viewMode: 'list',
    sortColumn: null,
    sortDirection: 'none',
    isEditingAttributes: false,
    activeChildTab: 'organizaciones',
    isSidebarOpen: true,
    facetSelections: {},
    isCreating: false,
    detachTargetOrgId: org1.id,
  };

  // 1) Tab Organizaciones
  const orgsTabHtml = renderConglomeradoView({
    profile: ADMIN_PROFILE,
    state: baseState,
    conglomerados: stats,
    allOrganizaciones: INITIAL_ORGANIZACIONES,
    certificados: certRefs,
    programacionAudits: audits,
    vinculos: [],
    auditPrograms: [],
  });

  // Tabs must be labeled Organizaciones and Auditorías (no legacy "Vínculos")
  assert.match(orgsTabHtml, /data-conglomerado-tab="organizaciones"[^>]*>[\s\S]*Organizaciones/);
  assert.match(orgsTabHtml, /data-conglomerado-tab="auditorias"[^>]*>[\s\S]*Auditorías/);
  assert.equal(/data-conglomerado-tab="vinculos"/i.test(orgsTabHtml), false);

  // Active cert counts match computeOrgActiveCertificatesMap (2 activos for org1, 1 activo for org2)
  assert.match(orgsTabHtml, /2 activos/);
  assert.match(orgsTabHtml, /1 activo/);

  // Rebucket select only includes SOLO organizations
  const rebucketMatch = orgsTabHtml.match(/<select[^>]*id="rebucketOrgSelect"[\s\S]*?<\/select>/i);
  assert.ok(rebucketMatch);
  assert.match(rebucketMatch[0], /CyberCloud Solutions S\.L\./);
  assert.match(rebucketMatch[0], /BioAlimentos del Sur S\.A\./);
  assert.equal(/Industrias Metálicas Ibéricas/.test(rebucketMatch[0]), false);

  // Detach controls exist outside <tbody>, zero <button> inside <tbody>
  assert.match(orgsTabHtml, /id="detachOrgSelect"/);
  assert.match(orgsTabHtml, /id="confirmDetachOrgBtn"/);
  assert.match(orgsTabHtml, /data-action="detach-org-from-conglomerado"/);
  for (const tbody of extractTbodyBlocks(orgsTabHtml)) {
    assert.equal(/<button\b/i.test(tbody), false, 'Organizaciones <tbody> must have 0 <button>');
  }
  const zeroOrgTab = assertZeroUuidExposure(orgsTabHtml);
  assert.equal(zeroOrgTab.compliant, true, zeroOrgTab.exposedUuids.join(', '));

  // 2) Tab Auditorías (and legacy 'vinculos' alias)
  const auditsTabHtml = renderConglomeradoView({
    profile: ADMIN_PROFILE,
    state: { ...baseState, activeChildTab: 'auditorias' },
    conglomerados: stats,
    allOrganizaciones: INITIAL_ORGANIZACIONES,
    certificados: certRefs,
    programacionAudits: audits,
    vinculos: [],
    auditPrograms: [],
  });

  const auditColWidths = [
    ...auditsTabHtml.matchAll(/<col[^>]*style="width:\s*([0-9.]+)%;"/gi),
  ].map((m) => Number(m[1]));
  assert.equal(auditColWidths.length, 4);
  assert.ok(Math.abs(auditColWidths.reduce((a, b) => a + b, 0) - 100) < 0.05);

  assert.match(auditsTabHtml, /Certificado &amp; Org|Certificado & Org/);
  assert.match(auditsTabHtml, /Auditoría &amp; Tipo|Auditoría & Tipo/);
  assert.match(auditsTabHtml, /Estatus Auditoría/);
  assert.match(auditsTabHtml, /data-action="open-audit-resumen"/);
  assert.match(auditsTabHtml, /data-cert-id="c0000000-0000-0000-0000-000000000012"/);
  assert.match(auditsTabHtml, /data-audit-id="a0000000-0000-0000-0000-000000000012"/);

  // Most recent audit (AUD-IB-LATEST) must appear before AUD-IB-EARLY
  assert.ok(
    auditsTabHtml.indexOf('AUD-IB-LATEST') < auditsTabHtml.indexOf('AUD-IB-EARLY'),
    'Audits must be sorted most recent first'
  );

  for (const tbody of extractTbodyBlocks(auditsTabHtml)) {
    assert.equal(/<button\b/i.test(tbody), false, 'Auditorías <tbody> must have 0 <button>');
  }
  const zeroAuditTab = assertZeroUuidExposure(auditsTabHtml);
  assert.equal(zeroAuditTab.compliant, true, zeroAuditTab.exposedUuids.join(', '));
});

test('Step 3.1 (Versions & Abreviación): Conglomerado search matches abreviacion, tabs render abreviacion + vN chips, and CLIENT isolation holds', () => {
  const versionedOrgs: OrganizacionEntity[] = INITIAL_ORGANIZACIONES.map((o) =>
    o.id === '30000000-0000-0000-0000-000000000001'
      ? { ...o, abreviacion: 'MET-VAL', version_actual_numero: 2 }
      : o.id === '30000000-0000-0000-0000-000000000002'
      ? { ...o, abreviacion: 'CYB-SOL', version_actual_numero: 1 }
      : o.id === '30000000-0000-0000-0000-000000000003'
      ? { ...o, abreviacion: 'LOG-IBN', version_actual_numero: 1 }
      : o
  );

  const stats = buildConglomeradosWithStats(INITIAL_CONGLOMERADOS, versionedOrgs, []);
  const multiGroupId = INITIAL_CONGLOMERADOS[0].id;
  const org1 = versionedOrgs[0];
  const org2 = versionedOrgs[2];

  const certRefs: ActiveCertCountingRef[] = [
    { id: 'c0000000-0000-0000-0000-000000000011', id_organizacion: org1.id, estatus: 'Activo' },
    { id: 'c0000000-0000-0000-0000-000000000012', id_organizacion: org2.id, estatus: 'Activo' },
  ];

  const audits: ProgramacionAuditEntity[] = [
    buildTestProgramacionAudit({
      id: 'a0000000-0000-0000-0000-000000000021',
      codigo_auditoria: 'AUD-MET-2026',
      id_certificado: 'c0000000-0000-0000-0000-000000000011',
      id_certificado_version: '41000000-0000-0000-0000-000000000202',
      version_numero: 2,
      numero_certificado: 'FN-EMS-2024-002',
      id_organizacion: org1.id,
      organizacion_nombre: org1.nombre,
      fecha_inicio: '2026-10-15',
      estatus: 'Planificado',
    }),
  ];

  // Multi View search matches organization abreviacion ('MET-VAL')
  const searchListHtml = renderConglomeradoView({
    profile: ADMIN_PROFILE,
    state: {
      selectedConglomeradoId: null,
      query: 'MET-VAL',
      viewMode: 'list',
      sortColumn: null,
      sortDirection: 'none',
      isEditingAttributes: false,
      activeChildTab: 'organizaciones',
      isSidebarOpen: false,
      facetSelections: {},
      isCreating: false,
    },
    conglomerados: stats,
    allOrganizaciones: versionedOrgs,
  });
  assert.match(searchListHtml, /MET-VAL/);
  assert.match(searchListHtml, /Grupo Industrial Iberometal/);
  assert.equal(/CyberCloud Solutions S\.L\./.test(searchListHtml), false);
  assert.equal(assertZeroUuidExposure(searchListHtml).compliant, true);

  // Detail Organizaciones tab renders abreviacion badge, v2 chip, and [CYB-SOL] in rebucket select
  const orgTabHtml = renderConglomeradoView({
    profile: ADMIN_PROFILE,
    state: {
      selectedConglomeradoId: multiGroupId,
      query: '',
      viewMode: 'list',
      sortColumn: null,
      sortDirection: 'none',
      isEditingAttributes: false,
      activeChildTab: 'organizaciones',
      isSidebarOpen: false,
      facetSelections: {},
      isCreating: false,
    },
    conglomerados: stats,
    allOrganizaciones: versionedOrgs,
    certificados: certRefs,
    programacionAudits: audits,
  });
  assert.match(orgTabHtml, /MET-VAL/);
  assert.match(orgTabHtml, /LOG-IBN/);
  assert.match(orgTabHtml, />v2</);
  assert.match(orgTabHtml, /CYB-SOL \(Sola ·/);
  assert.match(orgTabHtml, /title="CyberCloud Solutions S\.L\./);
  for (const tbody of extractTbodyBlocks(orgTabHtml)) {
    assert.equal(/<button\b/i.test(tbody), false);
  }
  assert.equal(assertZeroUuidExposure(orgTabHtml).compliant, true);

  // Detail Auditorías tab renders v2 chip + MET-VAL badge and respects CLIENT isolation
  const auditTabAdminHtml = renderConglomeradoView({
    profile: ADMIN_PROFILE,
    state: {
      selectedConglomeradoId: multiGroupId,
      query: '',
      viewMode: 'list',
      sortColumn: null,
      sortDirection: 'none',
      isEditingAttributes: false,
      activeChildTab: 'auditorias',
      isSidebarOpen: false,
      facetSelections: {},
      isCreating: false,
    },
    conglomerados: stats,
    allOrganizaciones: versionedOrgs,
    certificados: certRefs,
    programacionAudits: audits,
  });
  assert.match(auditTabAdminHtml, />v2</);
  assert.match(auditTabAdminHtml, /MET-VAL/);
  for (const tbody of extractTbodyBlocks(auditTabAdminHtml)) {
    assert.equal(/<button\b/i.test(tbody), false);
  }
  assert.equal(assertZeroUuidExposure(auditTabAdminHtml).compliant, true);

  const clientFilteredAuditsHtml = renderConglomeradoView({
    profile: CLIENT_PROFILE,
    authorizedClientOrgIds: [org2.id],
    state: {
      selectedConglomeradoId: multiGroupId,
      query: '',
      viewMode: 'list',
      sortColumn: null,
      sortDirection: 'none',
      isEditingAttributes: false,
      activeChildTab: 'auditorias',
      isSidebarOpen: false,
      facetSelections: {},
      isCreating: false,
    },
    conglomerados: stats,
    allOrganizaciones: versionedOrgs,
    certificados: certRefs,
    programacionAudits: audits,
  });
  assert.equal(/AUD-MET-2026/.test(clientFilteredAuditsHtml), false);
});

test('Step 5.1: Conglomerado abreviacion validates max 24 chars, auto-fallbacks, renders #conglomeradoAbreviacionInput, and filters search', () => {
  const errTooLong = validateConglomeradoDraft(
    {
      codigo_grupo: 'CONG-NEW-01',
      nombre: 'Grupo Industrial Pacífico Sur',
      abreviacion: 'AbreviacionExtremadamenteLargaMayor24',
      notas: '',
    },
    INITIAL_CONGLOMERADOS
  );
  assert.ok(errTooLong && errTooLong.includes('24 caracteres'));

  const errUuid = validateConglomeradoDraft(
    {
      codigo_grupo: 'CONG-NEW-01',
      nombre: 'Grupo Industrial Pacífico Sur',
      abreviacion: '20000000-0000-0000-0000-000000000001',
      notas: '',
    },
    INITIAL_CONGLOMERADOS
  );
  assert.ok(errUuid && errUuid.includes('24 caracteres'));

  assert.equal(
    resolveConglomeradoFormAbreviacion({
      codigo_grupo: 'CONG-PAC-01',
      nombre: 'Grupo Industrial Pacífico',
      abreviacion: '  Pacífico  ',
    }),
    'Pacífico'
  );
  assert.equal(
    resolveConglomeradoFormAbreviacion({
      codigo_grupo: 'CONG-PAC-01',
      nombre: 'Grupo Industrial Pacífico',
      abreviacion: '',
    }).length <= 24,
    true
  );

  const customCong: ConglomeradoEntity = {
    id: '20000000-0000-0000-0000-000000000088',
    codigo_grupo: 'CONG-PAC-01',
    nombre: 'Consorcio Logístico del Pacífico Sur S.A.',
    abreviacion: 'CLPSur',
    es_individual_auto: false,
    notas: null,
  };
  const stats = buildConglomeradosWithStats([...INITIAL_CONGLOMERADOS, customCong], [], []);

  const searchByAbrevHtml = renderConglomeradoView({
    profile: ADMIN_PROFILE,
    state: {
      selectedConglomeradoId: null,
      query: 'CLPSur',
      viewMode: 'list',
      sortColumn: null,
      sortDirection: 'none',
      isEditingAttributes: false,
      activeChildTab: 'organizaciones',
      isSidebarOpen: false,
      facetSelections: {},
      isCreating: false,
    },
    conglomerados: stats,
    allOrganizaciones: [],
    certificados: [],
  });
  assert.match(searchByAbrevHtml, /CLPSur/);
  assert.match(searchByAbrevHtml, /title="Consorcio Logístico del Pacífico Sur S\.A\."/);
  assert.equal(assertZeroUuidExposure(searchByAbrevHtml).compliant, true);

  const createModalHtml = renderConglomeradoView({
    profile: ADMIN_PROFILE,
    state: {
      selectedConglomeradoId: null,
      query: '',
      viewMode: 'list',
      sortColumn: null,
      sortDirection: 'none',
      isEditingAttributes: false,
      activeChildTab: 'organizaciones',
      isSidebarOpen: false,
      facetSelections: {},
      isCreating: true,
      createFormDraft: createEmptyConglomeradoFormDraft(),
    },
    conglomerados: stats,
    allOrganizaciones: [],
    certificados: [],
  });
  assert.match(createModalHtml, /id="conglomeradoAbreviacionInput"/);
  assert.match(createModalHtml, /maxlength="24"/);
  assert.equal(assertZeroUuidExposure(createModalHtml).compliant, true);
});


