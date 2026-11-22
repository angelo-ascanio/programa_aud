import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  assembleSharedCertificateCollections,
  persistShareContactos,
  persistShareProcesos,
  persistShareSitios,
  persistShareTurnos,
  persistUnlinkSharedChild,
  translateShareDbError,
  type ShareDbErrorLike,
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
  kind: 'select' | 'insert' | 'upsert' | 'update' | 'rpc';
  tableOrFn: string;
  payload?: unknown;
  filters?: Array<{ column: string; value: string | null }>;
}

interface MockBehavior {
  selectQueue?: Record<string, ShareQueryResponse[]>;
  insertQueue?: Record<string, ShareQueryResponse[]>;
  updateQueue?: Record<string, ShareQueryResponse[]>;
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
  assert.match(mainSrc, /onConflict:\s*'id_proceso,id_certificado,id_requisito'/);
});
