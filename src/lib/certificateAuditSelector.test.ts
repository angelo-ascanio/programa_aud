import test from 'node:test';
import assert from 'node:assert/strict';

import type { ProgramacionAuditEntity } from './auditExecution';
import type { ProgramaAuditoriaEntity } from './auditPlanningEngine';
import type { CertificadoDetailEntity } from './multisiteSampling';
import type { CertificateRecord } from './searchControls';
import {
  buildCertificateMultiViewRows,
  formatCertificateAuditOptionLabel,
  getAuditsForCertificateSorted,
  getLinkedSiblingAudits,
  resolveAuditNavigation,
  resolveDefaultAuditForCertificate,
} from './certificateAuditSelector';
import { assertZeroUuidExposure } from './zeroUuid';

const UUID_ORG = '30000000-0000-0000-0000-000000000001';
const UUID_CERT_1 = '40000000-0000-0000-0000-000000000001';
const UUID_CERT_2 = '40000000-0000-0000-0000-000000000002';
const UUID_CERT_EMPTY = '40000000-0000-0000-0000-000000000003';

const UUID_PROG_LINKED = '7a000000-0000-0000-0000-000000000001';
const UUID_AUD_OLD = '80000000-0000-0000-0000-000000000001';
const UUID_AUD_MID = '80000000-0000-0000-0000-000000000002';
const UUID_AUD_NEW = '80000000-0000-0000-0000-000000000003';
const UUID_AUD_SIBLING = '80000000-0000-0000-0000-000000000004';
const UUID_AUD_DELETED = '80000000-0000-0000-0000-000000000099';

function makeAudit(overrides: Partial<ProgramacionAuditEntity>): ProgramacionAuditEntity {
  const id = overrides.id ?? UUID_AUD_NEW;
  return {
    id,
    id_programa_auditoria: overrides.id_programa_auditoria ?? null,
    codigo_auditoria: overrides.codigo_auditoria ?? 'AUD-2026-001',
    id_certificado: overrides.id_certificado ?? UUID_CERT_1,
    numero_certificado: overrides.numero_certificado ?? 'FN-QMS-001',
    id_organizacion: UUID_ORG,
    organizacion_nombre: overrides.organizacion_nombre ?? 'Industrias del Sur S.A.',
    norma_codigo: overrides.norma_codigo ?? 'ISO 9001:2015',
    id_tipo_auditoria: '11000000-0000-0000-0000-000000000003',
    tipo_auditoria: overrides.tipo_auditoria ?? 'Seguimiento 1',
    metodologia: 'Presencial',
    fecha_inicio: overrides.fecha_inicio ?? '2026-06-15',
    fecha_fin: overrides.fecha_fin ?? '2026-06-17',
    dias_auditor: 2,
    tiempo_auditoria: 2,
    estado_ciclo: overrides.estado_ciclo ?? 'Programada',
    estatus_ejecucion: 'Programada',
    tiene_sitio_temporal: false,
    objetivo: 'Auditoría periódica',
    equipo: [],
    sitios: [],
    sitiosPlan: [],
    fechas: overrides.fechas ?? [],
    verificaciones: [],
    hallazgos: [],
    recomendacion: null,
    comentarios: [],
    created_at: overrides.created_at ?? '2026-01-01T00:00:00Z',
    deleted_at: overrides.deleted_at ?? null,
    ...overrides,
  };
}

test('getAuditsForCertificateSorted orders newest-first and excludes soft-deleted audits', () => {
  const aOld = makeAudit({
    id: UUID_AUD_OLD,
    codigo_auditoria: 'AUD-2024-001',
    fecha_inicio: '2024-05-10',
    fechas: [
      {
        id: '81000000-0000-0000-0000-000000000001',
        id_auditoria: UUID_AUD_OLD,
        numero_secuencia: 1,
        tag: 'Ejecución',
        tipo_fecha: 'REAL',
        anio: null,
        mes: null,
        fecha_inicio: '2024-05-10',
        fecha_fin: '2024-05-12',
        observacion: null,
        deleted_at: null,
      },
    ],
  });

  const aMid = makeAudit({
    id: UUID_AUD_MID,
    codigo_auditoria: 'AUD-2025-001',
    fecha_inicio: '2025-05-12',
    fechas: [
      {
        id: '81000000-0000-0000-0000-000000000002',
        id_auditoria: UUID_AUD_MID,
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

  const aNew = makeAudit({
    id: UUID_AUD_NEW,
    id_programa_auditoria: UUID_PROG_LINKED,
    codigo_auditoria: 'AUD-2026-001',
    fecha_inicio: '2026-06-15',
    fechas: [
      {
        id: '81000000-0000-0000-0000-000000000003',
        id_auditoria: UUID_AUD_NEW,
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
  });

  const aDeleted = makeAudit({
    id: UUID_AUD_DELETED,
    codigo_auditoria: 'AUD-2027-DEL',
    fecha_inicio: '2027-01-01',
    deleted_at: '2026-02-01T00:00:00Z',
  });

  const otherCertAudit = makeAudit({
    id: UUID_AUD_SIBLING,
    id_certificado: UUID_CERT_2,
    numero_certificado: 'FN-EMS-002',
    codigo_auditoria: 'AUD-2026-002',
  });

  const sorted = getAuditsForCertificateSorted(UUID_CERT_1, [
    aOld,
    aDeleted,
    otherCertAudit,
    aNew,
    aMid,
  ]);
  assert.deepEqual(
    sorted.map((a) => a.id),
    [UUID_AUD_NEW, UUID_AUD_MID, UUID_AUD_OLD]
  );
});

test('resolveDefaultAuditForCertificate and resolveAuditNavigation preserve valid selection and compute ◀/▶ bounds', () => {
  const aOld = makeAudit({ id: UUID_AUD_OLD, fecha_inicio: '2024-05-10' });
  const aMid = makeAudit({ id: UUID_AUD_MID, fecha_inicio: '2025-05-10' });
  const aNew = makeAudit({ id: UUID_AUD_NEW, fecha_inicio: '2026-05-10' });
  const aOtherCert = makeAudit({ id: UUID_AUD_SIBLING, id_certificado: UUID_CERT_2 });
  const pool = [aOld, aMid, aNew, aOtherCert];

  // Null or mismatched persisted ID picks newest audit for cert
  assert.equal(resolveDefaultAuditForCertificate(UUID_CERT_1, null, pool)?.id, UUID_AUD_NEW);
  assert.equal(
    resolveDefaultAuditForCertificate(UUID_CERT_1, UUID_AUD_SIBLING, pool)?.id,
    UUID_AUD_NEW
  );
  // Valid persisted ID for this cert stays selected
  assert.equal(resolveDefaultAuditForCertificate(UUID_CERT_1, UUID_AUD_MID, pool)?.id, UUID_AUD_MID);
  // 0-audit cert returns null
  assert.equal(resolveDefaultAuditForCertificate(UUID_CERT_EMPTY, UUID_AUD_NEW, pool), null);

  // Navigation bounds: [AUD_NEW (0), AUD_MID (1), AUD_OLD (2)]
  const navFirst = resolveAuditNavigation(UUID_CERT_1, UUID_AUD_NEW, pool);
  assert.equal(navFirst.activeIndex, 0);
  assert.equal(navFirst.prevAuditId, null);
  assert.equal(navFirst.nextAuditId, UUID_AUD_MID);

  const navMid = resolveAuditNavigation(UUID_CERT_1, UUID_AUD_MID, pool);
  assert.equal(navMid.activeIndex, 1);
  assert.equal(navMid.prevAuditId, UUID_AUD_NEW);
  assert.equal(navMid.nextAuditId, UUID_AUD_OLD);

  const navLast = resolveAuditNavigation(UUID_CERT_1, UUID_AUD_OLD, pool);
  assert.equal(navLast.activeIndex, 2);
  assert.equal(navLast.prevAuditId, UUID_AUD_MID);
  assert.equal(navLast.nextAuditId, null);

  const navEmpty = resolveAuditNavigation(UUID_CERT_EMPTY, null, pool);
  assert.equal(navEmpty.auditsForCert.length, 0);
  assert.equal(navEmpty.activeAudit, null);
  assert.equal(navEmpty.prevAuditId, null);
  assert.equal(navEmpty.nextAuditId, null);
});

test('getLinkedSiblingAudits & formatCertificateAuditOptionLabel keep stable batch ordering with Zero-UUID', () => {
  const audQms = makeAudit({
    id: UUID_AUD_NEW,
    id_programa_auditoria: UUID_PROG_LINKED,
    id_certificado: UUID_CERT_1,
    numero_certificado: 'FN-QMS-001',
    norma_codigo: 'ISO 9001:2015',
    codigo_auditoria: 'AUD-2026-QMS',
    tipo_auditoria: 'Seguimiento 1',
  });
  const audEms = makeAudit({
    id: UUID_AUD_SIBLING,
    id_programa_auditoria: UUID_PROG_LINKED,
    id_certificado: UUID_CERT_2,
    numero_certificado: 'FN-EMS-002',
    norma_codigo: 'ISO 14001:2015',
    codigo_auditoria: 'AUD-2026-EMS',
    tipo_auditoria: 'Seguimiento 2',
  });

  const linkedProgram: ProgramaAuditoriaEntity = {
    id: UUID_PROG_LINKED,
    id_vinculo: '7c000000-0000-0000-0000-000000000001',
    id_grupo_empresarial: '20000000-0000-0000-0000-000000000001',
    codigo_programa: 'PROG-2026-001',
    etiqueta: 'Campaña Integrada Sur',
    nivel_vinculacion: 'NIVEL_1_INTRA_ORG',
    tipo_vinculacion: 'Integrada',
    es_vinculada: true,
    tiene_sitio_temporal: false,
    notas: null,
    deleted_at: null,
    auditorias: [audQms, audEms],
  };

  const ctx = getLinkedSiblingAudits(audEms, [audQms, audEms], [linkedProgram]);
  assert.equal(ctx.program?.id, UUID_PROG_LINKED);
  assert.equal(ctx.siblings.length, 2);
  // Ordered stably by numero_certificado regardless of which sibling is active
  assert.deepEqual(
    ctx.siblings.map((s) => s.audit.id),
    [UUID_AUD_SIBLING, UUID_AUD_NEW]
  );
  assert.equal(ctx.siblings[0].isActive, true);
  assert.equal(ctx.siblings[1].isActive, false);

  const label = formatCertificateAuditOptionLabel(audQms, linkedProgram);
  assert.ok(label.includes('AUD-2026-QMS'));
  assert.ok(label.includes('Seguimiento 1'));
  assert.ok(label.includes('Vinculada · Integrada (2)'));
  assert.equal(assertZeroUuidExposure(label).compliant, true);
});

test('buildCertificateMultiViewRows emits 1 row per certificate including 0-audit certificates', () => {
  const certificates: CertificateRecord[] = [
    {
      id: UUID_CERT_1,
      numero_certificado: 'FN-QMS-001',
      organizacion_nombre: 'Industrias del Sur S.A.',
      norma: 'ISO 9001:2015',
      estatus: 'Activo',
      sector_iaf: 17,
    },
    {
      id: UUID_CERT_EMPTY,
      numero_certificado: 'FN-OHS-003',
      organizacion_nombre: 'Industrias del Sur S.A.',
      norma: 'ISO 45001:2018',
      estatus: 'Estudio',
      sector_iaf: 17,
    },
  ];
  const detailedCerts: CertificadoDetailEntity[] = [];

  const a1 = makeAudit({ id: UUID_AUD_NEW, id_certificado: UUID_CERT_1, fecha_inicio: '2026-06-15' });
  const a2 = makeAudit({ id: UUID_AUD_OLD, id_certificado: UUID_CERT_1, fecha_inicio: '2025-06-15' });

  const rows = buildCertificateMultiViewRows({
    certificates,
    detailedCerts,
    audits: [a1, a2],
    programs: [],
    referenceIsoDate: '2026-06-01',
  });

  assert.equal(rows.length, 2);
  const rowWithAudits = rows.find((r) => r.certId === UUID_CERT_1);
  const rowEmpty = rows.find((r) => r.certId === UUID_CERT_EMPTY);
  assert.ok(rowWithAudits);
  assert.equal(rowWithAudits.totalAudits, 2);
  assert.equal(rowWithAudits.latestAudit?.id, UUID_AUD_NEW);
  assert.ok(rowEmpty);
  assert.equal(rowEmpty.totalAudits, 0);
  assert.equal(rowEmpty.latestAudit, null);
});
