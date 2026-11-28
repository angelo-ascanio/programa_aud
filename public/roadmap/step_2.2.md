# Paso 2.2 — Endpoints Backend `ADMIN` (`/api/admin/db/seed-sync/*`) y Cliente HTTP

> **Objetivo:** Exponer la API administrativa exclusiva para `ADMIN` (`APPROVED`) en `server.ts` para inspeccionar PostgreSQL, previsualizar diferencias contra `06_datos_prueba.sql` / `07_normas_requisitos_csv.sql` y aplicar cambios de forma atómica en disco, junto con su cliente HTTP tipado en `src/lib/sqlSeedSyncClient.ts`.

---

## 1. Archivos Exactos a Crear o Modificar

- **Modificar:**
  - `server.ts` (agregar rutas `/api/admin/db/seed-sync/catalog`, `/api/admin/db/seed-sync/preview`, `/api/admin/db/seed-sync/apply` protegidas por `requireApprovedAdmin`).
- **Crear:**
  - `src/lib/sqlSeedSyncClient.ts`
  - `src/lib/sqlSeedSyncClient.test.ts`
- **No modificar en este paso:** `src/main.ts`, `src/views/*`, `public/supabase/queries/*`.

---

## 2. Reglas Técnicas Clave

1. **Seguridad Estricta `ADMIN` en `server.ts`:**
   - Todas las rutas `/api/admin/db/seed-sync/*` DEBEN invocar `const adminAuth = await requireApprovedAdmin(req, res); if (!adminAuth) return;`.
   - Reutiliza `withDbClient` + `fetchPublicColumnsByTable` para consultar directamente PostgreSQL (`service` / conexión directa `pg.Client`) sin depender de límites de 1,000 filas de PostgREST.
   - Nunca exponer secretos (`VITE_SUPABASE_DATABASE_KEY`, `VITE_SUPABASE_TOKEN`) ni stack traces internos crudos al cliente; traducir fallos a mensajes claros en español.

2. **Endpoints en `server.ts`:**
   - **`GET /api/admin/db/seed-sync/catalog`:**
     - Retorna la estructura de los 3 bloques (`auditorias`, `certificacion`, `extra`), todas sus secciones/sub-secciones, estado de existencia/tamaño actual de `06_datos_prueba.sql` y `07_normas_requisitos_csv.sql`, y conteo vivo aproximado por tabla en PostgreSQL (sin mutar disco).
   - **`POST /api/admin/db/seed-sync/preview`:**
     - Body validado: `{ selectedSectionIds: string[], includeFkSupport?: boolean }` (default `includeFkSupport = true`).
     - Rechaza con `400` si `selectedSectionIds` está vacío o contiene IDs inválidos fuera del catálogo.
     - Ejecuta `resolveSyncSelectionPlan(selectedSectionIds)`, consulta en transacción `BEGIN READ ONLY` todas las tablas objetivo (ordenadas topológicamente Padre → Hijo, incluyendo toda la cascada de `Certificado` > `Procesos` > `Cláusulas`, etc., más tablas FK soporte necesarias), lee `06_datos_prueba.sql` y/o `07_normas_requisitos_csv.sql` según el plan, y ejecuta `previewDatabaseSyncTo06Sql` / `previewNormas07Sync`.
     - Verifica además integridad de FK contra `05_usuarios.sql` (por ejemplo, si existe un `client_organization_access` cuyo `id_usuario` fue creado manualmente en Supabase Auth y no está en `05_usuarios.sql`, emite una advertencia clara en `warnings` y evita generar una fila rota en `06_datos_prueba.sql`).
     - Retorna `{ ok: true, plan, targetResults: [...], summaryByTable: [...], warnings: string[], previewSnippets: [...] }`.
   - **`POST /api/admin/db/seed-sync/apply`:**
     - Ejecuta el mismo plan validado en transacción `READ ONLY`, construye los nuevos contenidos `.sql`, valida invariantes (`validateUpdatedSeedSql`, paridad `$$`, 0 `DELETE` sobre tablas protegidas) y realiza **escritura atómica** (`<file>.tmp` → `rename`) en `public/supabase/queries/06_datos_prueba.sql` y/o `public/supabase/queries/07_normas_requisitos_csv.sql` (creando opcionalmente copia de seguridad temporal en memoria/disco controlada si falla la validación).
     - Retorna `{ ok: true, updatedFiles: [...], summaryByTable: [...], warnings: string[], appliedAt: string }`.

3. **Cliente Tipado (`src/lib/sqlSeedSyncClient.ts`):**
   - Replica el patrón limpio de `src/lib/databaseBackupClient.ts`:
     - Adjunta `Authorization: Bearer <access_token>` desde `supabase.auth.getSession()`.
     - Define tipos exportados (`SeedSyncCatalogResponse`, `SeedSyncPreviewResponse`, `SeedSyncApplyResponse`, `SeedSyncTableDiffSummary`) y estado inicial de vista (`createInitialDatabaseSeedSyncState()`).
     - Funciones: `fetchSeedSyncCatalog()`, `previewSqlSeedSync(sectionIds, includeFkSupport)`, `applySqlSeedSync(sectionIds, includeFkSupport)`.

---

## 3. Checklist de Verificación

- [ ] `requireApprovedAdmin` bloquea con `401`/`403` cualquier solicitud sin sesión o con rol `WORKER`, `AUDITOR`, `CLIENT` o estado `PENDING`/`REJECTED`.
- [ ] `POST /api/admin/db/seed-sync/preview` nunca modifica `06_datos_prueba.sql` ni `07_normas_requisitos_csv.sql`.
- [ ] `POST /api/admin/db/seed-sync/apply` escribe de forma atómica únicamente en los archivos destino correspondientes a las secciones seleccionadas.
- [ ] Selección vacía o IDs inválidos devuelven `400` con mensaje claro en español.
- [ ] Ejecución exitosa de `npx tsx --test src/lib/sqlSeedSyncClient.test.ts`, `npm test` y `npm run lint`.
