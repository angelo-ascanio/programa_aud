import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { UserProfile } from './healthCheck';
import { assertZeroUuidExposure } from './zeroUuid';
import { INITIAL_CERTIFICADOS_DETAILED } from './multisiteSampling';
import {
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
  nombre: 'Técnico de Certificación',
  role: 'WORKER',
  status: 'APPROVED',
};

const CLIENT_PROFILE: UserProfile = {
  id: '00000000-0000-0000-0000-000000000004',
  nombre: 'Cliente Observador',
  role: 'CLIENT',
  status: 'APPROVED',
};

describe('Step 3.1: Certificado Sub-Entity Domain & Detail Views', () => {
  it('resolves Fecha, Contacto, Telefono, and Email detail entities and respects archived sets', () => {
    const cert = INITIAL_CERTIFICADOS_DETAILED[0];
    assert.ok(cert.fechas.length > 0);
    assert.ok(cert.contactos.length > 0);

    const firstFecha = cert.fechas[0];
    const resolvedFecha = resolveFechaDetailById({
      fechaId: firstFecha.id,
      certificates: INITIAL_CERTIFICADOS_DETAILED,
    });
    assert.ok(resolvedFecha);
    assert.equal(resolvedFecha.numero_certificado, cert.numero_certificado);
    assert.equal(
      resolveFechaDetailById({
        fechaId: firstFecha.id,
        certificates: INITIAL_CERTIFICADOS_DETAILED,
        archivedFechaIds: new Set([firstFecha.id]),
      }),
      null
    );

    const contact = cert.contactos.find((c) => c.telefonos.length > 0 && c.emails.length > 0)!;
    assert.ok(contact);
    const resolvedContacto = resolveContactoDetailById({
      contactoId: contact.id,
      certificates: INITIAL_CERTIFICADOS_DETAILED,
      archivedTelefonoIds: new Set([contact.telefonos[0].id]),
    });
    assert.ok(resolvedContacto);
    assert.equal(resolvedContacto.telefonos.length, contact.telefonos.length - 1);

    const firstPhone = contact.telefonos[0];
    const resolvedPhone = resolveTelefonoDetailById({
      telefonoId: firstPhone.id,
      certificates: INITIAL_CERTIFICADOS_DETAILED,
    });
    assert.ok(resolvedPhone);
    assert.equal(resolvedPhone.contacto_nombre, contact.nombre);

    const firstEmail = contact.emails[0];
    const resolvedEmail = resolveEmailDetailById({
      emailId: firstEmail.id,
      certificates: INITIAL_CERTIFICADOS_DETAILED,
    });
    assert.ok(resolvedEmail);
    assert.equal(resolvedEmail.contacto_nombre, contact.nombre);
    assert.equal(
      resolveEmailDetailById({
        emailId: firstEmail.id,
        certificates: INITIAL_CERTIFICADOS_DETAILED,
        archivedContactoIds: new Set([contact.id]),
      }),
      null
    );
  });

  it('validates Fecha, Contacto, Telefono, and Email inputs cleanly with duplicate & UUID rejection', () => {
    const cert = INITIAL_CERTIFICADOS_DETAILED[0];
    const existingFecha = cert.fechas[0];

    const invalidTipo = validateFechaInput({
      tipo_fecha: 'Inventado',
      fecha: '2026-11-15',
      existingFechas: cert.fechas,
    });
    assert.equal(invalidTipo.ok, false);

    const invalidDate = validateFechaInput({
      tipo_fecha: 'Otorgamiento',
      fecha: '2026-02-30',
      existingFechas: cert.fechas,
    });
    assert.equal(invalidDate.ok, false);

    const dupFecha = validateFechaInput({
      tipo_fecha: existingFecha.tipo_fecha,
      fecha: existingFecha.fecha,
      existingFechas: cert.fechas,
      currentFechaId: 'other-id',
    });
    assert.equal(dupFecha.ok, false);

    const sameFechaSelf = validateFechaInput({
      tipo_fecha: existingFecha.tipo_fecha,
      fecha: existingFecha.fecha,
      existingFechas: cert.fechas,
      currentFechaId: existingFecha.id,
    });
    assert.equal(sameFechaSelf.ok, true);

    const uuidContacto = validateContactoInput({
      nombre: '40000000-0000-0000-0000-000000000001',
      cargo: '',
      existingContactos: cert.contactos,
    });
    assert.equal(uuidContacto.ok, false);

    const contact = cert.contactos[0];
    const dupContacto = validateContactoInput({
      nombre: contact.nombre.toUpperCase(),
      cargo: 'Gerente',
      existingContactos: cert.contactos,
      currentContactoId: 'other-contacto',
    });
    assert.equal(dupContacto.ok, false);

    const badPhone = validateTelefonoInput({
      telefono: '123',
      tipo_telefono: 'Oficina',
      existingTelefonos: contact.telefonos,
    });
    assert.equal(badPhone.ok, false);

    const okPhone = validateTelefonoInput({
      telefono: '+58 241 9998877',
      tipo_telefono: 'Móvil',
      existingTelefonos: contact.telefonos,
    });
    assert.equal(okPhone.ok, true);

    const badEmail = validateEmailInput({
      email: 'correo-invalido',
      tipo_email: 'Trabajo',
      existingEmails: contact.emails,
    });
    assert.equal(badEmail.ok, false);

    const okEmail = validateEmailInput({
      email: 'calidad@empresa.com',
      tipo_email: 'Notificaciones',
      existingEmails: contact.emails,
    });
    assert.equal(okEmail.ok, true);
  });

  it('computes relative vigencia notes, visual badges, canArchiveContacto, and Spanish 23505 translations', () => {
    const ref = new Date('2026-11-14T12:00:00Z');
    assert.match(getFechaRelativeVigenciaNote('2026-12-14', 'Vencimiento', ref), /Alerta de renovación/);
    assert.match(getFechaRelativeVigenciaNote('2027-06-01', 'Vencimiento', ref), /Vigencia activa/);
    assert.match(getFechaRelativeVigenciaNote('2026-10-01', 'Vencimiento', ref), /vencido hace/);
    assert.match(getFechaRelativeVigenciaNote('2026-11-14', 'Renovación', ref), /fecha actual/);

    assert.equal(getTelefonoTipoVisual('Móvil').label, 'Móvil');
    assert.equal(getEmailTipoVisual('Notificaciones').label, 'Notificaciones');

    const blocked = canArchiveContacto({
      telefonos: [{ id: 't1', id_contacto: 'c1', telefono: '+58 241 8001122', tipo_telefono: 'Oficina' }],
      emails: [],
    });
    assert.equal(blocked.allowed, false);
    assert.match(blocked.reason || '', /1 teléfono/);

    assert.equal(canArchiveContacto({ telefonos: [], emails: [] }).allowed, true);

    const msgFecha = translateCertSubEntityDbError({ code: '23505', message: 'duplicate key' }, 'fecha_certificado');
    assert.match(msgFecha, /mismo tipo de fecha/);
    const msgTel = translateCertSubEntityDbError({ code: '23505', message: 'duplicate key' }, 'telefono_contacto_certificado');
    assert.match(msgTel, /número de teléfono ya se encuentra registrado/);
    const msgEmail = translateCertSubEntityDbError({ code: '23505', message: 'duplicate key' }, 'email_contacto_certificado');
    assert.match(msgEmail, /correo electrónico ya se encuentra/);
  });

  it('renders Fecha, Contacto, Telefono, and Email views cleanly with single-row header, RBAC, Zero-UUID, and no ZONA strings', () => {
    const cert = INITIAL_CERTIFICADOS_DETAILED[0];
    const fecha = resolveFechaDetailById({
      fechaId: cert.fechas[0].id,
      certificates: INITIAL_CERTIFICADOS_DETAILED,
    })!;
    const contactRef = cert.contactos.find((c) => c.telefonos.length > 0 && c.emails.length > 0)!;
    const contacto = resolveContactoDetailById({
      contactoId: contactRef.id,
      certificates: INITIAL_CERTIFICADOS_DETAILED,
    })!;
    const telefono = resolveTelefonoDetailById({
      telefonoId: contactRef.telefonos[0].id,
      certificates: INITIAL_CERTIFICADOS_DETAILED,
    })!;
    const email = resolveEmailDetailById({
      emailId: contactRef.emails[0].id,
      certificates: INITIAL_CERTIFICADOS_DETAILED,
    })!;

    const fechaHtml = renderFechaView({
      profile: ADMIN_PROFILE,
      state: { selectedFechaId: fecha.id, isEditingAttributes: false },
      fecha,
    });
    assert.ok(fechaHtml.includes('id="startEditFechaBtn"'));
    assert.ok(fechaHtml.includes('data-action="open-changelog"'));
    assert.ok(fechaHtml.includes('data-action="open-archive-modal"'));
    assert.ok(fechaHtml.includes('data-parent-type="org"'));
    assert.ok(fechaHtml.includes('data-parent-type="cert"'));
    assert.equal(fechaHtml.includes('ZONA'), false);
    assert.equal(assertZeroUuidExposure(fechaHtml).compliant, true);

    const fechaEditHtml = renderFechaView({
      profile: WORKER_PROFILE,
      state: { selectedFechaId: fecha.id, isEditingAttributes: true },
      fecha,
    });
    assert.ok(fechaEditHtml.includes('id="editFechaForm"'));
    assert.ok(fechaEditHtml.includes('id="cancelEditFechaBtn"'));

    const contactoTelefonosHtml = renderContactoView({
      profile: ADMIN_PROFILE,
      state: {
        selectedContactoId: contacto.id,
        activeChildTab: 'telefonos',
        isEditingAttributes: false,
      },
      contacto,
    });
    assert.ok(contactoTelefonosHtml.includes('data-contacto-tab="telefonos"'));
    assert.ok(contactoTelefonosHtml.includes('data-contacto-tab="emails"'));
    assert.ok(contactoTelefonosHtml.includes('data-resizable-table="contacto-tab-telefonos"'));
    assert.ok(contactoTelefonosHtml.includes('data-action="open-create-telefono"'));
    assert.ok(contactoTelefonosHtml.includes('data-action="select-telefono-detail"'));
    assert.equal(contactoTelefonosHtml.includes('ZONA'), false);
    assert.equal(assertZeroUuidExposure(contactoTelefonosHtml).compliant, true);

    const contactoEmailsHtml = renderContactoView({
      profile: CLIENT_PROFILE,
      state: {
        selectedContactoId: contacto.id,
        activeChildTab: 'emails',
        isEditingAttributes: false,
      },
      contacto,
    });
    assert.ok(contactoEmailsHtml.includes('data-resizable-table="contacto-tab-emails"'));
    assert.ok(contactoEmailsHtml.includes('data-action="select-email-detail"'));
    // Client cannot edit, create, or archive
    assert.equal(contactoEmailsHtml.includes('id="startEditContactoBtn"'), false);
    assert.equal(contactoEmailsHtml.includes('data-action="open-create-email"'), false);
    assert.equal(contactoEmailsHtml.includes('data-action="open-archive-modal"'), false);
    assert.equal(assertZeroUuidExposure(contactoEmailsHtml).compliant, true);

    const telefonoHtml = renderTelefonoView({
      profile: ADMIN_PROFILE,
      state: { selectedTelefonoId: telefono.id, isEditingAttributes: false },
      telefono,
    });
    assert.ok(telefonoHtml.includes('id="startEditTelefonoBtn"'));
    assert.ok(telefonoHtml.includes('data-parent-type="cert"'));
    assert.ok(telefonoHtml.includes('data-parent-type="contacto_certificado"'));
    assert.ok(telefonoHtml.includes('data-action="open-archive-modal"'));
    assert.equal(telefonoHtml.includes('ZONA'), false);
    assert.equal(assertZeroUuidExposure(telefonoHtml).compliant, true);

    const emailHtml = renderEmailView({
      profile: ADMIN_PROFILE,
      state: { selectedEmailId: email.id, isEditingAttributes: false },
      email,
    });
    assert.ok(emailHtml.includes('id="startEditEmailBtn"'));
    assert.ok(emailHtml.includes('data-parent-type="cert"'));
    assert.ok(emailHtml.includes('data-parent-type="contacto_certificado"'));
    assert.ok(emailHtml.includes('data-action="open-archive-modal"'));
    assert.equal(emailHtml.includes('ZONA'), false);
    assert.equal(assertZeroUuidExposure(emailHtml).compliant, true);
  });
});
