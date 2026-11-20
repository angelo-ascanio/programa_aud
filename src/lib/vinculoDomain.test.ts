import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canCertificateEnterDesignacion,
  canDetachCertificateFromVinculo,
  computeCertificateCommitmentSummaries,
  filterFreeCertificatesInConglomerado,
  getCommitmentStatusLabel,
  scopeVinculosForProfile,
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

test('Step 2.3: renderVinculoView enforces 100% colgroup, zero tbody buttons, LIBRE count, temporal toggle, and Zero-UUID', () => {
  const adminProfile: UserProfile = {
    id: '11111111-1111-1111-1111-111111111111',
    nombre: 'Administrador Principal',
    role: 'ADMIN',
    status: 'APPROVED',
  };

  const baseState: VinculoViewState = {
    activeSubMode: 'vinculos',
    query: '',
    viewMode: 'list',
    isSidebarOpen: true,
    sortColumn: null,
    sortDirection: 'none',
    facetSelections: {},
    selectedVinculoId: null,
    activeChildTab: 'certificados',
    isCreating: false,
    isEditingAttributes: false,
    editErrorMessage: null,
    selectedFreeCertIdsForBatch: [],
  };

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

  // 1. Vínculos Multi View (table mode)
  const vinculosHtml = renderVinculoView({
    profile: adminProfile,
    state: baseState,
    vinculos: VINCULOS,
    conglomerados: CONGLOMERADOS,
    organizaciones: ORGANIZACIONES,
    certificados: CERTIFICADOS,
    auditPrograms: [],
    programacionAudits: [],
  });
  assert.equal(sumColgroupPct(vinculosHtml), 100);
  assertZeroButtonsInTbody(vinculosHtml);
  // 3 LIBRE certificates in fixture: CERT_2, CERT_5, CERT_ORPHAN
  assert.ok(vinculosHtml.includes('Certificados Libres (3)'));
  assert.ok(vinculosHtml.includes('Tiene Sitio Temporal'));
  assert.equal(assertZeroUuidExposure(vinculosHtml).compliant, true);

  // 2. Certificados Libres Queue mode
  const libresHtml = renderVinculoView({
    profile: adminProfile,
    state: { ...baseState, activeSubMode: 'libres' },
    vinculos: VINCULOS,
    conglomerados: CONGLOMERADOS,
    organizaciones: ORGANIZACIONES,
    certificados: CERTIFICADOS,
    auditPrograms: [],
    programacionAudits: [],
  });
  assert.equal(sumColgroupPct(libresHtml), 100);
  assertZeroButtonsInTbody(libresHtml);
  assert.ok(libresHtml.includes('Pasar a Individual'));
  assert.ok(libresHtml.includes('Crear Vínculo Grupal'));
  assert.equal(assertZeroUuidExposure(libresHtml).compliant, true);

  // 3. Create mode includes tiene_sitio_temporal checkbox
  const createHtml = renderVinculoView({
    profile: adminProfile,
    state: { ...baseState, isCreating: true },
    vinculos: VINCULOS,
    conglomerados: CONGLOMERADOS,
    organizaciones: ORGANIZACIONES,
    certificados: CERTIFICADOS,
    auditPrograms: [],
    programacionAudits: [],
  });
  assert.ok(createHtml.includes('Este vínculo incluye al menos un sitio temporal / proyecto'));
  assert.ok(createHtml.includes('name="tiene_sitio_temporal"'));
  assert.equal(assertZeroUuidExposure(createHtml).compliant, true);

  // 4. Detail View includes Zone 1 Conglomerado chip & Zone 3 Campanias jump to designacion/tipo
  const detailHtml = renderVinculoView({
    profile: adminProfile,
    state: { ...baseState, selectedVinculoId: VINC_N2, activeChildTab: 'campanias' },
    vinculos: VINCULOS,
    conglomerados: CONGLOMERADOS,
    organizaciones: ORGANIZACIONES,
    certificados: CERTIFICADOS,
    auditPrograms: [],
    programacionAudits: [],
  });
  assert.ok(detailHtml.includes('data-parent-type="conglomerado"'));
  assert.ok(detailHtml.includes('data-subview="designacion/tipo"'));
  assert.equal(assertZeroUuidExposure(detailHtml).compliant, true);
});

