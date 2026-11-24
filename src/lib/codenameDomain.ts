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
