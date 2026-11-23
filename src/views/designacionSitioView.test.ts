import test from 'node:test';
import assert from 'node:assert/strict';

import type { UserProfile } from '../lib/healthCheck';
import type { ConglomeradoEntity } from '../lib/conglomeradoDomain';
import type { ProgramaAuditoriaEntity } from '../lib/auditPlanningEngine';
import type { ProgramacionAuditEntity } from '../lib/auditExecution';
import type { VinculoEntity } from '../lib/vinculoDomain';
import type { CertificadoDetailEntity } from '../lib/multisiteSampling';
import { assertZeroUuidExposure } from '../lib/zeroUuid';
import {
  DEFAULT_DESIGNACION_SITIO_STATE,
  renderDesignacionSitioView,
  type DesignacionSitioViewState,
} from './designacionSitioView';

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
const UUID_CERT_QMS = '40000000-0000-0000-0000-000000000001';
const UUID_CERT_EMS = '40000000-0000-0000-0000-000000000002';
const UUID_CERT_OHSAS = '40000000-0000-0000-0000-000000000003';
const UUID_VINCULO = '7c000000-0000-0000-0000-000000000001';

const UUID_SITIO_0 = '50000000-0000-0000-0000-000000000000';
const UUID_SITIO_1 = '50000000-0000-0000-0000-000000000001';
const UUID_SITIO_2_SHARED = '50000000-0000-0000-0000-000000000002';
const UUID_SITIO_3 = '50000000-0000-0000-0000-000000000003';

const UUID_PROG_NOW = '7a000000-0000-0000-0000-000000000001';
const UUID_PROG_FUTURE = '7a000000-0000-0000-0000-000000000002';

const UUID_AUDIT_2024 = '80000000-0000-0000-0000-000000002024';
const UUID_AUDIT_2025 = '80000000-0000-0000-0000-000000002025';
const UUID_AUDIT_2026_QMS = '80000000-0000-0000-0000-000000002026';
const UUID_AUDIT_2026_EMS = '80000000-0000-0000-0000-000000002126';
const UUID_AUDIT_2026_OHSAS = '80000000-0000-0000-0000-000000002226';
const UUID_AUDIT_2028_FUT = '80000000-0000-0000-0000-000000002028';

function buildBaseState(
  overrides: Partial<DesignacionSitioViewState> = {}
): DesignacionSitioViewState {
  return {
    ...DEFAULT_DESIGNACION_SITIO_STATE,
    ...overrides,
  };
}

function makeSitioPlan(
  id: string,
  auditId: string,
  siteId: string,
  num: number,
  nombre: string
) {
  return {
    id,
    id_auditoria: auditId,
    id_sitio: siteId,
    numero_sitio: num,
    nombre_sitio: nombre,
    direccion_sitio: 'Av. Industrial',
    modalidad_evaluacion: 'Presencial' as const,
    tiempo_auditoria: 1,
    fecha_inicio: null,
    fecha_fin: null,
    notas_sitio: null,
    deleted_at: null,
    procesos: [],
    equipoSitio: [],
  };
}

function makeAudit(overrides: Partial<ProgramacionAuditEntity>): ProgramacionAuditEntity {
  return {
    id: UUID_AUDIT_2026_QMS,
    id_programa_auditoria: UUID_PROG_NOW,
    codigo_auditoria: 'AUD-2026-001',
    id_certificado: UUID_CERT_QMS,
    numero_certificado: 'FN-QMS-2026-001',
    id_organizacion: UUID_ORG,
    organizacion_nombre: 'Iberometal Componentes S.A.',
    norma_codigo: 'ISO 9001:2015',
    id_tipo_auditoria: '11000000-0000-0000-0000-000000000003',
    tipo_auditoria: 'Seguimiento 1',
    metodologia: 'Presencial',
    fecha_inicio: '2026-06-15',
    fecha_fin: '2026-06-17',
    dias_auditor: 2,
    tiempo_auditoria: 2,
    estado_ciclo: 'Programada',
    estatus_ejecucion: 'Programada',
    tiene_sitio_temporal: false,
    objetivo: 'Seguimiento anual de sedes.',
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
  };
}

function buildFixtures(): {
  conglomerados: ConglomeradoEntity[];
  vinculos: VinculoEntity[];
  certificados: CertificadoDetailEntity[];
  allAudits: ProgramacionAuditEntity[];
  programs: ProgramaAuditoriaEntity[];
} {
  const conglomerados: ConglomeradoEntity[] = [
    {
      id: UUID_GRUPO,
      codigo_grupo: 'GRP-001',
      nombre: 'Grupo Industrial Iberometal',
      es_individual_auto: false,
      descripcion: 'Matriz industrial.',
      notas: null,
      organizaciones_count: 1,
      certificados_count: 3,
      deleted_at: null,
    },
  ];

  const vinculos: VinculoEntity[] = [
    {
      id: UUID_VINCULO,
      id_grupo_empresarial: UUID_GRUPO,
      grupo_nombre: 'Grupo Industrial Iberometal',
      codigo_vinculo: 'VINC-N1-01',
      etiqueta: 'Planta Santa Cruz Integrada',
      nivel_vinculacion: 'NIVEL_1_INTRA_ORG',
      tipo_vinculacion: 'Integrada',
      es_vinculada: true,
      tiene_sitio_temporal: false,
      notas: null,
      deleted_at: null,
      certificados: [],
    },
  ];

  const certificados: CertificadoDetailEntity[] = [
    {
      id: UUID_CERT_QMS,
      id_organizacion: UUID_ORG,
      organizacion_nombre: 'Iberometal Componentes S.A.',
      organizacion_rif: 'J-30123456-7',
      numero_certificado: 'FN-QMS-2026-001',
      id_norma: '10000000-0000-0000-0000-000000000001',
      norma_codigo: 'ISO 9001:2015',
      norma_titulo: 'ISO 9001:2015',
      id_estatus: '10000000-0000-0000-0000-000000000011',
      estatus: 'Activo',
      sector_iaf: 17,
      sector_iaf_descripcion: 'Metales básicos y productos metálicos elaborados',
      subsector_iaf_descripcion: 'Componentes metálicos',
      alcance: 'Manufactura industrial',
      fecha_emision: '2025-01-01',
      fecha_vencimiento: '2028-01-01',
      sitios: [
        {
          id: UUID_SITIO_3,
          id_certificado: UUID_CERT_QMS,
          numero_sitio: 3,
          nombre_sitio: 'Almacén Puerto Ordaz',
          direccion_sitio: 'Zona Franca Sur',
          tipo_sitio: 'Almacén',
          personal_count: 18,
        },
        {
          id: UUID_SITIO_2_SHARED,
          id_certificado: UUID_CERT_QMS,
          numero_sitio: 2,
          nombre_sitio: 'Planta Ambiental Oriente',
          direccion_sitio: 'Zona Industrial Maturín',
          tipo_sitio: 'Planta Operativa',
          personal_count: 35,
          sharedFromCertId: UUID_CERT_EMS,
          sharedFromCertLabel: 'FN-EMS-2026-002',
        },
        {
          id: UUID_SITIO_1,
          id_certificado: UUID_CERT_QMS,
          numero_sitio: 1,
          nombre_sitio: 'Centro Logístico Occidente',
          direccion_sitio: 'Av. Circunvalación Norte · Valencia',
          tipo_sitio: 'Centro Logístico',
          personal_count: 48,
        },
        {
          id: UUID_SITIO_0,
          id_certificado: UUID_CERT_QMS,
          numero_sitio: 0,
          nombre_sitio: 'Sede Principal Santa Cruz',
          direccion_sitio: 'Av. Principal Industrial 100 · Santa Cruz',
          tipo_sitio: 'Principal (HQ)',
          personal_count: 120,
        },
      ],
      procesos: [],
      turnos: [],
      audit_history: [],
      no_aplicables: [],
      audit_days_allocation: [],
      fechas_certificado: [],
      contactos_certificado: [],
    },
    {
      id: UUID_CERT_EMS,
      id_organizacion: UUID_ORG,
      organizacion_nombre: 'Iberometal Componentes S.A.',
      organizacion_rif: 'J-30123456-7',
      numero_certificado: 'FN-EMS-2026-002',
      id_norma: '10000000-0000-0000-0000-000000000002',
      norma_codigo: 'ISO 14001:2015',
      norma_titulo: 'ISO 14001:2015',
      id_estatus: '10000000-0000-0000-0000-000000000011',
      estatus: 'Activo',
      sector_iaf: 17,
      sector_iaf_descripcion: 'Metales básicos',
      subsector_iaf_descripcion: 'Componentes metálicos',
      alcance: 'Manufactura industrial',
      fecha_emision: '2025-01-01',
      fecha_vencimiento: '2028-01-01',
      sitios: [
        {
          id: UUID_SITIO_2_SHARED,
          id_certificado: UUID_CERT_EMS,
          numero_sitio: 0,
          nombre_sitio: 'Planta Ambiental Oriente',
          direccion_sitio: 'Zona Industrial Maturín',
          tipo_sitio: 'Principal (HQ)',
          personal_count: 35,
        },
      ],
      procesos: [],
      turnos: [],
      audit_history: [],
      no_aplicables: [],
      audit_days_allocation: [],
      fechas_certificado: [],
      contactos_certificado: [],
    },
    {
      id: UUID_CERT_OHSAS,
      id_organizacion: UUID_ORG,
      organizacion_nombre: 'Iberometal Componentes S.A.',
      organizacion_rif: 'J-30123456-7',
      numero_certificado: 'FN-OHS-2026-003',
      id_norma: '10000000-0000-0000-0000-000000000003',
      norma_codigo: 'ISO 45001:2018',
      norma_titulo: 'ISO 45001:2018',
      id_estatus: '10000000-0000-0000-0000-000000000011',
      estatus: 'Activo',
      sector_iaf: 17,
      sector_iaf_descripcion: 'Metales básicos',
      subsector_iaf_descripcion: 'Componentes metálicos',
      alcance: 'Manufactura industrial',
      fecha_emision: '2025-01-01',
      fecha_vencimiento: '2028-01-01',
      sitios: [
        {
          id: '50000000-0000-0000-0000-000000000020',
          id_certificado: UUID_CERT_OHSAS,
          numero_sitio: 0,
          nombre_sitio: 'Sede Principal SST',
          direccion_sitio: 'Av. Principal Industrial 100',
          tipo_sitio: 'Principal (HQ)',
          personal_count: 120,
        },
      ],
      procesos: [],
      turnos: [],
      audit_history: [],
      no_aplicables: [],
      audit_days_allocation: [],
      fechas_certificado: [],
      contactos_certificado: [],
    },
  ];

  const audit2024 = makeAudit({
    id: UUID_AUDIT_2024,
    id_programa_auditoria: null,
    codigo_auditoria: 'AUD-2024-001',
    tipo_auditoria: 'Seguimiento 2',
    fecha_inicio: '2024-05-16',
    fecha_fin: '2024-05-17',
    estado_ciclo: 'Cerrada',
    estatus_ejecucion: 'Auditada',
    sitiosPlan: [
      makeSitioPlan('61000000-0000-0000-0000-000000002024', UUID_AUDIT_2024, UUID_SITIO_0, 0, 'Sede Principal Santa Cruz'),
      makeSitioPlan('61000000-0000-0000-0000-000000012024', UUID_AUDIT_2024, UUID_SITIO_1, 1, 'Centro Logístico Occidente'),
    ],
  });

  const audit2025 = makeAudit({
    id: UUID_AUDIT_2025,
    id_programa_auditoria: null,
    codigo_auditoria: 'AUD-2025-001',
    tipo_auditoria: 'Renovación',
    fecha_inicio: '2025-05-18',
    fecha_fin: '2025-05-20',
    estado_ciclo: 'Cerrada',
    estatus_ejecucion: 'Auditada',
    sitiosPlan: [
      makeSitioPlan('61000000-0000-0000-0000-000000002025', UUID_AUDIT_2025, UUID_SITIO_0, 0, 'Sede Principal Santa Cruz'),
      makeSitioPlan('61000000-0000-0000-0000-000000022025', UUID_AUDIT_2025, UUID_SITIO_2_SHARED, 2, 'Planta Ambiental Oriente'),
    ],
  });

  const audit2026Qms = makeAudit({
    id: UUID_AUDIT_2026_QMS,
    id_programa_auditoria: UUID_PROG_NOW,
    codigo_auditoria: 'AUD-2026-NOW',
    tipo_auditoria: 'Seguimiento 1',
    fecha_inicio: '2026-06-15',
    fecha_fin: '2026-06-17',
    sitiosPlan: [
      makeSitioPlan('61000000-0000-0000-0000-000000002026', UUID_AUDIT_2026_QMS, UUID_SITIO_0, 0, 'Sede Principal Santa Cruz'),
    ],
    fechas: [
      {
        id: '81000000-0000-0000-0000-000000002026',
        id_auditoria: UUID_AUDIT_2026_QMS,
        numero_secuencia: 1,
        tag: 'Programación',
        tipo_fecha: 'PROGRAMADA_EXACTA',
        anio: null,
        mes: null,
        fecha_inicio: '2026-06-15',
        fecha_fin: '2026-06-17',
        observacion: 'Programación vigente.',
        deleted_at: null,
      },
    ],
  });

  const audit2026Ems = makeAudit({
    id: UUID_AUDIT_2026_EMS,
    id_programa_auditoria: UUID_PROG_NOW,
    id_certificado: UUID_CERT_EMS,
    numero_certificado: 'FN-EMS-2026-002',
    norma_codigo: 'ISO 14001:2015',
    codigo_auditoria: 'AUD-2026-EMS',
    tipo_auditoria: 'Seguimiento 1',
    sitiosPlan: [
      makeSitioPlan('61000000-0000-0000-0000-000000002126', UUID_AUDIT_2026_EMS, UUID_SITIO_2_SHARED, 0, 'Planta Ambiental Oriente'),
    ],
  });

  const audit2026Ohsas = makeAudit({
    id: UUID_AUDIT_2026_OHSAS,
    id_programa_auditoria: UUID_PROG_NOW,
    id_certificado: UUID_CERT_OHSAS,
    numero_certificado: 'FN-OHS-2026-003',
    norma_codigo: 'ISO 45001:2018',
    codigo_auditoria: 'AUD-2026-OHS',
    tipo_auditoria: 'Seguimiento 1',
    sitiosPlan: [
      makeSitioPlan('61000000-0000-0000-0000-000000002226', UUID_AUDIT_2026_OHSAS, '50000000-0000-0000-0000-000000000020', 0, 'Sede Principal SST'),
    ],
  });

  const audit2028Future = makeAudit({
    id: UUID_AUDIT_2028_FUT,
    id_programa_auditoria: UUID_PROG_FUTURE,
    codigo_auditoria: 'AUD-2028-FUT',
    tipo_auditoria: 'Renovación',
    fecha_inicio: '2028-07-01',
    fecha_fin: '2028-07-31',
    estado_ciclo: 'Borrador',
    sitiosPlan: [
      makeSitioPlan('61000000-0000-0000-0000-000000002028', UUID_AUDIT_2028_FUT, UUID_SITIO_0, 0, 'Sede Principal Santa Cruz'),
      makeSitioPlan('61000000-0000-0000-0000-000000012028', UUID_AUDIT_2028_FUT, UUID_SITIO_1, 1, 'Centro Logístico Occidente'),
    ],
    fechas: [
      {
        id: '81000000-0000-0000-0000-000000002028',
        id_auditoria: UUID_AUDIT_2028_FUT,
        numero_secuencia: 1,
        tag: 'Programación',
        tipo_fecha: 'PREPROGRAMADA_MES',
        anio: 2028,
        mes: 7,
        fecha_inicio: null,
        fecha_fin: null,
        observacion: 'Renovación ciclo futuro +2 años.',
        deleted_at: null,
      },
    ],
  });

  const linkedProgram: ProgramaAuditoriaEntity = {
    id: UUID_PROG_NOW,
    id_vinculo: UUID_VINCULO,
    id_grupo_empresarial: UUID_GRUPO,
    codigo_programa: 'PROG-2026-SIT',
    etiqueta: 'Campaña Integrada 2026',
    nivel_vinculacion: 'NIVEL_1_INTRA_ORG',
    tipo_vinculacion: 'Integrada',
    es_vinculada: true,
    tiene_sitio_temporal: false,
    notas: null,
    deleted_at: null,
    auditorias: [audit2026Qms, audit2026Ems, audit2026Ohsas],
  };

  const futureProgram: ProgramaAuditoriaEntity = {
    id: UUID_PROG_FUTURE,
    id_vinculo: UUID_VINCULO,
    id_grupo_empresarial: UUID_GRUPO,
    codigo_programa: 'PROG-2028-FUT',
    etiqueta: 'Campaña Futura 2028',
    nivel_vinculacion: 'NIVEL_1_INTRA_ORG',
    tipo_vinculacion: 'Individual',
    es_vinculada: false,
    tiene_sitio_temporal: false,
    notas: null,
    deleted_at: null,
    auditorias: [audit2028Future],
  };

  return {
    conglomerados,
    vinculos,
    certificados,
    allAudits: [
      audit2024,
      audit2025,
      audit2026Qms,
      audit2026Ems,
      audit2026Ohsas,
      audit2028Future,
    ],
    programs: [linkedProgram, futureProgram],
  };
}

test('Step 2.2 Multi View: table-fixed, <colgroup>=100%, 0 <button> inside <tbody>, native + shared counts, and Zero-UUID', () => {
  const fx = buildFixtures();
  const listHtml = renderDesignacionSitioView({
    profile: ADMIN_PROFILE,
    state: buildBaseState(),
    programs: fx.programs,
    allAudits: fx.allAudits,
    vinculos: fx.vinculos,
    conglomerados: fx.conglomerados,
    certificados: fx.certificados,
    referenceIsoDate: '2026-06-05',
  });

  assert.ok(listHtml.includes('data-mv-domain="designacion-sitio"'));
  assert.ok(listHtml.includes('table-fixed'));
  assert.ok(listHtml.includes('2 de 4 sedes'));
  const colWidths = [...listHtml.matchAll(/<col\b[^>]*style="width:\s*([\d.]+)%/g)].map((m) =>
    Number(m[1])
  );
  assert.equal(
    colWidths.reduce((a, b) => a + b, 0),
    100
  );
  const tbodyMatch = listHtml.match(/<tbody[\s\S]*?<\/tbody>/i);
  assert.ok(tbodyMatch);
  assert.equal(/<button\b/i.test(tbodyMatch[0]), false);
  assert.equal(assertZeroUuidExposure(listHtml).compliant, true);
});

test('Step 2.2 Detail View: collapsed by default, renders ONLY 1 active card even with 3 linked siblings, and strips legacy clutter', () => {
  const fx = buildFixtures();
  const detailHtml = renderDesignacionSitioView({
    profile: ADMIN_PROFILE,
    state: buildBaseState({
      selectedCertId: UUID_CERT_QMS,
      selectedAuditId: UUID_AUDIT_2026_QMS,
    }),
    programs: fx.programs,
    allAudits: fx.allAudits,
    vinculos: fx.vinculos,
    conglomerados: fx.conglomerados,
    certificados: fx.certificados,
    referenceIsoDate: '2026-06-05',
  });

  // Top two shell strips preserved
  assert.ok(detailHtml.includes('data-action="select-section-audit"'));
  assert.ok(detailHtml.includes('data-action="step-section-audit"'));
  assert.ok(detailHtml.includes('data-linked-siblings-bar="true"'));
  assert.ok(detailHtml.includes('data-action="select-linked-sibling-audit"'));

  // Legacy toolbar and stacked cards removed
  assert.equal(detailHtml.includes('data-testid="sitio-editor-toolbar"'), false);
  assert.equal(detailHtml.includes('data-testid="sitio-linked-audits-container"'), false);
  assert.equal(detailHtml.includes('Sitios por Auditoría Vinculada'), false);
  assert.equal(detailHtml.includes('Historial y Cobertura Multi-Ciclo'), false);

  // Only 1 active card / section rendered (not all 3 linked siblings stacked)
  const activeCards = [...detailHtml.matchAll(/data-testid="sitio-active-audit-card"/g)];
  assert.equal(activeCards.length, 1);

  const sections = [
    ...detailHtml.matchAll(/data-testid="sitio-audit-section"[^>]*data-audit-id="([^"]+)"/g),
  ].map((m) => m[1]);
  assert.deepEqual(sections, [UUID_AUDIT_2026_QMS]);

  // Collapsed by default: aria-expanded="false", chevron ▶, compact count, Cobertura button, and 0 site rows rendered
  const toggleBtnMatch = detailHtml.match(
    /<button[^>]*data-action="toggle-sitio-panel-collapse"[^>]*>/
  );
  assert.ok(toggleBtnMatch);
  assert.ok(toggleBtnMatch[0].includes('aria-expanded="false"'));
  assert.ok(detailHtml.includes('▶'));
  assert.ok(detailHtml.includes('1 / 4 sitios'));
  assert.ok(detailHtml.includes('data-action="open-sitio-coverage-modal"'));
  assert.ok(detailHtml.includes('>Cobertura<') || detailHtml.includes('Cobertura'));
  assert.equal(detailHtml.includes('data-testid="sitio-assignment-row"'), false);
  assert.equal(detailHtml.includes('id="sitioDetailFilterSelect"'), false);
  assert.equal(detailHtml.includes('id="sitioDetailSortSelect"'), false);
  assert.equal(assertZeroUuidExposure(detailHtml).compliant, true);
});

test('Step 2.2 Expanded Card: renders filter <select>, sort <select>, shared site metadata, conditional integer N input, LINK_SELECTED, and quick search for 8+ sites', () => {
  const fx = buildFixtures();

  // Expanded with default filter ALL: #sitioNotAuditedLastNInput MUST NOT be rendered
  const expandedAllHtml = renderDesignacionSitioView({
    profile: ADMIN_PROFILE,
    state: buildBaseState({
      selectedCertId: UUID_CERT_QMS,
      selectedAuditId: UUID_AUDIT_2026_QMS,
      isSitePanelExpandedByAuditId: { [UUID_AUDIT_2026_QMS]: true },
      detailFilterMode: 'ALL',
      detailSortMode: 'SITE_NUMBER',
    }),
    programs: fx.programs,
    allAudits: fx.allAudits,
    vinculos: fx.vinculos,
    conglomerados: fx.conglomerados,
    certificados: fx.certificados,
    referenceIsoDate: '2026-06-05',
  });

  const toggleBtn = expandedAllHtml.match(
    /<button[^>]*data-action="toggle-sitio-panel-collapse"[^>]*>/
  );
  assert.ok(toggleBtn && toggleBtn[0].includes('aria-expanded="true"'));
  assert.ok(expandedAllHtml.includes('▼'));
  assert.ok(expandedAllHtml.includes('id="sitioDetailFilterSelect"'));
  assert.ok(expandedAllHtml.includes('data-action="change-sitio-detail-filter"'));
  assert.ok(expandedAllHtml.includes('id="sitioDetailSortSelect"'));
  assert.ok(expandedAllHtml.includes('data-action="change-sitio-detail-sort"'));
  assert.ok(expandedAllHtml.includes('Mostrando 4 de 4'));
  assert.equal(expandedAllHtml.includes('id="sitioNotAuditedLastNInput"'), false);
  assert.equal(expandedAllHtml.includes('id="sitioDetailQuickSearch"'), false);

  // All 7 filter options present when linked siblings > 1 and shared sites >= 1
  for (const val of [
    'ALL',
    'SELECTED',
    'UNSELECTED',
    'LINK_SELECTED',
    'NOT_AUDITED_LAST_N',
    'SHARED_ONLY',
    'UNVISITED_CYCLE',
  ]) {
    assert.ok(expandedAllHtml.includes(`value="${val}"`));
  }

  // Rows ordered by SITE_NUMBER [0, 1, 2, 3], including shared site #2 with Compartido + personalCount + Sitio 0 locked
  const rowNums = [
    ...expandedAllHtml.matchAll(/data-testid="sitio-assignment-row"[^>]*data-site-number="(\d+)"/g),
  ].map((m) => Number(m[1]));
  assert.deepEqual(rowNums, [0, 1, 2, 3]);
  assert.ok(expandedAllHtml.includes('Compartido'));
  assert.ok(expandedAllHtml.includes('Compartido desde FN-EMS-2026-002'));
  assert.ok(expandedAllHtml.includes('35 pers.'));
  assert.ok(expandedAllHtml.includes('🔒 HQ'));
  assert.ok(expandedAllHtml.includes('en vínculo'));

  const sitio0Chk = expandedAllHtml.match(
    new RegExp(`<input[^>]*id="step4SiteChk_${UUID_AUDIT_2026_QMS}_${UUID_SITIO_0}"[^>]*>`)
  );
  assert.ok(sitio0Chk && sitio0Chk[0].includes('checked') && sitio0Chk[0].includes('disabled'));

  const sharedSiteChk = expandedAllHtml.match(
    new RegExp(`<input[^>]*id="step4SiteChk_${UUID_AUDIT_2026_QMS}_${UUID_SITIO_2_SHARED}"[^>]*>`)
  );
  assert.ok(sharedSiteChk && !sharedSiteChk[0].includes('disabled'));

  // NOT_AUDITED_LAST_N with N=1: renders #sitioNotAuditedLastNInput (min="0" step="1") and excludes Sitio 0 & Sitio 2 (in 2025)
  const notAuditedN1Html = renderDesignacionSitioView({
    profile: WORKER_PROFILE,
    state: buildBaseState({
      selectedCertId: UUID_CERT_QMS,
      selectedAuditId: UUID_AUDIT_2026_QMS,
      isSitePanelExpandedByAuditId: { [UUID_AUDIT_2026_QMS]: true },
      detailFilterMode: 'NOT_AUDITED_LAST_N',
      notAuditedLastN: 1,
    }),
    programs: fx.programs,
    allAudits: fx.allAudits,
    vinculos: fx.vinculos,
    conglomerados: fx.conglomerados,
    certificados: fx.certificados,
    referenceIsoDate: '2026-06-05',
  });

  const lastNInput = notAuditedN1Html.match(/<input[^>]*id="sitioNotAuditedLastNInput"[^>]*>/);
  assert.ok(lastNInput);
  assert.ok(lastNInput[0].includes('type="number"'));
  assert.ok(lastNInput[0].includes('min="0"'));
  assert.ok(lastNInput[0].includes('step="1"'));
  assert.ok(lastNInput[0].includes('value="1"'));
  assert.ok(notAuditedN1Html.includes('Mostrando 2 de 4'));
  const filteredN1Nums = [
    ...notAuditedN1Html.matchAll(/data-testid="sitio-assignment-row"[^>]*data-site-number="(\d+)"/g),
  ].map((m) => Number(m[1]));
  assert.deepEqual(filteredN1Nums, [1, 3]);

  // NOT_AUDITED_LAST_N with N=0: shows all 4 sites again
  const notAuditedN0Html = renderDesignacionSitioView({
    profile: WORKER_PROFILE,
    state: buildBaseState({
      selectedCertId: UUID_CERT_QMS,
      selectedAuditId: UUID_AUDIT_2026_QMS,
      isSitePanelExpandedByAuditId: { [UUID_AUDIT_2026_QMS]: true },
      detailFilterMode: 'NOT_AUDITED_LAST_N',
      notAuditedLastN: 0,
    }),
    programs: fx.programs,
    allAudits: fx.allAudits,
    vinculos: fx.vinculos,
    conglomerados: fx.conglomerados,
    certificados: fx.certificados,
    referenceIsoDate: '2026-06-05',
  });
  assert.ok(notAuditedN0Html.includes('Mostrando 4 de 4'));

  // Empty search result shows one-line empty state + reset-sitio-detail-filters button
  const emptyFilterHtml = renderDesignacionSitioView({
    profile: ADMIN_PROFILE,
    state: buildBaseState({
      selectedCertId: UUID_CERT_QMS,
      selectedAuditId: UUID_AUDIT_2026_QMS,
      isSitePanelExpandedByAuditId: { [UUID_AUDIT_2026_QMS]: true },
      detailFilterMode: 'ALL',
      detailSearchQuery: 'Inexistente XYZ',
    }),
    programs: fx.programs,
    allAudits: fx.allAudits,
    vinculos: fx.vinculos,
    conglomerados: fx.conglomerados,
    certificados: fx.certificados,
    referenceIsoDate: '2026-06-05',
  });
  assert.ok(emptyFilterHtml.includes('id="sitioDetailQuickSearch"'));
  assert.ok(emptyFilterHtml.includes('data-testid="sitio-filter-empty-state"'));
  assert.ok(emptyFilterHtml.includes('data-action="reset-sitio-detail-filters"'));
  assert.ok(emptyFilterHtml.includes('Mostrando 0 de 4'));

  // Quick search rendered automatically when >= 8 sites
  const manySites = Array.from({ length: 10 }, (_, idx) => ({
    id: `50000000-0000-0000-0000-${String(100 + idx).padStart(12, '0')}`,
    id_certificado: UUID_CERT_QMS,
    numero_sitio: idx,
    nombre_sitio: idx === 0 ? 'Sede HQ' : `Sede Operativa ${idx}`,
    direccion_sitio: `Calle ${idx}`,
    personal_count: 25 + idx,
  }));
  const largeCerts = fx.certificados.map((c) =>
    c.id === UUID_CERT_QMS ? { ...c, sitios: manySites } : c
  );
  const largeHtml = renderDesignacionSitioView({
    profile: ADMIN_PROFILE,
    state: buildBaseState({
      selectedCertId: UUID_CERT_QMS,
      selectedAuditId: UUID_AUDIT_2026_QMS,
      isSitePanelExpandedByAuditId: { [UUID_AUDIT_2026_QMS]: true },
    }),
    programs: fx.programs,
    allAudits: fx.allAudits,
    vinculos: fx.vinculos,
    conglomerados: fx.conglomerados,
    certificados: largeCerts,
    referenceIsoDate: '2026-06-05',
  });
  assert.ok(largeHtml.includes('id="sitioDetailQuickSearch"'));
  assert.ok(largeHtml.includes('Mostrando 10 de 10'));
  assert.equal(assertZeroUuidExposure(expandedAllHtml).compliant, true);
  assert.equal(assertZeroUuidExposure(notAuditedN1Html).compliant, true);
  assert.equal(assertZeroUuidExposure(emptyFilterHtml).compliant, true);
  assert.equal(assertZeroUuidExposure(largeHtml).compliant, true);
});

test('Step 2.2 Coverage Modal & RBAC: modal marks shared sites cleanly, read-only profiles disable expanded + modal checkboxes, Zero-UUID', () => {
  const fx = buildFixtures();

  for (const readOnlyProfile of [AUDITOR_PROFILE, CLIENT_PROFILE]) {
    const html = renderDesignacionSitioView({
      profile: readOnlyProfile,
      state: buildBaseState({
        selectedCertId: UUID_CERT_QMS,
        selectedAuditId: UUID_AUDIT_2026_QMS,
        isSitePanelExpandedByAuditId: { [UUID_AUDIT_2026_QMS]: true },
        coverageModalCertId: UUID_CERT_QMS,
        coverageModalAuditId: UUID_AUDIT_2026_QMS,
      }),
      programs: fx.programs,
      allAudits: fx.allAudits,
      vinculos: fx.vinculos,
      conglomerados: fx.conglomerados,
      certificados: fx.certificados,
      referenceIsoDate: '2026-06-05',
    });

    assert.ok(html.includes('Solo lectura'));
    assert.ok(html.includes('id="sitioCoverageModal"'));
    assert.ok(html.includes('Compartido'));
    const siteCheckboxes = [
      ...html.matchAll(/<input[^>]*data-action="toggle-step4-site"[^>]*>/g),
    ].map((m) => m[0]);
    assert.ok(siteCheckboxes.length >= 8);
    for (const chk of siteCheckboxes) {
      assert.ok(chk.includes('disabled'));
    }
    assert.equal(assertZeroUuidExposure(html).compliant, true);
  }
});
