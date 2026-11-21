/**
 * Step 5.2 — `Designación → Temporal`: Lógica Pura para gestión de sitios temporales,
 * pasos de 0.25d, atribución M:N a certificados de la campaña y facetas operativas.
 *
 * Strictly typed (`strict: true`, 0 `any` / `as any`) and Zero-UUID compliant
 * in all user-facing strings.
 */

import { assertValidUuid, isValidUuid } from './zeroUuid';
import {
  roundAuditDaysQuarter,
  type ProgramaAuditoriaEntity,
} from './auditPlanningEngine';
import type { ProgramacionAuditEntity } from './auditExecution';
import {
  buildCertificateMultiViewRows,
  getLinkedSiblingAudits,
  type BuildCertificateMultiViewRowsParams,
  type CertificateMultiViewRow,
} from './certificateAuditSelector';

export interface TemporalSiteCertLink {
  id: string;
  id_sitio_temporal: string;
  id_auditoria_certificado: string;
  numero_certificado: string;
  organizacion_nombre: string;
  norma_codigo: string;
  deleted_at?: string | null;
}

export interface TemporalSiteTeamAssignment {
  id: string;
  id_sitio_temporal: string;
  id_auditor: string;
  auditor_nombre: string;
  rol_auditor: 'AUDITOR_LIDER' | 'AUDITOR' | 'AUDITOR_EN_ENTRENAMIENTO' | 'EXPERTO_TECNICO';
  tiempo_auditoria: number;
  deleted_at?: string | null;
}

export interface AuditoriaSitioTemporalEntity {
  id: string;
  id_auditoria: string;
  etiqueta: string;
  comentario: string | null;
  tiempo_auditoria: number;
  certificados: TemporalSiteCertLink[];
  equipoTemporal: TemporalSiteTeamAssignment[];
  deleted_at?: string | null;
  deleted_by?: string | null;
  delete_reason?: string | null;
}

export interface TemporalSiteFormDraft {
  id_auditoria: string;
  etiqueta: string;
  comentario: string;
  tiempo_auditoria: number;
  targetAuditCertIds: string[];
}

export type TemporalPendingStatus =
  | 'SIN_SITIO_TEMPORAL'
  | 'SIN_TIEMPO'
  | 'SIN_AUDITORES'
  | 'COMPLETO';

export interface CampaignTemporalRow {
  program: ProgramaAuditoriaEntity;
  anchorAudit: ProgramacionAuditEntity;
  temporalSites: AuditoriaSitioTemporalEntity[];
  totalTemporalDays: number;
  assignedTemporalDays: number;
  pendingStatus: TemporalPendingStatus;
  missingTimeCount: number;
  missingAuditorCount: number;
}

export function normalizeTemporalSiteLabel(rawLabel: string | null | undefined): string {
  const trimmed = typeof rawLabel === 'string' ? rawLabel.trim() : '';
  return trimmed.length > 0 ? trimmed : 'Sitio Temporal';
}

export function createEmptyTemporalSiteDraft(
  anchorAuditId: string,
  defaultCertAuditIds: ReadonlyArray<string>
): TemporalSiteFormDraft {
  return {
    id_auditoria: anchorAuditId,
    etiqueta: 'Sitio Temporal',
    comentario: '',
    tiempo_auditoria: 1.0,
    targetAuditCertIds: defaultCertAuditIds.slice(),
  };
}

export function createTemporalSiteDraftFromEntity(
  entity: AuditoriaSitioTemporalEntity
): TemporalSiteFormDraft {
  return {
    id_auditoria: entity.id_auditoria,
    etiqueta: normalizeTemporalSiteLabel(entity.etiqueta),
    comentario: entity.comentario ?? '',
    tiempo_auditoria: roundAuditDaysQuarter(entity.tiempo_auditoria),
    targetAuditCertIds: entity.certificados
      .filter((c) => !c.deleted_at)
      .map((c) => c.id_auditoria_certificado),
  };
}

export function validateTemporalSiteDraft(
  draft: TemporalSiteFormDraft,
  campaignAudits: ReadonlyArray<ProgramacionAuditEntity>
): string | null {
  if (!isValidUuid(draft.id_auditoria)) {
    return 'Auditoría ancla inválida para el sitio temporal.';
  }
  const anchor = campaignAudits.find(
    (a) => !a.deleted_at && a.id === draft.id_auditoria
  );
  if (!anchor || anchor.tiene_sitio_temporal !== true) {
    return 'La auditoría debe tener activo el indicador de Sitio Temporal (Paso 4: Sitio).';
  }
  const rounded = roundAuditDaysQuarter(draft.tiempo_auditoria);
  if (
    !Number.isFinite(draft.tiempo_auditoria) ||
    rounded <= 0 ||
    Math.abs(rounded - draft.tiempo_auditoria) > 0.001
  ) {
    return 'El tiempo del sitio temporal debe ser mayor a 0 en múltiplos de 0.25 días.';
  }
  if (draft.targetAuditCertIds.length === 0) {
    return 'Seleccione al menos un certificado al cual aplica este sitio temporal.';
  }
  const allowedIds = new Set(
    campaignAudits.filter((a) => !a.deleted_at).map((a) => a.id)
  );
  for (const id of draft.targetAuditCertIds) {
    assertValidUuid(id, 'certificado en campaña');
    if (!allowedIds.has(id)) {
      return 'Uno de los certificados asociados no pertenece a la campaña actual.';
    }
  }
  return null;
}

export function computeCampaignTemporalRows(
  programs: ReadonlyArray<ProgramaAuditoriaEntity>,
  temporalSites: ReadonlyArray<AuditoriaSitioTemporalEntity>
): CampaignTemporalRow[] {
  const rows: CampaignTemporalRow[] = [];

  for (const program of programs) {
    if (program.deleted_at) continue;
    const activeAudits = program.auditorias.filter((a) => !a.deleted_at);
    const temporalAudits = activeAudits.filter(
      (a) => a.tiene_sitio_temporal === true
    );
    if (temporalAudits.length === 0) continue;

    // Requiere Paso 3 (Tipo) completo en al menos el ancla
    const anchorAudit = temporalAudits[0];
    const hasStep3 =
      Boolean(anchorAudit.id_tipo_auditoria) &&
      ((anchorAudit.fechas || []).some(
        (f) => !f.deleted_at && f.tipo_fecha !== 'REAL'
      ) ||
        Boolean(anchorAudit.latestDate));
    if (!hasStep3) continue;

    const auditIds = new Set(activeAudits.map((a) => a.id));
    const relatedTemporals = temporalSites.filter(
      (t) => !t.deleted_at && auditIds.has(t.id_auditoria)
    );

    const totalTemporalDays = roundAuditDaysQuarter(
      relatedTemporals.reduce((s, t) => s + (t.tiempo_auditoria || 0), 0)
    );
    const assignedTemporalDays = roundAuditDaysQuarter(
      relatedTemporals.reduce(
        (s, t) =>
          s +
          t.equipoTemporal
            .filter((m) => !m.deleted_at)
            .reduce((ms, m) => ms + (m.tiempo_auditoria || 0), 0),
        0
      )
    );

    const missingTimeCount = relatedTemporals.filter(
      (t) => (t.tiempo_auditoria || 0) <= 0
    ).length;
    const missingAuditorCount = relatedTemporals.filter((t) => {
      const sumTeam = t.equipoTemporal
        .filter((m) => !m.deleted_at)
        .reduce((ms, m) => ms + (m.tiempo_auditoria || 0), 0);
      return t.tiempo_auditoria > 0 && Math.abs(sumTeam - t.tiempo_auditoria) > 0.001;
    }).length;

    const pendingStatus: TemporalPendingStatus =
      relatedTemporals.length === 0
        ? 'SIN_SITIO_TEMPORAL'
        : missingTimeCount > 0
        ? 'SIN_TIEMPO'
        : missingAuditorCount > 0
        ? 'SIN_AUDITORES'
        : 'COMPLETO';

    rows.push({
      program,
      anchorAudit,
      temporalSites: relatedTemporals,
      totalTemporalDays,
      assignedTemporalDays,
      pendingStatus,
      missingTimeCount,
      missingAuditorCount,
    });
  }

  return rows;
}

export function getTemporalPendingStatusMeta(status: TemporalPendingStatus): {
  label: string;
  shortLabel: string;
  badgeClass: string;
} {
  switch (status) {
    case 'SIN_SITIO_TEMPORAL':
      return {
        label: 'Sin sitio configurado',
        shortLabel: 'Sin sitio',
        badgeClass: 'bg-slate-100 text-slate-700 border-slate-300',
      };
    case 'SIN_TIEMPO':
      return {
        label: 'Sin tiempo asignado',
        shortLabel: 'Sin tiempo',
        badgeClass: 'bg-rose-50 text-rose-800 border-rose-200',
      };
    case 'SIN_AUDITORES':
      return {
        label: 'Sin auditores asignados',
        shortLabel: 'Sin auditores',
        badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
      };
    case 'COMPLETO':
      return {
        label: 'Completo',
        shortLabel: 'Completo',
        badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
      };
  }
}

export interface TemporalSiteDetails {
  ubicacion: string;
  fecha_tentativa: string;
  notas: string;
}

export interface BatchTemporalFormDraft {
  etiqueta: string;
  ubicacion: string;
  tiempo_auditoria: number;
  fecha_tentativa: string;
  notas: string;
}

export interface LinkedBatchTemporalResolution {
  isTemporalEnabled: boolean;
  batchAudits: ProgramacionAuditEntity[];
  activeTemporalSites: AuditoriaSitioTemporalEntity[];
  primaryTemporalSite: AuditoriaSitioTemporalEntity | null;
  requiresDisableConfirmation: boolean;
  totalTemporalDays: number;
  assignedTeamDays: number;
}

export function parseTemporalSiteDetails(
  comentario: string | null | undefined
): TemporalSiteDetails {
  const raw = typeof comentario === 'string' ? comentario.trim() : '';
  if (!raw) {
    return { ubicacion: '', fecha_tentativa: '', notas: '' };
  }

  let ubicacion = '';
  let fechaTentativa = '';
  const extraLines: string[] = [];
  let matchedStructured = false;

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const ubiMatch = /^Ubicaci[oó]n\s*:\s*(.*)$/i.exec(trimmed);
    if (ubiMatch) {
      ubicacion = ubiMatch[1].trim();
      matchedStructured = true;
      continue;
    }
    const fechaMatch = /^Fecha\s+tentativa\s*:\s*(.*)$/i.exec(trimmed);
    if (fechaMatch) {
      fechaTentativa = fechaMatch[1].trim();
      matchedStructured = true;
      continue;
    }
    const notasMatch = /^Notas\s*:\s*(.*)$/i.exec(trimmed);
    if (notasMatch) {
      if (notasMatch[1].trim()) extraLines.push(notasMatch[1].trim());
      matchedStructured = true;
      continue;
    }
    extraLines.push(trimmed);
  }

  if (!matchedStructured) {
    return { ubicacion: '', fecha_tentativa: '', notas: raw };
  }

  return {
    ubicacion,
    fecha_tentativa: fechaTentativa,
    notas: extraLines.join(' ').trim(),
  };
}

export function formatTemporalSiteComment(
  details: TemporalSiteDetails
): string | null {
  const lines: string[] = [];
  if (details.ubicacion.trim()) {
    lines.push(`Ubicación: ${details.ubicacion.trim()}`);
  }
  if (details.fecha_tentativa.trim()) {
    lines.push(`Fecha tentativa: ${details.fecha_tentativa.trim()}`);
  }
  if (details.notas.trim()) {
    lines.push(`Notas: ${details.notas.trim()}`);
  }
  return lines.length > 0 ? lines.join('\n') : null;
}

export function resolveLinkedBatchTemporalState(
  activeAudit: ProgramacionAuditEntity | null,
  allAudits: ReadonlyArray<ProgramacionAuditEntity>,
  programs: ReadonlyArray<ProgramaAuditoriaEntity>,
  temporalSites: ReadonlyArray<AuditoriaSitioTemporalEntity>
): LinkedBatchTemporalResolution {
  if (!activeAudit) {
    return {
      isTemporalEnabled: false,
      batchAudits: [],
      activeTemporalSites: [],
      primaryTemporalSite: null,
      requiresDisableConfirmation: false,
      totalTemporalDays: 0,
      assignedTeamDays: 0,
    };
  }

  const linkedCtx = getLinkedSiblingAudits(activeAudit, allAudits, programs);
  const batchAudits = linkedCtx.siblings.map((s) => s.audit);
  const batchAuditIds = new Set(batchAudits.map((a) => a.id));

  const activeTemporalSites = temporalSites.filter(
    (t) => !t.deleted_at && batchAuditIds.has(t.id_auditoria)
  );
  const primaryTemporalSite =
    activeTemporalSites.find((t) => t.id_auditoria === activeAudit.id) ??
    activeTemporalSites[0] ??
    null;

  const isTemporalEnabled =
    Boolean(linkedCtx.program?.tiene_sitio_temporal) ||
    batchAudits.some((a) => a.tiene_sitio_temporal === true) ||
    activeTemporalSites.length > 0;

  const requiresDisableConfirmation = activeTemporalSites.some(
    (t) =>
      (t.tiempo_auditoria || 0) > 0 ||
      t.equipoTemporal.some((m) => !m.deleted_at)
  );

  const totalTemporalDays = primaryTemporalSite
    ? roundAuditDaysQuarter(primaryTemporalSite.tiempo_auditoria || 0)
    : 0;
  const assignedTeamDays = primaryTemporalSite
    ? roundAuditDaysQuarter(
        primaryTemporalSite.equipoTemporal
          .filter((m) => !m.deleted_at)
          .reduce((sum, m) => sum + (m.tiempo_auditoria || 0), 0)
      )
    : 0;

  return {
    isTemporalEnabled,
    batchAudits,
    activeTemporalSites,
    primaryTemporalSite,
    requiresDisableConfirmation,
    totalTemporalDays,
    assignedTeamDays,
  };
}

export function createBatchTemporalDraftFromResolution(
  resolution: LinkedBatchTemporalResolution
): BatchTemporalFormDraft {
  const site = resolution.primaryTemporalSite;
  if (!site) {
    return {
      etiqueta: 'Sitio Temporal',
      ubicacion: '',
      tiempo_auditoria: 1.0,
      fecha_tentativa: '',
      notas: '',
    };
  }
  const details = parseTemporalSiteDetails(site.comentario);
  return {
    etiqueta: normalizeTemporalSiteLabel(site.etiqueta),
    ubicacion: details.ubicacion,
    tiempo_auditoria:
      site.tiempo_auditoria > 0 ? roundAuditDaysQuarter(site.tiempo_auditoria) : 1.0,
    fecha_tentativa: details.fecha_tentativa,
    notas: details.notas,
  };
}

export function validateBatchTemporalDraft(
  draft: BatchTemporalFormDraft
): string | null {
  if (!draft.etiqueta.trim()) {
    return 'Indique el nombre o descripción del proyecto temporal.';
  }
  if (!draft.ubicacion.trim()) {
    return 'Indique la ubicación, ciudad o dirección del sitio temporal.';
  }
  const rounded = roundAuditDaysQuarter(draft.tiempo_auditoria);
  if (
    !Number.isFinite(draft.tiempo_auditoria) ||
    rounded <= 0 ||
    Math.abs(rounded - draft.tiempo_auditoria) > 0.001
  ) {
    return 'El tiempo del sitio temporal debe ser mayor a 0 en múltiplos de 0.25 días.';
  }
  return null;
}

export type CertificateTemporalSwitchStatus = 'ON' | 'OFF' | 'SIN_AUDITORIA';

export interface CertificateTemporalRow extends CertificateMultiViewRow {
  temporalStatus: CertificateTemporalSwitchStatus;
  temporalStatusLabel: string;
  temporalLabel: string;
  temporalUbicacion: string;
  temporalDays: number;
}

/**
 * Step 5.1 — Certificate-Based Multi View rows for `1.4 Designación → Temporal`.
 * Lists ALL visible certificates (with ON / OFF / Sin auditoría switch state).
 */
export function buildCertificateTemporalRows(
  params: BuildCertificateMultiViewRowsParams & {
    temporalSites: ReadonlyArray<AuditoriaSitioTemporalEntity>;
  }
): CertificateTemporalRow[] {
  const baseRows = buildCertificateMultiViewRows(params);
  const programs = params.programs ?? [];

  return baseRows.map((row) => {
    if (!row.latestAudit) {
      return {
        ...row,
        temporalStatus: 'SIN_AUDITORIA',
        temporalStatusLabel: 'Sin auditorías',
        temporalLabel: '—',
        temporalUbicacion: '',
        temporalDays: 0,
      };
    }

    const res = resolveLinkedBatchTemporalState(
      row.latestAudit,
      params.audits,
      programs,
      params.temporalSites
    );
    const details = parseTemporalSiteDetails(res.primaryTemporalSite?.comentario);

    return {
      ...row,
      temporalStatus: res.isTemporalEnabled ? 'ON' : 'OFF',
      temporalStatusLabel: res.isTemporalEnabled ? 'ON · Activo' : 'OFF · Sin temporal',
      temporalLabel: res.isTemporalEnabled
        ? res.primaryTemporalSite?.etiqueta || 'Pendiente de completar'
        : '—',
      temporalUbicacion: details.ubicacion,
      temporalDays: res.totalTemporalDays,
    };
  });
}
