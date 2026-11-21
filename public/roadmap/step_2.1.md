# Step 2.1 — Bloque 1 Header Hover Flyout, Breadcrumb In-Card y Wizard `+ Auditoría`

## 1. Objetivo y Alcance
Rediseñar completamente la navegación de primer nivel y contextual del **Bloque 1 (`Auditoría`)**, implementando los contratos de `public/prompting/future_changes.txt`:
1. Reordenar `AUDITORIAS_NAV_ITEMS` con **`Calendario`** y **`Vínculo`** al principio separados por una **línea divisora visual**, seguidos de `Designación`, `Tiempo`, `Auditor`, `Proceso`, `Turno`, `Resultado`, `Revisión` y `Resumen`.
2. Hacer que `Designación` abra sus 4 subsecciones (`Tipo`, `Fecha`, `Sitio`, `Temporal`) **hacia la derecha o izquierda en hover** dentro del menú de Bloque 1, y que **al mover el cursor fuera del Bloque 1 dichas subsecciones se oculten automáticamente** (al volver a hacer hover en Bloque 1 siempre inicia cerrado hasta volver a hacer hover en `Designación`).
3. Eliminar la barra superior externa (`renderAuditPipelineStepper` en `auditoriasView.ts`) e implementar el **Breadcrumb In-Card**, visible **exclusivamente dentro de la tarjeta principal de las Detail Views** de `1. Designación` .. `7. Revisión` y `Resumen` (nunca en Multi Views, ni en `Calendario`, ni en `Vínculo`), preservando la pareja `(selectedCertificateId, selectedAuditId)` entre saltos.
4. Incorporar el botón persistente **`+ Auditoría`** dentro de la tarjeta principal de las vistas basadas en Certificado y su **Modal Wizard de 3 Fases**.

---

## 2. Archivos y Áreas Afectadas
- `src/lib/healthCheck.ts` (reordenamiento y metadatos de `AUDITORIAS_NAV_ITEMS`)
- `src/lib/accessControl.ts` (nuevas rutas/aliases en `VALID_DOMAIN_SUBVIEWS` y `normalizeDomainSubview`: `designacion/fecha`, `auditor` alias `asignacion`, `proceso` alias `programa`, `turno`, `resumen`)
- `src/lib/breadcrumb.ts` (contrato puro del Breadcrumb In-Card del Bloque 1 y persistencia de selección de auditoría)
- **`src/lib/auditWizardDomain.ts` (nuevo):** lógica pura del Wizard de 3 fases (`+ Auditoría`)
- `src/views/header.ts` (flyout lateral izquierda/derecha en hover para `Designación`, línea divisora visual tras `Vínculo`, y auto-cierre en `mouseleave` de Bloque 1)
- `src/views/auditoriasView.ts` (retiro de `renderAuditPipelineStepper` externo y paso de `selectedCertId` / `selectedAuditId` compartidos + triggers de `+ Auditoría`)
- **`src/views/auditCardBreadcrumb.ts` (nuevo):** renderizador reutilizable del Breadcrumb In-Card + botón `+ Auditoría`
- **`src/views/auditWizardModal.ts` (nuevo):** popup interactivo de 3 fases para `+ Auditoría`
- `src/main.ts` (estado unificado de selección `selectedCertId` / `selectedAuditId` entre secciones del Bloque 1, listeners hover/mouseleave en header y handlers del Wizard)
- `src/lib/phase21NavigationShell.test.ts`, `src/lib/breadcrumb.test.ts`, **`src/lib/auditWizardDomain.test.ts` (nuevo)**

---

## 3. Tareas Detalladas de Implementación

### 3.1 Orden del Menú Bloque 1 y Hover Flyout en `header.ts`
- En `src/lib/healthCheck.ts` (`AUDITORIAS_NAV_ITEMS`):
  1. `calendar` (`Calendario`, 🗓️)
  2. `vinculo` (`Vínculo`, 🔗)
  3. Marcador/separador visual (`separatorAfter: true` o `group: 'general'` vs `'pipeline'`)
  4. `designacion` (`Designación`, 🧭) con `children`:
     - `designacion/tipo` (`Tipo`, 🏷️)
     - `designacion/fecha` (`Fecha`, 📅) **[NUEVO]**
     - `designacion/sitio` (`Sitio`, 📍)
     - `designacion/temporal` (`Temporal`, ⏱️)
  5. `tiempo` (`Tiempo`, ⏳)
  6. `auditor` (`Auditor`, 👥) *(antes `asignacion`)*
  7. `proceso` (`Proceso`, ⚙️) *(split de `programa`)*
  8. `turno` (`Turno`, 🕒) *(split de `programa`)*
  9. `resultado` (`Resultado`, 📊)
  10. `revision` (`Revisión`, ✅)
  11. `resumen` (`Resumen`, 📑) **[NUEVO]**
- En `src/views/header.ts`:
  - Renderizar `<div role="separator" class="my-1 border-t border-slate-200"></div>` justo después de `Vínculo` para distinguir secciones transversales (`Calendario`, `Vínculo`) de secciones de auditoría específica.
  - Para ítems con `children` (`Designación`), reemplazar el acordeón vertical clickeable por un **flyout lateral en hover**:
    - Panel posicionado a la derecha (`left-full top-0 pl-1`) con soporte de espejo a la izquierda (`right-full pr-1`) si el menú se acerca al borde derecho del viewport (clase calculada o `data-flyout-align="right|left"`), y soporte fallback en móviles/táctil (`sm:` debajo si ancho `< 640px`).
    - Mostrar solo mientras el puntero o foco esté sobre `[data-nested-group="designacion"]`.
    - En `src/main.ts` y mediante CSS `group/nested`: al dispararse `mouseleave` sobre `[data-header-dropdown="auditorias"]`, limpiar cualquier estado transitorio `openNestedMenu = null` para que al volver a entrar a Bloque 1 las subsecciones de `Designación` **siempre aparezcan cerradas** hasta hacer hover explícito sobre `Designación`.

### 3.2 Rutas y Compatibilidad (`accessControl.ts`)
- Actualizar `VALID_DOMAIN_SUBVIEWS.auditorias`:
  `['calendar', 'vinculo', 'designacion/tipo', 'designacion/fecha', 'designacion/sitio', 'designacion/temporal', 'tiempo', 'auditor', 'proceso', 'turno', 'resultado', 'revision', 'resumen']`
- En `normalizeDomainSubview('auditorias', sub)`:
  - `'designacion/fecha'` | `'fecha'` → `'designacion/fecha'`
  - `'auditor'` | `'asignacion'` → `'auditor'`
  - `'proceso'` | `'programa'` → `'proceso'`
  - `'turno'` → `'turno'`
  - `'resumen'` → `'resumen'`

### 3.3 Breadcrumb In-Card Exclusivo de Detail Views
- **Regla de visibilidad:** Eliminar `renderAuditPipelineStepper` fuera de la tarjeta en `auditoriasView.ts`. Renderizar `renderAuditCardBreadcrumb(...)` **dentro de la tarjeta principal (`detailTemplate.ts` / cabecera interna de cada Detail View)** **SOLO cuando hay un registro de certificado/auditoría abierto en Detail View** en las rutas:
  `designacion/*`, `tiempo`, `auditor`, `proceso`, `turno`, `resultado`, `revision`, `resumen`.
  Nunca en Multi Views, ni en `Calendario`, ni en `Vínculo`.
- **Estructura visual (espacio compartido con separación visual para `Resumen`):**
  - Contenedor flex compacto (`bg-slate-50 border border-slate-200 rounded-xl p-1.5 flex flex-wrap items-center justify-between gap-2`):
    - Grupo Izquierdo (track secuencial 1–7):
      - `1. Designación` *(en hover expande hacia la derecha mostrando en línea `Tipo | Fecha | Sitio | Temporal`; no visible en reposo salvo la subsección activa si el usuario está dentro de `1. Designación`, o indicador sutil del sub-paso activo)*
      - `2. Tiempo`
      - `3. Auditor`
      - `4. Proceso`
      - `5. Turno`
      - `6. Resultado`
      - `7. Revisión`
    - Grupo Derecho (visualmente separado con divisor vertical / margen derecho):
      - `Resumen` *(botón destacado fuera de la numeración 1–7)*.
- **Persistencia de contexto `(selectedCertId, selectedAuditId)`:**
  - Introducir un estado central en `AuditoriasViewState` (`selectedCertId: string | null`, `selectedAuditId: string | null`) compartido/sincronizado al entrar a cualquier Detail View basada en Certificado y al usar el selector de auditoría o flechas `◀ / ▶`.
  - Cuando el usuario cambia a una auditoría antigua en cualquier paso (ej. en `1. Designación → Tipo`) y hace clic en otro ítem del Breadcrumb In-Card (ej. `Sitio`, `Tiempo`, `Resumen`), `handleAuditBreadcrumbNavigate` conserva el mismo `selectedCertId` y `selectedAuditId` y abre la Detail View de destino directamente posicionada en esa misma auditoría antigua.
  - Si cambia a un certificado sin `selectedAuditId` o entra desde una Multi View limpia, selecciona automáticamente la auditoría más reciente de ese certificado.

### 3.4 Botón Persistente `+ Auditoría` y Modal Wizard de 3 Fases
- Colocar el botón **`+ Auditoría`** (`data-action="open-add-audit-wizard"`, visible para `ADMIN`/`WORKER`) de forma persistente dentro de la tarjeta principal (en el header de las Multi Views y en la cabecera de las Detail Views de secciones `1..7` y `Resumen`, pero no duplicando botones dentro de `<tbody>`).
- **Modal Wizard (`auditWizardDomain.ts` + `auditWizardModal.ts`):**
  - **Fase 1 (`Conglomerado` / `Organización`):**
    - Selector de `Conglomerado` y selector complementario de `Organización`:
      - Si se elige un `Conglomerado`, la lista de organizaciones se actualiza automáticamente a sus miembros (y viceversa: si se elige una `Organización` primero, resuelve/preselecciona su `Conglomerado` contenedor).
  - **Fase 2 (`Vínculo`):**
    - Consulta los vínculos (`vinculo_certificado`) asociados a los certificados del `Conglomerado` seleccionado:
      - Si tiene **exactamente 1 vínculo**, lo **autoselecciona** y muestra resumen de sus certificados (pudiendo avanzar directo).
      - Si tiene **más de 1 vínculo**, muestra radio-cards/lista seleccionable con etiqueta, naturaleza y certificados que incluye.
      - Si tiene **0 vínculos**, bloquea el avance mostrando mensaje guiado: *"Este conglomerado aún no tiene un Vínculo configurado (o no posee certificados). Dirígete a Certificación → Certificado o a Auditoría → Vínculo para agrupar sus certificados antes de programar la auditoría."* + botones de acceso rápido (`Ir a Vínculo` / `Ir a Certificado`).
  - **Fase 3 (`Tipo de Auditoría por Certificado`):**
    - Lista cada certificado perteneciente al `Vínculo` elegido (código, norma, organización titular — cero UUIDs) con un `<select>` de `Tipo de Auditoría` (`Etapa 1`, `Etapa 2`, `Seguimiento 1`, `Seguimiento 2`, `Renovación`, etc.) y un botón auxiliar opcional para copiar el mismo tipo al resto de certificados del vínculo.
  - **Guardado Atómico (`submitAuditWizardBatch`):**
    - Crea el `programa_auditoria` maestro asociado al `id_vinculo` y genera en lote las N `auditoria`s vinculadas entre sí con sus respectivos tipos (`id_tipo_auditoria`), todo bajo una sola acción transaccional.
    - Al finalizar con éxito, cierra el modal, recarga estado y redirige inmediatamente a **`Designación → Tipo` Detail View** posicionada en el primer certificado/auditoría recién creada (mostrando todo el lote recién creado).

---

## 4. Lista de Verificación
- [ ] Menú Bloque 1 muestra: `Calendario`, `Vínculo`, separador visual, `Designación > (Tipo, Fecha, Sitio, Temporal)`, `Tiempo`, `Auditor`, `Proceso`, `Turno`, `Resultado`, `Revisión`, `Resumen`.
- [ ] Hover en `Designación` despliega lateralmente; salir de Bloque 1 colapsa las subsecciones sin recordar apertura anterior.
- [ ] Breadcrumb In-Card ausente en Multi Views, `Calendario` y `Vínculo`; presente dentro de la tarjeta principal en todas las Detail Views `1..7` + `Resumen`.
- [ ] Cambiar a una auditoría antigua en `Tipo` y saltar a `Sitio` o `Resumen` conserva esa misma auditoría antigua seleccionada.
- [ ] Botón `+ Auditoría` completa el Wizard de 3 fases (autoseleccionando vínculo único, guiando si 0 vínculos) y aterriza en `Designación → Tipo` Detail View con todas las auditorías vinculadas creadas.
- [ ] Pruebas unitarias en `phase21NavigationShell.test.ts`, `breadcrumb.test.ts`, `auditWizardDomain.test.ts` y build verde.
