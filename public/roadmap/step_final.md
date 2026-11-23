# Step Final — Auditoría Integral de Cierre, Pruebas E2E (4 Roles) y Sincronización Documental

## Objetivo del Paso
Ejecutar la validación exhaustiva de extremo a extremo de toda la iniciativa de **Versionado de Certificados y Organizaciones (`organizacion_version`, `abreviacion`, `certificado_version`)** y **`Alcance` Bilingüe Compartible (`alcance`, `alcance_certificado_compartido`)** sobre base de datos PostgreSQL limpia, pruebas unitarias y de UI (`node:test`), análisis estático (`npm run lint`, `npm run build`), recorridos reales en navegador Chromium con Playwright cubriendo los **4 roles (`ADMIN`, `WORKER`, `AUDITOR`, `CLIENT`)** en escritorio y móvil, y sincronización de `/public/doc/`.

---

## Archivos a Inspeccionar / Actualizar
- `public/doc/project_resume.md`
- `public/doc/architecture/database_architecture.md`
- `public/doc/architecture/backend_api_security.md`
- `public/doc/architecture/frontend_architecture.md`
- `public/doc/architecture/testing_and_operations.md`

---

## Puertas de Verificación Obligatorias

### Puerta 1 — Reinicio Limpio SQL, Idempotencia e Integridad Relacional (`00` → `07`)
1. Ejecutar en secuencia limpia sobre PostgreSQL/Supabase: `00_delete_tables.sql` → `01_creacion.sql` → `02_cobertura_normativa.sql` → `03_indices_optimizacion.sql` → `04_rls.sql` → `06_datos_prueba.sql` → `07_normas_requisitos_csv.sql`.
2. Repetir `01` → `06` para confirmar idempotencia total sin errores.
3. Verificar mediante SQL:
   - Ausencia de la columna `alcance` en `public.certificado` y `public.certificado_version`, y presencia de datos migrados en `public.alcance` (`alcance_es` obligatorio `TEXT` ilimitado, `alcance_en` opcional `TEXT`).
   - Imposibilidad de insertar en `public.auditoria` cuando el certificado no tiene `alcance` propio ni compartido activo.
   - Guardia Anti-No-Op (`fn_crear_version_organizacion`) y resolución atómica (`fn_resolver_cert_versiones_organizacion`).
   - `fn_clonar_version_certificado` crea 0 filas en `fecha_certificado`, respeta `alcance` único sin versionarlo, y `fn_migrar_auditorias_version_certificado` remapea sin huérfanos.
   - `fn_compartir_alcance_con_resolucion` rechaza sobrescribir sin confirmación y archiva+reemplaza correctamente cuando se confirma.

### Puerta 2 — Pruebas Unitarias, Integridad UI, Lint y Build Producción
- Ejecutar `node --test` sobre toda la suite (incluyendo `alcanceDomain.test.ts`, `organizacionVersionDomain.test.ts`, `certificadoVersionDomain.test.ts`, `phase11SqlMigration.test.ts`, `phase12RlsHardening.test.ts`, `step101SqlSchema.test.ts`, vistas y Bloque 1).
- `npm run lint` (**0 `any`**) y `npm run build` limpios.
- Verificar `table-fixed`, `<colgroup>` = `100%`, `0 <button>` en `<tbody>`, Zero-UUID y copy 100% en español.

### Puerta 3 — Pruebas E2E Reales en Navegador (Playwright Chromium · 4 Roles · Desktop `1440x900` & Mobile `390x844`)
1. **Rol `ADMIN`:**
   - **Organización:** comprobar `abreviacion`, selector `v1` (solo lectura) vs `v2` (activa), bloqueo Anti-No-Op al crear versión sin cambios, y **Modal de Resolución de Certificados** al crear versión con cambios.
   - **Certificado · Pestaña 1 `Alcance`:** comprobar que `Alcance` es la **primera pestaña hija**, probar visualización `Español` / `Inglés` / `Bilingüe`, editar con texto corto y con texto extenso multilínea (verificando ausencia de límite de caracteres y buen scroll/renderizado).
   - **Compartición de `Alcance` + Conflicto:** compartir alcance hacia un certificado sin alcance (flujo directo) y hacia un certificado con alcance existente (verificar aparición del **Popup de Comparación ES/EN**, probar **`Cancelar`** conservando el existente, repetir y pulsar **`Continuar y Reemplazar Alcance`** verificando reemplazo real).
   - **Bloqueo de Auditorías sin Alcance:** intentar generar auditoría para el certificado semilla sin alcance desde `+ Auditoría` / `Vínculo` (verificar bloqueo claro en español); definir alcance y confirmar desbloqueo.
   - **Certificado · Versionado 2 Pasos:** crear `v+1`, confirmar **0 `fecha_certificado` duplicadas**, verificar Modal de 4 categorías (bloqueo en Categorías 2/3 sin selección) y validar en Bloque 1 (`Sitio`, `Proceso`, `Resultado`, `Revisión`) la separación entre auditoría mantenida en `v1` y migrada en `v2`.
2. **Rol `WORKER`:**
   - Edición en versión activa, creación/compartición de `alcance`, resolución de conflictos y versionado manual; sin visibilidad de archivados ni herramientas exclusivas `ADMIN`.
3. **Rol `AUDITOR`:**
   - Lectura en Bloque 1 con `abreviacion`, `vN` y visualización bilingüe de alcance de auditorías asignadas en solo lectura (Bloque 2 oculto).
4. **Rol `CLIENT` (Aislamiento Nivel 2):**
   - Lectura de sus organizaciones autorizadas (`abreviacion`, `vN`), certificados y pestaña `Alcance` (`Español`/`Inglés`) en estricto solo lectura, sin mutaciones ni acceso a organizaciones ajenas.

### Puerta 4 — Sincronización Documental en `/public/doc/`
Actualizar con precisión absoluta los 5 archivos reales del repositorio:
- `public/doc/project_resume.md`
- `public/doc/architecture/database_architecture.md`
- `public/doc/architecture/backend_api_security.md`
- `public/doc/architecture/frontend_architecture.md`
- `public/doc/architecture/testing_and_operations.md`

---

## Criterios Finales de Cierre
- 0 errores en reinicio limpio SQL, `node:test`, `npm run lint` y `npm run build`.
- E2E Playwright aprobado para los 4 roles en escritorio y móvil sin errores de consola ni desbordamiento horizontal.
- Documentación `/public/doc/` 100% alineada con tablas, RPCs, dominios y vistas implementadas.
