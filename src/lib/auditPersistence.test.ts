import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  allocateAuditCodeWithFallback,
  allocateProgramCodeWithFallback,
  assertApprovedStaffForMutation,
  buildAuditDateInsertPayload,
  computeAuditTotalDaysFromActiveSites,
  deriveConsolidatedEquipoAuditorRoles,
  diffProgramAuditCertificates,
  formatZeroUuidError,
  insertWithUniqueCodeRetry,
  isPostgresUniqueViolation,
  resolveCampaignTargetYear,
  rollbackOrphanProgramAndAudits,
  shouldArchiveBeforeProgramLevelUpdate,
  stripRawUuidsFromText,
  validateAndBuildEquipoAuditorProcesoPayload,
  validateAndBuildEquipoAuditorSitioPayload,
  validateAndBuildSitioAuditoriaPayload,
  validateAndBuildStep1ProgramBundle,
  validateAndNormalizeAlertConfigInput,
  validateAuditDateObservationUpdate,
} from './auditPlanningPersistence';
import {
  computeAuditAlerts,
  type AuditDateEntry,
  type ProgramaAuditoriaEntity,
} from './auditPlanningEngine';
import type { UserProfile } from './healthCheck';
import type { CertificadoDetailEntity } from './multisiteSampling';
import { containsRawUuid } from './zeroUuid';

const CERT_1_ID = '40000000-0000-4000-8000-000000000101';
const CERT_2_ID = '40000000-0000-4000-8000-000000000102';
const CERT_3_ID = '40000000-0000-4000-8000-000000000103';
const ORG_A_ID = '30000000-0000-4000-8000-000000000101';
const ORG_B_ID = '30000000-0000-4000-8000-000000000102';
const PROG_ID = '70000000-0000-4000-8000-000000000101';
const ORIGEN_ID = '70000000-0000-4000-8000-000000000099';
const AUDIT_ID = '80000000-0000-4000-8000-000000000101';
const DATE_ID = '81000000-0000-4000-8000-000000000101';
const SITIO_ID = '50000000-0000-4000-8000-000000000101';
const SITIO_AUD_ID = '90000000-0000-4000-8000-000000000101';
const PROC_SITIO_AUD_ID = '91000000-0000-4000-8000-000000000101';
const AUDITOR_1_ID = '10000000-0000-4000-8000-000000000101';
const AUDITOR_2_ID = '10000000-0000-4000-8000-000000000102';
const TIPO_ID = '20000000-0000-4000-8000-000000000101';
const MET_ID = '21000000-0000-4000-8000-000000000101';

const MOCK_CERTS_CATALOG: Array<
  Pick<
    CertificadoDetailEntity,
    'id' | 'id_organizacion' | 'numero_certificado' | 'organizacion_nombre'
  >
> = [
  {
    id: CERT_1_ID,
    id_organizacion: ORG_A_ID,
    numero_certificado: 'FN-QMS-2026-001',
    organizacion_nombre: 'Aceros del Norte S.A.',
  },
  {
    id: CERT_2_ID,
    id_organizacion: ORG_A_ID,
    numero_certificado: 'FN-EMS-2026-002',
    organizacion_nombre: 'Aceros del Norte S.A.',
  },
  {
    id: CERT_3_ID,
    id_organizacion: ORG_B_ID,
    numero_certificado: 'FN-OHS-2026-003',
    organizacion_nombre: 'Logística Austral Ltda.',
  },
];

function makeProfile(
  role: UserProfile['role'],
  status: UserProfile['status'] = 'APPROVED'
): UserProfile {
  return {
    id: '00000000-0000-4000-8000-000000000010',
    nombre: 'Usuario Prueba',
    role,
    status,
    created_at: '2026-01-01T00:00:00Z',
  };
}

test('RBAC: only approved ADMIN or WORKER passes assertApprovedStaffForMutation', () => {
  assert.equal(assertApprovedStaffForMutation(makeProfile('ADMIN', 'APPROVED')).ok, true);
  assert.equal(assertApprovedStaffForMutation(makeProfile('WORKER', 'APPROVED')).ok, true);

  const auditorDenied = assertApprovedStaffForMutation(makeProfile('AUDITOR', 'APPROVED'));
  assert.equal(auditorDenied.ok, false);
  const clientDenied = assertApprovedStaffForMutation(makeProfile('CLIENT', 'APPROVED'));
  assert.equal(clientDenied.ok, false);
  const pendingAdminDenied = assertApprovedStaffForMutation(makeProfile('ADMIN', 'PENDING'));
  assert.equal(pendingAdminDenied.ok, false);
  const rejectedWorkerDenied = assertApprovedStaffForMutation(makeProfile('WORKER', 'REJECTED'));
  assert.equal(rejectedWorkerDenied.ok, false);
  assert.equal(assertApprovedStaffForMutation(null).ok, false);
});

test('Zero-UUID sanitization strips inline UUIDs from database or exception messages', () => {
  const rawMessage = `El certificado ${CERT_1_ID} ya pertenece al programa ${PROG_ID}.`;
  const cleaned = stripRawUuidsFromText(rawMessage);
  assert.equal(containsRawUuid(cleaned), false);

  const formattedErr = formatZeroUuidError(
    new Error(`violates foreign key constraint for ${AUDIT_ID}`)
  );
  assert.equal(containsRawUuid(formattedErr), false);
  assert.match(formattedErr, /Referencia registrada/);
});

test('Step 1 bundle: validates INDIVIDUAL, NIVEL_1_INTRA_ORG, NIVEL_2_INTER_ORG and rejects cross-org on NIVEL_1', () => {
  const validIndividual = validateAndBuildStep1ProgramBundle(
    {
      etiqueta: 'Seguimiento 1 QMS 2026',
      codigo_programa: 'PRG-2026-001',
      nivel_vinculacion: 'INDIVIDUAL',
      tipo_vinculacion: 'Individual',
      certificates: [
        {
          id_certificado: CERT_1_ID,
          id_tipo_auditoria: TIPO_ID,
          id_metodologia: MET_ID,
          codigo_auditoria: 'AUD-2026-001',
          estado_ciclo: 'En Programación',
        },
      ],
      initialDate: {
        tipo_fecha: 'PREPROGRAMADA_MES',
        anio: 2026,
        mes: 8,
        observacion: 'Ventana estimada Q3',
      },
    },
    MOCK_CERTS_CATALOG
  );
  assert.equal(validIndividual.ok, true);
  if (validIndividual.ok) {
    assert.equal(validIndividual.value.programaPayload.es_vinculada, false);
    assert.equal(validIndividual.value.initialDatePayload?.numero_secuencia, 1);
    assert.equal(validIndividual.value.initialDatePayload?.tag, 'Programación');
  }

  const invalidCrossOrgNivel1 = validateAndBuildStep1ProgramBundle(
    {
      etiqueta: 'Integrada Inválida',
      nivel_vinculacion: 'NIVEL_1_INTRA_ORG',
      tipo_vinculacion: 'Integrada',
      certificates: [{ id_certificado: CERT_1_ID }, { id_certificado: CERT_3_ID }],
    },
    MOCK_CERTS_CATALOG
  );
  assert.equal(invalidCrossOrgNivel1.ok, false);

  const validNivel1IntraOrg = validateAndBuildStep1ProgramBundle(
    {
      etiqueta: 'Integrada Aceros del Norte',
      nivel_vinculacion: 'NIVEL_1_INTRA_ORG',
      tipo_vinculacion: 'Integrada',
      id_ciclo_origen: ORIGEN_ID,
      certificates: [{ id_certificado: CERT_1_ID }, { id_certificado: CERT_2_ID }],
    },
    MOCK_CERTS_CATALOG
  );
  assert.equal(validNivel1IntraOrg.ok, true);
  if (validNivel1IntraOrg.ok) {
    assert.equal(validNivel1IntraOrg.value.programaPayload.es_vinculada, true);
    assert.equal(validNivel1IntraOrg.value.programaPayload.id_ciclo_origen, ORIGEN_ID);
  }

  const validNivel2InterOrg = validateAndBuildStep1ProgramBundle(
    {
      etiqueta: 'Grupo Empresarial 2026',
      nivel_vinculacion: 'NIVEL_2_INTER_ORG',
      tipo_vinculacion: 'Simultánea',
      certificates: [{ id_certificado: CERT_1_ID }, { id_certificado: CERT_3_ID }],
    },
    MOCK_CERTS_CATALOG
  );
  assert.equal(validNivel2InterOrg.ok, true);
  if (validNivel2InterOrg.ok) {
    assert.equal(validNivel2InterOrg.value.warnings.length, 0);
  }

  const draftNivel2SingleOrg = validateAndBuildStep1ProgramBundle(
    {
      etiqueta: 'Borrador Grupo Empresarial 2026',
      nivel_vinculacion: 'NIVEL_2_INTER_ORG',
      tipo_vinculacion: 'Simultánea',
      certificates: [{ id_certificado: CERT_1_ID }],
    },
    MOCK_CERTS_CATALOG
  );
  assert.equal(draftNivel2SingleOrg.ok, true);
  if (draftNivel2SingleOrg.ok) {
    assert.equal(draftNivel2SingleOrg.value.warnings.length > 0, true);
  }

  // Self-referencing ciclo origen blocked
  const selfOrigin = validateAndBuildStep1ProgramBundle(
    {
      programId: PROG_ID,
      etiqueta: 'Ciclo circular',
      nivel_vinculacion: 'INDIVIDUAL',
      tipo_vinculacion: 'Individual',
      id_ciclo_origen: PROG_ID,
      certificates: [{ id_certificado: CERT_1_ID }],
    },
    MOCK_CERTS_CATALOG
  );
  assert.equal(selfOrigin.ok, false);

  // Invalid UUID throws in assertValidUuid
  assert.throws(() =>
    validateAndBuildStep1ProgramBundle(
      {
        etiqueta: 'UUID Inválido',
        nivel_vinculacion: 'INDIVIDUAL',
        tipo_vinculacion: 'Individual',
        certificates: [{ id_certificado: 'not-a-uuid' }],
      },
      MOCK_CERTS_CATALOG
    )
  );
});

test('Step 1 diff & level tightening detection order', () => {
  const diff = diffProgramAuditCertificates(
    [
      { id: AUDIT_ID, id_certificado: CERT_1_ID, deleted_at: null },
      { id: '80000000-0000-4000-8000-000000000102', id_certificado: CERT_2_ID, deleted_at: null },
    ],
    [
      {
        id_certificado: CERT_1_ID,
        id_tipo_auditoria: TIPO_ID,
        id_metodologia: MET_ID,
        codigo_auditoria: 'AUD-1',
        estado_ciclo: 'Programada',
        objetivo: null,
      },
      {
        id_certificado: CERT_3_ID,
        id_tipo_auditoria: TIPO_ID,
        id_metodologia: MET_ID,
        codigo_auditoria: 'AUD-3',
        estado_ciclo: 'Borrador',
        objetivo: null,
      },
    ]
  );
  assert.equal(diff.toUpdate.length, 1);
  assert.equal(diff.toUpdate[0].auditId, AUDIT_ID);
  assert.equal(diff.toInsert.length, 1);
  assert.equal(diff.toInsert[0].id_certificado, CERT_3_ID);
  assert.equal(diff.toArchive.length, 1);
  assert.equal(diff.toArchive[0].id_certificado, CERT_2_ID);

  assert.equal(shouldArchiveBeforeProgramLevelUpdate('NIVEL_2_INTER_ORG', 'NIVEL_1_INTRA_ORG'), true);
  assert.equal(shouldArchiveBeforeProgramLevelUpdate('NIVEL_1_INTRA_ORG', 'INDIVIDUAL'), true);
  assert.equal(shouldArchiveBeforeProgramLevelUpdate('INDIVIDUAL', 'NIVEL_1_INTRA_ORG'), false);
});

test('Multi-Fecha 1:N: assigns #1 Programación, #2+ Reprogramación, enforces PREPROGRAMADA_MES vs REAL', () => {
  const firstBuilt = buildAuditDateInsertPayload(AUDIT_ID, [], {
    tipo_fecha: 'PREPROGRAMADA_MES',
    anio: 2026,
    mes: 7,
    observacion: 'Plan inicial anual',
  });
  assert.equal(firstBuilt.ok, true);
  if (firstBuilt.ok) {
    assert.equal(firstBuilt.value.numero_secuencia, 1);
    assert.equal(firstBuilt.value.tag, 'Programación');
    assert.equal(firstBuilt.value.anio, 2026);
    assert.equal(firstBuilt.value.mes, 7);
    assert.equal(firstBuilt.value.fecha_inicio, null);
    assert.equal(firstBuilt.value.fecha_fin, null);
  }

  const existingFechas: AuditDateEntry[] = [
    {
      id: DATE_ID,
      id_auditoria: AUDIT_ID,
      numero_secuencia: 1,
      tag: 'Programación',
      tipo_fecha: 'PREPROGRAMADA_MES',
      anio: 2026,
      mes: 7,
      fecha_inicio: null,
      fecha_fin: null,
      observacion: 'Plan inicial',
      deleted_at: null,
    },
  ];

  const secondBuilt = buildAuditDateInsertPayload(AUDIT_ID, existingFechas, {
    tipo_fecha: 'REAL',
    fecha_inicio: '2026-07-14',
    fecha_fin: '2026-07-16',
    observacion: 'Confirmación con cliente',
  });
  assert.equal(secondBuilt.ok, true);
  if (secondBuilt.ok) {
    assert.equal(secondBuilt.value.numero_secuencia, 2);
    assert.equal(secondBuilt.value.tag, 'Reprogramación');
    assert.equal(secondBuilt.value.anio, null);
    assert.equal(secondBuilt.value.mes, null);
    assert.equal(secondBuilt.value.fecha_inicio, '2026-07-14');
    assert.equal(secondBuilt.value.fecha_fin, '2026-07-16');
  }

  const invalidInvertedReal = buildAuditDateInsertPayload(AUDIT_ID, existingFechas, {
    tipo_fecha: 'REAL',
    fecha_inicio: '2026-07-20',
    fecha_fin: '2026-07-18',
  });
  assert.equal(invalidInvertedReal.ok, false);

  const validObs = validateAuditDateObservationUpdate(DATE_ID, 'Ajuste por parada técnica');
  assert.equal(validObs.ok, true);

  const uuidInObs = validateAuditDateObservationUpdate(DATE_ID, `Ref ${AUDIT_ID}`);
  assert.equal(uuidInObs.ok, false);
});

test('Step 2 Granular: 0.25d rounding, total days sum, and consolidated equipo_auditor role derivation', () => {
  const siteBuilt = validateAndBuildSitioAuditoriaPayload(AUDIT_ID, SITIO_ID, 2.38, 'Mixta', {
    fecha_inicio: '2026-09-01',
    fecha_fin: '2026-09-03',
  });
  assert.equal(siteBuilt.ok, true);
  if (siteBuilt.ok) {
    // 2.38 rounds to nearest 0.25 -> 2.5
    assert.equal(siteBuilt.value.tiempo_auditoria, 2.5);
    assert.equal(siteBuilt.value.modalidad_evaluacion, 'Mixta');
  }

  const totalDays = computeAuditTotalDaysFromActiveSites([
    { tiempo_auditoria: 1.75, deleted_at: null },
    { tiempo_auditoria: 2.25, deleted_at: null },
    { tiempo_auditoria: 5.0, deleted_at: '2026-05-01T00:00:00Z' },
  ]);
  assert.equal(totalDays, 4.0);

  const eqSitioBuilt = validateAndBuildEquipoAuditorSitioPayload({
    auditId: AUDIT_ID,
    sitioAuditoriaId: SITIO_AUD_ID,
    auditorId: AUDITOR_1_ID,
    rol_auditor: 'AUDITOR_LIDER',
    tiempo_auditoria: 1.62,
    asignacion_completa_sitio: true,
  });
  assert.equal(eqSitioBuilt.ok, true);
  if (eqSitioBuilt.ok) {
    assert.equal(eqSitioBuilt.value.tiempo_auditoria, 1.5);
  }

  const eqProcBuilt = validateAndBuildEquipoAuditorProcesoPayload(
    PROC_SITIO_AUD_ID,
    AUDITOR_2_ID,
    'APOYO_TECNICO'
  );
  assert.equal(eqProcBuilt.ok, true);

  const consolidated = deriveConsolidatedEquipoAuditorRoles(
    [
      { id_auditor: AUDITOR_1_ID, rol_auditor: 'AUDITOR', deleted_at: null },
      { id_auditor: AUDITOR_1_ID, rol_auditor: 'AUDITOR_LIDER', deleted_at: null },
      { id_auditor: AUDITOR_2_ID, rol_auditor: 'AUDITOR', deleted_at: '2026-05-01T00:00:00Z' },
    ],
    [{ id_auditor: AUDITOR_2_ID, rol_en_proceso: 'APOYO_TECNICO', deleted_at: null }]
  );
  assert.equal(consolidated.get(AUDITOR_1_ID), 'AUDITOR_LIDER');
  assert.equal(consolidated.get(AUDITOR_2_ID), 'EXPERTO_TECNICO');

  // Invalid UUID on Step 2 rejects before Supabase call
  assert.throws(() =>
    validateAndBuildSitioAuditoriaPayload('invalid-id', SITIO_ID, 1.0, 'Presencial')
  );
});

test('Alert Config: normalizes integer bounds and recalculates computeAuditAlerts', () => {
  const invalidDays = validateAndNormalizeAlertConfigInput({
    dias_aviso_proxima: 0,
    dias_aviso_preprogramada_sin_confirmar: 45,
    alertar_atrasadas: true,
    alertar_conflicto_auditor: true,
    alertar_desfase_dias_o_span: true,
    ciclos_rotacion_auditor_lider: 3,
    alertas_activas: true,
  });
  assert.equal(invalidDays.ok, false);

  const invalidRotation = validateAndNormalizeAlertConfigInput({
    dias_aviso_proxima: 30,
    dias_aviso_preprogramada_sin_confirmar: 45,
    alertar_atrasadas: true,
    alertar_conflicto_auditor: true,
    alertar_desfase_dias_o_span: true,
    ciclos_rotacion_auditor_lider: 1,
    alertas_activas: true,
  });
  assert.equal(invalidRotation.ok, false);

  const validConfig = validateAndNormalizeAlertConfigInput({
    dias_aviso_proxima: 30.8,
    dias_aviso_preprogramada_sin_confirmar: 45,
    alertar_atrasadas: true,
    alertar_conflicto_auditor: true,
    alertar_desfase_dias_o_span: true,
    ciclos_rotacion_auditor_lider: 3,
    alertas_activas: false,
  });
  assert.equal(validConfig.ok, true);
  if (validConfig.ok) {
    assert.equal(validConfig.value.dias_aviso_proxima, 30);
    const samplePrograms: ProgramaAuditoriaEntity[] = [];
    const alerts = computeAuditAlerts(samplePrograms, {
      id: 'cfg-1',
      ...validConfig.value,
    });
    assert.deepEqual(alerts, []);
  }
});

test('Structural Contract (src/main.ts): exports Step 2.2.2 functions with RBAC, assertValidUuid, archive_record & 0 any', () => {
  const mainTsPath = path.resolve(process.cwd(), 'src/main.ts');
  const persistenceTsPath = path.resolve(process.cwd(), 'src/lib/auditPlanningPersistence.ts');
  const mainSrc = fs.readFileSync(mainTsPath, 'utf8');
  const persistenceSrc = fs.readFileSync(persistenceTsPath, 'utf8');

  const requiredExports = [
    'upsertProcesoPorSitio',
    'archiveProcesoPorSitio',
    'saveProgramaAuditoriaStep1',
    'addOrUpdateAuditDateRevision',
    'syncDateRevisionToProgram',
    'upsertSitioAuditoria',
    'archiveSitioAuditoria',
    'toggleProcesoSitioAuditoria',
    'toggleTurnoProcesoSitioAuditoria',
    'upsertEquipoAuditorSitio',
    'archiveEquipoAuditorSitio',
    'toggleEquipoAuditorProcesoSitio',
    'saveAlertConfigSettings',
  ];

  for (const fnName of requiredExports) {
    assert.match(
      mainSrc,
      new RegExp(`export\\s+async\\s+function\\s+${fnName}\\b`),
      `Expected exported async function ${fnName} in src/main.ts`
    );
  }

  // Verify Sitios <-> Procesos form listeners call the new Step 2.2.2 persistence functions
  assert.match(mainSrc, /getElementById\('assignSitioProcesoForm'\)[\s\S]{0,600}upsertProcesoPorSitio\(/);
  assert.match(mainSrc, /getElementById\('archiveSitioProcesoForm'\)[\s\S]{0,600}archiveProcesoPorSitio\(/);

  // Verify soft-delete RPCs & session log usage in the Step 2.2.2 section
  const stepSectionStart = mainSrc.indexOf('Step 2.2.2 — Persistencia Transaccional Progresiva');
  assert.ok(stepSectionStart > 0, 'Step 2.2.2 section header should exist in src/main.ts');
  const stepSectionEnd = mainSrc.indexOf('async function loadApprovalProfiles', stepSectionStart);
  assert.ok(stepSectionEnd > stepSectionStart, 'Step 2.2.2 section should end before loadApprovalProfiles');
  const stepSection = mainSrc.slice(stepSectionStart, stepSectionEnd);

  assert.match(stepSection, /get_archive_dependency_summary/);
  assert.match(stepSection, /archive_record/);
  assert.match(stepSection, /recordPhase5SessionLog/);
  assert.match(stepSection, /showFloatingToast/);
  assert.match(stepSection, /assertApprovedStaffForMutation/);

  // Only pure junction `equipo_auditor` may use .delete(); soft-delete tables must never use .delete()
  const softDeleteTableDeletes = stepSection.match(
    /\.from\(\s*'(?!equipo_auditor')[^']+'\s*\)\s*\.delete\(/g
  );
  assert.equal(softDeleteTableDeletes, null);

  // Zero `any` in Step 2.2.2 persistence files
  assert.equal(/:\s*any\b|\bas\s+any\b/.test(persistenceSrc), false);
  assert.equal(/:\s*any\b|\bas\s+any\b/.test(stepSection), false);

  // Step 1.2 structural wiring in saveProgramaAuditoriaStep1 & createStep3CampaignCycle
  assert.match(mainSrc, /fn_next_programa_auditoria_codigo/);
  assert.match(mainSrc, /fn_next_auditoria_codigo/);
  assert.match(mainSrc, /insertWithUniqueCodeRetry/);
  assert.match(mainSrc, /rollbackOrphanProgramAndAudits/);
  assert.match(mainSrc, /Rollback por fallo al crear auditoría hija/);
});

test('Step 1.2 — resolveCampaignTargetYear, isPostgresUniqueViolation & RPC/fallback unique code allocation', async () => {
  assert.equal(
    resolveCampaignTargetYear({ dateMode: 'PREPROGRAMADA_MES', anio: 2028, fechaInicio: '2026-01-01' }),
    2028
  );
  assert.equal(
    resolveCampaignTargetYear({ dateMode: 'PROGRAMADA_EXACTA', anio: 2026, fechaInicio: '2027-09-14' }),
    2027
  );
  assert.equal(
    resolveCampaignTargetYear({ dateMode: null, anio: null, fechaInicio: null, fallbackYear: 2026 }),
    2026
  );

  assert.equal(isPostgresUniqueViolation({ code: '23505', message: 'duplicate key' }), true);
  assert.equal(
    isPostgresUniqueViolation({ message: 'duplicate key value violates unique constraint "uq_auditoria_codigo_active"' }),
    true
  );
  assert.equal(isPostgresUniqueViolation({ code: '42501', message: 'permission denied' }), false);

  // Remote RPC succeeds when not already tried
  const rpcProg = await allocateProgramCodeWithFallback({
    targetYear: 2027,
    activePrograms: [{ codigo_programa: 'PROG-2027-001', deleted_at: null }],
    fetchRemoteNextCode: async () => 'PROG-2027-004',
  });
  assert.equal(rpcProg, 'PROG-2027-004');

  // If remote RPC returns an already-tried code or fails, falls back cleanly to local sequence
  const fallbackProg = await allocateProgramCodeWithFallback({
    targetYear: 2027,
    activePrograms: [{ codigo_programa: 'PROG-2027-001', deleted_at: null }],
    triedCodes: new Set(['PROG-2027-002']),
    fetchRemoteNextCode: async () => 'PROG-2027-002',
  });
  assert.equal(fallbackProg, 'PROG-2027-003');

  // Batch reservation guarantees distinct audit codes across certificates in the same year
  const reserved = new Set<string>();
  const firstAuditCode = await allocateAuditCodeWithFallback({
    targetYear: 2028,
    numeroCertificado: 'FN-QMS-2026-001',
    activeAudits: [{ codigo_auditoria: 'AUD-2028-026-001-01', deleted_at: null }],
    reservedCodes: reserved,
    fetchRemoteNextCode: async () => {
      throw new Error('RPC offline');
    },
  });
  reserved.add(firstAuditCode);
  const secondAuditCode = await allocateAuditCodeWithFallback({
    targetYear: 2028,
    numeroCertificado: 'FN-QMS-2026-001',
    activeAudits: [{ codigo_auditoria: 'AUD-2028-026-001-01', deleted_at: null }],
    reservedCodes: reserved,
  });
  assert.notEqual(firstAuditCode, secondAuditCode);
  assert.ok(firstAuditCode.length <= 40);
  assert.ok(secondAuditCode.length <= 40);
});

test('Step 1.2 — insertWithUniqueCodeRetry recovers from 23505 collisions and rollbackOrphanProgramAndAudits cleans dangling parent', async () => {
  const attemptedCodes: string[] = [];
  let seq = 1;
  const recovered = await insertWithUniqueCodeRetry<{ id: string }>({
    initialCode: 'PROG-2027-001',
    allocateCode: async (_attempt, tried) => {
      let candidate = `PROG-2027-${String(seq).padStart(3, '0')}`;
      while (tried.has(candidate)) {
        seq += 1;
        candidate = `PROG-2027-${String(seq).padStart(3, '0')}`;
      }
      return candidate;
    },
    attemptInsert: async (code) => {
      attemptedCodes.push(code);
      if (attemptedCodes.length < 3) {
        return {
          error: {
            code: '23505',
            message: 'duplicate key value violates unique constraint "uq_programa_auditoria_codigo_active"',
          },
        };
      }
      return { data: { id: PROG_ID }, error: null };
    },
  });

  assert.equal(recovered.status, 'ok');
  if (recovered.status === 'ok') {
    assert.equal(recovered.attempts, 3);
    assert.equal(recovered.code, 'PROG-2027-003');
    assert.deepEqual(attemptedCodes, ['PROG-2027-001', 'PROG-2027-002', 'PROG-2027-003']);
  }

  // Collision-breaker suffix activates cleanly if allocator returns the exact colliding code
  const breakerAttempts: string[] = [];
  const breakerRes = await insertWithUniqueCodeRetry<null>({
    initialCode: 'AUD-2028-CERT-01',
    allocateCode: async () => 'AUD-2028-CERT-01',
    attemptInsert: async (code) => {
      breakerAttempts.push(code);
      if (breakerAttempts.length === 1) {
        return { error: { code: '23505', message: 'duplicate key' } };
      }
      return { error: null };
    },
  });
  assert.equal(breakerRes.status, 'ok');
  assert.equal(breakerAttempts.length, 2);
  assert.equal(breakerAttempts[1], 'AUD-2028-CERT-01-R2');

  // Exhausted retries stop at maxAttempts (5) and unrecoverable failure triggers orphan rollback
  const archivedCalls: Array<{ table: string; id: string; reason: string }> = [];
  const exhausted = await insertWithUniqueCodeRetry<null>({
    initialCode: 'AUD-2028-LOOP',
    allocateCode: async (attempt) => `AUD-2028-LOOP-${attempt}`,
    attemptInsert: async () => ({ error: { code: '23505', message: 'duplicate key' } }),
    maxAttempts: 5,
  });
  assert.equal(exhausted.status, 'error');
  if (exhausted.status === 'error') {
    assert.equal(exhausted.attempts, 5);
  }

  await rollbackOrphanProgramAndAudits({
    programId: PROG_ID,
    insertedAuditIds: [AUDIT_ID],
    reason: 'Rollback por fallo al crear auditoría hija',
    archiveRecordFn: async (table, recordId, reason) => {
      archivedCalls.push({ table, id: recordId, reason });
    },
  });

  assert.deepEqual(archivedCalls, [
    { table: 'auditoria', id: AUDIT_ID, reason: 'Rollback por fallo al crear auditoría hija' },
    { table: 'programa_auditoria', id: PROG_ID, reason: 'Rollback por fallo al crear auditoría hija' },
  ]);
  for (const call of archivedCalls) {
    assert.equal(containsRawUuid(call.reason), false);
  }
});
