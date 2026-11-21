import test from 'node:test';
import assert from 'node:assert/strict';

import type { UserProfile } from './healthCheck';
import type { ConglomeradoEntity } from './conglomeradoDomain';
import type { VinculoEntity } from './vinculoDomain';
import type { AuditoriaSitioPlanItem, ProgramaAuditoriaEntity } from './auditPlanningEngine';
import type { ProgramacionAuditEntity } from './auditExecution';
import type { AuditoriaSitioTemporalEntity } from './designacionTemporalDomain';
import { assertZeroUuidExposure } from './zeroUuid';
import {
  DEFAULT_TIEMPO_STATE,
  renderTiempoView,
  type TiempoViewState,
} from '../views/tiempoView';

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
const UUID_CERT_1 = '40000000-0000-0000-0000-000000000001';
const UUID_CERT_2 = '40000000-0000-0000-0000-000000000002';
const UUID_CERT_3 = '40000000-0000-0000-0000-000000000003';

const UUID_PROG_1 = '70000000-0000-0000-0000-000000000001';
const UUID_PROG_2 = '70000000-0000-0000-0000-000000000002';
const UUID_PROG_NO_SITES = '70000000-0000-0000-0000-000000000003';

const UUID_AUDIT_1 = '80000000-0000-0000-0000-000000000001';
const UUID_AUDIT_1_PREV = '80000000-0000-0000-0000-000000000011';
const UUID_AUDIT_2 = '80000000-0000-0000-0000-000000000002';
const UUID_AUDIT_3 = '80000000-0000-0000-0000-000000000003';

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
    id_certificado: overrides.id_certificado ?? UUID_CERT_1,
    numero_certificado: overrides.numero_certificado ?? 'FN-QMS-2026-001',
    id_organizacion: UUID_ORG,
    organizacion_nombre: overrides.organizacion_nombre ?? 'Industrias Andinas S.A.',
    norma_codigo: overrides.norma_codigo ?? 'ISO 9001:2015',
    sector_iaf: 17,
    id_tipo_auditoria:
      overrides.id_tipo_auditoria === undefined ? UUID_TIPO : overrides.id_tipo_auditoria,
    tipo_auditoria: overrides.tipo_auditoria ?? 'Seguimiento 1',
    metodologia: 'Presencial',
    fecha_inicio: overrides.fecha_inicio ?? '2026-06-15',
    fecha_fin: overrides.fecha_fin ?? '2026-06-17',
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
          fecha_inicio: overrides.fecha_inicio ?? '2026-06-15',
          fecha_fin: overrides.fecha_fin ?? '2026-06-17',
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
    ...DEFAULT_TIEMPO_STATE,
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

test('Step 6.1 renderTiempoView Multi View renders Certificate-Based 4-col <colgroup> 100%, zero <button> in <tbody>, reactive facets & Zero-UUID', () => {
  const audit1 = makeAudit({
    id: UUID_AUDIT_1,
    id_programa_auditoria: UUID_PROG_1,
    id_certificado: UUID_CERT_1,
    numero_certificado: 'FN-QMS-001',
    codigo_auditoria: 'AUD-2026-001',
    tiene_sitio_temporal: true,
    sitiosPlan: [
      makeSitePlan('82000000-0000-0000-0000-000000000001', UUID_AUDIT_1, 0, 'Sede Central HQ', 5.0),
      makeSitePlan('82000000-0000-0000-0000-000000000002', UUID_AUDIT_1, 1, 'Planta Norte', 1.5),
    ],
  });
  const audit2 = makeAudit({
    id: UUID_AUDIT_2,
    id_programa_auditoria: UUID_PROG_2,
    id_certificado: UUID_CERT_2,
    numero_certificado: 'FN-OHS-002',
    codigo_auditoria: 'AUD-2026-002',
    norma_codigo: 'ISO 45001:2018',
    sitiosPlan: [
      makeSitePlan('82000000-0000-0000-0000-000000000003', UUID_AUDIT_2, 0, 'Sede Sur', 0),
    ],
  });
  const auditNoSites = makeAudit({
    id: UUID_AUDIT_3,
    id_programa_auditoria: UUID_PROG_NO_SITES,
    id_certificado: UUID_CERT_3,
    numero_certificado: 'FN-EMS-003',
    codigo_auditoria: 'AUD-2026-003',
    norma_codigo: 'ISO 14001:2015',
    sitiosPlan: [],
  });

  const programs = [
    makeProgram(UUID_PROG_1, 'Campaña QMS', [audit1]),
    makeProgram(UUID_PROG_2, 'Campaña OHS', [audit2]),
    makeProgram(UUID_PROG_NO_SITES, 'Campaña Sin Sitios', [auditNoSites]),
  ];

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
      ],
      equipoTemporal: [],
      deleted_at: null,
    },
  ];

  // Empty state with + Auditoría CTA
  const emptyHtml = renderTiempoView({
    profile: ADMIN_PROFILE,
    state: makeBaseState(),
    programs: [],
    audits: [],
    temporalSites: [],
    vinculos: SAMPLE_VINCULOS,
    conglomerados: SAMPLE_CONGLOMERADOS,
    referenceIsoDate: '2026-06-01',
  });
  assert.ok(emptyHtml.includes('open-add-audit-wizard'));
  assert.equal(assertZeroUuidExposure(emptyHtml).compliant, true);

  // Populated Certificate-Based Multi View list
  const listHtml = renderTiempoView({
    profile: WORKER_PROFILE,
    state: makeBaseState(),
    programs,
    audits: [audit1, audit2, auditNoSites],
    temporalSites,
    vinculos: SAMPLE_VINCULOS,
    conglomerados: SAMPLE_CONGLOMERADOS,
    referenceIsoDate: '2026-06-01',
  });
  assert.equal(assertZeroUuidExposure(listHtml).compliant, true);
  assert.ok(listHtml.includes('2. Tiempo (0.25d)'));
  assert.ok(listHtml.includes('FN-QMS-001'));
  assert.ok(listHtml.includes('FN-OHS-002'));
  assert.ok(listHtml.includes('FN-EMS-003'));
  assert.ok(listHtml.includes('Certificado &amp; Org') || listHtml.includes('Certificado & Org'));
  assert.ok(listHtml.includes('Última Auditoría'));
  assert.ok(listHtml.includes('Sitios Designados'));
  assert.ok(listHtml.includes('Tiempo Total'));
  assert.ok(listHtml.includes('data-action="select-section-cert"'));
  assert.ok(listHtml.includes('6.50 d'));

  // 4 columns summing 100% and zero <button> inside <tbody>
  const colgroupMatch = listHtml.match(/<colgroup>([\s\S]*?)<\/colgroup>/);
  assert.ok(colgroupMatch, 'Expected <colgroup> in tiempo-main table');
  const colWidths = [...colgroupMatch[1].matchAll(/width:\s*([\d.]+)%/g)].map((m) => Number(m[1]));
  assert.equal(colWidths.length, 4);
  const totalPct = colWidths.reduce((s, n) => s + n, 0);
  assert.ok(Math.abs(totalPct - 100) < 0.01, `Expected 100%, got ${totalPct}%`);

  const tbodyMatch = listHtml.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/);
  assert.ok(tbodyMatch, 'Expected <tbody> in tiempo-main table');
  assert.equal(tbodyMatch[1].includes('<button'), false);

  // Facet filtering (`estado_tiempo: PENDIENTE`)
  const facetPendienteHtml = renderTiempoView({
    profile: ADMIN_PROFILE,
    state: makeBaseState({
      facetSelections: { estado_tiempo: new Set(['PENDIENTE']) },
    }),
    programs,
    audits: [audit1, audit2, auditNoSites],
    temporalSites,
    vinculos: SAMPLE_VINCULOS,
    conglomerados: SAMPLE_CONGLOMERADOS,
    referenceIsoDate: '2026-06-01',
  });
  assert.ok(facetPendienteHtml.includes('FN-OHS-002'));
  assert.equal(facetPendienteHtml.includes('FN-QMS-001'), false);

  // Grid cards mode
  const gridHtml = renderTiempoView({
    profile: ADMIN_PROFILE,
    state: makeBaseState({ viewMode: 'grid' }),
    programs,
    audits: [audit1, audit2],
    temporalSites,
    vinculos: SAMPLE_VINCULOS,
    conglomerados: SAMPLE_CONGLOMERADOS,
    referenceIsoDate: '2026-06-01',
  });
  assert.ok(gridHtml.includes('data-action="select-section-cert"'));
  assert.equal(assertZeroUuidExposure(gridHtml).compliant, true);
});

test('Step 6.1 renderTiempoView Detail View renders auditSectionShell (no linked siblings), Sitio 0 first, 0.25d presets/steppers, Temporal note, empty sites CTA, and RBAC read-only', () => {
  const auditLatest = makeAudit({
    id: UUID_AUDIT_1,
    id_programa_auditoria: UUID_PROG_1,
    id_certificado: UUID_CERT_1,
    numero_certificado: 'FN-QMS-001',
    codigo_auditoria: 'AUD-2026-002',
    fecha_inicio: '2026-08-10',
    fecha_fin: '2026-08-12',
    tiene_sitio_temporal: true,
    sitiosPlan: [
      makeSitePlan('82000000-0000-0000-0000-000000000002', UUID_AUDIT_1, 1, 'Planta Norte', 1.5),
      makeSitePlan('82000000-0000-0000-0000-000000000001', UUID_AUDIT_1, 0, 'Sede Central HQ', 5.0),
    ],
  });
  const auditPrev = makeAudit({
    id: UUID_AUDIT_1_PREV,
    id_programa_auditoria: UUID_PROG_1,
    id_certificado: UUID_CERT_1,
    numero_certificado: 'FN-QMS-001',
    codigo_auditoria: 'AUD-2025-001',
    fecha_inicio: '2025-08-10',
    fecha_fin: '2025-08-11',
    sitiosPlan: [],
  });

  const prog = makeProgram(UUID_PROG_1, 'Campaña QMS', [auditLatest, auditPrev]);

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
    ],
    equipoTemporal: [],
    deleted_at: null,
  };

  for (const staffProfile of [ADMIN_PROFILE, WORKER_PROFILE]) {
    const staffDetailHtml = renderTiempoView({
      profile: staffProfile,
      state: makeBaseState({
        selectedCertId: UUID_CERT_1,
        selectedAuditId: UUID_AUDIT_1,
      }),
      programs: [prog],
      audits: [auditLatest, auditPrev],
      temporalSites: [sharedTemporal],
      vinculos: SAMPLE_VINCULOS,
      conglomerados: SAMPLE_CONGLOMERADOS,
      referenceIsoDate: '2026-06-01',
    });

    assert.equal(assertZeroUuidExposure(staffDetailHtml).compliant, true);
    // Audit Section Shell (◀/▶, no linked siblings bar)
    assert.ok(staffDetailHtml.includes('data-testid="audit-section-shell"'));
    assert.equal(staffDetailHtml.includes('data-action="select-linked-sibling-audit"'), false);
    assert.ok(staffDetailHtml.includes('AUD-2026-002'));

    // Summary banner & live total
    assert.ok(staffDetailHtml.includes('data-testid="tiempo-summary-banner"'));
    assert.ok(staffDetailHtml.includes('Total de Días de la Auditoría:'));
    assert.ok(staffDetailHtml.includes('6.50 días-auditor'));

    // Temporal note linking back to 1.4 Temporal
    assert.ok(staffDetailHtml.includes('data-testid="tiempo-temporal-note"'));
    assert.ok(staffDetailHtml.includes('Proyecto Obra Sur'));
    assert.ok(staffDetailHtml.includes('1.00 días-auditor'));
    assert.ok(staffDetailHtml.includes('1.4 Temporal'));

    // Site 0.25d controls & quick presets
    assert.ok(staffDetailHtml.includes('data-action="step-tiempo-site-days"'));
    assert.ok(staffDetailHtml.includes('data-action="change-tiempo-site-days"'));
    assert.ok(staffDetailHtml.includes('min="0.25"'));
    assert.ok(staffDetailHtml.includes('step="0.25"'));
    assert.ok(staffDetailHtml.includes('data-action="set-tiempo-site-days-preset"'));
    assert.ok(staffDetailHtml.includes('data-action="change-tiempo-site-modality"'));
    assert.ok(staffDetailHtml.includes('3. Auditor →'));

    // Verify Sitio 0 (HQ) renders before Sitio 1
    const hqIdx = staffDetailHtml.indexOf('Sede Central HQ');
    const plantaIdx = staffDetailHtml.indexOf('Planta Norte');
    assert.ok(hqIdx > 0 && plantaIdx > hqIdx, 'Sitio 0 (HQ) must render before Sitio 1');
  }

  // Empty sites state links directly to 1. Designación -> Sitio
  const emptySitesDetailHtml = renderTiempoView({
    profile: ADMIN_PROFILE,
    state: makeBaseState({
      selectedCertId: UUID_CERT_1,
      selectedAuditId: UUID_AUDIT_1_PREV,
    }),
    programs: [prog],
    audits: [auditLatest, auditPrev],
    temporalSites: [],
    referenceIsoDate: '2026-06-01',
  });
  assert.ok(emptySitesDetailHtml.includes('data-testid="tiempo-empty-sites-state"'));
  assert.ok(emptySitesDetailHtml.includes('data-target-subview="designacion/sitio"'));

  // RBAC Read-Only for AUDITOR and CLIENT
  for (const roProfile of [AUDITOR_PROFILE, CLIENT_PROFILE]) {
    const roDetailHtml = renderTiempoView({
      profile: roProfile,
      state: makeBaseState({
        selectedCertId: UUID_CERT_1,
        selectedAuditId: UUID_AUDIT_1,
      }),
      programs: [prog],
      audits: [auditLatest, auditPrev],
      temporalSites: [sharedTemporal],
      vinculos: SAMPLE_VINCULOS,
      conglomerados: SAMPLE_CONGLOMERADOS,
      referenceIsoDate: '2026-06-01',
    });

    assert.equal(assertZeroUuidExposure(roDetailHtml).compliant, true);
    assert.ok(roDetailHtml.includes('Solo lectura'));
    assert.equal(roDetailHtml.includes('data-action="step-tiempo-site-days"'), false);
    assert.equal(roDetailHtml.includes('data-action="change-tiempo-site-days"'), false);
    assert.equal(roDetailHtml.includes('data-action="set-tiempo-site-days-preset"'), false);
    assert.equal(roDetailHtml.includes('data-action="change-tiempo-site-modality"'), false);
    assert.ok(roDetailHtml.includes('6.50 días-auditor'));
  }
});
