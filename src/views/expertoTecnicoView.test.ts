import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INITIAL_EXPERTOS_TECNICOS,
  createDefaultExpertoTecnicoViewState,
  createEmptyExpertoCompetenciaDraft,
} from '../lib/expertoTecnicoDomain';
import type { SectorIafEntity, SubsectorIafEntity } from '../lib/extraDomain';
import { CERTIFICACION_NAV_ITEMS, type UserProfile } from '../lib/healthCheck';
import { assertZeroUuidExposure } from '../lib/zeroUuid';
import { renderCertificacionView } from './certificacionView';
import { renderExpertoTecnicoView } from './expertoTecnicoView';

const ADMIN_PROFILE: UserProfile = {
  id: '00000000-0000-0000-0000-000000000001',
  nombre: 'Admin Principal',
  role: 'ADMIN',
  status: 'APPROVED',
};

const WORKER_PROFILE: UserProfile = {
  id: '00000000-0000-0000-0000-000000000002',
  nombre: 'Analista Certificación',
  role: 'WORKER',
  status: 'APPROVED',
};

const AUDITOR_PROFILE: UserProfile = {
  id: '00000000-0000-0000-0000-000000000003',
  nombre: 'Auditor Demo',
  role: 'AUDITOR',
  status: 'APPROVED',
};

const CLIENT_PROFILE: UserProfile = {
  id: '00000000-0000-0000-0000-000000000004',
  nombre: 'Cliente Demo',
  role: 'CLIENT',
  status: 'APPROVED',
};

const SECTORES_CATALOG: SectorIafEntity[] = [
  {
    id: 'd0000000-0000-0000-0000-000000000013',
    sector: 13,
    descripcion: 'Productos farmacéuticos',
    subsectores_count: 1,
    auditores_count: 0,
  },
  {
    id: 'd0000000-0000-0000-0000-000000000017',
    sector: 17,
    descripcion: 'Metales básicos y productos metálicos fabricados',
    subsectores_count: 1,
    auditores_count: 2,
  },
];

const SUBSECTORES_CATALOG: SubsectorIafEntity[] = [
  {
    id: 'da000000-0000-0000-0000-000000000132',
    id_sector_iaf: 'd0000000-0000-0000-0000-000000000013',
    sector_numero: 13,
    codigo: '13.2',
    descripcion: 'Fabricación de preparados farmacéuticos y especialidades medicinales',
    categoria_riesgo: 'ALTO',
    auditores_nombres: [],
  },
  {
    id: 'da000000-0000-0000-0000-000000000171',
    id_sector_iaf: 'd0000000-0000-0000-0000-000000000017',
    sector_numero: 17,
    codigo: '17.1',
    descripcion: 'Fabricación de acero, fundición de hierro y metales básicos',
    categoria_riesgo: 'ALTO',
    auditores_nombres: [],
  },
];

function extractTbodyBlocks(html: string): string[] {
  return [...html.matchAll(/<tbody[\s\S]*?<\/tbody>/gi)].map((m) => m[0]);
}

function assertColgroup100(html: string, tableId: string): void {
  const tableRegex = new RegExp(
    `<table[^>]*data-resizable-table="${tableId}"[\\s\\S]*?<\\/table>`,
    'i'
  );
  const tableMatch = html.match(tableRegex);
  assert.ok(tableMatch, `Expected table "${tableId}"`);
  assert.match(tableMatch[0], /table-fixed/);
  const colgroupMatch = tableMatch[0].match(/<colgroup>([\s\S]*?)<\/colgroup>/i);
  assert.ok(colgroupMatch, `Expected <colgroup> in "${tableId}"`);
  const widths = [...colgroupMatch[1].matchAll(/width:\s*([0-9.]+)%/gi)].map((m) => Number(m[1]));
  assert.ok(widths.length > 0, `Expected percentage <col> widths in "${tableId}"`);
  const sum = Math.round(widths.reduce((acc, n) => acc + n, 0) * 100) / 100;
  assert.equal(sum, 100, `Expected <colgroup> widths for "${tableId}" to sum 100%, got ${sum}`);
}

test('Step 1.3 View: CERTIFICACION_NAV_ITEMS places Experto immediately after Auditor', () => {
  const audIdx = CERTIFICACION_NAV_ITEMS.findIndex((i) => i.id === 'auditors');
  const expIdx = CERTIFICACION_NAV_ITEMS.findIndex((i) => i.id === 'experts');
  assert.ok(audIdx >= 0);
  assert.equal(expIdx, audIdx + 1);
  assert.equal(CERTIFICACION_NAV_ITEMS[expIdx].label, 'Experto');
  assert.equal(CERTIFICACION_NAV_ITEMS[expIdx].symbol, '🔬');
});

test('Step 1.3 View: Multi View List & Grid enforce table-fixed, colgroup=100%, zero <button> in <tbody>, facets, and Zero-UUID', () => {
  const listHtml = renderCertificacionView(ADMIN_PROFILE, {
    activeSubSection: 'experts',
    filters: { query: '', selectedStatus: 'ALL', selectedStandard: 'ALL', viewMode: 'list' },
    filteredCertificates: [],
    allCertificates: [],
    availableStatuses: [],
    availableStandards: [],
    organizations: [],
    sites: [],
    processes: [],
    shifts: [],
    loading: false,
    allExpertosTecnicos: INITIAL_EXPERTOS_TECNICOS,
    expertoTecnicoState: {
      ...createDefaultExpertoTecnicoViewState(),
      viewMode: 'list',
    },
    sectoresIaf: SECTORES_CATALOG,
    subsectoresIaf: SUBSECTORES_CATALOG,
  });

  assert.match(listHtml, /id="expertoDirectorySearchInput"/);
  assert.match(listHtml, /Disponibilidad/);
  assert.match(listHtml, /Sector IAF/);
  assert.match(listHtml, /Sub-Sector IAF/);
  assert.match(listHtml, /data-action="open-create-experto"/);
  assert.match(listHtml, /Dra\. Sofía Quintero/);
  assert.match(listHtml, /Ing\. Rodrigo Páez/);
  assertColgroup100(listHtml, 'cert-expertos-main');

  for (const tbody of extractTbodyBlocks(listHtml)) {
    assert.equal(/<button\b/i.test(tbody), false, 'List Multi View <tbody> must have 0 <button>');
  }
  assert.equal(assertZeroUuidExposure(listHtml).compliant, true);

  // Grid mode & reactive filter by "No disponible"
  const gridFilteredHtml = renderExpertoTecnicoView({
    profile: WORKER_PROFILE,
    state: {
      ...createDefaultExpertoTecnicoViewState(),
      viewMode: 'grid',
      facetSelections: { estatus: new Set(['No disponible']) },
    },
    expertos: INITIAL_EXPERTOS_TECNICOS,
    sectores: SECTORES_CATALOG,
    subsectores: SUBSECTORES_CATALOG,
  });

  assert.match(gridFilteredHtml, /data-action="select-experto"/);
  assert.match(gridFilteredHtml, /Ing\. Rodrigo Páez/);
  assert.equal(/Dra\. Sofía Quintero/.test(gridFilteredHtml), false);
  assert.equal(assertZeroUuidExposure(gridFilteredHtml).compliant, true);
});

test('Step 1.3 View: Detail View renders 3 tabs, Sector->Subsector cascade with zero ISO norms, unlink outside tbody, and history click', () => {
  const sofia = INITIAL_EXPERTOS_TECNICOS[0];
  const mariela = INITIAL_EXPERTOS_TECNICOS[2]; // has both Sector 17 and Subsector 17.1

  // Tab 1: Competencias (with inline cascade form open in sector mode -> then subsector mode)
  const tab1ReadHtml = renderExpertoTecnicoView({
    profile: ADMIN_PROFILE,
    state: {
      ...createDefaultExpertoTecnicoViewState(),
      selectedExpertoId: mariela.id,
      activeChildTab: 'competencias',
      isAddingCompetencia: true,
      competenciaDraft: {
        ...createEmptyExpertoCompetenciaDraft(mariela.id, 'subsector_iaf'),
        id_sector_iaf: '',
      },
    },
    expertos: INITIAL_EXPERTOS_TECNICOS,
    sectores: SECTORES_CATALOG,
    subsectores: SUBSECTORES_CATALOG,
  });

  assert.match(tab1ReadHtml, /Sectores y Sub-Sectores IAF/);
  assert.match(tab1ReadHtml, /Teléfonos y Emails/);
  assert.match(tab1ReadHtml, /Historial de Auditorías/);
  assert.match(tab1ReadHtml, /id="expertoCompetenciaForm"/);
  assert.match(tab1ReadHtml, /id="expCompSelectTipo"/);
  assert.match(tab1ReadHtml, /id="expCompSelectSector"/);
  assert.match(tab1ReadHtml, /id="expCompSelectSubsector"[^>]*disabled/);
  // Zero ISO norm selectors or fields
  assert.equal(/norma_experto|id_norma|Normas ISO calificadas/i.test(tab1ReadHtml), false);
  assertColgroup100(tab1ReadHtml, 'experto-tab-sectores');
  assertColgroup100(tab1ReadHtml, 'experto-tab-subsectores');
  for (const tbody of extractTbodyBlocks(tab1ReadHtml)) {
    assert.equal(/<button\b/i.test(tbody), false, 'Competencias <tbody> must have 0 <button>');
  }
  assert.match(tab1ReadHtml, /data-action="unlink-experto-sector"/);
  assert.match(tab1ReadHtml, /data-action="unlink-experto-subsector"/);
  assert.equal(assertZeroUuidExposure(tab1ReadHtml).compliant, true);

  // Tab 2: Contacto (inline add phone & email + archive triggers)
  const tab2Html = renderExpertoTecnicoView({
    profile: WORKER_PROFILE,
    state: {
      ...createDefaultExpertoTecnicoViewState(),
      selectedExpertoId: sofia.id,
      activeChildTab: 'contacto',
      isAddingTelefono: true,
      isAddingEmail: true,
    },
    expertos: INITIAL_EXPERTOS_TECNICOS,
    sectores: SECTORES_CATALOG,
    subsectores: SUBSECTORES_CATALOG,
  });
  assert.match(tab2Html, /id="expertoTelefonoForm"/);
  assert.match(tab2Html, /id="expertoEmailForm"/);
  assert.match(tab2Html, /data-action="archive-experto-telefono"/);
  assert.match(tab2Html, /data-action="archive-experto-email"/);
  assert.equal(assertZeroUuidExposure(tab2Html).compliant, true);

  // Tab 3: Historial de Auditorías
  const tab3Html = renderExpertoTecnicoView({
    profile: ADMIN_PROFILE,
    state: {
      ...createDefaultExpertoTecnicoViewState(),
      selectedExpertoId: sofia.id,
      activeChildTab: 'historial',
    },
    expertos: INITIAL_EXPERTOS_TECNICOS,
    sectores: SECTORES_CATALOG,
    subsectores: SUBSECTORES_CATALOG,
  });
  assert.match(tab3Html, /AUD-FAR-2026-001/);
  assert.match(tab3Html, /data-action="select-prog-audit-by-code"/);
  assertColgroup100(tab3Html, 'experto-tab-historial');
  for (const tbody of extractTbodyBlocks(tab3Html)) {
    assert.equal(/<button\b/i.test(tbody), false, 'Historial <tbody> must have 0 <button>');
  }
  assert.equal(assertZeroUuidExposure(tab3Html).compliant, true);

  // Edit & Create modes
  const editHtml = renderExpertoTecnicoView({
    profile: ADMIN_PROFILE,
    state: {
      ...createDefaultExpertoTecnicoViewState(),
      selectedExpertoId: sofia.id,
      isEditingAttributes: true,
    },
    expertos: INITIAL_EXPERTOS_TECNICOS,
    sectores: SECTORES_CATALOG,
    subsectores: SUBSECTORES_CATALOG,
  });
  assert.match(editHtml, /id="expertoDetailForm"/);
  assert.match(editHtml, /id="expertoNombreInput"/);
  assert.match(editHtml, /id="expertoEstatusSelect"/);
  assert.match(editHtml, /id="expertoNotasInput"/);
  assert.equal(assertZeroUuidExposure(editHtml).compliant, true);
});

test('Step 1.3 View: RBAC blocks CLIENT from catalog and forces AUDITOR read-only without mutation controls', () => {
  const clientHtml = renderExpertoTecnicoView({
    profile: CLIENT_PROFILE,
    state: createDefaultExpertoTecnicoViewState(),
    expertos: INITIAL_EXPERTOS_TECNICOS,
    sectores: SECTORES_CATALOG,
    subsectores: SUBSECTORES_CATALOG,
  });
  assert.match(clientHtml, /Acceso Restringido al Catálogo de Expertos Técnicos/);
  assert.equal(/Dra\. Sofía Quintero/.test(clientHtml), false);
  assert.equal(assertZeroUuidExposure(clientHtml).compliant, true);

  const auditorDetailHtml = renderExpertoTecnicoView({
    profile: AUDITOR_PROFILE,
    state: {
      ...createDefaultExpertoTecnicoViewState(),
      selectedExpertoId: INITIAL_EXPERTOS_TECNICOS[0].id,
      isEditingAttributes: true,
      isAddingCompetencia: true,
      isAddingTelefono: true,
    },
    expertos: INITIAL_EXPERTOS_TECNICOS,
    sectores: SECTORES_CATALOG,
    subsectores: SUBSECTORES_CATALOG,
  });
  assert.match(auditorDetailHtml, /Dra\. Sofía Quintero/);
  assert.equal(/startEditExpertoBtn|open-add-experto-competencia|open-add-experto-telefono|archive-experto-telefono|unlink-experto-subsector/.test(auditorDetailHtml), false);
  assert.equal(assertZeroUuidExposure(auditorDetailHtml).compliant, true);
});
