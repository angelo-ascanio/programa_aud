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
  canArchiveContacto,
  getEmailTipoVisual,
  getFechaRelativeVigenciaNote,
  getTelefonoTipoVisual,
  resolveContactoDetailById,
  resolveEmailDetailById,
  resolveFechaDetailById,
  resolveTelefonoDetailById,
  translateCertSubEntityDbError,
  validateContactoInput,
  validateEmailInput,
  validateFechaInput,
  validateTelefonoInput,
} from './certificadoSubEntities';
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

  // Non-canonical tipo_fecha rejected
  const invalidTipo = validateFechaInput({
    tipo_fecha: 'Emisión Especial',
    fecha: '2026-06-15',
    existingFechas: [],
  });
  assert.equal(invalidTipo.ok, false);

  // Invalid date formats and impossible calendar dates (e.g., 2025-02-29 / 2025-02-30) rejected
  for (const badDate of ['2026/06/15', '15-06-2026', '2025-02-29', '2025-02-30', '2026-13-01', '']) {
    const res = validateFechaInput({
      tipo_fecha: 'Modificación',
      fecha: badDate,
      existingFechas: [],
    });
    assert.equal(res.ok, false, `Expected invalid date "${badDate}" to be rejected`);
  }

  // Leap year 2024-02-29 accepted
  const leapOk = validateFechaInput({
    tipo_fecha: 'Modificación',
    fecha: '2024-02-29',
    existingFechas: [],
  });
  assert.equal(leapOk.ok, true);

  // Duplicate (tipo_fecha + fecha) rejected unless editing the same record id
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

  // Relative vigencia note helper
  const fixedToday = new Date('2026-01-15T12:00:00Z');
  assert.match(getFechaRelativeVigenciaNote('2026-01-15', 'Otorgamiento', fixedToday), /fecha actual/);
  assert.match(getFechaRelativeVigenciaNote('2026-03-01', 'Vencimiento', fixedToday), /Alerta de renovación/);
  assert.match(getFechaRelativeVigenciaNote('2027-06-01', 'Vencimiento', fixedToday), /Vigencia activa/);
  assert.match(getFechaRelativeVigenciaNote('2025-12-01', 'Vencimiento', fixedToday), /Certificado vencido/);
});

test('certificadoSubEntities: validates contacto_certificado (nombre required, cargo nullable), telefono (default Oficina), and email (default Trabajo)', () => {
  // Contacto validation
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

  // Telefono validation + default 'Oficina'
  assert.deepEqual(CANONICAL_TIPO_TELEFONO_VALUES, ['Oficina', 'Móvil', 'Directo', 'Emergencia']);
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

  // Email validation + default 'Trabajo'
  assert.deepEqual(CANONICAL_TIPO_EMAIL_VALUES, ['Trabajo', 'Personal', 'Notificaciones']);
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

  // Archival guard for contacto_certificado & unique error translation
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
});

test('renderFechaView: renders read, inline edit (ADMIN/WORKER), and read-only (CLIENT/AUDITOR) modes with Zero-UUID', () => {
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
  });
  assert.ok(readHtml.includes('aria-label="Contexto y relaciones superiores"'));
  assert.ok(readHtml.includes('aria-label="Detalle del registro"'));
  assert.ok(readHtml.includes(fecha.fecha));
  assert.ok(readHtml.includes('id="startEditFechaBtn"'));
  assert.ok(readHtml.includes('data-action="open-archive-modal"'));
  assert.equal(assertZeroUuidExposure(readHtml).compliant, true);

  const workerEditHtml = renderFechaView({
    profile: WORKER_PROFILE,
    state: { selectedFechaId: fecha.id, isEditingAttributes: true },
    fecha,
  });
  assert.ok(workerEditHtml.includes('id="editFechaForm"'));
  assert.ok(workerEditHtml.includes('id="editFechaTipoSelect"'));
  assert.ok(workerEditHtml.includes('id="editFechaDateInput"'));
  assert.ok(workerEditHtml.includes('id="cancelEditFechaBtn"'));
  for (const tipo of CANONICAL_TIPO_FECHA_VALUES) {
    assert.ok(workerEditHtml.includes(tipo));
  }
  assert.equal(assertZeroUuidExposure(workerEditHtml).compliant, true);

  for (const viewer of [CLIENT_PROFILE, AUDITOR_PROFILE]) {
    const roHtml = renderFechaView({
      profile: viewer,
      state: { selectedFechaId: fecha.id, isEditingAttributes: true },
      fecha,
    });
    assert.equal(roHtml.includes('id="startEditFechaBtn"'), false);
    assert.equal(roHtml.includes('id="editFechaForm"'), false);
    assert.equal(roHtml.includes('data-action="open-archive-modal"'), false);
    assert.equal(assertZeroUuidExposure(roHtml).compliant, true);
  }
});

test('renderContactoView: renders read, inline edit, read-only, and empty cargo/channels states with Zero-UUID', () => {
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
  });
  assert.ok(readHtml.includes(contacto.nombre));
  assert.ok(readHtml.includes('data-contacto-tab="telefonos"'));
  assert.ok(readHtml.includes('data-contacto-tab="emails"'));
  assert.ok(readHtml.includes('data-action="open-create-telefono"'));
  assert.ok(readHtml.includes('id="startEditContactoBtn"'));
  assert.equal(assertZeroUuidExposure(readHtml).compliant, true);

  const workerEditHtml = renderContactoView({
    profile: WORKER_PROFILE,
    state: {
      selectedContactoId: contacto.id,
      activeChildTab: 'emails',
      isEditingAttributes: true,
      isCreatingEmail: true,
    },
    contacto,
  });
  assert.ok(workerEditHtml.includes('id="editContactoForm"'));
  assert.ok(workerEditHtml.includes('id="editContactoNombreInput"'));
  assert.ok(workerEditHtml.includes('id="editContactoCargoInput"'));
  assert.ok(workerEditHtml.includes('id="createEmailContactoForm"'));
  assert.equal(assertZeroUuidExposure(workerEditHtml).compliant, true);

  // Empty cargo + empty telefonos/emails state + CLIENT read-only mode
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
  });
  assert.ok(emptyClientHtml.includes('Sin cargo especificado'));
  assert.ok(emptyClientHtml.includes('Sin teléfonos registrados'));
  assert.equal(emptyClientHtml.includes('id="startEditContactoBtn"'), false);
  assert.equal(emptyClientHtml.includes('id="editContactoForm"'), false);
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
  });
  assert.ok(emptyEmailAuditorHtml.includes('Sin correos registrados'));
  assert.equal(emptyEmailAuditorHtml.includes('data-action="open-create-email"'), false);
  assert.equal(assertZeroUuidExposure(emptyEmailAuditorHtml).compliant, true);
});

test('renderTelefonoView & renderEmailView: render read, inline edit (ADMIN/WORKER), and read-only (CLIENT/AUDITOR) modes with Zero-UUID', () => {
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
  });
  assert.ok(telRead.includes(telefono.telefono));
  assert.ok(telRead.includes('data-parent-type="contacto_certificado"'));
  assert.ok(telRead.includes('id="startEditTelefonoBtn"'));
  assert.ok(telRead.includes('data-action="open-archive-modal"'));
  assert.equal(assertZeroUuidExposure(telRead).compliant, true);

  const telEdit = renderTelefonoView({
    profile: WORKER_PROFILE,
    state: { selectedTelefonoId: telefono.id, isEditingAttributes: true },
    telefono,
  });
  assert.ok(telEdit.includes('id="editTelefonoForm"'));
  assert.ok(telEdit.includes('id="editTelefonoInput"'));
  assert.ok(telEdit.includes('id="editTelefonoTipoSelect"'));
  assert.equal(assertZeroUuidExposure(telEdit).compliant, true);

  const telClient = renderTelefonoView({
    profile: CLIENT_PROFILE,
    state: { selectedTelefonoId: telefono.id, isEditingAttributes: true },
    telefono,
  });
  assert.equal(telClient.includes('id="startEditTelefonoBtn"'), false);
  assert.equal(telClient.includes('id="editTelefonoForm"'), false);
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
  });
  assert.ok(emailRead.includes(email.email));
  assert.ok(emailRead.includes('data-parent-type="contacto_certificado"'));
  assert.ok(emailRead.includes('id="startEditEmailBtn"'));
  assert.ok(emailRead.includes('data-action="open-archive-modal"'));
  assert.equal(assertZeroUuidExposure(emailRead).compliant, true);

  const emailEdit = renderEmailView({
    profile: WORKER_PROFILE,
    state: { selectedEmailId: email.id, isEditingAttributes: true },
    email,
  });
  assert.ok(emailEdit.includes('id="editEmailForm"'));
  assert.ok(emailEdit.includes('id="editEmailInput"'));
  assert.ok(emailEdit.includes('id="editEmailTipoSelect"'));
  assert.equal(assertZeroUuidExposure(emailEdit).compliant, true);

  const emailAuditor = renderEmailView({
    profile: AUDITOR_PROFILE,
    state: { selectedEmailId: email.id, isEditingAttributes: true },
    email,
  });
  assert.equal(emailAuditor.includes('id="startEditEmailBtn"'), false);
  assert.equal(emailAuditor.includes('id="editEmailForm"'), false);
  assert.equal(emailAuditor.includes('data-action="open-archive-modal"'), false);
  assert.equal(assertZeroUuidExposure(emailAuditor).compliant, true);
});
