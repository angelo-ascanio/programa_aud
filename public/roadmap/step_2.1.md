# Paso 2.1: Sitios con Dotación (`personal_count`), Turnos (`1–6`), Procesos y Matrices `procesos_por_sitio` / `turnos_por_sitio`

**Dependencias:** Pasos 1.1 y 1.2 completados.
**Objetivo:** Expandir la estructura física y organizacional de cada certificado de `CONG-IND-01` (`Iberometal Componentes S.A.` y `Example, C.A.`): múltiples sitios con dotación diferenciada en `personal_count` cuando `multisitio = TRUE`, estrictamente 1 sitio HQ cuando `multisitio = FALSE`, de 1 a 6 turnos vinculados por certificado (`turnos_por_sitio`), procesos bien tipificados (`Estratégico`, `Medular`, `De Apoyo`) y matrices realistas `procesos_por_sitio`.

---

## 1. Diseño de Sitios por Certificado (`public.sitio`, Sección `-- 14.`)

Respetar invariantes estrictos:
- Todo certificado tiene un único **`Sitio 0`** (`numero_sitio = 0`, Sede Principal / HQ o Planta Principal), con la **mayor cantidad de personal** y mayor concentración de procesos operativos (`Medular`) y estratégicos (`Estratégico`).
- Solo certificados con `multisitio = TRUE` tendrán sitios adicionales (`numero_sitio = 1, 2, 3`), de perfil administrativo, comercial, logístico o planta auxiliar, con dotación decreciente.
- Certificados con `multisitio = FALSE` (`FN-QMS-2026-008`, `FN-SST-2026-006`, `FN-QMS-2026-009`) conservan **únicamente `Sitio 0`**.

### Inventario Detallado de Sitios (`CONG-IND-01`)

1. **`FN-QMS-2024-001` (`40...0001`, Iberometal SGC, `multisitio = TRUE` — 4 sitios):**
   - `Sitio 0` (`50...0000`): **Sede Principal y Planta Fundición HQ** (Valencia) · **`personal_count = 195`** · Operativo principal + Dirección.
   - `Sitio 1` (`50...0001`): **Planta Troquelado y Estampado Valencia** (Galpón 4-B, Valencia) · **`personal_count = 88`** · Planta operativa secundaria.
   - `Sitio 2` (`50...0010`): **Centro Logístico y Almacén Central Guacara** (Zona Industrial Guacara) · **`personal_count = 36`** · Logística/Despacho.
   - `Sitio 3` (`50...0011`): **Oficina Comercial y Atención Automotriz Caracas** (Chacao, Caracas) · **`personal_count = 16`** · Comercial/Administrativo.
2. **`FN-EMS-2025-002` (`40...0002`, Iberometal SGA, `multisitio = TRUE` — 3 sitios):**
   - `Sitio 0` (`50...0002`): **Complejo Industrial Ambiental HQ** (Valencia) · **`personal_count = 160`** · Planta principal de fundición y PTAR.
   - `Sitio 1` (`50...0012`): **Planta Tratamiento Superficial Valencia Sur** · **`personal_count = 52`** · Área operativa de galvanoplastia/acabados.
   - `Sitio 2` (`50...0013`): **Almacén de Insumos y Acopio Temporal Guacara** · **`personal_count = 24`** · Almacenamiento controlado.
3. **`FN-SST-2025-010` (`40...0010`, Iberometal SST, `multisitio = TRUE` — 3 sitios):**
   - `Sitio 0` (`50...0020`): **Complejo Industrial Seguridad HQ** (Valencia) · **`personal_count = 185`**.
   - `Sitio 1` (`50...0021`): **Planta Prensas Pesadas Valencia** · **`personal_count = 76`**.
   - `Sitio 2` (`50...0022`): **Oficina Administrativa y Servicio Médico Caracas** · **`personal_count = 14`**.
4. **`FN-QMS-2026-008` (`40...0008`, Iberometal Estudio, `multisitio = FALSE` — 1 sitio):**
   - `Sitio 0` (`50...0023`): **Taller Piloto Mecanizado CNC Valencia** · **`personal_count = 22`**.
5. **`FN-QMS-2025-004` (`40...0004`, Example SGC, `multisitio = TRUE` — 3 sitios):**
   - `Sitio 0` (`50...0004`): **Planta Estructural Santa Cruz HQ** (Edo. Aragua) · **`personal_count = 150`**.
   - `Sitio 1` (`50...0014`): **Patio de Granallado y Pintura Industrial Cagua** · **`personal_count = 64`**.
   - `Sitio 2` (`50...0015`): **Oficina de Ingeniería Comercial y Licitaciones Caracas** · **`personal_count = 18`**.
6. **`FN-EMS-2025-005` (`40...0005`, Example SGA, `multisitio = TRUE` — 3 sitios):**
   - `Sitio 0` (`50...0005`): **Planta Estructural Santa Cruz SGA HQ** · **`personal_count = 145`**.
   - `Sitio 1` (`50...0016`): **Patio de Acabado Superficial Cagua SGA** · **`personal_count = 58`**.
   - `Sitio 2` (`50...0017`): **Oficina Administrativa Ambiental Maracay** · **`personal_count = 12`**.
7. **`FN-SST-2026-006` (`40...0006`, Example SST, `multisitio = FALSE` — 1 sitio):**
   - `Sitio 0` (`50...0006`): **Planta Santa Cruz SST** · **`personal_count = 135`**.
8. **`FN-QMS-2026-009` (`40...0009`, Example Logística SGC, `multisitio = FALSE` — 1 sitio):**
   - `Sitio 0` (`50...0007`): **Centro Logístico Aragua** · **`personal_count = 38`**.

> En `CONG-ALM-01` y `CONG-CYB-01` conservar los sitios existentes asignando valores coherentes de `personal_count` (ej. `Organización Grande`: `120–160` en sitios `S1..S3`, `85` en 4º sitio; `Organización Pequeña`: `28`; `CyberCloud`: `55`).

---

## 2. Asignación de Turnos por Sitio (`public.turnos_por_sitio`, Sección `-- 15.`)

Usando el catálogo de 6 turnos creado en el Paso 1.1 (`7000...0001` .. `7000...0006`), garantizar que **cada certificado tenga entre 1 y 6 turnos distintos** en sus sitios y que cada turno refleje el tipo de operación del sitio:

| Certificado | Total Turnos en Cert. | Distribución por Sitio (`turnos_por_sitio`) |
| :--- | :---: | :--- |
| `FN-QMS-2024-001` | **5 turnos** | HQ (`0`): T1 Matutino, T2 Vespertino, T3 Nocturno, T4 Administrativo · Planta Valencia (`1`): T1, T2, T3 · Guacara (`2`): T5 Recepción/Despacho, T1 · Caracas (`3`): **solo T4 Administrativo (08:00–17:00)** |
| `FN-EMS-2025-002` | **4 turnos** | HQ (`0`): T1, T2, T3, T6 Guardia · Planta Sur (`1`): T1, T2 · Acopio (`2`): T5 Recepción, T4 Admin |
| `FN-SST-2025-010` | **4 turnos** | HQ (`0`): T1, T2, T3, T6 Brigada · Prensas (`1`): T1, T2 · Oficina Caracas (`2`): T4 Administrativo |
| `FN-QMS-2026-008` | **2 turnos** | Taller CNC (`0`): T1 Matutino, T2 Vespertino |
| `FN-QMS-2025-004` | **4 turnos** | Santa Cruz HQ (`0`): T1, T2, T3, T4 · Cagua (`1`): T1, T2 · Oficina Caracas (`2`): T4 Administrativo |
| `FN-EMS-2025-005` | **3 turnos** | Santa Cruz HQ (`0`): T1, T2, T6 · Cagua (`1`): T1, T2 · Maracay Admin (`2`): T4 Administrativo |
| `FN-SST-2026-006` | **2 turnos** | Santa Cruz SST (`0`): T1 Matutino, T2 Vespertino |
| `FN-QMS-2026-009` | **1 turno** | Centro Logístico Aragua (`0`): T5 Recepción y Despacho (`06:00–14:00`) *(o T1/T5)* |

---

## 3. Catálogo de Procesos y Combinación `procesos_por_sitio` (Secciones `-- 16.` y `-- 16b.`)

Cada certificado de `CONG-IND-01` contará con **4 a 6 procesos** (`proceso`) bien distribuidos entre `Estratégico`, `Medular` y `De Apoyo`:

### Regla de Negocio para `procesos_por_sitio`
- **`Sitio 0` (HQ / Planta Principal):** aloja el **100% o la mayoría de procesos `Medular` (operativos)** más `Dirección Estratégica / Planificación` (`Estratégico`) y soporte central (`Talento Humano / Mantenimiento`).
- **`Sitio 1` (Planta Secundaria):** aloja únicamente los procesos operativos que allí se ejecutan + `Mantenimiento / Seguridad Operativa`.
- **`Sitio 2/3` (Comercial / Administrativo / Logístico):** aloja **1 o 2 procesos** especializados (ej. `Gestión Comercial y Atención al Cliente`, `Compras y Logística de Distribución`, `Gestión Administrativa`), **nunca** procesos pesados de fundición o prensas inexistentes en una oficina comercial.

### Ejemplo Estructural (`FN-QMS-2024-001` — 6 Procesos × 4 Sitios)
1. `Dirección Estratégica, Contexto y Mejora` (`Estratégico`) → **HQ (`0`)**
2. `Fundición, Siderurgia y Control Metalúrgico` (`Medular`) → **HQ (`0`)**
3. `Estampado, Troquelado y Ensamble Automotriz` (`Medular`) → **HQ (`0`) + Planta Valencia (`1`)**
4. `Metrología, Mantenimiento y Competencia Técnica` (`De Apoyo`) → **HQ (`0`) + Planta Valencia (`1`)**
5. `Compras, Almacenamiento y Logística de Despacho` (`De Apoyo`) → **HQ (`0`) + Guacara (`2`)**
6. `Gestión Comercial, Contratos y Satisfacción del Cliente` (`Medular`) → **HQ (`0`) + Oficina Caracas (`3`)**

> Aplicar el mismo patrón de 4–6 procesos reales por certificado para `FN-EMS-2025-002` (5 procesos), `FN-SST-2025-010` (5 procesos), `FN-QMS-2026-008` (4 procesos), `FN-QMS-2025-004` (6 procesos), `FN-EMS-2025-005` (5 procesos), `FN-SST-2026-006` (4 procesos) y `FN-QMS-2026-009` (4 procesos), asignando rangos de UUID deterministas `6000...0001..0050` y `6100...0001..0099` sin colisionar con `CONG-CYB-01` o `CONG-ALM-01`.

---

## 4. Criterios de Verificación del Paso 2.1

- [ ] Todo certificado con `multisitio = FALSE` tiene exactamente 1 sitio activo (`numero_sitio = 0`).
- [ ] Todo certificado con `multisitio = TRUE` tiene 3–4 sitios ordenados `0, 1, 2 [, 3]`, donde `Sitio 0` posee el mayor `personal_count` y el mayor conteo de filas en `procesos_por_sitio`.
- [ ] Cada certificado de `CONG-IND-01` tiene entre `1` y `6` turnos distintos vinculados en `turnos_por_sitio`, coherentes con el perfil del sitio.
- [ ] Ningún proceso de un certificado A está enlazado a un sitio de un certificado B (validado por `fn_validar_proceso_sitio_certificado`).
