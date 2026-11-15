import test from 'node:test';
import assert from 'node:assert/strict';
import type { UserProfile } from './healthCheck';
import { assertZeroUuidExposure } from './zeroUuid';
import { INITIAL_CERTIFICADOS_DETAILED } from './multisiteSampling';
import { INITIAL_PROGRAMACION_AUDITS } from './auditExecution';
import { INITIAL_TURNO_CATALOG } from './sitioDomain';
import {
  canArchiveTurno,
  computeShiftDurationLabel,
  createEmptyTurnoFormDraft,
  createTurnoFormDraftFromEntity,
  formatTurnoTime,
  isOvernightShift,
  resolveTurnoDetailById,
  resolveTurnoDetailMode,
  validateTurnoFormDraft,
  validateTurnoInput,
} from './turnoDomain';
import { renderTurnoView } from '../views/turnoView';

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

