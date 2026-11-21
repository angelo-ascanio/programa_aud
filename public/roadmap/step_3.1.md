# Step 3.1 — `Conglomerado` Detail View: Tabs `Organizaciones` & `Auditorías`

## 1. Objetivo y Alcance
Corregir y completar la **Children Zone** de la Detail View de **`Conglomerado`** (`Certificación → Conglomerado`) conforme a `public/prompting/future_changes.txt`:
1. Renombrar pestañas hijas:
   - `Organizaciones miembro` → **`Organizaciones`**
   - `Vínculos de Auditoría asociados` → **`Auditorías`**
2. En la pestaña **`Organizaciones`**:
   - Corregir el cálculo de la columna `Certificados` para que refleje exactamente el conteo de certificados activos reales de cada organización (igual al mostrado dentro de `Organización` Detail View).
   - Restringir el `<select>` de incorporación (`#rebucketOrgSelect`) exclusivamente a **organizaciones aisladas** (`bucketKind === 'SOLO'`, es decir, conglomerados de 1 solo miembro).
   - Permitir **remover/desvincular una organización** del `Conglomerado` (moviéndola de vuelta a un bucket individual 1:1) respetando la regla canónica de **cero `<button>` dentro de `<tbody>`**.
3. En la pestaña **`Auditorías`**:
   - Ordenar las auditorías asociadas con las **más recientes primero** (descendente por fecha programada / `created_at`).
   - Reemplazar la columna inútil `Auditorías` (conteo) por el campo automático **`estatus_auditoria`**.
   - Hacer que al hacer clic en cualquier registro de la tabla de `Auditorías` navegue directamente a la Detail View de **`Resumen`** de esa auditoría específica.

---

## 2. Archivos y Áreas Afectadas
- `src/lib/conglomeradoDomain.ts` (estadísticas reales de certificados por org, selector estricto de orgs `SOLO`, planner/validador de separación de organización y selector ordenado de auditorías con `estatus_auditoria`)
- `src/views/conglomeradoView.ts` (tabs renombradas, tabla `Organizaciones` corregida, control externo a `<tbody>` para remover miembro, tabla `Auditorías` con orden descendente + columna `estatus_auditoria` + click a `Resumen`)
- `src/main.ts` (handler de desvinculación vía `fn_desvincular_organizacion_conglomerado` y navegación directa desde `Conglomerado → Auditorías` hacia `auditorias/resumen` con `(certId, auditId)`)
- `src/lib/conglomeradoDomain.test.ts` (nuevas pruebas unitarias)

---

## 3. Tareas Detalladas de Implementación

### 3.1 Corrección de Conteo Real de Certificados y Filtro `SOLO` en `conglomeradoDomain.ts`
- **`computeOrgActiveCertificatesMap(certificados)`:**
  - Utilizar `countActiveCertificates(...)` de `src/lib/activeCertificates.ts` (misma fuente y criterio `deleted_at === null` + `estatus` vigente/no archivado usado en `organizacionView.ts`) para poblar un `Map<orgId, number>`.
  - Reemplazar en `conglomeradoView.ts` el fallback impreciso `org.certificados_count ?? 0` por `activeCertCountByOrgId.get(org.id) ?? 0`, garantizando coincidencia 1:1 con la vista de `Organización`.
- **`getEligibleSoloOrganizationsForRebucket(conglomerados, targetGroupId)`:**
  - Filtrar únicamente organizaciones cuyo `grupo_empresarial` actual sea diferente a `targetGroupId`, tenga `!deleted_at`, y cumpla estrictamente **`bucketKind === 'SOLO'` (`organizacionesCount === 1`)**.
  - Excluir categóricamente cualquier organización que ya pertenezca a otro conglomerado multi-empresa (`organizacionesCount > 1`), evitando robos accidentales entre conglomerados existentes.

### 3.2 Remover Organización del `Conglomerado` (Sin `<button>` en `<tbody>`)
- En `conglomeradoDomain.ts`:
  - `validateOrganizationDetachFromConglomerado({ group, orgId, vinculos, auditPrograms })`:
    - Solo habilitado cuando `group.organizaciones.length > 1` (no tiene sentido "remover" al único miembro de un bucket `SOLO`).
    - Bloquea si la organización participa en algún `vinculo_certificado` activo junto a certificados de **otra** organización del conglomerado; entrega mensaje claro indicando qué vínculo debe ajustarse primero.
- En `conglomeradoView.ts` (en cumplimiento estricto de `public/certificado/component_specifications.md`: **cero `<button>` en `<tbody>`**):
  - Cuando `group.organizaciones.length > 1` y `isStaff`:
    - Encima de la tabla `Organizaciones` (zona toolbar junto a `#rebucketOrgSelect`), incluir un control limpio de **"Separar organización del conglomerado"** (`<select id="detachOrgSelect">` + botón `Separar del grupo` `data-action="detach-org-from-conglomerado"` + mensaje contextual / confirmación inline sin `window.confirm` ni UUIDs), **O** abrir un drawer de acción al seleccionar la organización sin romper el click de navegación hacia `Organización` Detail View.
    - La tabla `Organizaciones` mantiene sus filas limpias (`table-fixed`, `<colgroup>` sumando `100%`), y hacer clic en una fila abre la Detail View de dicha `Organización` como de costumbre (agregando un toggle/badge opcional para marcarla o usar el panel superior de separación).

### 3.3 Tab `Auditorías` (Antes `Vínculos de Auditoría asociados`)
- En `conglomeradoDomain.ts`:
  - `buildConglomeradoAuditsList({ group, auditPrograms, programacionAudits, vinculos, temporalSites, alertConfig })`:
    - Recopila todas las auditorías (`ProgramacionAuditEntity` activas) cuyos certificados pertenecen a organizaciones del `Conglomerado`.
    - Calcula para cada auditoría el estatus automático **`estatus_auditoria`** (compartiendo el resolver base que se completará en `step_9.1.md`, con fallback determinista progresivo mientras tanto en `pipelineEngine.ts` / `conglomeradoDomain.ts`).
    - Ordena por fecha programada más reciente (y `created_at` descendente como desempate) — **recientes primero**.
- En `conglomeradoView.ts`:
  - Cambiar pestaña a label **`Auditorías`** (`activeChildTab === 'auditorias'`, manteniendo compatibilidad si llega `'vinculos'`).
  - Columnas (`table-fixed`, `<colgroup>` sumando `100%`):
    1. `Certificado & Org` (`numero_certificado`, `norma_codigo`, `organizacion_nombre`)
    2. `Auditoría & Tipo` (`codigo_auditoria`, `tipo_auditoria`, `etiqueta` de vínculo/campaña)
    3. `Fecha` (última fecha programada / real o `'Sin fecha'`)
    4. `Estatus Auditoría` (`estatus_auditoria` badge semántico) *(reemplaza por completo la antigua columna de conteo `Auditorías`)*
  - Atributos de fila (`<tr>`):
    - `data-action="open-audit-resumen"`
    - `data-cert-id="${audit.id_certificado}"`
    - `data-audit-id="${audit.id}"`
  - Al hacer clic en una fila, `src/main.ts` actualiza `(selectedCertId, selectedAuditId)` y navega a `auditorias` → `resumen` Detail View enfocada exactamente en esa auditoría.
- Mantener la visibilidad RBAC estricta para `CLIENT` Nivel 2 (solo ve organizaciones y auditorías autorizadas en `authorizedClientOrgIds`, nunca datos de la otra empresa del mismo conglomerado).

---

## 4. Lista de Verificación
- [ ] Tabs renombradas exactamente a `Organizaciones` y `Auditorías`.
- [ ] Columna `Certificados` en tab `Organizaciones` coincide 1:1 con el conteo dentro de cada `Organización`.
- [ ] Selector `#rebucketOrgSelect` lista únicamente organizaciones con `bucketKind === 'SOLO'`.
- [ ] Es posible separar una organización de un conglomerado multi-empresa a un bucket individual, sin `<button>` dentro de `<tbody>`, respetando bloqueo si comparte vínculo Nivel 2 activo.
- [ ] Tab `Auditorías` ordena más recientes primero, muestra `estatus_auditoria` sin columna redundante de conteo, y al hacer clic abre `Resumen` de esa auditoría.
- [ ] Pruebas unitarias en `conglomeradoDomain.test.ts` y verificación en navegador pasando.
