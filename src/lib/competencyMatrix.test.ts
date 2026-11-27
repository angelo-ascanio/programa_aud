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
  evaluateAuditorInSituStatus,
  getAuditorInSituStatusVisual,
  classifyAuditorObservacionSector,
  summarizeEvaluacionesInSitu,
  validateAuditorTelefonoDraft,
  validateAuditorEmailDraft,
  validateEvaluacionInSituDraft,
  normalizeAuditorProfessionLabel,
  formatShortIsoStandardLabel,
  extractAuditorComplementarySchemes,
  formatAuditorContactSummary,
  summarizeAuditorSectorCoverage,
  resolveAuditorInSituFacetBucket,
  buildAuditorSearchableText,
  sortEvaluacionesInSituChronological,
  formatAuditorDisplayLabel,
  formatAuditorSelectorLabel,
  detectDuplicateAuditorNames,
  deriveAuditorHistorialFromAudits,
  enrichAuditorsWithHistorial,
  type AuditorDetailEntity,
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

    // Seeded auditor Keyla Soteldo is qualified for ISO 9001:2015 / Sector 17 / Subsector 17.1
    const keyla = INITIAL_AUDITORES_DETAILED.find((a) =>
      a.nombre.includes('Keyla Cristina Soteldo')
    )!;
    const keylaCheck = isAuditorQualifiedForScope(
      keyla.competencias,
      'ISO 9001:2015',
      17,
      '17.1',
      '2025-01-01'
    );
    assert.equal(keylaCheck.qualified, true);
  });
});

describe('Phase 4.3 - Auditor Directory Filtering & Visual Helpers', () => {
  it('filters auditors by full name, siglas, cédula, or email', () => {
    const byName = filterAuditors(INITIAL_AUDITORES_DETAILED, { query: 'Félix' });
    assert.equal(byName.length, 1);
    assert.equal(byName[0].nombre, 'Félix Horacio Rojas Machado');

    const byCode = filterAuditors(INITIAL_AUDITORES_DETAILED, { query: 'JRP' });
    assert.equal(byCode.length, 1);
    assert.equal(byCode[0].nombre, 'José Ramón Polo Faría');

    const byCedula = filterAuditors(INITIAL_AUDITORES_DETAILED, { query: '5365320' });
    assert.equal(byCedula.length, 1);
    assert.equal(byCedula[0].nombre, 'Leonardo Antonio Rojas Gómez');

    const byEmail = filterAuditors(INITIAL_AUDITORES_DETAILED, { query: 'keylasoteldo@' });
    assert.equal(byEmail.length, 1);
    assert.equal(byEmail[0].nombre, 'Keyla Cristina Soteldo de Páez');
  });

  it('filters auditors by qualification status facet', () => {
    const calificados = filterAuditors(INITIAL_AUDITORES_DETAILED, {
      selectedCalificacion: 'Calificado',
    });
    assert.equal(calificados.length, INITIAL_AUDITORES_DETAILED.length);
    assert.ok(calificados.every((a) => a.calificacion === 'Calificado'));
  });

  it('filters auditors by accredited standard facet', () => {
    const iso27001 = filterAuditors(INITIAL_AUDITORES_DETAILED, {
      selectedStandard: 'ISO/IEC 27001',
    });
    assert.equal(iso27001.length, 1);
    assert.equal(iso27001[0].nombre, 'Auditor Técnico Evaluador');
  });

  it('filters auditors by IAF technical sector facet', () => {
    const sector14 = filterAuditors(INITIAL_AUDITORES_DETAILED, {
      selectedSectorIaf: '14',
    });
    assert.equal(sector14.length, 2);
    assert.ok(sector14.some((a) => a.nombre === 'Félix Horacio Rojas Machado'));
    assert.ok(sector14.some((a) => a.nombre === 'Leonardo Antonio Rojas Gómez'));
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
    assert.equal(desc[0].nombre, 'Nordy Armando Fuentes');
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

describe('Step 3.2 & Paso 2.1 - Auditor Canonical Drafts, Cédula Validation, M:N Competency Cascade & Persistence Logic', () => {
  it('validates auditor drafts allowing exact homonyms with distinct cédula and blocking duplicate cédula', () => {
    const empty = createEmptyAuditorFormDraft();
    assert.equal(empty.nombre, '');

    const tooShort = validateAuditorDraft(
      { nombre: 'A', siglas: 'AA', cedula_identidad: '1234567' },
      INITIAL_AUDITORES_DETAILED
    );
    assert.equal(tooShort.valid, false);

    // Missing cédula on create fails
    const missingCedula = validateAuditorDraft(
      { nombre: 'Yurima Carrillo', siglas: 'YC', cedula_identidad: '' },
      INITIAL_AUDITORES_DETAILED
    );
    assert.equal(missingCedula.valid, false);

    // Exact homonym on nombre & siglas with distinct cédula passes
    const homonymOk = validateAuditorDraft(
      {
        nombre: 'Keyla Cristina Soteldo de Páez',
        siglas: 'KS',
        cedula_identidad: '99887766',
      },
      INITIAL_AUDITORES_DETAILED
    );
    assert.equal(homonymOk.valid, true);

    // Duplicate active cédula fails
    const dupCedula = validateAuditorDraft(
      {
        nombre: 'Otro Auditor',
        siglas: 'OA',
        cedula_identidad: ' 4165827 ',
      },
      INITIAL_AUDITORES_DETAILED
    );
    assert.equal(dupCedula.valid, false);
    assert.equal(dupCedula.message, 'Ya existe un auditor activo con esa cédula de identidad.');

    // Invalid year bounds rejected
    const badYearNormas = validateAuditorDraft(
      {
        nombre: 'Auditor Prueba Año',
        siglas: 'APA',
        cedula_identidad: '19001234',
        anio_actualizacion_normas: 1989,
      },
      INITIAL_AUDITORES_DETAILED
    );
    assert.equal(badYearNormas.valid, false);

    const badYearSectores = validateAuditorDraft(
      {
        nombre: 'Auditor Prueba Año',
        siglas: 'APA',
        cedula_identidad: '19001234',
        anio_actualizacion_sectores: 2101,
      },
      INITIAL_AUDITORES_DETAILED
    );
    assert.equal(badYearSectores.valid, false);

    // Self-edit passes even with existing cédula (and seeded test auditor with null cédula)
    const selfEdit = validateAuditorDraft(
      createAuditorDraftFromEntity(INITIAL_AUDITORES_DETAILED[0]),
      INITIAL_AUDITORES_DETAILED,
      INITIAL_AUDITORES_DETAILED[0].id
    );
    assert.equal(selfEdit.valid, true);

    const testUserSeed = INITIAL_AUDITORES_DETAILED.find(
      (a) => a.id === '33333333-3333-3333-3333-333333333333'
    )!;
    const testUserEdit = validateAuditorDraft(
      createAuditorDraftFromEntity(testUserSeed),
      INITIAL_AUDITORES_DETAILED,
      testUserSeed.id
    );
    assert.equal(testUserEdit.valid, true);
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

describe('Paso 2.1 - Evaluación In Situ, Clasificación de Experto Técnico y Validación de Contactos', () => {
  it('evaluates all 6 in-situ status states deterministically', () => {
    const refDate = '2026-06-01';

    assert.equal(
      evaluateAuditorInSituStatus(
        {
          sin_registro_evaluacion: false,
          proxima_evaluacion_in_situ_fecha: '2027-09-01',
          observaciones_evaluacion: '',
          observacion_sectores: '',
        },
        refDate
      ),
      'Vigente'
    );

    assert.equal(
      evaluateAuditorInSituStatus(
        {
          sin_registro_evaluacion: false,
          proxima_evaluacion_in_situ_fecha: '2026-07-15',
          observaciones_evaluacion: '',
          observacion_sectores: '',
        },
        refDate
      ),
      'Por Vencer'
    );

    assert.equal(
      evaluateAuditorInSituStatus(
        {
          sin_registro_evaluacion: false,
          proxima_evaluacion_in_situ_fecha: '2025-08-01',
          observaciones_evaluacion: '',
          observacion_sectores: '',
        },
        refDate
      ),
      'Vencido'
    );

    assert.equal(
      evaluateAuditorInSituStatus(
        {
          sin_registro_evaluacion: true,
          proxima_evaluacion_in_situ_fecha: null,
          observaciones_evaluacion: '',
          observacion_sectores: '',
        },
        refDate
      ),
      'S/R'
    );

    assert.equal(
      evaluateAuditorInSituStatus(
        {
          sin_registro_evaluacion: true,
          proxima_evaluacion_in_situ_fecha: null,
          observaciones_evaluacion: 'PENDIENTE POR EVALUACIÓN IN SITU',
          observacion_sectores: '',
        },
        refDate
      ),
      'Pendiente Evaluación'
    );

    assert.equal(
      evaluateAuditorInSituStatus(
        {
          sin_registro_evaluacion: false,
          proxima_evaluacion_in_situ_fecha: '2027-01-01',
          observaciones_evaluacion: '',
          observacion_sectores: 'CONDICIONADO EN SECTOR 9',
        },
        refDate
      ),
      'Condicionado'
    );

    assert.equal(getAuditorInSituStatusVisual('Por Vencer').label, 'Por Vencer');
    assert.equal(getAuditorInSituStatusVisual('S/R').label, 'S/R');
  });

  it('classifies observacion_sectores needing Experto Técnico and extracts valid IAF sectors 1..39 only', () => {
    const clean = classifyAuditorObservacionSector({
      observacion_sectores: '',
      observaciones_evaluacion: '',
    });
    assert.equal(clean.requiereExpertoTecnico, false);
    assert.deepEqual(clean.sectoresCondicionados, []);

    const jrp = classifyAuditorObservacionSector({
      observacion_sectores: 'Sector 9 y 38 con Experto tecnico.',
      observaciones_evaluacion: 'SECTOR 9 Y 38 CON EXPERTO TÉCNICO',
    });
    assert.equal(jrp.requiereExpertoTecnico, true);
    assert.deepEqual(jrp.sectoresCondicionados, [9, 38]);

    // Ignores normative numbers like 14001 or 9001 (> 39)
    const nf = classifyAuditorObservacionSector({
      observacion_sectores: 'SECTOR 4, 5 y 38 CON EXP TECNICO PARA ISO 14001',
      observaciones_evaluacion: '',
    });
    assert.equal(nf.requiereExpertoTecnico, true);
    assert.deepEqual(nf.sectoresCondicionados, [4, 5, 38]);
  });

  it('summarizes active evaluaciones in situ and validates phone/email/evaluation child drafts', () => {
    const emptySummary = summarizeEvaluacionesInSitu([]);
    assert.equal(emptySummary.sin_registro_evaluacion, true);
    assert.equal(emptySummary.ultima_evaluacion_in_situ_fecha, null);

    const summary = summarizeEvaluacionesInSitu([
      {
        id: 'ev-1',
        id_auditor: 'aud-1',
        ultima_evaluacion_fecha: '2015-05-01',
        proxima_evaluacion_fecha: '2018-05-01',
        deleted_at: null,
      },
      {
        id: 'ev-2',
        id_auditor: 'aud-1',
        ultima_evaluacion_fecha: '2024-11-01',
        proxima_evaluacion_fecha: '2027-11-01',
        deleted_at: null,
      },
      {
        id: 'ev-deleted',
        id_auditor: 'aud-1',
        ultima_evaluacion_fecha: '2029-01-01',
        proxima_evaluacion_fecha: '2032-01-01',
        deleted_at: '2026-01-01T00:00:00Z',
      },
    ]);
    assert.equal(summary.ultima_evaluacion_in_situ_fecha, '2024-11-01');
    assert.equal(summary.proxima_evaluacion_in_situ_fecha, '2027-11-01');
    assert.equal(summary.sin_registro_evaluacion, false);

    assert.equal(
      validateAuditorTelefonoDraft(
        { telefono: '04166225576', tipo_telefono: 'Móvil', es_principal: true },
        [{ telefono: '04166225576', deleted_at: null }]
      ).valid,
      false
    );
    assert.equal(
      validateAuditorEmailDraft(
        { email: 'nuevo@fondonorma.test', tipo_email: 'Trabajo', es_principal: false },
        [{ email: 'otro@fondonorma.test', deleted_at: null }]
      ).valid,
      true
    );
    assert.equal(
      validateEvaluacionInSituDraft({
        etiqueta_periodo: '',
        norma_referencia: '',
        sector_area_evaluado: '',
        ultima_evaluacion_fecha: null,
        proxima_evaluacion_fecha: null,
        ultima_evaluacion_texto: '',
        proxima_evaluacion_texto: '',
        observaciones: '',
      }).valid,
      false
    );
  });
});

describe('Step 3.1 - Auditor Multi View Helpers, List/Grid Rendering & Reactive S_{-k} Facets', () => {
  const baseTemplate = INITIAL_AUDITORES_DETAILED[0];

  const csvSampleAuditors: AuditorDetailEntity[] = [
    INITIAL_AUDITORES_DETAILED[0], // KS: ISO 9001/14001/45001, 17.1 & 33.1, Vigente
    INITIAL_AUDITORES_DETAILED[2], // JRP: ISO 9001, Sector 9 y 38 con Experto tecnico
    INITIAL_AUDITORES_DETAILED[4], // NF: 2 phones (04126018407 + 02123698762) + Experto tecnico
    {
      ...baseTemplate,
      id: '10000000-0000-0000-0000-000000000091',
      nombre: 'Yurima Carrillo',
      siglas: 'YC',
      cedula_identidad: '7137643',
      profesion: 'INGENIERO EN INFORMACIÓN',
      titulo_profesional: 'INGENIERO EN INFORMACIÓN',
      codigo_credencial: 'YC',
      email: 'yanellys_castellanos@yahoo.com',
      telefono: '04144843822',
      esquemas_complementarios: '',
      sistema_gestion_secundario: '',
      sin_registro_evaluacion: true,
      proxima_evaluacion_in_situ_fecha: null,
      observaciones_evaluacion: 'CONDICIONA A EVALUACIÓN INSITU',
      observacion_sectores: '',
      telefonos: [
        {
          id: 'tel-yc1',
          id_auditor: '10000000-0000-0000-0000-000000000091',
          telefono: '04144843822',
          tipo_telefono: 'Móvil',
          es_principal: true,
          deleted_at: null,
        },
      ],
      emails: [
        {
          id: 'em-yc1',
          id_auditor: '10000000-0000-0000-0000-000000000091',
          email: 'yanellys_castellanos@yahoo.com',
          tipo_email: 'Principal',
          es_principal: true,
          deleted_at: null,
        },
      ],
      normas_acreditadas: ['ISO 9001:2015', 'ISO 14001:2015'],
      normaLinks: [],
      sectores_iaf: [10, 12, 14, 37],
      sectorLinks: [],
      subsectorLinks: [
        {
          id_auditor: '10000000-0000-0000-0000-000000000091',
          id_subsector_iaf: 'da000000-0000-0000-0000-000000000371',
          id_sector_iaf: 'd0000000-0000-0000-0000-000000000037',
          sector_numero: 37,
          subsector_codigo: '37.1',
          subsector_descripcion: 'Educación',
        },
      ],
      competencias: [],
      historialAuditorias: [],
    },
    {
      ...baseTemplate,
      id: '10000000-0000-0000-0000-000000000092',
      nombre: 'Yurima Carrillo',
      siglas: 'YC',
      cedula_identidad: '12310919',
      profesion: 'INGENIERO QUÍMICO',
      titulo_profesional: 'INGENIERO QUÍMICO',
      codigo_credencial: 'YC',
      email: 'yurima12.fondonorma@gmail.com',
      telefono: '04166093375',
      esquemas_complementarios: '',
      sistema_gestion_secundario: '',
      sin_registro_evaluacion: false,
      proxima_evaluacion_in_situ_fecha: '2027-10-01',
      observaciones_evaluacion: '',
      observacion_sectores: '',
      telefonos: [
        {
          id: 'tel-yc2',
          id_auditor: '10000000-0000-0000-0000-000000000092',
          telefono: '04166093375',
          tipo_telefono: 'Móvil',
          es_principal: true,
          deleted_at: null,
        },
      ],
      emails: [
        {
          id: 'em-yc2',
          id_auditor: '10000000-0000-0000-0000-000000000092',
          email: 'yurima12.fondonorma@gmail.com',
          tipo_email: 'Principal',
          es_principal: true,
          deleted_at: null,
        },
        {
          id: 'em-yc2-sec',
          id_auditor: '10000000-0000-0000-0000-000000000092',
          email: 'yc.respaldo@fondonorma.org',
          tipo_email: 'Secundario',
          es_principal: false,
          deleted_at: null,
        },
      ],
      normas_acreditadas: ['ISO 9001:2015', 'ISO 14001:2015'],
      normaLinks: [],
      sectores_iaf: [10, 12, 14, 37],
      sectorLinks: [],
      subsectorLinks: [],
      competencias: [],
      historialAuditorias: [],
    },
    {
      ...baseTemplate,
      id: '10000000-0000-0000-0000-000000000093',
      nombre: 'Óscar Ríos',
      siglas: 'OR',
      cedula_identidad: '7130716',
      profesion: 'INGENIERO QUÍMICO',
      titulo_profesional: 'INGENIERO QUÍMICO',
      codigo_credencial: 'OR',
      email: 'oscareriosu@gmail.com',
      telefono: '04144977127',
      esquemas_complementarios: 'MARCA',
      sistema_gestion_secundario: '',
      sin_registro_evaluacion: true,
      proxima_evaluacion_in_situ_fecha: null,
      observaciones_evaluacion: '',
      observacion_sectores: '',
      telefonos: [],
      emails: [],
      normas_acreditadas: [],
      normaLinks: [],
      sectores_iaf: [10, 12, 14, 35],
      sectorLinks: [],
      subsectorLinks: [],
      competencias: [],
      historialAuditorias: [],
    },
    {
      ...baseTemplate,
      id: '10000000-0000-0000-0000-000000000094',
      nombre: 'Karol Yulay Sánchez De Ghiano',
      siglas: 'KSG',
      cedula_identidad: '17039885',
      profesion: 'INGENIERO MECÁNICO',
      titulo_profesional: 'INGENIERO MECÁNICO',
      codigo_credencial: 'KSG',
      email: 'karol.sanchez13@gmail.com',
      telefono: '04249699059',
      esquemas_complementarios: 'HACCP',
      sistema_gestion_secundario: '',
      sin_registro_evaluacion: true,
      proxima_evaluacion_in_situ_fecha: null,
      observaciones_evaluacion: '',
      observacion_sectores: '',
      telefonos: [],
      emails: [],
      normas_acreditadas: ['ISO 9001:2015'],
      normaLinks: [],
      sectores_iaf: [],
      sectorLinks: [],
      subsectorLinks: [],
      competencias: [],
      historialAuditorias: [],
    },
  ];

  it('normalizes professions, ISO short labels, complementary schemes, contacts, and sector coverage', () => {
    assert.equal(normalizeAuditorProfessionLabel('  INGENIERO   INDUSTRIAL '), 'Ingeniero Industrial');
    assert.equal(
      normalizeAuditorProfessionLabel('INGENIERO EN SISTEMAS DE CALIDAD Y AMBIENTE / TSU EN QUÍMICA'),
      'Ingeniero en Sistemas de Calidad y Ambiente / TSU en Química'
    );
    assert.equal(formatShortIsoStandardLabel('ISO 9001:2015'), 'ISO 9001');
    assert.equal(formatShortIsoStandardLabel('ISO/IEC 27001:2022'), 'ISO 27001');

    assert.deepEqual(
      extractAuditorComplementarySchemes({
        esquemas_complementarios: 'MARCA / HACCP',
        sistema_gestion_secundario: 'marca',
      }),
      ['MARCA', 'HACCP']
    );

    const nfContact = formatAuditorContactSummary(INITIAL_AUDITORES_DETAILED[4]);
    assert.equal(nfContact.primaryPhone, '04126018407');
    assert.equal(nfContact.extraPhonesCount, 1);
    assert.equal(nfContact.primaryEmail, 'nordyfuentes@gmail.com');
    assert.equal(nfContact.extraEmailsCount, 0);

    const ksgSectors = summarizeAuditorSectorCoverage(csvSampleAuditors[6]);
    assert.equal(ksgSectors.isEmpty, true);
    assert.equal(ksgSectors.previewText, 'Sin sectores asignados');

    const ksSectors = summarizeAuditorSectorCoverage(INITIAL_AUDITORES_DETAILED[0]);
    assert.equal(ksSectors.isEmpty, false);
    assert.equal(ksSectors.previewText, '17.1, 33.1');

    assert.equal(resolveAuditorInSituFacetBucket(csvSampleAuditors[3]), 'Pendiente / Condicionado');
    assert.equal(resolveAuditorInSituFacetBucket(csvSampleAuditors[5]), 'S/R');
  });

  it('indexes phones, secondary emails, schemes, subsectors, and observations in filterAuditors & buildAuditorSearchableText', () => {
    assert.equal(filterAuditors(csvSampleAuditors, { query: '02123698762' }).length, 1);
    assert.equal(filterAuditors(csvSampleAuditors, { query: 'yc.respaldo@fondonorma.org' }).length, 1);
    assert.equal(filterAuditors(csvSampleAuditors, { query: 'MARCA' }).length, 1);
    assert.equal(filterAuditors(csvSampleAuditors, { query: 'HACCP' }).length, 1);
    assert.equal(filterAuditors(csvSampleAuditors, { query: '37.1' })[0].cedula_identidad, '7137643');
    assert.equal(filterAuditors(csvSampleAuditors, { query: '7137643' }).length, 1);
    assert.equal(filterAuditors(csvSampleAuditors, { query: '12310919' }).length, 1);
    assert.ok(buildAuditorSearchableText(csvSampleAuditors[1]).includes('Sector 9 y 38'));
  });

  it('renders 6 balanced List View columns (100% colgroup, 0 buttons in tbody), disambiguates Yurima Carrillo, and passes Zero-UUID', () => {
    const listHtml = renderAuditorView({
      profile: ADMIN_TEST_PROFILE,
      state: {
        selectedAuditorId: null,
        activeChildTab: 'competencias',
        query: '',
        selectedCalificacion: 'ALL',
        selectedStandard: 'ALL',
        selectedSectorIaf: 'ALL',
        viewMode: 'list',
        sortColumn: null,
        sortDirection: 'none',
        isEditingAttributes: false,
        isSidebarOpen: true,
        facetSelections: {},
      },
      auditors: csvSampleAuditors,
      normas: INITIAL_NORMAS,
      sectores: INITIAL_SECTORES_IAF,
      subsectores: INITIAL_SUBSECTORES_IAF,
    });

    assert.ok(listHtml.includes('table-fixed'));
    const colHeaders = listHtml.match(/data-col-header="[^"]+"/g) ?? [];
    assert.deepEqual(colHeaders, [
      'data-col-header="nombre"',
      'data-col-header="normas_acreditadas"',
      'data-col-header="sectores_iaf"',
      'data-col-header="contacto"',
      'data-col-header="evaluacion_in_situ"',
      'data-col-header="auditorias_count"',
    ]);

    const colWidths = [...listHtml.matchAll(/<col\b[^>]*style="width:\s*([\d.]+)%;"/g)].map((m) =>
      Number(m[1])
    );
    assert.equal(colWidths.length, 6);
    assert.ok(Math.abs(colWidths.reduce((a, b) => a + b, 0) - 100) < 0.05);

    const tbodyMatch = listHtml.match(/<tbody[\s\S]*?<\/tbody>/);
    assert.ok(tbodyMatch);
    assert.equal(/<button\b/i.test(tbodyMatch[0]), false);
    assert.ok(tbodyMatch[0].includes('data-action="select-auditor"'));

    // Homonyms disambiguated cleanly
    assert.ok(listHtml.includes('YC · C.I. 7137643'));
    assert.ok(listHtml.includes('YC · C.I. 12310919'));
    // Pending auditor sectors & complementary schemes
    assert.ok(listHtml.includes('Sin sectores asignados'));
    assert.ok(listHtml.includes('MARCA'));
    assert.ok(listHtml.includes('HACCP'));
    // Multi-contact (+1) counters
    assert.ok(listHtml.includes('(+1)'));
    // 5 reactive facets present
    assert.ok(listHtml.includes('data-facet-group="norma"'));
    assert.ok(listHtml.includes('data-facet-group="sector_iaf"'));
    assert.ok(listHtml.includes('data-facet-group="evaluacion_in_situ"'));
    assert.ok(listHtml.includes('data-facet-group="condicion_sectorial"'));
    assert.ok(listHtml.includes('data-facet-group="profesion"'));
    // RBAC + Zero-UUID
    assert.ok(listHtml.includes('data-action="open-create-auditor"'));
    assert.equal(assertZeroUuidExposure(listHtml).compliant, true);

    // Grid View cards + AUDITOR read-only RBAC
    const gridHtml = renderAuditorView({
      profile: { ...ADMIN_TEST_PROFILE, role: 'AUDITOR' },
      state: {
        selectedAuditorId: null,
        activeChildTab: 'competencias',
        query: '',
        selectedCalificacion: 'ALL',
        selectedStandard: 'ALL',
        selectedSectorIaf: 'ALL',
        viewMode: 'grid',
        sortColumn: null,
        sortDirection: 'none',
        isEditingAttributes: false,
        isSidebarOpen: true,
        facetSelections: { condicion_sectorial: new Set(['Requiere Experto Técnico']) },
      },
      auditors: csvSampleAuditors,
      normas: INITIAL_NORMAS,
      sectores: INITIAL_SECTORES_IAF,
      subsectores: INITIAL_SUBSECTORES_IAF,
    });
    assert.equal(gridHtml.includes('data-action="open-create-auditor"'), false);
    assert.ok(gridHtml.includes('Requiere Experto Técnico'));
    assert.ok(gridHtml.includes('Mostrando'));
    assert.equal(assertZeroUuidExposure(gridHtml).compliant, true);
  });
});

describe('Step 3.2 - Auditor Detail View (3 Zones, 4 Child Tabs, Archive/Restore, RBAC & Homonym Disambiguation)', () => {
  const jrpAuditor = INITIAL_AUDITORES_DETAILED[2]; // Has observacion_sectores with Experto Técnico + historial
  const baseTemplate = INITIAL_AUDITORES_DETAILED[0];

  const multiEvalAuditor: AuditorDetailEntity = {
    ...baseTemplate,
    id: '10000000-0000-0000-0000-000000000088',
    nombre: 'Félix Horacio Rojas Machado',
    siglas: 'FR',
    cedula_identidad: '4165827',
    profesion: 'INGENIERO QUÍMICO',
    esquemas_complementarios: 'MARCA / HACCP',
    anio_actualizacion_normas: 2024,
    anio_actualizacion_sectores: 2024,
    sistema_gestion_secundario: 'FSSC 22000',
    sin_registro_evaluacion: false,
    ultima_evaluacion_in_situ_fecha: '2024-11-01',
    proxima_evaluacion_in_situ_fecha: '2027-11-01',
    ultima_evaluacion_in_situ_texto: 'nov-24',
    proxima_evaluacion_in_situ_texto: 'nov-27',
    sector_area_evaluado_texto: '17 / 17.1',
    observaciones_evaluacion: 'Desempeño satisfactorio en testigo in situ',
    observacion_sectores: 'Sector 9 y 38 con Experto Técnico obligatorio.',
    telefonos: [
      {
        id: '1b100000-0000-0000-0000-000000000001',
        id_auditor: '10000000-0000-0000-0000-000000000088',
        telefono: '0414-5550101',
        tipo_telefono: 'Móvil',
        es_principal: true,
        deleted_at: null,
      },
      {
        id: '1b100000-0000-0000-0000-000000000002',
        id_auditor: '10000000-0000-0000-0000-000000000088',
        telefono: '0212-5550202',
        tipo_telefono: 'Oficina',
        es_principal: false,
        deleted_at: null,
      },
    ],
    emails: [
      {
        id: '1b200000-0000-0000-0000-000000000001',
        id_auditor: '10000000-0000-0000-0000-000000000088',
        email: 'admin@fondonorma.test',
        tipo_email: 'Principal',
        es_principal: true,
        deleted_at: null,
      },
      {
        id: '1b200000-0000-0000-0000-000000000002',
        id_auditor: '10000000-0000-0000-0000-000000000088',
        email: 'frojas.alt@fondonorma.org',
        tipo_email: 'Secundario',
        es_principal: false,
        deleted_at: null,
      },
    ],
    evaluaciones_in_situ: [
      {
        id: '1b300000-0000-0000-0000-000000000001',
        id_auditor: '10000000-0000-0000-0000-000000000088',
        etiqueta_periodo: 'Evaluación 1 (may-15)',
        norma_referencia: 'ISO 9001:2015',
        sector_area_evaluado: '14',
        ultima_evaluacion_fecha: '2015-05-01',
        proxima_evaluacion_fecha: '2018-05-01',
        ultima_evaluacion_texto: 'may-15',
        proxima_evaluacion_texto: 'may-18',
        observaciones: 'Primera evaluación testigo',
        deleted_at: null,
      },
      {
        id: '1b300000-0000-0000-0000-000000000002',
        id_auditor: '10000000-0000-0000-0000-000000000088',
        etiqueta_periodo: 'Evaluación 2 (nov-24)',
        norma_referencia: 'ISO 9001:2015',
        sector_area_evaluado: '17 / 17.1',
        ultima_evaluacion_fecha: '2024-11-01',
        proxima_evaluacion_fecha: '2027-11-01',
        ultima_evaluacion_texto: 'nov-24',
        proxima_evaluacion_texto: 'nov-27',
        observaciones: 'Renovación periódica',
        deleted_at: null,
      },
    ],
    historialAuditorias: jrpAuditor.historialAuditorias.length > 0
      ? jrpAuditor.historialAuditorias
      : [
          {
            id: '1b400000-0000-0000-0000-000000000001',
            codigo_auditoria: 'AUD-2026-009',
            numero_certificado: 'FN-9001-2026',
            organizacion_nombre: 'Industrias Ejemplo C.A.',
            tipo_auditoria: 'Seguimiento 1',
            metodologia: 'Presencial',
            rol_en_auditoria: 'AUDITOR_LIDER',
            fecha_ejecucion: '2026-05-12',
            estatus: 'Completada',
          },
        ],
  };

  it('sorts evaluaciones in situ chronologically (newest first) and formats homonym selector labels', () => {
    const sorted = sortEvaluacionesInSituChronological(multiEvalAuditor.evaluaciones_in_situ);
    assert.equal(sorted.length, 2);
    assert.equal(sorted[0].etiqueta_periodo, 'Evaluación 2 (nov-24)');
    assert.equal(sorted[1].etiqueta_periodo, 'Evaluación 1 (may-15)');

    const label = formatAuditorSelectorLabel({
      nombre: 'Yurima Carrillo',
      siglas: 'YC',
      cedula_identidad: '12310919',
    });
    assert.equal(label, 'Yurima Carrillo (YC · C.I. 12310919)');
  });

  it('renders 3-zone Detail View in read, add, and edit modes with Experto Técnico alert and archive/restore RBAC', () => {
    const baseState = {
      selectedAuditorId: multiEvalAuditor.id,
      activeChildTab: 'competencias' as const,
      query: '',
      selectedCalificacion: 'ALL' as const,
      selectedStandard: 'ALL',
      selectedSectorIaf: 'ALL',
      viewMode: 'list' as const,
      sortColumn: null,
      sortDirection: 'none' as const,
      isEditingAttributes: false,
    };

    const readHtml = renderAuditorView({
      profile: ADMIN_TEST_PROFILE,
      state: baseState,
      auditors: [multiEvalAuditor],
      normas: INITIAL_NORMAS,
      sectores: INITIAL_SECTORES_IAF,
      subsectores: INITIAL_SUBSECTORES_IAF,
      authUserEmail: 'admin@fondonorma.test',
    });
    assert.ok(readHtml.includes('FR · C.I. 4165827'));
    assert.ok(readHtml.includes('Identidad'));
    assert.ok(readHtml.includes('Calificación Normativa y Sectorial'));
    assert.ok(readHtml.includes('Resumen de Evaluación In Situ'));
    assert.ok(readHtml.includes('Acompañamiento Obligatorio con Experto Técnico'));
    assert.ok(readHtml.includes('Sectores IAF 9, 38'));
    assert.ok(readHtml.includes('id="startEditAuditorBtn"'));
    assert.ok(readHtml.includes('data-archive-table="auditor"'));
    assert.ok(readHtml.includes('data-auditor-tab="competencias"'));
    assert.ok(readHtml.includes('data-auditor-tab="contacto"'));
    assert.ok(readHtml.includes('data-auditor-tab="evaluaciones"'));
    assert.ok(readHtml.includes('data-auditor-tab="historial"'));
    assert.equal(assertZeroUuidExposure(readHtml).compliant, true);

    const addHtml = renderAuditorView({
      profile: ADMIN_TEST_PROFILE,
      state: {
        ...baseState,
        selectedAuditorId: null,
        isCreating: true,
        editErrorMessage: 'Ya existe un auditor activo con esa cédula de identidad.',
      },
      auditors: [multiEvalAuditor],
      normas: INITIAL_NORMAS,
      sectores: INITIAL_SECTORES_IAF,
      subsectores: INITIAL_SUBSECTORES_IAF,
    });
    assert.ok(addHtml.includes('Nuevo Auditor'));
    assert.ok(addHtml.includes('id="auditorDetailForm"'));
    assert.ok(addHtml.includes('id="auditorNombreInput"'));
    assert.ok(addHtml.includes('id="auditorSiglasInput"'));
    assert.ok(addHtml.includes('id="auditorCedulaInput"'));
    assert.ok(addHtml.includes('id="auditorObsSectoresInput"'));
    assert.ok(addHtml.includes('id="saveAuditorFormBtn"'));
    assert.ok(addHtml.includes('Ya existe un auditor activo con esa cédula de identidad.'));
    assert.equal(addHtml.includes('data-auditor-tab='), false);
    assert.equal(assertZeroUuidExposure(addHtml).compliant, true);

    const archivedHtmlAdmin = renderAuditorView({
      profile: ADMIN_TEST_PROFILE,
      state: baseState,
      auditors: [{ ...multiEvalAuditor, deleted_at: '2026-06-01T00:00:00Z' }],
      normas: INITIAL_NORMAS,
      sectores: INITIAL_SECTORES_IAF,
      subsectores: INITIAL_SUBSECTORES_IAF,
    });
    assert.ok(archivedHtmlAdmin.includes('Archivado'));
    assert.ok(archivedHtmlAdmin.includes('data-action="restore-archived-record"'));
    assert.equal(archivedHtmlAdmin.includes('id="startEditAuditorBtn"'), false);

    const archivedHtmlWorker = renderAuditorView({
      profile: { ...ADMIN_TEST_PROFILE, role: 'WORKER' },
      state: baseState,
      auditors: [{ ...multiEvalAuditor, deleted_at: '2026-06-01T00:00:00Z' }],
      normas: INITIAL_NORMAS,
      sectores: INITIAL_SECTORES_IAF,
      subsectores: INITIAL_SUBSECTORES_IAF,
    });
    assert.equal(archivedHtmlWorker.includes('data-action="restore-archived-record"'), false);
  });

  it('renders Contacto, Evaluaciones In Situ, and Historial child tabs cleanly and enforces strict read-only RBAC for AUDITOR & CLIENT', () => {
    const baseState = {
      selectedAuditorId: multiEvalAuditor.id,
      activeChildTab: 'contacto' as const,
      query: '',
      selectedCalificacion: 'ALL' as const,
      selectedStandard: 'ALL',
      selectedSectorIaf: 'ALL',
      viewMode: 'list' as const,
      sortColumn: null,
      sortDirection: 'none' as const,
      isEditingAttributes: false,
    };

    const contactoHtml = renderAuditorView({
      profile: ADMIN_TEST_PROFILE,
      state: {
        ...baseState,
        activeChildTab: 'contacto',
        isAddingTelefono: true,
        isAddingEmail: true,
      },
      auditors: [multiEvalAuditor],
      normas: INITIAL_NORMAS,
      sectores: INITIAL_SECTORES_IAF,
      subsectores: INITIAL_SUBSECTORES_IAF,
      authUserEmail: 'admin@fondonorma.test',
    });
    assert.ok(contactoHtml.includes('id="auditorTelefonoForm"'));
    assert.ok(contactoHtml.includes('id="auditorEmailForm"'));
    assert.ok(contactoHtml.includes('0414-5550101'));
    assert.ok(contactoHtml.includes('Correo vinculado al acceso Auth'));
    assert.ok(contactoHtml.includes('data-action="set-primary-auditor-telefono"'));
    assert.ok(contactoHtml.includes('data-action="archive-auditor-email"'));
    assert.equal(assertZeroUuidExposure(contactoHtml).compliant, true);

    const evalHtml = renderAuditorView({
      profile: ADMIN_TEST_PROFILE,
      state: {
        ...baseState,
        activeChildTab: 'evaluaciones',
        isAddingEvaluacion: true,
      },
      auditors: [multiEvalAuditor],
      normas: INITIAL_NORMAS,
      sectores: INITIAL_SECTORES_IAF,
      subsectores: INITIAL_SUBSECTORES_IAF,
    });
    assert.ok(evalHtml.includes('id="auditorEvaluacionForm"'));
    assert.ok(evalHtml.includes('Evaluación 2 (nov-24)'));
    assert.ok(evalHtml.includes('Evaluación 1 (may-15)'));
    assert.ok(evalHtml.includes('data-action="toggle-auditor-sin-registro"'));
    assert.ok(evalHtml.includes('data-action="archive-auditor-evaluacion"'));
    assert.equal(assertZeroUuidExposure(evalHtml).compliant, true);

    const histHtml = renderAuditorView({
      profile: ADMIN_TEST_PROFILE,
      state: {
        ...baseState,
        activeChildTab: 'historial',
      },
      auditors: [multiEvalAuditor],
      normas: INITIAL_NORMAS,
      sectores: INITIAL_SECTORES_IAF,
      subsectores: INITIAL_SUBSECTORES_IAF,
    });
    assert.ok(histHtml.includes('data-resizable-table="auditor-tab-historial"'));
    assert.ok(histHtml.includes('table-fixed'));
    const colWidths = [...histHtml.matchAll(/<col\b[^>]*style="width:\s*([\d.]+)%;"/g)].map((m) =>
      Number(m[1])
    );
    assert.ok(colWidths.length >= 6);
    assert.ok(Math.abs(colWidths.reduce((a, b) => a + b, 0) - 100) < 0.05);
    const tbodyMatch = histHtml.match(/<tbody[\s\S]*?<\/tbody>/);
    assert.ok(tbodyMatch);
    assert.equal(/<button\b/i.test(tbodyMatch[0]), false);
    assert.ok(tbodyMatch[0].includes('data-action="select-prog-audit-by-code"'));
    assert.equal(assertZeroUuidExposure(histHtml).compliant, true);

    for (const readonlyRole of ['AUDITOR', 'CLIENT'] as const) {
      for (const tab of ['competencias', 'contacto', 'evaluaciones', 'historial'] as const) {
        const roHtml = renderAuditorView({
          profile: { ...ADMIN_TEST_PROFILE, role: readonlyRole },
          state: { ...baseState, activeChildTab: tab },
          auditors: [multiEvalAuditor],
          normas: INITIAL_NORMAS,
          sectores: INITIAL_SECTORES_IAF,
          subsectores: INITIAL_SUBSECTORES_IAF,
        });
        assert.equal(roHtml.includes('id="startEditAuditorBtn"'), false);
        assert.equal(roHtml.includes('data-archive-table="auditor"'), false);
        assert.equal(roHtml.includes('data-action="open-add-competency"'), false);
        assert.equal(roHtml.includes('data-action="open-add-auditor-telefono"'), false);
        assert.equal(roHtml.includes('data-action="open-add-auditor-email"'), false);
        assert.equal(roHtml.includes('data-action="archive-auditor-telefono"'), false);
        assert.equal(roHtml.includes('data-action="archive-auditor-email"'), false);
        assert.equal(roHtml.includes('data-action="open-add-auditor-evaluacion"'), false);
        assert.equal(roHtml.includes('data-action="toggle-auditor-sin-registro"'), false);
        assert.equal(roHtml.includes('data-action="archive-auditor-evaluacion"'), false);
      }
    }
  });

  it('disambiguates homonymous auditors in CompetenciaAuditorView selector and chip', () => {
    const yc1: AuditorDetailEntity = {
      ...baseTemplate,
      id: '10000000-0000-0000-0000-000000000091',
      nombre: 'Yurima Carrillo',
      siglas: 'YC',
      cedula_identidad: '7137643',
      codigo_credencial: 'YC',
    };
    const yc2: AuditorDetailEntity = {
      ...baseTemplate,
      id: '10000000-0000-0000-0000-000000000092',
      nombre: 'Yurima Carrillo',
      siglas: 'YC',
      cedula_identidad: '12310919',
      codigo_credencial: 'YC',
    };

    const addCompHtml = renderCompetenciaAuditorView({
      profile: ADMIN_TEST_PROFILE,
      state: {
        isOpen: true,
        mode: 'add',
        prefillAuditorId: yc2.id,
        formDraft: {
          id_auditor: yc2.id,
          tipo: 'norma',
          id_norma: '',
          id_sector_iaf: '',
          id_subsector_iaf: '',
        },
      },
      auditors: [yc1, yc2],
      normas: INITIAL_NORMAS,
      sectores: INITIAL_SECTORES_IAF,
      subsectores: INITIAL_SUBSECTORES_IAF,
    });
    assert.ok(addCompHtml.includes('Yurima Carrillo (YC · C.I. 7137643)'));
    assert.ok(addCompHtml.includes('Yurima Carrillo (YC · C.I. 12310919)'));
    assert.equal(assertZeroUuidExposure(addCompHtml).compliant, true);

    const readCompHtml = renderCompetenciaAuditorView({
      profile: ADMIN_TEST_PROFILE,
      state: {
        isOpen: true,
        mode: 'read',
        selectedComp: {
          id_auditor: yc2.id,
          tipo: 'norma',
          targetId: INITIAL_NORMAS[0].id,
        },
      },
      auditors: [yc1, yc2],
      normas: INITIAL_NORMAS,
      sectores: INITIAL_SECTORES_IAF,
      subsectores: INITIAL_SUBSECTORES_IAF,
    });
    assert.ok(readCompHtml.includes('Yurima Carrillo (YC · C.I. 12310919)'));
    assert.equal(assertZeroUuidExposure(readCompHtml).compliant, true);
  });

  it('derives historialAuditorias from programacionAudits and renders edit mode cleanly', () => {
    const baseTemplate = INITIAL_AUDITORES_DETAILED[0];
    const enriched = enrichAuditorsWithHistorial(
      [
        { ...baseTemplate, id: '10000000-0000-0000-0000-000000000001', historialAuditorias: [] },
        { ...baseTemplate, id: '10000000-0000-0000-0000-000000000004', historialAuditorias: [] },
      ],
      [
        {
          id: '80000000-0000-0000-0000-000000000002',
          codigo_auditoria: 'AUD-2024-002',
          organizacion_nombre: 'CyberCloud Solutions S.L.',
          numero_certificado: 'FN-EMS-2024-002',
          norma_codigo: 'ISO 14001:2015',
          tipo_auditoria: 'Etapa 1',
          metodologia: 'Remota',
          fecha_inicio: '2024-11-19',
          estatus: 'En Ejecución',
          auditor_lider_id: '10000000-0000-0000-0000-000000000001',
          equipo: [
            { id_auditor: '10000000-0000-0000-0000-000000000001', rol: 'Auditor Líder' },
            { id_auditor: '10000000-0000-0000-0000-000000000004', rol: 'Auditor de Equipo' },
          ],
        },
        {
          id: '80000000-0000-0000-0000-000000000099',
          codigo_auditoria: 'AUD-2024-099',
          organizacion_nombre: 'Empresa Archivada S.A.',
          numero_certificado: 'FN-QMS-2024-099',
          norma_codigo: 'ISO 9001:2015',
          tipo_auditoria: 'Seguimiento 1',
          metodologia: 'Presencial',
          fecha_inicio: '2024-10-01',
          estatus: 'Cerrado',
          auditor_lider_id: '10000000-0000-0000-0000-000000000001',
          equipo: [],
          deleted_at: '2024-11-01T00:00:00Z',
        },
      ]
    );

    assert.equal(enriched[0].historialAuditorias.length, 1);
    assert.equal(enriched[0].historialAuditorias[0].rol_en_auditoria, 'Auditor Líder');
    assert.equal(enriched[0].historialAuditorias[0].estatus, 'En Ejecución');
    assert.equal(enriched[1].historialAuditorias.length, 1);
    assert.equal(enriched[1].historialAuditorias[0].rol_en_auditoria, 'Auditor de Equipo');

    const histHtml = renderAuditorView({
      profile: ADMIN_TEST_PROFILE,
      state: {
        selectedAuditorId: enriched[1].id,
        activeChildTab: 'historial',
        query: '',
        selectedCalificacion: 'ALL',
        selectedStandard: 'ALL',
        selectedSectorIaf: 'ALL',
        viewMode: 'list',
        sortColumn: null,
        sortDirection: 'none',
        isEditingAttributes: false,
      },
      auditors: enriched,
      normas: INITIAL_NORMAS,
      sectores: INITIAL_SECTORES_IAF,
      subsectores: INITIAL_SUBSECTORES_IAF,
    });
    assert.ok(histHtml.includes('CyberCloud'));
    assert.ok(histHtml.includes('FN-EMS-2024-002'));
    assert.ok(histHtml.includes('data-action="select-prog-audit-by-code"'));
    assert.equal(assertZeroUuidExposure(histHtml).compliant, true);

    const editHtml = renderAuditorView({
      profile: ADMIN_TEST_PROFILE,
      state: {
        selectedAuditorId: enriched[0].id,
        activeChildTab: 'competencias',
        query: '',
        selectedCalificacion: 'ALL',
        selectedStandard: 'ALL',
        selectedSectorIaf: 'ALL',
        viewMode: 'list',
        sortColumn: null,
        sortDirection: 'none',
        isEditingAttributes: true,
      },
      auditors: enriched,
      normas: INITIAL_NORMAS,
      sectores: INITIAL_SECTORES_IAF,
      subsectores: INITIAL_SUBSECTORES_IAF,
    });
    assert.ok(editHtml.includes('id="auditorDetailForm"'));
    assert.ok(editHtml.includes('id="saveAuditorFormBtn"'));
    assert.ok(editHtml.includes('id="cancelEditAuditorBtn"'));
    assert.ok(editHtml.includes(enriched[0].nombre));
    assert.equal(assertZeroUuidExposure(editHtml).compliant, true);
  });
});

describe('Step 4.1 - Homonym Display Labels & Live Multi-Site Historial Sync', () => {
  it('formats disambiguated labels via formatAuditorDisplayLabel with options and detects homonyms', () => {
    const yc1 = {
      id: '10000000-0000-0000-0000-000000000045',
      nombre: 'Yurima Carrillo',
      siglas: 'YC',
      cedula_identidad: '7137643',
    };
    const yc2 = {
      id: '10000000-0000-0000-0000-000000000047',
      nombre: 'Yurima Carrillo',
      siglas: 'YC',
      cedula_identidad: '12310919',
    };

    assert.equal(formatAuditorDisplayLabel(yc1), 'Yurima Carrillo (YC · C.I. 7137643)');
    assert.equal(formatAuditorDisplayLabel(yc2), 'Yurima Carrillo (YC · C.I. 12310919)');
    assert.equal(
      formatAuditorDisplayLabel(yc1, { includeSiglas: false }),
      'Yurima Carrillo (C.I. 7137643)'
    );
    assert.equal(
      formatAuditorDisplayLabel(yc1, { includeCedula: false }),
      'Yurima Carrillo (YC)'
    );
    assert.equal(formatAuditorDisplayLabel({ nombre: 'Sin Metadatos' }), 'Sin Metadatos');

    const dups = detectDuplicateAuditorNames([
      yc1,
      yc2,
      { nombre: 'Keyla Soteldo' },
    ]);
    assert.equal(dups.has('yurima carrillo'), true);
    assert.equal(dups.has('keyla soteldo'), false);
  });

  it('derives deduplicated historial from sitiosPlan[].equipoSitio, preserves Auditor Líder precedence, and drops removed live audits', () => {
    const baseTemplate = INITIAL_AUDITORES_DETAILED[0];
    const audLeadId = '10000000-0000-0000-0000-000000000045';
    const audRemovedId = '10000000-0000-0000-0000-000000000047';

    const liveAudit = {
      id: '80000000-0000-0000-0000-000000000401',
      codigo_auditoria: 'AUD-2026-401',
      organizacion_nombre: 'Farmacéutica Caracas C.A.',
      numero_certificado: 'FN-QMS-2026-401',
      norma_codigo: 'ISO 9001:2015',
      tipo_auditoria: 'Seguimiento 1',
      metodologia: 'Presencial',
      fecha_inicio: '2026-10-12',
      estatus: 'Planificada',
      auditor_lider_id: '',
      equipo: [],
      sitiosPlan: [
        {
          deleted_at: null,
          equipoSitio: [
            { id_auditor: audLeadId, rol_auditor: 'AUDITOR', deleted_at: null },
            { id_auditor: audRemovedId, rol_auditor: 'AUDITOR', deleted_at: '2026-10-01T00:00:00Z' },
          ],
        },
        {
          deleted_at: null,
          equipoSitio: [
            { id_auditor: audLeadId, rol_auditor: 'AUDITOR_LIDER', deleted_at: null },
          ],
        },
      ],
    };

    const derived = deriveAuditorHistorialFromAudits([liveAudit]);
    assert.equal(derived.get(audLeadId)?.length, 1);
    assert.equal(derived.get(audLeadId)?.[0].rol_en_auditoria, 'Auditor Líder');
    assert.equal(derived.get(audRemovedId), undefined);

    const auditorsInput: AuditorDetailEntity[] = [
      { ...baseTemplate, id: audLeadId, historialAuditorias: [] },
      {
        ...baseTemplate,
        id: audRemovedId,
        historialAuditorias: [
          {
            id: '80000000-0000-0000-0000-000000000401',
            id_auditor: audRemovedId,
            codigo_auditoria: 'AUD-2026-401',
            organizacion_nombre: 'Farmacéutica Caracas C.A.',
            numero_certificado: 'FN-QMS-2026-401',
            norma_codigo: 'ISO 9001:2015',
            tipo_auditoria: 'Seguimiento 1',
            metodologia: 'Presencial',
            rol_en_auditoria: 'Auditor de Equipo',
            fecha_ejecucion: '2026-10-12',
            estatus: 'Planificada',
          },
        ],
      },
    ];

    const enriched = enrichAuditorsWithHistorial(auditorsInput, [liveAudit]);
    assert.equal(enriched[0].historialAuditorias.length, 1);
    assert.equal(enriched[0].historialAuditorias[0].codigo_auditoria, 'AUD-2026-401');
    // Unassigned auditor must have live audit removed cleanly instead of sticking around stale
    assert.equal(enriched[1].historialAuditorias.length, 0);
  });
});




