# Paso 1.2: Motor Puro de Codenames, Nombres Cortos e Hidratación de Datos

## Objetivo del Paso
Crear el motor determinista de abreviaciones y codenames compactos (`src/lib/codenameDomain.ts`) bajo el principio **"Less Is More"**, junto con sus pruebas unitarias (`src/lib/codenameDomain.test.ts`), y actualizar los tipos e hidratación en `src/main.ts` y modelos relacionados para consumir los nuevos campos de BD sin alterar aún el enrutamiento visual.

---

## Archivos Afectados
- `src/lib/codenameDomain.ts` *(nuevo)*
- `src/lib/codenameDomain.test.ts` *(nuevo)*
- `src/lib/conglomeradoDomain.ts` *(añadir campo opcional `abreviacion?: string | null` en `ConglomeradoEntity`)*
- `src/lib/vinculoDomain.ts` *(añadir campo opcional `tipo_vinculacion_override?: AuditLinkNature | null` en `VinculoCertificadoItem`)*
- `src/lib/auditExecution.ts` *(añadir campo opcional `tipo_vinculacion?: AuditLinkNature | null` en `ProgramacionAuditEntity`)*
- `src/lib/auditPlanningEngine.ts` *(añadir campo opcional `abreviacion?: string | null` en catálogo `TipoAuditoriaCatalogItem` si aplica)*
- `src/main.ts` *(hidratación de `grupo_empresarial.abreviacion`, `tipo_auditoria.abreviacion`, `vinculo_certificado.tipo_vinculacion_override` y `auditoria.tipo_vinculacion`)*

---

## Cambios Técnicos Detallados

### 1. Módulo Puro `src/lib/codenameDomain.ts`
Exportar funciones puras y deterministas (strict TypeScript, cero `: any`):

1. **`AUDIT_TYPE_SHORT_ABBREVIATIONS` y `formatAuditTypeShortLabel(tipoNombre, explicitAbrev?)`:**
   - Mapa canónico para los 9 tipos de `tipo_auditoria` (normalizado sin tildes y case-insensitive):
     - `Etapa 1` → `'Et.1'`
     - `Etapa 2` → `'Et.2'`
     - `Seguimiento 1` → `'Seg.1'`
     - `Seguimiento 2` → `'Seg.2'`
     - `Renovación` → `'Renov.'`
     - `Diagnóstico` → `'Diag.'`
     - `Extraordinaria` → `'Extra.'`
     - `Especial` → `'Esp.'`
     - `Otro` → `'Otro'`
   - Si `explicitAbrev` viene poblado desde `tipo_auditoria.abreviacion`, respetarlo tras `.trim()`; si no coincide con el catálogo estándar, generar fallback limpio truncado (`<= 8` caracteres, sin UUIDs).

2. **`formatAuditPeriodShort(auditLike)`:**
   - Prioriza la última fecha vigente (`resolveLatestAuditDate(audit.fechas) ?? audit.latestDate`) o fallback seguro sobre `fecha_reprogramacion` / `fecha_inicio`:
     - Si `PROGRAMADA_EXACTA` o `REAL`: extrae `YYYY-MM` desde `fecha_inicio` (ej. `'2026-11-18'` → `'2026-11'`).
     - Si `PREPROGRAMADA_MES`: formatea `${anio}-${String(mes).padStart(2, '0')}` (ej. `'2026-11'`).
     - Si no hay fecha válida: `'Sin fecha'`.

3. **`formatAuditCodename(input)`:**
   - Recibe `{ tipo_auditoria, tipo_abreviacion?, fechas?, latestDate?, fecha_inicio?, fecha_reprogramacion?, codigo_auditoria? }`.
   - Devuelve `${periodShort} ${shortTipo}` (ej. `'2026-11 Seg.1'`, `'2026-04 Et.2'`, `'Sin fecha Diag.'`).
   - Garantiza que nunca contenga UUIDs ni texto excesivo.
   - Exponer también `formatAuditDisplayWithCode(input)` o `getAuditCodenameTooltip(input)` cuando haga falta mostrar el código interno completo (`AUD-2026-...`) en `title` tooltip.

4. **`resolveShortConglomeradoName(input)` y `resolveShortOrganizacionName(input)`:**
   - `resolveShortConglomeradoName({ nombre, abreviacion?, codigo_grupo? })`:
     1. Si `abreviacion` no está vacío → devuelve `abreviacion.trim()`.
     2. Si `nombre` contiene prefijos comunes (`Grupo `, `Grupo Industrial `, `Conglomerado `) → recorta de forma inteligente a 1–2 palabras clave legibles (máx ~18–22 chars) sin perder identidad ni exponer UUIDs.
   - `resolveShortOrganizacionName({ nombre, abreviacion? })`:
     1. Si `abreviacion` no está vacío → devuelve `abreviacion.trim()`.
     2. Si `nombre` es largo → recorta sufijos societarios (`C.A.`, `S.A.`, `S.L.`, `S.R.L.`) o genera apodo compacto legible (`<= 22` chars).

### 2. Pruebas Unitarias (`src/lib/codenameDomain.test.ts`)
Cubrir con `vitest`:
- Mapeo exacto de las 9 abreviaciones de `tipo_auditoria` (con y sin tildes, mayúsculas/minúsculas).
- Generación de `formatAuditCodename` para fechas `REAL`, `PROGRAMADA_EXACTA`, `PREPROGRAMADA_MES` y sin fecha (`Sin fecha`).
- Priorización de reprogramación más reciente (ej. `numero_secuencia` mayor sobre la secuencia 1).
- `resolveShortConglomeradoName` y `resolveShortOrganizacionName` con y sin `abreviacion`, verificando protección Zero-UUID.

### 3. Hidratación en `src/main.ts` y Tipos Compartidos
- Actualizar la consulta de `grupo_empresarial` en `loadLiveData` (`src/main.ts`) para seleccionar `abreviacion` y mapearla en `ConglomeradoEntity`.
- Actualizar la consulta de `tipo_auditoria` para seleccionar `abreviacion`.
- Actualizar la consulta de `vinculo` / `vinculo_certificado` (alrededor de líneas `33943–34195`) para seleccionar y mapear `tipo_vinculacion_override`.
- Actualizar `loadLiveAudits()` (alrededor de líneas `35015–35820`) para seleccionar y mapear `auditoria.tipo_vinculacion` en `ProgramacionAuditEntity`.
- Mantener compatibilidad total con fallback local y datos seeded (`buildSeeded...Fallback`) cuando el backend remoto no devuelva las columnas nuevas en tests aislados.

---

## Criterios de Aceptación y Verificación
- `npm test -- src/lib/codenameDomain.test.ts` pasa al 100%.
- `npx tsc --noEmit` sin errores y cero `: any` / `as any` en los archivos modificados.
- `npm run lint` y `npm run build` exitosos sin regresiones en la app actual.
