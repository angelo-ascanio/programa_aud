# Step 4.3: Árbol `Certificado` — `fecha_certificado`, `contacto_certificado`, `telefono_contacto_certificado` y `email_contacto_certificado`

## 1. Objetivo
Completar la estandarización de las cuatro entidades de fechas y contactos (`fechaView.ts`, `contactoView.ts`, `telefonoView.ts`, `emailView.ts`) para alcanzar paridad 100% con `certificadoView.ts`: añadir modo `'add'` unificado, reemplazar botones al pie por cabecera Guardar-primero / Cancelar-segundo, sustituir banners verdes inline por `showFloatingToast`, y eliminar los formularios inline de creación en pestañas de `contactoView.ts`.

---

## 2. Brechas Detectadas en los Archivos Actuales
1. **`src/views/fechaView.ts` (224 líneas):**
   - Solo implementa `'read' | 'edit'` (`isEditingAttributes`), sin modo `'add'`.
   - En `'edit'`, mantiene botones al pie (`Cancelar`, `💾 Guardar Fecha`), usa `[✕]` por defecto en cabecera, y muestra banner verde `saveSuccessMessage`.
   - Zona 1 mantiene `Certificado` estático en lugar de `<select form="fechaDetailForm">` en `'add' | 'edit'`.
2. **`src/views/contactoView.ts` (525 líneas):**
   - Solo implementa `'read' | 'edit'`, sin modo `'add'`.
   - En `'edit'`, mantiene botones al pie (`Cancelar`, `💾 Guardar Contacto`) y banner verde `saveSuccessMessage`.
   - Sus pestañas hijas (`contacto-tab-telefonos` y `contacto-tab-emails`) ya usan `renderListViewTable` (`table-fixed`, `<colgroup>`, `getRowAttrs`), **PERO** crean nuevos teléfonos y emails mediante **formularios inline** (`#createTelefonoContactoForm`, `#createEmailContactoForm`) incrustados dentro de las pestañas en vez de navegar a `telefonoView` y `emailView` en modo `'add'`.
3. **`src/views/telefonoView.ts` (220 líneas) & `src/views/emailView.ts` (219 líneas):**
   - Ambos solo implementan `'read' | 'edit'`, mantienen botones al pie (`Cancelar`, `💾 Guardar ...`), banner verde `saveSuccessMessage` y Zona 1 estática en `'edit'`.
   - Carecen de modo `'add'` (`isCreateMode: true`) con selector editable de `id_contacto` en Zona 1.

---

## 3. Archivos Objetivo
1. `src/lib/certificadoSubEntities.ts` (ampliación de contratos `'read' | 'add' | 'edit'`, factorías vacías y limpieza de flags inline `isCreatingTelefono`/`isCreatingEmail`)
2. `src/views/fechaView.ts`
3. `src/views/contactoView.ts`
4. `src/views/telefonoView.ts`
5. `src/views/emailView.ts`
6. `src/views/certificadoView.ts` (botones `+ Nueva Fecha` en `cert-tab-fechas` y `+ Nuevo Contacto` en `cert-tab-contactos`)
7. `src/views/certificacionView.ts`
8. `src/main.ts` (handlers de navegación a modo `'add'` y persistencia `INSERT`/`UPDATE` + `showFloatingToast`)

---

## 4. Contratos de Dominio (`src/lib/certificadoSubEntities.ts`)

Agregar tipos de modo y factorías de borrador vacío para las 4 entidades:
```ts
export type FechaDetailMode = 'read' | 'add' | 'edit';
export type ContactoDetailMode = 'read' | 'add' | 'edit';
export type TelefonoDetailMode = 'read' | 'add' | 'edit';
export type EmailDetailMode = 'read' | 'add' | 'edit';
```
- En `FechaViewState`, `ContactoViewState`, `TelefonoViewState`, `EmailViewState`:
  - Añadir `isCreating?: boolean`, `originatingCertId?: string | null` (para `fecha` y `contacto`), `originatingContactoId?: string | null` (para `telefono` y `email`).
  - **Eliminar** `saveSuccessMessage` de los 4 estados y eliminar `isCreatingTelefono`, `telefonoCreateError`, `isCreatingEmail`, `emailCreateError` de `ContactoViewState`.
- Añadir factorías `createEmptyFechaFormDraft(certId?)`, `createEmptyContactoFormDraft(certId?)`, `createEmptyTelefonoFormDraft(contactoId?)`, `createEmptyEmailFormDraft(contactoId?)` y sus resolvedores `resolve...DetailMode(state, isStaff, selectedItem)`.

---

## 5. Cambios Exactos por Vista

### 5.1 `src/views/fechaView.ts`
- **Cabecera:** `renderDetailFormTopActions` (`#saveFechaFormBtn` primero, `#cancelEditFechaBtn` segundo), `isCreateMode: mode === 'add'`.
- **Zona 1:** `'read'` chips `Organización` + `Certificado` (`navAction` → `cert`, tab `fechas`); `'add' | 'edit'` `<select form="fechaDetailForm" id="fechaSelectCertificado">`.
- **Zona 2 (`#fechaDetailForm`):** `tipo_fecha` (`Otorgamiento | Renovación | Vencimiento | Modificación | Suspensión | Cancelación | Ultima Auditoría`) + `fecha` (`input type="date"`). Cero botones al pie, cero banner verde.

### 5.2 `src/views/contactoView.ts`
- **Cabecera:** `renderDetailFormTopActions` (`#saveContactoFormBtn` primero, `#cancelEditContactoBtn` segundo), `isCreateMode: mode === 'add'`.
- **Zona 1:** `'read'` chips `Organización` + `Certificado` (`navAction` → `cert`, tab `contactos`); `'add' | 'edit'` `<select form="contactoDetailForm" id="contactoSelectCertificado">`.
- **Zona 2 (`#contactoDetailForm`):** `nombre` (`*`, `maxlength="180"`), `cargo` (`maxlength="150"`). Cero botones al pie, cero banner verde.
- **Zona 3 (oculta si `isCreateMode`):**
  - Eliminar `#createTelefonoContactoForm` y `#createEmailContactoForm`.
  - En pestaña `telefonos`: botón `+ Agregar Teléfono` (`data-action="open-create-telefono" data-contacto-id="..."`) navega directo a `telefonoView` en modo `'add'`.
  - En pestaña `emails`: botón `+ Agregar Correo` (`data-action="open-create-email" data-contacto-id="..."`) navega directo a `emailView` en modo `'add'`.

### 5.3 `src/views/telefonoView.ts` y `src/views/emailView.ts`
- **Cabecera:** `renderDetailFormTopActions` (`#saveTelefonoFormBtn`/`#cancelEditTelefonoBtn` y `#saveEmailFormBtn`/`#cancelEditEmailBtn`), `isCreateMode: mode === 'add'`.
- **Zona 1:** `'read'` chips `Certificado` + `Contacto` (`navAction` → `contacto_certificado`); `'add' | 'edit'` `<select>` de `id_contacto` filtrado por los contactos activos del certificado (o todos los activos).
- **Zona 2 (`#telefonoDetailForm` / `#emailDetailForm`):**
  - `telefonoView`: `tipo_telefono` (`Oficina` | `Móvil` | `Directo` | `Emergencia` | `Otro`) + `telefono` (`*`).
  - `emailView`: `tipo_email` (`Trabajo` | `Personal` | `Notificaciones` | `Facturación` | `Otro`) + `email` (`*`, validación RFC/formato email).
  - Cero botones al pie, cero banner verde; confirmación por `showFloatingToast`.

### 5.4 Conexión desde `src/views/certificadoView.ts`
- En `cert-tab-fechas`: botón `+ Nueva Fecha` (`data-action="open-create-fecha" data-cert-id="..."`) para Staff aprobado.
- En `cert-tab-contactos`: botón `+ Nuevo Contacto` (`data-action="open-create-contacto" data-cert-id="..."`) para Staff aprobado.

---

## 6. Verificación de Step 4.3
- Confirmar cero formularios inline en `contactoView.ts` (`#createTelefonoContactoForm` y `#createEmailContactoForm` eliminados).
- Confirmar breadcrumb compuesto completo: `Certificados > CERT-001 > Contacto > Nuevo Teléfono` → guardar → toast flotante → volver al Contacto y verificar fila nueva en `contacto-tab-telefonos`.
- `npx tsx --test src/lib/certificadoSubEntities.test.ts src/lib/*.test.ts && npm run lint && npm run build`.
