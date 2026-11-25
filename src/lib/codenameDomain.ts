/**
 * Step 1.2 — Pure Codename, Short Name & Abbreviation Engine ("Less Is More")
 *
 * Strictly typed (`strict: true`, 0 `any` / `as any`) and Zero-UUID compliant
 * across all generated labels, codenames, and tooltips.
 */

import {
  formatAuditDateLabel,
  resolveLatestAuditDate,
  type AuditDateEntry,
} from './auditPlanningEngine';
import { containsRawUuid } from './zeroUuid';

const UUID_TOKEN_REGEX = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const ISO_YEAR_MONTH_REGEX = /^(\d{4})-(\d{2})(?:-\d{2})?/;

export const AUDIT_TYPE_SHORT_ABBREVIATIONS: Readonly<Record<string, string>> = {
  'etapa 1': 'Et.1',
  'etapa 2': 'Et.2',
  'seguimiento 1': 'Seg.1',
  'seguimiento 2': 'Seg.2',
  renovacion: 'Renov.',
  diagnostico: 'Diag.',
  extraordinaria: 'Extra.',
  especial: 'Esp.',
  otro: 'Otro',
};

export interface AuditCodenamePeriodInput {
  fechas?: ReadonlyArray<AuditDateEntry> | null;
  latestDate?: AuditDateEntry | null;
  fecha_inicio?: string | null;
  fecha_reprogramacion?: string | null;
}

export interface AuditCodenameInput extends AuditCodenamePeriodInput {
  tipo_auditoria?: string | null;
  tipo_abreviacion?: string | null;
  codigo_auditoria?: string | null;
}

export interface ShortConglomeradoInput {
  nombre?: string | null;
  abreviacion?: string | null;
  codigo_grupo?: string | null;
}

export interface ShortOrganizacionInput {
  nombre?: string | null;
  abreviacion?: string | null;
}

function stripRawUuids(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .replace(UUID_TOKEN_REGEX, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeLookupKey(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function compactToMaxLength(text: string, maxLen: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLen) return clean;

  const words = clean.split(' ').filter(Boolean);
  if (words.length >= 2) {
    const twoWords = `${words[0]} ${words[1]}`;
    if (twoWords.length <= maxLen) return twoWords;
  }
  if (words.length >= 1 && words[0].length <= maxLen && words[0].length >= 4) {
    return words[0];
  }
  return clean.slice(0, maxLen).replace(/[\s,.\-·]+$/, '').trim();
}

/**
 * Formats an audit type name into a compact abbreviation (`Et.1`, `Seg.1`, `Renov.`, etc.),
 * prioritizing explicit `tipo_auditoria.abreviacion` when supplied and free of UUIDs.
 */
export function formatAuditTypeShortLabel(
  tipoNombre: string | null | undefined,
  explicitAbrev?: string | null
): string {
  const cleanExplicit = stripRawUuids(explicitAbrev);
  if (cleanExplicit && !containsRawUuid(cleanExplicit)) {
    return cleanExplicit.slice(0, 16);
  }

  const cleanTipo = stripRawUuids(tipoNombre);
  if (!cleanTipo) {
    return 'Otro';
  }

  const normalized = normalizeLookupKey(cleanTipo);
  const mapped = AUDIT_TYPE_SHORT_ABBREVIATIONS[normalized];
  if (mapped) {
    return mapped;
  }

  if (cleanTipo.length <= 8) {
    return cleanTipo;
  }

  const truncated = cleanTipo.slice(0, 7).trimEnd().replace(/\.+$/, '');
  return truncated ? `${truncated}.` : 'Otro';
}

/**
 * Resolves a short `YYYY-MM` period label from the latest active `AuditDateEntry`
 * or safe date fallback, returning `'Sin fecha'` when no valid date exists.
 */
export function formatAuditPeriodShort(auditLike: AuditCodenamePeriodInput): string {
  const latestFromList = resolveLatestAuditDate(auditLike.fechas);
  const latest =
    latestFromList ??
    (auditLike.latestDate && !auditLike.latestDate.deleted_at ? auditLike.latestDate : null);

  if (latest) {
    if (latest.tipo_fecha === 'PROGRAMADA_EXACTA' || latest.tipo_fecha === 'REAL') {
      const startMatch = ISO_YEAR_MONTH_REGEX.exec((latest.fecha_inicio || '').trim());
      if (startMatch) {
        return `${startMatch[1]}-${startMatch[2]}`;
      }
    }
    if (latest.tipo_fecha === 'PREPROGRAMADA_MES') {
      const anio = latest.anio;
      const mes = latest.mes;
      if (
        typeof anio === 'number' &&
        typeof mes === 'number' &&
        Number.isFinite(anio) &&
        Number.isFinite(mes) &&
        anio >= 2000 &&
        anio <= 2100 &&
        mes >= 1 &&
        mes <= 12
      ) {
        return `${Math.trunc(anio)}-${String(Math.trunc(mes)).padStart(2, '0')}`;
      }
    }
  }

  const reprogMatch = ISO_YEAR_MONTH_REGEX.exec((auditLike.fecha_reprogramacion || '').trim());
  if (reprogMatch) {
    return `${reprogMatch[1]}-${reprogMatch[2]}`;
  }

  const inicioMatch = ISO_YEAR_MONTH_REGEX.exec((auditLike.fecha_inicio || '').trim());
  if (inicioMatch) {
    return `${inicioMatch[1]}-${inicioMatch[2]}`;
  }

  return 'Sin fecha';
}

/**
 * Generates the canonical compact audit codename (e.g. `'2026-11 Seg.1'`, `'Sin fecha Diag.'`).
 */
export function formatAuditCodename(input: AuditCodenameInput): string {
  const periodShort = formatAuditPeriodShort(input);
  const shortTipo = formatAuditTypeShortLabel(input.tipo_auditoria, input.tipo_abreviacion);
  return stripRawUuids(`${periodShort} ${shortTipo}`) || 'Sin fecha Otro';
}

/**
 * Formats compact codename followed by internal code when both are available (Zero-UUID safe).
 */
export function formatAuditDisplayWithCode(input: AuditCodenameInput): string {
  const codename = formatAuditCodename(input);
  const cleanCode = stripRawUuids(input.codigo_auditoria);
  return cleanCode ? `${codename} (${cleanCode})` : codename;
}

/**
 * Builds a clean Spanish tooltip string for an audit codename without exposing any UUID.
 */
export function getAuditCodenameTooltip(input: AuditCodenameInput): string {
  const cleanCode = stripRawUuids(input.codigo_auditoria);
  const cleanTipo = stripRawUuids(input.tipo_auditoria);
  const latest =
    resolveLatestAuditDate(input.fechas) ??
    (input.latestDate && !input.latestDate.deleted_at ? input.latestDate : null);
  const dateDetail = latest ? formatAuditDateLabel(latest) : formatAuditPeriodShort(input);
  const parts = [cleanCode, cleanTipo, stripRawUuids(dateDetail)].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : 'Auditoría programada';
}

const CONGLOMERADO_PREFIX_REGEX =
  /^(?:conglomerado\s+(?:industrial|empresarial)|grupo\s+(?:industrial|empresarial)|corporaci[oó]n(?:\s+empresarial)?|conglomerado|grupo|holding)\s+/i;

const CORPORATE_SUFFIX_REGEX =
  /(?:\s*,?\s*\b(?:c\.?\s*a\.?|s\.?\s*a\.?\s*s\.?|s\.?\s*a\.?\s*c\.?|s\.?\s*a\.?|s\.?\s*r\.?\s*l\.?|s\.?\s*l\.?|ltda\.?|inc\.?|llc|corp\.?))+\s*$/i;

/**
 * Resolves a short, readable Conglomerado name (`<= 22` chars when inferred) prioritizing `abreviacion`.
 */
export function resolveShortConglomeradoName(input: ShortConglomeradoInput): string {
  const cleanAbrev = stripRawUuids(input.abreviacion);
  if (cleanAbrev && !containsRawUuid(cleanAbrev)) {
    return cleanAbrev;
  }

  let cleaned = stripRawUuids(input.nombre);
  if (cleaned) {
    cleaned = cleaned.replace(CONGLOMERADO_PREFIX_REGEX, '').trim();
    cleaned = cleaned.replace(CORPORATE_SUFFIX_REGEX, '').replace(/[,.\s]+$/, '').trim();
    if (cleaned) {
      return compactToMaxLength(cleaned, 22);
    }
  }

  const cleanCode = stripRawUuids(input.codigo_grupo);
  if (cleanCode && !containsRawUuid(cleanCode)) {
    return compactToMaxLength(cleanCode, 22);
  }

  return 'Conglomerado';
}

/**
 * Resolves a short, readable Organización name (`<= 22` chars when inferred) prioritizing `abreviacion`.
 */
export function resolveShortOrganizacionName(input: ShortOrganizacionInput): string {
  const cleanAbrev = stripRawUuids(input.abreviacion);
  if (cleanAbrev && !containsRawUuid(cleanAbrev)) {
    return cleanAbrev;
  }

  let cleaned = stripRawUuids(input.nombre);
  if (cleaned) {
    cleaned = cleaned.replace(CORPORATE_SUFFIX_REGEX, '').replace(/[,.\s]+$/, '').trim();
    if (cleaned) {
      return compactToMaxLength(cleaned, 22);
    }
  }

  return 'Organización';
}

// =============================================================================
// Formal Sequential Codenames (`AUD-AAAA-BBBB-YYYY` & `L-AUD-AAAA-BBBB-YYYY`)
// =============================================================================

export interface AuditYearSourceInput extends AuditCodenamePeriodInput {
  id?: string | null;
  codigo_auditoria?: string | null;
  fecha_programada?: string | null;
  fecha_programacion?: string | null;
  anio?: number | null;
  estado_ciclo?: string | null;
  deleted_at?: string | null;
}

export interface LinkedProgramYearSourceInput {
  id?: string | null;
  codigo_programa?: string | null;
  fecha_programada?: string | null;
  fecha_programacion?: string | null;
  fecha_inicio?: string | null;
  anio?: number | null;
  estado_ciclo?: string | null;
  auditorias?: ReadonlyArray<AuditYearSourceInput> | null;
  deleted_at?: string | null;
}

export interface AuditCodenameCountResult {
  totalAllTime: number;
  totalInYear: number;
}

const STRUCTURED_CODE_YEAR_REGEX = /^(?:L-)?AUD-\d+-\d+-(\d{4})$/i;
const LEGACY_PROGRAM_YEAR_REGEX = /^(?:PROG|PRG)-(\d{4})-/i;
const LEGACY_AUDIT_YEAR_REGEX = /^AUD-(\d{4})-/i;

function normalizeTargetYear(targetYear: number): number {
  if (Number.isFinite(targetYear)) {
    const truncated = Math.trunc(targetYear);
    if (truncated >= 1900 && truncated <= 2999) {
      return truncated;
    }
  }
  return new Date().getUTCFullYear();
}

function parseIsoYear(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = /^(\d{4})/.exec(value.trim());
  if (!match) return null;
  const parsed = Number.parseInt(match[1], 10);
  return Number.isSafeInteger(parsed) && parsed >= 1900 && parsed <= 2999 ? parsed : null;
}

/**
 * Pads a sequential audit counter to at least 4 digits without truncating numbers >= 10000.
 */
export function formatAuditCounter4(value: number): string {
  const safe = Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
  return String(safe).padStart(4, '0');
}

/**
 * Extracts the 4-digit target year for an audit from its active planned/real date,
 * flat date fields, or fallback codename suffix (`AUD-AAAA-BBBB-YYYY` / `AUD-YYYY-...`).
 */
export function resolveAuditTargetYearForCodename(
  auditLike: AuditYearSourceInput | null | undefined
): number | null {
  if (!auditLike) return null;

  const latestFromList = resolveLatestAuditDate(auditLike.fechas);
  const latest =
    latestFromList ??
    (auditLike.latestDate && !auditLike.latestDate.deleted_at ? auditLike.latestDate : null);

  if (latest) {
    if (
      typeof latest.anio === 'number' &&
      Number.isFinite(latest.anio) &&
      latest.anio >= 1900 &&
      latest.anio <= 2999
    ) {
      return Math.trunc(latest.anio);
    }
    const latestStartYear = parseIsoYear(latest.fecha_inicio);
    if (latestStartYear !== null) return latestStartYear;
    const latestEndYear = parseIsoYear(latest.fecha_fin);
    if (latestEndYear !== null) return latestEndYear;
  }

  const reprogYear = parseIsoYear(auditLike.fecha_reprogramacion);
  if (reprogYear !== null) return reprogYear;

  const inicioYear = parseIsoYear(auditLike.fecha_inicio);
  if (inicioYear !== null) return inicioYear;

  const progYear = parseIsoYear(auditLike.fecha_programada ?? auditLike.fecha_programacion);
  if (progYear !== null) return progYear;

  if (
    typeof auditLike.anio === 'number' &&
    Number.isFinite(auditLike.anio) &&
    auditLike.anio >= 1900 &&
    auditLike.anio <= 2999
  ) {
    return Math.trunc(auditLike.anio);
  }

  const cleanCode = stripRawUuids(auditLike.codigo_auditoria);
  if (cleanCode) {
    const structuredMatch = STRUCTURED_CODE_YEAR_REGEX.exec(cleanCode);
    if (structuredMatch) {
      return Number.parseInt(structuredMatch[1], 10);
    }
    const legacyMatch = LEGACY_AUDIT_YEAR_REGEX.exec(cleanCode);
    if (legacyMatch) {
      return Number.parseInt(legacyMatch[1], 10);
    }
  }

  return null;
}

/**
 * Extracts the 4-digit target year for a whole linked audit (`programa_auditoria`).
 */
export function resolveProgramTargetYearForCodename(
  program: LinkedProgramYearSourceInput | null | undefined
): number | null {
  if (!program) return null;

  const childAudits = program.auditorias ?? [];
  for (const audit of childAudits) {
    if (audit.deleted_at) continue;
    const yr = resolveAuditTargetYearForCodename(audit);
    if (yr !== null) return yr;
  }
  for (const audit of childAudits) {
    const yr = resolveAuditTargetYearForCodename(audit);
    if (yr !== null) return yr;
  }

  const progYear =
    parseIsoYear(program.fecha_programada) ??
    parseIsoYear(program.fecha_programacion) ??
    parseIsoYear(program.fecha_inicio);
  if (progYear !== null) return progYear;

  if (
    typeof program.anio === 'number' &&
    Number.isFinite(program.anio) &&
    program.anio >= 1900 &&
    program.anio <= 2999
  ) {
    return Math.trunc(program.anio);
  }

  const cleanCode = stripRawUuids(program.codigo_programa);
  if (cleanCode) {
    const structuredMatch = STRUCTURED_CODE_YEAR_REGEX.exec(cleanCode);
    if (structuredMatch) {
      return Number.parseInt(structuredMatch[1], 10);
    }
    const legacyMatch = LEGACY_PROGRAM_YEAR_REGEX.exec(cleanCode);
    if (legacyMatch) {
      return Number.parseInt(legacyMatch[1], 10);
    }
  }

  return null;
}

/**
 * Counts existing individual audits (1 per audited certificate) across ALL lifecycle statuses
 * (`Cancelada`, `Borrador`, `En Programación`, `Programada`, `En Ejecución`, `Cerrada`, etc.).
 */
export function countExistingIndividualAudits(
  audits: ReadonlyArray<AuditYearSourceInput>,
  targetYear: number
): AuditCodenameCountResult {
  const year = normalizeTargetYear(targetYear);
  const seenIds = new Set<string>();
  let totalAllTime = 0;
  let totalInYear = 0;

  for (const audit of audits || []) {
    if (audit.deleted_at) continue;
    const idKey = typeof audit.id === 'string' ? audit.id.trim() : '';
    if (idKey) {
      if (seenIds.has(idKey)) continue;
      seenIds.add(idKey);
    }
    totalAllTime += 1;
    if (resolveAuditTargetYearForCodename(audit) === year) {
      totalInYear += 1;
    }
  }

  return { totalAllTime, totalInYear };
}

/**
 * Counts existing whole linked audits (`programa_auditoria`, 1 per campaign regardless of how many
 * certificates it spans) across ALL lifecycle statuses.
 */
export function countExistingLinkedAudits(
  programs: ReadonlyArray<LinkedProgramYearSourceInput>,
  targetYear: number
): AuditCodenameCountResult {
  const year = normalizeTargetYear(targetYear);
  const seenIds = new Set<string>();
  let totalAllTime = 0;
  let totalInYear = 0;

  for (const program of programs || []) {
    if (program.deleted_at) continue;
    const idKey = typeof program.id === 'string' ? program.id.trim() : '';
    if (idKey) {
      if (seenIds.has(idKey)) continue;
      seenIds.add(idKey);
    }
    totalAllTime += 1;
    if (resolveProgramTargetYearForCodename(program) === year) {
      totalInYear += 1;
    }
  }

  return { totalAllTime, totalInYear };
}

/**
 * Formats an individual audit codename: `AUD-AAAA-BBBB-YYYY`.
 */
export function formatIndividualAuditCodenameCode(
  totalIndex: number,
  yearIndex: number,
  targetYear: number
): string {
  const year = normalizeTargetYear(targetYear);
  return `AUD-${formatAuditCounter4(totalIndex)}-${formatAuditCounter4(yearIndex)}-${year}`;
}

/**
 * Formats a whole linked audit codename: `L-AUD-AAAA-BBBB-YYYY`.
 */
export function formatLinkedAuditCodenameCode(
  totalIndex: number,
  yearIndex: number,
  targetYear: number
): string {
  const year = normalizeTargetYear(targetYear);
  return `L-AUD-${formatAuditCounter4(totalIndex)}-${formatAuditCounter4(yearIndex)}-${year}`;
}

/**
 * Generates `count` sequential, collision-free `AUD-AAAA-BBBB-YYYY` codenames for a `+ Auditoría` batch.
 */
export function generateNextIndividualAuditCodenamesBatch(params: {
  existingAudits: ReadonlyArray<AuditYearSourceInput>;
  targetYear: number;
  count: number;
  reservedCodes?: ReadonlySet<string> | ReadonlyArray<string>;
}): string[] {
  const year = normalizeTargetYear(params.targetYear);
  const batchSize = Math.max(0, Math.trunc(params.count));
  if (batchSize === 0) return [];

  const counts = countExistingIndividualAudits(params.existingAudits, year);
  const takenCodes = new Set<string>();

  for (const audit of params.existingAudits || []) {
    if (audit.deleted_at) continue;
    const code = audit.codigo_auditoria?.trim().toUpperCase();
    if (code) takenCodes.add(code);
  }
  if (params.reservedCodes) {
    for (const code of params.reservedCodes) {
      const normalized = code?.trim().toUpperCase();
      if (normalized) takenCodes.add(normalized);
    }
  }

  let nextAll = counts.totalAllTime + 1;
  let nextYear = counts.totalInYear + 1;
  const result: string[] = [];

  for (let i = 0; i < batchSize; i += 1) {
    let candidate = formatIndividualAuditCodenameCode(nextAll, nextYear, year);
    while (takenCodes.has(candidate.toUpperCase())) {
      nextAll += 1;
      nextYear += 1;
      candidate = formatIndividualAuditCodenameCode(nextAll, nextYear, year);
    }
    takenCodes.add(candidate.toUpperCase());
    result.push(candidate);
    nextAll += 1;
    nextYear += 1;
  }

  return result;
}

/**
 * Generates the next collision-free `L-AUD-AAAA-BBBB-YYYY` codename for a whole linked audit (`programa_auditoria`).
 */
export function generateNextLinkedAuditCodename(params: {
  existingPrograms: ReadonlyArray<LinkedProgramYearSourceInput>;
  targetYear: number;
  reservedCodes?: ReadonlySet<string> | ReadonlyArray<string>;
}): string {
  const year = normalizeTargetYear(params.targetYear);
  const counts = countExistingLinkedAudits(params.existingPrograms, year);
  const takenCodes = new Set<string>();

  for (const prog of params.existingPrograms || []) {
    if (prog.deleted_at) continue;
    const code = prog.codigo_programa?.trim().toUpperCase();
    if (code) takenCodes.add(code);
  }
  if (params.reservedCodes) {
    for (const code of params.reservedCodes) {
      const normalized = code?.trim().toUpperCase();
      if (normalized) takenCodes.add(normalized);
    }
  }

  let nextAll = counts.totalAllTime + 1;
  let nextYear = counts.totalInYear + 1;
  let candidate = formatLinkedAuditCodenameCode(nextAll, nextYear, year);
  while (takenCodes.has(candidate.toUpperCase())) {
    nextAll += 1;
    nextYear += 1;
    candidate = formatLinkedAuditCodenameCode(nextAll, nextYear, year);
  }
  return candidate;
}

export function isStructuredAuditCodename(code: string | null | undefined): boolean {
  if (!code) return false;
  return STRUCTURED_CODE_YEAR_REGEX.test(code.trim());
}

