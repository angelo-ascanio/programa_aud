/**
 * Step 11.1 — `Revisión`: Compuerta Final de Control de Calidad Post-Cierre.
 *
 * Strictly typed (`strict: true`, `0 any` / `as any`) and Zero-UUID compliant
 * in all user-facing labels and validation messages.
 */

import { assertValidUuid, containsRawUuid, isValidUuid } from './zeroUuid';
import { resolveLatestRealExecutionDate } from './auditPlanningEngine';
import type { Phase5FindingEntity, ProgramacionAuditEntity } from './auditExecution';

export type RevisionQueueFilter = 'ALL' | 'PENDIENTE' | 'REVISADA';

export interface RevisionAuditSummaryRow {
  audit: ProgramacionAuditEntity;
  realStartIso: string | null;
  realEndIso: string | null;
  closingDateIso: string;
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
  documentacion_completa: boolean;
  resumen_revision: string;
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

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

export function buildRevisionQueueRows(
  audits: ReadonlyArray<ProgramacionAuditEntity>,
  findings: ReadonlyArray<Phase5FindingEntity>,
  actorNameById: ReadonlyMap<string, string>
): RevisionAuditSummaryRow[] {
  const rows: RevisionAuditSummaryRow[] = [];

  for (const audit of audits) {
    if (audit.deleted_at) continue;
    if (audit.estado_ciclo !== 'Cerrada' || !audit.fecha_cierre_auditoria) continue;

    const realEntry =
      resolveLatestRealExecutionDate(audit.fechas) ??
      (audit.latestDate && !audit.latestDate.deleted_at && audit.latestDate.tipo_fecha === 'REAL'
        ? audit.latestDate
        : null);

    const auditNcs = findings.filter(
      (f) => !f.deleted_at && f.id_auditoria === audit.id && (f.tipo === 'NC_MAYOR' || f.tipo === 'NC_MENOR')
    );
    const closedNcs = auditNcs.filter((nc) => Boolean(nc.cerrado)).length;
    const openNcs = auditNcs.length - closedNcs;

    const realStartIso = realEntry?.fecha_inicio ? realEntry.fecha_inicio.slice(0, 10) : null;
    const realEndIso = realEntry?.fecha_fin
      ? realEntry.fecha_fin.slice(0, 10)
      : realStartIso;

    rows.push({
      audit,
      realStartIso,
      realEndIso,
      closingDateIso: audit.fecha_cierre_auditoria.slice(0, 10),
      totalNcs: auditNcs.length,
      closedNcs,
      openNcs,
      revisado: Boolean(audit.revisado),
      fechaRevision: audit.fecha_revision ? audit.fecha_revision.slice(0, 10) : null,
      documentacionCompleta: Boolean(audit.documentacion_completa),
      revisadoPorNombre: resolveReviewerDisplayName(audit.revisado_por, actorNameById),
      resumenRevision: audit.resumen_revision ?? null,
    });
  }

  return rows.sort((a, b) => {
    if (a.revisado !== b.revisado) return a.revisado ? 1 : -1;
    const closingCmp = b.closingDateIso.localeCompare(a.closingDateIso);
    if (closingCmp !== 0) return closingCmp;
    return a.audit.codigo_auditoria.localeCompare(b.audit.codigo_auditoria, 'es');
  });
}

export function validateRevisionDraft(
  draft: RevisionFormDraft,
  audit: ProgramacionAuditEntity | undefined
): string | null {
  assertValidUuid(draft.id_auditoria, 'auditoría');
  if (!audit || audit.deleted_at) {
    return 'La auditoría seleccionada no existe o está archivada.';
  }
  if (audit.estado_ciclo !== 'Cerrada' || !audit.fecha_cierre_auditoria) {
    return 'Solo pueden revisarse auditorías cerradas con fecha de cierre registrada en Resultado.';
  }
  const cleanClosingDate = audit.fecha_cierre_auditoria.slice(0, 10);
  const cleanReviewDate = (draft.fecha_revision || '').trim();
  const cleanResumen = (draft.resumen_revision || '').trim();

  if (cleanResumen && containsRawUuid(cleanResumen)) {
    return 'El resumen de revisión QA no debe contener identificadores UUID internos.';
  }

  if (draft.revisado) {
    if (!isValidIsoCalendarDate(cleanReviewDate)) {
      return 'Indique una fecha de revisión válida (YYYY-MM-DD).';
    }
    if (cleanReviewDate < cleanClosingDate) {
      return 'La fecha de revisión no puede ser anterior a la fecha de cierre de la auditoría.';
    }
    if (!draft.documentacion_completa) {
      return 'Confirme que la documentación del expediente está completa antes de aprobar la revisión.';
    }
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
