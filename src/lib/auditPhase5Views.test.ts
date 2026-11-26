import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { assertZeroUuidExposure } from './zeroUuid.js';
import type { UserProfile } from './healthCheck.js';
import type { CertificateRecord } from './searchControls.js';
import {
  INITIAL_PROGRAMACION_AUDITS,
  INITIAL_PHASE5_FINDINGS,
  type ProgramacionViewState,
  type CalendarioViewState,
  type ResultadoViewState,
} from './auditExecution.js';
import { INITIAL_AUDITORES_DETAILED } from './competencyMatrix.js';
import { renderProgramacionView } from '../views/programacionView.js';
import { renderCalendarioView } from '../views/calendarioView.js';
import { renderResultadoView } from '../views/resultadoView.js';
import { renderAuditoriasView } from '../views/auditoriasView.js';

const mockProfile: UserProfile = {
  id: '11111111-1111-1111-1111-111111111111',
  nombre: 'Administrador Principal',
  role: 'ADMIN',
  status: 'APPROVED',
  created_at: '2024-01-01T00:00:00Z',
};

const mockCertificates: CertificateRecord[] = [
  {
    id: '40000000-0000-0000-0000-000000000001',
    numero_certificado: 'FN-QMS-2024-001',
    organizacion_id: '30000000-0000-0000-0000-000000000001',
    organizacion_nombre: 'Iberometal Componentes S.A.',
    nif_cuit: 'J-30192837-4',
    norma: 'ISO 9001:2015',
    sector_iaf: 17,
    estatus: 'ACTIVO',
    fecha_emision: '2024-01-15',
    fecha_vencimiento: '2027-01-14',
    direccion_fiscal: 'Av. Industrial 100, Valencia',
    cobertura_porcentaje: 92,
  },
];

const mockProcesses = [
  { id: '60000000-0000-0000-0000-000000000001', nombre_proceso: 'Troquelado y Fundición' },
  { id: '60000000-0000-0000-0000-000000000002', nombre_proceso: 'Dirección Estratégica y Calidad' },
];

const mockRequirements = [
  { id: 'f0000000-0000-0000-0000-000000000041', codigo: '4.1', norma: 'ISO 9001:2015' },
  { id: 'f0000000-0000-0000-0000-000000000085', codigo: '8.5', norma: 'ISO 9001:2015' },
];

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
  referenceYear: 2024,
  referenceMonth: 11,
  filterAuditorId: 'ALL',
  filterStandard: 'ALL',
  filterMethodology: 'ALL',
  drawerAuditId: null,
};

const baseResultadoState: ResultadoViewState = {
  selectedAuditId: 'ALL',
  activeAuditIdForDecision: INITIAL_PROGRAMACION_AUDITS[0].id,
  displayMode: 'list',
  filterType: 'ALL',
  filterLifecycle: 'ALL',
  searchQuery: '',
  isLoggingFinding: false,
  inspectingFindingId: null,
};

describe('Phase 5 - Programación de Auditorías (List, Grid & 4-Zone Detail)', () => {
  it('renders directory in grid view adhering to Zero-UUID mandate', () => {
    const html = renderProgramacionView({
      profile: mockProfile,
      state: { ...baseProgramacionState, viewMode: 'grid' },
      audits: INITIAL_PROGRAMACION_AUDITS,
      auditors: INITIAL_AUDITORES_DETAILED,
      certificates: mockCertificates,
    });
    assert.match(html, /Programación de Auditorías/);
    assert.match(html, /AUD-2024-001/);
    assert.match(html, /Iberometal Componentes S\.A\./);
    assert.match(html, /FN-QMS-2024-001/);

    const check = assertZeroUuidExposure(html);
    assert.equal(check.compliant, true, `Zero-UUID violations: ${check.exposedUuids.join(', ')}`);
  });

  it('renders directory in list view adhering to Zero-UUID mandate', () => {
    const html = renderProgramacionView({
      profile: mockProfile,
      state: { ...baseProgramacionState, viewMode: 'list' },
      audits: INITIAL_PROGRAMACION_AUDITS,
      auditors: INITIAL_AUDITORES_DETAILED,
      certificates: mockCertificates,
    });
    assert.match(html, /<table/);
    assert.match(html, /Código/);

    const check = assertZeroUuidExposure(html);
    assert.equal(check.compliant, true, `Zero-UUID violations: ${check.exposedUuids.join(', ')}`);
  });

  it('renders 4-Zone Detail View with child tabs (Equipo, Muestreo with Site 0, Matriz)', () => {
    const html = renderProgramacionView({
      profile: mockProfile,
      state: {
        ...baseProgramacionState,
        selectedAuditId: INITIAL_PROGRAMACION_AUDITS[0].id,
        activeChildTab: 'muestreo',
      },
      audits: INITIAL_PROGRAMACION_AUDITS,
      auditors: INITIAL_AUDITORES_DETAILED,
      certificates: mockCertificates,
    });
    assert.match(html, /Iberometal Componentes S\.A\./);
    assert.match(html, /FN-QMS-2024-001/);
    assert.match(html, /ISO 9001:2015/);
    assert.match(html, /Ing\. Carlos Mendoza/);
    assert.match(html, /3 día\(s\)-auditor/);
    assert.match(html, /Sede Principal HQ/);
    assert.match(html, /Sitio 0|#0/);

    const check = assertZeroUuidExposure(html);
    assert.equal(check.compliant, true, `Zero-UUID violations: ${check.exposedUuids.join(', ')}`);
  });
});

describe('Phase 5 - Calendario Operativo de Evaluaciones', () => {
  it('renders monthly grid view with month navigation and audit chips', () => {
    const html = renderCalendarioView({
      profile: mockProfile,
      state: { ...baseCalendarioState, displayMode: 'mes' },
      audits: INITIAL_PROGRAMACION_AUDITS,
      auditors: INITIAL_AUDITORES_DETAILED,
      standards: [{ norma: 'ISO 9001:2015' }],
    });
    assert.match(html, /Noviembre 2024/);
    assert.match(html, /Calendario Operativo/);
    assert.match(html, /AUD-2024-001/);

    const check = assertZeroUuidExposure(html);
    assert.equal(check.compliant, true, `Zero-UUID violations: ${check.exposedUuids.join(', ')}`);
  });

  it('renders timeline / Gantt view and slide-over event drawer', () => {
    const html = renderCalendarioView({
      profile: mockProfile,
      state: {
        ...baseCalendarioState,
        displayMode: 'timeline',
        drawerAuditId: INITIAL_PROGRAMACION_AUDITS[0].id,
      },
      audits: INITIAL_PROGRAMACION_AUDITS,
      auditors: INITIAL_AUDITORES_DETAILED,
      standards: [{ norma: 'ISO 9001:2015' }],
    });
    assert.match(html, /Línea de Tiempo por Auditor Líder/);
    assert.match(html, /Ver Resumen de Auditoría/);

    const check = assertZeroUuidExposure(html);
    assert.equal(check.compliant, true, `Zero-UUID violations: ${check.exposedUuids.join(', ')}`);
  });
});

describe('Step 8.1 - Resultado por Certificado, Fechas Reales y NCs por Cláusula', () => {
  it('renders certificate Multi View table and Plazos NC button without raw UUIDs', () => {
    const html = renderResultadoView({
      profile: mockProfile,
      state: {
        ...baseResultadoState,
        displayMode: 'list',
      },
      audits: INITIAL_PROGRAMACION_AUDITS,
      findings: INITIAL_PHASE5_FINDINGS,
      processes: mockProcesses,
      requirements: mockRequirements,
    });

    assert.match(html, /Resultado de Auditorías/);
    assert.match(html, /data-resizable-table="resultado-main"/);
    assert.match(html, /id="openNcOffsetsModalBtn"/);
    assert.match(html, /Plazos NC \(\+15d \/ \+45d\)/);

    const check = assertZeroUuidExposure(html);
    assert.equal(check.compliant, true, `Zero-UUID violations: ${check.exposedUuids.join(', ')}`);
  });

  it('renders Grid view of organizations and Pop-up Modal for Resultado', () => {
    const html = renderResultadoView({
      profile: mockProfile,
      state: {
        ...baseResultadoState,
        displayMode: 'kanban',
      },
      audits: INITIAL_PROGRAMACION_AUDITS,
      findings: INITIAL_PHASE5_FINDINGS,
      processes: mockProcesses,
      requirements: mockRequirements,
    });

    assert.match(html, /data-action="open-org-cert-picker"/);
    assert.match(html, /Con NCs Abiertas|Pendiente|Completo/);

    const modalHtml = renderResultadoView({
      profile: mockProfile,
      state: {
        ...baseResultadoState,
        displayMode: 'kanban',
        pickerOrgId: INITIAL_PROGRAMACION_AUDITS[0].id_organizacion,
      },
      audits: INITIAL_PROGRAMACION_AUDITS,
      findings: INITIAL_PHASE5_FINDINGS,
      processes: mockProcesses,
      requirements: mockRequirements,
    });
    assert.match(modalHtml, /data-action="select-org-picker-cert"/);

    const check = assertZeroUuidExposure(html);
    assert.equal(check.compliant, true, `Zero-UUID violations: ${check.exposedUuids.join(', ')}`);
  });

  it('renders Certificate Detail View with Bloque A (Fechas Reales) and Bloque B (NCs por Cláusula)', () => {
    const html = renderResultadoView({
      profile: mockProfile,
      state: {
        ...baseResultadoState,
        selectedCertId: INITIAL_PROGRAMACION_AUDITS[0].id_certificado,
        selectedResultAuditId: INITIAL_PROGRAMACION_AUDITS[0].id,
      },
      audits: INITIAL_PROGRAMACION_AUDITS,
      findings: INITIAL_PHASE5_FINDINGS,
      processes: mockProcesses,
      requirements: mockRequirements,
    });

    assert.match(html, /Bloque A · Fechas Reales Auditadas/);
    assert.match(html, /Bloque B · No Conformidades por Cláusula/);
    assert.match(html, /id="resultadoAddRealDateForm"/);
    assert.match(html, /id="resultadoNewNcForm"/);

    const check = assertZeroUuidExposure(html);
    assert.equal(check.compliant, true, `Zero-UUID violations: ${check.exposedUuids.join(', ')}`);
  });
});

describe('Phase 5 - Domain 1 Navigation Integration', () => {
  it('renders auditorias master view dispatching seamlessly across subviews', () => {
    const schedulingHtml = renderAuditoriasView(mockProfile, {
      activeSubSection: 'scheduling',
      programacionState: baseProgramacionState,
      calendarioState: baseCalendarioState,
      resultadoState: baseResultadoState,
      programacionAudits: INITIAL_PROGRAMACION_AUDITS,
      phase5Findings: INITIAL_PHASE5_FINDINGS,
      allAuditorsDetailed: INITIAL_AUDITORES_DETAILED,
      certificates: mockCertificates,
      processes: mockProcesses,
      requirements: mockRequirements,
      standards: [{ norma: 'ISO 9001:2015' }],
      loading: false,
    });
    assert.match(schedulingHtml, /data-mv-domain="relacion"/);

    const programaHtml = renderAuditoriasView(mockProfile, {
      activeSubSection: 'programa',
      programacionState: baseProgramacionState,
      calendarioState: baseCalendarioState,
      resultadoState: baseResultadoState,
      programacionAudits: INITIAL_PROGRAMACION_AUDITS,
      phase5Findings: INITIAL_PHASE5_FINDINGS,
      allAuditorsDetailed: INITIAL_AUDITORES_DETAILED,
      certificates: mockCertificates,
      processes: mockProcesses,
      requirements: mockRequirements,
      standards: [{ norma: 'ISO 9001:2015' }],
      loading: false,
    });
    assert.match(programaHtml, /4\. Proceso/);

    const turnoHtml = renderAuditoriasView(mockProfile, {
      activeSubSection: 'turno',
      programacionState: baseProgramacionState,
      calendarioState: baseCalendarioState,
      resultadoState: baseResultadoState,
      programacionAudits: INITIAL_PROGRAMACION_AUDITS,
      phase5Findings: INITIAL_PHASE5_FINDINGS,
      allAuditorsDetailed: INITIAL_AUDITORES_DETAILED,
      certificates: mockCertificates,
      processes: mockProcesses,
      requirements: mockRequirements,
      standards: [{ norma: 'ISO 9001:2015' }],
      loading: false,
    });
    assert.match(turnoHtml, /5\. Turno/);

    const calendarHtml = renderAuditoriasView(mockProfile, {
      activeSubSection: 'calendar',
      programacionState: baseProgramacionState,
      calendarioState: baseCalendarioState,
      resultadoState: baseResultadoState,
      programacionAudits: INITIAL_PROGRAMACION_AUDITS,
      phase5Findings: INITIAL_PHASE5_FINDINGS,
      allAuditorsDetailed: INITIAL_AUDITORES_DETAILED,
      certificates: mockCertificates,
      processes: mockProcesses,
      requirements: mockRequirements,
      standards: [{ norma: 'ISO 9001:2015' }],
      loading: false,
    });
    assert.match(calendarHtml, /Calendario Operativo/);

    const findingsHtml = renderAuditoriasView(mockProfile, {
      activeSubSection: 'findings',
      programacionState: baseProgramacionState,
      calendarioState: baseCalendarioState,
      resultadoState: baseResultadoState,
      programacionAudits: INITIAL_PROGRAMACION_AUDITS,
      phase5Findings: INITIAL_PHASE5_FINDINGS,
      allAuditorsDetailed: INITIAL_AUDITORES_DETAILED,
      certificates: mockCertificates,
      processes: mockProcesses,
      requirements: mockRequirements,
      standards: [{ norma: 'ISO 9001:2015' }],
      loading: false,
    });
    assert.match(findingsHtml, /Resultado de Auditorías/);
  });
});
