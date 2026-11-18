/**
 * Phase 4.2.3: Proceso Domain Module (`proceso` + `requisitos_por_proceso` + `hallazgo` + `procesos_sitio_auditoria`)
 * Aligned with ISO/IEC 17021-1:2015, ISO 19011:2018, LTREE requirement hierarchy, and Zero-UUID presentation.
 */

import type { Phase5FindingEntity, ProgramacionAuditEntity } from './auditExecution';
import { containsRawUuid } from './breadcrumb';
import { stripHtmlToSearchText } from './clauseRenderer';
import {
  evaluateCertificateCoverage,
  isClauseBlockedByCertificateExclusions,
  isLtreeSelfOrDescendant,
  resolveRequisitoIsMandatory,
  type CertificateCoverageReport,
} from './coverageEngine';
import {
  INITIAL_REQUISITOS_LTREE,
  calculateLtreeIndentation,
  getRequisitoBilingualTitles,
  type RequisitoLtree,
} from './extraDomain';
import { translateDatabaseError } from './healthCheck';
import type {
  CertificadoDetailEntity,
  ProcesoTipo,
} from './multisiteSampling';
import { orderNormaRequisitosHierarchically } from './normaFullReader';
import { normalizeSearchToken } from './searchControls';
import { formatShiftTime } from './sitioDomain';

export type ProcesoDetailMode = 'read' | 'add' | 'edit';

export interface ProcesoFormDraft {
  id_certificado: string;
  nombre_proceso: string;
  tipo: ProcesoTipo;
  responsable?: string;
}

export const VALID_PROCESO_TIPOS: readonly ProcesoTipo[] = [
  'Estratégico',
  'Medular',
  'De Apoyo',
  'Otro',
] as const;

export interface ProcesoRequisitoLink {
  id_requisito: string;
  codigo: string;
  titulo: string;
  descripcion?: string;
  ruta_materializada: string;
  nivel: number;
  id_norma: string;
  norma_codigo: string;
}

export interface ProcesoHallazgoLink {
  id: string;
  codigo_hallazgo: string;
  id_auditoria: string;
  codigo_auditoria: string;
  tipo: Phase5FindingEntity['tipo'];
  estado_ciclo: Phase5FindingEntity['estado_ciclo'];
  requisito_codigo: string;
  descripcion: string;
  cerrado: boolean;
}

export interface ProcesoAuditoriaLink {
  id_auditoria: string;
  codigo_auditoria: string;
  tipo_auditoria: string;
  metodologia: string;
  fecha_programacion: string;
  estatus: string;
  id_sitio: string | null;
  numero_sitio: number | null;
  nombre_sitio: string;
  id_turno: string | null;
  turno_label: string;
  hora_entrada?: string;
  hora_salida?: string;
}

export interface ProcesoDetailEntity {
  id: string;
  id_certificado: string;
  numero_certificado: string;
  certificado_estatus: string;
  id_norma: string;
  norma_codigo: string;
  norma_titulo: string;
  id_organizacion: string;
  organizacion_nombre: string;
  organizacion_rif: string;
  nombre_proceso: string;
  tipo: ProcesoTipo;
  responsable?: string;
  deleted_at: string | null;
  requisitos: ProcesoRequisitoLink[];
  hallazgos: ProcesoHallazgoLink[];
  auditorias: ProcesoAuditoriaLink[];
}

export interface ProcesoInputValidationParams {
  nombre_proceso: string;
  tipo: string;
  responsable?: string;
  id_certificado: string;
  currentProcesoId?: string;
  existingProcesses?: ReadonlyArray<{
    id: string;
    id_certificado: string;
    nombre_proceso: string;
    deleted_at?: string | null;
  }>;
}

export interface ProcesoInputValidationResult {
  valid: boolean;
  error?: string;
  normalized?: {
    id_certificado: string;
    nombre_proceso: string;
    tipo: ProcesoTipo;
    responsable?: string;
  };
}

export interface ProcesoArchiveGuardResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Supplemental LTREE requirements for standards seeded in `INITIAL_NORMAS` beyond ISO 9001:2015,
 * ensuring every certificate's Norma has valid LTREE clauses without mutating `INITIAL_REQUISITOS_LTREE`.
 */
export const SUPPLEMENTAL_NORMA_REQUISITOS_LTREE: RequisitoLtree[] = [
  {
    id: 'f1400100-0000-0000-0000-000000000041',
    id_norma: 'e0000000-0000-0000-0000-000000014001',
    norma_codigo: 'ISO 14001:2015',
    id_requisito_padre: null,
    codigo: '4.1',
    titulo: 'Comprensión de la organización y de su contexto ambiental',
    descripcion: 'Cuestiones externas e internas incluidas las condiciones ambientales.',
    ruta_materializada: '14001.4.4_1',
    nivel: 2,
    es_padre: false,
  },
  {
    id: 'f1400100-0000-0000-0000-000000000061',
    id_norma: 'e0000000-0000-0000-0000-000000014001',
    norma_codigo: 'ISO 14001:2015',
    id_requisito_padre: null,
    codigo: '6.1',
    titulo: 'Acciones para abordar riesgos y oportunidades',
    descripcion: 'Aspectos ambientales significativos y requisitos legales aplicables.',
    ruta_materializada: '14001.6.6_1',
    nivel: 2,
    es_padre: false,
  },
  {
    id: 'f1400100-0000-0000-0000-000000000081',
    id_norma: 'e0000000-0000-0000-0000-000000014001',
    norma_codigo: 'ISO 14001:2015',
    id_requisito_padre: null,
    codigo: '8.1',
    titulo: 'Planificación y control operacional ambiental',
    descripcion: 'Control de procesos contratados externamente y perspectiva del ciclo de vida.',
    ruta_materializada: '14001.8.8_1',
    nivel: 2,
    es_padre: false,
  },
  {
    id: 'f4500100-0000-0000-0000-000000000061',
    id_norma: 'e0000000-0000-0000-0000-000000045001',
    norma_codigo: 'ISO 45001:2018',
    id_requisito_padre: null,
    codigo: '6.1',
    titulo: 'Acciones para determinar riesgos y oportunidades SST',
    descripcion: 'Identificación de peligros y evaluación de riesgos para la seguridad y salud.',
    ruta_materializada: '45001.6.6_1',
    nivel: 2,
    es_padre: false,
  },
  {
    id: 'f4500100-0000-0000-0000-000000000081',
    id_norma: 'e0000000-0000-0000-0000-000000045001',
    norma_codigo: 'ISO 45001:2018',
    id_requisito_padre: null,
    codigo: '8.1',
    titulo: 'Control operacional y eliminación de peligros',
    descripcion: 'Jerarquía de controles y gestión del cambio en seguridad laboral.',
    ruta_materializada: '45001.8.8_1',
    nivel: 2,
    es_padre: false,
  },
  {
    id: 'f4500100-0000-0000-0000-000000000082',
    id_norma: 'e0000000-0000-0000-0000-000000045001',
    norma_codigo: 'ISO 45001:2018',
    id_requisito_padre: null,
    codigo: '8.2',
    titulo: 'Preparación y respuesta ante emergencias',
    descripcion: 'Respuesta planificada a situaciones de emergencia industrial.',
    ruta_materializada: '45001.8.8_2',
    nivel: 2,
    es_padre: false,
  },
  {
    id: 'f2700100-0000-0000-0000-000000000612',
    id_norma: 'e0000000-0000-0000-0000-000000027001',
    norma_codigo: 'ISO/IEC 27001:2022',
    id_requisito_padre: null,
    codigo: '6.1.2',
    titulo: 'Apreciación de riesgos de seguridad de la información',
    descripcion: 'Metodología de identificación, análisis y criterios de aceptación de riesgos.',
    ruta_materializada: '27001.6.6_1.6_1_2',
    nivel: 3,
    es_padre: false,
  },
  {
    id: 'f2700100-0000-0000-0000-000000000082',
    id_norma: 'e0000000-0000-0000-0000-000000027001',
    norma_codigo: 'ISO/IEC 27001:2022',
    id_requisito_padre: null,
    codigo: '8.2',
    titulo: 'Evaluación del riesgo de seguridad de la información',
    descripcion: 'Reevaluación periódica y ante cambios significativos en el SGSI.',
    ruta_materializada: '27001.8.8_2',
    nivel: 2,
    es_padre: false,
  },
  {
    id: 'f2700100-0000-0000-0000-000000000091',
    id_norma: 'e0000000-0000-0000-0000-000000027001',
    norma_codigo: 'ISO/IEC 27001:2022',
    id_requisito_padre: null,
    codigo: '9.1',
    titulo: 'Seguimiento, medición, análisis y evaluación',
    descripcion: 'Evaluación del desempeño de la seguridad de la información y eficacia del SGSI.',
    ruta_materializada: '27001.9.9_1',
    nivel: 2,
    es_padre: false,
  },
  {
    id: 'f0000000-0000-0000-0000-000000000083',
    id_norma: 'e0000000-0000-0000-0000-000000009001',
    norma_codigo: 'ISO 9001:2015',
    id_requisito_padre: 'f0000000-0000-0000-0000-000000000008',
    codigo: '8.3',
    titulo: 'Diseño y desarrollo de los productos y servicios',
    descripcion: 'Establecimiento, implementación y mantenimiento de un proceso de diseño y desarrollo adecuado para asegurar la posterior provisión de productos y servicios.',
    ruta_materializada: '8.8_3',
    nivel: 2,
    es_padre: false,
  },
  {
    id: 'f4500100-0000-0000-0000-000000000083',
    id_norma: 'e0000000-0000-0000-0000-000000045001',
    norma_codigo: 'ISO 45001:2018',
    id_requisito_padre: null,
    codigo: '8.3',
    titulo: 'Diseño y desarrollo de procesos y controles SST',
    descripcion: 'Integración de criterios de seguridad y salud laboral en el diseño de procesos, instalaciones y cambios operacionales.',
    ruta_materializada: '45001.8.8_3',
    nivel: 2,
    es_padre: false,
  },
  {
    id: 'f2700100-0000-0000-0000-000000a11206',
    id_norma: 'e0000000-0000-0000-0000-000000027001',
    norma_codigo: 'ISO/IEC 27001:2022',
    id_requisito_padre: null,
    codigo: 'A.11.2.6',
    titulo: 'Seguridad del cableado fuera de las instalaciones',
    descripcion: 'Control de seguridad física aplicable a equipos, cableado y activos situados fuera de las instalaciones de la organización.',
    ruta_materializada: '27001.A11.A11_2.A11_2_6',
    nivel: 3,
    es_padre: false,
  },
];

export function getAllSeededNormaRequirements(): RequisitoLtree[] {
  return [...INITIAL_REQUISITOS_LTREE, ...SUPPLEMENTAL_NORMA_REQUISITOS_LTREE];
}

/**
 * Returns LTREE requirements scoped strictly to the parent certificate's Norma (`cert.id_norma`).
 */
export function getScopedNormaRequirements(params: {
  id_norma?: string;
  norma_codigo: string;
  requirementsCatalog?: ReadonlyArray<RequisitoLtree>;
}): RequisitoLtree[] {
  const { id_norma, norma_codigo, requirementsCatalog = getAllSeededNormaRequirements() } = params;
  const cleanNormaId = (id_norma || '').trim();
  const cleanNorma = (norma_codigo || '').trim().toLowerCase();
  const seenIds = new Set<string>();
  const matched: RequisitoLtree[] = [];

  const hasIdNormaMatches =
    Boolean(cleanNormaId) &&
    requirementsCatalog.some((req) => req.id_norma === cleanNormaId);

  for (const req of requirementsCatalog) {
    const isMatch = hasIdNormaMatches
      ? req.id_norma === cleanNormaId
      : Boolean(cleanNorma) && req.norma_codigo.trim().toLowerCase() === cleanNorma;
    if (isMatch && !seenIds.has(req.id)) {
      seenIds.add(req.id);
      matched.push(req);
    }
  }

  return matched.sort((a, b) => a.codigo.localeCompare(b.codigo, undefined, { numeric: true }));
}

export function createEmptyProcesoFormDraft(prefillCertId?: string | null): ProcesoFormDraft {
  return {
    id_certificado: (prefillCertId || '').trim(),
    nombre_proceso: '',
    tipo: 'Medular',
    responsable: '',
  };
}

export function createProcesoFormDraftFromEntity(
  proceso: Pick<ProcesoDetailEntity, 'id_certificado' | 'nombre_proceso' | 'tipo' | 'responsable'>
): ProcesoFormDraft {
  return {
    id_certificado: proceso.id_certificado,
    nombre_proceso: proceso.nombre_proceso,
    tipo: proceso.tipo,
    responsable: proceso.responsable || '',
  };
}

export function resolveProcesoDetailMode(
  state: { isCreating?: boolean; isEditingAttributes?: boolean },
  isStaff: boolean,
  selectedProceso?: ProcesoDetailEntity | null
): ProcesoDetailMode {
  if (!isStaff) return 'read';
  if (state.isCreating) return 'add';
  if (selectedProceso && state.isEditingAttributes) return 'edit';
  return 'read';
}

export interface AvailableProcesoRequisitoOption {
  req: RequisitoLtree;
  alreadyLinkedToCurrentProceso: boolean;
  coveredByOtherProcesoNames: string[];
  isExcludedByIso43: boolean;
  blockingExclusionCodigo?: string;
  blockingJustificacion?: string;
  isAlreadyCoveredByAncestorInSameProceso: boolean;
}

export function getAvailableRequisitoOptionsForProceso(params: {
  id_norma?: string;
  norma_codigo: string;
  currentProcesoId?: string;
  linkedRequisitos: ReadonlyArray<
    Pick<ProcesoRequisitoLink, 'id_requisito' | 'codigo'> & { ruta_materializada?: string }
  >;
  requirementsCatalog?: ReadonlyArray<RequisitoLtree>;
  cert?: CertificadoDetailEntity;
  archivedNoAplicableIds?: ReadonlySet<string>;
  archivedProcesoIds?: ReadonlySet<string>;
}): AvailableProcesoRequisitoOption[] {
  const catalog = params.requirementsCatalog ?? getAllSeededNormaRequirements();
  const scoped = getScopedNormaRequirements({
    id_norma: params.id_norma,
    norma_codigo: params.norma_codigo,
    requirementsCatalog: catalog,
  });

  const pathByCodeLower = new Map<string, string>();
  const pathById = new Map<string, string>();
  for (const r of scoped) {
    pathById.set(r.id, r.ruta_materializada);
    pathByCodeLower.set(r.codigo.trim().toLowerCase(), r.ruta_materializada);
  }

  const assignedIds = new Set(params.linkedRequisitos.map((r) => r.id_requisito));
  const assignedCodes = new Set(params.linkedRequisitos.map((r) => r.codigo.trim().toLowerCase()));
  const assignedPaths: string[] = [];
  for (const link of params.linkedRequisitos) {
    const p = (
      link.ruta_materializada ||
      pathById.get(link.id_requisito) ||
      pathByCodeLower.get(link.codigo.trim().toLowerCase()) ||
      ''
    ).trim();
    if (p) assignedPaths.push(p);
  }

  const otherProcessEntries: Array<{ nombre: string; paths: string[]; codesLower: Set<string> }> = [];
  if (params.cert) {
    for (const proc of params.cert.procesos || []) {
      if (params.currentProcesoId && proc.id === params.currentProcesoId) continue;
      if (params.archivedProcesoIds?.has(proc.id)) continue;

      const codesLower = new Set<string>();
      const paths: string[] = [];
      for (const rawCode of [
        ...(proc.clausulas_cubiertas || []),
        ...(proc.requisitos_detalle || []).map((d) => d.codigo),
      ]) {
        const lower = (rawCode || '').trim().toLowerCase();
        if (!lower || codesLower.has(lower)) continue;
        codesLower.add(lower);
        const matchedPath = pathByCodeLower.get(lower);
        if (matchedPath) paths.push(matchedPath);
      }
      if (codesLower.size > 0) {
        otherProcessEntries.push({
          nombre: proc.nombre_proceso,
          paths,
          codesLower,
        });
      }
    }
  }

  return scoped.map((req) => {
    const reqCodeLower = req.codigo.trim().toLowerCase();
    const alreadyLinkedToCurrentProceso =
      assignedIds.has(req.id) || assignedCodes.has(reqCodeLower);

    const isAlreadyCoveredByAncestorInSameProceso =
      !alreadyLinkedToCurrentProceso &&
      Boolean(req.ruta_materializada) &&
      assignedPaths.some(
        (ancestorPath) =>
          ancestorPath !== req.ruta_materializada &&
          isLtreeSelfOrDescendant(req.ruta_materializada, ancestorPath)
      );

    const coveredByOtherProcesoNames: string[] = [];
    for (const other of otherProcessEntries) {
      const coveredDirectly = other.codesLower.has(reqCodeLower);
      const coveredByAncestor =
        Boolean(req.ruta_materializada) &&
        other.paths.some((p) => isLtreeSelfOrDescendant(req.ruta_materializada, p));
      if (coveredDirectly || coveredByAncestor) {
        coveredByOtherProcesoNames.push(other.nombre);
      }
    }

    let isExcludedByIso43 = false;
    let blockingExclusionCodigo: string | undefined;
    let blockingJustificacion: string | undefined;
    if (params.cert) {
      const block = isClauseBlockedByCertificateExclusions({
        cert: params.cert,
        targetRequisito: req,
        requirementsCatalog: catalog,
        archivedNoAplicableIds: params.archivedNoAplicableIds,
      });
      if (block.blocked) {
        isExcludedByIso43 = true;
        blockingExclusionCodigo = block.blockingExclusionCodigo;
        blockingJustificacion = block.blockingJustificacion;
      }
    }

    return {
      req,
      alreadyLinkedToCurrentProceso,
      coveredByOtherProcesoNames,
      isExcludedByIso43,
      blockingExclusionCodigo,
      blockingJustificacion,
      isAlreadyCoveredByAncestorInSameProceso,
    };
  });
}

export function getAvailableRequisitosForProceso(params: {
  id_norma?: string;
  norma_codigo: string;
  linkedRequisitos: ReadonlyArray<Pick<ProcesoRequisitoLink, 'id_requisito' | 'codigo'>>;
  requirementsCatalog?: ReadonlyArray<RequisitoLtree>;
  cert?: CertificadoDetailEntity;
  archivedNoAplicableIds?: ReadonlySet<string>;
}): RequisitoLtree[] {
  const options = getAvailableRequisitoOptionsForProceso({
    id_norma: params.id_norma,
    norma_codigo: params.norma_codigo,
    linkedRequisitos: params.linkedRequisitos,
    requirementsCatalog: params.requirementsCatalog,
    cert: params.cert,
    archivedNoAplicableIds: params.archivedNoAplicableIds,
  });

  return options
    .filter((opt) => !opt.alreadyLinkedToCurrentProceso && !opt.isExcludedByIso43)
    .map((opt) => opt.req);
}

export function canLinkRequisitoToProceso(params: {
  proceso: Pick<ProcesoDetailEntity, 'id_norma' | 'norma_codigo' | 'requisitos'>;
  requisito: RequisitoLtree;
  cert?: CertificadoDetailEntity;
  requirementsCatalog?: ReadonlyArray<RequisitoLtree>;
  archivedNoAplicableIds?: ReadonlySet<string>;
}): { allowed: boolean; reason?: string } {
  const { proceso, requisito, cert, requirementsCatalog, archivedNoAplicableIds } = params;
  const matchesNorma = proceso.id_norma
    ? requisito.id_norma === proceso.id_norma
    : requisito.norma_codigo.trim().toLowerCase() === proceso.norma_codigo.trim().toLowerCase();
  if (!matchesNorma) {
    return {
      allowed: false,
      reason: `La cláusula ${requisito.codigo} pertenece a ${requisito.norma_codigo} y no corresponde a la norma del certificado (${proceso.norma_codigo}).`,
    };
  }
  const alreadyLinked = proceso.requisitos.some(
    (r) =>
      r.id_requisito === requisito.id ||
      r.codigo.trim().toLowerCase() === requisito.codigo.trim().toLowerCase()
  );
  if (alreadyLinked) {
    return {
      allowed: false,
      reason: `La cláusula ${requisito.codigo} ya está vinculada a este proceso.`,
    };
  }
  if (cert) {
    const catalog = requirementsCatalog ?? getAllSeededNormaRequirements();
    const block = isClauseBlockedByCertificateExclusions({
      cert,
      targetRequisito: requisito,
      requirementsCatalog: catalog,
      archivedNoAplicableIds,
    });
    if (block.blocked) {
      const blockingCode = block.blockingExclusionCodigo || requisito.codigo;
      const isDirect =
        blockingCode.trim().toLowerCase() === requisito.codigo.trim().toLowerCase();
      return {
        allowed: false,
        reason: isDirect
          ? `La cláusula ${requisito.codigo} está excluida como No Aplicable (ISO 4.3) en este certificado.`
          : `La cláusula ${requisito.codigo} está excluida como No Aplicable bajo la cláusula ${blockingCode} (ISO 4.3) en este certificado.`,
      };
    }
  }
  return { allowed: true };
}

/**
 * Returns all mandatory clause IDs currently in `PENDIENTE` state on `cert`,
 * deduplicating redundant children if a pending mandatory ancestor is also selected.
 * Ordered top-down (parent-before-child) for safe DB upsert sequencing.
 */
export function expandPendingMandatoryClauseIds(params: {
  cert: CertificadoDetailEntity;
  proceso?: Pick<ProcesoDetailEntity, 'id_norma' | 'norma_codigo' | 'requisitos'> | null;
  requirementsCatalog: ReadonlyArray<RequisitoLtree>;
  archivedProcesoIds?: ReadonlySet<string>;
  archivedNoAplicableIds?: ReadonlySet<string>;
}): string[] {
  const { cert, proceso, requirementsCatalog, archivedProcesoIds, archivedNoAplicableIds } = params;
  const report = evaluateCertificateCoverage({
    cert,
    requirementsCatalog,
    archivedProcesoIds,
    archivedNoAplicableIds,
  });

  const existingProcesoIds = new Set(
    (proceso?.requisitos || []).map((r) => r.id_requisito)
  );
  const existingProcesoCodes = new Set(
    (proceso?.requisitos || []).map((r) => r.codigo.trim().toLowerCase())
  );

  const candidates = report.pendingMandatoryNodes
    .filter(
      (node) =>
        !existingProcesoIds.has(node.id_requisito) &&
        !existingProcesoCodes.has(node.codigo.trim().toLowerCase())
    )
    .sort((a, b) => {
      if (a.nivel !== b.nivel) return a.nivel - b.nivel;
      return a.codigo.localeCompare(b.codigo, undefined, { numeric: true });
    });

  const keptPaths: string[] = [];
  const selectedIds: string[] = [];

  for (const node of candidates) {
    const coveredByPendingParent =
      Boolean(node.ruta_materializada) &&
      keptPaths.some((parentPath) =>
        isLtreeSelfOrDescendant(node.ruta_materializada, parentPath)
      );
    if (coveredByPendingParent) continue;

    selectedIds.push(node.id_requisito);
    if (node.ruta_materializada) {
      keptPaths.push(node.ruta_materializada);
    }
  }

  return selectedIds;
}

export interface ProcesoBatchLinkDeltaResult {
  toInsert: RequisitoLtree[];
  skippedExcluded: RequisitoLtree[];
  skippedDuplicate: RequisitoLtree[];
  exclusionReasons: Map<string, string>;
}

/**
 * Filters a batch of selected requirement IDs against norm ownership, active links,
 * and ISO 4.3 certificate exclusions, returning deterministic parent-before-child order.
 */
export function computeProcesoBatchLinkDelta(params: {
  currentProceso: Pick<ProcesoDetailEntity, 'id_norma' | 'norma_codigo' | 'requisitos'>;
  selectedReqIds: ReadonlyArray<string>;
  scopedReqs: ReadonlyArray<RequisitoLtree>;
  cert?: CertificadoDetailEntity;
  requirementsCatalog?: ReadonlyArray<RequisitoLtree>;
  archivedNoAplicableIds?: ReadonlySet<string>;
}): ProcesoBatchLinkDeltaResult {
  const {
    currentProceso,
    selectedReqIds,
    scopedReqs,
    cert,
    requirementsCatalog,
    archivedNoAplicableIds,
  } = params;

  const byId = new Map(scopedReqs.map((r) => [r.id, r]));
  const seenIds = new Set<string>();
  const toInsert: RequisitoLtree[] = [];
  const skippedExcluded: RequisitoLtree[] = [];
  const skippedDuplicate: RequisitoLtree[] = [];
  const exclusionReasons = new Map<string, string>();

  for (const rawId of selectedReqIds) {
    const cleanId = (rawId || '').trim();
    if (!cleanId || seenIds.has(cleanId)) continue;
    seenIds.add(cleanId);

    const req = byId.get(cleanId);
    if (!req) continue;

    const alreadyLinked = currentProceso.requisitos.some(
      (r) =>
        r.id_requisito === req.id ||
        r.codigo.trim().toLowerCase() === req.codigo.trim().toLowerCase()
    );
    if (alreadyLinked) {
      skippedDuplicate.push(req);
      continue;
    }

    const guard = canLinkRequisitoToProceso({
      proceso: currentProceso,
      requisito: req,
      cert,
      requirementsCatalog: requirementsCatalog ?? scopedReqs,
      archivedNoAplicableIds,
    });

    if (!guard.allowed) {
      skippedExcluded.push(req);
      if (guard.reason) {
        exclusionReasons.set(req.id, guard.reason);
      }
      continue;
    }

    toInsert.push(req);
  }

  toInsert.sort((a, b) => {
    if (a.nivel !== b.nivel) return a.nivel - b.nivel;
    return a.codigo.localeCompare(b.codigo, undefined, { numeric: true });
  });

  return {
    toInsert,
    skippedExcluded,
    skippedDuplicate,
    exclusionReasons,
  };
}

export type ProcesoBatchMode = 'mandatory' | 'pending' | 'all';

export interface ProcesoBatchPickerRow {
  req: RequisitoLtree;
  displayTitle: string;
  indentLevel: number;
  alreadyLinkedToCurrentProceso: boolean;
  isExcludedByIso43: boolean;
  blockingExclusionCodigo?: string;
  coveredByOtherProcesoNames: string[];
  isPendingMandatory: boolean;
  isMandatory: boolean;
  mandatorySubtreeCount: number;
  disabled: boolean;
}

export interface BuildProcesoBatchPickerResult {
  rows: ProcesoBatchPickerRow[];
  scopedReqs: RequisitoLtree[];
  coverageReport: CertificateCoverageReport | null;
}

/**
 * Builds the hierarchical batch checklist rows for `procesoView.ts`, supporting
 * `Solo Obligatorias` (default ON), `Solo Pendientes`, `Todas`, accent-normalized bilingual search,
 * ISO 4.3 exclusion locking, cross-process annotations, and downward mandatory subtree hints.
 */
export function buildProcesoBatchPickerRows(params: {
  cert?: CertificadoDetailEntity;
  currentProceso?: Pick<
    ProcesoDetailEntity,
    'id' | 'id_norma' | 'norma_codigo' | 'requisitos'
  > | null;
  idNorma?: string;
  normaCodigo?: string;
  requirementsCatalog?: ReadonlyArray<RequisitoLtree>;
  mode?: ProcesoBatchMode;
  filterQuery?: string;
  archivedProcesoIds?: ReadonlySet<string>;
  archivedNoAplicableIds?: ReadonlySet<string>;
}): BuildProcesoBatchPickerResult {
  const {
    cert,
    currentProceso,
    requirementsCatalog = getAllSeededNormaRequirements(),
    mode = 'mandatory',
    filterQuery = '',
    archivedProcesoIds,
    archivedNoAplicableIds,
  } = params;

  const targetNormaId = currentProceso?.id_norma || cert?.id_norma || params.idNorma || '';
  const targetNormaCodigo =
    currentProceso?.norma_codigo || cert?.norma_codigo || params.normaCodigo || '';

  const scopedReqs = orderNormaRequisitosHierarchically(
    getScopedNormaRequirements({
      id_norma: targetNormaId,
      norma_codigo: targetNormaCodigo,
      requirementsCatalog,
    })
  );

  const coverageReport = cert
    ? evaluateCertificateCoverage({
        cert,
        requirementsCatalog,
        archivedProcesoIds,
        archivedNoAplicableIds,
      })
    : null;

  const currentLinks = currentProceso?.requisitos || [];
  const options = getAvailableRequisitoOptionsForProceso({
    id_norma: targetNormaId,
    norma_codigo: targetNormaCodigo,
    currentProcesoId: currentProceso?.id,
    linkedRequisitos: currentLinks,
    requirementsCatalog,
    cert,
    archivedNoAplicableIds,
    archivedProcesoIds,
  });
  const optionById = new Map(options.map((opt) => [opt.req.id, opt]));

  const hasTranslations = scopedReqs.some((r) =>
    Boolean(r.translations?.es?.content_html || r.translations?.en?.content_html)
  );
  const mandatoryById = new Map<string, boolean>();
  for (const r of scopedReqs) {
    const covNode = coverageReport?.nodeByRequisitoId.get(r.id);
    mandatoryById.set(
      r.id,
      covNode ? covNode.es_obligatorio : resolveRequisitoIsMandatory(r, hasTranslations, false)
    );
  }

  const normalizedQuery = normalizeSearchToken(filterQuery);
  const rows: ProcesoBatchPickerRow[] = [];

  for (const req of scopedReqs) {
    const opt = optionById.get(req.id);
    const covNode = coverageReport?.nodeByRequisitoId.get(req.id);
    const isMandatory = mandatoryById.get(req.id) ?? false;

    const alreadyLinkedToCurrentProceso = opt?.alreadyLinkedToCurrentProceso ?? false;
    const isExcludedByIso43 =
      opt?.isExcludedByIso43 ?? covNode?.estado === 'NO_APLICABLE';
    const blockingExclusionCodigo =
      opt?.blockingExclusionCodigo ||
      covNode?.inheritedExclusionCodigo ||
      (covNode?.estado === 'NO_APLICABLE' ? req.codigo : undefined);

    const coveredByOtherProcesoNames = opt?.coveredByOtherProcesoNames || [];
    const isPendingMandatory = covNode
      ? covNode.es_obligatorio && covNode.estado === 'PENDIENTE'
      : isMandatory && !alreadyLinkedToCurrentProceso && !isExcludedByIso43;

    let mandatorySubtreeCount = 0;
    if (covNode) {
      mandatorySubtreeCount = Math.max(
        0,
        covNode.mandatoryDescendantCount - covNode.excludedDescendantCount
      );
    } else if (req.ruta_materializada) {
      for (const cand of scopedReqs) {
        if (cand.id === req.id) continue;
        if (
          mandatoryById.get(cand.id) &&
          isLtreeSelfOrDescendant(cand.ruta_materializada, req.ruta_materializada)
        ) {
          mandatorySubtreeCount += 1;
        }
      }
    }

    const pendingSubtreeCount = covNode ? covNode.pendingDescendantCount : 0;

    if (mode === 'mandatory' && !isMandatory && mandatorySubtreeCount === 0) {
      continue;
    }
    if (mode === 'pending' && !isPendingMandatory && pendingSubtreeCount === 0) {
      continue;
    }

    const titles = getRequisitoBilingualTitles(req);
    const displayTitle = titles.primaryTitle || req.titulo || `Cláusula ${req.codigo}`;

    if (normalizedQuery) {
      const searchBlob = normalizeSearchToken(
        [
          req.codigo,
          displayTitle,
          titles.secondaryEnTitle || '',
          req.titulo || '',
          req.descripcion || '',
          req.translations?.es?.title || '',
          req.translations?.en?.title || '',
          req.translations?.es?.content_html
            ? stripHtmlToSearchText(req.translations.es.content_html)
            : '',
          req.translations?.en?.content_html
            ? stripHtmlToSearchText(req.translations.en.content_html)
            : '',
        ].join(' ')
      );
      const queryTokens = normalizedQuery.split(/\s+/).filter(Boolean);
      if (!queryTokens.every((token) => searchBlob.includes(token))) {
        continue;
      }
    }

    const indent = calculateLtreeIndentation(req.ruta_materializada, req.codigo);
    rows.push({
      req,
      displayTitle,
      indentLevel: Math.max(1, indent.level),
      alreadyLinkedToCurrentProceso,
      isExcludedByIso43,
      blockingExclusionCodigo,
      coveredByOtherProcesoNames,
      isPendingMandatory,
      isMandatory,
      mandatorySubtreeCount,
      disabled: alreadyLinkedToCurrentProceso || isExcludedByIso43,
    });
  }

  return { rows, scopedReqs, coverageReport };
}

/**
 * Computes live selection count and total unique mandatory clauses covered
 * (including downward `<@` LTREE descendants) for the batch picker sticky bar.
 */
export function computeProcesoBatchSelectionSummary(params: {
  selectedReqIds: ReadonlyArray<string>;
  scopedReqs: ReadonlyArray<RequisitoLtree>;
  coverageReport?: CertificateCoverageReport | null;
}): { selectedCount: number; totalMandatoryCovered: number } {
  const { selectedReqIds, scopedReqs, coverageReport } = params;
  const cleanSelectedIds = Array.from(
    new Set(selectedReqIds.map((id) => (id || '').trim()).filter(Boolean))
  );
  if (cleanSelectedIds.length === 0) {
    return { selectedCount: 0, totalMandatoryCovered: 0 };
  }

  const byId = new Map(scopedReqs.map((r) => [r.id, r]));
  const selectedReqs = cleanSelectedIds
    .map((id) => byId.get(id))
    .filter((r): r is RequisitoLtree => Boolean(r));

  if (selectedReqs.length === 0) {
    return { selectedCount: 0, totalMandatoryCovered: 0 };
  }

  const hasTranslations = scopedReqs.some((r) =>
    Boolean(r.translations?.es?.content_html || r.translations?.en?.content_html)
  );

  let totalMandatoryCovered = 0;
  for (const cand of scopedReqs) {
    const covNode = coverageReport?.nodeByRequisitoId.get(cand.id);
    if (covNode?.estado === 'NO_APLICABLE') continue;
    const isMandatory = covNode
      ? covNode.es_obligatorio
      : resolveRequisitoIsMandatory(cand, hasTranslations, false);
    if (!isMandatory) continue;

    const coveredBySelection = selectedReqs.some(
      (sel) =>
        sel.id === cand.id ||
        isLtreeSelfOrDescendant(cand.ruta_materializada, sel.ruta_materializada)
    );
    if (coveredBySelection) {
      totalMandatoryCovered += 1;
    }
  }

  return {
    selectedCount: selectedReqs.length,
    totalMandatoryCovered,
  };
}

/**
 * Counts how many active (non-excluded) descendant sub-clauses sit beneath each
 * linked process requirement for table subtree badges in `proceso-tab-requisitos`.
 */
export function computeLinkedClauseSubtreeCounts(params: {
  linkedRequisitos: ReadonlyArray<ProcesoRequisitoLink>;
  scopedReqs: ReadonlyArray<RequisitoLtree>;
  coverageReport?: CertificateCoverageReport | null;
}): Map<string, number> {
  const { linkedRequisitos, scopedReqs, coverageReport } = params;
  const counts = new Map<string, number>();

  for (const link of linkedRequisitos) {
    const matched =
      scopedReqs.find((r) => r.id === link.id_requisito) ||
      scopedReqs.find(
        (r) => r.codigo.trim().toLowerCase() === link.codigo.trim().toLowerCase()
      );
    const rootPath = (matched?.ruta_materializada || link.ruta_materializada || '').trim();
    const rootId = matched?.id || link.id_requisito;
    if (!rootPath) continue;

    let descendantCount = 0;
    for (const cand of scopedReqs) {
      if (cand.id === rootId) continue;
      const covNode = coverageReport?.nodeByRequisitoId.get(cand.id);
      if (covNode?.estado === 'NO_APLICABLE') continue;
      if (isLtreeSelfOrDescendant(cand.ruta_materializada, rootPath)) {
        descendantCount += 1;
      }
    }
    if (descendantCount > 0) {
      counts.set(link.id_requisito, descendantCount);
    }
  }

  return counts;
}

/**
 * Translates PostgreSQL errors raised during process-clause mutations into clean Zero-UUID Spanish messages.
 */
export function translateProcesoDbError(err: unknown): string {
  const rawMessage =
    typeof err === 'object' && err !== null && 'message' in err
      ? String((err as { message?: unknown }).message || '')
      : typeof err === 'string'
      ? err
      : '';
  const rawCode =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code?: unknown }).code || '')
      : '';

  if (
    rawMessage.includes('REQ_EXCLUDED_BY_ISO43') ||
    (rawCode === 'P0001' && rawMessage.toLowerCase().includes('no aplicable'))
  ) {
    const cleaned = rawMessage
      .replace(/^REQ_EXCLUDED_BY_ISO43:\s*/i, '')
      .replace(
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
        'referencia interna'
      )
      .trim();
    return (
      cleaned ||
      'La cláusula seleccionada está excluida como No Aplicable (ISO 4.3) en este certificado.'
    );
  }

  if (rawCode === '23505') {
    return 'Una o más cláusulas seleccionadas ya estaban vinculadas a este proceso.';
  }

  return translateDatabaseError(err);
}

/**
 * Validates `proceso` attributes against schema constraints (`01_creacion.sql`):
 * - `id_certificado`: required
 * - `nombre_proceso`: non-empty, 2..150 chars, no raw UUIDs
 * - `tipo`: strictly in ('Estratégico', 'Medular', 'De Apoyo', 'Otro')
 * - uniqueness within active processes of the same certificate
 */
export function validateProcesoInput(
  params: ProcesoInputValidationParams
): ProcesoInputValidationResult {
  const idCertificado = (params.id_certificado || '').trim();
  if (!idCertificado) {
    return {
      valid: false,
      error: 'Debe seleccionar el certificado de conformidad al que pertenece el proceso.',
    };
  }

  const nombreProceso = (params.nombre_proceso || '').trim();
  if (nombreProceso.length < 2) {
    return {
      valid: false,
      error: 'El nombre del proceso es obligatorio (mínimo 2 caracteres).',
    };
  }
  if (nombreProceso.length > 150) {
    return {
      valid: false,
      error: 'El nombre del proceso no puede superar los 150 caracteres.',
    };
  }
  if (containsRawUuid(nombreProceso)) {
    return {
      valid: false,
      error: 'El nombre del proceso no debe incluir identificadores UUID internos.',
    };
  }

  const tipoRaw = (params.tipo || '').trim();
  if (!VALID_PROCESO_TIPOS.includes(tipoRaw as ProcesoTipo)) {
    return {
      valid: false,
      error:
        'La clasificación del proceso debe ser Estratégico, Medular, De Apoyo u Otro.',
    };
  }

  const responsable = params.responsable?.trim() || undefined;
  if (responsable && containsRawUuid(responsable)) {
    return {
      valid: false,
      error: 'El nombre del responsable no debe incluir identificadores UUID internos.',
    };
  }

  if (params.existingProcesses && params.existingProcesses.length > 0) {
    const normalizedName = nombreProceso.toLowerCase();
    const duplicate = params.existingProcesses.some(
      (p) =>
        !p.deleted_at &&
        p.id !== params.currentProcesoId &&
        p.id_certificado === idCertificado &&
        p.nombre_proceso.trim().toLowerCase() === normalizedName
    );
    if (duplicate) {
      return {
        valid: false,
        error: `Ya existe un proceso activo llamado "${nombreProceso}" en este certificado.`,
      };
    }
  }

  return {
    valid: true,
    normalized: {
      id_certificado: idCertificado,
      nombre_proceso: nombreProceso,
      tipo: tipoRaw as ProcesoTipo,
      responsable,
    },
  };
}

export function validateProcesoFormDraft(params: {
  draft: ProcesoFormDraft;
  currentProcesoId?: string;
  existingProcesses?: ProcesoInputValidationParams['existingProcesses'];
}): ProcesoInputValidationResult {
  return validateProcesoInput({
    id_certificado: params.draft.id_certificado,
    nombre_proceso: params.draft.nombre_proceso,
    tipo: params.draft.tipo,
    responsable: params.draft.responsable,
    currentProcesoId: params.currentProcesoId,
    existingProcesses: params.existingProcesses,
  });
}

/**
 * Governance guard matching `get_archive_dependency_summary('proceso', ...)`:
 * Blocks archiving a process while active `hallazgo` or `procesos_sitio_auditoria` records exist.
 */
export function canArchiveProceso(params: {
  associatedHallazgosCount: number;
  associatedAuditoriasCount: number;
}): ProcesoArchiveGuardResult {
  if (params.associatedHallazgosCount > 0) {
    return {
      allowed: false,
      reason: `No se puede archivar este proceso porque tiene ${params.associatedHallazgosCount} hallazgo(s) activo(s) vinculado(s).`,
    };
  }
  if (params.associatedAuditoriasCount > 0) {
    return {
      allowed: false,
      reason: `No se puede archivar este proceso porque está vinculado a ${params.associatedAuditoriasCount} auditoría(s) programada(s).`,
    };
  }
  return { allowed: true };
}

/**
 * Resolves a full `ProcesoDetailEntity` joining `proceso`, `certificado`, `organizacion`,
 * `requisitos_por_proceso` + `requisito` (LTREE), `hallazgo`, and `procesos_sitio_auditoria`.
 */
export function resolveProcesoDetailById(params: {
  procesoId: string;
  certificates: ReadonlyArray<CertificadoDetailEntity>;
  programacionAudits: ReadonlyArray<ProgramacionAuditEntity>;
  phase5Findings: ReadonlyArray<Phase5FindingEntity>;
  requirementsCatalog?: ReadonlyArray<RequisitoLtree>;
  archivedProcesoIds?: ReadonlySet<string>;
}): ProcesoDetailEntity | null {
  const {
    procesoId,
    certificates,
    programacionAudits,
    phase5Findings,
    requirementsCatalog = getAllSeededNormaRequirements(),
    archivedProcesoIds,
  } = params;

  if (!procesoId || archivedProcesoIds?.has(procesoId)) {
    return null;
  }

  for (const cert of certificates) {
    const matchedProc = cert.procesos.find((p) => p.id === procesoId);
    if (!matchedProc) continue;

    const scopedReqs = getScopedNormaRequirements({
      id_norma: cert.id_norma,
      norma_codigo: cert.norma_codigo,
      requirementsCatalog,
    });

    // 1. Resolve LTREE requirements linked to this process
    const requisitos: ProcesoRequisitoLink[] = [];
    const seenCodes = new Set<string>();

    const detailsList = matchedProc.requisitos_detalle || [];
    for (const det of detailsList) {
      const cleanCode = det.codigo.trim();
      if (seenCodes.has(cleanCode)) continue;
      seenCodes.add(cleanCode);
      const ltreeMatch = scopedReqs.find(
        (r) => r.codigo.trim().toLowerCase() === cleanCode.toLowerCase()
      );
      requisitos.push({
        id_requisito: ltreeMatch?.id || `req-${cert.id_norma}-${cleanCode}`,
        codigo: ltreeMatch?.codigo || cleanCode,
        titulo: ltreeMatch?.titulo || det.titulo,
        descripcion: ltreeMatch?.descripcion,
        ruta_materializada:
          ltreeMatch?.ruta_materializada || cleanCode.replace(/\./g, '_'),
        nivel: ltreeMatch?.nivel ?? cleanCode.split('.').length,
        id_norma: ltreeMatch?.id_norma || cert.id_norma,
        norma_codigo: ltreeMatch?.norma_codigo || cert.norma_codigo,
      });
    }

    for (const code of matchedProc.clausulas_cubiertas || []) {
      const cleanCode = code.trim();
      if (!cleanCode || seenCodes.has(cleanCode)) continue;
      seenCodes.add(cleanCode);
      const ltreeMatch = scopedReqs.find(
        (r) => r.codigo.trim().toLowerCase() === cleanCode.toLowerCase()
      );
      requisitos.push({
        id_requisito: ltreeMatch?.id || `req-${cert.id_norma}-${cleanCode}`,
        codigo: ltreeMatch?.codigo || cleanCode,
        titulo: ltreeMatch?.titulo || `Cláusula ${cleanCode} (${cert.norma_codigo})`,
        descripcion: ltreeMatch?.descripcion,
        ruta_materializada:
          ltreeMatch?.ruta_materializada || cleanCode.replace(/\./g, '_'),
        nivel: ltreeMatch?.nivel ?? cleanCode.split('.').length,
        id_norma: ltreeMatch?.id_norma || cert.id_norma,
        norma_codigo: ltreeMatch?.norma_codigo || cert.norma_codigo,
      });
    }

    // 2. Resolve associated findings (`hallazgo`)
    const cleanProcName = matchedProc.nombre_proceso.trim().toLowerCase();
    const auditCodeLookup = new Map(
      programacionAudits.map((a) => [a.id, a.codigo_auditoria])
    );

    const hallazgos: ProcesoHallazgoLink[] = phase5Findings
      .filter(
        (f) =>
          f.id_proceso === matchedProc.id ||
          (f.numero_certificado === cert.numero_certificado &&
            f.proceso_nombre.trim().toLowerCase() === cleanProcName)
      )
      .map((f) => ({
        id: f.id,
        codigo_hallazgo: f.codigo_hallazgo,
        id_auditoria: f.id_auditoria,
        codigo_auditoria:
          auditCodeLookup.get(f.id_auditoria) ||
          cert.auditorias.find((a) => a.id === f.id_auditoria)?.codigo_auditoria ||
          'AUD-REG',
        tipo: f.tipo,
        estado_ciclo: f.estado_ciclo,
        requisito_codigo: f.requisito_codigo,
        descripcion: f.descripcion,
        cerrado: Boolean(f.cerrado || f.estado_ciclo === 'Cerrado'),
      }));

    // 3. Resolve scheduled audits evaluating this process (`procesos_sitio_auditoria`)
    const auditorias: ProcesoAuditoriaLink[] = [];
    const seenRowKeys = new Set<string>();

    const primaryShift = cert.turnos[0] || null;

    for (const audit of programacionAudits) {
      if (audit.id_certificado !== cert.id) continue;
      const matchesMatrix = audit.matrizNormativa.some(
        (item) => item.proceso_nombre.trim().toLowerCase() === cleanProcName
      );
      const matchesFinding = hallazgos.some((h) => h.id_auditoria === audit.id);
      if (!matchesMatrix && !matchesFinding) continue;

      const sitesForAudit =
        audit.sitiosMuestreo.length > 0
          ? audit.sitiosMuestreo
          : cert.sitios.map((s) => ({
              id: s.id,
              id_sitio: s.id,
              numero_sitio: s.numero_sitio,
              nombre_sitio: s.nombre_sitio,
              fecha_asignada: audit.fecha_inicio,
            }));

      for (const sm of sitesForAudit) {
        const matchedSite =
          cert.sitios.find(
            (s) => s.id === sm.id_sitio || s.numero_sitio === sm.numero_sitio
          ) || null;
        const matchedShift =
          cert.turnos.find((t) =>
            t.sitios_vinculados.some(
              (name) =>
                name.trim().toLowerCase() ===
                (matchedSite?.nombre_sitio || sm.nombre_sitio).trim().toLowerCase()
            )
          ) || primaryShift;

        const rowKey = `${audit.id}::${matchedSite?.id || sm.id_sitio || sm.nombre_sitio}::${matchedShift?.id || 'none'}`;
        if (seenRowKeys.has(rowKey)) continue;
        seenRowKeys.add(rowKey);

        auditorias.push({
          id_auditoria: audit.id,
          codigo_auditoria: audit.codigo_auditoria,
          tipo_auditoria: audit.tipo_auditoria,
          metodologia: audit.metodologia,
          fecha_programacion: sm.fecha_asignada || audit.fecha_inicio,
          estatus: audit.estatus,
          id_sitio: matchedSite?.id || sm.id_sitio || null,
          numero_sitio: matchedSite?.numero_sitio ?? sm.numero_sitio ?? null,
          nombre_sitio: matchedSite?.nombre_sitio || sm.nombre_sitio,
          id_turno: matchedShift?.id || null,
          turno_label: matchedShift
            ? `${formatShiftTime(matchedShift.hora_entrada)} – ${formatShiftTime(matchedShift.hora_salida)} · ${matchedShift.descripcion}`
            : 'Horario Operativo Estándar',
          hora_entrada: matchedShift?.hora_entrada,
          hora_salida: matchedShift?.hora_salida,
        });
      }
    }

    for (const certAud of cert.auditorias) {
      const alreadyHasAudit = auditorias.some((a) => a.id_auditoria === certAud.id);
      if (alreadyHasAudit) continue;
      const targetSite =
        cert.sitios.find((s) =>
          (certAud.sitios_alcance || []).some(
            (name) => name.trim().toLowerCase() === s.nombre_sitio.trim().toLowerCase()
          )
        ) || cert.sitios[0] || null;
      const targetShift =
        cert.turnos.find((t) =>
          targetSite
            ? t.sitios_vinculados.some(
                (name) =>
                  name.trim().toLowerCase() === targetSite.nombre_sitio.trim().toLowerCase()
              )
            : false
        ) || primaryShift;

      auditorias.push({
        id_auditoria: certAud.id,
        codigo_auditoria: certAud.codigo_auditoria,
        tipo_auditoria: certAud.tipo_auditoria,
        metodologia: certAud.metodologia,
        fecha_programacion: certAud.fecha_programacion,
        estatus: certAud.estatus,
        id_sitio: targetSite?.id || null,
        numero_sitio: targetSite?.numero_sitio ?? null,
        nombre_sitio: targetSite?.nombre_sitio || 'Sede Principal',
        id_turno: targetShift?.id || null,
        turno_label: targetShift
          ? `${formatShiftTime(targetShift.hora_entrada)} – ${formatShiftTime(targetShift.hora_salida)} · ${targetShift.descripcion}`
          : 'Horario Operativo Estándar',
        hora_entrada: targetShift?.hora_entrada,
        hora_salida: targetShift?.hora_salida,
      });
    }

    return {
      id: matchedProc.id,
      id_certificado: cert.id,
      numero_certificado: cert.numero_certificado,
      certificado_estatus: cert.estatus,
      id_norma: cert.id_norma,
      norma_codigo: cert.norma_codigo,
      norma_titulo: cert.norma_titulo,
      id_organizacion: cert.id_organizacion,
      organizacion_nombre: cert.organizacion_nombre,
      organizacion_rif: cert.organizacion_rif,
      nombre_proceso: matchedProc.nombre_proceso,
      tipo: matchedProc.tipo,
      responsable: matchedProc.responsable,
      deleted_at: null,
      requisitos,
      hallazgos,
      auditorias,
    };
  }

  return null;
}
