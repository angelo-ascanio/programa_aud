import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { UserProfile } from './healthCheck';
import type { ProgramaAuditoriaEntity } from './auditPlanningEngine';
import type { ProgramacionAuditEntity } from './auditExecution';
import type { CertificadoDetailEntity } from './multisiteSampling';
import type { VinculoEntity } from './vinculoDomain';
import {
  DEFAULT_PROGRAMA_STATE,
  renderProgramaView,
  type ProgramaViewState,
} from '../views/programaView';
import { renderProgramaProcesosView } from '../views/programaProcesosView';
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
  vinculoA: '33333333-3333-4333-8333-333333333331',
  progA: '44444444-4444-4444-8444-444444444441',
  auditPrev: '55555555-5555-4555-8555-555555555551',
  auditCurrent: '55555555-5555-4555-8555-555555555552',
  auditOtherOrg: '55555555-5555-4555-8555-555555555553',
  siteHq: '66666666-6666-4666-8666-666666666661',
  siteOther: '66666666-6666-4666-8666-666666666662',
  saPrevHq: '77777777-7777-4777-8777-777777777771',
  saCurrentHq: '77777777-7777-4777-8777-777777777772',
  saOther: '77777777-7777-4777-8777-777777777773',
  procMedular: '88888888-8888-4888-8888-888888888881',
  procApoyo: '88888888-8888-4888-8888-888888888882',
  procEstrategico: '88888888-8888-4888-8888-888888888883',
  ppsMedular: '99999999-9999-4999-8999-999999999991',
  ppsApoyo: '99999999-9999-4999-8999-999999999992',
  ppsEstrategico: '99999999-9999-4999-8999-999999999993',
  psaPrevMedular: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  turnoPrevMatutino: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
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
      ],
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
                id_turnos_por_sitio: 'c2222222-2222-4222-8222-222222222222',
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

describe('Step 8.2 — Programa Multi View & Mini-Paso 8A Procesos View', () => {
  it('renders Multi View table-fixed with 100% colgroup, 0 buttons in tbody, reactive facets, and Zero-UUID', () => {
    const fx = buildFixture();
    const html = renderProgramaView({
      profile: ADMIN_PROFILE,
      state: DEFAULT_PROGRAMA_STATE,
      audits: fx.audits,
      programs: fx.programs,
      vinculos: fx.vinculos,
      certificados: fx.certificados,
    });

    assert.match(html, /data-resizable-table="programa-main"/);
    assert.match(html, /table-fixed/);

    const widths = extractColgroupWidths(html);
    assert.equal(widths.length, 5);
    const sum = widths.reduce((acc, n) => acc + n, 0);
    assert.ok(Math.abs(sum - 100) < 0.01, `colgroup sum expected 100%, got ${sum}`);

    const tbodyMatch = html.match(/<tbody[\s\S]*?<\/tbody>/);
    assert.ok(tbodyMatch, 'tbody should be rendered');
    assert.equal(/<button/i.test(tbodyMatch[0]), false, 'Zero <button> allowed inside <tbody>');

    assert.match(html, /Pendientes de Procesos/);
    assert.match(html, /Pendientes de Turnos/);
    assert.match(html, /Completos/);
    assert.match(html, /Con procesos nunca auditados/);
    assert.match(html, /CERT-9001-2026/);
    assert.match(html, /Pend\. Procesos/);

    const uuidCheck = assertZeroUuidExposure(html);
    assert.equal(uuidCheck.compliant, true, `Zero-UUID violations: ${uuidCheck.exposedUuids.join(', ')}`);
  });

  it('renders Detail View with Zone 1 chips, Mini-Step Switcher 8A->8B, and Mini-Paso 8A process cards + drawer', () => {
    const fx = buildFixture();
    const drawerKey = `${IDs.saCurrentHq}:${IDs.ppsMedular}`;
    const detailState: ProgramaViewState = {
      ...DEFAULT_PROGRAMA_STATE,
      selectedAuditId: IDs.auditCurrent,
      activeMiniStep: 'procesos',
      openHistoryDrawerProcessIds: [drawerKey],
    };

    const html = renderProgramaView({
      profile: ADMIN_PROFILE,
      state: detailState,
      audits: fx.audits,
      programs: fx.programs,
      vinculos: fx.vinculos,
      certificados: fx.certificados,
    });

    assert.match(html, /← Volver al Vínculo Grupal/);
    assert.match(html, /Certificado/);
    assert.match(html, /Paso 8 · Programa \(Activo\)/);
    assert.match(html, /8A · Procesos/);
    assert.match(html, /8B · Turnos/);

    assert.match(html, /Seleccionar todos los Medulares/);
    assert.match(html, /Seleccionar no auditados en el último año/);
    assert.match(html, /Copiar del ciclo anterior/);
    assert.equal(/<select\b/i.test(html), false, 'Must have 0 <select> controls in 8A');

    assert.match(html, /Nunca auditado/);
    assert.match(html, /Auditado 1 de 2 veces/);
    assert.match(html, /Auditado 0 de 2 veces/);

    assert.match(html, /data-testid="programa-process-history-drawer"/);
    assert.match(html, /Turno Matutino/);
    assert.match(html, /Auditor Designado/);

    const uuidCheck = assertZeroUuidExposure(html);
    assert.equal(uuidCheck.compliant, true, `Zero-UUID violations: ${uuidCheck.exposedUuids.join(', ')}`);
  });

  it('enforces RBAC read-only on AUDITOR and CLIENT and scopes records correctly', () => {
    const fx = buildFixture();

    const auditorMultiHtml = renderProgramaView({
      profile: AUDITOR_PROFILE,
      state: DEFAULT_PROGRAMA_STATE,
      audits: fx.audits,
      programs: fx.programs,
      vinculos: fx.vinculos,
      certificados: fx.certificados,
    });
    assert.match(auditorMultiHtml, /CERT-9001-2026/);
    assert.doesNotMatch(auditorMultiHtml, /CERT-14001-999/);

    const auditorDetailHtml = renderProgramaView({
      profile: AUDITOR_PROFILE,
      state: {
        ...DEFAULT_PROGRAMA_STATE,
        selectedAuditId: IDs.auditCurrent,
      },
      audits: fx.audits,
      programs: fx.programs,
      vinculos: fx.vinculos,
      certificados: fx.certificados,
    });
    assert.match(auditorDetailHtml, /Solo lectura/);
    assert.doesNotMatch(auditorDetailHtml, /data-parent-type="cert"/);

    const checkboxTags = [...auditorDetailHtml.matchAll(/<input[^>]*data-action="toggle-programa-process"[^>]*>/g)];
    assert.equal(checkboxTags.length, 3);
    assert.ok(checkboxTags.every((m) => /\bdisabled\b/.test(m[0])), 'Auditor checkboxes must be disabled');

    const quickButtonTags = [
      ...auditorDetailHtml.matchAll(/<button[^>]*data-action="programa-quick-select"[^>]*>/g),
    ];
    assert.equal(quickButtonTags.length, 3);
    assert.ok(quickButtonTags.every((m) => /\bdisabled\b/.test(m[0])), 'Auditor quick buttons must be disabled');

    const clientMultiHtml = renderProgramaView({
      profile: CLIENT_PROFILE,
      state: DEFAULT_PROGRAMA_STATE,
      audits: fx.audits,
      programs: fx.programs,
      vinculos: fx.vinculos,
      certificados: fx.certificados,
      authorizedClientOrgIds: [IDs.orgA],
    });
    assert.match(clientMultiHtml, /CERT-9001-2026/);
    assert.doesNotMatch(clientMultiHtml, /CERT-14001-999/);

    const clientDetailHtml = renderProgramaView({
      profile: CLIENT_PROFILE,
      state: {
        ...DEFAULT_PROGRAMA_STATE,
        selectedAuditId: IDs.auditCurrent,
      },
      audits: fx.audits,
      programs: fx.programs,
      vinculos: fx.vinculos,
      certificados: fx.certificados,
      authorizedClientOrgIds: [IDs.orgA],
    });
    assert.match(clientDetailHtml, /Solo lectura/);
    assert.match(clientDetailHtml, /data-parent-type="cert"/);
  });

  it('uses mobile-friendly responsive cycle window markup and emits Mini-Paso 8B switcher view cleanly', () => {
    const fx = buildFixture();
    const procesosOnlyHtml = renderProgramaProcesosView({
      audit: fx.auditCurrent,
      program: fx.programs[0],
      allAudits: fx.audits,
      allProcessesPorSitio: fx.certificados[0].sitios[0].procesos_por_sitio || [],
      allProcesses: fx.certificados[0].procesos,
      cycleWindowOffset: 0,
      openHistoryDrawerProcessIds: [],
      isStaff: true,
    });
    assert.match(procesosOnlyHtml, /grid-cols-3 sm:grid-cols-5/);
    assert.doesNotMatch(procesosOnlyHtml, /overflow-x-scroll/);

    const turnStepHtml = renderProgramaView({
      profile: ADMIN_PROFILE,
      state: {
        ...DEFAULT_PROGRAMA_STATE,
        selectedAuditId: IDs.auditCurrent,
        activeMiniStep: 'turnos',
      },
      audits: fx.audits,
      programs: fx.programs,
      vinculos: fx.vinculos,
      certificados: fx.certificados,
    });
    assert.match(turnStepHtml, /Mini-Paso 8B · Asignación Multi-Turno por Proceso/);
    assert.match(turnStepHtml, /← Volver a 8A · Procesos/);
  });
});
