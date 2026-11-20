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
