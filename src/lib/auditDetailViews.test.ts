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
  assert.ok(step2Html.includes('data-prog-tab="planificacion"'));
  assert.ok(step2Html.includes('data-prog-tab="equipo_resumen"'));
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

function assertAllTablesFixedAndNoButtonsInTd(label: string, html: string): void {
  const tableRegex = /<table\b([^>]*)>([\s\S]*?)<\/table>/gi;
  let tableMatch: RegExpExecArray | null;
  let tableCount = 0;
  while ((tableMatch = tableRegex.exec(html)) !== null) {
    tableCount += 1;
    const tableAttrs = tableMatch[1] || '';
    const tableInner = tableMatch[2] || '';
    assert.ok(
      tableAttrs.includes('table-fixed'),
      `${label} table #${tableCount} must use table-fixed`
    );
    const colgroupMatch = tableInner.match(/<colgroup>([\s\S]*?)<\/colgroup>/i);
    assert.ok(colgroupMatch, `${label} table #${tableCount} must declare <colgroup>`);
    const widthMatches = Array.from(
      colgroupMatch[1].matchAll(/width:\s*(\d+(?:\.\d+)?)%/gi)
    ).map((m) => Number(m[1]));
    const sum = widthMatches.reduce((acc, n) => acc + n, 0);
    assert.equal(
      Math.round(sum),
      100,
      `${label} table #${tableCount} colgroup widths must sum to 100% (got ${sum}%)`
    );

    const tbodyMatch = tableInner.match(/<tbody\b[^>]*>([\s\S]*?)<\/tbody>/i);
    if (tbodyMatch) {
      assert.equal(
        /<td\b[^>]*>[\s\S]*?<button\b/i.test(tbodyMatch[1]),
        false,
        `${label} table #${tableCount} must have 0 <button> inside <td>`
      );
    }
  }
  assert.ok(tableCount > 0, `${label} expected at least one rendered <table>`);
}

function buildStep322RichProgramsFixture(): ProgramaAuditoriaEntity[] {
  const programs = buildStep321ProgramsFixture();
  const auditor1 = INITIAL_AUDITORES_DETAILED[0];
  const auditor2 = INITIAL_AUDITORES_DETAILED[1] || auditor1;

  // Enrich Nivel 1 program (2 certs) with 1:N dates, sitiosPlan (Cubo 1=4d, Cubo 2=4d), and comments
  const progNivel1 = programs[1];
  const auditQms = progNivel1.auditorias[0];
  const sitePlanId1 = '30000000-0000-0000-0000-000000000911';
  const sitePlanId2 = '30000000-0000-0000-0000-000000000912';

  progNivel1.auditorias[0] = {
    ...auditQms,
    tiempo_auditoria: 3,
    dias_auditor: 3,
    fechas: [
      {
        id: '40000000-0000-0000-0000-000000000911',
        id_auditoria: auditQms.id,
        numero_secuencia: 1,
        tag: 'Programación',
        tipo_fecha: 'PREPROGRAMADA_MES',
        anio: 2026,
        mes: 9,
        fecha_inicio: null,
        fecha_fin: null,
        observacion: 'Ventana estimada anual Q3',
        deleted_at: null,
      },
      {
        id: '40000000-0000-0000-0000-000000000912',
        id_auditoria: auditQms.id,
        numero_secuencia: 2,
        tag: 'Reprogramación',
        tipo_fecha: 'REAL',
        anio: null,
        mes: null,
        fecha_inicio: '2026-06-10',
        fecha_fin: '2026-06-12',
        observacion: 'Confirmación presencial solicitada por Planta HQ',
        deleted_at: null,
      },
    ],
    sitiosPlan: [
      {
        id: sitePlanId1,
        id_auditoria: auditQms.id,
        id_sitio: INITIAL_CERTIFICADOS_DETAILED[0].sitios[0].id,
        numero_sitio: 0,
        nombre_sitio: 'Planta Principal Valencia',
        direccion_sitio: 'Zona Industrial Norte Parcela 14',
        tiempo_auditoria: 3,
        modalidad_evaluacion: 'Presencial',
        fecha_inicio: '2026-06-10',
        fecha_fin: '2026-06-12',
        notas_sitio: 'Cubrir turno diurno y nocturno',
        deleted_at: null,
        equipoSitio: [
          {
            id: '50000000-0000-0000-0000-000000000911',
            id_sitios_por_auditoria: sitePlanId1,
            id_auditor: auditor1.id,
            auditor_nombre: auditor1.nombre,
            rol_auditor: 'AUDITOR_LIDER',
            tiempo_auditoria: 2,
            asignacion_completa_sitio: true,
            deleted_at: null,
          },
          {
            id: '50000000-0000-0000-0000-000000000912',
            id_sitios_por_auditoria: sitePlanId1,
            id_auditor: auditor2.id,
            auditor_nombre: auditor2.nombre,
            rol_auditor: 'AUDITOR',
            tiempo_auditoria: 1,
            asignacion_completa_sitio: false,
            deleted_at: null,
          },
        ],
        procesos: [
          {
            id: '60000000-0000-0000-0000-000000000911',
            id_sitios_por_auditoria: sitePlanId1,
            id_procesos_por_sitio: '60000000-0000-0000-0000-000000000912',
            id_proceso: INITIAL_CERTIFICADOS_DETAILED[0].procesos[0]?.id || '60000000-0000-0000-0000-000000000913',
            proceso_nombre: 'Gestión de Calidad y Producción',
            notas: 'Revisar registros de calibración',
            deleted_at: null,
            turnos: [
              {
                id: '70000000-0000-0000-0000-000000000911',
                id_procesos_sitio_auditoria: '60000000-0000-0000-0000-000000000911',
                id_turnos_sitio_auditoria: '70000000-0000-0000-0000-000000000912',
                descripcion_turno: 'Turno 07:00 – 15:00',
                deleted_at: null,
              },
            ],
            equipoProceso: [
              {
                id: '80000000-0000-0000-0000-000000000911',
                id_procesos_sitio_auditoria: '60000000-0000-0000-0000-000000000911',
                id_auditor: auditor2.id,
                auditor_nombre: auditor2.nombre,
                rol_en_proceso: 'EVALUADOR',
                deleted_at: null,
              },
            ],
          },
        ],
      },
    ],
    comentarios: [
      {
        id: '90000000-0000-0000-0000-000000000911',
        id_auditoria: auditQms.id,
        comentario: 'Plan de auditoría remitido y confirmado con Gerencia de Calidad.',
        timestamp: '2026-05-15T14:30:00Z',
        deleted_at: null,
      },
    ],
  };

  // Enrich Nivel 2 Org B with its own sitiosPlan so isolation can be verified at site level
  const progNivel2 = programs[2];
  progNivel2.auditorias[1] = {
    ...progNivel2.auditorias[1],
    sitiosPlan: [
      {
        id: sitePlanId2,
        id_auditoria: progNivel2.auditorias[1].id,
        id_sitio: INITIAL_CERTIFICADOS_DETAILED[2].sitios[0]?.id || sitePlanId2,
        numero_sitio: 0,
        nombre_sitio: 'Planta Secreta Org B',
        direccion_sitio: 'Parque Industrial B',
        tiempo_auditoria: 2,
        modalidad_evaluacion: 'Presencial',
        procesos: [],
        equipoSitio: [],
        deleted_at: null,
      },
    ],
  };

  return programs;
}

test('Step 3.2.2: Zone 3 Paso 2 multi-cert switcher, 1:N Multi-Date Manager (#1 Programación + #2 Reprogramación), and campaign propagation controls', () => {
  const programs = buildStep322RichProgramsFixture();
  const individualProgram = programs[0];
  const nivel1Program = programs[1];

  // 1. Multi-cert campaign shows certificate selector with % completeness and Cubo 1/2 balance; #2 Reprogramación is Vigente
  const step2MultiHtml = renderProgramacionView({
    profile: WORKER_PROFILE,
    state: makeBaseProgramState({
      selectedProgramId: nivel1Program.id,
      selectedAuditId: nivel1Program.auditorias[0].id,
      activeStep: 2,
      activeChildTab: 'planificacion',
      isAddingAuditDate: true,
      auditDateFormDraft: {
        tipo_fecha: 'REAL',
        anio: '2026',
        mes: '6',
        fecha_inicio: '2026-06-10',
        fecha_fin: '2026-06-12',
        observacion: 'Ajuste solicitado',
        applyToCampaign: true,
      },
    }),
    audits: INITIAL_PROGRAMACION_AUDITS,
    auditors: INITIAL_AUDITORES_DETAILED,
    certificates: SAMPLE_CERTIFICATE_RECORDS,
    programs,
    allCertificadosDetailed: INITIAL_CERTIFICADOS_DETAILED,
    organizaciones: INITIAL_ORGANIZACIONES,
    findings: INITIAL_PHASE5_FINDINGS,
  });

  assertCleanZeroUuid('Step 3.2.2 Multi-Cert Paso 2', step2MultiHtml);
  assert.ok(step2MultiHtml.includes('Certificados Participantes en Campaña (2)'));
  assert.ok(step2MultiHtml.includes('data-action="select-prog-campaign-audit"'));
  assert.ok(step2MultiHtml.includes('3.00d ✓'));
  assert.ok(step2MultiHtml.includes('10/06/2026 → 12/06/2026'));
  assert.ok(step2MultiHtml.includes('Reprogramación #2'));
  assert.ok(step2MultiHtml.includes('3 días calendario'));
  assert.ok(step2MultiHtml.includes('3.00 días-auditor asignados'));
  assert.ok(step2MultiHtml.includes('Ventana estimada anual Q3'));
  assert.ok(step2MultiHtml.includes('Confirmación presencial solicitada por Planta HQ'));
  assert.ok(step2MultiHtml.includes('Vigente'));
  assert.ok(step2MultiHtml.includes('id="auditDateRevisionForm"'));
  assert.ok(step2MultiHtml.includes('id="auditDatePrecisionSelect"'));
  assert.ok(step2MultiHtml.includes('Aplicar también a todas las auditorías vinculadas de esta campaña'));
  assert.ok(step2MultiHtml.includes('data-action="open-sitio-auditoria"'));
  assert.ok(step2MultiHtml.includes('data-testid="audit-planner-hud"'));
  assert.ok(step2MultiHtml.includes('data-testid="audit-planner-tree"'));

  // 2. INDIVIDUAL program (1 cert) automatically selects the single cert with zero multi-cert switcher noise
  const step2SingleHtml = renderProgramacionView({
    profile: ADMIN_PROFILE,
    state: makeBaseProgramState({
      selectedProgramId: individualProgram.id,
      activeStep: 2,
      activeChildTab: 'planificacion',
    }),
    audits: INITIAL_PROGRAMACION_AUDITS,
    auditors: INITIAL_AUDITORES_DETAILED,
    certificates: SAMPLE_CERTIFICATE_RECORDS,
    programs,
    allCertificadosDetailed: INITIAL_CERTIFICADOS_DETAILED,
    organizaciones: INITIAL_ORGANIZACIONES,
  });

  assertCleanZeroUuid('Step 3.2.2 Individual Paso 2', step2SingleHtml);
  assert.equal(step2SingleHtml.includes('Certificados Participantes en Campaña'), false);
  assert.equal(step2SingleHtml.includes('Aplicar también a todas las auditorías vinculadas'), false);
});

test('Step 3.2.2: Zone 3 tabs equipo_resumen and hallazgos + sitioAuditoriaView 3-zone sub-view enforce table-fixed, 0 buttons in td, and Zero-UUID', () => {
  const programs = buildStep322RichProgramsFixture();
  const nivel1Program = programs[1];
  const sitePlanId = nivel1Program.auditorias[0].sitiosPlan![0].id;

  // 1. Tab equipo_resumen
  const equipoResumenHtml = renderProgramacionView({
    profile: WORKER_PROFILE,
    state: makeBaseProgramState({
      selectedProgramId: nivel1Program.id,
      selectedAuditId: nivel1Program.auditorias[0].id,
      activeStep: 2,
      activeChildTab: 'equipo_resumen',
    }),
    audits: INITIAL_PROGRAMACION_AUDITS,
    auditors: INITIAL_AUDITORES_DETAILED,
    certificates: SAMPLE_CERTIFICATE_RECORDS,
    programs,
    allCertificadosDetailed: INITIAL_CERTIFICADOS_DETAILED,
    organizaciones: INITIAL_ORGANIZACIONES,
  });

  assertCleanZeroUuid('Step 3.2.2 equipo_resumen', equipoResumenHtml);
  assert.ok(equipoResumenHtml.includes('Equipo Evaluador y Carga de Días'));
  assert.ok(equipoResumenHtml.includes('data-action="select-auditor"'));
  assert.ok(equipoResumenHtml.includes('2.00 d'));
  assert.ok(equipoResumenHtml.includes('/ 3 d cal.'));
  assertAllTablesFixedAndNoButtonsInTd('Step 3.2.2 equipo_resumen', equipoResumenHtml);

  // 2. Tab hallazgos (findings + comentarios_por_auditoria)
  const hallazgosHtml = renderProgramacionView({
    profile: WORKER_PROFILE,
    state: makeBaseProgramState({
      selectedProgramId: nivel1Program.id,
      selectedAuditId: nivel1Program.auditorias[0].id,
      activeStep: 2,
      activeChildTab: 'hallazgos',
    }),
    audits: INITIAL_PROGRAMACION_AUDITS,
    auditors: INITIAL_AUDITORES_DETAILED,
    certificates: SAMPLE_CERTIFICATE_RECORDS,
    programs,
    allCertificadosDetailed: INITIAL_CERTIFICADOS_DETAILED,
    organizaciones: INITIAL_ORGANIZACIONES,
    findings: INITIAL_PHASE5_FINDINGS,
  });

  assertCleanZeroUuid('Step 3.2.2 hallazgos', hallazgosHtml);
  assert.ok(hallazgosHtml.includes('Bitácora de Comentarios (1)'));
  assert.ok(hallazgosHtml.includes('Plan de auditoría remitido y confirmado con Gerencia de Calidad.'));
  assertAllTablesFixedAndNoButtonsInTd('Step 3.2.2 hallazgos', hallazgosHtml);

  // 3. sitioAuditoriaView sub-view (Precedence 0)
  const siteViewHtml = renderProgramacionView({
    profile: WORKER_PROFILE,
    state: makeBaseProgramState({
      selectedProgramId: nivel1Program.id,
      selectedAuditId: nivel1Program.auditorias[0].id,
      selectedSitioAuditoriaId: sitePlanId,
      selectedSitioAuditoriaTab: 'procesos',
      activeStep: 2,
    }),
    audits: INITIAL_PROGRAMACION_AUDITS,
    auditors: INITIAL_AUDITORES_DETAILED,
    certificates: SAMPLE_CERTIFICATE_RECORDS,
    programs,
    allCertificadosDetailed: INITIAL_CERTIFICADOS_DETAILED,
    organizaciones: INITIAL_ORGANIZACIONES,
    findings: INITIAL_PHASE5_FINDINGS,
  });

  assertCleanZeroUuid('Step 3.2.2 sitioAuditoriaView', siteViewHtml);
  assert.ok(siteViewHtml.includes('Sitio 0 (HQ) · Planta Principal Valencia'));
  assert.ok(siteViewHtml.includes('data-action="back-from-sitio-auditoria"'));
  assert.ok(siteViewHtml.includes('Gestión de Calidad y Producción'));
  assert.ok(siteViewHtml.includes('Turno 07:00 – 15:00'));
  assert.ok(siteViewHtml.includes('Días Cuadrados ✓'));
  assertAllTablesFixedAndNoButtonsInTd('Step 3.2.2 sitioAuditoriaView', siteViewHtml);
});

test('Step 3.2.2: RBAC hides date mutators for AUDITOR and CLIENT, and isolates CLIENT from Nivel 2 unauthorized sitios_por_auditoria', () => {
  const programs = buildStep322RichProgramsFixture();
  const nivel1Program = programs[1];
  const nivel2Program = programs[2];
  const orgAId = INITIAL_ORGANIZACIONES[0].id;
  const orgBSitePlanId = nivel2Program.auditorias[1].sitiosPlan![0].id;

  // AUDITOR sees timeline read-only without mutators
  const auditorStep2Html = renderProgramacionView({
    profile: AUDITOR_PROFILE,
    state: makeBaseProgramState({
      selectedProgramId: nivel1Program.id,
      selectedAuditId: nivel1Program.auditorias[0].id,
      activeStep: 2,
      activeChildTab: 'planificacion',
      isAddingAuditDate: true,
    }),
    audits: INITIAL_PROGRAMACION_AUDITS,
    auditors: INITIAL_AUDITORES_DETAILED,
    certificates: SAMPLE_CERTIFICATE_RECORDS,
    programs,
    allCertificadosDetailed: INITIAL_CERTIFICADOS_DETAILED,
    organizaciones: INITIAL_ORGANIZACIONES,
  });

  assertCleanZeroUuid('Step 3.2.2 AUDITOR Paso 2', auditorStep2Html);
  assert.ok(auditorStep2Html.includes('10/06/2026 → 12/06/2026'));
  assert.equal(auditorStep2Html.includes('id="openAuditDateFormBtn"'), false);
  assert.equal(auditorStep2Html.includes('id="auditDateRevisionForm"'), false);
  assert.equal(auditorStep2Html.includes('data-action="archive-audit-date"'), false);

  // CLIENT attempting to access Nivel 2 Org B's sitio_auditoria must NOT render Org B data
  const clientBlockedSiteHtml = renderProgramacionView({
    profile: CLIENT_PROFILE,
    state: makeBaseProgramState({
      selectedProgramId: nivel2Program.id,
      selectedSitioAuditoriaId: orgBSitePlanId,
      activeStep: 2,
    }),
    audits: INITIAL_PROGRAMACION_AUDITS,
    auditors: INITIAL_AUDITORES_DETAILED,
    certificates: SAMPLE_CERTIFICATE_RECORDS,
    programs,
    allCertificadosDetailed: INITIAL_CERTIFICADOS_DETAILED,
    organizaciones: INITIAL_ORGANIZACIONES,
    authorizedClientOrgIds: [orgAId],
  });

  assertCleanZeroUuid('Step 3.2.2 CLIENT Nivel 2 Blocked Site', clientBlockedSiteHtml);
  assert.equal(clientBlockedSiteHtml.includes('Planta Secreta Org B'), false);
  assert.equal(clientBlockedSiteHtml.includes('id="openAuditDateFormBtn"'), false);
  assert.equal(clientBlockedSiteHtml.includes('data-action="archive-audit-date"'), false);
});
