import test from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceWizardStep,
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
  setWizardCertTipo,
  WIZARD_NO_VINCULO_GUIDANCE_MESSAGE,
} from './auditWizardDomain';
import { validateStep3NewCycleDraft } from './designacionTipoDomain';
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
    codigo: 'CONG-01',
    nombre: 'Grupo Industrial Norte',
    notas: null,
  },
  {
    id: '10000001-0000-0000-0000-000000000002',
    codigo: 'CONG-02',
    nombre: 'Holding Energético Sur',
    notas: null,
  },
  {
    id: '10000001-0000-0000-0000-000000000003',
    codigo: 'CONG-03',
    nombre: 'Empresa Sin Vínculo C.A.',
    notas: null,
  },
];

const SAMPLE_ORGS: OrganizacionEntity[] = [
  {
    id: '30000000-0000-0000-0000-000000000001',
    id_grupo_empresarial: '10000001-0000-0000-0000-000000000001',
    grupo_empresarial_nombre: 'Grupo Industrial Norte',
    grupo_empresarial_es_individual: false,
    nombre: 'Iberometal Componentes S.A.',
    nif_cuit: 'J-30192837-4',
    direccion_fiscal: 'Zona Industrial',
    pais_operacion: 'Venezuela',
    estatus: 'Activo',
  },
  {
    id: '30000000-0000-0000-0000-000000000002',
    id_grupo_empresarial: '10000001-0000-0000-0000-000000000002',
    grupo_empresarial_nombre: 'Holding Energético Sur',
    grupo_empresarial_es_individual: false,
    nombre: 'Petroquímica del Centro C.A.',
    nif_cuit: 'J-30987654-2',
    direccion_fiscal: 'Complejo Sur',
    pais_operacion: 'Venezuela',
    estatus: 'Activo',
  },
  {
    id: '30000000-0000-0000-0000-000000000003',
    id_grupo_empresarial: '10000001-0000-0000-0000-000000000002',
    grupo_empresarial_nombre: 'Holding Energético Sur',
    grupo_empresarial_es_individual: false,
    nombre: 'Logística Energética Sur S.A.',
    nif_cuit: 'J-31112223-9',
    direccion_fiscal: 'Puerto Sur',
    pais_operacion: 'Venezuela',
    estatus: 'Activo',
  },
  {
    id: '30000000-0000-0000-0000-000000000004',
    id_grupo_empresarial: '10000001-0000-0000-0000-000000000003',
    grupo_empresarial_nombre: 'Empresa Sin Vínculo C.A.',
    grupo_empresarial_es_individual: true,
    nombre: 'Empresa Sin Vínculo C.A.',
    nif_cuit: 'J-40001111-1',
    direccion_fiscal: 'Centro',
    pais_operacion: 'Venezuela',
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
  { id: TIPO_VIG1_ID, nombre: 'Vigilancia 1', codigo_prefijo: 'V1', descripcion: 'Primera vigilancia' },
  { id: TIPO_RENOV_ID, nombre: 'Renovación', codigo_prefijo: 'REN', descripcion: 'Recertificación trienal' },
];

test('Step 2.1 Wizard: bidirectional Conglomerado <-> Organización selection syncs cleanly', () => {
  const init = createInitialAuditWizardState({
    referenceDate: new Date('2026-04-15T12:00:00Z'),
  });
  assert.equal(init.step, 1);
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

  // Conglomerado with >1 org keeps org empty until picked, filtering eligible list
  const afterMultiCong = selectWizardConglomerado(
    init,
    '10000001-0000-0000-0000-000000000002',
    SAMPLE_ORGS
  );
  assert.equal(afterMultiCong.selectedOrganizacionId, '');
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
});

test('Step 2.1 Wizard: handles 0, 1, and >1 vínculos in Phase 2 with guided blockage and Zero-UUID errors', () => {
  const deps = {
    conglomerados: SAMPLE_CONGLOMERADOS,
    organizaciones: SAMPLE_ORGS,
    vinculos: SAMPLE_VINCULOS,
    certificados: SAMPLE_CERTS,
    tiposCatalog: SAMPLE_TIPOS,
  };

  // Case A: 0 vínculos -> enters Step 2 with empty list and blocks advancing to Step 3 with guided message
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

  // Case B: 1 vínculo -> auto-selects on Step 1 -> Step 2
  let stateOneVinculo = createInitialAuditWizardState({ referenceDate: new Date('2026-04-15T12:00:00Z') });
  stateOneVinculo = selectWizardConglomerado(
    stateOneVinculo,
    '10000001-0000-0000-0000-000000000001',
    SAMPLE_ORGS
  );
  stateOneVinculo = advanceWizardStep(stateOneVinculo, deps);
  assert.equal(stateOneVinculo.step, 2);
  assert.equal(stateOneVinculo.selectedVinculoId, '50000001-0000-0000-0000-000000000001');
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
  assert.equal(stateMultiVinculo.selectedVinculoId, '');
  assert.equal(canAdvanceWizardStep(stateMultiVinculo, deps).allowed, false);

  stateMultiVinculo = selectWizardVinculo(
    stateMultiVinculo,
    '50000002-0000-0000-0000-000000000002',
    SAMPLE_VINCULOS,
    SAMPLE_TIPOS
  );
  assert.equal(canAdvanceWizardStep(stateMultiVinculo, deps).allowed, true);
});

test('Step 2.1 Wizard: Phase 3 per-cert type selection, Copiar a todos, Back step, and Step3NewCycleDraft build', () => {
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

  // Go back & forward preserves selections
  const back2 = goBackWizardStep(state);
  assert.equal(back2.step, 2);
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
    assert.equal(draftRes.draft.dateMode, 'PREPROGRAMADA_MES');
    assert.equal(draftRes.draft.anio, 2026);
    assert.equal(draftRes.draft.mes, 6);
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
  assert.equal(textStep1.includes('1 Conglomerado / Org'), true);
  assert.equal(textStep1.includes('2 Vínculo'), true);
  assert.equal(textStep1.includes('3 Tipo por Certificado'), true);
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
  assert.equal(textStep2.includes('✓ Conglomerado / Org'), true);
  assert.equal(textStep2.includes('2 Vínculo'), true);
  assert.equal(textStep2.includes('3 Tipo por Certificado'), true);
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
  assert.equal(textStep3.includes('✓ Conglomerado / Org'), true);
  assert.equal(textStep3.includes('✓ Vínculo'), true);
  assert.equal(textStep3.includes('3 Tipo por Certificado'), true);
  assert.equal(htmlStep3.includes('id="wizardFechaProgramadaInput"'), true);
  assert.equal(htmlStep3.includes('value="2026-09-18"'), true);
  assert.equal(htmlStep3.includes('wizardFechaInicioInput'), false);
  assert.equal(htmlStep3.includes('wizardFechaFinInput'), false);
  assert.equal(textStep3.includes('Fecha Objetivo Programada (YYYY-MM-DD)'), true);
  assert.equal(
    textStep3.includes('Define la fecha objetivo inicial en Designación → Fecha'),
    true
  );
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
