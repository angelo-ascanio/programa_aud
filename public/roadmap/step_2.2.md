# Step 2.2 — Dominio Puro: Versionado de `Certificado`, Clasificador de Auditorías (4 Categorías) y Cobertura por Versión

## Objetivo del Paso
Construir el motor de dominio puro para el versionado de certificados (`src/lib/certificadoVersionDomain.ts`), adaptar las entidades de `multisiteSampling.ts` (desacoplando `alcance` como campo plano hacia la referencia estructurada de `AlcanceEntity` definida en Step 2.3) y `coverageEngine.ts` para evaluar cada `certificado_version`, e implementar de forma determinística el **Clasificador de Auditorías en 4 Categorías** (ventana exacta de 30 días pre-ejecución), la regla de no duplicación de `fecha_certificado` y los clientes RPC de Paso 1 y Paso 2.

---

## Archivos a Crear / Modificar
- `src/lib/multisiteSampling.ts`
- `src/lib/coverageEngine.ts`
- `src/lib/certificadoVersionDomain.ts` *(nuevo)*
- `src/lib/certificadoVersionDomain.test.ts` *(nuevo)*
- `src/lib/coverageEngine.test.ts`

---

## Especificación Técnica Detallada

### 1. Extensión de Modelos (`src/lib/multisiteSampling.ts`)
1. Añadir `CertificadoVersionEntity` (`id`, `id_certificado`, `id_organizacion_version`, `version_numero`, `es_version_actual`, `notas_version`, `id_estatus`, `estatus`, `id_sector_iaf`, `sector_iaf`, `sector_iaf_descripcion`, `id_subsector_iaf`, `subsector_iaf_codigo`, `subsector_iaf_descripcion`, `subsector_categoria_riesgo`, `multisitio`, `deleted_at`) — **sin campo `alcance`**.
2. Actualizar `CertificadoDetailEntity` y `CertificadoFormDraft`:
   - Añadir `id_certificado_version?: string`, `id_organizacion_version?: string`, `organizacion_abreviacion?: string`, `version_actual_numero?: number`, `selected_version_id?: string`, `versiones?: CertificadoVersionSnapshot[]`.
   - Enlazar `alcanceDetalle?: AlcanceCertificadoEntity | null` (el único alcance vigente del certificado, en español e inglés opcional, propio o compartido) y **remover la validación de longitud `10..1000` de `CertificadoFormDraft`** ya que `alcance` se gestiona en su propia entidad/pestaña sin límite de caracteres. *(Conservar getter/resumen derivado de solo lectura para búsqueda si alguna función auxiliar lo lee).*
   - Añadir `id_certificado_version?: string` a `SiteEntity`, `ProcessEntity`, `NonApplicableRequirementEntity`, `FechaCertificadoEntity`, `ContactoCertificadoEntity`.

### 2. Cobertura Normativa por Versión (`src/lib/coverageEngine.ts`)
- Soportar evaluación por `id_certificado_version` en `evaluateCertificateCoverage({ cert, ... })` garantizando que consultar `v1` evalúe exclusivamente los procesos y exclusiones de `v1`, y consultar `v2` los de `v2`.

### 3. Motor Puro de Versionado de Certificado y Clasificador 4 Categorías (`src/lib/certificadoVersionDomain.ts`)
1. **Categorías exactas (`AuditMigrationCategory`):**
   - `'FINALIZADA_HISTORICA'` — **Finalizadas (Históricas)**: `(estado_ciclo === 'Cerrada' && revisado === true)` o `estado_ciclo === 'Cancelada'`. Preselección: **`'MANTENER_ANTERIOR'`**.
   - `'POST_EJECUCION_CIERRE'` — **Post-ejecución (En cierre)**: existe al menos una fecha activa `REAL` en `auditoria_fecha`, o `estado_ciclo === 'Auditada'`, o (`estado_ciclo === 'Cerrada'` y `!revisado`). Preselección: **`'PENDIENTE_DECISION'`** *(sin preselección)*.
   - `'PRE_EJECUCION_PROXIMA'` — **Pre-ejecución (Próximas)**: sin fechas `REAL` activas, fecha efectiva `<= addDays(referenceDate, 30)` o `estado_ciclo === 'En Ejecución'`. Preselección: **`'PENDIENTE_DECISION'`** *(sin preselección)*.
   - `'FUTURA'` — **Auditorías futuras**: sin fechas `REAL` y fecha `> addDays(referenceDate, 30)` (o planificación futura). Preselección: **`'MIGRAR_NUEVA'`**.
2. **Validación del Modal (`validateAuditVersionResolutions`):**
   - Bloquea la confirmación mientras exista alguna auditoría en Categoría 2 o 3 en estado `'PENDIENTE_DECISION'`.
3. **Clonación In-Memory y Migración (`cloneCertificateVersionInMemory`, `applyAuditMigrationInMemory`):**
   - Clona `sitios`, `procesos`, `procesos_por_sitio`, `requisitos_por_proceso`, `no_aplicables`, `turnos_por_sitio`, `contactos` y comparticiones aplicables.
   - **Garantía:** `fechas = []` (cero `fecha_certificado` copiadas) y **`alcanceDetalle` compartido a nivel de contenedor `certificado` sin duplicación ni pérdida**.
   - `applyAuditMigrationInMemory` actualiza `id_certificado_version` y remapea `sitios`, `procesos`, `turnos` y `hallazgo`.
4. **Persistencia RPC (`persistCloneCertificadoVersion`, `persistMigrateAuditsVersion`):**
   - Invoca `fn_clonar_version_certificado` (sin `p_alcance`) y `fn_migrar_auditorias_version_certificado`, con traductor Zero-UUID en español.

### 4. Pruebas Unitarias (`certificadoVersionDomain.test.ts` y `coverageEngine.test.ts`)
- Validación de las 4 categorías incluyendo borde `+30 días` vs `+31 días`, bloqueo por decisiones pendientes en Categorías 2/3, 0 `fecha_certificado` clonadas, `alcance` intacto en contenedor y remapeo completo de auditorías migradas.

---

## Criterios de Aceptación y Verificación
- `node --test src/lib/certificadoVersionDomain.test.ts src/lib/coverageEngine.test.ts` 100% en verde.
- `0 any`, Zero-UUID y textos en español.
