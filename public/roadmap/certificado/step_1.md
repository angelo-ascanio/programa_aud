# Step 1: `Certificado` Detail View Layout Compactness & Field Selection

## 1. Objetivo

Optimizar la densidad vertical y la fidelidad relacional de la vista de detalle de `Certificado` (`public.certificado`), reduciendo espaciados excesivos en el contenedor maestro (`src/views/detailTemplate.ts`) y restringiendo estrictamente los campos mostrados en las zonas superiores de `src/views/certificadoView.ts` a las columnas reales de `public.certificado`.

---

## 2. Alcance de Archivos a Modificar

1. `src/views/detailTemplate.ts`
2. `src/views/certificadoView.ts`
3. `src/lib/multisiteSampling.ts` (alineación del tipo `editFormData` en `CertificadoViewState`)
4. `src/main.ts` (actualización del manejador de guardado/edición inline `#editCertForm`)

---

## 3. Especificación de Cambios

### 3.1 Compactación del Contenedor Maestro (`src/views/detailTemplate.ts`)
Ajustar los espaciados verticales y márgenes internos dentro de `renderDetailPageTemplate` para eliminar aire muerto sin comprometer la legibilidad ni la respuesta móvil:

- **Encabezado (Row 1):**
  - Cambiar padding de cabecera de `py-4 px-5 sm:px-6` a `py-3 px-4 sm:px-5`.
  - Mantener la fila única horizontal (`[←] [icono + título + badges] ... [✏️] [🕒] [🗑️]`) con botones icon-only `w-8 h-8` o `w-9 h-9` y `gap-1.5 sm:gap-2`.
- **Contenedor de Zona de Padres + Zona de Datos Directos:**
  - Reducir el padding exterior de `p-5 sm:p-6` a `p-3.5 sm:p-4`.
  - Reducir el espacio vertical entre elementos en la Zona de Padres de `space-y-3` a `space-y-2`.
  - Ajustar la rejilla de tarjetas de padres para aprovechar ancho widescreen y evitar filas huérfanas cuando existen 4 relaciones padre:
    - Soportar `parents.length >= 4` con `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5` (o `lg:grid-cols-3` cuando `parents.length <= 3`, `lg:grid-cols-4` cuando `parents.length >= 4`).
  - Reducir el padding de cada tarjeta padre (`button[data-parent-nav="true"]` y `div`) de `p-3.5 space-y-1` a `p-2.5 sm:p-3 space-y-0.5`.
  - Reducir el separador `<hr>` entre Zona de Padres y Zona de Datos Directos de `my-4` a `my-2.5 sm:my-3`.
- **Zona de Datos Directos y Atributos:**
  - Reducir `section[aria-label="Detalle del registro"]` de `space-y-4` a `space-y-2.5`.
  - Reducir rejilla de atributos de `gap-3` a `gap-2.5` y celdas de `p-3.5 space-y-1` a `p-2.5 sm:p-3 space-y-0.5`.
- **Zona de Pestañas de Hijos (Row 4):**
  - Ajustar la barra `role="tablist"` de `px-5 pt-3` a `px-4 pt-2` y botones de pestaña de `px-3.5 py-2` a `px-3 py-1.5`.
  - Ajustar el cuerpo de la pestaña activa de `p-5` a `p-3.5 sm:p-4`.

### 3.2 Re-alineación Estricta de Campos en `src/views/certificadoView.ts`

#### A. Zona de Padres (`parents: DetailParentChip[]`)
Verificar que `renderCertificadoDetailPage` envíe **estrictamente** los 4 vínculos de clave foránea pertenecientes a `public.certificado` (en el orden lógico de negocio y en una sola fila en escritorio `lg:grid-cols-4`):
1. `id_organizacion` → Chip **Organización** (`organizacion_nombre (organizacion_rif)`), navegación a `certificacion / organizations / org`.
2. `id_norma` → Chip **Norma** (`norma_codigo`), navegación a `extra / standards / norma`.
3. `id_estatus` → Chip **Estatus** (`estatus`), navegación a `extra / estatus / estatus`.
4. `id_sector_iaf` → Chip **Sector IAF** (`Sector ${sector_iaf} · ${sector_iaf_descripcion}`), navegación a `extra / iaf / sector_iaf`.

> **Prohibición:** No agregar chips adicionales en la Zona de Padres (p. ej. organismo acreditador o subsector) que no sean FKs directas de `public.certificado`.

#### B. Zona de Datos Directos (`customRecordBodyHtml`)
Reemplazar la rejilla actual de 6 tarjetas + alcance (que incluía `fecha_emision`, `fecha_vencimiento`, `Organismo Acreditador` y `Sub-Sector IAF & Riesgo`) para mostrar **estrictamente** los 3 atributos directos propios de la tabla `public.certificado`:

1. **`numero_certificado`** — Código formal del certificado en tipografía monoespaciada (`font-mono text-xs font-bold text-slate-900`).
2. **`multisitio`** — Indicador booleano de modalidad multisitio (`Multisitio activo (N sedes)` / `Sede Única (No multisitio)`), reflejando directamente `cert.multisitio` y el conteo informativo sin sustituir el campo booleano.
3. **`alcance`** — Declaración narrativa completa del alcance de certificación (`col-span-full`, con contador de caracteres `(N / 1000 caracteres)`).

Layout sugerido en modo lectura (`!isEditing`):
- Fila 1 (`grid grid-cols-1 sm:grid-cols-2 gap-2.5`):
  - Tarjeta 1 (`p-2.5 sm:p-3`): **Número de Certificado** (`numero_certificado`).
  - Tarjeta 2 (`p-2.5 sm:p-3`): **Esquema Multisitio** (`multisitio`: `Sí · Esquema Multisitio` / `No · Sede Única`).
- Fila 2 (`col-span-full p-2.5 sm:p-3`):
  - **Alcance de la Certificación** (`alcance`) con texto en contenedor blanco compacto (`p-2.5`).

#### C. Formulario de Edición Inline (`#editCertForm`)
Actualizar el modo edición (`isEditing === true`) en `renderCertificadoDetailPage`, `CertificadoViewState.editFormData` (`src/lib/multisiteSampling.ts`) y el handler de `#editCertForm` en `src/main.ts`:
- Eliminar los inputs `fecha_emision` y `fecha_vencimiento` del formulario de edición directa de `certificado` (las fechas pasan a gestionarse en la tabla relacional `public.fecha_certificado` en el `Step 2.1`/`Step 2.2`).
- Permitir editar únicamente los atributos directos editables de `public.certificado`:
  - `numero_certificado` (opcional o editable bajo validación de unicidad para staff)
  - `multisitio` (`checkbox` booleano)
  - `alcance` (`textarea` obligatorio, 10–1000 caracteres con contador en vivo `#certAlcanceLiveCounter`)
- Mantener la persistencia real en Supabase (`supabase.from('certificado').update({ numero_certificado, multisitio, alcance })`) en `src/main.ts`, con validación previa (`validateAlcance`) y recarga limpia del detalle.

---

## 4. Criterios de Aceptación del Step 1

- [ ] La ficha de detalle de `Certificado` muestra exactamente **4 tarjetas padre** (`id_organizacion`, `id_norma`, `id_estatus`, `id_sector_iaf`) alineadas en 4 columnas en escritorio (`>= 1024px`).
- [ ] La Zona de Datos Directos muestra **exclusivamente** `numero_certificado`, `multisitio` y `alcance` (cero referencias a `fecha_emision`, `fecha_vencimiento`, `Organismo Acreditador` o `Sub-Sector IAF` en esta zona).
- [ ] El espaciado vertical de `detailTemplate.ts` reduce al menos ~25–35% la altura combinada de Header + Zona de Padres + Zona de Datos respecto a la versión previa, permitiendo ver la barra de pestañas de hijos sin scroll inicial en `1440x900`.
- [ ] El formulario `#editCertForm` actualiza `numero_certificado`, `multisitio` y `alcance` sin errores de TypeScript (`npx tsc --noEmit`).
