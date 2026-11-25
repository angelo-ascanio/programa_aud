import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  allocateWizardIndividualAuditCodename,
  allocateWizardIndividualAuditCodenamesBatch,
  allocateWizardLinkedProgramCodename,
  deriveProgramLinkLevelFromCertSubset,
  deriveProgramLinkNatureFromCertSubset,
  isValidAuditLinkNature,
  validateStep3NewCycleDraft,
  type Step3NewCycleDraft,
} from './auditPlanningPersistence';
import type { VinculoEntity } from './vinculoDomain';
import type { VinculoCertAlcanceCandidate } from './alcanceDomain';
import { assertZeroUuidExposure } from './zeroUuid';

const CONG_ID = '11000000-0000-4000-8000-000000000001';
const VINCULO_ID = '51000000-0000-4000-8000-000000000001';
const ORG_A_ID = '31000000-0000-4000-8000-000000000001';
const ORG_B_ID = '31000000-0000-4000-8000-000000000002';
const CERT_1_ID = '41000000-0000-4000-8000-000000000001';
const CERT_2_ID = '41000000-0000-4000-8000-000000000002';
const CERT_3_ID = '41000000-0000-4000-8000-000000000003';
const CERT_OTHER_ID = '41000000-0000-4000-8000-000000000099';
const TIPO_SEG1_ID = '71000000-0000-4000-8000-000000000001';
const TIPO_REN_ID = '71000000-0000-4000-8000-000000000002';

const SAMPLE_VINCULO: VinculoEntity = {
  id: VINCULO_ID,
  id_grupo_empresarial: CONG_ID,
  grupo_nombre: 'Grupo Industrial Sur',
  codigo_vinculo: 'VIN-SUR-03',
  etiqueta: 'Caja Multi Sur',
  nivel_vinculacion: 'NIVEL_2_INTER_ORG',
  tipo_vinculacion: 'Integrada',
  es_vinculada: true,
  tiene_sitio_temporal: false,
  notas: null,
  certificados: [
    {
      id: '61000000-0000-4000-8000-000000000001',
      id_vinculo: VINCULO_ID,
      id_certificado: CERT_1_ID,
      numero_certificado: 'FN-QMS-2026-001',
      norma_codigo: 'ISO 9001:2015',
      id_organizacion: ORG_A_ID,
      organizacion_nombre: 'Metalúrgica Sur S.A.',
      organizacion_abreviacion: 'Metsur',
      tipo_vinculacion_override: 'Combinada',
      estatus: 'Activo',
    },
    {
      id: '61000000-0000-4000-8000-000000000002',
      id_vinculo: VINCULO_ID,
      id_certificado: CERT_2_ID,
      numero_certificado: 'FN-EMS-2026-002',
      norma_codigo: 'ISO 14001:2015',
      id_organizacion: ORG_A_ID,
      organizacion_nombre: 'Metalúrgica Sur S.A.',
      organizacion_abreviacion: 'Metsur',
      estatus: 'Activo',
    },
    {
      id: '61000000-0000-4000-8000-000000000003',
      id_vinculo: VINCULO_ID,
      id_certificado: CERT_3_ID,
      numero_certificado: 'FN-OHS-2026-003',
      norma_codigo: 'ISO 45001:2018',
      id_organizacion: ORG_B_ID,
      organizacion_nombre: 'Logística Sur C.A.',
      organizacion_abreviacion: 'Logisur',
      estatus: 'Activo',
    },
  ],
};

const SAMPLE_CERTS_ALCANCE: VinculoCertAlcanceCandidate[] = [
  {
    id: CERT_1_ID,
    numero_certificado: 'FN-QMS-2026-001',
    organizacion_abreviacion: 'Metsur',
    hasAlcance: true,
  },
  {
    id: CERT_2_ID,
    numero_certificado: 'FN-EMS-2026-002',
    organizacion_abreviacion: 'Metsur',
    hasAlcance: true,
  },
  {
    id: CERT_3_ID,
    numero_certificado: 'FN-OHS-2026-003',
    organizacion_abreviacion: 'Logisur',
    hasAlcance: false, // Missing Alcance on CERT_3
  },
];

test('Step 4.1 Persistence: validateStep3NewCycleDraft accepts subsets (>= 1, even 1 cert) of a multi-cert Vínculo box', () => {
  // Single certificate subset from a 3-cert box (CERT_3 lacks Alcance but is excluded!)
  const singleCertSubset: Step3NewCycleDraft = {
    id_vinculo: VINCULO_ID,
    codigo_programa: 'PRG-2026-010',
    etiqueta: 'Metsur · 2026-08 Seg.1',
    dateMode: 'PREPROGRAMADA_MES',
    anio: 2026,
    mes: 8,
    fecha_inicio: '',
    fecha_fin: '',
    observacion: 'Auditoría individual sobre 1 certificado de la caja.',
    enabledCertCount: 1,
    nivel_vinculacion: 'INDIVIDUAL',
    tipo_vinculacion: 'Combinada',
    certTypes: [
      {
        id_certificado: CERT_1_ID,
        numero_certificado: 'FN-QMS-2026-001',
        organizacion_nombre: 'Metalúrgica Sur S.A.',
        organizacion_abreviacion: 'Metsur',
        norma_codigo: 'ISO 9001:2015',
        id_tipo_auditoria: TIPO_SEG1_ID,
        tipo_vinculacion: 'Combinada',
      },
    ],
  };

  assert.equal(
    validateStep3NewCycleDraft(singleCertSubset, [SAMPLE_VINCULO], SAMPLE_CERTS_ALCANCE),
    null
  );

  // Two-certificate subset (2 of 3) with heterogeneous natures
  const partialSubset: Step3NewCycleDraft = {
    ...singleCertSubset,
    enabledCertCount: 2,
    nivel_vinculacion: 'NIVEL_1_INTRA_ORG',
    tipo_vinculacion: 'Mixta',
    certTypes: [
      singleCertSubset.certTypes[0],
      {
        id_certificado: CERT_2_ID,
        numero_certificado: 'FN-EMS-2026-002',
        organizacion_nombre: 'Metalúrgica Sur S.A.',
        organizacion_abreviacion: 'Metsur',
        norma_codigo: 'ISO 14001:2015',
        id_tipo_auditoria: TIPO_REN_ID,
        tipo_vinculacion: 'Integrada',
      },
    ],
  };

  assert.equal(
    validateStep3NewCycleDraft(partialSubset, [SAMPLE_VINCULO], SAMPLE_CERTS_ALCANCE),
    null
  );
});

test('Step 4.1 Persistence: enforces tipo_vinculacion, id_tipo_auditoria, Alcance on active subset, and Zero-UUID errors', () => {
  const baseDraft: Step3NewCycleDraft = {
    id_vinculo: VINCULO_ID,
    codigo_programa: 'PRG-2026-011',
    etiqueta: 'Sur · 2026-09 Seg.1',
    dateMode: 'PROGRAMADA_EXACTA',
    anio: 2026,
    mes: 9,
    fecha_inicio: '2026-09-14',
    fecha_fin: '2026-09-14',
    fecha_programada: '2026-09-14',
    observacion: 'Validación por certificado.',
    certTypes: [
      {
        id_certificado: CERT_1_ID,
        numero_certificado: 'FN-QMS-2026-001',
        organizacion_nombre: 'Metalúrgica Sur S.A.',
        norma_codigo: 'ISO 9001:2015',
        id_tipo_auditoria: TIPO_SEG1_ID,
        tipo_vinculacion: 'Integrada',
      },
    ],
  };

  // Empty certTypes rejected
  const emptyErr = validateStep3NewCycleDraft(
    { ...baseDraft, certTypes: [] },
    [SAMPLE_VINCULO],
    SAMPLE_CERTS_ALCANCE
  );
  assert.ok(emptyErr);
  assert.equal(assertZeroUuidExposure(emptyErr).compliant, true);

  // Invalid tipo_vinculacion rejected without raw UUID
  const invalidNatureDraft: Step3NewCycleDraft = {
    ...baseDraft,
    certTypes: [
      {
        ...baseDraft.certTypes[0],
        tipo_vinculacion: 'Invalida' as Step3NewCycleDraft['certTypes'][number]['tipo_vinculacion'],
      },
    ],
  };
  const natureErr = validateStep3NewCycleDraft(
    invalidNatureDraft,
    [SAMPLE_VINCULO],
    SAMPLE_CERTS_ALCANCE
  );
  assert.ok(natureErr && natureErr.includes('FN-QMS-2026-001'));
  assert.equal(assertZeroUuidExposure(natureErr || '').compliant, true);

  // Missing id_tipo_auditoria rejected cleanly
  const missingTipoErr = validateStep3NewCycleDraft(
    {
      ...baseDraft,
      certTypes: [{ ...baseDraft.certTypes[0], id_tipo_auditoria: '' }],
    },
    [SAMPLE_VINCULO],
    SAMPLE_CERTS_ALCANCE
  );
  assert.ok(missingTipoErr && missingTipoErr.includes('FN-QMS-2026-001'));
  assert.equal(assertZeroUuidExposure(missingTipoErr || '').compliant, true);

  // Including CERT_3 (which has hasAlcance: false) blocks cleanly without UUID exposure
  const missingAlcanceErr = validateStep3NewCycleDraft(
    {
      ...baseDraft,
      certTypes: [
        baseDraft.certTypes[0],
        {
          id_certificado: CERT_3_ID,
          numero_certificado: 'FN-OHS-2026-003',
          organizacion_nombre: 'Logística Sur C.A.',
          organizacion_abreviacion: 'Logisur',
          norma_codigo: 'ISO 45001:2018',
          id_tipo_auditoria: TIPO_SEG1_ID,
          tipo_vinculacion: 'Simultánea',
        },
      ],
    },
    [SAMPLE_VINCULO],
    SAMPLE_CERTS_ALCANCE
  );
  assert.ok(missingAlcanceErr && missingAlcanceErr.includes('FN-OHS-2026-003'));
  assert.equal(assertZeroUuidExposure(missingAlcanceErr || '').compliant, true);

  // Unrelated certificate outside conglomerate/vínculo rejected
  const foreignCertErr = validateStep3NewCycleDraft(
    {
      ...baseDraft,
      certTypes: [
        {
          id_certificado: CERT_OTHER_ID,
          numero_certificado: 'FN-EXT-2026-999',
          organizacion_nombre: 'Externa S.A.',
          norma_codigo: 'ISO 9001:2015',
          id_tipo_auditoria: TIPO_SEG1_ID,
          tipo_vinculacion: 'Individual',
        },
      ],
    },
    [SAMPLE_VINCULO],
    SAMPLE_CERTS_ALCANCE
  );
  assert.ok(foreignCertErr && foreignCertErr.includes('FN-EXT-2026-999'));
  assert.equal(assertZeroUuidExposure(foreignCertErr || '').compliant, true);
});

test('Step 4.1 Persistence: program level & nature derivation helpers + zero any in Step 4.1 modules', () => {
  assert.equal(isValidAuditLinkNature('Integrada'), true);
  assert.equal(isValidAuditLinkNature('Mixta'), true);
  assert.equal(isValidAuditLinkNature('Desconocida'), false);

  assert.equal(
    deriveProgramLinkLevelFromCertSubset([{ id_organizacion: ORG_A_ID }]),
    'INDIVIDUAL'
  );
  assert.equal(
    deriveProgramLinkLevelFromCertSubset([
      { id_organizacion: ORG_A_ID },
      { id_organizacion: ORG_A_ID },
    ]),
    'NIVEL_1_INTRA_ORG'
  );
  assert.equal(
    deriveProgramLinkLevelFromCertSubset([
      { id_organizacion: ORG_A_ID },
      { id_organizacion: ORG_B_ID },
    ]),
    'NIVEL_2_INTER_ORG'
  );

  assert.equal(
    deriveProgramLinkNatureFromCertSubset(['Combinada', 'Combinada']),
    'Combinada'
  );
  assert.equal(
    deriveProgramLinkNatureFromCertSubset(['Combinada', 'Simultánea']),
    'Mixta'
  );

  const wizardSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'src/lib/auditWizardDomain.ts'),
    'utf8'
  );
  const persistenceSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'src/lib/auditPlanningPersistence.ts'),
    'utf8'
  );
  assert.equal(/:\s*any\b|\bas\s+any\b/.test(wizardSrc), false);
  assert.equal(/:\s*any\b|\bas\s+any\b/.test(persistenceSrc), false);
});

test('AUD-AAAA-BBBB-YYYY & L-AUD-AAAA-BBBB-YYYY persistence allocators and UUID validation', () => {
  const progCode = allocateWizardLinkedProgramCodename({
    targetYear: 2028,
    activePrograms: [
      { id: 'p1', codigo_programa: 'L-AUD-0001-0001-2028', auditorias: [{ fecha_inicio: '2028-02-01' }] },
    ],
    triedCodes: new Set(['L-AUD-0002-0002-2028']),
  });
  assert.equal(progCode, 'L-AUD-0003-0003-2028');

  const batch = allocateWizardIndividualAuditCodenamesBatch({
    targetYear: 2028,
    activeAudits: [
      { id: 'a1', codigo_auditoria: 'AUD-0001-0001-2028', fecha_inicio: '2028-03-01', estado_ciclo: 'Cancelada' },
    ],
    count: 2,
    reservedCodes: new Set(['AUD-0002-0002-2028']),
  });
  assert.deepEqual(batch, ['AUD-0003-0003-2028', 'AUD-0004-0004-2028']);

  const retrySingle = allocateWizardIndividualAuditCodename({
    targetYear: 2028,
    activeAudits: [],
    triedCodes: new Set(['AUD-0001-0001-2028']),
  });
  assert.equal(retrySingle, 'AUD-0002-0002-2028');

  const uuidAuditErr = validateStep3NewCycleDraft(
    {
      id_vinculo: VINCULO_ID,
      codigo_programa: 'L-AUD-0001-0001-2028',
      etiqueta: 'Metsur · 2028-08 Seg.1',
      dateMode: 'PREPROGRAMADA_MES',
      anio: 2028,
      mes: 8,
      fecha_inicio: '',
      fecha_fin: '',
      observacion: 'Prueba',
      certTypes: [
        {
          id_certificado: CERT_1_ID,
          numero_certificado: 'FN-QMS-2026-001',
          organizacion_nombre: 'Metalúrgica Sur S.A.',
          norma_codigo: 'ISO 9001:2015',
          id_tipo_auditoria: TIPO_SEG1_ID,
          tipo_vinculacion: 'Combinada',
          codigo_auditoria: CERT_1_ID,
        },
      ],
    },
    [SAMPLE_VINCULO],
    SAMPLE_CERTS_ALCANCE
  );
  assert.ok(uuidAuditErr);
  assert.equal(assertZeroUuidExposure(uuidAuditErr).compliant, true);
});

