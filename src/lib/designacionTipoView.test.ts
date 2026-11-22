import test from 'node:test';
import assert from 'node:assert/strict';

import type { UserProfile } from './healthCheck';
import type { OrganizacionEntity } from './activeCertificates';
import type { ConglomeradoEntity } from './conglomeradoDomain';
import { INITIAL_TIPOS_AUDITORIA_CATALOG } from './extraDomain';
import type { ProgramaAuditoriaEntity } from './auditPlanningEngine';
import type { ProgramacionAuditEntity } from './auditExecution';
import type { CertificadoDetailEntity } from './multisiteSampling';
import type { VinculoEntity } from './vinculoDomain';
import { assertZeroUuidExposure } from './zeroUuid';
import {
  DEFAULT_DESIGNACION_TIPO_STATE,
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

const UUID_AUD_NOW_1 = '80000000-0000-0000-0000-000000000001';
const UUID_AUD_NOW_2 = '80000000-0000-0000-0000-000000000002';
const UUID_AUD_FUT_1 = '80000000-0000-0000-0000-000000000003';

function buildBaseState(
  overrides: Partial<DesignacionTipoViewState> = {}
): DesignacionTipoViewState {
  return {
    ...DEFAULT_DESIGNACION_TIPO_STATE,
    ...overrides,
  };
}

function makeDetailedCert(
  id: string,
  numero: string,
  norma: string,
  estatus: 'Activo' | 'Estudio'
): CertificadoDetailEntity {
  return {
    id,
    id_organizacion: UUID_ORG,
    organizacion_nombre: 'Iberometal Componentes S.A.',
    organizacion_rif: 'J-30123456-7',
    numero_certificado: numero,
    id_norma: '10000000-0000-0000-0000-000000000001',
    norma_codigo: norma,
    norma_titulo: norma,
    id_estatus: '10000000-0000-0000-0000-000000000011',
    estatus,
    sector_iaf: 17,
    sector_iaf_descripcion: 'Metales básicos',
    subsector_iaf_descripcion: 'Componentes metálicos',
    alcance: 'Manufactura de piezas metálicas',
    fecha_emision: '2025-01-01',
    fecha_vencimiento: '2028-01-01',
    sitios: [],
    procesos: [],
    turnos: [],
    audit_history: [],
    no_aplicables: [],
    audit_days_allocation: [],
    fechas_certificado: [],
    contactos_certificado: [],
  };
}

function buildFixtures(): {
  conglomerados: ConglomeradoEntity[];
  organizaciones: OrganizacionEntity[];
  certificados: CertificadoDetailEntity[];
  vinculos: VinculoEntity[];
  programs: ProgramaAuditoriaEntity[];
  audits: ProgramacionAuditEntity[];
} {
  const conglomerados: ConglomeradoEntity[] = [
    {
      id: UUID_GRUPO,
      codigo_grupo: 'GRP-001',
      nombre: 'Grupo Industrial Iberometal',
      es_individual_auto: false,
      descripcion: 'Grupo industrial matriz.',
      notas: null,
      organizaciones_count: 1,
      certificados_count: 3,
      deleted_at: null,
    },
  ];

  const organizaciones: OrganizacionEntity[] = [
    {
      id: UUID_ORG,
      id_grupo_empresarial: UUID_GRUPO,
      nombre: 'Iberometal Componentes S.A.',
      rif: 'J-30123456-7',
      sector_iaf: 17,
      alcance: 'Manufactura de piezas metálicas',
      estatus_cert: 'Activo',
      total_sitios: 1,
      total_personal: 100,
      certificados_activos: 2,
      deleted_at: null,
    },
  ];

  const certificados: CertificadoDetailEntity[] = [
    makeDetailedCert(UUID_CERT_1, 'FN-QMS-2025-001', 'ISO 9001:2015', 'Activo'),
    makeDetailedCert(UUID_CERT_2, 'FN-EMS-2025-002', 'ISO 14001:2015', 'Activo'),
    makeDetailedCert(UUID_CERT_FREE, 'FN-LIBRE-2026-099', 'ISO 45001:2018', 'Estudio'),
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
    id: UUID_AUD_NOW_1,
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
    tiene_sitio_temporal: false,
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

  const audNow1 = makeAudit({
    id: UUID_AUD_NOW_1,
    id_programa_auditoria: '7a000000-0000-0000-0000-000000000001',
    codigo_auditoria: 'AUD-2026-QMS',
    id_certificado: UUID_CERT_1,
    numero_certificado: 'FN-QMS-2025-001',
    norma_codigo: 'ISO 9001:2015',
    id_tipo_auditoria: TIPO_SEG1.id,
    tipo_auditoria: TIPO_SEG1.tipo,
    fechas: [
      {
        id: '81000000-0000-0000-0000-000000000002',
        id_auditoria: UUID_AUD_NOW_1,
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
  });

  const audNow2 = makeAudit({
    id: UUID_AUD_NOW_2,
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
        id_auditoria: UUID_AUD_NOW_2,
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
  });

  const audFut = makeAudit({
    id: UUID_AUD_FUT_1,
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
        id_auditoria: UUID_AUD_FUT_1,
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
    auditorias: [audNow1, audNow2],
  };

  const futureProgram: ProgramaAuditoriaEntity = {
    id: '7a000000-0000-0000-0000-000000000002',
    id_vinculo: UUID_VINCULO,
    id_grupo_empresarial: UUID_GRUPO,
    codigo_programa: 'PROG-2028-001',
    etiqueta: 'Ciclo Trienal Renovación 2028',
    nivel_vinculacion: 'NIVEL_1_INTRA_ORG',
    tipo_vinculacion: 'Integrada',
    es_vinculada: false,
    tiene_sitio_temporal: false,
    notas: 'Preprogramado a +2 años.',
    deleted_at: null,
    auditorias: [audFut],
  };

  return {
    conglomerados,
    organizaciones,
    certificados,
    vinculos,
    programs: [imminentProgram, futureProgram],
    audits: [audNow1, audNow2, audFut],
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

test('Tipo Refactor Multi View: Certificate-Based, no preset bar clutter, Estatus Cert., compact link badge, <colgroup>=100%, 0 <button> in <tbody>, Zero-UUID', () => {
  const fx = buildFixtures();

  const listHtml = renderDesignacionTipoView({
    profile: ADMIN_PROFILE,
    state: buildBaseState(),
    ...fx,
    tiposCatalog: INITIAL_TIPOS_AUDITORIA_CATALOG,
    referenceIsoDate: '2026-06-01',
    headerAddAuditHtml: '<button type="button" data-action="open-add-audit-wizard">+ Auditoría</button>',
  });

  // Stripped obsolete preset bar & legacy create controls
  assert.equal(listHtml.includes('open-create-step3-cycle'), false);
  assert.equal(listHtml.includes('step3NewCycleForm'), false);
  assert.equal(listHtml.includes('set-designacion-tipo-preset'), false);
  assert.equal(listHtml.includes('Lote ('), false);

  assert.ok(listHtml.includes('data-action="open-add-audit-wizard"'));
  assert.ok(listHtml.includes('data-mv-domain="designacion-tipo"'));
  assert.ok(listHtml.includes('FN-QMS-2025-001'));
  assert.ok(listHtml.includes('FN-EMS-2025-002'));
  assert.ok(listHtml.includes('FN-LIBRE-2026-099'));
  assert.ok(listHtml.includes('Estatus Cert.'));
  assert.ok(listHtml.includes('Integ. (2)'));
  assert.ok(listHtml.includes('title="Integrada (2 certificados)"'));

  // 5-col table-fixed colgroup summing 100%, 0 <button> in <tbody>
  assert.ok(listHtml.includes('table-fixed'));
  const colWidths = [...listHtml.matchAll(/<col\b[^>]*style="width:\s*([\d.]+)%/g)].map((m) =>
    Number(m[1])
  );
  assert.equal(colWidths.length, 5);
  assert.equal(
    colWidths.reduce((acc, n) => acc + n, 0),
    100
  );
  const tbodyMatch = listHtml.match(/<tbody[\s\S]*?<\/tbody>/i);
  assert.ok(tbodyMatch);
  assert.equal(/<button\b/i.test(tbodyMatch[0]), false);
  assert.ok(tbodyMatch[0].includes('data-action="select-section-cert"'));
  assertCleanZeroUuid('DesignacionTipo Multi View', listHtml);

  // Grid mode & reactive estatus_certificado facet filtering
  const gridFilteredHtml = renderDesignacionTipoView({
    profile: ADMIN_PROFILE,
    state: buildBaseState({
      viewMode: 'grid',
      facetSelections: { estatus_certificado: new Set(['Estudio']) },
    }),
    ...fx,
    tiposCatalog: INITIAL_TIPOS_AUDITORIA_CATALOG,
    referenceIsoDate: '2026-06-01',
  });
  assert.ok(gridFilteredHtml.includes('FN-LIBRE-2026-099'));
  assert.equal(gridFilteredHtml.includes('FN-QMS-2025-001'), false);
  assertCleanZeroUuid('DesignacionTipo Grid Filtered View', gridFilteredHtml);
});

test('Tipo Refactor Detail View: compactMode shell, stripped history clutter, #designacion-tipo-detail-table with independent per-audit Tipo selects', () => {
  const fx = buildFixtures();

  // 1. Linked batch audit detail view renders compactMode shell + linked siblings bar + clean table with independent selects per audit
  const detailHtml = renderDesignacionTipoView({
    profile: WORKER_PROFILE,
    state: buildBaseState({
      selectedCertId: UUID_CERT_1,
      selectedAuditId: UUID_AUD_NOW_1,
    }),
    ...fx,
    tiposCatalog: INITIAL_TIPOS_AUDITORIA_CATALOG,
    referenceIsoDate: '2026-06-01',
    headerAddAuditHtml: '<button type="button" data-action="open-add-audit-wizard">+ Auditoría</button>',
  });

  assert.ok(detailHtml.includes('data-action="select-section-audit"'));
  assert.ok(detailHtml.includes('data-action="step-section-audit"'));
  assert.ok(detailHtml.includes('data-linked-siblings-bar="true"'));
  assert.ok(detailHtml.includes('data-action="select-linked-sibling-audit"'));
  assert.ok(detailHtml.includes('id="designacion-tipo-detail-table"'));
  assert.ok(detailHtml.includes('AUD-2026-QMS'));
  assert.ok(detailHtml.includes('AUD-2026-EMS'));

  // Clutter from pre-refactor detail view is gone
  assert.equal(detailHtml.includes('data-testid="cert-audit-history-section"'), false);
  assert.equal(detailHtml.includes('Configurar Fechas en Lote'), false);
  assert.equal(detailHtml.includes('Ver historial de este cert.'), false);
  assert.equal(detailHtml.includes('data-testid="future-cycle-warning-banner"'), false);

  // Table integrity: table-fixed, <colgroup>=100%, 0 <button> in <tbody>, 2 independent <select> controls (one per linked audit)
  const detailTableMatch = detailHtml.match(
    /<table id="designacion-tipo-detail-table"[\s\S]*?<\/table>/i
  );
  assert.ok(detailTableMatch);
  const colWidths = [
    ...detailTableMatch[0].matchAll(/<col\b[^>]*style="width:\s*([\d.]+)%/g),
  ].map((m) => Number(m[1]));
  assert.equal(colWidths.length, 3);
  assert.equal(
    colWidths.reduce((acc, n) => acc + n, 0),
    100
  );
  const detailTbodyMatch = detailTableMatch[0].match(/<tbody[\s\S]*?<\/tbody>/i);
  assert.ok(detailTbodyMatch);
  assert.equal(/<button\b/i.test(detailTbodyMatch[0]), false);

  const selectIds = [
    ...detailTbodyMatch[0].matchAll(/data-action="change-step3-audit-tipo"\s+data-audit-id="([^"]+)"/g),
  ].map((m) => m[1]);
  assert.equal(selectIds.length, 2);
  assert.ok(selectIds.includes(UUID_AUD_NOW_1));
  assert.ok(selectIds.includes(UUID_AUD_NOW_2));

  // Verify each audit's select preserves its own distinct selected type (Seguimiento 1 vs Seguimiento 2)
  const qmsSelectMatch = detailTbodyMatch[0].match(
    new RegExp(`<select[^>]*id="step3InlineTipo_${UUID_AUD_NOW_1}"[\\s\\S]*?<\\/select>`, 'i')
  );
  const emsSelectMatch = detailTbodyMatch[0].match(
    new RegExp(`<select[^>]*id="step3InlineTipo_${UUID_AUD_NOW_2}"[\\s\\S]*?<\\/select>`, 'i')
  );
  assert.ok(qmsSelectMatch && qmsSelectMatch[0].includes(`value="${TIPO_SEG1.id}" selected`));
  assert.ok(emsSelectMatch && emsSelectMatch[0].includes(`value="${TIPO_SEG2.id}" selected`));

  assertCleanZeroUuid('DesignacionTipo Detail View', detailHtml);

  // 2. Selecting the future individual audit hides linked siblings bar and triggers future-cycle-warning-banner
  const futureHtml = renderDesignacionTipoView({
    profile: ADMIN_PROFILE,
    state: buildBaseState({
      selectedCertId: UUID_CERT_1,
      selectedAuditId: UUID_AUD_FUT_1,
    }),
    ...fx,
    tiposCatalog: INITIAL_TIPOS_AUDITORIA_CATALOG,
    referenceIsoDate: '2026-06-01',
  });
  assert.ok(futureHtml.includes('data-testid="future-cycle-warning-banner"'));
  assert.ok(futureHtml.includes('2028'));
  assert.equal(futureHtml.includes('data-linked-siblings-bar="true"'), false);
  assertCleanZeroUuid('DesignacionTipo Future Audit Detail', futureHtml);

  // 3. Certificate with 0 audits renders empty audit state cleanly
  const emptyCertHtml = renderDesignacionTipoView({
    profile: ADMIN_PROFILE,
    state: buildBaseState({ selectedCertId: UUID_CERT_FREE }),
    ...fx,
    tiposCatalog: INITIAL_TIPOS_AUDITORIA_CATALOG,
    referenceIsoDate: '2026-06-01',
  });
  assert.ok(emptyCertHtml.includes('Sin auditorías registradas'));
  assert.ok(emptyCertHtml.includes('FN-LIBRE-2026-099'));
  assertCleanZeroUuid('DesignacionTipo Empty Cert Detail', emptyCertHtml);
});

test('Tipo Refactor Strict RBAC: AUDITOR and CLIENT are strictly read-only', () => {
  const fx = buildFixtures();

  for (const readOnlyProfile of [AUDITOR_PROFILE, CLIENT_PROFILE]) {
    const detailHtml = renderDesignacionTipoView({
      profile: readOnlyProfile,
      state: buildBaseState({
        selectedCertId: UUID_CERT_1,
        selectedAuditId: UUID_AUD_NOW_1,
      }),
      ...fx,
      tiposCatalog: INITIAL_TIPOS_AUDITORIA_CATALOG,
      referenceIsoDate: '2026-06-01',
      headerAddAuditHtml: '<button type="button" data-action="open-add-audit-wizard">+ Auditoría</button>',
    });
    assert.ok(detailHtml.includes('Solo lectura'));
    assert.equal(detailHtml.includes('data-action="change-step3-audit-tipo"'), false);
    assert.ok(detailHtml.includes('Seguimiento 1'));
    assert.ok(detailHtml.includes('Seguimiento 2'));
    assertCleanZeroUuid(`DesignacionTipo RBAC (${readOnlyProfile.role})`, detailHtml);
  }
});
