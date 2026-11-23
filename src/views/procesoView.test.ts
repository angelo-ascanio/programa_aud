import test from 'node:test';
import assert from 'node:assert/strict';
import type { UserProfile } from '../lib/healthCheck';
import {
  INITIAL_ALL_SEEDED_CERTIFICADOS_DETAILED,
  type CertificadoDetailEntity,
  type ProcessEntity,
} from '../lib/multisiteSampling';
import {
  getAllSeededNormaRequirements,
  resolveProcesoDetailById,
} from '../lib/procesoDomain';
import { assertZeroUuidExposure } from '../lib/zeroUuid';
import { renderProcesoView } from './procesoView';

const ADMIN_PROFILE: UserProfile = {
  id: '00000000-0000-0000-0000-000000000001',
  nombre: 'Admin Demo',
  role: 'ADMIN',
  status: 'APPROVED',
  created_at: '2026-01-01T00:00:00Z',
};

const AUDITOR_PROFILE: UserProfile = {
  id: '00000000-0000-0000-0000-000000000002',
  nombre: 'Auditor Demo',
  role: 'AUDITOR',
  status: 'APPROVED',
  created_at: '2026-01-01T00:00:00Z',
};

const CLIENT_PROFILE: UserProfile = {
  id: '00000000-0000-0000-0000-000000000003',
  nombre: 'Cliente Filial',
  role: 'CLIENT',
  status: 'APPROVED',
  created_at: '2026-01-01T00:00:00Z',
};

const CERT_A_ID = '91000000-0000-0000-0000-000000000001';
const CERT_B_SAME_ID = '91000000-0000-0000-0000-000000000002';
const CERT_C_DIFF_ID = '91000000-0000-0000-0000-000000000003';
const PROC_ID = '92000000-0000-0000-0000-000000000001';

function buildFixtureCerts(syncFlag: boolean): CertificadoDetailEntity[] {
  const base9001 = INITIAL_ALL_SEEDED_CERTIFICADOS_DETAILED[0];
  const base14001 =
    INITIAL_ALL_SEEDED_CERTIFICADOS_DETAILED.find((c) =>
      c.norma_codigo.includes('14001')
    ) || INITIAL_ALL_SEEDED_CERTIFICADOS_DETAILED[1];

  const ownerProc: ProcessEntity = {
    id: PROC_ID,
    id_certificado: CERT_A_ID,
    ownerCertId: CERT_A_ID,
    nombre_proceso: 'Gestión de Calidad Corporativa',
    tipo: 'Estratégico',
    responsable: 'Gerencia SGC',
    clausulas_cubiertas: ['4.1', '8.2'],
    requisitos_detalle: [
      { codigo: '4.1', titulo: 'Comprensión de la organización y su contexto' },
      { codigo: '8.2', titulo: 'Requisitos para los productos y servicios' },
    ],
    sharedTargets: [
      {
        linkId: '93000000-0000-0000-0000-000000000001',
        targetCertId: CERT_B_SAME_ID,
        targetCertLabel: 'FN-QMS-SAME-02 · ISO 9001:2015',
        sincronizar_requisitos: syncFlag,
      },
      {
        linkId: '93000000-0000-0000-0000-000000000002',
        targetCertId: CERT_C_DIFF_ID,
        targetCertLabel: 'FN-EMS-DIFF-03 · ISO 14001:2015',
        sincronizar_requisitos: false,
      },
    ],
  };

  const peerSameProc: ProcessEntity = {
    id: PROC_ID,
    id_certificado: CERT_B_SAME_ID,
    ownerCertId: CERT_A_ID,
    sharedFromCertId: CERT_A_ID,
    sharedFromCertLabel: 'FN-QMS-OWN-01 · ISO 9001:2015',
    sharedLinkSincronizarRequisitos: syncFlag,
    nombre_proceso: 'Gestión de Calidad Corporativa',
    tipo: 'Estratégico',
    responsable: 'Gerencia SGC',
    clausulas_cubiertas: syncFlag ? ['4.1', '8.2'] : [],
    requisitos_detalle: syncFlag
      ? [
          { codigo: '4.1', titulo: 'Comprensión de la organización y su contexto' },
          { codigo: '8.2', titulo: 'Requisitos para los productos y servicios' },
        ]
      : [],
  };

  const peerDiffProc: ProcessEntity = {
    id: PROC_ID,
    id_certificado: CERT_C_DIFF_ID,
    ownerCertId: CERT_A_ID,
    sharedFromCertId: CERT_A_ID,
    sharedFromCertLabel: 'FN-QMS-OWN-01 · ISO 9001:2015',
    sharedLinkSincronizarRequisitos: false,
    nombre_proceso: 'Gestión de Calidad Corporativa',
    tipo: 'Estratégico',
    responsable: 'Gerencia SGC',
    clausulas_cubiertas: [],
    requisitos_detalle: [],
  };

  return [
    {
      ...base9001,
      id: CERT_A_ID,
      numero_certificado: 'FN-QMS-OWN-01',
      id_organizacion: '80000000-0000-0000-0000-000000000001',
      organizacion_nombre: 'Org Alfa Matriz',
      procesos: [ownerProc],
    },
    {
      ...base9001,
      id: CERT_B_SAME_ID,
      numero_certificado: 'FN-QMS-SAME-02',
      id_organizacion: '80000000-0000-0000-0000-000000000002',
      organizacion_nombre: 'Org Beta Same Norm',
      procesos: [peerSameProc],
    },
    {
      ...base14001,
      id: CERT_C_DIFF_ID,
      numero_certificado: 'FN-EMS-DIFF-03',
      id_organizacion: '80000000-0000-0000-0000-000000000003',
      organizacion_nombre: 'Org Gamma Diff Norm',
      procesos: [peerDiffProc],
    },
  ];
}

test('Step 1.3 procesoView: displays same-norm sync controls + diff-norm independence note, enforces RBAC & CLIENT isolation, and leaks 0 UUIDs', () => {
  const catalog = getAllSeededNormaRequirements();

  // 1. Synced same-norm + diff-norm peer -> ADMIN sees active sync + "Sincronizar Requisitos Ahora" + diff-norm note
  const syncedCerts = buildFixtureCerts(true);
  const procSynced = resolveProcesoDetailById({
    procesoId: PROC_ID,
    activeCertId: CERT_A_ID,
    certificates: syncedCerts,
    programacionAudits: [],
    phase5Findings: [],
    requirementsCatalog: catalog,
  });
  assert.ok(procSynced);

  const adminSyncedHtml = renderProcesoView({
    profile: ADMIN_PROFILE,
    state: {
      selectedProcesoId: PROC_ID,
      activeChildTab: 'requisitos',
      prefillCertId: CERT_A_ID,
      isEditingAttributes: false,
    },
    proceso: procSynced,
    activeCertId: CERT_A_ID,
    certificates: syncedCerts,
    requirementsCatalog: catalog,
  });

  assert.ok(adminSyncedHtml.includes('Sincronización activa con 1 cert(s) de ISO 9001:2015'));
  assert.ok(adminSyncedHtml.includes('FN-QMS-SAME-02'));
  assert.ok(adminSyncedHtml.includes('data-action="sync-shared-proceso-reqs"'));
  assert.ok(adminSyncedHtml.includes('Sincronizar Requisitos Ahora'));
  assert.ok(
    adminSyncedHtml.includes(
      'Compartido con 1 cert(s) de otra norma con requisitos independientes (no se mezclan cláusulas entre normas).'
    )
  );
  assert.equal(assertZeroUuidExposure(adminSyncedHtml).compliant, true);

  // 2. Unsynced same-norm peer (process shared empty initially) -> offers "Compartir conjunto de cláusulas"
  const unsyncedCerts = buildFixtureCerts(false);
  const procUnsynced = resolveProcesoDetailById({
    procesoId: PROC_ID,
    activeCertId: CERT_A_ID,
    certificates: unsyncedCerts,
    programacionAudits: [],
    phase5Findings: [],
    requirementsCatalog: catalog,
  });
  assert.ok(procUnsynced);

  const adminUnsyncedHtml = renderProcesoView({
    profile: ADMIN_PROFILE,
    state: {
      selectedProcesoId: PROC_ID,
      activeChildTab: 'requisitos',
      prefillCertId: CERT_A_ID,
      isEditingAttributes: false,
    },
    proceso: procUnsynced,
    activeCertId: CERT_A_ID,
    certificates: unsyncedCerts,
    requirementsCatalog: catalog,
  });

  assert.ok(
    adminUnsyncedHtml.includes(
      'Compartido sin requisitos sincronizados con 1 cert(s) de ISO 9001:2015'
    )
  );
  assert.ok(adminUnsyncedHtml.includes('Compartir conjunto de cláusulas'));
  assert.equal(assertZeroUuidExposure(adminUnsyncedHtml).compliant, true);

  // 3. Diff-norm receiving view sees independence note and NO same-norm sync button
  const procDiff = resolveProcesoDetailById({
    procesoId: PROC_ID,
    activeCertId: CERT_C_DIFF_ID,
    certificates: syncedCerts,
    programacionAudits: [],
    phase5Findings: [],
    requirementsCatalog: catalog,
  });
  assert.ok(procDiff);

  const diffCertHtml = renderProcesoView({
    profile: ADMIN_PROFILE,
    state: {
      selectedProcesoId: PROC_ID,
      activeChildTab: 'requisitos',
      prefillCertId: CERT_C_DIFF_ID,
      isEditingAttributes: false,
    },
    proceso: procDiff,
    activeCertId: CERT_C_DIFF_ID,
    certificates: syncedCerts,
    requirementsCatalog: catalog,
  });
  assert.ok(
    diffCertHtml.includes(
      'Compartido con 2 cert(s) de otra norma con requisitos independientes (no se mezclan cláusulas entre normas).'
    )
  );
  assert.equal(diffCertHtml.includes('data-action="sync-shared-proceso-reqs"'), false);
  assert.equal(assertZeroUuidExposure(diffCertHtml).compliant, true);

  // 4. AUDITOR is read-only (status visible, NO sync button); cross-org CLIENT sees neither peer names nor sync button
  const auditorHtml = renderProcesoView({
    profile: AUDITOR_PROFILE,
    state: {
      selectedProcesoId: PROC_ID,
      activeChildTab: 'requisitos',
      prefillCertId: CERT_A_ID,
      isEditingAttributes: false,
    },
    proceso: procSynced,
    activeCertId: CERT_A_ID,
    certificates: syncedCerts,
    requirementsCatalog: catalog,
  });
  assert.ok(auditorHtml.includes('Sincronización activa con 1 cert(s) de ISO 9001:2015'));
  assert.equal(auditorHtml.includes('data-action="sync-shared-proceso-reqs"'), false);

  const clientHtml = renderProcesoView({
    profile: CLIENT_PROFILE,
    state: {
      selectedProcesoId: PROC_ID,
      activeChildTab: 'requisitos',
      prefillCertId: CERT_B_SAME_ID,
      isEditingAttributes: false,
    },
    proceso: resolveProcesoDetailById({
      procesoId: PROC_ID,
      activeCertId: CERT_B_SAME_ID,
      certificates: syncedCerts,
      programacionAudits: [],
      phase5Findings: [],
      requirementsCatalog: catalog,
    }),
    activeCertId: CERT_B_SAME_ID,
    certificates: syncedCerts,
    authorizedClientOrgIds: ['80000000-0000-0000-0000-000000000002'],
    requirementsCatalog: catalog,
  });
  assert.ok(clientHtml.includes('Proceso compartido dentro del conglomerado'));
  assert.equal(clientHtml.includes('FN-QMS-OWN-01'), false);
  assert.equal(clientHtml.includes('FN-EMS-DIFF-03'), false);
  assert.equal(clientHtml.includes('data-action="sync-shared-proceso-reqs"'), false);
  assert.equal(assertZeroUuidExposure(clientHtml).compliant, true);
});
