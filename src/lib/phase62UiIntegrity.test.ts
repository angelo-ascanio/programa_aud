import test from 'node:test';
import assert from 'node:assert/strict';
import { assertZeroUuidExposure } from './zeroUuid';
import { renderHeader } from '../views/header';
import { renderDashboardView } from '../views/dashboardView';
import { renderProfileView } from '../views/profileView';
import { renderApprovalsView } from '../views/approvalsView';
import { renderOrganizacionView } from '../views/organizacionView';
import { renderClientAccessView } from '../views/clientAccessView';
import { renderCertificadoView } from '../views/certificadoView';
import { renderSitioView } from '../views/sitioView';
import { renderProcesoView } from '../views/procesoView';
import { renderTurnoView } from '../views/turnoView';
import { renderAuditorView } from '../views/auditorView';
import { renderCompetenciaAuditorView } from '../views/competenciaAuditorView';
import { renderProgramacionView } from '../views/programacionView';
import { renderCalendarioView } from '../views/calendarioView';
import { renderResultadoView } from '../views/resultadoView';
import { renderExtraView } from '../views/extraView';
import { renderAcreditacionView } from '../views/acreditacionView';
import { renderAuditLogModal } from '../views/auditLogModal';
import { renderArchiveModal } from '../views/archiveModalView';
import { renderDetailPageTemplate } from '../views/detailTemplate';
import { renderBreadcrumbBar } from '../views/breadcrumbView';
import { pushBreadcrumb, resetBreadcrumbToDomain } from './breadcrumb';
import { SAMPLE_CERTIFICATE_RECORDS } from './searchControls';
import { INITIAL_ORGANIZACIONES } from './activeCertificates';
import { INITIAL_CERTIFICADOS_DETAILED, createEmptyCertificadoFormDraft } from './multisiteSampling';
import { INITIAL_AUDITORES_DETAILED } from './competencyMatrix';
import { INITIAL_PROGRAMACION_AUDITS, INITIAL_PHASE5_FINDINGS } from './auditExecution';
import {
  INITIAL_ESTATUS_CATALOG,
  INITIAL_NORMAS,
  INITIAL_ORGANISMOS,
  INITIAL_REQUISITOS_LTREE,
  INITIAL_SECTORES_IAF,
  INITIAL_SUBSECTORES_IAF,
} from './extraDomain';
import { buildInitialAcreditacionEntities } from './acreditacionDomain';
import { resolveSitioDetailById } from './sitioDomain';
import { resolveProcesoDetailById } from './procesoDomain';
import { resolveTurnoDetailById } from './turnoDomain';
import type { UserProfile } from './healthCheck';

const ADMIN_PROFILE: UserProfile = {
  id: '11111111-1111-1111-1111-111111111111',
  nombre: 'Administrador Principal',
  role: 'ADMIN',
  status: 'APPROVED',
};

const WORKER_PROFILE: UserProfile = {
  id: '22222222-2222-2222-2222-222222222222',
  nombre: 'Personal Técnico Certificación',
  role: 'WORKER',
  status: 'APPROVED',
};

const CERT_SUMMARIES = SAMPLE_CERTIFICATE_RECORDS.map((c) => ({
  id: c.id,
  numero_certificado: c.numero_certificado,
  id_organizacion: c.organizacion_id,
  organizacion_id: c.organizacion_id,
  organizacion_nombre: c.organizacion_nombre,
  norma: c.norma,
  esquema: c.esquema,
  estatus: c.estatus,
  sector_iaf: c.sector_iaf,
  multisitio: c.multisitio,
  sitios_count: c.sitios_count,
  fecha_emision: c.fecha_emision,
  fecha_vencimiento: c.fecha_vencimiento,
  cobertura_porcentaje: c.cobertura_porcentaje,
}));

function assertClean(label: string, html: string): void {
  const check = assertZeroUuidExposure(html);
  assert.equal(
    check.compliant,
    true,
    `${label} exposed raw UUID(s): ${check.exposedUuids.join(', ')}`
  );
}

test('Phase 6.2 Zero-UUID audit across Header, Dashboard, Approvals, and Audit Log Modal', () => {
  assertClean(
    'Header',
    renderHeader({
      profile: ADMIN_PROFILE,
      email: 'admin@fondonorma.test',
      isAdmin: true,
      canViewApprovals: true,
      activeRoute: 'dashboard',
      activeSubSection: null,
      pendingCount: 2,
      openMenu: 'certificacion',
    })
  );

  assertClean(
    'Dashboard',
    renderDashboardView(ADMIN_PROFILE, 'admin@fondonorma.test', {
      organizacionesActivas: 3,
      certificadosVigentes: 3,
      auditoriasProgramadas: 6,
      acreditacionesActivas: 4,
      hallazgosAbiertos: 3,
    })
  );

  assertClean(
    'Profile',
    renderProfileView({
      profile: {
        ...ADMIN_PROFILE,
        created_at: '2026-11-01T10:00:00Z',
      },
      userEmail: 'admin@fondonorma.test',
      formState: {
        nombreInput: ADMIN_PROFILE.nombre,
        savingProfile: false,
        profileFeedback: null,
        profileError: null,
        passwordSectionOpen: true,
        newPasswordInput: '',
        confirmPasswordInput: '',
        savingPassword: false,
        passwordFeedback: null,
        passwordError: null,
      },
      clientAccessItems: [
        {
          id_organizacion: INITIAL_ORGANIZACIONES[0].id,
          organizacion_nombre: INITIAL_ORGANIZACIONES[0].nombre,
          rif: INITIAL_ORGANIZACIONES[0].rif,
          estado: 'APPROVED',
          fecha_solicitud: '2026-11-01T10:00:00Z',
        },
      ],
      auditorsDetailed: INITIAL_AUDITORES_DETAILED,
    })
  );

  assertClean(
    'Approvals',
    renderApprovalsView({
      profiles: [ADMIN_PROFILE, WORKER_PROFILE],
      filter: 'ALL',
      loading: false,
      updatingId: null,
      errorMessage: null,
      successMessage: null,
      currentAdminId: ADMIN_PROFILE.id,
    })
  );

  assertClean(
    'AuditLogModal',
    renderAuditLogModal({
      isOpen: true,
      entityName: 'Iberometal Componentes S.A.',
      tableName: 'organizacion',
      recordId: INITIAL_ORGANIZACIONES[0].id,
      loading: false,
      entries: [
        {
          id: 1,
          table_name: 'organizacion',
          record_id: INITIAL_ORGANIZACIONES[0].id,
          operation: 'UPDATE',
          performed_by: ADMIN_PROFILE.id,
          performed_at: '2026-11-12T10:00:00Z',
          old_data: {
            nombre: 'Iberometal S.A.',
            id_sector_iaf: 'Sector IAF 17',
          },
          new_data: {
            nombre: 'Iberometal Componentes S.A.',
            id_sector_iaf: 'Sector IAF 17',
            referencia_extra: '99999999-9999-9999-9999-999999999999',
          },
        },
      ],
    })
  );
});

test('Phase 6.2 Zero-UUID audit across Certificación domain (Organización, Certificado, Auditor, Sitio, Proceso, Turno)', () => {
  const org = INITIAL_ORGANIZACIONES[0];
  const cert = INITIAL_CERTIFICADOS_DETAILED[0];
  const aud = INITIAL_AUDITORES_DETAILED[0];

  assertClean(
    'Organizacion Add Mode',
    renderOrganizacionView({
      profile: ADMIN_PROFILE,
      state: {
        selectedOrganizacionId: null,
        query: '',
        hasActiveCertificates: 'ALL',
        selectedSectorIaf: 'ALL',
        viewMode: 'grid',
        sortColumn: null,
        sortDirection: 'none',
        isEditingAttributes: false,
        activeChildTab: 'certificados',
        isCreating: true,
      },
      organizaciones: INITIAL_ORGANIZACIONES,
      certificados: CERT_SUMMARIES,
      loading: false,
    })
  );

  assertClean(
    'Organizacion Edit Form',
    renderOrganizacionView({
      profile: ADMIN_PROFILE,
      state: {
        selectedOrganizacionId: org.id,
        query: '',
        hasActiveCertificates: 'ALL',
        selectedSectorIaf: 'ALL',
        viewMode: 'grid',
        sortColumn: null,
        sortDirection: 'none',
        isEditingAttributes: true,
        activeChildTab: 'accesos',
      },
      organizaciones: INITIAL_ORGANIZACIONES,
      certificados: CERT_SUMMARIES,
      loading: false,
    })
  );

  const clientProfile: UserProfile = {
    id: '44444444-4444-4444-4444-444444444444',
    nombre: 'Cliente Portal',
    role: 'CLIENT',
    status: 'APPROVED',
  };
  const accessSample = {
    id: '55555555-5555-5555-5555-555555555555',
    id_usuario: clientProfile.id,
    usuario_nombre: clientProfile.nombre,
    usuario_role: 'CLIENT',
    id_organizacion: org.id,
    organizacion_nombre: org.nombre,
    organizacion_rif: org.rif,
    estado: 'REJECTED' as const,
    aprobado_por: ADMIN_PROFILE.id,
    aprobado_por_nombre: ADMIN_PROFILE.nombre,
    fecha_solicitud: '2026-11-10T09:00:00Z',
    fecha_respuesta: '2026-11-10T10:00:00Z',
    motivo_rechazo: 'Documentación pendiente de validación fiscal',
    deleted_at: null,
  };

  assertClean(
    'ClientAccess Add Mode',
    renderClientAccessView({
      profile: ADMIN_PROFILE,
      state: {
        selectedAccessId: null,
        prefillOrganizacionId: org.id,
        isCreating: true,
      },
      accesses: [accessSample],
      organizaciones: INITIAL_ORGANIZACIONES,
      profiles: [ADMIN_PROFILE, clientProfile],
    })
  );

  assertClean(
    'ClientAccess Read Mode',
    renderClientAccessView({
      profile: ADMIN_PROFILE,
      state: { selectedAccessId: accessSample.id },
      accesses: [accessSample],
      organizaciones: INITIAL_ORGANIZACIONES,
      profiles: [ADMIN_PROFILE, clientProfile],
    })
  );

  assertClean(
    'Certificado Add Mode',
    renderCertificadoView({
      profile: ADMIN_PROFILE,
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
        formDraft: {
          ...createEmptyCertificadoFormDraft(),
          id_sector_iaf: INITIAL_SECTORES_IAF[0].id,
        },
      },
      certificates: INITIAL_CERTIFICADOS_DETAILED,
      organizaciones: INITIAL_ORGANIZACIONES,
      normas: INITIAL_NORMAS,
      estatusList: INITIAL_ESTATUS_CATALOG,
      sectores: INITIAL_SECTORES_IAF,
      subsectores: INITIAL_SUBSECTORES_IAF,
      loading: false,
    })
  );

  assertClean(
    'Certificado Read Mode',
    renderCertificadoView({
      profile: ADMIN_PROFILE,
      state: {
        selectedCertId: cert.id,
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
      normas: INITIAL_NORMAS,
      estatusList: INITIAL_ESTATUS_CATALOG,
      sectores: INITIAL_SECTORES_IAF,
      subsectores: INITIAL_SUBSECTORES_IAF,
      loading: false,
    })
  );

  assertClean(
    'Certificado Edit Mode',
    renderCertificadoView({
      profile: ADMIN_PROFILE,
      state: {
        selectedCertId: cert.id,
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
      normas: INITIAL_NORMAS,
      estatusList: INITIAL_ESTATUS_CATALOG,
      sectores: INITIAL_SECTORES_IAF,
      subsectores: INITIAL_SUBSECTORES_IAF,
      loading: false,
    })
  );

  assertClean(
    'Auditor Add Mode',
    renderAuditorView({
      profile: ADMIN_PROFILE,
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
        isCreating: true,
      },
      auditors: INITIAL_AUDITORES_DETAILED,
      loading: false,
    })
  );

  assertClean(
    'Auditor Edit Form',
    renderAuditorView({
      profile: ADMIN_PROFILE,
      state: {
        selectedAuditorId: aud.id,
        activeChildTab: 'competencias',
        query: '',
        selectedCalificacion: 'ALL',
        selectedStandard: 'ALL',
        selectedSectorIaf: 'ALL',
        viewMode: 'grid',
        sortColumn: null,
        sortDirection: 'none',
        isEditingAttributes: true,
      },
      auditors: INITIAL_AUDITORES_DETAILED,
      normas: INITIAL_NORMAS,
      sectores: INITIAL_SECTORES_IAF,
      subsectores: INITIAL_SUBSECTORES_IAF,
      loading: false,
    })
  );

  assertClean(
    'CompetenciaAuditor Add Mode',
    renderCompetenciaAuditorView({
      profile: ADMIN_PROFILE,
      state: {
        isOpen: true,
        mode: 'add',
        prefillAuditorId: aud.id,
        formDraft: {
          id_auditor: aud.id,
          tipo: 'subsector_iaf',
          id_norma: '',
          id_sector_iaf: INITIAL_SECTORES_IAF[0].id,
          id_subsector_iaf: INITIAL_SUBSECTORES_IAF[0].id,
        },
      },
      auditors: INITIAL_AUDITORES_DETAILED,
      normas: INITIAL_NORMAS,
      sectores: INITIAL_SECTORES_IAF,
      subsectores: INITIAL_SUBSECTORES_IAF,
    })
  );

  assertClean(
    'CompetenciaAuditor Read Mode',
    renderCompetenciaAuditorView({
      profile: ADMIN_PROFILE,
      state: {
        isOpen: true,
        mode: 'read',
        selectedComp: {
          id_auditor: aud.id,
          tipo: 'subsector_iaf',
          targetId: INITIAL_SUBSECTORES_IAF[0].id,
        },
        confirmUnlink: true,
      },
      auditors: INITIAL_AUDITORES_DETAILED,
      normas: INITIAL_NORMAS,
      sectores: INITIAL_SECTORES_IAF,
      subsectores: INITIAL_SUBSECTORES_IAF,
    })
  );

  const resolvedProceso = resolveProcesoDetailById({
    procesoId: cert.procesos[0].id,
    certificates: INITIAL_CERTIFICADOS_DETAILED,
    programacionAudits: INITIAL_PROGRAMACION_AUDITS,
    phase5Findings: INITIAL_PHASE5_FINDINGS,
  });
  assert.ok(resolvedProceso);

  assertClean(
    'Proceso Edit + LTREE Assign Selector',
    renderProcesoView({
      profile: ADMIN_PROFILE,
      state: {
        selectedProcesoId: resolvedProceso.id,
        activeChildTab: 'requisitos',
        isEditingAttributes: true,
        isAssigningRequisito: true,
      },
      proceso: resolvedProceso,
    })
  );

  const resolvedTurno = resolveTurnoDetailById({
    turnoId: cert.turnos[0].id,
    originatingSitioId: cert.sitios[0].id,
    certificates: INITIAL_CERTIFICADOS_DETAILED,
    programacionAudits: INITIAL_PROGRAMACION_AUDITS,
  });
  assert.ok(resolvedTurno);

  const resolvedSitio = resolveSitioDetailById({
    sitioId: cert.sitios[0].id,
    certificates: INITIAL_CERTIFICADOS_DETAILED,
    programacionAudits: INITIAL_PROGRAMACION_AUDITS,
  });
  assert.ok(resolvedSitio);

  assertClean(
    'Sitio Edit Form',
    renderSitioView({
      profile: ADMIN_PROFILE,
      state: {
        selectedSitioId: resolvedSitio.id,
        activeChildTab: 'turnos',
        isEditingAttributes: true,
        isAssigningShift: true,
      },
      sitio: resolvedSitio,
      siblingSites: cert.sitios.map((s) => ({
        id: s.id,
        id_certificado: cert.id,
        numero_sitio: s.numero_sitio,
      })),
    })
  );

  assertClean(
    'Turno Edit Form',
    renderTurnoView({
      profile: ADMIN_PROFILE,
      state: {
        selectedTurnoId: resolvedTurno.id,
        originatingSitioId: cert.sitios[0].id,
        activeChildTab: 'sitios',
        isEditingAttributes: true,
      },
      turno: resolvedTurno,
    })
  );
});

test('Phase 6.2 Zero-UUID audit across Auditorías domain modals (Programación, Calendario, Resultado)', () => {
  const audit = INITIAL_PROGRAMACION_AUDITS[0];
  const finding = INITIAL_PHASE5_FINDINGS[0];

  assertClean(
    'Programacion New Program Creation Handoff (Paso 1)',
    renderProgramacionView({
      profile: ADMIN_PROFILE,
      state: {
        selectedAuditId: null,
        selectedProgramId: null,
        isCreating: true,
        prefillCertId: SAMPLE_CERTIFICATE_RECORDS[0]?.id ?? null,
        activeChildTab: 'equipo',
        query: '',
        selectedTipo: 'ALL',
        selectedMetodologia: 'ALL',
        selectedEstatus: 'ALL',
        selectedAuditorLider: 'ALL',
        viewMode: 'grid',
        sortColumn: null,
        sortDirection: 'none',
        isEditingAttributes: false,
        isAddingTeamMember: false,
      },
      audits: INITIAL_PROGRAMACION_AUDITS,
      auditors: INITIAL_AUDITORES_DETAILED,
      certificates: SAMPLE_CERTIFICATE_RECORDS,
      loading: false,
    })
  );

  assertClean(
    'Programacion Unprogrammed Certificates SubView',
    renderProgramacionView({
      profile: ADMIN_PROFILE,
      state: {
        selectedAuditId: null,
        selectedProgramId: null,
        isCreating: false,
        subView: 'pendientes',
        unprogrammedStatusFilter: 'Activo',
        activeChildTab: 'equipo',
        query: '',
        selectedTipo: 'ALL',
        selectedMetodologia: 'ALL',
        selectedEstatus: 'ALL',
        selectedAuditorLider: 'ALL',
        viewMode: 'list',
        sortColumn: null,
        sortDirection: 'none',
        isEditingAttributes: false,
        isAddingTeamMember: false,
      },
      audits: INITIAL_PROGRAMACION_AUDITS,
      auditors: INITIAL_AUDITORES_DETAILED,
      certificates: SAMPLE_CERTIFICATE_RECORDS,
      allCertificadosDetailed: INITIAL_CERTIFICADOS_DETAILED,
      loading: false,
    })
  );

  assertClean(
    'Programacion Program Detail Edit Mode (Step 3.2.1)',
    renderProgramacionView({
      profile: ADMIN_PROFILE,
      state: {
        selectedAuditId: audit.id,
        selectedProgramId: '10000000-0000-0000-0000-000000000901',
        isCreating: false,
        activeStep: 1,
        activeChildTab: 'equipo',
        query: '',
        selectedTipo: 'ALL',
        selectedMetodologia: 'ALL',
        selectedEstatus: 'ALL',
        selectedAuditorLider: 'ALL',
        viewMode: 'grid',
        sortColumn: null,
        sortDirection: 'none',
        isEditingAttributes: true,
        isAddingTeamMember: false,
      },
      audits: INITIAL_PROGRAMACION_AUDITS,
      auditors: INITIAL_AUDITORES_DETAILED,
      certificates: SAMPLE_CERTIFICATE_RECORDS,
      programs: [
        {
          id: '10000000-0000-0000-0000-000000000901',
          codigo_programa: 'PROG-2026-001',
          etiqueta: 'Programa Planta Principal',
          nivel_vinculacion: 'INDIVIDUAL',
          tipo_vinculacion: 'Individual',
          es_vinculada: false,
          id_ciclo_origen: null,
          notas: null,
          deleted_at: null,
          auditorias: [audit],
        },
      ],
      allCertificadosDetailed: INITIAL_CERTIFICADOS_DETAILED,
      organizaciones: INITIAL_ORGANIZACIONES,
      loading: false,
    })
  );

  const step322SecondAudit = INITIAL_PROGRAMACION_AUDITS[1] || audit;
  const step322SiteId =
    audit.sitiosPlan?.[0]?.id ||
    audit.sitiosMuestreo[0]?.id ||
    '70000000-0000-0000-0000-000000000322';
  const step322Program = {
    id: '10000000-0000-0000-0000-000000000902',
    codigo_programa: 'PROG-2026-322',
    etiqueta: 'Campaña Integrada Paso 2',
    nivel_vinculacion: 'NIVEL_1_INTRA_ORG' as const,
    tipo_vinculacion: 'Integrada' as const,
    es_vinculada: true,
    id_ciclo_origen: null,
    notas: 'Notas Paso 2 sin UUIDs',
    deleted_at: null,
    auditorias: [
      {
        ...audit,
        comentarios: [
          {
            id: '88000000-0000-0000-0000-000000000001',
            id_auditoria: audit.id,
            id_auditor: audit.equipo[0]?.id_auditor || null,
            autor_nombre: 'Administrador Principal',
            comentario: 'Confirmación logística de auditoría in situ.',
            created_at: '2026-05-01T10:00:00Z',
            deleted_at: null,
          },
        ],
      },
      step322SecondAudit,
    ],
  };

  for (const childTab of ['planificacion', 'equipo_resumen', 'hallazgos'] as const) {
    assertClean(
      `Programacion Paso 2 Zone 3 (${childTab})`,
      renderProgramacionView({
        profile: ADMIN_PROFILE,
        state: {
          selectedAuditId: audit.id,
          selectedProgramId: step322Program.id,
          isCreating: false,
          activeStep: 2,
          activeChildTab: childTab,
          isAddingAuditDate: true,
          query: '',
          selectedTipo: 'ALL',
          selectedMetodologia: 'ALL',
          selectedEstatus: 'ALL',
          selectedAuditorLider: 'ALL',
          viewMode: 'grid',
          sortColumn: null,
          sortDirection: 'none',
          isEditingAttributes: false,
          isAddingTeamMember: false,
        },
        audits: INITIAL_PROGRAMACION_AUDITS,
        auditors: INITIAL_AUDITORES_DETAILED,
        certificates: SAMPLE_CERTIFICATE_RECORDS,
        findings: INITIAL_PHASE5_FINDINGS,
        programs: [step322Program],
        allCertificadosDetailed: INITIAL_CERTIFICADOS_DETAILED,
        organizaciones: INITIAL_ORGANIZACIONES,
        loading: false,
      })
    );
  }

  for (const sitioTab of ['procesos', 'equipo', 'hallazgos'] as const) {
    assertClean(
      `SitioAuditoria Detail View (${sitioTab})`,
      renderProgramacionView({
        profile: ADMIN_PROFILE,
        state: {
          selectedAuditId: audit.id,
          selectedProgramId: step322Program.id,
          selectedSitioAuditoriaId: step322SiteId,
          selectedSitioAuditoriaTab: sitioTab,
          isCreating: false,
          activeStep: 2,
          activeChildTab: 'planificacion',
          query: '',
          selectedTipo: 'ALL',
          selectedMetodologia: 'ALL',
          selectedEstatus: 'ALL',
          selectedAuditorLider: 'ALL',
          viewMode: 'grid',
          sortColumn: null,
          sortDirection: 'none',
          isEditingAttributes: false,
          isAddingTeamMember: false,
        },
        audits: INITIAL_PROGRAMACION_AUDITS,
        auditors: INITIAL_AUDITORES_DETAILED,
        certificates: SAMPLE_CERTIFICATE_RECORDS,
        findings: INITIAL_PHASE5_FINDINGS,
        programs: [step322Program],
        allCertificadosDetailed: INITIAL_CERTIFICADOS_DETAILED,
        organizaciones: INITIAL_ORGANIZACIONES,
        loading: false,
      })
    );
  }

  assertClean(
    'Programacion Detail Edit Form + Team Modal',
    renderProgramacionView({
      profile: ADMIN_PROFILE,
      state: {
        selectedAuditId: audit.id,
        selectedProgramId: null,
        isCreating: false,
        activeChildTab: 'equipo',
        query: '',
        selectedTipo: 'ALL',
        selectedMetodologia: 'ALL',
        selectedEstatus: 'ALL',
        selectedAuditorLider: 'ALL',
        viewMode: 'grid',
        sortColumn: null,
        sortDirection: 'none',
        isEditingAttributes: true,
        isAddingTeamMember: true,
      },
      audits: INITIAL_PROGRAMACION_AUDITS,
      auditors: INITIAL_AUDITORES_DETAILED,
      certificates: SAMPLE_CERTIFICATE_RECORDS,
      loading: false,
    })
  );

  assertClean(
    'Calendario + Slide-Over Drawer',
    renderCalendarioView({
      profile: ADMIN_PROFILE,
      state: {
        displayMode: 'mes',
        referenceYear: 2024,
        referenceMonth: 11,
        filterAuditorId: 'ALL',
        filterStandard: 'ALL',
        filterMethodology: 'ALL',
        drawerAuditId: audit.id,
      },
      audits: INITIAL_PROGRAMACION_AUDITS,
      auditors: INITIAL_AUDITORES_DETAILED,
      standards: INITIAL_NORMAS.map((n) => ({ norma: n.norma })),
    })
  );

  assertClean(
    'Resultado + New Finding + Finding Lifecycle Modal',
    renderResultadoView({
      profile: ADMIN_PROFILE,
      state: {
        selectedAuditId: 'ALL',
        activeAuditIdForDecision: audit.id,
        displayMode: 'list',
        filterType: 'ALL',
        filterLifecycle: 'ALL',
        searchQuery: '',
        isLoggingFinding: true,
        inspectingFindingId: finding.id,
      },
      audits: INITIAL_PROGRAMACION_AUDITS,
      findings: INITIAL_PHASE5_FINDINGS,
      processes: [{ id: '60000000-0000-0000-0000-000000000001', nombre_proceso: 'Troquelado y Fundición' }],
      requirements: INITIAL_REQUISITOS_LTREE.map((r) => ({
        id: r.id,
        codigo: r.codigo,
        norma: r.norma_codigo,
      })),
    })
  );
});

test('Phase 6.2 Zero-UUID audit across Extra domain views and DetailTemplate', () => {
  assertClean(
    'Extra Norma Create View',
    renderExtraView(ADMIN_PROFILE, {
      activeSubSection: 'standards',
      standards: INITIAL_NORMAS,
      requirements: INITIAL_REQUISITOS_LTREE.map((r) => ({
        id: r.id,
        id_norma: r.id_norma,
        id_requisito_padre: r.id_requisito_padre,
        codigo: r.codigo,
        ruta_materializada: r.ruta_materializada,
        norma: r.norma_codigo,
      })),
      requirementsCatalog: INITIAL_REQUISITOS_LTREE,
      iafSectors: INITIAL_SECTORES_IAF,
      catalogs: [],
      loading: false,
      normaState: {
        selectedNormaId: null,
        isCreating: true,
      },
    })
  );

  assertClean(
    'Extra Requisito LTREE Create View',
    renderExtraView(ADMIN_PROFILE, {
      activeSubSection: 'standards',
      standards: INITIAL_NORMAS,
      requirements: [],
      requirementsCatalog: INITIAL_REQUISITOS_LTREE,
      iafSectors: INITIAL_SECTORES_IAF,
      catalogs: [],
      loading: false,
      requisitoState: {
        selectedRequisitoId: null,
        prefillNormaId: INITIAL_NORMAS[0].id,
        isCreating: true,
      },
    })
  );

  assertClean(
    'Extra Sector IAF Create View',
    renderExtraView(ADMIN_PROFILE, {
      activeSubSection: 'iaf',
      standards: INITIAL_NORMAS,
      requirements: [],
      iafSectors: INITIAL_SECTORES_IAF,
      catalogs: [],
      loading: false,
      iafState: {
        selectedSectorId: null,
        isCreating: true,
      },
      subsectores: INITIAL_SUBSECTORES_IAF,
    })
  );

  assertClean(
    'Extra Sub-Sector IAF Create View',
    renderExtraView(ADMIN_PROFILE, {
      activeSubSection: 'iaf',
      standards: INITIAL_NORMAS,
      requirements: [],
      iafSectors: INITIAL_SECTORES_IAF,
      catalogs: [],
      loading: false,
      subsectorState: {
        selectedSubsectorId: null,
        prefillSectorId: INITIAL_SECTORES_IAF[0].id,
        isCreating: true,
      },
      subsectores: INITIAL_SUBSECTORES_IAF,
    })
  );

  assertClean(
    'Extra Sub-Sector IAF Detail View',
    renderExtraView(ADMIN_PROFILE, {
      activeSubSection: 'iaf',
      standards: INITIAL_NORMAS,
      requirements: [],
      iafSectors: INITIAL_SECTORES_IAF,
      catalogs: [],
      loading: false,
      subsectorState: {
        selectedSubsectorId: INITIAL_SUBSECTORES_IAF[0].id,
      },
      subsectores: INITIAL_SUBSECTORES_IAF,
      certificates: INITIAL_CERTIFICADOS_DETAILED,
      auditors: INITIAL_AUDITORES_DETAILED,
    })
  );

  const acreditaciones = buildInitialAcreditacionEntities(INITIAL_CERTIFICADOS_DETAILED);
  const acredDirHtml = renderAcreditacionView({
    profile: ADMIN_PROFILE,
    state: {
      selectedAccreditationId: null,
      query: 'ENAC',
      viewMode: 'grid',
      sortColumn: null,
      sortDirection: 'none',
      isCreating: true,
    },
    acreditaciones,
    organismos: INITIAL_ORGANISMOS,
    normas: INITIAL_NORMAS,
    sectores: INITIAL_SECTORES_IAF,
    certificates: INITIAL_CERTIFICADOS_DETAILED,
  });
  assertClean('Acreditacion Directory + Create Mode', acredDirHtml);
  assert.equal(/type=["']search["']/i.test(acredDirHtml), false);
  assert.ok(acredDirHtml.includes('type="text"'));

  assertClean(
    'ArchiveModal',
    renderArchiveModal({
      isOpen: true,
      tableName: 'certificado',
      recordId: INITIAL_CERTIFICADOS_DETAILED[0].id,
      entityTypeLabel: 'Certificado',
      recordTitle: INITIAL_CERTIFICADOS_DETAILED[0].numero_certificado,
      recordSubtitle: INITIAL_CERTIFICADOS_DETAILED[0].organizacion_nombre,
      loadingSummary: false,
      summary: {
        can_archive: false,
        total_active_dependencies: 2,
        dependencies: [{ table: 'sitio', label: 'Sitios operativos', count: 2 }],
      },
      reason: '',
      submitting: false,
      errorMessage: null,
    })
  );

  assertClean(
    'DetailTemplate',
    renderDetailPageTemplate({
      entityType: 'Certificado',
      entitySymbol: '📜',
      title: 'FN-QMS-2024-001',
      backButton: { label: 'Volver', nav: 'certificacion', subview: 'certificates' },
      parents: [
        {
          label: 'Organización',
          value: 'Iberometal Componentes S.A.',
          symbol: '🏢',
          navAction: {
            nav: 'certificacion',
            subview: 'organizations',
            entityType: 'org',
            entityId: INITIAL_ORGANIZACIONES[0].id,
          },
        },
      ],
      tableName: 'certificado',
      recordId: INITIAL_CERTIFICADOS_DETAILED[0].id,
      attributes: [{ label: 'Norma', value: 'ISO 9001:2015' }],
    })
  );

  const trail = pushBreadcrumb(resetBreadcrumbToDomain('certificacion', 'organizations'), {
    id: `org-${INITIAL_ORGANIZACIONES[0].id}`,
    label: INITIAL_ORGANIZACIONES[0].nombre,
    route: 'certificacion',
    subview: 'organizations',
    entityId: INITIAL_ORGANIZACIONES[0].id,
    tooltip: `Organización > ${INITIAL_ORGANIZACIONES[0].nombre}`,
  });
  const breadcrumbHtml = renderBreadcrumbBar({ trail });
  assertClean('BreadcrumbBar', breadcrumbHtml);
  assert.ok(breadcrumbHtml.includes('Iberometal Componentes…'));
  assert.ok(breadcrumbHtml.includes('Iberometal Componentes S.A.'));
});

test('Step Final Audit: Clean List compliance & strict isApprovedStaffProfile RBAC across Extra and Certificación', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { isApprovedStaffProfile } = await import('./rbac');

  // 1. Strict RBAC matrix check
  assert.equal(isApprovedStaffProfile(ADMIN_PROFILE), true);
  assert.equal(isApprovedStaffProfile(WORKER_PROFILE), true);
  assert.equal(
    isApprovedStaffProfile({ ...WORKER_PROFILE, status: 'PENDING' }),
    false
  );
  assert.equal(
    isApprovedStaffProfile({ ...WORKER_PROFILE, status: 'REJECTED' }),
    false
  );
  assert.equal(
    isApprovedStaffProfile({ ...ADMIN_PROFILE, role: 'AUDITOR', status: 'APPROVED' }),
    false
  );
  assert.equal(
    isApprovedStaffProfile({ ...ADMIN_PROFILE, role: 'CLIENT', status: 'APPROVED' }),
    false
  );

  // 2. Render Multi Views for Extra and Certificación in list mode and check 100% colgroup, zero acciones, zero <button> in <tbody>
  const multiViews = [
    {
      label: 'Organizaciones',
      html: renderOrganizacionView({
        profile: ADMIN_PROFILE,
        state: {
          selectedOrganizacionId: null,
          query: '',
          hasActiveCertificates: 'ALL',
          selectedSectorIaf: 'ALL',
          viewMode: 'list',
          sortColumn: null,
          sortDirection: 'none',
          isEditingAttributes: false,
          activeChildTab: 'certificados',
        },
        organizaciones: INITIAL_ORGANIZACIONES,
        certificados: CERT_SUMMARIES,
      }),
    },
    {
      label: 'Certificados',
      html: renderCertificadoView({
        profile: ADMIN_PROFILE,
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
        organizaciones: INITIAL_ORGANIZACIONES,
      }),
    },
    {
      label: 'Auditores',
      html: renderAuditorView({
        profile: ADMIN_PROFILE,
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
        },
        auditors: INITIAL_AUDITORES_DETAILED,
      }),
    },
    {
      label: 'Normas',
      html: renderExtraView(ADMIN_PROFILE, {
        activeSubSection: 'standards',
        standards: INITIAL_NORMAS,
        requirements: [],
        requirementsCatalog: INITIAL_REQUISITOS_LTREE,
        iafSectors: INITIAL_SECTORES_IAF,
        catalogs: [],
        loading: false,
        normaState: { selectedNormaId: null, viewMode: 'list' },
      }),
    },
    {
      label: 'Sectores IAF',
      html: renderExtraView(ADMIN_PROFILE, {
        activeSubSection: 'iaf',
        standards: INITIAL_NORMAS,
        requirements: [],
        iafSectors: INITIAL_SECTORES_IAF,
        subsectores: INITIAL_SUBSECTORES_IAF,
        catalogs: [],
        loading: false,
        iafState: { selectedSectorId: null, viewMode: 'list' },
      }),
    },
    {
      label: 'Organismos Acreditación',
      html: renderExtraView(ADMIN_PROFILE, {
        activeSubSection: 'organismos',
        standards: INITIAL_NORMAS,
        requirements: [],
        iafSectors: INITIAL_SECTORES_IAF,
        organismos: INITIAL_ORGANISMOS,
        catalogs: [],
        loading: false,
        organismoState: { selectedOrganismoId: null, viewMode: 'list' },
      }),
    },
    {
      label: 'Acreditaciones',
      html: renderExtraView(ADMIN_PROFILE, {
        activeSubSection: 'accreditations',
        standards: INITIAL_NORMAS,
        requirements: [],
        iafSectors: INITIAL_SECTORES_IAF,
        organismos: INITIAL_ORGANISMOS,
        catalogs: [],
        loading: false,
        acreditacionState: { selectedAccreditationId: null, viewMode: 'list' },
      }),
    },
  ];

  for (const mv of multiViews) {
    assert.ok(mv.html.includes('table-fixed'), `${mv.label} must use table-fixed`);
    assert.equal(mv.html.includes('data-col-header="acciones"'), false, `${mv.label} must not render acciones column`);
    const colgroup = mv.html.match(/<colgroup>([\s\S]*?)<\/colgroup>/i);
    assert.ok(colgroup, `${mv.label} missing <colgroup>`);
    const sum = [...colgroup[1].matchAll(/width:\s*([0-9.]+)%/g)]
      .map((m) => Number(m[1]))
      .reduce((a, b) => a + b, 0);
    assert.equal(sum, 100, `${mv.label} colgroup widths must sum to 100% (got ${sum})`);
    const tbody = (mv.html.match(/<tbody[\s\S]*?<\/tbody>/gi) || []).join('\n');
    assert.equal(tbody.includes('<button'), false, `${mv.label} <tbody> must not contain <button>`);
  }

  // 3. Static source audit across Extra & Certificación views: zero inline success message props or obsolete modal IDs
  const auditedViewFiles = [
    'organizacionView.ts',
    'clientAccessView.ts',
    'certificadoView.ts',
    'auditorView.ts',
    'competenciaAuditorView.ts',
    'sitioView.ts',
    'procesoView.ts',
    'turnoView.ts',
    'noAplicableView.ts',
    'fechaView.ts',
    'contactoView.ts',
    'telefonoView.ts',
    'emailView.ts',
    'normaView.ts',
    'requisitoView.ts',
    'sectorIafView.ts',
    'subsectorIafView.ts',
    'organismoAcreditacionView.ts',
    'acreditacionView.ts',
    'estatusView.ts',
    'tipoAuditoriaView.ts',
    'metodologiaAuditoriaView.ts',
  ];

  const forbiddenTokens = [
    'saveSuccessMessage',
    'createSuccessMessage',
    'shiftActionMessage',
    'requisitoActionMessage',
    'clauseInspectionBackdrop',
    'newAccreditationBackdrop',
    'newSubsectorModalBackdrop',
    'createTelefonoContactoForm',
    'createEmailContactoForm',
    'renderCreateOrganizacionForm',
    'renderCreateAuditorForm',
    'renderCreateAcreditacionForm',
  ];

  for (const fileName of auditedViewFiles) {
    const content = fs.readFileSync(path.resolve(process.cwd(), 'src/views', fileName), 'utf8');
    for (const token of forbiddenTokens) {
      assert.equal(
        content.includes(token),
        false,
        `${fileName} still contains forbidden legacy token "${token}"`
      );
    }
  }
});
