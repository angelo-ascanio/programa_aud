# Step 2.2: `Vínculo` — Lógica Pura de Compromiso (`src/lib/vinculoDomain.ts`, `auditPlanningEngine.ts` y `auditPlanningPersistence.ts`)

## 1. Identificador, Nombre y Dependencias
* **Step ID:** `2.2`
* **Nombre Corto (UI):** `Vínculo`
* **Bloque / Sub-sección:** Bloque 1 — `Auditoría` → `Vínculo`
* **Dependencias:** `step_2.1.md`, `step_1.2.md`

---

## 2. Alcance Exacto y Reglas de Negocio
1. **Enumeración de Estatus de Compromiso (`CertCommitmentStatus`):**
   * `'LIBRE'` (*Libre — disponible para vincular o pasar a Individual; bloqueado para generar auditorías*)
   * `'INDIVIDUAL'` (*Individual — 1 certificado en vínculo propio 1:1*)
   * `'VINCULADO'` (*Vinculado — 2+ certificados agrupados bajo `NIVEL_1_INTRA_ORG` o `NIVEL_2_INTER_ORG`*)
2. **Estandarización de Naturalezas (`AUDIT_LINK_NATURES`):**
   * En `src/lib/auditPlanningEngine.ts`, reemplazar `'Multisitio'` por `'Mixta'`:
     `['Individual', 'Combinada', 'Integrada', 'Conjunta', 'Simultánea', 'Multientidad', 'Mixta']`.
3. **Regla de Agregación al Mismo `Conglomerado`:**
   * Al crear o editar un `VinculoEntity` en `INDIVIDUAL` o `VINCULADO`, todos los certificados seleccionados deben pertenecer a organizaciones con el mismo `id_grupo_empresarial` activo (`hasOrganizationValidConglomerado === true`).
   * Ningún certificado seleccionado puede pertenecer ya a **otro** vínculo activo (`LIBRE` obligatorio antes de unirse a otro grupo).
4. **Compuerta Anti-Auditoría sobre `LIBRE` (`canCertificateEnterDesignacion`):**
   * Retorna `allowed: false` si `status === 'LIBRE'` o si la organización carece de `grupo_empresarial` activo.
5. **Desvinculación Segura (`canDetachCertificateFromVinculo`):**
   * Verifica que el certificado no tenga auditorías activas en estado diferente de `'Cerrada'`, `'Cancelada'` o `'Auditada'`.
   * Si el vínculo era `VINCULADO` y tras retirar un certificado queda con 1 solo certificado restante, sugiere/permite convertir automáticamente el vínculo a `INDIVIDUAL` o desvincular ambos.
6. **Gobernanza de Archivo:** Registrar `'vinculo'` y `'vinculo_certificado'` en `src/lib/archiveGovernance.ts`.

---

## 3. Cambios Exactos en Base de Datos
Ninguno adicional (consume tablas de Step 2.1).

---

## 4. Lógica Pura (`src/lib/vinculoDomain.ts` y `src/lib/auditPlanningEngine.ts`)

### 4.1 Actualización en `src/lib/auditPlanningEngine.ts`
```typescript
export const AUDIT_LINK_NATURES = [
  'Individual',
  'Combinada',
  'Integrada',
  'Conjunta',
  'Simultánea',
  'Multientidad',
  'Mixta',
] as const;
```
Añadir `id_vinculo?: string | null; id_grupo_empresarial?: string | null; tiene_sitio_temporal?: boolean;` en `ProgramaAuditoriaEntity`, y `tiene_sitio_temporal?: boolean; fecha_cierre_auditoria?: string | null; revisado?: boolean; fecha_revision?: string | null; revisado_por?: string | null; documentacion_completa?: boolean; resumen_revision?: string | null;` en `ProgramacionAuditEntity` (`auditExecution.ts`).

### 4.2 Nuevo Módulo `src/lib/vinculoDomain.ts`
```typescript
import { assertValidUuid, isValidUuid } from './zeroUuid';
import type { OrganizacionEntity } from './activeCertificates';
import type { CertificadoDetailEntity } from './multisiteSampling';
import type { AuditLinkLevel, AuditLinkNature, ProgramaAuditoriaEntity } from './auditPlanningEngine';
import type { ProgramacionAuditEntity } from './auditExecution';
import { hasOrganizationValidConglomerado, type ConglomeradoEntity } from './conglomeradoDomain';
import type { UserProfile } from './healthCheck';

export type CertCommitmentStatus = 'LIBRE' | 'INDIVIDUAL' | 'VINCULADO';

export interface VinculoEntity {
  id: string;
  id_grupo_empresarial: string;
  grupo_nombre?: string;
  codigo_vinculo: string | null;
  etiqueta: string;
  nivel_vinculacion: AuditLinkLevel;
  tipo_vinculacion: AuditLinkNature;
  es_vinculada: boolean;
  tiene_sitio_temporal: boolean;
  notas: string | null;
  certificados: VinculoCertificadoItem[];
  deleted_at?: string | null;
  deleted_by?: string | null;
  delete_reason?: string | null;
}

export interface VinculoCertificadoItem {
  id: string;
  id_vinculo: string;
  id_certificado: string;
  numero_certificado: string;
  norma_codigo: string;
  id_organizacion: string;
  organizacion_nombre: string;
  estatus: string;
  deleted_at?: string | null;
}

export interface CertificateCommitmentSummary {
  certificado: CertificadoDetailEntity;
  id_grupo_empresarial: string | null;
  grupo_nombre: string;
  status: CertCommitmentStatus;
  vinculo: VinculoEntity | null;
  canGenerateAudits: boolean;
  blockReason: string | null;
}

export interface VinculoFormDraft {
  id_grupo_empresarial: string;
  codigo_vinculo: string;
  etiqueta: string;
  nivel_vinculacion: AuditLinkLevel;
  tipo_vinculacion: AuditLinkNature;
  tiene_sitio_temporal: boolean;
  notas: string;
  certificadoIds: string[];
}

export function getCommitmentStatusLabel(status: CertCommitmentStatus): {
  label: string;
  badgeClass: string;
} {
  switch (status) {
    case 'VINCULADO':
      return {
        label: 'Vinculado',
        badgeClass: 'bg-violet-50 text-violet-800 border-violet-200',
      };
    case 'INDIVIDUAL':
      return {
        label: 'Individual',
        badgeClass: 'bg-sky-50 text-sky-800 border-sky-200',
      };
    default:
      return {
        label: 'Libre',
        badgeClass: 'bg-amber-50 text-amber-800 border-amber-300',
      };
  }
}

export function computeCertificateCommitmentSummaries(
  certificados: ReadonlyArray<CertificadoDetailEntity>,
  organizaciones: ReadonlyArray<OrganizacionEntity>,
  conglomerados: ReadonlyArray<ConglomeradoEntity>,
  vinculos: ReadonlyArray<VinculoEntity>
): CertificateCommitmentSummary[] {
  const orgById = new Map(organizaciones.filter((o) => !o.deleted_at).map((o) => [o.id, o]));
  const congById = new Map(conglomerados.filter((g) => !g.deleted_at).map((g) => [g.id, g]));
  const vinculoByCertId = new Map<string, VinculoEntity>();

  for (const v of vinculos) {
    if (v.deleted_at) continue;
    for (const item of v.certificados) {
      if (!item.deleted_at) {
        vinculoByCertId.set(item.id_certificado, v);
      }
    }
  }

  return certificados
    .filter((c) => !c.deleted_at)
    .map((c) => {
      const org = orgById.get(c.id_organizacion);
      const validCong = hasOrganizationValidConglomerado(org, conglomerados);
      const grupo = org ? congById.get(org.id_grupo_empresarial) : undefined;
      const v = vinculoByCertId.get(c.id) || null;
      const status: CertCommitmentStatus = !v
        ? 'LIBRE'
        : v.es_vinculada
        ? 'VINCULADO'
        : 'INDIVIDUAL';
      const canGenerateAudits = validCong && status !== 'LIBRE';
      const blockReason = !validCong
        ? 'La organización requiere un Conglomerado activo en Certificación → Conglomerado.'
        : status === 'LIBRE'
        ? 'Certificado en estado Libre: asígnelo a Individual o Vinculado antes de programar auditorías.'
        : null;
      return {
        certificado: c,
        id_grupo_empresarial: grupo?.id || null,
        grupo_nombre: grupo?.nombre || 'Sin conglomerado',
        status,
        vinculo: v,
        canGenerateAudits,
        blockReason,
      };
    });
}

export function filterFreeCertificatesInConglomerado(
  summaries: ReadonlyArray<CertificateCommitmentSummary>,
  grupoId?: string | null
): CertificateCommitmentSummary[] {
  return summaries.filter(
    (s) =>
      s.status === 'LIBRE' &&
      s.id_grupo_empresarial !== null &&
      (!grupoId || s.id_grupo_empresarial === grupoId)
  );
}

export function validateVinculoFormDraft(
  draft: VinculoFormDraft,
  existingVinculos: ReadonlyArray<VinculoEntity>,
  certificados: ReadonlyArray<CertificadoDetailEntity>,
  organizaciones: ReadonlyArray<OrganizacionEntity>,
  editingVinculoId?: string | null
): string | null {
  if (!isValidUuid(draft.id_grupo_empresarial)) {
    return 'Seleccione un conglomerado válido para configurar el vínculo.';
  }
  assertValidUuid(draft.id_grupo_empresarial, 'conglomerado');

  if (!draft.etiqueta.trim() || draft.etiqueta.trim().length < 2) {
    return 'La etiqueta del vínculo debe tener al menos 2 caracteres.';
  }

  if (draft.certificadoIds.length === 0) {
    return 'Debe asociar al menos un certificado al vínculo.';
  }

  for (const certId of draft.certificadoIds) {
    assertValidUuid(certId, 'certificado');
  }

  if (draft.nivel_vinculacion === 'INDIVIDUAL') {
    if (draft.certificadoIds.length !== 1) {
      return 'Un vínculo Individual debe contener exactamente 1 certificado.';
    }
    if (draft.tipo_vinculacion !== 'Individual') {
      return 'El tipo de vinculación debe ser Individual cuando el nivel es Individual.';
    }
  } else {
    if (draft.certificadoIds.length < 2) {
      return 'Un vínculo agrupado requiere al menos 2 certificados.';
    }
    if (draft.tipo_vinculacion === 'Individual') {
      return 'Seleccione una naturaleza de vinculación grupal (Combinada, Integrada, Conjunta, Simultánea, Multientidad o Mixta).';
    }
  }

  const orgById = new Map(organizaciones.filter((o) => !o.deleted_at).map((o) => [o.id, o]));
  const certById = new Map(certificados.filter((c) => !c.deleted_at).map((c) => [c.id, c]));
  const orgIds = new Set<string>();

  for (const cid of draft.certificadoIds) {
    const cert = certById.get(cid);
    const org = cert ? orgById.get(cert.id_organizacion) : undefined;
    if (!cert || !org) {
      return 'Uno de los certificados seleccionados ya no está activo.';
    }
    if (org.id_grupo_empresarial !== draft.id_grupo_empresarial) {
      return `El certificado ${cert.numero_certificado} pertenece a otro conglomerado y no puede vincularse aquí.`;
    }
    orgIds.add(org.id);
  }

  if (draft.nivel_vinculacion === 'NIVEL_1_INTRA_ORG' && orgIds.size > 1) {
    return 'Un vínculo Nivel 1 (Intra-Organizacional) solo admite certificados de la misma organización.';
  }

  const busyCert = existingVinculos
    .filter((v) => !v.deleted_at && v.id !== editingVinculoId)
    .flatMap((v) => v.certificados.filter((vc) => !vc.deleted_at))
    .find((vc) => draft.certificadoIds.includes(vc.id_certificado));
  if (busyCert) {
    return `El certificado ${busyCert.numero_certificado} ya pertenece a otro vínculo activo. Desvincúlelo primero.`;
  }

  return null;
}

export function canDetachCertificateFromVinculo(
  certId: string,
  vinculoId: string,
  programs: ReadonlyArray<ProgramaAuditoriaEntity>,
  audits: ReadonlyArray<ProgramacionAuditEntity>
): { allowed: boolean; reason: string | null } {
  const relatedPrograms = new Set(
    programs.filter((p) => !p.deleted_at && p.id_vinculo === vinculoId).map((p) => p.id)
  );
  const blockingAudit = audits.find(
    (a) =>
      !a.deleted_at &&
      a.id_certificado === certId &&
      relatedPrograms.has(a.id_programa_auditoria) &&
      !['Cerrada', 'Cancelada', 'Auditada'].includes(a.estado_ciclo)
  );
  if (blockingAudit) {
    return {
      allowed: false,
      reason: `No se puede desvincular ${blockingAudit.numero_certificado}: tiene la auditoría ${blockingAudit.codigo_auditoria} en estado ${blockingAudit.estado_ciclo}.`,
    };
  }
  return { allowed: true, reason: null };
}

export function scopeVinculosForProfile(
  vinculos: ReadonlyArray<VinculoEntity>,
  profile: UserProfile | null,
  authorizedClientOrgIds: ReadonlyArray<string>,
  assignedAuditCertIds: ReadonlyArray<string>
): VinculoEntity[] {
  if (!profile || profile.status !== 'APPROVED') return [];
  if (profile.role === 'ADMIN' || profile.role === 'WORKER') return vinculos.slice();
  if (profile.role === 'AUDITOR') {
    const allowedCerts = new Set(assignedAuditCertIds);
    return vinculos
      .map((v) => ({
        ...v,
        certificados: v.certificados.filter((c) => !c.deleted_at && allowedCerts.has(c.id_certificado)),
      }))
      .filter((v) => v.certificados.length > 0);
  }
  const allowedOrgs = new Set(authorizedClientOrgIds);
  return vinculos
    .map((v) => ({
      ...v,
      certificados: v.certificados.filter((c) => !c.deleted_at && allowedOrgs.has(c.id_organizacion)),
    }))
    .filter((v) => v.certificados.length > 0);
}
```

---

## 5. Orquestación UI y Estado
*(Implementada en Step 2.3.)*

---

## 6. Matriz RBAC del Paso 2.2

| Rol | `scopeVinculosForProfile()` | `validateVinculoFormDraft()` / Mutaciones | Ve certificados `LIBRE` |
| :--- | :--- | :--- | :--- |
| **`ADMIN`** | Todos los vínculos y certificados miembro | Permitido | Sí (todos) |
| **`WORKER`** | Todos los vínculos y certificados miembro | Permitido | Sí (todos) |
| **`AUDITOR`** | Solo vínculos con auditoría asignada | Bloqueado | No (solo asignados) |
| **`CLIENT`** | Solo certificados de `authorizedClientOrgIds` (sin revelar co-participantes Nivel 2) | Bloqueado | Solo de sus orgs |

---

## 7. Pruebas Automatizadas (`src/lib/vinculoDomain.test.ts`)
1. `computeCertificateCommitmentSummaries`: identifica correctamente `LIBRE`, `INDIVIDUAL`, `VINCULADO` y bloquea `canGenerateAudits` sobre `LIBRE` o sin conglomerado.
2. `validateVinculoFormDraft`: rechaza `'Individual'` con 2 certificados, `'NIVEL_1_INTRA_ORG'` con 2 organizaciones distintas, certificados de distinto `id_grupo_empresarial`, o certificados ya vinculados.
3. `canDetachCertificateFromVinculo`: bloquea desvinculación si hay auditoría en `'En Ejecución'` / `'Programada'`, y la permite si está `'Cerrada'` / `'Cancelada'`.
4. `scopeVinculosForProfile`: para `CLIENT` en vínculo `NIVEL_2_INTER_ORG` entre Org A y Org B, omite completamente los ítems de Org B.

---

## 8. Criterios de Aceptación (Done Criteria)
- [ ] `src/lib/vinculoDomain.ts` compilado con `strict: true` y `0 any`.
- [ ] `'Mixta'` sustituye a `'Multisitio'` en `auditPlanningEngine.ts` y `auditPlanningPersistence.ts`.
- [ ] `src/lib/vinculoDomain.test.ts` pasa al 100% en `npm test`.
