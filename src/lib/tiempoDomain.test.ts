import test from 'node:test';
import assert from 'node:assert/strict';

import type { AuditoriaSitioPlanItem, ProgramaAuditoriaEntity } from './auditPlanningEngine';
import type { ProgramacionAuditEntity } from './auditExecution';
import type { AuditoriaSitioTemporalEntity } from './designacionTemporalDomain';
import { containsRawUuid } from './zeroUuid';
import {
  buildAuditTiempoDetail,
  buildCampaignTiempoRows,
  buildCertificateTiempoRows,
  isValidQuarterDayAmount,
  validatePositiveSiteTimeUpdate,
  validateSiteTimeUpdate,
} from './tiempoDomain';

const UUID_ORG = '30000000-0000-0000-0000-000000000001';
const UUID_VINCULO = '25000000-0000-0000-0000-000000000001';
const UUID_GRUPO = '20000000-0000-0000-0000-000000000001';
const UUID_TIPO = '60000000-0000-0000-0000-000000000001';

function makeSitePlan(
  id: string,
  id_auditoria: string,
  numero_sitio: number,
  nombre_sitio: string,
  tiempo_auditoria: number,
  deleted_at: string | null = null
): AuditoriaSitioPlanItem {
  return {
    id,
    id_auditoria,
    id_sitio: `50000000-0000-0000-0000-${id.slice(-12)}`,
    numero_sitio,
    nombre_sitio,
    tiempo_auditoria,
    modalidad_evaluacion: 'Presencial',
    procesos: [],
    equipoSitio: [],
    deleted_at,
  };
}

function makeAudit(overrides: Partial<ProgramacionAuditEntity>): ProgramacionAuditEntity {
  const id = overrides.id ?? '80000000-0000-0000-0000-000000000001';
  return {
    id,
    id_programa_auditoria: overrides.id_programa_auditoria ?? '70000000-0000-0000-0000-000000000001',
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
    latestDate: overrides.latestDate === undefined ? null : overrides.latestDate,
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
  auditorias: ProgramacionAuditEntity[],
  deleted_at: string | null = null
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
    deleted_at,
    auditorias,
  };
}

test('buildCampaignTiempoRows enforces Step 3 + Step 4 entry gate, detects Incompletos (0d sites), and sorts Incompletos first', () => {
  const progMissingStep3 = makeProgram('70000000-0000-0000-0000-000000000001', 'Sin Paso 3', [
    makeAudit({
      id: '80000000-0000-0000-0000-000000000001',
      id_tipo_auditoria: null,
      fechas: [],
      sitiosPlan: [
        makeSitePlan('82000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000001', 0, 'Sede Central', 1.5),
      ],
    }),
  ]);

  const progMissingStep4 = makeProgram('70000000-0000-0000-0000-000000000002', 'Sin Paso 4', [
    makeAudit({
      id: '80000000-0000-0000-0000-000000000002',
      sitiosPlan: [
        // Soft-deleted site must not count as active Step 4 site
        makeSitePlan(
          '82000000-0000-0000-0000-000000000002',
          '80000000-0000-0000-0000-000000000002',
          0,
          'Sede Archivada',
          1.0,
          '2026-01-01T00:00:00Z'
        ),
      ],
    }),
  ]);

  const progCompleteEarlier = makeProgram('70000000-0000-0000-0000-000000000003', 'Campaña Completa', [
    makeAudit({
      id: '80000000-0000-0000-0000-000000000003',
      fechas: [
        {
          id: '81000000-0000-0000-0000-000000000003',
          id_auditoria: '80000000-0000-0000-0000-000000000003',
          numero_secuencia: 1,
          tag: 'Programación',
          tipo_fecha: 'PROGRAMADA_EXACTA',
          anio: null,
          mes: null,
          fecha_inicio: '2026-06-05',
          fecha_fin: '2026-06-06',
          observacion: null,
          deleted_at: null,
        },
      ],
      sitiosPlan: [
        makeSitePlan('82000000-0000-0000-0000-000000000003', '80000000-0000-0000-0000-000000000003', 1, 'Planta Norte', 1.25),
        makeSitePlan('82000000-0000-0000-0000-000000000004', '80000000-0000-0000-0000-000000000003', 0, 'Sede Central', 2.0),
      ],
    }),
  ]);

  const progIncompleteLater = makeProgram('70000000-0000-0000-0000-000000000004', 'Campaña Incompleta', [
    makeAudit({
      id: '80000000-0000-0000-0000-000000000004',
      fechas: [
        {
          id: '81000000-0000-0000-0000-000000000004',
          id_auditoria: '80000000-0000-0000-0000-000000000004',
          numero_secuencia: 1,
          tag: 'Programación',
          tipo_fecha: 'PROGRAMADA_EXACTA',
          anio: null,
          mes: null,
          fecha_inicio: '2026-09-10',
          fecha_fin: '2026-09-12',
          observacion: null,
          deleted_at: null,
        },
      ],
      sitiosPlan: [
        makeSitePlan('82000000-0000-0000-0000-000000000005', '80000000-0000-0000-0000-000000000004', 0, 'Sede Central', 1.75),
        makeSitePlan('82000000-0000-0000-0000-000000000006', '80000000-0000-0000-0000-000000000004', 1, 'Bodega Sur', 0),
      ],
    }),
  ]);

  const rows = buildCampaignTiempoRows(
    [progMissingStep3, progMissingStep4, progCompleteEarlier, progIncompleteLater],
    [],
    '2026-06-01'
  );

  assert.equal(rows.length, 2);
  assert.equal(rows[0].program.id, progIncompleteLater.id);
  assert.equal(rows[0].isComplete, false);
  assert.equal(rows[0].unallocatedSitesTotal, 1);
  assert.equal(rows[0].campaignRegularDays, 1.75);

  assert.equal(rows[1].program.id, progCompleteEarlier.id);
  assert.equal(rows[1].isComplete, true);
  assert.equal(rows[1].unallocatedSitesTotal, 0);
  assert.equal(rows[1].campaignRegularDays, 3.25);
  assert.equal(rows[1].certBreakdowns[0].activeSites[0].numero_sitio, 0);
  assert.equal(rows[1].certBreakdowns[0].activeSites[1].numero_sitio, 1);
});

test('buildCampaignTiempoRows deduplicates shared temporal site days across 3 linked certificates', () => {
  const audit1Id = '80000000-0000-0000-0000-000000000011';
  const audit2Id = '80000000-0000-0000-0000-000000000012';
  const audit3Id = '80000000-0000-0000-0000-000000000013';
  const progId = '70000000-0000-0000-0000-000000000011';
  const tempId = '9a000000-0000-0000-0000-000000000011';

  const program = makeProgram(progId, 'Campaña Tri-Norma con Sitio Temporal', [
    makeAudit({
      id: audit1Id,
      id_programa_auditoria: progId,
      numero_certificado: 'FN-QMS-001',
      tiene_sitio_temporal: true,
      sitiosPlan: [
        makeSitePlan('82000000-0000-0000-0000-000000000011', audit1Id, 0, 'Sede HQ', 2.0),
      ],
    }),
    makeAudit({
      id: audit2Id,
      id_programa_auditoria: progId,
      numero_certificado: 'FN-EMS-002',
      norma_codigo: 'ISO 14001:2015',
      tiene_sitio_temporal: false,
      sitiosPlan: [
        makeSitePlan('82000000-0000-0000-0000-000000000012', audit2Id, 0, 'Sede HQ', 1.5),
      ],
    }),
    makeAudit({
      id: audit3Id,
      id_programa_auditoria: progId,
      numero_certificado: 'FN-OHS-003',
      norma_codigo: 'ISO 45001:2018',
      tiene_sitio_temporal: false,
      sitiosPlan: [
        makeSitePlan('82000000-0000-0000-0000-000000000013', audit3Id, 0, 'Sede HQ', 1.25),
      ],
    }),
  ]);

  const sharedTemporal: AuditoriaSitioTemporalEntity = {
    id: tempId,
    id_auditoria: audit1Id,
    etiqueta: 'Proyecto Obra Metro',
    comentario: 'Sitio temporal compartido en los 3 certificados',
    tiempo_auditoria: 1.0,
    certificados: [
      {
        id: '9b000000-0000-0000-0000-000000000001',
        id_sitio_temporal: tempId,
        id_auditoria_certificado: audit1Id,
        numero_certificado: 'FN-QMS-001',
        organizacion_nombre: 'Industrias Andinas S.A.',
        norma_codigo: 'ISO 9001:2015',
      },
      {
        id: '9b000000-0000-0000-0000-000000000002',
        id_sitio_temporal: tempId,
        id_auditoria_certificado: audit2Id,
        numero_certificado: 'FN-EMS-002',
        organizacion_nombre: 'Industrias Andinas S.A.',
        norma_codigo: 'ISO 14001:2015',
      },
      {
        id: '9b000000-0000-0000-0000-000000000003',
        id_sitio_temporal: tempId,
        id_auditoria_certificado: audit3Id,
        numero_certificado: 'FN-OHS-003',
        organizacion_nombre: 'Industrias Andinas S.A.',
        norma_codigo: 'ISO 45001:2018',
      },
    ],
    equipoTemporal: [],
    deleted_at: null,
  };

  const rows = buildCampaignTiempoRows([program], [sharedTemporal], '2026-06-01');
  assert.equal(rows.length, 1);
  const row = rows[0];

  assert.equal(row.campaignRegularDays, 4.75);
  assert.equal(row.campaignTemporalDaysUnique, 1.0);
  assert.equal(row.campaignGrandTotalDays, 5.75);
  assert.equal(row.isComplete, true);

  for (const breakdown of row.certBreakdowns) {
    assert.equal(breakdown.linkedTemporals.length, 1);
    assert.equal(breakdown.linkedTemporalDaysTotal, 1.0);
  }
});

test('isValidQuarterDayAmount, validateSiteTimeUpdate & validatePositiveSiteTimeUpdate enforce 0.25d steps and Zero-UUID', () => {
  assert.equal(isValidQuarterDayAmount(0), true);
  assert.equal(isValidQuarterDayAmount(0.25), true);
  assert.equal(isValidQuarterDayAmount(1.75), true);
  assert.equal(isValidQuarterDayAmount(3.0), true);
  assert.equal(isValidQuarterDayAmount(0.3), false);
  assert.equal(isValidQuarterDayAmount(-0.5), false);
  assert.equal(isValidQuarterDayAmount(Number.NaN), false);
  assert.equal(isValidQuarterDayAmount(Number.POSITIVE_INFINITY), false);

  assert.equal(validateSiteTimeUpdate(0.25, 'Sede Central'), null);
  assert.equal(validateSiteTimeUpdate(1.75, 'Planta Norte'), null);
  assert.equal(validateSiteTimeUpdate(3.0, 'Bodega Sur'), null);

  assert.equal(validatePositiveSiteTimeUpdate(0.25, 'Sede Central'), null);
  assert.equal(validatePositiveSiteTimeUpdate(6.5, 'Planta Norte'), null);
  const zeroErr = validatePositiveSiteTimeUpdate(0, 'Sede Central');
  assert.ok(zeroErr && zeroErr.includes('0.25'));
  assert.equal(containsRawUuid(zeroErr), false);

  const nonQuarterErr = validatePositiveSiteTimeUpdate(0.3, 'Planta Norte');
  assert.ok(nonQuarterErr && nonQuarterErr.includes('0.25'));
  assert.equal(containsRawUuid(nonQuarterErr), false);

  const negativeErr = validateSiteTimeUpdate(-0.5, 'Sede Central');
  assert.ok(negativeErr && negativeErr.includes('negativo'));
  assert.equal(containsRawUuid(negativeErr), false);
});

test('Step 6.1 buildCertificateTiempoRows & buildAuditTiempoDetail group by certificate, order Sitio 0 first, and resolve active temporal note', () => {
  const cert1 = '40000000-0000-0000-0000-000000000001';
  const cert2 = '40000000-0000-0000-0000-000000000002';
  const audit1 = makeAudit({
    id: '80000000-0000-0000-0000-000000000101',
    id_certificado: cert1,
    numero_certificado: 'FN-QMS-2026-001',
    codigo_auditoria: 'AUD-2026-101',
    tiene_sitio_temporal: true,
    sitiosPlan: [
      makeSitePlan('82000000-0000-0000-0000-000000000102', '80000000-0000-0000-0000-000000000101', 1, 'Planta Norte', 1.5),
      makeSitePlan('82000000-0000-0000-0000-000000000101', '80000000-0000-0000-0000-000000000101', 0, 'Sede Central HQ', 5.0),
    ],
  });
  const audit2 = makeAudit({
    id: '80000000-0000-0000-0000-000000000102',
    id_certificado: cert2,
    numero_certificado: 'FN-EMS-2026-002',
    codigo_auditoria: 'AUD-2026-102',
    norma_codigo: 'ISO 14001:2015',
    sitiosPlan: [
      makeSitePlan('82000000-0000-0000-0000-000000000103', '80000000-0000-0000-0000-000000000102', 0, 'Sede Sur', 0),
    ],
  });
  const prog = makeProgram('70000000-0000-0000-0000-000000000101', 'Campaña Multi', [audit1, audit2]);
  const temporalSite: AuditoriaSitioTemporalEntity = {
    id: '9a000000-0000-0000-0000-000000000101',
    id_auditoria: audit1.id,
    etiqueta: 'Proyecto Metro Sur',
    comentario: 'Sitio temporal activo',
    tiempo_auditoria: 1.25,
    certificados: [
      {
        id: '9b000000-0000-0000-0000-000000000101',
        id_sitio_temporal: '9a000000-0000-0000-0000-000000000101',
        id_auditoria_certificado: audit1.id,
        numero_certificado: 'FN-QMS-2026-001',
        organizacion_nombre: 'Industrias Andinas S.A.',
        norma_codigo: 'ISO 9001:2015',
      },
    ],
    equipoTemporal: [],
    deleted_at: null,
  };

  const rows = buildCertificateTiempoRows({
    audits: [audit1, audit2],
    programs: [prog],
    temporalSites: [temporalSite],
    referenceIsoDate: '2026-06-01',
  });
  assert.equal(rows.length, 2);
  const row1 = rows.find((r) => r.certId === cert1);
  const row2 = rows.find((r) => r.certId === cert2);
  assert.ok(row1 && row2);
  assert.equal(row1.statusKey, 'COMPLETO');
  assert.equal(row1.sitesCount, 2);
  assert.equal(row1.permanentDaysTotal, 6.5);
  assert.equal(row1.hasTemporalActive, true);
  assert.equal(row1.temporalDays, 1.25);

  assert.equal(row2.statusKey, 'PENDIENTE');
  assert.equal(row2.unallocatedSitesCount, 1);
  assert.equal(row2.permanentDaysTotal, 0);

  const detail = buildAuditTiempoDetail({
    activeAudit: audit1,
    audits: [audit1, audit2],
    programs: [prog],
    temporalSites: [temporalSite],
  });
  assert.equal(detail.activeSites[0].numero_sitio, 0);
  assert.equal(detail.activeSites[1].numero_sitio, 1);
  assert.equal(detail.permanentDaysTotal, 6.5);
  assert.equal(detail.isComplete, true);
  assert.ok(detail.temporalNote?.isActive);
  assert.equal(detail.temporalNote?.etiqueta, 'Proyecto Metro Sur');
  assert.equal(detail.temporalNote?.diasDeclarados, 1.25);
});
