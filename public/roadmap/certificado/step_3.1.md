# Step 3.1: Sub-Entity Detail Views (`Fecha`, `Contacto`, `Telefono`, `Email`)

## 1. Objetivo

Construir las cuatro fichas de detalle dedicadas para las nuevas sub-entidades del dominio `certificado` siguiendo la **plantilla universal de 3 zonas (`renderDetailPageTemplate`)**, garantizando navegación bidireccional por breadcrumbs, edición inline con validación estricta, administración de hijos en `Contacto` y gobernanza de archivo lógico con bloqueo de dependencias y bitácora forense (`audit_log`).

---

## 2. Arquitectura de Navegación y Breadcrumbs

```text
Certificación > Certificado > [N° Certificado]
 ├── (Tab Fecha)    > Fecha: [Tipo · YYYY-MM-DD]        (`fechaView.ts`)
 └── (Tab Contacto) > Contacto: [Nombre Completo]       (`contactoView.ts`)
                       ├── (Tab Teléfono) > [Teléfono]  (`telefonoView.ts`)
                       └── (Tab Email)    > [Email]     (`emailView.ts`)
```

### Actualizaciones en `src/lib/breadcrumb.ts` y `src/lib/archiveGovernance.ts`
1. **`BreadcrumbEntityType` (`src/lib/breadcrumb.ts`):**
   - Agregar los tipos `'fecha_certificado' | 'contacto_certificado' | 'telefono_contacto' | 'email_contacto'`.
   - Actualizar `pushBreadcrumb` y `truncateBreadcrumbLabel` para truncado a 24 caracteres con tooltip completo, manteniendo prevención de bucles.
2. **Gobernanza de Archivo (`src/lib/archiveGovernance.ts`):**
   - Registrar los metadatos y tablas permitidas para `'fecha_certificado'`, `'contacto_certificado'`, `'telefono_contacto_certificado'` y `'email_contacto_certificado'`.
   - Asegurar que `contacto_certificado` consulte `get_archive_dependency_summary('contacto_certificado', id)` antes de permitir archivar si posee teléfonos o emails activos.

---

## 3. Especificación de Cada Vista de Detalle

Se recomienda crear un módulo de dominio puro en `src/lib/certificadoSubEntities.ts` (validaciones de formato de fecha, teléfono, email, tipos y construcción de entidades de detalle) acompañado por las 4 vistas en `src/views/`:

### 3.1 `Fecha` Detail View (`src/views/fechaView.ts`)
- **Función exportada:** `renderFechaView(props: FechaViewProps): string`
- **Cabecera (Row 1):** `[← Volver]` + `📅` + Título `${fecha.tipo_fecha} · ${fecha.fecha}` + `[✏️ Editar]` + `[🕒 Historial]` + `[🗑️ Archivar]` (vía `trailingActionButtonsHtml` para staff).
- **Zona de Padres (Row 2):**
  1. **Organización** (`organizacion_nombre (organizacion_rif)`) → navega a `Organización`
  2. **Certificado** (`numero_certificado · norma_codigo`) → navega a `Certificado`
- **Zona de Datos Directos (Row 3):**
  - Lectura: `tipo_fecha` (badge semántico), `fecha` (`YYYY-MM-DD` monoespaciado), y notas de vigencia relativa.
  - Edición inline (`#editFechaForm`): selector `<select name="tipo_fecha">` con los 7 valores válidos (`Otorgamiento`, `Renovación`, `Vencimiento`, `Modificación`, `Suspensión`, `Cancelación`, `Ultima Auditoría`) + `<input type="date" name="fecha" required />`.
- **Zona de Hijos (Row 4):** Sin hijos (`childTabs: []`).

### 3.2 `Contacto` Detail View (`src/views/contactoView.ts`)
- **Función exportada:** `renderContactoView(props: ContactoViewProps): string`
- **Cabecera (Row 1):** `[← Volver]` + `👤` + Título `${contacto.nombre}` + badge opcional con `cargo` + `[✏️]` + `[🕒]` + `[🗑️]`.
- **Zona de Padres (Row 2):**
  1. **Organización** (`organizacion_nombre (organizacion_rif)`) → navega a `Organización`
  2. **Certificado** (`numero_certificado · norma_codigo`) → navega a `Certificado` (pestaña `contactos`)
- **Zona de Datos Directos (Row 3):**
  - Lectura: `nombre`, `cargo` (mostrar `'Sin cargo especificado'` si `null`).
  - Edición inline (`#editContactoForm`): `<input name="nombre" required minlength="2" maxlength="180" />` y `<input name="cargo" maxlength="150" placeholder="Opcional" />`.
- **Zona de Hijos (Row 4 — 2 Pestañas con `renderListViewTable`):**
  1. **Tab `"Teléfono"` (`telefonos`, icono `📞`):**
     - Columnas: `tipo_telefono` (badge: `Oficina`, `Móvil`, `Directo`, `Emergencia`), `telefono` (monoespaciado).
     - Click de fila: `data-action="select-telefono-detail" data-telefono-id="..." data-contacto-id="..."`.
     - Botón contextual `+ Agregar Teléfono` (solo staff).
  2. **Tab `"Email"` (`emails`, icono `✉️`):**
     - Columnas: `tipo_email` (badge: `Trabajo`, `Personal`, `Notificaciones`), `email`.
     - Click de fila: `data-action="select-email-detail" data-email-id="..." data-contacto-id="..."`.
     - Botón contextual `+ Agregar Email` (solo staff).

### 3.3 `Telefono` Detail View (`src/views/telefonoView.ts`)
- **Función exportada:** `renderTelefonoView(props: TelefonoViewProps): string`
- **Cabecera (Row 1):** `[← Volver]` + `📞` + Título `${telefono.telefono}` + badge `${telefono.tipo_telefono}` + `[✏️]` + `[🕒]` + `[🗑️]`.
- **Zona de Padres (Row 2):**
  1. **Certificado** (`numero_certificado`) → navega a `Certificado`
  2. **Contacto** (`contacto.nombre`) → navega a `Contacto` (pestaña `telefonos`)
- **Zona de Datos Directos (Row 3):**
  - Lectura: `telefono` (monoespaciado), `tipo_telefono`.
  - Edición inline (`#editTelefonoForm`): `<input type="tel" name="telefono" required />` + `<select/input name="tipo_telefono">` (default `'Oficina'`).
- **Zona de Hijos (Row 4):** Sin hijos (`childTabs: []`).

### 3.4 `Email` Detail View (`src/views/emailView.ts`)
- **Función exportada:** `renderEmailView(props: EmailViewProps): string`
- **Cabecera (Row 1):** `[← Volver]` + `✉️` + Título `${email.email}` + badge `${email.tipo_email}` + `[✏️]` + `[🕒]` + `[🗑️]`.
- **Zona de Padres (Row 2):**
  1. **Certificado** (`numero_certificado`) → navega a `Certificado`
  2. **Contacto** (`contacto.nombre`) → navega a `Contacto` (pestaña `emails`)
- **Zona de Datos Directos (Row 3):**
  - Lectura: `email`, `tipo_email`.
  - Edición inline (`#editEmailForm`): `<input type="email" name="email" required />` + `<select/input name="tipo_email">` (default `'Trabajo'`).
- **Zona de Hijos (Row 4):** Sin hijos (`childTabs: []`).

---

## 4. Integración de Estado y Eventos en `src/main.ts`

1. **Estado de Vistas en `AppState`:**
   - Añadir `fechaViewState: FechaViewState`, `contactoViewState: ContactoViewState`, `telefonoViewState: TelefonoViewState`, `emailViewState: EmailViewState` (siguiendo el mismo patrón de `sitioViewState`, `procesoViewState`, `turnoViewState`).
   - Limpiar los estados seleccionados en `resetAllSubViewSelections()` cuando el usuario navega a otro dominio desde el header.
2. **Renderizado en `renderApp()`:**
   - Cuando exista `selectedFechaId`, `selectedContactoId`, `selectedTelefonoId` o `selectedEmailId` dentro del flujo de `certificacion / certificates`, invocar la vista correspondiente y actualizar el breadcrumb superior (`renderBreadcrumb`).
3. **Mutaciones Supabase & Manejo de Errores:**
   - Crear/actualizar registros en `fecha_certificado`, `contacto_certificado`, `telefono_contacto_certificado` y `email_contacto_certificado`.
   - Capturar violaciones de unicidad (`23505` en índices parciales) y traducirlas a mensajes claros en español en `editErrorMessage`.
   - Conectar `data-action="open-changelog"` con `tableName` exacto (`'fecha_certificado'`, `'contacto_certificado'`, `'telefono_contacto_certificado'`, `'email_contacto_certificado'`) para que el modal de historial forense (`auditLogModal.ts`) funcione sin cambios adicionales.
   - Conectar los botones de archivo lógico (`🗑️`) con `archiveModalView.ts` / `archive_record` RPC, navegando al padre inmediato tras confirmar el archivo.

---

## 5. Criterios de Aceptación del Step 3.1

- [ ] Las 4 vistas (`fechaView.ts`, `contactoView.ts`, `telefonoView.ts`, `emailView.ts`) usan `renderDetailPageTemplate` con fila única de botones en header y cero etiquetas `"ZONA"`.
- [ ] El flujo completo `Certificado -> Contacto -> Teléfono / Email` y su retorno mediante `[←]` y Breadcrumb funcionan sin pérdida de contexto ni ciclos en la ruta.
- [ ] El archivo lógico de `contacto_certificado` bloquea el archivado si hay `telefono_contacto_certificado` o `email_contacto_certificado` activos.
- [ ] Todos los cambios (`INSERT`, `UPDATE`, archivo lógico) quedan reflejados en la modal de Bitácora Forense (`🕒`).
