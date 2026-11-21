# Step 5.1 — Estandarización Certificate-Based y Sección `1. Designación` (`Tipo`, `Fecha`, `Sitio`, `Temporal`)

## 1. Objetivo y Alcance
Implementar la arquitectura estandarizada **Certificate-Based** compartida por las secciones `1..7` + `Resumen` y construir/refactorizar las **4 subsecciones de `1. Designación`** según `public/prompting/future_changes.txt`:
1. **Patrón Estándar Certificate-Based (`auditSectionShell.ts`):**
   - **Multi View:** Basada en **Certificados** (`renderUniversalTemplate`, `table-fixed`, `<colgroup>` `100%`, facetas reactivas, botón `+ Auditoría` dentro de la tarjeta).
   - **Detail View:** Incluye el **Breadcrumb In-Card** en la cabecera de la tarjeta, botón `+ Auditoría`, **Selector de Auditoría del Certificado** (por defecto la más reciente) con botones **`◀ Anterior` / `Siguiente ▶`** ordenados cronológicamente (o por creación), y barra contextual opcional de **Auditorías Vinculadas del Lote** *(habilitada únicamente en `Tipo` y `Sitio`)*.
2. **`1.1 Designación → Tipo` (`designacionTipoView.ts`):**
   - Retirar la opción heredada de "+ Agregar Auditoría" propia de `Tipo` (ahora centralizada en `+ Auditoría` Wizard).
   - Mostrar las auditorías vinculadas del lote seleccionado, editar el **Tipo de Auditoría** (`Seguimiento 1`, `Renovación`, etc.) de cada una con selector ágil, y navegar tanto por `◀ / ▶` como entre auditorías vinculadas.
   - Conservar historial de auditorías del certificado en sección inferior (ordenado más reciente primero).
3. **`1.2 Designación → Fecha` *[NUEVA SECCIÓN]* (`designacion/fecha`):**
   - Enfocada exclusivamente en **fechas programadas** (`auditoria_fecha`: múltiples registros posibles, eligiendo entre `Mes + Año` [`PREPROGRAMADA_MES`] o `Fecha Exacta` [`PROGRAMADA_EXACTA`]).
   - Navegación **únicamente `◀ / ▶`** entre auditorías del certificado (sin selector individual por auditoría vinculada, porque **todas las fechas programadas aplican simultáneamente a todas las auditorías vinculadas del lote**).
4. **`1.3 Designación → Sitio` (`designacionSitioView.ts`):**
   - Enfocada exclusivamente en gestionar (agregar, editar, remover) los sitios permanentes (`auditoria_sitio`) de **cada auditoría individual** del lote.
   - Navegación dual: **`◀ / ▶`** (auditorías del certificado) **y** selector de **auditorías vinculadas del lote** (igual que `Tipo`).
5. **`1.4 Designación → Temporal` (`designacionTemporalView.ts`):**
   - Enfocada exclusivamente en el **Sitio Temporal** (`auditoria_sitio_temporal`), que aplica **a todas las auditorías vinculadas del lote a la vez**.
   - Navegación **únicamente `◀ / ▶`**.
   - Interruptor maestro **ON / OFF** para ese lote vinculado: si está en **OFF**, ninguna auditoría vinculada lleva sitio temporal; si está en **ON**, despliega formulario para declarar el sitio temporal, su **`tiempo_auditoria` (ej. `1.0` días)** y demás campos operativos requeridos.

---

## 2. Archivos y Áreas Afectadas
- **`src/lib/certificateAuditSelector.ts` (nuevo):** motor puro reutilizable que dada una lista de certificados + auditorías construye filas Certificate-Based, ordena auditorías de un certificado (más reciente primero), resuelve `prevAuditId` / `nextAuditId`, y obtiene `linkedSiblingAudits` del mismo `programa_auditoria`
- **`src/views/auditSectionShell.ts` (nuevo):** wrapper estándar de Detail View para secciones `1..7` + `Resumen` (integra `renderDetailPageTemplate` + `Breadcrumb In-Card` + `+ Auditoría` + Selector `◀/▶` + opcional barra de lotes vinculados)
- `src/lib/designacionTipoDomain.ts` y `src/views/designacionTipoView.ts`
- **`src/lib/designacionFechaDomain.ts` (nuevo)** y **`src/views/designacionFechaView.ts` (nuevo)**
- `src/lib/designacionSitioDomain.ts` y `src/views/designacionSitioView.ts`
- `src/lib/designacionTemporalDomain.ts` y `src/views/designacionTemporalView.ts`
- `src/views/auditoriasView.ts` y `src/main.ts` (enrutamiento a `designacion/fecha`, sincronización batch de fechas/temporal al lote vinculado, preservación de `selectedCertId` / `selectedAuditId`)
- Tests: **`certificateAuditSelector.test.ts` (nuevo)**, **`designacionFechaDomain.test.ts` (nuevo)**, actualización de `designacionTipoView.test.ts`, `designacionSitioView.test.ts`

---

## 3. Tareas Detalladas de Implementación

### 3.1 Selector Estándar de Certificado & Auditoría (`certificateAuditSelector.ts` & `auditSectionShell.ts`)
- **Multi View Estándar de Certificado:**
  - 1 fila/card por `Certificado` visible bajo RBAC (mostrando `numero_certificado`, `norma`, `organizacion`, total de auditorías del certificado, última auditoría y un indicador contextual específico de la sección: ej. cantidad de fechas, sitios asignados, etc.).
  - Al hacer clic en un certificado, abre la Detail View con `resolveDefaultAuditForCertificate(certId, persistedAuditId)`: si `persistedAuditId` pertenece a ese certificado se mantiene; si no, selecciona la **auditoría más reciente** (comparando fecha programada descendente, luego `created_at` descendente).
- **Cabecera de Selección de Auditoría en Detail View:**
  - Dropdown compacto `<select data-action="select-section-audit">` listando las auditorías del certificado (`Código · Tipo · Fecha · Vínculo`) + botones **`◀`** (`prevAuditId`, disabled si es la más antigua/primera según dirección) y **`▶`** (`nextAuditId`, disabled si no hay siguiente).
  - Propiedad `showLinkedSiblings?: boolean`:
    - `true` en **`Tipo`** y **`Sitio`**: muestra pills/selector de **"Auditorías vinculadas en este lote"** (`certificado + norma + tipo`) para saltar entre las auditorías hermanas del mismo lote `programa_auditoria` y editar cada una sin salir de la sección.
    - `false` en **`Fecha`**, **`Temporal`**, **`Tiempo`**, **`Auditor`**, **`Proceso`**, **`Turno`**, **`Resultado`**, **`Revisión`**, **`Resumen`**.

### 3.2 `Designación → Tipo` (`designacionTipoView.ts`)
- Eliminar por completo el formulario/botón inline legacy *"Agregar nueva auditoría"*; la creación ocurre exclusivamente mediante el botón persistente **`+ Auditoría`** (Wizard Step 2.1).
- Vista centrada en el lote vinculado al que pertenece la auditoría seleccionada:
  - Mostrar cada auditoría hermana vinculada del mismo `programa_auditoria` (incluida la activa resaltada) con un selector directo de `Tipo de Auditoría` (`id_tipo_auditoria`) y estado de guardado rápido.
  - Permitir navegar con `◀ / ▶` (entre auditorías históricas del certificado) y haciendo clic en otra auditoría vinculada del lote.
  - Zona inferior (Children): tabla/lista de todas las auditorías históricas de ese Certificado (más recientes primero) para inspección y selección directa.

### 3.3 `Designación → Fecha` (`designacionFechaDomain.ts` + `designacionFechaView.ts`)
- Navegación: solo `◀ / ▶` y selector de auditoría del certificado.
- Panel informativo claro: *"Las fechas programadas configuradas aquí se aplicarán simultáneamente a las N auditorías vinculadas de este lote"* (mostrando badge compacto de las normas/certificados incluidos).
- Lista de fechas programadas activas (`auditoria_fecha` donde `tipo_fecha IN ('PREPROGRAMADA_MES', 'PROGRAMADA_EXACTA')` y `!deleted_at`):
  - Agregar tantas filas de fecha como se necesite:
    - Selector de modalidad: **`Mes y Año`** (`PREPROGRAMADA_MES`: `<select mes>` + `<input/select anio>`) o **`Fecha Exacta`** (`PROGRAMADA_EXACTA`: `fecha_inicio` + opcional `fecha_fin` o 1 solo día).
  - Editar o archivar/remover cualquier fecha existente (`archive_record`, sin `.delete()`).
- **Persistencia sincronizada (`saveLinkedBatchProgrammedDates`):**
  - Replica exactamente el conjunto de fechas programadas activas sobre **todas** las auditorías (`id_auditoria`) pertenecientes al mismo `programa_auditoria` (lote vinculado), manteniendo una única fuente de verdad cronológica para todo el lote.

### 3.4 `Designación → Sitio` (`designacionSitioView.ts`)
- Navegación: `◀ / ▶` + selector entre auditorías vinculadas del lote.
- Mostrar estrictamente los sitios permanentes disponibles para el certificado de la **auditoría activa** (distinguiendo `Sitio Principal / Sitio 0`, sitios adicionales declarados en `sitio` del certificado, y ventana de ciclo multi-año IAF MD 1).
- Permitir agregar, editar observaciones/alcance o remover sitios (`auditoria_sitio`) de **esa auditoría individual**, y luego cambiar fácilmente a otra auditoría vinculada del mismo lote o usar `◀ / ▶` para editar otra auditoría del certificado.

### 3.5 `Designación → Temporal` (`designacionTemporalView.ts`)
- Navegación: solo `◀ / ▶` y selector de auditoría del certificado.
- Banner explicativo: *"El Sitio Temporal definido aquí aplica conjuntamente a todas las auditorías vinculadas de este lote"*.
- **Switch maestro ON / OFF (`¿Esta auditoría vinculada auditará un Sitio Temporal?`):**
  - **OFF:** Archiva (`archive_record`) los registros activos de `auditoria_sitio_temporal` del lote si existían (con confirmación limpia si ya tenían tiempo/auditores asignados) y oculta el formulario dejando estado limpio *"Sin Sitio Temporal"*.
  - **ON:** Muestra/crea el formulario del Sitio Temporal sincronizado para todo el lote vinculado:
    - Nombre / Descripción del proyecto temporal
    - Ubicación / Ciudad / Dirección
    - **`Tiempo de Auditoría (días)`** (incrementos `0.25`, ej. `0.5`, `1.0`, `2.5`)
    - Fecha tentativa / Notas de obra o proyecto
  - Al guardar, sincroniza el estado `ON` + campos sobre todas las auditorías vinculadas del lote (`auditoria_sitio_temporal`).

---

## 4. Lista de Verificación
- [ ] `certificateAuditSelector.ts` y `auditSectionShell.ts` implementados y reutilizables para todas las secciones Certificate-Based.
- [ ] `Tipo` ya no tiene botón antiguo de creación; muestra lote vinculado, edita tipos y conserva `◀/▶` + salto entre vinculadas.
- [ ] `Fecha` (nueva ruta `designacion/fecha`) soporta múltiples fechas `Mes+Año` o `Exacta`, aplica al lote vinculado completo y navega solo por `◀/▶`.
- [ ] `Sitio` permite add/edit/remove de sitios por auditoría individual y salta por `◀/▶` y entre vinculadas.
- [ ] `Temporal` usa switch ON/OFF maestro para el lote vinculado, solicita tiempo de auditoría y campos requeridos al estar ON, y navega por `◀/▶`.
- [ ] Todas las pruebas unitarias y `npm run build` / `npm run lint` pasan.
