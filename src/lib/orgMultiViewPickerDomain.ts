/**
 * Step 3.1 — Dominio Compartido: Multi View por `Organización` + Pop-up Agrupado por Auditoría Vinculada
 *
 * Provee el motor puro reutilizable para las 13 secciones (`Vínculo` en Bloque 2 y las 12 subvistas
 * de Bloque 1):
 * - Construcción de filas centradas en `Organización` con métricas, facetas y buscador integral.
 * - Construcción del modelo del Pop-up Modal con agrupación contigua por Auditoría Vinculada
 *   (o caja activa de Vínculo), filtrado en vivo y cálculo dinámico de `groupRowSpan`.
 *
 * Invariantes:
 * - TypeScript `strict: true` con 0 `any` / `as any`.
 * - Zero-UUID en etiquetas, tooltips, texto de búsqueda y mensajes visibles.
 * - Idioma 100% español.
 * - Soft-Delete (`!deleted_at`) y RBAC estricto de 4 roles (`ADMIN`, `WORKER`, `AUDITOR`, `CLIENT` Nivel 2).
 */

import type { OrganizacionEntity } from './activeCertificates';
import type { ProgramacionAuditEntity } from './auditExecution';
import type {
  AuditLinkLevel,
  AuditLinkNature,
  ProgramaAuditoriaEntity,
} from './auditPlanningEngine';
import { getAuditsForCertificateSorted } from './certificateAuditSelector';
import { resolveCertVersionSnapshotForAudit } from './certificadoVersionDomain';
import {
  formatAuditCodename,
  resolveShortConglomeradoName,
  resolveShortOrganizacionName,
} from './codenameDomain';
import type { ConglomeradoEntity } from './conglomeradoDomain';
import type { UserProfile } from './healthCheck';
import type { CertificadoDetailEntity } from './multisiteSampling';
import {
  normalizeMultiViewSearchText,
  filterRecordsWithFacets,
  type MultiViewFacetCategory,
  type MultiViewSelectionMap,
} from './universalTemplate';
import {
  resolveCertEffectiveNatureInBox,
  scopeVinculosForProfile,
  type SoftDeletableCertificado,
  type VinculoCertificadoItem,
  type VinculoEntity,
} from './vinculoDomain';
import { containsRawUuid } from './zeroUuid';

const RAW_UUID_GLOBAL_REGEX = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

export type OrgPickerGroupingMode = 'audit' | 'vinculo';

export type OrgPickerCertSource = SoftDeletableCertificado | CertificadoDetailEntity;

export interface OrgMultiViewCertMetaResult<TSectionCertMeta> {
  domainExtra: TSectionCertMeta;
  domainCells?: Record<string, string>;
  searchText?: string;
  activeAuditOverride?: ProgramacionAuditEntity | null;
}

export interface OrgCertMetaResolverContext {
  certificado: OrgPickerCertSource;
  organizacion: OrganizacionEntity;
  conglomerado: ConglomeradoEntity | null;
  audits: ProgramacionAuditEntity[];
  latestAudit: ProgramacionAuditEntity | null;
  program: ProgramaAuditoriaEntity | null;
  vinculo: VinculoEntity | null;
  vinculoItem: VinculoCertificadoItem | null;
}

export type OrgCertMetaResolver<TSectionCertMeta> = (
  ctx: OrgCertMetaResolverContext
) => OrgMultiViewCertMetaResult<TSectionCertMeta>;

export interface OrgMultiViewCertItem<TSectionCertMeta = Record<string, never>> {
  certId: string;
  orgId: string;
  numero_certificado: string;
  norma_codigo: string;
  estatus: string;
  version_numero: number | null;
  audits: ProgramacionAuditEntity[];
  latestAudit: ProgramacionAuditEntity | null;
  program: ProgramaAuditoriaEntity | null;
  linkedSiblingAuditIds: string[];
  isLinkedAuditGroupMember: boolean;
  vinculo: VinculoEntity | null;
  vinculoItem: VinculoCertificadoItem | null;
  vinculoEffectiveNature: AuditLinkNature | null;
  vinculoSiblingCertCount: number;
  domainCells: Record<string, string>;
  domainExtra: TSectionCertMeta;
  searchText: string;
}

export interface OrgMultiViewRow<TSectionCertMeta = Record<string, never>> {
  orgId: string;
  nombre: string;
  abreviacion: string | null;
  nombreCorto: string;
  rif: string;
  conglomeradoId: string | null;
  conglomeradoShortName: string;
  normas: string[];
  hasLinkedAudits: boolean;
  hasLinkedVinculos: boolean;
  certificates: OrgMultiViewCertItem<TSectionCertMeta>[];
  certsCount: number;
  linkedAuditGroupsCount: number;
  linkedVinculoBoxesCount: number;
  auditsCount: number;
  searchHaystack: string;
}

export interface BuildOrgMultiViewRowsOptions<TSectionCertMeta = Record<string, never>> {
  profile: UserProfile | null | undefined;
  organizaciones?: ReadonlyArray<OrganizacionEntity>;
  conglomerados?: ReadonlyArray<ConglomeradoEntity>;
  certificados?: ReadonlyArray<OrgPickerCertSource>;
  audits?: ReadonlyArray<ProgramacionAuditEntity>;
  programs?: ReadonlyArray<ProgramaAuditoriaEntity>;
  vinculos?: ReadonlyArray<VinculoEntity>;
  authorizedClientOrgIds?: ReadonlyArray<string>;
  assignedAuditCertIds?: ReadonlyArray<string>;
  resolveCertMeta?: OrgCertMetaResolver<TSectionCertMeta>;
  includeOrgsWithoutCerts?: boolean;
  onlyCertsWithAudits?: boolean;
}

export interface OrgPickerTableRow<TSectionCertMeta = Record<string, never>> {
  groupKey: string;
  groupLabel: string;
  groupSubLabel: string;
  groupBadgeText: string;
  groupNature: AuditLinkNature | null;
  isLinkedGroup: boolean;
  isFirstRowInGroup: boolean;
  groupRowSpan: number;
  groupTotalCount: number;
  certId: string;
  orgId: string;
  auditId: string | null;
  programId: string | null;
  vinculoId: string | null;
  numero_certificado: string;
  norma_codigo: string;
  version_numero: number | null;
  estatus: string;
  latestAudit: ProgramacionAuditEntity | null;
  program: ProgramaAuditoriaEntity | null;
  vinculo: VinculoEntity | null;
  domainCells: Record<string, string>;
  domainExtra: TSectionCertMeta;
}

export interface OrgCertPickerModalModel<TSectionCertMeta = Record<string, never>> {
  orgId: string;
  orgNombre: string;
  orgAbreviacion: string | null;
  orgNombreCorto: string;
  orgRif: string;
  conglomeradoShortName: string;
  groupingMode: OrgPickerGroupingMode;
  searchQuery: string;
  totalCertsCount: number;
  filteredCertsCount: number;
  totalAuditsCount: number;
  linkedGroupsCount: number;
  rows: OrgPickerTableRow<TSectionCertMeta>[];
}

export interface BuildOrgCertPickerModalOptions<TSectionCertMeta = Record<string, never>> {
  orgId: string | null | undefined;
  modalSearchQuery?: string;
  groupingMode?: OrgPickerGroupingMode;
  orgRows?: ReadonlyArray<OrgMultiViewRow<TSectionCertMeta>>;
  profile?: UserProfile | null | undefined;
  organizaciones?: ReadonlyArray<OrganizacionEntity>;
  conglomerados?: ReadonlyArray<ConglomeradoEntity>;
  certificados?: ReadonlyArray<OrgPickerCertSource>;
  audits?: ReadonlyArray<ProgramacionAuditEntity>;
  programs?: ReadonlyArray<ProgramaAuditoriaEntity>;
  vinculos?: ReadonlyArray<VinculoEntity>;
  authorizedClientOrgIds?: ReadonlyArray<string>;
  assignedAuditCertIds?: ReadonlyArray<string>;
  resolveCertMeta?: OrgCertMetaResolver<TSectionCertMeta>;
  onlyCertsWithAudits?: boolean;
}

/**
 * Strips any accidental raw UUID substrings from user-visible labels and tooltips.
 */
export function sanitizePickerText(
  value: string | null | undefined,
  fallback = ''
): string {
  if (!value) return fallback;
  const cleaned = value.replace(RAW_UUID_GLOBAL_REGEX, '').replace(/\s+/g, ' ').trim();
  if (!cleaned || containsRawUuid(cleaned)) return fallback;
  return cleaned;
}

function isAuditorAssignedToAudit(
  audit: ProgramacionAuditEntity,
  profileId: string
): boolean {
  if (audit.auditor_lider_id === profileId) return true;
  return (audit.equipo || []).some((m) => m.id_auditor === profileId);
}

function resolveCertificateVersionNumber(
  cert: OrgPickerCertSource,
  latestAudit: ProgramacionAuditEntity | null
): number | null {
  const fromAudit =
    typeof latestAudit?.version_numero === 'number' &&
    Number.isFinite(latestAudit.version_numero) &&
    latestAudit.version_numero >= 1
      ? Math.floor(latestAudit.version_numero)
      : null;
  if (fromAudit !== null) return fromAudit;

  if ('sitios' in cert && Array.isArray(cert.sitios) && latestAudit) {
    const snap = resolveCertVersionSnapshotForAudit(latestAudit, [cert]);
    if (snap && typeof snap.versionNumero === 'number' && snap.versionNumero >= 1) {
      return Math.floor(snap.versionNumero);
    }
  }

  if (
    'version_actual_numero' in cert &&
    typeof cert.version_actual_numero === 'number' &&
    Number.isFinite(cert.version_actual_numero) &&
    cert.version_actual_numero >= 1
  ) {
    return Math.floor(cert.version_actual_numero);
  }

  return null;
}

function buildSynthesizedCertFromAudit(audit: ProgramacionAuditEntity): SoftDeletableCertificado {
  return {
    id: audit.id_certificado,
    numero_certificado: sanitizePickerText(audit.numero_certificado, 'Certificado'),
    id_organizacion: audit.id_organizacion,
    organizacion_nombre: sanitizePickerText(audit.organizacion_nombre, 'Organización'),
    organizacion_abreviacion: audit.organizacion_abreviacion
      ? sanitizePickerText(audit.organizacion_abreviacion)
      : undefined,
    organizacion_rif: '',
    id_norma: '',
    norma_codigo: sanitizePickerText(audit.norma_codigo, 'ISO'),
    norma_titulo: '',
    esquema: sanitizePickerText(audit.norma_codigo, 'ISO'),
    id_estatus: '',
    estatus: 'Activo',
    id_sector_iaf: '',
    sector_iaf: audit.sector_iaf,
    sector_iaf_descripcion: '',
    id_subsector_iaf: '',
    version_actual_numero:
      typeof audit.version_numero === 'number' && audit.version_numero >= 1
        ? Math.floor(audit.version_numero)
        : undefined,
    fecha_emision: '',
    fecha_vencimiento: '',
    alcance: '',
    multisitio: false,
    sitios: [],
    procesos: [],
    turnos: [],
    noAplicables: [],
    auditorias: [],
    fechas: [],
    contactos: [],
    deleted_at: null,
  };
}

function defaultCertMetaResolver<TSectionCertMeta>(
  ctx: OrgCertMetaResolverContext
): OrgMultiViewCertMetaResult<TSectionCertMeta> {
  const codename = ctx.latestAudit
    ? formatAuditCodename(ctx.latestAudit)
    : 'Sin auditorías';
  return {
    domainExtra: {} as TSectionCertMeta,
    domainCells: {
      auditoria: codename,
      estatus: ctx.latestAudit?.estado_ciclo || ctx.latestAudit?.estatus || ctx.certificado.estatus,
    },
    searchText: '',
  };
}

function formatLinkLevelLabel(level: AuditLinkLevel | undefined): string {
  switch (level) {
    case 'NIVEL_1_INTRA_ORG':
      return 'Intra-Organización';
    case 'NIVEL_2_INTER_ORG':
      return 'Inter-Organización';
    default:
      return 'Individual';
  }
}

function buildDomainCellsHaystack(cells: Record<string, string>): string {
  return Object.values(cells)
    .map((val) => sanitizePickerText(val))
    .filter(Boolean)
    .join(' ');
}

/**
 * Construye las filas del Multi View centradas en `Organización`, respetando RBAC de 4 roles,
 * aislamiento Nivel 2 de `CLIENT`, Soft-Delete (`!deleted_at`) y búsqueda integral.
 */
export function buildOrgMultiViewRows<TSectionCertMeta = Record<string, never>>(
  opts: BuildOrgMultiViewRowsOptions<TSectionCertMeta>
): OrgMultiViewRow<TSectionCertMeta>[] {
  const {
    profile,
    organizaciones = [],
    conglomerados = [],
    certificados = [],
    audits = [],
    programs = [],
    vinculos = [],
    authorizedClientOrgIds = [],
    assignedAuditCertIds = [],
    resolveCertMeta,
    includeOrgsWithoutCerts = false,
    onlyCertsWithAudits = false,
  } = opts;

  if (!profile || profile.status !== 'APPROVED') {
    return [];
  }

  const isStaff = profile.role === 'ADMIN' || profile.role === 'WORKER';
  const isAuditor = profile.role === 'AUDITOR';
  const isClient = profile.role === 'CLIENT';
  if (!isStaff && !isAuditor && !isClient) {
    return [];
  }

  const allowedClientOrgSet = new Set(authorizedClientOrgIds);
  const explicitAssignedCertSet = new Set(assignedAuditCertIds);

  // Merge active audits from flat `audits` and `programs[].auditorias`
  const activePrograms = programs.filter((p) => !p.deleted_at);
  const rawAuditById = new Map<string, ProgramacionAuditEntity>();
  const rawProgramById = new Map<string, ProgramaAuditoriaEntity>();

  for (const aud of audits) {
    if (!aud.deleted_at) {
      rawAuditById.set(aud.id, aud);
    }
  }
  for (const prog of activePrograms) {
    rawProgramById.set(prog.id, prog);
    for (const aud of prog.auditorias || []) {
      if (!aud.deleted_at && !rawAuditById.has(aud.id)) {
        rawAuditById.set(aud.id, aud);
      }
    }
  }

  // Scope visible audits by role (Level 2 enforced for CLIENT)
  const scopedAudits = Array.from(rawAuditById.values()).filter((aud) => {
    if (isStaff) return true;
    if (isAuditor) {
      return (
        isAuditorAssignedToAudit(aud, profile.id) ||
        explicitAssignedCertSet.has(aud.id_certificado)
      );
    }
    if (isClient) {
      return allowedClientOrgSet.has(aud.id_organizacion);
    }
    return false;
  });

  const allowedAuditorCertSet = new Set<string>(explicitAssignedCertSet);
  if (isAuditor) {
    for (const aud of scopedAudits) {
      if (aud.id_certificado) {
        allowedAuditorCertSet.add(aud.id_certificado);
      }
    }
  }

  // Build scoped programs so CLIENT/AUDITOR never receive sibling org audits
  const scopedAuditById = new Map<string, ProgramacionAuditEntity>(
    scopedAudits.map((a) => [a.id, a])
  );
  const scopedProgramById = new Map<string, ProgramaAuditoriaEntity>();
  const scopedAuditsByProgramId = new Map<string, ProgramacionAuditEntity[]>();

  for (const prog of activePrograms) {
    const progAuditsMap = new Map<string, ProgramacionAuditEntity>();
    for (const a of prog.auditorias || []) {
      if (!a.deleted_at && scopedAuditById.has(a.id)) {
        progAuditsMap.set(a.id, scopedAuditById.get(a.id) ?? a);
      }
    }
    for (const a of scopedAudits) {
      if (a.id_programa_auditoria === prog.id && !progAuditsMap.has(a.id)) {
        progAuditsMap.set(a.id, a);
      }
    }
    const visibleAudits = Array.from(progAuditsMap.values());
    if (!isStaff && visibleAudits.length === 0) continue;
    scopedProgramById.set(prog.id, {
      ...prog,
      auditorias: visibleAudits,
    });
    scopedAuditsByProgramId.set(prog.id, visibleAudits);
  }

  // Scope active certificates
  const certMap = new Map<string, OrgPickerCertSource>();
  for (const cert of certificados) {
    if (cert.deleted_at) continue;
    if (isClient && !allowedClientOrgSet.has(cert.id_organizacion)) continue;
    if (isAuditor && !allowedAuditorCertSet.has(cert.id)) continue;
    certMap.set(cert.id, cert);
  }

  // Synthesize missing certificates referenced by visible audits (compact fixtures)
  for (const aud of scopedAudits) {
    if (!aud.id_certificado || certMap.has(aud.id_certificado)) continue;
    if (isClient && !allowedClientOrgSet.has(aud.id_organizacion)) continue;
    if (isAuditor && !allowedAuditorCertSet.has(aud.id_certificado)) continue;
    certMap.set(aud.id_certificado, buildSynthesizedCertFromAudit(aud));
  }

  // Scope active vinculos
  const scopedVinculos = scopeVinculosForProfile(
    vinculos.filter((v) => !v.deleted_at),
    profile,
    authorizedClientOrgIds,
    Array.from(allowedAuditorCertSet)
  );
  const vinculoByCertId = new Map<
    string,
    { box: VinculoEntity; item: VinculoCertificadoItem; activeCount: number }
  >();
  for (const box of scopedVinculos) {
    if (box.deleted_at) continue;
    const activeItems = box.certificados.filter((vc) => !vc.deleted_at);
    for (const item of activeItems) {
      vinculoByCertId.set(item.id_certificado, {
        box,
        item,
        activeCount: activeItems.length,
      });
    }
  }

  // Scope active organizations
  const activeOrgs = organizaciones.filter((o) => !o.deleted_at);
  const orgMap = new Map<string, OrganizacionEntity>();
  for (const org of activeOrgs) {
    if (isClient && !allowedClientOrgSet.has(org.id)) continue;
    if (isAuditor) {
      const hasVisibleCert = Array.from(certMap.values()).some(
        (c) => c.id_organizacion === org.id
      );
      if (!hasVisibleCert) continue;
    }
    orgMap.set(org.id, org);
  }

  // Ensure organizations referenced by visible certificates exist in orgMap
  for (const cert of certMap.values()) {
    if (!cert.id_organizacion || orgMap.has(cert.id_organizacion)) continue;
    if (isClient && !allowedClientOrgSet.has(cert.id_organizacion)) continue;
    orgMap.set(cert.id_organizacion, {
      id: cert.id_organizacion,
      nombre: sanitizePickerText(cert.organizacion_nombre, 'Organización'),
      abreviacion: cert.organizacion_abreviacion
        ? sanitizePickerText(cert.organizacion_abreviacion)
        : undefined,
      rif: sanitizePickerText(cert.organizacion_rif),
      estatus: 'Activo',
      deleted_at: null,
    });
  }

  const congById = new Map(
    conglomerados.filter((g) => !g.deleted_at).map((g) => [g.id, g])
  );

  const certsByOrgId = new Map<string, OrgPickerCertSource[]>();
  for (const cert of certMap.values()) {
    const bucket = certsByOrgId.get(cert.id_organizacion) ?? [];
    bucket.push(cert);
    certsByOrgId.set(cert.id_organizacion, bucket);
  }

  const resolver: OrgCertMetaResolver<TSectionCertMeta> =
    resolveCertMeta ?? defaultCertMetaResolver<TSectionCertMeta>;

  const rows: OrgMultiViewRow<TSectionCertMeta>[] = [];

  for (const org of orgMap.values()) {
    const rawOrgCerts = (certsByOrgId.get(org.id) ?? [])
      .slice()
      .sort((a, b) =>
        (a.numero_certificado || '').localeCompare(b.numero_certificado || '', 'es', {
          numeric: true,
        })
      );

    const conglomerado = org.id_grupo_empresarial
      ? congById.get(org.id_grupo_empresarial) ?? null
      : null;

    const certItems: OrgMultiViewCertItem<TSectionCertMeta>[] = [];
    const orgAuditIds = new Set<string>();
    const linkedProgramIds = new Set<string>();
    const linkedVinculoIds = new Set<string>();
    const normaSet = new Set<string>();

    for (const cert of rawOrgCerts) {
      const certAudits = getAuditsForCertificateSorted(cert.id, scopedAudits);
      if (onlyCertsWithAudits && certAudits.length === 0) {
        continue;
      }

      const defaultLatest = certAudits[0] ?? null;
      const preliminaryProgram =
        defaultLatest?.id_programa_auditoria
          ? scopedProgramById.get(defaultLatest.id_programa_auditoria) ?? null
          : null;
      const vEntry = vinculoByCertId.get(cert.id) ?? null;

      const metaResult = resolver({
        certificado: cert,
        organizacion: org,
        conglomerado,
        audits: certAudits,
        latestAudit: defaultLatest,
        program: preliminaryProgram,
        vinculo: vEntry?.box ?? null,
        vinculoItem: vEntry?.item ?? null,
      });

      const resolvedAudit =
        metaResult.activeAuditOverride !== undefined
          ? metaResult.activeAuditOverride
          : defaultLatest;

      const program =
        resolvedAudit?.id_programa_auditoria
          ? scopedProgramById.get(resolvedAudit.id_programa_auditoria) ?? null
          : null;

      const siblingAuditsInProgram = program
        ? scopedAuditsByProgramId.get(program.id) ?? []
        : [];
      const siblingAuditIds = siblingAuditsInProgram.map((a) => a.id);
      const isLinkedAuditGroupMember = Boolean(
        resolvedAudit && program && program.es_vinculada && siblingAuditIds.length > 1
      );

      for (const a of certAudits) {
        orgAuditIds.add(a.id);
      }
      if (isLinkedAuditGroupMember && program) {
        linkedProgramIds.add(program.id);
      }
      if (vEntry && vEntry.box.es_vinculada && vEntry.activeCount >= 2) {
        linkedVinculoIds.add(vEntry.box.id);
      }

      const normaClean = sanitizePickerText(cert.norma_codigo, 'ISO');
      if (normaClean) normaSet.add(normaClean);

      const versionNumero = resolveCertificateVersionNumber(cert, resolvedAudit);
      const domainCells: Record<string, string> = {};
      if (metaResult.domainCells) {
        for (const [k, v] of Object.entries(metaResult.domainCells)) {
          domainCells[k] = sanitizePickerText(v);
        }
      }

      const vinculoEffectiveNature = vEntry
        ? resolveCertEffectiveNatureInBox(vEntry.box, vEntry.item)
        : null;

      certItems.push({
        certId: cert.id,
        orgId: org.id,
        numero_certificado: sanitizePickerText(cert.numero_certificado, 'Certificado'),
        norma_codigo: normaClean,
        estatus: sanitizePickerText(cert.estatus, 'Activo'),
        version_numero: versionNumero,
        audits: certAudits,
        latestAudit: resolvedAudit,
        program,
        linkedSiblingAuditIds: siblingAuditIds,
        isLinkedAuditGroupMember,
        vinculo: vEntry?.box ?? null,
        vinculoItem: vEntry?.item ?? null,
        vinculoEffectiveNature,
        vinculoSiblingCertCount: vEntry?.activeCount ?? 0,
        domainCells,
        domainExtra: metaResult.domainExtra,
        searchText: sanitizePickerText(metaResult.searchText),
      });
    }

    if (certItems.length === 0 && !includeOrgsWithoutCerts) {
      continue;
    }

    const nombreClean = sanitizePickerText(org.nombre, 'Organización');
    const abreviacionClean = org.abreviacion
      ? sanitizePickerText(org.abreviacion) || null
      : null;
    const nombreCorto = resolveShortOrganizacionName({
      nombre: nombreClean,
      abreviacion: abreviacionClean,
    });
    const rifClean = sanitizePickerText(org.rif);
    const conglomeradoShortName = conglomerado
      ? resolveShortConglomeradoName({
          nombre: conglomerado.nombre,
          abreviacion: conglomerado.abreviacion,
          codigo_grupo: conglomerado.codigo_grupo,
        })
      : org.grupo_empresarial_nombre
      ? resolveShortConglomeradoName({ nombre: org.grupo_empresarial_nombre })
      : 'Independiente';

    const haystackParts: string[] = [
      nombreClean,
      nombreCorto,
      abreviacionClean || '',
      rifClean,
      conglomeradoShortName,
      conglomerado ? sanitizePickerText(conglomerado.nombre) : '',
      conglomerado ? sanitizePickerText(conglomerado.codigo_grupo) : '',
    ];

    for (const item of certItems) {
      haystackParts.push(
        item.numero_certificado,
        item.norma_codigo,
        item.estatus,
        item.version_numero !== null ? `v${item.version_numero}` : ''
      );
      for (const aud of item.audits) {
        haystackParts.push(
          sanitizePickerText(aud.codigo_auditoria),
          formatAuditCodename(aud),
          sanitizePickerText(aud.tipo_auditoria),
          sanitizePickerText(aud.estado_ciclo || aud.estatus)
        );
      }
      if (item.program) {
        haystackParts.push(
          sanitizePickerText(item.program.codigo_programa),
          sanitizePickerText(item.program.etiqueta),
          sanitizePickerText(item.program.tipo_vinculacion)
        );
      }
      if (item.vinculo) {
        haystackParts.push(
          sanitizePickerText(item.vinculo.etiqueta),
          sanitizePickerText(item.vinculo.codigo_vinculo),
          sanitizePickerText(item.vinculo.tipo_vinculacion),
          item.vinculoEffectiveNature || ''
        );
      }
      if (item.searchText) {
        haystackParts.push(item.searchText);
      }
      const cellsText = buildDomainCellsHaystack(item.domainCells);
      if (cellsText) {
        haystackParts.push(cellsText);
      }
    }

    const searchHaystack = haystackParts
      .map((part) => sanitizePickerText(part))
      .filter(Boolean)
      .join(' ');

    rows.push({
      orgId: org.id,
      nombre: nombreClean,
      abreviacion: abreviacionClean,
      nombreCorto,
      rif: rifClean,
      conglomeradoId: conglomerado?.id ?? org.id_grupo_empresarial ?? null,
      conglomeradoShortName,
      normas: Array.from(normaSet).sort((a, b) => a.localeCompare(b, 'es')),
      hasLinkedAudits: linkedProgramIds.size > 0,
      hasLinkedVinculos: linkedVinculoIds.size > 0,
      certificates: certItems,
      certsCount: certItems.length,
      linkedAuditGroupsCount: linkedProgramIds.size,
      linkedVinculoBoxesCount: linkedVinculoIds.size,
      auditsCount: orgAuditIds.size,
      searchHaystack,
    });
  }

  return rows.sort((a, b) =>
    a.nombreCorto.localeCompare(b.nombreCorto, 'es', { numeric: true })
  );
}

interface InternalGroupDescriptor<TSectionCertMeta> {
  groupKey: string;
  groupLabel: string;
  groupSubLabel: string;
  groupBadgeText: string;
  groupNature: AuditLinkNature | null;
  isLinkedGroup: boolean;
  groupRank: number;
  sortDateKey: string;
  item: OrgMultiViewCertItem<TSectionCertMeta>;
}

function buildRowGroupDescriptor<TSectionCertMeta>(
  item: OrgMultiViewCertItem<TSectionCertMeta>,
  groupingMode: OrgPickerGroupingMode,
  siblingCountByProgramId: ReadonlyMap<string, number>,
  siblingCountByVinculoId: ReadonlyMap<string, number>
): InternalGroupDescriptor<TSectionCertMeta> {
  if (groupingMode === 'vinculo') {
    if (item.vinculo) {
      const sameOrgBoxCount = siblingCountByVinculoId.get(item.vinculo.id) ?? 1;
      const isGroupedBox = Boolean(
        item.vinculo.es_vinculada &&
          (sameOrgBoxCount >= 2 || item.vinculoSiblingCertCount >= 2)
      );
      const effectiveNature =
        item.vinculoEffectiveNature || item.vinculo.tipo_vinculacion;
      const boxEtiqueta = sanitizePickerText(item.vinculo.etiqueta, 'Caja de Vínculo');
      const boxCode = sanitizePickerText(item.vinculo.codigo_vinculo);

      if (isGroupedBox) {
        return {
          groupKey: `vinculo:${item.vinculo.id}`,
          groupLabel: sanitizePickerText(`${effectiveNature} · ${boxEtiqueta}`, effectiveNature),
          groupSubLabel: boxCode || formatLinkLevelLabel(item.vinculo.nivel_vinculacion),
          groupBadgeText: effectiveNature,
          groupNature: effectiveNature,
          isLinkedGroup: true,
          groupRank: 0,
          sortDateKey: '',
          item,
        };
      }

      return {
        groupKey: `vinculo-ind:${item.certId}`,
        groupLabel: 'Individual',
        groupSubLabel: boxEtiqueta,
        groupBadgeText: 'Individual',
        groupNature: 'Individual',
        isLinkedGroup: false,
        groupRank: 1,
        sortDateKey: '',
        item,
      };
    }

    return {
      groupKey: `libre:${item.certId}`,
      groupLabel: 'Libre',
      groupSubLabel: 'Sin caja asignada',
      groupBadgeText: 'Libre',
      groupNature: null,
      isLinkedGroup: false,
      groupRank: 2,
      sortDateKey: '',
      item,
    };
  }

  // Default: 'audit' grouping mode
  const audit = item.latestAudit;
  const program = item.program;
  const sameOrgProgramCount = program
    ? siblingCountByProgramId.get(program.id) ?? 1
    : 0;
  const isLinked = Boolean(
    audit &&
      program &&
      program.es_vinculada &&
      (sameOrgProgramCount >= 2 || item.linkedSiblingAuditIds.length > 1)
  );

  if (audit && isLinked && program) {
    const nature: AuditLinkNature =
      audit.tipo_vinculacion || program.tipo_vinculacion || 'Combinada';
    const codename = formatAuditCodename(audit);
    const progCode = sanitizePickerText(program.codigo_programa);
    const progLabel = sanitizePickerText(program.etiqueta);
    const subLabel =
      progCode ||
      (progLabel && progLabel !== nature ? progLabel : formatLinkLevelLabel(program.nivel_vinculacion));

    return {
      groupKey: `prog:${program.id}`,
      groupLabel: sanitizePickerText(`${nature} · ${codename}`, nature),
      groupSubLabel: sanitizePickerText(subLabel),
      groupBadgeText: nature,
      groupNature: nature,
      isLinkedGroup: true,
      groupRank: 0,
      sortDateKey: audit.fecha_inicio || '',
      item,
    };
  }

  if (audit) {
    const codename = formatAuditCodename(audit);
    const auditCode = sanitizePickerText(audit.codigo_auditoria);
    return {
      groupKey: `ind:${item.certId}`,
      groupLabel: 'Individual',
      groupSubLabel: auditCode ? `${codename} · ${auditCode}` : codename,
      groupBadgeText: 'Individual',
      groupNature: 'Individual',
      isLinkedGroup: false,
      groupRank: 1,
      sortDateKey: audit.fecha_inicio || '',
      item,
    };
  }

  return {
    groupKey: `none:${item.certId}`,
    groupLabel: 'Sin auditorías',
    groupSubLabel: 'Pendiente de programar',
    groupBadgeText: 'Sin auditorías',
    groupNature: null,
    isLinkedGroup: false,
    groupRank: 2,
    sortDateKey: '',
    item,
  };
}

function descriptorMatchesModalQuery<TSectionCertMeta>(
  desc: InternalGroupDescriptor<TSectionCertMeta>,
  normalizedQuery: string
): boolean {
  if (!normalizedQuery) return true;
  const { item } = desc;
  const auditParts = item.latestAudit
    ? [
        sanitizePickerText(item.latestAudit.codigo_auditoria),
        formatAuditCodename(item.latestAudit),
        sanitizePickerText(item.latestAudit.tipo_auditoria),
        sanitizePickerText(item.latestAudit.estado_ciclo || item.latestAudit.estatus),
      ]
    : [];

  const haystack = normalizeMultiViewSearchText(
    [
      item.numero_certificado,
      item.norma_codigo,
      item.estatus,
      item.version_numero !== null ? `v${item.version_numero}` : '',
      desc.groupLabel,
      desc.groupSubLabel,
      desc.groupBadgeText,
      ...auditParts,
      item.searchText,
      buildDomainCellsHaystack(item.domainCells),
    ]
      .filter(Boolean)
      .join(' ')
  );

  return haystack.includes(normalizedQuery);
}

/**
 * Construye el modelo tabular del Pop-up Selector para una Organización específica:
 * - Agrupa certificados contiguamente por su Auditoría Vinculada (o caja de Vínculo).
 * - Filtra en tiempo real por `modalSearchQuery`.
 * - Recalcula `isFirstRowInGroup` y `groupRowSpan` exactos sobre las filas visibles tras filtrar.
 */
export function buildOrgCertPickerModalModel<TSectionCertMeta = Record<string, never>>(
  opts: BuildOrgCertPickerModalOptions<TSectionCertMeta>
): OrgCertPickerModalModel<TSectionCertMeta> | null {
  const {
    orgId,
    modalSearchQuery = '',
    groupingMode = 'audit',
    orgRows,
  } = opts;

  if (!orgId) return null;

  const sourceRows: ReadonlyArray<OrgMultiViewRow<TSectionCertMeta>> =
    orgRows ??
    buildOrgMultiViewRows<TSectionCertMeta>({
      profile: opts.profile,
      organizaciones: opts.organizaciones,
      conglomerados: opts.conglomerados,
      certificados: opts.certificados,
      audits: opts.audits,
      programs: opts.programs,
      vinculos: opts.vinculos,
      authorizedClientOrgIds: opts.authorizedClientOrgIds,
      assignedAuditCertIds: opts.assignedAuditCertIds,
      resolveCertMeta: opts.resolveCertMeta,
      onlyCertsWithAudits: opts.onlyCertsWithAudits,
    });

  const targetOrg = sourceRows.find((r) => r.orgId === orgId);
  if (!targetOrg) return null;

  const siblingCountByProgramId = new Map<string, number>();
  const siblingCountByVinculoId = new Map<string, number>();
  for (const cert of targetOrg.certificates) {
    if (cert.program) {
      siblingCountByProgramId.set(
        cert.program.id,
        (siblingCountByProgramId.get(cert.program.id) ?? 0) + 1
      );
    }
    if (cert.vinculo) {
      siblingCountByVinculoId.set(
        cert.vinculo.id,
        (siblingCountByVinculoId.get(cert.vinculo.id) ?? 0) + 1
      );
    }
  }

  const allDescriptors = targetOrg.certificates.map((certItem) =>
    buildRowGroupDescriptor(
      certItem,
      groupingMode,
      siblingCountByProgramId,
      siblingCountByVinculoId
    )
  );

  // Total certs in each group prior to filtering (useful when a group only has 1 visible org cert in NIVEL_2)
  const totalCountByGroupKey = new Map<string, number>();
  for (const desc of allDescriptors) {
    totalCountByGroupKey.set(
      desc.groupKey,
      (totalCountByGroupKey.get(desc.groupKey) ?? 0) + 1
    );
  }

  const normalizedQuery = normalizeMultiViewSearchText(modalSearchQuery);
  const filteredDescriptors = allDescriptors.filter((d) =>
    descriptorMatchesModalQuery(d, normalizedQuery)
  );

  // Group contiguously: preserve deterministic ordering across groups and certs within each group
  const groupedBuckets = new Map<string, InternalGroupDescriptor<TSectionCertMeta>[]>();
  for (const desc of filteredDescriptors) {
    const bucket = groupedBuckets.get(desc.groupKey) ?? [];
    bucket.push(desc);
    groupedBuckets.set(desc.groupKey, bucket);
  }

  const sortedGroupKeys = Array.from(groupedBuckets.keys()).sort((keyA, keyB) => {
    const listA = groupedBuckets.get(keyA) ?? [];
    const listB = groupedBuckets.get(keyB) ?? [];
    const headA = listA[0];
    const headB = listB[0];
    if (!headA || !headB) return 0;

    if (headA.groupRank !== headB.groupRank) {
      return headA.groupRank - headB.groupRank;
    }
    if (headA.isLinkedGroup && headB.isLinkedGroup && listA.length !== listB.length) {
      return listB.length - listA.length;
    }
    if (headA.sortDateKey !== headB.sortDateKey) {
      return headB.sortDateKey.localeCompare(headA.sortDateKey);
    }
    const labelCmp = headA.groupLabel.localeCompare(headB.groupLabel, 'es', {
      numeric: true,
    });
    if (labelCmp !== 0) return labelCmp;
    return headA.item.numero_certificado.localeCompare(
      headB.item.numero_certificado,
      'es',
      { numeric: true }
    );
  });

  const tableRows: OrgPickerTableRow<TSectionCertMeta>[] = [];
  let linkedGroupsCount = 0;

  for (const gKey of sortedGroupKeys) {
    const groupItems = (groupedBuckets.get(gKey) ?? [])
      .slice()
      .sort((a, b) =>
        a.item.numero_certificado.localeCompare(b.item.numero_certificado, 'es', {
          numeric: true,
        })
      );

    if (groupItems.length === 0) continue;
    if (groupItems[0].isLinkedGroup) {
      linkedGroupsCount += 1;
    }

    const visibleSpan = groupItems.length;
    const rawGroupTotal = totalCountByGroupKey.get(gKey) ?? visibleSpan;
    const externalGroupTotal =
      groupItems[0].isLinkedGroup && groupingMode === 'audit'
        ? Math.max(rawGroupTotal, groupItems[0].item.linkedSiblingAuditIds.length)
        : groupItems[0].isLinkedGroup && groupingMode === 'vinculo'
        ? Math.max(rawGroupTotal, groupItems[0].item.vinculoSiblingCertCount)
        : rawGroupTotal;

    groupItems.forEach((desc, idx) => {
      const { item } = desc;
      tableRows.push({
        groupKey: desc.groupKey,
        groupLabel: desc.groupLabel,
        groupSubLabel: desc.groupSubLabel,
        groupBadgeText: desc.groupBadgeText,
        groupNature: desc.groupNature,
        isLinkedGroup: desc.isLinkedGroup,
        isFirstRowInGroup: idx === 0,
        groupRowSpan: visibleSpan,
        groupTotalCount: externalGroupTotal,
        certId: item.certId,
        orgId: item.orgId,
        auditId: item.latestAudit?.id ?? null,
        programId: item.program?.id ?? null,
        vinculoId: item.vinculo?.id ?? null,
        numero_certificado: item.numero_certificado,
        norma_codigo: item.norma_codigo,
        version_numero: item.version_numero,
        estatus: item.estatus,
        latestAudit: item.latestAudit,
        program: item.program,
        vinculo: item.vinculo,
        domainCells: item.domainCells,
        domainExtra: item.domainExtra,
      });
    });
  }

  return {
    orgId: targetOrg.orgId,
    orgNombre: targetOrg.nombre,
    orgAbreviacion: targetOrg.abreviacion,
    orgNombreCorto: targetOrg.nombreCorto,
    orgRif: targetOrg.rif,
    conglomeradoShortName: targetOrg.conglomeradoShortName,
    groupingMode,
    searchQuery: modalSearchQuery,
    totalCertsCount: targetOrg.certsCount,
    filteredCertsCount: tableRows.length,
    totalAuditsCount: targetOrg.auditsCount,
    linkedGroupsCount,
    rows: tableRows,
  };
}

/**
 * Facetas base reutilizables para Multi View basado en `Organización`.
 */
export function buildDefaultOrgMultiViewFacetCategories<
  TSectionCertMeta = Record<string, never>,
>(): MultiViewFacetCategory<OrgMultiViewRow<TSectionCertMeta>>[] {
  return [
    {
      id: 'conglomerado',
      label: 'Conglomerado',
      extractValues: (row) => row.conglomeradoShortName,
    },
    {
      id: 'vinculacion',
      label: 'Vinculación',
      options: [
        { value: 'CON_VINCULADAS', label: 'Con auditorías vinculadas' },
        { value: 'SOLO_INDIVIDUAL', label: 'Solo individuales / sin vincular' },
      ],
      extractValues: (row) =>
        row.hasLinkedAudits || row.hasLinkedVinculos
          ? 'CON_VINCULADAS'
          : 'SOLO_INDIVIDUAL',
    },
    {
      id: 'norma',
      label: 'Norma',
      extractValues: (row) => row.normas,
    },
  ];
}

/**
 * Aplica búsqueda y facetas sobre filas de `Organización` usando `searchHaystack`.
 */
export function filterOrgMultiViewRows<TSectionCertMeta = Record<string, never>>(
  rows: ReadonlyArray<OrgMultiViewRow<TSectionCertMeta>>,
  query: string,
  facetCategories: ReadonlyArray<MultiViewFacetCategory<OrgMultiViewRow<TSectionCertMeta>>>,
  selections: MultiViewSelectionMap
): OrgMultiViewRow<TSectionCertMeta>[] {
  return filterRecordsWithFacets(
    [...rows],
    query,
    facetCategories,
    selections,
    {
      getSearchableText: (row) => row.searchHaystack,
    }
  );
}
