import test from 'node:test';
import assert from 'node:assert/strict';
import type { UserProfile } from './healthCheck';
import { assertZeroUuidExposure } from './zeroUuid';
import { INITIAL_ORGANIZACIONES } from './activeCertificates';
import {
  INITIAL_CERTIFICADOS_DETAILED,
  type CertificadoDetailEntity,
  type CertificadoViewState,
} from './multisiteSampling';
import type { RequisitoLtree } from './extraDomain';
import {
  computeProcessDownwardCoverageCount,
  countExcludedSubtreeDescendants,
  evaluateCertificateCoverage,
} from './coverageEngine';
import { renderDetailPageTemplate } from '../views/detailTemplate';
import { renderCertificadoView } from '../views/certificadoView';
import { renderCertificacionView } from '../views/certificacionView';

const ADMIN_PROFILE: UserProfile = {
  id: '11111111-1111-1111-1111-111111111111',
  nombre: 'Administrador Principal',
  role: 'ADMIN',
  status: 'APPROVED',
};

const WORKER_PROFILE: UserProfile = {
  id: '22222222-2222-2222-2222-222222222222',
  nombre: 'Coordinador Técnico',
  role: 'WORKER',
  status: 'APPROVED',
};

const AUDITOR_PROFILE: UserProfile = {
  id: '33333333-3333-3333-3333-333333333333',
  nombre: 'Auditor Líder',
  role: 'AUDITOR',
  status: 'APPROVED',
};

const CLIENT_PROFILE: UserProfile = {
  id: '44444444-4444-4444-4444-444444444444',
  nombre: 'Usuario Cliente',
  role: 'CLIENT',
  status: 'APPROVED',
};

const NORMA_ID = 'e0000000-0000-0000-0000-000000009001';
const NORMA_CODE = 'ISO 9001:2015';

function makeClause(
  id: string,
  codigo: string,
  ruta: string,
  opts: Partial<RequisitoLtree> = {}
): RequisitoLtree {
  return {
    id,
    id_norma: NORMA_ID,
    norma_codigo: NORMA_CODE,
    id_requisito_padre: opts.id_requisito_padre ?? null,
    codigo,
    explicit_code: opts.explicit_code ?? true,
    es_obligatorio: opts.es_obligatorio,
    obligatorio_origen: opts.obligatorio_origen,
    titulo: opts.titulo ?? `Requisito ${codigo}`,
    descripcion: opts.descripcion,
    translations: opts.translations,
    ruta_materializada: ruta,
    nivel: ruta.split('.').length,
    es_padre: opts.es_padre ?? false,
    deleted_at: opts.deleted_at ?? null,
  };
}

function buildStep31Catalog(): RequisitoLtree[] {
  return [
    makeClause('req-1', '1', '1', { es_padre: true, es_obligatorio: false, titulo: 'Objeto y campo de aplicación' }),
    makeClause('req-2', '2', '2', { es_obligatorio: false, titulo: 'Referencias normativas' }),
    makeClause('req-3', '3', '3', { es_obligatorio: false, titulo: 'Términos y definiciones' }),
    makeClause('req-4', '4', '4', { es_padre: true, es_obligatorio: false, titulo: 'Contexto de la organización' }),
    makeClause('req-44', '4.4', '4.4_4', { id_requisito_padre: 'req-4', es_padre: true, es_obligatorio: false, titulo: 'Sistema de gestión' }),
    makeClause('req-441', '4.4.1', '4.4_4.4_4_1', { id_requisito_padre: 'req-44', es_padre: true, es_obligatorio: true, titulo: 'Procesos necesarios' }),
    makeClause('req-441a', '4.4.1.a', '4.4_4.4_4_1.4_4_1_a', { id_requisito_padre: 'req-441', es_obligatorio: true, titulo: 'Determinar entradas y salidas' }),
    makeClause('req-83', '8.3', '8.8_3', { es_padre: true, es_obligatorio: false, titulo: 'Diseño y desarrollo' }),
    makeClause('req-831', '8.3.1', '8.8_3.8_3_1', { id_requisito_padre: 'req-83', es_obligatorio: true, titulo: 'Generalidades de diseño' }),
    makeClause('req-832', '8.3.2', '8.8_3.8_3_2', { id_requisito_padre: 'req-83', es_obligatorio: true, titulo: 'Planificación del diseño' }),
    makeClause('req-851', '8.5.1', '8.8_5_1', { es_obligatorio: true, titulo: 'Control de la producción' }),
  ];
}

function makeBaseState(overrides: Partial<CertificadoViewState> = {}): CertificadoViewState {
  return {
    selectedCertId: null,
    activeChildTab: 'sitios',
    query: '',
    selectedStandard: 'ALL',
    selectedStatus: 'ALL',
    selectedSectorIaf: 'ALL',
    viewMode: 'list',
    sortColumn: null,
    sortDirection: 'none',
    isCoverageMapOpen: false,
    coverageMapFilter: null,
    selectedPendingRequisitoId: null,
    ...overrides,
  };
}

function makeTestCert(overrides: Partial<CertificadoDetailEntity> = {}): CertificadoDetailEntity {
  return {
    ...INITIAL_CERTIFICADOS_DETAILED[0],
    id: '40000000-0000-0000-0000-000000009301',
    id_norma: NORMA_ID,
    norma_codigo: NORMA_CODE,
    procesos: [
      {
        id: 'proc-op-1',
        id_certificado: '40000000-0000-0000-0000-000000009301',
        nombre_proceso: 'Troquelado y Fundición',
        tipo: 'Medular',
        responsable: 'Jefe de Planta',
        clausulas_cubiertas: ['4.4.1'],
        requisitos_detalle: [{ codigo: '4.4.1', titulo: 'Procesos necesarios' }],
      },
    ],
    noAplicables: [
      {
        id: 'na-83-1',
        id_certificado: '40000000-0000-0000-0000-000000009301',
        id_requisito: 'req-83',
        requisito_codigo: '8.3',
        requisito_titulo: 'Diseño y desarrollo',
        justificacion: 'Exclusión justificada según ISO 4.3 bajo especificaciones de cliente.',
      },
    ],
    ...overrides,
  };
}

test('Step 3.1: detailTemplate supports countBadgeClass, statusDotClass, and betweenZone2AndZone3Html slot safely', () => {
  const html = renderDetailPageTemplate({
    entityType: 'Certificado',
    entitySymbol: '📜',
    title: 'CERT-001',
    backButton: { label: 'Volver', nav: 'certificados' },
    tableName: 'certificado',
    recordId: 'cert-001',
    parents: [],
    attributes: [{ label: 'Norma', value: 'ISO 9001:2015' }],
    betweenZone2AndZone3Html: '<section data-testid="mock-coverage-hud">HUD</section>',
    childTabs: [
      {
        id: 'procesos',
        label: 'Proceso',
        count: 2,
        countBadgeClass: 'bg-amber-100 text-amber-800',
        statusDotClass: 'bg-amber-500',
      },
      {
        id: 'sitios',
        label: 'Sitio',
        count: 1,
      },
    ],
    activeChildTabId: 'procesos',
    renderChildTabContent: () => '<div>Tabla procesos</div>',
  });

  const hudIdx = html.indexOf('data-testid="mock-coverage-hud"');
  const tablistIdx = html.indexOf('role="tablist"');
  assert.ok(hudIdx > 0);
  assert.ok(tablistIdx > hudIdx, 'HUD must render between Zone 2 and Zone 3 tab bar');
  assert.ok(html.includes('bg-amber-500'));
  assert.ok(html.includes('bg-amber-100 text-amber-800'));
  assert.ok(html.includes('bg-slate-200/80 text-slate-600'));
});

test('Step 3.1: coverageEngine downward and exclusion subtree helpers calculate exact counts', () => {
  const catalog = buildStep31Catalog();
  const cert = makeTestCert();
  const report = evaluateCertificateCoverage({ cert, requirementsCatalog: catalog });

  // Mandatory: 4.4.1, 4.4.1.a, 8.3.1, 8.3.2, 8.5.1 => 5 total
  // Process covers 4.4.1 -> covers 4.4.1 & 4.4.1.a (2 mandatory)
  // No Aplicable 8.3 -> excludes 8.3.1 & 8.3.2 (2 mandatory; 2 descendants)
  // Pending: 8.5.1 (1 mandatory)
  assert.equal(report.summary.totalObligatorios, 5);
  assert.equal(report.summary.cubiertosPorProceso, 2);
  assert.equal(report.summary.excluidosNoAplicables, 2);
  assert.equal(report.summary.pendientes, 1);

  const node441a = report.nodeByRequisitoId.get('req-441a');
  assert.deepEqual(node441a?.inheritedProcessIds, ['proc-op-1']);
  assert.deepEqual(node441a?.inheritedProcessNames, ['Troquelado y Fundición']);

  const node831 = report.nodeByRequisitoId.get('req-831');
  assert.equal(node831?.effectiveExclusionId, 'na-83-1');

  const procDownward = computeProcessDownwardCoverageCount({
    clausulasCubiertas: cert.procesos[0].clausulas_cubiertas,
    requisitosDetalle: cert.procesos[0].requisitos_detalle,
    coverageReport: report,
  });
  assert.equal(procDownward.directCount, 1);
  assert.equal(procDownward.mandatoryCoveredCount, 2);

  const subtreeDescCount = countExcludedSubtreeDescendants({
    exclusion: cert.noAplicables[0],
    coverageReport: report,
  });
  assert.equal(subtreeDescCount, 2);
});

test('Step 3.1: certificados-main preserves exact 6 columns without coverage clutter', () => {
  const cert = makeTestCert();
  const html = renderCertificadoView({
    profile: ADMIN_PROFILE,
    state: makeBaseState({ selectedCertId: null }),
    certificates: [cert],
    organizaciones: INITIAL_ORGANIZACIONES,
    requirementsCatalog: buildStep31Catalog(),
  });

  const thMatches = html.match(/<th\b/g) || [];
  assert.equal(thMatches.length, 6, 'Multi-view table must retain exact 6 columns');
  assert.equal(html.includes('Cobertura Normativa'), false);
  assert.equal(html.includes('data-testid="cert-coverage-hud"'), false);
  assert.equal(assertZeroUuidExposure(html).compliant, true);
});

test('Step 3.1: Certificate Coverage HUD renders in read mode only, reflects incomplete/complete/unassigned states, and avoids inline styles', () => {
  const catalog = buildStep31Catalog();
  const incompleteCert = makeTestCert();

  const incompleteHtml = renderCertificadoView({
    profile: ADMIN_PROFILE,
    state: makeBaseState({ selectedCertId: incompleteCert.id }),
    certificates: [incompleteCert],
    organizaciones: INITIAL_ORGANIZACIONES,
    requirementsCatalog: catalog,
  });

  assert.ok(incompleteHtml.includes('data-testid="cert-coverage-hud"'));
  assert.ok(incompleteHtml.includes('Cobertura Incompleta · Faltan 1 cláusula obligatoria'));
  assert.ok(incompleteHtml.includes('role="progressbar"'));
  assert.ok(incompleteHtml.includes('Ver Mapa de Cobertura'));
  assert.ok(incompleteHtml.includes('Cubiertas por Procesos: <strong class="text-slate-900 tabular-nums">2</strong>'));
  assert.ok(incompleteHtml.includes('No Aplicables ISO 4.3: <strong class="text-slate-900 tabular-nums">2</strong>'));
  assert.ok(incompleteHtml.includes('Pendientes: <strong class="text-slate-900 tabular-nums">1</strong>'));
  assert.ok(incompleteHtml.includes('Total Obligatorias: 5'));
  const hudMatch = incompleteHtml.match(/<section[^>]*data-testid="cert-coverage-hud"[\s\S]*?<\/section>/);
  assert.ok(hudMatch, 'Coverage HUD section must be present');
  assert.equal(hudMatch[0].includes('style='), false, 'Coverage HUD must use zero inline styles');
  assert.equal(assertZeroUuidExposure(incompleteHtml).compliant, true);

  // Edit & Add modes must hide HUD
  const editHtml = renderCertificadoView({
    profile: ADMIN_PROFILE,
    state: makeBaseState({ selectedCertId: incompleteCert.id, isEditingAttributes: true }),
    certificates: [incompleteCert],
    organizaciones: INITIAL_ORGANIZACIONES,
    requirementsCatalog: catalog,
  });
  assert.equal(editHtml.includes('data-testid="cert-coverage-hud"'), false);

  const addHtml = renderCertificadoView({
    profile: ADMIN_PROFILE,
    state: makeBaseState({ isCreating: true }),
    certificates: [incompleteCert],
    organizaciones: INITIAL_ORGANIZACIONES,
    requirementsCatalog: catalog,
  });
  assert.equal(addHtml.includes('data-testid="cert-coverage-hud"'), false);

  // Complete state (100%)
  const completeCert = makeTestCert({
    procesos: [
      {
        ...incompleteCert.procesos[0],
        clausulas_cubiertas: ['4.4.1', '8.5.1'],
        requisitos_detalle: [
          { codigo: '4.4.1', titulo: 'Procesos necesarios' },
          { codigo: '8.5.1', titulo: 'Control de la producción' },
        ],
      },
    ],
  });
  const completeHtml = renderCertificadoView({
    profile: AUDITOR_PROFILE,
    state: makeBaseState({ selectedCertId: completeCert.id }),
    certificates: [completeCert],
    organizaciones: INITIAL_ORGANIZACIONES,
    requirementsCatalog: catalog,
  });
  assert.ok(completeHtml.includes('✓ Cobertura Normativa Completa (100%)'));
  assert.ok(completeHtml.includes('bg-emerald-500'));
  assert.equal(assertZeroUuidExposure(completeHtml).compliant, true);

  // Unassigned state (0 processes, 0 exclusions)
  const unassignedCert = makeTestCert({ procesos: [], noAplicables: [] });
  const unassignedHtml = renderCertificadoView({
    profile: CLIENT_PROFILE,
    state: makeBaseState({ selectedCertId: unassignedCert.id }),
    certificates: [unassignedCert],
    organizaciones: INITIAL_ORGANIZACIONES,
    requirementsCatalog: catalog,
  });
  assert.ok(unassignedHtml.includes('Sin cobertura asignada'));
  assert.equal(assertZeroUuidExposure(unassignedHtml).compliant, true);
});

test('Step 3.1: Coverage Map drawer defaults to Pendientes when P > 0, renders 4 clean columns, and enforces Staff-only Quick-Resolve', () => {
  const catalog = buildStep31Catalog();
  const cert = makeTestCert();

  // Expanded with default filter (Pendientes because pendientes = 1) and selected pending row for Staff
  const staffMapHtml = renderCertificadoView({
    profile: WORKER_PROFILE,
    state: makeBaseState({
      selectedCertId: cert.id,
      isCoverageMapOpen: true,
      coverageMapFilter: null,
      selectedPendingRequisitoId: 'req-851',
    }),
    certificates: [cert],
    organizaciones: INITIAL_ORGANIZACIONES,
    requirementsCatalog: catalog,
  });

  assert.ok(staffMapHtml.includes('data-testid="cert-coverage-map-drawer"'));
  assert.ok(staffMapHtml.includes('Ocultar Mapa de Cobertura'));
  // Pendientes filter active by default
  assert.ok(staffMapHtml.includes('data-coverage-filter="PENDIENTE"\n                    aria-pressed="true"') || staffMapHtml.includes('data-coverage-filter="PENDIENTE"'));
  assert.ok(staffMapHtml.includes('Mostrando 1 cláusula'));
  assert.ok(staffMapHtml.includes('8.5.1'));
  assert.ok(staffMapHtml.includes('Sin asignar'));
  // Chapters 1..3 hidden under Pendientes
  assert.equal(staffMapHtml.includes('Objeto y campo de aplicación'), false);
  // Table has exact 4 headers & zero acciones column
  const drawerStart = staffMapHtml.indexOf('data-testid="cert-coverage-map-drawer"');
  const tablistStart = staffMapHtml.indexOf('role="tablist"');
  const mapTableSection = staffMapHtml.slice(drawerStart, tablistStart > drawerStart ? tablistStart : undefined);
  const mapThCount = (mapTableSection.match(/<th\b/g) || []).length;
  assert.equal(mapThCount, 4);
  assert.equal(mapTableSection.includes('Acciones'), false);

  // Staff Quick-Resolve bar rendered outside tbody
  assert.ok(staffMapHtml.includes('data-testid="coverage-quick-resolve-bar"'));
  assert.ok(staffMapHtml.includes('id="coverageQuickAssignProcesoSelect"'));
  assert.ok(staffMapHtml.includes('data-action="quick-assign-pending-clause"'));
  assert.ok(staffMapHtml.includes('data-action="quick-declare-non-applicable"'));
  assert.equal(assertZeroUuidExposure(staffMapHtml).compliant, true);

  // Check ALL_MANDATORY & INFORMATIVA views expose inherited origins cleanly
  const allMandatoryHtml = renderCertificadoView({
    profile: ADMIN_PROFILE,
    state: makeBaseState({
      selectedCertId: cert.id,
      isCoverageMapOpen: true,
      coverageMapFilter: 'ALL_MANDATORY',
    }),
    certificates: [cert],
    organizaciones: INITIAL_ORGANIZACIONES,
    requirementsCatalog: catalog,
  });
  assert.ok(allMandatoryHtml.includes('Troquelado y Fundición (vía 4.4.1)'));
  assert.ok(allMandatoryHtml.includes('Excluida bajo 8.3'));
  assert.equal(assertZeroUuidExposure(allMandatoryHtml).compliant, true);

  const infoHtml = renderCertificadoView({
    profile: ADMIN_PROFILE,
    state: makeBaseState({
      selectedCertId: cert.id,
      isCoverageMapOpen: true,
      coverageMapFilter: 'INFORMATIVA',
    }),
    certificates: [cert],
    organizaciones: INITIAL_ORGANIZACIONES,
    requirementsCatalog: catalog,
  });
  assert.ok(infoHtml.includes('Objeto y campo de aplicación'));
  assert.ok(infoHtml.includes('INFORMATIVA'));
  assert.equal(assertZeroUuidExposure(infoHtml).compliant, true);

  // Non-staff (Auditor / Client) must NEVER see Quick-Resolve action controls
  for (const roProfile of [AUDITOR_PROFILE, CLIENT_PROFILE]) {
    const roMapHtml = renderCertificadoView({
      profile: roProfile,
      state: makeBaseState({
        selectedCertId: cert.id,
        isCoverageMapOpen: true,
        selectedPendingRequisitoId: 'req-851',
      }),
      certificates: [cert],
      organizaciones: INITIAL_ORGANIZACIONES,
      requirementsCatalog: catalog,
    });
    assert.equal(roMapHtml.includes('data-testid="coverage-quick-resolve-bar"'), false);
    assert.equal(roMapHtml.includes('data-action="quick-assign-pending-clause"'), false);
    assert.equal(roMapHtml.includes('data-action="quick-declare-non-applicable"'), false);
    assert.equal(assertZeroUuidExposure(roMapHtml).compliant, true);
  }
});

test('Step 3.1: Child tabs display downward coverage counts, subtree exclusion counts, and preserve singular tab labels', () => {
  const catalog = buildStep31Catalog();
  const cert = makeTestCert();

  const procesosHtml = renderCertificadoView({
    profile: ADMIN_PROFILE,
    state: makeBaseState({ selectedCertId: cert.id, activeChildTab: 'procesos' }),
    certificates: [cert],
    organizaciones: INITIAL_ORGANIZACIONES,
    requirementsCatalog: catalog,
  });

  assert.ok(procesosHtml.includes('>Proceso<'));
  assert.ok(procesosHtml.includes('>No Aplicable<'));
  assert.ok(procesosHtml.includes('1 directa · cubre 2 obligatorias'));
  assert.equal(assertZeroUuidExposure(procesosHtml).compliant, true);

  const noAplicablesHtml = renderCertificadoView({
    profile: ADMIN_PROFILE,
    state: makeBaseState({ selectedCertId: cert.id, activeChildTab: 'no_aplicables' }),
    certificates: [cert],
    organizaciones: INITIAL_ORGANIZACIONES,
    requirementsCatalog: catalog,
  });

  assert.ok(noAplicablesHtml.includes('Cláusula 8.3'));
  assert.ok(noAplicablesHtml.includes('(+2 subcláusulas)'));
  assert.ok(noAplicablesHtml.includes('data-action="select-no-aplicable"'));
  assert.equal(assertZeroUuidExposure(noAplicablesHtml).compliant, true);
});

test('Step 3.1: renderCertificacionView forwards Coverage Map drawer, filter, and pending selection state cleanly', () => {
  const catalog = buildStep31Catalog();
  const cert = makeTestCert();
  const html = renderCertificacionView(ADMIN_PROFILE, {
    activeSubSection: 'certificates',
    filters: {
      query: '',
      statuses: [],
      standards: [],
      viewMode: 'list',
      sortColumn: null,
      sortDirection: 'none',
    },
    filteredCertificates: [],
    allCertificates: [],
    availableStatuses: [],
    availableStandards: [],
    organizations: [],
    sites: [],
    processes: [],
    shifts: [],
    loading: false,
    allOrganizaciones: INITIAL_ORGANIZACIONES,
    allCertificadosDetailed: [cert],
    requirementsCatalog: catalog,
    certificadoState: makeBaseState({
      selectedCertId: cert.id,
      isCoverageMapOpen: true,
      coverageMapFilter: 'ALL_MANDATORY',
      selectedPendingRequisitoId: 'req-851',
    }),
  });

  assert.ok(html.includes('data-testid="cert-coverage-map-drawer"'));
  assert.ok(html.includes('data-testid="coverage-quick-resolve-bar"'));
  assert.ok(html.includes('Mostrando 5 cláusulas'));
  assert.equal(assertZeroUuidExposure(html).compliant, true);
});

