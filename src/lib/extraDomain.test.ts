import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
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
} from './extraDomain';
import { INITIAL_CERTIFICADOS_DETAILED } from './multisiteSampling';
import { INITIAL_PROGRAMACION_AUDITS } from './auditExecution';
import { assertZeroUuidExposure } from './zeroUuid';
import { renderNormaView } from '../views/normaView';
import { renderSectorIafView } from '../views/sectorIafView';
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
    const active = formatAcreditacionStatusBadge('Activa');
    assert.equal(active.label, 'ACREDITACIÓN ACTIVA');
    assert.ok(active.badgeClass.includes('emerald'));
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
        isAddAccreditationModalOpen: false,
        inspectingClauseId: null,
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
        isAddAccreditationModalOpen: false,
        inspectingClauseId: null,
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
        isAddSubsectorModalOpen: false,
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
        isAddSubsectorModalOpen: false,
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

