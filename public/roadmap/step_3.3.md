# Step 3.3 — UI Bloque 2 (`Certificado`, Pestaña 1 `Alcance`, `ShareModal` con Conflicto y Versionado 2 Pasos)

## Objetivo del Paso
Actualizar las vistas Multi View y Detail View de **`Certificado`** (`certificadoView.ts`), sus sub-vistas, **`ShareModalView`** (`shareModalView.ts`) y los flujos en `src/main.ts` para:
1. Retirar el campo `alcance` del formulario de atributos del certificado e incorporar **`Alcance` como la PRIMERA pestaña hija** en la Detail View de `Certificado` (`Alcance`, `Sitio`, `No Aplicable`, `Proceso`, `Turno`, `Auditoría`, `Fecha`, `Contacto`).
2. Ofrecer visualización bilingüe (**`Español`** | **`Inglés`** | **`Bilingüe ES/EN`**), edición directa sin historial de cambios ni límite de caracteres (adaptada tanto para textos cortos como largos), y estado claro cuando un certificado no tiene alcance.
3. Hacer **`Alcance` compartible** dentro del mismo **`Conglomerado`** mediante `ShareModalView` (`kind: 'alcance'`), incluyendo el **Popup de Comparación y Resolución de Conflicto** (`Cancelar` vs `Continuar y Reemplazar Alcance`) cuando un certificado destino ya posee alcance.
4. Habilitar selector de versión (`vN` · histórica solo lectura vs activa editable), `abreviacion` organizacional, aislamiento de sub-entidades por `id_certificado_version` y el flujo manual en 2 pasos de **`"Crear Nueva Versión"`** (clonación sin duplicar `fecha_certificado` + Modal de resolución de auditorías en 4 categorías).

---

## Archivos a Crear / Modificar
- `src/views/certificadoView.ts`
- `src/views/shareModalView.ts`
- `src/views/sitioView.ts`, `src/views/procesoView.ts`, `src/views/turnoView.ts`, `src/views/contactoView.ts`, `src/views/fechaView.ts`, `src/views/noAplicableView.ts`
- `src/lib/certificadoSubEntities.ts`
- `src/lib/certificadoSharePersistence.ts`
- `src/main.ts`
- `src/views/certificadoView.test.ts`
- `src/views/shareModalView.test.ts`

---

## Especificación Técnica Detallada

### 1. Multi View y Formulario Principal de `Certificado` (`src/views/certificadoView.ts`)
1. **Multi View:** Mostrar badge `vN` junto a `numero_certificado`, `organizacion_abreviacion` junto a la organización, e indicador discreto si el certificado aún está **`Sin alcance`** (búsqueda habilitada sobre `alcance_es` y `alcance_en`). Cumplir `table-fixed`, `<colgroup>` = `100%` y `0 <button>` en `<tbody>`.
2. **Formulario de Atributos (`renderCertificadoRecordFieldsZone`):**
   - **Eliminar** el `<textarea name="alcance">` y el contador heredado `0 / 1000 caracteres` del formulario principal del certificado (`Certificado` / `certificado_version`), ya que el alcance ahora vive en su propia tabla y primera pestaña hija.
3. **Cabecera de Detail View y Selector de Versión:**
   - Selector `<select data-action="select-cert-version">` (`v2 · Actual`, `v1 · Histórica`).
   - En **versión histórica (`es_version_actual = false`)**: modo estricto solo lectura para atributos y pestañas dependientes de versión (`sitios`, `no_aplicables`, `procesos`, `turnos`, `fechas`, `contactos`), conservando visible las fechas históricas propias de `v1`.
   - En **versión activa (`es_version_actual = true`)**: edición libre sin auto-versionar + botón **`Crear Nueva Versión`**.

### 2. Primera Pestaña Hija: `Alcance` (`renderAlcanceChildTab` en `src/views/certificadoView.ts`)
1. **Orden de Pestañas:**
   `validTabs = ['alcance', 'sitios', 'no_aplicables', 'procesos', 'turnos', 'auditorias', 'fechas', 'contactos']`, con **`activeChildTab` por defecto = `'alcance'`**.
2. **Contenido Adaptativo para Alcance Corto o Largo (Sin Límite de Caracteres):**
   - **Sin Alcance:** tarjeta vacía limpia con aviso en español (*"Este certificado no tiene Alcance registrado. Aunque puede guardarse así, no podrá generar auditorías hasta definir o compartir un Alcance en español."*) + botón **`+ Definir Alcance`** para `ADMIN`/`WORKER`.
   - **Con Alcance Activo (Propio o Compartido):**
     - Chip de origen (`"Alcance Propio"` vs `"Compartido desde [N° Cert]"` + lista de certificados destino cuando esté compartido).
     - Selector de visualización **`Español`** | **`Inglés`** | **`Bilingüe (ES / EN)`** (`data-action="set-alcance-lang-view"`). Si no hay traducción en inglés y el usuario selecciona `Inglés`, mostrar estado claro *"Traducción al inglés no registrada (opcional)"*.
     - Contenedor adaptable (`whitespace-pre-wrap break-words leading-relaxed min-h-[3.5rem] max-h-[420px] overflow-y-auto` en lectura) que se ve limpio con 1 sola frase y permite scroll cómodo cuando el alcance técnico ocupa varios párrafos largos.
     - Botones en barra de acción de la pestaña (solo `ADMIN`/`WORKER`): **`Editar Alcance`** (si es propio, o **`Definir Alcance Propio`** si es compartido), **`Compartir Alcance`** (abre `ShareModalView` en modo `'alcance'`), y **`Desvincular`** / **`Archivar Alcance`** según corresponda.
   - **Modo Edición / Creación In-Tab:** `<textarea name="alcance_es">` (obligatorio, sin `maxlength`, `rows="4"` expandible) y `<textarea name="alcance_en">` (opcional, sin `maxlength`, `rows="4"` expandible) con contador informativo de caracteres únicamente (nunca restrictivo).

### 3. Compartición de `Alcance` y Popup de Conflicto (`src/views/shareModalView.ts`)
1. Añadir `kind: 'alcance'` a `ShareModalView`:
   - Lista certificados elegibles del **mismo `Conglomerado`**, marcando claramente cuáles están **`Sin alcance`** vs cuáles tienen **`Alcance actual (requiere confirmación de reemplazo)`**.
   - Excluye el certificado propietario del alcance y aquellos que ya comparten exactamente ese mismo alcance.
2. **Popup de Comparación y Resolución de Conflicto:**
   - Si alguno de los certificados seleccionados ya posee un `alcance` (propio o compartido distinto), al presionar `"Compartir"` se abre la vista/popup de conflicto dentro del flujo modal mostrando por cada certificado afectado:
     - **Nuevo Alcance a Compartir (Origen: [N° Cert]):** bloques comparativos de **Español** y **Inglés** (`whitespace-pre-wrap break-words max-h-44 overflow-y-auto` para soportar textos cortos o largos).
     - **Alcance Actual de [N° Cert Destino] (será borrado/reemplazado):** bloques comparativos de **Español** y **Inglés** (`whitespace-pre-wrap break-words max-h-44 overflow-y-auto`).
   - Acciones explícitas: **`Cancelar`** (aborta y vuelve sin tocar nada) vs **`Continuar y Reemplazar Alcance`** (invoca `persistShareAlcance(..., replaceExisting: true)` archiva los alcances previos del destino y crea los enlaces en `alcance_certificado_compartido`).

### 4. Sub-Entidades por `id_certificado_version` y Flujo 2 Pasos de Nueva Versión
- Sub-vistas (`sitioView`, `procesoView`, `turnoView`, `contactoView`, `fechaView`, `noAplicableView`) y comparticiones de sitios/procesos/turnos/contactos acotadas por `id_certificado_version`.
- Flujo manual 2 pasos `"Crear Nueva Versión"` de certificado: Paso 1 (`fn_clonar_version_certificado`, recordando que **`fecha_certificado` no se duplica** y **`alcance` permanece vigente en el contenedor**) → Paso 2 (Modal obligatorio de resolución de auditorías en **4 categorías** bloqueando confirmación si Categoría 2 o 3 están sin selección).

---

## Criterios de Aceptación y Verificación
- Al abrir cualquier certificado, la primera pestaña es **`Alcance`** con toggle `Español` / `Inglés` / `Bilingüe`, soportando sin error tanto alcances de 5 palabras como textos extensos de > 5000 caracteres.
- Al compartir `Alcance` hacia un certificado que ya tenía otro alcance en el mismo `Conglomerado`, aparece el popup comparativo (Español e Inglés nuevo vs actual): **`Cancelar`** deja ambos intactos; **`Continuar y Reemplazar Alcance`** borra/archiva el segundo y aplica el compartido.
- Crear `v2` de un certificado clona sitios/procesos/contactos/exclusiones, mantiene **0 `fecha_certificado` duplicadas** en `v2`, conserva el `alcance` único vigente y abre el modal de 4 categorías de auditorías.
- `node --test src/views/certificadoView.test.ts src/views/shareModalView.test.ts` en verde; `table-fixed`, `<colgroup>` 100%, `0 <button>` en `<tbody>`, Zero-UUID y `0 any`.
