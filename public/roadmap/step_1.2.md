# Step 1.2: `Conglomerado` — Lógica Pura de Dominio (`src/lib/conglomeradoDomain.ts`) y Datos Semilla (`06_datos_prueba.sql`)

## 1. Identificador, Nombre y Dependencias
* **Step ID:** `1.2`
* **Nombre Corto (UI):** `Conglomerado`
* **Bloque / Sub-sección:** Bloque 2 — `Certificación` → `Conglomerado`
* **Dependencias:** `step_1.1.md` (esquema SQL `grupo_empresarial` y `organizacion.id_grupo_empresarial`)

---

## 2. Alcance Exacto y Reglas de Negocio
1. **Entidades Puras (`ConglomeradoEntity`, `ConglomeradoWithStats`):** Representar conglomerados enriquecidos con conteo de organizaciones activas, certificados vinculados y clasificación automática:
   * `'SOLO'` (`organizacionesCount === 1`): *"Organización sola / sin agrupar"*.
   * `'MULTI_ORG'` (`organizacionesCount >= 2`): *"Conglomerado multi-empresa"*.
   * `'VACIO'` (`organizacionesCount === 0`, solo visible en papelera `ADMIN`).
2. **Regla de Re-agrupación / Fusión (`planOrganizationRebucket`):**
   * Al mover una organización `O` desde `sourceGroupId` hacia `targetGroupId` (`sourceGroupId !== targetGroupId`):
     * Valida ambos UUIDs con `assertValidUuid()`.
     * Rechaza mover hacia un grupo archivado (`deleted_at !== null`).
     * Predice limpiamente si `sourceGroupId` quedará vacío (`willArchiveSourceGroup: remainingActiveOrgsInSource === 0`) para notificar al usuario antes de confirmar.
3. **Filtro Dedicado `"Organizaciones solas / sin agrupar"`:** Exponer predicados exactos (`filterConglomeradosByBucketKind`) para aislar grupos individuales 1:1 listos para fusionarse antes de pasar al Paso 2 (`Vínculo`).
4. **Aislamiento Estricto `CLIENT` en Cliente:** `scopeConglomeradosForProfile()` filtra conglomerados solo a aquellos que contengan organizaciones en `authorizedClientOrgIds` y **reemplaza la lista de organizaciones internas** manteniendo únicamente las autorizadas al cliente (nunca revela nombres ni conteos de empresas hermanas).
5. **Gobernanza de Archivo:** Registrar `'grupo_empresarial'` en `src/lib/archiveGovernance.ts` (`PROTECTED_SOFT_DELETE_TABLES`, `ArchivableTable`, `ARCHIVE_TABLE_LABELS`, `computeLocalArchiveDependencySummary`).

---

## 3. Cambios Exactos en Base de Datos (`06_datos_prueba.sql`)

```sql
-- Datos semilla idempotentes de grupo_empresarial (antes de INSERT INTO organizacion)
INSERT INTO public.grupo_empresarial (id, codigo_grupo, nombre, es_individual_auto, notas) VALUES
    ('20000000-0000-0000-0000-000000000001', 'CONG-IND-01', 'Grupo Industrial Iberometal', FALSE, 'Conglomerado corporativo multi-empresa habilitado para vinculación Nivel 2.'),
    ('20000000-0000-0000-0000-000000000002', 'CONG-CYB-01', 'CyberCloud Solutions S.L.', TRUE, 'Grupo individual 1:1 creado para organización independiente.')
ON CONFLICT (id) DO NOTHING;

-- Vincular organizaciones de prueba existentes en 06_datos_prueba.sql
-- Ejemplo: Iberometal Componentes S.A. + filial metalúrgica en CONG-IND-01; CyberCloud sola en CONG-CYB-01.
UPDATE public.organizacion
SET id_grupo_empresarial = '20000000-0000-0000-0000-000000000001'
WHERE id IN ('30000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000003');

UPDATE public.organizacion
SET id_grupo_empresarial = '20000000-0000-0000-0000-000000000002'
WHERE id = '30000000-0000-0000-0000-000000000002';
```

---

## 4. Lógica Pura (`src/lib/conglomeradoDomain.ts`, `activeCertificates.ts`, `archiveGovernance.ts`, `accessControl.ts`)

### 4.1 `src/lib/activeCertificates.ts`
Extender `OrganizacionEntity` y `OrganizacionFormDraft`:
```typescript
export interface OrganizacionEntity {
  id: string;
  id_grupo_empresarial: string;
  grupo_empresarial_nombre?: string;
  nombre: string;
  rif: string | null;
  direccion_fiscal: string | null;
  certificados_count?: number;
  deleted_at?: string | null;
  deleted_by?: string | null;
  delete_reason?: string | null;
}

export interface OrganizacionFormDraft {
  id_grupo_empresarial: string; // '' permitido en 'add' => crea grupo 1:1 automático en backend/memoria
  nombre: string;
  rif: string;
  direccion_fiscal: string;
}
```

### 4.2 `src/lib/conglomeradoDomain.ts` (Nuevo Módulo Puro)
```typescript
import { assertValidUuid, isValidUuid } from './zeroUuid';
import type { OrganizacionEntity } from './activeCertificates';
import type { CertificadoDetailEntity } from './multisiteSampling';
import type { UserProfile } from './healthCheck';

export type ConglomeradoBucketKind = 'SOLO' | 'MULTI_ORG' | 'VACIO';

export interface ConglomeradoEntity {
  id: string;
  codigo_grupo: string | null;
  nombre: string;
  es_individual_auto: boolean;
  notas: string | null;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
  deleted_by?: string | null;
  delete_reason?: string | null;
}

export interface ConglomeradoWithStats extends ConglomeradoEntity {
  organizaciones: OrganizacionEntity[];
  organizacionesCount: number;
  certificadosCount: number;
  bucketKind: ConglomeradoBucketKind;
}

export interface ConglomeradoFormDraft {
  codigo_grupo: string;
  nombre: string;
  notas: string;
}

export interface RebucketPlanResult {
  valid: boolean;
  errorMessage: string | null;
  organizationId: string;
  sourceGroupId: string;
  targetGroupId: string;
  willArchiveSourceGroup: boolean;
  sourceRemainingOrgCount: number;
  targetNewOrgCount: number;
}

export function createEmptyConglomeradoFormDraft(): ConglomeradoFormDraft {
  return { codigo_grupo: '', nombre: '', notas: '' };
}

export function createConglomeradoDraftFromEntity(
  entity: ConglomeradoEntity
): ConglomeradoFormDraft {
  return {
    codigo_grupo: entity.codigo_grupo || '',
    nombre: entity.nombre,
    notas: entity.notas || '',
  };
}

export function validateConglomeradoDraft(
  draft: ConglomeradoFormDraft,
  existing: ReadonlyArray<ConglomeradoEntity>,
  editingId?: string | null
): string | null {
  const nombre = draft.nombre.trim();
  if (nombre.length < 2) {
    return 'El nombre del conglomerado debe tener al menos 2 caracteres.';
  }
  const normalizedName = nombre.toLowerCase();
  const duplicateName = existing.some(
    (g) =>
      !g.deleted_at &&
      g.id !== editingId &&
      g.nombre.trim().toLowerCase() === normalizedName
  );
  if (duplicateName) {
    return `Ya existe un conglomerado activo llamado "${nombre}".`;
  }
  const code = draft.codigo_grupo.trim();
  if (code.length > 0) {
    const duplicateCode = existing.some(
      (g) =>
        !g.deleted_at &&
        g.id !== editingId &&
        (g.codigo_grupo || '').trim().toLowerCase() === code.toLowerCase()
    );
    if (duplicateCode) {
      return `El código de conglomerado "${code}" ya está asignado a otro registro activo.`;
    }
  }
  return null;
}

export function resolveConglomeradoBucketKind(
  activeOrgsCount: number
): ConglomeradoBucketKind {
  if (activeOrgsCount <= 0) return 'VACIO';
  if (activeOrgsCount === 1) return 'SOLO';
  return 'MULTI_ORG';
}

export function buildConglomeradosWithStats(
  conglomerados: ReadonlyArray<ConglomeradoEntity>,
  organizaciones: ReadonlyArray<OrganizacionEntity>,
  certificados: ReadonlyArray<CertificadoDetailEntity>
): ConglomeradoWithStats[] {
  const certsByOrg = new Map<string, number>();
  for (const cert of certificados) {
    if (cert.deleted_at) continue;
    certsByOrg.set(cert.id_organizacion, (certsByOrg.get(cert.id_organizacion) || 0) + 1);
  }

  const orgsByGroup = new Map<string, OrganizacionEntity[]>();
  for (const org of organizaciones) {
    if (org.deleted_at) continue;
    const list = orgsByGroup.get(org.id_grupo_empresarial) || [];
    list.push(org);
    orgsByGroup.set(org.id_grupo_empresarial, list);
  }

  return conglomerados
    .filter((g) => !g.deleted_at)
    .map((g) => {
      const groupOrgs = (orgsByGroup.get(g.id) || []).slice().sort((a, b) =>
        a.nombre.localeCompare(b.nombre, 'es')
      );
      const certificadosCount = groupOrgs.reduce(
        (sum, o) => sum + (certsByOrg.get(o.id) ?? o.certificados_count ?? 0),
        0
      );
      return {
        ...g,
        organizaciones: groupOrgs,
        organizacionesCount: groupOrgs.length,
        certificadosCount,
        bucketKind: resolveConglomeradoBucketKind(groupOrgs.length),
      };
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

export function planOrganizationRebucket(
  organizationId: string,
  targetGroupId: string,
  organizaciones: ReadonlyArray<OrganizacionEntity>,
  conglomerados: ReadonlyArray<ConglomeradoEntity>
): RebucketPlanResult {
  if (!isValidUuid(organizationId) || !isValidUuid(targetGroupId)) {
    return {
      valid: false,
      errorMessage: 'Identificador inválido para re-agrupación de organización.',
      organizationId,
      sourceGroupId: '',
      targetGroupId,
      willArchiveSourceGroup: false,
      sourceRemainingOrgCount: 0,
      targetNewOrgCount: 0,
    };
  }

  const org = organizaciones.find((o) => !o.deleted_at && o.id === organizationId);
  if (!org) {
    return {
      valid: false,
      errorMessage: 'La organización seleccionada no existe o está archivada.',
      organizationId,
      sourceGroupId: '',
      targetGroupId,
      willArchiveSourceGroup: false,
      sourceRemainingOrgCount: 0,
      targetNewOrgCount: 0,
    };
  }

  const target = conglomerados.find((g) => !g.deleted_at && g.id === targetGroupId);
  if (!target) {
    return {
      valid: false,
      errorMessage: 'El conglomerado destino no existe o está archivado.',
      organizationId,
      sourceGroupId: org.id_grupo_empresarial,
      targetGroupId,
      willArchiveSourceGroup: false,
      sourceRemainingOrgCount: 0,
      targetNewOrgCount: 0,
    };
  }

  if (org.id_grupo_empresarial === targetGroupId) {
    return {
      valid: false,
      errorMessage: 'La organización ya pertenece al conglomerado seleccionado.',
      organizationId,
      sourceGroupId: org.id_grupo_empresarial,
      targetGroupId,
      willArchiveSourceGroup: false,
      sourceRemainingOrgCount: 0,
      targetNewOrgCount: 0,
    };
  }

  assertValidUuid(org.id_grupo_empresarial, 'conglomerado origen');

  const sourceRemainingOrgCount = organizaciones.filter(
    (o) => !o.deleted_at && o.id_grupo_empresarial === org.id_grupo_empresarial && o.id !== org.id
  ).length;
  const targetCurrentCount = organizaciones.filter(
    (o) => !o.deleted_at && o.id_grupo_empresarial === targetGroupId
  ).length;

  return {
    valid: true,
    errorMessage: null,
    organizationId,
    sourceGroupId: org.id_grupo_empresarial,
    targetGroupId,
    willArchiveSourceGroup: sourceRemainingOrgCount === 0,
    sourceRemainingOrgCount,
    targetNewOrgCount: targetCurrentCount + 1,
  };
}

export function scopeConglomeradosForProfile(
  conglomerados: ReadonlyArray<ConglomeradoWithStats>,
  profile: UserProfile | null,
  authorizedClientOrgIds: ReadonlyArray<string>
): ConglomeradoWithStats[] {
  if (!profile || profile.status !== 'APPROVED') return [];
  if (profile.role === 'ADMIN' || profile.role === 'WORKER') {
    return conglomerados.slice();
  }
  if (profile.role === 'AUDITOR') {
    return [];
  }
  const allowed = new Set(authorizedClientOrgIds);
  return conglomerados
    .map((g) => {
      const visibleOrgs = g.organizaciones.filter((o) => allowed.has(o.id));
      if (visibleOrgs.length === 0) return null;
      return {
        ...g,
        organizaciones: visibleOrgs,
        organizacionesCount: visibleOrgs.length,
        certificadosCount: visibleOrgs.reduce(
          (acc, o) => acc + (o.certificados_count ?? 0),
          0
        ),
        bucketKind: resolveConglomeradoBucketKind(visibleOrgs.length),
      };
    })
    .filter((item): item is ConglomeradoWithStats => item !== null);
}

export function hasOrganizationValidConglomerado(
  org: OrganizacionEntity | undefined,
  conglomerados: ReadonlyArray<ConglomeradoEntity>
): boolean {
  if (!org || org.deleted_at) return false;
  return conglomerados.some((g) => !g.deleted_at && g.id === org.id_grupo_empresarial);
}
```

---

## 5. Orquestación UI y Estado (`src/views/*.ts` & `src/main.ts`)
*(Se implementa en el Step 1.3.)*

---

## 6. Matriz RBAC del Paso 1.2

| Rol | `scopeConglomeradosForProfile()` | `planOrganizationRebucket()` | `archiveGovernance` |
| :--- | :--- | :--- | :--- |
| **`ADMIN`** | Todos los conglomerados activos y organizaciones miembro | Permitido | Archivar + Restaurar |
| **`WORKER`** | Todos los conglomerados activos y organizaciones miembro | Permitido | Archivar (si 0 orgs activas) |
| **`AUDITOR`** | Retorna `[]` (Bloque 2 prohibido) | Bloqueado | Bloqueado |
| **`CLIENT`** | Solo su conglomerado; `organizaciones` filtrada exclusivamente a `authorizedClientOrgIds` | Bloqueado | Bloqueado |

---

## 7. Pruebas Automatizadas (`src/lib/conglomeradoDomain.test.ts`)
1. `validateConglomeradoDraft`: rechaza nombres `< 2` chars, nombres duplicados case-insensitive y códigos duplicados activos.
2. `buildConglomeradosWithStats`: clasifica correctamente `'SOLO'` (`1 org`) vs `'MULTI_ORG'` (`2+ orgs`) y calcula `certificadosCount`.
3. `planOrganizationRebucket`: detecta `willArchiveSourceGroup = true` cuando la organización movida es la única de su conglomerado origen; bloquea mover al mismo grupo o a grupo archivado.
4. `scopeConglomeradosForProfile`: verifica que `AUDITOR` recibe `[]`, y que `CLIENT` sobre un conglomerado con 3 empresas solo ve su empresa asignada sin fugas de las otras 2.
5. Zero-UUID: `planOrganizationRebucket` rechaza UUIDs malformados sin exponer cadenas UUID en `errorMessage`.

---

## 8. Criterios de Aceptación (Done Criteria)
- [ ] `src/lib/conglomeradoDomain.ts` implementado sin `any` ni `as any`.
- [ ] `06_datos_prueba.sql` incluye al menos 1 conglomerado multi-empresa y 1 organización sola en grupo 1:1.
- [ ] `'grupo_empresarial'` integrado en `src/lib/archiveGovernance.ts`.
- [ ] `src/lib/conglomeradoDomain.test.ts` pasa al 100% en `npm test`.
