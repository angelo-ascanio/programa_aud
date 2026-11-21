import test from 'node:test';
import assert from 'node:assert/strict';

import type { UserProfile } from './healthCheck';
import type { ConglomeradoEntity } from './conglomeradoDomain';
import type { VinculoEntity } from './vinculoDomain';
import type { ProgramaAuditoriaEntity } from './auditPlanningEngine';
import type { ProgramacionAuditEntity } from './auditExecution';
import type { CertificateRecord } from './searchControls';
import { assertZeroUuidExposure } from './zeroUuid';
import {
  buildCertificateTemporalRows,
  computeCampaignTemporalRows,
  createBatchTemporalDraftFromResolution,
  createEmptyTemporalSiteDraft,
  createTemporalSiteDraftFromEntity,
  formatTemporalSiteComment,
  getTemporalPendingStatusMeta,
  normalizeTemporalSiteLabel,
  parseTemporalSiteDetails,
  resolveLinkedBatchTemporalState,
  validateBatchTemporalDraft,
  validateTemporalSiteDraft,
  type AuditoriaSitioTemporalEntity,
} from './designacionTemporalDomain';
import {
  DEFAULT_DESIGNACION_TEMPORAL_STATE,
  renderDesignacionTemporalView,
  type DesignacionTemporalViewState,
} from '../views/designacionTemporalView';

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
const UUID_CERT_OFF = '40000000-0000-0000-0000-000000000003';
const UUID_CERT_EMPTY = '40000000-0000-0000-0000-000000000099';

const UUID_PROG_ELIGIBLE = '70000000-0000-0000-0000-000000000001';
const UUID_PROG_NO_TEMP = '70000000-0000-0000-0000-000000000002';
const UUID_PROG_NO_STEP3 = '70000000-0000-0000-0000-000000000003';
const UUID_PROG_SIN_TIEMPO = '70000000-0000-0000-0000-000000000004';
const UUID_PROG_COMPLETO = '70000000-0000-0000-0000-000000000005';

const UUID_AUDIT_1 = '80000000-0000-0000-0000-000000000001';
const UUID_AUDIT_2 = '80000000-0000-0000-0000-000000000002';
const UUID_AUDIT_NO_TEMP = '80000000-0000-0000-0000-000000000003';
const UUID_AUDIT_NO_STEP3 = '80000000-0000-0000-0000-000000000004';
const UUID_AUDIT_SIN_TIEMPO = '80000000-0000-0000-0000-000000000005';
const UUID_AUDIT_COMPLETO = '80000000-0000-0000-0000-000000000006';
const UUID_FOREIGN_AUDIT = '80000000-0000-0000-0000-000000000099';

const UUID_TEMP_1 = '9a000000-0000-0000-0000-000000000001';
const UUID_TEMP_2 = '9a000000-0000-0000-0000-000000000002';
const UUID_TEMP_COMPLETO = '9a000000-0000-0000-0000-000000000003';

function makeAudit(overrides: Partial<ProgramacionAuditEntity>): ProgramacionAuditEntity {
  const id = overrides.id ?? UUID_AUDIT_1;
  return {
    id,
    id_programa_auditoria: overrides.id_programa_auditoria ?? UUID_PROG_ELIGIBLE,
    codigo_auditoria: overrides.codigo_auditoria ?? 'AUD-2026-001',
    id_certificado: overrides.id_certificado ?? UUID_CERT_1,
    numero_certificado: overrides.numero_certificado ?? 'FN-QMS-2026-001',
    id_organizacion: UUID_ORG,
    organizacion_nombre: overrides.organizacion_nombre ?? 'Industrias Andinas S.A.',
    norma_codigo: overrides.norma_codigo ?? 'ISO 9001:2015',
    sector_iaf: 17,
    id_tipo_auditoria:
      overrides.id_tipo_auditoria === undefined ? UUID_TIPO : overrides.id_tipo_auditoria,
    tipo_auditoria: 'Seguimiento 1',
    metodologia: 'Presencial',
    fecha_inicio: '2026-06-15',
    fecha_fin: '2026-06-17',
    fecha_reprogramacion: null,
    fechas:
      overrides.fechas ?? [
        {
          id: '81000000-0000-0000-0000-000000000001',
          id_auditoria: id,
          numero_secuencia: 1,
          tag: 'Programación',
          tipo_fecha: 'PROGRAMADA_EXACTA',
          anio: null,
          mes: null,
          fecha_inicio: '2026-06-15',
          fecha_fin: '2026-06-17',
          observacion: null,
          deleted_at: null,
        },
      ],
    latestDate:
      overrides.latestDate === undefined
        ? {
            id: '81000000-0000-0000-0000-000000000001',
            id_auditoria: id,
            numero_secuencia: 1,
            tag: 'Programación',
            tipo_fecha: 'PROGRAMADA_EXACTA',
            anio: null,
            mes: null,
            fecha_inicio: '2026-06-15',
            fecha_fin: '2026-06-17',
            observacion: null,
            deleted_at: null,
          }
        : overrides.latestDate,
    dias_auditor: 2,
    tiempo_auditoria: 2,
    estatus: 'Planificado',
    estado_ciclo: 'Programada',
    tiene_sitio_temporal: overrides.tiene_sitio_temporal ?? true,
    auditor_lider_id: '10000000-0000-0000-0000-000000000001',
    auditor_lider: 'Ing. Carlos Mendoza',
    sede_principal_direccion: 'Av. Industrial 100',
    equipo: [],
    sitiosMuestreo: [],
    sitiosPlan: [],
    matrizNormativa: [],
    deleted_at: overrides.deleted_at ?? null,
  };
}

function makeProgram(
  id: string,
  etiqueta: string,
  auditorias: ProgramacionAuditEntity[],
  tieneTemporal = true
): ProgramaAuditoriaEntity {
  return {
    id,
    id_vinculo: UUID_VINCULO,
    id_grupo_empresarial: UUID_GRUPO,
    codigo_programa: `PROG-${id.slice(-3)}`,
    etiqueta,
    nivel_vinculacion: auditorias.length > 1 ? 'NIVEL_1_INTRA_ORG' : 'INDIVIDUAL',
    tipo_vinculacion: auditorias.length > 1 ? 'Integrada' : 'Individual',
    es_vinculada: auditorias.length > 1,
    tiene_sitio_temporal: tieneTemporal,
    id_ciclo_origen: null,
    notas: null,
    deleted_at: null,
    auditorias,
  };
}

function makeBaseViewState(
  overrides: Partial<DesignacionTemporalViewState> = {}
): DesignacionTemporalViewState {
  return {
    ...DEFAULT_DESIGNACION_TEMPORAL_STATE,
    ...overrides,
  };
}

const SAMPLE_CONGLOMERADOS: ConglomeradoEntity[] = [
  {
    id: UUID_GRUPO,
    codigo_grupo: 'GRP-IND',
    nombre: 'Grupo Industrial Andino',
    es_individual_auto: false,
    descripcion: null,
    notas: null,
    organizaciones_count: 1,
    certificados_count: 3,
    deleted_at: null,
  },
];

const SAMPLE_VINCULOS: VinculoEntity[] = [
  {
    id: UUID_VINCULO,
    id_grupo_empresarial: UUID_GRUPO,
    grupo_nombre: 'Grupo Industrial Andino',
    codigo_vinculo: 'VINC-001',
    etiqueta: 'Vínculo SGC + SGA',
    nivel_vinculacion: 'NIVEL_1_INTRA_ORG',
    tipo_vinculacion: 'Integrada',
    es_vinculada: true,
    tiene_sitio_temporal: true,
    notas: null,
    certificados: [],
    deleted_at: null,
  },
];

test('computeCampaignTemporalRows filters strictly to tiene_sitio_temporal=true + complete Step 3 and classifies pendingStatus', () => {
  const progEligibleNoTempRows = makeProgram(UUID_PROG_ELIGIBLE, 'Campaña Sin Config', [
    makeAudit({
      id: UUID_AUDIT_1,
      id_programa_auditoria: UUID_PROG_ELIGIBLE,
      numero_certificado: 'FN-QMS-001',
      tiene_sitio_temporal: true,
    }),
    makeAudit({
      id: UUID_AUDIT_2,
      id_programa_auditoria: UUID_PROG_ELIGIBLE,
      numero_certificado: 'FN-EMS-002',
      norma_codigo: 'ISO 14001:2015',
      tiene_sitio_temporal: false,
    }),
  ]);

  const progExcludedFlagFalse = makeProgram(
    UUID_PROG_NO_TEMP,
    'Campaña Flag Apagado',
    [
      makeAudit({
        id: UUID_AUDIT_NO_TEMP,
        id_programa_auditoria: UUID_PROG_NO_TEMP,
        tiene_sitio_temporal: false,
      }),
    ],
    false
  );

  const progExcludedIncompleteStep3 = makeProgram(UUID_PROG_NO_STEP3, 'Campaña Sin Paso 3', [
    makeAudit({
      id: UUID_AUDIT_NO_STEP3,
      id_programa_auditoria: UUID_PROG_NO_STEP3,
      id_tipo_auditoria: null,
      fechas: [],
      latestDate: null,
      tiene_sitio_temporal: true,
    }),
  ]);

  const progSinTiempo = makeProgram(UUID_PROG_SIN_TIEMPO, 'Campaña Sin Tiempo', [
    makeAudit({
      id: UUID_AUDIT_SIN_TIEMPO,
      id_programa_auditoria: UUID_PROG_SIN_TIEMPO,
      tiene_sitio_temporal: true,
    }),
  ]);

  const progCompleto = makeProgram(UUID_PROG_COMPLETO, 'Campaña Completa', [
    makeAudit({
      id: UUID_AUDIT_COMPLETO,
      id_programa_auditoria: UUID_PROG_COMPLETO,
      tiene_sitio_temporal: true,
    }),
  ]);

  const temporalSites: AuditoriaSitioTemporalEntity[] = [
    {
      id: UUID_TEMP_1,
      id_auditoria: UUID_AUDIT_SIN_TIEMPO,
      etiqueta: 'Sitio Temporal',
      comentario: null,
      tiempo_auditoria: 0,
      certificados: [],
      equipoTemporal: [],
      deleted_at: null,
    },
    {
      id: UUID_TEMP_COMPLETO,
      id_auditoria: UUID_AUDIT_COMPLETO,
      etiqueta: 'Obra Planta Norte',
      comentario: 'Nave B',
      tiempo_auditoria: 1.25,
      certificados: [
        {
          id: '9b000000-0000-0000-0000-000000000001',
          id_sitio_temporal: UUID_TEMP_COMPLETO,
          id_auditoria_certificado: UUID_AUDIT_COMPLETO,
          numero_certificado: 'FN-QMS-2026-006',
          organizacion_nombre: 'Industrias Andinas S.A.',
          norma_codigo: 'ISO 9001:2015',
        },
      ],
      equipoTemporal: [
        {
          id: '9c000000-0000-0000-0000-000000000001',
          id_sitio_temporal: UUID_TEMP_COMPLETO,
          id_auditor: '10000000-0000-0000-0000-000000000001',
          auditor_nombre: 'Ing. Carlos Mendoza',
          rol_auditor: 'AUDITOR_LIDER',
          tiempo_auditoria: 1.25,
        },
      ],
      deleted_at: null,
    },
    {
      id: UUID_TEMP_2,
      id_auditoria: UUID_AUDIT_1,
      etiqueta: 'Sitio Archivado Ignorado',
      comentario: null,
      tiempo_auditoria: 2,
      certificados: [],
      equipoTemporal: [],
      deleted_at: '2026-01-01T00:00:00Z',
    },
  ];

  const rows = computeCampaignTemporalRows(
    [
      progEligibleNoTempRows,
      progExcludedFlagFalse,
      progExcludedIncompleteStep3,
      progSinTiempo,
      progCompleto,
    ],
    temporalSites
  );

  assert.equal(rows.length, 3);
  assert.equal(rows.some((r) => r.program.id === UUID_PROG_NO_TEMP), false);
  assert.equal(rows.some((r) => r.program.id === UUID_PROG_NO_STEP3), false);

  const rowSinSitio = rows.find((r) => r.program.id === UUID_PROG_ELIGIBLE);
  assert.ok(rowSinSitio);
  assert.equal(rowSinSitio.pendingStatus, 'SIN_SITIO_TEMPORAL');

  const rowSinTiempo = rows.find((r) => r.program.id === UUID_PROG_SIN_TIEMPO);
  assert.ok(rowSinTiempo);
  assert.equal(rowSinTiempo.pendingStatus, 'SIN_TIEMPO');

  const rowCompleto = rows.find((r) => r.program.id === UUID_PROG_COMPLETO);
  assert.ok(rowCompleto);
  assert.equal(rowCompleto.pendingStatus, 'COMPLETO');
  assert.equal(rowCompleto.totalTemporalDays, 1.25);
  assert.equal(rowCompleto.assignedTemporalDays, 1.25);

  const temporalMissingTeam: AuditoriaSitioTemporalEntity[] = [
    { ...temporalSites[1], equipoTemporal: [] },
  ];
  const rowsSinAuditores = computeCampaignTemporalRows([progCompleto], temporalMissingTeam);
  assert.equal(rowsSinAuditores[0]?.pendingStatus, 'SIN_AUDITORES');
  assert.equal(getTemporalPendingStatusMeta('SIN_AUDITORES').label, 'Sin auditores asignados');
});

test('validateTemporalSiteDraft & normalizeTemporalSiteLabel enforce default label, 0.25d steps, and >=1 campaign cert', () => {
  assert.equal(normalizeTemporalSiteLabel(''), 'Sitio Temporal');
  assert.equal(normalizeTemporalSiteLabel('   '), 'Sitio Temporal');
  assert.equal(normalizeTemporalSiteLabel('  Proyecto Obra Sur  '), 'Proyecto Obra Sur');

  const campaignAudits = [
    makeAudit({ id: UUID_AUDIT_1, tiene_sitio_temporal: true }),
    makeAudit({ id: UUID_AUDIT_2, tiene_sitio_temporal: false }),
  ];

  const defaultDraft = createEmptyTemporalSiteDraft(UUID_AUDIT_1, [UUID_AUDIT_1, UUID_AUDIT_2]);
  assert.equal(validateTemporalSiteDraft(defaultDraft, campaignAudits), null);

  assert.ok(validateTemporalSiteDraft({ ...defaultDraft, tiempo_auditoria: 0.1 }, campaignAudits)?.includes('0.25'));
  assert.ok(validateTemporalSiteDraft({ ...defaultDraft, tiempo_auditoria: 0 }, campaignAudits)?.includes('mayor a 0'));
  assert.ok(validateTemporalSiteDraft({ ...defaultDraft, targetAuditCertIds: [] }, campaignAudits)?.includes('al menos un certificado'));
  assert.ok(validateTemporalSiteDraft({ ...defaultDraft, id_auditoria: UUID_AUDIT_2 }, campaignAudits)?.includes('Sitio Temporal'));
  assert.ok(validateTemporalSiteDraft({ ...defaultDraft, targetAuditCertIds: [UUID_FOREIGN_AUDIT] }, campaignAudits)?.includes('campaña actual'));

  const cloned = createTemporalSiteDraftFromEntity({
    id: UUID_TEMP_1,
    id_auditoria: UUID_AUDIT_1,
    etiqueta: '',
    comentario: 'Obra temporal',
    tiempo_auditoria: 1.5,
    certificados: [
      {
        id: '9b000000-0000-0000-0000-000000000011',
        id_sitio_temporal: UUID_TEMP_1,
        id_auditoria_certificado: UUID_AUDIT_1,
        numero_certificado: 'FN-QMS-001',
        organizacion_nombre: 'Industrias Andinas S.A.',
        norma_codigo: 'ISO 9001:2015',
        deleted_at: null,
      },
    ],
    equipoTemporal: [],
    deleted_at: null,
  });
  assert.equal(cloned.etiqueta, 'Sitio Temporal');
  assert.deepEqual(cloned.targetAuditCertIds, [UUID_AUDIT_1]);
});

test('Step 5.1 Batch Temporal helpers: parseTemporalSiteDetails, formatTemporalSiteComment, resolveLinkedBatchTemporalState, validateBatchTemporalDraft & buildCertificateTemporalRows', () => {
  const formatted = formatTemporalSiteComment({
    ubicacion: 'Zona Industrial Valencia, Nave 4',
    fecha_tentativa: '2026-08-20',
    notas: 'Acceso restringido con EPP.',
  });
  assert.ok(formatted?.includes('Ubicación: Zona Industrial Valencia, Nave 4'));
  assert.ok(formatted?.includes('Fecha tentativa: 2026-08-20'));
  assert.ok(formatted?.includes('Notas: Acceso restringido con EPP.'));

  const parsed = parseTemporalSiteDetails(formatted);
  assert.deepEqual(parsed, {
    ubicacion: 'Zona Industrial Valencia, Nave 4',
    fecha_tentativa: '2026-08-20',
    notas: 'Acceso restringido con EPP.',
  });

  // Legacy plain text comment maps cleanly to notas
  assert.deepEqual(parseTemporalSiteDetails('Ampliación nave B'), {
    ubicacion: '',
    fecha_tentativa: '',
    notas: 'Ampliación nave B',
  });

  assert.ok(
    validateBatchTemporalDraft({
      etiqueta: '',
      ubicacion: 'Valencia',
      tiempo_auditoria: 1,
      fecha_tentativa: '',
      notas: '',
    })?.includes('nombre')
  );
  assert.ok(
    validateBatchTemporalDraft({
      etiqueta: 'Proyecto Sur',
      ubicacion: '',
      tiempo_auditoria: 1,
      fecha_tentativa: '',
      notas: '',
    })?.includes('ubicación')
  );
  assert.ok(
    validateBatchTemporalDraft({
      etiqueta: 'Proyecto Sur',
      ubicacion: 'Valencia',
      tiempo_auditoria: 0.3,
      fecha_tentativa: '',
      notas: '',
    })?.includes('0.25')
  );
  assert.equal(
    validateBatchTemporalDraft({
      etiqueta: 'Proyecto Sur',
      ubicacion: 'Valencia',
      tiempo_auditoria: 1.25,
      fecha_tentativa: '2026-08-20',
      notas: 'Obra activa',
    }),
    null
  );

  const aud1 = makeAudit({ id: UUID_AUDIT_1, id_certificado: UUID_CERT_1, tiene_sitio_temporal: true });
  const aud2 = makeAudit({
    id: UUID_AUDIT_2,
    id_certificado: UUID_CERT_2,
    numero_certificado: 'FN-EMS-2026-002',
    norma_codigo: 'ISO 14001:2015',
    tiene_sitio_temporal: true,
  });
  const prog = makeProgram(UUID_PROG_ELIGIBLE, 'Campaña Obra Sur', [aud1, aud2], true);
  const temporalSite: AuditoriaSitioTemporalEntity = {
    id: UUID_TEMP_1,
    id_auditoria: UUID_AUDIT_1,
    etiqueta: 'Sitio Temporal — Nave B',
    comentario: formatted,
    tiempo_auditoria: 0.75,
    certificados: [],
    equipoTemporal: [],
    deleted_at: null,
  };

  const resolution = resolveLinkedBatchTemporalState(aud1, [aud1, aud2], [prog], [temporalSite]);
  assert.equal(resolution.isTemporalEnabled, true);
  assert.equal(resolution.batchAudits.length, 2);
  assert.equal(resolution.requiresDisableConfirmation, true);
  assert.equal(resolution.totalTemporalDays, 0.75);

  const draft = createBatchTemporalDraftFromResolution(resolution);
  assert.equal(draft.etiqueta, 'Sitio Temporal — Nave B');
  assert.equal(draft.ubicacion, 'Zona Industrial Valencia, Nave 4');
  assert.equal(draft.tiempo_auditoria, 0.75);
});

test('Step 5.1 renderDesignacionTemporalView enforces Certificate Multi View, Clean Table, NO linked-siblings bar, Master Switch ON/OFF, confirm banner, Zero-UUID & RBAC', () => {
  const aud1 = makeAudit({
    id: UUID_AUDIT_1,
    id_programa_auditoria: UUID_PROG_ELIGIBLE,
    id_certificado: UUID_CERT_1,
    numero_certificado: 'FN-QMS-2026-001',
    tiene_sitio_temporal: true,
  });
  const aud2 = makeAudit({
    id: UUID_AUDIT_2,
    id_programa_auditoria: UUID_PROG_ELIGIBLE,
    id_certificado: UUID_CERT_2,
    numero_certificado: 'FN-EMS-2026-002',
    norma_codigo: 'ISO 14001:2015',
    tiene_sitio_temporal: true,
  });
  const audOff = makeAudit({
    id: UUID_AUDIT_NO_TEMP,
    id_programa_auditoria: UUID_PROG_NO_TEMP,
    id_certificado: UUID_CERT_OFF,
    numero_certificado: 'FN-OFF-2026-003',
    norma_codigo: 'ISO 45001:2018',
    tiene_sitio_temporal: false,
  });

  const progOn = makeProgram(UUID_PROG_ELIGIBLE, 'Campaña Obra Sur', [aud1, aud2], true);
  const progOff = makeProgram(UUID_PROG_NO_TEMP, 'Campaña Sin Temporal', [audOff], false);

  const temporalSite: AuditoriaSitioTemporalEntity = {
    id: UUID_TEMP_1,
    id_auditoria: UUID_AUDIT_1,
    etiqueta: 'Sitio Temporal — Nave B',
    comentario: 'Ubicación: Valencia Nave B\nFecha tentativa: 2026-08-15\nNotas: Línea productiva',
    tiempo_auditoria: 0.75,
    certificados: [],
    equipoTemporal: [],
    deleted_at: null,
  };

  const certificates: CertificateRecord[] = [
    {
      id: UUID_CERT_1,
      numero_certificado: 'FN-QMS-2026-001',
      organizacion_nombre: 'Industrias Andinas S.A.',
      norma: 'ISO 9001:2015',
      estatus: 'Activo',
      sector_iaf: 17,
    },
    {
      id: UUID_CERT_OFF,
      numero_certificado: 'FN-OFF-2026-003',
      organizacion_nombre: 'Industrias Andinas S.A.',
      norma: 'ISO 45001:2018',
      estatus: 'Activo',
      sector_iaf: 17,
    },
    {
      id: UUID_CERT_EMPTY,
      numero_certificado: 'FN-LIBRE-2026-099',
      organizacion_nombre: 'Industrias Andinas S.A.',
      norma: 'ISO 50001:2018',
      estatus: 'Estudio',
      sector_iaf: 17,
    },
  ];

  // Build rows check
  const builtRows = buildCertificateTemporalRows({
    certificates,
    audits: [aud1, aud2, audOff],
    programs: [progOn, progOff],
    temporalSites: [temporalSite],
  });
  assert.equal(builtRows.find((r) => r.certId === UUID_CERT_1)?.temporalStatus, 'ON');
  assert.equal(builtRows.find((r) => r.certId === UUID_CERT_OFF)?.temporalStatus, 'OFF');
  assert.equal(builtRows.find((r) => r.certId === UUID_CERT_EMPTY)?.temporalStatus, 'SIN_AUDITORIA');

  // 1. Multi View table: <colgroup> sums 100%, 0 <button> inside <tbody>, Zero-UUID
  const multiHtml = renderDesignacionTemporalView({
    profile: WORKER_PROFILE,
    state: makeBaseViewState(),
    programs: [progOn, progOff],
    audits: [aud1, aud2, audOff],
    temporalSites: [temporalSite],
    vinculos: SAMPLE_VINCULOS,
    conglomerados: SAMPLE_CONGLOMERADOS,
    certificates,
  });
  assert.equal(assertZeroUuidExposure(multiHtml).compliant, true);
  assert.ok(multiHtml.includes('data-mv-domain="designacion-temporal"'));
  assert.ok(multiHtml.includes('ON · Activo'));
  assert.ok(multiHtml.includes('OFF · Sin temporal'));
  assert.ok(multiHtml.includes('Sitio Temporal — Nave B'));
  assert.ok(multiHtml.includes('0.75 d'));

  const colgroupMatch = multiHtml.match(/<colgroup>([\s\S]*?)<\/colgroup>/);
  assert.ok(colgroupMatch);
  const colWidths = [...colgroupMatch[1].matchAll(/width:\s*([\d.]+)%/g)].map((m) =>
    Number(m[1])
  );
  assert.equal(colWidths.length, 5);
  assert.equal(
    colWidths.reduce((s, n) => s + n, 0),
    100
  );
  const tbodyMatch = multiHtml.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/);
  assert.ok(tbodyMatch);
  assert.equal(tbodyMatch[1].includes('<button'), false);

  // 2. Detail View ON: ◀/▶ shell, NO linked siblings bar, Master Switch aria-checked="true", batch form + confirm OFF banner
  const detailOnHtml = renderDesignacionTemporalView({
    profile: ADMIN_PROFILE,
    state: makeBaseViewState({
      selectedCertId: UUID_CERT_1,
      selectedAuditId: UUID_AUDIT_1,
      confirmDisableBatch: true,
    }),
    programs: [progOn, progOff],
    audits: [aud1, aud2, audOff],
    temporalSites: [temporalSite],
    vinculos: SAMPLE_VINCULOS,
    conglomerados: SAMPLE_CONGLOMERADOS,
    certificates,
  });
  assert.equal(assertZeroUuidExposure(detailOnHtml).compliant, true);
  assert.ok(detailOnHtml.includes('data-action="select-section-audit"'));
  assert.equal(detailOnHtml.includes('data-linked-siblings-bar="true"'), false);
  assert.ok(detailOnHtml.includes('data-testid="temporal-linked-batch-banner"'));
  assert.ok(detailOnHtml.includes('data-action="toggle-batch-temporal-switch"'));
  assert.ok(detailOnHtml.includes('aria-checked="true"'));
  assert.ok(detailOnHtml.includes('data-testid="temporal-disable-confirm-banner"'));
  assert.ok(detailOnHtml.includes('id="batchTemporalSiteForm"'));
  assert.ok(detailOnHtml.includes('data-action="step-temporal-days"'));
  assert.ok(detailOnHtml.includes('data-action="save-batch-temporal-site"'));

  // 3. Detail View OFF: clean empty state, hides form
  const detailOffHtml = renderDesignacionTemporalView({
    profile: ADMIN_PROFILE,
    state: makeBaseViewState({
      selectedCertId: UUID_CERT_OFF,
      selectedAuditId: UUID_AUDIT_NO_TEMP,
    }),
    programs: [progOn, progOff],
    audits: [aud1, aud2, audOff],
    temporalSites: [temporalSite],
    vinculos: SAMPLE_VINCULOS,
    conglomerados: SAMPLE_CONGLOMERADOS,
    certificates,
  });
  assert.equal(assertZeroUuidExposure(detailOffHtml).compliant, true);
  assert.ok(detailOffHtml.includes('aria-checked="false"'));
  assert.ok(detailOffHtml.includes('data-testid="temporal-off-empty-state"'));
  assert.equal(detailOffHtml.includes('id="batchTemporalSiteForm"'), false);

  // 4. Read-only for AUDITOR & CLIENT
  for (const roProfile of [AUDITOR_PROFILE, CLIENT_PROFILE]) {
    const roDetailHtml = renderDesignacionTemporalView({
      profile: roProfile,
      state: makeBaseViewState({
        selectedCertId: UUID_CERT_1,
        selectedAuditId: UUID_AUDIT_1,
      }),
      programs: [progOn, progOff],
      audits: [aud1, aud2, audOff],
      temporalSites: [temporalSite],
      vinculos: SAMPLE_VINCULOS,
      conglomerados: SAMPLE_CONGLOMERADOS,
      certificates,
    });
    assert.equal(assertZeroUuidExposure(roDetailHtml).compliant, true);
    assert.ok(roDetailHtml.includes('Solo lectura'));
    assert.equal(roDetailHtml.includes('data-action="save-batch-temporal-site"'), false);
    const switchBtn = roDetailHtml.match(
      /<button[^>]*data-action="toggle-batch-temporal-switch"[^>]*>/
    )?.[0];
    assert.ok(switchBtn && switchBtn.includes('disabled'));
  }
});
