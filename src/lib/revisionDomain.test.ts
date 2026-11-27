import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { UserProfile } from './healthCheck';
import type { Phase5FindingEntity, ProgramacionAuditEntity } from './auditExecution';
import type { CertificadoDetailEntity } from './multisiteSampling';
import {
  buildAuditRevisionContext,
  buildCertificateRevisionRows,
  buildRevisionQueueRows,
  formatRevisionDateDdMmYyyy,
  formatRevisionNcSummary,
  validateRevisionDraft,
} from './revisionDomain';
import { DEFAULT_REVISION_STATE, renderRevisionView } from '../views/revisionView';
import { renderAuditoriasView } from '../views/auditoriasView';
import { assertZeroUuidExposure } from './zeroUuid';

const AUDIT_UUID_PENDING = '80000000-0000-0000-0000-000000000101';
const AUDIT_UUID_REVIEWED = '80000000-0000-0000-0000-000000000102';
const AUDIT_UUID_UNCLOSED = '80000000-0000-0000-0000-000000000103';
const AUDIT_UUID_ARCHIVED = '80000000-0000-0000-0000-000000000104';
const ACTOR_QA_UUID = '22222222-2222-2222-2222-222222222222';
const UNKNOWN_QA_UUID = '99999999-9999-4999-8999-999999999999';

const ADMIN_PROFILE: UserProfile = {
  id: '11111111-1111-1111-1111-111111111111',
  nombre: 'Administrador QA',
  role: 'ADMIN',
  status: 'APPROVED',
};

const WORKER_PROFILE: UserProfile = {
  id: ACTOR_QA_UUID,
  nombre: 'Analista Operativo QA',
  role: 'WORKER',
  status: 'APPROVED',
};

const AUDITOR_PROFILE: UserProfile = {
  id: '33333333-3333-3333-3333-333333333333',
  nombre: 'Auditor Evaluador',
  role: 'AUDITOR',
  status: 'APPROVED',
};

const CLIENT_PROFILE: UserProfile = {
  id: '44444444-4444-4444-4444-444444444444',
  nombre: 'Cliente Autorizado',
  role: 'CLIENT',
  status: 'APPROVED',
};

function makeAudit(overrides: Partial<ProgramacionAuditEntity>): ProgramacionAuditEntity {
  return {
    id: AUDIT_UUID_PENDING,
    codigo_auditoria: 'AUD-2025-101',
    id_certificado: '40000000-0000-0000-0000-000000000001',
    numero_certificado: 'FN-QMS-2025-101',
    id_organizacion: '30000000-0000-0000-0000-000000000001',
    organizacion_nombre: 'Industrias Andinas S.A.',
    norma_codigo: 'ISO 9001:2015',
    sector_iaf: 17,
    tipo_auditoria: 'Seguimiento 1',
    metodologia: 'Presencial',
    fecha_inicio: '2025-05-10',
    fecha_fin: '2025-05-12',
    fechas: [
      {
        id: '81000000-0000-0000-0000-000000000101',
        id_auditoria: overrides.id ?? AUDIT_UUID_PENDING,
        numero_secuencia: 1,
        tag: 'Programación',
        tipo_fecha: 'REAL',
        anio: null,
        mes: null,
        fecha_inicio: '2025-05-10',
        fecha_fin: '2025-05-12',
      },
    ],
    dias_auditor: 2,
    tiempo_auditoria: 2,
    estatus: 'Cerrado',
    estado_ciclo: 'Cerrada',
    fecha_cierre_auditoria: '2025-06-01',
    revisado: false,
    fecha_revision: null,
    revisado_por: null,
    documentacion_completa: false,
    resumen_revision: null,
    auditor_lider_id: '10000000-0000-0000-0000-000000000001',
    auditor_lider: 'Ing. Carlos Mendoza',
    sede_principal_direccion: 'Zona Industrial',
    equipo: [],
    sitiosMuestreo: [],
    matrizNormativa: [],
    recomendacion: null,
    deleted_at: null,
    ...overrides,
  };
}

function makeFinding(overrides: Partial<Phase5FindingEntity>): Phase5FindingEntity {
  return {
    id: 'a1000000-0000-0000-0000-000000000101',
    codigo_hallazgo: 'HAL-2025-001',
    id_auditoria: AUDIT_UUID_PENDING,
    auditoria_tipo: 'Seguimiento 1',
    numero_certificado: 'FN-QMS-2025-101',
    organizacion_nombre: 'Industrias Andinas S.A.',
    id_requisito: 'f0000000-0000-0000-0000-000000000085',
    requisito_codigo: '8.5',
    id_proceso: '60000000-0000-0000-0000-000000000001',
    proceso_nombre: 'Producción',
    sitio_nombre: 'Planta Central',
    tipo: 'NC_MENOR',
    descripcion: 'Registro incompleto.',
    evidencia: 'Acta de verificación.',
    estado_ciclo: 'Cerrado',
    analisis_causa_raiz: 'Causa verificada.',
    plan_accion_correctiva: 'Acción implementada.',
    comentarios_verificacion: 'Cerrado conforme.',
    fecha_limite: '2025-06-20',
    fecha_cierre: '2025-05-28',
    cerrado: true,
    created_at: '2025-05-12T10:00:00Z',
    deleted_at: null,
    ...overrides,
  };
}

function assertVisibleTextHasNoRawUuid(html: string, context: string): void {
  const withoutDataAttrs = html
    .replace(/\bdata-[a-z0-9-]+="[^"]*"/gi, '')
    .replace(/\bvalue="[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"/gi, '')
    .replace(/<[^>]+>/g, ' ');
  assert.doesNotMatch(
    withoutDataAttrs,
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
    `${context} must never expose raw UUIDs in rendered text`
  );
}

test('buildCertificateRevisionRows and buildAuditRevisionContext include active open/closed audits and summarize real dates & NCs', () => {
  const certPendingId = '40000000-0000-0000-0000-000000000001';
  const certReviewedId = '40000000-0000-0000-0000-000000000002';

  const audits: ProgramacionAuditEntity[] = [
    makeAudit({
      id: AUDIT_UUID_REVIEWED,
      id_certificado: certReviewedId,
      numero_certificado: 'FN-QMS-2025-102',
      codigo_auditoria: 'AUD-2025-102',
      organizacion_nombre: 'Tecno Norte C.A.',
      fecha_cierre_auditoria: '2025-06-15',
      revisado: true,
      fecha_revision: '2025-06-18',
      revisado_por: ACTOR_QA_UUID,
      documentacion_completa: true,
      resumen_revision: 'Expediente verificado.',
    }),
    makeAudit({
      id: AUDIT_UUID_ARCHIVED,
      id_certificado: certPendingId,
      codigo_auditoria: 'AUD-2025-104',
      deleted_at: '2025-06-05T00:00:00Z',
    }),
    makeAudit({
      id: AUDIT_UUID_PENDING,
      id_certificado: certPendingId,
      numero_certificado: 'FN-QMS-2025-101',
      codigo_auditoria: 'AUD-2025-101',
      estado_ciclo: 'En Ejecución',
      fecha_cierre_auditoria: null,
      revisado: false,
      revisado_por: UNKNOWN_QA_UUID,
    }),
  ];

  const findings: Phase5FindingEntity[] = [
    makeFinding({ id: 'f-1', id_auditoria: AUDIT_UUID_PENDING, tipo: 'NC_MAYOR', cerrado: true }),
    makeFinding({
      id: 'f-2',
      id_auditoria: AUDIT_UUID_PENDING,
      tipo: 'NC_MENOR',
      cerrado: false,
      fecha_cierre: null,
      fecha_cierre_real: null,
    }),
    makeFinding({ id: 'f-3', id_auditoria: AUDIT_UUID_PENDING, tipo: 'OBSERVACION', cerrado: false }),
  ];

  const actorMap = new Map<string, string>([[ACTOR_QA_UUID, 'Analista Operativo QA']]);
  const certRows = buildCertificateRevisionRows({ audits, actorNameById: actorMap });

  assert.equal(certRows.length, 2);
  assert.equal(certRows[0].certId, certPendingId);
  assert.equal(certRows[0].statusKey, 'PENDIENTE');
  assert.equal(certRows[0].statusLabel, 'Pendiente');
  assert.equal(certRows[0].revisadoPorNombre, 'Coordinador QA');
  assert.equal(certRows[1].certId, certReviewedId);
  assert.equal(certRows[1].statusKey, 'REVISADA');
  assert.equal(certRows[1].statusLabel, 'Revisada ✓');
  assert.equal(certRows[1].fechaRevisionLabel, '18/06/2025');
  assert.equal(certRows[1].revisadoPorNombre, 'Analista Operativo QA');

  const ctx = buildAuditRevisionContext(audits[2], findings);
  assert.equal(ctx.tipoAuditoria, 'Seguimiento 1');
  assert.equal(ctx.totalNcs, 2);
  assert.equal(ctx.closedNcs, 1);
  assert.equal(ctx.openNcs, 1);
  assert.match(ctx.ncsSummary, /1 cerradas \/ 1 abiertas \(2 total\)/);

  const queueRows = buildRevisionQueueRows(audits, findings, actorMap);
  assert.equal(queueRows.length, 2);
  assert.equal(queueRows[0].audit.id, AUDIT_UUID_PENDING);
  assert.equal(formatRevisionDateDdMmYyyy('2025-06-18'), '18/06/2025');
  assert.equal(formatRevisionNcSummary(queueRows[0]), '2 NCs (1 cerrada)');
});

test('validateRevisionDraft enforces valid fecha_revision, optional Zero-UUID comment, and >= MIN(fecha_real) without rigid closing blockers', () => {
  const openAuditWithReal = makeAudit({
    id: AUDIT_UUID_UNCLOSED,
    estado_ciclo: 'En Ejecución',
    fecha_cierre_auditoria: null,
    documentacion_completa: false,
  });

  assert.throws(() =>
    validateRevisionDraft(
      {
        id_auditoria: 'not-a-uuid',
        revisado: true,
        fecha_revision: '2025-06-12',
        resumen_revision: '',
      },
      openAuditWithReal
    )
  );

  // Rejects fecha_revision earlier than MIN(fecha_real) = 2025-05-10
  const beforeRealErr = validateRevisionDraft(
    {
      id_auditoria: AUDIT_UUID_UNCLOSED,
      revisado: true,
      fecha_revision: '2025-05-09',
      resumen_revision: '',
    },
    openAuditWithReal
  );
  assert.match(beforeRealErr || '', /primera fecha real/i);

  // Rejects raw UUIDs in comment
  const rawUuidSummaryErr = validateRevisionDraft(
    {
      id_auditoria: AUDIT_UUID_UNCLOSED,
      revisado: true,
      fecha_revision: '2025-05-15',
      resumen_revision: `Verificado por ${ACTOR_QA_UUID}`,
    },
    openAuditWithReal
  );
  assert.match(rawUuidSummaryErr || '', /UUID/i);

  // Allows saving without requiring estado_ciclo='Cerrada', documentacion_completa=true, or non-empty comment
  const okWithoutComment = validateRevisionDraft(
    {
      id_auditoria: AUDIT_UUID_UNCLOSED,
      revisado: true,
      fecha_revision: '2025-05-15',
      resumen_revision: '',
    },
    openAuditWithReal
  );
  assert.equal(okWithoutComment, null);
});

test('renderRevisionView outputs 4-col 100% <colgroup>, zero <button> inside <tbody>, Zero-UUID text, and RBAC read-only detail for AUDITOR/CLIENT', () => {
  const pendingAudit = makeAudit({
    id: AUDIT_UUID_PENDING,
    id_certificado: '40000000-0000-0000-0000-000000000001',
    numero_certificado: 'FN-QMS-2025-101',
    codigo_auditoria: 'AUD-2025-101',
    revisado: false,
  });
  const reviewedAudit = makeAudit({
    id: AUDIT_UUID_REVIEWED,
    id_certificado: '40000000-0000-0000-0000-000000000002',
    numero_certificado: 'FN-QMS-2025-102',
    codigo_auditoria: 'AUD-2025-102',
    id_organizacion: '30000000-0000-0000-0000-000000000002',
    organizacion_nombre: 'Tecno Norte C.A.',
    fecha_cierre_auditoria: '2025-06-15',
    revisado: true,
    fecha_revision: '2025-06-18',
    revisado_por: ACTOR_QA_UUID,
    documentacion_completa: true,
    resumen_revision: 'Expediente verificado.',
  });
  const actorMap = new Map<string, string>([[ACTOR_QA_UUID, 'Analista Operativo QA']]);

  const listHtml = renderRevisionView({
    profile: ADMIN_PROFILE,
    state: DEFAULT_REVISION_STATE,
    audits: [pendingAudit, reviewedAudit],
    findings: [],
    actorNameById: actorMap,
  });

  // Verify 4-col <colgroup> widths sum to 100% (30/22/22/26)
  const colMatches = [...listHtml.matchAll(/<col[^>]*style="width:\s*([0-9.]+)%;"/g)];
  assert.equal(colMatches.length, 4);
  const sumPct = colMatches.reduce((acc, m) => acc + Number(m[1]), 0);
  assert.ok(Math.abs(sumPct - 100) < 0.05, `Expected colgroup sum 100%, got ${sumPct}`);

  // Verify 0 <button> inside <tbody> and Org Multi View click action
  const tbodyMatch = listHtml.match(/<tbody[\s\S]*?<\/tbody>/i);
  assert.ok(tbodyMatch, 'Expected <tbody> in revision list view');
  assert.doesNotMatch(tbodyMatch[0], /<button\b/i, 'Zero <button> allowed inside <tbody>');
  assert.match(tbodyMatch[0], /data-action="open-org-cert-picker"/);
  assertVisibleTextHasNoRawUuid(listHtml, 'Revision Multi View');

  // Verify facet filtering to PENDIENTE hides REVISADA org
  const filteredHtml = renderRevisionView({
    profile: ADMIN_PROFILE,
    state: {
      ...DEFAULT_REVISION_STATE,
      facetSelections: { estado_revision: new Set(['PENDIENTE']) },
    },
    audits: [pendingAudit, reviewedAudit],
    findings: [],
    actorNameById: actorMap,
  });
  assert.match(filteredHtml, /Industrias Andinas S\.A\./);
  assert.doesNotMatch(filteredHtml, /Tecno Norte C\.A\./);

  // Verify Pop-up Modal renders cert picker rows cleanly
  const modalHtml = renderRevisionView({
    profile: ADMIN_PROFILE,
    state: {
      ...DEFAULT_REVISION_STATE,
      pickerOrgId: reviewedAudit.id_organizacion,
    },
    audits: [pendingAudit, reviewedAudit],
    findings: [],
    actorNameById: actorMap,
  });
  assert.match(modalHtml, /id="orgCertPickerModal"/);
  assert.match(modalHtml, /data-action="select-org-picker-cert"/);
  assert.match(modalHtml, /FN-QMS-2025-102/);
  assert.match(modalHtml, /Revisada ✓/);
  assertVisibleTextHasNoRawUuid(modalHtml, 'Revision Pop-up Modal');

  // Verify Detail View renders simplified #revisionSaveForm for WORKER & ADMIN, and read-only without form for AUDITOR & CLIENT
  const workerDetailHtml = renderRevisionView({
    profile: WORKER_PROFILE,
    state: {
      ...DEFAULT_REVISION_STATE,
      selectedCertId: reviewedAudit.id_certificado,
      selectedAuditId: AUDIT_UUID_REVIEWED,
    },
    audits: [pendingAudit, reviewedAudit],
    findings: [],
    actorNameById: actorMap,
  });
  assert.match(workerDetailHtml, /id="revisionSaveForm"/);
  assert.match(workerDetailHtml, /id="revisionDateInput"/);
  assert.match(workerDetailHtml, /id="revisionCommentInput"/);
  assert.match(workerDetailHtml, /id="saveRevisionBtn"/);
  assert.match(workerDetailHtml, /Guardar Revisión/);
  assertVisibleTextHasNoRawUuid(workerDetailHtml, 'Worker Detail View');

  for (const readOnlyProfile of [AUDITOR_PROFILE, CLIENT_PROFILE]) {
    const readOnlyDetailHtml = renderRevisionView({
      profile: readOnlyProfile,
      state: {
        ...DEFAULT_REVISION_STATE,
        selectedCertId: reviewedAudit.id_certificado,
        selectedAuditId: AUDIT_UUID_REVIEWED,
      },
      audits: [pendingAudit, reviewedAudit],
      findings: [],
      actorNameById: actorMap,
    });
    assert.doesNotMatch(readOnlyDetailHtml, /id="revisionSaveForm"/);
    assert.match(readOnlyDetailHtml, /Solo Lectura/);
    assertVisibleTextHasNoRawUuid(readOnlyDetailHtml, `${readOnlyProfile.role} Detail View`);
  }

  // Verify AuditoriasView mounts revision subview instead of legacy placeholder shell
  const auditoriasHtml = renderAuditoriasView(ADMIN_PROFILE, {
    activeSubSection: 'revision',
    revisionState: DEFAULT_REVISION_STATE,
    actorNameById: actorMap,
    programacionState: {
      activeSubView: 'campaigns',
      query: '',
      viewMode: 'list',
      isSidebarOpen: true,
      selectedTipo: 'ALL',
      selectedMetodologia: 'ALL',
      selectedEstatus: 'ALL',
      selectedAuditorLider: 'ALL',
      sortColumn: null,
      sortDirection: 'none',
      facetSelections: {},
      selectedAuditId: null,
      selectedProgramId: null,
      selectedSitioAuditoriaId: null,
      selectedSitioAuditoriaTab: 'procesos',
      activeChildTab: 'planificacion',
      unprogrammedStatusFilter: 'ALL',
      unprogrammedNormaId: 'ALL',
      unprogrammedOrgId: 'ALL',
      isCreating: false,
      activeStep: 1,
    },
    calendarioState: {
      displayMode: 'mes',
      referenceYear: 2025,
      referenceMonth: 6,
      selectedQuarter: 2,
      filterAuditorId: 'ALL',
      filterStandard: 'ALL',
      filterMethodology: 'ALL',
      drawerAuditId: null,
      viewMode: 'calendar',
    },
    resultadoState: {
      selectedAuditId: 'ALL',
      activeAuditIdForDecision: AUDIT_UUID_PENDING,
      displayMode: 'list',
      filterType: 'ALL',
      filterLifecycle: 'ALL',
      searchQuery: '',
      isLoggingFinding: false,
      inspectingFindingId: null,
    },
    programacionAudits: [pendingAudit, reviewedAudit],
    phase5Findings: [],
    allAuditorsDetailed: [],
    certificates: [],
    processes: [],
    requirements: [],
    standards: [],
    loading: false,
  });
  assert.match(auditoriasHtml, /data-resizable-table="revision-main"/);
});

test('Step 11.1 SQL schema, index, RLS, and seed assertions remain consistent and balanced', () => {
  const queriesDir = path.resolve(process.cwd(), 'public/supabase/queries');
  const sql01 = fs.readFileSync(path.join(queriesDir, '01_creacion.sql'), 'utf8');
  const sql03 = fs.readFileSync(path.join(queriesDir, '03_indices_optimizacion.sql'), 'utf8');
  const sql04 = fs.readFileSync(path.join(queriesDir, '04_rls.sql'), 'utf8');
  const sql06 = fs.readFileSync(path.join(queriesDir, '06_datos_prueba.sql'), 'utf8');

  assert.match(sql01, /ADD COLUMN IF NOT EXISTS revisado BOOLEAN NOT NULL DEFAULT FALSE/i);
  assert.match(sql01, /ADD COLUMN IF NOT EXISTS fecha_revision DATE NULL/i);
  assert.match(sql01, /ADD COLUMN IF NOT EXISTS revisado_por UUID NULL REFERENCES public\.profiles\(id\)/i);
  assert.match(sql01, /ADD COLUMN IF NOT EXISTS usuario_revisor_id UUID NULL REFERENCES public\.profiles\(id\)/i);
  assert.match(sql01, /ADD COLUMN IF NOT EXISTS documentacion_completa BOOLEAN NOT NULL DEFAULT FALSE/i);
  assert.match(sql01, /ADD COLUMN IF NOT EXISTS resumen_revision TEXT NULL/i);
  assert.match(sql01, /CREATE OR REPLACE FUNCTION public\.fn_validar_revision_auditoria\(\)/i);
  assert.match(sql01, /CREATE TRIGGER trg_validar_revision_auditoria/i);

  assert.match(
    sql03,
    /CREATE INDEX IF NOT EXISTS idx_auditoria_revision_cola\s+ON public\.auditoria\s*\(revisado,\s*fecha_cierre_auditoria DESC\)\s*WHERE estado_ciclo = 'Cerrada' AND deleted_at IS NULL/i
  );

  assert.match(
    sql04,
    /CREATE POLICY "auditoria_update_worker" ON public\.auditoria[\s\S]*?revisado = TRUE[\s\S]*?public\.is_approved_worker\(\)/i
  );

  assert.ok(sql06.includes("'80000000-0000-0000-0000-000000000013'"));
  assert.ok(sql06.includes("'80000000-0000-0000-0000-000000000014'"));

  for (const [name, content] of [
    ['01_creacion.sql', sql01],
    ['03_indices_optimizacion.sql', sql03],
    ['04_rls.sql', sql04],
    ['06_datos_prueba.sql', sql06],
  ]) {
    const dollarCount = (content.match(/\$\$/g) ?? []).length;
    assert.equal(dollarCount % 2, 0, `${name} has unbalanced $$ delimiters`);
  }
});

test('Step 4.1: Revision Multi View & Detail View render organizacion_abreviacion, vN chip, Alcance tooltip, and Sin alcance badge cleanly', () => {
  const certVerId = '70000000-0000-0000-0000-000000000201';
  const auditWithScope = makeAudit({
    id: AUDIT_UUID_PENDING,
    id_certificado: '40000000-0000-0000-0000-000000000001',
    id_certificado_version: certVerId,
    version_numero: 2,
    organizacion_abreviacion: 'ANDINA',
    numero_certificado: 'FN-QMS-2025-101',
    codigo_auditoria: 'AUD-2025-101',
  });
  const auditNoScope = makeAudit({
    id: AUDIT_UUID_REVIEWED,
    id_certificado: '40000000-0000-0000-0000-000000000002',
    numero_certificado: 'FN-QMS-2025-102',
    codigo_auditoria: 'AUD-2025-102',
    id_organizacion: '30000000-0000-0000-0000-000000000002',
    organizacion_nombre: 'Tecno Norte C.A.',
    organizacion_abreviacion: 'NORTE-SA',
    revisado: true,
    fecha_revision: '2025-06-18',
  });
  const certs: CertificadoDetailEntity[] = [
    {
      id: auditWithScope.id_certificado,
      numero_certificado: 'FN-QMS-2025-101',
      id_organizacion: auditWithScope.id_organizacion,
      organizacion_nombre: auditWithScope.organizacion_nombre,
      organizacion_abreviacion: 'ANDINA',
      id_norma: '10000000-0000-0000-0000-000000000001',
      norma_codigo: 'ISO 9001:2015',
      estatus: 'Activo',
      sector_iaf: 17,
      alcance: 'Manufactura industrial certificada.',
      alcanceDetalle: {
        id: 'a0000000-0000-0000-0000-000000000001',
        id_certificado: auditWithScope.id_certificado,
        alcance_es: 'Manufactura industrial certificada.',
        alcance_en: null,
        esCompartido: false,
        deleted_at: null,
      },
      versiones: [
        {
          id: certVerId,
          id_certificado: auditWithScope.id_certificado,
          version_numero: 2,
          es_version_actual: true,
          fecha_emision_version: '2025-01-01',
          organizacion_abreviacion: 'ANDINA',
          sitios: [],
          procesos: [],
          turnos: [],
          noAplicables: [],
          deleted_at: null,
        },
      ],
      sitios: [],
    },
    {
      id: auditNoScope.id_certificado,
      numero_certificado: 'FN-QMS-2025-102',
      id_organizacion: auditNoScope.id_organizacion,
      organizacion_nombre: 'Tecno Norte C.A.',
      organizacion_abreviacion: 'NORTE-SA',
      id_norma: '10000000-0000-4000-8000-000000000001',
      norma_codigo: 'ISO 9001:2015',
      estatus: 'Activo',
      sector_iaf: 17,
      alcance: '',
      alcanceDetalle: null,
      sitios: [],
    },
  ];

  const rows = buildCertificateRevisionRows({
    audits: [auditWithScope, auditNoScope],
    actorNameById: new Map(),
    certificados: certs,
  });
  assert.equal(rows.length, 2);
  assert.equal(rows.find((r) => r.certId === auditWithScope.id_certificado)?.activeVersionNumero, 2);
  assert.equal(rows.find((r) => r.certId === auditNoScope.id_certificado)?.hasAlcance, false);

  const listHtml = renderRevisionView({
    profile: ADMIN_PROFILE,
    state: DEFAULT_REVISION_STATE,
    audits: [auditWithScope, auditNoScope],
    certificados: certs,
    findings: [],
    actorNameById: new Map(),
  });
  assert.match(listHtml, /ANDINA/);
  assert.match(listHtml, /NORTE-SA/);
  assert.equal(assertZeroUuidExposure(listHtml).compliant, true);

  const modalWithScopeHtml = renderRevisionView({
    profile: ADMIN_PROFILE,
    state: {
      ...DEFAULT_REVISION_STATE,
      pickerOrgId: auditWithScope.id_organizacion,
    },
    audits: [auditWithScope, auditNoScope],
    certificados: certs,
    findings: [],
    actorNameById: new Map(),
  });
  assert.match(modalWithScopeHtml, /data-action="select-org-picker-cert"/);
  assert.match(modalWithScopeHtml, />v2</);
  assert.match(modalWithScopeHtml, /Alcance: Manufactura industrial certificada\./);
  assert.equal(assertZeroUuidExposure(modalWithScopeHtml).compliant, true);

  const modalNoScopeHtml = renderRevisionView({
    profile: ADMIN_PROFILE,
    state: {
      ...DEFAULT_REVISION_STATE,
      pickerOrgId: auditNoScope.id_organizacion,
    },
    audits: [auditWithScope, auditNoScope],
    certificados: certs,
    findings: [],
    actorNameById: new Map(),
  });
  assert.match(modalNoScopeHtml, /data-action="select-org-picker-cert"/);
  assert.match(modalNoScopeHtml, /Sin alcance/);
  assert.equal(assertZeroUuidExposure(modalNoScopeHtml).compliant, true);

  const detailHtml = renderRevisionView({
    profile: WORKER_PROFILE,
    state: {
      ...DEFAULT_REVISION_STATE,
      selectedCertId: auditWithScope.id_certificado,
      selectedAuditId: auditWithScope.id,
    },
    audits: [auditWithScope],
    certificados: certs,
    findings: [],
    actorNameById: new Map(),
  });
  assert.match(detailHtml, /ANDINA/);
  assert.match(detailHtml, /v2/);
  assert.match(detailHtml, /data-testid="zone1-org-nav-btn"/);
  assert.match(detailHtml, /data-testid="zone1-cert-nav-btn"/);
  assert.match(detailHtml, /data-testid="revision-summary-strip"/);
  assert.match(detailHtml, /Tipo:/);
  assert.match(detailHtml, /Fechas Reales:/);
  assert.match(detailHtml, /No Conformidades:/);
  assert.equal(assertZeroUuidExposure(detailHtml).compliant, true);
});

test('Step 4.4: 7. Revisión inherits unified Zone 1+2 shell, avoids Zone 3 header repetition, and keeps read-only labels 100% Spanish', () => {
  const audit = makeAudit({
    id: AUDIT_UUID_PENDING,
    id_certificado: '40000000-0000-0000-0000-000000000001',
    numero_certificado: 'FN-QMS-2025-101',
    codigo_auditoria: 'AUD-2025-101',
    organizacion_abreviacion: 'ANDINA',
  });
  const findings: Phase5FindingEntity[] = [
    makeFinding({ id: 'f-open', id_auditoria: AUDIT_UUID_PENDING, tipo: 'NC_MENOR', cerrado: false, fecha_cierre: null }),
  ];

  const staffHtml = renderRevisionView({
    profile: WORKER_PROFILE,
    state: {
      ...DEFAULT_REVISION_STATE,
      selectedCertId: audit.id_certificado,
      selectedAuditId: audit.id,
    },
    audits: [audit],
    findings,
    actorNameById: new Map(),
  });
  assert.match(staffHtml, />\s*7\. Revisión\s*</);
  assert.match(staffHtml, /data-testid="audit-zone-1-data"/);
  assert.match(staffHtml, /data-testid="audit-zone-2-selectors"/);

  const stripMatch = staffHtml.match(/data-testid="revision-summary-strip"[\s\S]*?<\/section>/);
  assert.ok(stripMatch, 'Expected revision-summary-strip section');
  assert.match(stripMatch[0], /Tipo:/);
  assert.match(stripMatch[0], /Fechas Reales:/);
  assert.match(stripMatch[0], /No Conformidades:/);
  assert.doesNotMatch(stripMatch[0], /FN-QMS-2025-101|AUD-2025-101|Industrias Andinas/);
  assert.match(staffHtml, /id="revisionDateInput"/);
  assert.match(staffHtml, /id="revisionCommentInput"/);
  assert.match(staffHtml, /id="saveRevisionBtn"/);

  const auditorHtml = renderRevisionView({
    profile: AUDITOR_PROFILE,
    state: {
      ...DEFAULT_REVISION_STATE,
      selectedCertId: audit.id_certificado,
      selectedAuditId: audit.id,
    },
    audits: [audit],
    findings,
    actorNameById: new Map(),
  });
  assert.match(auditorHtml, /Solo Lectura · Auditor/);
  assert.doesNotMatch(auditorHtml, /Solo Lectura · AUDITOR/);
  assert.equal(assertZeroUuidExposure(auditorHtml).compliant, true);

  const clientHtml = renderRevisionView({
    profile: CLIENT_PROFILE,
    state: {
      ...DEFAULT_REVISION_STATE,
      selectedCertId: audit.id_certificado,
      selectedAuditId: audit.id,
    },
    audits: [audit],
    findings,
    actorNameById: new Map(),
  });
  assert.match(clientHtml, /Solo Lectura · Cliente/);
  assert.doesNotMatch(clientHtml, /Solo Lectura · CLIENT/);
  assert.equal(assertZeroUuidExposure(clientHtml).compliant, true);
});
