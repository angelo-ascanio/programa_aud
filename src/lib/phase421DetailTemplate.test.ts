import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { UserProfile } from './healthCheck';
import { assertZeroUuidExposure } from './zeroUuid';
import { INITIAL_ORGANIZACIONES, type CertificadoSummary } from './activeCertificates';
import {
  INITIAL_CERTIFICADOS_DETAILED,
  createEmptyCertificadoFormDraft,
} from './multisiteSampling';
import { INITIAL_AUDITORES_DETAILED } from './competencyMatrix';
import { INITIAL_PROGRAMACION_AUDITS, INITIAL_PHASE5_FINDINGS } from './auditExecution';
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
} from './extraDomain';
import { renderOrganizacionView } from '../views/organizacionView';
import {
  renderCertificadoView,
  renderCertificadoDetailPage,
  resolveCertificadoDetailMode,
} from '../views/certificadoView';
import { renderAuditorView } from '../views/auditorView';
import { renderCompetenciaAuditorView } from '../views/competenciaAuditorView';
import { renderProgramacionView } from '../views/programacionView';
import { renderNormaView } from '../views/normaView';
import { renderSectorIafView } from '../views/sectorIafView';
import { renderSubsectorIafView } from '../views/subsectorIafView';
import { renderEstatusView } from '../views/estatusView';
import { renderTipoAuditoriaView } from '../views/tipoAuditoriaView';
import { renderMetodologiaAuditoriaView } from '../views/metodologiaAuditoriaView';
import { renderDetailPageTemplate } from '../views/detailTemplate';

const ADMIN_PROFILE: UserProfile = {
  id: '00000000-0000-0000-0000-000000000001',
  nombre: 'Administrador Principal',
  role: 'ADMIN',
  status: 'APPROVED',
};

const FORBIDDEN_DETAIL_STRINGS = [
  'ZONA 1:',
  'ZONA 2:',
  'ZONA 3:',
  'ZONA 4:',
  'Atributos Directos del Registro',
  'Relación Padre-Hijo Verificada',
  'Atributos Directos de Planificación',
  'DATOS DIRECTOS DE LA EMPRESA',
  'DECLARACIÓN TÉCNICA Y ATRIBUTOS DIRECTOS',
  'data-drilldown-select-org',
];

function assertNoForbiddenStrings(html: string, contextLabel: string): void {
  for (const token of FORBIDDEN_DETAIL_STRINGS) {
    assert.ok(
      !html.includes(token),
      `${contextLabel} still contains legacy developer text or attribute: "${token}"`
    );
  }
}

function assertStandardActionBarAndZeroUuid(html: string, contextLabel: string): void {
  assert.ok(html.includes('data-nav-back="true"'), `${contextLabel} missing data-nav-back="true"`);
  assert.ok(
    html.includes('data-action="open-changelog"'),
    `${contextLabel} missing data-action="open-changelog"`
  );
  const zeroCheck = assertZeroUuidExposure(html);
  assert.equal(
    zeroCheck.compliant,
    true,
    `${contextLabel} exposed raw UUIDs: ${zeroCheck.exposedUuids.join(', ')}`
  );
}

describe('Phase 4.2.1: Standardized 3-Zone Detail Template & 9 Detail Views', () => {
  it('removes all legacy ZONA labels and data-drilldown-select-org from detailTemplate and the 9 detail view source files', () => {
    const viewFiles = [
      'src/views/detailTemplate.ts',
      'src/views/organizacionView.ts',
      'src/views/certificadoView.ts',
      'src/views/auditorView.ts',
      'src/views/competenciaAuditorView.ts',
      'src/views/programacionView.ts',
      'src/views/normaView.ts',
      'src/views/sectorIafView.ts',
      'src/views/estatusView.ts',
      'src/views/tipoAuditoriaView.ts',
      'src/views/metodologiaAuditoriaView.ts',
      'src/views/organismoAcreditacionView.ts',
      'src/views/acreditacionView.ts',
      'src/views/sitioView.ts',
      'src/views/procesoView.ts',
      'src/views/turnoView.ts',
      'src/views/fechaView.ts',
      'src/views/contactoView.ts',
      'src/views/telefonoView.ts',
      'src/views/emailView.ts',
    ];

    for (const relPath of viewFiles) {
      const content = fs.readFileSync(path.resolve(process.cwd(), relPath), 'utf8');
      assertNoForbiddenStrings(content, relPath);
    }
  });

  it('renders Organizacion, Certificado, Auditor, and Programacion detail views with strict 3-Zone order and list-only tabs', () => {
    const certSummaries: CertificadoSummary[] = INITIAL_CERTIFICADOS_DETAILED.map((c) => ({
      id: c.id,
      numero_certificado: c.numero_certificado,
      id_organizacion: c.id_organizacion,
      organizacion_id: c.id_organizacion,
      organizacion_nombre: c.organizacion_nombre,
      norma: c.norma_codigo,
      esquema: c.esquema,
      estatus: c.estatus,
      sector_iaf: c.sector_iaf,
      multisitio: c.multisitio,
      sitios_count: c.sitios.length,
      fecha_emision: c.fecha_emision,
      fecha_vencimiento: c.fecha_vencimiento,
      cobertura_porcentaje: 100,
    }));

    const orgHtml = renderOrganizacionView({
      profile: ADMIN_PROFILE,
      state: {
        selectedOrganizacionId: INITIAL_ORGANIZACIONES[0].id,
        query: '',
        hasActiveCertificates: 'ALL',
        selectedSectorIaf: 'ALL',
        viewMode: 'grid',
        sortColumn: null,
        sortDirection: 'none',
        isEditingAttributes: false,
        activeChildTab: 'auditorias',
      },
      organizaciones: INITIAL_ORGANIZACIONES,
      certificados: certSummaries,
      auditorias: INITIAL_PROGRAMACION_AUDITS,
    });
    assertNoForbiddenStrings(orgHtml, 'OrganizacionDetail');
    assertStandardActionBarAndZeroUuid(orgHtml, 'OrganizacionDetail');
    assert.equal(orgHtml.includes('aria-label="Contexto y relaciones superiores"'), false);
    assert.equal(orgHtml.includes('<hr class="border-t border-slate-200 my-2.5 sm:my-3" />'), false);
    assert.ok(orgHtml.includes('<table'));
    assert.ok(orgHtml.includes('aria-label="Detalle del registro"'));
    assert.ok(
      orgHtml.indexOf('aria-label="Detalle del registro"') < orgHtml.indexOf('role="tablist"')
    );

    const certHtml = renderCertificadoView({
      profile: ADMIN_PROFILE,
      state: {
        selectedCertId: INITIAL_CERTIFICADOS_DETAILED[0].id,
        activeChildTab: 'auditorias',
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
      organizaciones: INITIAL_ORGANIZACIONES,
    });
    assertNoForbiddenStrings(certHtml, 'CertificadoDetail');
    assertStandardActionBarAndZeroUuid(certHtml, 'CertificadoDetail');
    assert.ok(certHtml.includes('data-parent-nav="true"'));
    assert.ok(certHtml.includes('<hr class="border-t border-slate-200 my-2.5 sm:my-3" />'));
    assert.ok(certHtml.includes('<table'));
    assert.ok(certHtml.includes('data-resizable-table="cert-tab-auditorias"'));
    assert.equal(certHtml.includes('Cobertura Normativa'), false);

    // Step 2.2 + Post-roadmap polish: Single-card shell + icon-only [←] ... [✏️][🕒][🗑️] Top Row + minimal title + Parent Zone grid
    assert.ok(certHtml.includes('bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden'));
    assert.ok(certHtml.includes('title="Volver"'));
    assert.equal(certHtml.includes('Volver a Certificados'), false);
    const editIdx = certHtml.indexOf('id="startEditCertBtn"');
    const clockIdx = certHtml.indexOf('data-action="open-changelog"');
    const archiveIdx = certHtml.indexOf('data-action="open-archive-modal"');
    assert.ok(editIdx > 0 && clockIdx > editIdx, 'Edit icon button must appear immediately left of Clock button');
    assert.ok(archiveIdx > clockIdx, 'Archive icon button must appear immediately right of Clock button');
    assert.ok(certHtml.includes('title="Editar"'));
    assert.ok(certHtml.includes('title="Historial de Cambios"'));
    assert.ok(certHtml.includes('title="Archivar"'));
    assert.equal(certHtml.includes('<span>Archivar</span>'), false);
    assert.ok(certHtml.includes('📜'));
    assert.ok(certHtml.includes(`>${INITIAL_CERTIFICADOS_DETAILED[0].numero_certificado}<`) || certHtml.includes(INITIAL_CERTIFICADOS_DETAILED[0].numero_certificado));
    // Minimal header & Single-Row Layout: [←] + 📜 Title ... [✏️][🕒][🗑️] in one flex row
    const headerMatch = certHtml.match(/<header[\s\S]*?<\/header>/);
    assert.ok(headerMatch);
    assert.equal(headerMatch[0].includes(INITIAL_CERTIFICADOS_DETAILED[0].norma_titulo), false);
    assert.equal(headerMatch[0].includes('rounded-full'), false);
    assert.ok(headerMatch[0].includes('flex items-center justify-between gap-3 sm:gap-4'));
    assert.ok(headerMatch[0].includes('truncate min-w-0'));
    const backIdx = headerMatch[0].indexOf('data-nav-back="true"');
    const h1Idx = headerMatch[0].indexOf('<h1');
    const hdrEditIdx = headerMatch[0].indexOf('id="startEditCertBtn"');
    const hdrClockIdx = headerMatch[0].indexOf('data-action="open-changelog"');
    const hdrArchiveIdx = headerMatch[0].indexOf('data-action="open-archive-modal"');
    assert.ok(
      backIdx >= 0 && h1Idx > backIdx && hdrEditIdx > h1Idx && hdrClockIdx > hdrEditIdx && hdrArchiveIdx > hdrClockIdx,
      'Unified single-row header must order Back < H1 < Edit < Changelog < Archive'
    );
    // Step 2.2: Parent Zone structured grid cards (5 FKs in lg:grid-cols-3 xl:grid-cols-5 row)
    assert.ok(certHtml.includes('grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-2.5'));
    const parentZoneSection = certHtml.match(
      /<section aria-label="Contexto y relaciones superiores"[\s\S]*?<\/section>/
    );
    assert.ok(parentZoneSection, 'Certificado must render Parent Zone');
    const parentNavButtons = parentZoneSection[0].match(/data-parent-nav="true"/g) || [];
    assert.equal(parentNavButtons.length, 5, 'Certificado must render exactly 5 parent FK cards');
    for (const parentLabel of ['Organización', 'Norma', 'Estatus', 'Sector IAF', 'Sub-Sector IAF']) {
      assert.ok(parentZoneSection[0].includes(parentLabel), `Missing Certificado parent: ${parentLabel}`);
    }
    assert.ok(certHtml.includes('data-parent-type="org"'));
    assert.ok(certHtml.includes('data-parent-type="norma"'));
    assert.ok(certHtml.includes('data-parent-type="estatus"'));
    assert.ok(certHtml.includes('data-parent-type="sector_iaf"'));
    assert.ok(certHtml.includes('data-parent-type="subsector_iaf"'));

    // Direct Data Zone contains strictly numero_certificado, multisitio, alcance (never dates, acreditadora, or duplicated Sub-Sector IAF)
    const recordZoneSection = certHtml.match(
      /<section aria-label="Detalle del registro"[\s\S]*?<\/section>/
    );
    assert.ok(recordZoneSection, 'Certificado must render Direct Data Zone');
    assert.ok(recordZoneSection[0].includes('Número de Certificado'));
    assert.ok(recordZoneSection[0].includes('Esquema Multisitio'));
    assert.ok(recordZoneSection[0].includes('Alcance de la Certificación'));
    assert.equal(recordZoneSection[0].includes('Fecha de Emisión'), false);
    assert.equal(recordZoneSection[0].includes('Fecha de Vencimiento'), false);
    assert.equal(recordZoneSection[0].includes('Organismo Acreditador'), false);
    assert.equal(recordZoneSection[0].includes('Sub-Sector IAF'), false);

    // All 7 child tabs present in tablist
    const tabListMatch = certHtml.match(/<div[^>]*role="tablist"[^>]*>[\s\S]*?<\/div>/);
    assert.ok(tabListMatch, 'Certificado must render role="tablist"');
    const renderedTabs = tabListMatch[0].match(/role="tab"/g) || [];
    assert.equal(renderedTabs.length, 7, 'Certificado must render exactly 7 child tabs');
    for (const tabLabel of ['Sitio', 'Proceso', 'Turno', 'No Aplicables', 'Auditoría', 'Fecha', 'Contacto']) {
      assert.ok(tabListMatch[0].includes(tabLabel), `Missing Certificado child tab: ${tabLabel}`);
    }
    assert.ok(certHtml.includes('data-cert-tab="fechas"'));
    assert.ok(certHtml.includes('data-cert-tab="contactos"'));
    assert.ok(certHtml.includes(`data-entity-id="${INITIAL_CERTIFICADOS_DETAILED[0].id_estatus}"`));
    assert.ok(certHtml.includes(INITIAL_CERTIFICADOS_DETAILED[0].alcance));

    // Step 2.2: Editing state replaces edit icon with cancel icon and non-staff hides edit icon
    const certEditingHtml = renderCertificadoView({
      profile: ADMIN_PROFILE,
      state: {
        selectedCertId: INITIAL_CERTIFICADOS_DETAILED[0].id,
        activeChildTab: 'sitios',
        query: '',
        selectedStandard: 'ALL',
        selectedStatus: 'ALL',
        selectedSectorIaf: 'ALL',
        viewMode: 'grid',
        sortColumn: null,
        sortDirection: 'none',
        isEditingAttributes: true,
      },
      certificates: INITIAL_CERTIFICADOS_DETAILED,
      organizaciones: INITIAL_ORGANIZACIONES,
    });
    assert.ok(certEditingHtml.includes('id="cancelEditCertBtn"'));
    assert.ok(certEditingHtml.includes('id="saveCertFormBtn"'));
    assert.ok(certEditingHtml.includes('form="certificadoDetailForm"'));
    assert.equal(certEditingHtml.includes('data-action="open-changelog"'), false);
    assert.equal(certEditingHtml.includes('data-action="open-archive-modal"'), false);
    assert.ok(certEditingHtml.includes('id="certificadoDetailForm"'));
    assert.ok(certEditingHtml.includes('id="certParentOrganizacionSelect"'));
    assert.ok(certEditingHtml.includes('id="certParentNormaSelect"'));
    assert.ok(certEditingHtml.includes('id="certParentEstatusSelect"'));
    assert.ok(certEditingHtml.includes('id="certParentSectorIafSelect"'));
    assert.ok(certEditingHtml.includes('id="certParentSubsectorIafSelect"'));
    assert.ok(certEditingHtml.includes('id="certNumeroInput"'));
    assert.ok(certEditingHtml.includes('id="certMultisitioCheckbox"'));
    assert.ok(certEditingHtml.includes('id="certAlcanceInput"'));
    assert.equal(certEditingHtml.includes('id="cancelCertFormBtn"'), false);
    assert.equal(certEditingHtml.includes('Guardar Cambios'), false);
    assert.equal(certEditingHtml.includes('editCertFechaEmision'), false);
    assert.equal(certEditingHtml.includes('editCertFechaVencimiento'), false);

    const clientCertHtml = renderCertificadoView({
      profile: {
        id: '00000000-0000-0000-0000-000000000004',
        nombre: 'Usuario Cliente',
        role: 'CLIENT',
        status: 'APPROVED',
      },
      state: {
        selectedCertId: INITIAL_CERTIFICADOS_DETAILED[0].id,
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
      organizaciones: INITIAL_ORGANIZACIONES,
    });
    assert.equal(clientCertHtml.includes('id="startEditCertBtn"'), false);
    assert.ok(clientCertHtml.includes('data-action="open-changelog"'));

    const auditorHtml = renderAuditorView({
      profile: ADMIN_PROFILE,
      state: {
        selectedAuditorId: INITIAL_AUDITORES_DETAILED[0].id,
        activeChildTab: 'competencias',
        query: '',
        selectedCalificacion: 'ALL',
        selectedStandard: 'ALL',
        selectedSectorIaf: 'ALL',
        viewMode: 'grid',
        sortColumn: null,
        sortDirection: 'none',
        isEditingAttributes: false,
      },
      auditors: INITIAL_AUDITORES_DETAILED,
      normas: INITIAL_NORMAS,
      sectores: INITIAL_SECTORES_IAF,
      subsectores: INITIAL_SUBSECTORES_IAF,
    });
    assertNoForbiddenStrings(auditorHtml, 'AuditorDetail');
    assertStandardActionBarAndZeroUuid(auditorHtml, 'AuditorDetail');
    assert.equal(auditorHtml.includes('aria-label="Contexto y relaciones superiores"'), false);
    assert.equal(auditorHtml.includes('<hr class="border-t border-slate-200 my-2.5 sm:my-3" />'), false);
    assert.ok(auditorHtml.includes('<table'));

    const compHtml = renderCompetenciaAuditorView({
      profile: ADMIN_PROFILE,
      state: {
        isOpen: true,
        mode: 'read',
        selectedComp: {
          id_auditor: INITIAL_AUDITORES_DETAILED[0].id,
          tipo: 'norma',
          targetId: INITIAL_NORMAS[0].id,
        },
      },
      auditors: INITIAL_AUDITORES_DETAILED,
      normas: INITIAL_NORMAS,
      sectores: INITIAL_SECTORES_IAF,
      subsectores: INITIAL_SUBSECTORES_IAF,
    });
    assertNoForbiddenStrings(compHtml, 'CompetenciaAuditorDetail');
    assert.ok(compHtml.includes('data-nav-back="true"'));
    assert.ok(compHtml.includes('data-action="unlink-competencia"'));
    assert.equal(assertZeroUuidExposure(compHtml).compliant, true);
    assert.ok(compHtml.includes('aria-label="Contexto y relaciones superiores"'));
    assert.ok(compHtml.includes('<hr class="border-t border-slate-200 my-2.5 sm:my-3" />'));
    assert.ok(compHtml.includes('data-parent-nav="true"'));

    const progHtml = renderProgramacionView({
      profile: ADMIN_PROFILE,
      state: {
        selectedAuditId: INITIAL_PROGRAMACION_AUDITS[0].id,
        activeChildTab: 'hallazgos',
        query: '',
        selectedTipo: 'ALL',
        selectedMetodologia: 'ALL',
        selectedEstatus: 'ALL',
        viewMode: 'grid',
        sortColumn: null,
        sortDirection: 'none',
        isEditingAttributes: false,
        isAddingTeamMember: false,
      },
      audits: INITIAL_PROGRAMACION_AUDITS,
      auditors: INITIAL_AUDITORES_DETAILED,
      certificates: [],
      findings: INITIAL_PHASE5_FINDINGS,
    });
    assertNoForbiddenStrings(progHtml, 'ProgramacionDetail');
    assertStandardActionBarAndZeroUuid(progHtml, 'ProgramacionDetail');
    assert.ok(progHtml.includes('data-parent-nav="true"'));
    assert.ok(progHtml.includes('<hr class="border-t border-slate-200 my-2.5 sm:my-3" />'));
    assert.ok(progHtml.includes('<table'));
  });

  it('cleanly omits Parent Zone and hairline divider on standalone root catalogs (Norma, Sector IAF, Estatus, Tipo, Metodologia)', () => {
    const normaHtml = renderNormaView({
      profile: ADMIN_PROFILE,
      state: {
        selectedNormaId: INITIAL_NORMAS[0].id,
        activeChildTab: 'certificados',
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
      sectores: INITIAL_SECTORES_IAF,
      certificados: INITIAL_CERTIFICADOS_DETAILED,
    });

    const sectorHtml = renderSectorIafView({
      profile: ADMIN_PROFILE,
      state: {
        selectedSectorId: INITIAL_SECTORES_IAF[0].id,
        activeChildTab: 'auditores',
        query: '',
        selectedRisk: 'ALL',
        viewMode: 'grid',
        sortColumn: null,
        sortDirection: 'none',
      },
      sectores: INITIAL_SECTORES_IAF,
      subsectores: INITIAL_SUBSECTORES_IAF,
      acreditaciones: INITIAL_ACREDITACIONES,
      certificados: INITIAL_CERTIFICADOS_DETAILED,
      auditores: INITIAL_AUDITORES_DETAILED,
    });

    const estatusHtml = renderEstatusView({
      profile: ADMIN_PROFILE,
      state: {
        selectedEstatusId: INITIAL_ESTATUS_CATALOG[0].id,
        activeChildTab: 'certificados',
        query: '',
        viewMode: 'grid',
        sortColumn: null,
        sortDirection: 'none',
      },
      estatusList: INITIAL_ESTATUS_CATALOG,
      certificados: INITIAL_CERTIFICADOS_DETAILED,
      audits: INITIAL_PROGRAMACION_AUDITS,
    });

    const tipoHtml = renderTipoAuditoriaView({
      profile: ADMIN_PROFILE,
      state: {
        selectedTipoId: INITIAL_TIPOS_AUDITORIA_CATALOG[0].id,
        query: '',
        viewMode: 'grid',
        sortColumn: null,
        sortDirection: 'none',
      },
      tiposList: INITIAL_TIPOS_AUDITORIA_CATALOG,
      audits: INITIAL_PROGRAMACION_AUDITS,
    });

    const metodologiaHtml = renderMetodologiaAuditoriaView({
      profile: ADMIN_PROFILE,
      state: {
        selectedMetodologiaId: INITIAL_METODOLOGIAS_CATALOG[0].id,
        query: '',
        viewMode: 'grid',
        sortColumn: null,
        sortDirection: 'none',
      },
      metodologiasList: INITIAL_METODOLOGIAS_CATALOG,
      audits: INITIAL_PROGRAMACION_AUDITS,
    });

    const subsectorHtml = renderSubsectorIafView({
      profile: ADMIN_PROFILE,
      state: {
        selectedSubsectorId: INITIAL_SUBSECTORES_IAF[0].id,
      },
      subsectores: INITIAL_SUBSECTORES_IAF,
      sectores: INITIAL_SECTORES_IAF,
      certificados: INITIAL_CERTIFICADOS_DETAILED,
      auditores: INITIAL_AUDITORES_DETAILED,
    });
    assert.ok(subsectorHtml.includes('aria-label="Contexto y relaciones superiores"'));
    assert.ok(subsectorHtml.includes('aria-label="Detalle del registro"'));
    assert.ok(subsectorHtml.includes('data-parent-nav="true"'));

    const rootViews = [
      { name: 'NormaDetail', html: normaHtml },
      { name: 'SectorIafDetail', html: sectorHtml },
      { name: 'EstatusDetail', html: estatusHtml },
      { name: 'TipoAuditoriaDetail', html: tipoHtml },
      { name: 'MetodologiaDetail', html: metodologiaHtml },
    ];

    for (const { name, html } of rootViews) {
      assertNoForbiddenStrings(html, name);
      assertStandardActionBarAndZeroUuid(html, name);
      assert.ok(
        !html.includes('aria-label="Contexto y relaciones superiores"'),
        `${name} should omit Parent Zone on standalone root catalog`
      );
      assert.ok(
        !html.includes('<hr class="border-t border-slate-200 my-2.5 sm:my-3" />'),
        `${name} should omit hairline divider when Parent Zone is empty`
      );
      assert.ok(html.includes('<table'), `${name} should render list-only child table`);
    }
  });

  it('scales compact parent grid cleanly between 3, 4 (lg:grid-cols-4), and 5 (lg:grid-cols-3 xl:grid-cols-5) parent chips', () => {
    const baseProps = {
      entityType: 'Registro',
      entitySymbol: '📄',
      title: 'Prueba Compacta',
      backButton: { label: 'Volver', nav: 'certificacion', subview: 'certificates' },
      tableName: 'certificado',
      recordId: '00000000-0000-0000-0000-000000000099',
      attributes: [{ label: 'Código', value: 'TEST-01' }],
    };

    const threeHtml = renderDetailPageTemplate({
      ...baseProps,
      parents: [
        { label: 'Padre 1', value: 'A' },
        { label: 'Padre 2', value: 'B' },
        { label: 'Padre 3', value: 'C' },
      ],
    });
    assert.ok(threeHtml.includes('grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5'));
    assert.ok(threeHtml.includes('p-3.5 sm:p-4'));
    assert.ok(threeHtml.includes('my-2.5 sm:my-3'));

    const fourHtml = renderDetailPageTemplate({
      ...baseProps,
      parents: [
        { label: 'Padre 1', value: 'A' },
        { label: 'Padre 2', value: 'B' },
        { label: 'Padre 3', value: 'C' },
        { label: 'Padre 4', value: 'D' },
      ],
    });
    assert.ok(fourHtml.includes('grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5'));

    const fiveHtml = renderDetailPageTemplate({
      ...baseProps,
      parents: [
        { label: 'Padre 1', value: 'A' },
        { label: 'Padre 2', value: 'B' },
        { label: 'Padre 3', value: 'C' },
        { label: 'Padre 4', value: 'D' },
        { label: 'Padre 5', value: 'E' },
      ],
    });
    assert.ok(fiveHtml.includes('grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-2.5'));
  });

  it('Fase 2: renders unified Certificado detail form across read (disabled), add (isCreateMode), edit (enabled), and RBAC enforcement', () => {
    const firstCert = INITIAL_CERTIFICADOS_DETAILED[0];
    const baseState = {
      selectedCertId: firstCert.id,
      activeChildTab: 'sitios' as const,
      query: '',
      selectedStandard: 'ALL',
      selectedStatus: 'ALL',
      selectedSectorIaf: 'ALL',
      viewMode: 'grid' as const,
      sortColumn: null,
      sortDirection: 'none' as const,
      isEditingAttributes: false,
    };

    // 1. Read Mode: 5 disabled parent <select> + 3 disabled direct controls + 5 parent jump buttons + no save/cancel footer
    const readHtml = renderCertificadoDetailPage({
      profile: ADMIN_PROFILE,
      state: baseState,
      cert: firstCert,
      organizaciones: INITIAL_ORGANIZACIONES,
      normas: INITIAL_NORMAS,
      estatusList: INITIAL_ESTATUS_CATALOG,
      sectores: INITIAL_SECTORES_IAF,
      subsectores: INITIAL_SUBSECTORES_IAF,
    });
    assertStandardActionBarAndZeroUuid(readHtml, 'CertificadoUnifiedRead');
    for (const selectId of [
      'certParentOrganizacionSelect',
      'certParentNormaSelect',
      'certParentEstatusSelect',
      'certParentSectorIafSelect',
      'certParentSubsectorIafSelect',
    ]) {
      const selectMatch = readHtml.match(new RegExp(`<select[^>]*id="${selectId}"[^>]*>`));
      assert.ok(selectMatch, `Missing parent select #${selectId}`);
      assert.ok(selectMatch[0].includes('disabled'), `#${selectId} must be disabled in read mode`);
      assert.ok(selectMatch[0].includes('form="certificadoDetailForm"'));
    }
    const readNumMatch = readHtml.match(/<input[^>]*id="certNumeroInput"[^>]*>/);
    const readMultiMatch = readHtml.match(/<input[^>]*id="certMultisitioCheckbox"[^>]*>/);
    const readAlcanceMatch = readHtml.match(/<textarea[^>]*id="certAlcanceInput"[^>]*>/);
    assert.ok(readNumMatch && readNumMatch[0].includes('disabled'));
    assert.ok(readMultiMatch && readMultiMatch[0].includes('disabled'));
    assert.ok(readAlcanceMatch && readAlcanceMatch[0].includes('disabled'));
    assert.equal(readHtml.includes('id="cancelCertFormBtn"'), false);
    assert.equal(readHtml.includes('id="saveCertFormBtn"'), false);
    assert.equal((readHtml.match(/aria-hidden="true">\*<\/span>/g) || []).length, 7);
    assert.ok(
      firstCert.multisitio
        ? readHtml.includes('bg-emerald-600') && readHtml.includes('polyline points="4 10 8 14 16 6"')
        : readHtml.includes('border-slate-300 bg-white')
    );

    const readWithSuccessStateHtml = renderCertificadoDetailPage({
      profile: ADMIN_PROFILE,
      state: { ...baseState, saveSuccessMessage: 'Atributos del certificado guardados exitosamente.' },
      cert: firstCert,
      organizaciones: INITIAL_ORGANIZACIONES,
      normas: INITIAL_NORMAS,
      estatusList: INITIAL_ESTATUS_CATALOG,
      sectores: INITIAL_SECTORES_IAF,
      subsectores: INITIAL_SUBSECTORES_IAF,
    });
    assert.equal(
      readWithSuccessStateHtml.includes('Atributos del certificado guardados exitosamente.'),
      false,
      'Certificado detail view must not render an inline green success banner'
    );

    // 2. Add Mode (isCreateMode): hides edit/changelog/archive and child tabs; top bar shows icon-only Cancel & Save; all 8 fields enabled & empty
    const addEmptyHtml = renderCertificadoDetailPage({
      profile: ADMIN_PROFILE,
      state: {
        ...baseState,
        selectedCertId: null,
        isCreating: true,
        formDraft: createEmptyCertificadoFormDraft(),
      },
      organizaciones: INITIAL_ORGANIZACIONES,
      normas: INITIAL_NORMAS,
      estatusList: INITIAL_ESTATUS_CATALOG,
      sectores: INITIAL_SECTORES_IAF,
      subsectores: INITIAL_SUBSECTORES_IAF,
    });
    assert.equal(assertZeroUuidExposure(addEmptyHtml).compliant, true);
    assert.ok(addEmptyHtml.includes('Nuevo Certificado'));
    assert.equal(addEmptyHtml.includes('data-action="open-changelog"'), false);
    assert.equal(addEmptyHtml.includes('data-action="open-archive-modal"'), false);
    assert.equal(addEmptyHtml.includes('role="tablist"'), false);
    assert.equal(addEmptyHtml.includes('id="startEditCertBtn"'), false);
    assert.equal(addEmptyHtml.includes('data-parent-nav="true"'), false);
    assert.ok(addEmptyHtml.includes('id="cancelEditCertBtn"'));
    assert.ok(addEmptyHtml.includes('title="Cancelar creación"'));
    assert.ok(addEmptyHtml.includes('id="saveCertFormBtn"'));
    assert.ok(addEmptyHtml.includes('title="Crear certificado"'));
    assert.ok(addEmptyHtml.includes('form="certificadoDetailForm"'));
    assert.ok(addEmptyHtml.includes('bg-emerald-600'));
    assert.ok(
      addEmptyHtml.indexOf('id="saveCertFormBtn"') < addEmptyHtml.indexOf('id="cancelEditCertBtn"'),
      'Save icon button must appear before Cancel icon button in Add mode'
    );
    assert.equal(addEmptyHtml.includes('id="cancelCertFormBtn"'), false);
    assert.equal(addEmptyHtml.includes('Crear Certificado'), false);
    assert.equal((addEmptyHtml.match(/aria-hidden="true">\*<\/span>/g) || []).length, 7);

    for (const selectId of [
      'certParentOrganizacionSelect',
      'certParentNormaSelect',
      'certParentEstatusSelect',
      'certParentSectorIafSelect',
      'certParentSubsectorIafSelect',
    ]) {
      const selectMatch = addEmptyHtml.match(new RegExp(`<select[^>]*id="${selectId}"[^>]*>`));
      assert.ok(selectMatch, `Missing parent select #${selectId} in add mode`);
      assert.equal(selectMatch[0].includes('disabled'), false, `#${selectId} must be enabled in add mode`);
    }
    const subsectorBlockEmpty = addEmptyHtml.match(
      /<select[^>]*id="certParentSubsectorIafSelect"[^>]*>[\s\S]*?<\/select>/
    );
    assert.ok(subsectorBlockEmpty);
    assert.equal((subsectorBlockEmpty[0].match(/<option /g) || []).length, 1);

    // 2b. Add Mode with Sector 17 selected cascades to 17.1 and 17.2 only
    const addSector17Html = renderCertificadoDetailPage({
      profile: ADMIN_PROFILE,
      state: {
        ...baseState,
        selectedCertId: null,
        isCreating: true,
        formDraft: {
          ...createEmptyCertificadoFormDraft(),
          id_sector_iaf: 'd0000000-0000-0000-0000-000000000017',
        },
      },
      organizaciones: INITIAL_ORGANIZACIONES,
      normas: INITIAL_NORMAS,
      estatusList: INITIAL_ESTATUS_CATALOG,
      sectores: INITIAL_SECTORES_IAF,
      subsectores: INITIAL_SUBSECTORES_IAF,
    });
    assert.equal(assertZeroUuidExposure(addSector17Html).compliant, true);
    const subsectorBlock17 = addSector17Html.match(
      /<select[^>]*id="certParentSubsectorIafSelect"[^>]*>[\s\S]*?<\/select>/
    );
    assert.ok(subsectorBlock17);
    assert.ok(subsectorBlock17[0].includes('17.1 ·'));
    assert.ok(subsectorBlock17[0].includes('17.2 ·'));
    assert.equal(subsectorBlock17[0].includes('33.1 ·'), false);

    // 3. Edit Mode: all 8 controls enabled, pre-populated, filtered Sub-Sector IAF, Guardar Cambios button
    const editHtml = renderCertificadoDetailPage({
      profile: ADMIN_PROFILE,
      state: {
        ...baseState,
        isEditingAttributes: true,
      },
      cert: firstCert,
      organizaciones: INITIAL_ORGANIZACIONES,
      normas: INITIAL_NORMAS,
      estatusList: INITIAL_ESTATUS_CATALOG,
      sectores: INITIAL_SECTORES_IAF,
      subsectores: INITIAL_SUBSECTORES_IAF,
    });
    assert.ok(editHtml.includes('data-nav-back="true"'));
    assert.equal(assertZeroUuidExposure(editHtml).compliant, true);
    assert.ok(editHtml.includes('id="cancelEditCertBtn"'));
    assert.ok(editHtml.includes('title="Cancelar edición"'));
    assert.ok(editHtml.includes('id="saveCertFormBtn"'));
    assert.ok(editHtml.includes('title="Guardar cambios"'));
    assert.ok(editHtml.includes('form="certificadoDetailForm"'));
    assert.ok(editHtml.includes('bg-emerald-600'));
    assert.ok(
      editHtml.indexOf('id="saveCertFormBtn"') < editHtml.indexOf('id="cancelEditCertBtn"'),
      'Save icon button must appear before Cancel icon button in Edit mode'
    );
    assert.equal(editHtml.includes('id="cancelCertFormBtn"'), false);
    assert.equal(editHtml.includes('Guardar Cambios'), false);
    assert.equal(editHtml.includes('data-action="open-changelog"'), false);
    assert.equal(editHtml.includes('data-action="open-archive-modal"'), false);
    assert.equal((editHtml.match(/aria-hidden="true">\*<\/span>/g) || []).length, 7);
    const editParentExpected: Array<[string, string]> = [
      ['certParentOrganizacionSelect', firstCert.id_organizacion],
      ['certParentNormaSelect', firstCert.id_norma],
      ['certParentEstatusSelect', firstCert.id_estatus],
      ['certParentSectorIafSelect', firstCert.id_sector_iaf],
      ['certParentSubsectorIafSelect', firstCert.id_subsector_iaf],
    ];
    for (const [selectId, expectedVal] of editParentExpected) {
      const selMatch = editHtml.match(new RegExp(`<select[^>]*id="${selectId}"[^>]*>[\\s\\S]*?<\\/select>`));
      assert.ok(selMatch && !selMatch[0].includes('disabled'), `#${selectId} must be enabled in edit mode`);
      assert.ok(
        new RegExp(`<option value="${expectedVal}"\\s+selected>`).test(selMatch[0]),
        `#${selectId} must pre-select ${expectedVal}`
      );
    }
    const editNumMatch = editHtml.match(/<input[^>]*id="certNumeroInput"[^>]*>/);
    assert.ok(editNumMatch && !editNumMatch[0].includes('disabled'));
    assert.ok(editNumMatch[0].includes(`value="${firstCert.numero_certificado}"`));
    const editMultiMatch = editHtml.match(/<input[^>]*id="certMultisitioCheckbox"[^>]*>/);
    assert.ok(editMultiMatch && !editMultiMatch[0].includes('disabled'));
    assert.equal(editMultiMatch[0].includes('checked'), Boolean(firstCert.multisitio));
    const editAlcanceMatch = editHtml.match(/<textarea[^>]*id="certAlcanceInput"[^>]*>([\s\S]*?)<\/textarea>/);
    assert.ok(editAlcanceMatch && !editAlcanceMatch[0].includes('disabled'));
    assert.ok(editAlcanceMatch[1].includes(firstCert.alcance));
    const editSubsectorBlock = editHtml.match(
      /<select[^>]*id="certParentSubsectorIafSelect"[^>]*>[\s\S]*?<\/select>/
    );
    assert.ok(editSubsectorBlock);
    assert.ok(editSubsectorBlock[0].includes('17.1 ·'));
    assert.equal(editSubsectorBlock[0].includes('33.1 ·'), false);

    // 4. RBAC Enforcement: CLIENT & AUDITOR never enter 'edit' or 'add' even with residual flags
    const clientProfile: UserProfile = {
      id: '00000000-0000-0000-0000-000000000004',
      nombre: 'Cliente Demo',
      role: 'CLIENT',
      status: 'APPROVED',
    };
    const auditorProfile: UserProfile = {
      id: '00000000-0000-0000-0000-000000000005',
      nombre: 'Auditor Demo',
      role: 'AUDITOR',
      status: 'APPROVED',
    };
    assert.equal(
      resolveCertificadoDetailMode({ ...baseState, isEditingAttributes: true }, false, firstCert),
      'read'
    );
    assert.equal(
      resolveCertificadoDetailMode({ ...baseState, selectedCertId: null, isCreating: true }, false),
      'read'
    );

    for (const nonStaffProfile of [clientProfile, auditorProfile]) {
      const forcedReadHtml = renderCertificadoDetailPage({
        profile: nonStaffProfile,
        state: {
          ...baseState,
          isEditingAttributes: true,
        },
        cert: firstCert,
        organizaciones: INITIAL_ORGANIZACIONES,
        normas: INITIAL_NORMAS,
        estatusList: INITIAL_ESTATUS_CATALOG,
        sectores: INITIAL_SECTORES_IAF,
        subsectores: INITIAL_SUBSECTORES_IAF,
      });
      assert.equal(forcedReadHtml.includes('id="saveCertFormBtn"'), false);
      assert.equal(forcedReadHtml.includes('id="startEditCertBtn"'), false);
      const forcedSelect = forcedReadHtml.match(/<select[^>]*id="certParentOrganizacionSelect"[^>]*>/);
      assert.ok(forcedSelect && forcedSelect[0].includes('disabled'));
    }
  });
});
