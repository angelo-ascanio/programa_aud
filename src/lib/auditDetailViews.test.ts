import test from 'node:test';
import assert from 'node:assert/strict';
import type { UserProfile } from './healthCheck';
import {
  INITIAL_PROGRAMACION_AUDITS,
  INITIAL_PHASE5_FINDINGS,
  type ProgramacionAuditEntity,
  type ProgramacionViewState,
} from './auditExecution';
import { INITIAL_ORGANIZACIONES } from './activeCertificates';
import { INITIAL_CERTIFICADOS_DETAILED } from './multisiteSampling';
import { INITIAL_AUDITORES_DETAILED } from './competencyMatrix';
import { SAMPLE_CERTIFICATE_RECORDS } from './searchControls';
import {
  INITIAL_METODOLOGIAS_CATALOG,
  INITIAL_TIPOS_AUDITORIA_CATALOG,
} from './extraDomain';
import type { ProgramaAuditoriaEntity } from './auditPlanningEngine';
import { canEditAuditScheduleOrTeam } from './accessControl';
import { assertZeroUuidExposure } from './zeroUuid';
import {
  createProgramStep1Draft,
  renderProgramacionView,
  resolveProgramDetailMode,
  suggestNextProgramCode,
} from '../views/programacionView';

const ADMIN_PROFILE: UserProfile = {
  id: '00000000-0000-0000-0000-000000000001',
  nombre: 'Admin Calidad',
  role: 'ADMIN',
  status: 'APPROVED',
  created_at: '2025-01-01T00:00:00Z',
};

const WORKER_PROFILE: UserProfile = {
  id: '00000000-0000-0000-0000-000000000002',
  nombre: 'Coordinador Técnico',
  role: 'WORKER',
  status: 'APPROVED',
  created_at: '2025-01-01T00:00:00Z',
};

const PENDING_WORKER: UserProfile = {
  id: '00000000-0000-0000-0000-000000000003',
  nombre: 'Técnico Pendiente',
  role: 'WORKER',
  status: 'PENDING',
  created_at: '2025-01-01T00:00:00Z',
};

const AUDITOR_PROFILE: UserProfile = {
  id: INITIAL_AUDITORES_DETAILED[0].id,
  nombre: INITIAL_AUDITORES_DETAILED[0].nombre,
  role: 'AUDITOR',
  status: 'APPROVED',
  created_at: '2025-01-01T00:00:00Z',
};

const CLIENT_PROFILE: UserProfile = {
  id: '00000000-0000-0000-0000-000000000004',
  nombre: 'Cliente Organización A',
  role: 'CLIENT',
  status: 'APPROVED',
  created_at: '2025-01-01T00:00:00Z',
};

function makeBaseProgramState(
  overrides: Partial<ProgramacionViewState> = {}
): ProgramacionViewState {
  return {
    selectedAuditId: null,
    selectedProgramId: null,
    isCreating: false,
    prefillCertId: null,
    activeStep: 1,
    activeChildTab: 'equipo',
    query: '',
    selectedTipo: 'ALL',
    selectedMetodologia: 'ALL',
    selectedEstatus: 'ALL',
    selectedAuditorLider: 'ALL',
    viewMode: 'grid',
    sortColumn: null,
    sortDirection: 'none',
    isPlanningModalOpen: false,
    isEditingAttributes: false,
    isAddingTeamMember: false,
    editErrorMessage: null,
    saveSuccessMessage: null,
    isSidebarOpen: true,
    facetSelections: {},
    ...overrides,
  };
}

function assertCleanZeroUuid(label: string, html: string): void {
  const res = assertZeroUuidExposure(html);
  assert.equal(
    res.compliant,
    true,
    `${label} exposed raw UUID(s): ${res.exposedUuids.join(', ')}`
  );
}

function buildStep321ProgramsFixture(): ProgramaAuditoriaEntity[] {
  const certA1 = INITIAL_CERTIFICADOS_DETAILED[0]; // Org A (Iberometal)
  const certA2 = INITIAL_CERTIFICADOS_DETAILED[1]; // Org A (Iberometal)
  const certB1 = INITIAL_CERTIFICADOS_DETAILED[2]; // Org B (BioPlásticos)

  const baseAudit1 = INITIAL_PROGRAMACION_AUDITS[0];
  const baseAudit2 = INITIAL_PROGRAMACION_AUDITS[1] || baseAudit1;

  const originProgram: ProgramaAuditoriaEntity = {
    id: '10000000-0000-0000-0000-000000000901',
    codigo_programa: 'PROG-2025-010',
    etiqueta: 'Ciclo Inicial Iberometal',
    nivel_vinculacion: 'INDIVIDUAL',
    tipo_vinculacion: 'Individual',
    es_vinculada: false,
    id_ciclo_origen: null,
    notas: 'Programa base previo',
    deleted_at: null,
    auditorias: [
      {
        ...baseAudit1,
        id: '20000000-0000-0000-0000-000000000901',
        id_programa_auditoria: '10000000-0000-0000-0000-000000000901',
        codigo_auditoria: 'AUD-2025-010',
        id_certificado: certA1.id,
        numero_certificado: certA1.numero_certificado,
        id_organizacion: certA1.id_organizacion,
        organizacion_nombre: certA1.organizacion_nombre,
        norma_codigo: certA1.norma_codigo,
      },
    ],
  };

  const nivel1Program: ProgramaAuditoriaEntity = {
    id: '10000000-0000-0000-0000-000000000902',
    codigo_programa: 'PROG-2026-001',
    etiqueta: 'Planta Santa Cruz Integrada',
    nivel_vinculacion: 'NIVEL_1_INTRA_ORG',
    tipo_vinculacion: 'Integrada',
    es_vinculada: true,
    id_ciclo_origen: originProgram.id,
    notas: 'Campaña integrada calidad + ambiente',
    deleted_at: null,
    auditorias: [
      {
        ...baseAudit1,
        id: '20000000-0000-0000-0000-000000000902',
        id_programa_auditoria: '10000000-0000-0000-0000-000000000902',
        codigo_auditoria: 'AUD-2026-QMS-01',
        id_certificado: certA1.id,
        numero_certificado: certA1.numero_certificado,
        id_organizacion: certA1.id_organizacion,
        organizacion_nombre: certA1.organizacion_nombre,
        norma_codigo: certA1.norma_codigo,
        tipo_auditoria: 'Renovación',
        metodologia: 'Presencial',
      },
      {
        ...baseAudit2,
        id: '20000000-0000-0000-0000-000000000903',
        id_programa_auditoria: '10000000-0000-0000-0000-000000000902',
        codigo_auditoria: 'AUD-2026-EMS-02',
        id_certificado: certA2.id,
        numero_certificado: certA2.numero_certificado,
        id_organizacion: certA2.id_organizacion,
        organizacion_nombre: certA2.organizacion_nombre,
        norma_codigo: certA2.norma_codigo,
        tipo_auditoria: 'Seguimiento 1',
        metodologia: 'Mixta',
      },
    ],
  };

  const nivel2AuditOrgA: ProgramacionAuditEntity = {
    ...baseAudit1,
    id: '20000000-0000-0000-0000-000000000904',
    id_programa_auditoria: '10000000-0000-0000-0000-000000000903',
    codigo_auditoria: 'AUD-2026-N2-A',
    id_certificado: certA1.id,
    numero_certificado: certA1.numero_certificado,
    id_organizacion: certA1.id_organizacion,
    organizacion_nombre: certA1.organizacion_nombre,
    norma_codigo: certA1.norma_codigo,
  };

  const nivel2AuditOrgB: ProgramacionAuditEntity = {
    ...baseAudit2,
    id: '20000000-0000-0000-0000-000000000905',
    id_programa_auditoria: '10000000-0000-0000-0000-000000000903',
    codigo_auditoria: 'AUD-2026-N2-B',
    id_certificado: certB1.id,
    numero_certificado: certB1.numero_certificado,
    id_organizacion: certB1.id_organizacion,
    organizacion_nombre: certB1.organizacion_nombre,
    norma_codigo: certB1.norma_codigo,
  };

  const nivel2Program: ProgramaAuditoriaEntity = {
    id: '10000000-0000-0000-0000-000000000903',
    codigo_programa: 'PROG-2026-002',
    etiqueta: 'Campaña Corporativa Sur',
    nivel_vinculacion: 'NIVEL_2_INTER_ORG',
    tipo_vinculacion: 'Multientidad',
    es_vinculada: true,
    id_ciclo_origen: null,
    notas: 'Consolidado multiorganización',
    deleted_at: null,
    auditorias: [nivel2AuditOrgA, nivel2AuditOrgB],
  };

  return [originProgram, nivel1Program, nivel2Program];
}

test('Step 3.2.1: resolveProgramDetailMode enforces RBAC lock for CLIENT, AUDITOR, and unapproved users', () => {
  const programs = buildStep321ProgramsFixture();
  const prog = programs[1];

  assert.equal(
    resolveProgramDetailMode(
      { isCreating: true, selectedProgramId: null, isEditingAttributes: false },
      canEditAuditScheduleOrTeam(ADMIN_PROFILE)
    ),
    'add'
  );
  assert.equal(
    resolveProgramDetailMode(
      { isCreating: false, selectedProgramId: prog.id, isEditingAttributes: true },
      canEditAuditScheduleOrTeam(WORKER_PROFILE),
      prog
    ),
    'edit'
  );
  assert.equal(
    resolveProgramDetailMode(
      { isCreating: false, selectedProgramId: prog.id, isEditingAttributes: false },
      canEditAuditScheduleOrTeam(ADMIN_PROFILE),
      prog
    ),
    'read'
  );

  for (const nonStaff of [AUDITOR_PROFILE, CLIENT_PROFILE, PENDING_WORKER]) {
    const isStaff = canEditAuditScheduleOrTeam(nonStaff);
    assert.equal(isStaff, false);
    assert.equal(
      resolveProgramDetailMode(
        { isCreating: true, selectedProgramId: null, isEditingAttributes: true },
        isStaff,
        prog
      ),
      'read'
    );
  }
});

test('Step 3.2.1: Program Detail Add Mode renders icon-only Save-first/Cancel-second header, zero bottom form buttons, Paso 1 builder, and Initial Date #1', () => {
  const programs = buildStep321ProgramsFixture();
  const certOpts = INITIAL_CERTIFICADOS_DETAILED.map((c) => ({
    id: c.id,
    numero_certificado: c.numero_certificado,
    id_organizacion: c.id_organizacion,
    organizacion_nombre: c.organizacion_nombre,
    norma_codigo: c.norma_codigo,
    estatus: c.estatus,
  }));

  const draft = createProgramStep1Draft({
    mode: 'add',
    prefillCertId: INITIAL_CERTIFICADOS_DETAILED[2].id,
    certificates: certOpts,
    programs,
    tiposCatalog: INITIAL_TIPOS_AUDITORIA_CATALOG,
    metodologiasCatalog: INITIAL_METODOLOGIAS_CATALOG,
  });
  draft.initialDateMode = 'PREPROGRAMADA_MES';

  const html = renderProgramacionView({
    profile: ADMIN_PROFILE,
    state: makeBaseProgramState({
      isCreating: true,
      prefillCertId: INITIAL_CERTIFICADOS_DETAILED[2].id,
      step1Draft: draft,
    }),
    audits: INITIAL_PROGRAMACION_AUDITS,
    auditors: INITIAL_AUDITORES_DETAILED,
    certificates: SAMPLE_CERTIFICATE_RECORDS,
    programs,
    allCertificadosDetailed: INITIAL_CERTIFICADOS_DETAILED,
    organizaciones: INITIAL_ORGANIZACIONES,
    tiposCatalog: INITIAL_TIPOS_AUDITORIA_CATALOG,
    metodologiasCatalog: INITIAL_METODOLOGIAS_CATALOG,
  });

  assertCleanZeroUuid('Program Add Mode', html);
  assert.ok(html.includes('Nuevo Programa de Auditoría'));
  assert.ok(html.includes('data-nav-back="true"'));
  assert.ok(html.includes('form="programaAuditDetailForm"'));

  // Guardar (emerald) MUST appear strictly BEFORE Cancelar (rose)
  const saveIdx = html.indexOf('id="saveProgramFormBtn"');
  const cancelIdx = html.indexOf('id="cancelEditProgramBtn"');
  assert.ok(saveIdx > 0, 'Save button #saveProgramFormBtn must exist');
  assert.ok(cancelIdx > saveIdx, 'Cancel button #cancelEditProgramBtn must appear after #saveProgramFormBtn');
  assert.ok(html.includes('data-action="cancel-create-program"'));

  // Edit / History / Archive hidden in 'add'
  assert.equal(html.includes('id="startEditProgramBtn"'), false);
  assert.equal(html.includes('data-action="open-changelog"'), false);
  assert.equal(html.includes('data-action="open-archive-modal"'), false);

  // Zero Save/Cancel buttons inside <form id="programaAuditDetailForm">
  const formMatch = html.match(/<form id="programaAuditDetailForm"[\s\S]*?<\/form>/);
  assert.ok(formMatch, 'Must render <form id="programaAuditDetailForm">');
  assert.equal(formMatch[0].includes('type="submit"'), false, 'Form body must have zero submit buttons');
  assert.equal(formMatch[0].includes('Guardar'), false);

  // Step 2 button disabled during creation
  assert.ok(html.includes('Paso 1: Vinculación y Alcance'));
  assert.ok(html.includes('Paso 2: Fechas, Sitios y Auditores'));
  assert.ok(html.includes('Guarde el Paso 1 para habilitar la programación operativa del Paso 2'));

  // Zone 1 + Initial Date #1 fields
  assert.ok(html.includes('id="progNivelVinculacionSelect"'));
  assert.ok(html.includes('id="progTipoVinculacionSelect"'));
  assert.ok(html.includes('id="progCicloOrigenSelect"'));
  assert.ok(html.includes('id="progInitialDateModeSelect"'));
  assert.ok(html.includes('id="progInitialDateAnioInput"'));
  assert.ok(html.includes('id="progInitialDateMesSelect"'));
  assert.equal(suggestNextProgramCode(programs), 'PROG-2026-004');
});

test('Step 3.2.1: Program Detail Read Mode & Edit Mode support Nivel 1/Nivel 2 builders, origin jump, changelog/archive, and Paso 2 switcher', () => {
  const programs = buildStep321ProgramsFixture();
  const nivel1Program = programs[1];
  const nivel2Program = programs[2];

  // 1. Read Mode on Step 1
  const readHtml = renderProgramacionView({
    profile: WORKER_PROFILE,
    state: makeBaseProgramState({
      selectedProgramId: nivel1Program.id,
      selectedAuditId: nivel1Program.auditorias[0].id,
      activeStep: 1,
    }),
    audits: INITIAL_PROGRAMACION_AUDITS,
    auditors: INITIAL_AUDITORES_DETAILED,
    certificates: SAMPLE_CERTIFICATE_RECORDS,
    programs,
    allCertificadosDetailed: INITIAL_CERTIFICADOS_DETAILED,
    organizaciones: INITIAL_ORGANIZACIONES,
    tiposCatalog: INITIAL_TIPOS_AUDITORIA_CATALOG,
    metodologiasCatalog: INITIAL_METODOLOGIAS_CATALOG,
  });

  assertCleanZeroUuid('Program Read Mode Step 1', readHtml);
  assert.ok(readHtml.includes('Planta Santa Cruz Integrada'));
  assert.ok(readHtml.includes('PROG-2026-001'));
  assert.ok(readHtml.includes('Nivel 1 · Integrada'));
  assert.ok(readHtml.includes('id="startEditProgramBtn"'));
  assert.ok(readHtml.includes('data-action="open-changelog"'));
  assert.ok(readHtml.includes('data-table-name="programa_auditoria"'));
  assert.ok(readHtml.includes('data-action="open-archive-modal"'));
  assert.ok(readHtml.includes('data-action="open-origin-program"'));

  // 2. Read Mode on Step 2 with multi-certificate switcher
  const step2Html = renderProgramacionView({
    profile: WORKER_PROFILE,
    state: makeBaseProgramState({
      selectedProgramId: nivel1Program.id,
      selectedAuditId: nivel1Program.auditorias[1].id,
      activeStep: 2,
    }),
    audits: INITIAL_PROGRAMACION_AUDITS,
    auditors: INITIAL_AUDITORES_DETAILED,
    certificates: SAMPLE_CERTIFICATE_RECORDS,
    programs,
    allCertificadosDetailed: INITIAL_CERTIFICADOS_DETAILED,
    organizaciones: INITIAL_ORGANIZACIONES,
  });

  assertCleanZeroUuid('Program Read Mode Step 2', step2Html);
  assert.ok(step2Html.includes('Paso 2 · Programación Operativa de la Campaña'));
  assert.ok(step2Html.includes('data-action="select-prog-campaign-audit"'));
  assert.ok(step2Html.includes('data-prog-tab="equipo"'));
  assert.ok(step2Html.includes('data-prog-tab="muestreo"'));
  assert.ok(step2Html.includes('data-prog-tab="matriz"'));
  assert.ok(step2Html.includes('data-prog-tab="hallazgos"'));

  // 3. Edit Mode on Nivel 2 Inter-Org shows multi-org aggregator & hides edit/history/archive
  const editNivel2Html = renderProgramacionView({
    profile: ADMIN_PROFILE,
    state: makeBaseProgramState({
      selectedProgramId: nivel2Program.id,
      selectedAuditId: nivel2Program.auditorias[0].id,
      isEditingAttributes: true,
    }),
    audits: INITIAL_PROGRAMACION_AUDITS,
    auditors: INITIAL_AUDITORES_DETAILED,
    certificates: SAMPLE_CERTIFICATE_RECORDS,
    programs,
    allCertificadosDetailed: INITIAL_CERTIFICADOS_DETAILED,
    organizaciones: INITIAL_ORGANIZACIONES,
    tiposCatalog: INITIAL_TIPOS_AUDITORIA_CATALOG,
    metodologiasCatalog: INITIAL_METODOLOGIAS_CATALOG,
  });

  assertCleanZeroUuid('Program Edit Mode Nivel 2', editNivel2Html);
  assert.ok(editNivel2Html.includes('Agregador Multi-Organización (Nivel 2 Inter-Org)'));
  assert.ok(editNivel2Html.includes('id="progNivel2OrgSelect"'));
  assert.ok(editNivel2Html.includes('id="progNivel2CertSelect"'));
  assert.ok(editNivel2Html.includes('id="addNivel2CertBtn"'));
  assert.ok(editNivel2Html.includes('id="saveProgramFormBtn"'));
  assert.ok(editNivel2Html.includes('id="cancelEditProgramBtn"'));
  assert.equal(editNivel2Html.includes('id="startEditProgramBtn"'), false);
  assert.equal(editNivel2Html.includes('data-action="open-changelog"'), false);
  assert.equal(editNivel2Html.includes('data-action="open-archive-modal"'), false);
});

test('Step 3.2.1: CLIENT in Nivel 2 Inter-Org is strictly read-only and isolated to authorized organizations; AUDITOR is strictly read-only', () => {
  const programs = buildStep321ProgramsFixture();
  const nivel2Program = programs[2];
  const orgAId = INITIAL_ORGANIZACIONES[0].id;
  const certA = INITIAL_CERTIFICADOS_DETAILED[0];
  const certB = INITIAL_CERTIFICADOS_DETAILED[2];

  // Even if state flags request edit/create, CLIENT must resolve to 'read' and see ONLY Org A cert
  const clientHtml = renderProgramacionView({
    profile: CLIENT_PROFILE,
    state: makeBaseProgramState({
      selectedProgramId: nivel2Program.id,
      isCreating: true,
      isEditingAttributes: true,
      activeStep: 1,
    }),
    audits: INITIAL_PROGRAMACION_AUDITS,
    auditors: INITIAL_AUDITORES_DETAILED,
    certificates: SAMPLE_CERTIFICATE_RECORDS,
    programs,
    allCertificadosDetailed: INITIAL_CERTIFICADOS_DETAILED,
    organizaciones: INITIAL_ORGANIZACIONES,
    authorizedClientOrgIds: [orgAId],
  });

  assertCleanZeroUuid('Program CLIENT Nivel 2 Isolated', clientHtml);
  assert.equal(clientHtml.includes('id="saveProgramFormBtn"'), false);
  assert.equal(clientHtml.includes('id="startEditProgramBtn"'), false);
  assert.equal(clientHtml.includes('data-action="open-archive-modal"'), false);
  assert.ok(clientHtml.includes(certA.numero_certificado));
  assert.equal(
    clientHtml.includes(certB.numero_certificado),
    false,
    'CLIENT in Nivel 2 Inter-Org must NOT see certificates from unauthorized organizations'
  );
  assert.equal(
    clientHtml.includes('AUD-2026-N2-B'),
    false,
    'CLIENT in Nivel 2 Inter-Org must NOT see audit codes from unauthorized organizations'
  );

  // AUDITOR must resolve to 'read' without edit/archive buttons
  const auditorHtml = renderProgramacionView({
    profile: AUDITOR_PROFILE,
    state: makeBaseProgramState({
      selectedProgramId: nivel2Program.id,
      isEditingAttributes: true,
    }),
    audits: INITIAL_PROGRAMACION_AUDITS,
    auditors: INITIAL_AUDITORES_DETAILED,
    certificates: SAMPLE_CERTIFICATE_RECORDS,
    programs,
    allCertificadosDetailed: INITIAL_CERTIFICADOS_DETAILED,
    organizaciones: INITIAL_ORGANIZACIONES,
  });

  assertCleanZeroUuid('Program AUDITOR Read-Only', auditorHtml);
  assert.equal(auditorHtml.includes('id="saveProgramFormBtn"'), false);
  assert.equal(auditorHtml.includes('id="startEditProgramBtn"'), false);
  assert.equal(auditorHtml.includes('data-action="open-archive-modal"'), false);
});
