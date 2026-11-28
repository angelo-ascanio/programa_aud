# Paso 4.1 — Verificación Integral End-to-End (Multi/Detail View → Sync → `06`/`07` → Reset DB `00→07` → Chromium)

> **Objetivo:** Validar de extremo a extremo todo el flujo de la consola **`Sincronización SQL`** (`#database-sync`) en entorno real (`http://localhost:3000` + PostgreSQL/Supabase + Chromium headless `playwright-cli`), comprobando cambios reales desde Multi View y Detail View, cascada Padre→Hijos, caso especial `Extra → Norma`, idempotencia en reinicio completo `00→07` y aislamiento estricto RBAC.

---

## 1. Archivos Exactos a Crear o Modificar

- **Crear (si es necesario para pruebas automatizadas de integración SQL/servidor):**
  - `src/lib/sqlSeedSyncE2E.test.ts` (pruebas de ida y vuelta sobre escenarios reales simulados/fixture sin ensuciar los `.sql` productivos del repo).
- **Verificar y restaurar estado limpio en:**
  - `public/supabase/queries/06_datos_prueba.sql` y `public/supabase/queries/07_normas_requisitos_csv.sql` (tras pruebas destructivas o de demostración, asegurarse de que queden en estado limpio/esperado o con cambios deseados verificados por `POST /api/reset-db`).

---

## 2. Escenarios Obligatorios de Verificación

1. **Escenario 1 — Bloque 2 `Certificación → Certificado` (Cascada Padre → Hijos + Edición de Campo Único):**
   - Desde la app (`ADMIN` o `WORKER`):
     1. Editar el `numero_certificado` de un certificado de prueba (o crear uno temporal con `Alcance`, `Sitio`, `Proceso` nuevo y asignación de `Cláusulas` en `requisitos_por_proceso` + `Turno`).
   - En `#/database-sync` como `ADMIN`:
     2. Marcar **únicamente** `Certificación → Certificado`.
     3. Pulsar `Analizar Diferencias`: verificar que el resumen reporta el certificado modificado/nuevo y **todas sus tablas hijas** (`certificado_version`, `alcance`, `sitio`, `proceso`, `procesos_por_sitio`, `requisitos_por_proceso`, `turno`, `turnos_por_sitio`).
     4. Pulsar `Aplicar Sincronización`.
   - Verificación SQL real:
     5. Ejecutar `POST /api/reset-db` (`00` → `07`).
     6. Confirmar en la UI recargada que el certificado, proceso y cláusulas sincronizados siguen intactos en Postgres.
     7. Ejecutar una **segunda corrida** de `06_datos_prueba.sql` y confirmar **0 errores** (`23505`, `23503`, triggers).

2. **Escenario 2 — Bloque 1 `Auditoría` (Selección por Bloque Completo y por Sub-sección):**
   - Crear/modificar registros desde Bloque 1 Detail View (ej. `3. Auditor`, `5. Turno`, `6. Resultado` o `1.3 Fecha`).
   - Probar primero selección individual (ej. solo `5. Turno`) y luego toggle del bloque completo `Auditoría`.
   - Confirmar en `Preview` y `Apply` que respeta orden topológico y reglas de triggers (`trg_validar_auditoria_requiere_alcance`, `equipo_auditor`, `auditoria_fecha`).

3. **Escenario 3 — Caso Especial `Extra → Norma` (`07_normas_requisitos_csv.sql`):**
   - Editar desde `Extra → Norma` el título/traducción ES o la obligatoriedad (`obligatorio_origen = 'MANUAL'`) de una cláusula de prueba.
   - En `#/database-sync`, seleccionar únicamente `Extra → Norma` (o todo el bloque `Extra`).
   - Confirmar que el archivo actualizado de normas/cláusulas/traducciones es **`public/supabase/queries/07_normas_requisitos_csv.sql`**, preservando el conteo íntegro de normas, cláusulas `LTREE` y los 7 UUIDs históricos.
   - Validar con `POST /api/reset-db` que `07_normas_requisitos_csv.sql` ejecuta sin errores y conserva el cambio.

4. **Escenario 4 — Seguridad RBAC y Responsivo en Navegador Real (`1440×900` y `390×844`):**
   - Iniciar sesión con `ADMIN` (`admin@fondonorma.test`), `WORKER`, `AUDITOR` y `CLIENT`:
     - `ADMIN`: menú muestra `Sincronización SQL`, `#/database-sync` funciona en escritorio (`1440×900`) y móvil (`390×844`) con `0` desbordamiento horizontal (`scrollWidth <= innerWidth`), `0` UUIDs visibles en labels/tablas, `0` botones dentro de `<tbody>` y `0` errores de consola/red.
     - `WORKER`, `AUDITOR`, `CLIENT`: el menú **no muestra** `Sincronización SQL`, navegar por URL a `#/database-sync` redirige a `#/dashboard`, y peticiones directas `GET`/`POST /api/admin/db/seed-sync/*` con su token devuelven HTTP `403`.

---

## 3. Checklist de Verificación

- [ ] Suite completa unitaria verde: `npx tsx --test src/lib/*.test.ts src/views/*.test.ts` (0 fallos).
- [ ] TypeScript estricto y lint limpio: `npm run lint`.
- [ ] Compilación de producción sin errores: `npm run build`.
- [ ] Reset completo `00 → 07.sql` + segunda corrida idempotente de `06_datos_prueba.sql` y `07_normas_requisitos_csv.sql` con 0 errores SQL.
- [ ] Auditoría `playwright-cli` en `1440×900` y `390×844` aprobada para los 4 roles sin errores de consola ni regresión visual.
