# Paso Final (`step_final.md`): Sincronización Documental (`/public/doc/`) y Puerta de Calidad Integral

## 1. Objetivo del Paso Final
Auditar de punta a punta la integración completa de `public/Auditores.csv` tras ejecutar los Pasos `1.1`, `1.2`, `2.1`, `3.1`, `3.2` y `4.1`, actualizar los 5 documentos oficiales en `/public/doc/` en **español** para reflejar el estado real exacto de la aplicación, y aprobar las **4 Puertas de Calidad Obligatorias** antes de dar por cerrado el proyecto.

---

## 2. Sincronización Obligatoria de `/public/doc/`

Inspeccionar y actualizar los 5 archivos documentales existentes para que reflejen con exactitud conteos reales de tablas, índices, triggers, pruebas, usuarios sembrados y flujos:

1. **`public/doc/project_resume.md`**
   - Actualizar estado de capacidades del módulo **Auditores** (47 auditores reales desde `Auditores.csv` + usuario tester `auditor@fondonorma.test`), métricas reales de base de datos, Auth (`SIGLAS + CEDULA` inicial), cobertura de esquemas complementarios (`MARCA`, `HACCP`) y nuevas vistas Multi/Detail.
2. **`public/doc/architecture/database_architecture.md`**
   - Documentar las nuevas columnas de `public.auditor` (`siglas`, `cedula_identidad`, `profesion`, `esquemas_complementarios`, `anio_actualizacion_*`, campos resumen de evaluación in situ y `observacion_sectores`).
   - Documentar las 3 nuevas tablas normalizadas: `public.telefono_auditor`, `public.email_auditor` y `public.evaluacion_in_situ_auditor`.
   - Actualizar los conteos totales de tablas, índices únicos parciales (`uq_auditor_cedula_active`, `uq_telefono_auditor_per_auditor_active`, `uq_email_auditor_per_auditor_active`), triggers (`v_child_tables`, `v_extra_audit_tables`) y arquitectura de seed idempotente de 48 auditores (`3333...` + `1000...0001..0047`).
3. **`public/doc/architecture/backend_api_security.md`**
   - Documentar las políticas RLS y `REVOKE DELETE` de `telefono_auditor`, `email_auditor` y `evaluacion_in_situ_auditor`.
   - Documentar el esquema de provisión Auth en `05_usuarios.sql` (preservación de las 4 cuentas tester + 47 cuentas `AUDITOR` aprobadas con UUID alineado a `public.auditor.id` para `is_assigned_auditor(id_auditoria)`).
   - Documentar el traductor de errores y validación Zero-UUID de `src/lib/auditorPersistence.ts`.
4. **`public/doc/architecture/frontend_architecture.md`**
   - Documentar la actualización del Multi View (`table-fixed`, `<colgroup>` 100%, facetas reactivas $S_{-k}$ de evaluación in situ / observación sectorial / profesión) y Detail View de 3 zonas con las 4 pestañas hijas (`Competencias`, `Contacto`, `Evaluaciones In Situ`, `Historial de Auditorías`).
   - Documentar la desambiguación de homónimos (`SIGLAS · C.I.`) y las alertas no bloqueantes en **Bloque 1 → `3. Auditor`** (`asignacionView.ts`) + cálculo en vivo del historial.
5. **`public/doc/operations/testing_and_operations.md`**
   - Actualizar credenciales operativas de prueba (cuentas tester preservadas + regla estándar `CORREO` / `SIGLAS+CEDULA` para los 47 auditores reales, con nota de rotación de contraseña).
   - Actualizar conteos reales de pruebas (`npm test`), invariantes verificados y comandos de verificación SQL / Playwright.

---

## 3. Las 4 Puertas de Verificación Obligatorias

### Puerta 1: Integridad SQL e Idempotencia Limpia
1. Ejecutar reset completo de base de datos (`POST /api/reset-db` o scripts `00` → `07`) → resultado `200 OK` / 0 errores.
2. Ejecutar **`06_datos_prueba.sql` una segunda vez** sobre la BD ya poblada → **0 errores** de PK, FK, triggers o índices únicos.
3. Verificar conteos reales en PostgreSQL:
   - `public.auditor` activos = **48** (`1` tester `3333...` + `47` reales CSV).
   - `public.profiles` con `role = 'AUDITOR'` y `status = 'APPROVED'` = **48**.
   - Ambas `Yurima Carrillo` presentes con `C.I. 7137643` y `12310919`, y sus respectivas normas (`ISO 9001:2015` + `ISO 14001:2015`) y subsectores (`10.1, 12.1, 14.1, 37.1, 37.2`).
   - Teléfonos múltiples y correos secundarios en `telefono_auditor` y `email_auditor`; evaluaciones múltiples en `evaluacion_in_situ_auditor`.
   - `0` exposiciones de `DELETE` físico permitidas para usuarios autenticados sobre tablas protegidas.

### Puerta 2: Autenticación Real y Aislamiento RBAC
1. Probar login exitoso contra GoTrue (`signInWithPassword`) con:
   - Cuenta rápida tester: `auditor@fondonorma.test` / `Password123*`.
   - Al menos 2 cuentas reales del CSV (incluyendo una asignada a auditorías, ej. `keylasoteldo@gmail.com` / `KS4165827`, y una sin asignaciones previas, ej. `calidad.aksanchez@gmail.com` / `AKS10337391`).
   - Una de las cuentas homónimas (`yanellys_castellanos@yahoo.com` / `YC7137643`).
2. Confirmar que cada cuenta obtiene su `UserProfile` (`role = 'AUDITOR'`, `status = 'APPROVED'`) y que la cuenta asignada ve solo sus auditorías mientras que la no asignada ve el listado vacío en Bloque 1 y solo lectura en Bloque 2.

### Puerta 3: Calidad Estática, Pruebas Unitarias y Compilación
1. Verificar ausencia absoluta de `: any` y `as any` en `src/` (`grep`).
2. Ejecutar `npx tsc --noEmit` → **0 errores**.
3. Ejecutar `npm run lint` → **0 errores**.
4. Ejecutar `npm test` → **100% suites en verde**.
5. Ejecutar `npm run build` → compilación de producción limpia.

### Puerta 4: Verificación Visual y Funcional E2E en Navegador Real (Playwright)
Probar la aplicación compilada/en vivo en resolución **Desktop (`1440x900`)** y **Mobile (`390x844`)** sin errores de consola ni excepciones JS para los **4 roles**:
1. **`ADMIN`**:
   - Navegar a `Bloque 2 → Auditor`: validar Multi View (Lista `table-fixed`, `<colgroup>` 100%, 0 `<button>` en `<tbody>`, Grid, facetas `Evaluación In Situ`, `Condición Sectorial`, búsqueda por cédula/siglas/`Yurima`).
   - Abrir Detail View de una auditora homónima y de un auditor con evaluaciones múltiples (`Félix Rojas`), navegar por las 4 pestañas (`Competencias`, `Contacto`, `Evaluaciones In Situ`, `Historial de Auditorías`).
   - Probar creación/edición/archivo/restauración sin exponer UUIDs crudos.
2. **`WORKER`**:
   - Probar creación/edición de contacto/evaluación y asignación en `Bloque 1 → 3. Auditor`, verificando diferenciación de `Yurima Carrillo` en selectores y alerta no bloqueante por Experto Técnico al seleccionar `Nelson Arteaga` o `Yuliber Blanco` en Sector `13`.
   - Confirmar ausencia de botón `Restaurar` / gestión de archivo reservada a `ADMIN`.
3. **`AUDITOR`** (probado tanto con `auditor@fondonorma.test` como con auditor real del CSV):
   - Confirmar acceso de solo lectura en `Bloque 2 → Auditor` (0 botones de edición/asignación/archivo) y alcance aislado de auditorías en `Bloque 1`.
4. **`CLIENT`**:
   - Confirmar aislamiento estricto de su organización (`Iberometal`) y ausencia absoluta de controles de mutación sobre auditores.

---

## 4. Criterio de Cierre Definitivo
El roadmap queda cerrado **únicamente** cuando las Puertas 1, 2, 3 y 4 pasan consecutivamente en verde tras los últimos cambios y los 5 documentos en `/public/doc/` coinciden al 100% con el código y la base de datos.
