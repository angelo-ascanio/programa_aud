import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  assembleSharedCertificateCollections,
  persistSaveOwnAlcance,
  persistShareAlcance,
  persistShareContactos,
  persistShareProcesos,
  persistShareSitios,
  persistShareTurnos,
  persistSyncProcesoRequisitos,
  persistUnlinkSharedAlcance,
  persistUnlinkSharedChild,
  translateShareDbError,
  type ShareDbErrorLike,
  type ShareDeleteBuilder,
  type ShareInsertBuilder,
  type ShareMutationBuilder,
  type ShareQueryResponse,
  type ShareSelectBuilder,
  type ShareSingleResponse,
  type ShareSupabaseClient,
  type ShareTableClient,
  type ShareUpdateBuilder,
  type VisibleCertMetadata,
} from './certificadoSharePersistence';
import type { RequisitoLtree } from './extraDomain';
import type {
  EmailContactoEntity,
  TelefonoContactoEntity,
} from './multisiteSampling';
import type { TurnoCatalogItem } from './sitioDomain';
import { containsRawUuid } from './zeroUuid';

const CERT_X_ID = '40000000-0000-4000-8000-000000000001';
const CERT_Y_ID = '40000000-0000-4000-8000-000000000002';
const CONTACTO_1_ID = '51000000-0000-4000-8000-000000000001';
const TURNO_1_ID = '52000000-0000-4000-8000-000000000001';
const TURNO_2_ID = '52000000-0000-4000-8000-000000000002';
const PROC_P_ID = '53000000-0000-4000-8000-000000000001';
const SITIO_0_Y_ID = '54000000-0000-4000-8000-000000000000';
const SITIO_S_ID = '54000000-0000-4000-8000-000000000001';
const REQ_9001_A = '61000000-0000-4000-8000-000000000001';
const REQ_9001_B = '61000000-0000-4000-8000-000000000002';
const REQ_14001_A = '62000000-0000-4000-8000-000000000001';
const REQ_14001_B = '62000000-0000-4000-8000-000000000002';
const LINK_EXISTING_ID = '71000000-0000-4000-8000-000000000001';
const LINK_ARCHIVE_ID = '71000000-0000-4000-8000-000000000002';
const AUDIT_Y_ID = '81000000-0000-4000-8000-000000000001';
const AUDIT_X_ID = '81000000-0000-4000-8000-000000000002';

interface RecordedOp {
  kind: 'select' | 'insert' | 'upsert' | 'update' | 'delete' | 'rpc';
  tableOrFn: string;
  payload?: unknown;
  filters?: Array<{ column: string; value: string | string[] | null }>;
}

interface MockBehavior {
  selectQueue?: Record<string, ShareQueryResponse[]>;
  insertQueue?: Record<string, ShareQueryResponse[]>;
  updateQueue?: Record<string, ShareQueryResponse[]>;
  deleteQueue?: Record<string, ShareQueryResponse[]>;
  upsertQueue?: Record<string, Array<{ data: unknown; error: ShareDbErrorLike | null }>>;
  rpcHandler?: (
    fn: string,
    params?: Record<string, unknown>
  ) => Promise<{ data: unknown; error: ShareDbErrorLike | null }>;
}

function createMockSupabase(behavior: MockBehavior = {}): {
  client: ShareSupabaseClient;
  ops: RecordedOp[];
} {
  const ops: RecordedOp[] = [];
  const selectCursors = new Map<string, number>();
  const insertCursors = new Map<string, number>();
  const updateCursors = new Map<string, number>();
  const deleteCursors = new Map<string, number>();
  const upsertCursors = new Map<string, number>();

  function dequeueResponse(
    queueMap: Record<string, ShareQueryResponse[]> | undefined,
    cursors: Map<string, number>,
    table: string,
    fallback: ShareQueryResponse
  ): ShareQueryResponse {
    const arr = queueMap?.[table];
    if (!arr || arr.length === 0) return fallback;
    const idx = cursors.get(table) || 0;
    cursors.set(table, idx + 1);
    return arr[idx] ?? arr[arr.length - 1];
  }

  function makeMutationBuilder(
    resolveResponse: () => ShareQueryResponse
  ): ShareMutationBuilder {
    return {
      async single(): Promise<ShareSingleResponse> {
        const res = resolveResponse();
        if (res.error) return { data: null, error: res.error };
        const first =
          Array.isArray(res.data) && res.data.length > 0 ? res.data[0] : null;
        return { data: first, error: null };
      },
      async maybeSingle(): Promise<ShareSingleResponse> {
        const res = resolveResponse();
        if (res.error) return { data: null, error: res.error };
        const first =
          Array.isArray(res.data) && res.data.length > 0 ? res.data[0] : null;
        return { data: first, error: null };
      },
      then<TResult1 = ShareQueryResponse, TResult2 = never>(
        onfulfilled?:
          | ((value: ShareQueryResponse) => TResult1 | PromiseLike<TResult1>)
          | null,
        onrejected?:
          | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
          | null
      ): PromiseLike<TResult1 | TResult2> {
        return Promise.resolve(resolveResponse()).then(onfulfilled, onrejected);
      },
    };
  }

  const client: ShareSupabaseClient = {
    from(table: string): ShareTableClient {
      return {
        select(columns: string): ShareSelectBuilder {
          const filters: Array<{ column: string; value: string | null }> = [];
          let resolved: ShareQueryResponse | null = null;
          const execute = (): ShareQueryResponse => {
            if (!resolved) {
              ops.push({ kind: 'select', tableOrFn: table, payload: columns, filters });
              resolved = dequeueResponse(
                behavior.selectQueue,
                selectCursors,
                table,
                { data: [], error: null }
              );
            }
            return resolved;
          };
          const mut = makeMutationBuilder(execute);
          const builder: ShareSelectBuilder = {
            eq(column: string, value: string): ShareSelectBuilder {
              filters.push({ column, value });
              return builder;
            },
            is(column: string, value: null): ShareSelectBuilder {
              filters.push({ column, value });
              return builder;
            },
            order(): ShareSelectBuilder {
              return builder;
            },
            limit(): ShareSelectBuilder {
              return builder;
            },
            single: mut.single,
            maybeSingle: mut.maybeSingle,
            then: mut.then,
          };
          return builder;
        },

        insert(
          values: Record<string, unknown> | ReadonlyArray<Record<string, unknown>>
        ): ShareInsertBuilder {
          ops.push({ kind: 'insert', tableOrFn: table, payload: values });
          const defaultRow = Array.isArray(values) ? values[0] : values;
          let resolved: ShareQueryResponse | null = null;
          const execute = (): ShareQueryResponse => {
            if (!resolved) {
              resolved = dequeueResponse(
                behavior.insertQueue,
                insertCursors,
                table,
                { data: [defaultRow as Record<string, unknown>], error: null }
              );
            }
            return resolved;
          };
          const mut = makeMutationBuilder(execute);
          return {
            select(): ShareMutationBuilder {
              return mut;
            },
            then: mut.then,
          };
        },

        async upsert(
          values: Record<string, unknown> | ReadonlyArray<Record<string, unknown>>
        ): Promise<{ data: unknown; error: ShareDbErrorLike | null }> {
          ops.push({ kind: 'upsert', tableOrFn: table, payload: values });
          const arr = behavior.upsertQueue?.[table];
          if (!arr || arr.length === 0) return { data: values, error: null };
          const idx = upsertCursors.get(table) || 0;
          upsertCursors.set(table, idx + 1);
          return arr[idx] ?? arr[arr.length - 1];
        },

        update(values: Record<string, unknown>): ShareUpdateBuilder {
          const filters: Array<{ column: string; value: string | null }> = [];
          let resolved: ShareQueryResponse | null = null;
          const execute = (): ShareQueryResponse => {
            if (!resolved) {
              ops.push({ kind: 'update', tableOrFn: table, payload: values, filters });
              const fallbackId =
                filters.find((f) => f.column === 'id')?.value || LINK_EXISTING_ID;
              resolved = dequeueResponse(
                behavior.updateQueue,
                updateCursors,
                table,
                { data: [{ id: fallbackId }], error: null }
              );
            }
            return resolved;
          };
          const mut = makeMutationBuilder(execute);
          const builder: ShareUpdateBuilder = {
            eq(column: string, value: string): ShareUpdateBuilder {
              filters.push({ column, value });
              return builder;
            },
            select(): ShareMutationBuilder {
              return mut;
            },
            then: mut.then,
          };
          return builder;
        },

        delete(): ShareDeleteBuilder {
          const filters: Array<{ column: string; value: string | string[] | null }> = [];
          let resolved: ShareQueryResponse | null = null;
          const execute = (): ShareQueryResponse => {
            if (!resolved) {
              ops.push({ kind: 'delete', tableOrFn: table, filters });
              resolved = dequeueResponse(
                behavior.deleteQueue,
                deleteCursors,
                table,
                { data: [], error: null }
              );
            }
            return resolved;
          };
          const mut = makeMutationBuilder(execute);
          const builder: ShareDeleteBuilder = {
            eq(column: string, value: string): ShareDeleteBuilder {
              filters.push({ column, value });
              return builder;
            },
            in(column: string, values: ReadonlyArray<string>): ShareDeleteBuilder {
              filters.push({ column, value: [...values] });
              return builder;
            },
            then: mut.then,
          };
          return builder;
        },
      };
    },

    async rpc(
      fn: string,
      params?: Record<string, unknown>
    ): Promise<{ data: unknown; error: ShareDbErrorLike | null }> {
      ops.push({ kind: 'rpc', tableOrFn: fn, payload: params });
      if (behavior.rpcHandler) {
        return behavior.rpcHandler(fn, params);
      }
      return { data: true, error: null };
    },
  };

  return { client, ops };
}

test('assertValidUuid rejects invalid or mock non-UUID identifiers before issuing DB calls', async () => {
  const { client, ops } = createMockSupabase();

  await assert.rejects(
    () =>
      persistShareContactos(client, {
        links: [{ id_contacto: 'mock-contact-1', id_certificado: CERT_Y_ID }],
      }),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.equal(containsRawUuid(err.message), false);
      return true;
    }
  );

  await assert.rejects(
    () =>
      persistShareTurnos(client, {
        certLinks: [
          {
            id_turno: TURNO_1_ID,
            id_certificado: 'not-a-uuid',
            id_certificado_origen: CERT_X_ID,
          },
        ],
      }),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.equal(containsRawUuid(err.message), false);
      return true;
    }
  );

  await assert.rejects(
    () =>
      persistShareProcesos(client, {
        links: [
          {
            id_proceso: PROC_P_ID,
            id_certificado: CERT_Y_ID,
            requisitoIds: ['bad-req-id'],
          },
        ],
      }),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.equal(containsRawUuid(err.message), false);
      return true;
    }
  );

  await assert.rejects(
    () =>
      persistShareSitios(client, {
        sitioLinks: [
          { id_sitio: 'sitio-mock', id_certificado: CERT_Y_ID, numero_sitio: 1 },
        ],
      }),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.equal(containsRawUuid(err.message), false);
      return true;
    }
  );

  await assert.rejects(
    () =>
      persistUnlinkSharedChild(
        client,
        'sitio_certificado_compartido',
        '12345'
      ),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.equal(containsRawUuid(err.message), false);
      return true;
    }
  );

  assert.equal(ops.length, 0);
});

test('Soft-delete reactivation restores archived bridge link without creating duplicate row', async () => {
  const { client, ops } = createMockSupabase({
    selectQueue: {
      contacto_certificado_compartido: [
        {
          data: [{ id: LINK_EXISTING_ID, deleted_at: '2026-06-01T12:00:00Z' }],
          error: null,
        },
      ],
    },
  });

  const res = await persistShareContactos(client, {
    links: [{ id_contacto: CONTACTO_1_ID, id_certificado: CERT_Y_ID }],
  });

  assert.equal(res.ok, true);
  assert.deepEqual(res.data, {
    linkIds: [LINK_EXISTING_ID],
    createdCount: 0,
    restoredCount: 1,
  });
  assert.equal(
    ops.some((op) => op.kind === 'update' && op.tableOrFn === 'contacto_certificado_compartido'),
    true
  );
  assert.equal(
    ops.some((op) => op.kind === 'insert'),
    false
  );
});

test('Compensating rollback archives newly created proceso_certificado_compartido link when requisitos_por_proceso fails', async () => {
  const { client, ops } = createMockSupabase({
    selectQueue: {
      proceso_certificado_compartido: [{ data: [], error: null }],
    },
    upsertQueue: {
      requisitos_por_proceso: [
        {
          data: null,
          error: {
            code: 'P0001',
            message: `REQ_EXCLUDED_BY_ISO43: La cláusula ${REQ_14001_A} fue excluida como No Aplicable en el certificado ${CERT_Y_ID}`,
          },
        },
      ],
    },
  });

  const res = await persistShareProcesos(client, {
    links: [
      {
        id_proceso: PROC_P_ID,
        id_certificado: CERT_Y_ID,
        requisitoIds: [REQ_14001_A, REQ_14001_B],
      },
    ],
  });

  assert.equal(res.ok, false);
  assert.ok(res.error);
  assert.equal(containsRawUuid(res.error), false);
  assert.match(res.error, /No Aplicable/i);
  assert.equal(res.rolledBackLinkIds?.length, 1);

  const insertedOp = ops.find(
    (op) => op.kind === 'insert' && op.tableOrFn === 'proceso_certificado_compartido'
  );
  assert.ok(insertedOp);

  const rpcOp = ops.find(
    (op) => op.kind === 'rpc' && op.tableOrFn === 'archive_record'
  );
  assert.ok(rpcOp);
  const rpcParams = rpcOp.payload as Record<string, unknown>;
  assert.equal(rpcParams.p_table, 'proceso_certificado_compartido');
  assert.equal(rpcParams.p_record_id, res.rolledBackLinkIds?.[0]);
  assert.equal(containsRawUuid(String(rpcParams.p_reason || '')), false);
});

test('persistShareSitios executes cascade in order (proceso -> sitio -> turno -> procesos_por_sitio scoped by id_certificado) and rolls back on Paso C error', async () => {
  const { client, ops } = createMockSupabase({
    selectQueue: {
      proceso_certificado_compartido: [{ data: [], error: null }],
      sitio_certificado_compartido: [{ data: [], error: null }],
      turno_certificado_compartido: [{ data: [], error: null }],
      procesos_por_sitio: [{ data: [], error: null }],
    },
  });

  const okRes = await persistShareSitios(client, {
    procesoShares: [
      {
        id_proceso: PROC_P_ID,
        id_certificado: CERT_Y_ID,
        requisitoIds: [REQ_14001_A],
      },
    ],
    sitioLinks: [
      {
        id_sitio: SITIO_S_ID,
        id_certificado: CERT_Y_ID,
        numero_sitio: 2,
      },
    ],
    turnoCertLinks: [
      {
        id_turno: TURNO_1_ID,
        id_certificado: CERT_Y_ID,
        id_certificado_origen: CERT_X_ID,
      },
    ],
    procesosPorSitio: [
      {
        id_certificado: CERT_Y_ID,
        id_sitio: SITIO_S_ID,
        id_proceso: PROC_P_ID,
      },
    ],
  });

  assert.equal(okRes.ok, true);
  assert.equal(okRes.data?.procesoLinkIds.length, 1);
  assert.equal(okRes.data?.sitioLinkIds.length, 1);
  assert.equal(okRes.data?.turnoLinkIds.length, 1);
  assert.equal(okRes.data?.procesoSitioLinkIds.length, 1);

  const insertOrder = ops
    .filter((o) => o.kind === 'insert')
    .map((o) => o.tableOrFn);
  assert.deepEqual(insertOrder, [
    'proceso_certificado_compartido',
    'sitio_certificado_compartido',
    'turno_certificado_compartido',
    'procesos_por_sitio',
  ]);

  // Verify Paso C.2 payload includes `id_certificado`
  const ppsInsert = ops.find(
    (o) => o.kind === 'insert' && o.tableOrFn === 'procesos_por_sitio'
  );
  assert.equal(
    (ppsInsert?.payload as Record<string, unknown>).id_certificado,
    CERT_Y_ID
  );

  // Failure in Paso C rolls back Paso B (`sitio_certificado_compartido`) & Paso A (`proceso_certificado_compartido`)
  const { client: failClient, ops: failOps } = createMockSupabase({
    selectQueue: {
      proceso_certificado_compartido: [{ data: [], error: null }],
      sitio_certificado_compartido: [{ data: [], error: null }],
      turno_certificado_compartido: [{ data: [], error: null }],
      procesos_por_sitio: [{ data: [], error: null }],
    },
    insertQueue: {
      procesos_por_sitio: [
        {
          data: null,
          error: {
            code: 'P0001',
            message: `Violación de Conglomerado: proceso ${PROC_P_ID} sin vínculo en ${CERT_Y_ID}`,
          },
        },
      ],
    },
  });

  const failRes = await persistShareSitios(failClient, {
    procesoShares: [
      {
        id_proceso: PROC_P_ID,
        id_certificado: CERT_Y_ID,
        requisitoIds: [REQ_14001_A],
      },
    ],
    sitioLinks: [
      {
        id_sitio: SITIO_S_ID,
        id_certificado: CERT_Y_ID,
        numero_sitio: 2,
      },
    ],
    turnoCertLinks: [
      {
        id_turno: TURNO_1_ID,
        id_certificado: CERT_Y_ID,
        id_certificado_origen: CERT_X_ID,
      },
    ],
    procesosPorSitio: [
      {
        id_certificado: CERT_Y_ID,
        id_sitio: SITIO_S_ID,
        id_proceso: PROC_P_ID,
      },
    ],
  });

  assert.equal(failRes.ok, false);
  assert.ok(failRes.error);
  assert.equal(containsRawUuid(failRes.error), false);
  assert.equal(failRes.rolledBackLinkIds?.length, 3);
  const rolledBackTables = failOps
    .filter((o) => o.kind === 'rpc' && o.tableOrFn === 'archive_record')
    .map((o) => (o.payload as Record<string, unknown>).p_table);
  assert.deepEqual(rolledBackTables, [
    'turno_certificado_compartido',
    'sitio_certificado_compartido',
    'proceso_certificado_compartido',
  ]);
});

test('persistUnlinkSharedChild blocks shared site unlink only when active audit belongs to target certificate', async () => {
  // Blocked when target certificate CERT_Y_ID has active audit on SITIO_S_ID
  const { client: blockedClient, ops: blockedOps } = createMockSupabase({
    selectQueue: {
      sitio_certificado_compartido: [
        {
          data: [
            {
              id: LINK_ARCHIVE_ID,
              id_sitio: SITIO_S_ID,
              id_certificado: CERT_Y_ID,
              deleted_at: null,
            },
          ],
          error: null,
        },
      ],
      sitios_por_auditoria: [
        {
          data: [
            {
              id: '91000000-0000-4000-8000-000000000001',
              id_auditoria: AUDIT_Y_ID,
              auditoria: {
                id: AUDIT_Y_ID,
                id_certificado: CERT_Y_ID,
                deleted_at: null,
              },
            },
          ],
          error: null,
        },
      ],
    },
  });

  const blocked = await persistUnlinkSharedChild(
    blockedClient,
    'sitio_certificado_compartido',
    LINK_ARCHIVE_ID
  );
  assert.equal(blocked.ok, false);
  assert.ok(blocked.error);
  assert.equal(containsRawUuid(blocked.error), false);
  assert.match(blocked.error, /auditoría/i);
  assert.equal(
    blockedOps.some((o) => o.kind === 'rpc'),
    false
  );

  // Allowed when the only active audit on SITIO_S_ID belongs to origin CERT_X_ID (not target CERT_Y_ID)
  const { client: okClient, ops: okOps } = createMockSupabase({
    selectQueue: {
      sitio_certificado_compartido: [
        {
          data: [
            {
              id: LINK_ARCHIVE_ID,
              id_sitio: SITIO_S_ID,
              id_certificado: CERT_Y_ID,
              deleted_at: null,
            },
          ],
          error: null,
        },
      ],
      sitios_por_auditoria: [
        {
          data: [
            {
              id: '91000000-0000-4000-8000-000000000002',
              id_auditoria: AUDIT_X_ID,
              auditoria: {
                id: AUDIT_X_ID,
                id_certificado: CERT_X_ID,
                deleted_at: null,
              },
            },
          ],
          error: null,
        },
      ],
    },
  });

  const allowed = await persistUnlinkSharedChild(
    okClient,
    'sitio_certificado_compartido',
    LINK_ARCHIVE_ID,
    `Desvinculación solicitada en ${CERT_Y_ID}`
  );
  assert.equal(allowed.ok, true);
  const rpcCall = okOps.find((o) => o.kind === 'rpc');
  assert.ok(rpcCall);
  const rpcPayload = rpcCall.payload as Record<string, unknown>;
  assert.equal(rpcPayload.p_table, 'sitio_certificado_compartido');
  assert.equal(rpcPayload.p_record_id, LINK_ARCHIVE_ID);
  assert.equal(containsRawUuid(String(rpcPayload.p_reason || '')), false);
});

test('translateShareDbError translates P0001, 23505, 42501, 23503 & ISO 4.3 errors for all 4 shared tables with Zero-UUID', () => {
  const cases: Array<{ err: ShareDbErrorLike; expectedPattern: RegExp }> = [
    {
      err: {
        code: 'P0001',
        message: `REQ_EXCLUDED_BY_ISO43: Cláusula ${REQ_14001_A} excluida en ${CERT_Y_ID}`,
      },
      expectedPattern: /excluida/i,
    },
    {
      err: {
        code: '42501',
        message: `new row violates row-level security policy for table "sitio_certificado_compartido" (${CERT_Y_ID})`,
      },
      expectedPattern: /Permisos insuficientes \(RLS\)/i,
    },
    {
      err: {
        code: 'P0001',
        message: `Violación de Conglomerado: ${CERT_X_ID} y ${CERT_Y_ID} pertenecen a conglomerados distintos`,
      },
      expectedPattern: /Conglomerado/i,
    },
    {
      err: {
        code: 'P0001',
        message: `Conflicto de Contacto: ya existe contacto en ${CERT_Y_ID}`,
      },
      expectedPattern: /Conflicto de Contacto/i,
    },
    {
      err: {
        code: 'P0001',
        message: `Conflicto de Proceso: duplicado en ${CERT_Y_ID}`,
      },
      expectedPattern: /Conflicto de Proceso/i,
    },
    {
      err: {
        code: 'P0001',
        message: `Conflicto de Sitio: número ocupado en ${CERT_Y_ID}`,
      },
      expectedPattern: /Conflicto de Sitio/i,
    },
    {
      err: {
        code: '23505',
        message: `duplicate key value violates unique constraint "uq_contacto_cert_compartido_active" (${CONTACTO_1_ID})`,
      },
      expectedPattern: /contacto ya se encuentra compartido/i,
    },
    {
      err: {
        code: '23505',
        message: `duplicate key value violates unique constraint "uq_turno_cert_compartido_active" (${TURNO_1_ID})`,
      },
      expectedPattern: /turno operativo ya se encuentra compartido/i,
    },
    {
      err: {
        code: '23505',
        message: `duplicate key value violates unique constraint "uq_proceso_cert_compartido_active" (${PROC_P_ID})`,
      },
      expectedPattern: /proceso ya se encuentra compartido/i,
    },
    {
      err: {
        code: '23505',
        message: `duplicate key value violates unique constraint "uq_sitio_cert_compartido_active" (${SITIO_S_ID})`,
      },
      expectedPattern: /sede ya se encuentra compartida/i,
    },
    {
      err: {
        code: '23505',
        message: `duplicate key value violates unique constraint "uq_sitio_cert_compartido_num_active" (${CERT_Y_ID})`,
      },
      expectedPattern: /número de sitio/i,
    },
    {
      err: {
        code: '23503',
        message: `update or delete violates foreign key constraint on "sitios_por_auditoria" (${AUDIT_Y_ID})`,
      },
      expectedPattern: /auditorías activas/i,
    },
  ];

  for (const item of cases) {
    const translated = translateShareDbError(item.err);
    assert.equal(containsRawUuid(translated), false, `Leaked UUID in: ${translated}`);
    assert.match(translated, item.expectedPattern);
  }
});

test('assembleSharedCertificateCollections isolates dual-cert clauses, site numbers, selective shifts & CLIENT RLS visibility', () => {
  const visibleCerts: VisibleCertMetadata[] = [
    {
      id: CERT_X_ID,
      numero_certificado: 'FN-QMS-2026-001',
      organizacion_nombre: 'Grupo Industrial Alpha S.A.',
      norma_codigo: 'ISO 9001:2015',
    },
    {
      id: CERT_Y_ID,
      numero_certificado: 'FN-EMS-2026-002',
      organizacion_nombre: 'Grupo Industrial Beta S.A.',
      norma_codigo: 'ISO 14001:2015',
    },
  ];

  const reqLookupCatalog: RequisitoLtree[] = [
    {
      id: REQ_9001_A,
      id_norma: 'norma-9001',
      codigo: '4.1',
      titulo: 'Comprensión de la organización',
      ruta_materializada: '4.1',
    },
    {
      id: REQ_9001_B,
      id_norma: 'norma-9001',
      codigo: '8.5.1',
      titulo: 'Control de la producción',
      ruta_materializada: '8.5.1',
    },
    {
      id: REQ_14001_A,
      id_norma: 'norma-14001',
      codigo: '6.1.2',
      titulo: 'Aspectos ambientales',
      ruta_materializada: '6.1.2',
    },
    {
      id: REQ_14001_B,
      id_norma: 'norma-14001',
      codigo: '8.1',
      titulo: 'Planificación y control operacional',
      ruta_materializada: '8.1',
    },
  ];

  const shiftCatalog: TurnoCatalogItem[] = [
    {
      id: TURNO_1_ID,
      hora_entrada: '06:00:00',
      hora_salida: '14:00:00',
      descripcion: 'Turno Mañana (06:00 – 14:00)',
    },
    {
      id: TURNO_2_ID,
      hora_entrada: '14:00:00',
      hora_salida: '22:00:00',
      descripcion: 'Turno Tarde (14:00 – 22:00)',
    },
  ];

  const baseInput = {
    contactosRows: [
      {
        id: CONTACTO_1_ID,
        id_certificado: CERT_X_ID,
        nombre: 'Ing. Laura Méndez',
        cargo: 'Gerente HSEQ',
      },
    ],
    telefonosByContacto: new Map<string, TelefonoContactoEntity[]>(),
    emailsByContacto: new Map<string, EmailContactoEntity[]>(),
    contactosCompartidosRows: [
      {
        id: '72000000-0000-4000-8000-000000000001',
        id_contacto: CONTACTO_1_ID,
        id_certificado: CERT_Y_ID,
      },
    ],
    sitiosRows: [
      {
        id: SITIO_S_ID,
        id_certificado: CERT_X_ID,
        numero_sitio: 1,
        nombre_sitio: 'Planta Compartida Norte',
        direccion_sitio: 'Av. Industrial 450',
        personal_count: 120,
      },
      {
        id: SITIO_0_Y_ID,
        id_certificado: CERT_Y_ID,
        numero_sitio: 0,
        nombre_sitio: 'Sede Central Beta',
        direccion_sitio: 'Calle 10 #20-30',
        personal_count: 60,
      },
    ],
    sitiosCompartidosRows: [
      {
        id: '73000000-0000-4000-8000-000000000001',
        id_sitio: SITIO_S_ID,
        id_certificado: CERT_Y_ID,
        numero_sitio: 2,
      },
    ],
    procesosRows: [
      {
        id: PROC_P_ID,
        id_certificado: CERT_X_ID,
        nombre_proceso: 'Manufactura y Envasado',
        tipo: 'Medular',
      },
    ],
    procesosCompartidosRows: [
      {
        id: '74000000-0000-4000-8000-000000000001',
        id_proceso: PROC_P_ID,
        id_certificado: CERT_Y_ID,
      },
    ],
    reqsPorProcesoRows: [
      {
        id_proceso: PROC_P_ID,
        id_certificado: CERT_X_ID,
        id_requisito: REQ_9001_A,
        requisito: { id: REQ_9001_A, codigo: '4.1', ruta_materializada: '4.1' },
      },
      {
        id_proceso: PROC_P_ID,
        id_certificado: CERT_X_ID,
        id_requisito: REQ_9001_B,
        requisito: { id: REQ_9001_B, codigo: '8.5.1', ruta_materializada: '8.5.1' },
      },
      {
        id_proceso: PROC_P_ID,
        id_certificado: CERT_Y_ID,
        id_requisito: REQ_14001_A,
        requisito: { id: REQ_14001_A, codigo: '6.1.2', ruta_materializada: '6.1.2' },
      },
      {
        id_proceso: PROC_P_ID,
        id_certificado: CERT_Y_ID,
        id_requisito: REQ_14001_B,
        requisito: { id: REQ_14001_B, codigo: '8.1', ruta_materializada: '8.1' },
      },
    ],
    reqLookupCatalog,
    procesosPorSitioRows: [
      {
        id: '75000000-0000-4000-8000-000000000001',
        id_sitio: SITIO_S_ID,
        id_proceso: PROC_P_ID,
        id_certificado: CERT_X_ID,
      },
      {
        id: '75000000-0000-4000-8000-000000000002',
        id_sitio: SITIO_S_ID,
        id_proceso: PROC_P_ID,
        id_certificado: CERT_Y_ID,
      },
    ],
    turnosPorSitioRows: [
      {
        id: '76000000-0000-4000-8000-000000000001',
        id_sitio: SITIO_S_ID,
        id_turno: TURNO_1_ID,
        sitio: { id: SITIO_S_ID, id_certificado: CERT_X_ID, nombre_sitio: 'Planta Compartida Norte' },
        turno: { id: TURNO_1_ID, hora_entrada: '06:00:00', hora_salida: '14:00:00' },
      },
      {
        id: '76000000-0000-4000-8000-000000000002',
        id_sitio: SITIO_S_ID,
        id_turno: TURNO_2_ID,
        sitio: { id: SITIO_S_ID, id_certificado: CERT_X_ID, nombre_sitio: 'Planta Compartida Norte' },
        turno: { id: TURNO_2_ID, hora_entrada: '14:00:00', hora_salida: '22:00:00' },
      },
    ],
    turnosCompartidosRows: [
      {
        id: '77000000-0000-4000-8000-000000000001',
        id_turno: TURNO_1_ID,
        id_certificado: CERT_Y_ID,
        id_certificado_origen: CERT_X_ID,
        turno: { id: TURNO_1_ID, hora_entrada: '06:00:00', hora_salida: '14:00:00' },
      },
    ],
    shiftCatalog,
    formatTurnoTime: (raw: string) => raw.slice(0, 5),
  };

  // Full Admin/Worker view (both X and Y visible)
  const adminHydrated = assembleSharedCertificateCollections({
    visibleCerts,
    ...baseInput,
  });

  const procX = adminHydrated.procesosByCert.get(CERT_X_ID)?.[0];
  const procY = adminHydrated.procesosByCert.get(CERT_Y_ID)?.[0];
  assert.ok(procX);
  assert.ok(procY);
  assert.deepEqual(procX.clausulas_cubiertas, ['4.1', '8.5.1']);
  assert.deepEqual(procY.clausulas_cubiertas, ['6.1.2', '8.1']);
  assert.deepEqual(procY.requisitos_by_certificado?.[CERT_X_ID]?.clausulas_cubiertas, [
    '4.1',
    '8.5.1',
  ]);
  assert.deepEqual(procY.requisitos_by_certificado?.[CERT_Y_ID]?.clausulas_cubiertas, [
    '6.1.2',
    '8.1',
  ]);
  assert.equal(procY.sharedFromCertId, CERT_X_ID);
  assert.match(procY.sharedFromCertLabel || '', /FN-QMS-2026-001/);

  // Sites in Y: Sitio 0 first, shared site gets override numero_sitio = 2 and strictly Y's clauses on its `procesos_por_sitio`
  const sitiosY = adminHydrated.sitiosByCert.get(CERT_Y_ID) || [];
  assert.equal(sitiosY.length, 2);
  assert.equal(sitiosY[0].numero_sitio, 0);
  assert.equal(sitiosY[1].id, SITIO_S_ID);
  assert.equal(sitiosY[1].numero_sitio, 2);
  assert.deepEqual(
    sitiosY[1].procesos_por_sitio?.[0]?.clausulas_cubiertas,
    ['6.1.2', '8.1']
  );

  // Selective shifts: only TURNO_1_ID (shared) is visible in Y; TURNO_2_ID (owned by X, not shared) does NOT leak
  const turnosY = adminHydrated.turnosByCert.get(CERT_Y_ID) || [];
  assert.deepEqual(
    turnosY.map((t) => t.id),
    [TURNO_1_ID]
  );
  assert.deepEqual(
    sitiosY[1].turnos_por_sitio?.map((tps) => tps.id_turno),
    [TURNO_1_ID]
  );

  // CLIENT RLS view: only CERT_Y_ID visible -> `sharedFromCertLabel` must be null and `sharedTargets` must omit hidden origin/sibling certs
  const clientHydrated = assembleSharedCertificateCollections({
    visibleCerts: [visibleCerts[1]],
    ...baseInput,
  });
  const clientProcY = clientHydrated.procesosByCert.get(CERT_Y_ID)?.[0];
  const clientContactoY = clientHydrated.contactosByCert.get(CERT_Y_ID)?.[0];
  const clientSitioSharedY = clientHydrated.sitiosByCert.get(CERT_Y_ID)?.[1];
  assert.ok(clientProcY);
  assert.ok(clientContactoY);
  assert.ok(clientSitioSharedY);
  assert.equal(clientProcY.sharedFromCertLabel, null);
  assert.equal(clientContactoY.sharedFromCertLabel, null);
  assert.equal(clientSitioSharedY.sharedFromCertLabel, null);
  assert.deepEqual(clientProcY.clausulas_cubiertas, ['6.1.2', '8.1']);
  assert.equal(clientProcY.requisitos_by_certificado?.[CERT_X_ID], undefined);
});

test('Structural Contract: Step 2.4 persistence & hydration files maintain 0 any and id_certificado scoping', () => {
  const stripComments = (code: string): string =>
    code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const persistenceSrc = stripComments(
    fs.readFileSync(
      path.resolve(process.cwd(), 'src/lib/certificadoSharePersistence.ts'),
      'utf8'
    )
  );
  const testSrc = stripComments(
    fs.readFileSync(
      path.resolve(process.cwd(), 'src/lib/certificadoSharePersistence.test.ts'),
      'utf8'
    )
  );
  const mainSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'src/main.ts'),
    'utf8'
  );

  assert.equal(/:\s*any\b|\bas\s+any\b/.test(persistenceSrc), false);
  assert.equal(/:\s*any\b|\bas\s+any\b/.test(testSrc), false);

  assert.match(mainSrc, /assembleSharedCertificateCollections/);
  assert.match(mainSrc, /contacto_certificado_compartido/);
  assert.match(mainSrc, /turno_certificado_compartido/);
  assert.match(mainSrc, /proceso_certificado_compartido/);
  assert.match(mainSrc, /sitio_certificado_compartido/);
  assert.match(mainSrc, /onConflict:\s*'id_proceso,id_certificado_version,id_requisito'/);
  assert.equal(
    /onConflict:\s*'id_proceso,id_certificado,id_requisito'/.test(mainSrc),
    false,
    'src/main.ts must never use legacy non-versioned requisitos_por_proceso ON CONFLICT key'
  );
});

test('Step 1.2: persistShareProcesos persists sincronizar_requisitos on both insert and soft-delete restore', async () => {
  const CERT_Z_ID = '40000000-0000-4000-8000-000000000003';
  const { client, ops } = createMockSupabase({
    selectQueue: {
      proceso_certificado_compartido: [
        { data: [], error: null },
        {
          data: [{ id: LINK_EXISTING_ID, deleted_at: '2026-06-01T12:00:00Z' }],
          error: null,
        },
      ],
    },
  });

  const res = await persistShareProcesos(client, {
    links: [
      {
        id_proceso: PROC_P_ID,
        id_certificado: CERT_Y_ID,
        requisitoIds: [REQ_9001_A],
        sincronizar_requisitos: true,
      },
      {
        id_proceso: PROC_P_ID,
        id_certificado: CERT_Z_ID,
        requisitoIds: [],
        sincronizar_requisitos: false,
      },
    ],
  });

  assert.equal(res.ok, true);
  assert.equal(res.data?.createdCount, 1);
  assert.equal(res.data?.restoredCount, 1);
  assert.equal(res.data?.requisitoLinksUpserted, 1);

  const insertOp = ops.find(
    (o) => o.kind === 'insert' && o.tableOrFn === 'proceso_certificado_compartido'
  );
  assert.equal(
    (insertOp?.payload as Record<string, unknown>).sincronizar_requisitos,
    true
  );

  const restoreOp = ops.find(
    (o) => o.kind === 'update' && o.tableOrFn === 'proceso_certificado_compartido'
  );
  assert.equal(
    (restoreOp?.payload as Record<string, unknown>).sincronizar_requisitos,
    false
  );
});

test('Step 1.2: persistSyncProcesoRequisitos calls fn_sync_shared_process_requisitos RPC, translates P0001 errors, and executes transactional fallback (update + upsert + delete)', async () => {
  // 1. RPC JSONB path
  const { client: rpcClient, ops: rpcOps } = createMockSupabase({
    rpcHandler: async (fn, params) => {
      assert.equal(fn, 'fn_sync_shared_process_requisitos');
      assert.equal(params?.p_id_proceso, PROC_P_ID);
      assert.equal(params?.p_source_cert_id, CERT_X_ID);
      assert.equal(params?.p_target_cert_id, CERT_Y_ID);
      assert.equal(params?.p_enable_sync, true);
      return {
        data: {
          synced_certs_count: 1,
          inserted_count: 2,
          deleted_count: 0,
          skipped_excluded_count: 1,
        },
        error: null,
      };
    },
  });

  const rpcRes = await persistSyncProcesoRequisitos(rpcClient, {
    id_proceso: PROC_P_ID,
    id_certificado_origen: CERT_X_ID,
    id_certificado_destino: CERT_Y_ID,
    enableSync: true,
  });
  assert.equal(rpcRes.ok, true);
  assert.deepEqual(rpcRes.data, {
    syncedCertsCount: 1,
    insertedCount: 2,
    deletedCount: 0,
    skippedExcludedCount: 1,
    usedRpc: true,
  });
  assert.equal(rpcOps.length, 1);

  // 2. Real P0001 error from RPC translates Zero-UUID without falling back
  const { client: rpcErrClient } = createMockSupabase({
    rpcHandler: async () => ({
      data: null,
      error: {
        code: 'P0001',
        message: `Operación bloqueada: los certificados ${CERT_X_ID} y ${CERT_Y_ID} poseen normas distintas.`,
      },
    }),
  });
  const errRes = await persistSyncProcesoRequisitos(rpcErrClient, {
    id_proceso: PROC_P_ID,
    id_certificado_origen: CERT_X_ID,
    id_certificado_destino: CERT_Y_ID,
  });
  assert.equal(errRes.ok, false);
  assert.ok(errRes.error);
  assert.equal(containsRawUuid(errRes.error), false);
  assert.match(errRes.error, /normas distintas/i);

  // 3. Fallback path (missing RPC PGRST202 -> update sincronizar_requisitos + upsert + delete in mirrorMode)
  const { client: fbClient, ops: fbOps } = createMockSupabase({
    rpcHandler: async () => ({
      data: null,
      error: {
        code: 'PGRST202',
        message: 'Could not find the function public.fn_sync_shared_process_requisitos',
      },
    }),
  });

  const fbRes = await persistSyncProcesoRequisitos(fbClient, {
    id_proceso: PROC_P_ID,
    id_certificado_origen: CERT_X_ID,
    enableSync: true,
    mirrorMode: true,
    targets: [
      {
        id_certificado_destino: CERT_Y_ID,
        requisitoIdsToInsert: [REQ_9001_A],
        requisitoIdsToRemove: [REQ_9001_B],
        skippedExcludedCount: 1,
      },
    ],
  });
  assert.equal(fbRes.ok, true);
  assert.deepEqual(fbRes.data, {
    syncedCertsCount: 1,
    insertedCount: 1,
    deletedCount: 1,
    skippedExcludedCount: 1,
    usedRpc: false,
  });
  assert.equal(
    fbOps.some(
      (o) =>
        o.kind === 'update' &&
        o.tableOrFn === 'proceso_certificado_compartido' &&
        (o.payload as Record<string, unknown>).sincronizar_requisitos === true
    ),
    true
  );
  assert.equal(
    fbOps.some(
      (o) => o.kind === 'upsert' && o.tableOrFn === 'requisitos_por_proceso'
    ),
    true
  );
  assert.equal(
    fbOps.some(
      (o) => o.kind === 'delete' && o.tableOrFn === 'requisitos_por_proceso'
    ),
    true
  );
});

test('Step 1.2: assembleSharedCertificateCollections hydrates sincronizar_requisitos into sharedTargets, requisitos_by_certificado, and sharedLinkSincronizarRequisitos', () => {
  const CERT_Z_ID = '40000000-0000-4000-8000-000000000003';
  const visibleCerts: VisibleCertMetadata[] = [
    {
      id: CERT_X_ID,
      numero_certificado: 'FN-QMS-X',
      organizacion_nombre: 'Org Alpha',
      norma_codigo: 'ISO 9001:2015',
    },
    {
      id: CERT_Y_ID,
      numero_certificado: 'FN-QMS-Y',
      organizacion_nombre: 'Org Beta',
      norma_codigo: 'ISO 9001:2015',
    },
    {
      id: CERT_Z_ID,
      numero_certificado: 'FN-EMS-Z',
      organizacion_nombre: 'Org Beta',
      norma_codigo: 'ISO 14001:2015',
    },
  ];

  const hydrated = assembleSharedCertificateCollections({
    visibleCerts,
    contactosRows: [],
    telefonosByContacto: new Map(),
    emailsByContacto: new Map(),
    contactosCompartidosRows: [],
    sitiosRows: [],
    sitiosCompartidosRows: [],
    procesosRows: [
      {
        id: PROC_P_ID,
        id_certificado: CERT_X_ID,
        nombre_proceso: 'Manufactura Central',
        tipo: 'Medular',
      },
    ],
    procesosCompartidosRows: [
      {
        id: '74000000-0000-4000-8000-000000000011',
        id_proceso: PROC_P_ID,
        id_certificado: CERT_Y_ID,
        sincronizar_requisitos: true,
      },
      {
        id: '74000000-0000-4000-8000-000000000012',
        id_proceso: PROC_P_ID,
        id_certificado: CERT_Z_ID,
        sincronizar_requisitos: false,
      },
    ],
    reqsPorProcesoRows: [
      {
        id_proceso: PROC_P_ID,
        id_certificado: CERT_X_ID,
        id_requisito: REQ_9001_A,
        requisito: { id: REQ_9001_A, codigo: '4.1', ruta_materializada: '4.1' },
      },
    ],
    reqLookupCatalog: [
      {
        id: REQ_9001_A,
        id_norma: 'norma-9001',
        codigo: '4.1',
        titulo: 'Contexto',
        ruta_materializada: '4.1',
      },
    ],
    procesosPorSitioRows: [],
    turnosPorSitioRows: [],
    turnosCompartidosRows: [],
    shiftCatalog: [],
    formatTurnoTime: (raw: string) => raw.slice(0, 5),
  });

  const ownerProc = hydrated.procesosByCert.get(CERT_X_ID)?.[0];
  const syncedProcY = hydrated.procesosByCert.get(CERT_Y_ID)?.[0];
  const indepProcZ = hydrated.procesosByCert.get(CERT_Z_ID)?.[0];

  assert.ok(ownerProc && syncedProcY && indepProcZ);
  assert.equal(ownerProc.sharedLinkSincronizarRequisitos, undefined);
  assert.equal(syncedProcY.sharedLinkSincronizarRequisitos, true);
  assert.equal(indepProcZ.sharedLinkSincronizarRequisitos, false);

  const refY = ownerProc.sharedTargets?.find((t) => t.targetCertId === CERT_Y_ID);
  const refZ = ownerProc.sharedTargets?.find((t) => t.targetCertId === CERT_Z_ID);
  assert.equal(refY?.sincronizar_requisitos, true);
  assert.equal(refZ?.sincronizar_requisitos, false);
  assert.equal(ownerProc.requisitos_by_certificado?.[CERT_Y_ID]?.sincronizar_requisitos, true);
  assert.equal(ownerProc.requisitos_by_certificado?.[CERT_Z_ID]?.sincronizar_requisitos, false);
});

test('Step 2.3: persistSaveOwnAlcance archives prior shared link, saves/updates own scope with no char limit or history, and preserves Zero-UUID', async () => {
  const ALC_OWN_ID = '90000000-0000-4000-8000-000000000001';
  const PREV_SHARE_LINK_ID = '91000000-0000-4000-8000-000000000001';

  // 1. Insert new >5000-char own Alcance after archiving a prior shared link
  const longTextEs = `${'Manufactura de sistemas industriales críticos.\n'.repeat(120)}Fin.`;
  assert.ok(longTextEs.length > 5000);

  const { client: insertClient, ops: insertOps } = createMockSupabase({
    selectQueue: {
      alcance_certificado_compartido: [
        {
          data: [{ id: PREV_SHARE_LINK_ID, deleted_at: null }],
          error: null,
        },
      ],
      alcance: [{ data: [], error: null }],
    },
    insertQueue: {
      alcance: [{ data: [{ id: ALC_OWN_ID }], error: null }],
    },
  });

  const insertRes = await persistSaveOwnAlcance(insertClient, {
    certId: CERT_Y_ID,
    alcance_es: `  ${longTextEs}  `,
    alcance_en: '  \n  ',
  });

  assert.equal(insertRes.ok, true);
  assert.equal(insertRes.data?.action, 'inserted');
  assert.equal(insertRes.data?.alcance_es, longTextEs);
  assert.equal(insertRes.data?.alcance_en, null);
  assert.deepEqual(insertRes.data?.archivedShareLinkIds, [PREV_SHARE_LINK_ID]);

  const archOp = insertOps.find(
    (o) => o.kind === 'rpc' && o.tableOrFn === 'archive_record'
  );
  assert.equal(
    (archOp?.payload as Record<string, unknown>).p_table,
    'alcance_certificado_compartido'
  );
  assert.equal(
    (archOp?.payload as Record<string, unknown>).p_record_id,
    PREV_SHARE_LINK_ID
  );

  // 2. Direct update on existingAlcanceId without history tracking
  const { client: updateClient, ops: updateOps } = createMockSupabase({
    selectQueue: {
      alcance_certificado_compartido: [{ data: [], error: null }],
    },
    updateQueue: {
      alcance: [{ data: [{ id: ALC_OWN_ID }], error: null }],
    },
  });

  const updateRes = await persistSaveOwnAlcance(updateClient, {
    certId: CERT_X_ID,
    alcance_es: 'Servicios TI.',
    alcance_en: 'IT Services.',
    existingAlcanceId: ALC_OWN_ID,
  });
  assert.equal(updateRes.ok, true);
  assert.equal(updateRes.data?.action, 'updated');
  assert.equal(updateRes.data?.alcance_es, 'Servicios TI.');
  assert.equal(updateRes.data?.alcance_en, 'IT Services.');
  assert.equal(
    updateOps.some((o) => o.kind === 'update' && o.tableOrFn === 'alcance'),
    true
  );

  // 3. Rejects blank alcance_es cleanly without DB calls
  const { client: emptyClient, ops: emptyOps } = createMockSupabase();
  const invalidRes = await persistSaveOwnAlcance(emptyClient, {
    certId: CERT_X_ID,
    alcance_es: '   ',
  });
  assert.equal(invalidRes.ok, false);
  assert.equal(emptyOps.length, 0);
  assert.equal(containsRawUuid(invalidRes.error || ''), false);
});

test('Step 2.3: persistShareAlcance handles RPC happy path, real P0001 conflict guard, transactional fallback replacement, rollback, and unlink', async () => {
  const ALC_SOURCE_ID = '90000000-0000-4000-8000-000000000010';
  const CERT_Z_ID = '40000000-0000-4000-8000-000000000003';
  const OWN_TARGET_ALC_ID = '90000000-0000-4000-8000-000000000020';
  const PREV_TARGET_SHARE_ID = '91000000-0000-4000-8000-000000000020';
  const NEW_LINK_ID = '91000000-0000-4000-8000-000000000030';

  // 1. RPC path (`fn_compartir_alcance_con_resolucion`)
  const { client: rpcClient, ops: rpcOps } = createMockSupabase({
    rpcHandler: async (fn, params) => {
      assert.equal(fn, 'fn_compartir_alcance_con_resolucion');
      assert.equal(params?.p_id_alcance, ALC_SOURCE_ID);
      assert.deepEqual(params?.p_target_cert_ids, [CERT_Y_ID, CERT_Z_ID]);
      assert.equal(params?.p_reemplazar_existentes, true);
      return {
        data: {
          linked_count: 2,
          replaced_count: 1,
          skipped_count: 0,
        },
        error: null,
      };
    },
  });

  const rpcRes = await persistShareAlcance(rpcClient, {
    id_alcance: ALC_SOURCE_ID,
    targetCertIds: [CERT_Y_ID, CERT_Z_ID],
    replaceExisting: true,
  });
  assert.equal(rpcRes.ok, true);
  assert.deepEqual(rpcRes.data, {
    linkedCount: 2,
    replacedCount: 1,
    skippedCount: 0,
    usedRpc: true,
  });
  assert.equal(rpcOps.length, 1);

  // 2. Real P0001 conflict error from RPC stops immediately without fallback
  const { client: rpcErrClient, ops: rpcErrOps } = createMockSupabase({
    rpcHandler: async () => ({
      data: null,
      error: {
        code: 'P0001',
        message: `CONFLICTO_ALCANCE_EXISTENTE: El certificado ${CERT_Y_ID} ya posee alcance propio.`,
      },
    }),
  });
  const conflictRpcRes = await persistShareAlcance(rpcErrClient, {
    id_alcance: ALC_SOURCE_ID,
    targetCertIds: [CERT_Y_ID],
    replaceExisting: false,
  });
  assert.equal(conflictRpcRes.ok, false);
  assert.equal(containsRawUuid(conflictRpcRes.error || ''), false);
  assert.match(conflictRpcRes.error || '', /alcance/i);
  assert.equal(rpcErrOps.length, 1);

  // 3. Fallback when RPC missing (PGRST202) + replaceExisting = false blocks target that already has own scope
  const { client: fbBlockClient } = createMockSupabase({
    selectQueue: {
      alcance: [
        { data: [{ id: ALC_SOURCE_ID, id_certificado: CERT_X_ID, deleted_at: null }], error: null },
        { data: [{ id: OWN_TARGET_ALC_ID, deleted_at: null }], error: null },
      ],
      alcance_certificado_compartido: [{ data: [], error: null }],
    },
    rpcHandler: async (fn) => {
      assert.equal(fn, 'fn_compartir_alcance_con_resolucion');
      return {
        data: null,
        error: {
          code: 'PGRST202',
          message: 'Could not find the function public.fn_compartir_alcance_con_resolucion',
        },
      };
    },
  });
  const fbBlockRes = await persistShareAlcance(fbBlockClient, {
    id_alcance: ALC_SOURCE_ID,
    targetCertIds: [CERT_Y_ID],
    replaceExisting: false,
  });
  assert.equal(fbBlockRes.ok, false);
  assert.match(fbBlockRes.error || '', /Confirme el reemplazo/i);

  // 4. Fallback with replaceExisting = true archives conflicting own & shared scopes and creates new share link
  const { client: fbReplaceClient, ops: fbReplaceOps } = createMockSupabase({
    selectQueue: {
      alcance: [
        { data: [{ id: ALC_SOURCE_ID, id_certificado: CERT_X_ID, deleted_at: null }], error: null },
        { data: [{ id: OWN_TARGET_ALC_ID, deleted_at: null }], error: null },
      ],
      alcance_certificado_compartido: [
        { data: [{ id: PREV_TARGET_SHARE_ID, id_alcance: '90000000-0000-4000-8000-000000000099', deleted_at: null }], error: null },
        { data: [], error: null },
      ],
    },
    insertQueue: {
      alcance_certificado_compartido: [{ data: [{ id: NEW_LINK_ID }], error: null }],
    },
    rpcHandler: async (fn) => {
      if (fn === 'fn_compartir_alcance_con_resolucion') {
        return { data: null, error: { code: 'PGRST202', message: 'Missing RPC' } };
      }
      return { data: null, error: null };
    },
  });
  const fbReplaceRes = await persistShareAlcance(fbReplaceClient, {
    id_alcance: ALC_SOURCE_ID,
    targetCertIds: [CERT_Y_ID],
    replaceExisting: true,
  });
  assert.equal(fbReplaceRes.ok, true);
  assert.equal(fbReplaceRes.data?.usedRpc, false);
  assert.equal(fbReplaceRes.data?.linkedCount, 1);
  assert.equal(fbReplaceRes.data?.replacedCount, 1);
  const archivedOps = fbReplaceOps.filter(
    (o) => o.kind === 'rpc' && o.tableOrFn === 'archive_record'
  );
  assert.equal(archivedOps.length, 2);

  // 5. Compensating rollback if 2nd target insert fails with 23505
  const { client: rollbackClient } = createMockSupabase({
    selectQueue: {
      alcance: [
        { data: [{ id: ALC_SOURCE_ID, id_certificado: CERT_X_ID, deleted_at: null }], error: null },
        { data: [], error: null },
        { data: [], error: null },
      ],
      alcance_certificado_compartido: [
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
      ],
    },
    insertQueue: {
      alcance_certificado_compartido: [
        { data: [{ id: NEW_LINK_ID }], error: null },
        { data: null, error: { code: '23505', message: 'duplicate key on alcance_certificado_compartido' } },
      ],
    },
  });
  const rollbackRes = await persistShareAlcance(rollbackClient, {
    id_alcance: ALC_SOURCE_ID,
    targetCertIds: [CERT_Y_ID, CERT_Z_ID],
    replaceExisting: false,
    preferRpc: false,
  });
  assert.equal(rollbackRes.ok, false);
  assert.deepEqual(rollbackRes.rolledBackLinkIds, [NEW_LINK_ID]);
  assert.equal(containsRawUuid(rollbackRes.error || ''), false);

  // 6. Unlink shared alcance: alreadyArchived vs active archive_record
  const { client: alreadyArchClient, ops: alreadyArchOps } = createMockSupabase({
    selectQueue: {
      alcance_certificado_compartido: [
        { data: [{ id: NEW_LINK_ID, deleted_at: '2026-06-01T00:00:00Z' }], error: null },
      ],
    },
  });
  const alreadyRes = await persistUnlinkSharedAlcance(alreadyArchClient, NEW_LINK_ID);
  assert.equal(alreadyRes.ok, true);
  assert.equal(alreadyRes.data?.alreadyArchived, true);
  assert.equal(
    alreadyArchOps.some((o) => o.kind === 'rpc'),
    false
  );

  const { client: unlinkClient, ops: unlinkOps } = createMockSupabase({
    selectQueue: {
      alcance_certificado_compartido: [
        { data: [{ id: NEW_LINK_ID, deleted_at: null }], error: null },
      ],
    },
  });
  const unlinkRes = await persistUnlinkSharedAlcance(unlinkClient, NEW_LINK_ID);
  assert.equal(unlinkRes.ok, true);
  assert.equal(
    unlinkOps.some(
      (o) =>
        o.kind === 'rpc' &&
        o.tableOrFn === 'archive_record' &&
        (o.payload as Record<string, unknown>).p_table === 'alcance_certificado_compartido'
    ),
    true
  );

  // 7. translateShareDbError Spanish Zero-UUID coverage for Alcance errors
  const tUniqueOwn = translateShareDbError({
    code: '23505',
    message: 'duplicate key value violates unique constraint "uq_alcance" on table "alcance"',
  });
  assert.match(tUniqueOwn, /Alcance propio activo/i);
  assert.equal(containsRawUuid(tUniqueOwn), false);

  const tUniqueShare = translateShareDbError({
    code: '23505',
    message: 'duplicate key value violates unique constraint "uq_alcance_cert_compartido"',
  });
  assert.match(tUniqueShare, /Alcance compartido activo/i);

  const tRls = translateShareDbError({
    code: '42501',
    message: `permission denied for table alcance ${CERT_X_ID}`,
  });
  assert.match(tRls, /Permisos insuficientes/i);
  assert.equal(containsRawUuid(tRls), false);
});

