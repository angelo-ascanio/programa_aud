import test from 'node:test';
import assert from 'node:assert/strict';
import type { UserProfile } from './healthCheck';
import {
  INITIAL_PROGRAMACION_AUDITS,
  INITIAL_PHASE5_FINDINGS,
  type ProgramacionAuditEntity,
  type ProgramacionViewState,
} from './auditExecution';
import { INITIAL_ORGANIZACIONES } from './activeCertificates';
import { INITIAL_CERTIFICADOS_DETAILED } from './multisiteSampling';
import { INITIAL_AUDITORES_DETAILED } from './competencyMatrix';
import { SAMPLE_CERTIFICATE_RECORDS } from './searchControls';
import {
  INITIAL_METODOLOGIAS_CATALOG,
  INITIAL_TIPOS_AUDITORIA_CATALOG,
} from './extraDomain';
import {
  computeAuditPlanningStatus,
  type AuditDateEntry,
  type AuditoriaSitioPlanItem,
  type ProgramaAuditoriaEntity,
} from './auditPlanningEngine';
import { DEFAULT_AUDIT_ALERT_CONFIG } from './auditAlertsEngine';
import { assertZeroUuidExposure } from './zeroUuid';
import {
  renderCertificateHistoryPanel,
  renderAuditPlannerHud,
  renderAuditPlannerTree,
} from '../views/auditPlannerView';
import { renderProgramacionView } from '../views/programacionView';

const ADMIN_PROFILE: UserProfile = {
  id: '00000000-0000-0000-0000-000000000001',
  nombre: 'Admin Calidad',
  role: 'ADMIN',
  status: 'APPROVED',
  created_at: '2025-01-01T00:00:00Z',
};

const AUDITOR_PROFILE: UserProfile = {
  id: INITIAL_AUDITORES_DETAILED[0].id,
  nombre: INITIAL_AUDITORES_DETAILED[0].nombre,
  role: 'AUDITOR',
  status: 'APPROVED',
  created_at: '2025-01-01T00:00:00Z',
};

function assertCleanZeroUuid(label: string, html: string): void {
  const res = assertZeroUuidExposure(html);
  assert.equal(
    res.compliant,
    true,
    `${label} exposed raw UUID(s): ${res.exposedUuids.join(', ')}`
  );
}

function assertNoInlineStyleAttrs(label: string, html: string): void {
  assert.equal(
    /\bstyle\s*=/i.test(html),
    false,
    `${label} must not contain inline style= attributes`
  );
}

function makeBaseProgramState(
  overrides: Partial<ProgramacionViewState> = {}
): ProgramacionViewState {
  return {
    selectedAuditId: null,
    selectedProgramId: null,
    isCreating: false,
    prefillCertId: null,
    activeStep: 1,
    activeChildTab: 'planificacion',
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
    isHistoryPanelOpen: false,
    filterQualifiedAuditorsOnly: true,
    editErrorMessage: null,
    saveSuccessMessage: null,
    isSidebarOpen: true,
    facetSelections: {},
    ...overrides,
  };
}

function buildCycleHistoryFixture(): {
  certDetail: (typeof INITIAL_CERTIFICADOS_DETAILED)[number];
  allPrograms: ProgramaAuditoriaEntity[];
  currentProgram: ProgramaAuditoriaEntity;
  currentAudit: ProgramacionAuditEntity;
} {
  const baseCert = INITIAL_CERTIFICADOS_DETAILED[0];
  const certDetail = {
    ...baseCert,
    procesos: [
      {
        id: '90000000-0000-0000-0000-000000000701',
        id_certificado: baseCert.id,
        nombre_proceso: 'Mecanizado CNC',
        tipo: 'Misional' as const,
        estado: 'Activo' as const,
      },
      {
        id: '90000000-0000-0000-0000-000000000702',
        id_certificado: baseCert.id,
        nombre_proceso: 'Calibración <script>alert(1)</script>',
        tipo: 'Apoyo' as const,
        estado: 'Activo' as const,
      },
    ],
  };

  const baseAudit = INITIAL_PROGRAMACION_AUDITS[0];
  const leaderId = INITIAL_AUDITORES_DETAILED[0].id;
  const leaderName = 'Carlos <script>Líder</script>';
  const secondAuditorId = INITIAL_AUDITORES_DETAILED[1].id;
  const secondAuditorName = INITIAL_AUDITORES_DETAILED[1].nombre;

  const makePriorProgram = (
    idx: number,
    year: number,
    nature: 'Combinada' | 'Individual',
    tipo: string
  ): ProgramaAuditoriaEntity => {
    const progId = `10000000-0000-0000-0000-00000000080${idx}`;
    const auditId = `20000000-0000-0000-0000-00000000080${idx}`;
    const sitePlanId = `40000000-0000-0000-0000-00000000080${idx}`;
    const procPlanId = `70000000-0000-0000-0000-00000000080${idx}`;
    const fechaInicio = `${year}-05-10`;
    const fechaFin = `${year}-05-11`;
    const realDate: AuditDateEntry = {
      id: `30000000-0000-0000-0000-00000000080${idx}`,
      id_auditoria: auditId,
      numero_secuencia: 1,
      tag: 'Programación',
      tipo_fecha: 'REAL',
      anio: null,
      mes: null,
      fecha_inicio: fechaInicio,
      fecha_fin: fechaFin,
      observacion: null,
      deleted_at: null,
    };

    const sitePlan: AuditoriaSitioPlanItem = {
      id: sitePlanId,
      id_auditoria: auditId,
      id_sitio: '50000000-0000-0000-0000-000000000801',
      numero_sitio: 0,
      nombre_sitio: 'Planta Norte',
      direccion_sitio: 'Av. Industrial 10',
      modalidad_evaluacion: 'Presencial',
      tiempo_auditoria: 3.0,
      deleted_at: null,
      equipoSitio: [
        {
          id: `60000000-0000-0000-0000-00000000080${idx}`,
          id_sitios_por_auditoria: sitePlanId,
          id_auditor: leaderId,
          auditor_nombre: leaderName,
          rol_auditor: 'AUDITOR_LIDER',
          tiempo_auditoria: 3.0,
          asignacion_completa_sitio: true,
          deleted_at: null,
        },
      ],
      procesos: [
        {
          id: procPlanId,
          id_sitios_por_auditoria: sitePlanId,
          id_procesos_por_sitio: '75000000-0000-0000-0000-000000000801',
          id_proceso: certDetail.procesos[0].id,
          proceso_nombre: certDetail.procesos[0].nombre_proceso,
          deleted_at: null,
          turnos: [
            {
              id: `80000000-0000-0000-0000-00000000080${idx}`,
              id_procesos_sitio_auditoria: procPlanId,
              id_turnos_sitio_auditoria: `85000000-0000-0000-0000-00000000080${idx}`,
              descripcion_turno: 'Turno Matutino',
              deleted_at: null,
            },
          ],
          equipoProceso: [],
        },
      ],
    };

    return {
      id: progId,
      codigo_programa: `PROG-${year}-00${idx}`,
      etiqueta: `Ciclo ${year} ${baseCert.organizacion_nombre}`,
      nivel_vinculacion: nature === 'Individual' ? 'INDIVIDUAL' : 'NIVEL_1_INTRA_ORG',
      tipo_vinculacion: nature,
      es_vinculada: nature !== 'Individual',
      id_ciclo_origen: null,
      notas: null,
      deleted_at: null,
      auditorias: [
        {
          ...baseAudit,
          id: auditId,
          id_programa_auditoria: progId,
          codigo_auditoria: `AUD-${year}-00${idx}`,
          id_certificado: baseCert.id,
          numero_certificado: baseCert.numero_certificado,
          organizacion_nombre: baseCert.organizacion_nombre,
          norma_codigo: baseCert.norma_codigo,
          tipo_auditoria: tipo,
          estado_ciclo: 'Auditada',
          estatus: 'Auditada',
          tiempo_auditoria: 3.0,
          fecha_inicio: fechaInicio,
          fecha_fin: fechaFin,
          fecha_reprogramacion: null,
          auditor_lider_id: leaderId,
          auditor_lider: leaderName,
          fechas: [realDate],
          latestDate: realDate,
          sitiosPlan: [sitePlan],
        },
      ],
    };
  };

  // Build 6 prior cycles (to verify 5-cycle timeline cap & threshold rotation)
  const p1 = makePriorProgram(1, 2020, 'Individual', 'Etapa 2');
  const p2 = makePriorProgram(2, 2021, 'Individual', 'Seguimiento 1');
  const p3 = makePriorProgram(3, 2022, 'Individual', 'Seguimiento 2');
  const p4 = makePriorProgram(4, 2023, 'Combinada', 'Renovación');
  const p5 = makePriorProgram(5, 2024, 'Combinada', 'Seguimiento 1');
  const p6 = makePriorProgram(6, 2025, 'Combinada', 'Seguimiento 2');

  const currentProgId = '10000000-0000-0000-0000-000000000899';
  const currentAuditId = '20000000-0000-0000-0000-000000000899';
  const currentSitePlanId = '40000000-0000-0000-0000-000000000899';
  const currentProcPlanId = '70000000-0000-0000-0000-000000000899';

  const currentRealDate: AuditDateEntry = {
    id: '30000000-0000-0000-0000-000000000899',
    id_auditoria: currentAuditId,
    numero_secuencia: 2,
    tag: 'Reprogramación',
    tipo_fecha: 'REAL',
    anio: null,
    mes: null,
    fecha_inicio: '2026-06-10',
    fecha_fin: '2026-06-12',
    observacion: 'Confirmado',
    deleted_at: null,
  };

  const currentSitePlan: AuditoriaSitioPlanItem = {
    id: currentSitePlanId,
    id_auditoria: currentAuditId,
    id_sitio: '50000000-0000-0000-0000-000000000801',
    numero_sitio: 0,
    nombre_sitio: 'Planta Principal',
    direccion_sitio: 'Av. Industrial 10',
    modalidad_evaluacion: 'Presencial',
    tiempo_auditoria: 6.0,
    deleted_at: null,
    equipoSitio: [
      {
        id: '60000000-0000-0000-0000-000000000891',
        id_sitios_por_auditoria: currentSitePlanId,
        id_auditor: leaderId,
        auditor_nombre: leaderName,
        rol_auditor: 'AUDITOR_LIDER',
        tiempo_auditoria: 3.0,
        asignacion_completa_sitio: true,
        deleted_at: null,
      },
      {
        id: '60000000-0000-0000-0000-000000000892',
        id_sitios_por_auditoria: currentSitePlanId,
        id_auditor: secondAuditorId,
        auditor_nombre: secondAuditorName,
        rol_auditor: 'AUDITOR',
        tiempo_auditoria: 3.0,
        asignacion_completa_sitio: true,
        deleted_at: null,
      },
    ],
    procesos: [
      {
        id: currentProcPlanId,
        id_sitios_por_auditoria: currentSitePlanId,
        id_procesos_por_sitio: '75000000-0000-0000-0000-000000000899',
        id_proceso: certDetail.procesos[0].id,
        proceso_nombre: certDetail.procesos[0].nombre_proceso,
        deleted_at: null,
        turnos: [
          {
            id: '80000000-0000-0000-0000-000000000899',
            id_procesos_sitio_auditoria: currentProcPlanId,
            id_turnos_sitio_auditoria: '85000000-0000-0000-0000-000000000899',
            descripcion_turno: 'Turno Único',
            deleted_at: null,
          },
        ],
        equipoProceso: [],
      },
    ],
  };

  const currentAudit: ProgramacionAuditEntity = {
    ...baseAudit,
    id: currentAuditId,
    id_programa_auditoria: currentProgId,
    codigo_auditoria: 'AUD-2026-099',
    id_certificado: baseCert.id,
    numero_certificado: baseCert.numero_certificado,
    organizacion_nombre: baseCert.organizacion_nombre,
    norma_codigo: baseCert.norma_codigo,
    sector_iaf: baseCert.sector_iaf,
    tipo_auditoria: 'Renovación',
    estado_ciclo: 'En Programación',
    estatus: 'En Programación',
    tiempo_auditoria: 6.0,
    fecha_inicio: '2026-06-10',
    fecha_fin: '2026-06-12',
    fecha_reprogramacion: null,
    auditor_lider_id: leaderId,
    auditor_lider: leaderName,
    fechas: [currentRealDate],
    latestDate: currentRealDate,
    equipo: [
      { id_auditor: leaderId, nombre: leaderName, rol: 'Auditor Líder', tarifa_dia: 400 },
      { id_auditor: secondAuditorId, nombre: secondAuditorName, rol: 'Auditor', tarifa_dia: 320 },
    ],
    sitiosPlan: [currentSitePlan],
  };

  const currentProgram: ProgramaAuditoriaEntity = {
    id: currentProgId,
    codigo_programa: 'PROG-2026-099',
    etiqueta: 'Campaña Integrada 2026',
    nivel_vinculacion: 'NIVEL_1_INTRA_ORG',
    tipo_vinculacion: 'Integrada',
    es_vinculada: true,
    id_ciclo_origen: p6.id,
    notas: null,
    deleted_at: null,
    auditorias: [currentAudit],
  };

  return {
    certDetail,
    allPrograms: [p1, p2, p3, p4, p5, p6, currentProgram],
    currentProgram,
    currentAudit,
  };
}

test('Step 4.1.1: renderCertificateHistoryPanel handles collapsed, expanded, evolution, rotation threshold, uncovered processes, 5-cycle cap, XSS & Zero-UUID', () => {
  const { certDetail, allPrograms, currentProgram, currentAudit } = buildCycleHistoryFixture();

  const collapsedHtml = renderCertificateHistoryPanel({
    certId: certDetail.id,
    certNumber: certDetail.numero_certificado,
    orgName: certDetail.organizacion_nombre,
    normaCode: certDetail.norma_codigo,
    currentAuditId: currentAudit.id,
    currentProgram,
    allPrograms,
    certDetail,
    alertConfig: DEFAULT_AUDIT_ALERT_CONFIG,
    isOpen: false,
  });

  assert.match(collapsedHtml, /id="toggleCertHistoryPanelBtn"/);
  assert.match(collapsedHtml, /aria-expanded="false"/);
  assert.match(collapsedHtml, /6 ciclo\(s\) previo\(s\)/);
  assert.match(collapsedHtml, /Evolución de Ciclo: Combinada → Integrada/);
  assert.match(collapsedHtml, /⚠️ Rotación Líder/);
  assert.match(collapsedHtml, /1 proceso\(s\) sin cobertura reciente/);
  assert.doesNotMatch(collapsedHtml, /id="certHistoryPanelBody"/);
  assertCleanZeroUuid('HistoryPanel collapsed', collapsedHtml);
  assertNoInlineStyleAttrs('HistoryPanel collapsed', collapsedHtml);

  const expandedHtml = renderCertificateHistoryPanel({
    certId: certDetail.id,
    certNumber: certDetail.numero_certificado,
    orgName: certDetail.organizacion_nombre,
    normaCode: certDetail.norma_codigo,
    currentAuditId: currentAudit.id,
    currentProgram,
    allPrograms,
    certDetail,
    alertConfig: DEFAULT_AUDIT_ALERT_CONFIG,
    isOpen: true,
  });

  assert.match(expandedHtml, /aria-expanded="true"/);
  assert.match(expandedHtml, /id="certHistoryPanelBody"/);
  assert.match(expandedHtml, /Ciclo previo: Combinada → Ciclo actual: Integrada/);
  assert.match(expandedHtml, /Rotación ISO\/IEC 17021-1/);
  assert.match(expandedHtml, /Procesos del certificado ausentes en la última visita previa \(1\)/);
  assert.match(expandedHtml, /Calibración &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(expandedHtml, /<script>/);
  assert.match(expandedHtml, /Últimos 5 de 6 ciclos/);
  assert.match(expandedHtml, /AUD-2025-006/);
  assert.match(expandedHtml, /Sitio 0 \(Planta Norte\)/);
  assert.match(expandedHtml, /Mecanizado CNC · 1 turno/);
  assert.match(expandedHtml, /data-action="open-history-cycle"/);
  assertCleanZeroUuid('HistoryPanel expanded', expandedHtml);
  assertNoInlineStyleAttrs('HistoryPanel expanded', expandedHtml);

  // Configurable threshold check: threshold=10 should suppress rotation warning
  const relaxedHtml = renderCertificateHistoryPanel({
    certId: certDetail.id,
    certNumber: certDetail.numero_certificado,
    orgName: certDetail.organizacion_nombre,
    normaCode: certDetail.norma_codigo,
    currentAuditId: currentAudit.id,
    currentProgram,
    allPrograms,
    certDetail,
    alertConfig: {
      ...DEFAULT_AUDIT_ALERT_CONFIG,
      ciclos_rotacion_auditor_lider: 10,
    },
    isOpen: true,
  });
  assert.doesNotMatch(relaxedHtml, /⚠️ Rotación Líder/);

  // Empty history state
  const emptyHtml = renderCertificateHistoryPanel({
    certId: '99999999-9999-9999-9999-999999999999',
    certNumber: 'CERT-NEW-01',
    allPrograms,
    isOpen: true,
  });
  assert.match(emptyHtml, /0 ciclo\(s\) previo\(s\)/);
  assert.match(emptyHtml, /Este certificado aún no registra ciclos históricos previos/);
  assertCleanZeroUuid('HistoryPanel empty', emptyHtml);
});

test('Step 4.1.1: renderAuditPlannerHud validates Dual-Bucket, Calendar Span (6.00d/2 auditors/3d), Overloads, Conflicts, PREPROGRAMADA_MES & Qualification Toggle', () => {
  const { allPrograms, currentAudit } = buildCycleHistoryFixture();
  const auditStatus = computeAuditPlanningStatus(currentAudit);

  const hudBalancedHtml = renderAuditPlannerHud({
    audit: currentAudit,
    auditStatus,
    allPrograms,
    allAuditors: INITIAL_AUDITORES_DETAILED,
    filterQualifiedOnly: true,
    canPlan: true,
  });

  assert.match(hudBalancedHtml, /data-testid="audit-planner-hud"/);
  assert.match(hudBalancedHtml, /role="progressbar"/);
  assert.match(hudBalancedHtml, /6\.00 d/);
  assert.match(hudBalancedHtml, /Cuadrado ✓/);
  assert.match(hudBalancedHtml, /Rango Calendario: <strong>3 días<\/strong> \(10\/06\/2026 → 12\/06\/2026\) · Capacidad máx\. por auditor: <span class="font-mono font-bold">3\.00d<\/span>/);
  assert.match(hudBalancedHtml, /6\.00 días-auditor \/ 2 auditores en 3 días calendario/);
  assert.match(hudBalancedHtml, /✓ Compatible con rango calendario/);
  assert.match(hudBalancedHtml, /id="plannerQualifiedFilterToggle"/);
  assert.match(hudBalancedHtml, /aria-checked="true"/);
  assert.doesNotMatch(hudBalancedHtml, /Sin calificación completa/);
  assertCleanZeroUuid('PlannerHUD balanced', hudBalancedHtml);
  assertNoInlineStyleAttrs('PlannerHUD balanced', hudBalancedHtml);

  // Overload + Cross-program conflict + filterQualifiedOnly=false + non-staff disabled
  const conflictingProgram: ProgramaAuditoriaEntity = {
    id: '10000000-0000-0000-0000-000000000777',
    codigo_programa: 'PROG-2026-CONF',
    etiqueta: 'Programa Paralelo Conflicto',
    nivel_vinculacion: 'INDIVIDUAL',
    tipo_vinculacion: 'Individual',
    es_vinculada: false,
    id_ciclo_origen: null,
    notas: null,
    deleted_at: null,
    auditorias: [
      {
        ...currentAudit,
        id: '20000000-0000-0000-0000-000000000777',
        id_programa_auditoria: '10000000-0000-0000-0000-000000000777',
        codigo_auditoria: 'AUD-2026-CONF',
        id_certificado: INITIAL_CERTIFICADOS_DETAILED[2].id,
        fechas: [
          {
            id: '30000000-0000-0000-0000-000000000777',
            id_auditoria: '20000000-0000-0000-0000-000000000777',
            numero_secuencia: 1,
            tag: 'Programación',
            tipo_fecha: 'REAL',
            anio: null,
            mes: null,
            fecha_inicio: '2026-06-11',
            fecha_fin: '2026-06-13',
            observacion: null,
            deleted_at: null,
          },
        ],
      },
    ],
  };

  const overloadedAudit: ProgramacionAuditEntity = {
    ...currentAudit,
    sitiosPlan: [
      {
        ...currentAudit.sitiosPlan![0],
        equipoSitio: [
          {
            ...currentAudit.sitiosPlan![0].equipoSitio[0],
            tiempo_auditoria: 4.0,
          },
        ],
      },
    ],
  };
  const overloadedStatus = computeAuditPlanningStatus(overloadedAudit);
  const hudAlertHtml = renderAuditPlannerHud({
    audit: overloadedAudit,
    auditStatus: overloadedStatus,
    allPrograms: [...allPrograms, conflictingProgram],
    allAuditors: INITIAL_AUDITORES_DETAILED,
    filterQualifiedOnly: false,
    canPlan: false,
  });

  assert.match(hudAlertHtml, /Faltan 2\.00 d/);
  assert.match(hudAlertHtml, /⚠️ Excede capacidad del rango/);
  assert.match(hudAlertHtml, /Conflictos de Agenda Detectados/);
  assert.match(hudAlertHtml, /⚠️ Sin calificación completa/);
  assert.match(hudAlertHtml, /aria-checked="false"/);
  assert.match(hudAlertHtml, /id="plannerQualifiedFilterToggle"[\s\S]*disabled/);
  assertCleanZeroUuid('PlannerHUD alerts', hudAlertHtml);
  assertNoInlineStyleAttrs('PlannerHUD alerts', hudAlertHtml);

  // PREPROGRAMADA_MES state
  const preprogDate: AuditDateEntry = {
    id: '30000000-0000-0000-0000-000000000666',
    id_auditoria: currentAudit.id,
    numero_secuencia: 3,
    tag: 'Reprogramación',
    tipo_fecha: 'PREPROGRAMADA_MES',
    anio: 2026,
    mes: 8,
    fecha_inicio: null,
    fecha_fin: null,
    observacion: null,
    deleted_at: null,
  };
  const preprogAudit: ProgramacionAuditEntity = {
    ...currentAudit,
    fechas: [preprogDate],
    latestDate: preprogDate,
  };
  const hudPreprogHtml = renderAuditPlannerHud({
    audit: preprogAudit,
    auditStatus: computeAuditPlanningStatus(preprogAudit),
    allPrograms,
    allAuditors: INITIAL_AUDITORES_DETAILED,
    filterQualifiedOnly: true,
    canPlan: true,
  });
  assert.match(hudPreprogHtml, /Fecha exacta pendiente de confirmar \(Mes\/Año\)/);
  assertCleanZeroUuid('PlannerHUD preprogramada', hudPreprogHtml);
});

test('Step 4.1.1: renderProgramacionView integrates History Panel in Step 1 (add/edit/read) and HUD + History Panel in Step 2 (planificacion)', () => {
  const { allPrograms, currentProgram, currentAudit } = buildCycleHistoryFixture();
  const certOpts = SAMPLE_CERTIFICATE_RECORDS.map((c) => ({
    id: c.id,
    numero_certificado: c.numero_certificado,
    id_organizacion: c.organizacion_id,
    organizacion_nombre: c.organizacion_nombre,
    norma_codigo: c.norma,
    estatus: c.estatus,
  }));

  // Step 1 'add' with prefilled cert -> History Panel visible even before saving
  const step1AddHtml = renderProgramacionView({
    profile: ADMIN_PROFILE,
    state: makeBaseProgramState({
      isCreating: true,
      prefillCertId: INITIAL_CERTIFICADOS_DETAILED[0].id,
      activeStep: 1,
      isHistoryPanelOpen: true,
    }),
    audits: allPrograms.flatMap((p) => p.auditorias),
    programs: allPrograms,
    findings: INITIAL_PHASE5_FINDINGS,
    certificates: certOpts,
    allCertificadosDetailed: INITIAL_CERTIFICADOS_DETAILED,
    organizaciones: INITIAL_ORGANIZACIONES,
    auditors: INITIAL_AUDITORES_DETAILED,
    tiposCatalog: INITIAL_TIPOS_AUDITORIA_CATALOG,
    metodologiasCatalog: INITIAL_METODOLOGIAS_CATALOG,
    alertConfig: DEFAULT_AUDIT_ALERT_CONFIG,
    loading: false,
  });
  assert.match(step1AddHtml, /data-testid="cert-history-panel"/);
  assert.match(step1AddHtml, /id="certHistoryPanelBody"/);
  assertCleanZeroUuid('Programacion Step 1 add + History', step1AddHtml);

  // Step 2 'planificacion' -> Both History Panel and Planner HUD rendered
  const step2ReadHtml = renderProgramacionView({
    profile: ADMIN_PROFILE,
    state: makeBaseProgramState({
      selectedProgramId: currentProgram.id,
      selectedAuditId: currentAudit.id,
      activeStep: 2,
      activeChildTab: 'planificacion',
      isHistoryPanelOpen: false,
      filterQualifiedAuditorsOnly: false,
    }),
    audits: allPrograms.flatMap((p) => p.auditorias),
    programs: allPrograms,
    findings: INITIAL_PHASE5_FINDINGS,
    certificates: certOpts,
    allCertificadosDetailed: INITIAL_CERTIFICADOS_DETAILED,
    organizaciones: INITIAL_ORGANIZACIONES,
    auditors: INITIAL_AUDITORES_DETAILED,
    tiposCatalog: INITIAL_TIPOS_AUDITORIA_CATALOG,
    metodologiasCatalog: INITIAL_METODOLOGIAS_CATALOG,
    alertConfig: DEFAULT_AUDIT_ALERT_CONFIG,
    loading: false,
  });
  assert.match(step2ReadHtml, /data-testid="cert-history-panel"/);
  assert.match(step2ReadHtml, /data-testid="audit-planner-hud"/);
  assert.match(step2ReadHtml, /Sin calificación completa/);
  assertCleanZeroUuid('Programacion Step 2 planificacion + HUD', step2ReadHtml);

  // RBAC: AUDITOR cannot toggle plannerQualifiedFilterToggle
  const step2AuditorHtml = renderProgramacionView({
    profile: AUDITOR_PROFILE,
    state: makeBaseProgramState({
      selectedProgramId: currentProgram.id,
      selectedAuditId: currentAudit.id,
      activeStep: 2,
      activeChildTab: 'planificacion',
    }),
    audits: allPrograms.flatMap((p) => p.auditorias),
    programs: allPrograms,
    findings: INITIAL_PHASE5_FINDINGS,
    certificates: certOpts,
    allCertificadosDetailed: INITIAL_CERTIFICADOS_DETAILED,
    organizaciones: INITIAL_ORGANIZACIONES,
    auditors: INITIAL_AUDITORES_DETAILED,
    tiposCatalog: INITIAL_TIPOS_AUDITORIA_CATALOG,
    metodologiasCatalog: INITIAL_METODOLOGIAS_CATALOG,
    alertConfig: DEFAULT_AUDIT_ALERT_CONFIG,
    loading: false,
  });
  assert.match(step2AuditorHtml, /id="plannerQualifiedFilterToggle"[\s\S]*disabled/);
  assertCleanZeroUuid('Programacion Step 2 AUDITOR RBAC', step2AuditorHtml);
});

const CLIENT_PROFILE: UserProfile = {
  id: '00000000-0000-0000-0000-000000000099',
  nombre: 'Cliente Observador',
  role: 'CLIENT',
  status: 'APPROVED',
  created_at: '2025-01-01T00:00:00Z',
};

function buildStep412TreeFixture() {
  const baseCert = INITIAL_CERTIFICADOS_DETAILED[0];
  const site0Id = '50000000-0000-0000-0000-000000000900';
  const site1Id = '50000000-0000-0000-0000-000000000901';
  const site2Id = '50000000-0000-0000-0000-000000000902';

  const tps0A = '71000000-0000-0000-0000-000000000901';
  const tps0B = '71000000-0000-0000-0000-000000000902';
  const pps0A = '75000000-0000-0000-0000-000000000901';
  const pps0B = '75000000-0000-0000-0000-000000000902';
  const procIdA = '90000000-0000-0000-0000-000000000901';
  const procIdB = '90000000-0000-0000-0000-000000000902';

  // Intentionally pass sites out of order [Sitio #2, Sitio #1, Sitio 0] to test sortSitesWithPrincipalFirst
  const certDetail: (typeof INITIAL_CERTIFICADOS_DETAILED)[number] = {
    ...baseCert,
    sitios: [
      {
        id: site2Id,
        id_certificado: baseCert.id,
        numero_sitio: 2,
        nombre_sitio: 'Bodega Sur (Sin Procesos)',
        direccion_sitio: 'Zona Sur 22',
        turnos_vinculados: [],
        turnos_por_sitio: [],
        procesos_por_sitio: [],
      },
      {
        id: site1Id,
        id_certificado: baseCert.id,
        numero_sitio: 1,
        nombre_sitio: 'Planta Secundaria',
        direccion_sitio: 'Zona Norte 11',
        turnos_vinculados: ['Turno Matutino'],
        turnos_por_sitio: [
          {
            id: '71000000-0000-0000-0000-000000000911',
            id_sitio: site1Id,
            id_turno: '70000000-0000-0000-0000-000000000001',
            hora_entrada: '07:00:00',
            hora_salida: '15:00:00',
            descripcion: 'Turno Matutino',
            deleted_at: null,
          },
        ],
        procesos_por_sitio: [
          {
            id: '75000000-0000-0000-0000-000000000911',
            id_sitio: site1Id,
            id_proceso: procIdA,
            nombre_proceso: 'Logística Regional',
            tipo_proceso: 'De Apoyo',
            clausulas_cubiertas: ['7.1'],
            deleted_at: null,
          },
        ],
      },
      {
        id: site0Id,
        id_certificado: baseCert.id,
        numero_sitio: 0,
        nombre_sitio: 'Sede Principal <script>alert(1)</script>',
        direccion_sitio: 'Av. Central 100',
        turnos_vinculados: ['Turno Día', 'Turno Noche'],
        turnos_por_sitio: [
          {
            id: tps0A,
            id_sitio: site0Id,
            id_turno: '70000000-0000-0000-0000-000000000001',
            hora_entrada: '07:00:00',
            hora_salida: '15:00:00',
            descripcion: 'Turno Día',
            deleted_at: null,
          },
          {
            id: tps0B,
            id_sitio: site0Id,
            id_turno: '70000000-0000-0000-0000-000000000002',
            hora_entrada: '15:00:00',
            hora_salida: '23:00:00',
            descripcion: 'Turno Noche <script>xss</script>',
            deleted_at: null,
          },
        ],
        procesos_por_sitio: [
          {
            id: pps0A,
            id_sitio: site0Id,
            id_proceso: procIdA,
            nombre_proceso: 'Manufactura CNC',
            tipo_proceso: 'Medular',
            clausulas_cubiertas: ['8.1', '8.5'],
            deleted_at: null,
          },
          {
            id: pps0B,
            id_sitio: site0Id,
            id_proceso: procIdB,
            nombre_proceso: 'Gestión de Calidad',
            tipo_proceso: 'Estratégico',
            clausulas_cubiertas: ['4.1', '9.1'],
            deleted_at: null,
          },
        ],
      },
    ],
  };

  const leaderAud = INITIAL_AUDITORES_DETAILED[0];
  const secondAud = INITIAL_AUDITORES_DETAILED[1];
  const unqualifiedAud = INITIAL_AUDITORES_DETAILED[2];

  const auditId = '20000000-0000-0000-0000-000000000950';
  const sitePlan0Id = '40000000-0000-0000-0000-000000000950';
  const sitePlan2Id = '40000000-0000-0000-0000-000000000952';
  const psaAId = '77000000-0000-0000-0000-000000000951';
  const psaBId = '77000000-0000-0000-0000-000000000952';

  const planSites: AuditoriaSitioPlanItem[] = [
    {
      id: sitePlan0Id,
      id_auditoria: auditId,
      id_sitio: site0Id,
      numero_sitio: 0,
      nombre_sitio: 'Sede Principal <script>alert(1)</script>',
      direccion_sitio: 'Av. Central 100',
      modalidad_evaluacion: 'Mixta',
      tiempo_auditoria: 2.5,
      deleted_at: null,
      equipoSitio: [
        {
          id: '60000000-0000-0000-0000-000000000951',
          id_sitios_por_auditoria: sitePlan0Id,
          id_auditor: leaderAud.id,
          auditor_nombre: leaderAud.nombre,
          rol_auditor: 'AUDITOR_LIDER',
          tiempo_auditoria: 1.5,
          asignacion_completa_sitio: true,
          deleted_at: null,
        },
        {
          id: '60000000-0000-0000-0000-000000000952',
          id_sitios_por_auditoria: sitePlan0Id,
          id_auditor: secondAud.id,
          auditor_nombre: secondAud.nombre,
          rol_auditor: 'AUDITOR',
          tiempo_auditoria: 1.0,
          asignacion_completa_sitio: false,
          deleted_at: null,
        },
      ],
      procesos: [
        {
          id: psaAId,
          id_sitios_por_auditoria: sitePlan0Id,
          id_procesos_por_sitio: pps0A,
          id_proceso: procIdA,
          proceso_nombre: 'Manufactura CNC',
          deleted_at: null,
          turnos: [
            {
              id: '80000000-0000-0000-0000-000000000951',
              id_procesos_sitio_auditoria: psaAId,
              id_turnos_sitio_auditoria: '85000000-0000-0000-0000-000000000951',
              id_turnos_por_sitio: tps0A,
              descripcion_turno: 'Turno Día',
              deleted_at: null,
            },
            {
              id: '80000000-0000-0000-0000-000000000952',
              id_procesos_sitio_auditoria: psaAId,
              id_turnos_sitio_auditoria: '85000000-0000-0000-0000-000000000952',
              id_turnos_por_sitio: tps0B,
              descripcion_turno: 'Turno Noche',
              deleted_at: null,
            },
          ],
          equipoProceso: [
            {
              id: '88000000-0000-0000-0000-000000000951',
              id_procesos_sitio_auditoria: psaAId,
              id_auditor: secondAud.id,
              auditor_nombre: secondAud.nombre,
              rol_en_proceso: 'CO_EVALUADOR',
              deleted_at: null,
            },
          ],
        },
        {
          id: psaBId,
          id_sitios_por_auditoria: sitePlan0Id,
          id_procesos_por_sitio: pps0B,
          id_proceso: procIdB,
          proceso_nombre: 'Gestión de Calidad',
          deleted_at: null,
          turnos: [],
          equipoProceso: [],
        },
      ],
    },
    {
      id: sitePlan2Id,
      id_auditoria: auditId,
      id_sitio: site2Id,
      numero_sitio: 2,
      nombre_sitio: 'Bodega Sur (Sin Procesos)',
      direccion_sitio: 'Zona Sur 22',
      modalidad_evaluacion: 'Presencial',
      tiempo_auditoria: 0.5,
      deleted_at: null,
      equipoSitio: [],
      procesos: [],
    },
  ];

  const baseAudit: ProgramacionAuditEntity = {
    ...INITIAL_PROGRAMACION_AUDITS[0],
    id: auditId,
    id_certificado: baseCert.id,
    numero_certificado: baseCert.numero_certificado,
    norma_codigo: baseCert.norma_codigo,
    sector_iaf: baseCert.sector_iaf,
    sitiosPlan: planSites,
  };

  return {
    certDetail,
    baseAudit,
    planSites,
    site0Id,
    site1Id,
    site2Id,
    leaderAud,
    secondAud,
    unqualifiedAud,
  };
}

test('Step 4.1.2: renderAuditPlannerTree sorts Sitio 0 first, handles collapsed/expanded accordion, 0.25d steppers, 1..N shifts, whole-site vs M:N co-evaluation, empty-site guard, qualification filter, XSS & Zero-UUID', () => {
  const {
    certDetail,
    baseAudit,
    planSites,
    site0Id,
    site2Id,
    leaderAud,
    secondAud,
    unqualifiedAud,
  } = buildStep412TreeFixture();

  // 1. Collapsed tree checks: Sitio 0 first, expanded bodies omitted
  const collapsedTreeHtml = renderAuditPlannerTree({
    audit: baseAudit,
    certDetail,
    planSites,
    allAuditors: INITIAL_AUDITORES_DETAILED,
    filterQualifiedOnly: true,
    expandedSiteIds: [],
    canPlan: true,
  });

  const idxSitio0 = collapsedTreeHtml.indexOf('Sitio 0 (HQ)');
  const idxSitio1 = collapsedTreeHtml.indexOf('Sitio #1');
  const idxSitio2 = collapsedTreeHtml.indexOf('Sitio #2');
  assert.ok(idxSitio0 >= 0 && idxSitio1 > idxSitio0 && idxSitio2 > idxSitio1, 'Sitio 0 must render before Sitio #1 and Sitio #2');
  assert.doesNotMatch(collapsedTreeHtml, /Equipo en este Sitio y Días Asignados/);
  assert.match(collapsedTreeHtml, /Cuadrado ✓/);
  assert.match(collapsedTreeHtml, /data-action="step-planner-site-days"/);
  assert.match(collapsedTreeHtml, /data-action="change-planner-site-modality"/);
  assert.match(collapsedTreeHtml, /data-action="open-sitio-auditoria"/);
  assertCleanZeroUuid('PlannerTree collapsed', collapsedTreeHtml);
  assertNoInlineStyleAttrs('PlannerTree collapsed', collapsedTreeHtml);

  // 2. Expanded Sitio 0 + Sitio #2 (empty processes guard), filterQualifiedOnly = true
  const expandedTreeHtml = renderAuditPlannerTree({
    audit: baseAudit,
    certDetail,
    planSites,
    allAuditors: INITIAL_AUDITORES_DETAILED,
    filterQualifiedOnly: true,
    expandedSiteIds: [site0Id, site2Id],
    canPlan: true,
    canNavigateToSite: true,
  });

  // XSS escaping checks
  assert.doesNotMatch(expandedTreeHtml, /<script>/);
  assert.match(expandedTreeHtml, /Sede Principal &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(expandedTreeHtml, /Turno Noche &lt;script&gt;xss&lt;\/script&gt;/);

  // Bucket 2 team & 1-click "Asignar a todo el Sitio" + M:N co-evaluation
  assert.match(expandedTreeHtml, /Equipo en este Sitio y Días Asignados \(Cubo 2\)/);
  assert.match(expandedTreeHtml, /Cubo 2: 2\.50 d \/ Cubo 1: 2\.50 d/);
  assert.match(expandedTreeHtml, /data-action="toggle-planner-whole-site"/);
  assert.match(expandedTreeHtml, /data-action="remove-planner-site-auditor"/);
  assert.match(expandedTreeHtml, new RegExp(`✓ ${leaderAud.nombre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\(Todo el sitio\\)`));
  assert.match(expandedTreeHtml, /data-action="toggle-planner-process-auditor"/);
  assert.match(expandedTreeHtml, /2 auditores efectivos/);
  assert.match(expandedTreeHtml, /2 turnos activos/);
  assert.match(expandedTreeHtml, /⚠️ Selecciona al menos 1 turno/);

  // Empty-site processes guard on Sitio #2 with jump button to Sitio procesos tab
  assert.match(expandedTreeHtml, /data-testid="empty-site-processes-guard"/);
  assert.match(expandedTreeHtml, /data-action="select-sitio"[^>]*data-target-tab="procesos"/);
  assert.match(expandedTreeHtml, /→ Ir al Sitio/);

  // Qualified filter true should exclude unqualified third auditor from <option>
  if (unqualifiedAud && unqualifiedAud.id !== secondAud.id) {
    assert.doesNotMatch(expandedTreeHtml, new RegExp(`value="${unqualifiedAud.id}"`));
  }

  assertCleanZeroUuid('PlannerTree expanded', expandedTreeHtml);
  assertNoInlineStyleAttrs('PlannerTree expanded', expandedTreeHtml);

  // 3. Expanded with filterQualifiedOnly = false includes all auditors with warning badge in picker
  const unfilteredTreeHtml = renderAuditPlannerTree({
    audit: baseAudit,
    certDetail,
    planSites,
    allAuditors: INITIAL_AUDITORES_DETAILED,
    filterQualifiedOnly: false,
    expandedSiteIds: [site0Id],
    canPlan: true,
  });
  if (unqualifiedAud) {
    assert.match(unfilteredTreeHtml, new RegExp(`value="${unqualifiedAud.id}"`));
    assert.match(unfilteredTreeHtml, /Sin calificación completa/);
  }
  assertCleanZeroUuid('PlannerTree unfiltered', unfilteredTreeHtml);
});

test('Step 4.1.2: RBAC read-only mode (!canPlan / AUDITOR / CLIENT) leaks ZERO mutation controls and integrates into renderProgramacionView', () => {
  const { certDetail, baseAudit, planSites, site0Id, site2Id } = buildStep412TreeFixture();
  const { allPrograms, currentProgram, currentAudit } = buildCycleHistoryFixture();

  const readOnlyTreeHtml = renderAuditPlannerTree({
    audit: baseAudit,
    certDetail,
    planSites,
    allAuditors: INITIAL_AUDITORES_DETAILED,
    filterQualifiedOnly: true,
    expandedSiteIds: [site0Id, site2Id],
    canPlan: false,
    canNavigateToSite: false,
  });

  // Zero mutator inputs, selects, or mutation buttons
  assert.doesNotMatch(readOnlyTreeHtml, /<input\b/);
  assert.doesNotMatch(readOnlyTreeHtml, /<select\b/);
  assert.doesNotMatch(readOnlyTreeHtml, /data-action="step-planner-site-days"/);
  assert.doesNotMatch(readOnlyTreeHtml, /data-action="step-planner-auditor-days"/);
  assert.doesNotMatch(readOnlyTreeHtml, /data-action="add-planner-site-auditor"/);
  assert.doesNotMatch(readOnlyTreeHtml, /data-action="remove-planner-site-auditor"/);
  assert.doesNotMatch(readOnlyTreeHtml, /data-action="toggle-planner-whole-site"/);
  assert.doesNotMatch(readOnlyTreeHtml, /data-action="toggle-planner-process-turno"/);
  assert.doesNotMatch(readOnlyTreeHtml, /data-action="toggle-planner-process-auditor"/);
  assert.doesNotMatch(readOnlyTreeHtml, /data-action="add-planner-process-auditor"/);
  assert.doesNotMatch(readOnlyTreeHtml, /data-action="select-sitio"/);

  // Read-only summaries still render cleanly
  assert.match(readOnlyTreeHtml, /Cubo 1: 2\.50 d/);
  assert.match(readOnlyTreeHtml, /Todo el sitio/);
  assert.match(readOnlyTreeHtml, /Evaluador M:N/);
  assert.match(readOnlyTreeHtml, /En Alcance/);
  assertCleanZeroUuid('PlannerTree read-only', readOnlyTreeHtml);
  assertNoInlineStyleAttrs('PlannerTree read-only', readOnlyTreeHtml);

  // Full renderProgramacionView Step 2 integration for ADMIN vs CLIENT
  const certOpts = SAMPLE_CERTIFICATE_RECORDS.map((c) => ({
    id: c.id,
    numero_certificado: c.numero_certificado,
    id_organizacion: c.organizacion_id,
    organizacion_nombre: c.organizacion_nombre,
    norma_codigo: c.norma,
    estatus: c.estatus,
  }));

  const clientStep2Html = renderProgramacionView({
    profile: CLIENT_PROFILE,
    state: makeBaseProgramState({
      selectedProgramId: currentProgram.id,
      selectedAuditId: currentAudit.id,
      activeStep: 2,
      activeChildTab: 'planificacion',
      expandedSiteIds: [currentAudit.sitiosPlan![0].id_sitio],
    }),
    audits: allPrograms.flatMap((p) => p.auditorias),
    programs: allPrograms,
    findings: INITIAL_PHASE5_FINDINGS,
    certificates: certOpts,
    allCertificadosDetailed: INITIAL_CERTIFICADOS_DETAILED,
    organizaciones: INITIAL_ORGANIZACIONES,
    auditors: INITIAL_AUDITORES_DETAILED,
    tiposCatalog: INITIAL_TIPOS_AUDITORIA_CATALOG,
    metodologiasCatalog: INITIAL_METODOLOGIAS_CATALOG,
    alertConfig: DEFAULT_AUDIT_ALERT_CONFIG,
    loading: false,
  });

  assert.match(clientStep2Html, /data-testid="audit-planner-tree"/);
  assert.doesNotMatch(clientStep2Html, /data-action="step-planner-site-days"/);
  assert.doesNotMatch(clientStep2Html, /data-action="add-planner-site-auditor"/);
  assertCleanZeroUuid('Programacion Step 2 CLIENT RBAC', clientStep2Html);
  assertNoInlineStyleAttrs('Programacion Step 2 CLIENT RBAC', clientStep2Html);
});
