# Step Final — Verificación Integral E2E, Matriz 4 Roles × Viewports, Reset DB y Sincronización `public/doc/`

## 1. Objetivo y Alcance
Certificar el funcionamiento integral de extremo a extremo tras completar los pasos `1.1` a `9.1`, validar la integridad de datos, seguridad RLS para los 4 roles en viewports desktop/móvil y sincronizar toda la documentación técnica oficial en `public/doc/`.

---

## 2. Archivos y Áreas Afectadas
- Toda la suite de scripts SQL (`public/supabase/queries/00_*.sql` – `07_*.sql`)
- Toda la suite de pruebas `node:test` (`src/lib/*.test.ts`)
- Código fuente (`src/**`) únicamente para ajustes de regresión detectados en E2E
- Documentación oficial en `public/doc/`:
  - `public/doc/project_resume.md`
  - `public/doc/architecture/database_architecture.md`
  - `public/doc/architecture/backend_api_security.md`
  - `public/doc/architecture/frontend_architecture.md`
  - `public/doc/architecture/testing_and_operations.md`

---

## 3. Tareas Detalladas de Verificación y Sincronización

### 3.1 Validación de Base de Datos y Semillas
1. Ejecutar secuencia limpia en PostgreSQL / Supabase (`00_delete_tables.sql` → `01_creacion.sql` → `02_*.sql` → `03_*.sql` → `04_*.sql` → `05_*.sql` → `06_datos_prueba.sql` → `07_*.sql`) verificando **0 errores**.
2. Confirmar que el escenario de pruebas de `Vínculo` (multi-empresa + `3×{9001, 14001, 45001}` + 4º sitio combinado), fechas `REAL` discretas, NCs sin `id_proceso` (`+15d/+45d`) y `Revisión` cargan correctamente e idempotentes.

### 3.2 Calidad de Código y Suite Unitaria (`node:test`)
1. Ejecutar `npm run lint` → confirmar **`0` errores** y **`0` usos de `: any` / `as any`**.
2. Ejecutar `npm test` → confirmar **100% de suites y casos aprobados** sin omisiones.
3. Ejecutar `npm run build` → confirmar bundle de producción limpio.

### 3.3 Matriz E2E en Navegador Real (Chromium / Playwright en `http://localhost:3000`)
Validar cada flujo en **Desktop (`1440×900`)** y **Mobile (`390×844`)** sin errores de consola, sin desbordamientos horizontales y verificando **Zero-UUID** en el DOM renderizado:
1. **`ADMIN` & `WORKER`:**
   - Menú Bloque 1: orden exacto `Calendario`, `Vínculo`, separador, `Designación` (hover abre lateral y al salir de Bloque 1 vuelve a cerrarse), `Tiempo`, `Auditor`, `Proceso`, `Turno`, `Resultado`, `Revisión`, `Resumen`.
   - Flujo completo `+ Auditoría` Wizard (Fase 1 Conglomerado/Org → Fase 2 Vínculo auto o manual / aviso si vacío → Fase 3 Tipo por cert → redirección a `Designación → Tipo`).
   - Breadcrumb In-Card: ausente en Multi Views/`Calendario`/`Vínculo`; presente dentro de la tarjeta en Detail Views `1..7` + `Resumen`; persistencia comprobada de auditoría antigua seleccionada al saltar entre secciones.
   - `Conglomerado`: tabs `Organizaciones` (conteo real, selector `SOLO`, desvincular miembro) y `Auditorías` (más recientes primero, `estatus_auditoria`, clic abre `Resumen`).
   - `Vínculo`: Multi View por Conglomerado, Detail View por cajas (crear caja, mover certificado desde `LIBRE` / entre cajas, clic en cert abre `Resumen`).
   - `Designación`: `Tipo` (sin botón antiguo), `Fecha` (multi-fecha Mes+Año / Exacta sincronizada al lote), `Sitio` (por auditoría), `Temporal` (switch ON/OFF sincronizado al lote).
   - `Tiempo` y `Auditor` (incluyendo `Sitio Temporal` cuando está ON y cuadre exacto `SUM == días`).
   - `Proceso` (`Seleccionar todos` por sitio) y `Turno` (matriz anti-fatiga por sitio y propagación).
   - `Resultado` (popup `+15d/+45d`, fechas reales discretas, NC por cláusula con `Plan` y `Cierre` reales, verificando que NO crea eventos en `Calendario`) y `Revisión` (`fecha_revision` + comentario).
   - `Resumen`: cálculo paralelo `estatus_auditoria` y salto 1-clic a cada sección conservando `(certId, auditId)`.
2. **`AUDITOR`:**
   - Solo visualiza auditorías asignadas; no ve botones de escritura administrativa (`+ Auditoría`, mutar cajas de `Vínculo` o `Conglomerado`); puede registrar ejecución asignada en `Resultado`.
3. **`CLIENT` (Aislamiento Nivel 2):**
   - Solo visualiza sus organizaciones autorizadas dentro de un `Conglomerado` / `Vínculo` Nivel 2; cero fuga de nombres de empresas hermanas ni de certificados/auditorías ajenas en `Conglomerado`, `Vínculo`, `Calendario` o `Resumen`.
4. **Auditoría Canónica (`public/certificado/`):**
   - Verificar `table-fixed` + `<colgroup>` = `100%` en todas las Multi Views nuevas/modificadas (`vinculo`, `designacion/fecha`, `tiempo`, `auditor`, `proceso`, `turno`, `resultado`, `revision`, `resumen`, `conglomerado → auditorias`).
   - Verificar **0 `<button>` dentro de `<tbody>`**.

### 3.4 Sincronización de Documentación (`public/doc/`)
Actualizar las 5 fuentes de documentación oficial en `public/doc/` para reflejar exactamente el estado final de la arquitectura (tablas/triggers actualizados, nuevo orden del menú Bloque 1, Breadcrumb In-Card, Wizard `+ Auditoría`, flujo de Cajas en `Vínculo`, split `Proceso`/`Turno`, simplificación `Resultado`/`Revisión` y nueva sección `Resumen`).

---

## 4. Criterio de Aceptación Final
- [ ] Reset SQL completo (`00`–`07`) sin errores.
- [ ] `npm run lint`, `npm test` y `npm run build` verdes al 100%.
- [ ] E2E verificado en `1440×900` y `390×844` para `ADMIN`, `WORKER`, `AUDITOR` y `CLIENT` (Nivel 2), con `0` UUIDs crudos en pantalla y `0` `<button>` en `<tbody>`.
- [ ] Todos los archivos de `public/doc/` sincronizados con precisión respecto al código y esquema finales.
