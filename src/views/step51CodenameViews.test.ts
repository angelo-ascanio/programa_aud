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
