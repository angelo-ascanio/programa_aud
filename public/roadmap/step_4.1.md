# Step 4.1 — Paso 2 ("The Hard Magic"): Planificador Visual Jerárquico, Balanceo Span vs. Días-Auditor e Historial / Evolución de Ciclos

## Objetivo
Construir la experiencia interactiva central del **Paso 2** dentro del Detail View de `Programación` (`programa_auditoria` → `auditoria` activa) y consolidar el soporte visual para evolución de ciclos e historial:
1. **Panel Colapsable "Historial del Certificado y Evolución de Ciclos" (`renderCertificateHistoryPanel`)**, visible desde la selección del certificado, mostrando auditorías previas, evolución de naturaleza (`Combinada → Integrada`), alertas de rotación ISO/IEC 17021-1 (`ciclos_rotacion_auditor_lider` configurable) y procesos pendientes de cobertura.
2. **Constructor Visual Tipo Árbol / Acordeón (`Certificado → Sitios → Procesos del Sitio → 1..N Turnos → Auditores + Días 0.25d`)** en `src/views/auditPlannerView.ts`, integrando:
   - Asignación de auditores en dos velocidades (1 clic *"Asignar a todo el Sitio"* vs granular M:N por proceso).
   - **Balanceo Dual-Bucket + Contraste de Rango Calendario Real:** contrasta en tiempo real `Cubo 1 (Demanda en Sitios)` vs `Cubo 2 (Capacidad Auditores)` vs **Días Calendario Reales** de la fecha vigente (`MAX(numero_secuencia)`), validando escenarios como **`6.00 días-auditor` por `2 auditores` en `3 días calendario`** y alertando sobre capacidad excedida o traslapes de agenda del auditor en otros programas.
   - Guardado progresivo no bloqueante y filtro de competencia (`auditor_esta_calificado`).

---

## Archivos a Crear / Modificar
- **Crear:** `src/views/auditPlannerView.ts`
- **Modificar:** `src/views/programacionView.ts` (integrar Panel Histórico y pestaña `'planificacion'` con `auditPlannerView.ts` por cada certificado activo del Paso 2)
- **Modificar:** `src/main.ts` (handlers del árbol sin parpadeo DOM: toggles de sitios/procesos/turnos/auditores, steppers `0.25d`, botón rápido *"Asignar a todo el Sitio"*, recálculo inmediato del HUD Cubo 1 vs Cubo 2 vs Span Calendario, y persistencia hacia Supabase)
- **Crear / Ampliar:** `src/lib/auditPlannerUi.test.ts` (pruebas DOM/HTML de Cero-UUID, modos rápido vs granular, span vs días-auditor, historial con evolución de ciclo, conflictos de agenda y RBAC)

---

## Especificación Técnica Detallada

### 1. Panel Colapsable "Historial del Certificado y Evolución de Ciclos" (`renderCertificateHistoryPanel`)
Ubicado en el Detail View para la `auditoria` seleccionada en Paso 2 (y en vista previa desde `'add'` al elegir certificado en Paso 1):
1. **Cabecera del Acordeón (`#toggleCertHistoryPanelBtn`, `aria-expanded`):**
   - Píldoras resumen: `{priorAuditsCount} ciclo(s) previo(s)`, badge `"Evolución de Ciclo"` (si el programa previo tenía otra `tipo_vinculacion`, ej. `Combinada → Integrada`), alerta `"Rotación Líder"` (cuando supera `config.ciclos_rotacion_auditor_lider`), y `"{uncoveredCount} proceso(s) sin cobertura reciente"`.
2. **Contenido Expandido:**
   - **Banner de Continuidad y Rotación ISO/IEC 17021-1:**
     - Lista procesos activos del certificado ausentes en la última auditoría previa.
     - Advierte si el Auditor Líder actual acumula `>= ciclos_rotacion_auditor_lider` ciclos consecutivos previos.
     - Muestra trazabilidad de evolución cuando el programa actual apunta a `id_ciclo_origen` o existen ciclos previos vinculados (ej. `Año 1: Nivel 1 · Combinada → Año 2: Nivel 1 · Integrada`).
   - **Línea de Tiempo Compacta (últimos 5 ciclos, clicable vía `pushBreadcrumb`):**
     - Muestra: código de programa/auditoría, naturaleza (`Individual`, `Combinada`, `Integrada`, etc.), tipo (`Etapa 2`, `Seguimiento 1`), fecha vigente (`REAL` o `PREPROGRAMADA_MES`, indicando si tuvo reprogramaciones), total de días-auditor, **Sitios visitados**, **Procesos + Turnos** y **Equipo Auditor**.

---

### 2. Constructor Visual Tipo Árbol / Acordeón (`renderAuditVisualPlanner`)
Renderizado dentro de la pestaña `'planificacion'` (Paso 2) para cada `auditoria` del programa:

#### A. Barra Global de Salud, Días-Auditor y Rango Calendario (`Planner HUD`)
Sticky o fija en la cabecera del constructor:
1. **Progreso de Completitud (`computeAuditPlanningStatus`):** barra + `%` + lista clara de pendientes (ej. `75% · Falta asignar turno en 1 proceso de Planta Valencia`).
2. **Balance Dual-Bucket + Rango Calendario Real:**
   - `Requerido en Sitios (Cubo 1): 6.00d`
   - `Asignado a Auditores (Cubo 2): 6.00d` (`Cuadrado ✓` / `Faltan Xd` / `Exceso +Xd`)
   - **Indicador de Rango Real Vigente:** si la fecha vigente (`MAX(numero_secuencia)`) es `REAL`, muestra `Rango Calendario: 3 días (10/06 → 12/06) · Capacidad teórica por auditor: 3.00d`.
     - Si `6.00d` están cubiertos por `2 auditores` con `3.00d` c/u → badge verde `"Ejecución compatible con rango (≤ 3.00d/auditor)"`.
     - Si algún auditor supera el span calendario (ej. `4.00d` en `3 días calendario`) o tiene **conflicto de solapamiento** en otro `programa_auditoria` → alerta ámbar/roja informativa (no bloqueante para borrador, visible en el HUD).
3. **Filtro Rápido de Competencia:**
   - Toggle `"Solo auditores calificados para esta Norma y Sub-Sector IAF"` (activado por defecto vía `auditor_esta_calificado`), con etiqueta explícita `"Sin calificación completa"` si el staff habilita ver a todos.

#### B. Nivel 1 del Árbol — Nodos de `Sitio` (`sortSitesWithPrincipalFirst`, Sitio 0 primero)
- Acordeón expandible (`state.auditPlanning.expandedSiteIds`) con:
  - Switch de inclusión (`sitios_por_auditoria`, usando `archive_record` si se excluye con dependencias).
  - `Sitio #{numero_sitio} · {nombre_sitio}`, conteo de `procesos_por_sitio` y `turnos_por_sitio`.
  - Input Cubo 1 (`tiempo_auditoria` en pasos de `0.25d` con botones `-0.25` / `+0.25`) + modalidad en sede (`Presencial` / `Remota` / `Mixta`) + badge de cuadre del sitio (`{assigned}d / {required}d`).

#### C. Nivel 2 del Árbol — `Procesos del Sitio` + Chips de `Turnos` (`1..N`)
- Guardia de sitio vacío: aviso `"Este sitio aún no tiene procesos vinculados en Certificación"` con botón `→ Ir al Sitio` (pestaña `'procesos'`).
- Checklist de procesos desde `procesos_por_sitio`; al marcar un proceso (`procesos_sitio_auditoria`), despliega chips multi-selección de **`turnos_por_sitio`** creando/archivando enlaces en **`turnos_proceso_sitio_auditoria`** (permitiendo `1..N` turnos simultáneos por proceso).

#### D. Nivel 3 del Árbol — Asignación Dual de Auditores + Días por Sitio (Cubo 2)
1. **Equipo en el Sitio (`equipo_auditor_sitio`):**
   - Selector de auditor competente (con indicador de calificación, alerta de rotación y advertencia de conflicto de agenda si ya está asignado en fechas superpuestas de otro programa) + Rol (`AUDITOR_LIDER`, `AUDITOR`, `AUDITOR_EN_ENTRENAMIENTO`, `EXPERTO_TECNICO`) + botón `+ Añadir al Sitio`.
   - Por cada auditor añadido al sitio:
     - Stepper **`0.25d`** para su `tiempo_auditoria` en este sitio (mostrando cuántas jornadas ya acumula en el rango calendario de la auditoría).
     - **Botón/Switch Modo Rápido (1 Clic): `"Asignar a todo el Sitio"`** (`asignacion_completa_sitio = TRUE`).
2. **Cobertura Granular por Proceso (`equipo_auditor_proceso_sitio`):**
   - Chips por cada proceso seleccionado: auditores heredados de todo el sitio (`✓ {Nombre} (Todo el sitio)`) + chips/botón `+ Auditor` para co-evaluación M:N por proceso sin exclusividad 1:1.

---

### 3. Regla de Fluidez DOM y Modo `'read'`
- Preservar `expandedSiteIds`, scroll y foco del input al ajustar `0.25d` o conmutar chips.
- En `'read'` (incluyendo `AUDITOR` y `CLIENT`), renderizado limpio de solo lectura sin mutadores y respetando aislamiento Nivel 2.

---

## Criterios de Verificación de Step 4.1
1. El panel **"Historial del Certificado"** muestra ciclos previos, detecta evolución `Combinada → Integrada`, procesos no cubiertos y rotación ISO/IEC 17021-1 según el umbral configurado.
2. El Árbol/Acordeón permite planificar `Sitios → Procesos del Sitio → 1..N Turnos → Auditores + Días (0.25d)` en modo rápido y granular.
3. El Planner HUD valida correctamente `6.00 días-auditor` ejecutados por `2 auditores` (`3.00d` c/u) dentro de un rango calendario real de `3 días`, y advierte si un auditor excede el span o tiene traslape en otro programa.
4. `npx tsx --test src/lib/auditPlannerUi.test.ts` pasa al 100% verificando Cero-UUID, aislamiento RBAC y renderizado completo.
