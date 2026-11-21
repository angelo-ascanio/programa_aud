import test from 'node:test';
import assert from 'node:assert/strict';

import type { UserProfile } from './healthCheck';
import type { ProgramacionAuditEntity } from './auditExecution';
import type { ProgramaAuditoriaEntity } from './auditPlanningEngine';
import type { CertificateRecord } from './searchControls';
import {
  buildCertificateFechaRows,
  buildLinkedBatchDateSyncPlan,
  buildPlannedDateDraftsFromAudit,
  createEmptyPlannedDateDraft,
  extractActivePlannedDates,
  extractRealExecutionDates,
  togglePlannedDateDraftMode,
  validatePlannedDatesList,
} from './designacionFechaDomain';
import {
  DEFAULT_DESIGNACION_FECHA_STATE,
  renderDesignacionFechaView,
  type DesignacionFechaViewState,
} from '../views/designacionFechaView';
import { assertZeroUuidExposure } from './zeroUuid';

const ADMIN_PROFILE: UserProfile = {
  id: '00000000-0000-0000-0000-000000000001',
  nombre: 'Admin Calidad',
  role: 'ADMIN',
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

const UUID_ORG = '30000000-0000-0000-0000-000000000001';
const UUID_CERT_1 = '40000000-0000-0000-0000-000000000001';
const UUID_CERT_2 = '40000000-0000-0000-0000-000000000002';
const UUID_CERT_EMPTY = '40000000-0000-0000-0000-000000000099';
const UUID_PROG = '7a000000-0000-0000-0000-000000000001';
const UUID_AUD_1 = '80000000-0000-0000-0000-000000000001';
const UUID_AUD_1_OLD = '80000000-0000-0000-0000-000000000011';
const UUID_AUD_2 = '80000000-0000-0000-0000-000000000002';

function makeFixtures(): {
  certificates: CertificateRecord[];
  audits: ProgramacionAuditEntity[];
  programs: ProgramaAuditoriaEntity[];
} {
  const certificates: CertificateRecord[] = [
    {
      id: UUID_CERT_1,
      numero_certificado: 'FN-QMS-2026-001',
      organizacion_nombre: 'Iberometal Componentes S.A.',
      norma: 'ISO 9001:2015',
      estatus: 'Activo',
      sector_iaf: 17,
    },
    {
      id: UUID_CERT_2,
      numero_certificado: 'FN-EMS-2026-002',
      organizacion_nombre: 'Iberometal Componentes S.A.',
      norma: 'ISO 14001:2015',
      estatus: 'Activo',
      sector_iaf: 17,
    },
    {
      id: UUID_CERT_EMPTY,
      numero_certificado: 'FN-OHS-2026-099',
      organizacion_nombre: 'Iberometal Componentes S.A.',
      norma: 'ISO 45001:2018',
      estatus: 'Estudio',
      sector_iaf: 17,
    },
  ];

  const baseAudit = (
    overrides: Partial<ProgramacionAuditEntity>
  ): ProgramacionAuditEntity => ({
    id: UUID_AUD_1,
    id_programa_auditoria: UUID_PROG,
    codigo_auditoria: 'AUD-2026-QMS',
    id_certificado: UUID_CERT_1,
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
    objetivo: 'Seguimiento anual.',
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

  const aud1 = baseAudit({
    id: UUID_AUD_1,
    fechas: [
      {
        id: '81000000-0000-0000-0000-000000000001',
        id_auditoria: UUID_AUD_1,
        numero_secuencia: 1,
        tag: 'Programación',
        tipo_fecha: 'PREPROGRAMADA_MES',
        anio: 2026,
        mes: 5,
        fecha_inicio: null,
        fecha_fin: null,
        observacion: 'Mes inicial',
        deleted_at: null,
      },
      {
        id: '81000000-0000-0000-0000-000000000002',
        id_auditoria: UUID_AUD_1,
        numero_secuencia: 2,
        tag: 'Reprogramación',
        tipo_fecha: 'PROGRAMADA_EXACTA',
        anio: null,
        mes: null,
        fecha_inicio: '2026-06-15',
        fecha_fin: '2026-06-17',
        observacion: 'Confirmada con planta',
        deleted_at: null,
      },
      {
        id: '81000000-0000-0000-0000-000000000003',
        id_auditoria: UUID_AUD_1,
        numero_secuencia: 3,
        tag: 'Ejecución',
        tipo_fecha: 'REAL',
        anio: null,
        mes: null,
        fecha_inicio: '2026-06-16',
        fecha_fin: '2026-06-17',
        observacion: 'Cierre en campo',
        deleted_at: null,
      },
    ],
  });

  const aud1Old = baseAudit({
    id: UUID_AUD_1_OLD,
    id_programa_auditoria: null,
    codigo_auditoria: 'AUD-2025-QMS',
    tipo_auditoria: 'Otorgamiento Fase 2',
    fecha_inicio: '2025-05-10',
    fecha_fin: '2025-05-12',
    estado_ciclo: 'Cerrada',
    fechas: [
      {
        id: '81000000-0000-0000-0000-000000000011',
        id_auditoria: UUID_AUD_1_OLD,
        numero_secuencia: 1,
        tag: 'Programación',
        tipo_fecha: 'PREPROGRAMADA_MES',
        anio: 2025,
        mes: 5,
        fecha_inicio: null,
        fecha_fin: null,
        observacion: null,
        deleted_at: null,
      },
    ],
  });

  const aud2 = baseAudit({
    id: UUID_AUD_2,
    codigo_auditoria: 'AUD-2026-EMS',
    id_certificado: UUID_CERT_2,
    numero_certificado: 'FN-EMS-2026-002',
    norma_codigo: 'ISO 14001:2015',
    fechas: [
      {
        id: '81000000-0000-0000-0000-000000000021',
        id_auditoria: UUID_AUD_2,
        numero_secuencia: 1,
        tag: 'Programación',
        tipo_fecha: 'PREPROGRAMADA_MES',
        anio: 2026,
        mes: 5,
        fecha_inicio: null,
        fecha_fin: null,
        observacion: null,
        deleted_at: null,
      },
    ],
  });

  const program: ProgramaAuditoriaEntity = {
    id: UUID_PROG,
    id_vinculo: '7c000000-0000-0000-0000-000000000001',
    id_grupo_empresarial: '20000000-0000-0000-0000-000000000001',
    codigo_programa: 'PROG-2026-001',
    etiqueta: 'Campaña Integrada Iberometal',
    nivel_vinculacion: 'NIVEL_1_INTRA_ORG',
    tipo_vinculacion: 'Integrada',
    es_vinculada: true,
    tiene_sitio_temporal: false,
    notas: null,
    deleted_at: null,
    auditorias: [aud1, aud2],
  };

  return {
    certificates,
    audits: [aud1, aud1Old, aud2],
    programs: [program],
  };
}

test('extractActivePlannedDates excludes REAL dates while extractRealExecutionDates isolates them', () => {
  const fx = makeFixtures();
  const aud1 = fx.audits[0];
  const planned = extractActivePlannedDates(aud1);
  const real = extractRealExecutionDates(aud1);

  assert.equal(planned.length, 2);
  assert.deepEqual(
    planned.map((p) => p.tipo_fecha),
    ['PREPROGRAMADA_MES', 'PROGRAMADA_EXACTA']
  );
  assert.equal(real.length, 1);
  assert.equal(real[0].tipo_fecha, 'REAL');
  assert.equal(real[0].fecha_inicio, '2026-06-16');
});

test('togglePlannedDateDraftMode, validatePlannedDatesList & buildLinkedBatchDateSyncPlan handle Mes+Año, Exacta, Single-Day and batch sync safely', () => {
  const fx = makeFixtures();
  const d1 = createEmptyPlannedDateDraft(0, '2026-06-01', 'r1');
  assert.equal(d1.tipo_fecha, 'PREPROGRAMADA_MES');
  assert.equal(d1.anio, 2026);
  assert.equal(d1.mes, 6);

  const d1Exact = togglePlannedDateDraftMode(d1, 'PROGRAMADA_EXACTA');
  assert.equal(d1Exact.tipo_fecha, 'PROGRAMADA_EXACTA');
  assert.equal(d1Exact.singleDay, true);
  assert.equal(d1Exact.fecha_inicio, '2026-06-01');
  assert.equal(d1Exact.fecha_fin, '2026-06-01');

  const d2Multi = {
    ...togglePlannedDateDraftMode(createEmptyPlannedDateDraft(1, '2026-06-01', 'r2'), 'PROGRAMADA_EXACTA'),
    singleDay: false,
    fecha_inicio: '2026-07-10',
    fecha_fin: '2026-07-12',
    observacion: 'Ventana confirmada',
  };

  // Rejects inverted range
  const invalidRange = validatePlannedDatesList([
    { ...d2Multi, fecha_fin: '2026-07-08' },
  ]);
  assert.equal(invalidRange.valid, false);
  assert.ok(invalidRange.error && invalidRange.error.includes('anterior'));

  // Accepts mixed single-day and multi-day/month drafts cleanly
  const validResult = validatePlannedDatesList([d1, d2Multi]);
  assert.equal(validResult.valid, true);
  assert.equal(validResult.normalized.length, 2);
  assert.equal(validResult.normalized[0].tipo_fecha, 'PREPROGRAMADA_MES');
  assert.equal(validResult.normalized[1].fecha_inicio, '2026-07-10');
  assert.equal(validResult.normalized[1].fecha_fin, '2026-07-12');

  // Linked batch sync plan: aud1 has 2 planned + 1 REAL (seq 3); aud2 has 1 planned -> saving 2 planned rows:
  // aud1 updates seq 1 & 2, keeps REAL #3 untouched; aud2 updates seq 1 & inserts seq 2
  const syncOps = buildLinkedBatchDateSyncPlan(
    [fx.audits[0], fx.audits[2]],
    validResult.normalized
  );
  assert.equal(syncOps.length, 2);
  assert.equal(syncOps[0].toUpdate.length, 2);
  assert.equal(syncOps[0].toArchive.length, 0);
  assert.equal(syncOps[0].toInsert.length, 0);

  assert.equal(syncOps[1].toUpdate.length, 1);
  assert.equal(syncOps[1].toArchive.length, 0);
  assert.equal(syncOps[1].toInsert.length, 1);
  assert.equal(syncOps[1].toInsert[0].numero_secuencia, 2);

  // Shrinking from 2 planned rows down to 1 archives excess planned row (#2) on aud1 without touching REAL (#3)
  const shrinkPlan = buildLinkedBatchDateSyncPlan(
    [fx.audits[0]],
    [validResult.normalized[0]]
  );
  assert.equal(shrinkPlan[0].toUpdate.length, 1);
  assert.deepEqual(shrinkPlan[0].toArchive, [
    { dateId: '81000000-0000-0000-0000-000000000002', numero_secuencia: 2 },
  ]);

  const rows = buildCertificateFechaRows({
    certificates: fx.certificates,
    audits: fx.audits,
    programs: fx.programs,
    referenceIsoDate: '2026-06-01',
  });
  assert.equal(rows.length, 3);
  const qmsRow = rows.find((r) => r.certId === UUID_CERT_1);
  assert.ok(qmsRow);
  assert.equal(qmsRow.plannedDatesCount, 2);
  assert.equal(qmsRow.realDatesCount, 1);
  assert.equal(qmsRow.precisionKind, 'PROGRAMADA_EXACTA');
});

test('renderDesignacionFechaView enforces Certificate Multi View, Clean Table, NO linked-siblings bar, dynamic 1:N rows & RBAC', () => {
  const fx = makeFixtures();

  // 1. Multi View: Certificate-Based, Clean Table (<colgroup>=100%, 0 <button> in <tbody>), Zero-UUID
  const multiHtml = renderDesignacionFechaView({
    profile: ADMIN_PROFILE,
    state: { ...DEFAULT_DESIGNACION_FECHA_STATE },
    certificates: fx.certificates,
    audits: fx.audits,
    programs: fx.programs,
    referenceIsoDate: '2026-06-01',
    headerAddAuditHtml: '<button type="button" data-action="open-add-audit-wizard">+ Auditoría</button>',
  });
  assert.ok(multiHtml.includes('data-mv-domain="designacion-fecha"'));
  assert.ok(multiHtml.includes('FN-QMS-2026-001'));
  assert.ok(multiHtml.includes('FN-OHS-2026-099'));
  assert.ok(multiHtml.includes('data-action="select-section-cert"'));
  assert.ok(multiHtml.includes('data-action="open-add-audit-wizard"'));
  assert.ok(multiHtml.includes('table-fixed'));
  const colWidths = [...multiHtml.matchAll(/<col\b[^>]*style="width:\s*([\d.]+)%/g)].map((m) =>
    Number(m[1])
  );
  assert.equal(colWidths.length, 5);
  assert.equal(
    colWidths.reduce((s, n) => s + n, 0),
    100
  );
  const tbodyMatch = multiHtml.match(/<tbody[\s\S]*?<\/tbody>/i);
  assert.ok(tbodyMatch);
  assert.equal(/<button\b/i.test(tbodyMatch[0]), false);
  assert.equal(assertZeroUuidExposure(multiHtml).compliant, true);

  // 2. Detail View: ◀/▶ switcher, batch sync banner, NEVER shows [data-linked-siblings-bar], displays 1:N planned rows & read-only REAL
  const detailState: DesignacionFechaViewState = {
    ...DEFAULT_DESIGNACION_FECHA_STATE,
    selectedCertId: UUID_CERT_1,
    selectedAuditId: UUID_AUD_1,
    draftAuditId: UUID_AUD_1,
    drafts: buildPlannedDateDraftsFromAudit(fx.audits[0], '2026-06-01'),
  };
  const detailHtml = renderDesignacionFechaView({
    profile: ADMIN_PROFILE,
    state: detailState,
    certificates: fx.certificates,
    audits: fx.audits,
    programs: fx.programs,
    referenceIsoDate: '2026-06-01',
  });
  assert.ok(detailHtml.includes('data-action="select-section-audit"'));
  assert.ok(detailHtml.includes('data-action="step-section-audit"'));
  assert.equal(detailHtml.includes('data-linked-siblings-bar="true"'), false);
  assert.ok(detailHtml.includes('data-testid="fecha-linked-batch-banner"'));
  assert.ok(detailHtml.includes('las 2 auditorías vinculadas de este lote'));
  assert.ok(detailHtml.includes('data-action="add-planned-date-row"'));
  assert.ok(detailHtml.includes('data-action="save-planned-dates-batch"'));
  assert.ok(detailHtml.includes('Fechas Reales de Ejecución (REAL — Solo lectura)'));
  assert.equal(assertZeroUuidExposure(detailHtml).compliant, true);

  // 3. 0-audit cert empty state renders cleanly
  const emptyCertHtml = renderDesignacionFechaView({
    profile: ADMIN_PROFILE,
    state: { ...DEFAULT_DESIGNACION_FECHA_STATE, selectedCertId: UUID_CERT_EMPTY },
    certificates: fx.certificates,
    audits: fx.audits,
    programs: fx.programs,
    referenceIsoDate: '2026-06-01',
  });
  assert.ok(emptyCertHtml.includes('Sin auditorías registradas'));
  assert.ok(emptyCertHtml.includes('FN-OHS-2026-099'));
  assert.equal(assertZeroUuidExposure(emptyCertHtml).compliant, true);

  // 4. Read-only RBAC for AUDITOR & CLIENT
  for (const roProfile of [AUDITOR_PROFILE, CLIENT_PROFILE]) {
    const roHtml = renderDesignacionFechaView({
      profile: roProfile,
      state: detailState,
      certificates: fx.certificates,
      audits: fx.audits,
      programs: fx.programs,
      referenceIsoDate: '2026-06-01',
    });
    assert.ok(roHtml.includes('Solo lectura'));
    assert.equal(roHtml.includes('data-action="add-planned-date-row"'), false);
    assert.equal(roHtml.includes('data-action="save-planned-dates-batch"'), false);
    assert.equal(roHtml.includes('data-action="remove-planned-date-row"'), false);
    assert.equal(assertZeroUuidExposure(roHtml).compliant, true);
  }
});
