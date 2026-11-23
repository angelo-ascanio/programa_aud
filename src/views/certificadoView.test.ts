import test from 'node:test';
import assert from 'node:assert/strict';
import type { UserProfile } from '../lib/healthCheck';
import {
  INITIAL_ALL_SEEDED_CERTIFICADOS_DETAILED,
  type CertificadoDetailEntity,
  type CertificadoViewState,
  type ProcessEntity,
} from '../lib/multisiteSampling';
import { assertZeroUuidExposure } from '../lib/zeroUuid';
import { renderCertificadoDetailPage } from './certificadoView';

const ADMIN_PROFILE: UserProfile = {
  id: '00000000-0000-0000-0000-000000000001',
  nombre: 'Admin Demo',
  role: 'ADMIN',
  status: 'APPROVED',
  created_at: '2026-01-01T00:00:00Z',
};

const CLIENT_PROFILE: UserProfile = {
  id: '00000000-0000-0000-0000-000000000003',
  nombre: 'Cliente Demo',
  role: 'CLIENT',
  status: 'APPROVED',
  created_at: '2026-01-01T00:00:00Z',
};

function buildCertDetailState(selectedCertId: string): CertificadoViewState {
  return {
    selectedCertId,
    activeChildTab: 'procesos',
    query: '',
    selectedStandard: 'ALL',
    selectedStatus: 'ALL',
    selectedSectorIaf: 'ALL',
    viewMode: 'grid',
    sortColumn: null,
    sortDirection: 'none',
    isEditingAttributes: false,
    isCreating: false,
    isSidebarOpen: false,
    facetSelections: {},
  };
}

test('Step 1.3 certificadoView (procesos tab): renders Compartir action for staff, Compartido/Vinculado/Sincronizado badges, 0 tbody buttons, and Zero-UUID', () => {
  const base = INITIAL_ALL_SEEDED_CERTIFICADOS_DETAILED[0];
  const procSyncedOwner: ProcessEntity = {
    id: '92000000-0000-0000-0000-000000000010',
    id_certificado: base.id,
    ownerCertId: base.id,
    nombre_proceso: 'Producción Sincronizada',
    tipo: 'Misional / Operativo',
    responsable: 'Jefe de Planta',
    clausulas_cubiertas: ['8.1'],
    requisitos_detalle: [{ codigo: '8.1', titulo: 'Planificación y control operacional' }],
    sharedTargets: [
      {
        linkId: '93000000-0000-0000-0000-000000000010',
        targetCertId: '91000000-0000-0000-0000-000000000099',
        targetCertLabel: 'FN-QMS-FILIAL · ISO 9001:2015',
        sincronizar_requisitos: true,
      },
    ],
  };

  const procUnsyncedLinked: ProcessEntity = {
    id: '92000000-0000-0000-0000-000000000011',
    id_certificado: base.id,
    ownerCertId: '91000000-0000-0000-0000-000000000098',
    sharedFromCertId: '91000000-0000-0000-0000-000000000098',
    sharedFromCertLabel: 'FN-EMS-ORIGEN · ISO 14001:2015',
    sharedLinkSincronizarRequisitos: false,
    nombre_proceso: 'Gestión Ambiental Independiente',
    tipo: 'Apoyo / Soporte',
    responsable: 'Coord. Ambiental',
    clausulas_cubiertas: [],
    requisitos_detalle: [],
  };

  const cert: CertificadoDetailEntity = {
    ...base,
    procesos: [procSyncedOwner, procUnsyncedLinked],
  };

  const adminHtml = renderCertificadoDetailPage({
    cert,
    profile: ADMIN_PROFILE,
    state: buildCertDetailState(cert.id),
    allCertificates: [cert],
  });

  assert.ok(adminHtml.includes('data-action="open-share-child-modal"'));
  assert.ok(adminHtml.includes('data-share-kind="proceso"'));
  assert.ok(adminHtml.includes('Compartido'));
  assert.ok(adminHtml.includes('Vinculado'));
  assert.ok(adminHtml.includes('Sincronizado'));

  const tbodyMatch = adminHtml.match(/<tbody[\s\S]*?<\/tbody>/i);
  assert.ok(tbodyMatch, 'Expected <tbody> in cert-tab-procesos');
  assert.equal(/<button\b/i.test(tbodyMatch[0]), false, '0 <button> elements allowed in <tbody>');
  assert.equal(assertZeroUuidExposure(adminHtml).compliant, true);

  const clientHtml = renderCertificadoDetailPage({
    cert,
    profile: CLIENT_PROFILE,
    state: buildCertDetailState(cert.id),
    allCertificates: [cert],
  });
  assert.equal(clientHtml.includes('data-action="open-share-child-modal"'), false);
  assert.equal(assertZeroUuidExposure(clientHtml).compliant, true);
});
