import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { UserProfile } from './healthCheck';
import type { Phase5FindingEntity, ProgramacionAuditEntity } from './auditExecution';
import {
  buildRevisionQueueRows,
  formatRevisionDateDdMmYyyy,
  formatRevisionNcSummary,
  validateRevisionDraft,
} from './revisionDomain';
import { DEFAULT_REVISION_STATE, renderRevisionView } from '../views/revisionView';
import { renderAuditoriasView } from '../views/auditoriasView';

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
  estatus: 'APPROVED',
};

const WORKER_PROFILE: UserProfile = {
  id: ACTOR_QA_UUID,
  nombre: 'Analista Operativo QA',
  role: 'WORKER',
  estatus: 'APPROVED',
};

const AUDITOR_PROFILE: UserProfile = {
  id: '33333333-3333-3333-3333-333333333333',
  nombre: 'Auditor Evaluador',
  role: 'AUDITOR',
  estatus: 'APPROVED',
};

const CLIENT_PROFILE: UserProfile = {
  id: '44444444-4444-4444-4444-444444444444',
  nombre: 'Cliente Autorizado',
  role: 'CLIENT',
  estatus: 'APPROVED',
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

test('buildRevisionQueueRows filters exclusively Cerrada audits with fecha_cierre_auditoria and sorts Pendiente first', () => {
  const audits: ProgramacionAuditEntity[] = [
    makeAudit({
      id: AUDIT_UUID_REVIEWED,
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
      id: AUDIT_UUID_UNCLOSED,
      codigo_auditoria: 'AUD-2025-103',
      estado_ciclo: 'Auditada',
      fecha_cierre_auditoria: null,
    }),
    makeAudit({
      id: AUDIT_UUID_ARCHIVED,
      codigo_auditoria: 'AUD-2025-104',
      deleted_at: '2025-06-05T00:00:00Z',
    }),
    makeAudit({
      id: AUDIT_UUID_PENDING,
      codigo_auditoria: 'AUD-2025-101',
      fecha_cierre_auditoria: '2025-06-01',
      revisado: false,
      revisado_por: UNKNOWN_QA_UUID,
    }),
  ];

  const findings: Phase5FindingEntity[] = [
    makeFinding({ id: 'f-1', id_auditoria: AUDIT_UUID_PENDING, tipo: 'NC_MAYOR', cerrado: true }),
    makeFinding({ id: 'f-2', id_auditoria: AUDIT_UUID_PENDING, tipo: 'NC_MENOR', cerrado: false }),
    makeFinding({ id: 'f-3', id_auditoria: AUDIT_UUID_PENDING, tipo: 'OBSERVACION', cerrado: false }),
  ];

  const actorMap = new Map<string, string>([[ACTOR_QA_UUID, 'Analista Operativo QA']]);
  const rows = buildRevisionQueueRows(audits, findings, actorMap);

  assert.equal(rows.length, 2);
  assert.equal(rows[0].audit.id, AUDIT_UUID_PENDING);
  assert.equal(rows[0].revisado, false);
  assert.equal(rows[0].totalNcs, 2);
  assert.equal(rows[0].closedNcs, 1);
  assert.equal(rows[0].openNcs, 1);
  assert.equal(rows[0].revisadoPorNombre, 'Coordinador QA');
  assert.equal(rows[1].audit.id, AUDIT_UUID_REVIEWED);
  assert.equal(rows[1].revisado, true);
  assert.equal(rows[1].revisadoPorNombre, 'Analista Operativo QA');
  assert.equal(formatRevisionDateDdMmYyyy('2025-06-18'), '18/06/2025');
  assert.equal(formatRevisionNcSummary(rows[0]), '2 NCs (1 cerrada)');
});

test('validateRevisionDraft rejects unclosed audits, earlier revision dates, missing doc confirmation, and raw UUIDs', () => {
  const closedAudit = makeAudit({ id: AUDIT_UUID_PENDING, fecha_cierre_auditoria: '2025-06-10' });
  const unclosedAudit = makeAudit({
    id: AUDIT_UUID_UNCLOSED,
    estado_ciclo: 'Auditada',
    fecha_cierre_auditoria: null,
  });

  assert.throws(() =>
    validateRevisionDraft(
      {
        id_auditoria: 'not-a-uuid',
        revisado: true,
        fecha_revision: '2025-06-12',
        documentacion_completa: true,
        resumen_revision: '',
      },
      closedAudit
    )
  );

  const nonClosedErr = validateRevisionDraft(
    {
      id_auditoria: AUDIT_UUID_UNCLOSED,
      revisado: true,
      fecha_revision: '2025-06-12',
      documentacion_completa: true,
      resumen_revision: '',
    },
    unclosedAudit
  );
  assert.match(nonClosedErr || '', /cerradas con fecha de cierre/i);

  const dateOrderErr = validateRevisionDraft(
    {
      id_auditoria: AUDIT_UUID_PENDING,
      revisado: true,
      fecha_revision: '2025-06-09',
      documentacion_completa: true,
      resumen_revision: '',
    },
    closedAudit
  );
  assert.match(dateOrderErr || '', /anterior a la fecha de cierre/i);

  const docMissingErr = validateRevisionDraft(
    {
      id_auditoria: AUDIT_UUID_PENDING,
      revisado: true,
      fecha_revision: '2025-06-11',
      documentacion_completa: false,
      resumen_revision: '',
    },
    closedAudit
  );
  assert.match(docMissingErr || '', /documentación del expediente está completa/i);

  const rawUuidSummaryErr = validateRevisionDraft(
    {
      id_auditoria: AUDIT_UUID_PENDING,
      revisado: true,
      fecha_revision: '2025-06-11',
      documentacion_completa: true,
      resumen_revision: `Verificado por ${ACTOR_QA_UUID}`,
    },
    closedAudit
  );
  assert.match(rawUuidSummaryErr || '', /UUID/i);

  const ok = validateRevisionDraft(
    {
      id_auditoria: AUDIT_UUID_PENDING,
      revisado: true,
      fecha_revision: '2025-06-11',
      documentacion_completa: true,
      resumen_revision: 'Expediente completo conforme.',
    },
    closedAudit
  );
  assert.equal(ok, null);
});

test('renderRevisionView outputs 100% <colgroup>, zero <button> inside <tbody>, Zero-UUID text, and RBAC read-only detail for AUDITOR/CLIENT', () => {
  const pendingAudit = makeAudit({
    id: AUDIT_UUID_PENDING,
    codigo_auditoria: 'AUD-2025-101',
    revisado: false,
  });
  const reviewedAudit = makeAudit({
    id: AUDIT_UUID_REVIEWED,
    codigo_auditoria: 'AUD-2025-102',
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

  // Verify <colgroup> widths sum to 100%
  const colMatches = [...listHtml.matchAll(/<col[^>]*style="width:\s*([0-9.]+)%;"/g)];
  assert.equal(colMatches.length, 5);
  const sumPct = colMatches.reduce((acc, m) => acc + Number(m[1]), 0);
  assert.ok(Math.abs(sumPct - 100) < 0.05, `Expected colgroup sum 100%, got ${sumPct}`);

  // Verify 0 <button> inside <tbody>
  const tbodyMatch = listHtml.match(/<tbody[\s\S]*?<\/tbody>/i);
  assert.ok(tbodyMatch, 'Expected <tbody> in revision list view');
  assert.doesNotMatch(tbodyMatch[0], /<button\b/i, 'Zero <button> allowed inside <tbody>');
  assertVisibleTextHasNoRawUuid(listHtml, 'Revision Multi View');

  // Verify facet filtering to PENDIENTE hides REVISADA
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
  assert.match(filteredHtml, /AUD-2025-101/);
  assert.doesNotMatch(filteredHtml, /AUD-2025-102/);

  // Verify Detail View renders form for WORKER & ADMIN, and read-only without form for AUDITOR & CLIENT
  const workerDetailHtml = renderRevisionView({
    profile: WORKER_PROFILE,
    state: { ...DEFAULT_REVISION_STATE, selectedAuditId: AUDIT_UUID_REVIEWED },
    audits: [pendingAudit, reviewedAudit],
    findings: [],
    actorNameById: actorMap,
  });
  assert.match(workerDetailHtml, /id="revisionApprovalForm"/);
  assert.match(workerDetailHtml, /Analista Operativo QA/);
  assertVisibleTextHasNoRawUuid(workerDetailHtml, 'Worker Detail View');

  for (const readOnlyProfile of [AUDITOR_PROFILE, CLIENT_PROFILE]) {
    const readOnlyDetailHtml = renderRevisionView({
      profile: readOnlyProfile,
      state: { ...DEFAULT_REVISION_STATE, selectedAuditId: AUDIT_UUID_REVIEWED },
      audits: [pendingAudit, reviewedAudit],
      findings: [],
      actorNameById: actorMap,
    });
    assert.doesNotMatch(readOnlyDetailHtml, /id="revisionApprovalForm"/);
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
    /CREATE POLICY "auditoria_update_worker" ON public\.auditoria[\s\S]*?revisado = TRUE[\s\S]*?documentacion_completa = TRUE[\s\S]*?public\.is_approved_worker\(\)/i
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
