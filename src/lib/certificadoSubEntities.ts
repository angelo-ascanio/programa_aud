import { containsRawUuid } from './breadcrumb';
import { translateDatabaseError } from './healthCheck';
import {
  CANONICAL_TIPO_FECHA_VALUES,
  type CertificadoDetailEntity,
  type ContactoCertificadoEntity,
  type EmailContactoEntity,
  type FechaCertificadoEntity,
  type TelefonoContactoEntity,
  type TipoFechaCertificado,
} from './multisiteSampling';

export const CANONICAL_TIPO_TELEFONO_VALUES = [
  'Oficina',
  'Móvil',
  'Directo',
  'Emergencia',
] as const;

export type CanonicalTipoTelefono = (typeof CANONICAL_TIPO_TELEFONO_VALUES)[number];

export const CANONICAL_TIPO_EMAIL_VALUES = [
  'Trabajo',
  'Personal',
  'Notificaciones',
] as const;

export type CanonicalTipoEmail = (typeof CANONICAL_TIPO_EMAIL_VALUES)[number];

export interface FechaDetailEntity {
  id: string;
  id_certificado: string;
  numero_certificado: string;
  norma_codigo: string;
  id_organizacion: string;
  organizacion_nombre: string;
  organizacion_rif: string;
  fecha: string;
  tipo_fecha: TipoFechaCertificado | string;
}

export interface ContactoDetailEntity {
  id: string;
  id_certificado: string;
  numero_certificado: string;
  norma_codigo: string;
  id_organizacion: string;
  organizacion_nombre: string;
  organizacion_rif: string;
  nombre: string;
  cargo: string | null;
  telefonos: TelefonoContactoEntity[];
  emails: EmailContactoEntity[];
}

export interface TelefonoDetailEntity {
  id: string;
  id_contacto: string;
  contacto_nombre: string;
  contacto_cargo: string | null;
  id_certificado: string;
  numero_certificado: string;
  norma_codigo: string;
  id_organizacion: string;
  organizacion_nombre: string;
  telefono: string;
  tipo_telefono: string;
}

export interface EmailDetailEntity {
  id: string;
  id_contacto: string;
  contacto_nombre: string;
  contacto_cargo: string | null;
  id_certificado: string;
  numero_certificado: string;
  norma_codigo: string;
  id_organizacion: string;
  organizacion_nombre: string;
  email: string;
  tipo_email: string;
}

export function resolveFechaDetailById(params: {
  fechaId: string;
  certificates: ReadonlyArray<CertificadoDetailEntity>;
  archivedFechaIds?: ReadonlySet<string>;
}): FechaDetailEntity | null {
  const { fechaId, certificates, archivedFechaIds } = params;
  if (!fechaId || archivedFechaIds?.has(fechaId)) return null;

  for (const cert of certificates) {
    const match = (cert.fechas || []).find((f) => f.id === fechaId);
    if (!match) continue;
    return {
      id: match.id,
      id_certificado: cert.id,
      numero_certificado: cert.numero_certificado,
      norma_codigo: cert.norma_codigo,
      id_organizacion: cert.id_organizacion,
      organizacion_nombre: cert.organizacion_nombre,
      organizacion_rif: cert.organizacion_rif,
      fecha: match.fecha,
      tipo_fecha: match.tipo_fecha,
    };
  }

  return null;
}

export function resolveContactoDetailById(params: {
  contactoId: string;
  certificates: ReadonlyArray<CertificadoDetailEntity>;
  archivedContactoIds?: ReadonlySet<string>;
  archivedTelefonoIds?: ReadonlySet<string>;
  archivedEmailIds?: ReadonlySet<string>;
}): ContactoDetailEntity | null {
  const {
    contactoId,
    certificates,
    archivedContactoIds,
    archivedTelefonoIds,
    archivedEmailIds,
  } = params;
  if (!contactoId || archivedContactoIds?.has(contactoId)) return null;

  for (const cert of certificates) {
    const match = (cert.contactos || []).find((c) => c.id === contactoId);
    if (!match) continue;
    return {
      id: match.id,
      id_certificado: cert.id,
      numero_certificado: cert.numero_certificado,
      norma_codigo: cert.norma_codigo,
      id_organizacion: cert.id_organizacion,
      organizacion_nombre: cert.organizacion_nombre,
      organizacion_rif: cert.organizacion_rif,
      nombre: match.nombre,
      cargo: match.cargo,
      telefonos: (match.telefonos || []).filter(
        (t) => !archivedTelefonoIds?.has(t.id)
      ),
      emails: (match.emails || []).filter(
        (em) => !archivedEmailIds?.has(em.id)
      ),
    };
  }

  return null;
}

export function resolveTelefonoDetailById(params: {
  telefonoId: string;
  certificates: ReadonlyArray<CertificadoDetailEntity>;
  archivedContactoIds?: ReadonlySet<string>;
  archivedTelefonoIds?: ReadonlySet<string>;
}): TelefonoDetailEntity | null {
  const {
    telefonoId,
    certificates,
    archivedContactoIds,
    archivedTelefonoIds,
  } = params;
  if (!telefonoId || archivedTelefonoIds?.has(telefonoId)) return null;

  for (const cert of certificates) {
    for (const contact of cert.contactos || []) {
      if (archivedContactoIds?.has(contact.id)) continue;
      const match = (contact.telefonos || []).find((t) => t.id === telefonoId);
      if (!match) continue;
      return {
        id: match.id,
        id_contacto: contact.id,
        contacto_nombre: contact.nombre,
        contacto_cargo: contact.cargo,
        id_certificado: cert.id,
        numero_certificado: cert.numero_certificado,
        norma_codigo: cert.norma_codigo,
        id_organizacion: cert.id_organizacion,
        organizacion_nombre: cert.organizacion_nombre,
        telefono: match.telefono,
        tipo_telefono: match.tipo_telefono,
      };
    }
  }

  return null;
}

export function resolveEmailDetailById(params: {
  emailId: string;
  certificates: ReadonlyArray<CertificadoDetailEntity>;
  archivedContactoIds?: ReadonlySet<string>;
  archivedEmailIds?: ReadonlySet<string>;
}): EmailDetailEntity | null {
  const {
    emailId,
    certificates,
    archivedContactoIds,
    archivedEmailIds,
  } = params;
  if (!emailId || archivedEmailIds?.has(emailId)) return null;

  for (const cert of certificates) {
    for (const contact of cert.contactos || []) {
      if (archivedContactoIds?.has(contact.id)) continue;
      const match = (contact.emails || []).find((em) => em.id === emailId);
      if (!match) continue;
      return {
        id: match.id,
        id_contacto: contact.id,
        contacto_nombre: contact.nombre,
        contacto_cargo: contact.cargo,
        id_certificado: cert.id,
        numero_certificado: cert.numero_certificado,
        norma_codigo: cert.norma_codigo,
        id_organizacion: cert.id_organizacion,
        organizacion_nombre: cert.organizacion_nombre,
        email: match.email,
        tipo_email: match.tipo_email,
      };
    }
  }

  return null;
}

export function getTelefonoTipoVisual(tipoTelefono: string): {
  label: string;
  badgeClass: string;
} {
  const normalized = (tipoTelefono || '').trim().toLowerCase();
  if (normalized === 'móvil' || normalized === 'movil') {
    return {
      label: tipoTelefono.trim() || 'Móvil',
      badgeClass: 'bg-sky-50 text-sky-800 border-sky-200',
    };
  }
  if (normalized === 'directo') {
    return {
      label: tipoTelefono.trim() || 'Directo',
      badgeClass: 'bg-indigo-50 text-indigo-800 border-indigo-200',
    };
  }
  if (normalized === 'emergencia') {
    return {
      label: tipoTelefono.trim() || 'Emergencia',
      badgeClass: 'bg-rose-50 text-rose-800 border-rose-200',
    };
  }
  return {
    label: tipoTelefono.trim() || 'Oficina',
    badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  };
}

export function getEmailTipoVisual(tipoEmail: string): {
  label: string;
  badgeClass: string;
} {
  const normalized = (tipoEmail || '').trim().toLowerCase();
  if (normalized === 'notificaciones') {
    return {
      label: tipoEmail.trim() || 'Notificaciones',
      badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
    };
  }
  if (normalized === 'personal') {
    return {
      label: tipoEmail.trim() || 'Personal',
      badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
    };
  }
  return {
    label: tipoEmail.trim() || 'Trabajo',
    badgeClass: 'bg-indigo-50 text-indigo-800 border-indigo-200',
  };
}

export function getFechaRelativeVigenciaNote(
  fechaStr: string,
  tipoFecha: TipoFechaCertificado | string,
  referenceDate: Date = new Date()
): string {
  const clean = (fechaStr || '').slice(0, 10);
  const parsedMs = Date.parse(`${clean}T00:00:00Z`);
  if (!Number.isFinite(parsedMs)) {
    return 'Fecha pendiente de validación cronológica.';
  }

  const refIso = referenceDate.toISOString().slice(0, 10);
  const todayMs = Date.parse(`${refIso}T00:00:00Z`);
  const diffDays = Math.round((parsedMs - todayMs) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return `Evento "${tipoFecha}" programado para la fecha actual.`;
  }
  if (diffDays > 0) {
    if (tipoFecha === 'Vencimiento') {
      return diffDays <= 90
        ? `Alerta de renovación: vence en ${diffDays} día(s).`
        : `Vigencia activa: restan ${diffDays} día(s) hasta el vencimiento.`;
    }
    return `Programado dentro de ${diffDays} día(s).`;
  }

  const absDays = Math.abs(diffDays);
  if (tipoFecha === 'Vencimiento') {
    return `Certificado vencido hace ${absDays} día(s).`;
  }
  return `Registrado hace ${absDays} día(s).`;
}

export type SubEntityValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

function isValidIsoCalendarDate(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const [yStr, mStr, dStr] = dateStr.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  const d = Number(dStr);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

export function validateFechaInput(params: {
  tipo_fecha: string;
  fecha: string;
  existingFechas: ReadonlyArray<FechaCertificadoEntity>;
  currentFechaId?: string | null;
}): SubEntityValidationResult<{ tipo_fecha: TipoFechaCertificado; fecha: string }> {
  const tipo = params.tipo_fecha.trim();
  const fecha = params.fecha.trim();

  const validTipo = CANONICAL_TIPO_FECHA_VALUES.find((t) => t === tipo);
  if (!validTipo) {
    return {
      ok: false,
      error: 'Seleccione un tipo de fecha canónico válido para el certificado.',
    };
  }

  if (!isValidIsoCalendarDate(fecha)) {
    return {
      ok: false,
      error: 'Ingrese una fecha calendario válida en formato YYYY-MM-DD.',
    };
  }

  const duplicate = params.existingFechas.some(
    (f) =>
      f.id !== params.currentFechaId &&
      f.tipo_fecha === validTipo &&
      f.fecha === fecha
  );
  if (duplicate) {
    return {
      ok: false,
      error: `Ya existe una fecha de tipo "${validTipo}" registrada el ${fecha} en este certificado.`,
    };
  }

  return {
    ok: true,
    value: { tipo_fecha: validTipo, fecha },
  };
}

export function validateContactoInput(params: {
  nombre: string;
  cargo: string;
  existingContactos: ReadonlyArray<ContactoCertificadoEntity>;
  currentContactoId?: string | null;
}): SubEntityValidationResult<{ nombre: string; cargo: string | null }> {
  const nombre = params.nombre.trim();
  const cargoTrimmed = params.cargo.trim();

  if (nombre.length < 2 || nombre.length > 180) {
    return {
      ok: false,
      error: 'El nombre del contacto debe tener entre 2 y 180 caracteres.',
    };
  }

  if (containsRawUuid(nombre) || (cargoTrimmed && containsRawUuid(cargoTrimmed))) {
    return {
      ok: false,
      error: 'No se permiten identificadores UUID internos en nombre o cargo del contacto.',
    };
  }

  if (cargoTrimmed.length > 150) {
    return {
      ok: false,
      error: 'El cargo del contacto no puede superar los 150 caracteres.',
    };
  }

  const duplicate = params.existingContactos.some(
    (c) =>
      c.id !== params.currentContactoId &&
      c.nombre.trim().toLowerCase() === nombre.toLowerCase()
  );
  if (duplicate) {
    return {
      ok: false,
      error: `Ya existe un contacto registrado llamado "${nombre}" en este certificado.`,
    };
  }

  return {
    ok: true,
    value: {
      nombre,
      cargo: cargoTrimmed || null,
    },
  };
}

export function validateTelefonoInput(params: {
  telefono: string;
  tipo_telefono: string;
  existingTelefonos: ReadonlyArray<TelefonoContactoEntity>;
  currentTelefonoId?: string | null;
}): SubEntityValidationResult<{ telefono: string; tipo_telefono: string }> {
  const telefono = params.telefono.trim();
  const tipo = params.tipo_telefono.trim() || 'Oficina';

  if (containsRawUuid(telefono) || containsRawUuid(tipo)) {
    return {
      ok: false,
      error: 'No se permiten identificadores UUID internos en los datos de teléfono.',
    };
  }

  if (!/^[+\d\s().-]{7,50}$/.test(telefono)) {
    return {
      ok: false,
      error: 'Ingrese un número telefónico válido (entre 7 y 50 caracteres numéricos o símbolos +, -, paréntesis).',
    };
  }

  const digitCount = telefono.replace(/\D/g, '').length;
  if (digitCount < 7) {
    return {
      ok: false,
      error: 'El número telefónico debe contener al menos 7 dígitos.',
    };
  }

  if (tipo.length < 2 || tipo.length > 50) {
    return {
      ok: false,
      error: 'El tipo de teléfono debe tener entre 2 y 50 caracteres.',
    };
  }

  const normalizedPhone = telefono.replace(/\s+/g, '').toLowerCase();
  const duplicate = params.existingTelefonos.some(
    (t) =>
      t.id !== params.currentTelefonoId &&
      t.telefono.replace(/\s+/g, '').toLowerCase() === normalizedPhone
  );
  if (duplicate) {
    return {
      ok: false,
      error: `El teléfono "${telefono}" ya está registrado para este contacto.`,
    };
  }

  return {
    ok: true,
    value: { telefono, tipo_telefono: tipo },
  };
}

export function validateEmailInput(params: {
  email: string;
  tipo_email: string;
  existingEmails: ReadonlyArray<EmailContactoEntity>;
  currentEmailId?: string | null;
}): SubEntityValidationResult<{ email: string; tipo_email: string }> {
  const email = params.email.trim();
  const tipo = params.tipo_email.trim() || 'Trabajo';

  if (containsRawUuid(email) || containsRawUuid(tipo)) {
    return {
      ok: false,
      error: 'No se permiten identificadores UUID internos en los datos de correo.',
    };
  }

  if (
    email.length > 200 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)
  ) {
    return {
      ok: false,
      error: 'Ingrese una dirección de correo electrónico válida (ej. nombre@empresa.com).',
    };
  }

  if (tipo.length < 2 || tipo.length > 50) {
    return {
      ok: false,
      error: 'El tipo de correo debe tener entre 2 y 50 caracteres.',
    };
  }

  const duplicate = params.existingEmails.some(
    (em) =>
      em.id !== params.currentEmailId &&
      em.email.trim().toLowerCase() === email.toLowerCase()
  );
  if (duplicate) {
    return {
      ok: false,
      error: `El correo "${email}" ya está registrado para este contacto.`,
    };
  }

  return {
    ok: true,
    value: { email, tipo_email: tipo },
  };
}

export function canArchiveContacto(contacto: {
  telefonos: ReadonlyArray<TelefonoContactoEntity>;
  emails: ReadonlyArray<EmailContactoEntity>;
}): { allowed: boolean; reason?: string } {
  const phoneCount = contacto.telefonos.length;
  const emailCount = contacto.emails.length;
  if (phoneCount > 0 || emailCount > 0) {
    const parts: string[] = [];
    if (phoneCount > 0) parts.push(`${phoneCount} teléfono(s)`);
    if (emailCount > 0) parts.push(`${emailCount} correo(s)`);
    return {
      allowed: false,
      reason: `No se puede archivar este contacto porque tiene ${parts.join(' y ')} activo(s). Archive primero sus canales asociados.`,
    };
  }
  return { allowed: true };
}

export type CertSubEntityTable =
  | 'requisitos_no_aplicables_certificado'
  | 'fecha_certificado'
  | 'contacto_certificado'
  | 'telefono_contacto_certificado'
  | 'email_contacto_certificado';

export function isUniqueConstraintError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const obj = err as { code?: string; message?: string };
  const code = String(obj.code || '');
  const msg = String(obj.message || '').toLowerCase();
  return (
    code === '23505' ||
    msg.includes('duplicate key') ||
    msg.includes('unique constraint')
  );
}

export function isMissingTableOrSchemaError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const obj = err as { code?: string; message?: string };
  const code = String(obj.code || '');
  const msg = String(obj.message || '').toLowerCase();
  return (
    code === 'PGRST205' ||
    code === '42P01' ||
    msg.includes('could not find the table') ||
    msg.includes('does not exist')
  );
}

export function translateCertSubEntityDbError(
  err: unknown,
  tableName: CertSubEntityTable
): string {
  if (isUniqueConstraintError(err)) {
    switch (tableName) {
      case 'requisitos_no_aplicables_certificado':
        return 'Esta cláusula normativa ya se encuentra declarada como no aplicable para este certificado.';
      case 'fecha_certificado':
        return 'Ya existe un registro activo con el mismo tipo de fecha y fecha exacta en este certificado.';
      case 'contacto_certificado':
        return 'Ya existe un contacto activo con ese nombre completo en este certificado.';
      case 'telefono_contacto_certificado':
        return 'Este número de teléfono ya se encuentra registrado activamente para este contacto.';
      case 'email_contacto_certificado':
        return 'Esta dirección de correo electrónico ya se encuentra registrada activamente para este contacto.';
    }
  }
  return translateDatabaseError(err);
}
