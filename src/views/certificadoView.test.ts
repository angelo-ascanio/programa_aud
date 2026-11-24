import test from 'node:test';
import assert from 'node:assert/strict';
import type { UserProfile } from '../lib/healthCheck';
import { INITIAL_ORGANIZACIONES, type OrganizacionEntity } from '../lib/activeCertificates';
import { INITIAL_CONGLOMERADOS, type ConglomeradoEntity } from '../lib/conglomeradoDomain';
import {
  buildDefaultAuditVersionResolutions,
  validateAuditVersionResolutions,
  type AuditVersionClassificationInput,
} from '../lib/certificadoVersionDomain';
import {
  INITIAL_ALL_SEEDED_CERTIFICADOS_DETAILED,
  type CertificadoDetailEntity,
  type CertificadoVersionSnapshot,
  type CertificadoViewState,
  type ProcessEntity,
} from '../lib/multisiteSampling';
import { assertZeroUuidExposure } from '../lib/zeroUuid';
import {
  renderCertAuditResolutionModal,
  renderCertificadoDetailPage,
  renderCertificadoView,
} from './certificadoView';

const ADMIN_PROFILE: UserProfile = {
  id: '00000000-0000-0000-0000-000000000001',
  nombre: 'Admin Demo',
  role: 'ADMIN',
  status: 'APPROVED',
  created_at: '2026-01-01T00:00:00Z',
};

const WORKER_PROFILE: UserProfile = {
  id: '00000000-0000-0000-0000-000000000002',
  nombre: 'Worker Demo',
  role: 'WORKER',
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

const AUDITOR_PROFILE: UserProfile = {
  id: '00000000-0000-0000-0000-000000000004',
  nombre: 'Auditor Demo',
  role: 'AUDITOR',
  status: 'APPROVED',
  created_at: '2026-01-01T00:00:00Z',
};

function buildCertDetailState(
  selectedCertId: string,
  activeChildTab: CertificadoViewState['activeChildTab'] = 'procesos'
): CertificadoViewState {
  return {
    selectedCertId,
    activeChildTab,
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

function assertTableStructuralInvariants(html: string, tableId: string): void {
  const escapedId = tableId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const tableRegex = new RegExp(
    `<table[^>]*id="${escapedId}"[^>]*>[\\s\\S]*?<\\/table>`,
    'i'
  );
  const tableMatch = html.match(tableRegex);
  assert.ok(tableMatch, `Expected table #${tableId}`);
  const tableHtml = tableMatch[0];
  assert.ok(tableHtml.includes('table-fixed'), `Table #${tableId} must use table-fixed`);

  const tbodyMatch = tableHtml.match(/<tbody[\s\S]*?<\/tbody>/i);
  assert.ok(tbodyMatch, `Table #${tableId} must contain <tbody>`);
  assert.equal(/<button\b/i.test(tbodyMatch[0]), false, `0 <button> elements allowed in #${tableId} tbody`);

  const colgroupMatch = tableHtml.match(/<colgroup>([\s\S]*?)<\/colgroup>/i);
  assert.ok(colgroupMatch, `Table #${tableId} must include <colgroup>`);
  const pcts = Array.from(colgroupMatch[1].matchAll(/width:\s*([0-9.]+)%/g)).map((m) => Number(m[1]));
  assert.ok(pcts.length > 0, `Table #${tableId} <colgroup> must use percentage widths`);
  const totalPct = pcts.reduce((sum, n) => sum + n, 0);
  assert.ok(Math.abs(totalPct - 100) <= 0.15, `Table #${tableId} colgroup widths must sum to 100%, got ${totalPct}`);
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
    state: buildCertDetailState(cert.id, 'procesos'),
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
    state: buildCertDetailState(cert.id, 'procesos'),
    allCertificates: [cert],
  });
  assert.equal(clientHtml.includes('data-action="open-share-child-modal"'), false);
  assert.equal(assertZeroUuidExposure(clientHtml).compliant, true);
});

test('Step 3.3 certificadoView Multi View: renders vN badge, organizacion_abreviacion, Sin alcance badge, and searches bilingual ES/EN Alcance', () => {
  const baseWithScope: CertificadoDetailEntity = {
    ...INITIAL_ALL_SEEDED_CERTIFICADOS_DETAILED[0],
    id: 'aa000000-0000-0000-0000-000000000001',
    numero_certificado: 'FN-33-MV-01',
    organizacion_nombre: 'Industrias Alfa S.A.',
    organizacion_abreviacion: 'INDALFA',
    version_actual_numero: 3,
    alcance: 'Manufactura de válvulas industriales',
    alcanceDetalle: {
      id: 'ab000000-0000-0000-0000-000000000001',
      id_certificado: 'aa000000-0000-0000-0000-000000000001',
      alcance_es: 'Manufactura de válvulas industriales de alta presión',
      alcance_en: 'Manufacturing of high-pressure industrial valves and cryogenic manifolds',
      esCompartido: false,
    },
  };
  const certSinAlcance: CertificadoDetailEntity = {
    ...INITIAL_ALL_SEEDED_CERTIFICADOS_DETAILED[0],
    id: 'aa000000-0000-0000-0000-000000000002',
    numero_certificado: 'FN-33-MV-02',
    organizacion_nombre: 'Servicios Beta C.A.',
    organizacion_abreviacion: 'SERVBETA',
    version_actual_numero: 1,
    alcance: '',
    alcanceDetalle: null,
  };

  const listHtml = renderCertificadoView({
    profile: ADMIN_PROFILE,
    state: {
      ...buildCertDetailState('', 'alcance'),
      selectedCertId: null,
      viewMode: 'list',
    },
    certificates: [baseWithScope, certSinAlcance],
  });

  assert.ok(listHtml.includes('v3'));
  assert.ok(listHtml.includes('INDALFA'));
  assert.ok(listHtml.includes('Sin alcance'));
  assert.equal(assertZeroUuidExposure(listHtml).compliant, true);

  // Search by English-only token in Multi View matches baseWithScope and filters out certSinAlcance
  const enSearchHtml = renderCertificadoView({
    profile: ADMIN_PROFILE,
    state: {
      ...buildCertDetailState('', 'alcance'),
      selectedCertId: null,
      query: 'cryogenic manifolds',
      viewMode: 'grid',
    },
    certificates: [baseWithScope, certSinAlcance],
  });
  assert.ok(enSearchHtml.includes('FN-33-MV-01'));
  assert.equal(enSearchHtml.includes('FN-33-MV-02'), false);
});

test('Step 3.3 Detail Form & Alcance Tab: removes legacy #certAlcanceInput and 1000-char cap, defaults to Alcance first tab, supports short & >5000-char scopes, language toggles, empty/shared/archive guards', () => {
  const longEs = 'Diseño, ingeniería, fabricación y despacho continuo. '.repeat(110); // > 5000 chars
  assert.ok(longEs.length > 5000);

  const ownerCertId = 'aa000000-0000-0000-0000-000000000010';
  const sharedTargetId = 'aa000000-0000-0000-0000-000000000011';
  const emptyCertId = 'aa000000-0000-0000-0000-000000000012';
  const groupId = INITIAL_CONGLOMERADOS[0].id;
  const orgA: OrganizacionEntity = {
    ...INITIAL_ORGANIZACIONES[0],
    id: 'bb000000-0000-0000-0000-000000000010',
    id_grupo_empresarial: groupId,
    nombre: 'Matriz Norte',
    abreviacion: 'MNORTE',
  };
  const orgB: OrganizacionEntity = {
    ...INITIAL_ORGANIZACIONES[0],
    id: 'bb000000-0000-0000-0000-000000000011',
    id_grupo_empresarial: groupId,
    nombre: 'Filial Sur',
    abreviacion: 'FSUR',
  };

  const ownerCert: CertificadoDetailEntity = {
    ...INITIAL_ALL_SEEDED_CERTIFICADOS_DETAILED[0],
    id: ownerCertId,
    numero_certificado: 'FN-33-OWN',
    id_organizacion: orgA.id,
    organizacion_nombre: orgA.nombre,
    organizacion_abreviacion: orgA.abreviacion,
    alcance: longEs,
    alcanceDetalle: {
      id: 'ab000000-0000-0000-0000-000000000010',
      id_certificado: ownerCertId,
      alcance_es: longEs,
      alcance_en: null,
      esCompartido: false,
      sharedTargetCerts: [
        {
          linkId: 'ac000000-0000-0000-0000-000000000010',
          certId: sharedTargetId,
          numero_certificado: 'FN-33-TGT',
        },
      ],
    },
  };

  const sharedCert: CertificadoDetailEntity = {
    ...INITIAL_ALL_SEEDED_CERTIFICADOS_DETAILED[0],
    id: sharedTargetId,
    numero_certificado: 'FN-33-TGT',
    id_organizacion: orgB.id,
    organizacion_nombre: orgB.nombre,
    organizacion_abreviacion: orgB.abreviacion,
    alcance: 'Alcance breve de cinco palabras.',
    alcanceDetalle: {
      id: 'ab000000-0000-0000-0000-000000000010',
      id_certificado: ownerCertId,
      alcance_es: 'Alcance breve de cinco palabras.',
      alcance_en: 'Short five word technical scope.',
      esCompartido: true,
      origenCertificadoNumero: 'FN-33-OWN',
      id_share_link: 'ac000000-0000-0000-0000-000000000010',
    },
  };

  const emptyCert: CertificadoDetailEntity = {
    ...INITIAL_ALL_SEEDED_CERTIFICADOS_DETAILED[0],
    id: emptyCertId,
    numero_certificado: 'FN-33-EMPTY',
    id_organizacion: orgB.id,
    organizacion_nombre: orgB.nombre,
    alcance: '',
    alcanceDetalle: null,
  };

  // 1. Create / Edit detail form has ZERO #certAlcanceInput and ZERO / 1000 cap
  const createHtml = renderCertificadoDetailPage({
    profile: ADMIN_PROFILE,
    state: {
      ...buildCertDetailState('', 'alcance'),
      selectedCertId: null,
      isCreating: true,
    },
    allCertificates: [ownerCert, sharedCert, emptyCert],
    organizaciones: [orgA, orgB],
    conglomerados: INITIAL_CONGLOMERADOS,
  });
  assert.equal(createHtml.includes('certAlcanceInput'), false);
  assert.equal(createHtml.includes('certAlcanceLiveCounter'), false);
  assert.equal(createHtml.includes('/ 1000'), false);

  // 2. Owner cert with >5000 char Alcance, missing EN fallback, shared target chips & disabled Archive button
  const ownerHtml = renderCertificadoDetailPage({
    cert: ownerCert,
    profile: ADMIN_PROFILE,
    state: {
      ...buildCertDetailState(ownerCert.id, 'alcance'),
      alcanceLangView: 'bilingual',
    },
    allCertificates: [ownerCert, sharedCert, emptyCert],
    organizaciones: [orgA, orgB],
    conglomerados: INITIAL_CONGLOMERADOS,
  });
  // First tab in nav is Alcance
  const firstTabMatch = ownerHtml.match(/data-cert-tab="([^"]+)"/i);
  assert.ok(firstTabMatch);
  assert.equal(firstTabMatch[1], 'alcance');
  assert.ok(ownerHtml.includes('Alcance Propio'));
  assert.ok(ownerHtml.includes('Compartido con:'));
  assert.ok(ownerHtml.includes('FN-33-TGT'));
  assert.ok(ownerHtml.includes('Traducción al inglés no registrada (opcional)'));
  assert.ok(ownerHtml.includes('Español'));
  assert.ok(ownerHtml.includes('Inglés'));
  assert.ok(ownerHtml.includes('Bilingüe (ES / EN)'));
  const archiveOwnBtn = ownerHtml.match(/<button[^>]*data-action="archive-own-alcance"[^>]*>/i);
  assert.ok(archiveOwnBtn);
  assert.ok(/\bdisabled\b/i.test(archiveOwnBtn[0]), 'Archivar Alcance must be disabled while shared');
  assert.equal(assertZeroUuidExposure(ownerHtml).compliant, true);

  // Language toggle 'en' renders English panel without Spanish text container
  const enOnlyHtml = renderCertificadoDetailPage({
    cert: sharedCert,
    profile: WORKER_PROFILE,
    state: {
      ...buildCertDetailState(sharedCert.id, 'alcance'),
      alcanceLangView: 'en',
    },
    allCertificates: [ownerCert, sharedCert],
    organizaciones: [orgA, orgB],
    conglomerados: INITIAL_CONGLOMERADOS,
  });
  assert.ok(enOnlyHtml.includes('Short five word technical scope.'));
  assert.equal(enOnlyHtml.includes('Alcance breve de cinco palabras.'), false);
  assert.ok(enOnlyHtml.includes('Compartido desde FN-33-OWN'));
  assert.ok(enOnlyHtml.includes('data-action="unlink-shared-alcance"'));
  assert.ok(enOnlyHtml.includes('Definir Alcance Propio'));

  // Editor form renders unlimited ES/EN counters without / 1000
  const editorHtml = renderCertificadoDetailPage({
    cert: ownerCert,
    profile: ADMIN_PROFILE,
    state: {
      ...buildCertDetailState(ownerCert.id, 'alcance'),
      isEditingAlcance: true,
      alcanceDraft: { alcance_es: longEs, alcance_en: '' },
    },
    allCertificates: [ownerCert],
    organizaciones: [orgA, orgB],
    conglomerados: INITIAL_CONGLOMERADOS,
  });
  assert.ok(editorHtml.includes('id="alcanceDetailForm"'));
  assert.ok(editorHtml.includes(`${longEs.length} caracteres`));
  assert.equal(editorHtml.includes('/ 1000'), false);

  // Empty state renders "+ Definir Alcance" for staff and hides it for AUDITOR
  const emptyStaffHtml = renderCertificadoDetailPage({
    cert: emptyCert,
    profile: ADMIN_PROFILE,
    state: buildCertDetailState(emptyCert.id, 'alcance'),
    allCertificates: [emptyCert],
  });
  assert.ok(emptyStaffHtml.includes('Certificado Sin Alcance Definido'));
  assert.ok(emptyStaffHtml.includes('data-action="open-alcance-editor"'));

  const emptyAuditorHtml = renderCertificadoDetailPage({
    cert: emptyCert,
    profile: AUDITOR_PROFILE,
    state: buildCertDetailState(emptyCert.id, 'alcance'),
    allCertificates: [emptyCert],
  });
  assert.equal(emptyAuditorHtml.includes('data-action="open-alcance-editor"'), false);
});

test('Step 3.3 Certificate Versioning & 4-Category Audit Migration Modal: #certVersionSelect, strict historical read-only guard, 2-step clone modal, pending decision guard & table invariants', () => {
  const certId = 'aa000000-0000-0000-0000-000000000020';
  const v1Id = 'ad000000-0000-0000-0000-000000000001';
  const v2Id = 'ad000000-0000-0000-0000-000000000002';

  const base = INITIAL_ALL_SEEDED_CERTIFICADOS_DETAILED[0];
  const v1Snap: CertificadoVersionSnapshot = {
    id: v1Id,
    id_certificado: certId,
    id_organizacion_version: 'ae000000-0000-0000-0000-000000000001',
    version_numero: 1,
    es_version_actual: false,
    notas_version: 'Versión inicial v1',
    id_estatus: base.id_estatus,
    estatus: 'Activo',
    id_sector_iaf: base.id_sector_iaf,
    sector_iaf: base.sector_iaf,
    sector_iaf_descripcion: base.sector_iaf_descripcion,
    id_subsector_iaf: base.id_subsector_iaf,
    multisitio: false,
    sitios: base.sitios.slice(0, 1),
    procesos: base.procesos,
    turnos: base.turnos,
    noAplicables: [],
    contactos: base.contactos,
    fechas: [
      {
        id: 'af000000-0000-0000-0000-000000000001',
        id_certificado: certId,
        id_certificado_version: v1Id,
        tipo_fecha: 'Emisión',
        fecha: '2025-01-10',
      },
    ],
  };
  const v2Snap: CertificadoVersionSnapshot = {
    ...v1Snap,
    id: v2Id,
    version_numero: 2,
    es_version_actual: true,
    notas_version: 'Ampliación v2',
    fechas: [],
  };

  const versionedCert: CertificadoDetailEntity = {
    ...base,
    id: certId,
    numero_certificado: 'FN-33-VER',
    id_certificado_version: v2Id,
    version_actual_numero: 2,
    versiones: [v1Snap, v2Snap],
  };

  // 1. Historical version selected enforces strict read-only banner and disables Editar + Crear Nueva Versión
  const historicalHtml = renderCertificadoDetailPage({
    cert: versionedCert,
    profile: ADMIN_PROFILE,
    state: {
      ...buildCertDetailState(certId, 'alcance'),
      selectedVersionId: v1Id,
    },
    allCertificates: [versionedCert],
  });
  assert.ok(historicalHtml.includes('id="certVersionSelect"'));
  assert.ok(historicalHtml.includes('v2 · Actual'));
  assert.ok(historicalHtml.includes('v1 · Histórica'));
  assert.ok(historicalHtml.includes('Visualizando versión histórica v1 (solo lectura)'));
  const editBtnHist = historicalHtml.match(/<button[^>]*id="startEditCertBtn"[^>]*>/i);
  const cloneBtnHist = historicalHtml.match(/<button[^>]*id="openCreateCertVersionBtn"[^>]*>/i);
  assert.ok(editBtnHist && /\bdisabled\b/i.test(editBtnHist[0]));
  assert.ok(cloneBtnHist && /\bdisabled\b/i.test(cloneBtnHist[0]));
  assert.equal(historicalHtml.includes('data-action="open-alcance-editor"'), false);

  // 2. Active version opens 2-step clone modal with 0 fechas notice
  const cloneModalHtml = renderCertificadoDetailPage({
    cert: versionedCert,
    profile: ADMIN_PROFILE,
    state: {
      ...buildCertDetailState(certId, 'alcance'),
      selectedVersionId: v2Id,
      isCreatingVersion: true,
    },
    allCertificates: [versionedCert],
  });
  assert.ok(cloneModalHtml.includes('id="createCertVersionModalBackdrop"'));
  assert.ok(cloneModalHtml.includes('Crear Nueva Versión · FN-33-VER (v2 → v3)'));
  assert.ok(cloneModalHtml.includes('0 fechas registradas'));
  assert.ok(cloneModalHtml.includes('id="certVersionNotesInput"'));
  assert.ok(cloneModalHtml.includes('data-action="confirm-create-cert-version"'));
  assert.equal(assertZeroUuidExposure(cloneModalHtml).compliant, true);

  // 3. 4-Category Audit Resolution Modal blocks confirm while Cat 2/3 remain PENDIENTE_DECISION and allows confirm once resolved
  const candidates: AuditVersionClassificationInput[] = [
    {
      id: 'b1000000-0000-0000-0000-000000000001',
      id_certificado_version: v2Id,
      codigo_auditoria: 'AUD-HIST-01',
      tipo_auditoria: 'Inicial',
      estado_ciclo: 'Cerrada',
      revisado: true,
      fecha_programacion: '2025-06-01',
    },
    {
      id: 'b1000000-0000-0000-0000-000000000002',
      id_certificado_version: v2Id,
      codigo_auditoria: 'AUD-POST-02',
      tipo_auditoria: 'Vigilancia 1',
      estado_ciclo: 'Auditada',
      revisado: false,
      auditoria_fecha: [
        {
          id: 'b2000000-0000-0000-0000-000000000001',
          etiqueta: 'REAL',
          fecha_inicio: '2026-06-01',
          fecha_fin: '2026-06-02',
          numero_secuencia: 1,
        },
      ],
    },
    {
      id: 'b1000000-0000-0000-0000-000000000003',
      id_certificado_version: v2Id,
      codigo_auditoria: 'AUD-PRE-03',
      tipo_auditoria: 'Vigilancia 2',
      estado_ciclo: 'Programada',
      fecha_programacion: '2026-06-25',
    },
    {
      id: 'b1000000-0000-0000-0000-000000000004',
      id_certificado_version: v2Id,
      codigo_auditoria: 'AUD-FUT-04',
      tipo_auditoria: 'Recertificación',
      estado_ciclo: 'Programada',
      fecha_programacion: '2026-11-10',
    },
  ];
  const defaultItems = buildDefaultAuditVersionResolutions(candidates, v2Id, '2026-06-15');
  assert.equal(validateAuditVersionResolutions(defaultItems).pendingDecisionCount, 2);

  const blockedModalHtml = renderCertAuditResolutionModal(
    {
      isOpen: true,
      certId,
      sourceVersionId: v2Id,
      targetVersionId: 'ad000000-0000-0000-0000-000000000003',
      targetVersionNumero: 3,
      sitioMap: {},
      procesoMap: {},
      items: defaultItems,
      submitting: false,
      errorMessage: null,
    },
    'FN-33-VER'
  );
  assert.ok(blockedModalHtml.includes('Queda(n) 2 auditoría(s)'));
  const confirmBlockedBtn = blockedModalHtml.match(/<button[^>]*id="confirmCertAuditResolutionBtn"[^>]*>/i);
  assert.ok(confirmBlockedBtn && /\bdisabled\b/i.test(confirmBlockedBtn[0]));
  assertTableStructuralInvariants(blockedModalHtml, 'certAuditResolutionTable');
  assert.equal(assertZeroUuidExposure(blockedModalHtml).compliant, true);

  const resolvedItems = defaultItems.map((it) =>
    it.action === 'PENDIENTE_DECISION'
      ? { ...it, action: 'MIGRAR_NUEVA' as const }
      : it
  );
  const readyModalHtml = renderCertAuditResolutionModal(
    {
      isOpen: true,
      certId,
      sourceVersionId: v2Id,
      targetVersionId: 'ad000000-0000-0000-0000-000000000003',
      targetVersionNumero: 3,
      sitioMap: {},
      procesoMap: {},
      items: resolvedItems,
      submitting: false,
      errorMessage: null,
    },
    'FN-33-VER'
  );
  const confirmReadyBtn = readyModalHtml.match(/<button[^>]*id="confirmCertAuditResolutionBtn"[^>]*>/i);
  assert.ok(confirmReadyBtn);
  const confirmReadyOpenTagWithoutClass = confirmReadyBtn[0].replace(/\bclass="[^"]*"/i, '');
  assert.equal(/\bdisabled\b/i.test(confirmReadyOpenTagWithoutClass), false);
  assert.equal(assertZeroUuidExposure(readyModalHtml).compliant, true);
});

