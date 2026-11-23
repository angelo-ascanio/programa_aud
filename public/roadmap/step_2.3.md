# Step 2.3 — Wiring en `main.ts`, Paridad de Sitios Compartidos en `loadLiveAudits` y Sincronización Aguas Abajo

**Pilar:** 2 (`Auditoría > Designación > Sitio` Overhaul e Integración de Sitios Compartidos)  
**Dependencias:** `step_2.1.md`, `step_2.2.md`  
**Objetivo:** Conectar la nueva UI y dominio de `Designación → Sitio` en `src/main.ts`, corregir la resolución de `numero_sitio` para sitios compartidos al hidratar `sitios_por_auditoria`, gestionar el estado de colapso/filtros/ordenamiento sin pérdida de foco ni scroll, y verificar paridad total aguas abajo (`Temporal`, `Tiempo`, `Proceso`, `Turno`).

---

## 1. Archivos a Modificar / Verificar

- `src/main.ts`
- Verificación de compatibilidad (solo ajuste si se detecta brecha con `numero_sitio` compartido):
  - `src/lib/tiempoDomain.ts`
  - `src/lib/programaProcesosDomain.ts`
  - `src/lib/programaTurnosDomain.ts`
- Tests de integración/dominio correspondientes si se ajusta algún helper.

---

## 2. Especificación Técnica Detallada

### 2.1 Corrección Crítica de `numero_sitio` para Sitios Compartidos en `loadLiveAudits()` (`src/main.ts`)
En `src/main.ts` (~línea `32553`, dentro de `loadLiveAudits()`):
- **Problema detectado:** Actualmente `sitios_por_auditoria` lee `numero_sitio: Number(sitioObj?.numero_sitio ?? 0)` directamente desde la tabla maestra `sitio`. Cuando un sitio es `Sitio 0 (HQ)` en el Certificado A (`sitio.numero_sitio = 0`) pero se comparte al Certificado B en `sitio_certificado_compartido` con `numero_sitio = 2` (o viceversa, sucursal `#1` compartida como `Sitio 0 HQ` en destino), `audit.sitiosPlan` queda con un `numero_sitio` incorrecto, rompiendo el orden y el candado de `Sitio 0 (HQ)`!
- **Solución exacta en `loadLiveAudits()`:**
  1. En la consulta paralela de `loadLiveAudits()`, consultar `sitio_certificado_compartido` (`select('id_sitio, id_certificado, numero_sitio').is('deleted_at', null)`), o construir un mapa `${certId}::${sitioId} -> numero_sitio` usando los registros activos (y el mapa `auditCertByAuditId` desde `auditsRes`).
  2. Al construir cada `AuditoriaSitioPlanItem`:
     ```ts
     const certIdForAudit = auditCertByAuditId.get(auditId) || '';
     const sharedNumeroOverride = sharedNumeroByCertSitio.get(`${certIdForAudit}::${sitioId}`);
     const effectiveNumeroSitio =
       sharedNumeroOverride !== undefined
         ? sharedNumeroOverride
         : Number(sitioObj?.numero_sitio ?? 0);
     ```
  3. Lo mismo al insertar/hidratar optimísticamente en `toggleSiteInAudit()` (~líneas `36238–36264`) y `upsertSitioAuditoria()`: buscar `hqSite` y `numero_sitio` dentro de `certDetail.sitios` (que ya viene resuelto por certificado con el `numero_sitio` de `sitio_certificado_compartido`!).
  - De este modo, si un sitio compartido es `Sitio 0` en el cert A y `#3` en el cert B, en cert B se comporta como sucursal `#3` seleccionable/deseleccionable; y si es `Sitio 0` en cert B, recibe el candado obligatorio HQ en cert B.

### 2.2 Inicialización y Reseteo Limpio del Estado en `src/main.ts`
En las transiciones de entrada a `designacion/sitio` (`~12510` y `~24575` en `src/main.ts`):
- Al cambiar de certificado o entrar desde Multi View / Breadcrumb a `designacion/sitio`:
  - Preservar la regla **"colapsado por defecto"** (`isSitePanelExpandedByAuditId: {}` o limpiar entrada al entrar desde Multi View, manteniendo expansión mientras el usuario interactúa con checkboxes/filtros/ordenamiento dentro de la misma auditoría!).
  - Restablecer o conservar defaults seguros: `detailFilterMode = 'ALL'`, `notAuditedLastN = 1`, `detailSortMode = 'SITE_NUMBER'`, `detailSearchQuery = ''`.

### 2.3 Bindings DOM en `src/main.ts` (Sección `DOMAIN AUDITORÍA — DESIGNACIÓN -> SITIO`, ~línea `13010`)
Conectar de forma reactiva y con preservación de scroll (`runWithPlannerPreservedViewport` o enfoque suave cuando aplique):
1. **`[data-action="toggle-sitio-panel-collapse"]` (`click`):**
   - Alterna `state.designacionSitioDomain.isSitePanelExpandedByAuditId[auditId]`.
   - Si el click provino de `[data-action="open-sitio-coverage-modal"]` dentro del header, detener propagación (`e.stopPropagation()`) para abrir el modal sin alternar involuntariamente el colapso.
2. **`#sitioDetailFilterSelect` / `[data-action="change-sitio-detail-filter"]` (`change`):**
   - Valida contra los valores permitidos de `SitioDetailFilterMode` (`ALL`, `SELECTED`, `UNSELECTED`, `LINK_SELECTED`, `NOT_AUDITED_LAST_N`, `SHARED_ONLY`, `UNVISITED_CYCLE`).
   - Si cambia a `NOT_AUDITED_LAST_N` y `notAuditedLastN` no es finito, fija `1`.
   - Re-renderiza preservando posición del viewport.
3. **`#sitioNotAuditedLastNInput` / `[data-action="change-sitio-last-n"]` (`input` / `change`):**
   - Parsea entero `Math.max(0, Math.trunc(Number(val)))` (si el campo queda temporalmente vacío mientras escribe, tratar suavemente en `input` o normalizar a `0`/`1` en `change` sin perder el cursor!).
   - *Nota UX importante:* Si se re-renderiza completo en cada tecla de `#sitioNotAuditedLastNInput` o `#sitioDetailQuickSearch`, restaurar el foco y la selección al final del input (`focus()` + `setSelectionRange`) o actualizar quirúrgicamente la grilla de sitios y el contador `Mostrando X de Y` (y re-enlazar checkboxes `toggle-step4-site`) para una experiencia instantánea de 60fps con 80 sitios.
4. **`#sitioDetailSortSelect` / `[data-action="change-sitio-detail-sort"]` (`change`):**
   - Valida `SitioDetailSortMode` y re-renderiza.
5. **`[data-action="reset-sitio-detail-filters"]` (`click`):**
   - Reinicia `detailFilterMode = 'ALL'`, `detailSearchQuery = ''` y re-renderiza.
6. **Checkboxes `input[data-action="toggle-step4-site"]`:**
   - Mantienen exactamente el flujo de `toggleSiteInAudit(auditId, siteId, saId)`, verificando que al marcar o desmarcar un sitio compartido:
     - Se persiste en `sitios_por_auditoria` (`upsertSitioAuditoria` / `archiveSitioAuditoria`),
     - Se refleja en `recomputeLocalAuditPlanningDerivedState()` y `refreshCoverageCachesForCert()`,
     - Al navegar inmediatamente a `Temporal`, `Tiempo`, `Proceso` (`#/auditorias/proceso`) o `Turno` (`#/auditorias/turno`), el sitio compartido aparece con su `numero_sitio` efectivo, sus `procesos_por_sitio` del certificado y sus turnos hidratados.

---

## 3. Checklist de Implementación

1. [ ] Corregir `loadLiveAudits()` en `src/main.ts` para resolver `numero_sitio` de `sitiosPlan` considerando overrides de `sitio_certificado_compartido`.
2. [ ] Verificar y ajustar `toggleSiteInAudit()` / `upsertSitioAuditoria()` en `src/main.ts` para preservar `numero_sitio` efectivo de sitios compartidos al actualizar estado optimista local.
3. [ ] Limpiar/inicializar `isSitePanelExpandedByAuditId`, `detailFilterMode`, `notAuditedLastN`, `detailSortMode` y `detailSearchQuery` en las transiciones de navegación de `src/main.ts`.
4. [ ] Añadir los event listeners de colapso, filtro, input entero `N`, ordenamiento, búsqueda rápida y reset de filtros en `src/main.ts`, asegurando preservación de foco/cursor y scroll.
5. [ ] Verificar interoperabilidad de sitios compartidos en `tiempoDomain.ts`, `programaProcesosDomain.ts` y `programaTurnosDomain.ts` (y añadir test de regresión si se ajusta algún detalle).

---

## 4. Criterios de Verificación y Aceptación

- **Tests relevantes (`node:test`):**
  ```bash
  npx tsx --test \
    src/lib/designacionSitioDomain.test.ts \
    src/views/designacionSitioView.test.ts \
    src/lib/tiempoDomain.test.ts \
    src/lib/programaProcesosDomain.test.ts \
    src/lib/programaTurnosDomain.test.ts
  ```
- **Aserciones clave:**
  - Un sitio compartido (`sitio_certificado_compartido`) marcado en `Designación → Sitio` persiste en `sitios_por_auditoria`, aparece con su `numero_sitio` asignado en el certificado destino, y habilita asignación de tiempo (`Tiempo`), procesos (`Proceso`) y turnos (`Turno`) sin errores RLS ni de trigger.
  - Al cambiar `N` en `NOT_AUDITED_LAST_N` o escribir en búsqueda rápida, no se pierde el foco del input ni salta el scroll.
  - Compilación y lint limpios (`npm run lint && npm run build`).
