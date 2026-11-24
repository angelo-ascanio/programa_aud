# Roadmap de Arquitectura: Rediseño de `Vínculo`, `Relación`, Wizard `+ Auditoría` e Identificadores Compactos

## 1. Resumen Ejecutivo

Este roadmap especifica paso a paso la refactorización integral del flujo de vinculación y programación de auditorías en `programa_aud`, manteniendo estricta paridad entre base de datos PostgreSQL/Supabase (`public/supabase/queries/00`–`07.sql`), capa pura de dominio (`src/lib/*.ts`), vistas HTML (`src/views/*.ts`), orquestación (`src/main.ts`) y pruebas unitarias/E2E.

### Ejes Arquitectónicos del Rediseño

1. **Separación Estructural (`Vínculo` en Bloque 2) vs. Ejecución (`Relación` en Bloque 1):**
   - **`Vínculo` (Bloque 2 `Certificación` → debajo de `Certificado`):** Pasa a ser exclusivamente un organizador estructural ("Cajas Agrupadoras") dentro del conglomerado, completamente **aislado** de las auditorías ejecutadas. Soporta herencia de naturaleza (`tipo_vinculacion`), sobreescritura individual opcional por certificado (`tipo_vinculacion_override`), vista Multi por `Conglomerado`, vista Detalle minimalista de 2 zonas (arriba `LIBRE` / abajo Cajas Agrupadoras limpias sin ruido en modo lectura), pop-up de asignación con cajas colapsadas/expandibles y regla estricta de desvinculación antes de re-vincular.
   - **`Relación` (Bloque 1 `Auditoría` → Paso 1 ANTES de `Designación`):** Nueva sección inicial del pipeline (`1. Relación` → `2. Designación {Tipo, Fecha, Sitio, Temporal}` → `3. Tiempo` → `4. Auditor` → `5. Proceso` → `6. Turno` → `7. Resultado` → `8. Revisión` + `Resumen`). Vista Multi centrada en Organizaciones/Conglomerados con pop-up selector de certificado/auditoría y filtros de ciclo/naturaleza; Vista Detalle limpia inspirada en `Tipo` (`renderAuditSectionShell` compacto + tabla `table-fixed` `<colgroup>` 100%) usando las cajas de `Vínculo` como base editable para la naturaleza real de cada auditoría/lote.
2. **Rediseño del Pop-up `+ Auditoría` en 3 Fases:**
   - **Fase 1:** Selección bidireccional de `Conglomerado` y/o `Organización` con nombres cortos.
   - **Fase 2:** Selección de caja `Vínculo` mostrando todos sus certificados con interruptores activos (**ON por defecto**) para incluir todos, un subconjunto o un solo certificado sin forzar todo el grupo.
   - **Fase 3:** Configuración de fecha programada + tabla unificada de 2 columnas para los certificados activos (**Col 1: `Relación / Naturaleza`** pre-cargada desde la caja/miembro y editable; **Col 2: `Tipo de Auditoría`**).
3. **Estándar Universal "Less Is More" (Nombres Cortos y Codename Compacto):**
   - **Codename de Auditoría:** Formato compacto determinista basado en último periodo programado/real + abreviación corta del tipo de auditoría (ej. `2026-11 Seg.1`), con abreviaciones oficiales para los 9 valores de `tipo_auditoria`.
   - **Nombres Cortos de Conglomerado y Organización:** Preferencia sistemática por `abreviacion` / apodo corto en selectores, tarjetas, cabeceras, breadcrumbs y tablas de Bloque 1 y Bloque 2.

---

## 2. Lista Numerada de Pasos y Orden de Dependencias

| Orden | Paso | Objetivo | Dependencias |
| :---: | :--- | :--- | :--- |
| 1 | [Paso 1.1: Esquema SQL, Triggers, RLS y Semillas](./step_1.1.md) | Columnas de abreviación, override por certificado en `vinculo_certificado`, `tipo_vinculacion` por `auditoria`, desacople de triggers e idempotencia en seeds. | Ninguna |
| 2 | [Paso 1.2: Motor de Codenames, Abreviaciones e Hidratación](./step_1.2.md) | Módulo puro `src/lib/codenameDomain.ts`, pruebas unitarias e hidratación de nuevos campos en `src/main.ts`. | Paso 1.1 |
| 3 | [Paso 2.1: Dominio Puro de `Vínculo` en Bloque 2](./step_2.1.md) | Refactorización pura de `src/lib/vinculoDomain.ts`: aislamiento estructural, herencia/override por certificado, pop-up colapsado y RBAC Bloque 2. | Pasos 1.1, 1.2 |
| 4 | [Paso 2.2: Navegación Bloque 2 e Interfaz Minimalista de `Vínculo`](./step_2.2.md) | Reubicación en menú `Certificación`, vista Multi por Conglomerado, vista Detalle 2 zonas, pop-up colapsado/expandible y wiring en `src/main.ts`. | Paso 2.1 |
| 5 | [Paso 3.1: Arquitectura del Pipeline y Dominio de `Relación` (Paso 1)](./step_3.1.md) | Nuevo módulo `src/lib/relacionDomain.ts`, reordenamiento de `PIPELINE_STAGE_ORDER`, navegación/RBAC/breadcrumb para `1. Relación` antes de `Designación`. | Pasos 1.2, 2.2 |
| 6 | [Paso 3.2: Interfaz de `Relación`, Picker Pop-up y Enrutamiento](./step_3.2.md) | Nueva vista `src/views/relacionView.ts` (Multi Org/Conglomerado + Picker Modal + Detalle estilo `Tipo`), stepper bar y wiring en `src/main.ts`. | Paso 3.1 |
| 7 | [Paso 4.1: Dominio y Validación del Wizard `+ Auditoría` (3 Fases)](./step_4.1.md) | Refactorización pura de `auditWizardDomain.ts` y `auditPlanningPersistence.ts`: toggles ON por defecto en Fase 2 y matriz 2 columnas en Fase 3. | Pasos 2.1, 3.1 |
| 8 | [Paso 4.2: Modal UI `+ Auditoría` y Persistencia Transaccional](./step_4.2.md) | Rediseño de `src/views/auditWizardModal.ts` y handlers/transacción en `src/main.ts` con soporte a subconjuntos y naturaleza por auditoría. | Pasos 3.2, 4.1 |
| 9 | [Paso 5.1: Estandarización Global de Codenames y Nombres Cortos](./step_5.1.md) | Adopción transversal de `formatAuditCodename` y `resolveShortConglomeradoName` en vistas Bloque 1/Bloque 2 sin romper `<colgroup>` ni `<tbody>`. | Pasos 1.2, 3.2, 4.2 |
| 10 | [Paso Final: QA Integral, E2E 4 Roles y Sincronización Documental](./step_final.md) | Reset SQL limpio (`00`–`07`), `npm test`, `npm run lint`, `npm run build`, Playwright Desktop/Mobile en 4 roles y actualización de `public/doc/`. | Todos los anteriores |

### Grafo de Dependencias

```text
Paso 1.1 (SQL + Triggers + Seeds)
   └──► Paso 1.2 (codenameDomain + Hidratación)
           ├──► Paso 2.1 (vinculoDomain Bloque 2)
           │       └──► Paso 2.2 (Nav + vinculoView + main.ts)
           │               └──► Paso 3.1 (relacionDomain + Pipeline Orden 1..8)
           │                       ├──► Paso 3.2 (relacionView + Picker + Wiring)
           │                       └──► Paso 4.1 (auditWizardDomain 3 Fases)
           │                               └──► Paso 4.2 (auditWizardModal + Persistencia)
           └──────────────────────────────────────┴──► Paso 5.1 (Polishing Codenames/Abreviaciones)
                                                          └──► Paso Final (QA + E2E + public/doc)
```

---

## 3. Matriz de Impacto Completa

| Capa / Artefacto | Archivos Impactados | Pasos |
| :--- | :--- | :---: |
| **SQL & Supabase (`public/supabase/queries/`)** | `01_creacion.sql`, `03_indices_optimizacion.sql`, `04_rls.sql`, `06_datos_prueba.sql` | 1.1, Final |
| **Dominio Puro — Identificadores & Pipeline (`src/lib/`)** | `codenameDomain.ts` *(nuevo)*, `pipelineEngine.ts`, `healthCheck.ts`, `accessControl.ts`, `breadcrumb.ts`, `resumenDomain.ts` | 1.2, 2.2, 3.1, 5.1 |
| **Dominio Puro — Vínculo, Relación & Wizard (`src/lib/`)** | `vinculoDomain.ts`, `relacionDomain.ts` *(nuevo)*, `auditWizardDomain.ts`, `auditPlanningPersistence.ts`, `designacionTipoDomain.ts`, `auditPlanningEngine.ts`, `auditExecution.ts`, `conglomeradoDomain.ts` | 1.2, 2.1, 3.1, 4.1, 5.1 |
| **Vistas UI (`src/views/`)** | `certificacionView.ts`, `vinculoView.ts`, `auditoriasView.ts`, `relacionView.ts` *(nuevo)*, `designacionTipoView.ts`, `auditWizardModal.ts`, `auditCardBreadcrumb.ts`, `auditSectionShell.ts`, `calendarioView.ts`, `conglomeradoView.ts`, `resumenView.ts`, `organizacionView.ts`, `certificadoView.ts`, vistas Bloque 1 restantes | 2.2, 3.2, 4.2, 5.1 |
| **Orquestación & Persistencia (`src/`)** | `src/main.ts` (hidratación, normalización de rutas, handlers Bloque 2 `Vínculo`, handlers Bloque 1 `Relación`, persistencia Wizard 3 fases) | 1.2, 2.2, 3.2, 4.2, 5.1 |
| **Pruebas Unitarias (`src/**/*.test.ts`)** | `codenameDomain.test.ts` *(nuevo)*, `vinculoDomain.test.ts`, `vinculoView.test.ts`, `relacionDomain.test.ts` *(nuevo)*, `relacionView.test.ts` *(nuevo)*, `auditWizardDomain.test.ts`, `auditWizardModal.test.ts`, `accessControl.test.ts`, `pipelineEngine.test.ts` | 1.2–5.1, Final |
| **Documentación (`public/doc/`)** | `project_resume.md`, `database_architecture.md`, `backend_api_security.md`, `frontend_architecture.md`, `testing_and_operations.md` | Final |

---

## 4. Reglas Transversales de Cumplimiento Obligatorio

- **TypeScript estricto:** Cero `: any` ni `as any`; `tsc --noEmit` limpio en cada paso.
- **Zero-UUID:** Prohibido exponer UUIDs en interfaz, tooltips, mensajes de error o pruebas visibles; sanitizar errores con `formatZeroUuidError`.
- **Soft-Delete estricto:** Prohibido `.delete()` en tablas con `deleted_at`; usar `archive_record` RPC y filtrar `!deleted_at`.
- **Tablas HTML:** Todas las tablas deben usar `table-fixed` + `<colgroup>` cuya suma sea exactamente `100%` y **cero `<button>` dentro de `<tbody>`**.
- **Idioma y Limpieza Visual:** 100% español en textos visibles, "Less Is More" sin subtítulos ni banners redundantes, sin `window.alert` ni `window.open`.
- **RBAC 4 Roles:** `ADMIN` y `WORKER` lectura/escritura en Bloque 1 y Bloque 2; `CLIENT` solo lectura aislada Nivel 2; `AUDITOR` bloqueado de Bloque 2 (`Vínculo`) y limitado en Bloque 1 a sus auditorías asignadas.
