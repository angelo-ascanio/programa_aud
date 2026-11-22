/**
 * Step 3.2 — `Designación → Tipo`: Lógica Pura Multi-Anual, Algoritmo de "Revivificación"
 * y Reprogramaciones 1:N.
 *
 * Strictly typed (`strict: true`, 0 `any` / `as any`) and Zero-UUID compliant
 * in all user-facing labels, warnings, and validation errors.
 */

import { assertValidUuid, isValidUuid } from './zeroUuid';
import {
  formatAuditDateLabel,
  resolveLatestPlannedDate,
  validateAuditDateEntryInput,
  type AuditDateEntry,
  type ProgramaAuditoriaEntity,
} from './auditPlanningEngine';
import type { ProgramacionAuditEntity } from './auditExecution';
import type { TipoAuditoriaCatalogItem } from './extraDomain';
import {
  buildCertificateMultiViewRows,
  getLinkedSiblingAudits,
  type BuildCertificateMultiViewRowsParams,
  type CertificateMultiViewRow,
} from './certificateAuditSelector';
import type { VinculoEntity } from './vinculoDomain';

export type UrgencyBucketKey =
  | 'VENCIDA'
  | 'PROXIMA_30D'
  | 'ESTE_TRIMESTRE'
  | 'ESTE_ANIO'
  | 'ANIO_MAS_1'
  | 'FUTURO_LEJANO'
  | 'SIN_FECHA';

export type TipoQueuePreset = 'PROXIMAS' | 'PREPROGRAMADAS' | 'FUTURO' | 'TODAS';

export interface AuditUrgencyClassification {
  bucket: UrgencyBucketKey;
  rank: number;
  label: string;
  badgeClass: string;
  effectiveStartIso: string | null;
  effectiveEndIso: string | null;
  targetYear: number | null;
  daysUntilStart: number | null;
  isFutureTrapRisk: boolean;
}

export interface CampaignStep3Row {
  program: ProgramaAuditoriaEntity;
  vinculo: VinculoEntity | null;
  latestPlannedDate: AuditDateEntry | null;
  reprogramCount: number;
  urgency: AuditUrgencyClassification;
  hasAllAuditTypes: boolean;
  missingTypeCertCount: number;
  step3Complete: boolean;
  step4Complete: boolean;
}

export interface Step3NewCycleCertTypeDraft {
  id_certificado: string;
  numero_certificado: string;
  organizacion_nombre: string;
  norma_codigo: string;
  id_tipo_auditoria: string;
}

export interface Step3NewCycleDraft {
  id_vinculo: string;
  codigo_programa: string;
  etiqueta: string;
  dateMode: 'PREPROGRAMADA_MES' | 'PROGRAMADA_EXACTA';
  anio: number;
  mes: number;
  fecha_inicio: string;
  fecha_fin: string;
  fecha_programada?: string;
  observacion: string;
  certTypes: Step3NewCycleCertTypeDraft[];
}

export interface ReprogramDateDraft {
  id_auditoria: string;
  tipo_fecha: 'PREPROGRAMADA_MES' | 'PROGRAMADA_EXACTA';
  anio: number;
  mes: number;
  fecha_inicio: string;
  fecha_fin: string;
  observacion: string;
}

function lastDayOfMonthIso(year: number, month: number): string {
  const dt = new Date(Date.UTC(year, month, 0));
  return dt.toISOString().slice(0, 10);
}

function diffDaysUtc(fromIso: string, toIso: string): number {
  const fromMs = Date.parse(`${fromIso}T00:00:00Z`);
  const toMs = Date.parse(`${toIso}T00:00:00Z`);
  return Math.round((toMs - fromMs) / 86_400_000);
}

/**
 * Converts a planned `AuditDateEntry` (`PREPROGRAMADA_MES` or `PROGRAMADA_EXACTA`)
 * into an effective `[startIso, endIso]` calendar window and target year.
 */
export function resolveEffectivePlannedWindow(
  entry: AuditDateEntry | null | undefined
): { startIso: string | null; endIso: string | null; year: number | null } {
  if (!entry || entry.deleted_at) {
    return { startIso: null, endIso: null, year: null };
  }
  if (entry.tipo_fecha === 'PREPROGRAMADA_MES' && entry.anio && entry.mes) {
    const mm = String(entry.mes).padStart(2, '0');
    return {
      startIso: `${entry.anio}-${mm}-01`,
      endIso: lastDayOfMonthIso(entry.anio, entry.mes),
      year: entry.anio,
    };
  }
  if (entry.fecha_inicio) {
    const end =
      entry.fecha_fin && entry.fecha_fin >= entry.fecha_inicio
        ? entry.fecha_fin
        : entry.fecha_inicio;
    return {
      startIso: entry.fecha_inicio,
      endIso: end,
      year: Number(entry.fecha_inicio.slice(0, 4)),
    };
  }
  return { startIso: null, endIso: null, year: null };
}

/**
 * Classifies an audit's planned date into ascending urgency buckets (`0..6`)
 * relative to `referenceIsoDate`, enabling automatic "revivification" of future
 * pre-programmed cycles (`ANIO_MAS_1` / `FUTURO_LEJANO` → `ESTE_ANIO` → `ESTE_TRIMESTRE`
 * → `PROXIMA_30D` → `VENCIDA`) without database mutation.
 */
export function computeAuditUrgencyClassification(
  plannedDate: AuditDateEntry | null,
  estadoCiclo: string,
  referenceIsoDate: string = new Date().toISOString().slice(0, 10)
): AuditUrgencyClassification {
  const { startIso, endIso, year } = resolveEffectivePlannedWindow(plannedDate);
  if (!startIso || !endIso || year === null) {
    return {
      bucket: 'SIN_FECHA',
      rank: 6,
      label: 'Sin fecha',
      badgeClass: 'bg-rose-50 text-rose-800 border-rose-200',
      effectiveStartIso: null,
      effectiveEndIso: null,
      targetYear: null,
      daysUntilStart: null,
      isFutureTrapRisk: false,
    };
  }

  const refYear = Number(referenceIsoDate.slice(0, 4));
  const daysUntilStart = diffDaysUtc(referenceIsoDate, startIso);
  const daysUntilEnd = diffDaysUtc(referenceIsoDate, endIso);
  const isFinal = ['Auditada', 'Cerrada', 'Cancelada'].includes(estadoCiclo);

  if (daysUntilEnd < 0 && !isFinal) {
    return {
      bucket: 'VENCIDA',
      rank: 0,
      label: `Vencida (${Math.abs(daysUntilEnd)}d)`,
      badgeClass: 'bg-rose-50 text-rose-800 border-rose-300',
      effectiveStartIso: startIso,
      effectiveEndIso: endIso,
      targetYear: year,
      daysUntilStart,
      isFutureTrapRisk: false,
    };
  }

  if (daysUntilStart <= 30) {
    return {
      bucket: 'PROXIMA_30D',
      rank: 1,
      label: daysUntilStart <= 0 ? 'En ventana' : `Próxima ${daysUntilStart}d`,
      badgeClass: 'bg-amber-100 text-amber-900 border-amber-300',
      effectiveStartIso: startIso,
      effectiveEndIso: endIso,
      targetYear: year,
      daysUntilStart,
      isFutureTrapRisk: false,
    };
  }

  if (daysUntilStart <= 90) {
    return {
      bucket: 'ESTE_TRIMESTRE',
      rank: 2,
      label: `Trimestre (${daysUntilStart}d)`,
      badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
      effectiveStartIso: startIso,
      effectiveEndIso: endIso,
      targetYear: year,
      daysUntilStart,
      isFutureTrapRisk: false,
    };
  }

  if (year <= refYear) {
    return {
      bucket: 'ESTE_ANIO',
      rank: 3,
      label: `Año ${year}`,
      badgeClass: 'bg-sky-50 text-sky-800 border-sky-200',
      effectiveStartIso: startIso,
      effectiveEndIso: endIso,
      targetYear: year,
      daysUntilStart,
      isFutureTrapRisk: false,
    };
  }

  if (year === refYear + 1) {
    return {
      bucket: 'ANIO_MAS_1',
      rank: 4,
      label: `Año +1 (${year})`,
      badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
      effectiveStartIso: startIso,
      effectiveEndIso: endIso,
      targetYear: year,
      daysUntilStart,
      isFutureTrapRisk: true,
    };
  }

  return {
    bucket: 'FUTURO_LEJANO',
    rank: 5,
    label: `Futuro (${year})`,
    badgeClass: 'bg-slate-50 text-slate-500 border-slate-200',
    effectiveStartIso: startIso,
    effectiveEndIso: endIso,
    targetYear: year,
    daysUntilStart,
    isFutureTrapRisk: true,
  };
}

/**
 * Returns a preventive banner message when editing a future cycle (`rank >= 4`)
 * to prevent accidentally modifying a `+1/+3` year cycle instead of the active one.
 */
export function requiresFutureYearWarning(
  classification: AuditUrgencyClassification
): string | null {
  if (classification.rank >= 4 && classification.targetYear !== null) {
    return `Atención: este ciclo está programado para el año ${classification.targetYear} (futuro). Confirme que desea modificar el ciclo futuro y no la auditoría vigente.`;
  }
  return null;
}

/**
 * Evaluates whether a Step 3 campaign row belongs to the selected queue preset.
 */
export function matchesTipoQueuePreset(
  row: CampaignStep3Row,
  preset: TipoQueuePreset
): boolean {
  if (preset === 'TODAS') return true;
  if (preset === 'PREPROGRAMADAS') {
    return row.latestPlannedDate?.tipo_fecha === 'PREPROGRAMADA_MES';
  }
  if (preset === 'FUTURO') {
    return row.urgency.rank === 4 || row.urgency.rank === 5;
  }
  // 'PROXIMAS': Vencida, <30d, Trimestre, Año en curso, o Sin fecha aún por completar
  return row.urgency.rank <= 3 || row.urgency.bucket === 'SIN_FECHA';
}

/**
 * Builds and sorts Step 3 campaign rows by imminence (`urgency.rank ASC`, then
 * `effectiveStartIso ASC`) so future cycles (e.g. 2029) never appear above
 * imminent campaigns (e.g. 2026).
 */
export function buildCampaignStep3Rows(
  programs: ReadonlyArray<ProgramaAuditoriaEntity>,
  vinculos: ReadonlyArray<VinculoEntity>,
  referenceIsoDate: string = new Date().toISOString().slice(0, 10)
): CampaignStep3Row[] {
  const vinculoById = new Map(
    vinculos.filter((v) => !v.deleted_at).map((v) => [v.id, v])
  );
  const rows: CampaignStep3Row[] = [];

  for (const program of programs) {
    if (program.deleted_at) continue;
    const activeAudits = program.auditorias.filter((a) => !a.deleted_at);
    if (activeAudits.length === 0) continue;

    const plannedDates = activeAudits
      .map(
        (a) =>
          resolveLatestPlannedDate(a.fechas) ??
          (a.latestDate && a.latestDate.tipo_fecha !== 'REAL' ? a.latestDate : null)
      )
      .filter((d): d is AuditDateEntry => d !== null);

    const latestPlannedDate =
      plannedDates
        .slice()
        .sort((a, b) => b.numero_secuencia - a.numero_secuencia)[0] ?? null;

    const maxReprogramCount = activeAudits.reduce((max, a) => {
      const count = (a.fechas || []).filter(
        (f) => !f.deleted_at && f.tipo_fecha !== 'REAL' && f.tag === 'Reprogramación'
      ).length;
      return Math.max(max, count);
    }, 0);

    const missingTypeCertCount = activeAudits.filter((a) => !a.id_tipo_auditoria).length;
    const hasAllAuditTypes = missingTypeCertCount === 0;
    const step3Complete = hasAllAuditTypes && latestPlannedDate !== null;
    const step4Complete = activeAudits.every(
      (a) => (a.sitiosPlan || []).filter((s) => !s.deleted_at).length >= 1
    );

    const urgency = computeAuditUrgencyClassification(
      latestPlannedDate,
      activeAudits[0]?.estado_ciclo || 'Borrador',
      referenceIsoDate
    );

    rows.push({
      program,
      vinculo: program.id_vinculo ? vinculoById.get(program.id_vinculo) ?? null : null,
      latestPlannedDate,
      reprogramCount: maxReprogramCount,
      urgency,
      hasAllAuditTypes,
      missingTypeCertCount,
      step3Complete,
      step4Complete,
    });
  }

  return rows.sort((a, b) => {
    if (a.urgency.rank !== b.urgency.rank) return a.urgency.rank - b.urgency.rank;
    const aStart = a.urgency.effectiveStartIso || '9999-12-31';
    const bStart = b.urgency.effectiveStartIso || '9999-12-31';
    return aStart.localeCompare(bStart);
  });
}

/**
 * Validates a Step 3 new multi-year cycle draft against its active `Vínculo`,
 * enforcing planned date precision (`PREPROGRAMADA_MES` or `PROGRAMADA_EXACTA`, never `REAL`)
 * and a valid `id_tipo_auditoria` for every active certificate in the link.
 */
export function validateStep3NewCycleDraft(
  draft: Step3NewCycleDraft,
  vinculos: ReadonlyArray<VinculoEntity>
): string | null {
  if (!isValidUuid(draft.id_vinculo)) {
    return 'Seleccione un vínculo configurado en Paso 2 (Vínculo).';
  }
  const vinculo = vinculos.find((v) => !v.deleted_at && v.id === draft.id_vinculo);
  const activeVinculoCerts = vinculo
    ? vinculo.certificados.filter((c) => !c.deleted_at)
    : [];
  if (!vinculo || activeVinculoCerts.length === 0) {
    return 'El vínculo seleccionado no existe o no tiene certificados activos.';
  }
  if (!draft.etiqueta.trim()) {
    return 'Indique un nombre o etiqueta para este ciclo de auditoría.';
  }

  if (draft.dateMode === 'PREPROGRAMADA_MES') {
    if (draft.anio < 2020 || draft.anio > 2100 || draft.mes < 1 || draft.mes > 12) {
      return 'Indique un mes (1–12) y año válido para la preprogramación.';
    }
    const dateCheck = validateAuditDateEntryInput(
      {
        tipo_fecha: 'PREPROGRAMADA_MES',
        anio: draft.anio,
        mes: draft.mes,
      },
      { allowReal: false }
    );
    if (!dateCheck.valid) {
      return dateCheck.error || 'Indique un mes (1–12) y año válido para la preprogramación.';
    }
  } else if (draft.dateMode === 'PROGRAMADA_EXACTA') {
    const singleGoal = (draft.fecha_programada ?? '').trim();
    const startDate = draft.fecha_inicio.trim() || singleGoal;
    const endDate = draft.fecha_fin.trim() || singleGoal || startDate;
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(startDate) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(endDate) ||
      (singleGoal.length > 0 && !/^\d{4}-\d{2}-\d{2}$/.test(singleGoal))
    ) {
      return 'Indique una fecha objetivo programada exacta válida (YYYY-MM-DD).';
    }
    if (endDate < startDate) {
      return 'La fecha fin programada no puede ser anterior a la fecha de inicio.';
    }
    const dateCheck = validateAuditDateEntryInput(
      {
        tipo_fecha: 'PROGRAMADA_EXACTA',
        fecha_inicio: startDate,
        fecha_fin: endDate,
      },
      { allowReal: false }
    );
    if (!dateCheck.valid) {
      return (
        dateCheck.error ||
        'Indique una fecha objetivo programada exacta válida (YYYY-MM-DD).'
      );
    }
  } else {
    return 'Seleccione un modo de fecha programada válido (Preprogramada por Mes/Año o Programada Exacta).';
  }

  if (draft.certTypes.length === 0) {
    return 'El vínculo debe contener al menos un certificado para asignar tipo de auditoría.';
  }

  const draftByCertId = new Map<string, Step3NewCycleCertTypeDraft>();
  for (const item of draft.certTypes) {
    assertValidUuid(item.id_certificado, 'certificado');
    if (!isValidUuid(item.id_tipo_auditoria)) {
      return `Seleccione el tipo de auditoría para el certificado ${item.numero_certificado}.`;
    }
    draftByCertId.set(item.id_certificado, item);
  }

  for (const activeCert of activeVinculoCerts) {
    if (!draftByCertId.has(activeCert.id_certificado)) {
      return `Seleccione el tipo de auditoría para el certificado ${activeCert.numero_certificado}.`;
    }
  }

  return null;
}

/**
 * Computes the next incremental sequence number (`1 → 2 → 3 ...`) for reprogramming
 * history while ignoring soft-deleted (`deleted_at`) date entries.
 */
export function buildNextReprogramDateSequence(
  existingFechas: ReadonlyArray<AuditDateEntry>
): number {
  const maxSeq = existingFechas
    .filter((f) => !f.deleted_at)
    .reduce((max, f) => Math.max(max, f.numero_secuencia || 0), 0);
  return maxSeq + 1;
}

export interface CompactLinkNatureMeta {
  short: string;
  full: string;
}

export interface CertificateStatusBadgeMeta {
  label: string;
  badgeClass: string;
}

export type PlannedDateCandidate = AuditDateEntry & { created_at?: string | null };

/**
 * Formats compact abbreviated link-nature label + full descriptive tooltip for Multi View.
 */
export function formatCompactLinkNature(
  program: Pick<ProgramaAuditoriaEntity, 'tipo_vinculacion' | 'es_vinculada'> | null | undefined,
  siblingCount: number,
  hasAudit: boolean
): CompactLinkNatureMeta {
  if (!hasAudit) {
    return {
      short: 'Sin aud.',
      full: 'Sin auditorías registradas',
    };
  }

  const n = Math.max(1, Math.trunc(siblingCount));
  const nature = program?.tipo_vinculacion;

  if (!program || nature === 'Individual' || n <= 1) {
    return {
      short: 'Indiv.',
      full: 'Auditoría individual',
    };
  }

  switch (nature) {
    case 'Integrada':
      return {
        short: `Integ. (${n})`,
        full: `Integrada (${n} certificados)`,
      };
    case 'Combinada':
      return {
        short: `Comb. (${n})`,
        full: `Combinada (${n} certificados)`,
      };
    case 'Conjunta':
      return {
        short: `Conj. (${n})`,
        full: `Conjunta (${n} certificados)`,
      };
    case 'Simultánea':
      return {
        short: `Simul. (${n})`,
        full: `Simultánea (${n} certificados)`,
      };
    case 'Multientidad':
      return {
        short: `Multi. (${n})`,
        full: `Multientidad (${n} certificados)`,
      };
    case 'Mixta':
      return {
        short: `Mixta (${n})`,
        full: `Mixta (${n} certificados)`,
      };
    default:
      return {
        short: `Vinc. (${n})`,
        full: `Vinculada (${n} certificados)`,
      };
  }
}

/**
 * Returns high-contrast Tailwind badge classes for certificate status pills.
 */
export function getCertificateStatusBadgeMeta(
  estatus: string | null | undefined
): CertificateStatusBadgeMeta {
  const rawLabel = (estatus || '').trim();
  const normalized = rawLabel.toLowerCase();

  if (normalized === 'activo' || normalized === 'activa') {
    return {
      label: rawLabel || 'Activo',
      badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    };
  }
  if (normalized === 'estudio' || normalized === 'en estudio') {
    return {
      label: rawLabel || 'Estudio',
      badgeClass: 'bg-sky-50 text-sky-800 border-sky-200',
    };
  }
  if (normalized === 'suspendido' || normalized === 'suspendida') {
    return {
      label: rawLabel || 'Suspendido',
      badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
    };
  }
  if (
    normalized === 'cancelado' ||
    normalized === 'cancelada' ||
    normalized === 'retirado' ||
    normalized === 'retirada' ||
    normalized === 'vencido' ||
    normalized === 'vencida'
  ) {
    return {
      label: rawLabel || 'Cancelado',
      badgeClass: 'bg-rose-50 text-rose-800 border-rose-200',
    };
  }

  return {
    label: rawLabel || 'Sin estatus',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
  };
}

/**
 * Resolves the last-added active planned date (`PREPROGRAMADA_MES` | `PROGRAMADA_EXACTA`)
 * strictly by insertion/sequence order (`numero_secuencia DESC`, fallback `created_at DESC`,
 * fallback array index `DESC`), ignoring target calendar dates and excluding `REAL` rows.
 */
export function resolveLastAddedPlannedDate(
  fechas: ReadonlyArray<PlannedDateCandidate> | null | undefined
): AuditDateEntry | null {
  if (!fechas || fechas.length === 0) return null;
  const activeWithIndex = fechas
    .map((entry, idx) => ({ entry, idx }))
    .filter(
      ({ entry }) =>
        !entry.deleted_at &&
        (entry.tipo_fecha === 'PREPROGRAMADA_MES' || entry.tipo_fecha === 'PROGRAMADA_EXACTA')
    );

  if (activeWithIndex.length === 0) return null;

  activeWithIndex.sort((a, b) => {
    const seqA =
      typeof a.entry.numero_secuencia === 'number' && Number.isFinite(a.entry.numero_secuencia)
        ? a.entry.numero_secuencia
        : 0;
    const seqB =
      typeof b.entry.numero_secuencia === 'number' && Number.isFinite(b.entry.numero_secuencia)
        ? b.entry.numero_secuencia
        : 0;
    if (seqA !== seqB) return seqB - seqA;

    const createdA = typeof a.entry.created_at === 'string' ? a.entry.created_at : '';
    const createdB = typeof b.entry.created_at === 'string' ? b.entry.created_at : '';
    if (createdA !== createdB) return createdB.localeCompare(createdA);

    return b.idx - a.idx;
  });

  return activeWithIndex[0]?.entry ?? null;
}

export interface CertificateTipoRow extends CertificateMultiViewRow {
  latestTipoAudit: string;
  hasTipoDefined: boolean;
  latestAuditCode: string;
  latestDateSummary: string;
  linkShortLabel: string;
  linkFullTooltip: string;
  certStatusBadgeClass: string;
}

export interface TipoLinkedAuditRow {
  audit: ProgramacionAuditEntity;
  isActive: boolean;
  codigo_auditoria: string;
  numero_certificado: string;
  norma_codigo: string;
  organizacion_nombre: string;
  id_tipo_auditoria: string;
  tipo_auditoria: string;
  hasTipoDefined: boolean;
  dateSummary: string;
  estado_ciclo: string;
}

export interface SingleAuditTipoValidationResult {
  valid: boolean;
  error: string | null;
  audit: ProgramacionAuditEntity | null;
  tipo: TipoAuditoriaCatalogItem | null;
}

/**
 * Certificate-Based Multi View rows for `1.1 Designación → Tipo`.
 */
export function buildCertificateTipoRows(
  params: BuildCertificateMultiViewRowsParams
): CertificateTipoRow[] {
  const baseRows = buildCertificateMultiViewRows(params);
  return baseRows.map((row) => {
    const latest = row.latestAudit;
    const fallbackLatestDate =
      latest?.latestDate &&
      !latest.latestDate.deleted_at &&
      latest.latestDate.tipo_fecha !== 'REAL'
        ? latest.latestDate
        : null;
    const latestPlanned =
      resolveLastAddedPlannedDate(latest?.fechas) ??
      fallbackLatestDate ??
      row.latestPlannedDate;

    const urgency = computeAuditUrgencyClassification(
      latestPlanned,
      latest?.estado_ciclo || 'Borrador',
      params.referenceIsoDate
    );

    const hasTipoDefined = Boolean(latest?.id_tipo_auditoria || latest?.tipo_auditoria);
    const latestTipoAudit = latest?.tipo_auditoria || (latest ? 'Por definir' : 'Sin auditorías');
    const latestAuditCode = latest?.codigo_auditoria || 'Sin auditorías';
    const latestDateSummary = latestPlanned
      ? formatAuditDateLabel(latestPlanned)
      : latest?.fecha_inicio
      ? latest.fecha_inicio.slice(0, 10)
      : 'Sin fecha programada';

    const linkMeta = formatCompactLinkNature(
      row.latestProgram,
      row.linkedSiblingCount,
      row.totalAudits > 0
    );
    const statusMeta = getCertificateStatusBadgeMeta(row.estatus);

    return {
      ...row,
      latestPlannedDate: latestPlanned,
      urgency,
      latestTipoAudit,
      hasTipoDefined,
      latestAuditCode,
      latestDateSummary,
      linkShortLabel: linkMeta.short,
      linkFullTooltip: linkMeta.full,
      certStatusBadgeClass: statusMeta.badgeClass,
    };
  });
}

/**
 * Surfaces the active audit and any linked sibling audits in the same batch
 * (`programa_auditoria`) so each audit record can receive its own independent
 * `id_tipo_auditoria` without overwriting sibling audits.
 */
export function buildTipoLinkedAuditRows(
  activeAudit: ProgramacionAuditEntity | null,
  audits: ReadonlyArray<ProgramacionAuditEntity>,
  programs: ReadonlyArray<ProgramaAuditoriaEntity>
): TipoLinkedAuditRow[] {
  if (!activeAudit) return [];
  const linkedCtx = getLinkedSiblingAudits(activeAudit, audits, programs);
  return linkedCtx.siblings.map((sib) => {
    const aud = sib.audit;
    const planned =
      resolveLastAddedPlannedDate(aud.fechas) ??
      (aud.latestDate && !aud.latestDate.deleted_at && aud.latestDate.tipo_fecha !== 'REAL'
        ? aud.latestDate
        : null);
    const dateSummary = planned
      ? formatAuditDateLabel(planned)
      : aud.fecha_inicio
      ? aud.fecha_inicio.slice(0, 10)
      : 'Sin fecha';
    const hasTipoDefined = Boolean(aud.id_tipo_auditoria || aud.tipo_auditoria);
    return {
      audit: aud,
      isActive: sib.isActive,
      codigo_auditoria: aud.codigo_auditoria || 'Auditoría',
      numero_certificado: aud.numero_certificado || 'Certificado',
      norma_codigo: aud.norma_codigo || 'ISO',
      organizacion_nombre: aud.organizacion_nombre || 'Organización',
      id_tipo_auditoria: aud.id_tipo_auditoria || '',
      tipo_auditoria: aud.tipo_auditoria || 'Por definir',
      hasTipoDefined,
      dateSummary,
      estado_ciclo: aud.estado_ciclo || 'En Programación',
    };
  });
}

/**
 * Validates an individual per-audit `id_tipo_auditoria` update with Zero-UUID hygiene.
 */
export function validateSingleAuditTipoChange(params: {
  auditId: string;
  idTipoAuditoria: string;
  audits: ReadonlyArray<ProgramacionAuditEntity>;
  tiposCatalog: ReadonlyArray<TipoAuditoriaCatalogItem>;
}): SingleAuditTipoValidationResult {
  const { auditId, idTipoAuditoria, audits, tiposCatalog } = params;
  if (!isValidUuid(auditId)) {
    return {
      valid: false,
      error: 'No se identificó la auditoría seleccionada para actualizar el tipo.',
      audit: null,
      tipo: null,
    };
  }
  const audit = audits.find((a) => !a.deleted_at && a.id === auditId) ?? null;
  if (!audit) {
    return {
      valid: false,
      error: 'La auditoría seleccionada no está disponible o fue archivada.',
      audit: null,
      tipo: null,
    };
  }
  if (!isValidUuid(idTipoAuditoria)) {
    return {
      valid: false,
      error: `Seleccione un tipo de auditoría válido para ${audit.codigo_auditoria}.`,
      audit,
      tipo: null,
    };
  }
  const tipo = tiposCatalog.find((t) => !t.deleted_at && t.id === idTipoAuditoria) ?? null;
  if (!tipo) {
    return {
      valid: false,
      error: `El tipo de auditoría seleccionado no está activo para ${audit.codigo_auditoria}.`,
      audit,
      tipo: null,
    };
  }
  return { valid: true, error: null, audit, tipo };
}

/**
 * Updates ONLY the single target `auditId` within `programs`, preserving every
 * linked sibling audit's independent `id_tipo_auditoria` and `tipo_auditoria`.
 */
export function applySingleAuditTipoUpdateLocally(
  programs: ReadonlyArray<ProgramaAuditoriaEntity>,
  auditId: string,
  tipo: Pick<TipoAuditoriaCatalogItem, 'id' | 'tipo'>
): ProgramaAuditoriaEntity[] {
  return programs.map((prog) => {
    const hasTarget = prog.auditorias.some((a) => a.id === auditId);
    if (!hasTarget) return prog;
    return {
      ...prog,
      auditorias: prog.auditorias.map((a) =>
        a.id !== auditId
          ? a
          : {
              ...a,
              id_tipo_auditoria: tipo.id,
              tipo_auditoria: tipo.tipo,
            }
      ),
    };
  });
}
