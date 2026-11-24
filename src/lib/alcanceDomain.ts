/**
 * Step 2.3 — Pure Domain Engine for Bilingual Certificate `Alcance`
 *
 * Covers:
 * - Single active `public.alcance` record per certificate (`alcance_es` required,
 *   `alcance_en` optional, NO artificial character limits, NO historical text tracking).
 * - Active `Alcance` guard (`hasCertificateActiveAlcance`, `assertCertificateCanGenerateAudits`).
 * - Conflict classification contracts for same-Conglomerado sharing
 *   (`SIN_ALCANCE` | `YA_MISMO_ALCANCE` | `CONFLICTO_EXISTENTE`).
 *
 * Strictly typed (`strict: true`, 0 `any` / `as any`) and Zero-UUID compliant.
 */

import type {
  AlcanceCertificadoEntity,
  AlcanceCertificadoSharedTargetRef,
} from './multisiteSampling';
import { containsRawUuid } from './zeroUuid';

export type {
  AlcanceCertificadoEntity,
  AlcanceCertificadoSharedTargetRef,
};

export interface AlcanceFormDraft {
  alcance_es: string;
  alcance_en?: string | null;
}

export interface AlcanceValidationResult {
  valid: boolean;
  error: string | null;
  normalized: {
    alcance_es: string;
    alcance_en: string | null;
  };
}

export interface CertificateAlcanceRef {
  numero_certificado?: string;
  alcanceDetalle?: AlcanceCertificadoEntity | null;
}

export interface AuditAlcanceGateResult {
  allowed: boolean;
  reason: string | null;
}

export type AlcanceConflictStatus =
  | 'SIN_ALCANCE'
  | 'YA_MISMO_ALCANCE'
  | 'CONFLICTO_EXISTENTE';

export interface AlcanceIncomingScopeSnapshot {
  alcance_es: string;
  alcance_en: string | null;
  sourceCertNumero: string;
}

export interface AlcanceExistingScopeSnapshot {
  alcance_es: string;
  alcance_en: string | null;
  originLabel: string;
}

export interface AlcanceShareConflictItem {
  targetCertId: string;
  targetNumeroCertificado: string;
  targetOrganizacionNombre: string;
  targetIsShared: boolean;
  targetOriginCertNumero: string | null;
  incomingScope: AlcanceIncomingScopeSnapshot;
  existingScope: AlcanceExistingScopeSnapshot;
}

export interface AlcanceShareTargetDecision {
  targetCertId: string;
  targetNumeroCertificado: string;
  targetOrganizacionNombre: string;
  conflictStatus: AlcanceConflictStatus;
  conflict: AlcanceShareConflictItem | null;
}

export interface AlcanceTargetLinkItem {
  targetCertId: string;
  numero_certificado: string;
  organizacion_nombre: string;
  conflictStatus: AlcanceConflictStatus;
}

export interface AlcanceAlreadySharedItem {
  targetCertId: string;
  numero_certificado: string;
  organizacion_nombre: string;
  message: string;
}

export interface VinculoCertAlcanceCandidate {
  id: string;
  numero_certificado?: string;
  organizacion_abreviacion?: string | null;
  deleted_at?: string | null;
  alcanceDetalle?: AlcanceCertificadoEntity | null;
  hasAlcance?: boolean;
}

export interface VinculoMemberAlcanceCandidate {
  id_certificado: string;
  numero_certificado?: string;
  organizacion_abreviacion?: string | null;
  deleted_at?: string | null;
  alcanceDetalle?: AlcanceCertificadoEntity | null;
  hasAlcance?: boolean;
}

const UUID_PATTERN =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

function sanitizeValidationError(message: string): string {
  if (!containsRawUuid(message)) return message;
  return message
    .replace(UUID_PATTERN, 'referencia interna')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Validates and normalizes a bilingual `Alcance` draft (`alcance_es` required,
 * `alcance_en` optional). Trims ONLY outer boundaries while preserving internal
 * line breaks and multi-paragraph structure without any maximum length cap.
 */
export function validateAlcanceDraft(
  draft: AlcanceFormDraft
): AlcanceValidationResult {
  const normalizedEs = (draft.alcance_es ?? '').trim();
  const rawEn = (draft.alcance_en ?? '').trim();
  const normalizedEn = rawEn.length > 0 ? rawEn : null;

  if (normalizedEs.length < 1) {
    return {
      valid: false,
      error: sanitizeValidationError(
        'El Alcance en español es obligatorio (ingrese al menos 1 carácter).'
      ),
      normalized: {
        alcance_es: '',
        alcance_en: normalizedEn,
      },
    };
  }

  return {
    valid: true,
    error: null,
    normalized: {
      alcance_es: normalizedEs,
      alcance_en: normalizedEn,
    },
  };
}

/**
 * Returns `true` strictly when the certificate has an active (non-archived)
 * `alcanceDetalle` record with non-empty `alcance_es`.
 */
export function hasCertificateActiveAlcance(
  cert: CertificateAlcanceRef | null | undefined
): boolean {
  if (!cert || !cert.alcanceDetalle) return false;
  if (cert.alcanceDetalle.deleted_at) return false;
  return (cert.alcanceDetalle.alcance_es || '').trim().length > 0;
}

/**
 * Enforces that a certificate cannot generate audits unless it has an active `Alcance`.
 * Returns a Spanish Zero-UUID reason when missing.
 */
export function assertCertificateCanGenerateAudits(
  cert: CertificateAlcanceRef | null | undefined
): AuditAlcanceGateResult {
  if (hasCertificateActiveAlcance(cert)) {
    return { allowed: true, reason: null };
  }

  const certNumber = (cert?.numero_certificado || '').trim();
  const subject = certNumber
    ? `El certificado ${certNumber}`
    : 'El certificado seleccionado';

  return {
    allowed: false,
    reason: sanitizeValidationError(
      `${subject} no posee un Alcance activo registrado. Registre o comparta un Alcance en español en Certificación → Certificado antes de generar auditorías.`
    ),
  };
}

/**
 * Resolves whether each active certificate inside a `Vínculo` satisfies the active
 * `Alcance` requirement while preserving compatibility for minimal reference objects
 * that omit both `alcanceDetalle` and explicit `hasAlcance`.
 */
export function validateVinculoCertificatesHaveAlcance(
  vinculoCerts: ReadonlyArray<VinculoMemberAlcanceCandidate>,
  certificados?: ReadonlyArray<VinculoCertAlcanceCandidate>
): AuditAlcanceGateResult {
  const activeMembers = vinculoCerts.filter((c) => !c.deleted_at);
  if (activeMembers.length === 0) {
    return { allowed: true, reason: null };
  }

  const certById = new Map<string, VinculoCertAlcanceCandidate>();
  for (const cert of certificados ?? []) {
    if (!cert.deleted_at && cert.id) {
      certById.set(cert.id.trim(), cert);
    }
  }

  const missingCodes: string[] = [];

  for (const member of activeMembers) {
    const certId = (member.id_certificado || '').trim();
    const matched = certId ? certById.get(certId) : undefined;
    let hasAlcance: boolean;

    if (matched) {
      if (typeof matched.hasAlcance === 'boolean') {
        hasAlcance = matched.hasAlcance;
      } else if ('alcanceDetalle' in matched) {
        hasAlcance = hasCertificateActiveAlcance(matched);
      } else if ('alcance' in matched || 'numero_certificado' in matched) {
        hasAlcance = hasCertificateActiveAlcance(matched);
      } else {
        // Minimal WizardCertRef `{ id, id_organizacion }` without scope metadata
        hasAlcance = true;
      }
    } else if (typeof member.hasAlcance === 'boolean') {
      hasAlcance = member.hasAlcance;
    } else if ('alcanceDetalle' in member) {
      hasAlcance = hasCertificateActiveAlcance(member);
    } else {
      // Minimal link ref when full `certificados` list is omitted
      hasAlcance = true;
    }

    if (!hasAlcance) {
      const code =
        (matched?.numero_certificado || member.numero_certificado || '').trim() ||
        'sin código';
      const abrev =
        (matched?.organizacion_abreviacion || member.organizacion_abreviacion || '').trim();
      const label = abrev ? `${code} (${abrev})` : code;
      if (!missingCodes.includes(label)) {
        missingCodes.push(label);
      }
    }
  }

  if (missingCodes.length === 0) {
    return { allowed: true, reason: null };
  }

  if (missingCodes.length === 1) {
    return {
      allowed: false,
      reason: sanitizeValidationError(
        `El certificado ${missingCodes[0]} no posee un Alcance activo registrado. Registre o comparta un Alcance en español en Certificación → Certificado antes de generar auditorías.`
      ),
    };
  }

  return {
    allowed: false,
    reason: sanitizeValidationError(
      `Los certificados ${missingCodes.join(', ')} no poseen un Alcance activo registrado. Registre o comparta un Alcance en español en Certificación → Certificado antes de generar auditorías.`
    ),
  };
}
