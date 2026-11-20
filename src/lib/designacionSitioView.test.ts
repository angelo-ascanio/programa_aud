import test from 'node:test';
import assert from 'node:assert/strict';

import type { UserProfile } from './healthCheck';
import type { ConglomeradoEntity } from './conglomeradoDomain';
import type { ProgramaAuditoriaEntity } from './auditPlanningEngine';
import type { ProgramacionAuditEntity } from './auditExecution';
import type { VinculoEntity } from './vinculoDomain';
import type { CertificadoDetailEntity } from './multisiteSampling';
import { assertZeroUuidExposure } from './zeroUuid';
import {
  renderDesignacionSitioView,
  type DesignacionSitioViewState,
} from '../views/designacionSitioView';

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
const UUID_CERT = '40000000-0000-0000-0000-000000000001';
const UUID_VINCULO = '7c000000-0000-0000-0000-000000000001';

const UUID_SITIO_0 = '50000000-0000-0000-0000-000000000000';
const UUID_SITIO_1 = '50000000-0000-0000-0000-000000000001';
const UUID_SITIO_2 = '50000000-0000-0000-0000-000000000002';

const UUID_PROG_NOW = '7a000000-0000-0000-0000-000000000001';
const UUID_PROG_FUTURE = '7a000000-0000-0000-0000-000000000002';

const UUID_AUDIT_2022 = '80000000-0000-0000-0000-000000002022';
const UUID_AUDIT_2023 = '80000000-0000-0000-0000-000000002023';
const UUID_AUDIT_2024 = '80000000-0000-0000-0000-000000002024';
const UUID_AUDIT_2025 = '80000000-0000-0000-0000-000000002025';
const UUID_AUDIT_2026_NOW = '80000000-0000-0000-0000-000000002026';
const UUID_AUDIT_2027 = '80000000-0000-0000-0000-000000002027';
const UUID_AUDIT_2028_FUT = '80000000-0000-0000-0000-000000002028';

function buildBaseState(
  overrides: Partial<DesignacionSitioViewState> = {}
): DesignacionSitioViewState {
  return {
    queuePreset: 'PROXIMAS',
    query: '',
    viewMode: 'list',
    isSidebarOpen: true,
    sortColumn: null,
    sortDirection: 'none',
    facetSelections: {},
    selectedProgramId: null,
    selectedAuditId: null,
    cycleWindowOffsetByAuditId: {},
    editErrorMessage: null,
    savingSiteToggleKey: null,
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
    id: UUID_AUDIT_2026_NOW,
    id_programa_auditoria: UUID_PROG_NOW,
    codigo_auditoria: 'AUD-2026-001',
    id_certificado: UUID_CERT,
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
      codigo: 'GRP-001',
      nombre: 'Grupo Industrial Iberometal',
      pais: 'Venezuela',
      descripcion: 'Matriz industrial.',
      organizaciones: [],
      deleted_at: null,
    },
  ];

  const vinculos: VinculoEntity[] = [
    {
      id: UUID_VINCULO,
      id_grupo_empresarial: UUID_GRUPO,
      grupo_nombre: 'Grupo Industrial Iberometal',
      codigo_vinculo: 'VINC-N1-01',
      etiqueta: 'Planta Santa Cruz Multisite',
      nivel_vinculacion: 'NIVEL_1_INTRA_ORG',
      tipo_vinculacion: 'Individual',
      es_vinculada: false,
      tiene_sitio_temporal: false,
      notas: null,
      deleted_at: null,
      certificados: [
        {
          id: '26000000-0000-0000-0000-000000000001',
          id_vinculo: UUID_VINCULO,
          id_certificado: UUID_CERT,
          numero_certificado: 'FN-QMS-2026-001',
          norma_codigo: 'ISO 9001:2015',
          id_organizacion: UUID_ORG,
          organizacion_nombre: 'Iberometal Componentes S.A.',
          estatus: 'Activo',
          deleted_at: null,
        },
      ],
    },
  ];

  const certificados: CertificadoDetailEntity[] = [
    {
      id: UUID_CERT,
      id_organizacion: UUID_ORG,
      organizacion_nombre: 'Iberometal Componentes S.A.',
      numero_certificado: 'FN-QMS-2026-001',
      norma_codigo: 'ISO 9001:2015',
      sector_iaf: 17,
      sector_iaf_descripcion: 'Metales básicos y productos metálicos elaborados',
      subsector_iaf_descripcion: 'Componentes metálicos',
      estatus: 'Activo',
      alcance: 'Manufactura industrial',
      sitios: [
        // Deliberately placed out of order to prove Sitio 0 (HQ) sorts first
        {
          id: UUID_SITIO_2,
          id_certificado: UUID_CERT,
          numero_sitio: 2,
          nombre_sitio: 'Planta Secundaria Oriente',
          direccion_sitio: 'Zona Industrial Maturín',
          tipo_sitio: 'Planta Operativa',
          personal_count: 35,
        },
        {
          id: UUID_SITIO_1,
          id_certificado: UUID_CERT,
          numero_sitio: 1,
          nombre_sitio: 'Centro Logístico Occidente',
          direccion_sitio: 'Av. Circunvalación Norte · Valencia',
          tipo_sitio: 'Centro Logístico',
          personal_count: 48,
        },
        {
          id: UUID_SITIO_0,
          id_certificado: UUID_CERT,
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
  ];

  const audit2022 = makeAudit({
    id: UUID_AUDIT_2022,
    codigo_auditoria: 'AUD-2022-001',
    tipo_auditoria: 'Otorgamiento Fase 2',
    fecha_inicio: '2022-05-10',
    fecha_fin: '2022-05-12',
    estado_ciclo: 'Cerrada',
    estatus_ejecucion: 'Auditada',
    sitiosPlan: [
      makeSitioPlan('61000000-0000-0000-0000-000000002022', UUID_AUDIT_2022, UUID_SITIO_0, 0, 'Sede Principal Santa Cruz'),
      makeSitioPlan('61000000-0000-0000-0000-000000012022', UUID_AUDIT_2022, UUID_SITIO_1, 1, 'Centro Logístico Occidente'),
    ],
    fechas: [
      {
        id: '81000000-0000-0000-0000-000000002022',
        id_auditoria: UUID_AUDIT_2022,
        numero_secuencia: 1,
        tag: 'Ejecución',
        tipo_fecha: 'REAL',
        anio: null,
        mes: null,
        fecha_inicio: '2022-05-10',
        fecha_fin: '2022-05-12',
        observacion: 'Auditoría ejecutada.',
        deleted_at: null,
      },
    ],
  });

  const audit2023 = makeAudit({
    id: UUID_AUDIT_2023,
    codigo_auditoria: 'AUD-2023-001',
    tipo_auditoria: 'Seguimiento 1',
    fecha_inicio: '2023-05-14',
    fecha_fin: '2023-05-15',
    estado_ciclo: 'Cerrada',
    estatus_ejecucion: 'Auditada',
    sitiosPlan: [
      makeSitioPlan('61000000-0000-0000-0000-000000002023', UUID_AUDIT_2023, UUID_SITIO_0, 0, 'Sede Principal Santa Cruz'),
    ],
    fechas: [
      {
        id: '81000000-0000-0000-0000-000000002023',
        id_auditoria: UUID_AUDIT_2023,
        numero_secuencia: 1,
        tag: 'Ejecución',
        tipo_fecha: 'REAL',
        anio: null,
        mes: null,
        fecha_inicio: '2023-05-14',
        fecha_fin: '2023-05-15',
        observacion: 'Auditoría ejecutada.',
        deleted_at: null,
      },
    ],
  });

  const audit2024 = makeAudit({
    id: UUID_AUDIT_2024,
    codigo_auditoria: 'AUD-2024-001',
    tipo_auditoria: 'Seguimiento 2',
    fecha_inicio: '2024-05-16',
    fecha_fin: '2024-05-17',
    estado_ciclo: 'Cerrada',
    estatus_ejecucion: 'Auditada',
    sitiosPlan: [
      makeSitioPlan('61000000-0000-0000-0000-000000002024', UUID_AUDIT_2024, UUID_SITIO_0, 0, 'Sede Principal Santa Cruz'),
      makeSitioPlan('61000000-0000-0000-0000-000000022024', UUID_AUDIT_2024, UUID_SITIO_2, 2, 'Planta Secundaria Oriente'),
    ],
    fechas: [
      {
        id: '81000000-0000-0000-0000-000000002024',
        id_auditoria: UUID_AUDIT_2024,
        numero_secuencia: 1,
        tag: 'Ejecución',
        tipo_fecha: 'REAL',
        anio: null,
        mes: null,
        fecha_inicio: '2024-05-16',
        fecha_fin: '2024-05-17',
        observacion: 'Auditoría ejecutada.',
        deleted_at: null,
      },
    ],
  });

  const audit2025 = makeAudit({
    id: UUID_AUDIT_2025,
    codigo_auditoria: 'AUD-2025-001',
    tipo_auditoria: 'Renovación',
    fecha_inicio: '2025-05-18',
    fecha_fin: '2025-05-20',
    estado_ciclo: 'Cerrada',
    estatus_ejecucion: 'Auditada',
    sitiosPlan: [
      makeSitioPlan('61000000-0000-0000-0000-000000002025', UUID_AUDIT_2025, UUID_SITIO_0, 0, 'Sede Principal Santa Cruz'),
    ],
    fechas: [
      {
        id: '81000000-0000-0000-0000-000000002025',
        id_auditoria: UUID_AUDIT_2025,
        numero_secuencia: 1,
        tag: 'Ejecución',
        tipo_fecha: 'REAL',
        anio: null,
        mes: null,
        fecha_inicio: '2025-05-18',
        fecha_fin: '2025-05-20',
        observacion: 'Auditoría ejecutada.',
        deleted_at: null,
      },
    ],
  });

  const audit2026Now = makeAudit({
    id: UUID_AUDIT_2026_NOW,
    id_programa_auditoria: UUID_PROG_NOW,
    codigo_auditoria: 'AUD-2026-NOW',
    tipo_auditoria: 'Seguimiento 1',
    fecha_inicio: '2026-06-15',
    fecha_fin: '2026-06-17',
    tiene_sitio_temporal: false,
    sitiosPlan: [
      makeSitioPlan('61000000-0000-0000-0000-000000002026', UUID_AUDIT_2026_NOW, UUID_SITIO_0, 0, 'Sede Principal Santa Cruz'),
    ],
    fechas: [
      {
        id: '81000000-0000-0000-0000-000000002026',
        id_auditoria: UUID_AUDIT_2026_NOW,
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

  const audit2027 = makeAudit({
    id: UUID_AUDIT_2027,
    codigo_auditoria: 'AUD-2027-001',
    tipo_auditoria: 'Seguimiento 2',
    fecha_inicio: '2027-06-01',
    fecha_fin: '2027-06-30',
    estado_ciclo: 'Borrador',
    sitiosPlan: [],
    fechas: [
      {
        id: '81000000-0000-0000-0000-000000002027',
        id_auditoria: UUID_AUDIT_2027,
        numero_secuencia: 1,
        tag: 'Programación',
        tipo_fecha: 'PREPROGRAMADA_MES',
        anio: 2027,
        mes: 6,
        fecha_inicio: null,
        fecha_fin: null,
        observacion: 'Ciclo 2027 preprogramado.',
        deleted_at: null,
      },
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
    tiene_sitio_temporal: true,
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

  const imminentProgram: ProgramaAuditoriaEntity = {
    id: UUID_PROG_NOW,
    id_vinculo: UUID_VINCULO,
    id_grupo_empresarial: UUID_GRUPO,
    codigo_programa: 'PROG-2026-SIT',
    etiqueta: 'Campaña Vigente Santa Cruz 2026',
    nivel_vinculacion: 'NIVEL_1_INTRA_ORG',
    tipo_vinculacion: 'Individual',
    es_vinculada: false,
    tiene_sitio_temporal: false,
    notas: null,
    deleted_at: null,
    auditorias: [audit2026Now],
  };

  const futureProgram: ProgramaAuditoriaEntity = {
    id: UUID_PROG_FUTURE,
    id_vinculo: UUID_VINCULO,
    id_grupo_empresarial: UUID_GRUPO,
    codigo_programa: 'PROG-2028-FUT',
    etiqueta: 'Campaña Renovación Futura 2028',
    nivel_vinculacion: 'NIVEL_1_INTRA_ORG',
    tipo_vinculacion: 'Individual',
    es_vinculada: false,
    tiene_sitio_temporal: true,
    notas: null,
    deleted_at: null,
    auditorias: [audit2028Future],
  };

  return {
    conglomerados,
    vinculos,
    certificados,
    allAudits: [
      audit2022,
      audit2023,
      audit2024,
      audit2025,
      audit2026Now,
      audit2027,
      audit2028Future,
    ],
    programs: [imminentProgram, futureProgram],
  };
}

test('designacionSitioView Multi View renders Clean List (<colgroup>=100%, 0 <button> in <tbody>) and anti-future PROXIMAS preset', () => {
  const fx = buildFixtures();
  const refDate = '2026-06-05';

  const listHtml = renderDesignacionSitioView({
    profile: ADMIN_PROFILE,
    state: buildBaseState(),
    programs: fx.programs,
    allAudits: fx.allAudits,
    vinculos: fx.vinculos,
    conglomerados: fx.conglomerados,
    certificados: fx.certificados,
    referenceIsoDate: refDate,
  });

  // 1. Default queuePreset = 'PROXIMAS' hides 2028 future campaign and mentions anti-future protection
  assert.ok(listHtml.includes('Campaña Vigente Santa Cruz 2026'));
  assert.ok(!listHtml.includes('Campaña Renovación Futura 2028'));
  assert.ok(listHtml.includes('Protección anti-futuro activa'));
  assert.ok(listHtml.includes('data-action="set-designacion-sitio-preset"'));

  // 2. Clean List table-fixed + <colgroup> width percentages sum exactly to 100%
  assert.ok(listHtml.includes('table-fixed'));
  const colWidths = [...listHtml.matchAll(/<col\b[^>]*style="width:\s*([0-9.]+)%/g)].map((m) =>
    Number(m[1])
  );
  assert.deepEqual(colWidths, [15, 32, 25, 14, 14]);
  assert.equal(
    colWidths.reduce((a, b) => a + b, 0),
    100
  );

  // 3. Zero <button elements inside <tbody>
  const tbodyMatch = listHtml.match(/<tbody[\s\S]*?<\/tbody>/i);
  assert.ok(tbodyMatch, 'Table must render <tbody>');
  assert.equal(tbodyMatch[0].includes('<button'), false);

  // 4. Queue switching to FUTURO or TODAS shows future cycle
  const futureHtml = renderDesignacionSitioView({
    profile: WORKER_PROFILE,
    state: buildBaseState({ queuePreset: 'FUTURO' }),
    programs: fx.programs,
    allAudits: fx.allAudits,
    vinculos: fx.vinculos,
    conglomerados: fx.conglomerados,
    certificados: fx.certificados,
    referenceIsoDate: refDate,
  });
  assert.ok(futureHtml.includes('Campaña Renovación Futura 2028'));
  assert.ok(!futureHtml.includes('Campaña Vigente Santa Cruz 2026'));

  const todasHtml = renderDesignacionSitioView({
    profile: ADMIN_PROFILE,
    state: buildBaseState({ queuePreset: 'TODAS', viewMode: 'grid' }),
    programs: fx.programs,
    allAudits: fx.allAudits,
    vinculos: fx.vinculos,
    conglomerados: fx.conglomerados,
    certificados: fx.certificados,
    referenceIsoDate: refDate,
  });
  assert.ok(todasHtml.includes('Campaña Vigente Santa Cruz 2026'));
  assert.ok(todasHtml.includes('Campaña Renovación Futura 2028'));

  assert.equal(assertZeroUuidExposure(listHtml).compliant, true);
  assert.equal(assertZeroUuidExposure(futureHtml).compliant, true);
  assert.equal(assertZeroUuidExposure(todasHtml).compliant, true);
});

test('designacionSitioView Detail View replaces <select> with Custom SiteCycleMatrixCard, Sitio 0 first, ◀/▶ paging, and temporal switch', () => {
  const fx = buildFixtures();
  const refDate = '2026-06-05';

  const detailHtml = renderDesignacionSitioView({
    profile: ADMIN_PROFILE,
    state: buildBaseState({
      selectedProgramId: UUID_PROG_NOW,
    }),
    programs: fx.programs,
    allAudits: fx.allAudits,
    vinculos: fx.vinculos,
    conglomerados: fx.conglomerados,
    certificados: fx.certificados,
    referenceIsoDate: refDate,
  });

  // 1. ZERO <select> elements in Detail View
  assert.equal(detailHtml.includes('<select'), false);

  // 2. Sitio 0 (HQ) appears before Sitio #1 and Sitio #2
  const siteNumMatches = [...detailHtml.matchAll(/data-site-number="(\d+)"/g)].map((m) =>
    Number(m[1])
  );
  assert.deepEqual(siteNumMatches, [0, 1, 2]);
  assert.ok(detailHtml.includes('Sitio 0 (HQ)'));
  assert.ok(detailHtml.includes('Sede Principal Santa Cruz'));

  // 3. Micro-badges: "Última auditoría:" and "En ciclo:"
  assert.ok(detailHtml.includes('Última auditoría:'));
  assert.ok(detailHtml.includes('En ciclo:'));

  // 4. Only 1 site currently checked -> Sitio 0 checkbox disabled ("Mín. 1 sitio"), while Sitio #1/#2 are enabled
  const sitio0ChkMatch = detailHtml.match(
    new RegExp(`<input[^>]*id="step4SiteChk_${UUID_AUDIT_2026_NOW}_${UUID_SITIO_0}"[^>]*>`)
  );
  const sitio1ChkMatch = detailHtml.match(
    new RegExp(`<input[^>]*id="step4SiteChk_${UUID_AUDIT_2026_NOW}_${UUID_SITIO_1}"[^>]*>`)
  );
  assert.ok(sitio0ChkMatch);
  assert.ok(sitio1ChkMatch);
  assert.ok(sitio0ChkMatch[0].includes('checked'));
  assert.ok(sitio0ChkMatch[0].includes('disabled'));
  assert.ok(!sitio1ChkMatch[0].includes('checked'));
  assert.ok(!sitio1ChkMatch[0].includes('disabled'));

  // 5. Temporal switch present with aria-checked="false", Paso 5 disabled while temporal is false
  assert.ok(detailHtml.includes('¿Incluye Sitio Temporal / Proyecto?'));
  assert.ok(detailHtml.includes('role="switch"'));
  assert.ok(detailHtml.includes('data-action="toggle-step4-temporal"'));
  assert.ok(detailHtml.includes('aria-checked="false"'));
  assert.ok(detailHtml.includes('Paso 3: Tipo'));
  assert.ok(detailHtml.includes('Paso 6: Tiempo'));
  assert.ok(detailHtml.includes('Paso 8: Programa'));
  assert.ok(detailHtml.includes('id="step4TopNav_step5"\n        disabled'));

  // 6. Responsive cycle strip & paging arrows ◀ / ▶ (default offset 0 shows 2024..2028 — NOT 2022/2023 cells)
  assert.ok(detailHtml.includes('grid-cols-3 sm:grid-cols-5'));
  assert.ok(detailHtml.includes('hidden sm:flex'));
  assert.ok(detailHtml.includes('data-action="page-step4-cycle"'));
  assert.ok(detailHtml.includes('◀'));
  assert.ok(detailHtml.includes('▶'));
  assert.ok(!detailHtml.includes('title="2022 ·'));
  assert.ok(!detailHtml.includes('title="2023 ·'));
  assert.ok(detailHtml.includes('title="2026 ·'));

  // 7. Paging backward by -2 shifts visible cycle strip to show 2022 and 2023
  const pagedLeftHtml = renderDesignacionSitioView({
    profile: WORKER_PROFILE,
    state: buildBaseState({
      selectedProgramId: UUID_PROG_NOW,
      cycleWindowOffsetByAuditId: { [UUID_AUDIT_2026_NOW]: -2 },
    }),
    programs: fx.programs,
    allAudits: fx.allAudits,
    vinculos: fx.vinculos,
    conglomerados: fx.conglomerados,
    certificados: fx.certificados,
    referenceIsoDate: refDate,
  });
  assert.ok(pagedLeftHtml.includes('title="2022 ·'));
  assert.ok(pagedLeftHtml.includes('title="2023 ·'));

  // 8. Future campaign (2 sites selected + tiene_sitio_temporal = true) unlocks Paso 5, enables deselecting, and renders warning banner
  const futureDetailHtml = renderDesignacionSitioView({
    profile: ADMIN_PROFILE,
    state: buildBaseState({
      queuePreset: 'FUTURO',
      selectedProgramId: UUID_PROG_FUTURE,
    }),
    programs: fx.programs,
    allAudits: fx.allAudits,
    vinculos: fx.vinculos,
    conglomerados: fx.conglomerados,
    certificados: fx.certificados,
    referenceIsoDate: refDate,
  });
  assert.ok(futureDetailHtml.includes('data-testid="future-cycle-warning-banner"'));
  assert.ok(futureDetailHtml.includes('aria-checked="true"'));
  assert.ok(!futureDetailHtml.includes('id="step4TopNav_step5"\n        disabled'));
  assert.ok(futureDetailHtml.includes('data-subview="designacion/temporal"'));
  const futureSitio0Chk = futureDetailHtml.match(
    new RegExp(`<input[^>]*id="step4SiteChk_${UUID_AUDIT_2028_FUT}_${UUID_SITIO_0}"[^>]*>`)
  );
  assert.ok(futureSitio0Chk);
  assert.ok(futureSitio0Chk[0].includes('checked'));
  assert.ok(!futureSitio0Chk[0].includes('disabled'));

  assert.equal(assertZeroUuidExposure(detailHtml).compliant, true);
  assert.equal(assertZeroUuidExposure(pagedLeftHtml).compliant, true);
  assert.equal(assertZeroUuidExposure(futureDetailHtml).compliant, true);
});

test('designacionSitioView enforces RBAC read-only mode for AUDITOR and CLIENT profiles and Zero-UUID errors', () => {
  const fx = buildFixtures();
  const refDate = '2026-06-05';

  for (const readOnlyProfile of [AUDITOR_PROFILE, CLIENT_PROFILE]) {
    const html = renderDesignacionSitioView({
      profile: readOnlyProfile,
      state: buildBaseState({
        selectedProgramId: UUID_PROG_FUTURE,
        editErrorMessage: 'Esta auditoría tiene 1 sitio(s) temporal(es) activos en Paso 5.',
      }),
      programs: fx.programs,
      allAudits: fx.allAudits,
      vinculos: fx.vinculos,
      conglomerados: fx.conglomerados,
      certificados: fx.certificados,
      referenceIsoDate: refDate,
    });

    assert.ok(html.includes('Solo lectura'));
    assert.ok(html.includes('role="alert"'));
    // Every site toggle checkbox and temporal switch must be disabled for AUDITOR and CLIENT
    const siteCheckboxes = [...html.matchAll(/<input[^>]*data-action="toggle-step4-site"[^>]*>/g)].map(
      (m) => m[0]
    );
    assert.ok(siteCheckboxes.length >= 2);
    for (const chk of siteCheckboxes) {
      assert.ok(chk.includes('disabled'), 'Read-only profile must have disabled site checkboxes');
    }

    const temporalSwitch = html.match(
      /<button[^>]*data-action="toggle-step4-temporal"[^>]*>/
    )?.[0];
    assert.ok(temporalSwitch);
    assert.ok(
      temporalSwitch.includes('disabled'),
      'Read-only profile must have disabled temporal switch'
    );
    assert.equal(assertZeroUuidExposure(html).compliant, true);
  }
});
