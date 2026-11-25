import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INITIAL_EXPERTOS_TECNICOS,
  applyExpertoCompetenciaSectorCascade,
  createEmptyExpertoCompetenciaDraft,
  evaluateExpertoCompetencyMatch,
  validateExpertoCompetenciaDraft,
  validateExpertoEmailDraft,
  validateExpertoFormDraft,
  validateExpertoTelefonoDraft,
} from './expertoTecnicoDomain';
import {
  addExpertoEmail,
  addExpertoTelefono,
  archiveExpertoEmail,
  archiveExpertoTelefono,
  assembleExpertoEntitiesFromRows,
  createExpertoTecnico,
  formatExpertoZeroUuidError,
  hydrateExpertosTecnicosFromSupabase,
  linkExpertoCompetencia,
  unlinkExpertoSectorIaf,
  unlinkExpertoSubsectorIaf,
  updateExpertoTecnico,
  type ExpertoDeleteBuilder,
  type ExpertoInsertBuilder,
  type ExpertoMutationBuilder,
  type ExpertoQueryResponse,
  type ExpertoSelectBuilder,
  type ExpertoSingleResponse,
  type ExpertoSupabaseClient,
  type ExpertoTableClient,
  type ExpertoUpdateBuilder,
} from './expertoTecnicoPersistence';
import type { SectorIafEntity, SubsectorIafEntity } from './extraDomain';
import type { UserProfile } from './healthCheck';
import { containsRawUuid } from './zeroUuid';

const ADMIN_PROFILE: UserProfile = {
  id: '00000000-0000-0000-0000-000000000001',
  nombre: 'Admin Certificación',
  role: 'ADMIN',
  status: 'APPROVED',
};

const WORKER_PROFILE: UserProfile = {
  id: '00000000-0000-0000-0000-000000000002',
  nombre: 'Analista Operaciones',
  role: 'WORKER',
  status: 'APPROVED',
};

const AUDITOR_PROFILE: UserProfile = {
  id: '00000000-0000-0000-0000-000000000003',
  nombre: 'Auditor Demo',
  role: 'AUDITOR',
  status: 'APPROVED',
};

const CLIENT_PROFILE: UserProfile = {
  id: '00000000-0000-0000-0000-000000000004',
  nombre: 'Cliente Demo',
  role: 'CLIENT',
  status: 'APPROVED',
};

const PENDING_PROFILE: UserProfile = {
  id: '00000000-0000-0000-0000-000000000005',
  nombre: 'Pendiente Demo',
  role: 'WORKER',
  status: 'PENDING',
};

const SECTORES_CATALOG: SectorIafEntity[] = [
  {
    id: 'd0000000-0000-0000-0000-000000000013',
    sector: 13,
    descripcion: 'Productos farmacéuticos',
    subsectores_count: 1,
    auditores_count: 0,
  },
  {
    id: 'd0000000-0000-0000-0000-000000000017',
    sector: 17,
    descripcion: 'Metales básicos y productos metálicos fabricados',
    subsectores_count: 1,
    auditores_count: 2,
  },
];

const SUBSECTORES_CATALOG: SubsectorIafEntity[] = [
  {
    id: 'da000000-0000-0000-0000-000000000132',
    id_sector_iaf: 'd0000000-0000-0000-0000-000000000013',
    sector_numero: 13,
    codigo: '13.2',
    descripcion: 'Fabricación de preparados farmacéuticos y especialidades medicinales',
    categoria_riesgo: 'ALTO',
    auditores_nombres: [],
  },
  {
    id: 'da000000-0000-0000-0000-000000000171',
    id_sector_iaf: 'd0000000-0000-0000-0000-000000000017',
    sector_numero: 17,
    codigo: '17.1',
    descripcion: 'Fabricación de acero, fundición de hierro y metales básicos',
    categoria_riesgo: 'ALTO',
    auditores_nombres: [],
  },
];

interface RecordedCall {
  table: string;
  op: 'select' | 'insert' | 'update' | 'delete';
  payload?: Record<string, unknown> | Array<Record<string, unknown>>;
  filters: Record<string, unknown>;
}

function createMockExpertoSupabaseClient(options?: {
  tableData?: Record<string, Array<Record<string, unknown>>>;
  failTable?: string;
  failError?: { code?: string; message: string };
}): { client: ExpertoSupabaseClient; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const tableData = options?.tableData ?? {};

  const client: ExpertoSupabaseClient = {
    from(table: string): ExpertoTableClient {
      const makeError = () =>
        options?.failTable === table && options.failError ? options.failError : null;

      return {
        select(_columns: string): ExpertoSelectBuilder {
          const filters: Record<string, unknown> = {};
          const builder: ExpertoSelectBuilder = {
            eq(col, val) {
              filters[`eq:${col}`] = val;
              return builder;
            },
            is(col, val) {
              filters[`is:${col}`] = val;
              return builder;
            },
            order() {
              return builder;
            },
            limit() {
              return builder;
            },
            async single(): Promise<ExpertoSingleResponse> {
              const err = makeError();
              const rows = tableData[table] ?? [];
              return { data: err ? null : rows[0] ?? null, error: err };
            },
            async maybeSingle(): Promise<ExpertoSingleResponse> {
              const err = makeError();
              const rows = tableData[table] ?? [];
              return { data: err ? null : rows[0] ?? null, error: err };
            },
            then<TResult1 = ExpertoQueryResponse, TResult2 = never>(
              onfulfilled?: ((v: ExpertoQueryResponse) => TResult1 | PromiseLike<TResult1>) | null,
              onrejected?: ((r: unknown) => TResult2 | PromiseLike<TResult2>) | null
            ) {
              calls.push({ table, op: 'select', filters });
              const err = makeError();
              const res: ExpertoQueryResponse = {
                data: err ? null : tableData[table] ?? [],
                error: err,
              };
              return Promise.resolve(res).then(onfulfilled, onrejected);
            },
          };
          return builder;
        },
        insert(values): ExpertoInsertBuilder {
          const rowPayload = Array.isArray(values) ? values[0] ?? {} : values;
          calls.push({ table, op: 'insert', payload: values, filters: {} });
          const mutationBuilder: ExpertoMutationBuilder = {
            async single(): Promise<ExpertoSingleResponse> {
              const err = makeError();
              return { data: err ? null : { ...rowPayload }, error: err };
            },
            async maybeSingle(): Promise<ExpertoSingleResponse> {
              const err = makeError();
              return { data: err ? null : { ...rowPayload }, error: err };
            },
            then<TResult1 = ExpertoQueryResponse, TResult2 = never>(
              onfulfilled?: ((v: ExpertoQueryResponse) => TResult1 | PromiseLike<TResult1>) | null,
              onrejected?: ((r: unknown) => TResult2 | PromiseLike<TResult2>) | null
            ) {
              const err = makeError();
              const res: ExpertoQueryResponse = {
                data: err ? null : [rowPayload],
                error: err,
              };
              return Promise.resolve(res).then(onfulfilled, onrejected);
            },
          };
          return {
            select: () => mutationBuilder,
            then: mutationBuilder.then,
          };
        },
        update(values): ExpertoUpdateBuilder {
          const filters: Record<string, unknown> = {};
          const call: RecordedCall = { table, op: 'update', payload: values, filters };
          calls.push(call);
          const mutationBuilder: ExpertoMutationBuilder = {
            async single(): Promise<ExpertoSingleResponse> {
              const err = makeError();
              return { data: err ? null : { ...values }, error: err };
            },
            async maybeSingle(): Promise<ExpertoSingleResponse> {
              const err = makeError();
              return { data: err ? null : { ...values }, error: err };
            },
            then<TResult1 = ExpertoQueryResponse, TResult2 = never>(
              onfulfilled?: ((v: ExpertoQueryResponse) => TResult1 | PromiseLike<TResult1>) | null,
              onrejected?: ((r: unknown) => TResult2 | PromiseLike<TResult2>) | null
            ) {
              const err = makeError();
              const res: ExpertoQueryResponse = { data: err ? null : [values], error: err };
              return Promise.resolve(res).then(onfulfilled, onrejected);
            },
          };
          const builder: ExpertoUpdateBuilder = {
            eq(col, val) {
              filters[`eq:${col}`] = val;
              return builder;
            },
            is(col, val) {
              filters[`is:${col}`] = val;
              return builder;
            },
            select: () => mutationBuilder,
            then: mutationBuilder.then,
          };
          return builder;
        },
        delete(): ExpertoDeleteBuilder {
          const filters: Record<string, unknown> = {};
          calls.push({ table, op: 'delete', filters });
          const builder: ExpertoDeleteBuilder = {
            eq(col, val) {
              filters[`eq:${col}`] = val;
              return builder;
            },
            match(query) {
              Object.assign(filters, query);
              return builder;
            },
            then<TResult1 = ExpertoQueryResponse, TResult2 = never>(
              onfulfilled?: ((v: ExpertoQueryResponse) => TResult1 | PromiseLike<TResult1>) | null,
              onrejected?: ((r: unknown) => TResult2 | PromiseLike<TResult2>) | null
            ) {
              const err = makeError();
              const res: ExpertoQueryResponse = { data: err ? null : [], error: err };
              return Promise.resolve(res).then(onfulfilled, onrejected);
            },
          };
          return builder;
        },
      };
    },
  };

  return { client, calls };
}

test('Step 1.3 Domain: INITIAL_EXPERTOS_TECNICOS matches seeded 5 experts, statuses, contacts, history, and zero ISO norms', () => {
  assert.equal(INITIAL_EXPERTOS_TECNICOS.length, 5);
  assert.deepEqual(
    INITIAL_EXPERTOS_TECNICOS.map((e) => e.id),
    [
      '1e000000-0000-0000-0000-000000000001',
      '1e000000-0000-0000-0000-000000000002',
      '1e000000-0000-0000-0000-000000000003',
      '1e000000-0000-0000-0000-000000000004',
      '1e000000-0000-0000-0000-000000000005',
    ]
  );

  const disponibles = INITIAL_EXPERTOS_TECNICOS.filter((e) => e.estatus === 'Disponible');
  const noDisponibles = INITIAL_EXPERTOS_TECNICOS.filter((e) => e.estatus === 'No disponible');
  assert.equal(disponibles.length, 4);
  assert.equal(noDisponibles.length, 1);
  assert.equal(noDisponibles[0].nombre, 'Ing. Rodrigo Páez');

  const sofia = INITIAL_EXPERTOS_TECNICOS[0];
  assert.equal(sofia.nombre, 'Dra. Sofía Quintero');
  assert.equal(sofia.subsectorLinks[0]?.subsector_codigo, '13.2');
  assert.equal(sofia.historialAuditorias.length, 1);
  assert.equal(sofia.historialAuditorias[0]?.codigo_auditoria, 'AUD-FAR-2026-001');

  const hector = INITIAL_EXPERTOS_TECNICOS[1];
  assert.equal(hector.telefonos.length, 2);
  assert.equal(hector.sectorLinks[0]?.sector_numero, 13);

  // Zero ISO norm fields or structures on technical experts
  for (const exp of INITIAL_EXPERTOS_TECNICOS) {
    assert.equal('normaLinks' in exp, false);
    assert.equal('normas' in exp, false);
  }
});

test('Step 1.3 Domain: validateExpertoFormDraft enforces required name, max length, duplicates, estatus, and Zero-UUID', () => {
  const emptyRes = validateExpertoFormDraft({
    nombre: '   ',
    estatus: 'Disponible',
    notas: '',
  });
  assert.equal(emptyRes.valid, false);
  assert.match(emptyRes.message || '', /obligatorio/i);

  const longRes = validateExpertoFormDraft({
    nombre: 'A'.repeat(151),
    estatus: 'Disponible',
    notas: '',
  });
  assert.equal(longRes.valid, false);
  assert.match(longRes.message || '', /150/);

  const uuidNombreRes = validateExpertoFormDraft({
    nombre: 'Experto 1e000000-0000-0000-0000-000000000001',
    estatus: 'Disponible',
    notas: '',
  });
  assert.equal(uuidNombreRes.valid, false);
  assert.equal(containsRawUuid(uuidNombreRes.message || ''), false);

  const uuidNotasRes = validateExpertoFormDraft({
    nombre: 'Ing. Nuevo Experto',
    estatus: 'Disponible',
    notas: 'Ver 1e000000-0000-0000-0000-000000000001',
  });
  assert.equal(uuidNotasRes.valid, false);
  assert.equal(containsRawUuid(uuidNotasRes.message || ''), false);

  const dupRes = validateExpertoFormDraft(
    {
      nombre: '  dra. sofía quintero ',
      estatus: 'Disponible',
      notas: '',
    },
    INITIAL_EXPERTOS_TECNICOS
  );
  assert.equal(dupRes.valid, false);
  assert.match(dupRes.message || '', /ya existe/i);

  // Updating the same expert keeps same name valid
  const sameIdRes = validateExpertoFormDraft(
    {
      nombre: 'Dra. Sofía Quintero',
      estatus: 'No disponible',
      notas: 'Actualizado',
    },
    INITIAL_EXPERTOS_TECNICOS,
    '1e000000-0000-0000-0000-000000000001'
  );
  assert.equal(sameIdRes.valid, true);
  assert.equal(sameIdRes.normalized.estatus, 'No disponible');
});

test('Step 1.3 Domain: validateExpertoTelefonoDraft and validateExpertoEmailDraft enforce format, active duplicates, and Zero-UUID', () => {
  const existingPhones = [
    { telefono: '+58 414 210-3101', deleted_at: null },
    { telefono: '+58 412 999-0000', deleted_at: '2026-01-01T00:00:00Z' },
  ];

  assert.equal(
    validateExpertoTelefonoDraft({ telefono: '123', tipo_telefono: 'Móvil' }, existingPhones).valid,
    false
  );
  assert.equal(
    validateExpertoTelefonoDraft(
      { telefono: '584142103101', tipo_telefono: 'Oficina' },
      existingPhones
    ).valid,
    false
  );
  // Soft-deleted phone can be re-added
  assert.equal(
    validateExpertoTelefonoDraft(
      { telefono: '+58 412 999-0000', tipo_telefono: 'Móvil' },
      existingPhones
    ).valid,
    true
  );

  const uuidPhone = validateExpertoTelefonoDraft({
    telefono: '1e000000-0000-0000-0000-000000000001',
    tipo_telefono: 'Móvil',
  });
  assert.equal(uuidPhone.valid, false);
  assert.equal(containsRawUuid(uuidPhone.message || ''), false);

  const existingEmails = [
    { email: 'squintero.experto@fondonorma.test', deleted_at: null },
    { email: 'old@fondonorma.test', deleted_at: '2026-01-01T00:00:00Z' },
  ];
  assert.equal(
    validateExpertoEmailDraft({ email: 'bad-email', tipo_email: 'Trabajo' }, existingEmails).valid,
    false
  );
  assert.equal(
    validateExpertoEmailDraft(
      { email: 'SQUINTERO.EXPERTO@FONDONORMA.TEST', tipo_email: 'Trabajo' },
      existingEmails
    ).valid,
    false
  );
  assert.equal(
    validateExpertoEmailDraft({ email: 'OLD@FONDONORMA.TEST', tipo_email: 'Trabajo' }, existingEmails)
      .valid,
    true
  );
});

test('Step 1.3 Domain: applyExpertoCompetenciaSectorCascade and validateExpertoCompetenciaDraft enforce Sector->Subsector cascade', () => {
  const cascadeSectores = SECTORES_CATALOG.map((s) => ({
    id: s.id,
    sector: s.sector,
    descripcion: s.descripcion,
  }));
  const cascadeSubs = SUBSECTORES_CATALOG.map((sub) => ({
    id: sub.id,
    id_sector_iaf: sub.id_sector_iaf,
    sector_numero: sub.sector_numero,
    codigo: sub.codigo,
    descripcion: sub.descripcion,
    categoria_riesgo: sub.categoria_riesgo,
  }));

  const initialDraft = {
    ...createEmptyExpertoCompetenciaDraft('1e000000-0000-0000-0000-000000000001', 'subsector_iaf'),
    id_sector_iaf: SECTORES_CATALOG[0].id,
    id_subsector_iaf: SUBSECTORES_CATALOG[0].id, // 13.2
  };

  // Switching parent sector from 13 -> 17 clears incompatible subsector 13.2
  const switched = applyExpertoCompetenciaSectorCascade({
    draft: initialDraft,
    nextSectorId: SECTORES_CATALOG[1].id,
    sectores: cascadeSectores,
    subsectores: cascadeSubs,
  });
  assert.equal(switched.draft.id_sector_iaf, SECTORES_CATALOG[1].id);
  assert.equal(switched.draft.id_subsector_iaf, '');
  assert.deepEqual(
    switched.filteredSubsectores.map((s) => s.codigo),
    ['17.1']
  );

  // sector_iaf mode clears subsector selection even if a sector is picked
  const sectorOnly = applyExpertoCompetenciaSectorCascade({
    draft: { ...initialDraft, tipo: 'sector_iaf' },
    nextSectorId: SECTORES_CATALOG[0].id,
    sectores: cascadeSectores,
    subsectores: cascadeSubs,
  });
  assert.equal(sectorOnly.draft.id_subsector_iaf, '');

  const sofia = INITIAL_EXPERTOS_TECNICOS[0]; // already has 13.2
  const badUuid = validateExpertoCompetenciaDraft({
    draft: {
      id_experto_tecnico: sofia.id,
      tipo: 'sector_iaf',
      id_sector_iaf: 'not-a-uuid-99999999-9999-9999-9999-999999999999',
      id_subsector_iaf: '',
    },
    experto: sofia,
    sectores: cascadeSectores,
    subsectores: cascadeSubs,
  });
  assert.equal(badUuid.valid, false);
  assert.equal(containsRawUuid(badUuid.message || ''), false);

  // Mismatched sector/subsector
  const mismatch = validateExpertoCompetenciaDraft({
    draft: {
      id_experto_tecnico: sofia.id,
      tipo: 'subsector_iaf',
      id_sector_iaf: SECTORES_CATALOG[1].id, // 17
      id_subsector_iaf: SUBSECTORES_CATALOG[0].id, // 13.2
    },
    experto: sofia,
    sectores: cascadeSectores,
    subsectores: cascadeSubs,
  });
  assert.equal(mismatch.valid, false);
  assert.match(mismatch.message || '', /no pertenece/i);

  // Duplicate subsector 13.2
  const duplicateSub = validateExpertoCompetenciaDraft({
    draft: {
      id_experto_tecnico: sofia.id,
      tipo: 'subsector_iaf',
      id_sector_iaf: SECTORES_CATALOG[0].id,
      id_subsector_iaf: SUBSECTORES_CATALOG[0].id,
    },
    experto: sofia,
    sectores: cascadeSectores,
    subsectores: cascadeSubs,
  });
  assert.equal(duplicateSub.valid, false);
  assert.match(duplicateSub.message || '', /ya posee/i);
});

test('Step 1.3 Domain: evaluateExpertoCompetencyMatch classifies SUBSECTOR_EXACT, SECTOR_FULL, and NONE without ISO norms', () => {
  const sofia = INITIAL_EXPERTOS_TECNICOS[0]; // Subsector 13.2 only
  const hector = INITIAL_EXPERTOS_TECNICOS[1]; // Full Sector 13
  const mariela = INITIAL_EXPERTOS_TECNICOS[2]; // Full Sector 17 + Subsector 17.1

  assert.equal(evaluateExpertoCompetencyMatch(sofia, 13, '13.2'), 'SUBSECTOR_EXACT');
  assert.equal(evaluateExpertoCompetencyMatch(sofia, 13, '13.1'), 'NONE');
  assert.equal(evaluateExpertoCompetencyMatch(hector, 13, '13.2'), 'SECTOR_FULL');
  assert.equal(evaluateExpertoCompetencyMatch(mariela, 17, '17.1'), 'SUBSECTOR_EXACT');
  assert.equal(evaluateExpertoCompetencyMatch(mariela, 17, '17.2'), 'SECTOR_FULL');
  assert.equal(evaluateExpertoCompetencyMatch(mariela, 33, '33.1'), 'NONE');
});

test('Step 1.3 Persistence: assemble & hydrate build full nested entities and exclude soft-deleted children', async () => {
  const assembled = assembleExpertoEntitiesFromRows({
    expertoRows: [
      {
        id: '1e000000-0000-0000-0000-000000000001',
        nombre: 'Dra. Sofía Quintero',
        estatus: 'Disponible',
        notas: 'Notas BPM',
      },
      {
        id: '1e000000-0000-0000-0000-000000000099',
        nombre: 'Experto Archivado',
        estatus: 'No disponible',
        deleted_at: '2026-02-01T00:00:00Z',
      },
    ],
    telefonoRows: [
      {
        id: '1e100000-0000-0000-0000-000000000001',
        id_experto_tecnico: '1e000000-0000-0000-0000-000000000001',
        telefono: '+58 414 210-3101',
        tipo_telefono: 'Móvil',
        deleted_at: null,
      },
      {
        id: '1e100000-0000-0000-0000-000000000088',
        id_experto_tecnico: '1e000000-0000-0000-0000-000000000001',
        telefono: '+58 414 000-0000',
        tipo_telefono: 'Oficina',
        deleted_at: '2026-02-01T00:00:00Z',
      },
    ],
    emailRows: [
      {
        id: '1e200000-0000-0000-0000-000000000001',
        id_experto_tecnico: '1e000000-0000-0000-0000-000000000001',
        email: 'squintero.experto@fondonorma.test',
        tipo_email: 'Trabajo',
        deleted_at: null,
      },
    ],
    sectorLinkRows: [
      {
        id_experto_tecnico: '1e000000-0000-0000-0000-000000000001',
        id_sector_iaf: 'd0000000-0000-0000-0000-000000000013',
        sector: { id: 'd0000000-0000-0000-0000-000000000013', sector: 13, descripcion: 'Productos farmacéuticos' },
      },
    ],
    subsectorLinkRows: [
      {
        id_experto_tecnico: '1e000000-0000-0000-0000-000000000001',
        id_subsector_iaf: 'da000000-0000-0000-0000-000000000132',
        subsector: {
          id: 'da000000-0000-0000-0000-000000000132',
          id_sector_iaf: 'd0000000-0000-0000-0000-000000000013',
          codigo: '13.2',
          descripcion: 'Preparados farmacéuticos',
          categoria_riesgo: 'ALTO',
        },
      },
    ],
    auditoriaLinkRows: [
      {
        id: '1e300000-0000-0000-0000-000000000001',
        id_auditoria: '80000000-0000-0000-0000-000000000201',
        id_experto_tecnico: '1e000000-0000-0000-0000-000000000001',
        dias_asignados: 1,
        observacion: 'Control estéril',
        auditoria: {
          codigo_auditoria: 'AUD-FAR-2026-001',
          estado_ciclo: 'Planificada',
          tipo_auditoria: { tipo: 'Etapa 2' },
          certificado: {
            numero_certificado: 'FN-SST-2026-201',
            organizacion: { nombre: 'Laboratorios Farmacéuticos del Centro C.A.' },
          },
        },
      },
    ],
  });

  assert.equal(assembled.length, 1);
  assert.equal(assembled[0].telefonos.length, 1);
  assert.equal(assembled[0].emails.length, 1);
  assert.equal(assembled[0].sectorLinks.length, 1);
  assert.equal(assembled[0].subsectorLinks[0]?.subsector_codigo, '13.2');
  assert.equal(assembled[0].historialAuditorias[0]?.codigo_auditoria, 'AUD-FAR-2026-001');

  const { client } = createMockExpertoSupabaseClient({
    tableData: {
      experto_tecnico: [
        { id: '1e000000-0000-0000-0000-000000000001', nombre: 'Dra. Sofía Quintero', estatus: 'Disponible' },
      ],
    },
  });
  const hydrated = await hydrateExpertosTecnicosFromSupabase(
    client,
    SECTORES_CATALOG,
    SUBSECTORES_CATALOG
  );
  assert.equal(hydrated.ok, true);
  assert.equal(hydrated.data?.length, 1);
});

test('Step 1.3 Persistence: CRUD, RBAC staff enforcement, child soft-delete without delete_reason, and Zero-UUID sanitization', async () => {
  const { client, calls } = createMockExpertoSupabaseClient();

  // RBAC blocks CLIENT, AUDITOR, and PENDING from all mutations
  for (const blockedProfile of [CLIENT_PROFILE, AUDITOR_PROFILE, PENDING_PROFILE]) {
    const blockedCreate = await createExpertoTecnico({
      client,
      profile: blockedProfile,
      draft: { nombre: 'Experto Test', estatus: 'Disponible', notas: '' },
      existingExpertos: [],
    });
    assert.equal(blockedCreate.ok, false);
    assert.match(blockedCreate.error || '', /Acceso denegado/i);
  }
  assert.equal(calls.length, 0);

  // ADMIN / WORKER can create, update, add/archive phone & email, link/unlink sector & subsector
  const created = await createExpertoTecnico({
    client,
    profile: WORKER_PROFILE,
    draft: { nombre: 'Ing. Nuevo Experto', estatus: 'Disponible', notas: 'Área limpia' },
    existingExpertos: INITIAL_EXPERTOS_TECNICOS,
    newId: '1e000000-0000-0000-0000-000000000077',
  });
  assert.equal(created.ok, true);
  assert.equal(created.data?.id, '1e000000-0000-0000-0000-000000000077');

  const updated = await updateExpertoTecnico({
    client,
    profile: ADMIN_PROFILE,
    expertoId: '1e000000-0000-0000-0000-000000000077',
    draft: { nombre: 'Ing. Nuevo Experto', estatus: 'No disponible', notas: 'Licencia' },
    existingExpertos: INITIAL_EXPERTOS_TECNICOS,
  });
  assert.equal(updated.ok, true);

  const phoneAdded = await addExpertoTelefono({
    client,
    profile: WORKER_PROFILE,
    expertoId: '1e000000-0000-0000-0000-000000000077',
    draft: { telefono: '+58 414 888-7766', tipo_telefono: 'Móvil' },
    existingTelefonos: [],
    newId: '1e100000-0000-0000-0000-000000000077',
  });
  assert.equal(phoneAdded.ok, true);

  const phoneArchived = await archiveExpertoTelefono({
    client,
    profile: ADMIN_PROFILE,
    telefonoId: '1e100000-0000-0000-0000-000000000077',
  });
  assert.equal(phoneArchived.ok, true);
  const archivePhoneCall = calls.find(
    (c) => c.table === 'telefono_experto_tecnico' && c.op === 'update'
  );
  assert.ok(archivePhoneCall);
  const phonePayload = archivePhoneCall.payload as Record<string, unknown>;
  assert.ok(phonePayload.deleted_at);
  assert.equal(phonePayload.deleted_by, ADMIN_PROFILE.id);
  assert.equal('delete_reason' in phonePayload, false);

  const emailAdded = await addExpertoEmail({
    client,
    profile: WORKER_PROFILE,
    expertoId: '1e000000-0000-0000-0000-000000000077',
    draft: { email: 'nuevo@fondonorma.test', tipo_email: 'Trabajo' },
    existingEmails: [],
    newId: '1e200000-0000-0000-0000-000000000077',
  });
  assert.equal(emailAdded.ok, true);

  const emailArchived = await archiveExpertoEmail({
    client,
    profile: ADMIN_PROFILE,
    emailId: '1e200000-0000-0000-0000-000000000077',
  });
  assert.equal(emailArchived.ok, true);
  const archiveEmailCall = calls.find(
    (c) => c.table === 'email_experto_tecnico' && c.op === 'update'
  );
  assert.ok(archiveEmailCall);
  assert.equal('delete_reason' in (archiveEmailCall.payload as Record<string, unknown>), false);

  const baseExperto = created.data!;
  const sectorLinked = await linkExpertoCompetencia({
    client,
    profile: ADMIN_PROFILE,
    experto: baseExperto,
    draft: {
      id_experto_tecnico: baseExperto.id,
      tipo: 'sector_iaf',
      id_sector_iaf: SECTORES_CATALOG[0].id,
      id_subsector_iaf: '',
    },
    sectores: SECTORES_CATALOG,
    subsectores: SUBSECTORES_CATALOG,
  });
  assert.equal(sectorLinked.ok, true);

  const subsectorLinked = await linkExpertoCompetencia({
    client,
    profile: WORKER_PROFILE,
    experto: baseExperto,
    draft: {
      id_experto_tecnico: baseExperto.id,
      tipo: 'subsector_iaf',
      id_sector_iaf: SECTORES_CATALOG[0].id,
      id_subsector_iaf: SUBSECTORES_CATALOG[0].id,
    },
    sectores: SECTORES_CATALOG,
    subsectores: SUBSECTORES_CATALOG,
  });
  assert.equal(subsectorLinked.ok, true);

  const unlinkedSec = await unlinkExpertoSectorIaf({
    client,
    profile: ADMIN_PROFILE,
    expertoId: baseExperto.id,
    sectorId: SECTORES_CATALOG[0].id,
  });
  assert.equal(unlinkedSec.ok, true);

  const unlinkedSub = await unlinkExpertoSubsectorIaf({
    client,
    profile: WORKER_PROFILE,
    expertoId: baseExperto.id,
    subsectorId: SUBSECTORES_CATALOG[0].id,
  });
  assert.equal(unlinkedSub.ok, true);

  // Raw UUIDs in DB error messages are scrubbed
  const sanitized = formatExpertoZeroUuidError(
    new Error('duplicate key 1e000000-0000-0000-0000-000000000001 violates constraint')
  );
  assert.equal(containsRawUuid(sanitized), false);
});
