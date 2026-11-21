/**
 * Step 8.1 — `7. Revisión`: Multi View basada en Certificados y Detail View simplificada
 * (`fecha_revision` requerida + `resumen_revision` opcional, sin bloqueos rígidos post-cierre).
 *
 * Strictly typed (`strict: true`, `0 any` / `as any`) and Zero-UUID compliant
 * in all user-facing labels and validation messages.
 */

import { assertValidUuid, containsRawUuid, isValidUuid } from './zeroUuid';
import {
  resolveLatestAuditDate,
  resolveLatestRealExecutionDate,
} from './auditPlanningEngine';
import type { Phase5FindingEntity, ProgramacionAuditEntity } from './auditExecution';
import {
  extractDiscreteRealDates,
  formatIsoDateDmy,
  resolveMaxRealDateIso,
} from './resultadoDomain';
import type { CertificadoDetailEntity } from './multisiteSampling';
import type { CertificateRecord } from './searchControls';

export type RevisionQueueFilter = 'ALL' | 'PENDIENTE' | 'REVISADA';

export type CertificateRevisionStatusKey = 'PENDIENTE' | 'REVISADA';

export interface RevisionAuditSummaryRow {
  audit: ProgramacionAuditEntity;
  realStartIso: string | null;
  realEndIso: string | null;
  closingDateIso: string | null;
  totalNcs: number;
  closedNcs: number;
  openNcs: number;
  revisado: boolean;
  fechaRevision: string | null;
  documentacionCompleta: boolean;
  revisadoPorNombre: string | null;
  resumenRevision: string | null;
}

export interface RevisionFormDraft {
  id_auditoria: string;
  revisado: boolean;
  fecha_revision: string;
  documentacion_completa?: boolean;
  resumen_revision: string;
}

export interface CertificateRevisionRow {
  id: string;
  certId: string;
  numero_certificado: string;
  organizacion_nombre: string;
  id_organizacion: string;
  norma_codigo: string;
  estatus: string;
  auditsCount: number;
  latestAudit: ProgramacionAuditEntity | null;
  latestAuditTipo: string;
  latestAuditDateLabel: string;
  fechaRevisionIso: string | null;
  fechaRevisionLabel: string;
  resumenRevision: string | null;
  revisadoPorNombre: string | null;
  statusKey: CertificateRevisionStatusKey;
  statusLabel: 'Pendiente' | 'Revisada ✓';
  statusBadgeClass: string;
  searchHaystack: string;
}

export interface AuditRevisionContext {
  tipoAuditoria: string;
  realDatesDmy: string[];
  realDatesSummary: string;
  totalNcs: number;
  closedNcs: number;
  openNcs: number;
  ncsSummary: string;
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const MONTHS_ES_SHORT: ReadonlyArray<string> = [
  'Ene',
  'Feb',
  'Mar',
  'Abr',
  'May',
  'Jun',
  'Jul',
  'Ago',
  'Sep',
  'Oct',
  'Nov',
  'Dic',
];

function isValidIsoCalendarDate(value: string | null | undefined): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  if (!ISO_DATE_PATTERN.test(trimmed)) return false;
  const [yStr, mStr, dStr] = trimmed.split('-');
  const year = Number(yStr);
  const month = Number(mStr);
  const day = Number(dStr);
  if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }
  const dt = new Date(Date.UTC(year, month - 1, day));
  return (
    dt.getUTCFullYear() === year &&
    dt.getUTCMonth() === month - 1 &&
    dt.getUTCDate() === day
  );
}

function resolveReviewerDisplayName(
  reviewerId: string | null | undefined,
  actorNameById: ReadonlyMap<string, string>
): string | null {
  if (!reviewerId) return null;
  const mapped = actorNameById.get(reviewerId)?.trim();
  if (mapped && !containsRawUuid(mapped) && !isValidUuid(mapped)) {
    return mapped;
  }
  return 'Coordinador QA';
}

function getAuditOrderIso(audit: ProgramacionAuditEntity): string {
  const maxReal = resolveMaxRealDateIso(audit);
  if (maxReal) return maxReal;
  const latest = resolveLatestAuditDate(audit.fechas) ?? audit.latestDate ?? null;
  if (latest && !latest.deleted_at) {
    if (latest.fecha_fin) return latest.fecha_fin.slice(0, 10);
    if (latest.fecha_inicio) return latest.fecha_inicio.slice(0, 10);
    if (latest.anio && latest.mes) {
      return `${latest.anio}-${String(latest.mes).padStart(2, '0')}-01`;
    }
  }
  return (audit.fecha_fin || audit.fecha_inicio || '').slice(0, 10);
}

function formatAuditSummaryDate(audit: ProgramacionAuditEntity | null): string {
  if (!audit) return 'Sin programar';
  const maxReal = resolveMaxRealDateIso(audit);
  if (maxReal) return `Real: ${formatIsoDateDmy(maxReal)}`;
  const latest = resolveLatestAuditDate(audit.fechas) ?? audit.latestDate ?? null;
  if (latest && !latest.deleted_at) {
    if (latest.tipo_fecha === 'PREPROGRAMADA_MES' && latest.anio && latest.mes) {
      const mName = MONTHS_ES_SHORT[latest.mes - 1] || `M${latest.mes}`;
      return `${mName} ${latest.anio}`;
    }
    const iso = (latest.fecha_fin || latest.fecha_inicio || '').slice(0, 10);
    if (iso) return formatIsoDateDmy(iso);
  }
  const fallback = (audit.fecha_fin || audit.fecha_inicio || '').slice(0, 10);
  return fallback ? formatIsoDateDmy(fallback) : 'Sin fecha';
}

/**
 * Builds 1 row per Certificate for the Step 8.1 `7. Revisión` Multi View.
 */
export function buildCertificateRevisionRows(params: {
  audits: ReadonlyArray<ProgramacionAuditEntity>;
  actorNameById: ReadonlyMap<string, string>;
  certificados?: ReadonlyArray<CertificadoDetailEntity>;
  certificates?: ReadonlyArray<CertificateRecord>;
}): CertificateRevisionRow[] {
  const { audits, actorNameById, certificados = [], certificates = [] } = params;
  const activeAudits = audits.filter((a) => !a.deleted_at);

  interface CertStub {
    certId: string;
    numero_certificado: string;
    organizacion_nombre: string;
    id_organizacion: string;
    norma_codigo: string;
    estatus: string;
  }

  const certMap = new Map<string, CertStub>();

  for (const c of certificados) {
    certMap.set(c.id, {
      certId: c.id,
      numero_certificado: c.numero_certificado,
      organizacion_nombre: c.organizacion_nombre,
      id_organizacion: c.id_organizacion,
      norma_codigo: c.norma_codigo || 'ISO',
      estatus: c.estatus || 'ACTIVO',
    });
  }

  for (const c of certificates) {
    if (!certMap.has(c.id)) {
      certMap.set(c.id, {
        certId: c.id,
        numero_certificado: c.numero_certificado,
        organizacion_nombre: c.organizacion_nombre,
        id_organizacion: c.organizacion_id || '',
        norma_codigo: c.norma || 'ISO',
        estatus: c.estatus || 'ACTIVO',
      });
    }
  }

  for (const a of activeAudits) {
    if (!a.id_certificado) continue;
    if (!certMap.has(a.id_certificado)) {
      certMap.set(a.id_certificado, {
        certId: a.id_certificado,
        numero_certificado: a.numero_certificado,
        organizacion_nombre: a.organizacion_nombre,
        id_organizacion: a.id_organizacion,
        norma_codigo: a.norma_codigo || 'ISO',
        estatus: 'ACTIVO',
      });
    }
  }

  const auditsByCert = new Map<string, ProgramacionAuditEntity[]>();
  for (const a of activeAudits) {
    if (!a.id_certificado) continue;
    const list = auditsByCert.get(a.id_certificado) ?? [];
    list.push(a);
    auditsByCert.set(a.id_certificado, list);
  }

  const rows: CertificateRevisionRow[] = [];
  for (const cert of certMap.values()) {
    const certAudits = (auditsByCert.get(cert.certId) ?? []).slice().sort((a, b) => {
      const dateCmp = getAuditOrderIso(b).localeCompare(getAuditOrderIso(a));
      if (dateCmp !== 0) return dateCmp;
      return b.codigo_auditoria.localeCompare(a.codigo_auditoria, 'es');
    });

    const latestAudit = certAudits[0] ?? null;
    const fechaRevisionIso =
      latestAudit?.fecha_revision && isValidIsoCalendarDate(latestAudit.fecha_revision.slice(0, 10))
        ? latestAudit.fecha_revision.slice(0, 10)
        : null;
    const isReviewed = Boolean(latestAudit && (latestAudit.revisado || fechaRevisionIso));
    const statusKey: CertificateRevisionStatusKey = isReviewed ? 'REVISADA' : 'PENDIENTE';
    const statusLabel: CertificateRevisionRow['statusLabel'] = isReviewed
      ? 'Revisada ✓'
      : 'Pendiente';
    const statusBadgeClass = isReviewed
      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
      : 'bg-amber-50 text-amber-800 border-amber-200';
    const fechaRevisionLabel = fechaRevisionIso
      ? formatRevisionDateDdMmYyyy(fechaRevisionIso)
      : 'Pendiente';
    const revisadoPorNombre = latestAudit
      ? resolveReviewerDisplayName(latestAudit.revisado_por, actorNameById)
      : null;

    rows.push({
      id: cert.certId,
      certId: cert.certId,
      numero_certificado: cert.numero_certificado,
      organizacion_nombre: cert.organizacion_nombre,
      id_organizacion: cert.id_organizacion,
      norma_codigo: cert.norma_codigo,
      estatus: cert.estatus,
      auditsCount: certAudits.length,
      latestAudit,
      latestAuditTipo: latestAudit?.tipo_auditoria || 'Sin auditoría',
      latestAuditDateLabel: formatAuditSummaryDate(latestAudit),
      fechaRevisionIso,
      fechaRevisionLabel,
      resumenRevision: latestAudit?.resumen_revision ?? null,
      revisadoPorNombre,
      statusKey,
      statusLabel,
      statusBadgeClass,
      searchHaystack: [
        cert.numero_certificado,
        cert.organizacion_nombre,
        cert.norma_codigo,
        latestAudit?.codigo_auditoria || '',
        latestAudit?.tipo_auditoria || '',
        fechaRevisionLabel,
        statusLabel,
        latestAudit?.resumen_revision || '',
      ]
        .join(' ')
        .toLowerCase(),
    });
  }

  return rows.sort((a, b) =>
    a.numero_certificado.localeCompare(b.numero_certificado, 'es', { numeric: true })
  );
}

/**
 * Builds compact audit context (Tipo, discrete real dates, NC totals) for Step 8.1 `7. Revisión` Detail View.
 */
export function buildAuditRevisionContext(
  audit: ProgramacionAuditEntity,
  findings: ReadonlyArray<Phase5FindingEntity>
): AuditRevisionContext {
  const realDates = extractDiscreteRealDates(audit);
  const realDatesDmy = realDates.map((d) => d.dmyLabel);
  const realDatesSummary =
    realDatesDmy.length > 0 ? realDatesDmy.join(', ') : 'Sin fechas reales registradas';

  const auditNcs = findings.filter(
    (f) => !f.deleted_at && f.id_auditoria === audit.id && (f.tipo === 'NC_MAYOR' || f.tipo === 'NC_MENOR')
  );
  const closedNcs = auditNcs.filter(
    (nc) => Boolean(nc.cerrado || nc.fecha_cierre_real || nc.fecha_cierre)
  ).length;
  const openNcs = auditNcs.length - closedNcs;
  const ncsSummary =
    auditNcs.length === 0
      ? '0 NCs'
      : `${closedNcs} cerradas / ${openNcs} abiertas (${auditNcs.length} total)`;

  return {
    tipoAuditoria: audit.tipo_auditoria,
    realDatesDmy,
    realDatesSummary,
    totalNcs: auditNcs.length,
    closedNcs,
    openNcs,
    ncsSummary,
  };
}

export function buildRevisionQueueRows(
  audits: ReadonlyArray<ProgramacionAuditEntity>,
  findings: ReadonlyArray<Phase5FindingEntity>,
  actorNameById: ReadonlyMap<string, string>
): RevisionAuditSummaryRow[] {
  const rows: RevisionAuditSummaryRow[] = [];

  for (const audit of audits) {
    if (audit.deleted_at) continue;

    const realEntry =
      resolveLatestRealExecutionDate(audit.fechas) ??
      (audit.latestDate && !audit.latestDate.deleted_at && audit.latestDate.tipo_fecha === 'REAL'
        ? audit.latestDate
        : null);

    const auditNcs = findings.filter(
      (f) => !f.deleted_at && f.id_auditoria === audit.id && (f.tipo === 'NC_MAYOR' || f.tipo === 'NC_MENOR')
    );
    const closedNcs = auditNcs.filter(
      (nc) => Boolean(nc.cerrado || nc.fecha_cierre_real || nc.fecha_cierre)
    ).length;
    const openNcs = auditNcs.length - closedNcs;

    const realStartIso = realEntry?.fecha_inicio ? realEntry.fecha_inicio.slice(0, 10) : null;
    const realEndIso = realEntry?.fecha_fin
      ? realEntry.fecha_fin.slice(0, 10)
      : realStartIso;

    rows.push({
      audit,
      realStartIso,
      realEndIso,
      closingDateIso: audit.fecha_cierre_auditoria ? audit.fecha_cierre_auditoria.slice(0, 10) : null,
      totalNcs: auditNcs.length,
      closedNcs,
      openNcs,
      revisado: Boolean(audit.revisado || audit.fecha_revision),
      fechaRevision: audit.fecha_revision ? audit.fecha_revision.slice(0, 10) : null,
      documentacionCompleta: Boolean(audit.documentacion_completa),
      revisadoPorNombre: resolveReviewerDisplayName(audit.revisado_por, actorNameById),
      resumenRevision: audit.resumen_revision ?? null,
    });
  }

  return rows.sort((a, b) => {
    if (a.revisado !== b.revisado) return a.revisado ? 1 : -1;
    const revCmp = (b.closingDateIso || '').localeCompare(a.closingDateIso || '');
    if (revCmp !== 0) return revCmp;
    return a.audit.codigo_auditoria.localeCompare(b.audit.codigo_auditoria, 'es');
  });
}

/**
 * Step 8.1 simplified revision validator matching DB trigger `fn_validar_revision_auditoria()`:
 * requires active audit, valid `fecha_revision`, optional Zero-UUID `resumen_revision`,
 * and `fecha_revision >= MIN(fecha_real)` when active REAL dates exist.
 */
export function validateRevisionDraft(
  draft: RevisionFormDraft,
  audit: ProgramacionAuditEntity | undefined
): string | null {
  assertValidUuid(draft.id_auditoria, 'auditoría');
  if (!audit || audit.deleted_at) {
    return 'La auditoría seleccionada no existe o está archivada.';
  }

  const cleanReviewDate = (draft.fecha_revision || '').trim();
  const cleanResumen = (draft.resumen_revision || '').trim();

  if (cleanResumen && containsRawUuid(cleanResumen)) {
    return 'El comentario de revisión no debe contener identificadores UUID internos.';
  }

  if (!isValidIsoCalendarDate(cleanReviewDate)) {
    return 'Indique una fecha de revisión válida (AAAA-MM-DD).';
  }

  const discreteReals = extractDiscreteRealDates(audit);
  const firstRealDate = discreteReals[0]?.isoDate ?? null;
  if (firstRealDate && cleanReviewDate < firstRealDate) {
    return 'La fecha de revisión no puede ser anterior a la primera fecha real de ejecución.';
  }

  return null;
}

export function formatRevisionDateDdMmYyyy(isoDate: string | null | undefined): string {
  if (!isoDate) return '—';
  const clean = isoDate.trim().slice(0, 10);
  if (!ISO_DATE_PATTERN.test(clean)) return clean || '—';
  const [year, month, day] = clean.split('-');
  return `${day}/${month}/${year}`;
}

export function formatRevisionNcSummary(row: Pick<RevisionAuditSummaryRow, 'totalNcs' | 'closedNcs'>): string {
  if (row.totalNcs === 0) return '0 NCs';
  return `${row.totalNcs} ${row.totalNcs === 1 ? 'NC' : 'NCs'} (${row.closedNcs} ${row.closedNcs === 1 ? 'cerrada' : 'cerradas'})`;
}
