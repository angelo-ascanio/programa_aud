import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isDuplicateKeyDbError,
  isMissingColumnSchemaError,
  isOnConflictSpecError,
  persistRequisitosPorProcesoDelete,
  persistRequisitosPorProcesoInsert,
  type ProcesoReqDbErrorLike,
  type ProcesoReqQueryChain,
  type ProcesoReqSupabaseLike,
} from './procesoRequisitosPersistence';
import { renderProcesoView } from '../views/procesoView';
import { renderNoAplicableView } from '../views/noAplicableView';
import type { UserProfile } from './healthCheck';
import type { RequisitoLtree } from './extraDomain';
import type { CertificadoDetailEntity } from './multisiteSampling';

const PROC_ID = '53000000-0000-4000-8000-000000000001';
const CERT_A_ID = '40000000-0000-4000-8000-000000000001';
const CERT_B_ID = '40000000-0000-4000-8000-000000000002';
const VER_A_ID = '41000000-0000-4000-8000-000000000001';
const REQ_1_ID = '61000000-0000-4000-8000-000000000001';
const REQ_2_ID = '61000000-0000-4000-8000-000000000002';

interface RecordedReqOp {
  kind: 'upsert' | 'select' | 'insert' | 'delete';
  payload?: unknown;
  filters: Array<{ op: string; col: string; val: unknown }>;
}

function createMockReqSupabase(handlers: {
  onUpsert?: (
    payload: unknown,
    opts?: { onConflict?: string; ignoreDuplicates?: boolean }
  ) => { error: ProcesoReqDbErrorLike | null };
  onSelect?: (
    cols: string,
    filters: Array<{ op: string; col: string; val: unknown }>
  ) => { data?: unknown; error: ProcesoReqDbErrorLike | null };
  onInsert?: (payload: unknown) => { error: ProcesoReqDbErrorLike | null };
  onDelete?: (
    filters: Array<{ op: string; col: string; val: unknown }>
  ) => { error: ProcesoReqDbErrorLike | null };
}): { client: ProcesoReqSupabaseLike; ops: RecordedReqOp[] } {
  const ops: RecordedReqOp[] = [];

  const client: ProcesoReqSupabaseLike = {
    from(): ProcesoReqQueryChain {
      const makeBuilder = (
        initMode: 'select' | 'delete',
        initSelectCols = '*'
      ): ProcesoReqQueryChain => {
        const filters: Array<{ op: string; col: string; val: unknown }> = [];

        const runQuery = (): { data?: unknown; error: ProcesoReqDbErrorLike | null } => {
          if (initMode === 'delete') {
            ops.push({ kind: 'delete', filters: [...filters] });
            return handlers.onDelete ? handlers.onDelete(filters) : { error: null };
          }
          ops.push({ kind: 'select', payload: initSelectCols, filters: [...filters] });
          return handlers.onSelect
            ? handlers.onSelect(initSelectCols, filters)
            : { data: [], error: null };
        };

        const chain: ProcesoReqQueryChain = {
          select(cols: string) {
            return makeBuilder('select', cols);
          },
          async insert(payload: unknown) {
            ops.push({ kind: 'insert', payload, filters: [] });
            return handlers.onInsert ? handlers.onInsert(payload) : { error: null };
          },
          async upsert(
            payload: unknown,
            opts?: { onConflict?: string; ignoreDuplicates?: boolean }
          ) {
            ops.push({ kind: 'upsert', payload, filters: [] });
            return handlers.onUpsert ? handlers.onUpsert(payload, opts) : { error: null };
          },
          delete() {
            return makeBuilder('delete');
          },
          eq(col: string, val: unknown) {
            filters.push({ op: 'eq', col, val });
            return chain;
          },
          in(col: string, vals: ReadonlyArray<unknown>) {
            filters.push({ op: 'in', col, val: vals });
            return chain;
          },
          is(col: string, val: unknown) {
            filters.push({ op: 'is', col, val });
            return chain;
          },
          or(expr: string) {
            filters.push({ op: 'or', col: 'or', val: expr });
            return chain;
          },
          async match(criteria: Record<string, unknown>) {
            for (const [col, val] of Object.entries(criteria)) {
              filters.push({ op: 'eq', col, val });
            }
            return runQuery();
          },
          then<
            TResult1 = { data?: unknown; error: ProcesoReqDbErrorLike | null },
            TResult2 = never,
          >(
            onfulfilled?:
              | ((value: {
                  data?: unknown;
                  error: ProcesoReqDbErrorLike | null;
                }) => TResult1 | PromiseLike<TResult1>)
              | null,
            onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
          ) {
            return Promise.resolve(runQuery()).then(onfulfilled, onrejected);
          },
        };

        return chain;
      };

      return makeBuilder('select');
    },
  };

  return { client, ops };
}

test('isOnConflictSpecError / isMissingColumnSchemaError / isDuplicateKeyDbError classify DB error codes', () => {
  assert.equal(
    isOnConflictSpecError({
      code: '42P10',
      message: 'there is no unique or exclusion constraint matching the ON CONFLICT specification',
    }),
    true
  );
  assert.equal(
    isMissingColumnSchemaError(
      { code: '42703', message: 'column "id_certificado_version" does not exist' },
      'id_certificado_version'
    ),
    true
  );
  assert.equal(
    isDuplicateKeyDbError({
      code: '23505',
      message: 'duplicate key value violates unique constraint',
    }),
    true
  );
});

test('persistRequisitosPorProcesoInsert falls back cleanly on PostgreSQL 42P10 and inserts only missing rows', async () => {
  const { client, ops } = createMockReqSupabase({
    onUpsert: () => ({
      error: {
        code: '42P10',
        message: 'there is no unique or exclusion constraint matching the ON CONFLICT specification',
      },
    }),
    onSelect: () => ({
      data: [
        {
          id_proceso: PROC_ID,
          id_certificado: CERT_A_ID,
          id_certificado_version: VER_A_ID,
          id_requisito: REQ_1_ID,
        },
      ],
      error: null,
    }),
    onInsert: () => ({ error: null }),
  });

  const res = await persistRequisitosPorProcesoInsert(client, [
    {
      id_proceso: PROC_ID,
      id_certificado: CERT_A_ID,
      id_certificado_version: VER_A_ID,
      id_requisito: REQ_1_ID,
    },
    {
      id_proceso: PROC_ID,
      id_certificado: CERT_A_ID,
      id_certificado_version: VER_A_ID,
      id_requisito: REQ_2_ID,
    },
  ]);

  assert.equal(res.error, null);
  assert.equal(res.insertedCount, 1);

  const insertOp = ops.find((o) => o.kind === 'insert');
  assert.ok(insertOp);
  assert.deepEqual(insertOp.payload, {
    id_proceso: PROC_ID,
    id_certificado: CERT_A_ID,
    id_certificado_version: VER_A_ID,
    id_requisito: REQ_2_ID,
  });
});

test('persistRequisitosPorProcesoInsert retries without id_certificado_version when column is absent (PGRST204)', async () => {
  const insertPayloads: Array<Record<string, unknown>> = [];
  const { client } = createMockReqSupabase({
    onUpsert: () => ({
      error: {
        code: 'PGRST204',
        message: "Could not find the 'id_certificado_version' column of 'requisitos_por_proceso' in the schema cache",
      },
    }),
    onSelect: (cols) => {
      if (cols.includes('id_certificado_version')) {
        return {
          error: {
            code: '42703',
            message: 'column "id_certificado_version" does not exist',
          },
        };
      }
      return { data: [], error: null };
    },
    onInsert: (payload) => {
      insertPayloads.push(payload as Record<string, unknown>);
      return { error: null };
    },
  });

  const res = await persistRequisitosPorProcesoInsert(client, [
    {
      id_proceso: PROC_ID,
      id_certificado: CERT_A_ID,
      id_certificado_version: VER_A_ID,
      id_requisito: REQ_1_ID,
    },
  ]);

  assert.equal(res.error, null);
  assert.equal(res.insertedCount, 1);
  assert.deepEqual(insertPayloads, [
    {
      id_proceso: PROC_ID,
      id_certificado: CERT_A_ID,
      id_requisito: REQ_1_ID,
    },
  ]);
});

test('persistRequisitosPorProcesoInsert never swallows ISO 4.3 P0001 or RLS 42501 errors', async () => {
  const { client: isoClient } = createMockReqSupabase({
    onUpsert: () => ({
      error: {
        code: 'P0001',
        message: 'REQ_EXCLUDED_BY_ISO43: La cláusula 4.1 está excluida como No Aplicable.',
      },
    }),
  });
  const isoRes = await persistRequisitosPorProcesoInsert(isoClient, [
    {
      id_proceso: PROC_ID,
      id_certificado: CERT_A_ID,
      id_certificado_version: VER_A_ID,
      id_requisito: REQ_1_ID,
    },
  ]);
  assert.equal(isoRes.error?.code, 'P0001');

  const { client: rlsClient } = createMockReqSupabase({
    onUpsert: () => ({
      error: { code: '42P10', message: 'ON CONFLICT error' },
    }),
    onInsert: () => ({
      error: { code: '42501', message: 'new row violates row-level security policy' },
    }),
  });
  const rlsRes = await persistRequisitosPorProcesoInsert(rlsClient, [
    {
      id_proceso: PROC_ID,
      id_certificado: CERT_A_ID,
      id_certificado_version: VER_A_ID,
      id_requisito: REQ_1_ID,
    },
  ]);
  assert.equal(rlsRes.error?.code, '42501');
});

test('persistRequisitosPorProcesoInsert handles 23505 idempotently on same cert but surfaces cross-cert 2-col PK conflict', async () => {
  const { client: sameCertClient } = createMockReqSupabase({
    onUpsert: () => ({ error: { code: '42P10', message: 'ON CONFLICT' } }),
    onSelect: (() => {
      let calls = 0;
      return () => {
        calls += 1;
        if (calls === 1) return { data: [], error: null };
        return {
          data: [
            {
              id_proceso: PROC_ID,
              id_certificado: CERT_A_ID,
              id_certificado_version: VER_A_ID,
              id_requisito: REQ_1_ID,
            },
          ],
          error: null,
        };
      };
    })(),
    onInsert: () => ({ error: { code: '23505', message: 'duplicate key value' } }),
  });

  const sameRes = await persistRequisitosPorProcesoInsert(sameCertClient, [
    {
      id_proceso: PROC_ID,
      id_certificado: CERT_A_ID,
      id_certificado_version: VER_A_ID,
      id_requisito: REQ_1_ID,
    },
  ]);
  assert.equal(sameRes.error, null);

  const { client: crossCertClient } = createMockReqSupabase({
    onUpsert: () => ({ error: { code: '42P10', message: 'ON CONFLICT' } }),
    onSelect: (() => {
      let calls = 0;
      return () => {
        calls += 1;
        if (calls === 1) return { data: [], error: null };
        return {
          data: [
            {
              id_proceso: PROC_ID,
              id_certificado: CERT_A_ID,
              id_certificado_version: VER_A_ID,
              id_requisito: REQ_1_ID,
            },
          ],
          error: null,
        };
      };
    })(),
    onInsert: () => ({ error: { code: '23505', message: 'duplicate key value' } }),
  });

  const crossRes = await persistRequisitosPorProcesoInsert(crossCertClient, [
    {
      id_proceso: PROC_ID,
      id_certificado: CERT_B_ID,
      id_certificado_version: '41000000-0000-4000-8000-000000000099',
      id_requisito: REQ_1_ID,
    },
  ]);
  assert.equal(crossRes.error?.code, '23505');
  assert.match(String(crossRes.error?.message || ''), /01_creacion\.sql/);
});

test('persistRequisitosPorProcesoDelete cleans versioned and nullable legacy rows and falls back without id_certificado_version', async () => {
  const deleteCalls: Array<Array<{ op: string; col: string; val: unknown }>> = [];
  const { client } = createMockReqSupabase({
    onDelete: (filters) => {
      deleteCalls.push(filters);
      const hasVersionEq = filters.some(
        (f) => f.op === 'eq' && f.col === 'id_certificado_version'
      );
      if (hasVersionEq) {
        return {
          error: {
            code: '42703',
            message: 'column "id_certificado_version" does not exist',
          },
        };
      }
      return { error: null };
    },
  });

  const res = await persistRequisitosPorProcesoDelete(client, {
    id_proceso: PROC_ID,
    id_certificado: CERT_A_ID,
    id_certificado_version: VER_A_ID,
    requisitoIds: [REQ_1_ID],
  });

  assert.equal(res.error, null);
  assert.equal(deleteCalls.length, 2);
  assert.equal(
    deleteCalls[1].some((f) => f.col === 'id_certificado_version'),
    false
  );
});

test('Picker typography and Zone 1/2/3 layout parity between procesoView and noAplicableView', () => {
  const ADMIN_PROFILE: UserProfile = {
    id: 'user-admin',
    email: 'admin@fondonorma.test',
    role: 'ADMIN',
    status: 'APPROVED',
    full_name: 'Admin Fondonorma',
    created_at: '2026-01-01T00:00:00Z',
  };

  const catalog: RequisitoLtree[] = [
    {
      id: '90000000-0000-4000-8000-000000000004',
      id_norma: '10000000-0000-4000-8000-000000000001',
      norma_codigo: 'ISO 45001:2018',
      norma_titulo: 'SST',
      codigo: '4',
      titulo: 'Contexto de la organización',
      descripcion: 'Contexto general',
      ruta_materializada: '4',
      nivel: 1,
      es_padre: true,
      es_obligatorio: false,
      translations: {
        es: { title: 'Contexto de la organización', content_html: '<p>Contexto general</p>' },
      },
    },
    {
      id: '90000000-0000-4000-8000-000000000041',
      id_norma: '10000000-0000-4000-8000-000000000001',
      id_requisito_padre: '90000000-0000-4000-8000-000000000004',
      norma_codigo: 'ISO 45001:2018',
      norma_titulo: 'SST',
      codigo: '4.1',
      titulo: 'Comprensión de la organización y de su contexto',
      descripcion: 'La organización debe determinar las cuestiones externas e internas pertinentes.',
      ruta_materializada: '4.1',
      nivel: 2,
      es_padre: false,
      es_obligatorio: true,
      translations: {
        es: {
          title: 'Comprensión de la organización y de su contexto',
          content_html: '<p>La organización debe determinar las cuestiones externas e internas pertinentes.</p>',
        },
      },
    },
    {
      id: '90000000-0000-4000-8000-000000000044',
      id_norma: '10000000-0000-4000-8000-000000000001',
      id_requisito_padre: '90000000-0000-4000-8000-000000000004',
      norma_codigo: 'ISO 45001:2018',
      norma_titulo: 'SST',
      codigo: '4.4',
      titulo: '',
      descripcion: 'La organización debe establecer un sistema de gestión de la SST.',
      ruta_materializada: '4.4',
      nivel: 2,
      es_padre: false,
      es_obligatorio: true,
      translations: {
        es: {
          title: '',
          content_html: '<p>La organización debe establecer un sistema de gestión de la SST.</p>',
        },
      },
    },
  ];

  const cert: CertificadoDetailEntity = {
    id: CERT_A_ID,
    numero_certificado: '45001-41-03-10-2020',
    id_organizacion: '20000000-0000-4000-8000-000000000001',
    organizacion_nombre: 'Nestlé Cadipro',
    organizacion_rif: 'J-00000000-1',
    id_norma: '10000000-0000-4000-8000-000000000001',
    norma_codigo: 'ISO 45001:2018',
    norma_titulo: 'SST',
    estatus: 'ACTIVO',
    fecha_emision: '2020-10-03',
    fecha_vencimiento: '2026-10-03',
    sector_iaf: '03',
    alcance_descripcion: 'Producción láctea',
    sitios: [],
    turnos: [],
    contactos: [],
    procesos: [
      {
        id: PROC_ID,
        id_certificado: CERT_A_ID,
        nombre_proceso: 'Dirección',
        tipo: 'Estratégico',
        responsable: 'Gerencia General',
        clausulas_cubiertas: [],
        requisitos_detalle: [],
      },
    ],
    auditorias: [],
    noAplicables: [],
  };

  const procHtml = renderProcesoView({
    profile: ADMIN_PROFILE,
    state: {
      selectedProcesoId: PROC_ID,
      activeChildTab: 'requisitos',
      isAssigningRequisito: true,
      batchMode: 'all',
      batchFilterQuery: '',
      selectedBatchRequisitoIds: [],
    },
    proceso: {
      id: PROC_ID,
      id_certificado: CERT_A_ID,
      numero_certificado: cert.numero_certificado,
      certificado_estatus: 'ACTIVO',
      id_norma: cert.id_norma,
      norma_codigo: cert.norma_codigo,
      norma_titulo: cert.norma_titulo,
      id_organizacion: cert.id_organizacion,
      organizacion_nombre: cert.organizacion_nombre,
      organizacion_rif: cert.organizacion_rif,
      nombre_proceso: 'Dirección',
      tipo: 'Estratégico',
      responsable: 'Gerencia General',
      deleted_at: null,
      requisitos: [],
      hallazgos: [],
      auditorias: [],
    },
    certificates: [cert],
    requirementsCatalog: catalog,
  });

  // Code + title share primary styling with colon and spacing; title-less code uses primary styling without colon
  assert.ok(
    procHtml.includes(
      '<span class="font-bold text-slate-900"><span class="font-mono mr-2">4.1</span> Comprensión de la organización y de su contexto:</span>'
    )
  );
  assert.ok(
    procHtml.includes('<span class="font-mono font-bold text-slate-900 mr-2">4.4</span>')
  );
  assert.equal(procHtml.includes('4.4</span>:'), false);
  assert.ok(procHtml.includes('data-ancestor-ids='));

  const naHtml = renderNoAplicableView({
    profile: ADMIN_PROFILE,
    state: {
      selectedNoAplicableId: null,
      originatingCertId: CERT_A_ID,
      isCreating: true,
      isEditingAttributes: false,
      formDraft: {
        id_certificado: CERT_A_ID,
        id_requisito: '',
        justificacion: '',
      },
      clauseMode: 'all',
      clauseFilterQuery: '',
    },
    noAplicable: null,
    certificates: [cert],
    requirementsCatalog: catalog,
  });

  const formMatch = naHtml.match(/<form id="noAplicableDetailForm"[\s\S]*?<\/form>/);
  assert.ok(formMatch);
  assert.equal(
    formMatch[0].includes('<button'),
    false,
    '#noAplicableDetailForm must contain zero <button> tags'
  );
  assert.ok(naHtml.includes('id="naClausePickerPanel"'));
  assert.ok(naHtml.includes('id="naBatchStickySummaryBar"'));
  assert.ok(naHtml.includes('data-action="cancel-no-aplicable-footer"'));
  assert.ok(naHtml.includes('data-ancestor-ids='));
  assert.ok(
    naHtml.includes(
      '<span class="font-bold text-slate-900"><span class="font-mono">4.1</span> Comprensión de la organización y de su contexto:</span>'
    )
  );
  assert.equal(naHtml.includes('4.4</span>:'), false);
});
