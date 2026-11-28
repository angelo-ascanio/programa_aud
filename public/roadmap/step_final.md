# Paso Final — Actualización de la Documentación Técnica en `public/doc/`

> **Objetivo:** Paso dedicado exclusivamente a mantener la documentación técnica oficial del repositorio (`public/doc/project_resume.md` y los 4 documentos bajo `public/doc/architecture/`) 100% sincronizada con la nueva consola **`ADMIN` de Sincronización SQL (`#database-sync`)**, sus módulos reales, endpoints, reglas de cascada, manejo de `06_datos_prueba.sql` y `07_normas_requisitos_csv.sql`, conteos de pruebas y compilación.

---

## 1. Archivos Exactos a Modificar en Este Paso

- `public/doc/project_resume.md`
- `public/doc/architecture/backend_api_security.md`
- `public/doc/architecture/database_architecture.md`
- `public/doc/architecture/frontend_architecture.md`
- `public/doc/architecture/testing_and_operations.md`

> **Regla:** Este paso se ejecuta **después** de haber completado y verificado el Paso 4.1. Todos los números, rutas, nombres de archivos, conteos de tests y módulos Vite deben extraerse de la ejecución real en consola (nunca estimados).

---

## 2. Actualizaciones Obligatorias por Documento

1. **`public/doc/project_resume.md`:**
   - Actualizar el resumen ejecutivo y métricas actuales del proyecto (conteo exacto de módulos `src/lib/*.ts`, vistas `src/views/*.ts`, pruebas `node:test`, suites y módulos Vite).
   - Documentar la nueva capacidad **`Sincronización SQL` (`#database-sync`)** exclusiva `ADMIN` junto a `Estado DB` y `Respaldo DB`.
   - Actualizar enlaces/notas de los 4 documentos arquitectónicos si cambia el alcance.

2. **`public/doc/architecture/backend_api_security.md`:**
   - Sección `1.2 Rutas de API (/api/*)`: documentar los nuevos endpoints protegidos por `requireApprovedAdmin`:
     - `GET /api/admin/db/seed-sync/catalog`
     - `POST /api/admin/db/seed-sync/preview`
     - `POST /api/admin/db/seed-sync/apply`
   - Explicar las garantías transaccionales (`BEGIN READ ONLY`), validación pre-escritura, escritura atómica sobre `06_datos_prueba.sql` / `07_normas_requisitos_csv.sql`, advertencias de FKs contra `05_usuarios.sql` y rechazo `401`/`403` para no-`ADMIN`.

3. **`public/doc/architecture/database_architecture.md`:**
   - Sección 1 (`06_datos_prueba.sql` y `07_normas_requisitos_csv.sql`): documentar la reconciliación automática idempotente desde PostgreSQL vivo hacia los scripts semilla, la cascada Padre→Hijos (ej. `Certificado > Procesos > Cláusulas`), el respeto a `fn_prevent_hard_delete()` (cero `DELETE` en tablas protegidas; uso de `deleted_at` / M:N puras) y el caso especial de `Extra → Norma` sobre `07_normas_requisitos_csv.sql`.
   - Dejar constancia explícita de la cobertura completa de tablas (incluyendo `telefono_auditor`, `email_auditor` y `evaluacion_in_situ_auditor`) en el catálogo de sincronización SQL.

4. **`public/doc/architecture/frontend_architecture.md`:**
   - Documentar la ruta `'database-sync'` (`ActiveRoute`), ítem **`🔄 Sincronización SQL`** en `src/views/header.ts` (exclusivo `ADMIN`), guardias de `healthCheck.ts` / `accessControl.ts` / `main.ts`.
   - Inventario `src/lib/`: agregar `sqlSeedSyncCatalog.ts`, `sqlSeedGenerator.ts`, `sqlSeedFileUpdater.ts`, `sqlNormasSeedSync.ts`, `sqlSeedSyncClient.ts`.
   - Inventario `src/views/`: agregar `databaseSeedSyncView.ts` en el grupo **Consola Administrativa** y describir su diseño de 3 bloques (`Auditoría`, `Certificación`, `Extra`), selección individual o por bloque, vista previa `Preview → Apply` y Zero-UUID.

5. **`public/doc/architecture/testing_and_operations.md`:**
   - Actualizar los conteos totales exactos de archivos `.test.ts`, pruebas y suites ejecutadas con `npx tsx --test src/lib/*.test.ts src/views/*.test.ts` y `npm test`.
   - Agregar las nuevas suites (`sqlSeedSyncCatalog.test.ts`, `sqlSeedGenerator.test.ts`, `sqlSeedFileUpdater.test.ts`, `sqlNormasSeedSync.test.ts`, `sqlSeedSyncClient.test.ts`, `databaseSeedSyncView.test.ts`, `sqlSeedSyncE2E.test.ts`) en la tabla correspondiente.
   - Documentar la verificación de `manualChunks` de `vite build` y los resultados E2E de Chromium para `#database-sync` en `ADMIN` vs bloqueo en `WORKER`/`AUDITOR`/`CLIENT`.

---

## 3. Checklist Final de Cierre

- [ ] Conteos verificados contra salidas reales de `ls src/lib/*.ts`, `ls src/views/*.ts`, `npx tsx --test ...`, `npm test`, `npm run lint` y `npm run build`.
- [ ] Consistencia exacta de cifras y nombres entre `project_resume.md` y los 4 documentos de `public/doc/architecture/`.
- [ ] Cero enlaces rotos dentro de `public/doc/` y `public/roadmap/`.
- [ ] `npm test`, `npm run lint` y `npm run build` verdes sin cambios pendientes en código fuente.
