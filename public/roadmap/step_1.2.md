# Paso 1.2: Enriquecimiento de `Grupo Industrial Iberometal`, Organizaciones, Certificados, Fechas de Ciclo y Contactos

**Dependencias:** Paso 1.1 completado.
**Objetivo:** Enriquecer integralmente el conglomerado `Grupo Industrial Iberometal` (`CONG-IND-01`), sus dos organizaciones (`Iberometal Componentes S.A.` y `Example, C.A.`), su portafolio completo de certificados, las fechas inteligentes del ciclo de certificación (`fecha_certificado`, incluyendo recertificaciones trienales) y los directorios de contactos (`contacto_certificado`, teléfonos y correos) para el 100% de sus certificados.

---

## 1. Enriquecimiento de Conglomerado y Organizaciones (`06_datos_prueba.sql` Secciones `-- 10b.` y `-- 11.`)

1. **`grupo_empresarial` (`CONG-IND-01`, `20000000-0000-0000-0000-000000000001`):**
   - Actualizar `notas` con una descripción corporativa clara del grupo industrial (holding metalmecánico, estructuras pesadas y manufactura de precisión en el eje Carabobo–Aragua, habilitado para vinculación Nivel 1 y Nivel 2).
2. **`organizacion`:**
   - **`30000000-0000-0000-0000-000000000001` · `Iberometal Componentes S.A.` (`J-30492817-0`):** refinar `direccion_fiscal` completa (`Av. Industrial 100, Zona Industrial Municipal Norte, Valencia, Edo. Carabobo 2001`). Mantener la autorización exclusiva en `client_organization_access` (`c100...0001`) para `client@fondonorma.test` (`4444...`).
   - **`30000000-0000-0000-0000-000000000003` · `Example, C.A.` (`J-50112233-4`):** refinar `direccion_fiscal` completa (`Zona Industrial Santa Cruz, Parcela 12, Carretera Nacional Cagua–Santa Cruz, Edo. Aragua 2123`). Mantener **sin** fila en `client_organization_access` para preservar la demostración de aislamiento RLS Nivel 2.
3. **Preservar intactas** las organizaciones de `CONG-CYB-01` (`3000...0002`) y `CONG-ALM-01` (`3000...0004`, `3000...0005`).

---

## 2. Portafolio Curado de Certificados (`public.certificado`, Sección `-- 13.`)

Ajustar y detallar los **8 certificados** de `CONG-IND-01` (4 para `Iberometal Componentes S.A.` y 4 para `Example, C.A.`), cuidando alcances realistas (entre `60` y `500` caracteres, sin UUIDs), sectores/subsectores IAF coherentes y `multisitio` bien diferenciado:

### 2.1 `Iberometal Componentes S.A.` (`3000...0001`)
1. **`40000000-0000-0000-0000-000000000001` · `FN-QMS-2024-001`**
   - Norma: `ISO 9001:2015` · Estatus: `Activo` · Sector/Subsector: `17 / 17.1` (`ALTO`) · `multisitio = TRUE`.
   - Alcance: Manufactura, estampado en frío/caliente, fundición de precisión, mecanizado de acabado y comercialización nacional de componentes metálicos troquelados para automoción y línea blanca (sin diseño de producto bajo plano del cliente).
2. **`40000000-0000-0000-0000-000000000002` · `FN-EMS-2025-002`**
   - Norma: `ISO 14001:2015` · Estatus: `Activo` · Sector/Subsector: `17 / 17.1` (`ALTO`) · `multisitio = TRUE` (elevado de `FALSE` a `TRUE` para reflejar gestión ambiental en HQ, Planta Valencia y Almacén/Logística).
   - Alcance: Gestión ambiental de operaciones de fundición controlada, tratamiento térmico, acabado superficial, manejo de residuos ferrosos, efluentes industriales y almacenamiento de insumos químicos.
3. **`40000000-0000-0000-0000-000000000010` · `FN-SST-2025-010`** *(nuevo certificado para consolidar sistema combinado SST+SGA en Iberometal)*
   - Norma: `ISO 45001:2018` · Estatus: `Activo` · Sector/Subsector: `17 / 17.1` (`ALTO`) · `multisitio = TRUE`.
   - Alcance: Gestión de seguridad y salud en el trabajo en líneas de prensado hidráulico, fundición de aleaciones, izaje de cargas, mantenimiento eléctrico/mecánico y despacho industrial.
4. **`40000000-0000-0000-0000-000000000008` · `FN-QMS-2026-008`**
   - Norma: `ISO 9001:2015` · Estatus: `Estudio` · Sector/Subsector: `17 / 17.2` (`MEDIO`) · `multisitio = FALSE`.
   - Alcance: Mecanizado CNC de alta precisión y tratamientos superficiales especiales para línea experimental de exportación (en evaluación inicial previa a certificación; permanece **LIBRE** para Paso 2 Vínculo).

### 2.2 `Example, C.A.` (`3000...0003`)
5. **`40000000-0000-0000-0000-000000000004` · `FN-QMS-2025-004`**
   - Norma: `ISO 9001:2015` · Estatus: `Activo` · Sector/Subsector: `17 / 17.2` (`MEDIO`) · `multisitio = TRUE` (expandido a 3 sedes: Planta Santa Cruz HQ, Planta Acabados Guacara y Oficina Comercial Caracas).
   - Alcance: Diseño de ingeniería de detalle, fabricación de estructuras metálicas pesadas, calderería, soldadura certificada, recubrimiento anticorrosivo y comercialización industrial.
6. **`40000000-0000-0000-0000-000000000005` · `FN-EMS-2025-005`**
   - Norma: `ISO 14001:2015` · Estatus: `Activo` · Sector/Subsector: `17 / 17.2` (`MEDIO`) · `multisitio = TRUE`.
   - Alcance: Gestión ambiental de fabricación estructural, granallado, cabinas de pintura industrial, control de emisiones atmosféricas y gestión integral de residuos peligrosos.
7. **`40000000-0000-0000-0000-000000000006` · `FN-SST-2026-006`**
   - Norma: `ISO 45001:2018` · Estatus: `Activo` · Sector/Subsector: `17 / 17.2` (`MEDIO`) · `multisitio = FALSE`.
   - Alcance: Gestión de seguridad y salud laboral en trabajos en altura, soldadura, corte térmico y operación de puentes grúa en Planta Santa Cruz.
8. **`40000000-0000-0000-0000-000000000009` · `FN-QMS-2026-009`**
   - Norma: `ISO 9001:2015` · Estatus: `Activo` · Sector/Subsector: `17 / 17.2` (`MEDIO`) · `multisitio = FALSE`.
   - Alcance: Operaciones logísticas integradas, recepción, inspección en tránsito, consolidación de carga y despacho de estructuras y piezas metálicas para proyectos industriales.

---

## 3. Fechas Inteligentes del Ciclo de Certificación (`public.fecha_certificado`, Sección `-- 23.`)

Diseñar hitos coherentes de ciclo trienal (ISO/IEC 17021-1) para los 8 certificados de `CONG-IND-01` (y mantener consistentes los otros conglomerados):

| Certificado | Historia / Ciclo | `Otorgamiento` | `Renovación` | `Ultima Auditoría` | `Vencimiento` |
| :--- | :--- | :---: | :---: | :---: | :---: |
| `FN-QMS-2024-001` | **2.º Ciclo (Recertificado)** — emitido hace >5 años, renovado hace ~2 años | `2021-03-15` | `2024-03-15` | Fecha `REAL` histórica más reciente (`~ -1 año`) | `2027-03-14` *(calculado por renovación)* |
| `FN-EMS-2025-002` | **2.º Ciclo (Recertificado reciente)** — otorgado 2022, renovado 2025 | `2022-05-10` | `2025-05-10` | Fecha `REAL` de renovación/seg. (`2025-04-18`) | `2028-05-09` |
| `FN-SST-2025-010` | **1.er Ciclo Vigente** — otorgado 2025 | `2025-05-12` | — | `2025-04-18` | `2028-05-11` |
| `FN-QMS-2026-008` | **En Estudio (Pre-certificación)** | — | — | — | *(Opcional `Modificación` por solicitud inicial `2026-02-01`, sin otorgamiento ni vencimiento)* |
| `FN-QMS-2025-004` | **2.º Ciclo (Recertificado)** — otorgado 2022, renovado 2025 | `2022-06-20` | `2025-06-20` | Fecha `REAL` Seguimiento / Etapa 2 | `2028-06-19` |
| `FN-EMS-2025-005` | **1.er Ciclo Integrado** — alineado con SGC en renovación | `2025-06-20` | — | Misma fecha `REAL` integrada que SGC | `2028-06-19` *(alineación integrada)* |
| `FN-SST-2026-006` | **1.er Ciclo Nuevo** — otorgado inicios 2026 | `2026-01-15` | — | `2025-12-10` | `2029-01-14` |
| `FN-QMS-2026-009` | **1.er Ciclo Nuevo** — unidad logística | `2026-02-10` | — | `2026-01-22` | `2029-02-09` |

> **Nota técnica:** Verificar en `deriveCertificateVigenciaDates()` (`src/lib/multisiteSampling.ts`) que cuando exista `Renovación` posterior a `Otorgamiento` la fecha efectiva de inicio de vigencia pueda mostrarse o complementarse limpiamente en la pestaña `Fechas` de `certificadoView.ts`, manteniendo `Otorgamiento` como origen histórico y `Vencimiento` como fin del ciclo vigente.

---

## 4. Directorio Completo de Contactos (`contacto_certificado`, `telefono_contacto_certificado`, `email_contacto_certificado`, Secciones `-- 24..26.`)

Poblar **1 a 2 contactos autorizados** para **cada uno de los 8 certificados** de `CONG-IND-01`, cada uno con al menos 1–2 teléfonos (`Oficina`, `Móvil`, `Directo`) y 1–2 correos (`Trabajo`, `Alternativo`):
- **Iberometal Componentes S.A.** (`@iberometal.com`):
  - `FN-QMS-2024-001` (`40...0001`): `Ing. María Fernanda Rojas` (Gerente de Aseguramiento de Calidad) + `Lic. Alejandro Peña` (Coordinador SGC) — preservar IDs `9200...0001..0002`.
  - `FN-EMS-2025-002` (`40...0002`): `Ing. Mariana Castellanos` (Jefa de Gestión Ambiental) + `Téc. Luis Alberto Gómez` (Supervisor de Efluentes y Residuos).
  - `FN-SST-2025-010` (`40...0010`): `Ing. Héctor Zambrano` (Gerente SSL) + `Dra. Sofía Navarro` (Médico Ocupacional).
  - `FN-QMS-2026-008` (`40...0008`): `Ing. Ricardo Villalobos` (Líder de Proyecto CNC).
- **Example, C.A.** (`@example-industrial.com`):
  - `FN-QMS-2025-004` (`40...0004`): `Ing. Beatriz Morales` (Directora de Calidad y Procesos) + `Ing. Gabriel Tovar` (Coordinador de Control Dimensional).
  - `FN-EMS-2025-005` (`40...0005`): `Ing. Beatriz Morales` (Directora HSEQ) + `Téc. Paola Jiménez` (Analista Ambiental).
  - `FN-SST-2026-006` (`40...0006`): `Ing. Oscar Paredes` (Coordinador Corporativo SST).
  - `FN-QMS-2026-009` (`40...0009`): `Lic. Verónica Salcedo` (Jefa de Operaciones Logísticas).

---

## 5. Paridad con Fallbacks Locales (`src/lib/multisiteSampling.ts`)

Actualizar `INITIAL_CERTIFICADOS_DETAILED` en `src/lib/multisiteSampling.ts` para reflejar los cambios de `CONG-IND-01` (fechas de renovación, contactos, alcances actualizados y nuevos certificados) manteniendo la compatibilidad de las pruebas unitarias existentes en `src/lib/multisiteSampling.test.ts` y `src/lib/conglomeradoDomain.test.ts`.

---

## 6. Criterios de Verificación del Paso 1.2

- [ ] Todos los `INSERT` en `certificado`, `fecha_certificado`, `contacto_certificado`, `telefono_contacto_certificado` y `email_contacto_certificado` usan `ON CONFLICT (...) WHERE deleted_at IS NULL DO UPDATE`.
- [ ] Todos los alcances cumplen `LENGTH(TRIM(alcance)) BETWEEN 10 AND 1000`.
- [ ] Ningún certificado de `CONG-IND-01` queda sin contactos, sin teléfonos ni sin correos.
- [ ] `FN-QMS-2024-001` y `FN-EMS-2025-002` y `FN-QMS-2025-004` muestran secuencia coherente `Otorgamiento` → `Renovación` → `Ultima Auditoría` → `Vencimiento`.
