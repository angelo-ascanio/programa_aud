# Plan Maestro de Arquitectura e Implementación — Versionado de Certificados, Organizaciones y Alcance Bilingüe Compartible (`programa_aud`)

## 1. Resumen Ejecutivo

Esta iniciativa abarca dos transformaciones estructurales integradas para Bloque 2 (`Certificación`) y Bloque 1 (`Auditoría`):

1. **Versionado explícito, auditable y controlado manualmente** para **`organizacion`** (`organizacion_version` con **`abreviacion`** obligatoria `VARCHAR(30)`) y **`certificado`** (`certificado_version`), usando el patrón **Contenedor Estable + Instantánea Versionada**:
   - Identidad longitudinal estable en el contenedor (`organizacion` y `certificado`) para conglomerados, acceso de clientes (`CLIENT`), vínculos, número de certificado, norma y alcance actual.
   - **Edición libre sobre la versión activa** (`es_version_actual = TRUE`) por personal `ADMIN`/`WORKER` sin generar versiones automáticas.
   - **Creación manual bajo demanda de nuevas versiones** con flujos guiados en **español**:
     - **Organización:** **Guardia Anti-No-Op** (bloquea si no cambió ningún campo) + **Modal obligatorio de resolución de certificados** (`Mantener en versión anterior de organización` vs `Vincular a nueva versión de organización`).
     - **Certificado (2 Pasos):** **Paso 1** clona estructura completa hacia `v + 1` **SIN duplicar `fecha_certificado`**; **Paso 2** abre **Modal obligatorio de resolución de auditorías** clasificadas en **4 categorías exactas** (`Mantener en versión anterior` vs `Migrar a nueva versión` con remapeo integral de hijos y hallazgos).
2. **Extracción y Rediseño del `Alcance` (`public.alcance` + `public.alcance_certificado_compartido`):**
   - Se **elimina** la columna `alcance` de `public.certificado` (y no forma parte de `certificado_version`).
   - Se crea la tabla independiente **`public.alcance`** sin versionado ni trazado histórico de cambios de texto: almacena únicamente el valor vigente en **español obligatorio (`alcance_es TEXT`)** e **inglés opcional (`alcance_en TEXT`)**, **sin límite de caracteres** (soporta tanto textos cortos como extensos).
   - Se incorpora como la **primera pestaña hija (`Alcance`)** en la Detail View de `Certificado` con visualización **`Español` / `Inglés` / `Bilingüe`**.
   - Es **compartible** con otros certificados del mismo **`Conglomerado`** mediante **`public.alcance_certificado_compartido`**, incluyendo un **Popup de Comparación y Resolución de Conflicto** cuando el certificado destino ya posee un alcance (permite comparar Español/Inglés nuevo vs actual y decidir **Cancelar** o **Continuar y Reemplazar**).
   - Se permiten certificados **sin `alcance`**, pero **no pueden generar auditorías** (bloqueo en BD, dominio y UI hasta registrar o compartir un alcance).

---

## 2. Arquitectura Entidad-Relación (Contenedor + Versión + Alcance)

### 2.1 Modelo de Organización (`organizacion` + `organizacion_version`)

| Capa | Tabla | Columnas Clave | Propósito |
| :--- | :--- | :--- | :--- |
| Contenedor | `public.organizacion` | `id`, `id_grupo_empresarial`, `deleted_at`, `deleted_by`, `delete_reason` | Identidad estable dentro del conglomerado (`grupo_empresarial`) y anclaje de `client_organization_access`. |
| Versión | `public.organizacion_version` | `id`, `id_organizacion`, `version_numero` (`>= 1`), `es_version_actual` (`BOOLEAN`), `notas_version`, **`nombre`**, **`abreviacion` (`VARCHAR(30) NOT NULL`)**, **`rif`**, **`direccion_fiscal`**, metadatos soft-delete | Snapshot fiscal/nominal versionado. Unicidad parcial de 1 versión activa por organización y unicidad de `nombre`, `abreviacion` y `rif` en `es_version_actual = TRUE AND deleted_at IS NULL`. |

### 2.2 Modelo de Certificado (`certificado` + `certificado_version` + `alcance`)

| Capa | Tabla | Columnas Clave | Propósito |
| :--- | :--- | :--- | :--- |
| Contenedor | `public.certificado` | `id`, `id_organizacion`, `id_norma`, `numero_certificado`, metadatos soft-delete *(sin columna `alcance`)* | Identidad longitudinal del certificado; ancla `vinculo_certificado` y el enlace al `alcance` vigente. |
| Alcance Actual | `public.alcance` | `id`, `id_certificado`, **`alcance_es` (`TEXT NOT NULL`)**, **`alcance_en` (`TEXT NULL`)**, metadatos soft-delete *(sin límite de caracteres, sin versionado)* | Alcance vigente bilingüe del certificado (español obligatorio, inglés opcional). Máximo 1 registro propio activo por certificado. |
| Alcance Compartido | `public.alcance_certificado_compartido` | `id`, `id_alcance`, `id_certificado`, metadatos soft-delete | Enlaza un `alcance` existente hacia otros certificados del mismo `Conglomerado` activo. Un certificado no puede tener alcance propio y compartido activos simultáneamente. |
| Versión | `public.certificado_version` | `id`, `id_certificado`, **`id_organizacion_version`**, `version_numero` (`>= 1`), `es_version_actual` (`BOOLEAN`), `notas_version`, `id_estatus`, `id_sector_iaf`, `id_subsector_iaf`, `multisitio`, metadatos soft-delete *(sin `alcance`)* | Snapshot estructural y normativo versionado apuntando a una `organizacion_version` de la misma organización. |

### 2.3 Matriz de Sub-Entidades y Tablas Enlazadas por Versión (`id_certificado_version`)

Todas las sub-entidades estructurales de versión y `auditoria` incorporan `id_certificado_version UUID NOT NULL REFERENCES public.certificado_version(id)`:

| Tabla | Ámbito | Clona al crear nueva versión de certificado | Comportamiento e Índices Únicos Parciales (`03_indices_optimizacion.sql`) |
| :--- | :---: | :---: | :--- |
| **`alcance` & `alcance_certificado_compartido`** | Contenedor (`id_certificado`) | **No (valor único vigente)** | No versionado ni duplicado por `v1/v2`. Índices únicos activos por `id_certificado` (`uq_alcance_cert_active`, `uq_alcance_compartido_cert_active`). |
| `sitio` | Versión | **Sí** | `uq_sitio_cert_numero_active` sobre `(id_certificado_version, numero_sitio) WHERE deleted_at IS NULL`. |
| `turnos_por_sitio` | Sitio clonado | **Sí** | Apunta al `id_sitio` clonado en la nueva versión (`uq_turnos_por_sitio_active`). |
| `proceso` | Versión | **Sí** | `uq_proceso_cert_nombre_active` sobre `(id_certificado_version, LOWER(TRIM(nombre_proceso)))`. |
| `procesos_por_sitio` | Versión | **Sí** | `uq_procesos_por_sitio_active` sobre `(id_certificado_version, id_sitio, id_proceso)`. |
| `requisitos_por_proceso` | Versión | **Sí** | PK `(id_proceso, id_certificado_version, id_requisito)` sincronizando `id_certificado`. |
| `requisitos_no_aplicables_certificado` | Versión | **Sí** | `uq_req_no_aplicable_cert_req_active` sobre `(id_certificado_version, id_requisito)`. |
| `contacto_certificado` (+ `telefono_*`, `email_*`) | Versión | **Sí** | `uq_contacto_certificado_nombre_active` sobre `(id_certificado_version, LOWER(TRIM(nombre)))`. |
| `turno_certificado_compartido`, `sitio_certificado_compartido`, `proceso_certificado_compartido`, `contacto_certificado_compartido` | Versión | **Condicional (mismo conglomerado)** | Clonados apuntando a `v_nueva` si se mantiene el conglomerado activo; índices únicos por `id_certificado_version`. |
| **`fecha_certificado`** | Versión | **NO (Regla Estricta)** | Permanece estrictamente en su versión de origen (`uq_fecha_certificado_tipo_fecha_active` por `id_certificado_version`). |
| `auditoria` | Versión | **Opcional (Modal Paso 2)** | Requiere `alcance` activo al crearse; se mantiene en `v_anterior` o migra a `v_nueva` remapeando hijos y hallazgos. |

---

## 3. Reglas Críticas de Negocio y Clasificación

### 3.1 Reglas de `Alcance` (Bilingüe, Ilimitado, Compartible y Bloqueo de Auditoría)
- **Sin tracking histórico ni límite de longitud:** Campos `alcance_es TEXT NOT NULL` (sin mínimo artificial ni tope máximo) y `alcance_en TEXT NULL`. La interfaz adapta alturas tanto para alcances de una línea como para textos extensos multilínea.
- **Primera pestaña hija de `Certificado`:** En la Detail View de `Certificado`, la zona de hijos muestra `Alcance` en primera posición (`Alcance`, `Sitio`, `No Aplicable`, `Proceso`, `Turno`, `Auditoría`, `Fecha`, `Contacto`), con selector de visualización `Español` / `Inglés` / `Bilingüe`.
- **Bloqueo de generación de auditorías sin `alcance`:** Un certificado sin `alcance` activo (propio o compartido) es válido en Bloque 2, pero **no puede generar auditorías** ni en Bloque 1 (`AuditWizardModal`, `Vínculo`, `Designación > Tipo`) ni por inserción directa en `public.auditoria` (trigger `fn_validar_certificado_tiene_alcance`).
- **Compartición con detección de conflicto:** Si se comparte un `alcance` con otro certificado del mismo `Conglomerado` que ya posee un `alcance` (propio o compartido de otro origen), se muestra obligatoriamente un **Popup de Comparación** con **Nuevo Alcance (ES/EN)** vs **Alcance Actual del Destino (ES/EN)** y las opciones **`Cancelar`** o **`Continuar y Reemplazar Alcance`** (archiva el anterior del destino y vincula el compartido).

### 3.2 Reglas de Organización (`Organización`)
- **`abreviacion` obligatoria (`2..30` caracteres):** Visible junto al nombre en Bloque 1 y Bloque 2, indexada para búsqueda y validada sin UUIDs crudos.
- **Guardia Anti-No-Op:** Bloquea `"Crear Nueva Versión"` si `(nombre, abreviacion, rif, direccion_fiscal)` normalizados no presentan cambios respecto a la versión activa:
  > `'No se detectaron cambios respecto a la versión activa. Modifique al menos un campo (Nombre, Abreviación, RIF o Dirección Fiscal) para crear una nueva versión.'`
- **Modal obligatorio de resolución de certificados:** Versiones históricas de certificado (`es_version_actual = FALSE`) preseleccionadas en **`Mantener en versión anterior de organización`**; versión actual (`es_version_actual = TRUE`) preseleccionada en **`Vincular a nueva versión de organización`**.

### 3.3 Reglas de Certificado y Clasificador de Auditorías en 4 Categorías
El Paso 1 de `"Crear Nueva Versión"` clona la estructura del certificado sin duplicar `fecha_certificado` ni versionar `alcance`, y el Paso 2 clasifica sus auditorías en **4 categorías**:

| Categoría | Condición de Clasificación (Precedencia) | Preselección por Defecto | Comportamiento |
| :--- | :--- | :---: | :--- |
| **1. Finalizadas (Históricas)** | `estado_ciclo = 'Cerrada' AND revisado = TRUE` o `'Cancelada'`. | **`Mantener en versión anterior`** | Conserva `id_certificado_version` y todos sus hijos intactos. |
| **2. Post-ejecución (En cierre)** | Tiene fecha activa `REAL` en `auditoria_fecha`, o `estado_ciclo IN ('Auditada', 'Cerrada')` con `revisado = FALSE`. | **Sin preselección** *(obligatorio elegir)* | Bloquea confirmación hasta decisión manual. |
| **3. Pre-ejecución (Próximas)** | Sin fechas `REAL`, pero con fecha programada/preprogramada `<= CURRENT_DATE + 30 días`, o `'En Ejecución'`. | **Sin preselección** *(obligatorio elegir)* | Bloquea confirmación hasta decisión manual. |
| **4. Auditorías futuras** | Sin fechas `REAL` y fecha `> CURRENT_DATE + 30 días` (ej. campañas `+1/+2` años) o borrador futuro sin fecha próxima. | **`Migrar a nueva versión`** | Actualiza `auditoria.id_certificado_version` y remapea `sitios_por_auditoria`, `procesos_sitio_auditoria`, `turnos_sitio_auditoria` y `hallazgo`. |

---

## 4. Matriz RBAC para los 4 Roles

| Capacidad | `ADMIN` (Aprobado) | `WORKER` (Aprobado) | `AUDITOR` (Aprobado) | `CLIENT` (Aprobado · Nivel 2) |
| :--- | :---: | :---: | :---: | :---: |
| Ver versiones (`organizacion_version`, `certificado_version`) y `alcance` (ES/EN) | Sí (incl. archivados) | Sí (activos) | Solo certificados/alcances de auditorías asignadas en Bloque 1 | Solo organizaciones autorizadas (`has_client_org_access`) + sus certificados/alcances |
| Editar versión activa / crear o editar `alcance` / compartir `alcance` | Sí | Sí | No (solo lectura) | No (solo lectura) |
| Editar versiones históricas (`es_version_actual = FALSE`) | **No (Solo lectura)** | **No (Solo lectura)** | No | No |
| Ejecutar `"Crear Nueva Versión"` (Org / Cert) | Sí | Sí | No | No |
| Inspeccionar `audit_log` y registros archivados | Sí | No | No | No |

---

## 5. Mapa de Pasos y Dependencias

```text
[Step 1.1] SQL Organización Container + organizacion_version + abreviacion + Anti-No-Op & Resolución RPC
    │
    ▼
[Step 1.2] SQL Certificado Container + certificado_version + Tabla alcance & alcance_certificado_compartido
           + Guard Auditoría-requiere-Alcance + Sub-Entidades id_certificado_version + Cobertura + RLS
    │
    ▼
[Step 1.3] SQL RPCs Clonación/Migración + RPC Compartir/Reemplazar Alcance + Semillas 06_datos_prueba.sql + Tests SQL
    │
    ├───────────────────────────────┬───────────────────────────────┐
    ▼                               ▼                               ▼
[Step 2.1] Dominio Org/Abrev.   [Step 2.2] Dominio Cert/4 Cat.  [Step 2.3] Dominio Alcance + Share Conflicto + Guard Auditoría
    │                               │                               │
    └───────────────────────────────┴───────────────┬───────────────┘
                                                    ▼
                                [Step 3.1] Hidratación Main + Conglomerado + Breadcrumbs + Search
                                                    │
                                    ┌───────────────┴───────────────┐
                                    ▼                               ▼
                        [Step 3.2] UI Organización      [Step 3.3] UI Certificado + Tab 1 Alcance + Share Modal Conflicto
                                    └───────────────┬───────────────┘
                                                    ▼
                                [Step 4.1] Propagación Bloque 1 + Bloqueo Generar Auditorías sin Alcance
                                                    │
                                                    ▼
                                [Step Final] Auditoría Integral SQL, Tests, Lint/Build, E2E 4 Roles y /public/doc/
```

---

## 6. Criterios Globales de Aceptación y Riesgos

1. **Zero-UUID, `0 any`, `table-fixed` + `<colgroup>` = `100%` + `0 <button>` en `<tbody>`, y Español 100%** en toda nueva UI, error y excepción SQL (con soporte opcional de texto del usuario en inglés en `alcance_en`).
2. **Integridad SQL:** `00_delete_tables.sql` → `07_normas_requisitos_csv.sql` limpio e idempotente; migración segura de `certificado.alcance` hacia `public.alcance` antes de eliminar la columna.
3. **Cobertura de Riesgos:** El popup de conflicto de `alcance` evita sobrescrituras accidentales entre certificados del conglomerado; la guarda de auditoría sin `alcance` impide planificar auditorías incompletas; la clonación de `certificado_version` conserva intacta `fecha_certificado` en su versión original y remapea sin huérfanos las auditorías migradas.
