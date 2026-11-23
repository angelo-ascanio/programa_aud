import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildConglomeradoVinculoSummaries,
  canArchiveVinculoBox,
  canCertificateEnterDesignacion,
  canDetachCertificateFromVinculo,
  computeCertificateCommitmentSummaries,
  filterFreeCertificatesInConglomerado,
  formatBoxNatureSummary,
  getCommitmentStatusLabel,
  inferVinculoBoxClassification,
  resolveVinculoCoherenceForSave,
  scopeVinculosForProfile,
  validateBoxTransferPlan,
  validateVinculoBoxMetadataDraft,
  validateVinculoFormDraft,
  type VinculoEntity,
  type VinculoFormDraft,
} from './vinculoDomain';
import {
  AUDIT_LINK_NATURES,
  type ProgramaAuditoriaEntity,
} from './auditPlanningEngine';
import { normalizeAuditLinkNature } from './auditPlanningPersistence';
import type { OrganizacionEntity } from './activeCertificates';
import type { CertificadoDetailEntity } from './multisiteSampling';
import type { ConglomeradoEntity } from './conglomeradoDomain';
import type { ProgramacionAuditEntity } from './auditExecution';
import type { UserProfile } from './healthCheck';
import { assertZeroUuidExposure } from './zeroUuid';
import {
  DEFAULT_VINCULO_STATE,
  renderVinculoView,
  type VinculoViewState,
} from '../views/vinculoView';

const CONG_IND = '20000000-0000-0000-0000-000000000001';
const CONG_CYB = '20000000-0000-0000-0000-000000000002';
const CONG_ARCHIVED = '20000000-0000-0000-0000-000000000099';

const ORG_IBEROMETAL = '30000000-0000-0000-0000-000000000001';
const ORG_CYBERCLOUD = '30000000-0000-0000-0000-000000000002';
const ORG_EXAMPLE = '30000000-0000-0000-0000-000000000003';
const ORG_ORPHAN = '30000000-0000-0000-0000-000000000004';

const CERT_1 = '40000000-0000-0000-0000-000000000001';
const CERT_2 = '40000000-0000-0000-0000-000000000002';
const CERT_3 = '40000000-0000-0000-0000-000000000003';
const CERT_4 = '40000000-0000-0000-0000-000000000004';
const CERT_5 = '40000000-0000-0000-0000-000000000005';
const CERT_ORPHAN = '40000000-0000-0000-0000-000000000099';

const VINC_IND = '7c000000-0000-0000-0000-000000000001';
const VINC_N2 = '7c000000-0000-0000-0000-000000000004';
const PROG_N2 = '7a000000-0000-0000-0000-000000000004';
const PROG_HIST = '7a000000-0000-0000-0000-000000000001';

const CONGLOMERADOS: ConglomeradoEntity[] = [
  {
    id: CONG_IND,
    codigo_grupo: 'CONG-IND-01',
    nombre: 'Grupo Industrial Iberometal',
    es_individual_auto: false,
    notas: null,
  },
  {
    id: CONG_CYB,
    codigo_grupo: 'CONG-CYB-01',
    nombre: 'CyberCloud Solutions S.L.',
    es_individual_auto: true,
    notas: null,
  },
  {
    id: CONG_ARCHIVED,
    codigo_grupo: 'CONG-OLD',
    nombre: 'Conglomerado Archivado',
    es_individual_auto: false,
    notas: null,
    deleted_at: '2026-01-01T00:00:00Z',
  },
];

const ORGANIZACIONES: OrganizacionEntity[] = [
  {
    id: ORG_IBEROMETAL,
    id_grupo_empresarial: CONG_IND,
    nombre: 'Iberometal Componentes S.A.',
    rif: 'J-30492817-0',
    direccion_fiscal: 'Valencia',
  },
  {
    id: ORG_CYBERCLOUD,
    id_grupo_empresarial: CONG_CYB,
    nombre: 'CyberCloud Solutions S.L.',
    rif: 'J-40819234-5',
    direccion_fiscal: 'Caracas',
  },
  {
    id: ORG_EXAMPLE,
    id_grupo_empresarial: CONG_IND,
    nombre: 'Example, C.A.',
    rif: 'J-50112233-4',
    direccion_fiscal: 'Aragua',
  },
  {
    id: ORG_ORPHAN,
    id_grupo_empresarial: CONG_ARCHIVED,
    nombre: 'Organización Sin Conglomerado Activo',
    rif: 'J-99999999-9',
    direccion_fiscal: 'N/A',
  },
];

function makeCert(
  id: string,
  orgId: string,
  orgName: string,
  numero: string,
  norma = 'ISO 9001:2015'
): CertificadoDetailEntity {
  return {
    id,
    id_organizacion: orgId,
    organizacion_nombre: orgName,
    organizacion_rif: 'J-00000000-0',
    id_norma: 'e0000000-0000-0000-0000-000000009001',
    norma_codigo: norma,
    norma_nombre: norma,
    id_sector_iaf: 'd0000000-0000-0000-0000-000000000017',
    sector_iaf_numero: 17,
    sector_iaf_nombre: 'Metales básicos',
    id_estatus: 'a0000000-0000-0000-0000-000000000001',
    estatus: 'Activo',
    numero_certificado: numero,
    alcance: 'Alcance de prueba',
    alcanceDetalle: {
      id: `90000000-0000-0000-0000-${id.slice(-12)}`,
      id_certificado: id,
      alcance_es: 'Alcance de prueba',
      alcance_en: null,
      esCompartido: false,
      deleted_at: null,
    },
    multisitio: false,
    sitios: [],
    procesos: [],
    noAplicables: [],
  };
}

const CERTIFICADOS: CertificadoDetailEntity[] = [
  makeCert(CERT_1, ORG_IBEROMETAL, 'Iberometal Componentes S.A.', 'FN-QMS-2024-001'),
  makeCert(CERT_2, ORG_IBEROMETAL, 'Iberometal Componentes S.A.', 'FN-EMS-2025-002', 'ISO 14001:2015'),
  makeCert(CERT_3, ORG_CYBERCLOUD, 'CyberCloud Solutions S.L.', 'FN-ISMS-2025-003', 'ISO/IEC 27001:2022'),
  makeCert(CERT_4, ORG_EXAMPLE, 'Example, C.A.', 'FN-QMS-2025-004'),
  makeCert(CERT_5, ORG_EXAMPLE, 'Example, C.A.', 'FN-EMS-2025-005', 'ISO 14001:2015'),
  makeCert(CERT_ORPHAN, ORG_ORPHAN, 'Organización Sin Conglomerado Activo', 'FN-QMS-ORPHAN'),
];

const VINCULOS: VinculoEntity[] = [
  {
    id: VINC_IND,
    id_grupo_empresarial: CONG_CYB,
    grupo_nombre: 'CyberCloud Solutions S.L.',
    codigo_vinculo: 'VINC-IND-01',
    etiqueta: 'CyberCloud · FN-ISMS-2025-003',
    nivel_vinculacion: 'INDIVIDUAL',
    tipo_vinculacion: 'Individual',
    es_vinculada: false,
    tiene_sitio_temporal: false,
    notas: null,
    certificados: [
      {
        id: '7d000000-0000-0000-0000-000000000001',
        id_vinculo: VINC_IND,
        id_certificado: CERT_3,
        numero_certificado: 'FN-ISMS-2025-003',
        norma_codigo: 'ISO/IEC 27001:2022',
        id_organizacion: ORG_CYBERCLOUD,
        organizacion_nombre: 'CyberCloud Solutions S.L.',
        estatus: 'Activo',
      },
    ],
  },
  {
    id: VINC_N2,
    id_grupo_empresarial: CONG_IND,
    grupo_nombre: 'Grupo Industrial Iberometal',
    codigo_vinculo: 'VINC-N2-01',
    etiqueta: 'Conglomerado Iberometal Nivel 2',
    nivel_vinculacion: 'NIVEL_2_INTER_ORG',
    tipo_vinculacion: 'Multientidad',
    es_vinculada: true,
    tiene_sitio_temporal: true,
    notas: 'Incluye sitio temporal',
    certificados: [
      {
        id: '7d000000-0000-0000-0000-000000000005',
        id_vinculo: VINC_N2,
        id_certificado: CERT_1,
        numero_certificado: 'FN-QMS-2024-001',
        norma_codigo: 'ISO 9001:2015',
        id_organizacion: ORG_IBEROMETAL,
        organizacion_nombre: 'Iberometal Componentes S.A.',
        estatus: 'Activo',
      },
      {
        id: '7d000000-0000-0000-0000-000000000006',
        id_vinculo: VINC_N2,
        id_certificado: CERT_4,
        numero_certificado: 'FN-QMS-2025-004',
        norma_codigo: 'ISO 9001:2015',
        id_organizacion: ORG_EXAMPLE,
        organizacion_nombre: 'Example, C.A.',
        estatus: 'Activo',
      },
    ],
  },
];

function makeAudit(
  id: string,
  programId: string,
  certId: string,
  numero: string,
  estadoCiclo: ProgramacionAuditEntity['estado_ciclo']
): ProgramacionAuditEntity {
  return {
    id,
    id_programa_auditoria: programId,
    codigo_auditoria: `AUD-${id.slice(-3)}`,
    id_certificado: certId,
    numero_certificado: numero,
    id_organizacion: ORG_IBEROMETAL,
    organizacion_nombre: 'Iberometal Componentes S.A.',
    norma_codigo: 'ISO 9001:2015',
    sector_iaf: 17,
    tipo_auditoria: 'Seguimiento 1',
    metodologia: 'Presencial',
    fecha_inicio: '2026-06-01',
    fecha_fin: '2026-06-03',
    dias_auditor: 2,
    estatus: 'Planificado',
    estado_ciclo: estadoCiclo,
    auditor_lider_id: '33333333-3333-3333-3333-333333333333',
    auditor_lider: 'Auditor Líder',
    sede_principal_direccion: 'Valencia',
    equipo: [],
    sitiosMuestreo: [],
    matrizNormativa: [],
  };
}

test('Step 2.2: AUDIT_LINK_NATURES replaces Multisitio with Mixta and normalizer maps legacy values', () => {
  assert.ok(AUDIT_LINK_NATURES.includes('Mixta'));
  assert.equal((AUDIT_LINK_NATURES as readonly string[]).includes('Multisitio'), false);
  assert.equal(normalizeAuditLinkNature('Multisitio'), 'Mixta');
  assert.equal(normalizeAuditLinkNature('Mixta'), 'Mixta');
  assert.equal(normalizeAuditLinkNature('Integrada'), 'Integrada');
  assert.equal(normalizeAuditLinkNature('Desconocida'), 'Individual');
});

test('Step 2.2: computeCertificateCommitmentSummaries identifies LIBRE, INDIVIDUAL, VINCULADO and enforces Step 2 gate', () => {
  const summaries = computeCertificateCommitmentSummaries(
    CERTIFICADOS,
    ORGANIZACIONES,
    CONGLOMERADOS,
    VINCULOS
  );

  const s1 = summaries.find((s) => s.certificado.id === CERT_1)!;
  const s2 = summaries.find((s) => s.certificado.id === CERT_2)!;
  const s3 = summaries.find((s) => s.certificado.id === CERT_3)!;
  const sOrphan = summaries.find((s) => s.certificado.id === CERT_ORPHAN)!;

  assert.equal(s1.status, 'VINCULADO');
  assert.equal(s1.canGenerateAudits, true);
  assert.equal(canCertificateEnterDesignacion(s1).allowed, true);

  assert.equal(s3.status, 'INDIVIDUAL');
  assert.equal(s3.canGenerateAudits, true);
  assert.equal(canCertificateEnterDesignacion(s3).allowed, true);

  assert.equal(s2.status, 'LIBRE');
  assert.equal(s2.canGenerateAudits, false);
  assert.match(s2.blockReason || '', /Libre/i);
  assert.equal(canCertificateEnterDesignacion(s2).allowed, false);

  assert.equal(sOrphan.status, 'LIBRE');
  assert.equal(sOrphan.id_grupo_empresarial, null);
  assert.equal(sOrphan.canGenerateAudits, false);
  assert.match(sOrphan.blockReason || '', /Conglomerado activo/i);
  assert.equal(canCertificateEnterDesignacion(sOrphan).allowed, false);

  const freeInCongInd = filterFreeCertificatesInConglomerado(summaries, CONG_IND);
  assert.deepEqual(
    freeInCongInd.map((s) => s.certificado.id).sort(),
    [CERT_2, CERT_5].sort()
  );

  assert.equal(getCommitmentStatusLabel('LIBRE').label, 'Libre');
  assert.equal(getCommitmentStatusLabel('INDIVIDUAL').label, 'Individual');
  assert.equal(getCommitmentStatusLabel('VINCULADO').label, 'Vinculado');
});

test('Step 2.2: validateVinculoFormDraft enforces cardinality, org/conglomerate boundaries, and uniqueness', () => {
  const baseDraft: VinculoFormDraft = {
    id_grupo_empresarial: CONG_IND,
    codigo_vinculo: 'VINC-TEST',
    etiqueta: 'Vínculo de Prueba',
    nivel_vinculacion: 'INDIVIDUAL',
    tipo_vinculacion: 'Individual',
    tiene_sitio_temporal: false,
    notas: '',
    certificadoIds: [CERT_2],
  };

  // Valid INDIVIDUAL on free cert
  assert.equal(
    validateVinculoFormDraft(baseDraft, VINCULOS, CERTIFICADOS, ORGANIZACIONES),
    null
  );

  // Reject INDIVIDUAL with 2 certs
  assert.match(
    validateVinculoFormDraft(
      { ...baseDraft, certificadoIds: [CERT_2, CERT_5] },
      VINCULOS,
      CERTIFICADOS,
      ORGANIZACIONES
    ) || '',
    /exactamente 1 certificado/i
  );

  // Reject NIVEL_1_INTRA_ORG with 2 different organizations in same conglomerate
  assert.match(
    validateVinculoFormDraft(
      {
        ...baseDraft,
        nivel_vinculacion: 'NIVEL_1_INTRA_ORG',
        tipo_vinculacion: 'Mixta',
        certificadoIds: [CERT_2, CERT_5],
      },
      VINCULOS,
      CERTIFICADOS,
      ORGANIZACIONES
    ) || '',
    /misma organización/i
  );

  // Reject certificates from a different conglomerate
  assert.match(
    validateVinculoFormDraft(
      {
        ...baseDraft,
        nivel_vinculacion: 'NIVEL_2_INTER_ORG',
        tipo_vinculacion: 'Multientidad',
        certificadoIds: [CERT_2, CERT_3],
      },
      VINCULOS,
      CERTIFICADOS,
      ORGANIZACIONES
    ) || '',
    /otro conglomerado/i
  );

  // Reject certificate already bound to another active vinculo
  assert.match(
    validateVinculoFormDraft(
      {
        ...baseDraft,
        nivel_vinculacion: 'NIVEL_2_INTER_ORG',
        tipo_vinculacion: 'Mixta',
        certificadoIds: [CERT_1, CERT_5],
      },
      VINCULOS,
      CERTIFICADOS,
      ORGANIZACIONES
    ) || '',
    /ya pertenece a otro vínculo activo/i
  );

  // Allow valid NIVEL_2_INTER_ORG with Mixta nature on free certs in same conglomerate
  assert.equal(
    validateVinculoFormDraft(
      {
        ...baseDraft,
        nivel_vinculacion: 'NIVEL_2_INTER_ORG',
        tipo_vinculacion: 'Mixta',
        tiene_sitio_temporal: true,
        certificadoIds: [CERT_2, CERT_5],
      },
      VINCULOS,
      CERTIFICADOS,
      ORGANIZACIONES
    ),
    null
  );
});

test('Step 2.2: canDetachCertificateFromVinculo blocks active/in-progress audits and allows terminal/audited states', () => {
  const programs: ProgramaAuditoriaEntity[] = [
    {
      id: PROG_N2,
      id_vinculo: VINC_N2,
      id_grupo_empresarial: CONG_IND,
      codigo_programa: 'PROG-2026-002',
      etiqueta: 'Campaña Nivel 2',
      nivel_vinculacion: 'NIVEL_2_INTER_ORG',
      tipo_vinculacion: 'Multientidad',
      es_vinculada: true,
      tiene_sitio_temporal: true,
      auditorias: [],
    },
    {
      id: PROG_HIST,
      id_vinculo: VINC_IND,
      id_grupo_empresarial: CONG_CYB,
      codigo_programa: 'PROG-HIST',
      etiqueta: 'Histórica',
      nivel_vinculacion: 'INDIVIDUAL',
      tipo_vinculacion: 'Individual',
      es_vinculada: false,
      auditorias: [],
    },
  ];

  // Blocked on En Ejecución / Programada
  const blockedExec = canDetachCertificateFromVinculo(CERT_1, VINC_N2, programs, [
    makeAudit('80000000-0000-0000-0000-000000000006', PROG_N2, CERT_1, 'FN-QMS-2024-001', 'En Ejecución'),
  ]);
  assert.equal(blockedExec.allowed, false);
  assert.match(blockedExec.reason || '', /En Ejecución/);

  const blockedProg = canDetachCertificateFromVinculo(CERT_1, VINC_N2, programs, [
    makeAudit('80000000-0000-0000-0000-000000000007', PROG_N2, CERT_1, 'FN-QMS-2024-001', 'Programada'),
  ]);
  assert.equal(blockedProg.allowed, false);

  // Allowed on Cancelada / Auditada / Cerrada (cast via unknown only not needed; Auditada & Cancelada are in AuditCycleStatus)
  const allowedCancel = canDetachCertificateFromVinculo(CERT_1, VINC_N2, programs, [
    makeAudit('80000000-0000-0000-0000-000000000008', PROG_N2, CERT_1, 'FN-QMS-2024-001', 'Cancelada'),
  ]);
  assert.equal(allowedCancel.allowed, true);
  assert.equal(allowedCancel.reason, null);

  const allowedAudited = canDetachCertificateFromVinculo(CERT_1, VINC_N2, programs, [
    makeAudit('80000000-0000-0000-0000-000000000009', PROG_N2, CERT_1, 'FN-QMS-2024-001', 'Auditada'),
  ]);
  assert.equal(allowedAudited.allowed, true);
});

test('Step 2.2: scopeVinculosForProfile isolates CLIENT in NIVEL_2_INTER_ORG without leaking sibling organizations', () => {
  const adminProfile: UserProfile = {
    id: '11111111-1111-1111-1111-111111111111',
    full_name: 'Admin',
    role: 'ADMIN',
    status: 'APPROVED',
  };
  const clientProfile: UserProfile = {
    id: '44444444-4444-4444-4444-444444444444',
    full_name: 'Cliente Iberometal',
    role: 'CLIENT',
    status: 'APPROVED',
  };
  const auditorProfile: UserProfile = {
    id: '33333333-3333-3333-3333-333333333333',
    full_name: 'Auditor',
    role: 'AUDITOR',
    status: 'APPROVED',
  };

  assert.equal(scopeVinculosForProfile(VINCULOS, null, [ORG_IBEROMETAL], []).length, 0);
  assert.equal(scopeVinculosForProfile(VINCULOS, adminProfile, [], []).length, 2);

  // CLIENT authorized only for ORG_IBEROMETAL sees VINC_N2 with ONLY CERT_1 (ORG_EXAMPLE omitted!)
  const clientScoped = scopeVinculosForProfile(VINCULOS, clientProfile, [ORG_IBEROMETAL], []);
  assert.equal(clientScoped.length, 1);
  assert.equal(clientScoped[0].id, VINC_N2);
  assert.deepEqual(
    clientScoped[0].certificados.map((c) => c.id_organizacion),
    [ORG_IBEROMETAL]
  );

  // AUDITOR assigned only to CERT_3 sees only VINC_IND with CERT_3
  const auditorScoped = scopeVinculosForProfile(VINCULOS, auditorProfile, [], [CERT_3]);
  assert.equal(auditorScoped.length, 1);
  assert.equal(auditorScoped[0].id, VINC_IND);
  assert.deepEqual(
    auditorScoped[0].certificados.map((c) => c.id_certificado),
    [CERT_3]
  );
});

test('Step 4.1: buildConglomeradoVinculoSummaries builds RBAC-isolated Conglomerado summaries & nature labels', () => {
  const adminProfile: UserProfile = {
    id: '11111111-1111-1111-1111-111111111111',
    full_name: 'Admin',
    role: 'ADMIN',
    status: 'APPROVED',
  };
  const clientProfile: UserProfile = {
    id: '44444444-4444-4444-4444-444444444444',
    full_name: 'Cliente Iberometal',
    role: 'CLIENT',
    status: 'APPROVED',
  };
  const auditorProfile: UserProfile = {
    id: '33333333-3333-3333-3333-333333333333',
    full_name: 'Auditor',
    role: 'AUDITOR',
    status: 'APPROVED',
  };

  // ADMIN sees both active conglomerados with accurate LIBRE / boxed counts
  const adminSummaries = buildConglomeradoVinculoSummaries({
    conglomerados: CONGLOMERADOS,
    organizaciones: ORGANIZACIONES,
    certificados: CERTIFICADOS,
    vinculos: VINCULOS,
    auditPrograms: [],
    profile: adminProfile,
  });
  assert.equal(adminSummaries.length, 2);
  const indSummary = adminSummaries.find((s) => s.id === CONG_IND)!;
  assert.equal(indSummary.organizacionesCount, 2);
  assert.equal(indSummary.totalCertsCount, 4); // CERT_1, CERT_2, CERT_4, CERT_5
  assert.equal(indSummary.boxedCertsCount, 2); // CERT_1, CERT_4 in VINC_N2
  assert.equal(indSummary.freeCertsCount, 2); // CERT_2, CERT_5 LIBRE
  assert.equal(indSummary.boxesCount, 1);
  assert.equal(indSummary.natureSummary, '1 Multientidad');

  const cybSummary = adminSummaries.find((s) => s.id === CONG_CYB)!;
  assert.equal(cybSummary.totalCertsCount, 1);
  assert.equal(cybSummary.boxedCertsCount, 1);
  assert.equal(cybSummary.freeCertsCount, 0);
  assert.equal(cybSummary.natureSummary, '1 Individual');

  // CLIENT authorized only for ORG_IBEROMETAL never sees ORG_EXAMPLE sibling certs/orgs
  const clientSummaries = buildConglomeradoVinculoSummaries({
    conglomerados: CONGLOMERADOS,
    organizaciones: ORGANIZACIONES,
    certificados: CERTIFICADOS,
    vinculos: VINCULOS,
    auditPrograms: [],
    profile: clientProfile,
    authorizedClientOrgIds: [ORG_IBEROMETAL],
  });
  assert.equal(clientSummaries.length, 1);
  assert.equal(clientSummaries[0].id, CONG_IND);
  assert.equal(clientSummaries[0].organizacionesCount, 1);
  assert.deepEqual(
    clientSummaries[0].organizaciones.map((o) => o.id),
    [ORG_IBEROMETAL]
  );
  assert.equal(clientSummaries[0].totalCertsCount, 2); // CERT_1, CERT_2 only
  assert.equal(clientSummaries[0].boxedCertsCount, 1); // CERT_1
  assert.equal(clientSummaries[0].freeCertsCount, 1); // CERT_2
  assert.deepEqual(
    clientSummaries[0].vinculos[0].certificados.map((c) => c.id_organizacion),
    [ORG_IBEROMETAL]
  );

  // AUDITOR assigned only to CERT_3 sees only CyberCloud
  const auditorSummaries = buildConglomeradoVinculoSummaries({
    conglomerados: CONGLOMERADOS,
    organizaciones: ORGANIZACIONES,
    certificados: CERTIFICADOS,
    vinculos: VINCULOS,
    auditPrograms: [],
    profile: auditorProfile,
    assignedAuditCertIds: [CERT_3],
  });
  assert.equal(auditorSummaries.length, 1);
  assert.equal(auditorSummaries[0].id, CONG_CYB);

  // Plural nature formatting check
  const multiFormat = formatBoxNatureSummary([
    ...VINCULOS,
    {
      ...VINCULOS[1],
      id: '7c000000-0000-0000-0000-000000000010',
      tipo_vinculacion: 'Combinada',
    },
    {
      ...VINCULOS[1],
      id: '7c000000-0000-0000-0000-000000000011',
      tipo_vinculacion: 'Combinada',
    },
  ]);
  assert.ok(multiFormat.summaryText.includes('2 Combinadas'));
});

test('Step 4.1: complex multi-org 3x3 + 4th Combinada box pattern, inference, and transfer guards', () => {
  const CONG_FOOD = '20000000-0000-0000-0000-000000000077';
  const ORG_A = '30000000-0000-0000-0000-000000000071';
  const ORG_B = '30000000-0000-0000-0000-000000000072';
  const C_A1_9 = '40000000-0000-0000-0000-000000000101';
  const C_A1_14 = '40000000-0000-0000-0000-000000000102';
  const C_A1_45 = '40000000-0000-0000-0000-000000000103';
  const C_A4_9 = '40000000-0000-0000-0000-000000000104';
  const C_B4_22 = '40000000-0000-0000-0000-000000000105';
  const BOX_S1 = '7c000000-0000-0000-0000-000000000101';
  const BOX_S4 = '7c000000-0000-0000-0000-000000000104';

  const congList: ConglomeradoEntity[] = [
    {
      id: CONG_FOOD,
      codigo_grupo: 'CONG-FOOD',
      nombre: 'Alimentos Corporativos',
      es_individual_auto: false,
      notas: null,
    },
  ];
  const orgList: OrganizacionEntity[] = [
    {
      id: ORG_A,
      id_grupo_empresarial: CONG_FOOD,
      nombre: 'Planta Procesadora A',
      rif: 'J-10000001-1',
      direccion_fiscal: 'Maracay',
    },
    {
      id: ORG_B,
      id_grupo_empresarial: CONG_FOOD,
      nombre: 'Distribuidora Inocua B',
      rif: 'J-10000002-2',
      direccion_fiscal: 'Valencia',
    },
  ];
  const certList: CertificadoDetailEntity[] = [
    makeCert(C_A1_9, ORG_A, 'Planta Procesadora A', 'CERT-A-9001', 'ISO 9001:2015'),
    makeCert(C_A1_14, ORG_A, 'Planta Procesadora A', 'CERT-A-14001', 'ISO 14001:2015'),
    makeCert(C_A1_45, ORG_A, 'Planta Procesadora A', 'CERT-A-45001', 'ISO 45001:2018'),
    makeCert(C_A4_9, ORG_A, 'Planta Procesadora A', 'CERT-A4-9001', 'ISO 9001:2015'),
    makeCert(C_B4_22, ORG_B, 'Distribuidora Inocua B', 'CERT-B4-22000', 'ISO 22000:2018'),
  ];

  // Start with Box S1 (Integrada 3 norms of Org A) and Box S4 initially empty INDIVIDUAL holding C_A4_9
  const boxes: VinculoEntity[] = [
    {
      id: BOX_S1,
      id_grupo_empresarial: CONG_FOOD,
      codigo_vinculo: 'VINC-S1',
      etiqueta: 'Sitio 1 — SGC+SGA+SST',
      nivel_vinculacion: 'NIVEL_1_INTRA_ORG',
      tipo_vinculacion: 'Integrada',
      es_vinculada: true,
      tiene_sitio_temporal: false,
      notas: null,
      certificados: [C_A1_9, C_A1_14, C_A1_45].map((cid, idx) => ({
        id: `7d000000-0000-0000-0000-00000000010${idx + 1}`,
        id_vinculo: BOX_S1,
        id_certificado: cid,
        numero_certificado: certList[idx].numero_certificado,
        norma_codigo: certList[idx].norma_codigo,
        id_organizacion: ORG_A,
        organizacion_nombre: 'Planta Procesadora A',
        estatus: 'Activo',
      })),
    },
    {
      id: BOX_S4,
      id_grupo_empresarial: CONG_FOOD,
      codigo_vinculo: 'VINC-S4',
      etiqueta: 'Sitio 4 — Combinada Alimentos',
      nivel_vinculacion: 'INDIVIDUAL',
      tipo_vinculacion: 'Individual',
      es_vinculada: false,
      tiene_sitio_temporal: true,
      notas: 'Sede compartida Sitio 4',
      certificados: [
        {
          id: '7d000000-0000-0000-0000-000000000109',
          id_vinculo: BOX_S4,
          id_certificado: C_A4_9,
          numero_certificado: 'CERT-A4-9001',
          norma_codigo: 'ISO 9001:2015',
          id_organizacion: ORG_A,
          organizacion_nombre: 'Planta Procesadora A',
          estatus: 'Activo',
        },
      ],
    },
  ];

  // Combine LIBRE C_B4_22 (Org B, ISO 22000) into BOX_S4 -> auto-upgrades to NIVEL_2_INTER_ORG + Combinada
  const combinePlan = validateBoxTransferPlan({
    certId: C_B4_22,
    conglomeradoId: CONG_FOOD,
    sourceVinculoId: null,
    target: { kind: 'EXISTING_BOX', vinculoId: BOX_S4 },
    vinculos: boxes,
    certificados: certList,
    organizaciones: orgList,
    auditPrograms: [],
    programacionAudits: [],
  });
  assert.equal(combinePlan.allowed, true);
  assert.equal(combinePlan.targetNextClassification?.recommendedNivel, 'NIVEL_2_INTER_ORG');
  assert.equal(combinePlan.targetNextClassification?.recommendedTipo, 'Combinada');
  assert.equal(combinePlan.targetNextClassification?.esVinculada, true);

  // Dual-box protection: C_A1_9 is already in BOX_S1, so assigning from LIBRE (sourceVinculoId = null) fails
  const duplicatePlan = validateBoxTransferPlan({
    certId: C_A1_9,
    conglomeradoId: CONG_FOOD,
    sourceVinculoId: null,
    target: { kind: 'EXISTING_BOX', vinculoId: BOX_S4 },
    vinculos: boxes,
    certificados: certList,
    organizaciones: orgList,
    auditPrograms: [],
    programacionAudits: [],
  });
  assert.equal(duplicatePlan.allowed, false);
  assert.match(duplicatePlan.errorMessage || '', /ya pertenece a la caja/i);

  // Metadata coherence check: Individual cannot hold 2 certs
  const invalidInd = validateVinculoBoxMetadataDraft({
    etiqueta: 'Caja Sitio 4',
    tipo_vinculacion: 'Individual',
    certs: [
      { id_certificado: C_A4_9, id_organizacion: ORG_A, norma_codigo: 'ISO 9001:2015' },
      { id_certificado: C_B4_22, id_organizacion: ORG_B, norma_codigo: 'ISO 22000:2018' },
    ],
  });
  assert.equal(invalidInd.valid, false);
  assert.match(invalidInd.errorMessage || '', /máximo 1 certificado/i);

  const validComb = resolveVinculoCoherenceForSave({
    requestedTipo: 'Combinada',
    certs: [
      { id_certificado: C_A4_9, id_organizacion: ORG_A, norma_codigo: 'ISO 9001:2015' },
      { id_certificado: C_B4_22, id_organizacion: ORG_B, norma_codigo: 'ISO 22000:2018' },
    ],
  });
  assert.equal(validComb.valid, true);
  assert.equal(validComb.nivel_vinculacion, 'NIVEL_2_INTER_ORG');
  assert.equal(validComb.es_vinculada, true);

  // Detach / return to LIBRE is blocked if certificate has an active audit in the source box
  const progActive: ProgramaAuditoriaEntity = {
    id: PROG_N2,
    id_vinculo: BOX_S1,
    id_grupo_empresarial: CONG_FOOD,
    codigo_programa: 'PROG-FOOD-01',
    etiqueta: 'Sitio 1',
    nivel_vinculacion: 'NIVEL_1_INTRA_ORG',
    tipo_vinculacion: 'Integrada',
    es_vinculada: true,
    auditorias: [],
  };
  const blockedToLibre = validateBoxTransferPlan({
    certId: C_A1_9,
    conglomeradoId: CONG_FOOD,
    sourceVinculoId: BOX_S1,
    target: { kind: 'LIBRE' },
    vinculos: boxes,
    certificados: certList,
    organizaciones: orgList,
    auditPrograms: [progActive],
    programacionAudits: [
      makeAudit('80000000-0000-0000-0000-000000000199', PROG_N2, C_A1_9, 'CERT-A-9001', 'Programada'),
    ],
  });
  assert.equal(blockedToLibre.allowed, false);
  assert.equal(assertZeroUuidExposure(blockedToLibre.errorMessage || '').compliant, true);

  // Empty box archive check
  assert.equal(canArchiveVinculoBox(boxes[1], [], []).allowed, false);
  assert.equal(canArchiveVinculoBox({ ...boxes[1], certificados: [] }, [], []).allowed, true);
  assert.equal(
    inferVinculoBoxClassification({
      currentNivel: 'INDIVIDUAL',
      currentTipo: 'Individual',
      certs: [
        { id_certificado: C_A4_9, id_organizacion: ORG_A, norma_codigo: 'ISO 9001:2015' },
        { id_certificado: C_B4_22, id_organizacion: ORG_B, norma_codigo: 'ISO 22000:2018' },
      ],
    }).recommendedTipo,
    'Combinada'
  );
});

test('Step 4.1: renderVinculoView renders Conglomerado Multi View and Grouping Boxes Workspace without children tabs or 1..7 breadcrumb', () => {
  const adminProfile: UserProfile = {
    id: '11111111-1111-1111-1111-111111111111',
    full_name: 'Administrador Principal',
    role: 'ADMIN',
    status: 'APPROVED',
  };
  const clientProfile: UserProfile = {
    id: '44444444-4444-4444-4444-444444444444',
    full_name: 'Cliente Iberometal',
    role: 'CLIENT',
    status: 'APPROVED',
  };

  const baseState: VinculoViewState = { ...DEFAULT_VINCULO_STATE };

  const sumColgroupPct = (html: string): number => {
    const colgroupMatch = html.match(/<colgroup>([\s\S]*?)<\/colgroup>/);
    assert.ok(colgroupMatch, 'Expected <colgroup> in rendered table');
    const widths = Array.from(colgroupMatch[1].matchAll(/width:\s*([0-9.]+)%/g)).map((m) =>
      Number(m[1])
    );
    return Math.round(widths.reduce((acc, n) => acc + n, 0) * 100) / 100;
  };

  const assertZeroButtonsInTbody = (html: string): void => {
    const tbodies = Array.from(html.matchAll(/<tbody[^>]*>([\s\S]*?)<\/tbody>/g));
    assert.ok(tbodies.length > 0, 'Expected at least one <tbody>');
    for (const match of tbodies) {
      assert.equal(
        match[1].includes('<button'),
        false,
        'Zero <button elements allowed inside <tbody>'
      );
    }
  };

  // 1. Multi View centered on Conglomerado
  const multiHtml = renderVinculoView({
    profile: adminProfile,
    state: baseState,
    vinculos: VINCULOS,
    conglomerados: CONGLOMERADOS,
    organizaciones: ORGANIZACIONES,
    certificados: CERTIFICADOS,
    auditPrograms: [],
    programacionAudits: [],
  });
  assert.equal(sumColgroupPct(multiHtml), 100);
  assertZeroButtonsInTbody(multiHtml);
  assert.ok(multiHtml.includes('Vínculo por Conglomerado'));
  assert.ok(multiHtml.includes('data-action="select-vinculo-conglomerado"'));
  assert.ok(multiHtml.includes('Con certificados LIBRE'));
  assert.ok(multiHtml.includes('2 Libres'));
  assert.equal(assertZeroUuidExposure(multiHtml).compliant, true);

  // 2. Detail View: Grouping Boxes Workspace for CONG_IND
  const programs: ProgramaAuditoriaEntity[] = [
    {
      id: PROG_N2,
      id_vinculo: VINC_N2,
      id_grupo_empresarial: CONG_IND,
      codigo_programa: 'PROG-2026-002',
      etiqueta: 'Campaña Nivel 2',
      nivel_vinculacion: 'NIVEL_2_INTER_ORG',
      tipo_vinculacion: 'Multientidad',
      es_vinculada: true,
      tiene_sitio_temporal: true,
      auditorias: [],
    },
  ];
  const detailHtml = renderVinculoView({
    profile: adminProfile,
    state: {
      ...baseState,
      selectedConglomeradoId: CONG_IND,
      isCreatingBox: true,
    },
    vinculos: VINCULOS,
    conglomerados: CONGLOMERADOS,
    organizaciones: ORGANIZACIONES,
    certificados: CERTIFICADOS,
    auditPrograms: programs,
    programacionAudits: [
      makeAudit('80000000-0000-0000-0000-000000000006', PROG_N2, CERT_1, 'FN-QMS-2024-001', 'En Ejecución'),
    ],
  });

  // Zero children tabs & zero 1..7 In-Card Breadcrumb
  assert.equal(detailHtml.includes('data-vinculo-tab'), false);
  assert.equal(detailHtml.includes('data-audit-card-breadcrumb'), false);

  // Header + LIBRE Pool + Boxes Grid + Nueva Caja form + Active-audit ISO guard + Abrir Resumen
  assert.ok(detailHtml.includes('data-action="back-to-vinculo-list"'));
  assert.ok(detailHtml.includes('data-action="open-create-vinculo-box"'));
  assert.ok(detailHtml.includes('2/4 certificados en cajas · 2 libres'));
  assert.ok(detailHtml.includes('Bandeja LIBRE (2)'));
  assert.ok(detailHtml.includes('Cajas Agrupadoras (1)'));
  assert.ok(detailHtml.includes('id="newVinculoBoxForm"'));
  assert.ok(detailHtml.includes('data-action="open-cert-resumen"'));
  assert.ok(detailHtml.includes('Integridad ISO'));
  assert.ok(detailHtml.includes('Protegido por auditoría activa'));
  assert.equal(assertZeroUuidExposure(detailHtml).compliant, true);

  // 3. CLIENT read-only & Level 2 sibling isolation inside Workspace (including notas redaction)
  const vinculosWithLeakyNote = VINCULOS.map((v) =>
    v.id === VINC_N2
      ? {
          ...v,
          notas: 'Nota interna Nivel 2 (Iberometal + Example, C.A.) con sitio temporal.',
        }
      : v
  );
  const clientScoped = scopeVinculosForProfile(
    vinculosWithLeakyNote,
    clientProfile,
    [ORG_IBEROMETAL],
    []
  );
  assert.equal(clientScoped[0]?.notas, null);

  const clientDetailHtml = renderVinculoView({
    profile: clientProfile,
    state: { ...baseState, selectedConglomeradoId: CONG_IND },
    vinculos: vinculosWithLeakyNote,
    conglomerados: CONGLOMERADOS,
    organizaciones: ORGANIZACIONES,
    certificados: CERTIFICADOS,
    auditPrograms: programs,
    programacionAudits: [],
    authorizedClientOrgIds: [ORG_IBEROMETAL],
  });
  assert.ok(clientDetailHtml.includes('FN-QMS-2024-001'));
  assert.equal(clientDetailHtml.includes('FN-QMS-2025-004'), false); // Sibling Example, C.A. cert must NOT leak
  assert.equal(clientDetailHtml.includes('Example, C.A.'), false);
  assert.equal(clientDetailHtml.includes('open-create-vinculo-box'), false);
  assert.equal(clientDetailHtml.includes('start-edit-vinculo-box'), false);
  assert.equal(clientDetailHtml.includes('assign-cert-to-target-box'), false);
  assert.equal(assertZeroUuidExposure(clientDetailHtml).compliant, true);
});

test('Step 3.1: 06_datos_prueba.sql seeds 6 qualified auditors (3-table matrices) and VINC-N1-02 Combinada leaving FN-QMS-2026-008 LIBRE', () => {
  const sql06 = fs.readFileSync(
    path.resolve(process.cwd(), 'public/supabase/queries/06_datos_prueba.sql'),
    'utf8'
  );

  // 1. 6 auditors seeded in public.auditor
  for (const id of [
    '33333333-3333-3333-3333-333333333333',
    '10000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000004',
    '10000000-0000-0000-0000-000000000005',
  ]) {
    assert.ok(sql06.includes(`'${id}'`), `Missing auditor ${id} in 06_datos_prueba.sql`);
  }

  // Evaluator has ISO 45001 added; Carlos Mendoza has subsector 28.1 added
  assert.ok(
    sql06.includes("('33333333-3333-3333-3333-333333333333', 'e0000000-0000-0000-0000-000000045001')")
  );
  assert.ok(
    sql06.includes("('10000000-0000-0000-0000-000000000001', 'da000000-0000-0000-0000-000000000281')")
  );

  // 2. VINC-N1-02 (Combinada) links 40...0002 + 40...0010, and 40...0008 stays LIBRE (0 rows in vinculo_certificado)
  assert.ok(sql06.includes("'7c000000-0000-0000-0000-000000000005'"));
  assert.ok(sql06.includes("'VINC-N1-02'"));
  assert.ok(
    sql06.includes(
      "('7d000000-0000-0000-0000-000000000007', '7c000000-0000-0000-0000-000000000005', '40000000-0000-0000-0000-000000000002')"
    )
  );
  assert.ok(
    sql06.includes(
      "('7d000000-0000-0000-0000-000000000008', '7c000000-0000-0000-0000-000000000005', '40000000-0000-0000-0000-000000000010')"
    )
  );

  const vcBlockStart = sql06.indexOf('INSERT INTO public.vinculo_certificado');
  const vcBlockEnd = sql06.indexOf('ON CONFLICT (id_certificado)', vcBlockStart);
  assert.ok(vcBlockStart > -1 && vcBlockEnd > vcBlockStart);
  const vcBlock = sql06.slice(vcBlockStart, vcBlockEnd);
  assert.equal(vcBlock.includes('40000000-0000-0000-0000-000000000008'), false);
});

test('Step 2.3: certificates without active Alcance can group in Vínculo but cannot generate audits', () => {
  const certNoScope: CertificadoDetailEntity = {
    ...makeCert(CERT_3, ORG_CYBERCLOUD, 'CyberCloud Solutions S.L.', 'FN-ISMS-SIN-ALC', 'ISO/IEC 27001:2022'),
    alcance: '',
    alcanceDetalle: null,
  };
  const certArchivedScope: CertificadoDetailEntity = {
    ...makeCert(CERT_2, ORG_IBEROMETAL, 'Iberometal Componentes S.A.', 'FN-EMS-ARCH-ALC', 'ISO 14001:2015'),
    alcanceDetalle: {
      id: '90000000-0000-0000-0000-000000000999',
      id_certificado: CERT_2,
      alcance_es: 'Alcance archivado',
      alcance_en: null,
      esCompartido: false,
      deleted_at: '2026-05-01T10:00:00Z',
    },
  };

  // 1. Certificate without Alcance can still be grouped into an INDIVIDUAL box
  const formError = validateVinculoFormDraft(
    {
      id_grupo_empresarial: CONG_IND,
      codigo_vinculo: 'VINC-SIN-ALC',
      etiqueta: 'Caja sin Alcance',
      nivel_vinculacion: 'INDIVIDUAL',
      tipo_vinculacion: 'Individual',
      tiene_sitio_temporal: false,
      notas: '',
      certificadoIds: [CERT_2],
    },
    VINCULOS,
    [...CERTIFICADOS.filter((c) => c.id !== CERT_2), certArchivedScope],
    ORGANIZACIONES
  );
  assert.equal(formError, null);

  // 2. Transfer plan into a box also succeeds when Alcance is absent
  const transferPlan = validateBoxTransferPlan({
    certId: CERT_2,
    conglomeradoId: CONG_IND,
    sourceVinculoId: null,
    target: { kind: 'EXISTING_BOX', vinculoId: VINC_N2 },
    vinculos: VINCULOS,
    certificados: [...CERTIFICADOS.filter((c) => c.id !== CERT_2), certArchivedScope],
    organizaciones: ORGANIZACIONES,
    auditPrograms: [],
    programacionAudits: [],
  });
  assert.equal(transferPlan.allowed, true);

  // 3. Commitment summary marks hasAlcance = false and blocks audit generation with Zero-UUID Spanish reason
  const summaries = computeCertificateCommitmentSummaries(
    [certNoScope, certArchivedScope],
    ORGANIZACIONES,
    CONGLOMERADOS,
    VINCULOS
  );

  const summaryBoxedNoScope = summaries.find((s) => s.certificado.id === CERT_3)!;
  assert.equal(summaryBoxedNoScope.status, 'INDIVIDUAL');
  assert.equal(summaryBoxedNoScope.hasAlcance, false);
  assert.equal(summaryBoxedNoScope.canGenerateAudits, false);
  assert.match(summaryBoxedNoScope.blockReason || '', /FN-ISMS-SIN-ALC/);
  assert.match(summaryBoxedNoScope.blockReason || '', /no posee un Alcance activo/i);
  assert.equal(assertZeroUuidExposure(summaryBoxedNoScope.blockReason || '').compliant, true);

  const designacionGate = canCertificateEnterDesignacion(summaryBoxedNoScope);
  assert.equal(designacionGate.allowed, false);
  assert.match(designacionGate.reason || '', /Alcance activo/i);
  assert.equal(assertZeroUuidExposure(designacionGate.reason || '').compliant, true);

  const summaryLibreArchivedScope = summaries.find((s) => s.certificado.id === CERT_2)!;
  assert.equal(summaryLibreArchivedScope.status, 'LIBRE');
  assert.equal(summaryLibreArchivedScope.hasAlcance, false);
  assert.equal(summaryLibreArchivedScope.canGenerateAudits, false);
  assert.match(summaryLibreArchivedScope.blockReason || '', /sin Alcance activo/i);
  assert.equal(
    assertZeroUuidExposure(summaryLibreArchivedScope.blockReason || '').compliant,
    true
  );
});




