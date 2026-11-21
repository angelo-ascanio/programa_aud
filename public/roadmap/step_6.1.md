# Step 6.1 — `2. Tiempo` y `3. Auditor` (antes `Asignación`) Basados en Certificado

## 1. Objetivo y Alcance
Transformar **`Tiempo`** (Paso 2) y **`Auditor`** (Paso 3, renombramiento de `Asignación`) al patrón estandarizado Certificate-Based descrito en `public/prompting/future_changes.txt`:
1. **`2. Tiempo` (`#/auditorias/tiempo`):**
   - **Multi View:** Basada en **Certificados** (mostrando cantidad de sitios de la auditoría más reciente y total de días declarados).
   - **Detail View:** Selector de auditoría individual (`◀ / ▶`, por defecto más reciente, **sin** navegación entre vinculadas) dentro del `auditSectionShell` (con Breadcrumb In-Card y `+ Auditoría`).
   - Lista todos los sitios asignados a esa auditoría específica en `1.3 Sitio` y permite declarar/editar **`tiempo_auditoria`** para cada sitio (`0.5`, `1.0`, `2.0`, `6.5` días, incrementos válidos de `0.25d`).
2. **`3. Auditor` (`#/auditorias/auditor`, conservando alias `#/auditorias/asignacion`):**
   - Renombramiento completo en labels de UI, Breadcrumb y Menú Bloque 1 a **`Auditor`**.
   - **Multi View:** Basada en **Certificados** (mostrando días requeridos vs días asignados por auditores).
   - **Detail View:** Selector de auditoría individual (`◀ / ▶`, sin vinculadas).
   - Lista todos los sitios de esa auditoría con su `tiempo_auditoria` requerido **E INCLUYE el `Sitio Temporal`** cuando el switch de `1.4 Temporal` está en **ON** para el lote de esa auditoría.
   - Para cada sitio (permanentes y temporal), permite asignar **múltiples auditores**, indicando duración individual en días (`0.25d`) por auditor y **validando exactamente**:
     `SUM(duración auditores asignados al sitio) === tiempo_auditoria del sitio` *(ej. sitio requiere `6` días → 2 auditores con `3` días cada uno = `6/6d` Balanceado)*, manteniendo alertas/reglas de competencia IAF y rotación.

---

## 2. Archivos y Áreas Afectadas
- `src/lib/tiempoDomain.ts` y `src/views/tiempoView.ts` (conversión de Multi/Detail View desde programa hacia Certificado → Auditoría individual + edición ágil de días por sitio)
- `src/lib/asignacionDomain.ts` y `src/views/asignacionView.ts` (conversión a Certificado → Auditoría individual, renombrado visual a `3. Auditor`, inclusión obligatoria de `Sitio Temporal` cuando está ON, validación exacta `SUM == requerido` en UI y dominio)
- `src/views/auditoriasView.ts` y `src/main.ts` (soporte `selectedCertId` / `selectedAuditId`, persistencia en `auditoria_sitio.dias_auditor`, `equipo_auditor_sitio` y asignación sobre `Sitio Temporal`)
- `src/lib/tiempoView.test.ts`, `src/lib/asignacionDomain.test.ts`, `src/lib/asignacionView.test.ts`

---

## 3. Tareas Detalladas de Implementación

### 3.1 `2. Tiempo` (`tiempoDomain.ts` + `tiempoView.ts`)
- **Multi View (Certificate-Based):**
  - Columnas `table-fixed` (`<colgroup>` = `100%`, cero `<button>` en `<tbody>`):
    - `Certificado & Org` (`numero_certificado`, `norma`, `organizacion`)
    - `Última Auditoría` (`codigo_auditoria`, `tipo_auditoria`, `fecha`)
    - `Sitios Designados` (`X sitio(s)`)
    - `Tiempo Total` (`Y.YY días`) + badge `Pendiente` / `Completo`
- **Detail View (`auditSectionShell` sin barra de vinculadas):**
  - Muestra cada sitio permanente (`auditoria_sitio`) de la auditoría seleccionada (`Sitio 0 / Principal`, sitios adicionales).
  - Si no hay sitios designados aún, muestra estado guiado claro con enlace directo a **`1. Designación → Sitio`** preservando `(certId, auditId)`.
  - Por cada sitio, input numérico limpio (`step="0.25"`, `min="0.25"`, presets rápidos opcionales `0.5`, `1.0`, `2.0`, `3.0` fuera de `<tbody>`) o tarjetas por sitio para evitar botones dentro de `<tbody>` si es tabla, más validación de positivos en múltiplos de `0.25`.
  - Muestra el **Total de Días de la Auditoría** actualizado en tiempo real y conserva los cambios en `auditoria_sitio` (`dias_auditor` / `tiempo_auditoria`).
  - Nota informativa si existe un `Sitio Temporal` activo indicando su tiempo declarado en `1.4 Temporal` (recordando que también requerirá auditores en Paso 3).

### 3.2 `3. Auditor` (`asignacionDomain.ts` + `asignacionView.ts`)
- **Multi View (Certificate-Based):**
  - Columnas `table-fixed` (`<colgroup>` = `100%`):
    - `Certificado & Org`
    - `Última Auditoría` (`tipo`, `fecha`)
    - `Cobertura Días` (`asignados / requeridos`, ej. `6.0 / 6.0 d` incl. Temporal si activo)
    - `Estado` (`Pendiente` / `Desbalanceado` / `Completo ✓`)
- **Detail View (`auditSectionShell` sin barra de vinculadas):**
  - Construye lista unificada de **Unidades Auditables con Tiempo**:
    1. Todos los sitios permanentes de `auditoria_sitio` de la auditoría activa con su `tiempo_auditoria` (`sitio_permanente`).
    2. Si existe registro activo `auditoria_sitio_temporal` (`activo / !deleted_at`) para esa auditoría o su lote vinculado: agrega tarjeta destacada **`Sitio Temporal — [Nombre]`** con su `dias_auditor` requerido (badge `TEMPORAL`).
  - Dentro de la tarjeta de **cada sitio (permanente o temporal)**:
    - Indicador de balance en vivo: `Asignado: X d / Requerido: Y d` + diferencia (`Faltan Z d` en ámbar, `Excede por Z d` en rojo, `Balance exacto ✓` en esmeralda).
    - Lista de auditores actualmente asignados al sitio con su rol (`Líder` / `Auditor`), días asignados editables (incrementos `0.25`, ej. `3.0 d`), badge de calificación IAF / norma, y acción de retirar (`archive_record`).
    - Controles para agregar auditor al sitio: `<select>` filtrado por auditores elegibles (mostrando calificación/conflicto/disponibilidad sin UUIDs), campo numérico de duración (`días`, sugerencia automática = días restantes por cubrir del sitio) y botón `Agregar Auditor`.
    - Validación estricta en dominio y UI: no marcar el sitio como completo hasta que `assignedCount >= 1` **y** `Math.abs(sumAssignedDays - requiredDays) < 0.001`.
- **Persistencia (`src/main.ts`):**
  - Verifica almacenamiento de asignación de auditores para `Sitio Temporal` (ya sea mediante relación `id_sitio_temporal` en equipo o tabla puente existente en `01_creacion.sql`) garantizando round-trip completo en base de datos sin errores RLS.

---

## 4. Lista de Verificación
- [ ] `Tiempo` y `Auditor` operan en Multi View sobre Certificados y Detail View con selector `◀/▶` de auditoría única.
- [ ] `Tiempo` permite asignar duraciones decimales (`0.5`, `2.0`, `6.5`, etc., paso `0.25`) por cada sitio de la auditoría seleccionada.
- [ ] `Auditor` (renombrado desde `Asignación` en menús, breadcrumb y títulos) muestra sitios regulares + `Sitio Temporal` (cuando está ON) y exige `SUM(días auditores) === días del sitio`.
- [ ] Alias `#/auditorias/asignacion` sigue redirigiendo limpiamente a `auditor`.
- [ ] Tests unitarios de `tiempo` y `asignacion` actualizados y pasando al 100%.
