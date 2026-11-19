# Step Final: Verificación Integral End-to-End, Matriz 4 Roles × Viewports y Sincronización `public/doc/`

## 1. Identificador y Dependencias
* **Step ID:** `final`
* **Objetivo:** Validar de punta a punta la base de datos (`00`–`07`), la lógica pura TypeScript (`strict: true`, `0 any`), el compilado Vite, las 11 etapas del pipeline en navegador real (`390×844` y `1440×900`) bajo los 4 roles (`ADMIN`, `WORKER`, `AUDITOR`, `CLIENT`), y sincronizar la documentación oficial en `public/doc/`.
* **Dependencias:** `step_1.1.md` → `step_11.1.md` completados.

---

## 2. Runbook de Verificación Técnica (SQL, Tipos, Tests y Build)

### 2.1 Reseteo y Verificación SQL (`00_delete_tables.sql` → `07_normas_requisitos_csv.sql`)
1. Ejecutar `POST /api/reset-db` (o la secuencia `00` → `07` en Supabase PostgreSQL).
2. Validar conteos e invariantes en PostgreSQL:
   ```sql
   -- 1. Cero organizaciones huérfanas sin conglomerado
   SELECT COUNT(*) AS orgs_sin_grupo FROM public.organizacion WHERE id_grupo_empresarial IS NULL AND deleted_at IS NULL; -- Esperado: 0

   -- 2. Integridad DCL REVOKE DELETE (43 tablas protegidas)
   SELECT table_name FROM information_schema.role_table_grants
   WHERE privilege_type = 'DELETE' AND grantee IN ('anon', 'authenticated')
     AND table_schema = 'public'
     AND table_name NOT IN ('norma_auditor', 'sector_iaf_auditor', 'subsector_iaf_auditor', 'requisitos_por_proceso', 'equipo_auditor'); -- Esperado: 0 filas

   -- 3. Cero uso legado de 'Multisitio' en tipo_vinculacion
   SELECT COUNT(*) FROM public.programa_auditoria WHERE tipo_vinculacion = 'Multisitio'; -- Esperado: 0
   SELECT COUNT(*) FROM public.vinculo WHERE tipo_vinculacion = 'Multisitio'; -- Esperado: 0

   -- 4. Verificación de fechas separadas en auditoria_fecha
   SELECT tipo_fecha, COUNT(*) FROM public.auditoria_fecha WHERE deleted_at IS NULL GROUP BY tipo_fecha;
   ```

### 2.2 Verificación Estática, Pruebas Unitarias y Compilación
```bash
# 1. Verificación estricta TypeScript (strict: true, 0 any / as any)
npm run lint

# 2. Ejecutar toda la suite node:test (47+ archivos existentes + 9 nuevos suites de pasos 1..11)
npm test

# 3. Compilación de producción Vite
npm run build
```
* **Gate obligatorio:** `0` errores en `npm run lint`, `100%` tests aprobados en `npm test`, `0` errores de empaquetado en `npm run build` y **cero ocurrencias** de `: any` / `as any` en `src/`.

---

## 3. Guion Walkthrough End-to-End (11 Pasos Multi-Empresa)

Ejecutar autenticado como **`WORKER`** (`worker@programa-aud.local`) y luego validar visibilidad con **`ADMIN`**, **`AUDITOR`** y **`CLIENT`** en Chromium (`http://localhost:3000`):

1. **Paso 1 — `Conglomerado` (`#/certificacion/conglomerados`):**
   * Crear Empresa A y Empresa B independientes → verificar que cada una auto-crea su `Conglomerado` 1:1.
   * Aplicar filtro `"Organizaciones solas / sin agrupar"`.
   * Re-agrupar Empresa B hacia el `Conglomerado` de Empresa A (`Conglomerado Mixto E2E`) → confirmar que el antiguo conglomerado individual de Empresa B desaparece automáticamente (archivado lógico).
   * Confirmar 1 certificado ISO 9001 en Empresa A y 1 certificado ISO 14001 en Empresa B.
2. **Paso 2 — `Vínculo` (`#/auditorias/vinculo`):**
   * Abrir filtro **`Certificados Libres`** → confirmar que ambos certificados aparecen como `Libre` y **no aparecen** disponibles para crear auditorías en Paso 3.
   * Seleccionar ambos certificados del mismo conglomerado, elegir Nivel `NIVEL_2_INTER_ORG`, Tipo `Mixta`, Etiqueta `"Vínculo E2E ISO 9001+14001"`, y activar **`tiene_sitio_temporal = TRUE`**.
   * Confirmar que ambos pasan a estado `Vinculado`.
3. **Paso 3 — `Designación → Tipo` (`#/auditorias/designacion/tipo`):**
   * Crear Campaña 1 en ventana próxima (`PROGRAMADA_EXACTA`: dentro de 10 días) asignando `Seguimiento 1` a ISO 9001 y `Seguimiento 2` a ISO 14001.
   * Crear Campaña 2 para **`Año +2`** (`PREPROGRAMADA_MES`).
   * Verificar que la vista por defecto **`Próximas a ejecutar`** muestra Campaña 1 arriba y mantiene Campaña 2 aislada bajo **`Futuro +1/+3 años`**.
   * Ejecutar **Reprogramación #1** en Campaña 1 y verificar preservación de `seq 1` (`Programación`) + `seq 2` (`Reprogramación`).
4. **Paso 4 — `Designación → Sitio` (`#/auditorias/designacion/sitio`):**
   * Abrir Campaña 1 → verificar `Sitio 0 (HQ)` pre-seleccionado por defecto, junto con la **Tira de Ciclo Multi-Anual** (`◀` / `▶`) mostrando historial sin `<select>`.
   * Marcar adicionalmente `Sitio #1` en Empresa A y verificar que el switch `tiene_sitio_temporal` aparece activo (heredado de Paso 2) y puede alternarse sin error.
5. **Paso 5 — `Designación → Temporal` (`#/auditorias/designacion/temporal`):**
   * Crear `"Sitio Temporal — Proyecto Nave Norte"`, comentario descriptivo, tiempo **`1.00 día`** (`0.25d` steppers) y asociarlo a ambos certificados del vínculo (`auditoria_sitio_temporal_certificado`).
   * Verificar filtro `"Sin auditores asignados"` detectando el temporal recién creado.
6. **Paso 6 — `Tiempo` (`#/auditorias/tiempo`):**
   * Usar filtro `Incompletos` → localizar Campaña 1.
   * Asignar con steppers `0.25d`: `Sitio 0 HQ (Emp A) = 2.00d`, `Sitio #1 (Emp A) = 1.00d`, `Sitio 0 HQ (Emp B) = 1.00d`.
   * Verificar resumen combinado (`Sitios Regulares: 4.00d + Sitio Temporal: 1.00d = 5.00 días-auditor`) y transición al filtro `Completos`.
7. **Paso 7 — `Asignación` (`#/auditorias/asignacion`):**
   * En `Sitio 0 HQ (Emp A)` (`2.00d`): asignar `Auditor Líder = 1.25d` + `Auditor Equipo = 0.75d` → barra `2.00d / 2.00d (100% Completo)`.
   * En `Sitio #1` (`1.00d`): asignar `Auditor Equipo = 1.00d`.
   * En `Sitio 0 HQ (Emp B)` (`1.00d`): asignar `Auditor Líder = 1.00d`.
   * En `Sitio Temporal` (`1.00d`): asignar `Auditor Líder = 1.00d`.
   * Confirmar badge `Completo ✓` y alertas de competencia/rotación visibles.
8. **Paso 8 — `Programa` (`#/auditorias/programa`):**
   * Ir desde el enlace individual de certificado (`Emp A · ISO 9001`):
     * **Mini-Paso 8A (`Procesos`):** Verificar tarjetas restringidas a `procesos_por_sitio`, alerta `⚠️ Nunca auditado`, probar drawer `"📂 Ver Programa Anterior / Futuro"` y acción rápida `"Seleccionar todos los Medulares"`.
     * **Mini-Paso 8B (`Turnos`):** Seleccionar `2 turnos` para el proceso principal.
   * Repetir para `Emp B · ISO 14001` y confirmar filtro `Completos`.
9. **Paso 9 — `Calendario` (`#/auditorias/calendar`):**
   * Alternar entre **`Año`**, **`Trimestre (Q1–Q4)`**, **`Mes`** y **`Timeline`** verificando los conteos exactos por periodo.
   * Clicar el badge de etapa de 1 palabra (`Resultado` / `Asignación` / `Programa`) sobre la tarjeta del evento y confirmar salto directo al paso exacto.
10. **Paso 10 — `Resultado` (`#/auditorias/resultado`):**
    * Registrar fechas **`REAL`** (`3 días calendario`) para la auditoría donde 2 auditores cubren `3.00d` y `2.00d` → confirmar **`✓ Capacidad concurrente válida (sin falso error)`**.
    * Registrar 1 **`NC_MENOR`** vinculada a cláusula `8.5.1` y proceso auditado → confirmar cálculo automático de **`fecha_limite_plan (+15d)`** y **`fecha_limite_cierre (+60d)`**.
    * Verificar que `fecha_cierre_auditoria` se pre-rellena con `fecha_limite_cierre`, editarla +1 día para comprobar editabilidad, y pulsar **`"Marcar Auditoría como Cerrada"`**.
11. **Paso 11 — `Revisión` (`#/auditorias/revision`):**
    * Abrir `Revisión` → confirmar que la auditoría recién cerrada aparece en **`Pendientes de Revisión`**.
    * Marcar `documentacion_completa = true`, ingresar `fecha_revision` y `resumen_revision`, y aprobar revisión → verificar transición a **`Revisadas`**.

---

## 4. Matriz de Verificación 4 Roles × 2 Viewports (`390×844` y `1440×900`)

| Rol de Prueba | Cuenta Seed (`05_usuarios.sql`) | Desktop (`1440×900`) y Móvil (`390×844`) — Checks Obligatorios |
| :--- | :--- | :--- |
| **`ADMIN`** | `admin@programa-aud.local` | Acceso total Bloque 1 + Bloque 2 (`Conglomerado` #1); toggle `Mostrar Archivados` + `Restaurar`; cero `scrollWidth > clientWidth`; 0 botones en `<tbody>`; 0 UUIDs visibles. |
| **`WORKER`** | `worker@programa-aud.local` | Flujo completo 11 pasos editable; botón `Archivar` disponible; `Restaurar` y `Mostrar Archivados` ocultos; sin desbordamiento en `Sitio` ni `Programa` a `390px`. |
| **`AUDITOR`** | `auditor@programa-aud.local` | **Bloque 2 (`Certificación` / `Conglomerado`) completamente oculto/bloqueado**; Bloque 1 en solo lectura salvo registro de `hallazgo` en sus auditorías asignadas. |
| **`CLIENT`** | `client@programa-aud.local` | En `Conglomerado`, `Vínculo` (Nivel 2) y `Auditoría`, **solo ve su empresa autorizada**; cero fuga de nombres/conteos de la segunda empresa del conglomerado; cero botones de edición. |

---

## 5. Checklist de Sincronización de Documentación (`public/doc/`)

Una vez completados los pasos `1.1` → `11.1` y verificadas todas las pruebas:

- [ ] **`public/doc/project_resume.md`:** Actualizar conteo de tablas (`44 → 50`), tablas soft-delete (`37 → 43`), secciones del menú (`Certificación`: 4 ítems con `Conglomerado` #1; `Auditoría`: pipeline 1-palabra con `Designación = { Tipo, Sitio, Temporal }`) y métricas de módulos/tests.
- [ ] **`public/doc/architecture/database_architecture.md`:** Documentar `grupo_empresarial`, `vinculo`, `vinculo_certificado`, `auditoria_sitio_temporal`, `auditoria_sitio_temporal_certificado`, `equipo_auditor_sitio_temporal`, columnas nuevas en `organizacion`, `programa_auditoria`, `auditoria`, `auditoria_fecha` (`PROGRAMADA_EXACTA`), `hallazgo`, `configuracion_alerta_auditoria` y nuevos triggers/índices.
- [ ] **`public/doc/architecture/backend_api_security.md`:** Actualizar totales de `REVOKE DELETE` (`39 → 43` tablas), `archive_record()` (`37 → 41` tablas), `audit_log` (`38 → 42` triggers) y políticas RLS Nivel 2 de `grupo_empresarial`, `vinculo` y tablas temporales.
- [ ] **`public/doc/architecture/frontend_architecture.md`:** Documentar menú anidado de 3er nivel (`Designación`), barra Pipeline Stepper, selector Matriz de Ciclos (`Sitio`), tarjetas históricas con drawer colapsable (`Programa 8A/8B`), nuevos módulos `src/lib/*` y vistas `src/views/*`.
- [ ] **`public/doc/architecture/testing_and_operations.md`:** Actualizar tabla maestra de suites `node:test`, conteo total de archivos/pruebas y pasos del walkthrough E2E.
