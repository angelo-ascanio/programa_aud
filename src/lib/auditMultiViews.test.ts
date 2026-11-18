import test from 'node:test';
import assert from 'node:assert/strict';
import type { UserProfile } from './healthCheck';
import {
  INITIAL_PROGRAMACION_AUDITS,
  INITIAL_PHASE5_FINDINGS,
  type ProgramacionAuditEntity,
} from './auditExecution';
import { INITIAL_AUDITORES_DETAILED } from './competencyMatrix';
import { INITIAL_CERTIFICADOS_DETAILED } from './multisiteSampling';
import { SAMPLE_CERTIFICATE_RECORDS, type CertificateRecord } from './searchControls';
import {
  scopeAuditProgramsForProfile,
  scopeProgramacionAuditsForProfile,
} from './accessControl';
import { assertZeroUuidExposure } from './zeroUuid';
import type { ProgramaAuditoriaEntity } from './auditPlanningEngine';
import {
  computeAuditAlerts,
  DEFAULT_AUDIT_ALERT_CONFIG,
  type AlertConfigEntity,
} from './auditAlertsEngine';
import { renderProgramacionView } from '../views/programacionView';
import { renderResultadoView } from '../views/resultadoView';
import { renderCalendarioView } from '../views/calendarioView';
import { renderUniversalTemplate } from '../views/universalTemplate';

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

function assertColgroup100(html: string, tableId: string, expectedCols: number): void {
  assert.ok(
    html.includes(`data-resizable-table="${tableId}"`),
    `Expected data-resizable-table="${tableId}"`
  );
  assert.ok(html.includes('table-fixed'), `Expected table-fixed in ${tableId}`);
  const tableRegex = new RegExp(
    `<table[\\s\\S]*?data-resizable-table="${tableId}"[\\s\\S]*?<colgroup>([\\s\\S]*?)<\\/colgroup>`
  );
  const match = html.match(tableRegex);
  assert.ok(match, `Missing <colgroup> for ${tableId}`);
  const widths = [...match[1].matchAll(/style="width:\s*([\d.]+)%;"/g)].map((m) =>
    Number(m[1])
  );
  assert.equal(widths.length, expectedCols, `Expected ${expectedCols} columns in ${tableId}`);
  const sum = widths.reduce((acc, v) => acc + v, 0);
  assert.ok(Math.abs(sum - 100) < 0.05, `Expected <colgroup> widths to sum to 100%, got ${sum}`);
}

function assertZeroButtonsInTbody(html: string, contextLabel: string): string {
  const tbodyMatch = html.match(/<tbody[\s\S]*?<\/tbody>/);
  assert.ok(tbodyMatch, `Expected <tbody> in ${contextLabel}`);
  const tbody = tbodyMatch[0];
  assert.equal(
    /<button\b/i.test(tbody),
    false,
    `Forbidden <button> found inside <tbody> for ${contextLabel}`
  );
  return tbody;
}

function buildMultiCampaignFixture(): ProgramaAuditoriaEntity[] {
  const baseAudit1 = INITIAL_PROGRAMACION_AUDITS[0];
  const baseAudit2 = INITIAL_PROGRAMACION_AUDITS[1] || baseAudit1;

  const auditNivel1A: ProgramacionAuditEntity = {
    ...baseAudit1,
    id: '20000000-0000-0000-0000-000000000101',
    codigo_auditoria: 'AUD-2026-N1-A',
    id_programa_auditoria: '10000000-0000-0000-0000-000000000201',
    id_organizacion: '30000000-0000-0000-0000-000000000001',
    organizacion_nombre: 'Iberometal Componentes S.A.',
    numero_certificado: 'FN-QMS-2024-001',
    norma_codigo: 'ISO 9001:2015',
    tiempo_auditoria: 3,
    sitiosPlan: [
      {
        id: 'sp-1',
        id_auditoria: '20000000-0000-0000-0000-000000000101',
        id_sitio: 's-1',
        numero_sitio: 1,
        nombre_sitio: 'Planta Principal',
        tiempo_auditoria: 3,
        procesos: [
          {
            id: 'ps-1',
            id_sitios_por_auditoria: 'sp-1',
            id_procesos_por_sitio: 'pps-1',
            id_proceso: 'proc-1',
            proceso_nombre: 'Producción',
            turnos: [],
            equipoProceso: [],
          },
        ],
        equipoSitio: [
          {
            id: 'asg-1',
            id_sitios_por_auditoria: 'sp-1',
            id_auditor: INITIAL_AUDITORES_DETAILED[0].id,
            auditor_nombre: INITIAL_AUDITORES_DETAILED[0].nombre,
            rol_auditor: 'AUDITOR_LIDER',
            tiempo_auditoria: 3,
            asignacion_completa_sitio: true,
          },
        ],
      },
    ],
    fechas: [
      {
        id: 'f-1',
        id_auditoria: '20000000-0000-0000-0000-000000000101',
        numero_secuencia: 1,
        tag: 'Programación',
        tipo_fecha: 'REAL',
        anio: null,
        mes: null,
        fecha_inicio: '2026-06-10',
        fecha_fin: '2026-06-12',
        observacion: null,
        deleted_at: null,
      },
      {
        id: 'f-2',
        id_auditoria: '20000000-0000-0000-0000-000000000101',
        numero_secuencia: 2,
        tag: 'Reprogramación',
        tipo_fecha: 'REAL',
        anio: null,
        mes: null,
        fecha_inicio: '2026-07-14',
        fecha_fin: '2026-07-16',
        observacion: 'Ajuste planta',
        deleted_at: null,
      },
    ],
  };

  const auditNivel2OrgA: ProgramacionAuditEntity = {
    ...baseAudit1,
    id: '20000000-0000-0000-0000-000000000102',
    codigo_auditoria: 'AUD-2026-N2-A',
    id_programa_auditoria: '10000000-0000-0000-0000-000000000202',
    id_organizacion: '30000000-0000-0000-0000-000000000001',
    organizacion_nombre: 'Iberometal Componentes S.A.',
    numero_certificado: 'FN-EMS-2026-009',
    norma_codigo: 'ISO 14001:2015',
    tiempo_auditoria: 2,
    sitiosPlan: [
      {
        id: 'sp-2',
        id_auditoria: '20000000-0000-0000-0000-000000000102',
        id_sitio: 's-2',
        numero_sitio: 1,
        nombre_sitio: 'Sede Norte',
        tiempo_auditoria: 2,
        procesos: [
          {
            id: 'ps-2',
            id_sitios_por_auditoria: 'sp-2',
            id_procesos_por_sitio: 'pps-2',
            id_proceso: 'proc-2',
            proceso_nombre: 'Gestión Ambiental',
            turnos: [],
            equipoProceso: [],
          },
        ],
        equipoSitio: [
          {
            id: 'asg-2',
            id_sitios_por_auditoria: 'sp-2',
            id_auditor: INITIAL_AUDITORES_DETAILED[0].id,
            auditor_nombre: INITIAL_AUDITORES_DETAILED[0].nombre,
            rol_auditor: 'AUDITOR_LIDER',
            tiempo_auditoria: 1,
            asignacion_completa_sitio: true,
          },
        ],
      },
    ],
    fechas: [
      {
        id: 'f-3',
        id_auditoria: '20000000-0000-0000-0000-000000000102',
        numero_secuencia: 1,
        tag: 'Programación',
        tipo_fecha: 'PREPROGRAMADA_MES',
        anio: 2026,
        mes: 9,
        fecha_inicio: null,
        fecha_fin: null,
        observacion: null,
        deleted_at: null,
      },
    ],
  };

  const auditNivel2OrgB: ProgramacionAuditEntity = {
    ...baseAudit2,
    id: '20000000-0000-0000-0000-000000000103',
    codigo_auditoria: 'AUD-2026-N2-B',
    id_programa_auditoria: '10000000-0000-0000-0000-000000000202',
    id_organizacion: '30000000-0000-0000-0000-000000000002',
    organizacion_nombre: 'Empresa Secreta Confidencial S.L.',
    numero_certificado: 'FN-SEC-2026-999',
    norma_codigo: 'ISO 45001:2018',
    tiempo_auditoria: 2,
    sitiosPlan: [],
    fechas: [
      {
        id: 'f-4',
        id_auditoria: '20000000-0000-0000-0000-000000000103',
        numero_secuencia: 1,
        tag: 'Programación',
        tipo_fecha: 'PREPROGRAMADA_MES',
        anio: 2026,
        mes: 9,
        fecha_inicio: null,
        fecha_fin: null,
        observacion: null,
        deleted_at: null,
      },
    ],
  };

  return [
    {
      id: '10000000-0000-0000-0000-000000000201',
      codigo_programa: 'PRG-2026-001',
      etiqueta: 'Planta Santa Cruz',
      nivel_vinculacion: 'NIVEL_1_INTRA_ORG',
      tipo_vinculacion: 'Integrada',
      es_vinculada: true,
      id_ciclo_origen: '10000000-0000-0000-0000-000000000200',
      notas: null,
      auditorias: [auditNivel1A],
      deleted_at: null,
    },
    {
      id: '10000000-0000-0000-0000-000000000202',
      codigo_programa: 'PRG-2026-002',
      etiqueta: 'Consorcio Logístico Conjunto',
      nivel_vinculacion: 'NIVEL_2_INTER_ORG',
      tipo_vinculacion: 'Multientidad',
      es_vinculada: true,
      id_ciclo_origen: null,
      notas: null,
      auditorias: [auditNivel2OrgA, auditNivel2OrgB],
      deleted_at: null,
    },
  ];
}

test('Step 3.1.1 Programación Vista A: Campaigns Multi View, 6-col table-fixed, 0 buttons in tbody, 5 reactive facets, and creation handoff', () => {
  const programs = buildMultiCampaignFixture();

  const html = renderProgramacionView({
    profile: ADMIN_PROFILE,
    state: {
      selectedAuditId: null,
      selectedProgramId: null,
      isCreating: false,
      subView: 'campaigns',
      activeChildTab: 'equipo',
      query: '',
      selectedTipo: 'ALL',
      selectedMetodologia: 'ALL',
      selectedEstatus: 'ALL',
      selectedAuditorLider: 'ALL',
      viewMode: 'list',
      sortColumn: null,
      sortDirection: 'none',
      isEditingAttributes: false,
      isAddingTeamMember: false,
      isSidebarOpen: true,
      facetSelections: {},
    },
    audits: programs.flatMap((p) => p.auditorias),
    auditors: INITIAL_AUDITORES_DETAILED,
    certificates: SAMPLE_CERTIFICATE_RECORDS,
    programs,
    archiveConfig: {
      canInspectArchived: true,
      showArchived: true,
      archivedItems: [
        {
          id: '10000000-0000-0000-0000-000000000299',
          tableName: 'programa_auditoria',
          title: 'PRG-2024-ARC · Archivo Histórico',
          deletedAt: '2026-01-10T10:00:00Z',
          deletedBy: ADMIN_PROFILE.id,
          deleteReason: 'Prueba de archivo',
        },
      ],
      actorDirectory: {
        [ADMIN_PROFILE.id]: {
          id: ADMIN_PROFILE.id,
          nombre: ADMIN_PROFILE.nombre,
          role: ADMIN_PROFILE.role,
        },
      },
      restoringId: null,
    },
  });

  // Single Big Card + Universal Template compliance
  assert.ok(html.includes('data-mv-domain="programacion"'));
  assert.ok(html.includes('Mostrando'));
  assert.ok(html.includes('campañas de auditoría'));
  assert.equal(/type=["']search["']/i.test(html), false);
  assert.ok(html.includes('id="programacionSearchInput"'));
  assert.equal(html.includes('id="clearProgramacionSearchBtn"'), false);

  const searchHtml = renderProgramacionView({
    profile: ADMIN_PROFILE,
    state: {
      selectedAuditId: null,
      selectedProgramId: null,
      isCreating: false,
      subView: 'campaigns',
      activeChildTab: 'equipo',
      query: 'Santa Cruz',
      selectedTipo: 'ALL',
      selectedMetodologia: 'ALL',
      selectedEstatus: 'ALL',
      selectedAuditorLider: 'ALL',
      viewMode: 'list',
      sortColumn: null,
      sortDirection: 'none',
      isEditingAttributes: false,
      isAddingTeamMember: false,
      isSidebarOpen: true,
      facetSelections: {},
    },
    audits: programs.flatMap((p) => p.auditorias),
    auditors: INITIAL_AUDITORES_DETAILED,
    certificates: SAMPLE_CERTIFICATE_RECORDS,
    programs,
  });
  assert.ok(searchHtml.includes('id="clearProgramacionSearchBtn"'));
  assert.ok(searchHtml.includes('Planta Santa Cruz'));

  // Header + button is icon-only w-9 h-9 bg-sky-700
  assert.ok(html.includes('data-action="open-create-program"'));
  assert.ok(html.includes('w-9 h-9'));
  assert.ok(html.includes('bg-sky-700'));
  assert.equal(html.includes('data-action="open-plan-audit"'), false);

  // Campaign badges & date resolution
  assert.ok(html.includes('PRG-2026-001'));
  assert.ok(html.includes('Planta Santa Cruz'));
  assert.ok(html.includes('Nivel 1 · Integrada'));
  assert.ok(html.includes('Evolución de ciclo'));
  assert.ok(html.includes('Nivel 2 · Multientidad'));
  assert.ok(html.includes('14/07 → 16/07/2026 · 3d cal.'));
  assert.ok(html.includes('Reprog. #2'));
  assert.ok(html.includes('Sep 2026 · Preprog.'));
  assert.ok(html.includes('Cuadrado ✓'));
  assert.ok(html.includes('Desfase -1d'));

  // 6 columns summing 100%, 0 <button> in <tbody>, clickable rows
  assertColgroup100(html, 'programacion-main', 6);
  const tbody = assertZeroButtonsInTbody(html, 'Programación Vista A');
  assert.ok(tbody.includes('data-action="select-prog-program"'));
  assert.ok(tbody.includes('tabindex="0"'));

  // 5 reactive facets S_{-k}
  assert.ok(html.includes('data-facet-group="nivel_vinculacion"'));
  assert.ok(html.includes('data-facet-group="tipo_vinculacion"'));
  assert.ok(html.includes('data-facet-group="precision_fecha"'));
  assert.ok(html.includes('data-facet-group="tag_planificacion"'));
  assert.ok(html.includes('data-facet-group="cuadre_dias"'));

  // Archive checkbox and restore action for ADMIN only
  assert.ok(html.includes('id="showArchivedCheckbox"'));
  assert.ok(html.includes('PRG-2024-ARC · Archivo Histórico'));
  assert.ok(html.includes('Restaurar'));
  assert.ok(html.includes('data-action="restore-archived-record"'));

  // Zero-UUID check
  assert.equal(assertZeroUuidExposure(html).compliant, true);

  // Clicking + opens Paso 1 creation handoff
  const createHtml = renderProgramacionView({
    profile: WORKER_PROFILE,
    state: {
      selectedAuditId: null,
      selectedProgramId: null,
      isCreating: true,
      prefillCertId: null,
      activeChildTab: 'equipo',
      query: '',
      selectedTipo: 'ALL',
      selectedMetodologia: 'ALL',
      selectedEstatus: 'ALL',
      selectedAuditorLider: 'ALL',
      viewMode: 'list',
      sortColumn: null,
      sortDirection: 'none',
      isEditingAttributes: false,
      isAddingTeamMember: false,
    },
    audits: programs.flatMap((p) => p.auditorias),
    auditors: INITIAL_AUDITORES_DETAILED,
    certificates: SAMPLE_CERTIFICATE_RECORDS,
    programs,
  });
  assert.ok(createHtml.includes('Nuevo Programa de Auditoría'));
  assert.ok(createHtml.includes('data-action="cancel-create-program"'));
  assert.equal(assertZeroUuidExposure(createHtml).compliant, true);
});

test('Step 3.1.1 Programación Vista B: Certificados Sin Programación filters by estatus chips, Norma & Org, 5-col table-fixed, 0 buttons in tbody, and preselects Paso 1', () => {
  const certCatalog: CertificateRecord[] = [
    ...SAMPLE_CERTIFICATE_RECORDS,
    {
      id: '40000000-0000-0000-0000-000000000801',
      numero_certificado: 'FN-EST-2026-001',
      organizacion_id: '30000000-0000-0000-0000-000000000010',
      organizacion_nombre: 'BioPlásticos del Sur S.A.',
      norma: 'ISO 14001:2015',
      estatus: 'Estudio',
      sector_iaf: 14,
      fecha_emision: '2026-01-15',
      fecha_vencimiento: '2029-01-15',
    },
    {
      id: '40000000-0000-0000-0000-000000000802',
      numero_certificado: 'FN-ACT-2026-002',
      organizacion_id: '30000000-0000-0000-0000-000000000011',
      organizacion_nombre: 'Metalúrgica Andina S.A.',
      norma: 'ISO 9001:2015',
      estatus: 'Activo',
      sector_iaf: 17,
      fecha_emision: '2025-05-01',
      fecha_vencimiento: '2028-05-01',
    },
  ];

  // Program only covers INITIAL_PROGRAMACION_AUDITS[0].id_certificado; the 2 synthetic certs are unprogrammed
  const programs = buildMultiCampaignFixture();

  const htmlEstudio = renderProgramacionView({
    profile: ADMIN_PROFILE,
    state: {
      selectedAuditId: null,
      selectedProgramId: null,
      isCreating: false,
      subView: 'pendientes',
      unprogrammedStatusFilter: 'Estudio',
      unprogrammedNormaId: 'ALL',
      unprogrammedOrgId: 'ALL',
      activeChildTab: 'equipo',
      query: '',
      selectedTipo: 'ALL',
      selectedMetodologia: 'ALL',
      selectedEstatus: 'ALL',
      selectedAuditorLider: 'ALL',
      viewMode: 'list',
      sortColumn: null,
      sortDirection: 'none',
      isEditingAttributes: false,
      isAddingTeamMember: false,
      isSidebarOpen: true,
      facetSelections: {},
    },
    audits: INITIAL_PROGRAMACION_AUDITS,
    auditors: INITIAL_AUDITORES_DETAILED,
    certificates: certCatalog,
    programs,
  });

  assert.ok(htmlEstudio.includes('data-mv-domain="programacion"'));
  assert.ok(htmlEstudio.includes('certificados sin programación'));
  assert.ok(htmlEstudio.includes('data-unprogrammed-status="Estudio"'));
  assert.ok(htmlEstudio.includes('id="unprogrammedNormaFilter"'));
  assert.ok(htmlEstudio.includes('id="unprogrammedOrgFilter"'));
  assert.ok(htmlEstudio.includes('FN-EST-2026-001'));
  assert.equal(htmlEstudio.includes('FN-ACT-2026-002'), false);
  // Active program cert must be excluded from unprogrammed list
  assert.equal(htmlEstudio.includes('FN-QMS-2024-001'), false);

  assertColgroup100(htmlEstudio, 'programacion-unprogrammed', 5);
  const tbody = assertZeroButtonsInTbody(htmlEstudio, 'Programación Vista B');
  assert.ok(tbody.includes('data-action="start-program-from-cert"'));
  assert.ok(tbody.includes('tabindex="0"'));
  assert.equal(assertZeroUuidExposure(htmlEstudio).compliant, true);

  // Preselect certificate into Paso 1 'add' mode
  const prefillHtml = renderProgramacionView({
    profile: ADMIN_PROFILE,
    state: {
      selectedAuditId: null,
      selectedProgramId: null,
      isCreating: true,
      prefillCertId: '40000000-0000-0000-0000-000000000801',
      activeChildTab: 'equipo',
      query: '',
      selectedTipo: 'ALL',
      selectedMetodologia: 'ALL',
      selectedEstatus: 'ALL',
      selectedAuditorLider: 'ALL',
      viewMode: 'list',
      sortColumn: null,
      sortDirection: 'none',
      isEditingAttributes: false,
      isAddingTeamMember: false,
    },
    audits: INITIAL_PROGRAMACION_AUDITS,
    auditors: INITIAL_AUDITORES_DETAILED,
    certificates: certCatalog,
    programs,
  });
  assert.ok(prefillHtml.includes('Certificado Preseleccionado desde Sin Programación'));
  assert.ok(prefillHtml.includes('FN-EST-2026-001'));
  assert.ok(prefillHtml.includes('BioPlásticos del Sur S.A.'));
  assert.equal(assertZeroUuidExposure(prefillHtml).compliant, true);

  // CLIENT & AUDITOR cannot access Vista B or create campaigns
  const clientDeniedVistaB = renderProgramacionView({
    profile: CLIENT_PROFILE,
    state: {
      selectedAuditId: null,
      selectedProgramId: null,
      isCreating: false,
      subView: 'pendientes',
      activeChildTab: 'equipo',
      query: '',
      selectedTipo: 'ALL',
      selectedMetodologia: 'ALL',
      selectedEstatus: 'ALL',
      selectedAuditorLider: 'ALL',
      viewMode: 'list',
      sortColumn: null,
      sortDirection: 'none',
      isEditingAttributes: false,
      isAddingTeamMember: false,
    },
    audits: INITIAL_PROGRAMACION_AUDITS,
    auditors: INITIAL_AUDITORES_DETAILED,
    certificates: certCatalog,
    programs,
  });
  assert.equal(clientDeniedVistaB.includes('data-action="open-create-program"'), false);
  assert.equal(clientDeniedVistaB.includes('data-prog-subview="pendientes"'), false);
  assert.equal(clientDeniedVistaB.includes('id="showArchivedCheckbox"'), false);
});

test('Step 3.1.1 RBAC Level 2 Isolation: CLIENT only sees their own organization inside a Nivel 2 Multientidad campaign', () => {
  const programs = buildMultiCampaignFixture();
  const allAudits = programs.flatMap((p) => p.auditorias);
  const authorizedOrgIds = ['30000000-0000-0000-0000-000000000001'];

  const scopedAudits = scopeProgramacionAuditsForProfile(
    allAudits,
    CLIENT_PROFILE,
    authorizedOrgIds
  );
  const scopedPrograms = scopeAuditProgramsForProfile(
    programs,
    CLIENT_PROFILE,
    scopedAudits
  );

  const clientHtml = renderProgramacionView({
    profile: CLIENT_PROFILE,
    state: {
      selectedAuditId: null,
      selectedProgramId: null,
      isCreating: false,
      subView: 'campaigns',
      activeChildTab: 'equipo',
      query: '',
      selectedTipo: 'ALL',
      selectedMetodologia: 'ALL',
      selectedEstatus: 'ALL',
      selectedAuditorLider: 'ALL',
      viewMode: 'list',
      sortColumn: null,
      sortDirection: 'none',
      isEditingAttributes: false,
      isAddingTeamMember: false,
      isSidebarOpen: true,
      facetSelections: {},
    },
    audits: scopedAudits,
    auditors: INITIAL_AUDITORES_DETAILED,
    certificates: [],
    programs: scopedPrograms,
  });

  assert.ok(clientHtml.includes('Iberometal Componentes S.A.'));
  assert.ok(clientHtml.includes('FN-EMS-2026-009'));
  assert.equal(clientHtml.includes('Empresa Secreta Confidencial S.L.'), false);
  assert.equal(clientHtml.includes('FN-SEC-2026-999'), false);
  assert.equal(assertZeroUuidExposure(clientHtml).compliant, true);
});

test('Step 3.1.1 Resultado: Universal Multi View board (table-fixed 100%, 0 buttons in tbody, 4 facets, Kanban grid, ISO 17021-1 & AUDITOR preservation)', () => {
  const listHtml = renderResultadoView({
    profile: AUDITOR_PROFILE,
    state: {
      selectedAuditId: 'ALL',
      activeAuditIdForDecision: INITIAL_PROGRAMACION_AUDITS[0].id,
      displayMode: 'list',
      filterType: 'ALL',
      filterLifecycle: 'ALL',
      searchQuery: '',
      isLoggingFinding: false,
      inspectingFindingId: null,
      isSidebarOpen: true,
      facetSelections: {},
    },
    audits: INITIAL_PROGRAMACION_AUDITS,
    findings: INITIAL_PHASE5_FINDINGS,
    processes: [{ id: '60000000-0000-0000-0000-000000000001', nombre_proceso: 'Troquelado' }],
    requirements: [{ id: '70000000-0000-0000-0000-000000000001', codigo: '8.5.1', norma: 'ISO 9001:2015' }],
  });

  // Universal Template structure
  assert.ok(listHtml.includes('data-mv-domain="resultado"'));
  assert.ok(listHtml.includes('Mostrando'));
  assert.ok(listHtml.includes('hallazgos registrados'));
  assert.equal(/type=["']search["']/i.test(listHtml), false);
  assert.ok(listHtml.includes('id="resultadoSearchInput"'));
  assert.equal(listHtml.includes('id="clearResultadoSearchBtn"'), false);

  const searchResHtml = renderResultadoView({
    profile: AUDITOR_PROFILE,
    state: {
      selectedAuditId: 'ALL',
      activeAuditIdForDecision: INITIAL_PROGRAMACION_AUDITS[0].id,
      displayMode: 'list',
      filterType: 'ALL',
      filterLifecycle: 'ALL',
      searchQuery: 'cláusula',
      isLoggingFinding: false,
      inspectingFindingId: null,
      isSidebarOpen: true,
      facetSelections: {},
    },
    audits: INITIAL_PROGRAMACION_AUDITS,
    findings: INITIAL_PHASE5_FINDINGS,
    processes: [{ id: '60000000-0000-0000-0000-000000000001', nombre_proceso: 'Troquelado' }],
    requirements: [{ id: '70000000-0000-0000-0000-000000000001', codigo: '8.5.1', norma: 'ISO 9001:2015' }],
  });
  assert.ok(searchResHtml.includes('id="clearResultadoSearchBtn"'));

  // 5-col table-fixed summing 100%, 0 <button> in <tbody>, clickable rows
  assertColgroup100(listHtml, 'resultado-main', 5);
  const tbody = assertZeroButtonsInTbody(listHtml, 'Resultado Table');
  assert.ok(tbody.includes('data-action="inspect-finding"'));
  assert.ok(tbody.includes('tabindex="0"'));

  // 4 reactive facets
  assert.ok(listHtml.includes('data-facet-group="tipo_hallazgo"'));
  assert.ok(listHtml.includes('data-facet-group="estado_cierre"'));
  assert.ok(listHtml.includes('data-facet-group="norma"'));
  assert.ok(listHtml.includes('data-facet-group="auditoria"'));

  // ISO 17021-1 recommendation card & AUDITOR mutation preserved
  assert.ok(listHtml.includes('Motor de Decisión ISO/IEC 17021-1:2015'));
  assert.ok(listHtml.includes('id="openNewFindingFormBtn"'));
  assert.ok(listHtml.includes('id="signRecommendationForm"'));

  // Kanban mode uses customGridHtml & preserves clickable cards
  const kanbanHtml = renderResultadoView({
    profile: CLIENT_PROFILE,
    state: {
      selectedAuditId: 'ALL',
      activeAuditIdForDecision: INITIAL_PROGRAMACION_AUDITS[0].id,
      displayMode: 'kanban',
      filterType: 'ALL',
      filterLifecycle: 'ALL',
      searchQuery: '',
      isLoggingFinding: false,
      inspectingFindingId: null,
      isSidebarOpen: false,
      facetSelections: {},
    },
    audits: INITIAL_PROGRAMACION_AUDITS,
    findings: INITIAL_PHASE5_FINDINGS,
    processes: [{ id: '60000000-0000-0000-0000-000000000001', nombre_proceso: 'Troquelado' }],
    requirements: [{ id: '70000000-0000-0000-0000-000000000001', codigo: '8.5.1', norma: 'ISO 9001:2015' }],
  });

  assert.ok(kanbanHtml.includes('aria-label="Vista Kanban"'));
  assert.ok(kanbanHtml.includes('data-action="inspect-finding"'));
  // CLIENT cannot mutate or sign recommendations
  assert.equal(kanbanHtml.includes('id="openNewFindingFormBtn"'), false);
  assert.equal(kanbanHtml.includes('id="signRecommendationForm"'), false);
  assert.equal(assertZeroUuidExposure(listHtml).compliant, true);
  assert.equal(assertZeroUuidExposure(kanbanHtml).compliant, true);

  // Verify detailed cert fixture stays well-formed
  assert.ok(INITIAL_CERTIFICADOS_DETAILED.length > 0);
});

test('Step 3.1.2 UniversalTemplate: enableCalendarMode renders 3-button switcher [calendar|grid|list] only when enabled', () => {
  const withCalHtml = renderUniversalTemplate<{ id: string; name: string }>({
    domainKey: 'calendario',
    title: 'Calendario Test',
    searchQuery: '',
    totalCount: 1,
    filteredCount: 1,
    viewMode: 'calendar',
    enableCalendarMode: true,
    customCalendarViewHtml: '<div id="customCalFixture">CAL_OK</div>',
    facetGroups: [],
    items: [{ id: '1', name: 'Campaña A' }],
    columns: [{ id: 'name', header: 'Nombre', renderCell: (x) => x.name }],
    renderCard: (x) => `<div>${x.name}</div>`,
  });

  assert.ok(withCalHtml.includes('data-view-mode="calendar"'));
  assert.ok(withCalHtml.includes('data-view-mode="grid"'));
  assert.ok(withCalHtml.includes('data-view-mode="list"'));
  assert.ok(withCalHtml.includes('aria-pressed="true"'));
  assert.ok(withCalHtml.includes('CAL_OK'));
  assert.equal(withCalHtml.includes('<span>Calendario</span>'), false);

  const withoutCalHtml = renderUniversalTemplate<{ id: string; name: string }>({
    domainKey: 'organizaciones',
    title: 'Orgs Test',
    searchQuery: '',
    totalCount: 1,
    filteredCount: 1,
    viewMode: 'grid',
    facetGroups: [],
    items: [{ id: '1', name: 'Org A' }],
    columns: [{ id: 'name', header: 'Nombre', renderCell: (x) => x.name }],
    renderCard: (x) => `<div>${x.name}</div>`,
  });

  assert.equal(withoutCalHtml.includes('data-view-mode="calendar"'), false);
  assert.ok(withoutCalHtml.includes('data-view-mode="grid"'));
  assert.ok(withoutCalHtml.includes('data-view-mode="list"'));
});

test('Step 3.1.2 Calendario 3-Modos: unified campaign events, MAX(numero_secuencia), PREPROGRAMADA_MES across Mes/Trimestre/Cronograma, Pendientes tray, Tarjetas, Tabla 6-col & 5 facets', () => {
  const programs = buildMultiCampaignFixture();
  const baseAudit = INITIAL_PROGRAMACION_AUDITS[0];

  // Add a 3rd program without dates (`SIN_FECHA`) to test "Pendientes de fecha" tray
  const unscheduledProgram: ProgramaAuditoriaEntity = {
    id: '10000000-0000-0000-0000-000000000203',
    codigo_programa: 'PRG-2026-PEND',
    etiqueta: 'Campaña Sin Fecha Asignada',
    nivel_vinculacion: 'INDIVIDUAL',
    tipo_vinculacion: 'Individual',
    es_vinculada: false,
    id_ciclo_origen: null,
    notas: null,
    auditorias: [
      {
        ...baseAudit,
        id: '20000000-0000-0000-0000-000000000104',
        codigo_auditoria: 'AUD-2026-PEND',
        id_programa_auditoria: '10000000-0000-0000-0000-000000000203',
        fecha_inicio: '',
        fecha_fin: '',
        fecha_reprogramacion: null,
        fechas: [],
        latestDate: null,
        sitiosPlan: [],
      },
    ],
    deleted_at: null,
  };
  const allPrograms = [...programs, unscheduledProgram];

  // 1. Default 'calendar' mode in July 2026 (matches Reprog. #2 of Nivel 1 fixture: 2026-07-14..16, NOT 2026-06-10)
  const monthHtml = renderCalendarioView({
    profile: ADMIN_PROFILE,
    state: {
      viewMode: 'calendar',
      displayMode: 'month',
      referenceYear: 2026,
      referenceMonth: 7,
      filterAuditorId: 'ALL',
      filterStandard: 'ALL',
      filterMethodology: 'ALL',
      drawerAuditId: null,
      query: '',
      isSidebarOpen: true,
      facetSelections: {},
      alertsPanelOpen: true,
      alertCategoryFilter: 'ALL',
    },
    audits: allPrograms.flatMap((p) => p.auditorias),
    auditors: INITIAL_AUDITORES_DETAILED,
    standards: [{ norma: 'ISO 9001:2015' }, { norma: 'ISO 14001:2015' }],
    programs: allPrograms,
  });

  // 3-mode presentation switcher + single text search + totalizer + 5 facets
  assert.ok(monthHtml.includes('data-mv-domain="calendario"'));
  assert.ok(monthHtml.includes('data-view-mode="calendar"'));
  assert.ok(monthHtml.includes('data-view-mode="grid"'));
  assert.ok(monthHtml.includes('data-view-mode="list"'));
  assert.equal(/type=["']search["']/i.test(monthHtml), false);
  assert.ok(monthHtml.includes('id="calendarioSearchInput"'));
  assert.ok(monthHtml.includes('Mostrando'));
  assert.ok(monthHtml.includes('campañas en agenda'));
  assert.ok(monthHtml.includes('data-facet-group="nivel_vinculacion"'));
  assert.ok(monthHtml.includes('data-facet-group="tipo_vinculacion"'));
  assert.ok(monthHtml.includes('data-facet-group="precision_fecha"'));
  assert.ok(monthHtml.includes('data-facet-group="tag_planificacion"'));
  assert.ok(monthHtml.includes('data-facet-group="alerta_activa"'));

  // Unified Nivel 1 campaign event + latest Reprog. #2 + span
  assert.ok(monthHtml.includes('PRG-2026-001'));
  assert.ok(monthHtml.includes('Integrada · 1 cert · 3.00d-aud / 3d cal.'));
  assert.ok(monthHtml.includes('Reprog. #2'));
  assert.ok(monthHtml.includes('data-action="select-cal-program"'));

  // Pendientes de fecha tray
  assert.ok(monthHtml.includes('id="calPendingDateTray"'));
  assert.ok(monthHtml.includes('Pendientes de fecha'));
  assert.ok(monthHtml.includes('PRG-2026-PEND'));

  // Old sequence #1 date (June 2026) must NOT appear in June month view
  const juneHtml = renderCalendarioView({
    profile: ADMIN_PROFILE,
    state: {
      viewMode: 'calendar',
      displayMode: 'month',
      referenceYear: 2026,
      referenceMonth: 6,
      filterAuditorId: 'ALL',
      filterStandard: 'ALL',
      filterMethodology: 'ALL',
      drawerAuditId: null,
    },
    audits: allPrograms.flatMap((p) => p.auditorias),
    auditors: INITIAL_AUDITORES_DETAILED,
    standards: [{ norma: 'ISO 9001:2015' }],
    programs: allPrograms,
  });
  assert.equal(juneHtml.includes('Integrada · 1 cert · 3.00d-aud / 3d cal.'), false);

  // September 2026: PREPROGRAMADA_MES rendered across Mes, Trimestre, and Cronograma
  for (const calScale of ['month', 'quarter', 'gantt'] as const) {
    const septHtml = renderCalendarioView({
      profile: ADMIN_PROFILE,
      state: {
        viewMode: 'calendar',
        displayMode: calScale,
        referenceYear: 2026,
        referenceMonth: 9,
        filterAuditorId: 'ALL',
        filterStandard: 'ALL',
        filterMethodology: 'ALL',
        drawerAuditId: null,
      },
      audits: allPrograms.flatMap((p) => p.auditorias),
      auditors: INITIAL_AUDITORES_DETAILED,
      standards: [{ norma: 'ISO 14001:2015' }],
      programs: allPrograms,
    });
    assert.ok(
      septHtml.includes('Mes estimado · Sin días exactos'),
      `Expected PREPROGRAMADA_MES distinction in ${calScale}`
    );
    assert.ok(
      septHtml.includes('PRG-2026-002'),
      `Expected Multientidad campaign in ${calScale}`
    );
    assert.equal(assertZeroUuidExposure(septHtml).compliant, true);
  }

  // Grid mode ('Tarjetas') respecting shared facets
  const gridHtml = renderCalendarioView({
    profile: ADMIN_PROFILE,
    state: {
      viewMode: 'grid',
      displayMode: 'month',
      referenceYear: 2026,
      referenceMonth: 9,
      filterAuditorId: 'ALL',
      filterStandard: 'ALL',
      filterMethodology: 'ALL',
      drawerAuditId: null,
      facetSelections: {
        precision_fecha: new Set(['PREPROGRAMADA_MES']),
      },
    },
    audits: allPrograms.flatMap((p) => p.auditorias),
    auditors: INITIAL_AUDITORES_DETAILED,
    standards: [{ norma: 'ISO 14001:2015' }],
    programs: allPrograms,
  });
  assert.ok(gridHtml.includes('PRG-2026-002'));
  assert.equal(gridHtml.includes('PRG-2026-001'), false);
  assert.equal(gridHtml.includes('PRG-2026-PEND'), false);

  // List mode ('Tabla'): strict 6-col table-fixed summing 100%, 0 <button> in <tbody>, clickable rows
  const listHtml = renderCalendarioView({
    profile: ADMIN_PROFILE,
    state: {
      viewMode: 'list',
      displayMode: 'month',
      referenceYear: 2026,
      referenceMonth: 9,
      filterAuditorId: 'ALL',
      filterStandard: 'ALL',
      filterMethodology: 'ALL',
      drawerAuditId: null,
      query: 'PRG-2026',
    },
    audits: allPrograms.flatMap((p) => p.auditorias),
    auditors: INITIAL_AUDITORES_DETAILED,
    standards: [{ norma: 'ISO 9001:2015' }],
    programs: allPrograms,
  });
  assertColgroup100(listHtml, 'calendario-main', 6);
  const calTbody = assertZeroButtonsInTbody(listHtml, 'Calendario List Table');
  assert.ok(calTbody.includes('data-action="select-cal-program"'));
  assert.ok(listHtml.includes('id="clearCalendarioSearchBtn"'));
  assert.equal(assertZeroUuidExposure(monthHtml).compliant, true);
  assert.equal(assertZeroUuidExposure(gridHtml).compliant, true);
  assert.equal(assertZeroUuidExposure(listHtml).compliant, true);
});

test('Step 3.1.2 Calendario Smart Alerts, Dynamic Threshold Recalculation & Strict RBAC (ADMIN/WORKER vs AUDITOR/CLIENT)', () => {
  const programs = buildMultiCampaignFixture();
  const allAudits = programs.flatMap((p) => p.auditorias);

  // Dynamic threshold test: PRG-2026-001 has latest REAL start 2026-07-14
  // With today = 2026-07-10:
  // - dias_aviso_proxima = 1 => 0 PROXIMA alerts (delta = 4d > 1)
  // - dias_aviso_proxima = 10 => 1 PROXIMA alert (delta = 4d <= 10)
  const tightConfig: AlertConfigEntity = {
    ...DEFAULT_AUDIT_ALERT_CONFIG,
    dias_aviso_proxima: 1,
    dias_aviso_preprogramada_sin_confirmar: 0,
  };
  const wideConfig: AlertConfigEntity = {
    ...DEFAULT_AUDIT_ALERT_CONFIG,
    dias_aviso_proxima: 10,
    dias_aviso_preprogramada_sin_confirmar: 0,
  };

  const tightAlerts = computeAuditAlerts(programs, tightConfig, '2026-07-10');
  const wideAlerts = computeAuditAlerts(programs, wideConfig, '2026-07-10');
  assert.equal(
    tightAlerts.filter((a) => a.category === 'PROXIMA').length,
    0
  );
  assert.equal(
    wideAlerts.filter((a) => a.category === 'PROXIMA').length,
    1
  );

  // ADMIN & WORKER see "Configurar Alertas" button and can open #alertConfigModalBackdrop
  for (const staffProfile of [ADMIN_PROFILE, WORKER_PROFILE]) {
    const staffHtml = renderCalendarioView({
      profile: staffProfile,
      state: {
        viewMode: 'calendar',
        displayMode: 'month',
        referenceYear: 2026,
        referenceMonth: 7,
        filterAuditorId: 'ALL',
        filterStandard: 'ALL',
        filterMethodology: 'ALL',
        drawerAuditId: null,
        alertsPanelOpen: true,
        alertCategoryFilter: 'ALL',
        isAlertConfigModalOpen: true,
      },
      audits: allAudits,
      auditors: INITIAL_AUDITORES_DETAILED,
      standards: [{ norma: 'ISO 9001:2015' }],
      programs,
      auditAlerts: wideAlerts,
      alertConfig: wideConfig,
    });
    assert.ok(staffHtml.includes('id="openAlertConfigModalBtn"'));
    assert.ok(staffHtml.includes('Configurar Alertas'));
    assert.ok(staffHtml.includes('id="alertConfigModalBackdrop"'));
    assert.ok(staffHtml.includes('id="alertConfigForm"'));
    assert.ok(staffHtml.includes('id="calSmartAlertsPanel"'));
    assert.ok(staffHtml.includes('Auditoría próxima en 4 día(s)'));
    assert.equal(assertZeroUuidExposure(staffHtml).compliant, true);
  }

  // AUDITOR must NOT have Configurar Alertas button or modal in DOM
  const auditorHtml = renderCalendarioView({
    profile: AUDITOR_PROFILE,
    state: {
      viewMode: 'calendar',
      displayMode: 'month',
      referenceYear: 2026,
      referenceMonth: 7,
      filterAuditorId: 'ALL',
      filterStandard: 'ALL',
      filterMethodology: 'ALL',
      drawerAuditId: null,
      isAlertConfigModalOpen: true,
    },
    audits: allAudits,
    auditors: INITIAL_AUDITORES_DETAILED,
    standards: [{ norma: 'ISO 9001:2015' }],
    programs,
    auditAlerts: wideAlerts,
    alertConfig: wideConfig,
  });
  assert.equal(auditorHtml.includes('openAlertConfigModalBtn'), false);
  assert.equal(auditorHtml.includes('Configurar Alertas'), false);
  assert.equal(auditorHtml.includes('alertConfigModalBackdrop'), false);

  // CLIENT must NOT have Configurar Alertas AND Nivel 2 Multientidad hides confidential Org B
  const authorizedOrgIds = ['30000000-0000-0000-0000-000000000001'];
  const clientScopedAudits = scopeProgramacionAuditsForProfile(
    allAudits,
    CLIENT_PROFILE,
    authorizedOrgIds
  );
  const clientScopedPrograms = scopeAuditProgramsForProfile(
    programs,
    CLIENT_PROFILE,
    clientScopedAudits
  );

  const clientCalHtml = renderCalendarioView({
    profile: CLIENT_PROFILE,
    state: {
      viewMode: 'calendar',
      displayMode: 'month',
      referenceYear: 2026,
      referenceMonth: 9,
      filterAuditorId: 'ALL',
      filterStandard: 'ALL',
      filterMethodology: 'ALL',
      drawerAuditId: null,
      isAlertConfigModalOpen: true,
    },
    audits: clientScopedAudits,
    auditors: INITIAL_AUDITORES_DETAILED,
    standards: [{ norma: 'ISO 14001:2015' }],
    programs: clientScopedPrograms,
    auditAlerts: wideAlerts,
    alertConfig: wideConfig,
  });
  assert.equal(clientCalHtml.includes('openAlertConfigModalBtn'), false);
  assert.equal(clientCalHtml.includes('Configurar Alertas'), false);
  assert.equal(clientCalHtml.includes('alertConfigModalBackdrop'), false);
  assert.ok(clientCalHtml.includes('Iberometal Componentes S.A.'));
  assert.equal(clientCalHtml.includes('Empresa Secreta Confidencial S.L.'), false);
  assert.equal(clientCalHtml.includes('FN-SEC-2026-999'), false);
  assert.equal(assertZeroUuidExposure(clientCalHtml).compliant, true);
});

