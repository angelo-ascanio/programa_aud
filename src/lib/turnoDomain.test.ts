import test from 'node:test';
import assert from 'node:assert/strict';
import type { UserProfile } from './healthCheck';
import { assertZeroUuidExposure } from './zeroUuid';
import { INITIAL_CERTIFICADOS_DETAILED } from './multisiteSampling';
import { INITIAL_PROGRAMACION_AUDITS } from './auditExecution';
import { INITIAL_TURNO_CATALOG } from './sitioDomain';
import {
  buildAuditTurnoDetail,
  buildCertificateTurnoRows,
  buildSiteTurnoMatrix,
  canArchiveTurno,
  computeBatchApplyShiftsToPending,
  computeColumnShiftTogglePlan,
  computeShiftDurationLabel,
  computeSingleShiftPendingTargets,
  createEmptyTurnoFormDraft,
  createTurnoFormDraftFromEntity,
  evaluateAuditTurnoCompleteness,
  formatMatrixShiftLabel,
  formatTurnoTime,
  isGenericTurnoDescription,
  isOvernightShift,
  resolveCustomTurnoDescription,
  resolveHomonymousTargetMatches,
  resolveTurnoDetailById,
  resolveTurnoDetailMode,
  resolveTurnoUpsertPlan,
  saveCustomTurnoDescription,
  validateTurnoFormDraft,
  validateTurnoInput,
} from './turnoDomain';
import { renderTurnoView } from '../views/turnoView';
import type { ProgramacionAuditEntity } from './auditExecution';
import type { TurnoPorSitioLink } from './multisiteSampling';
import type { ProcesoPorSitioLink } from './sitioDomain';
import type { CandidateProcessEntity } from './programaCertificadoDomain';

const ADMIN_PROFILE: UserProfile = {
  id: '11111111-1111-1111-1111-111111111111',
  nombre: 'Administrador Principal',
  role: 'ADMIN',
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

test('Phase 4.2.3: computeShiftDurationLabel handles standard, fractional, midnight, and overnight shifts', () => {
  assert.equal(formatTurnoTime('07:00:00'), '07:00');
  assert.equal(computeShiftDurationLabel('07:00:00', '15:00:00'), '8h 00m');
  assert.equal(isOvernightShift('07:00:00', '15:00:00'), false);

  assert.equal(computeShiftDurationLabel('08:00:00', '16:30:00'), '8h 30m');
  assert.equal(computeShiftDurationLabel('00:00:00', '08:00:00'), '8h 00m');

  assert.equal(computeShiftDurationLabel('22:00:00', '06:00:00'), '8h 00m (nocturno)');
  assert.equal(isOvernightShift('22:00:00', '06:00:00'), true);

  assert.equal(computeShiftDurationLabel('23:30', '05:45'), '6h 15m (nocturno)');
  assert.equal(computeShiftDurationLabel('bad', '15:00'), '—');
});

test('Phase 4.2.3: validateTurnoInput rejects invalid or equal times and accepts overnight ranges', () => {
  assert.equal(
    validateTurnoInput({
      hora_entrada: '25:00',
      hora_salida: '06:00',
    }).valid,
    false
  );

  assert.equal(
    validateTurnoInput({
      hora_entrada: '08:00',
      hora_salida: '08:00',
    }).valid,
    false
  );

  const overnight = validateTurnoInput({
    hora_entrada: '22:00',
    hora_salida: '06:00',
    descripcion: 'Turno Nocturno Automatizado',
  });
  assert.equal(overnight.valid, true);
  assert.equal(overnight.normalized?.hora_entrada, '22:00:00');
  assert.equal(overnight.normalized?.hora_salida, '06:00:00');
  assert.equal(overnight.normalized?.durationLabel, '8h 00m (nocturno)');
});

test('Phase 4.2.3: canArchiveTurno enforces turnos_por_sitio dependency guard', () => {
  const blocked = canArchiveTurno({ assignedSitiosCount: 2 });
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.reason?.includes('sede'));

  const allowed = canArchiveTurno({ assignedSitiosCount: 0 });
  assert.equal(allowed.allowed, true);
});

test('Phase 4.2.3: resolveTurnoDetailById populates Parent Zone when originatingSitioId is present and omits cleanly when global', () => {
  const cert = INITIAL_CERTIFICADOS_DETAILED[0];
  const sitio0 = cert.sitios.find((s) => s.numero_sitio === 0) || cert.sitios[0];
  const turno1 = INITIAL_TURNO_CATALOG[0];

  // Contextual navigation from Sitio -> Turno
  const contextual = resolveTurnoDetailById({
    turnoId: turno1.id,
    originatingSitioId: sitio0.id,
    certificates: INITIAL_CERTIFICADOS_DETAILED,
    programacionAudits: INITIAL_PROGRAMACION_AUDITS,
    shiftCatalog: INITIAL_TURNO_CATALOG,
  });
  assert.ok(contextual);
  assert.ok(contextual.parentSitio);
  assert.equal(contextual.parentSitio.id_sitio, sitio0.id);
  assert.equal(contextual.parentSitio.id_certificado, cert.id);
  assert.ok(contextual.sitios.length > 0);
  assert.ok(contextual.auditorias.length > 0);

  const contextualHtml = renderTurnoView({
    profile: ADMIN_PROFILE,
    state: {
      selectedTurnoId: contextual.id,
      originatingSitioId: sitio0.id,
      activeChildTab: 'sitios',
      isEditingAttributes: false,
    },
    turno: contextual,
  });
  assert.ok(contextualHtml.includes('aria-label="Contexto y relaciones superiores"'));
  assert.ok(contextualHtml.includes('<hr class="border-t border-slate-200 my-2.5 sm:my-3" />'));
  assert.ok(contextualHtml.includes('data-parent-nav="true"'));
  assert.ok(contextualHtml.includes('data-parent-type="sitio"'));
  assert.ok(contextualHtml.includes('data-parent-type="cert"'));
  assert.ok(contextualHtml.includes('id="startEditTurnoBtn"'));
  assert.ok(contextualHtml.includes('title="Editar"'));
  assert.ok(contextualHtml.includes('title="Historial de Cambios"'));
  assert.ok(contextualHtml.indexOf('id="startEditTurnoBtn"') < contextualHtml.indexOf('data-action="open-changelog"'));
  assert.ok(contextualHtml.includes('data-action="select-sitio"'));
  assert.ok(contextualHtml.includes('data-resizable-table="turno-tab-sitios"'));
  assert.ok(contextualHtml.includes('table-fixed'));
  const sitiosTbody = contextualHtml.match(/<tbody[\s\S]*?<\/tbody>/);
  assert.ok(sitiosTbody);
  assert.equal(sitiosTbody[0].includes('<button'), false);
  assert.equal(assertZeroUuidExposure(contextualHtml).compliant, true);

  // Global navigation from Certificado > Turnos (no originatingSitioId -> omit Parent Zone + <hr>)
  const overnightShiftId = '70000000-0000-0000-0000-000000000099';
  const globalShift = resolveTurnoDetailById({
    turnoId: overnightShiftId,
    originatingSitioId: null,
    certificates: INITIAL_CERTIFICADOS_DETAILED,
    programacionAudits: INITIAL_PROGRAMACION_AUDITS,
    shiftCatalog: [
      ...INITIAL_TURNO_CATALOG,
      {
        id: overnightShiftId,
        hora_entrada: '22:00:00',
        hora_salida: '06:00:00',
        descripcion: 'Turno Nocturno Planta',
      },
    ],
  });
  assert.ok(globalShift);
  assert.equal(globalShift.parentSitio, null);
  assert.equal(globalShift.isOvernight, true);
  assert.equal(globalShift.durationLabel, '8h 00m (nocturno)');

  const contextualAuditsHtml = renderTurnoView({
    profile: ADMIN_PROFILE,
    state: {
      selectedTurnoId: contextual.id,
      originatingSitioId: sitio0.id,
      activeChildTab: 'auditorias',
      isEditingAttributes: false,
    },
    turno: contextual,
  });
  assert.ok(contextualAuditsHtml.includes('data-resizable-table="turno-tab-auditorias"'));

  const globalHtml = renderTurnoView({
    profile: ADMIN_PROFILE,
    state: {
      selectedTurnoId: globalShift.id,
      originatingSitioId: null,
      activeChildTab: 'auditorias',
      isEditingAttributes: false,
    },
    turno: globalShift,
  });
  assert.equal(globalHtml.includes('aria-label="Contexto y relaciones superiores"'), false);
  assert.equal(globalHtml.includes('<hr class="border-t border-slate-200 my-2.5 sm:my-3" />'), false);
  assert.ok(globalHtml.includes('8h 00m (nocturno)'));
  const auditsTbody = globalHtml.match(/<tbody[\s\S]*?<\/tbody>/);
  if (auditsTbody) {
    assert.equal(auditsTbody[0].includes('<button'), false);
  }
  assert.equal(assertZeroUuidExposure(globalHtml).compliant, true);

  // RBAC: Auditor & Client are strictly read-only
  for (const readOnlyProfile of [AUDITOR_PROFILE, CLIENT_PROFILE]) {
    const readOnlyHtml = renderTurnoView({
      profile: readOnlyProfile,
      state: {
        selectedTurnoId: contextual.id,
        originatingSitioId: sitio0.id,
        activeChildTab: 'sitios',
        isEditingAttributes: true,
      },
      turno: contextual,
    });
    assert.equal(readOnlyHtml.includes('id="startEditTurnoBtn"'), false);
    assert.equal(readOnlyHtml.includes('id="editTurnoForm"'), false);
    assert.equal(readOnlyHtml.includes('data-action="open-archive-turno"'), false);
    assert.equal(assertZeroUuidExposure(readOnlyHtml).compliant, true);
  }
});

test('Step 4.1: Turno Detail View supports canonical Add and Edit modes with Save-first header actions and zero bottom form buttons', () => {
  const cert = INITIAL_CERTIFICADOS_DETAILED[0];
  const sitio0 = cert.sitios[0];
  const turno1 = INITIAL_TURNO_CATALOG[0];

  const resolved = resolveTurnoDetailById({
    turnoId: turno1.id,
    originatingSitioId: sitio0.id,
    certificates: INITIAL_CERTIFICADOS_DETAILED,
    programacionAudits: INITIAL_PROGRAMACION_AUDITS,
    shiftCatalog: INITIAL_TURNO_CATALOG,
  });
  assert.ok(resolved);

  assert.equal(resolveTurnoDetailMode({ isCreating: true }, true, null), 'add');
  assert.equal(resolveTurnoDetailMode({ isEditingAttributes: true }, true, resolved), 'edit');
  assert.equal(resolveTurnoDetailMode({ isCreating: true }, false, null), 'read');

  const emptyDraft = createEmptyTurnoFormDraft(sitio0.id);
  assert.equal(emptyDraft.id_sitio, sitio0.id);
  assert.equal(validateTurnoFormDraft({ ...emptyDraft, descripcion: '550e8400-e29b-41d4-a716-446655440000' }).valid, false);

  // Add Mode
  const addHtml = renderTurnoView({
    profile: ADMIN_PROFILE,
    state: {
      selectedTurnoId: null,
      originatingSitioId: null,
      activeChildTab: 'sitios',
      isCreating: true,
      prefillCertId: cert.id,
      prefillSitioId: sitio0.id,
      isEditingAttributes: false,
      formDraft: emptyDraft,
    },
    turno: null,
    availableSites: cert.sitios.map((s) => ({
      id: s.id,
      id_certificado: cert.id,
      numero_certificado: cert.numero_certificado,
      numero_sitio: s.numero_sitio,
      nombre_sitio: s.nombre_sitio,
    })),
  });
  assert.ok(addHtml.includes('Nuevo Turno Operativo'));
  assert.ok(addHtml.includes('id="turnoParentSitioSelect"'));
  assert.ok(addHtml.includes('id="saveTurnoFormBtn"'));
  assert.ok(addHtml.includes('id="cancelEditTurnoBtn"'));
  assert.ok(addHtml.indexOf('id="saveTurnoFormBtn"') < addHtml.indexOf('id="cancelEditTurnoBtn"'));
  assert.equal(addHtml.includes('id="cancelEditTurnoBtnSecondary"'), false);
  assert.equal(addHtml.includes('role="tablist"'), false);
  assert.equal(assertZeroUuidExposure(addHtml).compliant, true);

  // Edit Mode: header Save-first / Cancel-second, zero form buttons inside <form id="editTurnoForm">
  const editHtml = renderTurnoView({
    profile: ADMIN_PROFILE,
    state: {
      selectedTurnoId: resolved.id,
      originatingSitioId: sitio0.id,
      activeChildTab: 'sitios',
      isCreating: false,
      isEditingAttributes: true,
      formDraft: createTurnoFormDraftFromEntity(resolved),
    },
    turno: resolved,
  });
  assert.ok(editHtml.includes('id="saveTurnoFormBtn"'));
  assert.ok(editHtml.includes('id="cancelEditTurnoBtn"'));
  assert.ok(editHtml.indexOf('id="saveTurnoFormBtn"') < editHtml.indexOf('id="cancelEditTurnoBtn"'));
  assert.equal(editHtml.includes('id="cancelEditTurnoBtnSecondary"'), false);
  const formBodyMatch = editHtml.match(/<form id="editTurnoForm"[\s\S]*?<\/form>/);
  assert.ok(formBodyMatch);
  assert.equal(formBodyMatch[0].includes('<button'), false);
  assert.equal(assertZeroUuidExposure(editHtml).compliant, true);
});

test('Step 7.1: Anti-Fatigue 5. Turno matrix, batch pending apply, column toggle, single-shift autofill, and cross-site homonymous propagation', () => {
  const siteHqId = '50000000-0000-4000-8000-000000000010';
  const siteBranchId = '50000000-0000-4000-8000-000000000020';
  const saHqId = '51000000-0000-4000-8000-000000000010';
  const saBranchId = '51000000-0000-4000-8000-000000000020';

  const catMatId = '71000000-0000-4000-8000-000000000001';
  const catVespId = '71000000-0000-4000-8000-000000000002';

  const tpsHqMatId = '72000000-0000-4000-8000-000000000001';
  const tpsHqVespId = '72000000-0000-4000-8000-000000000002';
  const tpsBranchMatId = '72000000-0000-4000-8000-000000000003';

  const allTurnosPorSitio: TurnoPorSitioLink[] = [
    {
      id: tpsHqMatId,
      id_sitio: siteHqId,
      id_turno: catMatId,
      hora_entrada: '08:00:00',
      hora_salida: '16:00:00',
      descripcion: 'Turno Matutino',
      deleted_at: null,
    },
    {
      id: tpsHqVespId,
      id_sitio: siteHqId,
      id_turno: catVespId,
      hora_entrada: '16:00:00',
      hora_salida: '00:00:00',
      descripcion: 'Turno 16:00 – 00:00',
      deleted_at: null,
    },
    {
      id: tpsBranchMatId,
      id_sitio: siteBranchId,
      id_turno: catMatId,
      hora_entrada: '08:00:00',
      hora_salida: '16:00:00',
      descripcion: 'Matutino Sucursal',
      deleted_at: null,
    },
  ];

  const procHqProdId = '61000000-0000-4000-8000-000000000001';
  const procHqMantId = '61000000-0000-4000-8000-000000000002';
  const procBranchProdId = '61000000-0000-4000-8000-000000000003';

  const ppsHqProdId = '62000000-0000-4000-8000-000000000001';
  const ppsHqMantId = '62000000-0000-4000-8000-000000000002';
  const ppsBranchProdId = '62000000-0000-4000-8000-000000000003';

  const psaHqProdId = '63000000-0000-4000-8000-000000000001';
  const psaHqMantId = '63000000-0000-4000-8000-000000000002';
  const psaBranchProdId = '63000000-0000-4000-8000-000000000003';

  const allProcesses: CandidateProcessEntity[] = [
    {
      id: procHqProdId,
      id_certificado: INITIAL_CERTIFICADOS_DETAILED[0].id,
      nombre_proceso: 'Producción Línea A',
      tipo: 'Medular',
      clausulas_cubiertas: ['8.5'],
      deleted_at: null,
    },
    {
      id: procHqMantId,
      id_certificado: INITIAL_CERTIFICADOS_DETAILED[0].id,
      nombre_proceso: 'Mantenimiento',
      tipo: 'De Apoyo',
      clausulas_cubiertas: ['7.1.3'],
      deleted_at: null,
    },
    {
      id: procBranchProdId,
      id_certificado: INITIAL_CERTIFICADOS_DETAILED[0].id,
      nombre_proceso: 'Produccion Linea A', // NFD homonym without accents
      tipo: 'Medular',
      clausulas_cubiertas: ['8.5'],
      deleted_at: null,
    },
  ];

  const allProcessesPorSitio: ProcesoPorSitioLink[] = [
    { id: ppsHqProdId, id_sitio: siteHqId, id_proceso: procHqProdId, deleted_at: null },
    { id: ppsHqMantId, id_sitio: siteHqId, id_proceso: procHqMantId, deleted_at: null },
    { id: ppsBranchProdId, id_sitio: siteBranchId, id_proceso: procBranchProdId, deleted_at: null },
  ];

  const baseAudit = INITIAL_PROGRAMACION_AUDITS[0];
  const audit: ProgramacionAuditEntity = {
    ...baseAudit,
    id: '88000000-0000-4000-8000-000000000001',
    id_certificado: INITIAL_CERTIFICADOS_DETAILED[0].id,
    sitiosPlan: [
      {
        id: saHqId,
        id_auditoria: '88000000-0000-4000-8000-000000000001',
        id_sitio: siteHqId,
        numero_sitio: 0,
        nombre_sitio: 'Planta HQ',
        tiempo_auditoria: 2,
        procesos: [
          {
            id: psaHqProdId,
            id_sitios_por_auditoria: saHqId,
            id_procesos_por_sitio: ppsHqProdId,
            id_proceso: procHqProdId,
            proceso_nombre: 'Producción Línea A',
            turnos: [
              {
                id: '91000000-0000-4000-8000-000000000001',
                id_procesos_sitio_auditoria: psaHqProdId,
                id_turnos_sitio_auditoria: '92000000-0000-4000-8000-000000000001',
                id_turnos_por_sitio: tpsHqMatId,
                descripcion_turno: 'Turno Matutino',
                hora_entrada: '08:00',
                hora_salida: '16:00',
                deleted_at: null,
              },
              {
                id: '91000000-0000-4000-8000-000000000002',
                id_procesos_sitio_auditoria: psaHqProdId,
                id_turnos_sitio_auditoria: '92000000-0000-4000-8000-000000000002',
                id_turnos_por_sitio: tpsHqVespId,
                descripcion_turno: 'Turno Vespertino',
                hora_entrada: '16:00',
                hora_salida: '00:00',
                deleted_at: null,
              },
            ],
            equipoProceso: [],
            deleted_at: null,
          },
          {
            id: psaHqMantId,
            id_sitios_por_auditoria: saHqId,
            id_procesos_por_sitio: ppsHqMantId,
            id_proceso: procHqMantId,
            proceso_nombre: 'Mantenimiento',
            turnos: [],
            equipoProceso: [],
            deleted_at: null,
          },
        ],
        equipoSitio: [],
      },
      {
        id: saBranchId,
        id_auditoria: '88000000-0000-4000-8000-000000000001',
        id_sitio: siteBranchId,
        numero_sitio: 1,
        nombre_sitio: 'Sucursal Norte',
        tiempo_auditoria: 1,
        procesos: [
          {
            id: psaBranchProdId,
            id_sitios_por_auditoria: saBranchId,
            id_procesos_por_sitio: ppsBranchProdId,
            id_proceso: procBranchProdId,
            proceso_nombre: 'Produccion Linea A',
            turnos: [],
            equipoProceso: [],
            deleted_at: null,
          },
        ],
        equipoSitio: [],
      },
    ],
  };

  assert.deepEqual(formatMatrixShiftLabel(allTurnosPorSitio[1]), {
    timeRange: '16:00 – 00:00',
    description: '',
  });

  const detail = buildAuditTurnoDetail({
    audit,
    allAudits: [audit],
    allProcessesPorSitio,
    allProcesses,
    allTurnosPorSitio,
  });

  assert.equal(detail.totalPairs, 3);
  assert.equal(detail.coveredPairs, 1);
  assert.equal(detail.pendingPairs, 2);
  assert.equal(detail.isComplete, false);

  const hqMatrix = detail.sites[0];
  const branchMatrix = detail.sites[1];
  assert.equal(hqMatrix.isSingleShiftSite, false);
  assert.equal(branchMatrix.isSingleShiftSite, true);

  // 1-click single-shift autofill works ONLY on single-shift site
  assert.deepEqual(computeSingleShiftPendingTargets(hqMatrix), []);
  assert.deepEqual(computeSingleShiftPendingTargets(branchMatrix), [
    { sitePlanId: saBranchId, psaId: psaBranchProdId, tpsId: tpsBranchMatId },
  ]);

  // Batch chips apply strictly to pending (!isCovered) rows and ignore invalid site shifts
  assert.deepEqual(computeBatchApplyShiftsToPending(hqMatrix, [tpsHqMatId, tpsBranchMatId]), [
    { sitePlanId: saHqId, psaId: psaHqMantId, tpsId: tpsHqMatId },
  ]);

  // Column toggle: CHECK missing rows when partial, UNCHECK all visible rows when all checked
  const colCheckPlan = computeColumnShiftTogglePlan(hqMatrix, tpsHqMatId);
  assert.equal(colCheckPlan.mode, 'CHECK');
  assert.deepEqual(colCheckPlan.targets, [
    { psaId: psaHqMantId, tpsId: tpsHqMatId, tpsaRecordId: null },
  ]);

  const colUncheckFiltered = computeColumnShiftTogglePlan(hqMatrix, tpsHqMatId, [psaHqProdId]);
  assert.equal(colUncheckFiltered.mode, 'UNCHECK');
  assert.deepEqual(colUncheckFiltered.targets, [
    {
      psaId: psaHqProdId,
      tpsId: tpsHqMatId,
      tpsaRecordId: '91000000-0000-4000-8000-000000000001',
    },
  ]);

  // Cross-site homonymous propagation intersects against target site turnos_por_sitio
  // HQ 'Producción Línea A' has Matutino + Vespertino; Branch has ONLY Matutino -> Matutino propagates, Vespertino is skipped!
  const propagation = resolveHomonymousTargetMatches(detail, saHqId);
  assert.equal(propagation.matchedProcessesCount, 1);
  assert.equal(propagation.skippedIncompatibleShiftsCount, 1);
  assert.deepEqual(propagation.assignments, [
    { sitePlanId: saBranchId, psaId: psaBranchProdId, tpsId: tpsBranchMatId },
  ]);

  // Completeness & Multi View rows
  const completenessBefore = evaluateAuditTurnoCompleteness(audit, allTurnosPorSitio);
  assert.equal(completenessBefore.isComplete, false);
  assert.equal(completenessBefore.pendingPairs, 2);

  const rebuiltMatrix = buildSiteTurnoMatrix({
    audit,
    sitePlan: audit.sitiosPlan![0],
    allAudits: [audit],
    allProcessesPorSitio,
    allProcesses,
    allTurnosPorSitio,
  });
  assert.equal(rebuiltMatrix.coveredProcessesCount, 1);

  const certRows = buildCertificateTurnoRows({
    certificates: [],
    detailedCerts: [INITIAL_CERTIFICADOS_DETAILED[0]],
    audits: [audit],
    programs: [],
    allProcessesPorSitio,
    allProcesses,
    allTurnosPorSitio,
  });
  assert.equal(certRows[0].statusKey, 'PENDIENTE');
  assert.equal(certRows[0].coveredProcessesCount, 1);
  assert.equal(certRows[0].selectedProcessesCount, 3);
});

test('Turno catalog reuse, shared-site turno_certificado_compartido linking, edit relink, and custom description resolution', () => {
  const ownerCertId = '14c1c36d-636e-437e-97ba-08ad845908f1';
  const sharedCertId = 'fe3d32fa-1b85-429f-8c40-f49dc41b1b5b';
  const sharedVerId = '2a36039f-fa67-47aa-b5d3-fd482e165097';
  const sharedSiteId = '6efe5ad5-81a8-4a06-8107-1b7b65712ca7';
  const shift8to17Id = '70000000-0000-0000-0000-000000000004';
  const shift8to16Id = '9b63b68a-1120-4173-8fdf-dfa3d1eebd98';
  const tps8to16Id = '3fe63b57-99e8-41fa-a36b-4391f9a88e76';

  const shiftCatalog = [
    {
      id: shift8to17Id,
      hora_entrada: '08:00:00',
      hora_salida: '17:00:00',
      descripcion: 'Administrativo (Otro Org)',
    },
    {
      id: shift8to16Id,
      hora_entrada: '08:00:00',
      hora_salida: '16:00:00',
      descripcion: 'Turno 08:00 – 16:00',
    },
  ];

  const baseCert45001: typeof INITIAL_CERTIFICADOS_DETAILED[number] = {
    ...INITIAL_CERTIFICADOS_DETAILED[0],
    id: sharedCertId,
    id_certificado_version: sharedVerId,
    numero_certificado: '45001-41-03-10-2020',
    sitios: [
      {
        id: sharedSiteId,
        id_certificado: ownerCertId,
        ownerCertId,
        numero_sitio: 0,
        nombre_sitio: 'Planta CADIPRO',
        direccion_sitio: 'Táchira',
        personal_count: 102,
        turnos_por_sitio: [
          {
            id: tps8to16Id,
            id_sitio: sharedSiteId,
            id_turno: shift8to16Id,
            hora_entrada: '08:00:00',
            hora_salida: '16:00:00',
            descripcion: 'Administrativo',
            deleted_at: null,
          },
        ],
      },
    ],
    turnos: [
      {
        id: shift8to16Id,
        hora_entrada: '08:00:00',
        hora_salida: '16:00:00',
        descripcion: 'Administrativo',
        sitios_vinculados: ['Planta CADIPRO'],
      },
    ],
  };

  // 1. Create 08:00 - 17:00 on shared site when catalog already has 08:00 - 17:00 globally -> reuse_and_link + needsShareLink=true
  const createReusePlan = resolveTurnoUpsertPlan({
    mode: 'create',
    normalized: {
      hora_entrada: '08:00:00',
      hora_salida: '17:00:00',
      descripcion: 'Administrativo',
    },
    selectedSitioId: sharedSiteId,
    activeCertId: sharedCertId,
    certificates: [baseCert45001],
    shiftCatalog,
  });
  assert.equal(createReusePlan.valid, true);
  assert.equal(createReusePlan.action, 'reuse_and_link');
  assert.equal(createReusePlan.targetTurnoId, shift8to17Id);
  assert.equal(createReusePlan.needsTurnoInsert, false);
  assert.equal(createReusePlan.needsTurnosPorSitioInsert, true);
  assert.equal(createReusePlan.needsShareLink, true);
  assert.equal(createReusePlan.activeCertVersionId, sharedVerId);

  // 2. Create brand-new schedule 07:00 - 15:00 on shared site -> create_new_and_link + needsShareLink=true
  const createNewPlan = resolveTurnoUpsertPlan({
    mode: 'create',
    normalized: {
      hora_entrada: '07:00:00',
      hora_salida: '15:00:00',
      descripcion: 'Planta Mañana',
    },
    selectedSitioId: sharedSiteId,
    activeCertId: sharedCertId,
    certificates: [baseCert45001],
    shiftCatalog,
  });
  assert.equal(createNewPlan.valid, true);
  assert.equal(createNewPlan.action, 'create_new_and_link');
  assert.equal(createNewPlan.needsTurnoInsert, true);
  assert.equal(createNewPlan.needsTurnosPorSitioInsert, true);
  assert.equal(createNewPlan.needsShareLink, true);

  // 3. Create 08:00 - 16:00 again on same site & same certificate -> duplicate error
  const createDuplicatePlan = resolveTurnoUpsertPlan({
    mode: 'create',
    normalized: {
      hora_entrada: '08:00:00',
      hora_salida: '16:00:00',
      descripcion: 'Duplicado',
    },
    selectedSitioId: sharedSiteId,
    activeCertId: sharedCertId,
    certificates: [baseCert45001],
    shiftCatalog,
  });
  assert.equal(createDuplicatePlan.valid, false);
  assert.ok(createDuplicatePlan.error?.includes('ya tiene asignado'));

  // 4. Edit 08:00 - 16:00 -> 08:00 - 17:00 (existing catalog shift from another org) -> relink_to_existing_catalog
  const editRelinkPlan = resolveTurnoUpsertPlan({
    mode: 'edit',
    currentTurnoId: shift8to16Id,
    normalized: {
      hora_entrada: '08:00:00',
      hora_salida: '17:00:00',
      descripcion: 'Administrativo',
    },
    activeCertId: sharedCertId,
    originatingSitioId: sharedSiteId,
    certificates: [baseCert45001],
    shiftCatalog,
  });
  assert.equal(editRelinkPlan.valid, true);
  assert.equal(editRelinkPlan.action, 'relink_to_existing_catalog');
  assert.equal(editRelinkPlan.targetTurnoId, shift8to17Id);
  assert.equal(editRelinkPlan.oldTurnoId, shift8to16Id);
  assert.equal(editRelinkPlan.needsShareLink, true);
  assert.deepEqual(editRelinkPlan.relinkSites, [
    {
      sitioId: sharedSiteId,
      sitioNombre: 'Planta CADIPRO',
      ownerCertId,
      oldTpsIds: [tps8to16Id],
    },
  ]);

  // 5. Edit 08:00 - 16:00 -> 08:00 - 16:00 (metadata change only) -> update_metadata_only
  const editMetaPlan = resolveTurnoUpsertPlan({
    mode: 'edit',
    currentTurnoId: shift8to16Id,
    normalized: {
      hora_entrada: '08:00:00',
      hora_salida: '16:00:00',
      descripcion: 'Administrativo',
    },
    activeCertId: sharedCertId,
    certificates: [baseCert45001],
    shiftCatalog,
  });
  assert.equal(editMetaPlan.valid, true);
  assert.equal(editMetaPlan.action, 'update_metadata_only');

  // 6. Edit 08:00 - 16:00 -> 09:00 - 18:00 (unmatched in catalog) -> update_schedule
  const editSchedulePlan = resolveTurnoUpsertPlan({
    mode: 'edit',
    currentTurnoId: shift8to16Id,
    normalized: {
      hora_entrada: '09:00:00',
      hora_salida: '18:00:00',
      descripcion: 'Administrativo',
    },
    activeCertId: sharedCertId,
    certificates: [baseCert45001],
    shiftCatalog,
  });
  assert.equal(editSchedulePlan.valid, true);
  assert.equal(editSchedulePlan.action, 'update_schedule');

  // 7. Custom description resolution & generic detection
  assert.equal(isGenericTurnoDescription('Turno 08:00 – 17:00', '08:00:00', '17:00:00'), true);
  assert.equal(isGenericTurnoDescription('Turno Operativo 3'), true);
  assert.equal(isGenericTurnoDescription('Administrativo', '08:00:00', '17:00:00'), false);

  const customMap = {
    [`${sharedCertId}::${shift8to17Id}`]: 'Administrativo',
    [`turno::${shift8to17Id}`]: 'Turno General',
  };
  assert.equal(
    resolveCustomTurnoDescription({
      turnoId: shift8to17Id,
      certId: sharedCertId,
      hora_entrada: '08:00:00',
      hora_salida: '17:00:00',
      currentDescripcion: 'Turno 08:00 – 17:00',
      shiftCatalog,
      customMap,
    }),
    'Administrativo'
  );
  // saveCustomTurnoDescription executes safely in Node (without localStorage)
  const savedMap = saveCustomTurnoDescription({
    turnoId: shift8to17Id,
    certId: sharedCertId,
    descripcion: 'Administrativo',
  });
  assert.equal(savedMap[`${sharedCertId}::${shift8to17Id}`], 'Administrativo');

  // 8. Edit 08:00 - 17:00 -> 08:30 - 17:30 when another org uses 08:00 - 17:00 -> fork_new_and_relink
  const otherOrgCert: typeof INITIAL_CERTIFICADOS_DETAILED[number] = {
    ...INITIAL_CERTIFICADOS_DETAILED[0],
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    numero_certificado: 'FN-QMS-OTHER',
    sitios: [],
    turnos: [
      {
        id: shift8to17Id,
        hora_entrada: '08:00:00',
        hora_salida: '17:00:00',
        descripcion: 'Diurno Otra Org',
        sitios_vinculados: ['Sede Otra'],
      },
    ],
  };
  const cert45001With8to17: typeof INITIAL_CERTIFICADOS_DETAILED[number] = {
    ...baseCert45001,
    sitios: [
      {
        ...baseCert45001.sitios[0],
        turnos_por_sitio: [
          {
            id: 'tps-8-17',
            id_sitio: sharedSiteId,
            id_turno: shift8to17Id,
            hora_entrada: '08:00:00',
            hora_salida: '17:00:00',
            descripcion: 'Administrativo',
            deleted_at: null,
          },
        ],
      },
    ],
    turnos: [
      {
        id: shift8to17Id,
        hora_entrada: '08:00:00',
        hora_salida: '17:00:00',
        descripcion: 'Administrativo',
        sitios_vinculados: ['Planta CADIPRO'],
      },
    ],
  };
  const forkPlan = resolveTurnoUpsertPlan({
    mode: 'edit',
    currentTurnoId: shift8to17Id,
    normalized: {
      hora_entrada: '08:30:00',
      hora_salida: '17:30:00',
      descripcion: 'Administrativo Ajustado',
    },
    activeCertId: sharedCertId,
    originatingSitioId: sharedSiteId,
    certificates: [otherOrgCert, cert45001With8to17],
    shiftCatalog,
  });
  assert.equal(forkPlan.valid, true);
  assert.equal(forkPlan.action, 'fork_new_and_relink');
  assert.equal(forkPlan.needsTurnoInsert, true);
  assert.equal(forkPlan.needsShareLink, true);

  // 9. resolveTurnoDetailById prioritizes activeCertId when originatingSitioId is shared across certs
  const cert14001WithSharedSite: typeof INITIAL_CERTIFICADOS_DETAILED[number] = {
    ...cert45001With8to17,
    id: '7b958a33-e557-44b6-b31e-17d74b506aba',
    numero_certificado: '14001-85-03-10-2020',
    norma_codigo: 'ISO 14001:2015',
  };
  const detailFrom45001 = resolveTurnoDetailById({
    turnoId: shift8to17Id,
    originatingSitioId: sharedSiteId,
    activeCertId: sharedCertId,
    certificates: [cert14001WithSharedSite, cert45001With8to17],
    programacionAudits: [],
    shiftCatalog,
  });
  assert.ok(detailFrom45001);
  assert.equal(detailFrom45001.parentSitio?.id_certificado, sharedCertId);
  assert.equal(detailFrom45001.parentSitio?.numero_certificado, '45001-41-03-10-2020');
});




