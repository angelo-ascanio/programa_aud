import test from 'node:test';
import assert from 'node:assert/strict';

import {
  addDaysToIsoDate,
  applyAuditMigrationInMemory,
  buildDefaultAuditVersionResolutions,
  classifyAuditForVersionMigration,
  cloneCertificateVersionInMemory,
  persistCloneCertificadoVersion,
  persistMigrateAuditsVersion,
  translateCertificadoVersionDbError,
  validateAuditVersionResolutions,
  type AuditMigrationHallazgoRecord,
  type AuditMigrationRecord,
  type AuditVersionClassificationInput,
  type CertVersionSupabaseClient,
} from './certificadoVersionDomain';
import {
  INITIAL_CERTIFICADOS_DETAILED,
  getCertificadoAlcanceSummary,
  type AlcanceCertificadoEntity,
  type CertificadoDetailEntity,
} from './multisiteSampling';
import { containsRawUuid } from './zeroUuid';

const REF_DATE = '2026-06-01';

// =============================================================================
// 1. 4-Category Audit Migration Classifier & Exact +30d / +31d Boundary
// =============================================================================

test('classifyAuditForVersionMigration assigns FINALIZADA_HISTORICA with MANTENER_ANTERIOR default', () => {
  const closedReviewed: AuditVersionClassificationInput = {
    id: '80000000-0000-0000-0000-000000000101',
    codigo_auditoria: 'AUD-2025-001',
    estado_ciclo: 'Cerrada',
    revisado: true,
    auditoria_fecha: [
      { tipo_fecha: 'REAL', fecha_inicio: '2025-05-10', fecha_fin: '2025-05-12', deleted_at: null },
    ],
  };

  const res1 = classifyAuditForVersionMigration(closedReviewed, REF_DATE);
  assert.equal(res1.category, 'FINALIZADA_HISTORICA');
  assert.equal(res1.categoryLabel, 'Finalizadas (Históricas)');
  assert.equal(res1.defaultAction, 'MANTENER_ANTERIOR');
  assert.equal(res1.requiresManualDecision, false);

  const cancelled: AuditVersionClassificationInput = {
    id: '80000000-0000-0000-0000-000000000102',
    codigo_auditoria: 'AUD-2025-002',
    estado_ciclo: 'Cancelada',
    revisado: false,
  };

  const res2 = classifyAuditForVersionMigration(cancelled, REF_DATE);
  assert.equal(res2.category, 'FINALIZADA_HISTORICA');
  assert.equal(res2.defaultAction, 'MANTENER_ANTERIOR');
  assert.equal(res2.requiresManualDecision, false);
});

test('classifyAuditForVersionMigration assigns POST_EJECUCION_CIERRE when active REAL date, Auditada, or Cerrada without revisado', () => {
  const realDateAudit: AuditVersionClassificationInput = {
    id: '80000000-0000-0000-0000-000000000201',
    codigo_auditoria: 'AUD-2026-010',
    estado_ciclo: 'En Ejecución',
    revisado: false,
    auditoria_fecha: [
      {
        numero_secuencia: 1,
        tipo_fecha: 'PROGRAMADA_EXACTA',
        fecha_inicio: '2026-08-15',
        fecha_fin: '2026-08-16',
        deleted_at: null,
      },
      {
        numero_secuencia: 2,
        tipo_fecha: 'REAL',
        fecha_inicio: '2026-05-29',
        fecha_fin: '2026-05-30',
        deleted_at: null,
      },
    ],
  };

  const rReal = classifyAuditForVersionMigration(realDateAudit, REF_DATE);
  assert.equal(rReal.category, 'POST_EJECUCION_CIERRE');
  assert.equal(rReal.categoryLabel, 'Post-ejecución (En cierre)');
  assert.equal(rReal.defaultAction, 'PENDIENTE_DECISION');
  assert.equal(rReal.requiresManualDecision, true);
  assert.equal(rReal.hasActiveRealDate, true);

  const auditadaNoReal: AuditVersionClassificationInput = {
    id: '80000000-0000-0000-0000-000000000202',
    estado_ciclo: 'Auditada',
    revisado: false,
  };
  assert.equal(
    classifyAuditForVersionMigration(auditadaNoReal, REF_DATE).category,
    'POST_EJECUCION_CIERRE'
  );

  const closedUnreviewed: AuditVersionClassificationInput = {
    id: '80000000-0000-0000-0000-000000000203',
    estado_ciclo: 'Cerrada',
    revisado: false,
  };
  assert.equal(
    classifyAuditForVersionMigration(closedUnreviewed, REF_DATE).category,
    'POST_EJECUCION_CIERRE'
  );

  // Soft-deleted REAL date must NOT trigger Category 2
  const softDeletedRealOnly: AuditVersionClassificationInput = {
    id: '80000000-0000-0000-0000-000000000204',
    estado_ciclo: 'Programada',
    revisado: false,
    auditoria_fecha: [
      {
        numero_secuencia: 1,
        tipo_fecha: 'REAL',
        fecha_inicio: '2026-05-20',
        fecha_fin: '2026-05-21',
        deleted_at: '2026-05-22T10:00:00Z',
      },
      {
        numero_secuencia: 2,
        tipo_fecha: 'PROGRAMADA_EXACTA',
        fecha_inicio: addDaysToIsoDate(REF_DATE, 45),
        fecha_fin: addDaysToIsoDate(REF_DATE, 46),
        deleted_at: null,
      },
    ],
  };
  assert.equal(
    classifyAuditForVersionMigration(softDeletedRealOnly, REF_DATE).category,
    'FUTURA'
  );
});

test('classifyAuditForVersionMigration enforces exact +30 days (PRE_EJECUCION_PROXIMA) vs +31 days (FUTURA)', () => {
  const day30 = addDaysToIsoDate(REF_DATE, 30); // 2026-07-01
  const day31 = addDaysToIsoDate(REF_DATE, 31); // 2026-07-02
  assert.equal(day30, '2026-07-01');
  assert.equal(day31, '2026-07-02');

  const atDay30: AuditVersionClassificationInput = {
    id: '80000000-0000-0000-0000-000000000301',
    codigo_auditoria: 'AUD-D30',
    estado_ciclo: 'Programada',
    revisado: false,
    auditoria_fecha: [
      {
        numero_secuencia: 1,
        tipo_fecha: 'PROGRAMADA_EXACTA',
        fecha_inicio: day30,
        fecha_fin: day30,
        deleted_at: null,
      },
    ],
  };

  const atDay31: AuditVersionClassificationInput = {
    id: '80000000-0000-0000-0000-000000000302',
    codigo_auditoria: 'AUD-D31',
    estado_ciclo: 'Programada',
    revisado: false,
    auditoria_fecha: [
      {
        numero_secuencia: 1,
        tipo_fecha: 'PROGRAMADA_EXACTA',
        fecha_inicio: day31,
        fecha_fin: day31,
        deleted_at: null,
      },
    ],
  };

  const res30 = classifyAuditForVersionMigration(atDay30, REF_DATE);
  assert.equal(res30.category, 'PRE_EJECUCION_PROXIMA');
  assert.equal(res30.categoryLabel, 'Pre-ejecución (Próximas)');
  assert.equal(res30.defaultAction, 'PENDIENTE_DECISION');
  assert.equal(res30.requiresManualDecision, true);

  const res31 = classifyAuditForVersionMigration(atDay31, REF_DATE);
  assert.equal(res31.category, 'FUTURA');
  assert.equal(res31.categoryLabel, 'Auditorías futuras');
  assert.equal(res31.defaultAction, 'MIGRAR_NUEVA');
  assert.equal(res31.requiresManualDecision, false);

  // En Ejecución without REAL date is also PRE_EJECUCION_PROXIMA
  const inExecNoReal: AuditVersionClassificationInput = {
    id: '80000000-0000-0000-0000-000000000303',
    estado_ciclo: 'En Ejecución',
    revisado: false,
  };
  assert.equal(
    classifyAuditForVersionMigration(inExecNoReal, REF_DATE).category,
    'PRE_EJECUCION_PROXIMA'
  );

  // Future PREPROGRAMADA_MES beyond +30 days -> FUTURA
  const preprogFutureMonth: AuditVersionClassificationInput = {
    id: '80000000-0000-0000-0000-000000000304',
    estado_ciclo: 'En Programación',
    auditoria_fecha: [
      {
        numero_secuencia: 1,
        tipo_fecha: 'PREPROGRAMADA_MES',
        anio: 2026,
        mes: 9,
        deleted_at: null,
      },
    ],
  };
  assert.equal(
    classifyAuditForVersionMigration(preprogFutureMonth, REF_DATE).category,
    'FUTURA'
  );
});

// =============================================================================
// 2. Modal Validation Blocking Pending Decisions in Categories 2 & 3
// =============================================================================

test('validateAuditVersionResolutions blocks confirmation while Category 2 or 3 decisions are PENDIENTE_DECISION', () => {
  const v1Id = '41000000-0000-0000-0000-000000000001';
  const audits: AuditVersionClassificationInput[] = [
    {
      id: '80000000-0000-0000-0000-000000000001',
      id_certificado_version: v1Id,
      codigo_auditoria: 'AUD-HIST-01',
      estado_ciclo: 'Cerrada',
      revisado: true,
    },
    {
      id: '80000000-0000-0000-0000-000000000002',
      id_certificado_version: v1Id,
      codigo_auditoria: 'AUD-POST-02',
      estado_ciclo: 'Auditada',
      revisado: false,
    },
    {
      id: '80000000-0000-0000-0000-000000000003',
      id_certificado_version: v1Id,
      codigo_auditoria: 'AUD-PROX-03',
      estado_ciclo: 'Programada',
      fecha_programacion: addDaysToIsoDate(REF_DATE, 10),
    },
    {
      id: '80000000-0000-0000-0000-000000000004',
      id_certificado_version: v1Id,
      codigo_auditoria: 'AUD-FUT-04',
      estado_ciclo: 'En Programación',
      fecha_programacion: addDaysToIsoDate(REF_DATE, 60),
    },
  ];

  const defaults = buildDefaultAuditVersionResolutions(audits, v1Id, REF_DATE);
  assert.equal(defaults.length, 4);
  assert.equal(defaults[0].action, 'MANTENER_ANTERIOR');
  assert.equal(defaults[1].action, 'PENDIENTE_DECISION');
  assert.equal(defaults[2].action, 'PENDIENTE_DECISION');
  assert.equal(defaults[3].action, 'MIGRAR_NUEVA');

  const blocked = validateAuditVersionResolutions(defaults);
  assert.equal(blocked.valid, false);
  assert.equal(blocked.pendingDecisionCount, 2);
  assert.ok(blocked.errorMessage?.includes('2 auditorías pendientes'));
  assert.equal(containsRawUuid(blocked.errorMessage || ''), false);

  // Resolve Category 2 -> MANTENER_ANTERIOR, keep Category 3 still pending -> still blocked!
  const partialResolved = defaults.map((item) =>
    item.id_auditoria === '80000000-0000-0000-0000-000000000002'
      ? { ...item, action: 'MANTENER_ANTERIOR' as const }
      : item
  );
  const stillBlocked = validateAuditVersionResolutions(partialResolved);
  assert.equal(stillBlocked.valid, false);
  assert.equal(stillBlocked.pendingDecisionCount, 1);

  // Resolve Category 3 -> MIGRAR_NUEVA -> valid!
  const allResolved = partialResolved.map((item) =>
    item.id_auditoria === '80000000-0000-0000-0000-000000000003'
      ? { ...item, action: 'MIGRAR_NUEVA' as const }
      : item
  );
  const ok = validateAuditVersionResolutions(allResolved);
  assert.equal(ok.valid, true);
  assert.equal(ok.errorMessage, null);
  assert.deepEqual(ok.keepAuditIds, [
    '80000000-0000-0000-0000-000000000001',
    '80000000-0000-0000-0000-000000000002',
  ]);
  assert.deepEqual(ok.migrateAuditIds, [
    '80000000-0000-0000-0000-000000000003',
    '80000000-0000-0000-0000-000000000004',
  ]);
});

// =============================================================================
// 3. In-Memory Version Cloning (0 fecha_certificado, Intact Container alcanceDetalle)
// =============================================================================

test('cloneCertificateVersionInMemory clones structure cleanly with 0 fechas and intact container alcanceDetalle', () => {
  const v1Id = '41000000-0000-0000-0000-000000000001';
  const orgV1Id = '31000000-0000-0000-0000-000000000001';
  const orgV2Id = '31000000-0000-0000-0000-000000000002';

  const containerAlcance: AlcanceCertificadoEntity = {
    id: '42000000-0000-0000-0000-000000000001',
    id_certificado: INITIAL_CERTIFICADOS_DETAILED[0].id,
    alcance_es:
      'Manufactura y comercialización nacional de componentes metálicos troquelados.',
    alcance_en: 'Manufacturing and domestic marketing of stamped metal components.',
    esCompartido: false,
    deleted_at: null,
  };

  const baseCert: CertificadoDetailEntity = {
    ...INITIAL_CERTIFICADOS_DETAILED[0],
    id_certificado_version: v1Id,
    selected_version_id: v1Id,
    id_organizacion_version: orgV1Id,
    organizacion_abreviacion: 'IBEROM',
    version_actual_numero: 1,
    alcance: containerAlcance.alcance_es,
    alcanceDetalle: containerAlcance,
  };

  let seq = 1;
  const deterministicUuid = (): string => {
    const suffix = String(seq).padStart(12, '0');
    seq += 1;
    return `99000000-0000-4000-8000-${suffix}`;
  };

  const cloned = cloneCertificateVersionInMemory({
    cert: baseCert,
    sourceVersionId: v1Id,
    overrides: {
      id_organizacion_version: orgV2Id,
      organizacion_abreviacion: 'IBEROM-V2',
      notas_version: 'Actualización de razón social y sedes.',
      multisitio: true,
    },
    generateUuid: deterministicUuid,
  });

  // Zero fecha_certificado cloned onto v2, while v1 preserves its historical dates
  assert.equal(cloned.clonedFechas.length, 0);
  assert.equal(cloned.clonedCounts.fechas, 0);
  const v2Fechas = cloned.nextCert.fechas.filter(
    (f) => f.id_certificado_version === cloned.newVersionId
  );
  const v1Fechas = cloned.nextCert.fechas.filter(
    (f) => f.id_certificado_version === v1Id
  );
  assert.equal(v2Fechas.length, 0);
  assert.equal(v1Fechas.length, baseCert.fechas.length);

  // Container alcanceDetalle preserved untouched without duplication onto newVersion
  assert.deepEqual(cloned.nextCert.alcanceDetalle, containerAlcance);
  assert.equal(getCertificadoAlcanceSummary(cloned.nextCert), containerAlcance.alcance_es);
  assert.equal('alcance' in cloned.newVersion, false);

  // Version metadata & maps populated accurately
  assert.equal(cloned.newVersion.version_numero, 2);
  assert.equal(cloned.newVersion.es_version_actual, true);
  assert.equal(cloned.newVersion.id_organizacion_version, orgV2Id);
  assert.equal(cloned.clonedCounts.sitios, baseCert.sitios.length);
  assert.equal(cloned.clonedCounts.procesos, baseCert.procesos.length);
  assert.equal(cloned.clonedCounts.no_aplicables, baseCert.noAplicables.length);
  assert.equal(cloned.clonedCounts.contactos, baseCert.contactos.length);

  // Verify remapped site/process IDs in cloned children
  for (const oldSite of baseCert.sitios) {
    const mappedSiteId = cloned.sitioMap[oldSite.id];
    assert.ok(mappedSiteId && mappedSiteId !== oldSite.id);
    const clonedSite = cloned.clonedSitios.find((s) => s.id === mappedSiteId);
    assert.ok(clonedSite);
    assert.equal(clonedSite.id_certificado_version, cloned.newVersionId);
    for (const pps of clonedSite.procesos_por_sitio || []) {
      assert.equal(pps.id_sitio, mappedSiteId);
      assert.equal(pps.id_certificado_version, cloned.newVersionId);
      assert.ok(Object.values(cloned.procesoMap).includes(pps.id_proceso));
    }
  }
});

// =============================================================================
// 4. In-Memory Audit Migration (Remapping sitios, procesos, turnos, hallazgos)
// =============================================================================

test('applyAuditMigrationInMemory remaps sitios, procesos, turnos and hallazgos only for migrated audits', () => {
  const v1Id = '41000000-0000-0000-0000-000000000001';
  const v2Id = '41000000-0000-0000-0000-000000000002';

  const oldSiteId = '50000000-0000-0000-0000-000000000001';
  const newSiteId = '50000000-0000-0000-0000-000000000101';
  const oldProcId = '60000000-0000-0000-0000-000000000001';
  const newProcId = '60000000-0000-0000-0000-000000000101';
  const turnoId = '70000000-0000-0000-0000-000000000001';
  const oldTpsId = '71000000-0000-0000-0000-000000000001';
  const newTpsId = '71000000-0000-0000-0000-000000000101';
  const oldPpsId = '61000000-0000-0000-0000-000000000001';
  const newPpsId = '61000000-0000-0000-0000-000000000101';

  const audits: AuditMigrationRecord[] = [
    {
      id: '80000000-0000-0000-0000-000000000001',
      id_certificado: '40000000-0000-0000-0000-000000000001',
      id_certificado_version: v1Id,
      codigo_auditoria: 'AUD-KEEP-V1',
      sitios_alcance_ids: [oldSiteId],
      sitios: [
        {
          id: 'sa-1',
          id_auditoria: '80000000-0000-0000-0000-000000000001',
          id_sitio: oldSiteId,
          turnos: [{ id: 'tsa-1', id_turnos_por_sitio: oldTpsId, id_turno: turnoId }],
          procesos: [
            {
              id: 'psa-1',
              id_procesos_por_sitio: oldPpsId,
              id_proceso: oldProcId,
            },
          ],
        },
      ],
    },
    {
      id: '80000000-0000-0000-0000-000000000002',
      id_certificado: '40000000-0000-0000-0000-000000000001',
      id_certificado_version: v1Id,
      codigo_auditoria: 'AUD-MIGRATE-V2',
      sitios_alcance_ids: [oldSiteId],
      sitios: [
        {
          id: 'sa-2',
          id_auditoria: '80000000-0000-0000-0000-000000000002',
          id_sitio: oldSiteId,
          turnos: [{ id: 'tsa-2', id_turnos_por_sitio: oldTpsId, id_turno: turnoId }],
          procesos: [
            {
              id: 'psa-2',
              id_procesos_por_sitio: oldPpsId,
              id_proceso: oldProcId,
              turnos: [{ id: 'tpa-2', id_turnos_por_sitio: oldTpsId, id_turno: turnoId }],
            },
          ],
        },
      ],
    },
  ];

  const hallazgos: AuditMigrationHallazgoRecord[] = [
    {
      id: 'h-keep-1',
      id_auditoria: '80000000-0000-0000-0000-000000000001',
      id_requisito: 'req-1',
      id_sitio: oldSiteId,
      id_proceso: oldProcId,
    },
    {
      id: 'h-mig-with-proc',
      id_auditoria: '80000000-0000-0000-0000-000000000002',
      id_requisito: 'req-2',
      id_sitio: oldSiteId,
      id_proceso: oldProcId,
    },
    {
      id: 'h-mig-null-proc',
      id_auditoria: '80000000-0000-0000-0000-000000000002',
      id_requisito: 'req-3',
      id_sitio: oldSiteId,
      id_proceso: null,
    },
  ];

  const result = applyAuditMigrationInMemory({
    audits,
    hallazgos,
    sourceVersionId: v1Id,
    targetVersionId: v2Id,
    migratedAuditIds: ['80000000-0000-0000-0000-000000000002'],
    sitioMap: { [oldSiteId]: newSiteId },
    procesoMap: { [oldProcId]: newProcId },
    targetVersionSitios: [
      {
        id: newSiteId,
        numero_sitio: 1,
        turnos_por_sitio: [
          {
            id: newTpsId,
            id_sitio: newSiteId,
            id_turno: turnoId,
            hora_entrada: '07:00:00',
            hora_salida: '15:00:00',
            descripcion: 'Turno Matutino',
            deleted_at: null,
          },
        ],
        procesos_por_sitio: [
          {
            id: newPpsId,
            id_sitio: newSiteId,
            id_proceso: newProcId,
            nombre_proceso: 'Troquelado',
            tipo_proceso: 'Medular',
            deleted_at: null,
          },
        ],
      },
    ],
  });

  assert.equal(result.migratedCount, 1);
  assert.equal(result.keptCount, 1);

  const keptAudit = result.nextAudits[0];
  assert.equal(keptAudit.id_certificado_version, v1Id);
  assert.equal(keptAudit.sitios?.[0].id_sitio, oldSiteId);
  assert.equal(keptAudit.sitios?.[0].turnos?.[0].id_turnos_por_sitio, oldTpsId);
  assert.equal(keptAudit.sitios?.[0].procesos?.[0].id_proceso, oldProcId);

  const migratedAudit = result.nextAudits[1];
  assert.equal(migratedAudit.id_certificado_version, v2Id);
  assert.deepEqual(migratedAudit.sitios_alcance_ids, [newSiteId]);
  assert.equal(migratedAudit.sitios?.[0].id_sitio, newSiteId);
  assert.equal(migratedAudit.sitios?.[0].turnos?.[0].id_turnos_por_sitio, newTpsId);
  assert.equal(migratedAudit.sitios?.[0].procesos?.[0].id_proceso, newProcId);
  assert.equal(migratedAudit.sitios?.[0].procesos?.[0].id_procesos_por_sitio, newPpsId);
  assert.equal(
    migratedAudit.sitios?.[0].procesos?.[0].turnos?.[0].id_turnos_por_sitio,
    newTpsId
  );

  // Hallazgos checks
  assert.equal(result.nextHallazgos[0].id_sitio, oldSiteId);
  assert.equal(result.nextHallazgos[0].id_proceso, oldProcId);
  assert.equal(result.nextHallazgos[1].id_sitio, newSiteId);
  assert.equal(result.nextHallazgos[1].id_proceso, newProcId);
  assert.equal(result.nextHallazgos[2].id_sitio, newSiteId);
  assert.equal(result.nextHallazgos[2].id_proceso, null);
});

// =============================================================================
// 5. Typed Structural RPC Clients & Spanish Zero-UUID Error Translator
// =============================================================================

test('persistCloneCertificadoVersion calls fn_clonar_version_certificado without p_alcance and parses maps', async () => {
  const capturedCalls: Array<{ fn: string; params?: Record<string, unknown> }> = [];
  const certId = '40000000-0000-0000-0000-000000000001';
  const v1Id = '41000000-0000-0000-0000-000000000001';
  const v2Id = '41000000-0000-0000-0000-000000000002';
  const oldSiteId = '50000000-0000-0000-0000-000000000001';
  const newSiteId = '50000000-0000-0000-0000-000000000101';

  const mockSupabase: CertVersionSupabaseClient = {
    async rpc(fn, params) {
      capturedCalls.push({ fn, params });
      return {
        data: {
          new_version_id: v2Id,
          source_version_id: v1Id,
          version_numero: 2,
          sitio_map: { [oldSiteId]: newSiteId },
          proceso_map: {},
          cloned_counts: {
            sitios: 2,
            turnos_por_sitio: 3,
            procesos: 4,
            procesos_por_sitio: 5,
            exclusiones: 1,
            requisitos_por_proceso: 8,
            contactos: 2,
            compartidos: 0,
          },
        },
        error: null,
      };
    },
  };

  const res = await persistCloneCertificadoVersion(mockSupabase, {
    id_certificado: certId,
    multisitio: true,
    notas_version: 'Nueva versión por cambio de sede',
  });

  assert.equal(res.ok, true);
  assert.equal(capturedCalls.length, 1);
  assert.equal(capturedCalls[0].fn, 'fn_clonar_version_certificado');
  assert.equal('p_alcance' in (capturedCalls[0].params || {}), false);
  assert.equal(res.data?.new_version_id, v2Id);
  assert.equal(res.data?.sitio_map[oldSiteId], newSiteId);
  assert.equal(res.data?.cloned_counts.sitios, 2);
});

test('persistMigrateAuditsVersion calls fn_migrar_auditorias_version_certificado and translates Zero-UUID errors', async () => {
  const v1Id = '41000000-0000-0000-0000-000000000001';
  const v2Id = '41000000-0000-0000-0000-000000000002';
  const auditId = '80000000-0000-0000-0000-000000000010';

  const mockOk: CertVersionSupabaseClient = {
    async rpc() {
      return {
        data: {
          migrated_count: 1,
          kept_count: 2,
          source_version_id: v1Id,
          target_version_id: v2Id,
        },
        error: null,
      };
    },
  };

  const ok = await persistMigrateAuditsVersion(mockOk, {
    source_version_id: v1Id,
    target_version_id: v2Id,
    audit_ids_migrar: [auditId],
    sitio_map: {},
    proceso_map: {},
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.data?.migrated_count, 1);
  assert.equal(ok.data?.kept_count, 2);

  // Error translation checks (RLS 42501, P0001 with leaked UUID)
  const rlsErr = translateCertificadoVersionDbError({
    code: '42501',
    message: 'permission denied for table certificado_version',
  });
  assert.ok(rlsErr.includes('Permisos insuficientes'));
  assert.equal(containsRawUuid(rlsErr), false);

  const uuidLeakedErr = translateCertificadoVersionDbError({
    code: 'P0001',
    message: `No se encontró el sitio ${v1Id} en la versión destino ${v2Id}.`,
  });
  assert.equal(containsRawUuid(uuidLeakedErr), false);
  assert.ok(uuidLeakedErr.includes('referencia interna'));
});
