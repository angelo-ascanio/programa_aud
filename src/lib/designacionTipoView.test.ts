import test from 'node:test';
import assert from 'node:assert/strict';

import type { UserProfile } from './healthCheck';
import type { OrganizacionEntity } from './activeCertificates';
import type { ConglomeradoEntity } from './conglomeradoDomain';
import { INITIAL_TIPOS_AUDITORIA_CATALOG } from './extraDomain';
import type { ProgramaAuditoriaEntity } from './auditPlanningEngine';
import type { ProgramacionAuditEntity } from './auditExecution';
import type { SoftDeletableCertificado, VinculoEntity } from './vinculoDomain';
import { assertZeroUuidExposure } from './zeroUuid';
import {
  createDefaultReprogramDateDraft,
  createEmptyStep3NewCycleDraft,
  renderDesignacionTipoView,
  type DesignacionTipoViewState,
} from '../views/designacionTipoView';

const ADMIN_PROFILE: UserProfile = {
  id: '00000000-0000-0000-0000-000000000001',
  nombre: 'Admin Calidad',
  role: 'ADMIN',
  status: 'APPROVED',
  created_at: '2025-01-01T00:00:00Z',
};

const WORKER_PROFILE: UserProfile = {
  id: '00000000-0000-0000-0000-000000000002',
  nombre: 'Coordinador Técnico',
  role: 'WORKER',
  status: 'APPROVED',
  created_at: '2025-01-01T00:00:00Z',
};

const AUDITOR_PROFILE: UserProfile = {
  id: '00000000-0000-0000-0000-000000000003',
  nombre: 'Auditor Líder ISO',
  role: 'AUDITOR',
  status: 'APPROVED',
  created_at: '2025-01-01T00:00:00Z',
};

const CLIENT_PROFILE: UserProfile = {
  id: '00000000-0000-0000-0000-000000000004',
  nombre: 'Contacto Cliente',
  role: 'CLIENT',
  status: 'APPROVED',
  created_at: '2025-01-01T00:00:00Z',
};

const UUID_GRUPO = '20000000-0000-0000-0000-000000000001';
const UUID_ORG = '30000000-0000-0000-0000-000000000001';
const UUID_CERT_1 = '40000000-0000-0000-0000-000000000001';
const UUID_CERT_2 = '40000000-0000-0000-0000-000000000002';
const UUID_CERT_FREE = '40000000-0000-0000-0000-000000000099';
const UUID_VINCULO = '7c000000-0000-0000-0000-000000000001';

const TIPO_SEG1 = INITIAL_TIPOS_AUDITORIA_CATALOG[2]; // Seguimiento 1
const TIPO_SEG2 = INITIAL_TIPOS_AUDITORIA_CATALOG[3]; // Seguimiento 2
const TIPO_REN = INITIAL_TIPOS_AUDITORIA_CATALOG[4]; // Renovación

function buildBaseState(
  overrides: Partial<DesignacionTipoViewState> = {}
): DesignacionTipoViewState {
  return {
    queuePreset: 'PROXIMAS',
    query: '',
    viewMode: 'list',
    isSidebarOpen: true,
    sortColumn: null,
    sortDirection: 'none',
    facetSelections: {},
    selectedProgramId: null,
    activeChildTab: 'fechas',
    isCreating: false,
    isEditingAttributes: false,
    isReprogramming: false,
    editErrorMessage: null,
    ...overrides,
  };
}

function buildFixtures(): {
  conglomerados: ConglomeradoEntity[];
  organizaciones: OrganizacionEntity[];
  certificados: SoftDeletableCertificado[];
  vinculos: VinculoEntity[];
  programs: ProgramaAuditoriaEntity[];
} {
  const conglomerados: ConglomeradoEntity[] = [
    {
      id: UUID_GRUPO,
      codigo: 'GRP-001',
      nombre: 'Grupo Industrial Iberometal',
      pais: 'Venezuela',
      descripcion: 'Grupo industrial matriz.',
      organizaciones: [],
      deleted_at: null,
    },
  ];

  const organizaciones: OrganizacionEntity[] = [
    {
      id: UUID_ORG,
      id_grupo_empresarial: UUID_GRUPO,
      nombre: 'Iberometal Componentes S.A.',
      rif: 'J-30123456-7',
      direccion: 'Zona Industrial Santa Cruz',
      ciudad: 'Santa Cruz',
      pais: 'Venezuela',
      sector_iaf: 17,
      alcance: 'Manufactura de piezas metálicas',
      contacto: 'Ana Pérez',
      email: 'calidad@iberometal.example',
      telefono: '+58-243-5550101',
      deleted_at: null,
    },
  ];

  const certificados: SoftDeletableCertificado[] = [
    {
      id: UUID_CERT_1,
      numero_certificado: 'FN-QMS-2025-001',
      id_organizacion: UUID_ORG,
      organizacion_nombre: 'Iberometal Componentes S.A.',
      norma: 'ISO 9001:2015',
      estatus: 'Activo',
      deleted_at: null,
    },
    {
      id: UUID_CERT_2,
      numero_certificado: 'FN-EMS-2025-002',
      id_organizacion: UUID_ORG,
      organizacion_nombre: 'Iberometal Componentes S.A.',
      norma: 'ISO 14001:2015',
      estatus: 'Activo',
      deleted_at: null,
    },
    {
      id: UUID_CERT_FREE,
      numero_certificado: 'FN-LIBRE-2026-099',
      id_organizacion: UUID_ORG,
      organizacion_nombre: 'Iberometal Componentes S.A.',
      norma: 'ISO 45001:2018',
      estatus: 'Estudio',
      deleted_at: null,
    },
  ];

  const vinculos: VinculoEntity[] = [
    {
      id: UUID_VINCULO,
      id_grupo_empresarial: UUID_GRUPO,
      grupo_nombre: 'Grupo Industrial Iberometal',
      codigo_vinculo: 'VINC-N1-01',
      etiqueta: 'Planta Santa Cruz Integrado',
      nivel_vinculacion: 'NIVEL_1_INTRA_ORG',
      tipo_vinculacion: 'Integrada',
      es_vinculada: true,
      tiene_sitio_temporal: false,
      notas: null,
      deleted_at: null,
      certificados: [
        {
          id: '26000000-0000-0000-0000-000000000001',
          id_vinculo: UUID_VINCULO,
          id_certificado: UUID_CERT_1,
          numero_certificado: 'FN-QMS-2025-001',
          norma_codigo: 'ISO 9001:2015',
          id_organizacion: UUID_ORG,
          organizacion_nombre: 'Iberometal Componentes S.A.',
          estatus: 'Activo',
          deleted_at: null,
        },
        {
          id: '26000000-0000-0000-0000-000000000002',
          id_vinculo: UUID_VINCULO,
          id_certificado: UUID_CERT_2,
          numero_certificado: 'FN-EMS-2025-002',
          norma_codigo: 'ISO 14001:2015',
          id_organizacion: UUID_ORG,
          organizacion_nombre: 'Iberometal Componentes S.A.',
          estatus: 'Activo',
          deleted_at: null,
        },
      ],
    },
  ];

  const makeAudit = (
    overrides: Partial<ProgramacionAuditEntity>
  ): ProgramacionAuditEntity => ({
    id: '80000000-0000-0000-0000-000000000001',
    id_programa_auditoria: '7a000000-0000-0000-0000-000000000001',
    codigo_auditoria: 'AUD-2026-001',
    id_certificado: UUID_CERT_1,
    numero_certificado: 'FN-QMS-2025-001',
    id_organizacion: UUID_ORG,
    organizacion_nombre: 'Iberometal Componentes S.A.',
    norma_codigo: 'ISO 9001:2015',
    id_tipo_auditoria: TIPO_SEG1.id,
    tipo_auditoria: TIPO_SEG1.tipo,
    metodologia: 'Presencial',
    fecha_inicio: '2026-06-15',
    fecha_fin: '2026-06-17',
    dias_auditor: 3,
    tiempo_auditoria: 3,
    estado_ciclo: 'Programada',
    estatus_ejecucion: 'Programada',
    objetivo: 'Seguimiento integrado anual.',
    equipo: [],
    sitios: [],
    sitiosPlan: [],
    fechas: [],
    verificaciones: [],
    hallazgos: [],
    recomendacion: null,
    comentarios: [],
    deleted_at: null,
    ...overrides,
  });

  const imminentProgram: ProgramaAuditoriaEntity = {
    id: '7a000000-0000-0000-0000-000000000001',
    id_vinculo: UUID_VINCULO,
    id_grupo_empresarial: UUID_GRUPO,
    codigo_programa: 'PROG-2026-001',
    etiqueta: 'Campaña Vigente Santa Cruz 2026',
    nivel_vinculacion: 'NIVEL_1_INTRA_ORG',
    tipo_vinculacion: 'Integrada',
    es_vinculada: true,
    tiene_sitio_temporal: false,
    notas: 'Campaña actual en ejecución.',
    deleted_at: null,
    auditorias: [
      makeAudit({
        id: '80000000-0000-0000-0000-000000000001',
        id_programa_auditoria: '7a000000-0000-0000-0000-000000000001',
        codigo_auditoria: 'AUD-2026-QMS',
        id_certificado: UUID_CERT_1,
        numero_certificado: 'FN-QMS-2025-001',
        norma_codigo: 'ISO 9001:2015',
        id_tipo_auditoria: TIPO_SEG1.id,
        tipo_auditoria: TIPO_SEG1.tipo,
        fechas: [
          {
            id: '81000000-0000-0000-0000-000000000001',
            id_auditoria: '80000000-0000-0000-0000-000000000001',
            numero_secuencia: 1,
            tag: 'Programación',
            tipo_fecha: 'PREPROGRAMADA_MES',
            anio: 2026,
            mes: 5,
            fecha_inicio: null,
            fecha_fin: null,
            observacion: 'Ventana inicial estimada',
            deleted_at: null,
          },
          {
            id: '81000000-0000-0000-0000-000000000002',
            id_auditoria: '80000000-0000-0000-0000-000000000001',
            numero_secuencia: 2,
            tag: 'Reprogramación',
            tipo_fecha: 'PROGRAMADA_EXACTA',
            anio: null,
            mes: null,
            fecha_inicio: '2026-06-15',
            fecha_fin: '2026-06-17',
            observacion: 'Fechas exactas confirmadas con planta',
            deleted_at: null,
          },
        ],
      }),
      makeAudit({
        id: '80000000-0000-0000-0000-000000000002',
        id_programa_auditoria: '7a000000-0000-0000-0000-000000000001',
        codigo_auditoria: 'AUD-2026-EMS',
        id_certificado: UUID_CERT_2,
        numero_certificado: 'FN-EMS-2025-002',
        norma_codigo: 'ISO 14001:2015',
        id_tipo_auditoria: TIPO_SEG2.id,
        tipo_auditoria: TIPO_SEG2.tipo,
        fechas: [
          {
            id: '81000000-0000-0000-0000-000000000003',
            id_auditoria: '80000000-0000-0000-0000-000000000002',
            numero_secuencia: 1,
            tag: 'Programación',
            tipo_fecha: 'PROGRAMADA_EXACTA',
            anio: null,
            mes: null,
            fecha_inicio: '2026-06-15',
            fecha_fin: '2026-06-17',
            observacion: 'Fechas exactas confirmadas',
            deleted_at: null,
          },
        ],
      }),
    ],
  };

  const futurePlus2Program: ProgramaAuditoriaEntity = {
    id: '7a000000-0000-0000-0000-000000000002',
    id_vinculo: UUID_VINCULO,
    id_grupo_empresarial: UUID_GRUPO,
    codigo_programa: 'PROG-2028-001',
    etiqueta: 'Ciclo Trienal Renovación 2028',
    nivel_vinculacion: 'NIVEL_1_INTRA_ORG',
    tipo_vinculacion: 'Integrada',
    es_vinculada: true,
    tiene_sitio_temporal: false,
    notas: 'Preprogramado a +2 años.',
    deleted_at: null,
    auditorias: [
      makeAudit({
        id: '80000000-0000-0000-0000-000000000003',
        id_programa_auditoria: '7a000000-0000-0000-0000-000000000002',
        codigo_auditoria: 'AUD-2028-REN',
        id_certificado: UUID_CERT_1,
        numero_certificado: 'FN-QMS-2025-001',
        norma_codigo: 'ISO 9001:2015',
        id_tipo_auditoria: TIPO_REN.id,
        tipo_auditoria: TIPO_REN.tipo,
        fecha_inicio: '2028-08-01',
        fecha_fin: '2028-08-31',
        fechas: [
          {
            id: '81000000-0000-0000-0000-000000000004',
            id_auditoria: '80000000-0000-0000-0000-000000000003',
            numero_secuencia: 1,
            tag: 'Programación',
            tipo_fecha: 'PREPROGRAMADA_MES',
            anio: 2028,
            mes: 8,
            fecha_inicio: null,
            fecha_fin: null,
            observacion: 'Ventana estimada de renovación trienal',
            deleted_at: null,
          },
        ],
      }),
    ],
  };

  return {
    conglomerados,
    organizaciones,
    certificados,
    vinculos,
    programs: [imminentProgram, futurePlus2Program],
  };
}

function assertCleanZeroUuid(label: string, html: string): void {
  const check = assertZeroUuidExposure(html);
  assert.equal(
    check.compliant,
    true,
    `${label} exposed raw UUID(s): ${check.exposedUuids.join(', ')}`
  );
}

test('Step 3.3 Multi View: default PROXIMAS hides +2 year cycle, table-fixed colgroup sums 100%, 0 buttons in tbody, Zero-UUID', () => {
  const fixtures = buildFixtures();

  const proximasHtml = renderDesignacionTipoView({
    profile: ADMIN_PROFILE,
    state: buildBaseState({ queuePreset: 'PROXIMAS' }),
    ...fixtures,
    tiposCatalog: INITIAL_TIPOS_AUDITORIA_CATALOG,
    referenceIsoDate: '2026-06-01',
    archiveConfig: {
      canInspectArchived: true,
      showArchived: true,
      archivedItems: [
        {
          id: '7a000000-0000-0000-0000-000000000099',
          tableName: 'programa_auditoria',
          title: 'PROG-2024-ARC · Ciclo Archivado',
          deletedAt: '2026-01-10T10:00:00Z',
          deletedBy: ADMIN_PROFILE.id,
          deleteReason: 'Prueba archivo',
        },
      ],
      actorDirectory: {
        [ADMIN_PROFILE.id]: {
          id: ADMIN_PROFILE.id,
          nombre: ADMIN_PROFILE.nombre,
          role: ADMIN_PROFILE.role,
        },
      },
      restoringId: null,
    },
  });

  // Universal Template & Preset bar (role="group", never role="tablist")
  assert.ok(proximasHtml.includes('data-mv-domain="designacion-tipo"'));
  assert.equal(/role=["']tablist["']/i.test(proximasHtml), false);
  assert.ok(proximasHtml.includes('role="group"'));
  assert.equal(/type=["']search["']/i.test(proximasHtml), false);
  assert.ok(proximasHtml.includes('id="designacion-tipoSearchInput"'));
  assert.ok(proximasHtml.includes('data-action="open-create-step3-cycle"'));

  // Default PROXIMAS shows imminent 2026 campaign & hides +2 year 2028 campaign
  assert.ok(proximasHtml.includes('Campaña Vigente Santa Cruz 2026'));
  assert.ok(proximasHtml.includes('PROG-2026-001'));
  assert.ok(proximasHtml.includes('Reprog. #2'));
  assert.ok(proximasHtml.includes('Protección anti-futuro activa'));
  assert.equal(proximasHtml.includes('Ciclo Trienal Renovación 2028'), false);
  assert.equal(proximasHtml.includes('PROG-2028-001'), false);

  // Free certificates quick link to Vínculo
  assert.ok(proximasHtml.includes('1 certificado Libre sin vínculo → Ir a Vínculo'));

  // 5-col table-fixed colgroup summing 100%, 0 <button> in <tbody>
  assert.ok(proximasHtml.includes('data-resizable-table="designacion-tipo-main"'));
  assert.ok(proximasHtml.includes('table-fixed'));
  const colgroupMatch = proximasHtml.match(
    /<table[\s\S]*?data-resizable-table="designacion-tipo-main"[\s\S]*?<colgroup>([\s\S]*?)<\/colgroup>/
  );
  assert.ok(colgroupMatch, 'Missing <colgroup> on designacion-tipo-main');
  const widths = [...colgroupMatch[1].matchAll(/style="width:\s*([\d.]+)%;"/g)].map((m) =>
    Number(m[1])
  );
  assert.equal(widths.length, 5);
  assert.equal(
    widths.reduce((acc, n) => acc + n, 0),
    100
  );
  const tbodyMatch = proximasHtml.match(/<tbody[\s\S]*?<\/tbody>/);
  assert.ok(tbodyMatch);
  assert.equal(/<button\b/i.test(tbodyMatch[0]), false);
  assert.ok(tbodyMatch[0].includes('data-action="select-step3-program"'));
  assert.ok(tbodyMatch[0].includes('tabindex="0"'));

  // 4 reactive facets present
  assert.ok(proximasHtml.includes('data-facet-group="urgencia"'));
  assert.ok(proximasHtml.includes('data-facet-group="precision_fecha"'));
  assert.ok(proximasHtml.includes('data-facet-group="estado_paso"'));
  assert.ok(proximasHtml.includes('data-facet-group="naturaleza"'));

  assertCleanZeroUuid('DesignacionTipo Multi View PROXIMAS', proximasHtml);

  // FUTURO and TODAS reveal the +2 year campaign
  const futuroHtml = renderDesignacionTipoView({
    profile: ADMIN_PROFILE,
    state: buildBaseState({ queuePreset: 'FUTURO' }),
    ...fixtures,
    tiposCatalog: INITIAL_TIPOS_AUDITORIA_CATALOG,
    referenceIsoDate: '2026-06-01',
  });
  assert.ok(futuroHtml.includes('Ciclo Trienal Renovación 2028'));
  assert.equal(futuroHtml.includes('Campaña Vigente Santa Cruz 2026'), false);
  assertCleanZeroUuid('DesignacionTipo Multi View FUTURO', futuroHtml);

  const todasHtml = renderDesignacionTipoView({
    profile: ADMIN_PROFILE,
    state: buildBaseState({ queuePreset: 'TODAS', viewMode: 'grid' }),
    ...fixtures,
    tiposCatalog: INITIAL_TIPOS_AUDITORIA_CATALOG,
    referenceIsoDate: '2026-06-01',
  });
  assert.ok(todasHtml.includes('Campaña Vigente Santa Cruz 2026'));
  assert.ok(todasHtml.includes('Ciclo Trienal Renovación 2028'));
  assertCleanZeroUuid('DesignacionTipo Multi View TODAS Grid', todasHtml);
});

test('Step 3.3 Detail View: future warning banner on future cycle, 1:N timeline + reprogram form, per-cert types & step nav', () => {
  const fixtures = buildFixtures();
  const futureProgram = fixtures.programs[1];
  const currentProgram = fixtures.programs[0];

  // 1. Future cycle detail displays warning banner
  const futureDetailHtml = renderDesignacionTipoView({
    profile: ADMIN_PROFILE,
    state: buildBaseState({
      selectedProgramId: futureProgram.id,
      activeChildTab: 'fechas',
    }),
    ...fixtures,
    tiposCatalog: INITIAL_TIPOS_AUDITORIA_CATALOG,
    referenceIsoDate: '2026-06-01',
  });
  assert.ok(futureDetailHtml.includes('data-testid="future-cycle-warning-banner"'));
  assert.ok(futureDetailHtml.includes('Ciclo Futuro (Año 2028)'));
  assert.ok(futureDetailHtml.includes('Programación #1'));
  assert.ok(futureDetailHtml.includes('Agosto 2028'));
  assert.ok(futureDetailHtml.includes('Paso 3 · Tipo (Activo)'));
  assert.ok(futureDetailHtml.includes('Paso 4: Sitio'));
  assert.ok(futureDetailHtml.includes('Paso 8: Programa'));
  assertCleanZeroUuid('DesignacionTipo Future Detail', futureDetailHtml);

  // 2. Current cycle detail has NO future warning banner and shows 1:N history + reprogram form
  const currentFechas = currentProgram.auditorias[0].fechas || [];
  const currentTimelineHtml = renderDesignacionTipoView({
    profile: WORKER_PROFILE,
    state: buildBaseState({
      selectedProgramId: currentProgram.id,
      activeChildTab: 'fechas',
      isReprogramming: true,
      reprogramDraft: createDefaultReprogramDateDraft(
        currentProgram.auditorias[0].id,
        currentFechas[1],
        '2026-06-01'
      ),
    }),
    ...fixtures,
    tiposCatalog: INITIAL_TIPOS_AUDITORIA_CATALOG,
    referenceIsoDate: '2026-06-01',
  });
  assert.equal(currentTimelineHtml.includes('data-testid="future-cycle-warning-banner"'), false);
  assert.ok(currentTimelineHtml.includes('Programación #1'));
  assert.ok(currentTimelineHtml.includes('Reprogramación #2'));
  assert.ok(currentTimelineHtml.includes('Vigente'));
  assert.ok(currentTimelineHtml.includes('id="step3ReprogramForm"'));
  assert.ok(currentTimelineHtml.includes('Guardar Reprogramación #3'));
  assertCleanZeroUuid('DesignacionTipo Current Detail + Reprogram Form', currentTimelineHtml);

  // 3. Certificados tab renders per-cert type selector + quick links to Paso 4 & Paso 8
  const certsTabHtml = renderDesignacionTipoView({
    profile: WORKER_PROFILE,
    state: buildBaseState({
      selectedProgramId: currentProgram.id,
      activeChildTab: 'certificados',
    }),
    ...fixtures,
    tiposCatalog: INITIAL_TIPOS_AUDITORIA_CATALOG,
    referenceIsoDate: '2026-06-01',
  });
  assert.ok(certsTabHtml.includes('Configurar Sitios (Paso 4) →'));
  assert.ok(certsTabHtml.includes('Ir a Programa de Cert. (Paso 8) →'));
  assert.ok(certsTabHtml.includes('data-action="change-step3-audit-tipo"'));
  assert.ok(certsTabHtml.includes('FN-QMS-2025-001'));
  assert.ok(certsTabHtml.includes('FN-EMS-2025-002'));
  assertCleanZeroUuid('DesignacionTipo Certificados Tab', certsTabHtml);
});

test('Step 3.3 Creation View (add): Vinculo dropdown excludes LIBRE certs, shows quick link, date toggle & per-cert type matrix', () => {
  const fixtures = buildFixtures();
  const draft = createEmptyStep3NewCycleDraft(
    fixtures.vinculos,
    INITIAL_TIPOS_AUDITORIA_CATALOG,
    '2026-06-01'
  );

  const addMesHtml = renderDesignacionTipoView({
    profile: ADMIN_PROFILE,
    state: buildBaseState({
      isCreating: true,
      newCycleDraft: draft,
    }),
    ...fixtures,
    tiposCatalog: INITIAL_TIPOS_AUDITORIA_CATALOG,
    referenceIsoDate: '2026-06-01',
  });

  assert.ok(addMesHtml.includes('id="step3NewCycleForm"'));
  assert.ok(addMesHtml.includes('id="step3VinculoSelect"'));
  assert.ok(addMesHtml.includes('Planta Santa Cruz Integrado'));
  // LIBRE cert must NOT appear in the Vinculo dropdown options; only the warning banner mentions 1 free cert
  const selectMatch = addMesHtml.match(/<select[^>]*id="step3VinculoSelect"[\s\S]*?<\/select>/);
  assert.ok(selectMatch);
  assert.equal(selectMatch[0].includes('FN-LIBRE-2026-099'), false);
  assert.equal(selectMatch[0].includes(UUID_CERT_FREE), false);

  assert.ok(addMesHtml.includes('Ir a Vínculo →'));
  assert.ok(addMesHtml.includes('data-action="set-step3-create-datemode"'));
  assert.ok(addMesHtml.includes('id="step3CreateMesSelect"'));
  assert.ok(addMesHtml.includes('data-step3-cert-tipo="40000000-0000-0000-0000-000000000001"'));
  assert.ok(addMesHtml.includes('data-step3-cert-tipo="40000000-0000-0000-0000-000000000002"'));
  assertCleanZeroUuid('DesignacionTipo Add Mode (Mes)', addMesHtml);

  const addExactHtml = renderDesignacionTipoView({
    profile: WORKER_PROFILE,
    state: buildBaseState({
      isCreating: true,
      newCycleDraft: { ...draft, dateMode: 'PROGRAMADA_EXACTA' },
    }),
    ...fixtures,
    tiposCatalog: INITIAL_TIPOS_AUDITORIA_CATALOG,
    referenceIsoDate: '2026-06-01',
  });
  assert.ok(addExactHtml.includes('id="step3CreateFechaInicioInput"'));
  assert.ok(addExactHtml.includes('id="step3CreateFechaFinInput"'));
  assertCleanZeroUuid('DesignacionTipo Add Mode (Exacta)', addExactHtml);
});

test('Step 3.3 Strict RBAC: AUDITOR and CLIENT are strictly read-only across list, create-blocked, and detail tabs', () => {
  const fixtures = buildFixtures();
  const currentProgram = fixtures.programs[0];

  for (const readOnlyProfile of [AUDITOR_PROFILE, CLIENT_PROFILE]) {
    // Even if isCreating: true in state, non-staff cannot enter creation form
    const listHtml = renderDesignacionTipoView({
      profile: readOnlyProfile,
      state: buildBaseState({ isCreating: true }),
      ...fixtures,
      tiposCatalog: INITIAL_TIPOS_AUDITORIA_CATALOG,
      referenceIsoDate: '2026-06-01',
    });
    assert.equal(listHtml.includes('id="step3NewCycleForm"'), false);
    assert.equal(listHtml.includes('data-action="open-create-step3-cycle"'), false);
    assert.equal(listHtml.includes('id="showArchivedCheckbox"'), false);
    assertCleanZeroUuid(`DesignacionTipo RBAC List (${readOnlyProfile.role})`, listHtml);

    const detailFechasHtml = renderDesignacionTipoView({
      profile: readOnlyProfile,
      state: buildBaseState({
        selectedProgramId: currentProgram.id,
        activeChildTab: 'fechas',
        isReprogramming: true,
        isEditingAttributes: true,
      }),
      ...fixtures,
      tiposCatalog: INITIAL_TIPOS_AUDITORIA_CATALOG,
      referenceIsoDate: '2026-06-01',
    });
    assert.equal(detailFechasHtml.includes('id="openStep3ReprogramBtn"'), false);
    assert.equal(detailFechasHtml.includes('id="step3ReprogramForm"'), false);
    assert.equal(detailFechasHtml.includes('id="startEditStep3ProgramBtn"'), false);
    assert.equal(detailFechasHtml.includes('id="step3EditProgramForm"'), false);
    assertCleanZeroUuid(`DesignacionTipo RBAC Detail Fechas (${readOnlyProfile.role})`, detailFechasHtml);

    const detailCertsHtml = renderDesignacionTipoView({
      profile: readOnlyProfile,
      state: buildBaseState({
        selectedProgramId: currentProgram.id,
        activeChildTab: 'certificados',
      }),
      ...fixtures,
      tiposCatalog: INITIAL_TIPOS_AUDITORIA_CATALOG,
      referenceIsoDate: '2026-06-01',
    });
    assert.equal(detailCertsHtml.includes('data-action="change-step3-audit-tipo"'), false);
    assert.ok(detailCertsHtml.includes('Seguimiento 1'));
    assertCleanZeroUuid(`DesignacionTipo RBAC Detail Certs (${readOnlyProfile.role})`, detailCertsHtml);
  }
});
