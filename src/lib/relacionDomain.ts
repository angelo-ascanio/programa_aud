/**
 * Step 3.1 — Dominio Puro de `Relación` (Bloque 1 Paso 1 de Auditoría: `#/auditorias/relacion`)
 *
 * - Vista Multi centrada en Organizaciones / Conglomerados con facetas de relación y ciclo.
 * - Pop-up Selector agrupado por Certificado con auditorías ordenadas de más reciente a más antigua
 *   y codenames compactos (`YYYY-MM ShortTipo`).
 * - Vista Detalle comparando `baseVinculoNature` (Bloque 2 Vínculo o `'Individual'` si `LIBRE`)
 *   contra `effectiveAuditNature` específico de la auditoría o lote en Bloque 1, sin mutar
 *   las cajas estructurales de Bloque 2 (`vinculo` / `vinculo_certificado`).
 * - Cumplimiento estricto: TypeScript `strict: true` (`0 any`), Zero-UUID, Soft-Delete (`!deleted_at`),
 *   y RBAC de 4 roles (`ADMIN`, `WORKER`, `AUDITOR`, `CLIENT` con aislamiento Nivel 2).
 */

import type { OrganizacionEntity } from './activeCertificates';
import type { ProgramacionAuditEntity } from './auditExecution';
import {
  AUDIT_LINK_NATURES,
  resolveLatestAuditDate,
  type AuditCycleStatus,
  type AuditLinkLevel,
  type AuditLinkNature,
  type ProgramaAuditoriaEntity,
} from './auditPlanningEngine';
import {
  assertApprovedStaffForMutation,
  stripRawUuidsFromText,
} from './auditPlanningPersistence';
import {
  formatAuditCodename,
  getAuditCodenameTooltip,
  resolveShortConglomeradoName,
  resolveShortOrganizacionName,
} from './codenameDomain';
import type { ConglomeradoEntity } from './conglomeradoDomain';
import type { UserProfile } from './healthCheck';
import type { CertificadoDetailEntity } from './multisiteSampling';
import {
  filterRecordsWithFacets,
  type MultiViewFacetCategory,
  type MultiViewSelectionMap,
  type SortDirection,
  type UniversalViewMode,
} from './universalTemplate';
import {
  resolveCertEffectiveNatureInBox,
  scopeVinculosForProfile,
  type SoftDeletableCertificado,
  type VinculoCertificadoItem,
  type VinculoEntity,
} from './vinculoDomain';
import { containsRawUuid, isValidUuid } from './zeroUuid';

export type RelacionSortColumn =
  | 'grupo'
  | 'organizacion'
  | 'vinculos'
  | 'auditorias'
  | 'naturaleza';

export type RelacionBaseVinculoKind = 'Con caja Bloque 2' | 'Personalizada o Libre';

export interface RelacionViewState {
  selectedOrgId: string | null;
  selectedConglomeradoId: string | null;
  selectedCertId: string | null;
  selectedAuditId: string | null;
  pickerTargetGroupKey: string | null;
  query: string;
  viewMode: UniversalViewMode;
  sortColumn: RelacionSortColumn | null;
  sortDirection: SortDirection;
  isSidebarOpen: boolean;
  facetSelections: MultiViewSelectionMap;
  savingAuditId: string | null;
  editErrorMessage: string | null;
}

export const DEFAULT_RELACION_VIEW_STATE: RelacionViewState = {
  selectedOrgId: null,
  selectedConglomeradoId: null,
  selectedCertId: null,
  selectedAuditId: null,
  pickerTargetGroupKey: null,
  query: '',
  viewMode: 'list',
  sortColumn: null,
  sortDirection: 'none',
  isSidebarOpen: true,
  facetSelections: {},
  savingAuditId: null,
  editErrorMessage: null,
};

export function createDefaultRelacionViewState(): RelacionViewState {
  return {
    ...DEFAULT_RELACION_VIEW_STATE,
    facetSelections: {},
  };
}

export interface RelacionMultiVinculoSummary {
  vinculoId: string;
  etiqueta: string;
  codigoVinculo: string | null;
  nivelVinculacion: AuditLinkLevel;
  tipoVinculacion: AuditLinkNature;
  visibleCertCount: number;
  isContextDerived: boolean;
}

export interface RelacionMultiCertSummary {
  certId: string;
  numero_certificado: string;
  norma_codigo: string;
  orgId: string;
  orgShortName: string;
  vinculoBoxId: string | null;
  vinculoBoxLabel: string | null;
  baseVinculoNature: AuditLinkNature;
  baseVinculoKind: RelacionBaseVinculoKind;
  auditCount: number;
}

export interface RelacionMultiAuditSummary {
  auditId: string;
  certId: string;
  numero_certificado: string;
  norma_codigo: string;
  programId: string | null;
  codigo_auditoria: string;
  codename: string;
  codenameTooltip: string;
  tipo_auditoria: string;
  effectiveNature: AuditLinkNature;
  baseVinculoNature: AuditLinkNature;
  matchesVinculoBase: boolean;
  nivelVinculacion: AuditLinkLevel;
  estadoCiclo: AuditCycleStatus;
  baseVinculoKind: RelacionBaseVinculoKind;
  sortDateKey: string;
  createdAtKey: string;
}

export interface RelacionMultiRow {
  groupKey: string;
  groupKind: 'CONGLOMERADO' | 'ORGANIZACION';
  displayName: string;
  fullName: string;
  conglomeradoId: string | null;
  conglomeradoShortName: string;
  orgId: string | null;
  orgIds: string[];
  orgShortNames: string[];
  vinculoBoxes: RelacionMultiVinculoSummary[];
  certificates: RelacionMultiCertSummary[];
  audits: RelacionMultiAuditSummary[];
  effectiveNatures: AuditLinkNature[];
  nivelVinculaciones: AuditLinkLevel[];
  estadosCiclo: AuditCycleStatus[];
  baseVinculoKinds: RelacionBaseVinculoKind[];
  baseVinculoSummary: RelacionBaseVinculoKind | 'Mixta';
  certsCount: number;
  auditsCount: number;
  searchHaystack: string;
}

export interface RelacionPickerAuditItem {
  auditId: string;
  certId: string;
  programId: string | null;
  codigo_auditoria: string;
  codename: string;
  codenameTooltip: string;
  tipo_auditoria: string;
  estado_ciclo: AuditCycleStatus;
  effectiveNature: AuditLinkNature;
  baseVinculoNature: AuditLinkNature;
  matchesVinculoBase: boolean;
  sortDateKey: string;
  createdAtKey: string;
}

export interface RelacionPickerCertificateGroup {
  certId: string;
  numero_certificado: string;
  norma_codigo: string;
  orgId: string;
  orgShortName: string;
  vinculoBoxLabel: string | null;
  baseVinculoNature: AuditLinkNature;
  baseVinculoKind: RelacionBaseVinculoKind;
  audits: RelacionPickerAuditItem[];
}

export interface RelacionPickerModel {
  groupKey: string;
  groupKind: 'CONGLOMERADO' | 'ORGANIZACION';
  displayName: string;
  fullName: string;
  conglomeradoShortName: string;
  totalCertsCount: number;
  totalAuditsCount: number;
  certificates: RelacionPickerCertificateGroup[];
}

export interface RelacionDetailAuditRow {
  auditId: string;
  certId: string;
  numero_certificado: string;
  norma_codigo: string;
  orgId: string;
  orgShortName: string;
  programId: string | null;
  codigo_auditoria: string;
  codename: string;
  codenameTooltip: string;
  tipo_auditoria: string;
  estado_ciclo: AuditCycleStatus;
  hasVinculoBox: boolean;
  isVinculoLibre: boolean;
  vinculoBoxId: string | null;
  vinculoBoxLabel: string | null;
  baseVinculoNature: AuditLinkNature;
  effectiveAuditNature: AuditLinkNature;
  matchesVinculoBase: boolean;
  isSelectedAudit: boolean;
}

export interface RelacionDetailModel {
  hasSelection: boolean;
  selectedCertId: string | null;
  selectedAuditId: string | null;
  canEdit: boolean;
  readOnlyReason: string | null;
  selectedCertSummary: {
    certId: string;
    numero_certificado: string;
    norma_codigo: string;
    orgId: string;
    orgShortName: string;
    versionNumero: number | null;
  } | null;
  programSummary: {
    programId: string;
    codigo_programa: string | null;
    etiqueta: string;
    nivel_vinculacion: AuditLinkLevel;
    tipo_vinculacion: AuditLinkNature;
    isLinkedCampaign: boolean;
    auditCount: number;
  } | null;
  selectedAuditRow: RelacionDetailAuditRow | null;
  audits: RelacionDetailAuditRow[];
  availableNatures: readonly AuditLinkNature[];
}

export interface BuildRelacionMultiRowsInput {
  profile: UserProfile | null | undefined;
  authorizedClientOrgIds?: ReadonlyArray<string>;
  conglomerados?: ReadonlyArray<ConglomeradoEntity>;
  organizaciones?: ReadonlyArray<OrganizacionEntity>;
  certificados?: ReadonlyArray<SoftDeletableCertificado | CertificadoDetailEntity>;
  vinculos?: ReadonlyArray<VinculoEntity>;
  programs?: ReadonlyArray<ProgramaAuditoriaEntity>;
  audits?: ReadonlyArray<ProgramacionAuditEntity>;
}

export interface BuildRelacionPickerModelInput extends BuildRelacionMultiRowsInput {
  pickerTargetGroupKey: string | null;
  multiRows?: ReadonlyArray<RelacionMultiRow>;
}

export interface BuildRelacionDetailModelInput extends BuildRelacionMultiRowsInput {
  selectedCertId: string | null;
  selectedAuditId: string | null;
}

export interface ValidateAuditRelacionUpdateInput {
  auditId: string;
  tipoVinculacion: AuditLinkNature | string | null | undefined;
  audits: ReadonlyArray<ProgramacionAuditEntity>;
  profile: UserProfile | null | undefined;
  programs?: ReadonlyArray<ProgramaAuditoriaEntity>;
  applyToBatchProgram?: boolean;
}

export type ValidateAuditRelacionUpdateResult =
  | {
      ok: true;
      auditId: string;
      tipoVinculacion: AuditLinkNature;
      targetAuditIds: string[];
      updatedAuditPayload: {
        tipo_vinculacion: AuditLinkNature;
      };
      mutatesVinculoBlock2: false;
    }
  | {
      ok: false;
      error: string;
    };

export const RELACION_CYCLE_STATUS_OPTIONS: readonly AuditCycleStatus[] = [
  'Borrador',
  'En Programación',
  'Programada',
  'En Ejecución',
  'Auditada',
  'Cerrada',
  'Reprogramada',
  'Cancelada',
] as const;

export const RELACION_FACET_CATEGORIES: ReadonlyArray<MultiViewFacetCategory<RelacionMultiRow>> = [
  {
    id: 'conglomerado',
    label: 'Conglomerado',
    extractValues: (row) => row.conglomeradoShortName,
  },
  {
    id: 'naturaleza',
    label: 'Relación / Naturaleza',
    options: AUDIT_LINK_NATURES.map((nature) => ({ value: nature, label: nature })),
    extractValues: (row) => row.effectiveNatures,
  },
  {
    id: 'nivel_vinculacion',
    label: 'Nivel de Vinculación',
    options: [
      { value: 'INDIVIDUAL', label: 'Individual' },
      { value: 'NIVEL_1_INTRA_ORG', label: 'Nivel 1 (Intra-Org)' },
      { value: 'NIVEL_2_INTER_ORG', label: 'Nivel 2 (Inter-Org)' },
    ],
    extractValues: (row) => row.nivelVinculaciones,
  },
  {
    id: 'estado_ciclo',
    label: 'Estado de Ciclo',
    options: RELACION_CYCLE_STATUS_OPTIONS.map((status) => ({ value: status, label: status })),
    extractValues: (row) => row.estadosCiclo,
  },
  {
    id: 'base_vinculo',
    label: 'Base Vínculo',
    options: [
      { value: 'Con caja Bloque 2', label: 'Con caja Bloque 2' },
      { value: 'Personalizada o Libre', label: 'Personalizada o Libre' },
    ],
    extractValues: (row) => row.baseVinculoKinds,
  },
];

function cleanSafeText(value: string | null | undefined, fallback = ''): string {
  const cleaned = stripRawUuidsFromText((value || '').trim());
  if (!cleaned || containsRawUuid(cleaned)) return fallback;
  return cleaned;
}

function isValidAuditLinkNatureValue(value: unknown): value is AuditLinkNature {
  if (typeof value !== 'string') return false;
  return (AUDIT_LINK_NATURES as readonly string[]).includes(value.trim());
}

function resolveOptionalNature(value: unknown): AuditLinkNature | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed === 'Multisitio') return 'Mixta';
  return isValidAuditLinkNatureValue(trimmed) ? trimmed : null;
}

function resolveAuditSortDateKey(audit: ProgramacionAuditEntity): string {
  const latest =
    resolveLatestAuditDate(audit.fechas) ??
    (audit.latestDate && !audit.latestDate.deleted_at ? audit.latestDate : null);
  if (latest) {
    if (latest.fecha_inicio && /^\d{4}-\d{2}-\d{2}/.test(latest.fecha_inicio)) {
      return latest.fecha_inicio.slice(0, 10);
    }
    if (
      latest.tipo_fecha === 'PREPROGRAMADA_MES' &&
      typeof latest.anio === 'number' &&
      typeof latest.mes === 'number'
    ) {
      return `${Math.trunc(latest.anio)}-${String(Math.trunc(latest.mes)).padStart(2, '0')}-01`;
    }
  }
  const reprog = (audit.fecha_reprogramacion || '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(reprog)) return reprog.slice(0, 10);
  const inicio = (audit.fecha_inicio || '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(inicio)) return inicio.slice(0, 10);
  return '';
}

function compareAuditsNewestFirst(
  a: { sortDateKey: string; createdAtKey: string; codigo_auditoria: string },
  b: { sortDateKey: string; createdAtKey: string; codigo_auditoria: string }
): number {
  if (a.sortDateKey !== b.sortDateKey) {
    return b.sortDateKey.localeCompare(a.sortDateKey);
  }
  if (a.createdAtKey !== b.createdAtKey) {
    return b.createdAtKey.localeCompare(a.createdAtKey);
  }
  return b.codigo_auditoria.localeCompare(a.codigo_auditoria);
}

function resolveAuditCycleStatus(audit: ProgramacionAuditEntity): AuditCycleStatus {
  if (audit.estado_ciclo) return audit.estado_ciclo;
  const norm = (audit.estatus || '').trim().toLowerCase();
  if (norm === 'cancelada' || norm === 'cancelado') return 'Cancelada';
  if (norm === 'cerrada' || norm === 'cerrado' || audit.fecha_cierre_auditoria) return 'Cerrada';
  if (norm === 'completado' || norm === 'auditada') return 'Auditada';
  if (norm === 'en ejecución' || norm === 'en ejecucion') return 'En Ejecución';
  if (norm === 'programada' || norm === 'planificado') return 'Programada';
  if (norm === 'en programación' || norm === 'en programacion') return 'En Programación';
  return 'Borrador';
}

interface ScopedRelacionDataset {
  isApproved: boolean;
  isStaff: boolean;
  isAuditor: boolean;
  isClient: boolean;
  conglomerados: ConglomeradoEntity[];
  organizaciones: OrganizacionEntity[];
  certificados: Array<SoftDeletableCertificado | CertificadoDetailEntity>;
  vinculos: VinculoEntity[];
  programs: ProgramaAuditoriaEntity[];
  audits: ProgramacionAuditEntity[];
  programByAuditId: Map<string, ProgramaAuditoriaEntity>;
  programById: Map<string, ProgramaAuditoriaEntity>;
  vinculoByCertId: Map<string, { box: VinculoEntity; member: VinculoCertificadoItem; isRedactedBox: boolean }>;
}

function isAuditorAssignedToAudit(
  audit: ProgramacionAuditEntity,
  profileId: string
): boolean {
  return (
    audit.auditor_lider_id === profileId ||
    audit.equipo.some((member) => member.id_auditor === profileId)
  );
}

function buildScopedRelacionDataset(
  input: BuildRelacionMultiRowsInput
): ScopedRelacionDataset {
  const {
    profile,
    authorizedClientOrgIds = [],
    conglomerados = [],
    organizaciones = [],
    certificados = [],
    vinculos = [],
    programs = [],
    audits = [],
  } = input;

  if (!profile || profile.status !== 'APPROVED') {
    return {
      isApproved: false,
      isStaff: false,
      isAuditor: false,
      isClient: false,
      conglomerados: [],
      organizaciones: [],
      certificados: [],
      vinculos: [],
      programs: [],
      audits: [],
      programByAuditId: new Map(),
      programById: new Map(),
      vinculoByCertId: new Map(),
    };
  }

  const isStaff = profile.role === 'ADMIN' || profile.role === 'WORKER';
  const isAuditor = profile.role === 'AUDITOR';
  const isClient = profile.role === 'CLIENT';
  const allowedClientOrgSet = new Set(authorizedClientOrgIds);

  // Merge active audits from both flat `audits` and `programs[].auditorias`
  const activePrograms = programs.filter((p) => !p.deleted_at);
  const auditById = new Map<string, ProgramacionAuditEntity>();
  const programById = new Map<string, ProgramaAuditoriaEntity>();
  const programByAuditId = new Map<string, ProgramaAuditoriaEntity>();

  for (const a of audits) {
    if (!a.deleted_at) auditById.set(a.id, a);
  }
  for (const p of activePrograms) {
    programById.set(p.id, p);
    for (const a of p.auditorias || []) {
      if (a.deleted_at) continue;
      programByAuditId.set(a.id, p);
      if (!auditById.has(a.id)) {
        auditById.set(a.id, a);
      }
    }
  }
  for (const a of auditById.values()) {
    if (!programByAuditId.has(a.id) && a.id_programa_auditoria) {
      const matched = programById.get(a.id_programa_auditoria);
      if (matched) programByAuditId.set(a.id, matched);
    }
  }

  const allActiveAudits = Array.from(auditById.values());
  const scopedAudits = allActiveAudits.filter((a) => {
    if (isStaff) return true;
    if (isAuditor) return isAuditorAssignedToAudit(a, profile.id);
    if (isClient) return allowedClientOrgSet.has(a.id_organizacion);
    return false;
  });

  const allowedAuditIds = new Set(scopedAudits.map((a) => a.id));
  const assignedAuditCertIds = scopedAudits.map((a) => a.id_certificado);
  const allowedAuditorCertSet = new Set(assignedAuditCertIds);

  const scopedPrograms: ProgramaAuditoriaEntity[] = activePrograms
    .map((p) => {
      const visibleAudits = (p.auditorias || []).filter(
        (a) => !a.deleted_at && allowedAuditIds.has(a.id)
      );
      if (!isStaff && visibleAudits.length === 0) return null;
      return {
        ...p,
        auditorias: visibleAudits,
      };
    })
    .filter((p): p is ProgramaAuditoriaEntity => p !== null);

  const scopedProgramById = new Map<string, ProgramaAuditoriaEntity>();
  const scopedProgramByAuditId = new Map<string, ProgramaAuditoriaEntity>();
  for (const sp of scopedPrograms) {
    scopedProgramById.set(sp.id, sp);
    for (const a of sp.auditorias || []) {
      if (!a.deleted_at) {
        scopedProgramByAuditId.set(a.id, sp);
      }
    }
  }
  for (const a of scopedAudits) {
    if (!scopedProgramByAuditId.has(a.id) && a.id_programa_auditoria) {
      const matched = scopedProgramById.get(a.id_programa_auditoria);
      if (matched) scopedProgramByAuditId.set(a.id, matched);
    }
  }

  const activeCerts = certificados.filter((c) => !c.deleted_at);
  const scopedCerts = activeCerts.filter((c) => {
    if (isStaff) return true;
    if (isAuditor) return allowedAuditorCertSet.has(c.id);
    if (isClient) return allowedClientOrgSet.has(c.id_organizacion);
    return false;
  });

  // Synthesize minimal cert refs for scoped audits if catalog did not include them
  const certMap = new Map<string, SoftDeletableCertificado | CertificadoDetailEntity>(
    scopedCerts.map((c) => [c.id, c])
  );
  for (const audit of scopedAudits) {
    if (audit.id_certificado && !certMap.has(audit.id_certificado)) {
      const synthetic: SoftDeletableCertificado = {
        id: audit.id_certificado,
        numero_certificado: audit.numero_certificado,
        id_organizacion: audit.id_organizacion,
        organizacion_nombre: audit.organizacion_nombre,
        organizacion_abreviacion: audit.organizacion_abreviacion ?? undefined,
        organizacion_rif: '',
        id_norma: '',
        norma_codigo: audit.norma_codigo,
        norma_titulo: '',
        esquema: audit.norma_codigo,
        id_estatus: '',
        estatus: 'Activo',
        id_sector_iaf: '',
        sector_iaf: audit.sector_iaf,
        sector_iaf_descripcion: '',
        id_subsector_iaf: '',
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
      certMap.set(audit.id_certificado, synthetic);
    }
  }
  const resolvedCerts = Array.from(certMap.values());

  const activeOrgs = organizaciones.filter((o) => !o.deleted_at);
  const auditorOrgIds = new Set<string>([
    ...scopedAudits.map((a) => a.id_organizacion),
    ...resolvedCerts.map((c) => c.id_organizacion),
  ]);
  const scopedOrgs = activeOrgs.filter((o) => {
    if (isStaff) return true;
    if (isAuditor) return auditorOrgIds.has(o.id);
    if (isClient) return allowedClientOrgSet.has(o.id);
    return false;
  });

  // Synthesize minimal org refs if missing from `organizaciones` input
  const orgMap = new Map<string, OrganizacionEntity>(scopedOrgs.map((o) => [o.id, o]));
  for (const cert of resolvedCerts) {
    if (cert.id_organizacion && !orgMap.has(cert.id_organizacion)) {
      orgMap.set(cert.id_organizacion, {
        id: cert.id_organizacion,
        nombre: cert.organizacion_nombre || 'Organización',
        abreviacion: cert.organizacion_abreviacion ?? undefined,
        rif: cert.organizacion_rif || '',
        estatus: 'Activo',
      });
    }
  }
  const resolvedOrgs = Array.from(orgMap.values());

  const activeCongs = conglomerados.filter((g) => !g.deleted_at);
  const visibleCongIds = new Set(
    resolvedOrgs
      .map((o) => o.id_grupo_empresarial)
      .filter((id): id is string => Boolean(id))
  );
  const scopedCongs = activeCongs.filter((g) => {
    if (isStaff) return true;
    return visibleCongIds.has(g.id);
  });

  // Scope Block 2 Vínculo boxes without leaking sibling organizations/certs
  const activeRawVinculos = vinculos.filter((v) => !v.deleted_at);
  const rawBoxHasExternalSiblings = new Set<string>();
  for (const rawBox of activeRawVinculos) {
    const activeMembers = rawBox.certificados.filter((m) => !m.deleted_at);
    if (isClient) {
      if (
        rawBox.nivel_vinculacion === 'NIVEL_2_INTER_ORG' ||
        activeMembers.some((m) => !allowedClientOrgSet.has(m.id_organizacion))
      ) {
        rawBoxHasExternalSiblings.add(rawBox.id);
      }
    } else if (isAuditor) {
      if (activeMembers.some((m) => !allowedAuditorCertSet.has(m.id_certificado))) {
        rawBoxHasExternalSiblings.add(rawBox.id);
      }
    }
  }

  const scopedVinculos = scopeVinculosForProfile(
    activeRawVinculos,
    profile,
    authorizedClientOrgIds,
    assignedAuditCertIds
  );

  const vinculoByCertId = new Map<
    string,
    { box: VinculoEntity; member: VinculoCertificadoItem; isRedactedBox: boolean }
  >();
  for (const box of scopedVinculos) {
    const isRedactedBox = rawBoxHasExternalSiblings.has(box.id);
    for (const member of box.certificados) {
      if (!member.deleted_at) {
        vinculoByCertId.set(member.id_certificado, { box, member, isRedactedBox });
      }
    }
  }

  return {
    isApproved: true,
    isStaff,
    isAuditor,
    isClient,
    conglomerados: scopedCongs,
    organizaciones: resolvedOrgs,
    certificados: resolvedCerts,
    vinculos: scopedVinculos,
    programs: scopedPrograms,
    audits: scopedAudits,
    programByAuditId: scopedProgramByAuditId,
    programById: scopedProgramById,
    vinculoByCertId,
  };
}

function resolveVisibleVinculoBoxLabel(
  box: VinculoEntity,
  isRedactedBox: boolean
): string {
  if (isRedactedBox) {
    return box.nivel_vinculacion === 'NIVEL_2_INTER_ORG'
      ? 'Vínculo Inter-Organizacional (Campaña)'
      : 'Vínculo de Auditoría (Acotado)';
  }
  return cleanSafeText(box.etiqueta, box.codigo_vinculo || 'Caja Vínculo');
}

function buildMultiRowFromGroup(opts: {
  groupKey: string;
  groupKind: 'CONGLOMERADO' | 'ORGANIZACION';
  displayName: string;
  fullName: string;
  conglomeradoId: string | null;
  conglomeradoShortName: string;
  orgId: string | null;
  orgs: OrganizacionEntity[];
  certs: Array<SoftDeletableCertificado | CertificadoDetailEntity>;
  audits: ProgramacionAuditEntity[];
  dataset: ScopedRelacionDataset;
}): RelacionMultiRow {
  const {
    groupKey,
    groupKind,
    displayName,
    fullName,
    conglomeradoId,
    conglomeradoShortName,
    orgId,
    orgs,
    certs,
    audits,
    dataset,
  } = opts;

  const orgById = new Map(orgs.map((o) => [o.id, o]));
  const certById = new Map(certs.map((c) => [c.id, c]));

  const orgShortNames = orgs
    .map((o) => resolveShortOrganizacionName({ nombre: o.nombre, abreviacion: o.abreviacion }))
    .filter((name, idx, arr) => Boolean(name) && arr.indexOf(name) === idx);

  const auditsCountByCert = new Map<string, number>();
  for (const audit of audits) {
    auditsCountByCert.set(
      audit.id_certificado,
      (auditsCountByCert.get(audit.id_certificado) || 0) + 1
    );
  }

  const boxSummariesMap = new Map<string, RelacionMultiVinculoSummary>();
  const certSummaries: RelacionMultiCertSummary[] = certs
    .slice()
    .sort((a, b) => a.numero_certificado.localeCompare(b.numero_certificado, 'es'))
    .map((cert) => {
      const org = orgById.get(cert.id_organizacion);
      const orgShortName = resolveShortOrganizacionName({
        nombre: org?.nombre ?? cert.organizacion_nombre,
        abreviacion: org?.abreviacion ?? cert.organizacion_abreviacion,
      });
      const boxMatch = dataset.vinculoByCertId.get(cert.id) ?? null;
      const baseVinculoNature: AuditLinkNature = boxMatch
        ? resolveCertEffectiveNatureInBox(boxMatch.box, boxMatch.member)
        : 'Individual';
      const baseVinculoKind: RelacionBaseVinculoKind = boxMatch
        ? 'Con caja Bloque 2'
        : 'Personalizada o Libre';
      const boxLabel = boxMatch
        ? resolveVisibleVinculoBoxLabel(boxMatch.box, boxMatch.isRedactedBox)
        : null;

      if (boxMatch && !boxSummariesMap.has(boxMatch.box.id)) {
        boxSummariesMap.set(boxMatch.box.id, {
          vinculoId: boxMatch.box.id,
          etiqueta: boxLabel ?? 'Caja Vínculo',
          codigoVinculo: boxMatch.isRedactedBox ? null : boxMatch.box.codigo_vinculo,
          nivelVinculacion: boxMatch.box.nivel_vinculacion,
          tipoVinculacion: boxMatch.box.tipo_vinculacion,
          visibleCertCount: boxMatch.box.certificados.filter((c) => !c.deleted_at).length,
          isContextDerived: boxMatch.isRedactedBox,
        });
      }

      return {
        certId: cert.id,
        numero_certificado: cleanSafeText(cert.numero_certificado, 'Certificado'),
        norma_codigo: cleanSafeText(cert.norma_codigo, 'Norma'),
        orgId: cert.id_organizacion,
        orgShortName,
        vinculoBoxId: boxMatch ? boxMatch.box.id : null,
        vinculoBoxLabel: boxLabel,
        baseVinculoNature,
        baseVinculoKind,
        auditCount: auditsCountByCert.get(cert.id) || 0,
      };
    });

  const auditSummaries: RelacionMultiAuditSummary[] = audits
    .map((audit) => {
      const program = dataset.programByAuditId.get(audit.id) ?? null;
      const boxMatch = dataset.vinculoByCertId.get(audit.id_certificado) ?? null;
      const baseVinculoNature: AuditLinkNature = boxMatch
        ? resolveCertEffectiveNatureInBox(boxMatch.box, boxMatch.member)
        : 'Individual';
      const explicitAuditNature = resolveOptionalNature(audit.tipo_vinculacion);
      const explicitProgramNature = resolveOptionalNature(program?.tipo_vinculacion);
      const effectiveNature: AuditLinkNature =
        explicitAuditNature ?? explicitProgramNature ?? baseVinculoNature;
      const matchesVinculoBase = effectiveNature === baseVinculoNature;
      const baseVinculoKind: RelacionBaseVinculoKind =
        boxMatch && matchesVinculoBase ? 'Con caja Bloque 2' : 'Personalizada o Libre';
      const nivelVinculacion: AuditLinkLevel =
        program?.nivel_vinculacion ??
        boxMatch?.box.nivel_vinculacion ??
        (effectiveNature === 'Individual' ? 'INDIVIDUAL' : 'NIVEL_1_INTRA_ORG');
      const estadoCiclo = resolveAuditCycleStatus(audit);
      const certRef = certById.get(audit.id_certificado);

      return {
        auditId: audit.id,
        certId: audit.id_certificado,
        numero_certificado: cleanSafeText(
          certRef?.numero_certificado ?? audit.numero_certificado,
          'Certificado'
        ),
        norma_codigo: cleanSafeText(certRef?.norma_codigo ?? audit.norma_codigo, 'Norma'),
        programId: program?.id ?? audit.id_programa_auditoria ?? null,
        codigo_auditoria: cleanSafeText(audit.codigo_auditoria, 'Auditoría'),
        codename: formatAuditCodename({
          fechas: audit.fechas,
          latestDate: audit.latestDate,
          fecha_inicio: audit.fecha_inicio,
          fecha_reprogramacion: audit.fecha_reprogramacion,
          tipo_auditoria: audit.tipo_auditoria,
          tipo_abreviacion: audit.tipo_auditoria_abreviacion,
          codigo_auditoria: audit.codigo_auditoria,
        }),
        codenameTooltip: getAuditCodenameTooltip({
          fechas: audit.fechas,
          latestDate: audit.latestDate,
          fecha_inicio: audit.fecha_inicio,
          fecha_reprogramacion: audit.fecha_reprogramacion,
          tipo_auditoria: audit.tipo_auditoria,
          tipo_abreviacion: audit.tipo_auditoria_abreviacion,
          codigo_auditoria: audit.codigo_auditoria,
        }),
        tipo_auditoria: cleanSafeText(audit.tipo_auditoria, 'Sin tipo'),
        effectiveNature,
        baseVinculoNature,
        matchesVinculoBase,
        nivelVinculacion,
        estadoCiclo,
        baseVinculoKind,
        sortDateKey: resolveAuditSortDateKey(audit),
        createdAtKey: (audit.created_at || '').trim(),
      };
    })
    .sort(compareAuditsNewestFirst);

  const effectiveNaturesSet = new Set<AuditLinkNature>();
  const nivelSet = new Set<AuditLinkLevel>();
  const estadoSet = new Set<AuditCycleStatus>();
  const baseKindSet = new Set<RelacionBaseVinculoKind>();

  for (const a of auditSummaries) {
    effectiveNaturesSet.add(a.effectiveNature);
    nivelSet.add(a.nivelVinculacion);
    estadoSet.add(a.estadoCiclo);
    baseKindSet.add(a.baseVinculoKind);
  }
  for (const c of certSummaries) {
    if (auditSummaries.length === 0) {
      effectiveNaturesSet.add(c.baseVinculoNature);
    }
    baseKindSet.add(c.baseVinculoKind);
  }
  for (const box of boxSummariesMap.values()) {
    nivelSet.add(box.nivelVinculacion);
    if (auditSummaries.length === 0) {
      effectiveNaturesSet.add(box.tipoVinculacion);
    }
  }
  if (effectiveNaturesSet.size === 0) {
    effectiveNaturesSet.add('Individual');
  }
  if (nivelSet.size === 0) {
    nivelSet.add('INDIVIDUAL');
  }
  if (baseKindSet.size === 0) {
    baseKindSet.add('Personalizada o Libre');
  }

  const baseVinculoKinds = Array.from(baseKindSet);
  const baseVinculoSummary: RelacionBaseVinculoKind | 'Mixta' =
    baseVinculoKinds.length > 1
      ? 'Mixta'
      : baseVinculoKinds[0] ?? 'Personalizada o Libre';

  const vinculoBoxes = Array.from(boxSummariesMap.values());

  const searchHaystack = [
    displayName,
    fullName,
    conglomeradoShortName,
    ...orgShortNames,
    ...vinculoBoxes.map((b) => b.etiqueta),
    ...certSummaries.map((c) => `${c.numero_certificado} ${c.norma_codigo}`),
    ...auditSummaries.map(
      (a) => `${a.codename} ${a.codigo_auditoria} ${a.effectiveNature} ${a.estadoCiclo}`
    ),
  ]
    .filter((token) => Boolean(token) && !containsRawUuid(token))
    .join(' ')
    .toLowerCase();

  return {
    groupKey,
    groupKind,
    displayName: cleanSafeText(displayName, 'Organización'),
    fullName: cleanSafeText(fullName, displayName),
    conglomeradoId,
    conglomeradoShortName: cleanSafeText(conglomeradoShortName, 'Sin conglomerado'),
    orgId,
    orgIds: orgs.map((o) => o.id),
    orgShortNames,
    vinculoBoxes,
    certificates: certSummaries,
    audits: auditSummaries,
    effectiveNatures: Array.from(effectiveNaturesSet),
    nivelVinculaciones: Array.from(nivelSet),
    estadosCiclo: Array.from(estadoSet),
    baseVinculoKinds,
    baseVinculoSummary,
    certsCount: certSummaries.length,
    auditsCount: auditSummaries.length,
    searchHaystack,
  };
}

/**
 * Builds RBAC-scoped Multi View rows centered on Organizations and/or Conglomerados
 * for Bloque 1 Step 1 (`Relación`).
 */
export function buildRelacionMultiRows(
  input: BuildRelacionMultiRowsInput
): RelacionMultiRow[] {
  const dataset = buildScopedRelacionDataset(input);
  if (!dataset.isApproved) return [];

  const congById = new Map(dataset.conglomerados.map((g) => [g.id, g]));
  const orgsByCongId = new Map<string, OrganizacionEntity[]>();
  const orphanOrgs: OrganizacionEntity[] = [];

  for (const org of dataset.organizaciones) {
    const congId = (org.id_grupo_empresarial || '').trim();
    if (congId && congById.has(congId)) {
      const list = orgsByCongId.get(congId) || [];
      list.push(org);
      orgsByCongId.set(congId, list);
    } else {
      orphanOrgs.push(org);
    }
  }

  const certsByOrgId = new Map<string, Array<SoftDeletableCertificado | CertificadoDetailEntity>>();
  for (const cert of dataset.certificados) {
    const list = certsByOrgId.get(cert.id_organizacion) || [];
    list.push(cert);
    certsByOrgId.set(cert.id_organizacion, list);
  }

  const auditsByOrgId = new Map<string, ProgramacionAuditEntity[]>();
  for (const audit of dataset.audits) {
    const list = auditsByOrgId.get(audit.id_organizacion) || [];
    list.push(audit);
    auditsByOrgId.set(audit.id_organizacion, list);
  }

  const rows: RelacionMultiRow[] = [];

  if (dataset.isClient) {
    // CLIENT Level-2 isolation: strictly 1 row per authorized organization, never grouping external siblings
    for (const org of dataset.organizaciones) {
      const orgCerts = certsByOrgId.get(org.id) || [];
      const orgAudits = auditsByOrgId.get(org.id) || [];
      const cong = org.id_grupo_empresarial ? congById.get(org.id_grupo_empresarial) : undefined;
      const orgShortName = resolveShortOrganizacionName({
        nombre: org.nombre,
        abreviacion: org.abreviacion,
      });
      const congShortName = cong
        ? cong.es_individual_auto
          ? orgShortName
          : resolveShortConglomeradoName({
              nombre: cong.nombre,
              abreviacion: cong.abreviacion,
              codigo_grupo: cong.codigo_grupo,
            })
        : orgShortName;

      rows.push(
        buildMultiRowFromGroup({
          groupKey: `org:${org.id}`,
          groupKind: 'ORGANIZACION',
          displayName: orgShortName,
          fullName: org.nombre,
          conglomeradoId: cong?.id ?? null,
          conglomeradoShortName: congShortName,
          orgId: org.id,
          orgs: [org],
          certs: orgCerts,
          audits: orgAudits,
          dataset,
        })
      );
    }
  } else {
    // ADMIN / WORKER / AUDITOR: Multi-org Conglomerados grouped at Conglomerado level; solo/orphan grouped at Org level
    for (const cong of dataset.conglomerados) {
      const memberOrgs = orgsByCongId.get(cong.id) || [];
      if (memberOrgs.length === 0) continue;

      const congCerts = memberOrgs.flatMap((o) => certsByOrgId.get(o.id) || []);
      const congAudits = memberOrgs.flatMap((o) => auditsByOrgId.get(o.id) || []);
      if (dataset.isAuditor && congAudits.length === 0) continue;
      if (congCerts.length === 0 && congAudits.length === 0 && dataset.isAuditor) continue;

      const isMultiOrgGroup = !cong.es_individual_auto || memberOrgs.length > 1;
      const congShortName = resolveShortConglomeradoName({
        nombre: cong.nombre,
        abreviacion: cong.abreviacion,
        codigo_grupo: cong.codigo_grupo,
      });

      if (isMultiOrgGroup) {
        rows.push(
          buildMultiRowFromGroup({
            groupKey: `cong:${cong.id}`,
            groupKind: 'CONGLOMERADO',
            displayName: congShortName,
            fullName: cong.nombre,
            conglomeradoId: cong.id,
            conglomeradoShortName: congShortName,
            orgId: memberOrgs.length === 1 ? memberOrgs[0].id : null,
            orgs: memberOrgs,
            certs: congCerts,
            audits: congAudits,
            dataset,
          })
        );
      } else {
        const soloOrg = memberOrgs[0];
        const orgShortName = resolveShortOrganizacionName({
          nombre: soloOrg.nombre,
          abreviacion: soloOrg.abreviacion,
        });
        rows.push(
          buildMultiRowFromGroup({
            groupKey: `org:${soloOrg.id}`,
            groupKind: 'ORGANIZACION',
            displayName: orgShortName,
            fullName: soloOrg.nombre,
            conglomeradoId: cong.id,
            conglomeradoShortName: congShortName,
            orgId: soloOrg.id,
            orgs: [soloOrg],
            certs: congCerts,
            audits: congAudits,
            dataset,
          })
        );
      }
    }

    for (const org of orphanOrgs) {
      const orgCerts = certsByOrgId.get(org.id) || [];
      const orgAudits = auditsByOrgId.get(org.id) || [];
      if (dataset.isAuditor && orgAudits.length === 0) continue;
      const orgShortName = resolveShortOrganizacionName({
        nombre: org.nombre,
        abreviacion: org.abreviacion,
      });
      const congShortName = org.grupo_empresarial_nombre
        ? resolveShortConglomeradoName({ nombre: org.grupo_empresarial_nombre })
        : orgShortName;

      rows.push(
        buildMultiRowFromGroup({
          groupKey: `org:${org.id}`,
          groupKind: 'ORGANIZACION',
          displayName: orgShortName,
          fullName: org.nombre,
          conglomeradoId: org.id_grupo_empresarial ?? null,
          conglomeradoShortName: congShortName,
          orgId: org.id,
          orgs: [org],
          certs: orgCerts,
          audits: orgAudits,
          dataset,
        })
      );
    }
  }

  return rows.sort((a, b) => a.displayName.localeCompare(b.displayName, 'es'));
}

/**
 * Applies search query, 5 lateral facets, and column sorting to `RelacionMultiRow[]`.
 */
export function filterRelacionMultiRows(
  rows: ReadonlyArray<RelacionMultiRow>,
  state: Pick<RelacionViewState, 'query' | 'facetSelections' | 'sortColumn' | 'sortDirection'>
): {
  filteredRows: RelacionMultiRow[];
} {
  const filtered = filterRecordsWithFacets(
    rows,
    state.query,
    RELACION_FACET_CATEGORIES,
    state.facetSelections,
    {
      getSearchableText: (row) => row.searchHaystack,
    }
  );

  if (!state.sortColumn || state.sortDirection === 'none') {
    return { filteredRows: filtered };
  }

  const dir = state.sortDirection === 'asc' ? 1 : -1;
  const sorted = filtered.slice().sort((a, b) => {
    switch (state.sortColumn) {
      case 'grupo':
        return a.conglomeradoShortName.localeCompare(b.conglomeradoShortName, 'es') * dir;
      case 'organizacion':
        return a.displayName.localeCompare(b.displayName, 'es') * dir;
      case 'vinculos':
        return (a.vinculoBoxes.length - b.vinculoBoxes.length) * dir;
      case 'auditorias':
        return (a.auditsCount - b.auditsCount) * dir;
      case 'naturaleza':
        return (
          (a.effectiveNatures[0] || '').localeCompare(b.effectiveNatures[0] || '', 'es') * dir
        );
      default:
        return 0;
    }
  });

  return { filteredRows: sorted };
}

/**
 * Builds the Pop-up Selector modal model when clicking a row/card in Multi View.
 * Groups certificates and sorts audits newest-to-oldest with compact codenames (`YYYY-MM ShortTipo`).
 */
export function buildRelacionPickerModel(
  input: BuildRelacionPickerModelInput
): RelacionPickerModel | null {
  if (!input.pickerTargetGroupKey) return null;

  const rows = input.multiRows ?? buildRelacionMultiRows(input);
  const target = rows.find((r) => r.groupKey === input.pickerTargetGroupKey) ?? null;
  if (!target) return null;

  const auditsByCert = new Map<string, RelacionPickerAuditItem[]>();
  for (const audit of target.audits) {
    const list = auditsByCert.get(audit.certId) || [];
    list.push({
      auditId: audit.auditId,
      certId: audit.certId,
      programId: audit.programId,
      codigo_auditoria: audit.codigo_auditoria,
      codename: audit.codename,
      codenameTooltip: audit.codenameTooltip,
      tipo_auditoria: audit.tipo_auditoria,
      estado_ciclo: audit.estadoCiclo,
      effectiveNature: audit.effectiveNature,
      baseVinculoNature: audit.baseVinculoNature,
      matchesVinculoBase: audit.matchesVinculoBase,
      sortDateKey: audit.sortDateKey,
      createdAtKey: audit.createdAtKey,
    });
    auditsByCert.set(audit.certId, list);
  }

  const certificates: RelacionPickerCertificateGroup[] = target.certificates.map((cert) => {
    const certAudits = (auditsByCert.get(cert.certId) || [])
      .slice()
      .sort(compareAuditsNewestFirst);
    return {
      certId: cert.certId,
      numero_certificado: cert.numero_certificado,
      norma_codigo: cert.norma_codigo,
      orgId: cert.orgId,
      orgShortName: cert.orgShortName,
      vinculoBoxLabel: cert.vinculoBoxLabel,
      baseVinculoNature: cert.baseVinculoNature,
      baseVinculoKind: cert.baseVinculoKind,
      audits: certAudits,
    };
  });

  return {
    groupKey: target.groupKey,
    groupKind: target.groupKind,
    displayName: target.displayName,
    fullName: target.fullName,
    conglomeradoShortName: target.conglomeradoShortName,
    totalCertsCount: certificates.length,
    totalAuditsCount: target.auditsCount,
    certificates,
  };
}

/**
 * Builds the `Relación` Detail View model comparing each audit's Bloque 1
 * `effectiveAuditNature` against its Block 2 `baseVinculoNature` (or `'Individual'` if `LIBRE`),
 * without modifying `vinculo` / `vinculo_certificado`.
 */
export function buildRelacionDetailModel(
  input: BuildRelacionDetailModelInput
): RelacionDetailModel {
  const dataset = buildScopedRelacionDataset(input);
  const canEdit = dataset.isStaff;
  const readOnlyReason = !dataset.isApproved
    ? 'Usuario sin aprobación para consultar relaciones de auditoría.'
    : canEdit
    ? null
    : 'Modo solo lectura: solo personal aprobado (ADMIN o WORKER) puede confirmar o ajustar la relación de auditoría.';

  if (!dataset.isApproved) {
    return {
      hasSelection: false,
      selectedCertId: null,
      selectedAuditId: null,
      canEdit: false,
      readOnlyReason,
      selectedCertSummary: null,
      programSummary: null,
      selectedAuditRow: null,
      audits: [],
      availableNatures: AUDIT_LINK_NATURES,
    };
  }

  const orgById = new Map(dataset.organizaciones.map((o) => [o.id, o]));
  const certById = new Map(dataset.certificados.map((c) => [c.id, c]));

  let selectedAudit: ProgramacionAuditEntity | null = null;
  if (input.selectedAuditId) {
    selectedAudit = dataset.audits.find((a) => a.id === input.selectedAuditId) ?? null;
  }

  let resolvedCertId = selectedAudit?.id_certificado ?? input.selectedCertId ?? null;
  if (resolvedCertId && !certById.has(resolvedCertId) && !selectedAudit) {
    resolvedCertId = null;
  }

  if (!selectedAudit && resolvedCertId) {
    const forCert = dataset.audits
      .filter((a) => a.id_certificado === resolvedCertId)
      .slice()
      .sort((a, b) =>
        compareAuditsNewestFirst(
          {
            sortDateKey: resolveAuditSortDateKey(a),
            createdAtKey: (a.created_at || '').trim(),
            codigo_auditoria: a.codigo_auditoria || '',
          },
          {
            sortDateKey: resolveAuditSortDateKey(b),
            createdAtKey: (b.created_at || '').trim(),
            codigo_auditoria: b.codigo_auditoria || '',
          }
        )
      );
    selectedAudit = forCert[0] ?? null;
  }

  const resolvedProgram = selectedAudit
    ? dataset.programByAuditId.get(selectedAudit.id) ?? null
    : null;

  // Determine campaign/batch audits or certificate audits for Detail View (strictly RBAC-scoped)
  const scopedAuditIds = new Set(dataset.audits.map((a) => a.id));
  let detailAudits: ProgramacionAuditEntity[] = [];
  if (resolvedProgram && resolvedProgram.auditorias.length > 0) {
    detailAudits = resolvedProgram.auditorias.filter(
      (a) => !a.deleted_at && scopedAuditIds.has(a.id)
    );
  } else if (resolvedCertId) {
    detailAudits = dataset.audits.filter((a) => a.id_certificado === resolvedCertId);
  } else if (selectedAudit) {
    detailAudits = [selectedAudit];
  }

  const auditRows: RelacionDetailAuditRow[] = detailAudits
    .map((audit) => {
      const program = dataset.programByAuditId.get(audit.id) ?? resolvedProgram;
      const cert = certById.get(audit.id_certificado);
      const org = orgById.get(audit.id_organizacion);
      const boxMatch = dataset.vinculoByCertId.get(audit.id_certificado) ?? null;
      const baseVinculoNature: AuditLinkNature = boxMatch
        ? resolveCertEffectiveNatureInBox(boxMatch.box, boxMatch.member)
        : 'Individual';
      const explicitAuditNature = resolveOptionalNature(audit.tipo_vinculacion);
      const explicitProgramNature = resolveOptionalNature(program?.tipo_vinculacion);
      const effectiveAuditNature: AuditLinkNature =
        explicitAuditNature ?? explicitProgramNature ?? baseVinculoNature;
      const matchesVinculoBase = effectiveAuditNature === baseVinculoNature;
      const orgShortName = resolveShortOrganizacionName({
        nombre: org?.nombre ?? cert?.organizacion_nombre ?? audit.organizacion_nombre,
        abreviacion:
          org?.abreviacion ?? cert?.organizacion_abreviacion ?? audit.organizacion_abreviacion,
      });

      return {
        auditId: audit.id,
        certId: audit.id_certificado,
        numero_certificado: cleanSafeText(
          cert?.numero_certificado ?? audit.numero_certificado,
          'Certificado'
        ),
        norma_codigo: cleanSafeText(cert?.norma_codigo ?? audit.norma_codigo, 'Norma'),
        orgId: audit.id_organizacion,
        orgShortName,
        programId: program?.id ?? audit.id_programa_auditoria ?? null,
        codigo_auditoria: cleanSafeText(audit.codigo_auditoria, 'Auditoría'),
        codename: formatAuditCodename({
          fechas: audit.fechas,
          latestDate: audit.latestDate,
          fecha_inicio: audit.fecha_inicio,
          fecha_reprogramacion: audit.fecha_reprogramacion,
          tipo_auditoria: audit.tipo_auditoria,
          tipo_abreviacion: audit.tipo_auditoria_abreviacion,
          codigo_auditoria: audit.codigo_auditoria,
        }),
        codenameTooltip: getAuditCodenameTooltip({
          fechas: audit.fechas,
          latestDate: audit.latestDate,
          fecha_inicio: audit.fecha_inicio,
          fecha_reprogramacion: audit.fecha_reprogramacion,
          tipo_auditoria: audit.tipo_auditoria,
          tipo_abreviacion: audit.tipo_auditoria_abreviacion,
          codigo_auditoria: audit.codigo_auditoria,
        }),
        tipo_auditoria: cleanSafeText(audit.tipo_auditoria, 'Sin tipo'),
        estado_ciclo: resolveAuditCycleStatus(audit),
        hasVinculoBox: Boolean(boxMatch),
        isVinculoLibre: !boxMatch,
        vinculoBoxId: boxMatch ? boxMatch.box.id : null,
        vinculoBoxLabel: boxMatch
          ? resolveVisibleVinculoBoxLabel(boxMatch.box, boxMatch.isRedactedBox)
          : null,
        baseVinculoNature,
        effectiveAuditNature,
        matchesVinculoBase,
        isSelectedAudit: selectedAudit ? audit.id === selectedAudit.id : false,
      };
    })
    .sort((a, b) => {
      if (a.isSelectedAudit !== b.isSelectedAudit) {
        return a.isSelectedAudit ? -1 : 1;
      }
      return a.numero_certificado.localeCompare(b.numero_certificado, 'es');
    });

  const selectedCert = resolvedCertId ? certById.get(resolvedCertId) ?? null : null;
  const selectedCertOrg = selectedCert ? orgById.get(selectedCert.id_organizacion) : undefined;
  const selectedCertSummary = selectedCert
    ? {
        certId: selectedCert.id,
        numero_certificado: cleanSafeText(selectedCert.numero_certificado, 'Certificado'),
        norma_codigo: cleanSafeText(selectedCert.norma_codigo, 'Norma'),
        orgId: selectedCert.id_organizacion,
        orgShortName: resolveShortOrganizacionName({
          nombre: selectedCertOrg?.nombre ?? selectedCert.organizacion_nombre,
          abreviacion:
            selectedCertOrg?.abreviacion ?? selectedCert.organizacion_abreviacion,
        }),
        versionNumero:
          selectedAudit?.version_numero ??
          ('version_actual_numero' in selectedCert
            ? selectedCert.version_actual_numero ?? null
            : null),
      }
    : null;

  const programSummary = resolvedProgram
    ? {
        programId: resolvedProgram.id,
        codigo_programa: resolvedProgram.codigo_programa
          ? cleanSafeText(resolvedProgram.codigo_programa, '')
          : null,
        etiqueta:
          dataset.isClient && resolvedProgram.nivel_vinculacion === 'NIVEL_2_INTER_ORG'
            ? 'Campaña Inter-Organizacional (Acotada)'
            : cleanSafeText(resolvedProgram.etiqueta, 'Campaña de Auditoría'),
        nivel_vinculacion: resolvedProgram.nivel_vinculacion,
        tipo_vinculacion: resolvedProgram.tipo_vinculacion,
        isLinkedCampaign:
          resolvedProgram.es_vinculada ||
          resolvedProgram.nivel_vinculacion !== 'INDIVIDUAL' ||
          auditRows.length > 1,
        auditCount: auditRows.length,
      }
    : null;

  const selectedAuditRow =
    auditRows.find((r) => r.isSelectedAudit) ?? auditRows[0] ?? null;

  return {
    hasSelection: Boolean(selectedCertSummary || selectedAuditRow),
    selectedCertId: resolvedCertId,
    selectedAuditId: selectedAudit?.id ?? selectedAuditRow?.auditId ?? null,
    canEdit,
    readOnlyReason,
    selectedCertSummary,
    programSummary,
    selectedAuditRow,
    audits: auditRows,
    availableNatures: AUDIT_LINK_NATURES,
  };
}

/**
 * Pure validation for confirming or adjusting `auditoria.tipo_vinculacion` (Bloque 1 Step 1 `Relación`)
 * for a single audit or campaign batch without touching or mutating Block 2 `vinculo` / `vinculo_certificado`.
 */
export function validateAuditRelacionUpdate(
  input: ValidateAuditRelacionUpdateInput
): ValidateAuditRelacionUpdateResult {
  const staffCheck = assertApprovedStaffForMutation(input.profile);
  if (!staffCheck.ok) {
    return { ok: false, error: staffCheck.error };
  }

  const auditId = (input.auditId || '').trim();
  if (!auditId || !isValidUuid(auditId)) {
    return {
      ok: false,
      error: 'Seleccione una auditoría válida para actualizar su relación.',
    };
  }

  const candidateById = new Map<string, ProgramacionAuditEntity>();
  for (const a of input.audits) {
    if (!a.deleted_at) candidateById.set(a.id, a);
  }
  for (const prog of input.programs ?? []) {
    if (prog.deleted_at) continue;
    for (const a of prog.auditorias || []) {
      if (!a.deleted_at && !candidateById.has(a.id)) {
        candidateById.set(a.id, a);
      }
    }
  }

  const targetAudit = candidateById.get(auditId) ?? null;
  if (!targetAudit) {
    return {
      ok: false,
      error: 'La auditoría seleccionada no existe o se encuentra archivada.',
    };
  }

  if (resolveAuditCycleStatus(targetAudit) === 'Cancelada') {
    return {
      ok: false,
      error: 'No es posible modificar la relación de una auditoría cancelada.',
    };
  }

  if (!isValidAuditLinkNatureValue(input.tipoVinculacion)) {
    return {
      ok: false,
      error:
        'Seleccione una naturaleza de relación válida (Individual, Combinada, Integrada, Conjunta, Simultánea, Multientidad o Mixta).',
    };
  }
  const normalizedNature: AuditLinkNature = input.tipoVinculacion.trim() as AuditLinkNature;

  let targetAuditIds: string[] = [targetAudit.id];
  if (input.applyToBatchProgram && targetAudit.id_programa_auditoria) {
    const matchedProgram = (input.programs ?? []).find(
      (p) => !p.deleted_at && p.id === targetAudit.id_programa_auditoria
    );
    if (matchedProgram) {
      const batchIds = matchedProgram.auditorias
        .filter((a) => !a.deleted_at && resolveAuditCycleStatus(a) !== 'Cancelada')
        .map((a) => a.id);
      if (batchIds.length > 0) {
        targetAuditIds = batchIds;
      }
    }
  }

  return {
    ok: true,
    auditId: targetAudit.id,
    tipoVinculacion: normalizedNature,
    targetAuditIds,
    updatedAuditPayload: {
      tipo_vinculacion: normalizedNature,
    },
    mutatesVinculoBlock2: false,
  };
}
