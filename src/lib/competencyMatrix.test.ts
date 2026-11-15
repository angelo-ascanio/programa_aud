import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isCredentialExpired,
  getCredentialValidityState,
  isAuditorQualifiedForScope,
  countDistinctAccreditedStandards,
  countDistinctQualifiedSectors,
  countDistinctQualifiedSubsectors,
  validateCredentialCode,
  getQualificationStatusVisual,
  getAuditRoleVisual,
  filterAuditors,
  INITIAL_AUDITORES_DETAILED,
  createEmptyAuditorFormDraft,
  createAuditorDraftFromEntity,
  validateAuditorDraft,
  createEmptyCompetenciaFormDraft,
  applyCompetenciaSectorCascade,
  validateCompetenciaDraft,
  addCompetenciaLinkToAuditor,
  removeCompetenciaLinkFromAuditor,
  getAuditorNormaLinks,
  getAuditorSectorLinks,
  getAuditorSubsectorLinks,
  type CompetenciaAuditorEntity,
} from './competencyMatrix';
import { INITIAL_NORMAS, INITIAL_SECTORES_IAF, INITIAL_SUBSECTORES_IAF } from './extraDomain';
import { renderCompetenciaAuditorView } from '../views/competenciaAuditorView';
import { renderAuditorView } from '../views/auditorView';
import { assertZeroUuidExposure } from './zeroUuid';
import type { UserProfile } from './healthCheck';

const ADMIN_TEST_PROFILE: UserProfile = {
  id: '00000000-0000-0000-0000-000000000001',
  nombre: 'Admin Pruebas',
  role: 'ADMIN',
  status: 'APPROVED',
};

describe('Phase 4.3 - Credential Expiration & Validity Checks', () => {
  const referenceDate = '2025-01-01';

  it('correctly detects expired credentials against a reference date', () => {
    // Expired in 2024
    assert.equal(isCredentialExpired('2024-12-31', referenceDate), true);
    // Not expired (expires in 2026)
    assert.equal(isCredentialExpired('2026-06-30', referenceDate), false);
    // Boundary check (same date)
    assert.equal(isCredentialExpired('2025-01-01', referenceDate), false);
  });

  it('evaluates credential validity states: Vigente, Por Vencer, and Vencido', () => {
    // Expired
    assert.equal(getCredentialValidityState('2024-11-30', referenceDate), 'Vencido');

    // Within 90 days from 2025-01-01 (e.g. 2025-02-15 is ~45 days away)
    assert.equal(getCredentialValidityState('2025-02-15', referenceDate), 'Por Vencer');

    // More than 90 days away (e.g. 2026-01-01)
    assert.equal(getCredentialValidityState('2026-01-01', referenceDate), 'Vigente');
  });

  it('validates auditor credential registration code formatting', () => {
    assert.equal(validateCredentialCode('AUD-REG-2022-88').valid, true);
    assert.equal(validateCredentialCode('AUD-2024-01').valid, true);
    assert.equal(validateCredentialCode('IRCA-102938').valid, true);
    assert.equal(validateCredentialCode('').valid, false);
    assert.equal(validateCredentialCode('A').valid, false);
    assert.equal(validateCredentialCode('TOOLONG-'.repeat(10)).valid, false);
  });
});

describe('Phase 4.3 - Technical Competency Matching (ISO 17021-1 clause 7.2)', () => {
  const sampleCompetencies: CompetenciaAuditorEntity[] = [
    {
      id: 'c1',
      id_auditor: 'aud-1',
      id_norma: 'n-9001',
      norma_codigo: 'ISO 9001:2015',
      id_sector_iaf: 's-17',
      sector_iaf_numero: 17,
      sector_iaf_descripcion: 'Metales básicos y productos metálicos',
      id_subsector_iaf: 'ss-171',
      subsector_iaf_codigo: '17.1',
      subsector_iaf_descripcion: 'Fundición y siderurgia',
      rol_calificado: 'Auditor Líder',
      fecha_calificacion: '2021-01-01',
      fecha_vencimiento: '2027-12-31',
    },
    {
      id: 'c2',
      id_auditor: 'aud-1',
      id_norma: 'n-14001',
      norma_codigo: 'ISO 14001:2015',
      id_sector_iaf: 's-28',
      sector_iaf_numero: 28,
      sector_iaf_descripcion: 'Construcción e ingeniería civil',
      id_subsector_iaf: 'ss-281',
      subsector_iaf_codigo: '28.1',
      subsector_iaf_descripcion: 'Edificación y obra civil',
      rol_calificado: 'Auditor Equipo',
      fecha_calificacion: '2021-01-01',
      fecha_vencimiento: '2027-12-31',
    },
    {
      id: 'c3',
      id_auditor: 'aud-1',
      id_norma: 'n-45001',
      norma_codigo: 'ISO 45001:2018',
      id_sector_iaf: 's-14',
      sector_iaf_numero: 14,
      sector_iaf_descripcion: 'Productos químicos',
      rol_calificado: 'Experto Técnico',
      fecha_calificacion: '2020-01-01',
      fecha_vencimiento: '2023-12-31', // Expired
    },
  ];

  it('matches auditor qualification for standard and primary IAF sector', () => {
    const res = isAuditorQualifiedForScope(
      sampleCompetencies,
      'ISO 9001:2015',
      17,
      undefined,
      '2025-01-01'
    );
    assert.equal(res.qualified, true);
    assert.equal(res.matchedRole, 'Auditor Líder');
    assert.equal(res.isExpired, false);
  });

  it('matches auditor qualification for specific sub-sector (e.g. 17.1)', () => {
    const validSub = isAuditorQualifiedForScope(
      sampleCompetencies,
      'ISO 9001:2015',
      17,
      '17.1',
      '2025-01-01'
    );
    assert.equal(validSub.qualified, true);
    assert.equal(validSub.matchedRole, 'Auditor Líder');

    // Non-matched sub-sector 17.9
    const invalidSub = isAuditorQualifiedForScope(
      sampleCompetencies,
      'ISO 9001:2015',
      17,
      '17.9',
      '2025-01-01'
    );
    assert.equal(invalidSub.qualified, false);
  });

  it('flags expired competencies as unqualified with informative explanation', () => {
    const res = isAuditorQualifiedForScope(
      sampleCompetencies,
      'ISO 45001:2018',
      14,
      undefined,
      '2025-01-01'
    );
    assert.equal(res.qualified, false);
    assert.equal(res.isExpired, true);
    assert.ok(res.reason?.includes('Calificación vencida el 2023-12-31'));
  });

  it('returns unqualified when standard or sector does not match', () => {
    const wrongStd = isAuditorQualifiedForScope(
      sampleCompetencies,
      'ISO 27001',
      17,
      undefined,
      '2025-01-01'
    );
    assert.equal(wrongStd.qualified, false);

    const wrongSector = isAuditorQualifiedForScope(
      sampleCompetencies,
      'ISO 9001:2015',
      33,
      undefined,
      '2025-01-01'
    );
    assert.equal(wrongSector.qualified, false);
  });

  it('aggregates distinct accredited standards and IAF sectors', () => {
    assert.equal(countDistinctAccreditedStandards(sampleCompetencies), 3);
    assert.equal(countDistinctQualifiedSectors(sampleCompetencies), 3);
    assert.equal(countDistinctQualifiedSubsectors(sampleCompetencies), 2);
  });

  it('handles empty competency lists, string IAF sector IDs, and prefers valid credential when an expired duplicate exists', () => {
    const emptyRes = isAuditorQualifiedForScope([], 'ISO 9001:2015', 17, '17.1', '2025-01-01');
    assert.equal(emptyRes.qualified, false);
    assert.ok(emptyRes.reason?.includes('no posee competencias'));

    const stringSectorRes = isAuditorQualifiedForScope(
      sampleCompetencies,
      'ISO 9001:2015',
      '17',
      '17.1',
      '2025-01-01'
    );
    assert.equal(stringSectorRes.qualified, true);

    const mixedWithRenewal: CompetenciaAuditorEntity[] = [
      ...sampleCompetencies,
      {
        ...sampleCompetencies[2],
        id: 'c3-renewed',
        fecha_calificacion: '2024-01-01',
        fecha_vencimiento: '2028-12-31',
        rol_calificado: 'Auditor Líder',
      },
    ];
    const renewedRes = isAuditorQualifiedForScope(
      mixedWithRenewal,
      'ISO 45001:2018',
      14,
      undefined,
      '2025-01-01'
    );
    assert.equal(renewedRes.qualified, true);
    assert.equal(renewedRes.matchedRole, 'Auditor Líder');
    assert.equal(renewedRes.isExpired, false);

    // Seeded auditor Carlos Mendoza is qualified for ISO 9001:2015 / Sector 17 / Subsector 17.1
    const carlos = INITIAL_AUDITORES_DETAILED.find((a) => a.nombre.includes('Carlos Mendoza'))!;
    const carlosCheck = isAuditorQualifiedForScope(
      carlos.competencias,
      'ISO 9001:2015',
      17,
      '17.1',
      '2025-01-01'
    );
    assert.equal(carlosCheck.qualified, true);
  });
});

describe('Phase 4.3 - Auditor Directory Filtering & Visual Helpers', () => {
  it('filters auditors by full name, credential, or email', () => {
    const byName = filterAuditors(INITIAL_AUDITORES_DETAILED, { query: 'Roberto' });
    assert.equal(byName.length, 1);
    assert.equal(byName[0].nombre, 'Ing. Roberto Silva');

    const byCode = filterAuditors(INITIAL_AUDITORES_DETAILED, { query: '2023-14' });
    assert.equal(byCode.length, 1);
    assert.equal(byCode[0].nombre, 'Dra. Ana Belén Torres');

    const byEmail = filterAuditors(INITIAL_AUDITORES_DETAILED, { query: 'cmendoza@' });
    assert.equal(byEmail.length, 1);
    assert.equal(byEmail[0].nombre, 'Ing. Carlos Mendoza');
  });

  it('filters auditors by qualification status facet', () => {
    const calificados = filterAuditors(INITIAL_AUDITORES_DETAILED, {
      selectedCalificacion: 'Calificado',
    });
    assert.equal(calificados.length, 4);
    assert.ok(calificados.every((a) => a.calificacion === 'Calificado'));

    const training = filterAuditors(INITIAL_AUDITORES_DETAILED, {
      selectedCalificacion: 'En Entrenamiento',
    });
    assert.equal(training.length, 1);
    assert.equal(training[0].nombre, 'Lic. Javier Morales');

    const observador = filterAuditors(INITIAL_AUDITORES_DETAILED, {
      selectedCalificacion: 'Observador',
    });
    assert.equal(observador.length, 1);
    assert.equal(observador[0].nombre, 'Ing. Patricia Salcedo');
  });

  it('filters auditors by accredited standard facet', () => {
    const iso27001 = filterAuditors(INITIAL_AUDITORES_DETAILED, {
      selectedStandard: 'ISO/IEC 27001',
    });
    assert.equal(iso27001.length, 1);
    assert.equal(iso27001[0].nombre, 'Ing. Roberto Silva');
  });

  it('filters auditors by IAF technical sector facet', () => {
    const sector14 = filterAuditors(INITIAL_AUDITORES_DETAILED, {
      selectedSectorIaf: '14',
    });
    assert.equal(sector14.length, 2);
    assert.ok(sector14.some((a) => a.nombre === 'Dra. Ana Belén Torres'));
    assert.ok(sector14.some((a) => a.nombre === 'Ing. Patricia Salcedo'));
  });

  it('sorts auditors alphabetically ascending and descending', () => {
    const asc = filterAuditors(INITIAL_AUDITORES_DETAILED, {
      sortColumn: 'nombre',
      sortDirection: 'asc',
    });
    assert.equal(asc[0].nombre, 'Auditor Técnico Evaluador');

    const desc = filterAuditors(INITIAL_AUDITORES_DETAILED, {
      sortColumn: 'nombre',
      sortDirection: 'desc',
    });
    assert.equal(desc[0].nombre, 'Lic. Javier Morales');
  });

  it('provides visual metadata for qualification statuses and audit roles', () => {
    const calificadoVisual = getQualificationStatusVisual('Calificado');
    assert.equal(calificadoVisual.label, 'CALIFICADO');
    assert.ok(calificadoVisual.badgeClass.includes('emerald'));

    const trainingVisual = getQualificationStatusVisual('En Entrenamiento');
    assert.equal(trainingVisual.label, 'EN ENTRENAMIENTO');
    assert.ok(trainingVisual.badgeClass.includes('amber'));

    const leadRole = getAuditRoleVisual('Auditor Líder');
    assert.equal(leadRole.label, 'Auditor Líder');
    assert.ok(leadRole.badgeClass.includes('indigo'));
  });
});

describe('Step 3.2 - Auditor Canonical Drafts, M:N Competency Cascade & Persistence Logic', () => {
  it('validates auditor drafts with length limits and duplicate detection', () => {
    const empty = createEmptyAuditorFormDraft();
    assert.equal(empty.nombre, '');

    const tooShort = validateAuditorDraft({ nombre: 'A' }, INITIAL_AUDITORES_DETAILED);
    assert.equal(tooShort.valid, false);

    const dup = validateAuditorDraft(
      { nombre: '  Ing. Carlos Mendoza  ' },
      INITIAL_AUDITORES_DETAILED
    );
    assert.equal(dup.valid, false);

    const selfEdit = validateAuditorDraft(
      createAuditorDraftFromEntity(INITIAL_AUDITORES_DETAILED[0]),
      INITIAL_AUDITORES_DETAILED,
      INITIAL_AUDITORES_DETAILED[0].id
    );
    assert.equal(selfEdit.valid, true);
  });

  it('filters Sub-Sector IAF options in live cascade when Sector IAF changes', () => {
    const sector17 = INITIAL_SECTORES_IAF.find((s) => s.sector === 17)!;
    const sector28 = INITIAL_SECTORES_IAF.find((s) => s.sector === 28)!;
    const sub171 = INITIAL_SUBSECTORES_IAF.find((sub) => sub.codigo === '17.1')!;

    const baseDraft = {
      ...createEmptyCompetenciaFormDraft(INITIAL_AUDITORES_DETAILED[0].id, 'subsector_iaf'),
      id_sector_iaf: sector17.id,
      id_subsector_iaf: sub171.id,
    };

    const stayIn17 = applyCompetenciaSectorCascade({
      draft: baseDraft,
      nextSectorId: sector17.id,
      sectores: INITIAL_SECTORES_IAF,
      subsectores: INITIAL_SUBSECTORES_IAF,
    });
    assert.ok(stayIn17.filteredSubsectores.some((s) => s.codigo === '17.1'));
    assert.equal(stayIn17.draft.id_subsector_iaf, sub171.id);

    const switchTo28 = applyCompetenciaSectorCascade({
      draft: baseDraft,
      nextSectorId: sector28.id,
      sectores: INITIAL_SECTORES_IAF,
      subsectores: INITIAL_SUBSECTORES_IAF,
    });
    assert.equal(switchTo28.draft.id_sector_iaf, sector28.id);
    assert.equal(switchTo28.draft.id_subsector_iaf, '');
    assert.ok(switchTo28.filteredSubsectores.every((s) => s.sector_numero === 28));
  });

  it('enforces Zero-UUID, parent-child sector integrity, duplicate prevention, and link add/remove mutations', () => {
    const targetAuditor = {
      ...INITIAL_AUDITORES_DETAILED[0],
      normaLinks: getAuditorNormaLinks(INITIAL_AUDITORES_DETAILED[0], INITIAL_NORMAS),
      sectorLinks: getAuditorSectorLinks(INITIAL_AUDITORES_DETAILED[0], INITIAL_SECTORES_IAF),
      subsectorLinks: getAuditorSubsectorLinks(
        INITIAL_AUDITORES_DETAILED[0],
        INITIAL_SUBSECTORES_IAF
      ),
    };
    const iso27001 = INITIAL_NORMAS.find((n) => n.norma.includes('27001'))!;
    const sector17 = INITIAL_SECTORES_IAF.find((s) => s.sector === 17)!;
    const sector33 = INITIAL_SECTORES_IAF.find((s) => s.sector === 33)!;
    const sub172 = INITIAL_SUBSECTORES_IAF.find((sub) => sub.codigo === '17.2')!;

    // Invalid UUID rejected
    const badUuidRes = validateCompetenciaDraft({
      draft: {
        id_auditor: 'not-a-uuid',
        tipo: 'norma',
        id_norma: iso27001.id,
        id_sector_iaf: '',
        id_subsector_iaf: '',
      },
      auditors: [targetAuditor],
      normas: INITIAL_NORMAS,
    });
    assert.equal(badUuidRes.valid, false);

    // Mismatched sector/subsector rejected
    const mismatchSubRes = validateCompetenciaDraft({
      draft: {
        id_auditor: targetAuditor.id,
        tipo: 'subsector_iaf',
        id_norma: '',
        id_sector_iaf: sector33.id,
        id_subsector_iaf: sub172.id,
      },
      auditors: [targetAuditor],
      sectores: INITIAL_SECTORES_IAF,
      subsectores: INITIAL_SUBSECTORES_IAF,
    });
    assert.equal(mismatchSubRes.valid, false);

    // Valid norma assignment + duplicate rejection + removal
    const validNorma = validateCompetenciaDraft({
      draft: {
        id_auditor: targetAuditor.id,
        tipo: 'norma',
        id_norma: iso27001.id,
        id_sector_iaf: '',
        id_subsector_iaf: '',
      },
      auditors: [targetAuditor],
      normas: INITIAL_NORMAS,
    });
    assert.equal(validNorma.valid, true);

    const afterAddNorma = addCompetenciaLinkToAuditor({
      auditor: targetAuditor,
      draft: validNorma.normalized!,
      normas: INITIAL_NORMAS,
      sectores: INITIAL_SECTORES_IAF,
      subsectores: INITIAL_SUBSECTORES_IAF,
    });
    assert.ok(afterAddNorma.normaLinks?.some((l) => l.id_norma === iso27001.id));
    assert.ok(afterAddNorma.normas_acreditadas.includes(iso27001.codigo));

    const dupNorma = validateCompetenciaDraft({
      draft: validNorma.normalized!,
      auditors: [afterAddNorma],
      normas: INITIAL_NORMAS,
    });
    assert.equal(dupNorma.valid, false);

    const afterRemoveNorma = removeCompetenciaLinkFromAuditor({
      auditor: afterAddNorma,
      tipo: 'norma',
      targetId: iso27001.id,
      normas: INITIAL_NORMAS,
      sectores: INITIAL_SECTORES_IAF,
      subsectores: INITIAL_SUBSECTORES_IAF,
    });
    assert.equal(
      afterRemoveNorma.normaLinks?.some((l) => l.id_norma === iso27001.id),
      false
    );

    // Subsector add & remove
    const validSub = validateCompetenciaDraft({
      draft: {
        id_auditor: targetAuditor.id,
        tipo: 'subsector_iaf',
        id_norma: '',
        id_sector_iaf: sector17.id,
        id_subsector_iaf: sub172.id,
      },
      auditors: [targetAuditor],
      sectores: INITIAL_SECTORES_IAF,
      subsectores: INITIAL_SUBSECTORES_IAF,
    });
    assert.equal(validSub.valid, true);

    const afterAddSub = addCompetenciaLinkToAuditor({
      auditor: targetAuditor,
      draft: validSub.normalized!,
      normas: INITIAL_NORMAS,
      sectores: INITIAL_SECTORES_IAF,
      subsectores: INITIAL_SUBSECTORES_IAF,
    });
    assert.ok(afterAddSub.subsectorLinks?.some((l) => l.id_subsector_iaf === sub172.id));
  });

  it('renders CompetenciaAuditorView Add Mode with live Sector 17 -> 17.1/17.2 cascade and Read Mode unlink confirmation', () => {
    const sector17 = INITIAL_SECTORES_IAF.find((s) => s.sector === 17)!;
    const sub171 = INITIAL_SUBSECTORES_IAF.find((s) => s.codigo === '17.1')!;
    const sub172 = INITIAL_SUBSECTORES_IAF.find((s) => s.codigo === '17.2')!;
    const sub331 = INITIAL_SUBSECTORES_IAF.find((s) => s.codigo === '33.1')!;

    const addHtml = renderCompetenciaAuditorView({
      profile: ADMIN_TEST_PROFILE,
      state: {
        isOpen: true,
        mode: 'add',
        prefillAuditorId: INITIAL_AUDITORES_DETAILED[0].id,
        formDraft: {
          id_auditor: INITIAL_AUDITORES_DETAILED[0].id,
          tipo: 'subsector_iaf',
          id_norma: '',
          id_sector_iaf: sector17.id,
          id_subsector_iaf: '',
        },
      },
      auditors: INITIAL_AUDITORES_DETAILED,
      normas: INITIAL_NORMAS,
      sectores: INITIAL_SECTORES_IAF,
      subsectores: INITIAL_SUBSECTORES_IAF,
    });
    assert.ok(addHtml.includes('id="competenciaAuditorDetailForm"'));
    assert.ok(addHtml.includes('id="saveCompetenciaBtn"'));
    assert.ok(addHtml.includes('id="cancelCompetenciaBtn"'));
    assert.ok(addHtml.includes(sub171.codigo));
    assert.ok(addHtml.includes(sub172.codigo));
    assert.equal(addHtml.includes(sub331.codigo), false);
    assert.equal(assertZeroUuidExposure(addHtml).compliant, true);

    const readHtml = renderCompetenciaAuditorView({
      profile: ADMIN_TEST_PROFILE,
      state: {
        isOpen: true,
        mode: 'read',
        selectedComp: {
          id_auditor: INITIAL_AUDITORES_DETAILED[0].id,
          tipo: 'subsector_iaf',
          targetId: sub171.id,
        },
        confirmUnlink: true,
      },
      auditors: INITIAL_AUDITORES_DETAILED,
      normas: INITIAL_NORMAS,
      sectores: INITIAL_SECTORES_IAF,
      subsectores: INITIAL_SUBSECTORES_IAF,
    });
    assert.ok(readHtml.includes('data-action="unlink-competencia"'));
    assert.ok(readHtml.includes('data-action="confirm-unlink-competencia"'));
    assert.ok(readHtml.includes('data-parent-type="auditor"'));
    assert.ok(readHtml.includes('data-parent-type="subsector_iaf"'));
    assert.equal(assertZeroUuidExposure(readHtml).compliant, true);

    // Auditor detail child tabs render clean clickable rows and + Asignar Competencia button
    const audDetailHtml = renderAuditorView({
      profile: ADMIN_TEST_PROFILE,
      state: {
        selectedAuditorId: INITIAL_AUDITORES_DETAILED[0].id,
        activeChildTab: 'competencias',
        query: '',
        selectedCalificacion: 'ALL',
        selectedStandard: 'ALL',
        selectedSectorIaf: 'ALL',
        viewMode: 'list',
        sortColumn: null,
        sortDirection: 'none',
        isEditingAttributes: false,
      },
      auditors: INITIAL_AUDITORES_DETAILED,
      normas: INITIAL_NORMAS,
      sectores: INITIAL_SECTORES_IAF,
      subsectores: INITIAL_SUBSECTORES_IAF,
    });
    assert.ok(audDetailHtml.includes('data-action="open-add-competency"'));
    assert.ok(audDetailHtml.includes('data-action="select-competencia-auditor"'));
    assert.ok(audDetailHtml.includes('data-resizable-table="auditor-tab-normas"'));
    assert.ok(audDetailHtml.includes('data-resizable-table="auditor-tab-sectores"'));
    assert.ok(audDetailHtml.includes('data-resizable-table="auditor-tab-subsectores"'));
    assert.equal(assertZeroUuidExposure(audDetailHtml).compliant, true);
  });
});
