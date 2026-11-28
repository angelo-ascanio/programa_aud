import {
  canAccessRoute,
  type ActiveRoute,
  type DomainRoute,
  type UserProfile,
} from './healthCheck';
import type { ProgramacionAuditEntity, Phase5FindingEntity } from './auditExecution';
import type { ProgramaAuditoriaEntity } from './auditPlanningEngine';
import type { CertificateRecord } from './searchControls';
import type { CertificadoDetailEntity } from './multisiteSampling';
import { countActiveCertificates, type CertificadoSummary, type OrganizacionEntity } from './activeCertificates';
import type { AcreditacionNormaIaf } from './extraDomain';
import type { FindingRecord } from './auditDomain';
import type { AuditRecord } from '../views/auditoriasView';
import type { OrganizationRecord } from '../views/certificacionView';

/**
 * Checks whether the profile is an APPROVED staff member (ADMIN or WORKER).
 */
export function isApprovedStaffProfile(
  profile: UserProfile | null | undefined
): boolean {
  if (!profile || profile.status !== 'APPROVED') return false;
  return profile.role === 'ADMIN' || profile.role === 'WORKER';
}

/**
 * Only APPROVED ADMIN and WORKER staff may plan, reschedule, assign teams, or edit multisite sampling.
 */
export function canEditAuditScheduleOrTeam(
  profile: UserProfile | null | undefined
): boolean {
  return isApprovedStaffProfile(profile);
}

/**
 * Determines whether a user can mutate audit execution artifacts
 * (findings, normative verification checklist, and ISO 17021-1 recommendations)
 * for a given audit.
 * - ADMIN / WORKER: full write access
 * - AUDITOR: strictly restricted to audits where they are assigned in equipo_auditor or auditor_lider
 * - CLIENT / PENDING / REJECTED: strictly read-only / denied
 */
export function isAuditorAssignedToAudit(
  audit: ProgramacionAuditEntity | null | undefined,
  auditorId: string | null | undefined
): boolean {
  if (!audit || !auditorId) return false;
  if (audit.auditor_lider_id === auditorId) return true;
  if (audit.equipo.some((member) => member.id_auditor === auditorId)) return true;
  if (
    Array.isArray(audit.sitiosPlan) &&
    audit.sitiosPlan.some(
      (site) =>
        !site.deleted_at &&
        Array.isArray(site.equipoSitio) &&
        site.equipoSitio.some((member) => !member.deleted_at && member.id_auditor === auditorId)
    )
  ) {
    return true;
  }
  return false;
}

export function canMutateAuditExecution(
  audit: ProgramacionAuditEntity | null | undefined,
  profile: UserProfile | null | undefined
): boolean {
  if (!profile || profile.status !== 'APPROVED') return false;
  if (!audit) return false;
  if (profile.role === 'ADMIN' || profile.role === 'WORKER') return true;
  if (profile.role === 'AUDITOR') {
    return isAuditorAssignedToAudit(audit, profile.id);
  }
  return false;
}

/**
 * Checks whether a user profile is authorized by RLS rules to inspect forensic
 * entries in public.audit_log for a given table and record.
 * - ADMIN / WORKER: authorized for all tables
 * - AUDITOR: authorized only for 'auditoria' and 'hallazgo' on assigned audits
 * - CLIENT / PENDING / REJECTED: denied
 */
export function canViewAuditLogForEntity(
  profile: UserProfile | null | undefined,
  tableName: string,
  recordId: string,
  scopedAudits: ProgramacionAuditEntity[] = [],
  scopedFindings: Phase5FindingEntity[] = []
): boolean {
  if (!profile || profile.status !== 'APPROVED') return false;
  if (profile.role === 'ADMIN' || profile.role === 'WORKER') return true;
  if (profile.role === 'AUDITOR') {
    if (tableName === 'auditoria') {
      if (!recordId) return scopedAudits.length > 0;
      return scopedAudits.some((a) => a.id === recordId && canMutateAuditExecution(a, profile));
    }
    if (tableName === 'hallazgo') {
      if (!recordId) return scopedAudits.length > 0;
      const isAssignedAuditId = scopedAudits.some(
        (a) => a.id === recordId && canMutateAuditExecution(a, profile)
      );
      if (isAssignedAuditId) return true;
      const finding = scopedFindings.find((f) => f.id === recordId);
      if (!finding) return false;
      return scopedAudits.some(
        (a) => a.id === finding.id_auditoria && canMutateAuditExecution(a, profile)
      );
    }
    return false;
  }
  return false;
}

/**
 * Scopes Phase 5 Programación audits according to role-based RLS boundaries.
 */
export function scopeProgramacionAuditsForProfile(
  audits: ProgramacionAuditEntity[],
  profile: UserProfile | null | undefined,
  authorizedClientOrgIds: string[]
): ProgramacionAuditEntity[] {
  if (!profile || profile.status !== 'APPROVED') return [];
  if (isApprovedStaffProfile(profile)) return audits;

  if (profile.role === 'AUDITOR') {
    return audits.filter((a) => isAuditorAssignedToAudit(a, profile.id));
  }

  if (profile.role === 'CLIENT') {
    const allowedOrgIds = new Set(authorizedClientOrgIds);
    return audits.filter((a) => allowedOrgIds.has(a.id_organizacion));
  }

  return [];
}

/**
 * Scopes audit campaigns (`ProgramaAuditoriaEntity`) respecting Level 2 `CLIENT`
 * cross-organization isolation and `AUDITOR` assignment visibility.
 */
export function scopeAuditProgramsForProfile(
  programs: ReadonlyArray<ProgramaAuditoriaEntity>,
  profile: UserProfile | null | undefined,
  scopedAudits: ReadonlyArray<ProgramacionAuditEntity>
): ProgramaAuditoriaEntity[] {
  if (!profile || profile.status !== 'APPROVED') return [];
  const activePrograms = programs.filter((p) => !p.deleted_at);
  if (isApprovedStaffProfile(profile)) return activePrograms;

  const allowedAuditIds = new Set(scopedAudits.map((a) => a.id));
  const result: ProgramaAuditoriaEntity[] = [];
  for (const program of activePrograms) {
    const visibleAudits = (program.auditorias || []).filter(
      (a) => !a.deleted_at && allowedAuditIds.has(a.id)
    );
    if (visibleAudits.length > 0) {
      result.push({
        ...program,
        auditorias: visibleAudits,
      });
    }
  }
  return result;
}

/**
 * Scopes Phase 5 findings to the audits visible to the current profile.
 */
export function scopePhase5FindingsForProfile(
  findings: Phase5FindingEntity[],
  scopedAudits: ProgramacionAuditEntity[],
  profile: UserProfile | null | undefined
): Phase5FindingEntity[] {
  if (!profile || profile.status !== 'APPROVED') return [];
  if (isApprovedStaffProfile(profile)) return findings;

  const allowedAuditIds = new Set(scopedAudits.map((a) => a.id));
  return findings.filter((f) => allowedAuditIds.has(f.id_auditoria));
}

/**
 * Scopes summary certificate records (Dashboard / Exploration / Certificación list).
 */
export function scopeCertificateRecordsForProfile(
  records: CertificateRecord[],
  profile: UserProfile | null | undefined,
  authorizedClientOrgIds: string[],
  scopedAudits: ProgramacionAuditEntity[]
): CertificateRecord[] {
  if (!profile || profile.status !== 'APPROVED') return [];
  if (isApprovedStaffProfile(profile)) return records;

  if (profile.role === 'AUDITOR') {
    const allowedCertIds = new Set(scopedAudits.map((a) => a.id_certificado));
    const allowedCertNums = new Set(scopedAudits.map((a) => a.numero_certificado));
    return records.filter(
      (r) => allowedCertIds.has(r.id) || allowedCertNums.has(r.numero_certificado)
    );
  }

  if (profile.role === 'CLIENT') {
    const allowedOrgIds = new Set(authorizedClientOrgIds);
    const allowedCertIds = new Set(scopedAudits.map((a) => a.id_certificado));
    return records.filter(
      (r) =>
        (r.organizacion_id && allowedOrgIds.has(r.organizacion_id)) ||
        allowedCertIds.has(r.id)
    );
  }

  return [];
}

/**
 * Scopes detailed multisite certificates (Certificado 4-Zone Detail View).
 */
export function scopeDetailedCertsForProfile(
  certs: CertificadoDetailEntity[],
  profile: UserProfile | null | undefined,
  authorizedClientOrgIds: string[],
  scopedAudits: ProgramacionAuditEntity[]
): CertificadoDetailEntity[] {
  if (!profile || profile.status !== 'APPROVED') return [];
  if (isApprovedStaffProfile(profile)) return certs;

  if (profile.role === 'AUDITOR') {
    const allowedCertIds = new Set(scopedAudits.map((a) => a.id_certificado));
    const allowedCertNums = new Set(scopedAudits.map((a) => a.numero_certificado));
    return certs.filter(
      (c) => allowedCertIds.has(c.id) || allowedCertNums.has(c.numero_certificado)
    );
  }

  if (profile.role === 'CLIENT') {
    const allowedOrgIds = new Set(authorizedClientOrgIds);
    return certs.filter((c) => allowedOrgIds.has(c.id_organizacion));
  }

  return [];
}

/**
 * Scopes OrganizacionEntity list for Certificación -> Organizaciones.
 */
export function scopeOrganizacionEntitiesForProfile(
  orgs: OrganizacionEntity[],
  profile: UserProfile | null | undefined,
  authorizedClientOrgIds: string[],
  scopedAudits: ProgramacionAuditEntity[]
): OrganizacionEntity[] {
  if (!profile || profile.status !== 'APPROVED') return [];
  if (isApprovedStaffProfile(profile)) return orgs;

  if (profile.role === 'AUDITOR') {
    const allowedOrgIds = new Set(scopedAudits.map((a) => a.id_organizacion));
    const allowedOrgNames = new Set(scopedAudits.map((a) => a.organizacion_nombre));
    return orgs.filter(
      (o) => allowedOrgIds.has(o.id) || allowedOrgNames.has(o.nombre)
    );
  }

  if (profile.role === 'CLIENT') {
    const allowedOrgIds = new Set(authorizedClientOrgIds);
    return orgs.filter((o) => allowedOrgIds.has(o.id));
  }

  return [];
}

/**
 * Scopes OrganizationRecord list for Drill-Down and legacy summaries.
 */
export function scopeOrganizationsForProfile(
  orgs: OrganizationRecord[],
  profile: UserProfile | null | undefined,
  authorizedClientOrgIds: string[],
  scopedAudits: ProgramacionAuditEntity[],
  scopedCerts: CertificateRecord[]
): OrganizationRecord[] {
  if (!profile || profile.status !== 'APPROVED') return [];
  if (isApprovedStaffProfile(profile)) return orgs;

  if (profile.role === 'AUDITOR') {
    const allowedOrgIds = new Set<string>([
      ...scopedAudits.map((a) => a.id_organizacion),
      ...scopedCerts
        .map((c) => c.organizacion_id)
        .filter((id): id is string => Boolean(id)),
    ]);
    const allowedOrgNames = new Set<string>([
      ...scopedAudits.map((a) => a.organizacion_nombre),
      ...scopedCerts.map((c) => c.organizacion_nombre),
    ]);
    return orgs.filter(
      (o) => allowedOrgIds.has(o.id) || allowedOrgNames.has(o.nombre)
    );
  }

  if (profile.role === 'CLIENT') {
    const allowedOrgIds = new Set(authorizedClientOrgIds);
    const allowedOrgNames = new Set(scopedCerts.map((c) => c.organizacion_nombre));
    return orgs.filter(
      (o) => allowedOrgIds.has(o.id) || allowedOrgNames.has(o.nombre)
    );
  }

  return [];
}

/**
 * Scopes legacy AuditRecord entries for Drill-Down.
 */
export function scopeLegacyAuditsForProfile(
  audits: AuditRecord[],
  profile: UserProfile | null | undefined,
  scopedAudits: ProgramacionAuditEntity[],
  scopedCerts: CertificateRecord[]
): AuditRecord[] {
  if (!profile || profile.status !== 'APPROVED') return [];
  if (isApprovedStaffProfile(profile)) return audits;

  const allowedAuditIds = new Set(scopedAudits.map((a) => a.id));
  const allowedCertIds = new Set(scopedCerts.map((c) => c.id));
  const allowedCertNums = new Set(scopedCerts.map((c) => c.numero_certificado));

  return audits.filter(
    (a) =>
      allowedAuditIds.has(a.id) ||
      (a.id_certificado && allowedCertIds.has(a.id_certificado)) ||
      allowedCertNums.has(a.numero_certificado)
  );
}

/**
 * Scopes legacy FindingRecord entries for Drill-Down.
 */
export function scopeLegacyFindingsForProfile(
  findings: FindingRecord[],
  scopedLegacyAudits: AuditRecord[],
  scopedCerts: CertificateRecord[],
  profile: UserProfile | null | undefined
): FindingRecord[] {
  if (!profile || profile.status !== 'APPROVED') return [];
  if (isApprovedStaffProfile(profile)) return findings;

  const allowedAuditIds = new Set(scopedLegacyAudits.map((a) => a.id));
  const allowedCertNums = new Set(scopedCerts.map((c) => c.numero_certificado));

  return findings.filter(
    (f) =>
      allowedAuditIds.has(f.id_auditoria) ||
      (f.numero_certificado && allowedCertNums.has(f.numero_certificado))
  );
}

/**
 * Scopes SiteRecord or ProcessRecord lists by the visible certificates.
 */
export function scopeSitesOrProcessesForCertificates<
  T extends { numero_certificado: string }
>(
  items: T[],
  scopedCerts: CertificateRecord[],
  profile: UserProfile | null | undefined
): T[] {
  if (!profile || profile.status !== 'APPROVED') return [];
  if (isApprovedStaffProfile(profile)) return items;

  const allowedCertNums = new Set(scopedCerts.map((c) => c.numero_certificado));
  return items.filter((item) => allowedCertNums.has(item.numero_certificado));
}

export const VALID_DOMAIN_SUBVIEWS: Record<DomainRoute, readonly string[]> = {
  auditorias: [
    'calendar',
    'designacion/relacion',
    'designacion/tipo',
    'designacion/fecha',
    'designacion/sitio',
    'designacion/temporal',
    'tiempo',
    'auditor',
    'proceso',
    'turno',
    'resultado',
    'revision',
    'resumen',
  ],
  certificacion: ['conglomerados', 'organizations', 'certificates', 'vinculo', 'auditors', 'experts'],
  extra: ['standards', 'iaf', 'accreditations', 'organismos', 'estatus', 'tipos', 'metodologias'],
};

/**
 * Normalizes legacy or alias subviews into the canonical 3-block subviews.
 */
export function normalizeDomainSubview(
  domain: DomainRoute,
  subview: string | null | undefined
): string {
  const raw = (subview || '').trim().toLowerCase().replace(/^\/+|\/+$/g, '');

  if (domain === 'auditorias') {
    if (raw === 'calendar' || raw === 'calendario') return 'calendar';
    if (
      raw === 'designacion/relacion' ||
      raw === 'relacion' ||
      raw === 'relaciones' ||
      raw === 'vinculo' ||
      raw === 'vinculos' ||
      raw === 'scheduling' ||
      raw === 'programacion'
    ) {
      return 'designacion/relacion';
    }
    if (raw === 'designacion' || raw === 'designacion/tipo' || raw === 'tipo') {
      return 'designacion/tipo';
    }
    if (raw === 'designacion/fecha' || raw === 'fecha') {
      return 'designacion/fecha';
    }
    if (raw === 'designacion/sitio' || raw === 'sitio') {
      return 'designacion/sitio';
    }
    if (raw === 'designacion/temporal' || raw === 'temporal') {
      return 'designacion/temporal';
    }
    if (raw === 'tiempo') return 'tiempo';
    if (raw === 'auditor' || raw === 'asignacion') return 'auditor';
    if (raw === 'proceso' || raw === 'programa') return 'proceso';
    if (raw === 'turno' || raw === 'turnos') return 'turno';
    if (raw === 'findings' || raw === 'resultado' || raw === 'resultados') return 'resultado';
    if (raw === 'revision') return 'revision';
    if (raw === 'resumen') return 'resumen';
    return 'designacion/relacion';
  }

  if (domain === 'certificacion') {
    if (
      raw === 'conglomerados' ||
      raw === 'conglomerado' ||
      raw === 'conglomerate' ||
      raw === 'grupos'
    ) {
      return 'conglomerados';
    }
    if (raw === 'organizations' || raw === 'organizacion' || raw === 'organizaciones') {
      return 'organizations';
    }
    if (raw === 'vinculo' || raw === 'vinculos') {
      return 'vinculo';
    }
    if (raw === 'auditors' || raw === 'auditor' || raw === 'auditores') {
      return 'auditors';
    }
    if (
      raw === 'experts' ||
      raw === 'expert' ||
      raw === 'experto' ||
      raw === 'expertos' ||
      raw === 'experto_tecnico' ||
      raw === 'expertos_tecnicos'
    ) {
      return 'experts';
    }
    // Retire 'sites', 'processes', 'shifts', 'drilldown' safely to 'certificates'
    return 'certificates';
  }

  // domain === 'extra'
  if (raw === 'iaf' || raw === 'sector_iaf') return 'iaf';
  if (
    raw === 'organismos' ||
    raw === 'organismo' ||
    raw === 'organismo_acreditacion'
  ) {
    return 'organismos';
  }
  if (
    raw === 'accreditations' ||
    raw === 'acreditacion' ||
    raw === 'acreditaciones'
  ) {
    return 'accreditations';
  }
  if (raw === 'estatus') return 'estatus';
  if (raw === 'tipos' || raw === 'tipo') return 'tipos';
  if (raw === 'metodologias' || raw === 'metodologia') return 'metodologias';
  // Retire 'requirements', 'catalogs' safely to 'standards'
  return 'standards';
}

/**
 * Pure hash route parser supporting multi-segment domain subviews (e.g. #/auditorias/designacion/tipo).
 */
export function parseHashRouteString(hash: string): { route: ActiveRoute; subview: string | null } {
  const raw = (hash || '').replace(/^#\/?/, '').trim();
  if (!raw) return { route: 'dashboard', subview: null };
  const parts = raw.split('/').filter(Boolean);
  const firstRaw = (parts[0] || '').trim().toLowerCase();
  const rest = parts.slice(1).join('/') || null;

  if (firstRaw === 'drilldown') {
    return { route: 'certificacion', subview: 'certificates' };
  }

  if (firstRaw === 'auditorias' || firstRaw === 'certificacion' || firstRaw === 'extra') {
    const domain = firstRaw as DomainRoute;
    return { route: domain, subview: normalizeDomainSubview(domain, rest) };
  }

  if (
    firstRaw === 'dashboard' ||
    firstRaw === 'profile' ||
    firstRaw === 'approvals' ||
    firstRaw === 'database' ||
    firstRaw === 'database-backup' ||
    firstRaw === 'database-sync'
  ) {
    return { route: firstRaw as ActiveRoute, subview: null };
  }

  return { route: 'dashboard', subview: null };
}

/**
 * Verifies route and subview access aligned with the Phase 2.1 3-block navigation contract.
 * All authenticated users (including PENDING and REJECTED) may access 'dashboard' and 'profile'.
 */
export function canAccessSubview(
  profile: UserProfile | null | undefined,
  route: ActiveRoute,
  subview?: string | null
): boolean {
  if (!profile) return false;
  if (route === 'dashboard' || route === 'profile') return true;
  if (!canAccessRoute(profile, route)) return false;

  if (
    route === 'approvals' ||
    route === 'database' ||
    route === 'database-backup' ||
    route === 'database-sync'
  ) {
    return true;
  }

  const normalized = normalizeDomainSubview(route, subview);
  if (route === 'certificacion' && profile.role === 'CLIENT' && normalized === 'experts') {
    return false;
  }
  return VALID_DOMAIN_SUBVIEWS[route].includes(normalized);
}

export interface DashboardSummaryMetrics {
  organizacionesActivas: number;
  certificadosVigentes: number;
  auditoriasProgramadas: number;
  acreditacionesActivas: number;
  hallazgosAbiertos: number;
}

export interface ComputeDashboardMetricsInput {
  profile: UserProfile | null | undefined;
  scopedOrganizaciones: OrganizacionEntity[];
  scopedCertificados: ReadonlyArray<
    Pick<CertificadoSummary, 'id' | 'numero_certificado' | 'estatus' | 'id_organizacion' | 'organizacion_id'> & {
      norma?: string;
    }
  >;
  scopedAuditorias: ProgramacionAuditEntity[];
  acreditaciones: AcreditacionNormaIaf[];
  scopedHallazgos: Phase5FindingEntity[];
}

/**
 * Computes minimalist RBAC-scoped summary metrics for the Phase 2.2 Home Dashboard.
 * Non-approved users receive zeroed operational metrics.
 */
export function computeDashboardSummaryMetrics(
  input: ComputeDashboardMetricsInput
): DashboardSummaryMetrics {
  const { profile, scopedOrganizaciones, scopedCertificados, scopedAuditorias, acreditaciones, scopedHallazgos } =
    input;

  if (!profile || profile.status !== 'APPROVED') {
    return {
      organizacionesActivas: 0,
      certificadosVigentes: 0,
      auditoriasProgramadas: 0,
      acreditacionesActivas: 0,
      hallazgosAbiertos: 0,
    };
  }

  const organizacionesActivas = scopedOrganizaciones.filter(
    (org) => (org.estatus || 'Activo').trim().toLowerCase() !== 'inactivo'
  ).length;

  const certSummaries: CertificadoSummary[] = scopedCertificados.map((c) => ({
    id: c.id,
    numero_certificado: c.numero_certificado,
    estatus: c.estatus,
    id_organizacion: c.id_organizacion,
    organizacion_id: c.organizacion_id,
    norma: c.norma ?? '',
  }));
  const certificadosVigentes = countActiveCertificates(certSummaries);

  const auditoriasProgramadas = scopedAuditorias.filter((audit) => {
    const status = audit.estatus.trim().toLowerCase();
    return status !== 'cerrada' && status !== 'completada';
  }).length;

  const acreditacionesActivas = acreditaciones.filter((acred) => {
    const st = (acred.estatus || '').trim().toLowerCase();
    return st === 'activo' || st === 'activa';
  }).length;

  const hallazgosAbiertos = scopedHallazgos.filter(
    (finding) => !finding.cerrado && finding.estado_ciclo !== 'Cerrado'
  ).length;

  return {
    organizacionesActivas,
    certificadosVigentes,
    auditoriasProgramadas,
    acreditacionesActivas,
    hallazgosAbiertos,
  };
}

