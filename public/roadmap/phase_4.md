# Fase 4: Simplificación de Pestañas `Fecha` y `Contacto` en la Zona de Hijos

**Archivos Objetivo:**
- `src/views/certificadoView.ts`
- `src/lib/multisiteSampling.ts`
- `src/main.ts`

---

## 1. Objetivo de la Fase

Limpiar las pestañas **`Fecha`** y **`Contacto`** dentro del Detail View de `Certificado` para que exhiban **únicamente su tabla de datos** (`renderListViewTable`), eliminando textos introductorios, botones superiores de creación y formularios/previews inline dentro de dichas pestañas.

---

## 2. Tareas Detalladas

### 2.1 Limpieza de `renderFechasChildTab` en `src/views/certificadoView.ts`
1. **Eliminar `staffToolbarHtml`:**
   - Suprimir el texto introductorio `"Hitos cronológicos y vigencia del certificado"`.
   - Suprimir el botón **`+ Registrar Fecha`** (`[data-action="open-create-fecha"]`).
2. **Eliminar `createFormHtml` y `previewHtml`:**
   - Suprimir el formulario inline `#createFechaCertForm` y el banner `#close-fecha-preview` dentro de la pestaña.
3. **Retornar únicamente la tabla de datos:**
   - Simplificar la firma y retorno de `renderFechasChildTab(fechas, certId, sortState, columnWidths)` para devolver directamente `renderListViewTable({ tableId: 'cert-tab-fechas', ... })`.
   - Mantener intactas las columnas ordenables/redimensionables (`Tipo de Fecha`, `Fecha`, `Referencia Temporal`), el estado vacío (`Sin fechas registradas`) y el atributo de fila clickeable `data-action="select-fecha-detail"` para continuar permitiendo inspeccionar el detalle de una fecha existente (`fechaView.ts`).

### 2.2 Limpieza de `renderContactosChildTab` en `src/views/certificadoView.ts`
1. **Eliminar `staffToolbarHtml`:**
   - Suprimir el texto introductorio `"Personas de contacto autorizadas por la organización"`.
   - Suprimir el botón **`+ Agregar Contacto`** (`[data-action="open-create-contacto"]`).
2. **Eliminar `createFormHtml` y `previewHtml`:**
   - Suprimir el formulario inline `#createContactoCertForm` y el bloque `#close-contacto-preview` dentro de la pestaña.
3. **Retornar únicamente la tabla de datos:**
   - Simplificar la firma y retorno de `renderContactosChildTab(contactos, certId, sortState, columnWidths)` para devolver directamente `renderListViewTable({ tableId: 'cert-tab-contactos', ... })`.
   - Mantener intactas las columnas ordenables/redimensionables (`Nombre Completo`, `Cargo / Rol`, `Teléfonos`, `Correos Electrónicos`), el estado vacío (`Sin contactos registrados`) y el atributo de fila clickeable `data-action="select-contacto-detail"` hacia `contactoView.ts`.

### 2.3 Poda de Estado y Manejadores Obsoletos (`multisiteSampling.ts`, `certificacionView.ts`, `main.ts`)
1. En `src/lib/multisiteSampling.ts`:
   - Retirar de `CertificadoViewState` los campos ya sin uso (`isCreatingFecha`, `fechaErrorMessage`, `isCreatingContacto`, `contactoErrorMessage`, `previewFechaId`, `previewContactoId`).
2. En `src/views/certificacionView.ts` y `src/main.ts` (`state.certificadoDomain` inicial y reset):
   - Eliminar la asignación de esas 6 propiedades obsoletas.
3. En `src/main.ts`:
   - Eliminar los event listeners huérfanos de las pestañas del certificado: `[data-action="open-create-fecha"]`, `[data-action="close-create-fecha"]`, `[data-action="close-fecha-preview"]`, `#createFechaCertForm`, `[data-action="open-create-contacto"]`, `[data-action="close-create-contacto"]`, `[data-action="close-contacto-preview"]`, `#createContactoCertForm`.
   - Conservar intactos `[data-action="select-fecha-detail"]`, `[data-action="select-contacto-detail"]`, y la creación/edición dentro de las fichas propias de `contactoView.ts` (teléfonos y correos) y `fechaView.ts`.

---

## 3. Criterios de Verificación de la Fase 4

- Al abrir la pestaña `Fecha` en `Certificado`, el HTML de la pestaña contiene únicamente la tabla `cert-tab-fechas` (o su empty state), sin `Hitos cronológicos y vigencia del certificado`, sin `+ Registrar Fecha` y sin `#createFechaCertForm`.
- Al abrir la pestaña `Contacto` en `Certificado`, el HTML de la pestaña contiene únicamente la tabla `cert-tab-contactos` (o su empty state), sin `Personas de contacto autorizadas por la organización`, sin `+ Agregar Contacto` y sin `#createContactoCertForm`.
- Hacer clic sobre una fila de `Fecha` o `Contacto` sigue abriendo sus fichas de detalle respectivas sin regresiones.
