# Step Final — Auditoría Integral, Pruebas E2E en Navegador, Seguridad RLS y Sincronización de Documentación (`public/doc/`)

## Objetivo
Cerrar la reconstrucción completa del Bloque 1 (`Auditoría`) y `Procesos del Sitio` verificando calidad de producción mediante:
1. Puertas automatizadas completas (`npm test`, `npm run lint`, `npm run build`).
2. Auditoría estricta **Cero-UUID**, **XSS (`escapeHtml`)**, **Tipado (`0 any`)** y **Soft-Delete / RLS** (incluyendo aislamiento Nivel 2 inter-organizacional).
3. Reset completo de base de datos en vivo (`POST /api/reset-db`) y verificación de integridad referencial.
4. Pruebas interactivas en navegador real Chromium (desktop `1440×900` y móvil `390×844`) cubriendo los **4 roles** y todos los escenarios de vinculación, multi-fecha 1:N, pre-programación mes/año, filtro de certificados sin programar y alertas configurables.
5. **Actualización obligatoria de los 5 documentos técnicos en `public/doc/`**.

---

## 1. Puertas Automatizadas de Regresión y Compilación
Ejecutar y verificar con `0` fallos y `0` advertencias:
1. **Suite completa de pruebas (`node:test`):**
   - `npm test` — todas las suites existentes (incluyendo `phase11SqlMigration.test.ts`, `phase12RlsHardening.test.ts`, `archiveGovernance.test.ts`, `breadcrumb.test.ts`) más `auditPlanningEngine.test.ts`, `auditDetailViews.test.ts`, `auditPlannerUi.test.ts`, `auditMultiViews.test.ts` y `sitioDomain.test.ts` deben pasar al 100%.
2. **Verificación de tipos estrictos (`tsconfig.json`):**
   - `npm run lint` (`tsc --noEmit`) — `strict: true` y **cero ocurrencias de `any`** en `src/` y `server.ts`.
3. **Empaquetado de producción:**
   - `npm run build` (`vite build`) — compilación limpia sin errores ni imports residuales de `fecha_programacion` / `fecha_reprogramacion` / `id_turnos_sitio_auditoria`.

---

## 2. Auditoría de Seguridad, Soft-Delete, RLS y Cero-UUID
1. **Cobertura de Soft-Delete y Archivo Seguro:**
   - Confirmar que `programa_auditoria`, `auditoria_fecha`, `configuracion_alerta_auditoria`, `procesos_por_sitio`, `turnos_proceso_sitio_auditoria`, `equipo_auditor_sitio` y `equipo_auditor_proceso_sitio` están registradas en:
     - `v_core_tables` / `v_child_tables`, `v_extra_audit_tables`, `fn_prevent_hard_delete` y `get_archive_dependency_summary` (`01_creacion.sql`).
     - `v_non_deletable_tables` (`REVOKE DELETE`) y `archive_record` (`04_rls.sql`).
     - `PROTECTED_SOFT_DELETE_TABLES` y `computeLocalArchiveDependencySummary` (`src/lib/archiveGovernance.ts`).
2. **Validación Cero-UUID y XSS:**
   - Confirmar con `assertZeroUuidExposure` que ninguna tabla, tarjeta, evento de calendario, bandeja de alertas, breadcrumb, balanceador ni historial de certificado renderiza UUIDs crudos en texto visible, `title`, `aria-label` o `placeholder`.
   - Confirmar `assertValidUuid()` en todas las mutaciones hacia PostgREST y `escapeHtml()` en todas las vistas (`programacionView.ts`, `calendarioView.ts`, `resultadoView.ts`, `auditPlannerView.ts`, `sitioAuditoriaView.ts`, `sitioView.ts`).
3. **Disciplina Tabular:**
   - Confirmar `<table class="w-full table-fixed ...">` + `<colgroup>` suma `100%`, **cero columna `Acciones`** y **cero `<button>` dentro de `<tbody>`**.

---

## 3. Verificación de Reset Completo en Vivo (`POST /api/reset-db`)
1. Ejecutar el ciclo completo `00_delete_tables.sql` → `07_normas_requisitos_csv.sql` (vía `POST /api/reset-db`).
2. Comprobar que:
   - Se crean limpiamente `programa_auditoria`, `auditoria` (sin `fecha_programacion`/`fecha_reprogramacion`), `auditoria_fecha`, `configuracion_alerta_auditoria` y las tablas de planificación.
   - Los triggers impiden mezclar organizaciones distintas en `NIVEL_1_INTRA_ORG` o vincular 2 certificados en `INDIVIDUAL`, y permiten multi-organización en `NIVEL_2_INTER_ORG`.
   - Los triggers subconjunto bloquean procesos/turnos cruzados entre certificados o sitios distintos.
   - El semillero determinista hidrata: Individual, Nivel 1 (`Combinada` Año 1 → `Integrada` Año 2 con `6.00d` / `2 auditores` en `3 días calendario` + `Reprogramación #2`), Nivel 2 (`Multientidad` con `PREPROGRAMADA_MES`), y certificados pendientes de programar con distintos `estatus`.

---

## 4. Verificación E2E en Navegador Real (Chromium)
Validar visual y funcionalmente a `1440×900` (escritorio) y `390×844` (móvil), con `0` errores en consola ni HTTP `4xx/5xx` en PostgREST:

1. **Flujo `Certificación > Sitio > Procesos del Sitio` (`ADMIN` / `WORKER`):**
   - Abrir un sitio de `FN-QMS-2024-001`, pestaña `Procesos del Sitio`, vincular un proceso, verificar tabla limpia y archivar vía `#archiveGovernanceModalBackdrop` + `#archiveGovernanceToast`.
2. **Flujo `Auditoría > Programación` — Multi View y Filtro de Certificados Sin Programar:**
   - Verificar listado de campañas (`Individual`, `Nivel 1`, `Nivel 2`), facetas $S_{-k}$ (nivel, naturaleza, precisión de fecha, tag dinámico, cuadre de días), buscador único y totalizador `"Mostrando X de Y"`.
   - Cambiar al filtro/vista **"Certificados Pendientes de Programar"**, filtrar por `estatus` (`Activo`, `Estudio`, etc.) y abrir el Paso 1 preseleccionando un certificado pendiente.
3. **Flujo `Auditoría > Programación` — Detail View en 2 Pasos (Vinculación + Multi-Fecha + Árbol Paso 2):**
   - **Paso 1:** Crear una campaña **Nivel 1 (`Integrada`)** agrupando 2 certificados de la misma organización con etiqueta descriptiva, asignando tipos de auditoría distintos y guardando vía botón superior Guardar-primero (cero botones al pie, toast `#archiveGovernanceToast`).
   - **Paso 1 (Validación Nivel 1 vs Nivel 2):** Confirmar que Nivel 1 restringe a una sola organización y Nivel 2 (`Multientidad`) permite seleccionar certificados de 2+ organizaciones distintas.
   - **Paso 2 — Multi-Fecha 1:N:** Registrar `seq #1` `PREPROGRAMADA_MES` (Mes/Año) y luego añadir `seq #2` `Reprogramación` `REAL` (3 días calendario, ej. `10/06 → 12/06`) con `observacion`; verificar que `#2` pasa a ser la fecha vigente y que puede sincronizarse al grupo.
   - **Paso 2 — Planificador Árbol/Acordeón:** Configurar sitios (`0.25d` Cubo 1), marcar procesos de `procesos_por_sitio`, seleccionar `1..N` chips de turno (`turnos_proceso_sitio_auditoria`), asignar `2 auditores` (`3.00d` c/u = `6.00 días-auditor` en `3 días calendario`) combinando *"Asignar a todo el Sitio"* y asignación granular M:N, y confirmar cuadre `Cuadrado ✓` + tag `Programada / Lista`.
   - Verificar **Historial del Certificado** mostrando evolución de ciclo (`Combinada → Integrada`), alertas de rotación y procesos pendientes.
4. **Flujo `Auditoría > Calendario` y Alertas Configurables:**
   - Confirmar apertura por defecto en `📅 Calendario` y conmutación entre `Calendario | Tarjetas | Tabla` manteniendo filtros.
   - Verificar evento unificado de campaña vinculada mostrando su última fecha (`MAX(numero_secuencia)`), visualización diferenciada de `PREPROGRAMADA_MES`, bandeja `"Sin fecha asignada"` y alertas activas (próximas, pre-programadas sin confirmar, atrasadas, conflictos).
   - Abrir `"⚙ Configurar Alertas"` (Staff), modificar `dias_aviso_preprogramada_sin_confirmar` / `dias_aviso_proxima`, guardar en `configuracion_alerta_auditoria` y verificar actualización inmediata de la bandeja de alertas.
5. **Flujo `Auditoría > Resultado`:**
   - Confirmar Multi View alineado (`table-fixed`, facetas $S_{-k}$, `"Mostrando X de Y"`) y trazabilidad intacta de hallazgos.
6. **Matriz RBAC de 4 Roles (Incluyendo Aislamiento Nivel 2):**
   - `ADMIN`: ve `"Mostrar Archivados"`, restaura registros y configura alertas.
   - `WORKER`: planifica, vincula Nivel 1/2, reprograma y configura alertas; no ve `"Mostrar Archivados"`.
   - `AUDITOR`: solo lectura en sus auditorías asignadas; no ve controles de edición de campaña ni `"⚙ Configurar Alertas"`.
   - `CLIENT`: solo lectura de sus organizaciones aprobadas; en una campaña **Nivel 2 Inter-Organización** (`Org A + Org B`), el cliente de `Org A` **únicamente** visualiza la auditoría/certificado de `Org A` y recibe `0` datos de `Org B`.

---

## 5. Actualización Obligatoria de la Documentación Técnica (`public/doc/`)
Antes de dar por concluida la implementación, auditar el código real y actualizar íntegramente los 5 archivos en `public/doc/`:
1. **`public/doc/project_resume.md`**: actualizar métricas exactas (número real de tablas, índices, pruebas aprobadas, suites, módulos y vistas), resumen de `programa_auditoria`, `auditoria_fecha`, `configuracion_alerta_auditoria`, `Procesos del Sitio` y motor de planificación/alertas.
2. **`public/doc/architecture/database_architecture.md`**: documentar `programa_auditoria` (Individual / Nivel 1 / Nivel 2), refactorización de `auditoria` (eliminación de `fecha_programacion`/`fecha_reprogramacion`), `auditoria_fecha` 1:N, `configuracion_alerta_auditoria`, `procesos_por_sitio`, rediseño de `procesos_sitio_auditoria`, `turnos_proceso_sitio_auditoria`, `equipo_auditor_sitio`, `equipo_auditor_proceso_sitio`, triggers e índices parciales.
3. **`public/doc/architecture/backend_api_security.md`**: documentar políticas RLS de todas las tablas nuevas, **aislamiento inter-organizacional Nivel 2 para `CLIENT`**, extensión de `archive_record`, `REVOKE DELETE`, sincronización hacia `equipo_auditor` y semillero en `06_datos_prueba.sql`.
4. **`public/doc/architecture/frontend_architecture.md`**: documentar `auditPlanningEngine.ts`, `auditPlannerView.ts`, `sitioAuditoriaView.ts`, flujo en 2 pasos de `programacionView.ts`, filtro de certificados sin programar por `estatus`, `Calendario` 3-modos con eventos unificados y alertas configurables, Detail Views en 3 Zonas y pestaña `Procesos del Sitio`.
5. **`public/doc/architecture/testing_and_operations.md`**: actualizar inventario completo de archivos `src/lib/*.test.ts`, conteo exacto de tests aprobados y checklist operativo E2E.
