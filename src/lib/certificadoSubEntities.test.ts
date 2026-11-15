import test from 'node:test';
import assert from 'node:assert/strict';
import type { UserProfile } from './healthCheck';
import { assertZeroUuidExposure } from './zeroUuid';
import {
  CANONICAL_TIPO_FECHA_VALUES,
  INITIAL_CERTIFICADOS_DETAILED,
} from './multisiteSampling';
import {
  CANONICAL_TIPO_EMAIL_VALUES,
  CANONICAL_TIPO_TELEFONO_VALUES,
  EMAIL_TIPO_OPTIONS,
  TELEFONO_TIPO_OPTIONS,
  canArchiveContacto,
  createEmptyContactoFormDraft,
  createEmptyEmailFormDraft,
  createEmptyFechaFormDraft,
  createEmptyTelefonoFormDraft,
  getAvailableContactosForChannel,
  getEmailTipoVisual,
  getFechaRelativeVigenciaNote,
  getTelefonoTipoVisual,
  resolveContactoDetailById,
  resolveContactoDetailMode,
  resolveEmailDetailById,
  resolveEmailDetailMode,
  resolveFechaDetailById,
  resolveFechaDetailMode,
  resolveTelefonoDetailById,
  resolveTelefonoDetailMode,
  translateCertSubEntityDbError,
  validateContactoInput,
  validateEmailInput,
  validateFechaInput,
  validateTelefonoInput,
} from './certificadoSubEntities';
import { renderCertificadoView } from '../views/certificadoView';
import { renderFechaView } from '../views/fechaView';
import { renderContactoView } from '../views/contactoView';
import { renderTelefonoView } from '../views/telefonoView';
import { renderEmailView } from '../views/emailView';

const ADMIN_PROFILE: UserProfile = {
  id: '00000000-0000-0000-0000-000000000001',
  nombre: 'Administrador Principal',
  role: 'ADMIN',
  status: 'APPROVED',
};

const WORKER_PROFILE: UserProfile = {
  id: '00000000-0000-0000-0000-000000000002',
  nombre: 'Especialista Operaciones',
  role: 'WORKER',
  status: 'APPROVED',
};

const CLIENT_PROFILE: UserProfile = {
  id: '00000000-0000-0000-0000-000000000003',
  nombre: 'Usuario Cliente',
  role: 'CLIENT',
  status: 'APPROVED',
};

const AUDITOR_PROFILE: UserProfile = {
  id: '00000000-0000-0000-0000-000000000004',
  nombre: 'Auditor Externo',
  role: 'AUDITOR',
  status: 'APPROVED',
};

test('certificadoSubEntities: validates all 7 canonical tipo_fecha values and YYYY-MM-DD calendar dates', () => {
  assert.deepEqual(CANONICAL_TIPO_FECHA_VALUES, [
    'Otorgamiento',
    'Renovación',
    'Vencimiento',
    'Modificación',
    'Suspensión',
    'Cancelación',
    'Ultima Auditoría',
  ]);

  const cert = INITIAL_CERTIFICADOS_DETAILED[0];

  for (const tipo of CANONICAL_TIPO_FECHA_VALUES) {
    const ok = validateFechaInput({
      tipo_fecha: tipo,
      fecha: '2029-05-20',
      existingFechas: cert.fechas,
    });
    assert.equal(ok.ok, true, `Expected canonical tipo_fecha "${tipo}" to validate`);
  }

  const invalidTipo = validateFechaInput({
    tipo_fecha: 'Emisión Especial',
    fecha: '2026-06-15',
    existingFechas: [],
  });
  assert.equal(invalidTipo.ok, false);

  for (const badDate of ['2026/06/15', '15-06-2026', '2025-02-29', '2025-02-30', '2026-13-01', '']) {
    const res = validateFechaInput({
      tipo_fecha: 'Modificación',
      fecha: badDate,
      existingFechas: [],
    });
    assert.equal(res.ok, false, `Expected invalid date "${badDate}" to be rejected`);
  }

  const leapOk = validateFechaInput({
    tipo_fecha: 'Modificación',
    fecha: '2024-02-29',
    existingFechas: [],
  });
  assert.equal(leapOk.ok, true);

  const firstFecha = cert.fechas[0];
  const dup = validateFechaInput({
    tipo_fecha: firstFecha.tipo_fecha,
    fecha: firstFecha.fecha,
    existingFechas: cert.fechas,
  });
  assert.equal(dup.ok, false);

  const sameEdit = validateFechaInput({
    tipo_fecha: firstFecha.tipo_fecha,
    fecha: firstFecha.fecha,
    existingFechas: cert.fechas,
    currentFechaId: firstFecha.id,
  });
  assert.equal(sameEdit.ok, true);

  const fixedToday = new Date('2026-01-15T12:00:00Z');
  assert.match(getFechaRelativeVigenciaNote('2026-01-15', 'Otorgamiento', fixedToday), /fecha actual/);
  assert.match(getFechaRelativeVigenciaNote('2026-03-01', 'Vencimiento', fixedToday), /Alerta de renovación/);
  assert.match(getFechaRelativeVigenciaNote('2027-06-01', 'Vencimiento', fixedToday), /Vigencia activa/);
  assert.match(getFechaRelativeVigenciaNote('2025-12-01', 'Vencimiento', fixedToday), /Certificado vencido/);
});

test('certificadoSubEntities: validates contacto_certificado, telefono, and email + Step 4.3 draft/mode helpers', () => {
  const okWithCargo = validateContactoInput({
    nombre: '  Laura Beatriz Mendoza  ',
    cargo: '  Gerente de Calidad  ',
    existingContactos: [],
  });
  assert.equal(okWithCargo.ok, true);
  if (okWithCargo.ok) {
    assert.equal(okWithCargo.value.nombre, 'Laura Beatriz Mendoza');
    assert.equal(okWithCargo.value.cargo, 'Gerente de Calidad');
  }

  const okNullableCargo = validateContactoInput({
    nombre: 'Carlos Alberto Ríos',
    cargo: '   ',
    existingContactos: [],
  });
  assert.equal(okNullableCargo.ok, true);
  if (okNullableCargo.ok) {
    assert.equal(okNullableCargo.value.cargo, null);
  }

  assert.equal(
    validateContactoInput({ nombre: 'A', cargo: '', existingContactos: [] }).ok,
    false
  );
  assert.equal(
    validateContactoInput({
      nombre: 'Laura Beatriz Mendoza',
      cargo: '',
      existingContactos: [
        {
          id: 'c-1',
          id_certificado: 'cert-1',
          nombre: 'laura beatriz mendoza',
          cargo: null,
          telefonos: [],
          emails: [],
        },
      ],
    }).ok,
    false
  );

  assert.deepEqual(CANONICAL_TIPO_TELEFONO_VALUES, ['Oficina', 'Móvil', 'Directo', 'Emergencia']);
  assert.deepEqual(TELEFONO_TIPO_OPTIONS, ['Oficina', 'Móvil', 'Directo', 'Emergencia', 'Otro']);
  const defaultPhone = validateTelefonoInput({
    telefono: ' +58 (241) 832-4100 ',
    tipo_telefono: '   ',
    existingTelefonos: [],
  });
  assert.equal(defaultPhone.ok, true);
  if (defaultPhone.ok) {
    assert.equal(defaultPhone.value.tipo_telefono, 'Oficina');
    assert.equal(defaultPhone.value.telefono, '+58 (241) 832-4100');
  }
  assert.equal(
    validateTelefonoInput({ telefono: '12345', tipo_telefono: 'Móvil', existingTelefonos: [] }).ok,
    false
  );
  assert.equal(
    validateTelefonoInput({ telefono: 'abc-def-ghij', tipo_telefono: 'Móvil', existingTelefonos: [] }).ok,
    false
  );
  assert.equal(
    validateTelefonoInput({
      telefono: '+58 241 8324100',
      tipo_telefono: 'Directo',
      existingTelefonos: [{ id: 't-1', id_contacto: 'c-1', telefono: '+582418324100', tipo_telefono: 'Oficina' }],
    }).ok,
    false
  );
  assert.match(getTelefonoTipoVisual('Emergencia').badgeClass, /rose/);
  assert.equal(getTelefonoTipoVisual('Otro').label, 'Otro');

  assert.deepEqual(CANONICAL_TIPO_EMAIL_VALUES, ['Trabajo', 'Personal', 'Notificaciones']);
  assert.deepEqual(EMAIL_TIPO_OPTIONS, ['Trabajo', 'Personal', 'Notificaciones', 'Facturación', 'Otro']);
  const defaultEmail = validateEmailInput({
    email: ' calidad@empresa.com ',
    tipo_email: '',
    existingEmails: [],
  });
  assert.equal(defaultEmail.ok, true);
  if (defaultEmail.ok) {
    assert.equal(defaultEmail.value.tipo_email, 'Trabajo');
    assert.equal(defaultEmail.value.email, 'calidad@empresa.com');
  }
  for (const badEmail of ['', 'sin-arroba.com', 'usuario@dominio', 'a b@empresa.com']) {
    assert.equal(
      validateEmailInput({ email: badEmail, tipo_email: 'Trabajo', existingEmails: [] }).ok,
      false,
      `Expected invalid email "${badEmail}" to be rejected`
    );
  }
  assert.equal(
    validateEmailInput({
      email: 'Calidad@Empresa.com',
      tipo_email: 'Notificaciones',
      existingEmails: [{ id: 'e-1', id_contacto: 'c-1', email: 'calidad@empresa.com', tipo_email: 'Trabajo' }],
    }).ok,
    false
  );
  assert.match(getEmailTipoVisual('Notificaciones').badgeClass, /amber/);
  assert.equal(getEmailTipoVisual('Facturación').label, 'Facturación');

  assert.equal(canArchiveContacto({ telefonos: [], emails: [] }).allowed, true);
  assert.equal(
    canArchiveContacto({
      telefonos: [{ id: 't-1', id_contacto: 'c-1', telefono: '+58 241 8324100', tipo_telefono: 'Oficina' }],
      emails: [],
    }).allowed,
    false
  );
  assert.match(
    translateCertSubEntityDbError({ code: '23505', message: 'duplicate key' }, 'email_contacto_certificado'),
    /correo electrónico/i
  );

  // Step 4.3 empty draft factories and mode resolvers
  const cert = INITIAL_CERTIFICADOS_DETAILED[0];
  const contact = cert.contactos[0];
  assert.deepEqual(createEmptyFechaFormDraft(cert.id), {
    id_certificado: cert.id,
    tipo_fecha: 'Otorgamiento',
    fecha: '',
  });
  assert.deepEqual(createEmptyContactoFormDraft(cert.id), {
    id_certificado: cert.id,
    nombre: '',
    cargo: '',
  });
  assert.deepEqual(createEmptyTelefonoFormDraft(contact.id), {
    id_contacto: contact.id,
    tipo_telefono: 'Oficina',
    telefono: '',
  });
  assert.deepEqual(createEmptyEmailFormDraft(contact.id), {
    id_contacto: contact.id,
    tipo_email: 'Trabajo',
    email: '',
  });

  assert.equal(resolveFechaDetailMode({ isCreating: true, isEditingAttributes: false }, true, null), 'add');
  assert.equal(resolveFechaDetailMode({ isCreating: true, isEditingAttributes: false }, false, null), 'read');
  assert.equal(resolveContactoDetailMode({ isCreating: true, isEditingAttributes: false }, true, null), 'add');
  assert.equal(resolveTelefonoDetailMode({ isCreating: true, isEditingAttributes: false }, true, null), 'add');
  assert.equal(resolveEmailDetailMode({ isCreating: true, isEditingAttributes: false }, true, null), 'add');

  const scopedContacts = getAvailableContactosForChannel({
    certificates: INITIAL_CERTIFICADOS_DETAILED,
    scopedContactoId: contact.id,
  });
  assert.ok(scopedContacts.length > 0);
  assert.ok(scopedContacts.every((opt) => opt.id_certificado === cert.id));
});

test('renderFechaView: renders unified read, add, edit (ADMIN/WORKER) and read-only (CLIENT/AUDITOR) with canonical top actions', () => {
  const cert = INITIAL_CERTIFICADOS_DETAILED[0];
  const fecha = resolveFechaDetailById({
    fechaId: cert.fechas[0].id,
    certificates: INITIAL_CERTIFICADOS_DETAILED,
  })!;
  assert.ok(fecha);

  const readHtml = renderFechaView({
    profile: ADMIN_PROFILE,
    state: { selectedFechaId: fecha.id, isEditingAttributes: false },
    fecha,
    certificates: INITIAL_CERTIFICADOS_DETAILED,
  });
  assert.ok(readHtml.includes('aria-label="Contexto y relaciones superiores"'));
  assert.ok(readHtml.includes('aria-label="Detalle del registro"'));
  assert.ok(readHtml.includes(fecha.fecha));
  assert.ok(readHtml.includes('id="startEditFechaBtn"'));
  assert.ok(readHtml.includes('data-action="open-archive-modal"'));
  assert.equal(assertZeroUuidExposure(readHtml).compliant, true);

  const addHtml = renderFechaView({
    profile: ADMIN_PROFILE,
    state: {
      selectedFechaId: null,
      originatingCertId: cert.id,
      isCreating: true,
      isEditingAttributes: false,
      formDraft: createEmptyFechaFormDraft(cert.id),
    },
    fecha: null,
    certificates: INITIAL_CERTIFICADOS_DETAILED,
  });
  assert.ok(addHtml.includes('Nueva Fecha de Certificado'));
  assert.ok(addHtml.includes('id="fechaDetailForm"'));
  assert.ok(addHtml.includes('id="fechaSelectCertificado"'));
  assert.ok(addHtml.includes('id="saveFechaFormBtn"'));
  assert.ok(addHtml.includes('id="cancelEditFechaBtn"'));
  assert.ok(addHtml.indexOf('id="saveFechaFormBtn"') < addHtml.indexOf('id="cancelEditFechaBtn"'));
  assert.equal(addHtml.includes('id="startEditFechaBtn"'), false);
  assert.equal(addHtml.includes('data-action="open-archive-modal"'), false);
  assert.equal(assertZeroUuidExposure(addHtml).compliant, true);

  const workerEditHtml = renderFechaView({
    profile: WORKER_PROFILE,
    state: { selectedFechaId: fecha.id, isEditingAttributes: true },
    fecha,
    certificates: INITIAL_CERTIFICADOS_DETAILED,
  });
  assert.ok(workerEditHtml.includes('id="fechaDetailForm"'));
  assert.ok(workerEditHtml.includes('id="fechaSelectCertificado"'));
  assert.ok(workerEditHtml.includes('id="editFechaTipoSelect"'));
  assert.ok(workerEditHtml.includes('id="editFechaDateInput"'));
  assert.ok(workerEditHtml.includes('id="saveFechaFormBtn"'));
  assert.ok(workerEditHtml.includes('id="cancelEditFechaBtn"'));
  assert.ok(
    workerEditHtml.indexOf('id="saveFechaFormBtn"') <
      workerEditHtml.indexOf('id="cancelEditFechaBtn"')
  );
  assert.equal(workerEditHtml.includes('cancelEditFechaBtnSecondary'), false);
  for (const tipo of CANONICAL_TIPO_FECHA_VALUES) {
    assert.ok(workerEditHtml.includes(tipo));
  }
  assert.equal(assertZeroUuidExposure(workerEditHtml).compliant, true);

  for (const viewer of [CLIENT_PROFILE, AUDITOR_PROFILE]) {
    const roHtml = renderFechaView({
      profile: viewer,
      state: { selectedFechaId: fecha.id, isCreating: true, isEditingAttributes: true },
      fecha,
      certificates: INITIAL_CERTIFICADOS_DETAILED,
    });
    assert.equal(roHtml.includes('id="startEditFechaBtn"'), false);
    assert.equal(roHtml.includes('id="fechaDetailForm"'), false);
    assert.equal(roHtml.includes('data-action="open-archive-modal"'), false);
    assert.equal(assertZeroUuidExposure(roHtml).compliant, true);
  }
});

test('renderContactoView: renders unified read, add, edit, no inline channel forms, and read-only states with Zero-UUID', () => {
  const cert = INITIAL_CERTIFICADOS_DETAILED[0];
  const contacto = resolveContactoDetailById({
    contactoId: cert.contactos[0].id,
    certificates: INITIAL_CERTIFICADOS_DETAILED,
  })!;
  assert.ok(contacto);

  const readHtml = renderContactoView({
    profile: ADMIN_PROFILE,
    state: {
      selectedContactoId: contacto.id,
      activeChildTab: 'telefonos',
      isEditingAttributes: false,
    },
    contacto,
    certificates: INITIAL_CERTIFICADOS_DETAILED,
  });
  assert.ok(readHtml.includes(contacto.nombre));
  assert.ok(readHtml.includes('data-contacto-tab="telefonos"'));
  assert.ok(readHtml.includes('data-contacto-tab="emails"'));
  assert.ok(readHtml.includes('data-action="open-create-telefono"'));
  assert.ok(readHtml.includes('id="startEditContactoBtn"'));
  assert.equal(readHtml.includes('createTelefonoContactoForm'), false);
  assert.equal(readHtml.includes('createEmailContactoForm'), false);
  assert.equal(assertZeroUuidExposure(readHtml).compliant, true);

  const addHtml = renderContactoView({
    profile: ADMIN_PROFILE,
    state: {
      selectedContactoId: null,
      originatingCertId: cert.id,
      activeChildTab: 'telefonos',
      isCreating: true,
      isEditingAttributes: false,
      formDraft: createEmptyContactoFormDraft(cert.id),
    },
    contacto: null,
    certificates: INITIAL_CERTIFICADOS_DETAILED,
  });
  assert.ok(addHtml.includes('Nuevo Contacto'));
  assert.ok(addHtml.includes('id="contactoDetailForm"'));
  assert.ok(addHtml.includes('id="contactoSelectCertificado"'));
  assert.ok(addHtml.includes('id="saveContactoFormBtn"'));
  assert.ok(addHtml.includes('id="cancelEditContactoBtn"'));
  assert.ok(addHtml.indexOf('id="saveContactoFormBtn"') < addHtml.indexOf('id="cancelEditContactoBtn"'));
  // Zone 3 omitted during create mode
  assert.equal(addHtml.includes('data-contacto-tab="telefonos"'), false);
  assert.equal(addHtml.includes('data-contacto-tab="emails"'), false);
  assert.equal(assertZeroUuidExposure(addHtml).compliant, true);

  const workerEditHtml = renderContactoView({
    profile: WORKER_PROFILE,
    state: {
      selectedContactoId: contacto.id,
      activeChildTab: 'emails',
      isEditingAttributes: true,
    },
    contacto,
    certificates: INITIAL_CERTIFICADOS_DETAILED,
  });
  assert.ok(workerEditHtml.includes('id="contactoDetailForm"'));
  assert.ok(workerEditHtml.includes('id="contactoSelectCertificado"'));
  assert.ok(workerEditHtml.includes('id="editContactoNombreInput"'));
  assert.ok(workerEditHtml.includes('id="editContactoCargoInput"'));
  assert.ok(workerEditHtml.includes('id="saveContactoFormBtn"'));
  assert.ok(workerEditHtml.includes('id="cancelEditContactoBtn"'));
  assert.ok(
    workerEditHtml.indexOf('id="saveContactoFormBtn"') <
      workerEditHtml.indexOf('id="cancelEditContactoBtn"')
  );
  assert.ok(workerEditHtml.includes('data-action="open-create-email"'));
  assert.equal(workerEditHtml.includes('createEmailContactoForm'), false);
  assert.equal(workerEditHtml.includes('cancelEditContactoBtnSecondary'), false);
  assert.equal(assertZeroUuidExposure(workerEditHtml).compliant, true);

  const emptyContacto = {
    ...contacto,
    cargo: null,
    telefonos: [],
    emails: [],
  };
  const emptyClientHtml = renderContactoView({
    profile: CLIENT_PROFILE,
    state: {
      selectedContactoId: emptyContacto.id,
      activeChildTab: 'telefonos',
      isEditingAttributes: true,
    },
    contacto: emptyContacto,
    certificates: INITIAL_CERTIFICADOS_DETAILED,
  });
  assert.ok(emptyClientHtml.includes('Sin cargo especificado'));
  assert.ok(emptyClientHtml.includes('Sin teléfonos registrados'));
  assert.equal(emptyClientHtml.includes('id="startEditContactoBtn"'), false);
  assert.equal(emptyClientHtml.includes('id="contactoDetailForm"'), false);
  assert.equal(emptyClientHtml.includes('data-action="open-create-telefono"'), false);
  assert.equal(emptyClientHtml.includes('data-action="open-archive-modal"'), false);
  assert.equal(assertZeroUuidExposure(emptyClientHtml).compliant, true);

  const emptyEmailAuditorHtml = renderContactoView({
    profile: AUDITOR_PROFILE,
    state: {
      selectedContactoId: emptyContacto.id,
      activeChildTab: 'emails',
      isEditingAttributes: false,
    },
    contacto: emptyContacto,
    certificates: INITIAL_CERTIFICADOS_DETAILED,
  });
  assert.ok(emptyEmailAuditorHtml.includes('Sin correos registrados'));
  assert.equal(emptyEmailAuditorHtml.includes('data-action="open-create-email"'), false);
  assert.equal(assertZeroUuidExposure(emptyEmailAuditorHtml).compliant, true);
});

test('renderTelefonoView & renderEmailView: render unified read, add, edit (ADMIN/WORKER) and read-only (CLIENT/AUDITOR) with Zero-UUID', () => {
  const cert = INITIAL_CERTIFICADOS_DETAILED[0];
  const contact = cert.contactos[0];

  const telefono = resolveTelefonoDetailById({
    telefonoId: contact.telefonos[0].id,
    certificates: INITIAL_CERTIFICADOS_DETAILED,
  })!;
  assert.ok(telefono);

  const telRead = renderTelefonoView({
    profile: ADMIN_PROFILE,
    state: { selectedTelefonoId: telefono.id, isEditingAttributes: false },
    telefono,
    certificates: INITIAL_CERTIFICADOS_DETAILED,
  });
  assert.ok(telRead.includes(telefono.telefono));
  assert.ok(telRead.includes('data-parent-type="contacto_certificado"'));
  assert.ok(telRead.includes('id="startEditTelefonoBtn"'));
  assert.ok(telRead.includes('data-action="open-archive-modal"'));
  assert.equal(assertZeroUuidExposure(telRead).compliant, true);

  const telAdd = renderTelefonoView({
    profile: ADMIN_PROFILE,
    state: {
      selectedTelefonoId: null,
      originatingContactoId: contact.id,
      isCreating: true,
      isEditingAttributes: false,
      formDraft: createEmptyTelefonoFormDraft(contact.id),
    },
    telefono: null,
    certificates: INITIAL_CERTIFICADOS_DETAILED,
  });
  assert.ok(telAdd.includes('Nuevo Teléfono'));
  assert.ok(telAdd.includes('id="telefonoDetailForm"'));
  assert.ok(telAdd.includes('id="telefonoSelectContacto"'));
  assert.ok(telAdd.includes('id="saveTelefonoFormBtn"'));
  assert.ok(telAdd.includes('id="cancelEditTelefonoBtn"'));
  assert.ok(telAdd.indexOf('id="saveTelefonoFormBtn"') < telAdd.indexOf('id="cancelEditTelefonoBtn"'));
  assert.ok(telAdd.includes('Otro'));
  assert.equal(assertZeroUuidExposure(telAdd).compliant, true);

  const telEdit = renderTelefonoView({
    profile: WORKER_PROFILE,
    state: { selectedTelefonoId: telefono.id, isEditingAttributes: true },
    telefono,
    certificates: INITIAL_CERTIFICADOS_DETAILED,
  });
  assert.ok(telEdit.includes('id="telefonoDetailForm"'));
  assert.ok(telEdit.includes('id="telefonoSelectContacto"'));
  assert.ok(telEdit.includes('id="editTelefonoInput"'));
  assert.ok(telEdit.includes('id="editTelefonoTipoSelect"'));
  assert.ok(telEdit.includes('id="saveTelefonoFormBtn"'));
  assert.ok(telEdit.includes('id="cancelEditTelefonoBtn"'));
  assert.equal(telEdit.includes('cancelEditTelefonoBtnSecondary'), false);
  assert.equal(assertZeroUuidExposure(telEdit).compliant, true);

  const telClient = renderTelefonoView({
    profile: CLIENT_PROFILE,
    state: { selectedTelefonoId: telefono.id, isCreating: true, isEditingAttributes: true },
    telefono,
    certificates: INITIAL_CERTIFICADOS_DETAILED,
  });
  assert.equal(telClient.includes('id="startEditTelefonoBtn"'), false);
  assert.equal(telClient.includes('id="telefonoDetailForm"'), false);
  assert.equal(telClient.includes('data-action="open-archive-modal"'), false);
  assert.equal(assertZeroUuidExposure(telClient).compliant, true);

  const email = resolveEmailDetailById({
    emailId: contact.emails[0].id,
    certificates: INITIAL_CERTIFICADOS_DETAILED,
  })!;
  assert.ok(email);

  const emailRead = renderEmailView({
    profile: ADMIN_PROFILE,
    state: { selectedEmailId: email.id, isEditingAttributes: false },
    email,
    certificates: INITIAL_CERTIFICADOS_DETAILED,
  });
  assert.ok(emailRead.includes(email.email));
  assert.ok(emailRead.includes('data-parent-type="contacto_certificado"'));
  assert.ok(emailRead.includes('id="startEditEmailBtn"'));
  assert.ok(emailRead.includes('data-action="open-archive-modal"'));
  assert.equal(assertZeroUuidExposure(emailRead).compliant, true);

  const emailAdd = renderEmailView({
    profile: ADMIN_PROFILE,
    state: {
      selectedEmailId: null,
      originatingContactoId: contact.id,
      isCreating: true,
      isEditingAttributes: false,
      formDraft: createEmptyEmailFormDraft(contact.id),
    },
    email: null,
    certificates: INITIAL_CERTIFICADOS_DETAILED,
  });
  assert.ok(emailAdd.includes('Nuevo Correo Electrónico'));
  assert.ok(emailAdd.includes('id="emailDetailForm"'));
  assert.ok(emailAdd.includes('id="emailSelectContacto"'));
  assert.ok(emailAdd.includes('id="saveEmailFormBtn"'));
  assert.ok(emailAdd.includes('id="cancelEditEmailBtn"'));
  assert.ok(emailAdd.indexOf('id="saveEmailFormBtn"') < emailAdd.indexOf('id="cancelEditEmailBtn"'));
  assert.ok(emailAdd.includes('Facturación'));
  assert.ok(emailAdd.includes('Otro'));
  assert.equal(assertZeroUuidExposure(emailAdd).compliant, true);

  const emailEdit = renderEmailView({
    profile: WORKER_PROFILE,
    state: { selectedEmailId: email.id, isEditingAttributes: true },
    email,
    certificates: INITIAL_CERTIFICADOS_DETAILED,
  });
  assert.ok(emailEdit.includes('id="emailDetailForm"'));
  assert.ok(emailEdit.includes('id="emailSelectContacto"'));
  assert.ok(emailEdit.includes('id="editEmailInput"'));
  assert.ok(emailEdit.includes('id="editEmailTipoSelect"'));
  assert.ok(emailEdit.includes('id="saveEmailFormBtn"'));
  assert.ok(emailEdit.includes('id="cancelEditEmailBtn"'));
  assert.equal(emailEdit.includes('cancelEditEmailBtnSecondary'), false);
  assert.equal(assertZeroUuidExposure(emailEdit).compliant, true);

  const emailAuditor = renderEmailView({
    profile: AUDITOR_PROFILE,
    state: { selectedEmailId: email.id, isCreating: true, isEditingAttributes: true },
    email,
    certificates: INITIAL_CERTIFICADOS_DETAILED,
  });
  assert.equal(emailAuditor.includes('id="startEditEmailBtn"'), false);
  assert.equal(emailAuditor.includes('id="emailDetailForm"'), false);
  assert.equal(emailAuditor.includes('data-action="open-archive-modal"'), false);
  assert.equal(assertZeroUuidExposure(emailAuditor).compliant, true);
});

test('renderCertificadoView: exposes staff-only + Nueva Fecha and + Nuevo Contacto in child tabs', () => {
  const cert = INITIAL_CERTIFICADOS_DETAILED[0];

  const fechasStaff = renderCertificadoView({
    profile: WORKER_PROFILE,
    certificates: INITIAL_CERTIFICADOS_DETAILED,
    state: {
      selectedCertId: cert.id,
      activeChildTab: 'fechas',
      query: '',
      selectedStatus: 'ALL',
      selectedStandard: 'ALL',
      selectedSectorIaf: 'ALL',
      viewMode: 'list',
      isEditingAttributes: false,
    },
  });
  assert.ok(fechasStaff.includes('data-action="open-create-fecha"'));
  assert.ok(fechasStaff.includes('Nueva Fecha'));

  const fechasClient = renderCertificadoView({
    profile: CLIENT_PROFILE,
    certificates: INITIAL_CERTIFICADOS_DETAILED,
    state: {
      selectedCertId: cert.id,
      activeChildTab: 'fechas',
      query: '',
      selectedStatus: 'ALL',
      selectedStandard: 'ALL',
      selectedSectorIaf: 'ALL',
      viewMode: 'list',
      isEditingAttributes: false,
    },
  });
  assert.equal(fechasClient.includes('data-action="open-create-fecha"'), false);

  const contactosStaff = renderCertificadoView({
    profile: ADMIN_PROFILE,
    certificates: INITIAL_CERTIFICADOS_DETAILED,
    state: {
      selectedCertId: cert.id,
      activeChildTab: 'contactos',
      query: '',
      selectedStatus: 'ALL',
      selectedStandard: 'ALL',
      selectedSectorIaf: 'ALL',
      viewMode: 'list',
      isEditingAttributes: false,
    },
  });
  assert.ok(contactosStaff.includes('data-action="open-create-contacto"'));
  assert.ok(contactosStaff.includes('Nuevo Contacto'));

  const contactosAuditor = renderCertificadoView({
    profile: AUDITOR_PROFILE,
    certificates: INITIAL_CERTIFICADOS_DETAILED,
    state: {
      selectedCertId: cert.id,
      activeChildTab: 'contactos',
      query: '',
      selectedStatus: 'ALL',
      selectedStandard: 'ALL',
      selectedSectorIaf: 'ALL',
      viewMode: 'list',
      isEditingAttributes: false,
    },
  });
  assert.equal(contactosAuditor.includes('data-action="open-create-contacto"'), false);
});
