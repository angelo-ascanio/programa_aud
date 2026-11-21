# Step 4.1 — `Vínculo`: Multi View por `Conglomerado` y Detail View por Cajas Agrupadoras

## 1. Objetivo y Alcance
Reestructurar la sección **`Vínculo`** (`#/auditorias/vinculo`) entendiendo su operación natural **Many-to-One** (múltiples organizaciones/certificados → cajas de vínculo dentro de un **`Conglomerado`**), cumpliendo `public/prompting/future_changes.txt`:
1. Cambiar la **Multi View** de `Vínculo` para estar centrada en registros de **`Conglomerado`** (mostrando cuántos certificados están `LIBRE`, cuántas cajas existen y su composición).
2. Reemplazar la Detail View anterior y **eliminar la Children Zone** por completo en favor de un **Espacio de Cajas Agrupadoras** interactivo para el `Conglomerado` seleccionado:
   - Un pool superior/lateral de certificados **`LIBRE`** pertenecientes a todas las organizaciones del conglomerado.
   - Botón **`+ Nueva Caja`** y tarjetas/cajas dinámicas donde encajar uno o más certificados juntos.
   - Metadatos editables por caja: **`Naturaleza`** (`INDIVIDUAL`, `COMBINADA`, `INTEGRADA`, `MIXTA`), **`Etiqueta`**, **`Sitio Temporal`** (`requiere_sitio_temporal` boolean) y **`Notas`**.
   - Soporte fluido para patrones complejos reales (ej. 2 organizaciones donde Org A tiene `3×{9001, 14001, 45001}` encadenados en 3 cajas sobre sitios 1..3 + 1 certificado en 4º sitio, y Org B aporta su certificado `ISO 22000` al 4º sitio para formar juntos una 4ª caja `COMBINADA`).
   - Movimientos fluidos: asignar desde `LIBRE` hacia una caja, mover un certificado de una caja a otra, aislar un certificado creando una caja individual nueva, o devolverlo a `LIBRE` (con compuerta de seguridad si tiene auditorías activas).
   - **Clic directo en cualquier certificado** dentro de las cajas o pool `LIBRE` abre su **`Resumen` Detail View** (posición más reciente).
   - Recordar: `Vínculo` NO muestra el Breadcrumb In-Card `1..7 + Resumen` (por ser vista de `Conglomerado`), aunque conserva el botón estándar `Volver` y `+ Auditoría` si aplica.

---

## 2. Archivos y Áreas Afectadas
- `src/lib/vinculoDomain.ts` (tipos de resumen por `Conglomerado`, validador y planner de movimientos entre `LIBRE` y cajas `vinculo_certificado`, auto-inferencia de `Naturaleza`, compuerta de auditorías activas al extraer de caja)
- `src/views/vinculoView.ts` (Multi View sobre `Conglomerado` + Detail View Workspace de Cajas sin children tabs)
- `src/main.ts` (persistencia de creación de cajas, actualización de metadatos de caja, reasignación `vinculo_certificado_miembro`, retorno a `LIBRE` mediante `archive_record` y click-through a `Resumen`)
- `src/lib/vinculoDomain.test.ts` (pruebas de patrones multi-sitio, multi-org, movimientos entre cajas y protecciones)

---

## 3. Tareas Detalladas de Implementación

### 3.1 Multi View Basada en `Conglomerado` (`vinculoView.ts` + `vinculoDomain.ts`)
- En `vinculoDomain.ts`:
  - `buildConglomeradoVinculoSummaries({ conglomerados, organizaciones, certificados, vinculos, auditPrograms })`:
    - Genera 1 fila/tarjeta por cada `Conglomerado` visible según RBAC (`ADMIN`/`WORKER`: todos; `CLIENT`: conglomerados con al menos 1 org autorizada, mostrando estrictamente conteos/nombres filtrados a su alcance Nivel 2; `AUDITOR`: lectura acotada si aplica).
    - Campos calculados:
      - `nombreConglomerado`, `codigoGrupo`, `organizacionesCount`
      - `totalCertsCount`, `freeCertsCount` (`LIBRE`), `boxedCertsCount`
      - `boxesCount` y resumen compacto de naturalezas (`2 Combinadas · 1 Individual`)
- En `vinculoView.ts`:
  - `renderUniversalTemplate` con tabla `table-fixed` (`<colgroup>` sumando `100%`), cero `<button>` en `<tbody>`:
    - Columnas: `Conglomerado & Código` (`34%`), `Organizaciones` (`24%`), `Cajas Configuradas` (`24%`), `Libres / Comprometidos` (`18%`).
    - Facetas reactivas: `Con certificados LIBRE` / `Todos en cajas`, `Composición` (`Multi-empresa` / `Sola`), `Naturaleza activa`.
    - Clic en fila o tarjeta (`data-action="select-vinculo-conglomerado" data-conglomerado-id="..."`) abre el Workspace de Cajas de ese `Conglomerado`.

### 3.2 Detail View: Espacio de Cajas Agrupadoras (`vinculoView.ts`)
- **Cabecera del Detalle:**
  - Titular del `Conglomerado`, badge de cobertura (`X/Y certificados en cajas · Z libres`), botón `← Volver` a Multi View, botón `+ Nueva Caja` (`isStaff`), y botón `+ Auditoría` opcional pre-filtrado al conglomerado.
  - **Sin Breadcrumb In-Card `1..7` y sin Children Tabs.**
- **Bandeja `LIBRE` (Certificados sin caja):**
  - Tarjetas limpias mostrando: `numero_certificado`, `norma`, `organizacion_nombre`, sitios principales declarados.
  - Clic sobre el título/código del certificado (`data-action="open-cert-resumen" data-cert-id="..."`) navega a `auditorias/resumen` de ese certificado.
  - Para mover un certificado `LIBRE` (solo `isStaff`), usar acciones accesibles sin drag-only dependency (ej. selector compacto *"Mover a caja..."* + botón `Asignar`, o botón **`Crear caja individual`** que abre una caja `INDIVIDUAL` de 1 certificado en 1 clic, además de soporte opcional drag-and-drop progresivo accesible por teclado/clic).
- **Grid de Cajas (`vinculo_certificado`):**
  - Cada caja se renderiza como una tarjeta interactiva diferenciada con:
    - Cabecera editable (inline o toggle `Editar caja`):
      - **`Etiqueta`** (ej. *"Sitio 1 — SGC+SGA+SST"*, *"Sitio 4 — Combinada Alimentos"*)
      - **`Naturaleza`** (`INDIVIDUAL`, `COMBINADA`, `INTEGRADA`, `MIXTA`) — con sugerencia automática al cambiar de 1 certificado a múltiples normas/organizaciones
      - Toggle **`Sitio Temporal`** (`requiere_sitio_temporal`)
      - **`Notas`** opcionales
    - Lista de tarjetas de certificados dentro de la caja:
      - Cada tarjeta muestra `numero_certificado`, `norma`, `organizacion_nombre` (útil cuando se combinan 2 orgs distintas en la misma caja como en el 4º sitio del ejemplo) y botón directo `Abrir Resumen →` (`data-action="open-cert-resumen"`).
      - Controles de movilidad (`isStaff`):
        - Selector **"Mover a otra caja"** (incluyendo opción *"Devolver a LIBRE"* y *"Aislar en caja nueva"*).
        - Indicador visual cuando un certificado tiene **auditorías activas** en ese vínculo, explicando si el retorno a `LIBRE` está bloqueado por integridad ISO (y evitando fallo sorpresivo en SQL).
    - Acción **`Archivar caja`** cuando la caja queda vacía (vía `archive_record`, nunca `.delete()`).

### 3.3 Flujo Persistente en `vinculoDomain.ts` y `src/main.ts`
- Validar en `vinculoDomain.ts`:
  - Un certificado no puede pertenecer simultáneamente a dos cajas activas.
  - Al mover un certificado a otra caja dentro del mismo conglomerado: archivar (`archive_record`) el `vinculo_certificado_miembro` origen (solo si no viola bloqueo de auditorías activas no archivadas) e insertar/reactivar en la caja destino, re-evaluando naturaleza recomendada si pasa a 1 solo miembro o ≥2 miembros multi-norma/multi-org.
  - Respetar Zero-UUID en etiquetas, selectores y mensajes de error.

---

## 4. Lista de Verificación
- [ ] Multi View de `Vínculo` lista `Conglomerado`s con conteo `LIBRE` y resumen de cajas.
- [ ] Detail View no tiene children zone ni Breadcrumb In-Card `1..7`.
- [ ] Permite crear múltiples cajas, editar `Naturaleza` / `Etiqueta` / `Sitio Temporal` / `Notas`, y mover certificados libremente entre `LIBRE`, cajas nuevas y cajas existentes (validando ejemplo multi-org `3×3 + 4º sitio combinada`).
- [ ] Hacer clic en un certificado dentro de una caja o `LIBRE` abre su **`Resumen` Detail View**.
- [ ] Bloquea devolución a `LIBRE` de certificados con auditorías activas mostrando mensaje amigable sin UUIDs.
- [ ] Pruebas en `vinculoDomain.test.ts` y verificación en navegador pasando.
