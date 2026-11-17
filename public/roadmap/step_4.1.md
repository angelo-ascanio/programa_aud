# Step 4.1 — Planificador Visual Jerárquico y Panel Contextual "Historial del Certificado"

## Objetivo
Construir la experiencia UX central de planificación compleja dentro del Detail View de **`Auditoría`**:
1. **Panel Colapsable "Historial del Certificado"**, con contexto completo de auditorías previas, rotación de auditores (ISO/IEC 17021-1) y procesos pendientes de cobertura.
2. **Constructor Visual Tipo Árbol / Acordeón (`Certificado → Sitios → Procesos → Turnos → Auditores + Días`)**, con asignación de auditores en dos velocidades (1 clic a todo el sitio vs granular por proceso M:N), control en vivo del cuadre dual-bucket de `tiempo_auditoria` en pasos de `0.25d`, alertas de calificación (`auditor_esta_calificado`) y guardado progresivo no bloqueante.

---

## Archivos a Crear / Modificar
- **Crear:** `src/views/auditPlannerView.ts` (vistas declarativas puras para el Panel Histórico y el Constructor Árbol/Acordeón)
- **Modificar:** `src/views/programacionView.ts` (integración del Panel Histórico desde `'add' | 'edit' | 'read'` y pestaña `'planificacion'` con `auditPlannerView.ts`)
- **Modificar:** `src/main.ts` (handlers interactivos del árbol, toggles de sitios/procesos/turnos/auditores, inputs de `0.25d`, botón rápido "Asignar a todo el Sitio", recálculo in-place o re-render preservando acordeones abiertos y scroll, y persistencia hacia Supabase)
- **Crear / Ampliar:** `src/lib/auditPlannerUi.test.ts` (pruebas DOM/HTML de Cero-UUID, modos rápido vs granular, alertas de calificación, cuadre dual-bucket y RBAC)

---

## Especificación Técnica Detallada

### 1. Panel Colapsable "Historial del Certificado" (`renderCertificateHistoryPanel`)
Ubicado en el Detail View de `Auditoría` (entre Zona 2 y Zona 3, y disponible también en modo `'add'` apenas se selecciona un `id_certificado`):
1. **Cabecera del Acordeón Colapsable:**
   - Botón toggle `#toggleCertHistoryPanelBtn` (`aria-expanded`), título `"Historial del Certificado"`, y píldoras resumen: `{priorAuditsCount} auditoría(s) previa(s)`, alerta `"Rotación Líder"` (si aplica), y `"{uncoveredCount} proceso(s) sin cobertura reciente"`.
   - **Estado colapsado/expandido** guardado en `state.auditPlanning.isHistoryPanelOpen` (por defecto colapsado en `'read'` si no hay alertas, o expandible con 1 clic en `'add'`/`'edit'`).
2. **Contenido Expandido:**
   - **Banner de Continuidad y Rotación ISO/IEC 17021-1:**
     - Lista los nombres de procesos activos del certificado ausentes en la última auditoría previa para facilitar su priorización.
     - Advierte si algún auditor líder acumuló `>= 3` ciclos consecutivos previos en este certificado.
   - **Línea de Tiempo Compacta de Auditorías Previas (máximo 5 visibles + indicador si hay más):**
     - Cada tarjeta/fila de auditoría previa muestra: `codigo_auditoria`, `tipo_auditoria`, `metodologia`, rango de fechas, total de días (`tiempo_auditoria`), **Sitios visitados** (con días por sede), **Procesos auditados + turnos cubiertos**, y **Equipo Auditor** (rol y días por sede).
     - Enlace contextual limpio (o clic en la fila histórica) para navegar a esa auditoría previa vía `pushBreadcrumb`.

### 2. Constructor Visual Tipo Árbol / Acordeón (`renderAuditVisualPlanner`)
Renderizado dentro de la pestaña `'planificacion'` en Zona 3 (y en `'edit'` / `'read'` según RBAC: controles mutables solo para `ADMIN`/`WORKER` aprobados):

#### A. Barra Global de Salud y Cuadre del Plan (`Planner HUD`)
Sticky o fija en la cabecera del constructor:
- **Progreso de Completitud:** Barra visual + `%` calculado por `computeAuditPlanningStatus` (ej. `75% · Falta asignar turno en 1 proceso de Planta Valencia`).
- **Balance Dual-Bucket Global:**
  - `Requerido en Sitios (Cubo 1): 5.00d`
  - `Asignado a Auditores (Cubo 2): 4.50d`
  - Estado visual: `Faltan 0.50d` (ámbar), `Exceso +0.50d` (rojo) o `Cuadrado ✓` (verde esmeralda).
- **Filtro Rápido de Competencia en Selección de Auditores:**
  - Toggle `"Solo auditores calificados para esta Norma y Sub-Sector IAF"` (activado por defecto, apoyado en `auditor_esta_calificado`), con opción de ver a todos mostrando advertencia explícita `"Sin calificación completa"` si el staff decide incluir un experto técnico o auditor en entrenamiento.

#### B. Nivel 1 del Árbol — Nodos de `Sitio` del Certificado (`sitio`)
Ordenados con `sortSitesWithPrincipalFirst` (**Sitio 0 primero**):
- Cada sitio del certificado muestra una tarjeta-acordeón expandible (`state.auditPlanning.expandedSiteIds`):
  - **Checkbox / Switch de Inclusión en Auditoría** (`sitios_por_auditoria`): incluir/excluir sede (si tiene dependencias activas al excluir, invoca el flujo seguro `archive_record`).
  - **Encabezado del Sitio:** `Sitio #{numero_sitio} · {nombre_sitio}`, conteo de procesos del sitio (`procesos_por_sitio`) y turnos del sitio (`turnos_por_sitio`).
  - **Input Cubo 1 (`tiempo_auditoria` del sitio):** Control numérico `step="0.25"`, `min="0"`, botones `-0.25` / `+0.25` para ajuste rápido táctil, más selector opcional de modalidad en sede (`Presencial` / `Remota` / `Mixta`) si difiere de la general.
  - **Badge de Cuadre del Sitio:** `{siteAssignedDays}d / {siteRequiredDays}d · Cuadrado ✓` (o delta).

#### C. Nivel 2 del Árbol — Checklist de `Procesos del Sitio` + Chips de `Turnos`
Dentro de cada `sitio` incluido y expandido:
- **Guardia de sitio vacío:** Si `site.procesos_por_sitio` está vacío, mostrar aviso claro: `"Este sitio aún no tiene procesos vinculados en Certificación"` con botón de salto contextual `→ Ir al Sitio` (empujando breadcrumb hacia `Sitio` pestaña `'procesos'`) para vincularlos sin perder contexto.
- **Lista de Procesos del Sitio (`procesos_por_sitio`):**
  - Checkbox de selección (`procesos_sitio_auditoria`).
  - Al estar marcado, renderiza inmediatamente debajo su fila de **Turnos a Evaluar (`1..N` chips multi-selección)**:
    - Cada chip representa un `turnos_por_sitio` de esa sede (`07:00–15:00`, `15:00–23:00`, etc.).
    - Activar un chip garantiza la existencia activa de `turnos_sitio_auditoria` y crea/restaura la fila en `turnos_proceso_sitio_auditoria`; desactivarlo archiva el enlace `turnos_proceso_sitio_auditoria` correspondiente.
    - Indicador inmediato `"⚠️ Selecciona al menos 1 turno"` si el proceso está marcado pero aún no tiene chips activos (no bloqueante para borrador, visible para completar programación).

#### D. Nivel 3 del Árbol — Asignación Dual de Auditores + Días por Sitio (Cubo 2)
Dentro de cada `sitio` incluido, dividido en dos bloques coordinados e intuitivos:
1. **Bloque "Equipo en este Sitio y Días Asignados (Cubo 2)":**
   - Selector de auditor competente (filtrado por norma + sector/subsector IAF + alerta de rotación si aplica) + Selector de rol (`AUDITOR_LIDER`, `AUDITOR`, `AUDITOR_EN_ENTRENAMIENTO`, `EXPERTO_TECNICO`) + botón `+ Añadir al Sitio`.
   - Para cada auditor añadido al sitio (`equipo_auditor_sitio`):
     - Input numérico / steppers **`0.25d`** para su `tiempo_auditoria` en este sitio específico.
     - **Botón / Switch Modo Rápido (1 Clic): `"Asignar a todo el Sitio"`** (`asignacion_completa_sitio`):
       - Al activarlo, este auditor cubre automáticamente **todos** los procesos seleccionados en ese sitio sin necesidad de marcarlo uno por uno (con badge `"Cubre todo el sitio"`).
2. **Bloque "Cobertura Granular por Proceso" (`equipo_auditor_proceso_sitio`):**
   - Junto a cada proceso marcado del sitio, se muestran chips/badges de los auditores asignados a ese proceso:
     - Quienes tengan `asignacion_completa_sitio = TRUE` aparecen automáticamente como pill bloqueado/heredado (`"✓ {Nombre} (Todo el sitio)"`).
     - Además, un botón `+ Auditor` o chips clickables permiten asignar o co-evaluar con **1 o varios auditores específicos** (`equipo_auditor_proceso_sitio`) en ese proceso sin exclusividad 1:1 (por ejemplo, Auditor Técnico en `Troquelado` + Auditor en Entrenamiento observando).
   - Indicador en vivo si algún proceso seleccionado no tiene ningún auditor (ni heredado ni granular): `"⚠️ Sin auditor asignado"`.

### 3. Regla de Fluidez DOM (Zero-Flicker / Preservation of Scroll & Focus)
- Cada mutación en los inputs de días (`0.25d`) o toggles de acordeón actualiza el estado en memoria, recalcula el HUD de balanceo y persiste limpiamente preservando `expandedSiteIds`, posición de scroll y foco del control editado.
- En modo `'read'`, todo el árbol se muestra en visualización limpia de solo lectura (sin inputs ni botones mutadores), permitiendo inspeccionar la matriz `Sitio → Proceso → Turnos → Auditores + Días` con total claridad para los 4 roles (`ADMIN`, `WORKER`, `AUDITOR`, `CLIENT`).

---

## Criterios de Verificación de Step 4.1
1. El panel **"Historial del Certificado"** muestra las auditorías previas del certificado seleccionado, detecta procesos pendientes y dispara alerta de rotación si el mismo auditor líder acumula `>= 3` ciclos consecutivos.
2. En el Árbol/Acordeón de planificación:
   - Solo aparecen procesos configurados en `procesos_por_sitio` de cada sitio y turnos de `turnos_por_sitio` de ese mismo sitio.
   - Un mismo proceso puede vincular `1..N` chips de turno simultáneamente (`turnos_proceso_sitio_auditoria`).
   - Un auditor puede asignarse en 1 clic a todo el sitio (`asignacion_completa_sitio`) o granularmente a procesos específicos con co-evaluación M:N (`equipo_auditor_proceso_sitio`).
   - El mismo auditor puede tener `2.00d` en Sitio 0 y `1.50d` en Sitio 1, sumando `3.50d` totales mientras el balanceador Cubo 1 vs Cubo 2 muestra la diferencia exacta en `0.25d`.
3. Guardar un borrador incompleto funciona sin errores ni bloqueos, reflejando el `AuditDynamicTag` exacto (`Borrador / En Programación`, `Parcialmente Asignada`, `Programada / Lista` o `Atrasada / Vencida`).
4. `npx tsx --test src/lib/auditPlannerUi.test.ts` verifica Cero-UUID, aislamiento RBAC y renderizado completo.
