import test from 'node:test';
import assert from 'node:assert/strict';

import type { UserProfile } from './healthCheck';
import type { ConglomeradoEntity } from './conglomeradoDomain';
import type { VinculoEntity } from './vinculoDomain';
import type { AuditoriaSitioPlanItem, ProgramaAuditoriaEntity } from './auditPlanningEngine';
import type { ProgramacionAuditEntity } from './auditExecution';
import type { AuditoriaSitioTemporalEntity } from './designacionTemporalDomain';
import { assertZeroUuidExposure } from './zeroUuid';
import { renderTiempoView, type TiempoViewState } from '../views/tiempoView';

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
const UUID_VINCULO = '25000000-0000-0000-0000-000000000001';
const UUID_TIPO = '60000000-0000-0000-0000-000000000001';

const UUID_PROG_1 = '70000000-0000-0000-0000-000000000001';
const UUID_PROG_2 = '70000000-0000-0000-0000-000000000002';
const UUID_PROG_NO_STEP4 = '70000000-0000-0000-0000-000000000003';

const UUID_AUDIT_1 = '80000000-0000-0000-0000-000000000001';
const UUID_AUDIT_2 = '80000000-0000-0000-0000-000000000002';
const UUID_AUDIT_3 = '80000000-0000-0000-0000-000000000003';
const UUID_AUDIT_NO_STEP4 = '80000000-0000-0000-0000-000000000004';

const UUID_TEMP_1 = '9a000000-0000-0000-0000-000000000001';

function makeSitePlan(
  id: string,
  id_auditoria: string,
  numero_sitio: number,
  nombre_sitio: string,
  tiempo_auditoria: number
): AuditoriaSitioPlanItem {
  return {
    id,
    id_auditoria,
    id_sitio: `50000000-0000-0000-0000-${id.slice(-12)}`,
    numero_sitio,
    nombre_sitio,
    direccion_sitio: `Av. Industrial ${numero_sitio + 100}`,
    tiempo_auditoria,
    modalidad_evaluacion: 'Presencial',
    procesos: [],
    equipoSitio: [],
    deleted_at: null,
  };
}

function makeAudit(overrides: Partial<ProgramacionAuditEntity>): ProgramacionAuditEntity {
  const id = overrides.id ?? UUID_AUDIT_1;
  return {
    id,
    id_programa_auditoria: overrides.id_programa_auditoria ?? UUID_PROG_1,
    codigo_auditoria: overrides.codigo_auditoria ?? 'AUD-2026-001',
    id_certificado: overrides.id_certificado ?? '40000000-0000-0000-0000-000000000001',
    numero_certificado: overrides.numero_certificado ?? 'FN-QMS-2026-001',
    id_organizacion: UUID_ORG,
    organizacion_nombre: overrides.organizacion_nombre ?? 'Industrias Andinas S.A.',
    norma_codigo: overrides.norma_codigo ?? 'ISO 9001:2015',
    sector_iaf: 17,
    id_tipo_auditoria:
      overrides.id_tipo_auditoria === undefined ? UUID_TIPO : overrides.id_tipo_auditoria,
    tipo_auditoria: 'Seguimiento 1',
    metodologia: 'Presencial',
    fecha_inicio: '2026-06-15',
    fecha_fin: '2026-06-17',
    fecha_reprogramacion: null,
    fechas:
      overrides.fechas ?? [
        {
          id: '81000000-0000-0000-0000-000000000001',
          id_auditoria: id,
          numero_secuencia: 1,
          tag: 'Programación',
          tipo_fecha: 'PROGRAMADA_EXACTA',
          anio: null,
          mes: null,
          fecha_inicio: '2026-06-15',
          fecha_fin: '2026-06-17',
          observacion: null,
          deleted_at: null,
        },
      ],
    latestDate: null,
    dias_auditor: 0,
    tiempo_auditoria: 0,
    estatus: 'En Programación',
    estado_ciclo: 'En Programación',
    tiene_sitio_temporal: overrides.tiene_sitio_temporal ?? false,
    auditor_lider_id: '10000000-0000-0000-0000-000000000001',
    auditor_lider: 'Ing. Carlos Mendoza',
    sede_principal_direccion: 'Av. Industrial 100',
    equipo: [],
    sitiosMuestreo: [],
    sitiosPlan: overrides.sitiosPlan ?? [],
    matrizNormativa: [],
    deleted_at: overrides.deleted_at ?? null,
  };
}

function makeProgram(
  id: string,
  etiqueta: string,
  auditorias: ProgramacionAuditEntity[]
): ProgramaAuditoriaEntity {
  return {
    id,
    id_vinculo: UUID_VINCULO,
    id_grupo_empresarial: UUID_GRUPO,
    codigo_programa: `PROG-${id.slice(-3)}`,
    etiqueta,
    nivel_vinculacion: auditorias.length > 1 ? 'NIVEL_1_INTRA_ORG' : 'INDIVIDUAL',
    tipo_vinculacion: auditorias.length > 1 ? 'Integrada' : 'Individual',
    es_vinculada: auditorias.length > 1,
    tiene_sitio_temporal: auditorias.some((a) => a.tiene_sitio_temporal),
    id_ciclo_origen: null,
    notas: null,
    deleted_at: null,
    auditorias,
  };
}

function makeBaseState(overrides: Partial<TiempoViewState> = {}): TiempoViewState {
  return {
    query: '',
    viewMode: 'list',
    isSidebarOpen: true,
    sortColumn: null,
    sortDirection: 'none',
    facetSelections: {},
    selectedProgramId: null,
    draftTimeBySitePlanId: {},
    savingSitePlanId: null,
    editErrorMessage: null,
    ...overrides,
  };
}

const SAMPLE_CONGLOMERADOS: ConglomeradoEntity[] = [
  {
    id: UUID_GRUPO,
    codigo_grupo: 'GRP-IND',
    nombre: 'Grupo Industrial Andino',
    es_individual_auto: false,
    descripcion: null,
    notas: null,
    organizaciones_count: 1,
    certificados_count: 3,
    deleted_at: null,
  },
];

const SAMPLE_VINCULOS: VinculoEntity[] = [
  {
    id: UUID_VINCULO,
    id_grupo_empresarial: UUID_GRUPO,
    grupo_nombre: 'Grupo Industrial Andino',
    codigo_vinculo: 'VINC-001',
    etiqueta: 'Vínculo Integrado SGC+SGA',
    nivel_vinculacion: 'NIVEL_1_INTRA_ORG',
    tipo_vinculacion: 'Integrada',
    es_vinculada: true,
    tiene_sitio_temporal: true,
    notas: null,
    certificados: [],
    deleted_at: null,
  },
];

test('renderTiempoView Multi View enforces 6-col <colgroup> 100%, zero <button> in <tbody>, reactive facets & Zero-UUID', () => {
  const progSharedTemporal = makeProgram(UUID_PROG_1, 'Campaña Integrada con Temporal', [
    makeAudit({
      id: UUID_AUDIT_1,
      id_programa_auditoria: UUID_PROG_1,
      numero_certificado: 'FN-QMS-001',
      tiene_sitio_temporal: true,
      sitiosPlan: [
        makeSitePlan('82000000-0000-0000-0000-000000000001', UUID_AUDIT_1, 0, 'Sede Central HQ', 2.0),
      ],
    }),
    makeAudit({
      id: UUID_AUDIT_2,
      id_programa_auditoria: UUID_PROG_1,
      numero_certificado: 'FN-EMS-002',
      norma_codigo: 'ISO 14001:2015',
      sitiosPlan: [
        makeSitePlan('82000000-0000-0000-0000-000000000002', UUID_AUDIT_2, 0, 'Sede Central HQ', 1.5),
      ],
    }),
  ]);

  const progIncompleto = makeProgram(UUID_PROG_2, 'Campaña Incompleta 0d', [
    makeAudit({
      id: UUID_AUDIT_3,
      id_programa_auditoria: UUID_PROG_2,
      numero_certificado: 'FN-OHS-003',
      norma_codigo: 'ISO 45001:2018',
      sitiosPlan: [
        makeSitePlan('82000000-0000-0000-0000-000000000003', UUID_AUDIT_3, 0, 'Sede Central HQ', 0),
      ],
    }),
  ]);

  const progExcludedNoStep4 = makeProgram(UUID_PROG_NO_STEP4, 'Campaña Sin Paso 4', [
    makeAudit({
      id: UUID_AUDIT_NO_STEP4,
      id_programa_auditoria: UUID_PROG_NO_STEP4,
      sitiosPlan: [],
    }),
  ]);

  const temporalSites: AuditoriaSitioTemporalEntity[] = [
    {
      id: UUID_TEMP_1,
      id_auditoria: UUID_AUDIT_1,
      etiqueta: 'Obra Ampliación Norte',
      comentario: 'Proyecto temporal compartido',
      tiempo_auditoria: 1.0,
      certificados: [
        {
          id: '9b000000-0000-0000-0000-000000000001',
          id_sitio_temporal: UUID_TEMP_1,
          id_auditoria_certificado: UUID_AUDIT_1,
          numero_certificado: 'FN-QMS-001',
          organizacion_nombre: 'Industrias Andinas S.A.',
          norma_codigo: 'ISO 9001:2015',
        },
        {
          id: '9b000000-0000-0000-0000-000000000002',
          id_sitio_temporal: UUID_TEMP_1,
          id_auditoria_certificado: UUID_AUDIT_2,
          numero_certificado: 'FN-EMS-002',
          organizacion_nombre: 'Industrias Andinas S.A.',
          norma_codigo: 'ISO 14001:2015',
        },
      ],
      equipoTemporal: [],
      deleted_at: null,
    },
  ];

  // Empty state CTA
  const emptyHtml = renderTiempoView({
    profile: ADMIN_PROFILE,
    state: makeBaseState(),
    programs: [progExcludedNoStep4],
    temporalSites: [],
    vinculos: SAMPLE_VINCULOS,
    conglomerados: SAMPLE_CONGLOMERADOS,
    referenceIsoDate: '2026-06-01',
  });
  assert.ok(emptyHtml.includes('Ir a Paso 4: Sitio'));
  assert.equal(assertZeroUuidExposure(emptyHtml).compliant, true);

  // Populated Multi View list
  const listHtml = renderTiempoView({
    profile: WORKER_PROFILE,
    state: makeBaseState(),
    programs: [progSharedTemporal, progIncompleto, progExcludedNoStep4],
    temporalSites,
    vinculos: SAMPLE_VINCULOS,
    conglomerados: SAMPLE_CONGLOMERADOS,
    referenceIsoDate: '2026-06-01',
  });
  assert.equal(assertZeroUuidExposure(listHtml).compliant, true);
  assert.equal(listHtml.includes('Campaña Sin Paso 4'), false);
  assert.ok(listHtml.includes('Campaña Integrada con Temporal'));
  assert.ok(listHtml.includes('Campaña Incompleta 0d'));

  // 6 columns summing 100% and zero <button> inside <tbody>
  const colgroupMatch = listHtml.match(/<colgroup>([\s\S]*?)<\/colgroup>/);
  assert.ok(colgroupMatch, 'Expected <colgroup> in tiempo-main table');
  const colWidths = [...colgroupMatch[1].matchAll(/width:\s*([\d.]+)%/g)].map((m) => Number(m[1]));
  assert.equal(colWidths.length, 6);
  const totalPct = colWidths.reduce((s, n) => s + n, 0);
  assert.ok(Math.abs(totalPct - 100) < 0.01, `Expected 100%, got ${totalPct}%`);

  const tbodyMatch = listHtml.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/);
  assert.ok(tbodyMatch, 'Expected <tbody> in tiempo-main table');
  assert.equal(tbodyMatch[1].includes('<button'), false);

  // Deduplicated campaign total in table (3.50 + 1.00 = 4.50 d, not 5.50 d)
  assert.ok(listHtml.includes('3.50 d'));
  assert.ok(listHtml.includes('1.00 d'));
  assert.ok(listHtml.includes('4.50 d'));

  // Facet filtering (`estado_tiempo: INCOMPLETOS`)
  const facetIncompletoHtml = renderTiempoView({
    profile: ADMIN_PROFILE,
    state: makeBaseState({
      facetSelections: { estado_tiempo: new Set(['INCOMPLETOS']) },
    }),
    programs: [progSharedTemporal, progIncompleto],
    temporalSites,
    vinculos: SAMPLE_VINCULOS,
    conglomerados: SAMPLE_CONGLOMERADOS,
    referenceIsoDate: '2026-06-01',
  });
  assert.ok(facetIncompletoHtml.includes('Campaña Incompleta 0d'));
  assert.equal(facetIncompletoHtml.includes('Campaña Integrada con Temporal'), false);

  // Cards view mode
  const gridHtml = renderTiempoView({
    profile: ADMIN_PROFILE,
    state: makeBaseState({ viewMode: 'grid' }),
    programs: [progSharedTemporal, progIncompleto],
    temporalSites,
    vinculos: SAMPLE_VINCULOS,
    conglomerados: SAMPLE_CONGLOMERADOS,
    referenceIsoDate: '2026-06-01',
  });
  assert.ok(gridHtml.includes('data-action="select-tiempo-program"'));
  assert.equal(assertZeroUuidExposure(gridHtml).compliant, true);
});

test('renderTiempoView Detail View renders deduplicated temporal summary, 0.25d steppers for staff, and read-only for AUDITOR/CLIENT', () => {
  const prog = makeProgram(UUID_PROG_1, 'Campaña Tri-Norma Tiempo', [
    makeAudit({
      id: UUID_AUDIT_1,
      id_programa_auditoria: UUID_PROG_1,
      numero_certificado: 'FN-QMS-001',
      tiene_sitio_temporal: true,
      sitiosPlan: [
        makeSitePlan('82000000-0000-0000-0000-000000000002', UUID_AUDIT_1, 1, 'Planta Norte', 1.25),
        makeSitePlan('82000000-0000-0000-0000-000000000001', UUID_AUDIT_1, 0, 'Sede Central HQ', 2.0),
      ],
    }),
    makeAudit({
      id: UUID_AUDIT_2,
      id_programa_auditoria: UUID_PROG_1,
      numero_certificado: 'FN-EMS-002',
      norma_codigo: 'ISO 14001:2015',
      sitiosPlan: [
        makeSitePlan('82000000-0000-0000-0000-000000000003', UUID_AUDIT_2, 0, 'Sede Central HQ', 1.5),
      ],
    }),
  ]);

  const sharedTemporal: AuditoriaSitioTemporalEntity = {
    id: UUID_TEMP_1,
    id_auditoria: UUID_AUDIT_1,
    etiqueta: 'Proyecto Obra Sur',
    comentario: 'Obra activa',
    tiempo_auditoria: 1.0,
    certificados: [
      {
        id: '9b000000-0000-0000-0000-000000000001',
        id_sitio_temporal: UUID_TEMP_1,
        id_auditoria_certificado: UUID_AUDIT_1,
        numero_certificado: 'FN-QMS-001',
        organizacion_nombre: 'Industrias Andinas S.A.',
        norma_codigo: 'ISO 9001:2015',
      },
      {
        id: '9b000000-0000-0000-0000-000000000002',
        id_sitio_temporal: UUID_TEMP_1,
        id_auditoria_certificado: UUID_AUDIT_2,
        numero_certificado: 'FN-EMS-002',
        organizacion_nombre: 'Industrias Andinas S.A.',
        norma_codigo: 'ISO 14001:2015',
      },
    ],
    equipoTemporal: [],
    deleted_at: null,
  };

  for (const staffProfile of [ADMIN_PROFILE, WORKER_PROFILE]) {
    const staffDetailHtml = renderTiempoView({
      profile: staffProfile,
      state: makeBaseState({ selectedProgramId: UUID_PROG_1 }),
      programs: [prog],
      temporalSites: [sharedTemporal],
      vinculos: SAMPLE_VINCULOS,
      conglomerados: SAMPLE_CONGLOMERADOS,
      referenceIsoDate: '2026-06-01',
    });

    assert.equal(assertZeroUuidExposure(staffDetailHtml).compliant, true);
    assert.ok(staffDetailHtml.includes('Sitios Regulares:'));
    assert.ok(staffDetailHtml.includes('4.75 d'));
    assert.ok(staffDetailHtml.includes('Sitios Temporales (Paso 5):'));
    assert.ok(staffDetailHtml.includes('1.00 d'));
    assert.ok(staffDetailHtml.includes('5.75 días-auditor'));
    assert.ok(staffDetailHtml.includes('(compartido en 2 certs)'));
    assert.ok(staffDetailHtml.includes('Editar en Temporal →'));
    assert.ok(staffDetailHtml.includes('Ir a Paso 7: Asignación →'));
    assert.ok(staffDetailHtml.includes('Ir a Paso 8: Programa →'));
    assert.ok(staffDetailHtml.includes('data-action="step-tiempo-site-days"'));
    assert.ok(staffDetailHtml.includes('data-action="change-tiempo-site-days"'));
    assert.ok(staffDetailHtml.includes('data-action="change-tiempo-site-modality"'));

    // Verify Sitio 0 (HQ) appears before Sitio 1 within first certificate card
    const hqIdx = staffDetailHtml.indexOf('Sede Central HQ');
    const plantaIdx = staffDetailHtml.indexOf('Planta Norte');
    assert.ok(hqIdx > 0 && plantaIdx > hqIdx, 'Sitio 0 (HQ) must render before Sitio 1');
  }

  for (const roProfile of [AUDITOR_PROFILE, CLIENT_PROFILE]) {
    const roDetailHtml = renderTiempoView({
      profile: roProfile,
      state: makeBaseState({ selectedProgramId: UUID_PROG_1 }),
      programs: [prog],
      temporalSites: [sharedTemporal],
      vinculos: SAMPLE_VINCULOS,
      conglomerados: SAMPLE_CONGLOMERADOS,
      referenceIsoDate: '2026-06-01',
    });

    assert.equal(assertZeroUuidExposure(roDetailHtml).compliant, true);
    assert.ok(roDetailHtml.includes('Solo lectura'));
    assert.equal(roDetailHtml.includes('data-action="step-tiempo-site-days"'), false);
    assert.equal(roDetailHtml.includes('data-action="change-tiempo-site-days"'), false);
    assert.equal(roDetailHtml.includes('data-action="change-tiempo-site-modality"'), false);
    assert.ok(roDetailHtml.includes('5.75 días-auditor'));
  }
});
