# Step 3.2 — UI Bloque 2 (`Organización`): `abreviacion`, Versionado Manual, Guardia Anti-No-Op y Modal de Certificados

## Objetivo del Paso
Actualizar las vistas Multi View y Detail View de **`Organización`** (`organizacionView.ts`, `certificacionView.ts`, `clientAccessView.ts`) y los manejadores en `src/main.ts` para exponer `abreviacion`, mostrar el historial de versiones con selector interactivo (`v1`, `v2`, ..., modo solo-lectura en versiones históricas y edición libre en versión activa), habilitar el flujo manual **`"Crear Nueva Versión"`** con validación **Anti-No-Op** y renderizar el **Modal obligatorio de resolución de versiones de certificado** íntegramente en español.

---

## Archivos a Crear / Modificar
- `src/views/organizacionView.ts`
- `src/views/certificacionView.ts`
- `src/views/clientAccessView.ts`
- `src/main.ts`
- `src/views/organizacionView.test.ts` *(nuevo o ampliar suite de vistas Bloque 2)*

---

## Especificación Técnica Detallada

### 1. Multi View de `Organización` (`src/views/organizacionView.ts`)
1. Añadir el campo **`abreviacion`** en columnas de tabla (`Abreviación` / badge junto al nombre) y tarjetas grid manteniendo estrictamente `table-fixed`, `<colgroup>` sumando `100%` y **0 `<button>` dentro de `<tbody>`**.
2. Mostrar badge sutil de versión actual (`v1`, `v2`) en las tarjetas/filas sin saturar visualmente ("Less Is More").
3. Permitir ordenar/filtrar también por `abreviacion` y `nombre`.

### 2. Detail View de `Organización` (`src/views/organizacionView.ts`)
1. **Selector de Versión en Cabecera:**
   - Mostrar badge de estado (`Versión Actual · v2` vs `Versión Histórica · v1 · Solo lectura`) y selector `<select data-action="select-org-version">` cuando existan múltiples versiones.
   - Si el usuario selecciona una versión histórica (`es_version_actual === false`):
     - Mostrar banner compacto informativo en español: *"Visualizando versión histórica vN (solo lectura). Los cambios solo pueden realizarse o derivar versiones desde la versión activa."*
     - Deshabilitar botones `Editar` y `Crear Nueva Versión`.
     - Mostrar en la pestaña hija de certificados qué `certificado_version` apuntan históricamente a esa `organizacion_version`.
2. **Versión Activa — Dos Acciones Claras para `ADMIN` / `WORKER`:**
   - **`Editar` (Edición libre sin crear nueva versión):** actualiza los atributos (`nombre`, `abreviacion`, `rif`, `direccion_fiscal`) directamente sobre la `organizacion_version` activa (`es_version_actual = TRUE`) y sincroniza el contenedor sin incrementar `version_numero`.
   - **`Crear Nueva Versión`:** abre el modo/modal/formulario pre-llenado con los valores actuales de la versión activa (`nombre`, `abreviacion`, `rif`, `direccion_fiscal` + campo opcional `notas_version`), con indicación clara de que requiere al menos un cambio para versionar.
3. **Formulario `Crear / Editar` Organización:**
   - Incluir campo obligatorio **`Abreviación`** (`maxlength="30"`, `placeholder="Ej. MET-VAL"`), validado en tiempo real/al enviar.
   - Al confirmar `"Crear Nueva Versión"`: ejecutar `validateNewOrganizacionVersionDraft(...)`. Si no hubo cambios en ninguno de los 4 campos, bloquear y mostrar el error exacto de **Guardia Anti-No-Op** en el banner del formulario sin crear registros ni abrir el modal siguiente.

### 3. Modal Obligatorio de Resolución de Certificados (`renderOrganizacionCertResolutionModal` en `organizacionView.ts`)
Se abre automáticamente inmediatamente después de crearse `organizacion_version` (`v + 1`) si la organización posee al menos una `certificado_version` activa:
- **Título en español:** `"Vincular versiones de certificado a la nueva versión de organización (vN)"`
- **Tabla (`table-fixed`, `<colgroup>` sumando `100%`, controles radio/select fuera de botones en celdas o labels accesibles):**
  - Columnas: `Certificado y Norma`, `Versión Cert.`, `Estado Actual`, `Decisión` (`Mantener en versión anterior de organización` vs `Vincular a nueva versión de organización`).
  - Preselección automática estricta:
    - Versiones históricas (`es_version_actual = false`) → **`Mantener en versión anterior de organización`**.
    - Versión actual (`es_version_actual = true`) → **`Vincular a nueva versión de organización`**.
- **Botón principal:** `"Confirmar Vinculación"` (ejecuta `fn_resolver_cert_versiones_organizacion` vía `persistResolveCertVersionsOrg` + actualiza estado reactivo y `allCertificadosDetailed`).

### 4. Wiring en `src/main.ts` y `clientAccessView.ts`
- Conectar eventos de `organizacionView.ts` en `src/main.ts` (`select-org-version`, `open-create-org-version`, `submit-create-org-version`, `confirm-org-cert-resolution`, y actualización de `editar` sobre `organizacion_version` activa).
- Mostrar `abreviacion` en `clientAccessView.ts` al asignar acceso a usuarios `CLIENT`.
- Garantizar que `AUDITOR` no accede a Bloque 2 y `CLIENT` ve en solo-lectura sus organizaciones autorizadas (incluyendo su `abreviacion` y `vN`).

---

## Criterios de Aceptación y Verificación
- Editar versión activa de organización persiste cambio en `organizacion_version` sin incrementar `version_numero`.
- Intentar `"Crear Nueva Versión"` sin modificar `Nombre`, `Abreviación`, `RIF` ni `Dirección Fiscal` bloquea la acción con el mensaje español Anti-No-Op.
- Confirmar `"Crear Nueva Versión"` tras modificar un campo (p. ej. `abreviacion`) crea `v + 1` y despliega el Modal de Certificados con históricas preseleccionadas en `Mantener` y actuales en `Vincular`.
- Tablas verificadas con `table-fixed`, `<colgroup>` = `100%`, `0 <button>` en `<tbody>`, Zero-UUID y `node --test src/views/organizacionView.test.ts` en verde.
