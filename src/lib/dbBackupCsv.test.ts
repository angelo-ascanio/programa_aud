import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import {
  DB_TABLES_TOPO_ORDER,
  buildSampleCsvForTable,
  escapeCsvCell,
  parseCsvToObjects,
  planCsvImport,
  serializeRowsToCsv,
  summarizeBackupBundle,
} from './dbBackupCsv';
import { buildZipArchive } from './zipArchive';
import { assertZeroUuidExposure, isValidUuid } from './zeroUuid';
import {
  createInitialDatabaseBackupState,
  renderDatabaseBackupView,
} from '../views/databaseBackupView';

test('RFC-4180 CSV serialization & parsing handles UTF-8 BOM, Spanish accents, quotes, and multiline fields', () => {
  assert.equal(escapeCsvCell(null), '');
  assert.equal(escapeCsvCell('Fondonorma, S.A.'), '"Fondonorma, S.A."');
  assert.equal(escapeCsvCell('Texto "citado"'), '"Texto ""citado"""');

  const rows = [
    {
      codigo: 'ISO 9001:2015',
      titulo: 'Gestión de Calidad, "Revisión 2026"\nLínea 2',
      es_obligatorio: true,
      meta: { seccion: '4.1' },
    },
  ];

  const csv = serializeRowsToCsv(['codigo', 'titulo', 'es_obligatorio', 'meta'], rows);
  assert.equal(csv.startsWith('\uFEFF'), true);

  const parsed = parseCsvToObjects(csv);
  assert.deepEqual(parsed.headers, ['codigo', 'titulo', 'es_obligatorio', 'meta']);
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0].values.codigo, 'ISO 9001:2015');
  assert.equal(parsed.rows[0].values.titulo, 'Gestión de Calidad, "Revisión 2026"\nLínea 2');
  assert.equal(parsed.rows[0].values.es_obligatorio, 'true');
  assert.equal(parsed.rows[0].values.meta, '{"seccion":"4.1"}');
});

test('ZIP archive builder produces valid PKZIP headers and deflate-compressed entries', () => {
  const sampleCsv = serializeRowsToCsv(['id', 'nombre'], [{ id: '1', nombre: 'Iberometal C.A.' }]);
  const bytes = new TextEncoder().encode(sampleCsv);

  const zip = buildZipArchive(
    [
      { name: 'organizacion.csv', data: bytes },
      { name: 'norma.csv', data: new TextEncoder().encode('\uFEFFcodigo\r\nISO 9001:2015\r\n') },
    ],
    { compress: (raw) => zlib.deflateRawSync(raw) }
  );

  // Verify Local File Header signature PK\x03\x04 and End of Central Directory PK\x05\x06
  assert.equal(zip[0], 0x50);
  assert.equal(zip[1], 0x4b);
  assert.equal(zip[2], 0x03);
  assert.equal(zip[3], 0x04);

  const eocdOffset = zip.length - 22;
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  assert.equal(view.getUint32(eocdOffset, true), 0x06054b50);
  assert.equal(view.getUint16(eocdOffset + 10, true), 2);

  // Verify first entry payload can be read/inflated cleanly
  const method = view.getUint16(8, true);
  const compSize = view.getUint32(18, true);
  const nameLen = view.getUint16(26, true);
  const dataStart = 30 + nameLen;
  const payloadSlice = zip.subarray(dataStart, dataStart + compSize);
  const restoredBytes = method === 8 ? zlib.inflateRawSync(payloadSlice) : payloadSlice;
  assert.equal(new TextDecoder('utf-8', { ignoreBOM: true }).decode(restoredBytes), sampleCsv);
});

test('CSV Import Planner resolves simple IDs to DB UUIDs, skips existing rows, and rejects bad FKs with Zero-UUID messages', () => {
  let seq = 1;
  const deterministicGen = () => {
    const suffix = String(seq).padStart(12, '0');
    seq += 1;
    return `aaaaaaaa-0000-4000-8000-${suffix}`;
  };

  const existingDataByTable = {
    organizacion: [
      {
        id: '30000000-0000-0000-0000-000000000001',
        nombre: 'Iberometal Componentes S.A.',
        abreviacion: 'IBEROMETAL',
        rif: 'J-30192837-4',
        deleted_at: null,
      },
    ],
  };

  const csvText = [
    'id,nombre,abreviacion,rif',
    '1,Iberometal Componentes S.A.,IBEROMETAL,J-30192837-4',
    '2,Industrias Caribe C.A.,CARIBE,J-50123456-7',
    '3,Industrias Caribe Duplicada,CARIBE,J-50123456-7',
    '4,,VACIO,J-00000000-0',
  ].join('\n');

  const plan = planCsvImport({
    tableName: 'organizacion',
    csvText,
    existingDataByTable,
    generateUuid: deterministicGen,
  });

  assert.equal(plan.summary.totalRows, 4);
  assert.equal(plan.summary.toSkip, 2); // Row 1 matches DB; Row 3 duplicates Row 2 in same CSV
  assert.equal(plan.summary.toInsert, 1); // Only Row 2
  assert.equal(plan.summary.errors, 1); // Row 4 missing nombre

  const inserted = plan.insertPayloads[0].record;
  assert.equal(isValidUuid(inserted.id), true);
  assert.equal(inserted.nombre, 'Industrias Caribe C.A.');

  for (const row of plan.previewRows) {
    assert.equal(assertZeroUuidExposure(row.detail).compliant, true);
    assert.equal(assertZeroUuidExposure(row.displayLabel).compliant, true);
  }
});

test('CSV Import Planner resolves parent FKs, self-referential batch IDs, and auto-resolves certificado_version', () => {
  let seq = 10;
  const genUuid = () => `bbbbbbbb-0000-4000-8000-${String(seq++).padStart(12, '0')}`;

  const existingData = {
    norma: [{ id: 'e0000000-0000-0000-0000-000000009001', codigo: 'ISO 9001:2015', norma: 'ISO 9001:2015', deleted_at: null }],
    requisito: [],
    certificado: [{ id: '40000000-0000-0000-0000-000000000001', numero_certificado: 'FN-QMS-2024-001', deleted_at: null }],
    certificado_version: [
      { id: '41000000-0000-0000-0000-000000000001', id_certificado: '40000000-0000-0000-0000-000000000001', es_version_actual: true, version_numero: 1, deleted_at: null },
    ],
    sitio: [],
  };

  // Self-referential requisito batch: child '2' references parent '1'
  const reqPlan = planCsvImport({
    tableName: 'requisito',
    csvText: [
      'id,id_norma,id_requisito_padre,codigo,es_obligatorio',
      '1,ISO 9001:2015,,4,false',
      '2,ISO 9001:2015,1,4.1,true',
    ].join('\n'),
    existingDataByTable: existingData,
    generateUuid: genUuid,
  });

  assert.equal(reqPlan.summary.toInsert, 2);
  assert.equal(reqPlan.summary.errors, 0);
  const parentId = reqPlan.insertPayloads[0].record.id as string;
  const childParentRef = reqPlan.insertPayloads[1].record.id_requisito_padre as string;
  assert.equal(childParentRef, parentId);
  assert.equal(reqPlan.insertPayloads[1].record.ruta_materializada, '4.4_1');

  // Auto-resolve id_certificado_version when omitted on sitio
  const sitioPlan = planCsvImport({
    tableName: 'sitio',
    csvText: [
      'id,id_certificado,numero_sitio,nombre_sitio,direccion_sitio',
      'S1,FN-QMS-2024-001,2,Planta Oriente,Av. Industrial 9',
      'S2,CERT-INEXISTENTE,3,Planta Fantasma,Calle 1',
    ].join('\n'),
    existingDataByTable: existingData,
    generateUuid: genUuid,
  });

  assert.equal(sitioPlan.summary.toInsert, 1);
  assert.equal(sitioPlan.summary.errors, 1);
  assert.equal(
    sitioPlan.insertPayloads[0].record.id_certificado_version,
    '41000000-0000-0000-0000-000000000001'
  );
  assert.equal(assertZeroUuidExposure(sitioPlan.previewRows[1].detail).compliant, true);
});

test('Backup bundle validation, sample CSV template, and UI rendering enforce Zero-UUID and zero buttons in tbody', () => {
  assert.equal(DB_TABLES_TOPO_ORDER.length, 64);

  const sampleOrgCsv = buildSampleCsvForTable('organizacion');
  assert.match(sampleOrgCsv, /Manufactura Andina/);

  const badValidation = summarizeBackupBundle({ app: 'other_app', data: {} });
  assert.equal(badValidation.ok, false);

  const validValidation = summarizeBackupBundle({
    app: 'programa_aud',
    schema_version: '1.0',
    exported_at: '2026-11-26T12:00:00.000Z',
    data: {
      organizacion: [
        { id: '30000000-0000-0000-0000-000000000001', nombre: 'Org A', deleted_at: null },
        { id: '30000000-0000-0000-0000-000000000002', nombre: 'Org B', deleted_at: '2026-01-01T00:00:00Z' },
      ],
    },
  });
  assert.equal(validValidation.ok, true);
  if (validValidation.ok) {
    assert.equal(validValidation.summary.totalRows, 2);
    assert.equal(validValidation.summary.activeRows, 1);
    assert.equal(validValidation.summary.archivedRows, 1);
  }

  const state = createInitialDatabaseBackupState();
  state.tables = [
    {
      name: 'organizacion',
      labelEs: 'Organizaciones clientes',
      groupEs: 'Certificación',
      activeRows: 4,
      archivedRows: 1,
      totalRows: 5,
      csvImportSupported: true,
    },
  ];
  for (const tab of ['backup', 'csv-export', 'csv-import'] as const) {
    state.activeTab = tab;
    const html = renderDatabaseBackupView(state);
    assert.equal(assertZeroUuidExposure(html).compliant, true);
    assert.equal(/<tbody[\s\S]*?<button/i.test(html), false);
  }
});
