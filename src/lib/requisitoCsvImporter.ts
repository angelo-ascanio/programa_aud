import {
  computeRequisitoLtreePath,
  type NormaEntity,
  type RequisitoLtree,
} from './extraDomain';
import { isValidUuid } from './zeroUuid';

export type CsvStandardSlug =
  | 'iso9001_2015'
  | 'iso14001_2015'
  | 'iso45001_2018'
  | 'iso22000_2018'
  | 'iso27001_2022'
  | 'ntf4073_2022'
  | 'iso17065_2012'
  | 'iso50001_2018';

export type RequisitoTranslationLang = 'es' | 'en';

export interface CsvStandardDefinition {
  slug: CsvStandardSlug;
  id: string;
  codigo: string;
  norma: string;
  esquema: string;
  titulo: string;
  estatus: NormaEntity['estatus'];
  fecha_publicacion: string;
}

export interface RawCsvClauseRow {
  external_key: string;
  code: string;
  standard_slug: string;
  parent_external_key: string | null;
  explicit_code: boolean;
}

export interface RawCsvTranslationRow {
  external_key: string;
  clause_external_key: string;
  lang_external_id: string;
  title: string;
  content_html: string;
}

export interface NormalizedClauseRecord {
  id: string;
  id_norma: string;
  norma_codigo: string;
  standard_slug: CsvStandardSlug;
  id_requisito_padre: string | null;
  parent_external_key: string | null;
  codigo: string;
  ruta_materializada: string;
  explicit_code: boolean;
  external_key: string;
  nivel: number;
  es_padre: boolean;
}

export interface NormalizedTranslationRecord {
  id: string;
  id_requisito: string;
  clause_external_key: string;
  lang: RequisitoTranslationLang;
  title: string;
  content_html: string;
}

export interface CodeRepairEvent {
  external_key: string;
  standard_slug: CsvStandardSlug;
  original_code: string;
  repaired_code: string;
}

export interface NormalizedCsvDataset {
  standards: ReadonlyArray<CsvStandardDefinition>;
  clauses: NormalizedClauseRecord[];
  translations: NormalizedTranslationRecord[];
  repairedCodes: CodeRepairEvent[];
}

export const LTREE_PATH_PATTERN = /^[A-Za-z0-9_]+(\.[A-Za-z0-9_]+)*$/;

export const CSV_STANDARD_DEFINITIONS: ReadonlyArray<CsvStandardDefinition> = [
  {
    slug: 'iso9001_2015',
    id: 'e0000000-0000-0000-0000-000000009001',
    codigo: 'ISO 9001:2015',
    norma: 'ISO 9001:2015',
    esquema: 'SGC - Calidad',
    titulo: 'Sistemas de Gestión de la Calidad — Requisitos',
    estatus: 'Vigente',
    fecha_publicacion: '2015-09-15',
  },
  {
    slug: 'iso14001_2015',
    id: 'e0000000-0000-0000-0000-000000014001',
    codigo: 'ISO 14001:2015',
    norma: 'ISO 14001:2015',
    esquema: 'SGA - Gestión Ambiental',
    titulo: 'Sistemas de Gestión Ambiental — Requisitos con orientación para su uso',
    estatus: 'Vigente',
    fecha_publicacion: '2015-09-15',
  },
  {
    slug: 'iso45001_2018',
    id: 'e0000000-0000-0000-0000-000000045001',
    codigo: 'ISO 45001:2018',
    norma: 'ISO 45001:2018',
    esquema: 'SST - Seguridad y Salud Laboral',
    titulo: 'Sistemas de Gestión de la Seguridad y Salud en el Trabajo — Requisitos',
    estatus: 'Vigente',
    fecha_publicacion: '2018-03-12',
  },
  {
    slug: 'iso22000_2018',
    id: 'e0000000-0000-0000-0000-000000022000',
    codigo: 'ISO 22000:2018',
    norma: 'ISO 22000:2018',
    esquema: 'SGIA - Inocuidad Alimentaria',
    titulo: 'Sistemas de Gestión de la Inocuidad de los Alimentos — Requisitos para cualquier organización en la cadena alimentaria',
    estatus: 'Vigente',
    fecha_publicacion: '2018-06-19',
  },
  {
    slug: 'iso27001_2022',
    id: 'e0000000-0000-0000-0000-000000027001',
    codigo: 'ISO/IEC 27001:2022',
    norma: 'ISO/IEC 27001:2022',
    esquema: 'SGSI - Seguridad de la Información',
    titulo: 'Seguridad de la información, ciberseguridad y protección de la privacidad — Sistemas de gestión',
    estatus: 'Vigente',
    fecha_publicacion: '2022-10-25',
  },
  {
    slug: 'ntf4073_2022',
    id: 'e0000000-0000-0000-0000-000000004073',
    codigo: 'NTF 4073:2022',
    norma: 'NTF 4073:2022',
    esquema: 'HACCP - Análisis de Peligros y PCC',
    titulo: 'Sistema de Análisis de Peligros y Puntos Críticos de Control (HACCP) — Requisitos y Directrices de Aplicación',
    estatus: 'Vigente',
    fecha_publicacion: '2022-01-01',
  },
  {
    slug: 'iso17065_2012',
    id: 'e0000000-0000-0000-0000-000000017065',
    codigo: 'ISO/IEC 17065:2012',
    norma: 'ISO/IEC 17065:2012',
    esquema: 'OEC - Certificación de Producto',
    titulo: 'Evaluación de la conformidad — Requisitos para organismos que certifican productos, procesos y servicios',
    estatus: 'Vigente',
    fecha_publicacion: '2012-09-15',
  },
  {
    slug: 'iso50001_2018',
    id: 'e0000000-0000-0000-0000-000000050001',
    codigo: 'ISO 50001:2018',
    norma: 'ISO 50001:2018',
    esquema: 'SGE - Gestión de la Energía',
    titulo: 'Sistemas de Gestión de la Energía — Requisitos con orientación para su uso',
    estatus: 'Vigente',
    fecha_publicacion: '2018-08-21',
  },
];

export const CSV_STANDARD_BY_SLUG: ReadonlyMap<CsvStandardSlug, CsvStandardDefinition> =
  new Map(CSV_STANDARD_DEFINITIONS.map((def) => [def.slug, def]));

/**
 * Historical UUIDs already referenced by foreign keys in 06_datos_prueba.sql
 * (`hallazgo`, `requisitos_por_proceso`, `requisitos_no_aplicables_certificado`).
 */
export const HISTORICAL_CLAUSE_UUID_BY_EXTERNAL_KEY: Readonly<Record<string, string>> = {
  clause_iso_9001_2015_0006: 'f0000000-0000-0000-0000-000000000004', // 4
  clause_iso_9001_2015_0007: 'f0000000-0000-0000-0000-000000000041', // 4.1
  clause_iso_9001_2015_0008: 'f0000000-0000-0000-0000-000000000042', // 4.2
  clause_iso_9001_2015_0028: 'f0000000-0000-0000-0000-000000000005', // 5
  clause_iso_9001_2015_0029: 'f0000000-0000-0000-0000-000000000051', // 5.1
  clause_iso_9001_2015_0152: 'f0000000-0000-0000-0000-000000000008', // 8
  clause_iso_9001_2015_0244: 'f0000000-0000-0000-0000-000000000085', // 8.5
};

/**
 * Pure RFC 4180 CSV parser supporting CRLF/LF newlines inside quoted fields
 * and "" escaped double quotes inside HTML content.
 */
export function parseCsvRecords(csvText: string): string[][] {
  const cleanText = csvText.startsWith('\uFEFF') ? csvText.slice(1) : csvText;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < cleanText.length; i += 1) {
    const ch = cleanText[i];
    if (inQuotes) {
      if (ch === '"') {
        if (cleanText[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\r') {
      if (cleanText[i + 1] === '\n') {
        i += 1;
      }
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}

export function parseClauseCsvRows(csvText: string): RawCsvClauseRow[] {
  const records = parseCsvRecords(csvText);
  if (records.length === 0) return [];
  const header = records[0].map((col) => col.trim());
  const idIdx = header.indexOf('id');
  const codeIdx = header.indexOf('code');
  const stdIdx = header.indexOf('standard_id/id');
  const parentIdx = header.indexOf('parent_id/id');
  const explicitIdx = header.indexOf('explicit_code');

  if (idIdx < 0 || codeIdx < 0 || stdIdx < 0 || parentIdx < 0 || explicitIdx < 0) {
    throw new Error(`Invalid standard.clause.csv header: ${header.join(', ')}`);
  }

  return records.slice(1).map((cols, rowIndex) => {
    const externalKey = (cols[idIdx] ?? '').trim();
    const code = (cols[codeIdx] ?? '').trim();
    const standardSlug = (cols[stdIdx] ?? '').trim();
    const parentRaw = (cols[parentIdx] ?? '').trim();
    const explicitRaw = (cols[explicitIdx] ?? '').trim().toUpperCase();

    if (!externalKey || !code || !standardSlug) {
      throw new Error(`Malformed clause CSV row at index ${rowIndex + 1}: missing required column`);
    }

    return {
      external_key: externalKey,
      code,
      standard_slug: standardSlug,
      parent_external_key: parentRaw ? parentRaw : null,
      explicit_code: explicitRaw === 'TRUE' || explicitRaw === '1' || explicitRaw === 'YES',
    };
  });
}

export function parseTranslationCsvRows(csvText: string): RawCsvTranslationRow[] {
  const records = parseCsvRecords(csvText);
  if (records.length === 0) return [];
  const header = records[0].map((col) => col.trim());
  const idIdx = header.indexOf('id');
  const clauseIdx = header.indexOf('clause_id/id');
  const langIdx = header.indexOf('lang_id/id');
  const titleIdx = header.indexOf('title');
  const contentIdx = header.indexOf('content');

  if (idIdx < 0 || clauseIdx < 0 || langIdx < 0 || titleIdx < 0 || contentIdx < 0) {
    throw new Error(`Invalid standard.clause.translation.csv header: ${header.join(', ')}`);
  }

  return records.slice(1).map((cols, rowIndex) => {
    const externalKey = (cols[idIdx] ?? '').trim();
    const clauseExternalKey = (cols[clauseIdx] ?? '').trim();
    const langExternalId = (cols[langIdx] ?? '').trim();
    const title = (cols[titleIdx] ?? '').trim();
    const contentHtml = cols[contentIdx] ?? '';

    if (!externalKey || !clauseExternalKey || !langExternalId) {
      throw new Error(
        `Malformed translation CSV row at index ${rowIndex + 1}: missing required column`
      );
    }

    return {
      external_key: externalKey,
      clause_external_key: clauseExternalKey,
      lang_external_id: langExternalId,
      title,
      content_html: contentHtml,
    };
  });
}

function fnv1a32(input: string, seed: number): number {
  let hash = seed >>> 0;
  for (let i = 0; i < input.length; i += 1) {
    const code = input.charCodeAt(i);
    hash ^= code & 0xff;
    hash = Math.imul(hash, 0x01000193) >>> 0;
    if (code > 0xff) {
      hash ^= (code >>> 8) & 0xff;
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
  }
  return hash >>> 0;
}

/**
 * Pure deterministic UUID generator (RFC 4122 v4-formatted 128-bit digest)
 * using 4 independent seeded FNV-1a lanes, suitable for both Node and browser runtimes.
 */
export function deriveDeterministicUuid(namespace: string, key: string): string {
  const fullInput = `${namespace}:${key}`;
  const lane0 = fnv1a32(`0:${fullInput}`, 0x811c9dc5);
  const lane1 = fnv1a32(`1:${fullInput}:rev`, 0x9e3779b9);
  const lane2 = fnv1a32(`2:${key}:${namespace}`, 0x85ebca6b);
  const lane3 = fnv1a32(`3:${fullInput.length}:${fullInput}`, 0xc2b2ae35);

  const bytes = new Uint8Array(16);
  const lanes = [lane0, lane1, lane2, lane3];
  for (let i = 0; i < 4; i += 1) {
    const val = lanes[i];
    bytes[i * 4] = (val >>> 24) & 0xff;
    bytes[i * 4 + 1] = (val >>> 16) & 0xff;
    bytes[i * 4 + 2] = (val >>> 8) & 0xff;
    bytes[i * 4 + 3] = val & 0xff;
  }

  // Set RFC 4122 version (4) and variant (10xx) bits
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export function deriveDeterministicClauseUuid(externalKey: string): string {
  const historical = HISTORICAL_CLAUSE_UUID_BY_EXTERNAL_KEY[externalKey];
  if (historical) return historical;
  return deriveDeterministicUuid('programa_aud.requisito', externalKey);
}

export function deriveDeterministicTranslationUuid(
  clauseExternalKey: string,
  lang: RequisitoTranslationLang
): string {
  return deriveDeterministicUuid('programa_aud.requisito_traduccion', `${clauseExternalKey}:${lang}`);
}

/**
 * Deterministic repair of spreadsheet-truncated trailing zeros (e.g. `3.10` exported as `3.1`).
 * When a code already exists under the same `(standard_slug, parent_external_key)` and matches `\.[1-9]$`,
 * checks sibling sequence progression (e.g., previous sibling ends in `.9` such as `3.9` -> `3.10`,
 * `3.19` -> `3.20`, `7.9` -> `7.10`) and restores the trailing `'0'`.
 */
export function repairTruncatedClauseCodes(rawRows: ReadonlyArray<RawCsvClauseRow>): {
  rows: RawCsvClauseRow[];
  repairs: CodeRepairEvent[];
} {
  const seenByGroup = new Map<string, Set<string>>();
  const lastSiblingByGroup = new Map<string, string>();
  const repairs: CodeRepairEvent[] = [];

  const repairedRows = rawRows.map((row) => {
    const standardDef = CSV_STANDARD_BY_SLUG.get(row.standard_slug as CsvStandardSlug);
    if (!standardDef) {
      throw new Error(`Unknown standard slug in CSV: ${row.standard_slug}`);
    }

    const groupKey = `${row.standard_slug}::${row.parent_external_key ?? '__ROOT__'}`;
    let groupCodes = seenByGroup.get(groupKey);
    if (!groupCodes) {
      groupCodes = new Set<string>();
      seenByGroup.set(groupKey, groupCodes);
    }

    let finalCode = row.code;
    const prevSiblingCode = lastSiblingByGroup.get(groupKey) ?? '';

    if (groupCodes.has(finalCode) && /\.[1-9]$/.test(finalCode)) {
      const candidate = `${finalCode}0`;
      const prevMatchesSequence =
        !prevSiblingCode ||
        prevSiblingCode.endsWith('9') ||
        prevSiblingCode.startsWith(`${finalCode.slice(0, -1)}`);

      if (prevMatchesSequence && !groupCodes.has(candidate)) {
        repairs.push({
          external_key: row.external_key,
          standard_slug: standardDef.slug,
          original_code: finalCode,
          repaired_code: candidate,
        });
        finalCode = candidate;
      }
    }

    groupCodes.add(finalCode);
    lastSiblingByGroup.set(groupKey, finalCode);

    return finalCode === row.code
      ? { ...row }
      : {
          ...row,
          code: finalCode,
        };
  });

  return { rows: repairedRows, repairs };
}

function topologicallySortClauseRows(rawRows: ReadonlyArray<RawCsvClauseRow>): RawCsvClauseRow[] {
  const byKey = new Map<string, RawCsvClauseRow>();
  const childrenByParent = new Map<string, RawCsvClauseRow[]>();
  const roots: RawCsvClauseRow[] = [];

  for (const row of rawRows) {
    if (byKey.has(row.external_key)) {
      throw new Error(`Duplicate clause external_key in CSV: ${row.external_key}`);
    }
    byKey.set(row.external_key, row);
  }

  for (const row of rawRows) {
    if (!row.parent_external_key) {
      roots.push(row);
    } else {
      if (!byKey.has(row.parent_external_key)) {
        throw new Error(
          `Clause "${row.external_key}" references missing parent "${row.parent_external_key}"`
        );
      }
      const list = childrenByParent.get(row.parent_external_key) ?? [];
      list.push(row);
      childrenByParent.set(row.parent_external_key, list);
    }
  }

  const ordered: RawCsvClauseRow[] = [];
  const visited = new Set<string>();
  const queue: RawCsvClauseRow[] = [...roots];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current.external_key)) continue;
    visited.add(current.external_key);
    ordered.push(current);

    const children = childrenByParent.get(current.external_key);
    if (children && children.length > 0) {
      queue.unshift(...children);
    }
  }

  if (ordered.length !== rawRows.length) {
    const missing = rawRows
      .filter((r) => !visited.has(r.external_key))
      .map((r) => r.external_key)
      .slice(0, 5);
    throw new Error(
      `Cycle or disconnected hierarchy detected during topological sort: ${missing.join(', ')}`
    );
  }

  return ordered;
}

export function normalizeCsvClauseRows(rawRows: ReadonlyArray<RawCsvClauseRow>): {
  clauses: NormalizedClauseRecord[];
  repairedCodes: CodeRepairEvent[];
} {
  const { rows: repairedRows, repairs } = repairTruncatedClauseCodes(rawRows);
  const sortedRows = topologicallySortClauseRows(repairedRows);

  const parentCounts = new Map<string, number>();
  for (const row of sortedRows) {
    if (row.parent_external_key) {
      parentCounts.set(
        row.parent_external_key,
        (parentCounts.get(row.parent_external_key) ?? 0) + 1
      );
    }
  }

  const normalizedByKey = new Map<string, NormalizedClauseRecord>();
  const seenUuid = new Set<string>();
  const seenNormaCodigo = new Set<string>();
  const clauses: NormalizedClauseRecord[] = [];

  for (const row of sortedRows) {
    const standardDef = CSV_STANDARD_BY_SLUG.get(row.standard_slug as CsvStandardSlug);
    if (!standardDef) {
      throw new Error(`Unknown standard slug "${row.standard_slug}" for clause "${row.external_key}"`);
    }

    const parentRecord = row.parent_external_key
      ? normalizedByKey.get(row.parent_external_key) ?? null
      : null;

    if (row.parent_external_key && !parentRecord) {
      throw new Error(
        `Parent "${row.parent_external_key}" must precede child "${row.external_key}"`
      );
    }

    const id = deriveDeterministicClauseUuid(row.external_key);
    if (!isValidUuid(id)) {
      throw new Error(`Derived invalid UUID "${id}" for clause "${row.external_key}"`);
    }
    if (seenUuid.has(id)) {
      throw new Error(`UUID collision "${id}" detected at clause "${row.external_key}"`);
    }
    seenUuid.add(id);

    const normaCodigoKey = `${standardDef.id}::${row.code}`;
    if (seenNormaCodigo.has(normaCodigoKey)) {
      throw new Error(
        `Duplicate (id_norma, codigo) collision after repair: "${standardDef.codigo}" / "${row.code}" (${row.external_key})`
      );
    }
    seenNormaCodigo.add(normaCodigoKey);

    const rutaMaterializada = computeRequisitoLtreePath(
      row.code,
      parentRecord
        ? {
            codigo: parentRecord.codigo,
            ruta_materializada: parentRecord.ruta_materializada,
          }
        : null
    );

    if (!LTREE_PATH_PATTERN.test(rutaMaterializada)) {
      throw new Error(
        `Invalid LTREE path "${rutaMaterializada}" computed for clause "${row.external_key}"`
      );
    }

    const normalized: NormalizedClauseRecord = {
      id,
      id_norma: standardDef.id,
      norma_codigo: standardDef.codigo,
      standard_slug: standardDef.slug,
      id_requisito_padre: parentRecord ? parentRecord.id : null,
      parent_external_key: row.parent_external_key,
      codigo: row.code,
      ruta_materializada: rutaMaterializada,
      explicit_code: row.explicit_code,
      external_key: row.external_key,
      nivel: rutaMaterializada.split('.').length,
      es_padre: (parentCounts.get(row.external_key) ?? 0) > 0,
    };

    normalizedByKey.set(row.external_key, normalized);
    clauses.push(normalized);
  }

  return { clauses, repairedCodes: repairs };
}

export function mapCsvLanguageCode(langExternalId: string): RequisitoTranslationLang {
  const normalized = (langExternalId || '').trim().toLowerCase();
  if (normalized === 'base.lang_es' || normalized === 'es') return 'es';
  if (normalized === 'base.lang_en' || normalized === 'en') return 'en';
  throw new Error(`Unsupported CSV translation language identifier: "${langExternalId}"`);
}

/**
 * Strips Odoo proprietary `data-oe-version="..."` attributes (e.g. `<div data-oe-version="1.2">`)
 * while leaving all HTML semantics and `{clause_...}` placeholder tokens completely intact.
 */
export function cleanOdooTranslationHtml(rawHtml: string): string {
  return (rawHtml || '').replace(/\s+data-oe-version=(?:"[^"]*"|'[^']*')/g, '').trim();
}

export function normalizeCsvTranslationRows(
  rawRows: ReadonlyArray<RawCsvTranslationRow>,
  clauseByExternalKey: ReadonlyMap<string, NormalizedClauseRecord>
): NormalizedTranslationRecord[] {
  const seenLangPairs = new Set<string>();
  const seenIds = new Set<string>();
  const translations: NormalizedTranslationRecord[] = [];

  for (const row of rawRows) {
    const clause = clauseByExternalKey.get(row.clause_external_key);
    if (!clause) {
      throw new Error(
        `Translation "${row.external_key}" references unknown clause "${row.clause_external_key}"`
      );
    }

    const lang = mapCsvLanguageCode(row.lang_external_id);
    const pairKey = `${clause.id}::${lang}`;
    if (seenLangPairs.has(pairKey)) {
      throw new Error(
        `Duplicate translation for clause "${row.clause_external_key}" and lang "${lang}"`
      );
    }
    seenLangPairs.add(pairKey);

    const id = deriveDeterministicTranslationUuid(clause.external_key, lang);
    if (!isValidUuid(id) || seenIds.has(id)) {
      throw new Error(`Invalid or duplicate translation UUID "${id}"`);
    }
    seenIds.add(id);

    translations.push({
      id,
      id_requisito: clause.id,
      clause_external_key: clause.external_key,
      lang,
      title: row.title.replace(/\s+/g, ' ').trim(),
      content_html: cleanOdooTranslationHtml(row.content_html),
    });
  }

  return translations;
}

export function normalizeNormasCsvDatasets(
  clauseCsvText: string,
  translationCsvText: string
): NormalizedCsvDataset {
  const rawClauses = parseClauseCsvRows(clauseCsvText);
  const rawTranslations = parseTranslationCsvRows(translationCsvText);

  const { clauses, repairedCodes } = normalizeCsvClauseRows(rawClauses);
  const clauseByExternalKey = new Map<string, NormalizedClauseRecord>(
    clauses.map((c) => [c.external_key, c])
  );
  const translations = normalizeCsvTranslationRows(rawTranslations, clauseByExternalKey);

  return {
    standards: CSV_STANDARD_DEFINITIONS,
    clauses,
    translations,
    repairedCodes,
  };
}

export function buildNormaEntitiesFromCsv(
  clauses: ReadonlyArray<NormalizedClauseRecord>
): NormaEntity[] {
  const countByNormaId = new Map<string, number>();
  for (const clause of clauses) {
    countByNormaId.set(clause.id_norma, (countByNormaId.get(clause.id_norma) ?? 0) + 1);
  }

  return CSV_STANDARD_DEFINITIONS.map((std) => ({
    id: std.id,
    esquema: std.esquema,
    codigo: std.codigo,
    titulo: std.titulo,
    estatus: std.estatus,
    fecha_publicacion: std.fecha_publicacion,
    norma: std.norma,
    clausulas_count: countByNormaId.get(std.id) ?? 0,
    acreditaciones_count: 0,
  }));
}

export function buildRequisitoLtreeFromNormalized(
  clause: NormalizedClauseRecord,
  title = '',
  descripcion = ''
): RequisitoLtree {
  return {
    id: clause.id,
    id_norma: clause.id_norma,
    norma_codigo: clause.norma_codigo,
    id_requisito_padre: clause.id_requisito_padre,
    codigo: clause.codigo,
    titulo: title || '',
    descripcion: descripcion || undefined,
    ruta_materializada: clause.ruta_materializada,
    nivel: clause.nivel,
    es_padre: clause.es_padre,
  };
}
