import test from 'node:test';
import assert from 'node:assert/strict';
import type { UserProfile } from './healthCheck';
import { INITIAL_ORGANIZACIONES } from './activeCertificates';
import { INITIAL_CERTIFICADOS_DETAILED } from './multisiteSampling';
import { INITIAL_AUDITORES_DETAILED } from './competencyMatrix';
import { INITIAL_PROGRAMACION_AUDITS, INITIAL_PHASE5_FINDINGS } from './auditExecution';
import {
  INITIAL_NORMAS,
  INITIAL_ACREDITACIONES,
  INITIAL_ORGANISMOS,
  INITIAL_REQUISITOS_LTREE,
  INITIAL_SECTORES_IAF,
  INITIAL_SUBSECTORES_IAF,
  INITIAL_ESTATUS_CATALOG,
  INITIAL_TIPOS_AUDITORIA_CATALOG,
  INITIAL_METODOLOGIAS_CATALOG,
} from './extraDomain';
import { SAMPLE_CERTIFICATE_RECORDS } from './searchControls';
import { assertZeroUuidExposure } from './zeroUuid';
import { renderOrganizacionView } from '../views/organizacionView';
import { renderCertificadoView } from '../views/certificadoView';
import { renderAuditorView } from '../views/auditorView';
import { renderProgramacionView } from '../views/programacionView';
import { renderCalendarioView } from '../views/calendarioView';
import { renderResultadoView } from '../views/resultadoView';
import { renderNormaView } from '../views/normaView';
import { renderSectorIafView } from '../views/sectorIafView';
import { renderEstatusView } from '../views/estatusView';
import { renderTipoAuditoriaView } from '../views/tipoAuditoriaView';
import { renderMetodologiaAuditoriaView } from '../views/metodologiaAuditoriaView';

const ADMIN_PROFILE: UserProfile = {
  id: '00000000-0000-0000-0000-000000000099',
  nombre: 'Admin Pruebas',
  role: 'ADMIN',
  status: 'APPROVED',
  created_at: '2025-01-01T00:00:00Z',
};

const CLIENT_PROFILE: UserProfile = {
  id: '00000000-0000-0000-0000-000000000098',
  nombre: 'Cliente Pruebas',
  role: 'CLIENT',
  status: 'APPROVED',
  created_at: '2025-01-01T00:00:00Z',
};

function assertMultiViewCompliance(html: string, domainKey: string, entityLabel: string): void {
  assert.ok(html.includes(`data-mv-domain="${domainKey}"`), `Missing data-mv-domain="${domainKey}"`);
  assert.ok(html.includes('rounded-2xl'), `Missing single-card container in ${domainKey}`);
  assert.equal(/type=["']search["']/i.test(html), false, `Found forbidden type="search" in ${domainKey}`);
  assert.ok(html.includes('type="text"'), `Missing type="text" search input in ${domainKey}`);
  assert.ok(html.includes('data-toggle-sidebar="true"'), `Missing sidebar toggle in ${domainKey}`);
  assert.ok(html.includes('aria-label="Filtros"'), `Missing icon-only Filtros aria-label in ${domainKey}`);
  assert.equal(html.includes('<span>Filtros</span>'), false, `Unexpected Filtros text label in ${domainKey}`);
  assert.ok(html.includes('data-facet-checkbox="true"'), `Missing checkbox facets in ${domainKey}`);
  assert.ok(html.includes('Mostrando'), `Missing Mostrando totalizer in ${domainKey}`);
  assert.ok(html.includes(entityLabel), `Missing entity label "${entityLabel}" in ${domainKey}`);
  assert.ok(html.includes('data-view-mode="grid"'), `Missing Tarjetas switcher in ${domainKey}`);
  assert.ok(html.includes('data-view-mode="list"'), `Missing Tabla switcher in ${domainKey}`);
  assert.equal(html.includes('<span>Tarjetas</span>'), false, `Unexpected Tarjetas text label in ${domainKey}`);
  assert.equal(html.includes('<span>Tabla</span>'), false, `Unexpected Tabla text label in ${domainKey}`);
  assert.equal(
    assertZeroUuidExposure(html).compliant,
    true,
    `Zero-UUID exposure failed in ${domainKey}`
  );
}

test('Phase 4.1.2 Batch A1 + Step 3.1: Organizaciones Clientes directory uses Universal Multi View Clean List, Detail Add mode, and collapsed sidebar', () => {
  const html = renderOrganizacionView({
    profile: ADMIN_PROFILE,
    state: {
      selectedOrganizacionId: null,
      query: '',
      hasActiveCertificates: 'ALL',
      selectedSectorIaf: 'ALL',
      viewMode: 'list',
      sortColumn: null,
      sortDirection: 'none',
      isEditingAttributes: false,
      activeChildTab: 'certificados',
      isSidebarOpen: true,
      facetSelections: { vigencia: new Set(['WITH_ACTIVE']) },
      isCreating: false,
    },
    organizaciones: INITIAL_ORGANIZACIONES,
    certificados: SAMPLE_CERTIFICATE_RECORDS,
  });

  assert.ok(html.includes('Organizaciones Clientes'));
  assertMultiViewCompliance(html, 'organizaciones', 'organizaciones');
  assert.ok(html.includes('data-action="open-create-org"'));
  assert.equal(html.includes('id="createOrganizacionForm"'), false);
  assert.equal(html.includes('data-col-header="acciones"'), false);
  assert.ok(html.includes('data-resizable-table="cert-organizaciones-main"'));
  const colHeaders = html.match(/data-col-header="[^"]+"/g) ?? [];
  assert.deepEqual(colHeaders, [
    'data-col-header="nombre"',
    'data-col-header="abreviacion"',
    'data-col-header="rif"',
    'data-col-header="direccion_fiscal"',
    'data-col-header="certificados_count"',
  ]);
  assert.ok(html.includes('data-facet-group="vigencia"'));
  assert.ok(html.includes('data-facet-group="sector_iaf"'));
  assert.ok(html.includes('aria-expanded="true"'));

  const addHtml = renderOrganizacionView({
    profile: ADMIN_PROFILE,
    state: {
      selectedOrganizacionId: null,
      query: '',
      hasActiveCertificates: 'ALL',
      selectedSectorIaf: 'ALL',
      viewMode: 'grid',
      sortColumn: null,
      sortDirection: 'none',
      isEditingAttributes: false,
      activeChildTab: 'certificados',
      isCreating: true,
    },
    organizaciones: INITIAL_ORGANIZACIONES,
    certificados: SAMPLE_CERTIFICATE_RECORDS,
  });
  assert.ok(addHtml.includes('id="organizacionDetailForm"'));
  assert.ok(addHtml.includes('id="saveOrgFormBtn"'));
  assert.ok(addHtml.includes('id="cancelEditOrgBtn"'));
  assert.equal(addHtml.includes('id="createOrganizacionForm"'), false);

  const collapsed = renderOrganizacionView({
    profile: CLIENT_PROFILE,
    state: {
      selectedOrganizacionId: null,
      query: '',
      hasActiveCertificates: 'ALL',
      selectedSectorIaf: 'ALL',
      viewMode: 'list',
      sortColumn: null,
      sortDirection: 'none',
      isEditingAttributes: false,
      activeChildTab: 'certificados',
      isSidebarOpen: false,
      facetSelections: {},
      isCreating: true,
    },
    organizaciones: INITIAL_ORGANIZACIONES,
    certificados: SAMPLE_CERTIFICATE_RECORDS,
  });

  assert.equal(collapsed.includes('data-action="open-create-org"'), false);
  assert.equal(collapsed.includes('id="organizacionDetailForm"'), false);
  assert.ok(collapsed.includes('aria-hidden="true"'));
  assert.ok(collapsed.includes('class="hidden"'));
});

test('Phase 4.1.2 Batch A2 + Step 2.1: Certificados de Conformidad enforces 6-column resizable Clean List and full-row click', () => {
  const html = renderCertificadoView({
    profile: ADMIN_PROFILE,
    state: {
      selectedCertId: null,
      activeChildTab: 'sitios',
      query: '',
      selectedStandard: 'ALL',
      selectedStatus: 'ALL',
      selectedSectorIaf: 'ALL',
      viewMode: 'list',
      sortColumn: null,
      sortDirection: 'none',
      isEditingAttributes: false,
      isSidebarOpen: true,
      facetSelections: {},
      isCreating: false,
    },
    certificates: INITIAL_CERTIFICADOS_DETAILED,
    organizaciones: INITIAL_ORGANIZACIONES,
  });

  assert.ok(html.includes('Certificados de Conformidad'));
  assertMultiViewCompliance(html, 'certificados', 'certificados');
  assert.ok(html.includes('data-action="open-create-cert"'));
  assert.equal(html.includes('id="createCertificadoForm"'), false);
  assert.ok(html.includes('data-facet-group="estatus"'));
  assert.ok(html.includes('data-facet-group="norma"'));
  assert.ok(html.includes('data-facet-group="sector_iaf"'));
  assert.ok(html.includes('data-facet-group="modalidad"'));
  assert.equal(html.includes('Cobertura Normativa'), false);
  assert.equal(html.includes('Cobertura ISO'), false);

  // Step 2.1: Exact 6 columns, zero "Acciones" column, zero inner cell buttons
  assert.ok(html.includes('data-resizable-table="certificados-main"'));
  const colHeaderMatches = html.match(/data-col-header="[^"]+"/g) ?? [];
  assert.deepEqual(colHeaderMatches, [
    'data-col-header="organizacion"',
    'data-col-header="numero_certificado"',
    'data-col-header="norma"',
    'data-col-header="sedes"',
    'data-col-header="estatus"',
    'data-col-header="vigencia"',
  ]);
  assert.equal(html.includes('data-col-header="acciones"'), false);
  assert.equal(html.includes('Inspeccionar'), false);
  assert.equal(html.includes('view-org-from-cert'), false);

  // Calibrated <colgroup> defaults summing to 100%
  assert.ok(html.includes('data-col-id="organizacion" data-min-width="140" style="width: 23.00%;"'));
  assert.ok(html.includes('data-col-id="numero_certificado" data-min-width="120" style="width: 19.00%;"'));
  assert.ok(html.includes('data-col-id="norma" data-min-width="100" style="width: 16.00%;"'));
  assert.ok(html.includes('data-col-id="sedes" data-min-width="110" style="width: 17.00%;"'));
  assert.ok(html.includes('data-col-id="estatus" data-min-width="95" style="width: 13.00%;"'));
  assert.ok(html.includes('data-col-id="vigencia" data-min-width="95" style="width: 12.00%;"'));

  // Zero interactive controls inside <tbody> and full-row click on <tr>
  const tbodyMatch = html.match(/<tbody[\s\S]*?<\/tbody>/);
  assert.ok(tbodyMatch, 'List view should render a <tbody>');
  const tbodyHtml = tbodyMatch[0];
  assert.equal(/<(button|a|input)\b/i.test(tbodyHtml), false);
  assert.ok(tbodyHtml.includes('<tr data-action="select-cert"'));
  assert.ok(tbodyHtml.includes('tabindex="0"'));

  // Persisted column widths override defaults cleanly
  const resizedHtml = renderCertificadoView({
    profile: ADMIN_PROFILE,
    state: {
      selectedCertId: null,
      activeChildTab: 'sitios',
      query: '',
      selectedStandard: 'ALL',
      selectedStatus: 'ALL',
      selectedSectorIaf: 'ALL',
      viewMode: 'list',
      sortColumn: null,
      sortDirection: 'none',
      isEditingAttributes: false,
      isSidebarOpen: false,
      facetSelections: {},
    },
    certificates: INITIAL_CERTIFICADOS_DETAILED,
    organizaciones: INITIAL_ORGANIZACIONES,
    columnWidths: {
      organizacion: 34,
      numero_certificado: 16,
      norma: 15,
      sedes: 12,
      estatus: 10,
      vigencia: 13,
    },
  });
  assert.ok(resizedHtml.includes('data-col-id="organizacion" data-min-width="140" style="width: 34.00%;"'));
  assert.ok(resizedHtml.includes('data-col-id="numero_certificado" data-min-width="120" style="width: 16.00%;"'));

  // Post-roadmap polish: icon-only Nuevo Certificado button and clean grid cards without "Ver Ficha"
  const gridHtml = renderCertificadoView({
    profile: ADMIN_PROFILE,
    state: {
      selectedCertId: null,
      activeChildTab: 'sitios',
      query: '',
      selectedStandard: 'ALL',
      selectedStatus: 'ALL',
      selectedSectorIaf: 'ALL',
      viewMode: 'grid',
      sortColumn: null,
      sortDirection: 'none',
      isEditingAttributes: false,
      isSidebarOpen: true,
      facetSelections: {},
    },
    certificates: INITIAL_CERTIFICADOS_DETAILED,
    organizaciones: INITIAL_ORGANIZACIONES,
  });
  assert.ok(gridHtml.includes('aria-label="Nuevo Certificado"'));
  assert.ok(gridHtml.includes('title="Nuevo Certificado"'));
  assert.equal(gridHtml.includes('<span>Nuevo Certificado</span>'), false);
  assert.equal(gridHtml.includes('Ver Ficha'), false);
});

test('Phase 4.1.2 Batch A3 + Step 3.2: Equipo de Auditores uses Universal Multi View Clean List and Canonical Detail Add mode', () => {
  const html = renderAuditorView({
    profile: ADMIN_PROFILE,
    state: {
      selectedAuditorId: null,
      activeChildTab: 'competencias',
      query: '',
      selectedCalificacion: 'ALL',
      selectedStandard: 'ALL',
      selectedSectorIaf: 'ALL',
      viewMode: 'list',
      sortColumn: null,
      sortDirection: 'none',
      isEditingAttributes: false,
      isSidebarOpen: true,
      facetSelections: {},
      isCreating: false,
    },
    auditors: INITIAL_AUDITORES_DETAILED,
    normas: INITIAL_NORMAS,
    sectores: INITIAL_SECTORES_IAF,
    subsectores: INITIAL_SUBSECTORES_IAF,
  });

  assert.ok(html.includes('Equipo de Auditores'));
  assertMultiViewCompliance(html, 'auditores', 'auditores');
  assert.ok(html.includes('data-action="open-create-auditor"'));
  assert.equal(html.includes('id="createAuditorForm"'), false);
  assert.equal(html.includes('data-col-header="acciones"'), false);
  assert.ok(html.includes('data-resizable-table="cert-auditores-main"'));
  const colHeaders = html.match(/data-col-header="[^"]+"/g) ?? [];
  assert.deepEqual(colHeaders, [
    'data-col-header="nombre"',
    'data-col-header="normas_acreditadas"',
    'data-col-header="sectores_iaf"',
    'data-col-header="auditorias_count"',
  ]);
  const colWidths = [...html.matchAll(/<col\b[^>]*style="width:\s*([\d.]+)%;"/g)].map((m) =>
    Number(m[1])
  );
  assert.equal(colWidths.length, 4);
  assert.ok(Math.abs(colWidths.reduce((a, b) => a + b, 0) - 100) < 0.05);
  const tbodyMatch = html.match(/<tbody[\s\S]*?<\/tbody>/);
  assert.ok(tbodyMatch, 'Clean list must render tbody');
  assert.equal(/<td[\s\S]*?<(button|a|input)\b/i.test(tbodyMatch[0]), false);
  assert.ok(tbodyMatch[0].includes('data-action="select-auditor"'));
  assert.ok(html.includes('data-facet-group="norma"'));
  assert.ok(html.includes('data-facet-group="sector_iaf"'));
  assert.ok(html.includes('data-facet-group="vigencia"'));

  const addHtml = renderAuditorView({
    profile: ADMIN_PROFILE,
    state: {
      selectedAuditorId: null,
      activeChildTab: 'competencias',
      query: '',
      selectedCalificacion: 'ALL',
      selectedStandard: 'ALL',
      selectedSectorIaf: 'ALL',
      viewMode: 'grid',
      sortColumn: null,
      sortDirection: 'none',
      isEditingAttributes: false,
      isCreating: true,
    },
    auditors: INITIAL_AUDITORES_DETAILED,
  });
  assert.ok(addHtml.includes('id="auditorDetailForm"'));
  assert.ok(addHtml.includes('id="saveAuditorFormBtn"'));
  assert.ok(addHtml.includes('id="cancelEditAuditorBtn"'));
  assert.equal(addHtml.includes('role="tablist"'), false);
});

test('Phase 4.1.2 Batch A4 + Step 3.1.1: Programación de Auditorías uses Universal Multi View with Campaigns & 5 reactive facets', () => {
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
      facetSelections: {
        precision_fecha: new Set(['REAL']),
      },
    },
    audits: INITIAL_PROGRAMACION_AUDITS,
    auditors: INITIAL_AUDITORES_DETAILED,
    certificates: SAMPLE_CERTIFICATE_RECORDS,
  });

  assert.ok(html.includes('Programación de Auditorías'));
  assertMultiViewCompliance(html, 'programacion', 'campañas de auditoría');
  assert.ok(html.includes('data-action="open-create-program"'));
  assert.ok(html.includes('data-facet-group="nivel_vinculacion"'));
  assert.ok(html.includes('data-facet-group="tipo_vinculacion"'));
  assert.ok(html.includes('data-facet-group="precision_fecha"'));
  assert.ok(html.includes('data-facet-group="tag_planificacion"'));
  assert.ok(html.includes('data-facet-group="cuadre_dias"'));
});

test('Phase 4.1.2 Stage Views + Step 3.1.2: Calendario and Resultado align totalizers, Multi View facets, and single-X search', () => {
  const calHtml = renderCalendarioView({
    profile: ADMIN_PROFILE,
    state: {
      viewMode: 'calendar',
      displayMode: 'mes',
      referenceYear: 2024,
      referenceMonth: 11,
      query: 'ISO',
      isSidebarOpen: true,
      filterAuditorId: 'ALL',
      filterStandard: 'ALL',
      filterMethodology: 'ALL',
      drawerAuditId: null,
    },
    audits: INITIAL_PROGRAMACION_AUDITS,
    auditors: INITIAL_AUDITORES_DETAILED,
    standards: INITIAL_NORMAS.map((n) => ({ norma: n.norma })),
  });

  assert.ok(calHtml.includes('Calendario Operativo de Evaluaciones'));
  assertMultiViewCompliance(calHtml, 'calendario', 'campañas en agenda');
  assert.ok(calHtml.includes('data-view-mode="calendar"'));
  assert.ok(calHtml.includes('id="calendarioSearchInput"'));
  assert.ok(calHtml.includes('id="clearCalendarioSearchBtn"'));
  assert.ok(calHtml.includes('data-facet-group="nivel_vinculacion"'));
  assert.ok(calHtml.includes('data-facet-group="precision_fecha"'));
  assert.equal(calHtml.includes('🗓️ Calendario Operativo'), false);

  const resHtml = renderResultadoView({
    profile: ADMIN_PROFILE,
    state: {
      selectedAuditId: 'ALL',
      activeAuditIdForDecision: INITIAL_PROGRAMACION_AUDITS[0].id,
      displayMode: 'list',
      filterType: 'ALL',
      filterLifecycle: 'ALL',
      searchQuery: 'ISO',
      isLoggingFinding: false,
      inspectingFindingId: null,
      isSidebarOpen: true,
      facetSelections: {},
    },
    audits: INITIAL_PROGRAMACION_AUDITS,
    findings: INITIAL_PHASE5_FINDINGS,
    processes: [{ id: 'p1', nombre_proceso: 'Producción' }],
    requirements: [{ id: 'r1', codigo: '8.5', norma: 'ISO 9001:2015' }],
  });

  assert.ok(resHtml.includes('Resultado de Auditorías'));
  assertMultiViewCompliance(resHtml, 'resultado', 'certificados en resultado');
  assert.ok(resHtml.includes('id="resultadoSearchInput"'));
  assert.ok(resHtml.includes('id="clearResultadoSearchBtn"'));
  assert.equal(resHtml.includes('📋 Gestión de Hallazgos'), false);
});

test('Phase 4.1.2 Batch B: All 5 Master Catalog Directories use Universal Multi View and preserve Detail Views', () => {
  const normasHtml = renderNormaView({
    profile: ADMIN_PROFILE,
    normas: INITIAL_NORMAS,
    acreditaciones: INITIAL_ACREDITACIONES,
    organismos: INITIAL_ORGANISMOS,
    requisitos: INITIAL_REQUISITOS_LTREE,
    sectores: INITIAL_SECTORES_IAF,
    loading: false,
    state: {
      selectedNormaId: null,
      activeChildTab: 'acreditacion',
      query: '',
      selectedStatus: 'ALL',
      selectedScheme: 'ALL',
      viewMode: 'grid',
      sortColumn: null,
      sortDirection: 'none',
      isSidebarOpen: true,
      facetSelections: {},
    },
  });
  assertMultiViewCompliance(normasHtml, 'normas', 'normas certificables');
  assert.ok(normasHtml.includes('data-facet-group="esquema"'));
  assert.ok(normasHtml.includes('data-facet-group="estatus"'));

  const iafHtml = renderSectorIafView({
    profile: ADMIN_PROFILE,
    sectores: INITIAL_SECTORES_IAF,
    subsectores: INITIAL_SUBSECTORES_IAF,
    loading: false,
    state: {
      selectedSectorId: null,
      activeChildTab: 'subsectores',
      query: '',
      selectedRisk: 'ALL',
      viewMode: 'list',
      sortColumn: null,
      sortDirection: 'none',
      isSidebarOpen: true,
      facetSelections: {},
    },
  });
  assertMultiViewCompliance(iafHtml, 'iaf', 'sectores IAF');
  assert.ok(iafHtml.includes('data-facet-group="riesgo"'));
  assert.ok(iafHtml.includes('data-facet-group="auditores"'));

  const estatusHtml = renderEstatusView({
    profile: ADMIN_PROFILE,
    estatusList: INITIAL_ESTATUS_CATALOG,
    loading: false,
    state: {
      selectedEstatusId: null,
      query: '',
      viewMode: 'grid',
      sortColumn: null,
      sortDirection: 'none',
      isSidebarOpen: true,
      facetSelections: {},
    },
  });
  assertMultiViewCompliance(estatusHtml, 'estatus', 'estatus operativos');
  assert.ok(estatusHtml.includes('data-facet-group="uso"'));

  const tiposHtml = renderTipoAuditoriaView({
    profile: ADMIN_PROFILE,
    tiposList: INITIAL_TIPOS_AUDITORIA_CATALOG,
    loading: false,
    state: {
      selectedTipoId: null,
      query: '',
      viewMode: 'grid',
      sortColumn: null,
      sortDirection: 'none',
      isSidebarOpen: true,
      facetSelections: {},
    },
  });
  assertMultiViewCompliance(tiposHtml, 'tipos', 'tipos de auditoría');
  assert.ok(tiposHtml.includes('data-facet-group="ciclo"'));

  const metodologiasHtml = renderMetodologiaAuditoriaView({
    profile: ADMIN_PROFILE,
    metodologiasList: INITIAL_METODOLOGIAS_CATALOG,
    loading: false,
    state: {
      selectedMetodologiaId: null,
      query: '',
      viewMode: 'list',
      sortColumn: null,
      sortDirection: 'none',
      isSidebarOpen: true,
      facetSelections: {},
    },
  });
  assertMultiViewCompliance(metodologiasHtml, 'metodologias', 'metodologías');
  assert.ok(metodologiasHtml.includes('data-facet-group="modalidad"'));

  // Detail View untouched check (selecting an organization renders 4-Zone detail, not Multi View)
  const orgDetailHtml = renderOrganizacionView({
    profile: ADMIN_PROFILE,
    state: {
      selectedOrganizacionId: INITIAL_ORGANIZACIONES[0].id,
      query: '',
      hasActiveCertificates: 'ALL',
      selectedSectorIaf: 'ALL',
      viewMode: 'grid',
      sortColumn: null,
      sortDirection: 'none',
      isEditingAttributes: false,
      activeChildTab: 'certificados',
    },
    organizaciones: INITIAL_ORGANIZACIONES,
    certificados: SAMPLE_CERTIFICATE_RECORDS,
  });
  assert.equal(orgDetailHtml.includes('data-mv-domain'), false);
  assert.ok(orgDetailHtml.includes('data-action="back-to-org-list"'));
});
