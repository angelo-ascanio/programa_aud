# Step 7.1 — División de `Programa` en `4. Proceso` y `5. Turno` (Matriz Anti-Fatiga)

## 1. Objetivo y Alcance
Dividir el actual paso monolítico `Programa` en dos pasos independientes de primer nivel tanto en el menú del Bloque 1 como en el Breadcrumb In-Card, siguiendo `public/prompting/future_changes.txt`:
1. **`4. Proceso` (`#/auditorias/proceso`, manteniendo alias `#/auditorias/programa`):**
   - Multi View basada en **Certificados**.
   - Detail View con selector único de auditoría (`◀ / ▶`).
   - Lista todos los sitios de esa auditoría; para cada sitio permite elegir qué procesos serán auditados **estrictamente de la lista de procesos configurados para ese sitio (`procesos_por_sitio`)**, incluyendo una acción rápida **`Seleccionar todos`** por sitio (y toggle inverso *"Limpiar sitio"*).
2. **`5. Turno` (`#/auditorias/turno`, incluido explícitamente en el Breadcrumb In-Card):**
   - Multi View basada en **Certificados**.
   - Detail View con selector único de auditoría (`◀ / ▶`).
   - Recibe todos los pares **`Sitio ↔ Proceso`** seleccionados en `4. Proceso` y requiere elegir **al menos 1 turno** por cada proceso en cada sitio.
   - Los turnos seleccionables para un proceso están **estrictamente restringidos a los turnos declarados en ese sitio (`turnos_por_sitio`)** (ej. si el sitio declara solo 1 turno de los 4 existentes en la empresa, solo ese 1 turno aparece seleccionable).
   - **Diseño UX Anti-Fatiga ("curate every issue and diminish the repeating factor"):** Resolver el escenario donde la sede principal tiene 10 procesos y otra sede 3 procesos (13 pares con procesos repetidos entre sitios) mediante herramientas de velocidad masiva sin perder control granular.

---

## 2. Archivos y Áreas Afectadas
- `src/lib/programaCertificadoDomain.ts` (desacoplamiento de progreso independiente `Proceso` vs `Turno`, helpers de selección masiva por sitio, normalizador de procesos homónimos entre sitios)
- `src/lib/turnoDomain.ts` (motor de matriz `Proceso × Turno de Sitio`, acciones batch: *"Aplicar turno(s) a pendientes del sitio"*, *"Aplicar columna completa"*, *"Replicar turnos a procesos homónimos en otros sitios"*)
- `src/views/programaProcesosView.ts` (refactor a vista completa Certificate-Based + Detail View con tarjeta por sitio y botón `"Seleccionar todos"`)
- `src/views/programaTurnosView.ts` (refactor a vista completa Certificate-Based + Detail View con navegación rápida entre sitios + Matriz interactiva anti-fatiga)
- `src/views/programaView.ts` (deprecar uso directo como tab único / redirigir compatibilidad hacia `programaProcesosView.ts`)
- `src/views/auditoriasView.ts` y `src/main.ts` (rutas `proceso` y `turno`, persistencia masiva eficiente en `programa_proceso_auditoria` y `turnos_proceso_sitio_auditoria`)
- `src/lib/programaProcesosView.test.ts` y tests unitarios para matriz de `turnoDomain.ts`

---

## 3. Tareas Detalladas de Implementación

### 3.1 `4. Proceso` (`programaProcesosView.ts` + `programaCertificadoDomain.ts`)
- **Multi View (`#/auditorias/proceso`):**
  - 1 fila/card por `Certificado`, mostrando: `Certificado & Org`, `Última Auditoría`, `Sitios / Procesos Auditados` (ej. `13 / 15 proc. en 2 sitios`) y badge `Pendiente` / `Completo ✓`.
- **Detail View (`auditSectionShell`, `◀ / ▶`):**
  - Renderiza un bloque/tarjeta acordeón o expandida por **cada sitio incluido en `1.3 Sitio`** para esa auditoría:
    - Cabecera del sitio: Nombre del sitio, contador `X de Y procesos seleccionados`, y botones de acción rápida en la cabecera del sitio:
      - **`☑ Seleccionar todos`** (marca todos los `procesos_por_sitio` elegibles de ese sitio en una sola operación batch).
      - **`☐ Limpiar`** (desmarca los procesos de ese sitio si se requiere reiniciar).
    - Lista de procesos elegibles del sitio (exclusivamente filtrados vía `procesos_por_sitio` de ese `id_sitio`): checkboxes grandes táctiles con etiqueta de proceso + badge discreto histórico si aplica.
    - Guardado inmediato o batch por sitio persistiendo sobre `programa_proceso_auditoria` (soft-delete vía `archive_record` al desmarcar, `INSERT` al marcar).

### 3.2 `5. Turno` (`programaTurnosView.ts` + `turnoDomain.ts`) — Solución UX Anti-Fatiga
Para eliminar la tediosa selección repetitiva 1-a-1 en auditorías multi-sitio (ej. 10 procesos en Principal + 3 en Sucursal), implementar una arquitectura de **Doble Navegación + Matriz de Cobertura**:
- **Multi View (`#/auditorias/turno`):**
  - Basada en **Certificados**: `Certificado & Org`, `Última Auditoría`, `Cobertura Turnos` (`10 / 13 Sitio↔Proceso cubiertos`), `Estado` (`Pendiente` / `Completo ✓`).
- **Detail View (`auditSectionShell`, `◀ / ▶`):**
  1. **Barra Sticky de Navegación de Sitios + Progreso en Vivo:**
     - Pills por cada sitio (`Principal · 10/10 ✓`, `Sucursal Norte · 0/3 ⚠️`, más pill **`Todos los sitios`**) + filtro rápido **`Solo pendientes (X)`** para enfocar únicamente lo que falta.
     - Botones previos/siguientes de sitio (`← Sitio anterior` / `Sitio siguiente →`) para recorrer todos los sitios en secuencia limpia.
  2. **Matriz `Proceso × Turno del Sitio` (Elimina clicks repetitivos):**
     - Columnas dinámicas = **exclusivamente los turnos declarados en ese sitio (`turnos_por_sitio`)** (si el sitio tiene 1 solo turno, puede mostrarse botón de 1 clic *"Auto-cubrir todo el sitio con su único turno"*).
     - Filas = los procesos auditados seleccionados en `4. Proceso` para ese sitio (con ancla `#` y salto rápido si un proceso está cubierto).
     - **Aceleradores de productividad masiva (en toolbar encima de la matriz, nunca dentro de `<tbody>`):**
       - **Auto-asignar sitios de turno único:** Si un sitio tiene exactamente `1` turno habilitado, botón 1-clic **"Cubrir pendientes con turno único"** (o toggle por defecto).
       - **Aplicar turno(s) a todos los procesos pendientes del sitio:** Selector/chips de turno arriba + botón **`Aplicar a X procesos pendientes`** (resuelve 10 procesos en 2 clics).
       - **Click en cabecera de columna del Turno (`☑ Marcar todos [Turno X]`):** Activa/desactiva ese turno para todos los procesos visibles del sitio en un clic.
       - **Propagación inteligente a homónimos (`Propagar a procesos homónimos`):** Si el usuario configura los turnos de *"Producción"* o *"Calidad"* en el Sitio Principal, un botón contextual permite copiar esa selección hacia *"Producción"* / *"Calidad"* en los demás sitios de la auditoría, haciendo intersección automática solo con los turnos realmente válidos en cada sitio destino (evitando asignaciones inválidas).
  3. **Validación de Completitud de `Turno`:**
     - Un par `(Sitio ↔ Proceso)` está completo cuando tiene **al menos 1 turno** asignado dentro de `turnos_por_sitio` de ese sitio.
     - El paso `5. Turno` alcanza estado **`COMPLETO`** cuando el `100%` de los pares seleccionados en `4. Proceso` tienen `>= 1` turno válido.

---

## 4. Lista de Verificación
- [ ] Menú Bloque 1 y Breadcrumb In-Card muestran `4. Proceso` y `5. Turno` como pasos separados.
- [ ] `4. Proceso` filtra procesos estrictamente desde `procesos_por_sitio` por sitio y ofrece **"Seleccionar todos"** por sitio.
- [ ] `5. Turno` filtra turnos estrictamente desde `turnos_por_sitio` por sitio, requiere `>= 1` turno por cada `(Sitio ↔ Proceso)`, permite recorrer fácilmente sitios/procesos e incluye matriz con selección por columna, aplicación a pendientes, auto-cobertura de turno único y propagación a homónimos.
- [ ] Alias `#/auditorias/programa` redirige de forma segura a `proceso`.
- [ ] Cero `<button>` dentro de `<tbody>` en tablas universales, pruebas unitarias pasando y build limpio.
