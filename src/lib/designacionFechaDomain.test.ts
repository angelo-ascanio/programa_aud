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
  formatCompactLinkNature,
  formatPlannedDateTableValue,
  getCertificateStatusBadgeMeta,
  removePlannedDateDraftSafely,
  resolveInitialFixedDraftId,
  resolveLastAddedPlannedDate,
  sortPlannedDraftsAscending,
  sortPlannedDraftsNewestFirst,
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

  // 1. Multi View: Organización-rooted, Clean Table (<colgroup>=100%, 0 <button> in <tbody>), Zero-UUID, no Lote/fecha(s) noise
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
  assert.ok(multiHtml.includes('Iberometal Componentes'));
  assert.ok(multiHtml.includes('3 certificados'));
  assert.ok(multiHtml.includes('data-action="open-org-cert-picker"'));
  assert.ok(multiHtml.includes('data-action="open-add-audit-wizard"'));
  assert.equal(/\d+\s+fecha(s)?\b/i.test(multiHtml), false);
  assert.equal(multiHtml.includes('Lote ('), false);
  assert.ok(multiHtml.includes('table-fixed'));
  const colWidths = [...multiHtml.matchAll(/<col\b[^>]*style="width:\s*([\d.]+)%/g)].map((m) =>
    Number(m[1])
  );
  assert.equal(colWidths.length, 4);
  assert.equal(
    colWidths.reduce((s, n) => s + n, 0),
    100
  );
  const tbodyMatch = multiHtml.match(/<tbody[\s\S]*?<\/tbody>/i);
  assert.ok(tbodyMatch);
  assert.equal(/<button\b/i.test(tbodyMatch[0]), false);
  assert.equal(assertZeroUuidExposure(multiHtml).compliant, true);

  // 1b. Pop-up Modal: grouped by linked audit with rowspan, 1 cert per row, Estatus Certificado, Integ. (2) & Sin aud.
  const pickerHtml = renderDesignacionFechaView({
    profile: ADMIN_PROFILE,
    state: { ...DEFAULT_DESIGNACION_FECHA_STATE, pickerOrgId: UUID_ORG },
    certificates: fx.certificates,
    audits: fx.audits,
    programs: fx.programs,
    referenceIsoDate: '2026-06-01',
  });
  assert.ok(pickerHtml.includes('id="orgCertPickerModal"'));
  assert.ok(pickerHtml.includes('id="orgPickerModalSearchInput"'));
  assert.ok(pickerHtml.includes('FN-QMS-2026-001'));
  assert.ok(pickerHtml.includes('FN-EMS-2026-002'));
  assert.ok(pickerHtml.includes('FN-OHS-2026-099'));
  assert.ok(pickerHtml.includes('rowspan="2"'));
  assert.ok(pickerHtml.includes('data-action="org-picker-group-info"'));
  assert.ok(pickerHtml.includes('data-action="select-org-picker-cert"'));
  assert.ok(pickerHtml.includes('Integrada (2)'));
  assert.ok(pickerHtml.includes('title="Integrada · '));
  assert.ok(pickerHtml.includes('Sin auditorías'));
  assert.ok(pickerHtml.includes('title="Sin auditorías"'));
  assert.equal(assertZeroUuidExposure(pickerHtml).compliant, true);

  // 2. Detail View (Linked multi-cert): Compact header, Row A, conditional [data-linked-siblings-bar], unified table, symbol-only controls & read-only REAL
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
    headerAddAuditHtml: '<button type="button" data-action="open-add-audit-wizard">+ Auditoría</button>',
  });
  // Unified Zone 1 & Header ("Less Is More"): brief title, Org abreviacion nav button, Cert+Version nav button, single date, tooltips
  assert.ok(detailHtml.includes('FN-QMS-2026-001'));
  assert.equal(detailHtml.includes('Designación → Fecha · FN-QMS-2026-001'), false);
  assert.ok(detailHtml.includes('Programada'));
  assert.ok(detailHtml.includes('data-action="open-add-audit-wizard"'));
  assert.ok(detailHtml.includes('data-testid="zone1-org-nav-btn"'));
  assert.ok(detailHtml.includes('data-parent-type="org"'));
  assert.ok(detailHtml.includes('title="Organización: Iberometal Componentes S.A."'));
  assert.ok(detailHtml.includes('data-testid="zone1-cert-nav-btn"'));
  assert.ok(detailHtml.includes('title="Certificado: FN-QMS-2026-001'));
  assert.equal(detailHtml.includes('data-testid="audit-version-chip"'), false);
  assert.equal(detailHtml.includes('data-testid="audit-org-abrev-chip"'), false);
  assert.ok(detailHtml.includes('title="Estatus del Certificado: Activo"'));
  assert.ok(detailHtml.includes('title="Estado del Ciclo: Programada"'));
  assert.ok(detailHtml.includes('title="Código de Auditoría: AUD-2026-QMS"'));
  assert.ok(detailHtml.includes('title="Fecha Programada: 15/06/2026 – 17/06/2026 (Reprog. #2)"'));
  assert.ok(detailHtml.includes('15/06/2026 – 17/06/2026'));
  // Zone 2 single-row selectors: compact codename option + 1/2 counter + conditional linked-sibling <select>
  assert.equal(detailHtml.includes('Auditoría del certificado:'), false);
  assert.ok(detailHtml.includes('data-testid="audit-zone-2-selectors"'));
  assert.ok(detailHtml.includes('data-action="select-section-audit"'));
  assert.ok(detailHtml.includes('>2026-06 Seg.1</option>'));
  assert.match(detailHtml, /data-testid="audit-selector-counter"[^>]*>\s*1\/2\s*<\/span>/);
  assert.ok(detailHtml.includes('data-action="step-section-audit"'));
  assert.equal(detailHtml.includes('data-linked-siblings-bar="true"'), false);
  assert.equal(detailHtml.includes('data-action="select-linked-sibling-audit"'), false);
  assert.ok(detailHtml.includes('Integ. (2)'));
  assert.ok(detailHtml.includes('title="Tipo de Vinculación: Integrada (2 certificados)"'));
  assert.ok(detailHtml.includes('data-action="select-linked-sibling-select"'));
  assert.ok(detailHtml.includes(`data-cert-id="${UUID_CERT_1}"`));
  assert.ok(detailHtml.includes(`value="${UUID_AUD_1}"`));
  assert.ok(detailHtml.includes(`data-cert-id="${UUID_CERT_2}"`));
  assert.ok(detailHtml.includes(`value="${UUID_AUD_2}"`));
  assert.ok(detailHtml.includes('>FN-EMS-2026-002</option>'));
  // Streamlined toolbar + symbol-only `+` button + unified table
  assert.ok(detailHtml.includes('data-testid="fecha-editor-toolbar"'));
  assert.equal(detailHtml.includes('data-testid="fecha-linked-batch-banner"'), false);
  assert.ok(detailHtml.includes('Sincronizado con 2 auditorías vinculadas'));
  assert.ok(detailHtml.includes('data-action="open-add-planned-date"'));
  assert.ok(detailHtml.includes('title="Agregar fecha programada"'));
  assert.ok(detailHtml.includes('id="designacion-fecha-detail-table"'));
  assert.ok(detailHtml.includes('table-fixed'));
  // ZERO tag <select> or Programación/Reprogramación tag UI
  assert.equal(detailHtml.includes('data-fecha-field="tag"'), false);
  assert.equal(detailHtml.includes('<option value="Programación"'), false);
  assert.equal(detailHtml.includes('<option value="Reprogramación"'), false);
  // Table invariants: colgroup = 100%, zero <button> in <tbody>
  const detailTableMatch = detailHtml.match(
    /<table id="designacion-fecha-detail-table"[\s\S]*?<\/table>/i
  );
  assert.ok(detailTableMatch);
  const detailColWidths = [
    ...detailTableMatch[0].matchAll(/<col\b[^>]*style="width:\s*([\d.]+)%/g),
  ].map((m) => Number(m[1]));
  assert.equal(detailColWidths.length, 3);
  assert.equal(
    detailColWidths.reduce((s, n) => s + n, 0),
    100
  );
  const detailTbodyMatch = detailTableMatch[0].match(/<tbody[\s\S]*?<\/tbody>/i);
  assert.ok(detailTbodyMatch);
  assert.equal(/<button\b/i.test(detailTbodyMatch[0]), false);
  // Newest-added row (15/06/2026) appears BEFORE initial fixed row (Mayo 2026)
  const idxExactRow = detailTbodyMatch[0].indexOf('15/06/2026 – 17/06/2026');
  const idxInitialRow = detailTbodyMatch[0].indexOf('Mayo 2026 (2026-05)');
  assert.ok(idxExactRow !== -1 && idxInitialRow !== -1 && idxExactRow < idxInitialRow);
  // 1st/initial row has ✏️ and NO 🗑️; 2nd row has both ✏️ and 🗑️
  const rowMatches = [...detailTbodyMatch[0].matchAll(/<tr\b[\s\S]*?<\/tr>/gi)].map(
    (m) => m[0]
  );
  assert.equal(rowMatches.length, 2);
  assert.ok(rowMatches[0].includes('data-is-initial-fixed="false"'));
  assert.ok(rowMatches[0].includes('data-action="open-edit-planned-date"'));
  assert.ok(rowMatches[0].includes('data-action="delete-planned-date"'));
  assert.ok(rowMatches[1].includes('data-is-initial-fixed="true"'));
  assert.ok(rowMatches[1].includes('data-action="open-edit-planned-date"'));
  assert.equal(rowMatches[1].includes('data-action="delete-planned-date"'), false);
  assert.ok(detailHtml.includes('Fechas Reales de Ejecución (REAL — Solo lectura)'));
  assert.equal(assertZeroUuidExposure(detailHtml).compliant, true);

  // 2b. Detail View (Single-cert audit): linked-sibling <select> MUST be omitted from DOM
  const singleState: DesignacionFechaViewState = {
    ...DEFAULT_DESIGNACION_FECHA_STATE,
    selectedCertId: UUID_CERT_1,
    selectedAuditId: UUID_AUD_1_OLD,
    draftAuditId: UUID_AUD_1_OLD,
    drafts: buildPlannedDateDraftsFromAudit(fx.audits[1], '2026-06-01'),
  };
  const detailSingleHtml = renderDesignacionFechaView({
    profile: ADMIN_PROFILE,
    state: singleState,
    certificates: fx.certificates,
    audits: fx.audits,
    programs: fx.programs,
    referenceIsoDate: '2026-06-01',
  });
  assert.equal(detailSingleHtml.includes('data-linked-siblings-bar="true"'), false);
  assert.equal(detailSingleHtml.includes('data-action="select-linked-sibling-select"'), false);
  assert.ok(detailSingleHtml.includes('Mayo 2025 (2025-05)'));
  assert.equal(detailSingleHtml.includes('data-action="delete-planned-date"'), false);
  assert.ok(detailSingleHtml.includes('>2025-05 Otorgam.</option>'));
  assert.ok(detailSingleHtml.includes('title="Fecha Programada: May 2025 · Preprogramada (#1)"'));
  assert.ok(detailSingleHtml.includes('title="Código de Auditoría: AUD-2025-QMS"'));
  assert.equal(assertZeroUuidExposure(detailSingleHtml).compliant, true);

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

  // 4. Read-only RBAC for AUDITOR & CLIENT (no +, ✏️, 🗑️, or #plannedDateEditorModal; colgroup sums to 100%)
  for (const roProfile of [AUDITOR_PROFILE, CLIENT_PROFILE]) {
    const roHtml = renderDesignacionFechaView({
      profile: roProfile,
      state: {
        ...detailState,
        editorMode: 'edit',
        editingLocalId: detailState.drafts?.[0]?.localId ?? null,
        editorDraft: detailState.drafts?.[0] ?? null,
      },
      certificates: fx.certificates,
      audits: fx.audits,
      programs: fx.programs,
      referenceIsoDate: '2026-06-01',
    });
    assert.ok(roHtml.includes('Solo lectura'));
    assert.equal(roHtml.includes('data-action="open-add-planned-date"'), false);
    assert.equal(roHtml.includes('data-action="open-edit-planned-date"'), false);
    assert.equal(roHtml.includes('data-action="delete-planned-date"'), false);
    assert.equal(roHtml.includes('id="plannedDateEditorModal"'), false);
    const roColgroup = roHtml.match(
      /<table id="designacion-fecha-detail-table"[\s\S]*?<colgroup>([\s\S]*?)<\/colgroup>/i
    );
    assert.ok(roColgroup);
    const roColWidths = [...roColgroup[1].matchAll(/width:\s*([\d.]+)%/g)].map((m) =>
      Number(m[1])
    );
    assert.equal(roColWidths.length, 2);
    assert.equal(
      roColWidths.reduce((s, n) => s + n, 0),
      100
    );
    assert.equal(assertZeroUuidExposure(roHtml).compliant, true);
  }
});

test('Step 3.1: formatCompactLinkNature handles all AuditLinkNature values, Individual & Sin aud.', () => {
  assert.deepEqual(formatCompactLinkNature(null, 0, false), {
    short: 'Sin aud.',
    full: 'Sin auditorías registradas',
  });
  assert.deepEqual(
    formatCompactLinkNature({ tipo_vinculacion: 'Individual', es_vinculada: false }, 1, true),
    { short: 'Indiv.', full: 'Auditoría individual' }
  );
  assert.deepEqual(
    formatCompactLinkNature({ tipo_vinculacion: 'Integrada', es_vinculada: true }, 1, true),
    { short: 'Indiv.', full: 'Auditoría individual' }
  );
  assert.deepEqual(
    formatCompactLinkNature({ tipo_vinculacion: 'Integrada', es_vinculada: true }, 2, true),
    { short: 'Integ. (2)', full: 'Integrada (2 certificados)' }
  );
  assert.deepEqual(
    formatCompactLinkNature({ tipo_vinculacion: 'Combinada', es_vinculada: true }, 3, true),
    { short: 'Comb. (3)', full: 'Combinada (3 certificados)' }
  );
  assert.deepEqual(
    formatCompactLinkNature({ tipo_vinculacion: 'Conjunta', es_vinculada: true }, 2, true),
    { short: 'Conj. (2)', full: 'Conjunta (2 certificados)' }
  );
  assert.deepEqual(
    formatCompactLinkNature({ tipo_vinculacion: 'Simultánea', es_vinculada: true }, 2, true),
    { short: 'Simul. (2)', full: 'Simultánea (2 certificados)' }
  );
  assert.deepEqual(
    formatCompactLinkNature({ tipo_vinculacion: 'Multientidad', es_vinculada: true }, 2, true),
    { short: 'Multi. (2)', full: 'Multientidad (2 certificados)' }
  );
  assert.deepEqual(
    formatCompactLinkNature({ tipo_vinculacion: 'Mixta', es_vinculada: true }, 2, true),
    { short: 'Mixta (2)', full: 'Mixta (2 certificados)' }
  );
});

test('Step 3.1: resolveLastAddedPlannedDate picks seq=2 Nov 2026 added after seq=1 Dec 2026 in Multi View (list & cards)', () => {
  const fx = makeFixtures();
  const audDecThenNov: ProgramacionAuditEntity = {
    ...fx.audits[0],
    id: '80000000-0000-0000-0000-000000000301',
    id_programa_auditoria: null,
    fechas: [
      {
        id: '81000000-0000-0000-0000-000000000301',
        id_auditoria: '80000000-0000-0000-0000-000000000301',
        numero_secuencia: 1,
        tag: 'Programación',
        tipo_fecha: 'PREPROGRAMADA_MES',
        anio: 2026,
        mes: 12,
        fecha_inicio: null,
        fecha_fin: null,
        observacion: 'Primera fecha: Diciembre',
        deleted_at: null,
      },
      {
        id: '81000000-0000-0000-0000-000000000302',
        id_auditoria: '80000000-0000-0000-0000-000000000301',
        numero_secuencia: 2,
        tag: 'Reprogramación',
        tipo_fecha: 'PREPROGRAMADA_MES',
        anio: 2026,
        mes: 11,
        fecha_inicio: null,
        fecha_fin: null,
        observacion: 'Segunda fecha agregada: Noviembre',
        deleted_at: null,
      },
      {
        id: '81000000-0000-0000-0000-000000000303',
        id_auditoria: '80000000-0000-0000-0000-000000000301',
        numero_secuencia: 3,
        tag: 'Programación',
        tipo_fecha: 'REAL',
        anio: null,
        mes: null,
        fecha_inicio: '2026-10-15',
        fecha_fin: '2026-10-16',
        observacion: 'Ejecución REAL debe ser ignorada',
        deleted_at: null,
      },
      {
        id: '81000000-0000-0000-0000-000000000304',
        id_auditoria: '80000000-0000-0000-0000-000000000301',
        numero_secuencia: 4,
        tag: 'Reprogramación',
        tipo_fecha: 'PREPROGRAMADA_MES',
        anio: 2027,
        mes: 1,
        fecha_inicio: null,
        fecha_fin: null,
        observacion: 'Soft-deleted debe ser ignorada',
        deleted_at: '2026-07-01T00:00:00Z',
      },
    ],
  };

  const resolvedDirect = resolveLastAddedPlannedDate(audDecThenNov.fechas);
  assert.ok(resolvedDirect);
  assert.equal(resolvedDirect.mes, 11);
  assert.equal(resolvedDirect.anio, 2026);

  // Also check tie-breaker on created_at DESC when numero_secuencia is identical
  const resolvedTieCreated = resolveLastAddedPlannedDate([
    {
      ...audDecThenNov.fechas[0],
      numero_secuencia: 1,
      created_at: '2026-02-01T10:00:00Z',
    },
    {
      ...audDecThenNov.fechas[1],
      numero_secuencia: 1,
      created_at: '2026-02-05T10:00:00Z',
    },
  ]);
  assert.equal(resolvedTieCreated?.mes, 11);

  // Also check fallback to array index DESC when sequence and created_at both tie
  const resolvedTieIndex = resolveLastAddedPlannedDate([
    { ...audDecThenNov.fechas[0], numero_secuencia: 1 },
    { ...audDecThenNov.fechas[1], numero_secuencia: 1 },
  ]);
  assert.equal(resolvedTieIndex?.mes, 11);

  const singleCert: CertificateRecord[] = [fx.certificates[0]];
  const rows = buildCertificateFechaRows({
    certificates: singleCert,
    audits: [audDecThenNov],
    programs: [],
    referenceIsoDate: '2026-06-01',
  });
  assert.equal(rows.length, 1);
  assert.ok(rows[0].latestDateLabel.includes('Nov 2026'));
  assert.equal(rows[0].latestDateLabel.includes('Dic 2026'), false);
  assert.equal(rows[0].linkShortLabel, 'Indiv.');
  assert.equal(rows[0].linkFullTooltip, 'Auditoría individual');

  for (const mode of ['list', 'grid'] as const) {
    const html = renderDesignacionFechaView({
      profile: ADMIN_PROFILE,
      state: { ...DEFAULT_DESIGNACION_FECHA_STATE, viewMode: mode },
      certificates: singleCert,
      audits: [audDecThenNov],
      programs: [],
      referenceIsoDate: '2026-06-01',
    });
    assert.ok(html.includes('Nov 2026'), `Expected Nov 2026 in ${mode} view`);
    assert.equal(html.includes('Dic 2026'), false, `Did not expect Dic 2026 in ${mode} view`);
    assert.equal(/\d+\s+fecha(s)?\b/i.test(html), false, `No date count noise in ${mode} view`);
    assert.equal(html.includes('Lote ('), false, `No Lote (N) in ${mode} view`);
    assert.equal(assertZeroUuidExposure(html).compliant, true);
  }
});

test('Step 3.1 & 3.2: Certificate status badges, Org Grid/List & reactive vinculacion facet filtering + Modal status badges', () => {
  assert.ok(getCertificateStatusBadgeMeta('Activo').badgeClass.includes('emerald'));
  assert.ok(getCertificateStatusBadgeMeta('Estudio').badgeClass.includes('sky'));
  assert.ok(getCertificateStatusBadgeMeta('Suspendido').badgeClass.includes('amber'));
  assert.ok(getCertificateStatusBadgeMeta('Cancelado').badgeClass.includes('rose'));
  assert.ok(getCertificateStatusBadgeMeta('Retirado').badgeClass.includes('rose'));
  assert.ok(getCertificateStatusBadgeMeta('Vencido').badgeClass.includes('rose'));
  assert.ok(getCertificateStatusBadgeMeta('En Espera').badgeClass.includes('slate'));

  const fx = makeFixtures();
  const multiStatusCerts: CertificateRecord[] = [
    fx.certificates[0],
    {
      id: '40000000-0000-0000-0000-000000000051',
      numero_certificado: 'FN-SUSP-2026-051',
      organizacion_nombre: 'Metalúrgica Norte C.A.',
      norma: 'ISO 9001:2015',
      estatus: 'Suspendido',
      sector_iaf: 17,
    },
    {
      id: '40000000-0000-0000-0000-000000000052',
      numero_certificado: 'FN-CANC-2026-052',
      organizacion_nombre: 'Química Sur S.A.',
      norma: 'ISO 14001:2015',
      estatus: 'Cancelado',
      sector_iaf: 12,
    },
    fx.certificates[2],
  ];

  // Grid mode renders Org cards across multiple organizations
  const gridHtml = renderDesignacionFechaView({
    profile: ADMIN_PROFILE,
    state: { ...DEFAULT_DESIGNACION_FECHA_STATE, viewMode: 'grid' },
    certificates: multiStatusCerts,
    audits: fx.audits,
    programs: fx.programs,
    referenceIsoDate: '2026-06-01',
  });
  assert.ok(gridHtml.includes('Iberometal Componentes'));
  assert.ok(gridHtml.includes('Metalúrgica Norte'));
  assert.ok(gridHtml.includes('Química Sur'));
  assert.equal(/\d+\s+fecha(s)?\b/i.test(gridHtml), false);
  assert.equal(gridHtml.includes('Lote ('), false);
  assert.equal(assertZeroUuidExposure(gridHtml).compliant, true);

  // Filter by vinculacion = ['VINCULADA'] keeps Iberometal and excludes orgs without audits
  const filteredVincHtml = renderDesignacionFechaView({
    profile: ADMIN_PROFILE,
    state: {
      ...DEFAULT_DESIGNACION_FECHA_STATE,
      viewMode: 'list',
      facetSelections: { vinculacion: new Set(['VINCULADA']) },
    },
    certificates: multiStatusCerts,
    audits: fx.audits,
    programs: fx.programs,
    referenceIsoDate: '2026-06-01',
  });
  assert.ok(filteredVincHtml.includes('Iberometal Componentes'));
  assert.equal(filteredVincHtml.includes('Metalúrgica Norte'), false);
  assert.equal(filteredVincHtml.includes('Química Sur'), false);
  assert.equal(assertZeroUuidExposure(filteredVincHtml).compliant, true);

  // Pop-up Modal renders per-org certificates with date precision & urgency
  const suspPickerHtml = renderDesignacionFechaView({
    profile: ADMIN_PROFILE,
    state: { ...DEFAULT_DESIGNACION_FECHA_STATE, pickerOrgId: 'org:Metalúrgica Norte C.A.' },
    certificates: multiStatusCerts,
    audits: fx.audits,
    programs: fx.programs,
    referenceIsoDate: '2026-06-01',
  });
  assert.ok(suspPickerHtml.includes('FN-SUSP-2026-051'));
  assert.ok(suspPickerHtml.includes('Sin fecha programada'));

  const iberoPickerHtml = renderDesignacionFechaView({
    profile: ADMIN_PROFILE,
    state: { ...DEFAULT_DESIGNACION_FECHA_STATE, pickerOrgId: UUID_ORG },
    certificates: multiStatusCerts,
    audits: fx.audits,
    programs: fx.programs,
    referenceIsoDate: '2026-06-01',
  });
  assert.ok(iberoPickerHtml.includes('FN-QMS-2026-001'));
  assert.ok(iberoPickerHtml.includes('FN-OHS-2026-099'));
  assert.ok(iberoPickerHtml.includes('Sin auditorías'));


  // Combined program abbreviation coverage in Multi View & Picker modal
  const combProg: ProgramaAuditoriaEntity = {
    ...fx.programs[0],
    id: '7a000000-0000-0000-0000-000000000055',
    tipo_vinculacion: 'Combinada',
    auditorias: [
      { ...fx.audits[0], id_programa_auditoria: '7a000000-0000-0000-0000-000000000055' },
      { ...fx.audits[2], id_programa_auditoria: '7a000000-0000-0000-0000-000000000055' },
      {
        ...fx.audits[2],
        id: '80000000-0000-0000-0000-000000000055',
        id_certificado: '40000000-0000-0000-0000-000000000051',
        numero_certificado: 'FN-SUSP-2026-051',
        id_programa_auditoria: '7a000000-0000-0000-0000-000000000055',
      },
    ],
  };
  const combListHtml = renderDesignacionFechaView({
    profile: ADMIN_PROFILE,
    state: { ...DEFAULT_DESIGNACION_FECHA_STATE, viewMode: 'list', pickerOrgId: UUID_ORG },
    certificates: multiStatusCerts,
    audits: combProg.auditorias,
    programs: [combProg],
    referenceIsoDate: '2026-06-01',
  });
  assert.ok(combListHtml.includes('Combinada (3)'));
  assert.ok(combListHtml.includes('title="Combinada · '));
  const listTableMatch = combListHtml.match(/<table[^>]*data-resizable-table="designacion-fecha-main"[\s\S]*?<\/table>/i);
  assert.ok(listTableMatch);
  const colWidths = [...listTableMatch[0].matchAll(/<col\b[^>]*style="width:\s*([\d.]+)%/g)].map((m) =>
    Number(m[1])
  );
  assert.equal(colWidths.reduce((s, n) => s + n, 0), 100);
  const tbodyMatch = listTableMatch[0].match(/<tbody[\s\S]*?<\/tbody>/i);
  assert.ok(tbodyMatch);
  assert.equal(/<button\b/i.test(tbodyMatch[0]), false);
});

test('Step 4.2: Pure helpers resolveInitialFixedDraftId, sortPlannedDraftsNewestFirst, removePlannedDateDraftSafely & silent tag normalization', () => {
  const firstDraft = createEmptyPlannedDateDraft(0, '2026-05-01', 'draft-initial');
  firstDraft.numero_secuencia = 1;
  firstDraft.anio = 2026;
  firstDraft.mes = 12;
  firstDraft.observacion = 'Mes inicial Diciembre';

  const secondDraft = togglePlannedDateDraftMode(
    createEmptyPlannedDateDraft(1, '2026-10-14', 'draft-reprog'),
    'PROGRAMADA_EXACTA'
  );
  secondDraft.numero_secuencia = 2;
  secondDraft.fecha_inicio = '2026-10-14';
  secondDraft.fecha_fin = '2026-10-14';
  secondDraft.singleDay = true;
  secondDraft.observacion = 'Adelanto confirmado';

  const thirdDraft = createEmptyPlannedDateDraft(2, '2026-11-01', 'draft-unsaved');
  thirdDraft.anio = 2026;
  thirdDraft.mes = 11;

  // 1. Initial fixed id is always the oldest/lowest sequence draft
  assert.equal(resolveInitialFixedDraftId([secondDraft, firstDraft, thirdDraft]), 'draft-initial');
  assert.equal(resolveInitialFixedDraftId([]), null);

  // 2. Display ordering is newest-added first, persistence ordering is oldest -> newestAdded
  assert.deepEqual(
    sortPlannedDraftsNewestFirst([firstDraft, secondDraft, thirdDraft]).map((d) => d.localId),
    ['draft-unsaved', 'draft-reprog', 'draft-initial']
  );
  assert.deepEqual(
    sortPlannedDraftsAscending([thirdDraft, secondDraft, firstDraft]).map((d) => d.localId),
    ['draft-initial', 'draft-reprog', 'draft-unsaved']
  );

  // 3. removePlannedDateDraftSafely protects 1st/initial fixed date while allowing removal of 2nd+ dates
  const blocked = removePlannedDateDraftSafely([firstDraft, secondDraft], 'draft-initial');
  assert.equal(blocked.valid, false);
  assert.equal(blocked.error, 'La fecha programada inicial puede editarse, pero no eliminarse.');
  assert.equal(blocked.drafts.length, 2);

  const allowed = removePlannedDateDraftSafely([firstDraft, secondDraft], 'draft-reprog');
  assert.equal(allowed.valid, true);
  assert.equal(allowed.error, null);
  assert.deepEqual(
    allowed.drafts.map((d) => d.localId),
    ['draft-initial']
  );

  // 4. formatPlannedDateTableValue formats YYYY-MM and YYYY-MM-DD (single & range) cleanly
  assert.equal(formatPlannedDateTableValue(firstDraft), 'Diciembre 2026 (2026-12)');
  assert.equal(formatPlannedDateTableValue(secondDraft), '14/10/2026 (2026-10-14)');
  assert.equal(
    formatPlannedDateTableValue({
      ...secondDraft,
      singleDay: false,
      fecha_inicio: '2026-10-14',
      fecha_fin: '2026-10-16',
    }),
    '14/10/2026 – 16/10/2026 (2026-10-14 → 2026-10-16)'
  );

  // 5. validatePlannedDatesList silently normalizes DB tags in ascending order regardless of caller order
  const validated = validatePlannedDatesList([
    { ...secondDraft, tag: 'Programación' },
    { ...firstDraft, tag: 'Reprogramación' },
  ]);
  assert.equal(validated.valid, true);
  assert.equal(validated.normalized[0].tag, 'Programación');
  assert.equal(validated.normalized[0].mes, 12);
  assert.equal(validated.normalized[1].tag, 'Reprogramación');
  assert.equal(validated.normalized[1].fecha_inicio, '2026-10-14');
});

test('Step 4.2: #plannedDateEditorModal exposes YYYY-MM vs YYYY-MM-DD modes cleanly with Zero-UUID', () => {
  const fx = makeFixtures();

  const addMesHtml = renderDesignacionFechaView({
    profile: ADMIN_PROFILE,
    state: {
      ...DEFAULT_DESIGNACION_FECHA_STATE,
      selectedCertId: UUID_CERT_1,
      selectedAuditId: UUID_AUD_1,
      editorMode: 'add',
      editingLocalId: null,
      editorDraft: createEmptyPlannedDateDraft(2, '2026-08-01', 'new-1'),
    },
    certificates: fx.certificates,
    audits: fx.audits,
    programs: fx.programs,
    referenceIsoDate: '2026-06-01',
  });
  assert.ok(addMesHtml.includes('id="plannedDateEditorModal"'));
  assert.ok(addMesHtml.includes('Agregar fecha programada'));
  assert.ok(addMesHtml.includes('id="fechaEditorTipoSelect"'));
  assert.ok(addMesHtml.includes('Año + Mes (YYYY-MM)'));
  assert.ok(addMesHtml.includes('Fecha Exacta (YYYY-MM-DD)'));
  assert.ok(addMesHtml.includes('id="fechaEditorMesSelect"'));
  assert.ok(addMesHtml.includes('id="fechaEditorAnioInput"'));
  assert.ok(addMesHtml.includes('Se aplicará a las 2 auditorías vinculadas; no modifica fechas reales.'));
  assert.equal(addMesHtml.includes('<option value="Programación"'), false);
  assert.equal(addMesHtml.includes('<option value="Reprogramación"'), false);
  assert.equal(assertZeroUuidExposure(addMesHtml).compliant, true);

  const editExactDraft = togglePlannedDateDraftMode(
    createEmptyPlannedDateDraft(0, '2026-10-14', 'edit-1'),
    'PROGRAMADA_EXACTA'
  );
  const editExactHtml = renderDesignacionFechaView({
    profile: ADMIN_PROFILE,
    state: {
      ...DEFAULT_DESIGNACION_FECHA_STATE,
      selectedCertId: UUID_CERT_1,
      selectedAuditId: UUID_AUD_1,
      editorMode: 'edit',
      editingLocalId: editExactDraft.localId,
      editorDraft: { ...editExactDraft, singleDay: false, fecha_fin: '2026-10-16' },
    },
    certificates: fx.certificates,
    audits: fx.audits,
    programs: fx.programs,
    referenceIsoDate: '2026-06-01',
  });
  assert.ok(editExactHtml.includes('Editar fecha programada'));
  assert.ok(editExactHtml.includes('id="fechaEditorExactaInput"'));
  assert.ok(editExactHtml.includes('id="fechaEditorSingleDayToggle"'));
  assert.ok(editExactHtml.includes('id="fechaEditorFinInput"'));
  assert.equal(assertZeroUuidExposure(editExactHtml).compliant, true);
});
