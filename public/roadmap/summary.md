# Roadmap de Modernización UX/UI del Dominio `certificado` — Resumen Ejecutivo

**Plataforma:** `programa_aud` (TypeScript estricto `0 any` · Vite 6 · Tailwind CSS v4 · Express 5 · Supabase PostgreSQL)  
**Alcance Exclusivo:** Dominio `certificado` (Multi View, Detail View, Zona de Padres con filtrado en cascada y pestañas hijas `Fecha` y `Contacto`).

---

## 1. Propósito y Alcance Estricto

Este roadmap define la hoja de ruta paso a paso para consolidar la experiencia de lectura, creación y edición del dominio **`certificado`** bajo un **modelo de formulario unificado en la Ficha de Detalle**, eliminando formularios inline heredados en el listado y simplificando las pestañas secundarias de fechas y contactos.

### Límites de Alcance (Restricción Estricta)
- **Dentro del alcance:**
  - `src/lib/multisiteSampling.ts` (tipos de estado `CertificadoViewState`, helpers puros de filtrado en cascada padre-hijo y validadores de creación/edición).
  - `src/lib/breadcrumb.ts` (soporte opcional de segmento `"Nuevo Certificado"` al entrar en modo Alta).
  - `src/views/detailTemplate.ts` (soporte de modo creación sin registro previo ni historial/archivo/hijos y renderizado uniforme de zona de formulario).
  - `src/views/certificadoView.ts` (eliminación de `renderCreateCertificadoForm` en Multi View, unificación de modos Lectura/Alta/Edición en Detail View, indicadores `*` en campos obligatorios, selectores de padres con cascada y limpieza de pestañas `Fecha` y `Contacto`).
  - `src/views/certificacionView.ts` y `src/main.ts` (inyección de catálogos de padres hacia `certificadoView.ts`, enrutamiento directo desde `Nuevo Certificado` al Detail View en modo Alta, eventos de cascada `id_sector_iaf` → `id_subsector_iaf`, persistencia Supabase `INSERT`/`UPDATE` de las 5 FKs + campos directos, y poda de manejadores obsoletos de `Fecha`/`Contacto`).
  - `src/lib/*.test.ts` (actualización de pruebas existentes y cobertura unitaria de todas las reglas nuevas).
- **Fuera del alcance:**
  - No se modifican scripts SQL (`public/supabase/queries/*.sql`), ni el servidor Express (`server.ts`), ni otros dominios (`organizacion`, `auditor`, `auditoria`, `extra`, ni las vistas independientes `fechaView.ts`, `contactoView.ts`, `telefonoView.ts`, `emailView.ts`).

---

## 2. Decisiones Arquitectónicas y Especificaciones Funcionales

### 2.1 Claridad entre Modo Lectura, Modo Alta y Modo Edición
1. **Modo Lectura (`mode = 'read'`):**
   - El usuario consulta el certificado sin poder modificarlo.
   - **Todos los campos** de la Ficha de Detalle (las 5 FKs de la Zona de Padres y los 3 atributos directos en la Zona de Registro) se renderizan como **controles de formulario deshabilitados (`disabled`)** (`<select disabled>`, `<input disabled>`, `<textarea disabled>`), manteniendo una geometría y jerarquía visual idéntica entre lectura y edición en lugar de cadenas de texto plano estáticas.
   - Se conserva la capacidad de navegar a cada registro padre mediante un botón/enlace compacto de salto contextual (`data-parent-nav="true"`, `→`) en la etiqueta/cabecera de cada selector padre, sin violar el estado `disabled` del control ni exponer UUIDs crudos.
2. **Modo Alta / Edición (`mode = 'add' | 'edit'`):**
   - Se activa al pulsar **`Nuevo Certificado`** (`mode = 'add'`) o el botón **Editar** (`✏️` / `#startEditCertBtn`, `mode = 'edit'`). Todos los controles pasan a estado habilitado.
   - **Modo Alta (`add`):** Todos los campos nacen **vacíos / sin selección** (opción placeholder `<option value="">Seleccione...</option>` en los `<select>`, entradas de texto vacías, `multisitio` desmarcado por defecto) listos para captura explícita sin valores pre-rellenados artificialmente.
   - **Modo Edición (`edit`):** Todos los controles se pre-rellenan con los valores vigentes del certificado seleccionado (incluyendo sus 5 FKs y sus 3 campos directos) o con el borrador en curso si hay errores de validación.
3. **Indicador de Obligatoriedad (`NOT NULL` vs. Opcional):**
   - De acuerdo con `public.certificado` en `01_creacion.sql`, todas las columnas funcionales del certificado (`id_organizacion`, `id_norma`, `id_estatus`, `id_sector_iaf`, `id_subsector_iaf`, `numero_certificado`, `alcance`, `multisitio`) son `NOT NULL`.
   - Toda etiqueta de campo obligatorio en el Detail View incorpora el marcador clásico **`*`** (ej. `Organización *`, `Norma *`, `Estatus *`, `Sector IAF *`, `Sub-Sector IAF *`, `Número de Certificado *`, `Alcance de la Certificación *`, `Esquema Multisitio *`), reservando la ausencia de `*` estrictamente para campos opcionales en sub-entidades o vistas futuras.

### 2.2 Reemplazo del Flujo `Nuevo Certificado`
- Se elimina por completo el formulario inline legado (`renderCreateCertificadoForm` / `inlineFormHtml`) que se desplegaba encima del directorio Multi View.
- Al pulsar el botón **`Nuevo Certificado`** (`[data-action="open-create-cert"]`) en `renderCertificadoDirectory`:
  - El controlador navega directamente al **Detail View de Certificado en Modo Alta** (`selectedCertId: null`, `isCreating: true` / `detailMode: 'add'`).
  - Se empuja un segmento limpio en el breadcrumb (`Certificación > Certificado > Nuevo Certificado`), se ocultan el botón de historial (`🕒`), archivar (`🗄️`) y la Zona de Hijos (`childTabs`) mientras el registro aún no existe en base de datos, y al guardar con éxito se crea en `certificado` (estado reactivo + Supabase) y se transiciona al Detail View del nuevo certificado en Modo Lectura.

### 2.3 Inteligencia en Zona de Padres (Filtrado en Cascada)
- Los selectores de la Zona de Padres soportan dependencias jerárquicas reactivas.
- En concreto, seleccionar o cambiar **`id_sector_iaf`** (ej. Sector `17`) filtra dinámicamente las opciones disponibles de **`id_subsector_iaf`** para mostrar únicamente los sub-sectores hijos válidos pertenecientes a ese sector (`17.1`, `17.2`, `17.3`, etc.).
- Si el valor previo de `id_subsector_iaf` no pertenece al nuevo `id_sector_iaf`, se limpia automáticamente (`""`) obligando al usuario a elegir un sub-sector válido (en Modo Alta o Edición). Si `id_sector_iaf` está vacío, `id_subsector_iaf` muestra placeholder deshabilitado o guía `"Seleccione primero un Sector IAF *"`.

### 2.4 Simplificación de la Zona de Hijos (Pestañas `Fecha` y `Contacto`)
- Dentro de `renderFechasChildTab` y `renderContactosChildTab` en `src/views/certificadoView.ts`:
  - Se **elimina** el texto introductorio izquierdo (`"Hitos cronológicos y vigencia del certificado"` y `"Personas de contacto autorizadas por la organización"`).
  - Se **eliminan** los botones superiores de acción (`+ Registrar Fecha` y `+ Agregar Contacto`), así como los formularios inline de creación (`createFechaCertForm`, `createContactoCertForm`) y banners de vista previa inline asociados en la pestaña.
  - Se **conserva exclusivamente la tabla de datos** (`renderListViewTable` para `cert-tab-fechas` y `cert-tab-contactos`), manteniendo las filas clickeables hacia sus fichas dedicadas (`fechaView.ts` / `contactoView.ts`) y dejando las pestañas limpias para iteraciones futuras.

---

## 3. Estructura de Fases del Roadmap (`public/roadmap/`)

| Archivo | Fase | Objetivo Principal |
| :--- | :--- | :--- |
| [`phase_1.md`](phase_1.md) | **Fase 1** | Contratos de estado (`CertificadoViewState`, `CertificadoFormMode`, `CertificadoFormDraft`), helpers puros de filtrado en cascada (`filterSubsectoresBySectorIaf`) y validación unificada de padres + campos directos. |
| [`phase_2.md`](phase_2.md) | **Fase 2** | Adaptación de `detailTemplate.ts` y `certificadoView.ts` al modelo unificado de formulario: controles `disabled` en Modo Lectura, controles habilitados en Alta/Edición, marcadores `*` y cabecera de creación sin registro previo. |
| [`phase_3.md`](phase_3.md) | **Fase 3** | Refactorización de `Nuevo Certificado` (eliminación de formulario inline en Multi View → navegación directa al Detail View en Modo Alta), cableado de catálogos reales (`certificacionView.ts`), cascada en vivo `id_sector_iaf` → `id_subsector_iaf` y persistencia `INSERT`/`UPDATE` en `src/main.ts`. |
| [`phase_4.md`](phase_4.md) | **Fase 4** | Simplificación de las pestañas `Fecha` y `Contacto` (solo tabla de datos, sin texto introductorio ni botones/formularios superiores) y limpieza de manejadores muertos en `src/main.ts`. |
| [`step_final.md`](step_final.md) | **Step Final** | Actualización y ampliación de pruebas `node:test`, verificación `tsc --noEmit` (`0 any`), compilación `vite build` (`manualChunks`) y auditoría visual Chromium (`375px`–`1920px`). |

---

## 4. Criterios de Aceptación Global

1. **Consistencia Visual Lectura/Edición:** En Modo Lectura no quedan cadenas planas para los campos de `certificado`; todos los controles (5 padres + 3 directos) se muestran como inputs/selects/textarea `disabled` con etiquetas `*` para campos `NOT NULL`.
2. **Flujo `Nuevo Certificado`:** Pulsarlo desde Multi View abre inmediatamente el Detail View en Modo Alta con todos los campos vacíos y sin formulario inline en el directorio.
3. **Cascada Padre-Hijo:** Al cambiar `id_sector_iaf` en Alta o Edición, `id_subsector_iaf` se filtra de inmediato a los sub-sectores de ese sector y rechaza combinaciones incompatibles al guardar.
4. **Pestañas `Fecha` y `Contacto` Limpias:** Renderizan únicamente `<table ...>` (`renderListViewTable`) o el estado vacío de tabla, sin subtítulos descriptivos ni botones `+ Registrar Fecha` / `+ Agregar Contacto`.
5. **Calidad y Seguridad:** `0` UUIDs expuestos en DOM visible (**Zero-UUID**), `0` errores en `tsc --noEmit`, `100%` de pruebas `node:test` aprobadas y `0` desbordamiento horizontal en móvil y escritorio.
