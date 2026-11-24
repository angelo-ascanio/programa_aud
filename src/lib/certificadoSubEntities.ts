import { containsRawUuid } from './breadcrumb';
import { translateDatabaseError } from './healthCheck';
import {
  CANONICAL_TIPO_FECHA_VALUES,
  type CertificateShareLinkRef,
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

export const TELEFONO_TIPO_OPTIONS = [
  ...CANONICAL_TIPO_TELEFONO_VALUES,
  'Otro',
] as const;

export const CANONICAL_TIPO_EMAIL_VALUES = [
  'Trabajo',
  'Personal',
  'Notificaciones',
] as const;

export type CanonicalTipoEmail = (typeof CANONICAL_TIPO_EMAIL_VALUES)[number];

export const EMAIL_TIPO_OPTIONS = [
  ...CANONICAL_TIPO_EMAIL_VALUES,
  'Facturación',
  'Otro',
] as const;

export type FechaDetailMode = 'read' | 'add' | 'edit';
export type ContactoDetailMode = 'read' | 'add' | 'edit';
export type TelefonoDetailMode = 'read' | 'add' | 'edit';
export type EmailDetailMode = 'read' | 'add' | 'edit';

export interface FechaFormDraft {
  id_certificado: string;
  tipo_fecha: string;
  fecha: string;
}

export interface ContactoFormDraft {
  id_certificado: string;
  nombre: string;
  cargo: string;
}

export interface TelefonoFormDraft {
  id_contacto: string;
  tipo_telefono: string;
  telefono: string;
}

export interface EmailFormDraft {
  id_contacto: string;
  tipo_email: string;
  email: string;
}

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
  owner_cert_id?: string;
  owner_numero_certificado?: string;
  is_shared_context?: boolean;
  shared_from_cert_label?: string | null;
  shared_targets_count?: number;
  shared_targets?: CertificateShareLinkRef[];
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
  owner_cert_id?: string;
  owner_numero_certificado?: string;
  is_shared_context?: boolean;
  shared_from_cert_label?: string | null;
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
  owner_cert_id?: string;
  owner_numero_certificado?: string;
  is_shared_context?: boolean;
  shared_from_cert_label?: string | null;
}

function orderCertificatesByContext(
  certificates: ReadonlyArray<CertificadoDetailEntity>,
  activeCertContextId?: string | null
): CertificadoDetailEntity[] {
  const cleanContextId = (activeCertContextId || '').trim();
  if (!cleanContextId) {
    return certificates.slice();
  }
  const preferred: CertificadoDetailEntity[] = [];
  const rest: CertificadoDetailEntity[] = [];
  for (const cert of certificates) {
    if (cert.id === cleanContextId) {
      preferred.push(cert);
    } else {
      rest.push(cert);
    }
  }
  return [...preferred, ...rest];
}

function buildContactoSharingMeta(
  match: ContactoCertificadoEntity,
  contextCert: CertificadoDetailEntity,
  certificates: ReadonlyArray<CertificadoDetailEntity>
): {
  owner_cert_id: string;
  owner_numero_certificado?: string;
  is_shared_context: boolean;
  shared_from_cert_label: string | null;
  shared_targets_count: number;
  shared_targets?: CertificateShareLinkRef[];
} {
  const ownerCertId = (match.ownerCertId || match.id_certificado || contextCert.id).trim();
  const ownerCert = certificates.find((c) => c.id === ownerCertId);
  const isSharedContext =
    ownerCertId !== contextCert.id || Boolean(match.sharedFromCertId);
  const sharedTargets = match.sharedTargets ? match.sharedTargets.slice() : undefined;
  return {
    owner_cert_id: ownerCertId,
    owner_numero_certificado: ownerCert?.numero_certificado,
    is_shared_context: isSharedContext,
    shared_from_cert_label:
      match.sharedFromCertLabel ??
      (isSharedContext && ownerCert ? ownerCert.numero_certificado : null),
    shared_targets_count: sharedTargets ? sharedTargets.length : 0,
    shared_targets: sharedTargets,
  };
}

function getCertFechasForVersion(
  cert: CertificadoDetailEntity,
  activeCertVersionId?: string | null
): ReadonlyArray<FechaCertificadoEntity> {
  const verId = (activeCertVersionId || '').trim();
  if (!verId) {
    return cert.fechas || [];
  }
  const matchedSnapshot = (cert.versiones || []).find((v) => v.id === verId);
  if (matchedSnapshot?.fechas) {
    return matchedSnapshot.fechas;
  }
  const certFechas = cert.fechas || [];
  const exact = certFechas.filter((f) => f.id_certificado_version === verId);
  if (exact.length > 0) return exact;
  if (!cert.id_certificado_version || cert.id_certificado_version === verId) {
    return certFechas.filter((f) => !f.id_certificado_version);
  }
  return [];
}

function getCertContactosForVersion(
  cert: CertificadoDetailEntity,
  activeCertVersionId?: string | null
): ReadonlyArray<ContactoCertificadoEntity> {
  const verId = (activeCertVersionId || '').trim();
  if (!verId) {
    return cert.contactos || [];
  }
  const matchedSnapshot = (cert.versiones || []).find((v) => v.id === verId);
  if (matchedSnapshot?.contactos) {
    return matchedSnapshot.contactos;
  }
  const certContactos = cert.contactos || [];
  const exact = certContactos.filter((c) => c.id_certificado_version === verId);
  if (exact.length > 0) return exact;
  if (!cert.id_certificado_version || cert.id_certificado_version === verId) {
    return certContactos;
  }
  return [];
}

export function resolveFechaDetailById(params: {
  fechaId: string;
  certificates: ReadonlyArray<CertificadoDetailEntity>;
  activeCertVersionId?: string | null;
  archivedFechaIds?: ReadonlySet<string>;
}): FechaDetailEntity | null {
  const { fechaId, certificates, activeCertVersionId, archivedFechaIds } = params;
  if (!fechaId || archivedFechaIds?.has(fechaId)) return null;

  for (const cert of certificates) {
    const candidateFechas = getCertFechasForVersion(cert, activeCertVersionId);
    const match = candidateFechas.find((f) => f.id === fechaId);
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
  activeCertContextId?: string | null;
  activeCertVersionId?: string | null;
  archivedContactoIds?: ReadonlySet<string>;
  archivedTelefonoIds?: ReadonlySet<string>;
  archivedEmailIds?: ReadonlySet<string>;
}): ContactoDetailEntity | null {
  const {
    contactoId,
    certificates,
    activeCertContextId,
    activeCertVersionId,
    archivedContactoIds,
    archivedTelefonoIds,
    archivedEmailIds,
  } = params;
  if (!contactoId || archivedContactoIds?.has(contactoId)) return null;

  const orderedCerts = orderCertificatesByContext(certificates, activeCertContextId);
  const hasExplicitContext = Boolean((activeCertContextId || '').trim());

  let fallbackCandidate: {
    cert: CertificadoDetailEntity;
    match: ContactoCertificadoEntity;
  } | null = null;

  for (const cert of orderedCerts) {
    const versionContactos =
      hasExplicitContext && cert.id === activeCertContextId?.trim()
        ? getCertContactosForVersion(cert, activeCertVersionId)
        : cert.contactos || [];
    const match = versionContactos.find((c) => c.id === contactoId);
    if (!match) continue;

    const ownerCertId = (match.ownerCertId || match.id_certificado || cert.id).trim();
    const isOwnerMatch = ownerCertId === cert.id && !match.sharedFromCertId;

    if (hasExplicitContext && cert.id === activeCertContextId?.trim()) {
      const meta = buildContactoSharingMeta(match, cert, certificates);
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
        ...meta,
      };
    }

    if (!hasExplicitContext && isOwnerMatch) {
      const meta = buildContactoSharingMeta(match, cert, certificates);
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
        ...meta,
      };
    }

    if (!fallbackCandidate) {
      fallbackCandidate = { cert, match };
    }
  }

  if (fallbackCandidate) {
    const { cert, match } = fallbackCandidate;
    const meta = buildContactoSharingMeta(match, cert, certificates);
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
      ...meta,
    };
  }

  return null;
}

export function resolveTelefonoDetailById(params: {
  telefonoId: string;
  certificates: ReadonlyArray<CertificadoDetailEntity>;
  activeCertContextId?: string | null;
  activeCertVersionId?: string | null;
  archivedContactoIds?: ReadonlySet<string>;
  archivedTelefonoIds?: ReadonlySet<string>;
}): TelefonoDetailEntity | null {
  const {
    telefonoId,
    certificates,
    activeCertContextId,
    activeCertVersionId,
    archivedContactoIds,
    archivedTelefonoIds,
  } = params;
  if (!telefonoId || archivedTelefonoIds?.has(telefonoId)) return null;

  const orderedCerts = orderCertificatesByContext(certificates, activeCertContextId);
  for (const cert of orderedCerts) {
    const contactos =
      activeCertContextId && cert.id === activeCertContextId.trim()
        ? getCertContactosForVersion(cert, activeCertVersionId)
        : cert.contactos || [];
    for (const contact of contactos) {
      if (archivedContactoIds?.has(contact.id)) continue;
      const match = (contact.telefonos || []).find((t) => t.id === telefonoId);
      if (!match) continue;
      const meta = buildContactoSharingMeta(contact, cert, certificates);
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
        owner_cert_id: meta.owner_cert_id,
        owner_numero_certificado: meta.owner_numero_certificado,
        is_shared_context: meta.is_shared_context,
        shared_from_cert_label: meta.shared_from_cert_label,
      };
    }
  }

  return null;
}

export function resolveEmailDetailById(params: {
  emailId: string;
  certificates: ReadonlyArray<CertificadoDetailEntity>;
  activeCertContextId?: string | null;
  activeCertVersionId?: string | null;
  archivedContactoIds?: ReadonlySet<string>;
  archivedEmailIds?: ReadonlySet<string>;
}): EmailDetailEntity | null {
  const {
    emailId,
    certificates,
    activeCertContextId,
    activeCertVersionId,
    archivedContactoIds,
    archivedEmailIds,
  } = params;
  if (!emailId || archivedEmailIds?.has(emailId)) return null;

  const orderedCerts = orderCertificatesByContext(certificates, activeCertContextId);
  for (const cert of orderedCerts) {
    const contactos =
      activeCertContextId && cert.id === activeCertContextId.trim()
        ? getCertContactosForVersion(cert, activeCertVersionId)
        : cert.contactos || [];
    for (const contact of contactos) {
      if (archivedContactoIds?.has(contact.id)) continue;
      const match = (contact.emails || []).find((em) => em.id === emailId);
      if (!match) continue;
      const meta = buildContactoSharingMeta(contact, cert, certificates);
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
        owner_cert_id: meta.owner_cert_id,
        owner_numero_certificado: meta.owner_numero_certificado,
        is_shared_context: meta.is_shared_context,
        shared_from_cert_label: meta.shared_from_cert_label,
      };
    }
  }

  return null;
}

export function createEmptyFechaFormDraft(certId?: string | null): FechaFormDraft {
  return {
    id_certificado: (certId || '').trim(),
    tipo_fecha: CANONICAL_TIPO_FECHA_VALUES[0],
    fecha: '',
  };
}

export function createFechaFormDraftFromEntity(fecha: FechaDetailEntity): FechaFormDraft {
  return {
    id_certificado: fecha.id_certificado || '',
    tipo_fecha: fecha.tipo_fecha || CANONICAL_TIPO_FECHA_VALUES[0],
    fecha: fecha.fecha || '',
  };
}

export function resolveFechaDetailMode(
  state: { isCreating?: boolean; isEditingAttributes?: boolean },
  isStaff: boolean,
  selectedFecha?: FechaDetailEntity | null
): FechaDetailMode {
  if (!isStaff) return 'read';
  if (state.isCreating) return 'add';
  if (selectedFecha && state.isEditingAttributes) return 'edit';
  return 'read';
}

export function createEmptyContactoFormDraft(certId?: string | null): ContactoFormDraft {
  return {
    id_certificado: (certId || '').trim(),
    nombre: '',
    cargo: '',
  };
}

export function createContactoFormDraftFromEntity(contacto: ContactoDetailEntity): ContactoFormDraft {
  return {
    id_certificado: contacto.id_certificado || '',
    nombre: contacto.nombre || '',
    cargo: contacto.cargo || '',
  };
}

export function resolveContactoDetailMode(
  state: { isCreating?: boolean; isEditingAttributes?: boolean },
  isStaff: boolean,
  selectedContacto?: ContactoDetailEntity | null
): ContactoDetailMode {
  if (!isStaff) return 'read';
  if (state.isCreating) return 'add';
  if (selectedContacto && state.isEditingAttributes) return 'edit';
  return 'read';
}

export function createEmptyTelefonoFormDraft(contactoId?: string | null): TelefonoFormDraft {
  return {
    id_contacto: (contactoId || '').trim(),
    tipo_telefono: 'Oficina',
    telefono: '',
  };
}

export function createTelefonoFormDraftFromEntity(tel: TelefonoDetailEntity): TelefonoFormDraft {
  return {
    id_contacto: tel.id_contacto || '',
    tipo_telefono: tel.tipo_telefono || 'Oficina',
    telefono: tel.telefono || '',
  };
}

export function resolveTelefonoDetailMode(
  state: { isCreating?: boolean; isEditingAttributes?: boolean },
  isStaff: boolean,
  selectedTelefono?: TelefonoDetailEntity | null
): TelefonoDetailMode {
  if (!isStaff) return 'read';
  if (state.isCreating) return 'add';
  if (selectedTelefono && state.isEditingAttributes) return 'edit';
  return 'read';
}

export function createEmptyEmailFormDraft(contactoId?: string | null): EmailFormDraft {
  return {
    id_contacto: (contactoId || '').trim(),
    tipo_email: 'Trabajo',
    email: '',
  };
}

export function createEmailFormDraftFromEntity(em: EmailDetailEntity): EmailFormDraft {
  return {
    id_contacto: em.id_contacto || '',
    tipo_email: em.tipo_email || 'Trabajo',
    email: em.email || '',
  };
}

export function resolveEmailDetailMode(
  state: { isCreating?: boolean; isEditingAttributes?: boolean },
  isStaff: boolean,
  selectedEmail?: EmailDetailEntity | null
): EmailDetailMode {
  if (!isStaff) return 'read';
  if (state.isCreating) return 'add';
  if (selectedEmail && state.isEditingAttributes) return 'edit';
  return 'read';
}

export interface AvailableContactoSelectOption {
  id: string;
  id_certificado: string;
  numero_certificado: string;
  organizacion_nombre: string;
  nombre: string;
  cargo: string | null;
  label: string;
}

/**
 * Returns active contacts scoped to the certificate of `scopedContactoId` (when found),
 * or across all active certificates when no certificate scope applies.
 */
export function getAvailableContactosForChannel(params: {
  certificates: ReadonlyArray<CertificadoDetailEntity>;
  scopedContactoId?: string | null;
  archivedContactoIds?: ReadonlySet<string>;
}): AvailableContactoSelectOption[] {
  const { certificates, scopedContactoId, archivedContactoIds } = params;
  const cleanScopedId = (scopedContactoId || '').trim();
  const scopedCert = cleanScopedId
    ? certificates.find((c) => (c.contactos || []).some((ct) => ct.id === cleanScopedId))
    : undefined;

  const targetCerts = scopedCert ? [scopedCert] : certificates;
  const options: AvailableContactoSelectOption[] = [];

  for (const cert of targetCerts) {
    for (const ct of cert.contactos || []) {
      if (archivedContactoIds?.has(ct.id)) continue;
      const baseLabel = ct.cargo?.trim() ? `${ct.nombre} · ${ct.cargo.trim()}` : ct.nombre;
      const label = scopedCert ? baseLabel : `${baseLabel} (${cert.numero_certificado})`;
      options.push({
        id: ct.id,
        id_certificado: cert.id,
        numero_certificado: cert.numero_certificado,
        organizacion_nombre: cert.organizacion_nombre,
        nombre: ct.nombre,
        cargo: ct.cargo,
        label,
      });
    }
  }

  return options;
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
  if (normalized === 'otro') {
    return {
      label: tipoTelefono.trim() || 'Otro',
      badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
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
  if (normalized === 'facturación' || normalized === 'facturacion') {
    return {
      label: tipoEmail.trim() || 'Facturación',
      badgeClass: 'bg-teal-50 text-teal-800 border-teal-200',
    };
  }
  if (normalized === 'personal' || normalized === 'otro') {
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
  sharedTargetsCount?: number;
  sharedTargets?: ReadonlyArray<CertificateShareLinkRef>;
}): { allowed: boolean; reason?: string } {
  const phoneCount = contacto.telefonos.length;
  const emailCount = contacto.emails.length;
  const sharedCount =
    typeof contacto.sharedTargetsCount === 'number'
      ? Math.max(0, contacto.sharedTargetsCount)
      : contacto.sharedTargets?.length ?? 0;

  if (phoneCount > 0 || emailCount > 0 || sharedCount > 0) {
    const parts: string[] = [];
    if (phoneCount > 0) parts.push(`${phoneCount} teléfono(s)`);
    if (emailCount > 0) parts.push(`${emailCount} correo(s)`);
    if (sharedCount > 0) {
      parts.push(`${sharedCount} compartición(es) activa(s) en conglomerado`);
    }
    return {
      allowed: false,
      reason: `No se puede archivar este contacto porque tiene ${parts.join(' y ')} activo(s). Desvincule o archive primero sus dependencias asociadas.`,
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
    code === 'PGRST204' ||
    code === '42P01' ||
    code === '42703' ||
    msg.includes('could not find the table') ||
    msg.includes('could not find the') ||
    msg.includes('schema cache') ||
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
