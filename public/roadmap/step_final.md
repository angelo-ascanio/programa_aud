# Step Final — Auditoría Integral, Pruebas E2E en Navegador, Seguridad RLS y Sincronización de Documentación (`public/doc/`)

## Objetivo
Cerrar la reconstrucción del Bloque 1 (`Auditoría`) y `Procesos del Sitio` garantizando calidad de producción mediante:
1. Puertas automatizadas completas (`npm test`, `npm run lint`, `npm run build`).
2. Auditoría estricta **Cero-UUID**, **XSS (`escapeHtml`)**, **Tipado (`0 any`)** y **Soft-Delete / RLS**.
3. Reset completo de base de datos en vivo (`POST /api/reset-db`) y verificación de integridad referencial.
4. Pruebas interactivas en navegador real Chromium (desktop y móvil) cubriendo los 4 roles (`ADMIN`, `WORKER`, `AUDITOR`, `CLIENT`).
5. **Actualización obligatoria de los 5 documentos técnicos en `public/doc/`**.

---

## 1. Puertas Automatizadas de Regresión y Compilación
Ejecutar y verificar con `0` fallos y `0` advertencias:
1. **Suite completa de pruebas (`node:test`):**
   - `npm test` — todas las suites existentes más las nuevas suites de `auditPlanningEngine.test.ts`, `auditDetailViews.test.ts`, `auditPlannerUi.test.ts`, `sitioDomain.test.ts` deben pasar al 100%.
2. **Verificación de tipos estrictos (`tsconfig.json`):**
   - `npm run lint` (`tsc --noEmit`) — `strict: true` y **cero ocurrencias de `any`** en `src/` y `server.ts`.
3. **Empaquetado de producción:**
   - `npm run build` (`vite build`) — compilación limpia sin errores ni imports rotos.

---

## 2. Auditoría de Seguridad, Soft-Delete, RLS y Cero-UUID
1. **Cobertura de Soft-Delete y Archivo Seguro:**
   - Confirmar que `procesos_por_sitio`, `turnos_proceso_sitio_auditoria`, `equipo_auditor_sitio` y `equipo_auditor_proceso_sitio` están presentes en:
     - `v_child_tables`, `v_extra_audit_tables`, `fn_prevent_hard_delete` y `get_archive_dependency_summary` (`01_creacion.sql`).
     - `v_non_deletable_tables` (`REVOKE DELETE`) y `archive_record` (`04_rls.sql`).
     - `PROTECTED_SOFT_DELETE_TABLES` y `computeLocalArchiveDependencySummary` (`src/lib/archiveGovernance.ts`).
2. **Validación Cero-UUID y XSS:**
   - Verificar mediante escaneo y pruebas `assertZeroUuidExposure` que ninguna tabla, tarjeta, calendario, breadcrumbing, barra de cuadre o historial de certificado renderiza UUIDs crudos en texto visible, `title`, `aria-label` o `placeholder`.
   - Confirmar `assertValidUuid()` en todas las mutaciones hacia PostgREST y `escapeHtml()` en cada vista nueva (`auditPlannerView.ts`, `sitioAuditoriaView.ts`, `calendarioView.ts`, `programacionView.ts`, `resultadoView.ts`, `sitioView.ts`).
3. **Disciplina Tabular:**
   - Confirmar que todas las tablas del Bloque 1 y `Sitio` utilizan `<table class="w-full table-fixed ...">` con `<colgroup>` suma `100%`, **cero columna `Acciones`** y **cero `<button>` dentro de `<tbody>`**.

---

## 3. Verificación de Reset Completo en Vivo (`POST /api/reset-db`)
1. Ejecutar el ciclo completo `00_delete_tables.sql` → `07_normas_requisitos_csv.sql` (vía `POST /api/reset-db` o script SQL en Postgres/Supabase).
2. Comprobar que:
   - Se crean limpiamente las tablas nuevas y los índices únicos parciales `WHERE deleted_at IS NULL`.
   - Los triggers subconjunto bloquean procesos/turnos cruzados entre certificados o sitios distintos.
   - Las 3 auditorías semilla (`Auditada` histórica, `Programada` cuadrada y `En Programación` parcial) se hidratan sin errores PostgREST.

---

## 4. Verificación E2E en Navegador Real (Chromium)
Validar visual y funcionalmente a `1440×900` (escritorio) y `390×844` (móvil), con `0` errores en consola ni fallos HTTP `4xx/5xx` en PostgREST:

1. **Flujo `Certificación > Sitio > Procesos del Sitio` (`ADMIN` / `WORKER`):**
   - Abrir un sitio de `FN-QMS-2024-001`, cambiar a pestaña `Procesos del Sitio`, vincular un proceso disponible del certificado, verificar tabla limpia sin botones en `<tbody>`, y archivar/desvincular vía `#archiveGovernanceModalBackdrop` + `#archiveGovernanceToast`.
2. **Flujo `Auditoría > Programación` (`ADMIN` / `WORKER`):**
   - Verificar Multi View limpio (`Tarjetas` / `Tabla` `table-fixed`, facetas reactivas $S_{-k}$ incluyendo etiquetas dinámicas y cuadre de días, buscador único `type="text"` con `✕`, totalizador `"Mostrando X de Y"`).
   - Pulsar **`+`** → entrar al Detail View `'add'` → seleccionar Certificado → inspeccionar el panel colapsable **"Historial del Certificado"** (auditorías previas, alertas de rotación y procesos pendientes) → guardar un **borrador mínimo** → validar toast flotante `#archiveGovernanceToast`.
   - En el **Constructor Visual Tipo Árbol/Acordeón**:
     - Expandir Sitio 0 y Sitio 1, asignar días en Cubo 1 (`0.25d`), marcar procesos de `procesos_por_sitio`, seleccionar `1..N` chips de turno (`turnos_proceso_sitio_auditoria`), asignar un auditor con **"Asignar a todo el Sitio"** y otro de manera granular por proceso (Cubo 2), verificar cuadre en vivo y cambio automático de etiqueta dinámica (`Parcialmente Asignada` → `Programada / Lista`).
   - Verificar cabecera `'add' | 'edit'` (Guardar primero / Cancelar segundo arriba, cero botones al pie) y breadcrumbs compactos en 1 línea sin ciclos al saltar a `Certificado` o `Auditor`.
3. **Flujo `Auditoría > Calendario`:**
   - Confirmar que abre **por defecto en vista `📅 Calendario`**, conmutar entre `Calendario | Tarjetas | Tabla` manteniendo intactos los filtros de facetas $S_{-k}$, y abrir una auditoría desde un evento del calendario y desde la bandeja de borradores sin fecha.
4. **Flujo `Auditoría > Resultado`:**
   - Confirmar Multi View alineado (`table-fixed`, facetas $S_{-k}$, `"Mostrando X de Y"`), registro de hallazgos y trazabilidad intacta.
5. **Matriz RBAC de 4 Roles:**
   - `ADMIN`: ve `"Mostrar Archivados"` y puede restaurar registros archivados del dominio.
   - `WORKER`: puede planificar, editar y archivar, pero no ve `"Mostrar Archivados"`.
   - `AUDITOR`: solo accede en `'read'` a sus auditorías asignadas y puede operar hallazgos en ejecución sin controles de edición de programación ni archivo.
   - `CLIENT`: solo lectura estricta de auditorías de sus organizaciones aprobadas en `client_organization_access`, sin filtros de semillas locales.

---

## 5. Actualización Obligatoria de la Documentación Técnica (`public/doc/`)
Antes de dar por concluida la implementación, auditar el repositorio real y actualizar íntegramente los 5 archivos en `public/doc/`:
1. **`public/doc/project_resume.md`**: actualizar métricas exactas (número real de tablas, índices, pruebas aprobadas, suites, módulos y vistas), resumen de `Procesos del Sitio` y nuevo motor de planificación de auditorías.
2. **`public/doc/architecture/database_architecture.md`**: documentar `procesos_por_sitio`, rediseño de `procesos_sitio_auditoria`, `turnos_proceso_sitio_auditoria`, `equipo_auditor_sitio`, `equipo_auditor_proceso_sitio`, columnas de borrador en `auditoria`, triggers subconjunto, `get_archive_dependency_summary` e índices parciales.
3. **`public/doc/architecture/backend_api_security.md`**: documentar políticas RLS de las 4 tablas nuevas, extensión de `archive_record`, `REVOKE DELETE`, sincronización hacia `equipo_auditor` y semillero histórico en `06_datos_prueba.sql`.
4. **`public/doc/architecture/frontend_architecture.md`**: documentar `auditPlanningEngine.ts`, `auditPlannerView.ts`, `sitioAuditoriaView.ts`, `Calendario` 3-modos por defecto, Multi Views y Detail Views en 3 Zonas del Bloque 1, panel "Historial del Certificado" y pestaña `Procesos del Sitio`.
5. **`public/doc/architecture/testing_and_operations.md`**: actualizar inventario completo de archivos de prueba `src/lib/*.test.ts`, conteo exacto de tests aprobados y checklist operativo E2E.
