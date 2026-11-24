import test from 'node:test';
import assert from 'node:assert/strict';
import type { OrganizacionEntity } from '../lib/activeCertificates';
import type { ProgramacionAuditEntity } from '../lib/auditExecution';
import type { ProgramaAuditoriaEntity } from '../lib/auditPlanningEngine';
import type { ConglomeradoEntity } from '../lib/conglomeradoDomain';
import type { UserProfile } from '../lib/healthCheck';
import type { VinculoEntity } from '../lib/vinculoDomain';
import type { SoftDeletableCertificado } from '../lib/vinculoDomain';
import { assertZeroUuidExposure } from '../lib/zeroUuid';
import { renderAuditoriasView } from './auditoriasView';
import {
  DEFAULT_RELACION_STATE,
  renderRelacionView,
  type RelacionViewState,
} from './relacionView';

const ADMIN_PROFILE: UserProfile = {
  id: '10000000-0000-0000-0000-000000000001',
  nombre: 'Admin Principal',
  role: 'ADMIN',
  status: 'APPROVED',
  created_at: '2026-01-01T00:00:00Z',
};

const WORKER_PROFILE: UserProfile = {
  id: '10000000-0000-0000-0000-000000000002',
  nombre: 'Operador QA',
  role: 'WORKER',
  status: 'APPROVED',
  created_at: '2026-01-01T00:00:00Z',
};

const AUDITOR_PROFILE: UserProfile = {
  id: '10000000-0000-0000-0000-000000000003',
  nombre: 'Auditor Asignado',
  role: 'AUDITOR',
  status: 'APPROVED',
  created_at: '2026-01-01T00:00:00Z',
};

const CLIENT_PROFILE: UserProfile = {
  id: '10000000-0000-0000-0000-000000000004',
  nombre: 'Contacto Cliente',
  role: 'CLIENT',
  status: 'APPROVED',
  created_at: '2026-01-01T00:00:00Z',
};

const UUID_CONG_1 = '20000000-0000-0000-0000-000000000001';
const UUID_ORG_1 = '30000000-0000-0000-0000-000000000001';
const UUID_ORG_2 = '30000000-0000-0000-0000-000000000002';
const UUID_CERT_1 = '40000000-0000-0000-0000-000000000001';
const UUID_CERT_2 = '40000000-0000-0000-0000-000000000002';
const UUID_VINC_1 = '50000000-0000-0000-0000-000000000001';
const UUID_PROG_1 = '60000000-0000-0000-0000-000000000001';
const UUID_AUD_NEW = '70000000-0000-0000-0000-000000000001';
const UUID_AUD_OLD = '70000000-0000-0000-0000-000000000002';
const UUID_AUD_SIB = '70000000-0000-0000-0000-000000000003';

function assertCleanZeroUuid(label: string, html: string): void {
  const check = assertZeroUuidExposure(html);
  assert.equal(
    check.compliant,
    true,
    `${label} exposed raw UUID(s): ${check.exposedUuids.join(', ')}`
  );
}

function buildFixtures(): {
  conglomerados: ConglomeradoEntity[];
  organizaciones: OrganizacionEntity[];
  certificados: SoftDeletableCertificado[];
  vinculos: VinculoEntity[];
  programs: ProgramaAuditoriaEntity[];
  audits: ProgramacionAuditEntity[];
} {
  const conglomerados: ConglomeradoEntity[] = [
    {
      id: UUID_CONG_1,
      codigo_grupo: 'GRP-IND',
      nombre: 'Grupo Industrial Norte',
      abreviacion: 'IND-NORTE',
      estatus: 'Activo',
      es_individual_auto: false,
      deleted_at: null,
    },
  ];

  const organizaciones: OrganizacionEntity[] = [
    {
      id: UUID_ORG_1,
      id_grupo_empresarial: UUID_CONG_1,
      grupo_empresarial_nombre: 'Grupo Industrial Norte',
      nombre: 'Alimentos Andinos C.A.',
      abreviacion: 'ANDINOS',
      rif: 'J-30000001-1',
      estatus: 'Activo',
      deleted_at: null,
    },
    {
      id: UUID_ORG_2,
      nombre: 'Servicios Independientes S.A.',
      abreviacion: 'SERV-IND',
      rif: 'J-30000002-2',
      estatus: 'Activo',
      deleted_at: null,
    },
  ];

  const certificados: SoftDeletableCertificado[] = [
    {
      id: UUID_CERT_1,
      numero_certificado: 'FN-QMS-2026-001',
      id_organizacion: UUID_ORG_1,
      organizacion_nombre: 'Alimentos Andinos C.A.',
      organizacion_abreviacion: 'ANDINOS',
      organizacion_rif: 'J-30000001-1',
      id_norma: '90000000-0000-0000-0000-000000000001',
      norma_codigo: 'ISO 9001:2015',
      norma_titulo: 'Calidad',
      esquema: 'ISO 9001:2015',
      id_estatus: '91000000-0000-0000-0000-000000000001',
      estatus: 'Activo',
      id_sector_iaf: '92000000-0000-0000-0000-000000000001',
      sector_iaf: 3,
      sector_iaf_descripcion: 'Alimentos',
      id_subsector_iaf: '93000000-0000-0000-0000-000000000001',
      fecha_emision: '2025-01-10',
      fecha_vencimiento: '2028-01-09',
      alcance: 'Producción de alimentos procesados.',
      multisitio: false,
      sitios: [],
      procesos: [],
      turnos: [],
      noAplicables: [],
      auditorias: [],
      fechas: [],
      contactos: [],
      deleted_at: null,
    },
    {
      id: UUID_CERT_2,
      numero_certificado: 'FN-EMS-2026-002',
      id_organizacion: UUID_ORG_2,
      organizacion_nombre: 'Servicios Independientes S.A.',
      organizacion_abreviacion: 'SERV-IND',
      organizacion_rif: 'J-30000002-2',
      id_norma: '90000000-0000-0000-0000-000000000002',
      norma_codigo: 'ISO 14001:2015',
      norma_titulo: 'Ambiente',
      esquema: 'ISO 14001:2015',
      id_estatus: '91000000-0000-0000-0000-000000000001',
      estatus: 'Activo',
      id_sector_iaf: '92000000-0000-0000-0000-000000000002',
      sector_iaf: 28,
      sector_iaf_descripcion: 'Servicios',
      id_subsector_iaf: '93000000-0000-0000-0000-000000000002',
      fecha_emision: '2025-02-15',
      fecha_vencimiento: '2028-02-14',
      alcance: 'Gestión logística integral.',
      multisitio: false,
      sitios: [],
      procesos: [],
      turnos: [],
      noAplicables: [],
      auditorias: [],
      fechas: [],
      contactos: [],
      deleted_at: null,
    },
  ];

  const vinculos: VinculoEntity[] = [
    {
      id: UUID_VINC_1,
      id_grupo_empresarial: UUID_CONG_1,
      grupo_nombre: 'Grupo Industrial Norte',
      codigo_vinculo: 'VINC-INT-01',
      etiqueta: 'Campaña Integrada QMS/EMS',
      nivel_vinculacion: 'NIVEL_1_INTRA_ORG',
      tipo_vinculacion: 'Integrada',
      tiene_sitio_temporal: false,
      notas: null,
      estatus: 'Activo',
      certificados: [
        {
          id: '51000000-0000-0000-0000-000000000001',
          id_vinculo: UUID_VINC_1,
          id_certificado: UUID_CERT_1,
          numero_certificado: 'FN-QMS-2026-001',
          norma_codigo: 'ISO 9001:2015',
          id_organizacion: UUID_ORG_1,
          organizacion_nombre: 'Alimentos Andinos C.A.',
          organizacion_abreviacion: 'ANDINOS',
          tipo_vinculacion_override: null,
          deleted_at: null,
        },
      ],
      deleted_at: null,
    },
  ];

  const audNew: ProgramacionAuditEntity = {
    id: UUID_AUD_NEW,
    id_programa_auditoria: UUID_PROG_1,
    codigo_auditoria: 'AUD-2026-QMS-S1',
    id_certificado: UUID_CERT_1,
    numero_certificado: 'FN-QMS-2026-001',
    id_organizacion: UUID_ORG_1,
    organizacion_nombre: 'Alimentos Andinos C.A.',
    organizacion_abreviacion: 'ANDINOS',
    norma_codigo: 'ISO 9001:2015',
    sector_iaf: 3,
    tipo_auditoria: 'Seguimiento 1',
    tipo_auditoria_abreviacion: 'Seg.1',
    metodologia: 'Presencial',
    tipo_vinculacion: 'Integrada',
    fecha_inicio: '2026-11-10',
    fecha_fin: '2026-11-12',
    auditor_lider_id: AUDITOR_PROFILE.id,
    auditor_lider_nombre: 'Auditor Asignado',
    estatus: 'Planificado',
    estado_ciclo: 'Programada',
    dias_auditor_planificados: 2,
    cobertura_porcentaje: 80,
    equipo: [],
    sitios_muestra: [],
    sitios_plan: [],
    fechas: [
      {
        id: '81000000-0000-0000-0000-000000000001',
        id_auditoria: UUID_AUD_NEW,
        numero_secuencia: 1,
        tipo_fecha: 'REAL',
        fecha_inicio: '2026-11-10',
        fecha_fin: '2026-11-12',
        deleted_at: null,
      },
    ],
    deleted_at: null,
  };

  const audOld: ProgramacionAuditEntity = {
    id: UUID_AUD_OLD,
    codigo_auditoria: 'AUD-2025-QMS-INI',
    id_certificado: UUID_CERT_1,
    numero_certificado: 'FN-QMS-2026-001',
    id_organizacion: UUID_ORG_1,
    organizacion_nombre: 'Alimentos Andinos C.A.',
    organizacion_abreviacion: 'ANDINOS',
    norma_codigo: 'ISO 9001:2015',
    sector_iaf: 3,
    tipo_auditoria: 'Etapa 2',
    tipo_auditoria_abreviacion: 'Etp.2',
    metodologia: 'Presencial',
    tipo_vinculacion: 'Combinada',
    fecha_inicio: '2025-11-04',
    fecha_fin: '2025-11-06',
    auditor_lider_id: '10000000-0000-0000-0000-000000000099',
    auditor_lider_nombre: 'Otro Auditor',
    estatus: 'Cerrada',
    estado_ciclo: 'Cerrada',
    dias_auditor_planificados: 3,
    cobertura_porcentaje: 100,
    equipo: [],
    sitios_muestra: [],
    sitios_plan: [],
    fechas: [],
    deleted_at: null,
  };

  const audSib: ProgramacionAuditEntity = {
    id: UUID_AUD_SIB,
    id_programa_auditoria: UUID_PROG_1,
    codigo_auditoria: 'AUD-2026-EMS-S1',
    id_certificado: UUID_CERT_2,
    numero_certificado: 'FN-EMS-2026-002',
    id_organizacion: UUID_ORG_2,
    organizacion_nombre: 'Servicios Independientes S.A.',
    organizacion_abreviacion: 'SERV-IND',
    norma_codigo: 'ISO 14001:2015',
    sector_iaf: 28,
    tipo_auditoria: 'Seguimiento 1',
    tipo_auditoria_abreviacion: 'Seg.1',
    metodologia: 'Presencial',
    tipo_vinculacion: 'Integrada',
    fecha_inicio: '2026-11-12',
    fecha_fin: '2026-11-13',
    auditor_lider_id: '10000000-0000-0000-0000-000000000099',
    auditor_lider_nombre: 'Otro Auditor',
    estatus: 'Planificado',
    estado_ciclo: 'Programada',
    dias_auditor_planificados: 1.5,
    cobertura_porcentaje: 60,
    equipo: [],
    sitios_muestra: [],
    sitios_plan: [],
    fechas: [],
    deleted_at: null,
  };

  const programs: ProgramaAuditoriaEntity[] = [
    {
      id: UUID_PROG_1,
      codigo_programa: 'PROG-2026-01',
      etiqueta: 'Campaña QMS + EMS',
      id_vinculo: UUID_VINC_1,
      nivel_vinculacion: 'NIVEL_2_INTER_ORG',
      tipo_vinculacion: 'Integrada',
      es_vinculada: true,
      tiene_sitio_temporal: false,
      estatus: 'Activo',
      auditorias: [audNew, audSib],
      deleted_at: null,
    },
  ];

  return {
    conglomerados,
    organizaciones,
    certificados,
    vinculos,
    programs,
    audits: [audNew, audOld, audSib],
  };
}

function buildBaseState(overrides: Partial<RelacionViewState> = {}): RelacionViewState {
  return {
    ...DEFAULT_RELACION_STATE,
    facetSelections: {},
    ...overrides,
  };
}

test('Step 3.2 Relación Multi View: table-fixed, 5-col <colgroup>=100%, 0 <button> in <tbody>, short names & compact codenames, Zero-UUID', () => {
  const fx = buildFixtures();
  const listHtml = renderRelacionView({
    profile: ADMIN_PROFILE,
    state: buildBaseState({ viewMode: 'list' }),
    ...fx,
    headerAddAuditHtml: '<button type="button" data-action="open-add-audit-wizard">+ Auditoría</button>',
  });

  assert.ok(listHtml.includes('data-mv-domain="relacion"'));
  assert.ok(listHtml.includes('data-resizable-table="relacion-main"'));
  assert.ok(listHtml.includes('IND-NORTE'));
  assert.ok(listHtml.includes('SERV-IND'));
  assert.ok(listHtml.includes('2026-11 Seg.1'));
  assert.ok(listHtml.includes('Campaña Integrada QMS/EMS'));
  assert.ok(listHtml.includes('Libre'));
  assert.ok(listHtml.includes('data-action="open-add-audit-wizard"'));
  assert.ok(listHtml.includes('table-fixed'));

  const colWidths = [...listHtml.matchAll(/<col\b[^>]*style="width:\s*([\d.]+)%/g)].map((m) =>
    Number(m[1])
  );
  assert.equal(colWidths.length, 5);
  assert.equal(
    colWidths.reduce((acc, n) => acc + n, 0),
    100
  );

  const tbodyMatch = listHtml.match(/<tbody[\s\S]*?<\/tbody>/i);
  assert.ok(tbodyMatch);
  assert.equal(/<button\b/i.test(tbodyMatch[0]), false);
  assert.ok(tbodyMatch[0].includes('data-action="open-relacion-picker"'));
  assertCleanZeroUuid('Relacion Multi View List', listHtml);

  // Grid View also triggers picker
  const gridHtml = renderRelacionView({
    profile: ADMIN_PROFILE,
    state: buildBaseState({ viewMode: 'grid' }),
    ...fx,
  });
  assert.ok(gridHtml.includes('data-action="open-relacion-picker"'));
  assert.ok(gridHtml.includes('2026-11 Seg.1'));
  assertCleanZeroUuid('Relacion Multi View Grid', gridHtml);
});

test('Step 3.2 Relación Picker Pop-up: clicking a group renders modal grouped by certificate with newest-first compact codenames', () => {
  const fx = buildFixtures();
  const pickerHtml = renderRelacionView({
    profile: ADMIN_PROFILE,
    state: buildBaseState({
      pickerTargetGroupKey: `cong:${UUID_CONG_1}`,
    }),
    ...fx,
  });

  assert.ok(pickerHtml.includes('id="relacionPickerModal"'));
  assert.ok(pickerHtml.includes('role="dialog"'));
  assert.ok(pickerHtml.includes('FN-QMS-2026-001'));
  assert.ok(pickerHtml.includes('ISO 9001:2015'));
  assert.ok(pickerHtml.includes('2026-11 Seg.1'));
  assert.ok(pickerHtml.includes('2025-11 Etp.2'));
  assert.ok(pickerHtml.includes('data-action="select-relacion-audit"'));
  assert.ok(pickerHtml.includes('data-action="close-relacion-picker"'));

  // Verify newest-first ordering inside Picker Pop-up
  const idxNew = pickerHtml.indexOf('2026-11 Seg.1');
  const idxOld = pickerHtml.indexOf('2025-11 Etp.2');
  assert.ok(idxNew !== -1 && idxOld !== -1 && idxNew < idxOld);
  assertCleanZeroUuid('Relacion Picker Modal', pickerHtml);
});

test('Step 3.2 Relación Detail View + Pipeline Stepper: renders Step 1 Relación before Step 2 Designación, 5-col <colgroup>=100%, 0 <button> in <tbody>, RBAC selects for STAFF only', () => {
  const fx = buildFixtures();

  const staffHtml = renderAuditoriasView(WORKER_PROFILE, {
    activeSubSection: 'relacion',
    selectedCertId: UUID_CERT_1,
    selectedAuditId: UUID_AUD_NEW,
    relacionState: buildBaseState({
      selectedCertId: UUID_CERT_1,
      selectedAuditId: UUID_AUD_NEW,
    }),
    programacionState: {
      selectedAuditId: null,
      activeChildTab: 'equipo',
      query: '',
      selectedTipo: 'ALL',
      selectedMetodologia: 'ALL',
      selectedEstatus: 'ALL',
      selectedAuditorLider: 'ALL',
      viewMode: 'list',
      sortColumn: null,
      sortDirection: 'none',
      isPlanningModalOpen: false,
      isEditingAttributes: false,
      isAddingTeamMember: false,
    },
    calendarioState: {
      displayMode: 'mes',
      referenceYear: 2026,
      referenceMonth: 11,
      filterAuditorId: 'ALL',
      filterStandard: 'ALL',
      filterMethodology: 'ALL',
      drawerAuditId: null,
    },
    resultadoState: {
      selectedAuditId: 'ALL',
      activeAuditIdForDecision: null,
      displayMode: 'list',
      filterType: 'ALL',
      filterLifecycle: 'ALL',
      searchQuery: '',
      isLoggingFinding: false,
      inspectingFindingId: null,
    },
    allVinculos: fx.vinculos,
    allConglomerados: fx.conglomerados,
    organizaciones: fx.organizaciones,
    allCertificadosDetailed: [],
    auditPrograms: fx.programs,
    programacionAudits: fx.audits,
    phase5Findings: [],
    allAuditorsDetailed: [],
    certificates: [],
    processes: [],
    requirements: [],
    standards: [{ norma: 'ISO 9001:2015' }],
    loading: false,
  });

  // In-card Pipeline Stepper shows 1. Relación active before 2. Designación
  assert.ok(staffHtml.includes('data-audit-card-breadcrumb="true"'));
  assert.ok(staffHtml.includes('1. Relación'));
  assert.ok(staffHtml.includes('2. Designación'));
  assert.ok(staffHtml.indexOf('1. Relación') < staffHtml.indexOf('2. Designación'));
  assert.match(
    staffHtml,
    /data-step-id="relacion"[^>]*aria-current="page"/
  );

  // Detail table integrity
  const tableMatch = staffHtml.match(/<table id="relacion-detail-table"[\s\S]*?<\/table>/i);
  assert.ok(tableMatch);
  assert.ok(tableMatch[0].includes('table-fixed'));
  const colWidths = [...tableMatch[0].matchAll(/<col\b[^>]*style="width:\s*([\d.]+)%/g)].map(
    (m) => Number(m[1])
  );
  assert.deepEqual(colWidths, [22, 18, 22, 24, 14]);
  assert.equal(
    colWidths.reduce((acc, n) => acc + n, 0),
    100
  );

  const tbodyMatch = tableMatch[0].match(/<tbody[\s\S]*?<\/tbody>/i);
  assert.ok(tbodyMatch);
  assert.equal(/<button\b/i.test(tbodyMatch[0]), false);
  assert.ok(tbodyMatch[0].includes('data-action="change-audit-relacion"'));
  assert.ok(tbodyMatch[0].includes('2026-11 Seg.1'));
  assert.ok(tbodyMatch[0].includes('Campaña Integrada QMS/EMS'));
  assertCleanZeroUuid('Relacion Detail View STAFF', staffHtml);

  // Strict RBAC read-only verification for AUDITOR & CLIENT
  for (const readOnlyProfile of [AUDITOR_PROFILE, CLIENT_PROFILE]) {
    const roHtml = renderRelacionView({
      profile: readOnlyProfile,
      state: buildBaseState({
        selectedCertId: UUID_CERT_1,
        selectedAuditId: UUID_AUD_NEW,
      }),
      authorizedClientOrgIds: readOnlyProfile.role === 'CLIENT' ? [UUID_ORG_1] : [],
      ...fx,
      headerAddAuditHtml: '<button type="button" data-action="open-add-audit-wizard">+ Auditoría</button>',
    });
    assert.equal(roHtml.includes('data-action="change-audit-relacion"'), false);
    assert.equal(roHtml.includes('data-action="change-batch-relacion"'), false);
    assert.equal(roHtml.includes('data-action="apply-relacion-vinculo-base"'), false);
    assert.ok(roHtml.includes('data-testid="relacion-readonly-nature"'));
    // Sibling org/cert from campaign must NOT leak to AUDITOR or CLIENT
    assert.equal(roHtml.includes('FN-EMS-2026-002'), false);
    assertCleanZeroUuid(`Relacion Detail View ${readOnlyProfile.role}`, roHtml);
  }
});
