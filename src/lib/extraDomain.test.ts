import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isMissingTableOrSchemaError } from './certificadoSubEntities';
import {
  INITIAL_NORMAS,
  INITIAL_ACREDITACIONES,
  INITIAL_ORGANISMOS,
  INITIAL_REQUISITOS_LTREE,
  INITIAL_SECTORES_IAF,
  INITIAL_SUBSECTORES_IAF,
  INITIAL_ESTATUS_CATALOG,
  INITIAL_TIPOS_AUDITORIA_CATALOG,
  INITIAL_METODOLOGIAS_CATALOG,
  calculateLtreeIndentation,
  filterNormas,
  filterSectoresIaf,
  filterSubsectoresBySector,
  formatRiskCategoryBadge,
  formatNormaStatusBadge,
  formatAcreditacionStatusBadge,
  CATALOG_SIMPLE_MAX_LENGTH,
  createEmptyEstatusFormDraft,
  createEstatusFormDraftFromEntity,
  createEmptyTipoFormDraft,
  createTipoFormDraftFromEntity,
  createEmptyMetodologiaFormDraft,
  createMetodologiaFormDraftFromEntity,
  validateEstatusDraft,
  validateTipoAuditoriaDraft,
  validateMetodologiaAuditoriaDraft,
  buildEstatusCatalogItem,
  buildTipoAuditoriaCatalogItem,
  buildMetodologiaAuditoriaCatalogItem,
  resolveSectorIafDescription,
  createEmptySectorIafFormDraft,
  createSectorIafDraftFromEntity,
  createEmptySubsectorIafFormDraft,
  createSubsectorIafDraftFromEntity,
  validateSectorIafDraft,
  validateSubsectorIafDraft,
  createEmptyNormaFormDraft,
  createNormaDraftFromEntity,
  createEmptyRequisitoFormDraft,
  createRequisitoDraftFromEntity,
  sanitizeLtreeLabel,
  computeRequisitoLtreePath,
  collectRequisitoDescendantIds,
  filterValidParentRequisitos,
  validateNormaDraft,
  validateRequisitoDraft,
  computeNormaBilingualCoverage,
  filterNormaRootRequisitos,
  countRequisitoDescendants,
  formatRequisitoHierarchyPath,
  filterNormaRequisitosCrossLevel,
  getRequisitoBilingualTitles,
  getRequisitoContentStatus,
  buildRequisitoNavigationContext,
  sliceRequisitoSiblingsWindow,
} from './extraDomain';
import { INITIAL_CERTIFICADOS_DETAILED } from './multisiteSampling';
import { INITIAL_AUDITORES_DETAILED } from './competencyMatrix';
import { INITIAL_PROGRAMACION_AUDITS } from './auditExecution';
import { getBundledNormaCatalog } from './paginatedHydration';
import { assertZeroUuidExposure } from './zeroUuid';
import {
  renderNormaRequisitosTableSection,
  renderNormaView,
  resolveNormaDetailMode,
} from '../views/normaView';
import {
  renderRequisitoView,
  resolveRequisitoDetailMode,
} from '../views/requisitoView';
import {
  renderSectorIafView,
  resolveSectorIafDetailMode,
} from '../views/sectorIafView';
import {
  renderSubsectorIafView,
  resolveSubsectorIafDetailMode,
} from '../views/subsectorIafView';
import { renderExtraView } from '../views/extraView';
import { renderEstatusView, resolveEstatusDetailMode } from '../views/estatusView';
import {
  renderTipoAuditoriaView,
  resolveTipoAuditoriaDetailMode,
} from '../views/tipoAuditoriaView';
import {
  renderMetodologiaAuditoriaView,
  resolveMetodologiaDetailMode,
} from '../views/metodologiaAuditoriaView';
import type { UserProfile } from './healthCheck';

const mockProfile: UserProfile = {
  id: '00000000-0000-0000-0000-000000000001',
  nombre: 'Auditor Senior Lead',
  role: 'ADMIN',
  status: 'APPROVED',
  created_at: '2024-01-01T00:00:00Z',
};

const workerProfile: UserProfile = {
  id: '00000000-0000-0000-0000-000000000002',
  nombre: 'Operador Técnico',
  role: 'WORKER',
  status: 'APPROVED',
  created_at: '2024-01-01T00:00:00Z',
};

const pendingWorkerProfile: UserProfile = {
  id: '00000000-0000-0000-0000-000000000003',
  nombre: 'Operador Pendiente',
  role: 'WORKER',
  status: 'PENDING',
  created_at: '2024-01-01T00:00:00Z',
};

const auditorProfile: UserProfile = {
  id: '00000000-0000-0000-0000-000000000004',
  nombre: 'Auditor Externo',
  role: 'AUDITOR',
  status: 'APPROVED',
  created_at: '2024-01-01T00:00:00Z',
};

const clientProfile: UserProfile = {
  id: '00000000-0000-0000-0000-000000000005',
  nombre: 'Cliente Certificado',
  role: 'CLIENT',
  status: 'APPROVED',
  created_at: '2024-01-01T00:00:00Z',
};

describe('Extra Domain - Normas & Standards Logic', () => {
  it('returns all normas when query and filters are empty', () => {
    const result = filterNormas(INITIAL_NORMAS, '', 'ALL', 'ALL');
    assert.equal(result.length, INITIAL_NORMAS.length);
  });

  it('filters normas by code or title query', () => {
    const result = filterNormas(INITIAL_NORMAS, '14001', 'ALL', 'ALL');
    assert.equal(result.length, 1);
    assert.equal(result[0].codigo, 'ISO 14001:2015');

    const resultTitle = filterNormas(INITIAL_NORMAS, 'calidad', 'ALL', 'ALL');
    assert.ok(resultTitle.some((n) => n.codigo === 'ISO 9001:2015'));
  });

  it('filters normas by status', () => {
    const vigenteOnly = filterNormas(INITIAL_NORMAS, '', 'Vigente', 'ALL');
    assert.ok(vigenteOnly.length > 0);
    assert.ok(vigenteOnly.every((n) => n.estatus === 'Vigente'));
  });

  it('filters normas by scheme', () => {
    const sgcOnly = filterNormas(INITIAL_NORMAS, '', 'ALL', 'SGC - Calidad');
    assert.ok(sgcOnly.length > 0);
    assert.ok(sgcOnly.every((n) => n.esquema.includes('SGC')));
  });

  it('preserves list ordering or applies criteria', () => {
    const all = filterNormas(INITIAL_NORMAS, '', 'ALL', 'ALL');
    assert.ok(all.length >= 4);
    assert.equal(all[0].codigo, 'ISO 9001:2015');
  });
});

describe('Extra Domain - Sectores IAF & Subsectores Logic', () => {
  it('returns all IAF sectors when search is empty', () => {
    const result = filterSectoresIaf(INITIAL_SECTORES_IAF, INITIAL_SUBSECTORES_IAF, '', 'ALL');
    assert.equal(result.length, INITIAL_SECTORES_IAF.length);
  });

  it('filters IAF sectors by number or keyword', () => {
    const byNumber = filterSectoresIaf(INITIAL_SECTORES_IAF, INITIAL_SUBSECTORES_IAF, '17', 'ALL');
    assert.equal(byNumber.length, 1);
    assert.equal(byNumber[0].sector, 17);

    const byWord = filterSectoresIaf(INITIAL_SECTORES_IAF, INITIAL_SUBSECTORES_IAF, 'químicos', 'ALL');
    assert.ok(byWord.some((s) => s.sector === 14));
  });

  it('filters IAF sectors by risk level', () => {
    const highRisk = filterSectoresIaf(INITIAL_SECTORES_IAF, INITIAL_SUBSECTORES_IAF, '', 'ALTO');
    assert.ok(highRisk.length > 0);
    assert.ok(highRisk.some((s) => s.sector === 17));
  });

  it('filters subsectores correctly by parent sector', () => {
    const subsectors = filterSubsectoresBySector(INITIAL_SUBSECTORES_IAF, 17);
    assert.ok(subsectors.length >= 2);
    assert.ok(subsectors.every((sub) => sub.sector_numero === 17));
    assert.ok(subsectors.some((sub) => sub.codigo === '17.1'));
    assert.ok(subsectors.some((sub) => sub.codigo === '17.2'));
  });
});

describe('Extra Domain - PostgreSQL LTREE Clause Indentation', () => {
  it('identifies root clauses with level 1 and isParent true', () => {
    const root = calculateLtreeIndentation('4', '4');
    assert.equal(root.level, 1);
    assert.equal(root.isParent, true);
    assert.equal(root.indentPx, 0);
  });

  it('identifies second level clauses with 20px indentation', () => {
    const sub = calculateLtreeIndentation('4.4_1', '4.1');
    assert.equal(sub.level, 2);
    assert.equal(sub.isParent, false);
    assert.equal(sub.indentPx, 20);
  });

  it('identifies third level clauses with 40px indentation', () => {
    const deep = calculateLtreeIndentation('4.4_1.4_1_1', '4.1.1');
    assert.equal(deep.level, 3);
    assert.equal(deep.isParent, false);
    assert.equal(deep.indentPx, 40);
  });
});

describe('Extra Domain - Badges and Formatters', () => {
  it('formats risk category badges with appropriate semantic styling', () => {
    const high = formatRiskCategoryBadge('ALTO');
    assert.ok(high.badgeClass.includes('rose'));
    assert.equal(high.label, 'ALTO RIESGO');

    const med = formatRiskCategoryBadge('MEDIO');
    assert.ok(med.badgeClass.includes('amber'));
    assert.equal(med.label, 'RIESGO MEDIO');

    const low = formatRiskCategoryBadge('BAJO');
    assert.ok(low.badgeClass.includes('emerald'));
    assert.equal(low.label, 'BAJO RIESGO');
  });

  it('formats norma status badges correctly', () => {
    const vigente = formatNormaStatusBadge('Vigente');
    assert.equal(vigente.label, 'VIGENTE');
    assert.ok(vigente.badgeClass.includes('emerald'));

    const revision = formatNormaStatusBadge('En Revisión');
    assert.equal(revision.label, 'EN REVISIÓN');
    assert.ok(revision.badgeClass.includes('amber'));
  });

  it('formats acreditacion status badges correctly', () => {
    const active = formatAcreditacionStatusBadge('Activo');
    assert.equal(active.label, 'Activo');
    assert.ok(active.badgeClass.includes('emerald'));

    const legacyActive = formatAcreditacionStatusBadge('Activa');
    assert.equal(legacyActive.label, 'Activa');
    assert.ok(legacyActive.badgeClass.includes('emerald'));
  });
});

describe('Extra Domain - Canonical Catalogs', () => {
  it('contains the 8 canonical statuses with correct values', () => {
    assert.equal(INITIAL_ESTATUS_CATALOG.length, 8);
    const expected = [
      'Activo',
      'Estudio',
      'Suspendido',
      'Cancelado',
      'Planificado',
      'En Ejecución',
      'En Espera',
      'Inactivo',
    ];
    for (const est of expected) {
      assert.ok(
        INITIAL_ESTATUS_CATALOG.some((e) => e.estatus === est),
        `Missing canonical estatus: ${est}`
      );
    }
  });

  it('contains the 9 canonical audit types aligned with ISO 17021-1 cycles', () => {
    assert.equal(INITIAL_TIPOS_AUDITORIA_CATALOG.length, 9);
    const expected = [
      'Etapa 1',
      'Etapa 2',
      'Seguimiento 1',
      'Seguimiento 2',
      'Renovación',
      'Diagnóstico',
      'Extraordinaria',
      'Especial',
      'Otro',
    ];
    for (const t of expected) {
      assert.ok(
        INITIAL_TIPOS_AUDITORIA_CATALOG.some((item) => item.tipo === t),
        `Missing canonical tipo: ${t}`
      );
    }
  });

  it('contains the 3 canonical methodologies with IAF MD 4 references', () => {
    assert.equal(INITIAL_METODOLOGIAS_CATALOG.length, 3);
    const expected = ['Presencial', 'Remota', 'Mixta'];
    for (const m of expected) {
      assert.ok(
        INITIAL_METODOLOGIAS_CATALOG.some((item) => item.metodologia === m),
        `Missing canonical metodologia: ${m}`
      );
    }
  });
});

describe('Extra Domain - Zero-UUID Exposure Compliance', () => {
  it('renders Norma directory and detail without exposing raw UUIDs in visible text', () => {
    const listHtml = renderNormaView({
      profile: mockProfile,
      state: {
        selectedNormaId: null,
        activeChildTab: 'acreditacion',
        query: '',
        selectedStatus: 'ALL',
        selectedScheme: 'ALL',
        viewMode: 'grid',
        sortColumn: null,
        sortDirection: 'none',
      },
      normas: INITIAL_NORMAS,
      acreditaciones: INITIAL_ACREDITACIONES,
      organismos: INITIAL_ORGANISMOS,
      requisitos: INITIAL_REQUISITOS_LTREE,
      loading: false,
    });
    const listCompliance = assertZeroUuidExposure(listHtml);
    assert.ok(
      listCompliance.compliant,
      `Exposed UUIDs in Norma list: ${listCompliance.exposedUuids.join(', ')}`
    );

    const detailHtml = renderNormaView({
      profile: mockProfile,
      state: {
        selectedNormaId: INITIAL_NORMAS[0].id,
        activeChildTab: 'acreditacion',
        query: '',
        selectedStatus: 'ALL',
        selectedScheme: 'ALL',
        viewMode: 'grid',
        sortColumn: null,
        sortDirection: 'none',
      },
      normas: INITIAL_NORMAS,
      acreditaciones: INITIAL_ACREDITACIONES,
      organismos: INITIAL_ORGANISMOS,
      requisitos: INITIAL_REQUISITOS_LTREE,
      loading: false,
    });
    const detailCompliance = assertZeroUuidExposure(detailHtml);
    assert.ok(
      detailCompliance.compliant,
      `Exposed UUIDs in Norma detail: ${detailCompliance.exposedUuids.join(', ')}`
    );
  });

  it('renders Sector IAF directory and detail without exposing raw UUIDs in visible text', () => {
    const listHtml = renderSectorIafView({
      profile: mockProfile,
      state: {
        selectedSectorId: null,
        activeChildTab: 'subsectores',
        query: '',
        selectedRisk: 'ALL',
        viewMode: 'grid',
        sortColumn: null,
        sortDirection: 'none',
      },
      sectores: INITIAL_SECTORES_IAF,
      subsectores: INITIAL_SUBSECTORES_IAF,
      loading: false,
    });
    const listCompliance = assertZeroUuidExposure(listHtml);
    assert.ok(
      listCompliance.compliant,
      `Exposed UUIDs in Sector IAF list: ${listCompliance.exposedUuids.join(', ')}`
    );

    const detailHtml = renderSectorIafView({
      profile: mockProfile,
      state: {
        selectedSectorId: INITIAL_SECTORES_IAF[0].id,
        activeChildTab: 'subsectores',
        query: '',
        selectedRisk: 'ALL',
        viewMode: 'grid',
        sortColumn: null,
        sortDirection: 'none',
      },
      sectores: INITIAL_SECTORES_IAF,
      subsectores: INITIAL_SUBSECTORES_IAF,
      loading: false,
    });
    const detailCompliance = assertZeroUuidExposure(detailHtml);
    assert.ok(
      detailCompliance.compliant,
      `Exposed UUIDs in Sector IAF detail: ${detailCompliance.exposedUuids.join(', ')}`
    );
  });

  it('renders Estatus, TipoAuditoria, and Metodologia without exposing raw UUIDs in visible text', () => {
    const estatusHtml = renderEstatusView({
      profile: mockProfile,
      state: {
        selectedEstatusId: null,
        query: '',
        viewMode: 'grid',
        sortColumn: null,
        sortDirection: 'none',
      },
      estatusList: INITIAL_ESTATUS_CATALOG,
      loading: false,
    });
    const estatusCompliance = assertZeroUuidExposure(estatusHtml);
    assert.ok(
      estatusCompliance.compliant,
      `Exposed UUIDs in Estatus view: ${estatusCompliance.exposedUuids.join(', ')}`
    );

    const tipoHtml = renderTipoAuditoriaView({
      profile: mockProfile,
      state: {
        selectedTipoId: null,
        query: '',
        viewMode: 'grid',
        sortColumn: null,
        sortDirection: 'none',
      },
      tiposList: INITIAL_TIPOS_AUDITORIA_CATALOG,
      loading: false,
    });
    const tipoCompliance = assertZeroUuidExposure(tipoHtml);
    assert.ok(
      tipoCompliance.compliant,
      `Exposed UUIDs in Tipo Auditoria view: ${tipoCompliance.exposedUuids.join(', ')}`
    );

    const metHtml = renderMetodologiaAuditoriaView({
      profile: mockProfile,
      state: {
        selectedMetodologiaId: null,
        query: '',
        viewMode: 'grid',
        sortColumn: null,
        sortDirection: 'none',
      },
      metodologiasList: INITIAL_METODOLOGIAS_CATALOG,
      loading: false,
    });
    const metCompliance = assertZeroUuidExposure(metHtml);
    assert.ok(
      metCompliance.compliant,
      `Exposed UUIDs in Metodologia view: ${metCompliance.exposedUuids.join(', ')}`
    );
  });
});

function extractTbodyHtml(html: string): string {
  const match = html.match(/<tbody[\s\S]*?<\/tbody>/gi);
  return match ? match.join('\n') : '';
}

function sumColgroupWidths(html: string): number {
  const colgroupMatch = html.match(/<colgroup>([\s\S]*?)<\/colgroup>/i);
  assert.ok(colgroupMatch, 'Expected <colgroup> in table HTML');
  const widths = [...colgroupMatch[1].matchAll(/width:\s*([0-9.]+)%/g)].map((m) =>
    Number(m[1])
  );
  assert.ok(widths.length > 0, 'Expected <col style="width: ...%"> entries');
  return widths.reduce((sum, w) => sum + w, 0);
}

describe('Step 2.1 - Simple Catalogs Domain Contracts & Validators', () => {
  it('builds empty and entity-seeded form drafts', () => {
    assert.deepEqual(createEmptyEstatusFormDraft(), { estatus: '' });
    assert.deepEqual(createEmptyTipoFormDraft(), { tipo: '' });
    assert.deepEqual(createEmptyMetodologiaFormDraft(), { metodologia: '' });

    assert.deepEqual(createEstatusFormDraftFromEntity(INITIAL_ESTATUS_CATALOG[0]), {
      estatus: INITIAL_ESTATUS_CATALOG[0].estatus,
    });
    assert.deepEqual(createTipoFormDraftFromEntity(INITIAL_TIPOS_AUDITORIA_CATALOG[0]), {
      tipo: INITIAL_TIPOS_AUDITORIA_CATALOG[0].tipo,
    });
    assert.deepEqual(
      createMetodologiaFormDraftFromEntity(INITIAL_METODOLOGIAS_CATALOG[0]),
      {
        metodologia: INITIAL_METODOLOGIAS_CATALOG[0].metodologia,
      }
    );
  });

  it('validates Estatus draft: empty, max length, duplicate active, ignores soft-deleted, allows own excludeId', () => {
    assert.equal(validateEstatusDraft({ estatus: '   ' }, INITIAL_ESTATUS_CATALOG).valid, false);
    assert.equal(
      validateEstatusDraft(
        { estatus: 'A'.repeat(CATALOG_SIMPLE_MAX_LENGTH + 1) },
        INITIAL_ESTATUS_CATALOG
      ).valid,
      false
    );
    assert.equal(
      validateEstatusDraft({ estatus: '  activo  ' }, INITIAL_ESTATUS_CATALOG).valid,
      false
    );

    const allowedOwn = validateEstatusDraft(
      { estatus: 'Activo' },
      INITIAL_ESTATUS_CATALOG,
      INITIAL_ESTATUS_CATALOG[0].id
    );
    assert.equal(allowedOwn.valid, true);
    assert.equal(allowedOwn.normalized?.estatus, 'Activo');

    const withSoftDeleted = [
      ...INITIAL_ESTATUS_CATALOG,
      {
        ...INITIAL_ESTATUS_CATALOG[0],
        id: '99999999-9999-9999-9999-999999999999',
        estatus: 'Archivado Temporal',
        deleted_at: '2025-01-01T00:00:00Z',
      },
    ];
    const reuseDeleted = validateEstatusDraft(
      { estatus: '  Archivado   Temporal ' },
      withSoftDeleted
    );
    assert.equal(reuseDeleted.valid, true);
    assert.equal(reuseDeleted.normalized?.estatus, 'Archivado Temporal');
  });

  it('validates TipoAuditoria and MetodologiaAuditoria drafts cleanly', () => {
    assert.equal(
      validateTipoAuditoriaDraft({ tipo: '' }, INITIAL_TIPOS_AUDITORIA_CATALOG).valid,
      false
    );
    assert.equal(
      validateTipoAuditoriaDraft(
        { tipo: 'T'.repeat(CATALOG_SIMPLE_MAX_LENGTH + 1) },
        INITIAL_TIPOS_AUDITORIA_CATALOG
      ).valid,
      false
    );
    assert.equal(
      validateTipoAuditoriaDraft({ tipo: 'etapa 1' }, INITIAL_TIPOS_AUDITORIA_CATALOG).valid,
      false
    );
    const validTipo = validateTipoAuditoriaDraft(
      { tipo: '  Transferencia   Especial  ' },
      INITIAL_TIPOS_AUDITORIA_CATALOG
    );
    assert.equal(validTipo.valid, true);
    assert.equal(validTipo.normalized?.tipo, 'Transferencia Especial');

    assert.equal(
      validateMetodologiaAuditoriaDraft({ metodologia: ' ' }, INITIAL_METODOLOGIAS_CATALOG)
        .valid,
      false
    );
    assert.equal(
      validateMetodologiaAuditoriaDraft(
        { metodologia: 'M'.repeat(CATALOG_SIMPLE_MAX_LENGTH + 1) },
        INITIAL_METODOLOGIAS_CATALOG
      ).valid,
      false
    );
    assert.equal(
      validateMetodologiaAuditoriaDraft(
        { metodologia: 'REMOTA' },
        INITIAL_METODOLOGIAS_CATALOG
      ).valid,
      false
    );
    const validMet = validateMetodologiaAuditoriaDraft(
      { metodologia: '  Híbrida   Asistida ' },
      INITIAL_METODOLOGIAS_CATALOG
    );
    assert.equal(validMet.valid, true);
    assert.equal(validMet.normalized?.metodologia, 'Híbrida Asistida');
  });

  it('enriches DB catalog rows client-side without requiring extra PostgreSQL columns', () => {
    const customEstatus = buildEstatusCatalogItem({
      id: '11111111-1111-1111-1111-111111111111',
      estatus: 'En Revisión Técnica',
      usage_count: 4,
    });
    assert.equal(customEstatus.estatus, 'En Revisión Técnica');
    assert.equal(customEstatus.usage_count, 4);
    assert.ok(customEstatus.descripcion.includes('En Revisión Técnica'));

    const customTipo = buildTipoAuditoriaCatalogItem({
      id: '22222222-2222-2222-2222-222222222222',
      tipo: 'Seguimiento Especial',
    });
    assert.equal(customTipo.tipo, 'Seguimiento Especial');
    assert.ok(customTipo.duracion_formula.length > 0);

    const customMet = buildMetodologiaAuditoriaCatalogItem({
      id: '33333333-3333-3333-3333-333333333333',
      metodologia: 'Híbrida Asistida',
    });
    assert.equal(customMet.metodologia, 'Híbrida Asistida');
    assert.ok(customMet.protocolo_tic.length > 0);
  });
});

describe('Step 2.1 - RBAC Detail Mode Resolution & Clean List Views', () => {
  it('enforces RBAC detail mode resolution strictly', () => {
    assert.equal(
      resolveEstatusDetailMode(
        {
          selectedEstatusId: null,
          query: '',
          viewMode: 'list',
          sortColumn: null,
          sortDirection: 'none',
          isCreating: true,
        },
        true
      ),
      'add'
    );
    assert.equal(
      resolveEstatusDetailMode(
        {
          selectedEstatusId: null,
          query: '',
          viewMode: 'list',
          sortColumn: null,
          sortDirection: 'none',
          isCreating: true,
        },
        false
      ),
      'read'
    );
    assert.equal(
      resolveTipoAuditoriaDetailMode(
        {
          selectedTipoId: INITIAL_TIPOS_AUDITORIA_CATALOG[0].id,
          query: '',
          viewMode: 'list',
          sortColumn: null,
          sortDirection: 'none',
          isEditingAttributes: true,
        },
        true,
        INITIAL_TIPOS_AUDITORIA_CATALOG[0]
      ),
      'edit'
    );
    assert.equal(
      resolveTipoAuditoriaDetailMode(
        {
          selectedTipoId: INITIAL_TIPOS_AUDITORIA_CATALOG[0].id,
          query: '',
          viewMode: 'list',
          sortColumn: null,
          sortDirection: 'none',
          isEditingAttributes: true,
        },
        false,
        INITIAL_TIPOS_AUDITORIA_CATALOG[0]
      ),
      'read'
    );
    assert.equal(
      resolveMetodologiaDetailMode(
        {
          selectedMetodologiaId: INITIAL_METODOLOGIAS_CATALOG[0].id,
          query: '',
          viewMode: 'list',
          sortColumn: null,
          sortDirection: 'none',
          isEditingAttributes: true,
        },
        true,
        INITIAL_METODOLOGIAS_CATALOG[0]
      ),
      'edit'
    );
  });

  it('renders Multi View Clean List (table-fixed, colgroup=100%, zero acciones/tbody buttons) and RBAC + CTA for all 3 catalogs', () => {
    const cases = [
      {
        name: 'estatus',
        addAction: 'open-create-estatus',
        selectAction: 'select-estatus',
        render: (profile: UserProfile, viewMode: 'list' | 'grid') =>
          renderEstatusView({
            profile,
            state: {
              selectedEstatusId: null,
              query: '',
              viewMode,
              sortColumn: null,
              sortDirection: 'none',
            },
            estatusList: INITIAL_ESTATUS_CATALOG,
          }),
      },
      {
        name: 'tipo_auditoria',
        addAction: 'open-create-tipo',
        selectAction: 'select-tipo',
        render: (profile: UserProfile, viewMode: 'list' | 'grid') =>
          renderTipoAuditoriaView({
            profile,
            state: {
              selectedTipoId: null,
              query: '',
              viewMode,
              sortColumn: null,
              sortDirection: 'none',
            },
            tiposList: INITIAL_TIPOS_AUDITORIA_CATALOG,
          }),
      },
      {
        name: 'metodologia_auditoria',
        addAction: 'open-create-metodologia',
        selectAction: 'select-metodologia',
        render: (profile: UserProfile, viewMode: 'list' | 'grid') =>
          renderMetodologiaAuditoriaView({
            profile,
            state: {
              selectedMetodologiaId: null,
              query: '',
              viewMode,
              sortColumn: null,
              sortDirection: 'none',
            },
            metodologiasList: INITIAL_METODOLOGIAS_CATALOG,
          }),
      },
    ];

    for (const c of cases) {
      const adminList = c.render(mockProfile, 'list');
      assert.ok(adminList.includes('table-fixed'), `${c.name} list missing table-fixed`);
      assert.equal(sumColgroupWidths(adminList), 100, `${c.name} list colgroup must sum to 100`);
      assert.ok(
        !adminList.includes('data-col-header="acciones"'),
        `${c.name} must not have acciones column`
      );
      const tbody = extractTbodyHtml(adminList);
      assert.ok(tbody.length > 0, `${c.name} must render <tbody>`);
      assert.ok(!tbody.includes('<button'), `${c.name} <tbody> must not contain <button>`);
      assert.ok(
        tbody.includes(`data-action="${c.selectAction}"`),
        `${c.name} rows must carry ${c.selectAction}`
      );
      assert.ok(
        adminList.includes(`data-action="${c.addAction}"`),
        `${c.name} must render + CTA for ADMIN`
      );

      const workerList = c.render(workerProfile, 'list');
      assert.ok(
        workerList.includes(`data-action="${c.addAction}"`),
        `${c.name} must render + CTA for approved WORKER`
      );

      for (const nonStaff of [pendingWorkerProfile, auditorProfile, clientProfile]) {
        const restrictedHtml = c.render(nonStaff, 'list');
        assert.ok(
          !restrictedHtml.includes(`data-action="${c.addAction}"`),
          `${c.name} must hide + CTA for ${nonStaff.role}/${nonStaff.status}`
        );
      }

      const gridHtml = c.render(mockProfile, 'grid');
      assert.ok(
        gridHtml.includes(`data-action="${c.selectAction}"`),
        `${c.name} grid cards must be interactive`
      );
      const gridSection = gridHtml.split('<div class="grid')[1] || gridHtml;
      assert.ok(
        !gridSection.includes('<button'),
        `${c.name} grid cards must not nest <button>`
      );
      assert.equal(assertZeroUuidExposure(adminList).compliant, true);
      assert.equal(assertZeroUuidExposure(gridHtml).compliant, true);
    }
  });
});

describe('Step 2.1 - Unified Detail View (read | add | edit) & Child Tabs', () => {
  it('renders add mode without history/archive/tabs and places Save before Cancel', () => {
    const addEstatus = renderEstatusView({
      profile: mockProfile,
      state: {
        selectedEstatusId: null,
        query: '',
        viewMode: 'list',
        sortColumn: null,
        sortDirection: 'none',
        isCreating: true,
        formDraft: { estatus: '' },
        editErrorMessage: 'El nombre del estatus es obligatorio.',
      },
      estatusList: INITIAL_ESTATUS_CATALOG,
    });
    assert.ok(addEstatus.includes('id="estatusDetailForm"'));
    assert.ok(addEstatus.includes('maxlength="50"'));
    assert.ok(addEstatus.includes('role="alert"'));
    assert.ok(
      addEstatus.indexOf('id="saveEstatusFormBtn"') <
        addEstatus.indexOf('id="cancelEditEstatusBtn"')
    );
    assert.ok(!addEstatus.includes('data-action="open-changelog"'));
    assert.ok(!addEstatus.includes('data-action="open-archive-modal"'));
    assert.ok(!addEstatus.includes('role="tablist"'));
    assert.ok(!addEstatus.includes('bg-emerald-50 border border-emerald-200'));

    const addTipo = renderTipoAuditoriaView({
      profile: workerProfile,
      state: {
        selectedTipoId: null,
        query: '',
        viewMode: 'list',
        sortColumn: null,
        sortDirection: 'none',
        isCreating: true,
        formDraft: { tipo: '' },
      },
      tiposList: INITIAL_TIPOS_AUDITORIA_CATALOG,
    });
    assert.ok(addTipo.includes('id="tipoDetailForm"'));
    assert.ok(
      addTipo.indexOf('id="saveTipoFormBtn"') < addTipo.indexOf('id="cancelEditTipoBtn"')
    );
    assert.ok(!addTipo.includes('data-action="open-changelog"'));
    assert.ok(!addTipo.includes('role="tablist"'));

    const addMet = renderMetodologiaAuditoriaView({
      profile: mockProfile,
      state: {
        selectedMetodologiaId: null,
        query: '',
        viewMode: 'list',
        sortColumn: null,
        sortDirection: 'none',
        isCreating: true,
        formDraft: { metodologia: '' },
      },
      metodologiasList: INITIAL_METODOLOGIAS_CATALOG,
    });
    assert.ok(addMet.includes('id="metodologiaDetailForm"'));
    assert.ok(
      addMet.indexOf('id="saveMetodologiaFormBtn"') <
        addMet.indexOf('id="cancelEditMetodologiaBtn"')
    );
    assert.ok(!addMet.includes('data-action="open-changelog"'));
    assert.ok(!addMet.includes('role="tablist"'));
  });

  it('prevents non-staff from entering add/edit forms and renders Clean List child tabs in read mode', () => {
    const clientTriedCreate = renderEstatusView({
      profile: clientProfile,
      state: {
        selectedEstatusId: null,
        query: '',
        viewMode: 'list',
        sortColumn: null,
        sortDirection: 'none',
        isCreating: true,
        isEditingAttributes: true,
      },
      estatusList: INITIAL_ESTATUS_CATALOG,
    });
    assert.ok(!clientTriedCreate.includes('id="estatusDetailForm"'));
    assert.ok(!clientTriedCreate.includes('id="saveEstatusFormBtn"'));

    const estatusDetailCerts = renderEstatusView({
      profile: mockProfile,
      state: {
        selectedEstatusId: INITIAL_ESTATUS_CATALOG[0].id,
        activeChildTab: 'certificados',
        query: '',
        viewMode: 'list',
        sortColumn: null,
        sortDirection: 'none',
      },
      estatusList: INITIAL_ESTATUS_CATALOG,
      certificados: INITIAL_CERTIFICADOS_DETAILED,
      audits: INITIAL_PROGRAMACION_AUDITS,
    });
    assert.ok(estatusDetailCerts.includes('id="startEditEstatusBtn"'));
    assert.ok(estatusDetailCerts.includes('data-action="open-changelog"'));
    assert.ok(estatusDetailCerts.includes('data-action="open-archive-modal"'));
    assert.ok(estatusDetailCerts.includes('table-fixed'));
    assert.ok(!extractTbodyHtml(estatusDetailCerts).includes('<button'));
    assert.equal(assertZeroUuidExposure(estatusDetailCerts).compliant, true);

    const estatusEditHtml = renderEstatusView({
      profile: mockProfile,
      state: {
        selectedEstatusId: INITIAL_ESTATUS_CATALOG[0].id,
        query: '',
        viewMode: 'list',
        sortColumn: null,
        sortDirection: 'none',
        isEditingAttributes: true,
        formDraft: { estatus: INITIAL_ESTATUS_CATALOG[0].estatus },
      },
      estatusList: INITIAL_ESTATUS_CATALOG,
      certificados: INITIAL_CERTIFICADOS_DETAILED,
      audits: INITIAL_PROGRAMACION_AUDITS,
    });
    assert.ok(estatusEditHtml.includes('id="estatusDetailForm"'));
    assert.ok(
      estatusEditHtml.indexOf('id="saveEstatusFormBtn"') <
        estatusEditHtml.indexOf('id="cancelEditEstatusBtn"')
    );
    assert.ok(!estatusEditHtml.includes('data-action="open-changelog"'));

    const tipoDetailHtml = renderTipoAuditoriaView({
      profile: auditorProfile,
      state: {
        selectedTipoId: INITIAL_TIPOS_AUDITORIA_CATALOG[0].id,
        query: '',
        viewMode: 'list',
        sortColumn: null,
        sortDirection: 'none',
        isEditingAttributes: true,
      },
      tiposList: INITIAL_TIPOS_AUDITORIA_CATALOG,
      audits: INITIAL_PROGRAMACION_AUDITS,
    });
    assert.ok(!tipoDetailHtml.includes('id="tipoDetailForm"'));
    assert.ok(!tipoDetailHtml.includes('id="startEditTipoBtn"'));
    assert.ok(tipoDetailHtml.includes('table-fixed'));
    assert.ok(!extractTbodyHtml(tipoDetailHtml).includes('<button'));
    assert.equal(assertZeroUuidExposure(tipoDetailHtml).compliant, true);

    const metDetailHtml = renderMetodologiaAuditoriaView({
      profile: mockProfile,
      state: {
        selectedMetodologiaId: INITIAL_METODOLOGIAS_CATALOG[0].id,
        query: '',
        viewMode: 'list',
        sortColumn: null,
        sortDirection: 'none',
      },
      metodologiasList: INITIAL_METODOLOGIAS_CATALOG,
      audits: INITIAL_PROGRAMACION_AUDITS,
    });
    assert.ok(metDetailHtml.includes('id="startEditMetodologiaBtn"'));
    assert.ok(metDetailHtml.includes('table-fixed'));
    assert.ok(!extractTbodyHtml(metDetailHtml).includes('<button'));
    assert.equal(assertZeroUuidExposure(metDetailHtml).compliant, true);
  });
});

describe('Step 2.3 - Sector IAF & Sub-Sector IAF Contracts, Validators & Canonical Views', () => {
  it('resolves IAF sector descriptions 1..39 and builds clean form drafts with descripcion', () => {
    assert.equal(resolveSectorIafDescription(25), 'Suministro de electricidad');
    assert.equal(resolveSectorIafDescription(33), 'Tecnología de la información y comunicaciones');
    assert.equal(
      resolveSectorIafDescription(17, 'Metales básicos personalizados'),
      'Metales básicos personalizados'
    );
    assert.ok(resolveSectorIafDescription(0).includes('pendiente'));

    assert.deepEqual(createEmptySectorIafFormDraft(), { sector: '', descripcion: '' });
    assert.deepEqual(createSectorIafDraftFromEntity(INITIAL_SECTORES_IAF[0]), {
      sector: String(INITIAL_SECTORES_IAF[0].sector),
      descripcion: INITIAL_SECTORES_IAF[0].descripcion,
    });

    const parentId = INITIAL_SECTORES_IAF[0].id;
    assert.deepEqual(createEmptySubsectorIafFormDraft(parentId), {
      id_sector_iaf: parentId,
      codigo: '',
      descripcion: '',
      categoria_riesgo: 'MEDIO',
    });
    assert.deepEqual(
      createSubsectorIafDraftFromEntity(INITIAL_SUBSECTORES_IAF[0]),
      {
        id_sector_iaf: INITIAL_SUBSECTORES_IAF[0].id_sector_iaf,
        codigo: INITIAL_SUBSECTORES_IAF[0].codigo,
        descripcion: INITIAL_SUBSECTORES_IAF[0].descripcion,
        categoria_riesgo: INITIAL_SUBSECTORES_IAF[0].categoria_riesgo,
      }
    );
  });

  it('validates Sector IAF draft strictly (1..99, required descripcion, unique active, allows soft-deleted and own excludeId)', () => {
    assert.equal(validateSectorIafDraft({ sector: '', descripcion: 'Test' }, INITIAL_SECTORES_IAF).valid, false);
    assert.equal(validateSectorIafDraft({ sector: 'abc', descripcion: 'Test' }, INITIAL_SECTORES_IAF).valid, false);
    assert.equal(validateSectorIafDraft({ sector: '0', descripcion: 'Test' }, INITIAL_SECTORES_IAF).valid, false);
    assert.equal(validateSectorIafDraft({ sector: '100', descripcion: 'Test' }, INITIAL_SECTORES_IAF).valid, false);
    assert.equal(validateSectorIafDraft({ sector: '25', descripcion: '   ' }, INITIAL_SECTORES_IAF).valid, false);
    assert.equal(
      validateSectorIafDraft(
        { sector: String(INITIAL_SECTORES_IAF[0].sector), descripcion: 'Duplicado' },
        INITIAL_SECTORES_IAF
      ).valid,
      false
    );

    const own = validateSectorIafDraft(
      { sector: String(INITIAL_SECTORES_IAF[0].sector), descripcion: 'Descripción editada' },
      INITIAL_SECTORES_IAF,
      INITIAL_SECTORES_IAF[0].id
    );
    assert.equal(own.valid, true);
    assert.equal(own.normalized?.sector, INITIAL_SECTORES_IAF[0].sector);
    assert.equal(own.normalized?.descripcion, 'Descripción editada');

    const unused = validateSectorIafDraft(
      { sector: ' 25 ', descripcion: '  Suministro   de electricidad  ' },
      INITIAL_SECTORES_IAF
    );
    assert.equal(unused.valid, true);
    assert.equal(unused.normalized?.sector, 25);
    assert.equal(unused.normalized?.descripcion, 'Suministro de electricidad');
  });

  it('validates Sub-Sector IAF draft strictly (valid UUID parent, code <=10, unique per parent, description <=500, risk category)', () => {
    const parentId = INITIAL_SECTORES_IAF[0].id;
    assert.equal(
      validateSubsectorIafDraft(
        { id_sector_iaf: '', codigo: '25.1', descripcion: 'Desc', categoria_riesgo: 'ALTO' },
        INITIAL_SUBSECTORES_IAF
      ).valid,
      false
    );
    assert.equal(
      validateSubsectorIafDraft(
        { id_sector_iaf: 'bad-uuid', codigo: '25.1', descripcion: 'Desc', categoria_riesgo: 'ALTO' },
        INITIAL_SUBSECTORES_IAF
      ).valid,
      false
    );
    assert.equal(
      validateSubsectorIafDraft(
        { id_sector_iaf: parentId, codigo: '12345678901', descripcion: 'Desc', categoria_riesgo: 'ALTO' },
        INITIAL_SUBSECTORES_IAF
      ).valid,
      false
    );
    assert.equal(
      validateSubsectorIafDraft(
        { id_sector_iaf: parentId, codigo: '25.1', descripcion: '   ', categoria_riesgo: 'ALTO' },
        INITIAL_SUBSECTORES_IAF
      ).valid,
      false
    );

    const existingSub = INITIAL_SUBSECTORES_IAF[0];
    assert.equal(
      validateSubsectorIafDraft(
        {
          id_sector_iaf: existingSub.id_sector_iaf,
          codigo: existingSub.codigo,
          descripcion: 'Duplicado',
          categoria_riesgo: 'MEDIO',
        },
        INITIAL_SUBSECTORES_IAF
      ).valid,
      false
    );

    const validSub = validateSubsectorIafDraft(
      {
        id_sector_iaf: parentId,
        codigo: ' 99.1 ',
        descripcion: '  Generación   técnica  ',
        categoria_riesgo: 'ALTO',
      },
      INITIAL_SUBSECTORES_IAF
    );
    assert.equal(validSub.valid, true);
    assert.equal(validSub.normalized?.codigo, '99.1');
    assert.equal(validSub.normalized?.descripcion, 'Generación técnica');
    assert.equal(validSub.normalized?.categoria_riesgo, 'ALTO');
  });

  it('renders canonical Sector IAF Multi View (6-col 100% Clean List) & Detail View (add/edit/read) with zero obsolete modals', () => {
    assert.equal(
      resolveSectorIafDetailMode(
        {
          selectedSectorId: null,
          activeChildTab: 'subsectores',
          query: '',
          selectedRisk: 'ALL',
          viewMode: 'list',
          sortColumn: null,
          sortDirection: 'none',
          isCreating: true,
        },
        true
      ),
      'add'
    );
    assert.equal(
      resolveSectorIafDetailMode(
        {
          selectedSectorId: null,
          activeChildTab: 'subsectores',
          query: '',
          selectedRisk: 'ALL',
          viewMode: 'list',
          sortColumn: null,
          sortDirection: 'none',
          isCreating: true,
        },
        false
      ),
      'read'
    );

    const listHtml = renderSectorIafView({
      profile: mockProfile,
      state: {
        selectedSectorId: null,
        activeChildTab: 'subsectores',
        query: '',
        selectedRisk: 'ALL',
        viewMode: 'list',
        sortColumn: null,
        sortDirection: 'none',
      },
      sectores: INITIAL_SECTORES_IAF,
      subsectores: INITIAL_SUBSECTORES_IAF,
      certificados: INITIAL_CERTIFICADOS_DETAILED,
      auditores: INITIAL_AUDITORES_DETAILED,
    });
    assert.ok(listHtml.includes('data-resizable-table="extra-sectores-main"'));
    assert.ok(listHtml.includes('table-fixed'));
    assert.equal(sumColgroupWidths(listHtml), 100);
    assert.ok(listHtml.includes('data-action="open-create-sector-iaf"'));
    assert.ok(!extractTbodyHtml(listHtml).includes('<button'));
    assert.ok(!listHtml.includes('openNewSubsectorModalBtn'));
    assert.ok(!listHtml.includes('newSubsectorForm'));
    assert.equal(assertZeroUuidExposure(listHtml).compliant, true);

    const addHtml = renderSectorIafView({
      profile: mockProfile,
      state: {
        selectedSectorId: null,
        activeChildTab: 'subsectores',
        query: '',
        selectedRisk: 'ALL',
        viewMode: 'list',
        sortColumn: null,
        sortDirection: 'none',
        isCreating: true,
        formDraft: { sector: '25', descripcion: 'Suministro de electricidad' },
      },
      sectores: INITIAL_SECTORES_IAF,
      subsectores: INITIAL_SUBSECTORES_IAF,
    });
    assert.ok(addHtml.includes('id="sectorIafDetailForm"'));
    assert.ok(addHtml.includes('id="sectorDescripcionInput"'));
    assert.ok(addHtml.includes('Suministro de electricidad'));
    assert.ok(
      addHtml.indexOf('id="saveSectorIafFormBtn"') <
        addHtml.indexOf('id="cancelEditSectorIafBtn"')
    );
    assert.ok(!addHtml.includes('role="tablist"'));
    assert.ok(!addHtml.includes('data-action="open-changelog"'));
    assert.equal(assertZeroUuidExposure(addHtml).compliant, true);

    const readDetailHtml = renderSectorIafView({
      profile: workerProfile,
      state: {
        selectedSectorId: INITIAL_SECTORES_IAF[1].id,
        activeChildTab: 'subsectores',
        query: '',
        selectedRisk: 'ALL',
        viewMode: 'list',
        sortColumn: null,
        sortDirection: 'none',
      },
      sectores: INITIAL_SECTORES_IAF,
      subsectores: INITIAL_SUBSECTORES_IAF,
      acreditaciones: INITIAL_ACREDITACIONES,
      certificados: INITIAL_CERTIFICADOS_DETAILED,
      auditores: INITIAL_AUDITORES_DETAILED,
    });
    assert.ok(readDetailHtml.includes('data-action="open-create-subsector-iaf"'));
    assert.ok(!readDetailHtml.includes('openNewSubsectorModalBtn'));
    assert.ok(!readDetailHtml.includes('newSubsectorForm'));
    assert.ok(readDetailHtml.includes('table-fixed'));
    assert.ok(!extractTbodyHtml(readDetailHtml).includes('<button'));
    assert.equal(assertZeroUuidExposure(readDetailHtml).compliant, true);
  });

  it('renders Sub-Sector IAF Detail View (add | edit | read) with Zone 1 parent selector/chip, Clean List impact tabs & Zero-UUID compliance', () => {
    assert.equal(
      resolveSubsectorIafDetailMode({ selectedSubsectorId: null, isCreating: true }, true),
      'add'
    );
    assert.equal(
      resolveSubsectorIafDetailMode({ selectedSubsectorId: null, isCreating: true }, false),
      'read'
    );

    const addHtml = renderSubsectorIafView({
      profile: mockProfile,
      state: {
        selectedSubsectorId: null,
        prefillSectorId: INITIAL_SECTORES_IAF[0].id,
        isCreating: true,
      },
      subsectores: INITIAL_SUBSECTORES_IAF,
      sectores: INITIAL_SECTORES_IAF,
      certificados: INITIAL_CERTIFICADOS_DETAILED,
      auditores: INITIAL_AUDITORES_DETAILED,
    });
    assert.ok(addHtml.includes('id="subsectorDetailForm"'));
    assert.ok(addHtml.includes('id="subsectorSelectSector"'));
    assert.ok(addHtml.includes('id="subsectorCodigoInput"'));
    assert.ok(addHtml.includes('id="subsectorRiesgoSelect"'));
    assert.ok(addHtml.includes('id="subsectorDescripcionInput"'));
    assert.ok(
      addHtml.indexOf('id="saveSubsectorFormBtn"') <
        addHtml.indexOf('id="cancelEditSubsectorBtn"')
    );
    assert.ok(!addHtml.includes('role="tablist"'));
    assert.ok(!addHtml.includes('data-action="open-changelog"'));
    assert.equal(assertZeroUuidExposure(addHtml).compliant, true);

    const readHtml = renderSubsectorIafView({
      profile: mockProfile,
      state: {
        selectedSubsectorId: INITIAL_SUBSECTORES_IAF[0].id,
        activeChildTab: 'certificados',
      },
      subsectores: INITIAL_SUBSECTORES_IAF,
      sectores: INITIAL_SECTORES_IAF,
      certificados: INITIAL_CERTIFICADOS_DETAILED,
      auditores: INITIAL_AUDITORES_DETAILED,
    });
    assert.ok(readHtml.includes('data-parent-nav="true"'));
    assert.ok(readHtml.includes('data-subsector-tab="certificados"'));
    assert.ok(readHtml.includes('data-subsector-tab="auditores"'));
    assert.ok(readHtml.includes('data-table-name="subsector_iaf"'));
    assert.ok(readHtml.includes('table-fixed'));
    assert.ok(!extractTbodyHtml(readHtml).includes('<button'));
    assert.equal(assertZeroUuidExposure(readHtml).compliant, true);

    const editHtml = renderSubsectorIafView({
      profile: workerProfile,
      state: {
        selectedSubsectorId: INITIAL_SUBSECTORES_IAF[0].id,
        isEditingAttributes: true,
      },
      subsectores: INITIAL_SUBSECTORES_IAF,
      sectores: INITIAL_SECTORES_IAF,
      certificados: INITIAL_CERTIFICADOS_DETAILED,
      auditores: INITIAL_AUDITORES_DETAILED,
    });
    assert.ok(editHtml.includes('id="subsectorDetailForm"'));
    assert.ok(editHtml.includes('id="subsectorSelectSector"'));
    assert.ok(!editHtml.includes('data-action="open-changelog"'));
    assert.equal(assertZeroUuidExposure(editHtml).compliant, true);

    const routedFromExtra = renderExtraView(mockProfile, {
      activeSubSection: 'iaf',
      standards: INITIAL_NORMAS,
      requirements: [],
      iafSectors: INITIAL_SECTORES_IAF,
      catalogs: [],
      loading: false,
      subsectorState: {
        selectedSubsectorId: INITIAL_SUBSECTORES_IAF[0].id,
      },
      subsectores: INITIAL_SUBSECTORES_IAF,
    });
    assert.ok(routedFromExtra.includes('id="startEditSubsectorBtn"'));
    assert.equal(assertZeroUuidExposure(routedFromExtra).compliant, true);
  });
});

describe('Step 2.4 - Norma & Requisito (LTREE) Contracts, Path Engine & Canonical Views', () => {
  it('computes PostgreSQL LTREE labels and hierarchical paths purely', () => {
    assert.equal(sanitizeLtreeLabel('8.5.1'), '8_5_1');
    assert.equal(sanitizeLtreeLabel('A.5-1'), 'A_5_1');
    assert.equal(sanitizeLtreeLabel('   '), 'req');

    assert.equal(computeRequisitoLtreePath('4', null), '4');
    assert.equal(
      computeRequisitoLtreePath('4.1', { codigo: '4', ruta_materializada: '4' }),
      '4.4_1'
    );
    assert.equal(
      computeRequisitoLtreePath('8.5.1', { codigo: '8.5', ruta_materializada: '8.8_5' }),
      '8.8_5.8_5_1'
    );
  });

  it('prevents self-referencing and descendant cycles in filterValidParentRequisitos', () => {
    const normaId = INITIAL_NORMAS[0].id;
    const root4 = INITIAL_REQUISITOS_LTREE.find((r) => r.id_norma === normaId && r.codigo === '4')!;
    const child41 = INITIAL_REQUISITOS_LTREE.find((r) => r.id_norma === normaId && r.codigo === '4.1')!;
    const root5 = INITIAL_REQUISITOS_LTREE.find((r) => r.id_norma === normaId && r.codigo === '5')!;

    const descendantsOf4 = collectRequisitoDescendantIds(INITIAL_REQUISITOS_LTREE, root4.id);
    assert.ok(descendantsOf4.has(root4.id));
    assert.ok(descendantsOf4.has(child41.id));
    assert.equal(descendantsOf4.has(root5.id), false);

    const validForRoot4 = filterValidParentRequisitos(INITIAL_REQUISITOS_LTREE, normaId, root4.id);
    assert.equal(validForRoot4.some((r) => r.id === root4.id), false);
    assert.equal(validForRoot4.some((r) => r.id === child41.id), false);
    assert.equal(validForRoot4.some((r) => r.id === root5.id), true);
  });

  it('validates Norma and Requisito drafts strictly including uniqueness and cycle guard', () => {
    assert.deepEqual(createEmptyNormaFormDraft(), {
      esquema: '',
      codigo: '',
      norma: '',
      titulo: '',
      estatus: 'Vigente',
      fecha_publicacion: '',
    });
    const normDraft = createNormaDraftFromEntity(INITIAL_NORMAS[0]);
    assert.equal(normDraft.codigo, INITIAL_NORMAS[0].codigo);

    assert.equal(
      validateNormaDraft(
        { ...createEmptyNormaFormDraft(), codigo: INITIAL_NORMAS[0].codigo, esquema: 'SGC', titulo: 'Test' },
        INITIAL_NORMAS
      ).valid,
      false
    );
    assert.equal(
      validateNormaDraft(
        { ...normDraft },
        INITIAL_NORMAS,
        INITIAL_NORMAS[0].id
      ).valid,
      true
    );
    const validNewNorma = validateNormaDraft(
      {
        esquema: 'SGEn - Energía',
        codigo: 'ISO 50001:2018',
        norma: 'ISO 50001',
        titulo: 'Sistemas de gestión de la energía — Requisitos con orientación para su uso',
        estatus: 'Vigente',
        fecha_publicacion: '2018-08-21',
      },
      INITIAL_NORMAS
    );
    assert.equal(validNewNorma.valid, true);

    const normaId = INITIAL_NORMAS[0].id;
    const root4 = INITIAL_REQUISITOS_LTREE.find((r) => r.id_norma === normaId && r.codigo === '4')!;
    const child41 = INITIAL_REQUISITOS_LTREE.find((r) => r.id_norma === normaId && r.codigo === '4.1')!;
    assert.equal(createEmptyRequisitoFormDraft(normaId, root4.id).id_requisito_padre, root4.id);
    assert.equal(createRequisitoDraftFromEntity(child41).codigo, '4.1');

    // Cycle check: root4 cannot choose child41 as parent
    const cyclicEdit = validateRequisitoDraft(
      {
        ...createEmptyRequisitoFormDraft(normaId, child41.id),
        codigo: '4',
      },
      INITIAL_REQUISITOS_LTREE,
      root4.id
    );
    assert.equal(cyclicEdit.valid, false);

    // Valid new sub-requisito under 4.1
    const validReq = validateRequisitoDraft(
      {
        ...createEmptyRequisitoFormDraft(normaId, child41.id),
        codigo: '4.1.1',
        title_es: 'Sub-cláusula operativa',
        content_html_es: '<p>Contenido normativo</p>',
      },
      INITIAL_REQUISITOS_LTREE
    );
    assert.equal(validReq.valid, true);
    assert.equal(validReq.normalized?.ruta_materializada, '4.4_1.4_1_1');
  });

  it('renders Norma Multi View (6-col 100% Clean List) & Detail View (add/edit/read) without legacy modals', () => {
    assert.equal(
      resolveNormaDetailMode(
        {
          selectedNormaId: null,
          activeChildTab: 'acreditacion',
          query: '',
          selectedStatus: 'ALL',
          selectedScheme: 'ALL',
          viewMode: 'list',
          sortColumn: null,
          sortDirection: 'none',
          isCreating: true,
        },
        true
      ),
      'add'
    );
    assert.equal(
      resolveNormaDetailMode(
        {
          selectedNormaId: null,
          activeChildTab: 'acreditacion',
          query: '',
          selectedStatus: 'ALL',
          selectedScheme: 'ALL',
          viewMode: 'list',
          sortColumn: null,
          sortDirection: 'none',
          isCreating: true,
        },
        false
      ),
      'read'
    );

    const listHtml = renderNormaView({
      profile: mockProfile,
      state: {
        selectedNormaId: null,
        activeChildTab: 'acreditacion',
        query: '',
        selectedStatus: 'ALL',
        selectedScheme: 'ALL',
        viewMode: 'list',
        sortColumn: null,
        sortDirection: 'none',
      },
      normas: INITIAL_NORMAS,
      acreditaciones: INITIAL_ACREDITACIONES,
      organismos: INITIAL_ORGANISMOS,
      requisitos: INITIAL_REQUISITOS_LTREE,
    });
    assert.ok(listHtml.includes('data-resizable-table="extra-normas-main"'));
    assert.ok(listHtml.includes('table-fixed'));
    assert.equal(sumColgroupWidths(listHtml), 100);
    assert.ok(!listHtml.includes('data-col-header="acciones"'));
    assert.ok(!extractTbodyHtml(listHtml).includes('<button'));
    assert.ok(listHtml.includes('data-action="open-create-norma"'));
    assert.equal(assertZeroUuidExposure(listHtml).compliant, true);

    const addNormaHtml = renderNormaView({
      profile: mockProfile,
      state: {
        selectedNormaId: null,
        activeChildTab: 'acreditacion',
        query: '',
        selectedStatus: 'ALL',
        selectedScheme: 'ALL',
        viewMode: 'list',
        sortColumn: null,
        sortDirection: 'none',
        isCreating: true,
        formDraft: createEmptyNormaFormDraft(),
      },
      normas: INITIAL_NORMAS,
      acreditaciones: INITIAL_ACREDITACIONES,
      organismos: INITIAL_ORGANISMOS,
      requisitos: INITIAL_REQUISITOS_LTREE,
    });
    assert.ok(addNormaHtml.includes('id="normaDetailForm"'));
    assert.ok(
      addNormaHtml.indexOf('id="saveNormaFormBtn"') <
        addNormaHtml.indexOf('id="cancelEditNormaBtn"')
    );
    assert.ok(!addNormaHtml.includes('role="tablist"'));
    assert.ok(!addNormaHtml.includes('data-action="open-changelog"'));
    assert.equal(assertZeroUuidExposure(addNormaHtml).compliant, true);

    const detailReqTabHtml = renderNormaView({
      profile: workerProfile,
      state: {
        selectedNormaId: INITIAL_NORMAS[0].id,
        activeChildTab: 'requisitos',
        query: '',
        selectedStatus: 'ALL',
        selectedScheme: 'ALL',
        viewMode: 'list',
        sortColumn: null,
        sortDirection: 'none',
      },
      normas: INITIAL_NORMAS,
      acreditaciones: INITIAL_ACREDITACIONES,
      organismos: INITIAL_ORGANISMOS,
      requisitos: INITIAL_REQUISITOS_LTREE,
    });
    assert.ok(detailReqTabHtml.includes('data-resizable-table="norma-tab-requisitos"'));
    assert.ok(detailReqTabHtml.includes('data-action="open-create-requisito"'));
    assert.ok(!detailReqTabHtml.includes('clauseInspectionBackdrop'));
    assert.ok(!detailReqTabHtml.includes('newAccreditationBackdrop'));
    assert.ok(!extractTbodyHtml(detailReqTabHtml).includes('<button'));
    assert.equal(assertZeroUuidExposure(detailReqTabHtml).compliant, true);
  });

  it('renders Requisito LTREE Detail View (add/edit/read) with parent zone selectors, live path preview & Clean List tabs', () => {
    const normaId = INITIAL_NORMAS[0].id;
    const root4 = INITIAL_REQUISITOS_LTREE.find((r) => r.id_norma === normaId && r.codigo === '4')!;
    const child41 = INITIAL_REQUISITOS_LTREE.find((r) => r.id_norma === normaId && r.codigo === '4.1')!;

    assert.equal(
      resolveRequisitoDetailMode({ selectedRequisitoId: null, isCreating: true }, true),
      'add'
    );
    assert.equal(
      resolveRequisitoDetailMode({ selectedRequisitoId: null, isCreating: true }, false),
      'read'
    );

    const addReqHtml = renderRequisitoView({
      profile: mockProfile,
      state: {
        selectedRequisitoId: null,
        prefillNormaId: normaId,
        prefillPadreId: root4.id,
        isCreating: true,
        formDraft: {
          ...createEmptyRequisitoFormDraft(normaId, root4.id),
          codigo: '4.3',
        },
      },
      requisitos: INITIAL_REQUISITOS_LTREE,
      normas: INITIAL_NORMAS,
      certificados: INITIAL_CERTIFICADOS_DETAILED,
    });
    assert.ok(addReqHtml.includes('id="requisitoDetailForm"'));
    assert.ok(addReqHtml.includes('id="reqParentNormaSelect"'));
    assert.ok(addReqHtml.includes('id="reqParentRequisitoSelect"'));
    assert.ok(addReqHtml.includes('id="reqCodigoInput"'));
    assert.ok(addReqHtml.includes('id="reqExplicitCodeInput"'));
    assert.ok(!addReqHtml.includes('id="reqRutaPreview"'));
    assert.ok(!addReqHtml.includes('Ruta Materializada'));
    assert.ok(!addReqHtml.includes('4.4_3'));
    assert.ok(!addReqHtml.includes('Ir a Norma'));
    assert.ok(
      addReqHtml.indexOf('id="saveRequisitoFormBtn"') <
        addReqHtml.indexOf('id="cancelEditRequisitoBtn"')
    );
    assert.ok(!addReqHtml.includes('role="tablist"'));
    assert.ok(!addReqHtml.includes('data-action="open-changelog"'));
    assert.equal(assertZeroUuidExposure(addReqHtml).compliant, true);

    const readReqHtml = renderRequisitoView({
      profile: mockProfile,
      state: {
        selectedRequisitoId: root4.id,
        activeChildTab: 'subrequisitos',
      },
      requisitos: INITIAL_REQUISITOS_LTREE,
      normas: INITIAL_NORMAS,
      certificados: INITIAL_CERTIFICADOS_DETAILED,
    });
    assert.ok(readReqHtml.includes('data-parent-nav="true"'));
    assert.ok(!readReqHtml.includes('data-action="select-norma-from-requisito"'));
    assert.ok(!readReqHtml.includes('Ir a Norma'));
    assert.ok(!readReqHtml.includes('Ruta Materializada'));
    assert.ok(!readReqHtml.includes('NIVEL '));
    assert.ok(!readReqHtml.includes('Nivel y Cobertura Bilingüe'));
    assert.ok(!readReqHtml.includes('Código explícito en texto'));
    assert.ok(!readReqHtml.includes('id="reqExplicitCodeInput"'));
    assert.ok(!readReqHtml.includes('class="text-xs text-slate-500 font-medium pl-12 truncate"'));
    assert.ok(!readReqHtml.includes('data-requisito-tab="subrequisitos"'));
    assert.ok(!readReqHtml.includes('data-requisito-tab="procesos"'));
    assert.ok(!readReqHtml.includes('Procesos Vinculados'));
    assert.ok(!readReqHtml.includes('role="tablist"'));
    assert.ok(readReqHtml.includes('aria-label="Cláusulas hermanas del mismo nivel"'));
    assert.ok(readReqHtml.includes('aria-label="Sub-cláusulas directas"'));
    assert.ok(readReqHtml.includes('grid-cols-[auto_minmax(0,1fr)_auto]'));
    assert.ok(!readReqHtml.includes('🌿'));
    assert.ok(readReqHtml.includes(`data-requisito-id="${child41.id}"`));
    assert.ok(readReqHtml.includes('data-action="open-create-requisito"'));
    assert.ok(readReqHtml.includes(`data-parent-req-id="${root4.id}"`));
    assert.ok(
      readReqHtml.indexOf('data-action="open-create-requisito"') <
        readReqHtml.indexOf('aria-label="Contexto y relaciones superiores"')
    );
    assert.ok(
      readReqHtml.indexOf('aria-label="Contexto y relaciones superiores"') <
        readReqHtml.indexOf('aria-label="Navegación de cláusulas hermanas y sub-cláusulas directas"')
    );
    assert.ok(
      readReqHtml.indexOf('aria-label="Navegación de cláusulas hermanas y sub-cláusulas directas"') <
        readReqHtml.indexOf('aria-label="Bloque de contenido normativo"')
    );
    assert.equal(assertZeroUuidExposure(readReqHtml).compliant, true);

    const editRoot4Html = renderRequisitoView({
      profile: workerProfile,
      state: {
        selectedRequisitoId: root4.id,
        isEditingAttributes: true,
      },
      requisitos: INITIAL_REQUISITOS_LTREE,
      normas: INITIAL_NORMAS,
      certificados: INITIAL_CERTIFICADOS_DETAILED,
    });
    assert.ok(editRoot4Html.includes('id="requisitoDetailForm"'));
    assert.ok(editRoot4Html.includes('id="reqExplicitCodeInput"'));
    assert.ok(!editRoot4Html.includes('NIVEL '));
    assert.ok(!editRoot4Html.includes('id="reqRutaPreview"'));
    assert.ok(!editRoot4Html.includes('Ruta Materializada'));
    const parentSelectBlock = editRoot4Html.match(
      /<select[^>]*id="reqParentRequisitoSelect"[^>]*>[\s\S]*?<\/select>/
    );
    assert.ok(parentSelectBlock);
    assert.equal(parentSelectBlock[0].includes(`value="${root4.id}"`), false);
    assert.equal(parentSelectBlock[0].includes(`value="${child41.id}"`), false);
    assert.equal(parentSelectBlock[0].includes(`[${root4.ruta_materializada}]`), false);
    assert.equal(assertZeroUuidExposure(editRoot4Html).compliant, true);

    const clientEditAttempt = renderRequisitoView({
      profile: clientProfile,
      state: {
        selectedRequisitoId: root4.id,
        isEditingAttributes: true,
      },
      requisitos: INITIAL_REQUISITOS_LTREE,
      normas: INITIAL_NORMAS,
    });
    assert.ok(!clientEditAttempt.includes('id="requisitoDetailForm"'));
    assert.ok(!clientEditAttempt.includes('id="startEditRequisitoBtn"'));
    assert.ok(!clientEditAttempt.includes('data-action="open-create-requisito"'));
    assert.ok(!clientEditAttempt.includes('data-action="open-changelog"'));
  });

  it('recognizes PostgREST PGRST204 and PostgreSQL 42703 missing-column schema cache errors cleanly', () => {
    assert.equal(
      isMissingTableOrSchemaError({
        code: 'PGRST204',
        message: "Could not find the 'descripcion' column of 'sector_iaf' in the schema cache",
      }),
      true
    );
    assert.equal(
      isMissingTableOrSchemaError({
        code: '42703',
        message: 'column sector_iaf.descripcion does not exist',
      }),
      true
    );
    assert.equal(
      isMissingTableOrSchemaError({
        code: '23505',
        message: 'duplicate key value violates unique constraint',
      }),
      false
    );
  });
});

describe('Step 3.1: Norma Multi View Bilingual Coverage, Requisitos Default Tab, Root Chapters & Cross-Level ES/EN Search', () => {
  it('computes bilingual coverage across all 8 bundled standards (4 pre-translated ES/EN vs 4 unauthored)', () => {
    const bundled = getBundledNormaCatalog();
    assert.equal(bundled.standards.length, 8);
    assert.equal(bundled.requirementsCatalog.length, 2188);

    const iso9001 = bundled.standards.find((s) => s.codigo === 'ISO 9001:2015')!;
    const iso22000 = bundled.standards.find((s) => s.codigo === 'ISO 22000:2018')!;
    const iso27001 = bundled.standards.find((s) => s.codigo === 'ISO/IEC 27001:2022')!;
    const ntf4073 = bundled.standards.find((s) => s.codigo === 'NTF 4073:2022')!;

    const cov9001 = computeNormaBilingualCoverage(iso9001, bundled.requirementsCatalog);
    assert.equal(cov9001.totalClauses, 350);
    assert.equal(cov9001.isBilingual, true);
    assert.equal(cov9001.label, 'Bilingüe ES/EN');

    const cov22000 = computeNormaBilingualCoverage(iso22000, bundled.requirementsCatalog);
    assert.equal(cov22000.totalClauses, 480);
    assert.equal(cov22000.isBilingual, true);

    const cov27001 = computeNormaBilingualCoverage(iso27001, bundled.requirementsCatalog);
    assert.equal(cov27001.totalClauses, 167);
    assert.equal(cov27001.hasAnyContent, false);
    assert.equal(cov27001.label, 'Estructura · Sin redactar');

    const cov4073 = computeNormaBilingualCoverage(ntf4073, bundled.requirementsCatalog);
    assert.equal(cov4073.totalClauses, 138);
    assert.equal(cov4073.hasAnyContent, false);
    assert.equal(cov4073.label, 'Estructura · Sin redactar');

    // Verify Multi View List & Grid include coverage badges, 6 colgroup cols = 100%, 0 <button> in tbody, Zero-UUID
    const listHtml = renderNormaView({
      profile: mockProfile,
      state: {
        selectedNormaId: null,
        activeChildTab: 'requisitos',
        query: '',
        selectedStatus: 'ALL',
        selectedScheme: 'ALL',
        viewMode: 'list',
        sortColumn: null,
        sortDirection: 'none',
      },
      normas: bundled.standards,
      acreditaciones: INITIAL_ACREDITACIONES,
      organismos: INITIAL_ORGANISMOS,
      requisitos: bundled.requirementsCatalog,
    });
    assert.equal(sumColgroupWidths(listHtml), 100);
    assert.ok(!extractTbodyHtml(listHtml).includes('<button'));
    assert.ok(listHtml.includes('Bilingüe ES/EN'));
    assert.ok(listHtml.includes('Sin redactar'));
    assert.ok(listHtml.includes('480'));
    assert.ok(listHtml.includes('350'));
    assert.equal(assertZeroUuidExposure(listHtml).compliant, true);

    const gridHtml = renderNormaView({
      profile: mockProfile,
      state: {
        selectedNormaId: null,
        activeChildTab: 'requisitos',
        query: '',
        selectedStatus: 'ALL',
        selectedScheme: 'ALL',
        viewMode: 'grid',
        sortColumn: null,
        sortDirection: 'none',
      },
      normas: bundled.standards,
      acreditaciones: INITIAL_ACREDITACIONES,
      organismos: INITIAL_ORGANISMOS,
      requisitos: bundled.requirementsCatalog,
    });
    assert.ok(gridHtml.includes('480'));
    assert.ok(gridHtml.includes('Bilingüe ES/EN'));
    assert.ok(gridHtml.includes('Estructura · Sin redactar'));
    assert.equal(assertZeroUuidExposure(gridHtml).compliant, true);
  });

  it('renders Requisitos as first active tab by default and limits ISO 22000:2018 (480 clauses) to 10 root rows when query is empty', () => {
    const bundled = getBundledNormaCatalog();
    const iso22000 = bundled.standards.find((s) => s.codigo === 'ISO 22000:2018')!;
    const ntf4073 = bundled.standards.find((s) => s.codigo === 'NTF 4073:2022')!;

    // Default tab when via renderExtraView with undefined normaState.activeChildTab
    const extraDefaultHtml = renderExtraView(mockProfile, {
      activeSubSection: 'standards',
      standards: bundled.standards,
      requirements: [],
      requirementsCatalog: bundled.requirementsCatalog,
      iafSectors: [],
      catalogs: [],
      loading: false,
      normaState: {
        selectedNormaId: iso22000.id,
      },
    });
    const reqTabPos = extraDefaultHtml.indexOf('data-norma-tab="requisitos"');
    const accredTabPos = extraDefaultHtml.indexOf('data-norma-tab="acreditacion"');
    const certTabPos = extraDefaultHtml.indexOf('data-norma-tab="certificados"');
    assert.ok(reqTabPos > 0 && reqTabPos < accredTabPos && accredTabPos < certTabPos);
    assert.ok(extraDefaultHtml.includes('id="normaRequisitoSearchInput"'));
    assert.ok(extraDefaultHtml.includes('type="text"'));
    assert.ok(!extraDefaultHtml.includes('type="search"'));
    assert.ok(extraDefaultHtml.includes('10 capítulos raíz · 480 cláusulas'));

    const tbody22000 = extractTbodyHtml(extraDefaultHtml);
    const rowCount22000 = (tbody22000.match(/<tr\b/g) || []).length;
    assert.equal(rowCount22000, 10);
    assert.ok(tbody22000.includes('ES ✓ · EN ✓'));
    assert.ok(!tbody22000.includes('Pendiente de redactar'));
    assert.ok(!tbody22000.includes('<button'));
    assert.equal(sumColgroupWidths(extraDefaultHtml), 100);
    assert.equal(assertZeroUuidExposure(extraDefaultHtml).compliant, true);

    // Unauthored NTF 4073:2022 (138 clauses) renders 7 root chapters with Pendiente de redactar
    const ntfHtml = renderNormaView({
      profile: mockProfile,
      state: {
        selectedNormaId: ntf4073.id,
        activeChildTab: 'requisitos',
        query: '',
        requisitoQuery: '',
        selectedStatus: 'ALL',
        selectedScheme: 'ALL',
        viewMode: 'list',
        sortColumn: null,
        sortDirection: 'none',
      },
      normas: bundled.standards,
      acreditaciones: INITIAL_ACREDITACIONES,
      organismos: INITIAL_ORGANISMOS,
      requisitos: bundled.requirementsCatalog,
    });
    const tbodyNtf = extractTbodyHtml(ntfHtml);
    assert.equal((tbodyNtf.match(/<tr\b/g) || []).length, 7);
    assert.ok(tbodyNtf.includes('Pendiente de redactar'));
    assert.ok(tbodyNtf.includes('Sin redactar'));
    assert.equal(assertZeroUuidExposure(ntfHtml).compliant, true);
  });

  it('filters across all 7 LTREE levels in ES & EN and formats hierarchical breadcrumbs without UUID exposure', () => {
    const bundled = getBundledNormaCatalog();
    const iso9001 = bundled.standards.find((s) => s.codigo === 'ISO 9001:2015')!;
    const reqs9001 = bundled.requirementsCatalog.filter((r) => r.id_norma === iso9001.id);
    const byId = new Map(reqs9001.map((r) => [r.id, r]));

    // Root chapters & descendant counts
    const roots9001 = filterNormaRootRequisitos(reqs9001);
    assert.equal(roots9001.length, 10);
    const descendants = countRequisitoDescendants(reqs9001);
    const ch8 = roots9001.find((r) => r.codigo === '8')!;
    assert.ok((descendants.get(ch8.id) ?? 0) > 100);
    assert.equal(getRequisitoContentStatus(ch8).label, 'ES ✓ · EN ✓');

    // Cross-level search by clause code `5.1.2`
    const codeMatches = filterNormaRequisitosCrossLevel(reqs9001, '5.1.2');
    assert.ok(codeMatches.some((r) => r.codigo === '5.1.2'));
    const c512 = codeMatches.find((r) => r.codigo === '5.1.2')!;
    assert.equal(formatRequisitoHierarchyPath(c512, byId), 'Capítulo 5 › 5.1 › 5.1.2');
    assert.equal(getRequisitoContentStatus(c512).label, 'ES ✓ · EN ✓');

    // Cross-level search by English keyword `leadership` and Spanish keyword `liderazgo`
    const enMatches = filterNormaRequisitosCrossLevel(reqs9001, 'leadership');
    assert.ok(enMatches.length > 0);
    const esMatches = filterNormaRequisitosCrossLevel(reqs9001, 'liderazgo');
    assert.ok(esMatches.length > 0);

    // Cross-level search in ISO 22000:2018 by `peligros` (untitled authored clauses show `Cláusula 6.1.1`, not `Sin redactar`)
    const iso22000 = bundled.standards.find((s) => s.codigo === 'ISO 22000:2018')!;
    const reqs22000 = bundled.requirementsCatalog.filter((r) => r.id_norma === iso22000.id);
    const sectionFiltered = renderNormaRequisitosTableSection({
      requisitos: reqs22000,
      requisitoQuery: 'peligros',
    });
    assert.equal(sectionFiltered.isSearchActive, true);
    assert.ok(sectionFiltered.displayCount > 0 && sectionFiltered.displayCount < 480);
    assert.ok(sectionFiltered.tableHtml.includes('Capítulo '));
    assert.ok(!sectionFiltered.tableHtml.includes('Sin redactar'));
    assert.equal(sumColgroupWidths(sectionFiltered.tableHtml), 100);
    assert.ok(!extractTbodyHtml(sectionFiltered.tableHtml).includes('<button'));
    assert.equal(assertZeroUuidExposure(sectionFiltered.tableHtml).compliant, true);
  });
});

describe('Step 3.2: Requisito Detail View Read Mode — Bilingual Toggle, Expanded Placeholders, Neighbor Nav & Ir a Norma', () => {
  it('buildRequisitoNavigationContext calculates parent, numeric siblings, prev/next bounds, directChildren, and compact window slicing', () => {
    const bundled = getBundledNormaCatalog();
    const iso9001 = bundled.standards.find((s) => s.codigo === 'ISO 9001:2015')!;
    const reqs9001 = bundled.requirementsCatalog.filter((r) => r.id_norma === iso9001.id);

    const req71 = reqs9001.find((r) => r.codigo === '7.1')!;
    const req711 = reqs9001.find((r) => r.codigo === '7.1.1')!;
    const req712 = reqs9001.find((r) => r.codigo === '7.1.2')!;
    const req713 = reqs9001.find((r) => r.codigo === '7.1.3')!;
    const req714 = reqs9001.find((r) => r.codigo === '7.1.4')!;
    const req715 = reqs9001.find((r) => r.codigo === '7.1.5')!;
    const req716 = reqs9001.find((r) => r.codigo === '7.1.6')!;

    // First sibling (7.1.1): no prevSibling, nextSibling is 7.1.2, parent is 7.1
    const ctx711 = buildRequisitoNavigationContext(req711, reqs9001);
    assert.equal(ctx711.parentReq?.id, req71.id);
    assert.equal(ctx711.prevSibling, null);
    assert.equal(ctx711.nextSibling?.id, req712.id);
    assert.deepEqual(
      ctx711.siblings.map((s) => s.codigo),
      ['7.1.1', '7.1.2', '7.1.3', '7.1.4', '7.1.5', '7.1.6']
    );

    // Middle sibling (7.1.2): prevSibling is 7.1.1, nextSibling is 7.1.3
    const ctx712 = buildRequisitoNavigationContext(req712, reqs9001);
    assert.equal(ctx712.prevSibling?.id, req711.id);
    assert.equal(ctx712.nextSibling?.id, req713.id);

    // Last sibling (7.1.6): prevSibling is 7.1.5, no nextSibling
    const ctx716 = buildRequisitoNavigationContext(req716, reqs9001);
    assert.equal(ctx716.prevSibling?.codigo, req715.codigo);
    assert.equal(ctx716.nextSibling, null);
    void req714;

    // Parent 7.1 directChildren sorted numerically
    const ctx71 = buildRequisitoNavigationContext(req71, reqs9001);
    assert.deepEqual(
      ctx71.directChildren.map((c) => c.codigo),
      ['7.1.1', '7.1.2', '7.1.3', '7.1.4', '7.1.5', '7.1.6']
    );

    // Root chapters (ISO 9001 1..10): prev null on 1, numeric order 9 -> 10
    const ch1 = reqs9001.find((r) => r.codigo === '1')!;
    const ch10 = reqs9001.find((r) => r.codigo === '10')!;
    const ctxCh10 = buildRequisitoNavigationContext(ch10, reqs9001);
    assert.equal(ctxCh10.parentReq, null);
    assert.equal(ctxCh10.prevSibling?.codigo, '9');
    assert.equal(ctxCh10.nextSibling, null);
    assert.equal(ctxCh10.siblings[0].id, ch1.id);

    // Compact window slicing on large sibling lists (e.g., ISO 22000 Ch 3 with 45 definitions)
    const iso22000 = bundled.standards.find((s) => s.codigo === 'ISO 22000:2018')!;
    const reqs22000 = bundled.requirementsCatalog.filter((r) => r.id_norma === iso22000.id);
    const term320 = reqs22000.find((r) => r.codigo === '3.20')!;
    const ctx320 = buildRequisitoNavigationContext(term320, reqs22000);
    assert.equal(ctx320.siblings.length, 45);
    const windowSlice = sliceRequisitoSiblingsWindow(ctx320.siblings, term320.id, 9);
    assert.equal(windowSlice.visibleSiblings.length, 9);
    assert.ok(windowSlice.visibleSiblings.some((s) => s.id === term320.id));
    assert.ok(windowSlice.hiddenBefore > 0);
    assert.ok(windowSlice.hiddenAfter > 0);
  });

  it('renders bilingual ES, EN, and side-by-side Comparativa ES/EN modes with recursive {clause_...} blocks and navigation controls', () => {
    const bundled = getBundledNormaCatalog();
    const iso9001 = bundled.standards.find((s) => s.codigo === 'ISO 9001:2015')!;
    const reqs9001 = bundled.requirementsCatalog.filter((r) => r.id_norma === iso9001.id);
    const req71 = reqs9001.find((r) => r.codigo === '7.1')!;
    const req711 = reqs9001.find((r) => r.codigo === '7.1.1')!;
    const req712 = reqs9001.find((r) => r.codigo === '7.1.2')!;

    // Spanish mode on composite clause 7.1 expands child placeholders 7.1.1..7.1.6 with clickable micro-chips
    const es71Html = renderRequisitoView({
      profile: mockProfile,
      state: {
        selectedRequisitoId: req71.id,
        activeChildTab: 'subrequisitos',
        langMode: 'es',
      },
      requisitos: reqs9001,
      normas: bundled.standards,
      certificados: INITIAL_CERTIFICADOS_DETAILED,
    });
    assert.ok(!es71Html.includes('data-action="select-norma-from-requisito"'));
    assert.ok(!es71Html.includes('Ir a Norma'));
    assert.ok(!es71Html.includes('Ruta Materializada'));
    assert.ok(!es71Html.includes('role="tablist"'));
    assert.ok(!es71Html.includes('Procesos Vinculados'));
    assert.ok(es71Html.includes('aria-label="Cláusulas hermanas del mismo nivel"'));
    assert.ok(es71Html.includes('aria-label="Sub-cláusulas directas"'));
    assert.ok(es71Html.includes('grid-cols-[auto_minmax(0,1fr)_auto]'));
    assert.ok(!es71Html.includes('🌿'));
    assert.ok(es71Html.includes('data-embedded-clause-code="7.1.1"'));
    assert.ok(es71Html.includes(`data-requisito-id="${req711.id}"`));
    assert.ok(es71Html.includes('data-action="open-create-requisito"'));
    assert.ok(es71Html.includes(`data-parent-req-id="${req71.id}"`));
    assert.ok(es71Html.includes('data-lang-mode="es"'));
    assert.ok(es71Html.includes('data-lang-mode="en"'));
    assert.ok(es71Html.includes('data-lang-mode="both"'));
    assert.ok(es71Html.includes('>es<') || es71Html.includes('es\n'));
    assert.ok(es71Html.includes('>ambos<') || es71Html.includes('ambos\n'));
    assert.ok(!es71Html.includes('sub-cláusulas embebidas'));
    assert.ok(es71Html.includes('id="toggleRequisitoContentBtn"'));
    assert.ok(es71Html.includes('aria-expanded="true"'));
    assert.ok(es71Html.includes('id="requisitoHtmlContentBody"'));
    assert.ok(es71Html.includes('CONTENIDO'));
    assert.ok(es71Html.includes('data-normative-badge="debe"'));
    assert.ok(!es71Html.includes('data-normative-badge="shall"'));
    assert.ok(!es71Html.includes('data-normative-badge="should"'));
    assert.ok(!es71Html.includes('lg:grid-cols-2'));
    assert.ok(
      es71Html.indexOf('data-action="open-create-requisito"') <
        es71Html.indexOf('aria-label="Contexto y relaciones superiores"')
    );
    assert.ok(
      es71Html.indexOf('aria-label="Contexto y relaciones superiores"') <
        es71Html.indexOf('aria-label="Navegación de cláusulas hermanas y sub-cláusulas directas"')
    );
    assert.ok(
      es71Html.indexOf('aria-label="Navegación de cláusulas hermanas y sub-cláusulas directas"') <
        es71Html.indexOf('aria-label="Bloque de contenido normativo"')
    );
    assert.equal(assertZeroUuidExposure(es71Html).compliant, true);

    // Collapsed mode hides #requisitoHtmlContentBody while keeping 2-column header, badges, and language toggle visible
    const collapsed71Html = renderRequisitoView({
      profile: mockProfile,
      state: {
        selectedRequisitoId: req71.id,
        activeChildTab: 'subrequisitos',
        langMode: 'es',
        isContentCollapsed: true,
      },
      requisitos: reqs9001,
      normas: bundled.standards,
      certificados: INITIAL_CERTIFICADOS_DETAILED,
    });
    assert.ok(collapsed71Html.includes('id="toggleRequisitoContentBtn"'));
    assert.ok(collapsed71Html.includes('aria-expanded="false"'));
    assert.ok(!collapsed71Html.includes('id="requisitoHtmlContentBody"'));
    assert.ok(collapsed71Html.includes('CONTENIDO'));
    assert.ok(collapsed71Html.includes('data-normative-badge="debe"'));
    assert.ok(collapsed71Html.includes('data-lang-mode="both"'));

    // English mode on 7.1.1 renders English text, `shall` badge, and neighbor nav with 7.1.2 next
    const en711Html = renderRequisitoView({
      profile: auditorProfile,
      state: {
        selectedRequisitoId: req711.id,
        activeChildTab: 'subrequisitos',
        langMode: 'en',
      },
      requisitos: reqs9001,
      normas: bundled.standards,
      certificados: INITIAL_CERTIFICADOS_DETAILED,
    });
    assert.ok(en711Html.includes('General'));
    assert.ok(en711Html.includes(`data-requisito-id="${req712.id}"`));
    assert.ok(en711Html.includes('7.1.2'));
    assert.ok(en711Html.includes('→'));
    assert.ok(!en711Html.includes('Siguiente'));
    assert.ok(!en711Html.includes('Anterior'));
    assert.ok(en711Html.includes('data-normative-badge="shall"'));
    assert.ok(!en711Html.includes('data-normative-badge="debe"'));
    assert.ok(!en711Html.includes('data-normative-badge="debería"'));
    assert.ok(!en711Html.includes('sub-cláusulas embebidas'));
    // Auditors do not see staff edit controls, Ir a Norma, or open-changelog
    assert.ok(!en711Html.includes('data-action="select-norma-from-requisito"'));
    assert.ok(!en711Html.includes('data-action="open-changelog"'));
    assert.ok(!en711Html.includes('id="startEditRequisitoBtn"'));
    assert.ok(!en711Html.includes('data-action="open-create-requisito"'));
    assert.equal(assertZeroUuidExposure(en711Html).compliant, true);

    // Side-by-side mode (`both`) on 4.4.1 renders 2 columns (`lg:grid-cols-2`) with both ES & EN expanded blocks and active normative badges
    const req441 = reqs9001.find((r) => r.codigo === '4.4.1')!;
    const both441Html = renderRequisitoView({
      profile: mockProfile,
      state: {
        selectedRequisitoId: req441.id,
        langMode: 'both',
      },
      requisitos: reqs9001,
      normas: bundled.standards,
    });
    assert.ok(both441Html.includes('lg:grid-cols-2'));
    assert.ok(both441Html.includes('🇪🇸 Español'));
    assert.ok(both441Html.includes('🇬🇧 English'));
    assert.ok(both441Html.includes('data-normative-badge="debe"'));
    assert.ok(both441Html.includes('data-normative-badge="shall"'));
    assert.ok(!both441Html.includes('sub-cláusulas embebidas'));
    assert.equal(assertZeroUuidExposure(both441Html).compliant, true);
  });

  it('displays fallback notice banner when requested language is unavailable and unauthored empty state when both languages are empty', () => {
    const bundled = getBundledNormaCatalog();

    // ISO 45001:2018 3.2 has EN body but empty ES body -> ES mode triggers friendly fallback notice
    const iso45001 = bundled.standards.find((s) => s.codigo === 'ISO 45001:2018')!;
    const reqs45001 = bundled.requirementsCatalog.filter((r) => r.id_norma === iso45001.id);
    const req45_32 = reqs45001.find((r) => r.codigo === '3.2')!;
    const fallbackHtml = renderRequisitoView({
      profile: mockProfile,
      state: {
        selectedRequisitoId: req45_32.id,
        langMode: 'es',
      },
      requisitos: reqs45001,
      normas: bundled.standards,
    });
    assert.ok(fallbackHtml.includes('role="status"'));
    assert.ok(fallbackHtml.includes('no está redactado'));
    assert.ok(fallbackHtml.includes('se muestra el texto disponible'));
    assert.ok(fallbackHtml.includes('🇬🇧 English (respaldo)'));
    assert.equal(assertZeroUuidExposure(fallbackHtml).compliant, true);

    // ISO/IEC 27001:2022 clause 4 is unauthored -> clean empty state + edit prompt for staff only + 0 normative badges
    const iso27001 = bundled.standards.find((s) => s.codigo === 'ISO/IEC 27001:2022')!;
    const reqs27001 = bundled.requirementsCatalog.filter((r) => r.id_norma === iso27001.id);
    const req27_4 = reqs27001.find((r) => r.codigo === '4')!;
    const emptyStaffHtml = renderRequisitoView({
      profile: mockProfile,
      state: {
        selectedRequisitoId: req27_4.id,
        langMode: 'es',
      },
      requisitos: reqs27001,
      normas: bundled.standards,
    });
    assert.ok(emptyStaffHtml.includes('pendiente de redacción normativa'));
    assert.ok(emptyStaffHtml.includes('data-action="start-edit-requisito"'));
    assert.ok(!emptyStaffHtml.includes('data-normative-badge='));
    assert.equal(assertZeroUuidExposure(emptyStaffHtml).compliant, true);

    const emptyClientHtml = renderRequisitoView({
      profile: clientProfile,
      state: {
        selectedRequisitoId: req27_4.id,
        langMode: 'es',
      },
      requisitos: reqs27001,
      normas: bundled.standards,
    });
    assert.ok(emptyClientHtml.includes('pendiente de redacción normativa'));
    assert.ok(!emptyClientHtml.includes('data-action="start-edit-requisito"'));
  });

  it('renders all neighbor and child code-only buttons + always-present {codigo} {title} selects without synthetic Cláusula titles', () => {
    const bundled = getBundledNormaCatalog();
    const iso9001 = bundled.standards.find((s) => s.codigo === 'ISO 9001:2015')!;
    const reqs9001 = bundled.requirementsCatalog.filter((r) => r.id_norma === iso9001.id);

    const ch4 = reqs9001.find((r) => r.codigo === '4')!;
    const ch10 = reqs9001.find((r) => r.codigo === '10')!;
    const req44 = reqs9001.find((r) => r.codigo === '4.4')!;
    const req441 = reqs9001.find((r) => r.codigo === '4.4.1')!;
    const req441a = reqs9001.find((r) => r.codigo === '4.4.1.a')!;

    // 1. Root clause 4: all 10 neighbor buttons (including 10!) are visible, code-only, plus sibling select & child select
    const ch4Html = renderRequisitoView({
      profile: mockProfile,
      state: { selectedRequisitoId: ch4.id, langMode: 'es' },
      requisitos: reqs9001,
      normas: bundled.standards,
    });
    assert.ok(!ch4Html.includes('Anterior'));
    assert.ok(!ch4Html.includes('Siguiente'));
    assert.ok(ch4Html.includes(`data-requisito-id="${ch10.id}"`), 'Root clause 10 button must not be truncated');
    assert.ok(ch4Html.includes('id="reqSiblingJumpSelect"'));
    assert.ok(ch4Html.includes('id="reqChildJumpSelect"'));
    assert.ok(ch4Html.includes('data-action="jump-requisito-child"'));
    assert.ok(ch4Html.includes('>4 Contexto de la organización</option>'));
    assert.ok(ch4Html.includes('>10 Mejora</option>'));
    assert.ok(ch4Html.includes('>4.4 Sistema de gestión de la calidad y sus procesos</option>'));
    // Neighbor buttons show only code (no title text inside the <nav aria-label="Cláusulas hermanas..."> button elements)
    const siblingNavMatch = ch4Html.match(
      /<nav[^>]*aria-label="Cláusulas hermanas del mismo nivel"[^>]*>([\s\S]*?)<\/nav>/
    );
    assert.ok(siblingNavMatch);
    const siblingButtonsText = siblingNavMatch[1]
      .split('<select')[0]
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    assert.equal(siblingButtonsText, '1 2 3 4 5 6 7 8 9 10');

    // 2. Clause 4.4 (only 4 siblings): neighbor select STILL rendered; child select lists 4.4.1 without fake "Cláusula 4.4.1"
    const req44Html = renderRequisitoView({
      profile: mockProfile,
      state: { selectedRequisitoId: req44.id, langMode: 'es' },
      requisitos: reqs9001,
      normas: bundled.standards,
    });
    assert.ok(req44Html.includes('id="reqSiblingJumpSelect"'), 'Sibling select must always appear at deeper levels');
    assert.ok(req44Html.includes('id="reqChildJumpSelect"'));
    assert.ok(req44Html.includes('>4.4.1</option>'), 'Untitled 4.4.1 option must show only its code');
    assert.ok(!req44Html.includes('4.4.1 Cláusula 4.4.1'));
    assert.ok(!req44Html.includes('4.4.1 — Cláusula 4.4.1'));

    // 3. Untitled 4.4.1 has empty titulo/primaryTitle & edit draft keeps title_es empty
    assert.equal(req441.titulo, '');
    assert.equal(getRequisitoBilingualTitles(req441).primaryTitle, '');
    assert.equal(createRequisitoDraftFromEntity(req441).title_es, '');

    // 4. Child 4.4.1.a shows clean Cláusula Padre chip without fake "Cláusula 4.4.1"
    const req441aHtml = renderRequisitoView({
      profile: mockProfile,
      state: { selectedRequisitoId: req441a.id, langMode: 'es' },
      requisitos: reqs9001,
      normas: bundled.standards,
    });
    assert.ok(!req441aHtml.includes('4.4.1 — Cláusula 4.4.1'));
    assert.ok(!req441aHtml.includes('4.4.1 Cláusula 4.4.1'));
    assert.ok(!req441aHtml.includes('4.4.1.a Cláusula 4.4.1.a'));
  });
});
