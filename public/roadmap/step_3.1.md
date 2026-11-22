# Step 3.1 — Interfaz de Usuario: Botón `Compartir`, Modal Limpio y Desvinculación para `Contacto` y `Turno`

## 1. Objetivo y Alcance Estricto
Implementar la experiencia de usuario simple y directa para **`Contacto`** y **`Turno`** dentro del Detalle de Certificado (`certificadoView.ts`) y sus respectivas vistas de detalle (`contactoView.ts`, `turnoView.ts`):
- Botón **`Compartir`** en las barras de herramientas de `Certificado → Contactos` y `Certificado → Turnos` (visible únicamente para `ADMIN` / `WORKER` aprobados).
- Nuevo componente modal reutilizable `src/views/shareModalView.ts` (selección de registros origen + selección de certificados destino del mismo Conglomerado).
- Indicadores discretos de registro compartido y botón **`Desvincular`** seguro en el detalle del contacto o turno cuando se visualiza desde un certificado receptor.

**Límites estrictos:**
- **NO** implementar aún el botón `Compartir` ni el panel de resolución de cláusulas de `Proceso` y `Sitio` (corresponden al Step 3.2).
- Mantener **estrictamente** `table-fixed`, `<colgroup>` sumando `100%` y **`0 <button>` dentro de `<tbody>`** en todas las tablas hijas de `certificadoView.ts`.

---

## 2. Archivos Afectados
- `src/views/shareModalView.ts` *(nuevo módulo de vista para el modal `Compartir`)*
- `src/views/shareModalView.test.ts` *(tests de renderizado HTML puro, RBAC, Zero-UUID y no-fuga `CLIENT`)*
- `src/views/certificadoView.ts` *(botón `Compartir` junto a `+ Nuevo Contacto` / `+ Nuevo Turno`, y badge sutil de compartido en columna informativa de nombre/descripción sin añadir `<button>` en `<tbody>`)*
- `src/views/contactoView.ts` *(badge de origen/compartición segura según RBAC y botón `Desvincular` para staff cuando el contacto es compartido en el certificado activo)*
- `src/views/turnoView.ts` *(badge de compartición y botón `Desvincular` cuando se accede desde un certificado con `turno_certificado_compartido`)*
- `src/main.ts` *(estado reactivo del modal `shareModal`, manejadores de clic/checkbox/confirmación, llamada a `persistShareContactos`/`persistShareTurnos`/`persistUnlinkSharedChild`, recarga y toast Zero-UUID)*

---

## 3. Decisiones Técnicas Detalladas

### 3.1 Botón `Compartir` en Pestañas Hijas de `certificadoView.ts`
1. En `renderContactosChildTab`:
   - Junto al botón `+ Nuevo Contacto` (en el contenedor superior flex derecha, visible solo si `isStaff`):
   - Añadir botón secundario limpio:
     ```html
     <button type="button" data-action="open-share-child-modal" data-share-kind="contacto" data-cert-id="...">
       Compartir
     </button>
     ```
   - Deshabilitado con `title` explicativo si no hay contactos registrados en el certificado o si no existen otros certificados elegibles en el Conglomerado (o mostrar aviso informativo al abrir).
   - Dentro de la columna `Nombre Completo` (texto/badge no interactivo, `0 <button>`): si el contacto es compartido, mostrar chip discreto `Vinculado` / `Compartido` (`text-[10px]`).
2. En `renderTurnosChildTab`:
   - Junto al botón `+ Nuevo Turno` (solo `isStaff`), añadir botón **`Compartir`** (`data-action="open-share-child-modal" data-share-kind="turno" data-cert-id="..."`).
   - En columna `Turno Operativo`, chip discreto si está compartido en múltiples certificados del conglomerado.

### 3.2 Modal Reutilizable `src/views/shareModalView.ts`
Diseño limpio y directo acorde a `future_changes.txt` (*"when click, then we must select which records to share, and then which certificates from the same Conglomerado"*):
- **Cabecera:** Título contextual (`Compartir Contactos de [Certificado X]` / `Compartir Turnos de [Certificado X]`), subtítulo con el nombre del **Conglomerado**.
- **Paso 1 — Registros a compartir:**
  - Checklist con botones rápidos `Seleccionar todos` / `Limpiar`, permitiendo elegir registros individuales (ej. marcar Contacto "A" y "B", dejando "C" desmarcado).
  - Muestra datos clave sin UUIDs (`nombre` + `cargo` + canales en `Contacto`; `descripcion` + `hora_entrada – hora_salida` en `Turno`).
- **Paso 2 — Certificados destino del mismo Conglomerado:**
  - Lista de certificados elegibles (`getEligibleShareTargetCertificates`), mostrando `numero_certificado`, `organizacion_nombre`, `norma_codigo` y `estatus`.
  - Si un certificado ya comparte alguno de los registros elegidos, muestra indicador `"Ya vinculado"` (evita duplicados).
  - En `Contacto`: si existe conflicto de nombre duplicado en destino (`DUPLICATE_CONTACT_NAME`), alerta inline clara impidiendo enviar hasta corregir/desmarcar.
  - En `Turno`: checkbox simple pre-marcado `"Asignar automáticamente a las sedes activas (Sitio 0 / sucursales) de los certificados destino"` para que el turno quede usable de inmediato en auditorías.
- **Acciones:** `Cancelar` y `Confirmar y Compartir` (`id="confirmShareChildBtn"`).
- **Seguridad:** Todo renderizado pasa por `escapeHtml()`, Zero-UUID garantizado, y el modal nunca se monta ni se abre para `CLIENT` o `AUDITOR`.

### 3.3 Vista Detalle Hija y `Desvincular` (`contactoView.ts`, `turnoView.ts`)
- En `contactoView.ts`:
  - Cuando el contacto pertenece a otro certificado origen pero se visualiza desde Certificado "Y":
    - Para `ADMIN` / `WORKER`: mostrar `"Compartido desde [Certificado X]"` y botón **`Desvincular de este certificado`** (`data-action="unlink-shared-child" data-share-table="contacto_certificado_compartido"`).
    - Para `CLIENT`: si el certificado origen pertenece a otra organización no autorizada (`!authorizedOrgIds.has(ownerOrgId)`), mostrar únicamente `"Contacto compartido dentro del conglomerado"` **sin revelar el código del Certificado X ni el nombre de Org A**. Jamás mostrar botón `Desvincular` a `CLIENT` ni `AUDITOR`.
- En `turnoView.ts`:
  - Mostrar badge de compartido a nivel certificado cuando corresponda y permitir a `ADMIN`/`WORKER` desvincular el enlace `turno_certificado_compartido` desde el contexto del certificado receptor.

---

## 4. Criterios de Aceptación y Verificación
1. **Tests de Vista (`src/views/shareModalView.test.ts`):**
   - `ADMIN` / `WORKER` renderizan botón `Compartir` en `Contactos` y `Turnos`; `CLIENT` y `AUDITOR` reciben `0` botones `Compartir` / `Desvincular`.
   - `cert-tab-contactos` y `cert-tab-turnos` mantienen exactamente `0 <button>` dentro de `<tbody>` y suma `<colgroup>` = `100%`.
   - Aislamiento Nivel 2: en `contactoView.ts`, `CLIENT` autorizado solo en Org B no ve strings de Org A / Cert X en el HTML renderizado.
   - Modal permite marcar A y B sin C y muestra correctamente certificados del mismo conglomerado (y estado vacío amigable si el conglomerado solo tiene 1 certificado).
2. Ejecutar `npm run lint && npm test && npm run build` en verde.
