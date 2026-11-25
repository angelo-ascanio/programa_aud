import type { ActiveRoute, DomainRoute } from './healthCheck';

export type BreadcrumbEntityType =
  | 'conglomerado'
  | 'vinculo'
  | 'relacion'
  | 'sitio_temporal'
  | 'programa_auditoria_certificado'
  | 'revision_auditoria'
  | 'org'
  | 'acceso_cliente'
  | 'cert'
  | 'sitio'
  | 'proceso'
  | 'turno'
  | 'fecha_certificado'
  | 'contacto_certificado'
  | 'telefono_contacto'
  | 'email_contacto'
  | 'no_aplicable'
  | 'auditor'
  | 'experto_tecnico'
  | 'competencia_auditor'
  | 'programa_auditoria'
  | 'audit'
  | 'sitio_auditoria'
  | 'proceso_sitio'
  | 'norma'
  | 'requisito'
  | 'sector_iaf'
  | 'subsector_iaf'
  | 'organismo_acreditacion'
  | 'accreditation'
  | 'estatus'
  | 'tipo'
  | 'metodologia';

export interface BreadcrumbSegment {
  id: string;
  label: string;
  route: ActiveRoute;
  subview?: string | null;
  entityType?: BreadcrumbEntityType | null;
  entityId?: string | null;
  parentEntityId?: string | null;
  originatingSitioId?: string | null;
  tab?: string | null;
  tooltip?: string;
}

export type CollapsedBreadcrumbItem =
  | { kind: 'segment'; segment: BreadcrumbSegment; index: number }
  | {
      kind: 'ellipsis';
      hiddenSegments: BreadcrumbSegment[];
      backtrackSegmentId: string;
      tooltip: string;
    };

export const MAX_BREADCRUMB_CHAR_LENGTH = 24;
export const MAX_VISIBLE_BREADCRUMBS = 4;

/**
 * Truncates breadcrumb segment labels exceeding 24 characters.
 * Returns truncated string with ellipsis and a flag indicating if truncation happened.
 */
export function truncateBreadcrumbLabel(
  label: string,
  maxLength: number = MAX_BREADCRUMB_CHAR_LENGTH
): { display: string; truncated: boolean } {
  if (!label || label.length <= maxLength) {
    return { display: label || '', truncated: false };
  }
  return {
    display: `${label.slice(0, maxLength - 1).trimEnd()}…`,
    truncated: true,
  };
}

function sanitizeZeroUuidSegmentText(raw: string | null | undefined, fallback: string): string {
  const cleaned = (raw || '').replace(/\s+/g, ' ').trim();
  if (!cleaned || containsRawUuid(cleaned)) {
    return fallback;
  }
  return cleaned;
}

export interface OrganizacionBreadcrumbMetaInput {
  nombre?: string | null;
  abreviacion?: string | null;
  version_actual_numero?: number | null;
  version_numero?: number | null;
  fallbackLabel?: string;
}

export function formatOrganizacionBreadcrumbMeta(
  input: OrganizacionBreadcrumbMetaInput
): { label: string; tooltip: string } {
  const fallback = sanitizeZeroUuidSegmentText(input.fallbackLabel, 'Organización');
  const nombre = sanitizeZeroUuidSegmentText(input.nombre, fallback);
  const abreviacion = sanitizeZeroUuidSegmentText(input.abreviacion, '');
  const rawVersionNum = input.version_actual_numero ?? input.version_numero;
  const versionNum =
    typeof rawVersionNum === 'number' && rawVersionNum > 0
      ? Math.floor(rawVersionNum)
      : null;

  const versionSuffix = versionNum ? ` v${versionNum}` : '';
  let rawLabel = nombre;
  if (abreviacion) {
    const candidate = `${abreviacion}${versionSuffix}`;
    rawLabel =
      candidate.length <= MAX_BREADCRUMB_CHAR_LENGTH
        ? candidate
        : abreviacion;
  } else if (versionSuffix && `${nombre}${versionSuffix}`.length <= MAX_BREADCRUMB_CHAR_LENGTH) {
    rawLabel = `${nombre}${versionSuffix}`;
  }

  const label = truncateBreadcrumbLabel(rawLabel, MAX_BREADCRUMB_CHAR_LENGTH).display || fallback;
  const tooltipParts = ['Certificación > Organización'];
  const titlePart = abreviacion ? `${nombre} (${abreviacion})` : nombre;
  tooltipParts.push(versionNum ? `${titlePart} · v${versionNum}` : titlePart);

  return {
    label,
    tooltip: tooltipParts.join(': '),
  };
}

export interface CertificadoBreadcrumbMetaInput {
  numero_certificado?: string | null;
  version_numero?: number | null;
  organizacion_abreviacion?: string | null;
  contextPrefix?: string;
  fallbackLabel?: string;
}

export function formatCertificadoBreadcrumbMeta(
  input: CertificadoBreadcrumbMetaInput
): { label: string; tooltip: string } {
  const fallback = sanitizeZeroUuidSegmentText(input.fallbackLabel, 'Certificado');
  const numero = sanitizeZeroUuidSegmentText(input.numero_certificado, fallback);
  const abreviacion = sanitizeZeroUuidSegmentText(input.organizacion_abreviacion, '');
  const versionNum =
    typeof input.version_numero === 'number' && input.version_numero > 0
      ? Math.floor(input.version_numero)
      : null;

  const versionSuffix = versionNum ? ` v${versionNum}` : '';
  const candidate =
    versionSuffix && `${numero}${versionSuffix}`.length <= MAX_BREADCRUMB_CHAR_LENGTH
      ? `${numero}${versionSuffix}`
      : numero;

  const label = truncateBreadcrumbLabel(candidate, MAX_BREADCRUMB_CHAR_LENGTH).display || fallback;
  const prefix = sanitizeZeroUuidSegmentText(input.contextPrefix, 'Certificación > Certificado');
  const detailParts = [numero];
  if (abreviacion) detailParts.push(abreviacion);
  if (versionNum) detailParts.push(`v${versionNum}`);

  return {
    label,
    tooltip: `${prefix}: ${detailParts.join(' · ')}`,
  };
}

/**
 * Resolves a human-friendly domain label.
 */
export function getDomainLabel(domain: DomainRoute): string {
  switch (domain) {
    case 'auditorias':
      return 'Auditoría';
    case 'certificacion':
      return 'Certificación';
    case 'extra':
      return 'Extra';
  }
}

/**
 * Resolves human-friendly subview labels for domains.
 */
export function getSubviewLabel(domain: DomainRoute, subview?: string | null): string {
  if (!subview) return getDomainLabel(domain);

  if (
    domain === 'auditorias' &&
    (subview === 'relacion' || subview === 'vinculo' || subview === 'scheduling')
  ) {
    return 'Relación';
  }

  const subviewMap: Record<string, string> = {
    // Auditoría (Block 1 Pipeline)
    calendar: 'Calendario',
    relacion: 'Relación',
    vinculo: 'Vínculo',
    'designacion/relacion': 'Designación · Relación',
    'designacion/tipo': 'Designación · Tipo',
    'designacion/fecha': 'Designación · Fecha',
    'designacion/sitio': 'Designación · Sitio',
    'designacion/temporal': 'Designación · Temporal',
    tiempo: 'Tiempo',
    auditor: 'Auditor',
    asignacion: 'Auditor',
    proceso: 'Proceso',
    programa: 'Proceso',
    turno: 'Turno',
    resultado: 'Resultado',
    revision: 'Revisión',
    resumen: 'Resumen',
    scheduling: 'Relación',
    findings: 'Resultado',

    // Certificación
    conglomerados: 'Conglomerado',
    organizations: 'Organización',
    certificates: 'Certificado',
    auditors: 'Auditor',
    experts: 'Experto',

    // Extra
    standards: 'Norma',
    iaf: 'Sector IAF',
    accreditations: 'Acreditación',
    organismos: 'Organismos de Acreditación',
    estatus: 'Estatus',
    tipos: 'Tipo',
    metodologias: 'Metodología',
  };

  return subviewMap[subview] || subview;
}

/**
 * Creates the initial root breadcrumb for a given domain or route.
 * Always adheres to the Top Header Reset Rule.
 */
export function resetBreadcrumbToDomain(
  route: ActiveRoute,
  subview?: string | null
): BreadcrumbSegment[] {
  if (route === 'dashboard') {
    return [
      {
        id: 'dashboard',
        label: 'Inicio',
        route: 'dashboard',
        tooltip: 'Panel Principal de Certificación',
      },
    ];
  }

  if (route === 'profile') {
    return [
      {
        id: 'profile',
        label: 'Perfil',
        route: 'profile',
        tooltip: 'Perfil de cuenta y preferencias del usuario',
      },
    ];
  }

  if (route === 'approvals') {
    return [
      {
        id: 'approvals',
        label: 'Aprobaciones',
        route: 'approvals',
        tooltip: 'Gestión y aprobación de cuentas de usuario',
      },
    ];
  }

  if (route === 'database') {
    return [
      {
        id: 'database',
        label: 'Estado DB',
        route: 'database',
        tooltip: 'Salud y conectividad de base de datos Supabase',
      },
    ];
  }

  const domain = route as DomainRoute;
  const domainLabel = getDomainLabel(domain);

  if (!subview) {
    return [
      {
        id: `domain-${domain}`,
        label: domainLabel,
        route: domain,
        subview: null,
        tooltip: `Dominio ${domainLabel}`,
      },
    ];
  }

  const subLabel = getSubviewLabel(domain, subview);
  return [
    {
      id: `domain-${domain}`,
      label: domainLabel,
      route: domain,
      subview: null,
      tooltip: `Dominio ${domainLabel}`,
    },
    {
      id: `subview-${domain}-${subview}`,
      label: subLabel,
      route: domain,
      subview,
      tooltip: `${domainLabel} > ${subLabel}`,
    },
  ];
}

export const NEW_CERTIFICADO_BREADCRUMB_ID = 'cert-new';

export interface CreateNewEntityBreadcrumbParams {
  entityType: BreadcrumbEntityType;
  label: string;
  route: ActiveRoute;
  subview: string;
  tooltip?: string;
  parentEntityId?: string;
}

/**
 * Generic factory for creation-mode ("Nuevo ...") breadcrumb segments preserving parent traceability.
 */
export function createNewEntityBreadcrumbSegment(
  params: CreateNewEntityBreadcrumbParams
): BreadcrumbSegment {
  const domainLabel =
    params.route === 'auditorias' || params.route === 'certificacion' || params.route === 'extra'
      ? getDomainLabel(params.route)
      : params.route;

  return {
    id: `${params.entityType}-new`,
    label: params.label,
    route: params.route,
    subview: params.subview,
    entityType: params.entityType,
    entityId: undefined,
    parentEntityId: params.parentEntityId ?? null,
    tooltip: params.tooltip || `${domainLabel} > ${params.label}`,
  };
}

/**
 * Creates the deterministic breadcrumb segment for the Certificado creation route ("Nuevo Certificado").
 */
export function createNewCertificadoBreadcrumbSegment(): BreadcrumbSegment {
  return {
    id: NEW_CERTIFICADO_BREADCRUMB_ID,
    label: 'Nuevo Certificado',
    route: 'certificacion',
    subview: 'certificates',
    entityType: 'cert',
    entityId: null,
    tooltip: 'Certificación > Nuevo Certificado',
  };
}

function normalizeBreadcrumbSegment(segment: BreadcrumbSegment): BreadcrumbSegment {
  const trimmedLabel = (segment.label || '').trim();
  const isNewCertSegment =
    segment.id === NEW_CERTIFICADO_BREADCRUMB_ID ||
    (trimmedLabel.toLowerCase() === 'nuevo certificado' &&
      segment.route === 'certificacion' &&
      (segment.subview ?? 'certificates') === 'certificates' &&
      (segment.entityType ?? 'cert') === 'cert' &&
      segment.entityId == null);

  if (!isNewCertSegment) {
    return segment;
  }

  return {
    ...segment,
    id: NEW_CERTIFICADO_BREADCRUMB_ID,
    label: trimmedLabel || 'Nuevo Certificado',
    route: 'certificacion',
    subview: 'certificates',
    entityType: 'cert',
    entityId: null,
    tooltip: segment.tooltip || 'Certificación > Nuevo Certificado',
  };
}

/**
 * Pushes a new segment onto the breadcrumb trail with composite loop prevention.
 * Two segments represent the same visited node if:
 * - `s.id === segment.id`, OR
 * - `segment.entityId != null && s.entityId === segment.entityId` within the same
 *   `(entityType ?? subview ?? route)` scope.
 * On match, truncates cleanly back to that ancestor and refreshes its metadata.
 */
export function pushBreadcrumb(
  trail: BreadcrumbSegment[],
  segment: BreadcrumbSegment
): BreadcrumbSegment[] {
  const normalizedSegment = normalizeBreadcrumbSegment(segment);

  const existingIdx = trail.findIndex((s) => {
    if (s.id === normalizedSegment.id) return true;
    if (normalizedSegment.entityId != null && s.entityId === normalizedSegment.entityId) {
      const sameEntityType = (s.entityType ?? null) === (normalizedSegment.entityType ?? null);
      const sameViewScope =
        (s.subview ?? s.route) === (normalizedSegment.subview ?? normalizedSegment.route);
      return sameEntityType && sameViewScope;
    }
    return false;
  });

  if (existingIdx >= 0) {
    const updated = [...trail.slice(0, existingIdx + 1)];
    updated[existingIdx] = { ...updated[existingIdx], ...normalizedSegment };
    return updated;
  }

  return [...trail, normalizedSegment];
}

/**
 * Backtracks the trail up to and including the segment with the specified ID.
 */
export function popToBreadcrumb(
  trail: BreadcrumbSegment[],
  segmentId: string
): BreadcrumbSegment[] {
  const targetIdx = trail.findIndex((s) => s.id === segmentId);
  if (targetIdx === -1) {
    return trail;
  }
  return trail.slice(0, targetIdx + 1);
}

/**
 * Pops the current active leaf segment and returns the updated trail plus the
 * immediate parent target segment (used by in-page "← Volver" actions).
 */
export function popToParentBreadcrumb(trail: BreadcrumbSegment[]): {
  trail: BreadcrumbSegment[];
  target: BreadcrumbSegment | null;
} {
  if (!trail || trail.length === 0) {
    return { trail: [], target: null };
  }
  if (trail.length === 1) {
    return { trail, target: trail[0] };
  }
  const nextTrail = trail.slice(0, trail.length - 1);
  return {
    trail: nextTrail,
    target: nextTrail[nextTrail.length - 1] ?? null,
  };
}

/**
 * Collapses long breadcrumb trails (> 4 segments) into:
 * [root (index 0), ellipsis (hidden 1..n-3), penultimate (n-2), active leaf (n-1)].
 * Clicking the ellipsis backtracks to the deepest hidden ancestor (n-3).
 */
export function collapseBreadcrumbForDisplay(
  trail: BreadcrumbSegment[],
  maxVisible: number = MAX_VISIBLE_BREADCRUMBS
): CollapsedBreadcrumbItem[] {
  if (!trail || trail.length === 0) {
    return [];
  }
  if (trail.length <= maxVisible) {
    return trail.map((segment, index) => ({ kind: 'segment', segment, index }));
  }

  const hiddenSegments = trail.slice(1, trail.length - 2);
  const deepestHidden = hiddenSegments[hiddenSegments.length - 1];
  const tooltip = hiddenSegments
    .map((s) => s.tooltip || s.label)
    .filter(Boolean)
    .join(' › ');

  return [
    { kind: 'segment', segment: trail[0], index: 0 },
    {
      kind: 'ellipsis',
      hiddenSegments,
      backtrackSegmentId: deepestHidden.id,
      tooltip,
    },
    { kind: 'segment', segment: trail[trail.length - 2], index: trail.length - 2 },
    { kind: 'segment', segment: trail[trail.length - 1], index: trail.length - 1 },
  ];
}

/**
 * Validates that no raw UUIDs (e.g. 8-4-4-4-12 hex) are exposed as breadcrumb labels.
 */
const UUID_REGEX = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;

export function containsRawUuid(text: string): boolean {
  return UUID_REGEX.test(text);
}

export type AuditDesignacionSubviewId =
  | 'designacion/relacion'
  | 'designacion/tipo'
  | 'designacion/fecha'
  | 'designacion/sitio'
  | 'designacion/temporal';

export type AuditCardDetailSubviewId =
  | AuditDesignacionSubviewId
  | 'tiempo'
  | 'auditor'
  | 'proceso'
  | 'turno'
  | 'resultado'
  | 'revision'
  | 'resumen';

export interface AuditDesignacionSubstepMeta {
  id: AuditDesignacionSubviewId;
  label: string;
  symbol: string;
}

export interface AuditCardPipelineStepMeta {
  stepNumber: number;
  id: string;
  label: string;
  targetSubview: AuditCardDetailSubviewId;
  children?: ReadonlyArray<AuditDesignacionSubstepMeta>;
}

export interface SharedAuditSelection {
  selectedCertId: string | null;
  selectedAuditId: string | null;
}

export interface AuditSelectionCandidate {
  id: string;
  id_certificado: string;
  id_programa_auditoria?: string;
  codigo_auditoria?: string;
  tipo_auditoria?: string;
  tipo_abreviacion?: string | null;
  fecha_inicio?: string | null;
  fecha_reprogramacion?: string | null;
  deleted_at?: string | null;
  latestDate?: {
    tipo_fecha?: string;
    anio?: number | null;
    mes?: number | null;
    fecha_inicio?: string | null;
    fecha_fin?: string | null;
    numero_secuencia?: number;
    deleted_at?: string | null;
  } | null;
  fechas?: ReadonlyArray<{
    tipo_fecha?: string;
    anio?: number | null;
    mes?: number | null;
    fecha_inicio?: string | null;
    fecha_fin?: string | null;
    numero_secuencia?: number;
    deleted_at?: string | null;
  }>;
}

export const AUDIT_DESIGNACION_SUBSTEPS: ReadonlyArray<AuditDesignacionSubstepMeta> = [
  { id: 'designacion/relacion', label: 'Relación', symbol: '🔗' },
  { id: 'designacion/tipo', label: 'Tipo', symbol: '🏷️' },
  { id: 'designacion/fecha', label: 'Fecha', symbol: '📅' },
  { id: 'designacion/sitio', label: 'Sitio', symbol: '📍' },
  { id: 'designacion/temporal', label: 'Temporal', symbol: '⏱️' },
];

export const AUDIT_CARD_PIPELINE_STEPS: ReadonlyArray<AuditCardPipelineStepMeta> = [
  {
    stepNumber: 1,
    id: 'designacion',
    label: 'Designación',
    targetSubview: 'designacion/relacion',
    children: AUDIT_DESIGNACION_SUBSTEPS,
  },
  { stepNumber: 2, id: 'tiempo', label: 'Tiempo', targetSubview: 'tiempo' },
  { stepNumber: 3, id: 'auditor', label: 'Auditor', targetSubview: 'auditor' },
  { stepNumber: 4, id: 'proceso', label: 'Proceso', targetSubview: 'proceso' },
  { stepNumber: 5, id: 'turno', label: 'Turno', targetSubview: 'turno' },
  { stepNumber: 6, id: 'resultado', label: 'Resultado', targetSubview: 'resultado' },
  { stepNumber: 7, id: 'revision', label: 'Revisión', targetSubview: 'revision' },
];

export const AUDIT_CARD_RESUMEN_STEP = {
  id: 'resumen' as const,
  label: 'Resumen',
  symbol: '📑',
  targetSubview: 'resumen' as const,
};

const AUDIT_CARD_ELIGIBLE_SUBVIEWS = new Set<string>([
  'designacion/relacion',
  'designacion/tipo',
  'designacion/fecha',
  'designacion/sitio',
  'designacion/temporal',
  'tiempo',
  'auditor',
  'asignacion',
  'proceso',
  'programa',
  'turno',
  'resultado',
  'revision',
  'resumen',
]);

export function normalizeAuditCardSubview(subview: string | null | undefined): string {
  const raw = (subview || '').trim().toLowerCase();
  if (
    raw === 'relacion' ||
    raw === 'relaciones' ||
    raw === 'scheduling' ||
    raw === 'programacion'
  ) {
    return 'designacion/relacion';
  }
  if (raw === 'asignacion') return 'auditor';
  if (raw === 'programa') return 'proceso';
  if (raw === 'findings' || raw === 'resultados') return 'resultado';
  if (raw === 'designacion') return 'designacion/tipo';
  return raw;
}

/**
 * Pure visibility rule for the Bloque 1 Breadcrumb In-Card:
 * Visible strictly inside Detail Views for steps 1..7 and Resumen when an active
 * certificate/audit record is open. Never shown in Multi Views, Calendario, or legacy Vínculo.
 */
export function isAuditCardBreadcrumbVisible(
  subview: string | null | undefined,
  hasOpenDetailRecord: boolean
): boolean {
  if (!hasOpenDetailRecord) return false;
  const normalized = normalizeAuditCardSubview(subview);
  return AUDIT_CARD_ELIGIBLE_SUBVIEWS.has(normalized);
}

function resolveCandidateEffectiveDateScore(audit: AuditSelectionCandidate): string {
  const activeFechas = (audit.fechas || []).filter((f) => !f.deleted_at);
  if (activeFechas.length > 0) {
    const sorted = activeFechas
      .slice()
      .sort((a, b) => (b.numero_secuencia || 0) - (a.numero_secuencia || 0));
    const latest = sorted[0];
    if (latest?.fecha_inicio) return latest.fecha_inicio;
    if (latest?.anio && latest?.mes) {
      return `${latest.anio}-${String(latest.mes).padStart(2, '0')}-01`;
    }
  }
  return audit.fecha_inicio || '';
}

export function sortAuditsByRecencyDesc<T extends AuditSelectionCandidate>(
  audits: ReadonlyArray<T>
): T[] {
  return audits
    .filter((a) => !a.deleted_at)
    .slice()
    .sort((a, b) => {
      const dateA = resolveCandidateEffectiveDateScore(a);
      const dateB = resolveCandidateEffectiveDateScore(b);
      if (dateA !== dateB) return dateB.localeCompare(dateA);
      return (b.codigo_auditoria || '').localeCompare(a.codigo_auditoria || '');
    });
}

/**
 * Resolves the shared `(selectedCertId, selectedAuditId)` pair for Bloque 1 Detail Views.
 * Preserves the exact selected audit across breadcrumb hops (including older audits),
 * or selects the most recent audit when switching to a certificate without an active audit.
 */
export function resolveSharedAuditSelection<T extends AuditSelectionCandidate>(opts: {
  selectedCertId: string | null;
  selectedAuditId: string | null;
  audits: ReadonlyArray<T>;
  preferredCertId?: string | null;
  preferredAuditId?: string | null;
}): {
  selectedCertId: string | null;
  selectedAuditId: string | null;
  audit: T | null;
  programId: string | null;
} {
  const activeAudits = opts.audits.filter((a) => !a.deleted_at);
  if (activeAudits.length === 0) {
    return {
      selectedCertId: opts.preferredCertId ?? opts.selectedCertId ?? null,
      selectedAuditId: null,
      audit: null,
      programId: null,
    };
  }

  if (opts.preferredAuditId) {
    const direct = activeAudits.find((a) => a.id === opts.preferredAuditId) ?? null;
    if (direct) {
      return {
        selectedCertId: direct.id_certificado || opts.preferredCertId || null,
        selectedAuditId: direct.id,
        audit: direct,
        programId: direct.id_programa_auditoria || null,
      };
    }
  }

  if (opts.preferredCertId) {
    const certChanged = opts.preferredCertId !== opts.selectedCertId;
    if (!certChanged && opts.selectedAuditId) {
      const currentMatch = activeAudits.find(
        (a) => a.id === opts.selectedAuditId && a.id_certificado === opts.preferredCertId
      );
      if (currentMatch) {
        return {
          selectedCertId: currentMatch.id_certificado,
          selectedAuditId: currentMatch.id,
          audit: currentMatch,
          programId: currentMatch.id_programa_auditoria || null,
        };
      }
    }
    const forCert = sortAuditsByRecencyDesc(
      activeAudits.filter((a) => a.id_certificado === opts.preferredCertId)
    );
    const newest = forCert[0] ?? null;
    if (newest) {
      return {
        selectedCertId: newest.id_certificado,
        selectedAuditId: newest.id,
        audit: newest,
        programId: newest.id_programa_auditoria || null,
      };
    }
    return {
      selectedCertId: opts.preferredCertId,
      selectedAuditId: null,
      audit: null,
      programId: null,
    };
  }

  if (opts.selectedAuditId) {
    const existing = activeAudits.find((a) => a.id === opts.selectedAuditId) ?? null;
    if (
      existing &&
      (!opts.selectedCertId || existing.id_certificado === opts.selectedCertId)
    ) {
      return {
        selectedCertId: existing.id_certificado || opts.selectedCertId,
        selectedAuditId: existing.id,
        audit: existing,
        programId: existing.id_programa_auditoria || null,
      };
    }
  }

  if (opts.selectedCertId) {
    const forCert = sortAuditsByRecencyDesc(
      activeAudits.filter((a) => a.id_certificado === opts.selectedCertId)
    );
    const newest = forCert[0] ?? null;
    if (newest) {
      return {
        selectedCertId: newest.id_certificado,
        selectedAuditId: newest.id,
        audit: newest,
        programId: newest.id_programa_auditoria || null,
      };
    }
  }

  return {
    selectedCertId: opts.selectedCertId ?? null,
    selectedAuditId: opts.selectedAuditId ?? null,
    audit: null,
    programId: null,
  };
}

export interface AuditCardBreadcrumbModel {
  visible: boolean;
  activeSubview: string;
  isDesignacionActive: boolean;
  activeDesignacionSubstep: AuditDesignacionSubstepMeta | null;
  steps: ReadonlyArray<{
    stepNumber: number;
    id: string;
    label: string;
    targetSubview: AuditCardDetailSubviewId;
    isActive: boolean;
    children?: ReadonlyArray<AuditDesignacionSubstepMeta & { isActive: boolean }>;
  }>;
  resumenStep: {
    id: 'resumen';
    label: string;
    symbol: string;
    targetSubview: 'resumen';
    isActive: boolean;
  };
  selection: SharedAuditSelection;
}

export function buildAuditCardBreadcrumbModel(
  activeSubview: string,
  hasOpenDetailRecord: boolean,
  selection: SharedAuditSelection
): AuditCardBreadcrumbModel {
  const normalized = normalizeAuditCardSubview(activeSubview);
  const visible = isAuditCardBreadcrumbVisible(normalized, hasOpenDetailRecord);
  const isDesignacionActive = normalized.startsWith('designacion/');
  const activeDesignacionSubstep =
    AUDIT_DESIGNACION_SUBSTEPS.find((s) => s.id === normalized) ?? null;

  return {
    visible,
    activeSubview: normalized,
    isDesignacionActive,
    activeDesignacionSubstep,
    steps: AUDIT_CARD_PIPELINE_STEPS.map((step) => ({
      ...step,
      isActive:
        step.id === 'designacion' ? isDesignacionActive : normalized === step.targetSubview,
      children: step.children?.map((child) => ({
        ...child,
        isActive: normalized === child.id,
      })),
    })),
    resumenStep: {
      ...AUDIT_CARD_RESUMEN_STEP,
      isActive: normalized === 'resumen',
    },
    selection,
  };
}

