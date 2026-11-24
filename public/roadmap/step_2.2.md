# Paso 2.2: Navegación en Bloque 2 e Interfaz Minimalista de `Vínculo`

## Objetivo del Paso
Mover `'Vínculo'` al menú de **Bloque 2 `Certificación`** (justo debajo de `'Certificado'`), rediseñar completamente `src/views/vinculoView.ts` bajo estética **"Less Is More"** (2 zonas en Detalle, cajas limpias en modo lectura, pop-up modal con cajas colapsadas/expandibles para asignar certificados `LIBRE`) y cablear sus handlers y persistencia en `src/main.ts`.

---

## Archivos Afectados
- `src/lib/healthCheck.ts` (`CERTIFICACION_NAV_ITEMS`)
- `src/lib/accessControl.ts` (`VALID_DOMAIN_SUBVIEWS` y `normalizeDomainSubview`)
- `src/views/certificacionView.ts` (enrutar `activeSub === 'vinculo'`)
- `src/views/vinculoView.ts`
- `src/views/vinculoView.test.ts`
- `src/main.ts` (handlers de Bloque 2 `Vínculo`, apertura del modal desde `LIBRE`, toggle expandir/colapsar cajas en modal, guardar override de naturaleza, desvincular vía `archive_record` sin bloqueo por auditorías, preservación de scroll `runWithPlannerPreservedViewport`)

---

## Cambios Técnicos Detallados

### 1. Navegación y Control de Acceso (`healthCheck.ts`, `accessControl.ts`, `certificacionView.ts`)
- En `CERTIFICACION_NAV_ITEMS` (`src/lib/healthCheck.ts`):
  - Insertar `{ id: 'vinculo', label: 'Vínculo', icon: 'link', subroute: '#/certificacion/vinculo' }` **inmediatamente debajo de `certificates`** y antes de `auditors`.
  - *(Nota: no eliminar aún `#/auditorias/vinculo` hasta completar el Paso 3.1/3.2 de `Relación`, o redirigir suavemente rutas antiguas si existen; en Bloque 2 ya vive oficialmente `#/certificacion/vinculo`).*
- En `src/lib/accessControl.ts`:
  - Añadir `'vinculo'` a `VALID_DOMAIN_SUBVIEWS.certificacion`.
  - Mantener la regla de `getVisibleDomainMenus`: `AUDITOR` **no** ve Bloque 2 (`certificacion`) y `canAccessDomainSubview` bloquea `'certificacion'`/`'vinculo'` para `AUDITOR`.
- En `src/views/certificacionView.ts`:
  - Agregar soporte para `activeSub === 'vinculo'` delegando a `renderVinculoView(...)` con los datos del estado.

### 2. Rediseño Minimalista de `src/views/vinculoView.ts` ("Less Is More")
1. **Multi View (por `Conglomerado`):**
   - Usar `renderUniversalTemplate` con tabla `table-fixed` y `<colgroup>` cuya suma exacta sea **`100%`** y **cero `<button>` dentro de `<tbody>`** (las filas navegan por `data-action="select-vinculo-conglomerado"` sobre `<tr>`, y el modo Grid muestra tarjetas limpias de conglomerado).
   - Mostrar el nombre corto del conglomerado (`resolveShortConglomeradoName`), cantidad de cajas agrupadoras, certificados vinculados y certificados `LIBRE`.
2. **Detail View (Layout limpio en 2 Zonas — Cero ruido explicativo):**
   - Cabecera compacta con el nombre corto del conglomerado y botón `+ Nueva Caja` (solo `ADMIN`/`WORKER`). Sin banners largos, sin botones `+ Auditoría` ni `⚡ Generar Auditoría`, sin enlaces `Abrir Resumen →`.
   - **Zona Superior (`Certificados LIBRE`):**
     - Lista compacta o rejilla minimalista de los certificados no asignados del conglomerado.
     - Cada tarjeta/fila muestra únicamente lo esencial: número de certificado, norma y empresa corta (`resolveShortOrganizacionName`).
     - Para `ADMIN`/`WORKER`, hacer clic en un certificado `LIBRE` abre el **Pop-up Modal de Asignación** (`data-action="open-vinculo-assign-modal"`).
   - **Zona Inferior (`Cajas Agrupadoras`):**
     - Rejilla de tarjetas limpias, una por cada caja `vinculo` activa del conglomerado.
     - **En modo lectura (NO edición):** La tarjeta de la caja muestra **únicamente el nombre/etiqueta limpio** de la caja (ej. `Planta Turmero`), el ícono discreto de editar (`✎`, solo staff) y la lista compacta de certificados miembros. No mostrar párrafos descriptivos, códigos internos, metadatos ni etiquetas redundantes. Si algún certificado tiene override de naturaleza distinto al predeterminado, mostrar únicamente un badge discreto con su naturaleza efectiva; si hereda, mantenerlo ultra limpio.
     - **En modo edición (botón editar caja):** Habilita inputs limpios para **Etiqueta** + **Naturaleza predeterminada (`tipo_vinculacion`)**, selector compacto por certificado miembro para sobreescribir su naturaleza (`Heredar` o naturaleza específica), botón `Desvincular` por certificado (devuelve a `LIBRE`) y botón `Archivar caja` (cuando corresponda, vía `archive_record`).
     - Recordar la regla: si el certificado ya está en otra caja, no existe selector directo de "mover a caja X"; primero se desvincula a `LIBRE` y luego se asigna desde la Zona Superior.
3. **Pop-up Modal de Asignación (`renderVinculoAssignModal`):**
   - Al hacer clic en un certificado `LIBRE`, se abre modal limpio centrado.
   - Lista las cajas existentes del conglomerado **colapsadas por defecto**: cada fila muestra **Etiqueta de caja** + **Naturaleza predeterminada**, botón toggle `▸`/`▾` (`data-action="toggle-assign-modal-box"`) para expandir/colapsar y ver los certificados contenidos dentro de esa caja, y botón `Asignar aquí` (`data-action="confirm-assign-cert-to-box"`).
   - Incluye opción rápida inline para crear una nueva caja (`Etiqueta` + `Naturaleza`) y asignar el certificado en un solo paso si no existe la caja deseada.

### 3. Wiring y Persistencia en `src/main.ts`
- Envolver renders locales de `Vínculo` con `runWithPlannerPreservedViewport`.
- Conectar handlers de:
  - Crear/editar caja (`vinculo` insert/update).
  - Abrir/cerrar pop-up de asignación desde `LIBRE`, expandir/colapsar cajas en modal y asignar (`vinculo_certificado` insert/restore).
  - Cambiar `tipo_vinculacion_override` por certificado en modo edición (`vinculo_certificado` update).
  - Desvincular certificado (`supabase.rpc('archive_record', { p_table: 'vinculo_certificado', ... })`) y archivar caja (`archive_record` sobre `vinculo`), verificando mensajes en español sin UUIDs (`formatZeroUuidError`).

### 4. Pruebas (`src/views/vinculoView.test.ts` + `src/lib/accessControl.test.ts`)
- Verificar `CERTIFICACION_NAV_ITEMS` incluye `'vinculo'` inmediatamente debajo de `'certificates'`.
- Verificar que en `vinculoView.ts`:
  - Multi View suma `100%` en `<colgroup>` y tiene `0 <button>` en `<tbody>`.
  - Detail View contiene Zona Superior `LIBRE` + Zona Inferior Cajas Agrupadoras, sin botones de Bloque 1 (`+ Auditoría` / `Generar Auditoría`).
  - Modo lectura no renderiza formulario ni ruido redundante en la tarjeta de la caja; modo edición expone `Etiqueta`, `Naturaleza`, override por certificado y `Desvincular`.
  - Pop-up de asignación renderiza cajas colapsadas por defecto y despliega miembros al expandir.
- Verificar en `accessControl.test.ts` que `AUDITOR` no accede a `certificacion/vinculo` y `CLIENT` solo lectura.

---

## Criterios de Aceptación y Verificación
- `npm test -- src/views/vinculoView.test.ts src/lib/accessControl.test.ts` pasa al 100%.
- `npx tsc --noEmit`, `npm run lint` y `npm run build` pasan sin errores ni warnings nuevos.
- Cero `: any`, cero UUIDs visibles, cero `.delete()`, 100% español.
