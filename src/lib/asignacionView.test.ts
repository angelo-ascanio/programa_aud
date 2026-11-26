import test from 'node:test';
import assert from 'node:assert/strict';

import type { UserProfile } from './healthCheck';
import type { ConglomeradoEntity } from './conglomeradoDomain';
import type { VinculoEntity } from './vinculoDomain';
import type { AuditoriaSitioPlanItem, ProgramaAuditoriaEntity } from './auditPlanningEngine';
import type { ProgramacionAuditEntity } from './auditExecution';
import type { AuditorDetailEntity } from './competencyMatrix';
import type { CertificadoDetailEntity } from './multisiteSampling';
import type { AuditoriaSitioTemporalEntity } from './designacionTemporalDomain';
import { INITIAL_EXPERTOS_TECNICOS } from './expertoTecnicoDomain';
import { assertZeroUuidExposure } from './zeroUuid';
import {
  DEFAULT_ASIGNACION_STATE,
  renderAsignacionView,
  type AsignacionViewState,
} from '../views/asignacionView';

const ADMIN_PROFILE: UserProfile = {
  id: '00000000-0000-0000-0000-000000000001',
  nombre: 'Admin Calidad',
  role: 'ADMIN',
  status: 'APPROVED',
  created_at: '2025-01-01T00:00:00Z',
};

const WORKER_PROFILE: UserProfile = {
  id: '00000000-0000-0000-0000-000000000002',
  nombre: 'Coordinador Técnico',
  role: 'WORKER',
  status: 'APPROVED',
  created_at: '2025-01-01T00:00:00Z',
};

const AUDITOR_PROFILE: UserProfile = {
  id: '00000000-0000-0000-0000-000000000003',
  nombre: 'Auditor Líder ISO',
  role: 'AUDITOR',
  status: 'APPROVED',
  created_at: '2025-01-01T00:00:00Z',
};

const CLIENT_PROFILE: UserProfile = {
  id: '00000000-0000-0000-0000-000000000004',
  nombre: 'Contacto Cliente',
  role: 'CLIENT',
  status: 'APPROVED',
  created_at: '2025-01-01T00:00:00Z',
};

const UUID_GRUPO = '20000000-0000-0000-0000-000000000001';
const UUID_ORG = '30000000-0000-0000-0000-000000000001';
const UUID_VINCULO = '25000000-0000-0000-0000-000000000001';
const UUID_TIPO = '60000000-0000-0000-0000-000000000001';
const UUID_CERT_1 = '40000000-0000-0000-0000-000000000001';
const UUID_CERT_2 = '40000000-0000-0000-0000-000000000002';

const UUID_PROG_1 = '70000000-0000-0000-0000-000000000001';
const UUID_PROG_2 = '70000000-0000-0000-0000-000000000002';
const UUID_PROG_3 = '70000000-0000-0000-0000-000000000003';
const UUID_PROG_NO_TIME = '70000000-0000-0000-0000-000000000004';

const UUID_AUDIT_1 = '80000000-0000-0000-0000-000000000001';
const UUID_AUDIT_2 = '80000000-0000-0000-0000-000000000002';
const UUID_AUDIT_3 = '80000000-0000-0000-0000-000000000003';
const UUID_AUDIT_NO_TIME = '80000000-0000-0000-0000-000000000004';

const UUID_SITE_1 = '51000000-0000-0000-0000-000000000001';
const UUID_SITE_2 = '51000000-0000-0000-0000-000000000002';
const UUID_SITE_3 = '51000000-0000-0000-0000-000000000003';
const UUID_SITE_NO_TIME = '51000000-0000-0000-0000-000000000004';

const UUID_TEMP_1 = '9a000000-0000-0000-0000-000000000001';

const UUID_AUD_FULL = 'a1000000-0000-0000-0000-000000000001';
const UUID_AUD_NO_IAF = 'a1000000-0000-0000-0000-000000000002';

const AUDITORS: AuditorDetailEntity[] = [
  {
    id: UUID_AUD_FULL,
    nombre: 'María Fernanda Soto',
    rol_base: 'AUDITOR_LIDER',
    normas_acreditadas: ['ISO 9001:2015'],
    sectores_iaf: [17],
    competencias: [
      {
        id: 'c1000000-0000-0000-0000-000000000001',
        id_auditor: UUID_AUD_FULL,
        tipo: 'NORMA_IAF',
        id_norma: 'n1',
        norma_codigo: 'ISO 9001:2015',
        id_sector_iaf: 's17',
        sector_iaf_numero: 17,
        id_subsector_iaf: 'sub171',
        subsector_iaf_codigo: '17.1',
        fecha_vencimiento: '2028-12-31',
        estatus: 'Vigente',
      },
    ],
    subsectorLinks: [
      {
        id: 'sl1',
        id_auditor: UUID_AUD_FULL,
        id_subsector_iaf: 'sub171',
        subsector_codigo: '17.1',
        subsector_descripcion: 'Metales básicos',
        sector_iaf_numero: 17,
      },
    ],
    deleted_at: null,
  },
  {
    id: UUID_AUD_NO_IAF,
    nombre: 'Carlos Alberto Ríos',
    rol_base: 'AUDITOR',
    normas_acreditadas: ['ISO 9001:2015'],
    sectores_iaf: [33],
    competencias: [
      {
        id: 'c1000000-0000-0000-0000-000000000002',
        id_auditor: UUID_AUD_NO_IAF,
        tipo: 'NORMA_IAF',
        id_norma: 'n1',
        norma_codigo: 'ISO 9001:2015',
        id_sector_iaf: 's33',
        sector_iaf_numero: 33,
        fecha_vencimiento: '2028-12-31',
        estatus: 'Vigente',
      },
    ],
    deleted_at: null,
  },
];

const CERTIFICADOS: CertificadoDetailEntity[] = [
  {
    id: UUID_CERT_1,
    numero_certificado: 'FN-QMS-2026-001',
    id_organizacion: UUID_ORG,
    organizacion_nombre: 'Industrias Andinas S.A.',
    id_norma: 'n1',
    norma_codigo: 'ISO 9001:2015',
    norma_titulo: 'Calidad',
    id_sector_iaf: 's17',
    sector_iaf_numero: 17,
    sector_iaf_descripcion: 'Metales básicos',
    id_subsector_iaf: 'sub171',
    subsector_iaf_codigo: '17.1',
    estatus: 'Vigente',
    ciclo_numero: 1,
    es_multisite: false,
    sitios: [],
    procesos: [],
    requisitos: [],
    noAplicables: [],
  },
];

const CONGLOMERADOS: ConglomeradoEntity[] = [
  {
    id: UUID_GRUPO,
    nombre: 'Grupo Industrial Andino',
    tipo_agrupacion: 'CONGLOMERADO',
    notas: null,
    organizacion_ids: [UUID_ORG],
    organizaciones_count: 1,
    certificados_count: 2,
    deleted_at: null,
  },
];

const VINCULOS: VinculoEntity[] = [
  {
    id: UUID_VINCULO,
    id_grupo_empresarial: UUID_GRUPO,
    codigo_vinculo: 'VINC-2026-01',
    etiqueta: 'Vínculo Calidad + Ambiental',
    nivel_vinculacion: 'GLOBAL',
    tipo_vinculacion: 'Integrada',
    notas: null,
    certificados: [],
    deleted_at: null,
  },
];

function makeSitePlan(
  id: string,
  id_auditoria: string,
  numero_sitio: number,
  nombre_sitio: string,
  tiempo_auditoria: number,
  equipoSitio: AuditoriaSitioPlanItem['equipoSitio'] = []
): AuditoriaSitioPlanItem {
  return {
    id,
    id_auditoria,
    id_sitio: `50000000-0000-0000-0000-${id.slice(-12)}`,
    numero_sitio,
    nombre_sitio,
    direccion_sitio: `Av. Industrial ${numero_sitio + 100}`,
    tiempo_auditoria,
    modalidad_evaluacion: 'Presencial',
    procesos: [],
    equipoSitio,
    deleted_at: null,
  };
}

function makeAudit(overrides: Partial<ProgramacionAuditEntity>): ProgramacionAuditEntity {
  const id = overrides.id ?? UUID_AUDIT_1;
  return {
    id,
    id_programa_auditoria: overrides.id_programa_auditoria ?? UUID_PROG_1,
    codigo_auditoria: overrides.codigo_auditoria ?? 'AUD-2026-001',
    id_certificado: overrides.id_certificado ?? UUID_CERT_1,
    numero_certificado: overrides.numero_certificado ?? 'FN-QMS-2026-001',
    id_organizacion: UUID_ORG,
    organizacion_nombre: overrides.organizacion_nombre ?? 'Industrias Andinas S.A.',
    norma_codigo: overrides.norma_codigo ?? 'ISO 9001:2015',
    sector_iaf: overrides.sector_iaf ?? 17,
    id_tipo_auditoria: UUID_TIPO,
    tipo_auditoria: overrides.tipo_auditoria ?? 'Seguimiento 1',
    metodologia: 'Presencial',
    fecha_inicio: overrides.fecha_inicio ?? '2026-08-10',
    fecha_fin: overrides.fecha_fin ?? '2026-08-12',
    fecha_reprogramacion: null,
    fechas:
      overrides.fechas ?? [
        {
          id: '81000000-0000-0000-0000-000000000001',
          id_auditoria: id,
          numero_secuencia: 1,
          tag: 'Programación',
          tipo_fecha: 'REAL',
          anio: null,
          mes: null,
          fecha_inicio: '2026-08-10',
          fecha_fin: '2026-08-12',
          observacion: null,
          deleted_at: null,
        },
      ],
    latestDate: overrides.latestDate ?? null,
    dias_auditor: overrides.dias_auditor ?? 3,
    tiempo_auditoria: overrides.tiempo_auditoria ?? 3,
    auditor_lider: overrides.auditor_lider ?? 'María Fernanda Soto',
    auditor_lider_id: overrides.auditor_lider_id ?? UUID_AUD_FULL,
    estatus: overrides.estatus ?? 'Planificado',
    estado_ciclo: overrides.estado_ciclo ?? 'Programada',
    tiene_sitio_temporal: overrides.tiene_sitio_temporal ?? false,
    equipo: [],
    sitiosPlan: overrides.sitiosPlan ?? [],
    matrizNormativa: [],
    comentarios: [],
    deleted_at: null,
  };
}

function makeFixtureData(): {
  programs: ProgramaAuditoriaEntity[];
  temporalSites: AuditoriaSitioTemporalEntity[];
} {
  // Campaign 1: Descuadrado (Site 1 requires 3.00d, assigned 2.00d; Temporal requires 1.00d, assigned 1.00d)
  // Plus schedule conflict with Campaign 2 + Lead Auditor rotation warning (3 prior cycles)
  const prog1: ProgramaAuditoriaEntity = {
    id: UUID_PROG_1,
    id_vinculo: UUID_VINCULO,
    id_grupo_empresarial: UUID_GRUPO,
    codigo_programa: 'PRG-2026-01',
    etiqueta: 'Campaña Andina 2026',
    nivel_vinculacion: 'GLOBAL',
    tipo_vinculacion: 'Integrada',
    es_vinculada: true,
    tiene_sitio_temporal: true,
    id_ciclo_origen: null,
    notas: null,
    deleted_at: null,
    auditorias: [
      makeAudit({
        id: UUID_AUDIT_1,
        id_programa_auditoria: UUID_PROG_1,
        tiene_sitio_temporal: true,
        sitiosPlan: [
          makeSitePlan(UUID_SITE_1, UUID_AUDIT_1, 0, 'Planta Central', 3.0, [
            {
              id: 'e1000000-0000-0000-0000-000000000001',
              id_sitios_por_auditoria: UUID_SITE_1,
              id_auditor: UUID_AUD_FULL,
              auditor_nombre: 'María Fernanda Soto',
              rol_auditor: 'AUDITOR_LIDER',
              tiempo_auditoria: 1.5,
              asignacion_completa_sitio: true,
              deleted_at: null,
            },
            {
              id: 'e1000000-0000-0000-0000-000000000002',
              id_sitios_por_auditoria: UUID_SITE_1,
              id_auditor: UUID_AUD_NO_IAF,
              auditor_nombre: 'Carlos Alberto Ríos',
              rol_auditor: 'AUDITOR',
              tiempo_auditoria: 0.5,
              asignacion_completa_sitio: true,
              deleted_at: null,
            },
          ]),
        ],
      }),
    ],
  };

  // Campaign 2: Completo (2.00d / 2.00d) with overlapping REAL dates for UUID_AUD_FULL -> triggers calendar conflict
  const prog2: ProgramaAuditoriaEntity = {
    id: UUID_PROG_2,
    id_vinculo: null,
    id_grupo_empresarial: UUID_GRUPO,
    codigo_programa: 'PRG-2026-02',
    etiqueta: 'Campaña Norte 2026',
    nivel_vinculacion: 'INDIVIDUAL',
    tipo_vinculacion: 'Individual',
    es_vinculada: false,
    tiene_sitio_temporal: false,
    id_ciclo_origen: null,
    notas: null,
    deleted_at: null,
    auditorias: [
      makeAudit({
        id: UUID_AUDIT_2,
        id_programa_auditoria: UUID_PROG_2,
        codigo_auditoria: 'AUD-2026-002',
        id_certificado: UUID_CERT_2,
        numero_certificado: 'FN-QMS-2026-002',
        sitiosPlan: [
          makeSitePlan(UUID_SITE_2, UUID_AUDIT_2, 0, 'Sede Norte', 2.0, [
            {
              id: 'e1000000-0000-0000-0000-000000000003',
              id_sitios_por_auditoria: UUID_SITE_2,
              id_auditor: UUID_AUD_FULL,
              auditor_nombre: 'María Fernanda Soto',
              rol_auditor: 'AUDITOR_LIDER',
              tiempo_auditoria: 2.0,
              asignacion_completa_sitio: true,
              deleted_at: null,
            },
          ]),
        ],
      }),
    ],
  };

  // Campaign 3: Sin asignar (0.00d / 1.50d)
  const prog3: ProgramaAuditoriaEntity = {
    id: UUID_PROG_3,
    id_vinculo: null,
    id_grupo_empresarial: UUID_GRUPO,
    codigo_programa: 'PRG-2026-03',
    etiqueta: 'Campaña Sur Sin Equipo',
    nivel_vinculacion: 'INDIVIDUAL',
    tipo_vinculacion: 'Individual',
    es_vinculada: false,
    tiene_sitio_temporal: false,
    id_ciclo_origen: null,
    notas: null,
    deleted_at: null,
    auditorias: [
      makeAudit({
        id: UUID_AUDIT_3,
        id_programa_auditoria: UUID_PROG_3,
        codigo_auditoria: 'AUD-2026-003',
        id_certificado: UUID_CERT_2,
        numero_certificado: 'FN-QMS-2026-003',
        fechas: [
          {
            id: '81000000-0000-0000-0000-000000000003',
            id_auditoria: UUID_AUDIT_3,
            numero_secuencia: 1,
            tag: 'Programación',
            tipo_fecha: 'PROGRAMADA_EXACTA',
            anio: null,
            mes: null,
            fecha_inicio: '2026-09-10',
            fecha_fin: '2026-09-11',
            observacion: null,
            deleted_at: null,
          },
        ],
        sitiosPlan: [makeSitePlan(UUID_SITE_3, UUID_AUDIT_3, 0, 'Bodega Sur', 1.5, [])],
      }),
    ],
  };

  // Campaign 4: Missing Paso 6 time (excluded by entry gate)
  const progNoTime: ProgramaAuditoriaEntity = {
    id: UUID_PROG_NO_TIME,
    id_vinculo: null,
    id_grupo_empresarial: UUID_GRUPO,
    codigo_programa: 'PRG-2026-04',
    etiqueta: 'Campaña Sin Paso 6',
    nivel_vinculacion: 'INDIVIDUAL',
    tipo_vinculacion: 'Individual',
    es_vinculada: false,
    tiene_sitio_temporal: false,
    id_ciclo_origen: null,
    notas: null,
    deleted_at: null,
    auditorias: [
      makeAudit({
        id: UUID_AUDIT_NO_TIME,
        id_programa_auditoria: UUID_PROG_NO_TIME,
        sitiosPlan: [makeSitePlan(UUID_SITE_NO_TIME, UUID_AUDIT_NO_TIME, 0, 'Sin Tiempo', 0, [])],
      }),
    ],
  };

  // Historical closed programs on UUID_CERT_1 for Lead Auditor rotation (3 consecutive cycles)
  const historyPrograms: ProgramaAuditoriaEntity[] = [1, 2, 3].map((idx) => ({
    id: `70000000-0000-0000-0000-00000000010${idx}`,
    id_vinculo: null,
    id_grupo_empresarial: UUID_GRUPO,
    codigo_programa: `PRG-HIST-0${idx}`,
    etiqueta: `Ciclo Histórico ${idx}`,
    nivel_vinculacion: 'INDIVIDUAL',
    tipo_vinculacion: 'Individual',
    es_vinculada: false,
    tiene_sitio_temporal: false,
    id_ciclo_origen: null,
    notas: null,
    deleted_at: null,
    auditorias: [
      makeAudit({
        id: `80000000-0000-0000-0000-00000000010${idx}`,
        id_programa_auditoria: `70000000-0000-0000-0000-00000000010${idx}`,
        codigo_auditoria: `AUD-HIST-0${idx}`,
        id_certificado: UUID_CERT_1,
        estado_ciclo: 'Auditada',
        estatus: 'Auditada',
        auditor_lider_id: UUID_AUD_FULL,
        auditor_lider: 'María Fernanda Soto',
        fechas: [
          {
            id: `81000000-0000-0000-0000-00000000010${idx}`,
            id_auditoria: `80000000-0000-0000-0000-00000000010${idx}`,
            numero_secuencia: 1,
            tag: 'Programación',
            tipo_fecha: 'REAL',
            anio: null,
            mes: null,
            fecha_inicio: `202${2 + idx}-05-10`,
            fecha_fin: `202${2 + idx}-05-12`,
            observacion: null,
            deleted_at: null,
          },
        ],
        sitiosPlan: [],
      }),
    ],
  }));

  const temporalSites: AuditoriaSitioTemporalEntity[] = [
    {
      id: UUID_TEMP_1,
      id_auditoria: UUID_AUDIT_1,
      etiqueta: 'Obra Hidroeléctrica Temporal',
      comentario: 'Frente activo en turno diurno',
      tiempo_auditoria: 1.0,
      certificados: [
        {
          id: '9b000000-0000-0000-0000-000000000001',
          id_sitio_temporal: UUID_TEMP_1,
          id_auditoria_certificado: UUID_AUDIT_1,
          numero_certificado: 'FN-QMS-2026-001',
          organizacion_nombre: 'Industrias Andinas S.A.',
          norma_codigo: 'ISO 9001:2015',
          deleted_at: null,
        },
      ],
      equipoTemporal: [
        {
          id: 'e2000000-0000-0000-0000-000000000001',
          id_sitio_temporal: UUID_TEMP_1,
          id_auditor: UUID_AUD_FULL,
          auditor_nombre: 'María Fernanda Soto',
          rol_auditor: 'AUDITOR',
          tiempo_auditoria: 1.0,
          deleted_at: null,
        },
      ],
      deleted_at: null,
    },
  ];

  return {
    programs: [prog1, prog2, prog3, progNoTime, ...historyPrograms],
    temporalSites,
  };
}

function makeState(overrides: Partial<AsignacionViewState> = {}): AsignacionViewState {
  return {
    ...DEFAULT_ASIGNACION_STATE,
    ...overrides,
  };
}

test('Step 6.1 Multi View renders 3. Auditor Organization-Rooted 5-col colgroup summing 100%, 0 buttons inside tbody, Pop-up Modal, reactive facets, and Zero-UUID', () => {
  const { programs, temporalSites } = makeFixtureData();
  const audits = programs.flatMap((p) => p.auditorias);
  const html = renderAsignacionView({
    profile: ADMIN_PROFILE,
    state: makeState(),
    programs,
    audits,
    temporalSites,
    auditors: AUDITORS,
    certificados: CERTIFICADOS,
    vinculos: VINCULOS,
    conglomerados: CONGLOMERADOS,
  });

  // UI renamed to 3. Auditor (never "Asignación" heading/domain title)
  assert.match(html, /3\. Auditor \(0\.25d\)/);
  assert.doesNotMatch(html, />Asignación/);

  // Table colgroup summing to 100% (5 columns)
  assert.match(html, /data-resizable-table="asignacion-main"/);
  const colgroupMatch = html.match(/<colgroup>([\s\S]*?)<\/colgroup>/);
  assert.ok(colgroupMatch, 'Expected <colgroup> in asignacion-main table');
  const colWidths = [...colgroupMatch[1].matchAll(/width:\s*([\d.]+)%/g)].map((m) =>
    Number(m[1])
  );
  assert.equal(colWidths.length, 5);
  assert.equal(
    colWidths.reduce((a, b) => a + b, 0),
    100
  );

  // Zero <button> inside <tbody>
  const tbodyMatch = html.match(/<tbody[\s\S]*?<\/tbody>/i);
  assert.ok(tbodyMatch, 'tbody should be rendered');
  assert.equal(/<button\b/i.test(tbodyMatch[0]), false);

  // Organization rows open Pop-up Modal
  assert.match(html, /Mostrando/);
  assert.match(html, /organizaciones/);
  assert.match(html, /Industrias Andinas S\.A\./);
  assert.match(html, /Cobertura \(d\)/);
  assert.match(html, /Alertas/);
  assert.match(html, /data-action="open-org-cert-picker"/);

  // Reactive facet groups (including Brecha IAF & Experto Técnico)
  assert.match(html, /Estado de Cobertura/);
  assert.match(html, /Pendiente/);
  assert.match(html, /Desbalanceado/);
  assert.match(html, /Completo ✓/);
  assert.match(html, /Con conflicto de calendario/);
  assert.match(html, /Alerta rotación Líder/);
  assert.match(html, /Competencia parcial/);
  assert.match(html, /Brecha IAF/);
  assert.match(html, /Con Experto Técnico/);

  // Pop-up Modal exposes certificates grouped by vinculation + Equipo / Experto(s) & Cobertura Días
  const modalHtml = renderAsignacionView({
    profile: ADMIN_PROFILE,
    state: makeState({ pickerOrgId: UUID_ORG }),
    programs,
    audits,
    temporalSites,
    auditors: AUDITORS,
    certificados: CERTIFICADOS,
    vinculos: VINCULOS,
    conglomerados: CONGLOMERADOS,
  });
  assert.match(modalHtml, /id="orgCertPickerModal"/);
  assert.match(modalHtml, /data-action="select-org-picker-cert"/);
  assert.match(modalHtml, /FN-QMS-2026-001/);
  assert.match(modalHtml, /FN-QMS-2026-002/);
  assert.match(modalHtml, /Equipo \/ Experto\(s\)/);
  assert.match(modalHtml, /Cobertura Días/);
  assert.equal(assertZeroUuidExposure(modalHtml).compliant, true);

  // Zero-UUID check
  const zeroUuid = assertZeroUuidExposure(html);
  assert.equal(zeroUuid.compliant, true, `Exposed UUIDs: ${zeroUuid.exposedUuids.join(', ')}`);
});

test('Step 6.1 Multi View supports facet filtering, grid mode, and empty-state CTA', () => {
  const { programs, temporalSites } = makeFixtureData();
  const audits = programs.flatMap((p) => p.auditorias);

  const filteredHtml = renderAsignacionView({
    profile: WORKER_PROFILE,
    state: makeState({
      facetSelections: {
        estado_auditor: new Set(['DESBALANCEADO']),
      },
      pickerOrgId: UUID_ORG,
    }),
    programs,
    audits,
    temporalSites,
    auditors: AUDITORS,
    certificados: CERTIFICADOS,
    vinculos: VINCULOS,
    conglomerados: CONGLOMERADOS,
  });
  assert.match(filteredHtml, /Industrias Andinas S\.A\./);
  assert.match(filteredHtml, /FN-QMS-2026-001/);
  assert.match(filteredHtml, /Desbalanceado/);

  const gridHtml = renderAsignacionView({
    profile: ADMIN_PROFILE,
    state: makeState({ viewMode: 'grid' }),
    programs,
    audits,
    temporalSites,
    auditors: AUDITORS,
    certificados: CERTIFICADOS,
    vinculos: VINCULOS,
    conglomerados: CONGLOMERADOS,
  });
  assert.match(gridHtml, /data-action="open-org-cert-picker"/);
  assert.equal(assertZeroUuidExposure(gridHtml).compliant, true);

  const emptyHtml = renderAsignacionView({
    profile: ADMIN_PROFILE,
    state: makeState(),
    programs: [],
    audits: [],
    temporalSites: [],
    auditors: AUDITORS,
    certificados: CERTIFICADOS,
    vinculos: VINCULOS,
    conglomerados: CONGLOMERADOS,
  });
  assert.match(emptyHtml, /open-add-audit-wizard/);
  assert.equal(assertZeroUuidExposure(emptyHtml).compliant, true);
});

test('Step 6.1 Detail View renders auditSectionShell (no linked siblings), unified permanent + TEMPORAL cards, exact balance bars, competency/conflict/rotation alerts, and inline Agregar Auditor', () => {
  const { programs, temporalSites } = makeFixtureData();
  const audits = programs.flatMap((p) => p.auditorias);
  const html = renderAsignacionView({
    profile: ADMIN_PROFILE,
    state: makeState({
      selectedCertId: UUID_CERT_1,
      selectedAuditId: UUID_AUDIT_1,
      draftTargetKind: 'REGULAR',
      draftTargetId: UUID_SITE_1,
      draftAuditorId: UUID_AUD_FULL,
      draftRol: 'AUDITOR',
      draftDays: '1.00',
      editErrorMessage: 'La suma (3.50 d) excede los días requeridos del sitio (3.00 d).',
    }),
    programs,
    audits,
    temporalSites,
    auditors: AUDITORS,
    certificados: CERTIFICADOS,
    vinculos: VINCULOS,
    conglomerados: CONGLOMERADOS,
  });

  assert.match(html, /data-testid="asignacion-error-banner"/);
  assert.match(html, /La suma \(3\.50 d\) excede los días requeridos del sitio \(3\.00 d\)\./);

  // AuditSectionShell without linked siblings bar & renamed to 3. Auditor
  assert.match(html, /data-testid="audit-section-shell"/);
  assert.doesNotMatch(html, /data-action="select-linked-sibling-audit"/);
  assert.match(html, /3\. Auditor/);
  assert.match(html, /2\. Tiempo/);
  assert.match(html, /4\. Proceso →/);

  // Regular site live balance bar (2.00d / 3.00d -> Faltan 1.00 d)
  assert.match(html, /Asignado: 2\.00 d \/ Requerido: 3\.00 d/);
  assert.match(html, /Faltan 1\.00 d/);

  // Unified TEMPORAL site card with TEMPORAL badge + Balance exacto ✓ + bg-emerald-600
  assert.match(html, /TEMPORAL/);
  assert.match(html, /Sitio Temporal — Obra Hidroeléctrica Temporal/);
  assert.match(html, /Asignado: 1\.00 d \/ Requerido: 1\.00 d/);
  assert.match(html, /Balance exacto ✓/);
  assert.match(html, /bg-emerald-600/);

  // Competency badges, conflict alert, and ISO 17021-1 rotation warning
  assert.match(html, /✓ Calificado \(ISO 9001:2015 · IAF 17\)/);
  assert.match(html, /⚠ Falta IAF 17/);
  assert.match(html, /⚠ Conflicto calendario/);
  assert.match(html, /⚠ Rotación Líder ISO 17021-1/);
  assert.match(html, /Rotación sugerida ISO\/IEC 17021-1/);

  // Inline Agregar Auditor controls per auditable unit for ADMIN + Zone 1 Org button
  assert.match(html, /data-testid="zone1-org-nav-btn"/);
  assert.match(html, /data-testid="asignacion-inline-form"/);
  assert.match(html, /aria-label="Agregar auditor en/);
  assert.match(html, />(\s*)Agregar(\s*)<\/button>/);
  assert.match(html, /data-action="submit-asignacion-auditor"/);
  assert.match(html, /data-action="step-asignacion-auditor-days"/);
  assert.match(html, /data-action="remove-asignacion-auditor"/);

  // Zero-UUID check
  const zeroUuid = assertZeroUuidExposure(html);
  assert.equal(zeroUuid.compliant, true, `Exposed UUIDs: ${zeroUuid.exposedUuids.join(', ')}`);
});

test('Step 6.1 RBAC: AUDITOR and CLIENT render read-only 3. Auditor Detail View with zero mutation controls and Zero-UUID', () => {
  const { programs, temporalSites } = makeFixtureData();
  const audits = programs.flatMap((p) => p.auditorias);

  for (const roProfile of [AUDITOR_PROFILE, CLIENT_PROFILE]) {
    const html = renderAsignacionView({
      profile: roProfile,
      state: makeState({
        selectedCertId: UUID_CERT_2,
        selectedAuditId: UUID_AUDIT_2,
        editErrorMessage: null,
      }),
      programs,
      audits,
      temporalSites,
      auditors: AUDITORS,
      certificados: CERTIFICADOS,
      vinculos: VINCULOS,
      conglomerados: CONGLOMERADOS,
    });

    assert.match(html, /Solo lectura/);
    assert.match(html, /Asignado: 2\.00 d \/ Requerido: 2\.00 d/);
    assert.match(html, /Balance exacto ✓/);
    assert.doesNotMatch(html, /data-action="submit-asignacion-auditor"/);
    assert.doesNotMatch(html, /data-action="step-asignacion-auditor-days"/);
    assert.doesNotMatch(html, /data-action="remove-asignacion-auditor"/);

    const zeroUuid = assertZeroUuidExposure(html);
    assert.equal(zeroUuid.compliant, true, `Exposed UUIDs: ${zeroUuid.exposedUuids.join(', ')}`);
  }
});

test('Step 1.4 UI: renders non-blocking IAF gap indicator, hides EXPERTO_TECNICO from per-site role select, and renders global Expertos Técnicos section with RBAC', () => {
  const { programs, temporalSites } = makeFixtureData();
  const baseAudit = programs[0].auditorias[0];
  const auditWithExpert: ProgramacionAuditEntity = {
    ...baseAudit,
    expertoTecnicoAsignaciones: [
      {
        id: '1e300000-0000-0000-0000-000000000091',
        id_auditoria: baseAudit.id,
        id_experto_tecnico: INITIAL_EXPERTOS_TECNICOS[0].id,
        experto_nombre: INITIAL_EXPERTOS_TECNICOS[0].nombre,
        experto_estatus: 'Disponible',
        dias_asignados: 0.75,
        observacion: 'Revisión de proceso crítico.',
        deleted_at: null,
      },
    ],
  };
  const updatedPrograms = programs.map((p, idx) =>
    idx === 0 ? { ...p, auditorias: [auditWithExpert] } : p
  );
  const audits = updatedPrograms.flatMap((p) => p.auditorias);

  // ADMIN & WORKER see mutation controls + global Expertos Técnicos section + IAF gap banner
  for (const staffProfile of [ADMIN_PROFILE, WORKER_PROFILE]) {
    const html = renderAsignacionView({
      profile: staffProfile,
      state: makeState({
        selectedCertId: UUID_CERT_1,
        selectedAuditId: UUID_AUDIT_1,
      }),
      programs: updatedPrograms,
      audits,
      temporalSites,
      auditors: AUDITORS,
      expertos: INITIAL_EXPERTOS_TECNICOS,
      certificados: CERTIFICADOS,
      vinculos: VINCULOS,
      conglomerados: CONGLOMERADOS,
    });

    assert.match(html, /data-testid="asignacion-iaf-gap-banner"/);
    assert.match(html, /No bloqueante/);
    assert.match(html, /data-testid="asignacion-expertos-section"/);
    assert.match(html, /Expertos Técnicos \(Alcance Global\)/);
    assert.match(html, /data-testid="asignacion-experto-inline-form"/);
    assert.match(html, /data-action="submit-asignacion-experto"/);
    assert.match(html, /data-action="step-asignacion-experto-days"/);
    assert.match(html, /data-action="save-asignacion-experto-obs"/);
    assert.match(html, /data-action="remove-asignacion-experto"/);
    assert.match(html, /Revisión de proceso crítico\./);

    // Per-site role <select> must NOT contain option value="EXPERTO_TECNICO"
    assert.doesNotMatch(html, /<option value="EXPERTO_TECNICO"/);

    const zeroUuid = assertZeroUuidExposure(html);
    assert.equal(zeroUuid.compliant, true, `Exposed UUIDs: ${zeroUuid.exposedUuids.join(', ')}`);
  }

  // AUDITOR & CLIENT see global technical expert assignments in strict read-only mode
  for (const roProfile of [AUDITOR_PROFILE, CLIENT_PROFILE]) {
    const html = renderAsignacionView({
      profile: roProfile,
      state: makeState({
        selectedCertId: UUID_CERT_1,
        selectedAuditId: UUID_AUDIT_1,
      }),
      programs: updatedPrograms,
      audits,
      temporalSites,
      auditors: AUDITORS,
      expertos: roProfile.role === 'CLIENT' ? [] : INITIAL_EXPERTOS_TECNICOS,
      certificados: CERTIFICADOS,
      vinculos: VINCULOS,
      conglomerados: CONGLOMERADOS,
    });

    assert.match(html, /data-testid="asignacion-expertos-section"/);
    assert.match(html, /Dra\. Sofía Quintero/);
    assert.match(html, /0\.75 d/);
    assert.match(html, /Revisión de proceso crítico\./);
    assert.doesNotMatch(html, /data-testid="asignacion-experto-inline-form"/);
    assert.doesNotMatch(html, /data-action="submit-asignacion-experto"/);
    assert.doesNotMatch(html, /data-action="step-asignacion-experto-days"/);
    assert.doesNotMatch(html, /data-action="save-asignacion-experto-obs"/);
    assert.doesNotMatch(html, /data-action="remove-asignacion-experto"/);

    const zeroUuid = assertZeroUuidExposure(html);
    assert.equal(zeroUuid.compliant, true, `Exposed UUIDs: ${zeroUuid.exposedUuids.join(', ')}`);
  }
});
