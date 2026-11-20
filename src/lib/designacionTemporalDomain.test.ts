import test from 'node:test';
import assert from 'node:assert/strict';

import type { UserProfile } from './healthCheck';
import type { ConglomeradoEntity } from './conglomeradoDomain';
import type { VinculoEntity } from './vinculoDomain';
import type { ProgramaAuditoriaEntity } from './auditPlanningEngine';
import type { ProgramacionAuditEntity } from './auditExecution';
import { assertZeroUuidExposure } from './zeroUuid';
import {
  computeCampaignTemporalRows,
  createEmptyTemporalSiteDraft,
  createTemporalSiteDraftFromEntity,
  getTemporalPendingStatusMeta,
  normalizeTemporalSiteLabel,
  validateTemporalSiteDraft,
  type AuditoriaSitioTemporalEntity,
} from './designacionTemporalDomain';
import {
  renderDesignacionTemporalView,
  type DesignacionTemporalViewState,
} from '../views/designacionTemporalView';

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

const UUID_PROG_ELIGIBLE = '70000000-0000-0000-0000-000000000001';
const UUID_PROG_NO_TEMP = '70000000-0000-0000-0000-000000000002';
const UUID_PROG_NO_STEP3 = '70000000-0000-0000-0000-000000000003';
const UUID_PROG_SIN_TIEMPO = '70000000-0000-0000-0000-000000000004';
const UUID_PROG_COMPLETO = '70000000-0000-0000-0000-000000000005';

const UUID_AUDIT_1 = '80000000-0000-0000-0000-000000000001';
const UUID_AUDIT_2 = '80000000-0000-0000-0000-000000000002';
const UUID_AUDIT_NO_TEMP = '80000000-0000-0000-0000-000000000003';
const UUID_AUDIT_NO_STEP3 = '80000000-0000-0000-0000-000000000004';
const UUID_AUDIT_SIN_TIEMPO = '80000000-0000-0000-0000-000000000005';
const UUID_AUDIT_COMPLETO = '80000000-0000-0000-0000-000000000006';
const UUID_FOREIGN_AUDIT = '80000000-0000-0000-0000-000000000099';

const UUID_TEMP_1 = '9a000000-0000-0000-0000-000000000001';
const UUID_TEMP_2 = '9a000000-0000-0000-0000-000000000002';
const UUID_TEMP_COMPLETO = '9a000000-0000-0000-0000-000000000003';

function makeAudit(overrides: Partial<ProgramacionAuditEntity>): ProgramacionAuditEntity {
  const id = overrides.id ?? UUID_AUDIT_1;
  return {
    id,
    id_programa_auditoria: overrides.id_programa_auditoria ?? UUID_PROG_ELIGIBLE,
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
    latestDate:
      overrides.latestDate === undefined
        ? {
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
          }
        : overrides.latestDate,
    dias_auditor: 2,
    tiempo_auditoria: 2,
    estatus: 'Planificado',
    estado_ciclo: 'Programada',
    tiene_sitio_temporal: overrides.tiene_sitio_temporal ?? true,
    auditor_lider_id: '10000000-0000-0000-0000-000000000001',
    auditor_lider: 'Ing. Carlos Mendoza',
    sede_principal_direccion: 'Av. Industrial 100',
    equipo: [],
    sitiosMuestreo: [],
    sitiosPlan: [],
    matrizNormativa: [],
    deleted_at: overrides.deleted_at ?? null,
  };
}

function makeProgram(
  id: string,
  etiqueta: string,
  auditorias: ProgramacionAuditEntity[],
  tieneTemporal = true
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
    tiene_sitio_temporal: tieneTemporal,
    id_ciclo_origen: null,
    notas: null,
    deleted_at: null,
    auditorias,
  };
}

function makeBaseViewState(
  overrides: Partial<DesignacionTemporalViewState> = {}
): DesignacionTemporalViewState {
  return {
    query: '',
    viewMode: 'list',
    isSidebarOpen: true,
    sortColumn: null,
    sortDirection: 'none',
    facetSelections: {},
    selectedProgramId: null,
    isCreatingTemporalSite: false,
    editingTemporalSiteId: null,
    confirmArchiveTemporalId: null,
    formDraft: undefined,
    editErrorMessage: null,
    saving: false,
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
    certificados_count: 2,
    deleted_at: null,
  },
];

const SAMPLE_VINCULOS: VinculoEntity[] = [
  {
    id: UUID_VINCULO,
    id_grupo_empresarial: UUID_GRUPO,
    grupo_nombre: 'Grupo Industrial Andino',
    codigo_vinculo: 'VINC-001',
    etiqueta: 'Vínculo SGC + SGA',
    nivel_vinculacion: 'NIVEL_1_INTRA_ORG',
    tipo_vinculacion: 'Integrada',
    es_vinculada: true,
    tiene_sitio_temporal: true,
    notas: null,
    certificados: [],
    deleted_at: null,
  },
];

test('computeCampaignTemporalRows filters strictly to tiene_sitio_temporal=true + complete Step 3 and classifies pendingStatus', () => {
  const progEligibleNoTempRows = makeProgram(UUID_PROG_ELIGIBLE, 'Campaña Sin Config', [
    makeAudit({
      id: UUID_AUDIT_1,
      id_programa_auditoria: UUID_PROG_ELIGIBLE,
      numero_certificado: 'FN-QMS-001',
      tiene_sitio_temporal: true,
    }),
    makeAudit({
      id: UUID_AUDIT_2,
      id_programa_auditoria: UUID_PROG_ELIGIBLE,
      numero_certificado: 'FN-EMS-002',
      norma_codigo: 'ISO 14001:2015',
      tiene_sitio_temporal: false,
    }),
  ]);

  const progExcludedFlagFalse = makeProgram(
    UUID_PROG_NO_TEMP,
    'Campaña Flag Apagado',
    [
      makeAudit({
        id: UUID_AUDIT_NO_TEMP,
        id_programa_auditoria: UUID_PROG_NO_TEMP,
        tiene_sitio_temporal: false,
      }),
    ],
    false
  );

  const progExcludedIncompleteStep3 = makeProgram(UUID_PROG_NO_STEP3, 'Campaña Sin Paso 3', [
    makeAudit({
      id: UUID_AUDIT_NO_STEP3,
      id_programa_auditoria: UUID_PROG_NO_STEP3,
      id_tipo_auditoria: null,
      fechas: [],
      latestDate: null,
      tiene_sitio_temporal: true,
    }),
  ]);

  const progSinTiempo = makeProgram(UUID_PROG_SIN_TIEMPO, 'Campaña Sin Tiempo', [
    makeAudit({
      id: UUID_AUDIT_SIN_TIEMPO,
      id_programa_auditoria: UUID_PROG_SIN_TIEMPO,
      tiene_sitio_temporal: true,
    }),
  ]);

  const progCompleto = makeProgram(UUID_PROG_COMPLETO, 'Campaña Completa', [
    makeAudit({
      id: UUID_AUDIT_COMPLETO,
      id_programa_auditoria: UUID_PROG_COMPLETO,
      tiene_sitio_temporal: true,
    }),
  ]);

  const temporalSites: AuditoriaSitioTemporalEntity[] = [
    {
      id: UUID_TEMP_1,
      id_auditoria: UUID_AUDIT_SIN_TIEMPO,
      etiqueta: 'Sitio Temporal',
      comentario: null,
      tiempo_auditoria: 0,
      certificados: [],
      equipoTemporal: [],
      deleted_at: null,
    },
    {
      id: UUID_TEMP_COMPLETO,
      id_auditoria: UUID_AUDIT_COMPLETO,
      etiqueta: 'Obra Planta Norte',
      comentario: 'Nave B',
      tiempo_auditoria: 1.25,
      certificados: [
        {
          id: '9b000000-0000-0000-0000-000000000001',
          id_sitio_temporal: UUID_TEMP_COMPLETO,
          id_auditoria_certificado: UUID_AUDIT_COMPLETO,
          numero_certificado: 'FN-QMS-2026-006',
          organizacion_nombre: 'Industrias Andinas S.A.',
          norma_codigo: 'ISO 9001:2015',
        },
      ],
      equipoTemporal: [
        {
          id: '9c000000-0000-0000-0000-000000000001',
          id_sitio_temporal: UUID_TEMP_COMPLETO,
          id_auditor: '10000000-0000-0000-0000-000000000001',
          auditor_nombre: 'Ing. Carlos Mendoza',
          rol_auditor: 'AUDITOR_LIDER',
          tiempo_auditoria: 1.25,
        },
      ],
      deleted_at: null,
    },
    {
      id: UUID_TEMP_2,
      id_auditoria: UUID_AUDIT_1,
      etiqueta: 'Sitio Archivado Ignorado',
      comentario: null,
      tiempo_auditoria: 2,
      certificados: [],
      equipoTemporal: [],
      deleted_at: '2026-01-01T00:00:00Z',
    },
  ];

  const rows = computeCampaignTemporalRows(
    [
      progEligibleNoTempRows,
      progExcludedFlagFalse,
      progExcludedIncompleteStep3,
      progSinTiempo,
      progCompleto,
    ],
    temporalSites
  );

  assert.equal(rows.length, 3);
  assert.equal(rows.some((r) => r.program.id === UUID_PROG_NO_TEMP), false);
  assert.equal(rows.some((r) => r.program.id === UUID_PROG_NO_STEP3), false);

  const rowSinSitio = rows.find((r) => r.program.id === UUID_PROG_ELIGIBLE);
  assert.ok(rowSinSitio);
  assert.equal(rowSinSitio.pendingStatus, 'SIN_SITIO_TEMPORAL');
  assert.equal(rowSinSitio.temporalSites.length, 0);

  const rowSinTiempo = rows.find((r) => r.program.id === UUID_PROG_SIN_TIEMPO);
  assert.ok(rowSinTiempo);
  assert.equal(rowSinTiempo.pendingStatus, 'SIN_TIEMPO');

  const rowCompleto = rows.find((r) => r.program.id === UUID_PROG_COMPLETO);
  assert.ok(rowCompleto);
  assert.equal(rowCompleto.pendingStatus, 'COMPLETO');
  assert.equal(rowCompleto.totalTemporalDays, 1.25);
  assert.equal(rowCompleto.assignedTemporalDays, 1.25);

  // Also test SIN_AUDITORES transition when team days != total days
  const temporalMissingTeam: AuditoriaSitioTemporalEntity[] = [
    {
      ...temporalSites[1],
      equipoTemporal: [],
    },
  ];
  const rowsSinAuditores = computeCampaignTemporalRows([progCompleto], temporalMissingTeam);
  assert.equal(rowsSinAuditores[0]?.pendingStatus, 'SIN_AUDITORES');
  assert.equal(getTemporalPendingStatusMeta('SIN_AUDITORES').label, 'Sin auditores asignados');
});

test('validateTemporalSiteDraft & normalizeTemporalSiteLabel enforce default label, 0.25d steps, and >=1 campaign cert', () => {
  assert.equal(normalizeTemporalSiteLabel(''), 'Sitio Temporal');
  assert.equal(normalizeTemporalSiteLabel('   '), 'Sitio Temporal');
  assert.equal(normalizeTemporalSiteLabel('  Proyecto Obra Sur  '), 'Proyecto Obra Sur');

  const campaignAudits = [
    makeAudit({ id: UUID_AUDIT_1, tiene_sitio_temporal: true }),
    makeAudit({ id: UUID_AUDIT_2, tiene_sitio_temporal: false }),
  ];

  const defaultDraft = createEmptyTemporalSiteDraft(UUID_AUDIT_1, [UUID_AUDIT_1, UUID_AUDIT_2]);
  assert.equal(defaultDraft.etiqueta, 'Sitio Temporal');
  assert.equal(defaultDraft.tiempo_auditoria, 1.0);
  assert.equal(validateTemporalSiteDraft(defaultDraft, campaignAudits), null);

  // Rejects non-0.25d steps (e.g. 0.10d)
  const badStepErr = validateTemporalSiteDraft(
    { ...defaultDraft, tiempo_auditoria: 0.1 },
    campaignAudits
  );
  assert.ok(badStepErr && badStepErr.includes('0.25'));

  // Rejects <= 0 days
  const zeroDaysErr = validateTemporalSiteDraft(
    { ...defaultDraft, tiempo_auditoria: 0 },
    campaignAudits
  );
  assert.ok(zeroDaysErr && zeroDaysErr.includes('mayor a 0'));

  // Requires at least 1 certificate selected
  const noCertsErr = validateTemporalSiteDraft(
    { ...defaultDraft, targetAuditCertIds: [] },
    campaignAudits
  );
  assert.ok(noCertsErr && noCertsErr.includes('al menos un certificado'));

  // Rejects anchor audit without tiene_sitio_temporal === true
  const anchorFalseErr = validateTemporalSiteDraft(
    { ...defaultDraft, id_auditoria: UUID_AUDIT_2 },
    campaignAudits
  );
  assert.ok(anchorFalseErr && anchorFalseErr.includes('Sitio Temporal'));

  // Rejects certificates outside the current campaign
  const foreignCertErr = validateTemporalSiteDraft(
    { ...defaultDraft, targetAuditCertIds: [UUID_FOREIGN_AUDIT] },
    campaignAudits
  );
  assert.ok(foreignCertErr && foreignCertErr.includes('campaña actual'));

  const cloned = createTemporalSiteDraftFromEntity({
    id: UUID_TEMP_1,
    id_auditoria: UUID_AUDIT_1,
    etiqueta: '',
    comentario: 'Obra temporal',
    tiempo_auditoria: 1.5,
    certificados: [
      {
        id: '9b000000-0000-0000-0000-000000000011',
        id_sitio_temporal: UUID_TEMP_1,
        id_auditoria_certificado: UUID_AUDIT_1,
        numero_certificado: 'FN-QMS-001',
        organizacion_nombre: 'Industrias Andinas S.A.',
        norma_codigo: 'ISO 9001:2015',
        deleted_at: null,
      },
    ],
    equipoTemporal: [],
    deleted_at: null,
  });
  assert.equal(cloned.etiqueta, 'Sitio Temporal');
  assert.deepEqual(cloned.targetAuditCertIds, [UUID_AUDIT_1]);
});

test('renderDesignacionTemporalView enforces <colgroup> 100%, 0 <button> inside <td>, empty state CTA, Zero-UUID & RBAC', () => {
  const prog = makeProgram(UUID_PROG_ELIGIBLE, 'Campaña Obra Sur', [
    makeAudit({
      id: UUID_AUDIT_1,
      id_programa_auditoria: UUID_PROG_ELIGIBLE,
      numero_certificado: 'FN-QMS-001',
      tiene_sitio_temporal: true,
    }),
    makeAudit({
      id: UUID_AUDIT_2,
      id_programa_auditoria: UUID_PROG_ELIGIBLE,
      numero_certificado: 'FN-EMS-002',
      norma_codigo: 'ISO 14001:2015',
      tiene_sitio_temporal: false,
    }),
  ]);

  const temporalSite: AuditoriaSitioTemporalEntity = {
    id: UUID_TEMP_1,
    id_auditoria: UUID_AUDIT_1,
    etiqueta: 'Sitio Temporal — Nave B',
    comentario: 'Ampliación de línea productiva',
    tiempo_auditoria: 0.75,
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

  // 1. Empty state renders direct "Ir a Paso 4: Sitio" CTA
  const emptyHtml = renderDesignacionTemporalView({
    profile: ADMIN_PROFILE,
    state: makeBaseViewState(),
    programs: [],
    temporalSites: [],
    vinculos: SAMPLE_VINCULOS,
    conglomerados: SAMPLE_CONGLOMERADOS,
  });
  assert.ok(emptyHtml.includes('Ir a Paso 4: Sitio'));
  assert.ok(emptyHtml.includes('data-subview="designacion/sitio"'));
  assertZeroUuidExposure(emptyHtml);

  // 2. Multi View table: <colgroup> sums 100%, 0 <button> inside <tbody>
  const multiHtml = renderDesignacionTemporalView({
    profile: WORKER_PROFILE,
    state: makeBaseViewState(),
    programs: [prog],
    temporalSites: [temporalSite],
    vinculos: SAMPLE_VINCULOS,
    conglomerados: SAMPLE_CONGLOMERADOS,
  });
  assertZeroUuidExposure(multiHtml);

  const colgroupMatch = multiHtml.match(/<colgroup>([\s\S]*?)<\/colgroup>/);
  assert.ok(colgroupMatch, 'Expected <colgroup> in Multi View table');
  const colWidths = [...colgroupMatch[1].matchAll(/width:\s*([\d.]+)%/g)].map((m) =>
    Number(m[1])
  );
  assert.equal(colWidths.length, 5);
  const totalPct = colWidths.reduce((s, n) => s + n, 0);
  assert.ok(Math.abs(totalPct - 100) < 0.01, `Expected 100%, got ${totalPct}%`);

  const tbodyMatch = multiHtml.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/);
  assert.ok(tbodyMatch, 'Expected <tbody> in Multi View table');
  assert.equal(tbodyMatch[1].includes('<button'), false);
  assert.ok(multiHtml.includes('Sitio Temporal — Nave B'));
  assert.ok(multiHtml.includes('0.75 d'));
  assert.ok(multiHtml.includes('2 certs cubiertos'));

  // 2b. Facet filtering for Pendientes (Sin auditores asignados vs Completo)
  const facetAuditorsHtml = renderDesignacionTemporalView({
    profile: ADMIN_PROFILE,
    state: makeBaseViewState({
      facetSelections: { pendientes: new Set(['SIN_AUDITORES']) },
    }),
    programs: [prog],
    temporalSites: [temporalSite],
    vinculos: SAMPLE_VINCULOS,
    conglomerados: SAMPLE_CONGLOMERADOS,
  });
  assert.ok(facetAuditorsHtml.includes('Campaña Obra Sur'));

  const facetCompletoEmptyHtml = renderDesignacionTemporalView({
    profile: ADMIN_PROFILE,
    state: makeBaseViewState({
      facetSelections: { pendientes: new Set(['COMPLETO']) },
    }),
    programs: [prog],
    temporalSites: [temporalSite],
    vinculos: SAMPLE_VINCULOS,
    conglomerados: SAMPLE_CONGLOMERADOS,
  });
  assert.equal(facetCompletoEmptyHtml.includes('Campaña Obra Sur'), false);

  // 3. Detail View with open create/edit form + RBAC
  const staffDetailHtml = renderDesignacionTemporalView({
    profile: ADMIN_PROFILE,
    state: makeBaseViewState({
      selectedProgramId: UUID_PROG_ELIGIBLE,
      isCreatingTemporalSite: true,
      formDraft: createEmptyTemporalSiteDraft(UUID_AUDIT_1, [UUID_AUDIT_1, UUID_AUDIT_2]),
    }),
    programs: [prog],
    temporalSites: [temporalSite],
    vinculos: SAMPLE_VINCULOS,
    conglomerados: SAMPLE_CONGLOMERADOS,
  });
  assertZeroUuidExposure(staffDetailHtml);
  assert.ok(staffDetailHtml.includes('id="temporalSiteForm"'));
  assert.ok(staffDetailHtml.includes('data-action="step-temporal-days"'));
  assert.ok(staffDetailHtml.includes('Paso 6: Tiempo'));
  assert.ok(staffDetailHtml.includes('Paso 7: Asignación'));
  assert.ok(staffDetailHtml.includes('Paso 8: Programa'));
  assert.ok(staffDetailHtml.includes('data-action="edit-temporal-site"'));
  assert.ok(staffDetailHtml.includes('data-action="request-archive-temporal-site"'));

  // Read-only for AUDITOR & CLIENT
  for (const roProfile of [AUDITOR_PROFILE, CLIENT_PROFILE]) {
    const roDetailHtml = renderDesignacionTemporalView({
      profile: roProfile,
      state: makeBaseViewState({
        selectedProgramId: UUID_PROG_ELIGIBLE,
        isCreatingTemporalSite: true,
      }),
      programs: [prog],
      temporalSites: [temporalSite],
      vinculos: SAMPLE_VINCULOS,
      conglomerados: SAMPLE_CONGLOMERADOS,
    });
    assertZeroUuidExposure(roDetailHtml);
    assert.ok(roDetailHtml.includes('Solo lectura'));
    assert.equal(roDetailHtml.includes('id="temporalSiteForm"'), false);
    assert.equal(roDetailHtml.includes('data-action="edit-temporal-site"'), false);
    assert.equal(roDetailHtml.includes('data-action="request-archive-temporal-site"'), false);
  }
});
