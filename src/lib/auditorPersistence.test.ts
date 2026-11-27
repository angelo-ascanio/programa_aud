import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  addEmailAuditor,
  addEvaluacionInSituAuditor,
  addTelefonoAuditor,
  assembleAuditorEntitiesFromRows,
  deleteEmailAuditor,
  deleteEvaluacionInSituAuditor,
  deleteTelefonoAuditor,
  hydrateAuditoresFromSupabase,
  saveAuditorProfile,
  setPrimaryEmailAuditor,
  setPrimaryTelefonoAuditor,
  translateAuditorPersistenceError,
  updateEvaluacionInSituAuditor,
  type AuditorDbErrorLike,
  type AuditorDeleteBuilder,
  type AuditorInsertBuilder,
  type AuditorMutationBuilder,
  type AuditorQueryResponse,
  type AuditorSelectBuilder,
  type AuditorSingleResponse,
  type AuditorSupabaseClient,
  type AuditorTableClient,
  type AuditorUpdateBuilder,
} from './auditorPersistence';
import {
  mergeAuditorsIntoActorDirectory,
  resolveAuditActorDisplay,
  SEEDED_ACTOR_DIRECTORY,
} from './auditLog';
import { assertZeroUuidExposure } from './zeroUuid';
import type { UserProfile } from './healthCheck';

const ADMIN_PROFILE: UserProfile = {
  id: '11111111-1111-1111-1111-111111111111',
  nombre: 'Administrador Principal',
  role: 'ADMIN',
  status: 'APPROVED',
};

const AUDITOR_PROFILE: UserProfile = {
  id: '33333333-3333-3333-3333-333333333333',
  nombre: 'Auditor Técnico Evaluador',
  role: 'AUDITOR',
  status: 'APPROVED',
};

interface MockCall {
  table: string;
  op: 'select' | 'insert' | 'update' | 'delete';
  payload?: unknown;
  filters: Array<{ method: string; args: unknown[] }>;
}

interface MockRule {
  table: string;
  op?: 'select' | 'insert' | 'update' | 'delete';
  response: AuditorQueryResponse;
}

function createMockAuditorClient(rules: MockRule[]): {
  client: AuditorSupabaseClient;
  calls: MockCall[];
} {
  const calls: MockCall[] = [];

  const resolveResponse = (
    table: string,
    op: 'select' | 'insert' | 'update' | 'delete'
  ): AuditorQueryResponse => {
    const exact = rules.find((r) => r.table === table && r.op === op);
    if (exact) return exact.response;
    const wildcard = rules.find((r) => r.table === table && !r.op);
    if (wildcard) return wildcard.response;
    return { data: [], error: null };
  };

  const client: AuditorSupabaseClient = {
    from(table: string): AuditorTableClient {
      const makeMutationBuilder = (
        callRecord: MockCall
      ): AuditorMutationBuilder => {
        const res = resolveResponse(table, callRecord.op);
        const firstRow =
          Array.isArray(res.data) && res.data.length > 0 ? res.data[0] : null;
        const singleRes: AuditorSingleResponse = {
          data: firstRow,
          error: res.error,
        };
        return {
          single() {
            return Promise.resolve(singleRes);
          },
          maybeSingle() {
            return Promise.resolve(singleRes);
          },
          then(onfulfilled, onrejected) {
            return Promise.resolve(res).then(onfulfilled, onrejected);
          },
        };
      };

      return {
        select(columns: string): AuditorSelectBuilder {
          const callRecord: MockCall = {
            table,
            op: 'select',
            payload: columns,
            filters: [],
          };
          calls.push(callRecord);
          const builder: AuditorSelectBuilder = {
            eq(col, val) {
              callRecord.filters.push({ method: 'eq', args: [col, val] });
              return builder;
            },
            is(col, val) {
              callRecord.filters.push({ method: 'is', args: [col, val] });
              return builder;
            },
            order(col, opts) {
              callRecord.filters.push({ method: 'order', args: [col, opts] });
              return builder;
            },
            limit(count) {
              callRecord.filters.push({ method: 'limit', args: [count] });
              return builder;
            },
            single() {
              return makeMutationBuilder(callRecord).single();
            },
            maybeSingle() {
              return makeMutationBuilder(callRecord).maybeSingle();
            },
            then(onfulfilled, onrejected) {
              return makeMutationBuilder(callRecord).then(onfulfilled, onrejected);
            },
          };
          return builder;
        },
        insert(values): AuditorInsertBuilder {
          const callRecord: MockCall = {
            table,
            op: 'insert',
            payload: values,
            filters: [],
          };
          calls.push(callRecord);
          const mut = makeMutationBuilder(callRecord);
          return {
            select() {
              return mut;
            },
            then(onfulfilled, onrejected) {
              return mut.then(onfulfilled, onrejected);
            },
          };
        },
        update(values): AuditorUpdateBuilder {
          const callRecord: MockCall = {
            table,
            op: 'update',
            payload: values,
            filters: [],
          };
          calls.push(callRecord);
          const mut = makeMutationBuilder(callRecord);
          const builder: AuditorUpdateBuilder = {
            eq(col, val) {
              callRecord.filters.push({ method: 'eq', args: [col, val] });
              return builder;
            },
            is(col, val) {
              callRecord.filters.push({ method: 'is', args: [col, val] });
              return builder;
            },
            select() {
              return mut;
            },
            then(onfulfilled, onrejected) {
              return mut.then(onfulfilled, onrejected);
            },
          };
          return builder;
        },
        delete(): AuditorDeleteBuilder {
          const callRecord: MockCall = {
            table,
            op: 'delete',
            filters: [],
          };
          calls.push(callRecord);
          const mut = makeMutationBuilder(callRecord);
          const builder: AuditorDeleteBuilder = {
            eq(col, val) {
              callRecord.filters.push({ method: 'eq', args: [col, val] });
              return builder;
            },
            match(query) {
              callRecord.filters.push({ method: 'match', args: [query] });
              return builder;
            },
            then(onfulfilled, onrejected) {
              return mut.then(onfulfilled, onrejected);
            },
          };
          return builder;
        },
      };
    },
  };

  return { client, calls };
}

describe('Paso 2.1 - auditorPersistence.ts & Actor Directory Integration', () => {
  it('assembles full auditor entities with child telefonos, emails, evaluaciones_in_situ, and M:N links', () => {
    const audId = '10000000-0000-0000-0000-000000000005';
    const assembled = assembleAuditorEntitiesFromRows({
      auditorRows: [
        {
          id: audId,
          nombre: 'Nordy Armando Fuentes',
          siglas: 'NF',
          cedula_identidad: '5884819',
          profesion: 'INGENIERO INDUSTRIAL',
          esquemas_complementarios: 'MARCA',
          anio_actualizacion_normas: 2023,
          sistema_gestion_secundario: '',
          ultima_evaluacion_in_situ_texto: '01/08/2022',
          proxima_evaluacion_in_situ_texto: '01/08/2025',
          ultima_evaluacion_in_situ_fecha: '2022-08-01',
          proxima_evaluacion_in_situ_fecha: '2025-08-01',
          sin_registro_evaluacion: false,
          sector_area_evaluado_texto: '7 / 7.1',
          observaciones_evaluacion: 'SECTOR 4, 5 Y 38 CON EXP TÉCNICO',
          anio_actualizacion_sectores: 2024,
          observacion_sectores: 'SECTOR 4, 5 y 38 CON EXP TECNICO',
          deleted_at: null,
        },
      ],
      telefonoRows: [
        {
          id: '1a100000-0000-0000-0000-000000000006',
          id_auditor: audId,
          telefono: '02123698762',
          tipo_telefono: 'Oficina',
          es_principal: false,
          deleted_at: null,
        },
        {
          id: '1a100000-0000-0000-0000-000000000005',
          id_auditor: audId,
          telefono: '04126018407',
          tipo_telefono: 'Móvil',
          es_principal: true,
          deleted_at: null,
        },
      ],
      emailRows: [
        {
          id: '1a200000-0000-0000-0000-000000000005',
          id_auditor: audId,
          email: 'nordyfuentes@gmail.com',
          tipo_email: 'Principal',
          es_principal: true,
          deleted_at: null,
        },
      ],
      evaluacionRows: [
        {
          id: '1a300000-0000-0000-0000-000000000006',
          id_auditor: audId,
          etiqueta_periodo: 'Evaluación Principal',
          sector_area_evaluado: '7 / 7.1',
          ultima_evaluacion_fecha: '2022-08-01',
          proxima_evaluacion_fecha: '2025-08-01',
          deleted_at: null,
        },
      ],
      normaLinkRows: [
        {
          id_auditor: audId,
          id_norma: 'e0000000-0000-0000-0000-000000009001',
          norma: { id: 'e0000000-0000-0000-0000-000000009001', codigo: 'ISO 9001:2015' },
        },
      ],
      sectorLinkRows: [
        {
          id_auditor: audId,
          id_sector_iaf: 'd0000000-0000-0000-0000-000000000007',
          sector: { id: 'd0000000-0000-0000-0000-000000000007', sector: 7 },
        },
      ],
    });

    assert.equal(assembled.length, 1);
    const nf = assembled[0];
    assert.equal(nf.siglas, 'NF');
    assert.equal(nf.cedula_identidad, '5884819');
    assert.equal(nf.esquemas_complementarios, 'MARCA');
    assert.equal(nf.telefono, '04126018407');
    assert.equal(nf.telefonos.length, 2);
    assert.equal(nf.email, 'nordyfuentes@gmail.com');
    assert.equal(nf.evaluaciones_in_situ.length, 1);
    assert.deepEqual(nf.normas_acreditadas, ['ISO 9001:2015']);
    assert.deepEqual(nf.sectores_iaf, [7]);
  });

  it('hydrates auditors from Supabase cleanly and handles partial child failures gracefully', async () => {
    const audId = '10000000-0000-0000-0000-000000000001';
    const { client } = createMockAuditorClient([
      {
        table: 'auditor',
        op: 'select',
        response: {
          data: [
            {
              id: audId,
              nombre: 'Keyla Cristina Soteldo de Páez',
              siglas: 'KS',
              cedula_identidad: '4165827',
              profesion: 'INGENIERO METALÚRGICO',
              deleted_at: null,
            },
          ],
          error: null,
        },
      },
      {
        table: 'telefono_auditor',
        op: 'select',
        response: {
          data: null,
          error: { code: 'PGRST205', message: 'table missing' },
        },
      },
    ]);

    const res = await hydrateAuditoresFromSupabase(client);
    assert.equal(res.ok, true);
    assert.equal(res.data?.length, 1);
    assert.equal(res.data?.[0].siglas, 'KS');
    assert.deepEqual(res.data?.[0].telefonos, []);
  });

  it('falls back to legacy auditor columns (id, nombre) when extended Paso 1.1 columns are not yet in schema cache', async () => {
    const audId = '10000000-0000-0000-0000-000000000009';
    let selectCount = 0;
    const { client: baseClient } = createMockAuditorClient([
      {
        table: 'telefono_auditor',
        op: 'select',
        response: { data: null, error: { code: 'PGRST205', message: 'table missing' } },
      },
      {
        table: 'email_auditor',
        op: 'select',
        response: { data: null, error: { code: 'PGRST205', message: 'table missing' } },
      },
      {
        table: 'evaluacion_in_situ_auditor',
        op: 'select',
        response: { data: null, error: { code: 'PGRST205', message: 'table missing' } },
      },
      {
        table: 'norma_auditor',
        op: 'select',
        response: {
          data: [
            {
              id_auditor: audId,
              id_norma: 'e0000000-0000-0000-0000-000000009001',
              norma: { id: 'e0000000-0000-0000-0000-000000009001', codigo: 'ISO 9001:2015' },
            },
          ],
          error: null,
        },
      },
    ]);

    const fallbackClient: AuditorSupabaseClient = {
      from(table: string): AuditorTableClient {
        if (table !== 'auditor') return baseClient.from(table);
        const delegate = baseClient.from(table);
        return {
          ...delegate,
          select(columns: string): AuditorSelectBuilder {
            selectCount += 1;
            const isExtended = columns.includes('siglas');
            const mockRes: AuditorQueryResponse = isExtended
              ? {
                  data: null,
                  error: {
                    code: '42703',
                    message: 'column auditor.siglas does not exist',
                  },
                }
              : {
                  data: [
                    {
                      id: audId,
                      nombre: 'Auditor Legacy En Base Remota',
                      deleted_at: null,
                    },
                  ],
                  error: null,
                };
            const builder: AuditorSelectBuilder = {
              eq() {
                return builder;
              },
              is() {
                return builder;
              },
              order() {
                return builder;
              },
              limit() {
                return builder;
              },
              single() {
                return Promise.resolve({
                  data: mockRes.data?.[0] || null,
                  error: mockRes.error,
                });
              },
              maybeSingle() {
                return Promise.resolve({
                  data: mockRes.data?.[0] || null,
                  error: mockRes.error,
                });
              },
              then(onfulfilled, onrejected) {
                return Promise.resolve(mockRes).then(onfulfilled, onrejected);
              },
            };
            return builder;
          },
        };
      },
    };

    const res = await hydrateAuditoresFromSupabase(fallbackClient);
    assert.equal(selectCount, 2);
    assert.equal(res.ok, true);
    assert.equal(res.data?.length, 1);
    assert.equal(res.data?.[0].nombre, 'Auditor Legacy En Base Remota');
    assert.deepEqual(res.data?.[0].normas_acreditadas, ['ISO 9001:2015']);
  });

  it('saves auditor profile (insert + update), enforces RBAC, translates PostgreSQL constraints and preserves Zero-UUID', async () => {
    const newId = '10000000-0000-0000-0000-000000000099';
    const forbidden = await saveAuditorProfile(
      createMockAuditorClient([]).client,
      {
        profile: AUDITOR_PROFILE,
        draft: { nombre: 'Bloqueado', siglas: 'BL', cedula_identidad: '1234567' },
        existingAuditors: [],
      }
    );
    assert.equal(forbidden.ok, false);
    assert.ok(forbidden.error?.includes('Acceso denegado'));

    const { client: okClient, calls: okCalls } = createMockAuditorClient([
      {
        table: 'auditor',
        op: 'insert',
        response: {
          data: [
            {
              id: newId,
              nombre: 'Yurima Carrillo',
              siglas: 'YC',
              cedula_identidad: '12310919',
              sin_registro_evaluacion: true,
              deleted_at: null,
            },
          ],
          error: null,
        },
      },
    ]);

    const insertRes = await saveAuditorProfile(okClient, {
      profile: ADMIN_PROFILE,
      draft: {
        nombre: 'Yurima Carrillo',
        siglas: 'yc',
        cedula_identidad: '12310919',
        sin_registro_evaluacion: true,
      },
      existingAuditors: [
        {
          id: '10000000-0000-0000-0000-000000000010',
          nombre: 'Yurima Carrillo',
          cedula_identidad: '7137643',
          deleted_at: null,
        },
      ],
      newId,
    });
    assert.equal(insertRes.ok, true);
    assert.equal(insertRes.data?.siglas, 'YC');
    assert.equal(okCalls[0].op, 'insert');

    const { client: dupClient } = createMockAuditorClient([
      {
        table: 'auditor',
        op: 'insert',
        response: {
          data: null,
          error: {
            code: '23505',
            message:
              'duplicate key value violates unique constraint "uq_auditor_cedula_active" for 10000000-0000-0000-0000-000000000001',
          },
        },
      },
    ]);

    const dupRes = await saveAuditorProfile(dupClient, {
      profile: ADMIN_PROFILE,
      draft: {
        nombre: 'Duplicado DB',
        siglas: 'DB',
        cedula_identidad: '99887766',
      },
      existingAuditors: [],
      newId,
    });
    assert.equal(dupRes.ok, false);
    assert.equal(dupRes.error, 'Ya existe un auditor activo con esa cédula de identidad.');
    assert.equal(assertZeroUuidExposure(dupRes.error || '').compliant, true);

    const errWithUuid: AuditorDbErrorLike = {
      code: 'P0001',
      message:
        'Conflicto de integridad en el registro 10000000-0000-0000-0000-000000000001.',
    };
    const translated = translateAuditorPersistenceError(errWithUuid);
    assert.equal(assertZeroUuidExposure(translated).compliant, true);
  });

  it('handles phone and email CRUD (add, soft-delete without delete_reason, setPrimary)', async () => {
    const audId = '10000000-0000-0000-0000-000000000001';
    const telId = '1a100000-0000-0000-0000-000000000099';
    const emailId = '1a200000-0000-0000-0000-000000000099';

    const { client, calls } = createMockAuditorClient([
      {
        table: 'telefono_auditor',
        op: 'insert',
        response: {
          data: [
            {
              id: telId,
              id_auditor: audId,
              telefono: '04141234567',
              tipo_telefono: 'Móvil',
              es_principal: true,
            },
          ],
          error: null,
        },
      },
      {
        table: 'email_auditor',
        op: 'insert',
        response: {
          data: [
            {
              id: emailId,
              id_auditor: audId,
              email: 'auditor.real@fondonorma.org',
              tipo_email: 'Principal',
              es_principal: true,
            },
          ],
          error: null,
        },
      },
    ]);

    const addTel = await addTelefonoAuditor({
      client,
      profile: ADMIN_PROFILE,
      auditorId: audId,
      draft: { telefono: '04141234567', tipo_telefono: 'Móvil', es_principal: true },
      newId: telId,
    });
    assert.equal(addTel.ok, true);
    assert.equal(addTel.data?.es_principal, true);

    const delTel = await deleteTelefonoAuditor({
      client,
      profile: ADMIN_PROFILE,
      telefonoId: telId,
    });
    assert.equal(delTel.ok, true);
    const delTelPayload = calls.find(
      (c) => c.table === 'telefono_auditor' && c.op === 'update' && c.filters.some((f) => f.args[0] === 'id')
    )?.payload as Record<string, unknown>;
    assert.equal('delete_reason' in delTelPayload, false);

    const setTelPrimary = await setPrimaryTelefonoAuditor({
      client,
      profile: ADMIN_PROFILE,
      auditorId: audId,
      telefonoId: telId,
    });
    assert.equal(setTelPrimary.ok, true);

    const addEmail = await addEmailAuditor({
      client,
      profile: ADMIN_PROFILE,
      auditorId: audId,
      draft: { email: 'auditor.real@fondonorma.org', tipo_email: 'Principal', es_principal: true },
      newId: emailId,
    });
    assert.equal(addEmail.ok, true);

    const delEmail = await deleteEmailAuditor({
      client,
      profile: ADMIN_PROFILE,
      emailId,
    });
    assert.equal(delEmail.ok, true);

    const setEmailPrimary = await setPrimaryEmailAuditor({
      client,
      profile: ADMIN_PROFILE,
      auditorId: audId,
      emailId,
    });
    assert.equal(setEmailPrimary.ok, true);
  });

  it('recalculates summary columns on public.auditor when adding, updating, and soft-deleting evaluacion_in_situ_auditor', async () => {
    const audId = '10000000-0000-0000-0000-000000000002';
    const evalId = '1a300000-0000-0000-0000-000000000099';

    const { client: addClient, calls: addCalls } = createMockAuditorClient([
      {
        table: 'evaluacion_in_situ_auditor',
        op: 'insert',
        response: {
          data: [
            {
              id: evalId,
              id_auditor: audId,
              etiqueta_periodo: 'Evaluación 2025',
              ultima_evaluacion_fecha: '2025-03-10',
              proxima_evaluacion_fecha: '2028-03-10',
              deleted_at: null,
            },
          ],
          error: null,
        },
      },
      {
        table: 'evaluacion_in_situ_auditor',
        op: 'select',
        response: {
          data: [
            {
              id: '1a300000-0000-0000-0000-000000000002',
              id_auditor: audId,
              ultima_evaluacion_fecha: '2015-05-01',
              proxima_evaluacion_fecha: '2018-05-01',
              deleted_at: null,
            },
            {
              id: evalId,
              id_auditor: audId,
              ultima_evaluacion_fecha: '2025-03-10',
              proxima_evaluacion_fecha: '2028-03-10',
              deleted_at: null,
            },
          ],
          error: null,
        },
      },
    ]);

    const addRes = await addEvaluacionInSituAuditor({
      client: addClient,
      profile: ADMIN_PROFILE,
      auditorId: audId,
      draft: {
        etiqueta_periodo: 'Evaluación 2025',
        norma_referencia: 'ISO 9001:2015',
        sector_area_evaluado: '4',
        ultima_evaluacion_fecha: '2025-03-10',
        proxima_evaluacion_fecha: '2028-03-10',
        ultima_evaluacion_texto: '10/03/2025',
        proxima_evaluacion_texto: '10/03/2028',
        observaciones: '',
      },
      newId: evalId,
    });
    assert.equal(addRes.ok, true);
    assert.equal(addRes.data?.summary.ultima_evaluacion_in_situ_fecha, '2025-03-10');
    assert.equal(addRes.data?.summary.proxima_evaluacion_in_situ_fecha, '2028-03-10');
    assert.equal(addRes.data?.summary.sin_registro_evaluacion, false);
    const auditorSyncPayload = addCalls.find(
      (c) => c.table === 'auditor' && c.op === 'update'
    )?.payload as Record<string, unknown>;
    assert.equal(auditorSyncPayload.ultima_evaluacion_in_situ_fecha, '2025-03-10');
    assert.equal(auditorSyncPayload.sin_registro_evaluacion, false);

    const { client: updClient } = createMockAuditorClient([
      {
        table: 'evaluacion_in_situ_auditor',
        op: 'update',
        response: {
          data: [
            {
              id: evalId,
              id_auditor: audId,
              ultima_evaluacion_fecha: '2025-04-01',
              proxima_evaluacion_fecha: '2028-04-01',
              deleted_at: null,
            },
          ],
          error: null,
        },
      },
      {
        table: 'evaluacion_in_situ_auditor',
        op: 'select',
        response: {
          data: [
            {
              id: evalId,
              id_auditor: audId,
              ultima_evaluacion_fecha: '2025-04-01',
              proxima_evaluacion_fecha: '2028-04-01',
              deleted_at: null,
            },
          ],
          error: null,
        },
      },
    ]);

    const updRes = await updateEvaluacionInSituAuditor({
      client: updClient,
      profile: ADMIN_PROFILE,
      auditorId: audId,
      evaluacionId: evalId,
      draft: {
        etiqueta_periodo: 'Evaluación 2025 Actualizada',
        norma_referencia: 'ISO 9001:2015',
        sector_area_evaluado: '4',
        ultima_evaluacion_fecha: '2025-04-01',
        proxima_evaluacion_fecha: '2028-04-01',
        ultima_evaluacion_texto: '01/04/2025',
        proxima_evaluacion_texto: '01/04/2028',
        observaciones: '',
      },
    });
    assert.equal(updRes.ok, true);
    assert.equal(updRes.data?.summary.ultima_evaluacion_in_situ_fecha, '2025-04-01');

    const { client: delClient } = createMockAuditorClient([
      {
        table: 'evaluacion_in_situ_auditor',
        op: 'select',
        response: { data: [], error: null },
      },
    ]);
    const delRes = await deleteEvaluacionInSituAuditor({
      client: delClient,
      profile: ADMIN_PROFILE,
      auditorId: audId,
      evaluacionId: evalId,
    });
    assert.equal(delRes.ok, true);
    assert.equal(delRes.data?.summary.sin_registro_evaluacion, true);
    assert.equal(delRes.data?.summary.ultima_evaluacion_in_situ_fecha, null);
  });

  it('enriches actorDirectory with real CSV auditors and primary emails without exposing raw UUIDs', () => {
    const merged = mergeAuditorsIntoActorDirectory(SEEDED_ACTOR_DIRECTORY, [
      {
        id: '10000000-0000-0000-0000-000000000047',
        nombre: 'Ana Karina Sanchez',
        email: 'calidad.aksanchez@gmail.com',
        emails: [
          {
            email: 'calidad.aksanchez@gmail.com',
            es_principal: true,
            deleted_at: null,
          },
        ],
      },
    ]);

    const resolved = resolveAuditActorDisplay(
      {
        performed_by: '10000000-0000-0000-0000-000000000047',
      },
      merged
    );
    assert.equal(resolved.displayName, 'Ana Karina Sanchez');
    assert.equal(resolved.email, 'calidad.aksanchez@gmail.com');
    assert.equal(resolved.formatted, 'Ana Karina Sanchez (calidad.aksanchez@gmail.com)');
    assert.equal(assertZeroUuidExposure(resolved.formatted).compliant, true);
  });
});
