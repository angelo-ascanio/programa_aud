import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateCertificationRecommendation,
  detectAuditorScheduleConflicts,
  filterAuditEvents,
  getAuditEffectiveDateLabel,
  getAuditEffectiveEndDate,
  getAuditEffectiveStartDate,
  getModalityVisual,
  getMethodologyVisual,
  getAuditStatusVisual,
  getFindingSeverityMeta,
  getFindingLifecycleMeta,
  hasAuditRescheduleHistory,
  validateAuditPlanningInput,
  INITIAL_AUDIT_EVENTS,
  INITIAL_FINDINGS_DETAILED,
  type AuditFormDraft,
  type FindingItem,
  type AuditEventEntity,
} from './auditDomain.js';
import { INITIAL_PROGRAMACION_AUDITS } from './auditExecution.js';

test('ISO/IEC 17021-1 Recommendation Engine - Strictly blocks when open NC_MAYOR exists', () => {
  const mockFindings: FindingItem[] = [
    {
      id: 'f-1',
      codigo_hallazgo: 'HAL-TEST-01',
      id_auditoria: 'a-1',
      codigo_auditoria: 'AUD-001',
      numero_certificado: 'CERT-001',
      organizacion_nombre: 'Test Org',
      tipo: 'NC_MAYOR',
      id_requisito: 'r-1',
      requisito_codigo: '8.2',
      proceso_nombre: 'Emergencias',
      sitio_nombre: 'Planta 1',
      descripcion: 'Falla crítica',
      evidencia_objetiva: 'Prueba no superada',
      estado: 'Abierto',
      cerrado: false,
      created_at: '2024-11-20T00:00:00Z',
    },
  ];

  const result = evaluateCertificationRecommendation(mockFindings);
  assert.equal(result.status, 'DENEGADA_CONDICIONADA');
  assert.equal(result.canIssueCertificate, false);
  assert.equal(result.openMajorNcCount, 1);
  assert.match(result.blockingReasons[0], /NC_MAYOR/);
  assert.match(result.dictamen, /DENEGADA \/ CONDICIONADA/);
});

test('ISO/IEC 17021-1 Recommendation Engine - Approves when NC_MAYOR is closed and minor NC has approved action plan', () => {
  const mockFindings: FindingItem[] = [
    {
      id: 'f-1',
      codigo_hallazgo: 'HAL-TEST-01',
      id_auditoria: 'a-1',
      codigo_auditoria: 'AUD-001',
      numero_certificado: 'CERT-001',
      organizacion_nombre: 'Test Org',
      tipo: 'NC_MAYOR',
      id_requisito: 'r-1',
      requisito_codigo: '8.2',
      proceso_nombre: 'Emergencias',
      sitio_nombre: 'Planta 1',
      descripcion: 'Falla crítica',
      evidencia_objetiva: 'Prueba corregida',
      causa_raiz: 'Falla de válvula',
      plan_accion_cliente: 'Sustitución de válvula',
      comentarios_verificacion_auditor: 'Cerrado y verificado en campo',
      estado: 'Cerrado',
      cerrado: true,
      created_at: '2024-11-20T00:00:00Z',
    },
    {
      id: 'f-2',
      codigo_hallazgo: 'HAL-TEST-02',
      id_auditoria: 'a-1',
      codigo_auditoria: 'AUD-001',
      numero_certificado: 'CERT-001',
      organizacion_nombre: 'Test Org',
      tipo: 'NC_MENOR',
      id_requisito: 'r-2',
      requisito_codigo: '7.1.5',
      proceso_nombre: 'Calibración',
      sitio_nombre: 'Planta 1',
      descripcion: 'Instrumento vencido',
      evidencia_objetiva: 'Etiqueta vencida',
      causa_raiz: 'Retraso de software',
      plan_accion_cliente: 'Recalibración externa y aviso',
      estado: 'Plan de Acción Enviado',
      cerrado: false,
      created_at: '2024-11-20T00:00:00Z',
    },
  ];

  const result = evaluateCertificationRecommendation(mockFindings, {
    nombre: 'Ing. Carlos Mendoza',
    credencial: 'AUD-LEAD-2024',
  });

  assert.equal(result.status, 'APROBADA');
  assert.equal(result.canIssueCertificate, true);
  assert.equal(result.openMajorNcCount, 0);
  assert.equal(result.openMinorNcCount, 1);
  assert.match(result.dictamen, /APROBADA/);
  assert.ok(result.electronicSignature);
  assert.equal(result.electronicSignature?.auditor_nombre, 'Ing. Carlos Mendoza');
});

test('Auditor Schedule Conflict Detection - Identifies overlapping audit assignments', () => {
  const audits: AuditEventEntity[] = [
    {
      id: 'a1',
      codigo_auditoria: 'AUD-001',
      id_certificado: 'c1',
      numero_certificado: 'CERT-001',
      organizacion_id: 'org1',
      organizacion_nombre: 'Org 1',
      organizacion_rif: 'J-123',
      direccion_principal: 'Caracas',
      norma_codigo: 'ISO 9001',
      norma_titulo: 'Calidad',
      sector_iaf: 17,
      tipo_auditoria: 'Renovación',
      metodologia: 'Presencial',
      fecha_inicio: '2024-11-20',
      fecha_fin: '2024-11-22',
      dias_auditor: 3,
      auditor_lider_id: 'aud-lead-1',
      auditor_lider_nombre: 'Ing. Carlos Mendoza',
      estatus: 'Planificado',
      objetivo: 'Test',
      equipo: [],
      sedesMuestreo: [],
      verificacionNormativa: [],
    },
    {
      id: 'a2',
      codigo_auditoria: 'AUD-002',
      id_certificado: 'c2',
      numero_certificado: 'CERT-002',
      organizacion_id: 'org2',
      organizacion_nombre: 'Org 2',
      organizacion_rif: 'J-456',
      direccion_principal: 'Valencia',
      norma_codigo: 'ISO 14001',
      norma_titulo: 'Ambiental',
      sector_iaf: 14,
      tipo_auditoria: 'Etapa 2',
      metodologia: 'Presencial',
      fecha_inicio: '2024-11-21', // Overlaps with 2024-11-20..2024-11-22
      fecha_fin: '2024-11-23',
      dias_auditor: 3,
      auditor_lider_id: 'aud-lead-1', // Same lead auditor
      auditor_lider_nombre: 'Ing. Carlos Mendoza',
      estatus: 'Planificado',
      objetivo: 'Test overlap',
      equipo: [],
      sedesMuestreo: [],
      verificacionNormativa: [],
    },
  ];

  const conflicts = detectAuditorScheduleConflicts(audits);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].auditor_nombre, 'Ing. Carlos Mendoza');
  assert.equal(conflicts[0].auditoria_a_codigo, 'AUD-001');
  assert.equal(conflicts[0].auditoria_b_codigo, 'AUD-002');
  assert.equal(conflicts[0].fecha_conflicto, '2024-11-21');
});

test('Auditor Schedule Conflict Detection - Ignores completed or non-overlapping audits', () => {
  const audits: AuditEventEntity[] = [
    {
      id: 'a1',
      codigo_auditoria: 'AUD-001',
      id_certificado: 'c1',
      numero_certificado: 'CERT-001',
      organizacion_id: 'org1',
      organizacion_nombre: 'Org 1',
      organizacion_rif: 'J-123',
      direccion_principal: 'Caracas',
      norma_codigo: 'ISO 9001',
      norma_titulo: 'Calidad',
      sector_iaf: 17,
      tipo_auditoria: 'Renovación',
      metodologia: 'Presencial',
      fecha_inicio: '2024-11-20',
      fecha_fin: '2024-11-22',
      dias_auditor: 3,
      auditor_lider_id: 'aud-lead-1',
      auditor_lider_nombre: 'Ing. Carlos Mendoza',
      estatus: 'Cerrada', // Closed audits shouldn't conflict
      objetivo: 'Test',
      equipo: [],
      sedesMuestreo: [],
      verificacionNormativa: [],
    },
    {
      id: 'a2',
      codigo_auditoria: 'AUD-002',
      id_certificado: 'c2',
      numero_certificado: 'CERT-002',
      organizacion_id: 'org2',
      organizacion_nombre: 'Org 2',
      organizacion_rif: 'J-456',
      direccion_principal: 'Valencia',
      norma_codigo: 'ISO 14001',
      norma_titulo: 'Ambiental',
      sector_iaf: 14,
      tipo_auditoria: 'Etapa 2',
      metodologia: 'Presencial',
      fecha_inicio: '2024-11-21',
      fecha_fin: '2024-11-23',
      dias_auditor: 3,
      auditor_lider_id: 'aud-lead-1',
      auditor_lider_nombre: 'Ing. Carlos Mendoza',
      estatus: 'Planificado',
      objetivo: 'Test overlap',
      equipo: [],
      sedesMuestreo: [],
      verificacionNormativa: [],
    },
  ];

  const conflicts = detectAuditorScheduleConflicts(audits);
  assert.equal(conflicts.length, 0);
});

test('Filter Audit Events - Filtering by text search, modality, and methodology', () => {
  const filteredBySearch = filterAuditEvents(INITIAL_AUDIT_EVENTS, {
    query: 'Iberometal',
  });
  assert.equal(filteredBySearch.length, 1);
  assert.equal(filteredBySearch[0].codigo_auditoria, 'AUD-2024-001');

  const filteredByModality = filterAuditEvents(INITIAL_AUDIT_EVENTS, {
    selectedModality: 'Etapa 1',
  });
  assert.equal(filteredByModality.length, 1);
  assert.equal(filteredByModality[0].codigo_auditoria, 'AUD-2024-002');

  const filteredByMethodology = filterAuditEvents(INITIAL_AUDIT_EVENTS, {
    selectedMethodology: 'Remota',
  });
  assert.equal(filteredByMethodology.length, 1);
  assert.equal(filteredByMethodology[0].codigo_auditoria, 'AUD-2024-002');
});

test('Visual Meta Token Formatters', () => {
  const modMeta = getModalityVisual('Renovación');
  assert.equal(modMeta.symbol, '🔄');
  assert.equal(modMeta.label, 'Renovación');

  const methMeta = getMethodologyVisual('Presencial');
  assert.equal(methMeta.symbol, '🏢');

  const statMeta = getAuditStatusVisual('Planificado');
  assert.equal(statMeta.label, 'PLANIFICADO');

  const sevMeta = getFindingSeverityMeta('NC_MAYOR');
  assert.equal(sevMeta.symbol, '🚨');
  assert.match(sevMeta.description, /bloquea la certificación/);

  const lifeMeta = getFindingLifecycleMeta('Abierto');
  assert.equal(lifeMeta.stepNumber, 1);
});

test('Site 0 Convention in Seed Audit Events', () => {
  const firstAudit = INITIAL_AUDIT_EVENTS[0];
  assert.ok(firstAudit.sedesMuestreo.length >= 2);
  assert.equal(firstAudit.sedesMuestreo[0].numero_sitio, 0, 'Headquarters must be site 0');
  assert.match(firstAudit.sedesMuestreo[0].nombre_sitio, /HQ|Principal/);
});

test('Step 2.1.2 Alignment - Multi-Date 1:N derived helpers, id_programa_auditoria, and progressive draft validation', () => {
  const firstSeed = INITIAL_PROGRAMACION_AUDITS[0];
  assert.ok(firstSeed.id_programa_auditoria);
  assert.ok(firstSeed.fechas && firstSeed.fechas.length >= 1);
  assert.equal(getAuditEffectiveStartDate(firstSeed), '2024-11-18');
  assert.equal(getAuditEffectiveEndDate(firstSeed), '2024-11-20');
  assert.match(getAuditEffectiveDateLabel(firstSeed), /18\/11\/2024/);
  assert.equal(hasAuditRescheduleHistory(firstSeed), false);

  const rescheduledRecord: AuditFormDraft = {
    id_programa_auditoria: '70000000-0000-4000-8000-000000000009',
    codigo_auditoria: 'AUD-2026-099',
    id_certificado: '40000000-0000-4000-8000-000000000001',
    estado_ciclo: 'Reprogramada',
    tiempo_auditoria: 2.5,
    fechas: [
      {
        id: '81000000-0000-4000-8000-000000000091',
        id_auditoria: '80000000-0000-4000-8000-000000000099',
        numero_secuencia: 1,
        tag: 'Programación',
        tipo_fecha: 'PREPROGRAMADA_MES',
        anio: 2026,
        mes: 5,
        fecha_inicio: null,
        fecha_fin: null,
      },
      {
        id: '81000000-0000-4000-8000-000000000092',
        id_auditoria: '80000000-0000-4000-8000-000000000099',
        numero_secuencia: 2,
        tag: 'Reprogramación',
        tipo_fecha: 'REAL',
        anio: null,
        mes: null,
        fecha_inicio: '2026-06-08',
        fecha_fin: '2026-06-10',
      },
    ],
  };

  assert.equal(getAuditEffectiveStartDate(rescheduledRecord), '2026-06-08');
  assert.equal(getAuditEffectiveEndDate(rescheduledRecord), '2026-06-10');
  assert.equal(hasAuditRescheduleHistory(rescheduledRecord), true);
  assert.equal(
    getAuditEffectiveDateLabel(rescheduledRecord),
    '08/06/2026 – 10/06/2026 (Reprog. #2)'
  );

  // fecha_programacion is no longer required for progressive drafts or multi-date 1:N inputs
  const draftOk = validateAuditPlanningInput({
    id_certificado: rescheduledRecord.id_certificado,
    allowDraft: true,
    fechas: rescheduledRecord.fechas,
  });
  assert.equal(draftOk.valid, true);

  const nonDraftWithoutLegacyDate = validateAuditPlanningInput({
    id_certificado: rescheduledRecord.id_certificado,
    id_tipo_auditoria: 'tipo-1',
    id_metodologia: 'met-1',
    fechas: rescheduledRecord.fechas,
  });
  assert.equal(nonDraftWithoutLegacyDate.valid, true);
});
