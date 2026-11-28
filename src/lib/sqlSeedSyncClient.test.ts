import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  applySqlSeedSync,
  createInitialDatabaseSeedSyncState,
  extractSeededUserIdsFrom05Sql,
  fetchSeedSyncCatalog,
  filterClientOrganizationAccessWith05Users,
  previewSqlSeedSync,
  validateSeedSyncRequestPayload,
  type SeedSyncApplyResponse,
  type SeedSyncCatalogResponse,
  type SeedSyncPreviewResponse,
} from './sqlSeedSyncClient';
import { SQL_SEED_SYNC_BLOCKS, resolveSyncSelectionPlan } from './sqlSeedSyncCatalog';
import { containsRawUuid } from './zeroUuid';

const QUERIES_DIR = path.resolve(process.cwd(), 'public', 'supabase', 'queries');

test('createInitialDatabaseSeedSyncState returns expected initial state defaults', () => {
  const state = createInitialDatabaseSeedSyncState();
  assert.deepEqual(state, {
    catalog: null,
    loadingCatalog: false,
    selectedSectionIds: [],
    includeFkSupport: true,
    analyzing: false,
    applying: false,
    previewResult: null,
    applyResult: null,
    error: null,
  });
});

test('validateSeedSyncRequestPayload rejects empty, malformed, and unknown section IDs in Spanish', () => {
  const emptyBody = validateSeedSyncRequestPayload(null);
  assert.equal(emptyBody.ok, false);
  if (!emptyBody.ok) {
    assert.match(emptyBody.error, /inválida|secciones/i);
  }

  const missingArray = validateSeedSyncRequestPayload({ selectedSectionIds: 'certificacion.certificado' });
  assert.equal(missingArray.ok, false);

  const emptyArray = validateSeedSyncRequestPayload({ selectedSectionIds: ['   '] });
  assert.equal(emptyArray.ok, false);
  if (!emptyArray.ok) {
    assert.match(emptyArray.error, /al menos una sección/i);
  }

  const badFlag = validateSeedSyncRequestPayload({
    selectedSectionIds: ['extra.estatus'],
    includeFkSupport: 'yes',
  });
  assert.equal(badFlag.ok, false);

  const unknownWithUuid = validateSeedSyncRequestPayload({
    selectedSectionIds: ['11111111-1111-1111-1111-111111111111'],
  });
  assert.equal(unknownWithUuid.ok, false);
  if (!unknownWithUuid.ok) {
    assert.equal(containsRawUuid(unknownWithUuid.error), false);
    assert.match(unknownWithUuid.error, /no reconocida/i);
  }

  const valid = validateSeedSyncRequestPayload({
    selectedSectionIds: [' certificacion.certificado ', 'certificacion.certificado', 'extra.norma'],
  });
  assert.equal(valid.ok, true);
  if (valid.ok) {
    assert.deepEqual(valid.selectedSectionIds, ['certificacion.certificado', 'extra.norma']);
    assert.equal(valid.includeFkSupport, true);
  }
});

test('extractSeededUserIdsFrom05Sql extracts all 51 seeded users from 05_usuarios.sql without null instance_id', () => {
  const sql05 = fs.readFileSync(path.join(QUERIES_DIR, '05_usuarios.sql'), 'utf8');
  const ids = extractSeededUserIdsFrom05Sql(sql05);

  assert.equal(ids.has('00000000-0000-0000-0000-000000000000'), false);
  assert.equal(ids.has('11111111-1111-1111-1111-111111111111'), true);
  assert.equal(ids.has('22222222-2222-2222-2222-222222222222'), true);
  assert.equal(ids.has('33333333-3333-3333-3333-333333333333'), true);
  assert.equal(ids.has('44444444-4444-4444-4444-444444444444'), true);
  assert.equal(ids.has('10000000-0000-0000-0000-000000000001'), true);
  assert.equal(ids.has('10000000-0000-0000-0000-000000000047'), true);
  assert.equal(ids.size, 51);
});

test('filterClientOrganizationAccessWith05Users skips orphan auth users and emits Zero-UUID warnings', () => {
  const seeded = new Set([
    '44444444-4444-4444-4444-444444444444',
    '11111111-1111-1111-1111-111111111111',
  ]);
  const res = filterClientOrganizationAccessWith05Users(
    [
      {
        id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        id_usuario: '44444444-4444-4444-4444-444444444444',
        id_organizacion: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        aprobado_por: '11111111-1111-1111-1111-111111111111',
      },
      {
        id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
        id_usuario: '99999999-9999-9999-9999-999999999999',
        id_organizacion: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        aprobado_por: '11111111-1111-1111-1111-111111111111',
      },
      {
        id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
        id_usuario: '44444444-4444-4444-4444-444444444444',
        id_organizacion: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
        aprobado_por: '88888888-8888-8888-8888-888888888888',
      },
    ],
    seeded
  );

  assert.equal(res.excludedCount, 1);
  assert.equal(res.clearedApproverCount, 1);
  assert.equal(res.rows.length, 2);
  assert.equal(res.rows[1].aprobado_por, null);
  assert.equal(res.warnings.length, 2);
  for (const warning of res.warnings) {
    assert.equal(containsRawUuid(warning), false);
    assert.match(warning, /05_usuarios\.sql/);
  }
});

test('fetchSeedSyncCatalog, previewSqlSeedSync, and applySqlSeedSync attach Bearer token and handle responses', async () => {
  const calls: Array<{ url: string; method: string; auth: string | null; body?: string }> = [];

  const catalogPayload: SeedSyncCatalogResponse = {
    ok: true,
    blocks: SQL_SEED_SYNC_BLOCKS,
    files: [
      {
        fileName: '06_datos_prueba.sql',
        relativePath: 'public/supabase/queries/06_datos_prueba.sql',
        exists: true,
        sizeBytes: 12000,
        updatedAt: '2026-11-28T00:00:00.000Z',
        lineCount: 300,
      },
      {
        fileName: '07_normas_requisitos_csv.sql',
        relativePath: 'public/supabase/queries/07_normas_requisitos_csv.sql',
        exists: true,
        sizeBytes: 420000,
        updatedAt: '2026-11-28T00:00:00.000Z',
        lineCount: 1500,
      },
    ],
    tableCounts: {
      estatus: {
        tableName: 'estatus',
        labelEs: 'Estatus canónicos',
        targetFile: '06_datos_prueba.sql',
        existsInDb: true,
        totalRows: 5,
        activeRows: 5,
        archivedRows: 0,
      },
    },
    generatedAt: '2026-11-28T00:00:00.000Z',
  };

  const plan = resolveSyncSelectionPlan(['certificacion.certificado'], {
    includeParentFkDependencies: true,
  });

  const previewPayload: SeedSyncPreviewResponse = {
    ok: true,
    plan,
    targetResults: [
      {
        targetFile: '06_datos_prueba.sql',
        changed: true,
        valid: true,
        validationErrors: [],
        warnings: [],
        summaryByTable: [],
        diffSnippets: ['-- snippet'],
        counts: {
          tablesWithChanges: 1,
          toInsert: 1,
          toUpdate: 0,
          toArchiveOrDelete: 0,
        },
      },
    ],
    summaryByTable: [],
    warnings: [],
    previewSnippets: ['-- snippet'],
    hasChanges: true,
    canApply: true,
  };

  const applyPayload: SeedSyncApplyResponse = {
    ok: true,
    plan,
    updatedFiles: [
      {
        fileName: '06_datos_prueba.sql',
        relativePath: 'public/supabase/queries/06_datos_prueba.sql',
        written: true,
        changed: true,
        sizeBytes: 12345,
        tablesChanged: 1,
      },
    ],
    summaryByTable: [],
    warnings: [],
    appliedAt: '2026-11-28T00:01:00.000Z',
  };

  const mockFetch = (async (input: URL | RequestInfo, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    calls.push({
      url,
      method: init?.method ?? 'GET',
      auth: headers.get('Authorization'),
      body: typeof init?.body === 'string' ? init.body : undefined,
    });

    if (url.endsWith('/catalog')) {
      return new Response(JSON.stringify(catalogPayload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.endsWith('/preview')) {
      return new Response(JSON.stringify(previewPayload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify(applyPayload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  const opts = {
    fetchFn: mockFetch,
    getAccessToken: async () => 'admin-jwt-token',
  };

  const cat = await fetchSeedSyncCatalog(opts);
  assert.equal(cat.blocks.length, 3);
  assert.equal(cat.tableCounts.estatus.activeRows, 5);

  const prev = await previewSqlSeedSync(['certificacion.certificado'], true, opts);
  assert.equal(prev.canApply, true);
  assert.equal(prev.hasChanges, true);

  const appRes = await applySqlSeedSync(['certificacion.certificado'], false, opts);
  assert.equal(appRes.updatedFiles[0]?.written, true);

  assert.equal(calls.length, 3);
  assert.equal(calls[0].method, 'GET');
  assert.equal(calls[0].url, '/api/admin/db/seed-sync/catalog');
  assert.equal(calls[0].auth, 'Bearer admin-jwt-token');

  assert.equal(calls[1].method, 'POST');
  assert.equal(calls[1].url, '/api/admin/db/seed-sync/preview');
  assert.deepEqual(JSON.parse(calls[1].body || '{}'), {
    selectedSectionIds: ['certificacion.certificado'],
    includeFkSupport: true,
  });

  assert.equal(calls[2].method, 'POST');
  assert.equal(calls[2].url, '/api/admin/db/seed-sync/apply');
  assert.deepEqual(JSON.parse(calls[2].body || '{}'), {
    selectedSectionIds: ['certificacion.certificado'],
    includeFkSupport: false,
  });
});

test('client rejects missing session token and sanitizes UUIDs in HTTP error responses', async () => {
  await assert.rejects(
    () =>
      fetchSeedSyncCatalog({
        getAccessToken: async () => null,
      }),
    /sesión expiró/i
  );

  const errorFetch = (async () =>
    new Response(
      JSON.stringify({
        ok: false,
        error: 'Conflicto en fila 11111111-1111-1111-1111-111111111111 durante análisis.',
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )) as typeof fetch;

  await assert.rejects(
    () =>
      previewSqlSeedSync(['extra.estatus'], true, {
        fetchFn: errorFetch,
        getAccessToken: async () => 'token',
      }),
    (err: Error) => {
      assert.equal(containsRawUuid(err.message), false);
      assert.match(err.message, /\[ref\]/);
      return true;
    }
  );
});

test('server.ts seed-sync routes enforce requireApprovedAdmin, READ ONLY queries, and atomic writes', () => {
  const serverSource = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8');

  for (const routePath of [
    '/api/admin/db/seed-sync/catalog',
    '/api/admin/db/seed-sync/preview',
    '/api/admin/db/seed-sync/apply',
  ]) {
    const idx = serverSource.indexOf(`'${routePath}'`);
    assert.notEqual(idx, -1, `Missing route ${routePath} in server.ts`);
    const slice = serverSource.slice(idx, idx + 400);
    assert.match(slice, /requireApprovedAdmin\(req,\s*res\)/);
  }

  assert.match(serverSource, /BEGIN READ ONLY/);
  assert.match(serverSource, /writeFileAtomically/);
  assert.match(serverSource, /fs\.rename\(tmpPath,\s*filePath\)/);

  const previewIdx = serverSource.indexOf("'/api/admin/db/seed-sync/preview'");
  const applyIdx = serverSource.indexOf("'/api/admin/db/seed-sync/apply'");
  const previewBlock = serverSource.slice(previewIdx, applyIdx);
  assert.equal(previewBlock.includes('writeFileAtomically'), false);
});
