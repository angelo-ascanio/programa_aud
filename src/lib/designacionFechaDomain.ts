/**
 * Step 5.1 — `1.2 Designación → Fecha`: Lógica Pura de Fechas Programadas 1:N,
 * sincronización en lote vinculado (`programa_auditoria`) y protección de hitos `REAL`.
 *
 * Strictly typed (`strict: true`, 0 `any` / `as any`) and Zero-UUID compliant
 * in all user-facing labels and validation errors.
 */

import type { ProgramacionAuditEntity } from './auditExecution';
import {
  formatAuditDateLabel,
  resolveLatestPlannedDate,
  validateAuditDateEntryInput,
  type AuditDateEntry,
  type ProgramaAuditoriaEntity,
} from './auditPlanningEngine';
import {
  buildCertificateMultiViewRows,
  type CertificateMultiViewRow,
} from './certificateAuditSelector';
import type { AuditUrgencyClassification } from './designacionTipoDomain';
import type { CertificadoDetailEntity } from './multisiteSampling';
import type { CertificateRecord } from './searchControls';
import type { SoftDeletableCertificado } from './vinculoDomain';

export interface PlannedDateRowDraft {
  localId: string;
  existingId: string | null;
  numero_secuencia: number | null;
  tag: 'Programación' | 'Reprogramación';
  tipo_fecha: 'PREPROGRAMADA_MES' | 'PROGRAMADA_EXACTA';
  anio: number;
  mes: number;
  fecha_inicio: string;
  fecha_fin: string;
  singleDay: boolean;
  observacion: string;
}

export interface NormalizedPlannedDatePayload {
  tag: 'Programación' | 'Reprogramación';
  tipo_fecha: 'PREPROGRAMADA_MES' | 'PROGRAMADA_EXACTA';
  anio: number | null;
  mes: number | null;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  observacion: string | null;
}

export interface PlannedDatesValidationResult {
  valid: boolean;
  error: string | null;
  normalized: NormalizedPlannedDatePayload[];
}

export interface AuditBatchDateSyncOperations {
  auditId: string;
  toUpdate: Array<{
    dateId: string;
    numero_secuencia: number;
    payload: NormalizedPlannedDatePayload;
  }>;
  toArchive: Array<{
    dateId: string;
    numero_secuencia: number;
  }>;
  toInsert: Array<{
    numero_secuencia: number;
    payload: NormalizedPlannedDatePayload;
  }>;
}

export interface CertificateFechaRow extends CertificateMultiViewRow {
  plannedDatesCount: number;
  realDatesCount: number;
  precisionKind: 'PREPROGRAMADA_MES' | 'PROGRAMADA_EXACTA' | 'SIN_FECHA';
  precisionLabel: string;
  latestDateLabel: string;
  urgency: AuditUrgencyClassification;
}

function getDefaultYearMonth(referenceIsoDate?: string): {
  year: number;
  month: number;
  iso: string;
} {
  const iso =
    referenceIsoDate && /^\d{4}-\d{2}-\d{2}$/.test(referenceIsoDate)
      ? referenceIsoDate
      : new Date().toISOString().slice(0, 10);
  const year = Number(iso.slice(0, 4)) || new Date().getFullYear();
  const month = Number(iso.slice(5, 7)) || new Date().getMonth() + 1;
  return { year, month, iso };
}

/**
 * Extracts active planned date records (`PREPROGRAMADA_MES` | `PROGRAMADA_EXACTA`)
 * ordered by ascending `numero_secuencia`. Never includes `REAL` dates.
 */
export function extractActivePlannedDates(
  audit: ProgramacionAuditEntity | null | undefined
): AuditDateEntry[] {
  if (!audit) return [];
  const rawFechas = (audit.fechas || []).filter(
    (f) => !f.deleted_at && (f.tipo_fecha === 'PREPROGRAMADA_MES' || f.tipo_fecha === 'PROGRAMADA_EXACTA')
  );
  if (rawFechas.length > 0) {
    return rawFechas
      .slice()
      .sort((a, b) => (a.numero_secuencia || 0) - (b.numero_secuencia || 0));
  }
  if (
    audit.latestDate &&
    !audit.latestDate.deleted_at &&
    (audit.latestDate.tipo_fecha === 'PREPROGRAMADA_MES' ||
      audit.latestDate.tipo_fecha === 'PROGRAMADA_EXACTA')
  ) {
    return [audit.latestDate];
  }
  return [];
}

/**
 * Extracts active `REAL` execution date records ordered ascending.
 * `Designación → Fecha` displays these read-only and never edits or deletes them.
 */
export function extractRealExecutionDates(
  audit: ProgramacionAuditEntity | null | undefined
): AuditDateEntry[] {
  if (!audit) return [];
  return (audit.fechas || [])
    .filter((f) => !f.deleted_at && f.tipo_fecha === 'REAL')
    .slice()
    .sort((a, b) => (a.numero_secuencia || 0) - (b.numero_secuencia || 0));
}

export function buildPlannedDateDraftsFromAudit(
  audit: ProgramacionAuditEntity | null | undefined,
  referenceIsoDate?: string
): PlannedDateRowDraft[] {
  const defaults = getDefaultYearMonth(referenceIsoDate);
  const planned = extractActivePlannedDates(audit);
  return planned.map((entry, idx) => {
    const start = entry.fecha_inicio ? entry.fecha_inicio.slice(0, 10) : defaults.iso;
    const end = entry.fecha_fin ? entry.fecha_fin.slice(0, 10) : start;
    const isMonthMode = entry.tipo_fecha === 'PREPROGRAMADA_MES';
    const derivedYear =
      entry.anio ?? (Number(start.slice(0, 4)) || defaults.year);
    const derivedMonth =
      entry.mes ?? (Number(start.slice(5, 7)) || defaults.month);

    return {
      localId: entry.id || `planned-${idx + 1}`,
      existingId: entry.id || null,
      numero_secuencia: entry.numero_secuencia ?? idx + 1,
      tag: entry.tag === 'Reprogramación' ? 'Reprogramación' : 'Programación',
      tipo_fecha: isMonthMode ? 'PREPROGRAMADA_MES' : 'PROGRAMADA_EXACTA',
      anio: derivedYear,
      mes: derivedMonth,
      fecha_inicio: start,
      fecha_fin: end,
      singleDay: start === end,
      observacion: entry.observacion || '',
    };
  });
}

export function createEmptyPlannedDateDraft(
  existingCount: number,
  referenceIsoDate?: string,
  localIdOverride?: string
): PlannedDateRowDraft {
  const defaults = getDefaultYearMonth(referenceIsoDate);
  return {
    localId: localIdOverride || `new-${existingCount + 1}-${Date.now()}`,
    existingId: null,
    numero_secuencia: null,
    tag: existingCount > 0 ? 'Reprogramación' : 'Programación',
    tipo_fecha: 'PREPROGRAMADA_MES',
    anio: defaults.year,
    mes: defaults.month,
    fecha_inicio: defaults.iso,
    fecha_fin: defaults.iso,
    singleDay: true,
    observacion: '',
  };
}

export function togglePlannedDateDraftMode(
  draft: PlannedDateRowDraft,
  nextMode: 'PREPROGRAMADA_MES' | 'PROGRAMADA_EXACTA'
): PlannedDateRowDraft {
  if (draft.tipo_fecha === nextMode) return draft;
  if (nextMode === 'PROGRAMADA_EXACTA') {
    const mm = String(Math.min(12, Math.max(1, draft.mes || 1))).padStart(2, '0');
    const yyyy = draft.anio >= 2020 && draft.anio <= 2100 ? draft.anio : new Date().getFullYear();
    const fallbackStart = /^\d{4}-\d{2}-\d{2}$/.test(draft.fecha_inicio)
      ? draft.fecha_inicio
      : `${yyyy}-${mm}-01`;
    const fallbackEnd = draft.singleDay
      ? fallbackStart
      : /^\d{4}-\d{2}-\d{2}$/.test(draft.fecha_fin) && draft.fecha_fin >= fallbackStart
      ? draft.fecha_fin
      : fallbackStart;
    return {
      ...draft,
      tipo_fecha: 'PROGRAMADA_EXACTA',
      fecha_inicio: fallbackStart,
      fecha_fin: fallbackEnd,
    };
  }

  const parsedYear = /^\d{4}-\d{2}-\d{2}$/.test(draft.fecha_inicio)
    ? Number(draft.fecha_inicio.slice(0, 4))
    : draft.anio;
  const parsedMonth = /^\d{4}-\d{2}-\d{2}$/.test(draft.fecha_inicio)
    ? Number(draft.fecha_inicio.slice(5, 7))
    : draft.mes;

  return {
    ...draft,
    tipo_fecha: 'PREPROGRAMADA_MES',
    anio: parsedYear >= 2020 && parsedYear <= 2100 ? parsedYear : draft.anio,
    mes: parsedMonth >= 1 && parsedMonth <= 12 ? parsedMonth : draft.mes,
  };
}

export function validatePlannedDatesList(
  drafts: ReadonlyArray<PlannedDateRowDraft>
): PlannedDatesValidationResult {
  const normalized: NormalizedPlannedDatePayload[] = [];

  for (let i = 0; i < drafts.length; i += 1) {
    const row = drafts[i];
    const rowLabel = `fila #${i + 1}`;
    const tag: 'Programación' | 'Reprogramación' =
      i === 0 && row.tag !== 'Reprogramación' ? 'Programación' : row.tag;

    if (row.tipo_fecha === 'PREPROGRAMADA_MES') {
      if (
        !Number.isFinite(row.anio) ||
        row.anio < 2020 ||
        row.anio > 2100 ||
        !Number.isFinite(row.mes) ||
        row.mes < 1 ||
        row.mes > 12
      ) {
        return {
          valid: false,
          error: `Indique un mes (1–12) y año válido en la ${rowLabel}.`,
          normalized: [],
        };
      }
      const check = validateAuditDateEntryInput(
        {
          tipo_fecha: 'PREPROGRAMADA_MES',
          anio: Math.trunc(row.anio),
          mes: Math.trunc(row.mes),
          tag,
          observacion: row.observacion.trim() || null,
        },
        { allowReal: false }
      );
      if (!check.valid) {
        return {
          valid: false,
          error: check.error || `Fecha preprogramada inválida en la ${rowLabel}.`,
          normalized: [],
        };
      }
      normalized.push({
        tag,
        tipo_fecha: 'PREPROGRAMADA_MES',
        anio: Math.trunc(row.anio),
        mes: Math.trunc(row.mes),
        fecha_inicio: null,
        fecha_fin: null,
        observacion: row.observacion.trim() || null,
      });
    } else {
      const start = row.fecha_inicio.trim();
      const end = row.singleDay ? start : row.fecha_fin.trim() || start;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
        return {
          valid: false,
          error: `Indique fecha de inicio y fin válidas en la ${rowLabel}.`,
          normalized: [],
        };
      }
      if (end < start) {
        return {
          valid: false,
          error: `La fecha fin no puede ser anterior a la fecha inicio en la ${rowLabel}.`,
          normalized: [],
        };
      }
      const check = validateAuditDateEntryInput(
        {
          tipo_fecha: 'PROGRAMADA_EXACTA',
          fecha_inicio: start,
          fecha_fin: end,
          tag,
          observacion: row.observacion.trim() || null,
        },
        { allowReal: false }
      );
      if (!check.valid) {
        return {
          valid: false,
          error: check.error || `Fecha exacta inválida en la ${rowLabel}.`,
          normalized: [],
        };
      }
      normalized.push({
        tag,
        tipo_fecha: 'PROGRAMADA_EXACTA',
        anio: null,
        mes: null,
        fecha_inicio: start,
        fecha_fin: end,
        observacion: row.observacion.trim() || null,
      });
    }
  }

  return { valid: true, error: null, normalized };
}

/**
 * Computes a conflict-free sync plan (`toUpdate`, `toArchive`, `toInsert`) across all active
 * audits in the linked batch (`programa_auditoria`), preserving `REAL` execution rows untouched
 * and avoiding unique `(id_auditoria, numero_secuencia)` collisions during partial archival.
 */
export function buildLinkedBatchDateSyncPlan(
  batchAudits: ReadonlyArray<ProgramacionAuditEntity>,
  normalizedDrafts: ReadonlyArray<NormalizedPlannedDatePayload>
): AuditBatchDateSyncOperations[] {
  return batchAudits
    .filter((a) => !a.deleted_at)
    .map((audit) => {
      const allActive = (audit.fechas || []).filter((f) => !f.deleted_at);
      const existingPlanned = extractActivePlannedDates(audit);
      const maxAllSeq = allActive.reduce(
        (max, entry) => Math.max(max, entry.numero_secuencia || 0),
        0
      );

      const minCount = Math.min(existingPlanned.length, normalizedDrafts.length);
      const toUpdate: AuditBatchDateSyncOperations['toUpdate'] = [];
      for (let i = 0; i < minCount; i += 1) {
        const target = existingPlanned[i];
        toUpdate.push({
          dateId: target.id,
          numero_secuencia: target.numero_secuencia || i + 1,
          payload: normalizedDrafts[i],
        });
      }

      const toArchive: AuditBatchDateSyncOperations['toArchive'] = existingPlanned
        .slice(minCount)
        .map((entry, idx) => ({
          dateId: entry.id,
          numero_secuencia: entry.numero_secuencia || minCount + idx + 1,
        }));

      const toInsert: AuditBatchDateSyncOperations['toInsert'] = normalizedDrafts
        .slice(minCount)
        .map((payload, idx) => ({
          numero_secuencia: maxAllSeq + 1 + idx,
          payload,
        }));

      return {
        auditId: audit.id,
        toUpdate,
        toArchive,
        toInsert,
      };
    });
}

export interface BuildCertificateFechaRowsParams {
  certificates?: ReadonlyArray<CertificateRecord>;
  detailedCerts?: ReadonlyArray<CertificadoDetailEntity | SoftDeletableCertificado>;
  audits: ReadonlyArray<ProgramacionAuditEntity>;
  programs?: ReadonlyArray<ProgramaAuditoriaEntity>;
  referenceIsoDate?: string;
}

export function buildCertificateFechaRows(
  params: BuildCertificateFechaRowsParams
): CertificateFechaRow[] {
  const baseRows = buildCertificateMultiViewRows(params);
  return baseRows.map((row) => {
    const plannedList = extractActivePlannedDates(row.latestAudit);
    const realList = extractRealExecutionDates(row.latestAudit);
    const latestPlanned =
      resolveLatestPlannedDate(plannedList) ?? row.latestPlannedDate;

    const precisionKind: CertificateFechaRow['precisionKind'] = latestPlanned
      ? latestPlanned.tipo_fecha === 'PROGRAMADA_EXACTA'
        ? 'PROGRAMADA_EXACTA'
        : 'PREPROGRAMADA_MES'
      : 'SIN_FECHA';

    const precisionLabel =
      precisionKind === 'PROGRAMADA_EXACTA'
        ? 'Fecha Exacta'
        : precisionKind === 'PREPROGRAMADA_MES'
        ? 'Mes + Año'
        : 'Sin fecha';

    const latestDateLabel = latestPlanned
      ? formatAuditDateLabel(latestPlanned)
      : row.latestAudit?.fecha_inicio
      ? row.latestAudit.fecha_inicio.slice(0, 10)
      : 'Sin fecha programada';

    return {
      ...row,
      plannedDatesCount: plannedList.length,
      realDatesCount: realList.length,
      precisionKind,
      precisionLabel,
      latestDateLabel,
    };
  });
}
