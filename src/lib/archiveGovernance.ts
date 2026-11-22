import { escapeHtml } from './html';
import type { UserProfile } from './healthCheck';
import {
  formatAuditTimestampLocal,
  resolveAuditActorDisplay,
  type ActorDirectoryEntry,
} from './auditLog';
import type { OrganizacionEntity } from './activeCertificates';
import type { CertificadoDetailEntity } from './multisiteSampling';
import type { AuditorDetailEntity } from './competencyMatrix';
import type { Phase5FindingEntity, ProgramacionAuditEntity } from './auditExecution';
import type { ProgramaAuditoriaEntity } from './auditPlanningEngine';
import type {
  AcreditacionNormaIaf,
  EstatusCatalogItem,
  MetodologiaAuditoriaCatalogItem,
  NormaEntity,
  RequisitoLtree,
  SectorIafEntity,
  SubsectorIafEntity,
  TipoAuditoriaCatalogItem,
} from './extraDomain';
import type { AcreditacionDetailEntity } from './acreditacionDomain';
import type { VinculoEntity } from './vinculoDomain';
import type { AuditoriaSitioTemporalEntity } from './designacionTemporalDomain';

export const PROTECTED_SOFT_DELETE_TABLES = [
  'norma',
  'requisito',
  'requisito_traduccion',
  'sector_iaf',
  'subsector_iaf',
  'organismo_acreditacion',
  'acreditacion_norma',
  'acreditacion_norma_sector_iaf',
  'estatus',
  'tipo_auditoria',
  'metodologia_auditoria',
  'auditor',
  'grupo_empresarial',
  'organizacion',
  'certificado',
  'sitio',
  'proceso',
  'turno',
  'vinculo',
  'vinculo_certificado',
  'programa_auditoria',
  'auditoria',
  'auditoria_fecha',
  'configuracion_alerta_auditoria',
  'hallazgo',
  'requisitos_no_aplicables_certificado',
  'turnos_por_sitio',
  'procesos_por_sitio',
  'comentarios_por_auditoria',
  'sitios_por_auditoria',
  'auditoria_sitio_temporal',
  'auditoria_sitio_temporal_certificado',
  'turnos_sitio_auditoria',
  'procesos_sitio_auditoria',
  'turnos_proceso_sitio_auditoria',
  'equipo_auditor_sitio',
  'equipo_auditor_proceso_sitio',
  'fecha_certificado',
  'contacto_certificado',
  'contacto_certificado_compartido',
  'telefono_contacto_certificado',
  'email_contacto_certificado',
  'turno_certificado_compartido',
  'proceso_certificado_compartido',
  'sitio_certificado_compartido',
  'client_organization_access',
] as const;

export type ProtectedSoftDeleteTable = (typeof PROTECTED_SOFT_DELETE_TABLES)[number];

export const PURE_JUNCTION_DELETE_TABLES = [
  'norma_auditor',
  'sector_iaf_auditor',
  'subsector_iaf_auditor',
  'requisitos_por_proceso',
  'equipo_auditor',
] as const;

export type PureJunctionDeleteTable = (typeof PURE_JUNCTION_DELETE_TABLES)[number];

export type ArchivableTable =
  | 'grupo_empresarial'
  | 'organizacion'
  | 'client_organization_access'
  | 'certificado'
  | 'auditor'
  | 'vinculo'
  | 'vinculo_certificado'
  | 'programa_auditoria'
  | 'auditoria'
  | 'auditoria_fecha'
  | 'configuracion_alerta_auditoria'
  | 'hallazgo'
  | 'sitios_por_auditoria'
  | 'auditoria_sitio_temporal'
  | 'auditoria_sitio_temporal_certificado'
  | 'turnos_sitio_auditoria'
  | 'procesos_sitio_auditoria'
  | 'turnos_proceso_sitio_auditoria'
  | 'equipo_auditor_sitio'
  | 'equipo_auditor_proceso_sitio'
  | 'norma'
  | 'requisito'
  | 'sector_iaf'
  | 'subsector_iaf'
  | 'organismo_acreditacion'
  | 'acreditacion_norma'
  | 'acreditacion_norma_sector_iaf'
  | 'sitio'
  | 'sitio_certificado_compartido'
  | 'proceso'
  | 'proceso_certificado_compartido'
  | 'procesos_por_sitio'
  | 'turno'
  | 'turno_certificado_compartido'
  | 'requisitos_no_aplicables_certificado'
  | 'fecha_certificado'
  | 'contacto_certificado'
  | 'contacto_certificado_compartido'
  | 'telefono_contacto_certificado'
  | 'email_contacto_certificado'
  | 'estatus'
  | 'tipo_auditoria'
  | 'metodologia_auditoria';

export interface ArchiveDependencyItem {
  table: string;
  label: string;
  count: number;
}

export interface ArchiveDependencySummary {
  can_archive: boolean;
  total_active_dependencies: number;
  dependencies: ArchiveDependencyItem[];
}

export interface ArchiveModalState {
  isOpen: boolean;
  tableName: ArchivableTable;
  recordId: string;
  entityTypeLabel: string;
  recordTitle: string;
  recordSubtitle: string | null;
  loadingSummary: boolean;
  summary: ArchiveDependencySummary | null;
  reason: string;
  submitting: boolean;
  errorMessage: string | null;
}

export interface ArchiveToastState {
  message: string;
  tone: 'success' | 'info' | 'warning';
}

export interface ArchivedItemEntry {
  tableName: ArchivableTable;
  id: string;
  title: string;
  subtitle?: string | null;
  code?: string | null;
  deletedAt: string;
  deletedBy?: string | null;
  deletedByName?: string | null;
  deleteReason?: string | null;
  snapshot?: unknown;
}

export interface ArchiveMultiViewConfig {
  canInspectArchived: boolean;
  showArchived: boolean;
  archivedItems: ArchivedItemEntry[];
  actorDirectory?: Record<string, ActorDirectoryEntry>;
  restoringId?: string | null;
}

export function extractUniversalArchiveProps(
  config: ArchiveMultiViewConfig | undefined,
  domainKey: string
): {
  canInspectArchived: boolean;
  showArchived: boolean;
  archivedItems: ArchivedItemEntry[];
  actorDirectory?: Record<string, ActorDirectoryEntry>;
  restoringId: string | null;
} {
  if (!config || !config.canInspectArchived) {
    return {
      canInspectArchived: false,
      showArchived: false,
      archivedItems: [],
      actorDirectory: undefined,
      restoringId: null,
    };
  }
  const allowedTables = new Set(getDomainArchivedTables(domainKey));
  return {
    canInspectArchived: true,
    showArchived: Boolean(config.showArchived),
    archivedItems: config.archivedItems.filter((item) =>
      allowedTables.has(item.tableName)
    ),
    actorDirectory: config.actorDirectory,
    restoringId: config.restoringId ?? null,
  };
}

export type SoftDeletePayload = {
  deleted_at: string;
  delete_reason: string | null;
};

export type RestoreRecordPayload = {
  deleted_at: null;
  delete_reason: null;
};

const UUID_INLINE_PATTERN =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

export const ARCHIVE_REASON_MAX_LENGTH = 300;

export function createInitialArchiveModalState(): ArchiveModalState {
  return {
    isOpen: false,
    tableName: 'organizacion',
    recordId: '',
    entityTypeLabel: 'Registro',
    recordTitle: '',
    recordSubtitle: null,
    loadingSummary: false,
    summary: null,
    reason: '',
    submitting: false,
    errorMessage: null,
  };
}

/**
 * Only APPROVED ADMIN or WORKER staff may initiate record archival (soft-delete).
 */
export function canArchiveRecord(
  profile: UserProfile | null | undefined
): boolean {
  if (!profile || profile.status !== 'APPROVED') return false;
  return profile.role === 'ADMIN' || profile.role === 'WORKER';
}

/**
 * Strictly APPROVED ADMIN users may toggle "Mostrar Archivados" or restore archived records.
 */
export function canInspectArchivedRecords(
  profile: UserProfile | null | undefined
): boolean {
  if (!profile || profile.status !== 'APPROVED') return false;
  return profile.role === 'ADMIN';
}

export function canShowArchivedRecords(
  profile: UserProfile | null | undefined
): boolean {
  return canInspectArchivedRecords(profile);
}

/**
 * Sanitizes an optional archival reason: trims, removes raw UUIDs, clamps to 300 chars.
 */
export function sanitizeArchiveReason(
  reason: string | null | undefined,
  maxLength = ARCHIVE_REASON_MAX_LENGTH
): string | null {
  if (!reason) return null;
  const cleaned = reason
    .replace(UUID_INLINE_PATTERN, 'Referencia registrada')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return null;
  return cleaned.slice(0, maxLength);
}

export function buildSoftDeletePayload(
  reason: string | null | undefined,
  nowIso?: string
): SoftDeletePayload {
  return {
    deleted_at: nowIso || new Date().toISOString(),
    delete_reason: sanitizeArchiveReason(reason),
  };
}

export function buildRestorePayload(): RestoreRecordPayload {
  return {
    deleted_at: null,
    delete_reason: null,
  };
}

/**
 * Parses and normalizes output from PostgreSQL RPC `get_archive_dependency_summary`.
 */
export function parseArchiveDependencySummary(
  raw: unknown
): ArchiveDependencySummary {
  let obj: Record<string, unknown> | null = null;
  if (typeof raw === 'string') {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        obj = parsed as Record<string, unknown>;
      }
    } catch {
      obj = null;
    }
  } else if (raw && typeof raw === 'object') {
    obj = raw as Record<string, unknown>;
  }

  if (!obj) {
    return {
      can_archive: true,
      total_active_dependencies: 0,
      dependencies: [],
    };
  }

  const rawDeps = Array.isArray(obj.dependencies) ? obj.dependencies : [];
  const dependencies: ArchiveDependencyItem[] = rawDeps
    .map((entry): ArchiveDependencyItem | null => {
      if (!entry || typeof entry !== 'object') return null;
      const rec = entry as Record<string, unknown>;
      const count = Math.max(0, Math.floor(Number(rec.count) || 0));
      if (count <= 0) return null;
      const table = String(rec.table || 'registro');
      const rawLabel = String(rec.label || table).replace(
        UUID_INLINE_PATTERN,
        'Referencia registrada'
      );
      return {
        table,
        label: rawLabel,
        count,
      };
    })
    .filter((d): d is ArchiveDependencyItem => d !== null)
    .sort((a, b) => b.count - a.count);

  const summedCount = dependencies.reduce((acc, item) => acc + item.count, 0);
  const declaredTotal = Math.max(
    0,
    Math.floor(Number(obj.total_active_dependencies) || 0)
  );
  const total_active_dependencies = Math.max(summedCount, declaredTotal);
  const can_archive =
    typeof obj.can_archive === 'boolean'
      ? obj.can_archive && total_active_dependencies === 0
      : total_active_dependencies === 0;

  return {
    can_archive,
    total_active_dependencies,
    dependencies,
  };
}

/**
 * Formats dependency items into clean operator-friendly warning lines without raw UUIDs.
 */
export function formatArchiveDependencyLines(
  summary: ArchiveDependencySummary
): string[] {
  return summary.dependencies.map((dep) => {
    const cleanLabel = dep.label
      .replace(UUID_INLINE_PATTERN, 'Referencia registrada')
      .trim();
    return `${dep.count} ${cleanLabel}`;
  });
}

export interface LocalArchiveDependencyContext {
  organizaciones?: ReadonlyArray<OrganizacionEntity>;
  certificates?: ReadonlyArray<CertificadoDetailEntity>;
  auditors?: ReadonlyArray<AuditorDetailEntity>;
  programs?: ReadonlyArray<ProgramaAuditoriaEntity>;
  audits?: ReadonlyArray<ProgramacionAuditEntity>;
  comentariosByAuditId?: Readonly<Record<string, number>>;
  findings?: ReadonlyArray<Phase5FindingEntity>;
  normas?: ReadonlyArray<NormaEntity>;
  requisitos?: ReadonlyArray<RequisitoLtree>;
  subsectores?: ReadonlyArray<SubsectorIafEntity>;
  acreditaciones?: ReadonlyArray<
    | Pick<
        AcreditacionDetailEntity,
        | 'id'
        | 'id_organismo'
        | 'id_norma'
        | 'norma_codigo'
        | 'id_estatus'
        | 'estatus'
        | 'sectores'
        | 'sector_ids'
        | 'deleted_at'
      >
    | Pick<
        AcreditacionNormaIaf,
        | 'id'
        | 'id_organismo'
        | 'id_norma'
        | 'norma_codigo'
        | 'id_estatus'
        | 'estatus'
        | 'sectores'
        | 'sector_ids'
      >
  >;
  estatusList?: ReadonlyArray<EstatusCatalogItem>;
  tiposList?: ReadonlyArray<TipoAuditoriaCatalogItem>;
  metodologiasList?: ReadonlyArray<MetodologiaAuditoriaCatalogItem>;
  archivedSiteIds?: ReadonlySet<string>;
  archivedProcesoIds?: ReadonlySet<string>;
  archivedTurnoIds?: ReadonlySet<string>;
  archivedNoAplicableIds?: ReadonlySet<string>;
  archivedFechaIds?: ReadonlySet<string>;
  archivedContactoIds?: ReadonlySet<string>;
  archivedTelefonoIds?: ReadonlySet<string>;
  archivedEmailIds?: ReadonlySet<string>;
  archivedContactoShareIds?: ReadonlySet<string>;
  archivedTurnoShareIds?: ReadonlySet<string>;
  sharedContactoLinks?: ReadonlyArray<{
    id?: string;
    id_contacto: string;
    id_certificado: string;
    deleted_at?: string | null;
  }>;
  sharedTurnoLinks?: ReadonlyArray<{
    id?: string;
    id_turno: string;
    id_certificado: string;
    id_certificado_origen?: string | null;
    deleted_at?: string | null;
  }>;
  vinculos?: ReadonlyArray<VinculoEntity>;
  temporalSites?: ReadonlyArray<AuditoriaSitioTemporalEntity>;
}

/**
 * Pure client-side dependency calculation mirroring `get_archive_dependency_summary`
 * so seeded/offline mode and live Supabase RPC produce consistent dependency blocks.
 */
export function computeLocalArchiveDependencySummary(
  tableName: ArchivableTable,
  recordId: string,
  context: LocalArchiveDependencyContext
): ArchiveDependencySummary {
  const dependencies: ArchiveDependencyItem[] = [];
  const certs = context.certificates || [];
  const audits = context.audits || [];
  const findings = context.findings || [];
  const requisitos = context.requisitos || [];
  const subsectores = context.subsectores || [];
  const acreditaciones = context.acreditaciones || [];
  const archivedSiteIds = context.archivedSiteIds || new Set<string>();
  const archivedProcesoIds = context.archivedProcesoIds || new Set<string>();
  const archivedTurnoIds = context.archivedTurnoIds || new Set<string>();
  const archivedNoAplicableIds = context.archivedNoAplicableIds || new Set<string>();
  const archivedContactoIds = context.archivedContactoIds || new Set<string>();
  const archivedTelefonoIds = context.archivedTelefonoIds || new Set<string>();
  const archivedEmailIds = context.archivedEmailIds || new Set<string>();
  const archivedContactoShareIds = context.archivedContactoShareIds || new Set<string>();
  const archivedTurnoShareIds = context.archivedTurnoShareIds || new Set<string>();

  const pushDep = (table: string, label: string, count: number): void => {
    if (count > 0) {
      dependencies.push({ table, label, count });
    }
  };

  switch (tableName) {
    case 'grupo_empresarial': {
      const groupOrgs = (context.organizaciones || []).filter(
        (o) => !o.deleted_at && o.id_grupo_empresarial === recordId
      );
      pushDep('organizacion', 'Organizaciones activas en el conglomerado', groupOrgs.length);
      const groupVinculos = (context.vinculos || []).filter(
        (v) => !v.deleted_at && v.id_grupo_empresarial === recordId
      );
      pushDep('vinculo', 'Vínculos de auditoría activos', groupVinculos.length);
      break;
    }

    case 'vinculo': {
      const vinculo = (context.vinculos || []).find(
        (v) => !v.deleted_at && v.id === recordId
      );
      const activeCerts = vinculo
        ? vinculo.certificados.filter((vc) => !vc.deleted_at)
        : [];
      pushDep('vinculo_certificado', 'Certificados activos en el vínculo', activeCerts.length);
      const pendingPrograms = (context.programs || []).filter((p) => {
        if (p.deleted_at || p.id_vinculo !== recordId) return false;
        return (p.auditorias || []).some(
          (a) =>
            !a.deleted_at &&
            !['Cerrada', 'Cancelada', 'Auditada'].includes(a.estado_ciclo || 'Borrador')
        );
      });
      pushDep(
        'programa_auditoria',
        'Campañas con auditorías pendientes bajo este vínculo',
        pendingPrograms.length
      );
      break;
    }

    case 'vinculo_certificado': {
      break;
    }

    case 'organizacion': {
      const orgCerts = certs.filter((c) => c.id_organizacion === recordId);
      pushDep('certificado', 'Certificados activos', orgCerts.length);
      break;
    }

    case 'certificado': {
      const activeCertVinculos = (context.vinculos || [])
        .filter((v) => !v.deleted_at)
        .flatMap((v) => v.certificados.filter((vc) => !vc.deleted_at && vc.id_certificado === recordId));
      pushDep('vinculo_certificado', 'Vínculos de auditoría activos', activeCertVinculos.length);
      const cert = certs.find((c) => c.id === recordId);
      if (cert) {
        const activeSites = (cert.sitios || []).filter((s) => !archivedSiteIds.has(s.id));
        const activeProcs = (cert.procesos || []).filter(
          (p) => !archivedProcesoIds.has(p.id)
        );
        const activeNoAplicables = (cert.noAplicables || []).filter(
          (na) => !archivedNoAplicableIds.has(na.id)
        );
        const linkedAudits = audits.filter((a) => a.id_certificado === recordId);
        pushDep('sitio', 'Sitios operativos', activeSites.length);
        pushDep('proceso', 'Procesos operativos', activeProcs.length);
        pushDep('auditoria', 'Auditorías vinculadas', linkedAudits.length);
        pushDep(
          'requisitos_no_aplicables_certificado',
          'Exclusiones normativas',
          activeNoAplicables.length
        );
      }
      break;
    }

    case 'sitio': {
      let targetCert: CertificadoDetailEntity | undefined;
      let targetSite:
        | CertificadoDetailEntity['sitios'][number]
        | undefined;
      for (const c of certs) {
        const match = (c.sitios || []).find(
          (s) => s.id === recordId && !archivedSiteIds.has(s.id)
        );
        if (match) {
          targetCert = c;
          targetSite = match;
          break;
        }
      }
      if (targetCert && targetSite) {
        if (targetSite.numero_sitio === 0) {
          const secondaryCount = (targetCert.sitios || []).filter(
            (s) =>
              s.id !== recordId &&
              s.numero_sitio > 0 &&
              !archivedSiteIds.has(s.id)
          ).length;
          pushDep(
            'sitio',
            'Sedes secundarias dependientes de Sitio 0',
            secondaryCount
          );
        }
        const siteAuditsCount = audits.filter((a) =>
          (a.sitiosMuestreo || []).some((ms) => ms.id_sitio === recordId)
        ).length;
        pushDep(
          'sitios_por_auditoria',
          'Auditorías asignadas al sitio',
          siteAuditsCount
        );
        const cleanSiteName = targetSite.nombre_sitio.trim().toLowerCase();
        const linkedTurnosByCert = (targetCert.turnos || []).filter((t) =>
          (t.sitios_vinculados || []).some(
            (name) => name.trim().toLowerCase() === cleanSiteName
          )
        ).length;
        const siteTurnosCount = Math.max(
          (targetSite.turnos_vinculados || []).length,
          linkedTurnosByCert
        );
        pushDep('turnos_por_sitio', 'Turnos asignados al sitio', siteTurnosCount);
        const siteProcsCount = Math.max(
          (targetSite.procesos_por_sitio || []).filter((l) => !l.deleted_at).length,
          (targetSite.procesos_vinculados || []).length
        );
        pushDep('procesos_por_sitio', 'Procesos asignados al sitio', siteProcsCount);
      }
      break;
    }

    case 'proceso': {
      let procName = '';
      let procCertId = '';
      for (const c of certs) {
        const match = (c.procesos || []).find((p) => p.id === recordId);
        if (match) {
          procName = match.nombre_proceso.trim().toLowerCase();
          procCertId = c.id;
          break;
        }
      }
      const procFindings = findings.filter(
        (f) =>
          f.id_proceso === recordId ||
          (procName && f.proceso_nombre.trim().toLowerCase() === procName)
      ).length;
      pushDep('hallazgo', 'Hallazgos vinculados al proceso', procFindings);

      let procSitesCount = 0;
      for (const c of certs) {
        for (const s of c.sitios || []) {
          if (archivedSiteIds.has(s.id)) continue;
          const matchesLink = (s.procesos_por_sitio || []).some(
            (l) => !l.deleted_at && l.id_proceso === recordId
          );
          const matchesName =
            !s.procesos_por_sitio &&
            Boolean(procName) &&
            (s.procesos_vinculados || []).some(
              (name) => name.trim().toLowerCase() === procName
            );
          if (matchesLink || matchesName) {
            procSitesCount += 1;
          }
        }
      }
      pushDep('procesos_por_sitio', 'Sitios con este proceso asignado', procSitesCount);

      let procAuditAssignments = 0;
      for (const a of audits) {
        if (procCertId && a.id_certificado !== procCertId) continue;
        const matchesPlan = (a.sitiosPlan || []).some(
          (sp) =>
            !sp.deleted_at &&
            (sp.procesos || []).some((pp) => !pp.deleted_at && pp.id_proceso === recordId)
        );
        const matchesMatrix =
          Boolean(procName) &&
          (a.matrizNormativa || []).some(
            (item) => item.proceso_nombre.trim().toLowerCase() === procName
          );
        if (matchesPlan || matchesMatrix) {
          procAuditAssignments += 1;
        }
      }
      pushDep(
        'procesos_sitio_auditoria',
        'Auditorías programadas para el proceso',
        procAuditAssignments
      );
      break;
    }

    case 'procesos_por_sitio': {
      let linkedAuditProcs = 0;
      for (const a of audits) {
        for (const sp of a.sitiosPlan || []) {
          if (sp.deleted_at) continue;
          for (const pp of sp.procesos || []) {
            if (!pp.deleted_at && pp.id_procesos_por_sitio === recordId) {
              linkedAuditProcs += 1;
            }
          }
        }
      }
      pushDep(
        'procesos_sitio_auditoria',
        'Auditorías programadas para el proceso en el sitio',
        linkedAuditProcs
      );
      break;
    }

    case 'turno': {
      const seenSiteKeys = new Set<string>();
      const sharedCertIds = new Set<string>();
      for (const c of certs) {
        if (archivedTurnoIds.has(recordId)) continue;
        const shift = (c.turnos || []).find((t) => t.id === recordId);
        if (!shift) continue;
        const cleanShiftDesc = shift.descripcion.trim().toLowerCase();
        for (const site of c.sitios || []) {
          if (archivedSiteIds.has(site.id)) continue;
          const matchesSiteLink = (site.turnos_por_sitio || []).some(
            (tps) => !tps.deleted_at && tps.id_turno === shift.id
          );
          const matchesSiteName = (shift.sitios_vinculados || []).some(
            (name) => name.trim().toLowerCase() === site.nombre_sitio.trim().toLowerCase()
          );
          const matchesSiteLabel = (site.turnos_vinculados || []).some(
            (lbl) => lbl.trim().toLowerCase() === cleanShiftDesc || lbl === shift.id
          );
          if (matchesSiteLink || matchesSiteName || matchesSiteLabel) {
            seenSiteKeys.add(site.id);
          }
        }
        for (const targetRef of shift.sharedTargets || []) {
          if (targetRef.linkId && archivedTurnoShareIds.has(targetRef.linkId)) {
            continue;
          }
          if (targetRef.targetCertId && targetRef.targetCertId !== c.id) {
            sharedCertIds.add(targetRef.targetCertId);
          }
        }
        if (
          shift.sharedFromCertId ||
          (shift.ownerCertId && shift.ownerCertId !== c.id)
        ) {
          sharedCertIds.add(c.id);
        }
      }
      for (const link of context.sharedTurnoLinks || []) {
        if (link.deleted_at) continue;
        if (link.id && archivedTurnoShareIds.has(link.id)) continue;
        if (link.id_turno === recordId && link.id_certificado) {
          sharedCertIds.add(link.id_certificado);
        }
      }
      pushDep('turnos_por_sitio', 'Sedes con este turno asignado', seenSiteKeys.size);
      pushDep(
        'turno_certificado_compartido',
        'Comparticiones activas del turno en conglomerado',
        sharedCertIds.size
      );
      break;
    }

    case 'programa_auditoria': {
      const linkedAuditIds = new Set<string>();
      for (const a of audits) {
        if (a.id_programa_auditoria === recordId) {
          linkedAuditIds.add(a.id);
        }
      }
      const prog = (context.programs || []).find((p) => p.id === recordId && !p.deleted_at);
      if (prog) {
        for (const a of prog.auditorias || []) {
          linkedAuditIds.add(a.id);
        }
      }
      pushDep('auditoria', 'Auditorías vinculadas al programa', linkedAuditIds.size);
      break;
    }

    case 'auditoria': {
      const audit = audits.find((a) => a.id === recordId);
      const auditFindings = findings.filter((f) => f.id_auditoria === recordId).length;
      if (audit) {
        const activeDatesCount = (audit.fechas || []).filter((f) => !f.deleted_at).length;
        pushDep('auditoria_fecha', 'Revisiones de fecha de la auditoría', activeDatesCount);
      }
      pushDep('hallazgo', 'Hallazgos de la auditoría', auditFindings);
      if (audit) {
        const activeSitesCount = Math.max(
          audit.sitiosMuestreo.length,
          (audit.sitiosPlan || []).filter((s) => !s.deleted_at).length
        );
        pushDep(
          'sitios_por_auditoria',
          'Sitios en el alcance de la auditoría',
          activeSitesCount
        );
      }
      const commentsCount = context.comentariosByAuditId?.[recordId] || 0;
      pushDep('comentarios_por_auditoria', 'Comentarios de seguimiento', commentsCount);
      const temporalSites = (context.temporalSites || []).filter((t) => !t.deleted_at);
      const anchoredTemporalCount = temporalSites.filter((t) => t.id_auditoria === recordId).length;
      pushDep(
        'auditoria_sitio_temporal',
        'Sitios temporales registrados en la auditoría',
        anchoredTemporalCount
      );
      const temporalCertLinkCount = temporalSites.reduce(
        (acc, t) =>
          acc +
          t.certificados.filter(
            (c) => !c.deleted_at && c.id_auditoria_certificado === recordId
          ).length,
        0
      );
      pushDep(
        'auditoria_sitio_temporal_certificado',
        'Vínculos activos con sitios temporales',
        temporalCertLinkCount
      );
      break;
    }

    case 'auditoria_sitio_temporal': {
      const targetTemp = (context.temporalSites || []).find(
        (t) => !t.deleted_at && t.id === recordId
      );
      const activeCertLinks = targetTemp
        ? targetTemp.certificados.filter((c) => !c.deleted_at).length
        : 0;
      pushDep(
        'auditoria_sitio_temporal_certificado',
        'Certificados vinculados al sitio temporal',
        activeCertLinks
      );
      break;
    }

    case 'auditoria_sitio_temporal_certificado': {
      break;
    }

    case 'sitios_por_auditoria': {
      for (const a of audits) {
        const sp = (a.sitiosPlan || []).find((item) => item.id === recordId && !item.deleted_at);
        if (!sp) continue;
        const distinctSiteShiftIds = new Set<string>();
        for (const pp of sp.procesos || []) {
          if (pp.deleted_at) continue;
          for (const ts of pp.turnos || []) {
            if (!ts.deleted_at && ts.id_turnos_sitio_auditoria) {
              distinctSiteShiftIds.add(ts.id_turnos_sitio_auditoria);
            }
          }
        }
        pushDep(
          'turnos_sitio_auditoria',
          'Turnos programados en el sitio de auditoría',
          distinctSiteShiftIds.size
        );
        pushDep(
          'procesos_sitio_auditoria',
          'Procesos programados en el sitio de auditoría',
          (sp.procesos || []).filter((p) => !p.deleted_at).length
        );
        pushDep(
          'equipo_auditor_sitio',
          'Auditores asignados al sitio de auditoría',
          (sp.equipoSitio || []).filter((as) => !as.deleted_at).length
        );
        break;
      }
      break;
    }

    case 'turnos_sitio_auditoria': {
      let linkedProcShifts = 0;
      for (const a of audits) {
        for (const sp of a.sitiosPlan || []) {
          if (sp.deleted_at) continue;
          for (const pp of sp.procesos || []) {
            if (pp.deleted_at) continue;
            linkedProcShifts += (pp.turnos || []).filter(
              (ts) => !ts.deleted_at && ts.id_turnos_sitio_auditoria === recordId
            ).length;
          }
        }
      }
      pushDep(
        'turnos_proceso_sitio_auditoria',
        'Procesos vinculados a este turno de auditoría',
        linkedProcShifts
      );
      break;
    }

    case 'procesos_sitio_auditoria': {
      for (const a of audits) {
        let matched = false;
        for (const sp of a.sitiosPlan || []) {
          if (sp.deleted_at) continue;
          const pp = (sp.procesos || []).find((p) => p.id === recordId && !p.deleted_at);
          if (!pp) continue;
          pushDep(
            'turnos_proceso_sitio_auditoria',
            'Turnos asignados al proceso en la auditoría',
            (pp.turnos || []).filter((t) => !t.deleted_at).length
          );
          pushDep(
            'equipo_auditor_proceso_sitio',
            'Auditores asignados al proceso en la auditoría',
            (pp.equipoProceso || []).filter((ap) => !ap.deleted_at).length
          );
          matched = true;
          break;
        }
        if (matched) break;
      }
      break;
    }

    case 'norma': {
      const norma = (context.normas || []).find((n) => n.id === recordId);
      const normaCode = norma?.codigo?.toLowerCase() || '';
      const certCount = certs.filter(
        (c) =>
          c.id_norma === recordId ||
          (normaCode && c.norma_codigo.toLowerCase() === normaCode)
      ).length;
      const reqCount = requisitos.filter(
        (r) =>
          r.id_norma === recordId ||
          (normaCode && r.norma_codigo.toLowerCase() === normaCode)
      ).length;
      const accredCount = acreditaciones.filter((a) => {
        if ('deleted_at' in a && a.deleted_at) return false;
        return (
          a.id_norma === recordId ||
          (normaCode && a.norma_codigo.toLowerCase() === normaCode)
        );
      }).length;
      pushDep('certificado', 'Certificados emitidos bajo la norma', certCount);
      pushDep('requisito', 'Cláusulas de la norma', reqCount);
      pushDep('acreditacion_norma', 'Acreditaciones vinculadas', accredCount);
      break;
    }

    case 'requisito': {
      const subReqCount = requisitos.filter(
        (r) => !r.deleted_at && r.id_requisito_padre === recordId
      ).length;
      const hallazgosCount = findings.filter(
        (f) => f.id_requisito === recordId
      ).length;
      const exclCount = certs.reduce(
        (acc, cert) =>
          acc +
          (cert.noAplicables || []).filter(
            (na) => !archivedNoAplicableIds.has(na.id) && na.id_requisito === recordId
          ).length,
        0
      );
      pushDep('requisito', 'Sub-requisitos dependientes', subReqCount);
      pushDep('hallazgo', 'Hallazgos de auditoría vinculados', hallazgosCount);
      pushDep('requisitos_no_aplicables_certificado', 'Exclusiones ISO 4.3 vinculadas', exclCount);
      break;
    }

    case 'sector_iaf': {
      const secNum = Number(recordId);
      const subCount = subsectores.filter(
        (s) =>
          !s.deleted_at &&
          (s.id_sector_iaf === recordId ||
            (!Number.isNaN(secNum) && s.sector_numero === secNum))
      ).length;
      const certCount = certs.filter(
        (c) =>
          c.id_sector_iaf === recordId ||
          (!Number.isNaN(secNum) && c.sector_iaf === secNum)
      ).length;
      const accredCount = acreditaciones.filter((a) => {
        if ('deleted_at' in a && a.deleted_at) return false;
        const matchesByLink = (a.sectores || []).some(
          (s) => s.id_sector_iaf === recordId || (!Number.isNaN(secNum) && s.sector === secNum)
        );
        const matchesByIds = (a.sector_ids || []).includes(recordId);
        return matchesByLink || matchesByIds;
      }).length;
      pushDep('subsector_iaf', 'Sub-sectores IAF', subCount);
      pushDep('certificado', 'Certificados en este sector', certCount);
      pushDep('acreditacion_norma_sector_iaf', 'Acreditaciones vinculadas a este sector', accredCount);
      break;
    }

    case 'subsector_iaf': {
      const certCount = certs.filter((c) => c.id_subsector_iaf === recordId).length;
      pushDep('certificado', 'Certificados emitidos en este sub-sector', certCount);
      break;
    }

    case 'organismo_acreditacion': {
      const accredCount = acreditaciones.filter((a) => {
        if ('deleted_at' in a && a.deleted_at) return false;
        return a.id_organismo === recordId;
      }).length;
      pushDep('acreditacion_norma', 'Acreditaciones otorgadas', accredCount);
      break;
    }

    case 'acreditacion_norma': {
      const target = acreditaciones.find(
        (a) => a.id === recordId && (!('deleted_at' in a) || !a.deleted_at)
      );
      const linkedSectorsCount = target
        ? Math.max((target.sectores || []).length, (target.sector_ids || []).length)
        : 0;
      pushDep('acreditacion_norma_sector_iaf', 'Sectores IAF vinculados al alcance', linkedSectorsCount);
      break;
    }

    case 'estatus': {
      const estItem = (context.estatusList || []).find((e) => e.id === recordId);
      if (estItem) {
        const estName = estItem.estatus.toLowerCase();
        const certCount = certs.filter(
          (c) => c.estatus.toLowerCase() === estName
        ).length;
        const accredCount = acreditaciones.filter((a) => {
          if ('deleted_at' in a && a.deleted_at) return false;
          return a.id_estatus === recordId || a.estatus.toLowerCase() === estName;
        }).length;
        pushDep('certificado', 'Certificados con este estatus', certCount);
        pushDep('acreditacion_norma', 'Acreditaciones con este estatus', accredCount);
      }
      break;
    }

    case 'tipo_auditoria': {
      const tipoItem = (context.tiposList || []).find((t) => t.id === recordId);
      if (tipoItem) {
        const tipoName = tipoItem.tipo.toLowerCase();
        const auditCount = audits.filter(
          (a) => a.tipo_auditoria.toLowerCase() === tipoName
        ).length;
        pushDep('auditoria', 'Auditorías con este tipo', auditCount);
      }
      break;
    }

    case 'metodologia_auditoria': {
      const metItem = (context.metodologiasList || []).find(
        (m) => m.id === recordId
      );
      if (metItem) {
        const metName = metItem.metodologia.toLowerCase();
        const auditCount = audits.filter(
          (a) => a.metodologia.toLowerCase() === metName
        ).length;
        pushDep('auditoria', 'Auditorías con esta metodología', auditCount);
      }
      break;
    }

    case 'auditor': {
      const activeTeams = audits.filter(
        (a) =>
          a.auditor_lider_id === recordId ||
          a.equipo.some((m) => m.id_auditor === recordId)
      ).length;
      pushDep('equipo_auditor', 'Auditorías donde participa en equipo', activeTeams);

      let siteAssignments = 0;
      let processAssignments = 0;
      for (const a of audits) {
        for (const sp of a.sitiosPlan || []) {
          if (sp.deleted_at) continue;
          siteAssignments += (sp.equipoSitio || []).filter(
            (as) => !as.deleted_at && as.id_auditor === recordId
          ).length;
          for (const pp of sp.procesos || []) {
            if (pp.deleted_at) continue;
            processAssignments += (pp.equipoProceso || []).filter(
              (ap) => !ap.deleted_at && ap.id_auditor === recordId
            ).length;
          }
        }
      }
      pushDep(
        'equipo_auditor_sitio',
        'Asignaciones del auditor en sitios de auditoría',
        siteAssignments
      );
      pushDep(
        'equipo_auditor_proceso_sitio',
        'Asignaciones del auditor en procesos de auditoría',
        processAssignments
      );
      break;
    }

    case 'contacto_certificado': {
      let ownerActivePhones = 0;
      let ownerActiveEmails = 0;
      let countedChannels = false;
      const sharedCertIds = new Set<string>();

      for (const c of certs) {
        const contact = (c.contactos || []).find(
          (ct) => ct.id === recordId && !archivedContactoIds.has(ct.id)
        );
        if (!contact) continue;
        const ownerCertId = (contact.ownerCertId || contact.id_certificado || c.id).trim();
        const isOwnerEntry = ownerCertId === c.id && !contact.sharedFromCertId;

        if (!countedChannels || isOwnerEntry) {
          ownerActivePhones = (contact.telefonos || []).filter(
            (t) => !archivedTelefonoIds.has(t.id)
          ).length;
          ownerActiveEmails = (contact.emails || []).filter(
            (em) => !archivedEmailIds.has(em.id)
          ).length;
          countedChannels = true;
        }

        for (const targetRef of contact.sharedTargets || []) {
          if (targetRef.linkId && archivedContactoShareIds.has(targetRef.linkId)) {
            continue;
          }
          if (targetRef.targetCertId && targetRef.targetCertId !== ownerCertId) {
            sharedCertIds.add(targetRef.targetCertId);
          }
        }

        if (!isOwnerEntry) {
          sharedCertIds.add(c.id);
        }
      }

      for (const link of context.sharedContactoLinks || []) {
        if (link.deleted_at) continue;
        if (link.id && archivedContactoShareIds.has(link.id)) continue;
        if (link.id_contacto === recordId && link.id_certificado) {
          sharedCertIds.add(link.id_certificado);
        }
      }

      if (countedChannels) {
        pushDep(
          'telefono_contacto_certificado',
          'Teléfonos activos del contacto',
          ownerActivePhones
        );
        pushDep(
          'email_contacto_certificado',
          'Correos electrónicos activos del contacto',
          ownerActiveEmails
        );
      }
      pushDep(
        'contacto_certificado_compartido',
        'Comparticiones activas del contacto en conglomerado',
        sharedCertIds.size
      );
      break;
    }

    case 'requisitos_no_aplicables_certificado':
    case 'fecha_certificado':
    case 'telefono_contacto_certificado':
    case 'email_contacto_certificado':
    case 'contacto_certificado_compartido':
    case 'turno_certificado_compartido':
    case 'proceso_certificado_compartido':
    case 'sitio_certificado_compartido':
    case 'acreditacion_norma_sector_iaf':
    case 'client_organization_access':
    case 'auditoria_fecha':
    case 'configuracion_alerta_auditoria':
    case 'hallazgo':
    case 'turnos_proceso_sitio_auditoria':
    case 'equipo_auditor_sitio':
    case 'equipo_auditor_proceso_sitio':
      // Leaf entities have no blocking child dependencies
      break;
  }

  const total_active_dependencies = dependencies.reduce(
    (sum, item) => sum + item.count,
    0
  );

  return {
    can_archive: total_active_dependencies === 0,
    total_active_dependencies,
    dependencies,
  };
}

/**
 * Merges live RPC summary with local in-memory dependency summary to handle
 * both live DB rows and seeded/optimistic client records cleanly.
 */
export function mergeArchiveDependencySummaries(
  rpcSummary: ArchiveDependencySummary,
  localSummary: ArchiveDependencySummary
): ArchiveDependencySummary {
  const byTable = new Map<string, ArchiveDependencyItem>();
  for (const dep of rpcSummary.dependencies) {
    byTable.set(dep.table, { ...dep });
  }
  for (const dep of localSummary.dependencies) {
    const existing = byTable.get(dep.table);
    if (!existing || dep.count > existing.count) {
      byTable.set(dep.table, { ...dep });
    }
  }
  const mergedDeps = Array.from(byTable.values()).sort(
    (a, b) => b.count - a.count
  );
  const total = mergedDeps.reduce((sum, item) => sum + item.count, 0);
  return {
    can_archive: total === 0 && rpcSummary.can_archive && localSummary.can_archive,
    total_active_dependencies: total,
    dependencies: mergedDeps,
  };
}

/**
 * Formats archived actor display safely without ever exposing raw UUIDs.
 */
export function formatArchivedActorDisplay(
  entry: Pick<ArchivedItemEntry, 'deletedBy' | 'deletedByName'>,
  actorDirectory?: Record<string, ActorDirectoryEntry>
): string {
  const resolved = resolveAuditActorDisplay(
    {
      actor_name: entry.deletedByName || null,
      actor_email: null,
      performed_by: entry.deletedBy || null,
      changed_by: null,
      actor_user_id: null,
    },
    actorDirectory
  );
  return resolved.displayName;
}

export function formatArchivedDateDisplay(isoTimestamp: string): string {
  if (!isoTimestamp) return 'Reciente';
  return formatAuditTimestampLocal(isoTimestamp, 'es-ES');
}

export const ARCHIVE_TABLE_LABELS: Readonly<Record<ArchivableTable, string>> = {
  grupo_empresarial: 'Conglomerado',
  organizacion: 'Organización',
  client_organization_access: 'Acceso de Cliente',
  certificado: 'Certificado',
  auditor: 'Auditor',
  vinculo: 'Vínculo de Auditoría',
  vinculo_certificado: 'Certificado en Vínculo',
  programa_auditoria: 'Programa de Auditoría',
  auditoria: 'Auditoría Programada',
  auditoria_fecha: 'Fecha de Auditoría',
  configuracion_alerta_auditoria: 'Configuración de Alertas de Auditoría',
  hallazgo: 'Hallazgo de Auditoría',
  sitios_por_auditoria: 'Sitio de Auditoría',
  auditoria_sitio_temporal: 'Sitio Temporal',
  auditoria_sitio_temporal_certificado: 'Certificado en Sitio Temporal',
  turnos_sitio_auditoria: 'Turno en Sitio de Auditoría',
  procesos_sitio_auditoria: 'Proceso en Sitio de Auditoría',
  turnos_proceso_sitio_auditoria: 'Turno de Proceso en Auditoría',
  equipo_auditor_sitio: 'Auditor Asignado a Sitio',
  equipo_auditor_proceso_sitio: 'Auditor Asignado a Proceso',
  norma: 'Norma ISO',
  requisito: 'Requisito Normativo (LTREE)',
  sector_iaf: 'Sector IAF',
  subsector_iaf: 'Sub-Sector IAF',
  organismo_acreditacion: 'Organismo de Acreditación',
  acreditacion_norma: 'Acreditación',
  acreditacion_norma_sector_iaf: 'Sector IAF de Acreditación',
  sitio: 'Sitio Operativo',
  sitio_certificado_compartido: 'Sitio Compartido en Certificado',
  proceso: 'Proceso',
  proceso_certificado_compartido: 'Proceso Compartido en Certificado',
  procesos_por_sitio: 'Proceso Asignado a Sitio',
  turno: 'Turno Operativo',
  turno_certificado_compartido: 'Turno Compartido en Certificado',
  requisitos_no_aplicables_certificado: 'Exclusión de Requisito (ISO 4.3)',
  fecha_certificado: 'Fecha de Certificado',
  contacto_certificado: 'Contacto de Certificado',
  contacto_certificado_compartido: 'Contacto Compartido en Certificado',
  telefono_contacto_certificado: 'Teléfono de Contacto',
  email_contacto_certificado: 'Correo de Contacto',
  estatus: 'Estatus Canónico',
  tipo_auditoria: 'Tipo de Auditoría',
  metodologia_auditoria: 'Metodología de Auditoría',
};

export function getArchiveTableDisplayLabel(tableName: ArchivableTable): string {
  return ARCHIVE_TABLE_LABELS[tableName];
}

export function getDomainArchivedTables(domainKey: string): ArchivableTable[] {
  switch (domainKey) {
    case 'conglomerados':
      return ['grupo_empresarial'];
    case 'organizaciones':
      return ['organizacion', 'client_organization_access'];
    case 'certificados':
      return [
        'certificado',
        'sitio',
        'sitio_certificado_compartido',
        'proceso',
        'proceso_certificado_compartido',
        'procesos_por_sitio',
        'turno',
        'turno_certificado_compartido',
        'requisitos_no_aplicables_certificado',
        'fecha_certificado',
        'contacto_certificado',
        'contacto_certificado_compartido',
        'telefono_contacto_certificado',
        'email_contacto_certificado',
      ];
    case 'auditores':
      return ['auditor'];
    case 'vinculos':
      return ['vinculo', 'vinculo_certificado'];
    case 'programacion':
      return [
        'vinculo',
        'vinculo_certificado',
        'programa_auditoria',
        'auditoria',
        'auditoria_fecha',
        'sitios_por_auditoria',
        'auditoria_sitio_temporal',
        'auditoria_sitio_temporal_certificado',
        'turnos_sitio_auditoria',
        'procesos_sitio_auditoria',
        'turnos_proceso_sitio_auditoria',
        'equipo_auditor_sitio',
        'equipo_auditor_proceso_sitio',
      ];
    case 'normas':
      return ['norma', 'requisito'];
    case 'iaf':
      return ['sector_iaf', 'subsector_iaf'];
    case 'organismos':
      return ['organismo_acreditacion'];
    case 'acreditaciones':
      return ['acreditacion_norma'];
    case 'estatus':
      return ['estatus'];
    case 'tipos':
      return ['tipo_auditoria'];
    case 'metodologias':
      return ['metodologia_auditoria'];
    case 'resultado':
      return ['hallazgo'];
    default:
      return [];
  }
}

export interface RenderArchivarButtonOptions {
  tableName: ArchivableTable;
  recordId: string;
  entityLabel: string;
  recordTitle: string;
  recordSubtitle?: string | null;
  extraClass?: string;
  iconOnly?: boolean;
}

/**
 * Renders the standardized 🗄️ Archivar trigger button for Detail View Record Zones.
 */
export function renderArchivarButtonHtml(
  options: RenderArchivarButtonOptions
): string {
  const cleanTitle = options.recordTitle.replace(
    UUID_INLINE_PATTERN,
    'Registro'
  );
  const cleanSubtitle = (options.recordSubtitle || '').replace(
    UUID_INLINE_PATTERN,
    'Referencia'
  );

  if (options.iconOnly) {
    return `
      <button
        type="button"
        data-action="open-archive-modal"
        data-archive-table="${escapeHtml(options.tableName)}"
        data-archive-id="${escapeHtml(options.recordId)}"
        data-archive-entity-label="${escapeHtml(options.entityLabel)}"
        data-archive-title="${escapeHtml(cleanTitle)}"
        ${cleanSubtitle ? `data-archive-subtitle="${escapeHtml(cleanSubtitle)}"` : ''}
        title="Archivar"
        aria-label="Archivar"
        class="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 shadow-2xs transition-colors cursor-pointer shrink-0 ${options.extraClass || ''}"
      >
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M3 6h18" />
          <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
          <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
          <line x1="10" x2="10" y1="11" y2="17" />
          <line x1="14" x2="14" y1="11" y2="17" />
        </svg>
      </button>
    `;
  }

  return `
    <button
      type="button"
      data-action="open-archive-modal"
      data-archive-table="${escapeHtml(options.tableName)}"
      data-archive-id="${escapeHtml(options.recordId)}"
      data-archive-entity-label="${escapeHtml(options.entityLabel)}"
      data-archive-title="${escapeHtml(cleanTitle)}"
      ${cleanSubtitle ? `data-archive-subtitle="${escapeHtml(cleanSubtitle)}"` : ''}
      class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0 ${options.extraClass || ''}"
    >
      <span aria-hidden="true">🗄️</span>
      <span>Archivar</span>
    </button>
  `;
}
