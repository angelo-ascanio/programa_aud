# Step 9.1 — Nueva Sección `Resumen`, Motor Automático `estatus_auditoria` y Sincronización `Calendario`

## 1. Objetivo y Alcance
Construir la nueva sección **`Resumen`** (`#/auditorias/resumen`) como tablero ejecutivo por Certificado / Auditoría y el motor automático **`estatus_auditoria`** que reconoce pasos ejecutables en paralelo, conforme a `public/prompting/future_changes.txt`:
1. **Motor Determinista `estatus_auditoria` (`resumenDomain.ts`):**
   - Evalúa de forma independiente y paralela el estado real (`COMPLETO`, `EN_PROGRESO`, `PENDIENTE`, `NO_APLICA`) de cada etapa de la auditoría:
     - `1.1 Designación → Tipo`
     - `1.2 Designación → Fecha` *(programada)*
     - `1.3 Designación → Sitio`
     - `1.4 Designación → Temporal` *(activo/desactivado; completo automáticamente si OFF, o cuando tiene ubicación + tiempo si ON)*
     - `2. Tiempo` *(todos los sitios permanentes con `dias > 0`)*
     - `3. Auditor` *(todos los sitios permanentes + temporal si ON balanceados con `SUM == requerido`)*
     - `4. Proceso` *(al menos 1 proceso auditado en cada sitio seleccionado)*
     - `5. Turno` *(100% de pares `Sitio ↔ Proceso` con `>= 1` turno válido del sitio)*
     - `6. Resultado` *(fechas reales cargadas + 0 NCs abiertas/vencidas o NCs con fechas de cierre completadas)*
     - `7. Revisión` *(`fecha_revision` registrada)*
   - A partir de esa matriz paralela (permitiendo por ejemplo avanzar en `Proceso/Turno` o `Auditor` al mismo tiempo después de `Sitio`/`Tiempo`), genera:
     - **`estatus_auditoria`** automático y legible (ej. `'En Designación'`, `'Por Asignar Tiempo'`, `'Planificación en Curso'`, `'Programada / Lista para Ejecutar'`, `'En Cierre de Hallazgos'`, `'Pendiente de Revisión'`, `'Completada'`) — consumido también en **`Conglomerado → Auditorías`** (Step 3.1) y badges de **`Calendario`**.
     - Lista inteligente de **"Próximas acciones recomendadas"** (todas las secciones actualmente desbloqueadas que aún tienen trabajo pendiente en paralelo).
2. **Vista `Resumen` (`resumenView.ts`):**
   - **Multi View (`#/auditorias/resumen`):** Basada en **Certificados** (mostrando última auditoría, `estatus_auditoria` automático, porcentaje/conteo de pasos completos, y próximas acciones).
   - **Detail View (`auditSectionShell`, selector `◀ / ▶`, Breadcrumb In-Card con `Resumen` resaltado):**
     - Cabecera resumen con **`estatus_auditoria`** prominente y barra de progreso global (`X / Y secciones listas`).
     - Tarjetas condensadas por cada sección (`1.1 Tipo`, `1.2 Fecha`, `1.3 Sitio`, `1.4 Temporal`, `2. Tiempo`, `3. Auditor`, `4. Proceso`, `5. Turno`, `6. Resultado`, `7. Revisión`), cada una mostrando:
       - Dato aglutinado esencial en 1–2 valores (ej. *"Seguimiento 1"*, *"18–20 Nov 2026"*, *"3 sitios · Temporal OFF"*, *"6.5 días totales"*, *"2 auditores · 6.5/6.5 d ✓"*, *"13 procesos · 13/13 turnos ✓"*, *"2 NCs (1 cerrada)"*, *"Revisada 25/11/2026"*).
       - Badge de estado (`Completo ✓`, `En progreso`, `Pendiente`, `No aplica`).
       - Clic en cualquier tarjeta navega **directamente a la Detail View de esa sección** conservando exactamente el mismo `(selectedCertId, selectedAuditId)`.
3. **Sincronización de `Calendario` (`calendarioView.ts`):**
   - Reemplazar referencias antiguas (`asignacion`, `programa`, `designacion/tipo` como única entrada de fecha) por las rutas y labels nuevos (`designacion/fecha`, `auditor`, `proceso`, `turno`, `resumen`), mostrando `estatus_auditoria` unificado en eventos/tarjetas y permitiendo saltar tanto a la sección operativa pertinente como a `Resumen`.

---

## 2. Archivos y Áreas Afectadas
- **`src/lib/resumenDomain.ts` (nuevo):** motor puro de evaluación por sección, cálculo paralelo automático de `estatus_auditoria`, generador de tarjetas aglutinadas y detector de próximos pasos paralelos
- **`src/views/resumenView.ts` (nuevo):** Multi View basada en Certificados y Detail View tablero de tarjetas clickeables
- `src/lib/pipelineEngine.ts` y `src/lib/conglomeradoDomain.ts` (conectar `computeAuditStatusSummary` como fuente única de verdad para `estatus_auditoria`)
- `src/views/calendarioView.ts` (actualización de enlaces click-through y badges `estatus_auditoria`)
- `src/views/auditoriasView.ts` y `src/main.ts` (integración de `resumen`, handlers de navegación directa desde tarjetas hacia cualquier sección manteniendo `(selectedCertId, selectedAuditId)`)
- **`src/lib/resumenDomain.test.ts` (nuevo)** y `src/lib/calendarioDomain.test.ts`

---

## 3. Tareas Detalladas de Implementación

### 3.1 Motor Paralelo `estatus_auditoria` (`resumenDomain.ts`)
- Definir interfaz `AuditSectionSummaryCard`:
  - `key`: `'designacion/tipo' | 'designacion/fecha' | 'designacion/sitio' | 'designacion/temporal' | 'tiempo' | 'auditor' | 'proceso' | 'turno' | 'resultado' | 'revision'`
  - `stepTag`: ej. `'1.1'`, `'1.2'`, ..., `'7'`
  - `label`: ej. `'Tipo'`, `'Fecha'`, ..., `'Revisión'`
  - `status`: `'COMPLETO' | 'EN_PROGRESO' | 'PENDIENTE' | 'NO_APLICA'`
  - `headlineValue`: resumen corto de 1 línea con datos reales (ej. `"18/11/2026 – 20/11/2026"`, `"13/13 turnos"`)
  - `secondaryMeta`: detalle breve opcional (ej. `"Lote vinculado: 3 certificados"`, `"1 NC abierta"`)
  - `actionHint`: texto corto si falta algo (ej. `"Faltan 1.5 días por asignar auditor"`)
- **Reglas paralelas inteligentes:**
  - `Tiempo` (2) y `Proceso` (4) dependen de que exista al menos 1 sitio permanente en `1.3 Sitio`, pero pueden avanzar en paralelo una vez definidos los sitios.
  - `Auditor` (3) depende de `Tiempo` (2) (y `Temporal` si está ON).
  - `Turno` (5) depende de `Proceso` (4).
  - `Fecha` (1.2) y `Temporal` (1.4) pueden completarse en paralelo tras crear el lote en `+ Auditoría`.
  - `Resultado` (6) requiere `>= 1` fecha real y que todas las NCs tengan `fecha_cierre_real` (si tiene 0 NCs pero ya tiene fecha real, se considera `COMPLETO`).
  - `Revisión` (7) requiere `fecha_revision` informada.
  - **Cálculo del `estatus_auditoria` agregado:**
    - Evalúa qué combinación de bloques está completa y qué bloque(s) desbloqueados faltan para producir un estatus claro, determinista y accionable (`Pendiente de Designación`, `Planificación en Progreso`, `Lista / Programada`, `En Cierre de NC`, `Pendiente de Revisión`, `Completada ✓`) más chip de progreso (`7/10` o excluyendo N/A).

### 3.2 `Resumen` Multi View y Detail View (`resumenView.ts`)
- **Multi View (`#/auditorias/resumen`):**
  - Basada en **Certificados** (`renderUniversalTemplate`, `table-fixed`, `<colgroup>` = `100%`, facetas por `estatus_auditoria`, `Norma`, `Con NCs abiertas`).
  - Columnas: `Certificado & Org` (`32%`), `Última Auditoría` (`24%`), `Avance Secciones` (`18%`), `Estatus Auditoría` (`26%`).
- **Detail View (`auditSectionShell`):**
  - Header de tarjeta muestra `estatus_auditoria` (badge grande claro), código de auditoría/certificado y barra visual de avance.
  - Banner opcional **"Qué sigue (Paralelo)"**: botones pill rápidos hacia las 1–3 secciones desbloqueadas actualmente pendientes (ej. `Completar 3. Auditor →`, `Definir 5. Turno →`).
  - Grid responsive (`grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3`) con las tarjetas de todas las secciones:
    - Cada tarjeta completa es interactiva (`role="button"`, `tabindex="0"`, `data-action="jump-resumen-section"`, `data-target-subview="..."`, `data-cert-id="..."`, `data-audit-id="..."`).
    - Resalta borde/badge según `status` (`emerald` Completo, `amber/sky` En progreso / Pendiente, `slate` No aplica).
  - Al hacer clic en cualquier tarjeta, `src/main.ts` navega instantáneamente a esa Detail View preservando `(certId, auditId)` (permitiendo además volver a `Resumen` con 1 clic en el Breadcrumb In-Card).

### 3.3 Sincronización Global con `Conglomerado` y `Calendario`
- Conectar `computeAuditStatusSummary()` desde `conglomeradoDomain.ts` para que la pestaña `Conglomerado → Auditorías` muestre exactamente el mismo `estatus_auditoria` que `Resumen`.
- Conectar `calendarioView.ts` para que el clic en eventos del calendario lleve al detalle correcto (`designacion/fecha`, `auditor`, o `resumen`) y muestre el `estatus_auditoria` actualizado.

---

## 4. Lista de Verificación
- [ ] `computeAuditStatusSummary()` evalúa paralelamente todas las secciones `1.1..7` y produce un `estatus_auditoria` determinista compartido por `Resumen`, `Conglomerado → Auditorías` y `Calendario`.
- [ ] `Resumen` Multi View opera por Certificados y Detail View permite navegar con 1 clic desde cada tarjeta aglutinada a su sección exacta preservando `(certId, auditId)`.
- [ ] `Calendario` no tiene enlaces rotos hacia rutas viejas (`programa`/`asignacion`) ni eventos fantasma de vencimientos NC (`+15d/+45d`).
- [ ] Pruebas unitarias en `resumenDomain.test.ts` (cubriendo escenarios parciales, paralelos, con/sin Temporal y con/sin NCs) y build verde.
