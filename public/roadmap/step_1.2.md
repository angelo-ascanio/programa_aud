# Paso 1.2: Provisión de Cuentas Auth y Carga Idempotente Completa de los 47 Auditores (`Auditores.csv`)

## 1. Objetivo del Paso
Sembrar de manera **100% idempotente** las cuentas Supabase Auth (`auth.users` + `public.profiles`) y la totalidad de datos maestros, contactos, evaluaciones in situ y matriz de competencias ISO/IAF para los **47 auditores reales** de `public/Auditores.csv`, preservando el tester `auditor@fondonorma.test` (`Password123*`, `33333333-3333-3333-3333-333333333333`) y la integridad de todas las auditorías y escenarios de prueba existentes (`CONG-IND-01`, `CONG-CYB-01`, `CONG-ALM-01`, `CONG-FAR-01` / `LABCENTRO`).

> **Alcance estricto:** Solo `05_usuarios.sql`, `06_datos_prueba.sql` y pruebas de invariantes del seed (`expertoSeedInvariants.test.ts` u otros tests afectados directamente por los datos del seed).

---

## 2. Archivos Permitidos a Modificar
- `public/supabase/queries/05_usuarios.sql`
- `public/supabase/queries/06_datos_prueba.sql`
- `src/lib/expertoSeedInvariants.test.ts` (actualización de aserciones tras sustituir competencias sintéticas por competencias reales CSV)

---

## 3. Reglas Críticas de Implementación

### 3.1 Mapeo Determinístico de UUIDs (48 Filas Totales en `public.auditor`)
1. **Preservados intocables (`3333...` + `0001`–`0010`):**
   - `33333333-3333-3333-3333-333333333333`: `Auditor de Prueba` (`auditor@fondonorma.test` / `Password123*`, se mantiene en `05_usuarios.sql` con sus competencias de prueba para pruebas genéricas RBAC).
   - `10000000-0000-0000-0000-000000000001`: `Keyla Cristina Soteldo de Páez` (`KS`, C.I. `4165827` — nombre oficial exacto CSV o nombre completo conservando trazabilidad; recomendación: usar los nombres del CSV `'Keyla Soteldo'` o conservar los completos ya armonizados para `0001`–`0010` documentando la correspondencia exacta). **Nota:** En `06_datos_prueba.sql` líneas 391–400 ya figuran los nombres completos de estos 10 auditores (`Keyla Cristina Soteldo de Páez`, `Félix Horacio Rojas Machado`, etc.) — conservar dichos nombres o enriquecer con exactitud sin romper su identidad CSV (`KS`, `FR`, `JRP`, `LR`, `NF`, `MF`, `NA`, `YB`, `ECH`, `ID`).
2. **Nuevos UUIDs determinísticos (`10000000-0000-0000-0000-000000000011` .. `0047`):**
   Asignar de forma fija e inmutable en orden del CSV (excluyendo los 10 ya asignados a `0001..0010`) a los 37 auditores restantes, incluyendo explícitamente ambas homónimas:
   - `Yurima Carrillo` (`YC`, C.I. `7137643`, `yanellys_castellanos@yahoo.com`) → UUID fijo en rango `0011..0047` (ej. `0045`)
   - `Yurima Carrillo` (`YC`, C.I. `12310919`, `yurima12.fondonorma@gmail.com`) → UUID fijo distinto (ej. `0047`)

### 3.2 Provisión Auth (`auth.users` + `public.profiles`) en `05_usuarios.sql` (o bloque dedicado idempotente)
- Insertar/actualizar las **47 cuentas reales** con `ON CONFLICT (id) DO UPDATE`:
  - `id`: el UUID exacto `10000000-0000-0000-0000-000000000001`..`0047` (idéntico al `id` en `public.auditor`).
  - `email`: correo principal normalizado en minúsculas (`TRIM(LOWER(primary_email))`).
  - `encrypted_password`: `crypt('<SIGLAS><CEDULA>', gen_salt('bf'))` — ejemplo: `AKS10337391`, `BG9648747`, `CV3430457`, `YC7137643`, `YC12310919`.
  - `raw_user_meta_data`: `'{"nombre": "<Nombre>", "role": "AUDITOR", "siglas": "<SIGLAS>"}'::jsonb`.
  - **Obligatorio GoTrue:** `confirmation_token = ''`, `email_change = ''`, `email_change_token_new = ''`, `recovery_token = ''`, `email_confirmed_at = NOW()`.
- Insertar/actualizar `public.profiles` con `role = 'AUDITOR'`, `status = 'APPROVED'`, `nombre = <Nombre>`.
- Limpieza previa idempotente antes del upsert en `05_usuarios.sql`: si existe algún `auth.users` con el mismo `email` pero distinto `id` (de ejecuciones previas manuales), eliminarlo antes del `INSERT` (mismo patrón ya usado líneas 5–18 de `05_usuarios.sql`), **sin tocar** `1111...`, `2222...`, `3333...`, `4444...`.

### 3.3 Carga Completa y Normalizada en `06_datos_prueba.sql`
Para garantizar **cero fallos en 1ª y 2ª ejecución** (`ON CONFLICT` / `DO $$`):
1. **Tabla `public.auditor`:**
   - Cargar todos los atributos nuevos (`siglas`, `cedula_identidad`, `profesion`, `esquemas_complementarios`, `anio_actualizacion_normas`, `ultima_evaluacion_in_situ_texto`, `proxima_evaluacion_in_situ_texto`, `ultima_evaluacion_in_situ_fecha`, `proxima_evaluacion_in_situ_fecha`, `sin_registro_evaluacion`, `sector_area_evaluado_texto`, `observaciones_evaluacion`, `anio_actualizacion_sectores`, `observacion_sectores`) usando `ON CONFLICT (id) DO UPDATE`.
   - Limpiar comentarios obsoletos (`-- Ing. Carlos Mendoza`, `-- Ing. Patricia Valera`) en líneas 438–483 de `06_datos_prueba.sql`.
2. **Tablas `telefono_auditor` y `email_auditor`:**
   - Desdoblar teléfonos múltiples manteniendo los formatos reales limpios (sin alterar prefijos internacionales `52 81...`, `(507)...`, `(34)...`; marcar el primero `es_principal = TRUE`).
   - Desdoblar los correos secundarios reales en `email_auditor` (`Betzy Gil` → `servicios@betzygil.com` + `bbgg0710@gmail.com`; `Daney Penaloza` → `daneypf@gmail.com` + `daneypf@hotmail.com`; `Pedro Vargas` → `ing.pedrovargas@gmail.com` + `pvargas@orinoco-iron.com`).
   - Usar UUIDs determinísticos (`1a100000-...`, `1a200000-...`) con `ON CONFLICT (id) DO UPDATE`.
3. **Tabla `evaluacion_in_situ_auditor`:**
   - Parsear fechas únicas (`dd/mm/yyyy` → `YYYY-MM-DD`, `'dic-24'` → `'2024-12-31'`) y pares multilínea (`may-15 / nov-24` → `2015-05-01` & `2024-11-01`; `may-18 / nov-27` → `2018-05-01` & `2027-11-01`; lo mismo para `OQ`, `SP`, `YD`, `YC 12310919`) en filas ordenadas con UUID determinístico `1a300000-...`.
4. **Matriz de Normas (`norma_auditor`), Sectores (`sector_iaf_auditor`) y Sub-Sectores (`subsector_iaf_auditor`):**
   - **Normalización de normas ISO:**
     - `'ISO 9000:2015'` (`YC 7137643`) → `e000...9001` (`ISO 9001:2015`)
     - `'ISO 140012015'` (`YC 12310919`) → `e000...14001` (`ISO 14001:2015`)
     - `'ISO 22000'` (`YJ 11049843`) → `e000...22000` (`ISO 22000:2018`)
     - `'MARCA'` (`OR 7130716`) y `'HACCP'` (`YJ 11049843`) → `auditor.esquemas_complementarios` (`'MARCA'` y `'HACCP'` respectivamente).
   - **Normalización de sub-sectores IAF:**
     - Prefijos de 1 dígito: `3.1` → `03.1`, `9.1` → `09.1`, `1.1` → `01.1`, `2.2` → `02.2`, `4.1` → `04.1`, `5.1` → `05.1`, `6.1` → `06.1`, `7.1` → `07.1`.
     - Typos del CSV: `'10:1'` (`Genny Mendoza`) → `'10.1'`; `'31.1.'` (`Edgard Cachutt`) → `'31.1'`.
     - **Sincronización limpia en re-seed:** Para los 47 UUIDs reales, usar `DELETE`? **NO** (recordar `fn_prevent_hard_delete` y `REVOKE DELETE`, aunque las tablas M:N `norma_auditor`, `sector_iaf_auditor`, `subsector_iaf_auditor` no tienen `deleted_at` — verificar primero en `01_creacion.sql`!). Si en una BD preexistente habían vínculos sintéticos previos en `0001..0010` (como `0001` con `03.1`/`28.1` que ya no corresponden al CSV), limpiar exclusivamente las filas obsoletas de `0001..0010` que no estén en el CSV usando `DELETE FROM public.norma_auditor WHERE id_auditor BETWEEN ...` (estas 3 tablas de unión pura sí permiten `DELETE` porque `competenciaAuditorView` las desvincula directamente — comprobar en `04_rls.sql`), e insertar con `ON CONFLICT DO NOTHING`.
   - **Derivar `sector_iaf_auditor`:** Todo `id_sector_iaf` asociado a cualquier `subsector_iaf` del auditor queda insertado en `sector_iaf_auditor`.

### 3.4 Calibración de Escenarios Demo Existentes (`LABCENTRO`, `CONG-ALM-01`, `expertoSeedInvariants.test.ts`)
- **Conflicto detectado:** Anteriormente `06_datos_prueba.sql` asignaba a `0001..0005` competencias sintéticas. Al cargar los datos **reales** del CSV:
  1. En `CONG-FAR-01` / `LABCENTRO` (`AUD-FAR-2026-001`, norma `ISO 45001:2018`, Sector `13`, Sub-sector `13.1`): `Félix Rojas` (`0002`) solo tiene `ISO 9001:2015` en el CSV. **Solución:** Reasignar `AUD-FAR-2026-001` en `06_datos_prueba.sql` (`98000000-...-0201`) a **`Leonardo Antonio Rojas Gómez` (`1000...0004`)** o **`Keyla Cristina Soteldo de Páez` (`1000...0001`)**, ya que ambos SÍ tienen `ISO 45001:2018` real en el CSV y **NINGUNO** de los dos tiene Sector `13` en el CSV, preservando al 100% la demostración de brecha sectorial asistida por `Dra. Sofía Quintero` (`experto_tecnico_auditoria`)!
  2. Además, 3 auditores reales del CSV (`Iván González` `0019`, `Nelson Arteaga` `0007`, `Yuliber Blanco` `0008`) SÍ tienen `13.1` en el CSV (`ISO 9001:2015` / `ISO 22000:2018`), pero todos con `observacion_sectores` exigiendo Experto Técnico en Sector 13 y **ninguno** tiene `ISO 45001:2018`. Por ello, se debe actualizar `src/lib/expertoSeedInvariants.test.ts` para verificar:
     - Que los 47 auditores CSV + `3333...` están presentes con `siglas` y `cedula_identidad`.
     - Que **ningún auditor CSV con `ISO 45001:2018`** cubre Sector `13` (preservando la brecha real de `LABCENTRO`).
     - Que el auditor líder asignado a `AUD-FAR-2026-001` posee `ISO 45001:2018` real y carece de Sector `13`.

---

## 4. Criterios de Verificación del Paso 1.2
1. Ejecutar reset completo de DB (`01` → `07`) y verificar 0 errores SQL.
2. Ejecutar **`06_datos_prueba.sql` por segunda vez consecutiva** verificando idempotencia absoluta (0 violaciones PK/FK/UQ y conteos idénticos).
3. Verificación por SQL:
   - `COUNT(*) FROM public.auditor WHERE deleted_at IS NULL` = **48** (1 tester `3333...` + 47 CSV).
   - `COUNT(*) FROM public.profiles WHERE role = 'AUDITOR' AND status = 'APPROVED'` = **48**.
   - Ambos registros de `Yurima Carrillo` (`7137643` y `12310919`) existen en `auth.users`, `profiles`, `auditor` y `email_auditor`.
   - `norma_auditor` tiene `ISO 9001:2015` para `YC 7137643` (normalizado desde `9000:2015`) y `ISO 14001:2015` para `YC 12310919` (normalizado desde `140012015`), y `OR` / `YJ` preservan `MARCA` / `HACCP` en `esquemas_complementarios`.
4. Probar autenticación HTTP contra Supabase Auth (GoTrue) con al menos `auditor@fondonorma.test` / `Password123*` y 2 auditores del CSV (`calidad.aksanchez@gmail.com` / `AKS10337391` y `yanellys_castellanos@yahoo.com` / `YC7137643`).
5. `npm test` en verde completo incluyendo `expertoSeedInvariants.test.ts`.
