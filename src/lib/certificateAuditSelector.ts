/**
 * Step 5.1 — Motor Puro Estándar Certificate-Based & Selector de Auditoría (`◀ / ▶` y Lotes Vinculados).
 *
 * Strictly typed (`strict: true`, 0 `any` / `as any`) and Zero-UUID compliant
 * in all user-facing labels and summaries.
 */

import type { ProgramacionAuditEntity } from './auditExecution';
import {
  formatAuditDateLabel,
  resolveLatestPlannedDate,
  type AuditDateEntry,
  type ProgramaAuditoriaEntity,
} from './auditPlanningEngine';
import { sortAuditsByRecencyDesc } from './breadcrumb';
import {
  computeAuditUrgencyClassification,
  type AuditUrgencyClassification,
} from './designacionTipoDomain';
import type { CertificadoDetailEntity } from './multisiteSampling';
import type { CertificateRecord } from './searchControls';
import type { SoftDeletableCertificado } from './vinculoDomain';

export type CertificateSourceCandidate =
  | CertificateRecord
  | CertificadoDetailEntity
  | SoftDeletableCertificado;

export interface CertificateMultiViewRow {
  certId: string;
  numero_certificado: string;
  organizacion_nombre: string;
  norma_codigo: string;
  estatus: string;
  totalAudits: number;
  audits: ProgramacionAuditEntity[];
  latestAudit: ProgramacionAuditEntity | null;
  latestProgram: ProgramaAuditoriaEntity | null;
  latestPlannedDate: AuditDateEntry | null;
  urgency: AuditUrgencyClassification;
  isLinkedLatest: boolean;
  linkedSiblingCount: number;
}

export interface CertificateAuditNavigation {
  certId: string;
  auditsForCert: ProgramacionAuditEntity[];
  activeAudit: ProgramacionAuditEntity | null;
  activeIndex: number;
  prevAuditId: string | null;
  nextAuditId: string | null;
}

export interface LinkedSiblingAuditItem {
  audit: ProgramacionAuditEntity;
  isActive: boolean;
  label: string;
  compactLabel: string;
}

function getAuditCreatedAtScore(audit: ProgramacionAuditEntity): string {
  return audit.created_at || '';
}

function resolveEffectiveDateSortScore(audit: ProgramacionAuditEntity): string {
  const planned =
    resolveLatestPlannedDate(audit.fechas) ??
    (audit.latestDate && !audit.latestDate.deleted_at ? audit.latestDate : null);
  if (planned) {
    if (planned.fecha_inicio) return planned.fecha_inicio;
    if (planned.anio && planned.mes) {
      return `${planned.anio}-${String(planned.mes).padStart(2, '0')}-01`;
    }
  }
  return audit.fecha_inicio || '';
}

/**
 * Returns all active audits for `certId` ordered from newest to oldest
 * (effective planned/real date DESC, then `created_at` DESC, then `codigo_auditoria` DESC).
 */
export function getAuditsForCertificateSorted(
  certId: string | null | undefined,
  audits: ReadonlyArray<ProgramacionAuditEntity>
): ProgramacionAuditEntity[] {
  if (!certId) return [];
  const filtered = audits.filter((a) => !a.deleted_at && a.id_certificado === certId);
  if (filtered.length <= 1) return filtered.slice();

  const recencyBase = sortAuditsByRecencyDesc(filtered);
  return recencyBase.sort((a, b) => {
    const dA = resolveEffectiveDateSortScore(a);
    const dB = resolveEffectiveDateSortScore(b);
    if (dA !== dB) return dB.localeCompare(dA);
    const cA = getAuditCreatedAtScore(a);
    const cB = getAuditCreatedAtScore(b);
    if (cA !== cB) return cB.localeCompare(cA);
    return (b.codigo_auditoria || '').localeCompare(a.codigo_auditoria || '');
  });
}

/**
 * Resolves the active audit for a certificate: preserves `persistedAuditId` if it belongs
 * to `certId` and is not deleted; otherwise picks the newest audit for that certificate.
 */
export function resolveDefaultAuditForCertificate(
  certId: string | null | undefined,
  persistedAuditId: string | null | undefined,
  audits: ReadonlyArray<ProgramacionAuditEntity>
): ProgramacionAuditEntity | null {
  const sorted = getAuditsForCertificateSorted(certId, audits);
  if (sorted.length === 0) return null;
  if (persistedAuditId) {
    const matched = sorted.find((a) => a.id === persistedAuditId);
    if (matched) return matched;
  }
  return sorted[0];
}

/**
 * Computes `prevAuditId` (`◀`) and `nextAuditId` (`▶`) navigation around the active audit
 * of `certId` along the sorted list of audits (`[newest, ..., oldest]`).
 */
export function resolveAuditNavigation(
  certId: string,
  persistedAuditId: string | null | undefined,
  audits: ReadonlyArray<ProgramacionAuditEntity>
): CertificateAuditNavigation {
  const auditsForCert = getAuditsForCertificateSorted(certId, audits);
  const activeAudit = resolveDefaultAuditForCertificate(certId, persistedAuditId, audits);
  const activeIndex = activeAudit
    ? auditsForCert.findIndex((a) => a.id === activeAudit.id)
    : -1;

  const prevAuditId =
    auditsForCert.length > 1 && activeIndex > 0
      ? auditsForCert[activeIndex - 1].id
      : null;
  const nextAuditId =
    auditsForCert.length > 1 && activeIndex >= 0 && activeIndex < auditsForCert.length - 1
      ? auditsForCert[activeIndex + 1].id
      : null;

  return {
    certId,
    auditsForCert,
    activeAudit,
    activeIndex,
    prevAuditId,
    nextAuditId,
  };
}

/**
 * Collects all active audits belonging to the same `programa_auditoria` batch as `activeAudit`.
 */
export function getLinkedSiblingAudits(
  activeAudit: ProgramacionAuditEntity | null,
  allAudits: ReadonlyArray<ProgramacionAuditEntity>,
  programs: ReadonlyArray<ProgramaAuditoriaEntity>
): {
  program: ProgramaAuditoriaEntity | null;
  siblings: LinkedSiblingAuditItem[];
} {
  if (!activeAudit) {
    return { program: null, siblings: [] };
  }

  const program = activeAudit.id_programa_auditoria
    ? programs.find((p) => !p.deleted_at && p.id === activeAudit.id_programa_auditoria) ?? null
    : null;

  const byId = new Map<string, ProgramacionAuditEntity>();
  if (program) {
    for (const aud of program.auditorias) {
      if (!aud.deleted_at) byId.set(aud.id, aud);
    }
  }
  if (activeAudit.id_programa_auditoria) {
    for (const aud of allAudits) {
      if (!aud.deleted_at && aud.id_programa_auditoria === activeAudit.id_programa_auditoria) {
        if (!byId.has(aud.id)) byId.set(aud.id, aud);
      }
    }
  }
  if (!byId.has(activeAudit.id)) {
    byId.set(activeAudit.id, activeAudit);
  }

  const ordered = Array.from(byId.values()).sort((a, b) => {
    if (a.id === activeAudit.id) return -1;
    if (b.id === activeAudit.id) return 1;
    return (a.numero_certificado || '').localeCompare(b.numero_certificado || '');
  });

  // Preserve stable order by numero_certificado + codigo_auditoria so tabs don't jump on click
  const stableOrdered = ordered.slice().sort((a, b) => {
    const certCmp = (a.numero_certificado || '').localeCompare(b.numero_certificado || '');
    if (certCmp !== 0) return certCmp;
    return (a.codigo_auditoria || '').localeCompare(b.codigo_auditoria || '');
  });

  return {
    program,
    siblings: stableOrdered.map((aud) => ({
      audit: aud,
      isActive: aud.id === activeAudit.id,
      label: `${aud.numero_certificado} · ${aud.norma_codigo} · ${aud.tipo_auditoria || 'Sin tipo'}`,
      compactLabel: `${aud.numero_certificado} (${aud.norma_codigo})`,
    })),
  };
}

/**
 * Formats an audit option label cleanly (`Código · Tipo · Fecha · Vínculo`) with Zero-UUID exposure.
 */
export function formatCertificateAuditOptionLabel(
  audit: ProgramacionAuditEntity,
  program?: ProgramaAuditoriaEntity | null
): string {
  const code = audit.codigo_auditoria || 'Auditoría';
  const tipo = audit.tipo_auditoria || 'Sin tipo';
  const planned =
    resolveLatestPlannedDate(audit.fechas) ??
    (audit.latestDate && !audit.latestDate.deleted_at ? audit.latestDate : null);
  const datePart = planned
    ? formatAuditDateLabel(planned)
    : audit.fecha_inicio
    ? audit.fecha_inicio.slice(0, 10)
    : 'Sin fecha';

  let linkPart = 'Individual';
  if (program) {
    const siblingCount = program.auditorias.filter((a) => !a.deleted_at).length;
    linkPart =
      program.es_vinculada || siblingCount > 1
        ? `Vinculada · ${program.tipo_vinculacion} (${siblingCount})`
        : 'Individual';
  }

  return `${code} · ${tipo} · ${datePart} · ${linkPart}`;
}

export interface BuildCertificateMultiViewRowsParams {
  certificates?: ReadonlyArray<CertificateRecord>;
  detailedCerts?: ReadonlyArray<CertificadoDetailEntity | SoftDeletableCertificado>;
  audits: ReadonlyArray<ProgramacionAuditEntity>;
  programs?: ReadonlyArray<ProgramaAuditoriaEntity>;
  referenceIsoDate?: string;
}

/**
 * Aggregates one row per visible Certificate combining certificate catalog metadata with
 * its audit history and most recent campaign context.
 */
export function buildCertificateMultiViewRows(
  params: BuildCertificateMultiViewRowsParams
): CertificateMultiViewRow[] {
  const {
    certificates = [],
    detailedCerts = [],
    audits,
    programs = [],
    referenceIsoDate = new Date().toISOString().slice(0, 10),
  } = params;

  const activePrograms = programs.filter((p) => !p.deleted_at);
  const programById = new Map(activePrograms.map((p) => [p.id, p]));

  // Merge audits passed directly + audits nested inside active programs
  const auditById = new Map<string, ProgramacionAuditEntity>();
  for (const prog of activePrograms) {
    for (const a of prog.auditorias) {
      if (!a.deleted_at) auditById.set(a.id, a);
    }
  }
  for (const a of audits) {
    if (!a.deleted_at && !auditById.has(a.id)) {
      auditById.set(a.id, a);
    }
  }
  const allActiveAudits = Array.from(auditById.values());

  interface CertSeed {
    id: string;
    numero_certificado: string;
    organizacion_nombre: string;
    norma_codigo: string;
    estatus: string;
  }

  const certMetaById = new Map<string, CertSeed>();

  for (const dc of detailedCerts) {
    if ('deleted_at' in dc && dc.deleted_at) continue;
    if (!dc.id) continue;
    certMetaById.set(dc.id, {
      id: dc.id,
      numero_certificado: dc.numero_certificado || 'Certificado',
      organizacion_nombre: dc.organizacion_nombre || 'Organización',
      norma_codigo: dc.norma_codigo || 'ISO',
      estatus: dc.estatus || 'Activo',
    });
  }

  for (const cr of certificates) {
    if (!cr.id || certMetaById.has(cr.id)) continue;
    certMetaById.set(cr.id, {
      id: cr.id,
      numero_certificado: cr.numero_certificado || 'Certificado',
      organizacion_nombre: cr.organizacion_nombre || 'Organización',
      norma_codigo: cr.norma || 'ISO',
      estatus: cr.estatus || 'Activo',
    });
  }

  // Also synthesize fallback certificate rows for audits whose cert isn't in catalog lists (e.g., compact test fixtures)
  for (const aud of allActiveAudits) {
    if (!aud.id_certificado || certMetaById.has(aud.id_certificado)) continue;
    certMetaById.set(aud.id_certificado, {
      id: aud.id_certificado,
      numero_certificado: aud.numero_certificado || 'Certificado',
      organizacion_nombre: aud.organizacion_nombre || 'Organización',
      norma_codigo: aud.norma_codigo || 'ISO',
      estatus: 'Activo',
    });
  }

  const rows: CertificateMultiViewRow[] = [];
  for (const cert of certMetaById.values()) {
    const certAudits = getAuditsForCertificateSorted(cert.id, allActiveAudits);
    const latestAudit = certAudits[0] ?? null;
    const latestProgram =
      latestAudit?.id_programa_auditoria
        ? programById.get(latestAudit.id_programa_auditoria) ?? null
        : null;
    const latestPlannedDate = latestAudit
      ? resolveLatestPlannedDate(latestAudit.fechas) ??
        (latestAudit.latestDate &&
        !latestAudit.latestDate.deleted_at &&
        latestAudit.latestDate.tipo_fecha !== 'REAL'
          ? latestAudit.latestDate
          : null)
      : null;

    const urgency = computeAuditUrgencyClassification(
      latestPlannedDate,
      latestAudit?.estado_ciclo || 'Borrador',
      referenceIsoDate
    );

    const linkedSiblingCount = latestProgram
      ? latestProgram.auditorias.filter((a) => !a.deleted_at).length
      : latestAudit
      ? 1
      : 0;

    rows.push({
      certId: cert.id,
      numero_certificado: cert.numero_certificado,
      organizacion_nombre: cert.organizacion_nombre,
      norma_codigo: cert.norma_codigo,
      estatus: cert.estatus,
      totalAudits: certAudits.length,
      audits: certAudits,
      latestAudit,
      latestProgram,
      latestPlannedDate,
      urgency,
      isLinkedLatest: Boolean(latestProgram?.es_vinculada || linkedSiblingCount > 1),
      linkedSiblingCount,
    });
  }

  return rows.sort((a, b) => {
    if (a.totalAudits > 0 && b.totalAudits === 0) return -1;
    if (a.totalAudits === 0 && b.totalAudits > 0) return 1;
    if (a.urgency.rank !== b.urgency.rank) return a.urgency.rank - b.urgency.rank;
    const startA = a.urgency.effectiveStartIso || '9999-12-31';
    const startB = b.urgency.effectiveStartIso || '9999-12-31';
    if (startA !== startB) return startA.localeCompare(startB);
    return a.numero_certificado.localeCompare(b.numero_certificado);
  });
}
