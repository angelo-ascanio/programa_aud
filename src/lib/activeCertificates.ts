/**
 * Active Certificate Calculation & Organization Filtering Engine
 * Compliant with ISO/IEC 17021-1:2015 and ISO 19011:2018.
 *
 * ACTIVE CERTIFICATE CALCULATION MANDATE:
 * Certificates with status 'En Espera', 'Cancelado', or 'Inactivo'
 * are strictly EXCLUDED from active certificate metrics.
 * Only operational statuses ('Activo', 'Estudio', 'Planificado', 'En Ejecución') are counted.
 */

import { assertValidUuid } from './zeroUuid';

export interface CertificadoSummary {
  id: string;
  numero_certificado: string;
  id_organizacion?: string;
  organizacion_id?: string;
  organizacion_nombre?: string;
  norma: string;
  esquema?: string;
  estatus: string;
  sector_iaf?: number;
  multisitio?: boolean;
  sitios_count?: number;
  fecha_emision?: string;
  fecha_vencimiento?: string;
  cobertura_porcentaje?: number;
}

export interface OrganizacionEntity {
  id: string;
  id_grupo_empresarial?: string;
  grupo_empresarial_nombre?: string;
  nombre: string;
  rif: string;
  direccion_fiscal?: string;
  contacto_principal?: string;
  correo_contacto?: string;
  telefono_contacto?: string;
  sitio_web?: string;
  grupo_corporativo?: string;
  sector_principal?: string;
  id_sector_iaf?: string;
  sector_iaf_numero?: number;
  estatus?: 'Activo' | 'Inactivo' | 'Estudio' | string;
  certificados_count?: number;
  deleted_at?: string | null;
  deleted_by?: string | null;
  delete_reason?: string | null;
}

export type OrganizacionDetailMode = 'read' | 'add' | 'edit';

export const ORG_NOMBRE_MAX_LENGTH = 200;
export const ORG_RIF_MAX_LENGTH = 50;
export const CLIENT_ACCESS_MOTIVO_MAX_LENGTH = 300;

export interface OrganizacionFormDraft {
  id_grupo_empresarial?: string; // '' permitido en 'add' => crea grupo 1:1 automático en backend/memoria
  nombre: string;
  rif: string;
  direccion_fiscal: string;
}

export type ClientAccessEstado = 'PENDING' | 'APPROVED' | 'REJECTED';
export type ClientAccessDetailMode = 'read' | 'add' | 'edit';

export interface ClientOrganizationAccessEntity {
  id: string;
  id_usuario: string;
  id_organizacion: string;
  usuario_nombre?: string;
  usuario_role?: string;
  organizacion_nombre?: string;
  organizacion_rif?: string;
  estado: ClientAccessEstado;
  aprobado_por?: string | null;
  aprobado_por_nombre?: string | null;
  fecha_solicitud: string;
  fecha_respuesta?: string | null;
  motivo_rechazo?: string | null;
  deleted_at?: string | null;
}

export interface ClientAccessFormDraft {
  id_organizacion: string;
  id_usuario: string;
  estado: ClientAccessEstado;
  motivo_rechazo: string;
}

export function createEmptyOrganizacionFormDraft(): OrganizacionFormDraft {
  return {
    id_grupo_empresarial: '',
    nombre: '',
    rif: '',
    direccion_fiscal: '',
  };
}

export function createOrganizacionDraftFromEntity(
  org: OrganizacionEntity
): OrganizacionFormDraft {
  return {
    id_grupo_empresarial: org.id_grupo_empresarial || '',
    nombre: org.nombre || '',
    rif: org.rif && org.rif !== 'RIF No Registrado' ? org.rif : '',
    direccion_fiscal: org.direccion_fiscal || '',
  };
}

export function createEmptyClientAccessFormDraft(
  prefillOrgId = ''
): ClientAccessFormDraft {
  return {
    id_organizacion: prefillOrgId,
    id_usuario: '',
    estado: 'APPROVED',
    motivo_rechazo: '',
  };
}

export function createClientAccessDraftFromEntity(
  row: ClientOrganizationAccessEntity
): ClientAccessFormDraft {
  return {
    id_organizacion: row.id_organizacion || '',
    id_usuario: row.id_usuario || '',
    estado: row.estado || 'PENDING',
    motivo_rechazo: row.motivo_rechazo || '',
  };
}

/**
 * Normalizes text strings for accent-insensitive and case-insensitive comparison.
 */
export function normalizeText(val: string | null | undefined): string {
  if (!val) return '';
  return val
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/**
 * Checks whether a certificate status represents an operational/active certificate.
 * Strictly EXCLUDES: 'En Espera', 'Cancelado', 'Inactivo' (and case variations / underscores).
 */
export function isActiveCertificateStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  const clean = normalizeText(status).replace(/_/g, ' ');

  // Explicit exclusions per ISO 17021-1 & Phase 4.1 Specification
  if (
    clean === 'en espera' ||
    clean === 'cancelado' ||
    clean === 'inactivo' ||
    clean === 'inactive' ||
    clean === 'cancelled' ||
    clean === 'suspendido' ||
    clean === 'suspended'
  ) {
    return false;
  }

  // Active operational statuses
  return (
    clean === 'activo' ||
    clean === 'active' ||
    clean === 'estudio' ||
    clean === 'en proceso' ||
    clean === 'planificado' ||
    clean === 'en ejecucion' ||
    clean === 'vigente'
  );
}

/**
 * Counts the active certificates for a given organization ID or list.
 * Adheres strictly to the Active Certificate Metric Rule.
 */
export function countActiveCertificates(
  certificates: CertificadoSummary[],
  organizacionId?: string
): number {
  if (!certificates || certificates.length === 0) return 0;

  return certificates.filter((cert) => {
    if (organizacionId) {
      const certOrgId = cert.id_organizacion || cert.organizacion_id;
      if (certOrgId !== organizacionId) {
        return false;
      }
    }
    return isActiveCertificateStatus(cert.estatus);
  }).length;
}

/**
 * Filters and returns certificates associated with an organization that are strictly active.
 */
export function filterActiveCertificates(
  certificates: CertificadoSummary[],
  organizacionId?: string
): CertificadoSummary[] {
  if (!certificates) return [];

  return certificates.filter((cert) => {
    if (organizacionId) {
      const certOrgId = cert.id_organizacion || cert.organizacion_id;
      if (certOrgId !== organizacionId) {
        return false;
      }
    }
    return isActiveCertificateStatus(cert.estatus);
  });
}

/**
 * Returns all certificates associated with an organization regardless of status (for detail child tab).
 */
export function getCertificatesByOrganizacion(
  certificates: CertificadoSummary[],
  organizacionId: string
): CertificadoSummary[] {
  if (!certificates || !organizacionId) return [];
  return certificates.filter((c) => (c.id_organizacion || c.organizacion_id) === organizacionId);
}

/**
 * Validates tax ID format (e.g., Venezuelan RIF or Spanish NIF/CIF).
 * E.g., 'J-12345678-9', 'G-12345678-0', 'B-12345678', 'A-12345678'
 */
export function validateRifFormat(rif: string | null | undefined): {
  valid: boolean;
  message?: string;
} {
  if (!rif || !rif.trim()) {
    return { valid: false, message: 'El RIF o NIF fiscal es obligatorio.' };
  }
  const clean = rif.trim().toUpperCase();
  // Validates common formats like J-30492817-0, V-12345678-9, B-12345678, etc.
  const rifRegex = /^[A-Z]-[0-9]{7,9}-[0-9]$|^[A-Z][0-9]{7,9}[A-Z0-9]?$|^[A-Z]-[0-9]{8}$/i;
  if (!rifRegex.test(clean) && clean.length < 5) {
    return { valid: false, message: 'Formato de RIF / NIF inválido. Ejemplo: J-40192831-2.' };
  }
  return { valid: true };
}

export function validateOrganizacionDraft(
  draft: OrganizacionFormDraft,
  existingOrgs: ReadonlyArray<OrganizacionEntity>,
  excludeId?: string
):
  | { valid: true; normalized: { nombre: string; rif: string; direccion_fiscal: string } }
  | { valid: false; message: string } {
  const nombre = (draft.nombre || '').trim();
  const rifRaw = (draft.rif || '').trim().toUpperCase();
  const direccion_fiscal = (draft.direccion_fiscal || '').trim();

  if (nombre.length < 2) {
    return {
      valid: false,
      message: 'La razón social debe contener al menos 2 caracteres.',
    };
  }
  if (nombre.length > ORG_NOMBRE_MAX_LENGTH) {
    return {
      valid: false,
      message: `La razón social no puede superar los ${ORG_NOMBRE_MAX_LENGTH} caracteres.`,
    };
  }

  if (rifRaw.length > ORG_RIF_MAX_LENGTH) {
    return {
      valid: false,
      message: `El RIF / NIF no puede superar los ${ORG_RIF_MAX_LENGTH} caracteres.`,
    };
  }

  if (rifRaw.length > 0) {
    const rifCheck = validateRifFormat(rifRaw);
    if (!rifCheck.valid) {
      return {
        valid: false,
        message: rifCheck.message || 'Formato de RIF / NIF inválido.',
      };
    }

    const duplicateRif = existingOrgs.some(
      (org) =>
        !org.deleted_at &&
        org.id !== excludeId &&
        (org.rif || '').trim().toUpperCase() === rifRaw
    );
    if (duplicateRif) {
      return {
        valid: false,
        message: 'Ya existe una organización cliente activa registrada con ese RIF / NIF.',
      };
    }
  }

  const duplicateNombre = existingOrgs.some(
    (org) =>
      !org.deleted_at &&
      org.id !== excludeId &&
      normalizeText(org.nombre) === normalizeText(nombre)
  );
  if (duplicateNombre) {
    return {
      valid: false,
      message: 'Ya existe una organización cliente activa con esa razón social.',
    };
  }

  return {
    valid: true,
    normalized: {
      nombre,
      rif: rifRaw,
      direccion_fiscal,
    },
  };
}

export function validateClientAccessDraft(
  draft: ClientAccessFormDraft,
  existingRows: ReadonlyArray<ClientOrganizationAccessEntity>,
  excludeId?: string
):
  | {
      valid: true;
      normalized: {
        id_organizacion: string;
        id_usuario: string;
        estado: ClientAccessEstado;
        motivo_rechazo: string;
      };
    }
  | { valid: false; message: string } {
  let id_organizacion = '';
  let id_usuario = '';
  try {
    id_organizacion = assertValidUuid(draft.id_organizacion, 'identificador de organización');
  } catch {
    return {
      valid: false,
      message: 'Debe seleccionar una organización cliente válida.',
    };
  }

  try {
    id_usuario = assertValidUuid(draft.id_usuario, 'identificador de usuario cliente');
  } catch {
    return {
      valid: false,
      message: 'Debe seleccionar un usuario CLIENT válido.',
    };
  }

  const estado: ClientAccessEstado =
    draft.estado === 'APPROVED' || draft.estado === 'REJECTED' || draft.estado === 'PENDING'
      ? draft.estado
      : 'PENDING';

  const duplicate = existingRows.some(
    (row) =>
      !row.deleted_at &&
      row.id !== excludeId &&
      row.id_organizacion === id_organizacion &&
      row.id_usuario === id_usuario
  );
  if (duplicate) {
    return {
      valid: false,
      message: 'Este usuario cliente ya posee una asignación activa para la organización seleccionada.',
    };
  }

  const motivo_rechazo = (draft.motivo_rechazo || '').trim();
  if (estado === 'REJECTED' && motivo_rechazo.length < 5) {
    return {
      valid: false,
      message: 'Para rechazar el acceso, ingrese un motivo de al menos 5 caracteres (trazabilidad ISO).',
    };
  }

  return {
    valid: true,
    normalized: {
      id_organizacion,
      id_usuario,
      estado,
      motivo_rechazo: estado === 'REJECTED' ? motivo_rechazo.slice(0, CLIENT_ACCESS_MOTIVO_MAX_LENGTH) : '',
    },
  };
}

export interface OrganizacionFilterOptions {
  query?: string;
  hasActiveCertificates?: 'ALL' | 'WITH_ACTIVE' | 'WITHOUT_ACTIVE';
  selectedSectorIaf?: string;
  sortColumn?: 'nombre' | 'rif' | 'certificados_activos' | 'sector' | null;
  sortDirection?: 'asc' | 'desc' | 'none';
}

/**
 * Filters and sorts organizations based on search criteria, sidebar facets, and column sorting.
 */
export function filterOrganizaciones(
  organizaciones: OrganizacionEntity[],
  certificates: CertificadoSummary[],
  options: OrganizacionFilterOptions = {}
): OrganizacionEntity[] {
  const {
    query = '',
    hasActiveCertificates = 'ALL',
    selectedSectorIaf = 'ALL',
    sortColumn = null,
    sortDirection = 'none',
  } = options;

  const cleanQuery = normalizeText(query);

  const filtered = organizaciones.filter((org) => {
    // 1. Text search across legal name, RIF, contact, and address
    if (cleanQuery) {
      const matchName = normalizeText(org.nombre).includes(cleanQuery);
      const matchRif = normalizeText(org.rif).includes(cleanQuery);
      const matchContact = normalizeText(org.contacto_principal).includes(cleanQuery);
      const matchEmail = normalizeText(org.correo_contacto).includes(cleanQuery);
      const matchAddress = normalizeText(org.direccion_fiscal).includes(cleanQuery);
      if (!matchName && !matchRif && !matchContact && !matchEmail && !matchAddress) {
        return false;
      }
    }

    // 2. Facet: Active Certificate Presence
    const activeCount = countActiveCertificates(certificates, org.id);
    if (hasActiveCertificates === 'WITH_ACTIVE' && activeCount === 0) {
      return false;
    }
    if (hasActiveCertificates === 'WITHOUT_ACTIVE' && activeCount > 0) {
      return false;
    }

    // 3. Facet: IAF Sector
    if (selectedSectorIaf && selectedSectorIaf !== 'ALL') {
      const orgSectorStr = String(org.sector_iaf_numero || '');
      const orgSectorText = normalizeText(org.sector_principal || '');
      const targetSector = normalizeText(selectedSectorIaf);
      if (orgSectorStr !== selectedSectorIaf && !orgSectorText.includes(targetSector)) {
        return false;
      }
    }

    return true;
  });

  // Sorting
  if (!sortColumn || sortDirection === 'none') {
    return filtered;
  }

  return [...filtered].sort((a, b) => {
    let comparison = 0;
    if (sortColumn === 'nombre') {
      comparison = a.nombre.localeCompare(b.nombre, 'es');
    } else if (sortColumn === 'rif') {
      comparison = (a.rif || '').localeCompare(b.rif || '', 'es');
    } else if (sortColumn === 'certificados_activos') {
      const countA = countActiveCertificates(certificates, a.id);
      const countB = countActiveCertificates(certificates, b.id);
      comparison = countA - countB;
    } else if (sortColumn === 'sector') {
      comparison = (a.sector_principal || '').localeCompare(b.sector_principal || '', 'es');
    }

    return sortDirection === 'desc' ? -comparison : comparison;
  });
}

/**
 * Formats semantic badge for active certificate counts.
 */
export function formatActiveCertificateBadge(count: number): {
  label: string;
  badgeClass: string;
  symbol: string;
} {
  if (count > 0) {
    return {
      label: count === 1 ? '1 Certificado Activo' : `${count} Certificados Activos`,
      badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
      symbol: '✓',
    };
  }
  return {
    label: 'Sin Certificados Activos',
    badgeClass: 'bg-slate-100 text-slate-600 border-slate-200',
    symbol: '○',
  };
}

/**
 * Seed data matching the canonical database seed from 06_datos_prueba.sql
 */
export const INITIAL_ORGANIZACIONES: OrganizacionEntity[] = [
  {
    id: '30000000-0000-0000-0000-000000000001',
    id_grupo_empresarial: '20000000-0000-0000-0000-000000000001',
    grupo_empresarial_nombre: 'Grupo Industrial Iberometal',
    nombre: 'Iberometal Componentes S.A.',
    rif: 'J-30492817-0',
    direccion_fiscal: 'Zona Industrial Carabobo, Parcela 12, Valencia, Edo. Carabobo',
    contacto_principal: 'Ing. Carlos Mendoza',
    correo_contacto: 'cmendoza@iberometal.com',
    telefono_contacto: '+34 961 882 100',
    sitio_web: 'www.iberometal.es',
    grupo_corporativo: 'Grupo Metalúrgico Ibérico',
    sector_principal: 'Metales básicos y productos metálicos elaborados',
    id_sector_iaf: 'd0000000-0000-0000-0000-000000000017',
    sector_iaf_numero: 17,
    estatus: 'Activo',
    certificados_count: 1,
  },
  {
    id: '30000000-0000-0000-0000-000000000002',
    id_grupo_empresarial: '20000000-0000-0000-0000-000000000002',
    grupo_empresarial_nombre: 'CyberCloud Solutions S.L.',
    nombre: 'CyberCloud Solutions S.L.',
    rif: 'J-40819234-5',
    direccion_fiscal: 'Parque Empresarial Cristalia, Edificio 4B, Madrid',
    contacto_principal: 'Ing. Elena Martínez',
    correo_contacto: 'emartinez@cybercloud.es',
    telefono_contacto: '+34 912 345 678',
    sitio_web: 'www.cybercloud.es',
    grupo_corporativo: 'Independiente',
    sector_principal: 'Tecnología de la información y comunicaciones',
    id_sector_iaf: 'd0000000-0000-0000-0000-000000000033',
    sector_iaf_numero: 33,
    estatus: 'Activo',
    certificados_count: 2,
  },
  {
    id: '30000000-0000-0000-0000-000000000003',
    id_grupo_empresarial: '20000000-0000-0000-0000-000000000001',
    grupo_empresarial_nombre: 'Grupo Industrial Iberometal',
    nombre: 'Petroquímica del Centro C.A.',
    rif: 'J-00291834-1',
    direccion_fiscal: 'Complejo Petroquímico Morón, Vía El Palito, Morón, Edo. Carabobo',
    contacto_principal: 'Dra. Valentina Rivas',
    correo_contacto: 'vrivas@petroquimicacentro.com',
    telefono_contacto: '+34 913 550 200',
    sitio_web: 'www.petroquimicacentro.es',
    grupo_corporativo: 'Consorcio Químico del Caribe',
    sector_principal: 'Productos químicos, fibras sintéticas y farmacéuticos',
    id_sector_iaf: 'd0000000-0000-0000-0000-000000000014',
    sector_iaf_numero: 14,
    estatus: 'Activo',
    certificados_count: 1,
  },
  {
    id: '30000000-0000-0000-0000-000000000004',
    id_grupo_empresarial: '20000000-0000-0000-0000-000000000003',
    grupo_empresarial_nombre: 'BioAlimentos del Sur S.A.',
    nombre: 'BioAlimentos del Sur S.A.',
    rif: 'J-50123987-9',
    direccion_fiscal: 'Polígono Industrial Las Palmeras, Nave 8, Sevilla',
    contacto_principal: 'Lic. Marcos Domínguez',
    correo_contacto: 'mdominguez@bioalimentossur.com',
    telefono_contacto: '+34 954 112 334',
    sitio_web: 'www.bioalimentossur.es',
    grupo_corporativo: 'Independiente',
    sector_principal: 'Productos alimenticios, bebidas y tabaco',
    id_sector_iaf: 'd0000000-0000-0000-0000-000000000003',
    sector_iaf_numero: 3,
    estatus: 'Activo',
    certificados_count: 1,
  },
];
