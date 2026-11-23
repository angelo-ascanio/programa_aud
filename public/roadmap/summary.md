# Roadmap de Implementación — `future_changes.txt` (Bloque 2 Compartición Simplificada + Bloque 1 `Designación → Sitio`)

**Estado:** Planificado · Listo para ejecución paso a paso  
**Alcance fuente:** `public/prompting/future_changes.txt` (líneas 22–47)  
**Restricción:** Este roadmap cubre exclusivamente la especificación, arquitectura, pasos de implementación y criterios de verificación. Ningún archivo de código fuente, SQL o `public/doc/*` ha sido modificado durante su generación.

---

## 1. Visión General de los Dos Pilares

### Pilar 1 — Compartición Simplificada de Procesos y Requisitos entre Certificados (`future_changes.txt` L22–28)
Reemplazar el motor complejo y lento de resolución semántica entre normas (`procesoClauseResolver.ts` + matriz interactiva por cláusula en `shareModalView.ts`) por una regla binaria, instantánea y transparente para el usuario:

1. **Misma Norma (`sourceCert.id_norma === targetCert.id_norma`):**
   - Al compartir un proceso, se comparte el **proceso (`proceso_certificado_compartido`) junto con sus requisitos (`requisitos_por_proceso`)**, respetando únicamente las exclusiones ISO 4.3 del certificado destino (`requisitos_no_aplicables_certificado` / `trg_guard_req_proceso_against_exclusion`).
   - Se habilita además la **sincronización bidireccional/propagada** de requisitos (`sincronizar_requisitos = TRUE`) cuando el usuario comparta ambos juntos o sincronice el conjunto de cláusulas posteriormente: cualquier alta o baja de cláusula en ese proceso compartido se refleja en los certificados de la misma norma vinculados con sincronización activa.
   - Se soporta compartir **juntos** (proceso + requisitos) y **por separado** (compartir primero solo el proceso, o compartir/sincronizar el conjunto de requisitos desde `procesoView` / modal en un segundo momento).
2. **Norma Distinta (`sourceCert.id_norma !== targetCert.id_norma`):**
   - Se comparte **únicamente el proceso** (`proceso_certificado_compartido` con `sincronizar_requisitos = FALSE`).
   - El certificado destino recibe el proceso **completamente vacío (0 requisitos en `requisitos_por_proceso`)**; sus cláusulas se gestionan de forma 100% independiente por norma/certificado.
   - La cascada de procesos al compartir un **Sitio** (`sitioShareDomain.ts`) adopta exactamente esta misma regla binaria sin resolución semántica.
3. **Mensajería Clara y Sin Fricción:**
   - El modal y la ficha de proceso muestran mensajes directos, claros y Zero-UUID indicando si la compartición es de **Misma norma** (comparte/sincroniza proceso + requisitos) o de **Norma distinta** (comparte solo proceso vacío).

---

### Pilar 2 — Refactor "Less Is More" de `Auditoría > Designación > Sitio` e Integración de Sitios Compartidos (`future_changes.txt` L32–47)
Adaptar `#/auditorias/designacion/sitio` (`designacionSitioView.ts`, `designacionSitioDomain.ts`, `src/main.ts`) para escalar limpiamente a **30–80+ sedes** con sitios propios y compartidos unificados:

1. **Integración Total de Sitios Compartidos (`sitio_certificado_compartido`):**
   - Los sitios compartidos hacia un certificado operan exactamente igual que los sitios propios en selección/exclusión (`sitios_por_auditoria`), filtros, ordenamiento, bloqueo `Sitio 0 (HQ)` cuando `sitio_certificado_compartido.numero_sitio = 0`, cobertura histórica y propagación aguas abajo (`Tiempo`, `Proceso`, `Turno`).
   - Se corrige en `loadLiveAudits()` (`src/main.ts`) la hidratación de `AuditoriaSitioPlanItem.numero_sitio` para priorizar el `numero_sitio` efectivo del certificado receptor (respetando overrides de `sitio_certificado_compartido`) y no el `sitio.numero_sitio` maestro del certificado origen.
2. **Detalle Limpio ("Less Is More"):**
   - Se conservan en la cabecera las dos franjas superiores de `auditSectionShell.ts`: navegación temporal multi-auditoría (`◀ / <select> / ▶`) y selector de certificados hermanos en auditorías vinculadas (`linkedSiblings`).
   - Debajo de ellas, **se renderiza ÚNICAMENTE la tarjeta del certificado activo** (eliminando el apilamiento simultáneo de todos los certificados hermanos `linkedModels.map(...)`).
   - La tarjeta de sitios del certificado activo inicia **colapsada por defecto** (`isExpanded = false`), mostrando un resumen mínimo (`certificado`, `N de M sitios`, `Cobertura`) y botón expandir/contraer.
   - Se elimina ruido visual: banners explicativos largos, pills redundantes de estado/vinculación y subtítulos verbosos.
3. **Filtrado y Ordenamiento Escalable (30–80+ Sitios):**
   - `<select>` de filtro rápido dentro de la tarjeta expandida:
     - `ALL`: Todos los sitios
     - `SELECTED`: Seleccionados en esta auditoría
     - `UNSELECTED`: No seleccionados
     - `LINK_SELECTED`: Ya seleccionados en otro certificado del vínculo (`programa_auditoria`)
     - `NOT_AUDITED_LAST_N`: No auditados en las últimas `N` auditorías previas (muestra un `<input type="number" min="0" step="1">` con default `1`; `0` = muestra todos, `k >= 1` = excluye sitios incluidos en alguna de las últimas `k` auditorías cronológicas previas no canceladas del mismo certificado)
     - Extras de alto valor: `SHARED_ONLY` (Solo compartidos) y `UNVISITED_CYCLE` (Nunca auditados / 0 previas).
   - `<select>` de ordenamiento: `SITE_NUMBER`, `SELECTED_FIRST`, `LEAST_RECENTLY_AUDITED`, `PERSONAL_DESC`, `NAME_ASC`.
   - Búsqueda rápida inline (útil en catálogos de 30–80+ sedes) + grilla compacta de filas seleccionables.

---

## 2. Grafo de Dependencias y Orden de Ejecución

```text
step_1.1.md (SQL Schema, Trigger Guard, Sync RPC/Trigger, RLS & Seeds)
    │
    ▼
step_1.2.md (Domain & Transactional Persistence: Binary Rule + Sync + Cascade)
    │
    ▼
step_1.3.md (Share Modal UX + ProcesoView Sync Action + main.ts Handlers)
    │
    ▼
step_2.1.md (Domain Designación→Sitio: Active-Only, Filters, NOT_AUDITED_LAST_N, Order)
    │
    ▼
step_2.2.md (UI "Less Is More": Single Collapsible Card, Filter/Order Bar, Compact Rows)
    │
    ▼
step_2.3.md (main.ts Wiring: loadLiveAudits numero_sitio fix, Event Bindings, Sync)
    │
    ▼
step_final.md (Full Tests, Lint/Build, Playwright 4 Roles 1440x900 & 390x844, Docs Sync)
```

---

## 3. Mapa de Archivos Impactados por Paso

| Paso | Archivos SQL / Dominio / Vista / Main | Tests Directamente Impactados |
| :--- | :--- | :--- |
| `step_1.1.md` | `public/supabase/queries/01_creacion.sql`, `03_indices_optimizacion.sql`, `04_rls.sql`, `06_datos_prueba.sql` | `src/lib/step101SqlSchema.test.ts`, `src/lib/phase11SqlMigration.test.ts`, `src/lib/phase12RlsHardening.test.ts` |
| `step_1.2.md` | `src/lib/certificadoShareDomain.ts`, `src/lib/certificadoSharePersistence.ts`, `src/lib/sitioShareDomain.ts`, `src/lib/procesoClauseResolver.ts`, `src/lib/procesoDomain.ts` | `certificadoShareDomain.test.ts`, `certificadoSharePersistence.test.ts`, `sitioShareDomain.test.ts`, `procesoClauseResolver.test.ts`, `procesoDomain.test.ts` |
| `step_1.3.md` | `src/views/shareModalView.ts`, `src/views/procesoView.ts`, `src/views/certificadoView.ts`, `src/main.ts` | `src/views/shareModalView.test.ts`, `src/views/procesoView.test.ts`, `src/views/certificadoView.test.ts` |
| `step_2.1.md` | `src/lib/designacionSitioDomain.ts` | `src/lib/designacionSitioDomain.test.ts` |
| `step_2.2.md` | `src/views/designacionSitioView.ts` | `src/views/designacionSitioView.test.ts` |
| `step_2.3.md` | `src/main.ts` (y validación de `designacionFechaDomain`/`programaProcesosDomain`/`tiempoDomain`) | `src/lib/designacionSitioDomain.test.ts`, `src/views/designacionSitioView.test.ts` |
| `step_final.md` | `public/doc/*`, `public/certificado/*` | Toda la suite `src/**/*.test.ts`, `npm run lint`, `npm run build`, Playwright E2E |

---

## 4. Invariantes Arquitectónicos Obligatorios (No Negociables)

1. **Strict TypeScript (`0 any`):** Prohibido usar `any`, `as any`, o supresiones de tipo. Todas las interfaces nuevas y mock clients en tests deben estar estrictamente tipadas.
2. **Zero-UUID en UI y Errores:** Ningún UUID v4/v1 debe aparecer en etiquetas visibles, tooltips, banners, toasts, logs de usuario o mensajes de error devueltos por PostgreSQL/TypeScript (`stripRawUuidsFromText` / `formatZeroUuidError`).
3. **Soft-Delete & Gobernanza de Archivo (`archive_record`):**
   - `REVOKE DELETE` se mantiene intacto en tablas con `deleted_at`.
   - Excepción preservada: `requisitos_por_proceso` es tabla asociativa M:N pura (`PK (id_proceso, id_certificado, id_requisito)`) con `INSERT`/`DELETE` para `WORKER`/`ADMIN`.
   - Toda desvinculación de `proceso_certificado_compartido` y `sitio_certificado_compartido` pasa por `archive_record(...)`.
4. **Aislamiento RLS Nivel 2 (`CLIENT`) y Bloque 2 (`AUDITOR`):**
   - `CLIENT` solo lee registros propios o explícitamente compartidos hacia certificados de sus organizaciones autorizadas; nunca muta datos operativos ni comparticiones.
   - `AUDITOR` opera exclusivamente dentro de sus auditorías asignadas; nunca modifica configuraciones de compartición ni selección de sitios en `Designación → Sitio`.
5. **Reglas de UI Canónicas (`public/certificado/`):**
   - Tablas Multi View con `table-fixed` y `<colgroup>` sumando `100%`, `0` `<button>` dentro de `<tbody>`.
   - Filas clickeables sin saturación de botones, jerarquía tipográfica sobria, estética "Less Is More" en Detail View.

---

## 5. Matriz de Riesgos y Mitigaciones

| Riesgo | Impacto | Mitigación en el Roadmap |
| :--- | :--- | :--- |
| Recursión infinita en trigger de sincronización sobre `requisitos_por_proceso` | Alto (fallo SQL `54001`) | Usar guarda `pg_trigger_depth() <= 1` + `ON CONFLICT DO NOTHING` + verificación de estado preexistente (`WHERE EXISTS` / `NOT EXISTS`) en `step_1.1.md`. |
| Cláusula agregada en cert A está excluida por ISO 4.3 en cert B (misma norma) | Medio (violación `REQ_EXCLUDED_BY_ISO43`) | El RPC/trigger de sincronización filtra explícitamente contra `requisitos_no_aplicables_certificado` (LTREE `<@`) de cada certificado destino antes de insertar (`step_1.1.md`), evitando abortar la transacción. |
| Romper tests existentes de `procesoClauseResolver.test.ts` o `shareModalView.test.ts` | Medio (regresión CI) | Mantener compatibilidad controlada o refactorizar explícitamente la suite de tests en `step_1.2.md` y `step_1.3.md` con casos específicos para la regla binaria + sincronización. |
| `Sitio 0` compartido con `numero_sitio > 0` bloqueado erróneamente como HQ en `Designación → Sitio` | Alto (bug funcional) | Corregir `loadLiveAudits()` en `step_2.3.md` para resolver `numero_sitio` de `sitiosPlan` usando la tabla de `sitio_certificado_compartido` del certificado de la auditoría. |
| Confusión con filtro `NOT_AUDITED_LAST_N` cuando `N = 0` o en presencia de auditorías futuras/canceladas | Medio (UX incorrecta) | Definir en `step_2.1.md` que solo cuentan auditorías no canceladas cronológicamente anteriores (`idx < currentIdx`) y que `N = 0` desactiva la exclusión histórica (muestra todos). |
