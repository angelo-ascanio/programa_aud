import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  INITIAL_ORGANIZACIONES,
  type OrganizacionFormDraft,
  type OrganizacionVersionEntity,
} from './activeCertificates';
import {
  CERT_VERSION_ORG_ACTION_LABELS,
  EXACT_NO_CHANGES_ORG_VERSION_MESSAGE,
  buildDefaultCertVersionOrgResolutions,
  hasOrganizacionVersionChanges,
  normalizeOrganizacionComparableFields,
  persistCreateOrganizacionVersion,
  persistResolveCertVersionsOrg,
  translateOrganizacionVersionDbError,
  validateCertVersionOrgResolutions,
  validateNewOrganizacionVersionDraft,
  type CertVersionOrgCandidate,
  type OrgVersionRpcResponse,
  type OrgVersionSupabaseClient,
} from './organizacionVersionDomain';
import { containsRawUuid } from './zeroUuid';

const ORG_ID = '30000000-0000-0000-0000-000000000001';
const ORG_VER_V2_ID = '31000000-0000-0000-0000-000000000101';
const ORG_VER_V3_ID = '31000000-0000-0000-0000-000000000201';

const ACTIVE_ORG_VERSION: OrganizacionVersionEntity = {
  id: ORG_VER_V2_ID,
  id_organizacion: ORG_ID,
  version_numero: 2,
  es_version_actual: true,
  notas_version: 'Actualización de razón social a S.A. y código postal fiscal.',
  nombre: 'Iberometal Componentes S.A.',
  abreviacion: 'IBEROMETAL',
  rif: 'J-30492817-0',
  direccion_fiscal:
    'Av. Industrial 100, Zona Industrial Municipal Norte, Valencia, Edo. Carabobo 2001',
  deleted_at: null,
};

function makeBaseDraft(overrides: Partial<OrganizacionFormDraft> = {}): OrganizacionFormDraft {
  return {
    id_grupo_empresarial: '20000000-0000-0000-0000-000000000001',
    nombre: ACTIVE_ORG_VERSION.nombre,
    abreviacion: ACTIVE_ORG_VERSION.abreviacion,
    rif: ACTIVE_ORG_VERSION.rif || '',
    direccion_fiscal: ACTIVE_ORG_VERSION.direccion_fiscal || '',
    notas_version: '',
    ...overrides,
  };
}

describe('Step 2.1 — Organization Versioning Domain & Anti-No-Op Guard', () => {
  it('normalizes comparable fields consistently and blocks Anti-No-Op when only spaces or casing on rif/abreviacion change', () => {
    const equivalentDraft = makeBaseDraft({
      nombre: '  Iberometal   Componentes   S.A. ',
      abreviacion: '  iberometal ',
      rif: ' j-30492817-0 ',
      direccion_fiscal:
        '  Av. Industrial 100,   Zona Industrial Municipal Norte, Valencia, Edo. Carabobo 2001  ',
      notas_version: 'Nota cualquiera sin cambios reales de campos fiscales',
    });

    const normalized = normalizeOrganizacionComparableFields(equivalentDraft);
    assert.equal(normalized.nombre, 'Iberometal Componentes S.A.');
    assert.equal(normalized.abreviacion, 'IBEROMETAL');
    assert.equal(normalized.rif, 'J-30492817-0');

    assert.equal(hasOrganizacionVersionChanges(ACTIVE_ORG_VERSION, equivalentDraft), false);

    const validation = validateNewOrganizacionVersionDraft(
      ACTIVE_ORG_VERSION,
      equivalentDraft,
      INITIAL_ORGANIZACIONES
    );
    assert.equal(validation.valid, false);
    assert.equal(validation.errorMessage, EXACT_NO_CHANGES_ORG_VERSION_MESSAGE);
    assert.equal(containsRawUuid(validation.errorMessage || ''), false);
  });

  it('allows creating a new version when any of the 4 comparable fields changes (nombre, abreviacion, rif, direccion_fiscal)', () => {
    const changedNombre = validateNewOrganizacionVersionDraft(
      ACTIVE_ORG_VERSION,
      makeBaseDraft({ nombre: 'Iberometal Manufactura Avanzada S.A.' }),
      INITIAL_ORGANIZACIONES
    );
    assert.equal(changedNombre.valid, true);
    assert.equal(changedNombre.errorMessage, null);

    const changedAbrev = validateNewOrganizacionVersionDraft(
      ACTIVE_ORG_VERSION,
      makeBaseDraft({ abreviacion: 'IBERO-MET' }),
      INITIAL_ORGANIZACIONES
    );
    assert.equal(changedAbrev.valid, true);

    const changedRif = validateNewOrganizacionVersionDraft(
      ACTIVE_ORG_VERSION,
      makeBaseDraft({ rif: 'J-30492817-9' }),
      INITIAL_ORGANIZACIONES
    );
    assert.equal(changedRif.valid, true);

    const changedDir = validateNewOrganizacionVersionDraft(
      ACTIVE_ORG_VERSION,
      makeBaseDraft({
        direccion_fiscal: 'Av. Industrial 250, Zona Industrial Sur, Valencia, Edo. Carabobo',
      }),
      INITIAL_ORGANIZACIONES
    );
    assert.equal(changedDir.valid, true);
  });

  it('still rejects collisions with other active organizations while excluding self', () => {
    const collisionWithCyberCloud = validateNewOrganizacionVersionDraft(
      ACTIVE_ORG_VERSION,
      makeBaseDraft({ abreviacion: 'cybercloud' }),
      INITIAL_ORGANIZACIONES
    );
    assert.equal(collisionWithCyberCloud.valid, false);
    assert.ok(collisionWithCyberCloud.errorMessage?.toLowerCase().includes('abreviación'));
    assert.equal(containsRawUuid(collisionWithCyberCloud.errorMessage || ''), false);
  });
});

describe('Step 2.1 — Post-Creation Certificate Version Resolution Planner', () => {
  const certCandidates: CertVersionOrgCandidate[] = [
    {
      id_certificado: '40000000-0000-0000-0000-000000000001',
      id_certificado_version: '41000000-0000-0000-0000-000000000001',
      id_organizacion: ORG_ID,
      numero_certificado: 'FN-QMS-2026-001',
      norma_codigo: 'ISO 9001:2015',
      version_numero: 1,
      es_version_actual: false,
      id_organizacion_version: '31000000-0000-0000-0000-000000000001',
      deleted_at: null,
    },
    {
      id_certificado: '40000000-0000-0000-0000-000000000001',
      id_certificado_version: '41000000-0000-0000-0000-000000000101',
      id_organizacion: ORG_ID,
      numero_certificado: 'FN-QMS-2026-001',
      norma_codigo: 'ISO 9001:2015',
      version_numero: 2,
      es_version_actual: true,
      id_organizacion_version: ORG_VER_V2_ID,
      deleted_at: null,
    },
    {
      id_certificado: '40000000-0000-0000-0000-000000000006',
      id_certificado_version: '41000000-0000-0000-0000-000000000099',
      id_organizacion: ORG_ID,
      numero_certificado: 'FN-ARCH-2025-099',
      norma_codigo: 'ISO 14001:2015',
      version_numero: 1,
      es_version_actual: false,
      id_organizacion_version: ORG_VER_V2_ID,
      deleted_at: '2026-05-01T00:00:00Z', // soft-deleted -> excluded
    },
  ];

  it('preselects historical certificate versions as MANTENER_ANTERIOR and current version as VINCULAR_NUEVA', () => {
    const plan = buildDefaultCertVersionOrgResolutions(certCandidates, ORG_VER_V2_ID);
    assert.equal(plan.length, 2);

    const v1 = plan.find((r) => r.version_numero === 1);
    const v2 = plan.find((r) => r.version_numero === 2);
    assert.ok(v1);
    assert.ok(v2);

    assert.equal(v1.action, 'MANTENER_ANTERIOR');
    assert.equal(v1.action_label, CERT_VERSION_ORG_ACTION_LABELS.MANTENER_ANTERIOR);
    assert.equal(v1.es_en_version_org_activa, false);

    assert.equal(v2.action, 'VINCULAR_NUEVA');
    assert.equal(v2.action_label, CERT_VERSION_ORG_ACTION_LABELS.VINCULAR_NUEVA);
    assert.equal(v2.es_en_version_org_activa, true);

    const validation = validateCertVersionOrgResolutions(plan);
    assert.equal(validation.valid, true);
    assert.deepEqual(validation.keepCertVersionIds, ['41000000-0000-0000-0000-000000000001']);
    assert.deepEqual(validation.migrateCertVersionIds, ['41000000-0000-0000-0000-000000000101']);
  });

  it('supports manual user overrides and rejects missing decisions without exposing raw UUIDs', () => {
    const plan = buildDefaultCertVersionOrgResolutions(certCandidates, ORG_VER_V2_ID);
    // Override: user decides to keep v2 on previous org version and migrate v1 manually
    const overridden = plan.map((item) => ({
      ...item,
      action: item.version_numero === 1 ? ('VINCULAR_NUEVA' as const) : ('MANTENER_ANTERIOR' as const),
    }));
    const overrideValidation = validateCertVersionOrgResolutions(overridden);
    assert.equal(overrideValidation.valid, true);
    assert.deepEqual(overrideValidation.migrateCertVersionIds, [
      '41000000-0000-0000-0000-000000000001',
    ]);
    assert.deepEqual(overrideValidation.keepCertVersionIds, [
      '41000000-0000-0000-0000-000000000101',
    ]);

    const incomplete = plan.map((item, idx) =>
      idx === 1 ? { ...item, action: null } : item
    );
    const invalidRes = validateCertVersionOrgResolutions(incomplete);
    assert.equal(invalidRes.valid, false);
    assert.ok(invalidRes.errorMessage?.includes('FN-QMS-2026-001'));
    assert.equal(containsRawUuid(invalidRes.errorMessage || ''), false);
  });
});

describe('Step 2.1 — Structural RPC Persistence & Zero-UUID Error Translation', () => {
  it('calls fn_crear_version_organizacion and fn_resolver_cert_versiones_organizacion with exact parameters', async () => {
    const rpcCalls: Array<{ fn: string; params: Record<string, unknown> | undefined }> = [];

    const mockSupabase: OrgVersionSupabaseClient = {
      async rpc(fn, params): Promise<OrgVersionRpcResponse> {
        rpcCalls.push({ fn, params });
        if (fn === 'fn_crear_version_organizacion') {
          return { data: ORG_VER_V3_ID, error: null };
        }
        if (fn === 'fn_resolver_cert_versiones_organizacion') {
          return { data: 1, error: null };
        }
        return { data: null, error: { code: '42883', message: 'unexpected rpc' } };
      },
    };

    const createRes = await persistCreateOrganizacionVersion(mockSupabase, {
      id_organizacion: ORG_ID,
      nombre: 'Iberometal   Componentes Internos S.A.',
      abreviacion: ' ibero-int ',
      rif: ' j-30492817-0 ',
      direccion_fiscal: '  Av. Industrial 100, Valencia  ',
      notas_version: 'Cambio de razón social de prueba.',
    });

    assert.equal(createRes.ok, true);
    assert.equal(createRes.data?.id_organizacion_version, ORG_VER_V3_ID);
    assert.equal(rpcCalls[0].fn, 'fn_crear_version_organizacion');
    assert.deepEqual(rpcCalls[0].params, {
      p_id_organizacion: ORG_ID,
      p_nombre: 'Iberometal Componentes Internos S.A.',
      p_abreviacion: 'IBERO-INT',
      p_rif: 'J-30492817-0',
      p_direccion_fiscal: 'Av. Industrial 100, Valencia',
      p_notas_version: 'Cambio de razón social de prueba.',
    });

    const plan = buildDefaultCertVersionOrgResolutions(
      [
        {
          id_certificado: '40000000-0000-0000-0000-000000000001',
          id_certificado_version: '41000000-0000-0000-0000-000000000001',
          numero_certificado: 'FN-QMS-2026-001',
          norma_codigo: 'ISO 9001:2015',
          version_numero: 1,
          es_version_actual: false,
          id_organizacion_version: '31000000-0000-0000-0000-000000000001',
        },
        {
          id_certificado: '40000000-0000-0000-0000-000000000001',
          id_certificado_version: '41000000-0000-0000-0000-000000000101',
          numero_certificado: 'FN-QMS-2026-001',
          norma_codigo: 'ISO 9001:2015',
          version_numero: 2,
          es_version_actual: true,
          id_organizacion_version: ORG_VER_V2_ID,
        },
      ],
      ORG_VER_V2_ID
    );

    const resolveRes = await persistResolveCertVersionsOrg(mockSupabase, {
      id_nueva_org_version: ORG_VER_V3_ID,
      resolutions: plan,
    });

    assert.equal(resolveRes.ok, true);
    assert.equal(resolveRes.data?.updatedCount, 1);
    assert.equal(rpcCalls[1].fn, 'fn_resolver_cert_versiones_organizacion');
    assert.deepEqual(rpcCalls[1].params, {
      p_id_nueva_org_version: ORG_VER_V3_ID,
      p_cert_version_ids_migrar: ['41000000-0000-0000-0000-000000000101'],
    });
  });

  it('translates P0001, 23505, and 42501 PostgreSQL errors into Spanish without exposing raw UUIDs', async () => {
    const rawUuidInDbMessage = `Error interno en registro ${ORG_ID} con version ${ORG_VER_V2_ID}`;

    const p0001AntiNoOp = translateOrganizacionVersionDbError({
      code: 'P0001',
      message: `${EXACT_NO_CHANGES_ORG_VERSION_MESSAGE} (${ORG_ID})`,
    });
    assert.equal(p0001AntiNoOp, EXACT_NO_CHANGES_ORG_VERSION_MESSAGE);
    assert.equal(containsRawUuid(p0001AntiNoOp), false);

    const p0001Custom = translateOrganizacionVersionDbError({
      code: 'P0001',
      message: rawUuidInDbMessage,
    });
    assert.equal(containsRawUuid(p0001Custom), false);
    assert.ok(p0001Custom.includes('referencia interna'));

    const dupNombre = translateOrganizacionVersionDbError({
      code: '23505',
      message: `duplicate key value violates unique constraint "uq_organizacion_version_nombre_actual_active" (${ORG_ID})`,
    });
    assert.ok(dupNombre.toLowerCase().includes('razón social'));
    assert.equal(containsRawUuid(dupNombre), false);

    const dupAbrev = translateOrganizacionVersionDbError({
      code: '23505',
      message: `duplicate key value violates unique constraint "uq_organizacion_version_abrev_actual_active" (${ORG_ID})`,
    });
    assert.ok(dupAbrev.toLowerCase().includes('abreviación'));
    assert.equal(containsRawUuid(dupAbrev), false);

    const dupRif = translateOrganizacionVersionDbError({
      code: '23505',
      message: `duplicate key value violates unique constraint "uq_organizacion_version_rif_actual_active" (${ORG_ID})`,
    });
    assert.ok(dupRif.toLowerCase().includes('rif'));
    assert.equal(containsRawUuid(dupRif), false);

    const rlsMock: OrgVersionSupabaseClient = {
      async rpc(): Promise<OrgVersionRpcResponse> {
        return {
          data: null,
          error: {
            code: '42501',
            message: `new row violates row-level security policy for table "organizacion_version" (${ORG_ID})`,
          },
        };
      },
    };
    const rlsRes = await persistCreateOrganizacionVersion(rlsMock, {
      id_organizacion: ORG_ID,
      nombre: 'Nueva Org S.A.',
      abreviacion: 'NUEVA-ORG',
      rif: 'J-99999999-9',
    });
    assert.equal(rlsRes.ok, false);
    assert.ok(rlsRes.error?.includes('Permisos insuficientes (RLS)'));
    assert.equal(containsRawUuid(rlsRes.error || ''), false);
  });
});
