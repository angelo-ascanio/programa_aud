import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  isPrincipalSite,
  countMultisiteBranches,
  formatMultisiteBranchCountText,
  sortSitesWithPrincipalFirst,
  validateAlcance,
  validateCertificadoEditInput,
  validateJustificacionNoAplicable,
  getProcessTypeVisual,
  getFechaTipoVisual,
  getFechaTemporalStatus,
  formatContactPhonesSummary,
  formatContactEmailsSummary,
  deriveCertificateVigenciaDates,
  CANONICAL_TIPO_FECHA_VALUES,
  filterCertificates,
  INITIAL_CERTIFICADOS_DETAILED,
  type SiteEntity,
} from './multisiteSampling';
import { assertZeroUuidExposure } from './zeroUuid';

describe('Phase 4.2 - Multisite Sampling & Site 0 Placement Rules', () => {
  it('correctly identifies Site 0 as the principal headquarters', () => {
    assert.strictEqual(isPrincipalSite({ numero_sitio: 0 }), true);
    assert.strictEqual(isPrincipalSite({ numero_sitio: 1 }), false);
    assert.strictEqual(isPrincipalSite({ numero_sitio: 2 }), false);
  });

  it('calculates multisite branch counts strictly excluding Site 0 (headquarters)', () => {
    const sitesSingleHq = [{ numero_sitio: 0 }];
    assert.strictEqual(countMultisiteBranches(sitesSingleHq), 0);

    const sitesWithBranches = [
      { numero_sitio: 0 },
      { numero_sitio: 1 },
      { numero_sitio: 2 },
    ];
    // 3 total sites: 1 HQ (site 0) + 2 branches (site 1, 2) => branch count is 2!
    assert.strictEqual(countMultisiteBranches(sitesWithBranches), 2);

    const sitesBranchesOnly = [{ numero_sitio: 1 }, { numero_sitio: 3 }];
    assert.strictEqual(countMultisiteBranches(sitesBranchesOnly), 2);

    assert.strictEqual(countMultisiteBranches([]), 0);
  });

  it('formats multisite branch counts with clear Spanish typography', () => {
    assert.strictEqual(formatMultisiteBranchCountText(0), '0 sedes multisitio');
    assert.strictEqual(formatMultisiteBranchCountText(1), '1 sede multisitio');
    assert.strictEqual(formatMultisiteBranchCountText(3), '3 sedes multisitio');
  });

  it('guarantees Site 0 (headquarters) is positioned at index 0 in sorted arrays', () => {
    const unorderedSites: Array<{ numero_sitio: number; nombre: string }> = [
      { numero_sitio: 3, nombre: 'Centro Logístico' },
      { numero_sitio: 1, nombre: 'Planta de Ensamblaje' },
      { numero_sitio: 0, nombre: 'Sede Principal HQ' },
      { numero_sitio: 2, nombre: 'Depósito Auxiliar' },
    ];

    const sorted = sortSitesWithPrincipalFirst(unorderedSites);

    assert.strictEqual(sorted[0].numero_sitio, 0);
    assert.strictEqual(sorted[0].nombre, 'Sede Principal HQ');
    assert.strictEqual(sorted[1].numero_sitio, 1);
    assert.strictEqual(sorted[2].numero_sitio, 2);
    assert.strictEqual(sorted[3].numero_sitio, 3);
  });

  it('handles site arrays without Site 0 gracefully by preserving numeric order', () => {
    const branchOnlySites = [
      { numero_sitio: 5, nombre: 'Sucursal 5' },
      { numero_sitio: 2, nombre: 'Sucursal 2' },
    ];
    const sorted = sortSitesWithPrincipalFirst(branchOnlySites);
    assert.strictEqual(sorted[0].numero_sitio, 2);
    assert.strictEqual(sorted[1].numero_sitio, 5);
    // Ensure original array is not mutated
    assert.strictEqual(branchOnlySites[0].numero_sitio, 5);
  });

  it('verifies every seeded certificate in INITIAL_CERTIFICADOS_DETAILED enforces Site 0 principal site and accurate branch count', () => {
    for (const cert of INITIAL_CERTIFICADOS_DETAILED) {
      const sorted = sortSitesWithPrincipalFirst(cert.sitios);
      assert.ok(sorted.length >= 1, `${cert.numero_certificado} must have at least Site 0`);
      assert.strictEqual(isPrincipalSite(sorted[0]), true, `${cert.numero_certificado} index 0 must be Site 0`);
      const branches = countMultisiteBranches(cert.sitios);
      assert.strictEqual(branches, cert.sitios.length - 1);
      if (cert.multisitio) {
        assert.ok(branches >= 1, `Multisite cert ${cert.numero_certificado} must have >= 1 branch besides Site 0`);
      } else {
        assert.strictEqual(branches, 0, `Single-site cert ${cert.numero_certificado} must have 0 branches`);
      }
    }
  });
});

describe('Phase 4.2 - Alcance Character Counter & Validation', () => {
  it('rejects certification scopes with fewer than 10 characters', () => {
    const res = validateAlcance('Corta');
    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.length, 5);
    assert.ok(res.error?.includes('al menos 10 caracteres'));
  });

  it('accepts valid certification scopes between 10 and 1000 characters', () => {
    const validScope =
      'Diseño, manufactura, estampado, fundición y comercialización de piezas metálicas y componentes troquelados.';
    const res = validateAlcance(validScope);
    assert.strictEqual(res.valid, true);
    assert.strictEqual(res.length, validScope.length);
    assert.strictEqual(res.error, undefined);
  });

  it('rejects certification scopes that exceed 1000 characters', () => {
    const overlyLong = 'A'.repeat(1005);
    const res = validateAlcance(overlyLong);
    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.length, 1005);
    assert.ok(res.error?.includes('no puede exceder los 1000 caracteres'));
  });
});

describe('Phase 4.2 - Non-Applicability Justification Requirements', () => {
  it('enforces mandatory non-empty justification for excluded ISO clauses', () => {
    const emptyRes = validateJustificacionNoAplicable('');
    assert.strictEqual(emptyRes.valid, false);
    assert.ok(emptyRes.error?.includes('obligatoria'));

    const whitespaceRes = validateJustificacionNoAplicable('     \t\n  ');
    assert.strictEqual(whitespaceRes.valid, false);

    const shortRes = validateJustificacionNoAplicable('N/A');
    assert.strictEqual(shortRes.valid, false);

    const fourCharsRes = validateJustificacionNoAplicable('ABCD');
    assert.strictEqual(fourCharsRes.valid, false);

    const exactMinRes = validateJustificacionNoAplicable('ABCDE');
    assert.strictEqual(exactMinRes.valid, true);

    const validRes = validateJustificacionNoAplicable(
      'La organización no realiza diseño ni desarrollo de productos; la fabricación se ejecuta bajo especificaciones provistas por los clientes.'
    );
    assert.strictEqual(validRes.valid, true);
    assert.strictEqual(validRes.error, undefined);
  });

  it('validates all seeded non-applicable exclusions in INITIAL_CERTIFICADOS_DETAILED', () => {
    const exclusions = INITIAL_CERTIFICADOS_DETAILED.flatMap((c) => c.noAplicables);
    assert.ok(exclusions.length >= 2);
    for (const excl of exclusions) {
      const check = validateJustificacionNoAplicable(excl.justificacion);
      assert.strictEqual(check.valid, true, `Invalid justification on ${excl.requisito_codigo}`);
    }
  });
});

describe('Phase 4.2 - Process Classification Badges', () => {
  it('provides visual metadata for all 4 canonical process types', () => {
    const estrategico = getProcessTypeVisual('Estratégico');
    assert.strictEqual(estrategico.label, 'Estratégico');
    assert.ok(estrategico.badgeClass.includes('purple'));

    const medular = getProcessTypeVisual('Medular');
    assert.strictEqual(medular.label, 'Medular');
    assert.ok(medular.badgeClass.includes('sky'));

    const apoyo = getProcessTypeVisual('De Apoyo');
    assert.strictEqual(apoyo.label, 'De Apoyo');
    assert.ok(apoyo.badgeClass.includes('teal'));

    const otro = getProcessTypeVisual('Otro');
    assert.strictEqual(otro.label, 'Otro');
  });
});

describe('Phase 4.2 - Certificate Filtering & Multi-Facet Exploration', () => {
  it('filters certificates by certificate code and standard', () => {
    const byCode = filterCertificates(INITIAL_CERTIFICADOS_DETAILED, {
      query: 'FN-QMS-2024-001',
    });
    assert.strictEqual(byCode.length, 1);
    assert.strictEqual(byCode[0].numero_certificado, 'FN-QMS-2024-001');

    const byStandard = filterCertificates(INITIAL_CERTIFICADOS_DETAILED, {
      selectedStandard: 'ISO 9001:2015',
    });
    assert.strictEqual(byStandard.length, 1);
    assert.strictEqual(byStandard[0].norma_codigo, 'ISO 9001:2015');
  });

  it('filters certificates by operational status', () => {
    const activos = filterCertificates(INITIAL_CERTIFICADOS_DETAILED, {
      selectedStatus: 'Activo',
    });
    assert.strictEqual(activos.length, 2);
    assert.ok(activos.every((c) => c.estatus === 'Activo'));

    const suspendidos = filterCertificates(INITIAL_CERTIFICADOS_DETAILED, {
      selectedStatus: 'Suspendido',
    });
    assert.strictEqual(suspendidos.length, 1);
    assert.strictEqual(suspendidos[0].numero_certificado, 'FN-OHS-2023-018');
  });

  it('filters certificates by sector IAF', () => {
    const sector17 = filterCertificates(INITIAL_CERTIFICADOS_DETAILED, {
      selectedSectorIaf: '17',
    });
    assert.strictEqual(sector17.length, 1);
    assert.strictEqual(sector17[0].sector_iaf, 17);
  });
});

describe('Phase 4.2 - Zero-UUID Exposure Compliance & Clean List Rule', () => {
  it('ensures sample certificate records contain human-readable names and codes', () => {
    for (const cert of INITIAL_CERTIFICADOS_DETAILED) {
      assert.ok(cert.organizacion_nombre.length > 0);
      assert.ok(cert.norma_codigo.length > 0);
      assert.ok(cert.sector_iaf_descripcion.length > 0);
      assert.ok(cert.numero_certificado.startsWith('FN-'));
    }
  });

  it('strictly excludes the Cobertura Normativa column from the clean certificate list table', async () => {
    const { renderCertificadoView } = await import('../views/certificadoView');
    const mockProfile = {
      id: 'mock-user-1',
      role: 'ADMIN' as const,
      status: 'APPROVED' as const,
      nombre: 'Administrador Principal',
    };

    const listHtml = renderCertificadoView({
      profile: mockProfile,
      state: {
        selectedCertId: null,
        activeChildTab: 'sitios',
        query: '',
        selectedStandard: 'ALL',
        selectedStatus: 'ALL',
        selectedSectorIaf: 'ALL',
        viewMode: 'list',
        sortColumn: null,
        sortDirection: 'none',
        isEditingAttributes: false,
      },
      certificates: INITIAL_CERTIFICADOS_DETAILED,
      loading: false,
    });

    // Verify "Cobertura Normativa" or "Cobertura ISO" column is strictly excluded from list view
    assert.strictEqual(
      listHtml.includes('Cobertura Normativa'),
      false,
      'List table must not contain Cobertura Normativa'
    );
    assert.strictEqual(
      listHtml.includes('Cobertura ISO'),
      false,
      'List table must not contain Cobertura ISO'
    );

    // Verify required clean 6 columns are present and Acciones is absent
    assert.ok(listHtml.includes('Organización'));
    assert.ok(listHtml.includes('Código de Certificado'));
    assert.ok(listHtml.includes('Norma'));
    assert.ok(listHtml.includes('Sedes Multisitio'));
    assert.ok(listHtml.includes('Estatus'));
    assert.ok(listHtml.includes('Vigencia'));
    assert.strictEqual(listHtml.includes('data-col-header="acciones"'), false);
    assert.strictEqual(listHtml.includes('view-org-from-cert'), false);

    // Single type="text" search bar (zero native type="search" double-X) + reactive Multi View totalizer
    assert.strictEqual(/type=["']search["']/i.test(listHtml), false);
    assert.ok(listHtml.includes('type="text"'));
    assert.ok(listHtml.includes('Mostrando'));

    // Zero-UUID check
    const listCheck = assertZeroUuidExposure(listHtml);
    assert.strictEqual(listCheck.compliant, true, `List view exposed raw UUIDs: ${listCheck.exposedUuids.join(', ')}`);
  });

  it('renders Standardized 3-Zone detail view with 5 specialized child tabs adhering to Zero-UUID mandate', async () => {
    const { renderCertificadoView } = await import('../views/certificadoView');
    const mockProfile = {
      id: 'mock-user-1',
      role: 'ADMIN' as const,
      status: 'APPROVED' as const,
      nombre: 'Administrador Principal',
    };

    const detailHtml = renderCertificadoView({
      profile: mockProfile,
      state: {
        selectedCertId: '40000000-0000-0000-0000-000000000001',
        activeChildTab: 'sitios',
        query: '',
        selectedStandard: 'ALL',
        selectedStatus: 'ALL',
        selectedSectorIaf: 'ALL',
        viewMode: 'grid',
        sortColumn: null,
        sortDirection: 'none',
        isEditingAttributes: false,
      },
      certificates: INITIAL_CERTIFICADOS_DETAILED,
      loading: false,
    });

    // Check Standardized 3-Zone Architecture (Parent Zone -> Divider -> Record Zone -> List-only Child Tabs)
    assert.ok(detailHtml.includes('aria-label="Contexto y relaciones superiores"'));
    assert.ok(detailHtml.includes('data-parent-nav="true"'));
    assert.ok(detailHtml.includes('<hr class="border-t border-slate-200 my-2.5 sm:my-3" />'));
    assert.ok(detailHtml.includes('aria-label="Detalle del registro"'));
    assert.ok(detailHtml.includes('role="tablist"'));
    assert.ok(!detailHtml.includes('ZONA 1:'));
    assert.ok(!detailHtml.includes('ZONA 2:'));
    assert.ok(!detailHtml.includes('ZONA 3:'));
    assert.ok(!detailHtml.includes('ZONA 4:'));

    // Step 2.2: Parent Zone strict 5-FK order (Organización -> Norma -> Estatus -> Sector IAF -> Sub-Sector IAF)
    const parentSectionMatch = detailHtml.match(/<section aria-label="Contexto y relaciones superiores"[\s\S]*?<\/section>/);
    assert.ok(parentSectionMatch);
    const parentHtml = parentSectionMatch[0];
    const orgPos = parentHtml.indexOf('data-parent-type="org"');
    const normaPos = parentHtml.indexOf('data-parent-type="norma"');
    const estatusPos = parentHtml.indexOf('data-parent-type="estatus"');
    const sectorPos = parentHtml.indexOf('data-parent-type="sector_iaf"');
    const subsectorPos = parentHtml.indexOf('Sub-Sector IAF');
    assert.ok(
      orgPos > 0 && normaPos > orgPos && estatusPos > normaPos && sectorPos > estatusPos && subsectorPos > sectorPos
    );

    // Step 1: Direct Data Zone strictly shows numero_certificado, multisitio, alcance only
    const recordSectionMatch = detailHtml.match(/<section aria-label="Detalle del registro"[\s\S]*?<\/section>/);
    assert.ok(recordSectionMatch);
    assert.ok(recordSectionMatch[0].includes('Número de Certificado'));
    assert.ok(recordSectionMatch[0].includes('Esquema Multisitio'));
    assert.ok(recordSectionMatch[0].includes('Alcance de la Certificación'));
    assert.equal(recordSectionMatch[0].includes('Fecha de Emisión'), false);
    assert.equal(recordSectionMatch[0].includes('Fecha de Vencimiento'), false);
    assert.equal(recordSectionMatch[0].includes('Organismo Acreditador'), false);
    assert.equal(recordSectionMatch[0].includes('Sub-Sector IAF'), false);

    // Check Site 0 principal badge
    assert.ok(detailHtml.includes('Sede Central / Principal'));
    assert.ok(detailHtml.includes('Sede #0'));

    // Check live character counter label in Record Zone
    assert.ok(detailHtml.includes('/ 1000 caracteres'));

    // Check forensic changelog button
    assert.ok(detailHtml.includes('data-action="open-changelog"'));

    // Zero-UUID check
    const detailCheck = assertZeroUuidExposure(detailHtml);
    assert.strictEqual(detailCheck.compliant, true, `Detail view exposed raw UUIDs: ${detailCheck.exposedUuids.join(', ')}`);
  });

  it('Step 1: validateCertificadoEditInput enforces numero_certificado uniqueness/length and alcance bounds', () => {
    const first = INITIAL_CERTIFICADOS_DETAILED[0];
    const second = INITIAL_CERTIFICADOS_DETAILED[1];

    const shortNum = validateCertificadoEditInput({
      certId: first.id,
      numero_certificado: 'AB',
      multisitio: true,
      alcance: first.alcance,
      existingCertificates: INITIAL_CERTIFICADOS_DETAILED,
    });
    assert.equal(shortNum.valid, false);

    const dupNum = validateCertificadoEditInput({
      certId: first.id,
      numero_certificado: second.numero_certificado,
      multisitio: false,
      alcance: first.alcance,
      existingCertificates: INITIAL_CERTIFICADOS_DETAILED,
    });
    assert.equal(dupNum.valid, false);

    const badScope = validateCertificadoEditInput({
      certId: first.id,
      numero_certificado: first.numero_certificado,
      multisitio: false,
      alcance: 'Corto',
      existingCertificates: INITIAL_CERTIFICADOS_DETAILED,
    });
    assert.equal(badScope.valid, false);

    const ok = validateCertificadoEditInput({
      certId: first.id,
      numero_certificado: `  ${first.numero_certificado}  `,
      multisitio: !first.multisitio,
      alcance: `  ${first.alcance}  `,
      existingCertificates: INITIAL_CERTIFICADOS_DETAILED,
    });
    assert.equal(ok.valid, true);
    assert.equal(ok.normalized?.numero_certificado, first.numero_certificado);
    assert.equal(ok.normalized?.multisitio, !first.multisitio);
    assert.equal(ok.normalized?.alcance, first.alcance.trim());
  });

  it('Step 2.2: renders exact 7 singular child tabs as sortable, resizable, full-row-clickable list views with zero inner buttons', async () => {
    const { renderCertificadoView } = await import('../views/certificadoView');
    const mockProfile = {
      id: 'mock-user-1',
      role: 'ADMIN' as const,
      status: 'APPROVED' as const,
      nombre: 'Administrador Principal',
    };

    const certWithExclusions =
      INITIAL_CERTIFICADOS_DETAILED.find((c) => c.noAplicables.length > 0 && c.sitios.length > 1) ||
      INITIAL_CERTIFICADOS_DETAILED[0];

    const tabs = [
      { tab: 'sitios' as const, tableId: 'cert-tab-sitios', rowAction: 'select-sitio-preview' },
      { tab: 'procesos' as const, tableId: 'cert-tab-procesos', rowAction: 'select-proceso-preview' },
      { tab: 'turnos' as const, tableId: 'cert-tab-turnos', rowAction: 'select-turno-preview' },
      { tab: 'no_aplicables' as const, tableId: 'cert-tab-no_aplicables', rowAction: 'select-no-aplicable' },
      { tab: 'auditorias' as const, tableId: 'cert-tab-auditorias', rowAction: 'select-prog-audit-by-code' },
      { tab: 'fechas' as const, tableId: 'cert-tab-fechas', rowAction: 'select-fecha-detail' },
      { tab: 'contactos' as const, tableId: 'cert-tab-contactos', rowAction: 'select-contacto-detail' },
    ];

    for (const cfg of tabs) {
      const html = renderCertificadoView({
        profile: mockProfile,
        state: {
          selectedCertId: certWithExclusions.id,
          activeChildTab: cfg.tab,
          query: '',
          selectedStandard: 'ALL',
          selectedStatus: 'ALL',
          selectedSectorIaf: 'ALL',
          viewMode: 'grid',
          sortColumn: null,
          sortDirection: 'none',
          isEditingAttributes: false,
        },
        certificates: INITIAL_CERTIFICADOS_DETAILED,
        loading: false,
      });

      // Exact 7 singular child tabs, no Cobertura Normativa
      assert.ok(html.includes('data-cert-tab="sitios"'));
      assert.ok(html.includes('>Sitio<'));
      assert.ok(html.includes('>Proceso<'));
      assert.ok(html.includes('>Turno<'));
      assert.ok(html.includes('>No Aplicables<'));
      assert.ok(html.includes('>Auditoría<'));
      assert.ok(html.includes('data-cert-tab="fechas"'));
      assert.ok(html.includes('>Fecha<'));
      assert.ok(html.includes('data-cert-tab="contactos"'));
      assert.ok(html.includes('>Contacto<'));
      assert.strictEqual(html.includes('Cobertura Normativa'), false);
      assert.strictEqual(html.includes('data-cert-tab="cobertura"'), false);

      // List-view engine assertions
      assert.ok(html.includes(`data-resizable-table="${cfg.tableId}"`), `Missing tableId ${cfg.tableId}`);
      assert.ok(html.includes('table-fixed'), `${cfg.tab} missing table-fixed`);
      assert.ok(html.includes('data-action="sort-column"'), `${cfg.tab} missing sortable columns`);
      assert.ok(html.includes('data-resize-col='), `${cfg.tab} missing column resizer handles`);
      assert.ok(html.includes(`data-action="${cfg.rowAction}"`), `${cfg.tab} missing row click action ${cfg.rowAction}`);

      // Zero conflicting <button> elements inside <tbody>
      const tbodyMatch = html.match(/<tbody[\s\S]*?<\/tbody>/);
      assert.ok(tbodyMatch, `${cfg.tab} missing tbody`);
      assert.strictEqual(tbodyMatch[0].includes('<button'), false, `${cfg.tab} tbody must not contain inner <button> elements`);

      // Zero-UUID check
      const uuidCheck = assertZeroUuidExposure(html);
      assert.strictEqual(uuidCheck.compliant, true, `${cfg.tab} exposed raw UUIDs: ${uuidCheck.exposedUuids.join(', ')}`);
    }

    // Verify sorting and column width persistence on child tabs (Sitio 0 first by default, descending when sorted)
    const defaultSitiosHtml = renderCertificadoView({
      profile: mockProfile,
      state: {
        selectedCertId: certWithExclusions.id,
        activeChildTab: 'sitios',
        query: '',
        selectedStandard: 'ALL',
        selectedStatus: 'ALL',
        selectedSectorIaf: 'ALL',
        viewMode: 'grid',
        sortColumn: null,
        sortDirection: 'none',
        isEditingAttributes: false,
      },
      certificates: INITIAL_CERTIFICADOS_DETAILED,
      tableColumnWidths: {
        'cert-tab-sitios': {
          numero_sitio: 15,
          nombre_sitio: 25,
          tipo_sitio: 18,
          direccion_sitio: 20,
          personal_count: 10,
          turnos_vinculados: 12,
        },
      },
    });
    assert.ok(defaultSitiosHtml.includes('width: 15.00%;'));
    const maxSiteNum = Math.max(...certWithExclusions.sitios.map((s) => s.numero_sitio));
    assert.ok(
      defaultSitiosHtml.indexOf('Sede #0') < defaultSitiosHtml.indexOf(`Sede #${maxSiteNum}`),
      'Site 0 must appear before higher site numbers by default'
    );

    const descSitiosHtml = renderCertificadoView({
      profile: mockProfile,
      state: {
        selectedCertId: certWithExclusions.id,
        activeChildTab: 'sitios',
        query: '',
        selectedStandard: 'ALL',
        selectedStatus: 'ALL',
        selectedSectorIaf: 'ALL',
        viewMode: 'grid',
        sortColumn: null,
        sortDirection: 'none',
        childSortState: {
          sitios: { column: 'numero_sitio', direction: 'desc' },
        },
        isEditingAttributes: false,
      },
      certificates: INITIAL_CERTIFICADOS_DETAILED,
    });
    assert.ok(
      descSitiosHtml.indexOf(`Sede #${maxSiteNum}`) < descSitiosHtml.indexOf('Sede #0'),
      'Sorting numero_sitio desc must order highest site first'
    );
  });

  it('Step 3.2: resolves every Certificado No Aplicables row to its matching Norma LTREE clause inspection modal', async () => {
    const { getAllSeededNormaRequirements } = await import('./procesoDomain');
    const { INITIAL_NORMAS } = await import('./extraDomain');
    const { renderExtraView } = await import('../views/extraView');
    const mockProfile = {
      id: 'mock-user-1',
      role: 'ADMIN' as const,
      status: 'APPROVED' as const,
      nombre: 'Administrador Principal',
    };

    const catalog = getAllSeededNormaRequirements();
    const allCertsWithExclusions = INITIAL_CERTIFICADOS_DETAILED.filter((c) => c.noAplicables.length > 0);
    assert.ok(allCertsWithExclusions.length >= 2);

    for (const cert of allCertsWithExclusions) {
      const matchedNorma = INITIAL_NORMAS.find(
        (n) => n.id === cert.id_norma || n.codigo.toLowerCase() === cert.norma_codigo.toLowerCase()
      );
      assert.ok(matchedNorma, `Missing Norma for certificate ${cert.numero_certificado}`);

      for (const excl of cert.noAplicables) {
        const matchedReq = catalog.find(
          (r) =>
            r.id === excl.id_requisito &&
            r.codigo.toLowerCase() === excl.requisito_codigo.toLowerCase() &&
            r.id_norma === matchedNorma.id
        );
        assert.ok(
          matchedReq,
          `Missing LTREE requirement for excluded clause ${excl.requisito_codigo} on ${cert.norma_codigo}`
        );

        const normaHtml = renderExtraView(mockProfile, {
          activeSubSection: 'standards',
          standards: INITIAL_NORMAS,
          requirements: catalog.map((r) => ({
            id: r.id,
            id_norma: r.id_norma,
            codigo: r.codigo,
            ruta_materializada: r.ruta_materializada,
            norma: r.norma_codigo,
            titulo: r.titulo,
            descripcion: r.descripcion,
          })),
          iafSectors: [],
          catalogs: [],
          loading: false,
          certificates: INITIAL_CERTIFICADOS_DETAILED,
          normaState: {
            selectedNormaId: matchedNorma.id,
            activeChildTab: 'requisitos',
            inspectingClauseId: matchedReq.id,
          },
        });

        assert.ok(
          normaHtml.includes(`Cláusula ${excl.requisito_codigo}`),
          `Norma clause modal did not open for Cláusula ${excl.requisito_codigo}`
        );
        assert.ok(normaHtml.includes('id="clauseInspectionBackdrop"'));
        const zeroCheck = assertZeroUuidExposure(normaHtml);
        assert.strictEqual(
          zeroCheck.compliant,
          true,
          `Norma detail with clause modal exposed raw UUIDs: ${zeroCheck.exposedUuids.join(', ')}`
        );
      }
    }
  });
});

describe('Step 2.2 - Certificado Sub-Sector IAF, Fechas & Contactos Domain Helpers', () => {
  it('ensures every seeded certificate has id_subsector_iaf, fechas, and contactos populated', () => {
    for (const cert of INITIAL_CERTIFICADOS_DETAILED) {
      assert.ok(cert.id_subsector_iaf.length > 0, `${cert.numero_certificado} missing id_subsector_iaf`);
      assert.ok(cert.fechas.length >= 2, `${cert.numero_certificado} must have >= 2 fecha events`);
      assert.ok(cert.contactos.length >= 1, `${cert.numero_certificado} must have >= 1 contacto`);
    }
  });

  it('provides visual badge metadata for all 7 canonical TipoFechaCertificado values', () => {
    assert.strictEqual(CANONICAL_TIPO_FECHA_VALUES.length, 7);
    for (const tipo of CANONICAL_TIPO_FECHA_VALUES) {
      const visual = getFechaTipoVisual(tipo);
      assert.strictEqual(visual.label, tipo);
      assert.ok(visual.badgeClass.length > 0);
    }
    assert.ok(getFechaTipoVisual('Otorgamiento').badgeClass.includes('emerald'));
    assert.ok(getFechaTipoVisual('Cancelación').badgeClass.includes('rose'));
    assert.ok(getFechaTipoVisual('Vencimiento').badgeClass.includes('sky'));
  });

  it('computes deterministic temporal status for certificate dates', () => {
    const refDate = new Date('2026-06-01T12:00:00Z');

    assert.strictEqual(
      getFechaTemporalStatus('2026-01-15', 'Vencimiento', refDate).label,
      'Vencida'
    );
    assert.strictEqual(
      getFechaTemporalStatus('2026-07-15', 'Vencimiento', refDate).label,
      'Próxima a vencer'
    );
    assert.strictEqual(
      getFechaTemporalStatus('2027-03-14', 'Vencimiento', refDate).label,
      'Vigente'
    );
    assert.strictEqual(
      getFechaTemporalStatus('2026-09-01', 'Ultima Auditoría', refDate).label,
      'Programada'
    );
    assert.strictEqual(
      getFechaTemporalStatus('2024-03-15', 'Otorgamiento', refDate).label,
      'Vigente'
    );
    assert.strictEqual(
      getFechaTemporalStatus('2024-11-10', 'Modificación', refDate).label,
      'Histórica'
    );
  });

  it('formats contact phones and emails summaries cleanly without UUIDs', () => {
    assert.strictEqual(formatContactPhonesSummary([]), 'Sin teléfonos');
    assert.strictEqual(
      formatContactPhonesSummary([
        { id: 't1', id_contacto: 'c1', telefono: '+58 412-5550101', tipo_telefono: 'Móvil' },
      ]),
      '+58 412-5550101'
    );
    assert.strictEqual(
      formatContactPhonesSummary([
        { id: 't1', id_contacto: 'c1', telefono: '+58 412-5550101', tipo_telefono: 'Móvil' },
        { id: 't2', id_contacto: 'c1', telefono: '+58 241-8321100', tipo_telefono: 'Oficina' },
      ]),
      '+58 412-5550101 (+1)'
    );

    assert.strictEqual(formatContactEmailsSummary([]), 'Sin correos');
    assert.strictEqual(
      formatContactEmailsSummary([
        { id: 'e1', id_contacto: 'c1', email: 'calidad@empresa.com', tipo_email: 'Corporativo' },
      ]),
      'calidad@empresa.com'
    );
    assert.strictEqual(
      formatContactEmailsSummary([
        { id: 'e1', id_contacto: 'c1', email: 'calidad@empresa.com', tipo_email: 'Corporativo' },
        { id: 'e2', id_contacto: 'c1', email: 'auditoria@empresa.com', tipo_email: 'Alterno' },
      ]),
      'calidad@empresa.com (+1)'
    );
  });

  it('derives emission and expiration vigencia dates from fecha_certificado entries', () => {
    const derived = deriveCertificateVigenciaDates(
      [
        { id: 'f1', id_certificado: 'c1', fecha: '2024-03-15', tipo_fecha: 'Otorgamiento' },
        { id: 'f2', id_certificado: 'c1', fecha: '2027-03-14', tipo_fecha: 'Vencimiento' },
        { id: 'f3', id_certificado: 'c1', fecha: '2025-03-10', tipo_fecha: 'Ultima Auditoría' },
      ],
      '2020-01-01',
      '2023-01-01'
    );
    assert.strictEqual(derived.fecha_emision, '2024-03-15');
    assert.strictEqual(derived.fecha_vencimiento, '2027-03-14');

    const fallback = deriveCertificateVigenciaDates([], '2020-01-01', '2023-01-01');
    assert.strictEqual(fallback.fecha_emision, '2020-01-01');
    assert.strictEqual(fallback.fecha_vencimiento, '2023-01-01');
  });

  it('renders inline preview banners and create forms for Fecha and Contacto tabs without raw UUID exposure', async () => {
    const { renderCertificadoView } = await import('../views/certificadoView');
    const cert = INITIAL_CERTIFICADOS_DETAILED[0];
    const adminProfile = {
      id: 'mock-admin',
      role: 'ADMIN' as const,
      status: 'APPROVED' as const,
      nombre: 'Administrador',
    };

    const fechaHtml = renderCertificadoView({
      profile: adminProfile,
      state: {
        selectedCertId: cert.id,
        activeChildTab: 'fechas',
        query: '',
        selectedStandard: 'ALL',
        selectedStatus: 'ALL',
        selectedSectorIaf: 'ALL',
        viewMode: 'grid',
        sortColumn: null,
        sortDirection: 'none',
        isEditingAttributes: false,
        isCreatingFecha: true,
        previewFechaId: cert.fechas[0].id,
      },
      certificates: INITIAL_CERTIFICADOS_DETAILED,
      loading: false,
    });
    assert.ok(fechaHtml.includes('id="createFechaCertForm"'));
    assert.ok(fechaHtml.includes('data-action="close-fecha-preview"'));
    assert.strictEqual(assertZeroUuidExposure(fechaHtml).compliant, true);

    const contactoHtml = renderCertificadoView({
      profile: adminProfile,
      state: {
        selectedCertId: cert.id,
        activeChildTab: 'contactos',
        query: '',
        selectedStandard: 'ALL',
        selectedStatus: 'ALL',
        selectedSectorIaf: 'ALL',
        viewMode: 'grid',
        sortColumn: null,
        sortDirection: 'none',
        isEditingAttributes: false,
        isCreatingContacto: true,
        previewContactoId: cert.contactos[0].id,
      },
      certificates: INITIAL_CERTIFICADOS_DETAILED,
      loading: false,
    });
    assert.ok(contactoHtml.includes('id="createContactoCertForm"'));
    assert.ok(contactoHtml.includes('data-action="close-contacto-preview"'));
    assert.strictEqual(assertZeroUuidExposure(contactoHtml).compliant, true);
  });

  it('renders createCertificadoForm with Sector IAF and filtered Sub-Sector IAF selector without raw UUID exposure', async () => {
    const { renderCertificadoView } = await import('../views/certificadoView');
    const { INITIAL_SUBSECTORES_IAF } = await import('./extraDomain');
    const adminProfile = {
      id: 'mock-admin',
      role: 'ADMIN' as const,
      status: 'APPROVED' as const,
      nombre: 'Administrador',
    };

    const createHtml = renderCertificadoView({
      profile: adminProfile,
      state: {
        selectedCertId: null,
        activeChildTab: 'sitios',
        query: '',
        selectedStandard: 'ALL',
        selectedStatus: 'ALL',
        selectedSectorIaf: 'ALL',
        viewMode: 'grid',
        sortColumn: null,
        sortDirection: 'none',
        isEditingAttributes: false,
        isCreating: true,
      },
      certificates: INITIAL_CERTIFICADOS_DETAILED.slice(0, 1),
      subsectores: [
        ...INITIAL_SUBSECTORES_IAF,
        {
          id: 'da000000-0000-0000-0000-000000000179',
          id_sector_iaf: 'd0000000-0000-0000-0000-000000000017',
          sector_numero: 17,
          codigo: '17.9',
          descripcion: 'Recubrimientos metálicos especializados',
          categoria_riesgo: 'ALTO',
          auditores_nombres: [],
        },
      ],
      loading: false,
    });

    assert.ok(createHtml.includes('id="createCertificadoForm"'));
    assert.ok(createHtml.includes('id="createCertSectorSelect"'));
    assert.ok(createHtml.includes('id="createCertSubsectorSelect"'));
    assert.ok(createHtml.includes('Sector 14'));
    assert.ok(createHtml.includes('Sector 17'));
    assert.ok(createHtml.includes('17.1 ·'));
    assert.ok(createHtml.includes('17.9 · Recubrimientos metálicos especializados'));
    assert.strictEqual(assertZeroUuidExposure(createHtml).compliant, true);
  });
});
