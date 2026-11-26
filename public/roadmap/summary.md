# Roadmap Ejecutivo y Técnico: Integración Integral de `public/Auditores.csv` en `programa_aud`

## 1. Visión General y Objetivo

Este roadmap define la integración completa, idempotente y verificable por etapas de la nómina real de **47 auditores** contenida en `public/Auditores.csv` (54 columnas) dentro del ecosistema **Fondonorma (`programa_aud`)**: base de datos PostgreSQL/Supabase, autenticación Supabase Auth (`auth.users` + `public.profiles`), capa de dominio/persistencia en TypeScript estricto (`strict: true`, `0 any`), Multi View y Detail View de **Bloque 2 → Auditor**, asignación y alertas en **Bloque 1 → `3. Auditor`**, trazabilidad y documentación oficial.

### Principios Invariantes Obligatorios en Todos los Pasos
1. **Idioma:** Toda copia de interfaz, mensajes de error/validación, etiquetas, encabezados, badges y documentación en **español**.
2. **TypeScript Estricto:** `strict: true` con **cero `any`** (`: any`, `as any`).
3. **Política Zero-UUID:** Nunca exponer UUIDs crudos en la interfaz, atributos `title`, tooltips, selects visibles ni mensajes de error al usuario.
4. **Invariantes de Tablas y Layout:** Conservar `table-fixed`, `<colgroup>` con suma exactamente `100%`, **0 `<button>` dentro de `<tbody>`**, botones `+` en barra de herramientas / acciones superiores y vistas responsivas (desktop + móvil).
5. **RBAC de 4 Roles y Gobernanza:** Solo `ADMIN` y `WORKER` aprobados crean/editan/asignan competencias o archivan entidades (con `ADMIN` exclusivo para restauración de archivo); `AUDITOR` y `CLIENT` en estricto modo lectura/alcance aislado según políticas RLS y guards de cliente.
6. **Preservación de Cuentas de Prueba:** La cuenta rápida `auditor@fondonorma.test` / `Password123*` (`33333333-3333-3333-3333-333333333333`) y su botón en `src/views/authView.ts` permanecen intactos junto con los otros 3 perfiles de prueba (`admin@`, `worker@`, `client@`).

---

## 2. Auditoría Exacta: `public/Auditores.csv` vs. Modelo Actual (`01_creacion.sql` / `06_datos_prueba.sql` / `src/`)

### 2.1 Resumen Cuantitativo del CSV
- **Filas reales:** 47 auditores activos.
- **Columnas totales:** 54 columnas separadas por `;` con campos multilínea entre comillas (`"`).
- **Cédulas (`Nº CÉDULA DE IDENTIDAD`):** 47/47 pobladas y **100% únicas** (sin duplicados ni vacíos).
- **Correos primarios (`CORREO ELECTRÓNICO`):** 47/47 poblados y **100% únicos** en su correo principal (3 auditores registran 2 correos separados por salto de línea: `Betzy Gil`, `Daney Penaloza`, `Pedro Vargas`).
- **Homónimos y colisiones detectadas (hallazgo crítico):**
  - **Nombre y Siglas duplicadas:** `Yurima Carrillo` (`SIGLAS = YC`) aparece **dos veces** con distinta cédula y correo:
    1. C.I. `7137643` — `yanellys_castellanos@yahoo.com` (`INGENIERO EN INFORMACIÓN`)
    2. C.I. `12310919` — `yurima12.fondonorma@gmail.com` (`INGENIERO QUÍMICO`)
  - **Teléfonos compartidos entre auditores distintos:**
    - `04166435173 / 04243313995` aparece tanto en `Betzy Gil` (`9648747`) como en `Carlos Gonzalez` (`21229844`).
    - `04144977127` aparece tanto en `Óscar Ríos` (`7130716`) como en `Oscar Quintero` (`7130726`).
  - **Regla arquitectónica derivada:** La llave de negocio única del auditor DEBE ser **`cedula_identidad`** (índice único parcial `WHERE deleted_at IS NULL`), **nunca** `nombre`, `siglas` ni `telefono` entre distintos auditores. `validateAuditorDraft` actualmente prohíbe nombres duplicados; deberá actualizarse para validar unicidad por `cedula_identidad` y permitir homónimos como `Yurima Carrillo`, desambiguando visualmente por `SIGLAS · C.I.`.

### 2.2 Contraste Columna por Columna (54 Columnas del CSV)

| Cols CSV | Campo CSV | Estado Actual en DB / Código | Brecha Detectada y Diseño Objetivo |
| :--- | :--- | :--- | :--- |
| `1` | `NOMBRE DEL AUDITOR` | `public.auditor.nombre` (`VARCHAR(150)`) | Se mantiene como columna principal. Los 10 UUIDs preexistentes (`1000...0001`–`0010`) corresponden nominalmente a 10 auditores del CSV; los nombres oficiales del CSV se sincronizan exactamente. |
| `2` | `SIGLAS` | Inexistente en DB (en memoria era `codigo_credencial` sintético) | Nueva columna `auditor.siglas VARCHAR(20)`. No es única globalmente (`YC` se repite en ambas `Yurima Carrillo`). |
| `3` | `Nº CÉDULA DE IDENTIDAD` | Inexistente en DB | Nueva columna `auditor.cedula_identidad VARCHAR(30) NOT NULL` (para los 47 reales; nullable o sintética solo para el tester `3333...` si aplica, recomendando asignar `'TEST-0001'` o permitir NULL en índice parcial `WHERE cedula_identidad IS NOT NULL AND deleted_at IS NULL`). Índice único parcial `uq_auditor_cedula_active`. |
| `4` | `Nº DE CONTACTO` | Inexistente en DB (`telefono` solo existía en `INITIAL_AUDITORES_DETAILED`) | 17 filas tienen 2 o 3 teléfonos, prefijos internacionales (`52 81 3056 1157`, `(507)62491341`, `(34)610903698`) o móviles sin `0` inicial (`4121414006`). Crear tabla normalizada **`public.telefono_auditor`** idéntica al patrón de `telefono_experto_tecnico` (sin unicidad global entre auditores). |
| `5` | `CORREO ELECTRÓNICO` | Inexistente en DB (`email` solo en `INITIAL_AUDITORES_DETAILED`) | 3 filas tienen 2 correos. Crear tabla normalizada **`public.email_auditor`** idéntica al patrón de `email_experto_tecnico`, marcando `es_principal BOOLEAN` o orden determinístico de creación para que el correo principal coincida con `auth.users.email`. |
| `6` | `PROFESIÓN` | Inexistente en DB (`titulo_profesional` solo en fallback JS) | Nueva columna `auditor.profesion VARCHAR(200)` (ej. `INGENIERO EN SISTEMAS DE CALIDAD Y AMBIENTE / TSU EN QUÍMICA`). |
| `7` | `SISTEMA DE GESTIÓN` | `public.norma_auditor` (solo 5 normas ISO base) | Tokens ISO con typos: `ISO 9000:2015` → `ISO 9001:2015`, `ISO 140012015` → `ISO 14001:2015`, `ISO 22000` → `ISO 22000:2018`. Además existen 2 esquemas no-ISO: **`MARCA`** (`Óscar Ríos`) y **`HACCP`** (`Yarleska Jimenez`). **Decisión:** Mapear todas las ISO a `norma_auditor` y almacenar esquemas no-ISO en `auditor.esquemas_complementarios` (`TEXT[]` o `VARCHAR(150)`) para **no contaminar** la matriz `norma` ni distorsionar el `Coverage HUD` de cláusulas ISO en Certificados (`07_normas_requisitos_csv.sql`). |
| `8` | `AÑO DE ACTUALIZACIÓN` | Inexistente en DB | Nueva columna `auditor.anio_actualizacion_normas INTEGER NULL` (valores CSV: `2020`, `2021`, `2022`, `2023`, `2024`, `2026`, o `NULL`). |
| `9–12` | `ÚLTIMA EVALUACIÓN IN SITU`, `PRÓXIMA EVALUACIÓN IN SITU`, `SECTOR / ÁREA TÉCNICA EVALUADO`, `OBSERVACIONES DE EVALUACIÓN` | Inexistente en DB (en memoria existía `CompetenciaAuditorEntity.fecha_vencimiento` fija) | 10 filas son `'S/R'`; 31 tienen fecha `dd/mm/yyyy`; 1 tiene `'dic-24'`; **5 filas tienen pares multilínea** (ej. `may-15\nnov-24` / `may-18\nnov-27`). **Diseño híbrido:** columnas resumen en `auditor` (`ultima_evaluacion_in_situ_texto`, `proxima_evaluacion_in_situ_texto`, `ultima_evaluacion_in_situ_fecha DATE`, `proxima_evaluacion_in_situ_fecha DATE`, `sin_registro_evaluacion BOOLEAN`, `sector_area_evaluado_texto`, `observaciones_evaluacion`) + tabla hija normalizada **`public.evaluacion_in_situ_auditor`** para representar múltiples evaluaciones históricas/vigentes por estándar o período. |
| `13–14` | `SISTEMA DE GESTIÓN2`, `AÑO ACTUALIZACIÓN DE SECTORES` | Inexistente en DB | Ambas están vacías (`""`) en las 47 filas actuales, pero deben existir en esquema (`auditor.sistema_gestion_secundario`, `auditor.anio_actualizacion_sectores INTEGER`) y en el formulario Detail View para futura captura. |
| `15` | `OBSERVACIÓN DE SECTORES` | Inexistente en DB | Nueva columna `auditor.observacion_sectores TEXT`. 10 filas pobladas, 7 con requerimientos explícitos de **Experto Técnico** (sectores `4, 5, 7, 9, 13, 15, 24, 38`) y 2 con evaluaciones in-situ pendientes de ISO 14001/45001. |
| `16–54` | Columnas de Sectores IAF `1` a `39` | `public.sector_iaf_auditor` + `public.subsector_iaf_auditor` | Normalizar prefijos (`3.1` → `03.1`), dos puntos (`10:1` → `10.1`) y punto final (`31.1.` → `31.1`). Derivar automáticamente `sector_iaf_auditor` desde todo subsector asignado. 3 auditores (`KSG`, `LMR`, `PG`) tienen 0 subsectores en el CSV. |

---

## 3. Estrategia de Base de Datos y Auth (`auth.users` + `public.profiles`)

### 3.1 Preservar UUIDs y Tester Preexistentes
En `05_usuarios.sql` y `06_datos_prueba.sql` ya existen 11 auditores con UUIDs referenciados por auditorías sembradas y pruebas unitarias:
- `33333333-3333-3333-3333-333333333333` → **`Auditor de Prueba`** (`auditor@fondonorma.test` / `Password123*`). **SE PRESERVA INTACTO.**
- Los primeros **10 UUIDs** `10000000-0000-0000-0000-000000000001` .. `0010` ya corresponden a 10 auditores reales del CSV:
  - `0001`: `Keyla Cristina Soteldo de Páez` (`KS`, C.I. `4165827`)
  - `0002`: `Félix Horacio Rojas Machado` (`FR`, C.I. `2995963`)
  - `0003`: `José Ramón Polo Faría` (`JRP`, C.I. `5684384`)
  - `0004`: `Leonardo Antonio Rojas Gómez` (`LR`, C.I. `5365320`)
  - `0005`: `Nordy Armando Fuentes` (`NF`, C.I. `5884819`)
  - `0006`: `Manuel Arturo Fernández Martínez` (`MF`, C.I. `8417973`)
  - `0007`: `Nelson Rafael Arteaga Quevedo` (`NA`, C.I. `5584108`)
  - `0008`: `Yuliber Alejandra Blanco Díaz` (`YB`, C.I. `12500820`)
  - `0009`: `Edgar José Cachutt Márquez` (`ECH`, C.I. `3395125`)
  - `0010`: `Ismael Enrique Díaz Valera` (`ID`, C.I. `6965204`)
- Los **37 auditores restantes** del CSV recibirán UUIDs determinísticos `10000000-0000-0000-0000-000000000011` .. `0047` ordenados alfabéticamente/CSV de manera fija y documentada en `step_1.2.md`.

### 3.2 Regla de Credenciales Auth y Compatibilidad con RLS
1. Todos los 47 auditores reales se crean en `auth.users` con **el mismo UUID** de `public.auditor.id` (`1000...0001`–`0047`), de forma que `is_assigned_auditor(id_auditoria)` en `04_rls.sql` (`ea.id_auditor = auth.uid()`) y `scopeProgramacionAuditsForProfile` en `accessControl.ts` funcionen de inmediato al iniciar sesión con cualquier auditor del CSV.
2. **Email de acceso:** correo principal del CSV en minúsculas (`TRIM(LOWER(...))`).
3. **Contraseña inicial:** `UPPER(TRIM(siglas)) || TRIM(cedula_identidad)` (ejemplo: `AKS10337391`, `FR2995963`, `YC7137643`, `YC12310919`). La longitud mínima real en los 47 registros es **9 caracteres** (`CV3430457`, `KS4165827`), superando el mínimo de 6 caracteres de GoTrue.
4. **Tokens GoTrue obligatorios:** `confirmation_token`, `email_change`, `email_change_token_new` y `recovery_token` deben ser `''` (cadena vacía, nunca `NULL`) para evitar error 500 en Supabase Auth.
5. **Perfil RBAC:** cada uno de los 47 usuarios recibe fila en `public.profiles` con `role = 'AUDITOR'`, `status = 'APPROVED'`.
6. **Reconciliación crítica de `LABCENTRO` (`AUD-FAR-2026-001`) y `CONG-ALM-01` en `step_1.2.md`:** Al reemplazar las competencias sintéticas de `0001..0005` por las competencias reales del CSV, `Félix Rojas` (`0002`) pasa a tener solo `ISO 9001:2015` (sin `ISO 45001:2018`) y `Nelson Arteaga` (`0007`), `Iván González` (`0019`) y `Yuliber Blanco` (`0008`) sí poseen `13.1` con nota explícita de requerir **Experto Técnico**. El paso `step_1.2.md` especifica la calibración exacta de asignaciones semilla (`Leonardo Rojas` `0004` o `Keyla Soteldo` `0001` para `AUD-FAR-2026-001` por tener `ISO 45001:2018` sin Sector 13) y la actualización de `expertoSeedInvariants.test.ts`.

---

## 4. Mapa de Pasos y Dependencias (`public/roadmap/`)

```text
[step_1.1.md] DDL + Triggers + Índices + RLS en Auditor y Tablas Hijas
      │
      ▼
[step_1.2.md] Auth Users (47 CSV + tester) + Seed Completo 47 Auditores + Tests Seed
      │
      ▼
[step_2.1.md] Dominio TS, Validación, Persistencia, Auth Compatibility e Hidratación live
      │
      ├───────────────────────────────────────┐
      ▼                                       ▼
[step_3.1.md] Multi View (Auditor)     (Prepara tipos y helpers visuales)
      │
      ▼
[step_3.2.md] Detail View + Pestañas Hijas (Contacto, Evaluaciones, Competencias, Historial)
      │
      ▼
[step_4.1.md] Bloque 1 (3. Auditor, Homónimos, Alertas In Situ / Experto Técnico) + Sync Global
      │
      ▼
[step_final.md] Sincronización public/doc/ + Puertas QA SQL / Node / Build / Playwright 4 Roles
```

| Archivo | Alcance Principal | Archivos Impactados (Previstos) | Verificación Independiente |
| :--- | :--- | :--- | :--- |
| **`step_1.1.md`** | Esquema SQL, tablas normalizadas (`telefono_auditor`, `email_auditor`, `evaluacion_in_situ_auditor`), triggers soft-delete/audit/archival, `uq_auditor_cedula_active`, RLS. | `01_creacion.sql`, `02_cobertura_normativa.sql`, `03_indices_optimizacion.sql`, `04_rls.sql`, `phase11SqlMigration.test.ts`, `phase12RlsHardening.test.ts` | Reset DB limpio + `npm test` (SQL governance tests) + validación 0 deletes físicos. |
| **`step_1.2.md`** | Provisión Auth de los 47 auditores + preservación `3333...`, seed idempotente completo desde CSV (perfil, contactos, evaluaciones, normas, sectores, subsectores), ajuste escenario `LABCENTRO`. | `05_usuarios.sql`, `06_datos_prueba.sql`, `expertoSeedInvariants.test.ts` | Reset DB + 2ª ejecución idempotente de `06_datos_prueba.sql` sin errores + conteo exacto 48 filas en `auditor` (`3333...` + 47 CSV). |
| **`step_2.1.md`** | Tipos TS `0 any`, evaluador de estado de evaluación in-situ, unicidad por cédula (homónimos permitidos), `auditorPersistence.ts`, hidratación DB en `main.ts`, actor directory en `auditLog.ts`, compatibilidad `authView.ts`. | `src/lib/competencyMatrix.ts`, `src/lib/auditorPersistence.ts`, `src/lib/auditLog.ts`, `src/lib/accessControl.ts`, `src/views/authView.ts`, `src/main.ts`, `src/lib/competencyMatrix.test.ts` | `npx tsc --noEmit`, `npm test`, login exitoso con `auditor@fondonorma.test` y con auditor real CSV (`calidad.aksanchez@gmail.com` / `AKS10337391`). |
| **`step_3.1.md`** | Multi View List (`table-fixed`, `<colgroup>` 100%, 0 `<button>` en `<tbody>`) y Grid de `Auditor`, nuevas facetas reactivas $S_{-k}$ y búsqueda por siglas/cédula/contacto/observaciones. | `src/views/auditorView.ts`, `src/lib/competencyMatrix.ts`, tests de vista | `npm test`, inspección HTML Zero-UUID y `table-fixed` + Playwright desktop/mobile Multi View. |
| **`step_3.2.md`** | Detail View 3-zonas (`read`/`add`/`edit`) con todos los campos CSV y pestañas `Competencias`, `Contacto`, `Evaluaciones In Situ` e `Historial de Auditorías`, más CRUD completo y archivo/restauración. | `src/views/auditorView.ts`, `src/views/competenciaAuditorView.ts`, `src/main.ts`, tests CRUD y vista | CRUD end-to-end en UI para `ADMIN`/`WORKER`, solo lectura en `AUDITOR`/`CLIENT`, archive guard activo. |
| **`step_4.1.md`** | Integración en Bloque 1 (`3. Auditor` en `asignacionView.ts`), desambiguación de homónimos (`YC`), alertas no bloqueantes por evaluación in situ y `observacion_sectores` (experto técnico), sincronización `Historial` en vivo y dashboard/RBAC. | `src/lib/asignacionDomain.ts`, `src/views/asignacionView.ts`, `src/lib/auditAlertsEngine.ts`, `src/views/resumenView.ts`, `src/lib/auditExecution.ts`, `src/main.ts`, tests de asignación y E2E | `npm test`, verificación homónimos `Yurima Carrillo` en selects, alerta en `3. Auditor` y aislamiento `AUDITOR` autenticado. |
| **`step_final.md`** | Sincronización de los 5 documentos en `public/doc/` + auditoría final completa (SQL reset + re-run `06`, Auth real, `lint`, `test`, `build`, Playwright 4 roles). | `public/doc/project_resume.md`, `database_architecture.md`, `backend_api_security.md`, `frontend_architecture.md`, `testing_and_operations.md` | 4 puertas de calidad en verde sin regresiones. |

---

## 5. Criterios Globales de Aceptación del Roadmap

1. **Integridad de Datos:** Los 47 auditores del CSV están cargados en PostgreSQL sin pérdida de información: 2 teléfonos/3 correos múltiples normalizados en tablas hijas, `Yurima Carrillo` (`7137643` y `12310919`) coexistiendo sin colisión, `MARCA` y `HACCP` visibles sin romper cláusulas ISO, subsectores normalizados (`03.1`, `10.1`, `31.1`), sectores derivados y 100% de las observaciones sectoriales/in situ preservadas.
2. **Autenticación Real:** Cualquier auditor del CSV puede autenticarse vía Supabase Auth usando su correo principal + contraseña `SIGLAS + CEDULA`, obteniendo rol `AUDITOR` (`APPROVED`) con alcance aislado a sus auditorías asignadas; `auditor@fondonorma.test` / `Password123*` sigue funcionando sin cambios.
3. **UX Clara ("Less Is More") y Cero Fugas:** Multi View y Detail View de Auditor muestran toda la riqueza técnica de forma jerárquica y escaneable, con Zero-UUID, `0 any` en TypeScript y cumplimiento estricto de `table-fixed` y RBAC.
