# Paso 3.2: Programas Multi-Anuales (`programa_auditoria`), Auditorías (`auditoria`) y Fechas (`auditoria_fecha`)

**Dependencias:** Paso 3.1 completado.
**Objetivo:** Construir una historia multi-anual completa y coherente para todos los certificados vinculados de `CONG-IND-01` (`40...0001, 0002, 0010, 0004, 0005, 0006, 0009`), cubriendo pasado cerrado/revisado QA, ejecuciones recientes en cola de revisión o cierre de NC, cartera en curso multi-estado y ciclos futuros preprogramados (`Año +1` y `Año +2`).

---

## 1. Mapa Completo de Programas y Auditorías (`CONG-IND-01`)

> **Preservar invariantes de pruebas:** Conservar los UUIDs y códigos de `PROG-2024-001` (`80...0001`), `PROG-2025-001` (`80...0002..0003`), `PROG-2026-001` (`80...0004..0005`), `PROG-2026-002` (`80...0006..0007`), `PROG-2026-003` (`80...0008`), `PROG-2027-001` (`80...0009..0010`), `PROG-2028-001` (`80...0011..0012`), **`PROG-2023-001` / `AUD-2023-001` (`80...0013`)**, **`PROG-2022-001` / `AUD-2022-001` (`80...0014`)** y los de `CONG-ALM-01` (`80...0110..0111`).

Agregar programas `7a00...0010..0019` y auditorías `8000...0015..0032` siguiendo esta matriz temporal y de estados:

### A. Pasado Histórico Cerrado + QA Aprobada (`revisado = TRUE`, `estado_ciclo = 'Cerrada'`)
1. **`PROG-2022-002` (`7a00...0010`, `CONG-IND-01`, `INDIVIDUAL`, `id_vinculo = NULL`):**
   - `AUD-2022-002` (`8000...0015`, `FN-QMS-2024-001`): `Etapa 2` (1er ciclo), `Presencial`, fecha `REAL` `(CURRENT_DATE - INTERVAL '40 months')`, cerrada + **`revisado = TRUE`** + hallazgos cerrados.
   - `AUD-2023-002` (`8000...0016`, `FN-QMS-2024-001`, bajo `PROG-2023-002` `7a00...0011` ligado vía `id_ciclo_origen`): `Seguimiento 1`, `Presencial`, fecha `REAL` `(CURRENT_DATE - INTERVAL '28 months')`, cerrada + **`revisado = TRUE`**.
2. **`PROG-2022-003` (`7a00...0012`, `CONG-IND-01`, `INDIVIDUAL`, `id_vinculo = NULL`):**
   - `AUD-2022-003` (`8000...0017`, `FN-EMS-2025-002`): `Etapa 2` (1er ciclo SGA 2022), `Presencial`, fecha `REAL` `(CURRENT_DATE - INTERVAL '46 months')`, cerrada + **`revisado = TRUE`**.
3. **`PROG-2024-001` (`7a00...0001` existente — `AUD-2024-001` `8000...0001`):**
   - Evolucionar su cierre en `-- 22b.` a `estado_ciclo = 'Cerrada'` + **`revisado = TRUE`** si pasa a histórico completado del año pasado, o mantener una auditoría gemela de cierre reciente en B para tener ambos casos bien diferenciados *(ver Nota de transición en B)*.

### B. Recientes Completadas — Cola de Revisión QA (`revisado = FALSE`) y Cierre de NC (`+15d/+45d`)
1. **`AUD-2023-001` (`8000...0013`, `FN-QMS-2024-001` — existente, PRESERVAR):**
   - `estado_ciclo = 'Cerrada'`, fecha `REAL` `(CURRENT_DATE - INTERVAL '18 months')`, `revisado = FALSE`, `NC_MAYOR` + `NC_MENOR` cerradas. Garantiza presencia en la bandeja `Pendientes de Revisión` (Paso 11) verificada por `step101SqlSchema.test.ts`.
2. **`PROG-2025-002` (`7a00...0013`, `VINC-N1-02` `Combinada` Iberometal SGA + SST, `id_vinculo = 7c00...0005`):**
   - `AUD-2025-003` (`8000...0018`, `FN-EMS-2025-002`, `Renovación`): `REAL` hace ~10 meses, cerrada **`estado_ciclo = 'Cerrada'`, `revisado = FALSE`** (en espera de dictamen QA).
   - `AUD-2025-004` (`8000...0019`, `FN-SST-2025-010`, `Etapa 2`): `REAL` hace ~10 meses, **`estado_ciclo = 'Auditada'`** con 1 `NC_MENOR` abierta dentro de ventana vigente (`+15d/+45d`, o en curso de cierre reciente) para mostrar transición previa a `'Cerrada'`.

### C. Ciclo Actual En Curso (Todos los Estados Activos del Pipeline)
1. **`Borrador`:** `PROG-2026-004` (`7a00...0014`, `VINC-N1-02` Iberometal SGA+SST Seguimiento 1, `id_ciclo_origen = 7a00...0013`) → `AUD-2026-006` (`8000...0020`, `FN-EMS-2025-002`, `Borrador`) y `AUD-2026-007` (`8000...0021`, `FN-SST-2025-010`, `Borrador`) con `PREPROGRAMADA_MES` (+4 meses).
2. **`En Programación`:** `PROG-2026-002` (`7a00...0004`, `VINC-N2-01` Multientidad `AUD-2026-003` y `AUD-2026-004` existentes) + `PROG-2026-003` (`7a00...0005`, `VINC-IND-02` `AUD-2026-005` existente con fecha vencida).
3. **`Programada`:** `PROG-2026-005` (`7a00...0015`, `VINC-IND-02` Seguimiento 1 adelantado / o `VINC-N2-01` siguiente ciclo `7a00...0015` `AUD-2026-008` `8000...0022` `Programada` con `PROGRAMADA_EXACTA` dentro de 35 días).
4. **`En Ejecución`:** `PROG-2026-006` (`7a00...0016`, `VINC-N1-02` Extraordinaria/Ampliación o `VINC-N2-01` campaña de campo activa) → `AUD-2026-009` (`8000...0023`, `FN-QMS-2024-001`, `Seguimiento 1`, **`En Ejecución`**, `PROGRAMADA_EXACTA` abarcando `(CURRENT_DATE - 1d .. CURRENT_DATE + 1d)`).
5. **`Reprogramada`:** `PROG-2026-001` (`7a00...0003`, `VINC-N1-01` Integrada Example SGC+SGA, `AUD-2026-001` y `AUD-2026-002` existentes con `seq 1 PREPROGRAMADA_MES` → `seq 2 PROGRAMADA_EXACTA` + Sitio Temporal).
6. **`Auditada` (con NCs recientes para seguimiento +15d/+45d):** `AUD-2024-001` (`8000...0001`), `AUD-2025-001` (`8000...0002`), `AUD-2025-002` (`8000...0003`) existentes + `AUD-2025-004` (`8000...0019`).

### D. Ciclos Futuros Preventivos (`Año +1` y `Año +2` — Preconfigurados sin Auditores ni Resultados)
Extender las cadenas futuras mediante `id_ciclo_origen` para cubrir **todos** los vínculos activos de `CONG-IND-01`:
1. **`VINC-N1-01` (Example SGC+SGA — existentes):** `PROG-2027-001` (`8000...0009..0010`) y `PROG-2028-001` (`8000...0011..0012`).
2. **`VINC-N1-02` (Iberometal SGA+SST — nuevos):**
   - `PROG-2027-002` (`7a00...0017`, `id_ciclo_origen = 7a00...0014`): `AUD-2027-003` (`8000...0024`, `FN-EMS-2025-002`, `Seguimiento 2`, `Programada`, `PREPROGRAMADA_MES` `+1 año`), `AUD-2027-004` (`8000...0025`, `FN-SST-2025-010`, `Seguimiento 2`, `Programada`, `PREPROGRAMADA_MES` `+1 año`).
   - `PROG-2028-002` (`7a00...0018`, `id_ciclo_origen = 7a00...0017`): `AUD-2028-003` (`8000...0026`, `FN-EMS-2025-002`, `Renovación`, `Borrador`, `PREPROGRAMADA_MES` `+2 años`), `AUD-2028-004` (`8000...0027`, `FN-SST-2025-010`, `Renovación`, `Borrador`, `PREPROGRAMADA_MES` `+2 años`).
3. **`VINC-N2-01` (Multientidad Iberometal QMS + Example Logística — nuevos):**
   - `PROG-2027-003` (`7a00...0019`, `id_ciclo_origen = 7a00...0004`): `AUD-2027-005` (`8000...0028`, `FN-QMS-2024-001`, `Seguimiento 1`, `Programada`, `PREPROGRAMADA_MES` `+1 año`), `AUD-2027-006` (`8000...0029`, `FN-QMS-2026-009`, `Seguimiento 1`, `Programada`, `PREPROGRAMADA_MES` `+1 año`).
   - `PROG-2028-003` (`7a00...0020`, `id_ciclo_origen = 7a00...0019`): `AUD-2028-005` (`8000...0030`, `FN-QMS-2024-001`, `Seguimiento 2`, `Borrador`, `PREPROGRAMADA_MES` `+2 años`), `AUD-2028-006` (`8000...0031`, `FN-QMS-2026-009`, `Seguimiento 2`, `Borrador`, `PREPROGRAMADA_MES` `+2 años`).
4. **`VINC-IND-02` (Example SST — nuevos):**
   - `PROG-2027-004` (`7a00...0021`, `id_ciclo_origen = 7a00...0005`): `AUD-2027-007` (`8000...0032`, `FN-SST-2026-006`, `Etapa 2` / `Seguimiento 1`, `Programada`, `PREPROGRAMADA_MES` `+1 año`).
   - `PROG-2028-004` (`7a00...0022`, `id_ciclo_origen = 7a00...0021`): `AUD-2028-007` (`8000...0033`, `FN-SST-2026-006`, `Seguimiento 2`, `Borrador`, `PREPROGRAMADA_MES` `+2 años`).

> **Regla crítica de Compuerta Paso 2 (`fn_validar_auditoria_en_programa()`):**
> - Los programas históricos de 2022–2024 pueden llevar `id_vinculo = NULL` únicamente cuando el certificado ya está asignado a un vínculo activo en `vinculo_certificado` (como `FN-QMS-2024-001` en `VINC-N2-01` y `FN-EMS-2025-002` en `VINC-N1-02`).
> - Todo programa vinculado (`VINC-N1-01`, `VINC-N1-02`, `VINC-N2-01`, `VINC-IND-02`) referencia exactamente su `id_vinculo` y el mismo conjunto de certificados perteneciente a dicho vínculo.
> - **Orden obligatorio en `06_datos_prueba.sql`:** Insertar primero `programa_auditoria` → luego `auditoria` → luego reconciliación `DO $$` + `sitios_por_auditoria` → luego `auditoria_fecha` (para satisfacer los triggers de fechas `REAL` que exigen al menos 1 sitio asignado con tiempo > 0 o fechas válidas).
> - **Regla estricta para futuras (`AUD-2027-*` y `AUD-2028-*`):** `revisado = FALSE`, `fecha_cierre_auditoria = NULL`, solo fechas `PREPROGRAMADA_MES` (nunca `REAL`), y **sin** equipos de auditores ni hallazgos (controlado en Paso 4.1).

---

## 2. Criterios de Verificación del Paso 3.2

- [ ] Todos los certificados `Activo` de `CONG-IND-01` tienen cobertura multi-anual (pasado / presente / futuro `+1/+2`), mientras `FN-QMS-2026-008` (`Estudio`, `LIBRE`) tiene `0` auditorías.
- [ ] Existen registros en todos los estados del ciclo: `Borrador`, `En Programación`, `Programada`, `En Ejecución`, `Reprogramada`, `Auditada` y `Cerrada` (tanto `revisado = TRUE` como `revisado = FALSE`).
- [ ] Ninguna auditoría `AUD-2027-*` / `AUD-2028-*` tiene fecha `REAL` ni cierre `Cerrada`.
- [ ] La columna `tiempo_auditoria` en `public.auditoria` coincide con la suma de `sitios_por_auditoria` que se insertarán en el Paso 4.1.
