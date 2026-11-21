import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { UserProfile } from './healthCheck';
import type { ProgramaAuditoriaEntity } from './auditPlanningEngine';
import type { ProgramacionAuditEntity } from './auditExecution';
import type { CertificadoDetailEntity } from './multisiteSampling';
import type { VinculoEntity } from './vinculoDomain';
import {
  DEFAULT_PROGRAMA_PROCESOS_STATE,
  renderProgramaProcesosDetailBody,
  renderProgramaProcesosView,
  type ProgramaProcesosViewState,
} from '../views/programaProcesosView';
import {
  DEFAULT_PROGRAMA_TURNOS_STATE,
  renderProgramaTurnosDetailBody,
  renderProgramaTurnosView,
  type ProgramaTurnosViewState,
} from '../views/programaTurnosView';
import {
  DEFAULT_PROGRAMA_STATE,
  renderProgramaView,
} from '../views/programaView';
import type {
  CalendarioViewState,
  ProgramacionViewState,
  ResultadoViewState,
} from './auditExecution';
import {
  renderAuditoriasView,
  type AuditoriasViewState,
} from '../views/auditoriasView';
import { assertZeroUuidExposure } from './zeroUuid';

const ADMIN_PROFILE: UserProfile = {
  id: '00000000-0000-4000-8000-000000000001',
  nombre: 'Admin Programa',
  role: 'ADMIN',
  status: 'APPROVED',
  created_at: '2026-01-01T00:00:00Z',
};

const AUDITOR_PROFILE: UserProfile = {
  id: '00000000-0000-4000-8000-000000000002',
  nombre: 'Auditor Designado',
  role: 'AUDITOR',
  status: 'APPROVED',
  created_at: '2026-01-01T00:00:00Z',
};

const CLIENT_PROFILE: UserProfile = {
  id: '00000000-0000-4000-8000-000000000003',
  nombre: 'Cliente Corporativo',
  role: 'CLIENT',
  status: 'APPROVED',
  created_at: '2026-01-01T00:00:00Z',
};

const IDs = {
  orgA: '11111111-1111-4111-8111-111111111111',
  orgB: '11111111-1111-4111-8111-111111111112',
  certA: '22222222-2222-4222-8222-222222222221',
  certB: '22222222-2222-4222-8222-222222222222',
  certNoAudits: '22222222-2222-4222-8222-222222222223',
  vinculoA: '33333333-3333-4333-8333-333333333331',
  progA: '44444444-4444-4444-8444-444444444441',
  auditPrev: '55555555-5555-4555-8555-555555555551',
  auditCurrent: '55555555-5555-4555-8555-555555555552',
  auditOtherOrg: '55555555-5555-4555-8555-555555555553',
  siteHq: '66666666-6666-4666-8666-666666666661',
  siteBranch: '66666666-6666-4666-8666-666666666662',
  siteOther: '66666666-6666-4666-8666-666666666663',
  saPrevHq: '77777777-7777-4777-8777-777777777771',
  saCurrentHq: '77777777-7777-4777-8777-777777777772',
  saCurrentBranch: '77777777-7777-4777-8777-777777777773',
  saOther: '77777777-7777-4777-8777-777777777774',
  procMedular: '88888888-8888-4888-8888-888888888881',
  procApoyo: '88888888-8888-4888-8888-888888888882',
  procEstrategico: '88888888-8888-4888-8888-888888888883',
  procBranchMedular: '88888888-8888-4888-8888-888888888884',
  ppsMedular: '99999999-9999-4999-8999-999999999991',
  ppsApoyo: '99999999-9999-4999-8999-999999999992',
  ppsEstrategico: '99999999-9999-4999-8999-999999999993',
  ppsBranchMedular: '99999999-9999-4999-8999-999999999994',
  psaPrevMedular: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  turnoPrevMatutino: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
  tpsHqMat: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
  tpsHqVesp: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc2',
  tpsBranchMat: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc3',
  turnoCatMat: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1',
  turnoCatVesp: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2',
};

function buildFixture() {
  const certificados: CertificadoDetailEntity[] = [
    {
      id: IDs.certA,
      id_organizacion: IDs.orgA,
      organizacion_nombre: 'Manufactura Andina S.A.',
      numero_certificado: 'CERT-9001-2026',
      norma_codigo: 'ISO 9001:2015',
      estatus: 'Vigente',
      sitios: [
        {
          id: IDs.siteHq,
          id_certificado: IDs.certA,
          numero_sitio: 0,
          nombre_sitio: 'Planta Central Quito',
          total_empleados: 120,
          procesos_por_sitio: [
            {
              id: IDs.ppsMedular,
              id_sitio: IDs.siteHq,
              id_proceso: IDs.procMedular,
              nombre_proceso: 'Producción Línea Continua',
              deleted_at: null,
            },
            {
              id: IDs.ppsApoyo,
              id_sitio: IDs.siteHq,
              id_proceso: IDs.procApoyo,
              nombre_proceso: 'Mantenimiento Preventivo',
              deleted_at: null,
            },
            {
              id: IDs.ppsEstrategico,
              id_sitio: IDs.siteHq,
              id_proceso: IDs.procEstrategico,
              nombre_proceso: 'Revisión por la Dirección',
              deleted_at: null,
            },
          ],
          turnos_por_sitio: [],
        },
        {
          id: IDs.siteBranch,
          id_certificado: IDs.certA,
          numero_sitio: 1,
          nombre_sitio: 'Bodega Norte Guayaquil',
          total_empleados: 45,
          procesos_por_sitio: [
            {
              id: IDs.ppsBranchMedular,
              id_sitio: IDs.siteBranch,
              id_proceso: IDs.procBranchMedular,
              nombre_proceso: 'Producción Línea Continua',
              deleted_at: null,
            },
          ],
          turnos_por_sitio: [
            {
              id: IDs.tpsBranchMat,
              id_sitio: IDs.siteBranch,
              id_turno: IDs.turnoCatMat,
              hora_entrada: '08:00:00',
              hora_salida: '16:00:00',
              descripcion: 'Turno Matutino',
              deleted_at: null,
            },
          ],
        },
      ],
      procesos: [
        {
          id: IDs.procMedular,
          id_certificado: IDs.certA,
          nombre_proceso: 'Producción Línea Continua',
          tipo: 'Medular',
          clausulas_cubiertas: ['8.1', '8.5'],
        },
        {
          id: IDs.procApoyo,
          id_certificado: IDs.certA,
          nombre_proceso: 'Mantenimiento Preventivo',
          tipo: 'De Apoyo',
          clausulas_cubiertas: ['7.1.3'],
        },
        {
          id: IDs.procEstrategico,
          id_certificado: IDs.certA,
          nombre_proceso: 'Revisión por la Dirección',
          tipo: 'Estratégico',
          clausulas_cubiertas: ['9.3'],
        },
        {
          id: IDs.procBranchMedular,
          id_certificado: IDs.certA,
          nombre_proceso: 'Producción Línea Continua',
          tipo: 'Medular',
          clausulas_cubiertas: ['8.5'],
        },
      ],
      turnos: [],
      noAplicables: [],
      fechasHistoricas: [],
    },
    {
      id: IDs.certB,
      id_organizacion: IDs.orgB,
      organizacion_nombre: 'Logística Externa Ltda.',
      numero_certificado: 'CERT-14001-999',
      norma_codigo: 'ISO 14001:2015',
      estatus: 'Vigente',
      sitios: [
        {
          id: IDs.siteOther,
          id_certificado: IDs.certB,
          numero_sitio: 0,
          nombre_sitio: 'Terminal Sur',
          total_empleados: 40,
          procesos_por_sitio: [],
          turnos_por_sitio: [],
        },
      ],
      procesos: [],
      turnos: [],
      noAplicables: [],
      fechasHistoricas: [],
    },
    {
      id: IDs.certNoAudits,
      id_organizacion: IDs.orgA,
      organizacion_nombre: 'Manufactura Andina S.A.',
      numero_certificado: 'CERT-45001-NEW',
      norma_codigo: 'ISO 45001:2018',
      estatus: 'Vigente',
      sitios: [],
      procesos: [],
      turnos: [],
      noAplicables: [],
      fechasHistoricas: [],
    },
  ];

  const vinculos: VinculoEntity[] = [
    {
      id: IDs.vinculoA,
      codigo_vinculo: 'VIN-ANDINA-01',
      etiqueta: 'Campaña Anual Andina 2026',
      naturaleza: 'NORMAL',
      certificados: [],
      created_at: '2026-01-01T00:00:00Z',
    },
  ];

  const auditPrev: ProgramacionAuditEntity = {
    id: IDs.auditPrev,
    codigo_auditoria: 'AUD-2025-01',
    id_certificado: IDs.certA,
    numero_certificado: 'CERT-9001-2026',
    id_organizacion: IDs.orgA,
    organizacion_nombre: 'Manufactura Andina S.A.',
    norma_codigo: 'ISO 9001:2015',
    id_programa_auditoria: IDs.progA,
    id_tipo_auditoria: 't1111111-1111-4111-8111-111111111111',
    tipo_auditoria: 'Seguimiento 1',
    metodologia: 'Presencial',
    estatus: 'Cerrada',
    estado_ciclo: 'Auditada',
    fecha_inicio: '2025-05-10',
    fecha_fin: '2025-05-12',
    auditor_lider_id: AUDITOR_PROFILE.id,
    auditor_lider_nombre: AUDITOR_PROFILE.nombre,
    fechas: [
      {
        id: 'f1111111-1111-4111-8111-111111111111',
        id_auditoria: IDs.auditPrev,
        tipo_fecha: 'REAL',
        precision: 'EXACTA',
        fecha_inicio: '2025-05-10',
        fecha_fin: '2025-05-12',
        etiqueta: 'AUDITORIA_REAL',
      },
    ],
    sitiosPlan: [
      {
        id: IDs.saPrevHq,
        id_auditoria: IDs.auditPrev,
        id_sitio: IDs.siteHq,
        numero_sitio: 0,
        nombre_sitio: 'Planta Central Quito',
        tiempo_auditoria: 2,
        procesos: [
          {
            id: IDs.psaPrevMedular,
            id_sitios_por_auditoria: IDs.saPrevHq,
            id_procesos_por_sitio: IDs.ppsMedular,
            id_proceso: IDs.procMedular,
            proceso_nombre: 'Producción Línea Continua',
            turnos: [
              {
                id: IDs.turnoPrevMatutino,
                id_procesos_sitio_auditoria: IDs.psaPrevMedular,
                id_turnos_sitio_auditoria: 'c1111111-1111-4111-8111-111111111111',
                id_turnos_por_sitio: IDs.tpsHqMat,
                descripcion_turno: 'Turno Matutino',
                hora_entrada: '08:00',
                hora_salida: '16:00',
              },
            ],
            equipoProceso: [
              {
                id: 'd1111111-1111-4111-8111-111111111111',
                id_procesos_sitio_auditoria: IDs.psaPrevMedular,
                id_equipo_sitio: 'e1111111-1111-4111-8111-111111111111',
                id_auditor: AUDITOR_PROFILE.id,
                auditor_nombre: AUDITOR_PROFILE.nombre,
                rol: 'AUDITOR_PROCESO',
              },
            ],
          },
        ],
        equipoSitio: [],
      },
    ],
    equipo: [],
    hallazgosCount: 0,
  };

  const auditCurrent: ProgramacionAuditEntity = {
    id: IDs.auditCurrent,
    codigo_auditoria: 'AUD-2026-01',
    id_certificado: IDs.certA,
    numero_certificado: 'CERT-9001-2026',
    id_organizacion: IDs.orgA,
    organizacion_nombre: 'Manufactura Andina S.A.',
    norma_codigo: 'ISO 9001:2015',
    id_programa_auditoria: IDs.progA,
    id_tipo_auditoria: 't1111111-1111-4111-8111-111111111111',
    tipo_auditoria: 'Seguimiento 2',
    metodologia: 'Presencial',
    estatus: 'Planificada',
    estado_ciclo: 'Planificada',
    fecha_inicio: '2026-06-14',
    fecha_fin: '2026-06-16',
    auditor_lider_id: AUDITOR_PROFILE.id,
    auditor_lider_nombre: AUDITOR_PROFILE.nombre,
    fechas: [
      {
        id: 'f2222222-2222-4222-8222-222222222222',
        id_auditoria: IDs.auditCurrent,
        tipo_fecha: 'PROGRAMADA',
        precision: 'EXACTA',
        fecha_inicio: '2026-06-14',
        fecha_fin: '2026-06-16',
        etiqueta: 'PLAN_ACTUAL',
      },
    ],
    sitiosPlan: [
      {
        id: IDs.saCurrentHq,
        id_auditoria: IDs.auditCurrent,
        id_sitio: IDs.siteHq,
        numero_sitio: 0,
        nombre_sitio: 'Planta Central Quito',
        tiempo_auditoria: 2,
        procesos: [],
        equipoSitio: [],
      },
    ],
    equipo: [],
    hallazgosCount: 0,
  };

  const auditOtherOrg: ProgramacionAuditEntity = {
    id: IDs.auditOtherOrg,
    codigo_auditoria: 'AUD-2026-OTHER',
    id_certificado: IDs.certB,
    numero_certificado: 'CERT-14001-999',
    id_organizacion: IDs.orgB,
    organizacion_nombre: 'Logística Externa Ltda.',
    norma_codigo: 'ISO 14001:2015',
    id_tipo_auditoria: 't1111111-1111-4111-8111-111111111112',
    tipo_auditoria: 'Recertificación',
    metodologia: 'Híbrida',
    estatus: 'Planificada',
    estado_ciclo: 'Planificada',
    fecha_inicio: '2026-09-01',
    fecha_fin: '2026-09-02',
    fechas: [
      {
        id: 'f3333333-3333-4333-8333-333333333333',
        id_auditoria: IDs.auditOtherOrg,
        tipo_fecha: 'PROGRAMADA',
        precision: 'EXACTA',
        fecha_inicio: '2026-09-01',
        fecha_fin: '2026-09-02',
        etiqueta: 'PLAN_ACTUAL',
      },
    ],
    sitiosPlan: [
      {
        id: IDs.saOther,
        id_auditoria: IDs.auditOtherOrg,
        id_sitio: IDs.siteOther,
        numero_sitio: 0,
        nombre_sitio: 'Terminal Sur',
        tiempo_auditoria: 1,
        procesos: [],
        equipoSitio: [],
      },
    ],
    equipo: [],
    hallazgosCount: 0,
  };

  const programs: ProgramaAuditoriaEntity[] = [
    {
      id: IDs.progA,
      codigo_programa: 'PRG-ANDINA-2026',
      etiqueta: 'Ciclo Andina 2026',
      naturaleza: 'NORMAL',
      nivel_vinculo: 'CERTIFICADO_UNICO',
      id_vinculo: IDs.vinculoA,
      metodologia: 'Presencial',
      auditorias: [auditPrev, auditCurrent],
      created_at: '2026-01-01T00:00:00Z',
    },
  ];

  return {
    certificados,
    vinculos,
    programs,
    audits: [auditPrev, auditCurrent, auditOtherOrg],
    auditPrev,
    auditCurrent,
  };
}

function extractColgroupWidths(html: string): number[] {
  const colgroupMatch = html.match(/<colgroup>([\s\S]*?)<\/colgroup>/);
  if (!colgroupMatch) return [];
  const matches = [...colgroupMatch[1].matchAll(/width:\s*([0-9.]+)%/g)];
  return matches.map((m) => Number(m[1]));
}

describe('Step 7.1 — 4. Proceso & 5. Turno Certificate-Based Views', () => {
  it('4. Proceso Multi View renders proceso-main table-fixed with 100% colgroup, 0 buttons in tbody, reactive facets, and Zero-UUID', () => {
    const fx = buildFixture();
    const html = renderProgramaProcesosView({
      profile: ADMIN_PROFILE,
      state: DEFAULT_PROGRAMA_PROCESOS_STATE,
      audits: fx.audits,
      programs: fx.programs,
      vinculos: fx.vinculos,
      certificados: fx.certificados,
    });

    assert.match(html, /data-resizable-table="proceso-main"/);
    assert.match(html, /table-fixed/);

    const widths = extractColgroupWidths(html);
    assert.equal(widths.length, 4);
    const sum = widths.reduce((acc, n) => acc + n, 0);
    assert.ok(Math.abs(sum - 100) < 0.01, `colgroup sum expected 100%, got ${sum}`);

    const tbodyMatch = html.match(/<tbody[\s\S]*?<\/tbody>/);
    assert.ok(tbodyMatch, 'tbody should be rendered');
    assert.equal(/<button/i.test(tbodyMatch[0]), false, 'Zero <button> allowed inside <tbody>');

    assert.match(html, /4\. Proceso/);
    assert.match(html, /Pendiente/);
    assert.match(html, /Completo/);
    assert.match(html, /Sin auditorías/);
    assert.match(html, /Con procesos nunca auditados/);
    assert.match(html, /CERT-9001-2026/);
    assert.match(html, /CERT-45001-NEW/);
    assert.match(html, /data-action="select-section-cert"/);

    const uuidCheck = assertZeroUuidExposure(html);
    assert.equal(uuidCheck.compliant, true, `Zero-UUID violations: ${uuidCheck.exposedUuids.join(', ')}`);
  });

  it('4. Proceso Detail View renders renderAuditSectionShell (showLinkedSiblings: false), Seleccionar todos, Limpiar, quick presets, cycle windows & drawer', () => {
    const fx = buildFixture();
    const drawerKey = `${IDs.saCurrentHq}:${IDs.ppsMedular}`;
    const detailState: ProgramaProcesosViewState = {
      ...DEFAULT_PROGRAMA_PROCESOS_STATE,
      selectedCertId: IDs.certA,
      selectedAuditId: IDs.auditCurrent,
      openHistoryDrawerProcessIds: [drawerKey],
    };

    const html = renderProgramaProcesosView({
      profile: ADMIN_PROFILE,
      state: detailState,
      audits: fx.audits,
      programs: fx.programs,
      vinculos: fx.vinculos,
      certificados: fx.certificados,
    });

    assert.match(html, /data-action="back-to-section-multi-view"/);
    assert.match(html, /data-subview="proceso"/);
    assert.match(html, /4\. Proceso · CERT-9001-2026/);
    assert.match(html, /AUD-2026-01/);
    assert.doesNotMatch(html, /Certificados vinculados/);
    assert.match(html, /data-action="step-section-audit"/);

    assert.match(html, /data-action="programa-select-all-site"/);
    assert.match(html, /Seleccionar todos/);
    assert.match(html, /data-action="programa-clear-site"/);
    assert.match(html, /Limpiar/);

    assert.match(html, /Seleccionar todos los Medulares/);
    assert.match(html, /Seleccionar no auditados en el último año/);
    assert.match(html, /Copiar del ciclo anterior/);

    assert.match(html, /Nunca auditado/);
    assert.match(html, /Auditado 1 de 2 veces/);
    assert.match(html, /Auditado 0 de 2 veces/);
    assert.match(html, /grid-cols-3 sm:grid-cols-5/);
    assert.doesNotMatch(html, /overflow-x-scroll/);

    assert.match(html, /data-testid="programa-process-history-drawer"/);
    assert.match(html, /Turno Matutino/);
    assert.match(html, /Auditor Designado/);

    const detailBodyHtml = renderProgramaProcesosDetailBody({
      audit: fx.auditCurrent,
      program: fx.programs[0],
      allAudits: fx.audits,
      allProcessesPorSitio: fx.certificados[0].sitios[0].procesos_por_sitio || [],
      allProcesses: fx.certificados[0].procesos,
      cycleWindowOffset: 0,
      openHistoryDrawerProcessIds: [],
      isStaff: true,
    });
    assert.equal(/<select\b/i.test(detailBodyHtml), false, 'Must have 0 <select> controls in 4. Proceso body');

    const uuidCheck = assertZeroUuidExposure(html);
    assert.equal(uuidCheck.compliant, true, `Zero-UUID violations: ${uuidCheck.exposedUuids.join(', ')}`);
  });

  it('5. Turno Multi View renders turno-main table-fixed with 100% colgroup, 0 buttons in tbody, Cobertura Turnos, and Zero-UUID', () => {
    const fx = buildFixture();
    const html = renderProgramaTurnosView({
      profile: ADMIN_PROFILE,
      state: DEFAULT_PROGRAMA_TURNOS_STATE,
      audits: fx.audits,
      programs: fx.programs,
      vinculos: fx.vinculos,
      certificados: fx.certificados,
    });

    assert.match(html, /data-resizable-table="turno-main"/);
    assert.match(html, /table-fixed/);

    const widths = extractColgroupWidths(html);
    assert.equal(widths.length, 4);
    const sum = widths.reduce((acc, n) => acc + n, 0);
    assert.ok(Math.abs(sum - 100) < 0.01, `colgroup sum expected 100%, got ${sum}`);

    const tbodyMatch = html.match(/<tbody[\s\S]*?<\/tbody>/);
    assert.ok(tbodyMatch, 'tbody should be rendered');
    assert.equal(/<button/i.test(tbodyMatch[0]), false, 'Zero <button> allowed inside <tbody>');

    assert.match(html, /5\. Turno/);
    assert.match(html, /Cobertura Turnos/);
    assert.match(html, /Sitio↔Proceso cubiertos/);
    assert.match(html, /data-action="select-section-cert"/);

    const uuidCheck = assertZeroUuidExposure(html);
    assert.equal(uuidCheck.compliant, true, `Zero-UUID violations: ${uuidCheck.exposedUuids.join(', ')}`);
  });

  it('5. Turno Detail View renders Anti-Fatigue Matrix (sticky nav, batch chips, column toggle, 1-shift autofill, homonymous propagation)', () => {
    const fx = buildFixture();
    const psa1Id = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1';
    const psa2Id = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd2';
    const psaBranchId = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd3';

    const certsWithShifts: CertificadoDetailEntity[] = [
      {
        ...fx.certificados[0],
        sitios: [
          {
            ...fx.certificados[0].sitios[0],
            turnos_por_sitio: [
              {
                id: IDs.tpsHqMat,
                id_sitio: IDs.siteHq,
                id_turno: IDs.turnoCatMat,
                hora_entrada: '08:00:00',
                hora_salida: '16:00:00',
                descripcion: 'Turno Matutino',
                deleted_at: null,
              },
              {
                id: IDs.tpsHqVesp,
                id_sitio: IDs.siteHq,
                id_turno: IDs.turnoCatVesp,
                hora_entrada: '16:00:00',
                hora_salida: '00:00:00',
                descripcion: 'Turno Vespertino',
                deleted_at: null,
              },
            ],
          },
          fx.certificados[0].sitios[1],
        ],
      },
      ...fx.certificados.slice(1),
    ];

    const multiSiteAudit: ProgramacionAuditEntity = {
      ...fx.auditCurrent,
      sitiosPlan: [
        {
          id: IDs.saCurrentHq,
          id_auditoria: IDs.auditCurrent,
          id_sitio: IDs.siteHq,
          numero_sitio: 0,
          nombre_sitio: 'Planta Central Quito',
          tiempo_auditoria: 2,
          procesos: [
            {
              id: psa1Id,
              id_sitios_por_auditoria: IDs.saCurrentHq,
              id_procesos_por_sitio: IDs.ppsMedular,
              id_proceso: IDs.procMedular,
              proceso_nombre: 'Producción Línea Continua',
              turnos: [
                {
                  id: 'ffffffff-ffff-4fff-8fff-fffffffffff1',
                  id_procesos_sitio_auditoria: psa1Id,
                  id_turnos_sitio_auditoria: '99999999-1111-4111-8111-111111111111',
                  id_turnos_por_sitio: IDs.tpsHqMat,
                  descripcion_turno: 'Turno Matutino',
                  hora_entrada: '08:00',
                  hora_salida: '16:00',
                  deleted_at: null,
                },
              ],
              equipoProceso: [],
              deleted_at: null,
            },
            {
              id: psa2Id,
              id_sitios_por_auditoria: IDs.saCurrentHq,
              id_procesos_por_sitio: IDs.ppsApoyo,
              id_proceso: IDs.procApoyo,
              proceso_nombre: 'Mantenimiento Preventivo',
              turnos: [],
              equipoProceso: [],
              deleted_at: null,
            },
          ],
          equipoSitio: [],
        },
        {
          id: IDs.saCurrentBranch,
          id_auditoria: IDs.auditCurrent,
          id_sitio: IDs.siteBranch,
          numero_sitio: 1,
          nombre_sitio: 'Bodega Norte Guayaquil',
          tiempo_auditoria: 1,
          procesos: [
            {
              id: psaBranchId,
              id_sitios_por_auditoria: IDs.saCurrentBranch,
              id_procesos_por_sitio: IDs.ppsBranchMedular,
              id_proceso: IDs.procBranchMedular,
              proceso_nombre: 'Producción Línea Continua',
              turnos: [],
              equipoProceso: [],
              deleted_at: null,
            },
          ],
          equipoSitio: [],
        },
      ],
    };

    const turnosState: ProgramaTurnosViewState = {
      ...DEFAULT_PROGRAMA_TURNOS_STATE,
      selectedCertId: IDs.certA,
      selectedAuditId: IDs.auditCurrent,
      batchSelectedTpsIdsBySitePlanId: {
        [IDs.saCurrentHq]: [IDs.tpsHqMat, IDs.tpsHqVesp],
      },
    };

    const html = renderProgramaTurnosView({
      profile: ADMIN_PROFILE,
      state: turnosState,
      audits: [fx.auditPrev, multiSiteAudit],
      programs: fx.programs,
      vinculos: fx.vinculos,
      certificados: certsWithShifts,
    });

    assert.match(html, /data-action="back-to-section-multi-view"/);
    assert.match(html, /data-subview="turno"/);
    assert.match(html, /5\. Turno · CERT-9001-2026/);
    assert.doesNotMatch(html, /Certificados vinculados/);
    assert.match(html, /data-testid="turno-sticky-site-nav"/);
    assert.match(html, /Todos los sitios/);
    assert.match(html, /Solo pendientes \(2\)/);
    assert.match(html, /← Sitio anterior/);
    assert.match(html, /Sitio siguiente →/);

    assert.match(html, /data-testid="turno-anti-fatigue-toolbar"/);
    assert.match(html, /data-action="turno-toggle-batch-chip"/);
    assert.match(html, /data-action="turno-apply-batch-pending"/);
    assert.match(html, /Aplicar a 1 proceso pendiente/);
    assert.match(html, /data-action="turno-autofill-single-shift"/);
    assert.match(html, /Cubrir pendientes con turno único/);
    assert.match(html, /data-action="turno-propagate-homonymous"/);
    assert.match(html, /Propagar a procesos homónimos/);

    const matrixMatches = [...html.matchAll(/<table[^>]*data-testid="turno-matrix-table"[\s\S]*?<\/table>/g)];
    assert.equal(matrixMatches.length, 2);
    for (const tableMatch of matrixMatches) {
      assert.match(tableMatch[0], /table-fixed/);
      const widths = extractColgroupWidths(tableMatch[0]);
      const sum = widths.reduce((acc, n) => acc + n, 0);
      assert.ok(Math.abs(sum - 100) < 0.01, `matrix colgroup sum expected 100%, got ${sum}`);
      const tbodyMatch = tableMatch[0].match(/<tbody[\s\S]*?<\/tbody>/);
      assert.ok(tbodyMatch);
      assert.equal(/<button/i.test(tbodyMatch[0]), false, 'Zero <button> allowed inside matrix <tbody>');
    }

    assert.match(html, /data-action="turno-toggle-column-shift"/);
    assert.match(html, /08:00 – 16:00/);
    assert.match(html, /16:00 – 00:00/);
    assert.match(html, /Pendiente turno/);
    assert.match(html, /1 turno/);

    const detailBodyHtml = renderProgramaTurnosDetailBody({
      audit: multiSiteAudit,
      program: fx.programs[0],
      allAudits: [fx.auditPrev, multiSiteAudit],
      allProcessesPorSitio: [
        ...(certsWithShifts[0].sitios[0].procesos_por_sitio || []),
        ...(certsWithShifts[0].sitios[1].procesos_por_sitio || []),
      ],
      allProcesses: certsWithShifts[0].procesos,
      allTurnosPorSitio: [
        ...(certsWithShifts[0].sitios[0].turnos_por_sitio || []),
        ...(certsWithShifts[0].sitios[1].turnos_por_sitio || []),
      ],
      focusedSitePlanId: IDs.saCurrentHq,
      onlyPending: true,
      batchSelectedTpsIdsBySitePlanId: {},
      isStaff: true,
    });
    assert.equal(/<select\b/i.test(detailBodyHtml), false, 'Must have 0 <select> controls in 5. Turno body');
    assert.match(detailBodyHtml, /Mantenimiento Preventivo/);
    assert.doesNotMatch(detailBodyHtml, /Producción Línea Continua/, 'onlyPending=true must filter covered rows');
    const siteCards = [
      ...detailBodyHtml.matchAll(/<section[^>]*data-testid="programa-site-turnos-card"[^>]*>/g),
    ];
    assert.equal(siteCards.length, 1, 'focusedSitePlanId must render only the target site card');
    assert.match(siteCards[0][0], new RegExp(IDs.saCurrentHq));

    const uuidCheck = assertZeroUuidExposure(html);
    assert.equal(uuidCheck.compliant, true, `Zero-UUID violations: ${uuidCheck.exposedUuids.join(', ')}`);
  });

  it('5. Turno renders missing-shifts alert + 0-processes bridge cleanly for Staff vs Read-Only', () => {
    const fx = buildFixture();
    const psaPendingId = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd9';
    const auditMissingShifts: ProgramacionAuditEntity = {
      ...fx.auditCurrent,
      sitiosPlan: [
        {
          ...fx.auditCurrent.sitiosPlan![0],
          procesos: [
            {
              id: psaPendingId,
              id_sitios_por_auditoria: IDs.saCurrentHq,
              id_procesos_por_sitio: IDs.ppsMedular,
              id_proceso: IDs.procMedular,
              proceso_nombre: 'Producción Línea Continua',
              turnos: [],
              equipoProceso: [],
              deleted_at: null,
            },
          ],
        },
      ],
    };

    const staffHtml = renderProgramaTurnosView({
      profile: ADMIN_PROFILE,
      state: { ...DEFAULT_PROGRAMA_TURNOS_STATE, selectedCertId: IDs.certA, selectedAuditId: IDs.auditCurrent },
      audits: [fx.auditPrev, auditMissingShifts],
      programs: fx.programs,
      vinculos: fx.vinculos,
      certificados: fx.certificados, // HQ has turnos_por_sitio: []
    });
    assert.match(staffHtml, /data-testid="programa-site-no-shifts-alert"/);
    assert.match(staffHtml, /data-parent-type="sitio"/);
    assert.match(staffHtml, /Certificado → Sitio/);
    assert.equal(assertZeroUuidExposure(staffHtml).compliant, true);

    const auditorHtml = renderProgramaTurnosView({
      profile: AUDITOR_PROFILE,
      state: { ...DEFAULT_PROGRAMA_TURNOS_STATE, selectedCertId: IDs.certA, selectedAuditId: IDs.auditCurrent },
      audits: [fx.auditPrev, auditMissingShifts],
      programs: fx.programs,
      vinculos: fx.vinculos,
      certificados: fx.certificados,
    });
    assert.match(auditorHtml, /data-testid="programa-site-no-shifts-alert"/);
    assert.match(auditorHtml, /Solo lectura/);
    assert.doesNotMatch(auditorHtml, /data-parent-type="sitio"/);

    const emptyProcessesHtml = renderProgramaTurnosView({
      profile: ADMIN_PROFILE,
      state: { ...DEFAULT_PROGRAMA_TURNOS_STATE, selectedCertId: IDs.certA, selectedAuditId: IDs.auditCurrent },
      audits: [fx.auditPrev, fx.auditCurrent],
      programs: fx.programs,
      vinculos: fx.vinculos,
      certificados: fx.certificados,
    });
    assert.match(emptyProcessesHtml, /Ir a 4\. Proceso →/);
  });

  it('enforces RBAC read-only on AUDITOR and CLIENT across both 4. Proceso and 5. Turno', () => {
    const fx = buildFixture();

    const auditorMulti = renderProgramaProcesosView({
      profile: AUDITOR_PROFILE,
      state: DEFAULT_PROGRAMA_PROCESOS_STATE,
      audits: fx.audits,
      programs: fx.programs,
      vinculos: fx.vinculos,
      certificados: fx.certificados,
    });
    assert.match(auditorMulti, /CERT-9001-2026/);
    assert.doesNotMatch(auditorMulti, /CERT-14001-999/);

    const auditorDetail = renderProgramaProcesosView({
      profile: AUDITOR_PROFILE,
      state: {
        ...DEFAULT_PROGRAMA_PROCESOS_STATE,
        selectedCertId: IDs.certA,
        selectedAuditId: IDs.auditCurrent,
      },
      audits: fx.audits,
      programs: fx.programs,
      vinculos: fx.vinculos,
      certificados: fx.certificados,
    });
    assert.match(auditorDetail, /Solo lectura/);
    const checkboxTags = [
      ...auditorDetail.matchAll(/<input[^>]*data-action="toggle-programa-process"[^>]*>/g),
    ];
    assert.ok(checkboxTags.length >= 3);
    assert.ok(checkboxTags.every((m) => /\bdisabled\b/.test(m[0])), 'Auditor process checkboxes must be disabled');

    const batchBtns = [
      ...auditorDetail.matchAll(/<button[^>]*data-action="programa-(select-all-site|clear-site|quick-select)"[^>]*>/g),
    ];
    assert.ok(batchBtns.length >= 5);
    assert.ok(batchBtns.every((m) => /\bdisabled\b/.test(m[0])), 'Auditor batch/quick buttons must be disabled');

    const clientTurnosMulti = renderProgramaTurnosView({
      profile: CLIENT_PROFILE,
      state: DEFAULT_PROGRAMA_TURNOS_STATE,
      audits: fx.audits,
      programs: fx.programs,
      vinculos: fx.vinculos,
      certificados: fx.certificados,
      authorizedClientOrgIds: [IDs.orgA],
    });
    assert.match(clientTurnosMulti, /CERT-9001-2026/);
    assert.doesNotMatch(clientTurnosMulti, /CERT-14001-999/);

    const auditWithProc: ProgramacionAuditEntity = {
      ...fx.auditCurrent,
      sitiosPlan: [
        {
          ...fx.auditCurrent.sitiosPlan![0],
          procesos: [
            {
              id: 'dddddddd-dddd-4ddd-8ddd-ddddddddddd5',
              id_sitios_por_auditoria: IDs.saCurrentHq,
              id_procesos_por_sitio: IDs.ppsBranchMedular,
              id_proceso: IDs.procBranchMedular,
              proceso_nombre: 'Producción Línea Continua',
              turnos: [],
              equipoProceso: [],
              deleted_at: null,
            },
          ],
          id_sitio: IDs.siteBranch,
          nombre_sitio: 'Bodega Norte Guayaquil',
          numero_sitio: 1,
        },
      ],
    };

    const clientTurnosDetail = renderProgramaTurnosView({
      profile: CLIENT_PROFILE,
      state: {
        ...DEFAULT_PROGRAMA_TURNOS_STATE,
        selectedCertId: IDs.certA,
        selectedAuditId: IDs.auditCurrent,
      },
      audits: [fx.auditPrev, auditWithProc],
      programs: fx.programs,
      vinculos: fx.vinculos,
      certificados: fx.certificados,
      authorizedClientOrgIds: [IDs.orgA],
    });
    assert.match(clientTurnosDetail, /Solo lectura/);
    assert.doesNotMatch(clientTurnosDetail, /data-testid="turno-anti-fatigue-toolbar"/);
    assert.doesNotMatch(clientTurnosDetail, /data-action="turno-toggle-column-shift"/);
    const shiftChks = [
      ...clientTurnosDetail.matchAll(
        /<input[^>]*data-action="toggle-programa-process-shift"[^>]*>/g
      ),
    ];
    assert.equal(shiftChks.length, 1);
    assert.ok(shiftChks.every((m) => /\bdisabled\b/.test(m[0])), 'Client shift checkboxes must be disabled');
  });

  it('wires renderAuditoriasView for proceso, turno, and legacy programa alias + preserves renderProgramaView compatibility', () => {
    const fx = buildFixture();
    const baseProgramacionState: ProgramacionViewState = {
      selectedAuditId: null,
      activeChildTab: 'equipo',
      query: '',
      selectedTipo: 'ALL',
      selectedMetodologia: 'ALL',
      selectedEstatus: 'ALL',
      selectedAuditorLider: 'ALL',
      viewMode: 'grid',
      sortColumn: null,
      sortDirection: 'none',
      isPlanningModalOpen: false,
      isEditingAttributes: false,
      isAddingTeamMember: false,
    };
    const baseCalendarioState: CalendarioViewState = {
      displayMode: 'mes',
      referenceYear: 2026,
      referenceMonth: 6,
      filterAuditorId: 'ALL',
      filterStandard: 'ALL',
      filterMethodology: 'ALL',
      drawerAuditId: null,
    };
    const baseResultadoState: ResultadoViewState = {
      selectedAuditId: 'ALL',
      activeAuditIdForDecision: fx.auditCurrent.id,
      displayMode: 'list',
      filterType: 'ALL',
      filterLifecycle: 'ALL',
      searchQuery: '',
      isLoggingFinding: false,
      inspectingFindingId: null,
    };

    const baseAuditoriaState: AuditoriasViewState = {
      activeSubSection: 'proceso',
      selectedCertId: IDs.certA,
      selectedAuditId: IDs.auditCurrent,
      programaProcesosState: {
        ...DEFAULT_PROGRAMA_PROCESOS_STATE,
        selectedCertId: IDs.certA,
        selectedAuditId: IDs.auditCurrent,
      },
      programaTurnosState: {
        ...DEFAULT_PROGRAMA_TURNOS_STATE,
        selectedCertId: IDs.certA,
        selectedAuditId: IDs.auditCurrent,
      },
      programacionState: baseProgramacionState,
      calendarioState: baseCalendarioState,
      resultadoState: baseResultadoState,
      programacionAudits: fx.audits,
      auditPrograms: fx.programs,
      allVinculos: fx.vinculos,
      allCertificadosDetailed: fx.certificados,
      phase5Findings: [],
      allAuditorsDetailed: [],
      certificates: [],
      processes: [],
      requirements: [],
      standards: [],
      loading: false,
    };

    const procesoHtml = renderAuditoriasView(ADMIN_PROFILE, baseAuditoriaState);
    assert.match(procesoHtml, /4\. Proceso/);
    assert.match(procesoHtml, /5\. Turno/);
    assert.match(procesoHtml, /Selección de Procesos por Sitio/);

    const legacyProgramaHtml = renderAuditoriasView(ADMIN_PROFILE, {
      ...baseAuditoriaState,
      activeSubSection: 'programa',
    });
    assert.match(legacyProgramaHtml, /Selección de Procesos por Sitio/);

    const turnoHtml = renderAuditoriasView(ADMIN_PROFILE, {
      ...baseAuditoriaState,
      activeSubSection: 'turno',
    });
    assert.match(turnoHtml, /Cobertura de Turnos/);

    const compatProcesos = renderProgramaView({
      profile: ADMIN_PROFILE,
      state: DEFAULT_PROGRAMA_STATE,
      audits: fx.audits,
      programs: fx.programs,
      vinculos: fx.vinculos,
      certificados: fx.certificados,
    });
    assert.match(compatProcesos, /data-resizable-table="proceso-main"/);

    const compatTurnos = renderProgramaView({
      profile: ADMIN_PROFILE,
      state: { ...DEFAULT_PROGRAMA_STATE, activeMiniStep: 'turnos' },
      audits: fx.audits,
      programs: fx.programs,
      vinculos: fx.vinculos,
      certificados: fx.certificados,
    });
    assert.match(compatTurnos, /data-resizable-table="turno-main"/);
  });
});
