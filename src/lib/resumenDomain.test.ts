import test from 'node:test';
import assert from 'node:assert/strict';
import type { UserProfile } from './healthCheck';
import type { Phase5FindingEntity, ProgramacionAuditEntity } from './auditExecution';
import type { ProgramaAuditoriaEntity } from './auditPlanningEngine';
import type { AuditoriaSitioTemporalEntity } from './designacionTemporalDomain';
import type { CertificadoDetailEntity } from './multisiteSampling';
import { INITIAL_ORGANIZACIONES } from './activeCertificates';
import {
  buildConglomeradoAuditsList,
  buildConglomeradosWithStats,
  INITIAL_CONGLOMERADOS,
} from './conglomeradoDomain';
import { buildCertificateResumenRows, computeAuditStatusSummary } from './resumenDomain';
import { DEFAULT_RESUMEN_STATE, renderResumenView } from '../views/resumenView';
import { renderCalendarioView } from '../views/calendarioView';
import { renderAuditoriasView } from '../views/auditoriasView';
import { assertZeroUuidExposure } from './zeroUuid';
import { scopeProgramacionAuditsForProfile } from './accessControl';

const ADMIN_PROFILE: UserProfile = {
  id: '11111111-1111-4000-8000-000000000001',
  nombre: 'Admin Calidad',
  role: 'ADMIN',
  status: 'APPROVED',
};

const CLIENT_PROFILE: UserProfile = {
  id: '44444444-4444-4000-8000-000000000004',
  nombre: 'Cliente Portal',
  role: 'CLIENT',
  status: 'APPROVED',
};

const CERT_ALPHA_ID = '40000000-0000-4000-8000-000000000001';
const CERT_BETA_ID = '40000000-0000-4000-8000-000000000002';
const ORG_ALPHA_ID = INITIAL_ORGANIZACIONES[0].id;
const ORG_BETA_ID = INITIAL_ORGANIZACIONES[1].id;
const AUDIT_ALPHA_ID = '80000000-0000-4000-8000-000000000001';
const AUDIT_BETA_ID = '80000000-0000-4000-8000-000000000002';
const PROG_ALPHA_ID = '70000000-0000-4000-8000-000000000001';
const SITE_HQ_ID = '50000000-0000-4000-8000-000000000001';
const AUDITOR_1_ID = '20000000-0000-4000-8000-000000000001';

function makeBaseAudit(
  overrides: Partial<ProgramacionAuditEntity> = {}
): ProgramacionAuditEntity {
  return {
    id: AUDIT_ALPHA_ID,
    id_programa_auditoria: PROG_ALPHA_ID,
    codigo_auditoria: 'AUD-RES-2026-01',
    id_certificado: CERT_ALPHA_ID,
    numero_certificado: 'FN-ISO-2026-01',
    id_organizacion: ORG_ALPHA_ID,
    organizacion_nombre: INITIAL_ORGANIZACIONES[0].nombre,
    norma_codigo: 'ISO 9001:2015',
    sector_iaf: 17,
    id_tipo_auditoria: null,
    tipo_auditoria: '',
    id_metodologia_auditoria: '90000000-0000-4000-8000-000000000001',
    metodologia: 'Presencial',
    tiene_sitio_temporal: false,
    fecha_inicio: '',
    fecha_fin: '',
    fechas: [],
    dias_auditor: 0,
    tiempo_auditoria: 0,
    estatus: 'Planificado',
    estado_ciclo: 'Planificada',
    auditor_lider_id: null,
    auditor_lider: '',
    sede_principal_direccion: 'Parque Industrial Norte',
    equipo: [],
    sitiosPlan: [],
    sitiosMuestreo: [],
    matrizNormativa: [],
    recomendacion: null,
    revisado: false,
    fecha_revision: null,
    deleted_at: null,
    ...overrides,
  };
}

function makeDetailedCerts(): CertificadoDetailEntity[] {
  return [
    {
      id: CERT_ALPHA_ID,
      numero_certificado: 'FN-ISO-2026-01',
      id_organizacion: ORG_ALPHA_ID,
      organizacion_nombre: INITIAL_ORGANIZACIONES[0].nombre,
      id_norma: '10000000-0000-4000-8000-000000000001',
      norma_codigo: 'ISO 9001:2015',
      estatus: 'Activo',
      sector_iaf: 17,
      alcance: 'Fabricación',
      sitios: [],
    },
    {
      id: CERT_BETA_ID,
      numero_certificado: 'FN-ISO-2026-02',
      id_organizacion: ORG_BETA_ID,
      organizacion_nombre: INITIAL_ORGANIZACIONES[1].nombre,
      id_norma: '10000000-0000-4000-8000-000000000001',
      norma_codigo: 'ISO 14001:2015',
      estatus: 'Activo',
      sector_iaf: 17,
      alcance: 'Logística',
      sitios: [],
    },
  ];
}

test('Step 9.1: computeAuditStatusSummary evaluates parallel steps, Temporal ON/OFF denominator, NCs, and Revisión', () => {
  // 1. Blank audit -> Pendiente de Designación, denominator 10 (Temporal OFF = NO_APLICA)
  const blank = makeBaseAudit();
  const sBlank = computeAuditStatusSummary({ audit: blank });
  assert.equal(sBlank.estatus_auditoria, 'Pendiente de Designación');
  assert.equal(sBlank.applicableCount, 10);
  assert.equal(sBlank.completedCount, 0);
  assert.equal(sBlank.cards.find((c) => c.key === 'designacion/relacion')?.status, 'PENDIENTE');
  assert.equal(sBlank.cards.find((c) => c.key === 'designacion/relacion')?.stepTag, '1.1');
  assert.equal(sBlank.cards.find((c) => c.key === 'designacion/temporal')?.status, 'NO_APLICA');
  assert.deepEqual(
    sBlank.recommendedNextActions.map((a) => a.key),
    ['designacion/relacion', 'designacion/tipo', 'designacion/fecha', 'designacion/sitio']
  );

  // 2. Relación + Designation completed -> unlocks BOTH 3. Tiempo and 5. Proceso in parallel
  const designated = makeBaseAudit({
    tipo_vinculacion: 'Individual',
    id_tipo_auditoria: '91000000-0000-4000-8000-000000000001',
    tipo_auditoria: 'Seguimiento 1',
    fechas: [
      {
        id: 'f1000000-0000-4000-8000-000000000001',
        id_auditoria: AUDIT_ALPHA_ID,
        numero_secuencia: 1,
        tag: 'Programación',
        tipo_fecha: 'PROGRAMADA_EXACTA',
        anio: null,
        mes: null,
        fecha_inicio: '2026-06-15',
        fecha_fin: '2026-06-16',
        observacion: null,
        deleted_at: null,
      },
    ],
    sitiosPlan: [
      {
        id: 'sp000000-0000-4000-8000-000000000001',
        id_auditoria: AUDIT_ALPHA_ID,
        id_sitio: SITE_HQ_ID,
        numero_sitio: 0,
        nombre_sitio: 'Planta HQ',
        tiempo_auditoria: 0,
        procesos: [],
        deleted_at: null,
      },
    ],
  });

  const sDes = computeAuditStatusSummary({ audit: designated });
  assert.equal(sDes.estatus_auditoria, 'Por Asignar Tiempo');
  const nextKeys = sDes.recommendedNextActions.map((a) => a.key);
  assert.ok(nextKeys.includes('tiempo'), 'Tiempo must be unlocked in parallel');
  assert.ok(nextKeys.includes('proceso'), 'Proceso must be unlocked in parallel');

  // 3. Parallel branch: 4. Proceso + 5. Turno complete while 3. Auditor is still pending
  const parallelProg = makeBaseAudit({
    ...designated,
    sitiosPlan: [
      {
        id: 'sp000000-0000-4000-8000-000000000001',
        id_auditoria: AUDIT_ALPHA_ID,
        id_sitio: SITE_HQ_ID,
        numero_sitio: 0,
        nombre_sitio: 'Planta HQ',
        tiempo_auditoria: 2,
        procesos: [
          {
            id: 'app-1',
            id_auditoria_sitio: 'sp000000-0000-4000-8000-000000000001',
            id_proceso: 'proc-1',
            nombre_proceso: 'Producción',
            turnos: [
              {
                id: 'at-1',
                id_auditoria_sitio_proceso: 'app-1',
                id_turno_proceso_sitio: 'tps-1',
                nombre_turno: 'Turno Matutino',
                deleted_at: null,
              },
            ],
            deleted_at: null,
          },
        ],
        deleted_at: null,
      },
    ],
  });
  const sParallel = computeAuditStatusSummary({ audit: parallelProg });
  assert.equal(sParallel.cards.find((c) => c.key === 'proceso')?.status, 'COMPLETO');
  assert.equal(sParallel.cards.find((c) => c.key === 'turno')?.status, 'COMPLETO');
  assert.equal(sParallel.cards.find((c) => c.key === 'auditor')?.status, 'PENDIENTE');
  assert.equal(sParallel.estatus_auditoria, 'Planificación en Progreso');

  // 4. Temporal ON changes applicableCount to 10 and blocks full readiness until temporal configured
  const temporalSite: AuditoriaSitioTemporalEntity = {
    id: 'ts-1',
    id_auditoria: AUDIT_ALPHA_ID,
    etiqueta: 'Obra Temporal Norte',
    tiempo_auditoria: 1,
    comentario: 'Ubicación: Km 14 Autopista Norte | Alcance temporal',
    certificados: [],
    equipoTemporal: [
      {
        id: 'eqt-1',
        id_sitio_temporal: 'ts-1',
        id_auditor: AUDITOR_1_ID,
        auditor_nombre: 'Ing. Laura Gómez',
        rol_auditor: 'AUDITOR',
        tiempo_auditoria: 1,
        deleted_at: null,
      },
    ],
    deleted_at: null,
  };
  const withTemporalAndTeam = makeBaseAudit({
    ...parallelProg,
    tiene_sitio_temporal: true,
    sitiosPlan: [
      {
        ...(parallelProg.sitiosPlan?.[0] ?? {
          id: 'sp000000-0000-4000-8000-000000000001',
          id_auditoria: AUDIT_ALPHA_ID,
          id_sitio: SITE_HQ_ID,
          numero_sitio: 0,
          nombre_sitio: 'Planta HQ',
          tiempo_auditoria: 2,
          procesos: [],
        }),
        equipoSitio: [
          {
            id: 'eqs-1',
            id_auditoria_sitio: 'sp000000-0000-4000-8000-000000000001',
            id_auditor: AUDITOR_1_ID,
            auditor_nombre: 'Ing. Laura Gómez',
            rol_auditor: 'AUDITOR_LIDER',
            tiempo_auditoria: 2,
            deleted_at: null,
          },
        ],
      },
    ],
  });
  const sReady = computeAuditStatusSummary({
    audit: withTemporalAndTeam,
    temporalSites: [temporalSite],
  });
  assert.equal(sReady.applicableCount, 11);
  assert.equal(sReady.cards.find((c) => c.key === 'designacion/relacion')?.status, 'COMPLETO');
  assert.equal(sReady.cards.find((c) => c.key === 'designacion/temporal')?.status, 'COMPLETO');
  assert.equal(sReady.cards.find((c) => c.key === 'auditor')?.status, 'COMPLETO');
  assert.equal(sReady.estatus_auditoria, 'Programada / Lista para Ejecutar');

  // 5. Execution with open NC -> En Cierre de NC; all NCs closed -> Pendiente de Revisión; Revisión complete -> Completada ✓
  const executed = makeBaseAudit({
    ...withTemporalAndTeam,
    fechas: [
      ...(withTemporalAndTeam.fechas ?? []),
      {
        id: 'f1000000-0000-4000-8000-000000000002',
        id_auditoria: AUDIT_ALPHA_ID,
        numero_secuencia: 2,
        tag: 'Ejecución Real',
        tipo_fecha: 'REAL',
        anio: null,
        mes: null,
        fecha_inicio: '2026-06-15',
        fecha_fin: '2026-06-16',
        observacion: null,
        deleted_at: null,
      },
    ],
  });
  const openNc: Phase5FindingEntity = {
    id: 'nc-1',
    id_auditoria: AUDIT_ALPHA_ID,
    id_requisito: 'req-1',
    tipo: 'NC_MENOR',
    descripcion: 'Registro incompleto',
    fecha_evidencia: null,
    fecha_validacion: null,
    estatus_cierre: 'Abierta',
    deleted_at: null,
  };
  assert.equal(
    computeAuditStatusSummary({
      audit: executed,
      temporalSites: [temporalSite],
      findings: [openNc],
    }).estatus_auditoria,
    'En Cierre de NC'
  );

  const closedNc: Phase5FindingEntity = {
    ...openNc,
    cerrado: true,
    fecha_cierre_real: '2026-06-28',
    estatus_cierre: 'Cerrada',
  };
  assert.equal(
    computeAuditStatusSummary({
      audit: executed,
      temporalSites: [temporalSite],
      findings: [closedNc],
    }).estatus_auditoria,
    'Pendiente de Revisión'
  );

  const reviewed = makeBaseAudit({
    ...executed,
    revisado: true,
    fecha_revision: '2026-07-02',
  });
  const sDone = computeAuditStatusSummary({
    audit: reviewed,
    temporalSites: [temporalSite],
    findings: [closedNc],
  });
  assert.equal(sDone.estatus_auditoria, 'Completada ✓');
  assert.equal(sDone.completedCount, 11);

  // 6. Cancelled audit override
  const cancelled = makeBaseAudit({ ...reviewed, estado_ciclo: 'Cancelada', estatus: 'Cancelada' });
  const sCan = computeAuditStatusSummary({ audit: cancelled });
  assert.equal(sCan.estatus_auditoria, 'Cancelada');
  assert.equal(sCan.recommendedNextActions.length, 0);
});

test('Step 9.1: Unified estatus_auditoria matches across Resumen, Conglomerado → Auditorías, and Calendario', () => {
  const audit = makeBaseAudit({
    id_tipo_auditoria: '91000000-0000-4000-8000-000000000001',
    tipo_auditoria: 'Inicial',
    fechas: [
      {
        id: 'f1',
        id_auditoria: AUDIT_ALPHA_ID,
        numero_secuencia: 1,
        tag: 'Ejecución',
        tipo_fecha: 'REAL',
        anio: null,
        mes: null,
        fecha_inicio: '2026-05-10',
        fecha_fin: '2026-05-11',
        observacion: null,
        deleted_at: null,
      },
    ],
  });
  const openFinding: Phase5FindingEntity = {
    id: 'nc-sync-1',
    id_auditoria: AUDIT_ALPHA_ID,
    id_requisito: 'req-1',
    tipo: 'NC_MAYOR',
    descripcion: 'No conformidad abierta',
    fecha_evidencia: null,
    fecha_validacion: null,
    estatus_cierre: 'Abierta',
    deleted_at: null,
  };
  const prog: ProgramaAuditoriaEntity = {
    id: PROG_ALPHA_ID,
    id_vinculo: 'v-1',
    codigo_programa: 'PRG-SYNC-2026',
    etiqueta: 'Sync Campaña',
    nivel_vinculacion: 'INDIVIDUAL',
    tipo_vinculacion: 'Individual',
    es_vinculada: false,
    auditorias: [audit],
    deleted_at: null,
  };

  const summary = computeAuditStatusSummary({ audit, program: prog, findings: [openFinding] });
  const congGroup = buildConglomeradosWithStats(
    INITIAL_CONGLOMERADOS,
    INITIAL_ORGANIZACIONES,
    []
  ).find((g) => g.organizaciones.some((o) => o.id === ORG_ALPHA_ID));
  assert.ok(congGroup);
  const congList = buildConglomeradoAuditsList({
    group: congGroup,
    programacionAudits: [audit],
    programs: [prog],
    findings: [openFinding],
    profile: ADMIN_PROFILE,
  });
  assert.equal(congList[0].estatus_auditoria, summary.estatus_auditoria);

  const calHtml = renderCalendarioView({
    profile: ADMIN_PROFILE,
    state: {
      viewMode: 'list',
      displayMode: 'mes',
      referenceYear: 2026,
      referenceMonth: 5,
      filterAuditorId: 'ALL',
      filterStandard: 'ALL',
      filterMethodology: 'ALL',
      drawerAuditId: null,
    },
    audits: [audit],
    auditors: [],
    standards: [{ norma: 'ISO 9001:2015' }],
    programs: [prog],
    findings: [openFinding],
  });
  assert.ok(calHtml.includes(summary.estatus_auditoria));
});

test('Step 9.1: renderResumenView Multi View & Detail View comply with UniversalTemplate, Zero-UUID, RBAC, and legacy compat', () => {
  const auditA = makeBaseAudit({
    id_tipo_auditoria: '91000000-0000-4000-8000-000000000001',
    tipo_auditoria: 'Seguimiento 1',
  });
  const auditB = makeBaseAudit({
    id: AUDIT_BETA_ID,
    id_certificado: CERT_BETA_ID,
    numero_certificado: 'FN-ISO-2026-02',
    id_organizacion: ORG_BETA_ID,
    organizacion_nombre: INITIAL_ORGANIZACIONES[1].nombre,
    norma_codigo: 'ISO 14001:2015',
    codigo_auditoria: 'AUD-RES-2026-02',
  });
  const detailedCerts = makeDetailedCerts();

  // Multi View
  const multiHtml = renderResumenView({
    profile: ADMIN_PROFILE,
    state: DEFAULT_RESUMEN_STATE,
    audits: [auditA, auditB],
    certificados: detailedCerts,
  });
  assert.match(multiHtml, /data-resizable-table="resumen-main"/);
  assert.match(multiHtml, /data-action="select-section-cert"/);
  assert.match(multiHtml, /data-action="open-add-audit-wizard"/);

  const colgroupMatch = /<colgroup>([\s\S]*?)<\/colgroup>/i.exec(multiHtml);
  assert.ok(colgroupMatch, 'Expected <colgroup> in Resumen table');
  const colMatches = [...colgroupMatch[1].matchAll(/width:\s*([\d.]+)%/gi)].map((m) =>
    Number(m[1])
  );
  assert.equal(
    colMatches.reduce((a, b) => a + b, 0),
    100
  );
  const tbodyMatch = /<tbody[^>]*>([\s\S]*?)<\/tbody>/i.exec(multiHtml);
  assert.ok(tbodyMatch);
  assert.equal(/<button\b/i.test(tbodyMatch[1]), false, 'Zero <button> allowed inside <tbody>');
  assert.equal(assertZeroUuidExposure(multiHtml).compliant, true);

  // Detail View with 10 jump-resumen-section buttons & parallel pills
  const detailHtml = renderResumenView({
    profile: ADMIN_PROFILE,
    state: {
      ...DEFAULT_RESUMEN_STATE,
      selectedCertId: CERT_ALPHA_ID,
      selectedAuditId: AUDIT_ALPHA_ID,
    },
    audits: [auditA, auditB],
    certificados: detailedCerts,
  });
  assert.match(detailHtml, /data-testid="resumen-estatus-badge"/);
  assert.match(detailHtml, /data-testid="resumen-next-parallel-bar"/);
  const gridMatch = /data-testid="resumen-sections-grid"[\s\S]*$/i.exec(detailHtml);
  assert.ok(gridMatch, 'Expected resumen-sections-grid');
  const jumpButtons = [...gridMatch[0].matchAll(/data-action="jump-resumen-section"/g)];
  assert.equal(jumpButtons.length, 11);
  assert.equal(assertZeroUuidExposure(detailHtml).compliant, true);

  // Client RBAC scoping
  const clientScopedAudits = scopeProgramacionAuditsForProfile(
    [auditA, auditB],
    CLIENT_PROFILE,
    [ORG_ALPHA_ID]
  );
  const clientRows = buildCertificateResumenRows({
    audits: clientScopedAudits,
    detailedCerts: detailedCerts.filter((c) => c.id_organizacion === ORG_ALPHA_ID),
  });
  assert.equal(clientRows.length, 1);
  assert.equal(clientRows[0].numero_certificado, 'FN-ISO-2026-01');

  // Legacy AuditoriasViewState fallback (`resumenAuditId`)
  const legacyHtml = renderAuditoriasView(ADMIN_PROFILE, {
    activeSubSection: 'resumen',
    resumenAuditId: AUDIT_ALPHA_ID,
    programacionState: {
      query: '',
      viewMode: 'list',
      isSidebarOpen: true,
      selectedProgramId: null,
      selectedAuditId: null,
      selectedSitioAuditoriaId: null,
      selectedSitioAuditoriaTab: 'procesos',
      activeStep: 1,
      activeChildTab: 'planificacion',
      isEditingAttributes: false,
      isAddingTeamMember: false,
      isAddingAuditDate: false,
      isHistoryPanelOpen: false,
      filterQualifiedAuditorsOnly: true,
      expandedSiteIds: [],
      editErrorMessage: null,
      saveSuccessMessage: null,
      isCreating: false,
      prefillCertId: null,
      unscheduledCertStatusFilter: 'ALL',
    },
    calendarioState: {
      viewMode: 'list',
      displayMode: 'mes',
      referenceYear: 2026,
      referenceMonth: 6,
      filterAuditorId: 'ALL',
      filterStandard: 'ALL',
      filterMethodology: 'ALL',
      drawerAuditId: null,
    },
    resultadoState: {
      query: '',
      viewMode: 'list',
      isSidebarOpen: true,
      selectedAuditId: 'ALL',
    },
    programacionAudits: [auditA, auditB],
    phase5Findings: [],
    allAuditorsDetailed: [],
    certificates: [],
    allCertificadosDetailed: detailedCerts,
    processes: [],
    requirements: [],
    standards: [{ norma: 'ISO 9001:2015' }],
    loading: false,
  });
  assert.match(legacyHtml, /data-testid="resumen-sections-grid"/);
  assert.equal(assertZeroUuidExposure(legacyHtml).compliant, true);
});

test('Step 1.2: Preventive future audit (2028) completes 1.1-2, 4, 5 without 3. Auditor or 6. Resultado alongside active 2026 audit', () => {
  const active2026Audit = makeBaseAudit({
    id: AUDIT_ALPHA_ID,
    codigo_auditoria: 'AUD-2026-QMS-01',
    estado_ciclo: 'En Ejecución',
    estatus: 'En Ejecución',
    id_tipo_auditoria: '91000000-0000-4000-8000-000000000001',
    tipo_auditoria: 'Seguimiento 1',
    fechas: [
      {
        id: 'f2026-01',
        id_auditoria: AUDIT_ALPHA_ID,
        numero_secuencia: 1,
        tag: 'Programación',
        tipo_fecha: 'PROGRAMADA_EXACTA',
        anio: null,
        mes: null,
        fecha_inicio: '2026-06-10',
        fecha_fin: '2026-06-12',
        observacion: null,
        deleted_at: null,
      },
    ],
  });

  const futurePreventive2028Id = '52000000-0000-4000-8000-000000000099';
  const preventive2028Audit = makeBaseAudit({
    id: futurePreventive2028Id,
    codigo_auditoria: 'AUD-2028-QMS-01',
    estado_ciclo: 'En Programación',
    estatus: 'Planificado',
    tipo_vinculacion: 'Individual',
    id_tipo_auditoria: '91000000-0000-4000-8000-000000000002',
    tipo_auditoria: 'Renovación',
    fechas: [
      {
        id: 'f2028-01',
        id_auditoria: futurePreventive2028Id,
        numero_secuencia: 1,
        tag: 'Programación',
        tipo_fecha: 'PREPROGRAMADA_MES',
        anio: 2028,
        mes: 5,
        fecha_inicio: null,
        fecha_fin: null,
        observacion: 'Auditoría preventiva de recertificación',
        deleted_at: null,
      },
    ],
    sitiosPlan: [
      {
        id: 'sp-2028-1',
        id_auditoria: futurePreventive2028Id,
        id_sitio: 'sede-0',
        numero_sitio: 0,
        nombre_sitio: 'Sede Principal',
        direccion_sitio: 'Av. Industrial 100',
        tiempo_auditoria: 2,
        modalidad_evaluacion: 'Presencial',
        fecha_inicio: null,
        fecha_fin: null,
        notas_sitio: null,
        turnosSitio: [],
        equipoSitio: [],
        procesos: [
          {
            id: 'psa-2028-1',
            id_sitios_por_auditoria: 'sp-2028-1',
            id_procesos_por_sitio: 'pps-2028-1',
            id_proceso: 'proc-2028-1',
            nombre_proceso: 'Producción Principal',
            notas: null,
            turnos: [
              {
                id: 'tpsa-2028-1',
                id_procesos_sitio_auditoria: 'psa-2028-1',
                id_turnos_sitio_auditoria: 'tsa-2028-1',
                descripcion_turno: 'Turno Matutino',
                hora_entrada: '08:00',
                hora_salida: '16:00',
                deleted_at: null,
              },
            ],
            equipoProceso: [],
            deleted_at: null,
          },
        ],
        deleted_at: null,
      },
    ],
    auditor_lider_id: '',
    auditor_lider: 'Por asignar',
    equipo: [],
    revisado: false,
    fecha_revision: null,
  });

  const summary = computeAuditStatusSummary({
    audit: preventive2028Audit,
    allAudits: [active2026Audit, preventive2028Audit],
    findings: [],
  });

  const byKey = new Map(summary.cards.map((c) => [c.key, c.status]));
  assert.equal(byKey.get('designacion/relacion'), 'COMPLETO');
  assert.equal(byKey.get('designacion/tipo'), 'COMPLETO');
  assert.equal(byKey.get('designacion/fecha'), 'COMPLETO');
  assert.equal(byKey.get('designacion/sitio'), 'COMPLETO');
  assert.equal(byKey.get('designacion/temporal'), 'NO_APLICA');
  assert.equal(byKey.get('tiempo'), 'COMPLETO');
  assert.equal(byKey.get('proceso'), 'COMPLETO');
  assert.equal(byKey.get('turno'), 'COMPLETO');
  assert.equal(byKey.get('auditor'), 'PENDIENTE');
  assert.equal(byKey.get('resultado'), 'PENDIENTE');
  assert.equal(byKey.get('revision'), 'PENDIENTE');
  assert.equal(summary.estatus_auditoria, 'Planificación en Progreso');
  assert.equal(summary.completedCount, 7);
  assert.equal(summary.applicableCount, 10);
  assert.ok(summary.recommendedNextActions.some((a) => a.key === 'auditor'));
});

test('Step 4.1: Resumen isolates sites/processes to audit.id_certificado_version and renders organizacion_abreviacion, vN & Alcance banner', () => {
  const v1Id = '70000000-0000-4000-8000-000000000301';
  const v2Id = '70000000-0000-4000-8000-000000000302';
  const siteV1Id = '50000000-0000-4000-8000-000000000301';
  const siteV2OnlyId = '50000000-0000-4000-8000-000000000302';
  const procV1Id = '60000000-0000-4000-8000-000000000301';
  const procV2OnlyId = '60000000-0000-4000-8000-000000000302';

  const auditV1 = makeBaseAudit({
    id: AUDIT_ALPHA_ID,
    id_certificado: CERT_ALPHA_ID,
    id_certificado_version: v1Id,
    version_numero: 1,
    organizacion_abreviacion: 'IND-ALFA',
    id_tipo_auditoria: '91000000-0000-4000-8000-000000000001',
    tipo_auditoria: 'Seguimiento 1',
    sitiosPlan: [
      {
        id: 'sp-v1',
        id_auditoria: AUDIT_ALPHA_ID,
        id_sitio: siteV1Id,
        numero_sitio: 0,
        nombre_sitio: 'Planta V1',
        tiempo_auditoria: 2,
        procesos: [
          {
            id: 'psa-v1',
            id_sitios_por_auditoria: 'sp-v1',
            id_procesos_por_sitio: 'pps-v1',
            id_proceso: procV1Id,
            proceso_nombre: 'Proceso V1',
            turnos: [],
            equipoProceso: [],
            deleted_at: null,
          },
          {
            id: 'psa-v2-leak',
            id_sitios_por_auditoria: 'sp-v1',
            id_procesos_por_sitio: 'pps-v2',
            id_proceso: procV2OnlyId,
            proceso_nombre: 'Proceso Solo V2',
            turnos: [],
            equipoProceso: [],
            deleted_at: null,
          },
        ],
        equipoSitio: [],
        deleted_at: null,
      },
      {
        id: 'sp-v2-leak',
        id_auditoria: AUDIT_ALPHA_ID,
        id_sitio: siteV2OnlyId,
        numero_sitio: 1,
        nombre_sitio: 'Sucursal Solo V2',
        tiempo_auditoria: 1,
        procesos: [],
        equipoSitio: [],
        deleted_at: null,
      },
    ],
  });

  const certs: CertificadoDetailEntity[] = [
    {
      id: CERT_ALPHA_ID,
      numero_certificado: 'FN-ISO-2026-01',
      id_organizacion: ORG_ALPHA_ID,
      organizacion_nombre: INITIAL_ORGANIZACIONES[0].nombre,
      organizacion_abreviacion: 'IND-ALFA',
      id_norma: '10000000-0000-4000-8000-000000000001',
      norma_codigo: 'ISO 9001:2015',
      estatus: 'Activo',
      sector_iaf: 17,
      alcance: 'Fabricación y ensamblaje industrial de precisión.',
      alcanceDetalle: {
        id: 'a0000000-0000-4000-8000-000000000301',
        id_certificado: CERT_ALPHA_ID,
        alcance_es: 'Fabricación y ensamblaje industrial de precisión.',
        alcance_en: null,
        esCompartido: false,
        deleted_at: null,
      },
      versiones: [
        {
          id: v1Id,
          id_certificado: CERT_ALPHA_ID,
          version_numero: 1,
          es_version_actual: false,
          fecha_emision_version: '2025-01-01',
          organizacion_abreviacion: 'IND-ALFA',
          sitios: [
            {
              id: siteV1Id,
              id_organizacion: ORG_ALPHA_ID,
              numero_sitio: 0,
              nombre: 'Planta V1',
              direccion: 'Zona Industrial',
              personal_count: 50,
            },
          ],
          procesos: [
            {
              id: procV1Id,
              id_certificado: CERT_ALPHA_ID,
              nombre_proceso: 'Proceso V1',
              tipo: 'Medular',
              clausulas_cubiertas: ['8.5'],
              sitios_vinculados: [siteV1Id],
            },
          ],
          turnos: [],
          noAplicables: [],
          deleted_at: null,
        },
        {
          id: v2Id,
          id_certificado: CERT_ALPHA_ID,
          version_numero: 2,
          es_version_actual: true,
          fecha_emision_version: '2026-01-01',
          organizacion_abreviacion: 'IND-ALFA',
          sitios: [
            {
              id: siteV1Id,
              id_organizacion: ORG_ALPHA_ID,
              numero_sitio: 0,
              nombre: 'Planta V1',
              direccion: 'Zona Industrial',
              personal_count: 50,
            },
            {
              id: siteV2OnlyId,
              id_organizacion: ORG_ALPHA_ID,
              numero_sitio: 1,
              nombre: 'Sucursal Solo V2',
              direccion: 'Av. Norte',
              personal_count: 20,
            },
          ],
          procesos: [
            {
              id: procV1Id,
              id_certificado: CERT_ALPHA_ID,
              nombre_proceso: 'Proceso V1',
              tipo: 'Medular',
              clausulas_cubiertas: ['8.5'],
              sitios_vinculados: [siteV1Id],
            },
            {
              id: procV2OnlyId,
              id_certificado: CERT_ALPHA_ID,
              nombre_proceso: 'Proceso Solo V2',
              tipo: 'De Apoyo',
              clausulas_cubiertas: ['7.1'],
              sitios_vinculados: [siteV2OnlyId],
            },
          ],
          turnos: [],
          noAplicables: [],
          deleted_at: null,
        },
      ],
      sitios: [],
    },
  ];

  const scopedSummary = computeAuditStatusSummary({
    audit: auditV1,
    detailedCerts: certs,
  });
  const sitioCard = scopedSummary.cards.find((c) => c.key === 'designacion/sitio');
  const tiempoCard = scopedSummary.cards.find((c) => c.key === 'tiempo');
  const procesoCard = scopedSummary.cards.find((c) => c.key === 'proceso');
  assert.equal(sitioCard?.headlineValue, '1 sitio · Temporal OFF');
  assert.equal(tiempoCard?.headlineValue, '2 días totales');
  assert.equal(procesoCard?.headlineValue, '1 proceso');

  const multiHtml = renderResumenView({
    profile: ADMIN_PROFILE,
    state: DEFAULT_RESUMEN_STATE,
    audits: [auditV1],
    certificados: certs,
  });
  assert.match(multiHtml, /IND-ALFA/);
  assert.match(multiHtml, />v1</);
  assert.match(multiHtml, /Alcance: Fabricación y ensamblaje industrial de precisión\./);
  assert.equal(assertZeroUuidExposure(multiHtml).compliant, true);

  const detailHtml = renderResumenView({
    profile: ADMIN_PROFILE,
    state: {
      ...DEFAULT_RESUMEN_STATE,
      selectedCertId: CERT_ALPHA_ID,
      selectedAuditId: AUDIT_ALPHA_ID,
    },
    audits: [auditV1],
    certificados: certs,
  });
  assert.match(detailHtml, /IND-ALFA/);
  assert.match(detailHtml, />v1</);
  assert.match(detailHtml, /Fabricación y ensamblaje industrial de precisión\./);
  assert.equal(assertZeroUuidExposure(detailHtml).compliant, true);
});

test('Step 1.4: resumenDomain 4. Auditor summary card includes assigned global technical experts count when present', () => {
  const auditWithExpert = makeBaseAudit({
    tipo_vinculacion: 'Individual',
    id_tipo_auditoria: '91000000-0000-4000-8000-000000000001',
    tipo_auditoria: 'Seguimiento 1',
    auditor_lider: 'Ing. Patricia Valera',
    fechas: [
      {
        id: 'f1000000-0000-4000-8000-000000000001',
        id_auditoria: AUDIT_ALPHA_ID,
        numero_secuencia: 1,
        tag: 'Programación',
        tipo_fecha: 'PROGRAMADA_EXACTA',
        anio: null,
        mes: null,
        fecha_inicio: '2026-06-15',
        fecha_fin: '2026-06-16',
        observacion: null,
        deleted_at: null,
      },
    ],
    sitiosPlan: [
      {
        id: 'sp000000-0000-4000-8000-000000000001',
        id_auditoria: AUDIT_ALPHA_ID,
        id_sitio: SITE_HQ_ID,
        numero_sitio: 0,
        nombre_sitio: 'Planta HQ',
        tiempo_auditoria: 2,
        procesos: [],
        equipoSitio: [
          {
            id: 'eqs-1',
            id_auditoria_sitio: 'sp000000-0000-4000-8000-000000000001',
            id_auditor: AUDITOR_1_ID,
            auditor_nombre: 'Ing. Patricia Valera',
            rol_auditor: 'AUDITOR_LIDER',
            tiempo_auditoria: 2,
            deleted_at: null,
          },
        ],
        deleted_at: null,
      },
    ],
    expertoTecnicoAsignaciones: [
      {
        id: '1e300000-0000-4000-8000-000000000001',
        id_auditoria: AUDIT_ALPHA_ID,
        id_experto_tecnico: '1e000000-0000-0000-0000-000000000001',
        experto_nombre: 'Dra. Sofía Quintero',
        experto_estatus: 'Disponible',
        dias_asignados: 1.0,
        observacion: 'Validación técnica',
        deleted_at: null,
      },
    ],
  });

  const summary = computeAuditStatusSummary({ audit: auditWithExpert });
  const auditorCard = summary.cards.find((c) => c.key === 'auditor');
  assert.ok(auditorCard);
  assert.equal(auditorCard.status, 'COMPLETO');
  assert.match(auditorCard.secondaryMeta, /1 exp\. técnico/);
});
