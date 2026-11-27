import test from 'node:test';
import assert from 'node:assert/strict';
import type { UserProfile } from './healthCheck';
import { assertZeroUuidExposure } from './zeroUuid';
import { INITIAL_ORGANIZACIONES, type CertificadoSummary } from './activeCertificates';
import { INITIAL_CERTIFICADOS_DETAILED, createEmptyCertificadoFormDraft } from './multisiteSampling';
import { INITIAL_AUDITORES_DETAILED } from './competencyMatrix';
import { INITIAL_PROGRAMACION_AUDITS, INITIAL_PHASE5_FINDINGS } from './auditExecution';
import {
  INITIAL_ESTATUS_CATALOG,
  INITIAL_NORMAS,
  INITIAL_ORGANISMOS,
  INITIAL_SECTORES_IAF,
  INITIAL_SUBSECTORES_IAF,
} from './extraDomain';
import { buildInitialAcreditacionEntities } from './acreditacionDomain';
import { canArchiveSitio, resolveSitioDetailById } from './sitioDomain';
import { getScopedNormaRequirements, resolveProcesoDetailById } from './procesoDomain';
import { computeShiftDurationLabel, isOvernightShift, resolveTurnoDetailById } from './turnoDomain';
import { renderAcreditacionView } from '../views/acreditacionView';
import { renderSitioView } from '../views/sitioView';
import { renderProcesoView } from '../views/procesoView';
import { renderTurnoView } from '../views/turnoView';
import { renderOrganizacionView } from '../views/organizacionView';
import { renderCertificadoView } from '../views/certificadoView';
import { renderAuditorView } from '../views/auditorView';
import {
  DEFAULT_DESIGNACION_TEMPORAL_STATE,
  renderDesignacionTemporalView,
} from '../views/designacionTemporalView';
import { DEFAULT_TIEMPO_STATE, renderTiempoView } from '../views/tiempoView';
import type { ProgramaAuditoriaEntity } from './auditPlanningEngine';
import type { AuditoriaSitioTemporalEntity } from './designacionTemporalDomain';

const ADMIN_PROFILE: UserProfile = {
  id: '11111111-1111-1111-1111-111111111111',
  nombre: 'Administrador Principal',
  role: 'ADMIN',
  status: 'APPROVED',
};

const FORBIDDEN_LEGACY_MARKERS = [
  'ZONA 1:',
  'ZONA 2:',
  'ZONA 3:',
  'ZONA 4:',
  'data-drilldown-select-org',
];

function assertThreeZoneCompliance(html: string, label: string, expectParentZone: boolean): void {
  for (const marker of FORBIDDEN_LEGACY_MARKERS) {
    assert.equal(html.includes(marker), false, `${label} must not contain legacy marker "${marker}"`);
  }
  assert.ok(html.includes('aria-label="Detalle del registro"'), `${label} missing Record Zone`);
  assert.ok(html.includes('role="tablist"'), `${label} missing Children Zone tablist`);
  assert.ok(html.includes('data-nav-back="true"'), `${label} missing Back action`);
  assert.ok(html.includes('data-action="open-changelog"'), `${label} missing Changelog trigger`);

  if (expectParentZone) {
    assert.ok(html.includes('aria-label="Contexto y relaciones superiores"'), `${label} missing Parent Zone`);
    assert.ok(html.includes('<hr class="border-t border-slate-200 my-2.5 sm:my-3" />'), `${label} missing Parent/Record divider`);
    assert.ok(
      html.indexOf('aria-label="Contexto y relaciones superiores"') <
        html.indexOf('<hr class="border-t border-slate-200 my-2.5 sm:my-3" />') &&
        html.indexOf('<hr class="border-t border-slate-200 my-2.5 sm:my-3" />') <
          html.indexOf('aria-label="Detalle del registro"') &&
        html.indexOf('aria-label="Detalle del registro"') < html.indexOf('role="tablist"'),
      `${label} 3-Zone ordering violated`
    );
  }

  const zero = assertZeroUuidExposure(html);
  assert.equal(zero.compliant, true, `${label} exposed raw UUIDs: ${zero.exposedUuids.join(', ')}`);
}

test('Fase 5.2 Detail Views: Acreditación renders 3 zones with Organismo/Norma/Sector parent chips and covered certs', () => {
  const acreditaciones = buildInitialAcreditacionEntities(INITIAL_CERTIFICADOS_DETAILED);
  const target = acreditaciones[0];

  const html = renderAcreditacionView({
    profile: ADMIN_PROFILE,
    state: {
      selectedAccreditationId: target.id,
      activeChildTab: 'certificados',
      query: '',
      viewMode: 'grid',
      sortColumn: null,
      sortDirection: 'none',
    },
    acreditaciones,
    organismos: INITIAL_ORGANISMOS,
    normas: INITIAL_NORMAS,
    sectores: INITIAL_SECTORES_IAF,
    certificates: INITIAL_CERTIFICADOS_DETAILED,
    subsectores: INITIAL_SUBSECTORES_IAF,
  });

  assertThreeZoneCompliance(html, 'Acreditación Detail', true);
  assert.ok(html.includes(target.numero_acreditacion));
  assert.ok(html.includes(target.organismo_codigo));
  assert.ok(html.includes('Certificados Amparados'));
  assert.ok(html.includes('Sub-Sectores IAF del Alcance'));
  assert.ok(html.includes('data-parent-nav="true"'));
});

test('Fase 5.2 Detail Views: Sitio highlights Sede 0 HQ and protects against archiving while branches exist', () => {
  const certMultisite = INITIAL_CERTIFICADOS_DETAILED.find(
    (c) => c.sitios.some((s) => s.numero_sitio === 0) && c.sitios.some((s) => s.numero_sitio > 0)
  )!;
  const sitio0 = resolveSitioDetailById({
    sitioId: certMultisite.sitios.find((s) => s.numero_sitio === 0)!.id,
    certificates: INITIAL_CERTIFICADOS_DETAILED,
    programacionAudits: INITIAL_PROGRAMACION_AUDITS,
  })!;

  const siblingSites = certMultisite.sitios.map((s) => ({
    id: s.id,
    id_certificado: certMultisite.id,
    numero_sitio: s.numero_sitio,
  }));

  const guard0 = canArchiveSitio({
    site: sitio0,
    siblingSites,
    associatedAuditsCount: sitio0.auditorias.length,
  });
  assert.equal(guard0.allowed, false);

  const sitio0Html = renderSitioView({
    profile: ADMIN_PROFILE,
    state: {
      selectedSitioId: sitio0.id,
      activeChildTab: 'turnos',
      isEditingAttributes: false,
    },
    sitio: sitio0,
    siblingSites,
  });

  assertThreeZoneCompliance(sitio0Html, 'Sitio 0 Detail', true);
  assert.ok(sitio0Html.includes('Sede Principal (Sitio 0)'));
  assert.ok(sitio0Html.includes('Sitio 0'));
  assert.ok(sitio0Html.includes('Turnos Operativos Asignados'));
  assert.ok(sitio0Html.includes('Auditorías en este Sitio'));

  // Verify secondary site resolves cleanly without Sede 0 HQ badge
  const sitioBranch = resolveSitioDetailById({
    sitioId: certMultisite.sitios.find((s) => s.numero_sitio > 0)!.id,
    certificates: INITIAL_CERTIFICADOS_DETAILED,
    programacionAudits: INITIAL_PROGRAMACION_AUDITS,
  })!;
  const branchHtml = renderSitioView({
    profile: ADMIN_PROFILE,
    state: {
      selectedSitioId: sitioBranch.id,
      activeChildTab: 'auditorias',
      isEditingAttributes: false,
    },
    sitio: sitioBranch,
    siblingSites,
  });
  assertThreeZoneCompliance(branchHtml, 'Sitio Secundario Detail', true);
  assert.equal(branchHtml.includes('Sede Principal (Sitio 0)'), false);
});

test('Fase 5.2 Detail Views: Proceso maps scoped LTREE clauses, findings, and audits in 3 zones', () => {
  const cert = INITIAL_CERTIFICADOS_DETAILED[0];
  const proc = resolveProcesoDetailById({
    procesoId: cert.procesos[0].id,
    certificates: INITIAL_CERTIFICADOS_DETAILED,
    programacionAudits: INITIAL_PROGRAMACION_AUDITS,
    phase5Findings: INITIAL_PHASE5_FINDINGS,
  })!;

  const scopedClauses = getScopedNormaRequirements({
    id_norma: proc.id_norma,
    norma_codigo: proc.norma_codigo,
  });
  assert.ok(scopedClauses.length >= 1);
  assert.ok(scopedClauses.every((c) => c.norma_codigo === proc.norma_codigo));
  assert.ok(proc.requisitos.length >= 1);

  const html = renderProcesoView({
    profile: ADMIN_PROFILE,
    state: {
      selectedProcesoId: proc.id,
      activeChildTab: 'requisitos',
      isEditingAttributes: false,
    },
    proceso: proc,
  });

  assertThreeZoneCompliance(html, 'Proceso Detail', true);
  assert.ok(html.includes(proc.nombre_proceso));
  assert.ok(html.includes('Cobertura LTREE'));
  assert.ok(html.includes('Requisitos Normativos Vinculados'));
  assert.ok(html.includes('Hallazgos Asociados'));
  assert.ok(html.includes('Auditorías Programadas'));
  assert.ok(html.includes(proc.requisitos[0].codigo));
});

test('Fase 5.2 Detail Views: Turno computes overnight shift duration accurately and omits Parent Zone when standalone', () => {
  assert.equal(isOvernightShift('22:00:00', '06:00:00'), true);
  assert.equal(computeShiftDurationLabel('22:00:00', '06:00:00'), '8h 00m (nocturno)');
  assert.equal(isOvernightShift('07:00:00', '15:00:00'), false);
  assert.equal(computeShiftDurationLabel('07:00:00', '15:00:00'), '8h 00m');

  const overnightShift = resolveTurnoDetailById({
    turnoId: 'night-shift-1',
    originatingSitioId: INITIAL_CERTIFICADOS_DETAILED[0].sitios[0].id,
    certificates: INITIAL_CERTIFICADOS_DETAILED,
    programacionAudits: INITIAL_PROGRAMACION_AUDITS,
    shiftCatalog: [
      {
        id: 'night-shift-1',
        hora_entrada: '22:00:00',
        hora_salida: '06:00:00',
        descripcion: 'Turno Nocturno Continuo',
      },
    ],
  })!;

  assert.equal(overnightShift.isOvernight, true);
  assert.equal(overnightShift.durationLabel, '8h 00m (nocturno)');

  const withOriginHtml = renderTurnoView({
    profile: ADMIN_PROFILE,
    state: {
      selectedTurnoId: overnightShift.id,
      originatingSitioId: INITIAL_CERTIFICADOS_DETAILED[0].sitios[0].id,
      activeChildTab: 'sitios',
      isEditingAttributes: false,
    },
    turno: overnightShift,
  });
  assertThreeZoneCompliance(withOriginHtml, 'Turno Detail (with parent Sitio)', true);
  assert.ok(withOriginHtml.includes('8h 00m (nocturno)'));
  assert.ok(withOriginHtml.includes('Nocturno'));

  // Standalone entry (no originatingSitioId) renders cleanly without Parent Zone
  const standaloneTurno = resolveTurnoDetailById({
    turnoId: INITIAL_CERTIFICADOS_DETAILED[0].turnos[0].id,
    originatingSitioId: null,
    certificates: INITIAL_CERTIFICADOS_DETAILED,
    programacionAudits: INITIAL_PROGRAMACION_AUDITS,
  })!;
  const standaloneHtml = renderTurnoView({
    profile: ADMIN_PROFILE,
    state: {
      selectedTurnoId: standaloneTurno.id,
      originatingSitioId: null,
      activeChildTab: 'sitios',
      isEditingAttributes: false,
    },
    turno: standaloneTurno,
  });
  assertThreeZoneCompliance(standaloneHtml, 'Turno Detail (standalone)', false);
  assert.equal(standaloneHtml.includes('aria-label="Contexto y relaciones superiores"'), false);
});

test('Fase 5.2 Detail Views: Organización, Certificado, and Auditor adhere to 3-Zone layout and Zero-UUID compliance', () => {
  const certSummaries: CertificadoSummary[] = INITIAL_CERTIFICADOS_DETAILED.map((c) => ({
    id: c.id,
    numero_certificado: c.numero_certificado,
    id_organizacion: c.id_organizacion,
    organizacion_id: c.id_organizacion,
    organizacion_nombre: c.organizacion_nombre,
    norma: c.norma_codigo,
    esquema: c.esquema,
    estatus: c.estatus,
    sector_iaf: c.sector_iaf,
    multisitio: c.multisitio,
    sitios_count: c.sitios.length,
    fecha_emision: c.fecha_emision,
    fecha_vencimiento: c.fecha_vencimiento,
    cobertura_porcentaje: 100,
  }));

  const orgHtml = renderOrganizacionView({
    profile: ADMIN_PROFILE,
    state: {
      selectedOrganizacionId: INITIAL_ORGANIZACIONES[0].id,
      query: '',
      hasActiveCertificates: 'ALL',
      selectedSectorIaf: 'ALL',
      viewMode: 'grid',
      sortColumn: null,
      sortDirection: 'none',
      isEditingAttributes: false,
      activeChildTab: 'certificados',
    },
    organizaciones: INITIAL_ORGANIZACIONES,
    certificados: certSummaries,
    auditorias: INITIAL_PROGRAMACION_AUDITS,
  });
  assertThreeZoneCompliance(orgHtml, 'Organización Detail', true);
  assert.equal(orgHtml.includes('aria-label="Contexto y relaciones superiores"'), true);
  assert.ok(orgHtml.includes(INITIAL_ORGANIZACIONES[0].nombre));

  const targetCert = INITIAL_CERTIFICADOS_DETAILED[0];
  const certHtml = renderCertificadoView({
    profile: ADMIN_PROFILE,
    state: {
      selectedCertId: targetCert.id,
      activeChildTab: 'sitios',
      query: '',
      selectedStandard: 'ALL',
      selectedStatus: 'ALL',
      selectedSectorIaf: 'ALL',
      viewMode: 'grid',
      sortColumn: null,
      sortDirection: 'none',
      isEditingAttributes: false,
    },
    certificates: INITIAL_CERTIFICADOS_DETAILED,
    organizaciones: INITIAL_ORGANIZACIONES,
    normas: INITIAL_NORMAS,
    estatusList: INITIAL_ESTATUS_CATALOG,
    sectores: INITIAL_SECTORES_IAF,
    subsectores: INITIAL_SUBSECTORES_IAF,
  });
  assertThreeZoneCompliance(certHtml, 'Certificado Detail', true);
  assert.ok(certHtml.includes('lg:grid-cols-3 xl:grid-cols-5'));
  const certParentZone = certHtml.match(
    /<section aria-label="Contexto y relaciones superiores"[\s\S]*?<\/section>/
  );
  assert.ok(certParentZone);
  assert.equal((certParentZone[0].match(/data-parent-nav="true"/g) || []).length, 6);
  assert.equal((certParentZone[0].match(/<select[^>]*disabled/g) || []).length, 5);
  assert.equal((certParentZone[0].match(/aria-hidden="true">\*<\/span>/g) || []).length, 5);
  for (const label of ['Organización', 'Norma', 'Estatus', 'Sector IAF', 'Sub-Sector IAF', 'Conglomerado']) {
    assert.ok(certParentZone[0].includes(label), `Missing Certificado parent chip: ${label}`);
  }
  const certRecordZone = certHtml.match(
    /<section aria-label="Detalle del registro"[\s\S]*?<\/section>/
  );
  assert.ok(certRecordZone);
  assert.ok(certRecordZone[0].includes('Número de Certificado'));
  assert.ok(certRecordZone[0].includes('Esquema Multisitio'));
  assert.ok(certHtml.includes('Versión Actual · v'));
  assert.equal((certRecordZone[0].match(/aria-hidden="true">\*<\/span>/g) || []).length, 1);
  assert.ok(/<input[^>]*id="certNumeroInput"[^>]*disabled/.test(certRecordZone[0]));
  assert.ok(/<input[^>]*id="certMultisitioCheckbox"[^>]*disabled/.test(certRecordZone[0]));
  assert.equal(certRecordZone[0].includes('id="certAlcanceInput"'), false);
  assert.equal(certRecordZone[0].includes('id="saveCertFormBtn"'), false);
  assert.equal(certRecordZone[0].includes('id="cancelCertFormBtn"'), false);
  assert.equal(certRecordZone[0].includes('Fecha de Emisión'), false);
  assert.equal(certRecordZone[0].includes('Fecha de Vencimiento'), false);
  assert.equal(certRecordZone[0].includes('Organismo Acreditador'), false);
  assert.equal(certRecordZone[0].includes('Sub-Sector IAF'), false);
  const certTabList = certHtml.match(/<div[^>]*role="tablist"[^>]*>[\s\S]*?<\/div>/);
  assert.ok(certTabList);
  assert.equal((certTabList[0].match(/role="tab"/g) || []).length, 8);
  const expectedLabels = ['Alcance', 'Sitio', 'No Aplicable', 'Proceso', 'Turno', 'Auditoría', 'Fecha', 'Contacto'];
  let prevIdx = -1;
  for (const tabLabel of expectedLabels) {
    const idx = certTabList[0].indexOf(`>${tabLabel}<`);
    assert.ok(idx > prevIdx, `Certificado child tab "${tabLabel}" missing or out of order`);
    prevIdx = idx;
  }
  assert.equal(certTabList[0].includes('>No Aplicables<'), false);
  assert.ok(certHtml.includes('Sede #0'));
  assert.ok(certHtml.includes('Sede Central / Principal'));
  assert.equal(certHtml.includes('/ 1000 caracteres'), false);

  const certEditHtml = renderCertificadoView({
    profile: ADMIN_PROFILE,
    state: {
      selectedCertId: targetCert.id,
      activeChildTab: 'sitios',
      query: '',
      selectedStandard: 'ALL',
      selectedStatus: 'ALL',
      selectedSectorIaf: 'ALL',
      viewMode: 'grid',
      sortColumn: null,
      sortDirection: 'none',
      isEditingAttributes: true,
    },
    certificates: INITIAL_CERTIFICADOS_DETAILED,
    organizaciones: INITIAL_ORGANIZACIONES,
    normas: INITIAL_NORMAS,
    estatusList: INITIAL_ESTATUS_CATALOG,
    sectores: INITIAL_SECTORES_IAF,
    subsectores: INITIAL_SUBSECTORES_IAF,
  });
  assert.ok(certEditHtml.includes('aria-label="Contexto y relaciones superiores"'));
  assert.ok(certEditHtml.includes('aria-label="Detalle del registro"'));
  assert.ok(certEditHtml.includes('role="tablist"'));
  assert.ok(certEditHtml.includes('id="cancelEditCertBtn"'));
  assert.ok(certEditHtml.includes('id="saveCertFormBtn"'));
  assert.equal(certEditHtml.includes('data-action="open-changelog"'), false);
  assert.equal(certEditHtml.includes('data-action="open-archive-modal"'), false);
  assert.equal(assertZeroUuidExposure(certEditHtml).compliant, true);
  for (const selectId of [
    'certParentOrganizacionSelect',
    'certParentNormaSelect',
    'certParentEstatusSelect',
    'certParentSectorIafSelect',
    'certParentSubsectorIafSelect',
  ]) {
    const sel = certEditHtml.match(new RegExp(`<select[^>]*id="${selectId}"[^>]*>`));
    assert.ok(sel && !sel[0].includes('disabled'), `#${selectId} must be enabled in edit mode`);
  }
  const editSubsectorHtml = certEditHtml.match(/<select[^>]*id="certParentSubsectorIafSelect"[^>]*>[\s\S]*?<\/select>/);
  assert.ok(editSubsectorHtml);
  assert.ok(editSubsectorHtml[0].includes('17.1 ·'));
  assert.equal(editSubsectorHtml[0].includes('33.1 ·'), false);

  const certAddHtml = renderCertificadoView({
    profile: ADMIN_PROFILE,
    state: {
      selectedCertId: null,
      activeChildTab: 'sitios',
      query: '',
      selectedStandard: 'ALL',
      selectedStatus: 'ALL',
      selectedSectorIaf: 'ALL',
      viewMode: 'grid',
      sortColumn: null,
      sortDirection: 'none',
      isEditingAttributes: false,
      isCreating: true,
      formDraft: createEmptyCertificadoFormDraft(),
    },
    certificates: INITIAL_CERTIFICADOS_DETAILED,
    organizaciones: INITIAL_ORGANIZACIONES,
    normas: INITIAL_NORMAS,
    estatusList: INITIAL_ESTATUS_CATALOG,
    sectores: INITIAL_SECTORES_IAF,
    subsectores: INITIAL_SUBSECTORES_IAF,
  });
  assert.equal(assertZeroUuidExposure(certAddHtml).compliant, true);

  const auditorHtml = renderAuditorView({
    profile: ADMIN_PROFILE,
    state: {
      selectedAuditorId: INITIAL_AUDITORES_DETAILED[0].id,
      activeChildTab: 'competencias',
      query: '',
      selectedCalificacion: 'ALL',
      selectedStandard: 'ALL',
      selectedSectorIaf: 'ALL',
      viewMode: 'grid',
      sortColumn: null,
      sortDirection: 'none',
      isEditingAttributes: false,
    },
    auditors: INITIAL_AUDITORES_DETAILED,
    normas: INITIAL_NORMAS,
    sectores: INITIAL_SECTORES_IAF,
    subsectores: INITIAL_SUBSECTORES_IAF,
  });
  assertThreeZoneCompliance(auditorHtml, 'Auditor Detail', false);
  assert.ok(auditorHtml.includes(INITIAL_AUDITORES_DETAILED[0].codigo_credencial));
});

test('Step Final Primitives: renderDetailFormTopActions orders Save before Cancel and renderDetailBooleanField omits asterisk', async () => {
  const { renderDetailFormTopActions, renderDetailBooleanField } = await import('../views/detailTemplate');

  const topActionsHtml = renderDetailFormTopActions({
    mode: 'edit',
    isStaff: true,
    formId: 'auditSampleForm',
    saveBtnId: 'saveSampleBtn',
    cancelBtnId: 'cancelSampleBtn',
    editBtnId: 'editSampleBtn',
  });
  assert.ok(topActionsHtml.includes('bg-emerald-600'));
  assert.ok(topActionsHtml.includes('bg-rose-50'));
  assert.ok(
    topActionsHtml.indexOf('id="saveSampleBtn"') < topActionsHtml.indexOf('id="cancelSampleBtn"'),
    'Save button (emerald) must precede Cancel button (rose) in top header'
  );

  const readCheckedBool = renderDetailBooleanField({
    mode: 'read',
    inputId: 'boolReadOn',
    name: 'activo',
    label: 'Registro Activo',
    checked: true,
    formId: 'auditSampleForm',
  });
  assert.equal(readCheckedBool.includes('aria-hidden="true">*</span>'), false);
  assert.ok(readCheckedBool.includes('bg-emerald-50'));
  assert.ok(readCheckedBool.includes('✓'));

  const editUncheckedBool = renderDetailBooleanField({
    mode: 'edit',
    inputId: 'boolEditOff',
    name: 'activo',
    label: 'Registro Activo',
    checked: false,
    formId: 'auditSampleForm',
  });
  assert.equal(editUncheckedBool.includes('aria-hidden="true">*</span>'), false);
  assert.ok(editUncheckedBool.includes('type="checkbox"'));
  assert.equal(editUncheckedBool.includes('disabled'), false);
});

test('Step 4.2 Less Is More Detail Views: 1.5 Temporal & 2. Tiempo inherit unified Zone 1-2 shell, omit Zone 3 noise, and enforce RBAC', () => {
  const workerProfile: UserProfile = {
    id: '22222222-2222-2222-2222-222222222222',
    nombre: 'Coordinador Técnico',
    role: 'WORKER',
    status: 'APPROVED',
  };
  const auditorProfile: UserProfile = {
    id: '33333333-3333-3333-3333-333333333333',
    nombre: 'Auditor ISO',
    role: 'AUDITOR',
    status: 'APPROVED',
  };
  const clientProfile: UserProfile = {
    id: '44444444-4444-4444-4444-444444444444',
    nombre: 'Cliente Organización',
    role: 'CLIENT',
    status: 'APPROVED',
  };

  const certA = INITIAL_CERTIFICADOS_DETAILED[0];
  const certB = INITIAL_CERTIFICADOS_DETAILED[1];
  const progId = '70000000-0000-0000-0000-000000000420';
  const auditAId = '80000000-0000-0000-0000-000000000421';
  const auditBId = '80000000-0000-0000-0000-000000000422';
  const tempId = '9a000000-0000-0000-0000-000000000421';

  const baseAuditA = {
    ...INITIAL_PROGRAMACION_AUDITS[0],
    id: auditAId,
    id_programa_auditoria: progId,
    id_certificado: certA.id,
    numero_certificado: certA.numero_certificado,
    id_organizacion: certA.id_organizacion,
    organizacion_nombre: certA.organizacion_nombre,
    norma_codigo: certA.norma_codigo,
    codigo_auditoria: 'AUD-2026-421',
    tiene_sitio_temporal: true,
    fechas: [
      {
        id: '81000000-0000-0000-0000-000000000421',
        id_auditoria: auditAId,
        numero_secuencia: 1,
        tag: 'Programación',
        tipo_fecha: 'PROGRAMADA_EXACTA' as const,
        anio: null,
        mes: null,
        fecha_inicio: '2026-07-10',
        fecha_fin: '2026-07-12',
        observacion: null,
        deleted_at: null,
      },
    ],
    sitiosPlan: [
      {
        id: '82000000-0000-0000-0000-000000000421',
        id_auditoria: auditAId,
        id_sitio: certA.sitios[0].id,
        numero_sitio: 0,
        nombre_sitio: certA.sitios[0].nombre_sitio,
        tiempo_auditoria: 2.5,
        modalidad_evaluacion: 'Presencial' as const,
        procesos: [],
        equipoSitio: [],
        deleted_at: null,
      },
    ],
  };

  const baseAuditB = {
    ...INITIAL_PROGRAMACION_AUDITS[0],
    id: auditBId,
    id_programa_auditoria: progId,
    id_certificado: certB.id,
    numero_certificado: certB.numero_certificado,
    id_organizacion: certB.id_organizacion,
    organizacion_nombre: certB.organizacion_nombre,
    norma_codigo: certB.norma_codigo,
    codigo_auditoria: 'AUD-2026-422',
    tiene_sitio_temporal: true,
    fechas: [
      {
        id: '81000000-0000-0000-0000-000000000422',
        id_auditoria: auditBId,
        numero_secuencia: 1,
        tag: 'Programación',
        tipo_fecha: 'PROGRAMADA_EXACTA' as const,
        anio: null,
        mes: null,
        fecha_inicio: '2026-07-10',
        fecha_fin: '2026-07-12',
        observacion: null,
        deleted_at: null,
      },
    ],
    sitiosPlan: [
      {
        id: '82000000-0000-0000-0000-000000000422',
        id_auditoria: auditBId,
        id_sitio: certB.sitios[0].id,
        numero_sitio: 0,
        nombre_sitio: certB.sitios[0].nombre_sitio,
        tiempo_auditoria: 1.5,
        modalidad_evaluacion: 'Remota' as const,
        procesos: [],
        equipoSitio: [],
        deleted_at: null,
      },
    ],
  };

  const linkedProgram: ProgramaAuditoriaEntity = {
    id: progId,
    id_grupo_empresarial: '20000000-0000-0000-0000-000000000001',
    codigo_programa: 'PROG-420',
    etiqueta: 'Campaña Integrada 4.2',
    nivel_vinculacion: 'NIVEL_1_INTRA_ORG',
    tipo_vinculacion: 'Integrada',
    es_vinculada: true,
    tiene_sitio_temporal: true,
    id_ciclo_origen: null,
    notas: null,
    deleted_at: null,
    auditorias: [baseAuditA, baseAuditB],
  };

  const temporalEntity: AuditoriaSitioTemporalEntity = {
    id: tempId,
    id_auditoria: auditAId,
    etiqueta: 'Proyecto Ampliación 4.2',
    comentario: 'Ubicación: Valencia Nave 2',
    tiempo_auditoria: 1.25,
    certificados: [
      {
        id: '9b000000-0000-0000-0000-000000000421',
        id_sitio_temporal: tempId,
        id_auditoria_certificado: auditAId,
        numero_certificado: certA.numero_certificado,
        organizacion_nombre: certA.organizacion_nombre,
        norma_codigo: certA.norma_codigo,
      },
      {
        id: '9b000000-0000-0000-0000-000000000422',
        id_sitio_temporal: tempId,
        id_auditoria_certificado: auditBId,
        numero_certificado: certB.numero_certificado,
        organizacion_nombre: certB.organizacion_nombre,
        norma_codigo: certB.norma_codigo,
      },
    ],
    equipoTemporal: [],
    deleted_at: null,
  };

  // 1.5 Temporal (Staff)
  const temporalHtml = renderDesignacionTemporalView({
    profile: workerProfile,
    state: {
      ...DEFAULT_DESIGNACION_TEMPORAL_STATE,
      selectedCertId: certA.id,
      selectedAuditId: auditAId,
    },
    programs: [linkedProgram],
    audits: [baseAuditA, baseAuditB],
    temporalSites: [temporalEntity],
    vinculos: [],
    conglomerados: [],
    organizaciones: INITIAL_ORGANIZACIONES,
    certificados: INITIAL_CERTIFICADOS_DETAILED,
    referenceIsoDate: '2026-06-01',
  });
  assert.equal(assertZeroUuidExposure(temporalHtml).compliant, true);
  assert.ok(temporalHtml.includes('data-testid="audit-zone-1-data"'));
  assert.ok(temporalHtml.includes('data-testid="audit-zone-2-selectors"'));
  assert.ok(temporalHtml.includes('data-action="select-linked-sibling-select"'));
  assert.ok(temporalHtml.includes('data-testid="temporal-shared-batch-badge"'));
  assert.ok(temporalHtml.includes('Aplica al lote completo (2 certificados)'));
  assert.ok(temporalHtml.includes('md:grid-cols-12'));
  assert.ok(temporalHtml.includes('id="batchTemporalEtiquetaInput"'));
  assert.ok(temporalHtml.includes('id="batchTemporalUbicacionInput"'));
  assert.ok(temporalHtml.includes('id="temporalDaysInput"'));
  assert.ok(temporalHtml.includes('data-action="save-batch-temporal-site"'));
  assert.equal(temporalHtml.includes('data-testid="temporal-linked-batch-banner"'), false);
  // Zone 3 must not repeat the planned date string 10/07/2026 outside Zone 1
  const temporalZone3 = temporalHtml.slice(temporalHtml.indexOf('aria-label="Detalle del registro"'));
  assert.equal(temporalZone3.includes('10/07/2026'), false);

  // 2. Tiempo (Staff)
  const tiempoHtml = renderTiempoView({
    profile: ADMIN_PROFILE,
    state: {
      ...DEFAULT_TIEMPO_STATE,
      selectedCertId: certA.id,
      selectedAuditId: auditAId,
    },
    programs: [linkedProgram],
    audits: [baseAuditA, baseAuditB],
    temporalSites: [temporalEntity],
    vinculos: [],
    conglomerados: [],
    organizaciones: INITIAL_ORGANIZACIONES,
    certificados: INITIAL_CERTIFICADOS_DETAILED,
    referenceIsoDate: '2026-06-01',
  });
  assert.equal(assertZeroUuidExposure(tiempoHtml).compliant, true);
  assert.ok(tiempoHtml.includes('data-testid="audit-zone-1-data"'));
  assert.ok(tiempoHtml.includes('data-testid="audit-zone-2-selectors"'));
  assert.ok(tiempoHtml.includes('data-testid="tiempo-summary-banner"'));
  assert.ok(tiempoHtml.includes('Total:'));
  assert.ok(tiempoHtml.includes('2.50 d'));
  assert.ok(tiempoHtml.includes('Completo ✓'));
  assert.ok(tiempoHtml.includes('data-testid="tiempo-temporal-note"'));
  assert.ok(tiempoHtml.includes('Proyecto Ampliación 4.2'));
  assert.ok(tiempoHtml.includes('1.25 d'));
  assert.ok(tiempoHtml.includes('Editar en 1.5 Temporal →'));
  assert.ok(tiempoHtml.includes('data-action="change-tiempo-site-modality"'));
  assert.ok(tiempoHtml.includes('data-action="step-tiempo-site-days"'));

  // Read-only RBAC checks for AUDITOR & CLIENT
  for (const roProfile of [auditorProfile, clientProfile]) {
    const roTemp = renderDesignacionTemporalView({
      profile: roProfile,
      state: {
        ...DEFAULT_DESIGNACION_TEMPORAL_STATE,
        selectedCertId: certA.id,
        selectedAuditId: auditAId,
      },
      programs: [linkedProgram],
      audits: [baseAuditA, baseAuditB],
      temporalSites: [temporalEntity],
      vinculos: [],
      conglomerados: [],
      organizaciones: INITIAL_ORGANIZACIONES,
      certificados: INITIAL_CERTIFICADOS_DETAILED,
      referenceIsoDate: '2026-06-01',
    });
    assert.ok(roTemp.includes('Solo lectura'));
    assert.equal(roTemp.includes('data-action="save-batch-temporal-site"'), false);

    const roTiempo = renderTiempoView({
      profile: roProfile,
      state: {
        ...DEFAULT_TIEMPO_STATE,
        selectedCertId: certA.id,
        selectedAuditId: auditAId,
      },
      programs: [linkedProgram],
      audits: [baseAuditA, baseAuditB],
      temporalSites: [temporalEntity],
      vinculos: [],
      conglomerados: [],
      organizaciones: INITIAL_ORGANIZACIONES,
      certificados: INITIAL_CERTIFICADOS_DETAILED,
      referenceIsoDate: '2026-06-01',
    });
    assert.ok(roTiempo.includes('Solo lectura'));
    assert.equal(roTiempo.includes('data-action="step-tiempo-site-days"'), false);
    assert.equal(roTiempo.includes('data-action="change-tiempo-site-modality"'), false);
  }
});

