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
  DEFAULT_DESIGNACION_SITIO_STATE,
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
const UUID_CERT_SIBLING = '40000000-0000-0000-0000-000000000002';
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
const UUID_AUDIT_2026_EMS = '80000000-0000-0000-0000-000000002126';
const UUID_AUDIT_2027 = '80000000-0000-0000-0000-000000002027';
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
  nombre: string,
  notas: string | null = null
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
    notas_sitio: notas,
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
      codigo_grupo: 'GRP-001',
      nombre: 'Grupo Industrial Iberometal',
      es_individual_auto: false,
      descripcion: 'Matriz industrial.',
      notas: null,
      organizaciones_count: 1,
      certificados_count: 2,
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
      id: UUID_CERT,
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
        // Out of order intentionally to prove Sitio 0 (HQ) sorts first
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
    {
      id: UUID_CERT_SIBLING,
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
          id: '50000000-0000-0000-0000-000000000010',
          id_certificado: UUID_CERT_SIBLING,
          numero_sitio: 0,
          nombre_sitio: 'Sede Principal Santa Cruz (EMS)',
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

  const audit2022 = makeAudit({
    id: UUID_AUDIT_2022,
    id_programa_auditoria: null,
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
    id_programa_auditoria: null,
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
    id_programa_auditoria: null,
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
    id_programa_auditoria: null,
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
    sitiosPlan: [
      makeSitioPlan(
        '61000000-0000-0000-0000-000000002026',
        UUID_AUDIT_2026_NOW,
        UUID_SITIO_0,
        0,
        'Sede Principal Santa Cruz',
        'Incluir área de despachos'
      ),
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

  const audit2026Ems = makeAudit({
    id: UUID_AUDIT_2026_EMS,
    id_programa_auditoria: UUID_PROG_NOW,
    id_certificado: UUID_CERT_SIBLING,
    numero_certificado: 'FN-EMS-2026-002',
    norma_codigo: 'ISO 14001:2015',
    codigo_auditoria: 'AUD-2026-EMS',
    tipo_auditoria: 'Seguimiento 1',
    sitiosPlan: [
      makeSitioPlan(
        '61000000-0000-0000-0000-000000002126',
        UUID_AUDIT_2026_EMS,
        '50000000-0000-0000-0000-000000000010',
        0,
        'Sede Principal Santa Cruz (EMS)'
      ),
    ],
  });

  const audit2027 = makeAudit({
    id: UUID_AUDIT_2027,
    id_programa_auditoria: null,
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
    tipo_vinculacion: 'Integrada',
    es_vinculada: true,
    tiene_sitio_temporal: false,
    notas: null,
    deleted_at: null,
    auditorias: [audit2026Now, audit2026Ems],
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
      audit2022,
      audit2023,
      audit2024,
      audit2025,
      audit2026Now,
      audit2026Ems,
      audit2027,
      audit2028Future,
    ],
    programs: [imminentProgram, futureProgram],
  };
}

test('Step 5.1 Sitio Multi View: Certificate-Based Clean List (<colgroup>=100%, 0 <button> in <tbody>) and Zero-UUID', () => {
  const fx = buildFixtures();
  const refDate = '2026-06-05';

  const listHtml = renderDesignacionSitioView({
    profile: ADMIN_PROFILE,
    state: buildBaseState({ queuePreset: 'TODAS' }),
    programs: fx.programs,
    allAudits: fx.allAudits,
    vinculos: fx.vinculos,
    conglomerados: fx.conglomerados,
    certificados: fx.certificados,
    referenceIsoDate: refDate,
  });

  assert.ok(listHtml.includes('data-mv-domain="designacion-sitio"'));
  assert.ok(listHtml.includes('FN-QMS-2026-001'));
  assert.ok(listHtml.includes('FN-EMS-2026-002'));
  assert.ok(listHtml.includes('data-action="select-section-cert"'));
  assert.ok(listHtml.includes('table-fixed'));
  const colWidths = [...listHtml.matchAll(/<col\b[^>]*style="width:\s*([\d.]+)%/g)].map((m) =>
    Number(m[1])
  );
  assert.deepEqual(colWidths, [14, 32, 22, 18, 14]);
  assert.equal(
    colWidths.reduce((a, b) => a + b, 0),
    100
  );
  const tbodyMatch = listHtml.match(/<tbody[\s\S]*?<\/tbody>/i);
  assert.ok(tbodyMatch);
  assert.equal(/<button\b/i.test(tbodyMatch[0]), false);
  assert.equal(assertZeroUuidExposure(listHtml).compliant, true);
});

test('Step 5.1 Sitio Detail View: Certificate shell ◀/▶, Linked Siblings bar (showLinkedSiblings=true), Sitio 0 first, notes input & NO temporal switch', () => {
  const fx = buildFixtures();
  const refDate = '2026-06-05';

  const detailHtml = renderDesignacionSitioView({
    profile: ADMIN_PROFILE,
    state: buildBaseState({
      selectedCertId: UUID_CERT,
      selectedAuditId: UUID_AUDIT_2026_NOW,
    }),
    programs: fx.programs,
    allAudits: fx.allAudits,
    vinculos: fx.vinculos,
    conglomerados: fx.conglomerados,
    certificados: fx.certificados,
    referenceIsoDate: refDate,
  });

  // 1. Certificate shell + Linked Siblings bar PRESENT, NO legacy toggle-step4-temporal switch
  assert.ok(detailHtml.includes('data-action="select-section-audit"'));
  assert.ok(detailHtml.includes('data-action="step-section-audit"'));
  assert.ok(detailHtml.includes('data-linked-siblings-bar="true"'));
  assert.ok(detailHtml.includes('data-action="select-linked-sibling-audit"'));
  assert.equal(detailHtml.includes('toggle-step4-temporal'), false);

  // 2. Sitio 0 (HQ) appears first before Sitio #1 and Sitio #2
  const siteNumMatches = [...detailHtml.matchAll(/data-site-number="(\d+)"/g)].map((m) =>
    Number(m[1])
  );
  assert.deepEqual(siteNumMatches, [0, 1, 2]);
  assert.ok(detailHtml.includes('Sitio 0 (HQ)'));
  assert.ok(detailHtml.includes('Sede Principal Santa Cruz'));

  // 3. Single remaining selected site disables unchecking (Mín. 1 sitio) + exposes notes input/button
  const sitio0ChkMatch = detailHtml.match(
    new RegExp(`<input[^>]*id="step4SiteChk_${UUID_AUDIT_2026_NOW}_${UUID_SITIO_0}"[^>]*>`)
  );
  assert.ok(sitio0ChkMatch);
  assert.ok(sitio0ChkMatch[0].includes('checked'));
  assert.ok(sitio0ChkMatch[0].includes('disabled'));
  assert.ok(detailHtml.includes('data-sitio-notes-id="61000000-0000-0000-0000-000000002026"'));
  assert.ok(detailHtml.includes('Incluir área de despachos'));
  assert.ok(detailHtml.includes('data-action="save-sitio-notes"'));

  // 4. Responsive cycle strip paging (windowOffset: -2 shows 2022/2023)
  assert.ok(!detailHtml.includes('title="2022 ·'));
  const pagedLeftHtml = renderDesignacionSitioView({
    profile: WORKER_PROFILE,
    state: buildBaseState({
      selectedCertId: UUID_CERT,
      selectedAuditId: UUID_AUDIT_2026_NOW,
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

  // 5. Future cycle audit renders warning banner & allows deselecting when >= 2 sites
  const futureDetailHtml = renderDesignacionSitioView({
    profile: ADMIN_PROFILE,
    state: buildBaseState({
      selectedCertId: UUID_CERT,
      selectedAuditId: UUID_AUDIT_2028_FUT,
    }),
    programs: fx.programs,
    allAudits: fx.allAudits,
    vinculos: fx.vinculos,
    conglomerados: fx.conglomerados,
    certificados: fx.certificados,
    referenceIsoDate: refDate,
  });
  assert.ok(futureDetailHtml.includes('data-testid="future-cycle-warning-banner"'));
  const futureSitio0Chk = futureDetailHtml.match(
    new RegExp(`<input[^>]*id="step4SiteChk_${UUID_AUDIT_2028_FUT}_${UUID_SITIO_0}"[^>]*>`)
  );
  assert.ok(futureSitio0Chk);
  assert.ok(futureSitio0Chk[0].includes('checked'));
  assert.equal(futureSitio0Chk[0].includes('disabled'), false);
  assert.equal(assertZeroUuidExposure(detailHtml).compliant, true);
  assert.equal(assertZeroUuidExposure(futureDetailHtml).compliant, true);
});

test('Step 5.1 Sitio enforces RBAC read-only mode for AUDITOR and CLIENT profiles and Zero-UUID errors', () => {
  const fx = buildFixtures();
  const refDate = '2026-06-05';

  for (const readOnlyProfile of [AUDITOR_PROFILE, CLIENT_PROFILE]) {
    const html = renderDesignacionSitioView({
      profile: readOnlyProfile,
      state: buildBaseState({
        selectedCertId: UUID_CERT,
        selectedAuditId: UUID_AUDIT_2026_NOW,
        editErrorMessage: 'Seleccione al menos 1 sitio para la auditoría.',
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
    assert.equal(html.includes('data-action="save-sitio-notes"'), false);
    const siteCheckboxes = [...html.matchAll(/<input[^>]*data-action="toggle-step4-site"[^>]*>/g)].map(
      (m) => m[0]
    );
    assert.ok(siteCheckboxes.length >= 2);
    for (const chk of siteCheckboxes) {
      assert.ok(chk.includes('disabled'), 'Read-only profile must have disabled site checkboxes');
    }
    assert.equal(assertZeroUuidExposure(html).compliant, true);
  }
});
