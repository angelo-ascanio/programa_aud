# Step 4.1.1 — Paso 2 Visual (`auditPlannerView.ts` Parte 1): Panel "Historial del Certificado / Evolución de Ciclos" y Planner HUD

## Objetivo
Construir los dos componentes de contexto e inteligencia de planificación en `src/views/auditPlannerView.ts` e integrarlos en `programacionView.ts` antes de ensamblar el árbol interactivo completo:
1. **Panel Colapsable "Historial del Certificado y Evolución de Ciclos" (`renderCertificateHistoryPanel`)**, disponible desde la selección de certificado en `'add'`, `'edit'` y `'read'`.
2. **Barra Global de Salud (`renderAuditPlannerHud`):** progreso `computeAuditPlanningStatus`, balance **Cubo 1 vs Cubo 2**, contraste contra **Rango Calendario Real** (ej. `6.00 días-auditor / 2 auditores en 3 días calendario`), alertas de traslape de agenda del auditor y filtro de competencia (`auditor_esta_calificado`).

---

## Archivos a Crear / Modificar
- **Crear:** `src/views/auditPlannerView.ts` (Parte 1: `renderCertificateHistoryPanel` y `renderAuditPlannerHud`)
- **Modificar:** `src/views/programacionView.ts` (montar Panel Histórico para la auditoría seleccionada y HUD en cabecera de pestaña `'planificacion'`)
- **Modificar:** `src/main.ts` (toggle `#toggleCertHistoryPanelBtn`, estado `isHistoryPanelOpen`, toggle de filtro de auditores calificados y navegación contextual hacia auditorías históricas vía `pushBreadcrumb`)

---

## Especificación Técnica Detallada

### 1. Panel Colapsable "Historial del Certificado y Evolución de Ciclos" (`renderCertificateHistoryPanel`)
1. **Cabecera del Acordeón (`#toggleCertHistoryPanelBtn`, `aria-expanded`):**
   - Píldoras resumen: `{priorAuditsCount} ciclo(s) previo(s)`, badge `"Evolución de Ciclo"` (si el ciclo previo tenía otra `tipo_vinculacion`, ej. `Combinada → Integrada`), alerta `"Rotación Líder"` (usando umbral configurable `config.ciclos_rotacion_auditor_lider`), y `"{uncoveredCount} proceso(s) sin cobertura reciente"`.
2. **Contenido Expandido:**
   - **Banner de Continuidad, Evolución y Rotación ISO/IEC 17021-1:**
     - Muestra trazabilidad de evolución si `program.id_ciclo_origen` o el historial previo reflejan transición (ej. `Año 1: Nivel 1 · Combinada → Año 2: Nivel 1 · Integrada`).
     - Lista los nombres de procesos activos del certificado ausentes en la última auditoría previa para orientar el muestreo.
     - Advierte si el Auditor Líder actual acumula `>= ciclos_rotacion_auditor_lider` ciclos consecutivos previos.
   - **Línea de Tiempo Compacta (últimos 5 ciclos):**
     - Cada fila muestra: código de programa/auditoría, naturaleza (`Individual`, `Combinada`, `Integrada`, etc.), tipo (`Etapa 2`, `Seguimiento 1`), fecha vigente (`REAL` o `PREPROGRAMADA_MES`), total de días-auditor, **Sitios visitados**, **Procesos + Turnos** y **Equipo Auditor**. Clic en la fila navega vía `pushBreadcrumb`.

### 2. Barra Global de Salud, Días-Auditor y Rango Calendario (`renderAuditPlannerHud`)
Sticky o fija en la cabecera de la pestaña `'planificacion'` (Paso 2):
1. **Progreso de Completitud (`computeAuditPlanningStatus`):** barra visual + `%` + lista de pendientes legibles.
2. **Balance Dual-Bucket + Rango Calendario Real:**
   - `Requerido en Sitios (Cubo 1): X.XXd`
   - `Asignado a Auditores (Cubo 2): Y.YYd` (`Cuadrado ✓` / `Faltan` / `Exceso`)
   - **Contraste con Fecha Vigente (`MAX(numero_secuencia)`):**
     - Si es `REAL`: muestra `Rango Calendario: 3 días (10/06 → 12/06) · Capacidad máx. por auditor: 3.00d`.
     - Si `6.00d` están asignados entre `2` auditores (`3.00d` c/u) en `3` días calendario → badge verde `"Compatible con rango calendario"`.
     - Si algún auditor supera `calendarSpanDays` o posee **traslape de agenda** en otro `programa_auditoria` → alerta informativa clara (no bloqueante para guardado).
     - Si la fecha vigente es `PREPROGRAMADA_MES` → indicador `"Fecha exacta pendiente de confirmar (Mes/Año)"`.
3. **Toggle de Competencia:**
   - Switch `"Solo auditores calificados para esta Norma y Sub-Sector IAF"` (activado por defecto vía `auditor_esta_calificado`), mostrando advertencia `"Sin calificación completa"` cuando se desactiva.

---

## Criterios de Verificación de Step 4.1.1
1. El panel **"Historial del Certificado"** abre/cierra limpiamente, detecta evolución `Combinada → Integrada`, procesos no cubiertos y rotación ISO/IEC 17021-1 según el umbral configurado.
2. El **Planner HUD** muestra Cubo 1 vs Cubo 2 y valida correctamente el contraste contra el rango calendario real (`6.00d` / `2` auditores en `3d` cal.) y conflictos de agenda.
3. `npm run lint` (`tsc --noEmit`) pasa con `0` errores y `0 any`.
