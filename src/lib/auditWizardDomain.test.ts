import test from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceWizardStep,
  applySameRelacionToAllWizardCerts,
  applySameTipoToAllWizardCerts,
  buildStep3NewCycleDraftFromWizard,
  canAdvanceWizardStep,
  createInitialAuditWizardState,
  getEligibleOrganizationsForWizard,
  goBackWizardStep,
  resolveEligibleVinculosForConglomerado,
  selectWizardConglomerado,
  selectWizardOrganizacion,
  selectWizardVinculo,
  setAllWizardVinculoCerts,
  setWizardCertRelacion,
  setWizardCertTipo,
  toggleWizardVinculoCert,
  WIZARD_NO_VINCULO_GUIDANCE_MESSAGE,
} from './auditWizardDomain';
import { validateStep3NewCycleDraft } from './auditPlanningPersistence';
import { renderAuditWizardModal } from '../views/auditWizardModal';
import type { OrganizacionEntity } from './activeCertificates';
import type { ConglomeradoEntity } from './conglomeradoDomain';
import type { TipoAuditoriaCatalogItem } from './extraDomain';
import type { CertificadoDetailEntity } from './multisiteSampling';
import type { VinculoEntity } from './vinculoDomain';
import { assertZeroUuidExposure } from './zeroUuid';

const SAMPLE_CONGLOMERADOS: ConglomeradoEntity[] = [
  {
    id: '10000001-0000-0000-0000-000000000001',
    codigo_grupo: 'CONG-01',
    nombre: 'Grupo Industrial Norte',
    abreviacion: 'Industrial Norte',
    es_individual_auto: false,
    notas: null,
  },
  {
    id: '10000001-0000-0000-0000-000000000002',
    codigo_grupo: 'CONG-02',
    nombre: 'Holding Energético Sur',
    abreviacion: 'Energético Sur',
    es_individual_auto: false,
    notas: null,
  },
  {
    id: '10000001-0000-0000-0000-000000000003',
    codigo_grupo: 'CONG-03',
    nombre: 'Empresa Sin Vínculo C.A.',
    es_individual_auto: true,
    notas: null,
  },
];

const SAMPLE_ORGS: OrganizacionEntity[] = [
  {
    id: '30000000-0000-0000-0000-000000000001',
    id_grupo_empresarial: '10000001-0000-0000-0000-000000000001',
    grupo_empresarial_nombre: 'Grupo Industrial Norte',
    nombre: 'Iberometal Componentes S.A.',
    abreviacion: 'Iberometal',
    rif: 'J-30192837-4',
    direccion_fiscal: 'Zona Industrial',
    estatus: 'Activo',
  },
  {
    id: '30000000-0000-0000-0000-000000000002',
    id_grupo_empresarial: '10000001-0000-0000-0000-000000000002',
    grupo_empresarial_nombre: 'Holding Energético Sur',
    nombre: 'Petroquímica del Centro C.A.',
    abreviacion: 'Petrocentro',
    rif: 'J-30987654-2',
    direccion_fiscal: 'Complejo Sur',
    estatus: 'Activo',
  },
  {
    id: '30000000-0000-0000-0000-000000000003',
    id_grupo_empresarial: '10000001-0000-0000-0000-000000000002',
    grupo_empresarial_nombre: 'Holding Energético Sur',
    nombre: 'Logística Energética Sur S.A.',
    abreviacion: 'Logisur',
    rif: 'J-31112223-9',
    direccion_fiscal: 'Puerto Sur',
    estatus: 'Activo',
  },
  {
    id: '30000000-0000-0000-0000-000000000004',
    id_grupo_empresarial: '10000001-0000-0000-0000-000000000003',
    grupo_empresarial_nombre: 'Empresa Sin Vínculo C.A.',
    nombre: 'Empresa Sin Vínculo C.A.',
    rif: 'J-40001111-1',
    direccion_fiscal: 'Centro',
    estatus: 'Activo',
  },
];

const SAMPLE_CERTS = [
  {
    id: '40000000-0000-0000-0000-000000000001',
    id_organizacion: '30000000-0000-0000-0000-000000000001',
  },
  {
    id: '40000000-0000-0000-0000-000000000002',
    id_organizacion: '30000000-0000-0000-0000-000000000001',
  },
  {
    id: '40000000-0000-0000-0000-000000000003',
    id_organizacion: '30000000-0000-0000-0000-000000000002',
  },
  {
    id: '40000000-0000-0000-0000-000000000004',
    id_organizacion: '30000000-0000-0000-0000-000000000003',
  },
];

const SAMPLE_VINCULOS: VinculoEntity[] = [
  {
    id: '50000001-0000-0000-0000-000000000001',
    id_grupo_empresarial: '10000001-0000-0000-0000-000000000001',
    grupo_nombre: 'Grupo Industrial Norte',
    codigo_vinculo: 'VIN-IND-01',
    etiqueta: 'Vínculo Integrado Iberometal',
    nivel_vinculacion: 'NIVEL_1_INTRA_ORG',
    tipo_vinculacion: 'Integrada',
    es_vinculada: true,
    tiene_sitio_temporal: false,
    notas: null,
    certificados: [
      {
        id: '60000001-0000-0000-0000-000000000001',
        id_vinculo: '50000001-0000-0000-0000-000000000001',
        id_certificado: '40000000-0000-0000-0000-000000000001',
        numero_certificado: 'FN-QMS-2024-001',
        id_organizacion: '30000000-0000-0000-0000-000000000001',
        organizacion_nombre: 'Iberometal Componentes S.A.',
        norma_codigo: 'ISO 9001:2015',
        estatus: 'ACTIVO',
      },
      {
        id: '60000001-0000-0000-0000-000000000002',
        id_vinculo: '50000001-0000-0000-0000-000000000001',
        id_certificado: '40000000-0000-0000-0000-000000000002',
        numero_certificado: 'FN-EMS-2024-002',
        id_organizacion: '30000000-0000-0000-0000-000000000001',
        organizacion_nombre: 'Iberometal Componentes S.A.',
        norma_codigo: 'ISO 14001:2015',
        estatus: 'ACTIVO',
      },
    ],
  },
  {
    id: '50000002-0000-0000-0000-000000000002',
    id_grupo_empresarial: '10000001-0000-0000-0000-000000000002',
    grupo_nombre: 'Holding Energético Sur',
    codigo_vinculo: 'VIN-SUR-A',
    etiqueta: 'Vínculo A · Petroquímica',
    nivel_vinculacion: 'INDIVIDUAL',
    tipo_vinculacion: 'Individual',
    es_vinculada: false,
    tiene_sitio_temporal: false,
    notas: null,
    certificados: [
      {
        id: '60000001-0000-0000-0000-000000000003',
        id_vinculo: '50000002-0000-0000-0000-000000000002',
        id_certificado: '40000000-0000-0000-0000-000000000003',
        numero_certificado: 'FN-OHS-2023-018',
        id_organizacion: '30000000-0000-0000-0000-000000000002',
        organizacion_nombre: 'Petroquímica del Centro C.A.',
        norma_codigo: 'ISO 45001:2018',
        estatus: 'ACTIVO',
      },
    ],
  },
  {
    id: '50000003-0000-0000-0000-000000000003',
    id_grupo_empresarial: '10000001-0000-0000-0000-000000000002',
    grupo_nombre: 'Holding Energético Sur',
    codigo_vinculo: 'VIN-SUR-B',
    etiqueta: 'Vínculo B · Logística',
    nivel_vinculacion: 'INDIVIDUAL',
    tipo_vinculacion: 'Individual',
    es_vinculada: false,
    tiene_sitio_temporal: false,
    notas: null,
    certificados: [
      {
        id: '60000001-0000-0000-0000-000000000004',
        id_vinculo: '50000003-0000-0000-0000-000000000003',
        id_certificado: '40000000-0000-0000-0000-000000000004',
        numero_certificado: 'FN-QMS-2025-099',
        id_organizacion: '30000000-0000-0000-0000-000000000003',
        organizacion_nombre: 'Logística Energética Sur S.A.',
        norma_codigo: 'ISO 9001:2015',
        estatus: 'ACTIVO',
      },
    ],
  },
];

const TIPO_VIG1_ID = '70000001-0000-0000-0000-000000000001';
const TIPO_RENOV_ID = '70000001-0000-0000-0000-000000000002';

const SAMPLE_TIPOS: TipoAuditoriaCatalogItem[] = [
  {
    id: TIPO_VIG1_ID,
    tipo: 'Seguimiento 1',
    abreviacion: 'Seg.1',
    etapa_ciclo: 'Vigilancia',
    descripcion: 'Primera vigilancia anual',
    duracion_formula: 'Base × 0.33',
    reporte_requerido: 'Informe de Vigilancia',
    usage_count: 1,
  },
  {
    id: TIPO_RENOV_ID,
    tipo: 'Renovación',
    abreviacion: 'Renov.',
    etapa_ciclo: 'Recertificación',
    descripcion: 'Recertificación trienal',
    duracion_formula: 'Base × 0.67',
    reporte_requerido: 'Informe de Renovación',
    usage_count: 1,
  },
];

test('Step 4.1 Wizard Phase 1: bidirectional Conglomerado <-> Organización selection syncs cleanly with nullable IDs', () => {
  const init = createInitialAuditWizardState({
    referenceDate: new Date('2026-04-15T12:00:00Z'),
  });
  assert.equal(init.step, 1);
  assert.equal(init.selectedConglomeradoId, null);
  assert.equal(init.selectedOrganizacionId, null);
  assert.equal(init.selectedVinculoId, null);
  assert.equal(init.anio, 2026);
  assert.equal(init.mes, 4);

  // Conglomerado with 1 org auto-selects that org
  const afterSingleCong = selectWizardConglomerado(
    init,
    '10000001-0000-0000-0000-000000000001',
    SAMPLE_ORGS
  );
  assert.equal(afterSingleCong.selectedConglomeradoId, '10000001-0000-0000-0000-000000000001');
  assert.equal(afterSingleCong.selectedOrganizacionId, '30000000-0000-0000-0000-000000000001');

  // Conglomerado with >1 org keeps org null until picked, filtering eligible list
  const afterMultiCong = selectWizardConglomerado(
    init,
    '10000001-0000-0000-0000-000000000002',
    SAMPLE_ORGS
  );
  assert.equal(afterMultiCong.selectedOrganizacionId, null);
  assert.equal(
    getEligibleOrganizationsForWizard(afterMultiCong.selectedConglomeradoId, SAMPLE_ORGS).length,
    2
  );

  // Reverse sync: picking an organization from scratch resolves its Conglomerado automatically
  const afterOrgPick = selectWizardOrganizacion(
    init,
    '30000000-0000-0000-0000-000000000003',
    SAMPLE_ORGS
  );
  assert.equal(afterOrgPick.selectedOrganizacionId, '30000000-0000-0000-0000-000000000003');
  assert.equal(afterOrgPick.selectedConglomeradoId, '10000001-0000-0000-0000-000000000002');

  // Empty selection cannot advance from Step 1
  const blockedStep1 = canAdvanceWizardStep(init, {
    conglomerados: SAMPLE_CONGLOMERADOS,
    organizaciones: SAMPLE_ORGS,
    vinculos: SAMPLE_VINCULOS,
    certificados: SAMPLE_CERTS,
  });
  assert.equal(blockedStep1.allowed, false);
  assert.equal(assertZeroUuidExposure(blockedStep1.reason || '').compliant, true);
});

test('Step 4.1 Wizard Phase 2: handles 0, 1, and >1 vínculos with default ON toggles, subset toggling, and Zero-UUID errors', () => {
  const deps = {
    conglomerados: SAMPLE_CONGLOMERADOS,
    organizaciones: SAMPLE_ORGS,
    vinculos: SAMPLE_VINCULOS,
    certificados: SAMPLE_CERTS,
    tiposCatalog: SAMPLE_TIPOS,
  };

  // Case A: 0 vínculos -> blocks advancing to Step 3 with guided message
  let stateNoVinculo = createInitialAuditWizardState();
  stateNoVinculo = selectWizardConglomerado(
    stateNoVinculo,
    '10000001-0000-0000-0000-000000000003',
    SAMPLE_ORGS
  );
  assert.equal(
    resolveEligibleVinculosForConglomerado(
      stateNoVinculo.selectedConglomeradoId,
      SAMPLE_VINCULOS,
      SAMPLE_CERTS,
      SAMPLE_ORGS
    ).length,
    0
  );
  stateNoVinculo = advanceWizardStep(stateNoVinculo, deps);
  assert.equal(stateNoVinculo.step, 2);
  const blockedCheck = canAdvanceWizardStep(stateNoVinculo, deps);
  assert.equal(blockedCheck.allowed, false);
  assert.equal(blockedCheck.reason, WIZARD_NO_VINCULO_GUIDANCE_MESSAGE);
  assert.equal(assertZeroUuidExposure(blockedCheck.reason || '').compliant, true);

  // Case B: 1 vínculo -> auto-selects on Step 1 -> Step 2 with all members ON by default
  let stateOneVinculo = createInitialAuditWizardState({ referenceDate: new Date('2026-04-15T12:00:00Z') });
  stateOneVinculo = selectWizardConglomerado(
    stateOneVinculo,
    '10000001-0000-0000-0000-000000000001',
    SAMPLE_ORGS
  );
  stateOneVinculo = advanceWizardStep(stateOneVinculo, deps);
  assert.equal(stateOneVinculo.step, 2);
  assert.equal(stateOneVinculo.selectedVinculoId, '50000001-0000-0000-0000-000000000001');
  assert.equal(stateOneVinculo.vinculoMembers.length, 2);
  assert.equal(stateOneVinculo.vinculoMembers.every((m) => m.enabled), true);
  assert.equal(stateOneVinculo.certTypes.length, 2);

  // Case C: >1 vínculos -> stays unselected until user picks
  let stateMultiVinculo = createInitialAuditWizardState();
  stateMultiVinculo = selectWizardConglomerado(
    stateMultiVinculo,
    '10000001-0000-0000-0000-000000000002',
    SAMPLE_ORGS
  );
  stateMultiVinculo = advanceWizardStep(stateMultiVinculo, deps);
  assert.equal(stateMultiVinculo.step, 2);
  assert.equal(stateMultiVinculo.selectedVinculoId, null);
  assert.equal(canAdvanceWizardStep(stateMultiVinculo, deps).allowed, false);

  stateMultiVinculo = selectWizardVinculo(
    stateMultiVinculo,
    '50000002-0000-0000-0000-000000000002',
    SAMPLE_VINCULOS,
    SAMPLE_TIPOS
  );
  assert.equal(canAdvanceWizardStep(stateMultiVinculo, deps).allowed, true);
});

test('Step 4.1 Wizard Phase 2 & 3: toggles preserve list rows, allow partial/single subsets, and enforce Alcance ONLY on enabled certs', () => {
  const CERT_A = '41000000-0000-4000-8000-000000000001';
  const CERT_B = '41000000-0000-4000-8000-000000000002';
  const CERT_C = '41000000-0000-4000-8000-000000000003';
  const CERT_D = '41000000-0000-4000-8000-000000000004';
  const BOX_MULTI_ID = '51000000-0000-4000-8000-000000000001';

  const multiOrgVinculo: VinculoEntity = {
    id: BOX_MULTI_ID,
    id_grupo_empresarial: '10000001-0000-0000-0000-000000000002',
    grupo_nombre: 'Holding Energético Sur',
    codigo_vinculo: 'VIN-SUR-4',
    etiqueta: 'Caja Holding Sur Completa',
    nivel_vinculacion: 'NIVEL_2_INTER_ORG',
    tipo_vinculacion: 'Integrada',
    es_vinculada: true,
    tiene_sitio_temporal: false,
    notas: null,
    certificados: [
      {
        id: '61000000-0000-4000-8000-000000000001',
        id_vinculo: BOX_MULTI_ID,
        id_certificado: CERT_A,
        numero_certificado: 'FN-QMS-2026-101',
        norma_codigo: 'ISO 9001:2015',
        id_organizacion: '30000000-0000-0000-0000-000000000002',
        organizacion_nombre: 'Petroquímica del Centro C.A.',
        organizacion_abreviacion: 'Petrocentro',
        tipo_vinculacion_override: 'Combinada',
        estatus: 'Activo',
      },
      {
        id: '61000000-0000-4000-8000-000000000002',
        id_vinculo: BOX_MULTI_ID,
        id_certificado: CERT_B,
        numero_certificado: 'FN-EMS-2026-102',
        norma_codigo: 'ISO 14001:2015',
        id_organizacion: '30000000-0000-0000-0000-000000000002',
        organizacion_nombre: 'Petroquímica del Centro C.A.',
        organizacion_abreviacion: 'Petrocentro',
        tipo_vinculacion_override: null,
        estatus: 'Activo',
      },
      {
        id: '61000000-0000-4000-8000-000000000003',
        id_vinculo: BOX_MULTI_ID,
        id_certificado: CERT_C,
        numero_certificado: 'FN-OHS-2026-103',
        norma_codigo: 'ISO 45001:2018',
        id_organizacion: '30000000-0000-0000-0000-000000000003',
        organizacion_nombre: 'Logística Energética Sur S.A.',
        organizacion_abreviacion: 'Logisur',
        tipo_vinculacion_override: 'Simultánea',
        estatus: 'Activo',
      },
      {
        id: '61000000-0000-4000-8000-000000000004',
        id_vinculo: BOX_MULTI_ID,
        id_certificado: CERT_D,
        numero_certificado: 'FN-ISMS-2026-104',
        norma_codigo: 'ISO 27001:2022',
        id_organizacion: '30000000-0000-0000-0000-000000000003',
        organizacion_nombre: 'Logística Energética Sur S.A.',
        organizacion_abreviacion: 'Logisur',
        tipo_vinculacion_override: null,
        estatus: 'Activo',
      },
    ],
  };

  // CERT_D has NO active Alcance
  const certsWithOneMissingScope = [
    {
      id: CERT_A,
      id_organizacion: '30000000-0000-0000-0000-000000000002',
      numero_certificado: 'FN-QMS-2026-101',
      hasAlcance: true,
    },
    {
      id: CERT_B,
      id_organizacion: '30000000-0000-0000-0000-000000000002',
      numero_certificado: 'FN-EMS-2026-102',
      hasAlcance: true,
    },
    {
      id: CERT_C,
      id_organizacion: '30000000-0000-0000-0000-000000000003',
      numero_certificado: 'FN-OHS-2026-103',
      hasAlcance: true,
    },
    {
      id: CERT_D,
      id_organizacion: '30000000-0000-0000-0000-000000000003',
      numero_certificado: 'FN-ISMS-2026-104',
      hasAlcance: false,
    },
  ];

  const deps = {
    conglomerados: SAMPLE_CONGLOMERADOS,
    organizaciones: SAMPLE_ORGS,
    vinculos: [multiOrgVinculo],
    certificados: certsWithOneMissingScope,
    tiposCatalog: SAMPLE_TIPOS,
  };

  let state = createInitialAuditWizardState({
    referenceDate: new Date('2026-11-10T12:00:00Z'),
  });
  state = selectWizardConglomerado(
    state,
    '10000001-0000-0000-0000-000000000002',
    SAMPLE_ORGS
  );
  state = advanceWizardStep(state, deps);
  assert.equal(state.step, 2);
  assert.equal(state.vinculoMembers.length, 4);
  assert.equal(state.vinculoMembers.every((m) => m.enabled), true);

  // Verify baseNaturaleza prefill respects Bloque 2 override vs box default
  assert.equal(state.vinculoMembers[0].baseNaturaleza, 'Combinada');
  assert.equal(state.vinculoMembers[1].baseNaturaleza, 'Integrada');
  assert.equal(state.vinculoMembers[2].baseNaturaleza, 'Simultánea');
  assert.equal(state.vinculoMembers[3].hasActiveAlcance, false);

  // While CERT_D (missing scope) is ON, Phase 2 -> Phase 3 MUST block with Zero-UUID Spanish error
  const blockedGate = canAdvanceWizardStep(state, deps);
  assert.equal(blockedGate.allowed, false);
  assert.match(blockedGate.reason || '', /FN-ISMS-2026-104/);
  assert.equal(assertZeroUuidExposure(blockedGate.reason || '').compliant, true);

  // Toggle CERT_D OFF: keeps visual row in vinculoMembers, unblocks Phase 2 -> Phase 3!
  state = toggleWizardVinculoCert(state, CERT_D);
  assert.equal(state.vinculoMembers.length, 4);
  assert.equal(state.vinculoMembers.find((m) => m.id_certificado === CERT_D)?.enabled, false);
  assert.equal(Object.keys(state.certEntries).length, 3);
  assert.equal(canAdvanceWizardStep(state, deps).allowed, true);

  // Turning ALL OFF blocks advancing to Phase 3
  const allOff = setAllWizardVinculoCerts(state, false);
  assert.equal(allOff.vinculoMembers.length, 4);
  assert.equal(allOff.vinculoMembers.every((m) => !m.enabled), true);
  assert.equal(Object.keys(allOff.certEntries).length, 0);
  const zeroEnabledCheck = canAdvanceWizardStep(allOff, deps);
  assert.equal(zeroEnabledCheck.allowed, false);
  assert.match(zeroEnabledCheck.reason || '', /al menos un certificado/i);

  // Restore all ON, then leave only CERT_A & CERT_B (same org, subset 2 of 4)
  let subsetSameOrg = setAllWizardVinculoCerts(allOff, true);
  subsetSameOrg = toggleWizardVinculoCert(subsetSameOrg, CERT_C);
  subsetSameOrg = toggleWizardVinculoCert(subsetSameOrg, CERT_D);
  assert.equal(canAdvanceWizardStep(subsetSameOrg, deps).allowed, true);

  // Advance to Step 3: MUST preserve toggles (only CERT_A & CERT_B active!)
  let step3SameOrg = advanceWizardStep(subsetSameOrg, deps);
  assert.equal(step3SameOrg.step, 3);
  assert.equal(step3SameOrg.vinculoMembers.length, 4);
  assert.equal(step3SameOrg.certTypes.length, 2);
  assert.equal(step3SameOrg.certEntries[CERT_A].tipo_vinculacion, 'Combinada');
  assert.equal(step3SameOrg.certEntries[CERT_B].tipo_vinculacion, 'Integrada');

  // Independent Col 1 & Col 2 editing in Phase 3 -> heterogeneous -> program nature = 'Mixta'
  step3SameOrg = setWizardCertTipo(step3SameOrg, CERT_B, TIPO_RENOV_ID);
  const mixedSameOrgDraft = buildStep3NewCycleDraftFromWizard(
    { ...step3SameOrg, etiqueta: '' },
    [multiOrgVinculo],
    certsWithOneMissingScope,
    { conglomerados: SAMPLE_CONGLOMERADOS, tiposCatalog: SAMPLE_TIPOS }
  );
  assert.equal(mixedSameOrgDraft.ok, true);
  if (mixedSameOrgDraft.ok) {
    assert.equal(mixedSameOrgDraft.draft.enabledCertCount, 2);
    assert.equal(mixedSameOrgDraft.draft.nivel_vinculacion, 'NIVEL_1_INTRA_ORG');
    assert.equal(mixedSameOrgDraft.draft.tipo_vinculacion, 'Mixta');
    assert.equal(mixedSameOrgDraft.draft.certTypes[0].tipo_vinculacion, 'Combinada');
    assert.equal(mixedSameOrgDraft.draft.certTypes[1].tipo_vinculacion, 'Integrada');
    assert.equal(mixedSameOrgDraft.draft.certTypes[1].id_tipo_auditoria, TIPO_RENOV_ID);
    assert.equal(mixedSameOrgDraft.draft.etiqueta.includes('Energético Sur'), true);
    assert.equal(mixedSameOrgDraft.draft.etiqueta.includes('2026-11 Seg.1'), true);
    assert.equal(assertZeroUuidExposure(mixedSameOrgDraft.draft.etiqueta).compliant, true);
  }

  // Applying same Col 1 Relación across enabled certs yields homogeneous program nature
  const uniformSameOrg = applySameRelacionToAllWizardCerts(step3SameOrg, 'Conjunta');
  const uniformDraft = buildStep3NewCycleDraftFromWizard(
    uniformSameOrg,
    [multiOrgVinculo],
    certsWithOneMissingScope
  );
  assert.equal(uniformDraft.ok, true);
  if (uniformDraft.ok) {
    assert.equal(uniformDraft.draft.tipo_vinculacion, 'Conjunta');
    assert.equal(uniformDraft.draft.certTypes.every((c) => c.tipo_vinculacion === 'Conjunta'), true);
  }

  // Multi-org subset (CERT_A from Petrocentro + CERT_C from Logisur) -> NIVEL_2_INTER_ORG
  let multiOrgSubsetState = toggleWizardVinculoCert(state, CERT_B); // leaves A & C enabled
  multiOrgSubsetState = advanceWizardStep(multiOrgSubsetState, deps);
  assert.equal(multiOrgSubsetState.step, 3);
  const interOrgDraft = buildStep3NewCycleDraftFromWizard(
    multiOrgSubsetState,
    [multiOrgVinculo],
    certsWithOneMissingScope
  );
  assert.equal(interOrgDraft.ok, true);
  if (interOrgDraft.ok) {
    assert.equal(interOrgDraft.draft.enabledCertCount, 2);
    assert.equal(interOrgDraft.draft.nivel_vinculacion, 'NIVEL_2_INTER_ORG');
    assert.equal(interOrgDraft.draft.tipo_vinculacion, 'Mixta');
  }

  // Single-cert subset (only CERT_A ON) -> derives INDIVIDUAL even from multi-cert Vínculo box!
  let singleCertState = toggleWizardVinculoCert(multiOrgSubsetState, CERT_C);
  singleCertState = setWizardCertRelacion(singleCertState, CERT_A, 'Individual');
  const singleCertDraft = buildStep3NewCycleDraftFromWizard(
    singleCertState,
    [multiOrgVinculo],
    certsWithOneMissingScope
  );
  assert.equal(singleCertDraft.ok, true);
  if (singleCertDraft.ok) {
    assert.equal(singleCertDraft.draft.enabledCertCount, 1);
    assert.equal(singleCertDraft.draft.nivel_vinculacion, 'INDIVIDUAL');
    assert.equal(singleCertDraft.draft.tipo_vinculacion, 'Individual');
    assert.equal(singleCertDraft.draft.certTypes.length, 1);
  }
});

test('Step 4.1 Wizard: Phase 3 per-cert type & relación customization, Copiar a todos, Back step, and Step3NewCycleDraft build', () => {
  const deps = {
    conglomerados: SAMPLE_CONGLOMERADOS,
    organizaciones: SAMPLE_ORGS,
    vinculos: SAMPLE_VINCULOS,
    certificados: SAMPLE_CERTS,
    tiposCatalog: SAMPLE_TIPOS,
  };

  let state = createInitialAuditWizardState({ referenceDate: new Date('2026-06-01T12:00:00Z') });
  state = selectWizardOrganizacion(state, '30000000-0000-0000-0000-000000000001', SAMPLE_ORGS);
  state = advanceWizardStep(state, deps); // Step 2 (auto-selected vínculo)
  state = advanceWizardStep(state, deps); // Step 3
  assert.equal(state.step, 3);
  assert.equal(state.certTypes.length, 2);

  // Per-cert customization + Copiar a todos
  state = setWizardCertTipo(state, '40000000-0000-0000-0000-000000000001', TIPO_RENOV_ID);
  assert.equal(state.certTypes[0].id_tipo_auditoria, TIPO_RENOV_ID);
  assert.equal(state.certTypes[1].id_tipo_auditoria, TIPO_VIG1_ID);

  state = applySameTipoToAllWizardCerts(state, TIPO_RENOV_ID);
  assert.equal(state.certTypes.every((c) => c.id_tipo_auditoria === TIPO_RENOV_ID), true);

  // Go back & forward preserves selections & toggles
  const back2 = goBackWizardStep(state);
  assert.equal(back2.step, 2);
  const reForward3 = advanceWizardStep(back2, deps);
  assert.equal(reForward3.step, 3);
  assert.equal(reForward3.certTypes.every((c) => c.id_tipo_auditoria === TIPO_RENOV_ID), true);
  const back1 = goBackWizardStep(back2);
  assert.equal(back1.step, 1);

  const draftRes = buildStep3NewCycleDraftFromWizard(
    {
      ...state,
      codigo_programa: 'PROG-2026-NORTE',
    },
    SAMPLE_VINCULOS
  );
  assert.equal(draftRes.ok, true);
  if (draftRes.ok) {
    assert.equal(draftRes.draft.id_vinculo, '50000001-0000-0000-0000-000000000001');
    assert.equal(draftRes.draft.certTypes.length, 2);
    assert.equal(draftRes.draft.enabledCertCount, 2);
    assert.equal(draftRes.draft.dateMode, 'PREPROGRAMADA_MES');
    assert.equal(draftRes.draft.anio, 2026);
    assert.equal(draftRes.draft.mes, 6);
    assert.equal(draftRes.draft.nivel_vinculacion, 'NIVEL_1_INTRA_ORG');
    assert.equal(draftRes.draft.tipo_vinculacion, 'Integrada');
  }
});

test('Step 2.1 Render: stepper badges omit duplicate numbering across steps 1, 2, 3 and render single goal programmed date input', () => {
  const modalTipos: TipoAuditoriaCatalogItem[] = [
    {
      id: TIPO_VIG1_ID,
      tipo: 'Seguimiento 1',
      etapa_ciclo: 'Vigilancia',
      descripcion: 'Primera vigilancia anual',
      duracion_formula: 'Base × 0.33',
      reporte_requerido: 'Informe de Vigilancia',
      usage_count: 1,
    },
    {
      id: TIPO_RENOV_ID,
      tipo: 'Renovación',
      etapa_ciclo: 'Recertificación',
      descripcion: 'Recertificación trienal',
      duracion_formula: 'Base × 0.67',
      reporte_requerido: 'Informe de Renovación',
      usage_count: 1,
    },
  ];
  const modalCerts: CertificadoDetailEntity[] = [];
  const deps = {
    conglomerados: SAMPLE_CONGLOMERADOS,
    organizaciones: SAMPLE_ORGS,
    vinculos: SAMPLE_VINCULOS,
    certificados: SAMPLE_CERTS,
    tiposCatalog: modalTipos,
  };

  const normalizeText = (html: string): string =>
    html
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  // Step 1
  const step1State = createInitialAuditWizardState({
    referenceDate: new Date('2026-07-10T12:00:00Z'),
  });
  assert.equal(step1State.fecha_programada, '2026-07-10');

  const htmlStep1 = renderAuditWizardModal({
    state: step1State,
    conglomerados: SAMPLE_CONGLOMERADOS,
    organizaciones: SAMPLE_ORGS,
    vinculos: SAMPLE_VINCULOS,
    certificados: modalCerts,
    tiposCatalog: modalTipos,
  });
  const textStep1 = normalizeText(htmlStep1);
  assert.equal(/\b1\s+1\./.test(textStep1), false);
  assert.equal(/\b2\s+2\./.test(textStep1), false);
  assert.equal(/\b3\s+3\./.test(textStep1), false);
  assert.equal(textStep1.includes('1. Empresa / Conglomerado'), true);
  assert.equal(textStep1.includes('2. Vínculo y Certificados'), true);
  assert.equal(textStep1.includes('3. Fecha, Relación y Tipo'), true);
  assert.equal(assertZeroUuidExposure(textStep1).compliant, true);

  // Step 2
  let step2State = selectWizardConglomerado(
    step1State,
    '10000001-0000-0000-0000-000000000001',
    SAMPLE_ORGS
  );
  step2State = advanceWizardStep(step2State, deps);
  assert.equal(step2State.step, 2);

  const htmlStep2 = renderAuditWizardModal({
    state: step2State,
    conglomerados: SAMPLE_CONGLOMERADOS,
    organizaciones: SAMPLE_ORGS,
    vinculos: SAMPLE_VINCULOS,
    certificados: modalCerts,
    tiposCatalog: modalTipos,
  });
  const textStep2 = normalizeText(htmlStep2);
  assert.equal(/\b[123]\s+[123]\./.test(textStep2), false);
  assert.equal(textStep2.includes('✓ Empresa / Conglomerado'), true);
  assert.equal(textStep2.includes('2. Vínculo y Certificados'), true);
  assert.equal(textStep2.includes('3. Fecha, Relación y Tipo'), true);
  assert.equal(assertZeroUuidExposure(textStep2).compliant, true);

  // Step 3 with PROGRAMADA_EXACTA
  let step3State = advanceWizardStep(step2State, deps);
  assert.equal(step3State.step, 3);
  step3State = {
    ...step3State,
    dateMode: 'PROGRAMADA_EXACTA',
    fecha_programada: '2026-09-18',
    etiqueta: 'Campaña Objetivo Septiembre',
  };

  const htmlStep3 = renderAuditWizardModal({
    state: step3State,
    conglomerados: SAMPLE_CONGLOMERADOS,
    organizaciones: SAMPLE_ORGS,
    vinculos: SAMPLE_VINCULOS,
    certificados: modalCerts,
    tiposCatalog: modalTipos,
  });
  const textStep3 = normalizeText(htmlStep3);
  assert.equal(/\b[123]\s+[123]\./.test(textStep3), false);
  assert.equal(textStep3.includes('✓ Empresa / Conglomerado'), true);
  assert.equal(textStep3.includes('✓ Vínculo y Certificados'), true);
  assert.equal(textStep3.includes('3. Fecha, Relación y Tipo'), true);
  assert.equal(htmlStep3.includes('id="wizardFechaProgramadaInput"'), true);
  assert.equal(htmlStep3.includes('value="2026-09-18"'), true);
  assert.equal(htmlStep3.includes('wizardFechaInicioInput'), false);
  assert.equal(htmlStep3.includes('wizardFechaFinInput'), false);
  assert.equal(textStep3.includes('Fecha Objetivo Programada (YYYY-MM-DD)'), true);
  assert.equal(assertZeroUuidExposure(textStep3).compliant, true);

  // Resulting draft maps single goal date cleanly to fecha_inicio === fecha_fin === fecha_programada
  const draftRes = buildStep3NewCycleDraftFromWizard(step3State, SAMPLE_VINCULOS);
  assert.equal(draftRes.ok, true);
  if (draftRes.ok) {
    assert.equal(draftRes.draft.dateMode, 'PROGRAMADA_EXACTA');
    assert.equal(draftRes.draft.fecha_programada, '2026-09-18');
    assert.equal(draftRes.draft.fecha_inicio, '2026-09-18');
    assert.equal(draftRes.draft.fecha_fin, '2026-09-18');
  }

  // validateStep3NewCycleDraft accepts single fecha_programada even with empty fecha_inicio/fecha_fin
  assert.equal(
    validateStep3NewCycleDraft(
      {
        id_vinculo: '50000001-0000-0000-0000-000000000001',
        codigo_programa: 'PROG-2026-09',
        etiqueta: 'Objetivo Único',
        dateMode: 'PROGRAMADA_EXACTA',
        anio: 2026,
        mes: 9,
        fecha_inicio: '',
        fecha_fin: '',
        fecha_programada: '2026-09-18',
        observacion: 'Objetivo inicial.',
        certTypes: step3State.certTypes,
      },
      SAMPLE_VINCULOS
    ),
    null
  );
});

test('Step 2.3 & 4.1: Audit Wizard and validateStep3NewCycleDraft block ONLY enabled certificates lacking active Alcance', () => {
  const certsMissingOneScope = [
    {
      id: '40000000-0000-0000-0000-000000000001',
      id_organizacion: '30000000-0000-0000-0000-000000000001',
      numero_certificado: 'FN-QMS-2024-001',
      alcanceDetalle: {
        id: '90000000-0000-0000-0000-000000000001',
        id_certificado: '40000000-0000-0000-0000-000000000001',
        alcance_es: 'Fabricación metalmecánica.',
        alcance_en: null,
        esCompartido: false,
        deleted_at: null,
      },
    },
    {
      id: '40000000-0000-0000-0000-000000000002',
      id_organizacion: '30000000-0000-0000-0000-000000000001',
      numero_certificado: 'FN-EMS-2024-002',
      alcanceDetalle: null,
    },
  ];

  const depsBlocked = {
    conglomerados: SAMPLE_CONGLOMERADOS,
    organizaciones: SAMPLE_ORGS,
    vinculos: SAMPLE_VINCULOS,
    certificados: certsMissingOneScope,
    tiposCatalog: SAMPLE_TIPOS,
  };

  let state = createInitialAuditWizardState({
    referenceDate: new Date('2026-06-01T12:00:00Z'),
  });
  state = selectWizardConglomerado(
    state,
    '10000001-0000-0000-0000-000000000001',
    SAMPLE_ORGS
  );
  state = advanceWizardStep(state, depsBlocked); // Step 2 (auto-selected vínculo)
  assert.equal(state.step, 2);

  const step2Gate = canAdvanceWizardStep(state, depsBlocked);
  assert.equal(step2Gate.allowed, false);
  assert.match(step2Gate.reason || '', /FN-EMS-2024-002/);
  assert.match(step2Gate.reason || '', /no posee un Alcance activo/i);
  assert.equal(assertZeroUuidExposure(step2Gate.reason || '').compliant, true);

  // Attempting advance stays on Step 2 with visible guidance
  const stayedStep2 = advanceWizardStep(state, depsBlocked);
  assert.equal(stayedStep2.step, 2);
  assert.match(stayedStep2.errorMessage || '', /FN-EMS-2024-002/);

  // Direct Step 3 draft builder & validator enforce active Alcance when scopeless cert is enabled
  const blockedBuild = buildStep3NewCycleDraftFromWizard(
    {
      ...state,
      codigo_programa: 'PROG-BLOCKED-SCOPE',
    },
    SAMPLE_VINCULOS,
    certsMissingOneScope
  );
  assert.equal(blockedBuild.ok, false);
  if (!blockedBuild.ok) {
    assert.match(blockedBuild.error, /FN-EMS-2024-002/);
    assert.equal(assertZeroUuidExposure(blockedBuild.error).compliant, true);
  }

  // Toggling OFF the scopeless cert unblocks Step 2 -> Step 3 and produces a valid INDIVIDUAL draft
  const toggledOffScopeless = toggleWizardVinculoCert(
    state,
    '40000000-0000-0000-0000-000000000002'
  );
  assert.equal(canAdvanceWizardStep(toggledOffScopeless, depsBlocked).allowed, true);
  const unblockedBuild = buildStep3NewCycleDraftFromWizard(
    {
      ...toggledOffScopeless,
      codigo_programa: 'PROG-SUBSET-SCOPE',
    },
    SAMPLE_VINCULOS,
    certsMissingOneScope
  );
  assert.equal(unblockedBuild.ok, true);
  if (unblockedBuild.ok) {
    assert.equal(unblockedBuild.draft.certTypes.length, 1);
    assert.equal(unblockedBuild.draft.nivel_vinculacion, 'INDIVIDUAL');
  }

  // When both certs have scope, both enabled works as expected
  const certsBothWithScope = [
    certsMissingOneScope[0],
    {
      ...certsMissingOneScope[1],
      alcanceDetalle: {
        id: '90000000-0000-0000-0000-000000000002',
        id_certificado: '40000000-0000-0000-0000-000000000002',
        alcance_es: 'Gestión ambiental integral.',
        alcance_en: 'Environmental management.',
        esCompartido: true,
        deleted_at: null,
      },
    },
  ];
  const depsAllowed = {
    ...depsBlocked,
    certificados: certsBothWithScope,
  };
  assert.equal(canAdvanceWizardStep(state, depsAllowed).allowed, true);
  const step3 = advanceWizardStep(state, depsAllowed);
  assert.equal(step3.step, 3);

  const okBuild = buildStep3NewCycleDraftFromWizard(
    {
      ...step3,
      codigo_programa: 'PROG-ALLOWED-SCOPE',
    },
    SAMPLE_VINCULOS,
    certsBothWithScope
  );
  assert.equal(okBuild.ok, true);
});
