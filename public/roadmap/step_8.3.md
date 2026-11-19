# Step 8.3: `Programa` — Mini-Paso 8B (`Turnos` Multi-Turno por Proceso) y Cierre del Programa Operativo

## 1. Identificador, Nombre y Dependencias
* **Step ID:** `8.3`
* **Nombre Corto (UI):** `Programa` → Mini-Paso **8B `Turnos`**
* **Bloque / Sub-sección:** Bloque 1 — `Auditoría` → `Programa`
* **Dependencias:** `step_8.2.md`, `step_8.1.md`

---

## 2. Alcance Exacto y Reglas de Negocio
1. **Asignación de `1..N` Turnos por Cada Proceso Auditado (`turnos_proceso_sitio_auditoria`):**
   * Por cada sitio seleccionado y cada proceso marcado en el Mini-Paso 8A (`procesos_sitio_auditoria`):
     * Lista todos los turnos configurados para ese sitio maestro (`turnos_por_sitio`, formateados vía `formatTurnoTime(hora_entrada) – formatTurnoTime(hora_salida)`).
     * Permite seleccionar **1 o más turnos (`1..N`)** con chips/checkboxes táctiles (`min-h-[36px]`).
2. **Garantía de Existencia de `turnos_sitio_auditoria`:**
   * En la BD (`01_creacion.sql`), `turnos_proceso_sitio_auditoria` referencia a `turnos_sitio_auditoria(id)`.
   * Al marcar un turno para un proceso en Mini-Paso 8B, si la fila correspondiente en `turnos_sitio_auditoria` para `(id_sitios_por_auditoria, id_turnos_por_sitio)` aún no existe activa, el handler la crea automáticamente (upsert/ensure) y luego inserta en `turnos_proceso_sitio_auditoria`.
   * Al desmarcar un turno del proceso, se archiva la fila de `turnos_proceso_sitio_auditoria` mediante `archive_record`.
3. **Visibilidad de Cobertura Turnos y Atajo Masivo:**
   * Cada tarjeta de proceso muestra badge `"N turno(s)"` en esmeralda si `N >= 1` o `"⚠️ Pendiente turno"` en ámbar si `N === 0`.
   * Botón útil por sitio: **"Aplicar Turno Principal a procesos sin turno"** (cuando el sitio solo tiene 1 turno o se desea cubrir rápidamente los pendientes).
4. **Cierre del Paso 8 y Puente a Siguientes Pasos:**
   * Cuando `completionState === 'COMPLETO'`, el header del Detail View cambia el chip de `Programa` a **`✓ Programa Completo`** y muestra acceso directo a **`Calendario`**, **`Asignación` (Paso 7)** si aún falta cuadrar auditores, o **`Resultado` (Paso 10)** si la auditoría ya está lista para ejecución/cierre.

---

## 3. Cambios Exactos en Base de Datos
Ninguno adicional (usa `turnos_sitio_auditoria` y `turnos_proceso_sitio_auditoria` con triggers de integridad ISO 17021-1 ya implementados en `01_creacion.sql`).

---

## 4. Lógica Pura Consumida
* `resolveSiteShiftOptionsForProcess`, `buildProcessHistoryForSite`, `buildAuditProgramaSummaryRows` desde `src/lib/programaCertificadoDomain.ts`.
* `formatTurnoTime` desde `src/lib/turnoDomain.ts`.

---

## 5. Orquestación UI y Estado (`src/views/programaTurnosView.ts`, `src/views/programaView.ts` y `src/main.ts`)
* Handler en `src/main.ts`:
  * `toggleProcessShiftAssignment(auditId, sitePlanId, procesoSitioAuditoriaId, turnoPorSitioId)`:
    1. Valida `assertValidUuid` en todos los IDs y `isApprovedStaffProfile`.
    2. Busca/crea fila activa en `turnos_sitio_auditoria` para `(sitePlanId, turnoPorSitioId)`.
    3. Si ya existe activa en `turnos_proceso_sitio_auditoria`, llama `archive_record('turnos_proceso_sitio_auditoria', id, 'Turno desmarcado en Paso 8B')`. Si no existe, inserta `(id_procesos_sitio_auditoria, id_turnos_sitio_auditoria)`.
    4. Refresca `programacionAudits`.
  * Si un sitio no tiene turnos maestros configurados en `turnos_por_sitio`, muestra alerta constructiva con enlace directo (`data-parent-nav`) hacia **`Certificado → Sitio`** (solo `ADMIN`/`WORKER`) para definir los turnos del sitio maestro.

---

## 6. Matriz RBAC del Paso 8.3

| Rol | Ve Turnos por Proceso (8B) | Marca/Desmarca Turnos (`1..N`) |
| :--- | :--- | :--- |
| **`ADMIN`** | Todos | Sí |
| **`WORKER`** | Todos activos | Sí |
| **`AUDITOR`** | Solo auditorías asignadas | No (solo lectura) |
| **`CLIENT`** | Solo sus certificados | No (solo lectura) |

---

## 7. Pruebas Automatizadas (`src/lib/programaCertificadoDomain.test.ts` + render test)
1. Verificar que marcar múltiples turnos (`Turno 1` + `Turno 2`) sobre un proceso actualiza `completionState` de `'PENDIENTE_TURNOS'` a `'COMPLETO'`.
2. Verificar caso borde: sitio sin `turnos_por_sitio` muestra aviso sin UUIDs y enlace seguro al sitio maestro solo para `ADMIN`/`WORKER`.
3. Verificar Zero-UUID y ausencia de botones en `<tbody>` en la vista Multi View.

---

## 8. Criterios de Aceptación (Done Criteria)
- [ ] Mini-Paso 8B (`Turnos`) permite asignar `1..N` turnos del sitio a cada proceso seleccionado en 8A.
- [ ] Auto-crea `turnos_sitio_auditoria` de forma transparente antes de insertar `turnos_proceso_sitio_auditoria`.
- [ ] Los 3 filtros (`Pendientes de Procesos`, `Pendientes de Turnos`, `Completos`) reflejan en tiempo real la situación de cada certificado.
