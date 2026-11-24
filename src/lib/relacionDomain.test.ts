import test from 'node:test';
import assert from 'node:assert/strict';

import type { OrganizacionEntity } from './activeCertificates';
import type { ProgramacionAuditEntity } from './auditExecution';
import type { ProgramaAuditoriaEntity } from './auditPlanningEngine';
import type { ConglomeradoEntity } from './conglomeradoDomain';
import type { UserProfile } from './healthCheck';
import type { SoftDeletableCertificado, VinculoEntity } from './vinculoDomain';
import {
  buildRelacionDetailModel,
  buildRelacionMultiRows,
  buildRelacionPickerModel,
  createDefaultRelacionViewState,
  DEFAULT_RELACION_VIEW_STATE,
  filterRelacionMultiRows,
  RELACION_FACET_CATEGORIES,
  validateAuditRelacionUpdate,
} from './relacionDomain';
import { containsRawUuid } from './zeroUuid';

const ADMIN_PROFILE: UserProfile = {
  id: '10000000-0000-4000-8000-000000000001',
  nombre: 'Admin Principal',
  role: 'ADMIN',
  status: 'APPROVED',
};

const WORKER_PROFILE: UserProfile = {
  id: '10000000-0000-4000-8000-000000000002',
  nombre: 'Coordinador Operativo',
  role: 'WORKER',
  status: 'APPROVED',
};

const AUDITOR_PROFILE: UserProfile = {
  id: '10000000-0000-4000-8000-000000000003',
  nombre: 'Ing. Elena Vargas',
  role: 'AUDITOR',
  status: 'APPROVED',
};

const CLIENT_PROFILE: UserProfile = {
  id: '10000000-0000-4000-8000-000000000004',
  nombre: 'Titular Cliente Alpha',
  role: 'CLIENT',
  status: 'APPROVED',
};

const PENDING_PROFILE: UserProfile = {
  id: '10000000-0000-4000-8000-000000000005',
  nombre: 'Pendiente',
  role: 'ADMIN',
  status: 'PENDING',
};

const CONG_HOLDING_ID = '20000000-0000-4000-8000-000000000001';
const CONG_SOLO_ID = '20000000-0000-4000-8000-000000000002';

const ORG_ALPHA_ID = '30000000-0000-4000-8000-000000000001';
const ORG_BETA_ID = '30000000-0000-4000-8000-000000000002';
const ORG_SOLO_ID = '30000000-0000-4000-8000-000000000003';

const CERT_ALPHA_1_ID = '40000000-0000-4000-8000-000000000001';
const CERT_BETA_1_ID = '40000000-0000-4000-8000-000000000002';
const CERT_SOLO_LIBRE_ID = '40000000-0000-4000-8000-000000000003';

const VINC_N2_ID = '50000000-0000-4000-8000-000000000001';
const PROG_N2_ID = '60000000-0000-4000-8000-000000000001';
const PROG_SOLO_ID = '60000000-0000-4000-8000-000000000002';

const AUDIT_ALPHA_OLD_ID = '70000000-0000-4000-8000-000000000001';
const AUDIT_ALPHA_NEW_ID = '70000000-0000-4000-8000-000000000002';
const AUDIT_BETA_ID = '70000000-0000-4000-8000-000000000003';
const AUDIT_SOLO_ID = '70000000-0000-4000-8000-000000000004';
const AUDIT_DELETED_ID = '70000000-0000-4000-8000-000000000099';

function createFixtureDataset(): {
  conglomerados: ConglomeradoEntity[];
  organizaciones: OrganizacionEntity[];
  certificados: SoftDeletableCertificado[];
  vinculos: VinculoEntity[];
  programs: ProgramaAuditoriaEntity[];
  audits: ProgramacionAuditEntity[];
} {
  const conglomerados: ConglomeradoEntity[] = [
    {
      id: CONG_HOLDING_ID,
      codigo_grupo: 'CONG-HOLD',
      nombre: 'Grupo Industrial Iberometal',
      abreviacion: 'IBEROMETAL',
      es_individual_auto: false,
      notas: null,
      deleted_at: null,
    },
    {
      id: CONG_SOLO_ID,
      codigo_grupo: 'CONG-SOLO',
      nombre: 'BioAlimentos del Sur S.A.',
      abreviacion: 'BIOALIM',
      es_individual_auto: true,
      notas: null,
      deleted_at: null,
    },
  ];

  const organizaciones: OrganizacionEntity[] = [
    {
      id: ORG_ALPHA_ID,
      id_grupo_empresarial: CONG_HOLDING_ID,
      nombre: 'Iberometal Componentes S.A.',
      abreviacion: 'IBERO-COMP',
      rif: 'J-10000001-1',
      estatus: 'Activo',
      deleted_at: null,
    },
    {
      id: ORG_BETA_ID,
      id_grupo_empresarial: CONG_HOLDING_ID,
      nombre: 'Iberometal Logística Secreta C.A.',
      abreviacion: 'IBERO-LOG',
      rif: 'J-10000002-2',
      estatus: 'Activo',
      deleted_at: null,
    },
    {
      id: ORG_SOLO_ID,
      id_grupo_empresarial: CONG_SOLO_ID,
      nombre: 'BioAlimentos del Sur S.A.',
      abreviacion: 'BIOALIM',
      rif: 'J-10000003-3',
      estatus: 'Activo',
      deleted_at: null,
    },
  ];

  const certificados: SoftDeletableCertificado[] = [
    {
      id: CERT_ALPHA_1_ID,
      numero_certificado: 'FN-QMS-2024-001',
      id_organizacion: ORG_ALPHA_ID,
      organizacion_nombre: 'Iberometal Componentes S.A.',
      organizacion_abreviacion: 'IBERO-COMP',
      organizacion_rif: 'J-10000001-1',
      id_norma: '80000000-0000-4000-8000-000000000001',
      norma_codigo: 'ISO 9001:2015',
      norma_titulo: 'Calidad',
      esquema: 'ISO 9001:2015',
      id_estatus: '81000000-0000-4000-8000-000000000001',
      estatus: 'Activo',
      id_sector_iaf: '82000000-0000-4000-8000-000000000001',
      sector_iaf: 17,
      sector_iaf_descripcion: 'Metales',
      id_subsector_iaf: '83000000-0000-4000-8000-000000000001',
      fecha_emision: '2024-01-15',
      fecha_vencimiento: '2027-01-15',
      alcance: 'Manufactura de piezas metálicas',
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
      id: CERT_BETA_1_ID,
      numero_certificado: 'FN-EMS-2024-002',
      id_organizacion: ORG_BETA_ID,
      organizacion_nombre: 'Iberometal Logística Secreta C.A.',
      organizacion_abreviacion: 'IBERO-LOG',
      organizacion_rif: 'J-10000002-2',
      id_norma: '80000000-0000-4000-8000-000000000002',
      norma_codigo: 'ISO 14001:2015',
      norma_titulo: 'Ambiental',
      esquema: 'ISO 14001:2015',
      id_estatus: '81000000-0000-4000-8000-000000000001',
      estatus: 'Activo',
      id_sector_iaf: '82000000-0000-4000-8000-000000000001',
      sector_iaf: 31,
      sector_iaf_descripcion: 'Transporte',
      id_subsector_iaf: '83000000-0000-4000-8000-000000000002',
      fecha_emision: '2024-02-01',
      fecha_vencimiento: '2027-02-01',
      alcance: 'Logística refrigerada',
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
      id: CERT_SOLO_LIBRE_ID,
      numero_certificado: 'FN-OHS-2025-010',
      id_organizacion: ORG_SOLO_ID,
      organizacion_nombre: 'BioAlimentos del Sur S.A.',
      organizacion_abreviacion: 'BIOALIM',
      organizacion_rif: 'J-10000003-3',
      id_norma: '80000000-0000-4000-8000-000000000003',
      norma_codigo: 'ISO 45001:2018',
      norma_titulo: 'SST',
      esquema: 'ISO 45001:2018',
      id_estatus: '81000000-0000-4000-8000-000000000001',
      estatus: 'Activo',
      id_sector_iaf: '82000000-0000-4000-8000-000000000002',
      sector_iaf: 3,
      sector_iaf_descripcion: 'Alimentos',
      id_subsector_iaf: '83000000-0000-4000-8000-000000000003',
      fecha_emision: '2025-01-10',
      fecha_vencimiento: '2028-01-10',
      alcance: 'Procesamiento alimenticio',
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
      id: VINC_N2_ID,
      id_grupo_empresarial: CONG_HOLDING_ID,
      grupo_nombre: 'Grupo Industrial Iberometal',
      codigo_vinculo: 'VINC-N2-HOLD',
      etiqueta: 'Caja Holding Iberometal + Logística Secreta',
      nivel_vinculacion: 'NIVEL_2_INTER_ORG',
      tipo_vinculacion: 'Integrada',
      es_vinculada: true,
      tiene_sitio_temporal: false,
      notas: 'Acuerdo inter-org entre Iberometal Componentes e Iberometal Logística Secreta',
      certificados: [
        {
          id: '51000000-0000-4000-8000-000000000001',
          id_vinculo: VINC_N2_ID,
          id_certificado: CERT_ALPHA_1_ID,
          numero_certificado: 'FN-QMS-2024-001',
          norma_codigo: 'ISO 9001:2015',
          id_organizacion: ORG_ALPHA_ID,
          organizacion_nombre: 'Iberometal Componentes S.A.',
          organizacion_abreviacion: 'IBERO-COMP',
          tipo_vinculacion_override: 'Combinada',
          estatus: 'Activo',
          deleted_at: null,
        },
        {
          id: '51000000-0000-4000-8000-000000000002',
          id_vinculo: VINC_N2_ID,
          id_certificado: CERT_BETA_1_ID,
          numero_certificado: 'FN-EMS-2024-002',
          norma_codigo: 'ISO 14001:2015',
          id_organizacion: ORG_BETA_ID,
          organizacion_nombre: 'Iberometal Logística Secreta C.A.',
          organizacion_abreviacion: 'IBERO-LOG',
          tipo_vinculacion_override: null,
          estatus: 'Activo',
          deleted_at: null,
        },
      ],
      deleted_at: null,
    },
  ];

  const auditAlphaOld: ProgramacionAuditEntity = {
    id: AUDIT_ALPHA_OLD_ID,
    id_programa_auditoria: PROG_N2_ID,
    codigo_auditoria: 'AUD-2025-001',
    id_certificado: CERT_ALPHA_1_ID,
    numero_certificado: 'FN-QMS-2024-001',
    id_organizacion: ORG_ALPHA_ID,
    organizacion_nombre: 'Iberometal Componentes S.A.',
    organizacion_abreviacion: 'IBERO-COMP',
    norma_codigo: 'ISO 9001:2015',
    sector_iaf: 17,
    id_tipo_auditoria: '91000000-0000-4000-8000-000000000001',
    tipo_auditoria: 'Etapa 2',
    tipo_vinculacion: 'Combinada',
    metodologia: 'Presencial',
    fecha_inicio: '2025-04-10',
    fecha_fin: '2025-04-12',
    fechas: [
      {
        id: '71000000-0000-4000-8000-000000000001',
        id_auditoria: AUDIT_ALPHA_OLD_ID,
        numero_secuencia: 1,
        tag: 'Ejecución Real',
        tipo_fecha: 'REAL',
        anio: null,
        mes: null,
        fecha_inicio: '2025-04-10',
        fecha_fin: '2025-04-12',
        observacion: null,
        deleted_at: null,
      },
    ],
    dias_auditor: 3,
    estatus: 'Cerrado',
    estado_ciclo: 'Cerrada',
    auditor_lider_id: AUDITOR_PROFILE.id,
    auditor_lider: AUDITOR_PROFILE.nombre,
    sede_principal_direccion: 'Zona Industrial',
    equipo: [],
    sitiosMuestreo: [],
    matrizNormativa: [],
    deleted_at: null,
  };

  const auditAlphaNew: ProgramacionAuditEntity = {
    id: AUDIT_ALPHA_NEW_ID,
    id_programa_auditoria: PROG_N2_ID,
    codigo_auditoria: 'AUD-2026-011',
    id_certificado: CERT_ALPHA_1_ID,
    numero_certificado: 'FN-QMS-2024-001',
    id_organizacion: ORG_ALPHA_ID,
    organizacion_nombre: 'Iberometal Componentes S.A.',
    organizacion_abreviacion: 'IBERO-COMP',
    norma_codigo: 'ISO 9001:2015',
    sector_iaf: 17,
    id_tipo_auditoria: '91000000-0000-4000-8000-000000000002',
    tipo_auditoria: 'Seguimiento 1',
    tipo_vinculacion: 'Simultánea',
    metodologia: 'Presencial',
    fecha_inicio: '2026-11-05',
    fecha_fin: '2026-11-06',
    fechas: [
      {
        id: '71000000-0000-4000-8000-000000000002',
        id_auditoria: AUDIT_ALPHA_NEW_ID,
        numero_secuencia: 1,
        tag: 'Programación',
        tipo_fecha: 'PROGRAMADA_EXACTA',
        anio: null,
        mes: null,
        fecha_inicio: '2026-11-05',
        fecha_fin: '2026-11-06',
        observacion: null,
        deleted_at: null,
      },
    ],
    dias_auditor: 2,
    estatus: 'Planificado',
    estado_ciclo: 'Programada',
    auditor_lider_id: AUDITOR_PROFILE.id,
    auditor_lider: AUDITOR_PROFILE.nombre,
    sede_principal_direccion: 'Zona Industrial',
    equipo: [],
    sitiosMuestreo: [],
    matrizNormativa: [],
    deleted_at: null,
  };

  const auditBeta: ProgramacionAuditEntity = {
    id: AUDIT_BETA_ID,
    id_programa_auditoria: PROG_N2_ID,
    codigo_auditoria: 'AUD-2026-012',
    id_certificado: CERT_BETA_1_ID,
    numero_certificado: 'FN-EMS-2024-002',
    id_organizacion: ORG_BETA_ID,
    organizacion_nombre: 'Iberometal Logística Secreta C.A.',
    organizacion_abreviacion: 'IBERO-LOG',
    norma_codigo: 'ISO 14001:2015',
    sector_iaf: 31,
    id_tipo_auditoria: '91000000-0000-4000-8000-000000000002',
    tipo_auditoria: 'Seguimiento 1',
    tipo_vinculacion: null,
    metodologia: 'Mixta',
    fecha_inicio: '2026-11-05',
    fecha_fin: '2026-11-07',
    fechas: [
      {
        id: '71000000-0000-4000-8000-000000000003',
        id_auditoria: AUDIT_BETA_ID,
        numero_secuencia: 1,
        tag: 'Programación',
        tipo_fecha: 'PROGRAMADA_EXACTA',
        anio: null,
        mes: null,
        fecha_inicio: '2026-11-05',
        fecha_fin: '2026-11-07',
        observacion: null,
        deleted_at: null,
      },
    ],
    dias_auditor: 2,
    estatus: 'Planificado',
    estado_ciclo: 'Programada',
    auditor_lider_id: '10000000-0000-4000-8000-000000000099',
    auditor_lider: 'Otro Auditor',
    sede_principal_direccion: 'Puerto Cabello',
    equipo: [],
    sitiosMuestreo: [],
    matrizNormativa: [],
    deleted_at: null,
  };

  const auditSolo: ProgramacionAuditEntity = {
    id: AUDIT_SOLO_ID,
    id_programa_auditoria: PROG_SOLO_ID,
    codigo_auditoria: 'AUD-2026-030',
    id_certificado: CERT_SOLO_LIBRE_ID,
    numero_certificado: 'FN-OHS-2025-010',
    id_organizacion: ORG_SOLO_ID,
    organizacion_nombre: 'BioAlimentos del Sur S.A.',
    organizacion_abreviacion: 'BIOALIM',
    norma_codigo: 'ISO 45001:2018',
    sector_iaf: 3,
    id_tipo_auditoria: null,
    tipo_auditoria: 'Renovación',
    tipo_vinculacion: null,
    metodologia: 'Presencial',
    fecha_inicio: '',
    fecha_fin: '',
    fechas: [
      {
        id: '71000000-0000-4000-8000-000000000004',
        id_auditoria: AUDIT_SOLO_ID,
        numero_secuencia: 1,
        tag: 'Programación',
        tipo_fecha: 'PREPROGRAMADA_MES',
        anio: 2026,
        mes: 12,
        fecha_inicio: null,
        fecha_fin: null,
        observacion: null,
        deleted_at: null,
      },
    ],
    dias_auditor: 0,
    estatus: 'Borrador',
    estado_ciclo: 'En Programación',
    auditor_lider_id: '',
    auditor_lider: '',
    sede_principal_direccion: 'Valencia',
    equipo: [],
    sitiosMuestreo: [],
    matrizNormativa: [],
    deleted_at: null,
  };

  const auditDeleted: ProgramacionAuditEntity = {
    ...auditSolo,
    id: AUDIT_DELETED_ID,
    codigo_auditoria: 'AUD-DELETED-999',
    deleted_at: '2026-01-01T00:00:00Z',
  };

  const programs: ProgramaAuditoriaEntity[] = [
    {
      id: PROG_N2_ID,
      id_vinculo: VINC_N2_ID,
      id_grupo_empresarial: CONG_HOLDING_ID,
      codigo_programa: 'PRG-2026-HOLD',
      etiqueta: 'Campaña Iberometal Holding 2026',
      nivel_vinculacion: 'NIVEL_2_INTER_ORG',
      tipo_vinculacion: 'Integrada',
      es_vinculada: true,
      auditorias: [auditAlphaOld, auditAlphaNew, auditBeta],
      deleted_at: null,
    },
    {
      id: PROG_SOLO_ID,
      id_vinculo: null,
      id_grupo_empresarial: CONG_SOLO_ID,
      codigo_programa: 'PRG-2026-BIO',
      etiqueta: 'BioAlimentos Renovación 2026',
      nivel_vinculacion: 'INDIVIDUAL',
      tipo_vinculacion: 'Individual',
      es_vinculada: false,
      auditorias: [auditSolo, auditDeleted],
      deleted_at: null,
    },
  ];

  return {
    conglomerados,
    organizaciones,
    certificados,
    vinculos,
    programs,
    audits: [auditAlphaOld, auditAlphaNew, auditBeta, auditSolo, auditDeleted],
  };
}

test('Step 3.1: DEFAULT_RELACION_VIEW_STATE initializes clean immutable defaults', () => {
  const s1 = createDefaultRelacionViewState();
  const s2 = createDefaultRelacionViewState();
  assert.deepEqual(s1, DEFAULT_RELACION_VIEW_STATE);
  assert.notEqual(s1.facetSelections, s2.facetSelections);
  assert.equal(s1.pickerTargetGroupKey, null);
  assert.equal(s1.savingAuditId, null);
  assert.equal(s1.editErrorMessage, null);
});

test('Step 3.1: buildRelacionMultiRows groups by Conglomerado/Org, resolves short names & codenames, and filters all 5 facets', () => {
  const fx = createFixtureDataset();
  const rows = buildRelacionMultiRows({
    profile: ADMIN_PROFILE,
    ...fx,
  });

  assert.equal(rows.length, 2);
  const bioRow = rows.find((r) => r.groupKey === `org:${ORG_SOLO_ID}`);
  const holdRow = rows.find((r) => r.groupKey === `cong:${CONG_HOLDING_ID}`);
  assert.ok(bioRow);
  assert.ok(holdRow);

  assert.equal(holdRow.groupKind, 'CONGLOMERADO');
  assert.equal(holdRow.displayName, 'IBEROMETAL');
  assert.equal(holdRow.conglomeradoShortName, 'IBEROMETAL');
  assert.equal(holdRow.certsCount, 2);
  assert.equal(holdRow.auditsCount, 3);
  assert.ok(holdRow.audits.some((a) => a.codename === '2026-11 Seg.1'));
  assert.ok(holdRow.audits.some((a) => a.codename === '2025-04 Et.2'));
  assert.ok(holdRow.effectiveNatures.includes('Simultánea'));
  assert.ok(holdRow.effectiveNatures.includes('Integrada'));
  assert.ok(holdRow.effectiveNatures.includes('Combinada'));
  assert.ok(holdRow.baseVinculoKinds.includes('Personalizada o Libre'));
  assert.ok(holdRow.baseVinculoKinds.includes('Con caja Bloque 2'));

  assert.equal(bioRow.groupKind, 'ORGANIZACION');
  assert.equal(bioRow.displayName, 'BIOALIM');
  assert.equal(bioRow.auditsCount, 1);
  assert.equal(bioRow.audits[0].codename, '2026-12 Renov.');
  assert.equal(bioRow.audits[0].effectiveNature, 'Individual');
  assert.deepEqual(bioRow.baseVinculoKinds, ['Personalizada o Libre']);

  // Deleted audit must be excluded
  for (const row of rows) {
    assert.equal(row.audits.some((a) => a.auditId === AUDIT_DELETED_ID), false);
    assert.equal(containsRawUuid(row.displayName), false);
    assert.equal(containsRawUuid(row.searchHaystack), false);
  }

  // Filter via all 5 facets
  assert.equal(RELACION_FACET_CATEGORIES.length, 5);
  const byNature = filterRelacionMultiRows(rows, {
    query: '',
    facetSelections: { naturaleza: new Set(['Simultánea']) },
    sortColumn: null,
    sortDirection: 'none',
  });
  assert.deepEqual(byNature.filteredRows.map((r) => r.groupKey), [`cong:${CONG_HOLDING_ID}`]);

  const byCycle = filterRelacionMultiRows(rows, {
    query: '',
    facetSelections: { estado_ciclo: new Set(['En Programación']) },
    sortColumn: null,
    sortDirection: 'none',
  });
  assert.deepEqual(byCycle.filteredRows.map((r) => r.groupKey), [`org:${ORG_SOLO_ID}`]);

  const byCong = filterRelacionMultiRows(rows, {
    query: 'BIOALIM',
    facetSelections: { conglomerado: new Set(['BIOALIM']) },
    sortColumn: null,
    sortDirection: 'none',
  });
  assert.equal(byCong.filteredRows.length, 1);
});

test('Step 3.1: buildRelacionPickerModel groups by Certificado and sorts audits newest-to-oldest with compact codenames', () => {
  const fx = createFixtureDataset();
  assert.equal(
    buildRelacionPickerModel({
      profile: ADMIN_PROFILE,
      pickerTargetGroupKey: null,
      ...fx,
    }),
    null
  );

  const picker = buildRelacionPickerModel({
    profile: ADMIN_PROFILE,
    pickerTargetGroupKey: `cong:${CONG_HOLDING_ID}`,
    ...fx,
  });
  assert.ok(picker);
  assert.equal(picker.displayName, 'IBEROMETAL');
  assert.equal(picker.totalCertsCount, 2);
  assert.equal(picker.totalAuditsCount, 3);

  const alphaCertGroup = picker.certificates.find((c) => c.certId === CERT_ALPHA_1_ID);
  assert.ok(alphaCertGroup);
  assert.equal(alphaCertGroup.baseVinculoNature, 'Combinada'); // override in Block 2 box
  assert.equal(alphaCertGroup.audits.length, 2);
  // Newest first: 2026-11 Seg.1 before 2025-04 Et.2
  assert.equal(alphaCertGroup.audits[0].auditId, AUDIT_ALPHA_NEW_ID);
  assert.equal(alphaCertGroup.audits[0].codename, '2026-11 Seg.1');
  assert.equal(alphaCertGroup.audits[0].effectiveNature, 'Simultánea');
  assert.equal(alphaCertGroup.audits[0].matchesVinculoBase, false);
  assert.equal(alphaCertGroup.audits[1].auditId, AUDIT_ALPHA_OLD_ID);
  assert.equal(alphaCertGroup.audits[1].codename, '2025-04 Et.2');
  assert.equal(alphaCertGroup.audits[1].matchesVinculoBase, true);
  assert.equal(containsRawUuid(alphaCertGroup.audits[0].codenameTooltip), false);
});

test('Step 3.1: buildRelacionDetailModel computes baseVinculoNature vs effectiveAuditNature and never mutates Block 2', () => {
  const fx = createFixtureDataset();
  const vinculoSnapshot = JSON.stringify(fx.vinculos);

  // 1. Audit with Block 2 box override ('Combinada') overridden in Bloque 1 to 'Simultánea'
  const detailCustom = buildRelacionDetailModel({
    profile: ADMIN_PROFILE,
    selectedCertId: CERT_ALPHA_1_ID,
    selectedAuditId: AUDIT_ALPHA_NEW_ID,
    ...fx,
  });
  assert.equal(detailCustom.hasSelection, true);
  assert.equal(detailCustom.canEdit, true);
  assert.ok(detailCustom.selectedAuditRow);
  assert.equal(detailCustom.selectedAuditRow.baseVinculoNature, 'Combinada');
  assert.equal(detailCustom.selectedAuditRow.effectiveAuditNature, 'Simultánea');
  assert.equal(detailCustom.selectedAuditRow.matchesVinculoBase, false);
  assert.equal(detailCustom.selectedAuditRow.hasVinculoBox, true);
  assert.equal(detailCustom.selectedAuditRow.isVinculoLibre, false);

  // 2. LIBRE certificate defaults baseVinculoNature to 'Individual'
  const detailLibre = buildRelacionDetailModel({
    profile: WORKER_PROFILE,
    selectedCertId: CERT_SOLO_LIBRE_ID,
    selectedAuditId: AUDIT_SOLO_ID,
    ...fx,
  });
  assert.equal(detailLibre.canEdit, true);
  assert.ok(detailLibre.selectedAuditRow);
  assert.equal(detailLibre.selectedAuditRow.baseVinculoNature, 'Individual');
  assert.equal(detailLibre.selectedAuditRow.effectiveAuditNature, 'Individual');
  assert.equal(detailLibre.selectedAuditRow.matchesVinculoBase, true);
  assert.equal(detailLibre.selectedAuditRow.isVinculoLibre, true);

  // 3. Validate updating Bloque 1 Relación does NOT mutate Block 2 vinculo/vinculo_certificado
  const updatePlan = validateAuditRelacionUpdate({
    auditId: AUDIT_BETA_ID,
    tipoVinculacion: 'Conjunta',
    audits: fx.audits,
    programs: fx.programs,
    profile: ADMIN_PROFILE,
  });
  assert.equal(updatePlan.ok, true);
  if (updatePlan.ok) {
    assert.equal(updatePlan.mutatesVinculoBlock2, false);
    assert.deepEqual(updatePlan.updatedAuditPayload, { tipo_vinculacion: 'Conjunta' });
  }
  assert.equal(JSON.stringify(fx.vinculos), vinculoSnapshot);
});

test('Step 3.1: validateAuditRelacionUpdate rejects invalid inputs/roles with Zero-UUID Spanish errors', () => {
  const fx = createFixtureDataset();

  const auditorAttempt = validateAuditRelacionUpdate({
    auditId: AUDIT_ALPHA_NEW_ID,
    tipoVinculacion: 'Mixta',
    audits: fx.audits,
    profile: AUDITOR_PROFILE,
  });
  assert.equal(auditorAttempt.ok, false);
  if (!auditorAttempt.ok) assert.equal(containsRawUuid(auditorAttempt.error), false);

  const clientAttempt = validateAuditRelacionUpdate({
    auditId: AUDIT_ALPHA_NEW_ID,
    tipoVinculacion: 'Mixta',
    audits: fx.audits,
    profile: CLIENT_PROFILE,
  });
  assert.equal(clientAttempt.ok, false);

  const badUuid = validateAuditRelacionUpdate({
    auditId: 'not-a-uuid',
    tipoVinculacion: 'Combinada',
    audits: fx.audits,
    profile: ADMIN_PROFILE,
  });
  assert.equal(badUuid.ok, false);
  if (!badUuid.ok) assert.equal(containsRawUuid(badUuid.error), false);

  const badNature = validateAuditRelacionUpdate({
    auditId: AUDIT_ALPHA_NEW_ID,
    tipoVinculacion: 'NaturalezaInexistente',
    audits: fx.audits,
    profile: ADMIN_PROFILE,
  });
  assert.equal(badNature.ok, false);
  if (!badNature.ok) assert.equal(containsRawUuid(badNature.error), false);

  const deletedAudit = validateAuditRelacionUpdate({
    auditId: AUDIT_DELETED_ID,
    tipoVinculacion: 'Individual',
    audits: fx.audits,
    profile: ADMIN_PROFILE,
  });
  assert.equal(deletedAudit.ok, false);

  const batchResult = validateAuditRelacionUpdate({
    auditId: AUDIT_ALPHA_NEW_ID,
    tipoVinculacion: 'Mixta',
    audits: fx.audits,
    programs: fx.programs,
    profile: WORKER_PROFILE,
    applyToBatchProgram: true,
  });
  assert.equal(batchResult.ok, true);
  if (batchResult.ok) {
    assert.deepEqual(batchResult.targetAuditIds, [
      AUDIT_ALPHA_OLD_ID,
      AUDIT_ALPHA_NEW_ID,
      AUDIT_BETA_ID,
    ]);
  }
});

test('Step 3.1: 4-role RBAC scopes AUDITOR to assigned audits and enforces CLIENT Level-2 isolation without sibling leakage', () => {
  const fx = createFixtureDataset();

  // AUDITOR sees only assigned audits (ALPHA_OLD & ALPHA_NEW, NOT BETA or SOLO) and is read-only
  const auditorRows = buildRelacionMultiRows({
    profile: AUDITOR_PROFILE,
    ...fx,
  });
  assert.equal(auditorRows.length, 1);
  assert.equal(auditorRows[0].certsCount, 1);
  assert.equal(auditorRows[0].auditsCount, 2);
  assert.equal(
    auditorRows[0].audits.some((a) => a.auditId === AUDIT_BETA_ID),
    false
  );
  assert.equal(
    auditorRows[0].searchHaystack.includes('secreta'),
    false,
    'Unassigned sibling org name must not leak to AUDITOR'
  );

  const auditorDetail = buildRelacionDetailModel({
    profile: AUDITOR_PROFILE,
    selectedCertId: CERT_BETA_1_ID,
    selectedAuditId: AUDIT_BETA_ID,
    ...fx,
  });
  assert.equal(auditorDetail.canEdit, false);
  assert.equal(auditorDetail.hasSelection, false);

  // CLIENT Level-2 isolation: authorized only for ORG_ALPHA_ID -> never sees ORG_BETA_ID ("Secreta")
  const clientRows = buildRelacionMultiRows({
    profile: CLIENT_PROFILE,
    authorizedClientOrgIds: [ORG_ALPHA_ID],
    ...fx,
  });
  assert.equal(clientRows.length, 1);
  assert.equal(clientRows[0].groupKey, `org:${ORG_ALPHA_ID}`);
  assert.equal(clientRows[0].certsCount, 1);
  assert.equal(clientRows[0].auditsCount, 2);
  assert.equal(clientRows[0].searchHaystack.includes('secreta'), false);
  assert.equal(
    clientRows[0].vinculoBoxes.some((b) => b.etiqueta.toLowerCase().includes('secreta')),
    false,
    'NIVEL_2_INTER_ORG sibling box label must be redacted for CLIENT'
  );

  const clientDetail = buildRelacionDetailModel({
    profile: CLIENT_PROFILE,
    authorizedClientOrgIds: [ORG_ALPHA_ID],
    selectedCertId: CERT_ALPHA_1_ID,
    selectedAuditId: AUDIT_ALPHA_NEW_ID,
    ...fx,
  });
  assert.equal(clientDetail.canEdit, false);
  assert.equal(clientDetail.audits.length, 2);
  assert.equal(
    clientDetail.audits.some((a) => a.orgId === ORG_BETA_ID),
    false
  );
  assert.equal(
    clientDetail.programSummary?.etiqueta.toLowerCase().includes('iberometal holding'),
    false
  );

  // Unapproved or null profile sees nothing
  assert.deepEqual(
    buildRelacionMultiRows({
      profile: PENDING_PROFILE,
      ...fx,
    }),
    []
  );
  assert.deepEqual(
    buildRelacionMultiRows({
      profile: null,
      ...fx,
    }),
    []
  );
});
