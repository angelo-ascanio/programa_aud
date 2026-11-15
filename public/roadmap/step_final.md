# Step Final: Actualización de Pruebas, Verificación Estática, Compilación y Auditoría Visual

**Archivos Objetivo de Pruebas:**
- `src/lib/multisiteSampling.test.ts`
- `src/lib/detailViewsPhase42.test.ts`
- `src/lib/phase421DetailTemplate.test.ts`
- `src/lib/phase62UiIntegrity.test.ts`

---

## 1. Actualización y Ampliación de Suites Automatizadas (`node:test`)

### 1.1 `src/lib/multisiteSampling.test.ts`
- **Eliminar/Reemplazar aserciones obsoletas:**
  - Sustituir la prueba que verificaba `createCertificadoForm` dentro del listado Multi View por una prueba que verifique:
    1. En Multi View, `renderCertificadoView` con `isCreating: true` y `selectedCertId: null` navega y renderiza el **Detail View en Modo Alta** (no el listado ni un formulario inline encima del directorio).
    2. En Modo Alta (`mode = 'add'`), los **5 selectores padres** y los **3 campos directos** están habilitados (`!disabled`), vacíos y muestran `*` en todas sus etiquetas obligatorias, y se ocultan las pestañas hijas, el historial (`open-changelog`) y el botón de archivar.
  - Sustituir la prueba que verificaba `createFechaCertForm` / `createContactoCertForm` dentro de las pestañas `Fecha` y `Contacto` de `Certificado` por una verificación estricta de que ambas pestañas renderizan **únicamente la tabla de datos** (`cert-tab-fechas` / `cert-tab-contactos`), sin texto introductorio ni botones `+ Registrar Fecha` / `+ Agregar Contacto`.
- **Nuevas pruebas unitarias de lógica pura:**
  - `filterSubsectoresBySectorIaf`: verifica que al seleccionar Sector `17` retorna únicamente sub-sectores `17.*` ordenados (`17.1`, `17.2`, ...) y excluye `28.1` / `33.1`; y al pasar `sectorId: ''` retorna `[]`.
  - `reconcileSubsectorSelectionOnSectorChange`: verifica conservación cuando el sub-sector pertenece al nuevo sector y reseteo a `''` cuando cambia a otro sector incompatible.
  - `validateCertificadoFormDraft`: verifica rechazo de padres faltantes, rechazo de sub-sector incompatible con el sector padre, validación de unicidad de `numero_certificado` (distinguiendo `add` vs `edit`), validación de `alcance` (10–1000 caracteres) y éxito con payload normalizado.

### 1.2 `src/lib/detailViewsPhase42.test.ts` y `src/lib/phase421DetailTemplate.test.ts`
- Actualizar las aserciones sobre `renderCertificadoView` en **Modo Lectura** (`isEditingAttributes: false`):
  - Verificar que las 5 relaciones padre siguen teniendo navegación contextual (`data-parent-nav="true"`) y muestran los 5 `<select disabled>` con etiqueta `*`.
  - Verificar que `numero_certificado`, `multisitio` y `alcance` en Modo Lectura se renderizan como controles `<input disabled>` / `<textarea disabled>` con `*` en sus etiquetas.
- Verificar en **Modo Edición** (`isEditingAttributes: true`):
  - Los 5 `<select>` padres y los 3 campos directos se renderizan habilitados (sin atributo `disabled`), pre-rellenados con los valores actuales del certificado, y el selector `Sub-Sector IAF *` muestra solo los sub-sectores pertenecientes al `Sector IAF *` actual.
- Confirmar cumplimiento estricto de **Zero-UUID** en los 3 modos (`read`, `add`, `edit`).

### 1.3 `src/lib/phase62UiIntegrity.test.ts`
- Añadir auditoría `assertZeroUuidExposure()` sobre:
  - `Certificado Add Mode` (Detail View en modo alta con catálogos completos).
  - `Certificado Read Mode` (controles `disabled` con 5 padres).
  - `Certificado Edit Mode` (controles habilitados con cascada `Sector IAF` → `Sub-Sector IAF`).

---

## 2. Puertas de Calidad Obligatorias (CLI)

Ejecutar y confirmar salida limpia sin errores ni advertencias de tipos:

1. **Verificación de tipos TypeScript (`strict: true`, `0 any`):**
   ```bash
   npm run lint   # tsc --noEmit
   ```
   Verificar también con búsqueda estática que no existan usos de `: any` ni `as any` en `src/`.
2. **Ejecución completa de pruebas unitarias (`node:test`):**
   ```bash
   npm test       # npx tsx --test src/lib/*.test.ts
   ```
   Debe reportar **100% aprobadas, 0 fallos, 0 omitidas**.
3. **Compilación optimizada de producción:**
   ```bash
   npm run build  # vite build
   ```
   Confirmar generación limpia de `dist/` con chunks por debajo del umbral de advertencia.

---

## 3. Auditoría End-to-End en Navegador Real (Playwright Chromium)

Levantar la aplicación en `http://localhost:3000` (`npm run dev`) y verificar como usuario `ADMIN` / `WORKER` y `CLIENT`:

1. **Flujo `Nuevo Certificado`:**
   - En `#certificacion/certificates`, pulsar `+` (`Nuevo Certificado`) → comprobar navegación directa al Detail View en Modo Alta, campos vacíos, etiquetas `*`, sin pestañas de hijos y sin formulario inline en el directorio.
2. **Cascada Padre-Hijo en Vivo:**
   - Elegir `Sector 17` en `Sector IAF *` → comprobar que `Sub-Sector IAF *` muestra únicamente sub-sectores `17.*`.
   - Cambiar a `Sector 28` → comprobar que `Sub-Sector IAF *` se resetea y muestra únicamente `28.*`.
   - Completar todos los campos obligatorios y guardar → comprobar transición a Modo Lectura del nuevo certificado con todos los controles `disabled`.
3. **Modo Lectura vs. Modo Edición:**
   - En Modo Lectura, comprobar que los 5 selectores padres y 3 campos directos aparecen deshabilitados y visualmente alineados con el modo edición, y que los botones `→` navegan al padre correspondiente.
   - Pulsar `✏️ Editar` → comprobar habilitación inmediata y pre-llenado exacto de los 8 campos.
4. **Pestañas `Fecha` y `Contacto`:**
   - Abrir la pestaña `Fecha` y la pestaña `Contacto` → confirmar que únicamente se muestra la tabla de datos (sin texto introductorio izquierdo ni botones `+ Registrar Fecha` / `+ Agregar Contacto`).
5. **Responsividad y Consola Limpia:**
   - Validar en `375×812` (móvil), `1280×800` y `1440×900` / `1920×1080` (escritorio): `scrollWidth <= innerWidth` (cero scroll horizontal) y cero errores de aplicación en consola del navegador.
