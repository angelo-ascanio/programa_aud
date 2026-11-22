# Roadmap de Enriquecimiento Integral del Escenario `Grupo Industrial Iberometal` (`06_datos_prueba.sql` + Paridad SQL/TS)

## 1. Objetivo General

Traducir íntegramente las especificaciones de `public/prompting/future_changes.txt` en pasos incrementales, verificables y libres de regresiones sobre `programa_aud`, enfocándose en transformar el conglomerado **`Grupo Industrial Iberometal`** (`CONG-IND-01`) y sus dos organizaciones (**`Iberometal Componentes S.A.`** y **`Example, C.A.`**) en un escenario demostrativo completo, realista y coherente de extremo a extremo.

---

## 2. Hallazgos Arquitectónicos Previos (Auditoría de `public/doc/` y `public/supabase/queries/`)

Antes de diseñar los pasos se auditaron los 8 scripts SQL (`00_delete_tables.sql` .. `07_normas_requisitos_csv.sql`), la API de reinicio (`server.ts` → `POST /api/reset-db`), la documentación en `public/doc/` y la batería de pruebas en `src/lib/*.test.ts`. Se detectaron **4 restricciones críticas** que gobiernan toda la implementación:

1. **Orden lexicográfico de ejecución (`06_datos_prueba.sql` se ejecuta ANTES de `07_normas_requisitos_csv.sql`):**
   - `server.ts` (`listOrderedSqlFiles()`) ejecuta los archivos en orden `00` → `07`.
   - Actualmente la Sección `-- 9.` de `06_datos_prueba.sql` solo inserta **7 cláusulas** de `ISO 9001:2015` (`4`, `4.1`, `4.2`, `5`, `5.1`, `8`, `8.5`), mientras que las **2,188 cláusulas** completas de las 8 normas se cargan después en `07_normas_requisitos_csv.sql`.
   - **Solución limpia sin alterar el orden `00`→`07` ni romper `scripts/buildNormasSeed.ts`:** En el **Paso 1.1**, ampliar la Sección `-- 9.` de `06_datos_prueba.sql` pre-insertando las cláusulas padre/subcláusulas de nivel 1 y nivel 2 requeridas (`4.1`–`10.3` / `8.3` de `ISO 9001:2015`, `ISO 14001:2015`, `ISO 45001:2018` y `ISO/IEC 27001:2022`) con los **mismos UUIDs deterministas, `id_requisito_padre`, `ruta_materializada`, `explicit_code`, `external_key` y `es_obligatorio` exactos de `07_normas_requisitos_csv.sql`**, preservando los 7 UUIDs históricos (`f000...0004..0085`). Cuando `07_normas_requisitos_csv.sql` corre a continuación, su `ON CONFLICT (id_norma, codigo) WHERE deleted_at IS NULL DO UPDATE` conserva intactos los UUIDs y completa todo el árbol descendiente + traducciones ES/EN (`2,684` filas), logrando `100.00%` en `resumen_cobertura_certificado()` sin errores de FK.
2. **Bug histórico de exclusión ISO 4.3 en `06_datos_prueba.sql` (`5.1` vs `8.3`):**
   - La fila `ea000000-0000-0000-0000-000000000001` actualmente apunta a `f000...0051` (`5.1 Liderazgo y compromiso`) aunque su justificación técnica describe la exclusión de diseño y desarrollo (`8.3`).
   - En los **Pasos 1.1 y 2.2** se corrige para apuntar al UUID canónico de `8.3` en `07_normas_requisitos_csv.sql` (`a15db0ef-de9f-45a1-a680-ce2d6916d18a`) y se sincroniza la aserción correspondiente en `src/lib/phase12RlsHardening.test.ts` (líneas 353–357), manteniendo `5.1` cubierto por proceso directivo.
3. **Persistencia real de dotación por sitio (`public.sitio.personal_count`):**
   - El campo `personal_count` existía únicamente en fallback local (`INITIAL_CERTIFICADOS_DETAILED` en `src/lib/multisiteSampling.ts`), pero no existía columna en `public.sitio` (`01_creacion.sql`) ni lectura/escritura en `src/main.ts`.
   - Para cumplir con la regla de proporcionalidad *"más personas por sitio → más días de auditoría (`0.25d`); menos personas → menos tiempo"* con respaldo en BD, **Paso 1.1** incorpora `personal_count INTEGER NOT NULL DEFAULT 10 CHECK (personal_count BETWEEN 1 AND 50000)` en `public.sitio` y lo cablea en UI/TS (`sitioDomain.ts`, `sitioView.ts`, `certificadoView.ts`, `designacionTiempoView.ts`, `main.ts`).
4. **Invariantes de pruebas automatizadas y otros conglomerados:**
   - Deben conservarse intactos los escenarios y UUIDs asertados por pruebas unitarias:
     - `CONG-CYB-01` (`CyberCloud Solutions S.L.`, `2000...0002`, `4000...0003`, `AUD-2022-001` revisada QA `8000...0014`).
     - `CONG-ALM-01` (`Corporación Alimentaria del Sur`, `2000...0003`, `4000...0101..0111`, `VINC-ALM-S1..S4-N2`, `AUD-ALM-2026-010..011`, NCs `a100...0101..0102`) verificados por `phase11SqlMigration.test.ts`.
     - `AUD-2023-001` (`8000...0013` cerrada pendiente QA sobre `FN-QMS-2024-001`) verificado por `step101SqlSchema.test.ts` y `revisionDomain.test.ts`.
     - Aislamiento RLS Nivel 2 (`client@fondonorma.test` `4444...` solo autorizado sobre `Iberometal Componentes S.A.` `3000...0001`, nunca `Example, C.A.` `3000...0003` ni `CyberCloud`), y participación de `auditor@fondonorma.test` (`3333...`) en auditorías representativas.
     - Compuerta Paso 2 (`fn_validar_auditoria_en_programa()`): todo certificado con auditorías históricas o futuras debe pertenecer a un `vinculo_certificado` activo (no `LIBRE`); y cualquier certificado mantenido como `LIBRE` (por ejemplo `FN-QMS-2026-008` en `Estudio`) no debe tener filas activas en `auditoria`.

---

## 3. Arquitectura Objetivo de `Grupo Industrial Iberometal` (`CONG-IND-01`)

### A. Organizaciones y Certificados (Portafolio Curado)

| Organización | Certificado (UUID) | Código | Norma | Estatus | Multisitio | Sitios | Turnos Cert. | Vínculo |
| :--- | :--- | :--- | :--- | :--- | :---: | :---: | :---: | :--- |
| **Iberometal Componentes S.A.** (`3000...0001`) | `4000...0001` | `FN-QMS-2024-001` | `ISO 9001:2015` | `Activo` (Recertificado) | `TRUE` | 4 (`0..3`) | 5 | `VINC-N2-01` (Nivel 2 Multientidad) |
| **Iberometal Componentes S.A.** (`3000...0001`) | `4000...0002` | `FN-EMS-2025-002` | `ISO 14001:2015` | `Activo` | `TRUE` | 3 (`0..2`) | 4 | `VINC-N1-02` (Nivel 1 Combinada) |
| **Iberometal Componentes S.A.** (`3000...0001`) | `4000...0010` | `FN-SST-2025-010` | `ISO 45001:2018` | `Activo` | `TRUE` | 3 (`0..2`) | 4 | `VINC-N1-02` (Nivel 1 Combinada) |
| **Iberometal Componentes S.A.** (`3000...0001`) | `4000...0008` | `FN-QMS-2026-008` | `ISO 9001:2015` | `Estudio` | `FALSE` | 1 (`0`) | 2 | **LIBRE** (disponible en Paso 2 Vínculo) |
| **Example, C.A.** (`3000...0003`) | `4000...0004` | `FN-QMS-2025-004` | `ISO 9001:2015` | `Activo` | `TRUE` | 3 (`0..2`) | 4 | `VINC-N1-01` (Nivel 1 Integrada) |
| **Example, C.A.** (`3000...0003`) | `4000...0005` | `FN-EMS-2025-005` | `ISO 14001:2015` | `Activo` | `TRUE` | 3 (`0..2`) | 3 | `VINC-N1-01` (Nivel 1 Integrada) |
| **Example, C.A.** (`3000...0003`) | `4000...0006` | `FN-SST-2026-006` | `ISO 45001:2018` | `Activo` | `FALSE` | 1 (`0`) | 2 | `VINC-IND-02` (Individual) |
| **Example, C.A.** (`3000...0003`) | `4000...0009` | `FN-QMS-2026-009` | `ISO 9001:2015` | `Activo` | `FALSE` | 1 (`0`) | 1 | `VINC-N2-01` (Nivel 2 Multientidad) |

> **Cobertura Normativa 100.00%:** Los **8 certificados** de `CONG-IND-01` contarán con procesos detallados (`Estratégico`, `Medular`, `De Apoyo`), asignaciones `procesos_por_sitio` coherentes (HQ concentra procesos medulares y mayor dotación; sucursales administrativas/comerciales concentran procesos comerciales/soporte y dotación reducida), exclusiones ISO 4.3 justificadas donde aplique (`8.3` en manufactura bajo plano / logística), `100.00%` en `resumen_cobertura_certificado`, fechas de ciclo completas (`fecha_certificado`) y `1–2` contactos completos por certificado.

### B. Escala de Proporcionalidad Personal por Sitio ↔ Tiempo de Auditoría (`0.25d`)

| Perfil del Sitio | `sitio.personal_count` | Tiempo base en `sitios_por_auditoria` (Etapa 2 / Renovación) | Tiempo en Seguimientos (`Seg. 1 / Seg. 2`) |
| :--- | :---: | :---: | :---: |
| **HQ / Planta Principal Industrial** (`Sitio 0`) | `120 – 220` personas | `2.50d – 3.50d` | `1.50d – 2.25d` |
| **Planta Secundaria / Mecanizado** (`Sitio 1`) | `55 – 95` personas | `1.50d – 2.00d` | `1.00d – 1.50d` |
| **Centro Logístico / Almacén** (`Sitio 2` o único) | `25 – 45` personas | `1.00d – 1.25d` | `0.75d – 1.00d` |
| **Oficina Comercial / Administrativa** (`Sitio 2/3`) | `10 – 22` personas | `0.50d – 0.75d` | `0.50d` |

> Todas las duraciones cumplen `MOD((tiempo_auditoria * 4)::NUMERIC, 1) = 0` y sincronizan automáticamente `auditoria.tiempo_auditoria` vía `trg_recalcular_tiempo_auditoria_desde_sitios`.

### C. Línea Temporal Multi-Anual de Auditorías (`CONG-IND-01`)

1. **Históricas Cerradas y Revisadas QA (2022–2024):** `estado_ciclo = 'Cerrada'`, fechas `REAL`, `fecha_cierre_auditoria`, `revisado = TRUE`, `documentacion_completa = TRUE`, hallazgos cerrados (`cerrado = TRUE`).
2. **Recientes Completadas en Cola QA o Cierre de NC (últimos meses):**
   - `AUD-2023-001` (`8000...0013`) y al menos una ejecución reciente adicional en `estado_ciclo = 'Cerrada'`, `revisado = FALSE` (cola `Pendientes de Revisión` en Paso 11).
   - Auditoría reciente en `estado_ciclo = 'Auditada'` con `NC_MENOR` / `OBSERVACION` abiertas dentro de plazos `+15d/+45d`.
3. **En Curso (Ciclo Actual):** Cobertura explícita de estados variados (`Borrador`, `En Programación`, `Programada`, `En Ejecución`, `Reprogramada`, `Auditada`), incluyendo campañas vinculadas Nivel 1 (`Integrada` / `Combinada`), Nivel 2 (`Multientidad`), `Individual` y uso de `Sitio Temporal`.
4. **Futuras Preventivas (`Año +1` y `Año +2`):** Preconfiguradas por adelantado con `Tipo`, `Metodología`, fecha `PREPROGRAMADA_MES`, `Sitios` (con tiempos proporcionales `0.25d`), `Procesos` y `Turnos`, **estrictamente sin auditores asignados (`equipo_auditor*`), sin hallazgos y sin resultados/cierre**.

---

## 4. Secuencia Modular de Ejecución y Dependencias

| Orden | Archivo | Alcance Principal | Dependencias |
| :---: | :--- | :--- | :--- |
| **1** | [`step_1.1.md`](./step_1.1.md) | Esquema `sitio.personal_count` + cableado TS base, acreditaciones faltantes, catálogo de 6 turnos y pre-sembrado `06`↔`07` de cláusulas deterministas (corrigiendo `8.3`). | Ninguna |
| **2** | [`step_1.2.md`](./step_1.2.md) | Enriquecimiento de `CONG-IND-01`, `Iberometal Componentes S.A.`, `Example, C.A.`, portafolio completo de certificados, fechas inteligentes (`Otorgamiento`, `Renovación`, `Ultima Auditoría`, `Vencimiento`) y contactos completos. | Paso 1.1 |
| **3** | [`step_2.1.md`](./step_2.1.md) | Expansión de sitios con `personal_count`, asignación de `1–6` turnos por certificado (`turnos_por_sitio`), catálogo de procesos (`Estratégico`/`Medular`/`De Apoyo`) y matriz `procesos_por_sitio`. | Pasos 1.1, 1.2 |
| **4** | [`step_2.2.md`](./step_2.2.md) | Exclusiones ISO 4.3 (`requisitos_no_aplicables_certificado`) y mapeo integral `requisitos_por_proceso` hasta lograr **100.00% de cobertura** (`resumen_cobertura_certificado`) en los 8 certificados de `CONG-IND-01`. | Pasos 1.1, 2.1 |
| **5** | [`step_3.1.md`](./step_3.1.md) | Nuevos auditores calificados (`auditor`, `norma_auditor`, `sector_iaf_auditor`, `subsector_iaf_auditor`) y diseño completo de vínculos (`vinculo`, `vinculo_certificado`: Integrada, Combinada, Multientidad Nivel 2, Individual + 1 Libre). | Pasos 1.2, 2.2 |
| **6** | [`step_3.2.md`](./step_3.2.md) | Programas multi-anuales (`programa_auditoria`), auditorías (`auditoria`) y secuencia de fechas (`auditoria_fecha`: `REAL`, `PROGRAMADA_EXACTA`, `PREPROGRAMADA_MES`) cubriendo pasado cerrado/QA, reciente pendiente, en curso multi-estado y futuro preventivo `+1/+2` años. | Paso 3.1 |
| **7** | [`step_4.1.md`](./step_4.1.md) | Detalle operativo: `sitios_por_auditoria` (`0.25d` proporcional a `personal_count`), `auditoria_sitio_temporal*`, `procesos_sitio_auditoria`, `turnos_sitio_auditoria`, `turnos_proceso_sitio_auditoria`, `equipo_auditor_*` (solo pasadas/en curso, 0 futuras, 0 choques), `hallazgo` (`+15d/+45d`), comentarios y revisión QA. | Pasos 2.1, 3.1, 3.2 |
| **8** | [`step_final.md`](./step_final.md) | Reset limpio (`POST /api/reset-db`), auditoría SQL de 100% cobertura / tiempos / calificaciones / RBAC, `npm test` + `npm run lint` + `npm run build`, verificación visual E2E en navegador (4 roles) y sincronización de `public/doc/*`. | Todos |
