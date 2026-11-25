import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { OrganizacionEntity } from '../lib/activeCertificates';
import type { ProgramacionAuditEntity } from '../lib/auditExecution';
import type { ProgramaAuditoriaEntity } from '../lib/auditPlanningEngine';
import type { ConglomeradoEntity } from '../lib/conglomeradoDomain';
import type { UserProfile } from '../lib/healthCheck';
import {
  buildOrgCertPickerModalModel,
  buildOrgMultiViewRows,
} from '../lib/orgMultiViewPickerDomain';
import type { SoftDeletableCertificado } from '../lib/vinculoDomain';
import { assertZeroUuidExposure } from '../lib/zeroUuid';
import {
  renderOrgCertPickerModal,
  renderOrgMultiView,
  type OrgPickerDomainColumn,
} from './orgMultiViewPickerView';

const IDS = {
  admin: '10000000-0000-4000-8000-000000000010',
  cong: '20000000-0000-4000-8000-000000000010',
  org: '30000000-0000-4000-8000-000000000010',
  cert1: '40000000-0000-4000-8000-000000000011',
  cert2: '40000000-0000-4000-8000-000000000012',
  cert3: '40000000-0000-4000-8000-000000000013',
  prog: '50000000-0000-4000-8000-000000000010',
  aud1: '60000000-0000-4000-8000-000000000011',
  aud2: '60000000-0000-4000-8000-000000000012',
  aud3: '60000000-0000-4000-8000-000000000013',
};

function sumColgroupPercentages(html: string): number[] {
  const colgroups = [...html.matchAll(/<colgroup>([\s\S]*?)<\/colgroup>/g)];
  return colgroups.map((cg) => {
    const widths = [...cg[1].matchAll(/style="width:\s*([0-9.]+)%;"/g)].map((m) =>
      Number.parseFloat(m[1])
    );
    return widths.reduce((sum, w) => sum + w, 0);
  });
}

function countButtonsInTbodies(html: string): number {
  const tbodies = [...html.matchAll(/<tbody[^>]*>([\s\S]*?)<\/tbody>/g)];
  return tbodies.reduce(
    (sum, tb) => sum + (tb[1].match(/<button\b/gi)?.length ?? 0),
    0
  );
}

function createSampleData() {
  const profile: UserProfile = {
    id: IDS.admin,
    nombre: 'Admin Pruebas',
    role: 'ADMIN',
    status: 'APPROVED',
  };
  const conglomerados: ConglomeradoEntity[] = [
    {
      id: IDS.cong,
      codigo_grupo: 'CONG-01',
      nombre: 'Grupo Industrial Caribe S.A.',
      abreviacion: 'Grupo Caribe',
      es_individual_auto: false,
      notas: null,
      deleted_at: null,
    },
  ];
  const organizaciones: OrganizacionEntity[] = [
    {
      id: IDS.org,
      id_grupo_empresarial: IDS.cong,
      nombre: 'Manufacturas Caribeñas de Precisión C.A.',
      abreviacion: 'Manuf. Caribe',
      rif: 'J-30555666-7',
      estatus: 'Activo',
      deleted_at: null,
    },
  ];
  const makeCert = (
    id: string,
    numero: string,
    norma: string,
    version: number
  ): SoftDeletableCertificado => ({
    id,
    numero_certificado: numero,
    id_organizacion: IDS.org,
    organizacion_nombre: 'Manufacturas Caribeñas de Precisión C.A.',
    organizacion_abreviacion: 'Manuf. Caribe',
    organizacion_rif: 'J-30555666-7',
    id_norma: 'norm-1',
    norma_codigo: norma,
    norma_titulo: norma,
    esquema: norma,
    id_estatus: 'est-1',
    estatus: 'Activo',
    id_sector_iaf: 'sec-1',
    sector_iaf: 17,
    sector_iaf_descripcion: 'Metalmecánica',
    id_subsector_iaf: 'sub-1',
    version_actual_numero: version,
    fecha_emision: '2025-01-01',
    fecha_vencimiento: '2028-01-01',
    alcance: 'Manufactura industrial.',
    multisitio: false,
    sitios: [],
    procesos: [],
    turnos: [],
    noAplicables: [],
    auditorias: [],
    fechas: [],
    contactos: [],
    deleted_at: null,
  });

  const certificados = [
    makeCert(IDS.cert1, 'FN-QMS-2025-101', 'ISO 9001:2015', 2),
    makeCert(IDS.cert2, 'FN-EMS-2025-102', 'ISO 14001:2015', 1),
    makeCert(IDS.cert3, 'FN-SST-2025-103', 'ISO 45001:2018', 1),
  ];

  const makeAudit = (
    id: string,
    certId: string,
    certNum: string,
    norma: string,
    programId: string | undefined,
    tipoVinculacion: ProgramacionAuditEntity['tipo_vinculacion'],
    tipoAuditoria: string
  ): ProgramacionAuditEntity => ({
    id,
    id_programa_auditoria: programId,
    codigo_auditoria: `AUD-0001-0001-2026`,
    id_certificado: certId,
    numero_certificado: certNum,
    version_numero: 2,
    id_organizacion: IDS.org,
    organizacion_nombre: 'Manufacturas Caribeñas de Precisión C.A.',
    organizacion_abreviacion: 'Manuf. Caribe',
    norma_codigo: norma,
    sector_iaf: 17,
    tipo_auditoria: tipoAuditoria,
    tipo_vinculacion: tipoVinculacion,
    metodologia: 'Presencial',
    fecha_inicio: '2026-06-10',
    fecha_fin: '2026-06-12',
    dias_auditor: 2,
    estatus: 'Planificado',
    estado_ciclo: 'Programada',
    auditor_lider_id: IDS.admin,
    auditor_lider: 'Carlos Méndez',
    sede_principal_direccion: 'Caracas',
    equipo: [],
    sitiosMuestreo: [],
    matrizNormativa: [],
    deleted_at: null,
  });

  const aud1 = makeAudit(
    IDS.aud1,
    IDS.cert1,
    'FN-QMS-2025-101',
    'ISO 9001:2015',
    IDS.prog,
    'Integrada',
    'Renovación'
  );
  const aud2 = makeAudit(
    IDS.aud2,
    IDS.cert2,
    'FN-EMS-2025-102',
    'ISO 14001:2015',
    IDS.prog,
    'Integrada',
    'Renovación'
  );
  const aud3 = makeAudit(
    IDS.aud3,
    IDS.cert3,
    'FN-SST-2025-103',
    'ISO 45001:2018',
    undefined,
    'Individual',
    'Seguimiento 1'
  );

  const programs: ProgramaAuditoriaEntity[] = [
    {
      id: IDS.prog,
      id_grupo_empresarial: IDS.cong,
      codigo_programa: 'L-AUD-0001-0001-2026',
      etiqueta: 'Campaña Integrada Caribe',
      nivel_vinculacion: 'NIVEL_1_INTRA_ORG',
      tipo_vinculacion: 'Integrada',
      es_vinculada: true,
      auditorias: [aud1, aud2],
      deleted_at: null,
    },
  ];

  return {
    profile,
    conglomerados,
    organizaciones,
    certificados,
    audits: [aud1, aud2, aud3],
    programs,
  };
}

describe('orgMultiViewPickerView', () => {
  it('renders List and Grid Multi View with table-fixed, 100% colgroup, 0 buttons in tbody, and Zero-UUID', () => {
    const data = createSampleData();
    const rows = buildOrgMultiViewRows<{ resumenTiempo: string }>({
      profile: data.profile,
      conglomerados: data.conglomerados,
      organizaciones: data.organizaciones,
      certificados: data.certificados,
      audits: data.audits,
      programs: data.programs,
      resolveCertMeta: (ctx) => ({
        domainExtra: {
          resumenTiempo: ctx.latestAudit ? `${ctx.latestAudit.dias_auditor}d` : '0d',
        },
        domainCells: {
          tiempo: ctx.latestAudit ? `${ctx.latestAudit.dias_auditor}d` : 'Sin asignar',
        },
      }),
    });

    const listHtml = renderOrgMultiView({
      domainKey: 'tiempo',
      title: 'Tiempo de Auditoría',
      subtitle: 'Seleccione una organización para gestionar los tiempos de sus certificados.',
      rows,
      searchQuery: '',
      viewMode: 'list',
      actionsHtml:
        '<button type="button" data-action="open-audit-wizard">+ Auditoría</button>',
      extraColumns: [
        {
          id: 'resumen_dominio',
          header: 'Días / Estado',
          defaultWidthPct: 26,
          renderCell: (row) =>
            `<span class="text-xs font-semibold">${row.certificates.length} cert. activos</span>`,
        },
      ],
    });

    assert.ok(listHtml.includes('table-fixed'));
    assert.ok(listHtml.includes('data-action="open-org-cert-picker"'));
    assert.ok(listHtml.includes(`data-org-id="${IDS.org}"`));
    assert.ok(listHtml.includes('+ Auditoría'));
    assert.equal(countButtonsInTbodies(listHtml), 0);

    const colSums = sumColgroupPercentages(listHtml);
    assert.equal(colSums.length, 1);
    assert.ok(Math.abs(colSums[0] - 100) < 0.05);

    const uuidAuditList = assertZeroUuidExposure(listHtml);
    assert.equal(uuidAuditList.compliant, true);

    const gridHtml = renderOrgMultiView({
      domainKey: 'tiempo',
      title: 'Tiempo de Auditoría',
      rows,
      searchQuery: '',
      viewMode: 'grid',
    });
    assert.ok(gridHtml.includes('<article'));
    assert.ok(gridHtml.includes('role="button"'));
    assert.ok(gridHtml.includes('data-action="open-org-cert-picker"'));
    assert.equal(assertZeroUuidExposure(gridHtml).compliant, true);
  });

  it('renders accessible Pop-up Modal with single search input, dynamic rowspan in Col 1, 0 buttons in tbody, and unambiguous row selection', () => {
    const data = createSampleData();
    const model = buildOrgCertPickerModalModel<{ dias: number }>({
      orgId: IDS.org,
      modalSearchQuery: '',
      profile: data.profile,
      conglomerados: data.conglomerados,
      organizaciones: data.organizaciones,
      certificados: data.certificados,
      audits: data.audits,
      programs: data.programs,
      resolveCertMeta: (ctx) => ({
        domainExtra: { dias: ctx.latestAudit?.dias_auditor ?? 0 },
        domainCells: {
          tipo: ctx.latestAudit?.tipo_auditoria || 'Sin tipo',
          dias: ctx.latestAudit ? `${ctx.latestAudit.dias_auditor} días` : '—',
        },
      }),
    });

    assert.ok(model);

    const domainColumns: OrgPickerDomainColumn<{ dias: number }>[] = [
      {
        id: 'tipo',
        header: 'Tipo',
        defaultWidthPct: 24,
        renderCell: (row) => `<span>${row.domainCells.tipo || '—'}</span>`,
      },
      {
        id: 'dias',
        header: 'Días',
        align: 'center',
        defaultWidthPct: 24,
        renderCell: (row) => `<span class="tabular-nums">${row.domainExtra.dias}d</span>`,
      },
    ];

    const modalHtml = renderOrgCertPickerModal({
      model,
      domainColumns,
    });

    // Dialog accessibility & close controls
    assert.ok(modalHtml.includes('role="dialog"'));
    assert.ok(modalHtml.includes('aria-modal="true"'));
    assert.ok(modalHtml.includes('data-action="close-org-picker-modal-backdrop"'));
    assert.ok(modalHtml.includes('data-action="close-org-picker-modal"'));
    assert.ok(modalHtml.includes('Cancelar'));

    // Single search input without clear button when empty
    const searchInputs = modalHtml.match(/data-action="search-org-picker-modal"/g) ?? [];
    assert.equal(searchInputs.length, 1);
    assert.equal(modalHtml.includes('data-action="clear-org-picker-modal-search"'), false);

    // Table invariants: table-fixed, colgroup sums to 100%, 0 <button> inside <tbody>
    assert.ok(modalHtml.includes('table-fixed'));
    assert.equal(countButtonsInTbodies(modalHtml), 0);
    const colSums = sumColgroupPercentages(modalHtml);
    assert.equal(colSums.length, 1);
    assert.ok(Math.abs(colSums[0] - 100) < 0.05);

    // Dynamic rowspan=2 emitted ONLY once for the 2-cert Integrada group, and non-navigating group cell action
    const rowspan2Matches = modalHtml.match(/rowspan="2"/g) ?? [];
    assert.equal(rowspan2Matches.length, 1);
    assert.ok(modalHtml.includes('Integrada (2)'));
    assert.ok(modalHtml.includes('data-action="org-picker-group-info"'));

    // Individual row uses rowspan=1
    const rowspan1Matches = modalHtml.match(/rowspan="1"/g) ?? [];
    assert.equal(rowspan1Matches.length, 1);

    // Every cert row unambiguously carries its own certId & auditId on cells 2..N and <tr>
    assert.ok(modalHtml.includes(`data-cert-id="${IDS.cert1}"`));
    assert.ok(modalHtml.includes(`data-cert-id="${IDS.cert2}"`));
    assert.ok(modalHtml.includes(`data-cert-id="${IDS.cert3}"`));
    assert.equal(assertZeroUuidExposure(modalHtml).compliant, true);

    // Filtered modal state shows clear search button and updates rowspan dynamically to 1
    const filteredModel = buildOrgCertPickerModalModel<{ dias: number }>({
      orgId: IDS.org,
      modalSearchQuery: 'FN-EMS-2025-102',
      profile: data.profile,
      conglomerados: data.conglomerados,
      organizaciones: data.organizaciones,
      certificados: data.certificados,
      audits: data.audits,
      programs: data.programs,
      resolveCertMeta: (ctx) => ({
        domainExtra: { dias: ctx.latestAudit?.dias_auditor ?? 0 },
      }),
    });
    const filteredHtml = renderOrgCertPickerModal({
      model: filteredModel,
      domainColumns,
    });
    assert.ok(filteredHtml.includes('data-action="clear-org-picker-modal-search"'));
    assert.equal((filteredHtml.match(/rowspan="2"/g) ?? []).length, 0);
    assert.equal((filteredHtml.match(/rowspan="1"/g) ?? []).length, 1);
    assert.ok(filteredHtml.includes('Mostrando 1 de 3 certificados'));

    // Empty modal returns ''
    assert.equal(renderOrgCertPickerModal({ model: null }), '');
  });
});
