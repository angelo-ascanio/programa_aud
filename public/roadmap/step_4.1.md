# Paso 4.1 — Rediseño Unificado del Template de Vista Detalle ("Less Is More": Zona 1 Datos + Zona 2 Selectores en 1 Fila)

## 1. Objetivo
Rediseñar el shell compartido de Vista Detalle de todo **Bloque 1 (`Auditoría`)** (`auditSectionShell.ts`, `detailTemplate.ts`, `certificateAuditSelector.ts`, `auditCardBreadcrumb.ts`) siguiendo exactamente la estructura de 3 zonas descrita en `future_changes.txt`:
1. **Zona 1 — Zona de Datos Compacta** (reemplaza la vieja cabecera repetitiva): información esencial del certificado, organización, auditoría y sección sin duplicar datos ni fechas.
2. **Zona 2 — Fila Única de Selectores**: selector compacto de auditorías (`"2026-01 Renov."`) + selector **condicional** de certificados vinculados (`"FN-SST-2025-010"`, visible solo si la auditoría vinculada tiene >1 certificado) en **una misma fila**.
3. **Zona 3 — Core de Dominio**: validar el acoplamiento limpio del nuevo shell sobre `1.1 Relación`, `1.2 Tipo`, `1.3 Fecha`, `1.4 Sitio` y `Resumen`.

---

## 2. Archivos Involucrados
- `src/lib/certificateAuditSelector.ts` (nuevo formateador compacto `formatCompactAuditSelectorOptionLabel` → `"YYYY-MM ShortTipo"`, p. ej. `"2026-01 Renov."`; etiquetas simples de certificados vinculados `"FN-SST-2025-010"`)
- `src/views/auditCardBreadcrumb.ts` (eliminar cualquier tira/selector redundante debajo de la barra de pasos cuando `renderAuditSectionShell` ya provee Zona 2, manteniendo solo los pasos in-card `1. Designación > {Relación|Tipo|Fecha|Sitio|Temporal} .. 7. Revisión | Resumen`)
- `src/views/detailTemplate.ts` (soportar cabecera/zona de datos unificada sin duplicación de título + subtítulo + zona padre)
- `src/views/auditSectionShell.ts` (refactor completo hacia el nuevo Template Unificado Zonas 1, 2 y 3 para TODAS las secciones de Bloque 1)
- `src/views/relacionView.ts`, `src/views/designacionTipoView.ts`, `src/views/designacionFechaView.ts`, `src/views/designacionSitioView.ts`, `src/views/resumenView.ts` (adoptar props limpias del nuevo shell, pasando solo los datos/badges específicos de dominio no redundantes)
- `src/main.ts` (handler unificado de cambio en `<select>` de certificados vinculados en Zona 2: `data-action="select-linked-sibling-select"`)
- Tests asociados (`certificateAuditSelector.test.ts`, `auditDetailViews.test.ts`, `detailViewsPhase42.test.ts`, `designacionTipoView.test.ts`, `designacionSitioView.test.ts`, `phase62UiIntegrity.test.ts`)

---

## 3. Especificación Técnica Detallada

### 3.1. Zona 1 — Zona de Datos Compacta (Cero Repeticiones)
- Reemplaza el bloque antiguo donde convivían título duplicado, `versionChipHtml`, `orgAbrevChipHtml`, fechas repetidas y subtítulos largos:
  - **Botón `Volver`** + título breve de la sección (ej. `🏷️ Tipo`) en la barra superior mínima junto a las acciones a la derecha: **`+ Auditoría`** y **`Historial de Cambios`** (y acciones específicas extra si el dominio las necesita, como `Plazos NC`).
  - **Fila de Datos Esenciales (compacta, `py-2 px-3`):**
    1. **Botón Organización (`abreviacion`):** `<button data-parent-nav="true" data-parent-type="org" data-entity-id="...">` mostrando exclusivamente `orgAbrev` (o nombre corto resuelto si no tiene abreviación), con `title="Organización: <Nombre Completo>"`. **Prohibido mostrar también el nombre completo al lado.** Al hacer clic navega a la Vista Detalle de la Organización.
    2. **Botón Certificado con Versión Integrada:** `<button data-parent-nav="true" data-parent-type="cert" data-entity-id="...">` mostrando **`${certNumero}${versionNumero ? ` v${versionNumero}` : ''}`** (ej. `📜 FN-EMS-2025-002 v2`). **Eliminar el chip `v2` separado fuera del botón.** Tooltip: `"Certificado: <numero> · Norma: <norma_codigo>"`. Al hacer clic navega al detalle del Certificado.
    3. **Datos/badges contextuales esenciales (sin redundancia):**
       - Estado del certificado (`Activo`, `En Estudio`, etc.) con tooltip `title="Estatus del Certificado: <Valor>"`.
       - Estado de ciclo / código de auditoría (`AUD-...`) / código de programa (`PROG-...`, solo si es vinculada) / norma si no está ya evidente / fecha programada **una sola vez** (nunca repetir fecha en codename + fecha aparte) —**todo valor o badge sin etiqueta de texto visible DEBE tener `title="<Nombre del Campo>: <Valor>"`**.
       - Alcance en 1 línea truncada con tooltip `"Alcance: <texto completo>"` (o badge `"Sin alcance"` con tooltip explicativo) si aporta al dominio, sin inflar verticalmente la Zona 1.

### 3.2. Zona 2 — Fila Única de Selectores (`Auditoría` + `Certificados Vinculados`)
- Justo debajo de Zona 1, en **una sola fila flex/grid responsive** (`flex flex-wrap items-center gap-2`):
  1. **Selector 1 — Auditorías del certificado (históricas y actual):**
     - Controles `◀` `<select data-action="select-section-audit">` `▶` + indicador compacto (`1/3`).
     - Etiquetas de `<option>` **cortas y precisas**: usar `formatAuditCodename(aud)` (ej. **`2026-01 Renov.`**, **`2028-11 Renov.`**, **`2025-06 Seg.1`**) —eliminar completamente cadenas largas como `"2026-01 Renov. · v2 · Renovación · 25/01/2026 - 28/01/2026 (Prog. #1) · Vinculada · Combinada(2)"`.
     - El tooltip `<select title="...">` conserva el detalle ampliado al pasar el cursor (`getAuditCodenameTooltip`).
  2. **Selector 2 — Certificados vinculados (ESTRICTAMENTE CONDICIONAL):**
     - Se renderiza **únicamente** cuando `linkedSiblings.length > 1` (auditoría vinculada con más de 1 certificado). **Si la auditoría es individual (`<= 1` certificado), este `<select>` NO se renderiza en el DOM.**
     - Etiqueta limpia y directa por `<option>`: **`${sib.audit.numero_certificado}`** (ej. **`FN-SST-2025-010`**; solo añadir abreviación si es `Multientidad` con distintos clientes y el usuario necesita distinguirlos en tooltip, manteniendo el texto de opción ultra limpio).
     - Al cambiar el `<select data-action="select-linked-sibling-select">`, cambia el `(selectedCertId, selectedAuditId)` al certificado hermano seleccionado sin salir de la sección actual.
- Eliminar la antigua fila separada de botones-pill (`data-linked-siblings-bar` con múltiples `<button>`) y eliminar la barra `contextStripHtml` duplicada en `auditCardBreadcrumb.ts` cuando el shell la renderiza.

### 3.3. Adopción en Secciones Base (`Relación`, `Tipo`, `Fecha`, `Sitio`, `Resumen`)
- Configurar `auditSectionShell.ts` con este nuevo diseño como el **estándar único** para todo Bloque 1 (sin modos duales divergentes).
- Verificar `1.1 Relación`, `1.2 Tipo` (1:1), `1.3 Fecha` (N:1), `1.4 Sitio` (1:N) y `Resumen` asegurando que no quede ningún texto repetido entre Zona 1, Zona 2 y Zona 3.

---

## 4. Criterios de Aceptación
1. En Zona 1: botón Org muestra solo abreviación (tooltip `"Organización: <Nombre Completo>"`), botón Certificado integra la versión (`FN-EMS-2025-002 v2`), sin fechas repetidas, sin nombre+abreviación duplicados, con `+ Auditoría` e `Historial de Cambios` a la derecha, y tooltips con nombre de campo en todo badge/dato sin etiqueta.
2. En Zona 2: selector de auditorías y selector de certificados vinculados conviven en **una sola fila**; opciones de auditoría son breves (`"2026-01 Renov."`), opciones de certificados vinculados son limpias (`"FN-SST-2025-010"`), y el segundo `<select>` **desaparece** en auditorías individuales.
3. Hacer clic en Org abre detalle de Organización; hacer clic en Certificado abre detalle de Certificado; cambiar en ambos `<select>` mantiene sincronizada la sección activa.

---

## 5. Verificación
- `npx tsx --test src/lib/certificateAuditSelector.test.ts src/lib/auditDetailViews.test.ts src/lib/detailViewsPhase42.test.ts src/lib/designacionTipoView.test.ts src/lib/designacionSitioView.test.ts src/lib/phase62UiIntegrity.test.ts`
- `npx tsc --noEmit && npm run lint && npm run build`
