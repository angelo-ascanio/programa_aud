# Paso 2.2: Exclusiones ISO 4.3 Justificadas y Cobertura Normativa 100.00% (`requisitos_por_proceso`)

**Dependencias:** Pasos 1.1 y 2.1 completados.
**Objetivo:** Corregir el mapeo histórico de exclusiones ISO 4.3 (`8.3` vs `5.1`), definir exclusiones técnicas realistas cuando el alcance excluya diseño o desarrollo, y poblar `public.requisitos_por_proceso` en `06_datos_prueba.sql` (Secciones `-- 17.` y `-- 18.`) para que **cada uno de los 8 certificados de `CONG-IND-01`** alcance exactamente **`100.00%` de cobertura normativa (`pendientes = 0`)** en `public.resumen_cobertura_certificado(id)`.

---

## 1. Corrección de Exclusiones ISO 4.3 (`public.requisitos_no_aplicables_certificado`, Sección `-- 18.`)

1. **Corregir bug histórico en `FN-QMS-2024-001` (`40000000-0000-0000-0000-000000000001`):**
   - La fila `ea000000-0000-0000-0000-000000000001` actualmente apunta por error a `f000...0051` (`5.1 Liderazgo y compromiso`), aunque su justificación trata sobre diseño y desarrollo (`8.3`).
   - Cambiar `id_requisito` a `'a15db0ef-de9f-45a1-a680-ce2d6916d18a'` (UUID canónico de `8.3 Diseño y desarrollo de los productos y servicios` en `ISO 9001:2015`, pre-sembrado en Paso 1.1 desde `07_normas_requisitos_csv.sql`).
   - Usar `ON CONFLICT (id) DO UPDATE SET id_requisito = EXCLUDED.id_requisito, justificacion = EXCLUDED.justificacion, updated_at = NOW()` (o limpiar conflicto previo en caso de re-ejecución sobre esquema existente).
2. **Exclusión justificada en certificados sin diseño (`CONG-IND-01`):**
   - **`FN-QMS-2026-008` (`40...0008`, Taller CNC bajo plano):** excluir `8.3` (`a15db0ef-de9f-45a1-a680-ce2d6916d18a`, fila `ea00...0002`) — fabricación estrictamente bajo planos de ingeniería provistos por el cliente.
   - **`FN-QMS-2026-009` (`40...0009`, Centro Logístico Aragua):** excluir `8.3` (`a15db0ef-de9f-45a1-a680-ce2d6916d18a`, fila `ea00...0003`) — operaciones logísticas de almacenamiento, consolidación y despacho sin diseño de producto.
   - **`FN-QMS-2025-004` (`40...0004`, Example SGC):** **NO excluye `8.3`**, porque su alcance explícito sí incluye *"Diseño de ingeniería de detalle y fabricación de estructuras metálicas pesadas"*; por lo tanto, `8.3` debe quedar **cubierto por proceso** en su proceso operativo/ingeniería.
   - **ISO 14001:2015 e ISO 45001:2018 (`40...0002, 0010, 0005, 0006`):** sin exclusiones (aplican íntegramente todos los requisitos del sistema de gestión ambiental y SST).
3. **Sincronizar prueba automatizada afectada (`src/lib/phase12RlsHardening.test.ts`):**
   - Actualizar las líneas `353–357` de `src/lib/phase12RlsHardening.test.ts` para verificar que `06_datos_prueba.sql` referencia `'ea000000-0000-0000-0000-000000000001'` con `'a15db0ef-de9f-45a1-a680-ce2d6916d18a'` (`8.3`), manteniendo además la verificación de que `'f0000000-0000-0000-0000-000000000051'` (`5.1`) sigue existiendo y cubriéndose en `requisitos_por_proceso`.

---

## 2. Mapeo Completo `public.requisitos_por_proceso` (Sección `-- 17.`)

### Regla Técnica del Motor LTREE (`02_cobertura_normativa.sql`)
- `evaluar_cobertura_certificado(id_certificado)` evalúa cada requisito obligatorio (`es_obligatorio = TRUE`) mediante descenso jerárquico LTREE (`r_all.ruta_materializada <@ pd.ruta_materializada`).
- Todos los requisitos obligatorios de `ISO 9001:2015` (`319`), `ISO 14001:2015` (`152`) e `ISO 45001:2018` (`245`) se concentran en los capítulos `4` al `10` (los capítulos `1`–`3` tienen `0` obligatorios).
- El trigger `fn_guard_req_proceso_against_exclusion` bloquea insertar en `requisitos_por_proceso` cualquier cláusula excluida o descendiente de una exclusión (`v_req_path <@ r_excl.ruta_materializada`).
- **Estrategia limpia sin colisiones de trigger:** Mapear todas las **subcláusulas de nivel 2** de los capítulos `4..10` repartidas coherentemente entre los `4–6` procesos de cada certificado, omitiendo únicamente `8.3` en los certificados donde `8.3` fue excluido:

| Tipo de Proceso | Subcláusulas Asignadas (ISO 9001 / 14001 / 45001) |
| :--- | :--- |
| **Estratégico** (`Dirección / Planificación`) | `4.1`, `4.2`, `4.3`, `4.4`, `5.1`, `5.2`, `5.3` *(y `5.4` en ISO 45001)*, `6.1`, `6.2`, `6.3` *(9001)*, `9.3`, `10.1`, `10.3` |
| **Medular** (Operativo Principal / Planta) | `8.1`, `8.2`, *(y `8.3` solo en `FN-QMS-2025-004`)*, `8.5`, `8.6`, `8.7` *(9001)* / `8.1`, `8.2` *(14001/45001)*, `10.2` |
| **Medular** (Comercial / Logístico / Ingeniería) | `8.2` (requisitos de cliente/partes), `8.4`, `8.5` (entrega/despacho), `9.1` (satisfacción / seguimiento) |
| **De Apoyo** (Mantenimiento / RH / Calidad / HSE) | `7.1`, `7.2`, `7.3`, `7.4`, `7.5`, `8.4` (compras/contratistas), `9.1`, `9.2` |

> **Verificación crítica de orden en `06_datos_prueba.sql`:** Como `requisitos_no_aplicables_certificado` se inserta en `-- 18.` y `requisitos_por_proceso` en `-- 17.`, en una re-ejecución idempotente sobre una base donde `-- 18.` ya existe, `fn_guard_req_proceso_against_exclusion` validará cada inserción de `-- 17.` contra `-- 18.`. Al no asignar `8.3` (ni el padre `8`) a procesos de `FN-QMS-2024-001`, `FN-QMS-2026-008` y `FN-QMS-2026-009`, tanto el primer run como cualquier re-ejecución pasarán con `0` errores de trigger.

---

## 3. Criterios de Verificación del Paso 2.2

- [ ] `ea000000-0000-0000-0000-000000000001` apunta a `a15db0ef-de9f-45a1-a680-ce2d6916d18a` (`8.3`) y nunca a `5.1` (`f000...0051`).
- [ ] Al finalizar la ejecución completa `00` → `07.sql`, la consulta:
  ```sql
  SELECT c.codigo_certificado, r.*
  FROM public.certificado c
  CROSS JOIN LATERAL public.resumen_cobertura_certificado(c.id) r
  WHERE c.id_organizacion IN ('30000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000003')
  ORDER BY c.codigo_certificado;
  ```
  devuelve `porcentaje_cobertura = 100.00`, `cobertura_completa = TRUE` y `pendientes = 0` en **los 8 certificados** de `CONG-IND-01`.
- [ ] `src/lib/phase12RlsHardening.test.ts` actualizado y toda la suite de tests en verde.
