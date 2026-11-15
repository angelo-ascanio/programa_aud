# Roadmap de Modernización del Dominio `certificado` (`public.certificado`)

## 1. Visión General Ejecutiva

Este roadmap define el plan estructurado de ejecución para modernizar integralmente el módulo **`Certificado`** (`public.certificado`) y expandir su modelo relacional con las sub-entidades de **fechas del ciclo de certificación** (`fecha_certificado`) y **contactos autorizados con canales de comunicación** (`contacto_certificado`, `telefono_contacto_certificado`, `email_contacto_certificado`), manteniendo cumplimiento estricto con **ISO/IEC 17021-1:2015**, **TypeScript estricto (`0 any`)**, **Zero-UUID** en la interfaz y **gobernanza soft-delete + bitácora forense (`audit_log`)**.

### Pilares de la Modernización
1. **Compactación y Pureza de Ficha (`Step 1`):** Reducir la densidad vertical de `renderDetailPageTemplate` (`src/views/detailTemplate.ts`) y `renderCertificadoDetailPage` (`src/views/certificadoView.ts`), alineando la **Zona de Padres** estrictamente a las 4 claves foráneas de `public.certificado` (`id_organizacion`, `id_norma`, `id_estatus`, `id_sector_iaf`) y la **Zona de Datos Directos** estrictamente a sus 3 atributos propios (`numero_certificado`, `multisitio`, `alcance`).
2. **Expansión Relacional en PostgreSQL / Supabase (`Step 2.1`):** Incorporar 4 nuevas tablas bajo soft-delete (`fecha_certificado`, `contacto_certificado`, `telefono_contacto_certificado`, `email_contacto_certificado`) en `public/supabase/queries/` (`01_creacion.sql`, `03_indices_optimizacion.sql`, `04_rls.sql`, `06_datos_prueba.sql`), con índices parciales únicos, triggers de auditoría/inmutabilidad, guardias de archivo y políticas RLS granulares.
3. **Expansión de Hijos y Fichas de Detalle Dedicadas (`Steps 2.2 & 3.1`):** Incorporar las pestañas **"Fecha"** y **"Contacto"** en la vista de detalle de `Certificado`, e implementar 4 nuevas vistas de detalle estandarizadas de 3 zonas (`fechaView.ts`, `contactoView.ts`, `telefonoView.ts`, `emailView.ts`) con navegación jerárquica por breadcrumbs, edición en línea y archivo lógico.
4. **Reinicio Verificado de Base de Datos y Pruebas Integrales (`Steps 3.2 & Final`):** Ejecutar `POST /api/reset-db` en orden estricto (`00` → `06`), validar hidratación real en `src/main.ts`, actualizar las suites `node:test` (`src/lib/*.test.ts`), validar `tsc --noEmit`, `npm run lint`, `npm run build` y comprobar diseño responsivo de `375px` a `1920px`.

---

## 2. Matriz de Brechas: Estado Actual vs. Estado Objetivo

| Dimensión | Estado Actual en el Repositorio | Estado Objetivo Tras Modernización | Paso(s) |
| :--- | :--- | :--- | :--- |
| **Densidad Visual de Detail View** | `detailTemplate.ts` usa `p-5 sm:p-6`, `p-3.5`, `my-4` y rejillas de hasta 3 columnas en Zona de Padres, generando altura vertical excesiva antes de las pestañas de hijos. | Encabezado, Zona de Padres (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5`) y Zona de Datos (`p-3 sm:p-4`, `my-2.5`/`my-3`) compactos para maximizar el contenido visible en `1440px–1920px` y móvil. | `Step 1` |
| **Campos en Zona de Padres (`certificado`)** | `parents` incluye `Organización`, `Norma`, `Sector IAF` y `Estatus` (4 tarjetas), pero en rejilla `lg:grid-cols-3` deja una tarjeta huérfana en segunda fila. | Estrictamente los 4 campos FK de `public.certificado` (`id_organizacion`, `id_norma`, `id_estatus`, `id_sector_iaf`) alineados en fila compacta `lg:grid-cols-4`. | `Step 1` |
| **Campos en Zona de Datos Directos (`certificado`)** | `customRecordBodyHtml` mezcla atributos directos con campos derivados/de fechas (`fecha_emision`, `fecha_vencimiento`, `Organismo Acreditador`, `Sub-Sector IAF & Riesgo`) y el formulario edita `fecha_emision`/`fecha_vencimiento`. | Estrictamente los 3 atributos directos de `public.certificado`: `numero_certificado`, `multisitio` y `alcance` (tanto en lectura como en edición inline). | `Step 1` |
| **Modelo de Fechas del Certificado** | No existe tabla dedicada; fechas mockeadas (`fecha_emision`, `fecha_vencimiento`) embebidas en `CertificadoDetailEntity`. | Tabla `public.fecha_certificado` (`id_certificado`, `fecha`, `tipo_fecha` con 7 valores canónicos) gobernada por soft-delete, RLS, `audit_log` y pestaña **"Fecha"**. | `Step 2.1`, `Step 2.2` |
| **Contactos y Canales (`Teléfono`, `Email`)** | Sin soporte en esquema SQL ni interfaz para contactos del certificado. | Tablas `public.contacto_certificado` → `public.telefono_contacto_certificado` & `public.email_contacto_certificado` con borrado lógico en cascada controlada, RLS y pestaña **"Contacto"**. | `Step 2.1`, `Step 2.2` |
| **Vistas de Detalle Sub-entidades** | Existen fichas de 3 zonas para `Sitio`, `Proceso` y `Turno`; sin fichas para `Fecha`, `Contacto`, `Teléfono` o `Email`. | Nuevas vistas `fechaView.ts`, `contactoView.ts`, `telefonoView.ts` y `emailView.ts` integradas con `detailTemplate.ts`, `breadcrumb.ts`, `archiveGovernance.ts` y `auditLogModal.ts`. | `Step 3.1` |
| **Semillas y Reset DB (`POST /api/reset-db`)** | `01_creacion.sql` define 31 tablas; `04_rls.sql` y `06_datos_prueba.sql` aún no incluyen las 4 nuevas tablas. | Pipeline `00` → `06` ejecutado limpiamente vía `POST /api/reset-db` con datos semilla reales e hidratación completa en `src/main.ts`. | `Step 3.2` |
| **Verificación y QA** | Suites actuales cubren 5 pestañas de `Certificado` y campos antiguos de edición. | Suites `node:test`, `tsc --noEmit`, `npm run lint`, `npm run build` y revisión visual (`375px`–`1920px`) actualizadas y en verde. | `Step Final` |

---

## 3. Índice de Pasos de Implementación

| Paso | Archivo | Alcance Principal | Dependencias Previas |
| :--- | :--- | :--- | :--- |
| **Step 1** | [`step_1.md`](./step_1.md) | Compactación de `detailTemplate.ts` y `certificadoView.ts`; alineación estricta de Zona de Padres (4 FKs) y Zona de Datos Directos (`numero_certificado`, `multisitio`, `alcance`). | Ninguna |
| **Step 2.1** | [`step_2.1.md`](./step_2.1.md) | DDL, triggers soft-delete/audit, RPC `get_archive_dependency_summary`, índices parciales, RLS, `archive_record` y semillas en `public/supabase/queries/`. | Ninguna (puede ejecutarse en paralelo con Step 1) |
| **Step 2.2** | [`step_2.2.md`](./step_2.2.md) | Expansión de `CertificadoDetailEntity` y `CertificadoChildTab` (`fecha`, `contacto`); renderizado de pestañas **"Fecha"** y **"Contacto"** e hidratación en `src/main.ts`. | `Step 1`, `Step 2.1` |
| **Step 3.1** | [`step_3.1.md`](./step_3.1.md) | Implementación de `fechaView.ts`, `contactoView.ts`, `telefonoView.ts`, `emailView.ts`, módulo de dominio compartido, breadcrumbs, creación/edición y archivo lógico. | `Step 2.2` |
| **Step 3.2** | [`step_3.2.md`](./step_3.2.md) | Ejecución de `POST /api/reset-db` (`00_delete_tables.sql` → `06_datos_prueba.sql`), verificación de esquema en vivo y pruebas end-to-end de hidratación en `src/main.ts`. | `Step 2.1`, `Step 3.1` |
| **Step Final** | [`step_final.md`](./step_final.md) | Actualización de pruebas unitarias (`src/lib/*.test.ts`), verificación de tipos (`tsc --noEmit`), `npm run lint && npm run build` y auditoría visual (`375px`–`1920px`). | `Step 3.2` |

---

## 4. Convenciones Transversales Obligatorias

- **Zero-UUID en UI:** Nunca exponer UUIDs crudos en tablas, chips, títulos o breadcrumbs (`zeroUuid.ts`). Todo registro se identifica por su clave de negocio (`numero_certificado`, `tipo_fecha + fecha`, `nombre`, `telefono`, `email`).
- **Inmutabilidad Soft-Delete:** Ninguna tabla nueva permite `DELETE` físico por `anon`/`authenticated`; todo archivo pasa por `archive_record` / `archiveGovernance.ts` previa verificación de dependencias vía `get_archive_dependency_summary`.
- **TypeScript Estricto (`0 any`):** Prohibido introducir `any` o supresiones de tipos en `src/`.
- **Single-Card Detail Architecture:** Todas las fichas nuevas utilizan `renderDetailPageTemplate` (`src/views/detailTemplate.ts`) con breadcrumb externo superior, fila única de cabecera `[←] [icono + título] ... [✏️] [🕒] [🗑️]`, Zona de Padres, Zona de Datos Directos y Zona de Hijos por pestañas.
