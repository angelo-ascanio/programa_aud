import test from 'node:test';
import assert from 'node:assert/strict';
import type { UserProfile } from './healthCheck';
import { assertZeroUuidExposure } from './zeroUuid';
import {
  DEFAULT_ACREDITACION_ESTATUS_ID,
  NO_SECTORS_LABEL,
  buildInitialAcreditacionEntities,
  computeActiveCertificatesCountForAccreditation,
  createAcreditacionDraftFromEntity,
  createEmptyAcreditacionFormDraft,
  createEmptyOrganismoFormDraft,
  createOrganismoDraftFromEntity,
  enrichAcreditacionesWithImpact,
  evaluateAccreditationExpiry,
  filterCoveredCertificatesForAccreditation,
  formatAcreditacionSectorsSummary,
  getAcreditacionSectorFacetValues,
  getSubsectoresForAccreditation,
  mapSupabaseAcreditacionRows,
  normalizeSafeHttpUrl,
  validateAcreditacionDraft,
  validateOrganismoDraft,
  type AcreditacionDetailEntity,
} from './acreditacionDomain';
import {
  INITIAL_ESTATUS_CATALOG,
  INITIAL_NORMAS,
  INITIAL_ORGANISMOS,
  INITIAL_SECTORES_IAF,
  INITIAL_SUBSECTORES_IAF,
} from './extraDomain';
import { INITIAL_CERTIFICADOS_DETAILED } from './multisiteSampling';
import { SAMPLE_CERTIFICATE_RECORDS } from './searchControls';
import {
  renderAcreditacionView,
  resolveAcreditacionDetailMode,
} from '../views/acreditacionView';
import {
  renderOrganismoAcreditacionView,
  resolveOrganismoDetailMode,
} from '../views/organismoAcreditacionView';
import { renderExtraView } from '../views/extraView';

const ADMIN_PROFILE: UserProfile = {
  id: '11111111-1111-1111-1111-111111111111',
  nombre: 'Administrador Principal',
  role: 'ADMIN',
  status: 'APPROVED',
};

const WORKER_PROFILE: UserProfile = {
  id: '22222222-2222-2222-2222-222222222222',
  nombre: 'Personal Técnico',
  role: 'WORKER',
  status: 'APPROVED',
};

const CLIENT_PROFILE: UserProfile = {
  id: '44444444-4444-4444-4444-444444444444',
  nombre: 'Cliente Externo',
  role: 'CLIENT',
  status: 'APPROVED',
};

const AUDITOR_PROFILE: UserProfile = {
  id: '33333333-3333-3333-3333-333333333333',
  nombre: 'Auditor Técnico',
  role: 'AUDITOR',
  status: 'APPROVED',
};

const SEC_17 = INITIAL_SECTORES_IAF.find((s) => s.sector === 17)!;
const SEC_28 = INITIAL_SECTORES_IAF.find((s) => s.sector === 28)!;

test('Phase 4.1.3: evaluateAccreditationExpiry classifies Vigente, Por Vencer, Vencida, and Sin Vencimiento accurately', () => {
  const ref = '2026-01-01';

  const sinVenc = evaluateAccreditationExpiry(null, ref);
  assert.equal(sinVenc.state, 'Sin Vencimiento');
  assert.equal(sinVenc.daysRemaining, null);

  const vigente = evaluateAccreditationExpiry('2026-06-01', ref);
  assert.equal(vigente.state, 'Vigente');
  assert.ok((vigente.daysRemaining ?? 0) > 90);

  const porVencerExact90 = evaluateAccreditationExpiry('2026-04-01', ref);
  assert.equal(porVencerExact90.state, 'Por Vencer');
  assert.equal(porVencerExact90.daysRemaining, 90);

  const porVencerSameDay = evaluateAccreditationExpiry('2026-01-01', ref);
  assert.equal(porVencerSameDay.state, 'Por Vencer');
  assert.equal(porVencerSameDay.daysRemaining, 0);

  const vencida = evaluateAccreditationExpiry('2025-12-31', ref);
  assert.equal(vencida.state, 'Vencida');
  assert.equal(vencida.daysRemaining, -1);
});

test('Accreditation Strict Multi-Sector Rule: certificates and subsectors match ONLY linked sectores (0 sectors => 0 covered)', () => {
  const certs = [
    { id: 'c1', estatus: 'Activo', norma: 'ISO 9001:2015', sector_iaf: 17 },
    { id: 'c2', estatus: 'Vigente', norma: 'ISO 9001:2015', sector_iaf: 17 },
    { id: 'c3', estatus: 'Cancelado', norma: 'ISO 9001:2015', sector_iaf: 17 },
    { id: 'c4', estatus: 'Suspendido', norma: 'ISO 9001:2015', sector_iaf: 17 },
    { id: 'c5', estatus: 'Activo', norma: 'ISO 9001:2015', sector_iaf: 28 },
    { id: 'c6', estatus: 'En Proceso', norma: 'ISO 14001:2015', sector_iaf: 17 },
  ];

  // Single linked sector (17) => 2 active ISO 9001 certificates in sector 17
  const singleSectorCount = computeActiveCertificatesCountForAccreditation(
    {
      id_norma: 'e0000000-0000-0000-0000-000000009001',
      norma_codigo: 'ISO 9001:2015',
      sectores: [
        { id_sector_iaf: SEC_17.id, sector: 17, descripcion: SEC_17.descripcion },
      ],
    },
    certs
  );
  assert.equal(singleSectorCount, 2);

  // Multi-sector (17 + 28) => 3 active ISO 9001 certificates
  const multiSectorCount = computeActiveCertificatesCountForAccreditation(
    {
      id_norma: 'e0000000-0000-0000-0000-000000009001',
      norma_codigo: 'ISO 9001:2015',
      sectores: [
        { id_sector_iaf: SEC_17.id, sector: 17, descripcion: SEC_17.descripcion },
        { id_sector_iaf: SEC_28.id, sector: 28, descripcion: SEC_28.descripcion },
      ],
    },
    certs
  );
  assert.equal(multiSectorCount, 3);

  // Zero linked sectors => strict 0 coverage (NO legacy "Todos los Sectores" wildcard)
  const zeroSectorScope = {
    id_norma: 'e0000000-0000-0000-0000-000000009001',
    norma_codigo: 'ISO 9001:2015',
    sectores: [],
  };
  assert.equal(computeActiveCertificatesCountForAccreditation(zeroSectorScope, certs), 0);
  assert.equal(getSubsectoresForAccreditation(zeroSectorScope, INITIAL_SUBSECTORES_IAF).length, 0);

  const enriched = enrichAcreditacionesWithImpact(buildInitialAcreditacionEntities(), SAMPLE_CERTIFICATE_RECORDS);
  assert.equal(enriched[0].norma_codigo, 'ISO 9001:2015');
  assert.equal(enriched[0].activeCertificatesCount, 1);
});

test('Step 2.2: validateOrganismoDraft enforces codigo length/uniqueness, nombre, pais, and safe http(s) sitio_web', () => {
  const shortCode = validateOrganismoDraft(
    { codigo: 'X', nombre: 'Organismo X', pais: 'España', sitio_web: '' },
    INITIAL_ORGANISMOS
  );
  assert.equal(shortCode.valid, false);

  const dupCode = validateOrganismoDraft(
    { codigo: 'enac', nombre: 'Otro', pais: 'España', sitio_web: '' },
    INITIAL_ORGANISMOS
  );
  assert.equal(dupCode.valid, false);

  const selfUpdateValid = validateOrganismoDraft(
    {
      codigo: 'enac',
      nombre: INITIAL_ORGANISMOS[0].nombre,
      pais: INITIAL_ORGANISMOS[0].pais,
      sitio_web: 'https://www.enac.es',
    },
    INITIAL_ORGANISMOS,
    INITIAL_ORGANISMOS[0].id
  );
  assert.equal(selfUpdateValid.valid, true);
  assert.equal(selfUpdateValid.normalized?.codigo, 'ENAC');

  const unsafeUrl = validateOrganismoDraft(
    { codigo: 'ONAC', nombre: 'Organismo Nacional', pais: 'Colombia', sitio_web: 'javascript:alert(1)' },
    INITIAL_ORGANISMOS
  );
  assert.equal(unsafeUrl.valid, false);
  assert.equal(normalizeSafeHttpUrl('javascript:alert(1)'), null);
  assert.equal(normalizeSafeHttpUrl('https://onac.org.co'), 'https://onac.org.co');
});

test('Accreditation Refactoring: validateAcreditacionDraft enforces Zero-UUID FKs (organismo, norma, estatus, sector_ids), expiry coherence, and duplicates', () => {
  const existing = buildInitialAcreditacionEntities();
  const suspendedEstatus = INITIAL_ESTATUS_CATALOG.find((e) => e.estatus === 'Suspendido')!;

  const nonUuidOrg = validateAcreditacionDraft(
    {
      id_organismo: 'not-a-uuid',
      id_norma: INITIAL_NORMAS[0].id,
      id_estatus: DEFAULT_ACREDITACION_ESTATUS_ID,
      numero_acreditacion: '01/C-NEW',
      fecha_concesion: '2024-01-10',
      fecha_vencimiento: '',
      sector_ids: [SEC_17.id],
    },
    existing
  );
  assert.equal(nonUuidOrg.valid, false);

  const nonUuidNorma = validateAcreditacionDraft(
    {
      id_organismo: INITIAL_ORGANISMOS[0].id,
      id_norma: 'bad-norma',
      id_estatus: DEFAULT_ACREDITACION_ESTATUS_ID,
      numero_acreditacion: '01/C-NEW',
      fecha_concesion: '2024-01-10',
      fecha_vencimiento: '',
      sector_ids: [],
    },
    existing
  );
  assert.equal(nonUuidNorma.valid, false);

  const nonUuidEstatus = validateAcreditacionDraft(
    {
      id_organismo: INITIAL_ORGANISMOS[0].id,
      id_norma: INITIAL_NORMAS[0].id,
      id_estatus: 'invalid-estatus',
      numero_acreditacion: '01/C-NEW',
      fecha_concesion: '2024-01-10',
      fecha_vencimiento: '',
      sector_ids: [],
    },
    existing
  );
  assert.equal(nonUuidEstatus.valid, false);

  const badSectorId = validateAcreditacionDraft(
    {
      id_organismo: INITIAL_ORGANISMOS[0].id,
      id_norma: INITIAL_NORMAS[0].id,
      id_estatus: DEFAULT_ACREDITACION_ESTATUS_ID,
      numero_acreditacion: '01/C-NEW',
      fecha_concesion: '2024-01-10',
      fecha_vencimiento: '',
      sector_ids: ['not-a-sector-uuid'],
    },
    existing
  );
  assert.equal(badSectorId.valid, false);

  const badDates = validateAcreditacionDraft(
    {
      id_organismo: INITIAL_ORGANISMOS[0].id,
      id_norma: INITIAL_NORMAS[0].id,
      id_estatus: DEFAULT_ACREDITACION_ESTATUS_ID,
      numero_acreditacion: '01/C-NEW',
      fecha_concesion: '2025-05-01',
      fecha_vencimiento: '2025-04-30',
      sector_ids: [SEC_17.id],
    },
    existing
  );
  assert.equal(badDates.valid, false);
  assert.ok(badDates.error?.includes('igual o posterior'));

  const duplicateCheck = validateAcreditacionDraft(
    {
      id_organismo: existing[0].id_organismo,
      id_norma: INITIAL_NORMAS[0].id,
      id_estatus: DEFAULT_ACREDITACION_ESTATUS_ID,
      numero_acreditacion: existing[0].numero_acreditacion,
      fecha_concesion: '2024-01-01',
      fecha_vencimiento: '',
      sector_ids: [SEC_17.id],
    },
    existing
  );
  assert.equal(duplicateCheck.valid, false);

  const selfUpdateDeduplicated = validateAcreditacionDraft(
    {
      id_organismo: existing[0].id_organismo,
      id_norma: INITIAL_NORMAS[0].id,
      id_estatus: suspendedEstatus.id,
      numero_acreditacion: existing[0].numero_acreditacion,
      fecha_concesion: '2024-01-01',
      fecha_vencimiento: '2024-01-01',
      sector_ids: [SEC_17.id, SEC_28.id, SEC_17.id],
    },
    existing,
    existing[0].id
  );
  assert.equal(selfUpdateDeduplicated.valid, true);
  assert.equal(selfUpdateDeduplicated.normalized?.id_estatus, suspendedEstatus.id);
  assert.deepEqual(selfUpdateDeduplicated.normalized?.sector_ids, [SEC_17.id, SEC_28.id]);
});

test('Accreditation Refactoring: mapSupabaseAcreditacionRows resolves estatus_ref, multi-sector links, and soft-deleted child filters without UUID exposure', () => {
  const mapped = mapSupabaseAcreditacionRows(
    [
      {
        id: 'dc000000-0000-0000-0000-000000000010',
        id_organismo: 'db000000-0000-0000-0000-000000000001',
        id_norma: 'e0000000-0000-0000-0000-000000009001',
        id_estatus: DEFAULT_ACREDITACION_ESTATUS_ID,
        numero_acreditacion: '01/C-MULTI-01',
        fecha_concesion: '2024-02-01',
        fecha_vencimiento: '2028-01-31',
        deleted_at: null,
        organismo: {
          id: 'db000000-0000-0000-0000-000000000001',
          codigo: 'ENAC',
          nombre: 'Entidad Nacional de Acreditación',
          pais: 'España',
          sitio_web: 'https://www.enac.es',
        },
        norma: {
          id: 'e0000000-0000-0000-0000-000000009001',
          codigo: 'ISO 9001:2015',
          titulo: 'Sistemas de Gestión de la Calidad — Requisitos',
          norma: 'ISO 9001:2015',
        },
        estatus_ref: {
          id: DEFAULT_ACREDITACION_ESTATUS_ID,
          estatus: 'Activo',
        },
        sectores: [
          {
            id: 'dd000000-0000-0000-0000-000000000011',
            id_sector_iaf: SEC_28.id,
            deleted_at: null,
            sector_iaf: {
              id: SEC_28.id,
              sector: 28,
              descripcion: 'Construcción personalizada',
              deleted_at: null,
            },
          },
          {
            id: 'dd000000-0000-0000-0000-000000000012',
            id_sector_iaf: SEC_17.id,
            deleted_at: '2025-05-01T00:00:00Z',
            sector_iaf: {
              id: SEC_17.id,
              sector: 17,
              descripcion: SEC_17.descripcion,
              deleted_at: null,
            },
          },
        ],
      },
      {
        id: 'dc000000-0000-0000-0000-000000000099',
        id_organismo: 'db000000-0000-0000-0000-000000000001',
        id_norma: 'e0000000-0000-0000-0000-000000009001',
        id_estatus: DEFAULT_ACREDITACION_ESTATUS_ID,
        numero_acreditacion: 'DELETED-001',
        fecha_concesion: '2020-01-01',
        deleted_at: '2025-01-01T00:00:00Z',
      },
    ],
    {
      organismos: INITIAL_ORGANISMOS,
      normas: INITIAL_NORMAS,
      sectores: INITIAL_SECTORES_IAF,
      estatusList: INITIAL_ESTATUS_CATALOG,
      certificates: SAMPLE_CERTIFICATE_RECORDS,
    }
  );

  assert.equal(mapped.length, 1);
  assert.equal(mapped[0].organismo_codigo, 'ENAC');
  assert.equal(mapped[0].norma_codigo, 'ISO 9001:2015');
  assert.equal(mapped[0].estatus, 'Activo');
  assert.equal(mapped[0].sectores.length, 1);
  assert.equal(mapped[0].sectores[0].sector, 28);
  assert.equal(mapped[0].sectores[0].descripcion, 'Construcción personalizada');
  assert.deepEqual(getAcreditacionSectorFacetValues(mapped[0]), ['28']);
  assert.equal(formatAcreditacionSectorsSummary(mapped[0].sectores).shortLabel, 'Sector 28');

  const noSectors = formatAcreditacionSectorsSummary([]);
  assert.equal(noSectors.shortLabel, NO_SECTORS_LABEL);
  assert.deepEqual(getAcreditacionSectorFacetValues({ sectores: [] }), []);
});

test('Step 2.2: renderAcreditacionView Multi View removes inline form & td buttons, enforces reactive facets, RBAC, and Zero-UUID', () => {
  const suspendido = INITIAL_ESTATUS_CATALOG.find((e) => e.estatus === 'Suspendido')!;
  const baseAcreds: AcreditacionDetailEntity[] = [
    ...enrichAcreditacionesWithImpact(buildInitialAcreditacionEntities(), SAMPLE_CERTIFICATE_RECORDS),
    {
      id: 'dc000000-0000-0000-0000-000000000004',
      id_organismo: 'db000000-0000-0000-0000-000000000001',
      organismo_codigo: 'ENAC',
      organismo_nombre: 'Entidad Nacional de Acreditación',
      organismo_pais: 'España',
      organismo_sitio_web: 'https://www.enac.es',
      id_norma: 'e0000000-0000-0000-0000-000000045001',
      norma_codigo: 'ISO 45001:2018',
      norma_titulo: 'Seguridad y Salud en el Trabajo',
      id_estatus: suspendido.id,
      estatus: suspendido.estatus,
      sectores: [],
      sector_ids: [],
      numero_acreditacion: '01/C-SST004',
      fecha_concesion: '2022-04-01',
      fecha_vencimiento: '2026-04-01',
      activeCertificatesCount: 0,
      deleted_at: null,
    },
  ];

  // 1. Admin Multi View Grid Mode
  const adminGridHtml = renderAcreditacionView({
    profile: ADMIN_PROFILE,
    state: {
      selectedAccreditationId: null,
      query: '',
      viewMode: 'grid',
      sortColumn: null,
      sortDirection: 'none',
      isSidebarOpen: true,
      facetSelections: {},
      isCreating: false,
    },
    acreditaciones: baseAcreds,
    organismos: INITIAL_ORGANISMOS,
    normas: INITIAL_NORMAS,
    sectores: INITIAL_SECTORES_IAF,
    estatusList: INITIAL_ESTATUS_CATALOG,
  });

  assert.ok(adminGridHtml.includes('data-mv-domain="acreditaciones"'));
  assert.ok(adminGridHtml.includes('Acreditaciones Vigentes'));
  assert.ok(adminGridHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').includes('Mostrando 4 de 4 acreditaciones registradas'));
  assert.equal(/type=["']search["']/i.test(adminGridHtml), false);
  assert.ok(adminGridHtml.includes('type="text"'));
  assert.ok(adminGridHtml.includes('data-facet-group="organismo"'));
  assert.ok(adminGridHtml.includes('data-facet-group="norma"'));
  assert.ok(adminGridHtml.includes('data-facet-group="sector_iaf"'));
  assert.ok(adminGridHtml.includes('data-facet-group="estatus"'));
  assert.ok(adminGridHtml.includes(NO_SECTORS_LABEL));
  assert.ok(adminGridHtml.includes('data-action="open-organismos-directory"'));
  assert.ok(adminGridHtml.includes('data-action="open-create-acreditacion"'));
  assert.equal(adminGridHtml.includes('id="createAcreditacionForm"'), false);
  assert.equal(assertZeroUuidExposure(adminGridHtml).compliant, true);

  // 2. Reactive Facet Filtering (ENAC -> 2 of 4) + List View without <button> inside <td>
  const filteredTableHtml = renderAcreditacionView({
    profile: WORKER_PROFILE,
    state: {
      selectedAccreditationId: null,
      query: '',
      viewMode: 'list',
      sortColumn: 'numero_acreditacion',
      sortDirection: 'asc',
      isSidebarOpen: true,
      facetSelections: {
        organismo: new Set(['ENAC']),
      },
    },
    acreditaciones: baseAcreds,
    organismos: INITIAL_ORGANISMOS,
    normas: INITIAL_NORMAS,
    sectores: INITIAL_SECTORES_IAF,
    estatusList: INITIAL_ESTATUS_CATALOG,
  });

  assert.ok(filteredTableHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').includes('Mostrando 2 de 4 acreditaciones registradas'));
  assert.ok(filteredTableHtml.includes('01/C-SC001'));
  assert.ok(filteredTableHtml.includes('01/C-SST004'));
  assert.equal(filteredTableHtml.includes('0044-EMS'), false);
  assert.equal(/<td[^>]*>[\s\S]*?<button/i.test(filteredTableHtml), false);
  assert.equal(assertZeroUuidExposure(filteredTableHtml).compliant, true);

  // 3. RBAC: CLIENT & AUDITOR cannot see creation button or enter add/edit mode
  for (const nonStaff of [CLIENT_PROFILE, AUDITOR_PROFILE]) {
    const readOnlyHtml = renderAcreditacionView({
      profile: nonStaff,
      state: {
        selectedAccreditationId: null,
        query: '',
        viewMode: 'grid',
        sortColumn: null,
        sortDirection: 'none',
        isCreating: true,
      },
      acreditaciones: baseAcreds,
      organismos: INITIAL_ORGANISMOS,
      normas: INITIAL_NORMAS,
      sectores: INITIAL_SECTORES_IAF,
      estatusList: INITIAL_ESTATUS_CATALOG,
    });
    assert.equal(readOnlyHtml.includes('data-action="open-create-acreditacion"'), false);
    assert.equal(readOnlyHtml.includes('id="acreditacionDetailForm"'), false);
    assert.equal(assertZeroUuidExposure(readOnlyHtml).compliant, true);
  }
});

test('Accreditation Refactoring: renderAcreditacionView Detail View supports read (3 parent chips + 3 child tabs including Sectores IAF Amparados), add, and edit', () => {
  const initialAcreds = buildInitialAcreditacionEntities(INITIAL_CERTIFICADOS_DETAILED);
  const enacSector17 = initialAcreds[0];

  const covered = filterCoveredCertificatesForAccreditation(
    enacSector17,
    INITIAL_CERTIFICADOS_DETAILED
  );
  assert.ok(covered.length >= 1);
  const subsectores17 = getSubsectoresForAccreditation(enacSector17, INITIAL_SUBSECTORES_IAF);
  assert.ok(subsectores17.length >= 1);

  // 1a. Read Mode (Certificados tab): clickable Organismo, Norma, Estatus chips + Sectores/Certificados/Sub-Sectores tabs
  const detailCertsHtml = renderAcreditacionView({
    profile: ADMIN_PROFILE,
    state: {
      selectedAccreditationId: enacSector17.id,
      activeChildTab: 'certificados',
      query: '',
      viewMode: 'list',
      sortColumn: null,
      sortDirection: 'none',
    },
    acreditaciones: initialAcreds,
    organismos: INITIAL_ORGANISMOS,
    normas: INITIAL_NORMAS,
    sectores: INITIAL_SECTORES_IAF,
    estatusList: INITIAL_ESTATUS_CATALOG,
    certificates: INITIAL_CERTIFICADOS_DETAILED,
    subsectores: INITIAL_SUBSECTORES_IAF,
  });

  assert.ok(detailCertsHtml.includes('rel="noopener noreferrer"'));
  assert.ok(detailCertsHtml.includes('data-parent-nav="true"'));
  assert.ok(detailCertsHtml.includes('data-parent-type="organismo_acreditacion"'));
  assert.ok(detailCertsHtml.includes('data-parent-type="norma"'));
  assert.ok(detailCertsHtml.includes('data-parent-type="estatus"'));
  assert.ok(detailCertsHtml.includes('data-action="open-changelog"'));
  assert.ok(detailCertsHtml.includes('id="startEditAcreditacionBtn"'));
  assert.ok(detailCertsHtml.includes('data-action="open-archive-modal"'));
  assert.ok(detailCertsHtml.includes('data-action="select-cert"'));
  assert.ok(detailCertsHtml.includes('Sectores IAF Amparados'));
  assert.ok(detailCertsHtml.includes('Certificados Amparados'));
  assert.ok(detailCertsHtml.includes('Sub-Sectores IAF del Alcance'));
  assert.equal(/ZONA\s+[1-4]:/.test(detailCertsHtml), false);
  assert.ok(
    detailCertsHtml.indexOf('aria-label="Contexto y relaciones superiores"') <
      detailCertsHtml.indexOf('<hr class="border-t border-slate-200 my-2.5 sm:my-3" />') &&
      detailCertsHtml.indexOf('<hr class="border-t border-slate-200 my-2.5 sm:my-3" />') <
        detailCertsHtml.indexOf('aria-label="Detalle del registro"') &&
      detailCertsHtml.indexOf('aria-label="Detalle del registro"') < detailCertsHtml.indexOf('role="tablist"')
  );
  assert.equal(assertZeroUuidExposure(detailCertsHtml).compliant, true);

  // 1b. Read Mode (Sectores IAF Amparados tab): above-table linkAccredSectorForm + unlink buttons outside <tbody>
  const detailSectoresHtml = renderAcreditacionView({
    profile: WORKER_PROFILE,
    state: {
      selectedAccreditationId: enacSector17.id,
      activeChildTab: 'sectores',
      query: '',
      viewMode: 'list',
      sortColumn: null,
      sortDirection: 'none',
    },
    acreditaciones: initialAcreds,
    organismos: INITIAL_ORGANISMOS,
    normas: INITIAL_NORMAS,
    sectores: INITIAL_SECTORES_IAF,
    estatusList: INITIAL_ESTATUS_CATALOG,
    certificates: INITIAL_CERTIFICADOS_DETAILED,
    subsectores: INITIAL_SUBSECTORES_IAF,
  });
  assert.ok(detailSectoresHtml.includes('id="linkAccredSectorForm"'));
  assert.ok(detailSectoresHtml.includes('id="accredAddSectorSelect"'));
  assert.ok(detailSectoresHtml.includes('data-action="unlink-accred-sector"'));
  assert.ok(detailSectoresHtml.includes('data-resizable-table="extra-accred-tab-sectores"'));
  const sectorsTbody = detailSectoresHtml.match(/<tbody[\s\S]*?<\/tbody>/i)?.[0] || '';
  assert.equal(/<button/i.test(sectorsTbody), false);
  assert.equal(assertZeroUuidExposure(detailSectoresHtml).compliant, true);

  // 2. Add Mode: standalone Detail Form with prefilled Organismo, Estatus parent select, multi-sector checkboxes & top-bar Save/Cancel
  const addHtml = renderAcreditacionView({
    profile: ADMIN_PROFILE,
    state: {
      selectedAccreditationId: null,
      isCreating: true,
      formDraft: createEmptyAcreditacionFormDraft({ id_organismo: INITIAL_ORGANISMOS[0].id }),
      query: '',
      viewMode: 'list',
      sortColumn: null,
      sortDirection: 'none',
    },
    acreditaciones: initialAcreds,
    organismos: INITIAL_ORGANISMOS,
    normas: INITIAL_NORMAS,
    sectores: INITIAL_SECTORES_IAF,
    estatusList: INITIAL_ESTATUS_CATALOG,
  });

  assert.equal(
    resolveAcreditacionDetailMode(
      {
        selectedAccreditationId: null,
        isCreating: true,
        query: '',
        viewMode: 'list',
        sortColumn: null,
        sortDirection: 'none',
      },
      true
    ),
    'add'
  );
  assert.ok(addHtml.includes('Nueva Acreditación'));
  assert.ok(addHtml.includes('id="acreditacionDetailForm"'));
  assert.ok(addHtml.includes('id="saveAcreditacionFormBtn"'));
  assert.ok(addHtml.includes('id="cancelEditAcreditacionBtn"'));
  assert.ok(addHtml.includes('form="acreditacionDetailForm"'));
  assert.ok(addHtml.includes('id="accredParentOrganismoSelect"'));
  assert.ok(addHtml.includes('id="accredParentNormaSelect"'));
  assert.ok(addHtml.includes('id="accredParentEstatusSelect"'));
  assert.ok(addHtml.includes('name="sector_ids"'));
  assert.equal(addHtml.includes('data-action="open-changelog"'), false);
  assert.equal(addHtml.includes('role="tablist"'), false);
  assert.equal(assertZeroUuidExposure(addHtml).compliant, true);

  // 3. Edit Mode: Zone 1 parent selects (including Estatus) + pre-checked sector checkboxes + top-bar Save/Cancel
  const editHtml = renderAcreditacionView({
    profile: WORKER_PROFILE,
    state: {
      selectedAccreditationId: enacSector17.id,
      isEditingAttributes: true,
      formDraft: createAcreditacionDraftFromEntity(enacSector17),
      query: '',
      viewMode: 'list',
      sortColumn: null,
      sortDirection: 'none',
    },
    acreditaciones: initialAcreds,
    organismos: INITIAL_ORGANISMOS,
    normas: INITIAL_NORMAS,
    sectores: INITIAL_SECTORES_IAF,
    estatusList: INITIAL_ESTATUS_CATALOG,
  });
  assert.ok(editHtml.includes('id="acreditacionDetailForm"'));
  assert.ok(editHtml.includes('id="saveAcreditacionFormBtn"'));
  assert.ok(editHtml.includes('id="cancelEditAcreditacionBtn"'));
  assert.ok(editHtml.includes('id="accredParentOrganismoSelect"'));
  assert.ok(editHtml.includes('id="accredParentNormaSelect"'));
  assert.ok(editHtml.includes('id="accredParentEstatusSelect"'));
  assert.ok(editHtml.includes('checked'));
  assert.equal(editHtml.includes('Guardar Cambios'), false);
  assert.equal(assertZeroUuidExposure(editHtml).compliant, true);

  // 4. Zero-sector accreditation shows strict empty states (0 certs, 0 subsectors)
  const subsectoresPopulatedHtml = renderAcreditacionView({
    profile: WORKER_PROFILE,
    state: {
      selectedAccreditationId: enacSector17.id,
      activeChildTab: 'subsectores',
      query: '',
      viewMode: 'list',
      sortColumn: null,
      sortDirection: 'none',
    },
    acreditaciones: initialAcreds,
    organismos: INITIAL_ORGANISMOS,
    normas: INITIAL_NORMAS,
    sectores: INITIAL_SECTORES_IAF,
    estatusList: INITIAL_ESTATUS_CATALOG,
    certificates: INITIAL_CERTIFICADOS_DETAILED,
    subsectores: INITIAL_SUBSECTORES_IAF,
  });
  assert.ok(subsectoresPopulatedHtml.includes('data-resizable-table="extra-accred-tab-subsectores"'));
  assert.equal(assertZeroUuidExposure(subsectoresPopulatedHtml).compliant, true);

  const zeroSectorAcr: AcreditacionDetailEntity = {
    ...enacSector17,
    id: 'dc000000-0000-0000-0000-000000000088',
    numero_acreditacion: '01/C-EMPTY88',
    sectores: [],
    sector_ids: [],
    activeCertificatesCount: 0,
  };
  const subsectoresHtml = renderAcreditacionView({
    profile: WORKER_PROFILE,
    state: {
      selectedAccreditationId: zeroSectorAcr.id,
      activeChildTab: 'subsectores',
      query: '',
      viewMode: 'list',
      sortColumn: null,
      sortDirection: 'none',
    },
    acreditaciones: [zeroSectorAcr],
    organismos: INITIAL_ORGANISMOS,
    normas: INITIAL_NORMAS,
    sectores: INITIAL_SECTORES_IAF,
    estatusList: INITIAL_ESTATUS_CATALOG,
    certificates: INITIAL_CERTIFICADOS_DETAILED,
    subsectores: INITIAL_SUBSECTORES_IAF,
  });

  assert.ok(subsectoresHtml.includes(NO_SECTORS_LABEL));
  assert.ok(subsectoresHtml.includes('Sin sub-sectores IAF detallados'));
  assert.ok(subsectoresHtml.includes('No hay sub-sectores técnicos registrados'));
  assert.equal(assertZeroUuidExposure(subsectoresHtml).compliant, true);

  // 5. RBAC: CLIENT & AUDITOR never enter edit or link/unlink sectors or archive
  for (const nonStaff of [CLIENT_PROFILE, AUDITOR_PROFILE]) {
    const readOnlyHtml = renderAcreditacionView({
      profile: nonStaff,
      state: {
        selectedAccreditationId: enacSector17.id,
        activeChildTab: 'sectores',
        isEditingAttributes: true,
        query: '',
        viewMode: 'list',
        sortColumn: null,
        sortDirection: 'none',
      },
      acreditaciones: initialAcreds,
      organismos: INITIAL_ORGANISMOS,
      normas: INITIAL_NORMAS,
      sectores: INITIAL_SECTORES_IAF,
      estatusList: INITIAL_ESTATUS_CATALOG,
      certificates: INITIAL_CERTIFICADOS_DETAILED,
      subsectores: INITIAL_SUBSECTORES_IAF,
    });
    assert.equal(readOnlyHtml.includes('id="startEditAcreditacionBtn"'), false);
    assert.equal(readOnlyHtml.includes('id="acreditacionDetailForm"'), false);
    assert.equal(readOnlyHtml.includes('id="linkAccredSectorForm"'), false);
    assert.equal(readOnlyHtml.includes('data-action="unlink-accred-sector"'), false);
    assert.equal(readOnlyHtml.includes('data-action="open-archive-modal"'), false);
    assert.equal(assertZeroUuidExposure(readOnlyHtml).compliant, true);
  }
});

test('Step 2.2: renderOrganismoAcreditacionView supports Multi View + 3-mode Detail View, child accreditations tab, RBAC, and Zero-UUID', () => {
  const initialAcreds = buildInitialAcreditacionEntities(INITIAL_CERTIFICADOS_DETAILED);

  // 1. Multi View via renderExtraView('organismos')
  const multiHtml = renderExtraView(ADMIN_PROFILE, {
    activeSubSection: 'organismos',
    standards: INITIAL_NORMAS,
    requirements: [],
    iafSectors: INITIAL_SECTORES_IAF,
    catalogs: [],
    loading: false,
    organismos: INITIAL_ORGANISMOS,
    accreditations: initialAcreds,
    organismoState: {
      selectedOrganismoId: null,
      query: '',
      viewMode: 'list',
      sortColumn: null,
      sortDirection: 'none',
      isSidebarOpen: true,
      facetSelections: {},
    },
  });

  assert.ok(multiHtml.includes('data-mv-domain="organismos"'));
  assert.ok(multiHtml.includes('Organismos de Acreditación'));
  assert.ok(multiHtml.includes('data-action="open-accreditations-directory"'));
  assert.ok(multiHtml.includes('data-action="open-create-organismo"'));
  assert.ok(multiHtml.includes('ENAC'));
  assert.equal(/<td[^>]*>[\s\S]*?<button/i.test(multiHtml), false);
  assert.equal(assertZeroUuidExposure(multiHtml).compliant, true);

  // 2. Detail Read Mode with child acreditaciones tab + "+ Nueva Acreditación" CTA
  const detailReadHtml = renderOrganismoAcreditacionView({
    profile: WORKER_PROFILE,
    state: {
      selectedOrganismoId: INITIAL_ORGANISMOS[0].id,
      activeChildTab: 'acreditaciones',
      query: '',
      viewMode: 'grid',
      sortColumn: null,
      sortDirection: 'none',
    },
    organismos: INITIAL_ORGANISMOS,
    acreditaciones: initialAcreds,
  });

  assert.ok(detailReadHtml.includes('data-action="back-to-organismos-list"'));
  assert.ok(detailReadHtml.includes('id="startEditOrganismoBtn"'));
  assert.ok(detailReadHtml.includes('data-action="open-changelog"'));
  assert.ok(detailReadHtml.includes('data-action="open-archive-modal"'));
  assert.ok(detailReadHtml.includes('data-action="open-create-acreditacion"'));
  assert.ok(detailReadHtml.includes('org-accred-tab-acreditaciones'));
  assert.ok(detailReadHtml.includes('rel="noopener noreferrer"'));
  assert.equal(assertZeroUuidExposure(detailReadHtml).compliant, true);

  // 3. Detail Add & Edit Modes
  const addOrgHtml = renderOrganismoAcreditacionView({
    profile: ADMIN_PROFILE,
    state: {
      selectedOrganismoId: null,
      isCreating: true,
      formDraft: createEmptyOrganismoFormDraft(),
      query: '',
      viewMode: 'grid',
      sortColumn: null,
      sortDirection: 'none',
    },
    organismos: INITIAL_ORGANISMOS,
    acreditaciones: initialAcreds,
  });
  assert.ok(addOrgHtml.includes('Nuevo Organismo de Acreditación'));
  assert.ok(addOrgHtml.includes('id="organismoDetailForm"'));
  assert.ok(addOrgHtml.includes('id="saveOrganismoFormBtn"'));
  assert.ok(addOrgHtml.includes('id="cancelEditOrganismoBtn"'));
  assert.equal(addOrgHtml.includes('role="tablist"'), false);
  assert.equal(assertZeroUuidExposure(addOrgHtml).compliant, true);

  const editOrgHtml = renderOrganismoAcreditacionView({
    profile: ADMIN_PROFILE,
    state: {
      selectedOrganismoId: INITIAL_ORGANISMOS[0].id,
      isEditingAttributes: true,
      formDraft: createOrganismoDraftFromEntity(INITIAL_ORGANISMOS[0]),
      query: '',
      viewMode: 'grid',
      sortColumn: null,
      sortDirection: 'none',
    },
    organismos: INITIAL_ORGANISMOS,
    acreditaciones: initialAcreds,
  });
  assert.ok(editOrgHtml.includes('id="organismoDetailForm"'));
  assert.ok(editOrgHtml.includes(`value="${INITIAL_ORGANISMOS[0].codigo}"`));
  assert.equal(assertZeroUuidExposure(editOrgHtml).compliant, true);

  // 4. RBAC: CLIENT & AUDITOR stay read-only
  for (const nonStaff of [CLIENT_PROFILE, AUDITOR_PROFILE]) {
    assert.equal(
      resolveOrganismoDetailMode(
        {
          selectedOrganismoId: INITIAL_ORGANISMOS[0].id,
          isEditingAttributes: true,
          query: '',
          viewMode: 'grid',
          sortColumn: null,
          sortDirection: 'none',
        },
        false,
        INITIAL_ORGANISMOS[0]
      ),
      'read'
    );
    const clientOrgHtml = renderOrganismoAcreditacionView({
      profile: nonStaff,
      state: {
        selectedOrganismoId: INITIAL_ORGANISMOS[0].id,
        isEditingAttributes: true,
        query: '',
        viewMode: 'grid',
        sortColumn: null,
        sortDirection: 'none',
      },
      organismos: INITIAL_ORGANISMOS,
      acreditaciones: initialAcreds,
    });
    assert.equal(clientOrgHtml.includes('id="startEditOrganismoBtn"'), false);
    assert.equal(clientOrgHtml.includes('id="organismoDetailForm"'), false);
    assert.equal(clientOrgHtml.includes('data-action="open-create-acreditacion"'), false);
    assert.equal(clientOrgHtml.includes('data-action="open-archive-modal"'), false);
    assert.equal(assertZeroUuidExposure(clientOrgHtml).compliant, true);
  }
});
