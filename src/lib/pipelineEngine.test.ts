import test from 'node:test';
import assert from 'node:assert/strict';

import type { ProgramacionAuditEntity } from './auditExecution';
import type { ProgramaAuditoriaEntity } from './auditPlanningEngine';
import type { AuditoriaSitioTemporalEntity } from './designacionTemporalDomain';
import { INITIAL_AUDITORES_DETAILED } from './competencyMatrix';
import {
  PIPELINE_STAGE_ORDER,
  getPipelineStageBadgeMeta,
  resolveCurrentPipelineStage,
} from './pipelineEngine';

function makeAudit(overrides: Partial<ProgramacionAuditEntity> = {}): ProgramacionAuditEntity {
  return {
    id: '81000000-0000-4000-8000-000000000001',
    id_programa_auditoria: '80000000-0000-4000-8000-000000000001',
    codigo_auditoria: 'AUD-2026-201',
    id_certificado: '50000000-0000-4000-8000-000000000001',
    numero_certificado: 'FN-QMS-2026-201',
    id_organizacion: '30000000-0000-4000-8000-000000000001',
    organizacion_nombre: 'Industrias Alfa S.A.',
    norma_codigo: 'ISO 9001:2015',
    sector_iaf: 17,
    id_tipo_auditoria: null,
    tipo_auditoria: 'Seguimiento 1',
    tipo_vinculacion: 'Individual',
    metodologia: 'Presencial',
    fecha_inicio: '',
    fecha_fin: '',
    fechas: [],
    latestDate: null,
    dias_auditor: 0,
    tiempo_auditoria: 0,
    estatus: 'Planificado',
    estado_ciclo: 'Borrador',
    tiene_sitio_temporal: false,
    revisado: false,
    auditor_lider_id: INITIAL_AUDITORES_DETAILED[0].id,
    auditor_lider: INITIAL_AUDITORES_DETAILED[0].nombre,
    sede_principal_direccion: 'Av. Industrial 100',
    equipo: [],
    sitiosMuestreo: [],
    sitiosPlan: [],
    matrizNormativa: [],
    deleted_at: null,
    ...overrides,
  };
}

function makeProgram(
  audits: ProgramacionAuditEntity[],
  overrides: Partial<ProgramaAuditoriaEntity> = {}
): ProgramaAuditoriaEntity {
  return {
    id: '80000000-0000-4000-8000-000000000001',
    id_vinculo: '70000000-0000-4000-8000-000000000001',
    codigo_programa: 'PRG-2026-201',
    etiqueta: 'Industrias Alfa · Seguimiento 2026',
    nivel_vinculacion: 'INDIVIDUAL',
    tipo_vinculacion: 'Individual',
    es_vinculada: false,
    auditorias: audits,
    deleted_at: null,
    ...overrides,
  };
}

test('Step 3.1: PIPELINE_STAGE_ORDER places Relación first before Tipo and maps to #/auditorias/designacion/relacion', () => {
  assert.deepEqual(PIPELINE_STAGE_ORDER, [
    'Relación',
    'Tipo',
    'Sitio',
    'Temporal',
    'Tiempo',
    'Asignación',
    'Programa',
    'Resultado',
    'Revisión',
    'Finalizada',
  ]);

  const meta = getPipelineStageBadgeMeta('Relación');
  assert.equal(meta.stage, 'Relación');
  assert.equal(meta.targetSubview, 'designacion/relacion');
  assert.equal(getPipelineStageBadgeMeta('Tipo').targetSubview, 'designacion/tipo');
  assert.equal(getPipelineStageBadgeMeta('Finalizada').targetSubview, 'resumen');
});

test('Step 3.1: resolveCurrentPipelineStage returns Relación when relation/type are unconfirmed and progresses across all 10 stages', () => {
  // 1a. Empty campaign -> Relación
  assert.equal(resolveCurrentPipelineStage(makeProgram([])), 'Relación');

  // 1b. Audit with neither tipo_vinculacion nor id_tipo_auditoria -> Relación
  const unconfirmedRelacion = makeAudit({
    tipo_vinculacion: null,
    id_tipo_auditoria: null,
    fechas: [],
  });
  assert.equal(resolveCurrentPipelineStage(unconfirmedRelacion), 'Relación');

  // 2. Relación confirmed, missing tipo_auditoria / fecha -> Tipo
  const stageTipo = makeAudit({
    tipo_vinculacion: 'Individual',
    id_tipo_auditoria: null,
    fechas: [],
  });
  assert.equal(resolveCurrentPipelineStage(stageTipo), 'Tipo');

  // 3. Tipo + fecha ready, missing sitio -> Sitio
  const stageSitio = makeAudit({
    tipo_vinculacion: 'Individual',
    id_tipo_auditoria: '91000000-0000-4000-8000-000000000001',
    fechas: [
      {
        id: '92000000-0000-4000-8000-000000000001',
        id_auditoria: '81000000-0000-4000-8000-000000000001',
        numero_secuencia: 1,
        tag: 'Programación',
        tipo_fecha: 'PROGRAMADA_EXACTA',
        anio: null,
        mes: null,
        fecha_inicio: '2026-06-10',
        fecha_fin: '2026-06-12',
        observacion: null,
        deleted_at: null,
      },
    ],
  });
  assert.equal(resolveCurrentPipelineStage(stageSitio), 'Sitio');

  // 4. Temporal ON without temporal site -> Temporal
  const stageTemporal = makeAudit({
    ...stageSitio,
    tiene_sitio_temporal: true,
    sitiosPlan: [
      {
        id: '93000000-0000-4000-8000-000000000001',
        id_auditoria: '81000000-0000-4000-8000-000000000001',
        id_sitio: '40000000-0000-4000-8000-000000000001',
        numero_sitio: 0,
        nombre_sitio: 'Sede Principal HQ',
        modalidad_evaluacion: 'Presencial',
        tiempo_auditoria: 0,
        procesos: [],
        equipoSitio: [],
        deleted_at: null,
      },
    ],
  });
  assert.equal(resolveCurrentPipelineStage(stageTemporal, []), 'Temporal');

  // 5. Tiempo
  const tempSite: AuditoriaSitioTemporalEntity = {
    id: '94000000-0000-4000-8000-000000000001',
    id_auditoria: '81000000-0000-4000-8000-000000000001',
    etiqueta: 'Obra Norte',
    comentario: null,
    tiempo_auditoria: 0.5,
    certificados: [],
    equipoTemporal: [],
    deleted_at: null,
  };
  assert.equal(resolveCurrentPipelineStage(stageTemporal, [tempSite]), 'Tiempo');
});
