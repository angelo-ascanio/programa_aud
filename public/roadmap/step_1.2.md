# Paso 1.2 — Optimización de Auditores, Sector 13/13.2 y Semillero de `experto_tecnico` (`06_datos_prueba.sql`)

## 1. Objetivo
Reevaluar y optimizar los datos semilla de `public.auditor` y sus competencias en `public/supabase/queries/06_datos_prueba.sql` para reflejar escenarios realistas de brecha sectorial IAF, incorporar el ejemplo canónico **Sector IAF 13 / Sub-Sector 13.2 + ISO 45001:2018**, y sembrar los registros idempotentes de **`experto_tecnico`**, sus teléfonos, emails, competencias IAF y asignaciones en `experto_tecnico_auditoria`.

---

## 2. Archivos Involucrados
- `public/supabase/queries/06_datos_prueba.sql` (Secciones `-- 4.`, `-- 5.`, `-- 8.`, `-- 10.`, nueva sección `-- 10b.` / `-- 28.` para `experto_tecnico` y `experto_tecnico_auditoria`, más caso demostrativo de certificado/auditoría en `13.2` + `ISO 45001:2018` si no existe uno específico que ejerza la brecha sin alterar los escenarios protegidos)
- `src/lib/phase12RlsHardening.test.ts` / `src/lib/step101SqlSchema.test.ts` (o nuevo `src/lib/expertoSeedInvariants.test.ts`)

> **Invariantes Protegidas (PROHIBIDO romper):**
> - Mantener intactos `CONG-IND-01` (`Iberometal Componentes S.A.` y `Example, C.A.`), `CONG-CYB-01`, `CONG-ALM-01`, `AUD-2023-001`, el aislamiento Nivel 2 de `CLIENT`, los 8 certificados de `CONG-IND-01` y la calibración existente de `AUD-2023-001`.
> - Toda inserción o actualización en `06_datos_prueba.sql` debe ser **100% idempotente** ante ejecuciones repetidas.

---

## 3. Especificación Técnica Detallada

### 3.1. Catálogo IAF y Acreditación para Escenario `13` / `13.2` + `ISO 45001`
- En **Sección `-- 4. Sectores IAF Principales`**:
  - Agregar Sector IAF **`13`** (`id = 'd0000000-0000-0000-0000-000000000013'`, `sector = 13`, `descripcion = 'Productos farmacéuticos'`).
- En **Sección `-- 5. Sub-Sectores IAF Jerárquicos`**:
  - Agregar Sub-Sector **`13.2`** (`id = 'da000000-0000-0000-0000-000000000132'`, `id_sector_iaf = 'd0000000-0000-0000-0000-000000000013'`, `codigo = '13.2'`, `descripcion = 'Fabricación de preparados farmacéuticos y especialidades medicinales'`, `categoria_riesgo = 'ALTO'`).
- En **Sección `-- 8. Acreditaciones Otorgadas a Normas`**:
  - Vincular Sector `13` (`'dd000000-0000-0000-0000-000000000007'`) a la acreditación de `ISO 45001:2018` (`'dc000000-0000-0000-0000-000000000004'`) para habilitar certificados `ISO 45001` en `13.2`.

### 3.2. Reevaluación y Optimización de `public.auditor` (Sección `-- 10.`)
- Revisar los 6 auditores actuales (`33333333-...` y `10000000-0000-0000-0000-000000000001..0005`):
  - **Conservar sus UUIDs y nombres** para no romper referencias en `equipo_auditor_sitio`, `profiles` (`33333333-...` es `auditor@fondonorma.test`), ni tests existentes.
  - **Optimizar sus competencias (`sector_iaf_auditor` / `subsector_iaf_auditor`)**:
    - Garantizar que los auditores que ya cubren `CONG-IND-01` (`17.1`, `17.2`, `03.1`), `CONG-CYB-01` (`33.1`) y `CONG-ALM-01` (`03.1`) sigan siendo válidos donde corresponde, **PERO** que **ningún auditor (o solo un subconjunto intencional fuera de ciertos equipos)** posea simultáneamente `ISO 45001:2018` y Sector `13` / Subsector `13.2` —y ajustar uno o dos auditores (ej. `1000...0002` `Ing. Patricia Valera` y/o `1000...0004` `Dra. Elena Marcano`) para que tengan **norma completa (`ISO 45001:2018`)** sin cubrir el Sector IAF `13` / Subsector `13.2` (y opcionalmente en un certificado de prueba de `Example, C.A.` / nueva organización o en una auditoría específica donde falte cobertura sectorial del equipo).
  - De este modo:
    - Al asignar a un auditor calificado en la norma ISO (pero sin competencia en `13.2` / `13`) a una auditoría en `13.2`, el sistema activa inmediatamente la indicación de brecha sectorial IAF y permite apoyar al equipo con un Experto Técnico calificado en `13.2` o `13`.

### 3.3. Semillero de `experto_tecnico`, Teléfonos, Emails y Competencias IAF
- Crear una sección dedicada en `06_datos_prueba.sql` (con UUIDs deterministas `1e000000-0000-0000-0000-000000000001..0005` para `experto_tecnico`, `1e100000-...` para teléfonos y `1e200000-...` para emails):
  1. **`Dra. Sofía Quintero`** (`Disponible`): competente en **Sub-Sector `13.2`** (`da000000-...0132`). Nota: `"Química farmacéutica senior con 14 años en buenas prácticas de manufactura estéril."` + 1 teléfono + 1 email.
  2. **`Ing. Héctor Zambrano`** (`Disponible`): competente en **Sector IAF `13` completo** (`d0000000-...0013`), cubriendo cualquier subsector `13.*`. Nota: `"Especialista en procesos industriales farmacéuticos, biotecnología y control ambiental de áreas limpias."` + 2 teléfonos + 1 email.
  3. **`Ing. Mariela Cárdenas`** (`Disponible`): competente en **Sector IAF `17`** y **Sub-Sector `17.1`**. Nota: `"Experta metalúrgica y procesos de fundición / tratamientos térmicos."` + teléfono + email.
  4. **`Lic. Gabriel Navarro`** (`Disponible`): competente en **Sub-Sector `03.1`** y **Sub-Sector `33.1`**. Nota: `"Especialista en cadenas agroalimentarias y continuidad operativa de centros de datos."` + teléfono + email.
  5. **`Ing. Rodrigo Páez`** (`No disponible`): competente en **Sector IAF `28`** (`28.1`). Nota: `"Temporalmente no disponible por licencia técnica hasta próximo trimestre."` + teléfono + email (ejerce filtro de disponibilidad / estatus en UI).

### 3.4. Escenario Demostrativo `13.2 + ISO 45001` y Asignación Global en `experto_tecnico_auditoria`
- Si no existe un certificado en `13.2` con `ISO 45001:2018`, sembrar un caso de prueba limpio (ej. dentro de una organización existente o nueva organización demo visible para `ADMIN`/`WORKER`/`AUDITOR` sin alterar `CONG-IND-01`/`CONG-CYB-01`/`CONG-ALM-01`) con:
  - Certificado en `ISO 45001:2018`, `sector_iaf = 13`, `subsector_iaf = 13.2`, con su `Alcance`, `Sitio 0` y auditoría planificada.
  - Auditor asignado competente en `ISO 45001:2018` (`Ing. Patricia Valera`) pero **sin** competencia en Sector `13` / Subsector `13.2`.
  - Registro en `public.experto_tecnico_auditoria` asignando a `Dra. Sofía Quintero` (`1.00` día, observación `"Acompañamiento técnico en áreas de formulación estéril y manejo de principios activos (Subsector 13.2)."`).
- Verificar también que en una auditoría vinculada con múltiples auditores exista un escenario listo para inspeccionar la cobertura global de experto(s).

---

## 4. Criterios de Aceptación
1. `06_datos_prueba.sql` siembra `Sector 13`, `Subsector 13.2`, los 6 auditores optimizados, 5 expertos técnicos (con `Disponible` y `No disponible`), sus teléfonos, emails, competencias IAF y al menos 1 asignación real en `experto_tecnico_auditoria`.
2. Re-ejecutar `06_datos_prueba.sql` dos veces seguidas no produce duplicados ni errores `ON CONFLICT` / `23505` / `27000`.
3. Todas las aserciones de seeds existentes (`CONG-IND-01`, `AUD-2023-001`, Nivel 2 RLS) permanecen 100% intactas.

---

## 5. Verificación
- Reset limpio DB: `00` → `07` + **segunda ejecución inmediata de `06_datos_prueba.sql`**.
- Consultas SQL de comprobación: conteo de `experto_tecnico` (5), `sector_iaf_experto`, `subsector_iaf_experto`, `experto_tecnico_auditoria`, `sector 13 / 13.2`.
- Ejecutar suite de tests SQL y dominio existente (`npx tsx --test src/lib/step101SqlSchema.test.ts src/lib/phase12RlsHardening.test.ts src/lib/competencyMatrix.test.ts`).
