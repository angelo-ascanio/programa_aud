# Resumen Ejecutivo y Técnico — Compartición Selectiva de Hijos de Certificado en Conglomerado (`future_changes`)

## 1. Visión General y Objetivo Funcional

De forma análoga a como el sistema permite vincular auditorías entre certificados pertenecientes a un mismo **Conglomerado (`public.grupo_empresarial`)** manteniendo la posibilidad de gestionar certificados de forma individual, esta iniciativa habilita **compartir selectivamente registros hijos** desde el detalle de un Certificado origen **"X"** hacia uno o más Certificados destino **"Y"** del mismo Conglomerado (mientras otros registros **"C"** permanecen exclusivos de **"X"**).

El flujo de usuario debe ser directo, simple y sin fricciones (**botón `Compartir`** en las pestañas de detalle de Certificado):
1. El usuario (`ADMIN` / `WORKER` aprobado) abre el detalle del Certificado **"X"** y selecciona la pestaña de la entidad hija (`Contactos`, `Turnos`, `Procesos` o `Sitios`).
2. Hace clic en **`Compartir`**.
3. Selecciona qué registros individuales de **"X"** desea vincular (por ejemplo, Contactos **"A"** y **"B"**, dejando **"C"** solo en **"X"**).
4. Selecciona uno o varios Certificados **"Y"** activos del mismo **Conglomerado (`id_grupo_empresarial`)**.
5. Confirma —y en el caso de **`Proceso`** (o **`Sitio`** con procesos asociados) hacia una norma ISO distinta o con exclusiones ISO 4.3, resuelve de forma guiada los requisitos normativos aplicables al certificado destino sin mezclar jamás cláusulas de normas distintas.

Los vínculos creados son **vínculos vivos** (no copias desconectadas): editar el contacto, turno, nombre del proceso o dirección física del sitio refleja el cambio en los certificados vinculados, pero cada certificado destino conserva independencia para **Desvincular** sin eliminar el registro origen ni afectar a los demás certificados, y en `Proceso` / `Sitio` conserva sus propios requisitos normativos y alcance de auditoría.

---

## 2. Alcance por Entidad Hija del Certificado

| Entidad | Complejidad | Modelo de Vinculación | Reglas Clave |
| :--- | :--- | :--- | :--- |
| **`Contacto`** (`contacto_certificado`) | Directa y simple | Tabla puente `contacto_certificado_compartido` (`id_contacto`, `id_certificado`, `deleted_at`) | Comparte el contacto y sus canales vivos (`telefono_contacto_certificado`, `email_contacto_certificado`). Evita colisión de nombre duplicado activo en el destino. Desvincular solo afecta al certificado destino. |
| **`Turno`** (`turno` + `turnos_por_sitio`) | Directa y simple | Tabla puente `turno_certificado_compartido` (`id_turno`, `id_certificado`, `deleted_at`) + vinculación opcional en `turnos_por_sitio` | `public.turno` ya es catálogo horario único `(hora_entrada, hora_salida)`. Al compartir hacia **"Y"**, el turno queda visible en `Certificado Y → Turnos` y opcionalmente se asigna en `turnos_por_sitio` a las sedes activas de **"Y"** (ej. `Sitio 0 HQ`) para disponibilidad inmediata en `5. Turno` de auditorías. |
| **`Proceso`** (`proceso` + `requisitos_por_proceso`) | Núcleo arquitectónico complejo | Tabla puente `proceso_certificado_compartido` (`id_proceso`, `id_certificado`, `deleted_at`) + evolución de `requisitos_por_proceso` con **`id_certificado NOT NULL`** (PK `(id_proceso, id_certificado, id_requisito)`) | Comparte la identidad operativa del proceso (`nombre_proceso`, `tipo`, `responsable`) dentro del Conglomerado, **aislando estrictamente sus cláusulas normativas por certificado**. Resuelve conflictos entre normas (ISO 9001 vs 14001/45001/27001/22000) y exclusiones ISO 4.3 antes de persistir. |
| **`Sitio`** (`sitio` + `turnos_por_sitio` + `procesos_por_sitio`) | Cascada controlada | Tabla puente `sitio_certificado_compartido` (`id_sitio`, `id_certificado`, `numero_sitio_asignado`, `deleted_at`) + `id_certificado` en `procesos_por_sitio` | Comparte la sede física resolviendo colisiones de `numero_sitio = 0` (`Sitio 0 HQ`) en destino; permite propagar sus `turnos_por_sitio` y `procesos_por_sitio` seleccionados pasando obligatoriamente por el **resolvedor de requisitos `Proceso ↔ Requisito`** para cada certificado destino. |

---

## 3. Estrategia de Resolución de Conflictos `Proceso ↔ Requisito` entre Normas ISO

El mayor riesgo funcional de compartir un `Proceso` entre certificados radica en que cada certificado puede auditarse bajo una norma diferente (por ejemplo, Certificado **"X"** bajo **ISO 9001:2015** y Certificado **"Y"** bajo **ISO 14001:2015**, **ISO 45001:2018** o **ISO/IEC 27001:2022**), o bajo la misma norma pero con distintas **exclusiones ISO 4.3** (`requisitos_no_aplicables_certificado`).

### 3.1 Invariante Fundamental de Datos (Cero Mezcla de Normas)
1. **Aislamiento por Certificado en `requisitos_por_proceso`:** Cada enlace de requisito lleva explícitamente `id_certificado`. Todo requisito vinculado a `(id_proceso, id_certificado = Y)` **debe** pertenecer obligatoriamente a `Y.id_norma` (validado en TypeScript y reforzado por trigger PostgreSQL `fn_guard_req_proceso_against_exclusion`).
2. **Evaluación LTREE y Smart Mutation Independientes:**
   - `evaluar_cobertura_certificado(p_id_certificado)` evalúa únicamente filas de `requisitos_por_proceso` cuyo `id_certificado = p_id_certificado` de procesos propios o compartidos activamente con ese certificado.
   - Si en Certificado **"Z"** (ISO 9001) se declara **No Aplicable (ISO 4.3)** la cláusula `8.3`, la poda automática (`fn_smart_prune_process_clauses_on_exclusion`) elimina `8.3` **únicamente** para `(P, Z)`, preservando intacta la cobertura de `8.3` en Certificado **"X"**.

### 3.2 Taxonomía y Matriz de Resolución de Conflictos al Compartir

Al compartir el proceso `P` (desde Certificado **"X"** con norma $N_X$ y conjunto de cláusulas $R_X$) hacia Certificado **"Y"** (con norma $N_Y$ y exclusiones $E_Y$), el motor puro (`src/lib/procesoClauseResolver.ts`) clasifica cada cláusula origen $r \in R_X$ en una de cinco categorías deterministas:

1. **Coincidencia Directa Misma Norma (`EXACT_SAME_NORM`):**
   - *Cuándo:* $N_X = N_Y$ (por ejemplo, ISO 9001 → ISO 9001) y la cláusula no está excluida en "Y".
   - *Resolución:* Mapeo automático 1:1 al mismo `id_requisito`, preseleccionado para confirmar en 1 clic.

2. **Conflicto de Granularidad Jerárquica / HLS (`HIERARCHICAL_ROLLUP` / `HIERARCHICAL_ROLLDOWN`):**
   - *Ejemplo real:* ISO 9001 posee las subcláusulas `4.4.1` y `4.4.2` (*Sistema de gestión de la calidad y sus procesos*), mientras que ISO 14001 solo define la cláusula padre `4.4` (*Sistema de gestión ambiental*). También ocurre el caso inverso (ISO 14001 `4.4` → ISO 9001 `4.4` / `4.4.1` + `4.4.2`).
   - *Resolución:*
     - **Fino → Grueso (`4.4.1`, `4.4.2` → `4.4`):** El resolvedor asciende por el código/árbol jerárquico hasta encontrar el ancestro compatible en $N_Y$ (`4.4`), verifica que no exista conflicto temático en el capítulo y **colapsa sin duplicados** múltiples subcláusulas origen en una única sugerencia hacia `4.4` en $N_Y$, mostrando la trazabilidad `"4.4.1, 4.4.2 (ISO 9001) → 4.4 (ISO 14001)"` preseleccionada para confirmación del usuario.
     - **Grueso → Fino (`4.4` → `4.4` / `4.4.1`+`4.4.2`):** Si $N_Y$ posee el padre `4.4`, lo sugiere directamente (en LTREE ya cubre sus descendientes `<@`); si no existe el nodo padre suelto o el usuario desea granularidad, permite expandir a `4.4.1` / `4.4.2`.

3. **Colisión Semántica / Mismo Código con Distinto Tema (`SEMANTIC_COLLISION`):**
   - *Ejemplo real:* La cláusula **`8.2`** existe tanto en **ISO 9001** (*"Requisitos para los productos y servicios"*) como en **ISO 14001 / ISO 45001** (*"Preparación y respuesta ante emergencias"*) y en **ISO/IEC 27001** (*"Evaluación de riesgos de seguridad de la información"*). Un mapeo ingenuo por `codigo = '8.2'` cometería un grave error de conformidad ISO.
   - *Resolución:*
     - Nunca se auto-asigna por igualdad de código en capítulo `8` o subcláusulas específicas de disciplina sin validar equivalencia mediante el **Registro de Concordancia HLS (Estructura de Alto Nivel / Annex SL)** y comparación semántica de títulos.
     - Se marca con advertencia **`⚠ Conflicto Semántico`**, **desmarcada por defecto**, mostrando frente a frente el título de la cláusula origen y el título de la cláusula destino (`ISO 9001: 8.2 Requisitos para los productos y servicios` ≠ `ISO 14001: 8.2 Preparación y respuesta ante emergencias`), permitiendo al usuario dejarla omitida o elegir manualmente otra cláusula de $N_Y$ (por ejemplo, `8.1` Control operacional) si aplica al proceso.

4. **Cláusula Inexistente en Norma Destino (`NO_EQUIVALENT`):**
   - *Ejemplo real:* La cláusula **`8.3`** (*"Diseño y desarrollo de los productos y servicios"*) existe en **ISO 9001**, pero **no existe** en **ISO 14001** (y en **ISO 27001** el Anexo `A.*` tampoco existe en ISO 9001).
   - *Resolución:* Se marca como **`Sin equivalencia en norma destino (Omitida)`**. No genera error ni bloquea la compartición del proceso; el usuario puede confirmar la omisión o elegir opcionalmente una cláusula alternativa del catálogo de $N_Y$.

5. **Bloqueo por Exclusión ISO 4.3 en Destino (`EXCLUDED_ISO43`):**
   - *Cuándo:* La cláusula resuelta en $N_Y$ está declarada en `requisitos_no_aplicables_certificado` de **"Y"** (directamente o vía ancestro LTREE `<@`).
   - *Resolución:* Se muestra bloqueada (`disabled`) con su justificación ISO 4.3 en destino, impidiendo que la transacción falle por el trigger `REQ_EXCLUDED_BY_ISO43`.

---

## 4. Invariantes Transversales Obligatorios en Todos los Pasos

- **Seguridad y RBAC (4 Roles + Aislamiento Nivel 2 `CLIENT`):**
  - Solo `ADMIN` y `WORKER` aprobados pueden ejecutar `Compartir` o `Desvincular`. `AUDITOR` y `CLIENT` son estrictamente de solo lectura respecto a estas acciones (y `AUDITOR` mantiene bloqueado Bloque 2 salvo sus certificados asignados vía auditoría).
  - Un usuario `CLIENT` autorizado únicamente sobre la Organización **B** (Certificado **Y**) puede ver el registro compartido dentro de **Y**, pero **jamás** verá nombres de Organización **A**, códigos de Certificado **X** ni vínculos hacia terceros certificados del Conglomerado a los que no tenga acceso (`has_client_org_access`).
- **Soft-Delete y Gobernanza (`archive_record`):**
  - Las 4 tablas puente de compartición utilizan `deleted_at` / `deleted_by`, `REVOKE DELETE`, trigger `fn_prevent_hard_delete`, auditoría en `audit_log` e índices únicos parciales `WHERE deleted_at IS NULL`.
  - No se permite archivar un `contacto_certificado`, `proceso` o `sitio` mientras mantenga comparticiones activas (el usuario debe desvincularlo primero, o ver el desglose claro en `get_archive_dependency_summary`).
- **Zero-UUID y TypeScript Estricto (`strict: true`, `0 any`):**
  - Toda validación usa `isValidUuid()` / `assertValidUuid()`, cero UUIDs crudos en UI, modales, toasts o mensajes SQL traducidos.
- **Patrón UI Canónico:**
  - Tablas hijas mantienen `table-fixed`, `<colgroup>` sumando `100%` y `0 <button>` dentro de `<tbody>`. El flujo `Compartir` vive en un modal limpio disparado desde la barra superior de la pestaña hija del certificado.

---

## 5. Índice Secuencial de Pasos de Implementación

### Bloque 1 — Base de Datos, Cobertura Normativa y Seguridad RLS (SQL)
1. **`step_1.1.md`**: Tablas puente `contacto_certificado_compartido` y `turno_certificado_compartido`, funciones de pertenencia, triggers de validación de Conglomerado e índices únicos parciales (`01_creacion.sql`, `03_indices_optimizacion.sql`).
2. **`step_1.2.md`**: Tabla `proceso_certificado_compartido`, evolución de `requisitos_por_proceso` con `id_certificado`, triggers de integridad/Smart-Mutation por certificado y actualización de `evaluar_cobertura_certificado` (`01_creacion.sql`, `02_cobertura_normativa.sql`, `03_indices_optimizacion.sql`).
3. **`step_1.3.md`**: Tabla `sitio_certificado_compartido` (resolución `Sitio 0 HQ`), evolución de `procesos_por_sitio` con `id_certificado`, triggers de auditoría compatibles (`sitios_por_auditoria`, `procesos_sitio_auditoria`), gobernanza `archive_record` / `audit_log` y políticas RLS Level-2 en `04_rls.sql` + semillero opcional en `06_datos_prueba.sql`.

### Bloque 2 — Dominio Puro, Resolvedor de Conflictos, Cascada de Sitios y Persistencia (TypeScript + `node:test`)
4. **`step_2.1.md`**: Módulo puro `src/lib/certificadoShareDomain.ts` (elegibilidad en Conglomerado, aislamiento `CLIENT`, compartir/desvincular `Contacto` y `Turno`), actualización de `certificadoSubEntities.ts`, `turnoDomain.ts` y `archiveGovernance.ts` + tests unitarios.
5. **`step_2.2.md`**: Motor puro `src/lib/procesoClauseResolver.ts` (Concordancia HLS, `4.4.1`/`4.4.2`→`4.4`, colisión semántica `8.2`, inexistentes `8.3`, exclusión ISO 4.3), actualización de `multisiteSampling.ts`, `coverageEngine.ts` y `procesoDomain.ts` + tests unitarios.
6. **`step_2.3.md`**: Módulo puro `src/lib/sitioShareDomain.ts` (resolución `numero_sitio`, cascada de `turnos_por_sitio` y `procesos_por_sitio` invocando al resolvedor de cláusulas), actualización de `sitioDomain.ts`, `programaCertificadoDomain.ts` y `archiveGovernance.ts` + tests unitarios.
7. **`step_2.4.md`**: Persistencia transaccional e hidratación en `src/lib/certificadoSharePersistence.ts` y `src/main.ts` (carga de tablas `*_compartido`, `requisitos_por_proceso` por certificado, `procesos_por_sitio` por certificado, sanitización Zero-UUID y mensajes en español) + tests unitarios.

### Bloque 3 — Interfaz de Usuario (`Compartir` / `Desvincular`) en Detalle de Certificado y Vistas Hijas
8. **`step_3.1.md`**: Modal reutilizable `src/views/shareModalView.ts` y flujo completo `Compartir` / `Desvincular` para `Contacto` y `Turno` en `certificadoView.ts`, `contactoView.ts`, `turnoView.ts` y `src/main.ts`.
9. **`step_3.2.md`**: Extensión de `shareModalView.ts` para `Proceso` y `Sitio` con panel visual de **Resolución de Requisitos por Norma Destino** y cascada de sitios, más badges/desvinculación y contexto de certificado en `certificadoView.ts`, `procesoView.ts`, `sitioView.ts` y `src/main.ts`.

### Bloque 4 — Documentación y Verificación Integral Final
10. **`step_final.md`**: Actualización de la arquitectura documentada en `public/doc/` y verificación integral de BD (`00`–`07`), `npm run lint`, `npm test`, `npm run build` y E2E Playwright Chromium multi-rol (`ADMIN`, `WORKER`, `AUDITOR`, `CLIENT`) en desktop y móvil.
