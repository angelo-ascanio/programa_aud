# Paso 3.2 — Orquestación en `src/main.ts` y Coherencia Multi View / Detail View

> **Objetivo:** Integrar completamente la vista **`Sincronización SQL`** (`database-sync`) dentro de `src/main.ts` (estado, navegación hash, eventos de selección por bloque/sección, flujo `Analizar → Aplicar`, notificaciones y manejo de errores) y garantizar que las mutaciones realizadas desde cualquier Multi View o Detail View de los 3 bloques persistan limpiamente en PostgreSQL para ser sincronizadas.

---

## 1. Archivos Exactos a Crear o Modificar

- **Modificar:**
  - `src/main.ts` (estado `databaseSeedSync`, enrutamiento `'database-sync'`, handlers de selección de bloques/secciones, `preview`, `apply`, y limpieza de vista previa al cambiar selección).
- **Auditoría/Ajuste puntual (solo si se detecta algún desfase de persistencia en BD al probar):**
  - Eventuales helpers de persistencia de Multi View / Detail View si algún subcampo no estaba guardando `updated_at` o `deleted_at` de forma uniforme.
- **No modificar archivos SQL semilla manualmente durante la compilación.**

---

## 2. Reglas Técnicas Clave

1. **Estado y Enrutamiento en `src/main.ts`:**
   - Añadir `databaseSeedSync: DatabaseSeedSyncState` a `AppState` e inicializarlo con `createInitialDatabaseSeedSyncState()`.
   - En el bloque de renderizado principal (`renderMainContent` / `effectiveRoute`):
     - `else if (effectiveRoute === 'database-sync' && admin) { bodyHtml = renderDatabaseSeedSyncView(state.databaseSeedSync); }`
     - Redirección automática en `hashchange` / `popstate` y navegación inicial: si un usuario no-`ADMIN` accede a `#/database-sync`, redirigir silenciosamente vía `syncUrlHash('dashboard', null, true)` tal como ocurre con `#/database` y `#/database-backup`.
   - Al navegar hacia `database-sync`, cargar automáticamente `fetchSeedSyncCatalog()` si el catálogo aún no fue hidratado (evitando bucles infinitos mediante bandera `loadingCatalog`).

2. **Eventos Interactivos sin Pérdida de Foco/Scroll:**
   - `toggle-sync-all` / `clear-sync-selection`: selecciona o limpia las secciones de los 3 bloques.
   - `toggle-sync-block`: selecciona o deselecciona todas las secciones de `auditorias`, `certificacion` o `extra`.
   - `toggle-sync-section`: alterna una sección individual (y si se activa `auditorias.resumen`, refleja visualmente el alcance del bloque).
   - `toggle-sync-fk-support`: alterna `includeFkSupport`.
   - Regla de seguridad de vista previa: **cualquier cambio en la selección invalida (`null`) la vista previa anterior (`previewResult`)** para impedir que el usuario aplique cambios con un preview desactualizado.
   - `preview-sql-seed-sync`: bloquea doble clic (`analyzing = true`), invoca `previewSqlSeedSync(...)`, muestra resumen por archivo/tabla y fragmentos SQL.
   - `apply-sql-seed-sync`: exige vista previa vigente (`previewResult !== null`), bloquea doble clic (`applying = true`), invoca `applySqlSeedSync(...)`, muestra resultado de archivos actualizados y refresca el catálogo.

3. **Coherencia Transversal con Multi Views y Detail Views:**
   - Comprobar en `src/main.ts` que todas las altas/ediciones relevantes desde:
     - **Bloque 1 (`Auditoría`):** `1.1 Relación` .. `1.5 Temporal`, `2. Tiempo`, `3. Auditor`, `4. Proceso`, `5. Turno`, `6. Resultado`, `7. Revisión`
     - **Bloque 2 (`Certificación`):** `Conglomerado`, `Organización`, `Certificado` (incl. `Alcance`, `Sitios`, `Fechas`, `Contactos`, `Procesos`, asignación de `Cláusulas` en `requisitos_por_proceso`, `Exclusiones` ISO 4.3, `Turnos`), `Vínculo`, `Auditor`, `Experto`
     - **Bloque 3 (`Extra`):** `Norma` + `Requisito` (`es_obligatorio`, traducciones ES/EN), `Sector IAF`, `Acreditación`, `Estatus`, `Tipo`, `Metodología`
     persistan directamente en PostgreSQL/Supabase (y no queden solo en estado local en memoria) para que el endpoint `/api/admin/db/seed-sync/*` las detecte de inmediato.

---

## 3. Checklist de Verificación

- [ ] Navegar a `#/database-sync` como `ADMIN` carga el catálogo y permite seleccionar bloques/secciones individualmente o en bloque.
- [ ] Cambiar cualquier checkbox invalida la vista previa previa obligando a re-analizar antes de aplicar.
- [ ] Al ejecutar `apply`, los archivos `.sql` en `public/supabase/queries/` reflejan el cambio real hecho previamente desde cualquier Multi View o Detail View.
- [ ] Usuarios `WORKER`, `AUDITOR` y `CLIENT` que escriban `#/database-sync` en la URL son redirigidos a `#/dashboard` sin errores de consola.
- [ ] Ejecución exitosa de `npx tsx --test src/lib/*.test.ts src/views/*.test.ts`, `npm run lint` y `npm run build`.
