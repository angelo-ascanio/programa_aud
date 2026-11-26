import test from 'node:test';
import assert from 'node:assert/strict';

import type { UserProfile } from '../lib/healthCheck';
import type {
  CalendarioViewState,
  ProgramacionAuditEntity,
  ResultadoViewState,
} from '../lib/auditExecution';
import type { ProgramaAuditoriaEntity } from '../lib/auditPlanningEngine';
import type { ConglomeradoEntity } from '../lib/conglomeradoDomain';
import type { OrganizacionEntity } from '../lib/activeCertificates';
import type { CertificadoDetailEntity } from '../lib/multisiteSampling';
import { assertZeroUuidExposure } from '../lib/zeroUuid';
import { renderCalendarioView } from './calendarioView';
import { renderResultadoView } from './resultadoView';
import { DEFAULT_REVISION_STATE, renderRevisionView } from './revisionView';
import {
  DEFAULT_PROGRAMA_PROCESOS_STATE,
  renderProgramaProcesosView,
} from './programaProcesosView';
import {
  DEFAULT_PROGRAMA_TURNOS_STATE,
  renderProgramaTurnosView,
} from './programaTurnosView';
import { renderOrganizacionView } from './organizacionView';
import { renderCertificadoView } from './certificadoView';
import { renderCertificateHistoryPanel } from './auditPlannerView';
import { renderAuditSectionShell } from './auditSectionShell';
import { buildOrgCertPickerModalModel } from '../lib/orgMultiViewPickerDomain';
import { renderConglomeradoView } from './conglomeradoView';
import { renderAuditorView } from './auditorView';
import { renderExpertoTecnicoView } from './expertoTecnicoView';
import { renderRelacionView, DEFAULT_RELACION_STATE } from './relacionView';
import {
  renderDesignacionTipoView,
  DEFAULT_DESIGNACION_TIPO_STATE,
} from './designacionTipoView';
import {
  renderDesignacionFechaView,
  DEFAULT_DESIGNACION_FECHA_STATE,
} from './designacionFechaView';
import {
  renderDesignacionSitioView,
  DEFAULT_DESIGNACION_SITIO_STATE,
} from './designacionSitioView';
import {
  renderDesignacionTemporalView,
  DEFAULT_DESIGNACION_TEMPORAL_STATE,
} from './designacionTemporalView';
import { renderResumenView, DEFAULT_RESUMEN_STATE } from './resumenView';
import { renderVinculoView, DEFAULT_VINCULO_STATE } from './vinculoView';
import { resolveAuditNavigation } from '../lib/certificateAuditSelector';

const ADMIN_PROFILE: UserProfile = {
  id: '00000000-0000-0000-0000-000000000001',
  nombre: 'Admin Sistema',
  role: 'ADMIN',
  status: 'APPROVED',
  created_at: '2026-01-01T00:00:00Z',
};

const IDs = {
  cong: '20000000-0000-0000-0000-000000000071',
  org: '30000000-0000-0000-0000-000000000071',
  cert: '40000000-0000-0000-0000-000000000071',
  prog: '70000000-0000-0000-0000-000000000071',
  audit: '80000000-0000-0000-0000-000000000071',
  tipo: '60000000-0000-0000-0000-000000000071',
  norma: '50000000-0000-0000-0000-000000000071',
  site: '55000000-0000-0000-0000-000000000071',
};

const TEST_CONG: ConglomeradoEntity = {
  id: IDs.cong,
  codigo_grupo: 'CONG-SOL-01',
  nombre: 'Consorcio Empresarial Soluciones del Norte S.A.',
  abreviacion: 'SolNorte',
  es_individual_auto: false,
  notas: null,
};

const TEST_ORG: OrganizacionEntity = {
  id: IDs.org,
  id_grupo_empresarial: IDs.cong,
  grupo_empresarial_nombre: TEST_CONG.nombre,
  nombre: 'Aceros y Laminados de Precisión Centroamericanos S.A.',
  abreviacion: 'AcerosCA',
  rif: 'J-30112233-4',
  certificados_count: 1,
};

const TEST_AUDIT: ProgramacionAuditEntity = {
  id: IDs.audit,
  id_programa_auditoria: IDs.prog,
  codigo_auditoria: 'AUD-2026-IND-71',
  id_certificado: IDs.cert,
  numero_certificado: 'FN-QMS-2026-071',
  id_organizacion: IDs.org,
  organizacion_nombre: TEST_ORG.nombre,
  organizacion_abreviacion: TEST_ORG.abreviacion,
  norma_codigo: 'ISO 9001:2015',
  sector_iaf: 17,
  id_tipo_auditoria: IDs.tipo,
  tipo_auditoria: 'Seguimiento 1',
  metodologia: 'Presencial',
  fecha_inicio: '2026-09-14',
  fecha_fin: '2026-09-16',
  fechas: [
    {
      id: '81000000-0000-0000-0000-000000000071',
      id_auditoria: IDs.audit,
      numero_secuencia: 1,
      tag: 'Programación',
      tipo_fecha: 'PROGRAMADA_EXACTA',
      anio: null,
      mes: null,
      fecha_inicio: '2026-09-14',
      fecha_fin: '2026-09-16',
      observacion: null,
      deleted_at: null,
    },
  ],
  latestDate: null,
  dias_auditor: 2,
  tiempo_auditoria: 2,
  estatus: 'Planificada',
  estado_ciclo: 'Planificada',
  tiene_sitio_temporal: false,
  auditor_lider: 'Ing. Laura Méndez',
  equipo: [],
  sitiosMuestreo: [],
  sitiosPlan: [],
  matrizNormativa: [],
  deleted_at: null,
};

const TEST_PROGRAM: ProgramaAuditoriaEntity = {
  id: IDs.prog,
  id_grupo_empresarial: IDs.cong,
  codigo_programa: 'PRG-2026-071',
  etiqueta: 'Campaña Septiembre',
  nivel_vinculacion: 'INDIVIDUAL',
  tipo_vinculacion: 'Individual',
  es_vinculada: false,
  tiene_sitio_temporal: false,
  auditorias: [TEST_AUDIT],
  notas: null,
  deleted_at: null,
};

const TEST_CERT: CertificadoDetailEntity = {
  id: IDs.cert,
  id_organizacion: IDs.org,
  organizacion_nombre: TEST_ORG.nombre,
  organizacion_abreviacion: TEST_ORG.abreviacion,
  numero_certificado: 'FN-QMS-2026-071',
  id_norma: IDs.norma,
  norma_codigo: 'ISO 9001:2015',
  norma_nombre: 'Sistemas de Gestión de Calidad',
  id_estatus: '12000000-0000-0000-0000-000000000001',
  estatus: 'Activo',
  multisitio: false,
  id_sector_iaf: '14000000-0000-0000-0000-000000000017',
  sector_iaf: 17,
  sector_iaf_descripcion: 'Metales básicos y productos metálicos',
  alcance: 'Fabricación y laminado de acero estructural.',
  fecha_emision: '2025-09-01',
  fecha_vencimiento: '2028-08-31',
  sitios: [
    {
      id: IDs.site,
      id_certificado: IDs.cert,
      numero_sitio: 0,
      nombre_sitio: 'Planta Principal Norte',
      total_empleados: 80,
      procesos_por_sitio: [],
      turnos_por_sitio: [],
    },
  ],
  procesos: [],
  turnos: [],
  noAplicables: [],
  fechasHistoricas: [],
  contactos: [],
  auditorias: [
    {
      id: IDs.audit,
      id_certificado: IDs.cert,
      codigo_auditoria: 'AUD-2026-IND-71',
      tipo_auditoria: 'Seguimiento 1',
      metodologia: 'Presencial',
      fecha_programacion: '2026-09-14',
      auditor_lider: 'Ing. Laura Méndez',
      estatus: 'Planificada',
    },
  ],
};

function assertTableInvariants(html: string, label: string): void {
  assert.equal(assertZeroUuidExposure(html).compliant, true, `${label}: zero UUID exposure`);
  const tbodies = [...html.matchAll(/<tbody[\s\S]*?<\/tbody>/gi)].map((m) => m[0]);
  for (const tbody of tbodies) {
    assert.equal(/<button\b/i.test(tbody), false, `${label}: 0 <button> in <tbody>`);
  }
  const tables = [...html.matchAll(/<table[\s\S]*?<\/table>/gi)].map((m) => m[0]);
  for (const tbl of tables) {
    const colgroup = tbl.match(/<colgroup>([\s\S]*?)<\/colgroup>/i);
    if (!colgroup) continue;
    const widths = [...colgroup[1].matchAll(/width:\s*([\d.]+)%/g)].map((m) => Number(m[1]));
    if (widths.length > 0) {
      const sum = widths.reduce((a, b) => a + b, 0);
      assert.ok(Math.abs(sum - 100) < 0.05, `${label}: colgroup sum expected 100%, got ${sum}`);
    }
  }
}

test('Step 5.1: Calendario Multi & Drawer render compact codenames, short org names, and preserve AUD tooltip', () => {
  const calState: CalendarioViewState = {
    displayMode: 'list',
    viewMode: 'list',
    referenceYear: 2026,
    referenceMonth: 9,
    filterAuditorId: 'ALL',
    filterStandard: 'ALL',
    filterMethodology: 'ALL',
    drawerAuditId: IDs.audit,
    query: '',
    isSidebarOpen: false,
    facetSelections: {},
  };
  const html = renderCalendarioView({
    profile: ADMIN_PROFILE,
    state: calState,
    audits: [TEST_AUDIT],
    auditors: [],
    standards: [{ norma: 'ISO 9001:2015' }],
    programs: [TEST_PROGRAM],
    certificados: [TEST_CERT],
  });

  assert.ok(html.includes('2026-09 Seg.1'));
  assert.ok(html.includes('AcerosCA'));
  assert.ok(html.includes('title="AUD-2026-IND-71'));
  assert.ok(html.includes(`title="${TEST_ORG.nombre}"`));
  assertTableInvariants(html, 'calendarioView');
});

test('Step 5.1: Resultado & Revisión Multi Views + Pop-up Modals render compact latestAuditCodename + short org name + tooltip', () => {
  const resState: ResultadoViewState = {
    selectedCertId: null,
    selectedAuditId: 'ALL',
    activeAuditIdForDecision: IDs.audit,
    displayMode: 'list',
    filterType: 'ALL',
    filterLifecycle: 'ALL',
    searchQuery: '',
    isLoggingFinding: false,
    inspectingFindingId: null,
    isSidebarOpen: false,
    facetSelections: {},
    pickerOrgId: IDs.org,
  };
  const resHtml = renderResultadoView({
    profile: ADMIN_PROFILE,
    state: resState,
    audits: [TEST_AUDIT],
    findings: [],
    processes: [],
    requirements: [],
    programs: [TEST_PROGRAM],
    certificados: [TEST_CERT],
  });
  assert.ok(resHtml.includes('2026-09 Seg.1'));
  assert.ok(resHtml.includes('AcerosCA'));
  assert.ok(resHtml.includes('title="AUD-2026-IND-71'));
  assertTableInvariants(resHtml, 'resultadoView');

  const revHtml = renderRevisionView({
    profile: ADMIN_PROFILE,
    state: { ...DEFAULT_REVISION_STATE, isSidebarOpen: false, pickerOrgId: IDs.org },
    audits: [TEST_AUDIT],
    findings: [],
    actorNameById: new Map(),
    programs: [TEST_PROGRAM],
    certificados: [TEST_CERT],
  });
  assert.ok(revHtml.includes('2026-09 Seg.1'));
  assert.ok(revHtml.includes('AcerosCA'));
  assert.ok(revHtml.includes('title="AUD-2026-IND-71'));
  assertTableInvariants(revHtml, 'revisionView');
});

test('Step 5.1: Programa Procesos & Programa Turnos Multi Views + Pop-up Modals render compact codename, short org name, and tooltip', () => {
  const procHtml = renderProgramaProcesosView({
    profile: ADMIN_PROFILE,
    state: { ...DEFAULT_PROGRAMA_PROCESOS_STATE, isSidebarOpen: false, pickerOrgId: IDs.org },
    audits: [TEST_AUDIT],
    programs: [TEST_PROGRAM],
    certificados: [TEST_CERT],
  });
  assert.ok(procHtml.includes('2026-09 Seg.1'));
  assert.ok(procHtml.includes('AcerosCA'));
  assert.ok(procHtml.includes('title="AUD-2026-IND-71'));
  assertTableInvariants(procHtml, 'programaProcesosView');

  const turnoHtml = renderProgramaTurnosView({
    profile: ADMIN_PROFILE,
    state: { ...DEFAULT_PROGRAMA_TURNOS_STATE, isSidebarOpen: false, pickerOrgId: IDs.org },
    audits: [TEST_AUDIT],
    programs: [TEST_PROGRAM],
    certificados: [TEST_CERT],
  });
  assert.ok(turnoHtml.includes('2026-09 Seg.1'));
  assert.ok(turnoHtml.includes('AcerosCA'));
  assert.ok(turnoHtml.includes('title="AUD-2026-IND-71'));
  assertTableInvariants(turnoHtml, 'programaTurnosView');
});

test('Step 5.1: Organización & Certificado Detail Views + AuditPlanner show short Conglomerado/Org names and compact codenames', () => {
  const orgHtml = renderOrganizacionView({
    profile: ADMIN_PROFILE,
    state: {
      selectedOrganizacionId: IDs.org,
      query: '',
      hasActiveCertificates: 'ALL',
      selectedSectorIaf: 'ALL',
      viewMode: 'list',
      sortColumn: null,
      sortDirection: 'none',
      isEditingAttributes: false,
      activeChildTab: 'auditorias',
    },
    organizaciones: [TEST_ORG],
    conglomerados: [TEST_CONG],
    certificados: [],
    allCertificadosDetailed: [TEST_CERT],
    auditorias: [TEST_AUDIT],
  });
  assert.ok(orgHtml.includes('SolNorte'));
  assert.ok(orgHtml.includes('2026-09 Seg.1'));
  assert.ok(orgHtml.includes('title="AUD-2026-IND-71'));
  assertTableInvariants(orgHtml, 'organizacionView');

  const certHtml = renderCertificadoView({
    profile: ADMIN_PROFILE,
    state: {
      selectedCertId: IDs.cert,
      activeChildTab: 'auditorias',
      query: '',
      selectedStandard: 'ALL',
      selectedStatus: 'ALL',
      selectedSectorIaf: 'ALL',
      viewMode: 'list',
      sortColumn: null,
      sortDirection: 'none',
      isEditingAttributes: false,
    },
    certificates: [TEST_CERT],
    organizaciones: [TEST_ORG],
    conglomerados: [TEST_CONG],
  });
  assert.ok(certHtml.includes('SolNorte'));
  assert.ok(certHtml.includes('2026-09 Seg.1'));
  assert.ok(certHtml.includes('data-audit-code="AUD-2026-IND-71"'));
  assertTableInvariants(certHtml, 'certificadoView');

  const historyHtml = renderCertificateHistoryPanel({
    certId: IDs.cert,
    certNumber: TEST_CERT.numero_certificado,
    orgName: TEST_ORG.nombre,
    normaCode: 'ISO 9001:2015',
    currentAuditId: null,
    currentProgram: null,
    allPrograms: [TEST_PROGRAM],
    certDetail: TEST_CERT,
    isOpen: true,
  });
  assert.ok(historyHtml.includes('2026-09 Seg.1'));
  assert.ok(historyHtml.includes('title="AUD-2026-IND-71'));
  assert.equal(assertZeroUuidExposure(historyHtml).compliant, true);
});

test('Step 5.1: auditSectionShell & orgMultiViewPickerDomain prioritize compact codenames and program labels with codes in tooltips', () => {
  const linkedProgram: ProgramaAuditoriaEntity = {
    ...TEST_PROGRAM,
    codigo_programa: 'L-AUD-2026-071',
    etiqueta: 'Lote QMS+EMS Septiembre',
    tipo_vinculacion: 'Integrada',
    es_vinculada: true,
  };
  const navigation = resolveAuditNavigation(IDs.cert, IDs.audit, [TEST_AUDIT]);
  const shellHtml = renderAuditSectionShell({
    sectionTitle: 'Tipo',
    sectionSymbol: '🏷️',
    backSubview: 'designacion/tipo',
    certInfo: {
      id: IDs.cert,
      id_organizacion: IDs.org,
      numero_certificado: TEST_CERT.numero_certificado,
      organizacion_nombre: TEST_ORG.nombre,
      organizacion_abreviacion: TEST_ORG.abreviacion,
      norma_codigo: 'ISO 9001:2015',
      estatus: 'Activo',
      version_numero: 1,
      alcance_es: TEST_CERT.alcance,
    },
    certificados: [TEST_CERT],
    navigation,
    programs: [linkedProgram],
    isStaff: true,
    tableName: 'auditoria',
    bodyHtml: '<div>Contenido</div>',
  });

  assert.match(shellHtml, /data-testid="shell-audit-code"[^>]*>2026-09 Seg\.1<\/span>/);
  assert.ok(shellHtml.includes('title="Código de Auditoría: AUD-2026-IND-71'));
  assert.match(shellHtml, /data-testid="shell-program-code"[^>]*>Lote QMS\+EMS Septiembre<\/span>/);
  assert.ok(shellHtml.includes('title="Programa Vinculado: L-AUD-2026-071"'));
  assert.equal(assertZeroUuidExposure(shellHtml).compliant, true);

  const siblingCertId = '40000000-0000-0000-0000-000000000072';
  const siblingAudit: ProgramacionAuditEntity = {
    ...TEST_AUDIT,
    id: '80000000-0000-0000-0000-000000000072',
    codigo_auditoria: 'AUD-2026-EMS-72',
    id_certificado: siblingCertId,
    numero_certificado: 'FN-EMS-2026-072',
    norma_codigo: 'ISO 14001:2015',
  };
  const modalModel = buildOrgCertPickerModalModel({
    orgId: IDs.org,
    profile: ADMIN_PROFILE,
    organizaciones: [TEST_ORG],
    conglomerados: [TEST_CONG],
    certificados: [
      TEST_CERT,
      { ...TEST_CERT, id: siblingCertId, numero_certificado: 'FN-EMS-2026-072', norma_codigo: 'ISO 14001:2015' },
    ],
    audits: [TEST_AUDIT, siblingAudit],
    programs: [{ ...linkedProgram, auditorias: [TEST_AUDIT, siblingAudit] }],
    groupingMode: 'audit',
    modalSearchQuery: 'L-AUD-2026-071',
  });
  assert.ok(modalModel);
  assert.equal(modalModel.rows.length, 2);
  assert.equal(modalModel.rows[0].groupSubLabel.includes('L-AUD-'), false);
  assert.equal(modalModel.rows[0].groupSubLabel.includes('AUD-'), false);
  assert.ok(modalModel.rows[0].groupSubLabel.includes('2026-09 Seg.1'));
  assert.ok(modalModel.rows[0].groupLabel.includes('L-AUD-2026-071'));
});

test('Step 5.1: Conglomerado view renders editable abreviacion and Auditor/Experto historial render compact codenames + short orgs', () => {
  const congCreateHtml = renderConglomeradoView({
    profile: ADMIN_PROFILE,
    state: {
      selectedConglomeradoId: null,
      query: '',
      viewMode: 'list',
      sortColumn: null,
      sortDirection: 'none',
      isEditingAttributes: false,
      activeChildTab: 'organizaciones',
      isSidebarOpen: false,
      facetSelections: {},
      isCreating: true,
      formDraft: {
        nombre: 'Holding Corporativo Andino',
        abreviacion: 'HCA',
        codigo_grupo: 'CONG-HCA-01',
        notas: '',
      },
    },
    conglomerados: [{ ...TEST_CONG, totalOrganizaciones: 1, totalCertificadosActivos: 1, organizaciones: [TEST_ORG] }],
    allOrganizaciones: [TEST_ORG],
  });
  assert.ok(congCreateHtml.includes('id="conglomeradoAbreviacionInput"'));
  assert.ok(congCreateHtml.includes('maxlength="24"'));
  assert.ok(congCreateHtml.includes('value="HCA"'));
  assertTableInvariants(congCreateHtml, 'conglomeradoCreate');

  const audHtml = renderAuditorView({
    profile: ADMIN_PROFILE,
    state: {
      selectedAuditorId: '10000000-0000-0000-0000-000000000071',
      query: '',
      selectedNorma: 'ALL',
      selectedSectorIaf: 'ALL',
      selectedSubsectorIaf: 'ALL',
      selectedCalificacion: 'ALL',
      viewMode: 'list',
      sortColumn: null,
      sortDirection: 'none',
      isEditingAttributes: false,
      activeChildTab: 'historial',
    },
    auditors: [
      {
        id: '10000000-0000-0000-0000-000000000071',
        nombre: 'Ing. Laura Méndez',
        titulo_profesional: 'Ingeniera Industrial',
        codigo_credencial: 'AUD-CRED-71',
        email: 'laura@fondonorma.org',
        telefono: '+58-412-0000001',
        biografia: 'Auditora líder',
        instituto_registro: 'IRCA',
        categoria_profesional: 'Líder',
        calificacion: 'Vigente',
        normas_acreditadas: ['ISO 9001:2015'],
        sectores_iaf: [17],
        competencias: [],
        historialAuditorias: [
          {
            id: IDs.audit,
            id_auditor: '10000000-0000-0000-0000-000000000071',
            codigo_auditoria: 'AUD-2026-IND-71',
            organizacion_nombre: TEST_ORG.nombre,
            numero_certificado: TEST_CERT.numero_certificado,
            norma_codigo: 'ISO 9001:2015',
            tipo_auditoria: 'Seguimiento 1',
            metodologia: 'Presencial',
            rol_en_auditoria: 'Auditor Líder',
            fecha_ejecucion: '2026-09-14',
            estatus: 'Planificada',
          },
        ],
      },
    ],
  });
  assert.ok(audHtml.includes('2026-09 Seg.1'));
  assert.ok(audHtml.includes('Aceros y Laminados'));
  assert.ok(audHtml.includes('title="AUD-2026-IND-71'));
  assert.ok(audHtml.includes(`title="${TEST_ORG.nombre}"`));
  assertTableInvariants(audHtml, 'auditorHistorial');

  const expHtml = renderExpertoTecnicoView({
    profile: ADMIN_PROFILE,
    state: {
      selectedExpertoId: '15000000-0000-0000-0000-000000000071',
      query: '',
      selectedEstatus: 'ALL',
      selectedSectorIaf: 'ALL',
      selectedSubsectorIaf: 'ALL',
      viewMode: 'list',
      sortColumn: null,
      sortDirection: 'none',
      isEditingAttributes: false,
      activeChildTab: 'historial',
    },
    expertos: [
      {
        id: '15000000-0000-0000-0000-000000000071',
        nombre: 'Dr. Carlos Rivas',
        estatus: 'Disponible',
        notas: null,
        telefonos: [],
        emails: [],
        sectorLinks: [],
        subsectorLinks: [],
        historialAuditorias: [
          {
            id: '16000000-0000-0000-0000-000000000071',
            id_auditoria: IDs.audit,
            id_experto_tecnico: '15000000-0000-0000-0000-000000000071',
            codigo_auditoria: 'AUD-2026-IND-71',
            organizacion_nombre: TEST_ORG.nombre,
            numero_certificado: TEST_CERT.numero_certificado,
            dias_asignados: 1.5,
            observacion: null,
            estatus: 'Planificada',
            tipo_auditoria: 'Seguimiento 1',
          },
        ],
      },
    ],
  });
  assert.ok(expHtml.includes('Sin fecha Seg.1'));
  assert.ok(expHtml.includes('Aceros y Laminados'));
  assert.ok(expHtml.includes('title="AUD-2026-IND-71'));
  assert.ok(expHtml.includes(`title="${TEST_ORG.nombre}"`));
  assertTableInvariants(expHtml, 'expertoHistorial');
});

test('Step 5.1: Multi View headers use concise Less-Is-More Spanish subtitles and preserve table invariants', () => {
  const relHtml = renderRelacionView({
    profile: ADMIN_PROFILE,
    state: { ...DEFAULT_RELACION_STATE, isSidebarOpen: false },
    conglomerados: [TEST_CONG],
    organizaciones: [TEST_ORG],
    certificados: [TEST_CERT],
    vinculos: [],
    programs: [TEST_PROGRAM],
    audits: [TEST_AUDIT],
  });
  assert.ok(relHtml.includes('Defina la relación de auditoría por organización y certificado.'));
  assertTableInvariants(relHtml, 'relacionMulti');

  const tipoHtml = renderDesignacionTipoView({
    profile: ADMIN_PROFILE,
    state: { ...DEFAULT_DESIGNACION_TIPO_STATE, isSidebarOpen: false },
    conglomerados: [TEST_CONG],
    organizaciones: [TEST_ORG],
    certificados: [TEST_CERT],
    tiposCatalog: [],
    audits: [TEST_AUDIT],
    programs: [TEST_PROGRAM],
  });
  assert.ok(tipoHtml.includes('Asigne el tipo de auditoría por organización y certificado.'));
  assertTableInvariants(tipoHtml, 'tipoMulti');

  const fechaHtml = renderDesignacionFechaView({
    profile: ADMIN_PROFILE,
    state: { ...DEFAULT_DESIGNACION_FECHA_STATE, isSidebarOpen: false },
    conglomerados: [TEST_CONG],
    organizaciones: [TEST_ORG],
    detailedCerts: [TEST_CERT],
    audits: [TEST_AUDIT],
    programs: [TEST_PROGRAM],
  });
  assert.ok(fechaHtml.includes('Defina las fechas programadas por organización y certificado.'));
  assertTableInvariants(fechaHtml, 'fechaMulti');

  const sitioHtml = renderDesignacionSitioView({
    profile: ADMIN_PROFILE,
    state: { ...DEFAULT_DESIGNACION_SITIO_STATE, isSidebarOpen: false },
    conglomerados: [TEST_CONG],
    organizaciones: [TEST_ORG],
    certificados: [TEST_CERT],
    vinculos: [],
    allAudits: [TEST_AUDIT],
    programs: [TEST_PROGRAM],
  });
  assert.ok(sitioHtml.includes('Designe los sitios permanentes por organización y certificado.'));
  assertTableInvariants(sitioHtml, 'sitioMulti');

  const tempHtml = renderDesignacionTemporalView({
    profile: ADMIN_PROFILE,
    state: { ...DEFAULT_DESIGNACION_TEMPORAL_STATE, isSidebarOpen: false },
    conglomerados: [TEST_CONG],
    organizaciones: [TEST_ORG],
    certificados: [TEST_CERT],
    audits: [TEST_AUDIT],
    programs: [TEST_PROGRAM],
    vinculos: [],
    temporalSites: [],
  });
  assert.ok(tempHtml.includes('Gestione los sitios temporales por organización y certificado.'));
  assertTableInvariants(tempHtml, 'temporalMulti');

  const resHtml = renderResumenView({
    profile: ADMIN_PROFILE,
    state: { ...DEFAULT_RESUMEN_STATE, isSidebarOpen: false },
    conglomerados: [TEST_CONG],
    organizaciones: [TEST_ORG],
    certificados: [TEST_CERT],
    audits: [TEST_AUDIT],
    programs: [TEST_PROGRAM],
  });
  assertTableInvariants(resHtml, 'resumenMulti');

  const vincHtml = renderVinculoView({
    profile: ADMIN_PROFILE,
    state: { ...DEFAULT_VINCULO_STATE, isSidebarOpen: false },
    conglomerados: [TEST_CONG],
    organizaciones: [TEST_ORG],
    certificados: [TEST_CERT],
    vinculos: [],
    auditPrograms: [TEST_PROGRAM],
    programacionAudits: [TEST_AUDIT],
  });
  assert.ok(vincHtml.includes('Organizaciones, certificados agrupados o LIBRE y cajas por conglomerado.'));
  assertTableInvariants(vincHtml, 'vinculoMulti');
});
