import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { OrganizacionEntity } from '../lib/activeCertificates';
import {
  advanceWizardStep,
  createInitialAuditWizardState,
  selectWizardConglomerado,
  selectWizardOrganizacion,
  setWizardCertRelacion,
  setWizardCertTipo,
  toggleWizardVinculoCert,
} from '../lib/auditWizardDomain';
import type { ConglomeradoEntity } from '../lib/conglomeradoDomain';
import type { TipoAuditoriaCatalogItem } from '../lib/extraDomain';
import type { CertificadoDetailEntity } from '../lib/multisiteSampling';
import type { VinculoEntity } from '../lib/vinculoDomain';
import { assertZeroUuidExposure } from '../lib/zeroUuid';
import { renderAuditWizardModal } from './auditWizardModal';

const CONG_1_ID = '10000001-0000-0000-0000-000000000001';
const CONG_NO_VIN_ID = '10000001-0000-0000-0000-000000000002';

const ORG_1_ID = '30000000-0000-0000-0000-000000000001';
const ORG_2_ID = '30000000-0000-0000-0000-000000000002';
const ORG_NO_VIN_ID = '30000000-0000-0000-0000-000000000003';

const CERT_1_ID = '40000000-0000-0000-0000-000000000001';
const CERT_2_ID = '40000000-0000-0000-0000-000000000002';
const CERT_3_ID = '40000000-0000-0000-0000-000000000003';

const VINC_ID = '50000001-0000-0000-0000-000000000001';
const TIPO_SEG1_ID = '70000001-0000-0000-0000-000000000001';
const TIPO_RENOV_ID = '70000001-0000-0000-0000-000000000002';

const SAMPLE_CONGS: ConglomeradoEntity[] = [
  {
    id: CONG_1_ID,
    codigo_grupo: 'CONG-IND-01',
    nombre: 'Conglomerado Industrial Norte S.A.',
    abreviacion: 'Industrial Norte',
    es_individual_auto: false,
    notas: null,
  },
  {
    id: CONG_NO_VIN_ID,
    codigo_grupo: 'CONG-02',
    nombre: 'Grupo Sin Caja C.A.',
    abreviacion: 'Sin Caja',
    es_individual_auto: true,
    notas: null,
  },
];

const SAMPLE_ORGS: OrganizacionEntity[] = [
  {
    id: ORG_1_ID,
    id_grupo_empresarial: CONG_1_ID,
    grupo_empresarial_nombre: 'Conglomerado Industrial Norte S.A.',
    nombre: 'Iberometal Componentes S.A.',
    abreviacion: 'Iberometal',
    rif: 'J-30192837-4',
    direccion_fiscal: 'Zona Industrial',
    estatus: 'Activo',
  },
  {
    id: ORG_2_ID,
    id_grupo_empresarial: CONG_1_ID,
    grupo_empresarial_nombre: 'Conglomerado Industrial Norte S.A.',
    nombre: 'Example Manufactura C.A.',
    abreviacion: 'Example',
    rif: 'J-30987654-2',
    direccion_fiscal: 'Zona Sur',
    estatus: 'Activo',
  },
  {
    id: ORG_NO_VIN_ID,
    id_grupo_empresarial: CONG_NO_VIN_ID,
    grupo_empresarial_nombre: 'Grupo Sin Caja C.A.',
    nombre: 'Organización Sin Vínculo S.A.',
    abreviacion: 'Sin Vínculo',
    rif: 'J-40001111-1',
    direccion_fiscal: 'Centro',
    estatus: 'Activo',
  },
];

function makeCert(
  id: string,
  orgId: string,
  numero: string,
  norma: string,
  orgNombre: string,
  orgAbrev: string,
  hasAlcance: boolean
): CertificadoDetailEntity {
  return {
    id,
    id_organizacion: orgId,
    organizacion_nombre: orgNombre,
    organizacion_abreviacion: orgAbrev,
    id_norma: '80000000-0000-0000-0000-000000000001',
    norma_codigo: norma,
    norma_nombre: norma,
    id_sector_iaf: '81000000-0000-0000-0000-000000000001',
    sector_iaf: 17,
    sector_iaf_nombre: 'Metalmecánica',
    numero_certificado: numero,
    fecha_emision: '2024-01-10',
    fecha_vencimiento: '2027-01-09',
    estatus: 'Activo',
    version_actual_numero: 1,
    hasAlcance,
    alcanceDetalle: hasAlcance
      ? {
          id: `90000000-0000-0000-0000-${id.slice(-12)}`,
          id_certificado: id,
          alcance_es: `Alcance operativo de ${numero}.`,
          alcance_en: null,
          esCompartido: false,
          deleted_at: null,
        }
      : null,
    sitios: [],
    turnos: [],
    procesos: [],
    noAplicables: [],
  };
}

const SAMPLE_CERTS: CertificadoDetailEntity[] = [
  makeCert(
    CERT_1_ID,
    ORG_1_ID,
    'FN-QMS-2024-001',
    'ISO 9001:2015',
    'Iberometal Componentes S.A.',
    'Iberometal',
    true
  ),
  makeCert(
    CERT_2_ID,
    ORG_1_ID,
    'FN-EMS-2024-002',
    'ISO 14001:2015',
    'Iberometal Componentes S.A.',
    'Iberometal',
    true
  ),
  makeCert(
    CERT_3_ID,
    ORG_2_ID,
    'FN-OHS-2025-003',
    'ISO 45001:2018',
    'Example Manufactura C.A.',
    'Example',
    false
  ),
];

const SAMPLE_VINCULOS: VinculoEntity[] = [
  {
    id: VINC_ID,
    id_grupo_empresarial: CONG_1_ID,
    grupo_nombre: 'Conglomerado Industrial Norte S.A.',
    codigo_vinculo: 'VINC-IND-01',
    etiqueta: 'Caja Corporativa Industrial Norte',
    nivel_vinculacion: 'NIVEL_2_INTER_ORG',
    tipo_vinculacion: 'Integrada',
    es_vinculada: true,
    tiene_sitio_temporal: false,
    notas: null,
    certificados: [
      {
        id: '60000001-0000-0000-0000-000000000001',
        id_vinculo: VINC_ID,
        id_certificado: CERT_1_ID,
        numero_certificado: 'FN-QMS-2024-001',
        id_organizacion: ORG_1_ID,
        organizacion_nombre: 'Iberometal Componentes S.A.',
        organizacion_abreviacion: 'Iberometal',
        norma_codigo: 'ISO 9001:2015',
        estatus: 'ACTIVO',
        tipo_vinculacion_override: null,
      },
      {
        id: '60000001-0000-0000-0000-000000000002',
        id_vinculo: VINC_ID,
        id_certificado: CERT_2_ID,
        numero_certificado: 'FN-EMS-2024-002',
        id_organizacion: ORG_1_ID,
        organizacion_nombre: 'Iberometal Componentes S.A.',
        organizacion_abreviacion: 'Iberometal',
        norma_codigo: 'ISO 14001:2015',
        estatus: 'ACTIVO',
        tipo_vinculacion_override: 'Combinada',
      },
      {
        id: '60000001-0000-0000-0000-000000000003',
        id_vinculo: VINC_ID,
        id_certificado: CERT_3_ID,
        numero_certificado: 'FN-OHS-2025-003',
        id_organizacion: ORG_2_ID,
        organizacion_nombre: 'Example Manufactura C.A.',
        organizacion_abreviacion: 'Example',
        norma_codigo: 'ISO 45001:2018',
        estatus: 'ACTIVO',
        tipo_vinculacion_override: null,
      },
    ],
  },
];

const SAMPLE_TIPOS: TipoAuditoriaCatalogItem[] = [
  {
    id: TIPO_SEG1_ID,
    tipo: 'Seguimiento 1',
    abreviacion: 'Seg.1',
    etapa_ciclo: 'Vigilancia',
    descripcion: 'Primera vigilancia anual',
    duracion_formula: 'Base × 0.33',
    reporte_requerido: 'Informe de Vigilancia',
    usage_count: 1,
  },
  {
    id: TIPO_RENOV_ID,
    tipo: 'Renovación',
    abreviacion: 'Renov.',
    etapa_ciclo: 'Recertificación',
    descripcion: 'Recertificación trienal',
    duracion_formula: 'Base × 0.67',
    reporte_requerido: 'Informe de Renovación',
    usage_count: 1,
  },
];

function stripHtmlText(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function assertCleanZeroUuid(label: string, html: string): void {
  const check = assertZeroUuidExposure(html);
  assert.equal(
    check.compliant,
    true,
    `${label} expuso UUID(s): ${check.exposedUuids.join(', ')}`
  );
}

test('Step 4.2 Modal Fase 1: renderiza indicador en 3 fases, selectores bidireccionales con nombres cortos y Zero-UUID', () => {
  const base = createInitialAuditWizardState({
    referenceDate: new Date('2026-11-05T12:00:00Z'),
    tiposCatalog: SAMPLE_TIPOS,
  });
  const selectedOrg = selectWizardOrganizacion(base, ORG_1_ID, SAMPLE_ORGS);

  const html = renderAuditWizardModal({
    state: selectedOrg,
    conglomerados: SAMPLE_CONGS,
    organizaciones: SAMPLE_ORGS,
    vinculos: SAMPLE_VINCULOS,
    certificados: SAMPLE_CERTS,
    tiposCatalog: SAMPLE_TIPOS,
  });

  const text = stripHtmlText(html);
  assert.equal(text.includes('1. Empresa / Conglomerado'), true);
  assert.equal(text.includes('2. Vínculo y Certificados'), true);
  assert.equal(text.includes('3. Fecha, Relación y Tipo'), true);
  assert.equal(html.includes('id="wizardConglomeradoSelect"'), true);
  assert.equal(html.includes('id="wizardOrganizacionSelect"'), true);
  assert.equal(text.includes('Industrial Norte'), true);
  assert.equal(text.includes('Iberometal'), true);
  assertCleanZeroUuid('Fase 1', html);
});

test('Step 4.2 Modal Fase 2: renderiza caja Vínculo, checkboxes ON por defecto, indicador discreto Sin alcance y enlace #/certificacion/vinculo', () => {
  const deps = {
    conglomerados: SAMPLE_CONGS,
    organizaciones: SAMPLE_ORGS,
    vinculos: SAMPLE_VINCULOS,
    certificados: SAMPLE_CERTS,
    tiposCatalog: SAMPLE_TIPOS,
  };

  let state = createInitialAuditWizardState({
    referenceDate: new Date('2026-11-05T12:00:00Z'),
    tiposCatalog: SAMPLE_TIPOS,
  });
  state = selectWizardConglomerado(state, CONG_1_ID, SAMPLE_ORGS);
  state = advanceWizardStep(state, deps);
  assert.equal(state.step, 2);

  // Al iniciar Fase 2, todos los certificados están ON por defecto y CERT_3 (sin alcance) dispara el bloqueo
  const htmlAllOn = renderAuditWizardModal({
    state,
    ...deps,
  });
  const toggleMatches = htmlAllOn.match(/data-action="toggle-wizard-cert"/g) ?? [];
  assert.equal(toggleMatches.length, 3);
  const checkedMatches = htmlAllOn.match(/data-action="toggle-wizard-cert"[^>]*checked/g) ?? [];
  assert.equal(checkedMatches.length, 3);
  assert.equal(htmlAllOn.includes('href="#/certificacion/vinculo"'), true);
  assert.equal(htmlAllOn.includes('Gestionar cajas en Vínculo'), true);
  assert.equal(htmlAllOn.includes('data-action="wizard-select-all-certs"'), true);
  assert.equal(htmlAllOn.includes('data-testid="wizard-alcance-blocker"'), true);
  assertCleanZeroUuid('Fase 2 con todos ON', htmlAllOn);

  // Apagar el certificado sin alcance (CERT_3) mantiene la fila visible pero elimina el bloqueo
  const toggledOffScopeless = toggleWizardVinculoCert(state, CERT_3_ID);
  const htmlSubset = renderAuditWizardModal({
    state: toggledOffScopeless,
    ...deps,
  });
  assert.equal((htmlSubset.match(/data-action="toggle-wizard-cert"/g) ?? []).length, 3);
  assert.equal(htmlSubset.includes('data-testid="wizard-alcance-blocker"'), false);
  assert.equal(htmlSubset.includes('Certificados a auditar (2/3 activos)'), true);
  assert.equal(htmlSubset.includes('Sin alcance (omitido)'), true);
  assertCleanZeroUuid('Fase 2 subconjunto sin bloqueo', htmlSubset);

  // Estado sin cajas Vínculo también expone enlace directo a #/certificacion/vinculo
  let noVinState = createInitialAuditWizardState({
    referenceDate: new Date('2026-11-05T12:00:00Z'),
  });
  noVinState = selectWizardConglomerado(noVinState, CONG_NO_VIN_ID, SAMPLE_ORGS);
  noVinState = advanceWizardStep(noVinState, deps);
  const htmlNoVin = renderAuditWizardModal({
    state: noVinState,
    ...deps,
  });
  assert.equal(htmlNoVin.includes('data-testid="wizard-no-vinculo-blocker"'), true);
  assert.equal(htmlNoVin.includes('href="#/certificacion/vinculo"'), true);
  assertCleanZeroUuid('Fase 2 sin vínculos', htmlNoVin);
});

test('Step 4.2 Modal Fase 3: tabla table-fixed con <colgroup> = 100%, 0 <button> en <tbody>, selects Relación/Tipo pre-poblados y preview codename', () => {
  const deps = {
    conglomerados: SAMPLE_CONGS,
    organizaciones: SAMPLE_ORGS,
    vinculos: SAMPLE_VINCULOS,
    certificados: SAMPLE_CERTS,
    tiposCatalog: SAMPLE_TIPOS,
  };

  let state = createInitialAuditWizardState({
    referenceDate: new Date('2026-11-05T12:00:00Z'),
    tiposCatalog: SAMPLE_TIPOS,
  });
  state = selectWizardConglomerado(state, CONG_1_ID, SAMPLE_ORGS);
  state = advanceWizardStep(state, deps);
  // Desactivar CERT_3 (sin alcance) y avanzar a Fase 3 con 2 certificados
  state = toggleWizardVinculoCert(state, CERT_3_ID);
  state = advanceWizardStep(state, deps);
  assert.equal(state.step, 3);

  // Personalizar fila 1 a Renovación y fila 2 ya viene pre-poblada con override 'Combinada'
  state = setWizardCertTipo(state, CERT_1_ID, TIPO_RENOV_ID);
  state = setWizardCertRelacion(state, CERT_1_ID, 'Integrada');

  const html = renderAuditWizardModal({
    state,
    ...deps,
  });

  // 1. Codename preview y cabecera limpia
  assert.equal(html.includes('data-testid="wizard-codename-preview"'), true);
  assert.equal(stripHtmlText(html).includes('2026-11 Renov.'), true);

  // 2. <table class="... table-fixed ..."> y <colgroup> sumando 100%
  assert.equal(html.includes('table-fixed'), true);
  const colgroupMatch = html.match(/<colgroup>([\s\S]*?)<\/colgroup>/);
  assert.ok(colgroupMatch, 'Debe renderizar <colgroup> en la tabla de Fase 3');
  const widths = Array.from(colgroupMatch[1].matchAll(/width:\s*(\d+)%/g)).map((m) =>
    Number(m[1])
  );
  assert.deepEqual(widths, [34, 33, 33]);
  assert.equal(
    widths.reduce((acc, w) => acc + w, 0),
    100
  );

  // 3. Cero <button> dentro de <tbody>
  const tbodyMatch = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/);
  assert.ok(tbodyMatch, 'Debe renderizar <tbody> en la tabla de Fase 3');
  assert.equal(/<button\b/i.test(tbodyMatch[1]), false);

  // 4. Selects de Relación / Naturaleza y Tipo de Auditoría por fila (2 filas activas, CERT_3 excluido)
  assert.equal((tbodyMatch[1].match(/data-action="wizard-cert-relacion"/g) ?? []).length, 2);
  assert.equal((tbodyMatch[1].match(/data-action="wizard-cert-tipo"/g) ?? []).length, 2);
  assert.equal(tbodyMatch[1].includes('FN-QMS-2024-001'), true);
  assert.equal(tbodyMatch[1].includes('FN-EMS-2024-002'), true);
  assert.equal(tbodyMatch[1].includes('FN-OHS-2025-003'), false);

  // 5. Override 'Combinada' pre-seleccionado en fila 2
  const row2RelBlock = tbodyMatch[1].match(
    new RegExp(
      `data-action="wizard-cert-relacion"[^>]*data-cert-id="${CERT_2_ID}"[\\s\\S]*?<\\/select>`
    )
  );
  assert.ok(row2RelBlock);
  assert.equal(/<option value="Combinada"[^>]*selected/.test(row2RelBlock[0]), true);

  // 6. Acciones rápidas fuera de <tbody>
  assert.equal(html.includes('data-action="wizard-apply-all-relacion"'), true);
  assert.equal(html.includes('data-action="wizard-apply-all-tipo"'), true);

  // 7. Zero-UUID estricta
  assertCleanZeroUuid('Fase 3', html);
});

test('Fase 3 muestra preview estructurado L-AUD-AAAA-BBBB-YYYY para la auditoría vinculada y AUD-AAAA-BBBB-YYYY por certificado', () => {
  const deps = {
    conglomerados: SAMPLE_CONGS,
    organizaciones: SAMPLE_ORGS,
    vinculos: SAMPLE_VINCULOS,
    certificados: SAMPLE_CERTS,
    tiposCatalog: SAMPLE_TIPOS,
  };

  let state = createInitialAuditWizardState({
    referenceDate: new Date('2028-04-10T12:00:00Z'),
    tiposCatalog: SAMPLE_TIPOS,
  });
  state = selectWizardConglomerado(state, CONG_1_ID, SAMPLE_ORGS);
  state = advanceWizardStep(state, deps);
  state = toggleWizardVinculoCert(state, CERT_3_ID);
  state = advanceWizardStep(state, deps);
  assert.equal(state.step, 3);

  const html = renderAuditWizardModal({
    state,
    ...deps,
    existingPrograms: [
      { id: 'p-1', fecha_programada: '2027-06-01', estado_ciclo: 'Cerrada', deleted_at: null },
      { id: 'p-2', fecha_programada: '2028-02-01', estado_ciclo: 'Cancelada', deleted_at: null },
      { id: 'p-del', fecha_programada: '2028-03-01', estado_ciclo: 'Programada', deleted_at: '2028-03-02T00:00:00Z' },
    ],
    existingAudits: [
      { id: 'a-1', fecha_programada: '2027-06-01', estado_ciclo: 'Cerrada', deleted_at: null },
      { id: 'a-2', fecha_programada: '2028-02-01', estado_ciclo: 'Cancelada', deleted_at: null },
      { id: 'a-3', fecha_programada: '2028-02-01', estado_ciclo: 'Programada', deleted_at: null },
      { id: 'a-del', fecha_programada: '2028-03-01', estado_ciclo: 'Programada', deleted_at: '2028-03-02T00:00:00Z' },
    ],
  });

  // 2 programas activos previos (1 en 2028) => L-AUD-0003-0002-2028
  assert.equal(html.includes('data-testid="wizard-linked-codename-preview"'), true);
  assert.equal(html.includes('L-AUD-0003-0002-2028'), true);
  // 3 auditorías individuales previas (2 en 2028) => AUD-0004-0003-2028 y AUD-0005-0004-2028
  assert.equal((html.match(/data-testid="wizard-cert-audit-code"/g) ?? []).length, 2);
  assert.equal(html.includes('AUD-0004-0003-2028'), true);
  assert.equal(html.includes('AUD-0005-0004-2028'), true);
  assertCleanZeroUuid('Fase 3 structured codenames', html);
});

test('Step 4.2 Modal higiene: tipado estricto sin comodines en auditWizardModal.ts y su suite de pruebas', () => {
  const modalPath = path.resolve(process.cwd(), 'src/views/auditWizardModal.ts');
  const testPath = path.resolve(process.cwd(), 'src/views/auditWizardModal.test.ts');
  const modalSrc = fs.readFileSync(modalPath, 'utf8');
  const testSrc = fs.readFileSync(testPath, 'utf8');
  const anyPattern = new RegExp(':\\s*any\\b|\\bas\\s+any\\b');
  assert.equal(anyPattern.test(modalSrc), false);
  assert.equal(anyPattern.test(testSrc), false);
});
